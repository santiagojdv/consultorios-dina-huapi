-- Consultorios Dina Huapi · Pacientes, servicios, obras sociales, precios e IPC
-- Se ejecuta en el SQL Editor DESPUÉS de schema.sql (una sola vez).
--
-- Modelo:
--   pacientes             → ficha por DNI. Se completa al reservar online o la carga el profesional.
--   servicios             → lo que el paciente elige al pedir turno (consulta, limpieza, arreglo…).
--                           La duración es interna: define cuánto ocupa en la agenda y el paciente no la ve.
--   profesional_servicios → qué servicios ofrece cada profesional y, si quiere, con otra duración.
--   obras_sociales        → listado que ve el paciente al reservar.
--   aranceles             → precio particular y, por obra social, qué paga el paciente
--                           (cubierto, copago/adicional o no cubre). Montos en pesos de un mes base.
--   ipc                   → variación mensual del IPC (INDEC). Los montos se ajustan solos con cada mes cargado.
--   ajustes               → parámetros (redondeo de precios, serie de IPC).
--
-- Cómo se calcula un precio vigente:
--   monto × Π(1 + variación de cada mes desde el mes base, inclusive) → redondeado.
--   Ej.: monto $30.000 cargado con base octubre 2026. Cuando INDEC publica el IPC de octubre (2,1 %),
--   pasa a $30.630 → redondeado a $30.700 (redondeo 100). Con noviembre se vuelve a ajustar, y así.
--   Se usa la variación (no el nivel del índice) para que un cambio de base de INDEC no rompa la serie.
--   Los aranceles con ajusta_ipc = false (ej. lo que fija una obra social por convenio) no se tocan.

-- ───────────────────────────── Tablas ─────────────────────────────

create table public.ajustes (
  clave text primary key,
  valor text not null
);
insert into public.ajustes (clave, valor) values
  ('redondeo', '100'),                              -- los precios se redondean a múltiplos de $100
  ('ipc_serie', '148.3_INIVELNAL_DICI_M_26');       -- IPC nivel general nacional en datos.gob.ar

create table public.obras_sociales (
  id      smallint generated always as identity primary key,
  nombre  text not null unique check (length(trim(nombre)) between 2 and 80),
  activo  boolean not null default true,
  nota    text not null default ''  -- interna: cómo se factura, autorizaciones, topes
);

create table public.servicios (
  id                smallint generated always as identity primary key,
  nombre            text not null unique check (length(trim(nombre)) between 2 and 80),
  categoria         text not null default 'Consultas' check (length(trim(categoria)) between 2 and 40),
  descripcion       text not null default '' check (length(descripcion) <= 200), -- la ve el paciente
  duracion_min      smallint not null default 30 check (duracion_min between 10 and 240), -- interna
  reservable_online boolean not null default true, -- si es false, solo lo agenda el profesional
  activo            boolean not null default true,
  orden             smallint not null default 100
);

create table public.profesional_servicios (
  profesional_id uuid     not null default auth.uid() references public.profesionales (id) on delete cascade,
  servicio_id    smallint not null references public.servicios (id) on delete cascade,
  duracion_min   smallint check (duracion_min between 10 and 240), -- vacío = la del servicio
  primary key (profesional_id, servicio_id)
);

create table public.ipc (
  periodo   date primary key check (extract(day from periodo) = 1), -- mes del índice (día 1)
  variacion numeric(6,3) not null check (variacion between -50 and 100), -- % mensual, ej. 2.1
  fuente    text not null default 'manual',
  cargado   timestamptz not null default now()
);

create table public.aranceles (
  id             bigint generated always as identity primary key,
  servicio_id    smallint not null references public.servicios (id) on delete cascade,
  obra_social_id smallint references public.obras_sociales (id) on delete cascade, -- vacío = particular
  modalidad      text not null check (modalidad in ('particular', 'cubierto', 'copago', 'no_cubre')),
  monto          numeric(12,2) not null default 0 check (monto >= 0), -- lo que paga el paciente
  valor_os       numeric(12,2) check (valor_os >= 0), -- lo que paga la obra social (interno, para liquidar)
  periodo_base   date not null default date_trunc('month', current_date)::date check (extract(day from periodo_base) = 1),
  ajusta_ipc     boolean not null default true,
  actualizado    timestamptz not null default now(),
  check ((obra_social_id is null) = (modalidad = 'particular')),
  check (modalidad in ('particular', 'copago') or monto = 0),
  unique nulls not distinct (servicio_id, obra_social_id)
);

create table public.pacientes (
  id               bigint generated always as identity primary key,
  dni              text not null unique check (dni ~ '^\d{7,9}$'),
  nombre           text not null check (length(trim(nombre)) between 1 and 60),
  apellido         text not null check (length(trim(apellido)) between 1 and 60),
  fecha_nacimiento date check (fecha_nacimiento between '1900-01-01' and current_date),
  telefono         text not null check (length(regexp_replace(telefono, '\D', '', 'g')) between 6 and 15),
  email            text not null default '' check (email = '' or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  obra_social_id   smallint references public.obras_sociales (id),
  nro_afiliado     text not null default '' check (length(nro_afiliado) <= 40),
  consentimiento   timestamptz, -- cuándo aceptó el uso de sus datos
  creado           timestamptz not null default now(),
  actualizado      timestamptz not null default now()
);

alter table public.turnos
  add column paciente_id     bigint   references public.pacientes (id),
  add column servicio_id     smallint references public.servicios (id),
  add column detalle         text not null default '' check (length(detalle) <= 500), -- lo que escribe el paciente
  add column obra_social_id  smallint references public.obras_sociales (id),
  add column modalidad       text check (modalidad in ('particular', 'cubierto', 'copago', 'no_cubre')),
  add column monto_estimado  numeric(12,2), -- lo que se le informó al reservar (foto del momento)
  add column datos_distintos boolean not null default false; -- el teléfono no coincidía con la ficha del DNI
create index on public.turnos (paciente_id);

-- ───────────────────────────── Precios ─────────────────────────────

-- Factor acumulado de IPC desde un mes (inclusive) hasta el último mes cargado.
create or replace function public.factor_ipc(p_desde date) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(exp(sum(ln(1 + variacion / 100))), 1)
  from ipc where periodo >= date_trunc('month', p_desde)::date
$$;

create or replace function public.monto_vigente(p_monto numeric, p_base date, p_ajusta boolean) returns numeric
language sql stable security definer set search_path = public as $$
  select case when p_monto = 0 or not p_ajusta then p_monto
         else round(p_monto * factor_ipc(p_base) / r) * r end
  from (select greatest(coalesce((select valor::numeric from ajustes where clave = 'redondeo'), 1), 1) as r) x
$$;

-- Lo que paga el paciente por un servicio con (o sin) obra social, a precios de hoy.
-- Sin arancel para su obra social, o si no lo cubre, se informa el precio particular.
create or replace function public.cotizar(p_servicio smallint, p_obra_social smallint default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  part aranceles;
  os   aranceles;
begin
  select * into part from aranceles where servicio_id = p_servicio and obra_social_id is null;
  if p_obra_social is not null then
    select * into os from aranceles where servicio_id = p_servicio and obra_social_id = p_obra_social;
  end if;
  if os.id is not null and os.modalidad in ('cubierto', 'copago') then
    return json_build_object('modalidad', os.modalidad,
      'monto', monto_vigente(os.monto, os.periodo_base, os.ajusta_ipc));
  end if;
  return json_build_object(
    'modalidad', case when p_obra_social is null then 'particular' else 'no_cubre' end,
    'monto', case when part.id is null then null else monto_vigente(part.monto, part.periodo_base, part.ajusta_ipc) end);
end $$;

-- Tabla completa de precios vigentes, para el panel de administración.
create or replace view public.aranceles_vigentes with (security_invoker = true) as
select a.*, s.nombre as servicio, s.categoria, coalesce(o.nombre, 'Particular') as obra_social,
       monto_vigente(a.monto, a.periodo_base, a.ajusta_ipc) as monto_hoy,
       case when a.valor_os is null then null else monto_vigente(a.valor_os, a.periodo_base, a.ajusta_ipc) end as valor_os_hoy
from aranceles a
join servicios s on s.id = a.servicio_id
left join obras_sociales o on o.id = a.obra_social_id;

-- ───────────────────────────── Seguridad (RLS) ─────────────────────────────

alter table public.ajustes               enable row level security;
alter table public.obras_sociales        enable row level security;
alter table public.servicios             enable row level security;
alter table public.profesional_servicios enable row level security;
alter table public.ipc                   enable row level security;
alter table public.aranceles             enable row level security;
alter table public.pacientes             enable row level security;

-- Catálogo, precios e IPC: los ven los profesionales activos; los edita el admin.
create policy ajustes_leer   on public.ajustes        for select to authenticated using (soy_activo());
create policy ajustes_admin  on public.ajustes        for all    to authenticated using (soy_admin()) with check (soy_admin());
create policy os_leer        on public.obras_sociales for select to authenticated using (soy_activo());
create policy os_admin       on public.obras_sociales for all    to authenticated using (soy_admin()) with check (soy_admin());
create policy serv_leer      on public.servicios      for select to authenticated using (soy_activo());
create policy serv_admin     on public.servicios      for all    to authenticated using (soy_admin()) with check (soy_admin());
create policy ipc_leer       on public.ipc            for select to authenticated using (soy_activo());
create policy ipc_admin      on public.ipc            for all    to authenticated using (soy_admin()) with check (soy_admin());
create policy aran_leer      on public.aranceles      for select to authenticated using (soy_activo());
create policy aran_admin     on public.aranceles      for all    to authenticated using (soy_admin()) with check (soy_admin());

-- Cada profesional arma su lista de servicios; el admin puede ver y editar todas.
create policy ps_leer   on public.profesional_servicios for select to authenticated using (soy_activo());
create policy ps_editar on public.profesional_servicios for all to authenticated
  using ((soy_activo() and profesional_id = auth.uid()) or soy_admin())
  with check ((soy_activo() and profesional_id = auth.uid()) or soy_admin());

-- Pacientes: cada profesional ve y edita solo a quienes tienen o tuvieron turno con él.
-- El admin no tiene acceso especial (datos de salud, Ley 25.326).
create policy pacientes_leer on public.pacientes for select to authenticated
  using (soy_activo() and exists (select 1 from turnos t where t.paciente_id = pacientes.id and t.profesional_id = auth.uid()));
create policy pacientes_editar on public.pacientes for update to authenticated
  using (soy_activo() and exists (select 1 from turnos t where t.paciente_id = pacientes.id and t.profesional_id = auth.uid()))
  with check (soy_activo());
create policy pacientes_crear on public.pacientes for insert to authenticated with check (soy_activo());

revoke all on public.ajustes, public.obras_sociales, public.servicios, public.profesional_servicios,
  public.ipc, public.aranceles, public.pacientes, public.aranceles_vigentes from anon;
revoke delete on public.pacientes from authenticated;

-- ───────────────────────────── Funciones para pacientes ─────────────────────────────

-- Lo que ve el paciente al pedir turno: servicios del profesional (sin duración) y obras sociales.
create or replace function public.catalogo_publico(p_profesional uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'servicios', coalesce((
      select json_agg(json_build_object('id', s.id, 'nombre', s.nombre, 'categoria', s.categoria, 'descripcion', s.descripcion)
                      order by s.orden, s.categoria, s.nombre)
      from servicios s
      join profesional_servicios ps on ps.servicio_id = s.id and ps.profesional_id = p_profesional
      where s.activo and s.reservable_online), '[]'::json),
    'obras_sociales', coalesce((
      select json_agg(json_build_object('id', o.id, 'nombre', o.nombre) order by o.nombre)
      from obras_sociales o where o.activo), '[]'::json))
$$;

-- Duración que ocupa un servicio en la agenda de un profesional.
create or replace function public.duracion_de(p_profesional uuid, p_servicio smallint) returns smallint
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select coalesce(ps.duracion_min, s.duracion_min)
     from servicios s join profesional_servicios ps on ps.servicio_id = s.id and ps.profesional_id = p_profesional
     where s.id = p_servicio and s.activo),
    (select duracion_turno from profesionales where id = p_profesional))
$$;

-- Reemplaza la versión de schema.sql: ahora el largo del turno depende del servicio.
-- Los horarios se ofrecen cada "duracion_turno" del profesional (su grilla), y solo aparecen los
-- que tienen lugar para todo el servicio. Al paciente no se le devuelve la hora de fin.
drop function if exists public.turnos_disponibles(uuid, date, date);
create or replace function public.turnos_disponibles(p_profesional uuid, p_desde date, p_hasta date, p_servicio smallint default null)
returns table (inicio timestamptz, fin timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  p          profesionales;
  propio     boolean := auth.uid() is not null and auth.uid() = p_profesional;
  hoy        date := (now() at time zone tz())::date;
  paso       interval;
  dur        interval;
  desde_ok   timestamptz;
  hasta_dia  date;
begin
  select * into p from profesionales where id = p_profesional and activo;
  if p.id is null or not (p.publico or propio) then
    return;
  end if;
  if p_hasta < p_desde or p_hasta - p_desde > 31 then
    raise exception 'Rango de fechas inválido (máximo 31 días)';
  end if;

  paso      := make_interval(mins => p.duracion_turno);
  dur       := make_interval(mins => duracion_de(p.id, p_servicio));
  desde_ok  := case when propio then now() else now() + make_interval(hours => p.anticipacion_horas) end;
  hasta_dia := case when propio then p_hasta else least(p_hasta, hoy + p.ventana_dias) end;

  return query
  with dias as (
    select d::date as dia
    from generate_series(greatest(p_desde, hoy), hasta_dia, interval '1 day') d
  ),
  bloques as (
    select dias.dia, a.hora_inicio, a.hora_fin
    from dias
    join alquileres a
      on a.profesional_id = p.id
     and a.dia_semana = extract(isodow from dias.dia)
     and dias.dia between a.vigente_desde and a.vigente_hasta
    where a.hora_fin - a.hora_inicio >= dur
  ),
  slots as (
    select ((b.dia + b.hora_inicio) + n * paso) at time zone tz() as ini
    from bloques b,
         generate_series(0, floor(extract(epoch from (b.hora_fin - b.hora_inicio - dur)) / extract(epoch from paso))::int) n
  )
  select s.ini, case when propio then s.ini + dur end
  from slots s
  where s.ini >= desde_ok
    and not exists (
      select 1 from turnos t
      where t.profesional_id = p.id and t.estado = 'confirmado'
        and tstzrange(t.inicio, t.fin) && tstzrange(s.ini, s.ini + dur))
    and not exists (
      select 1 from ausencias x
      where x.profesional_id = p.id
        and tstzrange(x.desde, x.hasta) && tstzrange(s.ini, s.ini + dur))
  order by s.ini;
end $$;

-- Reemplaza la versión de schema.sql: guarda la ficha del paciente, el servicio y el precio informado.
-- p_paciente: {"dni","nombre","apellido","fecha_nacimiento","telefono","email","nro_afiliado"}
-- Si el DNI ya existe y el teléfono coincide, se actualizan los datos de contacto. Si no coincide,
-- no se pisa ni se vincula la ficha (alguien podría estar usando un DNI ajeno): el turno queda marcado para revisar.
drop function if exists public.reservar_turno(uuid, timestamptz, text, text, text);
create or replace function public.reservar_turno(
  p_profesional uuid, p_inicio timestamptz, p_paciente json,
  p_servicio smallint default null, p_obra_social smallint default null, p_detalle text default ''
) returns json
language plpgsql volatile security definer set search_path = public as $$
declare
  p        profesionales;
  dia      date := (p_inicio at time zone tz())::date;
  v_dni    text := regexp_replace(coalesce(p_paciente->>'dni', ''), '\D', '', 'g');
  nom      text := trim(coalesce(p_paciente->>'nombre', ''));
  ape      text := trim(coalesce(p_paciente->>'apellido', ''));
  tel      text := trim(coalesce(p_paciente->>'telefono', ''));
  mail     text := lower(trim(coalesce(p_paciente->>'email', '')));
  afil     text := trim(coalesce(p_paciente->>'nro_afiliado', ''));
  nac      date := nullif(p_paciente->>'fecha_nacimiento', '')::date;
  pac      pacientes;
  distinto boolean := false;
  cot      json;
  t        turnos;
begin
  select * into p from profesionales where id = p_profesional and activo and publico;
  if p.id is null then
    raise exception 'Profesional no disponible';
  end if;
  if p_servicio is not null and not exists (
    select 1 from profesional_servicios ps join servicios s on s.id = ps.servicio_id
    where ps.profesional_id = p.id and ps.servicio_id = p_servicio and s.activo and s.reservable_online) then
    raise exception 'Ese servicio no se reserva online con este profesional';
  end if;
  if p_servicio is null and length(trim(coalesce(p_detalle, ''))) < 3 then
    raise exception 'Contanos brevemente el motivo de la consulta';
  end if;
  if p_obra_social is not null and not exists (select 1 from obras_sociales where id = p_obra_social and activo) then
    raise exception 'Obra social no válida';
  end if;

  if v_dni !~ '^\d{7,9}$' then
    raise exception 'Revisá el DNI';
  end if;
  if nom = '' or ape = '' or length(regexp_replace(tel, '\D', '', 'g')) < 6 then
    raise exception 'Completá nombre, apellido y teléfono';
  end if;

  if not exists (
    select 1 from turnos_disponibles(p.id, dia, dia, p_servicio) d where d.inicio = p_inicio
  ) then
    raise exception 'Ese horario ya no está disponible' using hint = 'ocupado';
  end if;

  -- Freno básico contra reservas en masa: pocos turnos futuros por teléfono.
  if (select count(*) from turnos
      where estado = 'confirmado' and inicio > now()
        and tel_norm(paciente_telefono) = tel_norm(tel)
        and profesional_id = p.id) >= 2
  or (select count(*) from turnos
      where estado = 'confirmado' and inicio > now()
        and tel_norm(paciente_telefono) = tel_norm(tel)) >= 4 then
    raise exception 'Ya tenés varios turnos reservados con ese teléfono. Para más, comunicate con el profesional.'
      using hint = 'limite';
  end if;

  -- Ficha del paciente
  select * into pac from pacientes where pacientes.dni = v_dni;
  if pac.id is null then
    insert into pacientes (dni, nombre, apellido, fecha_nacimiento, telefono, email, obra_social_id, nro_afiliado, consentimiento)
    values (v_dni, nom, ape, nac, tel, mail, p_obra_social, afil, now())
    returning * into pac;
  elsif tel_norm(pac.telefono) = tel_norm(tel) then
    update pacientes set
      email = coalesce(nullif(mail, ''), email),
      obra_social_id = p_obra_social,
      nro_afiliado = coalesce(nullif(afil, ''), nro_afiliado),
      fecha_nacimiento = coalesce(fecha_nacimiento, nac),
      consentimiento = now(), actualizado = now()
    where id = pac.id;
  else
    -- No se vincula a la ficha: si no, cualquiera que sepa un DNI le daría acceso a otro profesional.
    distinto := true;
    pac := null;
  end if;

  cot := case when p_servicio is null then null else cotizar(p_servicio, p_obra_social) end;

  begin
    insert into turnos (profesional_id, inicio, fin, paciente_nombre, paciente_telefono, paciente_email, origen,
                        paciente_id, servicio_id, detalle, obra_social_id, modalidad, monto_estimado, datos_distintos)
    values (p.id, p_inicio, p_inicio + make_interval(mins => duracion_de(p.id, p_servicio)),
            nom || ' ' || ape, tel, mail, 'online',
            pac.id, p_servicio, left(trim(coalesce(p_detalle, '')), 500), p_obra_social,
            cot->>'modalidad', (cot->>'monto')::numeric, distinto)
    returning * into t;
  exception when exclusion_violation then
    raise exception 'Ese horario se acaba de ocupar' using hint = 'ocupado';
  end;

  return json_build_object(
    'token', t.token, 'inicio', t.inicio,
    'profesional', p.nombre, 'especialidad', p.especialidad,
    'consultorio', (select nombre from consultorios where id = t.consultorio_id),
    'servicio', (select nombre from servicios where id = t.servicio_id),
    'modalidad', t.modalidad, 'monto', t.monto_estimado);
end $$;

-- Lo que ve el paciente desde su link de turno: sin hora de fin.
create or replace function public.turno_por_token(p_token uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'inicio', t.inicio, 'estado', t.estado,
    'paciente', t.paciente_nombre,
    'profesional', p.nombre, 'especialidad', p.especialidad, 'telefono_profesional', p.telefono,
    'consultorio', c.nombre,
    'servicio', s.nombre, 'modalidad', t.modalidad, 'monto', t.monto_estimado,
    'cancelable', t.estado = 'confirmado'
                  and t.inicio > now() + make_interval(hours => p.aviso_cancelacion_horas),
    'aviso_cancelacion_horas', p.aviso_cancelacion_horas)
  from turnos t
  join profesionales p on p.id = t.profesional_id
  left join consultorios c on c.id = t.consultorio_id
  left join servicios s on s.id = t.servicio_id
  where t.token = p_token
$$;

-- ───────────────────────────── Administración de precios ─────────────────────────────

-- Carga o corrige la variación de un mes. La usa el panel (admin) y la función automática "ipc".
create or replace function public.cargar_ipc(p_periodo date, p_variacion numeric, p_fuente text default 'manual')
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' and not soy_admin() then
    raise exception 'Solo para administradores';
  end if;
  insert into ipc (periodo, variacion, fuente) values (date_trunc('month', p_periodo)::date, p_variacion, p_fuente)
  on conflict (periodo) do update set variacion = excluded.variacion, fuente = excluded.fuente, cargado = now();
end $$;

-- Importa la planilla de precios (una fila por servicio y obra social). Crea lo que no existe.
-- Cada fila: {"servicio","categoria","descripcion","duracion_min","reservable_online",
--             "obra_social" (vacío = particular),"modalidad","monto","valor_os","periodo_base","ajusta_ipc"}
create or replace function public.importar_aranceles(p_filas json) returns json
language plpgsql volatile security definer set search_path = public as $$
declare
  f    json;
  sid  smallint;
  oid_ smallint;
  n    int := 0;
begin
  if not soy_admin() then
    raise exception 'Solo para administradores';
  end if;
  for f in select * from json_array_elements(p_filas) loop
    insert into servicios (nombre, categoria, descripcion, duracion_min, reservable_online)
    values (trim(f->>'servicio'), coalesce(nullif(trim(f->>'categoria'), ''), 'Consultas'),
            coalesce(f->>'descripcion', ''), coalesce(nullif(f->>'duracion_min', '')::smallint, 30),
            coalesce(nullif(f->>'reservable_online', '')::boolean, true))
    on conflict (nombre) do update set
      categoria = case when nullif(trim(f->>'categoria'), '') is null then servicios.categoria else excluded.categoria end,
      descripcion = case when f->>'descripcion' is null then servicios.descripcion else excluded.descripcion end,
      duracion_min = case when nullif(f->>'duracion_min', '') is null then servicios.duracion_min else excluded.duracion_min end,
      reservable_online = case when nullif(f->>'reservable_online', '') is null then servicios.reservable_online else excluded.reservable_online end
    returning id into sid;

    oid_ := null;
    if nullif(trim(f->>'obra_social'), '') is not null and lower(trim(f->>'obra_social')) <> 'particular' then
      insert into obras_sociales (nombre) values (trim(f->>'obra_social'))
      on conflict (nombre) do update set nombre = excluded.nombre
      returning id into oid_;
    end if;

    if nullif(f->>'modalidad', '') is not null then
      insert into aranceles (servicio_id, obra_social_id, modalidad, monto, valor_os, periodo_base, ajusta_ipc)
      values (sid, oid_, f->>'modalidad',
              case when f->>'modalidad' in ('particular', 'copago') then coalesce(nullif(f->>'monto', '')::numeric, 0) else 0 end,
              nullif(f->>'valor_os', '')::numeric,
              coalesce(date_trunc('month', nullif(f->>'periodo_base', '')::date)::date, date_trunc('month', current_date)::date),
              coalesce(nullif(f->>'ajusta_ipc', '')::boolean, true))
      on conflict (servicio_id, obra_social_id) do update set
        modalidad = excluded.modalidad, monto = excluded.monto, valor_os = excluded.valor_os,
        periodo_base = excluded.periodo_base, ajusta_ipc = excluded.ajusta_ipc, actualizado = now();
    end if;
    n := n + 1;
  end loop;
  return json_build_object('filas', n);
end $$;

-- Toma los precios de hoy como nueva base (ej. cuando Nati revisa la lista). Desde ahí ajusta el IPC nuevo.
create or replace function public.rebasar_aranceles() returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  n    int;
  base date := (select coalesce(max(periodo), date_trunc('month', current_date)::date) from ipc) + interval '1 month';
begin
  if not soy_admin() then
    raise exception 'Solo para administradores';
  end if;
  update aranceles set
    monto = monto_vigente(monto, periodo_base, ajusta_ipc),
    valor_os = case when valor_os is null then null else monto_vigente(valor_os, periodo_base, ajusta_ipc) end,
    periodo_base = base, actualizado = now()
  where ajusta_ipc and periodo_base < base;
  get diagnostics n = row_count;
  return n;
end $$;

-- ───────────────────────────── Permisos de ejecución ─────────────────────────────

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.profesionales_publicos(),
  public.catalogo_publico(uuid),
  public.cotizar(smallint, smallint),
  public.turnos_disponibles(uuid, date, date, smallint),
  public.reservar_turno(uuid, timestamptz, json, smallint, smallint, text),
  public.turno_por_token(uuid),
  public.cancelar_turno(uuid),
  public.calendario_ics(uuid),
  public.tz()
to anon, authenticated;
grant execute on function public.soy_activo(), public.soy_admin(), public.turnos_en_alquiler(bigint, date),
  public.ocupacion(date, date), public.factor_ipc(date), public.monto_vigente(numeric, date, boolean),
  public.duracion_de(uuid, smallint), public.cargar_ipc(date, numeric, text),
  public.importar_aranceles(json), public.rebasar_aranceles() to authenticated;
grant execute on function public.cargar_ipc(date, numeric, text) to service_role;

-- ───────────────────────────── IPC automático (opcional) ─────────────────────────────
-- Después de publicar la función "ipc" (supabase/functions/ipc), esto la llama todos los días
-- a las 10 h del 10 al 20 de cada mes: INDEC publica el IPC a mediados de mes y la función
-- solo agrega los meses que falten. Reemplazá <PROYECTO> y <CLAVE_SECRETA> (la misma que
-- cargues como secreto IPC_CLAVE en Edge Functions → Secrets). Requiere pg_cron y pg_net
-- (Database → Extensions).
--
-- select cron.schedule('ipc-mensual', '0 13 10-20 * *', $$
--   select net.http_post(
--     url := 'https://<PROYECTO>.supabase.co/functions/v1/ipc',
--     headers := '{"Content-Type": "application/json", "x-ipc-clave": "<CLAVE_SECRETA>"}'::jsonb,
--     body := '{}'::jsonb)
-- $$);
