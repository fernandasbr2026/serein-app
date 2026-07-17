import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase.js'
import { calcularResumenFin } from './FinanzasModule.jsx'
import { calcularPerdidaFactoring } from './ParametrosModule.jsx'
import { AlertTriangle, CheckCircle2, TrendingDown, TrendingUp, Wallet, Landmark, Receipt, Info, Flag, Factory, ShoppingCart, Banknote, Lightbulb } from 'lucide-react'

const C = { navy: '#1A2733', line: '#E2DED4', gray: '#7A8288', red: '#B5432E', orange: '#D2642F', green: '#3D7A4E' }
const clp = n => '$' + Math.round(+n || 0).toLocaleString('es-CL')
const hoy = () => new Date().toISOString().slice(0, 10)
const mesDe = d => (d || '').slice(0, 7)
function sumarDias(f, n) { const d = new Date(f + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const SEVR = { rojo: 3, amarillo: 2, verde: 1 }
const SEV_COLOR = { rojo: '#B5432E', amarillo: '#D2642F', verde: '#3D7A4E' }
const ICON = { alert: AlertTriangle, wallet: Wallet, down: TrendingDown, bank: Landmark, receipt: Receipt, ok: CheckCircle2, info: Info }
const NADA = 'No existe información suficiente para este análisis.'
const MESN = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const mesLabel = ym => { if (!ym) return ''; const p = ym.split('-'); return MESN[(+p[1]) - 1] + ' ' + p[0] }

function Tarjeta({ icon: Ico, titulo, color, vacio, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid ' + C.line, borderTop: '3px solid ' + (color || C.navy), borderRadius: 6, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Ico size={16} color={color || C.navy} />
        <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', color: C.navy, letterSpacing: 0.4 }}>{titulo}</span>
      </div>
      {vacio ? <div style={{ fontSize: 12.5, color: C.gray, fontStyle: 'italic' }}>{NADA}</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>{children}</div>}
    </div>
  )
}
function Fila({ k, v, color }) {
  return (<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 13 }}><span style={{ color: C.gray }}>{k}</span><span style={{ fontWeight: 700, color: color || C.navy, whiteSpace: 'nowrap' }}>{v}</span></div>)
}

const TEMAS = ['Ventas', 'OT', 'OC', 'Facturas', 'Clientes', 'Produccion', 'Compras', 'Cobranza']
const tabBtn = on => ({ background: on ? C.navy : '#fff', color: on ? '#fff' : C.navy, border: '1px solid ' + C.line, borderRadius: 4, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase' })

function ChatIA() {
  const [convs, setConvs] = useState([])
  const [conv, setConv] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [texto, setTexto] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { cargar() }, [])
  async function cargar() {
    setCargando(true); setError('')
    const res = await supabase.from('ai_conversaciones').select('*').order('updated_at', { ascending: false })
    if (res.error) { setError('No se pudo leer el historial. Falta crear las tablas del chat (corre ai_chat_setup.sql en Supabase). Detalle: ' + res.error.message); setCargando(false); return }
    setConvs(res.data || [])
    if (res.data && res.data.length) await abrir(res.data[0].id)
    else { setConv(null); setMsgs([]) }
    setCargando(false)
  }
  async function abrir(id) {
    setConv(id)
    const res = await supabase.from('ai_mensajes').select('*').eq('conversacion_id', id).order('created_at', { ascending: true })
    setMsgs(res.data || [])
  }
  async function nueva() {
    const res = await supabase.from('ai_conversaciones').insert({ titulo: 'Consulta ' + new Date().toLocaleString('es-CL') }).select().single()
    if (res.error) { setError(res.error.message); return null }
    setConvs(c => [res.data, ...c]); setConv(res.data.id); setMsgs([]); return res.data.id
  }
  async function enviar(txt, tema) {
    const contenido = ((txt != null ? txt : texto) || '').trim()
    if (!contenido || enviando) return
    setEnviando(true); setTexto('')
    let cid = conv
    if (!cid) { cid = await nueva(); if (!cid) { setEnviando(false); return } }
    const u = await supabase.from('ai_mensajes').insert({ conversacion_id: cid, rol: 'user', texto: contenido, tema: tema || null }).select().single()
    if (u.error) { setError(u.error.message); setEnviando(false); return }
    const botTxt = 'Recibido' + (tema ? ' (tema: ' + tema + ')' : '') + '. La consulta inteligente aun no esta activa; por ahora tu mensaje queda guardado en el historial.'
    const b = await supabase.from('ai_mensajes').insert({ conversacion_id: cid, rol: 'assistant', texto: botTxt }).select().single()
    setMsgs(m => m.concat([u.data, b.data].filter(Boolean)))
    supabase.from('ai_conversaciones').update({ updated_at: new Date().toISOString() }).eq('id', cid)
    setEnviando(false)
  }
  return (
    <div style={{ display: 'flex', gap: 12, minHeight: 500 }}>
      <div style={{ width: 190, borderRight: '1px solid ' + C.line, paddingRight: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={nueva} style={{ background: C.navy, color: '#fff', border: 'none', borderRadius: 4, padding: '8px 10px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>+ Nueva conversacion</button>
        {convs.map(c => (<button key={c.id} onClick={() => abrir(c.id)} style={{ textAlign: 'left', background: c.id === conv ? '#F1EDE5' : 'transparent', border: '1px solid ' + C.line, borderRadius: 4, padding: '7px 9px', cursor: 'pointer', fontSize: 12, color: C.navy, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.titulo || 'Conversacion'}</button>))}
        {!cargando && convs.length === 0 ? <div style={{ fontSize: 12, color: C.gray }}>Sin conversaciones aun.</div> : null}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {error ? <div style={{ background: '#FDECEC', border: '1px solid ' + C.red, color: C.red, padding: '8px 12px', borderRadius: 4, fontSize: 12.5, marginBottom: 8 }}>{error}</div> : null}
        <div style={{ flex: 1, minHeight: 300, overflowY: 'auto', border: '1px solid ' + C.line, borderRadius: 6, padding: 12, background: '#FCFAF6', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cargando ? <div style={{ color: C.gray, fontSize: 13 }}>Cargando historial...</div> : null}
          {!cargando && msgs.length === 0 ? <div style={{ color: C.gray, fontSize: 13 }}>Escribe un mensaje o elige un tema para empezar. El historial queda guardado en tu cuenta.</div> : null}
          {msgs.map((m, i) => (<div key={m.id || i} style={{ alignSelf: m.rol === 'user' ? 'flex-end' : 'flex-start', maxWidth: '78%', background: m.rol === 'user' ? C.navy : '#fff', color: m.rol === 'user' ? '#fff' : C.navy, border: '1px solid ' + C.line, borderRadius: 8, padding: '8px 11px', fontSize: 13 }}>{m.tema && m.rol === 'user' ? <div style={{ fontSize: 10, opacity: 0.85, marginBottom: 2, textTransform: 'uppercase' }}>{m.tema}</div> : null}{m.texto}</div>))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
          {TEMAS.map(t => <button key={t} onClick={() => enviar('Consulta sobre ' + t, t)} disabled={enviando} style={{ background: '#fff', border: '1px solid ' + C.line, borderRadius: 20, padding: '4px 11px', cursor: 'pointer', fontSize: 11.5, color: C.navy }}>{t}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviar() }} placeholder="Escribe tu consulta..." style={{ flex: 1, border: '1px solid ' + C.line, borderRadius: 6, padding: '10px 12px', fontSize: 13, boxSizing: 'border-box' }} />
          <button onClick={() => enviar()} disabled={enviando} style={{ background: C.navy, color: '#fff', border: 'none', borderRadius: 6, padding: '0 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Enviar</button>
        </div>
        <div style={{ fontSize: 11, color: C.gray, marginTop: 6 }}>Arquitectura lista. La inteligencia (respuestas y consultas a Ventas, OT, OC, Facturas, Clientes, Produccion, Compras y Cobranza) se activara en una fase siguiente.</div>
      </div>
    </div>
  )
}

export default function AsesorModule({ fin = {}, pp = {}, proyectos = [], ots = [], params = {}, onIr }) {
  const [vista, setVista] = useState('dashboard')
  const [perfilTipo, setPerfilTipo] = useState(null)
  useEffect(() => { supabase.auth.getUser().then(async u => { const id = u && u.data && u.data.user && u.data.user.id; if (!id) return; try { const res = await supabase.from('perfiles').select('tipo').eq('id', id).single(); setPerfilTipo((res.data && res.data.tipo) || '') } catch (e) { setPerfilTipo('') } }) }, [])
  const soloOp = perfilTipo !== null && perfilTipo !== 'gerencia'
  useEffect(() => { if (soloOp) setVista('operacional') }, [soloOp])
  const [alertasDB, setAlertasDB] = useState([])
  async function cargarAlertas() { try { const res = await supabase.from('alertas').select('*').order('fecha', { ascending: false }); setAlertasDB(res.data || []) } catch (e) {} }
  async function revisarAlerta(id) { try { await supabase.from('alertas').update({ estado: 'Revisada', fecha_revision: new Date().toISOString() }).eq('id', id); cargarAlertas() } catch (e) {} }
  async function resolverAlerta(id) { try { await supabase.from('alertas').update({ estado: 'Resuelta', fecha_resolucion: new Date().toISOString() }).eq('id', id); cargarAlertas() } catch (e) {} }
  useEffect(() => { cargarAlertas() }, [])
  const [recsDB, setRecsDB] = useState([])
  async function cargarRecs() { try { const res = await supabase.from('recomendaciones').select('*').order('fecha', { ascending: false }); setRecsDB(res.data || []) } catch (e) {} }
  async function aplicarRec(id) { try { await supabase.from('recomendaciones').update({ estado: 'Aplicada' }).eq('id', id); cargarRecs() } catch (e) {} }
  async function descartarRec(id) { try { await supabase.from('recomendaciones').update({ estado: 'Descartada' }).eq('id', id); cargarRecs() } catch (e) {} }
  useEffect(() => { cargarRecs() }, [])
  const [analisisFin, setAnalisisFin] = useState([])
  async function cargarAnalisis() { try { const res = await supabase.from('analisis_financiero').select('*'); setAnalisisFin(res.data || []) } catch (e) {} }
  useEffect(() => { cargarAnalisis() }, [])
  const [analisisCom, setAnalisisCom] = useState([])
  async function cargarComercial() { try { const res = await supabase.from('analisis_comercial').select('*'); setAnalisisCom(res.data || []) } catch (e) {} }
  useEffect(() => { cargarComercial() }, [])
  const [analisisOp, setAnalisisOp] = useState([])
  async function cargarOperacional() { try { const res = await supabase.from('analisis_operacional').select('*'); setAnalisisOp(res.data || []) } catch (e) {} }
  useEffect(() => { cargarOperacional() }, [])
  const [iva, setIva] = useState({ credito: 0, debito: 0, cargado: false })
  const [compras, setCompras] = useState(null)
  const hoyStr = hoy()
  const mes = mesDe(hoyStr)
  const [gastosLC, setGastosLC] = useState(null)
  useEffect(() => {
    let vivo = true
    supabase.from('libro_compras').select('tipo_compra, clasificacion, document_total, neto, iva, exenta').then(res => {
      if (!vivo) return
      const src = res.data || []
      let fijo = 0, variable = 0, sin = 0, total = 0
      const cat = {}
      for (const r of src) {
        const m = Number(r.exenta ? (r.document_total || r.neto || 0) : (r.neto || 0))
        total += m
        if (r.clasificacion === 'Fijo') fijo += m; else if (r.clasificacion === 'Variable') variable += m; else sin += m
        const t = r.tipo_compra || 'Sin tipo'; cat[t] = (cat[t] || 0) + m
      }
      setGastosLC({ fijo, variable, sin, total, cat: Object.entries(cat).sort((a, b) => b[1] - a[1]) })
    }, () => {})
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const rc = await supabase.from('libro_compras').select('provider_name, neto, iva, document_total, emission_date, exenta')
        const rv = await supabase.from('libro_ventas').select('*')
        const enMes = r => mesDe(r.emision || r.fecha || r.fecha_emision || r.emission_date || '') === mes
        const sumIva = arr => (arr || []).filter(enMes).reduce((a, r) => a + (+r.iva || 0), 0)
        if (vivo) { setIva({ credito: sumIva(rc.data), debito: sumIva(rv.data), cargado: true }); setCompras(rc.data || []) }
      } catch (e) { if (vivo) { setIva(i => ({ ...i, cargado: true })); setCompras([]) } }
    })()
    return () => { vivo = false }
  }, [mes])

  const analisis = useMemo(() => {
    try {
      const alertas = []
      const add = (sev, area, icono, titulo, detalle, recomendacion, ir) => alertas.push({ sev, area, icono, titulo, detalle, recomendacion, ir })
      const r = calcularResumenFin(fin, mes)
      const cuotasVenc = r.cuotasVencidas || []
      if (cuotasVenc.length > 0) { const monto = cuotasVenc.reduce((a, c) => a + (+c.monto || +c.cuota || 0), 0); add('rojo', 'Caja', 'alert', cuotasVenc.length + ' cuota(s) de credito/leasing vencida(s)', 'Suman ' + clp(monto) + ' sin pagar.', 'Regulariza con el banco o reprograma para evitar mora e intereses.', 'FINANZAS') }
      const gastos = fin.gastos || []
      const fijosPend = gastos.filter(g => g.tipo === 'fijo' && g.estado !== 'Pagada' && g.estado !== 'Anulado')
      const en7 = sumarDias(hoyStr, 7)
      const gVenc = fijosPend.filter(g => g.vencimiento && g.vencimiento < hoyStr)
      const gProx = fijosPend.filter(g => g.vencimiento && g.vencimiento >= hoyStr && g.vencimiento <= en7)
      if (gVenc.length > 0) { const m = gVenc.reduce((a, g) => a + (+g.neto || 0), 0); add('rojo', 'Caja', 'alert', gVenc.length + ' gasto(s) fijo(s) vencido(s)', 'Pendientes por ' + clp(m) + '.', 'Prioriza estos pagos o negocia plazo con el proveedor.', 'PAGOS') }
      if (gProx.length > 0) { const m = gProx.reduce((a, g) => a + (+g.neto || 0), 0); add('amarillo', 'Caja', 'wallet', gProx.length + ' gasto(s) fijo(s) vencen en 7 dias', 'Suman ' + clp(m) + '.', 'Asegura la liquidez para cubrirlos esta semana.', 'PAGOS') }
      const ocs = pp.ocs || []
      const ocVenc = ocs.filter(o => o.vencimiento && o.vencimiento < hoyStr && o.estado !== 'Pagada' && o.estado !== 'Anulada')
      if (ocVenc.length > 0) { const m = ocVenc.reduce((a, o) => a + (+o.total || +o.monto || 0), 0); add('rojo', 'Caja', 'alert', ocVenc.length + ' orden(es) de compra vencidas', 'Por pagar ' + clp(m) + '.', 'Revisa Proveedores y Pagos y coordina el pago.', 'PAGOS') }
      const bajos = []
      ;(proyectos || []).forEach(p => { const venta = (+p.venta_cotizada || 0) || (p.edps || []).reduce((a, e) => a + (+e.venta || 0), 0); const costo = (p.compras || []).reduce((a, c) => a + (+c.monto || 0), 0); if (venta > 0 && costo > 0) { const pct = (venta - costo) / venta; if (pct < 0.15) bajos.push({ ot: p.ot || p.nombre, pct }) } })
      bajos.sort((a, b) => a.pct - b.pct)
      const neg = bajos.filter(b => b.pct < 0)
      const amarB = bajos.filter(b => b.pct >= 0 && b.pct < 0.15)
      if (neg.length > 0) add('rojo', 'Margenes', 'down', neg.length + ' OT con margen negativo', neg.slice(0, 3).map(b => b.ot + ' (' + Math.round(b.pct * 100) + '%)').join(', ') + (neg.length > 3 ? '...' : ''), 'Las compras superan la venta cotizada. Revisa costos o renegocia el precio.', 'GESTION_PROYECTOS')
      if (amarB.length > 0) add('amarillo', 'Margenes', 'down', amarB.length + ' OT con margen bajo (menos de 15%)', amarB.slice(0, 3).map(b => b.ot + ' (' + Math.round(b.pct * 100) + '%)').join(', ') + (amarB.length > 3 ? '...' : ''), 'Vigila estos proyectos: poco colchon ante imprevistos.', 'GESTION_PROYECTOS')
      const cuotas = +r.totalCuotasMes || 0
      let ingresos = (proyectos || []).reduce((a, p) => a + (p.edps || []).filter(e => mesDe(e.fecha) === mes).reduce((x, e) => x + (+e.venta || 0), 0), 0)
      if (iva.cargado && iva.debito > 0) ingresos = Math.max(ingresos, iva.debito / 0.19)
      let ratio = null
      if (ingresos > 0) ratio = cuotas / ingresos
      if (ratio === null) add('amarillo', 'Deuda', 'bank', 'Sin datos de ingresos del mes', 'Aun no puedo calcular el ratio de endeudamiento.', 'Registra ventas/EDP del mes o sincroniza el libro de ventas.', 'FINANZAS')
      else if (ratio > 0.5) add('rojo', 'Deuda', 'bank', 'Carga financiera muy alta', 'Las cuotas son el ' + Math.round(ratio * 100) + '% de los ingresos del mes.', 'Sobre 50% es riesgoso: evita nueva deuda y prioriza amortizar.', 'FINANZAS')
      else if (ratio > 0.35) add('amarillo', 'Deuda', 'bank', 'Carga financiera elevada', 'Las cuotas son el ' + Math.round(ratio * 100) + '% de los ingresos.', 'Mantenla bajo control; lo ideal es bajo 35%.', 'FINANZAS')
      if (iva.cargado) { const pos = iva.debito - iva.credito; if (pos > 0) add(pos > 3000000 ? 'rojo' : 'amarillo', 'IVA', 'receipt', 'IVA por pagar este mes: ' + clp(pos), 'Debito ' + clp(iva.debito) + ' menos Credito ' + clp(iva.credito) + '.', 'Reserva este monto para el F29 y no lo uses en caja.', 'LIBRO_VENTAS'); else if (iva.credito > 0) add('verde', 'IVA', 'ok', 'Credito fiscal a favor: ' + clp(-pos), 'Credito ' + clp(iva.credito) + ' mayor que Debito ' + clp(iva.debito) + '.', 'Podras descontarlo del F29; sin IVA a pagar este mes.', 'LIBRO_COMPRAS') }
      const nivel = alertas.reduce((mx, a) => Math.max(mx, SEVR[a.sev]), 1)
      const estado = nivel >= 3 ? 'rojo' : nivel === 2 ? 'amarillo' : 'verde'
      return { alertas, estado, r, ingresos, ratio }
    } catch (e) { return { alertas: [], estado: 'amarillo', r: { salidaCaja: 0, deudaVigente: 0, totalCuotasMes: 0, cuotasVencidas: [] }, ingresos: 0, ratio: null } }
  }, [fin, pp, proyectos, ots, iva, mes, hoyStr])

  useEffect(() => {
    const acts = (analisis.alertas || []).filter(a => a.sev !== 'verde')
    if (!acts.length) return
    let vivo = true
    ;(async () => {
      try {
        const u = await supabase.auth.getUser(); const uid = u && u.data && u.data.user ? u.data.user.id : null
        if (!uid) return
        const rows = acts.map(a => ({ usuario: uid, area: a.area, prioridad: a.sev === 'rojo' ? 'Alta' : 'Media', registro_relacionado: a.ir || a.area, descripcion: a.titulo + ' - ' + a.detalle, clave: a.area + '::' + a.titulo.replace(/[0-9]+/g, '#') }))
        await supabase.from('alertas').upsert(rows, { onConflict: 'usuario,clave' })
        if (vivo) cargarAlertas()
      } catch (e) {}
    })()
    return () => { vivo = false }
  }, [analisis])

  useEffect(() => {
    const acts = (analisis.alertas || []).filter(a => a.sev !== 'verde')
    if (!acts.length) return
    let vivo = true
    ;(async () => {
      try {
        const u = await supabase.auth.getUser(); const uid = u && u.data && u.data.user ? u.data.user.id : null
        if (!uid) return
        const rows = acts.map(a => ({ usuario: uid, titulo: a.area + ' - accion recomendada', descripcion: a.recomendacion, motivo: a.titulo + '. ' + a.detalle, prioridad: a.sev === 'rojo' ? 'Alta' : 'Media', modulo: a.ir || a.area, fuente: 'regla', clave: 'rec::' + a.area + '::' + a.titulo.replace(/[0-9]+/g, '#') }))
        await supabase.from('recomendaciones').upsert(rows, { onConflict: 'usuario,clave' })
        if (vivo) cargarRecs()
      } catch (e) {}
    })()
    return () => { vivo = false }
  }, [analisis])

  useEffect(() => {
    if (!(proyectos || []).length && !(fin.gastos || []).length) return
    let vivo = true
    ;(async () => {
      try {
        const u = await supabase.auth.getUser(); const uid = u && u.data && u.data.user ? u.data.user.id : null
        if (!uid) return
        const r = analisis.r || {}
        const P = proyectos || []
        const facturado = P.reduce((a, p) => a + (p.edps || []).reduce((x, e) => x + (+e.venta || 0), 0), 0)
        const cotizada = P.reduce((a, p) => a + (+p.venta_cotizada || 0), 0)
        const cr = compras || []
        const mesesC = [...new Set(cr.map(x => mesDe(x.emission_date)).filter(Boolean))].sort().reverse()
        const ultC = mesesC[0]; const netoCompras = cr.filter(x => mesDe(x.emission_date) === ultC).reduce((a, x) => a + (+x.neto || 0), 0)
        const ivaPos = (iva.debito || 0) - (iva.credito || 0)
        const edpsAll = P.reduce((a, p) => a.concat(p.edps || []), [])
        const enFactoring = edpsAll.filter(e => /factor/i.test((e.metodo || '') + (e.estado || ''))).reduce((a, e) => a + (+e.venta || 0), 0)
        const perdFact = edpsAll.reduce((a, e) => a + (+e.perdidaFact || 0), 0)
        const obs = fin.obligaciones || []
        const deudaTipo = t => { let deuda = 0, mesT = 0, n = 0; obs.filter(o => o.tipo === t).forEach(o => { n++; (o.cuotas || []).forEach(c => { if (!/pag/i.test(c.estado || '')) { deuda += (+c.total || 0); if (mesDe(c.vencimiento) === mes) mesT += (+c.total || 0) } }) }); return { deuda: deuda, mesT: mesT, n: n } }
        const cred = deudaTipo('Cr\u00e9dito'); const leas = deudaTipo('Leasing')
        const gastosMes = (fin.gastos || []).filter(g => g.tipo === 'fijo').reduce((a, g) => a + (+g.neto || 0), 0)
        const salida = +r.salidaCaja || 0; const ingresos = +analisis.ingresos || 0; const flujo = ingresos - salida
        let venta = 0, costo = 0; P.forEach(p => { venta += (+p.venta_cotizada || 0) || (p.edps || []).reduce((x, e) => x + (+e.venta || 0), 0); costo += (p.compras || []).reduce((x, c) => x + (+c.monto || 0), 0) })
        const ut = venta - costo; const margen = venta > 0 ? Math.round(ut / venta * 100) : null
        const A = (area, valor, resumen) => ({ usuario: uid, fecha: new Date().toISOString(), periodo: mes, area: area, valor: Math.round(valor || 0), resumen: resumen, fuente: 'regla', clave: mes + '::' + area })
        const rows = [
          A('Ventas', facturado, 'Facturado ' + clp(facturado) + ' de ' + clp(cotizada) + ' cotizado.'),
          A('Compras', netoCompras, 'Neto de compras ' + (ultC ? mesLabel(ultC) : '') + ': ' + clp(netoCompras) + '.'),
          A('IVA', ivaPos, ivaPos > 0 ? 'IVA por pagar del periodo: ' + clp(ivaPos) + '.' : 'Credito fiscal a favor: ' + clp(-ivaPos) + '.'),
          A('Factoring', perdFact, 'En factoring ' + clp(enFactoring) + '; perdida estimada ' + clp(perdFact) + '.'),
          A('Creditos', cred.deuda, cred.n + ' credito(s): deuda vigente ' + clp(cred.deuda) + ', cuota del mes ' + clp(cred.mesT) + '.'),
          A('Leasing', leas.deuda, leas.n + ' leasing: deuda vigente ' + clp(leas.deuda) + ', cuota del mes ' + clp(leas.mesT) + '.'),
          A('Gastos', gastosMes, 'Gastos fijos del mes: ' + clp(gastosMes) + '.'),
          A('Flujo de Caja', flujo, 'Ingresos ' + clp(ingresos) + ' menos salidas ' + clp(salida) + ' = ' + clp(flujo) + '.'),
          A('Rentabilidad', ut, margen === null ? 'Sin datos suficientes.' : 'Utilidad ' + clp(ut) + ' (' + margen + '% sobre venta).')
        ]
        await supabase.from('analisis_financiero').upsert(rows, { onConflict: 'usuario,clave' })
        if (vivo) cargarAnalisis()
      } catch (e) {}
    })()
    return () => { vivo = false }
  }, [analisis, compras])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const u = await supabase.auth.getUser(); const uid = u && u.data && u.data.user ? u.data.user.id : null
        if (!uid) return
        let cots = [], clientes = []
        try { cots = JSON.parse(localStorage.getItem('serein_cotizaciones') || '[]') } catch (e) {}
        try { clientes = JSON.parse(localStorage.getItem('serein_clientes') || '[]') } catch (e) {}
        const P = proyectos || []
        const numDe = v => { const n = parseInt(String(v == null ? '' : v).replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n }
        const valCot = c => (c.items || []).reduce((a, it) => a + (numDe(it.cant) * numDe(it.pUnitario) - numDe(it.descuento)), 0)
        const esAprob = c => /aprob/i.test(c.estado || '')
        const esRech = c => /rechaz/i.test(c.estado || '')
        const nCot = cots.length
        const nAprob = cots.filter(esAprob).length
        const nSeg = cots.filter(c => !esAprob(c) && !esRech(c)).length
        const conv = nCot > 0 ? Math.round(nAprob / nCot * 100) : null
        const valorCot = cots.reduce((a, c) => a + valCot(c), 0)
        const facturado = P.reduce((a, p) => a + (p.edps || []).reduce((x, e) => x + (+e.venta || 0), 0), 0)
        let venta = 0, costo = 0; P.forEach(p => { venta += (+p.venta_cotizada || 0) || (p.edps || []).reduce((x, e) => x + (+e.venta || 0), 0); costo += (p.compras || []).reduce((x, c) => x + (+c.monto || 0), 0) })
        const margen = venta > 0 ? Math.round((venta - costo) / venta * 100) : null
        const A = (area, valor, resumen) => ({ usuario: uid, fecha: new Date().toISOString(), periodo: mes, area: area, valor: Math.round(valor || 0), resumen: resumen, fuente: 'regla', clave: mes + '::' + area })
        const rows = [
          A('Cotizaciones', valorCot, nCot + ' cotizacion(es) por ' + clp(valorCot) + '.'),
          A('Clientes', clientes.length, clientes.length + ' cliente(s) registrados.'),
          A('Seguimientos', nSeg, nSeg + ' cotizacion(es) en seguimiento (sin aprobar ni rechazar).'),
          A('Conversion', conv || 0, conv === null ? 'Sin cotizaciones para calcular conversion.' : conv + '% de conversion (' + nAprob + ' aprobadas de ' + nCot + ').'),
          A('Ventas', facturado, 'Facturado ' + clp(facturado) + '.'),
          A('Margenes', margen || 0, margen === null ? 'Sin datos suficientes.' : 'Margen ' + margen + '% sobre venta.')
        ]
        await supabase.from('analisis_comercial').upsert(rows, { onConflict: 'usuario,clave' })
        if (vivo) cargarComercial()
      } catch (e) {}
    })()
    return () => { vivo = false }
  }, [analisis, proyectos])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const u = await supabase.auth.getUser(); const uid = u && u.data && u.data.user ? u.data.user.id : null
        if (!uid) return
        let ots = [], mo = {}
        try { ots = JSON.parse(localStorage.getItem('serein_ots') || '[]') } catch (e) {}
        try { mo = JSON.parse(localStorage.getItem('serein_mo') || '{}') } catch (e) {}
        const P = proyectos || []
        const trab = mo.trabajadores || []; const asist = mo.asistencias || []
        const h = hoyStr
        const cerr = e => /entreg|termin|cerr/i.test(e || '')
        const totalOT = ots.length + P.length
        const activasOT = ots.filter(o => !cerr(o.estado)).length + P.filter(p => !p.cerrado).length
        const act = P.filter(p => !p.cerrado); const conAv = act.filter(p => typeof p.avance === 'number'); const avg = conAv.length ? Math.round(conAv.reduce((a, p) => a + (+p.avance || 0), 0) / conAv.length) : 0
        const retra = ots.filter(o => o.fechaEntrega && o.fechaEntrega < h && !cerr(o.estado)).length
        const conPlan = ots.filter(o => ((o.esquema || '').trim() || (o.preparacion || '').trim())).length
        const calidadPct = ots.length ? Math.round(conPlan / ots.length * 100) : null
        const HH = asist.reduce((sm, a) => sm + (a.trabajadorIds || []).length * (/media/i.test(a.jornada || '') ? 4.5 : 9), 0)
        const dias = new Set(asist.map(a => a.fecha)).size
        const dotacion = trab.length; const capDia = dotacion * 9
        const util = (dias > 0 && capDia > 0) ? Math.round(HH / (capDia * dias) * 100) : null
        const A = (area, valor, resumen) => ({ usuario: uid, fecha: new Date().toISOString(), periodo: mes, area: area, valor: Math.round(valor || 0), resumen: resumen, fuente: 'regla', clave: mes + '::' + area })
        const rows = [
          A('OT', totalOT, activasOT + ' OT activas de ' + totalOT + ' en el sistema.'),
          A('Produccion', avg, act.length + ' OT en produccion; avance fisico promedio ' + avg + '%.'),
          A('Planta', dotacion, dotacion + ' trabajador(es) en la dotacion.'),
          A('Calidad', calidadPct || 0, calidadPct === null ? 'Sin OT para evaluar.' : conPlan + ' de ' + ots.length + ' OT con plan de calidad (' + calidadPct + '%).'),
          A('Retrasos', retra, retra + ' OT con fecha de entrega vencida sin cerrar.'),
          A('Horas Hombre', HH, HH + ' HH registradas en ' + dias + ' dia(s) de asistencia.'),
          A('Capacidad', util === null ? 0 : util, util === null ? ('Dotacion ' + dotacion + ' trabajadores; sin asistencias para calcular uso.') : ('Utilizacion ' + util + '% (' + HH + ' HH de ' + (capDia * dias) + ' disponibles).'))
        ]
        await supabase.from('analisis_operacional').upsert(rows, { onConflict: 'usuario,clave' })
        if (vivo) cargarOperacional()
      } catch (e) {}
    })()
    return () => { vivo = false }
  }, [analisis, proyectos])

  const hayFin = (fin.gastos || []).length || (fin.obligaciones || []).length
  const hayProy = (proyectos || []).length

  const financiero = useMemo(() => { if (!hayFin && !analisis.r.totalCuotasMes) return null; return { salida: +analisis.r.salidaCaja || 0, deuda: +analisis.r.deudaVigente || 0, cuotas: +analisis.r.totalCuotasMes || 0, ivaPos: iva.cargado ? (iva.debito - iva.credito) : null } }, [hayFin, analisis, iva])

  const comercial = useMemo(() => { if (!hayProy) return null; let cot = 0, fac = 0, cob = 0; proyectos.forEach(p => { cot += (+p.venta_cotizada || 0); const e = p.edps || []; fac += e.reduce((a, x) => a + (+x.venta || 0), 0); cob += e.filter(x => /pag/i.test(x.estado || '')).reduce((a, x) => a + (+x.venta || 0), 0) }); return { nOT: proyectos.length, cot, fac, porFac: Math.max(0, cot - fac), cob } }, [hayProy, proyectos])

  const cobranza = useMemo(() => {
    const edps = (proyectos || []).reduce((a, p) => a.concat((p.edps || []).map(e => ({ ...e, ot: p.ot || p.nombre, cliente: p.cliente || 'Sin cliente' }))), [])
    if (!edps.length) return null
    const monto = e => +e.venta || 0
    const esPag = e => /pag/i.test(e.estado || '')
    const diasAtr = e => (e.fecha && e.fecha !== '—' && e.fecha < hoyStr) ? Math.round((new Date(hoyStr) - new Date(e.fecha)) / 86400000) : 0
    const pend = edps.filter(e => !esPag(e))
    const pag = edps.filter(esPag)
    const venc = pend.filter(e => diasAtr(e) > 0)
    const atrasos = venc.map(diasAtr)
    let factN = 0, factMonto = 0, factPerd = 0
    const facCli = {}, facPerdCli = {}
    const facList = (params && params.factoring) || []
    for (const p of (proyectos || [])) { const fe = p.facEdp || {}; const cli = p.cliente || 'Sin cliente'; const edpByLab = {}; for (const e of (p.edps || [])) { edpByLab[((e.edp) || '').trim().toLowerCase()] = e } for (const kk in fe) { const info = fe[kk] || {}; if (!/factoring/i.test(info.estado || '')) continue; const e = edpByLab[((info.edp) || '').trim().toLowerCase()]; if (!e) continue; const mto = +e.venta || 0; factN++; factMonto += mto; facCli[cli] = (facCli[cli] || 0) + mto; const fc = facList.find(x => x.id === info.factoringId) || facList.find(x => (e.banco || '').toLowerCase().includes((x.nombre || '').toLowerCase().split(' ')[0])) || facList[0]; const perd = fc ? calcularPerdidaFactoring(mto, 30, 0, fc).total : 0; factPerd += perd; facPerdCli[cli] = (facPerdCli[cli] || 0) + perd } }
    const byCli = {}
    for (const e of edps) { const c = e.cliente; if (!byCli[c]) byCli[c] = { cliente: c, fact: 0, cobr: 0, pend: 0, venc: 0, nVenc: 0, atrMax: 0 }; const o = byCli[c]; o.fact += monto(e); if (esPag(e)) o.cobr += monto(e); else { o.pend += monto(e); const d = diasAtr(e); if (d > 0) { o.venc += monto(e); o.nVenc++; if (d > o.atrMax) o.atrMax = d } } }
    Object.keys(byCli).forEach(c => { byCli[c].facMonto = facCli[c] || 0; byCli[c].facPerd = facPerdCli[c] || 0 })
    const porCliente = Object.values(byCli).sort((a, b) => b.pend - a.pend)
    return { facturado: edps.reduce((a, e) => a + monto(e), 0), cobrado: pag.reduce((a, e) => a + monto(e), 0), porCobrar: pend.reduce((a, e) => a + monto(e), 0), nPend: pend.length, nPag: pag.length, nEdp: edps.length, nVenc: venc.length, montoVenc: venc.reduce((a, e) => a + monto(e), 0), atrasoMax: atrasos.length ? Math.max(...atrasos) : 0, atrasoProm: atrasos.length ? Math.round(atrasos.reduce((a, b) => a + b, 0) / atrasos.length) : 0, factN, factMonto, factPerd, porCliente }
  }, [proyectos, hoyStr])

  useEffect(() => {
    if (!cobranza) return
    ;(async () => {
      try {
        const u = await supabase.auth.getUser()
        const uid = u && u.data && u.data.user && u.data.user.id
        if (!uid) return
        const A = (area, valor, resumen, detalle) => ({ usuario: uid, fecha: new Date().toISOString(), periodo: mes, area, valor: Math.round(valor || 0), resumen, detalle: detalle || null, fuente: 'regla', clave: mes + '::cob::' + area })
        const rows = [
          A('Facturas', cobranza.facturado, cobranza.nEdp + ' EDP; facturado ' + clp(cobranza.facturado) + '.'),
          A('Pagos', cobranza.cobrado, cobranza.nPag + ' EDP pagadas; cobrado ' + clp(cobranza.cobrado) + '.'),
          A('Abonos', cobranza.cobrado, 'Montos abonados/cobrados a la fecha: ' + clp(cobranza.cobrado) + '.'),
          A('Dias de atraso', cobranza.montoVenc, cobranza.nVenc + ' EDP vencidas; atraso max ' + cobranza.atrasoMax + ' dias, promedio ' + cobranza.atrasoProm + '.'),
          A('Historial cliente', cobranza.porCobrar, 'Por cobrar ' + clp(cobranza.porCobrar) + ' en ' + cobranza.porCliente.length + ' clientes.', cobranza.porCliente),
          A('Factoring', cobranza.factMonto, cobranza.factN + ' EDP en factoring por ' + clp(cobranza.factMonto) + '; perdida estimada ' + clp(cobranza.factPerd) + '.')
        ]
        await supabase.from('analisis_cobranza').upsert(rows, { onConflict: 'usuario,clave' })
      } catch (e) {}
    })()
  }, [cobranza])

  const produccion = useMemo(() => { if (!hayProy && !(ots || []).length) return null; const act = (proyectos || []).filter(p => !p.cerrado); const conAv = act.filter(p => typeof p.avance === 'number'); const avg = conAv.length ? Math.round(conAv.reduce((a, p) => a + (+p.avance || 0), 0) / conAv.length) : null; return { nAct: act.length, avg, m2: act.reduce((a, p) => a + (+p.m2 || 0), 0), nOTs: (ots || []).length } }, [hayProy, proyectos, ots])

  const comprasCard = useMemo(() => { if (compras === null) return { cargando: true }; if (!compras.length) return null; const meses = [...new Set(compras.map(r => mesDe(r.emission_date)).filter(Boolean))].sort().reverse(); const ult = meses[0]; const delUlt = compras.filter(r => mesDe(r.emission_date) === ult); const byProv = {}; delUlt.forEach(r => { const n = r.provider_name || '—'; byProv[n] = (byProv[n] || 0) + (+r.neto || 0) }); const top = Object.keys(byProv).map(n => [n, byProv[n]]).sort((a, b) => b[1] - a[1]).slice(0, 3); return { nTotal: compras.length, ult, nUlt: delUlt.length, netoUlt: delUlt.reduce((a, r) => a + (+r.neto || 0), 0), top } }, [compras])

  const prioridades = useMemo(() => { if (!hayFin && !hayProy && !(pp.ocs || []).length) return null; return analisis.alertas.filter(a => a.sev !== 'verde').sort((a, b) => SEVR[b.sev] - SEVR[a.sev]).slice(0, 5) }, [hayFin, hayProy, analisis, pp])

  const recomendaciones = useMemo(() => { if (!hayFin && !hayProy) return null; return analisis.alertas.filter(a => a.sev !== 'verde').slice(0, 5).map(a => ({ area: a.area, texto: a.recomendacion })) }, [hayFin, hayProy, analisis])

  const alertasResumen = useMemo(() => { if (!hayFin && !hayProy && !(pp.ocs || []).length) return null; const act = analisis.alertas.filter(a => a.sev !== 'verde'); return { rojas: act.filter(a => a.sev === 'rojo').length, amar: act.filter(a => a.sev === 'amarillo').length, top: act.slice().sort((a, b) => SEVR[b.sev] - SEVR[a.sev]).slice(0, 4) } }, [hayFin, hayProy, analisis, pp])

  const orden = analisis.alertas.slice().sort((a, b) => SEVR[b.sev] - SEVR[a.sev])
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, borderBottom: '1px solid ' + C.line, paddingBottom: 4 }}>
        {!soloOp && <button onClick={() => setVista('dashboard')} style={tabBtn(vista === 'dashboard')}>Dashboard Inteligente</button>}
        {!soloOp && <button onClick={() => setVista('alertas')} style={tabBtn(vista === 'alertas')}>Alertas</button>}
        {!soloOp && <button onClick={() => setVista('analista')} style={tabBtn(vista === 'analista')}>Analista Financiero</button>}
        {!soloOp && <button onClick={() => setVista('comercial')} style={tabBtn(vista === 'comercial')}>Analista Comercial</button>}
        <button onClick={() => setVista('operacional')} style={tabBtn(vista === 'operacional')}>Analista Operacional</button>
        {!soloOp && <button onClick={() => setVista('recs')} style={tabBtn(vista === 'recs')}>Recomendaciones</button>}
        {!soloOp && <button onClick={() => setVista('chat')} style={tabBtn(vista === 'chat')}>Chat</button>}
      </div>
      {vista === 'chat' ? <ChatIA /> : vista === 'operacional' ? (<div>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 20, fontWeight: 600, textTransform: 'uppercase', color: C.navy }}>Analista Operacional</div>
        <div style={{ fontSize: 12.5, color: C.gray, marginBottom: 12 }}>Servicio que analiza automaticamente al ingresar y guarda los resultados en la base. Todo dentro del Dashboard.</div>
        {analisisOp.length === 0 ? <div style={{ color: C.gray, fontSize: 13, border: '1px dashed ' + C.line, borderRadius: 6, padding: 16, textAlign: 'center' }}>Aun no hay analisis guardado. Si es la primera vez, corre serein_ai_setup.sql en Supabase.</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {['OT', 'Produccion', 'Planta', 'Calidad', 'Retrasos', 'Horas Hombre', 'Capacidad'].map(area => { const a = analisisOp.find(x => x.area === area); if (!a) return null; const v = (area === 'Produccion' || area === 'Calidad' || area === 'Capacidad') ? (a.valor + '%') : String(a.valor); return (
              <div key={area} style={{ background: '#fff', border: '1px solid ' + C.line, borderTop: '3px solid ' + C.navy, borderRadius: 6, padding: '12px 14px' }}>
                <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 13, textTransform: 'uppercase', color: C.navy }}>{a.area}</div>
                <div style={{ fontSize: 21, fontWeight: 700, color: C.navy, fontFamily: "'Oswald',sans-serif", margin: '2px 0 4px' }}>{v}</div>
                <div style={{ fontSize: 12, color: '#3A4045' }}>{a.resumen}</div>
                <div style={{ fontSize: 10.5, color: C.gray, marginTop: 6 }}>{(a.fecha || '').slice(0, 10)} · fuente: {a.fuente}</div>
              </div>
            ) })}
          </div>
        )}
      </div>) : vista === 'comercial' ? (<div>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 20, fontWeight: 600, textTransform: 'uppercase', color: C.navy }}>Analista Comercial</div>
        <div style={{ fontSize: 12.5, color: C.gray, marginBottom: 12 }}>Servicio que analiza automaticamente al ingresar y guarda los resultados en la base. Preparado para reglas inteligentes.</div>
        {analisisCom.length === 0 ? <div style={{ color: C.gray, fontSize: 13, border: '1px dashed ' + C.line, borderRadius: 6, padding: 16, textAlign: 'center' }}>Aun no hay analisis guardado. Si es la primera vez, corre serein_ai_setup.sql en Supabase.</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {['Cotizaciones', 'Clientes', 'Seguimientos', 'Conversion', 'Ventas', 'Margenes'].map(area => { const a = analisisCom.find(x => x.area === area); if (!a) return null; const v = (area === 'Conversion' || area === 'Margenes') ? (a.valor + '%') : (area === 'Clientes' || area === 'Seguimientos') ? String(a.valor) : clp(a.valor); return (
              <div key={area} style={{ background: '#fff', border: '1px solid ' + C.line, borderTop: '3px solid ' + C.navy, borderRadius: 6, padding: '12px 14px' }}>
                <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 13, textTransform: 'uppercase', color: C.navy }}>{a.area}</div>
                <div style={{ fontSize: 21, fontWeight: 700, color: C.navy, fontFamily: "'Oswald',sans-serif", margin: '2px 0 4px' }}>{v}</div>
                <div style={{ fontSize: 12, color: '#3A4045' }}>{a.resumen}</div>
                <div style={{ fontSize: 10.5, color: C.gray, marginTop: 6 }}>{(a.fecha || '').slice(0, 10)} · fuente: {a.fuente}</div>
              </div>
            ) })}
          </div>
        )}
      </div>) : vista === 'analista' ? (<div>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 20, fontWeight: 600, textTransform: 'uppercase', color: C.navy }}>Analista Financiero</div>
        <div style={{ fontSize: 12.5, color: C.gray, marginBottom: 12 }}>Servicio que analiza automaticamente al ingresar y guarda los resultados en la base. Preparado para ejecucion automatica.</div>
        {gastosLC ? (() => {
          const maxV = Math.max(1, ...gastosLC.cat.map(x => Math.abs(x[1])))
          const cardG = (lbl, val, col) => <div style={{ flex: '1 1 150px', background: '#fff', border: '1px solid ' + C.line, borderRadius: 8, padding: 10 }}><div style={{ fontSize: 11, color: C.gray }}>{lbl}</div><div style={{ fontSize: 18, fontWeight: 700, color: col }}>{clp(val)}</div></div>
          return (
            <div style={{ border: '1px solid ' + C.line, borderRadius: 8, padding: 14, marginBottom: 14, background: '#F8FAFC' }}>
              <div style={{ fontWeight: 700, color: C.navy, marginBottom: 10 }}>Gastos del Libro de Compras · Fijos vs Variables</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                {cardG('Gastos fijos', gastosLC.fijo, '#2563EB')}
                {cardG('Gastos variables', gastosLC.variable, '#D97706')}
                {cardG('Total neto', gastosLC.total, C.navy)}
              </div>
              {gastosLC.sin > 0 ? <div style={{ fontSize: 11, color: C.gray, marginBottom: 10 }}>Sin clasificar (abre el Libro de Compras para autoclasificar): {clp(gastosLC.sin)}</div> : null}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}><tbody>
                {gastosLC.cat.map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: '1px solid ' + C.line }}>
                    <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>{k}</td>
                    <td style={{ padding: '5px 8px', width: '50%' }}><div style={{ background: C.navy, height: 8, borderRadius: 4, width: (Math.abs(v) / maxV * 100) + '%', minWidth: 2 }} /></td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{clp(v)}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )
        })() : null}
        {analisisFin.length === 0 ? <div style={{ color: C.gray, fontSize: 13, border: '1px dashed ' + C.line, borderRadius: 6, padding: 16, textAlign: 'center' }}>Aun no hay analisis guardado. Si es la primera vez, corre serein_ai_setup.sql en Supabase.</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {['Ventas', 'Compras', 'IVA', 'Factoring', 'Creditos', 'Leasing', 'Gastos', 'Flujo de Caja', 'Rentabilidad'].map(area => { const a = analisisFin.find(x => x.area === area); if (!a) return null; return (
              <div key={area} style={{ background: '#fff', border: '1px solid ' + C.line, borderTop: '3px solid ' + C.navy, borderRadius: 6, padding: '12px 14px' }}>
                <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 13, textTransform: 'uppercase', color: C.navy }}>{a.area}</div>
                <div style={{ fontSize: 21, fontWeight: 700, color: C.navy, fontFamily: "'Oswald',sans-serif", margin: '2px 0 4px' }}>{clp(a.valor)}</div>
                <div style={{ fontSize: 12, color: '#3A4045' }}>{a.resumen}</div>
                <div style={{ fontSize: 10.5, color: C.gray, marginTop: 6 }}>{(a.fecha || '').slice(0, 10)} · fuente: {a.fuente}</div>
              </div>
            ) })}
          </div>
        )}
      </div>) : vista === 'recs' ? (<div>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 20, fontWeight: 600, textTransform: 'uppercase', color: C.navy }}>Recomendaciones</div>
        <div style={{ fontSize: 12.5, color: C.gray, marginBottom: 12 }}>Generadas por reglas del sistema (preparado para que la IA las genere despues). Todo dentro del Dashboard.</div>
        {recsDB.length === 0 ? <div style={{ color: C.gray, fontSize: 13, border: '1px dashed ' + C.line, borderRadius: 6, padding: 16, textAlign: 'center' }}>No hay recomendaciones registradas. Si es la primera vez, corre serein_ai_setup.sql en Supabase.</div> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {recsDB.map(r => (
              <div key={r.id} style={{ background: '#fff', border: '1px solid ' + C.line, borderLeft: '5px solid ' + (r.prioridad === 'Alta' ? C.red : r.prioridad === 'Media' ? C.orange : C.gray), borderRadius: 6, padding: '12px 14px', opacity: r.estado === 'Descartada' ? 0.55 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: C.navy }}>{r.titulo}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, border: '1px solid ' + C.line, color: C.gray, textTransform: 'uppercase' }}>{r.modulo}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, color: '#fff', background: r.prioridad === 'Alta' ? C.red : r.prioridad === 'Media' ? C.orange : C.gray }}>{r.prioridad}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: r.estado === 'Aplicada' ? '#E7F2EA' : r.estado === 'Descartada' ? '#EEE' : '#FBF0E2', color: r.estado === 'Aplicada' ? C.green : r.estado === 'Descartada' ? C.gray : C.orange }}>{r.estado}</span>
                </div>
                <div style={{ fontSize: 13, color: '#3A4045', marginBottom: 4 }}>{r.descripcion}</div>
                <div style={{ fontSize: 12, color: C.gray }}><b>Motivo:</b> {r.motivo}</div>
                <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{(r.fecha || '').slice(0, 10)} · fuente: {r.fuente}</div>
                {r.estado === 'Nueva' ? <div style={{ marginTop: 8, display: 'flex', gap: 6 }}><button onClick={() => aplicarRec(r.id)} style={{ background: C.green, border: 'none', color: '#fff', borderRadius: 3, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>Aplicar</button><button onClick={() => descartarRec(r.id)} style={{ background: 'transparent', border: '1px solid ' + C.line, color: C.navy, borderRadius: 3, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>Descartar</button></div> : null}
              </div>
            ))}
          </div>
        )}
      </div>) : vista === 'alertas' ? (<div>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 20, fontWeight: 600, textTransform: 'uppercase', color: C.navy }}>Motor de alertas</div>
        <div style={{ fontSize: 12.5, color: C.gray, marginBottom: 12 }}>Se revisa automaticamente al ingresar. Cada alerta queda guardada en la base de datos.</div>
        {alertasDB.length === 0 ? <div style={{ color: C.gray, fontSize: 13, border: '1px dashed ' + C.line, borderRadius: 6, padding: 16, textAlign: 'center' }}>No hay alertas registradas. Si es la primera vez, corre alertas_setup.sql en Supabase.</div> : (
          <div style={{ overflowX: 'auto', border: '1px solid ' + C.line, borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 900 }}>
              <thead><tr style={{ background: C.navy, color: '#fff' }}>{['Fecha', 'Area', 'Prioridad', 'Estado', 'Registro', 'Descripcion', 'Revision', 'Resolucion', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {alertasDB.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #EEECE4' }}>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{(a.fecha || '').slice(0, 10)}</td>
                    <td style={{ padding: '7px 10px' }}>{a.area || '-'}</td>
                    <td style={{ padding: '7px 10px', fontWeight: 700, color: a.prioridad === 'Alta' ? C.red : a.prioridad === 'Media' ? C.orange : C.gray }}>{a.prioridad || '-'}</td>
                    <td style={{ padding: '7px 10px' }}><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: a.estado === 'Resuelta' ? '#E7F2EA' : a.estado === 'Revisada' ? '#FBF0E2' : '#F6E0DA', color: a.estado === 'Resuelta' ? C.green : a.estado === 'Revisada' ? C.orange : C.red }}>{a.estado}</span></td>
                    <td style={{ padding: '7px 10px', fontSize: 11.5, color: C.gray }}>{a.registro_relacionado || '-'}</td>
                    <td style={{ padding: '7px 10px' }}>{a.descripcion}</td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: C.gray }}>{a.fecha_revision ? a.fecha_revision.slice(0, 10) : '-'}</td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: C.gray }}>{a.fecha_resolucion ? a.fecha_resolucion.slice(0, 10) : '-'}</td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                      {a.estado !== 'Resuelta' ? <button onClick={() => revisarAlerta(a.id)} disabled={a.estado === 'Revisada'} style={{ background: 'transparent', border: '1px solid ' + C.line, borderRadius: 3, padding: '4px 8px', cursor: 'pointer', fontSize: 11, marginRight: 4, color: C.navy }}>Revisar</button> : null}
                      {a.estado !== 'Resuelta' ? <button onClick={() => resolverAlerta(a.id)} style={{ background: C.green, border: 'none', color: '#fff', borderRadius: 3, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}>Resolver</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>) : (<div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontFamily: "'Oswald',sans-serif", fontSize: 24, fontWeight: 600, textTransform: 'uppercase', margin: 0, color: C.navy }}>Dashboard Inteligente</h2>
        <div style={{ fontSize: 12.5, color: C.gray }}>Se actualiza automaticamente al ingresar · datos reales del sistema</div>
      </div>
      <div style={grid}>
        <Tarjeta icon={Flag} titulo="Prioridades del dia" color={C.red} vacio={!prioridades}>
          {prioridades && prioridades.length === 0 && <div style={{ fontSize: 12.5, color: C.green }}>Sin pendientes criticos hoy.</div>}
          {prioridades && prioridades.map((a, i) => (<div key={i} style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'flex-start' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLOR[a.sev], marginTop: 4, flexShrink: 0 }} /><span><b style={{ color: C.navy }}>{a.titulo}</b><span style={{ color: C.gray }}> — {a.detalle}</span></span></div>))}
        </Tarjeta>
        <Tarjeta icon={AlertTriangle} titulo="Alertas" color={C.orange} vacio={!alertasResumen}>
          {alertasResumen && <div style={{ display: 'flex', gap: 10 }}><span style={{ fontSize: 12.5, fontWeight: 700, color: C.red }}>{alertasResumen.rojas} criticas</span><span style={{ fontSize: 12.5, fontWeight: 700, color: C.orange }}>{alertasResumen.amar} medias</span></div>}
          {alertasResumen && alertasResumen.top.length === 0 && <div style={{ fontSize: 12.5, color: C.green }}>Todo en orden.</div>}
          {alertasResumen && alertasResumen.top.map((a, i) => (<div key={i} style={{ fontSize: 12, color: C.gray }}>• <b style={{ color: C.navy }}>{a.titulo}</b></div>))}
        </Tarjeta>
        <Tarjeta icon={Wallet} titulo="Resumen financiero" color={C.navy} vacio={!financiero}>
          {financiero && <Fila k="Salida de caja del mes" v={clp(financiero.salida)} color={C.red} />}
          {financiero && <Fila k="Deuda vigente" v={clp(financiero.deuda)} />}
          {financiero && <Fila k="Cuotas del mes" v={clp(financiero.cuotas)} />}
          {financiero && financiero.ivaPos !== null && <Fila k="Posicion IVA del mes" v={clp(financiero.ivaPos)} color={financiero.ivaPos > 0 ? C.orange : C.green} />}
        </Tarjeta>
        <Tarjeta icon={TrendingUp} titulo="Resumen comercial" color={C.green} vacio={!comercial}>
          {comercial && <Fila k="Venta cotizada" v={clp(comercial.cot)} />}
          {comercial && <Fila k="Facturado" v={clp(comercial.fac)} />}
          {comercial && <Fila k="Por facturar" v={clp(comercial.porFac)} color={C.orange} />}
          {comercial && <Fila k="Proyectos / OT" v={comercial.nOT} />}
        </Tarjeta>
        <Tarjeta icon={Factory} titulo="Produccion" color={C.navy} vacio={!produccion}>
          {produccion && <Fila k="OT activas" v={produccion.nAct} />}
          {produccion && <Fila k="Avance fisico promedio" v={produccion.avg === null ? 's/d' : produccion.avg + '%'} />}
          {produccion && <Fila k="m2 en ejecucion" v={produccion.m2 ? produccion.m2.toLocaleString('es-CL') : 's/d'} />}
        </Tarjeta>
        <Tarjeta icon={ShoppingCart} titulo="Compras" color={C.orange} vacio={comprasCard === null}>
          {comprasCard && comprasCard.cargando && <div style={{ fontSize: 12.5, color: C.gray }}>Cargando compras…</div>}
          {comprasCard && !comprasCard.cargando && <Fila k="Documentos (total)" v={comprasCard.nTotal} />}
          {comprasCard && !comprasCard.cargando && <Fila k={'Compras ' + mesLabel(comprasCard.ult)} v={clp(comprasCard.netoUlt)} />}
          {comprasCard && !comprasCard.cargando && comprasCard.top[0] && <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>Top: {comprasCard.top.map(t => t[0]).slice(0, 2).join(', ')}</div>}
        </Tarjeta>
        <Tarjeta icon={Banknote} titulo="Cobranza" color={C.green} vacio={!cobranza}>
          {cobranza && <Fila k="Por cobrar" v={clp(cobranza.porCobrar)} color={C.orange} />}
          {cobranza && <Fila k="Facturado" v={clp(cobranza.facturado)} />}
          {cobranza && <Fila k="Cobrado" v={clp(cobranza.cobrado)} color={C.green} />}
          {cobranza && cobranza.atrasoMax > 0 && <Fila k="Atraso max" v={cobranza.atrasoMax + ' dias'} color={C.red} />}
          {cobranza && cobranza.factN > 0 && <Fila k="En factoring" v={cobranza.factN + ' EDP (' + clp(cobranza.factMonto) + ')'} />}
          {cobranza && cobranza.factPerd > 0 && <Fila k="Perdida factoring" v={clp(cobranza.factPerd)} color={C.red} />}
          {cobranza && <Fila k="EDP pendientes" v={cobranza.nPend} />}
          {cobranza && <Fila k="Vencidas" v={cobranza.nVenc + (cobranza.montoVenc ? ' (' + clp(cobranza.montoVenc) + ')' : '')} color={cobranza.nVenc ? C.red : C.gray} />}
        </Tarjeta>
        <Tarjeta icon={Lightbulb} titulo="Recomendaciones" color={C.orange} vacio={!recomendaciones}>
          {recomendaciones && recomendaciones.length === 0 && <div style={{ fontSize: 12.5, color: C.green }}>Indicadores en orden; sin acciones urgentes.</div>}
          {recomendaciones && recomendaciones.map((r, i) => (<div key={i} style={{ fontSize: 12, color: C.gray }}><b style={{ color: C.orange }}>{r.area}:</b> {r.texto}</div>))}
        </Tarjeta>
      </div>
      {cobranza && cobranza.porCliente.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 15, fontWeight: 600, textTransform: 'uppercase', color: C.navy, marginBottom: 10 }}>Cobranza · Historial por cliente</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            {[['Facturado', cobranza.facturado, C.navy], ['Cobrado (pagos/abonos)', cobranza.cobrado, C.green], ['Por cobrar', cobranza.porCobrar, C.orange], ['Vencido', cobranza.montoVenc, C.red]].map(pair => <div key={pair[0]} style={{ flex: '1 1 150px', background: '#fff', border: '1px solid ' + C.line, borderRadius: 8, padding: 10 }}><div style={{ fontSize: 11, color: C.gray }}>{pair[0]}</div><div style={{ fontSize: 17, fontWeight: 700, color: pair[2] }}>{clp(pair[1])}</div></div>)}
          </div>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 10 }}>Atraso maximo {cobranza.atrasoMax} dias · promedio {cobranza.atrasoProm} dias · {cobranza.nVenc} EDP vencidas{cobranza.factN ? ' · ' + cobranza.factN + ' EDP en factoring (' + clp(cobranza.factMonto) + ', perdida est. ' + clp(cobranza.factPerd) + ')' : ''}</div>
          <div style={{ overflowX: 'auto', border: '1px solid ' + C.line, borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ background: C.navy, color: '#fff' }}>{['Cliente', 'Facturado', 'Cobrado', 'Por cobrar', 'Vencido', 'Factoring', 'Perd. fact.', 'Atraso max'].map(h => <th key={h} style={{ padding: '7px 9px', textAlign: h === 'Cliente' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {cobranza.porCliente.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid ' + C.line }}>
                    <td style={{ padding: '6px 9px', whiteSpace: 'nowrap' }}>{c.cliente}</td>
                    <td style={{ padding: '6px 9px', textAlign: 'right', whiteSpace: 'nowrap' }}>{clp(c.fact)}</td>
                    <td style={{ padding: '6px 9px', textAlign: 'right', whiteSpace: 'nowrap', color: C.green }}>{clp(c.cobr)}</td>
                    <td style={{ padding: '6px 9px', textAlign: 'right', whiteSpace: 'nowrap', color: c.pend ? C.orange : C.gray }}>{clp(c.pend)}</td>
                    <td style={{ padding: '6px 9px', textAlign: 'right', whiteSpace: 'nowrap', color: c.venc ? C.red : C.gray }}>{clp(c.venc)}</td>
                    <td style={{ padding: '6px 9px', textAlign: 'right', whiteSpace: 'nowrap', color: c.facMonto ? C.navy : C.gray }}>{c.facMonto ? clp(c.facMonto) : '-'}</td>
                    <td style={{ padding: '6px 9px', textAlign: 'right', whiteSpace: 'nowrap', color: c.facPerd ? C.red : C.gray }}>{c.facPerd ? clp(c.facPerd) : '-'}</td>
                    <td style={{ padding: '6px 9px', textAlign: 'right', whiteSpace: 'nowrap', color: c.atrMax > 0 ? C.red : C.gray }}>{c.atrMax > 0 ? c.atrMax + ' d' : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {orden.length > 0 && (
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 15, fontWeight: 600, textTransform: 'uppercase', color: C.navy, marginBottom: 10 }}>Detalle de alertas</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {orden.map((a, i) => { const Ico = ICON[a.icono] || Info; return (<div key={i} style={{ background: '#fff', border: '1px solid ' + C.line, borderLeft: '5px solid ' + SEV_COLOR[a.sev], borderRadius: 4, padding: '12px 14px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><Ico size={17} color={SEV_COLOR[a.sev]} /><span style={{ fontWeight: 700, fontSize: 14, color: C.navy }}>{a.titulo}</span><span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: SEV_COLOR[a.sev], border: '1px solid ' + SEV_COLOR[a.sev], borderRadius: 3, padding: '1px 6px', textTransform: 'uppercase' }}>{a.area}</span></div><div style={{ fontSize: 13, color: '#3A4045', marginBottom: 4 }}>{a.detalle}</div><div style={{ fontSize: 12.5, color: C.gray }}><strong style={{ color: C.orange }}>Recomendacion:</strong> {a.recomendacion}</div>{a.ir && onIr && <button onClick={() => onIr(a.ir)} style={{ marginTop: 8, background: 'transparent', border: '1px solid ' + C.line, borderRadius: 3, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.navy }}>Ir al modulo</button>}</div>) })}
          </div>
        </div>
      )}
      </div>)}
    </div>
  )
}
