import { jsPDF } from 'jspdf'
import { LOGO_SEREIN_DATA } from './logoSereinData.js'
import { mezclarParams } from './creditoCalculo.js'

// Resumen de crédito: la versión corta y amable del informe, con el formato del informe del Preuniversitario
// (banda de color con título y logo, datos del cliente, texto que comenta el resultado, pie "Informe realizado por…")
// en la paleta de Serein. Se genera en el navegador con jsPDF; solo usa caracteres de la fuente estándar.
// Ideas de la biblioteca de diseño: lime-metrics (fila de cifras con una tarjeta de acento), mesh-sunset (fondo suave
// naranja, recoloreado), focus-reveal (marco de cuatro esquinas) y card-bookmark (etiqueta con muesca).

const CARBON = [34, 38, 42], NARANJA = [218, 102, 51], NARANJA_OSC = [186, 78, 32], GRIS = [105, 113, 127], GRIS_CLARO = [225, 229, 233]
const VERDE = [27, 158, 93], ROJO = [197, 69, 61], AMBAR = [201, 134, 11], PERA = [255, 246, 241], FONDO = [248, 249, 250]
const ANCHO = 215.9, ALTO = 279.4, M = 18, W = ANCHO - M * 2
const CAT_COLOR = { A: VERDE, B: [14, 122, 143], C: AMBAR, D: ROJO }
const clp = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const fechaDMA = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '-' + m[2] + '-' + m[1] : (iso || '-') }
const hoyISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
const addMeses = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
const mezcla = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

// ---- Texto que comenta el resultado (se arma con los datos de la evaluación; no inventa nada) ----
export function comentariosCredito({ cliente, evaluacion, params }) {
  const p = mezclarParams(params)
  const ev = evaluacion || {}
  const res = ev.resultado || {}
  const detalle = res.detalle || []
  const filtros = (res.filtros || []).filter(f => f.activo)
  const cat = ev.categoria
  const nombre = cliente.razon_social || 'El cliente'
  const minus = t => /^[A-ZÁÉÍÓÚ]{2,}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1)
  const frase = d => minus(d.factor) + ' (' + String(d.dato).replace(/^Sin dato.*/, 'sin dato').replace('buena(s)', 'buenas') + ')'
  const aFavor = detalle.filter(d => !d.pendiente && !d.noAplica && d.puntos >= d.max * 0.8 && d.puntos > 0)
  const aVigilar = detalle.filter(d => !d.pendiente && !d.noAplica && d.puntos < d.max * 0.8)
  const pendientes = detalle.filter(d => d.pendiente)
  const parrafos = []

  let p1 = nombre + ' queda en categoría ' + cat + ' con ' + (ev.puntaje != null ? ev.puntaje : '-') + ' puntos de 100'
  p1 += res.normalizado ? ' (calculados sobre los factores que aplican, porque algunos antecedentes se dieron por completos sin documento). ' : (res.parcial ? ' (puntaje parcial: todavía faltan antecedentes). ' : '. ')
  p1 += res.condicionTexto || ''
  parrafos.push(p1.trim())

  if (aFavor.length) parrafos.push('Lo que más pesa a favor: ' + aFavor.map(frase).join(', ') + '.')
  if (aVigilar.length || filtros.length) {
    const partes = []
    if (filtros.length) partes.push('hoy la evaluación tiene condiciones que la limitan (' + filtros.map(f => f.texto.charAt(0).toLowerCase() + f.texto.slice(1)).join('; ') + ')')
    if (aVigilar.length) partes.push('conviene vigilar ' + aVigilar.map(frase).join(', '))
    parrafos.push(partes.join(', y ').replace(/^./, c => c.toUpperCase()) + '.')
  }
  if (pendientes.length) parrafos.push('Aún faltan antecedentes que pueden mejorar la evaluación: ' + pendientes.map(d => minus(d.factor)).join(', ') + '.' + (res.potencial && res.potencial.categoria !== cat ? ' Si salen con el mejor resultado, la categoría podría subir a ' + res.potencial.categoria + (res.potencial.linea > 0 ? ' con una línea de hasta ' + clp(res.potencial.linea) : '') + '.' : ''))
  const alertas = ((evaluacion && evaluacion.datos_extraidos && evaluacion.datos_extraidos.otros) || []).flatMap(o => (o && o.alertas) || [])
  if (alertas.length) parrafos.push('Alertas en los documentos revisados: ' + alertas.join('; ') + '.')
  const prox = addMeses(ev.fecha || hoyISO(), res.revisionMeses || (p.categorias[cat] || {}).meses_revision || 6)
  parrafos.push('Esta evaluación se revisa nuevamente el ' + fechaDMA(prox) + ', o antes si cambia la situación del cliente.')
  return { parrafos, prox }
}

export function generarResumenCredito({ cliente, evaluacion, docs = [], params, numero = 1 }) {
  const p = mezclarParams(params)
  const ev = evaluacion || {}
  const res = ev.resultado || {}
  const cat = ev.categoria || 'D'
  const colorCat = CAT_COLOR[cat] || CARBON
  const { parrafos, prox } = comentariosCredito({ cliente, evaluacion, params })
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  let y = 0

  const color = c => doc.setTextColor(c[0], c[1], c[2])
  const txt = (t, x, yy, { size = 10, bold = false, c = CARBON, align = 'left' } = {}) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); color(c); doc.text(String(t == null ? '' : t), x, yy, { align }) }
  const opacidad = o => { try { doc.setGState(new doc.GState({ opacity: o })) } catch (e) {} }
  const nuevaPagina = () => { doc.addPage(); y = 22 }
  const ensure = h => { if (y + h > ALTO - 24) nuevaPagina() }
  const titulo = (t, sub) => { ensure(sub ? 16 : 11); txt(t, M, y, { size: 13.5, bold: true, c: NARANJA_OSC }); y += sub ? 5 : 1; if (sub) { txt(sub, M, y, { size: 8.5, c: GRIS }); y += 3 } y += 4.5 }
  const parrafo = (t, { size = 10, lh = 4.9, c = CARBON, x = M, ancho = W, gap = 2 } = {}) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size)
    doc.splitTextToSize(String(t), ancho).forEach(l => { ensure(lh); txt(l, x, y, { size, c }); y += lh })
    y += gap
  }

  // ---------- Banda superior (mesh-sunset recoloreado: carbón a naranja con brillos suaves) ----------
  const alto = 40
  doc.saveGraphicsState()
  doc.rect(0, 0, ANCHO, alto, null); doc.clip(); doc.discardPath()
  for (let i = 0; i < 110; i++) { const t = i / 109; const c = mezcla(CARBON, NARANJA, Math.pow(t, 1.35)); doc.setFillColor(c[0], c[1], c[2]); doc.rect((ANCHO / 110) * i - 0.1, 0, ANCHO / 110 + 0.4, alto, 'F') }
  for (let k = 0; k < 16; k++) { opacidad(0.035); doc.setFillColor(255, 190, 150); doc.circle(ANCHO - 20, 8, 14 + k * 3.2, 'F') }
  for (let k = 0; k < 12; k++) { opacidad(0.03); doc.setFillColor(255, 120, 70); doc.circle(ANCHO * 0.52, alto + 4, 8 + k * 3.4, 'F') }
  opacidad(0.16); doc.setFillColor(255, 255, 255)
  ;[[128, 0, 14], [146, 0, 8]].forEach(([x0, y0, w]) => { doc.triangle(x0 + 8, y0, x0 + 8 + w, y0, x0, alto, 'F'); doc.triangle(x0 + w, alto, x0, alto, x0 + 8 + w, y0, 'F') })
  opacidad(1)
  doc.restoreGraphicsState()
  // tarjeta del logo
  doc.setFillColor(255, 255, 255); doc.roundedRect(ANCHO - M - 54, 8, 54, 25, 3.5, 3.5, 'F')
  try { doc.addImage(LOGO_SEREIN_DATA, 'PNG', ANCHO - M - 54 + 8, 12, 38, 15.6) } catch (e) { txt('SEREIN GROUP', ANCHO - M - 27, 22, { size: 11, bold: true, c: NARANJA, align: 'center' }) }
  txt('Informe de crédito', M, 18.5, { size: 24, c: [255, 255, 255] })
  txt(cliente.razon_social || 'Cliente', M, 26.5, { size: 12, c: [255, 255, 255] })
  txt('Evaluación N° ' + numero + '  ·  ' + fechaDMA(ev.fecha || hoyISO()) + '  ·  ADM-CR-02', M, 33.5, { size: 8.5, c: [255, 225, 205] })
  y = alto + 9

  // ---------- Datos del cliente ----------
  const datosCli = [['Cliente', cliente.razon_social], ['RUT', cliente.rut], ['Giro', cliente.giro], ['Representante legal', cliente.representante_legal], ['Dirección', cliente.direccion], ['Contacto de pagos', [cliente.contacto_pagos, cliente.email_facturas].filter(Boolean).join(' · ')]].filter(([, v]) => v)
  const colX = [M, M + W / 2 + 4]
  datosCli.forEach(([k, v], i) => {
    const x = colX[i % 2]
    if (i % 2 === 0 && i > 0) y += 10
    txt(k.toUpperCase(), x, y, { size: 7, c: GRIS })
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5)
    txt(doc.splitTextToSize(String(v), W / 2 - 6)[0], x, y + 4.6, { size: 10.5, bold: true })
  })
  y += 12

  // ---------- Resultado: fila de cifras (lime-metrics: una tarjeta de acento) ----------
  titulo('Resultado de la evaluación', ev.estado === 'aprobada' ? 'Aprobada por Gerencia' : ev.estado === 'rechazada' ? 'Rechazada' : 'Pendiente de aprobación de Gerencia')
  const aprobado = ev.estado === 'aprobada'
  const tarjetas = [
    { k: 'Categoría', v: cat, acento: true },
    { k: aprobado ? 'Línea aprobada' : 'Línea sugerida', v: clp(aprobado ? ev.linea_aprobada : ev.linea_sugerida), marco: true },
    { k: 'Anticipo mínimo', v: Math.round((Number(ev.anticipo_minimo) || 0) * 100) + ' %' },
    { k: 'Crédito', v: cat === 'D' ? 'Sin crédito' : p.plazo_credito_dias + ' días' },
  ]
  const gap = 4, tw = (W - gap * 3) / 4, th = 23
  ensure(th + 6)
  tarjetas.forEach((t, i) => {
    const x = M + i * (tw + gap)
    if (t.acento) {
      doc.setFillColor(colorCat[0], colorCat[1], colorCat[2]); doc.roundedRect(x, y, tw, th, 3, 3, 'F')
      txt(t.k.toUpperCase(), x + 5, y + 7.5, { size: 7, c: [255, 255, 255] }); txt(t.v, x + 5, y + 18, { size: 22, bold: true, c: [255, 255, 255] })
    } else {
      doc.setFillColor(FONDO[0], FONDO[1], FONDO[2]); doc.setDrawColor(GRIS_CLARO[0], GRIS_CLARO[1], GRIS_CLARO[2]); doc.setLineWidth(0.3); doc.roundedRect(x, y, tw, th, 3, 3, 'FD')
      txt(t.k.toUpperCase(), x + 5, y + 7.5, { size: 7, c: GRIS }); doc.setFont('helvetica', 'bold'); doc.setFontSize(t.v.length > 10 ? 12.5 : 16)
      txt(t.v, x + 5, y + 17.5, { size: t.v.length > 10 ? 12.5 : 15, bold: true })
      if (t.marco) { // focus-reveal: marco de cuatro esquinas alrededor de la cifra clave
        doc.setDrawColor(NARANJA[0], NARANJA[1], NARANJA[2]); doc.setLineWidth(0.7); const l = 4, o = 1.8
        ;[[x + o, y + o, 1, 1], [x + tw - o, y + o, -1, 1], [x + o, y + th - o, 1, -1], [x + tw - o, y + th - o, -1, -1]].forEach(([cx, cy, sx, sy]) => { doc.line(cx, cy, cx + sx * l, cy); doc.line(cx, cy, cx, cy + sy * l) })
      }
    }
  })
  y += th + 7

  // ---------- Puntaje en la escala A-D ----------
  if (ev.puntaje != null) {
    ensure(24)
    txt('Puntaje ' + ev.puntaje + ' de 100' + (res.parcial ? '  (parcial: faltan antecedentes)' : '') + (res.normalizado ? '  (sobre los factores que aplican)' : ''), M, y, { size: 9.5, bold: true })
    y += 5
    const zonas = [['D', 0, p.categorias.C.puntaje_minimo], ['C', p.categorias.C.puntaje_minimo, p.categorias.B.puntaje_minimo], ['B', p.categorias.B.puntaje_minimo, p.categorias.A.puntaje_minimo], ['A', p.categorias.A.puntaje_minimo, 100]]
    zonas.forEach(([k, a, b]) => {
      const x = M + (a / 100) * W, w = ((b - a) / 100) * W
      const c = CAT_COLOR[k]; const suave = mezcla(c, [255, 255, 255], k === cat ? 0.35 : 0.78)
      doc.setFillColor(suave[0], suave[1], suave[2]); doc.rect(x, y, w - 0.6, 4.2, 'F')
      txt(k + '  ' + a + (k === 'A' ? '-100' : '-' + (b - 1)), x + w / 2, y + 9.2, { size: 6.8, c: GRIS, align: 'center' })
    })
    const mx = M + (Math.max(0, Math.min(100, ev.puntaje)) / 100) * W
    doc.setFillColor(CARBON[0], CARBON[1], CARBON[2]); doc.circle(mx, y + 2.1, 2.6, 'F'); doc.setFillColor(255, 255, 255); doc.circle(mx, y + 2.1, 1, 'F')
    y += 17
  }

  // ---------- Comentario (como la retroalimentación del informe del Preu) ----------
  titulo('Lo que dice la evaluación', 'En palabras simples, con los datos del cliente')
  parrafos.forEach(t => parrafo(t))
  y += 1

  // ---------- Condiciones de pago aprobadas ----------
  titulo('Condiciones de pago aprobadas')
  const filas = [
    ['Plazo / modalidad', !aprobado ? 'Sin crédito aprobado por ahora: pago anticipado o contra entrega.' : (cat === 'C' ? 'Anticipo de ' + Math.round(p.categorias.C.anticipo_minimo * 100) + '% y el saldo a crédito a ' + p.plazo_credito_dias + ' días con pagaré.' : 'Crédito a ' + p.plazo_credito_dias + ' días, sin anticipo.')],
    ['Anticipo mínimo', aprobado ? Math.round((Number(ev.anticipo_minimo) || 0) * 100) + ' %' : '50 % y saldo contra entrega'],
    ...(aprobado ? [['Tope por orden de compra', clp(ev.linea_aprobada) + ' (línea aprobada; el saldo que exceda el cupo se paga como anticipo)']] : []),
    ['OC grandes', 'Desde ' + clp(p.oc_grande_desde) + ' con IVA: anticipo mínimo ' + Math.round(p.anticipo_oc_grande * 100) + ' % y el saldo a crédito se parte en estados de pago por el cupo disponible.'],
    ...(aprobado ? [['Garantía', ev.garantia || '-']] : []),
  ]
  filas.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    const ls = doc.splitTextToSize(String(v), W - 52)
    ensure(ls.length * 4.6 + 1.5)
    txt(k, M, y, { size: 9.5, c: GRIS })
    ls.forEach((l, i) => txt(l, M + 52, y + i * 4.6, { size: 9.5, bold: true }))
    y += ls.length * 4.6 + 1.4
  })

  // ---------- Pie en todas las hojas ----------
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    if (i > 1) { doc.setFillColor(NARANJA[0], NARANJA[1], NARANJA[2]); doc.rect(0, 0, ANCHO, 6, 'F') }
    doc.setDrawColor(GRIS_CLARO[0], GRIS_CLARO[1], GRIS_CLARO[2]); doc.setLineWidth(0.3); doc.line(M, ALTO - 17, M + W, ALTO - 17)
    txt('Informe realizado por ', M, ALTO - 11.5, { size: 9, c: GRIS }); txt('Serein Group', M + doc.getTextWidth('Informe realizado por '), ALTO - 11.5, { size: 9, bold: true, c: NARANJA_OSC })
    txt('Documento interno. Evaluación válida hasta ' + fechaDMA(prox) + '. Basada en antecedentes entregados por el cliente.', M, ALTO - 7, { size: 7.5, c: GRIS })
    txt(i + ' de ' + n, M + W, ALTO - 11.5, { size: 8.5, c: GRIS, align: 'right' })
  }
  const rut = String(cliente.rut || 'sin-rut').replace(/[^0-9kK-]/g, '')
  return { doc, filename: 'Resumen_Credito_' + rut + '_' + (ev.fecha || hoyISO()) + '.pdf' }
}
