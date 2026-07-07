import React, { useState } from 'react'
import { Plus, Trash2, Users, Truck, Search } from 'lucide-react'
import { FACTURAS_SEED } from './facturas-data.js'
import { CLIENTES_SEED } from './ClientesModule.jsx'
import { PP_SEED } from './ProveedoresPagosModule.jsx'

// ============================================================
// MÓDULO: Clientes y Proveedores
// Lista central de nombres + RUT. Alimenta el autocompletado de
// clientes al crear facturas. Preparado para sincronizarse con
// Defontana (razón social + RUT) en la fase de integración.
// ============================================================

const C = { azul: '#1D1D1B', teal: '#A8501F', ambar: '#D2642F', rojo: '#B5432E', verde: '#3D7A4E', carbon: '#161616', gris: '#7A8288' }
const inp = { padding: '6px 8px', border: '1px solid #CBD2D6', fontSize: 12.5, boxSizing: 'border-box' }
const norm = s => (s || '').toString().trim()

function buildClientes() {
  const map = new Map()
  CLIENTES_SEED.forEach(c => { const n = norm(c.nombre); if (n) map.set(n.toLowerCase(), { nombre: n, rut: c.rut || '' }) })
  Object.values(FACTURAS_SEED || {}).forEach(arr => (arr || []).forEach(f => { const n = norm(f.cliente); if (n && !map.has(n.toLowerCase())) map.set(n.toLowerCase(), { nombre: n, rut: '' }) }))
  return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((c, i) => ({ id: 'cc' + i, ...c }))
}

export const CONTACTOS_SEED = {
  clientes: buildClientes(),
  proveedores: (PP_SEED.proveedores || []).map((p, i) => ({ id: 'cp' + i, nombre: p.nombre, rut: p.rut || '' })),
}

// Devuelve los nombres de clientes para autocompletar
export const nombresClientes = contactos => [...new Set(((contactos && contactos.clientes) || []).map(c => norm(c.nombre)).filter(Boolean))]

function Tabla({ titulo, icono, items, setItems, color }) {
  const [busca, setBusca] = useState('')
  const agregar = () => setItems([{ id: 't' + Date.now(), nombre: '', rut: '' }, ...items])
  const actualizar = (id, campo, valor) => setItems(items.map(x => x.id === id ? { ...x, [campo]: valor } : x))
  const eliminar = id => { if (window.confirm('¿Eliminar este registro?')) setItems(items.filter(x => x.id !== id)) }
  const mostrados = items.filter(x => !busca || (norm(x.nombre) + ' ' + norm(x.rut)).toLowerCase().includes(busca.toLowerCase()))
  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', borderTop: `3px solid ${color}` }}>
      <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid #EEE9DF' }}>
        <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>{icono} {titulo}</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: C.gris }}>
          <span>{mostrados.length} de {items.length}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #CBD2D6', padding: '2px 6px' }}>
            <Search size={13} color={C.gris} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nombre/RUT…" style={{ border: 'none', outline: 'none', fontSize: 12.5, width: 140 }} />
          </div>
          <button onClick={agregar} style={{ background: color, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Agregar</button>
        </div>
      </div>
      <div style={{ overflowX: 'auto', padding: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
            {['Nombre / Razón social', 'RUT', ''].map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '5px 6px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {mostrados.map(x => (
              <tr key={x.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
                <td style={{ padding: '4px 6px' }}><input value={x.nombre} onChange={e => actualizar(x.id, 'nombre', e.target.value)} placeholder="Nombre…" style={{ ...inp, width: '100%', minWidth: 200, fontWeight: 600 }} /></td>
                <td style={{ padding: '4px 6px' }}><input value={x.rut} onChange={e => actualizar(x.id, 'rut', e.target.value)} placeholder="76.xxx.xxx-x" style={{ ...inp, width: 150 }} /></td>
                <td style={{ padding: '4px 4px', textAlign: 'right' }}><button onClick={() => eliminar(x.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button></td>
              </tr>
            ))}
            {mostrados.length === 0 && <tr><td colSpan={3} style={{ padding: 14, textAlign: 'center', color: '#9AA0A6' }}>Sin registros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ContactosModule({ contactos = CONTACTOS_SEED, setContactos = () => {} }) {
  const [tab, setTab] = useState('clientes')
  const setClientes = arr => setContactos({ ...contactos, clientes: arr })
  const setProveedores = arr => setContactos({ ...contactos, proveedores: arr })
  const btn = activo => ({ background: activo ? C.teal : 'transparent', color: activo ? '#fff' : C.carbon, border: '1px solid ' + (activo ? C.teal : '#CBD2D6'), padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 })
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button onClick={() => setTab('clientes')} style={btn(tab === 'clientes')}>Clientes ({(contactos.clientes || []).length})</button>
        <button onClick={() => setTab('proveedores')} style={btn(tab === 'proveedores')}>Proveedores ({(contactos.proveedores || []).length})</button>
      </div>
      {tab === 'clientes'
        ? <Tabla titulo="Clientes" icono={<Users size={15} />} items={contactos.clientes || []} setItems={setClientes} color={C.teal} />
        : <Tabla titulo="Proveedores" icono={<Truck size={15} />} items={contactos.proveedores || []} setItems={setProveedores} color={C.azul} />}
      <div style={{ fontSize: 11, color: '#9AA0A6', marginTop: 6 }}>
        Esta lista alimenta el autocompletado del cliente al crear facturas. Se sincronizará con Defontana (razón social + RUT) cuando activemos la integración.
      </div>
    </div>
  )
}
