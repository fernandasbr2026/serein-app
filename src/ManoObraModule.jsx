import React, { useState, useMemo } from 'react'
import { Plus, Trash2, CalendarDays, Clock3, Users, Wallet, History, CheckCircle2, EyeOff, Download } from 'lucide-react'
import * as XLSX from 'xlsx'

const C = { naranja: '#D2642F', carbon: '#161616', verde: '#3D7A4E', rojo: '#B5432E', gris: '#7A8288' }
const clp = n => '$' + Math.round(n).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const hoy = () => new Date().toISOString().slice(0, 10)
const inp = { padding: '7px 9px', border: '1px solid #CBD2D6', fontSize: 13, boxSizing: 'border-box' }

// ================= DATOS DE PRUEBA =================
export const MO_SEED = {
  cargos: [
    // Cada cargo guarda su historial de valores: el último activo es el vigente
    { id: 'c1', nombre: 'Maestro', valores: [{ desde: '2026-01-01', diario: 45000, hora: 5625, hex: 8400, activo: true }] },
    { id: 'c2', nombre: 'Ayudante', valores: [{ desde: '2026-01-01', diario: 32000, hora: 4000, hex: 6000, activo: true }] },
    { id: 'c3', nombre: 'Pintor', valores: [{ desde: '2026-01-01', diario: 40000, hora: 5000, hex: 7500, activo: true }] },
    { id: 'c4', nombre: 'Granallador', valores: [{ desde: '2026-01-01', diario: 42000, hora: 5250, hex: 7900, activo: true }] },
    { id: 'c5', nombre: 'Supervisor', valores: [{ desde: '2026-01-01', diario: 55000, hora: 6875, hex: 10300, activo: true }] },
    { id: 'c6', nombre: 'Operador', valores: [{ desde: '2026-01-01', diario: 38000, hora: 4750, hex: 7100, activo: true }] },
  ],
  trabajadores: [
    { id: 't1', nombre: 'Juan Pérez', cargoId: 'c1', valorDiarioEspecifico: null },
    { id: 't2', nombre: 'Pedro Soto', cargoId: 'c2', valorDiarioEspecifico: null },
    { id: 't3', nombre: 'Luis González', cargoId: 'c3', valorDiarioEspecifico: null },
    { id: 't4', nombre: 'Carlos Muñoz', cargoId: 'c2', valorDiarioEspecifico: null },
    { id: 't5', nombre: 'Miguel Rojas', cargoId: 'c4', valorDiarioEspecifico: null },
  ],
  asistencias: [
    {
      id: 'a1', fecha: '2026-07-06', supervisor: 'supervisor@serein.cl', area: 'Santa Rosa', jornada: 'Completa',
      trabajadorIds: ['t1', 't2', 't4'], ots: ['OT-2026-114', 'OT-2026-115'], obs: 'Granallado y primera mano',
      // Snapshot congelado al guardar (solo lo ve gerencia):
      costo: { total: 109000, detalle: [{ tId: 't1', valor: 45000 }, { tId: 't2', valor: 32000 }, { tId: 't4', valor: 32000 }], porOT: { 'OT-2026-114': 54500, 'OT-2026-115': 54500 } },
    },
  ],
  horasExtras: [
    { id: 'h1', fecha: '2026-07-06', trabajadorId: 't1', horas: 2, ot: 'OT-2026-114', obs: 'Término de retoque', costo: { valorHex: 8400, total: 16800 } },
  ],
}

// ================= HELPERS =================
const vigente = cargo => cargo.valores.filter(v => v.activo).slice(-1)[0] || cargo.valores.slice(-1)[0]
const valorDiarioDe = (t, cargos) => t.valorDiarioEspecifico ?? vigente(cargos.find(c => c.id === t.cargoId))?.diario ?? 0
const valorHexDe = (t, cargos) => vigente(cargos.find(c => c.id === t.cargoId))?.hex ?? 0

function Aviso({ hijo }) { return <div style={{ background: '#F9E9DE', color: '#8C4519', padding: '8px 12px', fontSize: 12, marginTop: 8 }}>{hijo}</div> }

function TabsInternos({ tabs, sel, onSel }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onSel(t.id)}
          style={{ background: sel === t.id ? C.carbon : '#fff', color: sel === t.id ? '#fff' : C.carbon, border: '1px solid #CBD2D6', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontFamily: "'Oswald',sans-serif", fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, display: 'flex', alignItems: 'center', gap: 6 }}>
          {t.icono}{t.label}
        </button>
      ))}
    </div>
  )
}

// ================= REGISTRO DIARIO =================
function RegistroDiario({ mo, setMo, otsDisponibles, esGerencia, usuario, areas }) {
  const [f, setF] = useState({ fecha: hoy(), area: areas[0] || 'Santa Rosa', jornada: 'Completa', trabajadorIds: [], ots: [], otManual: '', obs: '' })
  const [guardado, setGuardado] = useState(false)

  const toggle = (lista, v) => lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v]

  function guardar() {
    if (f.trabajadorIds.length === 0 || (f.ots.length === 0 && !f.otManual.trim())) return
    const ots = [...f.ots, ...f.otManual.split(',').map(s => s.trim()).filter(Boolean)]
    const factor = f.jornada === 'Media' ? 0.5 : 1
    // Snapshot de costos con los valores vigentes HOY (queda congelado)
    const detalle = f.trabajadorIds.map(tid => {
      const t = mo.trabajadores.find(x => x.id === tid)
      return { tId: tid, valor: Math.round(valorDiarioDe(t, mo.cargos) * factor) }
    })
    const total = detalle.reduce((a, d) => a + d.valor, 0)
    const porOT = Object.fromEntries(ots.map(o => [o, Math.round(total / ots.length)]))
    const reg = { id: 'a' + Date.now(), fecha: f.fecha, supervisor: usuario, area: f.area, jornada: f.jornada, trabajadorIds: f.trabajadorIds, ots, obs: f.obs, costo: { total, detalle, porOT } }
    setMo({ ...mo, asistencias: [reg, ...mo.asistencias] })
    setF({ ...f, trabajadorIds: [], ots: [], otManual: '', obs: '' })
    setGuardado(true); setTimeout(() => setGuardado(false), 3500)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: C.gris }}>Fecha
          <input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 12, color: C.gris }}>Área / planta
          <select value={f.area} onChange={e => setF({ ...f, area: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }}>
            {areas.map(a => <option key={a}>{a}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: C.gris }}>Jornada
          <select value={f.jornada} onChange={e => setF({ ...f, jornada: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }}>
            <option>Completa</option><option>Media</option>
          </select>
        </label>
      </div>

      <div style={{ fontSize: 12, color: C.gris, marginBottom: 6 }}>Trabajadores presentes (cargo entre paréntesis)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {mo.trabajadores.map(t => {
          const sel = f.trabajadorIds.includes(t.id)
          const cargo = mo.cargos.find(c => c.id === t.cargoId)?.nombre
          return (
            <button key={t.id} onClick={() => setF({ ...f, trabajadorIds: toggle(f.trabajadorIds, t.id) })}
              style={{ background: sel ? C.naranja : '#fff', color: sel ? '#fff' : C.carbon, border: `1px solid ${sel ? C.naranja : '#CBD2D6'}`, padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}>
              {t.nombre} ({cargo})
            </button>
          )
        })}
      </div>

      <div style={{ fontSize: 12, color: C.gris, marginBottom: 6 }}>OT / OC trabajadas hoy (puedes marcar varias)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {otsDisponibles.map(o => {
          const sel = f.ots.includes(o)
          return (
            <button key={o} onClick={() => setF({ ...f, ots: toggle(f.ots, o) })}
              style={{ background: sel ? C.carbon : '#fff', color: sel ? '#fff' : C.carbon, border: `1px solid ${sel ? C.carbon : '#CBD2D6'}`, padding: '7px 12px', cursor: 'pointer', fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>
              {o}
            </button>
          )
        })}
      </div>
      <input placeholder="Otra OT/OC no listada (ej: OT 385, OC 5312 — separa con coma)" value={f.otManual}
        onChange={e => setF({ ...f, otManual: e.target.value })} style={{ ...inp, width: '100%', marginBottom: 14 }} />

      <label style={{ fontSize: 12, color: C.gris }}>Observaciones
        <textarea value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} rows={2} style={{ ...inp, width: '100%', marginTop: 4, resize: 'vertical' }} />
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <button onClick={guardar}
          style={{ background: C.naranja, color: '#fff', border: 'none', padding: '10px 22px', cursor: 'pointer', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Guardar registro
        </button>
        {guardado && <span style={{ color: C.verde, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={15} /> Registro guardado correctamente</span>}
      </div>
      {!esGerencia && <Aviso hijo={<><EyeOff size={12} style={{ verticalAlign: -2 }} /> Los valores y costos de mano de obra los calcula el sistema y solo son visibles para Gerencia.</>} />}
    </div>
  )
}

// ================= HORAS EXTRAS =================
function HorasExtras({ mo, setMo, otsDisponibles, esGerencia, usuario }) {
  const [f, setF] = useState({ fecha: hoy(), trabajadorId: mo.trabajadores[0]?.id, horas: '', ot: '', otManual: '', obs: '' })
  const [guardado, setGuardado] = useState(false)

  function guardar() {
    const ot = f.otManual.trim() || f.ot
    const horas = parseFloat(f.horas)
    if (!ot || !horas || horas <= 0) return
    const t = mo.trabajadores.find(x => x.id === f.trabajadorId)
    const valorHex = valorHexDe(t, mo.cargos)
    const reg = { id: 'h' + Date.now(), fecha: f.fecha, trabajadorId: f.trabajadorId, horas, ot, obs: f.obs, costo: { valorHex, total: Math.round(valorHex * horas) } }
    setMo({ ...mo, horasExtras: [reg, ...mo.horasExtras] })
    setF({ ...f, horas: '', ot: '', otManual: '', obs: '' })
    setGuardado(true); setTimeout(() => setGuardado(false), 3500)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: C.gris }}>Fecha
          <input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 12, color: C.gris }}>Trabajador
          <select value={f.trabajadorId} onChange={e => setF({ ...f, trabajadorId: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }}>
            {mo.trabajadores.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: C.gris }}>Horas extras
          <input type="number" min="0.5" step="0.5" value={f.horas} onChange={e => setF({ ...f, horas: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 12, color: C.gris }}>OT / OC asociada
          <select value={f.ot} onChange={e => setF({ ...f, ot: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }}>
            <option value="">— seleccionar —</option>
            {otsDisponibles.map(o => <option key={o}>{o}</option>)}
          </select>
        </label>
      </div>
      <input placeholder="U otra OT/OC no listada (ej: OT 385)" value={f.otManual} onChange={e => setF({ ...f, otManual: e.target.value })} style={{ ...inp, width: '100%', marginBottom: 10 }} />
      <label style={{ fontSize: 12, color: C.gris }}>Observación
        <input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }} />
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <button onClick={guardar}
          style={{ background: C.naranja, color: '#fff', border: 'none', padding: '10px 22px', cursor: 'pointer', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Guardar horas extras
        </button>
        {guardado && <span style={{ color: C.verde, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={15} /> Registro guardado correctamente</span>}
      </div>
      {!esGerencia && <Aviso hijo="El costo de las horas extras se calcula internamente y se carga a la OT indicada. Solo Gerencia ve los montos." />}
    </div>
  )
}

// ================= LISTA DE REGISTROS =================
function ListaRegistros({ mo, setMo, esGerencia, usuario }) {
  const visibles = esGerencia ? mo.asistencias : mo.asistencias.filter(a => a.supervisor === usuario)
  const hexVisibles = esGerencia ? mo.horasExtras : mo.horasExtras
  const nombreDe = id => mo.trabajadores.find(t => t.id === id)?.nombre || id

  return (
    <div>
      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18, marginBottom: 14 }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Asistencias registradas</div>
        {visibles.length === 0 ? <div style={{ fontSize: 13, color: '#9AA0A6' }}>Sin registros aún.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                  {['Fecha', 'Área', 'Supervisor', 'Trabajadores', 'OT/OC', esGerencia ? 'Costo día' : null, esGerencia ? 'Por OT' : null, ''].filter(Boolean).map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #EEE9DF', verticalAlign: 'top' }}>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{a.fecha}{a.jornada === 'Media' && <span style={{ fontSize: 11, color: C.gris }}> (½)</span>}</td>
                    <td style={{ padding: '8px' }}>{a.area}</td>
                    <td style={{ padding: '8px', color: C.gris, fontSize: 12 }}>{a.supervisor}</td>
                    <td style={{ padding: '8px' }}>{a.trabajadorIds.map(nombreDe).join(', ')}</td>
                    <td style={{ padding: '8px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{a.ots.join(', ')}</td>
                    {esGerencia && <td style={{ padding: '8px', fontWeight: 600 }}>{clp(a.costo.total)}</td>}
                    {esGerencia && <td style={{ padding: '8px', fontSize: 12 }}>{Object.entries(a.costo.porOT).map(([o, m]) => <div key={o}>{o}: {clp(m)}</div>)}</td>}
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      {esGerencia && <button onClick={() => window.confirm('¿Eliminar este registro de asistencia?') && setMo({ ...mo, asistencias: mo.asistencias.filter(x => x.id !== a.id) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Horas extras registradas</div>
        {hexVisibles.length === 0 ? <div style={{ fontSize: 13, color: '#9AA0A6' }}>Sin horas extras.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                {['Fecha', 'Trabajador', 'Horas', 'OT/OC', esGerencia ? 'Costo' : null, ''].filter(Boolean).map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hexVisibles.map(h => (
                <tr key={h.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
                  <td style={{ padding: '8px' }}>{h.fecha}</td>
                  <td style={{ padding: '8px' }}>{nombreDe(h.trabajadorId)}</td>
                  <td style={{ padding: '8px' }}>{h.horas} h</td>
                  <td style={{ padding: '8px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{h.ot}</td>
                  {esGerencia && <td style={{ padding: '8px', fontWeight: 600 }}>{clp(h.costo.total)}</td>}
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    {esGerencia && <button onClick={() => window.confirm('¿Eliminar estas horas extras?') && setMo({ ...mo, horasExtras: mo.horasExtras.filter(x => x.id !== h.id) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ================= COSTOS POR OT (GERENCIA) =================
function CostosPorOT({ mo }) {
  const acumulado = useMemo(() => {
    const m = {}
    mo.asistencias.forEach(a => Object.entries(a.costo.porOT).forEach(([ot, monto]) => {
      m[ot] = m[ot] || { normal: 0, hex: 0, fechas: new Set(), trabajadores: new Set() }
      m[ot].normal += monto
      m[ot].fechas.add(a.fecha)
      a.trabajadorIds.forEach(t => m[ot].trabajadores.add(t))
    }))
    mo.horasExtras.forEach(h => {
      m[h.ot] = m[h.ot] || { normal: 0, hex: 0, fechas: new Set(), trabajadores: new Set() }
      m[h.ot].hex += h.costo.total
      m[h.ot].fechas.add(h.fecha)
      m[h.ot].trabajadores.add(h.trabajadorId)
    })
    return m
  }, [mo])
  const nombreDe = id => mo.trabajadores.find(t => t.id === id)?.nombre || id

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Mano de obra acumulada por OT / OC</div>
      {Object.keys(acumulado).length === 0 ? <div style={{ fontSize: 13, color: '#9AA0A6' }}>Sin costos registrados.</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                {['OT / OC', 'MO normal', 'Horas extras', 'Total MO', 'Días trabajados', 'Trabajadores'].map(h => (
                  <th key={h} style={{ textAlign: h.includes('MO') || h.includes('extras') || h === 'Total MO' ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(acumulado).map(([ot, d]) => (
                <tr key={ot} style={{ borderBottom: '1px solid #EEE9DF', verticalAlign: 'top' }}>
                  <td style={{ padding: '8px', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 12 }}>{ot}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{clp(d.normal)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{clp(d.hex)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: C.naranja }}>{clp(d.normal + d.hex)}</td>
                  <td style={{ padding: '8px' }}>{d.fechas.size}</td>
                  <td style={{ padding: '8px', fontSize: 12, color: C.gris }}>{[...d.trabajadores].map(nombreDe).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Aviso hijo="Este total se puede volcar como línea de costo 'Mano de obra' dentro de cada OT del módulo Órdenes de Trabajo (siguiente iteración, cuando conectemos la base de datos)." />
    </div>
  )
}

// ================= VALORES DE MANO DE OBRA (GERENCIA) =================
function ValoresMO({ mo, setMo }) {
  const [nuevoCargo, setNuevoCargo] = useState('')
  const [edits, setEdits] = useState({})
  const [verHistorial, setVerHistorial] = useState(null)

  function actualizarValores(cargoId) {
    const e = edits[cargoId]
    if (!e) return
    setMo({
      ...mo,
      cargos: mo.cargos.map(c => {
        if (c.id !== cargoId) return c
        const actual = vigente(c)
        const nuevo = {
          desde: hoy(),
          diario: e.diario !== undefined ? num(e.diario) : actual.diario,
          hora: e.hora !== undefined ? num(e.hora) : actual.hora,
          hex: e.hex !== undefined ? num(e.hex) : actual.hex,
          activo: true,
        }
        // El valor anterior queda inactivo pero NO se borra (historial)
        return { ...c, valores: [...c.valores.map(v => ({ ...v, activo: false })), nuevo] }
      }),
    })
    setEdits({ ...edits, [cargoId]: undefined })
  }

  function crearCargo() {
    if (!nuevoCargo.trim()) return
    setMo({ ...mo, cargos: [...mo.cargos, { id: 'c' + Date.now(), nombre: nuevoCargo.trim(), valores: [{ desde: hoy(), diario: 0, hora: 0, hex: 0, activo: true }] }] })
    setNuevoCargo('')
  }

  return (
    <div>
      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18, marginBottom: 14 }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 4 }}>Valores por cargo</div>
        <div style={{ fontSize: 12, color: C.gris, marginBottom: 12 }}>Al guardar un cambio se crea un valor nuevo con vigencia desde hoy. Los registros antiguos conservan el valor que tenían al momento de guardarse.</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                {['Cargo', 'Valor diario', 'Valor hora', 'Valor hora extra', 'Vigente desde', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mo.cargos.map(c => {
                const v = vigente(c)
                const e = edits[c.id] || {}
                return (
                  <React.Fragment key={c.id}>
                    <tr style={{ borderBottom: '1px solid #EEE9DF' }}>
                      <td style={{ padding: '8px', fontWeight: 600 }}>{c.nombre}</td>
                      <td style={{ padding: '8px' }}><input value={e.diario ?? v.diario} onChange={ev => setEdits({ ...edits, [c.id]: { ...e, diario: ev.target.value } })} style={{ ...inp, width: 100 }} /></td>
                      <td style={{ padding: '8px' }}><input value={e.hora ?? v.hora} onChange={ev => setEdits({ ...edits, [c.id]: { ...e, hora: ev.target.value } })} style={{ ...inp, width: 90 }} /></td>
                      <td style={{ padding: '8px' }}><input value={e.hex ?? v.hex} onChange={ev => setEdits({ ...edits, [c.id]: { ...e, hex: ev.target.value } })} style={{ ...inp, width: 90 }} /></td>
                      <td style={{ padding: '8px', color: C.gris, fontSize: 12 }}>{v.desde}</td>
                      <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => actualizarValores(c.id)} disabled={!edits[c.id]}
                          style={{ background: edits[c.id] ? C.naranja : '#E5E1DA', color: '#fff', border: 'none', padding: '6px 12px', cursor: edits[c.id] ? 'pointer' : 'default', fontSize: 12 }}>Guardar</button>
                        <button onClick={() => setVerHistorial(verHistorial === c.id ? null : c.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gris, marginLeft: 6 }} title="Historial"><History size={15} /></button>
                      </td>
                    </tr>
                    {verHistorial === c.id && c.valores.slice(0, -0).map((h, i) => (
                      <tr key={i} style={{ background: '#FAF7F3', fontSize: 12, color: C.gris }}>
                        <td style={{ padding: '4px 8px 4px 24px' }}>↳ histórico</td>
                        <td style={{ padding: '4px 8px' }}>{clp(h.diario)}</td>
                        <td style={{ padding: '4px 8px' }}>{clp(h.hora)}</td>
                        <td style={{ padding: '4px 8px' }}>{clp(h.hex)}</td>
                        <td style={{ padding: '4px 8px' }}>{h.desde}{h.activo ? ' · vigente' : ''}</td>
                        <td></td>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input placeholder="Nuevo cargo (ej: Soldador)" value={nuevoCargo} onChange={e => setNuevoCargo(e.target.value)} style={{ ...inp, width: 220 }} />
          <button onClick={crearCargo} style={{ background: C.carbon, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Crear cargo</button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 4 }}>Trabajadores y valores específicos</div>
        <div style={{ fontSize: 12, color: C.gris, marginBottom: 12 }}>Si un trabajador tiene valor específico, ese prima sobre el de su cargo. Déjalo vacío para usar el valor del cargo.</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
              {['Trabajador', 'Cargo', 'Valor diario específico'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mo.trabajadores.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
                <td style={{ padding: '8px', fontWeight: 500 }}>{t.nombre}</td>
                <td style={{ padding: '8px' }}>
                  <select value={t.cargoId} onChange={e => setMo({ ...mo, trabajadores: mo.trabajadores.map(x => x.id === t.id ? { ...x, cargoId: e.target.value } : x) })} style={inp}>
                    {mo.cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </td>
                <td style={{ padding: '8px' }}>
                  <input placeholder={`(usa cargo: ${clp(valorDiarioDe({ ...t, valorDiarioEspecifico: null }, mo.cargos))})`}
                    value={t.valorDiarioEspecifico ?? ''}
                    onChange={e => setMo({ ...mo, trabajadores: mo.trabajadores.map(x => x.id === t.id ? { ...x, valorDiarioEspecifico: e.target.value === '' ? null : num(e.target.value) } : x) })}
                    style={{ ...inp, width: 170 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


// ================= PAGO MENSUAL + EXPORTAR EXCEL (GERENCIA) =================
function diasHabilesDelMes(anioMes) {
  const [a, m] = anioMes.split('-').map(Number)
  const ult = new Date(a, m, 0).getDate()
  let n = 0
  for (let d = 1; d <= ult; d++) {
    const dia = new Date(a, m - 1, d).getDay()
    if (dia >= 1 && dia <= 5) n++
  }
  return n
}

function PagoMensual({ mo }) {
  const [mes, setMes] = useState(hoy().slice(0, 7))

  const resumen = useMemo(() => {
    const habiles = diasHabilesDelMes(mes)
    return mo.trabajadores.map(t => {
      const asis = mo.asistencias.filter(a => a.fecha.startsWith(mes) && a.trabajadorIds.includes(t.id))
      const fechas = [...new Set(asis.map(a => a.fecha))]
      const pagoDias = asis.reduce((s, a) => s + (a.costo.detalle.find(d => d.tId === t.id)?.valor || 0), 0)
      const hex = mo.horasExtras.filter(h => h.fecha.startsWith(mes) && h.trabajadorId === t.id)
      const horasHex = hex.reduce((s, h) => s + h.horas, 0)
      const pagoHex = hex.reduce((s, h) => s + h.costo.total, 0)
      const cargo = mo.cargos.find(c => c.id === t.cargoId)?.nombre || ''
      return {
        nombre: t.nombre, cargo,
        diasTrabajados: fechas.length,
        inasistencias: Math.max(0, habiles - fechas.length),
        horasExtras: horasHex,
        pagoDias, pagoHex,
        total: pagoDias + pagoHex,
        fechas,
      }
    })
  }, [mo, mes])

  const habiles = diasHabilesDelMes(mes)
  const totalGeneral = resumen.reduce((s, r) => s + r.total, 0)

  function descargarExcel() {
    // Hoja 1: resumen de pago
    const filas = resumen.map(r => ({
      'Trabajador': r.nombre,
      'Cargo': r.cargo,
      'Días trabajados': r.diasTrabajados,
      'Inasistencias': r.inasistencias,
      'Horas extras': r.horasExtras,
      'Pago días (CLP)': r.pagoDias,
      'Pago horas extras (CLP)': r.pagoHex,
      'Total a pagar (CLP)': r.total,
    }))
    filas.push({ 'Trabajador': 'TOTAL', 'Cargo': '', 'Días trabajados': '', 'Inasistencias': '', 'Horas extras': '',
      'Pago días (CLP)': resumen.reduce((s, r) => s + r.pagoDias, 0),
      'Pago horas extras (CLP)': resumen.reduce((s, r) => s + r.pagoHex, 0),
      'Total a pagar (CLP)': totalGeneral })

    // Hoja 2: detalle día a día
    const detalle = []
    mo.asistencias.filter(a => a.fecha.startsWith(mes)).forEach(a => {
      a.trabajadorIds.forEach(tid => {
        const t = mo.trabajadores.find(x => x.id === tid)
        detalle.push({
          'Fecha': a.fecha, 'Trabajador': t?.nombre || tid,
          'Área': a.area, 'Jornada': a.jornada,
          'OT/OC': a.ots.join(', '),
          'Valor día aplicado (CLP)': a.costo.detalle.find(d => d.tId === tid)?.valor || 0,
          'Supervisor': a.supervisor, 'Observación': a.obs || '',
        })
      })
    })

    // Hoja 3: horas extras
    const hexRows = mo.horasExtras.filter(h => h.fecha.startsWith(mes)).map(h => ({
      'Fecha': h.fecha,
      'Trabajador': mo.trabajadores.find(t => t.id === h.trabajadorId)?.nombre || h.trabajadorId,
      'Horas': h.horas, 'OT/OC': h.ot,
      'Valor hora extra (CLP)': h.costo.valorHex, 'Costo total (CLP)': h.costo.total,
      'Observación': h.obs || '',
    }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Resumen Pago')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle.length ? detalle : [{ Nota: 'Sin asistencias este mes' }]), 'Detalle Asistencia')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hexRows.length ? hexRows : [{ Nota: 'Sin horas extras este mes' }]), 'Horas Extras')
    XLSX.writeFile(wb, `Pago_ManoObra_${mes}.xlsx`)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase' }}>Planilla de pago mensual</div>
          <div style={{ fontSize: 12, color: C.gris, marginTop: 2 }}>{habiles} días hábiles (lun–vie) en el mes seleccionado · feriados no descontados</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="month" value={mes} onChange={e => setMes(e.target.value)} style={inp} />
          <button onClick={descargarExcel}
            style={{ background: C.verde, color: '#fff', border: 'none', padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={15} /> Descargar Excel
          </button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
              {['Trabajador', 'Cargo', 'Días trab.', 'Inasistencias', 'Hrs. extras', 'Pago días', 'Pago hrs. extras', 'Total a pagar'].map((h, i) => (
                <th key={h} style={{ textAlign: i >= 2 ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resumen.map(r => (
              <tr key={r.nombre} style={{ borderBottom: '1px solid #EEE9DF' }}>
                <td style={{ padding: '8px', fontWeight: 500 }}>{r.nombre}</td>
                <td style={{ padding: '8px', color: C.gris }}>{r.cargo}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{r.diasTrabajados}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: r.inasistencias > 0 ? C.rojo : C.verde }}>{r.inasistencias}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{r.horasExtras}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{clp(r.pagoDias)}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{clp(r.pagoHex)}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: C.naranja }}>{clp(r.total)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: `2px solid ${C.carbon}` }}>
              <td colSpan={7} style={{ padding: '8px', fontWeight: 700, textAlign: 'right' }}>TOTAL GENERAL</td>
              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, fontSize: 15, color: C.naranja }}>{clp(totalGeneral)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Aviso hijo="Los montos usan los valores congelados al momento de cada registro (histórico protegido). El Excel incluye 3 hojas: Resumen de Pago, Detalle de Asistencia día a día, y Horas Extras." />
    </div>
  )
}

// ================= MÓDULO PRINCIPAL =================
export default function ManoObraModule({ esGerencia, otsDisponibles = [], usuario = 'supervisor@serein.cl', areas = ['Santa Rosa', 'Istria', 'Proyectos'], mo: moExt, setMo: setMoExt }) {
  const [moInt, setMoInt] = useState(MO_SEED)
  const mo = moExt ?? moInt
  const setMo = setMoExt ?? setMoInt

  const tabs = [
    { id: 'registro', label: 'Registro diario', icono: <CalendarDays size={13} /> },
    { id: 'hex', label: 'Horas extras', icono: <Clock3 size={13} /> },
    { id: 'lista', label: esGerencia ? 'Todos los registros' : 'Mis registros', icono: <Users size={13} /> },
    ...(esGerencia ? [
      { id: 'costos', label: 'Costos por OT', icono: <Wallet size={13} /> },
      { id: 'pago', label: 'Pago mensual', icono: <Download size={13} /> },
      { id: 'valores', label: 'Valores de Mano de Obra', icono: <History size={13} /> },
    ] : []),
  ]
  const [tab, setTab] = useState('registro')

  return (
    <div>
      <TabsInternos tabs={tabs} sel={tab} onSel={setTab} />
      {tab === 'registro' && <RegistroDiario mo={mo} setMo={setMo} otsDisponibles={otsDisponibles} esGerencia={esGerencia} usuario={usuario} areas={areas} />}
      {tab === 'hex' && <HorasExtras mo={mo} setMo={setMo} otsDisponibles={otsDisponibles} esGerencia={esGerencia} usuario={usuario} />}
      {tab === 'lista' && <ListaRegistros mo={mo} setMo={setMo} esGerencia={esGerencia} usuario={usuario} />}
      {tab === 'costos' && esGerencia && <CostosPorOT mo={mo} />}
      {tab === 'pago' && esGerencia && <PagoMensual mo={mo} />}
      {tab === 'valores' && esGerencia && <ValoresMO mo={mo} setMo={setMo} />}
    </div>
  )
}
