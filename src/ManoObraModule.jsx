import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Plus, Trash2, CalendarDays, Clock3, Users, Wallet, Table2, EyeOff, Download, FileText, FileSpreadsheet, Moon, Sun, AlertTriangle } from 'lucide-react'
import * as XLSX from 'xlsx'

import { SEREIN } from './theme-serein.js'
import { pullState, pushState } from './sync.js'
// Paleta reskineada a la identidad Serein 2026 — mismas claves, solo cambian los valores hex.
const C = { naranja: SEREIN.orange, carbon: SEREIN.text, verde: SEREIN.green, rojo: SEREIN.red, gris: SEREIN.textFaint, azul: '#0E7A8F', morado: '#5B4E8C' }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const hoy = () => new Date().toISOString().slice(0, 10)
const inp = { padding: '8px 10px', border: '1px solid #DFE4EA', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }

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
//     Valor Feriado trabajado = igual a Domingo (100%)
//     Valor Turno noche       = se ingresa a mano por trabajador
// - Horario Santa Rosa e Istria: L-J 08:00-13:00 / 13:30-17:30,
//   Viernes 08:00-14:00. Atraso se mide siempre contra las 08:00.
// - Grupos: Istria / Planta / Administrativos
// - SOLO GERENCIA ve valores. Los supervisores solo ven la
//   lista de trabajadores (nombre, cargo, grupo, nacionalidad).
// ============================================================

// IMPORTANTE: no subir MO_VER — el módulo descarta los datos guardados y
// vuelve a MO_SEED si mo.ver no coincide con esta constante (ver el
// useEffect al fondo del archivo). Los campos nuevos de esta versión
// (turnoNoche, vacacionesDisponibles, valorColacion, tipo de asistencia)
// son ADITIVOS: se leen con valores por defecto si no existen, para no
// tener que tocar MO_VER ni arriesgar los registros ya guardados.
export const MO_VER = 'nomina-real-2026-07'
export const GRUPOS = ['Istria', 'Planta', 'Administrativos']
export const TIPOS_DIA = ['Trabajó', 'Falta', 'Permiso', 'Vacaciones', 'Licencia/Accidente']
const TIPO_COLOR = { 'Trabajó': C.verde, 'Falta': C.rojo, 'Permiso': C.morado, 'Vacaciones': C.azul, 'Licencia/Accidente': C.naranja }
const TIPO_DESCRIPCION = {
  'Trabajó': 'Se paga el día completo (menos descuento por atraso si llega después de las 08:00).',
  'Falta': 'No se paga el día.',
  'Permiso': 'No se paga el día.',
  'Vacaciones': 'Se paga el día completo y se descuenta 1 día del saldo de vacaciones del trabajador.',
  'Licencia/Accidente': 'No lo paga la empresa ese día — lo cubre Fonasa/Isapre según corresponda. No afecta el saldo de vacaciones.',
}
const HORA_ENTRADA_ESTANDAR = '08:00'

// Datos reales cargados desde la planilla (editables en pantalla).
// Complete/ajuste los que falten directamente en la tabla de Nómina.
export const MO_SEED = {
  ver: MO_VER,
  cargos: [], // se conserva por compatibilidad; ya no se usa
  valorColacion: 0, // valor fijo que paga la empresa por colación — solo informativo, no afecta el pago del trabajador
  trabajadores: [
    { id: 't1', grupo: 'Istria', nombre: 'Daniel Matos', cargo: 'Supervisor', nacionalidad: 'Chilena', sueldo: 800000, imposiciones: 270981, sabado: 60000, domingo: 0, turnoNoche: 0, vacacionesDisponibles: 15 },
    { id: 't2', grupo: 'Istria', nombre: 'Dario Daza', cargo: 'Maestro Granallador', nacionalidad: 'Chilena', sueldo: 900000, imposiciones: 207675, sabado: 60000, domingo: 0, turnoNoche: 0, vacacionesDisponibles: 15 },
    { id: 't3', grupo: 'Administrativos', nombre: 'Fernanda Soto', cargo: 'Gerente administrativa', nacionalidad: 'Chilena', sueldo: 2000000, imposiciones: 0, sabado: 0, domingo: 0, turnoNoche: 0, vacacionesDisponibles: 15 },
    { id: 't4', grupo: 'Administrativos', nombre: 'Mario Vidal', cargo: 'Gerente de Proyectos', nacionalidad: 'Chilena', sueldo: 3200000, imposiciones: 0, sabado: 0, domingo: 0, turnoNoche: 0, vacacionesDisponibles: 15 },
    { id: 't5', grupo: 'Administrativos', nombre: 'Carolina Marillanca', cargo: 'Gerente comercial', nacionalidad: 'Chilena', sueldo: 3200000, imposiciones: 0, sabado: 0, domingo: 0, turnoNoche: 0, vacacionesDisponibles: 15 },
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
    turnoNoche: num(t.turnoNoche),
  }
}
const valorDiarioDe = t => calc(t).diaBruto
const valorHexDe = t => calc(t).horaExtra
const cargoDe = t => t.cargo || ''
const vacacionesDe = t => t.vacacionesDisponibles ?? 15

// ----- Atraso / salida anticipada -----
const minutosDesde = hhmm => { const p = String(hhmm || '').split(':'); const h = parseInt(p[0], 10), m = parseInt(p[1], 10); return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m) }
export const calcAtrasoMin = horaLlegada => horaLlegada ? Math.max(0, minutosDesde(horaLlegada) - minutosDesde(HORA_ENTRADA_ESTANDAR)) : 0
const esViernes = fecha => { try { return new Date(fecha + 'T12:00:00').getDay() === 5 } catch (e) { return false } }
// Hora de salida esperada según el horario real (L-J 17:30, Viernes 14:00).
export const horaSalidaEstandar = fecha => esViernes(fecha) ? '14:00' : '17:30'
export const calcSalidaAnticipadaMin = (horaSalida, fecha) => horaSalida ? Math.max(0, minutosDesde(horaSalidaEstandar(fecha)) - minutosDesde(horaSalida)) : 0

// Calcula el costo de UN día para UN trabajador, según el tipo elegido.
// No se guarda nada acá — es pura función, se usa tanto al guardar como
// para mostrar la vista previa del descuento antes de guardar.
export function costoDia(t, tipo, horaLlegada, factorJornada, horaSalida, fecha) {
  const c = calc(t)
  const valorDia = Math.round(c.diaBruto * (factorJornada || 1))
  if (tipo === 'Trabajó') {
    const atrasoMin = calcAtrasoMin(horaLlegada)
    const descuentoAtraso = Math.round((atrasoMin / 60) * c.hora)
    const salidaAnticipadaMin = calcSalidaAnticipadaMin(horaSalida, fecha)
    const descuentoSalida = Math.round((salidaAnticipadaMin / 60) * c.hora)
    const descuentoTotal = descuentoAtraso + descuentoSalida
    return { valorDia, atrasoMin, descuentoAtraso, salidaAnticipadaMin, descuentoSalida, descuentoDia: 0, pago: Math.max(0, valorDia - descuentoTotal), usaVacacion: false }
  }
  if (tipo === 'Falta' || tipo === 'Permiso') {
    return { valorDia, atrasoMin: 0, descuentoAtraso: 0, salidaAnticipadaMin: 0, descuentoSalida: 0, descuentoDia: valorDia, pago: 0, usaVacacion: false }
  }
  if (tipo === 'Vacaciones') {
    return { valorDia, atrasoMin: 0, descuentoAtraso: 0, salidaAnticipadaMin: 0, descuentoSalida: 0, descuentoDia: 0, pago: valorDia, usaVacacion: true }
  }
  // Licencia/Accidente
  return { valorDia, atrasoMin: 0, descuentoAtraso: 0, salidaAnticipadaMin: 0, descuentoSalida: 0, descuentoDia: 0, pago: 0, usaVacacion: false }
}

// Normaliza un registro de asistencia — formato nuevo (un registro = un
// trabajador, con tipo/horaLlegada/atraso) o formato viejo (un registro =
// grupo de trabajadores, todos "Trabajó", sin atraso) — a una lista plana
// de filas por trabajador. Así el resto del módulo (costos, informes,
// resumen) no necesita saber cuál formato es cada registro, y los
// registros históricos siguen viéndose y contando igual que antes.
export function filasDeAsistencia(a) {
  if (a.trabajadorId) {
    return [{
      regId: a.id, fecha: a.fecha, trabajadorId: a.trabajadorId, tipo: a.tipo || 'Trabajó',
      horaLlegada: a.horaLlegada || '', atrasoMin: (a.costo && a.costo.atrasoMin) || 0,
      horaSalida: a.horaSalida || '', salidaAnticipadaMin: (a.costo && a.costo.salidaAnticipadaMin) || 0,
      descuentoAtraso: (a.costo && a.costo.descuentoAtraso) || 0, descuentoSalida: (a.costo && a.costo.descuentoSalida) || 0,
      descuento: (a.costo && ((a.costo.descuentoAtraso || 0) + (a.costo.descuentoSalida || 0) || a.costo.descuentoDia)) || 0,
      pago: (a.costo && a.costo.total) || 0, ots: a.ots || [], area: a.area, supervisor: a.supervisor, obs: a.obs || '',
    }]
  }
  return (a.trabajadorIds || []).map(tId => ({
    regId: a.id, fecha: a.fecha, trabajadorId: tId, tipo: 'Trabajó', horaLlegada: '', atrasoMin: 0, descuento: 0,
    pago: (a.costo && a.costo.detalle && a.costo.detalle.find(d => d.tId === tId)?.valor) || 0,
    ots: a.ots || [], area: a.area, supervisor: a.supervisor, obs: a.obs || '',
  }))
}

// Un extra puede cargarse a varias OT a la vez — se reparte el costo en
// partes iguales entre ellas (costo.porOT). Los registros viejos (una
// sola OT en `ot`, sin `ots`) se siguen leyendo igual, con el costo
// completo en esa única OT.
const otsDeExtra = h => (h.ots && h.ots.length) ? h.ots : (h.ot ? [h.ot] : [])

export const costoMOdeOT = (mo, numOT) => {
  if (!mo) return 0
  const asis = (mo.asistencias || []).reduce((a, x) => a + ((x.costo && x.costo.porOT && x.costo.porOT[numOT]) || 0), 0)
  const hex = (mo.horasExtras || []).reduce((a, h) => {
    if (h.costo && h.costo.porOT) return a + (h.costo.porOT[numOT] || 0)
    return a + (h.ot === numOT ? ((h.costo && h.costo.total) || 0) : 0)
  }, 0)
  return asis + hex
}

function Aviso({ hijo }) { return <div style={{ background: '#FDECDD', color: '#D9600A', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginTop: 8 }}>{hijo}</div> }

function TabsInternos({ tabs, sel, onSel }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap', borderBottom: '1px solid #E7E2D8', paddingBottom: 10 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onSel(t.id)}
          style={{ background: sel === t.id ? C.carbon : '#fff', color: sel === t.id ? '#fff' : C.carbon, border: '1px solid ' + (sel === t.id ? C.carbon : '#DFE4EA'), borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 12.5, fontFamily: SEREIN.fontDisplay, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, display: 'flex', alignItems: 'center', gap: 6, transition: 'background .15s' }}>
          {t.icono}{t.label}
        </button>
      ))}
    </div>
  )
}

// Tarjeta resumen chica, mismo lenguaje visual que KpiCard del resto de la
// app pero local a este módulo (no se toca ui.jsx).
function StatCard({ icon: Icon, color, bg, valor, label }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #DFE4EA', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 150 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={17} /></div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 800, fontSize: 18, color: C.carbon, lineHeight: 1.1 }}>{valor}</div>
        <div style={{ fontSize: 11, color: C.gris, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )
}

// ================= REGISTRO DIARIO =================
function RegistroDiario({ mo, setMo, otsDisponibles, esGerencia, usuario, areas }) {
  const [f, setF] = useState({ fecha: hoy(), area: areas[0] || 'Santa Rosa', jornada: 'Completa', ots: [], otManual: '', obs: '', estados: {} })
  const [guardado, setGuardado] = useState(false)
  const [busca, setBusca] = useState('')
  const toggle = (lista, v) => lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v]
  const setEstado = (tid, cambios) => setF(s => ({ ...s, estados: { ...s.estados, [tid]: { ...(s.estados[tid] || {}), ...cambios } } }))
  const factor = f.jornada === 'Media' ? 0.5 : 1

  const trabajadores = (mo.trabajadores || []).filter(t => !busca.trim() || (t.nombre || '').toLowerCase().includes(busca.trim().toLowerCase()))
  const entradas = Object.entries(f.estados).filter(([, e]) => e && e.tipo)
  const trabajaronHoy = entradas.filter(([, e]) => e.tipo === 'Trabajó')

  async function guardar() {
    if (entradas.length === 0) return
    if (trabajaronHoy.length > 0 && f.ots.length === 0 && !f.otManual.trim()) { window.alert('Marca al menos una OT/OC para quienes trabajaron hoy.'); return }
    const ots = [...f.ots, ...f.otManual.split(',').map(s => s.trim()).filter(Boolean)]
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_mo') || 'null') } catch (e) {}
    const baseMo = (fresco && fresco.ver === MO_VER) ? fresco : mo
    let trabajadoresActualizados = baseMo.trabajadores || []
    const nuevosRegistros = []
    entradas.forEach(([tid, e]) => {
      const t = trabajadoresActualizados.find(x => x.id === tid)
      if (!t) return
      const d = costoDia(t, e.tipo, e.horaLlegada, factor, e.horaSalida, f.fecha)
      const esTrabajo = e.tipo === 'Trabajó'
      const reg = {
        id: 'a' + Date.now() + Math.random().toString(36).slice(2, 7),
        fecha: f.fecha, trabajadorId: tid, area: f.area, tipo: e.tipo,
        horaLlegada: esTrabajo ? (e.horaLlegada || '') : '',
        horaSalida: esTrabajo ? (e.horaSalida || '') : '',
        jornada: f.jornada, ots: esTrabajo ? ots : [], obs: f.obs, supervisor: usuario,
        costo: esTrabajo
          ? { valorDia: d.valorDia, atrasoMin: d.atrasoMin, descuentoAtraso: d.descuentoAtraso, salidaAnticipadaMin: d.salidaAnticipadaMin, descuentoSalida: d.descuentoSalida, total: d.pago, porOT: Object.fromEntries(ots.map(o => [o, ots.length ? Math.round(d.pago / ots.length) : 0])) }
          : { valorDia: d.valorDia, descuentoDia: d.descuentoDia, total: d.pago },
      }
      nuevosRegistros.push(reg)
      if (e.tipo === 'Vacaciones') {
        trabajadoresActualizados = trabajadoresActualizados.map(x => x.id === tid ? { ...x, vacacionesDisponibles: Math.max(0, vacacionesDe(x) - 1) } : x)
      }
    })
    const nuevo = { ...baseMo, trabajadores: trabajadoresActualizados, asistencias: [...nuevosRegistros, ...(baseMo.asistencias || [])] }
    try { localStorage.setItem('serein_mo', JSON.stringify(nuevo)) } catch (e) {}
    setMo(nuevo)
    pushState()
    setF({ fecha: f.fecha, area: f.area, jornada: 'Completa', ots: [], otManual: '', obs: '', estados: {} })
    setGuardado(true); setTimeout(() => setGuardado(false), 3500)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard icon={Users} color={C.naranja} bg="#FDECDD" valor={entradas.length} label="Trabajadores con estado marcado hoy" />
        <StatCard icon={AlertTriangle} color={C.rojo} bg="#FBE4E2" valor={entradas.filter(([, e]) => e.tipo && e.tipo !== 'Trabajó').length} label="Inasistencias registradas hoy" />
      </div>

      <div style={{ background: '#fff', border: '1px solid #DFE4EA', borderRadius: 10, padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: C.gris }}>Fecha
            <input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12, color: C.gris }}>Área / planta
            <select value={f.area} onChange={e => setF({ ...f, area: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }}>
              {areas.map(a => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, color: C.gris }}>Jornada (para quienes trabajaron)
            <select value={f.jornada} onChange={e => setF({ ...f, jornada: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }}>
              <option>Completa</option><option>Media</option>
            </select>
          </label>
        </div>

        <div style={{ fontSize: 12, color: C.gris, marginBottom: 6 }}>OT / OC trabajadas hoy (aplica a quienes marques "Trabajó")</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {otsDisponibles.map(o => {
            const sel = f.ots.includes(o)
            return (
              <button key={o} onClick={() => setF({ ...f, ots: toggle(f.ots, o) })}
                style={{ background: sel ? C.carbon : '#fff', color: sel ? '#fff' : C.carbon, border: `1px solid ${sel ? C.carbon : '#DFE4EA'}`, borderRadius: 6, padding: '7px 12px', cursor: 'pointer', fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>
                {o}
              </button>
            )
          })}
        </div>
        <input placeholder="Otra OT/OC no listada (ej: OT 385, OC 5312 — separa con coma)" value={f.otManual}
          onChange={e => setF({ ...f, otManual: e.target.value })} style={{ ...inp, width: '100%', marginBottom: 8 }} />
        <label style={{ fontSize: 12, color: C.gris }}>Observaciones (opcional, aplica a todo el registro del día)
          <textarea value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} rows={2} style={{ ...inp, width: '100%', marginTop: 4, resize: 'vertical' }} />
        </label>
      </div>

      <div style={{ background: '#fff', border: '1px solid #DFE4EA', borderRadius: 10, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase' }}>Estado de cada trabajador</div>
          <input placeholder="Buscar trabajador…" value={busca} onChange={e => setBusca(e.target.value)} style={{ ...inp, width: 220 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {trabajadores.map(t => {
            const e = f.estados[t.id] || {}
            const d = e.tipo ? costoDia(t, e.tipo, e.horaLlegada, factor, e.horaSalida, f.fecha) : null
            return (
              <div key={t.id} style={{ border: '1px solid #EEE9DF', borderRadius: 8, padding: 12, background: e.tipo ? '#FAF9F6' : '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.nombre}{cargoDe(t) ? <span style={{ fontWeight: 400, color: C.gris }}> — {cargoDe(t)}</span> : ''}</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {TIPOS_DIA.map(tipo => (
                      <button key={tipo} title={TIPO_DESCRIPCION[tipo]} onClick={() => setEstado(t.id, { tipo: e.tipo === tipo ? undefined : tipo })}
                        style={{ background: e.tipo === tipo ? TIPO_COLOR[tipo] : '#fff', color: e.tipo === tipo ? '#fff' : C.carbon, border: `1px solid ${e.tipo === tipo ? TIPO_COLOR[tipo] : '#DFE4EA'}`, borderRadius: 20, padding: '5px 11px', cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}>
                        {tipo}
                      </button>
                    ))}
                  </div>
                </div>
                {e.tipo === 'Trabajó' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 11.5, color: C.gris }}>Hora de llegada
                      <input type="time" value={e.horaLlegada || ''} onChange={ev => setEstado(t.id, { horaLlegada: ev.target.value })} style={{ ...inp, marginLeft: 6, padding: '5px 8px' }} />
                    </label>
                    <label style={{ fontSize: 11.5, color: C.gris }}>Hora de salida
                      <input type="time" value={e.horaSalida || ''} onChange={ev => setEstado(t.id, { horaSalida: ev.target.value })} style={{ ...inp, marginLeft: 6, padding: '5px 8px' }} />
                    </label>
                    {d && d.atrasoMin > 0 && (
                      <span style={{ fontSize: 11.5, color: C.rojo, fontWeight: 600 }}>
                        ⚠ {d.atrasoMin} min de atraso{esGerencia ? ` — descuento ${clp(d.descuentoAtraso)}` : ''}
                      </span>
                    )}
                    {d && d.salidaAnticipadaMin > 0 && (
                      <span style={{ fontSize: 11.5, color: C.rojo, fontWeight: 600 }}>
                        ⚠ Salió {d.salidaAnticipadaMin} min antes{esGerencia ? ` — descuento ${clp(d.descuentoSalida)}` : ''}
                      </span>
                    )}
                  </div>
                )}
                {e.tipo && e.tipo !== 'Trabajó' && esGerencia && (
                  <div style={{ fontSize: 11.5, color: C.gris, marginTop: 6 }}>
                    {TIPO_DESCRIPCION[e.tipo]}{d && d.descuentoDia > 0 ? ` Descuento del día: ${clp(d.descuentoDia)}.` : ''}
                    {e.tipo === 'Vacaciones' && ` Saldo actual: ${vacacionesDe(t)} días.`}
                  </div>
                )}
              </div>
            )
          })}
          {trabajadores.length === 0 && <div style={{ fontSize: 13, color: '#9AA3AD', textAlign: 'center', padding: 16 }}>Sin trabajadores que coincidan con la búsqueda.</div>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button onClick={guardar} disabled={entradas.length === 0}
            style={{ background: entradas.length === 0 ? '#CBD2D6' : C.naranja, color: '#fff', border: 'none', borderRadius: 8, padding: '11px 22px', cursor: entradas.length === 0 ? 'default' : 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Guardar registro del día ({entradas.length})
          </button>
          {guardado && <span style={{ color: C.verde, fontSize: 13 }}>✓ Registro guardado correctamente</span>}
        </div>
        {!esGerencia && <Aviso hijo={<><EyeOff size={12} style={{ verticalAlign: -2 }} /> Los valores y descuentos los calcula el sistema y solo son visibles para Gerencia.</>} />}
      </div>
    </div>
  )
}

// ================= EXTRAS: HORAS SEMANA / FERIADOS / TURNO NOCHE =================
const TIPOS_EXTRA = [
  { id: 'Semana', label: 'Horas extra semana', icono: <Clock3 size={13} /> },
  { id: 'Feriado', label: 'Feriado / fin de semana', icono: <Sun size={13} /> },
  { id: 'TurnoNoche', label: 'Turno de noche', icono: <Moon size={13} /> },
]

// Horas extra a partir de hora inicio/fin (ej. 15:30 a 19:10 -> 3,67 h).
// Si fin queda antes o igual que inicio se asume que cruzó medianoche.
function horasEntre(inicio, fin) {
  if (!inicio || !fin) return 0
  let min = minutosDesde(fin) - minutosDesde(inicio)
  if (min <= 0) min += 24 * 60
  return Math.round((min / 60) * 100) / 100
}
// Sugerencia automática de colación según la regla acordada — el
// checkbox queda editable igual, esto solo lo pre-marca.
function sugerirColacion(fecha, horaFin) {
  if (!fecha || !horaFin) return false
  let dow
  try { dow = new Date(fecha + 'T12:00:00').getDay() } catch (e) { return false }
  const minFin = minutosDesde(horaFin)
  if (dow >= 1 && dow <= 4) return minFin > minutosDesde('19:00')
  if (dow === 5) return minFin > minutosDesde('14:30')
  return false
}

function HorasExtras({ mo, setMo, otsDisponibles, esGerencia, usuario }) {
  const [tipo, setTipo] = useState('Semana')
  const [f, setF] = useState({ fecha: hoy(), trabajadorIds: [], horaInicio: '', horaFin: '', ots: [], otManual: '', obs: '', colacion: false, colacionTocada: false })
  const [guardado, setGuardado] = useState(false)
  const esFeriado = tipo === 'Feriado'
  useEffect(() => { if (esFeriado) setF(s => ({ ...s, colacion: true })) }, [esFeriado])
  // Auto-sugiere colación en Horas extra semana según la regla, salvo que
  // la persona ya la haya tocado a mano para este registro.
  useEffect(() => {
    if (tipo === 'Semana' && !f.colacionTocada) setF(s => ({ ...s, colacion: sugerirColacion(s.fecha, s.horaFin) }))
  }, [tipo, f.fecha, f.horaFin, f.colacionTocada])

  const toggleTrab = id => setF(s => ({ ...s, trabajadorIds: s.trabajadorIds.includes(id) ? s.trabajadorIds.filter(x => x !== id) : [...s.trabajadorIds, id] }))
  const toggleOt = o => setF(s => ({ ...s, ots: s.ots.includes(o) ? s.ots.filter(x => x !== o) : [...s.ots, o] }))
  const horas = tipo === 'Semana' ? horasEntre(f.horaInicio, f.horaFin) : null

  async function guardar() {
    const ots = [...f.ots, ...f.otManual.split(',').map(s => s.trim()).filter(Boolean)]
    if (ots.length === 0) { window.alert('Indica al menos una OT/OC a la que se carga este extra.'); return }
    if (f.trabajadorIds.length === 0) { window.alert('Marca a los trabajadores que corresponden.'); return }
    if (tipo === 'Semana' && (!horas || horas <= 0)) { window.alert('Indica hora de inicio y de término para calcular las horas extra.'); return }
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_mo') || 'null') } catch (e) {}
    const baseMo = (fresco && fresco.ver === MO_VER) ? fresco : mo
    const nuevosRegistros = f.trabajadorIds.map(tid => {
      const t = (baseMo.trabajadores || []).find(x => x.id === tid)
      let total
      let costo
      if (tipo === 'Semana') {
        const valorHex = valorHexDe(t)
        total = Math.round(valorHex * horas)
        costo = { valorHex, total, colacion: f.colacion ? num(mo.valorColacion) : 0 }
      } else if (tipo === 'Feriado') {
        total = calc(t).domingo
        costo = { valorFeriado: total, total, colacion: num(mo.valorColacion) }
      } else {
        total = calc(t).turnoNoche
        costo = { valorTurno: total, total, colacion: f.colacion ? num(mo.valorColacion) : 0 }
      }
      // El valor de colación (gasto real de la empresa por ese trabajo) se
      // reparte entre las mismas OT, sumado al costo de mano de obra —
      // no afecta el pago del trabajador, pero sí es un costo real de la
      // OT que la generó.
      costo.porOT = Object.fromEntries(ots.map(o => [o, Math.round(total / ots.length) + Math.round((costo.colacion || 0) / ots.length)]))
      return { id: 'h' + Date.now() + Math.random().toString(36).slice(2, 7), tipo, fecha: f.fecha, trabajadorId: tid, horas, horaInicio: tipo === 'Semana' ? f.horaInicio : '', horaFin: tipo === 'Semana' ? f.horaFin : '', ots, obs: f.obs, costo }
    })
    const nuevo = { ...baseMo, horasExtras: [...nuevosRegistros, ...(baseMo.horasExtras || [])] }
    try { localStorage.setItem('serein_mo', JSON.stringify(nuevo)) } catch (e) {}
    setMo(nuevo)
    pushState()
    setF({ fecha: f.fecha, trabajadorIds: [], horaInicio: '', horaFin: '', ots: [], otManual: '', obs: '', colacion: false, colacionTocada: false })
    setGuardado(true); setTimeout(() => setGuardado(false), 3500)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {TIPOS_EXTRA.map(te => (
          <button key={te.id} onClick={() => setTipo(te.id)}
            style={{ background: tipo === te.id ? C.naranja : '#fff', color: tipo === te.id ? '#fff' : C.carbon, border: `1px solid ${tipo === te.id ? C.naranja : '#DFE4EA'}`, borderRadius: 20, padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            {te.icono}{te.label}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #DFE4EA', borderRadius: 10, padding: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: C.gris }}>Fecha
            <input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }} />
          </label>
          {tipo === 'Semana' && (
            <>
              <label style={{ fontSize: 12, color: C.gris }}>Hora inicio
                <input type="time" value={f.horaInicio} onChange={e => setF({ ...f, horaInicio: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12, color: C.gris }}>Hora término
                <input type="time" value={f.horaFin} onChange={e => setF({ ...f, horaFin: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }} />
              </label>
            </>
          )}
        </div>
        {tipo === 'Semana' && f.horaInicio && f.horaFin && (
          <div style={{ fontSize: 12.5, color: C.carbon, marginBottom: 10 }}>
            {f.horaInicio} a {f.horaFin} horas → <b>{horas} h extra</b> por trabajador seleccionado.
          </div>
        )}

        <div style={{ fontSize: 12, color: C.gris, marginBottom: 6 }}>OT / OC asociada (puedes marcar varias — el costo se reparte en partes iguales entre todas)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {otsDisponibles.map(o => {
            const sel = f.ots.includes(o)
            return (
              <button key={o} onClick={() => toggleOt(o)}
                style={{ background: sel ? C.carbon : '#fff', color: sel ? '#fff' : C.carbon, border: `1px solid ${sel ? C.carbon : '#DFE4EA'}`, borderRadius: 6, padding: '7px 12px', cursor: 'pointer', fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>
                {o}
              </button>
            )
          })}
        </div>
        <input placeholder="U otras OT/OC no listadas (ej: OT 385, OC 5312 — separa con coma)" value={f.otManual} onChange={e => setF({ ...f, otManual: e.target.value })} style={{ ...inp, width: '100%', marginBottom: 10 }} />

        <div style={{ fontSize: 12, color: C.gris, marginBottom: 6 }}>Trabajadores que corresponden (marca todos los que se quedaron)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {(mo.trabajadores || []).map(t => {
            const sel = f.trabajadorIds.includes(t.id)
            return (
              <button key={t.id} onClick={() => toggleTrab(t.id)}
                style={{ background: sel ? C.naranja : '#fff', color: sel ? '#fff' : C.carbon, border: `1px solid ${sel ? C.naranja : '#DFE4EA'}`, borderRadius: 20, padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                {t.nombre}
              </button>
            )
          })}
        </div>

        {(tipo === 'Semana' || tipo === 'TurnoNoche') && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.carbon, marginBottom: 10 }}>
            <input type="checkbox" checked={f.colacion} onChange={e => setF({ ...f, colacion: e.target.checked, colacionTocada: true })} />
            Corresponde colación {tipo === 'Semana' && <span style={{ color: C.gris }}>(sugerido automático: turno pasadas las 19:00 de lunes a jueves, o los viernes pasadas las 14:30 — puedes corregirlo)</span>}
            {tipo === 'TurnoNoche' && <span style={{ color: C.gris }}>(solo tu registro, no afecta el pago del trabajador)</span>}
          </label>
        )}
        {tipo === 'Feriado' && (
          <div style={{ fontSize: 12, color: C.gris, marginBottom: 10 }}>Se paga al 100% (igual que un domingo) y la colación aplica siempre — no requiere marcarla.</div>
        )}

        <label style={{ fontSize: 12, color: C.gris }}>Observación
          <input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }} />
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <button onClick={guardar}
            style={{ background: C.naranja, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', cursor: 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Guardar ({f.trabajadorIds.length})
          </button>
          {guardado && <span style={{ color: C.verde, fontSize: 13 }}>✓ Registro guardado correctamente</span>}
        </div>
        {!esGerencia && <Aviso hijo="El costo de estos extras se calcula internamente y se carga a la OT indicada. Solo Gerencia ve los montos." />}
      </div>
    </div>
  )
}

// ================= LISTA DE REGISTROS =================
function ListaRegistros({ mo, setMo, esGerencia, usuario }) {
  const filas = useMemo(() => (mo.asistencias || []).flatMap(filasDeAsistencia).filter(x => esGerencia || x.supervisor === usuario), [mo, esGerencia, usuario])
  const hexVisibles = mo.horasExtras || []
  const nombreDe = id => (mo.trabajadores || []).find(t => t.id === id)?.nombre || id

  async function borrarAsistencia(regId) {
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_mo') || 'null') } catch (e) {}
    const baseMo = (fresco && fresco.ver === MO_VER) ? fresco : mo
    const nuevo = { ...baseMo, asistencias: (baseMo.asistencias || []).filter(x => x.id !== regId) }
    try { localStorage.setItem('serein_mo', JSON.stringify(nuevo)) } catch (e) {}
    setMo(nuevo)
    pushState()
  }

  async function borrarHorasExtras(id) {
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_mo') || 'null') } catch (e) {}
    const baseMo = (fresco && fresco.ver === MO_VER) ? fresco : mo
    const nuevo = { ...baseMo, horasExtras: (baseMo.horasExtras || []).filter(x => x.id !== id) }
    try { localStorage.setItem('serein_mo', JSON.stringify(nuevo)) } catch (e) {}
    setMo(nuevo)
    pushState()
  }

  return (
    <div>
      <div style={{ background: '#fff', border: '1px solid #DFE4EA', borderRadius: 10, padding: 18, marginBottom: 14 }}>
        <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Asistencias registradas</div>
        {filas.length === 0 ? <div style={{ fontSize: 13, color: '#9AA3AD' }}>Sin registros aún.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                  {['Fecha', 'Trabajador', 'Estado', 'Hora / Atraso', 'OT/OC', esGerencia ? 'Costo' : null, ''].filter(x => x !== null).map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((a, i) => (
                  <tr key={a.regId + '-' + a.trabajadorId + '-' + i} style={{ borderBottom: '1px solid #DFE4EA', verticalAlign: 'top' }}>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{a.fecha}</td>
                    <td style={{ padding: '8px' }}>{nombreDe(a.trabajadorId)}</td>
                    <td style={{ padding: '8px' }}><span style={{ color: TIPO_COLOR[a.tipo] || C.carbon, fontWeight: 600, fontSize: 12 }}>{a.tipo}</span></td>
                    <td style={{ padding: '8px', fontSize: 12 }}>{a.tipo === 'Trabajó' ? (a.horaLlegada || '—') : '—'}{a.tipo === 'Trabajó' && a.horaSalida ? ` – ${a.horaSalida}` : ''}{a.atrasoMin > 0 && <span style={{ color: C.rojo }}> · {a.atrasoMin} min atraso</span>}{a.salidaAnticipadaMin > 0 && <span style={{ color: C.rojo }}> · salió {a.salidaAnticipadaMin} min antes</span>}</td>
                    <td style={{ padding: '8px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{a.ots.join(', ')}</td>
                    {esGerencia && <td style={{ padding: '8px', fontWeight: 600 }}>{clp(a.pago)}{a.descuento > 0 && <div style={{ fontSize: 11, color: C.rojo, fontWeight: 400 }}>−{clp(a.descuento)}</div>}</td>}
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      {esGerencia && <button onClick={() => window.confirm('¿Eliminar este registro de asistencia?') && borrarAsistencia(a.regId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #DFE4EA', borderRadius: 10, padding: 18 }}>
        <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Extras registrados (horas semana / feriados / turno noche)</div>
        {hexVisibles.length === 0 ? <div style={{ fontSize: 13, color: '#9AA3AD' }}>Sin extras.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                  {['Fecha', 'Tipo', 'Trabajador', 'Horas', 'OT/OC', esGerencia ? 'Costo' : null, esGerencia ? 'Colación' : null, ''].filter(x => x !== null).map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hexVisibles.map(h => (
                  <tr key={h.id} style={{ borderBottom: '1px solid #DFE4EA' }}>
                    <td style={{ padding: '8px' }}>{h.fecha}</td>
                    <td style={{ padding: '8px' }}>{TIPOS_EXTRA.find(x => x.id === (h.tipo || 'Semana'))?.label || 'Horas extra semana'}</td>
                    <td style={{ padding: '8px' }}>{nombreDe(h.trabajadorId)}</td>
                    <td style={{ padding: '8px' }}>{h.horas ? h.horas + ' h' : '—'}</td>
                    <td style={{ padding: '8px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{otsDeExtra(h).join(', ')}</td>
                    {esGerencia && <td style={{ padding: '8px', fontWeight: 600 }}>{clp(h.costo.total)}</td>}
                    {esGerencia && <td style={{ padding: '8px', fontSize: 12, color: C.gris }}>{h.costo.colacion > 0 ? clp(h.costo.colacion) : '—'}</td>}
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      {esGerencia && <button onClick={() => window.confirm('¿Eliminar este extra?') && borrarHorasExtras(h.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ================= TRABAJADORES (VISTA SUPERVISOR, SIN VALORES) =================
function TrabajadoresView({ mo }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #DFE4EA', borderRadius: 10, padding: 18 }}>
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
    ;(mo.asistencias || []).forEach(a => Object.entries((a.costo && a.costo.porOT) || {}).forEach(([ot, monto]) => {
      m[ot] = m[ot] || { normal: 0, hex: 0, fechas: new Set(), trabajadores: new Set() }
      m[ot].normal += monto
      m[ot].fechas.add(a.fecha)
      ;(a.trabajadorIds || (a.trabajadorId ? [a.trabajadorId] : [])).forEach(t => m[ot].trabajadores.add(t))
    }))
    ;(mo.horasExtras || []).forEach(h => {
      const porOT = (h.costo && h.costo.porOT) || {}
      const ots = Object.keys(porOT).length ? Object.keys(porOT) : otsDeExtra(h)
      ots.forEach(ot => {
        m[ot] = m[ot] || { normal: 0, hex: 0, fechas: new Set(), trabajadores: new Set() }
        m[ot].hex += porOT[ot] != null ? porOT[ot] : Math.round(((h.costo && h.costo.total) || 0) / ots.length)
        m[ot].fechas.add(h.fecha)
        m[ot].trabajadores.add(h.trabajadorId)
      })
    })
    return m
  }, [mo])
  const nombreDe = id => (mo.trabajadores || []).find(t => t.id === id)?.nombre || id

  return (
    <div style={{ background: '#fff', border: '1px solid #DFE4EA', borderRadius: 10, padding: 18 }}>
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Mano de obra acumulada por OT / OC</div>
      {Object.keys(acumulado).length === 0 ? <div style={{ fontSize: 13, color: '#9AA3AD' }}>Sin costos registrados.</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                {['OT / OC', 'MO normal', 'Extras', 'Total MO', 'Días con registro', 'Trabajadores'].map(h => (
                  <th key={h} style={{ textAlign: h.includes('MO') || h === 'Extras' || h === 'Total MO' ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
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
  // setTrab() se llama por cada tecla al editar nombre/cargo/sueldo/etc. de
  // un trabajador. Antes escribia directo sobre la copia local (sin traer
  // lo mas fresco) y subia al toque — mismo riesgo ya arreglado en OT
  // (protocolos) y Facturas: si dos personas de RRHH editan la nomina casi
  // al mismo tiempo, la segunda escritura pisaba a la primera sin aviso.
  // La UI se actualiza al instante; el guardado real hacia la nube se
  // agrupa por trabajador y se posterga un momento (pull-fresh + merge +
  // push recien cuando la persona deja de escribir), para no disparar un
  // pullState() por cada tecla.
  const pendientesTrab = useRef({})
  const timersTrab = useRef({})
  const setTrab = (id, campo, valor) => {
    const nuevo = { ...mo, trabajadores: (mo.trabajadores || []).map(t => t.id === id ? { ...t, [campo]: valor } : t) }
    try { localStorage.setItem('serein_mo', JSON.stringify(nuevo)) } catch (e) {}
    setMo(nuevo)
    pendientesTrab.current[id] = { ...(pendientesTrab.current[id] || {}), [campo]: valor }
    clearTimeout(timersTrab.current[id])
    timersTrab.current[id] = setTimeout(async () => {
      const acumulados = pendientesTrab.current[id]
      delete pendientesTrab.current[id]
      if (!acumulados) return
      try { await pullState() } catch (e) {}
      let fresco = null
      try { fresco = JSON.parse(localStorage.getItem('serein_mo') || 'null') } catch (e) {}
      const baseMo = (fresco && fresco.ver === MO_VER) ? fresco : mo
      const nuevoMo = { ...baseMo, trabajadores: (baseMo.trabajadores || []).map(t => t.id === id ? { ...t, ...acumulados } : t) }
      try { localStorage.setItem('serein_mo', JSON.stringify(nuevoMo)) } catch (e) {}
      setMo(nuevoMo)
      pushState()
    }, 700)
  }
  const setNum = (id, campo, valor) => setTrab(id, campo, num(valor))
  const setColacion = valor => {
    const nuevo = { ...mo, valorColacion: num(valor) }
    try { localStorage.setItem('serein_mo', JSON.stringify(nuevo)) } catch (e) {}
    setMo(nuevo)
    pushState()
  }
  const addTrab = async grupo => {
    const t = { id: 't' + Date.now(), grupo, nombre: '', cargo: '', nacionalidad: 'Chilena', sueldo: 0, imposiciones: 0, sabado: 0, domingo: 0, turnoNoche: 0, vacacionesDisponibles: 15 }
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_mo') || 'null') } catch (e) {}
    const baseMo = (fresco && fresco.ver === MO_VER) ? fresco : mo
    const nuevo = { ...baseMo, trabajadores: [...(baseMo.trabajadores || []), t] }
    try { localStorage.setItem('serein_mo', JSON.stringify(nuevo)) } catch (e) {}
    setMo(nuevo)
    pushState()
  }
  const delTrab = async id => {
    if (!window.confirm('¿Eliminar este trabajador?')) return
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_mo') || 'null') } catch (e) {}
    const baseMo = (fresco && fresco.ver === MO_VER) ? fresco : mo
    const nuevo = { ...baseMo, trabajadores: (baseMo.trabajadores || []).filter(t => t.id !== id) }
    try { localStorage.setItem('serein_mo', JSON.stringify(nuevo)) } catch (e) {}
    setMo(nuevo)
    pushState()
  }

  const auto = { color: C.gris, background: '#F2F4F7', fontStyle: 'italic', whiteSpace: 'nowrap' }
  const th = t => <th style={{ textAlign: 'left', padding: '5px 6px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{t}</th>

  return (
    <div>
      <div style={{ background: '#fff', border: '1px solid #DFE4EA', borderRadius: 10, padding: 16, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 13, textTransform: 'uppercase' }}>Valor colación</div>
          <div style={{ fontSize: 11.5, color: C.gris, marginTop: 2 }}>Monto fijo que paga la empresa cuando corresponde colación en horas extra, feriados o turno noche. Solo informativo — no se descuenta ni se suma al pago del trabajador.</div>
        </div>
        <input value={mo.valorColacion || ''} onChange={e => setColacion(e.target.value)} placeholder="0" style={{ ...inp, width: 140, textAlign: 'right', fontWeight: 600 }} />
      </div>

      <div style={{ background: '#F2F4F7', border: '1px solid #DFE4EA', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#5A5148', marginBottom: 14 }}>
        Todos los campos en blanco son editables. Las columnas en gris (día bruto, día sin imposiciones, hora, hora extra) se calculan solas:
        <b> día bruto = (sueldo + imposiciones) ÷ 30</b>, <b>día s/imp = sueldo ÷ 30</b>, <b>hora = día bruto ÷ 9</b>, <b>hora extra = hora × 1,5</b>. Sábado, Domingo y Turno noche se ingresan a mano. Feriado trabajado se paga igual que Domingo.
      </div>
      {GRUPOS.map(g => {
        const lista = (mo.trabajadores || []).filter(t => t.grupo === g)
        return (
          <div key={g} style={{ background: '#fff', border: '1px solid #DFE4EA', borderRadius: 10, padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase' }}>{g} <span style={{ color: C.gris, fontWeight: 400 }}>· {lista.length}</span></span>
              <button onClick={() => addTrab(g)} style={{ background: C.carbon, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Agregar trabajador</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                    {th('Nombre')}{th('Cargo')}{th('Nacionalidad')}{th('Sueldo')}{th('Imposiciones')}{th('Día bruto')}{th('Día s/imp')}{th('Hora')}{th('Hora extra')}{th('Sábado')}{th('Domingo')}{th('Turno noche')}{th('Vacaciones (días)')}<th></th>
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
                        <td style={{ padding: '4px 6px' }}><input value={t.turnoNoche || ''} onChange={e => setNum(t.id, 'turnoNoche', e.target.value)} style={{ ...inp, width: 90, textAlign: 'right' }} /></td>
                        <td style={{ padding: '4px 6px' }}><input value={vacacionesDe(t)} onChange={e => setNum(t.id, 'vacacionesDisponibles', e.target.value)} style={{ ...inp, width: 70, textAlign: 'right' }} /></td>
                        <td style={{ padding: '4px 4px', textAlign: 'right' }}><button onClick={() => delTrab(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button></td>
                      </tr>
                    )
                  })}
                  {lista.length === 0 && <tr><td colSpan={14} style={{ padding: 14, textAlign: 'center', color: '#9AA3AD' }}>Sin trabajadores en este grupo. Usa "Agregar trabajador".</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ================= RESUMEN MENSUAL POR TRABAJADOR (GERENCIA) =================
// Reemplaza a la antigua "Pago mensual": ahora el desglose completo pedido
// — faltas/permisos (con su descuento), horas de atraso (con su
// descuento), vacaciones tomadas, licencias, y los adicionales (horas
// extra, feriados, turno noche) — para que al descargar el detalle del mes
// se vea todo lo que hay que descontar o sumar antes de pagar.
function ResumenMensual({ mo }) {
  const [mes, setMes] = useState(hoy().slice(0, 7))
  const [abierto, setAbierto] = useState(null)

  const resumen = useMemo(() => {
    return (mo.trabajadores || []).map(t => {
      const filasMes = (mo.asistencias || []).flatMap(filasDeAsistencia).filter(f => f.trabajadorId === t.id && f.fecha.startsWith(mes))
      const trabajados = filasMes.filter(f => f.tipo === 'Trabajó')
      const faltas = filasMes.filter(f => f.tipo === 'Falta')
      const permisos = filasMes.filter(f => f.tipo === 'Permiso')
      const vacaciones = filasMes.filter(f => f.tipo === 'Vacaciones')
      const licencias = filasMes.filter(f => f.tipo === 'Licencia/Accidente')
      const minutosAtraso = trabajados.reduce((s, f) => s + (f.atrasoMin || 0), 0)
      const descuentoAtraso = trabajados.reduce((s, f) => s + (f.descuentoAtraso || 0), 0)
      const minutosSalidaAnticipada = trabajados.reduce((s, f) => s + (f.salidaAnticipadaMin || 0), 0)
      const descuentoSalidaAnticipada = trabajados.reduce((s, f) => s + (f.descuentoSalida || 0), 0)
      const descuentoFaltas = faltas.reduce((s, f) => s + (f.descuento || 0), 0)
      const descuentoPermisos = permisos.reduce((s, f) => s + (f.descuento || 0), 0)
      const totalDescuentos = descuentoAtraso + descuentoSalidaAnticipada + descuentoFaltas + descuentoPermisos

      const extrasMes = (mo.horasExtras || []).filter(h => h.trabajadorId === t.id && h.fecha.startsWith(mes))
      const hexSemana = extrasMes.filter(h => (h.tipo || 'Semana') === 'Semana')
      const feriados = extrasMes.filter(h => h.tipo === 'Feriado')
      const turnoNoche = extrasMes.filter(h => h.tipo === 'TurnoNoche')
      const pagoHex = hexSemana.reduce((s, h) => s + h.costo.total, 0)
      const pagoFeriados = feriados.reduce((s, h) => s + h.costo.total, 0)
      const pagoTurnoNoche = turnoNoche.reduce((s, h) => s + h.costo.total, 0)
      const totalAdicionales = pagoHex + pagoFeriados + pagoTurnoNoche
      const colacionMes = extrasMes.reduce((s, h) => s + (h.costo.colacion || 0), 0)

      const pagoDiasTrabajados = trabajados.reduce((s, f) => s + f.pago, 0) + vacaciones.reduce((s, f) => s + f.pago, 0)
      const totalNeto = pagoDiasTrabajados + totalAdicionales

      return {
        t, diasTrabajados: trabajados.length, faltas: faltas.length, permisos: permisos.length, vacacionesTomadas: vacaciones.length, licencias: licencias.length,
        minutosAtraso, descuentoAtraso, minutosSalidaAnticipada, descuentoSalidaAnticipada, descuentoFaltas, descuentoPermisos, totalDescuentos,
        horasExtraSemana: hexSemana.reduce((s, h) => s + (h.horas || 0), 0), pagoHex, feriadosTrabajados: feriados.length, pagoFeriados, turnosNoche: turnoNoche.length, pagoTurnoNoche, totalAdicionales,
        colacionMes, pagoDiasTrabajados, totalNeto, saldoVacaciones: vacacionesDe(t),
      }
    })
  }, [mo, mes])

  const totalGeneral = resumen.reduce((s, r) => s + r.totalNeto, 0)
  const totalDescuentosGeneral = resumen.reduce((s, r) => s + r.totalDescuentos, 0)
  const totalColacionGeneral = resumen.reduce((s, r) => s + r.colacionMes, 0)

  function exportarExcel() {
    const filas = resumen.map(r => ({
      Trabajador: r.t.nombre, Cargo: cargoDe(r.t), 'Días trabajados': r.diasTrabajados,
      Faltas: r.faltas, Permisos: r.permisos, 'Minutos de atraso': r.minutosAtraso, 'Minutos salida anticipada': r.minutosSalidaAnticipada,
      'Descuento atraso': r.descuentoAtraso, 'Descuento salida anticipada': r.descuentoSalidaAnticipada, 'Descuento faltas': r.descuentoFaltas, 'Descuento permisos': r.descuentoPermisos, 'Total descuentos': r.totalDescuentos,
      'Días de vacaciones tomados': r.vacacionesTomadas, 'Saldo vacaciones': r.saldoVacaciones, 'Días de licencia': r.licencias,
      'Horas extra semana': r.horasExtraSemana, 'Pago horas extra': r.pagoHex, 'Feriados trabajados': r.feriadosTrabajados, 'Pago feriados': r.pagoFeriados, 'Turnos de noche': r.turnosNoche, 'Pago turno noche': r.pagoTurnoNoche,
      'Colación (informativo, no descuenta)': r.colacionMes, 'Total a pagar (estimado)': r.totalNeto,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Resumen ' + mes)
    XLSX.writeFile(wb, `Resumen_Mensual_${mes}.xlsx`)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <StatCard icon={Table2} color={C.naranja} bg="#FDECDD" valor={clp(totalGeneral)} label="Total estimado a pagar del mes" />
          <StatCard icon={AlertTriangle} color={C.rojo} bg="#FBE4E2" valor={clp(totalDescuentosGeneral)} label="Total descuentos del mes" />
          <StatCard icon={Sun} color={C.azul} bg="#E5F1F3" valor={clp(totalColacionGeneral)} label="Colación del mes (informativo)" />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="month" value={mes} onChange={e => setMes(e.target.value)} style={inp} />
          <button onClick={exportarExcel} style={{ background: C.verde, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><FileSpreadsheet size={15} /> Exportar Excel</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {resumen.map(r => (
          <div key={r.t.id} style={{ background: '#fff', border: '1px solid #DFE4EA', borderRadius: 10, overflow: 'hidden' }}>
            <div onClick={() => setAbierto(abierto === r.t.id ? null : r.t.id)} style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.t.nombre}</div>
                <div style={{ fontSize: 11.5, color: C.gris }}>{cargoDe(r.t)} · {r.diasTrabajados} días trabajados{r.faltas + r.permisos > 0 ? ` · ${r.faltas + r.permisos} inasistencia(s)` : ''}{r.minutosAtraso > 0 ? ` · ${r.minutosAtraso} min de atraso` : ''}{r.minutosSalidaAnticipada > 0 ? ` · ${r.minutosSalidaAnticipada} min de salida anticipada` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                {r.totalDescuentos > 0 && <span style={{ fontSize: 12.5, color: C.rojo, fontWeight: 600 }}>−{clp(r.totalDescuentos)}</span>}
                <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 15, color: C.naranja }}>{clp(r.totalNeto)}</span>
              </div>
            </div>
            {abierto === r.t.id && (
              <div style={{ padding: '0 16px 16px', borderTop: '1px solid #F2F0EB', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 14, fontSize: 12.5 }}>
                <div style={{ paddingTop: 12 }}>
                  <div style={{ fontWeight: 700, color: C.rojo, marginBottom: 4, textTransform: 'uppercase', fontSize: 11 }}>Descuentos</div>
                  <div>Faltas: {r.faltas} día(s) — {clp(r.descuentoFaltas)}</div>
                  <div>Permisos: {r.permisos} día(s) — {clp(r.descuentoPermisos)}</div>
                  <div>Atraso: {r.minutosAtraso} min — {clp(r.descuentoAtraso)}</div>
                  <div>Salida anticipada: {r.minutosSalidaAnticipada} min — {clp(r.descuentoSalidaAnticipada)}</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>Total descuentos: {clp(r.totalDescuentos)}</div>
                </div>
                <div style={{ paddingTop: 12 }}>
                  <div style={{ fontWeight: 700, color: C.azul, marginBottom: 4, textTransform: 'uppercase', fontSize: 11 }}>Sin descuento (informativo)</div>
                  <div>Vacaciones tomadas: {r.vacacionesTomadas} día(s) — se paga</div>
                  <div>Saldo de vacaciones: {r.saldoVacaciones} día(s)</div>
                  <div>Licencia/accidente: {r.licencias} día(s) — no lo paga la empresa</div>
                </div>
                <div style={{ paddingTop: 12 }}>
                  <div style={{ fontWeight: 700, color: C.verde, marginBottom: 4, textTransform: 'uppercase', fontSize: 11 }}>Adicionales</div>
                  <div>Horas extra: {r.horasExtraSemana} h — {clp(r.pagoHex)}</div>
                  <div>Feriados trabajados: {r.feriadosTrabajados} — {clp(r.pagoFeriados)}</div>
                  <div>Turnos de noche: {r.turnosNoche} — {clp(r.pagoTurnoNoche)}</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>Total adicionales: {clp(r.totalAdicionales)}</div>
                </div>
                <div style={{ paddingTop: 12 }}>
                  <div style={{ fontWeight: 700, color: C.gris, marginBottom: 4, textTransform: 'uppercase', fontSize: 11 }}>Colación (no afecta el pago)</div>
                  <div>Gasto de colación del mes: {clp(r.colacionMes)}</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <Aviso hijo="El total a pagar es una estimación: suma los días trabajados (con descuento de atraso), vacaciones, y los adicionales del mes. No incluye imposiciones ni otros descuentos legales." />
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
        'Valor sábado': c.sabado, 'Valor domingo': c.domingo, 'Valor turno noche': c.turnoNoche,
      }
    })

    const filasPeriodo = (mo.asistencias || []).flatMap(filasDeAsistencia).filter(f => f.fecha >= desde && f.fecha <= hasta && idSet.has(f.trabajadorId))
    const detalle = filasPeriodo.map(f => ({
      Fecha: f.fecha, Trabajador: nombreDe(f.trabajadorId), Estado: f.tipo, 'Hora llegada': f.horaLlegada || '', 'Minutos atraso': f.atrasoMin,
      'Hora salida': f.horaSalida || '', 'Minutos salida anticipada': f.salidaAnticipadaMin,
      'OT/OC': f.ots.join(', '), 'Descuento': f.descuento, 'Pago': f.pago, Supervisor: f.supervisor, Observación: f.obs || '',
    }))

    const hexRows = (mo.horasExtras || []).filter(h => h.fecha >= desde && h.fecha <= hasta && idSet.has(h.trabajadorId)).map(h => ({
      Fecha: h.fecha, Tipo: h.tipo || 'Semana', Trabajador: nombreDe(h.trabajadorId), Horas: h.horas || '', 'OT/OC': otsDeExtra(h).join(', '),
      'Costo total': h.costo.total, Colación: h.costo.colacion || 0, Observación: h.obs || '',
    }))

    const resumen = trabsSel.map(t => {
      const f = filasPeriodo.filter(x => x.trabajadorId === t.id)
      const trabajados = f.filter(x => x.tipo === 'Trabajó')
      const inasistencias = f.filter(x => x.tipo === 'Falta' || x.tipo === 'Permiso')
      const hx = (mo.horasExtras || []).filter(h => h.fecha >= desde && h.fecha <= hasta && h.trabajadorId === t.id)
      const pagoDias = f.reduce((s, x) => s + x.pago, 0)
      const pagoHex = hx.reduce((s, h) => s + h.costo.total, 0)
      return {
        Grupo: t.grupo, Trabajador: t.nombre, Cargo: cargoDe(t),
        'Días trabajados': trabajados.length, Inasistencias: inasistencias.length, 'Horas extras': hx.reduce((s, h) => s + (h.horas || 0), 0),
        'Pago días': pagoDias, 'Pago extras': pagoHex, 'Total período': pagoDias + pagoHex,
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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hexRows.length ? hexRows : [{ Nota: 'Sin extras en el período' }]), 'Extras')
    XLSX.writeFile(wb, `Informe_Asistencia_${tipo}_${desde}.xlsx`)
  }

  function descargarPDF() {
    if (trabsSel.length === 0) { alert('Selecciona al menos un trabajador y un área.'); return }
    const { nomina, resumen } = construirDatos()
    const money = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
    const filasNom = nomina.map(r => `<tr><td>${r.Grupo}</td><td>${r.Nombre}</td><td>${r.Cargo}</td><td style="text-align:right">${money(r.Sueldo)}</td><td style="text-align:right">${money(r.Imposiciones)}</td><td style="text-align:right">${money(r['Valor día bruto'])}</td><td style="text-align:right">${money(r['Valor día s/imp'])}</td><td style="text-align:right">${money(r['Valor hora'])}</td><td style="text-align:right">${money(r['Valor hora extra'])}</td><td style="text-align:right">${money(r['Valor sábado'])}</td><td style="text-align:right">${money(r['Valor domingo'])}</td></tr>`).join('')
    const filasRes = resumen.map(r => `<tr><td>${r.Trabajador}</td><td>${r.Cargo}</td><td style="text-align:right">${r['Días trabajados']}</td><td style="text-align:right">${r.Inasistencias}</td><td style="text-align:right">${r['Horas extras']}</td><td style="text-align:right">${money(r['Pago días'])}</td><td style="text-align:right">${money(r['Pago extras'])}</td><td style="text-align:right"><b>${money(r['Total período'])}</b></td></tr>`).join('')
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
      <table><thead><tr><th>Trabajador</th><th>Cargo</th><th>Días trab.</th><th>Inasist.</th><th>Hrs. extra</th><th>Pago días</th><th>Pago extras</th><th>Total</th></tr></thead><tbody>${filasRes || '<tr><td colspan="8">Sin asistencias en el período</td></tr>'}</tbody></table>
      <div class="tot">Total del período: ${money(totalPeriodo)}</div>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`
    const w = window.open('', '_blank')
    if (!w) { alert('Permite las ventanas emergentes para descargar el PDF.'); return }
    w.document.open(); w.document.write(html); w.document.close()
  }

  const btnP = activo => ({ background: activo ? C.carbon : '#fff', color: activo ? '#fff' : C.carbon, border: '1px solid #CBD2D6', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 })

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', borderRadius: 10, padding: 18 }}>
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, padding: 10, background: '#FAF7F3', borderRadius: 8 }}>
          {trabsDeGrupos.length === 0 && <span style={{ fontSize: 12, color: C.gris }}>No hay trabajadores en las áreas elegidas.</span>}
          {trabsDeGrupos.map(t => {
            const on = sel.includes(t.id)
            return <button key={t.id} onClick={() => toggle(sel, t.id, setSel)} style={{ background: on ? C.naranja : '#fff', color: on ? '#fff' : C.carbon, border: `1px solid ${on ? C.naranja : '#CBD2D6'}`, borderRadius: 20, padding: '5px 10px', cursor: 'pointer', fontSize: 12.5 }}>{t.nombre}</button>
          })}
        </div>
      )}
      <div style={{ fontSize: 12, color: C.gris, marginBottom: 14 }}>{trabsSel.length} trabajador(es) en el informe.</div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={descargarExcel} style={{ background: C.verde, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileSpreadsheet size={16} /> Descargar Excel
        </button>
        <button onClick={descargarPDF} style={{ background: C.carbon, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
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
    { id: 'hex', label: 'Extras', icono: <Clock3 size={13} /> },
    { id: 'lista', label: 'Todos los registros', icono: <Users size={13} /> },
    { id: 'resumen', label: 'Resumen mensual', icono: <Table2 size={13} /> },
    { id: 'costos', label: 'Costos por OT', icono: <Wallet size={13} /> },
    { id: 'nomina', label: 'Nómina / Valores', icono: <Table2 size={13} /> },
    { id: 'informes', label: 'Informes', icono: <Download size={13} /> },
  ] : [
    { id: 'registro', label: 'Registro diario', icono: <CalendarDays size={13} /> },
    { id: 'hex', label: 'Extras', icono: <Clock3 size={13} /> },
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
      {tab === 'resumen' && esGerencia && <ResumenMensual mo={mo} />}
      {tab === 'nomina' && esGerencia && <NominaMO mo={mo} setMo={setMo} />}
      {tab === 'informes' && esGerencia && <Informes mo={mo} />}
    </div>
  )
}
