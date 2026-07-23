import React, { useState } from 'react'
import * as XLSX from 'xlsx'
import { buildTablas, PRODUCTOS_SEED, GAL_L } from './intumescente-tablas-v2.js'
import { evaluarLinea } from './intumescente-calc-v2.js'
import { TC_DISPONIBLES, TC_DEFAULT, tablaSG864ParaTc } from './intumescente-tc-avanzada.js'

// ============================================================
// ESPECIFICADOR INTUMESCENTE v2 — réplica visual EXACTA de los dos
// archivos adjuntos (sección 8 del documento de instrucción: "los
// .jsx/.html adjuntos SON el diseño"):
//   · Paso 1 (Especificador + Productos y precios): especificador-
//     intumescente.html — comparador de productos por costo.
//   · Paso 2 (Aplicador, Otros costos, Parámetros, Oferta): cotizador-
//     pintura-intumescente.jsx — costos de obra y oferta al cliente.
// Todos los hex/tipografías/bordes de acá salen de esos dos archivos, no
// del design system general del ERP (theme-serein.js) — a propósito, por
// instrucción explícita. Clases con prefijo "eiv2-" para no chocar con el
// resto del panel.
//
// Los dos archivos originales traen motores de cálculo DISTINTOS (uno por
// $/L con comparador multi-producto, otro por $/kg con perfiles/masividad
// propios). Se sigue el motor del Paso 1 (intumescente-calc-v2.js) como
// única fuente de verdad para el costo de material de cada línea — el
// Paso 2 solo agrega aplicador/otros costos/GG/utilidad/IVA/oferta encima
// de ese resultado, tal como pide la sección 5 del documento ("portar" el
// diseño de esas secciones, no su motor de espesores).
// ============================================================

const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const n0 = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })
const n1 = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 })
const n2 = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 })
const uid = () => 'ln' + Math.random().toString(36).slice(2, 9)

const TIPOS = [['col4', 'Columna / Pilar'], ['viga3', 'Viga 3 caras'], ['viga4', 'Viga 4 caras'], ['tubest', 'Tubest / Tubular']]
const F_LIST = ['F15', 'F30', 'F60', 'F90', 'F120']
const TC_MIN_REQUIERE_MEMORIA = TC_DEFAULT // Tc > 500 exige memoria de cálculo (regla 2.8)

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
.eiv2-root{background:#EEF1F2;color:#1B1F24;font-family:'Inter',system-ui,sans-serif;margin:-20px -20px 0}
.eiv2-wrap{max-width:72rem;margin:0 auto;padding:0 1rem}
.eiv2-header{background:#1B1F24;color:#EEF1F2;border-bottom:2px solid #1B1F24}
.eiv2-header-top{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:.75rem;padding-top:1rem}
.eiv2-kicker{font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#9AA6B0}
.eiv2-h1{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:clamp(24px,3.6vw,36px);text-transform:uppercase;letter-spacing:.02em;line-height:1;margin:.25rem 0 0}
.eiv2-h1 .eiv2-acc{color:#FF6A2B}
.eiv2-hcli{display:flex;gap:.5rem;flex-wrap:wrap;padding-bottom:.25rem}
.eiv2-hcli input{background:transparent;border:1px solid #3A434C;color:#EEF1F2;padding:6px 10px;font-size:13px;width:180px}
.eiv2-tabs{display:flex;margin-top:.75rem;overflow-x:auto}
.eiv2-tab{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:15px;text-transform:uppercase;letter-spacing:.08em;padding:.5rem 1rem;background:transparent;color:#9AA6B0;border:none;border-top:3px solid transparent;cursor:pointer;white-space:nowrap}
.eiv2-tab.on{background:#EEF1F2;color:#1B1F24;border-top:3px solid #FF6A2B}
.eiv2-main{padding:1.25rem 0 11rem}
.eiv2-card{background:#fff;border:1px solid #C9D1D8;margin-bottom:1rem}
.eiv2-row{display:flex;flex-wrap:wrap;gap:.75rem;align-items:flex-end;padding:.75rem;border-bottom:1px solid #E2E7EB}
.eiv2-row:last-child{border-bottom:none}
.eiv2-field{display:flex;flex-direction:column;gap:.25rem}
.eiv2-field label{font-family:'Barlow Condensed',sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#6B7683}
.eiv2-root input,.eiv2-root select,.eiv2-root textarea{border:1px solid #C9D1D8;border-radius:0;padding:6px 8px;font-family:'IBM Plex Mono',monospace;font-size:13px;color:#1B1F24;background:#fff;width:100%;box-sizing:border-box}
.eiv2-root textarea{resize:vertical;font-family:'Inter',sans-serif}
.eiv2-root input:focus,.eiv2-root select:focus,.eiv2-root textarea:focus{outline:2px solid #FF6A2B;outline-offset:-1px}
.eiv2-btn{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:.08em;padding:8px 16px;border:none;cursor:pointer;background:#FF6A2B;color:#fff}
.eiv2-btn.dark{background:#1B1F24}
.eiv2-btn-sm{font-family:'Inter',sans-serif;font-size:12px;padding:4px 8px;border:1px solid #C9D1D8;background:transparent;color:#5C6670;cursor:pointer}
.eiv2-btn-sm.del{color:#B3341F}
.eiv2-modo{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.06em;padding:7px 14px;border:1px solid #C9D1D8;background:#fff;color:#5C6670;cursor:pointer}
.eiv2-modo.on{background:#1B1F24;color:#FF6A2B}
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
.eiv2-placa{display:flex;align-items:center;gap:1.25rem;padding:.75rem 1rem;background:#1B1F24;color:#EEF1F2;font-family:'IBM Plex Mono',monospace;flex-wrap:wrap}
.eiv2-placa .k{font-size:10px;color:#9AA6B0}
.eiv2-placa .v{font-size:18px;font-weight:600}
.eiv2-footer{position:sticky;bottom:0;left:0;right:0;background:#1B1F24;color:#EEF1F2;border-top:2px solid #FF6A2B;margin:0 -20px}
.eiv2-footer .eiv2-wrap{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1.5rem;padding:.75rem 1rem;font-family:'IBM Plex Mono',monospace}
.eiv2-footer .eiv2-res{font-size:12px;color:#9AA6B0}
.eiv2-footer .eiv2-res b{color:#EEF1F2}
.eiv2-footer .eiv2-tot{margin-left:auto;display:flex;align-items:center;gap:1rem;font-size:13px;flex-wrap:wrap}
.eiv2-footer .eiv2-tot .eiv2-g{color:#9AA6B0}
.eiv2-footer .eiv2-tot .eiv2-big{font-size:18px;font-weight:600;color:#FF6A2B}
@media(max-width:640px){.eiv2-field{min-width:45%}}
`

const precioL = (p, tc) => (p.moneda === 'USD' ? p.precioEnvase * tc : p.precioEnvase) / p.litrosEnvase

const DEFAULT_APLICADOR = { modo: 'obra', montoObra: 1800000, valorM2: 3200, porCapas: true, valorKg: 1500, valorDia: 140000, dias: 8, recargoPct: 0, nombre: '' }
const DEFAULT_OTROS = { certificacion: 450000, incCertificacion: true, retoquesPct: 3, equipos: 300000, movilizacion: 150000 }
const DEFAULT_OFERTA = {
  validezDias: 15,
  formaPago: '50% anticipo contra orden de compra · 50% contra entrega y recepción conforme.',
  plazoEntrega: 'A convenir según programa de obra.',
  condiciones: '· Precios netos, IVA adicional según se indica.\n· Espesores según tabla certificada del sistema aplicado y masividad de cada línea (NCh935/1).\n· Inspección y certificación de espesores en obra según NCh3040 por organismo acreditado.\n· Aplicación mediante equipo airless; brocha/rodillo solo en retoques y zonas puntuales.',
  exclusiones: '· Superficies entregadas libres de óxido, grasa, polvo y calamina (salvo partida de preparación cotizada).\n· Energía eléctrica, agua, iluminación y accesos en obra por cuenta del mandante.\n· Andamios o plataformas adicionales no indicados en esta oferta.\n· Retoques por daños de terceros posteriores a la entrega del trabajo.\n· Cualquier partida no descrita explícitamente en esta cotización.',
}

export default function EspecificadorIntumescenteV2() {
  const [tablas, setTablas] = useState(() => buildTablas())
  const [productos, setProductos] = useState(() => PRODUCTOS_SEED.map(p => ({ ...p })))
  const [tc, setTc] = useState(935)
  const [merma, setMerma] = useState(0)
  const [tab, setTab] = useState('esp')
  const [msgExcel, setMsgExcel] = useState('')
  const [cliente, setCliente] = useState('')
  const [obra, setObra] = useState('')
  const [lineas, setLineas] = useState(() => [
    { id: uid(), desc: 'Pilares eje A', tipo: 'col4', masividad: 218, f: 'F60', m2: 120, elegido: 'auto', tcSG864: TC_DEFAULT, memoriaCalculo: false },
    { id: uid(), desc: 'Vigas nave', tipo: 'viga3', masividad: 150, f: 'F60', m2: 300, elegido: 'auto', tcSG864: TC_DEFAULT, memoriaCalculo: false },
  ])
  const [aplicador, setAplicador] = useState(DEFAULT_APLICADOR)
  const [otros, setOtros] = useState(DEFAULT_OTROS)
  const [ggPct, setGgPct] = useState(12)
  const [utilPct, setUtilPct] = useState(25)
  const [conIVA, setConIVA] = useState(true)
  const [moneda, setMoneda] = useState('CLP')
  const [valorUF, setValorUF] = useState(39000)
  const [oferta, setOferta] = useState(DEFAULT_OFERTA)

  const money = v => (moneda === 'UF' ? `UF ${n2.format(v / (valorUF || 1))}` : clp.format(v))

  const setLn = (id, k, v) => setLineas(xs => xs.map(x => x.id === id ? { ...x, [k]: (k === 'desc' || k === 'tipo' || k === 'f' || k === 'elegido') ? v : (k === 'memoriaCalculo' ? v : Number(v)) } : x))
  const addLn = () => setLineas(xs => [...xs, { id: uid(), desc: 'Nueva línea', tipo: 'col4', masividad: 150, f: 'F60', m2: 100, elegido: 'auto', tcSG864: TC_DEFAULT, memoriaCalculo: false }])
  const dupLn = id => setLineas(xs => { const ln = xs.find(x => x.id === id); return [...xs, { ...ln, id: uid(), desc: ln.desc + ' (copia)' }] })
  const delLn = id => setLineas(xs => xs.filter(x => x.id !== id))
  const setProd = (id, k, v) => setProductos(xs => xs.map(p => p.id === id ? { ...p, [k]: (k === 'moneda') ? v : Number(v) } : p))

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
            nuevosProductos.push({ id: pid, marca: String(marca || '—'), nombre: String(nom), sv: 69, moneda: 'CLP', precioEnvase: 195000, litrosEnvase: 20, capaMaxUm: 280, densidad: 1.3 })
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

  // Tablas efectivas por línea: si la línea pide una Tc SG864 distinta de
  // la baseline (500), se reemplaza solo la tabla de sg864 (función
  // avanzada, sección 2.8) — el resto de los productos no la usan.
  const tablasParaLinea = ln => (ln.tcSG864 && ln.tcSG864 !== TC_DEFAULT) ? { ...tablas, sg864: tablaSG864ParaTc(ln.tcSG864) } : tablas

  const filas = lineas.map(ln => ({ ln, r: evaluarLinea(ln, productos, tablasParaLinea(ln), { merma, tc }) }))
  const materialesTotal = filas.reduce((s, x) => s + (x.r.elegida?.costo || 0), 0)
  const m2Tot = filas.reduce((s, x) => s + (Number(x.ln.m2) || 0), 0)
  const m2Capas = filas.reduce((s, x) => s + ((x.r.elegida ? (Number(x.ln.m2) || 0) * x.r.elegida.capas : 0)), 0)
  const kgTotal = filas.reduce((s, x) => s + (x.r.elegida?.kg || 0), 0)
  const porProd = {}
  filas.forEach(({ r }) => { const e = r.elegida; if (!e) return; porProd[e.producto.id] = porProd[e.producto.id] || { p: e.producto, litros: 0, kg: 0 }; porProd[e.producto.id].litros += e.litros; porProd[e.producto.id].kg += e.kg })

  // ————— costos de obra (Paso 2, sección 5 del documento) —————
  let aplicadorBase = 0
  if (aplicador.modo === 'obra') aplicadorBase = Number(aplicador.montoObra) || 0
  if (aplicador.modo === 'm2') aplicadorBase = (Number(aplicador.valorM2) || 0) * (aplicador.porCapas ? m2Capas : m2Tot)
  if (aplicador.modo === 'kg') aplicadorBase = (Number(aplicador.valorKg) || 0) * kgTotal
  if (aplicador.modo === 'dia') aplicadorBase = (Number(aplicador.valorDia) || 0) * (Number(aplicador.dias) || 0)
  const aplicadorRecargo = aplicadorBase * ((Number(aplicador.recargoPct) || 0) / 100)
  const aplicadorTotal = aplicadorBase + aplicadorRecargo

  const retoques = materialesTotal * ((Number(otros.retoquesPct) || 0) / 100)
  const certificacion = otros.incCertificacion ? Number(otros.certificacion) || 0 : 0
  const otrosTotal = retoques + certificacion + (Number(otros.equipos) || 0) + (Number(otros.movilizacion) || 0)

  const directo = materialesTotal + aplicadorTotal + otrosTotal
  const gg = directo * (ggPct / 100)
  const util = (directo + gg) * (utilPct / 100)
  const neto = directo + gg + util
  const iva = conIVA ? neto * 0.19 : 0
  const totalGeneral = neto + iva

  const modoBtn = (k, label) => (
    <button key={k} className={'eiv2-modo' + (aplicador.modo === k ? ' on' : '')} onClick={() => setAplicador({ ...aplicador, modo: k })}>{label}</button>
  )

  const hoy = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className="eiv2-root">
      <style>{CSS}</style>
      <header className="eiv2-header">
        <div className="eiv2-wrap eiv2-header-top">
          <div>
            <div className="eiv2-kicker">Tablas certificadas · PPG SG864 (IDIEM, NCh935/1) · Renner Stofire / C-Therm</div>
            <h1 className="eiv2-h1">Especificador <span className="eiv2-acc">intumescente</span></h1>
          </div>
          <div className="eiv2-hcli">
            <input placeholder="Cliente" value={cliente} onChange={e => setCliente(e.target.value)} />
            <input placeholder="Obra / proyecto" value={obra} onChange={e => setObra(e.target.value)} />
          </div>
        </div>
        <div className="eiv2-wrap eiv2-tabs">
          {[['esp', 'Especificador'], ['aplicador', 'Aplicador'], ['prod', 'Productos y precios'], ['parametros', 'Parámetros'], ['oferta', 'Oferta']].map(([k, l]) => (
            <button key={k} className={'eiv2-tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </header>

      <main className="eiv2-wrap eiv2-main">
        {tab === 'esp' && (
          <>
            <div className="eiv2-card"><div className="eiv2-row">
              <div className="eiv2-field" style={{ width: 130 }}><label>Tipo cambio USD ($)</label><input type="number" value={tc} onChange={e => setTc(Number(e.target.value) || 0)} /></div>
              <div className="eiv2-field" style={{ width: 130 }}><label>Pérdida / merma (%)</label><input type="number" step="5" value={merma} onChange={e => setMerma(Number(e.target.value) || 0)} /></div>
              <p className="eiv2-nota" style={{ flex: 1, minWidth: 260, margin: 0 }}>Valores netos (IVA aparte). Merma 0 % = consumo teórico, comparable con estudios de proveedor; en obra considere 10–30 % según elemento.</p>
            </div></div>

            {filas.map(({ ln, r }) => {
              const esSG864 = ln.elegido === 'sg864' || (ln.elegido === 'auto' && r.mejor?.producto.id === 'sg864')
              const tcAlta = ln.tcSG864 && ln.tcSG864 > TC_MIN_REQUIERE_MEMORIA
              return (
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

                  {esSG864 && (
                    <div className="eiv2-row" style={{ background: '#F4F6F7' }}>
                      <div className="eiv2-field" style={{ width: 150 }}><label>Tc SG864 avanzada (°C)</label>
                        <select value={ln.tcSG864 || TC_DEFAULT} onChange={e => setLn(ln.id, 'tcSG864', e.target.value)}>
                          {TC_DISPONIBLES.map(t => <option key={t} value={t}>{t}{t === TC_DEFAULT ? ' (estándar)' : ''}</option>)}
                        </select>
                      </div>
                      {tcAlta && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#5C6670', paddingBottom: 6 }}>
                          <input type="checkbox" style={{ width: 'auto' }} checked={!!ln.memoriaCalculo} onChange={e => setLn(ln.id, 'memoriaCalculo', e.target.checked)} />
                          Respaldado por memoria de cálculo del calculista
                        </label>
                      )}
                      {tcAlta && !ln.memoriaCalculo && (
                        <div className="eiv2-aviso" style={{ flex: 1 }}>Tc {ln.tcSG864} °C &gt; 500 °C: marque el checkbox de memoria de cálculo para justificar este espesor reducido.</div>
                      )}
                    </div>
                  )}

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
              )
            })}

            <button className="eiv2-btn" onClick={addLn}>+ Agregar línea</button>

            {/* Otros costos de obra — portado de cotizador-pintura-intumescente.jsx, sección 5 */}
            <div className="eiv2-card" style={{ marginTop: '1rem' }}><div className="eiv2-row" style={{ flexWrap: 'wrap' }}>
              <div className="eiv2-sechead" style={{ width: '100%', marginBottom: 0 }}>Otros costos de obra</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 6 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={otros.incCertificacion} onChange={e => setOtros({ ...otros, incCertificacion: e.target.checked })} />
                Certificación NCh3040
              </label>
              <div className="eiv2-field" style={{ width: 140 }}><label>Certificación ($)</label><input type="number" step="10000" value={otros.certificacion} onChange={e => setOtros({ ...otros, certificacion: Number(e.target.value) || 0 })} /></div>
              <div className="eiv2-field" style={{ width: 170 }}><label>Retoques post-montaje (% s/pintura)</label><input type="number" step="0.5" value={otros.retoquesPct} onChange={e => setOtros({ ...otros, retoquesPct: Number(e.target.value) || 0 })} /></div>
              <div className="eiv2-field" style={{ width: 150 }}><label>Equipos y andamios ($)</label><input type="number" step="10000" value={otros.equipos} onChange={e => setOtros({ ...otros, equipos: Number(e.target.value) || 0 })} /></div>
              <div className="eiv2-field" style={{ width: 130 }}><label>Movilización ($)</label><input type="number" step="10000" value={otros.movilizacion} onChange={e => setOtros({ ...otros, movilizacion: Number(e.target.value) || 0 })} /></div>
              <div style={{ marginLeft: 'auto', fontSize: 13, fontFamily: "'IBM Plex Mono',monospace", paddingBottom: 6 }}><span style={{ color: '#6B7683' }}>Subtotal otros </span><b>{money(otrosTotal)}</b></div>
            </div></div>

            <p className="eiv2-nota" style={{ marginTop: '1rem' }}>PPG SG864 calculado por defecto a temperatura crítica 500 °C (criterio estándar conservador; F120 en vigas usa la Tc mínima del certificado: 525 °C en 4 caras, 620 °C en 3 caras — ya reflejado en la tabla base). Con memoria de cálculo es posible seleccionar una Tc mayor por línea y reducir espesores (control "Tc SG864 avanzada" arriba de cada línea con PPG elegido). Tubest se evalúa con la tabla de columnas 4 lados en PPG (conservador) y con la tabla Tubulares en C-Therm. Comparación de costo de material; espesores altos implican además más manos y días de aplicación.</p>
          </>
        )}

        {tab === 'aplicador' && (
          <div style={{ maxWidth: '48rem' }}>
            <div className="eiv2-card"><div className="eiv2-row" style={{ flexWrap: 'wrap' }}>
              <div className="eiv2-field" style={{ width: 280 }}><label>Aplicador / subcontratista</label>
                <input style={{ fontFamily: "'Inter',sans-serif" }} placeholder="Nombre o razón social" value={aplicador.nombre} onChange={e => setAplicador({ ...aplicador, nombre: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
                {modoBtn('obra', 'Monto por obra')}{modoBtn('m2', 'Por m²')}{modoBtn('kg', 'Por kg')}{modoBtn('dia', 'Por día')}
              </div>
            </div>
            <div className="eiv2-row" style={{ flexWrap: 'wrap' }}>
              {aplicador.modo === 'obra' && (
                <div className="eiv2-field" style={{ width: 200 }}><label>Monto cerrado por obra ($)</label><input type="number" step="50000" value={aplicador.montoObra} onChange={e => setAplicador({ ...aplicador, montoObra: Number(e.target.value) || 0 })} /></div>
              )}
              {aplicador.modo === 'm2' && (<>
                <div className="eiv2-field" style={{ width: 140 }}><label>Valor ($/m²)</label><input type="number" step="100" value={aplicador.valorM2} onChange={e => setAplicador({ ...aplicador, valorM2: Number(e.target.value) || 0 })} /></div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 8 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={aplicador.porCapas} onChange={e => setAplicador({ ...aplicador, porCapas: e.target.checked })} />
                  Multiplicar por N° de capas
                </label>
                <div style={{ paddingBottom: 8, fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: '#5C6670' }}>{aplicador.porCapas ? `${n1.format(m2Capas)} m²·capa` : `${n1.format(m2Tot)} m²`}</div>
              </>)}
              {aplicador.modo === 'kg' && (<>
                <div className="eiv2-field" style={{ width: 160 }}><label>Valor ($/kg aplicado)</label><input type="number" step="100" value={aplicador.valorKg} onChange={e => setAplicador({ ...aplicador, valorKg: Number(e.target.value) || 0 })} /></div>
                <div style={{ paddingBottom: 8, fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: '#5C6670' }}>{n1.format(kgTotal)} kg totales</div>
              </>)}
              {aplicador.modo === 'dia' && (<>
                <div className="eiv2-field" style={{ width: 140 }}><label>Valor día ($)</label><input type="number" step="10000" value={aplicador.valorDia} onChange={e => setAplicador({ ...aplicador, valorDia: Number(e.target.value) || 0 })} /></div>
                <div className="eiv2-field" style={{ width: 120 }}><label>Días estimados</label><input type="number" step="0.5" value={aplicador.dias} onChange={e => setAplicador({ ...aplicador, dias: Number(e.target.value) || 0 })} /></div>
              </>)}
              <div className="eiv2-field" style={{ width: 170 }}><label>Recargo administración (%)</label><input type="number" step="1" value={aplicador.recargoPct} onChange={e => setAplicador({ ...aplicador, recargoPct: Number(e.target.value) || 0 })} /></div>
            </div>
            <div className="eiv2-row" style={{ gap: '1.5rem' }}>
              <div style={{ fontSize: 13, fontFamily: "'IBM Plex Mono',monospace" }}><span style={{ color: '#6B7683' }}>Subcontrato</span><br /><b>{money(aplicadorBase)}</b></div>
              <div style={{ fontSize: 13, fontFamily: "'IBM Plex Mono',monospace" }}><span style={{ color: '#6B7683' }}>Recargo</span><br /><b>{money(aplicadorRecargo)}</b></div>
              <div style={{ fontSize: 13, fontFamily: "'IBM Plex Mono',monospace" }}><span style={{ color: '#6B7683' }}>Total aplicador</span><br /><b style={{ color: '#FF6A2B' }}>{money(aplicadorTotal)}</b></div>
            </div>
            </div>
            <p className="eiv2-nota">Al pactar montos cerrados, revise antes las capas totales de la cotización ({n1.format(m2Capas)} m²·capa en este proyecto): espesores altos por masividad significan más días de trabajo del tercero.</p>
          </div>
        )}

        {tab === 'prod' && (
          <>
            <div className="eiv2-card"><div style={{ padding: '.75rem', overflowX: 'auto' }}>
              <table>
                <thead><tr><th>Producto</th><th>Sólidos vol. %</th><th>Densidad (kg/L)</th><th>µm máx/capa</th><th>Moneda</th><th>Precio envase (neto)</th><th>Litros/envase</th><th className="r">$/L equivalente</th></tr></thead>
                <tbody>
                  {productos.map(p => (
                    <tr key={p.id}>
                      <td className="nom"><b>{p.marca}</b> {p.nombre}</td>
                      <td style={{ width: 90 }}><input type="number" step="0.5" value={p.sv} onChange={e => setProd(p.id, 'sv', e.target.value)} /></td>
                      <td style={{ width: 90 }}><input type="number" step="0.01" value={p.densidad} onChange={e => setProd(p.id, 'densidad', e.target.value)} /></td>
                      <td style={{ width: 90 }}><input type="number" step="10" value={p.capaMaxUm} onChange={e => setProd(p.id, 'capaMaxUm', e.target.value)} /></td>
                      <td style={{ width: 80 }}><select value={p.moneda} onChange={e => setProd(p.id, 'moneda', e.target.value)}><option>CLP</option><option>USD</option></select></td>
                      <td style={{ width: 120 }}><input type="number" value={p.precioEnvase} onChange={e => setProd(p.id, 'precioEnvase', e.target.value)} /></td>
                      <td style={{ width: 90 }}><input type="number" step="0.01" value={p.litrosEnvase} onChange={e => setProd(p.id, 'litrosEnvase', e.target.value)} /></td>
                      <td className="r"><b>{clp.format(precioL(p, tc))}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></div>
            <p className="eiv2-nota">Densidad y µm máx/capa son valores estimados editables (no venían en la tabla certificada de espesores) — corríjalos con el dato real de cada ficha técnica; alimentan el modo "aplicador por kg" y el cálculo de N° de capas.</p>
            <div className="eiv2-card" style={{ maxWidth: '48rem' }}><div style={{ padding: '1rem' }}>
              <div className="eiv2-sechead">Cargar tablas desde Excel (Sherwin-Williams u otros)</div>
              <p className="eiv2-nota">Formato: primera hoja con columnas <b>producto | marca | tipo (columna / viga3 / viga4 / tubest) | masividad | F30 | F60 | F90 | F120</b> (espesores en µm; celdas vacías = no certificado). Una fila por masividad. Tras cargar, edite precio y sólidos del producto en la tabla superior.</p>
              <input type="file" accept=".xlsx,.xls" style={{ border: 'none', padding: 0, fontFamily: "'Inter',sans-serif", fontSize: 13 }} onChange={e => cargarExcel(e.target)} />
              {msgExcel && <div className={msgExcel.startsWith('✓') ? 'eiv2-ok' : 'eiv2-err'} style={{ marginTop: '.5rem' }}>{msgExcel}</div>}
            </div></div>
          </>
        )}

        {tab === 'parametros' && (
          <div style={{ maxWidth: '54rem' }}>
            <div className="eiv2-card"><div className="eiv2-row" style={{ flexWrap: 'wrap' }}>
              <div className="eiv2-field" style={{ width: 130 }}><label>Gastos generales (%)</label><input type="number" step="1" value={ggPct} onChange={e => setGgPct(Number(e.target.value) || 0)} /></div>
              <div className="eiv2-field" style={{ width: 130 }}><label>Utilidad (%)</label><input type="number" step="1" value={utilPct} onChange={e => setUtilPct(Number(e.target.value) || 0)} /></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 8 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={conIVA} onChange={e => setConIVA(e.target.checked)} />
                Agregar IVA 19 %
              </label>
            </div></div>
            <div className="eiv2-card"><div className="eiv2-row" style={{ flexWrap: 'wrap' }}>
              <div className="eiv2-field" style={{ width: 140 }}><label>Moneda de la oferta</label>
                <select value={moneda} onChange={e => setMoneda(e.target.value)}><option value="CLP">CLP ($)</option><option value="UF">UF</option></select>
              </div>
              {moneda === 'UF' && (
                <div className="eiv2-field" style={{ width: 140 }}><label>Valor UF ($)</label><input type="number" step="100" value={valorUF} onChange={e => setValorUF(Number(e.target.value) || 0)} /></div>
              )}
              <p className="eiv2-nota" style={{ flex: 1, minWidth: 240, margin: 0 }}>Los costos se ingresan siempre en pesos; si elige UF, la oferta y los totales se muestran convertidos al valor UF indicado (actualícelo al día de emisión).</p>
            </div></div>
          </div>
        )}

        {tab === 'oferta' && (
          <div style={{ maxWidth: '56rem' }}>
            <div className="eiv2-card">
              <div style={{ padding: '1.25rem', borderBottom: '2px solid #1B1F24', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div className="eiv2-kicker" style={{ color: '#6B7683' }}>Cotización · {hoy}</div>
                  <h2 style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 24, textTransform: 'uppercase', margin: '2px 0' }}>Protección pasiva contra el fuego — pintura intumescente</h2>
                  <div style={{ fontSize: 13, color: '#3A434C' }}>
                    {cliente ? <>Cliente: <b>{cliente}</b></> : <span style={{ color: '#9AA6B0' }}>Cliente: (completar en cabecera)</span>}
                    {' · '}
                    {obra ? <>Obra: <b>{obra}</b></> : <span style={{ color: '#9AA6B0' }}>Obra: (completar en cabecera)</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#6B7683', letterSpacing: '.1em' }}>Total {conIVA ? 'IVA incl.' : 'neto'}</div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, fontWeight: 600, color: '#FF6A2B' }}>{money(totalGeneral)}</div>
                </div>
              </div>
              <div style={{ padding: '1.25rem' }}>
                <table>
                  <thead><tr><th>Partida</th><th>Sistema</th><th className="r">RF</th><th className="r">DFT</th><th className="r">m²</th></tr></thead>
                  <tbody>
                    {filas.map(({ ln, r }) => (
                      <tr key={ln.id}>
                        <td className="nom">{ln.desc} <span style={{ color: '#9AA6B0' }}>({TIPOS.find(([id]) => id === ln.tipo)?.[1]})</span></td>
                        <td className="nom">{r.elegida ? `${r.elegida.producto.marca} ${r.elegida.producto.nombre.split('(')[0].trim()}` : '—'}</td>
                        <td className="r">{ln.f.replace('F', 'F-')}</td>
                        <td className="r">{r.elegida ? `${r.elegida.um} µm` : '—'}</td>
                        <td className="r">{n1.format(ln.m2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, fontSize: 13, fontFamily: "'IBM Plex Mono',monospace" }}>
                  <div><span style={{ color: '#6B7683' }}>Costo directo (materiales, aplicación y otros): </span>{money(directo)}</div>
                  <div><span style={{ color: '#6B7683' }}>Gastos generales y utilidad: </span>{money(gg + util)}</div>
                  <div><span style={{ color: '#6B7683' }}>Neto: </span><b>{money(neto)}</b></div>
                  {conIVA && <div><span style={{ color: '#6B7683' }}>IVA 19 %: </span>{money(iva)}</div>}
                  <div style={{ fontSize: 16 }}><span style={{ color: '#6B7683' }}>TOTAL: </span><b style={{ color: '#FF6A2B' }}>{money(totalGeneral)}</b></div>
                  {moneda === 'UF' && <div style={{ fontSize: 11, color: '#9AA6B0' }}>UF al valor de {clp.format(valorUF)} del día de emisión · equivalente {clp.format(totalGeneral)}</div>}
                </div>
              </div>
              <div style={{ padding: '1.25rem', borderTop: '1px solid #E2E7EB', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="eiv2-field" style={{ width: 140 }}><label>Validez de la oferta (días)</label><input type="number" value={oferta.validezDias} onChange={e => setOferta({ ...oferta, validezDias: Number(e.target.value) || 0 })} /></div>
                  <div className="eiv2-field"><label>Forma de pago</label><input style={{ fontFamily: "'Inter',sans-serif" }} value={oferta.formaPago} onChange={e => setOferta({ ...oferta, formaPago: e.target.value })} /></div>
                  <div className="eiv2-field"><label>Plazo de entrega</label><input style={{ fontFamily: "'Inter',sans-serif" }} value={oferta.plazoEntrega} onChange={e => setOferta({ ...oferta, plazoEntrega: e.target.value })} /></div>
                  <div className="eiv2-field"><label>Condiciones</label><textarea rows={6} value={oferta.condiciones} onChange={e => setOferta({ ...oferta, condiciones: e.target.value })} /></div>
                </div>
                <div className="eiv2-field"><label>Exclusiones</label><textarea rows={12} value={oferta.exclusiones} onChange={e => setOferta({ ...oferta, exclusiones: e.target.value })} /></div>
              </div>
            </div>
            <p className="eiv2-nota">Esta vista es la cara al cliente: muestra sistemas, resistencias, espesores y superficies con el total, sin revelar el desglose interno de costos ni el valor del subcontratista. Los textos de condiciones y exclusiones son completamente editables.</p>
          </div>
        )}
      </main>

      <footer className="eiv2-footer"><div className="eiv2-wrap">
        <div className="eiv2-res">
          {n1.format(m2Tot)} m² ·{' '}
          {Object.values(porProd).map(({ p, litros }, i) => (
            <span key={p.id}>{i > 0 && ' · '}{p.nombre.split('(')[0].trim()}: <b>{n1.format(litros / GAL_L)} gal</b> ({Math.ceil(litros / p.litrosEnvase)} env.)</span>
          ))}
        </div>
        <div className="eiv2-tot">
          <span className="eiv2-g">Mat. {money(materialesTotal)}</span>
          <span className="eiv2-g">Aplicador {money(aplicadorTotal)}</span>
          <span className="eiv2-g">Otros {money(otrosTotal)}</span>
          <span className="eiv2-g">GG+Ut {money(gg + util)}</span>
          {conIVA && <span className="eiv2-g">IVA {money(iva)}</span>}
          <span className="eiv2-big">{money(totalGeneral)}</span>
        </div>
      </div></footer>
    </div>
  )
}
