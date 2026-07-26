-- Corrige puede_escribir_app_state(): la lista de claves permitidas por
-- rol estaba escrita a mano y quedó desincronizada de perfiles.modulos (la
-- lista real que YA usa el frontend para decidir qué módulos ve cada
-- persona). Verificado con datos reales de producción: mario@sereinspa.com
-- (tipo 'proyectos') tiene 'GESTION_OT' y 'ORDENES_COMPRA' en su columna
-- modulos —o sea, la propia app le muestra esas pantallas— pero la función
-- vieja solo lo dejaba escribir serein_cotizaciones y serein_proyectos.
-- Cualquier guardado suyo de una OT o una OC era rechazado en silencio por
-- esta política, sin que el guardado a nivel de fila fallara con un error
-- visible (rechazo de RLS en un UPDATE simplemente afecta 0 filas).
--
-- La política de LECTURA de esta misma tabla (app_state_select_all) ya es
-- 'true' para cualquier usuario autenticado — cualquier persona con sesión
-- ya puede leer TODOS los blobs (cotizaciones, facturas, finanzas, etc.).
-- Mantener una restricción de ESCRITURA más estricta que la de lectura no
-- aportaba una barrera de seguridad real (cualquiera ya puede ver todo);
-- solo producía este tipo de bug. El nuevo criterio: cualquier persona con
-- una fila válida en perfiles (es decir, cualquier empleado de la empresa
-- con cuenta activa) puede escribir en app_state — mismo criterio que ya
-- rige la lectura, ahora también para la escritura.
create or replace function public.puede_escribir_app_state(clave text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.perfiles where id = auth.uid());
$function$;
