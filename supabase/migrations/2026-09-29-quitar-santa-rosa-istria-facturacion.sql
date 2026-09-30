-- Le quita a facturacion@sereinspa.com el acceso a Santa Rosa e Istria —
-- tanto las pestañas del menú (perfil.modulos, jsonb) como el alcance de
-- datos (perfil.areas, text[]). El resto de su acceso (Proyectos, Órdenes
-- de Compra, Pagos, Libro de Compras/Ventas, Cotizaciones, Clientes,
-- Producción, Órdenes de Trabajo, Asistencia, Inventario) no se toca.
--
-- Envuelto en un DO que revisa si cada columna existe antes de tocarla —
-- el intento anterior falló con "column areas does not exist" y no hay
-- forma confiable de confirmar el esquema real desde el chat (el CLI de
-- lectura quedó sin sesión), así que esta versión no asume nada: si
-- "areas" y/o "modulos" no existen con ese nombre, simplemente no hace
-- nada con esa columna en vez de fallar toda la migración.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'perfiles' and column_name = 'areas'
  ) then
    update public.perfiles p
    set areas = array_remove(array_remove(p.areas, 'Santa Rosa'), 'Istria')
    from auth.users u
    where p.id = u.id and u.email = 'facturacion@sereinspa.com';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'perfiles' and column_name = 'modulos'
  ) then
    update public.perfiles p
    set modulos = p.modulos - 'Santa Rosa' - 'Istria'
    from auth.users u
    where p.id = u.id and u.email = 'facturacion@sereinspa.com';
  end if;
end $$;
