import React, { useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Mail } from 'lucide-react'
import { ocNeto, ocTotal, vencOC } from './OrdenesCompraModule.jsx'
import { supabase } from './supabase.js'

// ============================================================
// MÓDULO: Trazabilidad y Alertas (Gerencia)
// Cadena: Cotización → OT → OC proveedor / Compras → Producción → Factura → Cobranza
// + Fase E del rediseño de OT: vencimiento de lotes de piezas por plazo
// comprometido (ver plan en C:\Users\maria\.claude\plans\sorted-singing-sundae.md)
// ============================================================

import { SEREIN } from './theme-serein.js'
// Paleta reskineada a la identidad Serein 2026 — mismas claves, solo cambian los valores hex.
const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const hoy = () => new Date().toISOString().slice(0, 10)

const ocsDeOT = (ocs, numOT) => (ocs || []).filter(o => (o.asignaciones || []).some(a => a.ot === numOT))
const produccionDe = o => ({ 'Cotizada': 'No iniciada', 'En ejecución': 'En proceso', 'Terminada': 'Terminada', 'Facturada': 'Terminada', 'Cerrada': 'Terminada' }[o.estado] || '—')
const facturacionDe = o => (o.ventas && o.ventas.length > 0) ? ('Facturada (' + o.ventas.length + ')') : (['Facturada', 'Cerrada', 'Terminada'].includes(o.estado) ? 'Pendiente' : '—')
const cobranzaDe = o => { const v = o.ventas || []; if (!v.length) return '—'; if (v.every(x => x.estadoPago === 'Pagado')) return 'Cobrado'; if (v.some(x => x.estadoPago === 'Pagado')) return 'Parcial'; return 'Pendiente' }

// Plazo comprometido en dias HABILES (Fase E): a partir de la fecha del
// lote (= una recepcion/partida con plazoDias, ver Fase B/D de OTModule),
// se suman solo dias de semana para llegar a la fecha de vencimiento.
function sumarDiasHabiles(fechaStr, dias) {
  if (!fechaStr || !dias) return null
  let d = new Date(fechaStr + 'T00:00:00')
  let restante = Number(dias)
  while (restante > 0) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) restante--
  }
  return d.toISOString().slice(0, 10)
}
// Dias habiles entre hoy y una fecha de vencimiento (negativo = ya vencio).
function diasHabilesHasta(fechaVenc) {
  if (!fechaVenc) return null
  const a = new Date(hoy() + 'T00:00:00'), b = new Date(fechaVenc + 'T00:00:00')
  const signo = b >= a ? 1 : -1
  let d = new Date(a), n = 0
  while (d.getTime() !== b.getTime()) {
    d.setDate(d.getDate() + signo)
    if (d.getDay() !== 0 && d.getDay() !== 6) n += signo
  }
  return n
}
// Junta, de todas las OT, los lotes (partidas de recepcion con plazo
// comprometido) que todavia tienen piezas sin despachar — un lote con
// todas sus piezas ya despachadas no genera alarma, ya se cumplio.
function lotesConPlazo(ots) {
  const lotes = []
  ots.forEach(o => {
    ;(o.partidas || []).forEach(p => {
      if (!p.plazoDias || !p.fecha) return
      const piezas = (o.marcasEsperadas || []).filter(m => m.loteId === p.id)
      const total = piezas.length
      const despachadas = piezas.filter(m => m.despachoId).length
      if (total > 0 && despachadas === total) return
      const vencimiento = sumarDiasHabiles(p.fecha, p.plazoDias)
      const diasRestantes = diasHabilesHasta(vencimiento)
      const estado = diasRestantes < 0 ? 'vencido' : diasRestantes <= 2 ? 'por_vencer' : 'en_plazo'
      lotes.push({ ot: o, partida: p, vencimiento, total, despachadas, diasRestantes, estado })
    })
  })
  return lotes.sort((a, b) => String(a.vencimiento || '').localeCompare(String(b.vencimiento || '')))
}
const ESTADO_LOTE_LABEL = { vencido: 'Vencido', por_vencer: 'Por vencer', en_plazo: 'En plazo' }
const ESTADO_LOTE_COLOR = { vencido: '#C5453D', por_vencer: '#D9600A', en_plazo: '#5A6B85' }

export default function TrazabilidadModule({ cotizaciones = [], ots = [], ordenesCompra = [] }) {
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroEstadoLote, setFiltroEstadoLote] = useState('')
  const [enviandoAlertas, setEnviandoAlertas] = useState(false)
  const [msgAlertas, setMsgAlertas] = useState(null)

  const lotes = lotesConPlazo(ots)
  const lotesFiltrados = lotes.filter(l => {
    if (filtroCliente.trim() && !String(l.ot.cliente || '').toLowerCase().includes(filtroCliente.trim().toLowerCase())) return false
    if (filtroEstadoLote && l.estado !== filtroEstadoLote) return false
    return true
  })
  const lotesVencidos = lotes.filter(l => l.estado === 'vencido')
  const lotesPorVencer = lotes.filter(l => l.estado === 'por_vencer')

  // ---- Alertas ----
  const alertas = []
  cotizaciones.filter(c => c.estado === 'Aprobada' && !ots.find(o => o.numero === 'OT-' + c.folio)).forEach(c =>
    alertas.push({ col: C.rojo, txt: `Cotización N° ${c.folio} (${c.cliente}) está aprobada pero no tiene OT creada.` }))
  ots.filter(o => o.estado === 'Terminada' && (!o.ventas || o.ventas.length === 0)).forEach(o =>
    alertas.push({ col: C.ambar, txt: `${o.numero} está terminada pero no tiene factura emitida.` }))
  ordenesCompra.filter(o => o.estadoPago !== 'Pagada' && o.estadoPago !== 'Anulada' && vencOC(o) && vencOC(o) < hoy()).forEach(o =>
    alertas.push({ col: C.rojo, txt: `OC N° ${o.numero} (${o.proveedor}) está vencida sin pago (${clp(ocTotal(o))}).` }))
  ordenesCompra.filter(o => o.estadoPago !== 'Anulada' && (!o.asignaciones || o.asignaciones.length === 0)).slice(0, 30).forEach(o =>
    alertas.push({ col: C.gris, txt: `OC N° ${o.numero} (${o.proveedor}) no está asociada a ninguna OT.` }))
  ots.filter(o => (o.ventas || []).some(v => v.estadoPago !== 'Pagado')).forEach(o =>
    alertas.push({ col: C.ambar, txt: `${o.numero} tiene facturas emitidas pendientes de cobro.` }))
  lotesVencidos.forEach(l =>
    alertas.push({ col: C.rojo, txt: `Lote guía ${l.partida.numeroGuia || 's/n'} de ${l.ot.numero} (${l.ot.cliente}) vencido hace ${Math.abs(l.diasRestantes)} día(s) hábil(es) — vencía el ${l.vencimiento}.` }))
  lotesPorVencer.forEach(l =>
    alertas.push({ col: C.ambar, txt: `Lote guía ${l.partida.numeroGuia || 's/n'} de ${l.ot.numero} (${l.ot.cliente}) vence en ${l.diasRestantes} día(s) hábil(es) (${l.vencimiento}).` }))

  const enviarAlertasAhora = async () => {
    setEnviandoAlertas(true); setMsgAlertas(null)
    try {
      const resumen = [...lotesVencidos, ...lotesPorVencer].map(l => ({
        ot: l.ot.numero, cliente: l.ot.cliente, numeroGuia: l.partida.numeroGuia || '',
        vencimiento: l.vencimiento, diasRestantes: l.diasRestantes, estado: l.estado,
      }))
      const { data, error } = await supabase.functions.invoke('enviar-alertas-vencimiento', { body: { lotes: resumen } })
      if (error) throw error
      if (!data || !data.ok) throw new Error((data && data.error) || 'No se pudo enviar el correo.')
      setMsgAlertas({ ok: true, texto: `Correo enviado con ${resumen.length} alerta(s) de vencimiento.` })
    } catch (err) { setMsgAlertas({ ok: false, texto: 'No se pudo enviar: ' + ((err && err.message) || String(err)) }) }
    setEnviandoAlertas(false)
  }

  const paso = (txt, sub, col) => (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 10.5, color: C.gris, textTransform: 'uppercase' }}>{txt}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: col || C.carbon }}>{sub}</div>
    </div>
  )

  return (
    <div>
      {/* ALERTAS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase' }}>Alertas ({alertas.length})</div>
        {(lotesVencidos.length + lotesPorVencer.length) > 0 && (
          <button onClick={enviarAlertasAhora} disabled={enviandoAlertas} style={{ background: enviandoAlertas ? '#9AA3AD' : C.azul, color: '#fff', border: 'none', borderRadius: 4, padding: '7px 14px', fontSize: 12.5, cursor: enviandoAlertas ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Mail size={14} /> {enviandoAlertas ? 'Enviando…' : 'Enviar alertas de vencimiento por correo'}
          </button>
        )}
      </div>
      {msgAlertas && <div style={{ fontSize: 12.5, color: msgAlertas.ok ? C.verde : C.rojo, marginBottom: 10 }}>{msgAlertas.texto}</div>}
      {alertas.length === 0 ? (
        <div style={{ background: '#E6F7EE', color: C.verde, padding: '10px 14px', fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle2 size={16} /> Sin alertas pendientes.</div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          {alertas.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderLeft: `4px solid ${a.col}`, border: '1px solid #DFE4EA', padding: '9px 14px', marginBottom: 6, fontSize: 13 }}>
              <AlertTriangle size={15} color={a.col} /> <span>{a.txt}</span>
            </div>
          ))}
        </div>
      )}

      {/* LOTES CON PLAZO COMPROMETIDO */}
      {lotes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase', marginBottom: 10 }}>Lotes con plazo comprometido ({lotes.length})</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <input value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} placeholder="Buscar por cliente…" style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '6px 8px', fontSize: 12.5 }} />
            <select value={filtroEstadoLote} onChange={e => setFiltroEstadoLote(e.target.value)} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '6px 8px', fontSize: 12.5 }}>
              <option value="">Todos los estados</option>
              <option value="vencido">Vencido</option>
              <option value="por_vencer">Por vencer</option>
              <option value="en_plazo">En plazo</option>
            </select>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                  {['OT', 'Cliente', 'OC', 'Guía', 'Piezas', 'Vencimiento', 'Estado'].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lotesFiltrados.map((l, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #DFE4EA' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{l.ot.numero}</td>
                    <td style={{ padding: '6px 8px' }}>{l.ot.cliente}</td>
                    <td style={{ padding: '6px 8px', color: C.gris }}>{l.ot.oc && l.ot.oc !== '—' ? l.ot.oc : '—'}</td>
                    <td style={{ padding: '6px 8px', color: C.gris }}>{l.partida.numeroGuia || '—'}</td>
                    <td style={{ padding: '6px 8px', color: C.gris }}>{l.despachadas}/{l.total || '?'}</td>
                    <td style={{ padding: '6px 8px' }}>{l.vencimiento || '—'}</td>
                    <td style={{ padding: '6px 8px' }}><span style={{ background: ESTADO_LOTE_COLOR[l.estado], color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 10.5, fontWeight: 700 }}>{ESTADO_LOTE_LABEL[l.estado]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TRAZABILIDAD */}
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase', marginBottom: 10 }}>Trazabilidad · Cotización → OT → OC → Producción → Factura → Cobranza</div>
      {cotizaciones.length === 0 && ots.length === 0 && <div style={{ color: '#9AA3AD', fontSize: 13 }}>Aún no hay cotizaciones ni OT.</div>}
      {ots.map(o => {
        const cot = cotizaciones.find(c => 'OT-' + c.folio === o.numero)
        const ocs = ocsDeOT(ordenesCompra, o.numero)
        const ocTot = ocs.reduce((a, x) => a + ocNeto(x), 0)
        return (
          <div key={o.id} style={{ background: '#fff', border: '1px solid #DFE4EA', padding: '12px 16px', marginBottom: 10, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            {paso('Cotización', cot ? ('N° ' + cot.folio) : '—', C.teal)}
            <ArrowRight size={14} color={C.gris} />
            {paso('OT', o.numero + ' · ' + o.estado, C.azul)}
            <ArrowRight size={14} color={C.gris} />
            {paso('OC proveedores', ocs.length ? (ocs.length + ' · ' + clp(ocTot)) : 'sin OC', ocs.length ? C.carbon : C.ambar)}
            <ArrowRight size={14} color={C.gris} />
            {paso('Producción', produccionDe(o), C.carbon)}
            <ArrowRight size={14} color={C.gris} />
            {paso('Facturación', facturacionDe(o), C.carbon)}
            <ArrowRight size={14} color={C.gris} />
            {paso('Cobranza', cobranzaDe(o), cobranzaDe(o) === 'Cobrado' ? C.verde : cobranzaDe(o) === '—' ? C.gris : C.rojo)}
          </div>
        )
      })}
    </div>
  )
}
