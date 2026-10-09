// Revisión contable: busca documentos repetidos y folios que faltan en los libros de ventas y de compras.
//
// Funciones puras (sin pantalla ni base de datos): reciben las filas tal como las guardan libro_ventas y
// libro_compras y devuelven lo encontrado. Esta primera versión solo MIRA: nada de aquí modifica un documento.
//
// Qué identifica a un documento:
//  · Ventas: tipo + folio. El folio es de la propia empresa y cada tipo (factura, factura exenta, nota de
//    crédito…) lleva su numeración, así que dos filas con el mismo tipo y folio son el mismo documento
//    aunque el cliente o el RUT estén escritos distinto.
//  · Compras: tipo + folio + RUT del proveedor (cada proveedor numera por su cuenta).
// Los libros y la sincronización con Defontana comparan "folio|RUT" tal cual está escrito: no distinguen el tipo
// ni que el RUT venga con o sin puntos. Por eso aquí todo se normaliza antes de comparar.

// ---------- Normalización ----------

// '76.123.456-7', '76123456-7' y ' 76.123.456-7 ' → '761234567'; sin ceros a la izquierda.
export const rutN = v => String(v ?? '').replace(/[^0-9kK]/g, '').toUpperCase().replace(/^0+/, '')

// '001780', '1780.0' (Excel), ' 1.780 ' → '1780'. Si trae letras se deja en minúscula sin signos.
export function folioN(v) {
  let s = String(v ?? '').trim().replace(/\.0+$/, '').replace(/[^0-9a-zA-Z]/g, '')
  if (/^\d+$/.test(s)) s = String(parseInt(s, 10))
  return s.toLowerCase()
}

const sinTildes = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// Código SII del tipo de documento. El SII entrega '33', '61'…, Defontana y la carga manual entregan texto
// ('Factura', 'Nota de Crédito Electrónica'): todo se lleva a un mismo código para poder compararlo.
export function codigoTipo(valor) {
  const t = String(valor ?? '').trim()
  if (!t) return ''
  if (/^\d{1,3}$/.test(t)) return String(parseInt(t, 10))
  const n = sinTildes(t)
  if (/nota.*credito/.test(n) || /^nc\b/.test(n)) return '61'
  if (/nota.*debito/.test(n) || /^nd\b/.test(n)) return '56'
  if (/factura.*exent/.test(n)) return '34'
  if (/factura.*compra/.test(n)) return '46'
  if (/factura/.test(n)) return '33'
  if (/boleta/.test(n)) return '39'
  if (/guia/.test(n)) return '52'
  return n
}

const NOMBRES_TIPO = { 33: 'Factura', 34: 'Factura exenta', 39: 'Boleta', 46: 'Factura de compra', 52: 'Guía de despacho', 56: 'Nota de débito', 61: 'Nota de crédito' }
export const nombreTipo = codigo => NOMBRES_TIPO[codigo] || (codigo ? String(codigo) : 'Sin tipo')

// Los libros solo reconocen como nota de crédito el '61' escrito exacto (LibroVentasModule/LibroComprasModule.esNC).
export const librosLaTratanComoNC = tipoCrudo => String(tipoCrudo ?? '').trim() === '61'

const aISO = f => String(f ?? '').slice(0, 10)
const entero = v => { const n = Math.round(Number(v)); return isNaN(n) ? 0 : n }

// Fila de libro_ventas / libro_compras → forma común para comparar.
export function normalizarDoc(r, libro) {
  const ventas = libro === 'ventas'
  const neto = entero(r.neto)
  const iva = entero(r.iva)
  const total = entero(ventas ? r.total : r.document_total) || (neto + iva)
  const tipo = codigoTipo(r.document_type)
  return {
    id: r.id,
    libro,
    origen: r.origen === 'xlsx' ? 'excel' : 'base',
    tipo,
    tipoTexto: String(r.document_type ?? '').trim(),
    folio: folioN(r.document_number),
    folioTxt: String(r.document_number ?? '').trim(),
    rut: rutN(ventas ? r.client_rut : r.provider_rut),
    rutTxt: String((ventas ? r.client_rut : r.provider_rut) ?? '').trim(),
    nombre: String((ventas ? r.client_name : r.provider_name) ?? '').trim(),
    fecha: aISO(r.emission_date),
    neto, iva, total,
    oculto: !!r.oculto,
    estado: String(r.estado_pago ?? '').trim(),
    area: String(r.area ?? '').trim(),
    ot: String(r.ot_id ?? '').trim(),
    esNC: tipo === '61',
    raw: r,
  }
}

// Efecto del documento en los totales: las notas de crédito restan.
export const signo = d => d.esNC ? -1 : 1

// ---------- A cuál conservar ----------

// "Cuánto trabajo tiene encima" una copia: pago, abonos, área, OT, OC… La que tiene más es la que conviene conservar.
// `abonos` = cantidad de abonos registrados en su ficha de Facturas por área.
export function trabajoDoc(d, abonos = 0) {
  const r = d.raw || {}
  let p = 0
  p += (Number(abonos) || 0) * 10
  if (/pagad|factoring/i.test(d.estado)) p += 5
  if (r.fecha_pago) p += 3
  if (d.area) p += 2
  if (d.ot) p += 2
  for (const k of ['oc', 'nv', 'cc_ot', 'tipo_compra', 'centro_costo']) if (String(r[k] ?? '').trim()) p += 1
  return p
}
// Para desempatar entre copias idénticas se prefiere la que viene de la base de datos (Defontana) a la de Excel.
export const puntajeDoc = (d, abonos = 0) => trabajoDoc(d, abonos) + (d.origen === 'base' ? 2 : 0)

// ---------- Repetidos ----------

const dentroDe = (a, b, tol = 1) => Math.abs(a - b) <= tol

// Clase de un grupo con el mismo folio:
//  · 'exacto'  → mismo RUT (o sin RUT) y mismo total: es el mismo documento cargado dos veces.
//  · 'montos'  → mismo RUT pero el total no coincide.
//  · 'cliente' → el RUT no coincide.
function claseGrupo(docs) {
  const ruts = [...new Set(docs.map(d => d.rut).filter(Boolean))]
  if (ruts.length > 1) return 'cliente'
  const t0 = docs[0].total
  return docs.every(d => dentroDe(d.total, t0)) ? 'exacto' : 'montos'
}

export const ETIQUETA_CLASE = {
  exacto: 'Repetido seguro',
  montos: 'Mismo folio, montos distintos: revisar',
  cliente: 'Mismo folio, distinto cliente: revisar',
  doble: 'Posible doble ingreso (distinto folio)',
}

// `abonosDe(doc)` → abonos de la ficha de ese documento (opcional). Solo se miran documentos visibles: lo ya
// oculto no cuenta en los totales, así que no hay nada que corregir ahí.
export function buscarRepetidos(docs, { libro, abonosDe = () => 0 } = {}) {
  const visibles = docs.filter(d => !d.oculto)
  const claveDe = libro === 'compras' ? d => d.tipo + '|' + d.folio + '|' + d.rut : d => d.tipo + '|' + d.folio
  const porClave = new Map()
  let sinFolio = 0
  for (const d of visibles) {
    if (!d.folio) { sinFolio++; continue }
    const k = claveDe(d)
    if (!porClave.has(k)) porClave.set(k, [])
    porClave.get(k).push(d)
  }
  const enGrupo = new Set()
  const grupos = []
  for (const [clave, lista] of porClave) {
    if (lista.length < 2) continue
    const trabajo = new Map(lista.map(d => [d, trabajoDoc(d, abonosDe(d))]))
    // la que tiene más trabajo encima; a igual trabajo, la de la base y luego la de id menor (orden estable)
    const orden = [...lista].sort((a, b) => trabajo.get(b) - trabajo.get(a) || (a.origen === 'base' ? -1 : 1) - (b.origen === 'base' ? -1 : 1) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
    const clase = claseGrupo(lista)
    const masTrabajo = trabajo.get(orden[0]) > trabajo.get(orden[1])
    // Si las copias son idénticas da lo mismo cuál se deja. Si difieren (monto o cliente) solo se sugiere una cuando
    // una tiene claramente más trabajo encima (venir de la base no basta: el dato dudoso puede ser el de la base);
    // si no, la decisión es de quien revisa el documento real.
    const hayGanador = clase === 'exacto' || masTrabajo
    const motivo = masTrabajo ? 'trabajo' : (clase === 'exacto' ? (orden[0].origen !== orden[1].origen ? 'origen' : 'iguales') : 'dudoso')
    const items = orden.map((d, i) => ({ doc: d, conservar: hayGanador && i === 0, puntaje: puntajeDoc(d, abonosDe(d)) }))
    const sobran = items.filter(i => !i.conservar)
    lista.forEach(d => enGrupo.add(d))
    grupos.push({
      clave,
      clase,
      hayGanador,
      motivo,
      tipo: lista[0].tipo,
      folio: lista[0].folio,
      folioTxt: lista[0].folioTxt,
      items,
      // lo que hoy se cuenta de más en los totales (con signo: una nota de crédito repetida resta de más);
      // null cuando todavía no se sabe cuál copia es la correcta
      efectoTotal: hayGanador ? sobran.reduce((a, i) => a + signo(i.doc) * i.doc.total, 0) : null,
    })
  }
  // Posibles dobles con distinto folio: mismo tipo, RUT, total y fecha. Nunca van preseleccionados.
  const porHuella = new Map()
  for (const d of visibles) {
    if (enGrupo.has(d) || !d.folio || !d.rut || !d.fecha || d.total <= 0) continue
    const k = [d.tipo, d.rut, d.total, d.fecha].join('|')
    if (!porHuella.has(k)) porHuella.set(k, [])
    porHuella.get(k).push(d)
  }
  const sospechosos = []
  for (const [clave, lista] of porHuella) {
    if (new Set(lista.map(d => d.folio)).size < 2) continue
    sospechosos.push({ clave, clase: 'doble', tipo: lista[0].tipo, items: lista.map(d => ({ doc: d, conservar: false, puntaje: puntajeDoc(d, abonosDe(d)) })) })
  }
  const prioridad = { exacto: 0, montos: 1, cliente: 2 }
  const montoDe = g => Math.max(...g.items.map(i => i.doc.total))
  grupos.sort((a, b) => prioridad[a.clase] - prioridad[b.clase] || montoDe(b) - montoDe(a))
  sospechosos.sort((a, b) => b.items[0].doc.total - a.items[0].doc.total)
  return {
    grupos,
    sospechosos,
    sinFolio,
    revisados: visibles.length,
    copiasDeMas: grupos.reduce((a, g) => a + g.items.length - 1, 0),
    // lo que inflan los totales los repetidos seguros (los dudosos se suman recién cuando se decide cuál es la correcta)
    seguros: grupos.filter(g => g.clase === 'exacto').length,
    efectoSeguro: grupos.filter(g => g.clase === 'exacto').reduce((a, g) => a + g.efectoTotal, 0),
  }
}

// ---------- Folios que faltan (solo ventas) ----------

export const TRAMO_GRANDE = 40   // más folios que esto seguidos = casi seguro un período sin cargar, no folios sueltos
const MIN_DOCS_PARA_REVISAR_SALTOS = 5

// Para cada tipo de documento recorre los folios cargados y lista los números que no aparecen entre el menor y el
// mayor. Los documentos ocultos cuentan como presentes: ocultar una copia no hace que el folio deje de existir.
export function buscarFaltantes(docs) {
  const porTipo = new Map()
  for (const d of docs) {
    if (!d.tipo || !/^\d+$/.test(d.folio)) continue
    if (!porTipo.has(d.tipo)) porTipo.set(d.tipo, [])
    porTipo.get(d.tipo).push(d)
  }
  const tipos = []
  for (const [tipo, lista] of porTipo) {
    if (lista.length < MIN_DOCS_PARA_REVISAR_SALTOS) continue
    const porFolio = new Map()
    for (const d of lista) {
      const n = parseInt(d.folio, 10)
      if (!porFolio.has(n)) porFolio.set(n, d)
      else if (!porFolio.get(n).fecha && d.fecha) porFolio.set(n, d)
    }
    const folios = [...porFolio.keys()].sort((a, b) => a - b)
    const tramos = []
    for (let i = 1; i < folios.length; i++) {
      const antes = folios[i - 1], despues = folios[i]
      if (despues - antes <= 1) continue
      const a = porFolio.get(antes), b = porFolio.get(despues)
      const cantidad = despues - antes - 1
      tramos.push({
        desde: antes + 1,
        hasta: despues - 1,
        cantidad,
        grande: cantidad > TRAMO_GRANDE,
        antes: { folio: antes, fecha: a.fecha, nombre: a.nombre },
        despues: { folio: despues, fecha: b.fecha, nombre: b.nombre },
      })
    }
    const sueltos = tramos.filter(t => !t.grande)
    tipos.push({
      tipo,
      nombre: nombreTipo(tipo),
      documentos: folios.length,
      primero: { folio: folios[0], fecha: porFolio.get(folios[0]).fecha },
      ultimo: { folio: folios[folios.length - 1], fecha: porFolio.get(folios[folios.length - 1]).fecha },
      tramos,
      faltan: sueltos.reduce((a, t) => a + t.cantidad, 0),
      tramosGrandes: tramos.length - sueltos.length,
    })
  }
  tipos.sort((a, b) => b.documentos - a.documentos)
  return { tipos, faltan: tipos.reduce((a, t) => a + t.faltan, 0), tramosGrandes: tipos.reduce((a, t) => a + t.tramosGrandes, 0) }
}

// ---------- Tipos de documento que traen los libros ----------

// Qué escritos distintos hay en "tipo de documento" y cómo los entiende el sistema. Sirve para ver, por ejemplo, si
// las notas de crédito de Defontana llegan como texto: los libros solo restan el '61' exacto y sumarían como venta
// una "Nota de Crédito Electrónica".
export function resumenTipos(filas) {
  const m = new Map()
  for (const r of filas) {
    const crudo = String(r.document_type ?? '').trim()
    if (!m.has(crudo)) m.set(crudo, { texto: crudo, codigo: codigoTipo(crudo), nombre: nombreTipo(codigoTipo(crudo)), cantidad: 0 })
    m.get(crudo).cantidad++
  }
  return [...m.values()].map(t => ({ ...t, libroNoLaResta: t.codigo === '61' && !librosLaTratanComoNC(t.texto) })).sort((a, b) => b.cantidad - a.cantidad)
}

// ---------- Todo junto ----------

// `ventas` y `compras`: filas de cada libro (ya unidas con las importadas desde Excel, como las muestran los libros).
// `abonosVentas`: Map libroId → cantidad de abonos de la ficha de Facturas por área.
export function revisar({ ventas = [], compras = [], abonosVentas = new Map() } = {}) {
  const dv = ventas.map(r => normalizarDoc(r, 'ventas'))
  const dc = compras.map(r => normalizarDoc(r, 'compras'))
  const repetidosVentas = buscarRepetidos(dv, { libro: 'ventas', abonosDe: d => abonosVentas.get('LV' + d.id) || 0 })
  const repetidosCompras = buscarRepetidos(dc, { libro: 'compras' })
  const faltantes = buscarFaltantes(dv)
  const tiposVentas = resumenTipos(ventas)
  const tiposCompras = resumenTipos(compras)
  const alertasTipo = [...tiposVentas, ...tiposCompras].filter(t => t.libroNoLaResta).length
  return {
    ventas: { documentos: dv.length, ...repetidosVentas, tipos: tiposVentas },
    compras: { documentos: dc.length, ...repetidosCompras, tipos: tiposCompras },
    faltantes,
    resumen: {
      gruposVentas: repetidosVentas.grupos.length,
      gruposCompras: repetidosCompras.grupos.length,
      sospechosos: repetidosVentas.sospechosos.length + repetidosCompras.sospechosos.length,
      foliosQueFaltan: faltantes.faltan,
      tramosGrandes: faltantes.tramosGrandes,
      alertasTipo,
    },
  }
}
