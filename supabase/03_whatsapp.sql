-- Consultorios Dina Huapi · Asistente de WhatsApp
-- Se ejecuta en el SQL Editor DESPUÉS de schema.sql y 02_pacientes_y_precios.sql (una sola vez).
--
-- El asistente contesta en el WhatsApp del consultorio: preguntas frecuentes, precios por cobertura
-- y turnos. No tiene datos propios: usa las mismas funciones que la página de turnos
-- (catalogo_publico, cotizar, turnos_disponibles, reservar_turno), así que precios, IPC,
-- duraciones y reglas de agenda son siempre los mismos que en la web.
--
-- Modelo:
--   wa_conversaciones → una por número de WhatsApp. estado = 'bot' (contesta el asistente)
--                       o 'humano' (la derivó a una persona: el asistente no responde).
--   wa_mensajes       → lo que se dijo, para dar contexto al asistente y para la bandeja del panel.
--   profesionales.atiende_whatsapp → quién ve la bandeja y responde (lo habilita el admin).
--
-- Quién ve qué:
--   · Las conversaciones son datos de pacientes: solo las ve quien tiene atiende_whatsapp.
--     La administración, como con las fichas, no tiene acceso especial.
--   · Los mensajes salientes los escribe solo la función "whatsapp" (con la clave de servicio),
--     porque además de guardarlos tiene que mandarlos por la API de WhatsApp.

-- ───────────────────────────── Tablas ─────────────────────────────

alter table public.profesionales
  add column atiende_whatsapp boolean not null default false;

alter table public.turnos drop constraint turnos_origen_check;
alter table public.turnos add constraint turnos_origen_check
  check (origen in ('online', 'profesional', 'whatsapp'));

insert into public.ajustes (clave, valor) values
  ('bot_activo', 'true'),         -- 'false': nadie contesta automáticamente, todo queda en la bandeja
  ('bot_retoma_horas', '24'),     -- una conversación derivada vuelve al asistente tras tantas horas sin movimiento
  ('bot_info', $txt$Consultorios Dina Huapi. Odontología general, ortodoncia y estética facial. Fundadora: Dra. Natalia Cárdenas.
Dirección: Estados Unidos 860, Oficina D, Dina Huapi (Río Negro).
Horarios de atención: [COMPLETAR]
Cómo llegar / estacionamiento: [COMPLETAR]
Medios de pago: [COMPLETAR]
Obras sociales: las que figuran en la lista de precios. Si una no figura, se atiende como particular.
Primera visita: llegar 10 minutos antes, traer DNI y credencial de la obra social.
Cancelaciones: se cancelan con el link que llega al reservar o pidiéndolo por acá, con 12 h de anticipación.
Urgencias: si hay dolor fuerte, golpe o una pieza rota, ofrecer el primer turno disponible de "Urgencia". Si hay sangrado que no para, fiebre o hinchazón de cara, indicar guardia médica.
Niños: primera visita cerca del año; evaluación de ortopedia a los 6 o 7 años.$txt$)
on conflict (clave) do nothing;

create table public.wa_conversaciones (
  telefono          text primary key check (telefono ~ '^\d{8,15}$'), -- número de WhatsApp (wa_id), sin +
  nombre            text not null default '',  -- nombre del perfil de WhatsApp
  estado            text not null default 'bot' check (estado in ('bot', 'humano')),
  motivo_derivacion text not null default '',
  derivada_en       timestamptz,
  atendida_por      uuid references public.profesionales (id) on delete set null,
  ultimo_entrante   timestamptz, -- WhatsApp solo deja escribir libremente hasta 24 h después de esto
  ultimo_mensaje    timestamptz not null default now(),
  no_leidos         smallint not null default 0,
  creado            timestamptz not null default now()
);
create index on public.wa_conversaciones (ultimo_mensaje desc);

create table public.wa_mensajes (
  id        bigint generated always as identity primary key,
  telefono  text not null references public.wa_conversaciones (telefono) on delete cascade,
  direccion text not null check (direccion in ('entrante', 'saliente')),
  autor     text not null check (autor in ('paciente', 'asistente', 'persona', 'sistema')),
  autor_id  uuid references public.profesionales (id) on delete set null, -- quién respondió, si fue una persona
  texto     text not null check (length(texto) <= 4096),
  wa_id     text unique, -- id del mensaje en WhatsApp: si Meta reenvía el mismo aviso, no se duplica
  creado    timestamptz not null default now()
);
create index on public.wa_mensajes (telefono, creado);

-- ───────────────────────────── Helpers y triggers ─────────────────────────────

create or replace function public.soy_whatsapp() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select activo and atiende_whatsapp from profesionales where id = auth.uid()), false)
$$;

-- Reemplaza la versión de schema.sql: dar acceso a la bandeja de WhatsApp también es cosa del admin.
create or replace function public.proteger_profesional() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not soy_admin() and (
       new.es_admin is distinct from old.es_admin
    or new.activo   is distinct from old.activo
    or new.email    is distinct from old.email
    or new.id       is distinct from old.id
    or new.atiende_whatsapp is distinct from old.atiende_whatsapp) then
    raise exception 'Solo un administrador puede cambiar esos datos';
  end if;
  if auth.uid() = old.id and old.es_admin and not new.es_admin then
    raise exception 'No podés quitarte el rol de administrador a vos mismo';
  end if;
  return new;
end $$;

-- Desde el panel solo se cambia el estado y se marcan como leídos; el resto lo escribe la función.
create or replace function public.proteger_conversacion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and (
       new.telefono is distinct from old.telefono
    or new.nombre is distinct from old.nombre
    or new.ultimo_entrante is distinct from old.ultimo_entrante) then
    raise exception 'Ese dato no se edita desde el panel';
  end if;
  if new.estado = 'bot' then
    new.motivo_derivacion := '';
    new.derivada_en := null;
  elsif old.estado = 'bot' then
    new.derivada_en := coalesce(new.derivada_en, now());
  end if;
  return new;
end $$;

create trigger proteger_conversacion before update on public.wa_conversaciones
for each row execute function public.proteger_conversacion();

-- ───────────────────────────── Seguridad (RLS) ─────────────────────────────

alter table public.wa_conversaciones enable row level security;
alter table public.wa_mensajes       enable row level security;

create policy wa_conv_leer   on public.wa_conversaciones for select to authenticated using (soy_whatsapp());
create policy wa_conv_editar on public.wa_conversaciones for update to authenticated
  using (soy_whatsapp()) with check (soy_whatsapp());
create policy wa_msj_leer    on public.wa_mensajes for select to authenticated using (soy_whatsapp());

revoke all on public.wa_conversaciones, public.wa_mensajes from anon;
revoke insert, delete on public.wa_conversaciones, public.wa_mensajes from authenticated;
revoke update on public.wa_mensajes from authenticated;

-- ───────────────────────────── Funciones del asistente ─────────────────────────────
-- Solo las llama la función "whatsapp" con la clave de servicio. El teléfono lo pone ella
-- (el número desde el que escribe el paciente), nunca el modelo: así un paciente solo puede
-- ver o cancelar sus propios turnos.

-- Guarda un mensaje entrante y actualiza la conversación. Si Meta reenvía el mismo aviso, no hace nada.
-- Una conversación derivada vuelve sola al asistente después de "bot_retoma_horas" sin movimiento.
create or replace function public.wa_registrar_entrante(p_telefono text, p_nombre text, p_texto text, p_wa_id text)
returns json
language plpgsql volatile security definer set search_path = public as $$
declare
  c      wa_conversaciones;
  retoma int := coalesce((select valor::int from ajustes where clave = 'bot_retoma_horas'), 24);
  mid    bigint;
begin
  if exists (select 1 from wa_mensajes where wa_id = p_wa_id) then
    return json_build_object('duplicado', true);
  end if;
  select * into c from wa_conversaciones where telefono = p_telefono for update;
  if c.telefono is null then
    insert into wa_conversaciones (telefono, nombre) values (p_telefono, left(coalesce(p_nombre, ''), 80)) returning * into c;
  elsif c.estado = 'humano' and c.ultimo_mensaje < now() - make_interval(hours => retoma) then
    update wa_conversaciones set estado = 'bot', atendida_por = null where telefono = p_telefono returning * into c;
  end if;
  begin
    insert into wa_mensajes (telefono, direccion, autor, texto, wa_id)
    values (p_telefono, 'entrante', 'paciente', left(p_texto, 4096), p_wa_id) returning id into mid;
  exception when unique_violation then
    return json_build_object('duplicado', true);
  end;
  update wa_conversaciones set
    nombre = coalesce(nullif(left(coalesce(p_nombre, ''), 80), ''), nombre),
    ultimo_entrante = now(), ultimo_mensaje = now(), no_leidos = least(no_leidos + 1, 999)
  where telefono = p_telefono;
  return json_build_object('duplicado', false, 'id', mid, 'estado', c.estado,
    'bot_activo', coalesce((select valor from ajustes where clave = 'bot_activo'), 'true') = 'true');
end $$;

-- Próximos turnos confirmados de un teléfono.
create or replace function public.wa_turnos(p_telefono text) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
    'id', t.id, 'inicio', t.inicio, 'profesional', p.nombre, 'servicio', s.nombre, 'consultorio', c.nombre,
    'cancelable', t.inicio > now() + make_interval(hours => p.aviso_cancelacion_horas),
    'aviso_cancelacion_horas', p.aviso_cancelacion_horas) order by t.inicio), '[]'::json)
  from turnos t
  join profesionales p on p.id = t.profesional_id
  left join servicios s on s.id = t.servicio_id
  left join consultorios c on c.id = t.consultorio_id
  where t.estado = 'confirmado' and t.inicio > now()
    and tel_norm(t.paciente_telefono) = tel_norm(p_telefono)
$$;

-- Cancela un turno solo si es de ese teléfono (mismas reglas de plazo que el link de cancelación).
create or replace function public.wa_cancelar_turno(p_telefono text, p_turno bigint) returns json
language plpgsql volatile security definer set search_path = public as $$
declare
  tk uuid;
begin
  select token into tk from turnos
  where id = p_turno and estado = 'confirmado' and tel_norm(paciente_telefono) = tel_norm(p_telefono);
  if tk is null then
    raise exception 'No encontré ese turno a nombre de este número';
  end if;
  return cancelar_turno(tk);
end $$;

-- Reserva con las mismas reglas que la web. El teléfono es siempre el del chat.
create or replace function public.wa_reservar_turno(
  p_telefono text, p_profesional uuid, p_inicio timestamptz, p_paciente json,
  p_servicio smallint default null, p_obra_social smallint default null, p_detalle text default ''
) returns json
language plpgsql volatile security definer set search_path = public as $$
declare
  r json;
begin
  r := reservar_turno(p_profesional, p_inicio,
         (coalesce(p_paciente::jsonb, '{}'::jsonb) || jsonb_build_object('telefono', p_telefono))::json,
         p_servicio, p_obra_social, p_detalle);
  update turnos set origen = 'whatsapp' where token = (r->>'token')::uuid;
  return (r::jsonb - 'token')::json; -- el link de cancelación no hace falta en el chat: se cancela por acá
end $$;

-- ───────────────────────────── Permisos de ejecución ─────────────────────────────

revoke execute on function public.wa_registrar_entrante(text, text, text, text), public.wa_turnos(text),
  public.wa_cancelar_turno(text, bigint), public.wa_reservar_turno(text, uuid, timestamptz, json, smallint, smallint, text)
  from public, anon, authenticated;
grant execute on function public.wa_registrar_entrante(text, text, text, text), public.wa_turnos(text),
  public.wa_cancelar_turno(text, bigint), public.wa_reservar_turno(text, uuid, timestamptz, json, smallint, smallint, text)
  to service_role;
revoke execute on function public.soy_whatsapp(), public.proteger_conversacion() from public, anon;
grant execute on function public.soy_whatsapp() to authenticated;
