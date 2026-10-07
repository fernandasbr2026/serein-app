import { jsPDF } from 'jspdf'
import { LOGO_SEREIN_DATA } from './logoSereinData.js'
import { mezclarParams, diasEntre, hallazgosDe } from './creditoCalculo.js'

// Informe de Evaluación de Crédito (ADM-CR-02) — spec Modulo_Credito_serein-app.pdf, sección 6.
// Se genera en el navegador con jsPDF (sin backend): tamaño carta, márgenes de 15 mm, Helvetica,
// títulos en #DA6633. Usa solo caracteres de la fuente estándar (sin ≈, ✓, etc.).

const NARANJA = [218, 102, 51], CARBON = [34, 38, 42], GRIS = [105, 113, 127], ROJO = [197, 69, 61], VERDE = [27, 158, 93]
const M = 15, ANCHO = 215.9, ALTO = 279.4, W = ANCHO - M * 2
const clp = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const fechaDMA = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '-' + m[2] + '-' + m[1] : (iso || '-') }
const hoyISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
const addMeses = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
const pct = v => (Math.round(Number(v) * 1000) / 10).toLocaleString('es-CL') + ' %'

const DOCS = [
  ['carpeta_tributaria', 'Carpeta tributaria (SII)'], ['dicom', 'Informe DICOM'], ['certificado_bancario', 'Certificado bancario'],
  ['solicitud', 'Solicitud de crédito firmada'], ['tgr', 'Certificado TGR (contribuciones)'],
]
const REGISTROS = { limpio: 'Limpio', aclaradas: 'Deudas antiguas aclaradas', vigentes: 'Morosidades o protestos vigentes' }
const ESTADO_EV = { aprobada: 'APROBADA', rechazada: 'RECHAZADA', evaluada: 'EVALUADA (pendiente de aprobación)', borrador: 'BORRADOR' }

// cliente, evaluacion (fila de credito_evaluaciones), docs (credito_documentos), params, numero (n° de evaluación del cliente)
export function generarInformeCredito({ cliente, evaluacion, docs = [], params, numero = 1 }) {
  const p = mezclarParams(params)
  const ev = evaluacion || {}
  const res = ev.resultado || {}
  const datos = ev.datos_confirmados || {}
  const resumen = res.resumen || {}
  const filtros = res.filtros || []
  const detalle = res.detalle || []
  const fechaEv = ev.fecha || hoyISO()
  const mesesRev = res.revisionMeses || (p.categorias[ev.categoria] || {}).meses_revision || 6
  const proxRev = addMeses(fechaEv, mesesRev)
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  let y = 0

  const color = c => doc.setTextColor(c[0], c[1], c[2])
  const txt = (t, x, yy, { size = 9, bold = false, c = CARBON, align = 'left' } = {}) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); color(c); doc.text(String(t == null ? '' : t), x, yy, { align }) }
  const nuevaPagina = () => { doc.addPage(); y = 20 }
  const ensure = h => { if (y + h > ALTO - 22) nuevaPagina() }
  const parrafo = (t, x, ancho, { size = 9, c = CARBON, bold = false, lh = 4.3 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size)
    const lineas = doc.splitTextToSize(String(t == null || t === '' ? '-' : t), ancho)
    lineas.forEach(l => { ensure(lh); txt(l, x, y, { size, c, bold }); y += lh })
  }
  const titulo = (n, t) => { ensure(14); y += 3; txt(n + '. ' + t, M, y, { size: 11, bold: true, c: NARANJA }); y += 2; doc.setDrawColor(NARANJA[0], NARANJA[1], NARANJA[2]); doc.setLineWidth(0.4); doc.line(M, y, M + W, y); y += 5 }
  const par = (k, v, x = M, anchoK = 52) => { ensure(5); txt(k, x, y, { size: 8.5, c: GRIS }); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); const ls = doc.splitTextToSize(String(v == null || v === '' ? '-' : v), W - anchoK); ls.forEach((l, i) => { if (i > 0) { ensure(4.3); } txt(l, x + anchoK, y, { size: 9, bold: true }); y += 4.4 }) }
  const tabla = (cols, filas, { total } = {}) => {
    const rowH = 6
    const dibujaEncabezado = () => { doc.setFillColor(NARANJA[0], NARANJA[1], NARANJA[2]); doc.rect(M, y, W, rowH, 'F'); let x = M; cols.forEach(c => { txt(c.t, c.align === 'right' ? x + c.w - 2 : x + 2, y + 4.1, { size: 8, bold: true, c: [255, 255, 255], align: c.align === 'right' ? 'right' : 'left' }); x += c.w }); y += rowH }
    ensure(rowH * 2); dibujaEncabezado()
    const fila = (celdas, { bold = false, fondo, colorTxt } = {}) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(8.5)
      const lineas = celdas.map((v, i) => doc.splitTextToSize(String(v == null ? '' : v), cols[i].w - 4))
      const h = Math.max(rowH, Math.max(...lineas.map(l => l.length)) * 4 + 2)
      if (y + h > ALTO - 22) { nuevaPagina(); dibujaEncabezado() }
      if (fondo) { doc.setFillColor(fondo[0], fondo[1], fondo[2]); doc.rect(M, y, W, h, 'F') }
      let x = M
      lineas.forEach((ls, i) => { ls.forEach((l, j) => txt(l, cols[i].align === 'right' ? x + cols[i].w - 2 : x + 2, y + 4.1 + j * 4, { size: 8.5, bold, c: colorTxt || CARBON, align: cols[i].align === 'right' ? 'right' : 'left' })); x += cols[i].w })
      doc.setDrawColor(225, 229, 233); doc.setLineWidth(0.2); doc.line(M, y + h, M + W, y + h)
      y += h
    }
    filas.forEach(f => fila(f))
    if (total) fila(total, { bold: true, fondo: [255, 246, 241] })
    y += 3
  }

  // ---------- Encabezado ----------
  try { doc.addImage(LOGO_SEREIN_DATA, 'PNG', M, 12, 36, 14.8) } catch (e) { txt('SEREIN GROUP', M, 20, { size: 14, bold: true, c: NARANJA }) }
  txt('Informe de Evaluación de Crédito', ANCHO - M, 18, { size: 15, bold: true, c: NARANJA, align: 'right' })
  txt('Código ADM-CR-02  ·  Evaluación N° ' + numero, ANCHO - M, 24, { size: 9, c: GRIS, align: 'right' })
  txt('Fecha de emisión: ' + fechaDMA(hoyISO()) + '  ·  Evaluación del ' + fechaDMA(fechaEv), ANCHO - M, 29, { size: 9, c: GRIS, align: 'right' })
  doc.setDrawColor(CARBON[0], CARBON[1], CARBON[2]); doc.setLineWidth(0.8); doc.line(M, 33, M + W, 33)
  y = 38

  // ---------- 1. Cliente ----------
  titulo(1, 'Cliente')
  par('Razón social', cliente.razon_social); par('RUT', cliente.rut); par('Giro', cliente.giro); par('Dirección', cliente.direccion)
  par('Representante legal', cliente.representante_legal); par('Contacto de pagos', [cliente.contacto_pagos, cliente.email_facturas].filter(Boolean).join(' · '))
  par('Inicio de actividades', fechaDMA(datos.fechaInicioActividades || cliente.fecha_inicio_actividades))

  // ---------- 2. Antecedentes revisados ----------
  titulo(2, 'Antecedentes revisados')
  tabla([{ t: 'Documento', w: 78 }, { t: 'Fecha de emisión', w: 36 }, { t: 'Estado', w: W - 114 }], DOCS.map(([tipo, label]) => {
    const d = docs.filter(x => x.tipo === tipo).sort((a, b) => String(b.fecha_emision || '').localeCompare(String(a.fecha_emision || '')))[0]
    let estado = d ? 'Recibido' : (tipo === 'tgr' ? 'No aplica / opcional' : 'Pendiente')
    if (d && tipo === 'carpeta_tributaria' && d.fecha_emision) { const dias = diasEntre(d.fecha_emision, hoyISO()); estado += dias > p.carpeta_max_dias ? ' - VENCIDA (' + dias + ' días)' : ' - vigente (' + dias + ' días)' }
    return [label, d ? fechaDMA(d.fecha_emision) : '-', estado]
  }).concat(docs.filter(x => x.tipo === 'otro').map(d => { const x = d.datos_extraidos || {}; return [x.descripcion || d.nombre_archivo || 'Documento adicional', fechaDMA(d.fecha_emision), 'Recibido' + (x.vigente === false ? ' - NO VIGENTE' : x.vigente === true ? ' - vigente' : '')] })))
  const hallazgos = hallazgosDe(docs.filter(x => x.tipo === 'otro').map(d => d.datos_extraidos))
  if (hallazgos.length) { ensure(10); txt('Alertas detectadas en documentos adicionales:', M, y, { size: 9, bold: true, c: ROJO }); y += 5; hallazgos.forEach(h => parrafo('- ' + h, M, W, { size: 8.5, c: ROJO })) }

  // ---------- 3. Resultado ----------
  titulo(3, 'Resultado')
  ensure(32)
  const bx = M, bw = W, bh = 31
  doc.setFillColor(255, 246, 241); doc.setDrawColor(NARANJA[0], NARANJA[1], NARANJA[2]); doc.setLineWidth(0.6); doc.roundedRect(bx, y, bw, bh, 2, 2, 'FD')
  const celda = (k, v, x, yy, { c = CARBON, size = 12, ancho = 0 } = {}) => { txt(k.toUpperCase(), x, yy, { size: 7, c: GRIS }); if (ancho) { doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.splitTextToSize(String(v), ancho).slice(0, 2).forEach((l, i) => txt(l, x, yy + 6 + i * 3.6, { size, bold: true, c })) } else txt(v, x, yy + 6, { size, bold: true, c }) }
  const colw = bw / 4
  celda('Puntaje', (ev.puntaje != null ? ev.puntaje : '-') + ' / 100', bx + 4, y + 7)
  celda('Categoría', ev.categoria || '-', bx + 4 + colw, y + 7, { c: ev.categoria === 'D' ? ROJO : NARANJA, size: 16 })
  celda('Línea sugerida', clp(ev.linea_sugerida), bx + 4 + colw * 2, y + 7)
  celda('Línea aprobada', clp(ev.linea_aprobada), bx + 4 + colw * 3, y + 7)
  celda('Anticipo mínimo', Math.round((Number(ev.anticipo_minimo) || 0) * 100) + ' %', bx + 4, y + 19)
  celda('Garantía exigida', ev.garantia || '-', bx + 4 + colw, y + 19, { size: 8.5, ancho: colw - 8 })
  celda('Próxima revisión', fechaDMA(proxRev), bx + 4 + colw * 2, y + 19)
  celda('Estado', ESTADO_EV[ev.estado] || ev.estado || '-', bx + 4 + colw * 3, y + 19, { size: 8, c: ev.estado === 'aprobada' ? VERDE : ev.estado === 'rechazada' ? ROJO : CARBON })
  y += bh + 7
  if (res.condicionTexto) parrafo(res.condicionTexto, M, W, { size: 9, bold: true })

  // ---------- 4. Detalle del puntaje ----------
  titulo(4, 'Detalle del puntaje')
  tabla([{ t: 'Factor', w: 62 }, { t: 'Dato observado', w: W - 62 - 36 }, { t: 'Puntos', w: 18, align: 'right' }, { t: 'Máximo', w: 18, align: 'right' }],
    detalle.map(d => [d.factor, d.dato, d.puntos, d.max]), { total: ['Total', '', ev.puntaje != null ? ev.puntaje : '-', 100] })

  // ---------- 5. Filtros de rechazo ----------
  ensure(Math.max(filtros.length, 1) * 5 + 16)
  titulo(5, 'Filtros de rechazo')
  filtros.forEach(f => { ensure(5); txt(f.texto, M, y, { size: 8.5, c: f.activo ? ROJO : CARBON, bold: f.activo }); txt(f.activo ? 'SÍ' : 'No', M + W, y, { size: 8.5, c: f.activo ? ROJO : GRIS, bold: f.activo, align: 'right' }); y += 5 })
  if (!filtros.length) txt('Sin detalle registrado.', M, y, { size: 8.5, c: GRIS }), y += 5

  // ---------- 6. Situación tributaria y comercial ----------
  titulo(6, 'Situación tributaria y comercial')
  const variacion = resumen.variacion != null ? (resumen.variacion >= 0 ? '+' : '') + pct(resumen.variacion) : 'sin período anterior para comparar'
  par('Ventas netas últimos 12 meses', clp(resumen.ventas12m || datos.ventas12m))
  par('Variación vs. período anterior', variacion)
  par('Meses de IVA al día', (resumen.mesesIvaAlDia != null ? resumen.mesesIvaAlDia : datos.mesesIvaAlDia) + ' de 12')
  par('Resultado último F22', datos.resultadoUltimoAnio === 'utilidad' ? 'Utilidad' : datos.resultadoUltimoAnio === 'perdida' ? 'Pérdida' : '-')
  par('Observaciones tributarias', datos.observacionesTributarias ? 'Sí, hay observaciones vigentes' : 'No registra')
  par('Informe DICOM', REGISTROS[datos.registros] || '-')
  par('Cheques protestados', datos.chequesProtestados ? 'Sí' : 'No registra')
  par('Antigüedad cuenta corriente', (datos.antiguedadCtaCteAnios != null ? datos.antiguedadCtaCteAnios + ' años' : '-'))
  par('Referencias comerciales buenas', datos.referenciasBuenas != null ? datos.referenciasBuenas : '-')
  par('Trabajos pagados con Serein', datos.trabajosPagados != null ? datos.trabajosPagados : '-')

  // ---------- 7. Condiciones de pago aprobadas ----------
  titulo(7, 'Condiciones de pago aprobadas')
  const aprobado = ev.estado === 'aprobada'
  const cat = ev.categoria
  par('Plazo / modalidad', !aprobado ? 'No hay crédito aprobado: pago anticipado o contra entrega.' : (cat === 'C' ? 'Anticipo de ' + Math.round(p.categorias.C.anticipo_minimo * 100) + '% y el saldo a crédito a ' + p.plazo_credito_dias + ' días con pagaré.' : 'Crédito a ' + p.plazo_credito_dias + ' días, sin anticipo.'))
  par('Anticipo mínimo', aprobado ? Math.round((Number(ev.anticipo_minimo) || 0) * 100) + ' %' : '50 % y saldo contra entrega')
  par('Tope por orden de compra', aprobado ? clp(ev.linea_aprobada) + ' (línea aprobada; el saldo que exceda el cupo se paga como anticipo)' : '-')
  par('OC grandes', 'Desde ' + clp(p.oc_grande_desde) + ' con IVA: anticipo mínimo ' + Math.round(p.anticipo_oc_grande * 100) + ' % y el saldo a crédito se parte en estados de pago por el cupo disponible.')

  // ---------- 8. Observaciones ----------
  titulo(8, 'Observaciones')
  parrafo(ev.observaciones || 'Sin observaciones.', M, W)
  ;(res.notas || []).forEach(n => parrafo('- ' + n, M, W, { size: 8.5, c: GRIS }))

  // ---------- Firmas ----------
  ensure(34); y += 14
  doc.setDrawColor(CARBON[0], CARBON[1], CARBON[2]); doc.setLineWidth(0.3)
  doc.line(M, y, M + 75, y); doc.line(M + W - 75, y, M + W, y)
  txt('Evaluado por (Administración)', M, y + 4.5, { size: 8.5, c: GRIS }); txt('Aprobado por (Gerencia)', M + W - 75, y + 4.5, { size: 8.5, c: GRIS })
  txt('Fecha: ____ / ____ / ________', M, y + 10, { size: 8.5, c: GRIS }); txt('Fecha: ____ / ____ / ________', M + W - 75, y + 10, { size: 8.5, c: GRIS })

  // ---------- Pie de página en todas las hojas ----------
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setDrawColor(220, 224, 228); doc.setLineWidth(0.2); doc.line(M, ALTO - 14, M + W, ALTO - 14)
    txt('Documento interno Serein Group. Evaluación válida hasta ' + fechaDMA(proxRev) + '. Basada en antecedentes entregados por el cliente.', M, ALTO - 9.5, { size: 7.5, c: GRIS })
    txt('Página ' + i + ' de ' + n, M + W, ALTO - 9.5, { size: 7.5, c: GRIS, align: 'right' })
  }
  const rut = String(cliente.rut || 'sin-rut').replace(/[^0-9kK-]/g, '')
  return { doc, filename: 'Evaluacion_Credito_' + rut + '_' + fechaEv + '.pdf' }
}
