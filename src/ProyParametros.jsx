import React, { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { CC_DEFS } from './proyectos-data.js'

// ============================================================
// Parametros Proyectos: catalogo editable/autoconstruido de
// centros de costo (codigo, nombre, condicion IVA) + margen sugerido.
// Se guarda en localStorage 'serein_proyParams' y se sincroniza con la
// nube via sync.js (prefijo serein_). No toca los datos de proyectos.
// ============================================================

import { SEREIN } from './theme-serein.js'
// Paleta reskineada a la identidad Serein 2026 — mismas claves, solo cambian los valores hex.
const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const inp = { padding: '7px 9px', border: '1px solid #DFE4EA', fontSize: 13, boxSizing: 'border-box' }
const clp = n => '$' + Math.round(+n || 0).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const LS_KEY = 'serein_proyParams'

// Lectura reutilizable (la usaran las etapas siguientes del cotizador de proyectos)
export function cargarProyParams() {
  try { const s = localStorage.getItem(LS_KEY); if (s) { const o = JSON.parse(s); if (o && Array.isArray(o.centros)) return o } } catch (e) {}
  return {
    centros: (CC_DEFS || []).map(c => ({ codigo: c.id, nombre: c.nombre, condicionIVA: 'afecto' })),
    margenDefault: 33,
    margenPorTamano: [{ hasta: 5000000, margen: 50 }, { hasta: 20000000, margen: 33 }, { hasta: 0, margen: 27 }],
  }
}
function guardarProyParams(o) { try { localStorage.setItem(LS_KEY, JSON.stringify(o)) } catch (e) {} }

export default function ProyParametros() {
  const [p, setP] = useState(cargarProyParams)
  const [msg, setMsg] = useState('')

  const setCentro = (i, k, v) => setP(prev => ({ ...prev, centros: prev.centros.map((c, j) => j === i ? { ...c, [k]: v } : c) }))
  const addCentro = () => setP(prev => ({ ...prev, centros: [...prev.centros, { codigo: '', nombre: '', condicionIVA: 'afecto' }] }))
  const delCentro = i => setP(prev => ({ ...prev, centros: prev.centros.filter((_, j) => j !== i) }))
  const setTramo = (i, v) => setP(prev => ({ ...prev, margenPorTamano: prev.margenPorTamano.map((t, j) => j === i ? { ...t, margen: num(v) } : t) }))

  function guardar() {
    const limpio = {
      ...p,
      centros: (p.centros || [])
        .filter(c => (c.codigo || '').trim() || (c.nombre || '').trim())
        .map(c => ({ codigo: (c.codigo || '').trim().toUpperCase(), nombre: (c.nombre || '').trim(), condicionIVA: c.condicionIVA === 'exento' ? 'exento' : 'afecto' })),
      margenDefault: num(p.margenDefault) || 33,
    }
    guardarProyParams(limpio)
    setP(limpio)
    setMsg('Parametros guardados. Se sincronizan con la nube.')
    setTimeout(() => setMsg(''), 2800)
  }

  const card = { background: '#fff', border: '1px solid #DFE4EA', padding: 16, marginBottom: 16 }
  const h = { fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 4 }

  return (
    <div>
      <div style={card}>
        <div style={h}>Centros de costo (catalogo)</div>
        <div style={{ fontSize: 12.5, color: C.gris, marginBottom: 12, lineHeight: 1.4 }}>
          Catalogo reutilizable para cotizar proyectos. Se ira completando solo a medida que crees centros de costo nuevos en una cotizacion, y lo puedes editar aqui. La condicion IVA aplica al <b>costo</b> (lo que se paga a proveedores); la venta al cliente siempre es afecta (19%).
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                {['Codigo', 'Nombre', 'Condicion IVA por defecto', ''].map((t, i) => <th key={i} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {p.centros.map((c, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #DFE4EA' }}>
                  <td style={{ padding: '4px 8px' }}><input value={c.codigo} onChange={e => setCentro(i, 'codigo', e.target.value)} placeholder="A1" style={{ ...inp, width: 70 }} /></td>
                  <td style={{ padding: '4px 8px' }}><input value={c.nombre} onChange={e => setCentro(i, 'nombre', e.target.value)} placeholder="PINTURA, INGENIERIA, MONTAJE..." style={{ ...inp, width: 260 }} /></td>
                  <td style={{ padding: '4px 8px' }}>
                    <select value={c.condicionIVA} onChange={e => setCentro(i, 'condicionIVA', e.target.value)} style={{ ...inp }}>
                      <option value="afecto">Afecto (19%)</option>
                      <option value="exento">Exento</option>
                    </select>
                  </td>
                  <td style={{ padding: '4px 4px', textAlign: 'right' }}><button onClick={() => delCentro(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={15} /></button></td>
                </tr>
              ))}
              {p.centros.length === 0 && <tr><td colSpan={4} style={{ padding: 12, textAlign: 'center', color: '#9AA3AD' }}>Sin centros de costo. Agrega el primero.</td></tr>}
            </tbody>
          </table>
        </div>
        <button onClick={addCentro} style={{ background: 'none', border: '1px dashed #DFE4EA', padding: '6px 12px', cursor: 'pointer', fontSize: 12.5, color: C.gris, marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Plus size={14} /> Agregar centro de costo</button>
      </div>

      <div style={card}>
        <div style={h}>Margen sugerido</div>
        <div style={{ fontSize: 12.5, color: C.gris, marginBottom: 12, lineHeight: 1.4 }}>
          Margen por defecto al cotizar (siempre editable en cada cotizacion). Opcional: sugerencia segun el tamano (costo total neto) del proyecto.
        </div>
        <label style={{ fontSize: 12, color: C.gris }}>Margen por defecto (%)
          <input value={p.margenDefault} onChange={e => setP({ ...p, margenDefault: e.target.value })} style={{ ...inp, width: 90, marginLeft: 8, textAlign: 'right' }} />
        </label>
        <div style={{ marginTop: 14, fontSize: 12, color: C.gris }}>Sugerencia por tamano del proyecto:</div>
        <table style={{ borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
          <thead><tr style={{ borderBottom: `1px solid ${C.carbon}` }}><th style={{ textAlign: 'left', padding: '4px 10px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Costo neto</th><th style={{ textAlign: 'left', padding: '4px 10px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Margen sugerido %</th></tr></thead>
          <tbody>
            {p.margenPorTamano.map((t, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #DFE4EA' }}>
                <td style={{ padding: '4px 10px', color: C.gris }}>{t.hasta ? 'Hasta ' + clp(t.hasta) : 'Mayores'}</td>
                <td style={{ padding: '4px 10px' }}><input value={t.margen} onChange={e => setTramo(i, e.target.value)} style={{ ...inp, width: 80, textAlign: 'right' }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={guardar} style={{ background: C.verde, color: '#fff', border: 'none', padding: '9px 18px', cursor: 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, textTransform: 'uppercase' }}>Guardar parametros</button>
        {msg && <span style={{ color: C.verde, fontSize: 13, fontWeight: 600 }}>{msg}</span>}
      </div>
    </div>
  )
}
