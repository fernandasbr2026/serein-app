import React, { useEffect, useMemo, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabase.js'
import { pushState } from './sync.js'
import { calcularPerdidaFactoring } from './ParametrosModule.jsx'
import { descargarInformeFacturas } from './informeFacturas.js'
import { fileToBase64 } from './protocolo-pdf.js'
import { leerFacturasOcultasLibro } from './facturasOcultas.js'
import { PLAZOS_SUGERIDOS, PLAZO_POR_DEFECTO, PLAZO_MAX, plazoValido, sumarDias, plazoDe, conFechasCoherentes, diasParaVencer, textoDiasParaVencer, hoyISO } from './vencimientos.js'

import { SEREIN } from './theme-serein.js'
// Paleta reskineada a la identidad Serein 2026 — mismas claves, solo cambian los valores hex.
const C = { navy: SEREIN.ink, orange: SEREIN.orange, gray: SEREIN.fog, border: SEREIN.line, green: SEREIN.green, red: SEREIN.red, mut: SEREIN.textFaint }
const esExenta = t => /exent/i.test(String(t || ''))
const clp = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const ip = { padding: '6px 8px', border: '1px solid ' + C.border, fontSize: 12.5, boxSizing: 'border-box', borderRadius: 4 }
const sel = { padding: '4px 6px', border: '1px solid ' + C.border, fontSize: 12, borderRadius: 4, background: '#fff' }
// Muestra una fecha ISO (aaaa-mm-dd) como DD/MM/AAAA
const fmtF = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : (v || '-') }
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const AREAS = ['Santa Rosa', 'Istria', 'Proyectos']
const ESTADOS_PAGO = ['Pendiente', 'Pagado', 'Factoring', 'Vencida', 'Anulada']
const DIAS_OPC = [30, 45, 60, 90]
const MEDIOS_PAGO = ['', 'Transferencia', 'Cheque', 'Efectivo', 'Tarjeta', 'Otro']
const LS_KEY = 'serein_libroVentasXlsx'
const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const colorPago = e => e === 'Pagado' ? C.green : e === 'Factoring' ? C.orange : e === 'Vencida' ? C.red : C.mut
// Columna fija (casilla + folio): se queda a la vista cuando la tabla se desplaza hacia la derecha.
// Sombra en vez de borde: en una tabla con bordes colapsados el borde no acompaña a la celda.
const FIJA_TD = { position: 'sticky', left: 0, zIndex: 2, background: '#fff', boxShadow: '4px 0 6px -4px rgba(15, 23, 42, 0.28)' }
const FIJA_TH = { ...FIJA_TD, zIndex: 3, background: C.navy }

export default function LibroVentasModule({ ots = [], proyectos = [], facturas = {}, setFacturas = () => {}, params = { factoring: [] } }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [errMsg, setErrMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [q, setQ] = useState('')
  const [mes, setMes] = useState('')
  const [tipo, setTipo] = useState('')
  const [fArea, setFArea] = useState('')
  const fileRef = useRef(null)
  const [extra, setExtra] = useState(() => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch (e) { return [] } })
  const guardarExtra = arr => { setExtra(arr); try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); pushState() } catch (e) {} }

  const facs = params.factoring || []
  const otNumProy = p => String(p.ot || '').trim()
  const otsActivas = [
    ...(proyectos || []).filter(p => !p.cerrado).map(p => ({ n: otNumProy(p), etq: 'Proyectos - ' + otNumProy(p) + (p.cliente ? ' - ' + p.cliente : '') })),
    ...(ots || []).filter(o => o.estado !== 'Cerrada').map(o => ({ n: String(o.numero || ''), etq: (o.area || 'OT') + ' - ' + String(o.numero || '') + (o.cliente ? ' - ' + o.cliente : '') }))
  ].filter(o => o.n)
  const proyDeOT = n => (proyectos || []).find(p => otNumProy(p) === String(n || '').trim())
  const ccsDeOT = n => { const p = proyDeOT(n); if (!p) return []; const codes = [...new Set([...Object.keys(p.cc || {}), ...(p.compras || []).map(c => c.cc)])].filter(Boolean); return codes.map(c => ({ id: c, nombre: (p.ccNombres && p.ccNombres[c]) || c })) }

  const cargar = async () => {
    setLoading(true); setErrMsg('')
    const { data, error } = await supabase.from('libro_ventas').select('*').order('emission_date', { ascending: false })
    if (error) setErrMsg('No se pudo leer el libro de ventas: ' + error.message)
    else setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  const sincronizar = async () => {
    setSyncing(true); setSyncMsg('')
    try {
      const { data, error } = await supabase.functions.invoke('libro-ventas-sync')
      if (error) throw error
      if (data && data.ok) { setSyncMsg('Sincronizado: ' + (data.nuevas ?? 0) + ' nuevos, ' + (data.actualizadas ?? 0) + ' actualizados.'); await cargar() }
      else setSyncMsg('La funcion respondio: ' + JSON.stringify(data))
    } catch (e) { setSyncMsg('Error al sincronizar: ' + (e.message || String(e))) }
    setSyncing(false)
  }

  // ---------- Importar Excel ----------
  function importarExcel(file) {
    const toInt = v => { const n = Math.round(Number(v)); if (!isNaN(n)) return n; const m = parseInt(String(v).replace(/\D/g, ''), 10); return isNaN(m) ? 0 : m }
    const fechaDe = v => {
      if (v === null || v === undefined || v === '') return ''
      if (v instanceof Date && !isNaN(v.getTime())) {
        const y = v.getFullYear(), mo = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0')
        return y + '-' + mo + '-' + d
      }
      if (typeof v === 'number' && isFinite(v)) {
        // Numero de serie de Excel (base 1899-12-30). Se arma en UTC para no correr un dia por zona horaria.
        const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)
        return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
      }
      const s = String(v).trim()
      let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
      if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0')
      // DD-MM-AAAA o DD/MM/AAAA (formato chileno: el dia va primero)
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
          const hoja = wb.SheetNames[0]
          filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, blankrows: false })
          // Texto tal como se ve en Excel: la fecha se lee de aqui (dia primero)
          filasTxt = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: false, blankrows: false })
        }
        if (!filas.length) { window.alert('El archivo esta vacio.'); return }
        let hi = 0
        for (let i = 0; i < Math.min(filas.length, 12); i++) { const t = (filas[i] || []).map(h => norm(h)).join('|'); if (t.includes('folio') || t.includes('documento') || t.includes('neto')) { hi = i; break } }
        const hdr = (filas[hi] || []).map(h => norm(h).trim())
        const col = (...nn) => { for (const nm of nn) { const i = hdr.findIndex(h => h.includes(nm)); if (i >= 0) return i } return -1 }
        const ci = { folio: col('folio', 'documento', 'nro', 'n\u00b0'), rut: col('rut'), tipo: col('tipo'), neto: col('neto', 'afecto'), iva: col('iva'), total: col('total', 'monto'), venc: col('vencim') }
        // Fecha del documento: nunca las columnas de vencimiento / recepcion / acuse / pago
        const noFecha = h => h.includes('vencim') || h.includes('recep') || h.includes('acuse') || h.includes('pago') || h.includes('reclam')
        let iF = hdr.findIndex(h => !noFecha(h) && (h.includes('fecha docto') || h.includes('fecha documento') || h.includes('fecha emis') || h.includes('emision')))
        if (iF < 0) iF = hdr.findIndex(h => !noFecha(h) && h.includes('fecha'))
        ci.fecha = iF
        // Nombre del cliente: nunca la columna de RUT (ej. 'Rut Cliente'), y sin acentos ('Raz\u00f3n Social')
        const sinRut = h => !h.includes('rut')
        let ic = hdr.findIndex(h => sinRut(h) && (h.includes('razon') || h.includes('nombre') || h.includes('senor')))
        if (ic < 0) ic = hdr.findIndex(h => sinRut(h) && h.includes('cliente'))
        ci.cli = ic === ci.rut ? -1 : ic
        const nuevas = []
        for (let r = hi + 1; r < filas.length; r++) {
          const row = filas[r]; if (!row) continue
          const folio = String(row[ci.folio] ?? '').replace(/\.0$/, '').trim()
          const cliente = ci.cli >= 0 ? String(row[ci.cli] || '').trim() : ''
          if (!folio) continue
          const neto = toInt(row[ci.neto])
          const iva = ci.iva >= 0 ? toInt(row[ci.iva]) : Math.round(neto * 0.19)
          const total = ci.total >= 0 && toInt(row[ci.total]) > 0 ? toInt(row[ci.total]) : neto + iva
          nuevas.push({ id: 'x' + folio + '-' + (String(row[ci.rut] ?? '').trim() || r), origen: 'xlsx', emission_date: fechaDe((filasTxt[r] || [])[ci.fecha] != null && (filasTxt[r] || [])[ci.fecha] !== '' ? (filasTxt[r] || [])[ci.fecha] : row[ci.fecha]), document_number: folio, client_name: cliente, client_rut: String(row[ci.rut] ?? '').trim(), document_type: String(row[ci.tipo] ?? 'Factura').trim(), neto, iva, total, vencimiento: fechaDe(row[ci.venc]), status: 'Importada', area: '', ot_id: '', cc_ot: '', estado_pago: 'Pendiente', factoring_id: '', dias: 30, dias_mora: 0, fecha_pago: '', banco: '' })
        }
        if (!nuevas.length) { window.alert('No se reconocieron filas. Revisa que el Excel tenga columnas Folio, Cliente, Neto y Total.') ; return }
        const ids = new Set(nuevas.map(x => x.id))
        const conservadas = (extra || []).filter(x => !ids.has(x.id))
        guardarExtra([...nuevas, ...conservadas])
        window.alert('Se importaron ' + nuevas.length + ' documentos. Ahora asignales area y OT para que se carguen solos en las fichas.')
      } catch (err) { window.alert('No se pudo leer el Excel: ' + err) }
    }
    reader.readAsArrayBuffer(file)
  }

  // ---------- Sincronizacion automatica hacia las fichas (via Facturas del area) ----------
  // Notas de credito (tipo 61): restan de la venta
  const esNC = r => String(r.document_type || '').trim() === '61'
  const sgn = r => esNC(r) ? -1 : 1
  // Notas de crédito que rebajan una factura: mismo folio y, si ambos traen RUT, mismo cliente.
  const mismaFactura = (n, f) => !esNC(f) && String(f.document_number || '').trim() === String(n.anula_folio || '').trim() && (!n.client_rut || !f.client_rut || n.client_rut === f.client_rut)
  const vigente = n => esNC(n) && !n.oculto && n.estado_pago !== 'Anulada' && String(n.anula_folio || '').trim()
  const ncsDe = f => todas.filter(n => vigente(n) && mismaFactura(n, f))
  const ncAplicadasDe = f => esNC(f) ? [] : ncsDe(f).map(n => ({ folio: String(n.document_number || ''), neto: Math.round(Number(n.neto) || 0), bruto: Math.round(Number(n.total) || 0) }))
  const fichaDe = r => ({ id: 'lv' + r.id, libroId: 'LV' + r.id, origen: 'libroVentas', numero: String(r.document_number || ''), cliente: r.client_name || '', ot: String(r.ot_id || ''), oc: r.oc || '', nv: r.nv || '', cc: r.cc_ot || '', fecha_emision: r.emission_date || '', vencimiento: r.vencimiento || '', neto: sgn(r) * Math.round(Number(r.neto) || 0), monto: sgn(r) * Math.round(Number(r.total) || 0), estado: r.estado_pago || 'Pendiente', fecha_pago: r.fecha_pago || '', banco: r.banco || '', medioPago: r.medio_pago || '', numeroCheque: r.numero_cheque || '', factoringId: r.factoring_id || '', dias: r.dias || 30, diasMora: r.dias_mora || 0, comentarios: 'Importada del Libro de Ventas', vendedor: 'General', ncAplicadas: ncAplicadasDe(r) })
  const vaAFacturas = r => !!r.area && !r.oculto && r.estado_pago !== 'Anulada'

  // Copia una o varias filas del libro hacia Facturas de una sola vez (cada llamada reescribe
  // `facturas` completo desde la misma copia, así que varias filas no pueden ir en llamadas sueltas).
  // `forzar` son campos que el libro manda aunque vengan vacíos (ej. quitar el vencimiento).
  const sincronizarFichas = (filas, forzar = []) => {
    const ids = new Set(filas.map(r => 'LV' + r.id))
    const base = {}
    const previas = {}
    Object.keys(facturas || {}).forEach(a => {
      (facturas[a] || []).forEach(f => { if (ids.has(f.libroId)) previas[f.libroId] = f })
      base[a] = (facturas[a] || []).filter(f => !ids.has(f.libroId))
    })
    filas.forEach(r => {
      if (!vaAFacturas(r)) return
      // Se conserva lo editado en Facturas (OC, centro de costo, etc.); el libro solo pisa lo que trae con valor
      const f = fichaDe(r)
      const merge = { ...(previas[f.libroId] || {}) }
      Object.keys(f).forEach(k => { if (forzar.includes(k) || (f[k] !== '' && f[k] !== null && f[k] !== undefined)) merge[k] = f[k] })
      base[r.area] = [merge, ...(base[r.area] || [])]
    })
    // Escribe en facturas (prop del padre, no el estado propio de este
    // modulo) — persiste sincrónicamente en localStorage y sube a la nube
    // de inmediato, mismo patrón ya probado en OTModule.jsx/
    // FacturasModule.jsx, para no perder la asignación si la persona
    // navega antes del guardado general de 800ms.
    try { localStorage.setItem('serein_facturas', JSON.stringify(base)) } catch (e) {}
    setFacturas(base)
    pushState()
  }
  const sincronizarFicha = (r, forzar) => sincronizarFichas([r], forzar)

  // Los guardados de una misma fila van en cola: si se teclea rápido (plazo 4 → 40), lo último que llega a la base es lo último escrito.
  const colaGuardado = useRef({})
  // Un solo guardado para uno o varios campos de la fila (el plazo cambia el vencimiento, y solo ese).
  const setCampos = async (r, cambios) => {
    const nueva = { ...r, ...cambios }
    // La ficha de Facturas se actualiza al tiro, sin esperar a la base: así dos ediciones seguidas no se pisan.
    // El vencimiento lo manda el libro, incluso cuando se borra.
    sincronizarFicha(nueva, 'vencimiento' in cambios ? ['vencimiento'] : [])
    if (r.origen === 'xlsx') { guardarExtra((extra || []).map(x => x.id === r.id ? nueva : x)); return }
    setRows(rs => rs.map(x => x.id === r.id ? nueva : x))
    const guardado = (colaGuardado.current[r.id] || Promise.resolve()).then(async () => {
      try {
        const { error } = await supabase.from('libro_ventas').update(cambios).eq('id', r.id)
        if (error) throw error
      } catch (e) { setSyncMsg('Error al guardar "' + Object.keys(cambios).join(', ') + '": ' + (e.message || e) + ' — el cambio no quedó guardado, refresca la página.') }
    })
    colaGuardado.current[r.id] = guardado
    await guardado
  }
  const setCampo = (r, campo, valor) => setCampos(r, { [campo]: valor })

  // ---------- Plazo de pago → vencimiento ----------
  // Facturas que se editaron antes solo en Facturas por área tienen el vencimiento en la ficha y no en el libro:
  // se muestra igual aquí, para que ambos módulos cuenten lo mismo.
  const vencDeFicha = useMemo(() => {
    const m = {}
    Object.keys(facturas || {}).forEach(a => (facturas[a] || []).forEach(f => { if (f.libroId && f.vencimiento) m[f.libroId] = f.vencimiento }))
    return m
  }, [facturas])
  const vencDe = r => r.vencimiento || vencDeFicha['LV' + r.id] || ''
  // Se escribe el plazo → el sistema calcula la fecha (desde la emisión, en días corridos).
  // El plazo no se guarda: se deduce de emisión y vencimiento (ver vencimientos.js).
  const cambiarPlazo = (r, texto) => {
    const n = plazoValido(texto)
    if (n === null) { if (String(texto).trim() === '') setCampos(r, { vencimiento: null }); return }
    const fecha = sumarDias(r.emission_date, n)
    if (fecha) setCampos(r, { vencimiento: fecha })   // sin fecha de emisión no hay desde dónde contar: se deja como está
  }
  const cambiarVencimiento = (r, fecha) => setCampos(r, { vencimiento: fecha || null })

  const todas = useMemo(() => {
    const k = r => (r.document_number || '') + '|' + (r.client_rut || '')
    const vistos = new Set((rows || []).map(k))
    return [...(rows || []), ...(extra || []).filter(r => !vistos.has(k(r)))]
  }, [rows, extra])

  // Mantiene Facturas al dia con el libro, SIN pisar lo que se edita en Facturas:
  // solo agrega las ventas nuevas (con area) y saca las que se ocultaron/anularon.
  useEffect(() => {
    if (loading || !todas.length) return
    // Si alguien eliminó a propósito esta venta desde Facturas por área
    // (ocultarFacturasDeLibro en FacturasModule.jsx), no se vuelve a crear
    // aquí — antes esta sincronización la resucitaba sin excepción cada vez
    // que se abría esta pantalla, aunque la persona la hubiera borrado un
    // minuto antes.
    const ocultas = leerFacturasOcultasLibro()
    const base = {}
    Object.keys(facturas || {}).forEach(a => { base[a] = [...(facturas[a] || [])] })
    const validos = new Set()
    todas.forEach(r => {
      if (!vaAFacturas(r)) return
      const libroId = 'LV' + r.id
      if (ocultas.has(libroId)) return
      validos.add(libroId)
      const yaEsta = Object.keys(base).some(a => (base[a] || []).some(f => f.libroId === libroId))
      if (!yaEsta) base[r.area] = [...(base[r.area] || []), fichaDe(r)]
    })
    Object.keys(base).forEach(a => { base[a] = (base[a] || []).filter(f => f.origen !== 'libroVentas' || validos.has(f.libroId)) })
    if (JSON.stringify(facturas || {}) !== JSON.stringify(base)) {
      // Mismo motivo que en sincronizarFicha(): persistir de inmediato
      // (sin bloquear con pullState() dentro de un efecto que corre en
      // cada montaje/cambio de "todas") para no perder este resultado si
      // la persona navega antes del guardado general.
      try { localStorage.setItem('serein_facturas', JSON.stringify(base)) } catch (e) {}
      setFacturas(base)
      pushState()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todas, loading])

  // Cada vez que cambian las notas de crédito (alta, folio asociado, ocultar), la ficha de la factura en Facturas
  // se actualiza sola: solo se toca el campo ncAplicadas, nada de lo que se edite allá.
  useEffect(() => {
    if (loading || !todas.length) return
    const esperado = {}
    todas.forEach(r => { if (vaAFacturas(r) && !esNC(r)) esperado['LV' + r.id] = JSON.stringify(ncAplicadasDe(r)) })
    let cambio = false
    const base = {}
    Object.keys(facturas || {}).forEach(a => {
      base[a] = (facturas[a] || []).map(f => {
        if (f.origen !== 'libroVentas' || !(f.libroId in esperado)) return f
        if (JSON.stringify(f.ncAplicadas || []) === esperado[f.libroId]) return f
        cambio = true
        return { ...f, ncAplicadas: JSON.parse(esperado[f.libroId]) }
      })
    })
    if (!cambio) return
    try { localStorage.setItem('serein_facturas', JSON.stringify(base)) } catch (e) {}
    setFacturas(base)
    pushState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todas, loading, facturas])

  const meses = useMemo(() => [...new Set(todas.map(r => (r.emission_date || '').slice(0, 7)).filter(Boolean))].sort().reverse(), [todas])
  const tipos = useMemo(() => [...new Set(todas.map(r => r.document_type).filter(Boolean))].sort(), [todas])

  const [sel, setSel] = useState(() => new Set())
  const [verOcultas, setVerOcultas] = useState(false)
  // El Folio va aparte, como primera columna fija junto a la casilla (ver FIJA_TD): por eso no está en esta lista.
  const headersLV = ['Emision', 'Cliente', 'Tipo', 'Neto', 'IVA', 'Total', 'Area', 'OT', 'OC', 'Centro de costo', 'NV', 'Plazo (días)', 'Vence', 'Estado pago', 'Medio pago', 'Fecha pago']
  const filtradas = useMemo(() => todas.filter(r => {
    if (verOcultas) { if (!r.oculto) return false } else { if (r.oculto) return false }
    if (mes && (r.emission_date || '').slice(0, 7) !== mes) return false
    if (tipo && r.document_type !== tipo) return false
    if (fArea && (r.area || '') !== fArea) return false
    if (q) { const t = ((r.client_name || '') + ' ' + (r.client_rut || '') + ' ' + (r.document_number || '') + ' ' + (r.ot_id || '')).toLowerCase(); if (!t.includes(q.toLowerCase())) return false }
    return true
  // De más reciente a más antigua: fecha de emisión, y a igual fecha, N° de documento.
  }).sort((a, b) => String(b.emission_date || '').localeCompare(String(a.emission_date || '')) || String(b.document_number || '').localeCompare(String(a.document_number || ''), undefined, { numeric: true })), [todas, mes, tipo, fArea, q, verOcultas])
  const toggleSel = id => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleTodas = () => setSel(s => s.size === filtradas.length ? new Set() : new Set(filtradas.map(r => r.id)))
  const eliminarSel = async () => {
    const elegidas = filtradas.filter(r => sel.has(r.id))
    if (!elegidas.length) return
    if (!window.confirm('Se ocultaran ' + elegidas.length + ' documento(s). Dejaran de verse en la tabla y en los totales, y una nueva sincronizacion no los volvera a mostrar. Puedes recuperarlos con el boton "Ver ocultos". Las filas importadas desde Excel se eliminan definitivamente. Continuar?')) return
    const idsXlsx = elegidas.filter(r => r.origen === 'xlsx').map(r => r.id)
    if (idsXlsx.length) guardarExtra((extra || []).filter(x => !idsXlsx.includes(x.id)))
    const idsDb = elegidas.filter(r => r.origen !== 'xlsx').map(r => r.id)
    if (idsDb.length) {
      setRows(rs => rs.map(x => idsDb.includes(x.id) ? { ...x, oculto: true } : x))
      try { await supabase.from('libro_ventas').update({ oculto: true }).in('id', idsDb) } catch (e) { setErrMsg('Error al ocultar: ' + (e.message || e)) }
    }
    setSel(new Set())
  }
  const restaurarSel = async () => {
    const ids = filtradas.filter(r => sel.has(r.id) && r.origen !== 'xlsx').map(r => r.id)
    if (!ids.length) return
    setRows(rs => rs.map(x => ids.includes(x.id) ? { ...x, oculto: false } : x))
    try { await supabase.from('libro_ventas').update({ oculto: false }).in('id', ids) } catch (e) { setErrMsg('Error al restaurar: ' + (e.message || e)) }
    setSel(new Set())
  }
  const descargarInforme = () => {
    const elegidas = filtradas.filter(r => sel.has(r.id))
    if (!elegidas.length) return
    descargarInformeFacturas(elegidas.map(r => ({
      folio: r.document_number,
      cliente: r.client_name,
      fechaEmision: r.emission_date,
      otOc: r.ot_id,
      ventaNeta: sgn(r) * (Number(r.neto) || 0),
      iva: sgn(r) * (Number(r.iva) || 0),
      total: sgn(r) * (Number(r.total) || 0),
      fechaVencimiento: vencDe(r),
      estado: r.estado_pago,
      banco: r.banco,
      factoringEntidad: r.estado_pago === 'Factoring' ? (facs.find(ff => ff.id === r.factoring_id) || {}).nombre : '',
      factoringPlazo: r.estado_pago === 'Factoring' ? r.dias : null,
    })))
  }

  // Aplica un mismo plazo a todas las filas elegidas: sirve para ponerle fecha de vencimiento de una vez a las
  // que vienen sin ella (las de Defontana). Cada una se calcula desde su propia emisión.
  const [plazoLote, setPlazoLote] = useState(String(PLAZO_POR_DEFECTO))
  const aplicarPlazoSel = async () => {
    const n = plazoValido(plazoLote)
    const elegidas = filtradas.filter(r => sel.has(r.id))
    if (n === null || !elegidas.length) return
    const aplicables = elegidas.filter(r => !esNC(r) && sumarDias(r.emission_date, n))
    const omitidas = elegidas.length - aplicables.length
    if (!aplicables.length) { window.alert('Ninguno de los documentos elegidos admite plazo (son notas de crédito o no tienen fecha de emisión).'); return }
    const reemplazan = aplicables.filter(r => vencDe(r)).length
    if (!window.confirm('Se pondrá un plazo de ' + n + ' días a ' + aplicables.length + ' documento(s): el vencimiento queda como la fecha de emisión + ' + n + ' días.' + (reemplazan ? '\n' + reemplazan + ' de ellos ya tenían vencimiento y será reemplazado.' : '') + (omitidas ? '\n' + omitidas + ' se omiten (notas de crédito o sin fecha de emisión).' : '') + '\n¿Continuar?')) return
    const nuevas = aplicables.map(r => ({ ...r, vencimiento: sumarDias(r.emission_date, n) }))
    const porId = new Map(nuevas.map(r => [r.id, r]))
    const deExcel = nuevas.filter(r => r.origen === 'xlsx')
    const deBase = nuevas.filter(r => r.origen !== 'xlsx')
    if (deExcel.length) guardarExtra((extra || []).map(x => porId.get(x.id) || x))
    if (deBase.length) setRows(rs => rs.map(x => porId.get(x.id) || x))
    sincronizarFichas(nuevas, ['vencimiento'])
    // Un guardado por cada fecha distinta (muchas facturas comparten día de emisión), en tandas de 40
    const porFecha = {}
    deBase.forEach(r => { (porFecha[r.vencimiento] = porFecha[r.vencimiento] || []).push(r.id) })
    let fallos = 0
    for (const [fecha, ids] of Object.entries(porFecha)) {
      for (let i = 0; i < ids.length; i += 40) {
        try { const { error } = await supabase.from('libro_ventas').update({ vencimiento: fecha }).in('id', ids.slice(i, i + 40)); if (error) fallos++ } catch (e) { fallos++ }
      }
    }
    setSyncMsg(fallos ? 'Error al guardar parte de los vencimientos en la base — refresca la página y revisa cuáles quedaron.' : 'Plazo de ' + n + ' días aplicado a ' + nuevas.length + ' documento(s).')
    setSel(new Set())
  }

  const facturaVacia = { emission_date: hoyISO(), document_number: '', client_name: '', client_rut: '', document_type: 'Factura', neto: '', iva: '', area: '', oc: '', nv: '', medio_pago: '', numero_cheque: '', plazo: String(PLAZO_POR_DEFECTO), vencimiento: sumarDias(hoyISO(), PLAZO_POR_DEFECTO) }
  const [mostrarAgregar, setMostrarAgregar] = useState(false)
  const [leyendoIA, setLeyendoIA] = useState(false)
  const [msgIA, setMsgIA] = useState('')
  const archivoIARef = useRef(null)
  const [nuevaFC, setNuevaFC] = useState(facturaVacia)
  const setNuevaFCCampo = (campo, valor) => setNuevaFC(f => {
    // Emisión, plazo y vencimiento se acompañan entre sí (ver vencimientos.js)
    const nf = conFechasCoherentes(f, campo, valor)
    if (campo === 'neto') nf.iva = esExenta(f.document_type) ? 0 : Math.round((Number(valor) || 0) * 0.19)
    if (campo === 'document_type') nf.iva = esExenta(valor) ? 0 : Math.round((Number(f.neto) || 0) * 0.19)
    return nf
  })
  // Lee una factura emitida (PDF o fotos) con IA y precarga el formulario para que la persona
  // revise y guarde; la IA nunca escribe en el libro por su cuenta.
  const leerFacturaIA = async e => {
    const fls = Array.from((e.target.files) || [])
    e.target.value = ''
    if (!fls.length) return
    setLeyendoIA(true); setMsgIA('')
    try {
      const archivos = await Promise.all(fls.map(async fl => ({ base64: await fileToBase64(fl), mimeType: fl.type || 'application/pdf', filename: fl.name })))
      const { data, error } = await supabase.functions.invoke('extraer-factura', { body: { archivos, filename: fls[0].name } })
      if (error) throw error
      if (!data || !data.ok) throw new Error((data && data.error) || 'No se pudo leer la factura.')
      const d = data.datos || {}
      if (/cr[eé]dito/i.test(String(d.tipoDocumento || ''))) {
        const emisionNC = /^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha || '')) ? d.fecha : hoyISO()
        abrirNC({ folioNC: d.folio != null ? String(d.folio) : '', folioFactura: d.folioReferencia != null ? String(d.folioReferencia) : '', emission_date: emisionNC, modo: d.neto != null ? 'parcial' : 'completa', neto: d.neto != null ? String(Math.round(d.neto)) : '' })
        setMsgIA(d.folioReferencia ? 'Nota de crédito leída: confirma la factura que corrige y el monto.' : 'Nota de crédito leída: indica el folio de la factura que corrige.')
        setLeyendoIA(false)
        return
      }
      const exenta = /exent/i.test(String(d.tipoDocumento || '')) || (d.iva === 0 && d.total != null && d.neto != null && Math.round(d.total) === Math.round(d.neto))
      const emision = /^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha || '')) ? d.fecha : hoyISO()
      const neto = d.neto != null ? Math.round(d.neto) : ''
      const base = { ...facturaVacia, emission_date: emision, vencimiento: sumarDias(emision, PLAZO_POR_DEFECTO) }
      setNuevaFC({
        ...base,
        document_number: d.folio != null ? String(d.folio) : '',
        client_name: d.cliente || '',
        client_rut: d.rutCliente || '',
        document_type: d.tipoDocumento || (exenta ? 'Factura exenta' : 'Factura'),
        neto: neto === '' ? '' : String(neto),
        iva: exenta ? 0 : Math.round((Number(neto) || 0) * 0.19),
        oc: d.ordenCompra || '',
        nv: d.notaVenta || '',
      })
      setMostrarAgregar(true)
      setMsgIA('Factura leída: revisa los datos, elige el área y guarda.')
    } catch (err) { setMsgIA('Error: No se pudo leer la factura: ' + ((err && err.message) || String(err))) }
    setLeyendoIA(false)
  }
  const agregarFactura = async () => {
    const neto = Number(nuevaFC.neto) || 0
    if (!nuevaFC.client_name.trim() || neto <= 0) { window.alert('Ingresa al menos el cliente y un neto mayor a 0.'); return }
    const iva = esExenta(nuevaFC.document_type) ? 0 : Math.round(neto * 0.19)
    const reg = {
      emission_date: nuevaFC.emission_date || hoyISO(),
      vencimiento: nuevaFC.vencimiento || null,
      document_number: nuevaFC.document_number.trim(),
      client_name: nuevaFC.client_name.trim(),
      client_rut: nuevaFC.client_rut.trim(),
      document_type: nuevaFC.document_type || 'Factura',
      neto, iva, total: neto + iva, area: nuevaFC.area || null, estado_pago: 'Pendiente', oculto: false,
      oc: nuevaFC.oc.trim(), nv: nuevaFC.nv.trim(), medio_pago: nuevaFC.medio_pago || null,
      numero_cheque: nuevaFC.medio_pago === 'Cheque' ? nuevaFC.numero_cheque.trim() : null,
    }
    try {
      const { data, error } = await supabase.from('libro_ventas').insert(reg).select().single()
      if (error) throw error
      setRows(rs => [data, ...rs])
      setNuevaFC(facturaVacia); setMostrarAgregar(false)
    } catch (e) { window.alert('No se pudo guardar la factura: ' + (e.message || e)) }
  }

  // ---------- Nota de crédito: se escribe el folio de la factura y el sistema completa el resto ----------
  const ncVacia = { folioNC: '', folioFactura: '', clienteRut: '', emission_date: hoyISO(), modo: 'completa', neto: '' }
  const [mostrarNC, setMostrarNC] = useState(false)
  const [nc, setNC] = useState(ncVacia)
  const candidatasNC = nc.folioFactura.trim() ? todas.filter(x => !esNC(x) && !x.oculto && String(x.document_number || '').trim() === nc.folioFactura.trim()) : []
  const facturaNC = candidatasNC.length === 1 ? candidatasNC[0] : (candidatasNC.find(x => (x.client_rut || '') === nc.clienteRut) || null)
  const previasNC = facturaNC ? ncsDe(facturaNC) : []
  const sum = (arr, k) => arr.reduce((a, x) => a + (Math.round(Number(x[k]) || 0)), 0)
  const saldoNetoNC = facturaNC ? Math.max(0, Math.round(Number(facturaNC.neto) || 0) - sum(previasNC, 'neto')) : 0
  const saldoIvaNC = facturaNC ? Math.max(0, Math.round(Number(facturaNC.iva) || 0) - sum(previasNC, 'iva')) : 0
  const netoNC = !facturaNC ? 0 : (nc.modo === 'completa' ? saldoNetoNC : Math.round(Number(nc.neto) || 0))
  const exentaNC = !!facturaNC && Math.round(Number(facturaNC.iva) || 0) === 0
  const ivaNC = !facturaNC ? 0 : exentaNC ? 0 : (netoNC === saldoNetoNC ? saldoIvaNC : Math.round(netoNC * 0.19))
  const folioNCRepetido = !!nc.folioNC.trim() && !!facturaNC && todas.some(x => esNC(x) && String(x.document_number || '').trim() === nc.folioNC.trim() && (x.client_rut || '') === (facturaNC.client_rut || ''))
  const errorNC = !facturaNC ? '' : netoNC <= 0 ? 'Indica el monto neto a rebajar.' : netoNC > saldoNetoNC ? 'El monto supera lo que queda por rebajar de esta factura (' + clp(saldoNetoNC) + ' neto).' : folioNCRepetido ? 'Ya existe una nota de crédito con ese folio para este cliente.' : ''
  const abrirNC = (extra) => { setNC({ ...ncVacia, ...(extra || {}) }); setMostrarNC(true); setMostrarAgregar(false) }
  const guardarNC = async () => {
    if (!facturaNC || errorNC || !nc.folioNC.trim()) return
    const f = facturaNC
    const reg = {
      emission_date: nc.emission_date || hoyISO(), vencimiento: null, document_number: nc.folioNC.trim(),
      client_name: f.client_name || '', client_rut: f.client_rut || '', document_type: '61',
      neto: netoNC, iva: ivaNC, total: netoNC + ivaNC, area: f.area || null, estado_pago: 'Pendiente', oculto: false,
      oc: f.oc || '', nv: f.nv || '', anula_folio: String(f.document_number || '').trim(),
      ...(f.ot_id ? { ot_id: f.ot_id } : {}), ...(f.cc_ot ? { cc_ot: f.cc_ot } : {}),
    }
    try {
      const { data, error } = await supabase.from('libro_ventas').insert(reg).select().single()
      if (error) throw error
      setRows(rs => [data, ...rs])
      setMostrarNC(false); setNC(ncVacia)
      setMsgIA('Nota de crédito ' + reg.document_number + ' registrada: rebaja ' + clp(netoNC) + ' neto de la factura ' + reg.anula_folio + '.')
    } catch (e) { window.alert('No se pudo guardar la nota de crédito: ' + (e.message || e)) }
  }

  const perdidaDe = r => {
    if (r.estado_pago !== 'Factoring') return null
    const f = facs.find(x => x.id === r.factoring_id) || facs[0]
    if (!f) return null
    return calcularPerdidaFactoring(Math.round(Number(r.total) || 0), r.dias || 30, r.dias_mora || 0, f)
  }

  const tot = useMemo(() => filtradas.reduce((a, r) => { const p = perdidaDe(r); const s = sgn(r); return { neto: a.neto + s * (+r.neto || 0), iva: a.iva + s * (+r.iva || 0), total: a.total + s * (+r.total || 0), fact: a.fact + (p ? p.total : 0) } }, { neto: 0, iva: 0, total: 0, fact: 0 }), [filtradas, facs])
  const mesLabel = ym => { const [y, m] = ym.split('-'); return MESES[(+m) - 1] + ' ' + y }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 20, textTransform: 'uppercase', color: C.navy }}>Libro de Ventas</div>
          <div style={{ fontSize: 12, color: C.mut }}>Facturas de venta emitidas - desde Defontana o importadas desde Excel</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls,.csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) importarExcel(f); e.target.value = '' }} />
          <input ref={archivoIARef} type="file" accept=".pdf,image/*" multiple style={{ display: 'none' }} onChange={leerFacturaIA} />
          <button onClick={() => archivoIARef.current && archivoIARef.current.click()} disabled={leyendoIA} style={{ background: C.orange, color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: leyendoIA ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13 }}>{leyendoIA ? 'Leyendo factura...' : 'Leer factura con IA'}</button>
          <button onClick={() => { if (mostrarNC) setMostrarNC(false); else abrirNC() }} style={{ background: '#fff', color: C.red, border: '1px solid ' + C.red, padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{mostrarNC ? 'Cancelar nota' : '+ Nota de crédito'}</button>
          <button onClick={() => { setMostrarNC(false); setMostrarAgregar(v => !v) }} style={{ background: '#fff', color: C.navy, border: '1px solid ' + C.navy, padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{mostrarAgregar ? 'Cancelar' : '+ Agregar factura'}</button>
          <button onClick={() => fileRef.current && fileRef.current.click()} style={{ background: C.orange, color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Importar Excel</button>
          <button onClick={sincronizar} disabled={syncing} style={{ background: C.navy, color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, cursor: syncing ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13 }}>{syncing ? 'Sincronizando...' : 'Sincronizar con Defontana'}</button>
        </div>
      </div>

      {mostrarAgregar && (
        <div style={{ border: '1px solid ' + C.border, borderRadius: 8, padding: 14, marginBottom: 14, background: C.gray, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <label style={{ fontSize: 11, color: C.mut }}>Fecha emisión<input type="date" value={nuevaFC.emission_date} onChange={e => setNuevaFCCampo('emission_date', e.target.value)} style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>Plazo de pago (días)<input type="number" min="0" max={PLAZO_MAX} list="plazos-dias" value={nuevaFC.plazo} onChange={e => setNuevaFCCampo('plazo', e.target.value)} placeholder="30" style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>Vencimiento<input type="date" value={nuevaFC.vencimiento || ''} onChange={e => setNuevaFCCampo('vencimiento', e.target.value)} style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>Cliente<input value={nuevaFC.client_name} onChange={e => setNuevaFCCampo('client_name', e.target.value)} placeholder="Razón social" style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>RUT cliente<input value={nuevaFC.client_rut} onChange={e => setNuevaFCCampo('client_rut', e.target.value)} placeholder="12.345.678-9" style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>N° folio<input value={nuevaFC.document_number} onChange={e => setNuevaFCCampo('document_number', e.target.value)} style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>Tipo documento<input value={nuevaFC.document_type} onChange={e => setNuevaFCCampo('document_type', e.target.value)} style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>Área<select value={nuevaFC.area} onChange={e => setNuevaFCCampo('area', e.target.value)} style={ip}><option value="">- área -</option>{AREAS.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
          <label style={{ fontSize: 11, color: C.mut }}>Orden de compra<input value={nuevaFC.oc} onChange={e => setNuevaFCCampo('oc', e.target.value)} style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>NV<input value={nuevaFC.nv} onChange={e => setNuevaFCCampo('nv', e.target.value)} style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>Medio de pago<select value={nuevaFC.medio_pago} onChange={e => setNuevaFCCampo('medio_pago', e.target.value)} style={ip}>{MEDIOS_PAGO.map(m => <option key={m} value={m}>{m || '- medio de pago -'}</option>)}</select></label>
          {nuevaFC.medio_pago === 'Cheque' && <label style={{ fontSize: 11, color: C.mut }}>N° cheque<input value={nuevaFC.numero_cheque} onChange={e => setNuevaFCCampo('numero_cheque', e.target.value)} style={ip} /></label>}
          <label style={{ fontSize: 11, color: C.mut }}>Neto<input type="number" value={nuevaFC.neto} onChange={e => setNuevaFCCampo('neto', e.target.value)} placeholder="0" style={ip} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>IVA (19%)<input value={clp(nuevaFC.iva)} disabled style={{ ...ip, background: '#eee' }} /></label>
          <label style={{ fontSize: 11, color: C.mut }}>Total<input value={clp((Number(nuevaFC.neto) || 0) + (Number(nuevaFC.iva) || 0))} disabled style={{ ...ip, background: '#eee', fontWeight: 700 }} /></label>
          <button onClick={agregarFactura} style={{ padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: 'none', background: C.navy, color: '#fff' }}>Guardar factura</button>
        </div>
      )}

      {msgIA ? <div style={{ background: msgIA.startsWith('Error') ? '#FCEBEA' : '#E6F7EE', border: '1px solid ' + (msgIA.startsWith('Error') ? C.red : C.green), color: msgIA.startsWith('Error') ? C.red : '#1B9E5D', padding: '8px 12px', borderRadius: 6, fontSize: 12.5, marginBottom: 12 }}>{msgIA}</div> : null}

      {mostrarNC && (
        <div style={{ border: '1px solid ' + C.red, borderRadius: 8, padding: 14, marginBottom: 14, background: '#FFF8F7' }}>
          <div style={{ fontWeight: 700, color: C.red, marginBottom: 10 }}>Nueva nota de crédito</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, alignItems: 'end' }}>
            <label style={{ fontSize: 11, color: C.mut }}>Folio de la factura que corrige
              <input list="facturas-nc" autoFocus value={nc.folioFactura} onChange={e => setNC(v => ({ ...v, folioFactura: e.target.value, clienteRut: '' }))} placeholder="ej. 1700" style={{ ...ip, width: '100%' }} />
              <datalist id="facturas-nc">{todas.filter(x => !esNC(x) && !x.oculto).map(x => <option key={x.id} value={String(x.document_number || '')}>{(x.client_name || '') + ' - ' + clp(x.total)}</option>)}</datalist>
            </label>
            <label style={{ fontSize: 11, color: C.mut }}>N° de la nota de crédito<input value={nc.folioNC} onChange={e => setNC(v => ({ ...v, folioNC: e.target.value }))} style={{ ...ip, width: '100%' }} /></label>
            <label style={{ fontSize: 11, color: C.mut }}>Fecha de emisión<input type="date" value={nc.emission_date} onChange={e => setNC(v => ({ ...v, emission_date: e.target.value }))} style={{ ...ip, width: '100%' }} /></label>
            {candidatasNC.length > 1 && <label style={{ fontSize: 11, color: C.mut }}>Hay más de una factura con ese folio: elige el cliente
              <select value={nc.clienteRut} onChange={e => setNC(v => ({ ...v, clienteRut: e.target.value }))} style={{ ...ip, width: '100%' }}><option value="">- cliente -</option>{candidatasNC.map(x => <option key={x.id} value={x.client_rut || ''}>{(x.client_name || x.client_rut) + ' - ' + clp(x.total)}</option>)}</select>
            </label>}
          </div>
          {nc.folioFactura.trim() && candidatasNC.length === 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: C.red }}>No encontré una factura con el folio {nc.folioFactura.trim()} en el libro.</div>}
          {facturaNC && (
            <div style={{ marginTop: 12 }}>
              <div style={{ background: '#fff', border: '1px solid ' + C.border, borderRadius: 8, padding: '10px 12px', fontSize: 12.5, display: 'flex', flexWrap: 'wrap', gap: '4px 22px' }}>
                <span><b>Factura {facturaNC.document_number}</b> · {fmtF(facturaNC.emission_date)}</span>
                <span>{facturaNC.client_name} <span style={{ color: C.mut }}>{facturaNC.client_rut}</span></span>
                <span>Neto {clp(facturaNC.neto)} · Total {clp(facturaNC.total)}</span>
                {facturaNC.area && <span>Área: {facturaNC.area}</span>}
                {facturaNC.ot_id && <span>OT: {facturaNC.ot_id}</span>}
                {facturaNC.oc && <span>OC: {facturaNC.oc}</span>}
                {previasNC.length > 0 && <span style={{ color: C.red }}>NC previas: −{clp(sum(previasNC, 'neto'))} neto ({previasNC.map(n => n.document_number).join(', ')})</span>}
                <span style={{ fontWeight: 700 }}>Queda por rebajar: {clp(saldoNetoNC)} neto</span>
              </div>
              {saldoNetoNC <= 0 ? <div style={{ marginTop: 10, fontSize: 12.5, color: C.red }}>Esta factura ya está rebajada por completo con notas de crédito.</div> : (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
                  <label style={{ fontSize: 13, cursor: 'pointer' }}><input type="radio" checked={nc.modo === 'completa'} onChange={() => setNC(v => ({ ...v, modo: 'completa' }))} /> Completa (anula {clp(saldoNetoNC)} neto)</label>
                  <label style={{ fontSize: 13, cursor: 'pointer' }}><input type="radio" checked={nc.modo === 'parcial'} onChange={() => setNC(v => ({ ...v, modo: 'parcial' }))} /> Parcial</label>
                  {nc.modo === 'parcial' && <label style={{ fontSize: 11, color: C.mut }}>Neto a rebajar<input type="number" value={nc.neto} onChange={e => setNC(v => ({ ...v, neto: e.target.value }))} style={{ ...ip, width: 150, marginLeft: 6 }} /></label>}
                  <span style={{ fontSize: 13 }}>Neto <b style={{ color: C.red }}>−{clp(netoNC)}</b> · IVA <b style={{ color: C.red }}>−{clp(ivaNC)}</b> · Total <b style={{ color: C.red }}>−{clp(netoNC + ivaNC)}</b></span>
                </div>
              )}
              {errorNC && saldoNetoNC > 0 && <div style={{ marginTop: 8, fontSize: 12.5, color: C.red }}>{errorNC}</div>}
              {saldoNetoNC > 0 && !nc.folioNC.trim() && <div style={{ marginTop: 8, fontSize: 12.5, color: C.mut }}>Falta el N° de la nota de crédito.</div>}
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button onClick={guardarNC} disabled={!!errorNC || !nc.folioNC.trim() || saldoNetoNC <= 0} style={{ padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', background: (errorNC || !nc.folioNC.trim() || saldoNetoNC <= 0) ? '#CBD2D8' : C.red, color: '#fff', cursor: (errorNC || !nc.folioNC.trim() || saldoNetoNC <= 0) ? 'default' : 'pointer' }}>Confirmar nota de crédito</button>
              </div>
            </div>
          )}
        </div>
      )}

      {syncMsg ? <div style={{ background: syncMsg.startsWith('Error') ? '#FCEBEA' : '#E6F7EE', border: '1px solid ' + (syncMsg.startsWith('Error') ? C.red : C.green), color: syncMsg.startsWith('Error') ? C.red : '#1B9E5D', padding: '8px 12px', borderRadius: 6, fontSize: 12.5, marginBottom: 12 }}>{syncMsg}</div> : null}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {[['Documentos', filtradas.length, C.navy], ['Neto', clp(tot.neto), C.navy], ['IVA', clp(tot.iva), C.orange], ['Total', clp(tot.total), C.navy], ['Perdida factoring', clp(tot.fact), C.red]].map(([k, v, col], i) => (
          <div key={i} style={{ flex: '1 1 130px', border: '1px solid ' + C.border, borderRadius: 6, padding: '10px 12px', background: C.gray }}>
            <div style={{ fontSize: 11, color: C.mut, textTransform: 'uppercase', fontWeight: 700 }}>{k}</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: col }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input style={{ ...ip, flex: '2 1 220px' }} placeholder="Buscar cliente, RUT, folio u OT..." value={q} onChange={e => setQ(e.target.value)} />
        <select style={{ ...ip, flex: '1 1 120px' }} value={mes} onChange={e => setMes(e.target.value)}><option value="">Todos los meses</option>{meses.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}</select>
        <select style={{ ...ip, flex: '1 1 120px' }} value={fArea} onChange={e => setFArea(e.target.value)}><option value="">Todas las areas</option>{AREAS.map(a => <option key={a} value={a}>{a}</option>)}</select>
        <select style={{ ...ip, flex: '1 1 120px' }} value={tipo} onChange={e => setTipo(e.target.value)}><option value="">Todos los tipos</option>{tipos.map(t => <option key={t} value={t}>{t}</option>)}</select>
      </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontSize: 12.5, color: C.mut }}>{sel.size} seleccionado(s)</span>
          <button onClick={descargarInforme} disabled={!sel.size} style={{ border: 'none', padding: '7px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12.5, background: sel.size ? C.navy : '#DFE4EA', color: sel.size ? '#fff' : C.mut, cursor: sel.size ? 'pointer' : 'default' }}>Descargar informe PDF</button>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid ' + C.border, borderRadius: 6, padding: '3px 3px 3px 10px', background: '#fff' }}>
            <span style={{ fontSize: 12.5, color: C.mut }}>Plazo de pago</span>
            <input type="number" min="0" max={PLAZO_MAX} list="plazos-dias" value={plazoLote} onChange={e => setPlazoLote(e.target.value)} title="Días desde la emisión" aria-label="Plazo de pago en días para los seleccionados" style={{ ...ip, width: 66, padding: '4px 6px' }} />
            <span style={{ fontSize: 12.5, color: C.mut }}>días</span>
            <button onClick={aplicarPlazoSel} disabled={!sel.size || plazoValido(plazoLote) === null} style={{ border: 'none', padding: '5px 10px', borderRadius: 4, fontWeight: 700, fontSize: 12.5, background: sel.size && plazoValido(plazoLote) !== null ? C.orange : '#DFE4EA', color: sel.size && plazoValido(plazoLote) !== null ? '#fff' : C.mut, cursor: sel.size && plazoValido(plazoLote) !== null ? 'pointer' : 'default' }}>Aplicar a seleccionados</button>
          </span>
          {!verOcultas && <button onClick={eliminarSel} disabled={!sel.size} style={{ ...{ border: 'none', padding: '7px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12.5 }, background: sel.size ? C.red : '#DFE4EA', color: sel.size ? '#fff' : C.mut, cursor: sel.size ? 'pointer' : 'default' }}>Eliminar seleccionados</button>}
          {verOcultas && <button onClick={restaurarSel} disabled={!sel.size} style={{ ...{ border: 'none', padding: '7px 12px', borderRadius: 6, fontWeight: 700, fontSize: 12.5 }, background: sel.size ? C.green : '#DFE4EA', color: sel.size ? '#fff' : C.mut, cursor: sel.size ? 'pointer' : 'default' }}>Restaurar seleccionados</button>}
          <button onClick={() => { setVerOcultas(v => !v); setSel(new Set()) }} style={{ background: 'transparent', border: '1px solid ' + C.border, padding: '7px 12px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer', color: C.navy }}>{verOcultas ? 'Volver al libro' : 'Ver ocultos'}</button>
        </div>

      {loading ? <div style={{ color: C.mut, padding: 20 }}>Cargando...</div> : errMsg ? <div style={{ background: '#FCEBEA', border: '1px solid ' + C.red, color: C.red, padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>{errMsg}</div> : filtradas.length === 0 ? (
        <div style={{ color: C.mut, padding: 20, textAlign: 'center', border: '1px dashed ' + C.border, borderRadius: 8 }}>Sin documentos. Usa <b>Importar Excel</b> o <b>Sincronizar con Defontana</b>.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid ' + C.border, borderRadius: 8, background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1700 }}>
            <thead>
              <tr style={{ background: C.navy, color: '#fff' }}>
                <th style={{ ...FIJA_TH, textAlign: 'left', padding: '9px 10px', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={filtradas.length > 0 && sel.size === filtradas.length} onChange={toggleTodas} aria-label="Seleccionar todos" />Folio</span>
                </th>
                {headersLV.map(h => (
                  <th key={h} style={{ textAlign: ['Neto', 'IVA', 'Total'].includes(h) ? 'right' : 'left', padding: '9px 10px', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(r => {
                const perd = perdidaDe(r)
                const venc = vencDe(r)
                const plazoFila = plazoDe(r.emission_date, venc)
                // Solo las facturas aún sin pagar muestran cuánto falta o cuánto llevan de atraso
                const dias = !esNC(r) && ['Pendiente', 'Vencida'].includes(r.estado_pago || 'Pendiente') ? diasParaVencer(venc) : null
                const atrasada = dias !== null && dias < 0
                return (
                <React.Fragment key={r.id}>
                <tr style={{ borderBottom: perd ? 'none' : '1px solid #E2E7EC' }}>
                  <td style={{ ...FIJA_TD, padding: '7px 10px', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} aria-label={'Seleccionar folio ' + (r.document_number || '')} /><b>{r.document_number || '-'}</b>{!esNC(r) && r.document_number ? <button title="Crear una nota de crédito de esta factura" onClick={() => { abrirNC({ folioFactura: String(r.document_number), clienteRut: r.client_rut || '' }); const m = document.querySelector('main'); if (m && m.scrollTo) m.scrollTo({ top: 0, behavior: 'smooth' }) }} style={{ border: '1px solid ' + C.red, color: C.red, background: '#fff', borderRadius: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', cursor: 'pointer', lineHeight: 1.4 }}>NC</button> : null}</span>
                  </td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{fmtF(r.emission_date)}</td>
                  <td style={{ padding: '7px 10px' }}><div style={{ fontWeight: 600 }}>{r.client_name || r.client_rut || '-'}</div><div style={{ color: C.mut, fontSize: 11 }}>{r.client_rut}{r.origen === 'xlsx' ? ' - Excel' : ''}</div></td>
                  <td style={{ padding: '7px 10px', fontSize: 11.5 }}>{r.document_type}{esNC(r) ? <span style={{ marginLeft: 5, background: C.red, color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 700 }}>NC</span> : null}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: esNC(r) ? C.red : undefined }}>{clp(sgn(r) * (+r.neto || 0))}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: esNC(r) ? C.red : C.orange }}>{clp(sgn(r) * (+r.iva || 0))}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: esNC(r) ? C.red : undefined }}>{clp(sgn(r) * (+r.total || 0))}{(() => { const ns = esNC(r) ? [] : ncsDe(r); return ns.length ? <div style={{ fontSize: 10.5, fontWeight: 500, color: C.red }}>NC −{clp(sum(ns, 'total'))} · saldo {clp((+r.total || 0) - sum(ns, 'total'))}</div> : null })()}</td>
                  <td style={{ padding: '7px 10px' }}>
                    <select style={{ ...sel, minWidth: 110 }} value={r.area || ''} onChange={e => setCampo(r, 'area', e.target.value)}>
                      <option value="">- area -</option>
                      {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <select style={{ ...sel, minWidth: 140 }} value={r.ot_id || ''} onChange={e => { const v = e.target.value; setCampo(r, 'ot_id', v) }}>
                      <option value="">- sin OT -</option>
                      {otsActivas.map(o => <option key={o.etq} value={o.n}>{o.etq}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '7px 10px' }}><input style={{ ...sel, minWidth: 110 }} value={r.oc || ''} onChange={e => setCampo(r, 'oc', e.target.value)} placeholder="Orden de compra" /></td>
                  <td style={{ padding: '7px 10px' }}>
                    <select style={{ ...sel, minWidth: 150 }} value={r.cc_ot || ''} disabled={ccsDeOT(r.ot_id).length === 0} onChange={e => setCampo(r, 'cc_ot', e.target.value)}>
                      <option value="">{ccsDeOT(r.ot_id).length ? '- centro de costo -' : '-'}</option>
                      {ccsDeOT(r.ot_id).map(c => <option key={c.id} value={c.id}>{c.id} - {c.nombre}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '7px 10px' }}><input style={{ ...sel, minWidth: 90 }} value={r.nv || ''} onChange={e => setCampo(r, 'nv', e.target.value)} placeholder="NV" /></td>
                  <td style={{ padding: '7px 10px' }}>
                    {esNC(r) ? <span style={{ color: C.mut }}>-</span> : (
                      <input type="number" min="0" max={PLAZO_MAX} list="plazos-dias" style={{ width: 64 }} value={plazoFila === null ? '' : plazoFila} onChange={e => cambiarPlazo(r, e.target.value)} placeholder="días" aria-label={'Plazo de pago en días del folio ' + (r.document_number || '')} title="Días de plazo desde la emisión: el vencimiento se calcula solo" />
                    )}
                  </td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                    {esNC(r) ? <span style={{ color: C.mut }}>-</span> : (
                      <div>
                        <input type="date" style={atrasada ? { color: C.red, fontWeight: 600 } : undefined} value={venc} onChange={e => cambiarVencimiento(r, e.target.value)} aria-label={'Vencimiento del folio ' + (r.document_number || '')} title="Se calcula con el plazo; también puedes elegir la fecha directamente" />
                        {dias !== null && <div style={{ fontSize: 10.5, marginTop: 2, color: atrasada ? C.red : C.mut, fontWeight: atrasada ? 600 : 400 }}>{textoDiasParaVencer(dias)}</div>}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <select style={{ ...sel, minWidth: 110, color: colorPago(r.estado_pago), fontWeight: 600 }} value={r.estado_pago || 'Pendiente'} onChange={e => setCampo(r, 'estado_pago', e.target.value)}>
                      {ESTADOS_PAGO.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <select style={{ ...sel, minWidth: 110 }} value={r.medio_pago || ''} onChange={e => setCampo(r, 'medio_pago', e.target.value)}>
                        {MEDIOS_PAGO.map(m => <option key={m} value={m}>{m || '- medio de pago -'}</option>)}
                      </select>
                      {r.medio_pago === 'Cheque' && <input style={{ ...sel, minWidth: 100 }} placeholder="N° cheque" value={r.numero_cheque || ''} onChange={e => setCampo(r, 'numero_cheque', e.target.value)} />}
                    </div>
                  </td>
                  <td style={{ padding: '7px 10px' }}><input type="date" style={{ ...sel }} value={r.fecha_pago || ''} onChange={e => setCampo(r, 'fecha_pago', e.target.value || null)} /></td>
                </tr>
                {esNC(r) && (
                  <tr style={{ background: '#FCEBEA', borderBottom: '1px solid #E2E7EC' }}>
                    <td colSpan={headersLV.length + 1} style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
                        <b style={{ color: C.red }}>Nota de credito</b>
                        <span style={{ color: C.mut }}>Anula / rebaja la factura N°</span>
                        <input list={'facturas-' + r.id} value={r.anula_folio || ''} onChange={e => setCampo(r, 'anula_folio', e.target.value)} placeholder="Folio de la factura" style={{ ...ip, width: 160 }} />
                        <datalist id={'facturas-' + r.id}>
                          {todas.filter(x => !esNC(x) && x.client_rut === r.client_rut).map(x => <option key={x.id} value={String(x.document_number || '')}>{x.document_number} - {clp(x.total)}</option>)}
                        </datalist>
                        {(() => { const fo = r.anula_folio ? todas.find(x => mismaFactura(r, x)) : null; return r.anula_folio ? <span style={{ color: C.mut }}>{fo ? 'Corrige la factura ' + r.anula_folio + ' de ' + (fo.client_name || fo.client_rut) + ' (' + clp(fo.total) + ')' + (Math.round(Number(r.neto) || 0) >= Math.round(Number(fo.neto) || 0) ? ' · completa' : ' · parcial') : 'Anula la factura ' + r.anula_folio + ' (no está en el libro)'}</span> : <span style={{ color: C.mut }}>Sin factura asociada: elige el folio para que descuente</span> })()}
                      </div>
                    </td>
                  </tr>
                )}
                {perd ? (
                  <tr style={{ background: '#FDECDD', borderBottom: '1px solid #E2E7EC' }}>
                    <td colSpan={headersLV.length + 1} style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                        <span style={{ color: C.mut, fontWeight: 700 }}>FACTORING:</span>
                        <select style={sel} value={r.factoring_id || (facs[0] ? facs[0].id : '')} onChange={e => setCampo(r, 'factoring_id', e.target.value)}>
                          {facs.length === 0 && <option value="">(define en Parametros)</option>}
                          {facs.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                        </select>
                        <select style={sel} value={r.dias || 30} onChange={e => setCampo(r, 'dias', parseInt(e.target.value, 10))}>
                          {DIAS_OPC.map(d => <option key={d} value={d}>{d} dias</option>)}
                        </select>
                        <input placeholder="Dias mora" style={{ ...sel, width: 90 }} value={r.dias_mora || ''} onChange={e => setCampo(r, 'dias_mora', parseInt(String(e.target.value).replace(/\D/g, ''), 10) || 0)} />
                        <span style={{ color: C.red, fontWeight: 700 }}>Descuento factoring: {clp(perd.total)}</span>
                        <span style={{ color: C.mut }}>(interes {clp(perd.interes)} + costo op {clp(perd.costoOp)}{perd.mora ? ' + mora ' + clp(perd.mora) : ''}) - Recibes: <b style={{ color: C.navy }}>{clp((Number(r.total) || 0) - perd.total)}</b></span>
                      </div>
                    </td>
                  </tr>
                ) : null}
                </React.Fragment>
              ) })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: C.mut, marginTop: 8 }}>
        Al asignar <b>area</b> y <b>OT</b>, la venta se carga automaticamente en la ficha de esa OT y en el consolidado. Todo queda guardado en la nube.
      </div>
      <div style={{ fontSize: 11.5, color: C.mut, marginTop: 4 }}>
        <b>Plazo de pago:</b> escribe los días (30, 40, 60…) y el vencimiento se calcula solo desde la fecha de emisión; también se refleja en Facturas por área, cobranza atrasada y consolidado.
      </div>
      <datalist id="plazos-dias">{PLAZOS_SUGERIDOS.map(d => <option key={d} value={d}>{d === 0 ? 'Contado' : d + ' días'}</option>)}</datalist>
    </div>
  )
}
