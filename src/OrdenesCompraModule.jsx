import React, { useState } from 'react'
import { Plus, Trash2, Search, ChevronDown, ChevronUp, Download } from 'lucide-react'
import Paginador, { paginar } from './Paginador.jsx'
import { PROVEEDORES_FICHA } from './proveedores-data.js'

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

const buscarProv = (proveedores, nombre) => {
  const n = (nombre || '').trim().toLowerCase()
  if (!n) return null
  return (proveedores || []).find(p => (p.nombre || '').trim().toLowerCase() === n) || null
}

const CATEGORIAS = ['Pintura', 'Granalla', 'EPP', 'Ferretería', 'Transporte', 'Arriendo de equipos', 'Mantención', 'Servicios externos', 'Combustible', 'Financiero', 'Otro']
const ESTADOS_PAGO = ['Pendiente', 'Parcialmente pagada', 'Pagada', 'Vencida', 'Anulada']
const AREAS = ['Santa Rosa', 'Istria', 'Proyectos', 'Producción / Planta', 'General empresa']

// ---- Cálculos (compatibles con las OC importadas que sólo traían "monto") ----
const itemTotalOC = it => Math.max(0, Math.round(num(it.cantidad) * num(it.precio) - num(it.descuento)))
export const ocNeto = oc => (oc.items && oc.items.length) ? oc.items.reduce((a, it) => a + itemTotalOC(it), 0) : ((oc.neto != null && oc.neto !== '') ? num(oc.neto) : Math.round(num(oc.monto) / 1.19))
export const ocIva = oc => Math.round(ocNeto(oc) * 0.19)
export const ocTotal = oc => ocNeto(oc) + ocIva(oc)

// ---- Documento OC en PDF (formato SEREIN) ----
const EMPRESA_OC = { nombre: 'SERVICIOS REVESTIMIENTOS INDUSTRIALES SPA', rut: '76.860.656-0', giro: 'Revestimientos Industriales y habitacionales', dir: 'Santa Rosa 70, RENCA', tel: '56999369503', email: 'administracion@sereinspa.com' }
function htmlOC(oc) {
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') };
  var items = (oc.items && oc.items.length) ? oc.items : [{ codigo: '', producto: oc.detalle || oc.categoria || 'Compra a proveedor', cantidad: 1, precio: ocNeto(oc), comentario: '' }];
  var filas = ''; for (var i = 0; i < items.length; i++) { var it = items[i]; filas += '<tr><td>' + esc(it.codigo || '') + '</td><td><b>' + esc(it.producto || '') + '</b>' + (it.comentario ? '<br><span class="cmt">' + esc(it.comentario) + '</span>' : '') + '</td><td class="c">' + (num(it.cantidad) || 1) + '</td><td class="r">' + clp(it.precio) + '</td><td class="r">' + clp(itemTotalOC(it) || it.precio) + '</td></tr>' }
  var cond = oc.condicionPago || ('CREDITO ' + (num(oc.plazo) || 30) + ' DIAS');
  var CSS = '@page{size:A4;margin:20mm 15mm 15mm 15mm}*{box-sizing:border-box}body{font-family:Inter,Arial,Helvetica,sans-serif;color:#101828;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{position:relative}.rhead{position:relative;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #061A40;padding:4px 0 10px;overflow:hidden}.logo{display:flex;align-items:baseline}.lg-a{color:#061A40;font-weight:800;font-size:22px;letter-spacing:1px}.lg-b{color:#FF6B00;font-weight:800;font-size:22px;margin-left:5px;letter-spacing:1px}.rh-mid{flex:1;text-align:center}.rh-title{color:#061A40;font-weight:800;font-size:18px;letter-spacing:.5px}.rh-sub{color:#FF6B00;font-weight:700;font-size:10px;letter-spacing:2px;margin-top:2px}.codebox{background:#061A40;color:#fff;padding:8px 12px;border-radius:6px;font-size:10px;min-width:150px}.cb-row{display:flex;justify-content:space-between;gap:12px;padding:1px 0}.cb-k{color:#9fb0cf}.cb-v{font-weight:700}.stripe{position:absolute;top:-10px;right:120px;width:60px;height:130%;background:#FF6B00;opacity:.10;transform:skewX(-22deg)}.emisor{font-size:10px;color:#5a6b85;margin:8px 0 2px}.infogrid{display:grid;grid-template-columns:1fr 1fr;gap:0 26px;margin:12px 0 4px}.info-item{display:flex;justify-content:space-between;border-bottom:1px solid #D8DCE5;padding:5px 2px;font-size:11px}.info-k{color:#5a6b85}.info-v{font-weight:700;color:#101828;text-align:right}.sec-title{color:#061A40;font-weight:800;font-size:12px;text-transform:uppercase;border-left:4px solid #FF6B00;padding-left:9px;margin:16px 0 7px}table.dt{width:100%;border-collapse:collapse;font-size:11px}table.dt th{background:#061A40;color:#fff;padding:6px 8px;text-align:left;font-size:10px}table.dt td{border:1px solid #D8DCE5;padding:6px 8px}table.dt td.c{text-align:center}table.dt td.r{text-align:right}.cmt{color:#7A8288;font-size:10px}.tot{display:flex;justify-content:flex-end;margin-top:8px}.tot table{border-collapse:collapse;min-width:230px}.tot td{padding:4px 10px;font-size:12px}.tot .tl{color:#5a6b85}.tot .tr{text-align:right;font-weight:700}.tot .big{font-weight:800;color:#061A40}.tot-badge{background:#FF6B00;color:#fff;padding:3px 12px;border-radius:4px;font-weight:800}.obs{margin-top:10px;font-size:11px}.firma{margin-top:34px;border-top:1px solid #D8DCE5;padding-top:10px;font-size:10px;color:#555}.rfooter{display:flex;margin-top:22px;border-radius:6px;overflow:hidden;border:1px solid #D8DCE5}.rf-navy{background:#061A40;color:#fff;flex:1;display:flex;gap:20px;justify-content:center;align-items:center;padding:10px;font-size:10px;font-weight:600}.rf-web{background:#FF6B00;color:#fff;padding:0 16px;font-weight:700;font-size:11px;display:flex;align-items:center}';
  var s = '<!doctype html><html><head><meta charset="utf-8"><title>OC ' + esc(oc.numero) + '</title><style>' + CSS + '</style></head><body><div class="page">';
  s += '<div class="rhead"><div class="stripe"></div><div class="logo"><span class="lg-a">SEREIN</span><span class="lg-b">GROUP</span></div><div class="rh-mid"><div class="rh-title">ORDEN DE COMPRA</div><div class="rh-sub">SEREIN GROUP</div></div><div class="codebox"><div class="cb-row"><span class="cb-k">Folio N</span><span class="cb-v">' + esc(oc.numero || '') + '</span></div><div class="cb-row"><span class="cb-k">Emision</span><span class="cb-v">' + esc(oc.fecha || '') + '</span></div></div></div>';
  s += '<div class="emisor"><b>' + EMPRESA_OC.nombre + '</b> - RUT ' + EMPRESA_OC.rut + ' - ' + EMPRESA_OC.giro + ' - ' + EMPRESA_OC.dir + ' - Tel ' + EMPRESA_OC.tel + ' - ' + EMPRESA_OC.email + '</div>';
  s += '<div class="infogrid"><div class="info-item"><span class="info-k">Proveedor</span><span class="info-v">' + esc(oc.proveedor || '') + '</span></div><div class="info-item"><span class="info-k">R.U.T.</span><span class="info-v">' + esc(oc.rut || '') + '</span></div><div class="info-item"><span class="info-k">Direccion</span><span class="info-v">' + esc(oc.direccion || '') + '</span></div><div class="info-item"><span class="info-k">Despacho</span><span class="info-v">' + esc(oc.despacho || 'Santa Rosa 70, Lampa') + '</span></div><div class="info-item"><span class="info-k">Vencimiento</span><span class="info-v">' + esc(vencOC(oc)) + '</span></div><div class="info-item"><span class="info-k">Condicion de pago</span><span class="info-v">' + esc(cond) + '</span></div><div class="info-item"><span class="info-k">Centro de negocio</span><span class="info-v">' + esc(oc.area || '') + '</span></div><div class="info-item"><span class="info-k">Categoria</span><span class="info-v">' + esc(oc.categoria || '') + '</span></div></div>';
  s += '<div class="sec-title">Detalle de la compra</div>';
  s += '<table class="dt"><thead><tr><th>Codigo</th><th>Producto o servicio</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead><tbody>' + filas + '</tbody></table>';
  s += '<div class="tot"><table><tr><td class="tl">Neto</td><td class="tr">' + clp(ocNeto(oc)) + '</td></tr><tr><td class="tl">IVA 19%</td><td class="tr">' + clp(ocIva(oc)) + '</td></tr><tr><td class="tl big">Total</td><td class="tr"><span class="tot-badge">' + clp(ocTotal(oc)) + '</span></td></tr></table></div>';
  if (oc.obs) s += '<div class="obs"><b>Observaciones:</b> ' + esc(oc.obs) + '</div>';
  s += '<div class="firma">Recepcion conforme &nbsp;&nbsp; Nombre: __________________ &nbsp; R.U.T: ____________ &nbsp; Fecha: __________ &nbsp; Firma: __________</div>';
  s += '<div class="rfooter"><div class="rf-navy"><span>Compromiso con la calidad</span><span>Seguridad en cada proceso</span><span>Excelencia en resultados</span></div><div class="rf-web">www.sereingroup.cl</div></div>';
  return s + '</div></body></html>';
}
export function descargarOCPDF(oc) {
  const w = window.open('', '_blank')
  if (!w) { window.alert('Habilita las ventanas emergentes para descargar la OC.'); return }
  w.document.write(htmlOC(oc)); w.document.close()
  setTimeout(() => { w.focus(); w.print() }, 400)
}
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

function FilaOC({ oc, otsDisponibles, upd, onDelete, proveedores = PROVEEDORES_FICHA }) {
  const [abierta, setAbierta] = useState(false)
  const setProv = v => { const p = buscarProv(proveedores, v); upd(oc.id, { proveedor: v, ...(p ? { rut: p.rut || oc.rut, direccion: p.direccion || oc.direccion } : {}) }) }
  const v = vencOC(oc), vencido = ocPorPagar(oc) && v && v < hoy()
  const asigs = oc.asignaciones || []
  const sumaPct = asigs.reduce((a, x) => a + (num(x.pct) || 0), 0)
  const addAsig = () => upd(oc.id, { asignaciones: [...asigs, { ot: otsDisponibles[0] || '', pct: asigs.length === 0 ? 100 : 0 }] })
  const updAsig = (i, k, val) => upd(oc.id, { asignaciones: asigs.map((x, j) => j === i ? { ...x, [k]: val } : x) })
  const delAsig = i => upd(oc.id, { asignaciones: asigs.filter((_, j) => j !== i) })
  const items = oc.items || []
  const addItem = () => upd(oc.id, { items: [...items, { codigo: '', producto: '', cantidad: 1, precio: 0, comentario: '' }] })
  const updItem = (i, k, val) => upd(oc.id, { items: items.map((x, j) => j === i ? { ...x, [k]: val } : x) })
  const delItem = i => upd(oc.id, { items: items.filter((_, j) => j !== i) })
  return (
    <>
      <tr style={{ borderBottom: '1px solid #EEE9DF', background: vencido ? '#FDF3F0' : 'transparent' }}>
        <td style={{ padding: '4px 6px' }}><input value={oc.numero} onChange={e => upd(oc.id, { numero: e.target.value })} style={{ ...inp, width: 66, fontWeight: 600, padding: '5px 6px' }} /></td>
        <td style={{ padding: '4px 6px' }}><input list="prov-list-oc" value={oc.proveedor} onChange={e => setProv(e.target.value)} style={{ ...inp, width: 180, padding: '5px 6px' }} /></td>
        <td style={{ padding: '4px 6px' }}><input value={oc.rut || ''} onChange={e => upd(oc.id, { rut: e.target.value })} style={{ ...inp, width: 100, padding: '5px 6px' }} /></td>
        <td style={{ padding: '4px 6px' }}><select value={oc.categoria || ''} onChange={e => upd(oc.id, { categoria: e.target.value })} style={{ ...inp, width: 120, padding: '5px 6px' }}><option value="">—</option>{CATEGORIAS.map(x => <option key={x}>{x}</option>)}</select></td>
        <td style={{ padding: '4px 6px' }}><input type="date" value={oc.fecha || ''} onChange={e => upd(oc.id, { fecha: e.target.value })} style={{ ...inp, width: 132, padding: '5px 6px' }} /></td>
        <td style={{ padding: '4px 6px', textAlign: 'right' }}><input value={ocNeto(oc)} readOnly={items.length > 0} title={items.length > 0 ? 'Se calcula desde los ítems' : ''} onChange={e => upd(oc.id, { neto: num(e.target.value), monto: undefined })} style={{ ...inp, width: 100, padding: '5px 6px', textAlign: 'right', fontWeight: 600, background: items.length > 0 ? '#F1EDE6' : '#fff' }} /></td>
        <td style={{ padding: '4px 6px', textAlign: 'right', color: C.gris, whiteSpace: 'nowrap' }}>{clp(ocIva(oc))}</td>
        <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{clp(ocTotal(oc))}</td>
        <td style={{ padding: '4px 6px' }}><input value={oc.plazo != null ? oc.plazo : 30} onChange={e => upd(oc.id, { plazo: num(e.target.value), vencimiento: sumarDias(oc.fecha, num(e.target.value)) })} style={{ ...inp, width: 50, padding: '5px 6px', textAlign: 'right' }} /></td>
        <td style={{ padding: '4px 6px' }}><input type="date" value={v} onChange={e => upd(oc.id, { vencimiento: e.target.value })} style={{ ...inp, width: 132, padding: '5px 6px', color: vencido ? C.rojo : C.carbon }} /></td>
        <td style={{ padding: '4px 6px' }}><select value={oc.estadoPago} onChange={e => upd(oc.id, { estadoPago: e.target.value })} style={{ border: 'none', background: fondoEstado(oc.estadoPago), color: colorEstado(oc.estadoPago), padding: '4px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{ESTADOS_PAGO.map(x => <option key={x}>{x}</option>)}</select></td>
        <td style={{ padding: '4px 6px', whiteSpace: 'nowrap', textAlign: 'right', position: 'sticky', right: 0, background: vencido ? '#FDF3F0' : '#fff', zIndex: 1, boxShadow: '-6px 0 6px -4px rgba(0,0,0,.12)' }}>
          <button onClick={() => descargarOCPDF(oc)} title="Descargar OC (PDF)" style={{ background: C.azul, color: '#fff', border: 'none', cursor: 'pointer', padding: '4px 7px', marginRight: 4 }}><Download size={13} /></button>
          <button onClick={() => setAbierta(!abierta)} title="Detalle, ítems y asignación a OT" style={{ background: 'none', border: '1px solid #CBD2D6', cursor: 'pointer', padding: '3px 6px', marginRight: 4 }}>{abierta ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>
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
              <label style={{ fontSize: 11, color: C.gris }}>Dirección proveedor<input value={oc.direccion || ''} onChange={e => upd(oc.id, { direccion: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
              <label style={{ fontSize: 11, color: C.gris }}>Lugar de despacho<input value={oc.despacho || ''} onChange={e => upd(oc.id, { despacho: e.target.value })} placeholder="Santa Rosa 70, Lampa" style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
              <label style={{ fontSize: 11, color: C.gris }}>Adjunto (nombre / enlace)<input value={oc.adjunto || ''} onChange={e => upd(oc.id, { adjunto: e.target.value })} placeholder="OC_11375.pdf" style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
              <label style={{ fontSize: 11, color: C.gris }}>Observaciones<input value={oc.obs || ''} onChange={e => upd(oc.id, { obs: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
            </div>

            <div style={{ fontSize: 11.5, fontWeight: 600, color: C.gris, textTransform: 'uppercase', margin: '4px 0 6px' }}>Ítems de la OC (aparecen en el PDF; si agregas ítems, el neto se calcula solo)</div>
            {items.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 6 }}>
                <thead><tr style={{ borderBottom: '1px solid #CBD2D6' }}>{['Código', 'Producto o servicio', 'Cant', 'Precio', 'Comentario', ''].map((h, i) => <th key={i} style={{ textAlign: ['Cant', 'Precio'].includes(h) ? 'right' : 'left', padding: '3px 6px', fontSize: 10, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #EEE9DF' }}>
                      <td style={{ padding: '2px 4px' }}><input value={it.codigo} onChange={e => updItem(i, 'codigo', e.target.value)} style={{ ...inp, width: 60, padding: '5px 6px' }} /></td>
                      <td style={{ padding: '2px 4px' }}><input value={it.producto} onChange={e => updItem(i, 'producto', e.target.value)} style={{ ...inp, width: 210, padding: '5px 6px' }} /></td>
                      <td style={{ padding: '2px 4px', textAlign: 'right' }}><input value={it.cantidad} onChange={e => updItem(i, 'cantidad', num(e.target.value))} style={{ ...inp, width: 55, padding: '5px 6px', textAlign: 'right' }} /></td>
                      <td style={{ padding: '2px 4px', textAlign: 'right' }}><input value={it.precio} onChange={e => updItem(i, 'precio', num(e.target.value))} style={{ ...inp, width: 90, padding: '5px 6px', textAlign: 'right' }} /></td>
                      <td style={{ padding: '2px 4px' }}><input value={it.comentario} onChange={e => updItem(i, 'comentario', e.target.value)} placeholder="Ej: RAL 5005" style={{ ...inp, width: 130, padding: '5px 6px' }} /></td>
                      <td style={{ padding: '2px 2px', textAlign: 'right' }}><button onClick={() => delItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button onClick={addItem} style={{ background: 'none', border: '1px dashed #CBD2D6', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.gris, marginBottom: 12 }}>+ Agregar ítem</button>

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

// ---- Formulario para crear / editar una OC en una mini ventana ----
function FormOC({ inicial, otsDisponibles, onGuardar, onCancelar, proveedores = PROVEEDORES_FICHA }) {
  const [f, setF] = useState(inicial)
  const set = (k, v) => setF({ ...f, [k]: v })
  const setProveedor = v => { const p = buscarProv(proveedores, v); setF(prev => ({ ...prev, proveedor: v, ...(p ? { rut: p.rut || prev.rut, direccion: p.direccion || prev.direccion } : {}) })) }
  const setFecha = v => setF({ ...f, fecha: v, vencimiento: sumarDias(v, num(f.plazo)) })
  const setPlazo = v => setF({ ...f, plazo: num(v), vencimiento: sumarDias(f.fecha, num(v)) })
  const items = f.items || []
  const setItem = (i, k, v) => setF({ ...f, items: items.map((x, j) => j === i ? { ...x, [k]: v } : x) })
  const addItem = () => setF({ ...f, items: [...items, { codigo: '', producto: '', cantidad: 1, precio: 0, comentario: '' }] })
  const delItem = i => setF({ ...f, items: items.filter((_, j) => j !== i) })
  const asigs = f.asignaciones || []
  const setAsig = (i, k, v) => setF({ ...f, asignaciones: asigs.map((x, j) => j === i ? { ...x, [k]: v } : x) })
  const addAsig = () => setF({ ...f, asignaciones: [...asigs, { ot: otsDisponibles[0] || '', pct: asigs.length === 0 ? 100 : 0 }] })
  const delAsig = i => setF({ ...f, asignaciones: asigs.filter((_, j) => j !== i) })
  const lab = { fontSize: 11, color: C.gris, display: 'flex', flexDirection: 'column', gap: 3 }
  const sumaPct = asigs.reduce((a, x) => a + (num(x.pct) || 0), 0)
  const conItems = items.length > 0
  const guardar = () => { if (f.proveedor.trim() && (ocNeto(f) > 0)) onGuardar(f) }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 70, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '30px 16px' }} onClick={onCancelar}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', border: `2px solid ${C.naranja}`, width: '100%', maxWidth: 780, padding: 18 }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, textTransform: 'uppercase', marginBottom: 12 }}>Orden de compra · N° {f.numero}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          <label style={lab}>N° OC (correlativo)<input style={{ ...inp, background: '#F1EDE6', fontWeight: 600 }} value={f.numero} onChange={e => set('numero', e.target.value)} /></label>
          <label style={lab}>Proveedor *<input list="prov-list-oc" style={inp} value={f.proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Escribe o elige de la lista…" /></label>
          <label style={lab}>RUT proveedor<input style={inp} value={f.rut} onChange={e => set('rut', e.target.value)} /></label>
          <label style={lab}>Categoría<select style={inp} value={f.categoria} onChange={e => set('categoria', e.target.value)}>{CATEGORIAS.map(x => <option key={x}>{x}</option>)}</select></label>
          <label style={lab}>Centro de negocio / Área<select style={inp} value={f.area} onChange={e => set('area', e.target.value)}>{AREAS.map(a => <option key={a}>{a}</option>)}</select></label>
          <label style={lab}>Fecha emisión<input type="date" style={inp} value={f.fecha} onChange={e => setFecha(e.target.value)} /></label>
          <label style={lab}>Plazo (días)<input style={inp} value={f.plazo} onChange={e => setPlazo(e.target.value)} /></label>
          <label style={lab}>Vencimiento<input type="date" style={inp} value={f.vencimiento} onChange={e => set('vencimiento', e.target.value)} /></label>
          <label style={lab}>Estado de pago<select style={inp} value={f.estadoPago} onChange={e => set('estadoPago', e.target.value)}>{ESTADOS_PAGO.map(x => <option key={x}>{x}</option>)}</select></label>
          <label style={lab}>Dirección proveedor<input style={inp} value={f.direccion} onChange={e => set('direccion', e.target.value)} /></label>
          <label style={lab}>Lugar de despacho<input style={inp} value={f.despacho} onChange={e => set('despacho', e.target.value)} placeholder="Santa Rosa 70, Lampa" /></label>
          <label style={lab}>Adjunto (nombre / enlace)<input style={inp} value={f.adjunto} onChange={e => set('adjunto', e.target.value)} /></label>
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: C.gris, textTransform: 'uppercase', margin: '14px 0 6px' }}>Ítems (aparecen en el PDF; si agregas, el neto se calcula solo)</div>
        {conItems && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 6 }}>
            <thead><tr style={{ borderBottom: '1px solid #CBD2D6' }}>{['Código', 'Producto o servicio', 'Cant', 'Precio', 'Comentario', ''].map((h, i) => <th key={i} style={{ textAlign: ['Cant', 'Precio'].includes(h) ? 'right' : 'left', padding: '3px 6px', fontSize: 10, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #EEE9DF' }}>
                  <td style={{ padding: '2px 4px' }}><input value={it.codigo} onChange={e => setItem(i, 'codigo', e.target.value)} style={{ ...inp, width: 60, padding: '5px 6px' }} /></td>
                  <td style={{ padding: '2px 4px' }}><input value={it.producto} onChange={e => setItem(i, 'producto', e.target.value)} style={{ ...inp, width: 210, padding: '5px 6px' }} /></td>
                  <td style={{ padding: '2px 4px', textAlign: 'right' }}><input value={it.cantidad} onChange={e => setItem(i, 'cantidad', num(e.target.value))} style={{ ...inp, width: 55, padding: '5px 6px', textAlign: 'right' }} /></td>
                  <td style={{ padding: '2px 4px', textAlign: 'right' }}><input value={it.precio} onChange={e => setItem(i, 'precio', num(e.target.value))} style={{ ...inp, width: 90, padding: '5px 6px', textAlign: 'right' }} /></td>
                  <td style={{ padding: '2px 4px' }}><input value={it.comentario} onChange={e => setItem(i, 'comentario', e.target.value)} placeholder="Ej: RAL 5005" style={{ ...inp, width: 130, padding: '5px 6px' }} /></td>
                  <td style={{ padding: '2px 2px', textAlign: 'right' }}><button onClick={() => delItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
          <button onClick={addItem} style={{ background: 'none', border: '1px dashed #CBD2D6', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.gris }}>+ Agregar ítem</button>
          {!conItems && <label style={{ fontSize: 12, color: C.gris, display: 'flex', alignItems: 'center', gap: 6 }}>o Monto neto directo: <input value={f.neto} onChange={e => set('neto', num(e.target.value))} style={{ ...inp, width: 120, textAlign: 'right' }} /></label>}
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: C.gris, textTransform: 'uppercase', margin: '10px 0 6px' }}>Asignación a OT (reparto del costo)</div>
        {asigs.map((x, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <select value={x.ot} onChange={e => setAsig(i, 'ot', e.target.value)} style={{ ...inp, width: 170 }}><option value="">(elige OT)</option>{otsDisponibles.map(o => <option key={o}>{o}</option>)}</select>
            <input value={x.pct} onChange={e => setAsig(i, 'pct', num(e.target.value))} style={{ ...inp, width: 60, textAlign: 'right' }} />%
            <span style={{ fontSize: 12, color: C.gris }}>= {clp(ocNeto(f) * (num(x.pct) || 0) / 100)}</span>
            <button onClick={() => delAsig(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={addAsig} style={{ background: 'none', border: '1px dashed #CBD2D6', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.gris }}>+ Asignar a OT</button>
          {asigs.length > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: sumaPct === 100 ? C.verde : C.rojo }}>Suma: {sumaPct}%</span>}
        </div>

        <input style={{ ...inp, width: '100%', marginTop: 10 }} placeholder="Observaciones" value={f.obs} onChange={e => set('obs', e.target.value)} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, marginTop: 10, fontSize: 13 }}>
          <span>Neto: <b>{clp(ocNeto(f))}</b></span><span>IVA: <b>{clp(ocIva(f))}</b></span><span>Total: <b style={{ color: C.naranja }}>{clp(ocTotal(f))}</b></span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={guardar} style={{ background: C.verde, color: '#fff', border: 'none', padding: '9px 18px', cursor: 'pointer', fontSize: 13 }}>Guardar OC</button>
          <button onClick={onCancelar} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

export default function OrdenesCompraModule({ pp = { ocs: [] }, setPp = () => {}, ots = [], proveedores = PROVEEDORES_FICHA }) {
  const ocs = pp.ocs || []
  const provLista = Object.values((proveedores || []).reduce((m, p) => { const n = (p.nombre || '').trim(); if (n && !m[n.toLowerCase()]) m[n.toLowerCase()] = p; return m }, {}))
  const otsDisponibles = [...new Set((ots || []).map(o => o.numero).filter(Boolean))]
  const setOcs = arr => setPp({ ...pp, ocs: arr })
  const upd = (id, cambios) => setOcs(ocs.map(o => o.id === id ? { ...o, ...cambios } : o))
  const eliminar = id => setOcs(ocs.filter(o => o.id !== id))
  const maxOC = ocs.reduce((m, o) => Math.max(m, parseInt(String(o.numero).replace(/\D/g, ''), 10) || 0), 517)
  const [creando, setCreando] = useState(false)
  const nueva = () => ({ id: 'oc' + Date.now(), numero: String(maxOC + 1), proveedor: '', rut: '', categoria: 'Pintura', detalle: '', area: 'Santa Rosa', fecha: hoy(), neto: 0, plazo: 30, vencimiento: sumarDias(hoy(), 30), estadoPago: 'Pendiente', asignaciones: [], items: [], direccion: '', despacho: '', adjunto: '', obs: '' })
  const [busca, setBusca] = useState('')
  const [fEst, setFEst] = useState('')
  const mostradas = ocs.filter(o =>
    (!busca || (String(o.numero) + ' ' + (o.proveedor || '') + ' ' + (o.rut || '') + ' ' + (o.categoria || '')).toLowerCase().includes(busca.toLowerCase())) &&
    (!fEst || o.estadoPago === fEst)
  ).sort((a, b) => (parseInt(String(b.numero).replace(/\D/g, ''), 10) || 0) - (parseInt(String(a.numero).replace(/\D/g, ''), 10) || 0))
  const [page, setPage] = useState(1)
  const pg = paginar(mostradas, page)
  const totalTodas = mostradas.reduce((a, o) => a + ocTotal(o), 0)
  const totalPend = mostradas.filter(ocPorPagar).reduce((a, o) => a + ocTotal(o), 0)

  return (
    <div>
      <datalist id="prov-list-oc">
        {provLista.map(p => <option key={p.id || p.nombre} value={p.nombre}>{p.rut || ''}</option>)}
      </datalist>
      {creando && <FormOC inicial={nueva()} otsDisponibles={otsDisponibles} proveedores={proveedores} onGuardar={oc => { setOcs([oc, ...ocs]); setCreando(false) }} onCancelar={() => setCreando(false)} />}
      <div style={{ fontSize: 12, color: '#8C4519', background: '#F9E9DE', padding: '8px 12px', marginBottom: 12 }}>
        <b>Órdenes de compra a proveedores</b> (emitidas por Serein). Cada OC puede asociarse a una o varias OT con reparto porcentual; su costo neto se carga a esas OT. Las OC pendientes alimentan cuentas por pagar y el flujo de caja del Consolidado.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={() => setCreando(true)} style={{ background: C.naranja, color: '#fff', border: 'none', padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={15} /> Agregar OC</button>
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
            {['Nº OC', 'Proveedor', 'RUT', 'Categoría', 'Fecha', 'Neto', 'IVA', 'Total', 'Plazo', 'Vencimiento', 'Estado de pago', ''].map((h, hi) => <th key={hi} style={{ textAlign: ['Neto', 'IVA', 'Total'].includes(h) ? 'right' : 'left', padding: '5px 6px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase', whiteSpace: 'nowrap', ...(h === '' ? { position: 'sticky', right: 0, background: '#fff', zIndex: 3 } : {}) }}>{h || 'Acciones'}</th>)}
          </tr></thead>
          <tbody>
            {pg.items.map(o => <FilaOC key={o.id} oc={o} otsDisponibles={otsDisponibles} upd={upd} onDelete={eliminar} proveedores={proveedores} />)}
            {mostradas.length === 0 && <tr><td colSpan={12} style={{ padding: 16, textAlign: 'center', color: '#9AA0A6' }}>Sin órdenes de compra.</td></tr>}
          </tbody>
        </table>
        <Paginador page={pg.page} paginas={pg.paginas} total={pg.total} setPage={setPage} />
      </div>
    </div>
  )
}
