-- Libro de Ventas: agrega Orden de Compra, NV y Medio de pago
-- Correr en el SQL Editor de Supabase (proyecto serein). Aditivo: no borra
-- ni renombra ninguna columna existente, todas las filas actuales quedan
-- con estos 3 campos en null hasta que se llenen.

alter table public.libro_ventas
  add column if not exists oc text,
  add column if not exists nv text,
  add column if not exists medio_pago text;
