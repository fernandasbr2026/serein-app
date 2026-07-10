import React, { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, Target, Receipt, Hammer, ShoppingCart, Pencil, Plus, Trash2, X, AlertTriangle, LayoutGrid, Table2 } from 'lucide-react'
import { PROYECTOS, CC_DEFS } from './proyectos-data.js'
import { calcularPerdidaFactoring, perdidaFactoringFactura } from './ParametrosModule.jsx'
import FacturasModule from './FacturasModule.jsx'
import ProyParametros from './ProyParametros.jsx'
import ProyCotizador from './ProyCotizador.jsx'
import ProyComprasLibro from './ProyComprasLibro.jsx'
import { supabase } from './supabase.js'
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
const facturadoDe = p => (p.edps || []).reduce((a, e) => a + e.venta, 0)
const cobradoDe = p => (p.edps || []).filter(e => e.estado === 'Pagado').reduce((a, e) => a + e.venta, 0)
const comprasDe = p => (p.compras || []).reduce((a, c) => a + c.monto, 0)
const ventaDe = p => (p.venta_cotizada != null && p.venta_cotizada > 0) ? p.venta_cotizada : facturadoDe(p)
const porFacturarDe = p => Math.max(0, ventaDe(p) - facturadoDe(p))
const perdidaFactDe = p => (p.edps || []).reduce((a, e) => a + (e.perdidaFact || 0), 0)
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
          {CC_DEFS.map(cc => <option key={cc.id} value={cc.id}>{cc.id} · {nombreCC(p, cc.id)}</option>)}
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
  const [tope, setTope] = useState({})
  const [nomb, setNomb] = useState({})
  const activos = ccActivos(p)

  function abrirEdicion(e) {
    e.stopPropagation()
    const t = {}, n = {}
    CC_DEFS.forEach(cc => { t[cc.id] = (p.cc && p.cc[cc.id]) || ''; n[cc.id] = nombreCC(p, cc.id) })
    setTope(t); setNomb(n); setEditando(true)
  }
  function guardar() {
    const cc = {}, ccNombres = {}
    CC_DEFS.forEach(c => { const v = num(tope[c.id]); if (v > 0) cc[c.id] = v; const nm = (nomb[c.id] || '').trim(); if (nm && nm !== nombreDefault(c.id)) ccNombres[c.id] = nm })
    onUpdate(p.id, { cc, ccNombres }); setEditando(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: C.gris, display: 'flex', alignItems: 'center', gap: 5 }}><Target size={13} /> Centros de costo (presupuesto vs consumo)</span>
        {!editando && <button onClick={abrirEdicion} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.teal, display: 'flex', alignItems: 'center', gap: 3, fontSize: 12 }}><Pencil size={12} /> Editar CC</button>}
      </div>
      {editando ? (
        <div onClick={e => e.stopPropagation()} style={{ background: '#FAF7F3', padding: 10 }}>
          <div style={{ fontSize: 11, color: C.gris, marginBottom: 6 }}>Puedes cambiar el nombre y el tope de cada centro de costo (varían según cliente/proyecto).</div>
          {CC_DEFS.map(cc => (
            <div key={cc.id} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, width: 24 }}>{cc.id}</span>
              <input value={nomb[cc.id] ?? ''} onChange={e => setNomb({ ...nomb, [cc.id]: e.target.value })} placeholder={nombreDefault(cc.id)} style={{ ...inp, flex: 1 }} />
              <input value={tope[cc.id] ?? ''} onChange={e => setTope({ ...tope, [cc.id]: e.target.value })} placeholder="Tope CLP" style={{ ...inp, width: 120, textAlign: 'right' }} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button onClick={guardar} style={{ background: C.azul, color: '#fff', border: 'none', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>Guardar CC</button>
            <button onClick={() => setEditando(false)} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
          </div>
        </div>
      ) : activos.length === 0 ? (
        <div style={{ fontSize: 12, color: C.ambar, background: '#F9E9DE', padding: '6px 10px' }}>Sin presupuesto por CC — usa "Editar CC".</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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

function TarjetaProyecto({ p, onUpdate, onDelete, onAddCompra, params, facturasProy = [], enModal = false }) {
  const facturasOT = facturasDeOT(facturasProy, p)
  const factNetoOT = facturasOT.reduce((a, f) => a + (f.neto || 0), 0)
  const [abierto, setAbierto] = useState(false)
  const [addEdp, setAddEdp] = useState(false)
  const [addCompra, setAddCompra] = useState(false)
  const [editFicha, setEditFicha] = useState(false)
  const updEdp = (i, cambios) => onUpdate(p.id, { edps: p.edps.map((x, j) => j === i ? { ...x, ...cambios } : x) })
  const updCompra = (i, cambios) => onUpdate(p.id, { compras: p.compras.map((x, j) => j === i ? { ...x, ...cambios } : x) })

  const facturado = facturadoDe(p), cobrado = cobradoDe(p), pendiente = facturado - cobrado
  const venta = ventaDe(p), porFacturar = porFacturarDe(p)
  const costoEst = costoEstDe(p), costoReal = comprasDe(p), perdidaFact = perdidaFactDe(p)
  const utEst = venta - costoEst, pctUtEst = pct(utEst, venta)
  const utReal = venta - costoReal - perdidaFact, pctUtReal = pct(utReal, venta)
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

      <div style={{ padding: '0 18px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: C.gris, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}><Receipt size={13} /> Facturado vs venta cotizada</div>
          <Barra pct={pctFact} color={pctFact > 100 ? C.rojo : C.teal} />
          <div style={{ fontSize: 12, marginTop: 4, color: C.gris }}>{clp(facturado)} de {clp(venta)}{porFacturar > 0 && <span style={{ color: C.ambar }}> · por facturar {clp(porFacturar)}</span>}</div>
          <div style={{ fontSize: 12, marginTop: 10, color: C.gris }}>
            Costo estimado (topes CC): <b>{clp(costoEst)}</b> → UT est. <b style={{ color: colorUT(pctUtEst) }}>{clp(utEst)} ({pctUtEst.toFixed(1)}%)</b><br />
            Costo real (compras): <b>{clp(costoReal)}</b>{perdidaFact > 0 && <> + pérdida factoring <b style={{ color: C.rojo }}>{clp(perdidaFact)}</b></>} → UT real <b style={{ color: colorUT(pctUtReal) }}>{clp(utReal)} ({pctUtReal.toFixed(1)}%)</b>
          </div>
        </div>
        <div onClick={e => e.stopPropagation()}><BloqueCC p={p} onUpdate={onUpdate} /></div>
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

      {(abierto || enModal) && (
        <div style={{ borderTop: '1px solid #EEE9DF', padding: 18 }}>
          {facturasOT.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: C.teal, marginBottom: 6 }}>🧾 Facturas de esta OT (automáticas)</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr style={{ borderBottom: `1px solid ${C.carbon}` }}>{['N° factura', 'Fecha', 'Neto', 'Estado'].map(h => <th key={h} style={{ textAlign: h === 'Neto' ? 'right' : 'left', padding: '4px 6px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {facturasOT.map(fx => (
                      <tr key={fx.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
                        <td style={{ padding: '4px 6px', fontWeight: 600 }}>{fx.numero}</td>
                        <td style={{ padding: '4px 6px', color: C.gris }}>{fx.fecha_emision || '—'}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right' }}>{clp(fx.neto)}</td>
                        <td style={{ padding: '4px 6px', color: C.gris }}>{fx.estado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 12, color: C.gris, marginTop: 4 }}>Facturado (facturas): <b>{clp(factNetoOT)}</b> — se cargan solas al ingresarlas en la pestaña Facturas con esta OT.</div>
            </div>
          )}
          {/* VENTAS / EDP */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: C.gris }}>Ventas · Estados de pago (EDP)</span>
            <button onClick={() => setAddEdp(true)} style={{ background: C.azul, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Agregar venta</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['EDP', 'Fecha', 'Venta neta', 'Método', 'Estado', ''].map((h, i) => <th key={i} style={{ textAlign: h === 'Venta neta' ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>
                {(p.edps || []).map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #EEE9DF' }}>
                    <td style={{ padding: '5px 8px' }}><input value={e.edp} onChange={ev => updEdp(i, { edp: ev.target.value })} style={{ ...inp, width: 120, padding: '5px 7px' }} /></td>
                    <td style={{ padding: '5px 8px' }}><input type="date" value={e.fecha && e.fecha !== '—' ? e.fecha : ''} onChange={ev => updEdp(i, { fecha: ev.target.value || '—' })} style={{ ...inp, width: 140, padding: '5px 7px' }} /></td>
                    <td style={{ padding: '5px 8px', textAlign: 'right' }}><input value={e.venta} onChange={ev => updEdp(i, { venta: num(ev.target.value) })} style={{ ...inp, width: 110, padding: '5px 7px', textAlign: 'right' }} /></td>
                    <td style={{ padding: '5px 8px' }}>
                      <select value={e.metodo || 'Contado'} onChange={ev => updEdp(i, { metodo: ev.target.value })} style={{ ...inp, width: 100, padding: '5px 7px' }}>
                        <option>Contado</option><option>Crédito</option><option>Factoring</option>
                      </select>
                      {e.perdidaFact > 0 && <div style={{ color: C.rojo, fontSize: 11 }}>pérdida {clp(e.perdidaFact)}</div>}
                    </td>
                    <td style={{ padding: '7px 8px' }}>
                      <select value={e.estado} onChange={ev => updEdp(i, { estado: ev.target.value })}
                        style={{ border: 'none', background: e.estado === 'Pagado' ? '#E7F2EA' : e.estado === 'Factoring' ? '#F9E9DE' : '#F6E0DA', color: e.estado === 'Pagado' ? C.verde : e.estado === 'Factoring' ? C.ambar : C.rojo, padding: '3px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        <option>Pendiente</option><option>Pagado</option><option>Factoring</option>
                      </select>
                    </td>
                    <td style={{ padding: '7px 4px', textAlign: 'right' }}><button onClick={() => window.confirm(`¿Eliminar ${e.edp} (${clp(e.venta)})?`) && onUpdate(p.id, { edps: p.edps.filter((_, j) => j !== i) })} style={btnMini}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
                {(p.edps || []).length === 0 && <tr><td colSpan={6} style={{ padding: 12, color: '#9AA0A6', textAlign: 'center' }}>Sin ventas registradas.</td></tr>}
              </tbody>
            </table>
          </div>
          {addEdp && <FormEdp params={params} onAdd={e => { onUpdate(p.id, { edps: [...(p.edps || []), e] }); setAddEdp(false) }} onCancel={() => setAddEdp(false)} />}

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
                      <td style={{ padding: '5px 8px' }}><select value={c.cc || CC_DEFS[0].id} onChange={ev => updCompra(i, { cc: ev.target.value })} style={{ ...inp, padding: '5px 7px' }}>{CC_DEFS.map(cc => <option key={cc.id} value={cc.id}>{cc.id} · {nombreCC(p, cc.id)}</option>)}</select></td>
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
            <span>Pérdida factoring: <b style={{ color: perdidaFact > 0 ? C.rojo : C.gris }}>{clp(perdidaFact)}</b></span>
            <span>UT est.: <b style={{ color: colorUT(pctUtEst) }}>{clp(utEst)} ({pctUtEst.toFixed(1)}%)</b></span>
            <span>UT real: <b style={{ color: colorUT(pctUtReal) }}>{clp(utReal)} ({pctUtReal.toFixed(1)}%)</b></span>
          </div>
          <div style={{ marginTop: 14, textAlign: 'right' }}>
            <button onClick={() => window.confirm(`¿Eliminar el proyecto "${p.nombre}" completo?`) && onDelete(p.id)} style={{ background: 'none', border: `1px solid ${C.rojo}`, color: C.rojo, padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Trash2 size={13} /> Eliminar proyecto</button>
          </div>
        </div>
      )}
    </div>
  )
}

function TileProyecto({ p, onOpen, onDragStart, onDropOn }) {
  const venta = ventaDe(p), fact = facturadoDe(p)
  const activa = (p.avance || 0) < 100
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
function Consolidado({ proyectos }) {
  const periodos = useMemo(() => {
    const g = {}; proyectos.forEach(p => { (g[p.periodo || '—'] = g[p.periodo || '—'] || []).push(p) }); return Object.entries(g)
  }, [proyectos])
  const celda = (v, alignRight = true, bold = false, color) => <td style={{ padding: '6px 8px', textAlign: alignRight ? 'right' : 'left', fontWeight: bold ? 600 : 400, color, whiteSpace: 'nowrap' }}>{v}</td>

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 12, overflowX: 'auto' }}>
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
              const venta = ventaDe(p), fact = facturadoDe(p), porFac = porFacturarDe(p), costoEst = costoEstDe(p), costoReal = comprasDe(p), perdFact = perdidaFactDe(p)
              sub.venta += venta; sub.fact += fact; sub.porFac += porFac; sub.costoEst += costoEst; sub.costoReal += costoReal; sub.perdFact += perdFact
              const ut = venta - costoEst, p2 = pct(ut, venta)
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
                  {celda(p.ot || '—', false, true)}
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

  const totVenta = proyectos.reduce((a, p) => a + ventaDe(p), 0)
  const totFact = proyectos.reduce((a, p) => a + facturadoDe(p), 0)
  const totPorFac = proyectos.reduce((a, p) => a + porFacturarDe(p), 0)
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
        {[['tarjetas', 'Tarjetas', LayoutGrid], ...(verCotizadorProy ? [['cotizarProy', 'Cotización Proyecto', Receipt], ['comprasSII', 'Compras SII', ShoppingCart]] : []), ['consolidado', 'Consolidado', Table2], ['facturas', 'Facturas', Receipt], ...(verCotizadorProy ? [['parametros', 'Parámetros Proyectos', Target]] : [])].map(([id, lbl, Icon]) => (
          <button key={id} onClick={() => setVista(id)} style={{ background: vista === id ? C.carbon : '#fff', color: vista === id ? '#fff' : C.carbon, border: '1px solid #CBD2D6', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontFamily: "'Oswald',sans-serif", fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}><Icon size={14} />{lbl}</button>
        ))}
        {!creando && vista === 'tarjetas' && (
          <button onClick={() => setCreando(true)} style={{ background: C.azul, color: '#fff', border: 'none', padding: '7px 16px', cursor: 'pointer', fontSize: 12.5, fontFamily: "'Oswald',sans-serif", fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}><Plus size={15} /> Nueva OT</button>
        )}
      </div>

      {creando && <FormProyecto onAdd={p => { setProyectos(ps => [p, ...ps]); setCreando(false) }} onCancel={() => setCreando(false)} />}

      {(vista === 'cotizarProy' && verCotizadorProy) ? (
        <ProyCotizador clientes={clientesSugeridos} proyectos={proyectos} setProyectos={setProyectos} />
      ) : (vista === 'comprasSII' && verCotizadorProy) ? (
        <ProyComprasLibro proyectos={proyectos} setProyectos={setProyectos} />
      ) : vista === 'consolidado' ? (
        <Consolidado proyectos={proyectos} />
      ) : vista === 'facturas' ? (
        <FacturasModule area="Proyectos" facturas={facturas} setFacturas={setFacturas} params={params} comisionPct={comisionPct} setComisionPct={setComisionPct} ppmPct={ppmPct} setPpmPct={setPpmPct} clientesSugeridos={clientesSugeridos} />
      ) : (vista === 'parametros' && verCotizadorProy) ? (
        <ProyParametros />
      ) : (
        (<>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {proyectos.map(p => <TileProyecto key={p.id} p={p} onOpen={() => setSel(p.id)} onDragStart={() => { dragId.current = p.id }} onDropOn={() => { mover(dragId.current, p.id); dragId.current = null }} />)}
          </div>
          {(() => { const sp = proyectos.find(x => x.id === sel); return sp ? (
            <div onClick={() => setSel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,26,46,.55)', zIndex: 70, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 16px', overflowY: 'auto' }}>
              <div onClick={e => e.stopPropagation()} style={{ background: '#F7F6F3', width: '100%', maxWidth: 1000, boxShadow: '0 20px 60px -12px rgba(0,0,0,.4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #E2DED4', background: '#fff', position: 'sticky', top: 0, zIndex: 2 }}>
                  <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, textTransform: 'uppercase' }}>{sp.nombre}</span>
                  <button onClick={() => setSel(null)} style={{ background: 'none', border: '1px solid #CBD2D6', cursor: 'pointer', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}><X size={15} /> Cerrar</button>
                </div>
                <div style={{ padding: 12 }}>
                  <TarjetaProyecto p={sp} onUpdate={actualizar} onDelete={id => { eliminar(id); setSel(null) }} onAddCompra={agregarCompra} params={params} facturasProy={facturasProy} enModal />
                </div>
              </div>
            </div>
          ) : null })()}
        </>)
      )}

      <div style={{ fontSize: 12, color: '#9AA0A6', textAlign: 'center', marginTop: 8 }}>
        Los cambios se guardan automáticamente en la nube (Supabase) y quedan sincronizados en todos los dispositivos.
      </div>
    </div>
  )
}
