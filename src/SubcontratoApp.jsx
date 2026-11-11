// Portal de Subcontratistas (Fase I del plan — ver
// C:\Users\maria\.claude\plans\sorted-singing-sundae.md). App COMPLETAMENTE
// APARTE del resto del ERP: nunca importa Dashboard.jsx ni nada que
// dependa de sync.js/app_state (esa es justo la razón de que exista —
// un subcontratista es externo y no puede leer app_state). Todo lo que
// esta pantalla necesita lo lee y escribe directo contra tablas reales
// con RLS propia (subcontrato_asignaciones / facturas_subcontrato), que
// solo dejan ver o tocar lo que le corresponde a este usuario — ver
// supabase/migrations/2026-09-20-portal-subcontratistas.sql.
//
// 2026-11-11 (tablero): lo que el subcontratista necesita saber de cada
// OT / Centro de Costo (nombre del proyecto, monto acordado, y cuánto
// lleva pagado Serein de cada factura aceptada) vive en app_state
// (serein_proyectos), que él no puede leer. Lo entrega la función
// `portal_subcontrato_resumen()` (security definer, ver migración
// 2026-11-11-portal-subcontratista-resumen.sql): devuelve SOLO sus OT,
// sus CC y el abonado de SUS facturas. Si la función todavía no existe,
// el portal sigue funcionando con lo que ya tenía (sin montos acordados y
// con el abonado fijado al aceptar). Se refresca solo cada 30 s y al
// volver a la pestaña, para que un «Pagado» de gerencia se vea al momento.
import React, { useState, useEffect, useMemo, useRef } from 'react'
import { LogOut, Upload, FileText, RefreshCw, ChevronDown, ChevronUp, Wallet, Receipt, Clock, CheckCircle2, Briefcase } from 'lucide-react'
import { supabase } from './supabase.js'
import { fileToBase64 } from './protocolo-pdf.js'
import { KpiCard } from './ui.jsx'
import { SEREIN, PILL_VARIANT } from './theme-serein.js'

const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const inp = { padding: '8px 10px', border: '1px solid ' + SEREIN.line, borderRadius: SEREIN.radiusSm, fontSize: 13, boxSizing: 'border-box', background: '#fff' }
const montoBruto = f => f.exento ? (f.monto || 0) : Math.round((f.monto || 0) * 1.19)
const ESTADO_LABEL = { pendiente: 'En revisión', aceptada: 'Aceptada', rechazada: 'Rechazada' }
const ESTADO_PILL = { pendiente: PILL_VARIANT.naranja, aceptada: PILL_VARIANT.verde, rechazada: PILL_VARIANT.rojo }
const REFRESCO_MS = 30 * 1000

// Estado de pago de una factura aceptada, derivado del abonado ACTUAL que
// informa gerencia (mismo criterio que estadoPagoCompra en Proyectos).
export const estadoPago = (f, abonado) => {
  if (f.estado !== 'aceptada') return null
  const b = montoBruto(f)
  if (abonado >= b && b > 0) return { texto: 'Pagada', pill: PILL_VARIANT.verde }
  if (abonado > 0) return { texto: 'Pago parcial', pill: PILL_VARIANT.azul }
  return { texto: 'Por pagar', pill: PILL_VARIANT.gris }
}

// Arma el tablero: proyectos → centros de costo → facturas de este
// subcontratista, con los montos que mostramos en cada nivel.
//  - Montos acordados, facturado y por facturar van en NETO (así se
//    presupuestan los centros de costo en Serein).
//  - Pagado y por cobrar van en BRUTO (lo que efectivamente se transfiere).
export function armarTablero(asignaciones, facturas, resumen) {
  const abonadoDe = new Map()
  const infoProy = new Map()
  for (const p of (Array.isArray(resumen) ? resumen : [])) {
    infoProy.set(String(p.ot), p)
    for (const pg of (p.pagos || [])) if (pg.factura_id) abonadoDe.set(String(pg.factura_id), +pg.abonado || 0)
  }
  const abonadoActual = f => (abonadoDe.has(String(f.id)) ? abonadoDe.get(String(f.id)) : (+f.abonado || 0))

  const porOt = new Map()
  for (const a of asignaciones) {
    const ot = String(a.ot)
    if (!porOt.has(ot)) {
      const info = infoProy.get(ot) || {}
      porOt.set(ot, { ot, nombre: info.nombre || ('OT ' + ot), cliente: info.cliente || '', cerrado: !!info.cerrado, ccs: [] })
    }
    const info = infoProy.get(ot) || {}
    const ccInfo = ((info.ccs || []).find(c => String(c.cc) === String(a.cc))) || {}
    // Solo cuenta el monto que gerencia fijó para ESTE subcontratista; el
    // presupuesto del CC es de todo el proyecto (incluye otros proveedores)
    // y mostrarlo como «por facturar» lo confundiría.
    const acordado = ccInfo.monto_acordado != null ? +ccInfo.monto_acordado : (a.monto_acordado != null ? +a.monto_acordado : null)
    const fs = facturas.filter(f => String(f.ot) === ot && String(f.cc) === String(a.cc))
    const aceptadas = fs.filter(f => f.estado === 'aceptada')
    const pendientes = fs.filter(f => f.estado === 'pendiente')
    const facturadoNeto = aceptadas.reduce((s, f) => s + (+f.monto || 0), 0)
    const enRevisionNeto = pendientes.reduce((s, f) => s + (+f.monto || 0), 0)
    const facturadoBruto = aceptadas.reduce((s, f) => s + montoBruto(f), 0)
    const pagado = aceptadas.reduce((s, f) => s + Math.min(montoBruto(f), abonadoActual(f)), 0)
    porOt.get(ot).ccs.push({
      cc: String(a.cc), nombre: ccInfo.cc_nombre || a.cc_nombre || String(a.cc), asignacionId: a.id,
      acordado, facturadoNeto, enRevisionNeto,
      porFacturar: acordado != null ? Math.max(0, acordado - facturadoNeto - enRevisionNeto) : null,
      excedido: acordado != null && (facturadoNeto + enRevisionNeto) > acordado,
      facturadoBruto, pagado, porCobrar: Math.max(0, facturadoBruto - pagado),
      facturas: fs.map(f => ({ ...f, abonadoActual: abonadoActual(f) })),
    })
  }
  const proyectos = [...porOt.values()].sort((a, b) => (b.ot > a.ot ? 1 : -1))
  for (const p of proyectos) p.ccs.sort((a, b) => a.cc.localeCompare(b.cc, 'es', { numeric: true }))
  const tot = { acordado: 0, hayAcordado: false, facturadoNeto: 0, enRevisionNeto: 0, porFacturar: 0, pagado: 0, porCobrar: 0 }
  for (const p of proyectos) for (const c of p.ccs) {
    if (c.acordado != null) { tot.acordado += c.acordado; tot.hayAcordado = true; tot.porFacturar += c.porFacturar }
    tot.facturadoNeto += c.facturadoNeto; tot.enRevisionNeto += c.enRevisionNeto; tot.pagado += c.pagado; tot.porCobrar += c.porCobrar
  }
  return { proyectos, tot, abonadoActual }
}

export default function SubcontratoApp({ perfil, email, onLogout }) {
  const [asignaciones, setAsignaciones] = useState([])
  const [facturas, setFacturas] = useState([])
  const [resumen, setResumen] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState('')
  const [actualizado, setActualizado] = useState(null)
  const vivo = useRef(true)

  const cargar = async (silencioso = false) => {
    if (silencioso) setRefrescando(true); else { setCargando(true); setError('') }
    try {
      const [a, f, r] = await Promise.all([
        supabase.from('subcontrato_asignaciones').select('*').order('ot'),
        supabase.from('facturas_subcontrato').select('*').order('created_at', { ascending: false }),
        // La función puede no existir todavía (migración sin correr): en ese caso se sigue sin ella.
        Promise.resolve(supabase.rpc('portal_subcontrato_resumen')).catch(e => ({ data: null, error: e })),
      ])
      if (a.error) throw a.error
      if (f.error) throw f.error
      if (!vivo.current) return
      setAsignaciones(a.data || [])
      setFacturas(f.data || [])
      setResumen(r && !r.error && Array.isArray(r.data) ? r.data : null)
      setActualizado(new Date())
      if (silencioso) setError('')
    } catch (err) { if (vivo.current) setError('No se pudo cargar tu información: ' + ((err && err.message) || String(err))) }
    if (vivo.current) { setCargando(false); setRefrescando(false) }
  }
  useEffect(() => {
    vivo.current = true
    cargar()
    const id = setInterval(() => { if (document.visibilityState === 'visible') cargar(true) }, REFRESCO_MS)
    const onVis = () => { if (document.visibilityState === 'visible') cargar(true) }
    document.addEventListener('visibilitychange', onVis)
    return () => { vivo.current = false; clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  const tablero = useMemo(() => armarTablero(asignaciones, facturas, resumen), [asignaciones, facturas, resumen])
  const { tot } = tablero
  const pendientes = facturas.filter(f => f.estado === 'pendiente').length
  const hora = d => d ? d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div style={{ minHeight: '100vh', background: SEREIN.fog, fontFamily: SEREIN.fontBody, color: SEREIN.text }}>
      <div style={{ background: SEREIN.ink, color: '#fff', padding: '14px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: SEREIN.orange, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Briefcase size={18} color="#fff" /></div>
          <div>
            <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 16, letterSpacing: 0.3 }}>SEREIN · Portal de Subcontratistas</div>
            <div style={{ fontSize: 12.5, color: '#B7BEC7' }}>{perfil.nombre || email}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => cargar(true)} title="Actualizar ahora" style={{ background: 'none', border: '1px solid #4A5158', color: '#fff', borderRadius: SEREIN.radiusSm, padding: '7px 10px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} style={{ animation: refrescando ? 'girar 1s linear infinite' : 'none' }} /> {actualizado ? 'Actualizado ' + hora(actualizado) : 'Actualizar'}
          </button>
          <button onClick={onLogout} style={{ background: 'none', border: '1px solid #4A5158', color: '#fff', borderRadius: SEREIN.radiusSm, padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}><LogOut size={14} /> Cerrar sesión</button>
        </div>
      </div>
      <style>{`@keyframes girar { to { transform: rotate(360deg) } } .sc-cc:hover { background: #FAFBFC }
        .sc-fila { display: grid; grid-template-columns: auto minmax(160px, 1.4fr) minmax(180px, 2fr) auto; gap: 16px; align-items: center; padding: 12px 18px }
        @media (max-width: 760px) { .sc-fila { grid-template-columns: auto 1fr; gap: 10px 12px; padding: 12px 14px } .sc-barra, .sc-datos { grid-column: 1 / -1 } .sc-datos { justify-content: space-between } .sc-kpis { grid-template-columns: repeat(2, 1fr) !important } .kpi-card { padding: 14px !important } .kpi-v { font-size: 22px !important } }`}</style>

      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '22px 16px 40px' }}>
        {error && <div style={{ background: SEREIN.redSoft, color: SEREIN.red, padding: '10px 14px', borderRadius: SEREIN.radiusSm, fontSize: 13, marginBottom: 16 }}>{error}</div>}
        {cargando ? (
          <div style={{ color: C.gris, fontSize: 13 }}>Cargando…</div>
        ) : (
          <>
            <div className="sc-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 22 }}>
              <KpiCard icon={Receipt} value={clp(tot.facturadoNeto)} label="Facturado (neto, aceptado)" />
              {tot.hayAcordado && <KpiCard icon={Clock} value={clp(tot.porFacturar)} label="Por facturar (neto)" acento />}
              <KpiCard icon={CheckCircle2} iconBg={SEREIN.greenSoft} iconColor={SEREIN.green} value={clp(tot.pagado)} label="Pagado por Serein" />
              <KpiCard icon={Wallet} iconBg={SEREIN.blueSoft} iconColor={SEREIN.blue} value={clp(tot.porCobrar)} label="Por cobrar (aceptado y no pagado)" />
              <KpiCard icon={FileText} value={pendientes} label={pendientes === 1 ? 'Factura en revisión' : 'Facturas en revisión'} />
            </div>

            <SubirFactura asignaciones={asignaciones} perfil={perfil} onSubido={() => cargar(true)} />

            <div style={{ marginTop: 26 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 17, letterSpacing: -0.2 }}>Tus proyectos</div>
                <div style={{ fontSize: 12, color: SEREIN.textSoft }}>Montos acordados, facturado y por facturar en neto · pagado y por cobrar en bruto (con IVA)</div>
              </div>
              {tablero.proyectos.length === 0 ? (
                <div style={{ background: '#fff', border: '1px solid ' + SEREIN.line, borderRadius: 14, padding: 18, fontSize: 13, color: C.gris }}>Todavía no tienes proyectos asignados.</div>
              ) : tablero.proyectos.map(p => <TarjetaProyecto key={p.ot} p={p} />)}
            </div>

            <div style={{ marginTop: 28 }}>
              <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 17, letterSpacing: -0.2, marginBottom: 10 }}>Todas tus facturas ({facturas.length})</div>
              {facturas.length === 0 ? (
                <div style={{ color: C.gris, fontSize: 13 }}>Todavía no has subido ninguna factura.</div>
              ) : (
                <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid ' + SEREIN.line, borderRadius: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid ' + SEREIN.line }}>
                        {['OT', 'CC', 'Centro de costo', 'Folio', 'Fecha', 'Neto', 'Bruto', 'Pagado', 'Revisión', 'Pago'].map((h, i) => (
                          <th key={i} style={{ textAlign: i >= 5 && i <= 7 ? 'right' : 'left', padding: '9px 10px', fontSize: 11, color: C.gris, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {facturas.map(f => { const ab = tablero.abonadoActual(f); const ep = estadoPago(f, ab); return (
                        <tr key={f.id} style={{ borderBottom: '1px solid #EEF1F4' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: SEREIN.fontDisplay }}>{f.ot}</td>
                          <td style={{ padding: '8px 10px' }}><ChipCC cc={f.cc} /></td>
                          <td style={{ padding: '8px 10px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.cc_nombre || ''}>{f.cc_nombre || '—'}</td>
                          <td style={{ padding: '8px 10px', color: SEREIN.textSoft }}>{f.folio || '—'}</td>
                          <td style={{ padding: '8px 10px', color: SEREIN.textSoft, whiteSpace: 'nowrap' }}>{f.fecha || '—'}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{clp(f.monto)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{clp(montoBruto(f))}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: ab > 0 ? SEREIN.green : SEREIN.textSoft }}>{f.estado === 'aceptada' ? clp(ab) : '—'}</td>
                          <td style={{ padding: '8px 10px' }}><Pill v={ESTADO_PILL[f.estado]}>{ESTADO_LABEL[f.estado]}</Pill></td>
                          <td style={{ padding: '8px 10px' }}>{ep ? <Pill v={ep.pill}>{ep.texto}</Pill> : <span style={{ color: C.gris }}>—</span>}</td>
                        </tr>
                      ) })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Pill({ v, children }) {
  return <span style={{ background: v.bg, color: v.fg, borderRadius: SEREIN.radiusPill, padding: '3px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block' }}>{children}</span>
}

// El código del centro de costo (A3, A6…) siempre visible y destacado:
// es como gerencia y el subcontratista se refieren a cada CC.
function ChipCC({ cc, grande = false }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: grande ? 44 : 34, height: grande ? 28 : 22, padding: '0 8px', borderRadius: 6, background: SEREIN.ink, color: '#fff', fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: grande ? 14 : 12, letterSpacing: 0.4 }}>{cc}</span>
}

function TarjetaProyecto({ p }) {
  const acordado = p.ccs.reduce((s, c) => s + (c.acordado || 0), 0)
  const hayAcordado = p.ccs.some(c => c.acordado != null)
  const facturado = p.ccs.reduce((s, c) => s + c.facturadoNeto, 0)
  const porFacturar = p.ccs.reduce((s, c) => s + (c.porFacturar || 0), 0)
  const pagado = p.ccs.reduce((s, c) => s + c.pagado, 0)
  const porCobrar = p.ccs.reduce((s, c) => s + c.porCobrar, 0)
  return (
    <div style={{ background: '#fff', border: '1px solid ' + SEREIN.line, borderRadius: 14, boxShadow: SEREIN.shadow, marginBottom: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: '1px solid ' + SEREIN.line, flexWrap: 'wrap', background: 'linear-gradient(90deg, #FFF7F0 0%, #FFFFFF 55%)' }}>
        <div style={{ background: SEREIN.orange, color: '#fff', borderRadius: 10, padding: '6px 12px', fontFamily: SEREIN.fontDisplay, fontWeight: 800, fontSize: 18, letterSpacing: -0.2, lineHeight: 1 }}>OT {p.ot}</div>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</div>
          <div style={{ fontSize: 12.5, color: SEREIN.textSoft }}>{p.cliente ? p.cliente + ' · ' : ''}{p.ccs.length} {p.ccs.length === 1 ? 'centro de costo asignado' : 'centros de costo asignados'}</div>
        </div>
        <Pill v={p.cerrado ? PILL_VARIANT.gris : PILL_VARIANT.verde}>{p.cerrado ? 'Cerrado' : 'Activo'}</Pill>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {hayAcordado && <Dato label="Acordado" valor={clp(acordado)} />}
          <Dato label="Facturado" valor={clp(facturado)} />
          {hayAcordado && <Dato label="Por facturar" valor={clp(porFacturar)} color={SEREIN.orangeDark} />}
          <Dato label="Pagado" valor={clp(pagado)} color={SEREIN.green} />
          <Dato label="Por cobrar" valor={clp(porCobrar)} color={porCobrar > 0 ? SEREIN.blue : SEREIN.textSoft} />
        </div>
      </div>
      <div>
        {p.ccs.map(c => <FilaCC key={c.cc} c={c} />)}
      </div>
    </div>
  )
}

function Dato({ label, valor, color }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 10.5, color: SEREIN.textFaint, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 15, color: color || SEREIN.text, whiteSpace: 'nowrap' }}>{valor}</div>
    </div>
  )
}

// Una fila por centro de costo: código, nombre, barra de avance de la
// facturación contra lo acordado y los cinco montos. Se despliega para ver
// las facturas de ese CC con su estado de revisión y de pago.
function FilaCC({ c }) {
  const [abierto, setAbierto] = useState(false)
  const base = c.acordado != null && c.acordado > 0 ? c.acordado : Math.max(1, c.facturadoNeto + c.enRevisionNeto)
  const pct = v => Math.max(0, Math.min(100, (v / base) * 100))
  const pctPagadoNeto = c.facturadoBruto > 0 ? c.facturadoNeto * (c.pagado / c.facturadoBruto) : 0
  const n = c.facturas.length
  return (
    <div className="sc-cc" style={{ borderBottom: '1px solid #EEF1F4' }}>
      <div className="sc-fila" onClick={() => n && setAbierto(v => !v)} style={{ cursor: n ? 'pointer' : 'default' }}>
        <ChipCC cc={c.cc} grande />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.nombre}>{c.nombre}</div>
          <div style={{ fontSize: 11.5, color: SEREIN.textSoft }}>{n === 0 ? 'Sin facturas todavía' : n === 1 ? '1 factura' : n + ' facturas'}{c.excedido ? <span style={{ color: SEREIN.red, fontWeight: 600 }}> · supera lo acordado</span> : ''}</div>
        </div>
        <div className="sc-barra">
          <div style={{ position: 'relative', height: 10, borderRadius: 5, background: SEREIN.fog2, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct(c.facturadoNeto + c.enRevisionNeto) + '%', background: SEREIN.orangeLight }} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct(c.facturadoNeto) + '%', background: SEREIN.orange }} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct(pctPagadoNeto) + '%', background: SEREIN.green }} />
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 11.5, color: SEREIN.textSoft }}>
            {c.acordado != null && <span><b style={{ color: SEREIN.text }}>Acordado</b> {clp(c.acordado)}</span>}
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: SEREIN.orange, marginRight: 4 }} /><b style={{ color: SEREIN.text }}>Facturado</b> {clp(c.facturadoNeto)}</span>
            {c.enRevisionNeto > 0 && <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: SEREIN.orangeLight, marginRight: 4 }} />En revisión {clp(c.enRevisionNeto)}</span>}
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: SEREIN.green, marginRight: 4 }} /><b style={{ color: SEREIN.text }}>Pagado</b> {clp(c.pagado)}</span>
          </div>
        </div>
        <div className="sc-datos" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {c.porFacturar != null
            ? <Dato label="Por facturar" valor={clp(c.porFacturar)} color={c.porFacturar > 0 ? SEREIN.orangeDark : SEREIN.green} />
            : <Dato label="Por facturar" valor="sin monto acordado" color={SEREIN.textFaint} />}
          <Dato label="Por cobrar" valor={clp(c.porCobrar)} color={c.porCobrar > 0 ? SEREIN.blue : SEREIN.textSoft} />
          <span style={{ color: n ? SEREIN.textSoft : 'transparent', display: 'flex' }}>{abierto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
        </div>
      </div>
      {abierto && n > 0 && (
        <div style={{ padding: '0 14px 12px 14px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, background: SEREIN.fog, borderRadius: 8, overflow: 'hidden' }}>
            <thead><tr>{['Folio', 'Fecha', 'Neto', 'Bruto', 'Pagado', 'Revisión', 'Pago'].map((h, i) => <th key={i} style={{ textAlign: i >= 2 && i <= 4 ? 'right' : 'left', padding: '7px 10px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
            <tbody>
              {c.facturas.map(f => { const ep = estadoPago(f, f.abonadoActual); return (
                <tr key={f.id} style={{ borderTop: '1px solid #E6EAEF' }}>
                  <td style={{ padding: '7px 10px' }}>{f.folio || '—'}</td>
                  <td style={{ padding: '7px 10px', color: SEREIN.textSoft }}>{f.fecha || '—'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right' }}>{clp(f.monto)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{clp(montoBruto(f))}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: f.abonadoActual > 0 ? SEREIN.green : SEREIN.textSoft }}>{f.estado === 'aceptada' ? clp(f.abonadoActual) : '—'}</td>
                  <td style={{ padding: '7px 10px' }}><Pill v={ESTADO_PILL[f.estado]}>{ESTADO_LABEL[f.estado]}</Pill></td>
                  <td style={{ padding: '7px 10px' }}>{ep ? <Pill v={ep.pill}>{ep.texto}</Pill> : '—'}</td>
                </tr>
              ) })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SubirFactura({ asignaciones, perfil, onSubido }) {
  const [asignacionId, setAsignacionId] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')

  if (!asignaciones.length) {
    return <div style={{ background: '#fff', border: '1px solid ' + SEREIN.line, borderRadius: 14, padding: 16, fontSize: 13, color: C.gris }}>Todavía no tienes ninguna OT/Centro de Costo asignado. Contacta a Serein para que te habiliten al menos uno antes de poder subir facturas.</div>
  }

  const subir = async e => {
    const fl = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!fl) return
    if (!asignacionId) { window.alert('Elige primero a qué OT / Centro de Costo corresponde.'); return }
    setSubiendo(true); setError(''); setRevision(null); setMsg('')
    try {
      const base64 = await fileToBase64(fl)
      const { data, error: err } = await supabase.functions.invoke('extraer-factura-compra', { body: { archivos: [{ base64, mimeType: fl.type || 'application/pdf', filename: fl.name }], filename: fl.name } })
      if (err) throw err
      if (!data || !data.ok) throw new Error((data && data.error) || 'No se pudo leer el documento.')
      const d = data.datos || {}
      setRevision({
        archivo: fl, proveedor: d.proveedor || '', rut: d.rut || '', folio: d.folio || '',
        fecha: d.fecha || '', monto: d.neto != null ? String(d.neto) : '', exento: !!d.exento, detalle: d.detalle || '',
      })
    } catch (err) { setError('No se pudo leer la factura: ' + ((err && err.message) || String(err))) }
    setSubiendo(false)
  }

  const confirmar = async () => {
    if (!revision) return
    const asig = asignaciones.find(a => a.id === asignacionId)
    if (!asig) { window.alert('Elige a qué OT / Centro de Costo corresponde.'); return }
    const monto = parseInt(String(revision.monto).replace(/\D/g, ''), 10) || 0
    if (!revision.proveedor.trim() || monto <= 0) { window.alert('Falta el proveedor o el monto no es válido — revisa antes de confirmar.'); return }
    setGuardando(true)
    try {
      const nombreArchivo = `${Date.now()}-${revision.archivo.name}`.replace(/[^a-zA-Z0-9_.-]/g, '_')
      const path = `${perfil.id || ''}/${nombreArchivo}`
      const { error: errSubida } = await supabase.storage.from('facturas-subcontrato').upload(path, revision.archivo, { contentType: 'application/pdf', upsert: false })
      if (errSubida) throw errSubida
      const { error: errInsert } = await supabase.from('facturas_subcontrato').insert({
        perfil_id: perfil.id, ot: asig.ot, cc: asig.cc, cc_nombre: asig.cc_nombre,
        proveedor: revision.proveedor, rut: revision.rut, folio: revision.folio, fecha: revision.fecha || null,
        monto, exento: !!revision.exento, detalle: revision.detalle, pdf_path: path,
      })
      if (errInsert) throw errInsert
      try { await supabase.functions.invoke('notificar-factura-subcontrato', { body: { subcontratista: perfil.nombre || '', ot: asig.ot, cc: asig.cc + ' · ' + (asig.cc_nombre || ''), proveedor: revision.proveedor, monto } }) } catch (e) { /* el aviso es best-effort — la factura ya quedó guardada igual */ }
      setMsg('Factura subida — queda en revisión por Serein.')
      setRevision(null)
      onSubido()
    } catch (err) { window.alert('No se pudo guardar la factura: ' + ((err && err.message) || String(err))) }
    setGuardando(false)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid ' + SEREIN.line, borderRadius: 14, boxShadow: SEREIN.shadow, padding: 18 }}>
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 15, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}><FileText size={16} color={SEREIN.orangeDark} /> Subir factura</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <select value={asignacionId} onChange={e => setAsignacionId(e.target.value)} style={{ ...inp, minWidth: 280, maxWidth: '100%' }}>
          <option value="">Elegir OT / Centro de costo…</option>
          {asignaciones.map(a => <option key={a.id} value={a.id}>{`OT ${a.ot} · ${a.cc} · ${a.cc_nombre || ''}`}</option>)}
        </select>
        <label style={{ cursor: subiendo ? 'wait' : 'pointer', background: SEREIN.orange, color: '#fff', border: 'none', borderRadius: SEREIN.radiusSm, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: subiendo ? 0.7 : 1 }}>
          <Upload size={13} /> {subiendo ? 'Leyendo…' : 'Elegir PDF'}
          <input type="file" accept="application/pdf,image/*" onChange={subir} disabled={subiendo} style={{ display: 'none' }} />
        </label>
      </div>
      {msg && <div style={{ fontSize: 12.5, color: C.verde, marginBottom: 8 }}>{msg}</div>}
      {error && <div style={{ fontSize: 12.5, color: C.rojo, marginBottom: 8 }}>{error}</div>}
      {revision && (
        <div style={{ background: SEREIN.fog, padding: 12, borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: C.gris, marginBottom: 6 }}>Revisa los datos antes de confirmar.</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input style={{ ...inp, width: 150 }} placeholder="Proveedor" value={revision.proveedor} onChange={e => setRevision(r => ({ ...r, proveedor: e.target.value }))} />
            <input style={{ ...inp, width: 100 }} placeholder="N° doc / folio" value={revision.folio} onChange={e => setRevision(r => ({ ...r, folio: e.target.value }))} />
            <input style={{ ...inp, width: 110 }} placeholder="RUT" value={revision.rut} onChange={e => setRevision(r => ({ ...r, rut: e.target.value }))} />
            <input style={{ ...inp, width: 130 }} type="date" value={revision.fecha} onChange={e => setRevision(r => ({ ...r, fecha: e.target.value }))} />
            <input style={{ ...inp, width: 120 }} placeholder="Monto neto CLP" value={revision.monto} onChange={e => setRevision(r => ({ ...r, monto: e.target.value }))} />
            <label style={{ fontSize: 12, color: C.gris, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={!!revision.exento} onChange={e => setRevision(r => ({ ...r, exento: e.target.checked }))} /> Exenta (sin IVA)</label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={confirmar} disabled={guardando} style={{ background: guardando ? '#9AA3AD' : C.verde, color: '#fff', border: 'none', borderRadius: SEREIN.radiusSm, padding: '8px 14px', cursor: guardando ? 'default' : 'pointer', fontSize: 13, fontWeight: 600 }}>{guardando ? 'Guardando…' : 'Confirmar'}</button>
            <button onClick={() => setRevision(null)} style={{ background: 'none', border: '1px solid ' + SEREIN.line, borderRadius: SEREIN.radiusSm, padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
