-- Módulo «Avance de Obra» · fase 4 (modelo 3D preliminar) y fase 5 (chat maestro).
-- Geometría simple por OT para generar la estructura 3D mientras no hay IFC.
alter table avance.ots add column if not exists geometria jsonb;
-- El chat maestro deja propuestas con origen 'ia' (ya permitido por el check de propuestas).
select column_name from information_schema.columns where table_schema = 'avance' and table_name = 'ots' and column_name = 'geometria';
