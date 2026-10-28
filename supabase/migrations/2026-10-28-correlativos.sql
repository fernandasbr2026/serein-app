-- ============================================================
-- Correlativos únicos de OT, OC y cotizaciones (auditoría 2026-10-27, hallazgo D-5)
-- ============================================================
-- Hasta ahora cada sesión calculaba «máximo que veo + 1» en el navegador: dos
-- personas creando a la vez podían sacar la misma OT-2026-NNN o el mismo folio.
-- Esta función entrega el siguiente número de una serie de forma atómica en la
-- base (una fila por serie, bloqueada mientras se actualiza). Se le pasa el
-- máximo que conoce la app para que la serie nunca retroceda ni repita lo que
-- ya existe en los bloques JSON. Si la base no responde, la app sigue usando el
-- cálculo local de antes (sin bloquear a nadie).
--
-- Todo aditivo: tabla nueva + función nueva. No toca datos existentes.
-- ============================================================

create table if not exists public.correlativos (
  nombre      text primary key,           -- 'ot-2026', 'oc', 'cotizacion'
  valor       bigint not null default 0,  -- último número entregado
  actualizado timestamptz not null default now()
);
alter table public.correlativos enable row level security;
-- Sin políticas: nadie lee ni escribe la tabla directamente; solo a través de la función.

create or replace function public.siguiente_correlativo(p_nombre text, p_minimo bigint default 0)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v bigint;
  piso bigint := greatest(coalesce(p_minimo, 0), 0);
begin
  -- Solo personal interno crea OT, OC y cotizaciones (es_interno() viene de la migración de roles).
  if not public.es_interno() then
    raise exception 'Sin permiso para pedir correlativos';
  end if;
  if p_nombre is null or length(trim(p_nombre)) = 0 or length(p_nombre) > 40 then
    raise exception 'Serie inválida';
  end if;
  insert into public.correlativos (nombre, valor)
  values (p_nombre, piso + 1)
  on conflict (nombre) do update
    set valor = greatest(public.correlativos.valor, piso) + 1,
        actualizado = now()
  returning valor into v;
  return v;
end;
$$;

revoke all on function public.siguiente_correlativo(text, bigint) from public;
revoke all on function public.siguiente_correlativo(text, bigint) from anon;
grant execute on function public.siguiente_correlativo(text, bigint) to authenticated;

-- Comprobar:  select public.siguiente_correlativo('prueba', 10);  -- debe dar 11, y 12 la segunda vez
--             delete from public.correlativos where nombre = 'prueba';
