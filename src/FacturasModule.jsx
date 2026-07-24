import React, { useState, useRef } from 'react'
import { Plus, Trash2, Receipt, Upload, Search } from 'lucide-react'
import * as XLSX from 'xlsx'
import { calcularPerdidaFactoring, perdidaFactoringFactura } from './ParametrosModule.jsx'
import Paginador, { paginar } from './Paginador.jsx'
import { pullState, pushState } from './sync.js'
import { descargarInformeFacturas } from './informeFacturas.js'
import { ocultarFacturasDeLibro } from './facturasOcultas.js'
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

import { SEREIN } from './theme-serein.js'
// Paleta reskineada a la identidad Serein 2026 — mismas claves, solo cambian los valores hex.
const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const inp = { padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, boxSizing: 'border-box' }
const ESTADOS = ['Pendiente', 'Pagado', 'Factoring', 'Vencida', 'Anulada']
const BANCOS = ['', 'Banco de Chile', 'BCI', 'Santander', 'Estado', 'Scotiabank', 'Itaú', 'Security', 'BICE', 'Otro']

const fondoEstado = e => ({ Pagado: '#E6F7EE', Factoring: '#FDECDD', Vencida: '#FCEBEA', Anulada: '#EEE', Pendiente: '#FDECDD' }[e] || '#EEE')
const colorEstado = e => ({ Pagado: C.verde, Factoring: C.ambar, Vencida: C.rojo, Anulada: C.gris, Pendiente: '#D9600A' }[e] || C.gris)

const VENDEDORES = ['General', 'Mario']
const IVA = 0.19
const ivaDe = n => Math.round((parseInt(String(n).replace(/\D/g, ''), 10) || 0) * IVA)
const brutoDe = n => { const v = parseInt(String(n).replace(/\D/g, ''), 10) || 0; return v + Math.round(v * IVA) }
// Versiones que respetan si la factura está marcada como exenta (sin IVA)
const ivaFacturaDe = x => x.iva === 'exenta' ? 0 : ivaDe(x.neto)
export const montoFacturaDe = x => x.iva === 'exenta' ? (parseInt(String(x.neto).replace(/\D/g, ''), 10) || 0) : brutoDe(x.neto)

// ————— Saldo pendiente real (neto/bruto) —————
// Antes "cobrado"/"por cobrar" solo miraban el campo x.estado (Pagado o
// no) — una factura con un abono parcial no tenía forma de reflejar
// cuánto quedaba realmente pendiente. abonos[] guarda los pagos/abonos
// reales registrados contra la factura (fecha, monto bruto, medio,
// comentario). El saldo neto pendiente se prorratea sobre el saldo
// bruto pendiente usando la misma proporción neto/bruto de la factura
// completa — no se le pide a quien registra el abono que separe IVA a
// mano.
// Se mantiene la convención que ya usa el resto de la app: Pagado y
// Factoring se consideran 100% cobrados de inmediato (el adelanto de
// factoring ya se trata como cobro en el resto del sistema), Anulada
// nunca aporta saldo.
export function saldoPendienteDe(x) {
  const bruto = montoFacturaDe(x)
  if (x.estado === 'Anulada' || x.estado === 'Pagado' || x.estado === 'Factoring') return { neto: 0, bruto: 0 }
  const pagadoBruto = (x.abonos || []).reduce((a, ab) => a + (Number(ab.monto) || 0), 0)
  const saldoBruto = Math.max(0, bruto - pagadoBruto)
  const saldoNeto = bruto > 0 ? Math.max(0, Math.round((x.neto || 0) * (saldoBruto / bruto))) : 0
  return { neto: saldoNeto, bruto: saldoBruto }
}
// Estado de pago derivado — punto único de verdad, no se vuelve a
// comparar x.estado === 'Pagado' suelto en ningún cálculo nuevo.
export function estadoPagoDe(x) {
  if (x.estado === 'Anulada') return 'Anulada'
  const { bruto } = saldoPendienteDe(x)
  if (bruto <= 0) return 'Pagada'
  return (x.abonos || []).length > 0 ? 'Parcial' : (x.estado === 'Vencida' ? 'Vencida' : 'Pendiente')
}

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

  // Antes esta función solo tocaba el estado de React y dependía del
  // guardado general (localStorage + push recién 800ms después del
  // último cambio de CUALQUIER parte del ERP) — si la persona refrescaba
  // o cambiaba de pantalla antes de esos 800ms, la edición (o el borrado)
  // podía quedar sin subir, y al volver a cargar la nube "revivía" la
  // versión vieja, con la factura eliminada de vuelta. Ahora guarda en
  // localStorage y sube a la nube de inmediato en cada cambio, igual que
  // el resto de los módulos que ya se corrigieron.
  const setLista = nuevaLista => {
    const nuevo = { ...(facturas || {}), [area]: nuevaLista }
    try { localStorage.setItem('serein_facturas', JSON.stringify(nuevo)) } catch (e) {}
    setFacturas(nuevo)
    pushState()
  }
  // Para borrar (una, varias o todas) se usa además el mismo patrón ya
  // probado en Órdenes de Trabajo: traer lo más fresco de la nube justo
  // antes de borrar, para no partir de una copia vieja si alguien más
  // cargó/editó facturas de esta área mientras tanto.
  const eliminarFresco = async filtrar => {
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_facturas') || 'null') } catch (e) {}
    const baseFacturas = fresco && typeof fresco === 'object' ? fresco : (facturas || {})
    const baseLista = baseFacturas[area] || []
    setLista(filtrar(baseLista))
  }
  const actualizar = (id, campo, valor) => setLista(lista.map(x => x.id === id ? { ...x, [campo]: valor } : x))
  function agregar() {
    const nt = num(f.neto)
    if (!f.numero || nt <= 0) return
    setLista([{ id: 'f' + Date.now(), ...f, neto: nt, monto: f.iva === 'exenta' ? nt : brutoDe(nt) }, ...lista])
    setF(nueva()); setCreando(false)
  }
  // Al cambiar el neto, recalcula el bruto automáticamente (IVA 19%)
  const setNeto = (id, valor) => { const nt = num(valor); setLista(lista.map(x => x.id === id ? { ...x, neto: nt, monto: montoFacturaDe({ ...x, neto: nt }) } : x)) }
  // Registrar/borrar un abono: trae lo más fresco de la nube antes de
  // escribir (mismo patrón agregarAArray de OTModule.jsx) porque un abono
  // es dinero real — no queremos partir de una copia vieja de la factura
  // si alguien más la editó mientras tanto.
  const [expandido, setExpandido] = useState(null)
  const agregarAbono = async (id, abono) => {
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_facturas') || 'null') } catch (e) {}
    const baseFacturas = fresco && typeof fresco === 'object' ? fresco : (facturas || {})
    const baseLista = baseFacturas[area] || []
    setLista(baseLista.map(x => x.id === id ? { ...x, abonos: [...(x.abonos || []), abono] } : x))
  }
  const eliminarAbono = async (id, abonoId) => {
    if (!window.confirm('¿Eliminar este abono?')) return
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_facturas') || 'null') } catch (e) {}
    const baseFacturas = fresco && typeof fresco === 'object' ? fresco : (facturas || {})
    const baseLista = baseFacturas[area] || []
    setLista(baseLista.map(x => x.id === id ? { ...x, abonos: (x.abonos || []).filter(a => a.id !== abonoId) } : x))
  }
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
        if (window.confirm('Se importarán ' + nuevas.length + ' facturas de la hoja "' + sheet + '" y reemplazarán las de ' + area + '. ¿Continuar?')) setLista(nuevas)
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
  // Las facturas con origen "libroVentas" se vuelven a crear solas cada vez
  // que alguien abre el Libro de Ventas (esa pantalla sincroniza hacia acá
  // toda venta con área asignada). Antes, borrarlas aquí no servía de nada:
  // quedaban borradas un rato y volvían a aparecer en la próxima sincronización,
  // porque el registro de origen en el Libro de Ventas seguía existiendo.
  // Ahora, además de borrarlas de esta lista, se guarda su libroId en una
  // lista de "no volver a traer" que LibroVentasModule.jsx respeta — el
  // borrado queda definitivo sin tocar el Libro de Ventas en sí.
  const eliminarSel = () => {
    if (!sel.size) return
    if (!window.confirm('Se eliminaran ' + sel.size + ' factura(s) del area ' + area + '. Esta accion no se puede deshacer. Continuar?')) return
    const idsLibro = mostradas.filter(x => sel.has(x.id) && x.origen === 'libroVentas' && x.libroId).map(x => x.libroId)
    eliminarFresco(baseLista => baseLista.filter(x => !sel.has(x.id)))
    ocultarFacturasDeLibro(idsLibro, pushState)
    setSel(new Set())
  }
  const vaciarArea = () => {
    if (!lista.length) return
    if (!window.confirm('Se eliminaran TODAS las facturas del area ' + area + ' (' + lista.length + '). Esta accion no se puede deshacer. Continuar?')) return
    if (!window.confirm('Confirmacion final: vaciar por completo las facturas de ' + area + '?')) return
    const idsLibro = lista.filter(x => x.origen === 'libroVentas' && x.libroId).map(x => x.libroId)
    eliminarFresco(() => [])
    ocultarFacturasDeLibro(idsLibro, pushState)
    setSel(new Set())
  }
  const descargarInforme = () => {
    const elegidas = mostradas.filter(x => sel.has(x.id))
    if (!elegidas.length) return
    descargarInformeFacturas(elegidas.map(x => ({
      folio: x.numero,
      cliente: x.cliente,
      fechaEmision: x.fecha_emision,
      ventaNeta: parseInt(String(x.neto).replace(/\D/g, ''), 10) || 0,
      iva: ivaFacturaDe(x),
      total: montoFacturaDe(x),
      fechaVencimiento: x.vencimiento,
      estado: x.estado,
    })))
  }
  const totalMonto = mostradas.reduce((a, x) => a + montoFacturaDe(x), 0)
  const saldoPendienteTotal = mostradas.reduce((a, x) => a + saldoPendienteDe(x).bruto, 0)
  const cobrado = totalMonto - saldoPendienteTotal
  const totalComision = mostradas.reduce((a, x) => a + comisionDe(x), 0)
  const totalNeto = mostradas.reduce((a, x) => a + (x.neto || 0), 0)
  const totalPPM = Math.round(totalNeto * (ppmPct / 100))
  const totalPerdFact = mostradas.reduce((a, x) => a + perdidaFactoringFactura(x, params), 0)
  const ventasMario = mostradas.filter(x => x.vendedor === 'Mario').reduce((a, x) => a + (x.neto || 0), 0)
  // Istria: total vendido (neto) por proyecto/NV etiquetado (ej. Equipex)
  const ventasPorProyecto = esIstria ? Object.entries(mostradas.reduce((acc, x) => { const p = (x.proyecto || '').trim(); if (p) acc[p] = (acc[p] || 0) + (x.neto || 0); return acc }, {})).sort((a, b) => b[1] - a[1]) : []

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ background: '#fff', border: '1px solid #DFE4EA', borderTop: `3px solid ${C.teal}` }}>
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid #DFE4EA' }}>
          <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}><Receipt size={15} /> Facturas · {area}</span>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #DFE4EA', padding: '2px 6px' }}>
              <Search size={13} color={C.gris} />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar N°/cliente/OT…" style={{ border: 'none', outline: 'none', fontSize: 12.5, width: 130 }} />
            </div>
            <select value={fCli} onChange={e => setFCli(e.target.value)} style={inp}><option value="">Todos los clientes</option>{clientesUnicos.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={fEst} onChange={e => setFEst(e.target.value)} style={inp}><option value="">Todos los estados</option>{ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}</select>
            <input type="month" value={fMes} onChange={e => setFMes(e.target.value)} style={inp} title="Filtrar por mes de emisión" />
            {esIstria && <select value={fProy} onChange={e => setFProy(e.target.value)} style={inp} title="Filtrar por proyecto"><option value="">Todos los proyectos</option>{proyectosUnicos.map(p => <option key={p} value={p}>{p}</option>)}</select>}
            {hayFiltro && <button onClick={() => { setBusca(''); setFCli(''); setFEst(''); setFMes(''); setFProy('') }} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '5px 8px', cursor: 'pointer', fontSize: 12 }}>Limpiar</button>}
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" style={{ display: 'none' }} onChange={e => { const file = e.target.files[0]; if (file) importarExcel(file); e.target.value = '' }} />
            <button onClick={() => fileRef.current && fileRef.current.click()} style={{ background: C.carbon, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Upload size={13} /> Importar Excel</button>
            {!creando && <button onClick={() => setCreando(true)} style={{ background: C.teal, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Nueva factura</button>}
          </div>
        </div>

        <div style={{ padding: '10px 16px', display: 'flex', gap: 26, flexWrap: 'wrap', borderBottom: '1px solid #DFE4EA', background: '#F2F4F7' }}>
          <div>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Ventas Mario (neto)</div>
            <div style={{ fontFamily: SEREIN.fontDisplay, fontSize: 20, fontWeight: 600, color: C.carbon }}>{clp(ventasMario)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Comisión Mario ({comisionPct}%)</div>
            <div style={{ fontFamily: SEREIN.fontDisplay, fontSize: 20, fontWeight: 600, color: totalComision > 0 ? C.rojo : C.gris }}>{clp(totalComision)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Pérdida factoring</div>
            <div style={{ fontFamily: SEREIN.fontDisplay, fontSize: 20, fontWeight: 600, color: totalPerdFact > 0 ? C.rojo : C.gris }}>{clp(totalPerdFact)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>PPM ({ppmPct}%)</div>
            <div style={{ fontFamily: SEREIN.fontDisplay, fontSize: 20, fontWeight: 600, color: C.teal }}>{clp(totalPPM)}</div>
          </div>
        </div>

        {esIstria && ventasPorProyecto.length > 0 && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #DFE4EA', background: '#F2F4F7' }}>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Ventas por Proyecto / NV (neto) — trabajos facturados en Santa Rosa</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {ventasPorProyecto.map(([p, v]) => (
                <div key={p} style={{ borderLeft: `3px solid ${C.teal}`, paddingLeft: 8 }}>
                  <div style={{ fontSize: 12, color: C.carbon, fontWeight: 600 }}>{p}</div>
                  <div style={{ fontFamily: SEREIN.fontDisplay, fontSize: 18, fontWeight: 600, color: C.teal }}>{clp(v)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {creando && (
          <div style={{ background: '#F2F4F7', padding: 12, borderBottom: '1px solid #DFE4EA' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8 }}>
              <input style={inp} placeholder="N° factura *" value={f.numero} onChange={e => setF({ ...f, numero: e.target.value })} />
              <input style={inp} placeholder="Cliente" list={dlId} value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} />
              <input style={inp} placeholder="OT" list={dlOtId} value={f.ot} onChange={e => setF({ ...f, ot: e.target.value, cc: '' })} />
              <select style={inp} value={f.cc || ''} onChange={e => setF({ ...f, cc: e.target.value })} disabled={ccsDeOT(f.ot).length === 0}><option value="">{ccsDeOT(f.ot).length ? 'Centro de costo…' : 'Sin CC (elige OT)'}</option>{ccsDeOT(f.ot).map(c => <option key={c.id} value={c.id}>{c.id} · {c.nombre}</option>)}</select>
              {esIstria && <input style={inp} placeholder="Proyecto (nombre)" value={f.proyecto} onChange={e => setF({ ...f, proyecto: e.target.value })} />}
              {esIstria && <input style={inp} placeholder="NV (codigo)" value={f.nv} onChange={e => setF({ ...f, nv: e.target.value })} />}
              <label style={{ fontSize: 11, color: C.gris }}>Emisión<input type="date" style={{ ...inp, width: '100%' }} value={f.fecha_emision} onChange={e => setF({ ...f, fecha_emision: e.target.value })} /></label>
              <input style={inp} placeholder="Neto CLP *" value={f.neto} onChange={e => setF({ ...f, neto: e.target.value })} /><select style={inp} value={f.iva} onChange={e => setF({ ...f, iva: e.target.value })}><option value="afecta">Afecta (con IVA)</option><option value="exenta">Exenta (sin IVA)</option></select>
              <div style={{ ...inp, background: '#E2E7EC', color: C.gris, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>IVA {clp(f.iva === 'exenta' ? 0 : ivaDe(f.neto))} · Total <b style={{ color: C.carbon, marginLeft: 4 }}>{clp(f.iva === 'exenta' ? num(f.neto) : brutoDe(f.neto))}</b></div>
              <select style={inp} value={f.vendedor} onChange={e => setF({ ...f, vendedor: e.target.value })}>{VENDEDORES.map(v => <option key={v} value={v}>Vendedor: {v}</option>)}</select>
            </div>
            <input style={{ ...inp, width: '100%', marginTop: 8 }} placeholder="Observación / comentario (opcional)" value={f.comentarios} onChange={e => setF({ ...f, comentarios: e.target.value })} />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={agregar} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar</button>
              <button onClick={() => { setF(nueva()); setCreando(false) }} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '0 12px 10px' }}>
          <span style={{ fontSize: 12.5, color: C.gris }}>{sel.size} seleccionada(s)</span>
          <button onClick={descargarInforme} disabled={!sel.size} style={{ border: 'none', padding: '7px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12.5, background: sel.size ? C.azul : '#DFE4EA', color: sel.size ? '#fff' : C.gris, cursor: sel.size ? 'pointer' : 'default' }}>Descargar informe PDF</button>
          <button onClick={eliminarSel} disabled={!sel.size} style={{ border: 'none', padding: '7px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12.5, background: sel.size ? C.rojo : '#DFE4EA', color: sel.size ? '#fff' : C.gris, cursor: sel.size ? 'pointer' : 'default' }}>Eliminar seleccionadas</button>
          <button onClick={vaciarArea} disabled={!lista.length} style={{ background: 'transparent', border: '1px solid ' + C.rojo, color: C.rojo, padding: '7px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 700, cursor: lista.length ? 'pointer' : 'default' }}>Vaciar area {area}</button>
        </div>
        <div style={{ overflowX: 'auto', padding: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
              <th style={{ padding: '5px 6px', width: 30 }}><input type="checkbox" checked={mostradas.length > 0 && sel.size === mostradas.length} onChange={toggleTodas} /></th>
              {['N° factura', 'Cliente', 'OT / OC', 'Centro de costo', ...(esIstria ? ['Proyecto', 'NV'] : []), 'Emisión', 'Neto', 'IVA', 'Total', `PPM ${ppmPct}%`, 'Estado', 'Saldo pendiente', 'Fecha pago', 'Banco depósito', 'Comentarios', 'Vendedor', 'Comisión', ''].map((h, i) => (
                <th key={i} style={{ textAlign: ['Neto', 'IVA', 'Total', 'Comisión', 'Saldo pendiente'].includes(h) || h.startsWith('PPM') ? 'right' : 'left', padding: '5px 6px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {pg.items.map(x => {
                const facs = params.factoring || []
                const fSel = facs.find(ff => ff.id === x.factoringId) || facs[0]
                const perd = x.estado === 'Factoring' ? calcularPerdidaFactoring(montoFacturaDe(x), x.dias || 30, x.diasMora || 0, fSel) : null
                return (
                <React.Fragment key={x.id}>
                <tr style={{ borderBottom: '1px solid #DFE4EA', opacity: x.estado === 'Anulada' ? 0.5 : 1 }}>
                  <td style={{ padding: '5px 4px' }}><input type="checkbox" checked={sel.has(x.id)} onChange={() => toggleSel(x.id)} /></td>
                  <td style={{ padding: '4px 6px' }}><input value={x.numero} onChange={e => actualizar(x.id, 'numero', e.target.value)} style={{ ...inp, width: 80, fontWeight: 600 }} /></td>
                  <td style={{ padding: '4px 6px' }}><input value={x.cliente} list={dlId} onChange={e => actualizar(x.id, 'cliente', e.target.value)} style={{ ...inp, width: 150 }} /></td>
                  <td style={{ padding: '4px 6px' }}><input value={x.ot} list={dlOtId} onChange={e => actualizar(x.id, 'ot', e.target.value)} placeholder="OT/OC" style={{ ...inp, width: 100 }} /></td>
                  <td style={{ padding: '4px 6px' }}><select value={x.cc || ''} onChange={e => actualizar(x.id, 'cc', e.target.value)} disabled={ccsDeOT(x.ot).length === 0} style={{ ...inp, width: 150 }}><option value="">{ccsDeOT(x.ot).length ? 'Sin imputar' : '—'}</option>{ccsDeOT(x.ot).map(c => <option key={c.id} value={c.id}>{c.id} · {c.nombre}</option>)}</select></td>
                  {esIstria && <td style={{ padding: '4px 6px' }}><input value={x.proyecto || ''} onChange={e => actualizar(x.id, 'proyecto', e.target.value)} placeholder="Proyecto" style={{ ...inp, width: 130 }} /></td>}
                  {esIstria && <td style={{ padding: '4px 6px' }}><input value={x.nv || ''} onChange={e => actualizar(x.id, 'nv', e.target.value)} placeholder="NV" style={{ ...inp, width: 90 }} /></td>}
                  <td style={{ padding: '4px 6px' }}><input type="date" value={x.fecha_emision} onChange={e => actualizar(x.id, 'fecha_emision', e.target.value)} style={{ ...inp, width: 130 }} /></td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}><input value={x.neto} onChange={e => setNeto(x.id, e.target.value)} style={{ ...inp, width: 100, textAlign: 'right' }} /></td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: C.gris, whiteSpace: 'nowrap' }}>{clp(ivaFacturaDe(x))}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{clp(montoFacturaDe(x))}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: C.teal, whiteSpace: 'nowrap' }}>{clp(Math.round((x.neto || 0) * (ppmPct / 100)))}</td>
                  <td style={{ padding: '5px 6px' }}>
                    <select value={x.estado} onChange={e => actualizar(x.id, 'estado', e.target.value)} style={{ border: 'none', background: fondoEstado(x.estado), color: colorEstado(x.estado), padding: '3px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {ESTADOS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setExpandido(expandido === x.id ? null : x.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: saldoPendienteDe(x).bruto > 0 ? C.rojo : C.verde, fontWeight: 600, textDecoration: 'underline', fontSize: 12.5 }}>
                      {clp(saldoPendienteDe(x).bruto)}
                    </button>
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
                  <td style={{ padding: '5px 4px', textAlign: 'right' }}><button onClick={() => { if (!window.confirm(`¿Eliminar factura ${x.numero}?`)) return; if (x.origen === 'libroVentas' && x.libroId) ocultarFacturasDeLibro([x.libroId], pushState); eliminarFresco(baseLista => baseLista.filter(y => y.id !== x.id)) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button></td>
                </tr>
                {x.estado === 'Factoring' && (
                  <tr style={{ background: '#FDECDD' }}>
                    <td colSpan={esIstria ? 20 : 18} style={{ padding: '8px 10px' }}>
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
                        <span style={{ color: C.gris }}>(interés {clp(perd ? perd.interes : 0)} + costo op {clp(perd ? perd.costoOp : 0)}{perd && perd.mora ? ` + mora ${clp(perd.mora)}` : ''}) → Neto a recibir: <b style={{ color: C.carbon }}>{clp(montoFacturaDe(x) - (perd ? perd.total : 0))}</b></span>
                      </div>
                    </td>
                  </tr>
                )}
                {expandido === x.id && (
                  <tr style={{ background: '#F2F4F7' }}>
                    <td colSpan={esIstria ? 20 : 18} style={{ padding: '8px 10px' }}>
                      <FilaAbonos x={x} onAgregar={abono => agregarAbono(x.id, abono)} onEliminar={abonoId => eliminarAbono(x.id, abonoId)} />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ) })}
              {mostradas.length === 0 && <tr><td colSpan={esIstria ? 20 : 18} style={{ padding: 14, textAlign: 'center', color: '#9AA3AD' }}>{busca ? 'Sin resultados para la búsqueda.' : 'Sin facturas en esta área.'}</td></tr>}
            </tbody>
          </table>
          <Paginador page={pg.page} paginas={pg.paginas} total={pg.total} setPage={setPage} />
        </div>
        <datalist id={dlId}>{sugerencias.map(s => <option key={s} value={s} />)}</datalist>
        <datalist id={dlOtId}>{otsActivas.map(o => <option key={o.etq} value={o.n}>{o.etq}</option>)}</datalist>
      </div>
      <div style={{ fontSize: 11, color: '#9AA3AD', marginTop: 6 }}>
        Estas facturas se llenarán automáticamente desde Defontana/SII cuando activemos la sincronización. Por ahora puedes cargarlas y editarlas a mano.
      </div>
    </div>
  )
}

const MEDIOS_ABONO = ['Transferencia', 'Cheque', 'Efectivo', 'Otro']

// Sub-fila desplegable con el historial de abonos de una factura y el
// formulario para registrar uno nuevo — mismo patrón visual que la
// sub-fila de Factoring de arriba.
function FilaAbonos({ x, onAgregar, onEliminar }) {
  const abonos = x.abonos || []
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [medio, setMedio] = useState('Transferencia')
  const [comentario, setComentario] = useState('')
  const guardar = () => {
    const m = num(monto)
    if (m <= 0) return
    onAgregar({ id: 'ab' + Date.now(), monto: m, fecha, medio, comentario })
    setMonto(''); setComentario('')
  }
  const { neto, bruto } = saldoPendienteDe(x)
  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ marginBottom: 6, color: C.carbon }}>
        <b>Abonos de la factura {x.numero}</b> — saldo pendiente: <b style={{ color: bruto > 0 ? C.rojo : C.verde }}>{clp(bruto)}</b> bruto / {clp(neto)} neto
      </div>
      {abonos.length > 0 && (
        <table style={{ width: '100%', marginBottom: 8, borderCollapse: 'collapse' }}>
          <thead><tr style={{ color: C.gris, fontSize: 10.5, textTransform: 'uppercase' }}>
            <th style={{ textAlign: 'left', padding: '2px 6px' }}>Fecha</th><th style={{ textAlign: 'right', padding: '2px 6px' }}>Monto</th><th style={{ textAlign: 'left', padding: '2px 6px' }}>Medio</th><th style={{ textAlign: 'left', padding: '2px 6px' }}>Comentario</th><th></th>
          </tr></thead>
          <tbody>
            {abonos.map(a => (
              <tr key={a.id} style={{ borderTop: '1px solid #DFE4EA' }}>
                <td style={{ padding: '3px 6px' }}>{a.fecha}</td>
                <td style={{ padding: '3px 6px', textAlign: 'right' }}>{clp(a.monto)}</td>
                <td style={{ padding: '3px 6px' }}>{a.medio}</td>
                <td style={{ padding: '3px 6px', color: C.gris }}>{a.comentario}</td>
                <td style={{ padding: '3px 6px', textAlign: 'right' }}><button onClick={() => onEliminar(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={12} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ ...inp, width: 130 }} />
        <input placeholder="Monto abonado" value={monto} onChange={e => setMonto(e.target.value)} style={{ ...inp, width: 120, textAlign: 'right' }} />
        <select value={medio} onChange={e => setMedio(e.target.value)} style={inp}>{MEDIOS_ABONO.map(m => <option key={m}>{m}</option>)}</select>
        <input placeholder="Comentario (opcional)" value={comentario} onChange={e => setComentario(e.target.value)} style={{ ...inp, width: 180 }} />
        <button onClick={guardar} style={{ background: C.verde, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12.5 }}>Registrar abono</button>
      </div>
    </div>
  )
}
