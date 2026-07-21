-- ============================================================
-- SEREIN · Migración: Campañas publicitarias del CRM
-- 100% aditivo sobre supabase/migrations/2026-07-20-crm.sql
-- Pega TODO este archivo en: Supabase > SQL Editor > New query > Run
-- ============================================================

begin;

create table if not exists public.crm_campanas (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  canal          text not null default 'Meta Ads' check (canal in ('Meta Ads','Google Ads','Otro')),
  estado         text not null default 'Activa' check (estado in ('Activa','Pausada','Finalizada')),
  fecha_inicio   date,
  fecha_fin      date,
  presupuesto    bigint,
  gasto_real     bigint,
  notas          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- Un lead/cliente puede venir de una campaña puntual, independiente
-- del campo `origen` (que sigue siendo el canal general: WhatsApp,
-- Referido, Web, etc.). campana_id es opcional y no reemplaza origen.
alter table public.clientes
  add column if not exists campana_id uuid references public.crm_campanas(id) on delete set null;
create index if not exists idx_clientes_campana on public.clientes(campana_id);

alter table public.crm_campanas enable row level security;
drop policy if exists "crm_leer_escribir" on public.crm_campanas;
create policy "crm_leer_escribir" on public.crm_campanas for all using (auth.uid() is not null) with check (auth.uid() is not null);

commit;
