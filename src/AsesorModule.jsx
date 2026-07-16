import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase.js'
import { calcularResumenFin } from './FinanzasModule.jsx'
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

export default function AsesorModule({ fin = {}, pp = {}, proyectos = [], ots = [], params = {}, onIr }) {
  const [iva, setIva] = useState({ credito: 0, debito: 0, cargado: false })
  const [compras, setCompras] = useState(null)
  const hoyStr = hoy()
  const mes = mesDe(hoyStr)

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

  const hayFin = (fin.gastos || []).length || (fin.obligaciones || []).length
  const hayProy = (proyectos || []).length

  const financiero = useMemo(() => { if (!hayFin && !analisis.r.totalCuotasMes) return null; return { salida: +analisis.r.salidaCaja || 0, deuda: +analisis.r.deudaVigente || 0, cuotas: +analisis.r.totalCuotasMes || 0, ivaPos: iva.cargado ? (iva.debito - iva.credito) : null } }, [hayFin, analisis, iva])

  const comercial = useMemo(() => { if (!hayProy) return null; let cot = 0, fac = 0, cob = 0; proyectos.forEach(p => { cot += (+p.venta_cotizada || 0); const e = p.edps || []; fac += e.reduce((a, x) => a + (+x.venta || 0), 0); cob += e.filter(x => /pag/i.test(x.estado || '')).reduce((a, x) => a + (+x.venta || 0), 0) }); return { nOT: proyectos.length, cot, fac, porFac: Math.max(0, cot - fac), cob } }, [hayProy, proyectos])

  const cobranza = useMemo(() => { const edps = (proyectos || []).reduce((a, p) => a.concat((p.edps || []).map(e => ({ ...e, ot: p.ot || p.nombre }))), []); if (!edps.length) return null; const pend = edps.filter(e => !/pag/i.test(e.estado || '')); const venc = pend.filter(e => e.fecha && e.fecha !== '—' && e.fecha < hoyStr); return { porCobrar: pend.reduce((a, e) => a + (+e.venta || 0), 0), nPend: pend.length, nVenc: venc.length, montoVenc: venc.reduce((a, e) => a + (+e.venta || 0), 0) } }, [proyectos, hoyStr])

  const produccion = useMemo(() => { if (!hayProy && !(ots || []).length) return null; const act = (proyectos || []).filter(p => !p.cerrado); const conAv = act.filter(p => typeof p.avance === 'number'); const avg = conAv.length ? Math.round(conAv.reduce((a, p) => a + (+p.avance || 0), 0) / conAv.length) : null; return { nAct: act.length, avg, m2: act.reduce((a, p) => a + (+p.m2 || 0), 0), nOTs: (ots || []).length } }, [hayProy, proyectos, ots])

  const comprasCard = useMemo(() => { if (compras === null) return { cargando: true }; if (!compras.length) return null; const meses = [...new Set(compras.map(r => mesDe(r.emission_date)).filter(Boolean))].sort().reverse(); const ult = meses[0]; const delUlt = compras.filter(r => mesDe(r.emission_date) === ult); const byProv = {}; delUlt.forEach(r => { const n = r.provider_name || '—'; byProv[n] = (byProv[n] || 0) + (+r.neto || 0) }); const top = Object.keys(byProv).map(n => [n, byProv[n]]).sort((a, b) => b[1] - a[1]).slice(0, 3); return { nTotal: compras.length, ult, nUlt: delUlt.length, netoUlt: delUlt.reduce((a, r) => a + (+r.neto || 0), 0), top } }, [compras])

  const prioridades = useMemo(() => { if (!hayFin && !hayProy && !(pp.ocs || []).length) return null; return analisis.alertas.filter(a => a.sev !== 'verde').sort((a, b) => SEVR[b.sev] - SEVR[a.sev]).slice(0, 5) }, [hayFin, hayProy, analisis, pp])

  const recomendaciones = useMemo(() => { if (!hayFin && !hayProy) return null; return analisis.alertas.filter(a => a.sev !== 'verde').slice(0, 5).map(a => ({ area: a.area, texto: a.recomendacion })) }, [hayFin, hayProy, analisis])

  const alertasResumen = useMemo(() => { if (!hayFin && !hayProy && !(pp.ocs || []).length) return null; const act = analisis.alertas.filter(a => a.sev !== 'verde'); return { rojas: act.filter(a => a.sev === 'rojo').length, amar: act.filter(a => a.sev === 'amarillo').length, top: act.slice().sort((a, b) => SEVR[b.sev] - SEVR[a.sev]).slice(0, 4) } }, [hayFin, hayProy, analisis, pp])

  const orden = analisis.alertas.slice().sort((a, b) => SEVR[b.sev] - SEVR[a.sev])
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }

  return (
    <div>
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
          {cobranza && <Fila k="EDP pendientes" v={cobranza.nPend} />}
          {cobranza && <Fila k="Vencidas" v={cobranza.nVenc + (cobranza.montoVenc ? ' (' + clp(cobranza.montoVenc) + ')' : '')} color={cobranza.nVenc ? C.red : C.gray} />}
        </Tarjeta>
        <Tarjeta icon={Lightbulb} titulo="Recomendaciones" color={C.orange} vacio={!recomendaciones}>
          {recomendaciones && recomendaciones.length === 0 && <div style={{ fontSize: 12.5, color: C.green }}>Indicadores en orden; sin acciones urgentes.</div>}
          {recomendaciones && recomendaciones.map((r, i) => (<div key={i} style={{ fontSize: 12, color: C.gray }}><b style={{ color: C.orange }}>{r.area}:</b> {r.texto}</div>))}
        </Tarjeta>
      </div>
      {orden.length > 0 && (
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 15, fontWeight: 600, textTransform: 'uppercase', color: C.navy, marginBottom: 10 }}>Detalle de alertas</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {orden.map((a, i) => { const Ico = ICON[a.icono] || Info; return (<div key={i} style={{ background: '#fff', border: '1px solid ' + C.line, borderLeft: '5px solid ' + SEV_COLOR[a.sev], borderRadius: 4, padding: '12px 14px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><Ico size={17} color={SEV_COLOR[a.sev]} /><span style={{ fontWeight: 700, fontSize: 14, color: C.navy }}>{a.titulo}</span><span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: SEV_COLOR[a.sev], border: '1px solid ' + SEV_COLOR[a.sev], borderRadius: 3, padding: '1px 6px', textTransform: 'uppercase' }}>{a.area}</span></div><div style={{ fontSize: 13, color: '#3A4045', marginBottom: 4 }}>{a.detalle}</div><div style={{ fontSize: 12.5, color: C.gray }}><strong style={{ color: C.orange }}>Recomendacion:</strong> {a.recomendacion}</div>{a.ir && onIr && <button onClick={() => onIr(a.ir)} style={{ marginTop: 8, background: 'transparent', border: '1px solid ' + C.line, borderRadius: 3, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.navy }}>Ir al modulo</button>}</div>) })}
          </div>
        </div>
      )}
    </div>
  )
}
