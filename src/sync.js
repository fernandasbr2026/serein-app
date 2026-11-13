import { supabase } from './supabase.js'
import { claveVisible } from './permisosClaves.js'

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
// Excepción al plazo de arriba: si la subida está FALLANDO (Supabase caído, sin red, sesión vencida),
// descartar lo local a los 90 s significa perder lo que la persona acaba de ingresar (así se perdieron
// órdenes de compra el 2026-10-15, durante una caída de Supabase). Mientras los pushes sigan fallando,
// se protege lo local hasta 30 minutos; apenas una subida vuelve a funcionar, rige el plazo normal.
const PROTECCION_CON_FALLAS_MS = 30 * 60 * 1000
let ultimoFalloPush = 0
let lastPushed = {}
// Perfil de quien está conectado: decide qué claves se intentan subir (ver permisosClaves.js).
let perfilSync = null
export function configurarSync(perfil) { perfilSync = perfil || null }
// Hasta que esta sesión no haya LEÍDO la nube con éxito, no sube nada: así las semillas de ejemplo
// con que arranca la app (o un localStorage viejo) nunca pisan los datos reales si Supabase estaba
// caído al entrar (auditoría 2026-10-27, hallazgo F-1).
let nubeLeida = false

// Huella liviana de un string (FNV-1a, no criptográfico — solo para
// detectar si el valor cambió). Antes OK_PREFIX guardaba una copia
// COMPLETA de cada valor confirmado, duplicando de facto el uso de
// localStorage de cada clave serein_* (cotizaciones, OTs con fotos, etc.).
// Con serein_ots pesando ~4.2MB, esa duplicación por sí sola sumaba otros
// ~4.2MB, empujando el total cerca del límite típico de localStorage
// (5-10MB por sitio) y provocando que localStorage.setItem() fallara en
// silencio (QuotaExceededError, descartado por los try/catch de todo el
// código) — el dato se veía guardado en la sesión pero nunca llegaba a
// persistir. Con una huella de unos bytes en vez de una copia completa,
// el mismo chequeo de "¿cambió?" ocupa una fracción mínima del espacio.
function huella(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return str.length + ':' + (h >>> 0).toString(36)
}

// ————— Fusión de las OT (serein_ots) —————
// serein_ots es UN solo blob que cada sesión sube completo: la última subida gana. Si una sesión con una
// copia atrasada (pestaña vieja, celular dormido, canal en tiempo real muerto) guardaba cualquier edición,
// pisaba el blob entero y una OT recién creada por otra persona desaparecía sin aviso (así se perdió la
// OT-977 el 2026-10-23). Como las OT nunca se borran de verdad (borrado suave con `eliminada`), fusionar
// por id es seguro: ninguna OT que exista en un lado puede desaparecer en el otro. Para las OT que están en
// ambos lados manda `base` (la versión que se está aplicando o subiendo), igual que antes.
// Devuelve el JSON fusionado, o null si no había nada que agregar.
export function fusionarOts(baseStr, otroStr) {
  try {
    const base = JSON.parse(baseStr), otro = JSON.parse(otroStr)
    if (!Array.isArray(base) || !Array.isArray(otro)) return null
    const ids = new Set(base.map(o => o && o.id))
    const faltan = otro.filter(o => o && o.id && !ids.has(o.id))
    if (!faltan.length) return null
    return JSON.stringify([...base, ...faltan])
  } catch (e) { return null }
}

// Fusión de tres lados, campo por campo (2026-11-05). fusionarOts solo evita que desaparezca una OT entera:
// si la OT existe en ambos lados mandaba la copia que se sube, COMPLETA. Una sesión con la pantalla atrasada
// (las OT pesan más de 1 MB y no llegan por el canal en tiempo real: se actualizan por sondeo cada 60 s)
// que guardaba cualquier cosa devolvía todas las demás OT a su versión vieja: así se borraban la OC, la NV,
// los abonos o el monto que otra persona acababa de ingresar. Ahora se compara con `base` (lo último que
// esta sesión tuvo sincronizado): solo se suben los CAMPOS que esta sesión cambió de verdad; todo lo demás
// se toma de la nube. Devuelve el JSON fusionado, o null si es igual a lo local.
export function fusionarOts3(baseStr, localStr, nubeStr) {
  try {
    const base = JSON.parse(baseStr), local = JSON.parse(localStr), nube = JSON.parse(nubeStr)
    if (!Array.isArray(base) || !Array.isArray(local) || !Array.isArray(nube)) return null
    const porId = arr => { const m = new Map(); arr.forEach(o => { if (o && o.id) m.set(o.id, o) }); return m }
    const B = porId(base), N = porId(nube)
    const s = JSON.stringify
    const vistos = new Set()
    const out = local.map(l => {
      if (!l || !l.id) return l
      vistos.add(l.id)
      const n = N.get(l.id), b = B.get(l.id)
      if (!n || !b) return l                 // OT nueva de esta sesión, o sin referencia: manda lo local
      const sl = s(l)
      if (sl === s(n)) return l
      if (sl === s(b)) return n              // esta sesión no la tocó: vale la de la nube
      const r = { ...n }
      new Set([...Object.keys(l), ...Object.keys(b)]).forEach(k => {
        if (s(l[k]) !== s(b[k])) { if (k in l) r[k] = l[k]; else delete r[k] }
      })
      return r
    })
    nube.forEach(n => { if (n && n.id && !vistos.has(n.id)) out.push(n) })
    const res = s(out)
    return res === localStr ? null : res
  } catch (e) { return null }
}

// ————— Fusión de las facturas por área (serein_facturas) —————
// Mismo problema que las OT: serein_facturas ({ area: [fichas] }) es un solo blob y la última subida gana,
// así que una sesión atrasada borraba las fichas que el Libro de Ventas acababa de copiar a Santa Rosa.
// Acá los borrados SÍ son definitivos (se quita la ficha del arreglo), por eso se lleva una lista de
// "lápidas" (serein_facturasEliminadas, ids de fichas borradas a propósito) para que la fusión no
// resucite lo que alguien eliminó. Una ficha que se vuelve a crear con el mismo id sale de la lista.
const ELIMINADAS_KEY = 'serein_facturasEliminadas'
function leerFacturasEliminadas() {
  try { return new Set(JSON.parse(localStorage.getItem(ELIMINADAS_KEY) || '[]')) } catch (e) { return new Set() }
}
function guardarFacturasEliminadas(set) {
  const arr = [...set].slice(-5000)
  try { localStorage.setItem(ELIMINADAS_KEY, JSON.stringify(arr)) } catch (e) {}
}
export function registrarFacturasEliminadas(ids) {
  if (!ids || !ids.length) return
  const s = leerFacturasEliminadas()
  ids.forEach(id => { if (id) s.add(id) })
  guardarFacturasEliminadas(s)
}
export function quitarFacturasEliminadas(ids) {
  if (!ids || !ids.length) return
  const s = leerFacturasEliminadas()
  let cambio = false
  ids.forEach(id => { if (s.delete(id)) cambio = true })
  if (cambio) guardarFacturasEliminadas(s)
}
export function fusionarFacturas(baseStr, otroStr) {
  try {
    const base = JSON.parse(baseStr), otro = JSON.parse(otroStr)
    if (!base || typeof base !== 'object' || Array.isArray(base) || !otro || typeof otro !== 'object' || Array.isArray(otro)) return null
    const ids = new Set()
    Object.keys(base).forEach(a => (Array.isArray(base[a]) ? base[a] : []).forEach(f => { if (f && f.id) ids.add(f.id) }))
    const lapidas = leerFacturasEliminadas()
    const out = {}
    Object.keys(base).forEach(a => { out[a] = Array.isArray(base[a]) ? [...base[a]] : base[a] })
    let agregado = false
    Object.keys(otro).forEach(a => {
      (Array.isArray(otro[a]) ? otro[a] : []).forEach(f => {
        if (!f || !f.id || ids.has(f.id) || lapidas.has(f.id)) return
        if (!Array.isArray(out[a])) out[a] = []
        out[a].push(f); ids.add(f.id); agregado = true
      })
    })
    return agregado ? JSON.stringify(out) : null
  } catch (e) { return null }
}
// ————— Fusión genérica con lápidas (el resto de los bloques) —————
// Auditoría 2026-10-27 (D-1): 15 de 17 bloques seguían con «la última subida gana». Esta fusión sirve
// para cualquier bloque que sea un arreglo de ítems con `id` (cotizaciones, proyectos, inventario,
// compras operativas, avances, clientes…) o un objeto cuyos campos son arreglos de ítems con `id`
// (pp.ocs/proveedores/docs/cobros/cheques, mo.trabajadores/asistencias/horasExtras, fin.gastos/
// obligaciones/plantillas, contactos.clientes/proveedores). Regla: los ítems que están en los dos
// lados los manda `base`; los que solo están en el otro lado se suman, salvo que tengan lápida.
// Las lápidas se anotan SOLAS: al subir, se comparan los ids que esta sesión tenía la última vez con
// los que tiene ahora; los que desaparecieron fueron borrados a propósito en esta sesión. Si un id
// borrado vuelve a aparecer, la lápida se quita. Todas viven en serein_lapidas ({ clave: { id: fecha } }),
// que también se fusiona (unión) entre sesiones. Los ítems sin `id` no se fusionan (manda `base`).
const LAPIDAS_KEY = 'serein_lapidas'
const LAPIDA_DIAS = 90
// Amnistía (2026-11-12): el 9 y el 12 de noviembre una sesión subió la lista de cotizaciones con muchos
// menos registros y cada faltante quedó con lápida, así que ninguna sesión volvía a aceptarlos. Las
// cotizaciones se restauraron desde el respaldo; las lápidas de cotizaciones anteriores a esta marca se
// ignoran (acá y en la base, ver 2026-11-12-proteccion-app-state.sql) para que no las vuelvan a borrar.
const AMNISTIA_COTIZACIONES_MS = 1794513600000 // 2026-11-12 20:00 UTC
// Los dos borrados masivos también vaciaron órdenes de compra (serein_pp), proyectos y clientes. Toda lápida,
// de cualquier bloque, con marca de tiempo dentro de esos dos minutos se ignora (igual que en la base:
// 2026-11-13-amnistia-lapidas-borrados-masivos.sql). Un borrado legítimo hecho justo en esos minutos es improbable.
const VENTANAS_AMNISTIA = [[1794232380000, 1794232440000], [1794505560000, 1794505620000]] // 09-nov 13:53 y 12-nov 17:46 UTC
export function lapidaAmnistiada(clave, ts) {
  const t = Number(ts)
  if (!t) return false
  if (clave === 'serein_cotizaciones' && t < AMNISTIA_COTIZACIONES_MS) return true
  return VENTANAS_AMNISTIA.some(([a, b]) => t >= a && t <= b)
}
function leerLapidas() {
  try {
    const o = JSON.parse(localStorage.getItem(LAPIDAS_KEY) || '{}')
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
    Object.keys(o).forEach(clave => {
      if (!o[clave] || typeof o[clave] !== 'object') return
      const m = {}
      Object.keys(o[clave]).forEach(id => { if (!lapidaAmnistiada(clave, o[clave][id])) m[id] = o[clave][id] })
      o[clave] = m
    })
    return o
  } catch (e) { return {} }
}
// Ids que estaban en `antesStr` y ya no están en `ahoraStr`
function idsPerdidos(antesStr, ahoraStr) {
  try {
    const antes = idsDeBloque(JSON.parse(antesStr)), ahora = idsDeBloque(JSON.parse(ahoraStr))
    const out = []
    antes.forEach((_, id) => { if (!ahora.has(id)) out.push(id) })
    return { perdidos: out, total: antes.size }
  } catch (e) { return { perdidos: [], total: 0 } }
}
// Un borrado a propósito quita uno o unos pocos registros por vez. Si desde la última subida
// desaparecieron muchos de golpe (más de 3 y al menos el 20 %), no fue la persona: fue una copia
// incompleta (pantalla atrasada, localStorage recortado, error al cargar). Así se perdieron más de
// 200 cotizaciones el 2026-11-09: cada faltante recibió lápida y la nube quedó con 11.
export function encogimientoSospechoso(antesStr, ahoraStr) {
  const { perdidos, total } = idsPerdidos(antesStr, ahoraStr)
  return perdidos.length > 3 && perdidos.length >= total * 0.2
}
function guardarLapidas(o) {
  const corte = Date.now() - LAPIDA_DIAS * 86400000
  const limpio = {}
  Object.keys(o).forEach(k => { const m = {}; Object.keys(o[k] || {}).forEach(id => { if (Number(o[k][id]) > corte) m[id] = o[k][id] }); if (Object.keys(m).length) limpio[k] = m })
  try { localStorage.setItem(LAPIDAS_KEY, JSON.stringify(limpio)) } catch (e) {}
}
// Ids de todos los ítems del bloque (arreglo, u objeto de arreglos), con la ruta a la que pertenecen
function idsDeBloque(v) {
  const out = new Map()
  const tomar = (arr, ruta) => { if (Array.isArray(arr)) arr.forEach(x => { if (x && typeof x === 'object' && x.id != null) out.set(String(x.id), ruta) }) }
  if (Array.isArray(v)) tomar(v, '')
  else if (v && typeof v === 'object') Object.keys(v).forEach(k => tomar(v[k], k))
  return out
}
export function anotarLapidas(clave, antesStr, ahoraStr) {
  try {
    const antes = idsDeBloque(JSON.parse(antesStr)), ahora = idsDeBloque(JSON.parse(ahoraStr))
    const lap = leerLapidas()
    const m = { ...(lap[clave] || {}) }
    let cambio = false
    antes.forEach((_, id) => { if (!ahora.has(id) && !m[id]) { m[id] = Date.now(); cambio = true } })
    ahora.forEach((_, id) => { if (m[id]) { delete m[id]; cambio = true } })
    if (cambio) { lap[clave] = m; guardarLapidas(lap) }
  } catch (e) { /* sin lápidas */ }
}
export function fusionarGenerico(clave, baseStr, otroStr) {
  try {
    const base = JSON.parse(baseStr), otro = JSON.parse(otroStr)
    const lap = (leerLapidas()[clave]) || {}
    const ids = idsDeBloque(base)
    let agregado = false
    if (Array.isArray(base) && Array.isArray(otro)) {
      const out = [...base]
      otro.forEach(x => { if (x && typeof x === 'object' && x.id != null && !ids.has(String(x.id)) && !lap[String(x.id)]) { out.push(x); ids.set(String(x.id), ''); agregado = true } })
      return agregado ? JSON.stringify(out) : null
    }
    if (base && typeof base === 'object' && !Array.isArray(base) && otro && typeof otro === 'object' && !Array.isArray(otro)) {
      const out = { ...base }
      Object.keys(otro).forEach(k => {
        if (!Array.isArray(otro[k])) return
        if (out[k] != null && !Array.isArray(out[k])) return
        const arr = Array.isArray(out[k]) ? [...out[k]] : []
        let toco = false
        otro[k].forEach(x => { if (x && typeof x === 'object' && x.id != null && !ids.has(String(x.id)) && !lap[String(x.id)]) { arr.push(x); ids.set(String(x.id), k); toco = true } })
        if (toco) { out[k] = arr; agregado = true }
      })
      return agregado ? JSON.stringify(out) : null
    }
    return null
  } catch (e) { return null }
}
// Fusión de tres lados para el resto de los bloques (2026-11-09): mismo criterio que fusionarOts3. Antes, en
// los ítems que existían en ambos lados mandaba la copia que se subía, COMPLETA y para TODOS los ítems: una
// sesión atrasada que editaba una cotización devolvía las demás a su versión vieja. Ahora cada sesión sube
// solo los campos de los ítems que cambió de verdad (comparando con `base`, lo último sincronizado).
// Borrados: lo que esta sesión quitó no vuelve, y lo que otra sesión quitó (falta en la nube) tampoco vuelve
// desde acá si esta sesión no lo había tocado. Las lápidas siguen valiendo para las sesiones con la versión
// anterior y para los bloques que no llegan por este camino.
function fusionarArr3(b, l, n, tieneLapida, enOtraParteNube, enOtraParteLocal) {
  const s = JSON.stringify
  const conId = x => x && typeof x === 'object' && x.id != null
  const porId = arr => { const m = new Map(); arr.forEach(x => { if (conId(x)) m.set(String(x.id), x) }); return m }
  const B = porId(b), N = porId(n), vistos = new Set(), out = []
  l.forEach(x => {
    if (!conId(x)) { out.push(x); return }
    const id = String(x.id); vistos.add(id)
    const nn = N.get(id), bb = B.get(id)
    // Falta en la nube: si estaba en la base y esta sesión no lo tocó, otra persona lo borró (o lo movió de
    // arreglo) a propósito, y acá también se quita; si esta sesión lo editó, se conserva (manda lo local).
    if (!nn) { if (bb && (s(x) === s(bb) || enOtraParteNube(id))) return; out.push(x); return }
    if (!bb) { out.push(x); return }
    const sx = s(x)
    if (sx === s(nn)) { out.push(x); return }
    if (sx === s(bb)) { out.push(nn); return }
    const r = { ...nn }
    new Set([...Object.keys(x), ...Object.keys(bb)]).forEach(k => {
      if (s(x[k]) !== s(bb[k])) { if (k in x) r[k] = x[k]; else delete r[k] }
    })
    out.push(r)
  })
  n.forEach(x => {
    if (!conId(x)) return
    const id = String(x.id)
    if (vistos.has(id) || B.has(id) || tieneLapida(id) || enOtraParteLocal(id)) return
    out.push(x)
  })
  return out
}
export function fusionar3(clave, baseStr, localStr, nubeStr) {
  try {
    const b = JSON.parse(baseStr), l = JSON.parse(localStr), n = JSON.parse(nubeStr)
    const s = JSON.stringify
    const lap = clave === 'serein_facturas' ? leerFacturasEliminadas() : null
    const lapGen = lap ? null : ((leerLapidas()[clave]) || {})
    const tieneLapida = id => lap ? lap.has(id) : !!lapGen[id]
    const no = () => false
    let out
    if (Array.isArray(b) && Array.isArray(l) && Array.isArray(n)) out = fusionarArr3(b, l, n, tieneLapida, no, no)
    else if ([b, l, n].every(v => v && typeof v === 'object' && !Array.isArray(v))) {
      const idsDe = (obj, salvo) => { const set = new Set(); Object.keys(obj).forEach(k => { if (k !== salvo && Array.isArray(obj[k])) obj[k].forEach(x => { if (x && typeof x === 'object' && x.id != null) set.add(String(x.id)) }) }); return set }
      out = { ...l }
      // Primera pasada: qué ítems locales sobreviven en cada arreglo (un ítem que otra persona movió de un
      // arreglo a otro sale del antiguo). Segunda: lo de la nube se suma solo si no sobrevive en otro arreglo.
      const arreglos = Object.keys(l).filter(k => Array.isArray(l[k]) && Array.isArray(n[k]))
      const vivos = {}
      arreglos.forEach(k => {
        const otrosN = idsDe(n, k), mios = idsDe({ k: l[k] })
        vivos[k] = fusionarArr3(Array.isArray(b[k]) ? b[k] : [], l[k], n[k], tieneLapida, id => otrosN.has(id), no).filter(x => x && typeof x === 'object' && x.id != null && mios.has(String(x.id)))
      })
      Object.keys(l).forEach(k => {
        if (arreglos.includes(k)) {
          const otrosN = idsDe(n, k), otrosL = idsDe(vivos, k)
          out[k] = fusionarArr3(Array.isArray(b[k]) ? b[k] : [], l[k], n[k], tieneLapida, id => otrosN.has(id), id => otrosL.has(id))
        } else if (k in n && s(l[k]) === s(b[k])) out[k] = n[k]
      })
      Object.keys(n).forEach(k => {
        if (k in l || k in b) return
        if (Array.isArray(n[k])) { const otrosL = idsDe(l, k); out[k] = n[k].filter(x => !(x && typeof x === 'object' && x.id != null && (otrosL.has(String(x.id)) || tieneLapida(String(x.id))))) }
        else out[k] = n[k]
      })
    } else return null
    const res = s(out)
    return res === localStr ? null : res
  } catch (e) { return null }
}
// La lista de fichas eliminadas (serein_facturasEliminadas) también se une: antes la pisaba entera la última
// sesión en subir, y una sesión atrasada perdía las lápidas de las demás y resucitaba lo borrado.
function fusionarListaIds(baseStr, otroStr) {
  try {
    const base = JSON.parse(baseStr), otro = JSON.parse(otroStr)
    if (!Array.isArray(base) || !Array.isArray(otro)) return null
    const set = new Set(base.map(String))
    const faltan = otro.filter(x => x != null && !set.has(String(x)))
    return faltan.length ? JSON.stringify([...base, ...faltan].slice(-5000)) : null
  } catch (e) { return null }
}
// Las lápidas de distintas sesiones se unen (nunca se pisan)
function fusionarLapidas(baseStr, otroStr) {
  try {
    const base = JSON.parse(baseStr) || {}, otro = JSON.parse(otroStr) || {}
    const out = {}; let cambio = false
    Object.keys(base).forEach(k => { out[k] = { ...base[k] } })
    Object.keys(otro).forEach(k => { out[k] = out[k] || {}; Object.keys(otro[k] || {}).forEach(id => { if (!out[k][id]) { out[k][id] = otro[k][id]; cambio = true } }) })
    return cambio ? JSON.stringify(out) : null
  } catch (e) { return null }
}
const CLAVES_GENERICAS = ['serein_pp', 'serein_cotizaciones', 'serein_proyectos', 'serein_fin', 'serein_mo', 'serein_inventario',
  'serein_invMov', 'serein_comprasOp', 'serein_avances', 'serein_contactos', 'serein_clientes', 'serein_proyCotizaciones']
// Qué claves se fusionan en vez de pisarse enteras (ver fusionarOts / fusionarFacturas / fusionarGenerico)
const FUSIONES = { serein_ots: fusionarOts, serein_facturas: fusionarFacturas, serein_lapidas: fusionarLapidas, [ELIMINADAS_KEY]: fusionarListaIds }
// Bloques que al subir se fusionan de tres lados, campo por campo (ver fusionar3)
const TRES_LADOS = new Set(['serein_facturas'])
CLAVES_GENERICAS.forEach(k => { FUSIONES[k] = (b, o) => fusionarGenerico(k, b, o); TRES_LADOS.add(k) })

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
export function aplicarSiSeguro(id, value, actualizado) {
  if (!id || value == null) return false
  // Eco ATRASADO de una subida de esta sesión (llega por el canal en tiempo real cuando ya se subió otra
  // versión después): aplicarlo devolvía la pantalla a un estado anterior.
  if (actualizado && esVersionPropia(id, actualizado)) return false
  try {
    const local = localStorage.getItem(id)
    const confirmado = localStorage.getItem(OK_PREFIX + id)
    if (local != null && confirmado != null && huella(local) !== confirmado) {
      const protKey = PROT_DESDE_PREFIX + id
      const ahora = Date.now()
      let desde = Number(localStorage.getItem(protKey))
      if (!desde) { desde = ahora; localStorage.setItem(protKey, String(ahora)) }
      const limite = (ahora - ultimoFalloPush < 10 * 60 * 1000) ? PROTECCION_CON_FALLAS_MS : PROTECCION_MAX_MS
      if (ahora - desde < limite) {
        pushState()
        return false
      }
      console.warn(`sync: ${id} llevaba más de ${Math.round(PROTECCION_MAX_MS / 1000)}s sin poder subirse — se descarta la protección y se acepta la versión de la nube para no aislar esta sesión.`)
    }
    localStorage.removeItem(PROT_DESDE_PREFIX + id)
    // Al aceptar la versión de la nube, las OT que solo existían acá no se pierden: se suman y se vuelven a
    // subir. La huella "confirmada" es la de la nube, así la fusión cuenta como cambio local pendiente.
    let valorFinal = value
    const fusion = FUSIONES[id]
    if (fusion && local != null) { const f = fusion(value, local); if (f) valorFinal = f }
    localStorage.setItem(id, valorFinal)
    localStorage.setItem(OK_PREFIX + id, huella(value))
    lastPushed[id] = value
    if (valorFinal !== value) setTimeout(() => { pushState() }, 0)
    return true
  } catch (e) { return false }
}

// ————— Lectura de la nube, liviana —————
// Hasta el 2026-11-04 cada pullState() bajaba la tabla app_state COMPLETA (~4,5 MB) y se llama desde más
// de 100 lugares (cada minuto por pestaña, al volver a la ventana, al agregar un abono, una recepción…).
// Con varias personas conectadas eran más de 600 descargas completas por hora: la base quedó sin memoria,
// respondía en 5 s o con error 504, y lo recién guardado se perdía. Ahora:
//  · primero se pide solo el índice (id + updated_at, unos pocos KB) y se bajan únicamente los bloques
//    que cambiaron desde la última vez; una descarga completa solo al entrar y cada 15 minutos;
//  · si ya hay una lectura en curso, las demás llamadas esperan esa misma en vez de lanzar otra;
//  · un bloque que esta sesión escribió DESPUÉS de que partió la lectura no se pisa con esa respuesta
//    (venía con datos anteriores al guardado: así desaparecían los abonos recién agregados).
const PULL_COMPLETO_MS = 15 * 60 * 1000
let versionVista = {}        // id -> updated_at (ms) del valor que esta sesión ya tiene
let versionesPropias = {}    // id -> últimos updated_at (ms) subidos por esta sesión
let escrituraLocal = {}      // id -> momento (reloj local) de la última subida propia
let ultimoPullCompleto = 0
let pullEnCurso = null
const ms = t => { const n = Date.parse(t); return Number.isFinite(n) ? n : 0 }
function esVersionPropia(id, actualizado) {
  const v = ms(actualizado)
  const propias = versionesPropias[id] || []
  // Solo los ecos ATRASADOS: el de la última subida se aplica como siempre (trae la fusión con lo ajeno)
  return !!v && propias.includes(v) && propias[propias.length - 1] !== v
}
function anotarVersionPropia(id, actualizado) {
  const v = ms(actualizado)
  escrituraLocal[id] = Date.now()
  if (!v) { delete versionVista[id]; return }
  versionVista[id] = v
  versionesPropias[id] = [...(versionesPropias[id] || []), v].slice(-8)
}
export function pullState() {
  if (pullEnCurso) return pullEnCurso
  pullEnCurso = hacerPull().finally(() => { pullEnCurso = null })
  return pullEnCurso
}
async function hacerPull() {
  const inicio = Date.now()
  try {
    let filas = null
    const completo = !nubeLeida || (inicio - ultimoPullCompleto > PULL_COMPLETO_MS)
    if (!completo) {
      const { data: indice, error: e1 } = await supabase.from('app_state').select('id, updated_at')
      if (e1 || !indice) return { ok: false, n: 0 }
      const cambiados = indice.filter(r => r && r.id && (ms(r.updated_at) !== versionVista[r.id] || localStorage.getItem(r.id) == null)).map(r => r.id)
      if (!cambiados.length) return { ok: true, n: 0 }
      const { data, error } = await supabase.from('app_state').select('id, value, updated_at').in('id', cambiados)
      if (error || !data) return { ok: false, n: 0 }
      filas = data
    } else {
      const { data, error } = await supabase.from('app_state').select('id, value, updated_at')
      if (error || !data) return { ok: false, n: 0 }
      filas = data
      ultimoPullCompleto = inicio
    }
    nubeLeida = true
    let n = 0
    filas.forEach(row => {
      if (!row.id || row.value == null) return
      // Esta sesión subió este bloque después de que partió la lectura: la respuesta es anterior al guardado
      if ((escrituraLocal[row.id] || 0) > inicio) return
      if (aplicarSiSeguro(row.id, row.value)) {
        n++; versionVista[row.id] = ms(row.updated_at)
        try { window.dispatchEvent(new CustomEvent('serein-sync-fusion', { detail: { id: row.id } })) } catch (e) {}
      }
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
    try { localStorage.setItem(key, valorNuevoStr); localStorage.setItem(OK_PREFIX + key, huella(valorNuevoStr)); localStorage.removeItem(PROT_DESDE_PREFIX + key) } catch (e) {}
    lastPushed[key] = valorNuevoStr
    escrituraLocal[key] = Date.now(); delete versionVista[key]
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
  if (!nubeLeida) return { ok: false, sinNube: true }
  ocupado = true
  pendiente = false
  try {
    const rows = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !KEY_RE.test(k)) continue
      // Claves que este perfil no puede escribir en la nube (la base las rechazaría en silencio)
      if (perfilSync && !claveVisible(perfilSync, k)) continue
      const v = localStorage.getItem(k); if (v !== lastPushed[k]) rows.push({ id: k, value: v, updated_at: new Date().toISOString() })
    }
    if (rows.length) {
      rows.forEach(r => { escrituraLocal[r.id] = Date.now() })
      emitirEstado({ fase: 'guardando' })
      // Antes de pisar serein_ots en la nube, se traen las OT que otra sesión haya agregado mientras tanto
      // y se suman a lo que se sube (ver fusionarOts). Un viaje extra solo cuando cambian las OT.
      for (const r of rows) {
        const fusion = FUSIONES[r.id]
        if (!fusion) continue
        // Lo que esta sesión quitó desde la última subida son borrados a propósito: quedan con lápida.
        // Salvo que hayan desaparecido muchos de golpe: eso es una copia incompleta, no un borrado.
        let sospechoso = false
        if (CLAVES_GENERICAS.includes(r.id) && lastPushed[r.id] != null) {
          sospechoso = encogimientoSospechoso(lastPushed[r.id], r.value)
          if (sospechoso) console.warn(`sync: ${r.id} perdió muchos registros de golpe desde la última subida; no se marcan como borrados y se recuperan antes de subir.`)
          else anotarLapidas(r.id, lastPushed[r.id], r.value)
        }
        try {
          const { data: nube } = await supabase.from('app_state').select('value').eq('id', r.id).maybeSingle()
          if (nube && nube.value != null) {
            // Se parte de lo que hay AHORA en localStorage: mientras se esperaba la nube la persona pudo
            // seguir escribiendo, y fusionar la copia de antes le borraba las últimas teclas.
            const localAhora = localStorage.getItem(r.id) ?? r.value
            const base = lastPushed[r.id]
            let f
            if (sospechoso) {
              // Se devuelven los registros que faltan: primero los de la nube, después los de la última
              // subida propia (por si la nube también los perdió).
              f = fusionarGenerico(r.id, localAhora, nube.value) || localAhora
              f = fusionarGenerico(r.id, f, base) || f
              if (f === localAhora) f = null
            } else {
              f = r.id === 'serein_ots' && base != null ? fusionarOts3(base, localAhora, nube.value)
                : TRES_LADOS.has(r.id) && base != null ? fusionar3(r.id, base, localAhora, nube.value)
                : fusion(localAhora, nube.value)
            }
            r.value = f || localAhora
            if (f) {
              try { localStorage.setItem(r.id, f) } catch (e) {}
              // La pantalla (estado de React) debe quedar igual a lo fusionado; si no, el siguiente guardado
              // general volvería a escribir la copia vieja encima.
              try { window.dispatchEvent(new CustomEvent('serein-sync-fusion', { detail: { id: r.id } })) } catch (e) {}
            }
          }
        } catch (e) { /* sin fusión: se sube lo local tal cual */ }
      }
      // Se pide .select('id') a propósito: un upsert que solo mira `error`
      // puede reportar éxito aunque Supabase, por una política RLS, haya
      // filtrado la fila y actualizado 0 registros — Postgres NO trata eso
      // como error. Sin este chequeo, la app cree que guardó (sin alerta,
      // sin nada en consola) y el dato desaparece apenas alguien recarga o
      // vuelve a entrar, porque nunca llegó de verdad a la base.
      const { data: filasSubidas, error } = await supabase.from('app_state').upsert(rows, { onConflict: 'id' }).select('id, updated_at')
      if (error) {
        const msg = error.message || String(error)
        console.error('sync: pushState() falló al subir a la nube —', msg, error)
        ultimoFalloPush = Date.now()
        emitirEstado({ fase: 'error', ultimoError: msg })
        return { ok: false, error: msg }
      }
      const idsConfirmados = new Set((filasSubidas || []).map(f => f.id))
      const idsFallidos = rows.filter(r => !idsConfirmados.has(r.id)).map(r => r.id)
      if (idsFallidos.length) {
        const msg = 'Supabase no confirmó el guardado de: ' + idsFallidos.join(', ') + ' (probablemente un permiso/política RLS está bloqueando la escritura en silencio, sin marcar error).'
        console.error('sync: pushState() —', msg)
        ultimoFalloPush = Date.now()
        emitirEstado({ fase: 'error', ultimoError: msg })
        return { ok: false, error: msg }
      }
      const versionSubida = {}
      ;(filasSubidas || []).forEach(f => { versionSubida[f.id] = f.updated_at })
      rows.forEach(r => {
        lastPushed[r.id] = r.value
        anotarVersionPropia(r.id, versionSubida[r.id])
        try { localStorage.setItem(OK_PREFIX + r.id, huella(r.value)); localStorage.removeItem(PROT_DESDE_PREFIX + r.id) } catch (e) {}
      })
      emitirEstado({ fase: 'guardado', ultimoOk: Date.now(), ultimoError: null })
    }
    return { ok: true, n: rows.length }
  } catch (e) {
    const msg = (e && e.message) || String(e)
    console.error('sync: pushState() lanzó una excepción —', e)
    ultimoFalloPush = Date.now()
    emitirEstado({ fase: 'error', ultimoError: msg })
    return { ok: false, error: msg }
  } finally {
    ocupado = false
    if (pendiente) { pendiente = false; pushState() }
  }
}
