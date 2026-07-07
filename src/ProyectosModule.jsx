import React, { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, Target, Receipt, Hammer, ShoppingCart, Pencil, Plus, Trash2, X, AlertTriangle, LayoutGrid, Table2 } from 'lucide-react'
import { PROYECTOS, CC_DEFS } from './proyectos-data.js'

const C = { azul: '#1D1D1B', teal: '#A8501F', ambar: '#D2642F', rojo: '#B5432E', verde: '#3D7A4E', carbon: '#161616', gris: '#7A8288' }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const inp = { padding: '7px 9px', border: '1px solid #CBD2D6', fontSize: 13, boxSizing: 'border-box' }
const btnMini = { background: 'none', border: 'none', cursor: 'pointer', color: C.rojo, padding: 4 }
const nombreCC = id => (CC_DEFS.find(c => c.id === id)?.nombre) || id

// ---- Cálculos por proyecto ----
const facturadoDe = p => (p.edps || []).reduce((a, e) => a + e.venta, 0)
const cobradoDe = p => (p.edps || []).filter(e => e.estado === 'Pagado').reduce((a, e) => a + e.venta, 0)
const comprasDe = p => (p.compras || []).reduce((a, c) => a + c.monto, 0)
const ventaDe = p => (p.venta_cotizada != null && p.venta_cotizada > 0) ? p.venta_cotizada : facturadoDe(p)
const porFacturarDe = p => Math.max(0, ventaDe(p) - facturadoDe(p))
const consumoCC = (p, ccId) => (p.compras || []).filter(c => c.cc === ccId).reduce((a, c) => a + c.monto, 0)
const topeCC = (p, ccId) => (p.cc && p.cc[ccId]) || 0
const ccActivos = p => CC_DEFS.filter(cc => topeCC(p, cc.id) > 0 || consumoCC(p, cc.id) > 0)

function Barra({ pct, color, alto = 8 }) {
  return (
    <div style={{ height: alto, background: '#EEE9DF', width: '100%' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, transition: 'width .3s' }} />
    </div>
  )
}

// ---------- Form venta (EDP) ----------
function FormEdp({ onAdd, onCancel }) {
  const [f, setF] = useState({ nombre: '', fecha: '', venta: '', estado: 'Pendiente' })
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', background: '#F7F4EE', padding: 10, marginTop: 8, alignItems: 'center' }}>
      <input style={{ ...inp, width: 110 }} placeholder="EDP / Nº" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} />
      <input style={{ ...inp, width: 130 }} type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} />
      <input style={{ ...inp, width: 130 }} placeholder="Venta neta CLP" value={f.venta} onChange={e => setF({ ...f, venta: e.target.value })} />
      <select style={{ ...inp }} value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })}>
        <option>Pendiente</option><option>Pagado</option><option>Factoring</option>
      </select>
      <button onClick={() => f.nombre && num(f.venta) > 0 && onAdd({ edp: f.nombre, fecha: f.fecha || '—', venta: num(f.venta), estado: f.estado })}
        style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar</button>
      <button onClick={onCancel} style={{ ...btnMini, color: C.gris }}><X size={16} /></button>
    </div>
  )
}

// ---------- Form compra (con CC, folio, rut) ----------
function FormCompra({ onAdd, onCancel }) {
  const [f, setF] = useState({ proveedor: '', detalle: '', fecha: '', monto: '', cc: CC_DEFS[0].id, folio: '', rut: '' })
  return (
    <div style={{ background: '#F7F4EE', padding: 12, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...inp, width: 130 }} placeholder="Proveedor" value={f.proveedor} onChange={e => setF({ ...f, proveedor: e.target.value })} />
        <input style={{ ...inp, width: 100 }} placeholder="N° doc / folio" value={f.folio} onChange={e => setF({ ...f, folio: e.target.value })} />
        <input style={{ ...inp, width: 110 }} placeholder="RUT proveedor" value={f.rut} onChange={e => setF({ ...f, rut: e.target.value })} />
        <select style={{ ...inp }} value={f.cc} onChange={e => setF({ ...f, cc: e.target.value })}>
          {CC_DEFS.map(cc => <option key={cc.id} value={cc.id}>{cc.id} · {cc.nombre}</option>)}
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

// ---------- Bloque de centros de costo ----------
function BloqueCC({ p, onUpdate }) {
  const [editando, setEditando] = useState(false)
  const [tmp, setTmp] = useState(() => ({ ...(p.cc || {}) }))
  const activos = ccActivos(p)

  function guardar() {
    const limpio = {}
    CC_DEFS.forEach(cc => { const v = num(tmp[cc.id]); if (v > 0) limpio[cc.id] = v })
    onUpdate(p.id, { cc: limpio }); setEditando(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: C.gris, display: 'flex', alignItems: 'center', gap: 5 }}><Target size={13} /> Centros de costo (presupuesto vs consumo)</span>
        {!editando && <button onClick={e => { e.stopPropagation(); setTmp({ ...(p.cc || {}) }); setEditando(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.teal, display: 'flex', alignItems: 'center', gap: 3, fontSize: 12 }}><Pencil size={12} /> Editar topes</button>}
      </div>
      {editando ? (
        <div onClick={e => e.stopPropagation()} style={{ background: '#FAF7F3', padding: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 6 }}>
            {CC_DEFS.map(cc => (
              <label key={cc.id} style={{ fontSize: 11, color: C.gris }}>{cc.id} · {cc.nombre}
                <input value={tmp[cc.id] ?? ''} onChange={e => setTmp({ ...tmp, [cc.id]: e.target.value })} placeholder="Tope CLP" style={{ ...inp, width: '100%' }} />
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={guardar} style={{ background: C.azul, color: '#fff', border: 'none', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>Guardar topes</button>
            <button onClick={() => setEditando(false)} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
          </div>
        </div>
      ) : activos.length === 0 ? (
        <div style={{ fontSize: 12, color: C.ambar, background: '#F9E9DE', padding: '6px 10px' }}>Sin presupuesto por CC — usa "Editar topes".</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activos.map(cc => {
            const tope = topeCC(p, cc.id), cons = consumoCC(p, cc.id)
            const pct = tope > 0 ? (cons / tope) * 100 : (cons > 0 ? 100 : 0)
            const col = pct >= 100 ? C.rojo : pct >= 80 ? C.ambar : C.verde
            return (
              <div key={cc.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                  <span><b>{cc.id}</b> {cc.nombre}</span>
                  <span style={{ color: C.gris }}>{clp(cons)} / {clp(tope)} · saldo <b style={{ color: col }}>{clp(tope - cons)}</b></span>
                </div>
                <Barra pct={pct} color={col} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TarjetaProyecto({ p, onUpdate, onDelete, onAddCompra }) {
  const [abierto, setAbierto] = useState(false)
  const [addEdp, setAddEdp] = useState(false)
  const [addCompra, setAddCompra] = useState(false)

  const facturado = facturadoDe(p), cobrado = cobradoDe(p), pendiente = facturado - cobrado
  const venta = ventaDe(p), porFacturar = porFacturarDe(p)
  const totCompras = comprasDe(p), margen = venta - totCompras
  const pctMargen = venta > 0 ? (margen / venta) * 100 : 0
  const pctFact = venta > 0 ? (facturado / venta) * 100 : 0

  const alertasCC = ccActivos(p).map(cc => {
    const tope = topeCC(p, cc.id), cons = consumoCC(p, cc.id)
    const pct = tope > 0 ? (cons / tope) * 100 : 0
    return { cc, pct, sobre: cons - tope }
  }).filter(a => a.pct >= 80)

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', marginBottom: 14 }}>
      <div onClick={() => setAbierto(!abierto)} style={{ padding: '16px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, color: C.carbon }}>{p.nombre}</div>
          <div style={{ fontSize: 12, color: C.gris, marginTop: 2 }}>{p.cliente}{p.m2 ? ` · ${p.m2} m²` : ''}{p.periodo ? ` · ${p.periodo}` : ''}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Venta cotizada</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 16 }}>{clp(venta)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Por facturar</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 16, color: porFacturar > 0 ? C.ambar : C.verde }}>{clp(porFacturar)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>UT real</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 16, color: pctMargen >= 30 ? C.verde : pctMargen >= 15 ? C.ambar : C.rojo }}>{pctMargen.toFixed(0)}%</div>
          </div>
          {abierto ? <ChevronUp size={18} color={C.gris} /> : <ChevronDown size={18} color={C.gris} />}
        </div>
      </div>

      {alertasCC.length > 0 && (
        <div style={{ margin: '0 18px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {alertasCC.map(a => (
            <span key={a.cc.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, padding: '3px 8px', background: a.pct >= 100 ? '#F6E0DA' : '#F9E9DE', color: a.pct >= 100 ? C.rojo : '#8C4519' }}>
              <AlertTriangle size={12} /> {a.cc.id} {a.cc.nombre}: {a.pct.toFixed(0)}%{a.pct >= 100 ? ` · sobre tope ${clp(a.sobre)}` : ' · cerca del tope'}
            </span>
          ))}
        </div>
      )}

      <div style={{ padding: '0 18px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: C.gris, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}><Receipt size={13} /> Facturado vs venta cotizada</div>
          <Barra pct={pctFact} color={pctFact > 100 ? C.rojo : C.teal} />
          <div style={{ fontSize: 12, marginTop: 4, color: C.gris }}>{clp(facturado)} de {clp(venta)}{porFacturar > 0 && <span style={{ color: C.ambar }}> · por facturar {clp(porFacturar)}</span>}</div>
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
          <Barra pct={facturado > 0 ? (cobrado / facturado) * 100 : 0} color={C.verde} />
          <div style={{ fontSize: 12, marginTop: 4, color: C.gris }}>{clp(cobrado)} cobrado{pendiente > 0 && <span style={{ color: C.rojo }}> · {clp(pendiente)} por cobrar</span>}</div>
        </div>
      </div>

      {abierto && (
        <div style={{ borderTop: '1px solid #EEE9DF', padding: 18 }}>
          {/* VENTAS / EDP */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: C.gris }}>Ventas · Estados de pago (EDP)</span>
            <button onClick={() => setAddEdp(true)} style={{ background: C.azul, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Agregar venta</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['EDP', 'Fecha', 'Venta neta', 'Estado', ''].map((h, i) => <th key={i} style={{ textAlign: h === 'Venta neta' ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>
                {(p.edps || []).map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #EEE9DF' }}>
                    <td style={{ padding: '7px 8px', fontWeight: 500 }}>{e.edp}</td>
                    <td style={{ padding: '7px 8px', color: C.gris }}>{e.fecha}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right' }}>{clp(e.venta)}</td>
                    <td style={{ padding: '7px 8px' }}>
                      <select value={e.estado} onChange={ev => onUpdate(p.id, { edps: p.edps.map((x, j) => j === i ? { ...x, estado: ev.target.value } : x) })}
                        style={{ border: 'none', background: e.estado === 'Pagado' ? '#E7F2EA' : e.estado === 'Factoring' ? '#F9E9DE' : '#F6E0DA', color: e.estado === 'Pagado' ? C.verde : e.estado === 'Factoring' ? C.ambar : C.rojo, padding: '3px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        <option>Pendiente</option><option>Pagado</option><option>Factoring</option>
                      </select>
                    </td>
                    <td style={{ padding: '7px 4px', textAlign: 'right' }}><button onClick={() => window.confirm(`¿Eliminar ${e.edp} (${clp(e.venta)})?`) && onUpdate(p.id, { edps: p.edps.filter((_, j) => j !== i) })} style={btnMini}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
                {(p.edps || []).length === 0 && <tr><td colSpan={5} style={{ padding: 12, color: '#9AA0A6', textAlign: 'center' }}>Sin ventas registradas.</td></tr>}
              </tbody>
            </table>
          </div>
          {addEdp && <FormEdp onAdd={e => { onUpdate(p.id, { edps: [...(p.edps || []), e] }); setAddEdp(false) }} onCancel={() => setAddEdp(false)} />}

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
                      <td style={{ padding: '7px 8px' }}><span style={{ background: '#EEF1F0', padding: '2px 6px', fontSize: 12, fontWeight: 600 }}>{c.cc || '—'}</span></td>
                      <td style={{ padding: '7px 8px', fontWeight: 500 }}>{c.proveedor}</td>
                      <td style={{ padding: '7px 8px', color: C.gris }}>{c.folio || '—'}</td>
                      <td style={{ padding: '7px 8px', color: C.gris }}>{c.detalle || '—'}</td>
                      <td style={{ padding: '7px 8px', color: C.gris }}>{c.fecha}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right' }}>{clp(c.monto)}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'right' }}><button onClick={() => window.confirm(`¿Eliminar compra de ${c.proveedor} (${clp(c.monto)})?`) && onUpdate(p.id, { compras: p.compras.filter((_, j) => j !== i) })} style={btnMini}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {addCompra && <FormCompra onAdd={c => { if (onAddCompra(p.id, c)) setAddCompra(false) }} onCancel={() => setAddCompra(false)} />}

          {/* Resumen */}
          <div style={{ marginTop: 16, padding: '10px 14px', background: '#F7F4EE', fontSize: 13, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <span>Venta cotizada: <b>{clp(venta)}</b></span>
            <span>Facturado: <b>{clp(facturado)}</b></span>
            <span>Por facturar: <b style={{ color: porFacturar > 0 ? C.ambar : C.verde }}>{clp(porFacturar)}</b></span>
            <span>Costo real (compras): <b>{clp(totCompras)}</b></span>
            <span>UT real: <b style={{ color: pctMargen >= 30 ? C.verde : pctMargen >= 15 ? C.ambar : C.rojo }}>{clp(margen)} ({pctMargen.toFixed(1)}%)</b></span>
          </div>
          <div style={{ marginTop: 14, textAlign: 'right' }}>
            <button onClick={() => window.confirm(`¿Eliminar el proyecto "${p.nombre}" completo?`) && onDelete(p.id)} style={{ background: 'none', border: `1px solid ${C.rojo}`, color: C.rojo, padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Trash2 size={13} /> Eliminar proyecto</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Form nuevo proyecto (OT) ----------
function FormProyecto({ onAdd, onCancel }) {
  const [f, setF] = useState({ ot: '', cliente: '', m2: '', periodo: 'T1', venta: '' })
  const [cc, setCc] = useState({})
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
      <div style={{ fontSize: 12, color: C.gris, margin: '12px 0 6px' }}>Presupuesto (tope) por centro de costo:</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 6 }}>
        {CC_DEFS.map(c => (
          <label key={c.id} style={{ fontSize: 11, color: C.gris }}>{c.id} · {c.nombre}
            <input value={cc[c.id] ?? ''} onChange={e => setCc({ ...cc, [c.id]: e.target.value })} placeholder="Tope CLP" style={{ ...inp, width: '100%' }} />
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => {
          if (!f.ot || !f.cliente || num(f.venta) <= 0) return
          const ccLimpio = {}; CC_DEFS.forEach(c => { const v = num(cc[c.id]); if (v > 0) ccLimpio[c.id] = v })
          onAdd({ id: 'ot-' + Date.now(), ot: f.ot, periodo: f.periodo || 'T1', nombre: `OT ${f.ot} · ${f.cliente}`, cliente: f.cliente, m2: num(f.m2) || null, oc: f.ot, venta_cotizada: num(f.venta), avance: 0, cc: ccLimpio, edps: [], compras: [] })
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
          {['OT', 'Cliente', 'Venta', 'Facturado', 'Por facturar', 'Costo real', 'UT', '%', ...CC_DEFS.map(c => c.id)].map((h, i) => (
            <th key={i} style={{ textAlign: i < 2 ? 'left' : 'right', padding: '6px 8px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {periodos.map(([per, ps]) => {
            const sub = { venta: 0, fact: 0, porFac: 0, costo: 0 }
            const filas = ps.map(p => {
              const venta = ventaDe(p), fact = facturadoDe(p), porFac = porFacturarDe(p), costo = comprasDe(p)
              sub.venta += venta; sub.fact += fact; sub.porFac += porFac; sub.costo += costo
              const ut = venta - costo, pct = venta > 0 ? (ut / venta) * 100 : 0
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
                  {celda(p.ot || '—', false, true)}
                  {celda(p.cliente, false, false, C.gris)}
                  {celda(clp(venta))}
                  {celda(clp(fact))}
                  {celda(clp(porFac), true, false, porFac > 0 ? C.ambar : C.gris)}
                  {celda(clp(costo))}
                  {celda(clp(ut), true, true)}
                  {celda(pct.toFixed(0) + '%', true, false, pct >= 30 ? C.verde : pct >= 15 ? C.ambar : C.rojo)}
                  {CC_DEFS.map(c => celda(consumoCC(p, c.id) ? clp(consumoCC(p, c.id)) : '—', true, false, C.gris))}
                </tr>
              )
            })
            return (
              <React.Fragment key={per}>
                <tr style={{ background: '#F7F4EE' }}><td colSpan={8 + CC_DEFS.length} style={{ padding: '5px 8px', fontWeight: 600, fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', fontSize: 12 }}>{per}</td></tr>
                {filas}
                <tr style={{ borderTop: `2px solid ${C.carbon}`, borderBottom: `2px solid ${C.carbon}` }}>
                  {celda('COT', false, true)}{celda('', false)}
                  {celda(clp(sub.venta), true, true)}{celda(clp(sub.fact), true, true)}{celda(clp(sub.porFac), true, true, C.ambar)}{celda(clp(sub.costo), true, true)}
                  {celda(clp(sub.venta - sub.costo), true, true)}
                  {celda(sub.venta > 0 ? (((sub.venta - sub.costo) / sub.venta) * 100).toFixed(0) + '%' : '—', true, true)}
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

export default function ProyectosModule({ proyectos: proyExt, setProyectos: setProyExt }) {
  const [proyInt, setProyInt] = useState(PROYECTOS)
  const proyectos = proyExt ?? proyInt
  const setProyectos = setProyExt ?? setProyInt
  const [creando, setCreando] = useState(false)
  const [vista, setVista] = useState('tarjetas')

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
  const totCompras = proyectos.reduce((a, p) => a + comprasDe(p), 0)
  const margen = totVenta - totCompras
  const kpi = (label, valor, color) => (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 14, flex: '1 1 150px' }}>
      <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 600, color: color || C.carbon, whiteSpace: 'nowrap' }}>{valor}</div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {kpi('Proyectos / OT', proyectos.length)}
        {kpi('Venta cotizada', clp(totVenta))}
        {kpi('Facturado', clp(totFact))}
        {kpi('Por facturar', clp(totPorFac), C.ambar)}
        {kpi('Costo real', clp(totCompras))}
        {kpi('Margen global', totVenta > 0 ? ((margen / totVenta) * 100).toFixed(0) + '%' : '0%', C.verde)}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['tarjetas', 'Tarjetas', LayoutGrid], ['consolidado', 'Consolidado', Table2]].map(([id, lbl, Icon]) => (
          <button key={id} onClick={() => setVista(id)} style={{ background: vista === id ? C.carbon : '#fff', color: vista === id ? '#fff' : C.carbon, border: '1px solid #CBD2D6', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontFamily: "'Oswald',sans-serif", fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}><Icon size={14} />{lbl}</button>
        ))}
        {!creando && vista === 'tarjetas' && (
          <button onClick={() => setCreando(true)} style={{ background: C.azul, color: '#fff', border: 'none', padding: '7px 16px', cursor: 'pointer', fontSize: 12.5, fontFamily: "'Oswald',sans-serif", fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}><Plus size={15} /> Nueva OT</button>
        )}
      </div>

      {creando && <FormProyecto onAdd={p => { setProyectos(ps => [p, ...ps]); setCreando(false) }} onCancel={() => setCreando(false)} />}

      {vista === 'consolidado' ? (
        <Consolidado proyectos={proyectos} />
      ) : (
        proyectos.map(p => <TarjetaProyecto key={p.id} p={p} onUpdate={actualizar} onDelete={eliminar} onAddCompra={agregarCompra} />)
      )}

      <div style={{ fontSize: 12, color: '#9AA0A6', textAlign: 'center', marginTop: 8 }}>
        Vista de prueba: los cambios se pierden al recargar. En la versión con base de datos todo queda guardado y sincronizado.
      </div>
    </div>
  )
}
