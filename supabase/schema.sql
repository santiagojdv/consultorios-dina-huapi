-- Consultorios Dina Huapi · Sistema de turnos
-- Esquema para Supabase (Postgres). Se pega entero en SQL Editor y se ejecuta una vez.
--
-- Modelo:
--   consultorios  → los boxes que se alquilan.
--   profesionales → una fila por usuario de Supabase Auth (se crea sola al invitarlo).
--   alquileres    → franjas semanales fijas (ej. martes 14 a 18 en el box 1) con vigencia
--                   desde/hasta. Es el alquiler mensual: renovar = extender "vigente_hasta".
--   ausencias     → vacaciones o días sin atención de un profesional.
--   turnos        → turnos de pacientes, siempre dentro de un alquiler vigente del profesional.
--
-- Reglas que garantiza la base (no dependen de la página):
--   · Dos alquileres no se superponen en el mismo consultorio, ni un profesional en dos boxes a la vez.
--   · Dos turnos confirmados no se superponen para el mismo profesional ni en el mismo consultorio.
--   · Un turno solo existe dentro de una franja alquilada por ese profesional.
--   · Los pacientes no leen ninguna tabla: solo usan las funciones públicas de abajo.
--   · Cada profesional ve únicamente sus propios pacientes. El admin tampoco ve pacientes ajenos.

create extension if not exists btree_gist;

-- ───────────────────────────── Tablas ─────────────────────────────

create table public.consultorios (
  id      smallint generated always as identity primary key,
  nombre  text not null unique check (length(trim(nombre)) between 1 and 60),
  activo  boolean not null default true
);

create table public.profesionales (
  id                      uuid primary key references auth.users (id) on delete cascade,
  email                   text not null unique,
  nombre                  text not null default '',
  especialidad            text not null default '',
  telefono                text not null default '',
  duracion_turno          smallint not null default 30  check (duracion_turno between 10 and 240),
  anticipacion_horas      smallint not null default 2   check (anticipacion_horas between 0 and 168),
  ventana_dias            smallint not null default 30  check (ventana_dias between 1 and 120),
  aviso_cancelacion_horas smallint not null default 12  check (aviso_cancelacion_horas between 0 and 168),
  publico                 boolean  not null default false, -- aparece en la página de pacientes
  activo                  boolean  not null default true,
  es_admin                boolean  not null default false,
  creado                  timestamptz not null default now()
);

create table public.alquileres (
  id              bigint generated always as identity primary key,
  profesional_id  uuid     not null references public.profesionales (id) on delete cascade,
  consultorio_id  smallint not null references public.consultorios (id),
  dia_semana      smallint not null check (dia_semana between 1 and 7), -- 1 = lunes … 7 = domingo
  hora_inicio     time not null,
  hora_fin        time not null,
  vigente_desde   date not null,
  vigente_hasta   date not null,
  nota            text not null default '',
  check (hora_fin > hora_inicio),
  check (vigente_hasta >= vigente_desde),
  constraint alquiler_superpuesto_consultorio exclude using gist (
    consultorio_id with =,
    dia_semana with =,
    daterange(vigente_desde, vigente_hasta, '[]') with &&,
    tsrange('2000-01-03'::date + hora_inicio, '2000-01-03'::date + hora_fin) with &&
  ),
  constraint alquiler_superpuesto_profesional exclude using gist (
    profesional_id with =,
    dia_semana with =,
    daterange(vigente_desde, vigente_hasta, '[]') with &&,
    tsrange('2000-01-03'::date + hora_inicio, '2000-01-03'::date + hora_fin) with &&
  )
);
create index on public.alquileres (profesional_id);

create table public.ausencias (
  id              bigint generated always as identity primary key,
  profesional_id  uuid not null default auth.uid() references public.profesionales (id) on delete cascade,
  desde           timestamptz not null,
  hasta           timestamptz not null,
  motivo          text not null default '',
  check (hasta > desde)
);
create index on public.ausencias (profesional_id, desde);

create table public.turnos (
  id                bigint generated always as identity primary key,
  profesional_id    uuid     not null default auth.uid() references public.profesionales (id) on delete cascade,
  consultorio_id    smallint references public.consultorios (id), -- lo completa el trigger
  inicio            timestamptz not null,
  fin               timestamptz not null,
  paciente_nombre   text not null check (length(trim(paciente_nombre)) between 2 and 120),
  paciente_telefono text not null check (length(regexp_replace(paciente_telefono, '\D', '', 'g')) between 6 and 15),
  paciente_email    text not null default '' check (paciente_email = '' or paciente_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nota              text not null default '',
  origen            text not null default 'profesional' check (origen in ('online', 'profesional')),
  estado            text not null default 'confirmado'  check (estado in ('confirmado', 'cancelado')),
  cancelado_por     text check (cancelado_por in ('paciente', 'profesional')),
  token             uuid not null default gen_random_uuid() unique, -- link de cancelación del paciente
  creado            timestamptz not null default now(),
  check (fin > inicio),
  constraint turno_superpuesto_profesional exclude using gist (
    profesional_id with =, tstzrange(inicio, fin) with &&
  ) where (estado = 'confirmado'),
  constraint turno_superpuesto_consultorio exclude using gist (
    consultorio_id with =, tstzrange(inicio, fin) with &&
  ) where (estado = 'confirmado')
);
create index on public.turnos (profesional_id, inicio);

-- ───────────────────────────── Helpers ─────────────────────────────

-- Zona horaria del consultorio. Todas las franjas se interpretan en hora local.
create or replace function public.tz() returns text
language sql immutable as $$ select 'America/Argentina/Buenos_Aires' $$;

-- Últimos 10 dígitos: "+54 9 294 555-1234" y "294 555-1234" cuentan como el mismo número.
create or replace function public.tel_norm(t text) returns text
language sql immutable as $$ select right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 10) $$;

create or replace function public.soy_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select activo from profesionales where id = auth.uid()), false)
$$;

create or replace function public.soy_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select activo and es_admin from profesionales where id = auth.uid()), false)
$$;

-- ───────────────────────────── Triggers ─────────────────────────────

-- Al invitar a alguien desde Supabase Auth se crea su ficha de profesional.
create or replace function public.crear_profesional() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profesionales (id, email) values (new.id, lower(new.email))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger crear_profesional after insert on auth.users
for each row execute function public.crear_profesional();

-- Un profesional edita su ficha, pero no puede darse permisos ni reactivarse.
-- Desde el SQL Editor (sin usuario logueado) no aplica: así se nombra al primer admin.
create or replace function public.proteger_profesional() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not soy_admin() and (
       new.es_admin is distinct from old.es_admin
    or new.activo   is distinct from old.activo
    or new.email    is distinct from old.email
    or new.id       is distinct from old.id) then
    raise exception 'Solo un administrador puede cambiar esos datos';
  end if;
  if auth.uid() = old.id and old.es_admin and not new.es_admin then
    raise exception 'No podés quitarte el rol de administrador a vos mismo';
  end if;
  return new;
end $$;

create trigger proteger_profesional before update on public.profesionales
for each row execute function public.proteger_profesional();

-- Todo turno confirmado tiene que caer dentro de un alquiler vigente del profesional.
-- El consultorio se toma de ese alquiler.
create or replace function public.validar_turno() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ini timestamp := new.inicio at time zone tz();
  fin timestamp := new.fin    at time zone tz();
  box smallint;
begin
  if new.estado <> 'confirmado' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.estado = 'cancelado' then
    raise exception 'Un turno cancelado no se puede reactivar; creá uno nuevo';
  end if;
  if tg_op = 'UPDATE' and new.inicio = old.inicio and new.fin = old.fin
     and new.profesional_id = old.profesional_id then
    return new; -- cambio de nombre, teléfono o nota: no hace falta revalidar la franja
  end if;

  select a.consultorio_id into box
  from alquileres a
  where a.profesional_id = new.profesional_id
    and a.dia_semana = extract(isodow from ini)
    and ini::date between a.vigente_desde and a.vigente_hasta
    and fin::date = ini::date
    and ini::time >= a.hora_inicio
    and fin::time <= a.hora_fin;

  if box is null then
    raise exception 'El horario está fuera de las franjas alquiladas por el profesional'
      using errcode = 'P0001', hint = 'fuera_de_alquiler';
  end if;
  new.consultorio_id := box;
  return new;
end $$;

create trigger validar_turno before insert or update on public.turnos
for each row execute function public.validar_turno();

-- ───────────────────────────── Seguridad (RLS) ─────────────────────────────

alter table public.consultorios  enable row level security;
alter table public.profesionales enable row level security;
alter table public.alquileres    enable row level security;
alter table public.ausencias     enable row level security;
alter table public.turnos        enable row level security;

-- Consultorios y alquileres: los ve cualquier profesional activo; los edita el admin.
create policy consultorios_leer   on public.consultorios for select to authenticated using (soy_activo());
create policy consultorios_admin  on public.consultorios for all    to authenticated using (soy_admin()) with check (soy_admin());
create policy alquileres_leer     on public.alquileres   for select to authenticated using (soy_activo());
create policy alquileres_admin    on public.alquileres   for all    to authenticated using (soy_admin()) with check (soy_admin());

-- Profesionales: se ven entre colegas; cada uno edita lo suyo, el admin edita a todos.
create policy profesionales_leer   on public.profesionales for select to authenticated using (soy_activo() or id = auth.uid());
create policy profesionales_editar on public.profesionales for update to authenticated
  using (id = auth.uid() or soy_admin()) with check (id = auth.uid() or soy_admin());

-- Ausencias: cada uno las suyas.
create policy ausencias_propias on public.ausencias for all to authenticated
  using (soy_activo() and profesional_id = auth.uid())
  with check (soy_activo() and profesional_id = auth.uid());

-- Turnos: cada profesional solo los suyos. Sin borrado: se cancelan.
create policy turnos_leer    on public.turnos for select to authenticated using (soy_activo() and profesional_id = auth.uid());
create policy turnos_crear   on public.turnos for insert to authenticated with check (soy_activo() and profesional_id = auth.uid());
create policy turnos_editar  on public.turnos for update to authenticated
  using (soy_activo() and profesional_id = auth.uid()) with check (soy_activo() and profesional_id = auth.uid());

revoke all on public.consultorios, public.profesionales, public.alquileres, public.ausencias, public.turnos from anon;
revoke delete on public.turnos from authenticated;

-- ───────────────────────────── Funciones para pacientes ─────────────────────────────
-- Son la única puerta de entrada pública. Corren con permisos del dueño y devuelven
-- solo lo necesario: nunca datos de otros pacientes.

create or replace function public.profesionales_publicos()
returns table (id uuid, nombre text, especialidad text, duracion_turno smallint)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.especialidad, p.duracion_turno
  from profesionales p
  where p.publico and p.activo and p.nombre <> ''
    and exists (select 1 from alquileres a where a.profesional_id = p.id and a.vigente_hasta >= current_date)
  order by p.nombre
$$;

-- Horarios libres de un profesional entre dos fechas (máximo 31 días por consulta).
-- Para el propio profesional ignora anticipación y ventana (lo usa su agenda).
create or replace function public.turnos_disponibles(p_profesional uuid, p_desde date, p_hasta date)
returns table (inicio timestamptz, fin timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  p          profesionales;
  propio     boolean := auth.uid() is not null and auth.uid() = p_profesional;
  hoy        date := (now() at time zone tz())::date;
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

  dur       := make_interval(mins => p.duracion_turno);
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
  ),
  slots as (
    select ((b.dia + b.hora_inicio) + n * dur) at time zone tz() as ini
    from bloques b,
         generate_series(0, floor(extract(epoch from (b.hora_fin - b.hora_inicio)) / extract(epoch from dur))::int - 1) n
  )
  select s.ini, s.ini + dur
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

create or replace function public.reservar_turno(
  p_profesional uuid, p_inicio timestamptz,
  p_nombre text, p_telefono text, p_email text default ''
) returns json
language plpgsql volatile security definer set search_path = public as $$
declare
  p      profesionales;
  dia    date := (p_inicio at time zone tz())::date;
  tel    text := tel_norm(p_telefono);
  t      turnos;
begin
  select * into p from profesionales where id = p_profesional and activo and publico;
  if p.id is null then
    raise exception 'Profesional no disponible';
  end if;

  if not exists (
    select 1 from turnos_disponibles(p.id, dia, dia) d where d.inicio = p_inicio
  ) then
    raise exception 'Ese horario ya no está disponible' using hint = 'ocupado';
  end if;

  -- Freno básico contra reservas en masa: pocos turnos futuros por teléfono.
  if (select count(*) from turnos
      where estado = 'confirmado' and inicio > now()
        and tel_norm(paciente_telefono) = tel
        and profesional_id = p.id) >= 2
  or (select count(*) from turnos
      where estado = 'confirmado' and inicio > now()
        and tel_norm(paciente_telefono) = tel) >= 4 then
    raise exception 'Ya tenés varios turnos reservados con ese teléfono. Para más, comunicate con el profesional.'
      using hint = 'limite';
  end if;

  begin
    insert into turnos (profesional_id, inicio, fin, paciente_nombre, paciente_telefono, paciente_email, origen)
    values (p.id, p_inicio, p_inicio + make_interval(mins => p.duracion_turno),
            trim(p_nombre), trim(p_telefono), lower(trim(coalesce(p_email, ''))), 'online')
    returning * into t;
  exception when exclusion_violation then
    raise exception 'Ese horario se acaba de ocupar' using hint = 'ocupado';
  end;

  return json_build_object(
    'token', t.token, 'inicio', t.inicio, 'fin', t.fin,
    'profesional', p.nombre, 'especialidad', p.especialidad,
    'consultorio', (select nombre from consultorios where id = t.consultorio_id));
end $$;

create or replace function public.turno_por_token(p_token uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'inicio', t.inicio, 'fin', t.fin, 'estado', t.estado,
    'paciente', t.paciente_nombre,
    'profesional', p.nombre, 'especialidad', p.especialidad, 'telefono_profesional', p.telefono,
    'consultorio', c.nombre,
    'cancelable', t.estado = 'confirmado'
                  and t.inicio > now() + make_interval(hours => p.aviso_cancelacion_horas),
    'aviso_cancelacion_horas', p.aviso_cancelacion_horas)
  from turnos t
  join profesionales p on p.id = t.profesional_id
  left join consultorios c on c.id = t.consultorio_id
  where t.token = p_token
$$;

create or replace function public.cancelar_turno(p_token uuid) returns json
language plpgsql volatile security definer set search_path = public as $$
declare
  n int;
begin
  update turnos t set estado = 'cancelado', cancelado_por = 'paciente'
  from profesionales p
  where t.token = p_token and p.id = t.profesional_id
    and t.estado = 'confirmado'
    and t.inicio > now() + make_interval(hours => p.aviso_cancelacion_horas);
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'El turno no se puede cancelar online (ya pasó el plazo o ya estaba cancelado)';
  end if;
  return turno_por_token(p_token);
end $$;

-- Para el admin: cuántos turnos confirmados futuros caen dentro de un alquiler a partir de una fecha.
-- Sirve para avisar antes de borrar o acortar un alquiler. No expone datos de pacientes.
create or replace function public.turnos_en_alquiler(p_alquiler bigint, p_desde date default null)
returns int
language plpgsql stable security definer set search_path = public as $$
declare
  a alquileres;
begin
  if not soy_admin() then
    raise exception 'Solo para administradores';
  end if;
  select * into a from alquileres where id = p_alquiler;
  return (
    select count(*)::int from turnos t
    where t.profesional_id = a.profesional_id
      and t.consultorio_id = a.consultorio_id
      and t.estado = 'confirmado'
      and t.inicio > now()
      and extract(isodow from t.inicio at time zone tz()) = a.dia_semana
      and (t.inicio at time zone tz())::date >= greatest(coalesce(p_desde, a.vigente_desde), a.vigente_desde)
      and (t.inicio at time zone tz())::date <= a.vigente_hasta
      and (t.inicio at time zone tz())::time >= a.hora_inicio
      and (t.fin at time zone tz())::time <= a.hora_fin);
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.profesionales_publicos(),
  public.turnos_disponibles(uuid, date, date),
  public.reservar_turno(uuid, timestamptz, text, text, text),
  public.turno_por_token(uuid),
  public.cancelar_turno(uuid),
  public.tz()
to anon, authenticated;
grant execute on function public.soy_activo(), public.soy_admin(), public.turnos_en_alquiler(bigint, date) to authenticated;
