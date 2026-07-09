import React, { useState } from 'react'
import { Plus, Trash2, Users, Truck, Search } from 'lucide-react'
import { CLIENTES_FICHA } from './clientes-data.js'
import { PROVEEDORES_FICHA } from './proveedores-data.js'
import Paginador, { paginar } from './Paginador.jsx'

// ============================================================
// MÓDULO: Clientes y Proveedores
// Lista maestra editable (nombre, RUT, giro, dirección, comuna,
// estado, vendedor). Alimenta el autocompletado de clientes al
// crear facturas/cotizaciones. Preparado para sincronizar con
// Defontana (razón social + RUT) en la fase de integración.
// ============================================================

const C = { azul: '#061A40', teal: '#0B7285', ambar: '#FF6B00', rojo: '#D64545', verde: '#12805C', carbon: '#0F1A2E', gris: '#8A929E' }
const inp = { padding: '6px 8px', border: '1px solid #CBD2D6', fontSize: 12.5, boxSizing: 'border-box' }
const norm = s => (s || '').toString().trim()

// Versión de la semilla: si cambia, se recarga la lista maestra
export const CONTACTOS_VER = 'ficha-clientes-proveedores-2026-07'

export const CONTACTOS_SEED = {
  ver: CONTACTOS_VER,
  clientes: (CLIENTES_FICHA || []).map(c => ({ ...c })),
  proveedores: (PROVEEDORES_FICHA || []).map(p => ({ ...p })),
}

// Devuelve los nombres de clientes para autocompletar
export const nombresClientes = contactos => [...new Set(((contactos && contactos.clientes) || []).map(c => norm(c.nombre)).filter(Boolean))]

// Columnas editables de cada tabla
const COLS_CLIENTES = [
  { key: 'nombre', label: 'Nombre / Razón social', width: 200, bold: true },
  { key: 'rut', label: 'RUT', width: 120 },
  { key: 'giro', label: 'Giro', width: 180 },
  { key: 'direccion', label: 'Dirección', width: 180 },
  { key: 'comuna', label: 'Comuna', width: 120 },
  { key: 'vendedor', label: 'Vendedor', width: 100 },
  { key: 'estado', label: 'Estado', width: 90, type: 'estado' },
]
const COLS_PROVEEDORES = [
  { key: 'nombre', label: 'Nombre / Razón social', width: 200, bold: true },
  { key: 'rut', label: 'RUT', width: 120 },
  { key: 'giro', label: 'Giro', width: 180 },
  { key: 'direccion', label: 'Dirección', width: 180 },
  { key: 'comuna', label: 'Comuna', width: 120 },
  { key: 'estado', label: 'Estado', width: 90, type: 'estado' },
]

function Tabla({ titulo, icono, items, setItems, color, cols }) {
  const [busca, setBusca] = useState('')
  const [page, setPage] = useState(1)
  const vacio = () => cols.reduce((o, c) => ({ ...o, [c.key]: c.type === 'estado' ? 'Activo' : '' }), { id: 't' + Date.now() })
  const agregar = () => setItems([vacio(), ...items])
  const actualizar = (id, campo, valor) => setItems(items.map(x => x.id === id ? { ...x, [campo]: valor } : x))
  const eliminar = id => { if (window.confirm('¿Eliminar este registro?')) setItems(items.filter(x => x.id !== id)) }
  const mostrados = items.filter(x => !busca || cols.some(c => (norm(x[c.key])).toLowerCase().includes(busca.toLowerCase())))
  const pg = paginar(mostrados, page)
  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', borderTop: `3px solid ${color}` }}>
      <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid #EEE9DF' }}>
        <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>{icono} {titulo}</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: C.gris }}>
          <span>{mostrados.length} de {items.length}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #CBD2D6', padding: '2px 6px' }}>
            <Search size={13} color={C.gris} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nombre/RUT/giro…" style={{ border: 'none', outline: 'none', fontSize: 12.5, width: 150 }} />
          </div>
          <button onClick={agregar} style={{ background: color, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Agregar</button>
        </div>
      </div>
      <div style={{ overflowX: 'auto', padding: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
            {cols.map(c => <th key={c.key} style={{ textAlign: 'left', padding: '5px 6px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{c.label}</th>)}
            <th></th>
          </tr></thead>
          <tbody>
            {pg.items.map(x => (
              <tr key={x.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
                {cols.map(c => (
                  <td key={c.key} style={{ padding: '4px 6px' }}>
                    {c.type === 'estado' ? (
                      <select value={x[c.key] || 'Activo'} onChange={e => actualizar(x.id, c.key, e.target.value)} style={{ ...inp, width: c.width }}>
                        <option>Activo</option><option>Inactivo</option>
                      </select>
                    ) : (
                      <input value={x[c.key] || ''} onChange={e => actualizar(x.id, c.key, e.target.value)} style={{ ...inp, width: c.width, fontWeight: c.bold ? 600 : 400 }} />
                    )}
                  </td>
                ))}
                <td style={{ padding: '4px 4px', textAlign: 'right' }}><button onClick={() => eliminar(x.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button></td>
              </tr>
            ))}
            {mostrados.length === 0 && <tr><td colSpan={cols.length + 1} style={{ padding: 14, textAlign: 'center', color: '#9AA0A6' }}>Sin registros.</td></tr>}
          </tbody>
        </table>
        <Paginador page={pg.page} paginas={pg.paginas} total={pg.total} setPage={setPage} />
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
        ? <Tabla titulo="Clientes" icono={<Users size={15} />} items={contactos.clientes || []} setItems={setClientes} color={C.teal} cols={COLS_CLIENTES} />
        : <Tabla titulo="Proveedores" icono={<Truck size={15} />} items={contactos.proveedores || []} setItems={setProveedores} color={C.azul} cols={COLS_PROVEEDORES} />}
      <div style={{ fontSize: 11, color: '#9AA0A6', marginTop: 6 }}>
        Esta lista alimenta el autocompletado del cliente al crear facturas y cotizaciones. Se sincronizará con Defontana (razón social + RUT) cuando activemos la integración.
      </div>
    </div>
  )
}
