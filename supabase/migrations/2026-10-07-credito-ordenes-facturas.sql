-- Módulo de Crédito, etapa 4: órdenes de compra y facturas de cada cliente, para
-- calcular solos la deuda vigente y el cupo, y bloquear la línea cuando una factura
-- se pasa del plazo. Spec: Modulo_Credito_serein-app.pdf (tablas ordenes_compra y
-- facturas, con prefijo credito_ para no chocar con las de la app).
--
-- Mismo criterio que la migración del módulo: RLS con es_gerencia_o_admin() (solo
-- Gerencia y Admin ven y escriben), aditivo e idempotente (se puede correr más de una vez).

create table if not exists public.credito_ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.credito_clientes(id) on delete cascade,
  numero_oc text,
  descripcion text,
  fecha date not null default current_date,
  monto_neto numeric not null default 0,
  -- Condiciones que calculó el módulo al registrar la OC (anticipo, crédito, estados de pago).
  condicion_pago text,
  anticipo numeric not null default 0,
  a_credito numeric not null default 0,
  estados_pago jsonb,
  -- "pagada" suma un trabajo pagado al cliente (el crédito aplica desde el segundo trabajo).
  estado text not null default 'vigente' check (estado in ('vigente', 'pagada', 'anulada')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table if not exists public.credito_facturas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.credito_clientes(id) on delete cascade,
  oc_id uuid references public.credito_ordenes_compra(id) on delete set null,
  numero text,
  monto_bruto numeric not null default 0,
  fecha_emision date not null default current_date,
  fecha_vencimiento date,
  fecha_pago date,
  -- La app escribe pendiente/pagada; "vencida" se calcula al leer (pendiente con vencimiento pasado).
  estado text not null default 'pendiente' check (estado in ('pendiente', 'pagada', 'vencida')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index if not exists credito_oc_cliente_idx on public.credito_ordenes_compra (cliente_id, created_at desc);
create index if not exists credito_facturas_cliente_idx on public.credito_facturas (cliente_id, fecha_emision desc);

alter table public.credito_ordenes_compra enable row level security;
alter table public.credito_facturas enable row level security;

drop policy if exists "credito_oc_gerencia_admin" on public.credito_ordenes_compra;
create policy "credito_oc_gerencia_admin" on public.credito_ordenes_compra
  for all using (public.es_gerencia_o_admin()) with check (public.es_gerencia_o_admin());

drop policy if exists "credito_facturas_gerencia_admin" on public.credito_facturas;
create policy "credito_facturas_gerencia_admin" on public.credito_facturas
  for all using (public.es_gerencia_o_admin()) with check (public.es_gerencia_o_admin());

-- Verificación: debe listar las 2 tablas nuevas.
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('credito_ordenes_compra', 'credito_facturas') order by table_name;
