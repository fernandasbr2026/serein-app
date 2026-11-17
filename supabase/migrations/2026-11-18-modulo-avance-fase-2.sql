-- =====================================================================
-- Módulo «Avance de Obra» · fase 2 · «Actualizar proyecto»
-- El sistema lee la carpeta de Drive y los correos del cliente y PROPONE
-- cambios (eventos del libro, documentos, avances, datos de contrato); nada
-- se aplica hasta que una persona interna lo confirma. Se puede correr más
-- de una vez. No toca nada fuera del esquema `avance` salvo la publicación
-- de tiempo real.
-- =====================================================================

-- Propuestas pendientes de confirmar (las genera la función avance-actualizar
-- o, a futuro, una persona desde la app).
create table if not exists avance.propuestas (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references avance.ots(id) on delete cascade,
  origen text not null check (origen in ('drive', 'correo', 'manual', 'ia')),
  referencia text not null default '',             -- id del archivo de Drive, id del correo, etc. (evita duplicar)
  tipo text not null check (tipo in ('evento', 'documento', 'avance', 'contrato', 'alerta')),
  titulo text not null,
  detalle text,
  confianza text,                                   -- alta / media / baja según la IA
  datos jsonb not null default '{}'::jsonb,         -- lo que se aplicará al confirmar (ver avance.aplicar_propuesta)
  estado text not null default 'pend' check (estado in ('pend', 'ok', 'desc')),
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  resuelto_por uuid references auth.users(id),
  unique (ot_id, origen, referencia, tipo, titulo)
);

-- Correos del cliente que manda el script de Google (misma mecánica que
-- correos-ingresar): solo la función los escribe; los internos de la OT los leen.
create table if not exists avance.correos_entrantes (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid references avance.ots(id) on delete set null,
  gmail_id text not null unique,
  buzon text,
  de text,
  para text,
  asunto text,
  fecha timestamptz,
  cuerpo text,
  adjuntos jsonb not null default '[]'::jsonb,      -- [{nombre, mime, ruta}] (ruta dentro del bucket privado «correos»)
  leido boolean not null default false,             -- ya fue considerado por una lectura de «Actualizar proyecto»
  creado_en timestamptz not null default now()
);
create index if not exists correos_entrantes_ot on avance.correos_entrantes (ot_id, leido);

-- Bitácora de cada lectura (qué se leyó, cuánto propuso, si falló).
create table if not exists avance.lecturas (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references avance.ots(id) on delete cascade,
  por uuid references auth.users(id),
  inicio timestamptz not null default now(),
  fin timestamptz,
  drive_archivos integer not null default 0,
  correos integer not null default 0,
  propuestas integer not null default 0,
  error text
);

alter table avance.propuestas enable row level security;
alter table avance.correos_entrantes enable row level security;
alter table avance.lecturas enable row level security;

drop policy if exists propuestas_interno on avance.propuestas;
create policy propuestas_interno on avance.propuestas for all using (avance.es_interno(ot_id)) with check (avance.es_interno(ot_id));
drop policy if exists correos_leer on avance.correos_entrantes;
create policy correos_leer on avance.correos_entrantes for select using (ot_id is not null and avance.es_interno(ot_id));
drop policy if exists lecturas_leer on avance.lecturas;
create policy lecturas_leer on avance.lecturas for select using (avance.es_interno(ot_id));

-- Aplica una propuesta confirmada. Security definer para que sea atómica y
-- para que la escritura pase por las mismas reglas de siempre (el disparador
-- de partes valida cantidades y predecesores). Solo internos de la OT.
create or replace function avance.aplicar_propuesta(p_id uuid, p_datos jsonb default null) returns void
language plpgsql security definer set search_path = avance, public as $$
declare
  pr avance.propuestas%rowtype;
  d jsonb;
  v_ev uuid;
  v_pr uuid;
begin
  select * into pr from avance.propuestas where id = p_id for update;
  if pr.id is null then raise exception 'La propuesta no existe'; end if;
  if not avance.es_interno(pr.ot_id) then raise exception 'Solo el equipo interno puede confirmar propuestas'; end if;
  if pr.estado <> 'pend' then raise exception 'La propuesta ya fue resuelta'; end if;
  d := coalesce(p_datos, pr.datos);

  if pr.tipo = 'evento' then
    if coalesce(d->>'tipo', '') not in ('renov', 'det', 'com', 'pla', 'tra', 'ava') then raise exception 'Tipo de evento no válido: %', d->>'tipo'; end if;
    insert into avance.libro_obra (ot_id, fecha, hasta, tipo, titulo, detalle, respaldo, interno, origen_ia)
    values (pr.ot_id, (d->>'fecha')::date, nullif(d->>'hasta', '')::date, d->>'tipo', coalesce(d->>'titulo', pr.titulo), d->>'detalle', d->>'respaldo', coalesce((d->>'interno')::boolean, false), pr.origen in ('drive', 'correo', 'ia'))
    returning id into v_ev;
    if d ? 'aprobacion' and d->'aprobacion' is not null and jsonb_typeof(d->'aprobacion') = 'object' then
      insert into avance.aprobaciones (evento_id, clase, vence) values (v_ev, coalesce(d->'aprobacion'->>'clase', 'Aprobación'), nullif(d->'aprobacion'->>'vence', '')::date);
    end if;
  elsif pr.tipo = 'documento' then
    insert into avance.documentos (ot_id, paso, titulo, carpeta, descripcion, url, interno, orden)
    values (pr.ot_id, d->>'paso', coalesce(d->>'titulo', pr.titulo), d->>'carpeta', d->>'descripcion', d->>'url', coalesce((d->>'interno')::boolean, false),
            (select coalesce(max(orden), 0) + 1 from avance.documentos where ot_id = pr.ot_id));
  elsif pr.tipo = 'avance' then
    select id into v_pr from avance.procesos where ot_id = pr.ot_id and codigo = d->>'proceso';
    if v_pr is null then raise exception 'Proceso % no existe en esta OT', d->>'proceso'; end if;
    insert into avance.partes_diarios (ot_id, proceso_id, fecha, zona, detalle, cantidad, responsable, n_parte, creado_por)
    values (pr.ot_id, v_pr, (d->>'fecha')::date, d->>'zona', d->>'detalle', (d->>'cantidad')::numeric, d->>'responsable', coalesce(d->>'respaldo', 'Propuesta ' || pr.origen), auth.uid());
  elsif pr.tipo = 'contrato' then
    -- Solo los campos del contrato; cualquier otra clave se ignora.
    update avance.ots set
      fecha_inicio_contractual = coalesce(nullif(d->>'fecha_inicio_contractual', '')::date, fecha_inicio_contractual),
      plazo_dias = coalesce(nullif(d->>'plazo_dias', '')::int, plazo_dias),
      kg_contrato = coalesce(nullif(d->>'kg_contrato', '')::numeric, kg_contrato),
      precio_contrato = coalesce(nullif(d->>'precio_contrato', '')::numeric, precio_contrato),
      suma_partidas = coalesce(nullif(d->>'suma_partidas', '')::numeric, suma_partidas),
      anticipo = coalesce(nullif(d->>'anticipo', '')::numeric, anticipo),
      retencion_pct = coalesce(nullif(d->>'retencion_pct', '')::numeric, retencion_pct),
      amortizacion = coalesce(nullif(d->>'amortizacion', ''), amortizacion),
      amortizacion_pct = coalesce(nullif(d->>'amortizacion_pct', '')::numeric, amortizacion_pct),
      multa_dia = coalesce(nullif(d->>'multa_dia', '')::numeric, multa_dia)
    where id = pr.ot_id;
  elsif pr.tipo = 'alerta' then
    insert into avance.alertas (ot_id, titulo, cuerpo, nivel) values (pr.ot_id, coalesce(d->>'titulo', pr.titulo), d->>'cuerpo', coalesce(d->>'nivel', 'aviso'));
  end if;

  update avance.propuestas set estado = 'ok', datos = d, resuelto_en = now(), resuelto_por = auth.uid() where id = p_id;
end $$;

create or replace function avance.descartar_propuesta(p_id uuid) returns void
language plpgsql security definer set search_path = avance, public as $$
declare v_ot uuid;
begin
  select ot_id into v_ot from avance.propuestas where id = p_id;
  if v_ot is null then raise exception 'La propuesta no existe'; end if;
  if not avance.es_interno(v_ot) then raise exception 'Solo el equipo interno puede descartar propuestas'; end if;
  update avance.propuestas set estado = 'desc', resuelto_en = now(), resuelto_por = auth.uid() where id = p_id and estado = 'pend';
end $$;

grant select, insert, update, delete on avance.propuestas, avance.lecturas to authenticated;
grant select on avance.correos_entrantes to authenticated;
grant all on avance.propuestas, avance.correos_entrantes, avance.lecturas to service_role;
grant execute on function avance.aplicar_propuesta(uuid, jsonb), avance.descartar_propuesta(uuid) to authenticated, service_role;

-- Tiempo real: la pantalla se actualiza sola cuando cambia algo de la OT.
do $$
declare t text;
begin
  for t in select unnest(array['procesos', 'libro_obra', 'aprobaciones', 'alertas', 'partes_diarios', 'propuestas', 'documentos', 'liberaciones', 'edp', 'ots']) loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'avance' and tablename = t) then
      execute format('alter publication supabase_realtime add table avance.%I', t);
    end if;
  end loop;
end $$;

select count(*) as tablas_avance from information_schema.tables where table_schema = 'avance';
select count(*) as tablas_en_tiempo_real from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'avance';

-- =====================================================================
-- Fase 3 · acceso del cliente
-- El usuario del cliente lo crea la función avance-invitar-cliente (service
-- role) con un correo técnico <usuario>@obras.sereinspa.com; aquí solo lo que
-- la app necesita desde el lado del cliente.
-- =====================================================================
-- El cliente marca que ya cambió su clave inicial (solo su propia fila).
create or replace function avance.clave_cambiada() returns void
language sql security definer set search_path = avance, public as $$
  update avance.miembros set debe_cambiar_clave = false where user_id = auth.uid();
$$;
grant execute on function avance.clave_cambiada() to authenticated;
-- Un admin de la OT puede reiniciar la obligación de cambiar clave (tras «reiniciar clave»).
create or replace function avance.exigir_cambio_clave(p_ot uuid, p_user uuid) returns void
language plpgsql security definer set search_path = avance, public as $$
begin
  if avance.rol_en(p_ot) <> 'admin' then raise exception 'Solo un administrador de la OT puede hacerlo'; end if;
  update avance.miembros set debe_cambiar_clave = true where ot_id = p_ot and user_id = p_user;
end $$;
grant execute on function avance.exigir_cambio_clave(uuid, uuid) to authenticated;
