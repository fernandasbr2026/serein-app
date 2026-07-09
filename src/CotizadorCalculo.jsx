import { useState, useMemo } from 'react'
import { COTIZADOR_SEED, indexProductos, desgloseItem, precioM2 } from './cotizador-data.js'
import { THEME } from './ui.jsx'
import { Plus, Trash2, ChevronLeft } from 'lucide-react'

const LS_KEY = 'cotizador_params_v1'
function cargarParams() { try { const s = localStorage.getItem(LS_KEY); if (s) { const o = JSON.parse(s); if (o && o.productos) return o } } catch (e) {} return JSON.parse(JSON.stringify(COTIZADOR_SEED)) }
const T = THEME
const clp = n => '$' + Math.round(+n || 0).toLocaleString('es-CL')
function nuevoItem() { return { desc: '', ral: '', m2: 0, grado: 'SP-10 (near-white)', dif: 'A - Estandar', esquemaNombre: '' } }
function proximoNumero(cots) { let mx = 792; (cots || []).forEach(c => { const s = (c.numero || c.folio || '') + ''; const m = s.match(/(\d+)/); if (m) mx = Math.max(mx, +m[1]) }); return 'Cot-' + (mx + 1) }

export default function CotizadorCalculo({ clientes = [], onAddCliente = () => {}, cotizaciones = [], setCotizaciones = () => {}, onVolver = () => {} }) {
  const P = useMemo(cargarParams, [])
  const idx = useMemo(() => indexProductos(P.productos), [P])
  const [sede, setSede] = useState('Santa Rosa')
  const [cliente, setCliente] = useState('')
  const [items, setItems] = useState([nuevoItem()])
  const [pct, setPct] = useState(100)
  const [sg, setSg] = useState(3380000)
  const [sp, setSp] = useState(2700000)
  const [guardado, setGuardado] = useState('')

  const sedeP = P.sedes[sede] || {}
  const totalFijos = sedeP.totalFijosFallback || 18000000
  const ctx = { sede: sedeP, constantes: P.constantes, prodPorNombre: idx, sueldosGranallado: +sg, sueldosPintores: +sp, sueldosProduccion: (+sg) + (+sp), totalFijosSede: totalFijos }

  function updItem(i, fn) { setItems(prev => { const n = prev.map(x => ({ ...x })); fn(n[i]); return n }) }
  function capasDe(it) { const e = P.esquemas.find(x => x.n === it.esquemaNombre); return e ? e.capas : [] }
  function dg(it) { const g = P.grados.find(x => x.grado === it.grado); const f = P.factores.find(x => x.nivel === it.dif); return desgloseItem({ esquema: { capas: capasDe(it) }, factorGrado: g ? g.factor : 1, factorDif: f ? f.factor : 1 }, ctx) }
  const totalCot = items.reduce((s, it) => s + precioM2(dg(it).costoM2, pct) * (+it.m2 || 0), 0)

  function guardar() {
    const numero = proximoNumero(cotizaciones)
    const cot = { numero, folio: numero, tipo: 'calculo', origen: 'cotizador', estado: 'Cotizada', cliente, sede, fecha: new Date().toISOString().slice(0, 10), porcentajeGanancia: +pct,
      items: items.map(it => { const d = dg(it); const pm = precioM2(d.costoM2, pct); return { descripcion: it.desc, ral: it.ral, m2: +it.m2 || 0, gradoSSPC: it.grado, factorDificultad: it.dif, esquema: it.esquemaNombre, capas: capasDe(it), costoM2: Math.round(d.costoM2), precioM2: Math.round(pm), total: Math.round(pm * (+it.m2 || 0)) } }),
      total: Math.round(totalCot), montoCotizado: Math.round(totalCot), supuestos: { sueldosGranallado: +sg, sueldosPintores: +sp, totalFijos } }
    setCotizaciones([...(cotizaciones || []), cot]); setGuardado('Borrador ' + numero + ' guardado en Cotizaciones.')
  }

  const card = { background: '#fff', border: '1px solid ' + T.border, borderRadius: 12, boxShadow: T.shadow, padding: 16, marginBottom: 16 }
  const inp = { border: '1px solid ' + T.border, borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: T.font, boxSizing: 'border-box' }
  const lab = { fontSize: 11.5, color: T.textMute, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 4 }
  const btnP = { background: T.orange, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 15px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }
  const pill = a => ({ background: a ? T.navy : '#fff', color: a ? '#fff' : T.textSoft, border: '1px solid ' + (a ? T.navy : T.border), borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 })
  const dgRow = (l, v) => <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: T.textSoft, padding: '1px 0' }}><span>{l}</span><span>{clp(v)}</span></div>

  return (<div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <button onClick={onVolver} style={{ background: 'transparent', border: '1px solid ' + T.border, borderRadius: 8, padding: '7px 11px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.textSoft }}><ChevronLeft size={15} /> Volver</button>
      <h3 style={{ margin: 0, fontFamily: "'Oswald',sans-serif", fontSize: 18, fontWeight: 600, color: T.navy, textTransform: 'uppercase' }}>Nueva cotizacion por calculo</h3>
    </div>
    <div style={card}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div><span style={lab}>Cliente</span>
          <select value={cliente} onChange={e => setCliente(e.target.value)} style={{ ...inp, width: '100%' }}>
            <option value="">- seleccionar -</option>
            {clientes.map((c, i) => <option key={i} value={c.nombre || c}>{c.nombre || c}</option>)}
          </select>
        </div>
        <div><span style={lab}>Sede</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setSede('Santa Rosa')} style={pill(sede === 'Santa Rosa')}>Santa Rosa</button>
            <button onClick={() => setSede('Istria')} style={pill(sede === 'Istria')}>Istria</button>
          </div>
        </div>
      </div>
    </div>
    {items.map((it, i) => { const d = dg(it); const pm = precioM2(d.costoM2, pct); return (
      <div key={i} style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 600, color: T.navy }}>Item {i + 1}</div>
          {items.length > 1 && <button onClick={() => setItems(items.filter((_, k) => k !== i))} style={{ background: 'transparent', border: 'none', color: T.danger, cursor: 'pointer' }}><Trash2 size={16} /></button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
          <div><span style={lab}>Descripcion</span><input value={it.desc} onChange={e => updItem(i, x => x.desc = e.target.value)} style={{ ...inp, width: '100%' }} /></div>
          <div><span style={lab}>RAL / Color</span><input value={it.ral} onChange={e => updItem(i, x => x.ral = e.target.value)} style={{ ...inp, width: '100%' }} /></div>
          <div><span style={lab}>m2 superficie</span><input type="number" value={it.m2} onChange={e => updItem(i, x => x.m2 = e.target.value)} style={{ ...inp, width: '100%' }} /></div>
          <div><span style={lab}>Grado SSPC</span><select value={it.grado} onChange={e => updItem(i, x => x.grado = e.target.value)} style={{ ...inp, width: '100%' }}>{P.grados.map((g, k) => <option key={k} value={g.grado}>{g.grado} (x{g.factor})</option>)}</select></div>
          <div><span style={lab}>Dificultad</span><select value={it.dif} onChange={e => updItem(i, x => x.dif = e.target.value)} style={{ ...inp, width: '100%' }}>{P.factores.map((f, k) => <option key={k} value={f.nivel}>{f.nivel} (x{f.factor})</option>)}</select></div>
          <div><span style={lab}>Esquema</span><select value={it.esquemaNombre} onChange={e => updItem(i, x => x.esquemaNombre = e.target.value)} style={{ ...inp, width: '100%' }}><option value="">- elegir esquema -</option>{P.esquemas.map((es, k) => <option key={k} value={es.n}>{es.n}</option>)}</select></div>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', borderTop: '1px solid ' + T.borderSoft, paddingTop: 10 }}>
          <div style={{ minWidth: 200, flex: 1 }}>
            {dgRow('Granallado /m2', d.granallado)}
            {dgRow('Aplicacion /m2 (' + d.nCapas + ' capas)', d.aplicacion)}
            {dgRow('Diluyente /m2', d.diluyente)}
            {dgRow('Pintura /m2', d.pintura)}
            {dgRow('Gastos fijos /m2', d.fijos)}
          </div>
          <div style={{ minWidth: 180 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: T.navy, borderBottom: '1px solid ' + T.border, paddingBottom: 4, marginBottom: 4 }}><span>Costo /m2</span><span>{clp(d.costoM2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: T.orange }}><span>Precio /m2</span><span>{clp(pm)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: T.text, marginTop: 6 }}><span>Total item</span><span>{clp(pm * (+it.m2 || 0))}</span></div>
          </div>
        </div>
      </div>
    ) })}
    <button onClick={() => setItems([...items, nuevoItem()])} style={{ background: 'transparent', border: '1px dashed ' + T.border, borderRadius: 8, padding: '9px 14px', cursor: 'pointer', color: T.textSoft, fontSize: 13, marginBottom: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={14} /> Agregar item</button>
    <div style={card}>
      <span style={lab}>% de ganancia global</span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={() => setPct(100)} style={pill(pct == 100)}>x2 (100%)</button>
        <button onClick={() => setPct(200)} style={pill(pct == 200)}>x3 (200%)</button>
        <input type="number" value={pct} onChange={e => setPct(+e.target.value || 0)} style={{ ...inp, width: 100 }} /><span style={{ fontSize: 13, color: T.textMute }}>% libre</span>
      </div>
      <span style={lab}>Supuestos de costeo (se enlazaran a Gastos Fijos)</span>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: T.textSoft }}>Sueldos granallado/mes<br /><input type="number" value={sg} onChange={e => setSg(+e.target.value || 0)} style={{ ...inp, width: 150 }} /></label>
        <label style={{ fontSize: 12, color: T.textSoft }}>Sueldos pintura/mes<br /><input type="number" value={sp} onChange={e => setSp(+e.target.value || 0)} style={{ ...inp, width: 150 }} /></label>
        <label style={{ fontSize: 12, color: T.textSoft }}>Total fijos sede/mes<br /><input value={clp(totalFijos)} disabled style={{ ...inp, width: 150, background: '#F3F4F6' }} /></label>
      </div>
    </div>
    <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderTop: '3px solid ' + T.orange }}>
      <div><div style={{ fontSize: 12, color: T.textMute, textTransform: 'uppercase', fontWeight: 600 }}>Total cotizacion (neto)</div><div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 26, fontWeight: 700, color: T.navy }}>{clp(totalCot)}</div></div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {guardado && <span style={{ color: T.success, fontSize: 13, fontWeight: 600 }}>{guardado}</span>}
        <button onClick={guardar} disabled={!cliente} style={{ ...btnP, opacity: cliente ? 1 : 0.5 }}>Guardar borrador</button>
      </div>
    </div>
  </div>)
}
