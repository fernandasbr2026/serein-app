import { useMemo } from 'react'
import { calcularResumenFin } from './FinanzasModule.jsx'
import { AlertTriangle, TrendingUp, TrendingDown, Wallet, Landmark, Receipt, Sparkles, CheckCircle2, ShieldAlert, Info } from 'lucide-react'

const C = { navy: '#061A40', carbon: '#0F1A2E', orange: '#FF6B00', azul: '#25608E', verde: '#12805C', rojo: '#D64545', ambar: '#C9860B', teal: '#0B7285', gray: '#8A929E', line: '#E6E8EE', soft: '#F5F6F8' }
const SEV = { ok: C.verde, warn: C.ambar, crit: C.rojo }
const clp = n => '$' + Math.round(+n || 0).toLocaleString('es-CL')
const pad2 = x => (x < 10 ? '0' + x : '' + x)
const hoyStr = () => new Date().toISOString().slice(0, 10)
function addDias(f, n) { if (!f) return null; const d = new Date(('' + f).slice(0, 10) + 'T00:00:00'); if (isNaN(d)) return null; d.setDate(d.getDate() + (+n || 0)); return d.toISOString().slice(0, 10) }
function fechaCL(f) { if (!f) return '-'; const s = ('' + f).slice(0, 10); const p = s.split('-'); return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : s }
const num = n => (+n || 0)

function Card({ titulo, icon: Ico, children, borde }) {
  return (<div style={{ background: '#fff', border: '1px solid ' + C.line, borderTop: '3px solid ' + (borde || C.orange), borderRadius: 14, boxShadow: '0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.04)', padding: '16px 18px', marginBottom: 18 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      {Ico && <Ico size={16} color={borde || C.navy} />}
      <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 13.5, textTransform: 'uppercase', letterSpacing: 0.4, color: C.carbon }}>{titulo}</span>
    </div>
    {children}
  </div>)
}

function SemCard({ label, valor, sub, sev }) {
  const col = SEV[sev] || C.navy
  return (<div style={{ flex: '1 1 160px', minWidth: 150, background: '#fff', border: '1px solid ' + C.line, borderLeft: '4px solid ' + col, borderRadius: 12, boxShadow: '0 1px 3px rgba(16,24,40,.06)', padding: '14px 16px' }}>
    <div style={{ fontSize: 10.5, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 21, fontWeight: 700, color: col, fontFamily: "'Oswald',sans-serif", lineHeight: 1.1 }}>{valor}</div>
    {sub && <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{sub}</div>}
  </div>)
}

function Fila({ label, valor, color, fuerte }) {
  return (<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', borderBottom: '1px solid ' + C.soft }}>
    <span style={{ fontSize: 12.5, color: C.gray }}>{label}</span>
    <span style={{ fontSize: fuerte ? 15 : 13.5, fontWeight: fuerte ? 700 : 600, color: color || C.carbon }}>{valor}</span>
  </div>)
}

// ============ MOTOR DE DATOS (solo lectura, con fallbacks) ============
function useDatos({ cc, facturas, ots, proyectos, cotizaciones, clientes, params, fin, pp, ppmPct }) {
  return useMemo(() => {
    const hoy = hoyStr()
    const en7 = addDias(hoy, 7)
    const en30 = addDias(hoy, 30)
    const mes = hoy.slice(0, 7)
    let resumen = { deudaVigente: 0, totalCuotasMes: 0, interesMes: 0, cuotasVencidas: [], cuotasMes: [] }
    try { resumen = calcularResumenFin(fin || {}, mes) || resumen } catch (e) { }
    const areasFact = ['Santa Rosa', 'Istria', 'Proyectos']
    const facs = areasFact.flatMap(a => ((facturas || {})[a] || []).map(f => ({ ...f, area: a })))
    const vencDe = f => f.vencimiento || f.fechaVencimiento || f.fecha_venc || (f.fecha ? addDias(f.fecha, num(f.plazo) || 30) : null)
    const brutoF = f => num(f.monto) || (num(f.neto) + Math.round(num(f.neto) * 0.19))
    const facPend = facs.filter(f => f.estado !== 'Pagado' && f.estado !== 'Anulada')
    const facVencidas = facPend.filter(f => { const v = vencDe(f); return v && v < hoy })
    const montoVencidas = facVencidas.reduce((a, f) => a + brutoF(f), 0)

    // OT
    const meOT = o => (num(o.montoCotizado) > 0 ? num(o.montoCotizado) : (o.ventas || []).reduce((a, v) => a + num(v.neta), 0))
    const L = ots || []
    const otAbiertas = L.filter(o => ['Cotizada', 'En ejecución'].includes(o.estado))
    const otProceso = L.filter(o => o.estado === 'En ejecución')
    const otTerminadas = L.filter(o => o.estado === 'Terminada')
    const otFacturadas = L.filter(o => ['Facturada', 'Cerrada'].includes(o.estado))
    const montoPorFacturar = otTerminadas.reduce((a, o) => a + meOT(o), 0)
    const prodMod = m => L.filter(o => o.area === m).length

    // Cobros 7 dias
    const cobros = (pp && pp.cobros || []).filter(c => c.estado === 'Pendiente' || c.estado === 'Factoring')
    const cobros7 = cobros.filter(c => { const v = c.fecha_vencimiento || c.vencimiento || c.fecha; return v && v >= hoy && v <= en7 }).reduce((a, c) => a + num(c.total), 0)
      + facPend.filter(f => { const v = vencDe(f); return v && v >= hoy && v <= en7 }).reduce((a, f) => a + brutoF(f), 0)
    const pagos7 = num(cc.pagar7)
    const caja = num(cc.caja)
    const saldo7 = caja + cobros7 - pagos7
    const saldo30 = caja + num(cc.saldoProy)

    // Embudo comercial
    const cots = cotizaciones || []
    const cotAprob = cots.filter(c => /aprob/i.test(c.estado || ''))
    const funnel = [
      { et: 'Cotizaciones', n: cots.length, monto: cots.reduce((a, c) => a + (num(c.total) || num(c.montoCotizado)), 0) },
      { et: 'Aprobadas', n: cotAprob.length, monto: cotAprob.reduce((a, c) => a + (num(c.total) || num(c.montoCotizado)), 0) },
      { et: 'OT', n: L.length, monto: L.reduce((a, o) => a + meOT(o), 0) },
      { et: 'Facturas', n: facs.length, monto: facs.reduce((a, f) => a + num(f.neto), 0) },
      { et: 'Cobros', n: facs.filter(f => f.estado === 'Pagado').length, monto: facs.filter(f => f.estado === 'Pagado').reduce((a, f) => a + num(f.neto), 0) }
    ]

    // Clientes
    const nombreCli = o => (o.cliente || '-').toString().trim()
    const mapa = {}
    L.forEach(o => { const k = nombreCli(o); if (!mapa[k]) mapa[k] = { cliente: k, venta: 0, deuda: 0, atraso: 0 }; mapa[k].venta += meOT(o) })
    facPend.forEach(f => { const k = (f.cliente || '-').toString().trim(); if (!mapa[k]) mapa[k] = { cliente: k, venta: 0, deuda: 0, atraso: 0 }; mapa[k].deuda += brutoF(f) })
    facVencidas.forEach(f => { const k = (f.cliente || '-').toString().trim(); if (mapa[k]) mapa[k].atraso += brutoF(f) })
    const cli = Object.values(mapa)
    const topVenta = cli.slice().sort((a, b) => b.venta - a.venta).filter(x => x.venta > 0).slice(0, 5)
    const topDeuda = cli.slice().sort((a, b) => b.deuda - a.deuda).filter(x => x.deuda > 0).slice(0, 5)
    const topAtraso = cli.slice().sort((a, b) => b.atraso - a.atraso).filter(x => x.atraso > 0).slice(0, 5)

    // Factoring
    const facList = (params && params.factoring) || []
    const tasaProm = facList.length ? facList.reduce((a, f) => a + num(f.tasa), 0) / facList.length : 0

    // Calendario financiero
    const eventos = []
    ;(fin && fin.gastos || []).filter(g => g.estado !== 'Pagado' && g.estado !== 'Anulado' && g.vencimiento).forEach(g => eventos.push({ fecha: g.vencimiento, tipo: 'Proveedor/Gasto', desc: g.nombre || g.categoria || 'Gasto', monto: num(g.neto) + num(g.iva) }))
    ;(fin && fin.obligaciones || []).forEach(o => (o.cuotas || []).filter(c => c.estado !== 'Pagada' && c.vencimiento).forEach(c => eventos.push({ fecha: c.vencimiento, tipo: /leasing/i.test(o.tipo || o.nombre || '') ? 'Leasing' : 'Crédito', desc: o.nombre || 'Cuota', monto: num(c.total) })))
    ;(pp && pp.ocs || []).filter(o => !['Pagada', 'Anulada'].includes(o.estadoPago) && (o.vencimiento || o.fecha)).forEach(o => eventos.push({ fecha: o.vencimiento || o.fecha, tipo: 'Proveedor OC', desc: o.proveedor || o.numero || 'OC', monto: num(o.total) }))
    facPend.filter(f => vencDe(f)).forEach(f => eventos.push({ fecha: vencDe(f), tipo: 'Factura por cobrar', desc: (f.cliente || 'Cliente') + ' ' + (f.folio || ''), monto: brutoF(f), entrada: true }))
    eventos.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
    const proximos = eventos.filter(e => e.fecha >= hoy).slice(0, 12)

    return {
      hoy, en7, en30, resumen, facVencidas, montoVencidas,
      otAbiertas: otAbiertas.length, otProceso: otProceso.length, otTerminadas: otTerminadas.length, otFacturadas: otFacturadas.length,
      montoPorFacturar, prodSR: prodMod('Santa Rosa'), prodIS: prodMod('Istria'), prodPR: prodMod('Proyectos'),
      cobros7, pagos7, caja, saldo7, saldo30, funnel, topVenta, topDeuda, topAtraso, tasaProm, proximos
    }
  }, [cc, facturas, ots, proyectos, cotizaciones, clientes, params, fin, pp, ppmPct])
}

// ============ PANELES ============
function ExecutiveSummaryCards({ cc, d }) {
  const sevSaldo = v => v >= 0 ? 'ok' : 'crit'
  return (<div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
    <SemCard label="Caja actual" valor={clp(d.caja)} sev={sevSaldo(d.caja)} />
    <SemCard label="Cobros 7 días" valor={clp(d.cobros7)} sev="ok" />
    <SemCard label="Pagos 7 días" valor={clp(d.pagos7)} sev={d.pagos7 > d.cobros7 ? 'warn' : 'ok'} />
    <SemCard label="Saldo proyectado 7 días" valor={clp(d.saldo7)} sev={sevSaldo(d.saldo7)} />
    <SemCard label="Posición financiera" valor={clp(num(cc.posicionFin))} sev={sevSaldo(num(cc.posicionFin))} />
    <SemCard label="Facturas vencidas" valor={d.facVencidas.length} sub={clp(d.montoVencidas)} sev={d.facVencidas.length > 0 ? 'crit' : 'ok'} />
    <SemCard label="OT listas para facturar" valor={d.otTerminadas} sub={clp(d.montoPorFacturar)} sev={d.otTerminadas > 0 ? 'warn' : 'ok'} />
  </div>)
}

function AISereinPanel({ cc, d }) {
  const msgs = []
  if (d.facVencidas.length > 0) msgs.push({ t: 'Hay facturas vencidas por ' + clp(d.montoVencidas) + ' (' + d.facVencidas.length + ' documento(s)).', s: 'crit' })
  if (d.montoPorFacturar > 0) msgs.push({ t: 'Existen OT listas para facturar por ' + clp(d.montoPorFacturar) + ' (' + d.otTerminadas + ' OT).', s: 'warn' })
  msgs.push({ t: 'La caja proyectada a 7 días es ' + (d.saldo7 >= 0 ? 'positiva' : 'negativa') + ': ' + clp(d.saldo7) + '.', s: d.saldo7 >= 0 ? 'ok' : 'crit' })
  if (d.pagos7 > d.cobros7) msgs.push({ t: 'Los pagos próximos (7 días) superan a los cobros esperados por ' + clp(d.pagos7 - d.cobros7) + '.', s: 'warn' })
  if (num(cc.netoTotalFact) > 0) msgs.push({ t: 'El factoring acumulado representa ' + num(cc.pctFactorizado).toFixed(1) + '% de la venta.', s: num(cc.pctFactorizado) > 40 ? 'warn' : 'ok' })
  if ((d.resumen.cuotasVencidas || []).length > 0) msgs.push({ t: 'Hay ' + d.resumen.cuotasVencidas.length + ' cuota(s) de crédito/leasing vencida(s).', s: 'crit' })
  msgs.push({ t: 'Posición financiera ' + (num(cc.posicionFin) >= 0 ? 'positiva' : 'negativa') + ': ' + clp(num(cc.posicionFin)) + '.', s: num(cc.posicionFin) >= 0 ? 'ok' : 'crit' })
  return (<Card titulo="IA SEREIN · Resumen gerencial" icon={Sparkles} borde={C.orange}>
    <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>Lectura automática por reglas · preparado para IA (pendiente de conectar modelo)</div>
    <div style={{ display: 'grid', gap: 7 }}>
      {msgs.map((m, i) => (<div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: C.carbon }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: SEV[m.s], marginTop: 5, flexShrink: 0 }} />
        <span>{m.t}</span>
      </div>))}
    </div>
  </Card>)
}

function CriticalAlertsPanel({ cc, d }) {
  const A = []
  if (d.facVencidas.length > 0) A.push({ s: 'crit', t: 'Facturas vencidas', x: d.facVencidas.length + ' doc · ' + clp(d.montoVencidas), ir: 'PAGOS' })
  if (d.topDeuda[0] && d.topDeuda[0].deuda > 0) A.push({ s: d.topDeuda[0].deuda > 5000000 ? 'crit' : 'warn', t: 'Cliente con mayor deuda: ' + d.topDeuda[0].cliente, x: clp(d.topDeuda[0].deuda), ir: 'CLIENTES' })
  if (d.pagos7 > 0) A.push({ s: 'warn', t: 'Pagos que vencen en 7 días', x: clp(d.pagos7), ir: 'PAGOS' })
  if ((d.resumen.cuotasVencidas || []).length > 0) A.push({ s: 'crit', t: 'Cuotas crédito/leasing vencidas', x: d.resumen.cuotasVencidas.length + ' cuota(s)', ir: 'FINANZAS' })
  if (d.otTerminadas > 0) A.push({ s: 'warn', t: 'OT terminadas sin facturar', x: d.otTerminadas + ' OT · ' + clp(d.montoPorFacturar), ir: 'GESTION_OT' })
  if (num(cc.pctFactorizado) > 40) A.push({ s: 'warn', t: 'Factoring elevado sobre la venta', x: num(cc.pctFactorizado).toFixed(1) + '% · costo ' + clp(num(cc.kPerd)), ir: 'FINANZAS' })
  const orden = { crit: 0, warn: 1, ok: 2 }
  A.sort((a, b) => orden[a.s] - orden[b.s])
  return (<Card titulo="Alertas críticas" icon={ShieldAlert} borde={C.rojo}>
    {A.length === 0 && <div style={{ fontSize: 13, color: C.verde, display: 'flex', gap: 6, alignItems: 'center' }}><CheckCircle2 size={16} /> Sin alertas críticas.</div>}
    <div style={{ display: 'grid', gap: 8 }}>
      {A.map((a, i) => (<div key={i} onClick={() => a.ir && a.onIr} style={{ display: 'flex', alignItems: 'center', gap: 10, borderLeft: '4px solid ' + SEV[a.s], background: C.soft, borderRadius: 4, padding: '8px 10px' }}>
        <AlertTriangle size={15} color={SEV[a.s]} />
        <span style={{ fontSize: 13, fontWeight: 600, color: C.carbon }}>{a.t}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: SEV[a.s] }}>{a.x}</span>
      </div>))}
    </div>
  </Card>)
}

function CashFlowPanel({ cc, d }) {
  const pos = d.saldo7 >= 0 && num(cc.saldoProy) >= 0
  return (<Card titulo="Flujo de caja" icon={Wallet} borde={C.azul}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 24px' }}>
      <div>
        <Fila label="Caja actual" valor={clp(d.caja)} color={d.caja >= 0 ? C.verde : C.rojo} />
        <Fila label="Total por cobrar" valor={clp(num(cc.cxcTotal))} color={C.azul} />
        <Fila label="Total por pagar" valor={clp(num(cc.cxpTotal))} color={C.rojo} />
      </div>
      <div>
        <Fila label="Cobros próximos 7 días" valor={clp(d.cobros7)} color={C.verde} />
        <Fila label="Pagos próximos 7 días" valor={clp(d.pagos7)} color={C.rojo} />
        <Fila label="Saldo proyectado" valor={clp(num(cc.saldoProy))} color={num(cc.saldoProy) >= 0 ? C.verde : C.rojo} />
      </div>
    </div>
    <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 4, background: pos ? '#EAF3EC' : '#F7E9E6', border: '1px solid ' + (pos ? C.verde : C.rojo), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: pos ? C.verde : C.rojo }}>{pos ? 'La empresa se proyecta POSITIVA' : 'Atención: proyección NEGATIVA'}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: pos ? C.verde : C.rojo }}>Saldo 30 días: {clp(d.saldo30)}</span>
    </div>
  </Card>)
}

function ProfitabilityPanel({ cc, d }) {
  const venta = num(cc.kVenta)
  const util = num(cc.utilidad)
  const costos = venta > 0 && util !== 0 ? venta - util : null
  const costoFin = num(d.resumen.interesMes)
  return (<Card titulo="Rentabilidad" icon={TrendingUp} borde={C.teal}>
    <Fila label="Venta neta" valor={clp(venta)} color={C.azul} />
    <Fila label="Costos operacionales (estimado)" valor={costos !== null ? clp(costos) : 'pendiente de integrar'} color={costos !== null ? C.carbon : C.gray} />
    <Fila label="Costos financieros (interés mes)" valor={clp(costoFin)} color={C.rojo} />
    <Fila label="Pérdida factoring" valor={clp(num(cc.kPerd))} color={C.ambar} />
    <Fila label="Utilidad estimada" valor={util ? clp(util) : 'pendiente de integrar'} color={util >= 0 ? C.verde : C.rojo} fuerte />
    <Fila label="Margen estimado" valor={num(cc.rentab).toFixed(1) + '%'} color={num(cc.rentab) >= 0 ? C.verde : C.rojo} fuerte />
  </Card>)
}

function ProductionStatusPanel({ d }) {
  const box = (n, l, col) => (<div style={{ flex: '1 1 90px', textAlign: 'center', background: C.soft, borderRadius: 4, padding: '8px 4px' }}>
    <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 700, color: col }}>{n}</div>
    <div style={{ fontSize: 10.5, color: C.gray, textTransform: 'uppercase' }}>{l}</div>
  </div>)
  return (<Card titulo="OT y producción" icon={TrendingUp} borde={C.orange}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
      {box(d.otAbiertas, 'Abiertas', C.azul)}
      {box(d.otProceso, 'En proceso', C.teal)}
      {box(d.otTerminadas, 'Terminadas', C.ambar)}
      {box(d.otTerminadas, 'Listas facturar', C.orange)}
      {box(d.otFacturadas, 'Facturadas', C.verde)}
    </div>
    <Fila label="Monto por facturar" valor={clp(d.montoPorFacturar)} color={C.orange} fuerte />
    <Fila label="OT atrasadas" valor={'s/d (sin fecha compromiso)'} color={C.gray} />
    <div style={{ marginTop: 10, fontSize: 11.5, color: C.gray, textTransform: 'uppercase', fontWeight: 600 }}>Producción por módulo</div>
    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
      {box(d.prodSR, 'Santa Rosa', C.orange)}
      {box(d.prodIS, 'Istria', C.carbon)}
      {box(d.prodPR, 'Proyectos', C.azul)}
    </div>
  </Card>)
}

function CommercialFunnelPanel({ d }) {
  const max = Math.max(1, ...d.funnel.map(f => f.n))
  return (<Card titulo="Embudo comercial" icon={TrendingUp} borde={C.azul}>
    <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>Cotizaciones → Aprobadas → OT → Facturas → Cobros</div>
    <div style={{ display: 'grid', gap: 7 }}>
      {d.funnel.map((f, i) => (<div key={i}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
          <span style={{ color: C.carbon, fontWeight: 600 }}>{f.et} · {f.n}</span>
          <span style={{ color: C.gray }}>{clp(f.monto)}</span>
        </div>
        <div style={{ height: 8, background: C.soft, borderRadius: 3 }}>
          <div style={{ width: (f.n / max * 100) + '%', height: '100%', background: C.azul, borderRadius: 3 }} />
        </div>
      </div>))}
    </div>
  </Card>)
}

function FactoringSummaryPanel({ cc, d }) {
  return (<Card titulo="Factoring" icon={Landmark} borde={C.ambar}>
    <Fila label="Monto factorizado" valor={clp(num(cc.netoFactTotal))} color={C.teal} />
    <Fila label="% factorizado" valor={num(cc.pctFactorizado).toFixed(1) + '%'} color={num(cc.pctFactorizado) > 40 ? C.rojo : C.carbon} />
    <Fila label="Costo factoring (pérdida estimada)" valor={clp(num(cc.kPerd))} color={C.ambar} />
    <Fila label="Tasa promedio" valor={d.tasaProm ? d.tasaProm.toFixed(2) + '% mensual' : 'pendiente de integrar'} color={C.carbon} />
    <Fila label="Factoring como % de la venta" valor={num(cc.pctFactorizado).toFixed(1) + '%'} color={C.carbon} fuerte />
  </Card>)
}

function CustomerRiskPanel({ d }) {
  const lista = (arr, campo, col) => arr.length === 0
    ? (<div style={{ fontSize: 12, color: C.gray }}>Sin datos.</div>)
    : arr.map((c, i) => (<div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}><span style={{ color: C.carbon }}>{i + 1}. {c.cliente}</span><span style={{ fontWeight: 600, color: col }}>{clp(c[campo])}</span></div>))
  const colBlock = (titulo, arr, campo, col) => (<div style={{ flex: '1 1 200px' }}>
    <div style={{ fontSize: 11, color: C.gray, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{titulo}</div>
    {lista(arr, campo, col)}
  </div>)
  return (<Card titulo="Clientes" icon={Receipt} borde={C.navy}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
      {colBlock('Mayor venta', d.topVenta, 'venta', C.azul)}
      {colBlock('Mayor deuda', d.topDeuda, 'deuda', C.rojo)}
      {colBlock('Más atrasados', d.topAtraso, 'atraso', C.ambar)}
    </div>
    <div style={{ marginTop: 8, fontSize: 11, color: C.gray }}>Límite de crédito y rentabilidad por cliente: pendiente de integrar.</div>
  </Card>)
}

function FinancialCalendarPanel({ d }) {
  return (<Card titulo="Calendario financiero" icon={Info} borde={C.carbon}>
    {d.proximos.length === 0 && <div style={{ fontSize: 12.5, color: C.gray }}>Sin vencimientos próximos registrados.</div>}
    <div style={{ display: 'grid', gap: 4 }}>
      {d.proximos.map((e, i) => (<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid ' + C.soft }}>
        <span style={{ width: 74, color: C.carbon, fontWeight: 600 }}>{fechaCL(e.fecha)}</span>
        <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#fff', background: e.entrada ? C.verde : C.gray, borderRadius: 3, padding: '1px 6px' }}>{e.tipo}</span>
        <span style={{ color: C.gray, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.desc}</span>
        <span style={{ fontWeight: 600, color: e.entrada ? C.verde : C.rojo }}>{(e.entrada ? '+' : '-') + clp(e.monto)}</span>
      </div>))}
    </div>
    <div style={{ marginTop: 8, fontSize: 11, color: C.gray }}>Incluye proveedores, créditos/leasing y facturas por cobrar. IVA, PPM y sueldos: pendiente de integrar.</div>
  </Card>)
}

export default function ConsolidadoModule(props) {
  const d = useDatos(props)
  const cc = props.cc || {}
  const dosCol = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }
  return (<div>
    <ExecutiveSummaryCards cc={cc} d={d} />
    <AISereinPanel cc={cc} d={d} />
    <CriticalAlertsPanel cc={cc} d={d} />
    <CashFlowPanel cc={cc} d={d} />
    <div style={dosCol}>
      <ProfitabilityPanel cc={cc} d={d} />
      <FactoringSummaryPanel cc={cc} d={d} />
    </div>
    <div style={dosCol}>
      <ProductionStatusPanel d={d} />
      <CommercialFunnelPanel d={d} />
    </div>
    <CustomerRiskPanel d={d} />
    <FinancialCalendarPanel d={d} />
  </div>)
}
