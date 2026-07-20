-- ============================================================
-- SEREIN · Migración: columnas faltantes en libro_compras / libro_ventas
-- ------------------------------------------------------------
-- Hallazgo: LibroComprasModule.jsx y LibroVentasModule.jsx ya
-- intentaban leer/escribir varios campos (area, estado_pago,
-- factoring, cc_ot, oculto, etc.) que NUNCA existieron como columna
-- real — los update() fallaban en silencio (catch vacío), así que
-- esas asignaciones jamás se guardaban. 100% aditivo, no borra nada.
-- ============================================================

begin;

alter table public.libro_compras add column if not exists cc_ot text;
alter table public.libro_compras add column if not exists factoring text;
alter table public.libro_compras add column if not exists dias int;
alter table public.libro_compras add column if not exists dias_mora int;
alter table public.libro_compras add column if not exists vencimiento date;
alter table public.libro_compras add column if not exists oculto boolean not null default false;

alter table public.libro_ventas add column if not exists area text;
alter table public.libro_ventas add column if not exists cc_ot text;
alter table public.libro_ventas add column if not exists estado_pago text not null default 'Pendiente';
alter table public.libro_ventas add column if not exists factoring_id text;
alter table public.libro_ventas add column if not exists dias int;
alter table public.libro_ventas add column if not exists dias_mora int;
alter table public.libro_ventas add column if not exists fecha_pago date;
alter table public.libro_ventas add column if not exists banco text;
alter table public.libro_ventas add column if not exists anula_folio text;
alter table public.libro_ventas add column if not exists oculto boolean not null default false;

commit;
