-- Le da a facturacion@sereinspa.com acceso a "Compras Operativas" (Registrar
-- compra y Mis compras) agregando el código COMPRAS_OP a su whitelist de
-- módulos (perfil.modulos, jsonb). No toca nada más de su acceso: ni
-- áreas, ni sin_valores, ni los demás módulos que ya tiene.
--
-- Aditivo e idempotente: si COMPRAS_OP ya está en la lista no lo duplica,
-- y si modulos está vacío (null) no inventa una lista que le quitaría el
-- resto de sus secciones — en ese caso no hace nada (el select final lo
-- deja a la vista).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'perfiles' and column_name = 'modulos'
  ) then
    update public.perfiles p
    set modulos = p.modulos || to_jsonb(array['COMPRAS_OP'])
    from auth.users u
    where p.id = u.id
      and u.email = 'facturacion@sereinspa.com'
      and jsonb_typeof(p.modulos) = 'array'
      and not (p.modulos ? 'COMPRAS_OP');
  end if;
end $$;

-- Verificación: debe mostrar COMPRAS_OP dentro de modulos.
select u.email, p.modulos
from public.perfiles p
join auth.users u on u.id = p.id
where u.email = 'facturacion@sereinspa.com';
