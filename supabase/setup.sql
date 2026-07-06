-- ============================================================
-- SEREIN · Configuración de seguridad en Supabase
-- Pega TODO este archivo en: Supabase > SQL Editor > New query > Run
-- ============================================================

-- 1) Tabla de perfiles: define qué áreas puede ver cada usuario
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol text not null default 'Usuario',
  areas text[] not null default '{}'
);

-- 2) Activar seguridad por fila (cada quien ve SOLO su propio perfil)
alter table public.perfiles enable row level security;

drop policy if exists "leer_mi_perfil" on public.perfiles;
create policy "leer_mi_perfil"
  on public.perfiles for select
  using (auth.uid() = id);

-- ============================================================
-- 3) ASIGNAR ÁREAS A CADA USUARIO
-- Primero crea los usuarios en: Authentication > Users > Add user
-- (correo + contraseña, y marca "Auto Confirm User")
-- Luego, por cada usuario, ejecuta un bloque como este,
-- reemplazando el correo, nombre, rol y áreas:
-- ============================================================

-- GERENCIA (ve todo):
insert into public.perfiles (id, nombre, rol, areas)
select id, 'Gerencia', 'Vista general', array['Santa Rosa','Proyectos','Istria']
from auth.users where email = 'gerencia@serein.cl'
on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol, areas = excluded.areas;

-- JEFE SANTA ROSA (solo su planta):
insert into public.perfiles (id, nombre, rol, areas)
select id, 'Jefe Santa Rosa', 'Planta Santa Rosa', array['Santa Rosa']
from auth.users where email = 'santarosa@serein.cl'
on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol, areas = excluded.areas;

-- JEFE ISTRIA:
insert into public.perfiles (id, nombre, rol, areas)
select id, 'Jefe Istria', 'Planta Istria', array['Istria']
from auth.users where email = 'istria@serein.cl'
on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol, areas = excluded.areas;

-- JEFE PROYECTOS:
insert into public.perfiles (id, nombre, rol, areas)
select id, 'Jefe Proyectos', 'Proyectos', array['Proyectos']
from auth.users where email = 'proyectos@serein.cl'
on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol, areas = excluded.areas;

-- NOTA: cambia los correos de arriba por los correos REALES que uses
-- al crear los usuarios en Authentication > Users.

-- ============================================================
-- FASE 2 · Tablas para gestión de proyectos y facturas SII
-- (Puedes correr este bloque junto con lo anterior; es seguro)
-- ============================================================

-- Proyectos (margen real vs presupuesto, avance)
create table if not exists public.proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cliente text not null,
  oc text,
  area text not null default 'Proyectos',
  presupuesto bigint,           -- CLP; null = sin definir
  avance int not null default 0 check (avance between 0 and 100),
  creado timestamptz default now()
);

-- Estados de pago (EDP) asociados a un proyecto
create table if not exists public.edps (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid references public.proyectos(id) on delete cascade,
  nombre text not null,          -- 'EDP 1', 'EDP 673-2', etc.
  fecha date,
  venta_neta bigint not null default 0,
  estado text not null default 'Pendiente',  -- Pagado / Pendiente / Factoring / Anulada
  folio text                     -- número de factura asociada
);

-- Facturas traídas del SII (compras y ventas)
create table if not exists public.facturas_sii (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('venta','compra')),
  folio text not null,
  rut_contraparte text,
  razon_social text,
  fecha date,
  neto bigint,
  iva bigint,
  total bigint,
  area text,                     -- Santa Rosa / Istria / Proyectos (null = sin clasificar)
  proyecto_id uuid references public.proyectos(id),
  clasificacion text not null default 'pendiente',  -- 'auto' / 'manual' / 'pendiente'
  periodo text,                  -- '2026-07'
  unique (tipo, folio, rut_contraparte)
);

-- Reglas de clasificación automática (contraparte → área/proyecto)
create table if not exists public.reglas_clasificacion (
  id uuid primary key default gen_random_uuid(),
  rut_contraparte text,
  razon_social_contiene text,    -- ej: 'BESALCO'
  area_destino text not null,
  proyecto_id uuid references public.proyectos(id),
  prioridad int not null default 100
);

-- RLS: usuarios ven solo facturas/proyectos de sus áreas
alter table public.proyectos enable row level security;
alter table public.edps enable row level security;
alter table public.facturas_sii enable row level security;
alter table public.reglas_clasificacion enable row level security;

drop policy if exists "proyectos_por_area" on public.proyectos;
create policy "proyectos_por_area" on public.proyectos for select
  using (area = any (select unnest(areas) from public.perfiles where id = auth.uid()));

drop policy if exists "edps_por_area" on public.edps;
create policy "edps_por_area" on public.edps for select
  using (exists (select 1 from public.proyectos p join public.perfiles pf on pf.id = auth.uid()
                 where p.id = edps.proyecto_id and p.area = any (pf.areas)));

drop policy if exists "facturas_por_area" on public.facturas_sii;
create policy "facturas_por_area" on public.facturas_sii for select
  using (area is null or area = any (select unnest(areas) from public.perfiles where id = auth.uid()));

drop policy if exists "reglas_lectura" on public.reglas_clasificacion;
create policy "reglas_lectura" on public.reglas_clasificacion for select using (true);

-- Reglas de ejemplo basadas en tu operación actual:
insert into public.reglas_clasificacion (razon_social_contiene, area_destino, prioridad) values
  ('BESALCO', 'Istria', 10),
  ('EQUIPEX', 'Istria', 10),
  ('TECHINT', 'Istria', 10),
  ('WIN WATER', 'Istria', 10),
  ('VIMAN', 'Santa Rosa', 10),
  ('INGOMAR', 'Santa Rosa', 10),
  ('IMMA', 'Santa Rosa', 10),
  ('SERVICAT', 'Santa Rosa', 10),
  ('TRANSPORTE DE MINERALES', 'Proyectos', 10),
  ('PROASES', 'Proyectos', 10),
  ('INNOVATEC', 'Proyectos', 10),
  ('CONSTRUCAPITAL', 'Proyectos', 10),
  ('OLYMPO', 'Proyectos', 10)
on conflict do nothing;

-- ============================================================
-- FASE 2b · Compras por proyecto + permisos de escritura
-- ============================================================
create table if not exists public.compras_proyecto (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid references public.proyectos(id) on delete cascade,
  proveedor text not null,
  detalle text,
  fecha date,
  monto bigint not null default 0,
  factura_sii_id uuid references public.facturas_sii(id)  -- vínculo opcional con factura del SII
);
alter table public.compras_proyecto enable row level security;

drop policy if exists "compras_por_area" on public.compras_proyecto;
create policy "compras_por_area" on public.compras_proyecto for select
  using (exists (select 1 from public.proyectos p join public.perfiles pf on pf.id = auth.uid()
                 where p.id = compras_proyecto.proyecto_id and p.area = any (pf.areas)));

-- Escritura: quien tiene acceso al área puede crear/editar/eliminar
-- (proyectos, edps y compras de sus áreas)
drop policy if exists "proyectos_escribir" on public.proyectos;
create policy "proyectos_escribir" on public.proyectos for all
  using (area = any (select unnest(areas) from public.perfiles where id = auth.uid()))
  with check (area = any (select unnest(areas) from public.perfiles where id = auth.uid()));

drop policy if exists "edps_escribir" on public.edps;
create policy "edps_escribir" on public.edps for all
  using (exists (select 1 from public.proyectos p join public.perfiles pf on pf.id = auth.uid()
                 where p.id = edps.proyecto_id and p.area = any (pf.areas)))
  with check (exists (select 1 from public.proyectos p join public.perfiles pf on pf.id = auth.uid()
                 where p.id = edps.proyecto_id and p.area = any (pf.areas)));

drop policy if exists "compras_escribir" on public.compras_proyecto;
create policy "compras_escribir" on public.compras_proyecto for all
  using (exists (select 1 from public.proyectos p join public.perfiles pf on pf.id = auth.uid()
                 where p.id = compras_proyecto.proyecto_id and p.area = any (pf.areas)))
  with check (exists (select 1 from public.proyectos p join public.perfiles pf on pf.id = auth.uid()
                 where p.id = compras_proyecto.proyecto_id and p.area = any (pf.areas)));

-- ============================================================
-- FASE 3 · Órdenes de Trabajo (Santa Rosa e Istria)
-- Modelo: OT = cliente + cotización + OC + m² + preparación +
-- esquema, con ventas y costos anidados → utilidad real por OT
-- ============================================================
create table if not exists public.ordenes_trabajo (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,           -- 'OT-2026-114'
  area text not null check (area in ('Santa Rosa','Istria')),
  cliente text not null,
  cotizacion text,
  oc text,
  m2 numeric default 0,
  preparacion text,                      -- SSPC-SP6, SP10, etc.
  esquema text,                          -- esquema de pintura
  estado text not null default 'Cotizada',  -- Cotizada/En ejecución/Terminada/Facturada/Cerrada
  creado timestamptz default now()
);

create table if not exists public.ot_ventas (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid references public.ordenes_trabajo(id) on delete cascade,
  folio text,
  fecha date,
  neta bigint not null default 0,
  estado_pago text not null default 'Pendiente',  -- Pendiente/Pagado/Factoring
  factura_sii_id uuid references public.facturas_sii(id)
);

create table if not exists public.ot_costos (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid references public.ordenes_trabajo(id) on delete cascade,
  categoria text not null,               -- Materiales/Mano de obra/Gastos/Arriendo/Factoring/Transporte/Otros
  detalle text,
  fecha date,
  monto bigint not null default 0,
  factura_sii_id uuid references public.facturas_sii(id)
);

alter table public.ordenes_trabajo enable row level security;
alter table public.ot_ventas enable row level security;
alter table public.ot_costos enable row level security;

drop policy if exists "ot_por_area" on public.ordenes_trabajo;
create policy "ot_por_area" on public.ordenes_trabajo for all
  using (area = any (select unnest(areas) from public.perfiles where id = auth.uid()))
  with check (area = any (select unnest(areas) from public.perfiles where id = auth.uid()));

drop policy if exists "ot_ventas_area" on public.ot_ventas;
create policy "ot_ventas_area" on public.ot_ventas for all
  using (exists (select 1 from public.ordenes_trabajo o join public.perfiles pf on pf.id = auth.uid()
                 where o.id = ot_ventas.ot_id and o.area = any (pf.areas)))
  with check (exists (select 1 from public.ordenes_trabajo o join public.perfiles pf on pf.id = auth.uid()
                 where o.id = ot_ventas.ot_id and o.area = any (pf.areas)));

drop policy if exists "ot_costos_area" on public.ot_costos;
create policy "ot_costos_area" on public.ot_costos for all
  using (exists (select 1 from public.ordenes_trabajo o join public.perfiles pf on pf.id = auth.uid()
                 where o.id = ot_costos.ot_id and o.area = any (pf.areas)))
  with check (exists (select 1 from public.ordenes_trabajo o join public.perfiles pf on pf.id = auth.uid()
                 where o.id = ot_costos.ot_id and o.area = any (pf.areas)));

-- ============================================================
-- FASE 4 · Asistencia y Mano de Obra
-- Seguridad: los VALORES y COSTOS viven en tablas separadas
-- (valores_mo, costos_mo) que el backend solo entrega a
-- perfiles tipo 'gerencia' o 'admin'. El supervisor nunca los
-- recibe, aunque manipule la pantalla o consulte la API.
-- ============================================================

-- Tipo de rol en el perfil (gerencia / admin / jefe / supervisor)
alter table public.perfiles add column if not exists tipo text not null default 'jefe';

create or replace function public.es_gerencia()
returns boolean language sql stable as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and tipo in ('gerencia','admin'));
$$;

create table if not exists public.cargos_mo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

-- Historial de valores: nunca se edita, se inserta uno nuevo y el
-- anterior queda con activo=false. SOLO GERENCIA puede leer/escribir.
create table if not exists public.valores_mo (
  id uuid primary key default gen_random_uuid(),
  cargo_id uuid references public.cargos_mo(id),
  trabajador_id uuid,                    -- valor específico por persona (opcional)
  valor_diario bigint not null default 0,
  valor_hora bigint not null default 0,
  valor_hora_extra bigint not null default 0,
  vigente_desde date not null default current_date,
  activo boolean not null default true
);

create table if not exists public.trabajadores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cargo_id uuid references public.cargos_mo(id),
  activo boolean not null default true
);

create table if not exists public.asistencias (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  supervisor_id uuid references auth.users(id),
  area text not null,
  jornada text not null default 'Completa',
  observaciones text,
  creado timestamptz default now()
);

create table if not exists public.asistencia_trabajadores (
  asistencia_id uuid references public.asistencias(id) on delete cascade,
  trabajador_id uuid references public.trabajadores(id),
  primary key (asistencia_id, trabajador_id)
);

create table if not exists public.asistencia_ots (
  asistencia_id uuid references public.asistencias(id) on delete cascade,
  ot_referencia text not null,           -- 'OT-2026-114', 'OC 5312', etc.
  primary key (asistencia_id, ot_referencia)
);

create table if not exists public.horas_extras (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  trabajador_id uuid references public.trabajadores(id),
  horas numeric not null,
  ot_referencia text not null,
  observacion text,
  supervisor_id uuid references auth.users(id)
);

-- COSTOS calculados (snapshot congelado): SOLO GERENCIA.
create table if not exists public.costos_mo (
  id uuid primary key default gen_random_uuid(),
  origen text not null check (origen in ('asistencia','hora_extra')),
  origen_id uuid not null,
  ot_referencia text not null,
  trabajador_id uuid,
  valor_aplicado bigint not null,        -- valor vigente AL MOMENTO del registro
  monto bigint not null,                 -- lo cargado a esta OT
  fecha date not null
);

-- RLS
alter table public.cargos_mo enable row level security;
alter table public.valores_mo enable row level security;
alter table public.trabajadores enable row level security;
alter table public.asistencias enable row level security;
alter table public.asistencia_trabajadores enable row level security;
alter table public.asistencia_ots enable row level security;
alter table public.horas_extras enable row level security;
alter table public.costos_mo enable row level security;

-- Cargos y trabajadores: todos los autenticados pueden LEER (el supervisor
-- necesita la lista para registrar); solo gerencia crea/edita.
drop policy if exists "cargos_leer" on public.cargos_mo;
create policy "cargos_leer" on public.cargos_mo for select using (auth.uid() is not null);
drop policy if exists "cargos_escribir" on public.cargos_mo;
create policy "cargos_escribir" on public.cargos_mo for all using (public.es_gerencia()) with check (public.es_gerencia());

drop policy if exists "trab_leer" on public.trabajadores;
create policy "trab_leer" on public.trabajadores for select using (auth.uid() is not null);
drop policy if exists "trab_escribir" on public.trabajadores;
create policy "trab_escribir" on public.trabajadores for all using (public.es_gerencia()) with check (public.es_gerencia());

-- VALORES: solo gerencia (ni siquiera lectura para otros).
drop policy if exists "valores_solo_gerencia" on public.valores_mo;
create policy "valores_solo_gerencia" on public.valores_mo for all
  using (public.es_gerencia()) with check (public.es_gerencia());

-- COSTOS: solo gerencia.
drop policy if exists "costos_solo_gerencia" on public.costos_mo;
create policy "costos_solo_gerencia" on public.costos_mo for all
  using (public.es_gerencia()) with check (public.es_gerencia());

-- Asistencias y horas extras: el supervisor crea y ve LO SUYO; gerencia ve todo.
drop policy if exists "asis_insertar" on public.asistencias;
create policy "asis_insertar" on public.asistencias for insert
  with check (auth.uid() = supervisor_id or public.es_gerencia());
drop policy if exists "asis_leer" on public.asistencias;
create policy "asis_leer" on public.asistencias for select
  using (auth.uid() = supervisor_id or public.es_gerencia());
drop policy if exists "asis_admin" on public.asistencias;
create policy "asis_admin" on public.asistencias for update using (public.es_gerencia());
drop policy if exists "asis_borrar" on public.asistencias;
create policy "asis_borrar" on public.asistencias for delete using (public.es_gerencia());

drop policy if exists "asis_t_rw" on public.asistencia_trabajadores;
create policy "asis_t_rw" on public.asistencia_trabajadores for all
  using (exists (select 1 from public.asistencias a where a.id = asistencia_id and (a.supervisor_id = auth.uid() or public.es_gerencia())))
  with check (exists (select 1 from public.asistencias a where a.id = asistencia_id and (a.supervisor_id = auth.uid() or public.es_gerencia())));

drop policy if exists "asis_ot_rw" on public.asistencia_ots;
create policy "asis_ot_rw" on public.asistencia_ots for all
  using (exists (select 1 from public.asistencias a where a.id = asistencia_id and (a.supervisor_id = auth.uid() or public.es_gerencia())))
  with check (exists (select 1 from public.asistencias a where a.id = asistencia_id and (a.supervisor_id = auth.uid() or public.es_gerencia())));

drop policy if exists "hex_rw" on public.horas_extras;
create policy "hex_rw" on public.horas_extras for all
  using (supervisor_id = auth.uid() or public.es_gerencia())
  with check (supervisor_id = auth.uid() or public.es_gerencia());

-- Datos de prueba
insert into public.cargos_mo (nombre) values
  ('Maestro'),('Ayudante'),('Pintor'),('Granallador'),('Supervisor'),('Operador')
on conflict (nombre) do nothing;

-- Ejemplo de usuario supervisor (crea primero el usuario en Authentication):
-- insert into public.perfiles (id, nombre, rol, areas, tipo)
-- select id, 'Supervisor Planta', 'Supervisor', array['Santa Rosa'], 'supervisor'
-- from auth.users where email = 'supervisor@serein.cl'
-- on conflict (id) do update set tipo = 'supervisor';

-- ============================================================
-- FASE 5 · Gastos y Obligaciones Financieras (SOLO GERENCIA)
-- ============================================================
create table if not exists public.areas_gasto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);
insert into public.areas_gasto (nombre) values
  ('Santa Rosa'),('Istria'),('Producción / Planta'),('Proyectos'),
  ('Administración'),('Comercial'),('Finanzas'),('Gerencia'),('General empresa')
on conflict (nombre) do nothing;

create table if not exists public.gastos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('fijo','variable')),
  nombre text not null,
  categoria text,
  proveedor text,
  documento text,
  neto bigint not null default 0,
  iva bigint not null default 0,
  vencimiento date,
  frecuencia text not null default 'Única',
  estado text not null default 'Pendiente' check (estado in ('Pendiente','Pagado','Vencido','Anulado')),
  ot_referencia text,               -- si va a una OT/OC, afecta su costo
  observaciones text,
  adjunto_url text,
  creado timestamptz default now()
);

create table if not exists public.gasto_distribucion (
  id uuid primary key default gen_random_uuid(),
  gasto_id uuid references public.gastos(id) on delete cascade,
  area text not null,
  porcentaje numeric not null check (porcentaje > 0 and porcentaje <= 100)
);

-- Doble candado: trigger que valida que la distribución sume 100%
create or replace function public.validar_distribucion_100()
returns trigger language plpgsql as $$
declare total numeric;
begin
  select coalesce(sum(porcentaje),0) into total
  from public.gasto_distribucion where gasto_id = coalesce(new.gasto_id, old.gasto_id);
  if total > 100.01 then
    raise exception 'La distribución del gasto supera el 100%% (actual: %)', total;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_dist_100 on public.gasto_distribucion;
create trigger trg_dist_100 after insert or update on public.gasto_distribucion
  for each row execute function public.validar_distribucion_100();

create table if not exists public.plantillas_distribucion (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  items jsonb not null                -- [{area, pct}, ...]
);
insert into public.plantillas_distribucion (nombre, items) values
  ('Santa Rosa / Istria 50-50', '[{"area":"Santa Rosa","pct":50},{"area":"Istria","pct":50}]'),
  ('Santa Rosa / Producción 50-50', '[{"area":"Santa Rosa","pct":50},{"area":"Producción / Planta","pct":50}]'),
  ('Administración 100%', '[{"area":"Administración","pct":100}]'),
  ('General empresa', '[{"area":"General empresa","pct":100}]')
on conflict (nombre) do nothing;

create table if not exists public.obligaciones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,                 -- Crédito/Leasing/Préstamo/Fogape/Vehículo/Maquinaria/Otro
  institucion text not null,
  monto_original bigint,
  fecha_inicio date,
  fecha_termino date,
  n_cuotas int,
  valor_cuota bigint,
  dia_vencimiento int,
  tasa numeric,
  estado text not null default 'Vigente' check (estado in ('Vigente','Pagado','Vencido','Refinanciado','Terminado')),
  activo_asociado text,
  observaciones text
);

create table if not exists public.obligacion_distribucion (
  id uuid primary key default gen_random_uuid(),
  obligacion_id uuid references public.obligaciones(id) on delete cascade,
  area text not null,
  porcentaje numeric not null check (porcentaje > 0 and porcentaje <= 100)
);

create table if not exists public.cuotas (
  id uuid primary key default gen_random_uuid(),
  obligacion_id uuid references public.obligaciones(id) on delete cascade,
  numero int not null,
  vencimiento date not null,
  capital bigint,                     -- opcional: puede haber solo total
  interes bigint,
  seguro bigint,
  total bigint not null,
  estado text not null default 'Pendiente' check (estado in ('Pendiente','Pagada','Vencida')),
  fecha_pago date,
  comprobante_url text,
  unique (obligacion_id, numero)
);

-- RLS: TODO el módulo financiero es solo gerencia/admin
alter table public.areas_gasto enable row level security;
alter table public.gastos enable row level security;
alter table public.gasto_distribucion enable row level security;
alter table public.plantillas_distribucion enable row level security;
alter table public.obligaciones enable row level security;
alter table public.obligacion_distribucion enable row level security;
alter table public.cuotas enable row level security;

do $$
declare t text;
begin
  foreach t in array array['areas_gasto','gastos','gasto_distribucion','plantillas_distribucion','obligaciones','obligacion_distribucion','cuotas']
  loop
    execute format('drop policy if exists "fin_solo_gerencia" on public.%I', t);
    execute format('create policy "fin_solo_gerencia" on public.%I for all using (public.es_gerencia()) with check (public.es_gerencia())', t);
  end loop;
end $$;

-- ============================================================
-- FASE 6 · Cotizaciones
-- ============================================================
create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  fecha date not null default current_date,
  validez_dias int not null default 30,
  cliente text not null,
  area text not null,
  estado text not null default 'Borrador' check (estado in ('Borrador','Enviada','Aprobada','Rechazada','Vencida')),
  observaciones text,
  ot_id uuid references public.ordenes_trabajo(id)   -- se llena al convertir en OT
);

create table if not exists public.cotizacion_items (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid references public.cotizaciones(id) on delete cascade,
  descripcion text not null,
  unidad text not null default 'm²',
  cantidad numeric not null default 0,
  precio_unitario bigint not null default 0,
  costo_estimado_unitario bigint default 0
);

alter table public.cotizaciones enable row level security;
alter table public.cotizacion_items enable row level security;

drop policy if exists "cot_por_area" on public.cotizaciones;
create policy "cot_por_area" on public.cotizaciones for all
  using (area = any (select unnest(areas) from public.perfiles where id = auth.uid()))
  with check (area = any (select unnest(areas) from public.perfiles where id = auth.uid()));

drop policy if exists "cot_items_area" on public.cotizacion_items;
create policy "cot_items_area" on public.cotizacion_items for all
  using (exists (select 1 from public.cotizaciones ct join public.perfiles pf on pf.id = auth.uid()
                 where ct.id = cotizacion_items.cotizacion_id and ct.area = any (pf.areas)))
  with check (exists (select 1 from public.cotizaciones ct join public.perfiles pf on pf.id = auth.uid()
                 where ct.id = cotizacion_items.cotizacion_id and ct.area = any (pf.areas)));

-- ============================================================
-- FASE 7 · Avance Diario de Producción por OT
-- Nota: esta tabla NO contiene campos financieros por diseño.
-- Los m² diarios se calculan en la app (m² OT ÷ días por proceso);
-- m2_ajustado solo lo escribe gerencia.
-- ============================================================
alter table public.ordenes_trabajo add column if not exists procesos text[] not null default '{}';

create table if not exists public.avances_produccion (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  planta text not null check (planta in ('Santa Rosa','Istria')),
  supervisor_id uuid references auth.users(id),
  ot_numero text not null,
  proceso text not null,
  estado_dia text not null default 'En proceso' check (estado_dia in ('En proceso','Terminado proceso')),
  validacion text not null default 'Pendiente de revisión'
    check (validacion in ('Pendiente de revisión','Validado','Observado','Corregido','Anulado')),
  observaciones text,
  m2_ajustado numeric,          -- null = cálculo automático; solo gerencia escribe
  creado timestamptz default now(),
  unique (fecha, ot_numero, proceso)   -- anti-duplicado
);

create table if not exists public.avance_ajustes (
  id uuid primary key default gen_random_uuid(),
  avance_id uuid references public.avances_produccion(id) on delete cascade,
  usuario_id uuid references auth.users(id),
  fecha timestamptz default now(),
  valor_anterior numeric,
  valor_nuevo numeric,
  estado_anterior text,
  estado_nuevo text,
  motivo text
);

alter table public.avances_produccion enable row level security;
alter table public.avance_ajustes enable row level security;

-- Supervisor: inserta y lee SOLO su planta (según sus áreas de perfil)
drop policy if exists "avance_insertar" on public.avances_produccion;
create policy "avance_insertar" on public.avances_produccion for insert
  with check (
    public.es_gerencia() or
    (supervisor_id = auth.uid() and planta = any (select unnest(areas) from public.perfiles where id = auth.uid()))
  );

drop policy if exists "avance_leer" on public.avances_produccion;
create policy "avance_leer" on public.avances_produccion for select
  using (public.es_gerencia() or planta = any (select unnest(areas) from public.perfiles where id = auth.uid()));

-- Solo gerencia actualiza (validación y m² ajustado) y anula
drop policy if exists "avance_gerencia" on public.avances_produccion;
create policy "avance_gerencia" on public.avances_produccion for update
  using (public.es_gerencia()) with check (public.es_gerencia());
drop policy if exists "avance_borrar" on public.avances_produccion;
create policy "avance_borrar" on public.avances_produccion for delete using (public.es_gerencia());

-- Historial de ajustes: solo gerencia
drop policy if exists "ajustes_gerencia" on public.avance_ajustes;
create policy "ajustes_gerencia" on public.avance_ajustes for all
  using (public.es_gerencia()) with check (public.es_gerencia());

-- Usuario Supervisor Istria (crear primero en Authentication):
-- insert into public.perfiles (id, nombre, rol, areas, tipo)
-- select id, 'Supervisor Istria', 'Supervisor', array['Istria'], 'supervisor'
-- from auth.users where email = 'supervisor.istria@serein.cl'
-- on conflict (id) do update set areas = excluded.areas, tipo = 'supervisor';

-- ============================================================
-- FASE 8 · Compras Operativas del Supervisor
-- Seguridad clave: el MONTO vive en tabla separada
-- (compras_op_montos). El supervisor puede INSERTAR el monto
-- al registrar, pero SOLO GERENCIA puede leerlo/editarlo.
-- ============================================================
create table if not exists public.config_permisos (
  clave text primary key,
  valor boolean not null default true
);
insert into public.config_permisos (clave, valor) values
  ('supervisor_ingresa_monto', true),
  ('supervisor_ve_monto_despues', false),
  ('supervisor_edita_monto', false)
on conflict (clave) do nothing;

create table if not exists public.compras_operativas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  supervisor_id uuid references auth.users(id),
  area text not null,
  proveedor text not null,
  tipo_doc text not null default 'Factura',
  num_doc text,
  categoria text not null,
  descripcion text not null,
  cantidad text,
  unidad text,
  observaciones text,
  adjunto_url text,
  estado text not null default 'Pendiente de revisión'
    check (estado in ('Pendiente de revisión','Aprobada','Observada','Rechazada','Corregida por Gerencia','Contabilizada','Pagada')),
  obs_gerencia text,
  creado timestamptz default now()
);

create table if not exists public.compras_op_asignacion (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid references public.compras_operativas(id) on delete cascade,
  tipo text not null,                -- Área / OT-OC / Proyecto / Varias / Pendiente
  referencia text,                   -- 'Santa Rosa', 'OT-385', nombre proyecto…
  porcentaje numeric check (porcentaje > 0 and porcentaje <= 100)
);

-- MONTO en tabla separada: supervisor inserta, solo gerencia lee/edita.
-- Se guarda el NETO + si aplica IVA; el IVA (19%) y el total bruto se calculan solos.
create table if not exists public.compras_op_montos (
  compra_id uuid primary key references public.compras_operativas(id) on delete cascade,
  neto bigint not null,
  aplica_iva boolean not null default true,     -- false = boleta u otro sin IVA
  iva bigint generated always as (case when aplica_iva then round(neto * 0.19) else 0 end) stored,
  total bigint generated always as (case when aplica_iva then neto + round(neto * 0.19) else neto end) stored
);

alter table public.compras_operativas enable row level security;
alter table public.compras_op_asignacion enable row level security;
alter table public.compras_op_montos enable row level security;
alter table public.config_permisos enable row level security;

-- Compras: supervisor crea y ve las suyas (sin monto, porque el monto está en otra tabla);
-- gerencia ve y edita todas.
drop policy if exists "cop_insert" on public.compras_operativas;
create policy "cop_insert" on public.compras_operativas for insert
  with check (supervisor_id = auth.uid() or public.es_gerencia());
drop policy if exists "cop_select" on public.compras_operativas;
create policy "cop_select" on public.compras_operativas for select
  using (supervisor_id = auth.uid() or public.es_gerencia());
drop policy if exists "cop_update" on public.compras_operativas;
create policy "cop_update" on public.compras_operativas for update
  using (public.es_gerencia()) with check (public.es_gerencia());
drop policy if exists "cop_delete" on public.compras_operativas;
create policy "cop_delete" on public.compras_operativas for delete using (public.es_gerencia());

drop policy if exists "cop_asig_rw" on public.compras_op_asignacion;
create policy "cop_asig_rw" on public.compras_op_asignacion for all
  using (exists (select 1 from public.compras_operativas cc where cc.id = compra_id
                 and (cc.supervisor_id = auth.uid() or public.es_gerencia())))
  with check (exists (select 1 from public.compras_operativas cc where cc.id = compra_id
                 and (cc.supervisor_id = auth.uid() or public.es_gerencia())));

-- MONTOS: supervisor puede INSERTAR el suyo (config), pero SOLO GERENCIA lee/edita/borra
drop policy if exists "cop_monto_insert" on public.compras_op_montos;
create policy "cop_monto_insert" on public.compras_op_montos for insert
  with check (
    public.es_gerencia() or
    exists (select 1 from public.compras_operativas cc where cc.id = compra_id and cc.supervisor_id = auth.uid())
  );
drop policy if exists "cop_monto_gerencia" on public.compras_op_montos;
create policy "cop_monto_gerencia" on public.compras_op_montos for select using (public.es_gerencia());
drop policy if exists "cop_monto_edit" on public.compras_op_montos;
create policy "cop_monto_edit" on public.compras_op_montos for update using (public.es_gerencia()) with check (public.es_gerencia());
drop policy if exists "cop_monto_del" on public.compras_op_montos;
create policy "cop_monto_del" on public.compras_op_montos for delete using (public.es_gerencia());

-- Config: todos leen (la app la necesita), solo gerencia edita
drop policy if exists "cfg_leer" on public.config_permisos;
create policy "cfg_leer" on public.config_permisos for select using (auth.uid() is not null);
drop policy if exists "cfg_editar" on public.config_permisos;
create policy "cfg_editar" on public.config_permisos for update using (public.es_gerencia()) with check (public.es_gerencia());

-- ============================================================
-- FASE 9 · Fotos por OT (Supabase Storage)
-- Al conectar la BD: crear bucket 'fotos-ot' en Storage (privado).
-- ============================================================
create table if not exists public.ot_fotos (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid references public.ordenes_trabajo(id) on delete cascade,
  url text not null,                 -- ruta en el bucket fotos-ot
  etiqueta text not null default 'Proceso' check (etiqueta in ('Recepción','Proceso','Despacho','Otro')),
  fecha date not null default current_date,
  subido_por uuid references auth.users(id),
  creado timestamptz default now()
);
alter table public.ot_fotos enable row level security;

-- Misma regla de área que la OT: quien ve la OT ve (y sube) sus fotos
drop policy if exists "ot_fotos_area" on public.ot_fotos;
create policy "ot_fotos_area" on public.ot_fotos for all
  using (exists (select 1 from public.ordenes_trabajo o join public.perfiles pf on pf.id = auth.uid()
                 where o.id = ot_fotos.ot_id and (o.area = any (pf.areas) or public.es_gerencia())))
  with check (exists (select 1 from public.ordenes_trabajo o join public.perfiles pf on pf.id = auth.uid()
                 where o.id = ot_fotos.ot_id and (o.area = any (pf.areas) or public.es_gerencia())));
