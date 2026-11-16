-- ============================================================
-- SEREIN · Restaurar OT eliminadas (2026-11-16)
-- ============================================================
-- El 2026-11-11 se puso un trigger (app_state_ot_eliminadas_no_reviven) para que
-- una sesión atrasada no pudiera "revivir" una OT que alguien había eliminado.
-- Efecto secundario: tampoco se podía deshacer un borrado hecho por error
-- (la OT-1022 de Ingomar se creó y se eliminó con 3 minutos de diferencia el
-- 13-nov y nadie podía recuperarla).
--
-- Cambio: la OT puede volver SOLO si trae una restauración explícita más nueva
-- que la eliminación (restauradaFecha > eliminadaFecha). Es lo que escribe el
-- botón «Restaurar» de la pestaña «OT eliminadas» del ERP. Una sesión atrasada
-- que solo trae la copia vieja (sin restauradaFecha) sigue sin poder revivirla.
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
  if not exists (
    select 1 from jsonb_array_elements(viejo) y where (y->>'eliminada') = 'true'
  ) then
    return NEW;
  end if;
  select jsonb_agg(
           case
             -- Estaba eliminada, llega sin la marca y SIN una restauración más nueva que la
             -- eliminación: es una copia atrasada, se vuelve a marcar.
             when (x->>'eliminada') is distinct from 'true' and v.ot is not null
                  and not (coalesce(x->>'restauradaFecha', '') > coalesce(v.ot->>'eliminadaFecha', '')) then
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
  return NEW;
end;
$$;

-- Restauración puntual pedida por Fernanda el 2026-11-16: OT-1022 (Ingomar, cotización 1022),
-- eliminada el 2026-11-13 13:55 UTC desde administracion@. Se conserva el rastro de quién y
-- cuándo la eliminó; se agrega quién y cuándo la restauró.
update public.app_state
   set value = (
     select jsonb_agg(
              case when x->>'id' = 'ot1794577974759'
                   then (x - 'eliminada' - 'eliminadaProtegida')
                        || jsonb_build_object('eliminada', false,
                                              'restauradaPor', 'administracion@sereinspa.com',
                                              'restauradaFecha', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                   else x end
              order by t.ord)
       from jsonb_array_elements(value::jsonb) with ordinality t(x, ord)
   )::text,
       updated_at = now()
 where id = 'serein_ots'
   and exists (select 1 from jsonb_array_elements(value::jsonb) y where y->>'id' = 'ot1794577974759' and (y->>'eliminada') = 'true');

-- Verificación (solo lectura)
select x->>'numero' as numero, x->>'eliminada' as eliminada, x->>'restauradaFecha' as restaurada,
       (select count(*) from app_state s2, jsonb_array_elements(s2.value::jsonb) z where s2.id='serein_ots') as total_ots
  from app_state, jsonb_array_elements(value::jsonb) x
 where id = 'serein_ots' and x->>'id' = 'ot1794577974759';
