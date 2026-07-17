import { useEffect, useMemo, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabase.js'
import { pushState } from './sync.js'
import { calcularPerdidaFactoring } from './ParametrosModule.jsx'

const C = { navy: '#061A40', orange: '#FF6B00', gray: '#F5F7FA', border: '#D8DCE5', text: '#101828', green: '#16A34A', red: '#DC2626', mut: '#7A8288' }
const clp = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const ip = { padding: '6px 8px', border: '1px solid ' + C.border, fontSize: 12.5, boxSizing: 'border-box', borderRadius: 4 }
const sel = { padding: '4px 6px', border: '1px solid ' + C.border, fontSize: 12, borderRadius: 4, background: '#fff' }
// Muestra una fecha ISO (aaaa-mm-dd) como DD/MM/AAAA
const fmtF = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : (v || '-') }
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const AREAS = ['Santa Rosa', 'Istria', 'Proyectos']
const ESTADOS_PAGO = ['Pendiente', 'Pagada', 'Credito', 'Factoring']
const colorPago = e => e === 'Pagada' ? C.green : e === 'Factoring' ? C.orange : e === 'Credito' ? '#2563EB' : C.mut
const DIAS_OPC = [30, 45, 60, 90]
const LS_XLSX = 'serein_libroComprasXlsx'
const TIPOS = ['Pintura','Diluyente','Materiales','EPP','Diesel','Combustible','Herramientas','Repuestos','Fletes','Insumos','Viaticos','Peajes','Mantencion','Granalla','Servicios','Telefonia','Internet','Arriendo','Seguros','Leasing','Banco','Tag','Cafeteria','Honorarios','Software','Servicios basicos','Impuestos','Factoring','Credito','Intereses','Comisiones','Remuneraciones','Electricidad','Agua','Gas','Publicidad','Capacitacion','Notaria','Aduana','Courier','Suscripciones','Patentes','Contribuciones','Otros']
const CLASIF = { Pintura:'Variable', Diluyente:'Variable', Materiales:'Variable', EPP:'Variable', Diesel:'Variable', Combustible:'Variable', Herramientas:'Variable', Repuestos:'Variable', Fletes:'Variable', Insumos:'Variable', Viaticos:'Variable', Peajes:'Variable', Mantencion:'Variable', Granalla:'Variable', Servicios:'Variable', Telefonia:'Fijo', Internet:'Fijo', Arriendo:'Fijo', Seguros:'Fijo', Leasing:'Fijo', Banco:'Fijo', Tag:'Fijo', Cafeteria:'Fijo', Honorarios:'Fijo', Software:'Fijo', 'Servicios basicos':'Fijo', Impuestos:'Fijo', Factoring:'Variable', Credito:'Fijo', Intereses:'Variable', Comisiones:'Variable', Remuneraciones:'Fijo', Electricidad:'Variable', Agua:'Variable', Gas:'Variable', Publicidad:'Variable', Capacitacion:'Variable', Notaria:'Variable', Aduana:'Variable', Courier:'Variable', Suscripciones:'Fijo', Patentes:'Fijo', Contribuciones:'Fijo', Otros:'' }
const REGLAS = [[['combustible','copec','shell','petrobras','enex','terpel','lampa','esmax'],'Combustible'],[['sherwin','renner','coating','jotun','ppg','tricolor','pintura','ceresita','soquina'],'Pintura'],[['diluyente','thinner','solvente'],'Diluyente'],[['diesel','petroleo'],'Diesel'],[['ferreteria','acero','cubiertas','kubiec','estructura','sodimac','construmart','imperial','prodalam','novoplast','stratford','sanitarios','materiales','fierro','planchas'],'Materiales'],[['maestranza','mecanizado','metalica','galvaniz'],'Servicios'],[['automovil','automotriz','vulcaniz','neumatic','lubricentro','repuesto'],'Mantencion'],[['seguridad industrial','proteccion','implementos de seguridad','elementos de proteccion'],'EPP'],[['granalla','abrasivo'],'Granalla'],[['telefon','movistar','entel','claro chile','wom'],'Telefonia'],[['internet','fibra','mundo pacifico','gtd'],'Internet'],[['leasing'],'Leasing'],[['banco','santander','scotiabank','bancoestado'],'Banco'],[['seguro','mapfre','consorcio','zurich','hdi'],'Seguros'],[['arriendo','inmobiliaria'],'Arriendo'],[['contab','auditor','honorario'],'Honorarios'],[['casino','cafeteria'],'Cafeteria'],[['autopista','costanera','vespucio'],'Tag'],[['flete','transporte','logistica'],'Fletes'],[['factoring','factotal','tanner','incofin','primus capital'],'Factoring'],[['remuneracion','sueldo','finiquito'],'Remuneraciones'],[['publicidad','marketing','imprenta','grafica'],'Publicidad'],[['notaria','conservador de bienes'],'Notaria'],[['chilexpress','starken','correos de chile','courier','encomienda'],'Courier'],[['electricidad','enel','saesa','frontel','compania general de electricidad'],'Electricidad'],[['aguas andinas','essbio','esval','nuevosur','aguas nuevas'],'Agua']]
const rutN = r => String(r || '').split('.').join('').split(' ').join('').toUpperCase()
const reglaTipo = nombre => { const n = (nombre || '').toLowerCase(); for (const par of REGLAS) { for (const k of par[0]) { if (n.indexOf(k) >= 0) return par[1] } } return '' }
const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export default function LibroComprasModule({ esGerencia = true, ots = [], factoringList = [], proyectos = [], setProyectos = null }) {
  const otNumProy = p => String(p.ot || '').trim()
  const otsActivas = [
    ...(proyectos || []).filter(p => !p.cerrado).map(p => ({ n: otNumProy(p), etq: 'Proyectos · ' + otNumProy(p) + (p.cliente ? ' · ' + p.cliente : '') })),
    ...(ots || []).filter(o => o.estado !== 'Cerrada').map(o => ({ n: String(o.numero || ''), etq: (o.area || 'OT') + ' · ' + String(o.numero || '') + (o.cliente ? ' · ' + o.cliente : '') }))
  ].filter(o => o.n)
  const proyDeOT = n => (proyectos || []).find(p => otNumProy(p) === String(n || '').trim())
  const ccsDeOT = n => { const p = proyDeOT(n); if (!p) return []; const codes = [...new Set([...Object.keys(p.cc || {}), ...(p.compras || []).map(c => c.cc)])].filter(Boolean); return codes.map(c => ({ id: c, nombre: (p.ccNombres && p.ccNombres[c]) || c })) }
  const imputarFicha = (r, otNum, ccCode) => {
    if (!setProyectos) return
    setProyectos(ps => (ps || []).map(p => {
      const compras = (p.compras || []).filter(c => c.libroId !== r.id)
      if (otNumProy(p) !== String(otNum || '').trim() || !ccCode) return { ...p, compras }
      return { ...p, compras: [...compras, { id: 'lc' + r.id, proveedor: r.provider_name || '', folio: r.document_number || '', rut: r.provider_rut || '', monto: Math.round(Number(r.exenta ? (r.document_total || r.neto) : r.neto) || 0), cc: ccCode, fecha: r.emission_date || '', detalle: 'SII ' + (r.document_type || '') + (r.exenta ? ' (Exenta)' : ''), exento: !!r.exenta, origen: 'libro', libroId: r.id }] }
    }))
  }
  const [rows, setRows] = useState([])
  const [provTipo, setProvTipo] = useState({})
  const [customTipos, setCustomTipos] = useState(() => { try { return JSON.parse(localStorage.getItem('serein_tiposCustom') || '[]') } catch (e) { return [] } })
  const [verConsol, setVerConsol] = useState(false)
  const [dimConsol, setDimConsol] = useState('cat')
  const [sub, setSub] = useState('doc')
  const [sinDoc, setSinDoc] = useState([])
  const [nuevoSD, setNuevoSD] = useState({ fecha: '', monto: '', categoria: '', area: '', ot: '', centro_costo: '', glosa: '' })
  useEffect(() => { supabase.from('compras_sin_doc').select('*').order('fecha', { ascending: false }).then(res => { if (res.data) setSinDoc(res.data) }, () => {}) }, [])
  const totalSinDoc = (sinDoc || []).reduce((a, x) => a + (Number(x.monto) || 0), 0)
  const agregarSinDoc = async () => {
    const monto = Number(nuevoSD.monto) || 0
    if (!monto) { window.alert('Ingresa un monto valido'); return }
    const reg = { fecha: nuevoSD.fecha || new Date().toISOString().slice(0, 10), monto, categoria: nuevoSD.categoria || null, clasificacion: clasifDe(nuevoSD.categoria) || null, area: nuevoSD.area || null, ot: nuevoSD.ot || null, centro_costo: nuevoSD.centro_costo || null, glosa: nuevoSD.glosa || null }
    try { const res = await supabase.from('compras_sin_doc').insert(reg).select().single(); if (res.data) { setSinDoc(cur => [res.data, ...cur]) } else { setSinDoc(cur => [{ ...reg, id: 'tmp' + Date.now() }, ...cur]) } } catch (e) { setSinDoc(cur => [{ ...reg, id: 'tmp' + Date.now() }, ...cur]) }
    setNuevoSD({ fecha: '', monto: '', categoria: '', area: '', ot: '', centro_costo: '', glosa: '' })
  }
  const eliminarSinDoc = async (id) => { setSinDoc(cur => cur.filter(x => x.id !== id)); try { await supabase.from('compras_sin_doc').delete().eq('id', id) } catch (e) {} }
  const marcarTodasPago = async (estado) => {
    if (!window.confirm('Marcar TODAS las facturas de compra como ' + estado + '? Luego puedes cambiar las que quieras una por una.')) return
    setRows(rs => rs.map(r => ({ ...r, estado_pago: estado })))
    if (extra && extra.length) guardarExtra(extra.map(x => ({ ...x, estado_pago: estado })))
    const ids = (rows || []).map(r => r.id).filter(Boolean)
    if (ids.length) { try { await supabase.from('libro_compras').update({ estado_pago: estado }).in('id', ids) } catch (e) {} }
  }
  const marcarTodasPagadas = () => marcarTodasPago('Pagada')
  const marcarTodasPendientes = () => marcarTodasPago('Pendiente')
  useEffect(() => { supabase.from('tipos_gasto').select('tipo, clasificacion').then(res => { const list = res.data || []; if (!list.length) return; setCustomTipos(cur => { const map = {}; cur.forEach(c => { map[c.tipo] = c }); list.forEach(x => { map[x.tipo] = { tipo: x.tipo, clasif: x.clasificacion || '' } }); const merged = Object.values(map); try { localStorage.setItem('serein_tiposCustom', JSON.stringify(merged)) } catch (e) {} return merged }) }, () => {}) }, [])
  const tipoAuto = r => provTipo[rutN(r && r.provider_rut)] || reglaTipo(r && r.provider_name) || ''
  const clasifDe = t => (CLASIF[t] !== undefined ? CLASIF[t] : ((customTipos.find(c => c.tipo === t) || {}).clasif || ''))
  const agregarTipoCustom = () => {
    const nombre = (window.prompt('Nombre del nuevo tipo de gasto (ej: Factoring, Publicidad):') || '').trim()
    if (!nombre) return null
    const cl = (window.prompt('Clasificacion para "' + nombre + '": escribe F para Fijo, V para Variable, o deja vacio para ninguna', 'V') || '').trim().toUpperCase()
    const clasif = cl.charAt(0) === 'F' ? 'Fijo' : cl.charAt(0) === 'V' ? 'Variable' : ''
    setCustomTipos(cur => { if (cur.some(c => c.tipo === nombre)) return cur; const nx = [...cur, { tipo: nombre, clasif }]; try { localStorage.setItem('serein_tiposCustom', JSON.stringify(nx)) } catch (e) {} return nx })
    supabase.from('tipos_gasto').upsert({ tipo: nombre, clasificacion: clasif }, { onConflict: 'tipo' }).then(() => {}, () => {})
    return { tipo: nombre, clasif }
  }
  const setTipoCompra = (r, v) => {
    let tipo = v, clasif = ''
    if (v === '__add__') { const nuevo = agregarTipoCustom(); if (!nuevo) return; tipo = nuevo.tipo; clasif = nuevo.clasif }
    else { clasif = clasifDe(tipo) }
    setCampo(r.id, 'tipo_compra', tipo)
    setCampo(r.id, 'clasificacion', clasif || '')
    const k = rutN(r.provider_rut)
    if (k && tipo) {
      setProvTipo(m => ({ ...m, [k]: tipo }))
      supabase.from('proveedor_tipo').upsert({ rut: k, tipo, clasificacion: clasif || '', fuente: 'manual', updated_at: new Date().toISOString() }, { onConflict: 'rut' }).then(() => {}, () => {})
    }
  }
  useEffect(() => { supabase.from('proveedor_tipo').select('rut, tipo').then(res => { const m = {}; (res.data || []).forEach(x => { m[x.rut] = x.tipo }); if (Object.keys(m).length) setProvTipo(m) }, () => {}) }, [])
  useEffect(() => {
    if (!rows.length) return
    const pend = rows.filter(r => !r.tipo_compra && tipoAuto(r))
    if (!pend.length) return
    const mp = {}; pend.forEach(r => { mp[r.id] = tipoAuto(r) })
    setRows(rs => rs.map(r => mp[r.id] ? { ...r, tipo_compra: mp[r.id], clasificacion: CLASIF[mp[r.id]] || '' } : r))
    ;(async () => { const ids = Object.keys(mp); for (let i = 0; i < ids.length; i += 20) { await Promise.all(ids.slice(i, i + 20).map(id => supabase.from('libro_compras').update({ tipo_compra: mp[id], clasificacion: CLASIF[mp[id]] || '' }).eq('id', id).then(() => {}, () => {}))) } })()
  }, [rows, provTipo])
  const [loading, setLoading] = useState(true)
  const [errMsg, setErrMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [q, setQ] = useState('')
  const [mes, setMes] = useState('')
  const [tipo, setTipo] = useState('')
  const [area, setArea] = useState('')
  const [asig, setAsig] = useState(() => { try { return JSON.parse(localStorage.getItem('serein_comprasAreas') || '{}') } catch (e) { return {} } })
  const guardarAsig = (obj) => { setAsig(obj); try { localStorage.setItem('serein_comprasAreas', JSON.stringify(obj)); pushState() } catch (e) {} }
  const toggleArea = (id, a) => { const cur = asig[id] || []; const nx = cur.includes(a) ? cur.filter(x => x !== a) : [...cur, a]; guardarAsig({ ...asig, [id]: nx }) }
  const setGeneral = (id) => guardarAsig({ ...asig, [id]: ['Santa Rosa', 'Istria', 'Proyectos'] })
  const fileRef = useRef(null)
  const [extra, setExtra] = useState(() => { try { return JSON.parse(localStorage.getItem(LS_XLSX) || '[]') } catch (e) { return [] } })
  const guardarExtra = arr => { setExtra(arr); try { localStorage.setItem(LS_XLSX, JSON.stringify(arr)); pushState() } catch (e) {} }

  function importarExcel(file) {
    const toInt = v => { const n = Math.round(Number(v)); if (!isNaN(n)) return n; const m = parseInt(String(v).replace(/\D/g, ''), 10); return isNaN(m) ? 0 : m }
    const fechaDe = v => {
      if (v === null || v === undefined || v === '') return ''
      if (v instanceof Date && !isNaN(v.getTime())) {
        const y = v.getFullYear(), mo = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0')
        return y + '-' + mo + '-' + d
      }
      if (typeof v === 'number' && isFinite(v)) {
        const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)
        return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
      }
      const s = String(v).trim()
      let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
      if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0')
      m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
      if (m) {
        let y = m[3]
        if (y.length === 2) y = (Number(y) > 70 ? '19' : '20') + y
        return y + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0')
      }
      return ''
    }
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        // El CSV del SII (separador ;) se lee en crudo: si lo procesa SheetJS, interpreta 07/01/2026 como 7 de julio.
        const esCsv = /\.csv$/i.test(file.name || '')
        let filas, filasTxt
        if (esCsv) {
          const buf = new Uint8Array(ev.target.result)
          let txt = new TextDecoder('utf-8').decode(buf)
          if (txt.includes('\uFFFD')) txt = new TextDecoder('windows-1252').decode(buf)
          const lineas = txt.split(/\r?\n/).filter(l => l.trim() !== '')
          const cab = lineas[0] || ''
          const sep = (cab.split(';').length > cab.split(',').length) ? ';' : ((cab.split('\t').length > cab.split(',').length) ? '\t' : ',')
          filas = lineas.map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim()))
          filasTxt = filas
        } else {
          const wb = XLSX.read(ev.target.result, { type: 'array' })
          filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, blankrows: false })
          // Texto tal como se ve en Excel: la fecha se lee de aqui (dia primero)
          filasTxt = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, blankrows: false })
        }
        if (!filas.length) { window.alert('El archivo esta vacio.'); return }
        let hi = 0
        for (let i = 0; i < Math.min(filas.length, 12); i++) { const tt = (filas[i] || []).map(h => norm(h)).join('|'); if (tt.includes('folio') || tt.includes('proveedor') || tt.includes('neto')) { hi = i; break } }
        const hdr = (filas[hi] || []).map(h => norm(h).trim())
        const col = (...nn) => { for (const nm of nn) { const i = hdr.findIndex(h => h.includes(nm)); if (i >= 0) return i } return -1 }
        const colProv = () => { let pi = hdr.findIndex(h => h.includes('razon') || h.includes('nombre')); if (pi < 0) pi = hdr.findIndex(h => h.includes('proveedor') && !h.includes('rut')); return pi }; const ci = { folio: col('folio', 'documento', 'nro'), prov: colProv(), rut: col('rut'), tipo: col('tipo'), neto: col('neto', 'afecto'), iva: col('iva'), total: col('total', 'monto') }
        // Fecha del documento: nunca las columnas de vencimiento / recepcion / acuse / pago
        const noFecha = h => h.includes('vencim') || h.includes('recep') || h.includes('acuse') || h.includes('pago') || h.includes('reclam')
        let iF = hdr.findIndex(h => !noFecha(h) && (h.includes('fecha docto') || h.includes('fecha documento') || h.includes('fecha emis') || h.includes('emision')))
        if (iF < 0) iF = hdr.findIndex(h => !noFecha(h) && h.includes('fecha'))
        ci.fecha = iF
        const nuevas = []
        for (let r = hi + 1; r < filas.length; r++) {
          const row = filas[r]; if (!row) continue
          const folio = String(row[ci.folio] ?? '').replace(/\.0$/, '').trim()
          const prov = String(row[ci.prov] ?? '').trim()
          if (!folio && !prov) continue
          const neto = toInt(row[ci.neto])
          const iva = ci.iva >= 0 ? toInt(row[ci.iva]) : Math.round(neto * 0.19)
          const total = ci.total >= 0 && toInt(row[ci.total]) > 0 ? toInt(row[ci.total]) : neto + iva
          nuevas.push({ id: 'x' + folio + '-' + (String(row[ci.rut] ?? '').trim() || r), origen: 'xlsx', emission_date: fechaDe((filasTxt[r] || [])[ci.fecha] != null && (filasTxt[r] || [])[ci.fecha] !== '' ? (filasTxt[r] || [])[ci.fecha] : row[ci.fecha]), document_number: folio, provider_name: prov, provider_rut: String(row[ci.rut] ?? '').trim(), document_type: String(row[ci.tipo] ?? 'Factura').trim(), neto, iva, document_total: total, centro_costo: '', ot_id: '', cc_ot: '', estado_pago: 'Pendiente', factoring: '', dias: 30, dias_mora: 0, vencimiento: '' })
        }
        if (!nuevas.length) { window.alert('No se reconocieron filas. Revisa que el Excel tenga columnas Folio, Proveedor, Neto y Total.'); return }
        const ids = new Set(nuevas.map(x => x.id))
        guardarExtra([...nuevas, ...(extra || []).filter(x => !ids.has(x.id))])
        window.alert('Se importaron ' + nuevas.length + ' documentos. Asignales OT y centro de costo para cargarlos en las fichas.')
      } catch (err) { window.alert('No se pudo leer el Excel: ' + err) }
    }
    reader.readAsArrayBuffer(file)
  }
  const perdidaDe = r => {
    if (r.estado_pago !== 'Factoring') return null
    const f = (factoringList || []).find(x => x.nombre === r.factoring) || (factoringList || [])[0]
    if (!f) return null
    return calcularPerdidaFactoring(Math.round(Number(r.document_total) || 0), r.dias || 30, r.dias_mora || 0, f)
  }

  const cargar = async () => {
    setLoading(true); setErrMsg('')
    const { data, error } = await supabase
      .from('libro_compras').select('*')
      .order('emission_date', { ascending: false })
    if (error) { setErrMsg('No se pudo leer el libro de compras: ' + error.message + '. Revisa que corriste la migracion libro_compras_setup.sql en Supabase.') }
    else { setRows(data || []) }
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  const sincronizar = async () => {
    setSyncing(true); setSyncMsg('')
    try {
      const { data, error } = await supabase.functions.invoke('libro-compras-sync')
      if (error) throw error
      if (data && data.ok) { setSyncMsg('Sincronizado: ' + (data.saved ?? 0) + ' documentos (' + data.start + ' a ' + data.finish + ').'); await cargar() }
      else { setSyncMsg('La funcion respondio: ' + JSON.stringify(data)) }
    } catch (e) { setSyncMsg('Error al sincronizar: ' + (e.message || String(e))) }
    setSyncing(false)
  }

  const todas = useMemo(() => {
    const k = r => (r.document_number || '') + '|' + (r.provider_rut || '')
    const vistos = new Set((rows || []).map(k))
    return [...(rows || []), ...(extra || []).filter(r => !vistos.has(k(r)))]
  }, [rows, extra])
  const meses = useMemo(() => {
    const s = new Set(todas.map(r => (r.emission_date || '').slice(0, 7)).filter(Boolean))
    return [...s].sort().reverse()
  }, [todas])
  const tipos = useMemo(() => [...new Set(todas.map(r => r.document_type).filter(Boolean))].sort(), [todas])

  const [sel, setSel] = useState(() => new Set())
  const [verOcultas, setVerOcultas] = useState(false)

  const filtradas = useMemo(() => todas.filter(r => {
    if (verOcultas) { if (!r.oculto) return false } else { if (r.oculto) return false }
    if (mes && (r.emission_date || '').slice(0, 7) !== mes) return false
    if (tipo && r.document_type !== tipo) return false
    if (area && (r.centro_costo || '') !== area) return false
    if (q) { const t = (r.provider_name + ' ' + r.provider_rut + ' ' + r.document_number).toLowerCase(); if (!t.includes(q.toLowerCase())) return false }
    return true
  }), [todas, mes, tipo, area, q, verOcultas])

  const toggleSel = id => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleTodas = () => setSel(s => s.size === filtradas.length ? new Set() : new Set(filtradas.map(r => r.id)))
  const eliminarSel = async () => {
    const elegidas = filtradas.filter(r => sel.has(r.id))
    if (!elegidas.length) return
    if (!window.confirm('Se ocultaran ' + elegidas.length + ' documento(s). Dejaran de verse en la tabla y en los totales, y una nueva sincronizacion no los volvera a mostrar. Puedes recuperarlos con el boton "Ver ocultos". Las filas importadas desde Excel se eliminan definitivamente. Continuar?')) return
    const idsXlsx = elegidas.filter(r => (extra || []).some(x => x.id === r.id)).map(r => r.id)
    if (idsXlsx.length) guardarExtra((extra || []).filter(x => !idsXlsx.includes(x.id)))
    const idsDb = elegidas.filter(r => !idsXlsx.includes(r.id)).map(r => r.id)
    if (idsDb.length) {
      setRows(rs => rs.map(x => idsDb.includes(x.id) ? { ...x, oculto: true } : x))
      try { await supabase.from('libro_compras').update({ oculto: true }).in('id', idsDb) } catch (e) {}
    }
    setSel(new Set())
  }
  const restaurarSel = async () => {
    const ids = filtradas.filter(r => sel.has(r.id) && !(extra || []).some(x => x.id === r.id)).map(r => r.id)
    if (!ids.length) return
    setRows(rs => rs.map(x => ids.includes(x.id) ? { ...x, oculto: false } : x))
    try { await supabase.from('libro_compras').update({ oculto: false }).in('id', ids) } catch (e) {}
    setSel(new Set())
  }

  const tot = useMemo(() => filtradas.reduce((a, r) => ({ neto: a.neto + (r.exenta ? (+r.document_total || 0) : (+r.neto || 0)), iva: a.iva + (r.exenta ? 0 : (+r.iva || 0)), total: a.total + (+r.document_total || 0) }), { neto: 0, iva: 0, total: 0 }), [filtradas])

  const setCampo = async (id, campo, valor) => {
    if ((extra || []).some(x => x.id === id)) { guardarExtra((extra || []).map(x => x.id === id ? { ...x, [campo]: valor } : x)); return }
    setRows(rs => rs.map(r => r.id === id ? { ...r, [campo]: valor } : r))
    try { await supabase.from('libro_compras').update({ [campo]: valor }).eq('id', id) } catch (e) { /* columna puede no existir aun */ }
  }

  const mesLabel = ym => { const [y, m] = ym.split('-'); return MESES[(+m) - 1] + ' ' + y }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button onClick={() => setSub('doc')} style={{ padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: '1px solid ' + C.border, background: sub === 'doc' ? C.navy : '#fff', color: sub === 'doc' ? '#fff' : C.text }}>Documentos</button>
        <button onClick={() => setSub('sindoc')} style={{ padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: '1px solid ' + C.border, background: sub === 'sindoc' ? C.navy : '#fff', color: sub === 'sindoc' ? '#fff' : C.text }}>Compras sin documentos{totalSinDoc ? ' (' + clp(totalSinDoc) + ')' : ''}</button>
      </div>
      {sub === 'sindoc' && (
        <div>
          <div style={{ fontSize: 12.5, color: C.mut, marginBottom: 12 }}>Gastos sin documentacion (efectivo, boletas no ingresadas, etc.). Se suman al consolidado y se descuentan de la caja real en el Analista Financiero.</div>
          <div style={{ border: '1px solid ' + C.border, borderRadius: 8, padding: 14, marginBottom: 14, background: C.gray, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
            <label style={{ fontSize: 11, color: C.mut }}>Fecha<input type="date" value={nuevoSD.fecha} onChange={e => setNuevoSD(v => ({ ...v, fecha: e.target.value }))} style={ip} /></label>
            <label style={{ fontSize: 11, color: C.mut }}>Monto<input type="number" value={nuevoSD.monto} onChange={e => setNuevoSD(v => ({ ...v, monto: e.target.value }))} placeholder="0" style={ip} /></label>
            <label style={{ fontSize: 11, color: C.mut }}>Categoria<select value={nuevoSD.categoria} onChange={e => setNuevoSD(v => ({ ...v, categoria: e.target.value }))} style={ip}><option value="">- tipo -</option>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}{customTipos.map(c => <option key={c.tipo} value={c.tipo}>{c.tipo}</option>)}</select></label>
            <label style={{ fontSize: 11, color: C.mut }}>Clasificacion<input value={clasifDe(nuevoSD.categoria) || '-'} disabled style={{ ...ip, background: '#eee' }} /></label>
            <label style={{ fontSize: 11, color: C.mut }}>Area<select value={nuevoSD.area} onChange={e => setNuevoSD(v => ({ ...v, area: e.target.value }))} style={ip}><option value="">- area -</option>{AREAS.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
            <label style={{ fontSize: 11, color: C.mut }}>OT<input value={nuevoSD.ot} onChange={e => setNuevoSD(v => ({ ...v, ot: e.target.value }))} placeholder="OT" style={ip} /></label>
            <label style={{ fontSize: 11, color: C.mut }}>Centro de costo<input value={nuevoSD.centro_costo} onChange={e => setNuevoSD(v => ({ ...v, centro_costo: e.target.value }))} placeholder="CC" style={ip} /></label>
            <label style={{ fontSize: 11, color: C.mut, gridColumn: '1 / -1' }}>Glosa<input value={nuevoSD.glosa} onChange={e => setNuevoSD(v => ({ ...v, glosa: e.target.value }))} placeholder="Descripcion del gasto" style={ip} /></label>
            <button onClick={agregarSinDoc} style={{ padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: 'none', background: C.orange, color: '#fff' }}>Agregar gasto</button>
          </div>
          {sinDoc.length === 0 ? (
            <div style={{ color: C.mut, padding: 20, textAlign: 'center', border: '1px dashed ' + C.border, borderRadius: 8 }}>Sin gastos registrados. Agrega el primero arriba.</div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid ' + C.border, borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: C.navy, color: '#fff' }}>{['Fecha', 'Glosa', 'Categoria', 'Clasif.', 'Area', 'OT', 'CC', 'Monto', ''].map(h => <th key={h} style={{ padding: '7px 9px', textAlign: h === 'Monto' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {sinDoc.map(x => (
                    <tr key={x.id} style={{ borderBottom: '1px solid ' + C.border }}>
                      <td style={{ padding: '6px 9px', whiteSpace: 'nowrap' }}>{x.fecha}</td>
                      <td style={{ padding: '6px 9px' }}>{x.glosa}</td>
                      <td style={{ padding: '6px 9px', whiteSpace: 'nowrap' }}>{x.categoria || '-'}</td>
                      <td style={{ padding: '6px 9px', whiteSpace: 'nowrap', color: x.clasificacion === 'Fijo' ? '#2563EB' : x.clasificacion === 'Variable' ? C.orange : C.mut }}>{x.clasificacion || '-'}</td>
                      <td style={{ padding: '6px 9px', whiteSpace: 'nowrap' }}>{x.area || '-'}</td>
                      <td style={{ padding: '6px 9px', whiteSpace: 'nowrap' }}>{x.ot || '-'}</td>
                      <td style={{ padding: '6px 9px', whiteSpace: 'nowrap' }}>{x.centro_costo || '-'}</td>
                      <td style={{ padding: '6px 9px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{clp(x.monto)}</td>
                      <td style={{ padding: '6px 9px' }}><button onClick={() => eliminarSinDoc(x.id)} style={{ border: 'none', background: 'transparent', color: C.red, cursor: 'pointer', fontSize: 12 }}>Eliminar</button></td>
                    </tr>
                  ))}
                  <tr style={{ background: C.gray, fontWeight: 700 }}><td colSpan={7} style={{ padding: '7px 9px', textAlign: 'right' }}>Total sin documentos</td><td style={{ padding: '7px 9px', textAlign: 'right' }}>{clp(totalSinDoc)}</td><td></td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {sub === 'doc' && (<>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 20, textTransform: 'uppercase', color: C.navy }}>Libro de Compras</div>
          <div style={{ fontSize: 12, color: C.mut }}>Facturas de compra recibidas (SII) · sincronizado desde Defontana</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls,.csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) importarExcel(f); e.target.value = '' }} />
          <button onClick={() => fileRef.current && fileRef.current.click()} style={{ background: C.orange, color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Importar Excel</button>
          <button onClick={sincronizar} disabled={syncing} style={{ background: C.navy, color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: syncing ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13 }}>
            {syncing ? 'Sincronizando...' : 'Sincronizar con Defontana'}
          </button>
        </div>
      </div>

      {syncMsg ? <div style={{ background: syncMsg.startsWith('Error') ? '#FDECEC' : '#EAF7EE', border: '1px solid ' + (syncMsg.startsWith('Error') ? C.red : C.green), color: syncMsg.startsWith('Error') ? C.red : '#15803D', padding: '8px 12px', borderRadius: 6, fontSize: 12.5, marginBottom: 12 }}>{syncMsg}</div> : null}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {[['Documentos', filtradas.length, C.navy], ['Neto', clp(tot.neto), C.navy], ['IVA', clp(tot.iva), C.orange], ['Total', clp(tot.total), C.navy]].map(([k, v, col], i) => (
          <div key={i} style={{ flex: '1 1 130px', border: '1px solid ' + C.border, borderRadius: 6, padding: '10px 12px', background: C.gray }}>
            <div style={{ fontSize: 11, color: C.mut, textTransform: 'uppercase', fontWeight: 700 }}>{k}</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: col }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input style={{ ...ip, flex: '2 1 200px' }} placeholder="Buscar proveedor, RUT o folio..." value={q} onChange={e => setQ(e.target.value)} />
        <select style={{ ...ip, flex: '1 1 120px' }} value={mes} onChange={e => setMes(e.target.value)}>
          <option value="">Todos los meses</option>
          {meses.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
        </select>
        <select style={{ ...ip, flex: '1 1 120px' }} value={area} onChange={e => setArea(e.target.value)}>
          <option value="">Todas las areas</option>
          {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select style={{ ...ip, flex: '1 1 120px' }} value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {tipos.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, color: C.mut }}>{sel.size} seleccionado(s)</span>
        {!verOcultas && <button onClick={eliminarSel} disabled={!sel.size} style={{ border: 'none', padding: '7px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12.5, background: sel.size ? C.red : '#E6E8EE', color: sel.size ? '#fff' : C.mut, cursor: sel.size ? 'pointer' : 'default' }}>Eliminar seleccionados</button>}
        {verOcultas && <button onClick={restaurarSel} disabled={!sel.size} style={{ border: 'none', padding: '7px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12.5, background: sel.size ? C.green : '#E6E8EE', color: sel.size ? '#fff' : C.mut, cursor: sel.size ? 'pointer' : 'default' }}>Restaurar seleccionados</button>}
        <button onClick={() => { setVerOcultas(v => !v); setSel(new Set()) }} style={{ background: 'transparent', border: '1px solid ' + C.border, padding: '7px 12px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer', color: C.navy }}>{verOcultas ? 'Volver al libro' : 'Ver ocultos'}</button>
      </div>

      {filtradas.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={marcarTodasPagadas} style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, border: 'none', background: C.green, color: '#fff' }}>Marcar todas como pagadas</button>
          <button onClick={marcarTodasPendientes} style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, border: '1px solid ' + C.border, background: '#fff', color: C.text }}>Marcar todas como pendientes</button>
          <span style={{ fontSize: 11.5, color: C.mut }}>Marca todo de una vez y luego cambia solo las que no correspondan.</span>
        </div>
      )}
      {(filtradas.length || sinDoc.length) ? (() => {
        const montoDe = r => Number(r.exenta ? (r.document_total || r.neto || 0) : (r.neto || 0))
        const tipoDe = r => r.tipo_compra || tipoAuto(r) || 'Sin tipo'
        const fv = { Fijo: 0, Variable: 0, 'Sin clasificar': 0 }
        const cat = {}, mesG = {}, otG = {}, ccG = {}
        let total = 0
        const _srcSD = [...filtradas, ...sinDoc.map(x => ({ tipo_compra: x.categoria, clasificacion: x.clasificacion, neto: x.monto, document_total: x.monto, exenta: false, emission_date: x.fecha, ot_id: x.ot, centro_costo: x.centro_costo }))]
        for (const r of _srcSD) {
          const m = montoDe(r); total += m
          const t = tipoDe(r)
          const clRaw = clasifDe(r.tipo_compra || tipoAuto(r)) || r.clasificacion || ''
          const cl = clRaw === 'Fijo' ? 'Fijo' : clRaw === 'Variable' ? 'Variable' : 'Sin clasificar'
          fv[cl] += m
          cat[t] = (cat[t] || 0) + m
          const mm = (r.emission_date || '').slice(0, 7) || 'Sin fecha'; mesG[mm] = (mesG[mm] || 0) + m
          const oo = r.ot_id ? ('OT ' + r.ot_id) : 'Sin OT'; otG[oo] = (otG[oo] || 0) + m
          const ccx = r.centro_costo || 'Sin centro'; ccG[ccx] = (ccG[ccx] || 0) + m
        }
        const ent = o => Object.entries(o).sort((a, b) => b[1] - a[1])
        const dims = { cat: ent(cat), fv: ent(fv), mes: Object.entries(mesG).sort((a, b) => a[0] < b[0] ? 1 : -1), ot: ent(otG), cc: ent(ccG) }
        const rowsDim = dims[dimConsol] || []
        const maxV = Math.max(1, ...rowsDim.map(x => Math.abs(x[1])))
        const tb = (id, txt) => <button onClick={() => setDimConsol(id)} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer', border: '1px solid ' + C.border, background: dimConsol === id ? C.navy : '#fff', color: dimConsol === id ? '#fff' : C.text }}>{txt}</button>
        const card = (lbl, val, col) => <div style={{ flex: '1 1 150px', background: '#fff', border: '1px solid ' + C.border, borderRadius: 8, padding: 10 }}><div style={{ fontSize: 11, color: C.mut }}>{lbl}</div><div style={{ fontSize: 18, fontWeight: 700, color: col }}>{clp(val)}</div></div>
        return (
          <div style={{ border: '1px solid ' + C.border, borderRadius: 8, padding: 14, marginBottom: 12, background: C.gray }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <b style={{ color: C.navy, fontSize: 14 }}>Consolidado de compras {verConsol ? '' : '· ' + clp(total)}</b>
              <button onClick={() => setVerConsol(v => !v)} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer', border: '1px solid ' + C.border, background: '#fff', color: C.text }}>{verConsol ? 'Ocultar' : 'Ver consolidado'}</button>
            </div>
            {verConsol ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                  {card('Gastos fijos', fv.Fijo, '#2563EB')}
                  {card('Gastos variables', fv.Variable, C.orange)}
                  {card('Total neto', total, C.navy)}
                </div>
                {fv['Sin clasificar'] > 0 ? <div style={{ fontSize: 11, color: C.mut, marginBottom: 10 }}>Sin clasificar (falta asignar tipo): {clp(fv['Sin clasificar'])}</div> : null}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {tb('cat', 'Por categoria')}
                  {tb('fv', 'Fijo / Variable')}
                  {tb('mes', 'Por mes')}
                  {tb('ot', 'Por OT')}
                  {tb('cc', 'Por centro de costo')}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <tbody>
                    {rowsDim.map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: '1px solid ' + C.border }}>
                        <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>{k}</td>
                        <td style={{ padding: '5px 8px', width: '50%' }}><div style={{ background: C.navy, height: 8, borderRadius: 4, width: (Math.abs(v) / maxV * 100) + '%', minWidth: 2 }} /></td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{clp(v)}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: C.mut, whiteSpace: 'nowrap' }}>{total > 0 ? Math.round(v / total * 100) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        )
      })() : null}

      {loading ? <div style={{ color: C.mut, padding: 20 }}>Cargando...</div> : errMsg ? <div style={{ background: '#FDECEC', border: '1px solid ' + C.red, color: C.red, padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>{errMsg}</div> : filtradas.length === 0 ? (
        <div style={{ color: C.mut, padding: 20, textAlign: 'center', border: '1px dashed ' + C.border, borderRadius: 8 }}>
          Sin documentos. Presiona <b>Sincronizar con Defontana</b> para traer el libro de compras del ano.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid ' + C.border, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1200 }}>
            <thead>
              <tr style={{ background: C.navy, color: '#fff' }}>
                <th style={{ padding: '9px 10px', width: 34 }}><input type="checkbox" checked={filtradas.length > 0 && sel.size === filtradas.length} onChange={toggleTodas} /></th>
                {['Emision', 'Proveedor', 'Folio', 'Tipo', 'Tipo compra', 'Neto', 'IVA', 'Total', 'OT', 'Centro de costo', 'Area', 'Pago', 'Reparto area'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Neto' || h === 'IVA' || h === 'Total' ? 'right' : 'left', padding: '9px 10px', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #EEECE4' }}>
                  <td style={{ padding: '7px 10px' }}><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{fmtF(r.emission_date)}</td>
                  <td style={{ padding: '7px 10px' }}><div style={{ fontWeight: 600 }}>{r.provider_name || '-'}</div><div style={{ color: C.mut, fontSize: 11 }}>{r.provider_rut}</div></td>
                  <td style={{ padding: '7px 10px' }}>{r.document_number}</td>
                  <td style={{ padding: '7px 10px', fontSize: 11.5 }}>{r.document_type}<label style={{ display: 'block', marginTop: 3, fontSize: 10.5, color: C.mut, cursor: 'pointer' }}><input type="checkbox" checked={!!r.exenta} onChange={e => setCampo(r.id, 'exenta', e.target.checked)} /> Exenta</label></td>
                  <td style={{ padding: '7px 10px' }}>
                    <select value={r.tipo_compra || tipoAuto(r)} onChange={e => setTipoCompra(r, e.target.value)} style={{ fontSize: 11, padding: '3px 5px', borderRadius: 6, border: '1px solid ' + C.border, background: '#fff', color: C.text, maxWidth: 130 }}>
                      <option value="">—</option>
                      {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                      {customTipos.map(c => <option key={c.tipo} value={c.tipo}>{c.tipo}</option>)}
                      {r.tipo_compra && !TIPOS.includes(r.tipo_compra) && !customTipos.some(c => c.tipo === r.tipo_compra) ? <option value={r.tipo_compra}>{r.tipo_compra}</option> : null}
                      <option value="__add__">➕ Agregar tipo nuevo…</option>
                    </select>
                    {(() => { const tv = r.tipo_compra || tipoAuto(r); const cl = clasifDe(tv) || (r.clasificacion || ''); return cl ? <div style={{ fontSize: 10, fontWeight: 700, marginTop: 3, color: cl === 'Fijo' ? '#2563EB' : C.orange }}>{cl}</div> : null })()}
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{clp(r.exenta ? (r.document_total || r.neto) : r.neto)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: C.orange }}>{clp(r.exenta ? 0 : r.iva)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{clp(r.document_total)}</td>
                  <td style={{ padding: '7px 10px' }}>
                    <select style={{ ...sel, minWidth: 130 }} value={r.ot_id || ''} onChange={e => { const v = e.target.value; setCampo(r.id, 'ot_id', v); setCampo(r.id, 'cc_ot', ''); imputarFicha(r, v, '') }}>
                      <option value="">- sin OT -</option>
                      {otsActivas.map(o => <option key={o.etq} value={o.n}>{o.etq}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <select style={{ ...sel, minWidth: 150 }} value={r.cc_ot || ''} disabled={ccsDeOT(r.ot_id).length === 0} onChange={e => { const v = e.target.value; setCampo(r.id, 'cc_ot', v); imputarFicha(r, r.ot_id, v) }}>
                      <option value="">{ccsDeOT(r.ot_id).length ? '- centro de costo -' : '-'}</option>
                      {ccsDeOT(r.ot_id).map(c => <option key={c.id} value={c.id}>{c.id} · {c.nombre}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <select style={{ ...sel, minWidth: 110 }} value={r.centro_costo || ''} onChange={e => setCampo(r.id, 'centro_costo', e.target.value)}>
                      <option value="">- area -</option>
                      {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <select style={{ ...sel, minWidth: 100, color: colorPago(r.estado_pago), fontWeight: 600 }} value={r.estado_pago || ''} onChange={e => setCampo(r.id, 'estado_pago', e.target.value)}>
                      <option value="">- pago -</option>
                      {ESTADOS_PAGO.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                    {r.estado_pago === 'Factoring' ? (
                      <div style={{ marginTop: 5, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                        <select style={{ ...sel, minWidth: 110 }} value={r.factoring || ''} onChange={e => setCampo(r.id, 'factoring', e.target.value)}>
                          <option value="">- factoring -</option>
                          {factoringList.map(f => <option key={f.id} value={f.nombre}>{f.nombre}</option>)}
                        </select>
                        <select style={{ ...sel }} value={r.dias || 30} onChange={e => setCampo(r.id, 'dias', parseInt(e.target.value, 10))}>
                          {DIAS_OPC.map(d => <option key={d} value={d}>{d} dias</option>)}
                        </select>
                        <input placeholder="Mora" style={{ ...sel, width: 70 }} value={r.dias_mora || ''} onChange={e => setCampo(r.id, 'dias_mora', parseInt(String(e.target.value).replace(/\D/g, ''), 10) || 0)} />
                        <input type="date" title="Vencimiento factura" style={{ ...sel }} value={r.vencimiento || ''} onChange={e => setCampo(r.id, 'vencimiento', e.target.value)} />
                        {perdidaDe(r) ? <span style={{ color: C.red, fontWeight: 700, fontSize: 11.5 }}>Descuento: {clp(perdidaDe(r).total)}</span> : null}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: '7px 10px' }}><div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>{[['Santa Rosa', 'SR'], ['Istria', 'IST'], ['Proyectos', 'PROY']].map(a => { const on = (asig[r.id] || []).includes(a[0]); return <button key={a[0]} onClick={() => toggleArea(r.id, a[0])} title={a[0]} style={{ border: '1px solid ' + (on ? C.navy : '#CBD2D6'), background: on ? C.navy : '#fff', color: on ? '#fff' : C.mut, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, cursor: 'pointer' }}>{a[1]}</button> })}<button onClick={() => setGeneral(r.id)} title="General: 1/3 a cada area" style={{ border: '1px dashed #CBD2D6', background: '#fff', color: C.mut, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, cursor: 'pointer' }}>Gen</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>)}
    </div>
  )
}
