import React, { useState, useMemo } from 'react'
import { Plus, Trash2, CalendarDays, Factory, ClipboardList, BarChart3, CheckCircle2, AlertTriangle, Users } from 'lucide-react'

const C = { naranja: '#FF6B00', carbon: '#0F1A2E', verde: '#12805C', rojo: '#D64545', gris: '#8A929E', azul: '#25608E' }
const inp = { padding: '7px 9px', border: '1px solid #CBD2D6', fontSize: 13, boxSizing: 'border-box' }
const hoy = () => new Date().toISOString().slice(0, 10)
const fm2 = n => n.toLocaleString('es-CL', { maximumFractionDigits: 1 })

export const PROCESOS = ['Granallado', 'Pintura', 'Pintura intumescente', 'Mortero ignífugo', 'Fabricación', 'Otro']
const ESTADOS_DIA = ['En proceso', 'Terminado proceso']
const VALIDACIONES = ['Pendiente de revisión', 'Validado', 'Observado', 'Corregido', 'Anulado']

// ===== DATOS DE PRUEBA (según especificación: OT-234 Howden) =====
export const AVANCES_SEED = [
  { id: 'av1', fecha: '2026-06-29', planta: 'Santa Rosa', supervisor: 'supervisor@serein.cl', ot: 'OT-234', proceso: 'Granallado', estadoDia: 'En proceso', validacion: 'Validado', obs: '', m2Ajustado: null, historial: [] },
  { id: 'av2', fecha: '2026-06-30', planta: 'Santa Rosa', supervisor: 'supervisor@serein.cl', ot: 'OT-234', proceso: 'Granallado', estadoDia: 'En proceso', validacion: 'Validado', obs: '', m2Ajustado: null, historial: [] },
  { id: 'av3', fecha: '2026-07-01', planta: 'Santa Rosa', supervisor: 'supervisor@serein.cl', ot: 'OT-234', proceso: 'Granallado', estadoDia: 'Terminado proceso', validacion: 'Validado', obs: 'Granallado completo', m2Ajustado: null, historial: [] },
  { id: 'av4', fecha: '2026-07-02', planta: 'Santa Rosa', supervisor: 'supervisor@serein.cl', ot: 'OT-234', proceso: 'Pintura', estadoDia: 'En proceso', validacion: 'Pendiente de revisión', obs: '', m2Ajustado: null, historial: [] },
  { id: 'av5', fecha: '2026-07-03', planta: 'Santa Rosa', supervisor: 'supervisor@serein.cl', ot: 'OT-234', proceso: 'Pintura', estadoDia: 'Terminado proceso', validacion: 'Pendiente de revisión', obs: 'Pintura completa', m2Ajustado: null, historial: [] },
]

// ===== CÁLCULO CENTRAL: m² por día, separado por OT+proceso =====
// Regla: NUNCA dividir los m² de la OT entre procesos — cada proceso parte del total.
export function calcularM2(avances, ots) {
  const activos = avances.filter(a => a.validacion !== 'Anulado')
  const grupos = {}
  activos.forEach(a => {
    const k = a.ot + '|' + a.proceso
    grupos[k] = grupos[k] || []
    grupos[k].push(a)
  })
  const m2PorRegistro = {}
  const resumen = {}
  Object.entries(grupos).forEach(([k, regs]) => {
    const [otNum, proceso] = k.split('|')
    const ot = ots.find(o => o.numero === otNum)
    const m2OT = ot?.m2 || 0
    const manuales = regs.filter(r => r.m2Ajustado != null)
    const autos = regs.filter(r => r.m2Ajustado == null)
    const sumaManual = manuales.reduce((s, r) => s + r.m2Ajustado, 0)
    const restante = m2OT - sumaManual
    const porAuto = autos.length > 0 ? Math.max(0, restante) / autos.length : 0
    regs.forEach(r => { m2PorRegistro[r.id] = r.m2Ajustado != null ? r.m2Ajustado : porAuto })
    const total = regs.reduce((s, r) => s + m2PorRegistro[r.id], 0)
    resumen[k] = {
      ot: otNum, proceso, m2OT, dias: regs.length, total,
      pct: m2OT > 0 ? (total / m2OT) * 100 : 0,
      sobreavance: sumaManual > m2OT,
      terminado: regs.some(r => r.estadoDia === 'Terminado proceso'),
    }
  })
  return { m2PorRegistro, resumen }
}

function ChipVal({ v }) {
  const map = { 'Pendiente de revisión': ['#F9E9DE', '#8C4519'], 'Validado': ['#E7F2EA', C.verde], 'Observado': ['#FDF3D7', '#8A6A00'], 'Corregido': ['#E7EEF2', C.azul], 'Anulado': ['#EEE', C.gris] }
  const [bg, fg] = map[v] || ['#EEE', '#666']
  return <span style={{ background: bg, color: fg, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{v}</span>
}

// ===== REGISTRO DIARIO (supervisor) =====
function RegistroAvance({ plantaFija, plantas, ots, avances, setAvances, usuario }) {
  const [f, setF] = useState({ fecha: hoy(), planta: plantaFija || plantas[0], obs: '' })
  const [seleccion, setSeleccion] = useState({}) // { otNumero: Set(procesos) }
  const [guardado, setGuardado] = useState(false)

  const otsPlanta = ots.filter(o => o.area === f.planta && !['Cerrada'].includes(o.estado))

  function toggleProceso(otNum, proceso) {
    setSeleccion(s => {
      const cur = new Set(s[otNum] || [])
      cur.has(proceso) ? cur.delete(proceso) : cur.add(proceso)
      return { ...s, [otNum]: cur }
    })
  }

  function guardar() {
    const nuevos = []
    Object.entries(seleccion).forEach(([otNum, procesos]) => {
      procesos.forEach(proc => {
        // Validación anti-duplicado: mismo día + OT + proceso
        const dup = avances.some(a => a.fecha === f.fecha && a.ot === otNum && a.proceso === proc && a.validacion !== 'Anulado')
        if (dup) return
        nuevos.push({
          id: 'av' + Date.now() + Math.random().toString(36).slice(2, 6),
          fecha: f.fecha, planta: f.planta, supervisor: usuario,
          ot: otNum, proceso: proc, estadoDia: 'En proceso',
          validacion: 'Pendiente de revisión', obs: f.obs, m2Ajustado: null, historial: [],
        })
      })
    })
    if (nuevos.length === 0) return
    setAvances(av => [...nuevos, ...av])
    setSeleccion({}); setF({ ...f, obs: '' })
    setGuardado(true); setTimeout(() => setGuardado(false), 3500)
  }

  const totalSel = Object.values(seleccion).reduce((a, s) => a + s.size, 0)

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: C.gris }}>Fecha
          <input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 12, color: C.gris }}>Planta
          {plantaFija ? (
            <div style={{ ...inp, marginTop: 4, background: '#F3F0EA', fontWeight: 600 }}>{plantaFija} (asignada)</div>
          ) : (
            <select value={f.planta} onChange={e => { setF({ ...f, planta: e.target.value }); setSeleccion({}) }} style={{ ...inp, width: '100%', marginTop: 4 }}>
              {plantas.map(p => <option key={p}>{p}</option>)}
            </select>
          )}
        </label>
      </div>

      <div style={{ fontSize: 12, color: C.gris, marginBottom: 8 }}>
        Toca la OT trabajada y marca el/los procesos realizados hoy (puedes registrar varias OT):
      </div>
      {otsPlanta.length === 0 && <div style={{ fontSize: 13, color: '#9AA0A6', padding: 10 }}>No hay OTs activas en {f.planta}.</div>}
      {otsPlanta.map(o => {
        const sel = seleccion[o.numero] || new Set()
        const procesosOT = o.procesos?.length ? o.procesos : PROCESOS
        return (
          <div key={o.id} style={{ border: `1px solid ${sel.size ? C.naranja : '#E2DED4'}`, padding: 12, marginBottom: 8, background: sel.size ? '#FDF6F1' : '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              <div>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 12, background: C.carbon, color: '#fff', padding: '2px 7px', marginRight: 8 }}>{o.numero}</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{o.cliente}</span>
              </div>
              <span style={{ fontSize: 12, color: C.gris }}>{o.m2} m² · {o.esquema}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {procesosOT.map(p => (
                <button key={p} onClick={() => toggleProceso(o.numero, p)}
                  style={{ background: sel.has(p) ? C.naranja : '#fff', color: sel.has(p) ? '#fff' : C.carbon, border: `1px solid ${sel.has(p) ? C.naranja : '#CBD2D6'}`, padding: '6px 12px', cursor: 'pointer', fontSize: 12.5 }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )
      })}

      <label style={{ fontSize: 12, color: C.gris }}>Observaciones del día
        <textarea value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} rows={2} style={{ ...inp, width: '100%', marginTop: 4, resize: 'vertical' }} />
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <button onClick={guardar} disabled={totalSel === 0}
          style={{ background: totalSel > 0 ? C.naranja : '#CBD2D6', color: '#fff', border: 'none', padding: '10px 22px', cursor: totalSel > 0 ? 'pointer' : 'not-allowed', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Guardar avance ({totalSel})
        </button>
        {guardado && <span style={{ color: C.verde, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={15} /> Registro guardado correctamente</span>}
      </div>
      <div style={{ fontSize: 12, color: C.gris, marginTop: 8 }}>
        Los m² se calculan automáticamente según los días trabajados por proceso. No necesitas ingresarlos.
      </div>
    </div>
  )
}

// ===== LISTA DE REGISTROS (validación y ajuste para gerencia) =====
function ListaAvances({ avances, setAvances, ots, esGerencia, usuario, mo }) {
  const { m2PorRegistro, resumen } = calcularM2(avances, ots)
  const visibles = (esGerencia ? avances : avances.filter(a => a.supervisor === usuario))
    .slice().sort((a, b) => b.fecha.localeCompare(a.fecha))

  function ajustarM2(reg, nuevoStr) {
    const nuevo = nuevoStr === '' ? null : parseFloat(nuevoStr)
    if (nuevo !== null && isNaN(nuevo)) return
    const anterior = reg.m2Ajustado
    setAvances(av => av.map(a => a.id === reg.id ? {
      ...a, m2Ajustado: nuevo, validacion: 'Corregido',
      historial: [...a.historial, { fecha: hoy(), usuario, anterior, nuevo, motivo: 'Ajuste manual de m²' }],
    } : a))
  }

  function cambiarValidacion(reg, v) {
    setAvances(av => av.map(a => a.id === reg.id ? {
      ...a, validacion: v,
      historial: [...a.historial, { fecha: hoy(), usuario, anterior: a.validacion, nuevo: v, motivo: 'Cambio de estado' }],
    } : a))
  }

  // Cruce con asistencia: trabajadores presentes por fecha+planta
  const presentes = (fecha, planta) => {
    if (!mo) return null
    const del = mo.asistencias.filter(x => x.fecha === fecha && x.area === planta)
    if (del.length === 0) return null
    const ids = new Set(del.flatMap(x => x.trabajadorIds))
    return ids.size
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
            {['Fecha', 'Planta', 'OT', 'Proceso', 'Estado día', 'm² del día', esGerencia ? 'Presentes' : null, 'Validación', ''].filter(Boolean).map((h, i) => (
              <th key={i} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibles.map(a => {
            const k = a.ot + '|' + a.proceso
            const sobre = resumen[k]?.sobreavance
            return (
              <tr key={a.id} style={{ borderBottom: '1px solid #EEE9DF', background: sobre ? '#FDF3F0' : 'transparent', opacity: a.validacion === 'Anulado' ? 0.45 : 1 }}>
                <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>{a.fecha}</td>
                <td style={{ padding: '7px 8px' }}>{a.planta}</td>
                <td style={{ padding: '7px 8px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700 }}>{a.ot}</td>
                <td style={{ padding: '7px 8px' }}>{a.proceso}</td>
                <td style={{ padding: '7px 8px' }}>
                  <select value={a.estadoDia} onChange={e => setAvances(av => av.map(x => x.id === a.id ? { ...x, estadoDia: e.target.value } : x))}
                    style={{ border: 'none', background: a.estadoDia === 'Terminado proceso' ? '#E7F2EA' : '#F9E9DE', color: a.estadoDia === 'Terminado proceso' ? C.verde : '#8C4519', padding: '2px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {ESTADOS_DIA.map(s => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{ padding: '7px 8px' }}>
                  {esGerencia ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <input value={a.m2Ajustado ?? ''} placeholder={fm2(m2PorRegistro[a.id] || 0)}
                        onChange={e => ajustarM2(a, e.target.value)}
                        title="Vacío = automático; escribe para ajustar"
                        style={{ ...inp, width: 76, padding: '4px 6px', fontStyle: a.m2Ajustado == null ? 'italic' : 'normal' }} />
                      m²{a.m2Ajustado != null && <span style={{ fontSize: 10, color: C.azul }}>manual</span>}
                    </span>
                  ) : (
                    <span style={{ color: C.gris }}>{a.estadoDia === 'Terminado proceso' ? '✓' : 'auto'}</span>
                  )}
                  {sobre && esGerencia && <span title="Los ajustes superan los m² de la OT" style={{ color: C.rojo, marginLeft: 4 }}><AlertTriangle size={13} /></span>}
                </td>
                {esGerencia && <td style={{ padding: '7px 8px', textAlign: 'center' }}>{presentes(a.fecha, a.planta) ?? '—'}</td>}
                <td style={{ padding: '7px 8px' }}>
                  {esGerencia ? (
                    <select value={a.validacion} onChange={e => cambiarValidacion(a, e.target.value)}
                      style={{ border: '1px solid #E2DED4', padding: '3px 6px', fontSize: 11, cursor: 'pointer', background: '#fff' }}>
                      {VALIDACIONES.map(v => <option key={v}>{v}</option>)}
                    </select>
                  ) : <ChipVal v={a.validacion} />}
                </td>
                <td style={{ padding: '7px 4px', textAlign: 'right' }}>
                  {esGerencia && <button onClick={() => window.confirm('¿Anular este registro?') && cambiarValidacion(a, 'Anulado')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>}
                </td>
              </tr>
            )
          })}
          {visibles.length === 0 && <tr><td colSpan={9} style={{ padding: 16, textAlign: 'center', color: '#9AA0A6' }}>Sin registros.</td></tr>}
        </tbody>
      </table>
      {esGerencia && (
        <div style={{ fontSize: 12, color: C.gris, marginTop: 10 }}>
          m² en cursiva = cálculo automático (m² OT ÷ días del proceso). Escribe un número para ajustar manualmente — los días automáticos se recalculan con el saldo. Filas rojas = sobreavance, requiere revisión.
        </div>
      )}
    </div>
  )
}

// ===== AVANCE POR OT =====
function AvancePorOT({ avances, ots, plantasVisibles }) {
  const { resumen } = calcularM2(avances, ots)
  const otsConAvance = ots.filter(o => plantasVisibles.includes(o.area) && Object.values(resumen).some(r => r.ot === o.numero))

  return (
    <div>
      {otsConAvance.length === 0 && <div style={{ background: '#fff', border: '1px dashed #CBD2D6', padding: 20, textAlign: 'center', color: '#9AA0A6', fontSize: 13 }}>Aún no hay avances registrados.</div>}
      {otsConAvance.map(o => {
        const procesos = (o.procesos?.length ? o.procesos : []).map(p => resumen[o.numero + '|' + p] || { proceso: p, m2OT: o.m2, dias: 0, total: 0, pct: 0, terminado: false })
        const totalProceso = procesos.reduce((a, p) => a + p.total, 0)
        const pctGeneral = procesos.length ? procesos.reduce((a, p) => a + p.pct, 0) / procesos.length : 0
        return (
          <div key={o.id} style={{ background: '#fff', border: '1px solid #E2DED4', padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <div>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 12, background: C.carbon, color: '#fff', padding: '2px 7px', marginRight: 8 }}>{o.numero}</span>
                <span style={{ fontWeight: 600 }}>{o.cliente}</span>
                <span style={{ fontSize: 12, color: C.gris, marginLeft: 10 }}>{o.area} · {o.m2} m² físicos</span>
              </div>
              <div style={{ fontSize: 13 }}>
                Avance general: <b style={{ color: pctGeneral >= 100 ? C.verde : C.naranja }}>{pctGeneral.toFixed(0)}%</b>
                <span style={{ color: C.gris, marginLeft: 10 }}>m²-proceso: <b>{fm2(totalProceso)}</b></span>
              </div>
            </div>
            {procesos.map(p => (
              <div key={p.proceso} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 13, width: 150 }}>{p.proceso}{p.terminado && <span style={{ color: C.verde }}> ✓</span>}</span>
                <div style={{ flex: 1, height: 10, background: '#EEE9DF' }}>
                  <div style={{ width: `${Math.min(100, p.pct)}%`, height: '100%', background: p.pct >= 100 ? C.verde : C.naranja, transition: 'width .3s' }} />
                </div>
                <span style={{ fontSize: 12, width: 190, textAlign: 'right', color: C.gris }}>
                  {fm2(p.total)} / {p.m2OT} m² · {p.dias} día{p.dias !== 1 ? 's' : ''} · {p.pct.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ===== REPORTES (gerencia) =====
function Reportes({ avances, ots, mo }) {
  const [desde, setDesde] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10) })
  const [hasta, setHasta] = useState(hoy())
  const [planta, setPlanta] = useState('Ambas')

  const { m2PorRegistro } = calcularM2(avances, ots)
  const enRango = avances.filter(a => a.validacion !== 'Anulado' && a.fecha >= desde && a.fecha <= hasta && (planta === 'Ambas' || a.planta === planta))

  const porProceso = {}
  const porPlanta = { 'Santa Rosa': {}, 'Istria': {} }
  const otsTrabajadas = new Set()
  enRango.forEach(a => {
    const m2 = m2PorRegistro[a.id] || 0
    porProceso[a.proceso] = (porProceso[a.proceso] || 0) + m2
    porPlanta[a.planta] = porPlanta[a.planta] || {}
    porPlanta[a.planta][a.proceso] = (porPlanta[a.planta][a.proceso] || 0) + m2
    otsTrabajadas.add(a.ot)
  })
  const totalM2 = Object.values(porProceso).reduce((a, b) => a + b, 0)
  const otsSinMov = ots.filter(o => (planta === 'Ambas' || o.area === planta) && ['En ejecución'].includes(o.estado) && !otsTrabajadas.has(o.numero))

  const presentesPlanta = pl => {
    if (!mo) return '—'
    const ids = new Set(mo.asistencias.filter(x => x.area === pl && x.fecha >= desde && x.fecha <= hasta).flatMap(x => x.trabajadorIds))
    return ids.size
  }

  const kpi = (l, v, color) => (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 14, flex: '1 1 150px' }}>
      <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{l}</div>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 21, fontWeight: 600, color: color || C.carbon }}>{v}</div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <label style={{ fontSize: 12, color: C.gris }}>Desde <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ ...inp, marginLeft: 4 }} /></label>
        <label style={{ fontSize: 12, color: C.gris }}>Hasta <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ ...inp, marginLeft: 4 }} /></label>
        <select value={planta} onChange={e => setPlanta(e.target.value)} style={inp}>
          <option>Ambas</option><option>Santa Rosa</option><option>Istria</option>
        </select>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['Hoy', 0], ['7 días', 7], ['30 días', 30]].map(([l, d]) => (
            <button key={l} onClick={() => { const x = new Date(); x.setDate(x.getDate() - d); setDesde(x.toISOString().slice(0, 10)); setHasta(hoy()) }}
              style={{ background: '#fff', border: '1px solid #CBD2D6', padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {kpi('m² Granallado', fm2(porProceso['Granallado'] || 0) + ' m²', C.naranja)}
        {kpi('m² Pintura', fm2(porProceso['Pintura'] || 0) + ' m²', C.azul)}
        {kpi('m²-proceso total', fm2(totalM2) + ' m²')}
        {kpi('OTs trabajadas', otsTrabajadas.size)}
        {kpi('OTs sin movimiento', otsSinMov.length, otsSinMov.length > 0 ? C.rojo : C.verde)}
      </div>

      {/* Comparativa por planta */}
      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18, marginBottom: 14, overflowX: 'auto' }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Comparativa por planta</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
              {['Planta', 'm² Granallado', 'm² Pintura', 'Otros m²', 'Total m²-proceso', 'Trabajadores (período)'].map(h => (
                <th key={h} style={{ textAlign: h === 'Planta' ? 'left' : 'right', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {['Santa Rosa', 'Istria'].map(pl => {
              const d = porPlanta[pl] || {}
              const g = d['Granallado'] || 0, pi = d['Pintura'] || 0
              const otros = Object.entries(d).filter(([k]) => k !== 'Granallado' && k !== 'Pintura').reduce((a, [, v]) => a + v, 0)
              return (
                <tr key={pl} style={{ borderBottom: '1px solid #EEE9DF' }}>
                  <td style={{ padding: '8px', fontWeight: 600 }}>{pl}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{fm2(g)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{fm2(pi)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{fm2(otros)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: C.naranja }}>{fm2(g + pi + otros)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{presentesPlanta(pl)}</td>
                </tr>
              )
            })}
            <tr style={{ borderTop: `2px solid ${C.carbon}` }}>
              <td style={{ padding: '8px', fontWeight: 700 }}>CONSOLIDADO</td>
              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{fm2(porProceso['Granallado'] || 0)}</td>
              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{fm2(porProceso['Pintura'] || 0)}</td>
              <td colSpan={2} style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: C.naranja }}>{fm2(totalM2)} m²-proceso</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      {otsSinMov.length > 0 && (
        <div style={{ background: '#FDF3F0', border: '1px solid #F0C9BA', padding: 14, fontSize: 13 }}>
          <b style={{ color: C.rojo }}>OTs sin movimiento en el período:</b>{' '}
          {otsSinMov.map(o => `${o.numero} (${o.cliente})`).join(' · ')}
        </div>
      )}
    </div>
  )
}

// ===== MÓDULO PRINCIPAL =====
export default function ProduccionModule({ esGerencia, plantaFija = null, plantasVisibles = ['Santa Rosa', 'Istria'], ots = [], avances: avExt, setAvances: setAvExt, usuario = 'supervisor@serein.cl', mo = null }) {
  const [avInt, setAvInt] = useState(AVANCES_SEED)
  const avances = avExt ?? avInt
  const setAvances = setAvExt ?? setAvInt

  const tabs = [
    { id: 'registro', label: 'Registrar avance', icono: <CalendarDays size={13} /> },
    { id: 'lista', label: esGerencia ? 'Todos los registros' : 'Mis registros', icono: <ClipboardList size={13} /> },
    { id: 'porot', label: 'Avance por OT', icono: <Factory size={13} /> },
    ...(esGerencia ? [{ id: 'reportes', label: 'Reportes de producción', icono: <BarChart3 size={13} /> }] : []),
  ]
  const [tab, setTab] = useState('registro')

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ background: tab === t.id ? C.carbon : '#fff', color: tab === t.id ? '#fff' : C.carbon, border: '1px solid #CBD2D6', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontFamily: "'Oswald',sans-serif", fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, display: 'flex', alignItems: 'center', gap: 6 }}>
            {t.icono}{t.label}
          </button>
        ))}
      </div>
      {tab === 'registro' && <RegistroAvance plantaFija={plantaFija} plantas={plantasVisibles} ots={ots} avances={avances} setAvances={setAvances} usuario={usuario} />}
      {tab === 'lista' && <ListaAvances avances={avances.filter(a => plantasVisibles.includes(a.planta))} setAvances={setAvances} ots={ots} esGerencia={esGerencia} usuario={usuario} mo={mo} />}
      {tab === 'porot' && <AvancePorOT avances={avances} ots={ots} plantasVisibles={plantasVisibles} />}
      {tab === 'reportes' && esGerencia && <Reportes avances={avances} ots={ots} mo={mo} />}
    </div>
  )
}
