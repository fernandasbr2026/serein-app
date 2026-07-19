-- ============================================================
-- SEREIN · Migración: Módulo Organigrama Serein
-- 100% aditivo, seguro de re-correr. No toca ningún módulo existente.
-- Pega TODO este archivo en: Supabase > SQL Editor > New query > Run
-- ============================================================

begin;

-- ============================================================
-- 1) Personas del organigrama
-- Regla "un dato, una sola fuente": el COSTO por persona NO se
-- guarda aquí. Para planta (Santa Rosa/Istria) se lee en vivo de
-- trabajadores/valores_mo vía trabajador_id (ya existen, ya son
-- solo-gerencia). Para gerencia/administración, que no tiene tabla
-- estructurada de sueldo por persona, el costo manual opcional vive
-- en organigrama_costos (tabla separada, incluso más restringida
-- que esta), nunca en esta tabla.
-- ============================================================
create table if not exists public.organigrama_persona (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique,             -- identificador estable para seeds/scripts
  nombre            text not null,
  cargo             text not null,
  jefe_id           uuid references public.organigrama_persona(id) on delete set null,
  jefe_id_punteado  uuid references public.organigrama_persona(id) on delete set null,  -- doble reporte (ej. Boris -> Luis, línea punteada adicional)
  area              text not null check (area in ('Gerencia','Administración','Comercial','Proyectos','Santa Rosa','Istria')),
  tipo              text not null default 'interno' check (tipo in ('interno','externo','subcontrato','asesor_externo')),
  nivel_visual      text not null check (nivel_visual in ('gerencia_general','gerencia','jefatura','planta','supervision','maestro','ayudante','externo')),
  orden             int not null default 0,
  trabajador_id     uuid references public.trabajadores(id),   -- link opcional a la MO estructurada (planta)
  activo            boolean not null default true,
  creado            timestamptz default now()
);
create index if not exists idx_organigrama_persona_jefe on public.organigrama_persona(jefe_id);

-- Banda de flujo de trabajo (visualmente separada de la jerarquía)
create table if not exists public.organigrama_flujo (
  id             uuid primary key default gen_random_uuid(),
  orden          int not null unique,
  persona_id     uuid references public.organigrama_persona(id) on delete set null,
  texto          text,     -- nombre a mostrar si el paso no corresponde a una sola persona (ej. "Jocelyn / Daniel")
  subtexto       text,     -- descripción del rol en este paso
  etiqueta_flecha text     -- etiqueta de la flecha que ENTRA a este paso (null en el primer paso)
);

-- Costo mensual manual, SOLO para personas sin tabla estructurada
-- (gerencia/administración). Tabla separada y más restringida que
-- organigrama_persona, mismo patrón que compras_op_montos: el dato
-- sensible vive aparte y solo gerencia puede siquiera leerlo.
create table if not exists public.organigrama_costos (
  persona_id   uuid primary key references public.organigrama_persona(id) on delete cascade,
  costo_manual bigint,
  updated_at   timestamptz default now()
);

-- ============================================================
-- 2) RLS
-- Estructura (nombres/cargos/jerarquía): cualquier autenticado LEE;
-- solo Gerencia edita. Costos: SOLO Gerencia lee y edita (ni
-- siquiera lectura para el resto, igual que valores_mo/compras_op_montos).
-- ============================================================
alter table public.organigrama_persona enable row level security;
alter table public.organigrama_flujo enable row level security;
alter table public.organigrama_costos enable row level security;

drop policy if exists "organigrama_leer" on public.organigrama_persona;
create policy "organigrama_leer" on public.organigrama_persona for select using (auth.uid() is not null);
drop policy if exists "organigrama_escribir" on public.organigrama_persona;
create policy "organigrama_escribir" on public.organigrama_persona for all
  using (public.es_gerencia()) with check (public.es_gerencia());

drop policy if exists "organigrama_flujo_leer" on public.organigrama_flujo;
create policy "organigrama_flujo_leer" on public.organigrama_flujo for select using (auth.uid() is not null);
drop policy if exists "organigrama_flujo_escribir" on public.organigrama_flujo;
create policy "organigrama_flujo_escribir" on public.organigrama_flujo for all
  using (public.es_gerencia()) with check (public.es_gerencia());

drop policy if exists "organigrama_costos_solo_gerencia" on public.organigrama_costos;
create policy "organigrama_costos_solo_gerencia" on public.organigrama_costos for all
  using (public.es_gerencia()) with check (public.es_gerencia());

commit;

-- ============================================================
-- 3) Seed: 20 colaboradores + 3 subcontratos + 3 asesores externos
-- ============================================================
insert into public.organigrama_persona (slug, nombre, cargo, area, tipo, nivel_visual, orden) values
  ('luis-soto', 'Luis Soto', 'Gerente General', 'Gerencia', 'interno', 'gerencia_general', 1)
on conflict (slug) do nothing;

insert into public.organigrama_persona (slug, nombre, cargo, area, tipo, nivel_visual, orden, jefe_id) values
  ('fernanda-soto', 'Fernanda Soto', 'Gerente Administrativa', 'Administración', 'interno', 'gerencia', 1, (select id from public.organigrama_persona where slug = 'luis-soto')),
  ('mario-vidal', 'Mario Vidal', 'Gerente de Proyectos', 'Proyectos', 'interno', 'gerencia', 2, (select id from public.organigrama_persona where slug = 'luis-soto')),
  ('carolina-marillanca', 'Carolina Marillanca', 'Gerente Comercial', 'Comercial', 'interno', 'gerencia', 3, (select id from public.organigrama_persona where slug = 'luis-soto'))
on conflict (slug) do nothing;

insert into public.organigrama_persona (slug, nombre, cargo, area, tipo, nivel_visual, orden, jefe_id) values
  ('codipal', 'Codipal', 'Subcontrato', 'Proyectos', 'subcontrato', 'externo', 1, (select id from public.organigrama_persona where slug = 'mario-vidal')),
  ('construcciones-cisterna', 'Construcciones Cisterna', 'Subcontrato', 'Proyectos', 'subcontrato', 'externo', 2, (select id from public.organigrama_persona where slug = 'mario-vidal')),
  ('ingenieria-vym', 'Ingeniería VYM', 'Subcontrato', 'Proyectos', 'subcontrato', 'externo', 3, (select id from public.organigrama_persona where slug = 'mario-vidal'))
on conflict (slug) do nothing;

-- Boris: jefe directo Carolina + línea punteada adicional a Luis (doble reporte, confirmado)
insert into public.organigrama_persona (slug, nombre, cargo, area, tipo, nivel_visual, orden, jefe_id, jefe_id_punteado) values
  ('boris-gomez', 'Boris Gómez', 'Jefe de Producción', 'Comercial', 'interno', 'jefatura', 1,
    (select id from public.organigrama_persona where slug = 'carolina-marillanca'),
    (select id from public.organigrama_persona where slug = 'luis-soto'))
on conflict (slug) do nothing;

-- Planta Santa Rosa (8)
insert into public.organigrama_persona (slug, nombre, cargo, area, tipo, nivel_visual, orden, jefe_id) values
  ('jocelyn-gutierrez', 'Jocelyn Gutiérrez', 'Supervisor', 'Santa Rosa', 'interno', 'supervision', 1, (select id from public.organigrama_persona where slug = 'boris-gomez')),
  ('yoel-alvarado', 'Yoel Alvarado', 'Maestro Granallador', 'Santa Rosa', 'interno', 'maestro', 2, (select id from public.organigrama_persona where slug = 'boris-gomez')),
  ('francisco-himoto', 'Francisco Himoto', 'Maestro Pintor', 'Santa Rosa', 'interno', 'maestro', 3, (select id from public.organigrama_persona where slug = 'boris-gomez')),
  ('gilbert-gomez', 'Gilbert Gómez', 'Ayudante avanzado', 'Santa Rosa', 'interno', 'ayudante', 4, (select id from public.organigrama_persona where slug = 'boris-gomez')),
  ('gabriel-morillo', 'Gabriel Morillo', 'Ayudante', 'Santa Rosa', 'interno', 'ayudante', 5, (select id from public.organigrama_persona where slug = 'boris-gomez')),
  ('jose-armador', 'José Armador', 'Maestro externo', 'Santa Rosa', 'externo', 'externo', 6, (select id from public.organigrama_persona where slug = 'boris-gomez')),
  ('jose-hijo-gabriel', 'José (hijo Gabriel)', 'Ayudante externo', 'Santa Rosa', 'externo', 'externo', 7, (select id from public.organigrama_persona where slug = 'boris-gomez')),
  ('rambo', 'Rambo', 'Ayudante externo', 'Santa Rosa', 'externo', 'externo', 8, (select id from public.organigrama_persona where slug = 'boris-gomez'))
on conflict (slug) do nothing;

-- Planta Istria (7)
insert into public.organigrama_persona (slug, nombre, cargo, area, tipo, nivel_visual, orden, jefe_id) values
  ('daniel-matos', 'Daniel Matos', 'Supervisor', 'Istria', 'interno', 'supervision', 1, (select id from public.organigrama_persona where slug = 'boris-gomez')),
  ('dario-daza', 'Darío Daza', 'Maestro Granallador', 'Istria', 'interno', 'maestro', 2, (select id from public.organigrama_persona where slug = 'boris-gomez')),
  ('jairo-lara', 'Jairo Lara', 'Maestro Pintor', 'Istria', 'interno', 'maestro', 3, (select id from public.organigrama_persona where slug = 'boris-gomez')),
  ('ronny-alvarado', 'Ronny Alvarado', 'Maestro Pintor', 'Istria', 'interno', 'maestro', 4, (select id from public.organigrama_persona where slug = 'boris-gomez')),
  ('anthony-acevedo', 'Anthony Acevedo', 'Ayudante avanzado', 'Istria', 'interno', 'ayudante', 5, (select id from public.organigrama_persona where slug = 'boris-gomez')),
  ('raul-bravo', 'Raúl Bravo', 'Ayudante avanzado', 'Istria', 'interno', 'ayudante', 6, (select id from public.organigrama_persona where slug = 'boris-gomez')),
  ('henrry-lopez', 'Henrry López', 'Ayudante', 'Istria', 'interno', 'ayudante', 7, (select id from public.organigrama_persona where slug = 'boris-gomez'))
on conflict (slug) do nothing;

-- Asesores externos (staff de Gerencia General, línea punteada, NO cuelgan de un área)
insert into public.organigrama_persona (slug, nombre, cargo, area, tipo, nivel_visual, orden, jefe_id) values
  ('yazmin-chocair', 'Yazmín Chocair', 'Contadora', 'Gerencia', 'asesor_externo', 'externo', 1, (select id from public.organigrama_persona where slug = 'luis-soto')),
  ('gabriel-quintanilla', 'Gabriel Quintanilla', 'Prevención de Riesgos', 'Gerencia', 'asesor_externo', 'externo', 2, (select id from public.organigrama_persona where slug = 'luis-soto')),
  ('claudio-abogado', 'Claudio', 'Abogado', 'Gerencia', 'asesor_externo', 'externo', 3, (select id from public.organigrama_persona where slug = 'luis-soto'))
on conflict (slug) do nothing;

-- Banda de flujo de trabajo (separada de la jerarquía)
insert into public.organigrama_flujo (orden, persona_id, texto, subtexto, etiqueta_flecha) values
  (1, (select id from public.organigrama_persona where slug = 'carolina-marillanca'), null, 'Cotiza y aprueba', null),
  (2, (select id from public.organigrama_persona where slug = 'boris-gomez'), null, 'Recibe la OT · Producción', 'OT'),
  (3, null, 'Jocelyn / Daniel', 'Organizan el taller', 'OT')
on conflict (orden) do nothing;
