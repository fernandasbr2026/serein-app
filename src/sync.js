import { supabase } from './supabase.js'

const KEY_RE = /^(serein_|__serein_|cotizador_)/
// Prefijo de las marcas "esto ya se confirmó subido a la nube", una por
// cada clave serein_*. A diferencia de lastPushed (memoria, se pierde al
// recargar la página), estas quedan en localStorage — sobreviven a un
// refresh, que es justo el momento en que más importa no perder nada.
// No calzan con KEY_RE, así que nunca se suben como si fueran datos.
const OK_PREFIX = '__pushok_'
const PROT_DESDE_PREFIX = '__protdesde_'
// Si una clave queda "protegida" (local sin confirmar subida) por más de
// esto, algo está impidiendo que el push se complete — seguir protegiendo
// para siempre aislaría a esta sesión de TODOS los cambios de sus
// compañeros (todo serein_ots es UN solo blob: una edición sin subir
// bloqueaba la llegada de cualquier cambio ajeno, aunque no tuviera nada
// que ver). Pasado este plazo se deja de proteger y se acepta la nube —
// se prefiere perder una edición atascada a quedar aislado para siempre.
const PROTECCION_MAX_MS = 90 * 1000
let lastPushed = {}

// Única puerta de entrada para aplicar un valor que viene de la nube
// (ya sea por sondeo/pullState() o por el canal en tiempo real de
// Dashboard.jsx) sobre localStorage. Antes esta protección solo vivía
// dentro de pullState() — el canal en tiempo real aplicaba lo que
// llegaba de otros usuarios DIRECTO a localStorage, sin pasar por acá,
// así que un cambio local sin subir podía borrarse al instante apenas
// cualquier otra persona guardara cualquier cosa (no hacía falta
// refrescar ni esperar el sondeo de 15s). Ahora ambos caminos pasan por
// la misma protección.
// Devuelve true si el valor quedó aplicado en localStorage, false si se
// protegió el valor local (no se aplicó).
export function aplicarSiSeguro(id, value) {
  if (!id || value == null) return false
  try {
    const local = localStorage.getItem(id)
    const confirmado = localStorage.getItem(OK_PREFIX + id)
    if (local != null && confirmado != null && local !== confirmado) {
      const protKey = PROT_DESDE_PREFIX + id
      const ahora = Date.now()
      let desde = Number(localStorage.getItem(protKey))
      if (!desde) { desde = ahora; localStorage.setItem(protKey, String(ahora)) }
      if (ahora - desde < PROTECCION_MAX_MS) {
        pushState()
        return false
      }
      console.warn(`sync: ${id} llevaba más de ${Math.round(PROTECCION_MAX_MS / 1000)}s sin poder subirse — se descarta la protección y se acepta la versión de la nube para no aislar esta sesión.`)
    }
    localStorage.removeItem(PROT_DESDE_PREFIX + id)
    localStorage.setItem(id, value)
    localStorage.setItem(OK_PREFIX + id, value)
    lastPushed[id] = value
    return true
  } catch (e) { return false }
}

export async function pullState() {
  try {
    const { data, error } = await supabase.from('app_state').select('id, value')
    if (error || !data) return { ok: false, n: 0 }
    let n = 0
    data.forEach(row => {
      if (!row.id || row.value == null) return
      if (aplicarSiSeguro(row.id, row.value)) n++
    })
    return { ok: true, n }
  } catch (e) { return { ok: false, n: 0 } }
}

let ocupado = false
let pendiente = false
// Antes: si pushState() se llamaba mientras otro push seguía en curso, esa
// llamada se descartaba en silencio (sin reintentar). Con varias escrituras
// seguidas (ej. cerrar 3 OT una tras otra) eso podía dejar cambios reales
// sin subir nunca a la nube, y si la persona refrescaba antes de que algún
// otro mecanismo (sondeo, debounce) alcanzara a reintentar, esos cambios se
// perdían. Ahora una llamada que llega mientras hay un push en curso solo
// marca "pendiente" y se reintenta automáticamente apenas termina el actual
// — así ninguna escritura queda sin intentar subirse.
export async function pushState() {
  if (ocupado) { pendiente = true; return { ok: false, encolado: true } }
  ocupado = true
  pendiente = false
  try {
    const rows = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && KEY_RE.test(k)) { const v = localStorage.getItem(k); if (v !== lastPushed[k]) rows.push({ id: k, value: v, updated_at: new Date().toISOString() }) }
    }
    if (rows.length) {
      const { error } = await supabase.from('app_state').upsert(rows, { onConflict: 'id' })
      if (error) {
        // Antes este error se descartaba en silencio — si algo bloqueaba la
        // subida (permisos, RLS, etc.) no había forma de enterarse.
        console.error('sync: pushState() falló al subir a la nube —', error.message || error, error)
        return { ok: false }
      }
      rows.forEach(r => {
        lastPushed[r.id] = r.value
        try { localStorage.setItem(OK_PREFIX + r.id, r.value); localStorage.removeItem(PROT_DESDE_PREFIX + r.id) } catch (e) {}
      })
    }
    return { ok: true, n: rows.length }
  } catch (e) {
    console.error('sync: pushState() lanzó una excepción —', e)
    return { ok: false }
  } finally {
    ocupado = false
    if (pendiente) { pendiente = false; pushState() }
  }
}
