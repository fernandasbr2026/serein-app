-- ============================================================
-- SEREIN · Notas de crédito de proveedores en el Libro de Compras
-- ============================================================
-- Guarda a qué factura de compra corrige cada nota de crédito (tipo 61),
-- igual que libro_ventas.anula_folio. Es aditivo: no cambia ni borra nada.
alter table public.libro_compras add column if not exists anula_folio text;
