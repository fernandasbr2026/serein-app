import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Landmark, Info, TrendingUp, RefreshCw } from 'lucide-react'

// ============================================================
// MÓDULO: Parámetros (SOLO GERENCIA)
// Datos reutilizables para autocompletar otros módulos.
// Primera sección: empresas de FACTORING (tasa, mora, costo op).
// Versión en memoria (mismo patrón que el resto de la app).
// ============================================================

const C = { naranja: '#D2642F', carbon: '#161616', verde: '#3D7A4E', rojo: '#B5432E', gris: '#7A8288', azul: '#1D1D1B' }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const dec = s => { const v = parseFloat(String(s).replace(',', '.').replace(/[^\d.]/g, '')); return isNaN(v) ? 0 : v }
const inp = { padding: '7px 9px', border: '1px solid #CBD2D6', fontSize: 13, boxSizing: 'border-box' }

// Datos de prueba (los que entregó Gerencia)
export const PARAMS_SEED = {
  factoring: [
    { id: 'f1', nombre: 'Defontana', tasa: 0.83, tasaMora: 3.5, costoOp: 50000 },
    { id: 'f2', nombre: 'ACF Capital', tasa: 0.83, tasaMora: 3.5, costoOp: 50000 },
  ],
  uf: { valor: 0, fecha: '' },
  instrumentos: { espMarca: 'ELCOMETER', espSerie: 'MH11472', rugMarca: 'ELCOMETER', rugSerie: 'NE30319', termoMarca: 'ELCOMETER', termoSerie: 'KCA721' },
}

// Cálculo de pérdida por factoring (reutilizable desde otros módulos)
//  - base: monto total con IVA que adelanta el factoring
//  - dias: días del crédito de la factura
//  - diasMora: días de atraso (opcional)
export function calcularPerdidaFactoring(baseTotal, dias, diasMora, f) {
  if (!f) return { interes: 0, mora: 0, costoOp: 0, total: 0 }
  const interes = baseTotal * (f.tasa / 100) * ((dias || 0) / 30)
  const mora = baseTotal * (f.tasaMora / 100) * ((diasMora || 0) / 30)
  const costoOp = f.costoOp || 0
  return { interes: Math.round(interes), mora: Math.round(mora), costoOp, total: Math.round(interes + mora + costoOp) }
}

// Pérdida de factoring de UNA factura (según su medio/estado, banco de factoring y plazo)
export function perdidaFactoringFactura(fac, params) {
  if (!fac) return 0
  const esFact = fac.estado === 'Factoring' || /factor/i.test(fac.medio || '')
  if (!esFact) return 0
  const facs = (params && params.factoring) || []
  const nb = (fac.banco || '').toLowerCase()
  const fc = facs.find(x => nb && nb.includes((x.nombre || '').toLowerCase().split(' ')[0])) || facs[0]
  if (!fc) return 0
  return calcularPerdidaFactoring(fac.monto || 0, fac.plazo || fac.dias || 30, fac.diasMora || 0, fc).total
}

function SeccionFactoring({ params, setParams }) {
  const lista = params.factoring || []
  const [nuevo, setNuevo] = useState({ nombre: '', tasa: '', tasaMora: '', costoOp: '' })

  const actualizar = (id, campo, valor) => setParams({ ...params, factoring: lista.map(f => f.id === id ? { ...f, [campo]: valor } : f) })
  function agregar() {
    if (!nuevo.nombre) return
    setParams({ ...params, factoring: [...lista, { id: 'f' + Date.now(), nombre: nuevo.nombre, tasa: dec(nuevo.tasa), tasaMora: dec(nuevo.tasaMora), costoOp: num(nuevo.costoOp) }] })
    setNuevo({ nombre: '', tasa: '', tasaMora: '', costoOp: '' })
  }
  function eliminar(id) { if (window.confirm('¿Eliminar esta empresa de factoring?')) setParams({ ...params, factoring: lista.filter(f => f.id !== id) }) }

  const numInput = (id, campo, valor, sufijo) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
      <input value={valor} onChange={e => actualizar(id, campo, campo === 'costoOp' ? num(e.target.value) : dec(e.target.value))} style={{ ...inp, width: 90, textAlign: 'right' }} />
      {sufijo && <span style={{ fontSize: 12, color: C.gris }}>{sufijo}</span>}
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Landmark size={16} color={C.naranja} />
        <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, textTransform: 'uppercase' }}>Empresas de Factoring</span>
      </div>
      <div style={{ fontSize: 12, color: '#8C4519', background: '#F9E9DE', padding: '8px 12px', marginBottom: 12, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <Info size={14} style={{ marginTop: 1, flexShrink: 0 }} />
        <span>La tasa e interés se aplican <b>mensualmente</b> y prorrateados por los días del crédito. Estos valores autocompletan el cálculo de pérdida al factorizar una factura.</span>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
              {['Empresa', 'Tasa (%/mes)', 'Tasa mora (%/mes)', 'Costo op. neto', ''].map(h => (
                <th key={h} style={{ textAlign: h === 'Empresa' ? 'left' : 'right', padding: '6px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.map(f => (
              <tr key={f.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
                <td style={{ padding: '7px 8px' }}><input value={f.nombre} onChange={e => actualizar(f.id, 'nombre', e.target.value)} style={{ ...inp, width: '100%', fontWeight: 600 }} /></td>
                <td style={{ padding: '7px 8px' }}>{numInput(f.id, 'tasa', f.tasa, '%')}</td>
                <td style={{ padding: '7px 8px' }}>{numInput(f.id, 'tasaMora', f.tasaMora, '%')}</td>
                <td style={{ padding: '7px 8px' }}>{numInput(f.id, 'costoOp', f.costoOp)}</td>
                <td style={{ padding: '7px 4px', textAlign: 'right' }}><button onClick={() => eliminar(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button></td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={5} style={{ padding: 12, textAlign: 'center', color: '#9AA0A6' }}>Sin empresas de factoring.</td></tr>}
            <tr style={{ background: '#FAF7F3' }}>
              <td style={{ padding: '7px 8px' }}><input placeholder="Nueva empresa" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} style={{ ...inp, width: '100%' }} /></td>
              <td style={{ padding: '7px 8px', textAlign: 'right' }}><input placeholder="0,83" value={nuevo.tasa} onChange={e => setNuevo({ ...nuevo, tasa: e.target.value })} style={{ ...inp, width: 90, textAlign: 'right' }} /></td>
              <td style={{ padding: '7px 8px', textAlign: 'right' }}><input placeholder="3,5" value={nuevo.tasaMora} onChange={e => setNuevo({ ...nuevo, tasaMora: e.target.value })} style={{ ...inp, width: 90, textAlign: 'right' }} /></td>
              <td style={{ padding: '7px 8px', textAlign: 'right' }}><input placeholder="50000" value={nuevo.costoOp} onChange={e => setNuevo({ ...nuevo, costoOp: e.target.value })} style={{ ...inp, width: 90, textAlign: 'right' }} /></td>
              <td style={{ padding: '7px 4px', textAlign: 'right' }}><button onClick={agregar} disabled={!nuevo.nombre} style={{ background: nuevo.nombre ? C.verde : '#CBD2D6', color: '#fff', border: 'none', padding: '6px 8px', cursor: nuevo.nombre ? 'pointer' : 'not-allowed' }}><Plus size={14} /></button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: '#9AA0A6', marginTop: 10 }}>
        Este módulo irá creciendo con más parámetros reutilizables (condiciones de pago, áreas, categorías, etc.) para autocompletar otros formularios.
      </div>
    </div>
  )
}

function SeccionUF({ params, setParams }) {
  const uf = params.uf || { valor: 0, fecha: '' }
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  async function traer() {
    setCargando(true); setError('')
    try {
      const r = await fetch('https://mindicador.cl/api/uf')
      const d = await r.json()
      const s = d.serie && d.serie[0]
      if (s) setParams({ ...params, uf: { valor: Math.round(s.valor), fecha: (s.fecha || '').slice(0, 10) } })
      else setError('Sin datos de UF.')
    } catch (e) { setError('No se pudo actualizar la UF en línea. Puedes ingresarla a mano.') }
    setCargando(false)
  }
  useEffect(() => { if (!uf.valor) traer() }, [])
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <TrendingUp size={16} color={C.naranja} />
        <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, textTransform: 'uppercase' }}>Valor UF (actualizado en línea)</span>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18, maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>UF de hoy</span>
          <span style={{ fontFamily: "'Oswald',sans-serif", fontSize: 26, fontWeight: 600, color: C.carbon }}>{clp(uf.valor)}</span>
          {uf.fecha && <span style={{ fontSize: 12, color: C.gris }}>al {uf.fecha}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={traer} disabled={cargando} style={{ background: C.carbon, color: '#fff', border: 'none', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> {cargando ? 'Actualizando…' : 'Actualizar UF'}
          </button>
          <span style={{ fontSize: 12, color: C.gris }}>o ingresar a mano:</span>
          <input value={uf.valor || ''} onChange={e => setParams({ ...params, uf: { valor: num(e.target.value), fecha: uf.fecha } })} style={{ ...inp, width: 110, textAlign: 'right' }} />
        </div>
        {error && <div style={{ fontSize: 12, color: C.rojo, marginTop: 8 }}>{error}</div>}
        <div style={{ fontSize: 12, color: C.gris, marginTop: 12, background: '#FAF7F3', padding: 10 }}>
          Fuente: mindicador.cl (UF diaria del Banco Central). Este valor se usa para gastos en UF (ej. arriendo de Santa Rosa): el monto se calcula como <b>UF × valor de hoy</b>, y al registrar el pago se guarda la UF del día.
        </div>
      </div>
    </div>
  )
}

const imgToDataP = (file, cb) => { const r = new FileReader(); r.onload = e => { const img = new Image(); img.onload = () => { var max = 1000; var w = img.width, h = img.height; if (w > h && w > max) { h = Math.round(h * max / w); w = max } else if (h > max) { w = Math.round(w * max / h); h = max } const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); cb(cv.toDataURL('image/jpeg', 0.72)) }; img.src = e.target.result }; r.readAsDataURL(file) }
function SeccionInstrumentos({ params, setParams }) {
  const inst = params.instrumentos || { espMarca: 'ELCOMETER', espSerie: 'MH11472', rugMarca: 'ELCOMETER', rugSerie: 'NE30319', termoMarca: 'ELCOMETER', termoSerie: 'KCA721' }
  useEffect(() => { if (!params.instrumentos) setParams({ ...params, instrumentos: inst }) }, [])
  const set = (k, v) => setParams({ ...params, instrumentos: { ...inst, [k]: v } })
  const ip = { padding: '7px 9px', border: '1px solid #CBD2D6', fontSize: 13, boxSizing: 'border-box', width: '100%', marginTop: 4 }
  const lb = { fontSize: 12, color: '#7A8288' }
  return (<div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}><div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 4 }}>Instrumentos / equipos de inspeccion</div><div style={{ fontSize: 12, color: '#7A8288', marginBottom: 14 }}>Estos codigos se cargan automaticamente al generar un protocolo PGP y siguen siendo editables en cada protocolo. Cambialos aqui cuando cambien los equipos.</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 12 }}><label style={lb}>Medidor de espesor - Marca<input style={ip} value={inst.espMarca || ''} onChange={e => set('espMarca', e.target.value)} /></label><label style={lb}>Medidor de espesor - Serie<input style={ip} value={inst.espSerie || ''} onChange={e => set('espSerie', e.target.value)} /></label><label style={lb}>Rugosimetro - Marca<input style={ip} value={inst.rugMarca || ''} onChange={e => set('rugMarca', e.target.value)} /></label><label style={lb}>Rugosimetro - Serie<input style={ip} value={inst.rugSerie || ''} onChange={e => set('rugSerie', e.target.value)} /></label><label style={lb}>Termohigrometro - Marca<input style={ip} value={inst.termoMarca || ''} onChange={e => set('termoMarca', e.target.value)} /></label><label style={lb}>Termohigrometro - Serie<input style={ip} value={inst.termoSerie || ''} onChange={e => set('termoSerie', e.target.value)} /></label></div><div style={{ fontSize: 12, fontWeight: 600, color: '#5a6b85', margin: '16px 0 8px' }}>Fotos de los equipos (aparecen en la ultima hoja de los protocolos)</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 14 }}>{[['Medidor de espesor', 'espFotos'], ['Rugosimetro', 'rugFotos'], ['Termohigrometro', 'termoFotos']].map(eq => { const fotos = inst[eq[1]] || []; return (<div key={eq[1]} style={{ border: '1px solid #E2DED4', padding: 10 }}><div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{eq[0]}</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{fotos.map((d, idx) => (<div key={idx} style={{ position: 'relative' }}><img src={d} style={{ width: 70, height: 70, objectFit: 'contain', background: '#F5F7FA', border: '1px solid #CBD2D6' }} /><button onClick={() => set(eq[1], fotos.filter((_, j) => j !== idx))} style={{ position: 'absolute', top: -6, right: -6, background: '#B5432E', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 11 }}>x</button></div>))}{fotos.length < 3 && (<label style={{ width: 70, height: 70, border: '1px dashed #CBD2D6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#7A8288', fontSize: 20 }}>+<input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { const files = [...(e.target.files || [])].slice(0, 3 - fotos.length); let pend = files.length; if (!pend) return; const acc = []; files.forEach(f => imgToDataP(f, d => { acc.push(d); pend--; if (pend === 0) set(eq[1], [...fotos, ...acc]) })); e.target.value = '' }} /></label>)}</div></div>) })}</div></div>) }

export default function ParametrosModule({ params: pExt, setParams: setPExt }) {
  const [pInt, setPInt] = useState(PARAMS_SEED)
  const params = pExt ?? pInt
  const setParams = setPExt ?? setPInt
  const [tab, setTab] = useState('factoring')

  const tabs = [{ id: 'factoring', label: 'Factoring', icono: <Landmark size={13} /> }, { id: 'uf', label: 'Valor UF', icono: <TrendingUp size={13} /> }, { id: 'instrumentos', label: 'Instrumentos', icono: <Info size={13} /> }]

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
      {tab === 'factoring' && <SeccionFactoring params={params} setParams={setParams} />}
      {tab === 'uf' && <SeccionUF params={params} setParams={setParams} />}
      {tab === 'instrumentos' && <SeccionInstrumentos params={params} setParams={setParams} />}
    </div>
  )
}
