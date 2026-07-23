import React, { useState, useMemo, useEffect } from 'react'
import { Plus, Trash2, CalendarDays, Clock3, Users, Wallet, Table2, EyeOff, Download, FileText, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'

import { SEREIN } from './theme-serein.js'
// Paleta reskineada a la identidad Serein 2026 — mismas claves, solo cambian los valores hex.
const C = { naranja: SEREIN.orange, carbon: SEREIN.text, verde: SEREIN.green, rojo: SEREIN.red, gris: SEREIN.textFaint }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const hoy = () => new Date().toISOString().slice(0, 10)
const inp = { padding: '7px 9px', border: '1px solid #DFE4EA', fontSize: 13, boxSizing: 'border-box' }

// ============================================================
// NÓMINA / ASISTENCIA · SEREIN 2026
// - Todos los datos son editables; las columnas de fórmula se
//   calculan solas y no se pueden escribir.
// - Fórmulas (verificadas con la planilla real):
//     Valor día bruto        = (Sueldo + Imposiciones) / 30
//     Valor día sin imposic.  = Sueldo / 30
//     Valor hora              = Valor día bruto / 9
//     Valor hora extra        = Valor hora × 1,5
//     Valor Sábado y Domingo  = se ingresan a mano
// - Grupos: Istria / Planta / Administrativos
// - SOLO GERENCIA ve valores. Los supervisores solo ven la
//   lista de trabajadores (nombre, cargo, grupo, nacionalidad).
// ============================================================

export const MO_VER = 'nomina-real-2026-07'
export const GRUPOS = ['Istria', 'Planta', 'Administrativos']

// Datos reales cargados desde la planilla (editables en pantalla).
// Complete/ajuste los que falten directamente en la tabla de Nómina.
export const MO_SEED = {
  ver: MO_VER,
  cargos: [], // se conserva por compatibilidad; ya no se usa
  trabajadores: [
    { id: 't1', grupo: 'Istria', nombre: 'Daniel Matos', cargo: 'Supervisor', nacionalidad: 'Chilena', sueldo: 800000, imposiciones: 270981, sabado: 60000, domingo: 0 },
    { id: 't2', grupo: 'Istria', nombre: 'Dario Daza', cargo: 'Maestro Granallador', nacionalidad: 'Chilena', sueldo: 900000, imposiciones: 207675, sabado: 60000, domingo: 0 },
    { id: 't3', grupo: 'Administrativos', nombre: 'Fernanda Soto', cargo: 'Gerente administrativa', nacionalidad: 'Chilena', sueldo: 2000000, imposiciones: 0, sabado: 0, domingo: 0 },
    { id: 't4', grupo: 'Administrativos', nombre: 'Mario Vidal', cargo: 'Gerente de Proyectos', nacionalidad: 'Chilena', sueldo: 3200000, imposiciones: 0, sabado: 0, domingo: 0 },
    { id: 't5', grupo: 'Administrativos', nombre: 'Carolina Marillanca', cargo: 'Gerente comercial', nacionalidad: 'Chilena', sueldo: 3200000, imposiciones: 0, sabado: 0, domingo: 0 },
  ],
  asistencias: [],
  horasExtras: [],
}

// ================= FÓRMULAS =================
export function calc(t) {
  const s = num(t.sueldo), imp = num(t.imposiciones)
  const diaBrutoRaw = (s + imp) / 30
  const diaSinImpRaw = s / 30
  const horaRaw = diaBrutoRaw / 9
  const hexRaw = horaRaw * 1.5
  return {
    diaBruto: Math.round(diaBrutoRaw),
    diaSinImp: Math.round(diaSinImpRaw),
    hora: Math.round(horaRaw),
    horaExtra: Math.round(hexRaw),
    sabado: num(t.sabado),
    domingo: num(t.domingo),
  }
}
const valorDiarioDe = t => calc(t).diaBruto
const valorHexDe = t => calc(t).horaExtra
const cargoDe = t => t.cargo || ''
export const costoMOdeOT = (mo, numOT) => {
  if (!mo) return 0
  const asis = (mo.asistencias || []).reduce((a, x) => a + ((x.costo && x.costo.porOT && x.costo.porOT[numOT]) || 0), 0)
  const hex = (mo.horasExtras || []).filter(h => h.ot === numOT).reduce((a, h) => a + ((h.costo && h.costo.total) || 0), 0)
  return asis + hex
}

function Aviso({ hijo }) { return <div style={{ background: '#FDECDD', color: '#D9600A', padding: '8px 12px', fontSize: 12, marginTop: 8 }}>{hijo}</div> }

function TabsInternos({ tabs, sel, onSel }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onSel(t.id)}
          style={{ background: sel === t.id ? C.carbon : '#fff', color: sel === t.id ? '#fff' : C.carbon, border: '1px solid #DFE4EA', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontFamily: SEREIN.fontDisplay, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, display: 'flex', alignItems: 'center', gap: 6 }}>
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
    const detalle = f.trabajadorIds.map(tid => {
      const t = (mo.trabajadores || []).find(x => x.id === tid)
      return { tId: tid, valor: Math.round(valorDiarioDe(t) * factor) }
    })
    const total = detalle.reduce((a, d) => a + d.valor, 0)
    const porOT = Object.fromEntries(ots.map(o => [o, Math.round(total / ots.length)]))
    const reg = { id: 'a' + Date.now(), fecha: f.fecha, supervisor: usuario, area: f.area, jornada: f.jornada, trabajadorIds: f.trabajadorIds, ots, obs: f.obs, costo: { total, detalle, porOT } }
    setMo({ ...mo, asistencias: [reg, ...mo.asistencias] })
    setF({ ...f, trabajadorIds: [], ots: [], otManual: '', obs: '' })
    setGuardado(true); setTimeout(() => setGuardado(false), 3500)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #DFE4EA', padding: 18 }}>
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
        {(mo.trabajadores || []).map(t => {
          const sel = f.trabajadorIds.includes(t.id)
          return (
            <button key={t.id} onClick={() => setF({ ...f, trabajadorIds: toggle(f.trabajadorIds, t.id) })}
              style={{ background: sel ? C.naranja : '#fff', color: sel ? '#fff' : C.carbon, border: `1px solid ${sel ? C.naranja : '#DFE4EA'}`, padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}>
              {t.nombre}{cargoDe(t) ? ` (${cargoDe(t)})` : ''}
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
              style={{ background: sel ? C.carbon : '#fff', color: sel ? '#fff' : C.carbon, border: `1px solid ${sel ? C.carbon : '#DFE4EA'}`, padding: '7px 12px', cursor: 'pointer', fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>
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
          style={{ background: C.naranja, color: '#fff', border: 'none', padding: '10px 22px', cursor: 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Guardar registro
        </button>
        {guardado && <span style={{ color: C.verde, fontSize: 13 }}>✓ Registro guardado correctamente</span>}
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
    const t = (mo.trabajadores || []).find(x => x.id === f.trabajadorId)
    const valorHex = valorHexDe(t)
    const reg = { id: 'h' + Date.now(), fecha: f.fecha, trabajadorId: f.trabajadorId, horas, ot, obs: f.obs, costo: { valorHex, total: Math.round(valorHex * horas) } }
    setMo({ ...mo, horasExtras: [reg, ...mo.horasExtras] })
    setF({ ...f, horas: '', ot: '', otManual: '', obs: '' })
    setGuardado(true); setTimeout(() => setGuardado(false), 3500)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #DFE4EA', padding: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: C.gris }}>Fecha
          <input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 12, color: C.gris }}>Trabajador
          <select value={f.trabajadorId} onChange={e => setF({ ...f, trabajadorId: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }}>
            {(mo.trabajadores || []).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
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
          style={{ background: C.naranja, color: '#fff', border: 'none', padding: '10px 22px', cursor: 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Guardar horas extras
        </button>
        {guardado && <span style={{ color: C.verde, fontSize: 13 }}>✓ Registro guardado correctamente</span>}
      </div>
      {!esGerencia && <Aviso hijo="El costo de las horas extras se calcula internamente y se carga a la OT indicada. Solo Gerencia ve los montos." />}
    </div>
  )
}

// ================= LISTA DE REGISTROS =================
function ListaRegistros({ mo, setMo, esGerencia, usuario }) {
  const visibles = esGerencia ? mo.asistencias : (mo.asistencias || []).filter(a => a.supervisor === usuario)
  const hexVisibles = mo.horasExtras
  const nombreDe = id => (mo.trabajadores || []).find(t => t.id === id)?.nombre || id

  return (
    <div>
      <div style={{ background: '#fff', border: '1px solid #DFE4EA', padding: 18, marginBottom: 14 }}>
        <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Asistencias registradas</div>
        {visibles.length === 0 ? <div style={{ fontSize: 13, color: '#9AA3AD' }}>Sin registros aún.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                  {['Fecha', 'Área', 'Supervisor', 'Trabajadores', 'OT/OC', esGerencia ? 'Costo día' : null, esGerencia ? 'Por OT' : null, ''].filter(x => x !== null).map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #DFE4EA', verticalAlign: 'top' }}>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{a.fecha}{a.jornada === 'Media' && <span style={{ fontSize: 11, color: C.gris }}> (½)</span>}</td>
                    <td style={{ padding: '8px' }}>{a.area}</td>
                    <td style={{ padding: '8px', color: C.gris, fontSize: 12 }}>{a.supervisor}</td>
                    <td style={{ padding: '8px' }}>{a.trabajadorIds.map(nombreDe).join(', ')}</td>
                    <td style={{ padding: '8px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{a.ots.join(', ')}</td>
                    {esGerencia && <td style={{ padding: '8px', fontWeight: 600 }}>{clp(a.costo.total)}</td>}
                    {esGerencia && <td style={{ padding: '8px', fontSize: 12 }}>{Object.entries(a.costo.porOT).map(([o, m]) => <div key={o}>{o}: {clp(m)}</div>)}</td>}
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      {esGerencia && <button onClick={() => window.confirm('¿Eliminar este registro de asistencia?') && setMo({ ...mo, asistencias: (mo.asistencias || []).filter(x => x.id !== a.id) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #DFE4EA', padding: 18 }}>
        <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Horas extras registradas</div>
        {hexVisibles.length === 0 ? <div style={{ fontSize: 13, color: '#9AA3AD' }}>Sin horas extras.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                {['Fecha', 'Trabajador', 'Horas', 'OT/OC', esGerencia ? 'Costo' : null, ''].filter(x => x !== null).map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hexVisibles.map(h => (
                <tr key={h.id} style={{ borderBottom: '1px solid #DFE4EA' }}>
                  <td style={{ padding: '8px' }}>{h.fecha}</td>
                  <td style={{ padding: '8px' }}>{nombreDe(h.trabajadorId)}</td>
                  <td style={{ padding: '8px' }}>{h.horas} h</td>
                  <td style={{ padding: '8px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{h.ot}</td>
                  {esGerencia && <td style={{ padding: '8px', fontWeight: 600 }}>{clp(h.costo.total)}</td>}
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    {esGerencia && <button onClick={() => window.confirm('¿Eliminar estas horas extras?') && setMo({ ...mo, horasExtras: (mo.horasExtras || []).filter(x => x.id !== h.id) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>}
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

// ================= TRABAJADORES (VISTA SUPERVISOR, SIN VALORES) =================
function TrabajadoresView({ mo }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #DFE4EA', padding: 18 }}>
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 4 }}>Trabajadores</div>
      <div style={{ fontSize: 12, color: C.gris, marginBottom: 12 }}>Listado del personal. Los valores de sueldo y asistencia solo son visibles para Gerencia.</div>
      {GRUPOS.map(g => {
        const lista = (mo.trabajadores || []).filter(t => t.grupo === g)
        if (lista.length === 0) return null
        return (
          <div key={g} style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, color: C.naranja, textTransform: 'uppercase', marginBottom: 6 }}>{g}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                  {['Nombre', 'Cargo', 'Nacionalidad'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #DFE4EA' }}>
                    <td style={{ padding: '8px', fontWeight: 500 }}>{t.nombre}</td>
                    <td style={{ padding: '8px' }}>{t.cargo}</td>
                    <td style={{ padding: '8px', color: C.gris }}>{t.nacionalidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

// ================= COSTOS POR OT (GERENCIA) =================
function CostosPorOT({ mo }) {
  const acumulado = useMemo(() => {
    const m = {}
    (mo.asistencias || []).forEach(a => Object.entries(a.costo.porOT).forEach(([ot, monto]) => {
      m[ot] = m[ot] || { normal: 0, hex: 0, fechas: new Set(), trabajadores: new Set() }
      m[ot].normal += monto
      m[ot].fechas.add(a.fecha)
      a.trabajadorIds.forEach(t => m[ot].trabajadores.add(t))
    }))
    (mo.horasExtras || []).forEach(h => {
      m[h.ot] = m[h.ot] || { normal: 0, hex: 0, fechas: new Set(), trabajadores: new Set() }
      m[h.ot].hex += h.costo.total
      m[h.ot].fechas.add(h.fecha)
      m[h.ot].trabajadores.add(h.trabajadorId)
    })
    return m
  }, [mo])
  const nombreDe = id => (mo.trabajadores || []).find(t => t.id === id)?.nombre || id

  return (
    <div style={{ background: '#fff', border: '1px solid #DFE4EA', padding: 18 }}>
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Mano de obra acumulada por OT / OC</div>
      {Object.keys(acumulado).length === 0 ? <div style={{ fontSize: 13, color: '#9AA3AD' }}>Sin costos registrados.</div> : (
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
                <tr key={ot} style={{ borderBottom: '1px solid #DFE4EA', verticalAlign: 'top' }}>
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
    </div>
  )
}

// ================= NÓMINA / VALORES (GERENCIA) =================
function NominaMO({ mo, setMo }) {
  const setTrab = (id, campo, valor) => setMo({ ...mo, trabajadores: (mo.trabajadores || []).map(t => t.id === id ? { ...t, [campo]: valor } : t) })
  const setNum = (id, campo, valor) => setTrab(id, campo, num(valor))
  const addTrab = grupo => setMo({ ...mo, trabajadores: [...mo.trabajadores, { id: 't' + Date.now(), grupo, nombre: '', cargo: '', nacionalidad: 'Chilena', sueldo: 0, imposiciones: 0, sabado: 0, domingo: 0 }] })
  const delTrab = id => window.confirm('¿Eliminar este trabajador?') && setMo({ ...mo, trabajadores: (mo.trabajadores || []).filter(t => t.id !== id) })

  const auto = { color: C.gris, background: '#F2F4F7', fontStyle: 'italic', whiteSpace: 'nowrap' }
  const th = t => <th style={{ textAlign: 'left', padding: '5px 6px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{t}</th>

  return (
    <div>
      <div style={{ background: '#F2F4F7', border: '1px solid #DFE4EA', padding: '10px 14px', fontSize: 12.5, color: '#5A5148', marginBottom: 14 }}>
        Todos los campos en blanco son editables. Las columnas en gris (día bruto, día sin imposiciones, hora, hora extra) se calculan solas:
        <b> día bruto = (sueldo + imposiciones) ÷ 30</b>, <b>día s/imp = sueldo ÷ 30</b>, <b>hora = día bruto ÷ 9</b>, <b>hora extra = hora × 1,5</b>. Sábado y Domingo se ingresan a mano.
      </div>
      {GRUPOS.map(g => {
        const lista = (mo.trabajadores || []).filter(t => t.grupo === g)
        return (
          <div key={g} style={{ background: '#fff', border: '1px solid #DFE4EA', padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase' }}>{g} <span style={{ color: C.gris, fontWeight: 400 }}>· {lista.length}</span></span>
              <button onClick={() => addTrab(g)} style={{ background: C.carbon, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Agregar trabajador</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                    {th('Nombre')}{th('Cargo')}{th('Nacionalidad')}{th('Sueldo')}{th('Imposiciones')}{th('Día bruto')}{th('Día s/imp')}{th('Hora')}{th('Hora extra')}{th('Sábado')}{th('Domingo')}<th></th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map(t => {
                    const c = calc(t)
                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid #DFE4EA' }}>
                        <td style={{ padding: '4px 6px' }}><input value={t.nombre} onChange={e => setTrab(t.id, 'nombre', e.target.value)} style={{ ...inp, width: 150, fontWeight: 600 }} /></td>
                        <td style={{ padding: '4px 6px' }}><input value={t.cargo} onChange={e => setTrab(t.id, 'cargo', e.target.value)} style={{ ...inp, width: 150 }} /></td>
                        <td style={{ padding: '4px 6px' }}><input value={t.nacionalidad} onChange={e => setTrab(t.id, 'nacionalidad', e.target.value)} style={{ ...inp, width: 90 }} /></td>
                        <td style={{ padding: '4px 6px' }}><input value={t.sueldo || ''} onChange={e => setNum(t.id, 'sueldo', e.target.value)} style={{ ...inp, width: 100, textAlign: 'right' }} /></td>
                        <td style={{ padding: '4px 6px' }}><input value={t.imposiciones || ''} onChange={e => setNum(t.id, 'imposiciones', e.target.value)} style={{ ...inp, width: 100, textAlign: 'right' }} /></td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', ...auto }}>{clp(c.diaBruto)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', ...auto }}>{clp(c.diaSinImp)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', ...auto }}>{clp(c.hora)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', ...auto }}>{clp(c.horaExtra)}</td>
                        <td style={{ padding: '4px 6px' }}><input value={t.sabado || ''} onChange={e => setNum(t.id, 'sabado', e.target.value)} style={{ ...inp, width: 90, textAlign: 'right' }} /></td>
                        <td style={{ padding: '4px 6px' }}><input value={t.domingo || ''} onChange={e => setNum(t.id, 'domingo', e.target.value)} style={{ ...inp, width: 90, textAlign: 'right' }} /></td>
                        <td style={{ padding: '4px 4px', textAlign: 'right' }}><button onClick={() => delTrab(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button></td>
                      </tr>
                    )
                  })}
                  {lista.length === 0 && <tr><td colSpan={12} style={{ padding: 14, textAlign: 'center', color: '#9AA3AD' }}>Sin trabajadores en este grupo. Usa “Agregar trabajador”.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ================= PAGO MENSUAL (GERENCIA) =================
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
    return (mo.trabajadores || []).map(t => {
      const asis = (mo.asistencias || []).filter(a => a.fecha.startsWith(mes) && a.trabajadorIds.includes(t.id))
      const fechas = [...new Set(asis.map(a => a.fecha))]
      const pagoDias = asis.reduce((s, a) => s + (a.costo.detalle.find(d => d.tId === t.id)?.valor || 0), 0)
      const hex = (mo.horasExtras || []).filter(h => h.fecha.startsWith(mes) && h.trabajadorId === t.id)
      const horasHex = hex.reduce((s, h) => s + h.horas, 0)
      const pagoHex = hex.reduce((s, h) => s + h.costo.total, 0)
      return { nombre: t.nombre, cargo: cargoDe(t), diasTrabajados: fechas.length, inasistencias: Math.max(0, habiles - fechas.length), horasExtras: horasHex, pagoDias, pagoHex, total: pagoDias + pagoHex, fechas }
    })
  }, [mo, mes])

  const habiles = diasHabilesDelMes(mes)
  const totalGeneral = resumen.reduce((s, r) => s + r.total, 0)

  return (
    <div style={{ background: '#fff', border: '1px solid #DFE4EA', padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase' }}>Planilla de pago mensual</div>
          <div style={{ fontSize: 12, color: C.gris, marginTop: 2 }}>{habiles} días hábiles (lun–vie) en el mes seleccionado · feriados no descontados</div>
        </div>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)} style={inp} />
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
              <tr key={r.nombre} style={{ borderBottom: '1px solid #DFE4EA' }}>
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
      <Aviso hijo="Los montos usan el valor día bruto vigente de cada trabajador y las asistencias registradas. Para descargar informes usa la pestaña “Informes”." />
    </div>
  )
}

// ================= INFORMES (GERENCIA) — EXCEL / PDF =================
function rangoPeriodo(tipo, mes, fecha) {
  if (tipo === 'mes') {
    const [a, m] = mes.split('-').map(Number)
    const ult = new Date(a, m, 0).getDate()
    return { desde: mes + '-01', hasta: `${mes}-${String(ult).padStart(2, '0')}`, etiqueta: 'Mensual · ' + mes }
  }
  if (tipo === 'dia') return { desde: fecha, hasta: fecha, etiqueta: 'Día · ' + fecha }
  // semana lunes-domingo que contiene 'fecha'
  const d = new Date(fecha + 'T00:00:00')
  const dow = (d.getDay() + 6) % 7
  const lun = new Date(d); lun.setDate(d.getDate() - dow)
  const dom = new Date(lun); dom.setDate(lun.getDate() + 6)
  const f = x => x.toISOString().slice(0, 10)
  return { desde: f(lun), hasta: f(dom), etiqueta: `Semana · ${f(lun)} a ${f(dom)}` }
}

function Informes({ mo }) {
  const [tipo, setTipo] = useState('mes')
  const [mes, setMes] = useState(hoy().slice(0, 7))
  const [fecha, setFecha] = useState(hoy())
  const [grupos, setGrupos] = useState([...GRUPOS])
  const [todos, setTodos] = useState(true)
  const [sel, setSel] = useState([])

  const toggle = (arr, v, setter) => setter(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])
  const trabsDeGrupos = (mo.trabajadores || []).filter(t => grupos.includes(t.grupo))
  const trabsSel = todos ? trabsDeGrupos : trabsDeGrupos.filter(t => sel.includes(t.id))
  const { desde, hasta, etiqueta } = rangoPeriodo(tipo, mes, fecha)

  function construirDatos() {
    const idSet = new Set(trabsSel.map(t => t.id))
    const nombreDe = id => (mo.trabajadores || []).find(t => t.id === id)?.nombre || id

    const nomina = trabsSel.map(t => {
      const c = calc(t)
      return {
        Grupo: t.grupo, Nombre: t.nombre, Cargo: cargoDe(t), Nacionalidad: t.nacionalidad,
        Sueldo: num(t.sueldo), Imposiciones: num(t.imposiciones),
        'Valor día bruto': c.diaBruto, 'Valor día s/imp': c.diaSinImp,
        'Valor hora': c.hora, 'Valor hora extra': c.horaExtra,
        'Valor sábado': c.sabado, 'Valor domingo': c.domingo,
      }
    })

    const asis = (mo.asistencias || []).filter(a => a.fecha >= desde && a.fecha <= hasta)
    const detalle = []
    asis.forEach(a => a.trabajadorIds.filter(id => idSet.has(id)).forEach(id => {
      detalle.push({
        Fecha: a.fecha, Trabajador: nombreDe(id), Área: a.area, Jornada: a.jornada,
        'OT/OC': a.ots.join(', '),
        'Valor día aplicado': a.costo.detalle.find(d => d.tId === id)?.valor || 0,
        Supervisor: a.supervisor, Observación: a.obs || '',
      })
    }))

    const hexRows = (mo.horasExtras || []).filter(h => h.fecha >= desde && h.fecha <= hasta && idSet.has(h.trabajadorId)).map(h => ({
      Fecha: h.fecha, Trabajador: nombreDe(h.trabajadorId), Horas: h.horas, 'OT/OC': h.ot,
      'Valor hora extra': h.costo.valorHex, 'Costo total': h.costo.total, Observación: h.obs || '',
    }))

    const resumen = trabsSel.map(t => {
      const a = asis.filter(x => x.trabajadorIds.includes(t.id))
      const fechas = [...new Set(a.map(x => x.fecha))]
      const pagoDias = a.reduce((s, x) => s + (x.costo.detalle.find(d => d.tId === t.id)?.valor || 0), 0)
      const hx = (mo.horasExtras || []).filter(h => h.fecha >= desde && h.fecha <= hasta && h.trabajadorId === t.id)
      const pagoHex = hx.reduce((s, h) => s + h.costo.total, 0)
      return {
        Grupo: t.grupo, Trabajador: t.nombre, Cargo: cargoDe(t),
        'Días trabajados': fechas.length, 'Horas extras': hx.reduce((s, h) => s + h.horas, 0),
        'Pago días': pagoDias, 'Pago horas extras': pagoHex, 'Total período': pagoDias + pagoHex,
      }
    })

    return { nomina, detalle, hexRows, resumen }
  }

  function descargarExcel() {
    if (trabsSel.length === 0) { alert('Selecciona al menos un trabajador y un área.'); return }
    const { nomina, detalle, hexRows, resumen } = construirDatos()
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(nomina.length ? nomina : [{ Nota: 'Sin trabajadores' }]), 'Nómina')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen.length ? resumen : [{ Nota: 'Sin datos' }]), 'Resumen período')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle.length ? detalle : [{ Nota: 'Sin asistencias en el período' }]), 'Asistencia')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hexRows.length ? hexRows : [{ Nota: 'Sin horas extras en el período' }]), 'Horas extras')
    XLSX.writeFile(wb, `Informe_Asistencia_${tipo}_${desde}.xlsx`)
  }

  function descargarPDF() {
    if (trabsSel.length === 0) { alert('Selecciona al menos un trabajador y un área.'); return }
    const { nomina, resumen } = construirDatos()
    const money = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
    const filasNom = nomina.map(r => `<tr><td>${r.Grupo}</td><td>${r.Nombre}</td><td>${r.Cargo}</td><td style="text-align:right">${money(r.Sueldo)}</td><td style="text-align:right">${money(r.Imposiciones)}</td><td style="text-align:right">${money(r['Valor día bruto'])}</td><td style="text-align:right">${money(r['Valor día s/imp'])}</td><td style="text-align:right">${money(r['Valor hora'])}</td><td style="text-align:right">${money(r['Valor hora extra'])}</td><td style="text-align:right">${money(r['Valor sábado'])}</td><td style="text-align:right">${money(r['Valor domingo'])}</td></tr>`).join('')
    const filasRes = resumen.map(r => `<tr><td>${r.Trabajador}</td><td>${r.Cargo}</td><td style="text-align:right">${r['Días trabajados']}</td><td style="text-align:right">${r['Horas extras']}</td><td style="text-align:right">${money(r['Pago días'])}</td><td style="text-align:right">${money(r['Pago horas extras'])}</td><td style="text-align:right"><b>${money(r['Total período'])}</b></td></tr>`).join('')
    const totalPeriodo = resumen.reduce((s, r) => s + r['Total período'], 0)
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Informe Asistencia SEREIN</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;color:#161616;padding:26px;font-size:12px}
      h1{font-size:18px;margin:0}h2{font-size:13px;text-transform:uppercase;border-bottom:2px solid #161616;padding-bottom:4px;margin:22px 0 8px}
      .sub{color:#7A8288;font-size:12px;margin-top:4px}
      table{width:100%;border-collapse:collapse;font-size:11px}th{background:#161616;color:#fff;text-align:left;padding:5px 6px;font-size:10px;text-transform:uppercase}
      td{padding:4px 6px;border-bottom:1px solid #E2DED4}
      .tot{text-align:right;font-size:14px;font-weight:bold;color:#D2642F;margin-top:8px}</style></head>
      <body>
      <h1>SEREIN SpA · Informe de Asistencia y Nómina</h1>
      <div class="sub">${etiqueta} &nbsp;·&nbsp; Áreas: ${grupos.join(', ')} &nbsp;·&nbsp; ${trabsSel.length} trabajador(es) &nbsp;·&nbsp; Emitido ${hoy()}</div>
      <h2>Nómina y valores</h2>
      <table><thead><tr><th>Grupo</th><th>Nombre</th><th>Cargo</th><th>Sueldo</th><th>Imposic.</th><th>Día bruto</th><th>Día s/imp</th><th>Hora</th><th>H. extra</th><th>Sábado</th><th>Domingo</th></tr></thead><tbody>${filasNom || '<tr><td colspan="11">Sin datos</td></tr>'}</tbody></table>
      <h2>Resumen del período</h2>
      <table><thead><tr><th>Trabajador</th><th>Cargo</th><th>Días trab.</th><th>Hrs. extra</th><th>Pago días</th><th>Pago hrs. extra</th><th>Total</th></tr></thead><tbody>${filasRes || '<tr><td colspan="7">Sin asistencias en el período</td></tr>'}</tbody></table>
      <div class="tot">Total del período: ${money(totalPeriodo)}</div>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`
    const w = window.open('', '_blank')
    if (!w) { alert('Permite las ventanas emergentes para descargar el PDF.'); return }
    w.document.open(); w.document.write(html); w.document.close()
  }

  const btnP = activo => ({ background: activo ? C.carbon : '#fff', color: activo ? '#fff' : C.carbon, border: '1px solid #CBD2D6', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 })

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 4 }}>Informes de asistencia y nómina</div>
      <div style={{ fontSize: 12, color: C.gris, marginBottom: 14 }}>Elige período, áreas y trabajadores, y descarga en Excel o PDF.</div>

      <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase', marginBottom: 6 }}>Período</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <button onClick={() => setTipo('mes')} style={btnP(tipo === 'mes')}>Mensual</button>
        <button onClick={() => setTipo('semana')} style={btnP(tipo === 'semana')}>Semanal</button>
        <button onClick={() => setTipo('dia')} style={btnP(tipo === 'dia')}>Por día</button>
        {tipo === 'mes'
          ? <input type="month" value={mes} onChange={e => setMes(e.target.value)} style={inp} />
          : <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp} />}
        <span style={{ fontSize: 12, color: C.gris }}>{etiqueta}</span>
      </div>

      <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase', marginBottom: 6 }}>Áreas</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {GRUPOS.map(g => (
          <button key={g} onClick={() => toggle(grupos, g, setGrupos)} style={btnP(grupos.includes(g))}>{g}</button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase', marginBottom: 6 }}>Trabajadores</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <button onClick={() => setTodos(true)} style={btnP(todos)}>Todos</button>
        <button onClick={() => setTodos(false)} style={btnP(!todos)}>Seleccionar…</button>
      </div>
      {!todos && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, padding: 10, background: '#FAF7F3' }}>
          {trabsDeGrupos.length === 0 && <span style={{ fontSize: 12, color: C.gris }}>No hay trabajadores en las áreas elegidas.</span>}
          {trabsDeGrupos.map(t => {
            const on = sel.includes(t.id)
            return <button key={t.id} onClick={() => toggle(sel, t.id, setSel)} style={{ background: on ? C.naranja : '#fff', color: on ? '#fff' : C.carbon, border: `1px solid ${on ? C.naranja : '#CBD2D6'}`, padding: '5px 10px', cursor: 'pointer', fontSize: 12.5 }}>{t.nombre}</button>
          })}
        </div>
      )}
      <div style={{ fontSize: 12, color: C.gris, marginBottom: 14 }}>{trabsSel.length} trabajador(es) en el informe.</div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={descargarExcel} style={{ background: C.verde, color: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileSpreadsheet size={16} /> Descargar Excel
        </button>
        <button onClick={descargarPDF} style={{ background: C.carbon, color: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileText size={16} /> Descargar PDF
        </button>
      </div>
    </div>
  )
}

// ================= MÓDULO PRINCIPAL =================
export default function ManoObraModule({ esGerencia, otsDisponibles = [], usuario = 'supervisor@serein.cl', areas = ['Santa Rosa', 'Istria', 'Proyectos'], mo: moExt, setMo: setMoExt }) {
  const [moInt, setMoInt] = useState(MO_SEED)
  const moRaw = moExt ?? moInt
  // Normaliza: si los datos guardados son de una versión anterior, se usa la nómina real al vuelo.
  const mo = (moRaw && moRaw.ver === MO_VER) ? moRaw : MO_SEED
  const setMo = setMoExt ?? setMoInt

  // Persiste la migración una vez (sin bloquear el render).
  useEffect(() => { if (moExt && moExt.ver !== MO_VER && setMoExt) setMoExt(MO_SEED) }, [])

  const tabs = esGerencia ? [
    { id: 'registro', label: 'Registro diario', icono: <CalendarDays size={13} /> },
    { id: 'hex', label: 'Horas extras', icono: <Clock3 size={13} /> },
    { id: 'lista', label: 'Todos los registros', icono: <Users size={13} /> },
    { id: 'costos', label: 'Costos por OT', icono: <Wallet size={13} /> },
    { id: 'pago', label: 'Pago mensual', icono: <Table2 size={13} /> },
    { id: 'nomina', label: 'Nómina / Valores', icono: <Table2 size={13} /> },
    { id: 'informes', label: 'Informes', icono: <Download size={13} /> },
  ] : [
    { id: 'registro', label: 'Registro diario', icono: <CalendarDays size={13} /> },
    { id: 'hex', label: 'Horas extras', icono: <Clock3 size={13} /> },
    { id: 'lista', label: 'Mis registros', icono: <Users size={13} /> },
    { id: 'trabajadores', label: 'Trabajadores', icono: <Users size={13} /> },
  ]
  const [tab, setTab] = useState('registro')

  return (
    <div>
      <TabsInternos tabs={tabs} sel={tab} onSel={setTab} />
      {tab === 'registro' && <RegistroDiario mo={mo} setMo={setMo} otsDisponibles={otsDisponibles} esGerencia={esGerencia} usuario={usuario} areas={areas} />}
      {tab === 'hex' && <HorasExtras mo={mo} setMo={setMo} otsDisponibles={otsDisponibles} esGerencia={esGerencia} usuario={usuario} />}
      {tab === 'lista' && <ListaRegistros mo={mo} setMo={setMo} esGerencia={esGerencia} usuario={usuario} />}
      {tab === 'trabajadores' && !esGerencia && <TrabajadoresView mo={mo} />}
      {tab === 'costos' && esGerencia && <CostosPorOT mo={mo} />}
      {tab === 'pago' && esGerencia && <PagoMensual mo={mo} />}
      {tab === 'nomina' && esGerencia && <NominaMO mo={mo} setMo={setMo} />}
      {tab === 'informes' && esGerencia && <Informes mo={mo} />}
    </div>
  )
}
