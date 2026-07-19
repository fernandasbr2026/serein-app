// ============================================================
// Cotización Intumescente — capa API (Supabase)
// ------------------------------------------------------------
// Paso 2 de la spec (sección 8): CRUD de catálogo/parámetros y de
// cotizaciones/revisiones sobre las tablas REALES (no el patrón de
// blob en app_state que usa el resto del ERP). El componente .jsx
// (paso 3, todavía no implementado) es el único consumidor previsto
// de este módulo.
//
// Regla de inmutabilidad (requerimiento de Mario): mientras la
// cotización está en 'Borrador', guardar SOBREESCRIBE la revisión
// vigente. Al emitir, la revisión queda congelada (trigger en BD);
// para modificarla hay que crear una revisión nueva.
// ============================================================

import { supabase } from './supabase.js'
import { productoDesdeDb, globalsDesdeParametros } from './intumescente-calc.js'

// ---------------- Catálogo ----------------

export async function cargarCatalogo() {
  const [{ data: productos, error: e1 }, { data: espesores, error: e2 }] = await Promise.all([
    supabase.from('int_productos').select('*').eq('activo', true).order('marca'),
    supabase.from('int_espesores').select('*'),
  ])
  if (e1) throw e1
  if (e2) throw e2
  const porProducto = {}
  for (const fila of espesores || []) {
    ;(porProducto[fila.producto_id] ||= []).push(fila)
  }
  const products = (productos || []).map(p => productoDesdeDb(p, porProducto[p.id] || []))
  const byId = Object.fromEntries(products.map(p => [p.id, p]))
  return { products, byId }
}

export async function cargarParametros(overrides) {
  const { data, error } = await supabase.from('int_parametros').select('*')
  if (error) throw error
  return globalsDesdeParametros(data || [], overrides)
}

// Trae globals + los valores por defecto de aplicador/otros costos (para
// sembrar el estado inicial de una cotización nueva) en una sola consulta.
export async function cargarParametrosCompletos() {
  const { data, error } = await supabase.from('int_parametros').select('*')
  if (error) throw error
  const v = Object.fromEntries((data || []).map(p => [p.clave, Number(p.valor)]))
  return {
    globals: globalsDesdeParametros(data || []),
    aplicador: {
      modo: 'obra', montoObra: v.aplicador_monto_obra ?? 1800000,
      valorM2: v.aplicador_valor_m2 ?? 3200, porCapas: true, valorKg: v.aplicador_valor_kg ?? 1500,
      valorDia: v.aplicador_valor_dia ?? 140000, dias: 8, recargoPct: 0, nombre: '',
    },
    otros: {
      certificacion: v.otros_certificacion ?? 450000, incCertificacion: true,
      retoquesPct: v.otros_retoques_pct ?? 3,
      equipos: v.otros_equipos ?? 300000, movilizacion: v.otros_movilizacion ?? 150000,
    },
  }
}

// Solo gerencia puede escribir catálogo/parámetros (RLS lo exige;
// estas funciones simplemente devuelven el error de Postgres si el
// usuario no tiene permiso).
export async function guardarProducto(producto) {
  const { data, error } = await supabase.from('int_productos').upsert(producto).select().single()
  if (error) throw error
  return data
}

export async function eliminarProducto(id) {
  const { error } = await supabase.from('int_productos').update({ activo: false }).eq('id', id)
  if (error) throw error
}

// Reemplaza TODAS las filas de espesores de un producto/sección por
// las filas nuevas (la UI del prototipo edita la tabla completa a la vez).
export async function guardarTablaEspesores(productoId, seccionTipo, filas) {
  const { error: eDel } = await supabase.from('int_espesores').delete()
    .eq('producto_id', productoId).eq('seccion_tipo', seccionTipo)
  if (eDel) throw eDel
  if (!filas.length) return
  const { error: eIns } = await supabase.from('int_espesores').insert(
    filas.map(f => ({
      producto_id: productoId, seccion_tipo: seccionTipo, masividad_max: f.max,
      f15_um: f.esp.F15 || 0, f30_um: f.esp.F30 || 0, f60_um: f.esp.F60 || 0, f90_um: f.esp.F90 || 0, f120_um: f.esp.F120 || 0,
    }))
  )
  if (eIns) throw eIns
}

export async function guardarParametro(clave, valor) {
  const { error } = await supabase.from('int_parametros').upsert({ clave, valor, updated_at: new Date().toISOString() })
  if (error) throw error
}

// ---------------- Folio ----------------

export async function generarFolio() {
  const { data, error } = await supabase.rpc('generar_folio_intumescente')
  if (error) throw error
  return data
}

// ---------------- Cotizaciones + revisiones ----------------

const MOTIVOS_VALIDOS = ['precio', 'plazo', 'otro_proveedor', 'proyecto_postergado', 'sin_respuesta']

function calcularFechaVencimiento(fechaEmision, validezDias) {
  const d = new Date(fechaEmision + 'T00:00:00')
  d.setDate(d.getDate() + (Number(validezDias) || 0))
  return d.toISOString().slice(0, 10)
}

// Crea la cotización + su primera revisión (estado inicial: Borrador).
export async function crearCotizacionBorrador({ cliente, area, proyectoId, obra, moneda, valorUf, validezDias, snapshot, resultados, userId }) {
  const numero = await generarFolio()
  const hoy = new Date().toISOString().slice(0, 10)
  const { data: cot, error: eCot } = await supabase.from('cotizaciones').insert({
    numero, tipo: 'intumescente', cliente, area, proyecto_id: proyectoId || null,
    observaciones: obra || null, moneda: moneda || 'CLP', valor_uf: valorUf || null,
    fecha: hoy, fecha_vencimiento: calcularFechaVencimiento(hoy, validezDias),
    estado: 'Borrador', revision_actual: 1,
    monto_neto: Math.round(resultados.neto), monto_iva: Math.round(resultados.iva), monto_total: Math.round(resultados.total),
    created_by: userId || null,
  }).select().single()
  if (eCot) throw eCot

  const { data: rev, error: eRev } = await supabase.from('cotizacion_revisiones').insert({
    cotizacion_id: cot.id, revision: 1, snapshot, resultados, created_by: userId || null,
  }).select().single()
  if (eRev) throw eRev

  return { cotizacion: cot, revision: rev }
}

// Guarda cambios sobre un borrador existente: sobreescribe la
// revisión vigente (falla si ya no está en Borrador — usar nuevaRevision).
export async function guardarBorrador(cotizacionId, { cliente, area, proyectoId, obra, moneda, valorUf, validezDias, snapshot, resultados }) {
  const { data: cot, error: eGet } = await supabase.from('cotizaciones').select('fecha, revision_actual, estado').eq('id', cotizacionId).single()
  if (eGet) throw eGet
  if (cot.estado !== 'Borrador') {
    throw new Error(`La cotización está en estado "${cot.estado}"; no se puede sobreescribir. Cree una nueva revisión.`)
  }

  const { error: eUpd } = await supabase.from('cotizaciones').update({
    cliente, area, proyecto_id: proyectoId || null, observaciones: obra || null,
    moneda: moneda || 'CLP', valor_uf: valorUf || null,
    fecha_vencimiento: calcularFechaVencimiento(cot.fecha, validezDias),
    monto_neto: Math.round(resultados.neto), monto_iva: Math.round(resultados.iva), monto_total: Math.round(resultados.total),
  }).eq('id', cotizacionId)
  if (eUpd) throw eUpd

  const { error: eRev } = await supabase.from('cotizacion_revisiones')
    .update({ snapshot, resultados })
    .eq('cotizacion_id', cotizacionId).eq('revision', cot.revision_actual)
  if (eRev) throw eRev
}

// Emite la cotización: a partir de aquí la revisión vigente queda
// inmutable (lo aplica el trigger en BD).
export async function emitir(cotizacionId) {
  const { error } = await supabase.from('cotizaciones').update({ estado: 'Enviada' }).eq('id', cotizacionId)
  if (error) throw error
}

// "Modificar" una cotización ya enviada = nueva revisión, clonando
// el snapshot anterior como punto de partida y volviendo a Borrador
// para que quede editable hasta la próxima emisión.
export async function nuevaRevision(cotizacionId, snapshot, resultados, userId) {
  const { data: cot, error: eGet } = await supabase.from('cotizaciones').select('revision_actual').eq('id', cotizacionId).single()
  if (eGet) throw eGet
  const siguiente = cot.revision_actual + 1

  const { data: rev, error: eRev } = await supabase.from('cotizacion_revisiones').insert({
    cotizacion_id: cotizacionId, revision: siguiente, snapshot, resultados, created_by: userId || null,
  }).select().single()
  if (eRev) throw eRev

  const { error: eUpd } = await supabase.from('cotizaciones').update({
    revision_actual: siguiente, estado: 'Borrador',
    monto_neto: Math.round(resultados.neto), monto_iva: Math.round(resultados.iva), monto_total: Math.round(resultados.total),
  }).eq('id', cotizacionId)
  if (eUpd) throw eUpd

  return rev
}

// Transiciones de estado (sección 5 de la spec). Rechazada/Cerrada
// exigen motivo_no_adjudicacion.
export async function cambiarEstado(cotizacionId, nuevoEstado, motivoNoAdjudicacion) {
  if (['Rechazada', 'Cerrada'].includes(nuevoEstado)) {
    if (!MOTIVOS_VALIDOS.includes(motivoNoAdjudicacion)) {
      throw new Error(`Debe indicar motivo_no_adjudicacion (${MOTIVOS_VALIDOS.join(' | ')}) al marcar "${nuevoEstado}".`)
    }
  }
  const patch = { estado: nuevoEstado }
  if (motivoNoAdjudicacion) patch.motivo_no_adjudicacion = motivoNoAdjudicacion
  const { error } = await supabase.from('cotizaciones').update(patch).eq('id', cotizacionId)
  if (error) throw error
}

// Marca como Vencida las cotizaciones intumescentes cuya fecha de
// vencimiento ya pasó y no están aprobadas/cerradas. Pensada para
// llamarse al cargar el listado (no hay cron en este proyecto).
export async function marcarVencidas() {
  const hoy = new Date().toISOString().slice(0, 10)
  const { error } = await supabase.from('cotizaciones')
    .update({ estado: 'Vencida' })
    .eq('tipo', 'intumescente')
    .lt('fecha_vencimiento', hoy)
    .not('estado', 'in', '(Aprobada,Rechazada,Vencida,Cerrada)')
  if (error) throw error
}

// ---------------- Lectura ----------------

export async function listarCotizacionesIntumescentes() {
  const { data, error } = await supabase.from('cotizaciones').select('*').eq('tipo', 'intumescente').order('fecha', { ascending: false })
  if (error) throw error
  return data || []
}

// Vista "cómo se cotizó": trae una revisión puntual (o la vigente)
// para hidratar el componente en modo solo lectura desde el snapshot,
// nunca desde el catálogo vivo.
export async function obtenerRevision(cotizacionId, revision) {
  let query = supabase.from('cotizacion_revisiones').select('*').eq('cotizacion_id', cotizacionId)
  query = revision ? query.eq('revision', revision) : query.order('revision', { ascending: false }).limit(1)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data
}

export async function listarRevisiones(cotizacionId) {
  const { data, error } = await supabase.from('cotizacion_revisiones')
    .select('id, revision, created_at, created_by, resultados')
    .eq('cotizacion_id', cotizacionId).order('revision', { ascending: true })
  if (error) throw error
  return data || []
}

// ---------------- Puente hacia el listado central (blob) ----------------
// NOTA: función pura, todavía SIN conectar (eso es el paso 3 de la
// spec — integrar el componente al módulo Proyectos/Cotizaciones).
// Sirve para que, cuando se conecte, el listado central
// (CotizacionesModule.jsx, que lee desde app_state en vez de estas
// tablas) pueda mostrar un resumen de la cotización intumescente sin
// que dependa de leer las tablas reales. La fuente de verdad sigue
// siendo `cotizaciones`/`cotizacion_revisiones`.
const ESTADO_BLOB = {
  Borrador: 'Alta probabilidad de cierre',
  Enviada: 'Alta probabilidad de cierre',
  'En seguimiento': 'Alta probabilidad de cierre',
  Aprobada: 'Aprobada',
  Rechazada: 'Rechazada',
  Vencida: 'Otro',
  Cerrada: 'Otro',
}

export function paraListadoCentral(cotizacionReal, resultados) {
  return {
    folio: cotizacionReal.numero,
    cliente: cotizacionReal.cliente,
    area: cotizacionReal.area,
    fecha: cotizacionReal.fecha,
    vencimiento: cotizacionReal.fecha_vencimiento,
    estado: ESTADO_BLOB[cotizacionReal.estado] || 'Otro',
    estadoOtro: ['Vencida', 'Cerrada'].includes(cotizacionReal.estado) ? cotizacionReal.estado : undefined,
    vendedor: '',
    condicionPago: '',
    items: [{ desc: 'Cotización intumescente — ver detalle en Proyectos', cant: 1, pUnitario: Math.round(resultados.total), descuento: 0 }],
    _tipo: 'intumescente',
    _cotizacionId: cotizacionReal.id,
  }
}
