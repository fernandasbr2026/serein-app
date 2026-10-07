// Plazo de pago ⇄ fecha de vencimiento de las facturas de venta.
//
// Una sola fuente para el Libro de Ventas y para Facturas por área. El plazo
// NO se guarda aparte: se deduce de (emisión → vencimiento). Así, si alguien
// edita la fecha de vencimiento a mano en un módulo, el otro muestra el plazo
// que corresponde, sin campos nuevos que se puedan desincronizar ni migración.
// Siempre días corridos (como se pacta "30 días fecha factura"), nunca hábiles.
//
// Todo el cálculo es en UTC y sobre texto 'aaaa-mm-dd': el huso horario y el
// cambio de hora de Chile no pueden correr un día.

const ISO = /^(\d{4})-(\d{2})-(\d{2})/
const DIA_MS = 86400000

// Atajos que ofrece el campo; acepta cualquier número (40, 75…). 0 = contado.
export const PLAZOS_SUGERIDOS = [0, 15, 30, 45, 60, 90]
export const PLAZO_POR_DEFECTO = 30
// Tope de lo que se puede escribir a mano (un plazo mayor a un año es un error de tipeo).
export const PLAZO_MAX = 365
// Al corregir la emisión, el vencimiento solo acompaña si el plazo que ya tenía es razonable:
// con una fecha a medio escribir (año 0202…) el plazo deducido sale absurdo y no se toca nada.
const PLAZO_MAX_DEDUCIDO = 730

// 'aaaa-mm-dd' → milisegundos UTC a medianoche; null si no es una fecha real
// (2026-02-31) o si el año es de menos de 3 cifras (Date.UTC lo corre a 19xx).
function utc(fecha) {
  const m = ISO.exec(String(fecha || ''))
  if (!m) return null
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3])
  const d = new Date(ms)
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null
  if (+m[1] < 1000) return null
  return ms
}

// Hoy en hora local, 'aaaa-mm-dd' (no toISOString: pasadas las 20:00 en Chile daría mañana).
export function hoyISO(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

// Lo que se escribe en el campo "Plazo (días)" → entero 0..PLAZO_MAX, o null si está vacío o no sirve.
export function plazoValido(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Math.trunc(Number(String(v).trim().replace(',', '.')))
  return Number.isFinite(n) && n >= 0 ? Math.min(n, PLAZO_MAX) : null
}

// Fecha + N días corridos → 'aaaa-mm-dd'. '' si la fecha no es válida.
export function sumarDias(fecha, dias) {
  const ms = utc(fecha)
  const n = Number(dias)
  if (ms === null || !Number.isInteger(n)) return ''
  return new Date(ms + n * DIA_MS).toISOString().slice(0, 10)
}

// Emisión + plazo escrito a mano → vencimiento ('' si falta algo o el plazo no sirve).
export function vencimientoPorPlazo(emision, plazo) {
  const n = plazoValido(plazo)
  return n === null ? '' : sumarDias(emision, n)
}

// Días de plazo que tiene una factura según sus fechas; null si falta una fecha
// o el vencimiento quedó antes de la emisión (dato mal ingresado, no hay plazo que mostrar).
export function plazoDe(emision, vencimiento) {
  const a = utc(emision), b = utc(vencimiento)
  if (a === null || b === null) return null
  const dias = Math.round((b - a) / DIA_MS)
  return dias >= 0 ? dias : null
}

// Al corregir la fecha de emisión, el vencimiento acompaña conservando el plazo que ya tenía.
// Si no se puede deducir un plazo creíble, o la fecha nueva está incompleta, no se toca.
export function vencimientoAlCambiarEmision(emisionAntes, vencimiento, emisionNueva) {
  const actual = vencimiento || ''
  const plazo = plazoDe(emisionAntes, actual)
  if (plazo === null || plazo > PLAZO_MAX_DEDUCIDO) return actual
  return sumarDias(emisionNueva, plazo) || actual
}

// Formulario de alta: emisión, plazo y vencimiento se acompañan entre sí. Devuelve el formulario
// actualizado con `valor` en `campo`; `claves` dice cómo se llaman esos tres campos en el formulario.
//  · se escribe el plazo → el vencimiento se calcula desde la emisión (plazo vacío = sin vencimiento)
//  · se cambia la emisión → el vencimiento acompaña con el mismo plazo (si no hay plazo, no se toca)
//  · se elige el vencimiento a mano → el plazo se deduce
export function conFechasCoherentes(prev, campo, valor, claves = { emision: 'emission_date', plazo: 'plazo', vencimiento: 'vencimiento' }) {
  const { emision: E, plazo: P, vencimiento: V } = claves
  const nf = { ...prev, [campo]: valor }
  if (campo === P) {
    const n = plazoValido(valor)
    if (n !== null) nf[P] = String(n)        // 4.7 → 4, 999 → 365
    else if (valor !== '') nf[P] = prev[P]   // texto que no es un plazo: se ignora
    nf[V] = vencimientoPorPlazo(nf[E], nf[P])
  } else if (campo === E) {
    nf[V] = vencimientoPorPlazo(valor, nf[P]) || (plazoValido(nf[P]) === null ? (nf[V] || '') : '')
  } else if (campo === V) {
    const n = plazoDe(nf[E], valor)
    nf[P] = n === null ? '' : String(n)
  }
  return nf
}

// Días que faltan para vencer (negativo = ya venció, 0 = vence hoy); null si no hay fecha válida.
export function diasParaVencer(vencimiento, hoy = hoyISO()) {
  const v = utc(vencimiento), h = utc(hoy)
  if (v === null || h === null) return null
  return Math.round((v - h) / DIA_MS)
}

// Texto corto bajo la fecha de vencimiento de una factura sin pagar.
export function textoDiasParaVencer(dias) {
  if (dias === null || dias === undefined) return ''
  if (dias < 0) return 'atrasada ' + (-dias) + (dias === -1 ? ' día' : ' días')
  if (dias === 0) return 'vence hoy'
  return 'faltan ' + dias + (dias === 1 ? ' día' : ' días')
}
