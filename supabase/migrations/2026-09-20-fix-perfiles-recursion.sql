-- URGENTE: corrige "infinite recursion detected in policy for relation
-- perfiles" causado por la política perfiles_leer_gerencia (agregada en
-- 2026-09-20-portal-subcontratistas.sql para el Portal de Subcontratistas),
-- que consultaba la propia tabla perfiles desde dentro de su política RLS
-- — Postgres vuelve a evaluar esa misma política al leer perfiles desde
-- adentro, y entra en bucle. Rompía el login de CUALQUIER usuario (no solo
-- del Portal de Subcontratistas), porque perfiles se lee siempre al
-- iniciar sesión.
--
-- Se reemplaza por una función security definer (mismo patrón que ya usa
-- puede_escribir_app_state() en 2026-07-25-fix-permisos-app-state.sql):
-- corre con privilegios que saltan RLS al leer perfiles por dentro, así
-- que no hay recursión.
create or replace function public.es_gerencia_o_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and tipo in ('gerencia', 'admin'));
$$;

drop policy if exists "perfiles_leer_gerencia" on public.perfiles;
create policy "perfiles_leer_gerencia"
  on public.perfiles for select
  using (public.es_gerencia_o_admin());
