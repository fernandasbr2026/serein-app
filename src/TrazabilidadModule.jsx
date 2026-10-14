import React, { useState, useRef, useMemo } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Mail, Users } from 'lucide-react'
import { ocNeto, ocTotal, vencOC, esGastoMensual } from './OrdenesCompraModule.jsx'
import { supabase } from './supabase.js'
import { sumarDiasHabiles, diasHabilesHasta } from './plazos.js'
import { pullState, pushState } from './sync.js'
import { piezasDelCliente, lotesDelClienteConPlazo, resumenTableroCliente } from './vistaCliente.js'
import { parseKronosWorkbook, construirPlanImportacion, aplicarPlanImportacion } from './importKronos.js'
import { KpiCard } from './ui.jsx'
import { Upload } from 'lucide-react'
import * as XLSX from 'xlsx'
import { eventosProduccionDeOT } from './OTModule.jsx'

// ============================================================
// MÓDULO: Trazabilidad y Alertas (Gerencia)
// Cadena: Cotización → OT → OC proveedor / Compras → Producción → Factura → Cobranza
// + Fase E del rediseño de OT: vencimiento de lotes de piezas por plazo
// comprometido (ver plan en C:\Users\maria\.claude\plans\sorted-singing-sundae.md)
// ============================================================
// Granallado y pintura por fecha: cuándo se hizo cada etapa y cuántos m².
// Todo sale de los protocolos (PIG y PGP) ya cargados en las OT.
// ============================================================
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fm2 = n => (n || 0).toLocaleString('es-CL', { maximumFractionDigits: 1 })
const etiquetaPeriodo = (f, modo) => modo === 'dia' ? f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4) : modo === 'mes' ? MESES[parseInt(f.slice(5, 7), 10) - 1] + ' ' + f.slice(0, 4) : f.slice(0, 4)
const claveDe = (f, modo) => modo === 'dia' ? f : modo === 'mes' ? f.slice(0, 7) : f.slice(0, 4)

function ProduccionPorFecha({ ots }) {
  const hoyD = new Date()
  const [desde, setDesde] = useState(hoyD.getFullYear() + '-01-01')
  const [hasta, setHasta] = useState(ymd(hoyD))
  const [modo, setModo] = useState('mes')
  const [area, setArea] = useState('')
  const [cliente, setCliente] = useState('')
  const [etapa, setEtapa] = useState('')
  const [detalle, setDetalle] = useState(false)

  const todos = useMemo(() => ots.filter(o => !o.eliminada).flatMap(o => eventosProduccionDeOT(o)), [ots])
  const areas = useMemo(() => Array.from(new Set(todos.map(e => e.area).filter(Boolean))).sort(), [todos])
  const clientes = useMemo(() => Array.from(new Set(todos.map(e => e.cliente).filter(Boolean))).sort(), [todos])
  const evs = useMemo(() => todos.filter(e => (!desde || e.fecha >= desde) && (!hasta || e.fecha <= hasta) && (!area || e.area === area) && (!cliente || e.cliente === cliente) && (!etapa || e.etapa === etapa)).sort((a, b) => b.fecha.localeCompare(a.fecha) || a.orden - b.orden), [todos, desde, hasta, area, cliente, etapa])
  const etapas = useMemo(() => Array.from(new Set(todos.map(e => e.etapa))).sort((a, b) => (a === 'Granallado' ? -1 : b === 'Granallado' ? 1 : parseInt(a.slice(5), 10) - parseInt(b.slice(5), 10))), [todos])
  const etapasVista = etapa ? [etapa] : etapas

  const filas = useMemo(() => {
    const m = {}
    evs.forEach(e => {
      const k = claveDe(e.fecha, modo)
      const f = m[k] || (m[k] = { k, fecha: e.fecha, porEtapa: {} })
      const c = f.porEtapa[e.etapa] || (f.porEtapa[e.etapa] = { m2: 0, piezas: 0 })
      c.m2 += e.m2; c.piezas += e.piezas
    })
    return Object.values(m).sort((a, b) => b.k.localeCompare(a.k))
  }, [evs, modo])
  const totales = useMemo(() => { const t = {}; evs.forEach(e => { const c = t[e.etapa] || (t[e.etapa] = { m2: 0, piezas: 0 }); c.m2 += e.m2; c.piezas += e.piezas }); return t }, [evs])
  const sinM2 = evs.filter(e => e.piezas > 0 && e.m2 === 0).length

  const exportar = () => {
    const wb = XLSX.utils.book_new()
    const resumen = filas.map(f => { const r = { Período: etiquetaPeriodo(f.fecha, modo) }; etapasVista.forEach(et => { const c = f.porEtapa[et] || { m2: 0, piezas: 0 }; r[et + ' m²'] = Math.round(c.m2 * 100) / 100; r[et + ' piezas'] = c.piezas }); return r })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(evs.map(e => ({ Fecha: e.fecha, Etapa: e.etapa, OT: e.ot, Cliente: e.cliente, Área: e.area, Protocolo: e.protocolo, Piezas: e.piezas, 'm²': e.m2 }))), 'Detalle')
    XLSX.writeFile(wb, 'produccion-por-fecha-' + desde + '-a-' + hasta + '.xlsx')
  }
  const sel = { border: '1px solid #DFE4EA', borderRadius: 4, padding: '7px 10px', fontSize: 13 }
  const th = { textAlign: 'right', padding: '6px 8px', fontSize: 11, color: '#9AA3AD', textTransform: 'uppercase', whiteSpace: 'nowrap' }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase', marginBottom: 4 }}>Granallado y pintura por fecha</div>
      <div style={{ fontSize: 12, color: '#9AA3AD', marginBottom: 10 }}>Se arma solo con los protocolos de granallado (PIG) y de pintura (PGP) de las OT: la fecha es la del protocolo y los m² son los de las piezas que lleva. No hay que ingresar nada aparte.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: '#5A636E' }}>Desde <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={sel} /></label>
        <label style={{ fontSize: 12, color: '#5A636E' }}>Hasta <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={sel} /></label>
        <select value={modo} onChange={e => setModo(e.target.value)} style={sel}><option value="dia">Por día</option><option value="mes">Por mes</option><option value="anio">Por año</option></select>
        <select value={etapa} onChange={e => setEtapa(e.target.value)} style={sel}><option value="">Todas las etapas</option>{etapas.map(x => <option key={x}>{x}</option>)}</select>
        <select value={area} onChange={e => setArea(e.target.value)} style={sel}><option value="">Todas las áreas</option>{areas.map(x => <option key={x}>{x}</option>)}</select>
        <select value={cliente} onChange={e => setCliente(e.target.value)} style={sel}><option value="">Todos los clientes</option>{clientes.map(x => <option key={x}>{x}</option>)}</select>
        <button onClick={exportar} disabled={!evs.length} style={{ ...sel, background: evs.length ? '#fff' : '#F2F4F7', cursor: evs.length ? 'pointer' : 'default' }}>Descargar Excel</button>
      </div>
      {todos.length === 0 ? (
        <div style={{ color: '#9AA3AD', fontSize: 13 }}>Aún no hay protocolos de granallado o pintura con mediciones cargadas.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
            {etapasVista.map(et => <KpiCard key={et} value={fm2((totales[et] || {}).m2) + ' m²'} label={et + ' · ' + ((totales[et] || {}).piezas || 0) + ' pzas'} />)}
          </div>
          {sinM2 > 0 && <div style={{ fontSize: 11.5, color: '#D9600A', marginBottom: 8 }}>{sinM2} registro(s) con piezas sin m² informados: cuentan piezas pero no suman m².</div>}
          {filas.length === 0 ? (
            <div style={{ color: '#9AA3AD', fontSize: 13 }}>No hay granallado ni pintura en ese período.</div>
          ) : (
            <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #DFE4EA' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ borderBottom: '1px solid #E4E8ED' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Período</th>
                  {etapasVista.map(et => <th key={et} style={th}>{et} (m² · pzas)</th>)}
                </tr></thead>
                <tbody>
                  {filas.map(f => (
                    <tr key={f.k} style={{ borderBottom: '1px solid #DFE4EA' }}>
                      <td style={{ padding: '7px 8px', fontWeight: 600, textTransform: modo === 'mes' ? 'capitalize' : 'none' }}>{etiquetaPeriodo(f.fecha, modo)}</td>
                      {etapasVista.map(et => { const c = f.porEtapa[et]; return <td key={et} style={{ padding: '7px 8px', textAlign: 'right', color: c ? C.carbon : '#C5CBD3', whiteSpace: 'nowrap' }}>{c ? fm2(c.m2) + ' · ' + c.piezas : '—'}</td> })}
                    </tr>
                  ))}
                  <tr style={{ background: '#F2F4F7', fontWeight: 700 }}>
                    <td style={{ padding: '7px 8px' }}>Total del período</td>
                    {etapasVista.map(et => <td key={et} style={{ padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{fm2((totales[et] || {}).m2)} · {(totales[et] || {}).piezas || 0}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {evs.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setDetalle(v => !v)} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>{detalle ? 'Ocultar detalle' : 'Ver detalle por OT y protocolo (' + evs.length + ')'}</button>
              {detalle && (
                <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #DFE4EA', marginTop: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead><tr style={{ borderBottom: '1px solid #E4E8ED' }}>{['Fecha', 'Etapa', 'OT', 'Cliente', 'Protocolo', 'Piezas', 'm²'].map(h => <th key={h} style={{ ...th, textAlign: ['Piezas', 'm²'].includes(h) ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {evs.map((e, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #DFE4EA' }}>
                          <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{e.fecha}</td>
                          <td style={{ padding: '6px 8px' }}>{e.etapa}</td>
                          <td style={{ padding: '6px 8px', fontWeight: 600 }}>{e.ot}</td>
                          <td style={{ padding: '6px 8px', color: '#9AA3AD' }}>{e.cliente}</td>
                          <td style={{ padding: '6px 8px', color: '#9AA3AD' }}>{e.protocolo}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>{e.piezas}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fm2(e.m2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================

import { SEREIN } from './theme-serein.js'
// Paleta reskineada a la identidad Serein 2026 — mismas claves, solo cambian los valores hex.
const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const hoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }

const ocsDeOT = (ocs, numOT) => (ocs || []).filter(o => (o.asignaciones || []).some(a => a.ot === numOT))
const produccionDe = o => ({ 'Cotizada': 'No iniciada', 'En ejecución': 'En proceso', 'Terminada': 'Terminada', 'Facturada': 'Terminada', 'Cerrada': 'Terminada' }[o.estado] || '—')
const facturacionDe = o => (o.ventas && o.ventas.length > 0) ? ('Facturada (' + o.ventas.length + ')') : (['Facturada', 'Cerrada', 'Terminada'].includes(o.estado) ? 'Pendiente' : '—')
const cobranzaDe = o => { const v = o.ventas || []; if (!v.length) return '—'; if (v.every(x => x.estadoPago === 'Pagado')) return 'Cobrado'; if (v.some(x => x.estadoPago === 'Pagado')) return 'Parcial'; return 'Pendiente' }

// Junta, de todas las OT, los lotes (partidas de recepcion con plazo
// comprometido) que todavia tienen piezas sin despachar — un lote con
// todas sus piezas ya despachadas no genera alarma, ya se cumplio.
export function lotesConPlazo(ots) {
  const lotes = []
  ots.forEach(o => {
    ;(o.partidas || []).forEach(p => {
      if (!p.plazoDias || !p.fecha) return
      const piezas = (o.marcasEsperadas || []).filter(m => m.loteId === p.id)
      const total = piezas.length
      const despachadas = piezas.filter(m => m.despachoId).length
      if (total > 0 && despachadas === total) return
      const vencimiento = sumarDiasHabiles(p.fecha, p.plazoDias)
      const diasRestantes = diasHabilesHasta(vencimiento)
      const estado = diasRestantes < 0 ? 'vencido' : diasRestantes <= 2 ? 'por_vencer' : 'en_plazo'
      lotes.push({ ot: o, partida: p, vencimiento, total, despachadas, diasRestantes, estado })
    })
  })
  return lotes.sort((a, b) => String(a.vencimiento || '').localeCompare(String(b.vencimiento || '')))
}
const ESTADO_LOTE_LABEL = { vencido: 'Vencido', por_vencer: 'Por vencer', en_plazo: 'En plazo' }
const ESTADO_LOTE_COLOR = { vencido: '#C5453D', por_vencer: '#D9600A', en_plazo: '#5A6B85' }

// Guarda un cambio en un campo de UNA pieza (diametro/embalaje/factura) de
// UNA OT puntual, sin pisar cambios que hayan hecho otras personas en otras
// piezas mientras tanto — mismo patron seguro "pull-fresh + merge + push"
// que ya usa actualizarMarcasEsperadas() en OTModule.jsx, aplicado aca
// porque esta vista cruza piezas de varias OT a la vez.
async function actualizarPiezaCliente(otsProp, setOts, otId, marcaId, cambios) {
  try { await pullState() } catch (e) {}
  let fresco = null
  try { fresco = JSON.parse(localStorage.getItem('serein_ots') || 'null') } catch (e) {}
  const base = Array.isArray(fresco) ? fresco : otsProp
  const nuevo = base.map(o => o.id !== otId ? o : { ...o, marcasEsperadas: (o.marcasEsperadas || []).map(m => m.id === marcaId ? { ...m, ...cambios } : m) })
  try { localStorage.setItem('serein_ots', JSON.stringify(nuevo)) } catch (e) {}
  setOts(nuevo)
  pushState()
}

// Importador del historico de control de planta (Fase F3) — nunca escribe
// directo: lee el Excel, arma un plan agrupado por OC y lo muestra en una
// vista previa con checkbox por grupo; solo al confirmar se aplica.
function ImportadorHistorico({ ots, setOts, cliente }) {
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState(null)
  const [aplicando, setAplicando] = useState(false)
  const [msgFinal, setMsgFinal] = useState('')

  const onFile = e => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    setCargando(true); setError(''); setPlan(null); setMsgFinal('')
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const datos = parseKronosWorkbook(ev.target.result)
        if (datos.errores.length && !datos.lotes.length && !datos.piezas.length) { setError(datos.errores.join(' ')); setCargando(false); return }
        const grupos = construirPlanImportacion(ots, cliente, datos)
        if (!grupos.length) { setError('No se encontraron filas para importar en el archivo.'); setCargando(false); return }
        setPlan({ grupos, errores: datos.errores })
      } catch (err) { setError('No se pudo leer el archivo: ' + ((err && err.message) || String(err))) }
      setCargando(false)
    }
    reader.readAsArrayBuffer(file)
  }

  const toggleGrupo = oc => setPlan(pl => ({ ...pl, grupos: pl.grupos.map(g => g.oc === oc ? { ...g, aplicar: !g.aplicar } : g) }))

  const confirmar = async () => {
    if (!plan) return
    setAplicando(true)
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_ots') || 'null') } catch (e) {}
    const base = Array.isArray(fresco) ? fresco : ots
    const gruposAplicar = plan.grupos.filter(g => g.aplicar && g.ot)
    const nuevo = aplicarPlanImportacion(base, gruposAplicar)
    try { localStorage.setItem('serein_ots', JSON.stringify(nuevo)) } catch (e) {}
    setOts(nuevo)
    pushState()
    const totalLotes = gruposAplicar.reduce((a, g) => a + g.resumen.lotesNuevos, 0)
    const totalPiezas = gruposAplicar.reduce((a, g) => a + g.resumen.piezasNuevas + g.resumen.piezasCompletadas, 0)
    setMsgFinal(`Listo — se procesaron ${totalLotes} lote(s) y ${totalPiezas} pieza(s) de ${gruposAplicar.length} OC.`)
    setAplicando(false)
    setPlan(null)
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={() => setAbierto(v => !v)} style={{ background: abierto ? '#EEE9DF' : C.teal, color: abierto ? C.carbon : '#fff', border: 'none', borderRadius: 4, padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Upload size={14} /> Importar histórico (Excel de control de planta)
      </button>
      {msgFinal && <div style={{ fontSize: 12.5, color: C.verde, marginTop: 8 }}>{msgFinal}</div>}
      {abierto && (
        <div style={{ marginTop: 10, border: '1px solid #DFE4EA', borderRadius: 6, padding: 12, background: '#FAFAF8' }}>
          <div style={{ fontSize: 12, color: C.gris, marginBottom: 8 }}>
            Sube el Excel de control de planta de {cliente} (hojas "Lotes (producción)" y "Piezas (despacho)"). Se agrupa por N° de OC — solo se importa a una OT que ya exista con esa OC y ese cliente; nada se crea ni se pisa sin que lo confirmes abajo.
          </div>
          <label style={{ cursor: cargando ? 'wait' : 'pointer', background: C.carbon, color: '#fff', border: 'none', padding: '7px 14px', fontSize: 12.5, borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: cargando ? 0.7 : 1 }}>
            {cargando ? 'Leyendo…' : 'Elegir archivo .xlsx'}
            <input type="file" accept=".xlsx,.xls" onChange={onFile} disabled={cargando} style={{ display: 'none' }} />
          </label>
          {error && <div style={{ fontSize: 12.5, color: C.rojo, marginTop: 8 }}>{error}</div>}
          {plan && (
            <div style={{ marginTop: 12 }}>
              {plan.errores.length > 0 && <div style={{ fontSize: 11.5, color: C.ambar, marginBottom: 8 }}>{plan.errores.join(' ')}</div>}
              <div style={{ fontSize: 11, color: C.gris, marginBottom: 6 }}>Vista previa — revisa antes de confirmar. Solo se aplican los grupos marcados con OT encontrada.</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E4E8ED' }}>
                      {['', 'OC', 'OT encontrada', 'Lotes', 'Piezas nuevas', 'Piezas a completar'].map((h, i) => (
                        <th key={i} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 10.5, color: '#9AA3AD', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {plan.grupos.map(g => (
                      <tr key={g.oc || 'sin-oc'} style={{ borderBottom: '1px solid #EEE9DF', opacity: g.ot ? 1 : 0.55 }}>
                        <td style={{ padding: '5px 8px' }}><input type="checkbox" checked={g.aplicar} disabled={!g.ot} onChange={() => toggleGrupo(g.oc)} /></td>
                        <td style={{ padding: '5px 8px', fontWeight: 600 }}>{g.oc || '(sin OC)'}</td>
                        <td style={{ padding: '5px 8px' }}>{g.otNumero || <span style={{ color: C.rojo }}>Sin OT en el sistema — no se importa</span>}</td>
                        <td style={{ padding: '5px 8px' }}>{g.resumen.lotesNuevos}</td>
                        <td style={{ padding: '5px 8px' }}>{g.resumen.piezasNuevas}</td>
                        <td style={{ padding: '5px 8px' }}>{g.resumen.piezasCompletadas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={confirmar} disabled={aplicando || !plan.grupos.some(g => g.aplicar && g.ot)} style={{ marginTop: 10, background: aplicando ? '#9AA3AD' : C.verde, color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 12.5, cursor: aplicando ? 'default' : 'pointer' }}>
                {aplicando ? 'Aplicando…' : 'Confirmar importación'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Vista por Cliente (Fase F) — cruza todas las OT activas de un mismo
// cliente para responder la pregunta real de la usuaria: de todas las
// piezas de ese cliente, cuales ya se despacharon, en que etapa de pintura
// estan las que quedan, y cuales ya se facturaron (con su embalaje aparte).
function VistaPorCliente({ ots, setOts }) {
  const clientes = useMemo(() => Array.from(new Set(ots.filter(o => !o.eliminada).map(o => o.cliente).filter(Boolean))).sort(), [ots])
  const [cliente, setCliente] = useState('')
  const [filtroEstadoPieza, setFiltroEstadoPieza] = useState('')
  const [buscarPieza, setBuscarPieza] = useState('')
  const [localValores, setLocalValores] = useState({})
  const timers = useRef({})

  const piezas = useMemo(() => cliente ? piezasDelCliente(ots, cliente) : [], [ots, cliente])
  const lotes = useMemo(() => cliente ? lotesDelClienteConPlazo(ots, cliente) : [], [ots, cliente])
  const resumen = useMemo(() => resumenTableroCliente(piezas, lotes), [piezas, lotes])
  const estadosPresentes = Array.from(new Set(piezas.map(f => f.estado)))
  // Despacho por pieza SIEMPRE viene de ot.despachos via despachoId — el
  // mismo dato que ya escribe DespachoOT dentro de la ficha de cada OT, asi
  // que apenas alguien despacha una pieza en su OT esta vista lo refleja
  // solo (no hay una copia separada que sincronizar).
  const despachoDePieza = f => f.m.despachoId ? (f.ot.despachos || []).find(d => d.id === f.m.despachoId) : null
  const qBusqueda = buscarPieza.trim().toLowerCase()
  const piezasFiltradas = piezas.filter(f => {
    if (filtroEstadoPieza && f.estado !== filtroEstadoPieza) return false
    if (qBusqueda) {
      const campos = [f.m.tag, f.m.marca, f.m.idPieza, f.m.referencia, f.ot.numero, f.ot.oc, f.ot.nv]
      if (!campos.some(v => String(v || '').toLowerCase().includes(qBusqueda))) return false
    }
    return true
  })

  const cambiarCampo = (otId, marcaId, campo, valor) => {
    const key = otId + '|' + marcaId + '|' + campo
    setLocalValores(v => ({ ...v, [key]: valor }))
    clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(() => {
      const esNumerico = campo === 'embalaje' || campo === 'm2'
      actualizarPiezaCliente(ots, setOts, otId, marcaId, { [campo]: esNumerico ? numDecCliente(valor) : (valor.trim() || null) })
    }, 700)
  }
  const valorCampo = (otId, marcaId, campo, actual) => {
    const key = otId + '|' + marcaId + '|' + campo
    return localValores[key] !== undefined ? localValores[key] : (actual != null ? String(actual) : '')
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}><Users size={16} /> Vista por cliente</div>
        <select value={cliente} onChange={e => setCliente(e.target.value)} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '7px 10px', fontSize: 13, minWidth: 220 }}>
          <option value="">Elegir cliente…</option>
          {clientes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {!cliente && <div style={{ color: '#9AA3AD', fontSize: 13, marginBottom: 20 }}>Elige un cliente para ver su tablero, lotes y piezas cruzados entre todas sus OT.</div>}

      {cliente && (
        <>
          <ImportadorHistorico ots={ots} setOts={setOts} cliente={cliente} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
            <KpiCard value={resumen.totalPiezas} label="Piezas totales" />
            <KpiCard value={resumen.despachadas} label="Despachadas" />
            <KpiCard value={resumen.m2Total.toLocaleString('es-CL', { maximumFractionDigits: 1 })} label="m² totales" />
            <KpiCard value={resumen.lotesVencidos} label="Lotes vencidos" iconColor={C.rojo} />
            <KpiCard value={resumen.lotesPorVencer} label="Lotes por vencer" iconColor={C.ambar} />
          </div>

          {lotes.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.gris, textTransform: 'uppercase', marginBottom: 6 }}>Lotes de {cliente}</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E4E8ED' }}>
                      {['OT', 'OC', 'Guía', 'Piezas', 'Vencimiento', 'Estado'].map((h, i) => (
                        <th key={i} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lotes.map((l, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #DFE4EA' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>{l.ot.numero}</td>
                        <td style={{ padding: '6px 8px', color: C.gris }}>{l.ot.oc && l.ot.oc !== '—' ? l.ot.oc : '—'}</td>
                        <td style={{ padding: '6px 8px', color: C.gris }}>{l.partida.numeroGuia || '—'}</td>
                        <td style={{ padding: '6px 8px', color: C.gris }}>{l.despachadas}/{l.total || '?'}</td>
                        <td style={{ padding: '6px 8px' }}>{l.vencimiento || '—'}</td>
                        <td style={{ padding: '6px 8px' }}><span style={{ background: ESTADO_LOTE_COLOR[l.estado], color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 10.5, fontWeight: 700 }}>{ESTADO_LOTE_LABEL[l.estado]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.gris, textTransform: 'uppercase' }}>Piezas de {cliente} ({piezasFiltradas.length})</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={buscarPieza} onChange={e => setBuscarPieza(e.target.value)} placeholder="Buscar por marca, OT, OC, NV…" style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '5px 8px', fontSize: 12, minWidth: 200 }} />
                <select value={filtroEstadoPieza} onChange={e => setFiltroEstadoPieza(e.target.value)} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '5px 8px', fontSize: 12 }}>
                  <option value="">Todos los estados</option>
                  {estadosPresentes.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
            {piezas.length === 0 ? (
              <div style={{ color: '#9AA3AD', fontSize: 13 }}>Este cliente todavía no tiene piezas cargadas en ninguna OT.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E4E8ED' }}>
                      {['TAG', 'OT', 'OC', 'NV', 'Diámetro', 'm²', 'Estado', 'Despacho', 'Embalaje', 'Factura'].map((h, i) => (
                        <th key={i} style={{ textAlign: 'left', padding: '5px 6px', fontSize: 10.5, color: '#9AA3AD', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {piezasFiltradas.map(f => (
                      <tr key={f.ot.id + '|' + f.m.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
                        <td style={{ padding: '5px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>{f.m.tag || f.m.marca}</td>
                        <td style={{ padding: '5px 6px', whiteSpace: 'nowrap' }}>{f.ot.numero}</td>
                        <td style={{ padding: '5px 6px', color: '#9AA3AD' }}>{f.ot.oc && f.ot.oc !== '—' ? f.ot.oc : '—'}</td>
                        <td style={{ padding: '5px 6px', color: '#9AA3AD' }}>{f.ot.nv && f.ot.nv !== '—' ? f.ot.nv : '—'}</td>
                        <td style={{ padding: '5px 6px' }}>
                          <input value={valorCampo(f.ot.id, f.m.id, 'diametro', f.m.diametro)} onChange={e => cambiarCampo(f.ot.id, f.m.id, 'diametro', e.target.value)} placeholder="—" style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '3px 5px', fontSize: 11.5, width: 60 }} />
                        </td>
                        <td style={{ padding: '5px 6px' }}>
                          <input value={valorCampo(f.ot.id, f.m.id, 'm2', f.m.m2)} onChange={e => cambiarCampo(f.ot.id, f.m.id, 'm2', e.target.value)} placeholder="—" style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '3px 5px', fontSize: 11.5, width: 55 }} />
                        </td>
                        <td style={{ padding: '5px 6px' }}><span style={{ background: f.colorEstado, color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{f.estado}</span></td>
                        <td style={{ padding: '5px 6px', color: '#9AA3AD', whiteSpace: 'nowrap' }}>{(() => { const d = despachoDePieza(f); return d ? ('Guía ' + (d.numeroGuia || d.detalle || '') + (f.m.fechaDespacho ? ' · ' + f.m.fechaDespacho : '')) : '—' })()}</td>
                        <td style={{ padding: '5px 6px' }}>
                          <input value={valorCampo(f.ot.id, f.m.id, 'embalaje', f.m.embalaje)} onChange={e => cambiarCampo(f.ot.id, f.m.id, 'embalaje', e.target.value)} placeholder="$" style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '3px 5px', fontSize: 11.5, width: 70 }} />
                        </td>
                        <td style={{ padding: '5px 6px' }}>
                          <input value={valorCampo(f.ot.id, f.m.id, 'facturaFolio', f.m.facturaFolio)} onChange={e => cambiarCampo(f.ot.id, f.m.id, 'facturaFolio', e.target.value)} placeholder="Folio" style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '3px 5px', fontSize: 11.5, width: 70 }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
const numDecCliente = s => { const v = parseFloat(String(s).replace(/[^\d.,]/g, '').replace(',', '.')); return isNaN(v) ? null : v }

export default function TrazabilidadModule({ cotizaciones = [], ots = [], ordenesCompra = [], setOts }) {
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroEstadoLote, setFiltroEstadoLote] = useState('')
  const [enviandoAlertas, setEnviandoAlertas] = useState(false)
  const [msgAlertas, setMsgAlertas] = useState(null)

  const lotes = lotesConPlazo(ots)
  const lotesFiltrados = lotes.filter(l => {
    if (filtroCliente.trim() && !String(l.ot.cliente || '').toLowerCase().includes(filtroCliente.trim().toLowerCase())) return false
    if (filtroEstadoLote && l.estado !== filtroEstadoLote) return false
    return true
  })
  const lotesVencidos = lotes.filter(l => l.estado === 'vencido')
  const lotesPorVencer = lotes.filter(l => l.estado === 'por_vencer')

  // ---- Alertas ----
  const alertas = []
  cotizaciones.filter(c => c.estado === 'Aprobada' && !ots.find(o => o.numero === 'OT-' + c.folio)).forEach(c =>
    alertas.push({ col: C.rojo, txt: `Cotización N° ${c.folio} (${c.cliente}) está aprobada pero no tiene OT creada.` }))
  ots.filter(o => o.estado === 'Terminada' && (!o.ventas || o.ventas.length === 0)).forEach(o =>
    alertas.push({ col: C.ambar, txt: `${o.numero} está terminada pero no tiene factura emitida.` }))
  ordenesCompra.filter(o => o.estadoPago !== 'Pagada' && o.estadoPago !== 'Anulada' && vencOC(o) && vencOC(o) < hoy()).forEach(o =>
    alertas.push({ col: C.rojo, txt: `OC N° ${o.numero} (${o.proveedor}) está vencida sin pago (${clp(ocTotal(o))}).` }))
  ordenesCompra.filter(o => o.estadoPago !== 'Anulada' && !esGastoMensual(o) && (!o.asignaciones || o.asignaciones.length === 0)).slice(0, 30).forEach(o =>
    alertas.push({ col: C.gris, txt: `OC N° ${o.numero} (${o.proveedor}) no está asociada a ninguna OT.` }))
  ots.filter(o => (o.ventas || []).some(v => v.estadoPago !== 'Pagado')).forEach(o =>
    alertas.push({ col: C.ambar, txt: `${o.numero} tiene facturas emitidas pendientes de cobro.` }))
  lotesVencidos.forEach(l =>
    alertas.push({ col: C.rojo, txt: `Lote guía ${l.partida.numeroGuia || 's/n'} de ${l.ot.numero} (${l.ot.cliente}) vencido hace ${Math.abs(l.diasRestantes)} día(s) hábil(es) — vencía el ${l.vencimiento}.` }))
  lotesPorVencer.forEach(l =>
    alertas.push({ col: C.ambar, txt: `Lote guía ${l.partida.numeroGuia || 's/n'} de ${l.ot.numero} (${l.ot.cliente}) vence en ${l.diasRestantes} día(s) hábil(es) (${l.vencimiento}).` }))

  const enviarAlertasAhora = async () => {
    setEnviandoAlertas(true); setMsgAlertas(null)
    try {
      const resumen = [...lotesVencidos, ...lotesPorVencer].map(l => ({
        ot: l.ot.numero, cliente: l.ot.cliente, numeroGuia: l.partida.numeroGuia || '',
        vencimiento: l.vencimiento, diasRestantes: l.diasRestantes, estado: l.estado,
      }))
      const { data, error } = await supabase.functions.invoke('enviar-alertas-vencimiento', { body: { lotes: resumen } })
      if (error) throw error
      if (!data || !data.ok) throw new Error((data && data.error) || 'No se pudo enviar el correo.')
      setMsgAlertas({ ok: true, texto: `Correo enviado con ${resumen.length} alerta(s) de vencimiento.` })
    } catch (err) { setMsgAlertas({ ok: false, texto: 'No se pudo enviar: ' + ((err && err.message) || String(err)) }) }
    setEnviandoAlertas(false)
  }

  const paso = (txt, sub, col) => (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 10.5, color: C.gris, textTransform: 'uppercase' }}>{txt}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: col || C.carbon }}>{sub}</div>
    </div>
  )

  return (
    <div>
      <VistaPorCliente ots={ots} setOts={setOts || (() => {})} />

      <ProduccionPorFecha ots={ots} />

      {/* ALERTAS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase' }}>Alertas ({alertas.length})</div>
        {(lotesVencidos.length + lotesPorVencer.length) > 0 && (
          <button onClick={enviarAlertasAhora} disabled={enviandoAlertas} style={{ background: enviandoAlertas ? '#9AA3AD' : C.azul, color: '#fff', border: 'none', borderRadius: 4, padding: '7px 14px', fontSize: 12.5, cursor: enviandoAlertas ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Mail size={14} /> {enviandoAlertas ? 'Enviando…' : 'Enviar alertas de vencimiento por correo'}
          </button>
        )}
      </div>
      {msgAlertas && <div style={{ fontSize: 12.5, color: msgAlertas.ok ? C.verde : C.rojo, marginBottom: 10 }}>{msgAlertas.texto}</div>}
      {alertas.length === 0 ? (
        <div style={{ background: '#E6F7EE', color: C.verde, padding: '10px 14px', fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle2 size={16} /> Sin alertas pendientes.</div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          {alertas.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderLeft: `4px solid ${a.col}`, border: '1px solid #DFE4EA', padding: '9px 14px', marginBottom: 6, fontSize: 13 }}>
              <AlertTriangle size={15} color={a.col} /> <span>{a.txt}</span>
            </div>
          ))}
        </div>
      )}

      {/* LOTES CON PLAZO COMPROMETIDO */}
      {lotes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase', marginBottom: 10 }}>Lotes con plazo comprometido ({lotes.length})</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <input value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} placeholder="Buscar por cliente…" style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '6px 8px', fontSize: 12.5 }} />
            <select value={filtroEstadoLote} onChange={e => setFiltroEstadoLote(e.target.value)} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '6px 8px', fontSize: 12.5 }}>
              <option value="">Todos los estados</option>
              <option value="vencido">Vencido</option>
              <option value="por_vencer">Por vencer</option>
              <option value="en_plazo">En plazo</option>
            </select>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E4E8ED' }}>
                  {['OT', 'Cliente', 'OC', 'Guía', 'Piezas', 'Vencimiento', 'Estado'].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lotesFiltrados.map((l, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #DFE4EA' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{l.ot.numero}</td>
                    <td style={{ padding: '6px 8px' }}>{l.ot.cliente}</td>
                    <td style={{ padding: '6px 8px', color: C.gris }}>{l.ot.oc && l.ot.oc !== '—' ? l.ot.oc : '—'}</td>
                    <td style={{ padding: '6px 8px', color: C.gris }}>{l.partida.numeroGuia || '—'}</td>
                    <td style={{ padding: '6px 8px', color: C.gris }}>{l.despachadas}/{l.total || '?'}</td>
                    <td style={{ padding: '6px 8px' }}>{l.vencimiento || '—'}</td>
                    <td style={{ padding: '6px 8px' }}><span style={{ background: ESTADO_LOTE_COLOR[l.estado], color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 10.5, fontWeight: 700 }}>{ESTADO_LOTE_LABEL[l.estado]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TRAZABILIDAD */}
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase', marginBottom: 10 }}>Trazabilidad · Cotización → OT → OC → Producción → Factura → Cobranza</div>
      {cotizaciones.length === 0 && ots.length === 0 && <div style={{ color: '#9AA3AD', fontSize: 13 }}>Aún no hay cotizaciones ni OT.</div>}
      {ots.map(o => {
        const cot = cotizaciones.find(c => 'OT-' + c.folio === o.numero)
        const ocs = ocsDeOT(ordenesCompra, o.numero)
        const ocTot = ocs.reduce((a, x) => a + ocNeto(x), 0)
        return (
          <div key={o.id} style={{ background: '#fff', border: '1px solid #DFE4EA', padding: '12px 16px', marginBottom: 10, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            {paso('Cotización', cot ? ('N° ' + cot.folio) : '—', C.teal)}
            <ArrowRight size={14} color={C.gris} />
            {paso('OT', o.numero + ' · ' + o.estado, C.azul)}
            <ArrowRight size={14} color={C.gris} />
            {paso('OC proveedores', ocs.length ? (ocs.length + ' · ' + clp(ocTot)) : 'sin OC', ocs.length ? C.carbon : C.ambar)}
            <ArrowRight size={14} color={C.gris} />
            {paso('Producción', produccionDe(o), C.carbon)}
            <ArrowRight size={14} color={C.gris} />
            {paso('Facturación', facturacionDe(o), C.carbon)}
            <ArrowRight size={14} color={C.gris} />
            {paso('Cobranza', cobranzaDe(o), cobranzaDe(o) === 'Cobrado' ? C.verde : cobranzaDe(o) === '—' ? C.gris : C.rojo)}
          </div>
        )
      })}
    </div>
  )
}
