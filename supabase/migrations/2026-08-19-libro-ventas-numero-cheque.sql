-- Libro de Ventas: numero de cheque, cuando el medio de pago es "Cheque"
-- Correr en el SQL Editor de Supabase (proyecto serein). Aditivo.

alter table public.libro_ventas
  add column if not exists numero_cheque text;
