import React, { useEffect, useMemo, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabase.js'
import { pushState } from './sync.js'
import { calcularPerdidaFactoring } from './ParametrosModule.jsx'

const C = { navy: '#061A40', orange: '#FF6B00', gray: '#F5F7FA', border: '#D8DCE5', green: '#16A34A', red: '#DC2626', mut: '#7A8288' }
const clp = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const ip = { padding: '6px 8px', border: '1px solid ' + C.border, fontSize: 12.5, boxSizing: 'border-box', borderRadius: 4 }
const sel = { padding: '4px 6px', border: '1px solid ' + C.border, fontSize: 12, borderRadius: 4, background: '#fff' }
// Muestra una fecha ISO (aaaa-mm-dd) como DD/MM/AAAA
const fmtF = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : (v || '-') }
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const AREAS = ['Santa Rosa', 'Istria', 'Proyectos']
const ESTADOS_PAGO = ['Pendiente', 'Pagado', 'Factoring', 'Vencida', 'Anulada']
const DIAS_OPC = [30, 45, 60, 90]
const LS_KEY = 'serein_libroVentasXlsx'
const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const colorPago = e => e === 'Pagado' ? C.green : e === 'Factoring' ? C.orange : e === 'Vencida' ? C.red : C.mut

export default function LibroVentasModule({ ots = [], proyectos = [], facturas = {}, setFacturas = () => {}, params = { factoring: [] } }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [errMsg, setErrMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [q, setQ] = useState('')
  const [mes, setMes] = useState('')
  const [tipo, setTipo] = useState('')
  const [fArea, setFArea] = useState('')
  const fileRef = useRef(null)
  const [extra, setExtra] = useState(() => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch (e) { return [] } })
  const guardarExtra = arr => { setExtra(arr); try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); pushState() } catch (e) {} }

  const facs = params.factoring || []
  const otNumProy = p => String(p.ot || '').trim()
  const otsActivas = [
    ...(proyectos || []).filter(p => !p.cerrado).map(p => ({ n: otNumProy(p), etq: 'Proyectos - ' + otNumProy(p) + (p.cliente ? ' - ' + p.cliente : '') })),
    ...(ots || []).filter(o => o.estado !== 'Cerrada').map(o => ({ n: String(o.numero || ''), etq: (o.area || 'OT') + ' - ' + String(o.numero || '') + (o.cliente ? ' - ' + o.cliente : '') }))
  ].filter(o => o.n)
  const proyDeOT = n => (proyectos || []).find(p => otNumProy(p) === String(n || '').trim())
  const ccsDeOT = n => { const p = proyDeOT(n); if (!p) return []; const codes = [...new Set([...Object.keys(p.cc || {}), ...(p.compras || []).map(c => c.cc)])].filter(Boolean); return codes.map(c => ({ id: c, nombre: (p.ccNombres && p.ccNombres[c]) || c })) }

  const cargar = async () => {
    setLoading(true); setErrMsg('')
    const { data, error } = await supabase.from('libro_ventas').select('*').order('emission_date', { ascending: false })
    if (error) setErrMsg('No se pudo leer el libro de ventas: ' + error.message)
    else setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  const sincronizar = async () => {
    setSyncing(true); setSyncMsg('')
    try {
      const { data, error } = await supabase.functions.invoke('libro-ventas-sync')
      if (error) throw error
      if (data && data.ok) { setSyncMsg('Sincronizado: ' + (data.nuevas ?? 0) + ' nuevos, ' + (data.actualizadas ?? 0) + ' actualizados.'); await cargar() }
      else setSyncMsg('La funcion respondio: ' + JSON.stringify(data))
    } catch (e) { setSyncMsg('Error al sincronizar: ' + (e.message || String(e))) }
    setSyncing(false)
  }

  // ---------- Importar Excel ----------
  function importarExcel(file) {
    const toInt = v => { const n = Math.round(Number(v)); if (!isNaN(n)) return n; const m = parseInt(String(v).replace(/\D/g, ''), 10); return isNaN(m) ? 0 : m }
    const fechaDe = v => {
      if (v === null || v === undefined || v === '') return ''
      if (v instanceof Date && !isNaN(v.getTime())) {
        const y = v.getFullYear(), mo = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0')
        return y + '-' + mo + '-' + d
      }
      if (typeof v === 'number' && isFinite(v)) {
        // Numero de serie de Excel (base 1899-12-30). Se arma en UTC para no correr un dia por zona horaria.
        const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)
        return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
      }
      const s = String(v).trim()
      let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
      if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0')
      // DD-MM-AAAA o DD/MM/AAAA (formato chileno: el dia va primero)
      m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
      if (m) {
        let y = m[3]
        if (y.length === 2) y = (Number(y) > 70 ? '19' : '20') + y
        return y + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0')
      }
      return ''
    }
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        // El CSV del SII (separador ;) se lee en crudo: si lo procesa SheetJS, interpreta 07/01/2026 como 7 de julio.
        const esCsv = /\.csv$/i.test(file.name || '')
        let filas, filasTxt
        if (esCsv) {
          const buf = new Uint8Array(ev.target.result)
          let txt = new TextDecoder('utf-8').decode(buf)
          if (txt.includes('\uFFFD')) txt = new TextDecoder('windows-1252').decode(buf)
          const lineas = txt.split(/\r?\n/).filter(l => l.trim() !== '')
          const cab = lineas[0] || ''
          const sep = (cab.split(';').length > cab.split(',').length) ? ';' : ((cab.split('\t').length > cab.split(',').length) ? '\t' : ',')
          filas = lineas.map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim()))
          filasTxt = filas
        } else {
          const wb = XLSX.read(ev.target.result, { type: 'array' })
          const hoja = wb.SheetNames[0]
          filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, blankrows: false })
          // Texto tal como se ve en Excel: la fecha se lee de aqui (dia primero)
          filasTxt = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: false, blankrows: false })
        }
        if (!filas.length) { window.alert('El archivo esta vacio.'); return }
        let hi = 0
        for (let i = 0; i < Math.min(filas.length, 12); i++) { const t = (filas[i] || []).map(h => norm(h)).join('|'); if (t.includes('folio') || t.includes('documento') || t.includes('neto')) { hi = i; break } }
        const hdr = (filas[hi] || []).map(h => norm(h).trim())
        const col = (...nn) => { for (const nm of nn) { const i = hdr.findIndex(h => h.includes(nm)); if (i >= 0) return i } return -1 }
        const ci = { folio: col('folio', 'documento', 'nro', 'n\u00b0'), rut: col('rut'), tipo: col('tipo'), neto: col('neto', 'afecto'), iva: col('iva'), total: col('total', 'monto'), venc: col('vencim') }
        // Fecha del documento: nunca las columnas de vencimiento / recepcion / acuse / pago
        const noFecha = h => h.includes('vencim') || h.includes('recep') || h.includes('acuse') || h.includes('pago') || h.includes('reclam')
        let iF = hdr.findIndex(h => !noFecha(h) && (h.includes('fecha docto') || h.includes('fecha documento') || h.includes('fecha emis') || h.includes('emision')))
        if (iF < 0) iF = hdr.findIndex(h => !noFecha(h) && h.includes('fecha'))
        ci.fecha = iF
        // Nombre del cliente: nunca la columna de RUT (ej. 'Rut Cliente'), y sin acentos ('Raz\u00f3n Social')
        const sinRut = h => !h.includes('rut')
        let ic = hdr.findIndex(h => sinRut(h) && (h.includes('razon') || h.includes('nombre') || h.includes('senor')))
        if (ic < 0) ic = hdr.findIndex(h => sinRut(h) && h.includes('cliente'))
        ci.cli = ic === ci.rut ? -1 : ic
        const nuevas = []
        for (let r = hi + 1; r < filas.length; r++) {
          const row = filas[r]; if (!row) continue
          const folio = String(row[ci.folio] ?? '').replace(/\.0$/, '').trim()
          const cliente = ci.cli >= 0 ? String(row[ci.cli] || '').trim() : ''
          if (!folio) continue
          const neto = toInt(row[ci.neto])
          const iva = ci.iva >= 0 ? toInt(row[ci.iva]) : Math.round(neto * 0.19)
          const total = ci.total >= 0 && toInt(row[ci.total]) > 0 ? toInt(row[ci.total]) : neto + iva
          nuevas.push({ id: 'x' + folio + '-' + (String(row[ci.rut] ?? '').trim() || r), origen: 'xlsx', emission_date: fechaDe((filasTxt[r] || [])[ci.fecha] != null && (filasTxt[r] || [])[ci.fecha] !== '' ? (filasTxt[r] || [])[ci.fecha] : row[ci.fecha]), document_number: folio, client_name: cliente, client_rut: String(row[ci.rut] ?? '').trim(), document_type: String(row[ci.tipo] ?? 'Factura').trim(), neto, iva, total, vencimiento: fechaDe(row[ci.venc]), status: 'Importada', area: '', ot_id: '', cc_ot: '', estado_pago: 'Pendiente', factoring_id: '', dias: 30, dias_mora: 0, fecha_pago: '', banco: '' })
        }
        if (!nuevas.length) { window.alert('No se reconocieron filas. Revisa que el Excel tenga columnas Folio, Cliente, Neto y Total.') ; return }
        const ids = new Set(nuevas.map(x => x.id))
        const conservadas = (extra || []).filter(x => !ids.has(x.id))
        guardarExtra([...nuevas, ...conservadas])
        window.alert('Se importaron ' + nuevas.length + ' documentos. Ahora asignales area y OT para que se carguen solos en las fichas.')
      } catch (err) { window.alert('No se pudo leer el Excel: ' + err) }
    }
    reader.readAsArrayBuffer(file)
  }

  // ---------- Sincronizacion automatica hacia las fichas (via Facturas del area) ----------
  // Notas de credito (tipo 61): restan de la venta
  const esNC = r => String(r.document_type || '').trim() === '61'
  const sgn = r => esNC(r) ? -1 : 1
  const fichaDe = r => ({ id: 'lv' + r.id, libroId: 'LV' + r.id, origen: 'libroVentas', numero: String(r.document_number || ''), cliente: r.client_name || '', ot: String(r.ot_id || ''), cc: r.cc_ot || '', fecha_emision: r.emission_date || '', vencimiento: r.vencimiento || '', neto: sgn(r) * Math.round(Number(r.neto) || 0), monto: sgn(r) * Math.round(Number(r.total) || 0), estado: r.estado_pago || 'Pendiente', fecha_pago: r.fecha_pago || '', banco: r.banco || '', factoringId: r.factoring_id || '', dias: r.dias || 30, diasMora: r.dias_mora || 0, comentarios: 'Importada del Libro de Ventas', vendedor: 'General' })
  const vaAFacturas = r => !!r.area && !r.oculto && r.estado_pago !== 'Anulada'

  const sincronizarFicha = r => {
    const libroId = 'LV' + r.id
    const base = {}
    let previa = null
    Object.keys(facturas || {}).forEach(a => {
      (facturas[a] || []).forEach(f => { if (f.libroId === libroId) previa = f })
      base[a] = (facturas[a] || []).filter(f => f.libroId !== libroId)
    })
    if (vaAFacturas(r)) {
      // Se conserva lo editado en Facturas (OC, centro de costo, etc.); el libro solo pisa lo que trae con valor
      const f = fichaDe(r)
      const merge = { ...(previa || {}) }
      Object.keys(f).forEach(k => { if (f[k] !== '' && f[k] !== null && f[k] !== undefined) merge[k] = f[k] })
      base[r.area] = [merge, ...(base[r.area] || [])]
    }
    setFacturas(base)
  }

  const setCampo = async (r, campo, valor) => {
    const nueva = { ...r, [campo]: valor }
    if (r.origen === 'xlsx') { guardarExtra((extra || []).map(x => x.id === r.id ? nueva : x)) }
    else {
      setRows(rs => rs.map(x => x.id === r.id ? nueva : x))
      try { await supabase.from('libro_ventas').update({ [campo]: valor }).eq('id', r.id) }
      catch (e) { setErrMsg('Error al guardar "' + campo + '": ' + (e.message || e) + ' — el cambio no quedó guardado, refresca la página.') }
    }
    sincronizarFicha(nueva)
  }

  const todas = useMemo(() => {
    const k = r => (r.document_number || '') + '|' + (r.client_rut || '')
    const vistos = new Set((rows || []).map(k))
    return [...(rows || []), ...(extra || []).filter(r => !vistos.has(k(r)))]
  }, [rows, extra])

  // Mantiene Facturas al dia con el libro, SIN pisar lo que se edita en Facturas:
  // solo agrega las ventas nuevas (con area) y saca las que se ocultaron/anularon.
  useEffect(() => {
    if (loading || !todas.length) return
    const base = {}
    Object.keys(facturas || {}).forEach(a => { base[a] = [...(facturas[a] || [])] })
    const validos = new Set()
    todas.forEach(r => {
      if (!vaAFacturas(r)) return
      const libroId = 'LV' + r.id
      validos.add(libroId)
      const yaEsta = Object.keys(base).some(a => (base[a] || []).some(f => f.libroId === libroId))
      if (!yaEsta) base[r.area] = [...(base[r.area] || []), fichaDe(r)]
    })
    Object.keys(base).forEach(a => { base[a] = (base[a] || []).filter(f => f.origen !== 'libroVentas' || validos.has(f.libroId)) })
    if (JSON.stringify(facturas || {}) !== JSON.stringify(base)) setFacturas(base)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todas, loading])

  const meses = useMemo(() => [...new Set(todas.map(r => (r.emission_date || '').slice(0, 7)).filter(Boolean))].sort().reverse(), [todas])
  const tipos = useMemo(() => [...new Set(todas.map(r => r.document_type).filter(Boolean))].sort(), [todas])

  const [sel, setSel] = useState(() => new Set())
  const [verOcultas, setVerOcultas] = useState(false)
  const filtradas = useMemo(() => todas.filter(r => {
    if (verOcultas) { if (!r.oculto) return false } else { if (r.oculto) return false }
    if (mes && (r.emission_date || '').slice(0, 7) !== mes) return false
    if (tipo && r.document_type !== tipo) return false
    if (fArea && (r.area || '') !== fArea) return false
    if (q) { const t = ((r.client_name || '') + ' ' + (r.client_rut || '') + ' ' + (r.document_number || '') + ' ' + (r.ot_id || '')).toLowerCase(); if (!t.includes(q.toLowerCase())) return false }
    return true
  }), [todas, mes, tipo, fArea, q, verOcultas])
  const toggleSel = id => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleTodas = () => setSel(s => s.size === filtradas.length ? new Set() : new Set(filtradas.map(r => r.id)))
  const eliminarSel = async () => {
    const elegidas = filtradas.filter(r => sel.has(r.id))
    if (!elegidas.length) return
    if (!window.confirm('Se ocultaran ' + elegidas.length + ' documento(s). Dejaran de verse en la tabla y en los totales, y una nueva sincronizacion no los volvera a mostrar. Puedes recuperarlos con el boton "Ver ocultos". Las filas importadas desde Excel se eliminan definitivamente. Continuar?')) return
    const idsXlsx = elegidas.filter(r => r.origen === 'xlsx').map(r => r.id)
    if (idsXlsx.length) guardarExtra((extra || []).filter(x => !idsXlsx.includes(x.id)))
    const idsDb = elegidas.filter(r => r.origen !== 'xlsx').map(r => r.id)
    if (idsDb.length) {
      setRows(rs => rs.map(x => idsDb.includes(x.id) ? { ...x, oculto: true } : x))
      try { await supabase.from('libro_ventas').update({ oculto: true }).in('id', idsDb) } catch (e) { setErrMsg('Error al ocultar: ' + (e.message || e)) }
    }
    setSel(new Set())
  }
  const restaurarSel = async () => {
    const ids = filtradas.filter(r => sel.has(r.id) && r.origen !== 'xlsx').map(r => r.id)
    if (!ids.length) return
    setRows(rs => rs.map(x => ids.includes(x.id) ? { ...x, oculto: false } : x))
    try { await supabase.from('libro_ventas').update({ oculto: false }).in('id', ids) } catch (e) { setErrMsg('Error al restaurar: ' + (e.message || e)) }
    setSel(new Set())
  }

  const facturaVacia = { emission_date: new Date().toISOString().slice(0, 10), document_number: '', client_name: '', client_rut: '', document_type: 'Factura', neto: '', iva: '', area: '' }
  const [mostrarAgregar, setMostrarAgregar] = useState(false)
  const [nuevaFC, setNuevaFC] = useState(facturaVacia)
  const setNuevaFCCampo = (campo, valor) => setNuevaFC(f => {
    const nf = { ...f, [campo]: valor }
    if (campo === 'neto') nf.iva = Math.round((Number(valor) || 0) * 0.19)
    return nf
  })
  const agregarFactura = async () => {
    const neto = Number(nuevaFC.neto) || 0
    if (!nuevaFC.client_name.trim() || neto <= 0) { window.alert('Ingresa al menos el cliente y un neto mayor a 0.'); return }
    const iva = Math.round(neto * 0.19)
    const reg = {
      emission_date: nuevaFC.emission_date || new Date().toISOString().slice(0, 10),
      document_number: nuevaFC.document_number.trim(),
      client_name: nuevaFC.client_name.trim(),
      client_rut: nuevaFC.client_rut.trim(),
      document_type: nuevaFC.document_type || 'Factura',
      neto, iva, total: neto + iva, area: nuevaFC.area || null, estado_pago: 'Pendiente', oculto: false,
    }
    try {
      const { data, error } = await supabase.from('libro_ventas').insert(reg).select().single()
      if (error) throw error
      setRows(rs => [data, ...rs])
      setNuevaFC(facturaVacia); setMostrarAgregar(false)
    } catch (e) { window.alert('No se pudo guardar la factura: ' + (e.message || e)) }
  }

  const perdidaDe = r => {
    if (r.estado_pago !== 'Factoring') return null
    const f = facs.find(x => x.id === r.factoring_id) || facs[0]
    if (!f) return null
    return calcularPerdidaFactoring(Math.round(Number(r.total) || 0), r.dias || 30, r.dias_mora || 0, f)
  }

  const tot = useMemo(() => filtradas.reduce((a, r) => { const p = perdidaDe(r); const s = sgn(r); return { neto: a.neto + s * (+r.neto || 0), iva: a.iva + s * (+r.iva || 0), total: a.total + s * (+r.total || 0), fact: a.fact + (p ? p.total : 0) } }, { neto: 0, iva: 0, total: 0, fact: 0 }), [filtradas, facs])
  const mesLabel = ym => { const [y, m] = ym.split('-'); return MESES[(+m) - 1] + ' ' + y }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 20, textTransform: 'uppercase', color: C.navy }}>Libro de Ventas</div>
          <div style={{ fontSize: 12, color: C.mut }}>Facturas de venta emitidas - desde Defontana o importadas desde Excel</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls,.csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) importarExcel(f); e.target.value = '' }} />
          <button onClick={() => setMostrarAgregar(v => !v)} style={{ background: '#fff', color: C.navy, border: '1px solid ' + C.navy, padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{mostrarAgregar ? 'Cancelar' : '+ Agregar factura'}</button>
          <button onClick={() => fileRef.current && fileRef.current.click()} style={{ background: C.orange, color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Importar Excel</button>
          <button onClick={sincronizar} disabled={syncing} style={{ background: C.navy, color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: syncing ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13 }}>{syncing ? 'Sincronizando...' : 'Sincronizar con Defontana'}</button>
        </div>
      </div>

      {mostrarAgregar && (
        <div style={{ border: '1px solid ' + C.border, borderRadius: 8, padding: 14, marginBottom: 14, background: C.gray, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <label style={{ fontSize: 11, color: C.mut }}>Fecha emisión<input type="date" value={nuevaFC.emission_date} onChange={e => setNuevaFCCampo('emission_date', e.target.value)} style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>Cliente<input value={nuevaFC.client_name} onChange={e => setNuevaFCCampo('client_name', e.target.value)} placeholder="Razón social" style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>RUT cliente<input value={nuevaFC.client_rut} onChange={e => setNuevaFCCampo('client_rut', e.target.value)} placeholder="12.345.678-9" style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>N° folio<input value={nuevaFC.document_number} onChange={e => setNuevaFCCampo('document_number', e.target.value)} style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>Tipo documento<input value={nuevaFC.document_type} onChange={e => setNuevaFCCampo('document_type', e.target.value)} style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>Área<select value={nuevaFC.area} onChange={e => setNuevaFCCampo('area', e.target.value)} style={ip}><option value="">- área -</option>{AREAS.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
          <label style={{ fontSize: 11, color: C.mut }}>Neto<input type="number" value={nuevaFC.neto} onChange={e => setNuevaFCCampo('neto', e.target.value)} placeholder="0" style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>IVA (19%)<input value={clp(nuevaFC.iva)} disabled style={{ ...ip, background: '#eee' }} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>Total<input value={clp((Number(nuevaFC.neto) || 0) + (Number(nuevaFC.iva) || 0))} disabled style={{ ...ip, background: '#eee', fontWeight: 700 }} /></label>
          <button onClick={agregarFactura} style={{ padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: 'none', background: C.navy, color: '#fff' }}>Guardar factura</button>
        </div>
      )}

      {syncMsg ? <div style={{ background: syncMsg.startsWith('Error') ? '#FDECEC' : '#EAF7EE', border: '1px solid ' + (syncMsg.startsWith('Error') ? C.red : C.green), color: syncMsg.startsWith('Error') ? C.red : '#15803D', padding: '8px 12px', borderRadius: 6, fontSize: 12.5, marginBottom: 12 }}>{syncMsg}</div> : null}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {[['Documentos', filtradas.length, C.navy], ['Neto', clp(tot.neto), C.navy], ['IVA', clp(tot.iva), C.orange], ['Total', clp(tot.total), C.navy], ['Perdida factoring', clp(tot.fact), C.red]].map(([k, v, col], i) => (
          <div key={i} style={{ flex: '1 1 130px', border: '1px solid ' + C.border, borderRadius: 6, padding: '10px 12px', background: C.gray }}>
            <div style={{ fontSize: 11, color: C.mut, textTransform: 'uppercase', fontWeight: 700 }}>{k}</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: col }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input style={{ ...ip, flex: '2 1 220px' }} placeholder="Buscar cliente, RUT, folio u OT..." value={q} onChange={e => setQ(e.target.value)} />
        <select style={{ ...ip, flex: '1 1 120px' }} value={mes} onChange={e => setMes(e.target.value)}><option value="">Todos los meses</option>{meses.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}</select>
        <select style={{ ...ip, flex: '1 1 120px' }} value={fArea} onChange={e => setFArea(e.target.value)}><option value="">Todas las areas</option>{AREAS.map(a => <option key={a} value={a}>{a}</option>)}</select>
        <select style={{ ...ip, flex: '1 1 120px' }} value={tipo} onChange={e => setTipo(e.target.value)}><option value="">Todos los tipos</option>{tipos.map(t => <option key={t} value={t}>{t}</option>)}</select>
      </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontSize: 12.5, color: C.mut }}>{sel.size} seleccionado(s)</span>
          {!verOcultas && <button onClick={eliminarSel} disabled={!sel.size} style={{ ...{ border: 'none', padding: '7px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12.5 }, background: sel.size ? C.red : '#E6E8EE', color: sel.size ? '#fff' : C.mut, cursor: sel.size ? 'pointer' : 'default' }}>Eliminar seleccionados</button>}
          {verOcultas && <button onClick={restaurarSel} disabled={!sel.size} style={{ ...{ border: 'none', padding: '7px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12.5 }, background: sel.size ? C.green : '#E6E8EE', color: sel.size ? '#fff' : C.mut, cursor: sel.size ? 'pointer' : 'default' }}>Restaurar seleccionados</button>}
          <button onClick={() => { setVerOcultas(v => !v); setSel(new Set()) }} style={{ background: 'transparent', border: '1px solid ' + C.border, padding: '7px 12px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer', color: C.navy }}>{verOcultas ? 'Volver al libro' : 'Ver ocultos'}</button>
        </div>

      {loading ? <div style={{ color: C.mut, padding: 20 }}>Cargando...</div> : errMsg ? <div style={{ background: '#FDECEC', border: '1px solid ' + C.red, color: C.red, padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>{errMsg}</div> : filtradas.length === 0 ? (
        <div style={{ color: C.mut, padding: 20, textAlign: 'center', border: '1px dashed ' + C.border, borderRadius: 8 }}>Sin documentos. Usa <b>Importar Excel</b> o <b>Sincronizar con Defontana</b>.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid ' + C.border, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1500 }}>
            <thead>
              <tr style={{ background: C.navy, color: '#fff' }}>
                <th style={{ padding: '9px 10px', width: 34 }}><input type="checkbox" checked={filtradas.length > 0 && sel.size === filtradas.length} onChange={toggleTodas} /></th>
                {['Emision', 'Cliente', 'Folio', 'Tipo', 'Neto', 'IVA', 'Total', 'Area', 'OT', 'Centro de costo', 'Estado pago', 'Fecha pago'].map(h => (
                  <th key={h} style={{ textAlign: ['Neto', 'IVA', 'Total'].includes(h) ? 'right' : 'left', padding: '9px 10px', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(r => {
                const perd = perdidaDe(r)
                return (
                <React.Fragment key={r.id}>
                <tr style={{ borderBottom: perd ? 'none' : '1px solid #EEECE4' }}>
                  <td style={{ padding: '7px 10px' }}><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{fmtF(r.emission_date)}</td>
                  <td style={{ padding: '7px 10px' }}><div style={{ fontWeight: 600 }}>{r.client_name || r.client_rut || '-'}</div><div style={{ color: C.mut, fontSize: 11 }}>{r.client_rut}{r.origen === 'xlsx' ? ' - Excel' : ''}</div></td>
                  <td style={{ padding: '7px 10px' }}>{r.document_number}</td>
                  <td style={{ padding: '7px 10px', fontSize: 11.5 }}>{r.document_type}{esNC(r) ? <span style={{ marginLeft: 5, background: C.red, color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 700 }}>NC</span> : null}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: esNC(r) ? C.red : undefined }}>{clp(sgn(r) * (+r.neto || 0))}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: esNC(r) ? C.red : C.orange }}>{clp(sgn(r) * (+r.iva || 0))}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: esNC(r) ? C.red : undefined }}>{clp(sgn(r) * (+r.total || 0))}</td>
                  <td style={{ padding: '7px 10px' }}>
                    <select style={{ ...sel, minWidth: 110 }} value={r.area || ''} onChange={e => setCampo(r, 'area', e.target.value)}>
                      <option value="">- area -</option>
                      {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <select style={{ ...sel, minWidth: 140 }} value={r.ot_id || ''} onChange={e => { const v = e.target.value; setCampo(r, 'ot_id', v) }}>
                      <option value="">- sin OT -</option>
                      {otsActivas.map(o => <option key={o.etq} value={o.n}>{o.etq}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <select style={{ ...sel, minWidth: 150 }} value={r.cc_ot || ''} disabled={ccsDeOT(r.ot_id).length === 0} onChange={e => setCampo(r, 'cc_ot', e.target.value)}>
                      <option value="">{ccsDeOT(r.ot_id).length ? '- centro de costo -' : '-'}</option>
                      {ccsDeOT(r.ot_id).map(c => <option key={c.id} value={c.id}>{c.id} - {c.nombre}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <select style={{ ...sel, minWidth: 110, color: colorPago(r.estado_pago), fontWeight: 600 }} value={r.estado_pago || 'Pendiente'} onChange={e => setCampo(r, 'estado_pago', e.target.value)}>
                      {ESTADOS_PAGO.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '7px 10px' }}><input type="date" style={{ ...sel }} value={r.fecha_pago || ''} onChange={e => setCampo(r, 'fecha_pago', e.target.value)} /></td>
                </tr>
                {esNC(r) && (
                  <tr style={{ background: '#FDECEC', borderBottom: '1px solid #EEECE4' }}>
                    <td colSpan={13} style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
                        <b style={{ color: C.red }}>Nota de credito</b>
                        <span style={{ color: C.mut }}>Anula / rebaja la factura N\u00b0</span>
                        <input list={'facturas-' + r.id} value={r.anula_folio || ''} onChange={e => setCampo(r, 'anula_folio', e.target.value)} placeholder="Folio de la factura" style={{ ...ip, width: 160 }} />
                        <datalist id={'facturas-' + r.id}>
                          {todas.filter(x => !esNC(x) && x.client_rut === r.client_rut).map(x => <option key={x.id} value={String(x.document_number || '')}>{x.document_number} - {clp(x.total)}</option>)}
                        </datalist>
                        {r.anula_folio ? <span style={{ color: C.mut }}>Anula la factura {r.anula_folio}</span> : <span style={{ color: C.mut }}>Sin factura asociada</span>}
                      </div>
                    </td>
                  </tr>
                )}
                {perd ? (
                  <tr style={{ background: '#FBF3EE', borderBottom: '1px solid #EEECE4' }}>
                    <td colSpan={13} style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                        <span style={{ color: C.mut, fontWeight: 700 }}>FACTORING:</span>
                        <select style={sel} value={r.factoring_id || (facs[0] ? facs[0].id : '')} onChange={e => setCampo(r, 'factoring_id', e.target.value)}>
                          {facs.length === 0 && <option value="">(define en Parametros)</option>}
                          {facs.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                        </select>
                        <select style={sel} value={r.dias || 30} onChange={e => setCampo(r, 'dias', parseInt(e.target.value, 10))}>
                          {DIAS_OPC.map(d => <option key={d} value={d}>{d} dias</option>)}
                        </select>
                        <input placeholder="Dias mora" style={{ ...sel, width: 90 }} value={r.dias_mora || ''} onChange={e => setCampo(r, 'dias_mora', parseInt(String(e.target.value).replace(/\D/g, ''), 10) || 0)} />
                        <span style={{ color: C.red, fontWeight: 700 }}>Descuento factoring: {clp(perd.total)}</span>
                        <span style={{ color: C.mut }}>(interes {clp(perd.interes)} + costo op {clp(perd.costoOp)}{perd.mora ? ' + mora ' + clp(perd.mora) : ''}) - Recibes: <b style={{ color: C.navy }}>{clp((Number(r.total) || 0) - perd.total)}</b></span>
                      </div>
                    </td>
                  </tr>
                ) : null}
                </React.Fragment>
              ) })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: C.mut, marginTop: 8 }}>
        Al asignar <b>area</b> y <b>OT</b>, la venta se carga automaticamente en la ficha de esa OT y en el consolidado. Todo queda guardado en la nube.
      </div>
    </div>
  )
}
