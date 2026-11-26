-- Módulo «Avance de Obra» · fase 6: modelo IFC real (Tekla) por OT.
-- Bucket privado avance-modelos con una carpeta por OT (<ot_id>/modelo.ifc).
-- Solo el equipo interno de la OT sube/borra; lo lee el equipo y, si el portal
-- está publicado, también el cliente de esa OT (para el visor 3D del portal).
alter table avance.ots add column if not exists ifc_path text;
alter table avance.ots add column if not exists ifc_nombre text;
alter table avance.ots add column if not exists ifc_subido_en timestamptz;

insert into storage.buckets (id, name, public, file_size_limit)
values ('avance-modelos', 'avance-modelos', false, 209715200)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- La primera carpeta de la ruta es el id de la OT: así las reglas del módulo (rol_en/es_interno) mandan también aquí.
create or replace function avance.ot_de_ruta(p_name text) returns uuid
language sql stable as $$
  select case when (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (storage.foldername(p_name))[1]::uuid else null end
$$;

drop policy if exists "avance_modelos_subir" on storage.objects;
create policy "avance_modelos_subir" on storage.objects for insert
  with check (bucket_id = 'avance-modelos' and avance.es_interno(avance.ot_de_ruta(name)));

drop policy if exists "avance_modelos_actualizar" on storage.objects;
create policy "avance_modelos_actualizar" on storage.objects for update
  using (bucket_id = 'avance-modelos' and avance.es_interno(avance.ot_de_ruta(name)));

drop policy if exists "avance_modelos_borrar" on storage.objects;
create policy "avance_modelos_borrar" on storage.objects for delete
  using (bucket_id = 'avance-modelos' and avance.es_interno(avance.ot_de_ruta(name)));

drop policy if exists "avance_modelos_leer" on storage.objects;
create policy "avance_modelos_leer" on storage.objects for select
  using (bucket_id = 'avance-modelos' and (
    avance.es_interno(avance.ot_de_ruta(name))
    or exists (select 1 from avance.ots o where o.id = avance.ot_de_ruta(name) and o.portal_publicado and avance.rol_en(o.id) = 'cliente')
  ));

select id, public, file_size_limit from storage.buckets where id = 'avance-modelos';
