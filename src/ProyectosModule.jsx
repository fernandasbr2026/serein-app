import React, { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, Target, Receipt, Hammer, ShoppingCart, Pencil, Plus, Trash2, X, AlertTriangle, LayoutGrid, Table2 } from 'lucide-react'
import { PROYECTOS, CC_DEFS } from './proyectos-data.js'
import { calcularPerdidaFactoring, perdidaFactoringFactura } from './ParametrosModule.jsx'
import FacturasModule from './FacturasModule.jsx'
import ProyParametros from './ProyParametros.jsx'
import ProyCotizador from './ProyCotizador.jsx'
import ProyComprasLibro from './ProyComprasLibro.jsx'
import { supabase } from './supabase.js'
import * as XLSX from 'xlsx'
// Cotizador de Proyectos visible solo para estos correos (el resto ve la gestion normal de OT)
const COTIZADOR_PROY_EMAILS = ['administracion@sereinspa.com', 'mario@sereinspa.com']
// Engancha una factura de Proyectos a su OT comparando los números (≥3 dígitos) de OT/OC
const _toks = x => (String(x || '').match(/\d{3,}/g) || [])
const otMatch = (p, f) => { const pt = new Set([..._toks(p.ot), ..._toks(p.oc)]); return [..._toks(f.ot), ..._toks(f.oc)].some(t => pt.has(t)) }
const facturasDeOT = (facturasProy, p) => (facturasProy || []).filter(f => otMatch(p, f))

const C = { azul: '#061A40', teal: '#0B7285', ambar: '#FF6B00', rojo: '#D64545', verde: '#12805C', carbon: '#0F1A2E', gris: '#8A929E' }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const inp = { padding: '7px 9px', border: '1px solid #CBD2D6', fontSize: 13, boxSizing: 'border-box' }
const btnMini = { background: 'none', border: 'none', cursor: 'pointer', color: C.rojo, padding: 4 }
const nombreDefault = id => (CC_DEFS.find(c => c.id === id)?.nombre) || id
const nombreCC = (p, id) => (p.ccNombres && p.ccNombres[id]) || nombreDefault(id)

// ---- Cálculos por proyecto ----
const facEdpDe = (p, numero) => (p.facEdp && p.facEdp[numero]) || {}
const facEstado = (p, f) => (facEdpDe(p, f.numero).estado) || f.estado || ''
const facturadoDe = (p, fp) => { const fs = facturasDeOT(fp, p); return fs.length ? fs.reduce((a, f) => a + (f.neto || 0), 0) : (p.edps || []).reduce((a, e) => a + (e.venta || 0), 0) }
const cobradoDe = (p, fp) => { const fs = facturasDeOT(fp, p); return fs.length ? fs.filter(f => { const e = String(facEstado(p, f)).toLowerCase(); return e.startsWith('pag') || e.includes('factor') }).reduce((a, f) => a + (f.neto || 0), 0) : (p.edps || []).filter(e => e.estado === 'Pagado' || e.estado === 'Factoring').reduce((a, e) => a + (e.venta || 0), 0) }
const comprasDe = p => (p.compras || []).reduce((a, c) => a + c.monto, 0)
const ventaDe = (p, fp) => (p.venta_cotizada != null && p.venta_cotizada > 0) ? p.venta_cotizada : facturadoDe(p, fp)
const porFacturarDe = (p, fp) => Math.max(0, ventaDe(p, fp) - facturadoDe(p, fp))
const perdidaFacturaOT = (p, f, params) => {
  const ov = facEdpDe(p, f.numero)
  const est = ov.estado || f.estado || ''
  if (!/factor/i.test(est)) return 0
  const facs = (params && params.factoring) || []
  const fc = facs.find(x => x.id === ov.factoringId) || facs.find(x => (f.banco || '').toLowerCase().includes((x.nombre || '').toLowerCase().split(' ')[0])) || facs[0]
  if (!fc) return 0
  const base = f.monto || Math.round((f.neto || 0) * 1.19)
  return calcularPerdidaFactoring(base, ov.plazo || f.plazo || f.dias || 30, ov.diasMora || f.diasMora || 0, fc).total
}
const perdidaFactDe = (p, fp, params) => facturasDeOT(fp, p).reduce((a, f) => a + perdidaFacturaOT(p, f, params), 0)
const CONDICIONES = [{ label: 'Contado', dias: 0 }, { label: '30 días', dias: 30 }, { label: '45 días', dias: 45 }, { label: '60 días', dias: 60 }, { label: '90 días', dias: 90 }]
const consumoCC = (p, ccId) => (p.compras || []).filter(c => c.cc === ccId).reduce((a, c) => a + c.monto, 0)
const topeCC = (p, ccId) => (p.cc && p.cc[ccId]) || 0
const costoEstDe = p => Object.values(p.cc || {}).reduce((a, v) => a + (+v || 0), 0)   // costo estimado = suma de topes (todos los CC)
const ccCodigos = p => [...new Set([...CC_DEFS.map(c => c.id), ...Object.keys(p.cc || {}), ...(p.compras || []).map(c => c.cc)])].filter(Boolean)
const ccActivos = p => ccCodigos(p).filter(id => topeCC(p, id) > 0 || consumoCC(p, id) > 0).map(id => ({ id, nombre: nombreCC(p, id) }))
const pct = (parte, total) => total > 0 ? (parte / total) * 100 : 0
const colorUT = p => p >= 30 ? C.verde : p >= 15 ? C.ambar : C.rojo

function Barra({ pct, color, alto = 8 }) {
  return (
    <div style={{ height: alto, background: '#EEE9DF', width: '100%' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, transition: 'width .3s' }} />
    </div>
  )
}

// ---------- Form venta (EDP) con método de pago y factoring ----------
function FormEdp({ params, onAdd, onCancel }) {
  const facs = params.factoring || []
  const [f, setF] = useState({ nombre: '', fecha: '', venta: '', metodo: 'Contado', condicion: 'Contado', factoringId: facs[0]?.id || '', diasMora: '', obs: '' })
  const dias = (CONDICIONES.find(c => c.label === f.condicion)?.dias) ?? 0
  const facSel = facs.find(x => x.id === f.factoringId)
  const baseTotal = Math.round(num(f.venta) * 1.19)
  const perd = f.metodo === 'Factoring' ? calcularPerdidaFactoring(baseTotal, dias, num(f.diasMora), facSel) : { interes: 0, mora: 0, costoOp: 0, total: 0 }
  const estado = f.metodo === 'Factoring' ? 'Factoring' : 'Pendiente'

  function guardar() {
    if (!f.nombre || num(f.venta) <= 0) return
    onAdd({ edp: f.nombre, fecha: f.fecha || '—', venta: num(f.venta), estado, metodo: f.metodo, condicion: f.condicion, dias, factoringId: f.metodo === 'Factoring' ? f.factoringId : '', diasMora: num(f.diasMora), perdidaFact: perd.total, obs: f.obs })
  }

  return (
    <div style={{ background: '#F7F4EE', padding: 12, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...inp, width: 110 }} placeholder="EDP / N° factura" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} />
        <input style={{ ...inp, width: 130 }} type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} />
        <input style={{ ...inp, width: 130 }} placeholder="Venta neta CLP" value={f.venta} onChange={e => setF({ ...f, venta: e.target.value })} />
        <label style={{ fontSize: 12, color: C.gris }}>Método de pago
          <select style={{ ...inp, width: '100%' }} value={f.metodo} onChange={e => setF({ ...f, metodo: e.target.value })}>
            <option>Contado</option><option>Crédito</option><option>Factoring</option>
          </select>
        </label>
        {(f.metodo === 'Crédito' || f.metodo === 'Factoring') && (
          <label style={{ fontSize: 12, color: C.gris }}>Condición
            <select style={{ ...inp, width: '100%' }} value={f.condicion} onChange={e => setF({ ...f, condicion: e.target.value })}>
              {CONDICIONES.map(c => <option key={c.label}>{c.label}</option>)}
            </select>
          </label>
        )}
        {f.metodo === 'Factoring' && (
          <>
            <label style={{ fontSize: 12, color: C.gris }}>Factoring
              <select style={{ ...inp, width: '100%' }} value={f.factoringId} onChange={e => setF({ ...f, factoringId: e.target.value })}>
                {facs.length === 0 && <option value="">(define en Parámetros)</option>}
                {facs.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
            </label>
            <input style={{ ...inp, width: 110 }} placeholder="Días de mora" value={f.diasMora} onChange={e => setF({ ...f, diasMora: e.target.value })} />
          </>
        )}
      </div>
      <input style={{ ...inp, width: '100%', marginTop: 8 }} placeholder="Observación / comentario (opcional)" value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} />
      {f.metodo === 'Factoring' && num(f.venta) > 0 && (
        <div style={{ fontSize: 12, color: '#8C4519', background: '#F9E9DE', padding: '8px 10px', marginTop: 8 }}>
          Pérdida por factoring estimada: <b>{clp(perd.total)}</b> — interés {clp(perd.interes)} ({dias} días) + costo op. {clp(perd.costoOp)}{perd.mora > 0 ? ` + mora ${clp(perd.mora)}` : ''}. (Base total con IVA: {clp(baseTotal)})
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={guardar} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar factura</button>
        <button onClick={onCancel} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
      </div>
    </div>
  )
}

// ---------- Form compra (con CC, folio, rut) ----------
function FormCompra({ p, onAdd, onCancel }) {
  const [f, setF] = useState({ proveedor: '', detalle: '', fecha: '', monto: '', cc: CC_DEFS[0].id, folio: '', rut: '' })
  return (
    <div style={{ background: '#F7F4EE', padding: 12, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...inp, width: 130 }} placeholder="Proveedor" value={f.proveedor} onChange={e => setF({ ...f, proveedor: e.target.value })} />
        <input style={{ ...inp, width: 100 }} placeholder="N° doc / folio" value={f.folio} onChange={e => setF({ ...f, folio: e.target.value })} />
        <input style={{ ...inp, width: 110 }} placeholder="RUT proveedor" value={f.rut} onChange={e => setF({ ...f, rut: e.target.value })} />
        <select style={{ ...inp }} value={f.cc} onChange={e => setF({ ...f, cc: e.target.value })}>
          {ccCodigos(p).map(id => <option key={id} value={id}>{id} · {nombreCC(p, id)}</option>)}
        </select>
        <input style={{ ...inp, width: 130 }} placeholder="Detalle (opcional)" value={f.detalle} onChange={e => setF({ ...f, detalle: e.target.value })} />
        <input style={{ ...inp, width: 120 }} type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} />
        <input style={{ ...inp, width: 120 }} placeholder="Monto neto CLP" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={() => f.proveedor && num(f.monto) > 0 && onAdd({ proveedor: f.proveedor, detalle: f.detalle, fecha: f.fecha || '—', monto: num(f.monto), cc: f.cc, folio: f.folio, rut: f.rut })}
          style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar compra</button>
        <button onClick={onCancel} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
      </div>
    </div>
  )
}

// ---------- Bloque de centros de costo (nombre + tope editables) ----------
function BloqueCC({ p, onUpdate }) {
  const [editando, setEditando] = useState(false)
  const [filas, setFilas] = useState([])
  const activos = ccActivos(p)

  function abrirEdicion(e) {
    e.stopPropagation()
    const ids = ccCodigos(p)
    setFilas(ids.map(id => ({ codigo: id, nombre: nombreCC(p, id), tope: (p.cc && p.cc[id]) || '', iva: (p.ccIva && p.ccIva[id]) || 'con', fijo: true })))
    setEditando(true)
  }
  const setFila = (i, k, v) => setFilas(prev => prev.map((f, j) => j === i ? { ...f, [k]: v } : f))
  const addFila = () => setFilas(prev => [...prev, { codigo: '', nombre: '', tope: '', iva: 'con', fijo: false }])
  const delFila = i => setFilas(prev => prev.filter((_, j) => j !== i))
  function guardar() {
    const cc = {}, ccNombres = {}, ccIva = {}
    filas.forEach(f => {
      const cod = (f.codigo || '').trim().toUpperCase(); if (!cod) return
      const v = num(f.tope); if (v > 0) cc[cod] = v
      const nm = (f.nombre || '').trim(); if (nm) ccNombres[cod] = nm
      if ((f.iva || 'con') === 'exento') ccIva[cod] = 'exento'
    })
    onUpdate(p.id, { cc, ccNombres, ccIva }); setEditando(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: C.gris, display: 'flex', alignItems: 'center', gap: 5 }}><Target size={13} /> Centros de costo (presupuesto vs consumo)</span>
        {!editando && <button onClick={abrirEdicion} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.teal, display: 'flex', alignItems: 'center', gap: 3, fontSize: 12 }}><Pencil size={12} /> Editar CC</button>}
      </div>
      {editando ? (
        <div onClick={e => e.stopPropagation()} style={{ background: '#FAF7F3', padding: 10 }}>
          <div style={{ fontSize: 11, color: C.gris, marginBottom: 6 }}>Cambia el nombre, el neto y el IVA de cada centro de costo. Puedes agregar los que necesites (los nuevos llevan codigo editable).</div>
          {filas.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {f.fijo
                ? <span style={{ fontSize: 12, fontWeight: 600, width: 34 }}>{f.codigo}</span>
                : <input value={f.codigo} onChange={e => setFila(i, 'codigo', e.target.value)} placeholder="Cod." style={{ ...inp, width: 56 }} />}
              <input value={f.nombre} onChange={e => setFila(i, 'nombre', e.target.value)} placeholder="Nombre del centro de costo" style={{ ...inp, flex: '1 1 150px', minWidth: 120 }} />
              <input value={f.tope} onChange={e => setFila(i, 'tope', e.target.value)} placeholder="Neto CLP" style={{ ...inp, width: 110, textAlign: 'right' }} />
              <select value={f.iva} onChange={e => setFila(i, 'iva', e.target.value)} style={{ ...inp, width: 92 }}><option value="con">Con IVA</option><option value="exento">Exento</option></select>
              <span style={{ fontSize: 11, color: C.gris, width: 110, textAlign: 'right' }}>{num(f.tope) > 0 ? 'Total ' + clp(Math.round(num(f.tope) * ((f.iva || 'con') === 'exento' ? 1 : 1.19))) : ''}</span>
              {!f.fijo && <button onClick={() => delFila(i)} title="Quitar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>}
            </div>
          ))}
          <button onClick={addFila} style={{ background: 'none', border: '1px dashed #CBD2D6', padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: C.gris, marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Agregar centro de costo</button>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button onClick={guardar} style={{ background: C.azul, color: '#fff', border: 'none', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>Guardar CC</button>
            <button onClick={() => setEditando(false)} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
          </div>
        </div>
      ) : activos.length === 0 ? (
        <div style={{ fontSize: 12, color: C.ambar, background: '#F9E9DE', padding: '6px 10px' }}>Sin presupuesto por CC — usa "Editar CC".</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {activos.map(cc => {
            const t = topeCC(p, cc.id), cons = consumoCC(p, cc.id)
            const pc = t > 0 ? (cons / t) * 100 : (cons > 0 ? 100 : 0)
            const col = pc >= 100 ? C.rojo : pc >= 80 ? C.ambar : C.verde
            return (
              <div key={cc.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                  <span><b>{cc.id}</b> {nombreCC(p, cc.id)}</span>
                  <span style={{ color: C.gris }}>{clp(cons)} / {clp(t)} · saldo <b style={{ color: col }}>{clp(t - cons)}</b></span>
                </div>
                <Barra pct={pc} color={col} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
function StatHeader({ label, valor, color }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 16, color: color || C.carbon, whiteSpace: 'nowrap' }}>{valor}</div>
    </div>
  )
}

// ---------- Editor de la ficha del proyecto (datos, no fórmulas) ----------
function FichaEditor({ p, onUpdate, onClose }) {
  const [f, setF] = useState({ nombre: p.nombre || '', cliente: p.cliente || '', ot: p.ot || '', oc: p.oc || '', m2: p.m2 || '', periodo: p.periodo || '', venta: (p.venta_cotizada != null ? p.venta_cotizada : '') })
  const lab = { fontSize: 11, color: C.gris, display: 'flex', flexDirection: 'column', gap: 3 }
  function guardar() {
    onUpdate(p.id, { nombre: f.nombre.trim(), cliente: f.cliente.trim(), ot: f.ot.trim(), oc: f.oc.trim(), m2: num(f.m2) || null, periodo: f.periodo.trim(), venta_cotizada: num(f.venta) })
    onClose()
  }
  return (
    <div onClick={e => e.stopPropagation()} style={{ background: '#FAF7F3', border: '1px solid #E2DED4', padding: 12, margin: '0 18px 12px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.gris, textTransform: 'uppercase', marginBottom: 8 }}>Editar ficha del proyecto</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <label style={{ ...lab, gridColumn: '1 / -1' }}>Nombre del proyecto<input style={inp} value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></label>
        <label style={lab}>OT (N° cotización)<input style={inp} value={f.ot} onChange={e => setF({ ...f, ot: e.target.value })} /></label>
        <label style={lab}>OC / NV<input style={inp} value={f.oc} onChange={e => setF({ ...f, oc: e.target.value })} /></label>
        <label style={lab}>Cliente<input style={inp} value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} /></label>
        <label style={lab}>m²<input style={inp} value={f.m2} onChange={e => setF({ ...f, m2: e.target.value })} /></label>
        <label style={lab}>Período<input style={inp} value={f.periodo} onChange={e => setF({ ...f, periodo: e.target.value })} /></label>
        <label style={lab}>Venta cotizada CLP<input style={inp} value={f.venta} onChange={e => setF({ ...f, venta: e.target.value })} /></label>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button onClick={guardar} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Guardar ficha</button>
        <button onClick={onClose} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
      </div>
    </div>
  )
}

function AbonosOT({ p, facturasOT, onUpdate }) {
  const [add, setAdd] = useState(false)
  const [f, setF] = useState({ monto: '', fecha: '', banco: '' })
  const abonos = p.abonos || []
  // Total real de cada factura: usa el monto con IVA que ya viene calculado (exento => monto = neto)
  const totalDe = fac => Math.round(fac.monto || (fac.neto || 0) * 1.19)
  const inpA = { border: '1px solid #E2DED4', borderRadius: 4, padding: '6px 8px', fontSize: 12 }
  // Facturas ordenadas de la mas antigua a la mas nueva (por fecha de emision)
  const facturasOrd = [...facturasOT].sort((a, b) => String(a.fecha_emision || '').localeCompare(String(b.fecha_emision || '')) || String(a.numero).localeCompare(String(b.numero)))
  // Reparto automatico: los abonos antiguos asignados a una factura (con .numero) se respetan;
  // los pagos nuevos (sin factura) forman una bolsa que se reparte de la mas antigua a la mas nueva.
  const alloc = {}; facturasOrd.forEach(fac => { alloc[fac.numero] = 0 })
  let bolsa = 0
  abonos.forEach(a => {
    const key = a.numero != null && a.numero !== '' ? String(a.numero) : null
    if (key && Object.prototype.hasOwnProperty.call(alloc, key)) alloc[key] += (+a.monto || 0)
    else bolsa += (+a.monto || 0)
  })
  facturasOrd.forEach(fac => { const t = totalDe(fac); if (alloc[fac.numero] > t) { bolsa += alloc[fac.numero] - t; alloc[fac.numero] = t } })
  facturasOrd.forEach(fac => { const t = totalDe(fac); const rem = t - alloc[fac.numero]; if (rem > 0 && bolsa > 0) { const take = Math.min(rem, bolsa); alloc[fac.numero] += take; bolsa -= take } })
  const saldoFavor = bolsa
  const totFacturado = facturasOrd.reduce((s, fac) => s + totalDe(fac), 0)
  const totRecibido = abonos.reduce((s, a) => s + (+a.monto || 0), 0)
  const totPendiente = Math.max(0, totFacturado - (totRecibido - saldoFavor))
  const guardar = () => {
    if (!(num(f.monto) > 0)) return
    onUpdate(p.id, { abonos: [...abonos, { id: 'ab' + Date.now(), monto: num(f.monto), fecha: f.fecha || '—', banco: f.banco || '' }] })
    setF({ monto: '', fecha: '', banco: '' }); setAdd(false)
  }
  const eliminar = id => onUpdate(p.id, { abonos: abonos.filter(a => a.id !== id) })
  return (
    <div style={{ marginBottom: 16, border: '1px solid #E2DED4', borderRadius: 8, padding: 12, background: '#FCFBF9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: C.teal }}>Pagos recibidos (abonos)</span>
        <button onClick={() => setAdd(v => !v)} style={{ background: C.azul, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>+ Registrar pago</button>
      </div>
      {facturasOT.length === 0 ? (<div style={{ fontSize: 12, color: C.gris }}>Esta OT aun no tiene facturas para abonar.</div>) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['Factura', 'Total c/IVA', 'Abonado', 'Saldo', 'Estado'].map((h, i) => <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
            <tbody>
              {facturasOrd.map((fac, i) => {
                const tot = totalDe(fac); const ab = alloc[fac.numero] || 0; const saldo = tot - ab; const pagada = saldo <= 0
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #EEE9DF' }}>
                    <td style={{ padding: '5px 8px', fontWeight: 600 }}>{fac.numero}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right' }}>{clp(tot)}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', color: C.verde }}>{clp(ab)}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600, color: pagada ? C.verde : '#B23A0E' }}>{clp(Math.max(0, saldo))}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right' }}><span style={{ background: pagada ? '#E7F2EA' : '#F6E0DA', color: pagada ? C.verde : '#B23A0E', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{pagada ? 'PAGADA' : 'Falta ' + clp(saldo)}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 8, fontSize: 12, color: C.gris }}>
            <span>Recibido: <b style={{ color: C.verde }}>{clp(totRecibido)}</b></span>
            <span>Pendiente por cobrar: <b style={{ color: totPendiente > 0 ? '#B23A0E' : C.verde }}>{clp(totPendiente)}</b></span>
            {saldoFavor > 0 && <span>Saldo a favor del cliente: <b style={{ color: C.teal }}>{clp(saldoFavor)}</b></span>}
          </div>
        </div>
      )}
      {add && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginTop: 10, paddingTop: 10, borderTop: '1px dashed #E2DED4' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><label style={{ fontSize: 10, color: C.gris }}>Monto pagado</label><input value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} placeholder="Total transferido" style={{ ...inpA, width: 140, textAlign: 'right' }} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><label style={{ fontSize: 10, color: C.gris }}>Fecha</label><input type="date" value={f.fecha && f.fecha !== '—' ? f.fecha : ''} onChange={e => setF({ ...f, fecha: e.target.value })} style={{ ...inpA, width: 140 }} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><label style={{ fontSize: 10, color: C.gris }}>Banco</label><input list="serein-bancos" value={f.banco} onChange={e => setF({ ...f, banco: e.target.value })} placeholder="Banco..." style={{ ...inpA, width: 130 }} /></div>
          <button onClick={guardar} style={{ background: C.verde, color: '#fff', border: 'none', borderRadius: 4, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>Agregar</button>
          <button onClick={() => setAdd(false)} style={{ background: 'none', border: '1px solid #CBD2D6', borderRadius: 4, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <div style={{ flexBasis: '100%', fontSize: 11, color: C.gris }}>El pago se reparte solo: cubre primero la factura mas antigua y el sobrante pasa a la siguiente.</div>
        </div>
      )}
      {abonos.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, color: C.gris, textTransform: 'uppercase', marginBottom: 4 }}>Pagos registrados</div>
          {abonos.map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '3px 0', borderBottom: '1px solid #F0ECE3' }}>
              <span style={{ color: C.gris }}>{a.numero ? 'Factura ' + a.numero + ' · ' : 'Pago · '}{a.fecha}{a.banco ? ' · ' + a.banco : ''}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><b>{clp(a.monto)}</b><button onClick={() => eliminar(a.id)} style={{ background: 'none', border: 'none', color: '#B23A0E', cursor: 'pointer', fontSize: 13 }}>x</button></span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function descargarProyectoXlsx(p, facturasProy, params, ppmPct) {
  const fs = facturasDeOT(facturasProy, p)
  const totalDe = f => Math.round(f.monto || (f.neto || 0) * 1.19)
  const estLoc = f => ((p.facEdp && p.facEdp[f.numero] && p.facEdp[f.numero].estado) || f.estado || '')
  const venta = ventaDe(p, facturasProy), fact = facturadoDe(p, facturasProy), cobr = cobradoDe(p, facturasProy)
  const costoReal = comprasDe(p), costoEst = costoEstDe(p), perd = perdidaFactDe(p, facturasProy, params)
  const ppm = Math.round(fact * ((ppmPct || 0) / 100)), utReal = venta - costoReal - perd - ppm
  const resumen = [
    ['INFORME OT ' + (p.ot || ''), ''], ['Cliente', p.cliente || ''], ['Nombre', p.nombre || ''],
    ['Estado', p.cerrado ? 'CERRADO' : 'Activo'], ['Fecha de cierre', p.fechaCierre || ''],
    ['Venta cotizada', venta], ['Facturado (neto)', fact], ['Cobrado (neto)', cobr], ['Por facturar', Math.max(0, venta - fact)],
    ['Costo estimado (topes CC)', costoEst], ['Costo real (compras)', costoReal],
    ['Perdida factoring', perd], ['PPM (' + (ppmPct || 0) + '%)', ppm], ['Utilidad real', utReal],
  ]
  const facturas = fs.map(f => { const ov = (p.facEdp || {})[f.numero] || {}; return { Factura: f.numero, Fecha: f.fecha_emision || '', EDP: ov.edp || '', Neto: f.neto || 0, 'Total c/IVA': totalDe(f), PPM: Math.round((f.neto || 0) * ((ppmPct || 0) / 100)), Estado: estLoc(f), 'Fecha pago': ov.fechaPago || '', Banco: ov.banco || '' } })
  const abonos = (p.abonos || []).map(a => ({ Fecha: a.fecha || '', Banco: a.banco || '', Factura: a.numero || '(reparto)', Monto: a.monto || 0 }))
  const compras = (p.compras || []).map(c => ({ CC: c.cc || '', Proveedor: c.proveedor || '', 'N doc': c.folio || '', Detalle: c.detalle || '', Fecha: c.fecha || '', 'Monto neto': c.monto || 0 }))
  const cc = ccActivos(p).map(x => ({ Codigo: x.id, Nombre: x.nombre, 'Tope neto': topeCC(p, x.id), Consumo: consumoCC(p, x.id), Saldo: topeCC(p, x.id) - consumoCC(p, x.id) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(facturas.length ? facturas : [{ Factura: 'Sin facturas' }]), 'Facturas')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(abonos.length ? abonos : [{ Fecha: 'Sin abonos' }]), 'Abonos')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(compras.length ? compras : [{ CC: 'Sin compras' }]), 'Compras')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cc.length ? cc : [{ Codigo: 'Sin CC' }]), 'Centros de costo')
  XLSX.writeFile(wb, 'Proyecto_' + (p.ot || 'OT') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx')
}

function TarjetaProyecto({ p, onUpdate, onDelete, onAddCompra, params, facturasProy = [], ppmPct = 2, enModal = false }) {
  const facturasOT = facturasDeOT(facturasProy, p)
  const factNetoOT = facturasOT.reduce((a, f) => a + (f.neto || 0), 0)
  const remIvaVenta = Math.round(facturasOT.reduce((a, f) => a + ((f.monto || Math.round((f.neto || 0) * 1.19)) - (f.neto || 0)), 0))
  const remIvaCompra = Math.round((p.compras || []).reduce((a, c) => a + (+c.monto || 0), 0) * 0.19)
  const remIva = remIvaVenta - remIvaCompra
  const [abierto, setAbierto] = useState(false)
  const [addEdp, setAddEdp] = useState(false)
  const [addCompra, setAddCompra] = useState(false)
  const [editFicha, setEditFicha] = useState(false)
  const updEdp = (i, cambios) => onUpdate(p.id, { edps: p.edps.map((x, j) => j === i ? { ...x, ...cambios } : x) })
  const updCompra = (i, cambios) => onUpdate(p.id, { compras: p.compras.map((x, j) => j === i ? { ...x, ...cambios } : x) })
  const updFac = (numero, cambios) => onUpdate(p.id, { facEdp: { ...(p.facEdp || {}), [numero]: { ...((p.facEdp || {})[numero] || {}), ...cambios } } })

  const facturado = facturadoDe(p, facturasProy), cobrado = cobradoDe(p, facturasProy), pendiente = facturado - cobrado
  const venta = ventaDe(p, facturasProy), porFacturar = porFacturarDe(p, facturasProy)
  const costoEst = costoEstDe(p), costoReal = comprasDe(p), perdidaFact = perdidaFactDe(p, facturasProy, params)
  const utEst = venta - costoEst, pctUtEst = pct(utEst, venta)
  const ppm = Math.round(facturado * (ppmPct / 100))
  const utReal = venta - costoReal - perdidaFact - ppm, pctUtReal = pct(utReal, venta)
  const pctFact = pct(facturado, venta)
  const hayCompras = costoReal > 0 || perdidaFact > 0

  const alertasCC = ccActivos(p).map(cc => {
    const t = topeCC(p, cc.id), cons = consumoCC(p, cc.id)
    return { id: cc.id, nombre: nombreCC(p, cc.id), pc: t > 0 ? (cons / t) * 100 : 0, sobre: cons - t }
  }).filter(a => a.pc >= 80)

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', marginBottom: 14 }}>
      <div onClick={() => { if (!enModal) setAbierto(!abierto) }} style={{ padding: '16px 18px', cursor: enModal ? 'default' : 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, color: C.carbon }}>{p.nombre}</div>
          <div style={{ fontSize: 12, color: C.gris, marginTop: 2 }}>{p.cliente}{p.m2 ? ` · ${p.m2} m²` : ''}{p.periodo ? ` · ${p.periodo}` : ''}{facturasOT.length > 0 && <span style={{ color: C.teal }}> · 🧾 {facturasOT.length} factura{facturasOT.length > 1 ? 's' : ''} ({clp(factNetoOT)})</span>}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <StatHeader label="Venta cotizada" valor={clp(venta)} />
          <StatHeader label="Por facturar" valor={clp(porFacturar)} color={porFacturar > 0 ? C.ambar : C.verde} />
          <StatHeader label="UT est." valor={`${pctUtEst.toFixed(0)}%`} color={colorUT(pctUtEst)} />
          <StatHeader label="UT real" valor={hayCompras ? `${pctUtReal.toFixed(0)}%` : '—'} color={hayCompras ? colorUT(pctUtReal) : C.gris} />
          <button onClick={e => { e.stopPropagation(); setEditFicha(v => !v) }} title="Editar ficha" style={{ background: 'none', border: '1px solid #CBD2D6', cursor: 'pointer', color: C.teal, padding: '5px 7px', display: 'flex', alignItems: 'center' }}><Pencil size={15} /></button>
          <button onClick={e => { e.stopPropagation(); window.confirm(`¿Eliminar la OT "${p.nombre}" completa? Esta acción no se puede deshacer.`) && onDelete(p.id) }} title="Eliminar OT" style={{ background: 'none', border: '1px solid #E2C9C2', cursor: 'pointer', color: C.rojo, padding: '5px 7px', display: 'flex', alignItems: 'center' }}><Trash2 size={15} /></button>
          {!enModal && (abierto ? <ChevronUp size={18} color={C.gris} /> : <ChevronDown size={18} color={C.gris} />)}
        </div>
      </div>

      {editFicha && <FichaEditor p={p} onUpdate={onUpdate} onClose={() => setEditFicha(false)} />}

      {alertasCC.length > 0 && (
        <div style={{ margin: '0 18px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {alertasCC.map(a => (
            <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, padding: '3px 8px', background: a.pc >= 100 ? '#F6E0DA' : '#F9E9DE', color: a.pc >= 100 ? C.rojo : '#8C4519' }}>
              <AlertTriangle size={12} /> {a.id} {a.nombre}: {a.pc.toFixed(0)}%{a.pc >= 100 ? ` · sobre tope ${clp(a.sobre)}` : ' · cerca del tope'}
            </span>
          ))}
        </div>
      )}

      <div style={{ padding: '0 18px 14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: C.gris, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}><Receipt size={13} /> Facturado vs venta cotizada</div>
          <Barra pct={pctFact} color={pctFact > 100 ? C.rojo : C.teal} />
          <div style={{ fontSize: 12, marginTop: 4, color: C.gris }}>{clp(facturado)} de {clp(venta)}{porFacturar > 0 && <span style={{ color: C.ambar }}> · por facturar {clp(porFacturar)}</span>}</div>
          <div style={{ fontSize: 12, marginTop: 10, color: C.gris }}>
            Costo estimado (topes CC): <b>{clp(costoEst)}</b> → UT est. <b style={{ color: colorUT(pctUtEst) }}>{clp(utEst)} ({pctUtEst.toFixed(1)}%)</b><br />
            Costo real (compras): <b>{clp(costoReal)}</b>{perdidaFact > 0 && <> + pérdida factoring <b style={{ color: C.rojo }}>{clp(perdidaFact)}</b></>}{ppm > 0 && <> + PPM <b style={{ color: C.teal }}>{clp(ppm)}</b></>} → UT real <b style={{ color: colorUT(pctUtReal) }}>{clp(utReal)} ({pctUtReal.toFixed(1)}%)</b>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: C.gris, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}><Hammer size={13} /> Avance físico</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}><Barra pct={p.avance} color={C.azul} /></div>
            <input type="number" min="0" max="100" value={p.avance} onClick={e => e.stopPropagation()}
              onChange={e => onUpdate(p.id, { avance: Math.min(100, Math.max(0, +e.target.value)) })} style={{ ...inp, width: 52, textAlign: 'right' }} />
            <span style={{ fontSize: 12, color: C.gris }}>%</span>
          </div>
          <div style={{ fontSize: 12, color: C.gris, marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}><Receipt size={13} /> Cobrado vs facturado</div>
          <Barra pct={pct(cobrado, facturado)} color={C.verde} />
          <div style={{ fontSize: 12, marginTop: 4, color: C.gris }}>{clp(cobrado)} cobrado{pendiente > 0 && <span style={{ color: C.rojo }}> · {clp(pendiente)} por cobrar</span>}</div>
        </div>
        </div>
        <div onClick={e => e.stopPropagation()} style={{ marginTop: 16 }}><BloqueCC p={p} onUpdate={onUpdate} /></div>
      </div>

      {(abierto || enModal) && (
        <div style={{ borderTop: '1px solid #EEE9DF', padding: 18 }}>
          <div style={{ background: remIva >= 0 ? '#FBF3E7' : '#E9F5EC', border: '1px solid ' + (remIva >= 0 ? '#E8C98A' : '#BFE3C8'), borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}><div><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.gris, letterSpacing: '.03em' }}>Remanente de IVA del proyecto</div><div style={{ fontSize: 12, color: C.gris, marginTop: 2 }}>IVA ventas {clp(remIvaVenta)} - IVA compras {clp(remIvaCompra)}</div></div><div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 22, color: remIva >= 0 ? '#B23A0E' : C.verde }}>{clp(remIva)}</div></div>
          <div style={{ background: '#EEF3F8', border: '1px solid #D3E0EC', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}><div><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.gris, letterSpacing: '.03em' }}>Disponible del bruto (venta c/IVA − compras)</div><div style={{ fontSize: 12, color: C.gris, marginTop: 2 }}>Bruto {clp(Math.round(venta * 1.19))} − compras {clp(costoReal)}</div></div><div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 22, color: (Math.round(venta * 1.19) - costoReal) >= 0 ? C.verde : C.rojo }}>{clp(Math.round(venta * 1.19) - costoReal)}</div></div>
          {facturasOT.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: C.teal, marginBottom: 6 }}>🧾 Facturas de esta OT · Estados de pago (EDP)</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr style={{ borderBottom: `1px solid ${C.carbon}` }}>{['N° factura', 'Fecha', 'EDP', 'Neto', 'Total c/IVA', 'PPM ' + ppmPct + '%', 'Estado pago', 'Fecha pago', 'Banco'].map(h => <th key={h} style={{ textAlign: (h === 'Neto' || h === 'Total c/IVA' || h.indexOf('PPM') === 0) ? 'right' : 'left', padding: '4px 6px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {facturasOT.map(fx => { const ov = (p.facEdp || {})[fx.numero] || {}; const est = ov.estado || fx.estado || 'Pendiente'; const esFact = /factor/i.test(est); const ppmF = Math.round((fx.neto || 0) * (ppmPct / 100)); const facs = (params && params.factoring) || []; const fcSel = facs.find(x => x.id === ov.factoringId) || facs.find(x => (fx.banco || '').toLowerCase().includes((x.nombre || '').toLowerCase().split(' ')[0])) || facs[0]; const baseF = fx.monto || Math.round((fx.neto || 0) * 1.19); const perdF = esFact && fcSel ? calcularPerdidaFactoring(baseF, ov.plazo != null ? ov.plazo : (fx.plazo || fx.dias || 30), ov.diasMora || fx.diasMora || 0, fcSel).total : 0; return (
                      <React.Fragment key={fx.id}>
                      <tr style={{ borderBottom: esFact ? 'none' : '1px solid #EEE9DF' }}>
                        <td style={{ padding: '4px 6px', fontWeight: 600 }}>{fx.numero}</td>
                        <td style={{ padding: '4px 6px', color: C.gris }}>{fx.fecha_emision || '—'}</td>
                        <td style={{ padding: '4px 6px' }}><input value={ov.edp || ''} onChange={ev => updFac(fx.numero, { edp: ev.target.value })} placeholder="EDP" style={{ ...inp, width: 90, padding: '4px 6px' }} /></td>
                        <td style={{ padding: '4px 6px', textAlign: 'right' }}>{clp(fx.neto)}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>{clp(baseF)}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', color: C.teal }}>{clp(ppmF)}</td>
                        <td style={{ padding: '4px 6px' }}><select value={est} onChange={ev => updFac(fx.numero, { estado: ev.target.value })} style={{ border: 'none', background: est === 'Pagado' ? '#E7F2EA' : est === 'Factoring' ? '#F9E9DE' : '#F6E0DA', color: est === 'Pagado' ? C.verde : est === 'Factoring' ? C.ambar : '#B23A0E', padding: '3px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><option>Pendiente</option><option>Pagado</option><option>Factoring</option></select></td>
                        <td style={{ padding: '4px 6px' }}><input type="date" value={ov.fechaPago && ov.fechaPago !== '—' ? ov.fechaPago : ''} onChange={ev => updFac(fx.numero, { fechaPago: ev.target.value || '' })} style={{ ...inp, width: 140, padding: '4px 6px' }} /></td>
                        <td style={{ padding: '4px 6px' }}><input list="serein-bancos" value={ov.banco || ''} onChange={ev => updFac(fx.numero, { banco: ev.target.value })} placeholder="Banco..." style={{ ...inp, width: 120, padding: '4px 6px' }} /></td>
                      </tr>
                      {esFact && (
                      <tr style={{ borderBottom: '1px solid #EEE9DF', background: '#FBF3EE' }}>
                        <td colSpan={9} style={{ padding: '2px 8px 8px' }}>
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 11.5, color: '#8C4519' }}>
                            <span style={{ fontWeight: 700 }}>Factoring:</span>
                            <select value={ov.factoringId || (fcSel ? fcSel.id : '')} onChange={ev => updFac(fx.numero, { factoringId: ev.target.value })} style={{ ...inp, padding: '3px 6px' }}>{facs.length === 0 && <option value="">(define en Parámetros)</option>}{facs.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
                            <span>Plazo <input value={ov.plazo != null ? ov.plazo : (fx.plazo || 30)} onChange={ev => updFac(fx.numero, { plazo: num(ev.target.value) })} style={{ ...inp, width: 54, padding: '3px 6px', textAlign: 'right' }} /> días</span>
                            <span>Mora <input value={ov.diasMora || ''} onChange={ev => updFac(fx.numero, { diasMora: num(ev.target.value) })} placeholder="0" style={{ ...inp, width: 54, padding: '3px 6px', textAlign: 'right' }} /> días</span>
                            <span>Pérdida factoring: <b style={{ color: C.rojo }}>{clp(perdF)}</b></span>
                          </div>
                        </td>
                      </tr>
                      )}
                      </React.Fragment>
                    )})}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 12, color: C.gris, marginTop: 4 }}>Facturado (facturas): <b>{clp(factNetoOT)}</b> · Cobrado: <b style={{ color: C.verde }}>{clp(cobrado)}</b> — las facturas se cargan solas desde la pestaña Facturas.</div>
            </div>
          )}
          <AbonosOT p={p} facturasOT={facturasOT} onUpdate={onUpdate} />
          <datalist id="serein-bancos"><option value="Banco de Chile" /><option value="BancoEstado" /><option value="BCI" /><option value="Santander" /><option value="Scotiabank" /><option value="Itaú" /><option value="BICE" /><option value="Security" /><option value="Banco Falabella" /><option value="Banco Ripley" /><option value="Consorcio" /><option value="Internacional" /><option value="HSBC" /></datalist>

          {/* COMPRAS */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '18px 0 8px' }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: C.gris, display: 'flex', alignItems: 'center', gap: 5 }}><ShoppingCart size={13} /> Compras imputadas (por CC)</span>
            <button onClick={() => setAddCompra(true)} style={{ background: C.teal, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Agregar compra</button>
          </div>
          {(p.compras || []).length === 0 ? (
            <div style={{ fontSize: 13, color: C.gris }}>Sin compras imputadas.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['CC', 'Proveedor', 'N° doc', 'Detalle', 'Fecha', 'Monto neto', ''].map((h, i) => <th key={i} style={{ textAlign: h === 'Monto neto' ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {p.compras.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #EEE9DF' }}>
                      <td style={{ padding: '5px 8px' }}><select value={c.cc || CC_DEFS[0].id} onChange={ev => updCompra(i, { cc: ev.target.value })} style={{ ...inp, padding: '5px 7px' }}>{ccCodigos(p).map(id => <option key={id} value={id}>{id} · {nombreCC(p, id)}</option>)}</select></td>
                      <td style={{ padding: '5px 8px' }}><input value={c.proveedor} onChange={ev => updCompra(i, { proveedor: ev.target.value })} style={{ ...inp, width: 130, padding: '5px 7px' }} /></td>
                      <td style={{ padding: '5px 8px' }}><input value={c.folio || ''} onChange={ev => updCompra(i, { folio: ev.target.value })} placeholder="N° doc" style={{ ...inp, width: 90, padding: '5px 7px' }} /></td>
                      <td style={{ padding: '5px 8px' }}><input value={c.detalle || ''} onChange={ev => updCompra(i, { detalle: ev.target.value })} placeholder="Detalle" style={{ ...inp, width: 130, padding: '5px 7px' }} /></td>
                      <td style={{ padding: '5px 8px' }}><input type="date" value={c.fecha && c.fecha !== '—' ? c.fecha : ''} onChange={ev => updCompra(i, { fecha: ev.target.value || '—' })} style={{ ...inp, width: 140, padding: '5px 7px' }} /></td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}><input value={c.monto} onChange={ev => updCompra(i, { monto: num(ev.target.value) })} style={{ ...inp, width: 110, padding: '5px 7px', textAlign: 'right' }} /></td>
                      <td style={{ padding: '7px 4px', textAlign: 'right' }}><button onClick={() => window.confirm(`¿Eliminar compra de ${c.proveedor} (${clp(c.monto)})?`) && onUpdate(p.id, { compras: p.compras.filter((_, j) => j !== i) })} style={btnMini}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {addCompra && <FormCompra p={p} onAdd={c => { if (onAddCompra(p.id, c)) setAddCompra(false) }} onCancel={() => setAddCompra(false)} />}

          {/* Resumen */}
          <div style={{ marginTop: 16, padding: '10px 14px', background: '#F7F4EE', fontSize: 13, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <span>Venta: <b>{clp(venta)}</b></span>
            <span>Facturado: <b>{clp(facturado)}</b></span>
            <span>Por facturar: <b style={{ color: porFacturar > 0 ? C.ambar : C.verde }}>{clp(porFacturar)}</b></span>
            <span>Costo est.: <b>{clp(costoEst)}</b></span>
            <span>Costo real: <b>{clp(costoReal)}</b></span>
            <span>PPM ({ppmPct}%): <b style={{ color: C.teal }}>{clp(ppm)}</b></span>
            <span>Neta real (fact − PPM): <b>{clp(facturado - ppm)}</b></span>
            <span>Pérdida factoring: <b style={{ color: perdidaFact > 0 ? C.rojo : C.gris }}>{clp(perdidaFact)}</b></span>
            <span>UT est.: <b style={{ color: colorUT(pctUtEst) }}>{clp(utEst)} ({pctUtEst.toFixed(1)}%)</b></span>
            <span>UT real: <b style={{ color: colorUT(pctUtReal) }}>{clp(utReal)} ({pctUtReal.toFixed(1)}%)</b></span>
          </div>
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => descargarProyectoXlsx(p, facturasProy, params, ppmPct)} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Table2 size={14} /> Descargar Excel</button>
              {p.cerrado
                ? <button onClick={() => window.confirm('¿Reabrir este proyecto? Volverá a la vista de proyectos activos.') && onUpdate(p.id, { cerrado: false })} style={{ background: C.azul, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Reabrir proyecto</button>
                : <button onClick={() => window.confirm('¿Cerrar el proyecto? Pasará a "Proyectos cerrados", pero seguirá sumando en el consolidado.') && onUpdate(p.id, { cerrado: true, fechaCierre: new Date().toISOString().slice(0, 10) })} style={{ background: C.carbon, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Cerrar proyecto</button>}
            </div>
            <button onClick={() => window.confirm(`¿Eliminar el proyecto "${p.nombre}" completo?`) && onDelete(p.id)} style={{ background: 'none', border: `1px solid ${C.rojo}`, color: C.rojo, padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Trash2 size={13} /> Eliminar proyecto</button>
          </div>
        </div>
      )}
    </div>
  )
}

function TileProyecto({ p, facturasProy = [], onOpen, onDragStart, onDropOn }) {
  const venta = ventaDe(p, facturasProy), fact = facturadoDe(p, facturasProy)
  const activa = !p.cerrado
  return (
    <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); onDropOn() }} onClick={onOpen}
      style={{ background: '#fff', border: '1px solid #E2DED4', borderTop: '3px solid ' + C.azul, padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 12, background: C.carbon, color: '#fff', padding: '2px 7px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%' }}>{p.ot || 'OT'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: activa ? C.verde : C.gris, background: activa ? '#E7F2EA' : '#EEE9DF', padding: '2px 8px', borderRadius: 10 }}>{activa ? 'Activa' : 'Cerrada'}</span>
          <span draggable onDragStart={e => { e.stopPropagation(); onDragStart() }} onClick={e => e.stopPropagation()} title="Arrastrar para reordenar" style={{ cursor: 'grab', color: '#B9C0C6', fontSize: 15, userSelect: 'none', lineHeight: 1, letterSpacing: '-1px' }}>::</span>
        </div>
      </div>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, color: C.carbon, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
      <div style={{ fontSize: 11.5, color: C.gris, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cliente}</div>
      <div style={{ marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 10.5, color: C.gris, textTransform: 'uppercase' }}>Venta</span>
        <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, color: C.carbon }}>{clp(venta)}</span>
      </div>
      <Barra pct={venta > 0 ? (fact / venta) * 100 : 0} color={C.teal} alto={5} />
    </div>
  )
}

// ---------- Form nuevo proyecto (OT) ----------
function FormProyecto({ onAdd, onCancel }) {
  const [f, setF] = useState({ ot: '', cliente: '', m2: '', periodo: 'T1', venta: '' })
  const [tope, setTope] = useState({})
  const [nomb, setNomb] = useState({})
  return (
    <div style={{ background: '#fff', border: `2px solid ${C.azul}`, padding: 16, marginBottom: 14 }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Nuevo proyecto por OT</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input style={{ ...inp, width: 140 }} placeholder="OT (N° cotización) *" value={f.ot} onChange={e => setF({ ...f, ot: e.target.value })} />
        <input style={{ ...inp, flex: '1 1 200px' }} placeholder="Cliente *" value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} />
        <input style={{ ...inp, width: 90 }} placeholder="m²" value={f.m2} onChange={e => setF({ ...f, m2: e.target.value })} />
        <input style={{ ...inp, width: 90 }} placeholder="Período" value={f.periodo} onChange={e => setF({ ...f, periodo: e.target.value })} />
        <input style={{ ...inp, width: 170 }} placeholder="Venta cotizada CLP *" value={f.venta} onChange={e => setF({ ...f, venta: e.target.value })} />
      </div>
      <div style={{ fontSize: 12, color: C.gris, margin: '12px 0 6px' }}>Centros de costo — nombre (editable) y tope. La UT estimada = venta − suma de topes.</div>
      {CC_DEFS.map(c => (
        <div key={c.id} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, width: 24 }}>{c.id}</span>
          <input value={nomb[c.id] ?? ''} onChange={e => setNomb({ ...nomb, [c.id]: e.target.value })} placeholder={nombreDefault(c.id)} style={{ ...inp, flex: 1 }} />
          <input value={tope[c.id] ?? ''} onChange={e => setTope({ ...tope, [c.id]: e.target.value })} placeholder="Tope CLP" style={{ ...inp, width: 120, textAlign: 'right' }} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => {
          if (!f.ot || !f.cliente || num(f.venta) <= 0) return
          const cc = {}, ccNombres = {}
          CC_DEFS.forEach(c => { const v = num(tope[c.id]); if (v > 0) cc[c.id] = v; const nm = (nomb[c.id] || '').trim(); if (nm && nm !== nombreDefault(c.id)) ccNombres[c.id] = nm })
          onAdd({ id: 'ot-' + Date.now(), ot: f.ot, periodo: f.periodo || 'T1', nombre: `OT ${f.ot} · ${f.cliente}`, cliente: f.cliente, m2: num(f.m2) || null, oc: f.ot, venta_cotizada: num(f.venta), avance: 0, cc, ccNombres, edps: [], compras: [] })
        }} style={{ background: C.verde, color: '#fff', border: 'none', padding: '8px 18px', cursor: 'pointer', fontSize: 13 }}>Crear OT</button>
        <button onClick={onCancel} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
      </div>
    </div>
  )
}

// ---------- Vista Consolidado (como la primera hoja) ----------
function Consolidado({ proyectos, facturasProy = [], params = { factoring: [] } }) {
  const periodos = useMemo(() => {
    const g = {}; proyectos.forEach(p => { (g[p.periodo || '—'] = g[p.periodo || '—'] || []).push(p) }); return Object.entries(g)
  }, [proyectos])
  const celda = (v, alignRight = true, bold = false, color) => <td style={{ padding: '6px 8px', textAlign: alignRight ? 'right' : 'left', fontWeight: bold ? 600 : 400, color, whiteSpace: 'nowrap' }}>{v}</td>
  const [expTipo, setExpTipo] = useState('mes')
  const [expRef, setExpRef] = useState(new Date().toISOString().slice(0, 10))
  const anioActual = new Date().getFullYear()
  const ventasAnio = (facturasProy || []).filter(f => String(f.fecha_emision || '').slice(0, 4) === String(anioActual)).reduce((a, f) => a + (f.neto || 0), 0)
  const enRango = fechaStr => {
    if (expTipo === 'todo') return true
    if (!fechaStr) return false
    const d = new Date(fechaStr + 'T00:00:00'), r = new Date(expRef + 'T00:00:00')
    if (isNaN(d.getTime())) return false
    if (expTipo === 'anio') return d.getFullYear() === r.getFullYear()
    if (expTipo === 'mes') return d.getFullYear() === r.getFullYear() && d.getMonth() === r.getMonth()
    if (expTipo === 'semestre') { const h = m => m < 6 ? 0 : 1; return d.getFullYear() === r.getFullYear() && h(d.getMonth()) === h(r.getMonth()) }
    if (expTipo === 'semana') { const ini = new Date(r); ini.setDate(ini.getDate() - ((ini.getDay() + 6) % 7)); const fin = new Date(ini); fin.setDate(ini.getDate() + 7); return d >= ini && d < fin }
    return true
  }
  const exportarXlsx = () => {
    const wb = XLSX.utils.book_new()
    const cons = proyectos.map(p => ({ OT: p.ot || '', Cliente: p.cliente || '', Estado: p.cerrado ? 'Cerrado' : 'Activo', Venta: ventaDe(p, facturasProy), Facturado: facturadoDe(p, facturasProy), 'Por facturar': porFacturarDe(p, facturasProy), 'Costo est': costoEstDe(p), 'Costo real': comprasDe(p), 'Perdida factoring': perdidaFactDe(p, facturasProy, params) }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cons.length ? cons : [{ OT: 'Sin proyectos' }]), 'Consolidado')
    const vp = (facturasProy || []).filter(f => enRango(f.fecha_emision)).map(f => { const tot = f.monto || Math.round((f.neto || 0) * 1.19); return [f.numero, f.cliente || '', f.ot || '', f.fecha_emision || '', f.neto || 0, tot - (f.neto || 0), tot, f.estado || ''] })
    const totNeto = vp.reduce((a, r) => a + (r[4] || 0), 0)
    const aoa = [['Ventas ' + expTipo + ' - referencia ' + expRef], [], ['Factura', 'Cliente', 'OT', 'Fecha', 'Neto', 'IVA', 'Total', 'Estado'], ...vp, [], ['TOTAL NETO', '', '', '', totNeto]]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Ventas')
    XLSX.writeFile(wb, 'Consolidado_Proyectos_' + expTipo + '_' + expRef + '.xlsx')
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 12, overflowX: 'auto' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13 }}>Ventas del año {anioActual}: <b style={{ color: C.azul }}>{clp(ventasAnio)}</b></div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.gris }}>Informe Excel:</span>
          <select value={expTipo} onChange={e => setExpTipo(e.target.value)} style={{ ...inp, fontSize: 12, padding: '5px 7px' }}><option value="semana">Semanal</option><option value="mes">Mensual</option><option value="semestre">Semestral</option><option value="anio">Anual</option><option value="todo">Todo</option></select>
          <input type="date" value={expRef} onChange={e => setExpRef(e.target.value)} style={{ ...inp, fontSize: 12, padding: '5px 7px' }} />
          <button onClick={exportarXlsx} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Table2 size={13} /> Descargar Excel</button>
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
          {['OT', 'Cliente', 'Venta', 'Facturado', 'Por facturar', 'Costo est.', 'Costo real', 'Pérdida fact.', 'UT est.', '%', ...CC_DEFS.map(c => c.id)].map((h, i) => (
            <th key={i} style={{ textAlign: i < 2 ? 'left' : 'right', padding: '6px 8px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {periodos.map(([per, ps]) => {
            const sub = { venta: 0, fact: 0, porFac: 0, costoEst: 0, costoReal: 0, perdFact: 0 }
            const filas = ps.map(p => {
              const venta = ventaDe(p, facturasProy), fact = facturadoDe(p, facturasProy), porFac = porFacturarDe(p, facturasProy), costoEst = costoEstDe(p), costoReal = comprasDe(p), perdFact = perdidaFactDe(p, facturasProy, params)
              sub.venta += venta; sub.fact += fact; sub.porFac += porFac; sub.costoEst += costoEst; sub.costoReal += costoReal; sub.perdFact += perdFact
              const ut = venta - costoEst, p2 = pct(ut, venta)
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
                  {celda((p.ot || '—') + (p.cerrado ? ' · cerrado' : ''), false, true)}
                  {celda(p.cliente, false, false, C.gris)}
                  {celda(clp(venta))}
                  {celda(clp(fact))}
                  {celda(clp(porFac), true, false, porFac > 0 ? C.ambar : C.gris)}
                  {celda(clp(costoEst))}
                  {celda(costoReal ? clp(costoReal) : '—', true, false, C.gris)}
                  {celda(perdFact ? clp(perdFact) : '—', true, false, perdFact > 0 ? C.rojo : C.gris)}
                  {celda(clp(ut), true, true)}
                  {celda(p2.toFixed(0) + '%', true, false, colorUT(p2))}
                  {CC_DEFS.map(c => celda(consumoCC(p, c.id) ? clp(consumoCC(p, c.id)) : '—', true, false, C.gris))}
                </tr>
              )
            })
            const utSub = sub.venta - sub.costoEst
            return (
              <React.Fragment key={per}>
                <tr style={{ background: '#F7F4EE' }}><td colSpan={10 + CC_DEFS.length} style={{ padding: '5px 8px', fontWeight: 600, fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', fontSize: 12 }}>{per}</td></tr>
                {filas}
                <tr style={{ borderTop: `2px solid ${C.carbon}`, borderBottom: `2px solid ${C.carbon}` }}>
                  {celda('COT', false, true)}{celda('', false)}
                  {celda(clp(sub.venta), true, true)}{celda(clp(sub.fact), true, true)}{celda(clp(sub.porFac), true, true, C.ambar)}
                  {celda(clp(sub.costoEst), true, true)}{celda(clp(sub.costoReal), true, true)}{celda(clp(sub.perdFact), true, true, sub.perdFact > 0 ? C.rojo : undefined)}
                  {celda(clp(utSub), true, true)}
                  {celda(sub.venta > 0 ? ((utSub / sub.venta) * 100).toFixed(0) + '%' : '—', true, true)}
                  {CC_DEFS.map(c => celda('', true))}
                </tr>
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ProyCotizacionesList({ setProyectos }) {
  const LSKEY = 'serein_proyCotizaciones'
  const cargar = () => { try { const s = localStorage.getItem(LSKEY); const o = s ? JSON.parse(s) : []; return Array.isArray(o) ? o : [] } catch (e) { return [] } }
  const [cots, setCots] = useState(cargar)
  const persist = a => { setCots(a); try { localStorage.setItem(LSKEY, JSON.stringify(a)) } catch (e) {} }
  const ESTADOS = ['Alta probabilidad de cierre', 'Mediana probabilidad de cierre', 'Rechazada', 'Aprobada']
  const colorEstado = e => ({ 'Aprobada': ['#E7F2EA', C.verde], 'Rechazada': ['#F6E0DA', C.rojo], 'Alta probabilidad de cierre': ['#E7EEF2', C.azul], 'Mediana probabilidad de cierre': ['#F9E9DE', '#8C4519'] }[e] || ['#EEE', C.gris])
  const normEstado = e => { const t = String(e || '').toLowerCase(); if (t.includes('aprob')) return 'Aprobada'; if (t.includes('rechaz')) return 'Rechazada'; if (t.includes('median') || t.includes('baja')) return 'Mediana probabilidad de cierre'; if (t.includes('alta')) return 'Alta probabilidad de cierre'; return 'Alta probabilidad de cierre' }
  const crearOT = c => {
    const q = 'T' + (Math.floor(new Date().getMonth() / 3) + 1)
    const nueva = {
      id: 'otp' + Date.now(), ot: c.numero, oc: c.numero, periodo: q,
      nombre: (c.nombreProyecto ? c.nombreProyecto + ' · ' : '') + c.cliente, cliente: c.cliente, m2: null,
      venta_cotizada: c.ventaNeta, avance: 0, cc: {}, ccNombres: {}, edps: [], compras: [],
      origen: 'cotizador-proyecto',
      snapshotProy: { centros: c.centros, costoNeto: c.costoNeto, costoBruto: c.costoBruto, ventaNeta: c.ventaNeta, ventaBruta: c.ventaBruta, utilidad: c.utilidad, margenPct: c.margenPct, modoMargen: c.modoMargen, fecha: new Date().toISOString().slice(0, 10) },
    }
    ;(c.centros || []).forEach((cc, i) => { const key = (cc.codigo || '').trim() || ('C' + (i + 1)); nueva.cc[key] = cc.neto; nueva.ccNombres[key] = cc.nombre || key })
    setProyectos(prev => [nueva, ...(prev || [])])
    return nueva.id
  }
  const cambiarEstado = (c, nuevo) => {
    if (nuevo === 'Aprobada' && !c.otId) {
      if (!window.confirm('¿Aprobar ' + c.numero + ' y generar la ficha de OT de proyecto?')) return
      const otId = crearOT(c)
      persist(cots.map(x => x.id === c.id ? { ...x, estado: 'Aprobada', otId, snapshot: x.snapshot || null } : x))
    } else {
      persist(cots.map(x => x.id === c.id ? { ...x, estado: nuevo } : x))
    }
  }
  const borrar = id => { if (!window.confirm('¿Eliminar esta cotización de proyecto? (no elimina la OT si ya se creó)')) return; persist(cots.filter(x => x.id !== id)) }
  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 12, overflowX: 'auto' }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Cotizaciones de proyecto</div>
      {cots.length === 0 ? (
        <div style={{ fontSize: 13, color: C.gris }}>Aún no hay cotizaciones. Se agregan solas al guardar un borrador en la pestaña "Cotización Proyecto".</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['N°', 'Cliente', 'Proyecto', 'Fecha', 'Costo neto', 'Venta neta', 'Margen s/venta', 'Estado', 'OT', ''].map((h, i) => <th key={i} style={{ textAlign: ['Costo neto', 'Venta neta', 'Margen s/venta'].includes(h) ? 'right' : 'left', padding: '6px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
          <tbody>
            {cots.map(c => { const est = normEstado(c.estado); const col = colorEstado(est); return (
              <tr key={c.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{c.numero}</td>
                <td style={{ padding: '6px 8px' }}>{c.cliente}</td>
                <td style={{ padding: '6px 8px', color: C.gris }}>{c.nombreProyecto || '—'}</td>
                <td style={{ padding: '6px 8px', color: C.gris, whiteSpace: 'nowrap' }}>{c.fecha || '—'}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{clp(c.costoNeto)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{clp(c.ventaNeta)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: C.verde }}>{(c.margenSobreVenta != null ? c.margenSobreVenta : 0)}%</td>
                <td style={{ padding: '6px 8px' }}><select value={est} onChange={e => cambiarEstado(c, e.target.value)} style={{ border: 'none', background: col[0], color: col[1], padding: '4px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{ESTADOS.map(sX => <option key={sX} value={sX}>{sX}</option>)}</select></td>
                <td style={{ padding: '6px 8px', fontSize: 11.5, color: c.otId ? C.teal : C.gris, whiteSpace: 'nowrap' }}>{c.otId ? 'OT creada' : '—'}</td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}><button onClick={() => borrar(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button></td>
              </tr>
            )})}
          </tbody>
        </table>
      )}
      <div style={{ fontSize: 11.5, color: '#9AA0A6', marginTop: 8 }}>Cambia el estado según la probabilidad de cierre. Al marcar <b>Aprobada</b> se genera la ficha de OT (pestaña Tarjetas) con el presupuesto por centro de costo.</div>
    </div>
  )
}

export default function ProyectosModule({ proyectos: proyExt, setProyectos: setProyExt, params = { factoring: [] }, facturas = {}, setFacturas = () => {}, comisionPct = 2, setComisionPct = () => {}, ppmPct = 2, setPpmPct = () => {}, clientesSugeridos = [] }) {
  const [proyInt, setProyInt] = useState(PROYECTOS)
  const proyectos = proyExt ?? proyInt
  const setProyectos = setProyExt ?? setProyInt
  const facturasProy = (facturas && facturas['Proyectos']) || []
  const [creando, setCreando] = useState(false)
  const [vista, setVista] = useState('tarjetas')
  const [sel, setSel] = useState(null)
  const dragId = React.useRef(null)
  const mover = (fromId, toId) => { if (!fromId || fromId === toId) return; setProyectos(ps => { const arr = [...ps]; const from = arr.findIndex(x => x.id === fromId); const to = arr.findIndex(x => x.id === toId); if (from < 0 || to < 0) return ps; const [it] = arr.splice(from, 1); arr.splice(to, 0, it); return arr }) }
  const [emailUser, setEmailUser] = useState('')
  React.useEffect(() => { let v = true; supabase.auth.getUser().then(({ data }) => { if (v) setEmailUser((data && data.user && data.user.email) || '') }); return () => { v = false } }, [])
  const verCotizadorProy = COTIZADOR_PROY_EMAILS.includes((emailUser || '').trim().toLowerCase())

  const actualizar = (id, cambios) => setProyectos(ps => ps.map(p => p.id === id ? { ...p, ...cambios } : p))
  const eliminar = id => setProyectos(ps => ps.filter(p => p.id !== id))

  // Alta de compra con anti-duplicado por folio + RUT (en TODO el consolidado)
  function agregarCompra(pId, compra) {
    if (compra.folio && compra.rut) {
      const dup = proyectos.some(p => (p.compras || []).some(c => c.folio && c.rut && c.folio.trim() === compra.folio.trim() && c.rut.trim() === compra.rut.trim()))
      if (dup && !window.confirm(`Ya existe una compra con folio ${compra.folio} y RUT ${compra.rut} en el consolidado. ¿Agregar de todas formas?`)) return false
    }
    setProyectos(ps => ps.map(p => p.id === pId ? { ...p, compras: [...(p.compras || []), compra] } : p))
    return true
  }

  const totVenta = proyectos.reduce((a, p) => a + ventaDe(p, facturasProy), 0)
  const totFact = proyectos.reduce((a, p) => a + facturadoDe(p, facturasProy), 0)
  const totPorFac = proyectos.reduce((a, p) => a + porFacturarDe(p, facturasProy), 0)
  const totCostoEst = proyectos.reduce((a, p) => a + costoEstDe(p), 0)
  const totCostoReal = proyectos.reduce((a, p) => a + comprasDe(p), 0)
  const totPerdidaFact = facturasProy.reduce((a, f) => a + perdidaFactoringFactura(f, params), 0)
  const kpi = (label, valor, color) => (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 14, flex: '1 1 140px' }}>
      <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 21, fontWeight: 600, color: color || C.carbon, whiteSpace: 'nowrap' }}>{valor}</div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {kpi('Proyectos / OT', proyectos.length)}
        {kpi('Venta cotizada', clp(totVenta))}
        {kpi('Por facturar', clp(totPorFac), C.ambar)}
        {kpi('Costo est.', clp(totCostoEst))}
        {kpi('Costo real', clp(totCostoReal))}
        {kpi('Pérdida factoring', clp(totPerdidaFact), totPerdidaFact > 0 ? C.rojo : C.carbon)}
        {kpi('UT est. global', totVenta > 0 ? (((totVenta - totCostoEst) / totVenta) * 100).toFixed(0) + '%' : '0%', C.verde)}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['tarjetas', 'Tarjetas', LayoutGrid], ...(verCotizadorProy ? [['cotizarProy', 'Cotización Proyecto', Receipt], ['cotizacionesProy', 'Cotizaciones', Receipt], ['comprasSII', 'Compras SII', ShoppingCart]] : []), ['consolidado', 'Consolidado', Table2], ['cerrados', 'Proyectos cerrados', LayoutGrid], ['facturas', 'Facturas', Receipt], ...(verCotizadorProy ? [['parametros', 'Parámetros Proyectos', Target]] : [])].map(([id, lbl, Icon]) => (
          <button key={id} onClick={() => setVista(id)} style={{ background: vista === id ? C.carbon : '#fff', color: vista === id ? '#fff' : C.carbon, border: '1px solid #CBD2D6', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontFamily: "'Oswald',sans-serif", fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}><Icon size={14} />{lbl}</button>
        ))}
        {!creando && vista === 'tarjetas' && (
          <button onClick={() => setCreando(true)} style={{ background: C.azul, color: '#fff', border: 'none', padding: '7px 16px', cursor: 'pointer', fontSize: 12.5, fontFamily: "'Oswald',sans-serif", fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}><Plus size={15} /> Nueva OT</button>
        )}
      </div>

      {creando && <FormProyecto onAdd={p => { setProyectos(ps => [p, ...ps]); setCreando(false) }} onCancel={() => setCreando(false)} />}

      {(vista === 'cotizarProy' && verCotizadorProy) ? (
        <ProyCotizador clientes={clientesSugeridos} proyectos={proyectos} setProyectos={setProyectos} />
      ) : (vista === 'cotizacionesProy' && verCotizadorProy) ? (
        <ProyCotizacionesList setProyectos={setProyectos} />
      ) : (vista === 'comprasSII' && verCotizadorProy) ? (
        <ProyComprasLibro proyectos={proyectos} setProyectos={setProyectos} />
      ) : vista === 'consolidado' ? (
        <Consolidado proyectos={proyectos} facturasProy={facturasProy} params={params} />
      ) : vista === 'facturas' ? (
        <FacturasModule area="Proyectos" facturas={facturas} setFacturas={setFacturas} params={params} comisionPct={comisionPct} setComisionPct={setComisionPct} ppmPct={ppmPct} setPpmPct={setPpmPct} clientesSugeridos={clientesSugeridos} />
      ) : (vista === 'parametros' && verCotizadorProy) ? (
        <ProyParametros />
      ) : vista === 'cerrados' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {proyectos.filter(p => p.cerrado).map(p => <TileProyecto key={p.id} p={p} facturasProy={facturasProy} onOpen={() => setSel(p.id)} onDragStart={() => {}} onDropOn={() => {}} />)}
          {proyectos.filter(p => p.cerrado).length === 0 && <div style={{ gridColumn: '1 / -1', fontSize: 13, color: C.gris, padding: 12 }}>Aún no hay proyectos cerrados. Ciérralos desde la ficha de cada OT (botón "Cerrar proyecto").</div>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {proyectos.filter(p => !p.cerrado).map(p => <TileProyecto key={p.id} p={p} facturasProy={facturasProy} onOpen={() => setSel(p.id)} onDragStart={() => { dragId.current = p.id }} onDropOn={() => { mover(dragId.current, p.id); dragId.current = null }} />)}
        </div>
      )}
      {(() => { const sp = proyectos.find(x => x.id === sel); return (sp && (vista === 'tarjetas' || vista === 'cerrados')) ? (
            <div onClick={() => setSel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,26,46,.55)', zIndex: 70, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 16px', overflowY: 'auto' }}>
              <div onClick={e => e.stopPropagation()} style={{ background: '#F7F6F3', width: '100%', maxWidth: 1000, boxShadow: '0 20px 60px -12px rgba(0,0,0,.4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #E2DED4', background: '#fff', position: 'sticky', top: 0, zIndex: 2 }}>
                  <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, textTransform: 'uppercase' }}>{sp.nombre}{sp.cerrado ? ' · CERRADO' : ''}</span>
                  <button onClick={() => setSel(null)} style={{ background: 'none', border: '1px solid #CBD2D6', cursor: 'pointer', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}><X size={15} /> Cerrar</button>
                </div>
                <div style={{ padding: 12 }}>
                  <TarjetaProyecto p={sp} onUpdate={actualizar} onDelete={id => { eliminar(id); setSel(null) }} onAddCompra={agregarCompra} params={params} facturasProy={facturasProy} ppmPct={ppmPct} enModal />
                </div>
              </div>
            </div>
          ) : null })()}

      <div style={{ fontSize: 12, color: '#9AA0A6', textAlign: 'center', marginTop: 8 }}>
        Los cambios se guardan automáticamente en la nube (Supabase) y quedan sincronizados en todos los dispositivos.
      </div>
    </div>
  )
}
