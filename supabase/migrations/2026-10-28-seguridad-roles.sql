-- ============================================================
-- SEREIN · Seguridad por rol (auditoría 2026-10-27, hallazgos S-1, S-2,
-- S-4, S-5, S-6, S-9 y tablas «cualquier autenticado»)
-- ============================================================
-- Qué hace, en simple:
--  1. app_state deja de ser legible/escribible por cualquiera: los externos
--     (subcontrato, taller_externo) no ven nada; gerencia/admin ven todo;
--     el resto ve las claves operativas y, SOLO si su perfil tiene módulos
--     financieros/comerciales, también las claves con dinero.
--  2. perfiles y reglas_clasificacion dejan de leerse sin iniciar sesión.
--  3. Cartolas, CRM, libros de ventas/compras, fotos de OT y tablas de apoyo
--     quedan cerradas a los externos (y las cartolas solo a gerencia/admin).
--  4. El rol anónimo pierde los permisos de tabla en public.
-- No borra ni modifica datos. Todo es reversible (ver el bloque final).
-- Después de correrlo: cerrar sesión y volver a entrar con cada tipo de
-- perfil (gerencia, comercial, supervisor, Franco) y comprobar que cada uno
-- sigue viendo sus pantallas. La app ya sabe qué claves intentar subir por
-- perfil (src/permisosClaves.js es el espejo de la función de abajo).
-- ============================================================

-- ---------- 1. Quién puede leer/escribir cada clave de app_state ----------
create or replace function public.puede_leer_app_state(clave text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case
      when p.tipo in ('subcontrato', 'taller_externo') then false
      when p.tipo in ('gerencia', 'admin') then true
      -- claves operativas: OT, asistencia, compras operativas, avances, contactos, parámetros, logos
      when clave in ('serein_ots', 'serein_mo', 'serein_avances', 'serein_comprasOp', 'serein_comprasAreas',
                     'serein_configCompras', 'serein_contactos', 'serein_params', 'serein_logo', 'serein_logoIstria',
                     'serein_tiposCustom', 'serein_ver', 'serein_areaSel', 'serein_mapeosExcel', 'serein_ai',
                     'serein_lapidas')
        or clave like '\_\_serein\_%' or clave like 'cotizador\_%' then true
      -- claves con dinero (finanzas, pagos/OC, facturas, cotizaciones, proyectos, clientes, inventario…):
      -- solo perfiles con algún módulo financiero/comercial
      when p.modulos is not null and p.modulos::text ~ '(TODAS|Santa Rosa|Istria|GESTION_PROYECTOS|ORDENES_COMPRA|PAGOS|LIBRO_COMPRAS|LIBRO_VENTAS|COTIZADOR|CLIENTES|INVENTARIO|FINANZAS|CREDITO|CRM|REVISION_CONTABLE|CARTOLAS_BANCARIAS)'
        then true
      else false
    end
    from public.perfiles p where p.id = auth.uid()
  ), false);
$$;

-- Escribir = poder leer (misma regla). Se conserva el nombre que ya usa la política.
create or replace function public.puede_escribir_app_state(clave text)
returns boolean
language sql stable security definer set search_path = public
as $$ select public.puede_leer_app_state(clave); $$;

-- Perfil interno (cualquiera menos externos): para tablas de apoyo
create or replace function public.es_interno()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and tipo not in ('subcontrato', 'taller_externo'));
$$;

-- Perfil con módulos financieros/comerciales (o gerencia/admin)
create or replace function public.es_financiero()
returns boolean
language sql stable security definer set search_path = public
as $$ select public.puede_leer_app_state('serein_fin'); $$;

drop policy if exists app_state_select_all on public.app_state;
drop policy if exists app_state_select_por_rol on public.app_state;
create policy app_state_select_por_rol on public.app_state
  for select to authenticated using (public.puede_leer_app_state(id));
-- app_state_write_por_rol ya existe y usa puede_escribir_app_state(id): queda con la regla nueva.

-- ---------- 2. Nada legible sin sesión ----------
drop policy if exists leer_perfiles_todos on public.perfiles;   -- quedan leer_mi_perfil y perfiles_leer_gerencia
drop policy if exists reglas_lectura on public.reglas_clasificacion;
drop policy if exists reglas_lectura_financiero on public.reglas_clasificacion;
create policy reglas_lectura_financiero on public.reglas_clasificacion
  for select to authenticated using (public.es_financiero());

-- ---------- 3. Tablas abiertas a «cualquier autenticado» ----------
-- Cartolas bancarias: solo gerencia/admin
drop policy if exists mb_select_auth on public.movimientos_bancarios;
drop policy if exists mb_insert_auth on public.movimientos_bancarios;
drop policy if exists mb_update_auth on public.movimientos_bancarios;
drop policy if exists mb_gerencia_admin on public.movimientos_bancarios;
create policy mb_gerencia_admin on public.movimientos_bancarios
  for all to authenticated using (public.es_gerencia_o_admin()) with check (public.es_gerencia_o_admin());

-- CRM: ver/editar perfiles comerciales y financieros; borrar solo gerencia/admin
do $$
declare t text;
begin
  foreach t in array array['clientes', 'crm_contactos_persona', 'crm_interacciones', 'crm_oportunidades', 'crm_campanas', 'vendedores'] loop
    execute format('drop policy if exists crm_leer_escribir on public.%I', t);
    execute format('drop policy if exists crm_financiero_ver on public.%I', t);
    execute format('drop policy if exists crm_financiero_editar on public.%I', t);
    execute format('drop policy if exists crm_gerencia_borrar on public.%I', t);
    execute format('drop policy if exists crm_financiero_actualizar on public.%I', t);
    execute format('create policy crm_financiero_ver on public.%I for select to authenticated using (public.es_financiero())', t);
    execute format('create policy crm_financiero_editar on public.%I for insert to authenticated with check (public.es_financiero())', t);
    execute format('create policy crm_financiero_actualizar on public.%I for update to authenticated using (public.es_financiero()) with check (public.es_financiero())', t);
    execute format('create policy crm_gerencia_borrar on public.%I for delete to authenticated using (public.es_gerencia_o_admin())', t);
  end loop;
end $$;

-- Libros de ventas y compras: lectura solo perfiles financieros (la escritura sigue como estaba)
drop policy if exists lv_select_all on public.libro_ventas;
drop policy if exists lv_select_financiero on public.libro_ventas;
create policy lv_select_financiero on public.libro_ventas for select to authenticated using (public.es_financiero());
drop policy if exists lc_select_all on public.libro_compras;
drop policy if exists lc_select_financiero on public.libro_compras;
create policy lc_select_financiero on public.libro_compras for select to authenticated using (public.es_financiero());

-- proveedor_tipo: estaba en «todo para cualquier autenticado»
drop policy if exists proveedor_tipo_all on public.proveedor_tipo;
drop policy if exists proveedor_tipo_financiero on public.proveedor_tipo;
create policy proveedor_tipo_financiero on public.proveedor_tipo
  for all to authenticated using (public.es_financiero()) with check (public.es_financiero());

-- Tablas de apoyo con «auth.uid() is not null»: solo internos
do $$
declare r record;
begin
  for r in select * from (values
      ('cargos_mo', 'cargos_leer'), ('config_permisos', 'cfg_leer'), ('int_espesores', 'int_esp_leer'),
      ('int_parametros', 'int_param_leer'), ('int_productos', 'int_prod_leer'), ('organigrama_flujo', 'organigrama_flujo_leer'),
      ('organigrama_persona', 'organigrama_leer'), ('trabajadores', 'trab_leer')
    ) as v(tabla, politica) loop
    execute format('drop policy if exists %I on public.%I', r.politica, r.tabla);
    execute format('create policy %I on public.%I for select to authenticated using (public.es_interno())', r.politica, r.tabla);
  end loop;
end $$;

-- Fotos de OT: solo internos (antes cualquier autenticado, incluidos externos)
drop policy if exists fotos_ot_leer on storage.objects;
drop policy if exists fotos_ot_escribir on storage.objects;
create policy fotos_ot_leer on storage.objects for select to authenticated
  using (bucket_id = 'fotos-ot' and public.es_interno());
create policy fotos_ot_escribir on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-ot' and public.es_interno());

-- ---------- 4. El rol anónimo no toca ninguna tabla de public ----------
-- (el sitio siempre inicia sesión antes de consultar; las funciones Edge usan la service role)
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- ---------- Verificación rápida (debe dar 0 filas con «true» para public) ----------
-- select tablename, policyname, roles, qual from pg_policies where schemaname='public' and (qual = 'true' or qual like '%auth.uid() IS NOT NULL%');

-- ---------- Reversa (solo si algo se rompe) ----------
-- create policy app_state_select_all on public.app_state for select to authenticated using (true);
-- create policy leer_perfiles_todos on public.perfiles for select using (true);
-- grant select on all tables in schema public to anon;
