-- ============================================================
-- SEREIN · Amnistía general de lápidas de los dos borrados masivos (2026-11-13)
-- ============================================================
-- Al comparar producción con el respaldo del 12-nov se vio que el borrado masivo
-- del 2026-11-12 17:46 UTC no afectó solo a las cotizaciones: también vació
-- serein_pp (órdenes de compra: 161 → 2), serein_proyectos (16 → 0) y
-- serein_clientes (40 → 4). Las lápidas de esos registros quedaron en
-- serein_lapidas con la hora exacta de los dos eventos (2026-11-09 13:53 UTC y
-- 2026-11-12 17:46 UTC). Esta migración reemplaza la amnistía (que solo cubría
-- cotizaciones) por una general: toda lápida, de cualquier bloque, cuya marca de
-- tiempo caiga dentro de esos dos minutos se descarta, en cada guardado y una vez
-- de inmediato. Un borrado legítimo hecho justo en esos minutos es improbable.
-- El resto del trigger (historial + freno) queda igual.
-- ============================================================

create or replace function public.serein_lapida_amnistiada(ts numeric)
returns boolean language sql immutable as $$
  select ts between 1794232380000 and 1794232440000   -- 2026-11-09 13:53 UTC
      or ts between 1794505560000 and 1794505620000   -- 2026-11-12 17:46 UTC
$$;

create or replace function public.serein_limpiar_lapidas(v jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(e.key, coalesce(
           (select jsonb_object_agg(l.key, l.value) from jsonb_each(e.value) l
             where not (jsonb_typeof(l.value) = 'number' and serein_lapida_amnistiada((l.value)::text::numeric))
               and not (e.key = 'serein_cotizaciones' and jsonb_typeof(l.value) = 'number' and (l.value)::text::numeric < 1794513600000)),
           '{}'::jsonb)), '{}'::jsonb)
    from jsonb_each(v) e
   where jsonb_typeof(e.value) = 'object'
$$;

create or replace function public.app_state_proteger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  antes int; ahora int; ult timestamptz; encogio boolean := false;
  lap jsonb;
begin
  if OLD.value is not distinct from NEW.value then return NEW; end if;

  antes := serein_contar_registros(OLD.value);
  ahora := serein_contar_registros(NEW.value);

  -- Freno a los borrados masivos
  if antes is not null and ahora is not null and antes >= 10 and ahora < antes * 0.7 then
    insert into app_state_historial (id, value, updated_at, motivo)
      values (OLD.id, OLD.value, OLD.updated_at, 'rechazado: de ' || antes || ' a ' || ahora || ' registros');
    raise exception 'SEREIN_PROTECCION: % tenía % registros y se intentó guardar con solo %. La base rechazó el guardado para no perder datos. Recarga la página con Ctrl+F5 y vuelve a intentar.', OLD.id, antes, ahora
      using errcode = 'P0001';
  end if;

  -- Historial: una copia por hora por bloque, y siempre que pierda registros
  encogio := antes is not null and ahora is not null and ahora < antes;
  select max(guardado_en) into ult from app_state_historial where id = OLD.id;
  if encogio or ult is null or ult < now() - interval '60 minutes' then
    insert into app_state_historial (id, value, updated_at, motivo)
      values (OLD.id, OLD.value, OLD.updated_at, case when encogio then 'encogió: de ' || antes || ' a ' || ahora else 'periódico' end);
  end if;

  -- Amnistía de las lápidas de los dos borrados masivos (cualquier bloque)
  if NEW.id = 'serein_lapidas' then
    begin lap := NEW.value::jsonb; exception when others then lap := null; end;
    if lap is not null and jsonb_typeof(lap) = 'object' then
      NEW.value := serein_limpiar_lapidas(lap)::text;
    end if;
  end if;

  if random() < 0.02 then
    delete from app_state_historial where guardado_en < now() - interval '14 days';
  end if;
  return NEW;
end $$;

-- Limpieza inmediata
update public.app_state
   set value = serein_limpiar_lapidas(value::jsonb)::text, updated_at = now()
 where id = 'serein_lapidas' and value ~ '^\s*\{';

-- Verificación (solo lectura): lápidas que quedan por bloque
-- select k, count(*) from app_state s, jsonb_each(s.value::jsonb) e(k, obj), jsonb_each(e.obj) v where s.id='serein_lapidas' group by k;
