-- Módulo de Crédito (factibilidad de crédito a 30 días / condiciones por cliente).
-- Spec: Modulo_Credito_serein-app.pdf (Octubre 2026).
--
-- Cuatro tablas reales con RLS (NO el blob app_state: ese lo puede leer
-- cualquier usuario con sesión, y acá hay datos personales — DICOM, carpeta
-- tributaria). Todas se leen y escriben solo con es_gerencia_o_admin()
-- (función ya existente: perfiles.tipo in ('gerencia','admin')). Los
-- supervisores y los perfiles externos no ven nada.
--
-- Los nombres llevan prefijo credito_ para no chocar con "facturas" y
-- "clientes" que ya existen en la app. Aditivo e idempotente: se puede correr
-- más de una vez sin duplicar ni borrar nada.

create table if not exists public.credito_clientes (
  id uuid primary key default gen_random_uuid(),
  razon_social text not null,
  rut text not null unique,
  giro text,
  direccion text,
  representante_legal text,
  contacto_compras text,
  contacto_pagos text,
  email_facturas text,
  portal_proveedores text,
  fecha_inicio_actividades date,
  -- Regla del módulo: el crédito aplica desde el segundo trabajo. Sin
  -- trabajos pagados el cliente no puede quedar aprobado.
  trabajos_pagados integer not null default 0,
  estado_credito text not null default 'sin_evaluar' check (estado_credito in ('sin_evaluar', 'activa', 'bloqueada')),
  categoria text check (categoria in ('A', 'B', 'C', 'D')),
  linea_aprobada numeric not null default 0,
  -- Deuda vigente con Serein: por ahora se anota a mano; la Etapa 4 del
  -- módulo (registro de facturas y pagos) la va a calcular sola.
  deuda_vigente numeric not null default 0,
  fecha_revision date,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table if not exists public.credito_documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.credito_clientes(id) on delete cascade,
  tipo text not null check (tipo in ('carpeta_tributaria', 'dicom', 'certificado_bancario', 'solicitud', 'tgr')),
  archivo_path text,
  nombre_archivo text,
  fecha_emision date,
  subido_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table if not exists public.credito_evaluaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.credito_clientes(id) on delete cascade,
  fecha date not null default current_date,
  datos_extraidos jsonb,
  datos_confirmados jsonb,
  -- Detalle del cálculo (filtros de rechazo, puntaje por factor) tal como se
  -- vio al evaluar, para que el historial no cambie si después se ajustan
  -- los parámetros.
  resultado jsonb,
  puntaje integer,
  categoria text check (categoria in ('A', 'B', 'C', 'D')),
  linea_sugerida numeric,
  linea_aprobada numeric,
  anticipo_minimo numeric,
  garantia text,
  estado text not null default 'borrador' check (estado in ('borrador', 'evaluada', 'aprobada', 'rechazada')),
  aprobada_por uuid,
  observaciones text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists credito_evaluaciones_cliente_idx on public.credito_evaluaciones (cliente_id, created_at desc);
create index if not exists credito_documentos_cliente_idx on public.credito_documentos (cliente_id);

-- Parámetros editables por Gerencia desde la app (porcentajes, topes, OC
-- grande, categorías). Una sola fila (id = 1) con todo en jsonb; si no
-- existe, la app usa los valores iniciales de la especificación.
create table if not exists public.credito_parametros (
  id integer primary key default 1 check (id = 1),
  valores jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

alter table public.credito_clientes enable row level security;
alter table public.credito_documentos enable row level security;
alter table public.credito_evaluaciones enable row level security;
alter table public.credito_parametros enable row level security;

drop policy if exists "credito_clientes_gerencia_admin" on public.credito_clientes;
create policy "credito_clientes_gerencia_admin" on public.credito_clientes
  for all using (public.es_gerencia_o_admin()) with check (public.es_gerencia_o_admin());

drop policy if exists "credito_documentos_gerencia_admin" on public.credito_documentos;
create policy "credito_documentos_gerencia_admin" on public.credito_documentos
  for all using (public.es_gerencia_o_admin()) with check (public.es_gerencia_o_admin());

drop policy if exists "credito_evaluaciones_gerencia_admin" on public.credito_evaluaciones;
create policy "credito_evaluaciones_gerencia_admin" on public.credito_evaluaciones
  for all using (public.es_gerencia_o_admin()) with check (public.es_gerencia_o_admin());

drop policy if exists "credito_parametros_gerencia_admin" on public.credito_parametros;
create policy "credito_parametros_gerencia_admin" on public.credito_parametros
  for all using (public.es_gerencia_o_admin()) with check (public.es_gerencia_o_admin());

-- Bucket privado para los PDF (carpeta tributaria, DICOM, etc.) y el informe.
-- Nunca público; la descarga se hace con URL firmada de corta duración.
insert into storage.buckets (id, name, public)
values ('credito', 'credito', false)
on conflict (id) do nothing;

drop policy if exists "credito_storage_gerencia_admin" on storage.objects;
create policy "credito_storage_gerencia_admin" on storage.objects
  for all using (bucket_id = 'credito' and public.es_gerencia_o_admin())
  with check (bucket_id = 'credito' and public.es_gerencia_o_admin());

-- Verificación: debe listar las 4 tablas.
select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'credito\_%' order by table_name;
