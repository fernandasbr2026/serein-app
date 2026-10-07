-- Facturación ve el módulo de Asistencia (datos: quién trabajó, horas,
-- atrasos) pero NO debe ver los valores en pesos (sueldo por hora,
-- descuentos, costo de horas extras, nómina) — reutiliza el mecanismo
-- perfil.sin_valores que ya usa la app (Dashboard.jsx línea ~881: cuando
-- 'ASISTENCIA' está en esa lista, ManoObraModule.jsx oculta columnas de
-- costo/monto y las pestañas Nómina/Resumen/Costos/Informes, dejando solo
-- el registro de asistencia). No hace falta tocar código, solo el perfil.
--
-- Aditivo/seguro: revisa que la columna exista antes de tocarla, y agrega
-- 'ASISTENCIA' sin duplicar ni borrar lo que ya tuviera la lista.
-- sin_valores resultó ser jsonb (no text[] como se asumió al principio —
-- mismo caso que "modulos" en una migración anterior), por eso se arma
-- con to_jsonb()/el operador "?" en vez de array_append/unnest.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'perfiles' and column_name = 'sin_valores'
  ) then
    update public.perfiles p
    set sin_valores = case
      when coalesce(p.sin_valores, '[]'::jsonb) ? 'ASISTENCIA' then p.sin_valores
      else coalesce(p.sin_valores, '[]'::jsonb) || to_jsonb(array['ASISTENCIA'])
    end
    from auth.users u
    where p.id = u.id and u.email = 'facturacion@sereinspa.com';
  end if;
end $$;
