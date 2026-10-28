-- ============================================================
-- Respaldo diario de la base (auditoría 2026-10-27, hallazgo D-2)
-- ============================================================
-- Qué hace (todo aditivo, no borra ni cambia datos existentes):
--   1. Activa pg_cron (tareas programadas) y pg_net (llamadas HTTP desde la base).
--   2. Crea el bucket PRIVADO `respaldos` (solo la clave de servicio lo lee).
--   3. Crea la función `respaldo_tablas()` que lista las tablas públicas; solo la
--      puede ejecutar la clave de servicio (así la Edge Function reconoce al cron).
--   4. Guarda la clave de servicio en la bóveda (Vault) y programa la llamada
--      diaria a la Edge Function `respaldo-diario` a las 06:30 de Chile.
--   5. Lanza el primer respaldo de inmediato.
--
-- ANTES DE CORRER: reemplaza PEGA_AQUI_LA_CLAVE_DE_SERVICIO (una sola vez, abajo)
-- por la clave «service_role» de Project Settings > API Keys > Legacy API keys.
-- Esa clave nunca sale de la base: queda cifrada en la bóveda.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

insert into storage.buckets (id, name, public)
values ('respaldos', 'respaldos', false)
on conflict (id) do nothing;

-- Lista de tablas a respaldar. `security definer` para leer information_schema sin
-- depender del rol; se le quita el permiso a todos salvo al servicio.
create or replace function public.respaldo_tablas()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(table_name::text order by table_name), '{}')
  from information_schema.tables
  where table_schema = 'public'
    and table_type = 'BASE TABLE'
    and table_name not like 'app_state_backup%';
$$;
revoke all on function public.respaldo_tablas() from public;
revoke all on function public.respaldo_tablas() from anon;
revoke all on function public.respaldo_tablas() from authenticated;

-- Clave de servicio en la bóveda (si ya existe con ese nombre, se actualiza).
do $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'respaldo_service_role' limit 1;
  if v_id is null then
    perform vault.create_secret('PEGA_AQUI_LA_CLAVE_DE_SERVICIO', 'respaldo_service_role', 'Clave que usa el cron del respaldo diario');
  else
    perform vault.update_secret(v_id, 'PEGA_AQUI_LA_CLAVE_DE_SERVICIO');
  end if;
end $$;

-- Programación: 06:30 de Chile. pg_cron trabaja en UTC; Chile está en UTC-3
-- (horario de verano) o UTC-4 (invierno), así que 09:30 UTC = 06:30 / 05:30 local.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'respaldo-diario') then
    perform cron.unschedule('respaldo-diario');
  end if;
end $$;

select cron.schedule(
  'respaldo-diario',
  '30 9 * * *',
  $$
  select net.http_post(
    url := 'https://fyupirswsvojdswpzvjm.supabase.co/functions/v1/respaldo-diario',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'respaldo_service_role' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);

-- Primer respaldo ahora mismo (tarda 1-2 minutos en aparecer en Storage > respaldos).
select net.http_post(
  url := 'https://fyupirswsvojdswpzvjm.supabase.co/functions/v1/respaldo-diario',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'respaldo_service_role' limit 1)
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 300000
) as peticion_enviada;

-- ============================================================
-- Para comprobar (correr 2 minutos después):
--   select name, created_at, (metadata->>'size')::bigint as bytes
--   from storage.objects where bucket_id = 'respaldos' order by created_at desc limit 20;
-- Debe aparecer una carpeta con la fecha de hoy, un .json.gz por tabla y resumen.json.
-- Ver la programación:  select jobname, schedule, active from cron.job;
-- Ver las últimas corridas:  select * from cron.job_run_details order by start_time desc limit 5;
-- ============================================================
