-- =====================================================================
-- Módulo «Avance de Obra + Portal Cliente» · fase 1 · esquema propio `avance`
-- Origen: paquete de Gerencia de Proyectos (02_supabase/001_esquema.sql),
-- adaptado para correrse más de una vez sin error (if not exists) y con los
-- permisos que la app necesita. NO toca app_state ni ninguna tabla del ERP.
-- Sin datos de ejemplo: los proyectos los crea el administrador desde el ERP
-- y la información la aporta el propio módulo al leer Drive y correo.
--
-- Cómo correrlo: Supabase → SQL Editor → pegar → Run.
-- Después, UNA vez: Settings → API → «Exposed schemas» → agregar `avance`
-- (sin eso la app no puede leer estas tablas).
-- =====================================================================
-- SEREIN · Módulo Avance de Obra + Portal Cliente · esquema independiente del ERP
-- Ejecutar en Supabase (SQL Editor o migración). No modifica tablas existentes del ERP.
create schema if not exists avance;

create table if not exists avance.ots (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  cliente text,
  fecha_inicio_contractual date not null,
  plazo_dias integer not null check (plazo_dias > 0),
  kg_contrato numeric not null default 0,
  precio_contrato numeric not null default 0,
  suma_partidas numeric not null default 0,
  anticipo numeric not null default 0,
  retencion_pct numeric not null default 0.10,
  amortizacion text not null default 'total' check (amortizacion in ('total','proporcional')),
  amortizacion_pct numeric not null default 0.30,
  multa_dia numeric not null default 0,
  drive_folder_id text,
  remitentes_cliente text[] not null default '{}',
  portal_publicado boolean not null default false,
  creado_en timestamptz not null default now()
);

create table if not exists avance.miembros (
  ot_id uuid not null references avance.ots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rol text not null check (rol in ('admin','operador','cliente')),
  usuario text not null,
  debe_cambiar_clave boolean not null default true,
  creado_en timestamptz not null default now(),
  primary key (ot_id, user_id)
);

create table if not exists avance.partidas (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references avance.ots(id) on delete cascade,
  codigo text not null check (codigo in ('prov','mon','pin','int','ter')),
  nombre text not null,
  monto numeric not null,
  unique (ot_id, codigo)
);

create table if not exists avance.procesos (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references avance.ots(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  orden integer not null,
  duracion_sem numeric not null check (duracion_sem > 0),
  peso_edp numeric not null default 100,
  partida text not null check (partida in ('prov','mon','pin','int','ter')),
  unidad text not null,
  cantidad_total numeric not null check (cantidad_total > 0),
  avance numeric not null default 0 check (avance >= 0 and avance <= 1),
  plan_inicio date not null,
  plan_fin date not null,
  predecesor text,
  req_lib_interna boolean not null default true,
  req_lib_externa boolean not null default false,
  libera_externo text,
  visible_cliente boolean not null default true,
  color text,
  unique (ot_id, codigo)
);

create table if not exists avance.liberaciones (
  id uuid primary key default gen_random_uuid(),
  proceso_id uuid not null references avance.procesos(id) on delete cascade,
  tipo text not null check (tipo in ('interna','externa')),
  estado text not null default 'pend' check (estado in ('ok','run','pend','blk','na')),
  motivo text,
  documento_url text,
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now(),
  unique (proceso_id, tipo)
);

create table if not exists avance.partes_diarios (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references avance.ots(id) on delete cascade,
  proceso_id uuid not null references avance.procesos(id),
  fecha date not null,
  zona text,
  detalle text,
  cantidad numeric not null check (cantidad > 0),
  responsable text,
  n_parte text,
  foto_url text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);

create table if not exists avance.registros (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references avance.ots(id) on delete cascade,
  fecha date not null,
  titulo text not null,
  detalle text,
  respaldo text,
  interno boolean not null default false,
  origen text not null default 'manual'
);

create table if not exists avance.libro_obra (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references avance.ots(id) on delete cascade,
  fecha date not null,
  hasta date,
  tipo text not null check (tipo in ('ini','renov','det','com','pla','tra','ava')),
  titulo text not null,
  detalle text,
  respaldo text,
  interno boolean not null default false,
  origen_ia boolean not null default false,
  creado_en timestamptz not null default now(),
  check (hasta is null or hasta >= fecha)
);
-- La renovación del plazo (planos finales para fabricar) ocurre una sola vez por OT.
create unique index if not exists libro_una_renovacion on avance.libro_obra (ot_id) where tipo = 'renov';
create unique index if not exists libro_un_inicio on avance.libro_obra (ot_id) where tipo = 'ini';

create table if not exists avance.aprobaciones (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null unique references avance.libro_obra(id) on delete cascade,
  clase text not null,
  estado text not null default 'pend' check (estado in ('pend','ok','com','rej','resp')),
  vence date
);

create table if not exists avance.aprobacion_respuestas (
  id uuid primary key default gen_random_uuid(),
  aprobacion_id uuid not null references avance.aprobaciones(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  accion text not null check (accion in ('ok','com','rej','resp')),
  comentario text,
  creado_en timestamptz not null default now(),
  check (accion = 'ok' or length(coalesce(comentario,'')) > 0)
);

create table if not exists avance.alertas (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references avance.ots(id) on delete cascade,
  titulo text not null,
  cuerpo text,
  nivel text not null default 'info' check (nivel in ('info','aviso','critico')),
  correo_enviado boolean not null default false,
  leida boolean not null default false,
  creado_en timestamptz not null default now()
);

create table if not exists avance.documentos (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references avance.ots(id) on delete cascade,
  paso text,
  titulo text not null,
  carpeta text,
  descripcion text,
  url text,
  interno boolean not null default false,
  orden integer not null default 0
);

create table if not exists avance.elementos (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references avance.ots(id) on delete cascade,
  modelo_version integer not null default 1,
  guid_ifc text,
  marca text,
  tipo text,
  zona text,
  peso_kg numeric,
  proceso_actual text,
  geometria jsonb
);

create table if not exists avance.edp (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references avance.ots(id) on delete cascade,
  numero integer not null,
  fecha date not null,
  bruto_acumulado numeric not null,
  periodo numeric not null,
  amortizacion numeric not null,
  retencion numeric not null,
  neto numeric not null,
  estado text not null default 'borrador' check (estado in ('borrador','presentado','aprobado','pagado')),
  unique (ot_id, numero)
);

-- ---------- Parte diario: valida y actualiza el avance del proceso ----------
create or replace function avance.aplicar_parte() returns trigger
language plpgsql security definer set search_path = avance, public as $$
declare
  p avance.procesos%rowtype;
  pre_avance numeric;
  nuevo numeric;
begin
  select * into p from avance.procesos where id = new.proceso_id for update;
  if p.ot_id <> new.ot_id then
    raise exception 'El proceso no pertenece a la OT indicada';
  end if;
  nuevo := p.avance + new.cantidad / p.cantidad_total;
  if nuevo > 1.0001 then
    raise exception 'El parte supera el total del proceso %', p.codigo;
  end if;
  if p.predecesor is not null then
    select avance into pre_avance from avance.procesos where ot_id = p.ot_id and codigo = p.predecesor;
    if pre_avance is not null and nuevo > pre_avance + 0.000000001 then
      raise exception 'El proceso % no puede superar al proceso anterior %', p.codigo, p.predecesor;
    end if;
  end if;
  update avance.procesos set avance = least(1, nuevo) where id = p.id;
  insert into avance.registros (ot_id, fecha, titulo, detalle, respaldo, origen)
  values (new.ot_id, new.fecha, 'Parte diario · ' || p.nombre,
          new.cantidad::text || ' ' || p.unidad || coalesce(' · zona ' || new.zona, '') || coalesce(' · ' || new.detalle, ''),
          concat_ws(' · ', new.responsable, new.n_parte), 'parte');
  return new;
end $$;

drop trigger if exists partes_aplicar on avance.partes_diarios;
create trigger partes_aplicar before insert on avance.partes_diarios
for each row execute function avance.aplicar_parte();

-- ---------- Seguridad por fila ----------
create or replace function avance.rol_en(p_ot uuid) returns text
language sql stable security definer set search_path = avance, public as $$
  select rol from avance.miembros where ot_id = p_ot and user_id = auth.uid()
$$;

create or replace function avance.es_interno(p_ot uuid) returns boolean
language sql stable security definer set search_path = avance, public as $$
  select coalesce(avance.rol_en(p_ot) in ('admin','operador'), false)
$$;

alter table avance.ots enable row level security;
alter table avance.miembros enable row level security;
alter table avance.partidas enable row level security;
alter table avance.procesos enable row level security;
alter table avance.liberaciones enable row level security;
alter table avance.partes_diarios enable row level security;
alter table avance.registros enable row level security;
alter table avance.libro_obra enable row level security;
alter table avance.aprobaciones enable row level security;
alter table avance.aprobacion_respuestas enable row level security;
alter table avance.alertas enable row level security;
alter table avance.documentos enable row level security;
alter table avance.elementos enable row level security;
alter table avance.edp enable row level security;

-- Lectura: internos ven todo; el cliente solo su OT publicada y nada marcado interno.
drop policy if exists ots_leer on avance.ots;
create policy ots_leer on avance.ots for select using (avance.es_interno(id) or (avance.rol_en(id) = 'cliente' and portal_publicado));
drop policy if exists ots_escribir on avance.ots;
create policy ots_escribir on avance.ots for all using (avance.rol_en(id) = 'admin') with check (avance.rol_en(id) = 'admin');
drop policy if exists miembros_leer on avance.miembros;
create policy miembros_leer on avance.miembros for select using (avance.es_interno(ot_id) or user_id = auth.uid());
drop policy if exists miembros_escribir on avance.miembros;
create policy miembros_escribir on avance.miembros for all using (avance.rol_en(ot_id) = 'admin') with check (avance.rol_en(ot_id) = 'admin');
drop policy if exists partidas_leer on avance.partidas;
create policy partidas_leer on avance.partidas for select using (avance.rol_en(ot_id) is not null);
drop policy if exists partidas_escribir on avance.partidas;
create policy partidas_escribir on avance.partidas for all using (avance.rol_en(ot_id) = 'admin') with check (avance.rol_en(ot_id) = 'admin');
drop policy if exists procesos_leer on avance.procesos;
create policy procesos_leer on avance.procesos for select using (avance.es_interno(ot_id) or (avance.rol_en(ot_id) = 'cliente' and visible_cliente));
drop policy if exists procesos_escribir on avance.procesos;
create policy procesos_escribir on avance.procesos for all using (avance.es_interno(ot_id)) with check (avance.es_interno(ot_id));
drop policy if exists liberaciones_leer on avance.liberaciones;
create policy liberaciones_leer on avance.liberaciones for select using (exists (select 1 from avance.procesos p where p.id = proceso_id and (avance.es_interno(p.ot_id) or (avance.rol_en(p.ot_id) = 'cliente' and p.visible_cliente))));
drop policy if exists liberaciones_escribir on avance.liberaciones;
create policy liberaciones_escribir on avance.liberaciones for all using (exists (select 1 from avance.procesos p where p.id = proceso_id and avance.es_interno(p.ot_id))) with check (exists (select 1 from avance.procesos p where p.id = proceso_id and avance.es_interno(p.ot_id)));
drop policy if exists partes_interno on avance.partes_diarios;
create policy partes_interno on avance.partes_diarios for all using (avance.es_interno(ot_id)) with check (avance.es_interno(ot_id));
drop policy if exists registros_leer on avance.registros;
create policy registros_leer on avance.registros for select using (avance.es_interno(ot_id) or (avance.rol_en(ot_id) = 'cliente' and not interno));
drop policy if exists registros_escribir on avance.registros;
create policy registros_escribir on avance.registros for all using (avance.es_interno(ot_id)) with check (avance.es_interno(ot_id));
drop policy if exists libro_leer on avance.libro_obra;
create policy libro_leer on avance.libro_obra for select using (avance.es_interno(ot_id) or (avance.rol_en(ot_id) = 'cliente' and not interno));
drop policy if exists libro_escribir on avance.libro_obra;
create policy libro_escribir on avance.libro_obra for all using (avance.es_interno(ot_id)) with check (avance.es_interno(ot_id));
drop policy if exists aprob_leer on avance.aprobaciones;
create policy aprob_leer on avance.aprobaciones for select using (exists (select 1 from avance.libro_obra l where l.id = evento_id and (avance.es_interno(l.ot_id) or (avance.rol_en(l.ot_id) = 'cliente' and not l.interno))));
drop policy if exists aprob_escribir on avance.aprobaciones;
create policy aprob_escribir on avance.aprobaciones for all using (exists (select 1 from avance.libro_obra l where l.id = evento_id and avance.es_interno(l.ot_id))) with check (exists (select 1 from avance.libro_obra l where l.id = evento_id and avance.es_interno(l.ot_id)));
drop policy if exists resp_leer on avance.aprobacion_respuestas;
create policy resp_leer on avance.aprobacion_respuestas for select using (exists (select 1 from avance.aprobaciones a join avance.libro_obra l on l.id = a.evento_id where a.id = aprobacion_id and avance.rol_en(l.ot_id) is not null));
drop policy if exists resp_cliente on avance.aprobacion_respuestas;
create policy resp_cliente on avance.aprobacion_respuestas for insert with check (user_id = auth.uid() and exists (select 1 from avance.aprobaciones a join avance.libro_obra l on l.id = a.evento_id where a.id = aprobacion_id and a.estado = 'pend' and not l.interno and avance.rol_en(l.ot_id) is not null));
drop policy if exists alertas_interno on avance.alertas;
create policy alertas_interno on avance.alertas for all using (avance.es_interno(ot_id)) with check (avance.es_interno(ot_id));
drop policy if exists docs_leer on avance.documentos;
create policy docs_leer on avance.documentos for select using (avance.es_interno(ot_id) or (avance.rol_en(ot_id) = 'cliente' and not interno));
drop policy if exists docs_escribir on avance.documentos;
create policy docs_escribir on avance.documentos for all using (avance.es_interno(ot_id)) with check (avance.es_interno(ot_id));
drop policy if exists elementos_leer on avance.elementos;
create policy elementos_leer on avance.elementos for select using (avance.rol_en(ot_id) is not null);
drop policy if exists elementos_escribir on avance.elementos;
create policy elementos_escribir on avance.elementos for all using (avance.es_interno(ot_id)) with check (avance.es_interno(ot_id));
drop policy if exists edp_leer on avance.edp;
create policy edp_leer on avance.edp for select using (avance.es_interno(ot_id) or (avance.rol_en(ot_id) = 'cliente' and estado <> 'borrador'));
drop policy if exists edp_escribir on avance.edp;
create policy edp_escribir on avance.edp for all using (avance.rol_en(ot_id) = 'admin') with check (avance.rol_en(ot_id) = 'admin');

-- Respuesta del cliente: actualiza la aprobación y genera la alerta (el correo lo envía la función del ERP).
create or replace function avance.al_responder() returns trigger
language plpgsql security definer set search_path = avance, public as $$
declare
  v_ot uuid;
  v_titulo text;
begin
  update avance.aprobaciones set estado = new.accion where id = new.aprobacion_id and estado = 'pend';
  if not found then
    raise exception 'La aprobación ya fue respondida';
  end if;
  select l.ot_id, l.titulo into v_ot, v_titulo
  from avance.aprobaciones a join avance.libro_obra l on l.id = a.evento_id where a.id = new.aprobacion_id;
  insert into avance.alertas (ot_id, titulo, cuerpo, nivel)
  values (v_ot, v_titulo || ': ' || case new.accion when 'ok' then 'APROBADO' when 'com' then 'APROBADO CON COMENTARIOS' when 'rej' then 'RECHAZADO' else 'RESPONDIDA' end,
          new.comentario, case when new.accion in ('rej','com') then 'critico' else 'info' end);
  return new;
end $$;

drop trigger if exists respuestas_al_responder on avance.aprobacion_respuestas;
create trigger respuestas_al_responder after insert on avance.aprobacion_respuestas
for each row execute function avance.al_responder();

-- ---------- Crear una OT desde la app ----------
-- Un usuario todavía no es miembro de una OT que no existe, así que la
-- política de escritura de avance.ots lo rechazaría. Esta función (security
-- definer) crea la OT, deja a quien la crea como admin, suma como miembros al
-- resto del personal interno del ERP (gerencia = admin, los demás = operador),
-- crea las 5 partidas, los procesos con sus dos liberaciones y el evento de
-- inicio del libro de obra. Devuelve el id de la OT.
create or replace function avance.crear_ot(datos jsonb) returns uuid
language plpgsql security definer set search_path = avance, public as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
  p jsonb;
  pid uuid;
  perf record;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión'; end if;
  insert into avance.ots (codigo, nombre, cliente, fecha_inicio_contractual, plazo_dias, kg_contrato, precio_contrato,
    suma_partidas, anticipo, retencion_pct, amortizacion, amortizacion_pct, multa_dia, drive_folder_id, remitentes_cliente, correo_cliente)
  values (
    datos->>'codigo', datos->>'nombre', datos->>'cliente', (datos->>'fecha_inicio_contractual')::date, (datos->>'plazo_dias')::int,
    coalesce((datos->>'kg_contrato')::numeric, 0), coalesce((datos->>'precio_contrato')::numeric, 0), coalesce((datos->>'suma_partidas')::numeric, 0),
    coalesce((datos->>'anticipo')::numeric, 0), coalesce((datos->>'retencion_pct')::numeric, 0.10), coalesce(datos->>'amortizacion', 'total'),
    coalesce((datos->>'amortizacion_pct')::numeric, 0.30), coalesce((datos->>'multa_dia')::numeric, 0), nullif(datos->>'drive_folder_id', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(datos->'remitentes_cliente', '[]'::jsonb))), '{}'), nullif(datos->>'correo_cliente', ''))
  returning id into v_id;

  insert into avance.miembros (ot_id, user_id, rol, usuario) values (v_id, v_uid, 'admin', coalesce((select email from auth.users where id = v_uid), 'admin'));
  -- Resto del personal interno: gerencia (más de un área y no supervisor) = admin; el resto = operador.
  for perf in select pf.id, pf.tipo, pf.areas from public.perfiles pf where pf.id <> v_uid and coalesce(pf.tipo, '') not in ('subcontrato', 'taller_externo', 'cliente') loop
    insert into avance.miembros (ot_id, user_id, rol, usuario)
    values (v_id, perf.id,
      case when coalesce(jsonb_array_length(to_jsonb(perf.areas)), 0) > 1 and coalesce(perf.tipo, '') <> 'supervisor' then 'admin' else 'operador' end,
      coalesce((select email from auth.users where id = perf.id), perf.id::text))
    on conflict do nothing;
  end loop;

  for p in select * from jsonb_array_elements(coalesce(datos->'partidas', '[]'::jsonb)) loop
    insert into avance.partidas (ot_id, codigo, nombre, monto) values (v_id, p->>'codigo', p->>'nombre', coalesce((p->>'monto')::numeric, 0));
  end loop;

  for p in select * from jsonb_array_elements(coalesce(datos->'procesos', '[]'::jsonb)) loop
    insert into avance.procesos (ot_id, codigo, nombre, orden, duracion_sem, peso_edp, partida, unidad, cantidad_total, plan_inicio, plan_fin, predecesor, req_lib_externa, libera_externo, visible_cliente)
    values (v_id, p->>'codigo', p->>'nombre', (p->>'orden')::int, (p->>'duracion_sem')::numeric, coalesce((p->>'peso_edp')::numeric, 100), p->>'partida', p->>'unidad',
      greatest(coalesce((p->>'cantidad_total')::numeric, 1), 0.000001), (p->>'plan_inicio')::date, (p->>'plan_fin')::date, nullif(p->>'predecesor', ''),
      coalesce((p->>'req_lib_externa')::boolean, false), nullif(p->>'libera_externo', ''), coalesce((p->>'visible_cliente')::boolean, true))
    returning id into pid;
    insert into avance.liberaciones (proceso_id, tipo) values (pid, 'interna'), (pid, 'externa');
  end loop;

  insert into avance.libro_obra (ot_id, fecha, tipo, titulo) values (v_id, (datos->>'fecha_inicio_contractual')::date, 'ini', 'Inicio contractual');
  return v_id;
end $$;

-- Sumar o quitar a un usuario interno del ERP como miembro de una OT (solo admins de esa OT).
create or replace function avance.fijar_miembro(p_ot uuid, p_user uuid, p_rol text) returns void
language plpgsql security definer set search_path = avance, public as $$
begin
  if avance.rol_en(p_ot) <> 'admin' then raise exception 'Solo un administrador de la OT puede hacerlo'; end if;
  if p_rol is null or p_rol = '' then
    delete from avance.miembros where ot_id = p_ot and user_id = p_user;
  else
    insert into avance.miembros (ot_id, user_id, rol, usuario) values (p_ot, p_user, p_rol, coalesce((select email from auth.users where id = p_user), p_user::text))
    on conflict (ot_id, user_id) do update set rol = excluded.rol;
  end if;
end $$;

-- ---------- Permisos para la app (las políticas de arriba filtran por fila) ----------
grant usage on schema avance to authenticated, service_role;
grant select, insert, update, delete on all tables in schema avance to authenticated;
grant all on all tables in schema avance to service_role;
grant execute on all functions in schema avance to authenticated, service_role;
alter default privileges in schema avance grant select, insert, update, delete on tables to authenticated;

-- Registro de la última lectura de Drive/correo por OT («Actualizar proyecto»).
alter table avance.ots add column if not exists ultima_lectura timestamptz;
alter table avance.ots add column if not exists correo_cliente text;

-- Verificación: debe devolver 14 tablas.
select count(*) as tablas from information_schema.tables where table_schema = 'avance';
