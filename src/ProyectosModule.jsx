import React, { useState } from 'react'
import { ChevronDown, ChevronUp, Target, Receipt, Hammer, ShoppingCart, Pencil, Plus, Trash2, X } from 'lucide-react'
import { PROYECTOS } from './proyectos-data.js'

const C = { azul: '#1D1D1B', teal: '#A8501F', ambar: '#D2642F', rojo: '#B5432E', verde: '#3D7A4E', carbon: '#161616' }
const clp = n => '$' + Math.round(n).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }

const inp = { padding: '7px 9px', border: '1px solid #CBD2D6', fontSize: 13, boxSizing: 'border-box' }
const btnMini = { background: 'none', border: 'none', cursor: 'pointer', color: C.rojo, padding: 4 }

function Barra({ pct, color, alto = 8 }) {
  return (
    <div style={{ height: alto, background: '#EEE9DF', width: '100%' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, transition: 'width .3s' }} />
    </div>
  )
}

// ---------- Formulario inline para agregar EDP (venta) ----------
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
      <button onClick={onCancel} style={{ ...btnMini, color: '#7A8288' }}><X size={16} /></button>
    </div>
  )
}

// ---------- Formulario inline para agregar compra ----------
function FormCompra({ onAdd, onCancel }) {
  const [f, setF] = useState({ proveedor: '', detalle: '', fecha: '', monto: '' })
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', background: '#F7F4EE', padding: 10, marginTop: 8, alignItems: 'center' }}>
      <input style={{ ...inp, width: 130 }} placeholder="Proveedor" value={f.proveedor} onChange={e => setF({ ...f, proveedor: e.target.value })} />
      <input style={{ ...inp, width: 150 }} placeholder="Detalle (opcional)" value={f.detalle} onChange={e => setF({ ...f, detalle: e.target.value })} />
      <input style={{ ...inp, width: 130 }} type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} />
      <input style={{ ...inp, width: 130 }} placeholder="Monto neto CLP" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} />
      <button onClick={() => f.proveedor && num(f.monto) > 0 && onAdd({ proveedor: f.proveedor, detalle: f.detalle, fecha: f.fecha || '—', monto: num(f.monto) })}
        style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar</button>
      <button onClick={onCancel} style={{ ...btnMini, color: '#7A8288' }}><X size={16} /></button>
    </div>
  )
}

function TarjetaProyecto({ p, onUpdate, onDelete }) {
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState(false)
  const [presuTmp, setPresuTmp] = useState(p.presupuesto ?? '')
  const [addEdp, setAddEdp] = useState(false)
  const [addCompra, setAddCompra] = useState(false)

  const facturado = p.edps.reduce((a, e) => a + e.venta, 0)
  const cobrado = p.edps.filter(e => e.estado === 'Pagado').reduce((a, e) => a + e.venta, 0)
  const pendiente = facturado - cobrado
  const totCompras = p.compras.reduce((a, c) => a + c.monto, 0)
  const margenReal = facturado - totCompras
  const pctMargen = facturado > 0 ? (margenReal / facturado) * 100 : 0

  const tienePresu = p.presupuesto != null && p.presupuesto > 0
  const pctFacturadoVsPresu = tienePresu ? (facturado / p.presupuesto) * 100 : null
  const desvio = tienePresu ? facturado - p.presupuesto : null

  function guardarPresu() {
    const v = num(presuTmp)
    onUpdate(p.id, { presupuesto: v > 0 ? v : null })
    setEditando(false)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', marginBottom: 14 }}>
      <div onClick={() => setAbierto(!abierto)} style={{ padding: '16px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, color: C.carbon }}>{p.nombre}</div>
          <div style={{ fontSize: 12, color: '#7A8288', marginTop: 2 }}>{p.cliente} · {p.oc}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>Facturado</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 17 }}>{clp(facturado)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>Margen real</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 17, color: pctMargen >= 30 ? C.verde : pctMargen >= 15 ? C.ambar : C.rojo }}>
              {pctMargen.toFixed(0)}%
            </div>
          </div>
          {abierto ? <ChevronUp size={18} color="#7A8288" /> : <ChevronDown size={18} color="#7A8288" />}
        </div>
      </div>

      <div style={{ padding: '0 18px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: '#7A8288', display: 'flex', alignItems: 'center', gap: 5 }}><Target size={13} /> Facturado vs presupuesto</span>
            {!editando && (
              <button onClick={e => { e.stopPropagation(); setEditando(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.teal, display: 'flex', alignItems: 'center', gap: 3, fontSize: 12 }}>
                <Pencil size={12} /> {tienePresu ? 'Editar' : 'Definir'}
              </button>
            )}
          </div>
          {editando ? (
            <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
              <input value={presuTmp} onChange={e => setPresuTmp(e.target.value)} placeholder="Monto presupuestado CLP" style={{ ...inp, flex: 1 }} />
              <button onClick={guardarPresu} style={{ background: C.azul, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>OK</button>
            </div>
          ) : tienePresu ? (
            <>
              <Barra pct={pctFacturadoVsPresu} color={pctFacturadoVsPresu > 100 ? C.rojo : C.teal} />
              <div style={{ fontSize: 12, marginTop: 4, color: '#7A8288' }}>
                {pctFacturadoVsPresu.toFixed(0)}% de {clp(p.presupuesto)}
                {desvio > 0 && <span style={{ color: C.rojo }}> · sobre presupuesto {clp(desvio)}</span>}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: C.ambar, background: '#F9E9DE', padding: '6px 10px' }}>Sin presupuesto definido</div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#7A8288', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Hammer size={13} /> Avance físico
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}><Barra pct={p.avance} color={C.azul} /></div>
            <input type="number" min="0" max="100" value={p.avance}
              onClick={e => e.stopPropagation()}
              onChange={e => onUpdate(p.id, { avance: Math.min(100, Math.max(0, +e.target.value)) })}
              style={{ ...inp, width: 52, textAlign: 'right' }} />
            <span style={{ fontSize: 12, color: '#7A8288' }}>%</span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#7A8288', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Receipt size={13} /> Cobrado vs facturado
          </div>
          <Barra pct={facturado > 0 ? (cobrado / facturado) * 100 : 0} color={C.verde} />
          <div style={{ fontSize: 12, marginTop: 4, color: '#7A8288' }}>
            {clp(cobrado)} cobrado{pendiente > 0 && <span style={{ color: C.rojo }}> · {clp(pendiente)} por cobrar</span>}
          </div>
        </div>
      </div>

      {abierto && (
        <div style={{ borderTop: '1px solid #EEE9DF', padding: 18 }}>
          {/* VENTAS / EDP */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#7A8288' }}>Ventas · Estados de pago (EDP)</span>
            <button onClick={() => setAddEdp(true)} style={{ background: C.azul, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Plus size={13} /> Agregar venta
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                  {['EDP', 'Fecha', 'Venta neta', 'Estado', ''].map((h, i) => (
                    <th key={i} style={{ textAlign: h === 'Venta neta' ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.edps.map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #EEE9DF' }}>
                    <td style={{ padding: '7px 8px', fontWeight: 500 }}>{e.edp}</td>
                    <td style={{ padding: '7px 8px', color: '#7A8288' }}>{e.fecha}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right' }}>{clp(e.venta)}</td>
                    <td style={{ padding: '7px 8px' }}>
                      <select value={e.estado}
                        onChange={ev => onUpdate(p.id, { edps: p.edps.map((x, j) => j === i ? { ...x, estado: ev.target.value } : x) })}
                        style={{ border: 'none', background: e.estado === 'Pagado' ? '#E7F2EA' : e.estado === 'Factoring' ? '#F9E9DE' : '#F6E0DA', color: e.estado === 'Pagado' ? C.verde : e.estado === 'Factoring' ? C.ambar : C.rojo, padding: '3px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        <option>Pendiente</option><option>Pagado</option><option>Factoring</option>
                      </select>
                    </td>
                    <td style={{ padding: '7px 4px', textAlign: 'right' }}>
                      <button onClick={() => window.confirm(`¿Eliminar ${e.edp} (${clp(e.venta)})?`) && onUpdate(p.id, { edps: p.edps.filter((_, j) => j !== i) })} style={btnMini} title="Eliminar venta">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {p.edps.length === 0 && <tr><td colSpan={5} style={{ padding: 12, color: '#9AA0A6', textAlign: 'center' }}>Sin ventas registradas.</td></tr>}
              </tbody>
            </table>
          </div>
          {addEdp && <FormEdp onAdd={e => { onUpdate(p.id, { edps: [...p.edps, e] }); setAddEdp(false) }} onCancel={() => setAddEdp(false)} />}

          {/* COMPRAS */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '18px 0 8px' }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#7A8288', display: 'flex', alignItems: 'center', gap: 5 }}>
              <ShoppingCart size={13} /> Compras imputadas
            </span>
            <button onClick={() => setAddCompra(true)} style={{ background: C.teal, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Plus size={13} /> Agregar compra
            </button>
          </div>
          {p.compras.length === 0 ? (
            <div style={{ fontSize: 13, color: '#7A8288' }}>Sin compras imputadas — el margen no descuenta costos directos aún.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                    {['Proveedor', 'Detalle', 'Fecha', 'Monto neto', ''].map((h, i) => (
                      <th key={i} style={{ textAlign: h === 'Monto neto' ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {p.compras.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #EEE9DF' }}>
                      <td style={{ padding: '7px 8px', fontWeight: 500 }}>{c.proveedor}</td>
                      <td style={{ padding: '7px 8px', color: '#7A8288' }}>{c.detalle || '—'}</td>
                      <td style={{ padding: '7px 8px', color: '#7A8288' }}>{c.fecha}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right' }}>{clp(c.monto)}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'right' }}>
                        <button onClick={() => window.confirm(`¿Eliminar compra de ${c.proveedor} (${clp(c.monto)})?`) && onUpdate(p.id, { compras: p.compras.filter((_, j) => j !== i) })} style={btnMini} title="Eliminar compra">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {addCompra && <FormCompra onAdd={c => { onUpdate(p.id, { compras: [...p.compras, c] }); setAddCompra(false) }} onCancel={() => setAddCompra(false)} />}

          {/* Resumen margen */}
          <div style={{ marginTop: 16, padding: '10px 14px', background: '#F7F4EE', fontSize: 13, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <span>Facturado: <b>{clp(facturado)}</b></span>
            <span>Compras: <b>{clp(totCompras)}</b></span>
            <span>Margen real: <b style={{ color: pctMargen >= 30 ? C.verde : pctMargen >= 15 ? C.ambar : C.rojo }}>{clp(margenReal)} ({pctMargen.toFixed(1)}%)</b></span>
          </div>

          <div style={{ marginTop: 14, textAlign: 'right' }}>
            <button onClick={() => window.confirm(`¿Eliminar el proyecto "${p.nombre}" completo? Esta acción no se puede deshacer.`) && onDelete(p.id)}
              style={{ background: 'none', border: `1px solid ${C.rojo}`, color: C.rojo, padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Trash2 size={13} /> Eliminar proyecto
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Formulario nuevo proyecto ----------
function FormProyecto({ onAdd, onCancel }) {
  const [f, setF] = useState({ nombre: '', cliente: '', oc: '', presupuesto: '' })
  return (
    <div style={{ background: '#fff', border: `2px solid ${C.azul}`, padding: 16, marginBottom: 14 }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Nuevo proyecto</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input style={{ ...inp, flex: '1 1 200px' }} placeholder="Nombre del proyecto" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} />
        <input style={{ ...inp, flex: '1 1 200px' }} placeholder="Cliente" value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} />
        <input style={{ ...inp, width: 140 }} placeholder="OC / referencia" value={f.oc} onChange={e => setF({ ...f, oc: e.target.value })} />
        <input style={{ ...inp, width: 170 }} placeholder="Presupuesto CLP (opcional)" value={f.presupuesto} onChange={e => setF({ ...f, presupuesto: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => f.nombre && f.cliente && onAdd({
          id: 'p' + Date.now(), nombre: f.nombre, cliente: f.cliente, oc: f.oc || '—',
          presupuesto: num(f.presupuesto) > 0 ? num(f.presupuesto) : null, avance: 0, edps: [], compras: [],
        })} style={{ background: C.verde, color: '#fff', border: 'none', padding: '8px 18px', cursor: 'pointer', fontSize: 13 }}>Crear proyecto</button>
        <button onClick={onCancel} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
      </div>
    </div>
  )
}

export default function ProyectosModule({ proyectos: proyExt, setProyectos: setProyExt }) {
  const [proyInt, setProyInt] = useState(PROYECTOS)
  const proyectos = proyExt ?? proyInt
  const setProyectos = setProyExt ?? setProyInt
  const [creando, setCreando] = useState(false)

  const actualizar = (id, cambios) => setProyectos(ps => ps.map(p => p.id === id ? { ...p, ...cambios } : p))
  const eliminar = id => setProyectos(ps => ps.filter(p => p.id !== id))

  const totFact = proyectos.reduce((a, p) => a + p.edps.reduce((x, e) => x + e.venta, 0), 0)
  const totCompras = proyectos.reduce((a, p) => a + p.compras.reduce((x, c) => x + c.monto, 0), 0)
  const margen = totFact - totCompras

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 14, flex: '1 1 150px' }}>
          <div style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>Proyectos</div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 600 }}>{proyectos.length}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 14, flex: '1 1 150px' }}>
          <div style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>Facturado total</div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 600 }}>{clp(totFact)}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 14, flex: '1 1 150px' }}>
          <div style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>Compras imputadas</div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 600 }}>{clp(totCompras)}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 14, flex: '1 1 150px' }}>
          <div style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>Margen global</div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 600, color: C.verde }}>{totFact > 0 ? ((margen / totFact) * 100).toFixed(0) : 0}%</div>
        </div>
      </div>

      {!creando && (
        <button onClick={() => setCreando(true)}
          style={{ background: C.azul, color: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <Plus size={15} /> Nuevo proyecto
        </button>
      )}
      {creando && <FormProyecto onAdd={p => { setProyectos(ps => [p, ...ps]); setCreando(false) }} onCancel={() => setCreando(false)} />}

      {proyectos.map(p => <TarjetaProyecto key={p.id} p={p} onUpdate={actualizar} onDelete={eliminar} />)}

      <div style={{ fontSize: 12, color: '#9AA0A6', textAlign: 'center', marginTop: 8 }}>
        Vista de prueba: los cambios se pierden al recargar. En la versión con base de datos todo queda guardado y sincronizado entre usuarios.
      </div>
    </div>
  )
}
