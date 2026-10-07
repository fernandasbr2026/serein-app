// Reglas del Módulo de Crédito (spec Modulo_Credito_serein-app.pdf, sección 5).
// Funciones puras: no tocan la base ni la pantalla, así se pueden probar solas
// y el simulador de OC, el informe y la evaluación leen exactamente lo mismo.

export const PARAMS_CREDITO_DEFAULT = {
  tope_cliente: 10000000,        // tope de línea por cliente
  oc_grande_desde: 15000000,     // OC "grande": total con IVA desde este monto
  anticipo_oc_grande: 0.30,      // anticipo mínimo en OC grande
  iva: 0.19,
  plazo_credito_dias: 30,
  carpeta_max_dias: 90,          // vigencia máxima de la carpeta tributaria
  factura_vencida_max_dias: 15,  // filtro: facturas vencidas con Serein
  categorias: {
    A: { puntaje_minimo: 75, pct_ventas: 0.10, anticipo_minimo: 0,    meses_revision: 12, garantia: 'Sin garantía adicional' },
    B: { puntaje_minimo: 60, pct_ventas: 0.06, anticipo_minimo: 0,    meses_revision: 6,  garantia: 'Sin garantía adicional' },
    C: { puntaje_minimo: 45, pct_ventas: 0.03, anticipo_minimo: 0.30, meses_revision: 6,  garantia: 'Pagaré' },
    D: { puntaje_minimo: 0,  pct_ventas: 0,    anticipo_minimo: 0.50, meses_revision: 6,  garantia: 'Sin crédito: saldo contra entrega' },
  },
}

// Mezcla lo guardado en la base con los valores iniciales (si falta algo, se usa el inicial).
export const mezclarParams = guardados => {
  const g = guardados || {}
  const cats = {}
  Object.keys(PARAMS_CREDITO_DEFAULT.categorias).forEach(k => { cats[k] = { ...PARAMS_CREDITO_DEFAULT.categorias[k], ...((g.categorias || {})[k] || {}) } })
  return { ...PARAMS_CREDITO_DEFAULT, ...g, categorias: cats }
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }
const fechaMs = iso => { const t = new Date(iso + 'T12:00:00').getTime(); return Number.isFinite(t) ? t : null }
export const diasEntre = (isoDesde, isoHasta) => {
  const a = fechaMs(isoDesde), b = fechaMs(isoHasta)
  return (a == null || b == null) ? null : Math.floor((b - a) / 86400000)
}
const hoyISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }

// Ventas netas mensuales = débitos fiscales (código 538 del F29) / 0,19
export const ventasNetasDeDebitos = debitos => Math.round(num(debitos) / 0.19)

// datos = datos CONFIRMADOS de la evaluación (ver FormEvaluacion):
//  registros: 'limpio' | 'aclaradas' | 'vigentes'
//  chequesProtestados, observacionesTributarias, bienesRaices, contribucionesVencidas,
//  referenciaMala, antecedentesCompletos: boolean
//  fechaCarpeta, fechaInicioActividades: 'YYYY-MM-DD'
//  mesesIvaAlDia (0-12), ventas12m, ventasPrevias12m (netas, opcional),
//  resultadoUltimoAnio: 'utilidad' | 'perdida'
//  antiguedadCtaCteAnios, referenciasBuenas, trabajosPagados, diasFacturaVencida, lineaSolicitada
export function evaluarCredito(datos, paramsIn) {
  const p = mezclarParams(paramsIn)
  const d = datos || {}
  const hoy = hoyISO()
  const notas = []

  const diasCarpeta = d.fechaCarpeta ? diasEntre(d.fechaCarpeta, hoy) : null
  const carpetaVencida = diasCarpeta == null || diasCarpeta > p.carpeta_max_dias

  // 5.1 Filtros de rechazo: un solo "sí" deja al cliente en categoría D
  const filtros = [
    { id: 'sin_trabajos', texto: 'No tiene trabajos pagados con Serein (primer trabajo pendiente)', activo: num(d.trabajosPagados) < 1 },
    { id: 'dicom', texto: 'Morosidades o protestos vigentes en DICOM', activo: d.registros === 'vigentes' },
    { id: 'obs_trib', texto: 'Observaciones tributarias vigentes en la carpeta', activo: !!d.observacionesTributarias },
    { id: 'cheques', texto: 'Cheques protestados en el certificado bancario', activo: !!d.chequesProtestados },
    { id: 'fact_vencidas', texto: 'Facturas vencidas con Serein por más de ' + p.factura_vencida_max_dias + ' días', activo: num(d.diasFacturaVencida) > p.factura_vencida_max_dias },
    { id: 'ref_mala', texto: 'Una referencia comercial informa no pago o pago muy tardío', activo: !!d.referenciaMala },
    { id: 'incompletos', texto: 'Antecedentes incompletos o carpeta tributaria con más de ' + p.carpeta_max_dias + ' días', activo: !d.antecedentesCompletos || carpetaVencida },
  ]
  const hayRechazo = filtros.some(f => f.activo)

  // 5.2 Puntaje (100 puntos)
  const detalle = []
  const add = (factor, dato, puntos, max) => detalle.push({ factor, dato, puntos, max })

  add('Registros comerciales',
    d.registros === 'limpio' ? 'Limpio' : d.registros === 'aclaradas' ? 'Deudas antiguas aclaradas' : d.registros === 'vigentes' ? 'Vigentes (rechazo)' : 'Sin dato',
    d.registros === 'limpio' ? 25 : d.registros === 'aclaradas' ? 12 : 0, 25)

  const m = num(d.mesesIvaAlDia)
  add('IVA declarado a tiempo', m + ' de 12 meses', m >= 12 ? 20 : m >= 10 ? 10 : 0, 20)

  const v12 = num(d.ventas12m), vPrev = num(d.ventasPrevias12m)
  let variacion = null
  if (v12 > 0 && vPrev > 0) variacion = (v12 - vPrev) / vPrev
  let ptsTend = 9, datoTend = 'Sin período anterior para comparar (se asume estable)'
  if (variacion != null) {
    const pct = Math.round(variacion * 1000) / 10
    if (variacion >= 0.05) { ptsTend = 15; datoTend = 'Crece ' + pct + '%' }
    else if (variacion >= -0.10) { ptsTend = 9; datoTend = 'Estable (' + pct + '%)' }
    else { ptsTend = 0; datoTend = 'Cae ' + pct + '%' }
  } else notas.push('No hay ventas del período anterior: la tendencia se asumió estable.')
  add('Tendencia de ventas', datoTend, ptsTend, 15)

  add('Resultado tributario (F22)', d.resultadoUltimoAnio === 'utilidad' ? 'Utilidad el último año' : d.resultadoUltimoAnio === 'perdida' ? 'Pérdida' : 'Sin dato', d.resultadoUltimoAnio === 'utilidad' ? 10 : 0, 10)

  const anios = d.fechaInicioActividades ? (diasEntre(d.fechaInicioActividades, hoy) || 0) / 365.25 : 0
  const aniosTxt = (Math.round(anios * 10) / 10) + ' años'
  add('Antigüedad de la empresa', aniosTxt, anios >= 5 ? 10 : anios >= 3 ? 7 : anios >= 1 ? 4 : 0, 10)

  const refs = num(d.referenciasBuenas)
  add('Referencias comerciales', refs + ' buena(s)', refs >= 3 ? 10 : refs >= 1 ? 5 : 0, 10)

  const brOk = !!d.bienesRaices && !d.contribucionesVencidas
  add('Bienes raíces sin contribuciones vencidas', d.bienesRaices ? (d.contribucionesVencidas ? 'Tiene, con contribuciones vencidas' : 'Tiene') : 'No tiene', brOk ? 5 : 0, 5)

  const cc = num(d.antiguedadCtaCteAnios)
  add('Antigüedad cuenta corriente', cc + ' años', cc >= 2 ? 5 : 2, 5)

  const puntaje = detalle.reduce((a, x) => a + x.puntos, 0)

  // 5.3 Categoría
  let categoria
  if (hayRechazo) categoria = 'D'
  else if (puntaje >= p.categorias.A.puntaje_minimo) categoria = 'A'
  else if (puntaje >= p.categorias.B.puntaje_minimo) categoria = 'B'
  else if (puntaje >= p.categorias.C.puntaje_minimo) categoria = 'C'
  else categoria = 'D'
  const cat = p.categorias[categoria]

  const ventasMes = v12 > 0 ? v12 / 12 : 0
  let lineaSugerida = Math.min(ventasMes * cat.pct_ventas, p.tope_cliente, num(d.lineaSolicitada) > 0 ? num(d.lineaSolicitada) : Infinity)
  lineaSugerida = categoria === 'D' ? 0 : Math.floor(lineaSugerida / 100000) * 100000
  if (categoria !== 'D' && ventasMes <= 0) notas.push('Sin ventas de los últimos 12 meses: no se puede calcular la línea.')

  const califica30 = categoria === 'A' || categoria === 'B'
  const condicionTexto = categoria === 'A' || categoria === 'B'
    ? 'Califica para crédito a ' + p.plazo_credito_dias + ' días, sin anticipo.'
    : categoria === 'C'
      ? 'Califica con condiciones: anticipo de ' + Math.round(cat.anticipo_minimo * 100) + '% y el saldo a crédito a ' + p.plazo_credito_dias + ' días con pagaré.'
      : 'No califica para crédito: anticipo de ' + Math.round(cat.anticipo_minimo * 100) + '% y el saldo contra entrega.'

  return {
    filtros, hayRechazo, detalle, puntaje, categoria,
    lineaSugerida, anticipoMinimo: cat.anticipo_minimo, garantia: cat.garantia, revisionMeses: cat.meses_revision,
    califica30, condicionTexto, notas,
    resumen: { ventas12m: v12, ventasPrevias12m: vPrev, variacion, ventasMes: Math.round(ventasMes), mesesIvaAlDia: m, diasCarpeta, carpetaVencida },
  }
}

// Condiciones de pago para una orden de compra del cliente (spec 5.3).
export function condicionesOC({ montoNeto, categoria, lineaAprobada, deudaVigente }, paramsIn) {
  const p = mezclarParams(paramsIn)
  const cat = p.categorias[categoria] || p.categorias.D
  const neto = num(montoNeto)
  const total = Math.round(neto * (1 + p.iva))
  const cupo = Math.max(num(lineaAprobada) - num(deudaVigente), 0)
  const esGrande = total >= p.oc_grande_desde
  const esD = categoria === 'D'
  let anticipo
  if (esD) anticipo = total * 0.5
  else if (esGrande) anticipo = Math.max(total * p.anticipo_oc_grande, total * cat.anticipo_minimo)
  else anticipo = Math.max(total * cat.anticipo_minimo, total - cupo)
  anticipo = Math.min(total, Math.round(anticipo))
  const aCredito = esD ? 0 : (esGrande && cupo === 0 ? 0 : total - anticipo)
  const nEstadosPago = esGrande && cupo > 0 && aCredito > 0 ? Math.ceil(aCredito / cupo) : 0
  const saldoContraEntrega = esD ? total - anticipo : (aCredito === 0 ? total - anticipo : 0)
  const pctAnticipo = total > 0 ? Math.round(anticipo / total * 1000) / 10 : 0
  const pctCredito = total > 0 ? Math.round(aCredito / total * 1000) / 10 : 0
  let texto
  if (esD) texto = 'Sin crédito: ' + pctAnticipo + '% de anticipo y el saldo contra entrega.'
  else if (aCredito === 0) texto = 'Sin cupo disponible: se paga todo antes de entregar (anticipo y saldo contra entrega).'
  else if (anticipo === 0) texto = 'Crédito a ' + p.plazo_credito_dias + ' días por el total, sin anticipo.'
  else texto = 'Anticipo de ' + pctAnticipo + '% y ' + pctCredito + '% a crédito a ' + p.plazo_credito_dias + ' días' + (categoria === 'C' ? ' con pagaré' : '') + '.'
  if (nEstadosPago > 1) texto += ' El crédito se parte en ' + nEstadosPago + ' estados de pago (uno por cada cupo de ' + Math.round(cupo).toLocaleString('es-CL') + ').'
  return { total, cupo, esGrande, anticipo, pctAnticipo, aCredito, pctCredito, nEstadosPago, saldoContraEntrega, texto, plazo: p.plazo_credito_dias }
}

// ---------- Etapa 2: de lo que lee la IA a los datos de la evaluación ----------
// La IA solo transcribe (extraer-credito); estos cálculos los hace el sistema.

const isoLocal = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')

// Ventas netas y puntualidad del IVA a partir de los Formularios 29 (código 538).
// "Últimos 12" y "12 anteriores" se cuentan desde el período más reciente de la
// carpeta (no desde hoy). Un F29 está a tiempo si se presentó hasta el día 20 del
// mes siguiente (plazo de los contribuyentes que declaran en línea).
export function resumenVentasF29(ventas) {
  const v = (ventas || []).filter(x => x && /^\d{4}-\d{2}$/.test(String(x.periodo || '')) && x.debitos != null && Number.isFinite(Number(x.debitos)))
    .sort((a, b) => String(b.periodo).localeCompare(String(a.periodo)))
  const ult = v.slice(0, 12), prev = v.slice(12, 24)
  const neto = arr => arr.reduce((a, x) => a + ventasNetasDeDebitos(x.debitos), 0)
  const aTiempo = x => {
    if (!x.fechaPresentacion) return false
    const [y, m] = String(x.periodo).split('-').map(Number)
    return String(x.fechaPresentacion) <= isoLocal(new Date(y, m, 20))
  }
  // Si el período anterior trae menos de 12 meses, se escala a 12 para que sea comparable.
  const prevEscalado = prev.length >= 6 ? Math.round(neto(prev) * (ult.length / prev.length)) : 0
  return { meses: ult.length, mesesPrevios: prev.length, ventas12m: neto(ult), ventasPrevias12m: prevEscalado, mesesIvaAlDia: ult.filter(aTiempo).length }
}

export const TIPOS_DOC_REQUERIDOS = ['carpeta_tributaria', 'dicom', 'certificado_bancario', 'solicitud']

// extraidos = { carpeta_tributaria, dicom, certificado_bancario, solicitud, tgr } (lo que devolvió la IA).
// tiposSubidos = tipos de documento ya cargados al cliente (para "antecedentes completos").
export function datosDesdeExtraccion(extraidos, tiposSubidos, otros) {
  const ex = extraidos || {}
  const out = {}
  const c = ex.carpeta_tributaria
  if (c) {
    const r = resumenVentasF29(c.ventasMensuales)
    if (r.meses > 0) { out.ventas12m = String(r.ventas12m); out.ventasPrevias12m = r.ventasPrevias12m ? String(r.ventasPrevias12m) : ''; out.mesesIvaAlDia = r.mesesIvaAlDia }
    if (c.fechaGeneracion) out.fechaCarpeta = c.fechaGeneracion
    if (c.fechaInicioActividades) out.fechaInicioActividades = c.fechaInicioActividades
    if (typeof c.observacionesTributarias === 'boolean') out.observacionesTributarias = c.observacionesTributarias
    if (typeof c.bienesRaices === 'boolean') out.bienesRaices = c.bienesRaices
    const f22 = (c.resultadoTributario || []).filter(x => x && Number.isFinite(Number(x.anio))).sort((a, b) => Number(b.anio) - Number(a.anio))[0]
    if (f22) out.resultadoUltimoAnio = f22.tipo || (Number(f22.valor) > 0 ? 'utilidad' : 'perdida')
  }
  const d = ex.dicom
  if (d && ['limpio', 'aclaradas', 'vigentes'].includes(d.registros)) out.registros = d.registros
  const b = ex.certificado_bancario
  if (b) {
    if (typeof b.chequesProtestados === 'boolean') out.chequesProtestados = b.chequesProtestados
    const dias = b.fechaAperturaCuenta ? diasEntre(b.fechaAperturaCuenta, hoyISO()) : null
    if (dias != null && dias >= 0) out.antiguedadCtaCteAnios = Math.round(dias / 365.25 * 10) / 10
  }
  const s = ex.solicitud
  if (s && num(s.lineaSolicitada) > 0) out.lineaSolicitada = String(Math.round(num(s.lineaSolicitada)))
  const t = ex.tgr
  if (t && typeof t.contribucionesVencidas === 'boolean') out.contribucionesVencidas = t.contribucionesVencidas
  // Documentos libres (E-RUT, certificados, etc.): solo completan lo que la carpeta tributaria no trajo.
  const ini = !out.fechaInicioActividades && (otros || []).map(o => o && o.fechaInicioActividades).find(Boolean)
  if (ini) out.fechaInicioActividades = ini
  if (tiposSubidos) out.antecedentesCompletos = TIPOS_DOC_REQUERIDOS.every(k => tiposSubidos.includes(k))
  return out
}

// Datos de la ficha de la empresa que se pueden completar con lo leído (solicitud, carpeta y documentos libres).
export function datosFichaDesdeExtraccion(extraidos, otros) {
  const ex = extraidos || {}
  const fuentes = [ex.solicitud, ex.carpeta_tributaria].concat((otros || []))
  const primero = campo => { for (const f of fuentes) { if (f && f[campo]) return String(f[campo]) } return '' }
  const out = {}
  const pares = [['razon_social', 'razonSocial'], ['rut', 'rut'], ['giro', 'giro'], ['direccion', 'direccion'], ['representante_legal', 'representanteLegal'], ['contacto_compras', 'contactoCompras'], ['contacto_pagos', 'contactoPagos'], ['email_facturas', 'emailFacturas'], ['fecha_inicio_actividades', 'fechaInicioActividades']]
  pares.forEach(([col, k]) => { const v = primero(k); if (v) out[col] = v })
  return out
}

// Alertas que traen los documentos libres (poder revocado, sociedad no vigente, etc.) para que las revise una persona.
export function hallazgosDe(otros) {
  const out = []
  ;(otros || []).forEach(o => {
    if (!o) return
    const nombre = o.descripcion || 'Documento'
    if (o.vigente === false) out.push(nombre + ': no figura vigente.')
    ;(o.alertas || []).forEach(a => out.push(nombre + ': ' + a))
  })
  return out
}

// Líneas cortas para mostrar qué leyó la IA de cada documento.
export function resumenExtraccion(tipo, d) {
  if (!d) return []
  const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
  const sn = v => v === true ? 'sí' : v === false ? 'no' : 'sin dato'
  if (tipo === 'carpeta_tributaria') {
    const r = resumenVentasF29(d.ventasMensuales)
    const f22 = (d.resultadoTributario || []).slice().sort((a, b) => Number(b.anio) - Number(a.anio))[0]
    return [
      r.meses ? 'Ventas netas ' + r.meses + ' meses: ' + clp(r.ventas12m) : 'Sin formularios 29 legibles',
      r.mesesPrevios >= 6 ? 'Período anterior: ' + clp(r.ventasPrevias12m) + (r.mesesPrevios < 12 ? ' (escalado, ' + r.mesesPrevios + ' meses)' : '') : 'Sin período anterior para comparar',
      'IVA a tiempo: ' + r.mesesIvaAlDia + ' de ' + r.meses + ' meses',
      'Observaciones tributarias: ' + sn(d.observacionesTributarias),
      f22 ? 'F22 ' + f22.anio + ': ' + (f22.tipo || (Number(f22.valor) > 0 ? 'utilidad' : 'pérdida')) : 'F22: sin dato',
      'Bienes raíces: ' + sn(d.bienesRaices),
      'Inicio de actividades: ' + (d.fechaInicioActividades || 'sin dato'),
    ]
  }
  if (tipo === 'dicom') return ['Registros comerciales: ' + ({ limpio: 'limpio', aclaradas: 'deudas antiguas aclaradas', vigentes: 'morosidades / protestos vigentes' }[d.registros] || 'sin dato')].concat(d.detalle ? [d.detalle] : [])
  if (tipo === 'certificado_bancario') return ['Banco: ' + (d.banco || 'sin dato'), 'Cuenta abierta: ' + (d.fechaAperturaCuenta || d.antiguedadTexto || 'sin dato'), 'Cheques protestados: ' + sn(d.chequesProtestados)]
  if (tipo === 'solicitud') return ['Línea solicitada: ' + (num(d.lineaSolicitada) > 0 ? clp(num(d.lineaSolicitada)) : 'sin dato'), 'Referencias informadas: ' + ((d.referencias || []).length || 0)]
  if (tipo === 'tgr') return ['Contribuciones vencidas: ' + sn(d.contribucionesVencidas)]
  if (tipo === 'otro') return [d.descripcion || 'Documento'].concat((d.datosRelevantes || []).map(x => x.etiqueta + ': ' + x.valor)).concat(d.vigente === true ? ['Vigente'] : d.vigente === false ? ['NO vigente'] : [])
  return []
}
