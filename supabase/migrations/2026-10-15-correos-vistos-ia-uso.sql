-- ============================================================
-- SEREIN · Control del consumo de IA en el módulo Correos
-- ============================================================
-- Contexto (auditoría del 15-10-2026): el script de Google reenviaba una y
-- otra vez correos ya leídos (su memoria local cabe ~440 ids y se desborda),
-- y la función correos-ingresar llamaba a la IA ANTES de comprobar si el
-- correo ya existía. Resultado: millones de tokens leyendo los mismos PDF.
--
-- Esta migración solo AGREGA dos tablas; no borra ni modifica nada existente.
--   correos_vistos: memoria definitiva de qué correos ya se procesaron (y con
--                   qué resultado), para que ni el script ni la función
--                   vuelvan a gastar tokens en ellos.
--   ia_uso:         una fila por cada llamada a la IA (tokens reales cobrados)
--                   para poder auditar el gasto día a día desde SQL.
-- ============================================================

create table if not exists public.correos_vistos (
  gmail_id        text primary key,
  buzon           text,
  -- ok | sin_documentos | duplicado (mismos PDF que otro correo) | error (tras 3 intentos no se reintenta)
  estado          text not null default 'ok',
  intentos        integer not null default 1,
  error           text,
  adjuntos_hash   text,
  documentos      integer not null default 0,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists correos_vistos_hash on public.correos_vistos (adjuntos_hash);

-- Solo la función (service role) escribe aquí; sin políticas, nadie más la lee ni la toca desde la app.
alter table public.correos_vistos enable row level security;

-- Los correos que ya están en correo_documentos se dan por vistos desde ya,
-- así la primera pasada del script nuevo no vuelve a leer ninguno con la IA.
insert into public.correos_vistos (gmail_id, buzon, estado, intentos, documentos, creado_en)
select gmail_id, max(buzon), 'ok', 1, count(*), min(creado_en)
from public.correo_documentos
where gmail_id is not null
group by gmail_id
on conflict (gmail_id) do nothing;

create table if not exists public.ia_uso (
  id                      bigserial primary key,
  funcion                 text not null,
  modelo                  text,
  tokens_entrada          integer,
  tokens_salida           integer,
  tokens_cache_escritura  integer,
  tokens_cache_lectura    integer,
  referencia              text,
  ok                      boolean not null default true,
  error                   text,
  creado_en               timestamptz not null default now()
);
create index if not exists ia_uso_fecha on public.ia_uso (creado_en desc);
create index if not exists ia_uso_funcion on public.ia_uso (funcion, creado_en desc);

alter table public.ia_uso enable row level security;

-- Resumen listo para consultar: tokens por día y por función.
create or replace view public.ia_uso_por_dia as
select date_trunc('day', creado_en at time zone 'America/Santiago')::date as dia,
       funcion,
       count(*)                                  as llamadas,
       sum(tokens_entrada)                       as entrada,
       sum(tokens_salida)                        as salida,
       sum(coalesce(tokens_cache_lectura, 0))    as cache_leida,
       sum(coalesce(tokens_cache_escritura, 0))  as cache_escrita,
       count(*) filter (where not ok)            as con_error
from public.ia_uso
group by 1, 2
order by 1 desc, 2;
