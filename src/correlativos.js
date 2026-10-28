// ============================================================
// Correlativos únicos desde la base (auditoría 2026-10-27, hallazgo D-5)
// ============================================================
// Antes el número de OT, de OC y el folio de cotización eran «máximo local + 1»:
// dos sesiones podían crear el mismo número. Ahora se le pide a la base
// (función SQL `siguiente_correlativo`) el siguiente de la serie, pasándole el
// máximo que esta sesión conoce para que nunca retroceda. Si la base no
// responde, no está corrida la migración o el usuario no tiene permiso, se
// devuelve null y quien llama sigue con el cálculo local de siempre.
import { supabase } from './supabase.js'

export async function siguienteCorrelativo(nombre, minimoLocal = 0, ms = 6000) {
  try {
    const piso = Math.max(0, Math.floor(Number(minimoLocal) || 0))
    const consulta = supabase.rpc('siguiente_correlativo', { p_nombre: nombre, p_minimo: piso })
    const tope = new Promise(resolver => setTimeout(() => resolver({ error: new Error('sin respuesta') }), ms))
    const { data, error } = await Promise.race([consulta, tope])
    if (error || data == null) return null
    const n = Number(data)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch (e) { return null }
}

// «OT-2026-114» → pide el siguiente de la serie ot-2026 y devuelve «OT-2026-NNN».
// Si no tiene ese formato o la base no responde, devuelve el número propuesto tal cual.
export async function reservarNumeroOT(propuesto) {
  const m = String(propuesto || '').match(/^OT-(\d{4})-(\d+)$/)
  if (!m) return propuesto
  const n = await siguienteCorrelativo('ot-' + m[1], parseInt(m[2], 10) - 1)
  return n ? 'OT-' + m[1] + '-' + String(n).padStart(3, '0') : propuesto
}

// Número de OC (entero como texto). Devuelve el propuesto si la base no responde.
export async function reservarNumeroOC(propuesto) {
  const local = parseInt(String(propuesto || '').replace(/\D/g, ''), 10)
  if (!Number.isFinite(local)) return propuesto
  const n = await siguienteCorrelativo('oc', local - 1)
  return n ? String(n) : propuesto
}

// Folio de cotización (entero). Devuelve el propuesto si la base no responde.
export async function reservarFolioCotizacion(propuesto) {
  const local = parseInt(String(propuesto || '').replace(/\D/g, ''), 10)
  if (!Number.isFinite(local)) return propuesto
  const n = await siguienteCorrelativo('cotizacion', local - 1)
  return n ? n : propuesto
}
