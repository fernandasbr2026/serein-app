-- ============================================================
-- SEREIN · Portal de Subcontratistas (Fase I del plan)
-- ============================================================
-- Da acceso al sistema a un subcontratista externo (ej. Franco) para que
-- suba sus propias facturas, indicando OT y Centro de Costo — pero SOLO
-- de los que tenga asignados. A diferencia del resto de la app (que
-- guarda todo en un blob JSON por clave en `app_state`, con lectura
-- abierta a cualquier autenticado — ver comentario de
-- 2026-07-25-fix-permisos-app-state.sql), estas son tablas reales con
-- RLS de verdad: un subcontratista JAMÁS toca `app_state` (su app
-- (`src/SubcontratoApp.jsx`) ni siquiera llama a pullState()/sync.js), así
-- que el aislamiento de estas tablas es la única barrera de seguridad
-- real que necesita, y alcanza.
--
-- Todo aditivo: no modifica ninguna tabla ni política existente, salvo
-- una política de LECTURA nueva sobre `perfiles` (se explica abajo, no
-- reemplaza la que ya existe).
-- ============================================================

-- ---------------------------------------------------------------
-- 1) Qué OT + Centro de Costo puede usar cada subcontratista
-- ---------------------------------------------------------------
create table if not exists public.subcontrato_asignaciones (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  ot text not null,
  cc text not null,
  cc_nombre text,
  created_at timestamptz not null default now(),
  unique (perfil_id, ot, cc)
);
alter table public.subcontrato_asignaciones enable row level security;

drop policy if exists "asignaciones_leer_propias_o_gerencia" on public.subcontrato_asignaciones;
create policy "asignaciones_leer_propias_o_gerencia"
  on public.subcontrato_asignaciones for select
  using (
    perfil_id = auth.uid()
    or exists (select 1 from public.perfiles where id = auth.uid() and tipo in ('gerencia', 'admin'))
  );

-- Solo gerencia/admin puede crear, editar o borrar asignaciones — un
-- subcontratista nunca se autoasigna un OT/CC nuevo.
drop policy if exists "asignaciones_escribir_gerencia" on public.subcontrato_asignaciones;
create policy "asignaciones_escribir_gerencia"
  on public.subcontrato_asignaciones for all
  using (exists (select 1 from public.perfiles where id = auth.uid() and tipo in ('gerencia', 'admin')))
  with check (exists (select 1 from public.perfiles where id = auth.uid() and tipo in ('gerencia', 'admin')));

-- ---------------------------------------------------------------
-- 2) Facturas que sube el subcontratista
-- ---------------------------------------------------------------
create table if not exists public.facturas_subcontrato (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  ot text not null,
  cc text not null,
  cc_nombre text,
  proveedor text,
  rut text,
  folio text,
  fecha date,
  monto bigint not null default 0,
  exento boolean not null default false,
  detalle text,
  pdf_path text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada')),
  abonado bigint not null default 0,
  decidido_por text,
  decidido_en timestamptz,
  created_at timestamptz not null default now()
);
alter table public.facturas_subcontrato enable row level security;

drop policy if exists "facturas_subcontrato_leer" on public.facturas_subcontrato;
create policy "facturas_subcontrato_leer"
  on public.facturas_subcontrato for select
  using (
    perfil_id = auth.uid()
    or exists (select 1 from public.perfiles where id = auth.uid() and tipo in ('gerencia', 'admin'))
  );

-- Un subcontratista solo puede insertar una factura para SÍ MISMO
-- (perfil_id = auth.uid()) y solo si existe una asignación real para ese
-- OT+CC — esta es la regla de negocio ("no puede cargar en un CC que no
-- es suyo") hecha cumplir a nivel de base de datos, no solo en la UI.
drop policy if exists "facturas_subcontrato_insertar" on public.facturas_subcontrato;
create policy "facturas_subcontrato_insertar"
  on public.facturas_subcontrato for insert
  with check (
    perfil_id = auth.uid()
    and exists (
      select 1 from public.subcontrato_asignaciones a
      where a.perfil_id = auth.uid() and a.ot = facturas_subcontrato.ot and a.cc = facturas_subcontrato.cc
    )
  );

-- Solo gerencia/admin puede aceptar/rechazar (cambiar estado, fijar
-- abonado) — el subcontratista no puede editar su propia factura una vez
-- subida.
drop policy if exists "facturas_subcontrato_decidir" on public.facturas_subcontrato;
create policy "facturas_subcontrato_decidir"
  on public.facturas_subcontrato for update
  using (exists (select 1 from public.perfiles where id = auth.uid() and tipo in ('gerencia', 'admin')))
  with check (exists (select 1 from public.perfiles where id = auth.uid() and tipo in ('gerencia', 'admin')));

-- ---------------------------------------------------------------
-- 3) Bucket de Storage para los PDF de estas facturas
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('facturas-subcontrato', 'facturas-subcontrato', false)
on conflict (id) do nothing;

-- Cada subcontratista solo puede subir/leer dentro de una carpeta cuyo
-- nombre es su propio auth.uid() (ej. "<uid>/factura.pdf") — el frontend
-- arma la ruta así al subir.
drop policy if exists "facturas_subcontrato_storage_subir" on storage.objects;
create policy "facturas_subcontrato_storage_subir"
  on storage.objects for insert
  with check (bucket_id = 'facturas-subcontrato' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "facturas_subcontrato_storage_leer_propio" on storage.objects;
create policy "facturas_subcontrato_storage_leer_propio"
  on storage.objects for select
  using (bucket_id = 'facturas-subcontrato' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "facturas_subcontrato_storage_leer_gerencia" on storage.objects;
create policy "facturas_subcontrato_storage_leer_gerencia"
  on storage.objects for select
  using (
    bucket_id = 'facturas-subcontrato'
    and exists (select 1 from public.perfiles where id = auth.uid() and tipo in ('gerencia', 'admin'))
  );

-- ---------------------------------------------------------------
-- 4) Gerencia/admin necesita poder leer el NOMBRE de otros perfiles (ej.
-- "Franco") para armar una asignación — hoy `leer_mi_perfil` solo deja
-- leer la fila propia. Las políticas RLS se combinan con OR, así que
-- esto SOLO agrega visibilidad para gerencia/admin, no le quita a nadie
-- su acceso a su propia fila.
-- ---------------------------------------------------------------
drop policy if exists "perfiles_leer_gerencia" on public.perfiles;
create policy "perfiles_leer_gerencia"
  on public.perfiles for select
  using (exists (select 1 from public.perfiles pf where pf.id = auth.uid() and pf.tipo in ('gerencia', 'admin')));

-- ---------------------------------------------------------------
-- 5) Alta de Franco — CORRER DESPUÉS de crearlo en
-- Authentication > Users (correo + contraseña, "Auto Confirm User").
-- Reemplaza el correo por el real antes de correr este bloque.
-- ---------------------------------------------------------------
-- insert into public.perfiles (id, nombre, rol, areas, tipo)
-- select id, 'Franco', 'Subcontratista', '{}', 'subcontrato'
-- from auth.users where email = 'franco@correo-real.cl'
-- on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol, tipo = excluded.tipo;

-- Ejemplo de asignación (edítalo con el OT/CC reales una vez tengas su id
-- de perfil — o hazlo desde el panel "Asignar subcontratista" de la app
-- cuando esté listo, en vez de por SQL):
-- insert into public.subcontrato_asignaciones (perfil_id, ot, cc, cc_nombre)
-- select id, 'OT-2026-102', 'A1', 'Pintura' from public.perfiles where nombre = 'Franco';
