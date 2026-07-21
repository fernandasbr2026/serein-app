-- ============================================================
-- SEREIN · Migración: Vendedores reales + seguimientos pendientes
-- 100% aditivo sobre supabase/migrations/2026-07-20-crm.sql
-- Pega TODO este archivo en: Supabase > SQL Editor > New query > Run
-- ============================================================

begin;

-- 1) Vendedores reales, en vez del <select> fijo ("Venta general" /
-- "Mario Vidal") que había en el CRM — así se puede medir desempeño
-- por persona en vez de un texto libre sin estructura.
create table if not exists public.vendedores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  activo     boolean not null default true,
  created_at timestamptz default now()
);

alter table public.vendedores enable row level security;
drop policy if exists "crm_leer_escribir" on public.vendedores;
create policy "crm_leer_escribir" on public.vendedores for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Semilla con los valores que ya existían en el <select>, más los que
-- se hayan escrito a mano en `clientes.vendedor` hasta ahora.
insert into public.vendedores (nombre)
select distinct vendedor from public.clientes where coalesce(vendedor, '') <> ''
union
select 'Venta general'
on conflict (nombre) do nothing;

-- 2) clientes.vendedor sigue existiendo (texto, no se borra — evita
-- romper nada que ya lo lea) y se agrega vendedor_id como la referencia
-- real, retro-llenada por nombre exacto.
alter table public.clientes add column if not exists vendedor_id uuid references public.vendedores(id);
update public.clientes c set vendedor_id = v.id
  from public.vendedores v
  where c.vendedor_id is null and c.vendedor = v.nombre;
create index if not exists idx_clientes_vendedor on public.clientes(vendedor_id);

-- 3) Vista de seguimientos pendientes: la próxima acción registrada en
-- la bitácora de cada cliente, para verlas TODAS juntas en vez de
-- tener que abrir ficha por ficha. Antes esto era invisible salvo que
-- alguien abriera cada cliente uno por uno.
create or replace view public.v_seguimientos_pendientes as
select distinct on (c.id)
  c.id as cliente_id, c.nombre, c.etapa, c.vendedor_id, v.nombre as vendedor_nombre,
  i.proxima_accion, i.proxima_fecha,
  (current_date - i.proxima_fecha) as dias_vencido
from public.clientes c
join public.crm_interacciones i on i.cliente_id = c.id
left join public.vendedores v on v.id = c.vendedor_id
where i.proxima_fecha is not null and c.etapa not in ('Cliente', 'Descartado')
order by c.id, i.fecha desc;

-- 4) Días sin contacto por cliente activo (para detectar a quién no se
-- le ha escrito hace tiempo, más allá de si tiene una próxima_accion
-- agendada o no).
create or replace view public.v_clientes_sin_contacto as
select
  c.id, c.nombre, c.etapa, c.vendedor_id, v.nombre as vendedor_nombre,
  max(i.fecha) as ultimo_contacto,
  extract(day from now() - max(i.fecha))::int as dias_sin_contacto
from public.clientes c
left join public.crm_interacciones i on i.cliente_id = c.id
left join public.vendedores v on v.id = c.vendedor_id
where c.etapa not in ('Descartado')
group by c.id, c.nombre, c.etapa, c.vendedor_id, v.nombre;

-- 5) Leaderboard de vendedores: leads asignados, convertidos, tasa de
-- conversión y revenue cerrado (oportunidades Aprobadas).
create or replace view public.v_vendedor_stats as
select
  vd.id as vendedor_id, vd.nombre,
  count(distinct c.id) filter (where c.etapa <> 'Descartado') as leads_asignados,
  count(distinct c.id) filter (where c.etapa = 'Cliente') as convertidos,
  round(
    100.0 * count(distinct c.id) filter (where c.etapa = 'Cliente')
    / nullif(count(distinct c.id) filter (where c.etapa <> 'Descartado'), 0)
  , 1) as tasa_conversion,
  coalesce(sum(o.monto_estimado) filter (where o.etapa = 'Aprobada'), 0) as revenue_cerrado,
  count(distinct i.id) as interacciones_totales
from public.vendedores vd
left join public.clientes c on c.vendedor_id = vd.id
left join public.crm_oportunidades o on o.cliente_id = c.id
left join public.crm_interacciones i on i.cliente_id = c.id
group by vd.id, vd.nombre;

commit;
