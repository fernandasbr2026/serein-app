-- ============================================================
-- SEREIN · Protección de app_state contra borrados masivos (2026-11-12)
-- ============================================================
-- El 2026-11-09 a las 13:53 UTC y el 2026-11-12 a las 17:46 UTC una sesión
-- subió la lista de cotizaciones (serein_cotizaciones) con muchos menos
-- registros de los que había, y la app marcó cada faltante como «borrado a
-- propósito» (lápida en serein_lapidas). Quedaron 11 de más de 200.
--
-- Esta migración agrega tres defensas en la propia base, que valen para
-- TODOS los bloques de app_state y para cualquier versión de la app:
--
--  1. app_state_historial: antes de cada cambio se guarda la versión
--     anterior del bloque (como mucho una por hora por bloque, y SIEMPRE
--     que el bloque pierda registros). Se conservan 14 días. Si algo se
--     pisa, se vuelve atrás con un UPDATE desde esta tabla, sin respaldos
--     ni proyectos nuevos.
--  2. Freno: si un bloque que tenía 10 o más registros con id se intenta
--     guardar con menos del 70 % de ellos, la base RECHAZA el guardado con
--     un error que la app muestra en pantalla («Error al guardar»). Un
--     borrado normal (una cotización, una factura) pasa sin problema.
--  3. Amnistía de lápidas: las lápidas de cotizaciones anteriores al
--     2026-11-12 20:00 UTC (las que borraron los más de 200 registros) se
--     descartan en cada guardado de serein_lapidas, así ninguna sesión
--     vieja puede volver a borrar lo restaurado.
--
-- Todo aditivo: no modifica tablas ni políticas existentes.
-- ============================================================

create table if not exists public.app_state_historial (
  n           bigserial primary key,
  id          text not null,
  value       text,
  updated_at  timestamptz,
  guardado_en timestamptz not null default now(),
  motivo      text
);
create index if not exists app_state_historial_id_idx on public.app_state_historial (id, guardado_en desc);
-- Solo se lee desde el SQL Editor (o con service_role): la app no la necesita y así no expone nada.
alter table public.app_state_historial enable row level security;
revoke all on public.app_state_historial from anon, authenticated;

-- Cuenta los registros «con id» de un bloque: un arreglo de objetos, o un objeto cuyas
-- propiedades son arreglos de objetos (serein_fin, serein_proyectos…). Devuelve null si
-- el texto no es JSON o no tiene esa forma: esos bloques no se vigilan.
create or replace function public.serein_contar_registros(v text)
returns int language plpgsql immutable as $$
declare j jsonb; n int := 0; k text;
begin
  if v is null then return null; end if;
  begin j := v::jsonb; exception when others then return null; end;
  if jsonb_typeof(j) = 'array' then
    select count(*) into n from jsonb_array_elements(j) x where jsonb_typeof(x) = 'object' and x ? 'id';
    return n;
  end if;
  if jsonb_typeof(j) = 'object' then
    for k in select key from jsonb_each(j) where jsonb_typeof(value) = 'array' loop
      n := n + (select count(*) from jsonb_array_elements(j->k) x where jsonb_typeof(x) = 'object' and x ? 'id');
    end loop;
    return n;
  end if;
  return null;
end $$;

create or replace function public.app_state_proteger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  antes int; ahora int; ult timestamptz; encogio boolean := false;
  lap jsonb; m jsonb;
begin
  if OLD.value is not distinct from NEW.value then return NEW; end if;

  antes := serein_contar_registros(OLD.value);
  ahora := serein_contar_registros(NEW.value);

  -- 2. Freno a los borrados masivos
  if antes is not null and ahora is not null and antes >= 10 and ahora < antes * 0.7 then
    insert into app_state_historial (id, value, updated_at, motivo)
      values (OLD.id, OLD.value, OLD.updated_at, 'rechazado: de ' || antes || ' a ' || ahora || ' registros');
    raise exception 'SEREIN_PROTECCION: % tenía % registros y se intentó guardar con solo %. La base rechazó el guardado para no perder datos. Recarga la página con Ctrl+F5 y vuelve a intentar.', OLD.id, antes, ahora
      using errcode = 'P0001';
  end if;

  -- 1. Historial: una copia por hora por bloque, y siempre que pierda registros
  encogio := antes is not null and ahora is not null and ahora < antes;
  select max(guardado_en) into ult from app_state_historial where id = OLD.id;
  if encogio or ult is null or ult < now() - interval '60 minutes' then
    insert into app_state_historial (id, value, updated_at, motivo)
      values (OLD.id, OLD.value, OLD.updated_at, case when encogio then 'encogió: de ' || antes || ' a ' || ahora else 'periódico' end);
  end if;

  -- 3. Amnistía de las lápidas viejas de cotizaciones
  if NEW.id = 'serein_lapidas' then
    begin lap := NEW.value::jsonb; exception when others then lap := null; end;
    if lap is not null and jsonb_typeof(lap->'serein_cotizaciones') = 'object' then
      select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into m
        from jsonb_each(lap->'serein_cotizaciones')
       where jsonb_typeof(value) = 'number' and (value)::text::numeric >= 1794513600000;
      NEW.value := (lap || jsonb_build_object('serein_cotizaciones', m))::text;
    end if;
  end if;

  -- Poda del historial (de vez en cuando, para no frenar cada guardado)
  if random() < 0.02 then
    delete from app_state_historial where guardado_en < now() - interval '14 days';
  end if;
  return NEW;
end $$;

drop trigger if exists app_state_proteger_trg on public.app_state;
create trigger app_state_proteger_trg
  before update on public.app_state
  for each row execute function public.app_state_proteger();

-- Limpieza inmediata de las lápidas viejas de cotizaciones que ya están guardadas
-- (el trigger las limpiaría en el próximo guardado; así no se espera).
update public.app_state
   set value = (
     (value::jsonb) || jsonb_build_object('serein_cotizaciones',
       coalesce((select jsonb_object_agg(key, value) from jsonb_each((value::jsonb)->'serein_cotizaciones')
                  where jsonb_typeof(value) = 'number' and (value)::text::numeric >= 1794513600000), '{}'::jsonb))
   )::text,
       updated_at = now()
 where id = 'serein_lapidas' and jsonb_typeof((value::jsonb)->'serein_cotizaciones') = 'object';

-- Verificación (solo lectura):
-- select tgname from pg_trigger where tgrelid = 'public.app_state'::regclass and not tgisinternal;
-- select count(*) from jsonb_each((select value::jsonb->'serein_cotizaciones' from app_state where id='serein_lapidas'));  -- debe dar 0
