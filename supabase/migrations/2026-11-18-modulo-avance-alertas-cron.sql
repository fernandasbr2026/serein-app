-- Módulo «Avance de Obra» · avisos por correo cada hora.
-- Llama a la función avance-alertas-correo con la clave de servicio guardada en
-- Vault (la misma que usa respaldo-diario). pg_cron y pg_net ya están activos.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'avance-alertas-correo') then
    perform cron.unschedule('avance-alertas-correo');
  end if;
end $$;

select cron.schedule(
  'avance-alertas-correo',
  '7 * * * *',
  $$
  select net.http_post(
    url := 'https://fyupirswsvojdswpzvjm.supabase.co/functions/v1/avance-alertas-correo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'respaldo_service_role' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

select jobname, schedule, active from cron.job where jobname in ('avance-alertas-correo', 'respaldo-diario');
