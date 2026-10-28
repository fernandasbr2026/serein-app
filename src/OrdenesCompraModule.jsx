import React, { useState, useRef } from 'react'
import { Plus, Trash2, Search, ChevronDown, ChevronUp, Download } from 'lucide-react'
import Paginador, { paginar } from './Paginador.jsx'
import { PROVEEDORES_FICHA } from './proveedores-data.js'
import { pullState, pushState } from './sync.js'

// ============================================================
// MÓDULO: Órdenes de Compra a PROVEEDORES (emitidas por Serein)
// Cada OC puede asociarse a una o varias OT/áreas con % de reparto.
// Alimenta: costos de la OT, cuentas por pagar y flujo de caja.
// ============================================================

import { SEREIN } from './theme-serein.js'
// Paleta reskineada a la identidad Serein 2026 — mismas claves, solo cambian los valores hex.
const C = { naranja: SEREIN.orange, teal: '#0E7A8F', carbon: SEREIN.text, verde: SEREIN.green, rojo: SEREIN.red, gris: SEREIN.textFaint, azul: SEREIN.ink }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/[^\d-]/g, ''), 10); return isNaN(v) ? 0 : v }
// Porcentajes de reparto: admiten decimales (el reparto por m² casi nunca da exacto)
const pctNum = s => { let x = String(s == null ? '' : s).trim().replace(/[^\d.,-]/g, ''); if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.'); else if (/^-?\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, ''); const v = parseFloat(x); return isNaN(v) ? 0 : v }
const inp = { padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, boxSizing: 'border-box' }
const hoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
const sumarDias = (fecha, dias) => { if (!fecha) return ''; const d = new Date(fecha + 'T12:00:00'); d.setDate(d.getDate() + (parseInt(dias, 10) || 0)); return d.toISOString().slice(0, 10) }

// Lista única de proveedores para autocompletar en cualquier formulario de compra: la ficha fija,
// los cargados en Proveedores y Pagos, y los nombres que ya vienen en el Libro de Compras (SII) y en
// las OC existentes. Sin repetidos (por nombre), ordenada.
export function listaProveedores(pp, libroCompras = []) {
  const m = {}
  const add = p => { const n = String((p && p.nombre) || '').trim(); if (!n) return; const k = n.toLowerCase(); if (!m[k]) m[k] = { id: p.id || k, nombre: n, rut: p.rut || '', direccion: p.direccion || '' }; else { if (!m[k].rut && p.rut) m[k].rut = p.rut; if (!m[k].direccion && p.direccion) m[k].direccion = p.direccion } }
  ;(PROVEEDORES_FICHA || []).forEach(add)
  ;((pp && pp.proveedores) || []).forEach(add)
  ;((pp && pp.ocs) || []).forEach(o => add({ nombre: o.proveedor, rut: o.rut, direccion: o.direccion }))
  ;(libroCompras || []).forEach(r => add({ nombre: r.provider_name, rut: r.provider_rut }))
  return Object.values(m).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
const buscarProv = (proveedores, nombre) => {
  const n = (nombre || '').trim().toLowerCase()
  if (!n) return null
  return (proveedores || []).find(p => (p.nombre || '').trim().toLowerCase() === n) || null
}

const CATEGORIAS = ['Pintura', 'Granalla', 'EPP', 'Ferretería', 'Transporte', 'Arriendo de equipos', 'Mantención', 'Servicios externos', 'Combustible', 'Financiero', 'Otro']
const ESTADOS_PAGO = ['Pendiente', 'Parcialmente pagada', 'Pagada', 'Vencida', 'Anulada']
const AREAS = ['Santa Rosa', 'Istria', 'Proyectos', 'Producción / Planta', 'General empresa']

// ---- Cálculos (compatibles con las OC importadas que sólo traían "monto") ----
// Cantidad y precio admiten decimales (1,5 galones; $1.234,56); el total se redondea a pesos al final (auditoría D-6)
const itemTotalOC = it => Math.max(0, Math.round(Math.max(0, pctNum(it.cantidad)) * Math.max(0, pctNum(it.precio)) - Math.max(0, pctNum(it.descuento))))
export const ocNeto = oc => (oc.items && oc.items.length) ? oc.items.reduce((a, it) => a + itemTotalOC(it), 0) : ((oc.neto != null && oc.neto !== '') ? num(oc.neto) : Math.round(num(oc.monto) / 1.19))
export const ocIva = oc => Math.round(ocNeto(oc) * 0.19)
export const ocTotal = oc => ocNeto(oc) + ocIva(oc)

// ---- Documento OC en PDF (formato SEREIN) ----
// tel: numero oficial de la empresa (mismo WhatsApp del sitio web) — nunca
// el celular personal de nadie del equipo.
const _EMP_DEF_OC = { nombre: 'SERVICIOS REVESTIMIENTOS INDUSTRIALES SPA', rut: '76.860.656-0', giro: 'Revestimientos Industriales y habitacionales', dir: 'Santa Rosa 70, RENCA', tel: '56945917843', email: 'administracion@sereinspa.com' }
function _empValOC(k, map) { try { const p = JSON.parse(localStorage.getItem('serein_params') || '{}'); const e = (p && p.empresa) || {}; const v = e[map]; return (v && String(v).trim()) || _EMP_DEF_OC[k] || '' } catch (x) { return _EMP_DEF_OC[k] || '' } }
const EMPRESA_OC = {}
;[['nombre', 'razonSocial'], ['rut', 'rut'], ['giro', 'giro'], ['dir', 'direccion'], ['tel', 'telefono'], ['email', 'correo']].forEach(m => Object.defineProperty(EMPRESA_OC, m[0], { get() { return _empValOC(m[0], m[1]) }, enumerable: true }))
function htmlOC(oc) {
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') };
  var items = (oc.items && oc.items.length) ? oc.items : [{ codigo: '', producto: oc.detalle || oc.categoria || 'Compra a proveedor', cantidad: 1, precio: ocNeto(oc), comentario: '' }];
  var filas = ''; for (var i = 0; i < items.length; i++) { var it = items[i]; filas += '<tr><td>' + esc(it.codigo || '') + '</td><td><b>' + esc(it.producto || '') + '</b>' + (it.comentario ? '<br><span class="cmt">' + esc(it.comentario) + '</span>' : '') + '</td><td class="c">' + (num(it.cantidad) || 1) + '</td><td class="r">' + clp(it.precio) + '</td><td class="r">' + clp(itemTotalOC(it) || it.precio) + '</td></tr>' }
  var cond = oc.condicionPago || ('CREDITO ' + (num(oc.plazo) || 30) + ' DIAS');
  var CSS = '@page{size:A4;margin:20mm 15mm 15mm 15mm}*{box-sizing:border-box}body{font-family:Inter,Arial,Helvetica,sans-serif;color:#101828;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{position:relative}.rhead{position:relative;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #061A40;padding:4px 0 10px;overflow:hidden}.logo{display:flex;align-items:baseline}.lg-a{color:#061A40;font-weight:800;font-size:22px;letter-spacing:1px}.lg-b{color:#FF6B00;font-weight:800;font-size:22px;margin-left:5px;letter-spacing:1px}.rh-mid{flex:1;text-align:center}.rh-title{color:#061A40;font-weight:800;font-size:18px;letter-spacing:.5px}.rh-sub{color:#FF6B00;font-weight:700;font-size:10px;letter-spacing:2px;margin-top:2px}.codebox{background:#061A40;color:#fff;padding:8px 12px;border-radius:6px;font-size:10px;min-width:150px}.cb-row{display:flex;justify-content:space-between;gap:12px;padding:1px 0}.cb-k{color:#9fb0cf}.cb-v{font-weight:700}.stripe{position:absolute;top:-10px;right:120px;width:60px;height:130%;background:#FF6B00;opacity:.10;transform:skewX(-22deg)}.emisor{font-size:10px;color:#5a6b85;margin:8px 0 2px}.infogrid{display:grid;grid-template-columns:1fr 1fr;gap:0 26px;margin:12px 0 4px}.info-item{display:flex;justify-content:space-between;border-bottom:1px solid #D8DCE5;padding:5px 2px;font-size:11px}.info-k{color:#5a6b85}.info-v{font-weight:700;color:#101828;text-align:right}.sec-title{color:#061A40;font-weight:800;font-size:12px;text-transform:uppercase;border-left:4px solid #FF6B00;padding-left:9px;margin:16px 0 7px}table.dt{width:100%;border-collapse:collapse;font-size:11px}table.dt th{background:#061A40;color:#fff;padding:6px 8px;text-align:left;font-size:10px}table.dt td{border:1px solid #D8DCE5;padding:6px 8px}table.dt td.c{text-align:center}table.dt td.r{text-align:right}.cmt{color:#7A8288;font-size:10px}.tot{display:flex;justify-content:flex-end;margin-top:8px}.tot table{border-collapse:collapse;min-width:230px}.tot td{padding:4px 10px;font-size:12px}.tot .tl{color:#5a6b85}.tot .tr{text-align:right;font-weight:700}.tot .big{font-weight:800;color:#061A40}.tot-badge{background:#FF6B00;color:#fff;padding:3px 12px;border-radius:4px;font-weight:800}.obs{margin-top:10px;font-size:11px}.firma{margin-top:34px;border-top:1px solid #D8DCE5;padding-top:10px;font-size:10px;color:#555}.rfooter{display:flex;margin-top:22px;border-radius:6px;overflow:hidden;border:1px solid #D8DCE5}.rf-navy{background:#061A40;color:#fff;flex:1;display:flex;gap:20px;justify-content:center;align-items:center;padding:10px;font-size:10px;font-weight:600}.rf-web{background:#FF6B00;color:#fff;padding:0 16px;font-weight:700;font-size:11px;display:flex;align-items:center}';
  var s = '<!doctype html><html><head><meta charset="utf-8"><title>OC ' + esc(oc.numero) + '</title><style>' + CSS + '</style></head><body><div class="page">';
  s += '<div class="rhead"><div class="stripe"></div>' + (function(){var _l='';try{_l=localStorage.getItem('serein_logo')||''}catch(e){}return _l?'<img src="'+_l+'" style="height:44px;display:block"/>':'<div class="logo"><span class="lg-a">SEREIN</span><span class="lg-b">GROUP</span></div>';})() + '<div class="rh-mid"><div class="rh-title">ORDEN DE COMPRA</div><div class="rh-sub">SEREIN GROUP</div></div><div class="codebox"><div class="cb-row"><span class="cb-k">Folio N</span><span class="cb-v">' + esc(oc.numero || '') + '</span></div><div class="cb-row"><span class="cb-k">Emision</span><span class="cb-v">' + esc(oc.fecha || '') + '</span></div></div></div>';
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
// Gasto mensual general (EPP y similares): no se carga a ninguna OT, se mide por mes.
// Si la OC no dice nada, el EPP cuenta como mensual; marcarlo o desmarcarlo a mano manda siempre.
export const esGastoMensual = oc => oc.mensual === true || (oc.mensual == null && oc.categoria === 'EPP')
// Costo neto que una OT recibe desde las OC (según asignación %)
export const costoOCdeOT = (ocs, numeroOT) => (ocs || []).filter(o => o.estadoPago !== 'Anulada' && !esGastoMensual(o)).reduce((a, o) => {
  const asigs = (o.asignaciones && o.asignaciones.length) ? o.asignaciones : null
  if (!asigs) return a
  return a + asigs.filter(x => x.ot === numeroOT).reduce((s, x) => s + ocNeto(o) * (pctNum(x.pct) || 0) / 100, 0)
}, 0)

// Reparte 100 % entre las OT elegidas en proporción a sus m² (si alguna no tiene m², en partes iguales).
// Los porcentajes llevan 2 decimales y el último absorbe la diferencia para que sumen exactamente 100.
export const repartirPorM2 = (numeros, otsInfo) => {
  const ms = numeros.map(n => { const o = (otsInfo || []).find(x => x.numero === n); return Math.max(0, parseFloat(o && o.m2) || 0) })
  const todas = ms.every(m => m > 0)
  const total = todas ? ms.reduce((a, m) => a + m, 0) : numeros.length
  let acum = 0
  return numeros.map((n, i) => {
    const pct = i === numeros.length - 1 ? Math.round((100 - acum) * 100) / 100 : Math.round(((todas ? ms[i] : 1) / total) * 10000) / 100
    acum += pct
    return { ot: n, pct }
  })
}
// pp.ocs lo escriben varios módulos: antes de cambiarlo se trae lo más fresco de la nube.
export const guardarOcFrescoEn = async (pp, setPp, mutar) => {
  try { await pullState() } catch (e) {}
  let fresco = null
  try { fresco = JSON.parse(localStorage.getItem('serein_pp') || 'null') } catch (e) {}
  const basePp = fresco && typeof fresco === 'object' ? fresco : pp
  const nuevoPp = { ...basePp, ocs: mutar(basePp.ocs || []) }
  try { localStorage.setItem('serein_pp', JSON.stringify(nuevoPp)) } catch (e) {}
  setPp(nuevoPp)
  pushState()
}
// OC en blanco con el siguiente correlativo; `extra` pisa los valores por defecto.
export const nuevaOC = (ocs, extra = {}) => {
  const max = (ocs || []).reduce((m, o) => Math.max(m, parseInt(String(o.numero).replace(/\D/g, ''), 10) || 0), 517)
  return { id: 'oc' + Date.now(), numero: String(max + 1), proveedor: '', rut: '', categoria: 'Pintura', detalle: '', area: 'Santa Rosa', fecha: hoy(), neto: 0, plazo: 30, vencimiento: sumarDias(hoy(), 30), estadoPago: 'Pendiente', asignaciones: [], items: [], direccion: '', despacho: '', adjunto: '', obs: '', ...extra }
}

const fondoEstado = e => ({ Pagada: '#E6F7EE', 'Parcialmente pagada': '#FDECDD', Vencida: '#FCEBEA', Pendiente: '#FDECDD', Anulada: '#EEE' }[e] || '#EEE')
const colorEstado = e => ({ Pagada: C.verde, 'Parcialmente pagada': C.naranja, Vencida: C.rojo, Pendiente: '#D9600A', Anulada: C.gris }[e] || C.gris)

// ---- Trazabilidad OC <-> factura del proveedor (Libro de Compras) ----
// La verdad vive en la OC: `oc.facturas = [{ libroId, folio, fecha, neto, rut }]`. Una OC puede tener varias
// facturas (compras parciales); una factura del libro queda ligada a una sola OC. El Libro de Compras y la ficha
// de la OT solo leen y escriben ese mismo campo, así no hay dos lugares que puedan contradecirse.
const rutNorm = r => String(r || '').split('.').join('').split(' ').join('').toUpperCase()
export const facturasDeOC = oc => (oc && Array.isArray(oc.facturas)) ? oc.facturas : []
// ¿Qué OC respalda esta fila del libro? Primero por id de la fila; si la factura se escribió a mano, por folio + RUT.
export const ocDeFactura = (ocs, fila) => (ocs || []).find(o => facturasDeOC(o).some(f =>
  (fila.id != null && f.libroId != null && String(f.libroId) === String(fila.id)) ||
  (f.libroId == null && String(f.folio || '').trim() === String(fila.document_number || '').trim() && rutNorm(f.rut || o.rut) === rutNorm(fila.provider_rut))))
const filaAFactura = r => ({ libroId: r.id, folio: String(r.document_number || ''), fecha: r.emission_date || '', neto: Number(r.neto) || 0, rut: r.provider_rut || '' })

export function FacturasDeOC({ oc, libroCompras = [], ocs = [], onChange, compacto = false }) {
  const [folioManual, setFolioManual] = useState('')
  const facturas = facturasDeOC(oc)
  const rut = rutNorm(oc.rut)
  // Facturas del libro del mismo proveedor (no notas de crédito) que todavía no están ligadas a ninguna OC
  const candidatas = (libroCompras || []).filter(r => String(r.document_type || '').trim() !== '61' && (!rut || rutNorm(r.provider_rut) === rut) && !ocDeFactura(ocs, r))
  const vincular = r => onChange([...facturas, filaAFactura(r)])
  const quitar = i => onChange(facturas.filter((_, j) => j !== i))
  const manual = () => { const f = folioManual.trim(); if (!f) return; onChange([...facturas, { libroId: null, folio: f, fecha: '', neto: 0, rut: oc.rut || '' }]); setFolioManual('') }
  const sumaFact = facturas.reduce((a, f) => a + (Number(f.neto) || 0), 0)
  return (
    <div style={{ marginTop: compacto ? 0 : 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: C.gris, textTransform: 'uppercase', marginBottom: 6 }}>Facturas del proveedor que respaldan esta OC</div>
      {facturas.length === 0 ? <div style={{ fontSize: 12, color: '#C2570B', marginBottom: 6 }}>Sin factura todavía.</div> : (
        <table style={{ borderCollapse: 'collapse', fontSize: 12, marginBottom: 6 }}>
          <tbody>
            {facturas.map((f, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #DFE4EA' }}>
                <td style={{ padding: '3px 8px 3px 0', fontWeight: 600 }}>Folio {f.folio || '—'}</td>
                <td style={{ padding: '3px 8px', color: C.gris, whiteSpace: 'nowrap' }}>{f.fecha || (f.libroId == null ? 'escrita a mano' : '')}</td>
                <td style={{ padding: '3px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{f.neto ? clp(f.neto) : ''}</td>
                <td style={{ padding: '3px 0 3px 8px' }}><button onClick={() => quitar(i)} title="Quitar el vínculo (la factura sigue en el libro)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button></td>
              </tr>
            ))}
            {facturas.length > 1 && <tr><td colSpan={2} style={{ padding: '3px 8px 3px 0', color: C.gris }}>Suma facturada (neto)</td><td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 600 }}>{clp(sumaFact)}</td><td /></tr>}
          </tbody>
        </table>
      )}
      {facturas.length > 0 && ocNeto(oc) > 0 && Math.abs(sumaFact - ocNeto(oc)) > Math.max(1000, ocNeto(oc) * 0.02) && facturas.some(f => f.libroId != null)
        ? <div style={{ fontSize: 11.5, color: '#C2570B', marginBottom: 6 }}>Lo facturado ({clp(sumaFact)}) no coincide con el neto de la OC ({clp(ocNeto(oc))}).</div> : null}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value="" onChange={e => { const r = candidatas.find(x => String(x.id) === e.target.value); if (r) vincular(r) }} style={{ ...inp, width: 300 }}>
          <option value="">{candidatas.length ? '+ Vincular factura del Libro de Compras…' : (rut ? 'No hay facturas sin OC de este proveedor en el libro' : 'Pon el RUT del proveedor para buscar sus facturas')}</option>
          {candidatas.map(r => <option key={r.id} value={String(r.id)}>Folio {r.document_number} · {r.emission_date || ''} · {clp(r.document_total || r.neto)}</option>)}
        </select>
        <span style={{ fontSize: 12, color: C.gris }}>o folio a mano:</span>
        <input value={folioManual} onChange={e => setFolioManual(e.target.value)} onKeyDown={e => e.key === 'Enter' && manual()} placeholder="N° factura" style={{ ...inp, width: 110 }} />
        <button onClick={manual} style={{ background: 'none', border: '1px dashed #DFE4EA', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.gris }}>Agregar</button>
      </div>
      {!compacto && <div style={{ fontSize: 11, color: C.gris, marginTop: 4 }}>Si la factura todavía no llegó al libro, escribe el folio: cuando aparezca en el Libro de Compras se reconoce sola por folio y RUT.</div>}
    </div>
  )
}

function FilaOC({ oc, otsDisponibles, upd, onDelete, proveedores = PROVEEDORES_FICHA, libroCompras = [], ocs = [] }) {
  const [abierta, setAbierta] = useState(false)
  const setProv = v => { const p = buscarProv(proveedores, v); upd(oc.id, { proveedor: v, ...(p ? { rut: p.rut || oc.rut, direccion: p.direccion || oc.direccion } : {}) }) }
  const v = vencOC(oc), vencido = ocPorPagar(oc) && v && v < hoy()
  const asigs = oc.asignaciones || []
  const mensual = esGastoMensual(oc)
  const sumaPct = Math.round(asigs.reduce((a, x) => a + (pctNum(x.pct) || 0), 0) * 100) / 100
  const addAsig = () => upd(oc.id, { asignaciones: [...asigs, { ot: otsDisponibles[0] || '', pct: asigs.length === 0 ? 100 : 0 }] })
  const updAsig = (i, k, val) => upd(oc.id, { asignaciones: asigs.map((x, j) => j === i ? { ...x, [k]: val } : x) })
  const delAsig = i => upd(oc.id, { asignaciones: asigs.filter((_, j) => j !== i) })
  const items = oc.items || []
  const addItem = () => upd(oc.id, { items: [...items, { codigo: '', producto: '', cantidad: 1, precio: 0, comentario: '' }] })
  const updItem = (i, k, val) => upd(oc.id, { items: items.map((x, j) => j === i ? { ...x, [k]: val } : x) })
  const delItem = i => upd(oc.id, { items: items.filter((_, j) => j !== i) })
  return (
    <>
      <tr style={{ borderBottom: '1px solid #DFE4EA', background: vencido ? '#FDECDD' : 'transparent' }}>
        <td style={{ padding: '4px 6px' }}><input value={oc.numero} onChange={e => upd(oc.id, { numero: e.target.value })} style={{ ...inp, width: 66, fontWeight: 600, padding: '5px 6px' }} />{!mensual && asigs.length === 0 ? <div title="No está ligada a ninguna OT: no aparece en ninguna ficha" style={{ fontSize: 10, color: '#C2570B', marginTop: 2, fontWeight: 600 }}>Sin OT</div> : null}{facturasDeOC(oc).length ? <div style={{ fontSize: 10, color: C.verde, marginTop: 2 }}>Fact. {facturasDeOC(oc).map(f => f.folio).join(', ')}</div> : null}</td>
        <td style={{ padding: '4px 6px' }}><input list="prov-list-oc" value={oc.proveedor} onChange={e => setProv(e.target.value)} style={{ ...inp, width: 180, padding: '5px 6px' }} /></td>
        <td style={{ padding: '4px 6px' }}><input value={oc.rut || ''} onChange={e => upd(oc.id, { rut: e.target.value })} style={{ ...inp, width: 100, padding: '5px 6px' }} /></td>
        <td style={{ padding: '4px 6px' }}><select value={oc.categoria || ''} onChange={e => upd(oc.id, { categoria: e.target.value })} style={{ ...inp, width: 120, padding: '5px 6px' }}><option value="">—</option>{CATEGORIAS.map(x => <option key={x}>{x}</option>)}</select>{esGastoMensual(oc) ? <div style={{ fontSize: 10, color: '#C2570B', marginTop: 2 }}>Gasto mensual</div> : null}</td>
        <td style={{ padding: '4px 6px' }}><input type="date" value={oc.fecha || ''} onChange={e => upd(oc.id, { fecha: e.target.value })} style={{ ...inp, width: 132, padding: '5px 6px' }} /></td>
        <td style={{ padding: '4px 6px', textAlign: 'right' }}><input value={ocNeto(oc)} readOnly={items.length > 0} title={items.length > 0 ? 'Se calcula desde los ítems' : ''} onChange={e => upd(oc.id, { neto: num(e.target.value), monto: undefined })} style={{ ...inp, width: 100, padding: '5px 6px', textAlign: 'right', fontWeight: 600, background: items.length > 0 ? '#E2E7EC' : '#fff' }} /></td>
        <td style={{ padding: '4px 6px', textAlign: 'right', color: C.gris, whiteSpace: 'nowrap' }}>{clp(ocIva(oc))}</td>
        <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{clp(ocTotal(oc))}</td>
        <td style={{ padding: '4px 6px' }}><input value={oc.plazo != null ? oc.plazo : 30} onChange={e => upd(oc.id, { plazo: num(e.target.value), vencimiento: sumarDias(oc.fecha, num(e.target.value)) })} style={{ ...inp, width: 50, padding: '5px 6px', textAlign: 'right' }} /></td>
        <td style={{ padding: '4px 6px' }}><input type="date" value={v} onChange={e => upd(oc.id, { vencimiento: e.target.value })} style={{ ...inp, width: 132, padding: '5px 6px', color: vencido ? C.rojo : C.carbon }} /></td>
        <td style={{ padding: '4px 6px' }}><select value={oc.estadoPago} onChange={e => upd(oc.id, { estadoPago: e.target.value })} style={{ border: 'none', background: fondoEstado(oc.estadoPago), color: colorEstado(oc.estadoPago), padding: '4px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{ESTADOS_PAGO.map(x => <option key={x}>{x}</option>)}</select></td>
        <td style={{ padding: '4px 6px', whiteSpace: 'nowrap', textAlign: 'right', position: 'sticky', right: 0, background: vencido ? '#FDECDD' : '#fff', zIndex: 1, boxShadow: '-6px 0 6px -4px rgba(0,0,0,.12)' }}>
          <button onClick={() => descargarOCPDF(oc)} title="Descargar OC (PDF)" style={{ background: C.azul, color: '#fff', border: 'none', cursor: 'pointer', padding: '4px 7px', marginRight: 4 }}><Download size={13} /></button>
          <button onClick={() => setAbierta(!abierta)} title="Detalle, ítems y asignación a OT" style={{ background: 'none', border: '1px solid #DFE4EA', cursor: 'pointer', padding: '3px 6px', marginRight: 4 }}>{abierta ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>
          <button onClick={() => window.confirm('¿Eliminar esta OC?') && onDelete(oc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
        </td>
      </tr>
      {abierta && (
        <tr style={{ background: '#F2F4F7' }}>
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
                <thead><tr style={{ borderBottom: '1px solid #DFE4EA' }}>{['Código', 'Producto o servicio', 'Cant', 'Precio', 'Comentario', ''].map((h, i) => <th key={i} style={{ textAlign: ['Cant', 'Precio'].includes(h) ? 'right' : 'left', padding: '3px 6px', fontSize: 10, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #DFE4EA' }}>
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
            <button onClick={addItem} style={{ background: 'none', border: '1px dashed #DFE4EA', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.gris, marginBottom: 12 }}>+ Agregar ítem</button>

            <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <input type="checkbox" checked={mensual} onChange={e => upd(oc.id, e.target.checked ? { mensual: true, asignaciones: [] } : { mensual: false })} />
              Gasto mensual general (EPP y similares): no se carga a ninguna OT
            </label>
            {mensual ? <div style={{ fontSize: 12, color: C.gris }}>Se cuenta como gasto del mes (ver «Gastos mensuales» arriba) y no afecta la utilidad de ninguna OT.</div> : (
              <>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: C.gris, textTransform: 'uppercase', marginBottom: 6 }}>Asignación a OT (reparto del costo)</div>
            {asigs.map((x, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <select value={x.ot} onChange={e => updAsig(i, 'ot', e.target.value)} style={{ ...inp, width: 160 }}>
                  <option value="">(elige OT)</option>
                  {otsDisponibles.map(o => <option key={o}>{o}</option>)}
                </select>
                <input value={x.pct} onChange={e => updAsig(i, 'pct', e.target.value)} style={{ ...inp, width: 70, textAlign: 'right' }} />%
                <span style={{ fontSize: 12, color: C.gris }}>= {clp(ocNeto(oc) * (pctNum(x.pct) || 0) / 100)} de costo</span>
                <button onClick={() => delAsig(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
              <button onClick={addAsig} style={{ background: 'none', border: '1px dashed #DFE4EA', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.gris }}>+ Asignar a OT</button>
              {asigs.length > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: Math.abs(sumaPct - 100) < 0.05 ? C.verde : C.rojo }}>Suma: {sumaPct}% {Math.abs(sumaPct - 100) < 0.05 ? '✓' : '(debería ser 100%)'}</span>}
            </div>
              </>
            )}
            <FacturasDeOC oc={oc} libroCompras={libroCompras} ocs={ocs} onChange={facturas => upd(oc.id, { facturas })} />
          </td>
        </tr>
      )}
    </>
  )
}

// ---- Formulario para crear / editar una OC en una mini ventana ----
export function FormOC({ inicial, otsDisponibles, otsInfo = [], onGuardar, onCancelar, proveedores = PROVEEDORES_FICHA }) {
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
  // OT activas que se pueden tocar para cargarles la compra (diésel, flete…): al marcar o desmarcar, el reparto se rehace por m²
  const activas = otsInfo.filter(o => o.estado !== 'Cerrada')
  const marcadas = new Set(asigs.map(a => a.ot))
  const conM2 = asigs.length > 0 && asigs.every(a => (otsInfo.find(o => o.numero === a.ot) || {}).m2 > 0)
  const alternarOT = n => { const nums = marcadas.has(n) ? asigs.map(a => a.ot).filter(x => x !== n) : [...asigs.map(a => a.ot), n]; setF({ ...f, asignaciones: repartirPorM2(nums, otsInfo) }) }
  const repartir = () => setF({ ...f, asignaciones: repartirPorM2(asigs.map(a => a.ot), otsInfo) })
  const lab = { fontSize: 11, color: C.gris, display: 'flex', flexDirection: 'column', gap: 3 }
  const sumaPct = Math.round(asigs.reduce((a, x) => a + (pctNum(x.pct) || 0), 0) * 100) / 100
  const conItems = items.length > 0
  const mensual = esGastoMensual(f)
  // Antes, si faltaba el proveedor o el monto, el botón no hacía nada y parecía que la OC «no se guardaba».
  const [aviso, setAviso] = useState('')
  const [avisadoSinOT, setAvisadoSinOT] = useState(false)
  const guardar = () => {
    if (!f.proveedor.trim()) { setAviso('Falta el proveedor.'); return }
    if (!(ocNeto(f) > 0)) { setAviso(conItems ? 'Los ítems suman $0: revisa cantidad y precio.' : 'Falta el monto neto (o agrega ítems con precio).'); return }
    // Sin OT la OC no aparece en ninguna ficha: se avisa una vez; si vuelve a pulsar Guardar, se guarda igual (puede ligarse después)
    if (!mensual && asigs.filter(a => a.ot).length === 0 && !avisadoSinOT) { setAvisadoSinOT(true); setAviso('Esta OC no está ligada a ninguna OT: no aparecerá en la ficha de ninguna OT. Asígnala abajo, o pulsa Guardar otra vez para guardarla igual.'); return }
    // Un reparto que no suma 100 % carga de más (o de menos) a las OT y distorsiona su margen (auditoría F-3)
    if (!mensual && asigs.filter(a => a.ot).length > 0 && Math.abs(sumaPct - 100) > 0.05) { setAviso('El reparto entre OT suma ' + sumaPct + ' %: debe sumar exactamente 100 % (usa «Repartir por m²» o corrige los porcentajes).'); return }
    setAviso('')
    onGuardar(f)
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 70, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '30px 16px' }} onClick={onCancelar}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', border: `2px solid ${C.naranja}`, width: '100%', maxWidth: 780, padding: 18 }}>
        <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase', marginBottom: 12 }}>Orden de compra · N° {f.numero}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          <label style={lab}>N° OC (correlativo)<input style={{ ...inp, background: '#E2E7EC', fontWeight: 600 }} value={f.numero} onChange={e => set('numero', e.target.value)} /></label>
          <label style={lab}>Proveedor *<input list="prov-list-form-oc" style={inp} value={f.proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Escribe o elige de la lista…" /></label>
          <datalist id="prov-list-form-oc">{(proveedores || []).map(p => <option key={p.id || p.nombre} value={p.nombre}>{p.rut || ''}</option>)}</datalist>
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
            <thead><tr style={{ borderBottom: '1px solid #DFE4EA' }}>{['Código', 'Producto o servicio', 'Cant', 'Precio', 'Comentario', ''].map((h, i) => <th key={i} style={{ textAlign: ['Cant', 'Precio'].includes(h) ? 'right' : 'left', padding: '3px 6px', fontSize: 10, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #DFE4EA' }}>
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
          <button onClick={addItem} style={{ background: 'none', border: '1px dashed #DFE4EA', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.gris }}>+ Agregar ítem</button>
          {!conItems && <label style={{ fontSize: 12, color: C.gris, display: 'flex', alignItems: 'center', gap: 6 }}>o Monto neto directo: <input value={f.neto} onChange={e => set('neto', num(e.target.value))} style={{ ...inp, width: 120, textAlign: 'right' }} /></label>}
        </div>

        <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, margin: '10px 0 8px' }}>
          <input type="checkbox" checked={mensual} onChange={e => setF({ ...f, ...(e.target.checked ? { mensual: true, asignaciones: [] } : { mensual: false }) })} />
          Gasto mensual general (EPP y similares): no se carga a ninguna OT
        </label>
        {mensual ? <div style={{ fontSize: 12, color: C.gris }}>Se cuenta como gasto del mes y no afecta la utilidad de ninguna OT.</div> : (
          <>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.gris, textTransform: 'uppercase', margin: '10px 0 6px' }}>Asignación a OT (reparto del costo)</div>
        {activas.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: C.gris, marginBottom: 4 }}>Toca las OT activas a las que se carga esta compra (el reparto se calcula por m²; puedes corregir los %):</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {activas.map(o => (
                <button key={o.numero} type="button" onClick={() => alternarOT(o.numero)} title={(o.cliente || '') + (o.m2 > 0 ? ' · ' + o.m2 + ' m²' : ' · sin m² informados')}
                  style={{ border: '1px solid ' + (marcadas.has(o.numero) ? C.naranja : '#DFE4EA'), background: marcadas.has(o.numero) ? '#FDECDD' : '#fff', color: marcadas.has(o.numero) ? '#C2570B' : C.carbon, padding: '4px 9px', fontSize: 12, cursor: 'pointer' }}>
                  {o.numero}{o.m2 > 0 ? ' · ' + o.m2 + ' m²' : ''}
                </button>
              ))}
            </div>
          </div>
        )}
        {asigs.map((x, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <select value={x.ot} onChange={e => setAsig(i, 'ot', e.target.value)} style={{ ...inp, width: 170 }}><option value="">(elige OT)</option>{otsDisponibles.map(o => <option key={o}>{o}</option>)}</select>
            <input value={x.pct} onChange={e => setAsig(i, 'pct', e.target.value)} style={{ ...inp, width: 70, textAlign: 'right' }} />%
            <span style={{ fontSize: 12, color: C.gris }}>= {clp(ocNeto(f) * (pctNum(x.pct) || 0) / 100)}</span>
            <button onClick={() => delAsig(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={addAsig} style={{ background: 'none', border: '1px dashed #DFE4EA', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.gris }}>+ Asignar a OT</button>
          {asigs.length > 1 && <button onClick={repartir} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.carbon }}>Repartir por m²</button>}
          {asigs.length > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: Math.abs(sumaPct - 100) < 0.05 ? C.verde : C.rojo }}>Suma: {sumaPct}%{asigs.length > 1 && !conM2 ? ' · alguna OT sin m²: se repartió en partes iguales' : ''}</span>}
        </div>

          </>
        )}
        <input style={{ ...inp, width: '100%', marginTop: 10 }} placeholder="Observaciones" value={f.obs} onChange={e => set('obs', e.target.value)} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, marginTop: 10, fontSize: 13 }}>
          <span>Neto: <b>{clp(ocNeto(f))}</b></span><span>IVA: <b>{clp(ocIva(f))}</b></span><span>Total: <b style={{ color: C.naranja }}>{clp(ocTotal(f))}</b></span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={guardar} style={{ background: C.verde, color: '#fff', border: 'none', padding: '9px 18px', cursor: 'pointer', fontSize: 13 }}>Guardar OC</button>
          {aviso && <span style={{ color: C.rojo, fontSize: 13, alignSelf: 'center', fontWeight: 600 }}>{aviso}</span>}
          <button onClick={onCancelar} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// Gastos mensuales (EPP y similares): suma por categoría del mes elegido y evolución mes a mes.
function GastosMensuales({ ocs }) {
  const mens = ocs.filter(o => esGastoMensual(o) && o.estadoPago !== 'Anulada' && /^\d{4}-\d{2}/.test(o.fecha || ''))
  const meses = [...new Set(mens.map(o => o.fecha.slice(0, 7)))].sort().reverse()
  const [mes, setMes] = useState('')
  if (!mens.length) return null
  const sel = mes && meses.includes(mes) ? mes : meses[0]
  const nombreMes = m => ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][parseInt(m.slice(5, 7), 10) - 1] + ' ' + m.slice(0, 4)
  const delMes = mens.filter(o => o.fecha.slice(0, 7) === sel)
  const porCat = {}
  delMes.forEach(o => { const k = o.categoria || 'Sin categoría'; const c = porCat[k] || (porCat[k] = { n: 0, neto: 0 }); c.n++; c.neto += ocNeto(o) })
  const totMes = delMes.reduce((a, o) => a + ocNeto(o), 0)
  const th = { textAlign: 'right', padding: '4px 8px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase' }
  return (
    <div style={{ background: '#fff', border: '1px solid #DFE4EA', padding: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 13, textTransform: 'uppercase' }}>Gastos mensuales (sin OT)</span>
        <select value={sel} onChange={e => setMes(e.target.value)} style={{ ...inp, textTransform: 'capitalize' }}>{meses.map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}</select>
        <span style={{ fontSize: 12.5, color: C.gris }}>{delMes.length} OC · neto <b style={{ color: C.carbon }}>{clp(totMes)}</b></span>
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12.5, minWidth: 260 }}>
          <thead><tr><th style={{ ...th, textAlign: 'left' }}>Categoría</th><th style={th}>OC</th><th style={th}>Neto</th></tr></thead>
          <tbody>{Object.entries(porCat).map(([k, c]) => <tr key={k} style={{ borderTop: '1px solid #DFE4EA' }}><td style={{ padding: '5px 8px' }}>{k}</td><td style={{ padding: '5px 8px', textAlign: 'right' }}>{c.n}</td><td style={{ padding: '5px 8px', textAlign: 'right' }}>{clp(c.neto)}</td></tr>)}</tbody>
        </table>
        <table style={{ borderCollapse: 'collapse', fontSize: 12.5, minWidth: 220 }}>
          <thead><tr><th style={{ ...th, textAlign: 'left' }}>Mes a mes</th><th style={th}>Neto</th></tr></thead>
          <tbody>{meses.slice(0, 12).map(m => <tr key={m} style={{ borderTop: '1px solid #DFE4EA' }}><td style={{ padding: '5px 8px', textTransform: 'capitalize' }}>{nombreMes(m)}</td><td style={{ padding: '5px 8px', textAlign: 'right' }}>{clp(mens.filter(o => o.fecha.slice(0, 7) === m).reduce((a, o) => a + ocNeto(o), 0))}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}

export default function OrdenesCompraModule({ pp = { ocs: [] }, setPp = () => {}, ots = [], proveedores = null, libroCompras = [] }) {
  const ocs = pp.ocs || []
  const provLista = proveedores || listaProveedores(pp, libroCompras)
  const otsDisponibles = [...new Set((ots || []).map(o => o.numero).filter(Boolean))]
  const otsInfo = (ots || []).filter(o => o.numero).map(o => ({ numero: o.numero, m2: parseFloat(o.m2) || 0, cliente: o.cliente || '', estado: o.estado }))
  // pp.ocs tambien lo escriben ProveedoresPagosModule.jsx y
  // generarOCPintura() en CotizacionesModule.jsx — antes de agregar o
  // eliminar una OC acá se trae lo más fresco de la nube, para no partir
  // de una copia vieja si alguien más tocó las OC mientras tanto.
  const guardarOcFresco = mutar => guardarOcFrescoEn(pp, setPp, mutar)
  const eliminar = id => guardarOcFresco(base => base.filter(o => o.id !== id))
  // upd() se llama por cada tecla/click al editar campos de una OC (numero,
  // proveedor, items, asignaciones...). Antes escribia directo sobre la
  // copia local (ocs.map) y subia sin traer lo mas fresco — si otro modulo
  // (ProveedoresPagosModule.jsx, o generarOCPintura() de Cotizaciones)
  // guardaba una OC nueva casi al mismo tiempo, esta escritura la pisaba
  // sin aviso. Ahora la UI se actualiza al instante (para que se sienta
  // igual de rapido al escribir) pero el guardado real hacia la nube se
  // agrupa por fila y se posterga un momento: recien cuando la persona deja
  // de tocar esa OC, se trae lo mas fresco (guardarOcFresco, mismo patron
  // que eliminar) y se aplican TODOS los cambios acumulados de esa fila de
  // una vez. Asi no se dispara un pullState() por cada tecla (eso fue lo
  // que saturaba Supabase antes), pero el guardado final siempre
  // parte de una base fresca.
  const pendientesOC = useRef({})
  const timersOC = useRef({})
  const upd = (id, cambios) => {
    const nuevo = { ...pp, ocs: ocs.map(o => o.id === id ? { ...o, ...cambios } : o) }
    try { localStorage.setItem('serein_pp', JSON.stringify(nuevo)) } catch (e) {}
    setPp(nuevo)
    pendientesOC.current[id] = { ...(pendientesOC.current[id] || {}), ...cambios }
    clearTimeout(timersOC.current[id])
    timersOC.current[id] = setTimeout(() => {
      const acumulados = pendientesOC.current[id]
      delete pendientesOC.current[id]
      if (acumulados) guardarOcFresco(base => base.map(o => o.id === id ? { ...o, ...acumulados } : o))
    }, 700)
  }
  const [creando, setCreando] = useState(false)
  const [guardadaMsg, setGuardadaMsg] = useState('')
  const avisarGuardada = oc => { setGuardadaMsg('OC N° ' + oc.numero + ' guardada (' + oc.proveedor + ').'); setTimeout(() => setGuardadaMsg(''), 6000) }
  const nueva = () => nuevaOC(ocs)
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
      {creando && <FormOC inicial={nueva()} otsDisponibles={otsDisponibles} otsInfo={otsInfo} proveedores={provLista} onGuardar={oc => { guardarOcFresco(base => [oc, ...base]); setCreando(false); avisarGuardada(oc) }} onCancelar={() => setCreando(false)} />}
      <div style={{ fontSize: 12, color: '#D9600A', background: '#FDECDD', padding: '8px 12px', marginBottom: 12 }}>
        <b>Órdenes de compra a proveedores</b> (emitidas por Serein). Cada OC puede asociarse a una o varias OT con reparto porcentual; su costo neto se carga a esas OT. Las OC pendientes alimentan cuentas por pagar y el flujo de caja del Consolidado.
      </div>
      <GastosMensuales ocs={ocs} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={() => setCreando(true)} style={{ background: C.naranja, color: '#fff', border: 'none', padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={15} /> Agregar OC</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #DFE4EA', padding: '2px 6px' }}>
          <Search size={13} color={C.gris} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar N°/proveedor/RUT/categoría…" style={{ border: 'none', outline: 'none', fontSize: 12.5, width: 190 }} />
        </div>
        <select style={inp} value={fEst} onChange={e => setFEst(e.target.value)}><option value="">Todos los estados</option>{ESTADOS_PAGO.map(x => <option key={x}>{x}</option>)}</select>
        <span style={{ fontSize: 12.5, color: C.gris }}>{mostradas.length} OC · Total {clp(totalTodas)} · <b style={{ color: C.rojo }}>Por pagar {clp(totalPend)}</b></span>
        {guardadaMsg && <span style={{ fontSize: 12.5, color: C.verde, fontWeight: 700 }}>✓ {guardadaMsg}</span>}
      </div>
      <div style={{ background: '#fff', border: '1px solid #DFE4EA', overflowX: 'auto', padding: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ borderBottom: '1px solid #E4E8ED' }}>
            {['Nº OC', 'Proveedor', 'RUT', 'Categoría', 'Fecha', 'Neto', 'IVA', 'Total', 'Plazo', 'Vencimiento', 'Estado de pago', ''].map((h, hi) => <th key={hi} style={{ textAlign: ['Neto', 'IVA', 'Total'].includes(h) ? 'right' : 'left', padding: '5px 6px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase', whiteSpace: 'nowrap', ...(h === '' ? { position: 'sticky', right: 0, background: '#fff', zIndex: 3 } : {}) }}>{h || 'Acciones'}</th>)}
          </tr></thead>
          <tbody>
            {pg.items.map(o => <FilaOC key={o.id} oc={o} otsDisponibles={otsDisponibles} upd={upd} onDelete={eliminar} proveedores={provLista} libroCompras={libroCompras} ocs={ocs} />)}
            {mostradas.length === 0 && <tr><td colSpan={12} style={{ padding: 16, textAlign: 'center', color: '#9AA3AD' }}>Sin órdenes de compra.</td></tr>}
          </tbody>
        </table>
        <Paginador page={pg.page} paginas={pg.paginas} total={pg.total} setPage={setPage} />
      </div>
    </div>
  )
}
