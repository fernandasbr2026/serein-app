-- ============================================================
-- SEREIN · Control de Taller para externos (Fase J del plan)
-- ============================================================
-- Da acceso a Control de Taller a una persona externa (ej. Iván) SOLO
-- para los proyectos/OT que se le asignen, con aislamiento real (RLS),
-- mismo espíritu que el Portal de Subcontratistas (Fase I).
--
-- Diferencia con la Fase I: Control de Taller YA EXISTE en producción y
-- hoy guarda sus datos (p.partes, p.historialLecturas) dentro del blob
-- de app_state['serein_proyectos'] — con lectura abierta a cualquier
-- autenticado (ver 2026-07-25-fix-permisos-app-state.sql). Esta
-- migración saca esos dos campos a tablas reales con RLS, y COPIA (no
-- borra) lo que ya exista en el blob, para no perder ningún Listado de
-- Partes ya importado.
-- ============================================================

-- ---------------------------------------------------------------
-- 1) Piezas de Control de Taller (reemplaza p.partes[] del blob)
-- ---------------------------------------------------------------
create table if not exists public.taller_partes (
  id uuid primary key default gen_random_uuid(),
  ot text not null,
  marca text not null,
  perfil text,
  cantidad numeric,
  material text,
  largo numeric,
  peso_unitario numeric,
  avance jsonb not null default '{"dimensionado":0,"armado":0,"soldado":0,"liberado":0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ot, marca)
);
alter table public.taller_partes enable row level security;

drop policy if exists "taller_partes_leer" on public.taller_partes;
create policy "taller_partes_leer"
  on public.taller_partes for select
  using (
    public.es_gerencia_o_admin()
    or exists (select 1 from public.taller_asignaciones a where a.perfil_id = auth.uid() and a.ot = taller_partes.ot)
  );

drop policy if exists "taller_partes_escribir" on public.taller_partes;
create policy "taller_partes_escribir"
  on public.taller_partes for all
  using (
    public.es_gerencia_o_admin()
    or exists (select 1 from public.taller_asignaciones a where a.perfil_id = auth.uid() and a.ot = taller_partes.ot)
  )
  with check (
    public.es_gerencia_o_admin()
    or exists (select 1 from public.taller_asignaciones a where a.perfil_id = auth.uid() and a.ot = taller_partes.ot)
  );

-- ---------------------------------------------------------------
-- 2) Historial de lecturas de hoja de avance (reemplaza p.historialLecturas[])
-- ---------------------------------------------------------------
create table if not exists public.taller_lecturas (
  id uuid primary key default gen_random_uuid(),
  ot text not null,
  fecha date,
  foto_url text,
  filas jsonb not null default '[]'::jsonb,
  confirmado_por text,
  created_at timestamptz not null default now()
);
alter table public.taller_lecturas enable row level security;

drop policy if exists "taller_lecturas_leer" on public.taller_lecturas;
create policy "taller_lecturas_leer"
  on public.taller_lecturas for select
  using (
    public.es_gerencia_o_admin()
    or exists (select 1 from public.taller_asignaciones a where a.perfil_id = auth.uid() and a.ot = taller_lecturas.ot)
  );

drop policy if exists "taller_lecturas_insertar" on public.taller_lecturas;
create policy "taller_lecturas_insertar"
  on public.taller_lecturas for insert
  with check (
    public.es_gerencia_o_admin()
    or exists (select 1 from public.taller_asignaciones a where a.perfil_id = auth.uid() and a.ot = taller_lecturas.ot)
  );

-- ---------------------------------------------------------------
-- 3) Qué OT puede ver/editar cada persona externa en Control de Taller
-- (nota: esta tabla la referencian las políticas de arriba, así que se
-- crea recién acá — Postgres no exige orden de creación para políticas
-- que se agregan después, pero el orden natural de lectura del archivo
-- es este)
-- ---------------------------------------------------------------
create table if not exists public.taller_asignaciones (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  ot text not null,
  created_at timestamptz not null default now(),
  unique (perfil_id, ot)
);
alter table public.taller_asignaciones enable row level security;

drop policy if exists "taller_asignaciones_leer" on public.taller_asignaciones;
create policy "taller_asignaciones_leer"
  on public.taller_asignaciones for select
  using (perfil_id = auth.uid() or public.es_gerencia_o_admin());

drop policy if exists "taller_asignaciones_escribir" on public.taller_asignaciones;
create policy "taller_asignaciones_escribir"
  on public.taller_asignaciones for all
  using (public.es_gerencia_o_admin())
  with check (public.es_gerencia_o_admin());

-- ---------------------------------------------------------------
-- 4) Copia lo que ya exista en el blob (app_state->serein_proyectos) a
-- las tablas nuevas — NO borra nada del blob, solo copia. Mismo patrón
-- ya usado para migrar clientes desde un blob en
-- 2026-07-20-crm.sql (jsonb_array_elements anidado).
-- ---------------------------------------------------------------
insert into public.taller_partes (ot, marca, perfil, cantidad, material, largo, peso_unitario, avance)
select
  proy->>'ot',
  parte->>'marca',
  nullif(parte->>'perfil', ''),
  nullif(parte->>'cantidad', '')::numeric,
  nullif(parte->>'material', ''),
  nullif(parte->>'largo', '')::numeric,
  nullif(parte->>'pesoUnitario', '')::numeric,
  coalesce(parte->'avance', '{"dimensionado":0,"armado":0,"soldado":0,"liberado":0}'::jsonb)
from public.app_state,
     jsonb_array_elements(value::jsonb) as proy,
     jsonb_array_elements(coalesce(proy->'partes', '[]'::jsonb)) as parte
where id = 'serein_proyectos'
  and coalesce(parte->>'marca', '') <> ''
  and coalesce(proy->>'ot', '') <> ''
on conflict (ot, marca) do nothing;

insert into public.taller_lecturas (ot, fecha, foto_url, filas, confirmado_por, created_at)
select
  proy->>'ot',
  nullif(lectura->>'fecha', '')::date,
  nullif(lectura->>'fotoUrl', ''),
  coalesce(lectura->'filas', '[]'::jsonb),
  nullif(lectura->>'confirmadoPor', ''),
  coalesce(nullif(lectura->>'fecha', '')::date::timestamptz, now())
from public.app_state,
     jsonb_array_elements(value::jsonb) as proy,
     jsonb_array_elements(coalesce(proy->'historialLecturas', '[]'::jsonb)) as lectura
where id = 'serein_proyectos'
  and coalesce(proy->>'ot', '') <> '';

-- ---------------------------------------------------------------
-- 5) Alta de Iván — CORRER DESPUÉS de crearlo en
-- Authentication > Users (correo + contraseña, "Auto Confirm User").
-- Reemplaza el correo por el real antes de correr este bloque.
-- ---------------------------------------------------------------
-- insert into public.perfiles (id, nombre, rol, areas, tipo)
-- select id, 'Iván', 'Taller externo', '{}', 'taller_externo'
-- from auth.users where email = 'ivan@correo-real.cl'
-- on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol, tipo = excluded.tipo;

-- Ejemplo de asignación (o hazlo desde el panel de la app una vez esté
-- listo, en vez de por SQL):
-- insert into public.taller_asignaciones (perfil_id, ot)
-- select id, 'OT-2026-102' from public.perfiles where nombre = 'Iván';
