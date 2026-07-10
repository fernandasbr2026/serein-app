import { useState, useEffect } from 'react'
import { COTIZADOR_SEED, valorM2Capa } from './cotizador-data.js'
import { THEME } from './ui.jsx'
import { Plus, Trash2, ChevronLeft } from 'lucide-react'

const LS_KEY = 'cotizador_params_v1'
function cargar() { try { const s = localStorage.getItem(LS_KEY); if (s) { const o = JSON.parse(s); if (o && o.productos) return o } } catch (e) {} return JSON.parse(JSON.stringify(COTIZADOR_SEED)) }
const T = THEME
const CASOS_DIF = { A: 'Planchas, estanques exteriores, vigas simples, superficies amplias y accesibles', B: 'Perfiles estructurales, columnas, algo de interior, acceso regular', C: 'Reticulados / celosías, muchas aristas o sectores, mayormente interior', D: 'Ductos, interior confinado, cañerías, geometría difícil', E: 'Confinado + geometría difícil + interior simultáneamente' }

const SEDE_CAMPOS = [
  ['granallaAmortizada', 'Granalla amortizada ($/mes)'],
  ['dieselDia', 'Diesel compresor ($/dia)'],
  ['diasMes', 'Dias efectivos/mes'],
  ['eppGran', 'EPP granallado ($/mes)'],
  ['consumiblesGran', 'Consumibles granallado ($/mes)'],
  ['m2GranalladoMes', 'm2 granallados/mes'],
  ['factorGradoPredominante', 'Factor grado predominante'],
  ['energiaEquipo', 'Energia equipo pintura ($/mes)'],
  ['consumiblesPint', 'Consumibles pintura ($/mes)'],
  ['eppPint', 'EPP pintura ($/mes)'],
  ['m2PintadosEfectivosMes', 'm2 pintados efectivos/mes'],
  ['diluyenteLitros', 'Diluyente: litros comprados'],
  ['diluyentePrecioLitro', 'Diluyente: $/litro'],
  ['diluyenteMesesVida', 'Diluyente: meses de vida'],
  ['m2TotalesPlantaMes', 'm2 totales planta/mes (prorrateo fijos)'],
  ['totalFijosFallback', 'Total fijos sede (respaldo, $/mes)']
]

export default function CotizadorParametros({ onVolver }) {
  const [p, setP] = useState(cargar)
  const [sec, setSec] = useState('productos')
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(p)) } catch (e) {} }, [p])
  const upd = fn => setP(prev => { const n = JSON.parse(JSON.stringify(prev)); fn(n); return n })

  const card = { background: '#fff', border: '1px solid ' + T.border, borderRadius: 12, boxShadow: T.shadow, padding: 16, marginBottom: 16 }
  const inp = { border: '1px solid ' + T.border, borderRadius: 8, padding: '7px 9px', fontSize: 12.5, fontFamily: T.font, width: '100%', boxSizing: 'border-box' }
  const th = { textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', color: T.textMute, fontWeight: 700, padding: '6px 8px', borderBottom: '1px solid ' + T.border, whiteSpace: 'nowrap' }
  const tdc = { padding: '4px 6px', borderBottom: '1px solid ' + T.borderSoft }
  const btnP = { background: T.orange, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 13px', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }
  const btnDel = { background: 'transparent', border: 'none', color: T.danger, cursor: 'pointer', display: 'inline-flex', padding: 4 }
  const secs = [['productos', 'Productos'], ['esquemas', 'Esquemas'], ['grados', 'Grados y factores'], ['Santa Rosa', 'Sede Santa Rosa'], ['Istria', 'Sede Istria']]

  function ni(val, onCh, style) { return <input type="number" value={val == null ? '' : val} onChange={e => onCh(e.target.value === '' ? 0 : +e.target.value)} style={{ ...inp, ...(style || {}) }} /> }
  function ti(val, onCh, style) { return <input value={val == null ? '' : val} onChange={e => onCh(e.target.value)} style={{ ...inp, ...(style || {}) }} /> }

  return (<div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <button onClick={onVolver} style={{ background: 'transparent', border: '1px solid ' + T.border, borderRadius: 8, padding: '7px 11px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.textSoft }}><ChevronLeft size={15} /> Volver a cotizaciones</button>
      <h3 style={{ margin: 0, fontFamily: "'Oswald',sans-serif", fontSize: 18, fontWeight: 600, color: T.navy, textTransform: 'uppercase' }}>Parametros del Cotizador</h3>
    </div>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
      {secs.map(([k, lab]) => (<button key={k} onClick={() => setSec(k)} style={{ background: sec === k ? T.navy : '#fff', color: sec === k ? '#fff' : T.textSoft, border: '1px solid ' + (sec === k ? T.navy : T.border), borderRadius: 8, padding: '7px 13px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>{lab}</button>))}
    </div>

    {sec === 'productos' && (<div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 600, color: T.text }}>Productos ({p.productos.length})</div>
        <button style={btnP} onClick={() => upd(n => n.productos.unshift({ n: 'NUEVO PRODUCTO', mc: '', s: 60, l: 0, g: 0 }))}><Plus size={14} /> Agregar</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead><tr><th style={th}>Producto</th><th style={th}>Marca</th><th style={th}>Solidos %</th><th style={th}>$/litro</th><th style={th}>$/galon</th><th style={th}></th></tr></thead>
          <tbody>
            {p.productos.map((pr, i) => (<tr key={i}>
              <td style={tdc}>{ti(pr.n, v => upd(n => { n.productos[i].n = v }), { minWidth: 150 })}</td>
              <td style={tdc}>{ti(pr.mc, v => upd(n => { n.productos[i].mc = v }), { minWidth: 110 })}</td>
              <td style={tdc}>{ni(pr.s, v => upd(n => { n.productos[i].s = v }), { width: 80 })}</td>
              <td style={tdc}>{ni(pr.l, v => upd(n => { n.productos[i].l = v }), { width: 100 })}</td>
              <td style={tdc}>{ni(pr.g, v => upd(n => { n.productos[i].g = v }), { width: 100 })}</td>
              <td style={tdc}><button style={btnDel} onClick={() => upd(n => n.productos.splice(i, 1))}><Trash2 size={15} /></button></td>
            </tr>))}
          </tbody>
        </table>
      </div>
    </div>)}

    {sec === 'esquemas' && (<div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 600, color: T.text }}>Esquemas ({p.esquemas.length})</div>
        <button style={btnP} onClick={() => upd(n => n.esquemas.unshift({ n: 'NUEVO ESQUEMA', capas: [{ p: '', m: 3 }] }))}><Plus size={14} /> Agregar esquema</button>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {p.esquemas.map((es, i) => (<div key={i} style={{ border: '1px solid ' + T.borderSoft, borderRadius: 8, padding: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            {ti(es.n, v => upd(n => { n.esquemas[i].n = v }), { fontWeight: 600 })}
          {(() => {
            const _clp = x => '$' + Math.round(x || 0).toLocaleString('es-CL')
            const _cte = { constante: (p.constantes && p.constantes.constante) || 1.5, litrosPorGalon: (p.constantes && p.constantes.litrosPorGalon) || 3.785 }
            const _perd = (p.constantes && p.constantes.perdidaTipica) || 2
            const _vc = Math.round((es.capas || []).reduce((a, c) => { const pr = (p.productos || []).find(x => x.n === c.p); const _mils = (c.m != null && c.m !== '') ? c.m : (((+c.mMin || 0) + (+c.mMax || +c.mMin || 0)) / 2); return a + valorM2Capa(pr, _mils, c.perdida != null ? c.perdida : _perd, _cte) }, 0))
            const _man = es.usa_manual && es.valor_manual != null
            return (<div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
              <span style={{ fontSize: 11, color: '#7A8288' }}>Valor $/m2:</span>
              <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14 }}>{_clp(_man ? es.valor_manual : _vc)}</span>
              {_man ? <span style={{ fontSize: 10, fontWeight: 600, color: '#8C4519', background: '#F9E9DE', padding: '1px 6px', borderRadius: 8 }}>manual</span> : <span style={{ fontSize: 10, color: '#9AA0A6' }}>auto ({_clp(_vc)})</span>}
              <input type="number" placeholder={String(_vc)} value={es.valor_manual != null ? es.valor_manual : ''} onChange={ev => upd(n => { const v = ev.target.value; n.esquemas[i].valor_manual = v === '' ? null : +v; n.esquemas[i].usa_manual = v !== '' })} style={{ width: 90, padding: '4px 6px', border: '1px solid #CBD2D6', fontSize: 12, textAlign: 'right' }} title="Valor manual (override)" />
              {_man && <button onClick={() => upd(n => { n.esquemas[i].usa_manual = false; n.esquemas[i].valor_manual = null })} style={{ background: 'none', border: '1px solid #CBD2D6', fontSize: 11, padding: '3px 7px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Volver al calculado</button>}
            </div>)
          })()}
            <button style={btnDel} onClick={() => upd(n => n.esquemas.splice(i, 1))}><Trash2 size={15} /></button>
          </div>
          {es.capas.map((c, j) => (<div key={j} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: T.textMute, width: 42 }}>Capa {j + 1}</span>
            <select value={c.p} onChange={e => upd(n => { n.esquemas[i].capas[j].p = e.target.value })} style={{ ...inp, flex: 1 }}>
              <option value="">- producto -</option>
              {p.productos.map((pr, k) => <option key={k} value={pr.n}>{pr.n}</option>)}
            </select>
            {ni(c.m, v => upd(n => { n.esquemas[i].capas[j].m = v }), { width: 80 })}
            <span style={{ fontSize: 11, color: T.textMute }}>mils</span>
            <button style={btnDel} onClick={() => upd(n => n.esquemas[i].capas.splice(j, 1))}><Trash2 size={14} /></button>
          </div>))}
          <button onClick={() => upd(n => n.esquemas[i].capas.push({ p: '', m: 3 }))} style={{ background: 'transparent', border: '1px dashed ' + T.border, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: T.textSoft, marginTop: 4 }}>+ Capa</button>
        </div>))}
      </div>
    </div>)}

    {sec === 'grados' && (<div>
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 10, color: T.text }}>Grados SSPC (factor de granallado)</div>
        {p.grados.map((g, i) => (<div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
          <span style={{ flex: 1, fontSize: 13 }}>{g.grado}</span>
          {ni(g.factor, v => upd(n => { n.grados[i].factor = v }), { width: 90 })}
        </div>))}
      </div>
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 10, color: T.text }}>Factores de dificultad (geometria/acceso)</div>
        {p.factores.map((f, i) => (<div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
          <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{f.nivel} <span style={{ fontSize: 11, color: T.textMute, fontWeight: 400 }}>(recargo +{Math.round(((+f.factor || 1) - 1) * 100)}%)</span></div><div style={{ fontSize: 11.5, color: T.textMute, marginTop: 2 }}>{CASOS_DIF[(f.nivel || '').trim()[0]] || ''}</div></div>
          {ni(f.factor, v => upd(n => { n.factores[i].factor = v }), { width: 90 })}
        </div>))}
      </div>
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 10, color: T.text }}>Constantes de calculo</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12.5 }}>Litros por galon<br />{ni(p.constantes.litrosPorGalon, v => upd(n => { n.constantes.litrosPorGalon = v }), { width: 110 })}</label>
          <label style={{ fontSize: 12.5 }}>Constante rendimiento<br />{ni(p.constantes.constante, v => upd(n => { n.constantes.constante = v }), { width: 110 })}</label>
          <label style={{ fontSize: 12.5 }}>Perdida por defecto<br />{ni(p.constantes.perdidaTipica, v => upd(n => { n.constantes.perdidaTipica = v }), { width: 110 })}</label>
        </div>
      </div>
    </div>)}

    {(sec === 'Santa Rosa' || sec === 'Istria') && (() => {
      const sede = p.sedes[sec] || {}
      return (<div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 4, color: T.text }}>Parametros de {sec}{sede.placeholder ? ' (placeholder - reemplazar con datos reales)' : ''}</div>
        <div style={{ fontSize: 11.5, color: T.textMute, marginBottom: 12 }}>Los sueldos de produccion (granallador, ayudantes, pintores) se leen de Gastos Fijos, no se editan aqui.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {SEDE_CAMPOS.map(([k, lab]) => (<label key={k} style={{ fontSize: 12, color: T.textSoft }}>{lab}<br />{ni(sede[k], v => upd(n => { n.sedes[sec][k] = v }))}</label>))}
        </div>
        <div style={{ fontWeight: 600, margin: '16px 0 8px', color: T.text }}>Inversiones (depreciacion)</div>
        {(sede.inversiones || []).map((inv, i) => (<div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          {ti(inv.nombre, v => upd(n => { n.sedes[sec].inversiones[i].nombre = v }), { flex: 1 })}
          {ni(inv.valor, v => upd(n => { n.sedes[sec].inversiones[i].valor = v }), { width: 130 })}
          <span style={{ fontSize: 11, color: T.textMute }}>valor</span>
          {ni(inv.vidaMeses, v => upd(n => { n.sedes[sec].inversiones[i].vidaMeses = v }), { width: 90 })}
          <span style={{ fontSize: 11, color: T.textMute }}>meses</span>
          <button style={btnDel} onClick={() => upd(n => n.sedes[sec].inversiones.splice(i, 1))}><Trash2 size={15} /></button>
        </div>))}
        <button onClick={() => upd(n => { if (!n.sedes[sec].inversiones) n.sedes[sec].inversiones = []; n.sedes[sec].inversiones.push({ nombre: 'Nueva inversion', valor: 0, vidaMeses: 120 }) })} style={{ background: 'transparent', border: '1px dashed ' + T.border, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: T.textSoft, marginTop: 4 }}>+ Inversion</button>
      </div>)
    })()}

    <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 4 }}>Los cambios se guardan automaticamente en este navegador.</div>
  </div>)
}
