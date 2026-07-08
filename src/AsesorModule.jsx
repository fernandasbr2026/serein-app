import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase.js'
import { calcularResumenFin } from './FinanzasModule.jsx'
import { AlertTriangle, CheckCircle2, ShieldAlert, Sparkles, TrendingDown, Wallet, Landmark, Receipt, Info } from 'lucide-react'

const C = { navy: '#1A2733', line: '#E2DED4', gray: '#7A8288', red: '#B5432E', orange: '#D2642F', green: '#3D7A4E' }
const clp = n => '$' + Math.round(+n || 0).toLocaleString('es-CL')
const hoy = () => new Date().toISOString().slice(0, 10)
const mesDe = d => (d || '').slice(0, 7)
function sumarDias(f, n) { const d = new Date(f + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const SEVR = { rojo: 3, amarillo: 2, verde: 1 }
const SEV_COLOR = { rojo: '#B5432E', amarillo: '#D2642F', verde: '#3D7A4E' }
const ICON = { alert: AlertTriangle, wallet: Wallet, down: TrendingDown, bank: Landmark, receipt: Receipt, ok: CheckCircle2, info: Info }

export default function AsesorModule({ fin = {}, pp = {}, proyectos = [], ots = [], params = {}, onIr }) {
  const [iva, setIva] = useState({ credito: 0, debito: 0, cargado: false })
  const hoyStr = hoy()
  const mes = mesDe(hoyStr)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const rc = await supabase.from('libro_compras').select('*')
        const rv = await supabase.from('libro_ventas').select('*')
        const enMes = r => { const f = r.emision || r.fecha || r.fecha_emision || ''; return mesDe(f) === mes }
        const sumIva = arr => (arr || []).filter(enMes).reduce((a, r) => a + (+r.iva || 0), 0)
        if (vivo) setIva({ credito: sumIva(rc.data), debito: sumIva(rv.data), cargado: true })
      } catch (e) { if (vivo) setIva(i => ({ ...i, cargado: true })) }
    })()
    return () => { vivo = false }
  }, [mes])

  const analisis = useMemo(() => {
    try {
      const alertas = []
      const add = (sev, area, icono, titulo, detalle, recomendacion, ir) => alertas.push({ sev, area, icono, titulo, detalle, recomendacion, ir })
      const r = calcularResumenFin(fin, mes)

      const cuotasVenc = r.cuotasVencidas || []
      if (cuotasVenc.length > 0) {
        const monto = cuotasVenc.reduce((a, c) => a + (+c.monto || +c.cuota || 0), 0)
        add('rojo', 'Caja', 'alert', cuotasVenc.length + ' cuota(s) de credito/leasing vencida(s)', 'Suman ' + clp(monto) + ' sin pagar.', 'Regulariza con el banco o reprograma para evitar mora e intereses.', 'FINANZAS')
      }
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
      ;(proyectos || []).forEach(p => {
        const venta = (+p.venta_cotizada || 0) || (p.edps || []).reduce((a, e) => a + (+e.venta || 0), 0)
        const costo = (p.compras || []).reduce((a, c) => a + (+c.monto || 0), 0)
        if (venta > 0 && costo > 0) { const pct = (venta - costo) / venta; if (pct < 0.15) bajos.push({ ot: p.ot || p.nombre, pct }) }
      })
      bajos.sort((a, b) => a.pct - b.pct)
      const neg = bajos.filter(b => b.pct < 0)
      const amar = bajos.filter(b => b.pct >= 0 && b.pct < 0.15)
      if (neg.length > 0) add('rojo', 'Margenes', 'down', neg.length + ' OT con margen negativo', neg.slice(0, 3).map(b => b.ot + ' (' + Math.round(b.pct * 100) + '%)').join(', ') + (neg.length > 3 ? '...' : ''), 'Las compras superan la venta cotizada. Revisa costos o renegocia el precio.', 'GESTION_PROYECTOS')
      if (amar.length > 0) add('amarillo', 'Margenes', 'down', amar.length + ' OT con margen bajo (menos de 15%)', amar.slice(0, 3).map(b => b.ot + ' (' + Math.round(b.pct * 100) + '%)').join(', ') + (amar.length > 3 ? '...' : ''), 'Vigila estos proyectos: poco colchon ante imprevistos.', 'GESTION_PROYECTOS')

      const cuotas = +r.totalCuotasMes || 0
      const fijos = +r.fijos || 0
      let ingresos = (proyectos || []).reduce((a, p) => a + (p.edps || []).filter(e => mesDe(e.fecha) === mes).reduce((x, e) => x + (+e.venta || 0), 0), 0)
      if (iva.cargado && iva.debito > 0) ingresos = Math.max(ingresos, iva.debito / 0.19)
      let ratio = null
      if (ingresos > 0) ratio = cuotas / ingresos
      if (ratio === null) add('amarillo', 'Deuda', 'bank', 'Sin datos de ingresos del mes', 'Aun no puedo calcular el ratio de endeudamiento.', 'Registra ventas/EDP del mes o sincroniza el libro de ventas.', 'FINANZAS')
      else if (ratio > 0.5) add('rojo', 'Deuda', 'bank', 'Carga financiera muy alta', 'Las cuotas son el ' + Math.round(ratio * 100) + '% de los ingresos del mes.', 'Sobre 50% es riesgoso: evita nueva deuda y prioriza amortizar.', 'FINANZAS')
      else if (ratio > 0.35) add('amarillo', 'Deuda', 'bank', 'Carga financiera elevada', 'Las cuotas son el ' + Math.round(ratio * 100) + '% de los ingresos.', 'Mantenla bajo control; lo ideal es bajo 35%.', 'FINANZAS')

      if (iva.cargado) {
        const pos = iva.debito - iva.credito
        if (pos > 0) add(pos > 3000000 ? 'rojo' : 'amarillo', 'IVA', 'receipt', 'IVA por pagar este mes: ' + clp(pos), 'Debito ' + clp(iva.debito) + ' menos Credito ' + clp(iva.credito) + '.', 'Reserva este monto para el F29 y no lo uses en caja.', 'LIBRO_VENTAS')
        else add('verde', 'IVA', 'ok', 'Credito fiscal a favor: ' + clp(-pos), 'Credito ' + clp(iva.credito) + ' mayor que Debito ' + clp(iva.debito) + '.', 'Podras descontarlo del F29; sin IVA a pagar este mes.', 'LIBRO_COMPRAS')
      }

      const nivel = alertas.reduce((mx, a) => Math.max(mx, SEVR[a.sev]), 1)
      const estado = nivel >= 3 ? 'rojo' : nivel === 2 ? 'amarillo' : 'verde'
      return { alertas, estado, r, ingresos, ratio }
    } catch (e) {
      return { alertas: [], estado: 'amarillo', r: { salidaCaja: 0, deudaVigente: 0, totalCuotasMes: 0, cuotasVencidas: [] }, ingresos: 0, ratio: null }
    }
  }, [fin, pp, proyectos, ots, iva, mes, hoyStr])

  const estadoTxt = { rojo: 'Atencion requerida', amarillo: 'Con observaciones', verde: 'Todo en orden' }
  const orden = analisis.alertas.slice().sort((a, b) => SEVR[b.sev] - SEVR[a.sev])
  const kpi = (label, valor, color) => (<div style={{ flex: 1, minWidth: 150, background: '#fff', border: '1px solid ' + C.line, borderRadius: 4, padding: '12px 14px' }}><div style={{ fontSize: 10.5, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>{label}</div><div style={{ fontSize: 20, fontWeight: 700, color: color || C.navy, fontFamily: "'Oswald',sans-serif" }}>{valor}</div></div>)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontFamily: "'Oswald',sans-serif", fontSize: 24, fontWeight: 600, textTransform: 'uppercase', margin: 0, color: C.navy }}>Asesor financiero</h2>
          <div style={{ fontSize: 12.5, color: C.gray }}>Analisis automatico de tus numeros - se actualiza solo con cada cambio</div>
        </div>
        <button onClick={() => window.alert('El analisis con IA (estrategias en lenguaje natural) se activa al conectar una API key. El asesor por reglas ya esta funcionando.')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.navy, color: '#fff', border: 'none', borderRadius: 4, padding: '9px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}><Sparkles size={15} /> Analizar con IA</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid ' + C.line, borderLeft: '6px solid ' + SEV_COLOR[analisis.estado], borderRadius: 4, padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: SEV_COLOR[analisis.estado], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {analisis.estado === 'verde' ? <CheckCircle2 size={24} color="#fff" /> : <ShieldAlert size={24} color="#fff" />}
        </div>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 18, fontWeight: 600, color: SEV_COLOR[analisis.estado] }}>{estadoTxt[analisis.estado]}</div>
          <div style={{ fontSize: 13, color: C.gray }}>{analisis.alertas.filter(a => a.sev !== 'verde').length} alerta(s) activa(s) - {orden.length} punto(s) analizados</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        {kpi('Salida de caja del mes', clp(analisis.r.salidaCaja), C.red)}
        {kpi('Deuda vigente', clp(analisis.r.deudaVigente), C.navy)}
        {kpi('Carga financiera', analisis.ratio === null ? 's/d' : Math.round(analisis.ratio * 100) + '%', analisis.ratio !== null && analisis.ratio > 0.5 ? C.red : analisis.ratio !== null && analisis.ratio > 0.35 ? C.orange : C.green)}
        {kpi('Posicion IVA del mes', !iva.cargado ? '...' : clp(iva.debito - iva.credito), (iva.debito - iva.credito) > 0 ? C.orange : C.green)}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {orden.length === 0 && <div style={{ color: C.gray, fontSize: 13 }}>Sin alertas por ahora.</div>}
        {orden.map((a, i) => {
          const Ico = ICON[a.icono] || Info
          return (<div key={i} style={{ background: '#fff', border: '1px solid ' + C.line, borderLeft: '5px solid ' + SEV_COLOR[a.sev], borderRadius: 4, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Ico size={17} color={SEV_COLOR[a.sev]} />
              <span style={{ fontWeight: 700, fontSize: 14, color: C.navy }}>{a.titulo}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: SEV_COLOR[a.sev], border: '1px solid ' + SEV_COLOR[a.sev], borderRadius: 3, padding: '1px 6px', textTransform: 'uppercase' }}>{a.area}</span>
            </div>
            <div style={{ fontSize: 13, color: '#3A4045', marginBottom: 4 }}>{a.detalle}</div>
            <div style={{ fontSize: 12.5, color: C.gray }}><strong style={{ color: C.orange }}>Recomendacion:</strong> {a.recomendacion}</div>
            {a.ir && onIr && <button onClick={() => onIr(a.ir)} style={{ marginTop: 8, background: 'transparent', border: '1px solid ' + C.line, borderRadius: 3, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.navy }}>Ir al modulo</button>}
          </div>)
        })}
      </div>
    </div>
  )
}
