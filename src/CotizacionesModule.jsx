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
const ESTADOS_COT = ['Alta probabilidad de cierre', 'Baja probabilidad de cierre', 'Aprobada', 'Rechazada', 'Otro']
const colorEstadoCot = e => ({ 'Aprobada': ['#E7F2EA', C.verde], 'Rechazada': ['#F6E0DA', C.rojo], 'Alta probabilidad de cierre': ['#E7EEF2', C.azul], 'Baja probabilidad de cierre': ['#F9E9DE', '#8C4519'], 'Otro': ['#EEE', C.gris] }[e] || ['#EEE', C.gris])

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
  .badge{display:inline-block;border:1px solid #A8501F;color:#A8501F;padding:2px 8px;font-size:10px;margin-top:6px}
  .pb{page-break-before:always;padding-top:10px}
  .cond h2{font-size:15px;border-bottom:2px solid #161616;padding-bottom:6px;margin:0 0 10px}
  .cond ol{padding-left:18px;font-size:11px;line-height:1.5}.cond li{margin-bottom:6px}.cond li b{color:#161616}
  .cond .datos{margin-top:14px;border:1px solid #ddd;padding:10px;font-size:11px;line-height:1.6}`
}

// Condiciones comerciales y operativas (se adjuntan a la cotización)
function htmlCondiciones() {
  return `<div class="pb cond">
    <h2>Condiciones comerciales y operativas — SEREIN</h2>
    <ol>
      <li><b>Alcance y horario de ejecución:</b> los valores corresponden a trabajos realizados en horario normal y días hábiles.</li>
      <li><b>Trabajos fuera de horario regular:</b> se aplicará recargo por horas extraordinarias y disponibilidad, informado previamente.</li>
      <li><b>Condición del material recepcionado:</b> valores válidos para material nuevo y libre de contaminantes (aceites, grasas, lacas, etc.). Si no cumple, se debe informar para revalorizar.</li>
      <li><b>Superficie mínima a cobrar:</b> piezas menores a 1 m² se valorizan como 1 m². Esquemas de pintura: cobro mínimo 18 m² (por compra mínima de pintura).</li>
      <li><b>Piezas especiales y complejidad:</b> elementos no estándar se valorizan según complejidad (peso/masa, geometría, dimensiones, manipulación, puntos de izaje, protección o preparación adicional).</li>
      <li><b>Cálculo de cubicación:</b> Parrillas estándar: A×B×2 + 30%. Parrillas especiales: desarrollo + 40%. Barandas: A×B + 40%. Enrejados/cerchas/reticulado: desarrollo + 30%. Cañerías hasta 3": +15%.</li>
      <li><b>Exclusiones del servicio:</b> no se consideran trabajos adicionales como mecánicos, enmasillados, silicona, tapas, etiquetado, u otros no mencionados en la cotización.</li>
      <li><b>Plazo de retiro y bodegaje:</b> el material puede permanecer en planta máx. 7 días terminado el proceso. Luego: bodegaje 2 UF/día.</li>
      <li><b>Entrega y condiciones de carga:</b> SEREIN entrega el material puesto sobre camión. Capacidad grúa: 7 toneladas (sobre eso, corre por cuenta del cliente).</li>
      <li><b>Responsabilidad del cliente para carguío:</b> el cliente debe contar con eslingas, maderas, cartón y elementos para carguío. Si se requiere embalaje, tiene costo adicional y debe solicitarse con 48 hrs de anticipación.</li>
      <li><b>Orden de Compra (OC):</b> es obligatorio el envío de la OC para iniciar producción.</li>
    </ol>
    <div class="datos"><b>Datos de transferencia</b><br>
      SERVICIOS REVESTIMIENTOS INDUSTRIALES SpA · RUT 76.860.656-0<br>
      Banco de Chile · Cuenta Corriente N° 532147409<br>
      administracion@sereinspa.com · Carolina Marillanca, Gerente Comercial<br>
      Dirección: Santa Rosa 70, Lampa · sereingroup.cl · Tel: 56 9 7647 1744
    </div>
  </div>`
}
function htmlDoc(cot, { conValores, esOT, conCondiciones }) {
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
    ${conCondiciones ? htmlCondiciones() : ''}
  </body></html>`
}
function imprimir(html) {
  const w = window.open('', '_blank')
  if (!w) { window.alert('Habilita las ventanas emergentes para descargar el documento.'); return }
  w.document.write(html)
  w.document.close()
  setTimeout(() => { w.focus(); w.print() }, 400)
}
export function descargarCotizacionPDF(cot) { imprimir(htmlDoc(cot, { conValores: true, esOT: false, conCondiciones: true })) }
export function descargarOTPDF(cot) { imprimir(htmlDoc(cot, { conValores: false, esOT: true })) }

// OT en PDF a partir de la OT real (refleja esquema, servicios y partidas editados)
function htmlOTDoc(ot) {
  const items = ot.itemsCot || []
  const filas = items.map((it, i) => `<tr><td>${i + 1}</td><td>${it.codigo || ''}</td><td><b>${it.detalle || ''}</b>${it.comentario ? '<br><span style="color:#777">Comentario: ' + it.comentario + '</span>' : ''}</td><td class="r">${num(it.cant)}</td><td>${it.unidad || 'UN'}</td></tr>`).join('')
  const partidas = ot.partidas || []
  const partHtml = partidas.length ? `<div style="margin-top:12px"><b style="font-size:12px">Partidas / entregas de material</b>
    <table class="items" style="margin-top:4px"><thead><tr><th>N°</th><th>Detalle del material</th><th>Fecha estimada</th><th>Estado</th></tr></thead><tbody>
    ${partidas.map((p, i) => `<tr><td>${i + 1}</td><td>${p.detalle || ''}</td><td>${p.fecha || ''}</td><td>${p.estado || ''}</td></tr>`).join('')}</tbody></table></div>` : ''
  const esquema = (ot.esquema && ot.esquema !== '—') ? String(ot.esquema).replace(/\n/g, '<br>') : ''
  const servicios = ot.servicios ? String(ot.servicios).replace(/\n/g, '<br>') : ''
  return `<!doctype html><html><head><meta charset="utf-8"><title>OT ${ot.numero || ''}</title><style>${estilosDoc()}</style></head><body>
    <div class="head">
      <div class="emp"><b>${EMPRESA.nombre}</b><div>R.U.T: ${EMPRESA.rut}</div><div>${EMPRESA.direccion}</div><div>Tel: ${EMPRESA.telefono} · ${EMPRESA.email}</div></div>
      <div class="doc"><div class="t">Orden de trabajo</div><div class="f">${ot.numero || ''}</div></div>
    </div>
    <table class="cli"><tbody>
      <tr><td><div class="lbl">Cliente</div>${ot.cliente || ''}</td><td><div class="lbl">Área</div>${ot.area || ''}</td><td><div class="lbl">Cotización</div>${ot.cotizacion || ''}</td><td><div class="lbl">OC</div>${ot.oc || ''}</td></tr>
      <tr><td><div class="lbl">m²</div>${ot.m2 || 0}</td><td><div class="lbl">Preparación</div>${ot.preparacion || ''}</td><td><div class="lbl">Estado</div>${ot.estado || ''}</td><td></td></tr>
    </tbody></table>
    ${items.length ? `<table class="items"><thead><tr><th>Item</th><th>Código</th><th>Detalle</th><th>Cant</th><th>Unidad</th></tr></thead><tbody>${filas}</tbody></table>` : ''}
    ${esquema ? `<div style="margin-top:12px;font-size:11px"><b>Esquema de pintura:</b><br>${esquema}</div>` : ''}
    ${servicios ? `<div style="margin-top:8px;font-size:11px"><b>Servicios / observaciones:</b><br>${servicios}</div>` : ''}
    ${partHtml}
    <div class="badge" style="margin-top:12px">DOCUMENTO SIN VALORES · USO INTERNO / TALLER</div>
  </body></html>`
}
export function descargarOTDesdeOT(ot) { imprimir(htmlOTDoc(ot)) }

// Cotización vacía nueva
const hoy = () => new Date().toISOString().slice(0, 10)
function nuevaCot(folio) {
  return { id: 'cot' + Date.now(), folio: String(folio || ''), fecha: hoy(), vencimiento: hoy(), area: 'Santa Rosa', cliente: '', rut: '', giro: '', ciudad: '', comuna: '', direccion: '', condicionPago: 'CONTADO', vendedor: 'Mario Vidal', comentario: '', estado: 'Alta probabilidad de cierre', estadoOtro: '', items: [{ codigo: 'SPP', detalle: 'SERVICIO GRANALLADO Y PINTURA EN PLANTA', cant: '', unidad: 'UN', pUnitario: '', descuento: '', descDetallada: '', comentario: '' }] }
}

// Mini panel para añadir un cliente nuevo a la lista maestra
function MiniAddCliente({ nombreInicial, onAdd, onCancel }) {
  const [c, setC] = useState({ nombre: nombreInicial || '', rut: '', giro: '', direccion: '', comuna: '' })
  const sc = (k, v) => setC({ ...c, [k]: v })
  return (
    <div style={{ background: '#FAF7F3', border: '1px solid #E2DED4', padding: 12, marginTop: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.gris, textTransform: 'uppercase', marginBottom: 8 }}>Añadir cliente a la lista</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <input style={inp} placeholder="Nombre / Razón social *" value={c.nombre} onChange={e => sc('nombre', e.target.value)} />
        <input style={inp} placeholder="RUT" value={c.rut} onChange={e => sc('rut', e.target.value)} />
        <input style={inp} placeholder="Giro" value={c.giro} onChange={e => sc('giro', e.target.value)} />
        <input style={inp} placeholder="Dirección" value={c.direccion} onChange={e => sc('direccion', e.target.value)} />
        <input style={inp} placeholder="Comuna" value={c.comuna} onChange={e => sc('comuna', e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" onClick={() => c.nombre.trim() && onAdd(c)} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5 }}>Guardar cliente</button>
        <button type="button" onClick={onCancel} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5 }}>Cancelar</button>
      </div>
    </div>
  )
}

function FormCotizacion({ inicial, onGuardar, onCancelar, clientes = [], onAddCliente = () => {} }) {
  const [f, setF] = useState(inicial)
  const [addCli, setAddCli] = useState(false)
  const set = (k, v) => setF({ ...f, [k]: v })
  const _n = s => (s || '').trim().toLowerCase()
  const aplicarCliente = nombre => {
    const cli = (clientes || []).find(x => _n(x.nombre) === _n(nombre))
    if (cli) setF(prev => ({ ...prev, cliente: cli.nombre, rut: cli.rut || prev.rut, giro: cli.giro || prev.giro, direccion: cli.direccion || prev.direccion, comuna: cli.comuna || prev.comuna }))
    else setF(prev => ({ ...prev, cliente: nombre }))
  }
  const setItem = (i, k, v) => setF({ ...f, items: f.items.map((it, j) => j === i ? { ...it, [k]: v } : it) })
  const addItem = () => setF({ ...f, items: [...f.items, { codigo: 'SPP', detalle: '', cant: '', unidad: 'UN', pUnitario: '', descuento: '', descDetallada: '', comentario: '' }] })
  const delItem = i => setF({ ...f, items: f.items.filter((_, j) => j !== i) })
  const t = totales(f)
  const lab = { fontSize: 11, color: C.gris, display: 'flex', flexDirection: 'column', gap: 3 }
  return (
    <div style={{ background: '#fff', border: `2px solid ${C.teal}`, padding: 16, marginBottom: 16 }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, textTransform: 'uppercase', marginBottom: 12 }}>Cotización · Folio N° {f.folio || '—'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <label style={lab}>Folio N° (correlativo automático)<input style={{ ...inp, background: '#F1EDE6', fontWeight: 600 }} value={f.folio} readOnly /></label>
        <div style={{ ...lab, gridColumn: '1 / -1' }}>Área / módulo al que irá la OT *
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {AREAS.map(a => (
              <button key={a} type="button" onClick={() => set('area', a)} style={{ padding: '8px 16px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, border: '1px solid ' + (f.area === a ? C.teal : '#CBD2D6'), background: f.area === a ? C.teal : '#fff', color: f.area === a ? '#fff' : C.carbon }}>{a}</button>
            ))}
          </div>
        </div>
        <div style={{ ...lab, gridColumn: '1 / -1' }}>Cliente / Señor(es) *
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <input style={{ ...inp, flex: '1 1 220px' }} list="dl-cot-cli" value={f.cliente} onChange={e => aplicarCliente(e.target.value)} placeholder="Escribe y selecciona; se autocompletan sus datos" />
            <button type="button" onClick={() => setAddCli(v => !v)} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, whiteSpace: 'nowrap' }}>+ Añadir cliente</button>
          </div>
          <datalist id="dl-cot-cli">{(clientes || []).map(cl => <option key={cl.id || cl.nombre} value={cl.nombre} />)}</datalist>
          {addCli && <MiniAddCliente nombreInicial={f.cliente} onAdd={cli => { onAddCliente(cli); setF(prev => ({ ...prev, cliente: cli.nombre, rut: cli.rut || '', giro: cli.giro || '', direccion: cli.direccion || '', comuna: cli.comuna || '' })); setAddCli(false) }} onCancel={() => setAddCli(false)} />}
        </div>
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

export default function CotizacionesModule({ cotizaciones = [], setCotizaciones = () => {}, ots = [], setOts = () => {}, clientes = [], onAddCliente = () => {} }) {
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
        id: 'ot' + Date.now(), numero: numeroOT, area: cot.area || 'Santa Rosa', cliente: cot.cliente, fecha: cot.fecha,
        cotizacion: 'COT ' + cot.folio, oc: '—', m2: 0, montoCotizado: t.afecto,
        procesos: [], preparacion: '—', esquema: (cot.items || []).map(i => i.comentario).filter(Boolean).join(' · ') || '—',
        estado: 'Cotizada', ventas: [], costos: [], itemsCot: cot.items, folioCot: cot.folio,
      }
      setOts([nuevaOT, ...(ots || [])])
    }
    setCotizaciones(cotizaciones.map(c => c.id === cot.id ? { ...c, estado: 'Aprobada' } : c))
    window.alert('Cotización aprobada. Se generó la ' + numeroOT + ' en el módulo Órdenes de Trabajo. Ya puedes descargar la OT (sin valores).')
  }

  const updateCot = (id, cambios) => setCotizaciones(cotizaciones.map(x => x.id === id ? { ...x, ...cambios } : x))
  const setEstadoCot = (c, nuevo) => { if (nuevo === 'Aprobada' && c.estado !== 'Aprobada') aprobar(c); else updateCot(c.id, { estado: nuevo }) }

  const mostradas = cotizaciones.filter(c => !busca || (String(c.folio) + ' ' + (c.cliente || '')).toLowerCase().includes(busca.toLowerCase()))

  if (creando || editId) {
    const inicial = editId ? cotizaciones.find(c => c.id === editId) : nuevaCot(maxFolio + 1)
    return <FormCotizacion inicial={inicial} onGuardar={guardar} onCancelar={() => { setCreando(false); setEditId(null) }} clientes={clientes} onAddCliente={onAddCliente} />
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
                  <td style={{ padding: '6px 10px', minWidth: 170 }}>
                    {(() => { const [bg, fg] = colorEstadoCot(c.estado); return (
                      <select value={c.estado} onChange={e => setEstadoCot(c, e.target.value)} style={{ border: 'none', background: bg, color: fg, padding: '4px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer', maxWidth: 195 }}>
                        {ESTADOS_COT.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) })()}
                    {c.estado === 'Otro' && <input value={c.estadoOtro || ''} onChange={e => updateCot(c.id, { estadoOtro: e.target.value })} placeholder="Especificar…" style={{ ...inp, marginTop: 4, width: '100%', padding: '5px 7px' }} />}
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => descargarCotizacionPDF(c)} title="Descargar cotización PDF" style={{ background: C.carbon, color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}><Download size={12} /> Cotización</button>
                      {c.estado === 'Aprobada' && <button onClick={() => descargarOTPDF(c)} title="Descargar OT sin valores" style={{ background: C.azul, color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}><Download size={12} /> OT (sin valores)</button>}
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
