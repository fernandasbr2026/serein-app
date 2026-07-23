import { supabase } from './supabase.js'

const KEY_RE = /^(serein_|__serein_|cotizador_)/
// Prefijo de las marcas "esto ya se confirmó subido a la nube", una por
// cada clave serein_*. A diferencia de lastPushed (memoria, se pierde al
// recargar la página), estas quedan en localStorage — sobreviven a un
// refresh, que es justo el momento en que más importa no perder nada.
// No calzan con KEY_RE, así que nunca se suben como si fueran datos.
const OK_PREFIX = '__pushok_'
let lastPushed = {}

// pullState() NO debe pisar una clave local que todavía no se confirmó
// subida a la nube — si lo hiciera, un refresh o el sondeo periódico
// podrían "revivir" datos viejos justo encima de un cambio recién hecho
// (cerrar una OT, agregar una factura, etc.) que aún no llegó a Supabase.
// Comparamos el valor local contra su última marca __pushok_; si difieren,
// dejamos el local tal cual y probamos subirlo de nuevo en vez de traerlo.
export async function pullState() {
  try {
    const { data, error } = await supabase.from('app_state').select('id, value')
    if (error || !data) return { ok: false, n: 0 }
    let n = 0
    let huboProtegidas = false
    data.forEach(row => {
      if (!row.id || row.value == null) return
      try {
        const local = localStorage.getItem(row.id)
        const confirmado = localStorage.getItem(OK_PREFIX + row.id)
        if (local != null && confirmado != null && local !== confirmado) {
          huboProtegidas = true
          return
        }
        localStorage.setItem(row.id, row.value)
        lastPushed[row.id] = row.value
        n++
      } catch (e) {}
    })
    if (huboProtegidas) pushState()
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
      if (error) return { ok: false }
      rows.forEach(r => {
        lastPushed[r.id] = r.value
        try { localStorage.setItem(OK_PREFIX + r.id, r.value) } catch (e) {}
      })
    }
    return { ok: true, n: rows.length }
  } catch (e) { return { ok: false } } finally {
    ocupado = false
    if (pendiente) { pendiente = false; pushState() }
  }
}
