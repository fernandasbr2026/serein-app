-- ============================================================
-- SEREIN · Módulo Correos: órdenes de compra recibidas y cotizaciones enviadas
-- ============================================================
-- Aditivo: crea una tabla y un bucket nuevos, no toca nada existente.
--
-- correo_documentos: un registro por documento leído desde el correo (una
-- orden de compra que mandó un cliente, o una cotización que mandó Serein).
-- Lo escribe la Edge Function correos-ingresar (con la llave de servicio) y
-- lo lee/edita solo gerencia o admin desde el módulo Correos.

create table if not exists public.correo_documentos (
  id uuid primary key default gen_random_uuid(),
  gmail_id text not null,                      -- id del mensaje en Gmail
  adjunto text not null default '',            -- nombre del adjunto ('' si sale del cuerpo del correo)
  tipo text not null check (tipo in ('oc', 'cotizacion')),
  estado text not null default 'por_revisar' check (estado in ('por_revisar', 'confirmado', 'descartado')),
  confirmado_por text,                         -- 'auto' si cuadró solo, o el correo de quien lo confirmó
  confianza text,                              -- alta / media / baja, según la IA
  fecha_correo timestamptz,
  fecha_documento date,
  de text,
  para text,
  asunto text,
  cliente text,
  rut_cliente text,
  numero_oc text,
  nv text,
  folio_cotizacion text,                       -- folio de la cotización de Serein (en cotizaciones enviadas)
  ref_cotizacion text,                         -- cotización a la que hace referencia una orden de compra
  detalle text,
  neto numeric,
  iva numeric,
  total numeric,
  moneda text not null default 'CLP',
  notas text,
  pdf_path text,                               -- ruta en el bucket 'correos'
  datos_ia jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (gmail_id, adjunto)
);

create index if not exists correo_documentos_tipo_fecha on public.correo_documentos (tipo, fecha_documento desc);
create index if not exists correo_documentos_estado on public.correo_documentos (estado);

alter table public.correo_documentos enable row level security;

drop policy if exists "correo_documentos_gerencia_admin" on public.correo_documentos;
create policy "correo_documentos_gerencia_admin" on public.correo_documentos
  for all using (public.es_gerencia_o_admin()) with check (public.es_gerencia_o_admin());

-- PDFs de los correos: bucket privado, solo gerencia/admin (la Edge Function usa la llave de servicio, que ignora RLS)
insert into storage.buckets (id, name, public)
values ('correos', 'correos', false)
on conflict (id) do nothing;

drop policy if exists "correos_storage_gerencia_admin" on storage.objects;
create policy "correos_storage_gerencia_admin" on storage.objects
  for all using (bucket_id = 'correos' and public.es_gerencia_o_admin())
  with check (bucket_id = 'correos' and public.es_gerencia_o_admin());
