import React, { useState } from 'react'
import { Plus, Trash2, Receipt } from 'lucide-react'

// ============================================================
// MÓDULO: Facturas por área (Santa Rosa / Istria)
// Lista editable de facturas: ver, editar, comentar, registrar
// fecha de pago y banco de depósito.
// Versión en memoria. Preparado para llenarse automáticamente
// desde Defontana / SII en la fase de sincronización.
// ============================================================

const C = { azul: '#1D1D1B', teal: '#A8501F', ambar: '#D2642F', rojo: '#B5432E', verde: '#3D7A4E', carbon: '#161616', gris: '#7A8288' }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const inp = { padding: '6px 8px', border: '1px solid #CBD2D6', fontSize: 12.5, boxSizing: 'border-box' }
const ESTADOS = ['Pendiente', 'Pagado', 'Factoring', 'Vencida', 'Anulada']
const BANCOS = ['', 'Banco de Chile', 'BCI', 'Santander', 'Estado', 'Scotiabank', 'Itaú', 'Security', 'BICE', 'Otro']

export const FACTURAS_SEED = {
  'Santa Rosa': [
    { id: 'sr1', numero: '2026-114', cliente: 'Viman', ot: 'OT-2026-114', fecha_emision: '2026-06-30', monto: 5518500, estado: 'Pendiente', fecha_pago: '', banco: '', comentarios: '' },
    { id: 'sr2', numero: '2026-115', cliente: 'Viman', ot: 'OT-2026-115', fecha_emision: '2026-06-30', monto: 684000, estado: 'Pendiente', fecha_pago: '', banco: '', comentarios: '' },
  ],
  'Istria': [
    { id: 'is1', numero: '2026-097', cliente: 'IMMA', ot: 'OT-304', fecha_emision: '2026-06-20', monto: 3200000, estado: 'Pendiente', fecha_pago: '', banco: '', comentarios: '' },
  ],
}

const fondoEstado = e => ({ Pagado: '#E7F2EA', Factoring: '#F9E9DE', Vencida: '#F6E0DA', Anulada: '#EEE', Pendiente: '#F9E9DE' }[e] || '#EEE')
const colorEstado = e => ({ Pagado: C.verde, Factoring: C.ambar, Vencida: C.rojo, Anulada: C.gris, Pendiente: '#8C4519' }[e] || C.gris)

export default function FacturasModule({ area, facturas, setFacturas }) {
  const lista = (facturas && facturas[area]) || []
  const [creando, setCreando] = useState(false)
  const nueva = () => ({ numero: '', cliente: '', ot: '', fecha_emision: '', monto: '', estado: 'Pendiente', fecha_pago: '', banco: '', comentarios: '' })
  const [f, setF] = useState(nueva())

  const setLista = nuevaLista => setFacturas({ ...(facturas || {}), [area]: nuevaLista })
  const actualizar = (id, campo, valor) => setLista(lista.map(x => x.id === id ? { ...x, [campo]: valor } : x))
  function agregar() {
    if (!f.numero || num(f.monto) <= 0) return
    setLista([{ id: 'f' + Date.now(), ...f, monto: num(f.monto) }, ...lista])
    setF(nueva()); setCreando(false)
  }

  const totalMonto = lista.reduce((a, x) => a + x.monto, 0)
  const cobrado = lista.filter(x => x.estado === 'Pagado').reduce((a, x) => a + x.monto, 0)

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ background: '#fff', border: '1px solid #E2DED4', borderTop: `3px solid ${C.teal}` }}>
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid #EEE9DF' }}>
          <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}><Receipt size={15} /> Facturas · {area}</span>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12, color: C.gris, flexWrap: 'wrap' }}>
            <span>Total: <b style={{ color: C.carbon }}>{clp(totalMonto)}</b></span>
            <span>Cobrado: <b style={{ color: C.verde }}>{clp(cobrado)}</b></span>
            {!creando && <button onClick={() => setCreando(true)} style={{ background: C.teal, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Nueva factura</button>}
          </div>
        </div>

        {creando && (
          <div style={{ background: '#FAF7F3', padding: 12, borderBottom: '1px solid #EEE9DF' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8 }}>
              <input style={inp} placeholder="N° factura *" value={f.numero} onChange={e => setF({ ...f, numero: e.target.value })} />
              <input style={inp} placeholder="Cliente" value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} />
              <input style={inp} placeholder="OT" value={f.ot} onChange={e => setF({ ...f, ot: e.target.value })} />
              <label style={{ fontSize: 11, color: C.gris }}>Emisión<input type="date" style={{ ...inp, width: '100%' }} value={f.fecha_emision} onChange={e => setF({ ...f, fecha_emision: e.target.value })} /></label>
              <input style={inp} placeholder="Monto CLP *" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={agregar} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar</button>
              <button onClick={() => { setF(nueva()); setCreando(false) }} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto', padding: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
              {['N° factura', 'Cliente', 'OT', 'Emisión', 'Monto', 'Estado', 'Fecha pago', 'Banco depósito', 'Comentarios', ''].map((h, i) => (
                <th key={i} style={{ textAlign: h === 'Monto' ? 'right' : 'left', padding: '5px 6px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {lista.map(x => (
                <tr key={x.id} style={{ borderBottom: '1px solid #EEE9DF', opacity: x.estado === 'Anulada' ? 0.5 : 1 }}>
                  <td style={{ padding: '5px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>{x.numero}</td>
                  <td style={{ padding: '5px 6px' }}>{x.cliente}</td>
                  <td style={{ padding: '5px 6px', color: C.gris }}>{x.ot || '—'}</td>
                  <td style={{ padding: '5px 6px', color: C.gris, whiteSpace: 'nowrap' }}>{x.fecha_emision || '—'}</td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{clp(x.monto)}</td>
                  <td style={{ padding: '5px 6px' }}>
                    <select value={x.estado} onChange={e => actualizar(x.id, 'estado', e.target.value)} style={{ border: 'none', background: fondoEstado(x.estado), color: colorEstado(x.estado), padding: '3px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {ESTADOS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '5px 6px' }}><input type="date" value={x.fecha_pago} onChange={e => actualizar(x.id, 'fecha_pago', e.target.value)} style={{ ...inp, width: 130 }} /></td>
                  <td style={{ padding: '5px 6px' }}>
                    <select value={x.banco} onChange={e => actualizar(x.id, 'banco', e.target.value)} style={{ ...inp, width: 140 }}>
                      {BANCOS.map(b => <option key={b} value={b}>{b || '—'}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '5px 6px' }}><input value={x.comentarios} onChange={e => actualizar(x.id, 'comentarios', e.target.value)} placeholder="Comentario…" style={{ ...inp, width: 160 }} /></td>
                  <td style={{ padding: '5px 4px', textAlign: 'right' }}><button onClick={() => window.confirm(`¿Eliminar factura ${x.numero}?`) && setLista(lista.filter(y => y.id !== x.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button></td>
                </tr>
              ))}
              {lista.length === 0 && <tr><td colSpan={10} style={{ padding: 14, textAlign: 'center', color: '#9AA0A6' }}>Sin facturas en esta área.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#9AA0A6', marginTop: 6 }}>
        Estas facturas se llenarán automáticamente desde Defontana/SII cuando activemos la sincronización. Por ahora puedes cargarlas y editarlas a mano.
      </div>
    </div>
  )
}
