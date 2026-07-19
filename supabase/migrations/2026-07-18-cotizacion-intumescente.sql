-- ============================================================
-- SEREIN · Migración: Módulo Cotización Intumescente
-- Paso 1 de la spec (docs/SPEC-modulo-cotizacion-intumescente.md,
-- sección 8) — Opción "integración real": nuevas tablas de catálogo
-- + extensión de las tablas reales cotizaciones/cotizacion_items
-- (NO se crean tablas paralelas). 100% aditivo, seguro de re-correr.
-- Pega TODO este archivo en: Supabase > SQL Editor > New query > Run
-- ============================================================

begin;

-- ============================================================
-- 1) Catálogo VIVO de productos intumescentes
-- Editar este catálogo NUNCA debe alterar una cotización ya
-- guardada — por eso cada revisión emitida congela su propia
-- copia en cotizacion_revisiones.snapshot (ver más abajo).
-- ============================================================
create table if not exists public.int_productos (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique,             -- identificador estable para seeds/tests, ej 'rn-stofire'
  marca        text not null,           -- Sherwin-Williams / Renner / PPG / ...
  nombre       text not null,
  solidos_pct  numeric(5,2) not null,   -- sólidos por volumen %
  densidad     numeric(5,3) not null,   -- kg/l
  precio_kg    numeric(12,2) not null,  -- CLP
  kg_envase    numeric(6,2),
  capa_max_um  int not null default 250,
  certificada  boolean not null default false,   -- sección 7: aviso mientras no sea tabla certificada
  fuente       text,                              -- n° de certificado IDIEM/DICTUC y fecha
  activo       boolean not null default true,
  updated_at   timestamptz default now()
);

-- Tablas de espesores: por producto, tipo de sección (abierto/cerrado)
-- y banda de masividad. Criterio de lectura: banda mas baja cuyo
-- masividad_max >= masividad consultada (conservador, sin extrapolar).
create table if not exists public.int_espesores (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid references public.int_productos(id) on delete cascade,
  seccion_tipo  text not null check (seccion_tipo in ('abierto','cerrado')),
  masividad_max numeric(6,1),          -- NULL = banda ">último" (máxima, sin techo)
  f15_um  int not null default 0,
  f30_um  int not null default 0,
  f60_um  int not null default 0,
  f90_um  int not null default 0,
  f120_um int not null default 0       -- 0 = no certificado para esa combinación
);
create index if not exists idx_int_espesores_producto on public.int_espesores(producto_id, seccion_tipo);

-- Parámetros globales vivos (mermas, costos unitarios, GG, utilidad...)
create table if not exists public.int_parametros (
  clave      text primary key,          -- 'merma_viga','merma_pilar','prep_m2','gg_pct', etc.
  valor      numeric(14,4) not null,
  updated_at timestamptz default now()
);

-- ============================================================
-- 2) Extensión de la tabla CENTRAL real `cotizaciones`
-- (ya existe desde FASE 6 — NO se crea una tabla nueva).
-- `numero` ya cumple el rol de folio (ej. 'CI-2026-0042').
-- ============================================================
alter table public.cotizaciones add column if not exists tipo text not null default 'general';
alter table public.cotizaciones add column if not exists proyecto_id uuid references public.proyectos(id);
alter table public.cotizaciones add column if not exists moneda text not null default 'CLP' check (moneda in ('CLP','UF'));
alter table public.cotizaciones add column if not exists valor_uf numeric(10,2);
alter table public.cotizaciones add column if not exists monto_neto bigint;
alter table public.cotizaciones add column if not exists monto_iva bigint;
alter table public.cotizaciones add column if not exists monto_total bigint;
alter table public.cotizaciones add column if not exists fecha_vencimiento date;
alter table public.cotizaciones add column if not exists revision_actual int not null default 1;
alter table public.cotizaciones add column if not exists motivo_no_adjudicacion text
  check (motivo_no_adjudicacion is null or motivo_no_adjudicacion in ('precio','plazo','otro_proveedor','proyecto_postergado','sin_respuesta'));
alter table public.cotizaciones add column if not exists created_by uuid references auth.users(id);

-- Ampliar el set de estados manteniendo la convención ya usada en
-- esta tabla (capitalizado en español), agregando los que pide la
-- spec: 'En seguimiento' y 'Cerrada'.
alter table public.cotizaciones drop constraint if exists cotizaciones_estado_check;
alter table public.cotizaciones add constraint cotizaciones_estado_check
  check (estado in ('Borrador','Enviada','En seguimiento','Aprobada','Rechazada','Vencida','Cerrada'));

comment on column public.cotizaciones.tipo is 'general (blob legacy) | intumescente | ... — nuevos tipos usan esta tabla real';
comment on column public.cotizaciones.numero is 'Folio. Para intumescentes: CI-{año}-{correlativo 4 dígitos}';

-- ============================================================
-- 3) Snapshot inmutable por revisión (requerimiento de Mario:
-- "cómo se cotizó" = snapshot + resultados, nunca el catálogo vivo)
-- ============================================================
create table if not exists public.cotizacion_revisiones (
  id            uuid primary key default gen_random_uuid(),
  cotizacion_id uuid references public.cotizaciones(id) on delete cascade,
  revision      int not null,           -- 1, 2, 3... (Rev A, B, C en UI)
  snapshot      jsonb not null,         -- cliente, obra, items, productos_usados, globals, aplicador, otros, oferta
  resultados    jsonb not null,         -- totales y desgloses ya calculados
  created_by    uuid references auth.users(id),
  created_at    timestamptz default now(),
  unique (cotizacion_id, revision)
);

-- Inmutabilidad: una revisión solo se puede seguir sobreescribiendo
-- (UPDATE) mientras la cotización esté en 'Borrador'. Una vez que la
-- cotización avanza de estado, esa revisión queda congelada para
-- siempre; "modificar" implica INSERTAR una revisión nueva.
create or replace function public.bloquear_edicion_revision_emitida()
returns trigger language plpgsql as $$
declare estado_cot text;
begin
  select estado into estado_cot from public.cotizaciones where id = old.cotizacion_id;
  if estado_cot is distinct from 'Borrador' then
    raise exception 'La revisión % de la cotización % ya fue emitida (estado %) y es inmutable. Cree una nueva revisión en vez de editar esta.', old.revision, old.cotizacion_id, estado_cot;
  end if;
  return new;
end $$;
drop trigger if exists trg_revision_inmutable on public.cotizacion_revisiones;
create trigger trg_revision_inmutable
  before update on public.cotizacion_revisiones
  for each row execute function public.bloquear_edicion_revision_emitida();

-- ============================================================
-- 4) RLS
-- cotizaciones / cotizacion_items ya tienen RLS por área (FASE 6);
-- las cotizaciones intumescentes seguirán esa misma regla al llevar
-- area = 'Proyectos' (o la que corresponda), sin cambios adicionales.
-- ============================================================
alter table public.int_productos enable row level security;
alter table public.int_espesores enable row level security;
alter table public.int_parametros enable row level security;
alter table public.cotizacion_revisiones enable row level security;

-- Catálogo: cualquier autenticado puede LEER (lo necesita para cotizar);
-- solo gerencia lo edita (mismo criterio que "admin" en la spec, sección 6).
drop policy if exists "int_prod_leer" on public.int_productos;
create policy "int_prod_leer" on public.int_productos for select using (auth.uid() is not null);
drop policy if exists "int_prod_escribir" on public.int_productos;
create policy "int_prod_escribir" on public.int_productos for all
  using (public.es_gerencia()) with check (public.es_gerencia());

drop policy if exists "int_esp_leer" on public.int_espesores;
create policy "int_esp_leer" on public.int_espesores for select using (auth.uid() is not null);
drop policy if exists "int_esp_escribir" on public.int_espesores;
create policy "int_esp_escribir" on public.int_espesores for all
  using (public.es_gerencia()) with check (public.es_gerencia());

drop policy if exists "int_param_leer" on public.int_parametros;
create policy "int_param_leer" on public.int_parametros for select using (auth.uid() is not null);
drop policy if exists "int_param_escribir" on public.int_parametros;
create policy "int_param_escribir" on public.int_parametros for all
  using (public.es_gerencia()) with check (public.es_gerencia());

-- Revisiones: mismo criterio de área que su cotización (reusa cot_por_area)
drop policy if exists "revisiones_por_area" on public.cotizacion_revisiones;
create policy "revisiones_por_area" on public.cotizacion_revisiones for all
  using (exists (select 1 from public.cotizaciones ct join public.perfiles pf on pf.id = auth.uid()
                 where ct.id = cotizacion_revisiones.cotizacion_id and ct.area = any (pf.areas)))
  with check (exists (select 1 from public.cotizaciones ct join public.perfiles pf on pf.id = auth.uid()
                 where ct.id = cotizacion_revisiones.cotizacion_id and ct.area = any (pf.areas)));

-- ============================================================
-- 5) Folio autoincremental CI-{año}-{correlativo 4 dígitos}
-- ============================================================
create or replace function public.generar_folio_intumescente()
returns text language plpgsql as $$
declare
  anio text := to_char(current_date, 'YYYY');
  siguiente int;
  folio text;
begin
  select coalesce(max((regexp_match(numero, '^CI-' || anio || '-(\d+)$'))[1]::int), 0) + 1
    into siguiente
    from public.cotizaciones
    where numero like 'CI-' || anio || '-%';
  folio := 'CI-' || anio || '-' || lpad(siguiente::text, 4, '0');
  return folio;
end $$;

-- ============================================================
-- 6) Parámetros globales por defecto (idénticos a DEFAULT_GLOBALS
-- y DEFAULT_APLICADOR/DEFAULT_OTROS del prototipo)
-- ============================================================
insert into public.int_parametros (clave, valor) values
  ('merma_viga', 1.10),
  ('merma_pilar', 1.45),
  ('prep_m2', 1200),
  ('imprimante_m2', 1800),
  ('topcoat_m2', 2500),
  ('aplicacion_propia_m2_capa', 0),
  ('gg_pct', 12),
  ('util_pct', 25),
  ('valor_uf', 39000),
  ('aplicador_monto_obra', 1800000),
  ('aplicador_valor_m2', 3200),
  ('aplicador_valor_kg', 1500),
  ('aplicador_valor_dia', 140000),
  ('otros_certificacion', 450000),
  ('otros_retoques_pct', 3),
  ('otros_equipos', 300000),
  ('otros_movilizacion', 150000)
on conflict (clave) do nothing;

commit;

-- ============================================================
-- 7) Seed del catálogo (4 productos + tablas de espesores)
-- Generado programáticamente desde la MISMA función mkTabla/mkTablas
-- del prototipo (ver gen-seed-sql.mjs) para evitar transcripción
-- manual de una tabla de seguridad contra incendio.
-- ADVERTENCIA (spec sección 7): estas tablas son REFERENCIALES,
-- no certificadas — quedan con certificada=false por defecto.
-- ============================================================
-- Seed generado automaticamente desde la logica mkTabla/mkTablas del prototipo.
-- NO editar a mano los valores de espesor; si cambia el prototipo, regenerar este bloque.

with nuevos_productos as (
  insert into public.int_productos (slug, marca, nombre, solidos_pct, densidad, precio_kg, kg_envase, capa_max_um)
  values
    ('sw-firecontrol', 'Sherwin-Williams', 'Fire Control (base agua)', 50, 1.3, 11500, 22, 250),
    ('sw-fx5062', 'Sherwin-Williams', 'Firetex FX5062', 62, 1.35, 14500, 25, 300),
    ('rn-stofire', 'Renner', 'Stofire 879 (base agua)', 65.5, 1.3, 10800, 20, 250),
    ('ppg-sg651', 'PPG', 'Steelguard 651 (base agua)', 68, 1.34, 13800, 25, 300)
  on conflict (slug) do nothing
  returning id, slug
)
insert into public.int_espesores (producto_id, seccion_tipo, masividad_max, f15_um, f30_um, f60_um, f90_um, f120_um)
select np.id, x.seccion_tipo, x.masividad_max, x.f15_um, x.f30_um, x.f60_um, x.f90_um, x.f120_um
from nuevos_productos np
join (values
  ('sw-firecontrol', 'abierto', 100, 150, 270, 480, 840, 0),
  ('sw-firecontrol', 'abierto', 150, 200, 360, 640, 1120, 0),
  ('sw-firecontrol', 'abierto', 200, 250, 450, 800, 1400, 0),
  ('sw-firecontrol', 'abierto', 260, 300, 540, 960, 1680, 0),
  ('sw-firecontrol', 'abierto', 320, 350, 630, 1120, 1960, 0),
  ('sw-firecontrol', 'abierto', NULL, 400, 720, 1280, 2240, 0),
  ('sw-firecontrol', 'cerrado', 100, 170, 310, 550, 970, 0),
  ('sw-firecontrol', 'cerrado', 150, 230, 410, 740, 1290, 0),
  ('sw-firecontrol', 'cerrado', 200, 290, 520, 920, 1610, 0),
  ('sw-firecontrol', 'cerrado', 260, 350, 620, 1100, 1930, 0),
  ('sw-firecontrol', 'cerrado', 320, 400, 720, 1290, 2250, 0),
  ('sw-firecontrol', 'cerrado', NULL, 460, 830, 1470, 2580, 0),
  ('sw-fx5062', 'abierto', 100, 130, 240, 450, 750, 1140),
  ('sw-fx5062', 'abierto', 150, 180, 320, 600, 1000, 1520),
  ('sw-fx5062', 'abierto', 200, 220, 400, 750, 1250, 1900),
  ('sw-fx5062', 'abierto', 260, 260, 480, 900, 1500, 2280),
  ('sw-fx5062', 'abierto', 320, 310, 560, 1050, 1750, 2660),
  ('sw-fx5062', 'abierto', NULL, 350, 640, 1200, 2000, 3040),
  ('sw-fx5062', 'cerrado', 100, 150, 280, 520, 860, 1310),
  ('sw-fx5062', 'cerrado', 150, 200, 370, 690, 1150, 1750),
  ('sw-fx5062', 'cerrado', 200, 250, 460, 860, 1440, 2190),
  ('sw-fx5062', 'cerrado', 260, 300, 550, 1040, 1720, 2620),
  ('sw-fx5062', 'cerrado', 320, 350, 640, 1210, 2010, 3060),
  ('sw-fx5062', 'cerrado', NULL, 400, 740, 1380, 2300, 3500),
  ('rn-stofire', 'abierto', 100, 140, 260, 470, 810, 0),
  ('rn-stofire', 'abierto', 150, 190, 340, 630, 1080, 0),
  ('rn-stofire', 'abierto', 200, 240, 430, 790, 1350, 0),
  ('rn-stofire', 'abierto', 260, 290, 520, 940, 1620, 0),
  ('rn-stofire', 'abierto', 320, 340, 600, 1100, 1890, 0),
  ('rn-stofire', 'abierto', NULL, 380, 690, 1260, 2160, 0),
  ('rn-stofire', 'cerrado', 100, 170, 300, 540, 930, 0),
  ('rn-stofire', 'cerrado', 150, 220, 400, 720, 1240, 0),
  ('rn-stofire', 'cerrado', 200, 280, 490, 900, 1550, 0),
  ('rn-stofire', 'cerrado', 260, 330, 590, 1080, 1860, 0),
  ('rn-stofire', 'cerrado', 320, 390, 690, 1260, 2170, 0),
  ('rn-stofire', 'cerrado', NULL, 440, 790, 1440, 2480, 0),
  ('ppg-sg651', 'abierto', 100, 140, 250, 460, 780, 1200),
  ('ppg-sg651', 'abierto', 150, 180, 340, 610, 1040, 1600),
  ('ppg-sg651', 'abierto', 200, 230, 420, 760, 1300, 2000),
  ('ppg-sg651', 'abierto', 260, 280, 500, 910, 1560, 2400),
  ('ppg-sg651', 'abierto', 320, 320, 590, 1060, 1820, 2800),
  ('ppg-sg651', 'abierto', NULL, 370, 670, 1220, 2080, 3200),
  ('ppg-sg651', 'cerrado', 100, 160, 290, 520, 900, 1380),
  ('ppg-sg651', 'cerrado', 150, 210, 390, 700, 1200, 1840),
  ('ppg-sg651', 'cerrado', 200, 260, 480, 870, 1490, 2300),
  ('ppg-sg651', 'cerrado', 260, 320, 580, 1050, 1790, 2760),
  ('ppg-sg651', 'cerrado', 320, 370, 680, 1220, 2090, 3220),
  ('ppg-sg651', 'cerrado', NULL, 420, 770, 1400, 2390, 3680)
) as x(slug, seccion_tipo, masividad_max, f15_um, f30_um, f60_um, f90_um, f120_um) on x.slug = np.slug;

