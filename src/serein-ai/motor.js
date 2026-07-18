// ============================================================
// Serein AI - MOTOR (deteccion de intencion + orquestacion)
// ------------------------------------------------------------
// Recibe la pregunta + contexto de permisos + datos + contexto de
// pantalla, detecta la intencion, invoca la TOOL controlada
// adecuada y arma la respuesta. Es el "cerebro" de la Fase 1
// (reglas). Cuando se conecte el LLM, este es el unico punto que
// cambia: el modelo elegira que tool llamar, pero las tools y los
// permisos siguen siendo los mismos.
//
// responder() es async para no cambiar la UI al enchufar el modelo.
// ============================================================

import { TOOLS, interpretarFecha, extraerNumeroOT } from './tools.js'

const _norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const CAPACIDADES = 'Puedo ayudarte con: esquema de pintura de una OT, produccion y m2 por fecha, valor referencial de servicios, cotizaciones pendientes, facturas vencidas y saldos, y como hacer tareas del sistema (ej: como ingreso una compra). Pregunta por tus areas.'

export function saludo(nombre) {
  const h = new Date().getHours()
  const s = h < 12 ? 'Buenos dias' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
  const n = (nombre || '').split(' ')[0]
  return `${s}${n ? ', ' + n : ''}. Soy Serein AI. Puedo ayudarte con informacion relacionada con tus modulos de trabajo.`
}

// Detecta intencion y arma los argumentos para la tool.
function detectar(pregunta, contextoPantalla) {
  const q = _norm(pregunta)
  const fecha = interpretarFecha(pregunta)
  const numOT = extraerNumeroOT(pregunta)
  const ctxOT = contextoPantalla && contextoPantalla.areaSel === 'GESTION_OT'

  if (/\b(mis permisos|que puedo ver|que puedo consultar|mi rol|a que tengo acceso)\b/.test(q))
    return { intent: 'permisos', tool: 'obtener_permisos_usuario', args: {} }

  if (/(esquema|pintura|recubrimiento)/.test(q) && (numOT || /esta ot|esta orden/.test(q)))
    return { intent: 'esquema_pintura', tool: 'obtener_esquema_pintura_ot', args: { numero: numOT } }

  if (/(m2|metros).*(pint)|(pint\w*).*(m2|metros)|cuanto.*pint|pintaron|pintado/.test(q) && (fecha || /hoy|ayer/.test(q)))
    return { intent: 'm2_pintados', tool: 'obtener_metros_cuadrados_pintados', args: { fecha, proceso: 'Pintura' } }

  if (/(m2|metros).*granall|granall.*(m2|metros)|cuanto.*granall/.test(q) && (fecha || /hoy|ayer/.test(q)))
    return { intent: 'm2_granallado', tool: 'obtener_metros_cuadrados_pintados', args: { fecha, proceso: 'Granallado' } }

  if (/(produccion|se trabajo|se produjo|avance).*/.test(q) && fecha)
    return { intent: 'produccion_fecha', tool: 'obtener_produccion_por_fecha', args: { fecha } }

  if (/(precio|valor|cuanto sale|cuanto cuesta|cuesta|tarifa).*(granall|sp\s*-?\s*\d|servicio|m2)/.test(q) || /granall.*(sp|dificultad)/.test(q)) {
    const g = (pregunta.match(/sp\s*-?\s*\d+/i) || ['SP6'])[0]
    const dif = /(muy alta|extrem)/.test(q) ? 'extrema' : /(alta|complej)/.test(q) ? 'alta' : /(baja|estandar)/.test(q) ? 'baja' : 'media'
    return { intent: 'precio_referencial', tool: 'obtener_precio_referencial_servicio', args: { grado: g, dificultad: dif } }
  }

  if (/cotizaci.*(pendiente|por aprobar|aprob)|(pendiente|por aprobar).*cotizaci/.test(q))
    return { intent: 'cotizaciones_pendientes', tool: 'listar_cotizaciones_pendientes', args: {} }

  if (/factura.*(vencid|atrasad)|vencidas|(cuentas|facturas).*por cobrar/.test(q))
    return { intent: 'facturas_vencidas', tool: 'obtener_facturas_vencidas', args: {} }

  if (/saldo.*factura|factura.*saldo|cuanto.*(debe|falta).*factura/.test(q)) {
    const folio = (pregunta.match(/\b\d{3,6}\b/) || [])[0]
    return { intent: 'saldo_factura', tool: 'obtener_saldo_factura', args: { folio } }
  }

  if (/como\s+(ingreso|creo|registro|genero|hago|adjunto|cambio|apruebo|abro)/.test(q) || /(manual|procedimiento|paso a paso|instruccion)/.test(q))
    return { intent: 'procedimiento', tool: 'buscar_manual_procedimiento', args: { pregunta } }

  if (numOT || /\bot\b|orden de trabajo/.test(q))
    return { intent: 'ot', tool: 'obtener_ot_por_numero', args: { numero: numOT } }

  // ultimo intento: procedimiento por keywords
  return { intent: 'desconocido', tool: 'buscar_manual_procedimiento', args: { pregunta } }
}

/**
 * Responde una pregunta. Devuelve { texto, fuentes, intent, herramienta, meta }.
 * @param {string} pregunta
 * @param {object} ctx  contexto de permisos (permisos.derivarContexto)
 * @param {object} datos slices en memoria { ots, avances, facturas, cotizaciones, ... }
 * @param {object} contextoPantalla { areaSel }
 */
export async function responder(pregunta, ctx, datos, contextoPantalla) {
  const t0 = Date.now()
  const q = (pregunta || '').trim()
  if (!q) return { texto: CAPACIDADES, fuentes: [], intent: 'vacio', herramienta: null, meta: {}, duracion_ms: 0 }

  const { intent, tool, args } = detectar(q, contextoPantalla || {})
  let res
  try {
    res = TOOLS[tool] ? TOOLS[tool](args, ctx, datos) : null
  } catch (e) {
    return { texto: 'No pude consultar esta informacion en este momento. El error quedo registrado para revision.', fuentes: [], intent, herramienta: tool, ok: false, error: String(e && e.message || e), meta: {}, duracion_ms: Date.now() - t0 }
  }
  if (!res) {
    return { texto: CAPACIDADES, fuentes: [], intent, herramienta: tool, ok: true, meta: {}, duracion_ms: Date.now() - t0 }
  }
  return {
    texto: res.texto,
    fuentes: res.fuentes || [],
    intent,
    herramienta: res.meta?.herramienta || tool,
    ok: res.ok !== false,
    sinPermiso: !!res.sinPermiso,
    faltante: !!res.faltante,
    error: res.error || null,
    meta: res.meta || {},
    duracion_ms: Date.now() - t0,
  }
}

export { CAPACIDADES }
