// ============================================================
// Serein AI - CAPA DE TOOLS CONTROLADAS  (pura, testeable)
// ------------------------------------------------------------
// Cada tool:
//   - valida permisos ANTES de leer datos,
//   - consulta SOLO los datos que el usuario ya puede ver
//     (slices en memoria que Dashboard ya cargo para el),
//   - reutiliza los calculos confiables del sistema
//     (calcularM2 de Produccion, motor del Cotizador),
//   - devuelve datos estructurados + fuente (enlace a modulo),
//   - entrega metadatos para auditoria,
//   - NUNCA inventa: si falta el dato, lo dice.
//
// El modelo de IA (fase siguiente) NO genera SQL: solo puede
// invocar estas tools con parametros validados.
// ============================================================

import { calcularM2 } from '../ProduccionModule.jsx'
import { COTIZADOR_SEED, granalladoM2 } from '../cotizador-data.js'
import { puedeVer, puedeVerArea, MSG_SIN_PERMISO } from './permisos.js'
import { buscarProcedimiento } from './conocimiento.js'

const clp = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const fm2 = n => (Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: 1 })
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function _sinPermiso(herramienta, detalle) {
  return { ok: false, sinPermiso: true, texto: MSG_SIN_PERMISO, fuentes: [], meta: { herramienta, permisos_aplicados: detalle || {} } }
}
function _faltante(herramienta, texto, meta) {
  return { ok: true, faltante: true, texto, fuentes: [], meta: { herramienta, ...(meta || {}) } }
}

// Interpreta una fecha en lenguaje natural -> 'YYYY-MM-DD' | null
// Regla: si el ano no se indica, se asume el ano en curso (hoy).
export function interpretarFecha(texto, hoyISO) {
  const hoy = hoyISO ? new Date(hoyISO) : new Date()
  const anoActual = hoy.getFullYear()
  const q = (texto || '').toLowerCase()
  if (/\bhoy\b/.test(q)) return hoy.toISOString().slice(0, 10)
  if (/\bayer\b/.test(q)) { const d = new Date(hoy); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) }
  // dd/mm  o  dd/mm/aaaa  o dd-mm
  let m = q.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/)
  if (m) {
    const d = +m[1], mes = +m[2]; let a = m[3] ? +m[3] : anoActual
    if (a < 100) a += 2000
    if (d >= 1 && d <= 31 && mes >= 1 && mes <= 12) return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  // "23 de julio" (opcional "de 2025")
  m = q.match(/\b(\d{1,2})\s+de\s+([a-zñáéíóú]+)(?:\s+de\s+(\d{4}))?/)
  if (m) {
    const d = +m[1]; const mes = MESES.findIndex(x => x.startsWith(m[2].slice(0, 3))) + 1
    const a = m[3] ? +m[3] : anoActual
    if (mes >= 1 && d >= 1 && d <= 31) return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  // aaaa-mm-dd explicito
  m = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (m) return m[0]
  return null
}

// Extrae un numero de OT del texto (683, OT-683, OT 683, OT-2026-114)
export function extraerNumeroOT(texto) {
  const q = (texto || '')
  let m = q.match(/ot[\s\-]*((?:\d{4}[\s\-])?\d{2,5})/i)
  if (m) return m[1].trim()
  m = q.match(/\b(\d{2,5})\b/)
  return m ? m[1] : null
}

// Busca una OT por numero flexible (por 683 encuentra OT-2026-683, OT-683, etc.)
function buscarOT(ots, numero) {
  if (!numero) return null
  const n = String(numero).replace(/\s|-/g, '').toLowerCase()
  const norm = s => String(s || '').replace(/\s|-/g, '').toLowerCase()
  let hit = (ots || []).find(o => norm(o.numero) === ('ot' + n) || norm(o.numero) === n)
  if (hit) return hit
  hit = (ots || []).find(o => norm(o.numero).endsWith(n))
  return hit || null
}

// ---------------------------------------------------------------
// TOOL 1: obtener_ot_por_numero
// ---------------------------------------------------------------
export function obtener_ot_por_numero({ numero }, ctx, datos) {
  const H = 'obtener_ot_por_numero'
  if (!puedeVer(ctx, 'GESTION_OT')) return _sinPermiso(H, { modulo: 'GESTION_OT' })
  const ot = buscarOT(datos.ots, numero)
  if (!ot) return _faltante(H, `No encontre una OT con el numero ${numero || '(no indicado)'} en tus areas.`, { modulos_consultados: ['GESTION_OT'] })
  if (!puedeVerArea(ctx, ot.area)) return _sinPermiso(H, { modulo: 'GESTION_OT', area: ot.area })
  const valores = ctx.verValoresOT
  const monto = valores && ot.montoCotizado > 0 ? ` Monto cotizado ${clp(ot.montoCotizado)}.` : ''
  const texto = `${ot.numero} - ${ot.cliente} (${ot.area}). Estado: ${ot.estado}. ${ot.m2 || 0} m2. Preparacion: ${ot.preparacion || 's/registro'}.${monto}`
  return {
    ok: true, texto,
    fuentes: [{ modulo: 'Orden de Trabajo', enlace: 'GESTION_OT', ref: ot.numero }],
    meta: { herramienta: H, modulos_consultados: ['GESTION_OT'], registros_consultados: [ot.numero], permisos_aplicados: { area: ot.area, valores } },
  }
}

// ---------------------------------------------------------------
// TOOL 2: obtener_esquema_pintura_ot
// ---------------------------------------------------------------
export function obtener_esquema_pintura_ot({ numero }, ctx, datos) {
  const H = 'obtener_esquema_pintura_ot'
  if (!puedeVer(ctx, 'GESTION_OT')) return _sinPermiso(H, { modulo: 'GESTION_OT' })
  const ot = buscarOT(datos.ots, numero)
  if (!ot) return _faltante(H, `No encontre la OT ${numero || ''} en tus areas.`, { modulos_consultados: ['GESTION_OT'] })
  if (!puedeVerArea(ctx, ot.area)) return _sinPermiso(H, { modulo: 'GESTION_OT', area: ot.area })
  const prep = (ot.preparacion || '').trim()
  const esq = (ot.esquema || '').trim()
  if (!prep && !esq) return _faltante(H, `No encontre un esquema de pintura registrado para la ${ot.numero}.`, { modulos_consultados: ['GESTION_OT'], registros_consultados: [ot.numero] })
  let texto = `La ${ot.numero} tiene registrado: preparacion ${prep || 's/registro'}`
  if (esq) texto += `, esquema ${esq}`
  texto += '.'
  const pc = Array.isArray(ot.pinturaCotizada) ? ot.pinturaCotizada : []
  if (ctx.verValoresOT && pc.length > 0) {
    texto += ' Pintura cotizada (tope): ' + pc.map(p => `${p.producto} ${p.envases || ''} env.`).join(', ') + '.'
  }
  return {
    ok: true, texto,
    fuentes: [{ modulo: 'Orden de Trabajo', enlace: 'GESTION_OT', ref: ot.numero }],
    meta: { herramienta: H, modulos_consultados: ['GESTION_OT'], registros_consultados: [ot.numero], permisos_aplicados: { area: ot.area } },
  }
}

// ---------------------------------------------------------------
// TOOL 3: obtener_produccion_por_fecha
// ---------------------------------------------------------------
export function obtener_produccion_por_fecha({ fecha }, ctx, datos) {
  const H = 'obtener_produccion_por_fecha'
  if (!puedeVer(ctx, 'PRODUCCION')) return _sinPermiso(H, { modulo: 'PRODUCCION' })
  if (!fecha) return _faltante(H, 'Indicame una fecha (ej: 23/07).', { modulos_consultados: ['PRODUCCION'] })
  const plantas = ctx.areasVisibles.filter(a => a === 'Santa Rosa' || a === 'Istria')
  const regs = (datos.avances || []).filter(a => a.fecha === fecha && a.validacion !== 'Anulado' && plantas.includes(a.planta))
  if (regs.length === 0) return _faltante(H, `No hay avances de produccion registrados el ${fecha} en tus plantas.`, { modulos_consultados: ['PRODUCCION'] })
  const porOT = {}
  regs.forEach(r => { (porOT[r.ot] = porOT[r.ot] || new Set()).add(r.proceso) })
  const detalle = Object.entries(porOT).map(([ot, procs]) => `${ot} (${[...procs].join(', ')})`).join('; ')
  return {
    ok: true, texto: `El ${fecha} se registro trabajo en ${Object.keys(porOT).length} OT: ${detalle}.`,
    fuentes: [{ modulo: 'Produccion', enlace: 'PRODUCCION' }],
    meta: { herramienta: H, modulos_consultados: ['PRODUCCION'], registros_consultados: Object.keys(porOT), permisos_aplicados: { plantas } },
  }
}

// ---------------------------------------------------------------
// TOOL 4: obtener_metros_cuadrados_pintados  (usa calcularM2)
// ---------------------------------------------------------------
export function obtener_metros_cuadrados_pintados({ fecha, proceso = 'Pintura' }, ctx, datos) {
  const H = 'obtener_metros_cuadrados_pintados'
  if (!puedeVer(ctx, 'PRODUCCION')) return _sinPermiso(H, { modulo: 'PRODUCCION' })
  if (!fecha) return _faltante(H, 'Indicame una fecha (ej: 23/07).', { modulos_consultados: ['PRODUCCION'] })
  const plantas = ctx.areasVisibles.filter(a => a === 'Santa Rosa' || a === 'Istria')
  // Calculo confiable central del sistema (no se recalcula a mano)
  const { m2PorRegistro } = calcularM2(datos.avances || [], datos.ots || [])
  const regs = (datos.avances || []).filter(a =>
    a.fecha === fecha && a.validacion !== 'Anulado' && a.proceso === proceso && plantas.includes(a.planta))
  if (regs.length === 0) return _faltante(H, `No hay ${proceso.toLowerCase()} registrada el ${fecha} en tus plantas.`, { modulos_consultados: ['PRODUCCION'] })
  const porOT = {}
  let total = 0
  regs.forEach(r => { const m = m2PorRegistro[r.id] || 0; total += m; porOT[r.ot] = (porOT[r.ot] || 0) + m })
  const nOT = Object.keys(porOT).length
  const desglose = Object.entries(porOT).map(([ot, m]) => `${ot}: ${fm2(m)} m2`).join(' · ')
  return {
    ok: true,
    texto: `El ${fecha} se registraron ${fm2(total)} m2 de ${proceso.toLowerCase()} en total, distribuidos en ${nOT} OT. Detalle: ${desglose}. (Criterio: registros validados, m2 automaticos por dias trabajados; no se duplican.)`,
    fuentes: [{ modulo: 'Produccion', enlace: 'PRODUCCION' }],
    meta: { herramienta: H, modulos_consultados: ['PRODUCCION'], registros_consultados: Object.keys(porOT), permisos_aplicados: { plantas, proceso } },
  }
}

// ---------------------------------------------------------------
// TOOL 5: obtener_precio_referencial_servicio (granallado)
// ---------------------------------------------------------------
const GRADO_FACTOR = { 'sp5': 1.4, 'sp-5': 1.4, 'sp10': 1.0, 'sp-10': 1.0, 'sp6': 0.7, 'sp-6': 0.7, 'sp14': 0.6, 'sp-14': 0.6, 'sp7': 0.45, 'sp-7': 0.45 }
const DIF_FACTOR = { 'baja': 1.0, 'estandar': 1.0, 'media': 1.2, 'moderado': 1.2, 'moderada': 1.2, 'alta': 1.45, 'complejo': 1.45, 'compleja': 1.45, 'muy alta': 1.75, 'extrema': 2.0 }

export function obtener_precio_referencial_servicio({ grado = 'SP6', dificultad = 'media', sede = 'Santa Rosa' }, ctx, datos) {
  const H = 'obtener_precio_referencial_servicio'
  // Valores/costos: solo perfiles que ven valores (comercial/gerencia)
  if (!ctx.esGerencia && !puedeVer(ctx, 'COTIZADOR')) return _sinPermiso(H, { modulo: 'COTIZADOR' })
  const gKey = String(grado).toLowerCase().replace(/\s/g, '')
  const fGrado = GRADO_FACTOR[gKey] ?? GRADO_FACTOR[gKey.replace('sp', 'sp-')] ?? null
  const fDif = DIF_FACTOR[String(dificultad).toLowerCase()] ?? null
  if (fGrado == null || fDif == null) {
    return _faltante(H, `No pude interpretar el grado "${grado}" o la dificultad "${dificultad}". Grados: SP5, SP6, SP7, SP10, SP14. Dificultad: baja, media, alta.`, { modulos_consultados: ['COTIZADOR'] })
  }
  const sedeCfg = (COTIZADOR_SEED.sedes || {})[sede] || (COTIZADOR_SEED.sedes || {})['Santa Rosa']
  // Costo directo referencial por m2 (sin sueldos de MO ni margen; base del motor del Cotizador).
  const costoDirecto = granalladoM2(sedeCfg, 0, fGrado, fDif)
  const texto = `Referencia de granallado ${String(grado).toUpperCase()} en dificultad ${dificultad} (sede ${sede}): costo directo base aprox. ${clp(costoDirecto)} neto por m2 (factor grado ${fGrado} x dificultad ${fDif}). Este es el costo directo del motor del Cotizador; NO incluye sueldos de mano de obra, margen ni ajustes por volumen, contaminacion o traslado. Para el precio de venta vigente, generalo en el Cotizador.`
  return {
    ok: true, texto,
    fuentes: [{ modulo: 'Cotizador', enlace: 'COTIZADOR' }],
    meta: { herramienta: H, modulos_consultados: ['COTIZADOR'], permisos_aplicados: { valores: true }, calculo: { fGrado, fDif, sede, costoDirecto } },
  }
}

// ---------------------------------------------------------------
// TOOL 6: listar_cotizaciones_pendientes
// ---------------------------------------------------------------
const _totalCot = cot => {
  const afecto = (cot.items || []).reduce((s, it) => {
    const cant = Number(it.cant) || 0, pu = Number(it.pUnitario) || 0, desc = Number(it.descuento) || 0
    return s + Math.max(0, cant * pu - desc)
  }, 0)
  return Math.round(afecto * 1.19)
}
export function listar_cotizaciones_pendientes(_args, ctx, datos) {
  const H = 'listar_cotizaciones_pendientes'
  if (!puedeVer(ctx, 'COTIZADOR')) return _sinPermiso(H, { modulo: 'COTIZADOR' })
  const hoy = new Date()
  const pend = (datos.cotizaciones || [])
    .filter(c => !['Aprobada', 'Rechazada'].includes(c.estado))
    .filter(c => puedeVerArea(ctx, c.area))
  if (pend.length === 0) return _faltante(H, 'No tienes cotizaciones pendientes de aprobacion.', { modulos_consultados: ['COTIZADOR'] })
  const filas = pend.slice(0, 8).map(c => {
    const dias = c.fecha ? Math.max(0, Math.round((hoy - new Date(c.fecha)) / 86400000)) : null
    const anti = dias == null ? '' : dias === 0 ? ' - creada hoy' : ` - creada hace ${dias} dia(s)`
    return `Cotizacion ${c.folio} - ${c.cliente || 's/cliente'} - ${clp(_totalCot(c))}${anti}`
  })
  return {
    ok: true, texto: `Tienes ${pend.length} cotizacion(es) pendiente(s) de aprobacion:\n- ${filas.join('\n- ')}`,
    fuentes: [{ modulo: 'Cotizaciones', enlace: 'COTIZADOR' }],
    meta: { herramienta: H, modulos_consultados: ['COTIZADOR'], registros_consultados: pend.map(c => c.folio), permisos_aplicados: { areas: ctx.areasVisibles } },
  }
}

// ---------------------------------------------------------------
// TOOL 7: obtener_facturas_vencidas
// ---------------------------------------------------------------
const _pagada = f => f.estado === 'Pagado' || f.estado === 'Factoring' || /factor/i.test(f.medio || '')
export function obtener_facturas_vencidas(_args, ctx, datos) {
  const H = 'obtener_facturas_vencidas'
  if (!puedeVer(ctx, 'FINANZAS') && !ctx.esGerencia) {
    // Areas comerciales pueden ver su cartera; produccion no.
    if (!ctx.areasVisibles.length) return _sinPermiso(H, { modulo: 'FINANZAS' })
  }
  const hoy = new Date().toISOString().slice(0, 10)
  const facturas = datos.facturas || {}
  const vencidas = []
  ctx.areasVisibles.forEach(area => {
    (facturas[area] || []).forEach(f => {
      if (f.estado !== 'Anulada' && !_pagada(f) && f.vencimiento && f.vencimiento < hoy) {
        vencidas.push({ area, cliente: f.cliente, monto: f.monto || f.neto || 0, venc: f.vencimiento })
      }
    })
  })
  if (vencidas.length === 0) return _faltante(H, 'No encontre facturas vencidas en tus areas.', { modulos_consultados: ['FACTURAS'] })
  const total = vencidas.reduce((s, v) => s + v.monto, 0)
  const filas = vencidas.slice(0, 8).map(v => `${v.cliente || 's/cliente'} (${v.area}) - ${clp(v.monto)} - vencio ${v.venc}`)
  return {
    ok: true, texto: `Hay ${vencidas.length} factura(s) vencida(s) por ${clp(total)}:\n- ${filas.join('\n- ')}`,
    fuentes: ctx.areasVisibles.map(a => ({ modulo: `Facturas ${a}`, enlace: a === 'Proyectos' ? 'GESTION_PROYECTOS' : a })),
    meta: { herramienta: H, modulos_consultados: ['FACTURAS'], permisos_aplicados: { areas: ctx.areasVisibles } },
  }
}

// ---------------------------------------------------------------
// TOOL 8: obtener_saldo_factura (por folio, sobre ventas de OT visibles)
// ---------------------------------------------------------------
export function obtener_saldo_factura({ folio }, ctx, datos) {
  const H = 'obtener_saldo_factura'
  if (!puedeVer(ctx, 'GESTION_OT') && !ctx.esGerencia) return _sinPermiso(H, { modulo: 'GESTION_OT' })
  if (!folio) return _faltante(H, 'Indicame el numero de folio de la factura.', {})
  const f = String(folio).replace(/\D/g, '')
  for (const ot of (datos.ots || [])) {
    if (!puedeVerArea(ctx, ot.area)) continue
    const v = (ot.ventas || []).find(x => String(x.folio).replace(/\D/g, '') === f)
    if (v) {
      const bruto = Math.round((v.neta || 0) * 1.19)
      const saldo = v.estadoPago === 'Pendiente' ? bruto : 0
      const texto = v.estadoPago === 'Pendiente'
        ? `La factura ${v.folio} (${ot.cliente}, ${ot.numero}) esta Pendiente. Saldo por cobrar ${clp(saldo)} (bruto; neto ${clp(v.neta)}).`
        : `La factura ${v.folio} (${ot.cliente}, ${ot.numero}) figura ${v.estadoPago}. Saldo ${clp(0)}.`
      return { ok: true, texto, fuentes: [{ modulo: 'Orden de Trabajo', enlace: 'GESTION_OT', ref: ot.numero }], meta: { herramienta: H, modulos_consultados: ['GESTION_OT'], registros_consultados: [v.folio], permisos_aplicados: { area: ot.area } } }
    }
  }
  return _faltante(H, `No encontre una factura con folio ${folio} en tus OT visibles.`, { modulos_consultados: ['GESTION_OT'] })
}

// ---------------------------------------------------------------
// TOOL 9: buscar_manual_procedimiento
// ---------------------------------------------------------------
export function buscar_manual_procedimiento({ pregunta }, ctx) {
  const H = 'buscar_manual_procedimiento'
  const p = buscarProcedimiento(pregunta)
  if (!p) return null // deja que el motor responda otra cosa
  const puede = puedeVer(ctx, p.modulo)
  let texto = `${p.titulo}:\n` + p.pasos.map((s, i) => `${i + 1}. ${s}`).join('\n')
  if (!puede) texto += `\n\nNota: puedes consultar ${p.modulo}, pero tu perfil no tiene permiso para crear nuevos registros aqui.`
  return {
    ok: true, texto,
    fuentes: [{ modulo: p.titulo, enlace: p.enlace }],
    meta: { herramienta: H, modulos_consultados: [p.modulo], registros_consultados: [p.id], permisos_aplicados: { puedeEjecutar: puede, version: p.version } },
  }
}

// ---------------------------------------------------------------
// TOOL 10: obtener_permisos_usuario
// ---------------------------------------------------------------
export function obtener_permisos_usuario(_args, ctx) {
  const H = 'obtener_permisos_usuario'
  const mods = ctx.modulosPerfil ? ctx.modulosPerfil.join(', ') : (ctx.esGerencia ? 'todos (Gerencia)' : 'segun perfil')
  return {
    ok: true,
    texto: `Estas conectado como ${ctx.nombre} (${ctx.rol}). Areas visibles: ${ctx.areasVisibles.join(', ') || 'ninguna'}. Modulos: ${mods}.`,
    fuentes: [],
    meta: { herramienta: H, modulos_consultados: ['perfiles'], permisos_aplicados: { rol: ctx.rol, areas: ctx.areasVisibles } },
  }
}

export const TOOLS = {
  obtener_ot_por_numero,
  obtener_esquema_pintura_ot,
  obtener_produccion_por_fecha,
  obtener_metros_cuadrados_pintados,
  obtener_precio_referencial_servicio,
  listar_cotizaciones_pendientes,
  obtener_facturas_vencidas,
  obtener_saldo_factura,
  buscar_manual_procedimiento,
  obtener_permisos_usuario,
}
