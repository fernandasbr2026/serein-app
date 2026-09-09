// Importador del historico de control de planta por cliente (Fase F3 del
// plan — ver C:\Users\maria\.claude\plans\sorted-singing-sundae.md). Lee un
// Excel con la forma de "Control_Planta_Kronos.xlsx" (hojas "Lotes
// (producción)" y "Piezas (despacho)" — la hoja "Tablero" no se importa,
// es solo un resumen calculado) y arma un plan de importacion que NUNCA se
// aplica solo: siempre pasa primero por una vista previa donde se confirma
// cuantos lotes/piezas se van a crear o completar.
import * as XLSX from 'xlsx'

const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const normMarcaKey = s => String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s-]+/g, '-')

function hojaAFilas(wb, nombreParcial) {
  const nombre = wb.SheetNames.find(n => norm(n).includes(nombreParcial))
  if (!nombre) return null
  return XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, blankrows: false })
}

// Busca la fila de encabezados de verdad, no la primera fila con texto —
// estos Excel suelen traer 1-2 filas de título/nota arriba de la tabla
// (ej. "Control de producción por LOTE de recepción"), que tienen un solo
// texto largo en una sola celda y confundirían a un chequeo por longitud.
// Se exige una fila con varias columnas Y una celda que sea exactamente
// (o empiece con) el token esperado — "oc" está en ambas hojas de Kronos.
function encontrarEncabezado(filas, tokenRequerido = 'oc') {
  for (let i = 0; i < Math.min(filas.length, 10); i++) {
    const fila = filas[i] || []
    if (fila.length < 3) continue
    const celdas = fila.map(norm)
    if (celdas.some(c => c === tokenRequerido || c.startsWith(tokenRequerido))) return i
  }
  return 0
}

function colBuscador(hdr) {
  return (...nombres) => { for (const n of nombres) { const idx = hdr.findIndex(h => h.includes(n)); if (idx >= 0) return idx } return -1 }
}

const val = (fila, idx) => idx >= 0 ? (fila[idx] == null ? '' : String(fila[idx]).trim()) : ''
const numVal = (fila, idx) => { const s = val(fila, idx).replace(',', '.'); const v = parseFloat(s); return isNaN(v) ? null : v }
// Los Excel de control de planta suelen traer la fecha como texto dd-mm-aaaa
// o como celda de fecha real de Excel — se normaliza a aaaa-mm-dd (mismo
// formato que usa el resto de la app) en ambos casos. El workbook se lee
// con cellDates:true (ver parseKronosWorkbook) para que una celda de fecha
// llegue como objeto Date de JS en vez de numero de serie — evita depender
// de XLSX.SSF, que no siempre esta disponible segun como se importe el
// paquete.
function fechaVal(fila, idx) {
  if (idx < 0) return null
  const raw = fila[idx]
  if (raw == null || raw === '') return null
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(raw.getDate()).padStart(2, '0')}`
  }
  const s = String(raw).trim()
  const m1 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`
  return null
}

// Lee el workbook completo y devuelve las filas crudas de ambas hojas ya
// tipadas — sin cruzar todavia con las OT existentes (eso lo hace
// construirPlanImportacion, que necesita el cliente y las OT actuales).
export function parseKronosWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const errores = []

  const filasLotes = hojaAFilas(wb, 'lote')
  let lotes = []
  if (filasLotes && filasLotes.length) {
    const hi = encontrarEncabezado(filasLotes)
    const hdr = (filasLotes[hi] || []).map(norm)
    const col = colBuscador(hdr)
    const ciLote = col('lote')
    const ciOC = col('oc')
    const ciNV = col('nv')
    const ciEsquema = col('esquema')
    const ciFecha = col('fecha recep', 'fecha')
    const ciPlazo = col('plazo')
    for (let i = hi + 1; i < filasLotes.length; i++) {
      const fila = filasLotes[i] || []
      const lote = val(fila, ciLote)
      if (!lote) continue
      lotes.push({
        lote, oc: val(fila, ciOC) || null, nv: val(fila, ciNV) || null,
        esquema: val(fila, ciEsquema) || null, fechaRecepcion: fechaVal(fila, ciFecha),
        plazoDias: ciPlazo >= 0 ? numVal(fila, ciPlazo) : null,
      })
    }
  } else errores.push('No se encontró la hoja "Lotes (producción)".')

  const filasPiezas = hojaAFilas(wb, 'pieza')
  let piezas = []
  if (filasPiezas && filasPiezas.length) {
    const hi = encontrarEncabezado(filasPiezas)
    const hdr = (filasPiezas[hi] || []).map(norm)
    const col = colBuscador(hdr)
    const ciTag = col('tag', 'marca')
    const ciOC = col('oc')
    const ciNV = col('nv')
    const ciLote = col('lote')
    const ciFechaRecep = col('fecha recep')
    const ciDiam = col('diam')
    const ciM2 = col('m2', 'm²')
    const ciEstadoProd = col('estado produccion', 'estado producción')
    const ciFechaDesp = col('fecha despacho')
    const ciGuia = col('gd despacho', 'guia', 'guía')
    const ciEstadoPieza = col('estado pieza')
    if (ciTag < 0) errores.push('No se encontró una columna TAG/Marca en la hoja "Piezas (despacho)".')
    else for (let i = hi + 1; i < filasPiezas.length; i++) {
      const fila = filasPiezas[i] || []
      const tag = val(fila, ciTag)
      if (!tag) continue
      piezas.push({
        tag, oc: val(fila, ciOC) || null, nv: val(fila, ciNV) || null, lote: val(fila, ciLote) || null,
        fechaRecepcion: fechaVal(fila, ciFechaRecep), diametro: val(fila, ciDiam) || null,
        m2: ciM2 >= 0 ? (numVal(fila, ciM2) || 0) : 0, estadoProduccion: val(fila, ciEstadoProd) || null,
        fechaDespacho: fechaVal(fila, ciFechaDesp), guiaDespacho: val(fila, ciGuia) || null,
        estadoPieza: val(fila, ciEstadoPieza) || null,
      })
    }
  } else errores.push('No se encontró la hoja "Piezas (despacho)".')

  return { lotes, piezas, errores }
}

// Cruza lo leido del Excel con las OT reales del cliente (agrupado por OC,
// que es el dato que casi siempre coincide entre el Excel externo y el
// sistema) y arma, SIN escribir nada todavia, el plan completo: que se va
// a crear y que se va a completar — listo para mostrar en una vista previa.
export function construirPlanImportacion(ots, cliente, datosKronos) {
  const otsCliente = (ots || []).filter(o => (o.cliente || '') === cliente && !o.eliminada)
  const porOC = {}
  const agregar = oc => { const key = oc || 'sin-oc'; if (!porOC[key]) porOC[key] = { oc: oc || null, lotes: [], piezas: [] }; return porOC[key] }
  datosKronos.lotes.forEach(l => agregar(l.oc).lotes.push(l))
  datosKronos.piezas.forEach(p => agregar(p.oc).piezas.push(p))

  return Object.values(porOC).map(grupo => {
    const ot = otsCliente.find(o => (o.oc || '') === (grupo.oc || '') && grupo.oc)
    const marcasExistentes = ot ? (ot.marcasEsperadas || []) : []
    const idxExistente = new Map(marcasExistentes.map((m, i) => [normMarcaKey(m.marca || m.tag), i]))

    let piezasNuevas = 0, piezasCompletadas = 0
    const detallePiezas = grupo.piezas.map(p => {
      const key = normMarcaKey(p.tag)
      const existe = idxExistente.has(key)
      if (existe) piezasCompletadas++; else piezasNuevas++
      return { ...p, existeEnOT: existe }
    })
    const lotesNuevos = grupo.lotes.length

    return {
      oc: grupo.oc, ot, otNumero: ot ? ot.numero : null,
      lotes: grupo.lotes, piezas: detallePiezas,
      resumen: { lotesNuevos, piezasNuevas, piezasCompletadas },
      aplicar: !!ot,
    }
  }).sort((a, b) => String(a.oc || '').localeCompare(String(b.oc || '')))
}

// Aplica un grupo del plan (ya filtrado a los que el usuario confirmo) SOBRE
// una copia fresca de las OT (pasada por quien llama, despues de pullState).
// Regla dura: nunca pisa un valor que la pieza ya tenga cargado — solo
// completa lo que esta vacio, y solo agrega piezas/lotes que no existian.
export function aplicarPlanImportacion(otsFrescas, grupos) {
  let nuevo = otsFrescas
  grupos.forEach(grupo => {
    if (!grupo.aplicar || !grupo.ot) return
    nuevo = nuevo.map(o => {
      if (o.id !== grupo.ot.id) return o
      const partidas = [...(o.partidas || [])]
      const loteIdPorCodigo = {}
      partidas.forEach(p => { if (p.kronosLote) loteIdPorCodigo[p.kronosLote] = p.id })
      grupo.lotes.forEach(l => {
        if (loteIdPorCodigo[l.lote]) return
        const id = 'pa' + Date.now() + Math.random().toString(36).slice(2, 7)
        partidas.push({ id, detalle: 'Lote ' + l.lote + ' (Kronos)', fecha: l.fechaRecepcion, estado: 'Recibida', plazoDias: l.plazoDias || null, kronosLote: l.lote })
        loteIdPorCodigo[l.lote] = id
      })
      const despachos = [...(o.despachos || [])]
      const despachoIdPorGuia = {}
      despachos.forEach(d => { if (d.kronosGuia) despachoIdPorGuia[d.kronosGuia] = d.id })
      grupo.piezas.filter(p => p.guiaDespacho).forEach(p => {
        if (despachoIdPorGuia[p.guiaDespacho]) return
        const id = 'de' + Date.now() + Math.random().toString(36).slice(2, 7)
        despachos.push({ id, detalle: 'Guía ' + p.guiaDespacho + ' (Kronos)', fecha: p.fechaDespacho, estado: 'Despachada', kronosGuia: p.guiaDespacho })
        despachoIdPorGuia[p.guiaDespacho] = id
      })

      let marcas = [...(o.marcasEsperadas || [])]
      grupo.piezas.forEach(p => {
        const key = normMarcaKey(p.tag)
        const idx = marcas.findIndex(m => normMarcaKey(m.marca || m.tag) === key)
        const loteId = p.lote ? loteIdPorCodigo[p.lote] : null
        const despachoId = p.guiaDespacho ? despachoIdPorGuia[p.guiaDespacho] : null
        if (idx >= 0) {
          const m = marcas[idx]
          const cambios = {}
          if (!m.diametro && p.diametro) cambios.diametro = p.diametro
          if (!m.m2 && p.m2) cambios.m2 = p.m2
          if (!m.recibida && p.fechaRecepcion) { cambios.recibida = true; cambios.fechaRecibida = p.fechaRecepcion }
          if (!m.loteId && loteId) cambios.loteId = loteId
          if (!m.despachoId && despachoId) { cambios.despachoId = despachoId; cambios.fechaDespacho = p.fechaDespacho || m.fechaDespacho }
          if (Object.keys(cambios).length) marcas[idx] = { ...m, ...cambios }
        } else {
          marcas.push({
            id: 'me' + Date.now() + Math.random().toString(36).slice(2, 7),
            marca: p.tag, tag: p.tag, idPieza: null, referencia: null, diametro: p.diametro || null,
            m2: p.m2 || 0, m2Propio: null, recibida: !!p.fechaRecepcion, fechaRecibida: p.fechaRecepcion || null,
            loteId: loteId || null, despachoId: despachoId || null, fechaDespacho: p.fechaDespacho || null,
          })
        }
      })
      return { ...o, partidas, despachos, marcasEsperadas: marcas }
    })
  })
  return nuevo
}
