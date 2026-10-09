import React, { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabase.js'
import { SEREIN } from './theme-serein.js'
import { Mail, FileText, Send, ClipboardCheck, Users, Download, Check, Pencil, X, Paperclip, AlertTriangle, CheckCircle2, Info } from 'lucide-react'

// ============================================================
// Módulo Correos: órdenes de compra que llegan y cotizaciones que se envían,
// leídas desde el correo de Serein por la función correos-ingresar (ver
// supabase/functions/correos-ingresar y integraciones/correos-google-apps-script.gs).
// Aquí solo se ven, se corrigen y se cruzan; no se envía ni se borra nada del correo.
// ============================================================

const C = { ink: SEREIN.ink, text: SEREIN.text, soft: SEREIN.textSoft, faint: SEREIN.textFaint, line: SEREIN.line, orange: SEREIN.orange, verde: SEREIN.green, rojo: SEREIN.red, azul: SEREIN.blue, ambar: '#B8720C' }
const clp = n => (n == null || n === '' ? '—' : '$' + Math.round(Number(n) || 0).toLocaleString('es-CL'))
const fmtF = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : '—' }
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
const fechaDe = d => d.fecha_documento || String(d.fecha_correo || '').slice(0, 10)
const rutLimpio = d => String(d.rut_cliente || '').replace(/[^0-9kK]/g, '').toUpperCase()
// "Kronos Chile" y "KRONOS CHILE SPA" son el mismo cliente: se compara el nombre sin la forma legal
const FORMAS_LEGALES = new Set(['spa', 'sa', 'ltda', 'limitada', 'eirl', 'srl'])
const baseNombre = d => norm(d.cliente).replace(/[^a-z0-9 ]/g, '').split(' ').filter(t => t && !FORMAS_LEGALES.has(t)).join(' ')
const claveCliente = d => rutLimpio(d) || baseNombre(d) || '(sin cliente)'
const digitos = s => String(s || '').replace(/\D/g, '')
const tok = s => String(s || '').toUpperCase().split(/[^A-Z0-9]+/).filter(t => t.length >= 3)
const diasDesde = f => { if (!f) return null; const d = new Date(String(f).slice(0, 10) + 'T00:00:00'); if (isNaN(d)) return null; const h = new Date(); h.setHours(0, 0, 0, 0); return Math.floor((h - d) / 86400000) }

const ip = { padding: '7px 9px', border: '1px solid ' + C.line, fontSize: 13, boxSizing: 'border-box', borderRadius: 6, background: '#fff' }
const th = { textAlign: 'left', padding: '9px 10px', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }
const td = { padding: '8px 10px', fontSize: 12.5, verticalAlign: 'top' }
const btnMini = (col) => ({ border: '1px solid ' + col, color: col, background: '#fff', borderRadius: 6, padding: '3px 8px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 })

function Pill({ color, bg, children }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color, background: bg, borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' }}>{children}</span>
}

function Tarjeta({ label, valor, ayuda, color }) {
  return (<div className="kpi-card" style={{ background: '#fff', border: '1px solid ' + C.line, borderRadius: 14, boxShadow: SEREIN.shadow, padding: '14px 16px', minWidth: 0 }}>
    <div style={{ fontSize: 11, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
    <div className="kpi-v" style={{ fontFamily: SEREIN.fontDisplay, fontSize: 24, fontWeight: 700, color: color || C.ink, marginTop: 2 }}>{valor}</div>
    {ayuda && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 4, lineHeight: 1.4 }}>{ayuda}</div>}
  </div>)
}

export default function CorreosModule({ esGerencia = true, ots = [], proyectos = [] }) {
  const [docs, setDocs] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errTabla, setErrTabla] = useState(false)
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState('oc')
  const [q, setQ] = useState('')
  const [fCliente, setFCliente] = useState('')
  const [fMes, setFMes] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [editando, setEditando] = useState(null)
  const [clienteSel, setClienteSel] = useState('')
  const [verGuia, setVerGuia] = useState(false)

  const cargar = async () => {
    setCargando(true); setMsg('')
    const { data, error } = await supabase.from('correo_documentos').select('*').order('fecha_correo', { ascending: false }).limit(3000)
    if (error) {
      if (/correo_documentos|42P01|does not exist/i.test(String(error.message) + String(error.code))) setErrTabla(true)
      else setMsg('No se pudieron leer los correos: ' + error.message)
      setDocs([])
    } else { setErrTabla(false); setDocs(data || []) }
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const claveDeDoc = useMemo(() => {
    const rutDeNombre = {}
    docs.forEach(d => { if (rutLimpio(d) && baseNombre(d)) rutDeNombre[baseNombre(d)] = rutLimpio(d) })
    const m = {}
    docs.forEach(d => { m[d.id] = rutLimpio(d) || rutDeNombre[baseNombre(d)] || baseNombre(d) || '(sin cliente)' })
    return m
  }, [docs])
  const claveCl = d => claveDeDoc[d.id] || claveCliente(d)
  const vivos = useMemo(() => docs.filter(d => d.estado !== 'descartado'), [docs])
  const ocs = useMemo(() => vivos.filter(d => d.tipo === 'oc'), [vivos])
  const cots = useMemo(() => vivos.filter(d => d.tipo === 'cotizacion'), [vivos])
  const porRevisar = useMemo(() => vivos.filter(d => d.estado === 'por_revisar'), [vivos])

  // ¿La cotización ya tiene su orden de compra? (la OC menciona el folio de la cotización)
  const ocDeCot = useMemo(() => {
    const m = {}
    cots.forEach(c => {
      const f = digitos(c.folio_cotizacion)
      if (!f) return
      const oc = ocs.find(o => { const r = digitos(o.ref_cotizacion); return r && (r === f || (r.length >= 3 && f.length >= 3 && (r.endsWith(f) || f.endsWith(r)))) })
      if (oc) m[c.id] = oc
    })
    return m
  }, [cots, ocs])

  const ocErp = useMemo(() => new Set([...(ots || []).flatMap(o => tok(o.oc)), ...(proyectos || []).flatMap(p => tok(p.oc))]), [ots, proyectos])
  const enErp = d => { const t = tok(d.numero_oc); return t.length > 0 && t.some(x => ocErp.has(x)) }

  const lista = useMemo(() => {
    const base = tab === 'oc' ? docs.filter(d => d.tipo === 'oc') : tab === 'cot' ? docs.filter(d => d.tipo === 'cotizacion') : docs.filter(d => d.estado === 'por_revisar')
    return base.filter(d => {
      if (fEstado ? d.estado !== fEstado : (tab !== 'rev' && d.estado === 'descartado')) return false
      if (fCliente && claveCl(d) !== fCliente) return false
      if (fMes && fechaDe(d).slice(0, 7) !== fMes) return false
      if (q) { const t = norm([d.cliente, d.numero_oc, d.nv, d.folio_cotizacion, d.detalle, d.asunto, d.rut_cliente].join(' ')); if (!t.includes(norm(q))) return false }
      return true
    }).sort((a, b) => String(fechaDe(b)).localeCompare(String(fechaDe(a))))
  }, [docs, tab, fEstado, fCliente, fMes, q, claveDeDoc])

  const clientes = useMemo(() => { const m = new Map(); vivos.forEach(d => { const k = claveCl(d); if (!m.has(k) || (d.rut_cliente && d.cliente && String(m.get(k)).length < String(d.cliente).length)) m.set(k, d.cliente || k) }); return [...m.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]))) }, [vivos, claveDeDoc])
  const meses = useMemo(() => [...new Set(docs.map(d => fechaDe(d).slice(0, 7)).filter(Boolean))].sort().reverse(), [docs])

  const tot = useMemo(() => lista.filter(d => (d.moneda || 'CLP') === 'CLP').reduce((a, d) => ({ neto: a.neto + (+d.neto || 0), iva: a.iva + (+d.iva || 0), total: a.total + (+d.total || 0) }), { neto: 0, iva: 0, total: 0 }), [lista])

  const hace30 = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10) })()
  const nOc30 = ocs.filter(d => fechaDe(d) >= hace30).length
  const nCot30 = cots.filter(d => fechaDe(d) >= hace30).length
  const cotSinOc = cots.filter(c => !ocDeCot[c.id])

  const actualizar = async (id, cambios) => {
    const nuevo = { ...cambios, actualizado_en: new Date().toISOString() }
    setDocs(ds => ds.map(d => d.id === id ? { ...d, ...nuevo } : d))
    const { error } = await supabase.from('correo_documentos').update(nuevo).eq('id', id)
    if (error) { setMsg('No se pudo guardar el cambio: ' + error.message); cargar() }
  }
  const confirmar = d => actualizar(d.id, { estado: 'confirmado', confirmado_por: 'manual' })
  const descartar = d => { if (window.confirm('¿Descartar este documento? Dejará de contarse (no se borra el correo).')) actualizar(d.id, { estado: 'descartado' }) }
  const abrirPdf = async d => {
    if (!d.pdf_path) return
    const { data, error } = await supabase.storage.from('correos').createSignedUrl(d.pdf_path, 120)
    if (error || !data) { setMsg('No se pudo abrir el PDF.'); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }
  const exportar = () => {
    const filas = lista.map(d => d.tipo === 'oc'
      ? { Fecha: fechaDe(d), Cliente: d.cliente, RUT: d.rut_cliente, 'N° OC': d.numero_oc, NV: d.nv, 'Cotización ref.': d.ref_cotizacion, Detalle: d.detalle, Neto: d.neto, IVA: d.iva, Total: d.total, Moneda: d.moneda, Estado: d.estado }
      : { Fecha: fechaDe(d), Cliente: d.cliente, RUT: d.rut_cliente, 'Folio cotización': d.folio_cotizacion, Detalle: d.detalle, Neto: d.neto, IVA: d.iva, Total: d.total, Moneda: d.moneda, Estado: d.estado })
    const ws = XLSX.utils.json_to_sheet(filas); const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, tab === 'oc' ? 'Ordenes de compra' : 'Cotizaciones')
    XLSX.writeFile(wb, (tab === 'oc' ? 'Ordenes_de_compra' : 'Cotizaciones_enviadas') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx')
  }

  // ---------------- Por cliente: ¿tengo todas? ----------------
  const cruce = useMemo(() => {
    if (!clienteSel) return null
    const o = ocs.filter(d => claveCl(d) === clienteSel)
    const c = cots.filter(d => claveCl(d) === clienteSel)
    const sinOc = c.filter(x => !ocDeCot[x.id])
    const foliosCot = new Set(c.map(x => digitos(x.folio_cotizacion)).filter(Boolean))
    const ocSinCot = o.filter(x => { const r = digitos(x.ref_cotizacion); return !r || ![...foliosCot].some(f => r === f || r.endsWith(f) || f.endsWith(r)) })
    const noErp = o.filter(x => !enErp(x))
    const cuenta = {}; o.forEach(x => { const k = norm(x.numero_oc); if (k) cuenta[k] = (cuenta[k] || 0) + 1 })
    const repetidas = Object.keys(cuenta).filter(k => cuenta[k] > 1)
    const nums = [...new Set(o.map(x => digitos(x.numero_oc)).filter(n => n && n.length <= 9).map(Number))].sort((a, b) => a - b)
    let faltan = []
    if (nums.length >= 3 && nums[nums.length - 1] - nums[0] <= 80) { for (let n = nums[0]; n <= nums[nums.length - 1]; n++) if (!nums.includes(n)) faltan.push(n) }
    return { o, c, sinOc, ocSinCot, noErp, repetidas, faltan, totalOc: o.filter(x => (x.moneda || 'CLP') === 'CLP').reduce((a, x) => a + (+x.total || 0), 0) }
  }, [clienteSel, ocs, cots, ocDeCot, ocErp, claveDeDoc])

  if (!esGerencia) return <div style={{ padding: 20, color: C.soft }}>Este módulo es solo para gerencia.</div>

  const badgeEstado = d => d.estado === 'confirmado'
    ? <Pill color={C.verde} bg={SEREIN.greenSoft}><CheckCircle2 size={11} />{d.confirmado_por === 'auto' ? 'Leída' : 'Confirmada'}</Pill>
    : d.estado === 'descartado' ? <Pill color={C.soft} bg="#EEF1F4">Descartada</Pill>
    : <Pill color={C.ambar} bg={SEREIN.orangeSoft}><AlertTriangle size={11} />Por revisar</Pill>

  const acciones = d => (<div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
    {d.estado === 'por_revisar' && <button onClick={() => confirmar(d)} title="Está bien: confirmar" style={btnMini(C.verde)}><Check size={12} />Confirmar</button>}
    <button onClick={() => setEditando({ ...d })} title="Corregir datos" style={btnMini(C.ink)}><Pencil size={12} />Editar</button>
    {d.pdf_path && <button onClick={() => abrirPdf(d)} title="Abrir el PDF del correo" style={btnMini(C.azul)}><Paperclip size={12} />PDF</button>}
    {d.estado !== 'descartado' && <button onClick={() => descartar(d)} title="Descartar" style={btnMini(C.rojo)}><X size={12} /></button>}
  </div>)

  const montos = d => [<td key="n" style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{clp(d.neto)}</td>, <td key="i" style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', color: C.orange }}>{clp(d.iva)}</td>, <td key="t" style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{clp(d.total)}{d.moneda && d.moneda !== 'CLP' ? ' ' + d.moneda : ''}</td>]

  const seguimiento = c => {
    const oc = ocDeCot[c.id]
    if (oc) return <Pill color={C.verde} bg={SEREIN.greenSoft}><CheckCircle2 size={11} />Con OC {oc.numero_oc || ''}</Pill>
    const n = diasDesde(fechaDe(c))
    if (n == null) return <Pill color={C.soft} bg="#EEF1F4">Sin OC</Pill>
    const col = n > 14 ? C.rojo : n >= 7 ? C.ambar : C.soft
    return <Pill color={col} bg={n > 14 ? SEREIN.redSoft : n >= 7 ? SEREIN.orangeSoft : '#EEF1F4'}>Sin OC · {n} día{n === 1 ? '' : 's'}</Pill>
  }

  const tabBtn = (id, label, Ico, n) => (<button key={id} onClick={() => { setTab(id); setFEstado('') }} style={{ background: tab === id ? '#FDECDD' : '#fff', color: tab === id ? '#C2570B' : '#5A636E', border: '1px solid ' + (tab === id ? '#F7C89E' : C.line), borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 7 }}><Ico size={15} />{label}{n != null ? <span style={{ background: tab === id ? '#F77716' : '#E2E7EC', color: tab === id ? '#fff' : '#5A636E', borderRadius: 20, fontSize: 11, padding: '0 7px', fontWeight: 700 }}>{n}</span> : null}</button>)

  const guia = (<div style={{ background: '#fff', border: '1px solid ' + C.line, borderRadius: 14, padding: '16px 18px', marginBottom: 16, fontSize: 13, color: C.text, lineHeight: 1.6 }}>
    <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}><Info size={16} color={C.orange} />Cómo se conecta tu correo</div>
    <ol style={{ margin: 0, paddingLeft: 20 }}>
      <li>En Supabase se activa el módulo (un SQL) y se crea la función <b>correos-ingresar</b> con su clave.</li>
      <li>En <b>script.google.com</b>, con tu cuenta de Serein, se pega el script de Correos y se ejecuta <b>probarConexion</b> y luego <b>activarEnvioAutomatico</b>.</li>
      <li>Desde ahí, cada 15 minutos el script manda al ERP las órdenes de compra que recibes y las cotizaciones que envías (solo PDF). La IA las lee y aparecen aquí.</li>
    </ol>
    <div style={{ marginTop: 8, color: C.soft }}>El script solo lee: no borra, no mueve ni responde correos. Los datos dudosos quedan en «Por revisar» para que tú los confirmes.</div>
  </div>)

  return (
    <div>
      {errTabla && <div style={{ background: SEREIN.redSoft, border: '1px solid ' + C.rojo, color: C.rojo, borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>Falta activar este módulo en la base de datos (archivo <b>2026-10-08-correos.sql</b>). Cuando se corra ese SQL en Supabase, esta pantalla empieza a funcionar.</div>}
      {msg && <div style={{ background: '#FFF8F7', border: '1px solid ' + C.rojo, color: C.rojo, borderRadius: 10, padding: '8px 12px', fontSize: 12.5, marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Tarjeta label="Órdenes de compra" valor={ocs.length} ayuda={nOc30 + ' llegaron en los últimos 30 días'} />
        <Tarjeta label="Cotizaciones enviadas" valor={cots.length} ayuda={nCot30 + ' en los últimos 30 días'} />
        <Tarjeta label="Por revisar" valor={porRevisar.length} color={porRevisar.length ? C.ambar : C.verde} ayuda={porRevisar.length ? 'La IA dudó: confírmalas o corrígelas' : 'Todo leído con claridad'} />
        <Tarjeta label="Cotizaciones sin OC" valor={cotSinOc.length} color={cotSinOc.length ? C.rojo : C.verde} ayuda="Enviadas y aún sin orden de compra asociada" />
      </div>

      {!cargando && !errTabla && docs.length === 0 && guia}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {tabBtn('oc', 'Órdenes de compra', FileText, ocs.length)}
        {tabBtn('cot', 'Cotizaciones enviadas', Send, cots.length)}
        {tabBtn('rev', 'Por revisar', ClipboardCheck, porRevisar.length)}
        {tabBtn('cliente', 'Por cliente', Users, null)}
        <button onClick={() => setVerGuia(v => !v)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.soft, fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' }}>{verGuia ? 'Ocultar' : 'Cómo se conecta'}</button>
      </div>
      {verGuia && docs.length > 0 && guia}

      {tab !== 'cliente' && (<>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente, N° OC, NV, detalle…" style={{ ...ip, flex: '1 1 240px' }} />
          <select value={fCliente} onChange={e => setFCliente(e.target.value)} style={ip}><option value="">Todos los clientes</option>{clientes.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          <select value={fMes} onChange={e => setFMes(e.target.value)} style={ip}><option value="">Todos los meses</option>{meses.map(m => <option key={m} value={m}>{m}</option>)}</select>
          <select value={fEstado} onChange={e => setFEstado(e.target.value)} style={ip}><option value="">Estado: todos</option><option value="confirmado">Leídas / confirmadas</option><option value="por_revisar">Por revisar</option><option value="descartado">Descartadas</option></select>
          {tab !== 'rev' && <button onClick={exportar} disabled={!lista.length} style={{ ...ip, cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={14} />Excel</button>}
        </div>
        <div style={{ background: '#fff', border: '1px solid ' + C.line, borderRadius: 14, overflow: 'hidden', boxShadow: SEREIN.shadow }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Fecha</th><th style={th}>Cliente</th>
                {tab === 'cot' ? <th style={th}>Folio</th> : tab === 'rev' ? <th style={th}>Tipo / N°</th> : <><th style={th}>N° OC</th><th style={th}>NV</th></>}
                <th style={th}>Detalle</th><th style={{ ...th, textAlign: 'right' }}>Neto</th><th style={{ ...th, textAlign: 'right' }}>IVA</th><th style={{ ...th, textAlign: 'right' }}>Total</th>
                {tab === 'oc' && <th style={th}>Cot. ref.</th>}{tab === 'cot' && <th style={th}>Seguimiento</th>}
                <th style={th}>Estado</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {lista.map(d => (<tr key={d.id} style={{ borderTop: '1px solid #EEF0F3', opacity: d.estado === 'descartado' ? 0.55 : 1 }}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtF(fechaDe(d))}</td>
                  <td style={td}><div style={{ fontWeight: 600 }}>{d.cliente || '—'}</div><div style={{ color: C.faint, fontSize: 11 }}>{d.rut_cliente}</div></td>
                  {tab === 'cot' ? <td style={{ ...td, fontWeight: 700 }}>{d.folio_cotizacion || '—'}</td>
                    : tab === 'rev' ? <td style={td}><div style={{ fontWeight: 700 }}>{d.tipo === 'oc' ? 'OC ' + (d.numero_oc || '—') : 'Cot. ' + (d.folio_cotizacion || '—')}</div></td>
                    : <><td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>{d.numero_oc || '—'}</td><td style={{ ...td, whiteSpace: 'nowrap' }}>{d.nv || '—'}</td></>}
                  <td style={{ ...td, maxWidth: 280 }}><div style={{ lineHeight: 1.4 }}>{d.detalle || '—'}</div><div style={{ color: C.faint, fontSize: 11, marginTop: 2 }}>{d.asunto}</div></td>
                  {montos(d)}
                  {tab === 'oc' && <td style={td}>{d.ref_cotizacion || '—'}</td>}
                  {tab === 'cot' && <td style={td}>{seguimiento(d)}</td>}
                  <td style={td}>{badgeEstado(d)}</td>
                  <td style={td}>{acciones(d)}</td>
                </tr>))}
                {!lista.length && <tr><td colSpan={11} style={{ padding: 28, textAlign: 'center', color: C.faint, fontSize: 13 }}>{cargando ? 'Cargando…' : 'No hay documentos con estos filtros.'}</td></tr>}
              </tbody>
              {lista.length > 0 && tab !== 'rev' && <tfoot><tr style={{ borderTop: '1px solid #CBD2D8', fontWeight: 700, background: '#F8F9FB' }}>
                <td style={td} colSpan={tab === 'cot' ? 4 : 5}>{lista.length} documento{lista.length === 1 ? '' : 's'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{clp(tot.neto)}</td><td style={{ ...td, textAlign: 'right' }}>{clp(tot.iva)}</td><td style={{ ...td, textAlign: 'right' }}>{clp(tot.total)}</td><td colSpan={3} style={td}></td>
              </tr></tfoot>}
            </table>
          </div>
        </div>
      </>)}

      {tab === 'cliente' && (<div>
        <div style={{ fontSize: 13, color: C.soft, marginBottom: 10 }}>Elige un cliente para ver todas sus órdenes de compra y cotizaciones juntas, y qué podría faltar.</div>
        <select value={clienteSel} onChange={e => setClienteSel(e.target.value)} style={{ ...ip, minWidth: 280, marginBottom: 16 }}><option value="">Elegir cliente…</option>{clientes.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        {cruce && (<div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
            <Tarjeta label="Órdenes de compra" valor={cruce.o.length} ayuda={'Total ' + clp(cruce.totalOc)} />
            <Tarjeta label="Cotizaciones enviadas" valor={cruce.c.length} />
            <Tarjeta label="Cotizaciones sin OC" valor={cruce.sinOc.length} color={cruce.sinOc.length ? C.rojo : C.verde} ayuda="Aún sin orden de compra asociada" />
            <Tarjeta label="OC que no están en el ERP" valor={cruce.noErp.length} color={cruce.noErp.length ? C.ambar : C.verde} ayuda="Sin OT o proyecto con ese N° de OC" />
          </div>
          {[
            ['Cotizaciones enviadas sin orden de compra', cruce.sinOc, c => 'Cotización ' + (c.folio_cotizacion || '—') + ' · ' + fmtF(fechaDe(c)) + ' · ' + clp(c.total) + (diasDesde(fechaDe(c)) != null ? ' · hace ' + diasDesde(fechaDe(c)) + ' días' : ''), 'Si el cliente ya la aprobó, falta recibir o registrar su orden de compra.'],
            ['Órdenes de compra que no están en el ERP', cruce.noErp, o => 'OC ' + (o.numero_oc || '—') + ' · ' + fmtF(fechaDe(o)) + ' · ' + clp(o.total), 'Llegó por correo pero ninguna OT ni proyecto tiene ese número de OC: conviene crear la OT.'],
            ['Órdenes de compra sin cotización asociada', cruce.ocSinCot, o => 'OC ' + (o.numero_oc || '—') + ' · ' + fmtF(fechaDe(o)) + ' · ' + clp(o.total), 'No menciona una cotización que Serein haya enviado por correo (puede ser una cotización anterior o hecha por otro medio).'],
          ].map(([titulo, arr, fn, ayuda]) => (<div key={titulo} style={{ background: '#fff', border: '1px solid ' + C.line, borderRadius: 14, padding: '14px 18px', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{titulo} <span style={{ color: C.faint, fontWeight: 500 }}>({arr.length})</span></div>
            <div style={{ fontSize: 12, color: C.faint, margin: '2px 0 8px' }}>{ayuda}</div>
            {arr.length ? arr.map(x => <div key={x.id} style={{ fontSize: 13, padding: '4px 0', borderTop: '1px solid #F0F2F5' }}>{fn(x)}</div>) : <div style={{ fontSize: 13, color: C.verde, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={14} />Nada pendiente.</div>}
          </div>))}
          <div style={{ background: '#fff', border: '1px solid ' + C.line, borderRadius: 14, padding: '14px 18px', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>¿Faltan órdenes por numeración?</div>
            <div style={{ fontSize: 12, color: C.faint, margin: '2px 0 8px' }}>Solo sirve si este cliente numera sus órdenes en orden correlativo.</div>
            {cruce.faltan.length ? <div style={{ fontSize: 13 }}>Números que no llegaron entre la primera y la última: <b>{cruce.faltan.join(', ')}</b></div> : <div style={{ fontSize: 13, color: C.soft }}>No se detectan saltos (o hay muy pocas órdenes para saberlo).</div>}
            {cruce.repetidas.length > 0 && <div style={{ fontSize: 13, color: C.ambar, marginTop: 6 }}>Posibles duplicadas (mismo N° más de una vez): {cruce.repetidas.join(', ')}</div>}
          </div>
        </div>)}
      </div>)}

      {editando && (<div onClick={() => setEditando(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(16,19,21,.5)', zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 14px', overflowY: 'auto' }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 640, boxShadow: '0 30px 60px -20px rgba(0,0,0,.4)' }}>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Corregir datos</div>
          <div style={{ fontSize: 12.5, color: C.soft, marginBottom: 12 }}>Correo: {editando.asunto || '—'} · {editando.de || ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            {[['Tipo', 'tipo', 'sel'], ['Cliente', 'cliente'], ['RUT cliente', 'rut_cliente'], ['N° de OC', 'numero_oc'], ['NV', 'nv'], ['Folio cotización', 'folio_cotizacion'], ['Cotización a la que se refiere', 'ref_cotizacion'], ['Fecha del documento', 'fecha_documento', 'date'], ['Neto', 'neto', 'num'], ['IVA', 'iva', 'num'], ['Total', 'total', 'num']].map(([lab, k, t]) => (
              <label key={k} style={{ fontSize: 11, color: C.faint }}>{lab}
                {t === 'sel' ? <select value={editando.tipo} onChange={e => setEditando(v => ({ ...v, tipo: e.target.value }))} style={{ ...ip, width: '100%' }}><option value="oc">Orden de compra</option><option value="cotizacion">Cotización enviada</option></select>
                  : <input type={t === 'date' ? 'date' : t === 'num' ? 'number' : 'text'} value={editando[k] ?? ''} onChange={e => setEditando(v => ({ ...v, [k]: e.target.value }))} style={{ ...ip, width: '100%' }} />}
              </label>))}
          </div>
          <label style={{ fontSize: 11, color: C.faint, display: 'block', marginTop: 10 }}>Detalle<textarea value={editando.detalle ?? ''} onChange={e => setEditando(v => ({ ...v, detalle: e.target.value }))} rows={3} style={{ ...ip, width: '100%', fontFamily: 'inherit' }} /></label>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={async () => {
              const e = editando
              const num = v => (v === '' || v == null ? null : Number(v))
              await actualizar(e.id, { tipo: e.tipo, cliente: e.cliente || null, rut_cliente: e.rut_cliente || null, numero_oc: e.numero_oc || null, nv: e.nv || null, folio_cotizacion: e.folio_cotizacion || null, ref_cotizacion: e.ref_cotizacion || null, fecha_documento: e.fecha_documento || null, neto: num(e.neto), iva: num(e.iva), total: num(e.total), detalle: e.detalle || null, estado: 'confirmado', confirmado_por: 'manual' })
              setEditando(null)
            }} style={{ background: C.orange, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, cursor: 'pointer' }}>Guardar y confirmar</button>
            <button onClick={() => setEditando(null)} style={{ background: '#fff', border: '1px solid ' + C.line, borderRadius: 8, padding: '9px 16px', cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      </div>)}
    </div>
  )
}
