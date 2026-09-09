import React, { useState, useRef, useMemo } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Mail, Users } from 'lucide-react'
import { ocNeto, ocTotal, vencOC } from './OrdenesCompraModule.jsx'
import { supabase } from './supabase.js'
import { sumarDiasHabiles, diasHabilesHasta } from './plazos.js'
import { pullState, pushState } from './sync.js'
import { piezasDelCliente, lotesDelClienteConPlazo, resumenTableroCliente } from './vistaCliente.js'
import { KpiCard } from './ui.jsx'

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

// Junta, de todas las OT, los lotes (partidas de recepcion con plazo
// comprometido) que todavia tienen piezas sin despachar — un lote con
// todas sus piezas ya despachadas no genera alarma, ya se cumplio.
export function lotesConPlazo(ots) {
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

// Guarda un cambio en un campo de UNA pieza (diametro/embalaje/factura) de
// UNA OT puntual, sin pisar cambios que hayan hecho otras personas en otras
// piezas mientras tanto — mismo patron seguro "pull-fresh + merge + push"
// que ya usa actualizarMarcasEsperadas() en OTModule.jsx, aplicado aca
// porque esta vista cruza piezas de varias OT a la vez.
async function actualizarPiezaCliente(otsProp, setOts, otId, marcaId, cambios) {
  try { await pullState() } catch (e) {}
  let fresco = null
  try { fresco = JSON.parse(localStorage.getItem('serein_ots') || 'null') } catch (e) {}
  const base = Array.isArray(fresco) ? fresco : otsProp
  const nuevo = base.map(o => o.id !== otId ? o : { ...o, marcasEsperadas: (o.marcasEsperadas || []).map(m => m.id === marcaId ? { ...m, ...cambios } : m) })
  try { localStorage.setItem('serein_ots', JSON.stringify(nuevo)) } catch (e) {}
  setOts(nuevo)
  pushState()
}

// Vista por Cliente (Fase F) — cruza todas las OT activas de un mismo
// cliente para responder la pregunta real de la usuaria: de todas las
// piezas de ese cliente, cuales ya se despacharon, en que etapa de pintura
// estan las que quedan, y cuales ya se facturaron (con su embalaje aparte).
function VistaPorCliente({ ots, setOts }) {
  const clientes = useMemo(() => Array.from(new Set(ots.filter(o => !o.eliminada).map(o => o.cliente).filter(Boolean))).sort(), [ots])
  const [cliente, setCliente] = useState('')
  const [filtroEstadoPieza, setFiltroEstadoPieza] = useState('')
  const [localValores, setLocalValores] = useState({})
  const timers = useRef({})

  const piezas = useMemo(() => cliente ? piezasDelCliente(ots, cliente) : [], [ots, cliente])
  const lotes = useMemo(() => cliente ? lotesDelClienteConPlazo(ots, cliente) : [], [ots, cliente])
  const resumen = useMemo(() => resumenTableroCliente(piezas, lotes), [piezas, lotes])
  const estadosPresentes = Array.from(new Set(piezas.map(f => f.estado)))
  const piezasFiltradas = filtroEstadoPieza ? piezas.filter(f => f.estado === filtroEstadoPieza) : piezas

  const cambiarCampo = (otId, marcaId, campo, valor) => {
    const key = otId + '|' + marcaId + '|' + campo
    setLocalValores(v => ({ ...v, [key]: valor }))
    clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(() => {
      actualizarPiezaCliente(ots, setOts, otId, marcaId, { [campo]: campo === 'embalaje' ? (numDecCliente(valor)) : (valor.trim() || null) })
    }, 700)
  }
  const valorCampo = (otId, marcaId, campo, actual) => {
    const key = otId + '|' + marcaId + '|' + campo
    return localValores[key] !== undefined ? localValores[key] : (actual != null ? String(actual) : '')
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}><Users size={16} /> Vista por cliente</div>
        <select value={cliente} onChange={e => setCliente(e.target.value)} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '7px 10px', fontSize: 13, minWidth: 220 }}>
          <option value="">Elegir cliente…</option>
          {clientes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {!cliente && <div style={{ color: '#9AA3AD', fontSize: 13, marginBottom: 20 }}>Elige un cliente para ver su tablero, lotes y piezas cruzados entre todas sus OT.</div>}

      {cliente && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
            <KpiCard value={resumen.totalPiezas} label="Piezas totales" />
            <KpiCard value={resumen.despachadas} label="Despachadas" />
            <KpiCard value={resumen.m2Total.toLocaleString('es-CL', { maximumFractionDigits: 1 })} label="m² totales" />
            <KpiCard value={resumen.lotesVencidos} label="Lotes vencidos" iconColor={C.rojo} />
            <KpiCard value={resumen.lotesPorVencer} label="Lotes por vencer" iconColor={C.ambar} />
          </div>

          {lotes.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.gris, textTransform: 'uppercase', marginBottom: 6 }}>Lotes de {cliente}</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                      {['OT', 'OC', 'Guía', 'Piezas', 'Vencimiento', 'Estado'].map((h, i) => (
                        <th key={i} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lotes.map((l, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #DFE4EA' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>{l.ot.numero}</td>
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

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.gris, textTransform: 'uppercase' }}>Piezas de {cliente} ({piezasFiltradas.length})</div>
              <select value={filtroEstadoPieza} onChange={e => setFiltroEstadoPieza(e.target.value)} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '5px 8px', fontSize: 12 }}>
                <option value="">Todos los estados</option>
                {estadosPresentes.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            {piezas.length === 0 ? (
              <div style={{ color: '#9AA3AD', fontSize: 13 }}>Este cliente todavía no tiene piezas cargadas en ninguna OT.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                      {['TAG', 'OT', 'OC', 'NV', 'Diámetro', 'm²', 'Estado', 'Despacho', 'Embalaje', 'Factura'].map((h, i) => (
                        <th key={i} style={{ textAlign: 'left', padding: '5px 6px', fontSize: 10.5, color: '#9AA3AD', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {piezasFiltradas.map(f => (
                      <tr key={f.ot.id + '|' + f.m.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
                        <td style={{ padding: '5px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>{f.m.tag || f.m.marca}</td>
                        <td style={{ padding: '5px 6px', whiteSpace: 'nowrap' }}>{f.ot.numero}</td>
                        <td style={{ padding: '5px 6px', color: '#9AA3AD' }}>{f.ot.oc && f.ot.oc !== '—' ? f.ot.oc : '—'}</td>
                        <td style={{ padding: '5px 6px', color: '#9AA3AD' }}>{f.ot.nv && f.ot.nv !== '—' ? f.ot.nv : '—'}</td>
                        <td style={{ padding: '5px 6px' }}>
                          <input value={valorCampo(f.ot.id, f.m.id, 'diametro', f.m.diametro)} onChange={e => cambiarCampo(f.ot.id, f.m.id, 'diametro', e.target.value)} placeholder="—" style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '3px 5px', fontSize: 11.5, width: 60 }} />
                        </td>
                        <td style={{ padding: '5px 6px', color: '#9AA3AD' }}>{f.m.m2 || '—'}</td>
                        <td style={{ padding: '5px 6px' }}><span style={{ background: f.colorEstado, color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{f.estado}</span></td>
                        <td style={{ padding: '5px 6px', color: '#9AA3AD', whiteSpace: 'nowrap' }}>{f.m.fechaDespacho || '—'}</td>
                        <td style={{ padding: '5px 6px' }}>
                          <input value={valorCampo(f.ot.id, f.m.id, 'embalaje', f.m.embalaje)} onChange={e => cambiarCampo(f.ot.id, f.m.id, 'embalaje', e.target.value)} placeholder="$" style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '3px 5px', fontSize: 11.5, width: 70 }} />
                        </td>
                        <td style={{ padding: '5px 6px' }}>
                          <input value={valorCampo(f.ot.id, f.m.id, 'facturaFolio', f.m.facturaFolio)} onChange={e => cambiarCampo(f.ot.id, f.m.id, 'facturaFolio', e.target.value)} placeholder="Folio" style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '3px 5px', fontSize: 11.5, width: 70 }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
const numDecCliente = s => { const v = parseFloat(String(s).replace(/[^\d.,]/g, '').replace(',', '.')); return isNaN(v) ? null : v }

export default function TrazabilidadModule({ cotizaciones = [], ots = [], ordenesCompra = [], setOts }) {
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
      <VistaPorCliente ots={ots} setOts={setOts || (() => {})} />

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
