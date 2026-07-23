import React, { useState, useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { cargarProyParams } from './ProyParametros.jsx'

// ============================================================
// Cotizacion de PROYECTO por centros de costo (independiente del
// cotizador de granallado). Arma el proyecto sumando centros de costo
// (neto + afecto/exento -> bruto), aplica margen (modo A % sobre costo /
// modo B venta fija) y guarda un borrador en 'serein_proyCotizaciones'
// (se sincroniza con la nube). No toca los datos de los proyectos-OT.
// ============================================================

import { SEREIN } from './theme-serein.js'
// Paleta reskineada a la identidad Serein 2026 — mismas claves, solo cambian los valores hex.
const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const inp = { padding: '7px 9px', border: '1px solid #DFE4EA', fontSize: 13, boxSizing: 'border-box' }
const clp = n => '$' + Math.round(+n || 0).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const LS_KEY = 'serein_proyCotizaciones'

function cargarCots() { try { const s = localStorage.getItem(LS_KEY); if (s) { const o = JSON.parse(s); if (Array.isArray(o)) return o } } catch (e) {} return [] }
function guardarCots(a) { try { localStorage.setItem(LS_KEY, JSON.stringify(a)) } catch (e) {} }
const brutoDe = c => c.condicionIVA === 'exento' ? num(c.neto) : Math.round(num(c.neto) * 1.19)

export default function ProyCotizador({ clientes = [], proyectos = [], setProyectos = null }) {
  const params = useMemo(cargarProyParams, [])
  const catalogo = params.centros || []
  const [cots, setCots] = useState(cargarCots)
  const [cliente, setCliente] = useState('')
  const [nombre, setNombre] = useState('')
  const [centros, setCentros] = useState([])
  const [modo, setModo] = useState('pct')
  const [margenPct, setMargenPct] = useState(params.margenDefault || 33)
  const [ventaFija, setVentaFija] = useState('')
  const [msg, setMsg] = useState('')
  const [aprobando, setAprobando] = useState(null)
  const [fEntrega, setFEntrega] = useState('')
  const [fResp, setFResp] = useState('')
  const siguienteNumero = useMemo(() => { const nums = (cots || []).map(c => parseInt(String(c.numero || '').split('-')[0].replace(/\D/g, ''), 10)).filter(n => !isNaN(n)); return (Math.max(1009, ...nums) + 1) + '-2026' }, [cots])

  const setCentro = (i, k, v) => setCentros(prev => prev.map((c, j) => j === i ? { ...c, [k]: v } : c))
  const addCentroVacio = () => setCentros(prev => [...prev, { codigo: 'C' + (prev.length + 1), nombre: '', neto: '', condicionIVA: 'afecto' }])
  const addCentroCat = cod => { const cc = catalogo.find(x => x.codigo === cod); if (!cc) return; setCentros(prev => [...prev, { codigo: cc.codigo, nombre: cc.nombre, neto: '', condicionIVA: cc.condicionIVA || 'afecto' }]) }
  const delCentro = i => setCentros(prev => prev.filter((_, j) => j !== i))

  const costoNeto = centros.reduce((a, c) => a + num(c.neto), 0)
  const costoBruto = centros.reduce((a, c) => a + brutoDe(c), 0)
  const _m = Math.min(Math.max(num(margenPct) || 0, 0), 95) / 100
  const ventaNeta = modo === 'pct' ? ((1 - _m) > 0 ? Math.round(costoNeto / (1 - _m)) : costoNeto) : num(ventaFija)
  const ventaBruta = Math.round(ventaNeta * 1.19)
  const utilidad = ventaNeta - costoNeto
  const margenSobreCosto = costoNeto > 0 ? (utilidad / costoNeto) * 100 : 0
  const margenSobreVenta = ventaNeta > 0 ? (utilidad / ventaNeta) * 100 : 0

  // Sugerencia de margen segun tamano (informativa)
  const sugerido = (() => { const t = (params.margenPorTamano || []).find(x => !x.hasta || costoNeto <= x.hasta); return t ? t.margen : (params.margenDefault || 33) })()

  function guardar() {
    if (!cliente.trim()) { setMsg('Escribe el cliente.'); return }
    if (centros.length === 0 || costoNeto <= 0) { setMsg('Agrega al menos un centro de costo con monto.'); return }
    const cot = {
      id: 'pcot' + Date.now(),
      numero: siguienteNumero,
      cliente: cliente.trim(), nombreProyecto: nombre.trim(),
      estado: 'borrador', fecha: new Date().toISOString().slice(0, 10),
      modoMargen: modo, margenPct: num(margenPct), ventaNetaFijada: modo === 'ventaFija' ? num(ventaFija) : null,
      centros: centros.map(c => ({ codigo: (c.codigo || '').trim().toUpperCase(), nombre: (c.nombre || '').trim(), neto: num(c.neto), condicionIVA: c.condicionIVA === 'exento' ? 'exento' : 'afecto', bruto: brutoDe(c) })),
      costoNeto, costoBruto, ventaNeta, ventaBruta, utilidad,
      margenSobreCosto: Math.round(margenSobreCosto * 10) / 10, margenSobreVenta: Math.round(margenSobreVenta * 10) / 10,
      snapshot: null,
    }
    const next = [cot, ...cots]
    setCots(next); guardarCots(next)
    setCliente(''); setNombre(''); setCentros([]); setVentaFija(''); setModo('pct'); setMargenPct(params.margenDefault || 33)
    setMsg('Borrador guardado: ' + cot.numero)
    setTimeout(() => setMsg(''), 3000)
  }

  function borrar(id) { if (!window.confirm('¿Eliminar este borrador de cotizacion?')) return; const next = cots.filter(c => c.id !== id); setCots(next); guardarCots(next) }

  function aprobar(c) {
    if (!setProyectos) { setMsg('No se pudo generar la OT (falta conexion con Proyectos).'); return }
    const q = 'T' + (Math.floor(new Date().getMonth() / 3) + 1)
    const nueva = {
      id: 'otp' + Date.now(), ot: c.numero, oc: c.numero, periodo: q,
      nombre: (c.nombreProyecto ? c.nombreProyecto + ' · ' : '') + c.cliente, cliente: c.cliente, m2: null,
      venta_cotizada: c.ventaNeta, avance: 0, cc: {}, ccNombres: {}, edps: [], compras: [],
      origen: 'cotizador-proyecto', fechaEntrega: fEntrega || '', responsable: fResp || '',
      snapshotProy: { centros: c.centros, costoNeto: c.costoNeto, costoBruto: c.costoBruto, ventaNeta: c.ventaNeta, ventaBruta: c.ventaBruta, utilidad: c.utilidad, margenPct: c.margenPct, modoMargen: c.modoMargen, fecha: new Date().toISOString().slice(0, 10) },
    }
    ;(c.centros || []).forEach((cc, i) => { const key = (cc.codigo || '').trim() || ('C' + (i + 1)); nueva.cc[key] = cc.neto; nueva.ccNombres[key] = cc.nombre || key })
    setProyectos(prev => [nueva, ...(prev || [])])
    const next = cots.map(x => x.id === c.id ? { ...x, estado: 'aprobada', otId: nueva.id, snapshot: nueva.snapshotProy } : x)
    setCots(next); guardarCots(next)
    setAprobando(null); setFEntrega(''); setFResp('')
    setMsg('Aprobada: se genero la OT de proyecto ' + c.numero + ' (revisala en la pestana Tarjetas).')
    setTimeout(() => setMsg(''), 4500)
  }

  const card = { background: '#fff', border: '1px solid #DFE4EA', padding: 16, marginBottom: 16 }
  const h = { fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 4 }
  const lab = { fontSize: 11, color: C.gris, display: 'flex', flexDirection: 'column', gap: 3 }
  const nombresCli = [...new Set((clientes || []).map(c => (c && c.nombre) ? c.nombre : (typeof c === 'string' ? c : '')).filter(Boolean))]

  return (
    <div>
      <div style={card}>
        <div style={h}>Nueva cotizacion de proyecto (por centros de costo)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <label style={lab}>Cliente *
            <input list="dl-proy-cli" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Escribe / elige del listado" style={inp} />
            <datalist id="dl-proy-cli">{nombresCli.map(n => <option key={n} value={n} />)}</datalist>
          </label>
          <label style={lab}>Nombre del proyecto
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Correas transportadoras" style={inp} />
          </label>
          <label style={lab}>N° (automatico)
            <input value={siguienteNumero} readOnly style={{ ...inp, background: '#E2E7EC', fontWeight: 600 }} />
          </label>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <div style={h}>Centros de costo</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select onChange={e => { addCentroCat(e.target.value); e.target.value = '' }} style={{ ...inp, fontSize: 12 }}>
              <option value="">+ Desde catalogo...</option>
              {catalogo.map(cc => <option key={cc.codigo} value={cc.codigo}>{cc.codigo} · {cc.nombre}</option>)}
            </select>
            <button onClick={addCentroVacio} style={{ background: 'none', border: '1px dashed #DFE4EA', padding: '6px 12px', cursor: 'pointer', fontSize: 12.5, color: C.gris, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Nuevo centro</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['Codigo', 'Nombre', 'Neto', 'Condicion', 'Bruto', ''].map((t, i) => <th key={i} style={{ textAlign: ['Neto', 'Bruto'].includes(t) ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{t}</th>)}</tr></thead>
            <tbody>
              {centros.map((c, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #DFE4EA' }}>
                  <td style={{ padding: '4px 8px' }}><input value={c.codigo} onChange={e => setCentro(i, 'codigo', e.target.value)} placeholder="A1" style={{ ...inp, width: 60 }} /></td>
                  <td style={{ padding: '4px 8px' }}><input value={c.nombre} onChange={e => setCentro(i, 'nombre', e.target.value)} placeholder="PINTURA, MONTAJE, COMETA..." style={{ ...inp, width: 220 }} /></td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}><input value={c.neto} onChange={e => setCentro(i, 'neto', e.target.value)} placeholder="0" style={{ ...inp, width: 120, textAlign: 'right' }} /></td>
                  <td style={{ padding: '4px 8px' }}>
                    <select value={c.condicionIVA} onChange={e => setCentro(i, 'condicionIVA', e.target.value)} style={{ ...inp }}>
                      <option value="afecto">Afecto (19%)</option>
                      <option value="exento">Exento</option>
                    </select>
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: C.gris }}>{clp(brutoDe(c))}</td>
                  <td style={{ padding: '4px 4px', textAlign: 'right' }}><button onClick={() => delCentro(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={15} /></button></td>
                </tr>
              ))}
              {centros.length === 0 && <tr><td colSpan={6} style={{ padding: 12, textAlign: 'center', color: '#9AA3AD' }}>Agrega centros de costo desde el catalogo o crea nuevos.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
          <span>Costo total neto: <b>{clp(costoNeto)}</b></span>
          <span>Costo total bruto (con IVA mixto): <b>{clp(costoBruto)}</b></span>
        </div>
      </div>

      <div style={card}>
        <div style={h}>Margen y venta</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <button onClick={() => setModo('pct')} style={{ background: modo === 'pct' ? C.azul : '#fff', color: modo === 'pct' ? '#fff' : C.carbon, border: '1px solid ' + (modo === 'pct' ? C.azul : '#DFE4EA'), padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Modo A: % de margen sobre la venta</button>
          <button onClick={() => setModo('ventaFija')} style={{ background: modo === 'ventaFija' ? C.azul : '#fff', color: modo === 'ventaFija' ? '#fff' : C.carbon, border: '1px solid ' + (modo === 'ventaFija' ? C.azul : '#DFE4EA'), padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Modo B: fijar la venta</button>
        </div>
        {modo === 'pct' ? (
          <label style={{ fontSize: 12, color: C.gris }}>Margen sobre la venta (%)
            <input value={margenPct} onChange={e => setMargenPct(e.target.value)} style={{ ...inp, width: 90, marginLeft: 8, textAlign: 'right' }} />
            <span style={{ marginLeft: 10, color: C.teal }}>Sugerido por tamano: <b>{sugerido}%</b></span>
          </label>
        ) : (
          <label style={{ fontSize: 12, color: C.gris }}>Venta neta fijada (CLP)
            <input value={ventaFija} onChange={e => setVentaFija(e.target.value)} placeholder="0" style={{ ...inp, width: 150, marginLeft: 8, textAlign: 'right' }} />
          </label>
        )}
        <div style={{ marginTop: 12, padding: '12px 14px', background: '#F2F4F7', display: 'flex', gap: 26, flexWrap: 'wrap', fontSize: 13 }}>
          <span>Venta neta: <b style={{ color: C.azul }}>{clp(ventaNeta)}</b></span>
          <span>Venta bruta (IVA 19%): <b>{clp(ventaBruta)}</b></span>
          <span>Utilidad: <b style={{ color: utilidad >= 0 ? C.verde : C.rojo }}>{clp(utilidad)}</b></span>
          <span>Margen sobre costo: <b>{margenSobreCosto.toFixed(1)}%</b></span>
          <span>Margen sobre venta: <b>{margenSobreVenta.toFixed(1)}%</b></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <button onClick={guardar} style={{ background: C.verde, color: '#fff', border: 'none', padding: '9px 18px', cursor: 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, textTransform: 'uppercase' }}>Guardar borrador</button>
          {msg && <span style={{ color: msg.startsWith('Borrador') ? C.verde : C.rojo, fontSize: 13, fontWeight: 600 }}>{msg}</span>}
        </div>
      </div>

      <div style={card}>
        <div style={h}>Cotizaciones de proyecto (borradores)</div>
        {aprobando && (() => { const c = cots.find(x => x.id === aprobando); if (!c) return null; return (
          <div style={{ background: '#E7EFFB', border: '1px solid ' + C.azul, borderRadius: 6, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Aprobar {c.numero} — se congela el presupuesto por centro de costo y se genera la OT de proyecto.</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ fontSize: 11, color: C.gris, display: 'flex', flexDirection: 'column', gap: 3 }}>Fecha de entrega<input type="date" value={fEntrega} onChange={e => setFEntrega(e.target.value)} style={inp} /></label>
              <label style={{ fontSize: 11, color: C.gris, display: 'flex', flexDirection: 'column', gap: 3 }}>Responsable<input value={fResp} onChange={e => setFResp(e.target.value)} placeholder="Nombre" style={inp} /></label>
              <button onClick={() => aprobar(c)} style={{ background: C.verde, color: '#fff', border: 'none', padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Confirmar aprobacion y crear OT</button>
              <button onClick={() => setAprobando(null)} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            </div>
          </div>
        ) })()}
        {cots.length === 0 ? (
          <div style={{ fontSize: 13, color: C.gris }}>Aun no hay cotizaciones de proyecto guardadas.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['N°', 'Cliente', 'Proyecto', 'Costo neto', 'Venta neta', 'Margen s/venta', 'Estado', ''].map((t, i) => <th key={i} style={{ textAlign: ['Costo neto', 'Venta neta', 'Margen s/venta'].includes(t) ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{t}</th>)}</tr></thead>
              <tbody>
                {cots.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #DFE4EA' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{c.numero}</td>
                    <td style={{ padding: '6px 8px' }}>{c.cliente}</td>
                    <td style={{ padding: '6px 8px', color: C.gris }}>{c.nombreProyecto || '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{clp(c.costoNeto)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{clp(c.ventaNeta)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: C.verde }}>{(c.margenSobreVenta != null ? c.margenSobreVenta : 0)}%</td>
                    <td style={{ padding: '6px 8px', color: C.gris }}>{c.estado}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {c.estado === 'borrador' ? <button onClick={() => { setAprobando(c.id); setFEntrega(''); setFResp('') }} style={{ background: C.verde, color: '#fff', border: 'none', padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>Aprobar</button> : <span style={{ fontSize: 11.5, color: C.teal, marginRight: 6 }}>OT creada</span>}
                      <button onClick={() => borrar(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: 11.5, color: '#9AA3AD', marginTop: 8 }}>Al aprobar, la OT de proyecto aparece en la pestana Tarjetas con su presupuesto por centro de costo (congelado). Las compras se imputan alli.</div>
      </div>
    </div>
  )
}
