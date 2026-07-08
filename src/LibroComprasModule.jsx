import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'

const C = { navy: '#061A40', orange: '#FF6B00', gray: '#F5F7FA', border: '#D8DCE5', text: '#101828', green: '#16A34A', red: '#DC2626', mut: '#7A8288' }
const clp = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const ip = { padding: '6px 8px', border: '1px solid ' + C.border, fontSize: 12.5, boxSizing: 'border-box', borderRadius: 4 }
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export default function LibroComprasModule({ esGerencia = true, ots = [] }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [errMsg, setErrMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [q, setQ] = useState('')
  const [mes, setMes] = useState('')
  const [tipo, setTipo] = useState('')

  const cargar = async () => {
    setLoading(true); setErrMsg('')
    const { data, error } = await supabase
      .from('libro_compras').select('*')
      .order('emission_date', { ascending: false })
    if (error) { setErrMsg('No se pudo leer el libro de compras: ' + error.message + '. Revisa que corriste la migracion libro_compras_setup.sql en Supabase.') }
    else { setRows(data || []) }
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  const sincronizar = async () => {
    setSyncing(true); setSyncMsg('')
    try {
      const { data, error } = await supabase.functions.invoke('libro-compras-sync')
      if (error) throw error
      if (data && data.ok) { setSyncMsg('Sincronizado: ' + (data.saved ?? 0) + ' documentos (' + data.start + ' a ' + data.finish + ').'); await cargar() }
      else { setSyncMsg('La funcion respondio: ' + JSON.stringify(data)) }
    } catch (e) { setSyncMsg('Error al sincronizar: ' + (e.message || String(e))) }
    setSyncing(false)
  }

  const meses = useMemo(() => {
    const s = new Set((rows || []).map(r => (r.emission_date || '').slice(0, 7)).filter(Boolean))
    return [...s].sort().reverse()
  }, [rows])
  const tipos = useMemo(() => [...new Set((rows || []).map(r => r.document_type).filter(Boolean))].sort(), [rows])

  const filtradas = useMemo(() => (rows || []).filter(r => {
    if (mes && (r.emission_date || '').slice(0, 7) !== mes) return false
    if (tipo && r.document_type !== tipo) return false
    if (q) { const t = (r.provider_name + ' ' + r.provider_rut + ' ' + r.document_number).toLowerCase(); if (!t.includes(q.toLowerCase())) return false }
    return true
  }), [rows, mes, tipo, q])

  const tot = useMemo(() => filtradas.reduce((a, r) => ({ neto: a.neto + (+r.neto || 0), iva: a.iva + (+r.iva || 0), exento: a.exento + (+r.exento || 0), total: a.total + (+r.document_total || 0) }), { neto: 0, iva: 0, exento: 0, total: 0 }), [filtradas])

  const setCampo = async (id, campo, valor) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, [campo]: valor } : r))
    await supabase.from('libro_compras').update({ [campo]: valor }).eq('id', id)
  }

  const mesLabel = ym => { const [y, m] = ym.split('-'); return MESES[(+m) - 1] + ' ' + y }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 20, textTransform: 'uppercase', color: C.navy }}>Libro de Compras</div>
          <div style={{ fontSize: 12, color: C.mut }}>Facturas de compra recibidas (SII) · sincronizado desde Defontana</div>
        </div>
        <button onClick={sincronizar} disabled={syncing} style={{ background: C.navy, color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: syncing ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13 }}>
          {syncing ? 'Sincronizando...' : 'Sincronizar con Defontana'}
        </button>
      </div>

      {syncMsg ? <div style={{ background: syncMsg.startsWith('Error') ? '#FDECEC' : '#EAF7EE', border: '1px solid ' + (syncMsg.startsWith('Error') ? C.red : C.green), color: syncMsg.startsWith('Error') ? C.red : '#15803D', padding: '8px 12px', borderRadius: 6, fontSize: 12.5, marginBottom: 12 }}>{syncMsg}</div> : null}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {[['Documentos', filtradas.length, C.navy], ['Neto', clp(tot.neto), C.navy], ['IVA', clp(tot.iva), C.orange], ['Total', clp(tot.total), C.navy]].map(([k, v, col], i) => (
          <div key={i} style={{ flex: '1 1 130px', border: '1px solid ' + C.border, borderRadius: 6, padding: '10px 12px', background: C.gray }}>
            <div style={{ fontSize: 11, color: C.mut, textTransform: 'uppercase', fontWeight: 700 }}>{k}</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: col }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input style={{ ...ip, flex: '2 1 220px' }} placeholder="Buscar proveedor, RUT o folio..." value={q} onChange={e => setQ(e.target.value)} />
        <select style={{ ...ip, flex: '1 1 130px' }} value={mes} onChange={e => setMes(e.target.value)}>
          <option value="">Todos los meses</option>
          {meses.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
        </select>
        <select style={{ ...ip, flex: '1 1 130px' }} value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {tipos.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading ? <div style={{ color: C.mut, padding: 20 }}>Cargando...</div> : errMsg ? <div style={{ background: '#FDECEC', border: '1px solid ' + C.red, color: C.red, padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>{errMsg}</div> : filtradas.length === 0 ? (
        <div style={{ color: C.mut, padding: 20, textAlign: 'center', border: '1px dashed ' + C.border, borderRadius: 8 }}>
          Sin documentos. Presiona <b>Sincronizar con Defontana</b> para traer el libro de compras del ano.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid ' + C.border, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1000 }}>
            <thead>
              <tr style={{ background: C.navy, color: '#fff' }}>
                {['Emision', 'Proveedor', 'Folio', 'Tipo', 'Neto', 'IVA', 'Total', 'Estado', 'OT', 'Centro costo'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Neto' || h === 'IVA' || h === 'Total' ? 'right' : 'left', padding: '9px 10px', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #EEECE4' }}>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{r.emission_date || '-'}</td>
                  <td style={{ padding: '7px 10px' }}><div style={{ fontWeight: 600 }}>{r.provider_name || '-'}</div><div style={{ color: C.mut, fontSize: 11 }}>{r.provider_rut}</div></td>
                  <td style={{ padding: '7px 10px' }}>{r.document_number}</td>
                  <td style={{ padding: '7px 10px' }}>{r.document_type}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{clp(r.neto)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: C.orange }}>{clp(r.iva)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{clp(r.document_total)}</td>
                  <td style={{ padding: '7px 10px' }}><span style={{ fontSize: 11, color: r.is_received ? C.green : C.mut }}>{r.last_status || (r.is_received ? 'Recibido' : '-')}</span></td>
                  <td style={{ padding: '7px 10px' }}>
                    <select style={{ ...ip, padding: '4px 6px', minWidth: 110 }} value={r.ot_id || ''} onChange={e => setCampo(r.id, 'ot_id', e.target.value)}>
                      <option value="">- sin OT -</option>
                      {ots.map(o => <option key={o.numero} value={o.numero}>{o.numero}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <input style={{ ...ip, padding: '4px 6px', width: 120 }} value={r.centro_costo || ''} placeholder="-" onChange={e => setRows(rs => rs.map(x => x.id === r.id ? { ...x, centro_costo: e.target.value } : x))} onBlur={e => setCampo(r.id, 'centro_costo', e.target.value)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
