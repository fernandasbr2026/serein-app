// Migración de fotos/protocolos embebidos en base64 dentro de serein_ots
// hacia Supabase Storage (bucket "fotos-ot"), dejando solo la URL en su
// lugar. Reduce el blob de OTs de ~4.2MB a unos pocos KB.
//
// CÓMO CORRERLA (tú, no Claude — requiere la service_role key que solo tú
// puedes ver en Supabase → Project Settings → API):
//
//   1) Antes de nada: correr backups/app_state_backup_2026-07-25.json ya
//      existe como respaldo. Si pasó tiempo, genera uno nuevo:
//        supabase db query --linked "select id, value, updated_at from app_state" --output-format json > backups/app_state_backup_$(date +%F).json
//   2) En Supabase Dashboard → SQL Editor, correr esto UNA vez para crear
//      el bucket (privado) y su política de acceso:
//
//        insert into storage.buckets (id, name, public) values ('fotos-ot', 'fotos-ot', false)
//        on conflict (id) do nothing;
//
//        create policy "fotos_ot_leer" on storage.objects for select
//          to authenticated using (bucket_id = 'fotos-ot');
//        create policy "fotos_ot_escribir" on storage.objects for insert
//          to authenticated with check (bucket_id = 'fotos-ot');
//
//   3) export SUPABASE_SERVICE_ROLE_KEY=... (Project Settings → API → service_role, NUNCA subir esto a git)
//      export SUPABASE_URL=https://fyupirswsvojdswpzvjm.supabase.co
//   4) node scripts/migrar-fotos-ot-a-storage.mjs --dry-run   (primero, para ver qué haría sin escribir nada)
//   5) node scripts/migrar-fotos-ot-a-storage.mjs             (recién ahí, en serio)
//
// Qué hace: recorre TODO el JSON de serein_ots recursivamente, busca
// cualquier string que empiece con "data:image/...;base64," (sin importar
// en qué campo esté anidado — fotos, protocolos.checks.fotos, partidas,
// etc.), sube ese archivo al bucket fotos-ot, y reemplaza el string por la
// URL firmada resultante. Al final escribe el JSON reducido de vuelta en
// app_state SOLO si --dry-run no está presente.

import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--dry-run')
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY como variables de entorno.')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const RE_DATA_URI = /^data:image\/([a-zA-Z0-9.+-]+);base64,/

let subidas = 0
let bytesAhorrados = 0

async function subirFoto(dataUri, contexto) {
  const m = dataUri.match(RE_DATA_URI)
  if (!m) return dataUri
  const ext = m[1].split('+')[0].replace('jpeg', 'jpg')
  const base64 = dataUri.slice(m[0].length)
  const buffer = Buffer.from(base64, 'base64')
  const nombre = `${contexto}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  subidas++
  bytesAhorrados += dataUri.length - nombre.length
  if (DRY_RUN) {
    console.log(`[dry-run] subiría ${nombre} (${(buffer.length / 1024).toFixed(0)} KB)`)
    return `PENDIENTE:${nombre}`
  }
  const { error } = await supabase.storage.from('fotos-ot').upload(nombre, buffer, { contentType: `image/${ext}`, upsert: false })
  if (error) { console.error('Error subiendo', nombre, error.message); return dataUri }
  const { data } = await supabase.storage.from('fotos-ot').createSignedUrl(nombre, 60 * 60 * 24 * 365 * 5) // 5 años
  return data?.signedUrl || dataUri
}

// Recorre cualquier estructura (objeto/array/string) reemplazando data-URIs
// de imagen por su URL subida. contexto se usa para nombrar el archivo de
// forma legible (ej. "OT-807/protocolos").
async function recorrer(nodo, contexto) {
  if (typeof nodo === 'string') {
    if (RE_DATA_URI.test(nodo)) return subirFoto(nodo, contexto)
    return nodo
  }
  if (Array.isArray(nodo)) {
    const out = []
    for (let i = 0; i < nodo.length; i++) out.push(await recorrer(nodo[i], contexto))
    return out
  }
  if (nodo && typeof nodo === 'object') {
    const out = {}
    for (const k of Object.keys(nodo)) out[k] = await recorrer(nodo[k], contexto + '/' + k)
    return out
  }
  return nodo
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN — no se escribe nada ===' : '=== EJECUCIÓN REAL ===')
  const { data, error } = await supabase.from('app_state').select('value, updated_at').eq('id', 'serein_ots').maybeSingle()
  if (error || !data) { console.error('No se pudo leer serein_ots:', error?.message); process.exit(1) }
  const ots = JSON.parse(data.value)
  const pesoAntes = data.value.length
  console.log(`${ots.length} OTs, ${(pesoAntes / 1024 / 1024).toFixed(2)} MB antes de migrar.`)

  const nuevas = []
  for (const ot of ots) {
    const numero = ot.numero || ot.id || 'sin-numero'
    nuevas.push(await recorrer(ot, `OT-${numero}`))
  }

  const nuevoValue = JSON.stringify(nuevas)
  console.log(`Fotos/imágenes encontradas y ${DRY_RUN ? 'a subir' : 'subidas'}: ${subidas}`)
  console.log(`Peso después: ${(nuevoValue.length / 1024 / 1024).toFixed(2)} MB (antes ${(pesoAntes / 1024 / 1024).toFixed(2)} MB)`)

  if (DRY_RUN) { console.log('Dry-run terminado, no se escribió nada en la base de datos.'); return }

  // Compare-and-swap simple: solo escribe si nadie tocó la fila desde que
  // la leímos, para no pisar un guardado real que haya pasado mientras
  // corría este script.
  const { data: filas, error: errUpdate } = await supabase
    .from('app_state')
    .update({ value: nuevoValue, updated_at: new Date().toISOString() })
    .eq('id', 'serein_ots')
    .eq('updated_at', data.updated_at)
    .select('id')
  if (errUpdate) { console.error('Error al escribir de vuelta:', errUpdate.message); process.exit(1) }
  if (!filas || filas.length === 0) { console.error('serein_ots cambió mientras corría el script — no se escribió nada, para no pisar un guardado real. Vuelve a correr el script.'); process.exit(1) }
  console.log('Listo. serein_ots actualizado con las fotos movidas a Storage.')
}

main().catch(e => { console.error(e); process.exit(1) })
