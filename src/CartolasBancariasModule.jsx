import { useEffect, useMemo, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabase.js'
import { SEREIN } from './theme-serein.js'

const C = { navy: SEREIN.ink, orange: SEREIN.orange, gray: SEREIN.fog, border: SEREIN.line, text: SEREIN.text, green: SEREIN.green, red: SEREIN.red, mut: SEREIN.textFaint }
const clp = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const ip = { padding: '6px 8px', border: '1px solid ' + C.border, fontSize: 12.5, boxSizing: 'border-box', borderRadius: 4 }
const sel = { padding: '4px 6px', border: '1px solid ' + C.border, fontSize: 12, borderRadius: 4, background: '#fff' }
const fmtF = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : (v || '-') }
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Misma taxonomia de LibroComprasModule.jsx + categorias propias de movimientos bancarios
export const TIPOS_CARGO = ['Pintura', 'Diluyente', 'Materiales', 'EPP', 'Diesel', 'Combustible', 'Herramientas', 'Repuestos', 'Fletes', 'Insumos', 'Viaticos', 'Peajes', 'Mantencion', 'Granalla', 'Servicios', 'Telefonia', 'Internet', 'Arriendo', 'Seguros', 'Leasing', 'Banco', 'ERP', 'Tag', 'Cafeteria', 'Honorarios', 'Software', 'Servicios basicos', 'Impuestos', 'Remuneraciones', 'Electricidad', 'Agua', 'Gas', 'Publicidad', 'Capacitacion', 'Notaria', 'Aduana', 'Courier', 'Suscripciones', 'Patentes', 'Contribuciones', 'Traspaso interno', 'Provision interna', 'Gastos personales (Rep. Legal)', 'Otros']
export const TIPOS_ABONO = ['Cobro cliente', 'Financiamiento/Factoring', 'Linea de credito', 'Traspaso interno', 'Devolucion', 'Otros']
const CLASIF = { Pintura: 'Variable', Diluyente: 'Variable', Materiales: 'Variable', EPP: 'Variable', Diesel: 'Variable', Combustible: 'Variable', Herramientas: 'Variable', Repuestos: 'Variable', Fletes: 'Variable', Insumos: 'Variable', Viaticos: 'Variable', Peajes: 'Variable', Mantencion: 'Variable', Granalla: 'Variable', Servicios: 'Variable', Telefonia: 'Fijo', Internet: 'Fijo', Arriendo: 'Fijo', Seguros: 'Fijo', Leasing: 'Fijo', Banco: 'Fijo', ERP: 'Fijo', Tag: 'Fijo', Cafeteria: 'Fijo', Honorarios: 'Fijo', Software: 'Fijo', 'Servicios basicos': 'Fijo', Impuestos: 'Fijo', Remuneraciones: 'Fijo', Electricidad: 'Variable', Agua: 'Variable', Gas: 'Variable', Publicidad: 'Variable', Capacitacion: 'Variable', Notaria: 'Variable', Aduana: 'Variable', Courier: 'Variable', Suscripciones: 'Fijo', Patentes: 'Fijo', Contribuciones: 'Fijo', Otros: '' }
// Categorias que NO son gasto operacional real (traspasos entre cuentas propias / reservas internas / costo financiero de banco)
const NO_GASTO_REAL = ['Traspaso interno', 'Provision interna', 'Banco']

// Reglas por palabra clave sobre la glosa completa (misma logica ya usada en LibroComprasModule.jsx, mas las propias de banco)
const REGLAS = [
  [['combustible', 'copec', 'shell', 'petrobras', 'enex', 'terpel', 'lampa', 'esmax', 'go lampa'], 'Combustible'],
  [['sherwin', 'renner', 'coating', 'jotun', 'ppg', 'tricolor', 'pintura', 'ceresita', 'soquina', 'delfin coatings', 'delfin complementos'], 'Pintura'],
  [['diluyente', 'thinner', 'solvente'], 'Diluyente'],
  [['diesel', 'petroleo'], 'Diesel'],
  [['ferreteria', 'acero', 'cubiertas', 'kubiec', 'estructura', 'sodimac', 'construmart', 'imperial', 'prodalam', 'novoplast', 'stratford', 'sanitarios', 'materiales', 'fierro', 'planchas', 'homecenter', 'easy quilicura', 'limatco', 'lloza', 'comzo', 'edeter', 'ingflex'], 'Materiales'],
  [['maestranza', 'mecanizado', 'metalica', 'galvaniz'], 'Servicios'],
  [['automovil', 'automotriz', 'vulcaniz', 'neumatic', 'lubricentro', 'repuesto'], 'Mantencion'],
  [['seguridad industrial', 'proteccion', 'implementos de seguridad', 'elementos de proteccion'], 'EPP'],
  [['granalla', 'abrasivo'], 'Granalla'],
  [['telefon', 'movistar', 'entel', 'claro chile', 'wom'], 'Telefonia'],
  [['internet', 'fibra', 'mundo pacifico', 'gtd'], 'Internet'],
  [['leasing'], 'Leasing'],
  [['banco', 'santander', 'scotiabank', 'bancoestado', 'amortizacion a linea', 'linea de credito', 'tarjeta de credito', 'pago de creditos m/n'], 'Banco'],
  [['seguro', 'mapfre', 'consorcio', 'zurich', 'hdi'], 'Seguros'],
  [['arriendo', 'inmobiliaria', 'elcontainer'], 'Arriendo'],
  [['contab', 'auditor', 'honorario', 'abogados'], 'Honorarios'],
  [['casino', 'cafeteria'], 'Cafeteria'],
  [['autopista', 'costanera', 'vespucio'], 'Tag'],
  [['flete', 'transporte', 'logistica'], 'Fletes'],
  [['remuneracion', 'sueldo', 'finiquito', 'instituciones previsionales'], 'Remuneraciones'],
  [['publicidad', 'marketing', 'imprenta', 'grafica'], 'Publicidad'],
  [['notaria', 'conservador de bienes'], 'Notaria'],
  [['chilexpress', 'starken', 'correos de chile', 'courier', 'encomienda'], 'Courier'],
  [['electricidad', 'enel', 'saesa', 'frontel', 'compania general de electricidad'], 'Electricidad'],
  [['aguas andinas', 'essbio', 'esval', 'nuevosur', 'aguas nuevas'], 'Agua'],
  [['defontana'], 'ERP'],
  [['apple.com', 'equifax', 'software'], 'Software'],
  [['recaudacion y pagos de servicios'], 'Servicios basicos'],
  [['sii.cl', 'dev impuesto', 'impuesto linea', 'tesoreria.cl'], 'Impuestos'],
]
const clean = glosa => (glosa || '').replace(/^TRASPASO A:/, '').replace(/^TRASPASO DE:/, '').replace(/^PAGO:/, '').trim()
const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function reglaCategoria(glosa, tipo) {
  const low = norm(glosa)
  const nombre = clean(glosa)
  if (nombre === 'Serein Scotiabank') return 'Traspaso interno'
  if (low.startsWith('provision:')) return 'Provision interna'
  if (low.startsWith('pago cuota leasing') || low.startsWith('pagos de leasing')) return 'Leasing'
  if (tipo === 'Abono') {
    if (low.includes('linea de credi') || low.includes('abonos por creditos')) return 'Linea de credito'
    if (low.startsWith('devolucion:') || low.includes('dev impuesto') || low.startsWith('abono segun instruc')) return 'Devolucion'
    return 'Cobro cliente'
  }
  for (const [keys, cat] of REGLAS) { if (keys.some(k => low.includes(k))) return cat }
  return ''
}
const toNum = s => { const n = parseInt(String(s).replace(/\./g, '').replace(/,.*/, ''), 10); return isNaN(n) ? 0 : n }

// Convierte texto pegado de una cartola Banco de Chile (columna "Detalle de transaccion")
// en filas {fecha, glosa, sucursal, tipo, monto}. Detecta SALDO INICIAL / SALDO FINAL para
// poder cuadrar el import antes de guardar (mismo criterio que la carga historica: saldo
// inicial + abonos - cargos = saldo final).
function parseCartolaTexto(texto, year) {
  const CARGO_HINTS = ['traspaso a:', 'pago:', 'provision:', 'amortizacion a linea', 'comision', 'interes', 'pago automatico tarjeta', 'pago de creditos m/n', 'giro cajero', 'cheque cobrado', 'pago instituciones previsionales', 'pago en sii.cl', 'pago en tesoreria.cl', 'recaudacion y pagos', 'pago cuota leasing', 'pagos de leasing']
  const ABONO_HINTS = ['traspaso de:', 'transferencia desde linea', 'abonos por creditos', 'devolucion:', 'abono segun instruc']
  const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const out = []
  let saldoInicial = null, saldoFinal = null
  for (let i = 0; i < lineas.length; i++) {
    const m = /^(\d{2})\/(\d{2})\s+(.*)$/.exec(lineas[i])
    if (!m) continue
    const fecha = `${year}-${m[2]}-${m[1]}`
    let resto = m[3]
    if (/^SALDO INICIAL/i.test(resto)) { const n = resto.match(/([\d.]+)\s*$/); if (n) saldoInicial = toNum(n[1]); continue }
    if (/^SALDO FINAL/i.test(resto)) { const n = resto.match(/([\d.]+)\s*$/); if (n) saldoFinal = toNum(n[1]); continue }
    while (i + 1 < lineas.length && !/^\d{2}\/\d{2}\s/.test(lineas[i + 1]) && !/^(DEPOSITOS|CHEQUES|RETENCION|INFORMATE|PARA MAS|Inf[oó]rmese|Estado de Cuenta|SR\(A\)|FECHA|EJECUTIVO)/i.test(lineas[i + 1])) {
      resto += ' ' + lineas[i + 1]; i++
    }
    const nums = []
    let rest2 = resto
    for (let k = 0; k < 2; k++) {
      const mm = rest2.match(/(-?\d{1,3}(?:\.\d{3})+|-?\d{1,3})\s*$/)
      if (!mm) break
      nums.unshift(toNum(mm[1])); rest2 = rest2.slice(0, mm.index).trim()
    }
    if (!nums.length) continue
    const glosa = rest2.trim()
    if (!glosa) continue
    const low = norm(glosa)
    const tipo = CARGO_HINTS.some(h => low.includes(h)) ? 'Cargo' : ABONO_HINTS.some(h => low.includes(h)) ? 'Abono' : (low.startsWith('traspaso a') ? 'Cargo' : low.startsWith('traspaso de') ? 'Abono' : 'Cargo')
    let sucursal = ''
    const sm = glosa.match(/\b(INTERNET|CENTRAL|LEASING|OF\.\s*[A-ZÑÁÉÍÓÚ.]+(?:\s+[A-ZÑÁÉÍÓÚ.]+)?)\s*$/)
    let glosaLimpia = glosa
    if (sm) { sucursal = sm[1].trim(); glosaLimpia = glosa.slice(0, sm.index).trim() }
    out.push({ fecha, glosa: glosaLimpia || glosa, sucursal, tipo, monto: nums[0] })
  }
  return { movimientos: out, saldoInicial, saldoFinal }
}

export default function CartolasBancariasModule({ esGerencia = true }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [errMsg, setErrMsg] = useState('')
  const [syncMsg, setSyncMsg] = useState('')
  const [q, setQ] = useState('')
  const [mes, setMes] = useState('')
  const [categoria, setCategoria] = useState('')
  const [tipoF, setTipoF] = useState('')
  const [soloRevisar, setSoloRevisar] = useState(false)
  const [verConsol, setVerConsol] = useState(true)
  const [verOcultos, setVerOcultos] = useState(false)
  const [mostrarAgregar, setMostrarAgregar] = useState(false)
  const [mostrarImportar, setMostrarImportar] = useState(false)
  const fileRef = useRef(null)

  const cargar = async () => {
    setLoading(true); setErrMsg('')
    const { data, error } = await supabase.from('movimientos_bancarios').select('*').order('fecha', { ascending: false })
    if (error) setErrMsg('No se pudo leer las cartolas: ' + error.message + '. Revisa que corriste la migracion 2026-08-07-cartolas-bancarias.sql en Supabase.')
    else setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  const setCampo = async (id, campo, valor) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, [campo]: valor } : r))
    try { const { error } = await supabase.from('movimientos_bancarios').update({ [campo]: valor }).eq('id', id); if (error) throw error }
    catch (e) { setSyncMsg('Error al guardar "' + campo + '": ' + (e.message || e) + ' — el cambio no quedo guardado, refresca la pagina.') }
  }
  const setCategoriaFila = (r, valor) => { setCampo(r.id, 'categoria', valor); setCampo(r.id, 'clasificacion', CLASIF[valor] || ''); setCampo(r.id, 'revisar', false) }

  const todas = useMemo(() => rows, [rows])
  const meses = useMemo(() => [...new Set(todas.map(r => (r.fecha || '').slice(0, 7)).filter(Boolean))].sort().reverse(), [todas])

  const filtradas = useMemo(() => todas.filter(r => {
    if (verOcultos) { if (!r.oculto) return false } else { if (r.oculto) return false }
    if (mes && (r.fecha || '').slice(0, 7) !== mes) return false
    if (categoria && r.categoria !== categoria) return false
    if (tipoF && r.tipo_movimiento !== tipoF) return false
    if (soloRevisar && !r.revisar) return false
    if (q) { const t = (r.descripcion + ' ' + r.glosa + ' ' + (r.nota || '')).toLowerCase(); if (!t.includes(q.toLowerCase())) return false }
    return true
  }), [todas, mes, categoria, tipoF, soloRevisar, q, verOcultos])

  const [sel_, setSel_] = useState(() => new Set())
  const toggleSel = id => setSel_(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleTodas = () => setSel_(s => s.size === filtradas.length ? new Set() : new Set(filtradas.map(r => r.id)))
  const ocultarSel = async () => {
    const ids = filtradas.filter(r => sel_.has(r.id)).map(r => r.id)
    if (!ids.length) return
    if (!window.confirm('Ocultar ' + ids.length + ' movimiento(s)? Puedes recuperarlos con "Ver ocultos".')) return
    setRows(rs => rs.map(r => ids.includes(r.id) ? { ...r, oculto: true } : r))
    try { await supabase.from('movimientos_bancarios').update({ oculto: true }).in('id', ids) } catch (e) { setSyncMsg('Error al ocultar: ' + (e.message || e)) }
    setSel_(new Set())
  }
  const restaurarSel = async () => {
    const ids = filtradas.filter(r => sel_.has(r.id)).map(r => r.id)
    if (!ids.length) return
    setRows(rs => rs.map(r => ids.includes(r.id) ? { ...r, oculto: false } : r))
    try { await supabase.from('movimientos_bancarios').update({ oculto: false }).in('id', ids) } catch (e) { setSyncMsg('Error al restaurar: ' + (e.message || e)) }
    setSel_(new Set())
  }

  const tot = useMemo(() => {
    const cargos = filtradas.filter(r => r.tipo_movimiento === 'Cargo').reduce((a, r) => a + (+r.monto || 0), 0)
    const abonos = filtradas.filter(r => r.tipo_movimiento === 'Abono').reduce((a, r) => a + (+r.monto || 0), 0)
    const real = filtradas.filter(r => r.tipo_movimiento === 'Cargo' && !NO_GASTO_REAL.includes(r.categoria)).reduce((a, r) => a + (+r.monto || 0), 0)
    const revisar = filtradas.filter(r => r.revisar).length
    return { cargos, abonos, real, revisar }
  }, [filtradas])

  const consolCat = useMemo(() => {
    const m = {}
    for (const r of filtradas.filter(r => r.tipo_movimiento === 'Cargo')) m[r.categoria || 'Sin categoria'] = (m[r.categoria || 'Sin categoria'] || 0) + (+r.monto || 0)
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [filtradas])
  const maxCat = Math.max(1, ...consolCat.map(x => x[1]))

  // -------- Agregar manual --------
  const vacio = { fecha: new Date().toISOString().slice(0, 10), descripcion: '', tipo_movimiento: 'Cargo', monto: '', categoria: '', banco: 'Banco de Chile', cuenta: '' }
  const [nuevo, setNuevo] = useState(vacio)
  const agregar = async () => {
    const monto = Number(nuevo.monto) || 0
    if (!nuevo.descripcion.trim() || monto <= 0) { window.alert('Ingresa al menos la descripcion y un monto mayor a 0.'); return }
    const reg = {
      banco: nuevo.banco || 'Banco de Chile', cuenta: nuevo.cuenta || null, fecha: nuevo.fecha,
      glosa: nuevo.descripcion.trim(), descripcion: nuevo.descripcion.trim(), sucursal: null,
      tipo_movimiento: nuevo.tipo_movimiento, monto,
      categoria: nuevo.categoria || null, clasificacion: CLASIF[nuevo.categoria] || null,
      revisar: !nuevo.categoria, nota: null, origen: 'manual', oculto: false,
    }
    try {
      const { data, error } = await supabase.from('movimientos_bancarios').insert(reg).select().single()
      if (error) throw error
      setRows(rs => [data, ...rs]); setNuevo(vacio); setMostrarAgregar(false)
    } catch (e) { window.alert('No se pudo guardar el movimiento: ' + (e.message || e)) }
  }

  // -------- Importar Excel/CSV --------
  function importarExcel(file) {
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const esCsv = /\.csv$/i.test(file.name || '')
        let filas
        if (esCsv) {
          const buf = new Uint8Array(ev.target.result)
          let txt = new TextDecoder('utf-8').decode(buf)
          if (txt.includes('\uFFFD')) txt = new TextDecoder('windows-1252').decode(buf)
          const lin = txt.split(/\r?\n/).filter(l => l.trim() !== '')
          const cab = lin[0] || ''
          const s = (cab.split(';').length > cab.split(',').length) ? ';' : ','
          filas = lin.map(l => l.split(s).map(c => c.replace(/^"|"$/g, '').trim()))
        } else {
          const wb = XLSX.read(ev.target.result, { type: 'array' })
          filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, blankrows: false })
        }
        if (!filas.length) { window.alert('El archivo esta vacio.'); return }
        const hdr = (filas[0] || []).map(h => norm(h).trim())
        const col = (...nn) => { for (const nm of nn) { const i = hdr.findIndex(h => h.includes(nm)); if (i >= 0) return i } return -1 }
        const ci = { fecha: col('fecha'), glosa: col('detalle', 'glosa', 'descripcion'), cargo: col('cargo', 'debito'), abono: col('abono', 'deposito', 'credito'), monto: col('monto') }
        const nuevas = []
        for (let r = 1; r < filas.length; r++) {
          const row = filas[r]; if (!row) continue
          const glosa = String(row[ci.glosa] ?? '').trim()
          if (!glosa) continue
          const cargo = ci.cargo >= 0 ? toNum(row[ci.cargo] || '0') : 0
          const abono = ci.abono >= 0 ? toNum(row[ci.abono] || '0') : 0
          const monto = ci.monto >= 0 ? toNum(row[ci.monto] || '0') : (cargo || abono)
          const tipo = cargo > 0 ? 'Cargo' : 'Abono'
          nuevas.push({ banco: 'Banco de Chile', cuenta: null, fecha: String(row[ci.fecha] || '').slice(0, 10), glosa, descripcion: clean(glosa), sucursal: null, tipo_movimiento: tipo, monto: monto || cargo || abono, categoria: reglaCategoria(glosa, tipo) || null, clasificacion: CLASIF[reglaCategoria(glosa, tipo)] || null, revisar: !reglaCategoria(glosa, tipo), nota: null, origen: 'excel', oculto: false })
        }
        if (!nuevas.length) { window.alert('No se reconocieron filas. Revisa que el archivo tenga columnas de Fecha, Detalle/Glosa y Cargo/Abono.'); return }
        guardarLote(nuevas)
      } catch (err) { window.alert('No se pudo leer el archivo: ' + err) }
    }
    reader.readAsArrayBuffer(file)
  }

  // -------- Importar texto pegado de cartola Banco de Chile --------
  const [textoImport, setTextoImport] = useState('')
  const [anioImport, setAnioImport] = useState(String(new Date().getFullYear()))
  const previewImport = useMemo(() => textoImport.trim() ? parseCartolaTexto(textoImport, anioImport) : null, [textoImport, anioImport])
  const cuadreImport = useMemo(() => {
    if (!previewImport || previewImport.saldoInicial == null || previewImport.saldoFinal == null) return null
    const cargos = previewImport.movimientos.filter(m => m.tipo === 'Cargo').reduce((a, m) => a + m.monto, 0)
    const abonos = previewImport.movimientos.filter(m => m.tipo === 'Abono').reduce((a, m) => a + m.monto, 0)
    const calc = previewImport.saldoInicial + abonos - cargos
    return { cargos, abonos, calc, ok: calc === previewImport.saldoFinal, esperado: previewImport.saldoFinal }
  }, [previewImport])

  const guardarLote = async (nuevas) => {
    try {
      const { data, error } = await supabase.from('movimientos_bancarios').insert(nuevas).select()
      if (error) throw error
      setRows(rs => [...(data || []), ...rs])
      window.alert('Se guardaron ' + (data || []).length + ' movimientos.')
      setTextoImport(''); setMostrarImportar(false)
    } catch (e) { window.alert('No se pudo guardar: ' + (e.message || e)) }
  }
  const confirmarImportTexto = () => {
    if (!previewImport || !previewImport.movimientos.length) return
    if (cuadreImport && !cuadreImport.ok) {
      if (!window.confirm('El saldo calculado (' + clp(cuadreImport.calc) + ') no coincide con el saldo final de la cartola (' + clp(cuadreImport.esperado) + '). Puede haber una fila mal reconocida. ¿Guardar de todas formas?')) return
    }
    const cartolaNumero = null
    const nuevas = previewImport.movimientos.map(m => ({
      banco: 'Banco de Chile', cuenta: null, cartola_numero: cartolaNumero, fecha: m.fecha, glosa: m.glosa,
      descripcion: clean(m.glosa), sucursal: m.sucursal || null, tipo_movimiento: m.tipo, monto: m.monto,
      categoria: reglaCategoria(m.glosa, m.tipo) || null, clasificacion: CLASIF[reglaCategoria(m.glosa, m.tipo)] || null,
      revisar: !reglaCategoria(m.glosa, m.tipo), nota: null, origen: 'pdf_banco_chile_pegado', oculto: false,
    }))
    guardarLote(nuevas)
  }

  const mesLabel = ym => { const [y, m] = ym.split('-'); return MESES[(+m) - 1] + ' ' + y }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 20, textTransform: 'uppercase', color: C.navy }}>Cartolas Bancarias</div>
          <div style={{ fontSize: 12, color: C.mut }}>Movimientos de cuenta corriente clasificados por categoria de gasto</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls,.csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) importarExcel(f); e.target.value = '' }} />
          <button onClick={() => setMostrarAgregar(v => !v)} style={{ background: '#fff', color: C.navy, border: '1px solid ' + C.navy, padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{mostrarAgregar ? 'Cancelar' : '+ Agregar movimiento'}</button>
          <button onClick={() => fileRef.current && fileRef.current.click()} style={{ background: '#fff', color: C.navy, border: '1px solid ' + C.navy, padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Importar Excel/CSV</button>
          <button onClick={() => setMostrarImportar(v => !v)} style={{ background: C.orange, color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{mostrarImportar ? 'Cancelar' : 'Pegar cartola (texto)'}</button>
        </div>
      </div>

      {mostrarAgregar && (
        <div style={{ border: '1px solid ' + C.border, borderRadius: 8, padding: 14, marginBottom: 14, background: C.gray, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <label style={{ fontSize: 11, color: C.mut }}>Fecha<input type="date" value={nuevo.fecha} onChange={e => setNuevo(v => ({ ...v, fecha: e.target.value }))} style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>Descripcion<input value={nuevo.descripcion} onChange={e => setNuevo(v => ({ ...v, descripcion: e.target.value }))} placeholder="Contraparte / detalle" style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>Tipo<select value={nuevo.tipo_movimiento} onChange={e => setNuevo(v => ({ ...v, tipo_movimiento: e.target.value, categoria: '' }))} style={ip}><option value="Cargo">Cargo (gasto)</option><option value="Abono">Abono (ingreso)</option></select></label>
          <label style={{ fontSize: 11, color: C.mut }}>Categoria<select value={nuevo.categoria} onChange={e => setNuevo(v => ({ ...v, categoria: e.target.value }))} style={ip}><option value="">- categoria -</option>{(nuevo.tipo_movimiento === 'Cargo' ? TIPOS_CARGO : TIPOS_ABONO).map(t => <option key={t} value={t}>{t}</option>)}</select></label>
          <label style={{ fontSize: 11, color: C.mut }}>Monto<input type="number" value={nuevo.monto} onChange={e => setNuevo(v => ({ ...v, monto: e.target.value }))} placeholder="0" style={ip} /></label>
          <button onClick={agregar} style={{ padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: 'none', background: C.navy, color: '#fff' }}>Guardar movimiento</button>
        </div>
      )}

      {mostrarImportar && (
        <div style={{ border: '1px solid ' + C.border, borderRadius: 8, padding: 14, marginBottom: 14, background: C.gray }}>
          <div style={{ fontSize: 12.5, color: C.mut, marginBottom: 8 }}>
            Pega aqui el texto de "Detalle de transaccion" de la cartola (incluye SALDO INICIAL y SALDO FINAL si los tienes, asi se valida el cuadre antes de guardar). Funciona con el formato de Banco de Chile.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: C.mut }}>Año de las fechas<input value={anioImport} onChange={e => setAnioImport(e.target.value.replace(/\D/g, '').slice(0, 4))} style={{ ...ip, width: 70, marginLeft: 6 }} /></label>
          </div>
          <textarea value={textoImport} onChange={e => setTextoImport(e.target.value)} rows={10} placeholder="30/06 SALDO INICIAL 10.404.605&#10;01/07 TRASPASO A:Serein Scotiabank INTERNET 4.185.000&#10;..." style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 11.5, padding: 10, border: '1px solid ' + C.border, borderRadius: 6 }} />
          {previewImport ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12.5, marginBottom: 6 }}>{previewImport.movimientos.length} movimientos reconocidos.</div>
              {cuadreImport ? (
                <div style={{ background: cuadreImport.ok ? '#E6F7EE' : '#FCEBEA', border: '1px solid ' + (cuadreImport.ok ? C.green : C.red), color: cuadreImport.ok ? '#1B9E5D' : C.red, padding: '8px 12px', borderRadius: 6, fontSize: 12.5, marginBottom: 10 }}>
                  {cuadreImport.ok ? '✓ Cuadra: ' : '✗ No cuadra: '} saldo calculado {clp(cuadreImport.calc)} {cuadreImport.ok ? '' : 'vs. saldo final de la cartola ' + clp(cuadreImport.esperado)}
                </div>
              ) : (
                <div style={{ color: C.mut, fontSize: 11.5, marginBottom: 10 }}>Pega tambien las lineas "SALDO INICIAL" y "SALDO FINAL" para validar el cuadre automaticamente.</div>
              )}
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid ' + C.border, borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead><tr style={{ background: C.navy, color: '#fff' }}>{['Fecha', 'Glosa', 'Tipo', 'Monto', 'Categoria auto'].map(h => <th key={h} style={{ padding: '5px 8px', textAlign: 'left' }}>{h}</th>)}</tr></thead>
                  <tbody>{previewImport.movimientos.map((m, i) => <tr key={i} style={{ borderBottom: '1px solid ' + C.border }}><td style={{ padding: '4px 8px' }}>{fmtF(m.fecha)}</td><td style={{ padding: '4px 8px' }}>{m.glosa}</td><td style={{ padding: '4px 8px' }}>{m.tipo}</td><td style={{ padding: '4px 8px', textAlign: 'right' }}>{clp(m.monto)}</td><td style={{ padding: '4px 8px', color: reglaCategoria(m.glosa, m.tipo) ? C.text : C.red }}>{reglaCategoria(m.glosa, m.tipo) || 'sin identificar'}</td></tr>)}</tbody>
                </table>
              </div>
              <button onClick={confirmarImportTexto} style={{ marginTop: 10, padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: 'none', background: C.orange, color: '#fff' }}>Guardar {previewImport.movimientos.length} movimientos</button>
            </div>
          ) : null}
        </div>
      )}

      {syncMsg ? <div style={{ background: syncMsg.startsWith('Error') ? '#FCEBEA' : '#E6F7EE', border: '1px solid ' + (syncMsg.startsWith('Error') ? C.red : C.green), color: syncMsg.startsWith('Error') ? C.red : '#1B9E5D', padding: '8px 12px', borderRadius: 6, fontSize: 12.5, marginBottom: 12 }}>{syncMsg}</div> : null}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {[['Gasto operacional real', clp(tot.real), C.navy], ['Total cargos', clp(tot.cargos), C.text], ['Total abonos', clp(tot.abonos), C.green], ['A revisar', tot.revisar, tot.revisar ? C.red : C.mut]].map(([k, v, col], i) => (
          <div key={i} style={{ flex: '1 1 150px', border: '1px solid ' + C.border, borderRadius: 6, padding: '10px 12px', background: C.gray }}>
            <div style={{ fontSize: 11, color: C.mut, textTransform: 'uppercase', fontWeight: 700 }}>{k}</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: col }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input style={{ ...ip, flex: '2 1 200px' }} placeholder="Buscar descripcion, glosa o nota..." value={q} onChange={e => setQ(e.target.value)} />
        <select style={{ ...ip, flex: '1 1 120px' }} value={mes} onChange={e => setMes(e.target.value)}>
          <option value="">Todos los meses</option>
          {meses.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
        </select>
        <select style={{ ...ip, flex: '1 1 130px' }} value={tipoF} onChange={e => setTipoF(e.target.value)}>
          <option value="">Cargo y abono</option>
          <option value="Cargo">Solo cargos</option>
          <option value="Abono">Solo abonos</option>
        </select>
        <select style={{ ...ip, flex: '1 1 150px' }} value={categoria} onChange={e => setCategoria(e.target.value)}>
          <option value="">Todas las categorias</option>
          {[...TIPOS_CARGO, ...TIPOS_ABONO.filter(t => !TIPOS_CARGO.includes(t))].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.text }}><input type="checkbox" checked={soloRevisar} onChange={e => setSoloRevisar(e.target.checked)} /> Solo a revisar</label>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, color: C.mut }}>{sel_.size} seleccionado(s)</span>
        {!verOcultos && <button onClick={ocultarSel} disabled={!sel_.size} style={{ border: 'none', padding: '7px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12.5, background: sel_.size ? C.red : '#DFE4EA', color: sel_.size ? '#fff' : C.mut, cursor: sel_.size ? 'pointer' : 'default' }}>Ocultar seleccionados</button>}
        {verOcultos && <button onClick={restaurarSel} disabled={!sel_.size} style={{ border: 'none', padding: '7px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12.5, background: sel_.size ? C.green : '#DFE4EA', color: sel_.size ? '#fff' : C.mut, cursor: sel_.size ? 'pointer' : 'default' }}>Restaurar seleccionados</button>}
        <button onClick={() => { setVerOcultos(v => !v); setSel_(new Set()) }} style={{ background: 'transparent', border: '1px solid ' + C.border, padding: '7px 12px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer', color: C.navy }}>{verOcultos ? 'Volver' : 'Ver ocultos'}</button>
      </div>

      <div style={{ border: '1px solid ' + C.border, borderRadius: 8, padding: 14, marginBottom: 12, background: C.gray }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <b style={{ color: C.navy, fontSize: 14 }}>Consolidado por categoria (cargos)</b>
          <button onClick={() => setVerConsol(v => !v)} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer', border: '1px solid ' + C.border, background: '#fff', color: C.text }}>{verConsol ? 'Ocultar' : 'Ver'}</button>
        </div>
        {verConsol && (
          <div style={{ marginTop: 12 }}>
            {NO_GASTO_REAL.some(c => consolCat.some(([cat]) => cat === c)) && <div style={{ fontSize: 11, color: C.mut, marginBottom: 8 }}>Traspaso interno, Provision interna y Banco no se cuentan como gasto operacional real (ver tarjeta "Gasto operacional real" arriba).</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <tbody>
                {consolCat.map(([cat, v]) => (
                  <tr key={cat} style={{ borderBottom: '1px solid ' + C.border, opacity: NO_GASTO_REAL.includes(cat) ? 0.55 : 1 }}>
                    <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>{cat}</td>
                    <td style={{ padding: '5px 8px', width: '45%' }}><div style={{ background: NO_GASTO_REAL.includes(cat) ? C.mut : C.navy, height: 8, borderRadius: 4, width: (Math.abs(v) / maxCat * 100) + '%', minWidth: 2 }} /></td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{clp(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {loading ? <div style={{ color: C.mut, padding: 20 }}>Cargando...</div> : errMsg ? <div style={{ background: '#FCEBEA', border: '1px solid ' + C.red, color: C.red, padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>{errMsg}</div> : filtradas.length === 0 ? (
        <div style={{ color: C.mut, padding: 20, textAlign: 'center', border: '1px dashed ' + C.border, borderRadius: 8 }}>Sin movimientos con estos filtros.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid ' + C.border, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1000 }}>
            <thead>
              <tr style={{ background: C.navy, color: '#fff' }}>
                <th style={{ padding: '9px 10px', width: 34 }}><input type="checkbox" checked={filtradas.length > 0 && sel_.size === filtradas.length} onChange={toggleTodas} /></th>
                {['Fecha', 'Descripcion', 'Tipo', 'Categoria', 'Monto', 'Revisar'].map(h => <th key={h} style={{ textAlign: h === 'Monto' ? 'right' : 'left', padding: '9px 10px', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #E2E7EC' }}>
                  <td style={{ padding: '7px 10px' }}><input type="checkbox" checked={sel_.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{fmtF(r.fecha)}</td>
                  <td style={{ padding: '7px 10px' }}>
                    <div style={{ fontWeight: 500 }}>{r.descripcion || r.glosa}</div>
                    {r.nota ? <div style={{ fontSize: 11, color: C.mut, marginTop: 2, maxWidth: 340 }}>{r.nota}</div> : null}
                  </td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', fontWeight: 600, color: r.tipo_movimiento === 'Cargo' ? C.red : C.green }}>{r.tipo_movimiento}</td>
                  <td style={{ padding: '7px 10px' }}>
                    <select value={r.categoria || ''} onChange={e => setCategoriaFila(r, e.target.value)} style={{ fontSize: 11, padding: '3px 5px', borderRadius: 6, border: '1px solid ' + C.border, background: '#fff', color: C.text, minWidth: 150 }}>
                      <option value="">— sin categoria —</option>
                      {(r.tipo_movimiento === 'Cargo' ? TIPOS_CARGO : TIPOS_ABONO).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {r.clasificacion ? <div style={{ fontSize: 10, fontWeight: 700, marginTop: 3, color: r.clasificacion === 'Fijo' ? '#2A5FB0' : C.orange }}>{r.clasificacion}</div> : null}
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{clp(r.monto)}</td>
                  <td style={{ padding: '7px 10px' }}>{r.revisar ? <span style={{ background: '#FCEBEA', color: C.red, fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>A revisar</span> : <span style={{ color: C.mut, fontSize: 11 }}>OK</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
