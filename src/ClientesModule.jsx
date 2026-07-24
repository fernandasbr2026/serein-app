import React, { useState, useMemo } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Building2, Phone, Mail, User } from 'lucide-react'

// ============================================================
// MÓDULO: Clientes — ficha de cliente + sus OT agrupadas
// Las OT se leen de Gestión Proyectos (proyectos) y de las
// Órdenes de Trabajo (ots), agrupadas por nombre de cliente.
// Versión en memoria.
// ============================================================

import { pullState, pushState } from './sync.js'
import { SEREIN } from './theme-serein.js'
// Paleta reskineada a la identidad Serein 2026 — mismas claves, solo cambian los valores hex.
const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const inp = { padding: '7px 9px', border: '1px solid #DFE4EA', fontSize: 13, boxSizing: 'border-box' }
const norm = s => (s || '').toString().trim().toLowerCase()

export const CLIENTES_SEED = [
  { id: 'cl1', nombre: 'VIMAN', rut: '', contacto: '', telefono: '', correo: '', obs: '' },
  { id: 'cl2', nombre: 'DEALTEC CHILE SPA', rut: '', contacto: '', telefono: '', correo: '', obs: '' },
  { id: 'cl3', nombre: 'ESIGSA', rut: '', contacto: '', telefono: '', correo: '', obs: '' },
  { id: 'cl4', nombre: 'MAESTRANZA MYG', rut: '', contacto: '', telefono: '', correo: '', obs: '' },
  { id: 'cl5', nombre: 'PROASES', rut: '76.xxx.xxx-x', contacto: '', telefono: '', correo: '', obs: '' },
  { id: 'cl6', nombre: 'INNOVATEC', rut: '', contacto: '', telefono: '', correo: '', obs: '' },
  { id: 'cl7', nombre: 'CONSTRUCAPITAL', rut: '', contacto: '', telefono: '', correo: '', obs: '' },
  { id: 'cl8', nombre: 'TTM', rut: '', contacto: '', telefono: '', correo: '', obs: '' },
]

// Reúne las OT de un cliente desde proyectos y ordenes de trabajo
function otsDeCliente(nombre, proyectos, ots) {
  const n = norm(nombre)
  const match = c => norm(c).includes(n) || n.includes(norm(c))
  const desdeProy = (proyectos || []).filter(p => match(p.cliente)).map(p => ({
    origen: 'Proyecto', ot: p.ot || p.oc || '—', cliente: p.cliente,
    detalle: p.nombre, area: p.periodo || 'Proyectos',
    venta: (p.venta_cotizada != null && p.venta_cotizada > 0) ? p.venta_cotizada : (p.edps || []).reduce((a, e) => a + (e.venta || 0), 0),
  }))
  const desdeOT = (ots || []).filter(o => match(o.cliente)).map(o => ({
    origen: 'OT', ot: o.numero || '—', cliente: o.cliente,
    detalle: o.esquema || o.preparacion || '—', area: o.area || '—',
    venta: (o.ventas || []).reduce((a, v) => a + (v.neta || 0), 0),
  }))
  return [...desdeProy, ...desdeOT]
}

function TarjetaCliente({ cli, proyectos, ots, onUpdate, onDelete }) {
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState(false)
  const [f, setF] = useState(cli)
  const otList = useMemo(() => otsDeCliente(cli.nombre, proyectos, ots), [cli.nombre, proyectos, ots])
  const totalVenta = otList.reduce((a, o) => a + o.venta, 0)

  function guardar() { onUpdate(cli.id, f); setEditando(false) }

  return (
    <div style={{ background: '#fff', border: '1px solid #DFE4EA', marginBottom: 12 }}>
      <div onClick={() => setAbierto(!abierto)} style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Building2 size={18} color={C.teal} />
          <div>
            <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15 }}>{cli.nombre}</div>
            <div style={{ fontSize: 12, color: C.gris }}>{cli.rut || 'sin RUT'} · {otList.length} OT</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Venta acumulada</div>
            <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 16 }}>{clp(totalVenta)}</div>
          </div>
          {abierto ? <ChevronUp size={18} color={C.gris} /> : <ChevronDown size={18} color={C.gris} />}
        </div>
      </div>

      {abierto && (
        <div style={{ borderTop: '1px solid #DFE4EA', padding: 18 }}>
          {/* Ficha */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: C.gris }}>Ficha del cliente</span>
            {!editando && <button onClick={() => { setF(cli); setEditando(true) }} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>Editar ficha</button>}
          </div>
          {editando ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px,1fr))', gap: 8 }}>
                <input style={inp} placeholder="Nombre" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} />
                <input style={inp} placeholder="RUT" value={f.rut} onChange={e => setF({ ...f, rut: e.target.value })} />
                <input style={inp} placeholder="Contacto" value={f.contacto} onChange={e => setF({ ...f, contacto: e.target.value })} />
                <input style={inp} placeholder="Teléfono" value={f.telefono} onChange={e => setF({ ...f, telefono: e.target.value })} />
                <input style={inp} placeholder="Correo" value={f.correo} onChange={e => setF({ ...f, correo: e.target.value })} />
              </div>
              <input style={{ ...inp, width: '100%', marginTop: 8 }} placeholder="Observaciones" value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} />
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={guardar} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Guardar</button>
                <button onClick={() => setEditando(false)} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, color: C.gris, marginBottom: 6 }}>
              <span><User size={12} style={{ verticalAlign: -1 }} /> {cli.contacto || '—'}</span>
              <span><Phone size={12} style={{ verticalAlign: -1 }} /> {cli.telefono || '—'}</span>
              <span><Mail size={12} style={{ verticalAlign: -1 }} /> {cli.correo || '—'}</span>
              {cli.obs && <span>{cli.obs}</span>}
            </div>
          )}

          {/* OT del cliente */}
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: C.gris, margin: '16px 0 8px' }}>Órdenes de Trabajo de este cliente</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['OT', 'Origen', 'Detalle', 'Área', 'Venta'].map((h, i) => <th key={i} style={{ textAlign: h === 'Venta' ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>
                {otList.map((o, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #DFE4EA' }}>
                    <td style={{ padding: '7px 8px', fontWeight: 600 }}>{o.ot}</td>
                    <td style={{ padding: '7px 8px', color: C.gris }}>{o.origen}</td>
                    <td style={{ padding: '7px 8px', color: C.gris }}>{o.detalle}</td>
                    <td style={{ padding: '7px 8px', color: C.gris }}>{o.area}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right' }}>{clp(o.venta)}</td>
                  </tr>
                ))}
                {otList.length === 0 && <tr><td colSpan={5} style={{ padding: 12, textAlign: 'center', color: '#9AA3AD' }}>Sin OT asociadas a este cliente.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 14, textAlign: 'right' }}>
            <button onClick={() => window.confirm(`¿Eliminar el cliente "${cli.nombre}"?`) && onDelete(cli.id)} style={{ background: 'none', border: `1px solid ${C.rojo}`, color: C.rojo, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}><Trash2 size={13} style={{ verticalAlign: -2 }} /> Eliminar cliente</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ClientesModule({ clientes: cExt, setClientes: setCExt, proyectos = [], ots = [] }) {
  const [cInt, setCInt] = useState(CLIENTES_SEED)
  const clientes = cExt ?? cInt
  const setClientes = setCExt ?? setCInt
  const [creando, setCreando] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: '', rut: '', contacto: '', telefono: '', correo: '', obs: '' })
  const [busca, setBusca] = useState('')

  const actualizar = (id, f) => {
    const nuevoLista = clientes.map(c => c.id === id ? { ...c, ...f } : c)
    try { localStorage.setItem('serein_clientes', JSON.stringify(nuevoLista)) } catch (e) {}
    setClientes(nuevoLista)
    pushState()
  }
  const eliminar = async id => {
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_clientes') || 'null') } catch (e) {}
    const base = Array.isArray(fresco) ? fresco : clientes
    const nuevoLista = base.filter(c => c.id !== id)
    try { localStorage.setItem('serein_clientes', JSON.stringify(nuevoLista)) } catch (e) {}
    setClientes(nuevoLista)
    pushState()
  }
  async function crear() {
    if (!nuevo.nombre) return
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_clientes') || 'null') } catch (e) {}
    const base = Array.isArray(fresco) ? fresco : clientes
    const nuevoLista = [{ id: 'cl' + Date.now(), ...nuevo }, ...base]
    try { localStorage.setItem('serein_clientes', JSON.stringify(nuevoLista)) } catch (e) {}
    setClientes(nuevoLista)
    pushState()
    setNuevo({ nombre: '', rut: '', contacto: '', telefono: '', correo: '', obs: '' })
    setCreando(false)
  }

  const lista = clientes.filter(c => norm(c.nombre).includes(norm(busca)))

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ background: '#fff', border: '1px solid #DFE4EA', padding: 14, flex: '1 1 150px' }}>
          <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Clientes</div>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontSize: 22, fontWeight: 600 }}>{clientes.length}</div>
        </div>
        <input style={{ ...inp, flex: '1 1 200px' }} placeholder="Buscar cliente…" value={busca} onChange={e => setBusca(e.target.value)} />
        {!creando && <button onClick={() => setCreando(true)} style={{ background: C.azul, color: '#fff', border: 'none', padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={15} /> Nuevo cliente</button>}
      </div>

      {creando && (
        <div style={{ background: '#fff', border: `2px solid ${C.azul}`, padding: 16, marginBottom: 14 }}>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Nuevo cliente</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px,1fr))', gap: 8 }}>
            <input style={inp} placeholder="Nombre *" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
            <input style={inp} placeholder="RUT" value={nuevo.rut} onChange={e => setNuevo({ ...nuevo, rut: e.target.value })} />
            <input style={inp} placeholder="Contacto" value={nuevo.contacto} onChange={e => setNuevo({ ...nuevo, contacto: e.target.value })} />
            <input style={inp} placeholder="Teléfono" value={nuevo.telefono} onChange={e => setNuevo({ ...nuevo, telefono: e.target.value })} />
            <input style={inp} placeholder="Correo" value={nuevo.correo} onChange={e => setNuevo({ ...nuevo, correo: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={crear} disabled={!nuevo.nombre} style={{ background: nuevo.nombre ? C.verde : '#DFE4EA', color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Crear cliente</button>
            <button onClick={() => setCreando(false)} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
          </div>
        </div>
      )}

      {lista.map(c => <TarjetaCliente key={c.id} cli={c} proyectos={proyectos} ots={ots} onUpdate={actualizar} onDelete={eliminar} />)}
      {lista.length === 0 && <div style={{ color: '#9AA3AD', fontSize: 13, textAlign: 'center', padding: 20 }}>Sin clientes.</div>}
    </div>
  )
}
