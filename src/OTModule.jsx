import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2, X, Ruler, Paintbrush, FileText, Receipt, ShoppingCart, CircleDollarSign, Download, Camera, Search, RotateCcw, Lock, Unlock, CalendarDays } from 'lucide-react'
import * as XLSX from 'xlsx'
import { descargarOTDesdeOT } from './CotizacionesModule.jsx'
import { costoOCdeOT } from './OrdenesCompraModule.jsx'
import { supabase } from './supabase.js'
import { costoMOdeOT } from './ManoObraModule.jsx'
import Paginador, { paginar } from './Paginador.jsx'
import { pullState, pushState } from './sync.js'
import { SEREIN } from './theme-serein.js'
import { KpiCard, Pill, Btn, TabsBar } from './ui.jsx'
import { PILL_VARIANT } from './theme-serein.js'

// Paleta reskineada a la identidad Serein 2026 — mismas claves de siempre,
// solo cambian los valores hex. La logica de abajo no se toca.
const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const clp = n => '$' + Math.round(n).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const numDec = s => { const v = parseFloat(String(s).replace(',', '.')); return isNaN(v) ? 0 : v }
const inp = { padding: '7px 9px', border: '1px solid #DFE4EA', fontSize: 13, boxSizing: 'border-box' }
const btnMini = { background: 'none', border: 'none', cursor: 'pointer', color: C.rojo, padding: 4 }

const CATEGORIAS_COSTO = ['Materiales', 'Mano de obra', 'Gastos asociados', 'Arriendo equipos', 'Factoring', 'Transporte', 'Otros']
const ESTADOS_OT = ['Cotizada', 'En ejecución', 'Terminada', 'Facturada', 'Cerrada']
const PREPARACIONES = ['SSPC-SP1 Limpieza solvente', 'SSPC-SP2/SP3 Manual/Mecánica', 'SSPC-SP6 Comercial', 'SSPC-SP10 Casi blanco', 'SSPC-SP5 Metal blanco', 'Hidrolavado', 'Otra']
const hoy = () => new Date().toISOString().slice(0, 10)

// Fuente unica de "venta neta" de una OT — la usan la tarjeta, la ficha y
// los indicadores de arriba, para que nunca muestren numeros distintos.
// Prioriza las facturas reales (ot.ventas); si todavia no hay ninguna,
// cae al monto cotizado (es el mismo criterio que ya usaba la tarjeta).
export const ventaNetaDeOT = ot => (ot.ventas && ot.ventas.length)
  ? ot.ventas.reduce((a, v) => a + (v.neta || 0), 0)
  : (ot.montoCotizado || 0)
// Una OT cerrada se considera "Facturada" si tiene al menos una factura
// (folio) registrada — no se guarda en ot.estado, se calcula al vuelo, asi
// que si se borra la unica factura vuelve sola a "Pendiente de facturacion".
export const tieneFactura = ot => (ot.ventas || []).some(v => (v.folio || '').trim() && v.folio !== 's/f')
// Etiqueta de presentacion para el estado — el valor guardado en ot.estado
// no cambia, solo cambia como se muestra (para no afectar a ningun otro
// modulo que ya depende de los strings reales).
const etiquetaEstado = ot => {
  if (ot.estado === 'Cerrada') return tieneFactura(ot) ? 'Facturada' : 'Pendiente de facturación'
  if (ot.estado === 'Cotizada') return 'Pendiente'
  if (ot.estado === 'En ejecución') return 'En producción'
  if (ot.estado === 'Terminada') return 'Lista para cerrar'
  return ot.estado
}

// Cuando una OT viene de una cotización aprobada, trae sus ítems
// (ot.itemsCot: cant/pUnitario/descuento cotizados, mismo criterio que
// itemTotal() en CotizacionesModule.jsx). En planta suelen salir más (o
// menos) m² que los cotizados por ítem; m2Real guarda lo medido en planta,
// y si no se ha cargado aún se usa el m² cotizado (cant) tal cual.
const m2CotizadoItem = it => numDec(it.cant)
const m2RealItem = it => (it.m2Real != null && it.m2Real !== '') ? numDec(it.m2Real) : m2CotizadoItem(it)
const montoItemReal = it => Math.max(0, Math.round((m2RealItem(it) * num(it.pUnitario)) - num(it.descuento)))
const montoTotalItemsReal = items => (items || []).reduce((a, it) => a + montoItemReal(it), 0)

// ===== OTs DE EJEMPLO CON DATOS REALES DEL EXCEL (Viman, Santa Rosa) =====
export const OTS_INICIALES = [
  {
    id: 'ot-2026-114',
    numero: 'OT-2026-114',
    area: 'Santa Rosa',
    cliente: 'Viman',
    cotizacion: 'COT 772 / 776',
    oc: 'GD 873',
    m2: 260,
    montoCotizado: 5518500,
    procesos: ['Granallado', 'Pintura'],
    preparacion: 'SSPC-SP6 Comercial',
    esquema: 'Zinc rico + epóxico HB + poliuretano (240 µm)',
    estado: 'Facturada',
    ventas: [
      { folio: '1667', fecha: '2026-07-01', neta: 4465500, estadoPago: 'Pendiente' },
      { folio: '1669', fecha: '2026-07-01', neta: 1053000, estadoPago: 'Pendiente' },
    ],
    costos: [
      { categoria: 'Materiales', detalle: 'Pintura y diluyente (estimado)', monto: 1150000 },
      { categoria: 'Mano de obra', detalle: 'Cuadrilla 4 días', monto: 880000 },
      { categoria: 'Factoring', detalle: 'Pérdida neta fact. 1669', monto: 200000 },
    ],
  },
  {
    id: 'ot-2026-115',
    numero: 'OT-2026-115',
    area: 'Santa Rosa',
    cliente: 'Viman',
    cotizacion: 'COT 773',
    oc: '—',
    m2: 0,
    montoCotizado: 684000,
    procesos: ['Pintura'],
    preparacion: 'SSPC-SP2/SP3 Manual/Mecánica',
    esquema: 'Reparación puntual esquema existente',
    estado: 'Facturada',
    ventas: [{ folio: '1668', fecha: '2026-07-01', neta: 684000, estadoPago: 'Pendiente' }],
    costos: [],
  },
  {
    id: 'ot-234', numero: 'OT-234', area: 'Santa Rosa', cliente: 'Howden',
    cotizacion: '—', oc: '—', m2: 200, montoCotizado: 0,
    procesos: ['Granallado', 'Pintura'],
    preparacion: 'SSPC-SP6 Comercial', esquema: 'Granallado y pintura',
    estado: 'En ejecución', ventas: [], costos: [],
  },
  {
    id: 'ot-385', numero: 'OT-385', area: 'Santa Rosa', cliente: 'TTM',
    cotizacion: '—', oc: '—', m2: 500, montoCotizado: 0,
    procesos: ['Granallado', 'Pintura'],
    preparacion: 'SSPC-SP10 Casi blanco', esquema: 'Granallado y pintura',
    estado: 'En ejecución', ventas: [], costos: [],
  },
  {
    id: 'ot-304', numero: 'OT-304', area: 'Istria', cliente: 'IMMA',
    cotizacion: '—', oc: '—', m2: 180, montoCotizado: 0,
    procesos: ['Pintura'],
    preparacion: 'SSPC-SP2/SP3 Manual/Mecánica', esquema: 'Pintura estructuras',
    estado: 'En ejecución', ventas: [], costos: [],
  },
  {
    id: 'ot-302', numero: 'OT-302', area: 'Istria', cliente: 'IMMA',
    cotizacion: '—', oc: '—', m2: 300, montoCotizado: 0,
    procesos: ['Pintura'],
    preparacion: 'SSPC-SP2/SP3 Manual/Mecánica', esquema: 'Pintura',
    estado: 'En ejecución', ventas: [], costos: [],
  },
]

function Barra({ pct, color, alto = 8 }) {
  return (
    <div style={{ height: alto, background: '#DFE4EA', width: '100%' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, transition: 'width .3s' }} />
    </div>
  )
}

function ChipEstado({ ot }) {
  const estado = ot.estado
  // Para 'Cerrada' el color depende de si ya tiene factura o no (calculado,
  // no cambia el valor real guardado en ot.estado).
  const map = {
    'Cotizada': [SEREIN.fog2, SEREIN.textSoft], 'En ejecución': [SEREIN.orangeSoft, C.ambar],
    'Terminada': [SEREIN.blueSoft, SEREIN.blue], 'Facturada': [SEREIN.greenSoft, C.verde],
    'Cerrada': tieneFactura(ot) ? [SEREIN.greenSoft, C.verde] : ['#EDEBF7', '#5B4E8C'],
  }
  const [bg, fg] = map[estado] || [SEREIN.fog2, SEREIN.textFaint]
  return <span style={{ background: bg, color: fg, padding: '4px 11px', borderRadius: SEREIN.radiusPill, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{etiquetaEstado(ot)}</span>
}

// ---------- Formularios inline ----------
function FormVenta({ onAdd, onCancel, abonoTotal = 0, ventaTotalActual = 0 }) {
  const [f, setF] = useState({ folio: '', fecha: '', neta: '', estadoPago: 'Pendiente' })
  const iva = Math.round(num(f.neta) * 0.19)
  const ventaTrasFactura = ventaTotalActual + num(f.neta)
  const saldoTrasFactura = ventaTrasFactura - abonoTotal
  return (
    <div style={{ background: '#F2F4F7', padding: 10, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...inp, width: 100 }} placeholder="Folio fact." value={f.folio} onChange={e => setF({ ...f, folio: e.target.value })} />
        <input style={{ ...inp, width: 130 }} type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} />
        <input style={{ ...inp, width: 140 }} placeholder="Venta neta CLP" value={f.neta} onChange={e => setF({ ...f, neta: e.target.value })} />
        <select style={inp} value={f.estadoPago} onChange={e => setF({ ...f, estadoPago: e.target.value })}>
          <option>Pendiente</option><option>Pagado</option><option>Factoring</option>
        </select>
        <button onClick={() => num(f.neta) > 0 && onAdd({ folio: f.folio || 's/f', fecha: f.fecha || '—', neta: num(f.neta), estadoPago: f.estadoPago })}
          style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar</button>
        <button onClick={onCancel} style={{ ...btnMini, color: '#9AA3AD' }}><X size={16} /></button>
      </div>
      {num(f.neta) > 0 && <div style={{ fontSize: 12, color: '#9AA3AD', marginTop: 6 }}>IVA 19%: {clp(iva)} · Total factura: {clp(num(f.neta) + iva)}</div>}
      {abonoTotal > 0 && (
        <div style={{ fontSize: 12, marginTop: 6, padding: '6px 8px', background: '#fff', border: '1px solid #DFE4EA' }}>
          Cliente ya abonó <b style={{ color: C.verde }}>{clp(abonoTotal)}</b> en esta OT.{' '}
          {num(f.neta) > 0
            ? (saldoTrasFactura > 0
              ? <>Con esta factura, el saldo pendiente por percibir quedaría en <b style={{ color: C.ambar }}>{clp(saldoTrasFactura)}</b>.</>
              : saldoTrasFactura < 0
                ? <>Con esta factura, quedaría un saldo a favor del cliente de <b style={{ color: '#5B4E8C' }}>{clp(-saldoTrasFactura)}</b>.</>
                : <>Con esta factura, el abono cubriría exactamente la venta (saldo $0).</>)
            : 'Ingresa el monto para ver el saldo pendiente resultante.'}
        </div>
      )}
    </div>
  )
}

// Abono de cliente: pago anticipado sin factura asociada todavía, por eso
// NO lleva IVA (a diferencia de una venta facturada).
function FormAbono({ onAdd, onCancel }) {
  const [f, setF] = useState({ fecha: '', monto: '', medio: '', obs: '' })
  return (
    <div style={{ background: '#F2F4F7', padding: 10, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...inp, width: 130 }} type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} />
        <input style={{ ...inp, width: 140 }} placeholder="Monto abonado CLP" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} />
        <input style={{ ...inp, width: 140 }} placeholder="Medio de pago (opcional)" value={f.medio} onChange={e => setF({ ...f, medio: e.target.value })} />
        <input style={{ ...inp, width: 180 }} placeholder="Observación (opcional)" value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} />
        <button onClick={() => num(f.monto) > 0 && onAdd({ fecha: f.fecha || '—', monto: num(f.monto), medio: f.medio || '', obs: f.obs || '' })}
          style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar</button>
        <button onClick={onCancel} style={{ ...btnMini, color: '#9AA3AD' }}><X size={16} /></button>
      </div>
      <div style={{ fontSize: 11.5, color: '#9AA3AD', marginTop: 6 }}>Los abonos son pagos anticipados del cliente, sin IVA — se descuentan del saldo cuando se emite la factura correspondiente.</div>
    </div>
  )
}

function FormCosto({ onAdd, onCancel }) {
  const [f, setF] = useState({ categoria: 'Materiales', detalle: '', monto: '' })
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', background: '#F2F4F7', padding: 10, marginTop: 8, alignItems: 'center' }}>
      <select style={inp} value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })}>
        {CATEGORIAS_COSTO.map(c => <option key={c}>{c}</option>)}
      </select>
      <input style={{ ...inp, flex: '1 1 160px' }} placeholder="Detalle (proveedor, concepto…)" value={f.detalle} onChange={e => setF({ ...f, detalle: e.target.value })} />
      <input style={{ ...inp, width: 140 }} placeholder="Monto neto CLP" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} />
      <button onClick={() => num(f.monto) > 0 && onAdd({ categoria: f.categoria, detalle: f.detalle, monto: num(f.monto) })}
        style={{ background: C.teal, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar</button>
      <button onClick={onCancel} style={{ ...btnMini, color: '#9AA3AD' }}><X size={16} /></button>
    </div>
  )
}

// ---------- Tarjeta OT ----------
const ETIQUETAS_FOTO = ['Recepción', 'Proceso', 'Despacho', 'Otro']

function SobrantePanel({ ot }) {
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [color, setColor] = useState('')
  const [cant, setCant] = useState('')
  const [sede, setSede] = useState((ot && (ot.sede || ot.area)) || 'Santa Rosa')
  const [msg, setMsg] = useState('')
  function guardar() {
    const fn = window.__sereinAddSobrante
    if (typeof fn !== 'function') { setMsg('Inventario no disponible aun.'); return }
    const r = fn({ nombre, color, cantidad: cant, sede, ot: (ot && (ot.numero || ot.nOT || ot.ot || ot.id)) || '', usuario: '' })
    if (r && r.ok) { setMsg('\u2713 Sobrante ingresado a ' + sede + ' (saldo ' + r.saldoRes + ').'); setNombre(''); setColor(''); setCant('') }
    else { setMsg((r && r.msg) || 'No se pudo ingresar.') }
  }
  const inp = { border: '1px solid #DFE4EA', borderRadius: 4, padding: '6px 8px', fontSize: 12 }
  return (
    <div style={{ marginTop: 10, border: '1px dashed #CFC9BC', borderRadius: 6, padding: 10, background: '#F7FBF8' }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: C.teal, fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0 }}>{open ? '\u25be' : '\u25b8'} Ingresar sobrante al inventario</button>
      {open ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginTop: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><label style={{ fontSize: 10, color: '#9AA3AD' }}>Producto</label><input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="pintura..." style={{ ...inp, minWidth: 160 }} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><label style={{ fontSize: 10, color: '#9AA3AD' }}>Color/marca</label><input value={color} onChange={e => setColor(e.target.value)} style={{ ...inp, minWidth: 120 }} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><label style={{ fontSize: 10, color: '#9AA3AD' }}>Cantidad</label><input type="number" value={cant} onChange={e => setCant(e.target.value)} style={{ ...inp, width: 80 }} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><label style={{ fontSize: 10, color: '#9AA3AD' }}>Sede</label><select value={sede} onChange={e => setSede(e.target.value)} style={{ ...inp }}><option>Santa Rosa</option><option>Istria</option></select></div>
          <button onClick={guardar} style={{ background: C.teal, color: '#fff', border: 'none', borderRadius: 4, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Ingresar</button>
        </div>
      ) : null}
      {msg ? <div style={{ fontSize: 11, color: msg.charAt(0) === '\u2713' ? C.verde : '#D9600A', marginTop: 6, fontWeight: 600 }}>{msg}</div> : null}
    </div>
  )
}

function FotosOT({ ot, onUpdate }) {
  const [etiqueta, setEtiqueta] = useState('Recepción')
  const [ampliada, setAmpliada] = useState(null)
  const fotos = ot.fotos || []

  function subir(e) {
    const archivos = Array.from(e.target.files || [])
    archivos.forEach(archivo => {
      const lector = new FileReader()
      lector.onload = ev => {
        const nueva = { id: 'f' + Date.now() + Math.random().toString(36).slice(2, 5), url: ev.target.result, etiqueta, fecha: new Date().toISOString().slice(0, 10), nombre: archivo.name }
        onUpdate(ot.id, { fotos: [...(ot.fotos || []), nueva] })
      }
      lector.readAsDataURL(archivo)
    })
    e.target.value = ''
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.gris, textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Camera size={14} /> Fotos de la OT ({fotos.length})
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <select value={etiqueta} onChange={e => setEtiqueta(e.target.value)} style={{ padding: '6px 9px', border: '1px solid #DFE4EA', fontSize: 12 }}>
          {ETIQUETAS_FOTO.map(t => <option key={t}>{t}</option>)}
        </select>
        <label style={{ background: C.carbon, color: '#fff', padding: '7px 14px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Camera size={13} /> Subir foto(s)
          <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={subir} />
        </label>
        <span style={{ fontSize: 11, color: '#9AA3AD' }}>Ej: camión al recibir, avance del proceso, despacho.</span>
      </div>
      {fotos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {fotos.map(f => (
            <div key={f.id} style={{ width: 110 }}>
              <img src={f.url} alt={f.etiqueta} onClick={() => setAmpliada(f)}
                style={{ width: 110, height: 82, objectFit: 'cover', cursor: 'pointer', border: '1px solid #DFE4EA', display: 'block' }} />
              <div style={{ fontSize: 10.5, color: C.gris, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                <span>{f.etiqueta} · {f.fecha.slice(5)}</span>
                <button onClick={() => window.confirm('¿Eliminar esta foto?') && onUpdate(ot.id, { fotos: fotos.filter(x => x.id !== f.id) })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo, padding: 0 }}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {ampliada && (
        <div onClick={() => setAmpliada(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexDirection: 'column', gap: 10, padding: 20 }}>
          <img src={ampliada.url} alt="" style={{ maxWidth: '92vw', maxHeight: '80vh', objectFit: 'contain' }} />
          <span style={{ color: '#fff', fontSize: 13 }}>{ampliada.etiqueta} · {ampliada.fecha} · toca para cerrar</span>
        </div>
      )}
    </div>
  )
}

function descargarOT(ot) {
  const ventaTotal = (ot.ventas || []).reduce((a, v) => a + v.neta, 0)
  const costoTotal = (ot.costos || []).reduce((a, c) => a + c.monto, 0)
  const wb = XLSX.utils.book_new()
  const ficha = [
    ['ORDEN DE TRABAJO', ot.numero], [],
    ['Cliente', ot.cliente], ['Área / Planta', ot.area],
    ['Cotización', ot.cotizacion || '—'], ['Orden de compra', ot.oc || '—'],
    ['m² físicos', ot.m2 || 0], ['Preparación superficial', ot.preparacion || '—'],
    ['Esquema', ot.esquema || '—'], ['Procesos', (ot.procesos || []).join(' + ') || '—'],
    ['Estado', ot.estado], ['Monto cotizado (neto)', ot.montoCotizado || 0], [],
    ['Venta neta facturada', ventaTotal], ['Costos totales', costoTotal],
    ['Utilidad real', ventaTotal - costoTotal],
    ['Margen %', ventaTotal > 0 ? Math.round(((ventaTotal - costoTotal) / ventaTotal) * 1000) / 10 : 0],
    ['Fotos registradas', (ot.fotos || []).length],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ficha), 'Ficha')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Folio', 'Fecha', 'Neta', 'IVA', 'Total', 'Estado de pago'],
    ...(ot.ventas || []).map(v => [v.folio, v.fecha, v.neta, Math.round(v.neta * 0.19), Math.round(v.neta * 1.19), v.estadoPago || v.estado_pago || '—']),
  ]), 'Ventas')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Categoría', 'Detalle', 'Fecha', 'Monto'],
    ...(ot.costos || []).map(x => [x.categoria, x.detalle || '—', x.fecha || '—', x.monto]),
  ]), 'Costos')
  XLSX.writeFile(wb, `${ot.numero}.xlsx`)
}

// Portada de cada OT — muestra sin necesidad de abrir la ficha: N° de OT,
// N° de OC/NV, N° de cotizacion, cliente, fecha de ingreso, observaciones
// (resumen), esquema, venta neta y estado. Todo lo demas del detalle actual
// sigue disponible al abrir la ficha (TarjetaOT), esto no lo reemplaza.
function TileOT({ ot, onOpen, onDragStart, onDropOn, verValores }) {
  const monto = ventaNetaDeOT(ot)
  const abonoTot = (ot.abonos || []).reduce((a, x) => a + (x.monto || 0), 0)
  const saldoPend = monto - abonoTot
  const obs = (ot.servicios || '').trim()
  const obsResumen = obs.length > 90 ? obs.slice(0, 87) + '…' : obs
  const esquemaResumen = (ot.esquema && ot.esquema !== '—') ? (ot.esquema.length > 70 ? ot.esquema.slice(0, 67) + '…' : ot.esquema) : ''
  const cerrada = ot.estado === 'Cerrada'
  return (
    <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); onDropOn() }} onClick={onOpen}
      style={{ background: '#fff', border: '1px solid #DFE4EA', borderTop: '3px solid ' + (ot.area === 'Istria' ? '#1B1F23' : '#D9600A'), padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, borderRadius: SEREIN.radius }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 12, background: '#101315', color: '#fff', padding: '2px 7px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{ot.numero}</span>
          {(ot.area === 'Santa Rosa' || ot.sede === 'Santa Rosa') && ot.oc && ot.oc !== '—' ? <span title="Orden de compra del cliente" style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 11.5, background: '#F77716', color: '#fff', padding: '2px 7px', borderRadius: 3, whiteSpace: 'nowrap' }}>OC {ot.oc}</span> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ChipEstado ot={ot} />
          <span draggable onDragStart={e => { e.stopPropagation(); onDragStart() }} onClick={e => e.stopPropagation()} title="Arrastrar para reordenar" style={{ cursor: 'grab', color: '#B9C0C6', fontSize: 15, userSelect: 'none', lineHeight: 1, letterSpacing: '-1px' }}>::</span>
        </div>
      </div>
      {ot.nv && ot.nv !== '—' ? <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, color: '#D9600A' }}>NV {ot.nv}</div> : null}
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, color: '#101315', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ot.cliente}</div>
      <div style={{ fontSize: 11.5, color: '#9AA3AD', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {ot.cotizacion && ot.cotizacion !== '—' && <span>Cotización: {ot.cotizacion}</span>}
        <span>Fecha de ingreso: {ot.fecha || '—'}</span>
        {obsResumen && <span title={obs}>Obs.: {obsResumen}</span>}
        {esquemaResumen && <span title={ot.esquema}>{esquemaResumen}</span>}
      </div>
      {cerrada && (
        <div style={{ fontSize: 11, color: tieneFactura(ot) ? C.verde : '#5B4E8C', fontWeight: 600 }}>
          {tieneFactura(ot) ? `Factura(s): ${(ot.ventas || []).map(v => v.folio).join(', ')}` : 'Sin factura registrada'}
          {ot.fechaCierre ? ` · Cerrada ${ot.fechaCierre}` : ''}
        </div>
      )}
      {verValores && monto > 0 && (
        <div style={{ marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 10.5, color: '#9AA3AD', textTransform: 'uppercase' }}>Venta neta</span>
          <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, color: '#101315' }}>{clp(monto)}</span>
        </div>
      )}
      {verValores && abonoTot > 0 && (
        <div style={{ marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 10.5, color: '#9AA3AD', textTransform: 'uppercase' }}>{saldoPend > 0 ? 'Saldo por facturar/percibir' : saldoPend < 0 ? 'Saldo a favor cliente' : 'Saldo'}</span>
          <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 13, color: saldoPend > 0 ? C.ambar : saldoPend < 0 ? '#5B4E8C' : C.verde }}>{clp(Math.abs(saldoPend))}</span>
        </div>
      )}
    </div>
  )
}

function TarjetaOT({ ot, onUpdate, onDelete, onCambiarEstado, onAgregarVenta, onEliminarVenta, verValores = true, ordenesCompra = [], mo = null, otsAll = [], instrumentos = null, libroCompras = [], enModal = false }) {
  const [abierta, setAbierta] = useState(false)
  const [addVenta, setAddVenta] = useState(false)
  const [addAbono, setAddAbono] = useState(false)
  const [addCosto, setAddCosto] = useState(false)

  const ventaTotal = (ot.ventas || []).reduce((a, v) => a + v.neta, 0)
  const costoOC = costoOCdeOT(ordenesCompra, ot.numero)
  const costoMO = costoMOdeOT(mo, ot.numero)
  const abonoTotal = (ot.abonos || []).reduce((a, x) => a + (x.monto || 0), 0)
  // Saldo real que falta por facturar o percibir: venta neta de la OT (misma
  // fuente única que usan la tarjeta y los KPI) menos lo ya abonado. Si el
  // abono supera la venta, el excedente queda a favor del cliente (negativo).
  const saldoPendiente = ventaNetaDeOT(ot) - abonoTotal
  const costoTotal = (ot.costos || []).reduce((a, c) => a + c.monto, 0) + costoOC + costoMO
  const utilidad = ventaTotal - costoTotal
  const margen = ventaTotal > 0 ? (utilidad / ventaTotal) * 100 : 0
  const precioM2 = ot.m2 > 0 && ventaTotal > 0 ? ventaTotal / ot.m2 : null
  const costoM2 = ot.m2 > 0 && costoTotal > 0 ? costoTotal / ot.m2 : null

  const porCat = CATEGORIAS_COSTO.map(cat => ({ cat, monto: (ot.costos || []).filter(c => c.categoria === cat).reduce((a, c) => a + c.monto, 0) })).filter(x => x.monto > 0)

  return (
    <div style={{ background: '#fff', border: '1px solid #DFE4EA', marginBottom: 14 }}>
      {/* Cabecera */}
      <div onClick={() => { if (!enModal) setAbierta(!abierta) }} style={{ padding: '15px 18px', cursor: enModal ? 'default' : 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 14, background: '#F77716', color: '#fff', padding: '3px 10px', borderRadius: 4, letterSpacing: 0.4 }}>NV {ot.nv || '\u2014'}</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 14, background: C.carbon, color: '#fff', padding: '3px 9px' }}>{ot.numero}</span>
            <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15 }}>{ot.cliente}</span>
            <ChipEstado ot={ot} />
          </div>
          <div style={{ fontSize: 12, color: '#9AA3AD', marginTop: 5, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span><FileText size={11} style={{ verticalAlign: -1 }} /> {ot.cotizacion}{ot.oc && ot.oc !== '—' ? ' · Aprob. cliente ' + ot.oc : ''}</span>
            {ot.m2 > 0 && <span><Ruler size={11} style={{ verticalAlign: -1 }} /> {ot.m2} m²</span>}
            <span><Paintbrush size={11} style={{ verticalAlign: -1 }} /> {ot.esquema}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {verValores && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#9AA3AD', textTransform: 'uppercase' }}>Utilidad real</div>
              <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 17, color: margen >= 30 ? C.verde : margen >= 15 ? C.ambar : C.rojo }}>
                {clp(utilidad)} <span style={{ fontSize: 13 }}>({margen.toFixed(0)}%)</span>
              </div>
            </div>
          )}
          {!enModal && (abierta ? <ChevronUp size={18} color="#9AA3AD" /> : <ChevronDown size={18} color="#9AA3AD" />)}
        </div>
      </div>

      {/* Barra venta vs costo (solo con permiso de valores) */}
      {verValores && (
        <div style={{ padding: '0 18px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9AA3AD', marginBottom: 4 }}>
            <span>Venta {clp(ventaTotal)}</span>
            <span>Costos {clp(costoTotal)}</span>
          </div>
          <Barra pct={ventaTotal > 0 ? (costoTotal / ventaTotal) * 100 : 0} color={margen >= 30 ? C.teal : margen >= 15 ? C.ambar : C.rojo} />
          {(precioM2 || costoM2) && (
            <div style={{ fontSize: 12, color: '#9AA3AD', marginTop: 4 }}>
              {precioM2 && <>Venta: <b>{clp(precioM2)}/m²</b></>}{precioM2 && costoM2 && ' · '}
              {costoM2 && <>Costo: <b>{clp(costoM2)}/m²</b></>}
            </div>
          )}
        </div>
      )}
      {!verValores && <div style={{ padding: '0 18px 14px' }}><span style={{ fontSize: 11.5, color: '#9AA3AD', fontStyle: 'italic' }}>Vista de taller · valores visibles solo para Gerencia.</span></div>}
      {(ot.pinturaCotizada || []).length > 0 && <div style={{ padding: '0 18px 14px' }}><div style={{ fontSize: 11, fontWeight: 700, color: '#101315', textTransform: 'uppercase', marginBottom: 4 }}>Pintura cotizada (tope — no exceder)</div>{ot.pinturaCotizada.map((p, k) => <div key={k} style={{ fontSize: 12.5, color: '#344054' }}>{p.producto}: <b>{p.envases} envase(s)</b> · {Math.round((p.litros || 0) * 10) / 10} L</div>)}</div>}

      {(abierta || enModal) && (
        <div style={{ borderTop: '1px solid #DFE4EA', padding: 18 }}>
          {/* Datos técnicos editables */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 18 }}>
            <label style={{ fontSize: 12, color: '#9AA3AD' }}>Estado OT
              <select value={ot.estado} onChange={e => onCambiarEstado(ot.id, e.target.value)} style={{ ...inp, width: '100%', marginTop: 4 }}>
                {ESTADOS_OT.map(s => <option key={s}>{s}</option>)}
              </select>
              {ot.estado === 'Cerrada' && ot.fechaCierre && <div style={{ fontSize: 11, color: '#9AA3AD', marginTop: 3 }}>Cerrada el {ot.fechaCierre}</div>}
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}><button onClick={() => { if (window.confirm('Marcar esta OT como lista para facturar?')) onCambiarEstado(ot.id, 'Terminada') }} style={{ background: '#F77716', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, width: '100%' }}>Lista para facturar</button></div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>{ot.estado === 'Cerrada' ? <button onClick={() => { if (window.confirm('Reabrir esta OT? Volvera a estado activo (En ejecucion).')) onCambiarEstado(ot.id, 'En ejecución') }} style={{ background: '#12805C', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Unlock size={13} /> Reabrir OT</button> : <button onClick={() => { if (window.confirm('Cerrar esta OT? Pasara al listado de OT cerradas.')) onCambiarEstado(ot.id, 'Cerrada') }} style={{ background: '#191C20', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Lock size={13} /> Cerrar OT</button>}</div>
              <label style={{ fontSize: 12, color: '#9AA3AD' }}>Metros cuadrados
              <input type="number" value={ot.m2} onChange={e => onUpdate(ot.id, { m2: Math.max(0, +e.target.value) })} style={{ ...inp, width: '100%', marginTop: 4 }} />
            </label>
            {verValores && (
              <label style={{ fontSize: 12, color: '#9AA3AD' }}>Monto cotizado (CLP)
                <input value={ot.montoCotizado || ''} onChange={e => onUpdate(ot.id, { montoCotizado: num(e.target.value) })} style={{ ...inp, width: '100%', marginTop: 4 }} />
              </label>
            )}
            <label style={{ fontSize: 12, color: '#9AA3AD' }}>Preparación superficial
              <select value={ot.preparacion} onChange={e => onUpdate(ot.id, { preparacion: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }}>
                {PREPARACIONES.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>

          {/* Esquema de pintura y servicios (visible para todos) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: '#9AA3AD' }}>Esquema de pintura
              <textarea value={ot.esquema === '—' ? '' : (ot.esquema || '')} onChange={e => onUpdate(ot.id, { esquema: e.target.value })} placeholder="Detalle del esquema: preparación, capas, productos, espesores (µm)…" style={{ ...inp, width: '100%', marginTop: 4, minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }} />
            </label>
            <label style={{ fontSize: 12, color: '#9AA3AD' }}>Servicios necesarios / observaciones
              <textarea value={ot.servicios || ''} onChange={e => onUpdate(ot.id, { servicios: e.target.value })} placeholder="Servicios adicionales, requerimientos y notas para el taller…" style={{ ...inp, width: '100%', marginTop: 4, minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }} />
            </label>
          </div>

          {/* RECEPCION - PARTIDAS / ENTREGAS DE MATERIAL */}

        <div style={{ marginTop: 14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <span style={{ fontSize:13, fontWeight:700, textTransform:'uppercase', color:'#D9600A' }}>Recepción / Partidas / entregas de material</span>
            <button onClick={() => onUpdate(ot.id, { partidas: [...(ot.partidas || []), { id: 'pa' + Date.now(), detalle: '', fecha: '', estado: 'Pendiente', m2: '', obs: '', fotos: [] }] })} style={{ background: C.teal, color:'#fff', border:'none', padding:'6px 12px', cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', gap:4 }}><Plus size={14} /> Agregar recepción</button>
          </div>
          {(ot.partidas || []).length === 0 ? (<div style={{ fontSize:12, color:'#9AA3AD', marginBottom:6 }}>Sin registros.</div>) : null}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {(ot.partidas || []).map((p, i) => (
              <div key={p.id || i} style={{ border:'1px solid #DFE4EA', borderRadius:6, padding:10, background:'#FCFBF9' }}>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:8 }}>
                  <span style={{ fontWeight:700, fontSize:12, color:C.carbon }}>#{i + 1}</span>
                  <input value={p.detalle || ''} onChange={e => onUpdate(ot.id, { partidas: (ot.partidas || []).map((x, j) => j === i ? { ...x, detalle: e.target.value } : x) })} placeholder="Detalle del material" style={{ ...inp, flex:'2 1 150px', padding:'6px 8px' }} />
                  <input type="date" value={p.fecha || ''} onChange={e => onUpdate(ot.id, { partidas: (ot.partidas || []).map((x, j) => j === i ? { ...x, fecha: e.target.value } : x) })} style={{ ...inp, flex:'0 1 140px', padding:'6px 8px' }} />
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}><input type="number" value={p.m2 || ''} onChange={e => onUpdate(ot.id, { partidas: (ot.partidas || []).map((x, j) => j === i ? { ...x, m2: e.target.value } : x) })} placeholder="m²" style={{ ...inp, width:72, padding:'6px 8px' }} /><span style={{ fontSize:11, color:'#9AA3AD' }}>m²</span></div>
                  <select value={p.estado || 'Pendiente'} onChange={e => onUpdate(ot.id, { partidas: (ot.partidas || []).map((x, j) => j === i ? { ...x, estado: e.target.value } : x) })} style={{ border:'none', background: p.estado === 'Recibida' ? '#E6F5EA' : '#F5E5DE', color: p.estado === 'Recibida' ? C.verde : '#D9600A', padding:'5px 8px', fontSize:11, fontWeight:700, cursor:'pointer' }}><option>Pendiente</option><option>Recibida</option></select>
                  <button onClick={() => onUpdate(ot.id, { partidas: (ot.partidas || []).filter((_, j) => j !== i) })} style={btnMini}><Trash2 size={13} /></button>
                </div>
                <textarea value={p.obs || ''} onChange={e => onUpdate(ot.id, { partidas: (ot.partidas || []).map((x, j) => j === i ? { ...x, obs: e.target.value } : x) })} placeholder="Observaciones" style={{ ...inp, width:'100%', minHeight:38, padding:'6px 8px', resize:'vertical', boxSizing:'border-box' }} />
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginTop:8 }}>
                  {(p.fotos || []).map((f, k) => (
                    <div key={k} style={{ position:'relative' }}>
                      <img src={f} style={{ width:64, height:64, objectFit:'cover', borderRadius:4, border:'1px solid #DFE4EA' }} />
                      <button onClick={() => onUpdate(ot.id, { partidas: (ot.partidas || []).map((x, j) => j === i ? { ...x, fotos: (x.fotos || []).filter((_, z) => z !== k) } : x) })} style={{ position:'absolute', top:-6, right:-6, background:'#C5453D', color:'#fff', border:'none', borderRadius:'50%', width:18, height:18, fontSize:11, cursor:'pointer', lineHeight:1 }}>×</button>
                    </div>
                  ))}
                  <label style={{ cursor:'pointer', width:64, height:64, border:'1px dashed #C9C4B8', borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:'#B0A89A' }}>+
                    <input type="file" accept="image/*" multiple style={{ display:'none' }} onChange={e => { const fls = [...e.target.files]; if (!fls.length) return; const acc = []; let c = 0; fls.forEach(fl => imgToData(fl, d => { acc.push(d); c++; if (c === fls.length) onUpdate(ot.id, { partidas: (ot.partidas || []).map((x, j) => j === i ? { ...x, fotos: [...(x.fotos || []), ...acc] } : x) }); })); }} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ENTREGAS / DESPACHO SEREIN */}

        <div style={{ marginTop: 14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <span style={{ fontSize:13, fontWeight:700, textTransform:'uppercase', color:'#D9600A' }}>Entregas / Despacho SEREIN</span>
            <button onClick={() => onUpdate(ot.id, { despachos: [...(ot.despachos || []), { id: 'de' + Date.now(), detalle: '', fecha: '', estado: 'Pendiente', m2: '', obs: '', fotos: [] }] })} style={{ background: C.teal, color:'#fff', border:'none', padding:'6px 12px', cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', gap:4 }}><Plus size={14} /> Agregar despacho</button>
          </div>
          <SobrantePanel ot={ot} />
          {(ot.despachos || []).length === 0 ? (<div style={{ fontSize:12, color:'#9AA3AD', marginBottom:6 }}>Sin registros.</div>) : null}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {(ot.despachos || []).map((p, i) => (
              <div key={p.id || i} style={{ border:'1px solid #DFE4EA', borderRadius:6, padding:10, background:'#FCFBF9' }}>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:8 }}>
                  <span style={{ fontWeight:700, fontSize:12, color:C.carbon }}>#{i + 1}</span>
                  <input value={p.detalle || ''} onChange={e => onUpdate(ot.id, { despachos: (ot.despachos || []).map((x, j) => j === i ? { ...x, detalle: e.target.value } : x) })} placeholder="Detalle del material" style={{ ...inp, flex:'2 1 150px', padding:'6px 8px' }} />
                  <input type="date" value={p.fecha || ''} onChange={e => onUpdate(ot.id, { despachos: (ot.despachos || []).map((x, j) => j === i ? { ...x, fecha: e.target.value } : x) })} style={{ ...inp, flex:'0 1 140px', padding:'6px 8px' }} />
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}><input type="number" value={p.m2 || ''} onChange={e => onUpdate(ot.id, { despachos: (ot.despachos || []).map((x, j) => j === i ? { ...x, m2: e.target.value } : x) })} placeholder="m²" style={{ ...inp, width:72, padding:'6px 8px' }} /><span style={{ fontSize:11, color:'#9AA3AD' }}>m²</span></div>
                  <select value={p.estado || 'Pendiente'} onChange={e => onUpdate(ot.id, { despachos: (ot.despachos || []).map((x, j) => j === i ? { ...x, estado: e.target.value } : x) })} style={{ border:'none', background: p.estado === 'Despachada' ? '#E6F5EA' : '#F5E5DE', color: p.estado === 'Despachada' ? C.verde : '#D9600A', padding:'5px 8px', fontSize:11, fontWeight:700, cursor:'pointer' }}><option>Pendiente</option><option>Despachada</option></select>
                  <button onClick={() => onUpdate(ot.id, { despachos: (ot.despachos || []).filter((_, j) => j !== i) })} style={btnMini}><Trash2 size={13} /></button>
                </div>
                <textarea value={p.obs || ''} onChange={e => onUpdate(ot.id, { despachos: (ot.despachos || []).map((x, j) => j === i ? { ...x, obs: e.target.value } : x) })} placeholder="Observaciones" style={{ ...inp, width:'100%', minHeight:38, padding:'6px 8px', resize:'vertical', boxSizing:'border-box' }} />
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginTop:8 }}>
                  {(p.fotos || []).map((f, k) => (
                    <div key={k} style={{ position:'relative' }}>
                      <img src={f} style={{ width:64, height:64, objectFit:'cover', borderRadius:4, border:'1px solid #DFE4EA' }} />
                      <button onClick={() => onUpdate(ot.id, { despachos: (ot.despachos || []).map((x, j) => j === i ? { ...x, fotos: (x.fotos || []).filter((_, z) => z !== k) } : x) })} style={{ position:'absolute', top:-6, right:-6, background:'#C5453D', color:'#fff', border:'none', borderRadius:'50%', width:18, height:18, fontSize:11, cursor:'pointer', lineHeight:1 }}>×</button>
                    </div>
                  ))}
                  <label style={{ cursor:'pointer', width:64, height:64, border:'1px dashed #C9C4B8', borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:'#B0A89A' }}>+
                    <input type="file" accept="image/*" multiple style={{ display:'none' }} onChange={e => { const fls = [...e.target.files]; if (!fls.length) return; const acc = []; let c = 0; fls.forEach(fl => imgToData(fl, d => { acc.push(d); c++; if (c === fls.length) onUpdate(ot.id, { despachos: (ot.despachos || []).map((x, j) => j === i ? { ...x, fotos: [...(x.fotos || []), ...acc] } : x) }); })); }} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RESUMEN M2 REALES / EN PLANTA */}
        {(() => {
          const m2c = parseFloat(ot.m2) || 0;
          const r2 = n => Math.round(n * 100) / 100;
          const m2r = r2((ot.partidas || []).reduce((s, p) => s + (parseFloat(p.m2) || 0), 0));
          const m2d = r2((ot.despachos || []).reduce((s, p) => s + (parseFloat(p.m2) || 0), 0));
          const planta = r2(m2r - m2d);
          const over = m2c > 0 && m2r > m2c;
          return (
            <div style={{ marginTop: 16, display:'flex', gap:12, flexWrap:'wrap' }}>
              <div style={{ flex:'1 1 120px', border:'1px solid #D8DCE5', borderRadius:6, padding:'10px 12px', background:'#F2F4F7' }}><div style={{ fontSize:11, color:'#9AA3AD', textTransform:'uppercase', fontWeight:700 }}>M² cotización</div><div style={{ fontSize:20, fontWeight:700, color:C.carbon }}>{m2c}</div></div>
              <div style={{ flex:'1 1 120px', border:'1px solid ' + (over ? '#C5453D' : '#D8DCE5'), borderRadius:6, padding:'10px 12px', background: over ? '#FDECEC' : '#F2F4F7' }}><div style={{ fontSize:11, color: over ? '#C5453D' : '#9AA3AD', textTransform:'uppercase', fontWeight:700 }}>M² reales</div><div style={{ fontSize:20, fontWeight:700, color: over ? '#C5453D' : C.carbon }}>{m2r}</div>{over ? <div style={{ fontSize:10.5, color:'#C5453D', fontWeight:700, marginTop:2 }}>⚠ Supera lo cotizado (+{r2(m2r - m2c)} m²)</div> : null}</div>
              <div style={{ flex:'1 1 120px', border:'1px solid #D8DCE5', borderRadius:6, padding:'10px 12px', background:'#F2F4F7' }}><div style={{ fontSize:11, color:'#9AA3AD', textTransform:'uppercase', fontWeight:700 }}>M² en planta</div><div style={{ fontSize:20, fontWeight:700, color: planta < 0 ? '#C5453D' : C.carbon }}>{planta}</div></div>
            </div>
          );
        })()}

          {/* ÍTEMS COTIZADOS · AJUSTE DE VENTA POR M² REALES (solo OT que vienen de una cotización aprobada).
              Fuera del gate de verValores a propósito: cargar el m² real medido en
              terreno es una tarea de taller/supervisión, no un dato financiero — solo
              las columnas $/m² y Monto (sí financieras) quedan condicionadas abajo. */}
          {(ot.itemsCot || []).length > 0 && (() => {
            const items = ot.itemsCot || []
            const totalCotizadoOriginal = items.reduce((a, it) => a + Math.max(0, Math.round(numDec(it.cant) * num(it.pUnitario) - num(it.descuento))), 0)
            const totalAjustado = montoTotalItemsReal(items)
            const cambiarM2Real = (i, val) => {
              const nuevosItems = items.map((it, j) => j === i ? { ...it, m2Real: val } : it)
              onUpdate(ot.id, { itemsCot: nuevosItems, montoCotizado: montoTotalItemsReal(nuevosItems) })
            }
            const cols = verValores ? ['Ítem', 'm² cotizados', 'm² reales', '$/m²', 'Monto'] : ['Ítem', 'm² cotizados', 'm² reales']
            return (
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#9AA3AD', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Ruler size={13} /> Ítems cotizados · ajuste de venta por m² reales
                  </span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                      {cols.map((h, i) => (
                        <th key={i} style={{ textAlign: i >= 1 ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: '#9AA3AD', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => {
                      const cot = m2CotizadoItem(it)
                      const real = m2RealItem(it)
                      const sube = real > cot
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #DFE4EA' }}>
                          <td style={{ padding: '7px 8px' }}>{it.detalle || it.descripcion || `Ítem ${i + 1}`}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', color: '#9AA3AD' }}>{cot}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                            <input type="number" step="0.01" placeholder={String(cot)} value={it.m2Real ?? ''} onChange={e => cambiarM2Real(i, e.target.value)}
                              style={{ ...inp, width: 90, textAlign: 'right', padding: '5px 7px', borderColor: sube ? '#C5453D' : '#DFE4EA', color: sube ? '#C5453D' : C.carbon }} />
                          </td>
                          {verValores && (<>
                            <td style={{ padding: '7px 8px', textAlign: 'right', color: '#9AA3AD' }}>{clp(num(it.pUnitario))}</td>
                            <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 500 }}>{clp(montoItemReal(it))}</td>
                          </>)}
                        </tr>
                      )
                    })}
                  </tbody>
                  {verValores && (
                    <tfoot>
                      <tr>
                        <td colSpan={4} style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>Venta según m² reales</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: totalAjustado !== totalCotizadoOriginal ? '#D9600A' : C.carbon }}>{clp(totalAjustado)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
                {verValores && totalAjustado !== totalCotizadoOriginal && <div style={{ fontSize: 11.5, color: '#9AA3AD', marginTop: 4 }}>Cotizado originalmente: {clp(totalCotizadoOriginal)} · el monto cotizado de la OT ya quedó actualizado a {clp(totalAjustado)}.</div>}
              </div>
            )
          })()}

          {verValores && (
            <>
              {/* VENTAS */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#9AA3AD', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Receipt size={13} /> Ventas facturadas
                </span>
                <button onClick={() => setAddVenta(true)} style={{ background: C.azul, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Plus size={13} /> Agregar venta
                </button>
              </div>
              {(ot.ventas || []).length === 0 ? (
                <div style={{ fontSize: 13, color: '#9AA3AD' }}>Aún sin facturar.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                      {['Folio', 'Fecha', 'Neta', 'IVA', 'Total', 'Pago', ''].map((h, i) => (
                        <th key={i} style={{ textAlign: ['Neta', 'IVA', 'Total'].includes(h) ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: '#9AA3AD', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(ot.ventas || []).map((v, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #DFE4EA' }}>
                        <td style={{ padding: '7px 8px', fontWeight: 500 }}>{v.folio}</td>
                        <td style={{ padding: '7px 8px', color: '#9AA3AD' }}>{v.fecha}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right' }}>{clp(v.neta)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#9AA3AD' }}>{clp(v.neta * 0.19)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 500 }}>{clp(v.neta * 1.19)}</td>
                        <td style={{ padding: '7px 8px' }}>
                          <select value={v.estadoPago}
                            onChange={ev => onUpdate(ot.id, { ventas: (ot.ventas || []).map((x, j) => j === i ? { ...x, estadoPago: ev.target.value } : x) })}
                            style={{ border: 'none', background: v.estadoPago === 'Pagado' ? '#E7F2EA' : v.estadoPago === 'Factoring' ? '#F9E9DE' : '#F6E0DA', color: v.estadoPago === 'Pagado' ? C.verde : v.estadoPago === 'Factoring' ? C.ambar : C.rojo, padding: '3px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            <option>Pendiente</option><option>Pagado</option><option>Factoring</option>
                          </select>
                        </td>
                        <td style={{ padding: '7px 4px', textAlign: 'right' }}>
                          <button onClick={() => window.confirm(`¿Eliminar factura ${v.folio} (${clp(v.neta)})?`) && onEliminarVenta(ot.id, i)} style={btnMini}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {addVenta && <FormVenta onAdd={async v => { const ok = await onAgregarVenta(ot.id, v); if (ok) setAddVenta(false) }} onCancel={() => setAddVenta(false)} abonoTotal={abonoTotal} ventaTotalActual={ventaTotal} />}

              {/* ABONOS DE CLIENTES (pagos anticipados, sin IVA) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '18px 0 8px' }}>
                <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#9AA3AD', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <CircleDollarSign size={13} /> Abonos de clientes
                </span>
                <button onClick={() => setAddAbono(true)} style={{ background: C.verde, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Plus size={13} /> Agregar abono
                </button>
              </div>
              {(ot.abonos || []).length === 0 ? (
                <div style={{ fontSize: 13, color: '#9AA3AD' }}>Sin abonos registrados.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                      {['Fecha', 'Monto', 'Medio de pago', 'Observación', ''].map((h, i) => (
                        <th key={i} style={{ textAlign: h === 'Monto' ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: '#9AA3AD', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(ot.abonos || []).map((x, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #DFE4EA' }}>
                        <td style={{ padding: '7px 8px', color: '#9AA3AD' }}>{x.fecha}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 500 }}>{clp(x.monto)}</td>
                        <td style={{ padding: '7px 8px' }}>{x.medio || '—'}</td>
                        <td style={{ padding: '7px 8px', color: '#9AA3AD' }}>{x.obs || '—'}</td>
                        <td style={{ padding: '7px 4px', textAlign: 'right' }}>
                          <button onClick={() => window.confirm(`¿Eliminar abono de ${clp(x.monto)} del ${x.fecha}?`) && onUpdate(ot.id, { abonos: (ot.abonos || []).filter((_, j) => j !== i) })} style={btnMini}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr><td colSpan={4} style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>Total abonado</td><td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: C.verde }}>{clp(abonoTotal)}</td></tr>
                  </tbody>
                </table>
              )}
              {addAbono && <FormAbono onAdd={x => { onUpdate(ot.id, { abonos: [...(ot.abonos || []), x] }); setAddAbono(false) }} onCancel={() => setAddAbono(false)} />}

              {verValores && (libroCompras || []).some(l => l.ot_id === ot.numero) ? (() => { const cs = (libroCompras || []).filter(l => l.ot_id === ot.numero); const sub = cs.reduce((a, l) => a + (Number(l.neto) || 0), 0); return (<div style={{ marginTop: 14, border: '1px solid #D8DCE5', borderRadius: 6, padding: 10, background: '#F2F4F7' }}><div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#101315', marginBottom: 6 }}>Compras del libro de compras (SII) asignadas</div><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><tbody>{cs.map((l, i) => (<tr key={i} style={{ borderBottom: '1px solid #E7E4DC' }}><td style={{ padding: '4px 6px', color: '#9AA3AD', whiteSpace: 'nowrap' }}>{l.emission_date}</td><td style={{ padding: '4px 6px' }}>{l.provider_name}</td><td style={{ padding: '4px 6px', color: '#9AA3AD' }}>Folio {l.document_number}</td><td style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>{clp(l.neto)}</td></tr>))}</tbody></table><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}><span style={{ fontSize: 11, color: '#9AA3AD' }}>Subtotal neto (informativo, aun no sumado a la utilidad)</span><span style={{ fontWeight: 700, color: '#101315' }}>{clp(sub)}</span></div></div>); })() : null}

          {/* COSTOS */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '18px 0 8px' }}>
                <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#9AA3AD', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <ShoppingCart size={13} /> Compras y costos de la OT
                </span>
                <button onClick={() => setAddCosto(true)} style={{ background: C.teal, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Plus size={13} /> Agregar costo
                </button>
              </div>
              {(ot.costos || []).length === 0 ? (
                <div style={{ fontSize: 13, color: '#9AA3AD' }}>Sin costos registrados — la utilidad mostrada es bruta.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                      {['Categoría', 'Detalle', 'Monto', ''].map((h, i) => (
                        <th key={i} style={{ textAlign: h === 'Monto' ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: '#9AA3AD', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(ot.costos || []).map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #DFE4EA' }}>
                        <td style={{ padding: '7px 8px', fontWeight: 500 }}>{c.categoria}</td>
                        <td style={{ padding: '7px 8px', color: '#9AA3AD' }}>{c.detalle || '—'}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right' }}>{clp(c.monto)}</td>
                        <td style={{ padding: '7px 4px', textAlign: 'right' }}>
                          <button onClick={() => window.confirm(`¿Eliminar costo ${c.categoria} (${clp(c.monto)})?`) && onUpdate(ot.id, { costos: (ot.costos || []).filter((_, j) => j !== i) })} style={btnMini}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {addCosto && <FormCosto onAdd={c => { onUpdate(ot.id, { costos: [...(ot.costos || []), c] }); setAddCosto(false) }} onCancel={() => setAddCosto(false)} />}

              {porCat.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: '#9AA3AD', textTransform: 'uppercase', marginBottom: 6 }}>Estructura de costos</div>
                  {porCat.map(x => (
                    <div key={x.cat} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, width: 130, color: C.carbon }}>{x.cat}</span>
                      <div style={{ flex: 1 }}><Barra pct={(x.monto / costoTotal) * 100} color={C.teal} alto={6} /></div>
                      <span style={{ fontSize: 12, color: '#9AA3AD', width: 90, textAlign: 'right' }}>{clp(x.monto)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 16, padding: '12px 14px', background: '#F2F4F7', fontSize: 13, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                <CircleDollarSign size={16} color={margen >= 30 ? C.verde : C.ambar} />
                <span>Venta neta: <b>{clp(ventaTotal)}</b></span>
                {abonoTotal > 0 && <span>Abonado: <b style={{ color: C.verde }}>{clp(abonoTotal)}</b></span>}
                {abonoTotal > 0 && (
                  saldoPendiente > 0
                    ? <span>Saldo pendiente por facturar/percibir: <b style={{ color: C.ambar }}>{clp(saldoPendiente)}</b></span>
                    : saldoPendiente < 0
                      ? <span>Saldo a favor del cliente: <b style={{ color: '#5B4E8C' }}>{clp(-saldoPendiente)}</b></span>
                      : <span>Saldo pendiente: <b style={{ color: C.verde }}>$0</b></span>
                )}
                <span>Costos: <b>{clp(costoTotal)}</b></span>{costoMO > 0 && <span style={{ color: '#9AA3AD' }}>(incluye {clp(costoMO)} de mano de obra)</span>}
                {costoOC > 0 && <span style={{ color: C.teal }}>(incluye {clp(costoOC)} de OC proveedores)</span>}
                <span>Utilidad real: <b style={{ color: margen >= 30 ? C.verde : margen >= 15 ? C.ambar : C.rojo }}>{clp(utilidad)} ({margen.toFixed(1)}%)</b></span>
              </div>
            </>
          )}

          <div style={{ marginTop: 14, borderTop: '1px dashed #DFE4EA', paddingTop: 12 }}>
            <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 13, textTransform: 'uppercase', marginBottom: 8 }}>Datos del encargado</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8 }}>
              <div><div style={{ fontSize: 11, color: '#9AA3AD', marginBottom: 2 }}>Nombre encargo</div><input style={{ padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, width: '100%', boxSizing: 'border-box' }} value={ot.nombreEncargo || ''} onChange={e => onUpdate(ot.id, { nombreEncargo: e.target.value })} /></div>
              <div><div style={{ fontSize: 11, color: '#9AA3AD', marginBottom: 2 }}>Correo</div><input style={{ padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, width: '100%', boxSizing: 'border-box' }} value={ot.correo || ''} onChange={e => onUpdate(ot.id, { correo: e.target.value })} /></div>
              <div><div style={{ fontSize: 11, color: '#9AA3AD', marginBottom: 2 }}>Telefono</div><input style={{ padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, width: '100%', boxSizing: 'border-box' }} value={ot.telefono || ''} onChange={e => onUpdate(ot.id, { telefono: e.target.value })} /></div>
              <div><div style={{ fontSize: 11, color: '#9AA3AD', marginBottom: 2 }}>NV (Nota de Venta)</div><input style={{ padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, width: '100%', boxSizing: 'border-box' }} value={ot.nv || ''} onChange={e => onUpdate(ot.id, { nv: e.target.value })} /></div>
              {(ot.area === 'Santa Rosa' || ot.sede === 'Santa Rosa') && <div><div style={{ fontSize: 11, color: '#F77716', fontWeight: 700, marginBottom: 2 }}>OC (Orden de compra)</div><input placeholder="Ej. 4500123456" style={{ padding: '6px 8px', border: '2px solid #F77716', fontSize: 12.5, fontWeight: 700, width: '100%', boxSizing: 'border-box' }} value={ot.oc && ot.oc !== '\u2014' ? ot.oc : ''} onChange={e => onUpdate(ot.id, { oc: e.target.value })} /></div>}
            </div>
          </div>
          <ProtocolosOT ot={ot} onUpdate={onUpdate} otsAll={otsAll} instrumentos={instrumentos} />
          <FotosOT ot={ot} onUpdate={onUpdate} />

          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => descargarOTDesdeOT(ot)}
              style={{ background: C.azul, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Download size={13} /> Descargar OT (PDF)
            </button>
            {verValores && (
              <button onClick={() => descargarOT(ot)}
                style={{ background: C.carbon, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Download size={13} /> Descargar OT (Excel)
              </button>
            )}
            <button onClick={() => window.confirm(`¿Eliminar la ${ot.numero} completa?`) && onDelete(ot.id)}
              style={{ background: 'none', border: `1px solid ${C.rojo}`, color: C.rojo, padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Trash2 size={13} /> Eliminar OT
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Formulario nueva OT ----------
function FormOT({ area, siguienteNumero, clientesActivos = [], onAdd, onCancel }) {
  const [f, setF] = useState({ cliente: '', cotizacion: '', oc: '', m2: '', montoCotizado: '', preparacion: PREPARACIONES[2], esquema: '', nombreEncargo: '', correo: '', telefono: '', nv: '' })
  return (
    <div style={{ background: '#fff', border: `2px solid ${C.azul}`, padding: 16, marginBottom: 14 }}>
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>
        Nueva OT · {area} <span style={{ fontFamily: "'JetBrains Mono',monospace", background: C.carbon, color: '#fff', padding: '2px 8px', marginLeft: 8 }}>{siguienteNumero}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        <input style={inp} list="dl-ot-cliente" placeholder="Cliente *" value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} />
        <datalist id="dl-ot-cliente">{clientesActivos.map(n => <option key={n} value={n} />)}</datalist>
        <input style={inp} placeholder="Nombre encargo" value={f.nombreEncargo} onChange={e => setF({ ...f, nombreEncargo: e.target.value })} />
        <input style={inp} placeholder="Correo" value={f.correo} onChange={e => setF({ ...f, correo: e.target.value })} />
        <input style={inp} placeholder="Telefono" value={f.telefono} onChange={e => setF({ ...f, telefono: e.target.value })} />
        <input style={inp} placeholder="NV (Nota de Venta)" value={f.nv} onChange={e => setF({ ...f, nv: e.target.value })} />
        <input style={inp} placeholder="Cotización" value={f.cotizacion} onChange={e => setF({ ...f, cotizacion: e.target.value })} />
        <input style={inp} placeholder="Respaldo aprobación cliente (opcional)" value={f.oc} onChange={e => setF({ ...f, oc: e.target.value })} />
        <input style={inp} placeholder="Metros cuadrados" value={f.m2} onChange={e => setF({ ...f, m2: e.target.value })} />
        <input style={inp} placeholder="Monto cotizado CLP" value={f.montoCotizado} onChange={e => setF({ ...f, montoCotizado: e.target.value })} />
        <select style={inp} value={f.preparacion} onChange={e => setF({ ...f, preparacion: e.target.value })}>
          {PREPARACIONES.map(p => <option key={p}>{p}</option>)}
        </select>
        <input style={inp} placeholder="Esquema de pintura" value={f.esquema} onChange={e => setF({ ...f, esquema: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => f.cliente && onAdd({
          id: 'ot' + Date.now(), numero: siguienteNumero, area, fecha: new Date().toISOString().slice(0, 10), nombreEncargo: f.nombreEncargo, correo: f.correo, telefono: f.telefono, nv: f.nv,
          cliente: f.cliente, cotizacion: f.cotizacion || '—', oc: f.oc || '—',
          m2: num(f.m2), montoCotizado: num(f.montoCotizado), preparacion: f.preparacion, esquema: f.esquema || '—',
          estado: 'Cotizada', ventas: [], costos: [],
        })} style={{ background: C.verde, color: '#fff', border: 'none', padding: '8px 18px', cursor: 'pointer', fontSize: 13 }}>Crear OT</button>
        <button onClick={onCancel} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
      </div>
    </div>
  )
}

// ---------- Módulo principal ----------
// ================= PROTOCOLOS DE CALIDAD (PIG / PGP) =================
const PROT_BASE = 144
const nextCorrelativoProt = otsAll => { let mx = PROT_BASE; (otsAll || []).forEach(o => (o.protocolos || []).forEach(p => { if (p.correlativo > mx) mx = p.correlativo })); return mx + 1 }
const parseRango = s => { const m = (String(s || '').replace(',', '.').match(/\d+(\.\d+)?/g) || []).map(Number); if (m.length >= 2) return [Math.min(m[0], m[1]), Math.max(m[0], m[1])]; if (m.length === 1) return [m[0], m[0]]; return [2, 2.5] }
const promArr = arr => { const v = (arr || []).map(x => parseFloat(String(x).replace(',', '.'))).filter(x => !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0 }
const acumRango = (capas, idx) => { var accMin = 0, accMax = 0; for (var i = 0; i <= idx; i++) { var r = parseRango(capas[i].solicitado); if (i === 0) { accMin = r[0]; accMax = r[1] } else { var pm = accMax; accMin = pm + r[0]; accMax = pm + r[1] } } return [accMin, accMax] }
const autoFila = (vals, lo, hi) => { const n = vals.length; const idxE = []; const entered = []; vals.forEach((v, i) => { if (v === '' || v == null) idxE.push(i); else { const nn = parseFloat(String(v).replace(',', '.')); if (!isNaN(nn)) entered.push(nn) } }); if (idxE.length === 0) return vals.slice(); const desired = lo + Math.random() * ((hi - lo) + 0.6); const sumE = entered.reduce((a, b) => a + b, 0); const meanEmpty = (desired * n - sumE) / idxE.length; const res = vals.slice(); idxE.forEach(i => { let val = meanEmpty + (Math.random() * 1.6 - 0.7); val = Math.max(lo - 1, Math.min(hi + 1.8, val)); res[i] = (Math.round(val * 100) / 100).toFixed(2) }); return res }
const FOTO_W = 800, FOTO_H = 600
const imgToData = (file, cb) => { const r = new FileReader(); r.onload = e => { const img = new Image(); img.onload = () => { var max = 1200; var w = img.width, h = img.height; if (w > h && w > max) { h = Math.round(h * max / w); w = max } else if (h >= w && h > max) { w = Math.round(w * max / h); h = max } const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); cb(cv.toDataURL('image/jpeg', 0.78)) }; img.src = e.target.result }; r.readAsDataURL(file) }
const nuevaCapa = nombre => ({ id: 'cap' + Date.now() + Math.floor(Math.random() * 999), nombre: nombre || 'Capa', producto: 'REZINC', solicitado: '2 a 3 Mils', filas: [['', '', '', '', '', '', ''], ['', '', '', '', '', '', ''], ['', '', '', '', '', '', ''], ['', '', '', '', '', '', ''], ['', '', '', '', '', '', '']], fotos: [] })
function nuevoProtocolo(tipo, ot, correlativo, instrumentos) {
  const cod = correlativo + '-' + new Date().getFullYear(); const h = new Date().toISOString().slice(0, 10)
  const base = { id: 'pr' + Date.now() + Math.floor(Math.random() * 999), tipo, correlativo, codigo: tipo + ' ' + cod, pgpCodigo: 'PGP ' + cod, docNro: tipo === 'PIG' ? 'RC-GP-1' : 'RC-PG-6', ot: ot.numero || '', area: ot.area || '', oc: ot.oc || '', nv: ot.nv || '', cliente: ot.cliente || '', proyecto: '', preparadoPor: 'Boris Gomez', revisadoPor: 'Luis Soto', aprobadoPor: 'Luis Soto', fecha: h, firmas: [{ rol: 'Aprobado', quien: 'Tecnico Pintura', fecha: '' }, { rol: 'Recepcionado', quien: 'Cliente', fecha: '' }, { rol: 'Aprobado', quien: 'Inspector Cliente', fecha: '' }] }
  if (tipo === 'PIG') { return Object.assign(base, { descripcion: 'Proceso de inicio de granallado para pintura.', checks: [{ nombre: 'Control aire presurizado norma ASTM D4285', cumple: 'SI', obs: 'Sin presencia de humedad u otros contaminantes.', fotos: [] }, { nombre: 'Verificacion limpieza de granalla ASTM D7393', cumple: 'SI', obs: 'Sin presencia de sales, aceites u otros contaminantes.', fotos: [] }, { nombre: 'Inspeccion visual pieza granallada', cumple: 'SI', obs: '', fotos: [] }, { nombre: 'Medicion perfil de rugosidad norma ASTM D4417', cumple: 'SI', obs: '', fotos: [] }], limpiezaSSPC: 'SP10', perfilSolicitado: '1 a 3 mils', medidas: ['', '', ''], perfilObtenido: '', perfilCumple: 'SI', amb: { fecha: h, humedad: '', tAmbiente: '', tPieza: '', ptoRocio: '', horaInicio: '' }, fotosGranalla: [] }) }
  var dfI = { espMarca: 'ELCOMETER', espSerie: 'MH11472', rugMarca: 'ELCOMETER', rugSerie: 'NE30319', termoMarca: 'ELCOMETER', termoSerie: 'KCA721' }; var inS = instrumentos || {}; const instr = { espMarca: inS.espMarca || dfI.espMarca, espSerie: inS.espSerie || dfI.espSerie, rugMarca: inS.rugMarca || dfI.rugMarca, rugSerie: inS.rugSerie || dfI.rugSerie, termoMarca: inS.termoMarca || dfI.termoMarca, termoSerie: inS.termoSerie || dfI.termoSerie }
  return Object.assign(base, { instr, amb: { fecha: h, humedad: '', tAmbiente: '', tPieza: '', ptoRocio: '', horaInicio: '' }, limpiezaSSPC: 'sspc-sP 10', perfilSolicitado: '2 a 2,5 Mils', perfilFilas: [['', '', '', '', ''], ['', '', '', '', ''], ['', '', '', '', ''], ['', '', '', '', '']], capas: [nuevaCapa('Primera capa')], fotosGranalla: [] })
}
function fotosHTML(fotos) { var s = ''; (fotos || []).forEach(function (d) { s += '<img src="' + d + '" style="width:32%;margin:0.5%;border:1px solid #999" />' }); return s }
function filasHTML(filas) { var s = ''; for (var i = 0; i < filas.length; i++) { var pr = promArr(filas[i]); s += '<tr><td class="c">' + (i + 1) + '</td>'; for (var j = 0; j < filas[i].length; j++) s += '<td class="c">' + (filas[i][j] || '') + '</td>'; s += '<td class="c"><b>' + (pr ? pr.toFixed(2) : '') + '</b></td></tr>' } return s }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function rptLogo() { var _l=''; try { _l = localStorage.getItem('serein_logo') || '' } catch(e){} if (_l) return '<img src="' + _l + '" style="height:44px;display:block" alt="SEREIN"/>'; return '<div class="logo"><span class="lg-a">SEREIN</span><span class="lg-b">GROUP</span></div>' }
function statusBadge(v) { return v === 'SI' ? '<span class="badge badge-ok">&#10003; SI</span>' : (v === 'NO' ? '<span class="badge badge-no">&#10007; NO</span>' : esc(v)) }
function rptHeader(titulo, sub, rows) { if (typeof window !== 'undefined' && window.__sereinProtoIstria && sub === 'SEREIN GROUP') sub = ''; var d = ''; rows.forEach(function (r) { d += '<div class="cb-row"><span class="cb-k">' + r[0] + '</span><span class="cb-v">' + esc(r[1]) + '</span></div>' }); return '<div class="rhead"><div class="stripe"></div>' + rptLogo() + '<div class="rh-mid"><div class="rh-title">' + titulo + '</div><div class="rh-sub">' + sub + '</div></div><div class="codebox">' + d + '</div></div>' }
function rptInfo(pairs) { var s = '<div class="infogrid">'; pairs.forEach(function (pr) { s += '<div class="info-item"><span class="info-k">' + pr[0] + '</span><span class="info-v">' + esc(pr[1]) + '</span></div>' }); return s + '</div>' }
function rptSection(t) { return '<div class="sec-title">' + t + '</div>' }
function rptTable(headers, rows) { var h = ''; for (var i = 0; i < headers.length; i++) h += '<th>' + headers[i] + '</th>'; var b = ''; for (var r = 0; r < rows.length; r++) { b += '<tr>'; for (var c = 0; c < rows[r].length; c++) b += '<td>' + rows[r][c] + '</td>'; b += '</tr>' } return '<table class="dt"><thead><tr>' + h + '</tr></thead><tbody>' + b + '</tbody></table>' }
function rptImageGrid(fotos) { var imgs = fotos || []; var g = imgs.length === 1 ? 'g1' : (imgs.length === 2 ? 'g2' : (imgs.length === 3 ? 'g3' : 'g4')); var ig = ''; for (var i = 0; i < imgs.length; i++) ig += '<div class="imgframe"><img src="' + imgs[i] + '"/></div>'; return '<div class="ev-right ' + g + '">' + ig + '</div>' }
function rptEvidence(num, titulo, obs, fotos) { return '<div class="evcard"><div class="ev-left"><div class="ev-title">EVIDENCIA ' + num + ':</div><div class="ev-desc">' + esc(titulo) + '</div>' + (obs ? '<div class="ev-obs"><b>OBS.:</b> ' + esc(obs) + '</div>' : '') + '</div>' + rptImageGrid(fotos) + '</div>' }
function rptSign(firmas) { var r = ''; (firmas || []).forEach(function (f) { r += '<tr><td>' + esc(f.rol) + '</td><td>' + esc(f.quien) + '</td><td class="sign-cell"></td><td>' + esc(f.fecha) + '</td></tr>' }); return '<table class="dt"><thead><tr><th>Rol</th><th>Nombre</th><th>Firma</th><th>Fecha</th></tr></thead><tbody>' + r + '</tbody></table>' }
function rptFooter() { return '<div class="rfooter"><div class="rf-navy"><span>Compromiso con la calidad</span><span>Seguridad en cada proceso</span><span>Excelencia en resultados</span></div>' + ((typeof window !== 'undefined' && window.__sereinProtoIstria) ? '' : '<div class="rf-web">www.sereingroup.cl</div>') + '</div>' }
function tablaMedHTML(filas) { var nc = (filas && filas[0] ? filas[0].length : 5); var th = ['Item']; for (var a = 1; a <= nc; a++) th.push('' + a); th.push('Prom.'); var rows = []; for (var i = 0; i < filas.length; i++) { var f = filas[i]; var row = ['' + (i + 1)]; for (var j = 0; j < f.length; j++) row.push(esc(f[j] || '')); var pr = promArr(f); row.push('<span class="prom-badge">' + (pr ? pr.toFixed(2) : '') + '</span>'); rows.push(row) } return rptTable(th, rows) }
function rptEquipos(eq) { eq = eq || {}; var cols = [['Medidor de espesor', eq.espMarca || 'ELCOMETER', eq.espSerie || '', eq.espFotos || []], ['Rugosimetro', eq.rugMarca || 'ELCOMETER', eq.rugSerie || '', eq.rugFotos || []], ['Termohigrometro', eq.termoMarca || 'ELCOMETER', eq.termoSerie || '', eq.termoFotos || []]]; var s = '<div class="equipos">'; cols.forEach(function (c) { var ig = ''; (c[3] || []).forEach(function (d) { ig += '<div class="eq-img"><img src="' + d + '"/></div>' }); s += '<div class="eq-col"><div class="eq-name">' + esc(c[1]) + '</div><div class="eq-code">' + esc(c[2]) + '</div><div class="eq-sub">' + esc(c[0]) + '</div>' + ig + '</div>' }); return s + '</div>' }
function htmlPIG(p, equipos) {
  var prom = promArr(p.medidas); var promTxt = prom ? prom.toFixed(2) : '';
  var info = [['Orden de Trabajo', p.ot], ['Cliente', p.cliente], ['Proyecto', p.proyecto], ['Protoc. Granallado', p.pgpCodigo], ['Protoc. Pintura', p.pgpCodigo], ['Preparado por', p.preparadoPor], ['Revisado por', p.revisadoPor], ['Aprobado por', p.aprobadoPor], ['Fecha', p.fecha], ['NV', p.nv]];
  var chkRows = []; for (var i = 0; i < p.checks.length; i++) { var c = p.checks[i]; chkRows.push(['' + (i + 1), esc(c.nombre), statusBadge(c.cumple), esc(c.obs)]) }
  var perfil = rptTable(['Parametro', 'Valor', 'Parametro', 'Valor'], [['Limpieza superficial SSPC-SP', esc(p.limpiezaSSPC), 'Perfil de anclaje', esc(p.perfilSolicitado)], ['Medidas rugosidad', esc((p.medidas || []).join('  -  ')), 'Promedio', promTxt], ['Perfil obtenido', esc(p.perfilObtenido || promTxt), 'Cumple', statusBadge(p.perfilCumple)]]);
  var amb = rptTable(['Parametro', 'Valor', 'Parametro', 'Valor'], [['Fecha', esc(p.amb.fecha), '% Humedad', esc(p.amb.humedad)], ['T. Ambiente C', esc(p.amb.tAmbiente), 'C Pieza', esc(p.amb.tPieza)], ['Pto. Rocio', esc(p.amb.ptoRocio), 'Hora inicio', esc(p.amb.horaInicio)]].concat((p.ambExtra || []).map(function (c) { return [esc(c.label), esc(c.valor), '', ''] })));
  var page1 = '<div class="page">' + rptHeader('PROTOCOLO INICIO DE GRANALLA', 'SEREIN GROUP', [['Codigo', p.codigo || ''], ['Documento N', p.docNro || '']]) + rptInfo(info) + ((p.descripcion || p.esquemaProyecto) ? rptSection('Descripcion y esquema del proyecto') + '<div style="font-size:11px;color:#101828;line-height:1.55;margin:2px 0 12px">' + (p.descripcion ? '<b>Descripcion:</b> ' + esc(p.descripcion) + '<br>' : '') + (p.esquemaProyecto ? '<b>Esquema del proyecto:</b> ' + esc(p.esquemaProyecto) : '') + '</div>' : '') + rptSection('1. Analisis proceso de granallado') + rptTable(['N', 'Control', 'Cumple', 'Observacion'], chkRows) + rptSection('2. Inspeccion de perfil') + perfil + rptSection('3. Condiciones ambientales') + amb + rptSection('4. Firmas') + rptSign(p.firmas) + rptFooter() + '</div>';
  var evChecks = (p.checks || []).filter(function (c) { return c.fotos && c.fotos.length }); var ev = ''; var en = 0; evChecks.forEach(function (c) { en++; ev += rptEvidence(en, c.nombre, c.obs, c.fotos) });
  var info2 = [['Preparado por', p.preparadoPor], ['Revisado por', p.revisadoPor], ['Aprobado por', p.aprobadoPor], ['Cliente', p.cliente], ['Proyecto', p.proyecto], ['Prot. Granallado', p.pgpCodigo], ['Prot. Pintura', p.pgpCodigo], ['Fecha', p.fecha]];
  var page2 = ''; if (evChecks.length) page2 = '<div class="page">' + rptHeader('PROTOCOLO INICIO DE GRANALLA', 'ANEXO IMAGENES EVIDENCIA', [['Documento N', p.docNro || ''], ['Orden de Trabajo', p.ot || ''], ['Pagina', '2/2']]) + rptInfo(info2) + rptSection('Anexo imagenes evidencia') + ev + rptSection('Firmas') + rptSign(p.firmas) + rptFooter() + '</div>';
  var pageEq = '<div class="page">' + rptHeader('PROTOCOLO INICIO DE GRANALLA', 'EQUIPOS DE MEDICION', [['Documento N', p.docNro || ''], ['Orden de Trabajo', p.ot || '']]) + rptSection('Equipos de medicion') + rptEquipos(equipos) + rptFooter() + '</div>'; return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(p.codigo || 'PIG') + '</title><style>' + PROTO_CSS + '</style></head><body>' + page1 + page2 + pageEq + '</body></html>';
}
function htmlPGP(p, equipos) {
  var pp = (p.perfilFilas || []).map(function (f) { return promArr(f) }); var perfObt = pp.length ? (pp.reduce(function (a, b) { return a + b }, 0) / pp.length) : 0;
  var info = [['Orden de Trabajo', p.ot], ['Cliente', p.cliente], ['Proyecto', p.proyecto], ['Prot. Granallado', p.pgpCodigo], ['Prot. Pintura', p.pgpCodigo], ['Preparado por', p.preparadoPor], ['Revisado por', p.revisadoPor], ['Aprobado por', p.aprobadoPor], ['Fecha', p.fecha], ['NV', p.nv]];
  var instr = rptTable(['Instrumento', 'Marca / Serie', 'Instrumento', 'Marca / Serie'], [['Medidor de espesor', esc((p.instr.espMarca || '') + '  /  ' + (p.instr.espSerie || '')), 'Rugosimetro', esc((p.instr.rugMarca || '') + '  /  ' + (p.instr.rugSerie || ''))], ['Termohigrometro', esc((p.instr.termoMarca || '') + '  /  ' + (p.instr.termoSerie || '')), '', '']]);
  var amb = rptTable(['Parametro', 'Valor', 'Parametro', 'Valor'], [['Fecha', esc(p.amb.fecha), '% Humedad', esc(p.amb.humedad)], ['T. Ambiente C', esc(p.amb.tAmbiente), 'C Pieza', esc(p.amb.tPieza)], ['Pto. Rocio', esc(p.amb.ptoRocio), 'Hora inicio', esc(p.amb.horaInicio)]].concat((p.ambExtra || []).map(function (c) { return [esc(c.label), esc(c.valor), '', ''] })));
  var perfTbl = tablaMedHTML(p.perfilFilas || []);
  var capasHtml = ''; (p.capas || []).forEach(function (cap, ci) { var cp = (cap.filas || []).map(function (f) { return promArr(f) }); var cprom = cp.length ? (cp.reduce(function (a, b) { return a + b }, 0) / cp.length) : 0; var ac = acumRango(p.capas, ci); capasHtml += rptSection('Esquema: ' + esc(cap.nombre || 'Capa') + '  -  ' + esc(cap.producto || '') + '  (Solicitado acum. ' + ac[0] + ' a ' + ac[1] + ' mils  /  Promedio ' + (cprom ? cprom.toFixed(2) : '') + ')') + tablaMedHTML(cap.filas || []) });
  var page1 = '<div class="page">' + rptHeader('PROTOCOLO GRANALLADO Y PINTURA', 'SEREIN GROUP', [['Codigo', p.codigo || ''], ['Documento N', p.docNro || '']]) + rptInfo(info) + ((p.descripcion || p.esquemaProyecto) ? rptSection('Descripcion y esquema del proyecto') + '<div style="font-size:11px;color:#101828;line-height:1.55;margin:2px 0 12px">' + (p.descripcion ? '<b>Descripcion:</b> ' + esc(p.descripcion) + '<br>' : '') + (p.esquemaProyecto ? '<b>Esquema del proyecto:</b> ' + esc(p.esquemaProyecto) : '') + '</div>' : '') + rptSection('1. Instrumentos utilizados') + instr + rptSection('2. Condiciones ambientales') + amb + rptSection('3. Perfil de rugosidad (Limpieza ' + esc(p.limpiezaSSPC || '') + '  /  Solicitado ' + esc(p.perfilSolicitado || '') + '  /  Obtenido ' + (perfObt ? perfObt.toFixed(2) : '') + ')') + perfTbl + capasHtml + rptSection('Firmas') + rptSign(p.firmas) + rptFooter() + '</div>';
  var ev = ''; var en = 0; if ((p.fotosGranalla || []).length) { en++; ev += rptEvidence(en, 'Evidencia granallado', '', p.fotosGranalla) } (p.capas || []).forEach(function (cap) { if ((cap.fotos || []).length) { en++; ev += rptEvidence(en, esc(cap.nombre || 'Capa'), '', cap.fotos) } });
  var info2 = [['Preparado por', p.preparadoPor], ['Revisado por', p.revisadoPor], ['Aprobado por', p.aprobadoPor], ['Cliente', p.cliente], ['Proyecto', p.proyecto], ['Prot. Granallado', p.pgpCodigo], ['Prot. Pintura', p.pgpCodigo], ['Fecha', p.fecha]];
  var page2 = ''; if (en) page2 = '<div class="page">' + rptHeader('PROTOCOLO GRANALLADO Y PINTURA', 'ANEXO IMAGENES EVIDENCIA', [['Documento N', p.docNro || ''], ['Orden de Trabajo', p.ot || ''], ['Pagina', '2/2']]) + rptInfo(info2) + rptSection('Anexo imagenes evidencia') + ev + rptSection('Firmas') + rptSign(p.firmas) + rptFooter() + '</div>';
  var pageEq = '<div class="page">' + rptHeader('PROTOCOLO GRANALLADO Y PINTURA', 'EQUIPOS DE MEDICION', [['Documento N', p.docNro || ''], ['Orden de Trabajo', p.ot || '']]) + rptSection('Equipos de medicion') + rptEquipos(equipos) + rptFooter() + '</div>'; return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(p.codigo || 'PGP') + '</title><style>' + PROTO_CSS + '</style></head><body>' + page1 + page2 + pageEq + '</body></html>';
}
var PROTO_CSS = '@page{size:A4;margin:20mm 15mm 15mm 15mm}*{box-sizing:border-box}body{font-family:Inter,Arial,Helvetica,sans-serif;color:#101828;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{position:relative;padding-bottom:70px}.page+.page{page-break-before:always}.rhead{position:relative;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #061A40;padding:4px 0 10px;overflow:hidden}.logo{display:flex;align-items:baseline}.lg-a{color:#061A40;font-weight:800;font-size:22px;letter-spacing:1px}.lg-b{color:#FF6B00;font-weight:800;font-size:22px;margin-left:5px;letter-spacing:1px}.rh-mid{flex:1;text-align:center}.rh-title{color:#061A40;font-weight:800;font-size:17px;letter-spacing:.5px}.rh-sub{color:#FF6B00;font-weight:700;font-size:10px;letter-spacing:2px;margin-top:2px}.codebox{background:#061A40;color:#fff;padding:8px 12px;border-radius:6px;font-size:10px;min-width:160px}.cb-row{display:flex;justify-content:space-between;gap:12px;padding:1px 0}.cb-k{color:#9fb0cf}.cb-v{font-weight:700}.stripe{position:absolute;top:-10px;right:120px;width:60px;height:130%;background:#FF6B00;opacity:.10;transform:skewX(-22deg)}.infogrid{display:grid;grid-template-columns:1fr 1fr;gap:0 26px;margin:14px 0 4px}.info-item{display:flex;justify-content:space-between;border-bottom:1px solid #D8DCE5;padding:5px 2px;font-size:11px}.info-k{color:#5a6b85}.info-v{font-weight:700;color:#101828;text-align:right}.sec-title{color:#061A40;font-weight:800;font-size:12px;text-transform:uppercase;border-left:4px solid #FF6B00;padding-left:9px;margin:16px 0 7px;letter-spacing:.4px}table.dt{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:4px}table.dt th{background:#061A40;color:#fff;padding:6px 8px;text-align:left;font-weight:700;font-size:10px}table.dt td{border:1px solid #D8DCE5;padding:6px 8px}table.dt td.c{text-align:center}.badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700}.badge-ok{background:#e6f7ec;color:#16A34A}.badge-no{background:#fdeaea;color:#DC2626}.prom-badge{display:inline-block;background:#FF6B00;color:#fff;padding:2px 9px;border-radius:4px;font-weight:700;font-size:10.5px}.norm{display:inline-block;padding:1px 7px;border:1px solid #D8DCE5;border-radius:4px;font-size:9px;color:#5a6b85;background:#F5F7FA}.sign-cell{height:32px}.rfooter{display:flex;margin-top:20px;border-radius:6px;overflow:hidden;border:1px solid #D8DCE5}.rf-navy{background:#061A40;color:#fff;flex:1;display:flex;gap:20px;justify-content:center;align-items:center;padding:10px;font-size:10px;font-weight:600}.rf-web{background:#FF6B00;color:#fff;padding:0 16px;font-weight:700;font-size:11px;display:flex;align-items:center}.evcard{border:1px solid #D8DCE5;border-radius:8px;padding:12px 14px;margin-bottom:12px;display:flex;gap:16px;page-break-inside:avoid;background:#fff}.ev-left{width:36%}.ev-title{color:#FF6B00;font-weight:800;font-size:12px}.ev-desc{margin:5px 0;font-size:11px;font-weight:600;color:#101828}.ev-obs{font-size:10.5px;color:#344054;line-height:1.4}.ev-right{flex:1;display:grid;gap:6px}.ev-right.g1{grid-template-columns:1fr}.ev-right.g2{grid-template-columns:repeat(2,1fr)}.ev-right.g3{grid-template-columns:repeat(3,1fr)}.ev-right.g4{grid-template-columns:repeat(2,1fr)}.imgframe{border:2px solid #061A40;border-radius:4px;overflow:hidden;height:150px;background:#F5F7FA;display:flex;align-items:center;justify-content:center}.imgframe img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block}.equipos{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:8px}.eq-col{border:1px solid #D8DCE5;border-radius:8px;padding:10px;text-align:center}.eq-name{color:#061A40;font-weight:800;font-size:12px}.eq-code{color:#FF6B00;font-weight:800;font-size:13px;margin:2px 0}.eq-sub{color:#5a6b85;font-size:10px;margin-bottom:8px}.eq-img{border:2px solid #061A40;border-radius:4px;overflow:hidden;height:130px;background:#F5F7FA;margin-bottom:6px;display:flex;align-items:center;justify-content:center}.eq-img img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}'
function descargarProto(p, equipos) { const w = window.open('', '_blank'); if (!w) { window.alert('Habilita las ventanas emergentes.'); return } try{var _i=localStorage.getItem('serein_logoIstria')||'',_sv=null,_sw=0;if(_i&&String(p.area||'').toLowerCase().indexOf('istria')>=0){_sv=localStorage.getItem('serein_logo');localStorage.setItem('serein_logo',_i);_sw=1;window.__sereinProtoIstria=true}}catch(e){} w.document.write(p.tipo === 'PIG' ? htmlPIG(p, equipos) : htmlPGP(p, equipos)); try{if(_sw){if(_sv==null)localStorage.removeItem('serein_logo');else localStorage.setItem('serein_logo',_sv);window.__sereinProtoIstria=false;}}catch(e){} w.document.close(); setTimeout(function () { w.focus(); w.print() }, 400) }
function PF({ label, children }) { return (<div><div style={{ fontSize: 11, color: '#9AA3AD', marginBottom: 2, marginTop: 4 }}>{label}</div>{children}</div>) }
function FotoSlots({ label, fotos, max, onChange }) {
  const add = e => { const files = [...(e.target.files || [])].slice(0, max - fotos.length); let pend = files.length; if (!pend) return; const acc = []; files.forEach(f => imgToData(f, d => { acc.push(d); pend--; if (pend === 0) onChange([...fotos, ...acc]) })); e.target.value = '' }
  return (<div style={{ marginTop: 8 }}><div style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AD', marginBottom: 4 }}>{label} ({fotos.length}/{max})</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{fotos.map((d, i) => (<div key={i} style={{ position: 'relative' }}><img src={d} style={{ width: 96, height: 72, objectFit: 'contain', background: '#F2F4F7', border: '1px solid #DFE4EA' }} /><button onClick={() => onChange(fotos.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, background: '#C5453D', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 11 }}>x</button></div>))}{fotos.length < max && (<label style={{ width: 96, height: 72, border: '1px dashed #DFE4EA', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#9AA3AD', fontSize: 22 }}>+<input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={add} /></label>)}</div></div>) }
function TablaMedidas({ titulo, filas, ncols, onSetCell, onAuto, onAddFila, onDelFila, resumen }) {
  const ip = { padding: '4px 5px', border: '1px solid #DFE4EA', fontSize: 12, width: 50, textAlign: 'center', boxSizing: 'border-box' }
  const proms = filas.map(f => promArr(f)); const global = proms.length ? (proms.reduce((a, b) => a + b, 0) / proms.length) : 0
  return (<div style={{ marginTop: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}><span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase' }}>{titulo}</span><div style={{ display: 'flex', gap: 6 }}>{onAddFila && <button onClick={onAddFila} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>+ fila</button>}{onDelFila && filas.length > 1 && <button onClick={onDelFila} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>- fila</button>}<button onClick={onAuto} title="Completa las celdas vacias con valores aceptables" style={{ background: '#3D7A4E', color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>Autocompletar</button></div></div><div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', fontSize: 12, marginTop: 4 }}><thead><tr><th style={{ padding: 3, fontSize: 10, color: '#9AA3AD' }}>Item</th>{Array.from({ length: ncols }).map((_, c) => <th key={c} style={{ padding: 3, fontSize: 10, color: '#9AA3AD' }}>{c + 1}</th>)}<th style={{ padding: 3, fontSize: 10, color: '#9AA3AD' }}>Prom.</th></tr></thead><tbody>{filas.map((f, ri) => (<tr key={ri}><td style={{ padding: 2, textAlign: 'center', fontWeight: 600 }}>{ri + 1}</td>{f.map((v, ci) => <td key={ci} style={{ padding: 2 }}><input style={ip} value={v} onChange={e => onSetCell(ri, ci, e.target.value)} /></td>)}<td style={{ padding: 2, textAlign: 'center', fontWeight: 700, color: '#F77716' }}>{proms[ri] ? proms[ri].toFixed(2) : ''}</td></tr>))}</tbody></table></div><div style={{ fontSize: 12, marginTop: 4 }}>{resumen}: <b>{global ? global.toFixed(2) : ''}</b></div></div>) }
function ProtoHead({ p, upd, onDel, titulo, equipos, col, onTgl }) {
  const ip = { padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, boxSizing: 'border-box', width: '100%' }
  const set = (k, v) => upd({ ...p, [k]: v })
  return (<div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}><span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 14, textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }} onClick={onTgl}>{col ? '▸ ' : '▾ '}{p.codigo} - {titulo}</span><div style={{ display: 'flex', gap: 8 }}><button onClick={() => descargarProto(p, equipos)} style={{ background: '#101315', color: '#fff', border: 'none', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5 }}>Descargar PDF</button><button onClick={onDel} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '7px 10px', cursor: 'pointer', fontSize: 12.5, color: '#9AA3AD' }}>Eliminar</button></div></div>{!col && (<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8 }}><PF label="Codigo"><input style={ip} value={p.codigo} onChange={e => set('codigo', e.target.value)} /></PF><PF label="Orden de Trabajo"><input style={ip} value={p.ot} onChange={e => set('ot', e.target.value)} /></PF><PF label="NV"><input style={ip} value={p.nv} onChange={e => set('nv', e.target.value)} /></PF><PF label="Codigo PGP (gran/pintura)"><input style={ip} value={p.pgpCodigo} onChange={e => set('pgpCodigo', e.target.value)} /></PF><PF label="Cliente"><input style={ip} value={p.cliente} onChange={e => set('cliente', e.target.value)} /></PF><PF label="Proyecto"><input style={ip} value={p.proyecto} onChange={e => set('proyecto', e.target.value)} /></PF><PF label="Fecha"><input type="date" style={ip} value={p.fecha} onChange={e => set('fecha', e.target.value)} /></PF><PF label="Preparado por"><input style={ip} value={p.preparadoPor} onChange={e => set('preparadoPor', e.target.value)} /></PF></div>)}</div>) }
function ProtoPIGForm({ p, upd, onDel, instrumentos }) {
  const ip = { padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, boxSizing: 'border-box', width: '100%' }
  const set = (k, v) => upd({ ...p, [k]: v }); const setAmb = (k, v) => upd({ ...p, amb: { ...p.amb, [k]: v } }); const setChk = (i, k, v) => upd({ ...p, checks: p.checks.map((c, j) => j === i ? { ...c, [k]: v } : c) }); const setMed = (i, v) => upd({ ...p, medidas: p.medidas.map((m, j) => j === i ? v : m) }); const [col, setCol] = useState(false)
  return (<div style={{ marginTop: 12, border: '1px solid #DFE4EA', borderTop: '3px solid #F77716', padding: 14 }}><ProtoHead p={p} upd={upd} onDel={onDel} titulo="Protocolo Inicio de Granalla" equipos={instrumentos} col={col} onTgl={() => setCol(!col)} />{!col && (<><div style={{ margin: '10px 0 4px' }}><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '6px 0 4px' }}>Descripción</div><input style={ip} value={p.descripcion || ''} onChange={e => set('descripcion', e.target.value)} /><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '10px 0 4px' }}>Esquema del proyecto</div><textarea style={{ ...ip, minHeight: 54, resize: 'vertical' }} value={p.esquemaProyecto || ''} onChange={e => set('esquemaProyecto', e.target.value)} placeholder="Sistema de pintura, espesores, normas, alcance..." /></div><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '10px 0 4px' }}>Controles</div><div>{p.checks.map((c, i) => (<div key={i} style={{ border: '1px solid #DFE4EA', borderRadius: 6, padding: 8, marginBottom: 6 }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 6 }}><input style={ip} value={c.nombre} onChange={e => setChk(i, 'nombre', e.target.value)} /><select value={c.cumple} onChange={e => setChk(i, 'cumple', e.target.value)} style={ip}><option>SI</option><option>NO</option></select></div><input style={{ ...ip, marginTop: 6 }} placeholder="Observacion" value={c.obs} onChange={e => setChk(i, 'obs', e.target.value)} /><FotoSlots label={'Fotos evidencia ' + (i + 1)} fotos={c.fotos || []} max={4} onChange={v => setChk(i, 'fotos', v)} /></div>))}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', gap: 8, marginTop: 8 }}><PF label="Limpieza SSPC-SP"><input style={ip} value={p.limpiezaSSPC} onChange={e => set('limpiezaSSPC', e.target.value)} /></PF><PF label="Perfil de anclaje"><input style={ip} value={p.perfilSolicitado} onChange={e => set('perfilSolicitado', e.target.value)} /></PF><PF label="Medida 1"><input style={ip} value={p.medidas[0]} onChange={e => setMed(0, e.target.value)} /></PF><PF label="Medida 2"><input style={ip} value={p.medidas[1]} onChange={e => setMed(1, e.target.value)} /></PF><PF label="Medida 3"><input style={ip} value={p.medidas[2]} onChange={e => setMed(2, e.target.value)} /></PF><PF label="Perfil obtenido (auto)"><input readOnly style={{ ...ip, background: '#F1EDE6' }} value={promArr(p.medidas) ? promArr(p.medidas).toFixed(2) : ''} /></PF></div><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '12px 0 4px' }}>Condiciones ambientales</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 8 }}><PF label="Fecha"><input type="date" style={ip} value={p.amb.fecha} onChange={e => setAmb('fecha', e.target.value)} /></PF><PF label="% Humedad"><input style={ip} value={p.amb.humedad} onChange={e => setAmb('humedad', e.target.value)} /></PF><PF label="T. Ambiente C"><input style={ip} value={p.amb.tAmbiente} onChange={e => setAmb('tAmbiente', e.target.value)} /></PF><PF label="C Pieza"><input style={ip} value={p.amb.tPieza} onChange={e => setAmb('tPieza', e.target.value)} /></PF><PF label="Pto. Rocio"><input style={ip} value={p.amb.ptoRocio} onChange={e => setAmb('ptoRocio', e.target.value)} /></PF><PF label="Hora inicio"><input style={ip} value={p.amb.horaInicio} onChange={e => setAmb('horaInicio', e.target.value)} /></PF></div><FotoSlots label="Fotos inicio de granalla" fotos={p.fotosGranalla || []} max={4} onChange={v => set('fotosGranalla', v)} /></>)}</div>) }
function CapaBlock({ cap, acum, onSet, onCell, onAuto, onAddFila, onDelFila, onFotos, onDel }) {
  const ip = { padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, boxSizing: 'border-box', width: '100%' }
  return (<div style={{ border: '1px solid #DFE4EA', padding: 10, marginTop: 8, background: '#F2F4F7' }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 8 }}><PF label="Nombre capa"><input style={ip} value={cap.nombre} onChange={e => onSet('nombre', e.target.value)} /></PF><PF label="Producto"><input style={ip} value={cap.producto} onChange={e => onSet('producto', e.target.value)} /></PF><PF label="Espesor solicitado (capa)"><input style={ip} value={cap.solicitado} onChange={e => onSet('solicitado', e.target.value)} /></PF><PF label="Solicitado acumulado"><input readOnly style={{ ...ip, background: '#FDECDD', color: '#D9600A', fontWeight: 600 }} value={acum ? (acum[0] + ' a ' + acum[1] + ' mils') : ''} /></PF></div><TablaMedidas titulo="Espesores (DFT)" filas={cap.filas} ncols={(cap.filas[0] || []).length} onSetCell={onCell} onAuto={onAuto} onAddFila={onAddFila} onDelFila={onDelFila} resumen="Promedio capa" /><FotoSlots label={'Fotos ' + (cap.nombre || 'capa')} fotos={cap.fotos || []} max={4} onChange={onFotos} /><div style={{ textAlign: 'right', marginTop: 4 }}><button onClick={onDel} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: '#C5453D' }}>Eliminar capa</button></div></div>) }
function ProtoPGPForm({ p, upd, onDel, instrumentos }) {
  const ip = { padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, boxSizing: 'border-box', width: '100%' }
  const set = (k, v) => upd({ ...p, [k]: v }); const setAmb = (k, v) => upd({ ...p, amb: { ...p.amb, [k]: v } }); const setInstr = (k, v) => upd({ ...p, instr: { ...p.instr, [k]: v } })
  const setPerfil = (r, c, v) => upd({ ...p, perfilFilas: p.perfilFilas.map((row, ri) => ri === r ? row.map((x, ci) => ci === c ? v : x) : row) })
  const autoPerfil = () => { const [lo, hi] = parseRango(p.perfilSolicitado); upd({ ...p, perfilFilas: p.perfilFilas.map(row => autoFila(row, lo, hi)) }) }
  const capas = Array.isArray(p.capas) ? p.capas : []
  const setCapa = (id, k, v) => upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, [k]: v } : c) })
  const cellCapa = (id, r, cc, v) => upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, filas: c.filas.map((row, ri) => ri === r ? row.map((x, ci) => ci === cc ? v : x) : row) } : c) })
  const autoCapa = id => { const idx = capas.findIndex(c => c.id === id); const ac = acumRango(capas, idx); upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, filas: c.filas.map(row => autoFila(row, ac[0], ac[1])) } : c) }) }
  const addFila = id => upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, filas: [...c.filas, ['', '', '', '', '', '', '']] } : c) })
  const delFila = id => upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, filas: c.filas.slice(0, -1) } : c) })
  const fotosCapa = (id, v) => upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, fotos: v } : c) })
  const addCapa = () => upd({ ...p, capas: [...capas, nuevaCapa('Capa ' + (capas.length + 1))] })
  const delCapa = id => upd({ ...p, capas: capas.filter(c => c.id !== id) }); const [col, setCol] = useState(false)
  return (<div style={{ marginTop: 12, border: '1px solid #DFE4EA', borderTop: '3px solid #101315', padding: 14 }}><ProtoHead p={p} upd={upd} onDel={onDel} titulo="Protocolo Granallado y Pintura" equipos={instrumentos} col={col} onTgl={() => setCol(!col)} />{!col && (<><div style={{ margin: '10px 0 4px' }}><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '6px 0 4px' }}>Descripción</div><input style={ip} value={p.descripcion || ''} onChange={e => set('descripcion', e.target.value)} /><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '10px 0 4px' }}>Esquema del proyecto</div><textarea style={{ ...ip, minHeight: 54, resize: 'vertical' }} value={p.esquemaProyecto || ''} onChange={e => set('esquemaProyecto', e.target.value)} placeholder="Sistema de pintura, espesores, normas, alcance..." /></div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 4px' }}><span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase' }}>Instrumentos (desde Parametros)</span><button onClick={() => { var df = { espMarca: 'ELCOMETER', espSerie: 'MH11472', rugMarca: 'ELCOMETER', rugSerie: 'NE30319', termoMarca: 'ELCOMETER', termoSerie: 'KCA721' }; var s = instrumentos || {}; upd({ ...p, instr: { espMarca: s.espMarca || df.espMarca, espSerie: s.espSerie || df.espSerie, rugMarca: s.rugMarca || df.rugMarca, rugSerie: s.rugSerie || df.rugSerie, termoMarca: s.termoMarca || df.termoMarca, termoSerie: s.termoSerie || df.termoSerie } }) }} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>Cargar de Parametros</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8 }}><PF label="Medidor espesor - marca"><input style={ip} value={p.instr.espMarca} onChange={e => setInstr('espMarca', e.target.value)} /></PF><PF label="Medidor espesor - serie"><input style={ip} value={p.instr.espSerie} onChange={e => setInstr('espSerie', e.target.value)} /></PF><PF label="Rugosimetro - marca"><input style={ip} value={p.instr.rugMarca} onChange={e => setInstr('rugMarca', e.target.value)} /></PF><PF label="Rugosimetro - serie"><input style={ip} value={p.instr.rugSerie} onChange={e => setInstr('rugSerie', e.target.value)} /></PF><PF label="Termohigrometro - marca"><input style={ip} value={p.instr.termoMarca} onChange={e => setInstr('termoMarca', e.target.value)} /></PF><PF label="Termohigrometro - serie"><input style={ip} value={p.instr.termoSerie} onChange={e => setInstr('termoSerie', e.target.value)} /></PF></div><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '10px 0 4px' }}>Condiciones ambientales</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 8 }}><PF label="Fecha"><input type="date" style={ip} value={p.amb.fecha} onChange={e => setAmb('fecha', e.target.value)} /></PF><PF label="% Humedad"><input style={ip} value={p.amb.humedad} onChange={e => setAmb('humedad', e.target.value)} /></PF><PF label="T. Ambiente"><input style={ip} value={p.amb.tAmbiente} onChange={e => setAmb('tAmbiente', e.target.value)} /></PF><PF label="C Pieza"><input style={ip} value={p.amb.tPieza} onChange={e => setAmb('tPieza', e.target.value)} /></PF><PF label="Pto. Rocio"><input style={ip} value={p.amb.ptoRocio} onChange={e => setAmb('ptoRocio', e.target.value)} /></PF><PF label="Hora inicio"><input style={ip} value={p.amb.horaInicio} onChange={e => setAmb('horaInicio', e.target.value)} /></PF></div><div style={{ marginTop: 8 }}>{(p.ambExtra || []).map((c, i) => (<div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}><input style={{ ...ip, flex: '1 1 140px' }} placeholder="Condición" value={c.label || ''} onChange={e => set('ambExtra', (p.ambExtra || []).map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /><input style={{ ...ip, flex: '1 1 100px' }} placeholder="Valor" value={c.valor || ''} onChange={e => set('ambExtra', (p.ambExtra || []).map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} /><button onClick={() => set('ambExtra', (p.ambExtra || []).filter((_, j) => j !== i))} style={{ background: 'none', border: '1px solid #DFE4EA', cursor: 'pointer', padding: '4px 8px', color: '#D9600A' }}>×</button></div>))}<button onClick={() => set('ambExtra', [...(p.ambExtra || []), { label: '', valor: '' }])} style={{ background: C.teal, color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, marginTop: 2 }}>+ Agregar condición ambiental</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8, marginTop: 8 }}><PF label="Limpieza superficial"><input style={ip} value={p.limpiezaSSPC} onChange={e => set('limpiezaSSPC', e.target.value)} /></PF><PF label="Perfil de anclaje"><input style={ip} value={p.perfilSolicitado} onChange={e => set('perfilSolicitado', e.target.value)} /></PF></div><TablaMedidas titulo="Perfil de rugosidad" filas={Array.isArray(p.perfilFilas) ? p.perfilFilas : []} ncols={5} onSetCell={setPerfil} onAuto={autoPerfil} resumen="Perfil obtenido (prom.)" /><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '12px 0 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>Esquema de pintura - capas ({capas.length})</span><button onClick={addCapa} style={{ background: '#F77716', color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>+ Agregar capa</button></div>{capas.map((cap, ci) => (<CapaBlock key={cap.id} cap={cap} acum={acumRango(capas, ci)} onSet={(k, v) => setCapa(cap.id, k, v)} onCell={(r, c, v) => cellCapa(cap.id, r, c, v)} onAuto={() => autoCapa(cap.id)} onAddFila={() => addFila(cap.id)} onDelFila={() => delFila(cap.id)} onFotos={v => fotosCapa(cap.id, v)} onDel={() => delCapa(cap.id)} />))}<FotoSlots label="Fotos inicio de granalla" fotos={p.fotosGranalla || []} max={4} onChange={v => set('fotosGranalla', v)} /></>)}</div>) }
function ProtocolosOT({ ot, onUpdate, otsAll = [], instrumentos = null }) {
  const lista = ot.protocolos || []
  const gen = tipo => onUpdate(ot.id, { protocolos: [...lista, nuevoProtocolo(tipo, ot, nextCorrelativoProt(otsAll), instrumentos)] })
  const updP = np => onUpdate(ot.id, { protocolos: lista.map(x => x.id === np.id ? np : x) })
  const delP = id => window.confirm('Eliminar este protocolo?') && onUpdate(ot.id, { protocolos: lista.filter(x => x.id !== id) })
  return (<div style={{ marginTop: 14, borderTop: '1px dashed #DFE4EA', paddingTop: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 13, textTransform: 'uppercase' }}>Protocolos de calidad ({lista.length})</div><div style={{ display: 'flex', gap: 8 }}><button onClick={() => gen('PIG')} style={{ background: '#F77716', color: '#fff', border: 'none', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5 }}>+ Generar PIG</button><button onClick={() => gen('PGP')} style={{ background: '#101315', color: '#fff', border: 'none', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5 }}>+ Generar PGP</button></div></div>{lista.map(p => p.tipo === 'PIG' ? <ProtoPIGForm key={p.id} p={p} upd={updP} onDel={() => delP(p.id)} instrumentos={instrumentos} /> : <ProtoPGPForm key={p.id} p={p} upd={updP} onDel={() => delP(p.id)} instrumentos={instrumentos} />)}</div>) }

export default function OTModule({ areasPermitidas = ['Santa Rosa', 'Istria'], ots: otsExt, setOts: setOtsExt, verValores = true, clientes = [], ordenesCompra = [], mo = null, instrumentos = null }) {
  const [otsInt, setOtsInt] = useState(OTS_INICIALES)
  const [libroCompras, setLibroCompras] = useState([])
  useEffect(() => { supabase.from('libro_compras').select('ot_id,provider_name,document_number,neto,document_total,emission_date').not('ot_id', 'is', null).then(({ data }) => setLibroCompras(data || [])) }, [])
  const otsAll = otsExt ?? otsInt
  const setOts = setOtsExt ?? setOtsInt
  const ots = otsAll.filter(o => areasPermitidas.includes(o.area))
  const [areaSel, setAreaSel] = useState(areasPermitidas[0])
  const [creando, setCreando] = useState(false)
  const [fCliente, setFCliente] = useState('')
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState(null)
  const dragId = React.useRef(null)
  const mover = (fromId, toId) => { if (!fromId || fromId === toId) return; setOts(xs => { const arr = [...xs]; const from = arr.findIndex(x => x.id === fromId); const to = arr.findIndex(x => x.id === toId); if (from < 0 || to < 0) return xs; const [it] = arr.splice(from, 1); arr.splice(to, 0, it); return arr }) }
  const [rep, setRep] = useState(false)
  const [repDesde, setRepDesde] = useState('')
  const [repHasta, setRepHasta] = useState('')
  const [repCliente, setRepCliente] = useState('')
  const [vista, setVista] = useState('activas')
  const [busqueda, setBusqueda] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fFactura, setFFactura] = useState('')
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')
  const _norm = s => (s || '').trim().toLowerCase()
  const otFecha = o => o.fecha || ((o.ventas || []).map(v => v.fecha).filter(f => f && f !== '—').sort()[0]) || ''
  const clientesActivos = [...new Set((clientes || []).filter(c => (c.estado || 'Activo') === 'Activo').map(c => (c.nombre || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const limpiarFiltros = () => { setFCliente(''); setBusqueda(''); setFEstado(''); setFFactura(''); setFDesde(''); setFHasta('') }

  function generarInforme() {
    const enRango = o => { const f = otFecha(o); if (repDesde && (!f || f < repDesde)) return false; if (repHasta && (!f || f > repHasta)) return false; return true }
    const lista = ots.filter(o => (!repCliente || _norm(o.cliente) === _norm(repCliente)) && enRango(o))
    if (lista.length === 0) { window.alert('No hay OT que cumplan el filtro seleccionado.'); return }
    const header = verValores
      ? ['N° OT', 'Cliente', 'Área', 'Estado', 'Fecha', 'Cotización', 'Monto cotizado', 'Venta neta', 'Costos', 'Utilidad', 'Esquema', 'N° partidas']
      : ['N° OT', 'Cliente', 'Área', 'Estado', 'Fecha', 'Cotización', 'Esquema', 'N° partidas']
    const rows = lista.map(o => {
      const venta = (o.ventas || []).reduce((a, v) => a + (v.neta || 0), 0)
      const costo = (o.costos || []).reduce((a, c) => a + (c.monto || 0), 0)
      const base = [o.numero, o.cliente, o.area, o.estado, otFecha(o), o.cotizacion || '']
      return verValores ? [...base, o.montoCotizado || 0, venta, costo, venta - costo, o.esquema || '', (o.partidas || []).length] : [...base, o.esquema || '', (o.partidas || []).length]
    })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), 'Informe OT')
    XLSX.writeFile(wb, `Informe_OT_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const actualizar = (id, cambios) => setOts(xs => xs.map(o => o.id === id ? { ...o, ...cambios } : o))
  // Un borrado normal (setOts local + el guardado/push general de 800ms)
  // se podía "revivir": si otra pestaña con una copia más vieja de las OT
  // hacía cualquier otro cambio mientras tanto, su push terminaba
  // reemplazando la nube entera con su versión — que todavía traía la OT
  // que se acababa de borrar acá. Por eso el borrado trae primero lo más
  // fresco de la nube, borra sobre eso, y empuja de inmediato (sin
  // esperar el debounce compartido) para dejar la ventana de choque lo
  // más chica posible.
  //
  // cambiarEstado/agregarVenta/eliminarVenta NO usan este mismo patrón:
  // se probó primero con el mismo "esperar la nube antes de escribir" y en
  // la práctica, con conexión lenta o inestable en planta, ese await podía
  // demorar mucho o no resolver nunca — el botón "Cerrar OT" quedaba sin
  // efecto visible porque el cambio local nunca llegaba a aplicarse. Por
  // eso aplican el cambio LOCAL de inmediato (como actualizar()) y solo
  // después empujan a la nube sin bloquear la pantalla — igual de rápido
  // para ver el resultado, y la sincronización entre usuarios sigue
  // ocurriendo (push inmediato en vez del debounce de 800ms general).
  const eliminar = async id => {
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_ots') || 'null') } catch (e) {}
    const base = Array.isArray(fresco) ? fresco : otsAll
    const nuevo = base.filter(o => o.id !== id)
    try { localStorage.setItem('serein_ots', JSON.stringify(nuevo)) } catch (e) {}
    setOts(nuevo)
    pushState()
  }

  // Escribe localStorage ANTES de pushState() de forma sincrónica (no
  // adentro del updater funcional de setOts, que React corre después) —
  // si no, pushState() podía alcanzar a leer localStorage todavía con el
  // valor viejo y no detectar el cambio recién hecho.
  function escribir(mutar) {
    const nuevo = mutar(otsAll)
    try { localStorage.setItem('serein_ots', JSON.stringify(nuevo)) } catch (e) {}
    setOts(nuevo)
    pushState()
  }

  const cambiarEstado = (id, nuevoEstado) => {
    escribir(xs => xs.map(o => o.id === id ? { ...o, estado: nuevoEstado, ...(nuevoEstado === 'Cerrada' ? { fechaCierre: hoy() } : {}) } : o))
  }

  const agregarVenta = (id, venta) => {
    const folio = (venta.folio || '').trim()
    if (folio && folio !== 's/f' && otsAll.some(o => (o.ventas || []).some(v => (v.folio || '').trim().toLowerCase() === folio.toLowerCase()))) {
      window.alert(`El N° de factura ${folio} ya está registrado en otra OT. Revisa antes de guardar.`)
      return false
    }
    escribir(xs => xs.map(o => o.id === id ? { ...o, ventas: [...(o.ventas || []), venta] } : o))
    return true
  }

  const eliminarVenta = (id, index) => {
    escribir(xs => xs.map(o => o.id === id ? { ...o, ventas: (o.ventas || []).filter((_, j) => j !== index) } : o))
  }

  const coincideBusqueda = o => {
    if (!busqueda.trim()) return true
    const q = _norm(busqueda)
    return [o.numero, o.cliente, o.oc, o.cotizacion].some(v => _norm(v).includes(q))
  }
  const coincideFiltros = o => {
    if (fEstado && o.estado !== fEstado) return false
    if (fDesde && (!otFecha(o) || otFecha(o) < fDesde)) return false
    if (fHasta && (!otFecha(o) || otFecha(o) > fHasta)) return false
    if (vista === 'cerradas' && fFactura) {
      const fact = tieneFactura(o) ? 'Facturada' : 'Pendiente'
      if (fact !== fFactura) return false
    }
    return true
  }

  const delArea = ots.filter(o => o.area === areaSel && (!fCliente || _norm(o.cliente) === _norm(fCliente)))
  const activasArea = delArea.filter(o => o.estado !== 'Cerrada')
  const cerradasArea = delArea.filter(o => o.estado === 'Cerrada')
  const visibles = (vista === 'cerradas' ? cerradasArea : activasArea).filter(o => coincideBusqueda(o) && coincideFiltros(o))

  // Solo se considera el correlativo de OTs con el formato propio de este módulo (OT-AAAA-NNN).
  // Las OT creadas al aprobar una cotización usan 'OT-<folio>' (sin año) y no deben mezclarse con esta secuencia.
  const anioActual = new Date().getFullYear()
  const nums = ots.filter(o => /^OT-\d{4}-\d+$/.test(o.numero || '')).map(o => parseInt((o.numero.match(/(\d+)$/) || [0, 0])[1], 10))
  const siguiente = `OT-${anioActual}-${String(Math.max(100, ...nums) + 1).padStart(3, '0')}`

  const nOTs = { activas: activasArea.length }
  const ventaEnProceso = activasArea.reduce((a, o) => a + ventaNetaDeOT(o), 0)
  const cerradasSinFactura = cerradasArea.filter(o => !tieneFactura(o))
  const cerradasConFactura = cerradasArea.filter(o => tieneFactura(o))
  const cerradasPorFacturarMonto = cerradasSinFactura.reduce((a, o) => a + ventaNetaDeOT(o), 0)
  const facturadasMonto = cerradasConFactura.reduce((a, o) => a + ventaNetaDeOT(o), 0)

  return (
    <div>
      {/* Selector de área */}
      {areasPermitidas.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {areasPermitidas.map(a => (
            <button key={a} onClick={() => setAreaSel(a)}
              style={{ background: areaSel === a ? C.carbon : '#fff', color: areaSel === a ? '#fff' : C.carbon, border: '1px solid #DFE4EA', padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {a}
            </button>
          ))}
        </div>
      )}

      {/* KPIs del área (fuente única: ventaNetaDeOT / tieneFactura) */}
      {verValores ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
          <KpiCard icon={FileText} iconBg={SEREIN.blueSoft} iconColor={SEREIN.blue} value={nOTs.activas} label="OT activas" />
          <KpiCard icon={CircleDollarSign} iconBg={SEREIN.orangeSoft} iconColor={SEREIN.orangeDark} value={clp(ventaEnProceso)} label={`Venta en proceso · ${activasArea.length} OT`} />
          <KpiCard icon={Receipt} iconBg={PILL_VARIANT.naranja.bg} iconColor={PILL_VARIANT.naranja.fg} value={clp(cerradasPorFacturarMonto)} label={`Cerradas por facturar · ${cerradasSinFactura.length} OT`} />
          <KpiCard icon={ShoppingCart} iconBg={SEREIN.greenSoft} iconColor={SEREIN.green} value={clp(facturadasMonto)} label={`OT facturadas · ${cerradasConFactura.length} OT`} />
        </div>
      ) : (
        <div style={{ marginBottom: 18 }}><KpiCard icon={FileText} value={nOTs.activas} label="OT activas" /></div>
      )}

      <TabsBar tabs={[{ key: 'activas', label: `OT activas (${activasArea.length})` }, { key: 'cerradas', label: `OT cerradas (${cerradasArea.length})` }]} active={vista} onChange={v => { setVista(v); setPage(1) }} />

      {/* Buscador y filtros (aditivos, sobre lo ya existente) */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: '#9AA3AD', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Search size={14} />
          <input value={busqueda} onChange={e => { setBusqueda(e.target.value); setPage(1) }} placeholder="Buscar por N° OT, cliente, OC/NV o cotización" style={{ ...inp, width: 240 }} />
        </label>
        <label style={{ fontSize: 12, color: '#9AA3AD', display: 'flex', alignItems: 'center', gap: 6 }}>Cliente
          <select value={fCliente} onChange={e => { setFCliente(e.target.value); setPage(1) }} style={inp}>
            <option value="">Todos</option>
            {clientesActivos.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: '#9AA3AD', display: 'flex', alignItems: 'center', gap: 6 }}>Estado
          <select value={fEstado} onChange={e => { setFEstado(e.target.value); setPage(1) }} style={inp}>
            <option value="">Todos</option>
            {(vista === 'cerradas' ? ['Cerrada'] : ['Cotizada', 'En ejecución', 'Terminada']).map(es => <option key={es} value={es}>{etiquetaEstado({ estado: es })}</option>)}
          </select>
        </label>
        {vista === 'cerradas' && (
          <label style={{ fontSize: 12, color: '#9AA3AD', display: 'flex', alignItems: 'center', gap: 6 }}>Facturación
            <select value={fFactura} onChange={e => { setFFactura(e.target.value); setPage(1) }} style={inp}>
              <option value="">Todas</option>
              <option value="Pendiente">Pendiente de facturación</option>
              <option value="Facturada">Facturada</option>
            </select>
          </label>
        )}
        <label style={{ fontSize: 11, color: '#9AA3AD' }}>Ingreso desde<input type="date" value={fDesde} onChange={e => { setFDesde(e.target.value); setPage(1) }} style={{ ...inp, display: 'block', marginTop: 3 }} /></label>
        <label style={{ fontSize: 11, color: '#9AA3AD' }}>hasta<input type="date" value={fHasta} onChange={e => { setFHasta(e.target.value); setPage(1) }} style={{ ...inp, display: 'block', marginTop: 3 }} /></label>
        <Btn variant="outline" icon={RotateCcw} onClick={() => { limpiarFiltros(); setPage(1) }}>Limpiar filtros</Btn>
        <Btn variant="dark" icon={Download} onClick={() => { setRep(v => !v); setRepCliente(fCliente) }}>Informe Excel</Btn>
      </div>
      {rep && (
        <div style={{ background: '#FAF7F3', border: '1px solid #DFE4EA', padding: 12, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, color: '#9AA3AD' }}>Desde<input type="date" value={repDesde} onChange={e => setRepDesde(e.target.value)} style={{ ...inp, display: 'block', marginTop: 3 }} /></label>
          <label style={{ fontSize: 11, color: '#9AA3AD' }}>Hasta<input type="date" value={repHasta} onChange={e => setRepHasta(e.target.value)} style={{ ...inp, display: 'block', marginTop: 3 }} /></label>
          <label style={{ fontSize: 11, color: '#9AA3AD' }}>Cliente<select value={repCliente} onChange={e => setRepCliente(e.target.value)} style={{ ...inp, display: 'block', marginTop: 3 }}><option value="">Todos</option>{clientesActivos.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
          <button onClick={generarInforme} style={{ background: C.verde, color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Generar Excel</button>
          <span style={{ fontSize: 11.5, color: '#9AA3AD' }}>Deja las fechas vacías para incluir todo. Cubre tus áreas visibles.</span>
        </div>
      )}

      {!creando && (
        <button onClick={() => setCreando(true)}
          style={{ background: C.azul, color: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <Plus size={15} /> Nueva OT en {areaSel}
        </button>
      )}
      {creando && <FormOT area={areaSel} siguienteNumero={siguiente} clientesActivos={clientesActivos} onAdd={o => { setOts(xs => [o, ...xs]); setCreando(false) }} onCancel={() => setCreando(false)} />}

      {visibles.length === 0 && <div style={{ color: '#9AA3AD', fontSize: 14, padding: 20, textAlign: 'center', background: '#fff', border: '1px dashed #DFE4EA' }}>{vista === 'cerradas' ? `Sin OT cerradas en ${areaSel} con estos filtros.` : `Sin OT activas en ${areaSel} con estos filtros.`}</div>}
      {(<>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {paginar(visibles, page).items.map(o => <TileOT key={o.id} ot={o} verValores={verValores} onOpen={() => setSel(o.id)} onDragStart={() => { dragId.current = o.id }} onDropOn={() => { mover(dragId.current, o.id); dragId.current = null }} />)}
        </div>
        {(() => { const so = otsAll.find(x => x.id === sel); return so ? (
          <div onClick={() => setSel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,26,46,.55)', zIndex: 70, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 16px', overflowY: 'auto' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#F7F6F3', width: '100%', maxWidth: 1000, boxShadow: '0 20px 60px -12px rgba(0,0,0,.4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #DFE4EA', background: '#fff', position: 'sticky', top: 0, zIndex: 2 }}>
                <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase' }}>{so.numero} · {so.cliente}</span>
                <button onClick={() => setSel(null)} style={{ background: 'none', border: '1px solid #DFE4EA', cursor: 'pointer', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}><X size={15} /> Cerrar</button>
              </div>
              <div style={{ padding: 12 }}>
                <TarjetaOT ot={so} onUpdate={actualizar} onDelete={id => { eliminar(id); setSel(null) }} onCambiarEstado={cambiarEstado} onAgregarVenta={agregarVenta} onEliminarVenta={eliminarVenta} verValores={verValores} ordenesCompra={ordenesCompra} mo={mo} otsAll={otsAll} instrumentos={instrumentos} libroCompras={libroCompras} enModal />
              </div>
            </div>
          </div>
        ) : null })()}
        </>)}
      <Paginador page={paginar(visibles, page).page} paginas={paginar(visibles, page).paginas} total={visibles.length} setPage={setPage} />

      <div style={{ fontSize: 12, color: '#9AA3AD', textAlign: 'center', marginTop: 8 }}>
        Los cambios se guardan automáticamente en la nube (Supabase) y quedan sincronizados en todos los dispositivos.
      </div>
    </div>
  )
}
