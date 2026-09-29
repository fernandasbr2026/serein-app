-- Perfil restringido para facturacion@sereinspa.com — usuario interno (no
-- externo, no usa el mecanismo separado de Franco/Iván). Reutiliza el
-- whitelist de módulos (perfil.modulos) que ya usa el resto de los perfiles
-- restringidos: cualquier sección que NO esté en el arreglo simplemente no
-- se muestra en el menú lateral (Dashboard.jsx ya filtra con esto, no hace
-- falta tocar código).
--
-- Áreas: Santa Rosa, Istria, Proyectos (las 3 únicas que existen).
-- Secciones visibles: las pestañas Santa Rosa / Istria / Proyectos (esta
-- última es el código GESTION_PROYECTOS, no "Proyectos" a secas — así se
-- llama internamente en el menú), más Órdenes de Compra, Proveedores y
-- Pagos, Libro de Compras, Libro de Ventas, Cotizaciones, Resumen ventas
-- por cliente, Producción, Órdenes de Trabajo, Asistencia, Inventario.
--
-- No crea el usuario de Authentication (ya existe, según lo indicado) —
-- solo su fila de perfil. Es aditivo/idempotente: on conflict actualiza en
-- vez de duplicar, así se puede volver a correr sin problema si cambian
-- los módulos más adelante.
--
-- modulos es jsonb en esta base (no text[] como areas) — se arma con
-- to_jsonb() sobre el arreglo de texto para que el tipo calce.
insert into public.perfiles (id, nombre, rol, areas, modulos)
select
  id,
  'Facturación',
  'Facturación',
  array['Santa Rosa', 'Istria', 'Proyectos'],
  to_jsonb(array['Santa Rosa', 'Istria', 'GESTION_PROYECTOS', 'ORDENES_COMPRA', 'PAGOS', 'LIBRO_COMPRAS', 'LIBRO_VENTAS', 'COTIZADOR', 'CLIENTES', 'PRODUCCION', 'GESTION_OT', 'ASISTENCIA', 'INVENTARIO'])
from auth.users
where email = 'facturacion@sereinspa.com'
on conflict (id) do update set
  nombre = excluded.nombre,
  rol = excluded.rol,
  areas = excluded.areas,
  modulos = excluded.modulos;
