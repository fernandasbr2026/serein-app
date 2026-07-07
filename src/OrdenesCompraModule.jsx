import React, { useState } from 'react'
import { Plus, Trash2, Search, ChevronDown, ChevronUp } from 'lucide-react'

// ============================================================
// MÓDULO: Órdenes de Compra a PROVEEDORES (emitidas por Serein)
// Cada OC puede asociarse a una o varias OT/áreas con % de reparto.
// Alimenta: costos de la OT, cuentas por pagar y flujo de caja.
// ============================================================

const C = { naranja: '#D2642F', teal: '#A8501F', carbon: '#161616', verde: '#3D7A4E', rojo: '#B5432E', gris: '#7A8288', azul: '#1D1D1B' }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/[^\d-]/g, ''), 10); return isNaN(v) ? 0 : v }
const inp = { padding: '6px 8px', border: '1px solid #CBD2D6', fontSize: 12.5, boxSizing: 'border-box' }
const hoy = () => new Date().toISOString().slice(0, 10)
const sumarDias = (fecha, dias) => { if (!fecha) return ''; const d = new Date(fecha + 'T12:00:00'); d.setDate(d.getDate() + (parseInt(dias, 10) || 0)); return d.toISOString().slice(0, 10) }

const CATEGORIAS = ['Pintura', 'Granalla', 'EPP', 'Ferretería', 'Transporte', 'Arriendo de equipos', 'Mantención', 'Servicios externos', 'Combustible', 'Financiero', 'Otro']
const ESTADOS_PAGO = ['Pendiente', 'Parcialmente pagada', 'Pagada', 'Vencida', 'Anulada']
const AREAS = ['Santa Rosa', 'Istria', 'Proyectos', 'Producción / Planta', 'General empresa']

// ---- Cálculos (compatibles con las OC importadas que sólo traían "monto") ----
export const ocNeto = oc => (oc.neto != null && oc.neto !== '') ? num(oc.neto) : Math.round(num(oc.monto) / 1.19)
export const ocIva = oc => Math.round(ocNeto(oc) * 0.19)
export const ocTotal = oc => ocNeto(oc) + ocIva(oc)
export const ocPorPagar = oc => !['Pagada', 'Anulada'].includes(oc.estadoPago) && ocTotal(oc) > 0
export const vencOC = oc => oc.vencimiento || (oc.fecha ? sumarDias(oc.fecha, num(oc.plazo)) : '')
// Costo neto que una OT recibe desde las OC (según asignación %)
export const costoOCdeOT = (ocs, numeroOT) => (ocs || []).filter(o => o.estadoPago !== 'Anulada').reduce((a, o) => {
  const asigs = (o.asignaciones && o.asignaciones.length) ? o.asignaciones : null
  if (!asigs) return a
  return a + asigs.filter(x => x.ot === numeroOT).reduce((s, x) => s + ocNeto(o) * (num(x.pct) || 0) / 100, 0)
}, 0)

const fondoEstado = e => ({ Pagada: '#E7F2EA', 'Parcialmente pagada': '#F9E9DE', Vencida: '#F6E0DA', Pendiente: '#F9E9DE', Anulada: '#EEE' }[e] || '#EEE')
const colorEstado = e => ({ Pagada: C.verde, 'Parcialmente pagada': C.naranja, Vencida: C.rojo, Pendiente: '#8C4519', Anulada: C.gris }[e] || C.gris)

function FilaOC({ oc, otsDisponibles, upd, onDelete }) {
  const [abierta, setAbierta] = useState(false)
  const v = vencOC(oc), vencido = ocPorPagar(oc) && v && v < hoy()
  const asigs = oc.asignaciones || []
  const sumaPct = asigs.reduce((a, x) => a + (num(x.pct) || 0), 0)
  const addAsig = () => upd(oc.id, { asignaciones: [...asigs, { ot: otsDisponibles[0] || '', pct: asigs.length === 0 ? 100 : 0 }] })
  const updAsig = (i, k, val) => upd(oc.id, { asignaciones: asigs.map((x, j) => j === i ? { ...x, [k]: val } : x) })
  const delAsig = i => upd(oc.id, { asignaciones: asigs.filter((_, j) => j !== i) })
  return (
    <>
      <tr style={{ borderBottom: '1px solid #EEE9DF', background: vencido ? '#FDF3F0' : 'transparent' }}>
        <td style={{ padding: '4px 6px' }}><input value={oc.numero} onChange={e => upd(oc.id, { numero: e.target.value })} style={{ ...inp, width: 66, fontWeight: 600, padding: '5px 6px' }} /></td>
        <td style={{ padding: '4px 6px' }}><input value={oc.proveedor} onChange={e => upd(oc.id, { proveedor: e.target.value })} style={{ ...inp, width: 180, padding: '5px 6px' }} /></td>
        <td style={{ padding: '4px 6px' }}><input value={oc.rut || ''} onChange={e => upd(oc.id, { rut: e.target.value })} style={{ ...inp, width: 100, padding: '5px 6px' }} /></td>
        <td style={{ padding: '4px 6px' }}><select value={oc.categoria || ''} onChange={e => upd(oc.id, { categoria: e.target.value })} style={{ ...inp, width: 120, padding: '5px 6px' }}><option value="">—</option>{CATEGORIAS.map(x => <option key={x}>{x}</option>)}</select></td>
        <td style={{ padding: '4px 6px' }}><input type="date" value={oc.fecha || ''} onChange={e => upd(oc.id, { fecha: e.target.value })} style={{ ...inp, width: 132, padding: '5px 6px' }} /></td>
        <td style={{ padding: '4px 6px', textAlign: 'right' }}><input value={ocNeto(oc)} onChange={e => upd(oc.id, { neto: num(e.target.value), monto: undefined })} style={{ ...inp, width: 100, padding: '5px 6px', textAlign: 'right', fontWeight: 600 }} /></td>
        <td style={{ padding: '4px 6px', textAlign: 'right', color: C.gris, whiteSpace: 'nowrap' }}>{clp(ocIva(oc))}</td>
        <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{clp(ocTotal(oc))}</td>
        <td style={{ padding: '4px 6px' }}><input value={oc.plazo != null ? oc.plazo : 30} onChange={e => upd(oc.id, { plazo: num(e.target.value), vencimiento: sumarDias(oc.fecha, num(e.target.value)) })} style={{ ...inp, width: 50, padding: '5px 6px', textAlign: 'right' }} /></td>
        <td style={{ padding: '4px 6px' }}><input type="date" value={v} onChange={e => upd(oc.id, { vencimiento: e.target.value })} style={{ ...inp, width: 132, padding: '5px 6px', color: vencido ? C.rojo : C.carbon }} /></td>
        <td style={{ padding: '4px 6px' }}><select value={oc.estadoPago} onChange={e => upd(oc.id, { estadoPago: e.target.value })} style={{ border: 'none', background: fondoEstado(oc.estadoPago), color: colorEstado(oc.estadoPago), padding: '4px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{ESTADOS_PAGO.map(x => <option key={x}>{x}</option>)}</select></td>
        <td style={{ padding: '4px 4px', whiteSpace: 'nowrap', textAlign: 'right' }}>
          <button onClick={() => setAbierta(!abierta)} title="Detalle y asignación a OT" style={{ background: 'none', border: '1px solid #CBD2D6', cursor: 'pointer', padding: '3px 6px', marginRight: 4 }}>{abierta ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>
          <button onClick={() => window.confirm('¿Eliminar esta OC?') && onDelete(oc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
        </td>
      </tr>
      {abierta && (
        <tr style={{ background: '#FBF6F0' }}>
          <td colSpan={12} style={{ padding: '10px 14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: C.gris }}>Área principal<select value={oc.area || ''} onChange={e => upd(oc.id, { area: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }}><option value="">—</option>{AREAS.map(a => <option key={a}>{a}</option>)}</select></label>
              <label style={{ fontSize: 11, color: C.gris }}>Detalle<input value={oc.detalle || ''} onChange={e => upd(oc.id, { detalle: e.target.value })} placeholder="Detalle de la compra" style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
              <label style={{ fontSize: 11, color: C.gris }}>Adjunto (nombre / enlace)<input value={oc.adjunto || ''} onChange={e => upd(oc.id, { adjunto: e.target.value })} placeholder="OC_11375.pdf" style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
              <label style={{ fontSize: 11, color: C.gris }}>Observaciones<input value={oc.obs || ''} onChange={e => upd(oc.id, { obs: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: C.gris, textTransform: 'uppercase', marginBottom: 6 }}>Asignación a OT (reparto del costo)</div>
            {asigs.map((x, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <select value={x.ot} onChange={e => updAsig(i, 'ot', e.target.value)} style={{ ...inp, width: 160 }}>
                  <option value="">(elige OT)</option>
                  {otsDisponibles.map(o => <option key={o}>{o}</option>)}
                </select>
                <input value={x.pct} onChange={e => updAsig(i, 'pct', num(e.target.value))} style={{ ...inp, width: 60, textAlign: 'right' }} />%
                <span style={{ fontSize: 12, color: C.gris }}>= {clp(ocNeto(oc) * (num(x.pct) || 0) / 100)} de costo</span>
                <button onClick={() => delAsig(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
              <button onClick={addAsig} style={{ background: 'none', border: '1px dashed #CBD2D6', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.gris }}>+ Asignar a OT</button>
              {asigs.length > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: sumaPct === 100 ? C.verde : C.rojo }}>Suma: {sumaPct}% {sumaPct === 100 ? '✓' : '(debería ser 100%)'}</span>}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function OrdenesCompraModule({ pp = { ocs: [] }, setPp = () => {}, ots = [] }) {
  const ocs = pp.ocs || []
  const otsDisponibles = [...new Set((ots || []).map(o => o.numero).filter(Boolean))]
  const setOcs = arr => setPp({ ...pp, ocs: arr })
  const upd = (id, cambios) => setOcs(ocs.map(o => o.id === id ? { ...o, ...cambios } : o))
  const eliminar = id => setOcs(ocs.filter(o => o.id !== id))
  const agregar = () => setOcs([{ id: 'oc' + Date.now(), numero: '', proveedor: '', rut: '', categoria: 'Pintura', detalle: '', area: 'Santa Rosa', fecha: hoy(), neto: 0, plazo: 30, vencimiento: sumarDias(hoy(), 30), estadoPago: 'Pendiente', asignaciones: [], adjunto: '', obs: '' }, ...ocs])
  const [busca, setBusca] = useState('')
  const [fEst, setFEst] = useState('')
  const mostradas = ocs.filter(o =>
    (!busca || (String(o.numero) + ' ' + (o.proveedor || '') + ' ' + (o.rut || '') + ' ' + (o.categoria || '')).toLowerCase().includes(busca.toLowerCase())) &&
    (!fEst || o.estadoPago === fEst)
  )
  const totalTodas = mostradas.reduce((a, o) => a + ocTotal(o), 0)
  const totalPend = mostradas.filter(ocPorPagar).reduce((a, o) => a + ocTotal(o), 0)

  return (
    <div>
      <div style={{ fontSize: 12, color: '#8C4519', background: '#F9E9DE', padding: '8px 12px', marginBottom: 12 }}>
        <b>Órdenes de compra a proveedores</b> (emitidas por Serein). Cada OC puede asociarse a una o varias OT con reparto porcentual; su costo neto se carga a esas OT. Las OC pendientes alimentan cuentas por pagar y el flujo de caja del Consolidado.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={agregar} style={{ background: C.naranja, color: '#fff', border: 'none', padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={15} /> Agregar OC</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #CBD2D6', padding: '2px 6px' }}>
          <Search size={13} color={C.gris} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar N°/proveedor/RUT/categoría…" style={{ border: 'none', outline: 'none', fontSize: 12.5, width: 190 }} />
        </div>
        <select style={inp} value={fEst} onChange={e => setFEst(e.target.value)}><option value="">Todos los estados</option>{ESTADOS_PAGO.map(x => <option key={x}>{x}</option>)}</select>
        <span style={{ fontSize: 12.5, color: C.gris }}>{mostradas.length} OC · Total {clp(totalTodas)} · <b style={{ color: C.rojo }}>Por pagar {clp(totalPend)}</b></span>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E2DED4', overflowX: 'auto', padding: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
            {['Nº OC', 'Proveedor', 'RUT', 'Categoría', 'Fecha', 'Neto', 'IVA', 'Total', 'Plazo', 'Vencimiento', 'Estado de pago', ''].map(h => <th key={h} style={{ textAlign: ['Neto', 'IVA', 'Total'].includes(h) ? 'right' : 'left', padding: '5px 6px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {mostradas.map(o => <FilaOC key={o.id} oc={o} otsDisponibles={otsDisponibles} upd={upd} onDelete={eliminar} />)}
            {mostradas.length === 0 && <tr><td colSpan={12} style={{ padding: 16, textAlign: 'center', color: '#9AA0A6' }}>Sin órdenes de compra.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
