-- Deja la lista de OT permitidas para el usuario restringido de
-- Proyectos en 877 y 878 (valor original; hubo una confusion momentanea
-- con la OT 879 que ya se descarto).
update perfiles
set proyectos_ids = '["877","878"]'
where id = 'ab768e64-728e-4b7a-8e17-66e5adb6ffb4';
