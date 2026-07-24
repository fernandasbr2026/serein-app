import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase.js'
import { CC_DEFS } from './proyectos-data.js'
import { pullState, pushState } from './sync.js'

// ============================================================
// Compras SII -> Centro de costo (Proyectos)
// Trae las facturas del Libro de Compras (SII) y permite imputarlas
// a un proyecto-OT + centro de costo. Se agregan a p.compras (con
// origen 'libro' y libroId para evitar duplicados), asi el consumo por
// CC del proyecto las toma igual que las compras manuales.
// La lista de CC incluye SIEMPRE los CC por defecto (A1-A6) + los del
// proyecto (topes guardados y los usados en compras), para que el
// selector nunca quede bloqueado.
// ============================================================

import { SEREIN } from './theme-serein.js'
// Paleta reskineada a la identidad Serein 2026 — mismas claves, solo cambian los valores hex.
const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const inp = { padding: '7px 9px', border: '1px solid #DFE4EA', fontSize: 13, boxSizing: 'border-box' }
const sel = { padding: '5px 7px', border: '1px solid #DFE4EA', fontSize: 12.5, background: '#fff' }
const clp = n => '$' + Math.round(+n || 0).toLocaleString('es-CL')
const nombreDefCC = code => { const c = (CC_DEFS || []).find(x => x.id === code); return (c && c.nombre) || code }

export default function ProyComprasLibro({ proyectos = [], setProyectos = null }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [otSel, setOtSel] = useState('')
  const [ccSel, setCcSel] = useState({})
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setLoading(true); setErr('')
      const { data, error } = await supabase
        .from('libro_compras')
        .select('*')
        .order('emission_date', { ascending: false })
      if (!vivo) return
      if (error) setErr('No pude leer el Libro de Compras: ' + error.message)
      else setRows(data || [])
      setLoading(false)
    })()
    return () => { vivo = false }
  }, [])

  const proy = proyectos.find(p => p.id === otSel) || null
  // CC por defecto + los del proyecto (topes + usados en compras)
  const ccList = proy
    ? [...new Set([...(CC_DEFS || []).map(c => c.id), ...Object.keys(proy.cc || {}), ...(proy.compras || []).map(c => c.cc)])].filter(Boolean)
    : []
  const nombreCC = (p, code) => (p && p.ccNombres && p.ccNombres[code]) || nombreDefCC(code)
  const impSet = useMemo(() => { const s = new Set(); proyectos.forEach(p => (p.compras || []).forEach(c => { if (c.libroId != null) s.add(String(c.libroId)) })); return s }, [proyectos])

  const filtradas = useMemo(() => (rows || []).filter(r => {
    if (!q) return true
    const t = ((r.provider_name || '') + ' ' + (r.provider_rut || '') + ' ' + (r.document_number || '')).toLowerCase()
    return t.includes(q.toLowerCase())
  }), [rows, q])

  async function imputar(r) {
    if (!setProyectos) { setMsg('Falta conexion con Proyectos.'); return }
    if (!otSel) { setMsg('Primero elige el proyecto/OT destino (arriba).'); return }
    const cc = ccSel[r.id]
    if (!cc) { setMsg('Elige el centro de costo para la factura ' + r.document_number + '.'); return }
    const compra = { proveedor: r.provider_name || '', folio: String(r.document_number || ''), rut: r.provider_rut || '', monto: Math.round(+(r.exenta ? (r.document_total || r.neto) : r.neto) || 0), cc, fecha: r.emission_date || '—', detalle: 'SII ' + (r.document_type || '') + (r.exenta ? ' (Exenta)' : ''), exento: !!r.exenta, origen: 'libro', libroId: String(r.id) }
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_proyectos') || 'null') } catch (e) {}
    const base = Array.isArray(fresco) ? fresco : proyectos
    const nuevo = base.map(p => p.id === otSel ? { ...p, compras: [...(p.compras || []), compra] } : p)
    try { localStorage.setItem('serein_proyectos', JSON.stringify(nuevo)) } catch (e) {}
    setProyectos(nuevo)
    pushState()
    setMsg('Factura ' + r.document_number + ' imputada a ' + cc + ' (' + nombreCC(proy, cc) + ').')
    setTimeout(() => setMsg(''), 3200)
  }
  async function quitar(libroId) {
    if (!setProyectos) return
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_proyectos') || 'null') } catch (e) {}
    const base = Array.isArray(fresco) ? fresco : proyectos
    const nuevo = base.map(p => ({ ...p, compras: (p.compras || []).filter(c => String(c.libroId) !== String(libroId)) }))
    try { localStorage.setItem('serein_proyectos', JSON.stringify(nuevo)) } catch (e) {}
    setProyectos(nuevo)
    pushState()
  }

  const card = { background: '#fff', border: '1px solid #DFE4EA', padding: 16, marginBottom: 16 }
  const h = { fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 4 }

  return (
    <div>
      <div style={card}>
        <div style={h}>Compras del Libro (SII) a centro de costo</div>
        <div style={{ fontSize: 12.5, color: C.gris, marginBottom: 12, lineHeight: 1.4 }}>
          Elige el proyecto/OT destino y luego imputa las facturas de compra (SII) a un centro de costo de esa OT. Se descuentan del presupuesto de ese CC igual que las compras manuales. Tambien puedes seguir cargando compras a mano desde la ficha de la OT (pestana Tarjetas).
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, color: C.gris, display: 'flex', flexDirection: 'column', gap: 3 }}>Proyecto / OT destino
            <select value={otSel} onChange={e => { setOtSel(e.target.value); setCcSel({}) }} style={{ ...inp, minWidth: 260 }}>
              <option value="">- elige el proyecto / OT -</option>
              {proyectos.map(p => <option key={p.id} value={p.id}>{(p.ot ? 'OT ' + p.ot + ' · ' : '') + (p.nombre || p.cliente || 'Proyecto')}</option>)}
            </select>
          </label>
          {proy && (
            <div style={{ fontSize: 12, color: C.gris, maxWidth: 620 }}>Centros de costo de esta OT: <b>{ccList.map(cc => cc + ' ' + nombreCC(proy, cc)).join(' · ')}</b></div>
          )}
        </div>
        {!proy && <div style={{ fontSize: 12, color: C.ambar, background: '#FDECDD', padding: '6px 10px', marginTop: 10 }}>Elige primero la OT para poder imputar los centros de costo.</div>}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input style={{ ...inp, flex: '1 1 240px' }} placeholder="Buscar proveedor, RUT o folio..." value={q} onChange={e => setQ(e.target.value)} />
          {msg && <span style={{ color: msg.includes('imputada') ? C.verde : C.rojo, fontSize: 13, fontWeight: 600 }}>{msg}</span>}
        </div>
        {loading ? <div style={{ color: C.gris, padding: 16 }}>Cargando Libro de Compras...</div>
          : err ? <div style={{ background: '#FCEBEA', border: '1px solid ' + C.rojo, color: C.rojo, padding: '10px 12px', fontSize: 13 }}>{err}</div>
            : filtradas.length === 0 ? <div style={{ color: C.gris, padding: 16, textAlign: 'center' }}>Sin facturas en el Libro de Compras. Sincroniza el Libro de Compras primero.</div>
              : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 900 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                        {['Emision', 'Proveedor', 'Folio', 'Neto', 'Pago', 'Imputar a CC', ''].map((t, i) => <th key={i} style={{ textAlign: t === 'Neto' ? 'right' : 'left', padding: '6px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{t}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {filtradas.slice(0, 300).map(r => {
                        const imp = impSet.has(String(r.id))
                        return (
                          <tr key={r.id} style={{ borderBottom: '1px solid #DFE4EA', background: imp ? '#F3F7F4' : 'transparent' }}>
                            <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{r.emission_date || '-'}</td>
                            <td style={{ padding: '6px 8px' }}><div style={{ fontWeight: 600 }}>{r.provider_name || '-'}</div><div style={{ color: C.gris, fontSize: 11 }}>{r.provider_rut}</div></td>
                            <td style={{ padding: '6px 8px' }}>{r.document_number}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{clp(r.neto)}</td>
                            <td style={{ padding: '6px 8px', color: C.gris }}>{r.estado_pago || '-'}</td>
                            <td style={{ padding: '6px 8px' }}>
                              {imp ? <span style={{ color: C.teal, fontSize: 12, fontWeight: 600 }}>Ya imputada</span> : (
                                <select value={ccSel[r.id] || ''} onChange={e => setCcSel({ ...ccSel, [r.id]: e.target.value })} style={{ ...sel, minWidth: 190 }} disabled={!proy}>
                                  <option value="">{proy ? '- elige centro de costo -' : '- elige la OT primero -'}</option>
                                  {ccList.map(cc => <option key={cc} value={cc}>{cc} · {nombreCC(proy, cc)}</option>)}
                                </select>
                              )}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {imp ? <button onClick={() => quitar(r.id)} style={{ background: 'none', border: '1px solid #DFE4EA', color: C.rojo, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>Quitar</button>
                                : <button onClick={() => imputar(r)} disabled={!proy || !ccSel[r.id]} style={{ background: (proy && ccSel[r.id]) ? C.verde : '#9AA3AD', color: '#fff', border: 'none', padding: '5px 12px', cursor: (proy && ccSel[r.id]) ? 'pointer' : 'default', fontSize: 12, fontWeight: 600 }}>Imputar</button>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
      </div>
    </div>
  )
}
