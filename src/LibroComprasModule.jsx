import { useEffect, useMemo, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabase.js'
import { pushState } from './sync.js'
import { calcularPerdidaFactoring } from './ParametrosModule.jsx'

const C = { navy: '#061A40', orange: '#FF6B00', gray: '#F5F7FA', border: '#D8DCE5', text: '#101828', green: '#16A34A', red: '#DC2626', mut: '#7A8288' }
const clp = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const ip = { padding: '6px 8px', border: '1px solid ' + C.border, fontSize: 12.5, boxSizing: 'border-box', borderRadius: 4 }
const sel = { padding: '4px 6px', border: '1px solid ' + C.border, fontSize: 12, borderRadius: 4, background: '#fff' }
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const AREAS = ['Santa Rosa', 'Istria', 'Proyectos']
const ESTADOS_PAGO = ['Pendiente', 'Pagada', 'Credito', 'Factoring']
const colorPago = e => e === 'Pagada' ? C.green : e === 'Factoring' ? C.orange : e === 'Credito' ? '#2563EB' : C.mut
const DIAS_OPC = [30, 45, 60, 90]
const LS_XLSX = 'serein_libroComprasXlsx'
const norm = s => (s || '').toString().toLowerCase()

export default function LibroComprasModule({ esGerencia = true, ots = [], factoringList = [], proyectos = [], setProyectos = null }) {
  const otNumProy = p => String(p.ot || '').trim()
  const otsActivas = [
    ...(proyectos || []).filter(p => !p.cerrado).map(p => ({ n: otNumProy(p), etq: 'Proyectos · ' + otNumProy(p) + (p.cliente ? ' · ' + p.cliente : '') })),
    ...(ots || []).filter(o => o.estado !== 'Cerrada').map(o => ({ n: String(o.numero || ''), etq: (o.area || 'OT') + ' · ' + String(o.numero || '') + (o.cliente ? ' · ' + o.cliente : '') }))
  ].filter(o => o.n)
  const proyDeOT = n => (proyectos || []).find(p => otNumProy(p) === String(n || '').trim())
  const ccsDeOT = n => { const p = proyDeOT(n); if (!p) return []; const codes = [...new Set([...Object.keys(p.cc || {}), ...(p.compras || []).map(c => c.cc)])].filter(Boolean); return codes.map(c => ({ id: c, nombre: (p.ccNombres && p.ccNombres[c]) || c })) }
  const imputarFicha = (r, otNum, ccCode) => {
    if (!setProyectos) return
    setProyectos(ps => (ps || []).map(p => {
      const compras = (p.compras || []).filter(c => c.libroId !== r.id)
      if (otNumProy(p) !== String(otNum || '').trim() || !ccCode) return { ...p, compras }
      return { ...p, compras: [...compras, { id: 'lc' + r.id, proveedor: r.provider_name || '', folio: r.document_number || '', rut: r.provider_rut || '', monto: Math.round(Number(r.neto) || 0), cc: ccCode, fecha: r.emission_date || '', detalle: 'SII ' + (r.document_type || ''), origen: 'libro', libroId: r.id }] }
    }))
  }
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [errMsg, setErrMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [q, setQ] = useState('')
  const [mes, setMes] = useState('')
  const [tipo, setTipo] = useState('')
  const [area, setArea] = useState('')
  const [asig, setAsig] = useState(() => { try { return JSON.parse(localStorage.getItem('serein_comprasAreas') || '{}') } catch (e) { return {} } })
  const guardarAsig = (obj) => { setAsig(obj); try { localStorage.setItem('serein_comprasAreas', JSON.stringify(obj)); pushState() } catch (e) {} }
  const toggleArea = (id, a) => { const cur = asig[id] || []; const nx = cur.includes(a) ? cur.filter(x => x !== a) : [...cur, a]; guardarAsig({ ...asig, [id]: nx }) }
  const setGeneral = (id) => guardarAsig({ ...asig, [id]: ['Santa Rosa', 'Istria', 'Proyectos'] })
  const fileRef = useRef(null)
  const [extra, setExtra] = useState(() => { try { return JSON.parse(localStorage.getItem(LS_XLSX) || '[]') } catch (e) { return [] } })
  const guardarExtra = arr => { setExtra(arr); try { localStorage.setItem(LS_XLSX, JSON.stringify(arr)); pushState() } catch (e) {} }

  function importarExcel(file) {
    const toInt = v => { const n = Math.round(Number(v)); if (!isNaN(n)) return n; const m = parseInt(String(v).replace(/\D/g, ''), 10); return isNaN(m) ? 0 : m }
    const fechaDe = v => {
      if (v == null || v === '') return ''
      if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10) }
      const s = String(v); let m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0]
      m = s.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/); if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0')
      return ''
    }
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, blankrows: false })
        if (!filas.length) { window.alert('El archivo esta vacio.'); return }
        let hi = 0
        for (let i = 0; i < Math.min(filas.length, 12); i++) { const tt = (filas[i] || []).map(h => norm(h)).join('|'); if (tt.includes('folio') || tt.includes('proveedor') || tt.includes('neto')) { hi = i; break } }
        const hdr = (filas[hi] || []).map(h => norm(h).trim())
        const col = (...nn) => { for (const nm of nn) { const i = hdr.findIndex(h => h.includes(nm)); if (i >= 0) return i } return -1 }
        const ci = { fecha: col('fecha'), folio: col('folio', 'documento', 'nro'), prov: col('proveedor', 'razon'), rut: col('rut'), tipo: col('tipo'), neto: col('neto', 'afecto'), iva: col('iva'), total: col('total', 'monto') }
        const nuevas = []
        for (let r = hi + 1; r < filas.length; r++) {
          const row = filas[r]; if (!row) continue
          const folio = String(row[ci.folio] ?? '').replace(/\.0$/, '').trim()
          const prov = String(row[ci.prov] ?? '').trim()
          if (!folio && !prov) continue
          const neto = toInt(row[ci.neto])
          const iva = ci.iva >= 0 ? toInt(row[ci.iva]) : Math.round(neto * 0.19)
          const total = ci.total >= 0 && toInt(row[ci.total]) > 0 ? toInt(row[ci.total]) : neto + iva
          nuevas.push({ id: 'x' + folio + '-' + (String(row[ci.rut] ?? '').trim() || r), origen: 'xlsx', emission_date: fechaDe(row[ci.fecha]), document_number: folio, provider_name: prov, provider_rut: String(row[ci.rut] ?? '').trim(), document_type: String(row[ci.tipo] ?? 'Factura').trim(), neto, iva, document_total: total, centro_costo: '', ot_id: '', cc_ot: '', estado_pago: 'Pendiente', factoring: '', dias: 30, dias_mora: 0, vencimiento: '' })
        }
        if (!nuevas.length) { window.alert('No se reconocieron filas. Revisa que el Excel tenga columnas Folio, Proveedor, Neto y Total.'); return }
        const ids = new Set(nuevas.map(x => x.id))
        guardarExtra([...nuevas, ...(extra || []).filter(x => !ids.has(x.id))])
        window.alert('Se importaron ' + nuevas.length + ' documentos. Asignales OT y centro de costo para cargarlos en las fichas.')
      } catch (err) { window.alert('No se pudo leer el Excel: ' + err) }
    }
    reader.readAsArrayBuffer(file)
  }
  const perdidaDe = r => {
    if (r.estado_pago !== 'Factoring') return null
    const f = (factoringList || []).find(x => x.nombre === r.factoring) || (factoringList || [])[0]
    if (!f) return null
    return calcularPerdidaFactoring(Math.round(Number(r.document_total) || 0), r.dias || 30, r.dias_mora || 0, f)
  }

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

  const todas = useMemo(() => {
    const k = r => (r.document_number || '') + '|' + (r.provider_rut || '')
    const vistos = new Set((rows || []).map(k))
    return [...(rows || []), ...(extra || []).filter(r => !vistos.has(k(r)))]
  }, [rows, extra])
  const meses = useMemo(() => {
    const s = new Set(todas.map(r => (r.emission_date || '').slice(0, 7)).filter(Boolean))
    return [...s].sort().reverse()
  }, [todas])
  const tipos = useMemo(() => [...new Set(todas.map(r => r.document_type).filter(Boolean))].sort(), [todas])

  const [sel, setSel] = useState(() => new Set())
  const [verOcultas, setVerOcultas] = useState(false)

  const filtradas = useMemo(() => todas.filter(r => {
    if (verOcultas) { if (!r.oculto) return false } else { if (r.oculto) return false }
    if (mes && (r.emission_date || '').slice(0, 7) !== mes) return false
    if (tipo && r.document_type !== tipo) return false
    if (area && (r.centro_costo || '') !== area) return false
    if (q) { const t = (r.provider_name + ' ' + r.provider_rut + ' ' + r.document_number).toLowerCase(); if (!t.includes(q.toLowerCase())) return false }
    return true
  }), [todas, mes, tipo, area, q, verOcultas])

  const toggleSel = id => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleTodas = () => setSel(s => s.size === filtradas.length ? new Set() : new Set(filtradas.map(r => r.id)))
  const eliminarSel = async () => {
    const elegidas = filtradas.filter(r => sel.has(r.id))
    if (!elegidas.length) return
    if (!window.confirm('Se ocultaran ' + elegidas.length + ' documento(s). Dejaran de verse en la tabla y en los totales, y una nueva sincronizacion no los volvera a mostrar. Puedes recuperarlos con el boton "Ver ocultos". Las filas importadas desde Excel se eliminan definitivamente. Continuar?')) return
    const idsXlsx = elegidas.filter(r => (extra || []).some(x => x.id === r.id)).map(r => r.id)
    if (idsXlsx.length) guardarExtra((extra || []).filter(x => !idsXlsx.includes(x.id)))
    const idsDb = elegidas.filter(r => !idsXlsx.includes(r.id)).map(r => r.id)
    if (idsDb.length) {
      setRows(rs => rs.map(x => idsDb.includes(x.id) ? { ...x, oculto: true } : x))
      try { await supabase.from('libro_compras').update({ oculto: true }).in('id', idsDb) } catch (e) {}
    }
    setSel(new Set())
  }
  const restaurarSel = async () => {
    const ids = filtradas.filter(r => sel.has(r.id) && !(extra || []).some(x => x.id === r.id)).map(r => r.id)
    if (!ids.length) return
    setRows(rs => rs.map(x => ids.includes(x.id) ? { ...x, oculto: false } : x))
    try { await supabase.from('libro_compras').update({ oculto: false }).in('id', ids) } catch (e) {}
    setSel(new Set())
  }

  const tot = useMemo(() => filtradas.reduce((a, r) => ({ neto: a.neto + (+r.neto || 0), iva: a.iva + (+r.iva || 0), total: a.total + (+r.document_total || 0) }), { neto: 0, iva: 0, total: 0 }), [filtradas])

  const setCampo = async (id, campo, valor) => {
    if ((extra || []).some(x => x.id === id)) { guardarExtra((extra || []).map(x => x.id === id ? { ...x, [campo]: valor } : x)); return }
    setRows(rs => rs.map(r => r.id === id ? { ...r, [campo]: valor } : r))
    try { await supabase.from('libro_compras').update({ [campo]: valor }).eq('id', id) } catch (e) { /* columna puede no existir aun */ }
  }

  const mesLabel = ym => { const [y, m] = ym.split('-'); return MESES[(+m) - 1] + ' ' + y }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 20, textTransform: 'uppercase', color: C.navy }}>Libro de Compras</div>
          <div style={{ fontSize: 12, color: C.mut }}>Facturas de compra recibidas (SII) · sincronizado desde Defontana</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls,.csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) importarExcel(f); e.target.value = '' }} />
          <button onClick={() => fileRef.current && fileRef.current.click()} style={{ background: C.orange, color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Importar Excel</button>
          <button onClick={sincronizar} disabled={syncing} style={{ background: C.navy, color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: syncing ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13 }}>
            {syncing ? 'Sincronizando...' : 'Sincronizar con Defontana'}
          </button>
        </div>
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
        <input style={{ ...ip, flex: '2 1 200px' }} placeholder="Buscar proveedor, RUT o folio..." value={q} onChange={e => setQ(e.target.value)} />
        <select style={{ ...ip, flex: '1 1 120px' }} value={mes} onChange={e => setMes(e.target.value)}>
          <option value="">Todos los meses</option>
          {meses.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
        </select>
        <select style={{ ...ip, flex: '1 1 120px' }} value={area} onChange={e => setArea(e.target.value)}>
          <option value="">Todas las areas</option>
          {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select style={{ ...ip, flex: '1 1 120px' }} value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {tipos.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, color: C.mut }}>{sel.size} seleccionado(s)</span>
        {!verOcultas && <button onClick={eliminarSel} disabled={!sel.size} style={{ border: 'none', padding: '7px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12.5, background: sel.size ? C.red : '#E6E8EE', color: sel.size ? '#fff' : C.mut, cursor: sel.size ? 'pointer' : 'default' }}>Eliminar seleccionados</button>}
        {verOcultas && <button onClick={restaurarSel} disabled={!sel.size} style={{ border: 'none', padding: '7px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12.5, background: sel.size ? C.green : '#E6E8EE', color: sel.size ? '#fff' : C.mut, cursor: sel.size ? 'pointer' : 'default' }}>Restaurar seleccionados</button>}
        <button onClick={() => { setVerOcultas(v => !v); setSel(new Set()) }} style={{ background: 'transparent', border: '1px solid ' + C.border, padding: '7px 12px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer', color: C.navy }}>{verOcultas ? 'Volver al libro' : 'Ver ocultos'}</button>
      </div>

      {loading ? <div style={{ color: C.mut, padding: 20 }}>Cargando...</div> : errMsg ? <div style={{ background: '#FDECEC', border: '1px solid ' + C.red, color: C.red, padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>{errMsg}</div> : filtradas.length === 0 ? (
        <div style={{ color: C.mut, padding: 20, textAlign: 'center', border: '1px dashed ' + C.border, borderRadius: 8 }}>
          Sin documentos. Presiona <b>Sincronizar con Defontana</b> para traer el libro de compras del ano.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid ' + C.border, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1200 }}>
            <thead>
              <tr style={{ background: C.navy, color: '#fff' }}>
                <th style={{ padding: '9px 10px', width: 34 }}><input type="checkbox" checked={filtradas.length > 0 && sel.size === filtradas.length} onChange={toggleTodas} /></th>
                {['Emision', 'Proveedor', 'Folio', 'Tipo', 'Neto', 'IVA', 'Total', 'OT', 'Centro de costo', 'Area', 'Pago', 'Reparto area'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Neto' || h === 'IVA' || h === 'Total' ? 'right' : 'left', padding: '9px 10px', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #EEECE4' }}>
                  <td style={{ padding: '7px 10px' }}><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{r.emission_date || '-'}</td>
                  <td style={{ padding: '7px 10px' }}><div style={{ fontWeight: 600 }}>{r.provider_name || '-'}</div><div style={{ color: C.mut, fontSize: 11 }}>{r.provider_rut}</div></td>
                  <td style={{ padding: '7px 10px' }}>{r.document_number}</td>
                  <td style={{ padding: '7px 10px', fontSize: 11.5 }}>{r.document_type}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{clp(r.neto)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: C.orange }}>{clp(r.iva)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{clp(r.document_total)}</td>
                  <td style={{ padding: '7px 10px' }}>
                    <select style={{ ...sel, minWidth: 130 }} value={r.ot_id || ''} onChange={e => { const v = e.target.value; setCampo(r.id, 'ot_id', v); setCampo(r.id, 'cc_ot', ''); imputarFicha(r, v, '') }}>
                      <option value="">- sin OT -</option>
                      {otsActivas.map(o => <option key={o.etq} value={o.n}>{o.etq}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <select style={{ ...sel, minWidth: 150 }} value={r.cc_ot || ''} disabled={ccsDeOT(r.ot_id).length === 0} onChange={e => { const v = e.target.value; setCampo(r.id, 'cc_ot', v); imputarFicha(r, r.ot_id, v) }}>
                      <option value="">{ccsDeOT(r.ot_id).length ? '- centro de costo -' : '-'}</option>
                      {ccsDeOT(r.ot_id).map(c => <option key={c.id} value={c.id}>{c.id} · {c.nombre}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <select style={{ ...sel, minWidth: 110 }} value={r.centro_costo || ''} onChange={e => setCampo(r.id, 'centro_costo', e.target.value)}>
                      <option value="">- area -</option>
                      {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <select style={{ ...sel, minWidth: 100, color: colorPago(r.estado_pago), fontWeight: 600 }} value={r.estado_pago || ''} onChange={e => setCampo(r.id, 'estado_pago', e.target.value)}>
                      <option value="">- pago -</option>
                      {ESTADOS_PAGO.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                    {r.estado_pago === 'Factoring' ? (
                      <div style={{ marginTop: 5, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                        <select style={{ ...sel, minWidth: 110 }} value={r.factoring || ''} onChange={e => setCampo(r.id, 'factoring', e.target.value)}>
                          <option value="">- factoring -</option>
                          {factoringList.map(f => <option key={f.id} value={f.nombre}>{f.nombre}</option>)}
                        </select>
                        <select style={{ ...sel }} value={r.dias || 30} onChange={e => setCampo(r.id, 'dias', parseInt(e.target.value, 10))}>
                          {DIAS_OPC.map(d => <option key={d} value={d}>{d} dias</option>)}
                        </select>
                        <input placeholder="Mora" style={{ ...sel, width: 70 }} value={r.dias_mora || ''} onChange={e => setCampo(r.id, 'dias_mora', parseInt(String(e.target.value).replace(/\D/g, ''), 10) || 0)} />
                        <input type="date" title="Vencimiento factura" style={{ ...sel }} value={r.vencimiento || ''} onChange={e => setCampo(r.id, 'vencimiento', e.target.value)} />
                        {perdidaDe(r) ? <span style={{ color: C.red, fontWeight: 700, fontSize: 11.5 }}>Descuento: {clp(perdidaDe(r).total)}</span> : null}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: '7px 10px' }}><div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>{[['Santa Rosa', 'SR'], ['Istria', 'IST'], ['Proyectos', 'PROY']].map(a => { const on = (asig[r.id] || []).includes(a[0]); return <button key={a[0]} onClick={() => toggleArea(r.id, a[0])} title={a[0]} style={{ border: '1px solid ' + (on ? C.navy : '#CBD2D6'), background: on ? C.navy : '#fff', color: on ? '#fff' : C.mut, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, cursor: 'pointer' }}>{a[1]}</button> })}<button onClick={() => setGeneral(r.id)} title="General: 1/3 a cada area" style={{ border: '1px dashed #CBD2D6', background: '#fff', color: C.mut, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, cursor: 'pointer' }}>Gen</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
