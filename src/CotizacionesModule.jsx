import React, { useState } from 'react'
import { Plus, Trash2, FileText, Download, CheckCircle2, Search, X } from 'lucide-react'

// ============================================================
// MÓDULO: Cotizaciones (formato PDF descargable) + generación de OT
// - Crear cotización, guardarla en un listado, descargar PDF.
// - Aprobar → genera una OT con el mismo número, en el mismo
//   formato pero SIN valores (para los supervisores).
// ============================================================

const C = { azul: '#1D1D1B', teal: '#A8501F', ambar: '#D2642F', rojo: '#B5432E', verde: '#3D7A4E', carbon: '#161616', gris: '#7A8288' }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const inp = { padding: '7px 9px', border: '1px solid #CBD2D6', fontSize: 13, boxSizing: 'border-box' }
const AREAS = ['Santa Rosa', 'Istria', 'Proyectos']

// Datos de la empresa (encabezado del documento)
export const EMPRESA = {
  nombre: 'SERVICIOS REVESTIMIENTOS INDUSTRIALES SPA',
  rut: '76.860.656-0',
  giro: 'Revestimientos Industriales y habitacionales',
  direccion: 'Santa Rosa 70, RENCA',
  telefono: '56999369503',
  email: 'administracion@sereinspa.com',
}

const itemTotal = it => Math.max(0, Math.round((num(it.cant) * num(it.pUnitario)) - num(it.descuento)))
function totales(cot) {
  const afecto = (cot.items || []).reduce((a, it) => a + itemTotal(it), 0)
  const iva = Math.round(afecto * 0.19)
  return { afecto, iva, total: afecto + iva }
}

// ---- Número a palabras (CLP, entero) ----
function enPalabras(n) {
  n = Math.round(n || 0)
  if (n === 0) return 'CERO PESOS'
  const U = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE']
  const D = ['', '', 'VEINTI', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
  const Cn = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']
  function dos(x) {
    if (x <= 20) return U[x]
    if (x < 30) return 'VEINTI' + U[x - 20]
    const d = Math.floor(x / 10), u = x % 10
    return D[d] + (u ? ' Y ' + U[u] : '')
  }
  function tres(x) {
    if (x === 100) return 'CIEN'
    const c = Math.floor(x / 100), r = x % 100
    return (c ? Cn[c] + (r ? ' ' : '') : '') + (r ? dos(r) : '')
  }
  function seg(x, sing, plur) {
    if (x === 0) return ''
    if (x === 1) return sing
    return tres(x) + ' ' + plur
  }
  const millones = Math.floor(n / 1000000)
  const miles = Math.floor((n % 1000000) / 1000)
  const resto = n % 1000
  let out = ''
  if (millones) out += seg(millones, 'UN MILLÓN', 'MILLONES') + ' '
  if (miles) out += (miles === 1 ? 'MIL' : tres(miles) + ' MIL') + ' '
  if (resto) out += tres(resto)
  return (out.trim() || 'CERO') + ' PESOS'
}

// ---- Generar el HTML del documento e imprimir (Guardar como PDF) ----
function estilosDoc() {
  return `body{font-family:Arial,Helvetica,sans-serif;color:#161616;font-size:12px;margin:24px}
  .head{display:flex;justify-content:space-between;border-bottom:2px solid #161616;padding-bottom:8px}
  .emp b{font-size:13px}.emp div{color:#333;line-height:1.4}
  .doc{text-align:right}.doc .t{font-size:20px;font-weight:bold;color:#A8501F}.doc .f{font-size:14px;font-weight:bold}
  table{width:100%;border-collapse:collapse;margin-top:10px}
  .cli td{padding:3px 6px;font-size:11px;vertical-align:top}
  .cli .lbl{color:#7A8288;text-transform:uppercase;font-size:9px}
  .items th{background:#161616;color:#fff;padding:6px;font-size:10px;text-align:left}
  .items td{border-bottom:1px solid #ddd;padding:6px;font-size:11px;vertical-align:top}
  .items .r{text-align:right}
  .tot{width:auto;margin-left:auto;margin-top:10px}
  .tot td{padding:4px 10px;font-size:12px}.tot .lbl{color:#7A8288;text-align:right}.tot .big{font-weight:bold;font-size:14px}
  .words{margin-top:6px;font-size:10px;color:#555}
  .badge{display:inline-block;border:1px solid #A8501F;color:#A8501F;padding:2px 8px;font-size:10px;margin-top:6px}`
}
function htmlDoc(cot, { conValores, esOT }) {
  const t = totales(cot)
  const titulo = esOT ? 'ORDEN DE TRABAJO' : 'Cotización'
  const foliolbl = esOT ? ('OT N° ' + cot.folio) : ('Folio N° ' + cot.folio)
  const cols = conValores
    ? ['Item', 'Código', 'Detalle', 'Cant', 'P. Unitario', 'Rec/Desc', 'Total']
    : ['Item', 'Código', 'Detalle', 'Cant', 'Unidad']
  const filas = (cot.items || []).map((it, i) => {
    const base = `<td>${i + 1}</td><td>${it.codigo || ''}</td><td><b>${it.detalle || ''}</b>${it.descDetallada ? '<br><span style="color:#777">Desc: ' + it.descDetallada + '</span>' : ''}${it.comentario ? '<br><span style="color:#777">Comentario: ' + it.comentario + '</span>' : ''}</td>`
    if (conValores) return `<tr>${base}<td class="r">${num(it.cant)} ${it.unidad || 'UN'}</td><td class="r">${clp(it.pUnitario)}</td><td class="r">${clp(it.descuento)}</td><td class="r">${clp(itemTotal(it))}</td></tr>`
    return `<tr>${base}<td class="r">${num(it.cant)}</td><td>${it.unidad || 'UN'}</td></tr>`
  }).join('')
  const totalesHtml = conValores ? `<table class="tot">
    <tr><td class="lbl">Afecto</td><td class="r">${clp(t.afecto)}</td></tr>
    <tr><td class="lbl">Exento</td><td class="r">$0</td></tr>
    <tr><td class="lbl">19% IVA</td><td class="r">${clp(t.iva)}</td></tr>
    <tr><td class="lbl big">Total</td><td class="r big">${clp(t.total)}</td></tr>
  </table><div class="words">${enPalabras(t.total)}</div>` : '<div class="badge">DOCUMENTO SIN VALORES · USO INTERNO / TALLER</div>'
  return `<!doctype html><html><head><meta charset="utf-8"><title>${titulo} ${cot.folio}</title><style>${estilosDoc()}</style></head><body>
    <div class="head">
      <div class="emp"><b>${EMPRESA.nombre}</b>
        <div>R.U.T: ${EMPRESA.rut}</div><div>${EMPRESA.giro}</div>
        <div>${EMPRESA.direccion}</div><div>Teléfono: ${EMPRESA.telefono}</div><div>Email: ${EMPRESA.email}</div>
      </div>
      <div class="doc"><div class="t">${titulo}</div><div class="f">${foliolbl}</div></div>
    </div>
    <table class="cli"><tbody>
      <tr><td><div class="lbl">Señor(es)</div>${cot.cliente || ''}</td><td><div class="lbl">Ciudad</div>${cot.ciudad || ''}</td><td><div class="lbl">Giro</div>${cot.giro || ''}</td><td><div class="lbl">R.U.T</div>${cot.rut || ''}</td></tr>
      <tr><td><div class="lbl">Dirección</div>${cot.direccion || ''}</td><td><div class="lbl">Condición de pago</div>${cot.condicionPago || ''}</td><td><div class="lbl">Vendedor</div>${cot.vendedor || ''}</td><td><div class="lbl">Área</div>${cot.area || ''}</td></tr>
      <tr><td><div class="lbl">Comuna</div>${cot.comuna || ''}</td><td><div class="lbl">Fecha Documento</div>${cot.fecha || ''}</td><td><div class="lbl">Fecha Vencimiento</div>${cot.vencimiento || ''}</td><td></td></tr>
    </tbody></table>
    <table class="items"><thead><tr>${cols.map(c => '<th>' + c + '</th>').join('')}</tr></thead><tbody>${filas}</tbody></table>
    ${totalesHtml}
    ${cot.comentario ? '<div style="margin-top:10px;font-size:11px"><b>Comentario:</b> ' + cot.comentario + '</div>' : ''}
  </body></html>`
}
function imprimir(html) {
  const w = window.open('', '_blank')
  if (!w) { window.alert('Habilita las ventanas emergentes para descargar el documento.'); return }
  w.document.write(html)
  w.document.close()
  setTimeout(() => { w.focus(); w.print() }, 400)
}
export function descargarCotizacionPDF(cot) { imprimir(htmlDoc(cot, { conValores: true, esOT: false })) }
export function descargarOTPDF(cot) { imprimir(htmlDoc(cot, { conValores: false, esOT: true })) }

// Cotización vacía nueva
const hoy = () => new Date().toISOString().slice(0, 10)
function nuevaCot(folio) {
  return { id: 'cot' + Date.now(), folio: String(folio || ''), fecha: hoy(), vencimiento: hoy(), area: 'Santa Rosa', cliente: '', rut: '', giro: '', ciudad: '', comuna: '', direccion: '', condicionPago: 'CONTADO', vendedor: 'Mario Vidal', comentario: '', estado: 'Borrador', items: [{ codigo: 'SPP', detalle: 'SERVICIO GRANALLADO Y PINTURA EN PLANTA', cant: '', unidad: 'UN', pUnitario: '', descuento: '', descDetallada: '', comentario: '' }] }
}

function FormCotizacion({ inicial, onGuardar, onCancelar }) {
  const [f, setF] = useState(inicial)
  const set = (k, v) => setF({ ...f, [k]: v })
  const setItem = (i, k, v) => setF({ ...f, items: f.items.map((it, j) => j === i ? { ...it, [k]: v } : it) })
  const addItem = () => setF({ ...f, items: [...f.items, { codigo: 'SPP', detalle: '', cant: '', unidad: 'UN', pUnitario: '', descuento: '', descDetallada: '', comentario: '' }] })
  const delItem = i => setF({ ...f, items: f.items.filter((_, j) => j !== i) })
  const t = totales(f)
  const lab = { fontSize: 11, color: C.gris, display: 'flex', flexDirection: 'column', gap: 3 }
  return (
    <div style={{ background: '#fff', border: `2px solid ${C.teal}`, padding: 16, marginBottom: 16 }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, textTransform: 'uppercase', marginBottom: 12 }}>Cotización · Folio N° {f.folio || '—'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <label style={lab}>Folio N° *<input style={inp} value={f.folio} onChange={e => set('folio', e.target.value)} /></label>
        <label style={lab}>Área<select style={inp} value={f.area} onChange={e => set('area', e.target.value)}>{AREAS.map(a => <option key={a}>{a}</option>)}</select></label>
        <label style={lab}>Cliente / Señor(es) *<input style={inp} value={f.cliente} onChange={e => set('cliente', e.target.value)} /></label>
        <label style={lab}>R.U.T<input style={inp} value={f.rut} onChange={e => set('rut', e.target.value)} /></label>
        <label style={lab}>Giro<input style={inp} value={f.giro} onChange={e => set('giro', e.target.value)} /></label>
        <label style={lab}>Dirección<input style={inp} value={f.direccion} onChange={e => set('direccion', e.target.value)} /></label>
        <label style={lab}>Ciudad<input style={inp} value={f.ciudad} onChange={e => set('ciudad', e.target.value)} /></label>
        <label style={lab}>Comuna<input style={inp} value={f.comuna} onChange={e => set('comuna', e.target.value)} /></label>
        <label style={lab}>Condición de pago<input style={inp} value={f.condicionPago} onChange={e => set('condicionPago', e.target.value)} /></label>
        <label style={lab}>Vendedor<input style={inp} value={f.vendedor} onChange={e => set('vendedor', e.target.value)} /></label>
        <label style={lab}>Fecha documento<input type="date" style={inp} value={f.fecha} onChange={e => set('fecha', e.target.value)} /></label>
        <label style={lab}>Fecha vencimiento<input type="date" style={inp} value={f.vencimiento} onChange={e => set('vencimiento', e.target.value)} /></label>
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: C.gris, textTransform: 'uppercase', margin: '14px 0 6px' }}>Ítems</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['Código', 'Detalle', 'Cant', 'Unid', 'P. Unitario', 'Desc.', 'Comentario/Esquema', 'Total', ''].map(h => <th key={h} style={{ textAlign: ['P. Unitario', 'Desc.', 'Total', 'Cant'].includes(h) ? 'right' : 'left', padding: '4px 6px', fontSize: 10, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
          <tbody>
            {f.items.map((it, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #EEE9DF' }}>
                <td style={{ padding: '3px 4px' }}><input value={it.codigo} onChange={e => setItem(i, 'codigo', e.target.value)} style={{ ...inp, width: 60, padding: '5px 6px' }} /></td>
                <td style={{ padding: '3px 4px' }}><input value={it.detalle} onChange={e => setItem(i, 'detalle', e.target.value)} style={{ ...inp, width: 200, padding: '5px 6px' }} /></td>
                <td style={{ padding: '3px 4px', textAlign: 'right' }}><input value={it.cant} onChange={e => setItem(i, 'cant', e.target.value)} style={{ ...inp, width: 55, padding: '5px 6px', textAlign: 'right' }} /></td>
                <td style={{ padding: '3px 4px' }}><input value={it.unidad} onChange={e => setItem(i, 'unidad', e.target.value)} style={{ ...inp, width: 44, padding: '5px 6px' }} /></td>
                <td style={{ padding: '3px 4px', textAlign: 'right' }}><input value={it.pUnitario} onChange={e => setItem(i, 'pUnitario', e.target.value)} style={{ ...inp, width: 90, padding: '5px 6px', textAlign: 'right' }} /></td>
                <td style={{ padding: '3px 4px', textAlign: 'right' }}><input value={it.descuento} onChange={e => setItem(i, 'descuento', e.target.value)} style={{ ...inp, width: 70, padding: '5px 6px', textAlign: 'right' }} /></td>
                <td style={{ padding: '3px 4px' }}><input value={it.comentario} onChange={e => setItem(i, 'comentario', e.target.value)} placeholder="Esquema / detalle" style={{ ...inp, width: 150, padding: '5px 6px' }} /></td>
                <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{clp(itemTotal(it))}</td>
                <td style={{ padding: '3px 2px', textAlign: 'right' }}>{f.items.length > 1 && <button onClick={() => delItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addItem} style={{ background: 'none', border: '1px dashed #CBD2D6', padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: C.gris, marginTop: 8 }}>+ Agregar ítem</button>

      <input style={{ ...inp, width: '100%', marginTop: 10 }} placeholder="Comentario general de la cotización (opcional)" value={f.comentario} onChange={e => set('comentario', e.target.value)} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, marginTop: 12, fontSize: 13 }}>
        <span>Afecto: <b>{clp(t.afecto)}</b></span>
        <span>IVA 19%: <b>{clp(t.iva)}</b></span>
        <span>Total: <b style={{ color: C.teal }}>{clp(t.total)}</b></span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => { if (f.folio && f.cliente) onGuardar(f) }} style={{ background: C.verde, color: '#fff', border: 'none', padding: '9px 18px', cursor: 'pointer', fontSize: 13 }}>Guardar cotización</button>
        <button onClick={onCancelar} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
      </div>
    </div>
  )
}

export default function CotizacionesModule({ cotizaciones = [], setCotizaciones = () => {}, ots = [], setOts = () => {} }) {
  const [creando, setCreando] = useState(false)
  const [editId, setEditId] = useState(null)
  const [busca, setBusca] = useState('')

  const maxFolio = cotizaciones.reduce((m, c) => Math.max(m, parseInt(String(c.folio).replace(/\D/g, ''), 10) || 0), 792)
  const guardar = cot => {
    const existe = cotizaciones.some(c => c.id === cot.id)
    setCotizaciones(existe ? cotizaciones.map(c => c.id === cot.id ? cot : c) : [cot, ...cotizaciones])
    setCreando(false); setEditId(null)
  }
  const eliminar = id => { if (window.confirm('¿Eliminar esta cotización?')) setCotizaciones(cotizaciones.filter(c => c.id !== id)) }

  function aprobar(cot) {
    if (cot.estado === 'Aprobada') { window.alert('Esta cotización ya fue aprobada y su OT ya existe.'); return }
    const numeroOT = 'OT-' + cot.folio
    if ((ots || []).some(o => o.numero === numeroOT)) { window.alert('Ya existe una OT con el número ' + numeroOT + '.') }
    else {
      const t = totales(cot)
      const nuevaOT = {
        id: 'ot' + Date.now(), numero: numeroOT, area: cot.area || 'Santa Rosa', cliente: cot.cliente,
        cotizacion: 'COT ' + cot.folio, oc: '—', m2: 0, montoCotizado: t.afecto,
        procesos: [], preparacion: '—', esquema: (cot.items || []).map(i => i.comentario).filter(Boolean).join(' · ') || '—',
        estado: 'Cotizada', ventas: [], costos: [], itemsCot: cot.items, folioCot: cot.folio,
      }
      setOts([nuevaOT, ...(ots || [])])
    }
    setCotizaciones(cotizaciones.map(c => c.id === cot.id ? { ...c, estado: 'Aprobada' } : c))
    window.alert('Cotización aprobada. Se generó la ' + numeroOT + ' en el módulo Órdenes de Trabajo. Ya puedes descargar la OT (sin valores).')
  }

  const mostradas = cotizaciones.filter(c => !busca || (String(c.folio) + ' ' + (c.cliente || '')).toLowerCase().includes(busca.toLowerCase()))

  if (creando || editId) {
    const inicial = editId ? cotizaciones.find(c => c.id === editId) : nuevaCot(maxFolio + 1)
    return <FormCotizacion inicial={inicial} onGuardar={guardar} onCancelar={() => { setCreando(false); setEditId(null) }} />
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={() => setCreando(true)} style={{ background: C.teal, color: '#fff', border: 'none', padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={15} /> Nueva cotización</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #CBD2D6', padding: '2px 6px' }}>
          <Search size={13} color={C.gris} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar folio/cliente…" style={{ border: 'none', outline: 'none', fontSize: 12.5, width: 150 }} />
        </div>
        <span style={{ fontSize: 12.5, color: C.gris }}>{mostradas.length} cotización(es)</span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2DED4', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['Folio', 'Cliente', 'Área', 'Fecha', 'Total', 'Estado', 'Acciones'].map(h => <th key={h} style={{ textAlign: h === 'Total' ? 'right' : 'left', padding: '8px 10px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
          <tbody>
            {mostradas.map(c => {
              const t = totales(c)
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>N° {c.folio}</td>
                  <td style={{ padding: '8px 10px' }}>{c.cliente}</td>
                  <td style={{ padding: '8px 10px', color: C.gris }}>{c.area}</td>
                  <td style={{ padding: '8px 10px', color: C.gris }}>{c.fecha}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{clp(t.total)}</td>
                  <td style={{ padding: '8px 10px' }}><span style={{ background: c.estado === 'Aprobada' ? '#E7F2EA' : '#F9E9DE', color: c.estado === 'Aprobada' ? C.verde : '#8C4519', padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{c.estado}</span></td>
                  <td style={{ padding: '6px 10px' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => descargarCotizacionPDF(c)} title="Descargar cotización PDF" style={{ background: C.carbon, color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}><Download size={12} /> Cotización</button>
                      {c.estado === 'Aprobada'
                        ? <button onClick={() => descargarOTPDF(c)} title="Descargar OT sin valores" style={{ background: C.azul, color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}><Download size={12} /> OT (sin valores)</button>
                        : <button onClick={() => aprobar(c)} title="Aprobar y generar OT" style={{ background: C.verde, color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={12} /> Aprobar</button>}
                      <button onClick={() => setEditId(c.id)} title="Editar" style={{ background: 'none', border: '1px solid #CBD2D6', padding: '5px 8px', cursor: 'pointer', fontSize: 11.5 }}><FileText size={12} /></button>
                      <button onClick={() => eliminar(c.id)} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {mostradas.length === 0 && <tr><td colSpan={7} style={{ padding: 18, textAlign: 'center', color: '#9AA0A6' }}>Sin cotizaciones. Crea la primera con "Nueva cotización".</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: '#9AA0A6', marginTop: 8 }}>
        "Descargar" abre el documento con formato y usa <b>Guardar como PDF</b> del navegador. Al aprobar, se genera la OT con el mismo número en Órdenes de Trabajo; la OT se descarga <b>sin valores</b> para los supervisores.
      </div>
    </div>
  )
}
