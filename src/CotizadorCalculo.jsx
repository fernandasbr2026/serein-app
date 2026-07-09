import { useState, useMemo, useEffect } from 'react'
import { COTIZADOR_SEED, indexProductos, desgloseItem, precioM2, valorM2Capa, rendimientoM2Gal, valorGalon } from './cotizador-data.js'
import { THEME } from './ui.jsx'
import { Plus, Trash2, ChevronLeft } from 'lucide-react'

const LS_KEY = 'cotizador_params_v1'
function cargarParams() { try { const s = localStorage.getItem(LS_KEY); if (s) { const o = JSON.parse(s); if (o && o.productos) return o } } catch (e) {} return JSON.parse(JSON.stringify(COTIZADOR_SEED)) }
const T = THEME
const CASOS_DIF = { A: 'Planchas, estanques exteriores, vigas simples, superficies amplias y accesibles', B: 'Perfiles estructurales, columnas, algo de interior, acceso regular', C: 'Reticulados / celosías, muchas aristas o sectores, mayormente interior', D: 'Ductos, interior confinado, cañerías, geometría difícil', E: 'Confinado + geometría difícil + interior simultáneamente' }
const clp = n => '$' + Math.round(+n || 0).toLocaleString('es-CL')
const milsProm = c => { const a = +c.mMin || 0; const b = (c.mMax === '' || c.mMax == null) ? a : (+c.mMax || 0); return b > 0 ? (a + b) / 2 : a }
function nuevaCapa() { return { p: '', mMin: 2, mMax: 4, perdida: 2 } }
function nuevoItem() { return { desc: '', ral: '', m2: 0, grado: 'SP-10 (near-white)', dif: 'A - Estandar', limpieza: 0, capas: [nuevaCapa()] } }
function proximoNumero(cots) { let mx = 792; (cots || []).forEach(c => { const s = (c.numero || c.folio || '') + ''; const m = s.match(/(\d+)/); if (m) mx = Math.max(mx, +m[1]) }); return 'Cot-' + (mx + 1) }

function BuscadorProducto({ value, productos, onSelect, style }) {
  const [q, setQ] = useState(value || '')
  const [open, setOpen] = useState(false)
  useEffect(() => { setQ(value || '') }, [value])
  const ql = q.trim().toLowerCase()
  const matches = (ql ? productos.filter(p => p.n.toLowerCase().includes(ql)) : productos).slice(0, 12)
  return (<div style={{ position: 'relative', minWidth: 160 }}>
    <input value={q} onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 160)} placeholder="buscar producto..." style={style} />
    {open && matches.length > 0 && (<div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid ' + T.border, borderRadius: 8, boxShadow: T.shadowMd, zIndex: 40, maxHeight: 210, overflowY: 'auto', marginTop: 2, minWidth: 220 }}>
      {matches.map((p, k) => (<div key={k} onMouseDown={() => { onSelect(p.n); setQ(p.n); setOpen(false) }} style={{ padding: '6px 9px', cursor: 'pointer', fontSize: 12.5, borderBottom: '1px solid ' + T.borderSoft, whiteSpace: 'nowrap' }}>{p.n} <span style={{ color: T.textMute, fontSize: 11 }}>{p.mc}</span></div>))}
    </div>)}
  </div>)
}

export default function CotizadorCalculo({ clientes = [], onAddCliente = () => {}, cotizaciones = [], setCotizaciones = () => {}, onVolver = () => {} }) {
  const P = useMemo(cargarParams, [])
  const idx = useMemo(() => indexProductos(P.productos), [P])
  const cte = P.constantes
  const [sede, setSede] = useState('Santa Rosa')
  const [cliQuery, setCliQuery] = useState('')
  const [cliSel, setCliSel] = useState(null)
  const [cliOpen, setCliOpen] = useState(false)
  const [items, setItems] = useState([nuevoItem()])
  const [pct, setPct] = useState(100)
  const [sg, setSg] = useState(3380000)
  const [sp, setSp] = useState(2700000)
  const [guardado, setGuardado] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [nc, setNc] = useState({ nombre: '', rut: '', giro: '', direccion: '', comuna: '' })

  const sedeP = P.sedes[sede] || {}
  const totalFijos = sedeP.totalFijosFallback || 18000000
  const ctx = { sede: sedeP, constantes: cte, prodPorNombre: idx, sueldosGranallado: +sg, sueldosPintores: +sp, sueldosProduccion: (+sg) + (+sp), totalFijosSede: totalFijos }
  const matches = cliQuery.trim().length > 0 ? clientes.filter(c => ((c.nombre || c) + '').toLowerCase().includes(cliQuery.toLowerCase())).slice(0, 8) : []

  function updItem(i, fn) { setItems(prev => prev.map((x, k) => { if (k !== i) return x; const n = { ...x, capas: x.capas.map(c => ({ ...c })) }; fn(n); return n })) }
  function capasEng(it) { return it.capas.filter(c => c.p).map(c => ({ p: c.p, m: milsProm(c), perdida: c.perdida })) }
  function dg(it) { const g = P.grados.find(x => x.grado === it.grado); const f = P.factores.find(x => x.nivel === it.dif); return desgloseItem({ esquema: { capas: capasEng(it) }, factorGrado: g ? g.factor : 1, factorDif: f ? f.factor : 1, limpiezaSP1: +it.limpieza || 0 }, ctx) }
  const totalCot = items.reduce((s, it) => s + precioM2(dg(it).costoM2, pct) * (+it.m2 || 0), 0)
  function cargarEsquema(i, nombre) { const e = P.esquemas.find(x => x.n === nombre); if (!e) return; updItem(i, n => { n.capas = e.capas.map(c => ({ p: c.p, mMin: c.m, mMax: c.m, perdida: cte.perdidaTipica || 2 })) }) }

  function guardar() {
    const numero = proximoNumero(cotizaciones)
    const cli = cliSel || { nombre: cliQuery }
    const cot = { id: 'cot' + Date.now(), numero, folio: numero, area: sede, vencimiento: new Date().toISOString().slice(0, 10), tipo: 'calculo', origen: 'cotizador', estado: 'Alta probabilidad de cierre', cliente: cli.nombre || '', rut: cli.rut || '', giro: cli.giro || '', direccion: cli.direccion || '', comuna: cli.comuna || '', ciudad: cli.ciudad || cli.comuna || '', condicionPago: 'CONTADO', vendedor: cli.vendedor || 'Mario Vidal', sede, fecha: new Date().toISOString().slice(0, 10), porcentajeGanancia: +pct,
      items: items.map((it, i) => { const d = dg(it); const pm = precioM2(d.costoM2, pct); return { codigo: it.grado || '', detalle: (it.desc || 'Item ' + (i + 1)) + (it.ral ? ' - ' + it.ral : '') + ' - ' + (it.capas.filter(c => c.p).map(c => c.p).join(' + ') || 'solo granallado ' + it.grado), cant: +it.m2 || 0, unidad: 'm\u00B2', pUnitario: Math.round(pm), descuento: 0, comentario: (it.capas.filter(c => c.p).map(c => c.p + ' ' + milsProm(c) + ' mils').join(' + ') || 'Solo granallado') + ' - ' + it.grado, descripcion: it.desc, ral: it.ral, m2: +it.m2 || 0, gradoSSPC: it.grado, factorDificultad: it.dif, limpiezaSP1: +it.limpieza || 0, capas: it.capas.filter(c => c.p), costoM2: Math.round(d.costoM2), precioM2: Math.round(pm), total: Math.round(pm * (+it.m2 || 0)), desglose: { granallado: Math.round(d.granallado), aplicacion: Math.round(d.aplicacion), diluyente: Math.round(d.diluyente), pintura: Math.round(d.pintura), fijos: Math.round(d.fijos) } } }),
      total: Math.round(totalCot), montoCotizado: Math.round(totalCot), supuestos: { sueldosGranallado: +sg, sueldosPintores: +sp, totalFijos } }
    setCotizaciones([...(cotizaciones || []), cot])
    if (!cliSel && cliQuery.trim()) { try { onAddCliente(cliQuery.trim()) } catch (e) {} }
    setGuardado('Borrador ' + numero + ' guardado en Cotizaciones.')
  }

  const card = { background: '#fff', border: '1px solid ' + T.border, borderRadius: 12, boxShadow: T.shadow, padding: 16, marginBottom: 16 }
  const inp = { border: '1px solid ' + T.border, borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: T.font, boxSizing: 'border-box' }
  const lab = { fontSize: 11.5, color: T.textMute, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 4 }
  const btnP = { background: T.orange, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 15px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }
  const pill = a => ({ background: a ? T.navy : '#fff', color: a ? '#fff' : T.textSoft, border: '1px solid ' + (a ? T.navy : T.border), borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 })
  const th = { textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: T.textMute, fontWeight: 700, padding: '5px 6px', borderBottom: '1px solid ' + T.border, whiteSpace: 'nowrap' }
  const tdc = { padding: '3px 5px', borderBottom: '1px solid ' + T.borderSoft, fontSize: 12.5 }

  return (<div>
    <datalist id="cot-productos">{P.productos.map((pp, kk) => <option key={kk} value={pp.n} label={pp.mc} />)}</datalist>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <button onClick={onVolver} style={{ background: 'transparent', border: '1px solid ' + T.border, borderRadius: 8, padding: '7px 11px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.textSoft }}><ChevronLeft size={15} /> Volver</button>
      <h3 style={{ margin: 0, fontFamily: "'Oswald',sans-serif", fontSize: 18, fontWeight: 600, color: T.navy, textTransform: 'uppercase' }}>Nueva cotizacion por calculo</h3>
    </div>

    <div style={card}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, alignItems: 'start' }}>
        <div style={{ position: 'relative' }}>
          <span style={lab}>Cliente</span>
          <input value={cliQuery} onChange={e => { setCliQuery(e.target.value); setCliSel(null); setCliOpen(true) }} onFocus={() => setCliOpen(true)} placeholder="Escribe el nombre del cliente..." style={{ ...inp, width: '100%' }} />
          {cliOpen && !cliSel && matches.length > 0 && (<div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid ' + T.border, borderRadius: 8, boxShadow: T.shadowMd, zIndex: 30, maxHeight: 230, overflowY: 'auto', marginTop: 3 }}>
            {matches.map((c, i) => (<div key={i} onClick={() => { setCliSel(c); setCliQuery(c.nombre || c); setCliOpen(false) }} style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid ' + T.borderSoft }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{c.nombre || c}</div>
              <div style={{ fontSize: 11, color: T.textMute }}>{(c.rut || '') + (c.comuna ? ' - ' + c.comuna : '')}</div>
            </div>))}
          </div>)}
          {cliSel && (<div style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: T.textSoft, background: '#F5F7FA', borderRadius: 8, padding: '8px 10px' }}>
            <span><b>RUT:</b> {cliSel.rut || '-'}</span><span><b>Direccion:</b> {cliSel.direccion || '-'}</span><span><b>Giro:</b> {cliSel.giro || '-'}</span><span><b>Comuna:</b> {cliSel.comuna || '-'}</span>
          </div>)}
          {!cliSel && cliQuery.trim() && matches.length === 0 && (<div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ fontSize: 12, color: T.warn }}>No esta en el listado.</span><button onClick={() => { setNc({ nombre: cliQuery.trim(), rut: '', giro: '', direccion: '', comuna: '' }); setAddOpen(true) }} style={{ background: T.orange, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>+ Agregar cliente</button></div>)}
        </div>
        <div>
          <span style={lab}>Sede</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setSede('Santa Rosa')} style={pill(sede === 'Santa Rosa')}>Santa Rosa</button>
            <button onClick={() => setSede('Istria')} style={pill(sede === 'Istria')}>Istria</button>
          </div>
        </div>
      </div>
    </div>

    {items.map((it, i) => { const d = dg(it); const pm = precioM2(d.costoM2, pct); const soloGran = d.nCapas === 0; return (
      <div key={i} style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 600, color: T.navy }}>Item {i + 1}{soloGran ? ' - SOLO GRANALLADO' : ''}</div>
          {items.length > 1 && <button onClick={() => setItems(items.filter((_, k) => k !== i))} style={{ background: 'transparent', border: 'none', color: T.danger, cursor: 'pointer' }}><Trash2 size={16} /></button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
          <div><span style={lab}>Descripcion</span><input value={it.desc} onChange={e => updItem(i, x => x.desc = e.target.value)} style={{ ...inp, width: '100%' }} /></div>
          <div><span style={lab}>RAL / Color</span><input value={it.ral} onChange={e => updItem(i, x => x.ral = e.target.value)} style={{ ...inp, width: '100%' }} /></div>
          <div><span style={lab}>m2 superficie</span><input type="number" value={it.m2} onChange={e => updItem(i, x => x.m2 = e.target.value)} style={{ ...inp, width: '100%' }} /></div>
          <div><span style={lab}>Dificultad</span><select value={it.dif} onChange={e => updItem(i, x => x.dif = e.target.value)} style={{ ...inp, width: '100%' }}>{P.factores.map((f, k) => <option key={k} value={f.nivel}>{f.nivel} (x{f.factor})</option>)}</select><div style={{ fontSize: 11, color: T.textMute, marginTop: 3, lineHeight: 1.3 }}>{CASOS_DIF[(it.dif || '').trim()[0]] || ''}</div></div>
          <div><span style={lab}>Limpieza SP-1 /m2</span><input type="number" value={it.limpieza} onChange={e => updItem(i, x => x.limpieza = e.target.value)} style={{ ...inp, width: '100%' }} /></div>
        </div>

        <div style={{ background: '#F5F7FA', border: '1px solid ' + T.border, borderLeft: '4px solid ' + T.orange, borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 250 }}>
            <span style={lab}>Tipo de granallado (grado SSPC)</span>
            <select value={it.grado} onChange={e => updItem(i, x => x.grado = e.target.value)} style={{ ...inp, width: '100%' }}>{P.grados.map((g, k) => <option key={k} value={g.grado}>{g.grado} (x{g.factor})</option>)}</select>
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: T.textMute, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.4 }}>Granallado</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 700, color: T.navy, lineHeight: 1.1 }}>{clp(d.granallado)}<span style={{ fontSize: 12, color: T.textMute, fontWeight: 400 }}> /m2</span></div>
          </div>
          {(+it.limpieza || 0) > 0 && <div><div style={{ fontSize: 10.5, color: T.textMute, textTransform: 'uppercase', fontWeight: 700 }}>Limpieza SP-1</div><div style={{ fontSize: 15, fontWeight: 600, color: T.textSoft }}>{clp(+it.limpieza || 0)} /m2</div></div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.textSoft }}>ESQUEMA DE PINTURA <span style={{ fontWeight: 400, color: T.textMute }}>(opcional - deja vacio si es SOLO granallado)</span></span>
          <select onChange={e => { cargarEsquema(i, e.target.value); e.target.value = '' }} style={{ ...inp, fontSize: 12, padding: '5px 8px' }}><option value="">Cargar esquema guardado...</option>{P.esquemas.map((es, k) => <option key={k} value={es.n}>{es.n}</option>)}</select>
        </div>
        {it.capas.length > 0 && <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead><tr><th style={th}>Capa</th><th style={th}>Producto</th><th style={th}>Mils min</th><th style={th}>Mils max</th><th style={th}>Perdida</th><th style={th}>Solidos %</th><th style={th}>Rend m2/gal</th><th style={th}>Valor galon</th><th style={th}>Valor $/m2</th><th style={th}></th></tr></thead>
            <tbody>
              {it.capas.map((c, j) => { const prod = idx[c.p]; const mp = milsProm(c); const rend = prod ? rendimientoM2Gal(prod.s, mp, c.perdida, cte.constante) : 0; const vg = prod ? valorGalon(prod, cte.litrosPorGalon) : 0; const vm = prod ? valorM2Capa(prod, mp, c.perdida, cte) : 0; return (<tr key={j}>
                <td style={tdc}>{j + 1}a</td>
                <td style={tdc}><input list="cot-productos" value={c.p} onChange={e => updItem(i, x => x.capas[j].p = e.target.value)} placeholder="escribe producto..." style={{ ...inp, width: '100%', minWidth: 150, padding: '5px 7px' }} /></td>
                <td style={tdc}><input type="number" value={c.mMin} onChange={e => updItem(i, x => x.capas[j].mMin = e.target.value)} style={{ ...inp, width: 68, padding: '5px 6px' }} /></td>
                <td style={tdc}><input type="number" value={c.mMax} onChange={e => updItem(i, x => x.capas[j].mMax = e.target.value)} style={{ ...inp, width: 68, padding: '5px 6px' }} /></td>
                <td style={tdc}><input type="number" value={c.perdida} onChange={e => updItem(i, x => x.capas[j].perdida = e.target.value)} style={{ ...inp, width: 62, padding: '5px 6px' }} /></td>
                <td style={tdc}>{prod ? prod.s + '%' : '-'}</td>
                <td style={tdc}>{rend ? rend.toFixed(2) : '-'}</td>
                <td style={tdc}>{vg ? clp(vg) : '-'}</td>
                <td style={{ ...tdc, fontWeight: 600, color: T.navy }}>{vm ? clp(vm) : '-'}</td>
                <td style={tdc}><button onClick={() => updItem(i, x => x.capas.splice(j, 1))} style={{ background: 'transparent', border: 'none', color: T.danger, cursor: 'pointer', padding: 2 }}><Trash2 size={14} /></button></td>
              </tr>) })}
            </tbody>
          </table>
        </div>}
        {it.capas.length === 0 && <div style={{ fontSize: 12.5, color: T.textMute, fontStyle: 'italic', padding: '6px 0' }}>Sin capas de pintura - se cotiza solo el granallado.</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          <button onClick={() => updItem(i, x => x.capas.push(nuevaCapa()))} style={{ background: 'transparent', border: '1px dashed ' + T.border, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: T.textSoft, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Capa</button>
          <div style={{ fontSize: 12.5, color: T.textSoft }}>Costo pintura: <b style={{ color: T.navy }}>{clp(d.pintura)}/m2</b> - {d.nCapas} capas · mils promedio por rango</div>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', borderTop: '1px solid ' + T.borderSoft, paddingTop: 10, marginTop: 10 }}>
          <div style={{ minWidth: 200, flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: T.textSoft, padding: '1px 0' }}><span>Granallado /m2 ({it.grado})</span><span>{clp(d.granallado)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: T.textSoft, padding: '1px 0' }}><span>Limpieza SP-1 /m2</span><span>{clp(d.limpieza)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: T.textSoft, padding: '1px 0' }}><span>Aplicacion /m2 ({d.nCapas} capas)</span><span>{clp(d.aplicacion)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: T.textSoft, padding: '1px 0' }}><span>Diluyente /m2</span><span>{clp(d.diluyente)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: T.textSoft, padding: '1px 0' }}><span>Pintura /m2</span><span>{clp(d.pintura)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: T.textSoft, padding: '1px 0' }}><span>Gastos fijos /m2</span><span>{clp(d.fijos)}</span></div>
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
        <button onClick={guardar} disabled={!cliQuery.trim()} style={{ ...btnP, opacity: cliQuery.trim() ? 1 : 0.5 }}>Guardar borrador</button>
      </div>
    </div>
    {addOpen && (<div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(6,26,64,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 20px 50px rgba(16,24,40,.25)', padding: 22, width: 440, maxWidth: '100%' }}>
        <h3 style={{ margin: '0 0 14px', fontFamily: "'Oswald',sans-serif", fontSize: 16, color: T.navy, textTransform: 'uppercase' }}>Agregar cliente</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          <div><span style={lab}>Nombre / Razon social</span><input value={nc.nombre} onChange={e => setNc({ ...nc, nombre: e.target.value })} style={{ ...inp, width: '100%' }} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><span style={lab}>RUT</span><input value={nc.rut} onChange={e => setNc({ ...nc, rut: e.target.value })} style={{ ...inp, width: '100%' }} /></div>
            <div style={{ flex: 1 }}><span style={lab}>Comuna</span><input value={nc.comuna} onChange={e => setNc({ ...nc, comuna: e.target.value })} style={{ ...inp, width: '100%' }} /></div>
          </div>
          <div><span style={lab}>Giro</span><input value={nc.giro} onChange={e => setNc({ ...nc, giro: e.target.value })} style={{ ...inp, width: '100%' }} /></div>
          <div><span style={lab}>Direccion</span><input value={nc.direccion} onChange={e => setNc({ ...nc, direccion: e.target.value })} style={{ ...inp, width: '100%' }} /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button onClick={() => setAddOpen(false)} style={{ background: '#fff', border: '1px solid ' + T.border, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: T.textSoft }}>Cancelar</button>
          <button onClick={() => { if (!nc.nombre.trim()) return; const obj = { nombre: nc.nombre.trim(), rut: nc.rut.trim(), giro: nc.giro.trim(), direccion: nc.direccion.trim(), comuna: nc.comuna.trim() }; try { onAddCliente(obj) } catch (e) {} setCliSel(obj); setCliQuery(obj.nombre); setAddOpen(false) }} style={{ ...btnP }}>Guardar cliente</button>
        </div>
      </div>
    </div>)}
  </div>)
}
