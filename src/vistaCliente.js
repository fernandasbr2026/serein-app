// Agregacion para la "Vista por Cliente" (Fase F del rediseno de OT — ver
// plan en C:\Users\maria\.claude\plans\sorted-singing-sundae.md). Cruza
// piezas y lotes de TODAS las OT activas de un mismo cliente en una sola
// vista, algo que hoy no existe (la trazabilidad vive OT por OT). Separado
// a su propio archivo por el mismo motivo que plazos.js: reutilizado tanto
// por TrazabilidadModule.jsx como, mas adelante, por el importador de
// historico (Fase F3).
import { calcularFilasTrazabilidad } from './OTModule.jsx'
import { lotesConPlazo } from './TrazabilidadModule.jsx'

// Una fila por pieza de cada OT del cliente, con el numero/OC/NV de su OT
// ya pegado — mismo calculo de estado que ya usa la ficha de la OT
// (calcularFilasTrazabilidad), asi que nunca puede mostrar un estado
// distinto para la misma pieza segun donde se la mire.
export function piezasDelCliente(ots, cliente) {
  const otsCliente = (ots || []).filter(o => (o.cliente || '') === cliente && !o.eliminada)
  const filas = []
  otsCliente.forEach(ot => {
    const { filas: filasOT } = calcularFilasTrazabilidad(ot)
    filasOT.forEach(f => filas.push({ ...f, ot }))
  })
  return filas
}

// Lotes con plazo comprometido, pero solo de las OT de este cliente —
// cero logica nueva de vencimiento, reutiliza lotesConPlazo tal cual.
export function lotesDelClienteConPlazo(ots, cliente) {
  return lotesConPlazo((ots || []).filter(o => (o.cliente || '') === cliente && !o.eliminada))
}

// Replica la hoja "Tablero" del Excel de control de planta: conteos de
// piezas por estado, m² total, y desglose por OC.
export function resumenTableroCliente(piezas, lotes) {
  const porEstado = {}
  piezas.forEach(f => { porEstado[f.estado] = (porEstado[f.estado] || 0) + 1 })
  const m2Total = piezas.reduce((a, f) => a + (Number(f.m.m2) || 0), 0)
  const despachadas = piezas.filter(f => f.estado === 'Despachada').length
  const porOC = {}
  piezas.forEach(f => {
    const oc = f.ot.oc && f.ot.oc !== '—' ? f.ot.oc : 'Sin OC'
    if (!porOC[oc]) porOC[oc] = { oc, ot: f.ot.numero, piezas: 0, despachadas: 0, m2: 0 }
    porOC[oc].piezas++
    if (f.estado === 'Despachada') porOC[oc].despachadas++
    porOC[oc].m2 += Number(f.m.m2) || 0
  })
  return {
    totalPiezas: piezas.length,
    despachadas,
    m2Total,
    porEstado,
    porOC: Object.values(porOC).sort((a, b) => a.oc.localeCompare(b.oc)),
    lotesVencidos: lotes.filter(l => l.estado === 'vencido').length,
    lotesPorVencer: lotes.filter(l => l.estado === 'por_vencer').length,
    lotesEnPlazo: lotes.filter(l => l.estado === 'en_plazo').length,
  }
}
