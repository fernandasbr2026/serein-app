-- ============================================================
-- SEREIN · Migración: Módulo CRM (leads + clientes + seguimiento)
-- 100% aditivo. No borra ni toca ContactosModule / app_state.
-- Pega TODO este archivo en: Supabase > SQL Editor > New query > Run
-- ============================================================

begin;

-- ============================================================
-- 1) Clientes / Leads — UNA sola tabla, con etapa. Convertir un
-- lead en cliente es solo cambiar `etapa`, sin migrar datos.
-- ============================================================
create table if not exists public.clientes (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,           -- id original en el blob de Contactos, para trazabilidad
  rut         text,
  nombre      text not null,
  giro        text,
  direccion   text,
  comuna      text,
  telefono    text,
  correo      text,
  whatsapp_id text unique,           -- número E.164, para matchear mensajes entrantes
  etapa       text not null default 'Lead nuevo'
    check (etapa in ('Lead nuevo','Contactado','Calificado','Cliente','Descartado')),
  origen      text,                  -- 'WhatsApp' | 'Referido' | 'Web' | 'Llamada' | 'Importado' | otros
  vendedor    text,
  estado      text not null default 'Activo' check (estado in ('Activo','Inactivo')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_clientes_whatsapp on public.clientes(whatsapp_id);
create index if not exists idx_clientes_etapa on public.clientes(etapa);

-- Personas de contacto dentro de un cliente/lead (hoy no existe: solo
-- había un nombre de empresa, nunca una persona con cargo/teléfono).
create table if not exists public.crm_contactos_persona (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid references public.clientes(id) on delete cascade,
  nombre      text not null,
  cargo       text,
  telefono    text,
  correo      text,
  es_principal boolean not null default false,
  created_at  timestamptz default now()
);

-- Bitácora de seguimiento: llamadas, reuniones, correos, notas,
-- mensajes de WhatsApp. Concepto 100% nuevo — no existía nada así.
create table if not exists public.crm_interacciones (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid references public.clientes(id) on delete cascade,
  tipo           text not null check (tipo in ('whatsapp','llamada','reunion','correo','nota','visita')),
  direccion      text check (direccion in ('entrante','saliente')),  -- null = no aplica (ej. nota)
  fecha          timestamptz not null default now(),
  autor          uuid references auth.users(id),
  texto          text,
  proxima_accion text,
  proxima_fecha  date,
  whatsapp_message_id text unique,   -- evita duplicar mensajes reenviados por el webhook
  created_at     timestamptz default now()
);
create index if not exists idx_interacciones_cliente on public.crm_interacciones(cliente_id, fecha desc);

-- Pipeline de oportunidades — reutiliza los mismos estados que ya usan
-- las cotizaciones (CotizacionesModule.jsx ESTADOS_COT) en vez de
-- inventar un pipeline nuevo.
create table if not exists public.crm_oportunidades (
  id                    uuid primary key default gen_random_uuid(),
  cliente_id            uuid references public.clientes(id) on delete cascade,
  nombre                text not null,        -- obra / proyecto / motivo de la oportunidad
  etapa                 text not null default 'Alta probabilidad de cierre'
    check (etapa in ('Alta probabilidad de cierre','Baja probabilidad de cierre','Aprobada','Rechazada','Otro')),
  monto_estimado        bigint,
  cotizacion_folio      text,                 -- link opcional al folio de una cotización real
  fecha_cierre_estimada date,
  motivo_perdida        text,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);
create index if not exists idx_oportunidades_cliente on public.crm_oportunidades(cliente_id);

-- ============================================================
-- 2) RLS — mismo criterio abierto que ya usa Contactos hoy
-- (cualquier autenticado lee/escribe; el equipo comercial completo
-- necesita poder cargar leads e interacciones, no solo Gerencia).
-- ============================================================
alter table public.clientes enable row level security;
alter table public.crm_contactos_persona enable row level security;
alter table public.crm_interacciones enable row level security;
alter table public.crm_oportunidades enable row level security;

do $$
declare t text;
begin
  foreach t in array array['clientes','crm_contactos_persona','crm_interacciones','crm_oportunidades']
  loop
    execute format('drop policy if exists "crm_leer_escribir" on public.%I', t);
    execute format('create policy "crm_leer_escribir" on public.%I for all using (auth.uid() is not null) with check (auth.uid() is not null)', t);
  end loop;
end $$;

-- El webhook de WhatsApp (Edge Function, service_role) no pasa por
-- RLS de todas formas, así que no necesita política aparte.

commit;

-- ============================================================
-- 3) Seed: migra los clientes reales ya existentes en Contactos
-- (app_state 'serein_contactos' -> .clientes), como etapa 'Cliente'
-- (ya son clientes facturados, no leads nuevos).
-- ============================================================
insert into public.clientes (legacy_id, rut, nombre, giro, direccion, comuna, vendedor, estado, etapa, origen)
select
  c->>'id',
  nullif(c->>'rut', ''),
  c->>'nombre',
  nullif(c->>'giro', ''),
  nullif(c->>'direccion', ''),
  nullif(c->>'comuna', ''),
  nullif(c->>'vendedor', ''),
  coalesce(nullif(c->>'estado', ''), 'Activo'),
  'Cliente',
  'Importado'
from public.app_state, jsonb_array_elements((value::jsonb)->'clientes') as c
where id = 'serein_contactos' and coalesce(c->>'nombre', '') <> ''
on conflict (legacy_id) do nothing;
