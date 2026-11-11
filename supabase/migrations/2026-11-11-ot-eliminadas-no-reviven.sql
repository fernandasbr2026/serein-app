-- ============================================================
-- SEREIN · Candado en la base: una OT eliminada no revive
-- ============================================================
-- Las OT viajan todas juntas en el bloque `serein_ots` de app_state y
-- cada pantalla sube el bloque completo. Si una pantalla con la versión
-- anterior de la app (o una copia atrasada) sube su bloque, la OT que
-- otra persona acababa de eliminar (borrado suave: eliminada = true)
-- vuelve a quedar activa. El sincronizador nuevo ya lo evita entre
-- pantallas actualizadas; este trigger lo garantiza en la base misma,
-- sin importar qué versión tenga la pantalla que escribe.
--
-- Regla: si en el valor que YA está guardado una OT tiene eliminada =
-- true y el valor nuevo trae esa misma OT (mismo id) sin la marca, se le
-- vuelve a poner la marca (con quién y cuándo la eliminó). Nada más se
-- toca: no agrega ni quita OT, no cambia otros campos. Si el valor no es
-- un arreglo JSON válido, deja pasar la escritura tal cual.
--
-- Todo aditivo: no modifica tablas ni políticas existentes.
-- ============================================================

create or replace function public.app_state_ot_eliminadas_no_reviven()
returns trigger
language plpgsql
as $$
declare
  viejo jsonb;
  nuevo jsonb;
  res jsonb;
begin
  if NEW.id <> 'serein_ots' or OLD.value is null or NEW.value is null then
    return NEW;
  end if;
  begin
    viejo := OLD.value::jsonb;
    nuevo := NEW.value::jsonb;
  exception when others then
    return NEW;
  end;
  if jsonb_typeof(viejo) <> 'array' or jsonb_typeof(nuevo) <> 'array' then
    return NEW;
  end if;
  -- Si en lo guardado no hay ninguna OT eliminada, no hay nada que proteger
  if not exists (
    select 1 from jsonb_array_elements(viejo) y where (y->>'eliminada') = 'true'
  ) then
    return NEW;
  end if;
  select jsonb_agg(
           case
             when (x->>'eliminada') is distinct from 'true' and v.ot is not null then
               x || jsonb_build_object(
                 'eliminada', true,
                 'eliminadaPor', coalesce(v.ot->>'eliminadaPor', ''),
                 'eliminadaFecha', coalesce(v.ot->>'eliminadaFecha', ''),
                 'eliminadaProtegida', true
               )
             else x
           end
           order by t.ord)
    into res
    from jsonb_array_elements(nuevo) with ordinality t(x, ord)
    left join lateral (
      select y as ot
        from jsonb_array_elements(viejo) y
       where y->>'id' is not null and y->>'id' = x->>'id' and (y->>'eliminada') = 'true'
       limit 1
    ) v on true;
  if res is not null then
    NEW.value := res::text;
  end if;
  return NEW;
exception when others then
  -- Ante cualquier error inesperado, nunca bloquear el guardado
  return NEW;
end;
$$;

drop trigger if exists app_state_ot_eliminadas_no_reviven on public.app_state;
create trigger app_state_ot_eliminadas_no_reviven
  before update on public.app_state
  for each row
  execute function public.app_state_ot_eliminadas_no_reviven();

-- Verificación (solo lectura): debe devolver 1 fila
-- select tgname, tgenabled from pg_trigger where tgname = 'app_state_ot_eliminadas_no_reviven';
