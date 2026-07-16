import React, { useState, useRef } from 'react'
import { Plus, Trash2, Receipt, Upload, Search } from 'lucide-react'
import * as XLSX from 'xlsx'
import { calcularPerdidaFactoring, perdidaFactoringFactura } from './ParametrosModule.jsx'
import Paginador, { paginar } from './Paginador.jsx'
export { FACTURAS_SEED } from './facturas-data.js'
const CONDICIONES_DIAS = [{ label: '30 días', dias: 30 }, { label: '45 días', dias: 45 }, { label: '60 días', dias: 60 }, { label: '90 días', dias: 90 }]
const norm = s => (s || '').toString().toLowerCase()

// ============================================================
// MÓDULO: Facturas por área (Santa Rosa / Istria)
// Lista editable de facturas: ver, editar, comentar, registrar
// fecha de pago y banco de depósito.
// Versión en memoria. Preparado para llenarse automáticamente
// desde Defontana / SII en la fase de sincronización.
// ============================================================

const C = { azul: '#061A40', teal: '#0B7285', ambar: '#FF6B00', rojo: '#D64545', verde: '#12805C', carbon: '#0F1A2E', gris: '#8A929E' }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const inp = { padding: '6px 8px', border: '1px solid #CBD2D6', fontSize: 12.5, boxSizing: 'border-box' }
const ESTADOS = ['Pendiente', 'Pagado', 'Factoring', 'Vencida', 'Anulada']
const BANCOS = ['', 'Banco de Chile', 'BCI', 'Santander', 'Estado', 'Scotiabank', 'Itaú', 'Security', 'BICE', 'Otro']

const fondoEstado = e => ({ Pagado: '#E7F2EA', Factoring: '#F9E9DE', Vencida: '#F6E0DA', Anulada: '#EEE', Pendiente: '#F9E9DE' }[e] || '#EEE')
const colorEstado = e => ({ Pagado: C.verde, Factoring: C.ambar, Vencida: C.rojo, Anulada: C.gris, Pendiente: '#8C4519' }[e] || C.gris)

const VENDEDORES = ['General', 'Mario']
const IVA = 0.19
const ivaDe = n => Math.round((parseInt(String(n).replace(/\D/g, ''), 10) || 0) * IVA)
const brutoDe = n => { const v = parseInt(String(n).replace(/\D/g, ''), 10) || 0; return v + Math.round(v * IVA) }

export default function FacturasModule({ area, facturas, setFacturas, params = { factoring: [] }, comisionPct = 0, setComisionPct = () => {}, ppmPct = 2, setPpmPct = () => {}, clientesSugeridos = [], proyectos = [], ots = [] }) {
  const lista = (facturas && facturas[area]) || []
  const esIstria = area === 'Istria'
  const dlId = 'dl-cli-' + norm(area).replace(/\s/g, '')
  const dlOtId = 'dl-ot-' + norm(area).replace(/\s/g, '')
  const otNumProy = p => String(p.ot || '').trim()
  const otNumOT = o => String(o.numero || o.ot || o.n || o.id || '').trim()
  const otsActivas = [
    ...(proyectos || []).filter(p => !p.cerrado).map(p => ({ n: otNumProy(p), etq: 'Proyectos · ' + otNumProy(p) + (p.cliente ? ' · ' + p.cliente : '') })),
    ...(ots || []).filter(o => o.estado !== 'Cerrada').map(o => ({ n: otNumOT(o), etq: (o.area || 'OT') + ' · ' + otNumOT(o) + (o.cliente ? ' · ' + o.cliente : '') }))
  ].filter(o => o.n)
  const proyDeOT = n => (proyectos || []).find(p => otNumProy(p) === String(n || '').trim())
  const ccsDeOT = n => { const p = proyDeOT(n); if (!p) return []; const codes = [...new Set([...Object.keys(p.cc || {}), ...(p.compras || []).map(c => c.cc)])].filter(Boolean); return codes.map(c => ({ id: c, nombre: (p.ccNombres && p.ccNombres[c]) || c })) }
  const [creando, setCreando] = useState(false)
  const nueva = () => ({ numero: '', cliente: '', ot: '', cc: '', proyecto: '', nv: '', fecha_emision: '', neto: '', monto: '', iva: 'afecta', estado: 'Pendiente', fecha_pago: '', banco: '', comentarios: '', vendedor: 'General' })
  const comisionDe = x => x.vendedor === 'Mario' ? Math.round((x.neto || x.monto || 0) * (comisionPct / 100)) : 0
  const [f, setF] = useState(nueva())
  const [busca, setBusca] = useState('')
  const [fCli, setFCli] = useState('')
  const [fEst, setFEst] = useState('')
  const [fMes, setFMes] = useState('')
  const [fProy, setFProy] = useState('')
  const fileRef = useRef(null)
  const [page, setPage] = useState(1)

  const setLista = nuevaLista => setFacturas({ ...(facturas || {}), [area]: nuevaLista })
  const actualizar = (id, campo, valor) => setLista(lista.map(x => x.id === id ? { ...x, [campo]: valor } : x))
  function agregar() {
    const nt = num(f.neto)
    if (!f.numero || nt <= 0) return
    const claveF = x => (x.numero || '').trim().toLowerCase() + '|' + (x.cliente || '').trim().toLowerCase() + '|' + (x.iva || 'afecta')
    if (lista.some(x => claveF(x) === claveF(f))) { window.alert('Ya existe una factura con ese N°, cliente y tipo en ' + area + '. No se agrego (duplicado).'); return }
    setLista([{ id: 'f' + Date.now(), ...f, neto: nt, monto: f.iva === 'exenta' ? nt : brutoDe(nt) }, ...lista])
    setF(nueva()); setCreando(false)
  }
  // Al cambiar el neto, recalcula el bruto automáticamente (IVA 19%)
  const setNeto = (id, valor) => { const nt = num(valor); setLista(lista.map(x => x.id === id ? { ...x, neto: nt, monto: brutoDe(nt) } : x)) }
  // Nombres para autocompletar el cliente: contactos + los ya usados en el área
  const sugerencias = [...new Set([...(clientesSugeridos || []), ...lista.map(x => x.cliente).filter(Boolean)])].sort((a, b) => a.localeCompare(b))

  // Importar facturas desde Excel (.xlsx / .xlsm). Lee la hoja del área o la primera.
  function importarExcel(file) {
    const toInt = v => { const n = Math.round(Number(v)); return isNaN(n) ? num(v) : n }
    const excelDate = v => {
      if (v == null || v === '') return ''
      if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10) }
      const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ''
    }
    const estadoN = v => { const t = norm(v); if (t.includes('pag')) return 'Pagado'; if (t.includes('factor')) return 'Factoring'; if (t.includes('venc')) return 'Vencida'; if (t.includes('anul')) return 'Anulada'; return 'Pendiente' }
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const sheet = wb.SheetNames.find(n => norm(n).trim() === norm(area).trim()) || wb.SheetNames[0]
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, blankrows: false })
        if (!rows.length) return
        const hdr = (rows[0] || []).map(h => norm(h).trim())
        const col = (...nn) => { for (const nm of nn) { const i = hdr.findIndex(h => h.includes(nm)); if (i >= 0) return i } return -1 }
        const ci = { fecha: col('fecha'), doc: col('documento'), cli: col('cliente'), neto: col('venta neta', 'neto'), total: col('total'), oc: col('oc'), ent: col('entidad'), venc: col('vencimiento'), est: col('estado'), obs: col('observaci') }
        const nuevas = []
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r]; if (!row) continue
          const numero = String(row[ci.doc] ?? '').replace(/\.0$/, '').trim()
          const cliente = String(row[ci.cli] ?? '').trim()
          if (!numero && !cliente) continue
          nuevas.push({ id: 'imp' + r, numero, cliente, ot: String(row[ci.oc] ?? '').trim(), fecha_emision: excelDate(row[ci.fecha]), neto: toInt(row[ci.neto]) || toInt(row[ci.total]), monto: toInt(row[ci.total]) || toInt(row[ci.neto]), estado: estadoN(row[ci.est]), fecha_pago: '', banco: String(row[ci.ent] ?? '').trim(), vencimiento: excelDate(row[ci.venc]), comentarios: String(row[ci.obs] ?? '').trim() })
        }
        if (!nuevas.length) { window.alert('No se encontraron facturas en la hoja "' + sheet + '".'); return }
        if (window.confirm('Se importarán ' + nuevas.length + ' facturas de la hoja "' + sheet + '" y reemplazarán las de ' + area + '. ¿Continuar?')) { const vistos = new Set(); const sinDup = nuevas.filter(x => { const k = (x.numero || '').trim().toLowerCase() + '|' + (x.cliente || '').trim().toLowerCase() + '|' + (x.iva || 'afecta'); if (vistos.has(k)) return false; vistos.add(k); return true }); if (sinDup.length < nuevas.length) window.alert('Se omitieron ' + (nuevas.length - sinDup.length) + ' factura(s) duplicada(s) en el archivo.'); setLista(sinDup) }
      } catch (err) { window.alert('No se pudo leer el Excel: ' + err) }
    }
    reader.readAsArrayBuffer(file)
  }

  const clientesUnicos = [...new Set(lista.map(x => x.cliente).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const proyectosUnicos = [...new Set(lista.map(x => (x.proyecto || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const mostradas = lista.filter(x =>
    (!busca || (norm(x.numero) + ' ' + norm(x.cliente) + ' ' + norm(x.ot)).includes(norm(busca))) &&
    (!fCli || x.cliente === fCli) &&
    (!fEst || x.estado === fEst) &&
    (!fMes || (x.fecha_emision || '').slice(0, 7) === fMes) &&
    (!fProy || (x.proyecto || '').trim() === fProy)
  )
  const hayFiltro = busca || fCli || fEst || fMes || fProy
  const pg = paginar(mostradas, page)
  const [sel, setSel] = useState(() => new Set())
  const toggleSel = id => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleTodas = () => setSel(s => s.size === mostradas.length ? new Set() : new Set(mostradas.map(x => x.id)))
  const eliminarSel = () => {
    if (!sel.size) return
    if (!window.confirm('Se eliminaran ' + sel.size + ' factura(s) del area ' + area + '. Esta accion no se puede deshacer. Continuar?')) return
    setLista(lista.filter(x => !sel.has(x.id)))
    setSel(new Set())
  }
  const vaciarArea = () => {
    if (!lista.length) return
    if (!window.confirm('Se eliminaran TODAS las facturas del area ' + area + ' (' + lista.length + '). Esta accion no se puede deshacer. Continuar?')) return
    if (!window.confirm('Confirmacion final: vaciar por completo las facturas de ' + area + '?')) return
    setLista([])
    setSel(new Set())
  }
  const totalMonto = mostradas.reduce((a, x) => a + brutoDe(x.neto), 0)
  const cobrado = mostradas.filter(x => x.estado === 'Pagado').reduce((a, x) => a + brutoDe(x.neto), 0)
  const totalComision = mostradas.reduce((a, x) => a + comisionDe(x), 0)
  const totalNeto = mostradas.reduce((a, x) => a + (x.neto || 0), 0)
  const totalPPM = Math.round(totalNeto * (ppmPct / 100))
  const totalPerdFact = mostradas.reduce((a, x) => a + perdidaFactoringFactura(x, params), 0)
  const ventasMario = mostradas.filter(x => x.vendedor === 'Mario').reduce((a, x) => a + (x.neto || 0), 0)
  // Istria: total vendido (neto) por proyecto/NV etiquetado (ej. Equipex)
  const ventasPorProyecto = esIstria ? Object.entries(mostradas.reduce((acc, x) => { const p = (x.proyecto || '').trim(); if (p) acc[p] = (acc[p] || 0) + (x.neto || 0); return acc }, {})).sort((a, b) => b[1] - a[1]) : []

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ background: '#fff', border: '1px solid #E2DED4', borderTop: `3px solid ${C.teal}` }}>
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid #EEE9DF' }}>
          <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}><Receipt size={15} /> Facturas · {area}</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: C.gris, flexWrap: 'wrap' }}>
            <span>{hayFiltro ? `${mostradas.length} de ${lista.length}` : lista.length} facturas</span>
            <span>Total: <b style={{ color: C.carbon }}>{clp(totalMonto)}</b></span>
            <span>Cobrado: <b style={{ color: C.verde }}>{clp(cobrado)}</b></span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>Comisión Mario
              <input value={comisionPct} onChange={e => setComisionPct(parseFloat(String(e.target.value).replace(',', '.')) || 0)} style={{ ...inp, width: 46, textAlign: 'right' }} />%
              {totalComision > 0 && <b style={{ color: C.rojo }}>= {clp(totalComision)}</b>}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>PPM
              <input value={ppmPct} onChange={e => setPpmPct(parseFloat(String(e.target.value).replace(',', '.')) || 0)} style={{ ...inp, width: 46, textAlign: 'right' }} />%
              <b style={{ color: C.teal }}>= {clp(totalPPM)}</b>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #CBD2D6', padding: '2px 6px' }}>
              <Search size={13} color={C.gris} />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar N°/cliente/OT…" style={{ border: 'none', outline: 'none', fontSize: 12.5, width: 130 }} />
            </div>
            <select value={fCli} onChange={e => setFCli(e.target.value)} style={inp}><option value="">Todos los clientes</option>{clientesUnicos.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={fEst} onChange={e => setFEst(e.target.value)} style={inp}><option value="">Todos los estados</option>{ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}</select>
            <input type="month" value={fMes} onChange={e => setFMes(e.target.value)} style={inp} title="Filtrar por mes de emisión" />
            {esIstria && <select value={fProy} onChange={e => setFProy(e.target.value)} style={inp} title="Filtrar por proyecto"><option value="">Todos los proyectos</option>{proyectosUnicos.map(p => <option key={p} value={p}>{p}</option>)}</select>}
            {hayFiltro && <button onClick={() => { setBusca(''); setFCli(''); setFEst(''); setFMes(''); setFProy('') }} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '5px 8px', cursor: 'pointer', fontSize: 12 }}>Limpiar</button>}
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" style={{ display: 'none' }} onChange={e => { const file = e.target.files[0]; if (file) importarExcel(file); e.target.value = '' }} />
            <button onClick={() => fileRef.current && fileRef.current.click()} style={{ background: C.carbon, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Upload size={13} /> Importar Excel</button>
            {!creando && <button onClick={() => setCreando(true)} style={{ background: C.teal, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Nueva factura</button>}
          </div>
        </div>

        <div style={{ padding: '10px 16px', display: 'flex', gap: 26, flexWrap: 'wrap', borderBottom: '1px solid #EEE9DF', background: '#FAF7F3' }}>
          <div>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Ventas Mario (neto)</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 20, fontWeight: 600, color: C.carbon }}>{clp(ventasMario)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Comisión Mario ({comisionPct}%)</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 20, fontWeight: 600, color: totalComision > 0 ? C.rojo : C.gris }}>{clp(totalComision)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Pérdida factoring</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 20, fontWeight: 600, color: totalPerdFact > 0 ? C.rojo : C.gris }}>{clp(totalPerdFact)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>PPM ({ppmPct}%)</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 20, fontWeight: 600, color: C.teal }}>{clp(totalPPM)}</div>
          </div>
        </div>

        {esIstria && ventasPorProyecto.length > 0 && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #EEE9DF', background: '#FBF6F0' }}>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Ventas por Proyecto / NV (neto) — trabajos facturados en Santa Rosa</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {ventasPorProyecto.map(([p, v]) => (
                <div key={p} style={{ borderLeft: `3px solid ${C.teal}`, paddingLeft: 8 }}>
                  <div style={{ fontSize: 12, color: C.carbon, fontWeight: 600 }}>{p}</div>
                  <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 18, fontWeight: 600, color: C.teal }}>{clp(v)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {creando && (
          <div style={{ background: '#FAF7F3', padding: 12, borderBottom: '1px solid #EEE9DF' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8 }}>
              <input style={inp} placeholder="N° factura *" value={f.numero} onChange={e => setF({ ...f, numero: e.target.value })} />
              <input style={inp} placeholder="Cliente" list={dlId} value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} />
              <input style={inp} placeholder="OT" list={dlOtId} value={f.ot} onChange={e => setF({ ...f, ot: e.target.value, cc: '' })} />
              <select style={inp} value={f.cc || ''} onChange={e => setF({ ...f, cc: e.target.value })} disabled={ccsDeOT(f.ot).length === 0}><option value="">{ccsDeOT(f.ot).length ? 'Centro de costo…' : 'Sin CC (elige OT)'}</option>{ccsDeOT(f.ot).map(c => <option key={c.id} value={c.id}>{c.id} · {c.nombre}</option>)}</select>
              {esIstria && <input style={inp} placeholder="Proyecto (nombre)" value={f.proyecto} onChange={e => setF({ ...f, proyecto: e.target.value })} />}
              {esIstria && <input style={inp} placeholder="NV (codigo)" value={f.nv} onChange={e => setF({ ...f, nv: e.target.value })} />}
              <label style={{ fontSize: 11, color: C.gris }}>Emisión<input type="date" style={{ ...inp, width: '100%' }} value={f.fecha_emision} onChange={e => setF({ ...f, fecha_emision: e.target.value })} /></label>
              <input style={inp} placeholder="Neto CLP *" value={f.neto} onChange={e => setF({ ...f, neto: e.target.value })} /><select style={inp} value={f.iva} onChange={e => setF({ ...f, iva: e.target.value })}><option value="afecta">Afecta (con IVA)</option><option value="exenta">Exenta (sin IVA)</option></select>
              <div style={{ ...inp, background: '#F1EDE6', color: C.gris, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>IVA {clp(f.iva === 'exenta' ? 0 : ivaDe(f.neto))} · Total <b style={{ color: C.carbon, marginLeft: 4 }}>{clp(f.iva === 'exenta' ? num(f.neto) : brutoDe(f.neto))}</b></div>
              <select style={inp} value={f.vendedor} onChange={e => setF({ ...f, vendedor: e.target.value })}>{VENDEDORES.map(v => <option key={v} value={v}>Vendedor: {v}</option>)}</select>
            </div>
            <input style={{ ...inp, width: '100%', marginTop: 8 }} placeholder="Observación / comentario (opcional)" value={f.comentarios} onChange={e => setF({ ...f, comentarios: e.target.value })} />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={agregar} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar</button>
              <button onClick={() => { setF(nueva()); setCreando(false) }} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '0 12px 10px' }}>
          <span style={{ fontSize: 12.5, color: C.gris }}>{sel.size} seleccionada(s)</span>
          <button onClick={eliminarSel} disabled={!sel.size} style={{ border: 'none', padding: '7px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12.5, background: sel.size ? C.rojo : '#E6E8EE', color: sel.size ? '#fff' : C.gris, cursor: sel.size ? 'pointer' : 'default' }}>Eliminar seleccionadas</button>
          <button onClick={vaciarArea} disabled={!lista.length} style={{ background: 'transparent', border: '1px solid ' + C.rojo, color: C.rojo, padding: '7px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 700, cursor: lista.length ? 'pointer' : 'default' }}>Vaciar area {area}</button>
        </div>
        <div style={{ overflowX: 'auto', padding: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
              <th style={{ padding: '5px 6px', width: 30 }}><input type="checkbox" checked={mostradas.length > 0 && sel.size === mostradas.length} onChange={toggleTodas} /></th>
              {['N° factura', 'Cliente', 'OT / OC', 'Centro de costo', ...(esIstria ? ['Proyecto', 'NV'] : []), 'Emisión', 'Neto', 'IVA', 'Total', `PPM ${ppmPct}%`, 'Estado', 'Fecha pago', 'Banco depósito', 'Comentarios', 'Vendedor', 'Comisión', ''].map((h, i) => (
                <th key={i} style={{ textAlign: ['Neto', 'IVA', 'Total', 'Comisión'].includes(h) || h.startsWith('PPM') ? 'right' : 'left', padding: '5px 6px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {pg.items.map(x => {
                const facs = params.factoring || []
                const fSel = facs.find(ff => ff.id === x.factoringId) || facs[0]
                const perd = x.estado === 'Factoring' ? calcularPerdidaFactoring(brutoDe(x.neto), x.dias || 30, x.diasMora || 0, fSel) : null
                return (
                <React.Fragment key={x.id}>
                <tr style={{ borderBottom: '1px solid #EEE9DF', opacity: x.estado === 'Anulada' ? 0.5 : 1 }}>
                  <td style={{ padding: '5px 4px' }}><input type="checkbox" checked={sel.has(x.id)} onChange={() => toggleSel(x.id)} /></td>
                  <td style={{ padding: '4px 6px' }}><input value={x.numero} onChange={e => actualizar(x.id, 'numero', e.target.value)} style={{ ...inp, width: 80, fontWeight: 600 }} /></td>
                  <td style={{ padding: '4px 6px' }}><input value={x.cliente} list={dlId} onChange={e => actualizar(x.id, 'cliente', e.target.value)} style={{ ...inp, width: 150 }} /></td>
                  <td style={{ padding: '4px 6px' }}><input value={x.ot} list={dlOtId} onChange={e => actualizar(x.id, 'ot', e.target.value)} placeholder="OT/OC" style={{ ...inp, width: 100 }} /></td>
                  <td style={{ padding: '4px 6px' }}><select value={x.cc || ''} onChange={e => actualizar(x.id, 'cc', e.target.value)} disabled={ccsDeOT(x.ot).length === 0} style={{ ...inp, width: 150 }}><option value="">{ccsDeOT(x.ot).length ? 'Sin imputar' : '—'}</option>{ccsDeOT(x.ot).map(c => <option key={c.id} value={c.id}>{c.id} · {c.nombre}</option>)}</select></td>
                  {esIstria && <td style={{ padding: '4px 6px' }}><input value={x.proyecto || ''} onChange={e => actualizar(x.id, 'proyecto', e.target.value)} placeholder="Proyecto" style={{ ...inp, width: 130 }} /></td>}
                  {esIstria && <td style={{ padding: '4px 6px' }}><input value={x.nv || ''} onChange={e => actualizar(x.id, 'nv', e.target.value)} placeholder="NV" style={{ ...inp, width: 90 }} /></td>}
                  <td style={{ padding: '4px 6px' }}><input type="date" value={x.fecha_emision} onChange={e => actualizar(x.id, 'fecha_emision', e.target.value)} style={{ ...inp, width: 130 }} /></td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}><input value={x.neto} onChange={e => setNeto(x.id, e.target.value)} style={{ ...inp, width: 100, textAlign: 'right' }} /></td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: C.gris, whiteSpace: 'nowrap' }}>{clp(ivaDe(x.neto))}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{clp(brutoDe(x.neto))}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: C.teal, whiteSpace: 'nowrap' }}>{clp(Math.round((x.neto || 0) * (ppmPct / 100)))}</td>
                  <td style={{ padding: '5px 6px' }}>
                    <select value={x.estado} onChange={e => actualizar(x.id, 'estado', e.target.value)} style={{ border: 'none', background: fondoEstado(x.estado), color: colorEstado(x.estado), padding: '3px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {ESTADOS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '5px 6px' }}><input type="date" value={x.fecha_pago} onChange={e => actualizar(x.id, 'fecha_pago', e.target.value)} style={{ ...inp, width: 130 }} /></td>
                  <td style={{ padding: '5px 6px' }}>
                    <input value={x.banco} onChange={e => actualizar(x.id, 'banco', e.target.value)} placeholder="Banco…" style={{ ...inp, width: 130 }} />
                  </td>
                  <td style={{ padding: '5px 6px' }}><input value={x.comentarios} onChange={e => actualizar(x.id, 'comentarios', e.target.value)} placeholder="Comentario…" style={{ ...inp, width: 150 }} /></td>
                  <td style={{ padding: '5px 6px' }}>
                    <select value={x.vendedor || 'General'} onChange={e => actualizar(x.id, 'vendedor', e.target.value)} style={{ ...inp, width: 92 }}>
                      {VENDEDORES.map(v => <option key={v}>{v}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', color: comisionDe(x) > 0 ? C.rojo : C.gris, whiteSpace: 'nowrap' }}>{comisionDe(x) > 0 ? clp(comisionDe(x)) : '—'}</td>
                  <td style={{ padding: '5px 4px', textAlign: 'right' }}><button onClick={() => window.confirm(`¿Eliminar factura ${x.numero}?`) && setLista(lista.filter(y => y.id !== x.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button></td>
                </tr>
                {x.estado === 'Factoring' && (
                  <tr style={{ background: '#FBF3EE' }}>
                    <td colSpan={esIstria ? 19 : 17} style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                        <span style={{ color: C.gris, fontWeight: 600 }}>Factoring:</span>
                        <select value={x.factoringId || (fSel ? fSel.id : '')} onChange={e => actualizar(x.id, 'factoringId', e.target.value)} style={inp}>
                          {facs.length === 0 && <option value="">(define en Parámetros)</option>}
                          {facs.map(ff => <option key={ff.id} value={ff.id}>{ff.nombre}</option>)}
                        </select>
                        <select value={x.dias || 30} onChange={e => actualizar(x.id, 'dias', parseInt(e.target.value))} style={inp}>
                          {CONDICIONES_DIAS.map(cd => <option key={cd.dias} value={cd.dias}>{cd.label}</option>)}
                        </select>
                        <input placeholder="Días mora" value={x.diasMora || ''} onChange={e => actualizar(x.id, 'diasMora', num(e.target.value))} style={{ ...inp, width: 90 }} />
                        <span style={{ color: C.rojo, fontWeight: 600 }}>Descuento factoring: {clp(perd ? perd.total : 0)}</span>
                        <span style={{ color: C.gris }}>(interés {clp(perd ? perd.interes : 0)} + costo op {clp(perd ? perd.costoOp : 0)}{perd && perd.mora ? ` + mora ${clp(perd.mora)}` : ''}) → Neto a recibir: <b style={{ color: C.carbon }}>{clp(brutoDe(x.neto) - (perd ? perd.total : 0))}</b></span>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ) })}
              {mostradas.length === 0 && <tr><td colSpan={esIstria ? 19 : 17} style={{ padding: 14, textAlign: 'center', color: '#9AA0A6' }}>{busca ? 'Sin resultados para la búsqueda.' : 'Sin facturas en esta área.'}</td></tr>}
            </tbody>
          </table>
          <Paginador page={pg.page} paginas={pg.paginas} total={pg.total} setPage={setPage} />
        </div>
        <datalist id={dlId}>{sugerencias.map(s => <option key={s} value={s} />)}</datalist>
        <datalist id={dlOtId}>{otsActivas.map(o => <option key={o.etq} value={o.n}>{o.etq}</option>)}</datalist>
      </div>
      <div style={{ fontSize: 11, color: '#9AA0A6', marginTop: 6 }}>
        Estas facturas se llenarán automáticamente desde Defontana/SII cuando activemos la sincronización. Por ahora puedes cargarlas y editarlas a mano.
      </div>
    </div>
  )
}
