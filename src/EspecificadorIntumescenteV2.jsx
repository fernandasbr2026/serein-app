import React, { useState } from 'react'
import * as XLSX from 'xlsx'
import { buildTablas, PRODUCTOS_SEED, GAL_L } from './intumescente-tablas-v2.js'
import { evaluarLinea } from './intumescente-calc-v2.js'

// ============================================================
// PASO 1 · ESPECIFICADOR — réplica visual EXACTA de
// especificador-intumescente.html (sección 8 del documento de
// instrucción: "los .jsx/.html adjuntos SON el diseño"). Todos los
// hex/tipografías/bordes de acá salen de ese archivo, no del design
// system general del ERP (theme-serein.js) — a propósito, por instrucción
// explícita. Clases con prefijo "eiv2-" para no chocar con el resto del
// panel.
// ============================================================

const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const n1 = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 })
const n2 = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 })
const uid = () => 'ln' + Math.random().toString(36).slice(2, 9)

const TIPOS = [['col4', 'Columna / Pilar'], ['viga3', 'Viga 3 caras'], ['viga4', 'Viga 4 caras'], ['tubest', 'Tubest / Tubular']]
const F_LIST = ['F15', 'F30', 'F60', 'F90', 'F120']

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
.eiv2-root{background:#EEF1F2;color:#1B1F24;font-family:'Inter',system-ui,sans-serif;margin:-20px -20px 0}
.eiv2-wrap{max-width:72rem;margin:0 auto;padding:0 1rem}
.eiv2-header{background:#1B1F24;color:#EEF1F2;border-bottom:2px solid #1B1F24}
.eiv2-kicker{font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#9AA6B0;padding-top:1rem}
.eiv2-h1{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:clamp(26px,4vw,38px);text-transform:uppercase;letter-spacing:.02em;line-height:1;margin:.25rem 0 0}
.eiv2-h1 .eiv2-acc{color:#FF6A2B}
.eiv2-tabs{display:flex;margin-top:.75rem}
.eiv2-tab{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:15px;text-transform:uppercase;letter-spacing:.08em;padding:.5rem 1rem;background:transparent;color:#9AA6B0;border:none;border-top:3px solid transparent;cursor:pointer}
.eiv2-tab.on{background:#EEF1F2;color:#1B1F24;border-top:3px solid #FF6A2B}
.eiv2-main{padding:1.25rem 0 11rem}
.eiv2-card{background:#fff;border:1px solid #C9D1D8;margin-bottom:1rem}
.eiv2-row{display:flex;flex-wrap:wrap;gap:.75rem;align-items:flex-end;padding:.75rem;border-bottom:1px solid #E2E7EB}
.eiv2-row:last-child{border-bottom:none}
.eiv2-field{display:flex;flex-direction:column;gap:.25rem}
.eiv2-field label{font-family:'Barlow Condensed',sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#6B7683}
.eiv2-root input,.eiv2-root select{border:1px solid #C9D1D8;border-radius:0;padding:6px 8px;font-family:'IBM Plex Mono',monospace;font-size:13px;color:#1B1F24;background:#fff;width:100%;box-sizing:border-box}
.eiv2-root input:focus,.eiv2-root select:focus{outline:2px solid #FF6A2B;outline-offset:-1px}
.eiv2-btn{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:.08em;padding:8px 16px;border:none;cursor:pointer;background:#FF6A2B;color:#fff}
.eiv2-btn.dark{background:#1B1F24}
.eiv2-btn-sm{font-family:'Inter',sans-serif;font-size:12px;padding:4px 8px;border:1px solid #C9D1D8;background:transparent;color:#5C6670;cursor:pointer}
.eiv2-btn-sm.del{color:#B3341F}
.eiv2-root table{width:100%;border-collapse:collapse;font-family:'IBM Plex Mono',monospace;font-size:12px}
.eiv2-root th{text-align:left;color:#6B7683;font-weight:400;padding:4px 8px 4px 0}
.eiv2-root th.r,.eiv2-root td.r{text-align:right}
.eiv2-root td{padding:6px 8px 6px 0;border-top:1px solid #E2E7EB}
.eiv2-root td.nom{font-family:'Inter',sans-serif}
.eiv2-root tr.sel{background:#FFF3EC}
.eiv2-badge{background:#FF6A2B;color:#fff;font-size:10px;font-weight:700;padding:1px 4px;margin-right:4px}
.eiv2-um{color:#FF6A2B;font-weight:600}
.eiv2-aviso{background:#FBE9E0;color:#8A3413;font-size:13px;padding:10px 12px}
.eiv2-nota{font-size:12px;color:#6B7683;max-width:56rem;margin-bottom:1rem}
.eiv2-ok{color:#2E7D4F;font-size:12px}
.eiv2-err{color:#B3341F;font-size:12px}
.eiv2-sechead{font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:#5C6670;margin-bottom:.5rem}
.eiv2-footer{position:sticky;bottom:0;left:0;right:0;background:#1B1F24;color:#EEF1F2;border-top:2px solid #FF6A2B;margin:0 -20px}
.eiv2-footer .eiv2-wrap{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1.5rem;padding:.75rem 1rem;font-family:'IBM Plex Mono',monospace}
.eiv2-footer .eiv2-res{font-size:12px;color:#9AA6B0}
.eiv2-footer .eiv2-res b{color:#EEF1F2}
.eiv2-footer .eiv2-tot{margin-left:auto;display:flex;align-items:center;gap:1rem;font-size:14px}
.eiv2-footer .eiv2-tot .eiv2-g{color:#9AA6B0}
.eiv2-footer .eiv2-tot .eiv2-big{font-size:18px;font-weight:600;color:#FF6A2B}
@media(max-width:640px){.eiv2-field{min-width:45%}}
`

const precioL = (p, tc) => (p.moneda === 'USD' ? p.precioEnvase * tc : p.precioEnvase) / p.litrosEnvase

export default function EspecificadorIntumescenteV2() {
  const [tablas, setTablas] = useState(() => buildTablas())
  const [productos, setProductos] = useState(() => PRODUCTOS_SEED.map(p => ({ ...p })))
  const [tc, setTc] = useState(935)
  const [merma, setMerma] = useState(0)
  const [tab, setTab] = useState('esp')
  const [msgExcel, setMsgExcel] = useState('')
  const [lineas, setLineas] = useState(() => [
    { id: uid(), desc: 'Pilares eje A', tipo: 'col4', masividad: 218, f: 'F60', m2: 120, elegido: 'auto' },
    { id: uid(), desc: 'Vigas nave', tipo: 'viga3', masividad: 150, f: 'F60', m2: 300, elegido: 'auto' },
  ])

  const setLn = (id, k, v) => setLineas(xs => xs.map(x => x.id === id ? { ...x, [k]: (k === 'desc' || k === 'tipo' || k === 'f' || k === 'elegido') ? v : Number(v) } : x))
  const addLn = () => setLineas(xs => [...xs, { id: uid(), desc: 'Nueva línea', tipo: 'col4', masividad: 150, f: 'F60', m2: 100, elegido: 'auto' }])
  const dupLn = id => setLineas(xs => { const ln = xs.find(x => x.id === id); return [...xs, { ...ln, id: uid(), desc: ln.desc + ' (copia)' }] })
  const delLn = id => setLineas(xs => xs.filter(x => x.id !== id))
  const setProd = (id, k, v) => setProductos(xs => xs.map(p => p.id === id ? { ...p, [k]: k === 'moneda' ? v : Number(v) } : p))

  function cargarExcel(input) {
    const file = input.files && input.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
        let cargadas = 0
        const nuevosProductos = []
        const nuevasTablas = {}
        const tipoNorm = s => { s = String(s || '').toLowerCase(); if (s.includes('col') || s.includes('pilar')) return 'col4'; if (s.includes('tub')) return 'tubest'; if (s.includes('4')) return 'viga4'; if (s.includes('vig') || s.includes('3')) return 'viga3'; return null }
        for (const r of rows.slice(1)) {
          const [nom, marca, tipoRaw, masRaw, f30, f60, f90, f120] = r
          const tipo = tipoNorm(tipoRaw), mas = Number(masRaw)
          if (!nom || !tipo || !mas) continue
          const pid = String(nom).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)
          if (!productos.find(p => p.id === pid) && !nuevosProductos.find(p => p.id === pid))
            nuevosProductos.push({ id: pid, marca: String(marca || '—'), nombre: String(nom), sv: 69, moneda: 'CLP', precioEnvase: 195000, litrosEnvase: 20 })
          nuevasTablas[pid] = nuevasTablas[pid] || {}
          nuevasTablas[pid][tipo] = nuevasTablas[pid][tipo] || {}
          ;[['F30', f30], ['F60', f60], ['F90', f90], ['F120', f120]].forEach(([F, v]) => {
            if (Number(v) > 0) { nuevasTablas[pid][tipo][F] = nuevasTablas[pid][tipo][F] || {}; nuevasTablas[pid][tipo][F][mas] = Number(v); cargadas++ }
          })
        }
        if (nuevosProductos.length) setProductos(xs => [...xs, ...nuevosProductos])
        setTablas(prev => {
          const nuevo = { ...prev }
          for (const [pid, tipos] of Object.entries(nuevasTablas)) {
            nuevo[pid] = { ...(nuevo[pid] || {}) }
            for (const [tipo, fs] of Object.entries(tipos)) nuevo[pid][tipo] = { ...(nuevo[pid][tipo] || {}), ...Object.fromEntries(Object.entries(fs).map(([F, filas]) => [F, { ...(nuevo[pid][tipo]?.[F] || {}), ...filas }])) }
          }
          return nuevo
        })
        setMsgExcel(`✓ ${cargadas} espesores cargados. Revise precio y sólidos del producto en la tabla superior.`)
      } catch (err) { setMsgExcel('Error al leer el archivo: ' + err.message) }
    }
    reader.readAsArrayBuffer(file)
  }

  const filas = lineas.map(ln => ({ ln, r: evaluarLinea(ln, productos, tablas, { merma, tc }) }))
  const total = filas.reduce((s, x) => s + (x.r.elegida?.costo || 0), 0)
  const m2Tot = filas.reduce((s, x) => s + (Number(x.ln.m2) || 0), 0)
  const porProd = {}
  filas.forEach(({ r }) => { const e = r.elegida; if (!e) return; porProd[e.producto.id] = porProd[e.producto.id] || { p: e.producto, litros: 0 }; porProd[e.producto.id].litros += e.litros })

  return (
    <div className="eiv2-root">
      <style>{CSS}</style>
      <header className="eiv2-header">
        <div className="eiv2-wrap">
          <div className="eiv2-kicker">Tablas certificadas · PPG SG864 (IDIEM, Tc 500 °C) · Renner Stofire / C-Therm · NCh935/1</div>
          <h1 className="eiv2-h1">Especificador <span className="eiv2-acc">intumescente</span> · óptimo por costo</h1>
          <div className="eiv2-tabs">
            <button className={'eiv2-tab' + (tab === 'esp' ? ' on' : '')} onClick={() => setTab('esp')}>Especificador</button>
            <button className={'eiv2-tab' + (tab === 'prod' ? ' on' : '')} onClick={() => setTab('prod')}>Productos y precios</button>
          </div>
        </div>
      </header>

      <main className="eiv2-wrap eiv2-main">
        {tab === 'esp' ? (
          <>
            <div className="eiv2-card"><div className="eiv2-row">
              <div className="eiv2-field" style={{ width: 130 }}><label>Tipo cambio USD ($)</label><input type="number" value={tc} onChange={e => setTc(Number(e.target.value) || 0)} /></div>
              <div className="eiv2-field" style={{ width: 130 }}><label>Pérdida / merma (%)</label><input type="number" step="5" value={merma} onChange={e => setMerma(Number(e.target.value) || 0)} /></div>
              <p className="eiv2-nota" style={{ flex: 1, minWidth: 260, margin: 0 }}>Valores netos (IVA aparte). Merma 0 % = consumo teórico, comparable con estudios de proveedor; en obra considere 10–30 % según elemento.</p>
            </div></div>

            {filas.map(({ ln, r }) => (
              <div key={ln.id} className="eiv2-card">
                <div className="eiv2-row">
                  <div className="eiv2-field" style={{ width: 180 }}><label>Línea</label><input style={{ fontFamily: "'Inter',sans-serif" }} value={ln.desc} onChange={e => setLn(ln.id, 'desc', e.target.value)} /></div>
                  <div className="eiv2-field" style={{ width: 150 }}><label>Elemento</label>
                    <select value={ln.tipo} onChange={e => setLn(ln.id, 'tipo', e.target.value)}>
                      {TIPOS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
                    </select>
                  </div>
                  <div className="eiv2-field" style={{ width: 110 }}><label>Masividad (m⁻¹)</label><input type="number" value={ln.masividad} onChange={e => setLn(ln.id, 'masividad', e.target.value)} /></div>
                  <div className="eiv2-field" style={{ width: 85 }}><label>RF</label>
                    <select value={ln.f} onChange={e => setLn(ln.id, 'f', e.target.value)}>
                      {F_LIST.map(f => <option key={f} value={f}>{f.replace('F', 'F-')}</option>)}
                    </select>
                  </div>
                  <div className="eiv2-field" style={{ width: 110 }}><label>Superficie (m²)</label><input type="number" value={ln.m2} onChange={e => setLn(ln.id, 'm2', e.target.value)} /></div>
                  <div className="eiv2-field" style={{ width: 230 }}><label>Producto</label>
                    <select value={ln.elegido} onChange={e => setLn(ln.id, 'elegido', e.target.value)}>
                      <option value="auto">Automático (más económico)</option>
                      {productos.map(p => <option key={p.id} value={p.id}>{p.marca} {p.nombre}</option>)}
                    </select>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button className="eiv2-btn-sm" onClick={() => dupLn(ln.id)}>Duplicar</button>
                    <button className="eiv2-btn-sm del" onClick={() => delLn(ln.id)}>Eliminar</button>
                  </div>
                </div>
                <div style={{ padding: '.75rem', overflowX: 'auto' }}>
                  <table>
                    <thead><tr><th>Producto</th><th className="r">Espesor</th><th className="r">l/m²</th><th className="r">$/m² neto</th><th className="r">Litros</th><th className="r">Galones</th><th className="r">Envases</th><th className="r">Costo línea</th></tr></thead>
                    <tbody>
                      {r.ops.map(o => {
                        const esMejor = r.mejor && o.producto.id === r.mejor.producto.id && o.um
                        const esSel = r.elegida && o.producto.id === r.elegida.producto.id
                        return (
                          <tr key={o.producto.id} className={esSel ? 'sel' : ''}>
                            <td className="nom">{esMejor ? <span className="eiv2-badge">★ RECOMENDADO</span> : null}{o.producto.marca} {o.producto.nombre}</td>
                            {o.um ? (<>
                              <td className="r"><span className="eiv2-um">{o.um} µm</span></td>
                              <td className="r">{n2.format(o.lPorM2)}</td>
                              <td className="r"><b>{clp.format(o.costoM2)}</b></td>
                              <td className="r">{n1.format(o.litros)}</td>
                              <td className="r">{n1.format(o.galones)}</td>
                              <td className="r">{o.envases}</td>
                              <td className="r"><b>{clp.format(o.costo)}</b></td>
                            </>) : (
                              <td colSpan={7} className="r" style={{ color: '#9AA6B0' }}>{o.motivo === 'fuera' ? 'masividad fuera de tabla certificada' : 'no certificado para esta combinación'}</td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <button className="eiv2-btn" onClick={addLn}>+ Agregar línea</button>
            <p className="eiv2-nota" style={{ marginTop: '1rem' }}>PPG SG864 calculado a temperatura crítica 500 °C (criterio estándar conservador; F120 en vigas usa la Tc mínima del certificado: 525 °C en 4 caras, 620 °C en 3 caras). Con memoria de cálculo es posible justificar Tc mayores y reducir espesores. Tubest se evalúa con la tabla de columnas 4 lados en PPG (conservador) y con la tabla Tubulares en C-Therm. Comparación de costo de material; espesores altos implican además más manos y días de aplicación.</p>
          </>
        ) : (
          <>
            <div className="eiv2-card"><div style={{ padding: '.75rem', overflowX: 'auto' }}>
              <table>
                <thead><tr><th>Producto</th><th>Sólidos vol. %</th><th>Moneda</th><th>Precio envase (neto)</th><th>Litros/envase</th><th className="r">$/L equivalente</th></tr></thead>
                <tbody>
                  {productos.map(p => (
                    <tr key={p.id}>
                      <td className="nom"><b>{p.marca}</b> {p.nombre}</td>
                      <td style={{ width: 90 }}><input type="number" step="0.5" value={p.sv} onChange={e => setProd(p.id, 'sv', e.target.value)} /></td>
                      <td style={{ width: 80 }}><select value={p.moneda} onChange={e => setProd(p.id, 'moneda', e.target.value)}><option>CLP</option><option>USD</option></select></td>
                      <td style={{ width: 120 }}><input type="number" value={p.precioEnvase} onChange={e => setProd(p.id, 'precioEnvase', e.target.value)} /></td>
                      <td style={{ width: 90 }}><input type="number" step="0.01" value={p.litrosEnvase} onChange={e => setProd(p.id, 'litrosEnvase', e.target.value)} /></td>
                      <td className="r"><b>{clp.format(precioL(p, tc))}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></div>
            <div className="eiv2-card" style={{ maxWidth: '48rem' }}><div style={{ padding: '1rem' }}>
              <div className="eiv2-sechead">Cargar tablas desde Excel (Sherwin-Williams u otros)</div>
              <p className="eiv2-nota">Formato: primera hoja con columnas <b>producto | marca | tipo (columna / viga3 / viga4 / tubest) | masividad | F30 | F60 | F90 | F120</b> (espesores en µm; celdas vacías = no certificado). Una fila por masividad. Tras cargar, edite precio y sólidos del producto en la tabla superior.</p>
              <input type="file" accept=".xlsx,.xls" style={{ border: 'none', padding: 0, fontFamily: "'Inter',sans-serif", fontSize: 13 }} onChange={e => cargarExcel(e.target)} />
              {msgExcel && <div className={msgExcel.startsWith('✓') ? 'eiv2-ok' : 'eiv2-err'} style={{ marginTop: '.5rem' }}>{msgExcel}</div>}
            </div></div>
          </>
        )}
      </main>

      <footer className="eiv2-footer"><div className="eiv2-wrap">
        <div className="eiv2-res">{n1.format(m2Tot)} m² · {Object.values(porProd).map(({ p, litros }) => `${p.nombre.split('(')[0].trim()}: `).length ? Object.values(porProd).map(({ p, litros }) => (
          <span key={p.id}>{p.nombre.split('(')[0].trim()}: <b>{n1.format(litros / GAL_L)} gal</b> ({Math.ceil(litros / p.litrosEnvase)} env.) </span>
        )) : null}</div>
        <div className="eiv2-tot"><span className="eiv2-g">Neto {clp.format(total)}</span><span className="eiv2-g">IVA {clp.format(total * 0.19)}</span><span className="eiv2-big">{clp.format(total * 1.19)}</span></div>
      </div></footer>
    </div>
  )
}
