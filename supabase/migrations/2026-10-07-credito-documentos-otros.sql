-- Módulo de Crédito: documentos de cualquier tipo (carga libre) y lectura guardada.
--
-- 1) "otro": un cliente puede mandar documentos que no están en la lista fija
--    (certificado de vigencia de la sociedad, E-RUT del SII, poderes, capturas del
--    sitio web, etc.). La IA los identifica y lee sola; si resulta ser uno de los 5
--    tipos conocidos, la app lo reclasifica.
-- 2) datos_extraidos: lo que leyó la IA queda guardado junto al documento, así no se
--    pierde al recargar la página ni hay que volver a leerlo.
--
-- Aditivo e idempotente: no borra ni cambia ningún documento ya cargado.

alter table public.credito_documentos drop constraint if exists credito_documentos_tipo_check;
alter table public.credito_documentos add constraint credito_documentos_tipo_check
  check (tipo in ('carpeta_tributaria', 'dicom', 'certificado_bancario', 'solicitud', 'tgr', 'otro'));

alter table public.credito_documentos add column if not exists datos_extraidos jsonb;

-- Verificación: debe listar tipo y datos_extraidos.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'credito_documentos' and column_name in ('tipo', 'datos_extraidos') order by column_name;
