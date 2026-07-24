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

// ————— Estado de guardado observable —————
// Antes no había forma honesta de saber, desde la pantalla, si un cambio
// realmente llegó a la nube o no — la app asumía que sí. Este estado
// refleja el ciclo de vida REAL de pushState() (no una suposición) para
// que la UI pueda mostrar "Guardando…" / "Guardado" / "Error al guardar"
// de forma verificable, para cualquier tipo de cambio (texto, fotos,
// documentos — todo pasa por el mismo pushState()).
let estadoGuardado = { fase: 'guardado', ultimoOk: null, ultimoError: null }
const listeners = new Set()
function emitirEstado(parcial) {
  estadoGuardado = { ...estadoGuardado, ...parcial }
  listeners.forEach(fn => { try { fn(estadoGuardado) } catch (e) {} })
}
export function suscribirEstadoGuardado(fn) {
  listeners.add(fn)
  fn(estadoGuardado)
  return () => listeners.delete(fn)
}
export function obtenerEstadoGuardado() { return estadoGuardado }

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

// ————— Escritura con reintento (compare-and-swap real contra la nube) —————
// Antes, para evitar choques al agregar/editar/borrar un ítem de un arreglo
// compartido (ej. cotizaciones), el patrón era "traer lo más fresco y
// después escribir" (pullState() + calcular + pushState()). Eso reduce la
// ventana de choque pero NO la elimina: entre el momento en que se lee lo
// fresco y el momento en que se sube, sigue pasando tiempo — si dos
// personas guardan casi al mismo tiempo, ambas pueden leer la misma base
// "fresca" y calcular folios/resultados distintos, y la que sube segundo
// pisa por completo lo que subió la primera (fue justo lo que le pasó a la
// cotización 825: administración y Mario la crearon casi al mismo tiempo,
// ambas pasaron por el pull-fresh, y aun así una borró a la otra).
// Esta función corrige eso de raíz con verdadero compare-and-swap: escribe
// el valor nuevo en la fila de Supabase SOLO SI nadie la cambió desde que
// se leyó (comparando contra el valor exacto leído, no contra el tiempo).
// Si alguien más escribió primero, la escritura no aplica ningún cambio
// (0 filas afectadas) y se reintenta automáticamente, volviendo a leer el
// valor más nuevo y aplicando la MISMA mutación sobre esa base — así
// ninguna escritura se pierde en silencio, sin importar cuántas personas
// guarden al mismo tiempo ni cuán ajustado sea el margen.
// `mutar(actual)` recibe el valor actual (ya parseado, o null si la fila
// todavía no existe) y debe devolver el valor nuevo completo a guardar.
export async function escribirConReintento(key, mutar, intentos = 6) {
  for (let intento = 0; intento < intentos; intento++) {
    let actual = null
    let updatedAtAnterior = null
    try {
      // Comparar por updated_at (un timestamp corto) en vez de por el
      // value completo — con arreglos grandes (ej. todas las cotizaciones
      // con sus ítems), meter el value entero en la condición de la
      // consulta superaba el largo máximo permitido y Supabase rechazaba
      // la petición completa con "Bad Request", justo la falla real que
      // reportó el usuario.
      const { data, error } = await supabase.from('app_state').select('value, updated_at').eq('id', key).maybeSingle()
      if (error) return { ok: false, error: error.message || String(error) }
      if (data) {
        updatedAtAnterior = data.updated_at || null
        if (data.value != null) { try { actual = JSON.parse(data.value) } catch (e) { actual = null } }
      }
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) }
    }
    let nuevo
    try { nuevo = mutar(actual) } catch (e) { return { ok: false, error: 'Error al calcular el cambio: ' + ((e && e.message) || String(e)) } }
    const valorNuevoStr = JSON.stringify(nuevo)
    try {
      if (updatedAtAnterior == null) {
        // Fila nueva: si alguien se adelanta a crearla, el insert falla por
        // llave duplicada y el siguiente intento del for la trata como
        // edición (compare-and-swap normal) sobre lo que esa persona subió.
        const { error } = await supabase.from('app_state').insert({ id: key, value: valorNuevoStr, updated_at: new Date().toISOString() })
        if (error) continue
      } else {
        const { data: filas, error } = await supabase.from('app_state').update({ value: valorNuevoStr, updated_at: new Date().toISOString() }).eq('id', key).eq('updated_at', updatedAtAnterior).select('id')
        if (error) return { ok: false, error: error.message || String(error) }
        if (!filas || filas.length === 0) continue // alguien más escribió primero — reintentar sobre lo más nuevo
      }
    } catch (e) { return { ok: false, error: (e && e.message) || String(e) } }
    try { localStorage.setItem(key, valorNuevoStr); localStorage.setItem(OK_PREFIX + key, valorNuevoStr); localStorage.removeItem(PROT_DESDE_PREFIX + key) } catch (e) {}
    lastPushed[key] = valorNuevoStr
    emitirEstado({ fase: 'guardado', ultimoOk: Date.now(), ultimoError: null })
    return { ok: true, value: nuevo }
  }
  const msg = 'Varias personas guardaron al mismo tiempo y no se pudo confirmar el cambio tras ' + intentos + ' intentos. Inténtalo de nuevo.'
  emitirEstado({ fase: 'error', ultimoError: msg })
  return { ok: false, error: msg }
}

// Lee el valor más fresco posible de una clave directo de la nube (no de
// localStorage, que puede estar protegido/atrasado) — para decisiones que
// solo necesitan leer, sin escribir (ej. mostrar los datos más recientes
// de una cotización antes de aprobarla).
export async function leerFresco(key) {
  try {
    const { data, error } = await supabase.from('app_state').select('value').eq('id', key).maybeSingle()
    if (error || !data || data.value == null) return null
    try { return JSON.parse(data.value) } catch (e) { return null }
  } catch (e) { return null }
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
      emitirEstado({ fase: 'guardando' })
      const { error } = await supabase.from('app_state').upsert(rows, { onConflict: 'id' })
      if (error) {
        // Antes este error se descartaba en silencio — si algo bloqueaba la
        // subida (permisos, RLS, tamaño del payload, etc.) no había forma
        // de enterarse sin abrir la consola del navegador. Ahora el texto
        // real del error viaja en la respuesta para que la pantalla se lo
        // pueda mostrar directo a la persona, sin depender de eso.
        const msg = error.message || String(error)
        console.error('sync: pushState() falló al subir a la nube —', msg, error)
        emitirEstado({ fase: 'error', ultimoError: msg })
        return { ok: false, error: msg }
      }
      rows.forEach(r => {
        lastPushed[r.id] = r.value
        try { localStorage.setItem(OK_PREFIX + r.id, r.value); localStorage.removeItem(PROT_DESDE_PREFIX + r.id) } catch (e) {}
      })
      emitirEstado({ fase: 'guardado', ultimoOk: Date.now(), ultimoError: null })
    }
    return { ok: true, n: rows.length }
  } catch (e) {
    const msg = (e && e.message) || String(e)
    console.error('sync: pushState() lanzó una excepción —', e)
    emitirEstado({ fase: 'error', ultimoError: msg })
    return { ok: false, error: msg }
  } finally {
    ocupado = false
    if (pendiente) { pendiente = false; pushState() }
  }
}
