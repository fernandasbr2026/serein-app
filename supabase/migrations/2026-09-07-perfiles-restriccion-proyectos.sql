-- Permite crear un perfil restringido a proyectos puntuales (ej. un
-- usuario que solo debe ver 2 OT del modulo Proyectos, sin ningun otro
-- modulo). Ambas columnas son opcionales y no afectan a ningun perfil
-- existente: por defecto quedan en NULL/false, que es exactamente el
-- comportamiento de hoy.

-- proyectos_ids: lista de N de OT (el campo "ot" de cada proyecto, no el
-- id interno) que este perfil puede ver/editar dentro del modulo
-- Proyectos. NULL = sin restriccion (ve todos los proyectos de su area,
-- igual que hoy).
alter table perfiles add column if not exists proyectos_ids jsonb;

-- ocultar_inventario: el modulo Inventario se muestra siempre a los
-- perfiles con lista blanca de modulos (varios supervisores lo
-- necesitan aunque no lo pidan explicito). Este campo es la excepcion
-- para un perfil que de verdad no debe ver nada mas que su lista.
alter table perfiles add column if not exists ocultar_inventario boolean not null default false;
