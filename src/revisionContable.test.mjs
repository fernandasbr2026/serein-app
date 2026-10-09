// Ejecutar: node src/revisionContable.test.mjs
import assert from 'node:assert/strict'
import {
  rutN, folioN, codigoTipo, nombreTipo, normalizarDoc, puntajeDoc, trabajoDoc,
  buscarRepetidos, buscarFaltantes, resumenTipos, revisar,
} from './revisionContable.js'

// ---- Normalización ----
assert.equal(rutN('76.123.456-7'), '761234567')
assert.equal(rutN('76123456-7'), '761234567')
assert.equal(rutN(' 76.123.456-k '), '76123456K')
assert.equal(rutN('0076123456-7'), '761234567')
assert.equal(rutN(''), '')
assert.equal(rutN(null), '')
assert.equal(rutN(undefined), '')

assert.equal(folioN('001780'), '1780')
assert.equal(folioN('1780.0'), '1780')
assert.equal(folioN(' 1.780 '), '1780')
assert.equal(folioN(1780), '1780')
assert.equal(folioN('A-12'), 'a12')
assert.equal(folioN(null), '')
assert.equal(folioN('0'), '0')

assert.equal(codigoTipo('33'), '33')
assert.equal(codigoTipo('033'), '33')
assert.equal(codigoTipo(61), '61')
assert.equal(codigoTipo('Factura'), '33')
assert.equal(codigoTipo('Factura Electrónica'), '33')
assert.equal(codigoTipo('FACTURA ELECTRONICA DE VENTAS'), '33')
assert.equal(codigoTipo('Factura exenta electrónica'), '34')
assert.equal(codigoTipo('Factura de compra electrónica'), '46')
assert.equal(codigoTipo('Nota de Crédito Electrónica'), '61')
assert.equal(codigoTipo('nota de credito'), '61')
assert.equal(codigoTipo('NC'), '61')
assert.equal(codigoTipo('Nota de Débito'), '56')
assert.equal(codigoTipo('Boleta'), '39')
assert.equal(codigoTipo('Guía de despacho'), '52')
assert.equal(codigoTipo(''), '')
assert.equal(codigoTipo(null), '')
assert.equal(codigoTipo('Otro doc'), 'otro doc')
assert.equal(nombreTipo('61'), 'Nota de crédito')
assert.equal(nombreTipo(''), 'Sin tipo')

// ---- Fábrica de filas ----
let seq = 0
const venta = (o = {}) => ({ id: ++seq, emission_date: '2026-09-01', document_type: '33', document_number: '1', client_name: 'Cliente', client_rut: '76.123.456-7', neto: 1000000, iva: 190000, total: 1190000, estado_pago: 'Pendiente', oculto: false, ...o })
const compra = (o = {}) => ({ id: ++seq, emission_date: '2026-09-01', document_type: '33', document_number: '1', provider_name: 'Proveedor', provider_rut: '77.000.111-2', neto: 100000, iva: 19000, document_total: 119000, estado_pago: 'Pendiente', oculto: false, ...o })
const docs = (filas, libro) => filas.map(r => normalizarDoc(r, libro))

// normalizarDoc
{
  const d = normalizarDoc(venta({ document_number: '001780', document_type: 'Factura Electrónica', origen: 'xlsx', total: null }), 'ventas')
  assert.equal(d.folio, '1780'); assert.equal(d.tipo, '33'); assert.equal(d.origen, 'excel'); assert.equal(d.total, 1190000); assert.equal(d.esNC, false)
  const nc = normalizarDoc(venta({ document_type: '61' }), 'ventas')
  assert.equal(nc.esNC, true)
  const c = normalizarDoc(compra({ document_total: 238000 }), 'compras')
  assert.equal(c.total, 238000); assert.equal(c.rut, '770001112')
}

// ---- Repetidos en ventas ----
{
  const A = venta({ document_number: '1780' })                                                        // base, sin nada
  const B = venta({ document_number: '1780', client_rut: '76123456-7', origen: 'xlsx' })              // misma factura, RUT con otro formato
  const C = venta({ document_number: '1781', emission_date: '2026-09-02' })                              // normal
  const D = venta({ document_number: '55', document_type: '61', total: 119000, neto: 100000, iva: 19000 })
  const E = venta({ document_number: '055', document_type: '61', total: 119000, neto: 100000, iva: 19000, origen: 'xlsx' }) // NC repetida
  const F = venta({ document_number: '1782', client_rut: '11.111.111-1', total: 1000 })
  const G = venta({ document_number: '1782', client_rut: '22.222.222-2', total: 1000 })               // mismo folio, otro cliente
  const H = venta({ document_number: '1783', total: 1000 })
  const I = venta({ document_number: '1783', total: 1100 })                                           // mismo folio, otro monto
  const NC77 = venta({ document_number: '77', document_type: '61' })
  const F77 = venta({ document_number: '77', document_type: '33', emission_date: '2026-09-03' })          // mismo número pero otro tipo: NO es repetido
  const J = venta({ document_number: '1790', emission_date: '2026-09-04' })
  const K = venta({ document_number: '1790', oculto: true })                                          // ya oculta: nada que corregir
  const S1 = venta({ document_number: '' }), S2 = venta({ document_number: '' })                      // sin folio
  const L = venta({ document_number: '1800', client_rut: '33.333.333-3', total: 5000000, emission_date: '2026-09-10' })
  const M = venta({ document_number: '1801', client_rut: '33.333.333-3', total: 5000000, emission_date: '2026-09-10' }) // posible doble
  const N1 = venta({ document_number: '1850', client_rut: '44.444.444-4', total: 777 })               // base sin nada
  const N2 = venta({ document_number: '1850', client_rut: '44.444.444-4', total: 777, origen: 'xlsx', area: 'Santa Rosa', ot_id: '641', estado_pago: 'Pagado', fecha_pago: '2026-09-20' })
  const P1 = venta({ document_number: '1900', client_rut: '55.555.555-5', total: 888 })
  const P2 = venta({ document_number: '1900', client_rut: '55.555.555-5', total: 888, origen: 'xlsx' })
  const Z1 = venta({ document_number: '1870', client_rut: '77.777.777-7', total: 321 })
  const Z2 = venta({ document_number: '1870', client_rut: '77.777.777-7', total: 321 })                        // idénticas y las dos de la base: da lo mismo
  const Q1 = venta({ document_number: '1860', client_rut: '66.666.666-6', total: 1000 })
  const Q2 = venta({ document_number: '1860', client_rut: '66.666.666-6', total: 1100, area: 'Istria', ot_id: '700' })  // montos distintos, pero una tiene claramente más trabajo

  const r = buscarRepetidos(docs([A, B, C, D, E, F, G, H, I, NC77, F77, J, K, S1, S2, L, M, N1, N2, P1, P2, Q1, Q2, Z1, Z2], 'ventas'), { libro: 'ventas', abonosDe: d => d.raw === P2 ? 1 : 0 })
  const claves = r.grupos.map(g => g.clase + ':' + g.tipo + ':' + g.folio).sort()
  assert.deepEqual(claves, ['cliente:33:1782', 'exacto:33:1780', 'exacto:33:1850', 'exacto:33:1870', 'exacto:33:1900', 'exacto:61:55', 'montos:33:1783', 'montos:33:1860'])
  assert.equal(r.grupos.length, 8)
  assert.equal(r.grupos[0].clase, 'exacto')                          // los seguros primero
  assert.equal(r.grupos[r.grupos.length - 1].clase, 'cliente')
  assert.equal(r.sinFolio, 2)
  assert.equal(r.copiasDeMas, 8)
  assert.equal(r.seguros, 5)

  const g1780 = r.grupos.find(g => g.folio === '1780')
  assert.equal(g1780.items.length, 2)
  assert.equal(g1780.items.find(i => i.conservar).doc.raw, A)       // la de la base
  assert.equal(g1780.efectoTotal, 1190000)                           // hoy se cuenta de más una factura entera

  const gNC = r.grupos.find(g => g.tipo === '61')
  assert.equal(gNC.efectoTotal, -119000)                             // una nota de crédito repetida resta de más

  const g1850 = r.grupos.find(g => g.folio === '1850')
  assert.equal(g1850.items.find(i => i.conservar).doc.raw, N2)       // la que tiene pago, área y OT, aunque venga de Excel

  const g1900 = r.grupos.find(g => g.folio === '1900')
  assert.equal(g1900.items.find(i => i.conservar).doc.raw, P2)       // los abonos de la ficha pesan más que venir de la base

  assert.equal(r.sospechosos.length, 1)
  assert.deepEqual(r.sospechosos[0].items.map(i => i.doc.folio).sort(), ['1800', '1801'])
  assert.ok(r.sospechosos[0].items.every(i => i.conservar === false))
  // los dudosos sin una copia claramente mejor no proponen cuál ocultar ni inventan un efecto en los totales
  for (const folio of ['1782', '1783']) {
    const g = r.grupos.find(x => x.folio === folio)
    assert.equal(g.hayGanador, false); assert.equal(g.motivo, 'dudoso'); assert.equal(g.efectoTotal, null)
    assert.ok(g.items.every(i => i.conservar === false))
  }
  // con una copia claramente mejor, sí se sugiere (y se calcula el efecto)
  const g1860 = r.grupos.find(x => x.folio === '1860')
  assert.equal(g1860.hayGanador, true)
  assert.equal(g1860.items.find(i => i.conservar).doc.raw, Q2)
  assert.equal(g1860.efectoTotal, 1000)
  assert.equal(g1780.motivo, 'origen'); assert.equal(g1850.motivo, 'trabajo')
  const g1870 = r.grupos.find(x => x.folio === '1870')
  assert.equal(g1870.motivo, 'iguales'); assert.equal(g1870.hayGanador, true); assert.equal(g1870.items.find(i => i.conservar).doc.raw, Z1)  // a igual todo, la de id menor
  assert.equal(g1870.efectoTotal, 321)
  // el efecto "seguro" cuenta solo los repetidos idénticos: 1780 (+1.190.000), 1850 (+777), 1900 (+888) y la nota de crédito 55 (-119.000)
  assert.equal(r.efectoSeguro, 1190000 + 777 + 888 + 321 - 119000)
}

// ---- Repetidos en compras: el folio es del proveedor, así que va con su RUT ----
{
  const a = compra({ document_number: '500', provider_rut: '77.000.111-2' })
  const b = compra({ document_number: '500', provider_rut: '77000111-2', origen: 'xlsx' })          // repetida
  const c = compra({ document_number: '500', provider_rut: '88.000.222-3' })                        // mismo folio, otro proveedor: normal
  const r = buscarRepetidos(docs([a, b, c], 'compras'), { libro: 'compras' })
  assert.equal(r.grupos.length, 1)
  assert.equal(r.grupos[0].clase, 'exacto')
  assert.equal(r.grupos[0].items.find(i => i.conservar).doc.raw, a)
  assert.equal(r.grupos[0].efectoTotal, 119000)
}

// ---- Folios que faltan ----
{
  const f = (n, o = {}) => venta({ document_number: String(n), emission_date: '2026-09-' + String(10 + (n % 15)).padStart(2, '0'), client_name: 'Cliente ' + n, ...o })
  const filas = [
    ...[1776, 1777, 1778, 1779, 1780, 1782, 1783, 1785, 1790].map(n => f(n)),
    f(1781, { oculto: true, document_number: '1788' }),            // ya existe 1788 oculta: cuenta como presente
    f(1792, { document_type: 'Factura Electrónica' }),             // texto = tipo 33
    ...[1, 2, 4, 5, 6].map(n => f(n, { document_type: '61' })),    // notas de crédito: numeración aparte
    ...[100, 101, 102, 103, 104, 300].map(n => f(n, { document_type: '34' })), // un salto enorme: período sin cargar
    f(9, { document_type: '39' }), f(11, { document_type: '39' }), // solo 2 boletas: no se revisan
    venta({ document_number: 'ABC-1' }),                           // folio no numérico: se ignora
    f(1780, { client_rut: '9.999.999-9' }),                        // folio repetido: no inventa faltantes
  ]
  const r = buscarFaltantes(docs(filas, 'ventas'))
  const t33 = r.tipos.find(t => t.tipo === '33')
  assert.deepEqual(t33.tramos.map(t => [t.desde, t.hasta, t.cantidad]), [[1781, 1781, 1], [1784, 1784, 1], [1786, 1787, 2], [1789, 1789, 1], [1791, 1791, 1]])
  assert.equal(t33.faltan, 6)
  assert.equal(t33.primero.folio, 1776); assert.equal(t33.ultimo.folio, 1792)
  assert.equal(t33.tramos[0].antes.folio, 1780); assert.equal(t33.tramos[0].despues.folio, 1782)
  assert.equal(t33.tramos[0].antes.nombre, 'Cliente 1780')
  assert.ok(!t33.tramos.some(t => t.grande))
  const t61 = r.tipos.find(t => t.tipo === '61')
  assert.deepEqual(t61.tramos.map(t => [t.desde, t.hasta]), [[3, 3]])
  const t34 = r.tipos.find(t => t.tipo === '34')
  assert.equal(t34.tramos.length, 1); assert.equal(t34.tramos[0].grande, true); assert.equal(t34.faltan, 0); assert.equal(t34.tramosGrandes, 1)
  assert.equal(r.tipos.find(t => t.tipo === '39'), undefined)
  assert.equal(r.faltan, 6 + 1)
  assert.equal(r.tramosGrandes, 1)
}

// ---- Tipos que traen los libros ----
{
  const t = resumenTipos([venta({ document_type: 'Nota de Crédito Electrónica' }), venta({ document_type: 'Nota de Crédito Electrónica' }), venta({ document_type: '61' }), venta({ document_type: '33' }), venta({ document_type: 'Factura' })])
  const nc = t.find(x => x.texto === 'Nota de Crédito Electrónica')
  assert.equal(nc.cantidad, 2); assert.equal(nc.codigo, '61'); assert.equal(nc.libroNoLaResta, true)
  assert.equal(t.find(x => x.texto === '61').libroNoLaResta, false)
  assert.equal(t.find(x => x.texto === 'Factura').codigo, '33')
}

// ---- Todo junto ----
{
  const r = revisar({
    ventas: [venta({ document_number: '10' }), venta({ document_number: '10', origen: 'xlsx' }), venta({ document_number: '11', document_type: 'Nota de Crédito Electrónica' })],
    compras: [compra({ document_number: '5' }), compra({ document_number: '5', origen: 'xlsx' })],
    abonosVentas: new Map(),
  })
  assert.equal(r.resumen.gruposVentas, 1)
  assert.equal(r.resumen.gruposCompras, 1)
  assert.equal(r.resumen.alertasTipo, 1)
  assert.equal(r.ventas.documentos, 3)
  assert.equal(r.compras.documentos, 2)
  // un libro vacío no rompe nada
  const vacio = revisar({})
  assert.equal(vacio.resumen.gruposVentas, 0); assert.equal(vacio.faltantes.tipos.length, 0)
}

// puntaje sin datos extra
assert.equal(puntajeDoc(normalizarDoc(venta({ origen: 'xlsx' }), 'ventas')), 0)
assert.equal(puntajeDoc(normalizarDoc(venta(), 'ventas')), 2)                                // la de la base desempata
assert.equal(trabajoDoc(normalizarDoc(venta(), 'ventas')), 0)                                // pero no cuenta como trabajo
assert.equal(trabajoDoc(normalizarDoc(venta({ estado_pago: 'Pagado', area: 'Istria', ot_id: '5', oc: 'X' }), 'ventas'), 2), 20 + 5 + 2 + 2 + 1)

console.log('revisionContable OK — normalización, repetidos (facturas y notas de crédito), folios que faltan y tipos de documento')
