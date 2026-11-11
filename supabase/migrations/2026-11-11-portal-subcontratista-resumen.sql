-- ============================================================
-- SEREIN · Portal de Subcontratistas: tablero por OT / Centro de Costo
-- ============================================================
-- El subcontratista (perfil tipo 'subcontrato') no puede leer app_state,
-- donde viven los proyectos de Serein (nombre, cliente, presupuesto por
-- centro de costo y el abonado de cada compra). Para que en su portal vea
-- de cada OT/CC cuánto tiene acordado, cuánto lleva facturado, cuánto le
-- falta por facturar y cuánto le han pagado, esta migración agrega:
--
--  1. Columna `monto_acordado` en subcontrato_asignaciones: lo que Serein
--     acordó pagarle a ese subcontratista en ese CC (neto). La fija
--     gerencia desde Proyectos → Subcontratistas. Si está vacía, el portal
--     usa el presupuesto del CC del proyecto.
--  2. Función `portal_subcontrato_resumen()` (security definer): devuelve
--     SOLO lo del usuario que llama (auth.uid()): sus OT con nombre,
--     cliente y si está cerrada; sus CC con nombre, presupuesto y monto
--     acordado; y el abonado ACTUAL de cada una de sus facturas aceptadas,
--     leído de la compra correspondiente en el proyecto (así, cuando
--     gerencia marca «Pagado» en Compras, él lo ve al momento).
--     Nunca expone compras de otros proveedores ni otros datos del blob.
--
-- Todo aditivo: no modifica tablas ni políticas existentes.
-- ============================================================

alter table public.subcontrato_asignaciones
  add column if not exists monto_acordado bigint;

create or replace function public.portal_subcontrato_resumen()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  proys jsonb := '[]'::jsonb;
  res jsonb;
begin
  if uid is null then
    return '[]'::jsonb;
  end if;

  -- El blob de proyectos; si no es JSON válido se sigue sin él.
  begin
    select value::jsonb into proys from public.app_state where id = 'serein_proyectos';
  exception when others then
    proys := '[]'::jsonb;
  end;
  if proys is null or jsonb_typeof(proys) <> 'array' then
    proys := '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(x order by x->>'ot'), '[]'::jsonb) into res
  from (
    select jsonb_build_object(
      'ot', o.ot,
      'nombre', p.j->>'nombre',
      'cliente', p.j->>'cliente',
      'cerrado', coalesce((p.j->>'cerrado') = 'true', false),
      'ccs', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'cc', a.cc,
                 'cc_nombre', coalesce(p.j->'ccNombres'->>a.cc, a.cc_nombre),
                 'presupuesto_cc', coalesce(nullif(regexp_replace(coalesce(p.j->'cc'->>a.cc, ''), '[^0-9]', '', 'g'), '')::numeric, 0),
                 'monto_acordado', a.monto_acordado
               ) order by a.cc), '[]'::jsonb)
          from public.subcontrato_asignaciones a
         where a.perfil_id = uid and a.ot = o.ot
      ),
      'pagos', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'factura_id', f.id,
                 'abonado', coalesce(nullif(regexp_replace(coalesce(m.c->>'abonado', ''), '[^0-9]', '', 'g'), '')::numeric, f.abonado)
               )), '[]'::jsonb)
          from public.facturas_subcontrato f
          left join lateral (
            -- La compra que nació de esta factura: por el enlace directo que
            -- guarda gerencia al aceptar (facturaSubcontratoId) o, para las
            -- aceptadas antes de ese enlace, por folio + RUT + CC.
            select c
              from jsonb_array_elements(coalesce(p.j->'compras', '[]'::jsonb)) c
             where (c->>'facturaSubcontratoId') = f.id::text
                or (coalesce(f.folio, '') <> '' and coalesce(c->>'folio', '') = f.folio
                    and coalesce(c->>'rut', '') = coalesce(f.rut, '') and coalesce(c->>'cc', '') = f.cc)
             order by (c->>'facturaSubcontratoId') = f.id::text desc
             limit 1
          ) m on true
         where f.perfil_id = uid and f.ot = o.ot and f.estado = 'aceptada'
      )
    ) as x
    from (select distinct ot from public.subcontrato_asignaciones where perfil_id = uid) o
    left join lateral (
      select j from jsonb_array_elements(proys) j where j->>'ot' = o.ot limit 1
    ) p on true
  ) s;

  return coalesce(res, '[]'::jsonb);
end;
$$;

revoke all on function public.portal_subcontrato_resumen() from public;
grant execute on function public.portal_subcontrato_resumen() to authenticated;

-- Verificación (solo lectura): debe devolver 1 fila con la función y 1 con la columna
-- select proname from pg_proc where proname = 'portal_subcontrato_resumen';
-- select column_name from information_schema.columns where table_name = 'subcontrato_asignaciones' and column_name = 'monto_acordado';
