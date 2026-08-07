-- ============================================================
-- SEREIN · Cartolas Bancarias (movimientos de cuenta corriente)
-- ------------------------------------------------------------
-- Tabla propia (no app_state) porque acumula muchas filas por mes
-- y necesita edicion por fila, mismo criterio ya usado en
-- libro_compras / libro_ventas / compras_sin_doc / proveedor_tipo.
--
-- Reutiliza la MISMA taxonomia de categorias de gasto que
-- LibroComprasModule.jsx (Pintura, Materiales, EPP, Telefonia,
-- Internet, Arriendo, Agua, etc.) y la tabla proveedor_tipo ya
-- existente, para que un proveedor clasificado una vez en Libro
-- de Compras se vea igual aqui.
-- ============================================================

create table if not exists public.movimientos_bancarios (
  id                bigint generated always as identity primary key,
  banco             text not null default 'Banco de Chile',
  cuenta            text,                        -- numero de cuenta corriente
  cartola_numero    int,                          -- N° de cartola impreso en el PDF
  fecha             date not null,
  glosa             text not null,                -- texto original de "Detalle de transaccion"
  descripcion       text,                         -- contraparte limpia (sin TRASPASO A:/DE:/PAGO:)
  sucursal          text,                         -- INTERNET / OF. PANAMERICAN / CENTRAL / LEASING
  tipo_movimiento   text not null check (tipo_movimiento in ('Cargo','Abono')),
  monto             numeric not null check (monto >= 0),
  categoria         text,                         -- misma taxonomia de tipos_gasto / LibroComprasModule
  clasificacion     text,                         -- 'Fijo' | 'Variable' (heredado de tipos_gasto si aplica)
  contraparte_rut   text,                         -- si se identifica (para cruzar con proveedor_tipo)
  revisar           boolean not null default false,
  nota              text,
  origen            text not null default 'pdf_banco_chile',  -- pdf_banco_chile | excel | manual
  archivo_origen    text,                         -- referencia de la cartola de origen (ej. "Cartola N5 jul-2026")
  oculto            boolean not null default false,
  created_at        timestamptz default now()
);

create index if not exists idx_mb_fecha      on public.movimientos_bancarios (fecha);
create index if not exists idx_mb_categoria  on public.movimientos_bancarios (categoria);
create index if not exists idx_mb_tipo       on public.movimientos_bancarios (tipo_movimiento);
create index if not exists idx_mb_cuenta     on public.movimientos_bancarios (cuenta);

alter table public.movimientos_bancarios enable row level security;

-- Mismo criterio ya adoptado en el resto de la app (2026-07-25-fix-permisos-app-state.sql):
-- cualquier persona con una fila valida en perfiles (empleado con cuenta activa) puede
-- leer y escribir. La restriccion real de "quien ve este modulo" es visual, en
-- Dashboard.jsx (puedeVer('CARTOLAS_BANCARIAS'), solo Gerencia) — igual que Libro de
-- Compras, Libro de Ventas, Finanzas y Pagos.
drop policy if exists mb_select_auth on public.movimientos_bancarios;
create policy mb_select_auth on public.movimientos_bancarios
  for select using (exists (select 1 from public.perfiles where id = auth.uid()));

drop policy if exists mb_insert_auth on public.movimientos_bancarios;
create policy mb_insert_auth on public.movimientos_bancarios
  for insert with check (exists (select 1 from public.perfiles where id = auth.uid()));

drop policy if exists mb_update_auth on public.movimientos_bancarios;
create policy mb_update_auth on public.movimientos_bancarios
  for update using (exists (select 1 from public.perfiles where id = auth.uid()))
  with check (exists (select 1 from public.perfiles where id = auth.uid()));
