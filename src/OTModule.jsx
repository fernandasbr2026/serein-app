import React, { useState, useEffect, useRef, useMemo } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2, X, Ruler, Paintbrush, FileText, Receipt, ShoppingCart, CircleDollarSign, Download, Camera, Search, RotateCcw, Lock, Unlock, CalendarDays, Save } from 'lucide-react'
import * as XLSX from 'xlsx'
import { descargarOTDesdeOT } from './CotizacionesModule.jsx'
import { costoOCdeOT } from './OrdenesCompraModule.jsx'
import { supabase } from './supabase.js'
import { generarPdfProtocoloBlob, blobToBase64, fileToBase64, protocoloCompleto } from './protocolo-pdf.js'
import { costoMOdeOT } from './ManoObraModule.jsx'
import Paginador, { paginar } from './Paginador.jsx'
import { pullState, pushState } from './sync.js'
import { sumarDiasHabiles, diasHabilesHasta } from './plazos.js'
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
// Le pone un limite de tiempo a cualquier promesa: si no resuelve antes,
// rechaza con un mensaje claro en vez de dejar la operacion colgada para
// siempre (ej. generar el PDF de un protocolo con una imagen dañada podia
// quedarse "Subiendo…" eternamente, sin exito ni error).
function conLimiteTiempo(promesa, ms, mensaje) {
  return Promise.race([
    promesa,
    new Promise((_, reject) => setTimeout(() => reject(new Error(mensaje)), ms)),
  ])
}

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

// ===== Fuentes únicas para clasificación financiera de OT (aditivo — no
// se guarda nada nuevo, todo se calcula de ot.ventas/ot.abonos que ya
// existen). Antes "saldo por facturar" y "saldo por percibir" eran el
// mismo número (saldoPendiente = venta neta - abonado), mezclando dos
// cosas distintas: cuánto falta por RESPALDAR con una factura real, y
// cuánto de lo YA facturado falta por COBRAR. Separados acá una sola vez
// para que la ficha, las tarjetas y los KPI usen siempre el mismo cálculo.
const facturasRealesDeOT = ot => (ot.ventas || []).filter(v => (v.folio || '').trim() && v.folio !== 's/f')
export const totalFacturadoDeOT = ot => facturasRealesDeOT(ot).reduce((a, v) => a + (v.neta || 0), 0)
export const abonoTotalDeOT = ot => (ot.abonos || []).reduce((a, x) => a + (x.monto || 0), 0)
// Nunca negativo: si se facturó/abonó de más, el excedente no resta de
// otra OT ni se muestra como saldo pendiente inexistente.
export const saldoPorFacturarDeOT = ot => Math.max(0, ventaNetaDeOT(ot) - totalFacturadoDeOT(ot))
export const saldoPorPercibirDeOT = ot => Math.max(0, totalFacturadoDeOT(ot) - abonoTotalDeOT(ot))
export const estadoFacturacionDeOT = ot => {
  const facturado = totalFacturadoDeOT(ot)
  if (facturado <= 0) return 'Sin facturar'
  return saldoPorFacturarDeOT(ot) > 0 ? 'Parcialmente facturada' : 'Totalmente facturada'
}
export const estadoPagoOTDeOT = ot => {
  const facturado = totalFacturadoDeOT(ot)
  if (facturado <= 0) return 'Sin pago'
  const percibir = saldoPorPercibirDeOT(ot)
  if (percibir <= 0) return 'Pagada'
  return percibir < facturado ? 'Pago parcial' : 'Sin pago'
}
// El "monto naranja" del KPI "Venta en proceso": si la OT tiene abonos
// registrados, aporta el saldo real (venta neta - abonado, nunca
// negativo, respeta un saldo explícitamente $0 sin reemplazarlo por la
// venta neta). Si NO tiene ningún abono, no hay nada que descontar
// todavía — aporta la venta neta completa. Una OT sin venta neta y sin
// abonos aporta $0 con advertencia, en vez de romper la suma.
export const saldoActivoDeOT = ot => {
  const venta = ventaNetaDeOT(ot)
  const abonado = abonoTotalDeOT(ot)
  if (venta <= 0 && abonado <= 0) return { monto: 0, advertencia: 'OT sin monto de venta registrado' }
  if (abonado > 0) return { monto: Math.max(0, venta - abonado) }
  return { monto: venta }
}
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

// ===== Facturación pieza por pieza =====
// Cada marca esperada ya venía guardando su paso por recepción (recibida
// / loteId) y por despacho (despachoId). Facturación es el tercer paso de
// esa misma cadena y usa el mismo patrón: la marca queda ligada a una
// venta por facturaId, sin campos nuevos en la OT ni en las ventas más
// allá de ese vínculo. Una marca sin facturaId es, por definición, una
// pieza que falta por facturar.

// m² con los que se valoriza una pieza: se prefiere el medido por
// nosotros en planta (m2Propio) y se cae al informado por el cliente
// (m2), que es el mismo orden de confianza que usa el resto de la ficha.
export const m2FacturableDeMarca = m => {
  const propio = parseFloat(m && m.m2Propio)
  if (Number.isFinite(propio) && propio > 0) return propio
  const cliente = parseFloat(m && m.m2)
  return Number.isFinite(cliente) && cliente > 0 ? cliente : 0
}

// Precio por m² de referencia para valorizar lo pendiente. Cadena de
// respaldo, de más a menos preciso: los ítems de la cotización (que ya
// contemplan m² reales y descuentos), luego el monto cotizado sobre los
// m² de la OT. Si no hay ninguno de los dos devuelve null y la ficha
// muestra solo piezas y m², sin inventar un monto.
export const precioM2DeOT = ot => {
  const items = ot.itemsCot || []
  const m2Items = items.reduce((a, it) => a + m2RealItem(it), 0)
  const montoItems = items.reduce((a, it) => a + montoItemReal(it), 0)
  if (m2Items > 0 && montoItems > 0) return montoItems / m2Items
  const m2OT = numDec(ot.m2)
  const montoOT = num(ot.montoCotizado)
  if (m2OT > 0 && montoOT > 0) return montoOT / m2OT
  return null
}

// Cruce entre el checklist de piezas y las facturas cargadas en la OT.
// Devuelve siempre la misma forma, así la tarjeta, el panel comercial y
// cualquier indicador futuro leen exactamente el mismo cálculo.
export const cruceFacturacionOT = ot => {
  const marcas = ot.marcasEsperadas || []
  const ventas = ot.ventas || []
  // Una marca cuenta como facturada solo si su facturaId sigue existiendo
  // entre las ventas de la OT: si se borró la factura, la pieza vuelve
  // sola a pendiente en vez de quedar colgada de un folio fantasma.
  const idsVentas = new Set(ventas.map(v => v.id).filter(Boolean))
  const estaFacturada = m => !!m.facturaId && (idsVentas.size === 0 ? false : idsVentas.has(m.facturaId))
  const facturadas = marcas.filter(estaFacturada)
  const pendientes = marcas.filter(m => !estaFacturada(m))
  const m2De = m2FacturableDeMarca
  const m2Facturado = facturadas.reduce((a, m) => a + m2De(m), 0)
  const m2Pendiente = pendientes.reduce((a, m) => a + m2De(m), 0)
  const precio = precioM2DeOT(ot)
  // Sin m² cargados no se puede valorizar la pieza aunque haya precio:
  // se listan aparte para que se note que falta el dato, en vez de
  // sumarlas como $0 y dar un pendiente falsamente bajo.
  const sinM2 = pendientes.filter(m => m2De(m) <= 0)
  return {
    total: marcas.length,
    facturadas, pendientes, sinM2,
    m2Facturado, m2Pendiente,
    precioM2: precio,
    montoPendienteEstimado: precio != null ? Math.round(m2Pendiente * precio) : null,
    montoFacturadoEstimado: precio != null ? Math.round(m2Facturado * precio) : null,
  }
}
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

// Tarjeta de KPI propia de este módulo (no se toca ui.jsx: es un
// componente compartido con el resto de la app, y esta tarjeta necesita
// cosas que las otras pantallas no piden — clic para navegar, una cifra
// secundaria, una advertencia y una explicación breve del cálculo).
function KpiCardOT({ icon: Icon, iconBg, iconColor, value, label, secundario, advertencia, explicacion, onClick }) {
  return (
    <div onClick={onClick} title={explicacion} role={onClick ? 'button' : undefined}
      style={{ background: '#fff', border: '1px solid #DFE4EA', borderRadius: SEREIN.radius, padding: 20, cursor: onClick ? 'pointer' : 'default' }}>
      {Icon && <div style={{ width: 38, height: 38, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: iconBg || SEREIN.orangeSoft, color: iconColor || SEREIN.orangeDark, marginBottom: 14 }}><Icon size={19} /></div>}
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 800, fontSize: 26, color: '#101315', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#9AA3AD', marginTop: 6 }}>{label}</div>
      {secundario && <div style={{ fontSize: 11.5, color: '#9AA3AD', marginTop: 3 }}>{secundario}</div>}
      {advertencia && <div style={{ fontSize: 11.5, color: C.rojo, marginTop: 4 }}>⚠ {advertencia}</div>}
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
  const [f, setF] = useState({ folio: '', fecha: '', neta: '', estadoPago: 'Pendiente', observacion: '' })
  const iva = Math.round(num(f.neta) * 0.19)
  const totalBruto = num(f.neta) + iva
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
        <input style={{ ...inp, width: 180 }} placeholder="Observación (opcional)" value={f.observacion} onChange={e => setF({ ...f, observacion: e.target.value })} />
        {/* id: necesario para poder ligarle piezas del checklist (ver
            FacturacionOT). Las ventas cargadas antes de esta funcion no
            lo tienen y simplemente no aceptan piezas ligadas. */}
        <button onClick={() => num(f.neta) > 0 && onAdd({ id: 'vt' + Date.now() + Math.random().toString(36).slice(2, 7), folio: f.folio || 's/f', fecha: f.fecha || '—', neta: num(f.neta), iva, totalBruto, estadoPago: f.estadoPago, observacion: f.observacion || '' })}
          style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar</button>
        <button onClick={onCancel} style={{ ...btnMini, color: '#9AA3AD' }}><X size={16} /></button>
      </div>
      {num(f.neta) > 0 && <div style={{ fontSize: 12, color: '#9AA3AD', marginTop: 6 }}>IVA 19%: {clp(iva)} · Total factura: {clp(totalBruto)}</div>}
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

// Lee un Excel con las marcas/spool que el cliente informa que deben
// llegar. Se autodetectan por nombre de encabezado, sin depender de un
// orden fijo de columnas: TAG, ID, MARCA, M2 y REFERENCIA. Basta con que
// exista TAG *o* MARCA — el resto es opcional.
//
// Como se arma el codigo de la pieza (campo `marca`, que es el que usa
// todo el resto de la app: checklist, recepcion, despacho, protocolos):
//   - Si el Excel trae columna "marca", se usa tal cual (TAG e ID quedan
//     guardados aparte como datos de la pieza). Esto es lo que ya hacia
//     antes, y se mantiene para no cambiarle el codigo a las marcas de
//     los clientes que ya estan cargadas.
//   - Si NO trae columna "marca" pero si TAG, se arma TAG-ID (o solo TAG
//     si no hay ID), exactamente igual que el alta manual.
//
// mapeoManual, si viene, fuerza los indices en vez de adivinarlos (para
// clientes cuyo Excel usa nombres de encabezado propios) —
// { colTag, colMarca, colId, colReferencia, colM2 }, cada uno indice de
// columna o -1/null si esa columna no existe. Los mapeos guardados por
// clientes antiguos no traen colTag: en ese caso se autodetecta el TAG,
// asi el mapeo viejo sigue sirviendo y ademas gana la columna nueva.
// El callback recibe tambien la fila de encabezado cruda (headerRow),
// para poder mostrarla en un panel de mapeo si hace falta.
function parseExcelMarcas(file, cb, mapeoManual) {
  const reader = new FileReader()
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' })
      const hoja = wb.SheetNames[0]
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, blankrows: false })
      if (!filas.length) { cb([], 'El archivo está vacío.', null); return }
      const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
      // El encabezado no siempre es la primera fila (los Excel de cliente
      // suelen traer titulo/logo arriba): se busca en las primeras 10 la
      // que mencione marca o tag.
      let hi = 0
      for (let i = 0; i < Math.min(filas.length, 10); i++) {
        const t = (filas[i] || []).map(norm).join('|')
        if (/(^|\|)[^|]*\b(marca|tag)\b/.test(t) || t.includes('marca')) { hi = i; break }
      }
      const headerRow = filas[hi] || []
      const hdr = headerRow.map(norm)
      const usadas = new Set()
      const marcar = i => { if (i >= 0) usadas.add(i); return i }
      const libre = i => i >= 0 && !usadas.has(i)
      // Busca en tres pasadas de menor a mayor riesgo de falso positivo:
      // igualdad exacta, palabra completa y por ultimo substring. La
      // ultima solo se usa para nombres largos y poco ambiguos: buscar
      // "id" por substring matchearia "cantidad", "unidad" o "medida".
      const buscar = (nombres, permitirSubstring) => {
        for (const n of nombres) { const i = hdr.findIndex((h, j) => libre(j) && h === n); if (i >= 0) return marcar(i) }
        for (const n of nombres) {
          const re = new RegExp('(^|[^a-z0-9])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)')
          const i = hdr.findIndex((h, j) => libre(j) && re.test(h))
          if (i >= 0) return marcar(i)
        }
        if (permitirSubstring) {
          for (const n of nombres) { const i = hdr.findIndex((h, j) => libre(j) && h.includes(n)); if (i >= 0) return marcar(i) }
        }
        return -1
      }
      const fijo = v => { const i = v == null ? -1 : Number(v); return Number.isFinite(i) && i >= 0 ? marcar(i) : -1 }
      // Orden importante: primero los mapeos fijos (para que no se los
      // "robe" la autodeteccion), y dentro de la autodeteccion primero
      // marca/tag, que son los que definen la identidad de la pieza.
      const man = mapeoManual || null
      const ciMarca = man && man.colMarca != null ? fijo(man.colMarca) : buscar(['marca', 'marcas'], true)
      const ciTag = man && man.colTag != null ? fijo(man.colTag) : buscar(['tag', 'tags', 'tag pieza', 'n tag'], false)
      const ciId = man && man.colId != null ? fijo(man.colId) : buscar(['id', 'id pieza', 'id spool', 'identificador', 'correlativo'], false)
      // m2: primero los nombres que contienen "m2"/"superficie"/"area" en
      // cualquier forma; si no aparece ninguno, una segunda pasada con
      // abreviaturas cortas que NO se pueden buscar por substring sin
      // arriesgar falsos positivos ("sup" matchearia "supervisor").
      let ciM2 = man && man.colM2 != null ? fijo(man.colM2) : buscar(['m2', 'm²', 'mt2', 'mts2', 'metros2', 'metros cuadrados', 'superficie', 'area', 'área'], true)
      if (ciM2 < 0 && !(man && man.colM2 != null)) ciM2 = buscar(['sup', 'sup.', 'metraje', 'sup unit'], false)
      const ciReferencia = man && man.colReferencia != null ? fijo(man.colReferencia) : buscar(['referencia', 'ref', 'plano', 'n plano', 'nro plano', 'dwg'], false)
      if (ciMarca < 0 && ciTag < 0) { cb([], 'No se encontró una columna "marca" ni "TAG" en el Excel — revisa que el encabezado la tenga en las primeras filas, o indica tú las columnas.', headerRow); return }
      const txt = v => String(v == null ? '' : v).trim()
      // Los m2 vienen a veces como texto con separadores en formato
      // chileno ("1.234,56") y a veces en formato ingles ("1234.56").
      // Si hay coma, la coma es el decimal y el punto separa miles; si
      // solo hay puntos, el punto es el decimal.
      const num = v => {
        const s = txt(v).replace(/[^0-9.,-]/g, '')
        if (!s) return 0
        const limpio = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
        return parseFloat(limpio) || 0
      }
      const out = []
      for (let i = hi + 1; i < filas.length; i++) {
        const fila = filas[i] || []
        const tag = ciTag >= 0 ? txt(fila[ciTag]) : ''
        const idPieza = ciId >= 0 ? txt(fila[ciId]) : ''
        // La columna "marca" manda cuando existe; si no, se arma TAG-ID.
        const marca = (ciMarca >= 0 ? txt(fila[ciMarca]) : '') || (tag ? (idPieza ? tag + '-' + idPieza : tag) : '')
        if (!marca) continue
        const m2 = ciM2 >= 0 ? num(fila[ciM2]) : 0
        const referencia = ciReferencia >= 0 ? txt(fila[ciReferencia]) : ''
        out.push({ marca, m2, tag: tag || null, idPieza: idPieza || null, referencia: referencia || null })
      }
      const detectado = { colTag: ciTag, colMarca: ciMarca, colId: ciId, colReferencia: ciReferencia, colM2: ciM2 }
      cb(out, out.length ? '' : 'No se encontraron filas con marca o TAG cargados.', headerRow, detectado)
    } catch (err) { cb([], 'No se pudo leer el archivo: ' + ((err && err.message) || String(err)), null, null) }
  }
  reader.readAsArrayBuffer(file)
}
// Mapeo de columnas de Excel guardado por cliente. Vive en su PROPIA clave
// (serein_mapeosExcel), no dentro de serein_params: Dashboard.jsx reescribe
// serein_params completo desde el estado React de "params" cada vez que
// cambia casi cualquier cosa en la app (ots, facturas, cotizaciones...), y
// ese estado React nunca se entera de un mapeo escrito acá directo a
// localStorage — el resultado era que el mapeo guardado se pisaba solo
// segundos después, de forma intermitente. Con su propia clave (que igual
// sincroniza sola a la nube, sync.js sube cualquier "serein_*" que
// cambie) el mapeo ya no depende del ciclo de guardado de Parametros.
function normClienteKey(s) { return String(s || '').trim().toLowerCase() }
function leerMapeoExcelCliente(clienteKey) {
  if (!clienteKey) return null
  try {
    const base = JSON.parse(localStorage.getItem('serein_mapeosExcel') || '{}') || {}
    return base[clienteKey] || null
  } catch (e) { return null }
}
async function guardarMapeoExcelCliente(clienteKey, mapeo) {
  if (!clienteKey) return
  try { await pullState() } catch (e) {}
  let base = {}
  try { base = JSON.parse(localStorage.getItem('serein_mapeosExcel') || '{}') || {} } catch (e) {}
  const nuevo = { ...base, [clienteKey]: mapeo }
  try { localStorage.setItem('serein_mapeosExcel', JSON.stringify(nuevo)) } catch (e) {}
  pushState()
}

// Checklist de marcas esperadas por OT (spool/piezas que el cliente avisa
// que van a llegar) contra lo realmente recibido. Subir un Excel nuevo
// AGREGA/actualiza marcas — nunca borra ni resetea el estado "recibida"
// de una marca que ya estaba marcada, para no perder el avance ya
// registrado si suben una version mas nueva del listado del cliente.
function MarcasEsperadasOT({ ot, onGuardar }) {
  const marcas = ot.marcasEsperadas || []
  const [subiendo, setSubiendo] = useState(false)
  const [msg, setMsg] = useState('')
  // Overlay local mientras se escribe el m2 propio (planta) — el guardado
  // real se debounce (no pullState/pushState por cada tecla, mismo patron
  // ya usado en OrdenesCompraModule/FacturasModule para no saturar Supabase).
  const [localM2Propio, setLocalM2Propio] = useState({})
  const timersPropio = useRef({})
  const [buscar, setBuscar] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [nuevo, setNuevo] = useState({ tag: '', idPieza: '', m2: '', referencia: '' })
  const marcasFiltradas = buscar.trim() ? marcas.filter(m => [m.marca, m.idPieza, m.referencia].some(v => String(v || '').toLowerCase().includes(buscar.trim().toLowerCase()))) : marcas
  const total = marcas.length
  const recibidas = marcas.filter(m => m.recibida).length
  const pendientes = total - recibidas
  const m2Esperado = marcas.reduce((s, m) => s + (parseFloat(m.m2) || 0), 0)
  const m2Recibido = marcas.filter(m => m.recibida).reduce((s, m) => s + (parseFloat(m.m2) || 0), 0)
  const m2Propio = marcas.reduce((s, m) => {
    const v = localM2Propio[m.id] !== undefined ? localM2Propio[m.id] : m.m2Propio
    return s + (parseFloat(v) || 0)
  }, 0)

  // Excel de marcas: primera vez que se sube el de un cliente nuevo se
  // pide indicar las columnas (si la deteccion automatica de "marca" no
  // funciono) y siempre se muestra una vista previa antes de tocar el
  // checklist real — recien al confirmar se aplica el merge (que nunca
  // borra ni resetea lo ya recibido, igual que antes).
  const clienteKey = normClienteKey(ot.cliente)
  const [pantallaExcel, setPantallaExcel] = useState(null)
  // null | { modo:'mapeo', file, headerRow, elegidas:{colTag,colMarca,colId,colReferencia,colM2} }
  // | { modo:'preview', items:[{marca,m2,tag,idPieza,referencia,aplicar}], mapeoUsado, esNuevoMapeo, detectado, headerRow }

  // `file` se arrastra hasta la vista previa para poder volver al panel de
  // mapeo y releer el mismo archivo si la deteccion automatica acertó en
  // unas columnas pero no en otras (el caso tipico: encuentra el TAG pero
  // no los m², y antes no habia forma de corregirlo sin tocar el Excel).
  const irAPreview = (parsed, mapeoUsado, esNuevoMapeo, detectado, headerRow, file) => {
    setPantallaExcel({ modo: 'preview', items: parsed.map(p => ({ ...p, aplicar: true })), mapeoUsado, esNuevoMapeo, detectado: detectado || null, headerRow: headerRow || [], file: file || null })
  }
  // Pasa de la vista previa al mapeo manual, precargado con lo que la
  // deteccion automatica ya habia encontrado.
  const corregirColumnas = () => {
    const d = pantallaExcel.detectado || {}
    const v = i => (i == null || i < 0) ? '' : String(i)
    setPantallaExcel({
      modo: 'mapeo', file: pantallaExcel.file, headerRow: pantallaExcel.headerRow || [],
      elegidas: { colTag: v(d.colTag), colMarca: v(d.colMarca), colId: v(d.colId), colReferencia: v(d.colReferencia), colM2: v(d.colM2) },
    })
  }
  const subirExcel = e => {
    const fl = e.target.files[0]
    e.target.value = ''
    if (!fl) return
    const mapeoGuardado = leerMapeoExcelCliente(clienteKey)
    setSubiendo(true); setMsg('')
    parseExcelMarcas(fl, (parsed, error, headerRow, detectado) => {
      setSubiendo(false)
      if (mapeoGuardado) {
        if (error && !parsed.length) { window.alert('No se pudo leer el archivo con el mapeo guardado para este cliente: ' + error); return }
        irAPreview(parsed, mapeoGuardado, false, detectado, headerRow, fl)
        return
      }
      if (!error) { irAPreview(parsed, null, true, detectado, headerRow, fl); return } // deteccion automatica funcionó
      if (!headerRow || !headerRow.length) { window.alert(error); return }
      setPantallaExcel({ modo: 'mapeo', file: fl, headerRow, elegidas: { colTag: '', colMarca: '', colId: '', colReferencia: '', colM2: '' } })
    }, mapeoGuardado || undefined)
  }
  const confirmarMapeoManual = () => {
    const { file, elegidas } = pantallaExcel
    const mapeo = {
      colTag: elegidas.colTag === '' ? -1 : Number(elegidas.colTag),
      colMarca: elegidas.colMarca === '' ? -1 : Number(elegidas.colMarca),
      colId: elegidas.colId === '' ? -1 : Number(elegidas.colId),
      colReferencia: elegidas.colReferencia === '' ? -1 : Number(elegidas.colReferencia),
      colM2: elegidas.colM2 === '' ? -1 : Number(elegidas.colM2),
    }
    // Basta con TAG o con Marca: si solo viene TAG, el codigo de la pieza
    // se arma TAG-ID igual que en el alta manual.
    if (mapeo.colMarca < 0 && mapeo.colTag < 0) { window.alert('Indica al menos la columna de TAG o la de Marca.'); return }
    setSubiendo(true)
    parseExcelMarcas(file, (parsed, error, headerRow, detectado) => {
      setSubiendo(false)
      if (error && !parsed.length) { window.alert(error); return }
      irAPreview(parsed, mapeo, true, detectado, headerRow, file)
    }, mapeo)
  }
  const confirmarImportacion = () => {
    const { items, mapeoUsado, esNuevoMapeo } = pantallaExcel
    const seleccionados = items.filter(it => it.aplicar)
    const combinadas = [...marcas]
    let nuevas = 0, actualizadas = 0
    seleccionados.forEach(p => {
      const key = p.marca.trim().toLowerCase()
      const idx = combinadas.findIndex(m => String(m.marca || '').trim().toLowerCase() === key)
      if (idx >= 0) {
        const cambios = {}
        if (p.m2) cambios.m2 = p.m2
        if (p.tag) cambios.tag = p.tag
        if (p.idPieza) cambios.idPieza = p.idPieza
        if (p.referencia) cambios.referencia = p.referencia
        if (Object.keys(cambios).length) { combinadas[idx] = { ...combinadas[idx], ...cambios }; actualizadas++ }
      } else {
        combinadas.push({ id: 'me' + Date.now() + Math.random().toString(36).slice(2, 7), marca: p.marca, tag: p.tag || null, idPieza: p.idPieza || null, referencia: p.referencia || null, m2: p.m2, m2Propio: null, recibida: false, fechaRecibida: null })
        nuevas++
      }
    })
    onGuardar(combinadas)
    if (esNuevoMapeo && mapeoUsado) guardarMapeoExcelCliente(clienteKey, mapeoUsado)
    setPantallaExcel(null)
    setMsg(`Listo — ${nuevas} marca(s) nueva(s), ${actualizadas} actualizada(s). Lo que ya estaba marcado como recibido no se tocó.`)
  }
  const toggleRecibida = id => onGuardar(marcas.map(m => m.id === id ? { ...m, recibida: !m.recibida, fechaRecibida: !m.recibida ? hoy() : null } : m))
  const cambiarM2Propio = (id, valor) => {
    setLocalM2Propio(p => ({ ...p, [id]: valor }))
    clearTimeout(timersPropio.current[id])
    timersPropio.current[id] = setTimeout(() => {
      onGuardar(marcas.map(m => m.id === id ? { ...m, m2Propio: valor } : m))
    }, 700)
  }
  const quitarMarca = id => {
    if (!window.confirm('¿Quitar esta marca de la lista de esperadas? No borra ninguna recepción ya registrada, solo el ítem del checklist.')) return
    onGuardar(marcas.filter(m => m.id !== id))
  }
  // Alta manual (ademas de subir Excel) — TAG obligatorio, ID opcional (un
  // mismo TAG puede tener varios ID, ej. 2610-SP-32402 con -A, -B, -C...).
  // Se guardan como campos separados para poder editarlos, pero tambien se
  // combinan en `marca` (TAG-ID) porque es el campo que ya usa todo el
  // resto de la app (checklist de recepcion, despacho, protocolos, Excel) —
  // asi una marca agregada a mano funciona identico a una que vino del
  // Excel, sin tocar esa logica existente.
  const agregarManual = () => {
    const tag = nuevo.tag.trim()
    if (!tag) return
    const idPieza = nuevo.idPieza.trim()
    const marcaTxt = idPieza ? (tag + '-' + idPieza) : tag
    const dup = marcas.some(m => String(m.marca || '').trim().toLowerCase() === marcaTxt.toLowerCase())
    if (dup) { window.alert('Ya existe una marca "' + marcaTxt + '" en el checklist.'); return }
    onGuardar([...marcas, {
      id: 'me' + Date.now() + Math.random().toString(36).slice(2, 7),
      marca: marcaTxt, tag, idPieza: idPieza || null, referencia: nuevo.referencia.trim() || null,
      m2: parseFloat(nuevo.m2) || 0, m2Propio: null, recibida: false, fechaRecibida: null
    }])
    setNuevo({ tag: '', idPieza: '', m2: '', referencia: '' }); setMostrarForm(false)
  }

  return (
    <div style={{ marginTop: 14, border: '1px solid #DFE4EA', borderRadius: 6, padding: 12, background: '#FCFBF9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: '#D9600A' }}>Marcas esperadas (checklist de recepción)</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setMostrarForm(v => !v)} style={{ background: mostrarForm ? '#EEE9DF' : C.carbon, color: mostrarForm ? C.carbon : '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={14} /> Agregar marca
          </button>
          <label style={{ cursor: subiendo ? 'wait' : 'pointer', background: C.teal, color: '#fff', border: 'none', padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, opacity: subiendo ? 0.7 : 1 }}>
            <Plus size={14} /> {subiendo ? 'Leyendo…' : 'Subir Excel de marcas'}
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} disabled={subiendo} onChange={subirExcel} />
          </label>
        </div>
      </div>
      {pantallaExcel && pantallaExcel.modo === 'mapeo' && (
        <div style={{ border: '1px dashed #CFC9BC', borderRadius: 6, padding: 10, marginBottom: 12, background: '#FBFAF7' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#5A736A', marginBottom: 6, textTransform: 'uppercase' }}>Primera vez con este cliente — indica qué columna es cada dato</div>
          <div style={{ fontSize: 11.5, color: '#9AA3AD', marginBottom: 8 }}>No se pudo adivinar sola la columna de TAG ni de marca. Indica al menos una de las dos: si solo hay TAG, el código de la pieza se arma <b>TAG-ID</b>. Este mapeo se guarda para {ot.cliente || 'este cliente'} — la próxima vez no hace falta repetirlo.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {[['colTag', 'TAG'], ['colMarca', 'Marca'], ['colId', 'ID'], ['colReferencia', 'Referencia'], ['colM2', 'm²']].map(([campo, lbl]) => (
              <div key={campo} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <label style={{ fontSize: 10, color: '#9AA3AD' }}>{lbl}</label>
                <select value={pantallaExcel.elegidas[campo]} onChange={e => setPantallaExcel(s => ({ ...s, elegidas: { ...s.elegidas, [campo]: e.target.value } }))} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '6px 8px', fontSize: 12.5, minWidth: 160 }}>
                  <option value="">— no aplica —</option>
                  {pantallaExcel.headerRow.map((h, i) => <option key={i} value={i}>{String(h || '(columna ' + (i + 1) + ')')}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={confirmarMapeoManual} style={{ background: C.verde, color: '#fff', border: 'none', borderRadius: 4, padding: '7px 14px', fontSize: 12.5, cursor: 'pointer' }}>Continuar</button>
            <button onClick={() => setPantallaExcel(null)} style={{ background: 'none', border: '1px solid #DFE4EA', borderRadius: 4, padding: '7px 12px', fontSize: 12.5, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}
      {pantallaExcel && pantallaExcel.modo === 'preview' && (
        <div style={{ border: '1px dashed #CFC9BC', borderRadius: 6, padding: 10, marginBottom: 12, background: '#FBFAF7' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#5A736A', marginBottom: 6, textTransform: 'uppercase' }}>Vista previa — se van a importar {pantallaExcel.items.filter(it => it.aplicar).length} de {pantallaExcel.items.length} pieza(s)</div>
          {/* Que columna se leyo para cada dato: sirve para cachar al tiro
              un Excel mal leido (ej. que tomo "cantidad" como ID) antes de
              importar, en vez de descubrirlo con el checklist ya sucio. */}
          {pantallaExcel.detectado && (
            <div style={{ fontSize: 11, color: '#5A736A', marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {[['colTag', 'TAG'], ['colMarca', 'Marca'], ['colId', 'ID'], ['colM2', 'm²'], ['colReferencia', 'Referencia']].map(([campo, lbl]) => {
                const ci = pantallaExcel.detectado[campo]
                const nombre = ci >= 0 ? String((pantallaExcel.headerRow || [])[ci] ?? ('columna ' + (ci + 1))) : null
                return (
                  <span key={campo} style={{ background: nombre ? '#E6F5EA' : '#F1EEE8', border: '1px solid ' + (nombre ? '#B7E0C4' : '#E4DFD5'), borderRadius: 4, padding: '2px 6px', color: nombre ? '#2F6B44' : '#9AA3AD' }}>
                    {lbl}: {nombre ? <b>{nombre}</b> : 'no encontrada'}
                  </span>
                )
              })}
              {pantallaExcel.file && (
                <button onClick={corregirColumnas} style={{ background: 'none', border: '1px solid #C2CBD9', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: '#41618A', cursor: 'pointer' }}>
                  Corregir columnas a mano
                </button>
              )}
            </div>
          )}
          {pantallaExcel.detectado && pantallaExcel.detectado.colM2 < 0 && pantallaExcel.file && (
            <div style={{ fontSize: 11.5, color: '#D9600A', marginBottom: 8 }}>
              No se encontró la columna de m². Si tu Excel los trae con otro nombre, usa "Corregir columnas a mano" — sin m² no se puede estimar cuánto falta por facturar.
            </div>
          )}
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
            {pantallaExcel.items.map((it, i) => (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <input type="checkbox" checked={it.aplicar} onChange={e => setPantallaExcel(s => ({ ...s, items: s.items.map((x, j) => j === i ? { ...x, aplicar: e.target.checked } : x) }))} />
                <span style={{ fontWeight: 600 }}>{it.marca}</span>
                {it.tag && it.tag !== it.marca && <span style={{ color: '#9AA3AD' }}>TAG {it.tag}</span>}
                {it.idPieza && <span style={{ color: '#9AA3AD' }}>ID {it.idPieza}</span>}
                {it.referencia && <span style={{ color: '#9AA3AD' }}>Ref. {it.referencia}</span>}
                {it.m2 > 0 && <span style={{ color: '#9AA3AD' }}>{it.m2} m²</span>}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={confirmarImportacion} style={{ background: C.verde, color: '#fff', border: 'none', borderRadius: 4, padding: '7px 14px', fontSize: 12.5, cursor: 'pointer' }}>Importar</button>
            <button onClick={() => setPantallaExcel(null)} style={{ background: 'none', border: '1px solid #DFE4EA', borderRadius: 4, padding: '7px 12px', fontSize: 12.5, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}
      {mostrarForm && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 12, padding: 10, border: '1px dashed #CFC9BC', borderRadius: 6, background: '#FBFAF7' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ fontSize: 10, color: '#9AA3AD' }}>TAG</label>
            <input value={nuevo.tag} onChange={e => setNuevo({ ...nuevo, tag: e.target.value })} placeholder="ej. 2610-SP-32402" style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '6px 8px', fontSize: 12.5, width: 170 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ fontSize: 10, color: '#9AA3AD' }}>ID (opcional)</label>
            <input value={nuevo.idPieza} onChange={e => setNuevo({ ...nuevo, idPieza: e.target.value })} placeholder="ej. A" style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '6px 8px', fontSize: 12.5, width: 90 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ fontSize: 10, color: '#9AA3AD' }}>m² cliente</label>
            <input type="number" step="0.01" min="0" value={nuevo.m2} onChange={e => setNuevo({ ...nuevo, m2: e.target.value })} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '6px 8px', fontSize: 12.5, width: 90 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ fontSize: 10, color: '#9AA3AD' }}>Referencia (opcional)</label>
            <input value={nuevo.referencia} onChange={e => setNuevo({ ...nuevo, referencia: e.target.value })} placeholder="ej. N° de plano" style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '6px 8px', fontSize: 12.5, width: 130 }} />
          </div>
          <button onClick={agregarManual} disabled={!nuevo.tag.trim()} style={{ background: nuevo.tag.trim() ? C.verde : '#DFE4EA', color: '#fff', border: 'none', borderRadius: 4, padding: '7px 14px', fontSize: 13, cursor: nuevo.tag.trim() ? 'pointer' : 'not-allowed' }}>Agregar</button>
          <button onClick={() => { setMostrarForm(false); setNuevo({ tag: '', idPieza: '', m2: '', referencia: '' }) }} style={{ background: 'none', border: '1px solid #DFE4EA', borderRadius: 4, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          {nuevo.tag.trim() && <div style={{ flexBasis: '100%', fontSize: 11, color: '#9AA3AD' }}>Se guardará como: <b>{nuevo.idPieza.trim() ? nuevo.tag.trim() + '-' + nuevo.idPieza.trim() : nuevo.tag.trim()}</b></div>}
        </div>
      )}
      {total === 0 ? (
        <div style={{ fontSize: 12, color: '#9AA3AD' }}>Sin marcas cargadas todavía. Sube el Excel con las piezas que el cliente informa que deben llegar — se leen solas las columnas <b>TAG</b>, <b>marca</b>, <b>ID</b>, <b>m²</b> y <b>referencia</b>, en cualquier orden y con el encabezado en cualquiera de las primeras filas. Basta con que traiga TAG o marca; si el Excel usa otros nombres, la app te pregunta una vez qué columna es cada dato. También puedes agregarlas a mano con "+ Agregar marca".</div>
      ) : (<>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.carbon }}>{total} esperadas</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.verde }}>{recibidas} recibidas</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: pendientes ? '#D9600A' : C.verde }}>{pendientes} pendientes</span>
          {m2Esperado > 0 && <span style={{ fontSize: 12, color: '#9AA3AD' }}>Cliente: {m2Recibido.toFixed(2)} / {m2Esperado.toFixed(2)} m²</span>}
          {m2Propio > 0 && <span style={{ fontSize: 12, color: C.teal, fontWeight: 700 }}>Planta: {m2Propio.toFixed(2)} m²</span>}
        </div>
        <input
          value={buscar}
          onChange={e => setBuscar(e.target.value)}
          placeholder="Buscar marca por código…"
          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #DFE4EA', borderRadius: 4, padding: '6px 8px', fontSize: 12.5, marginBottom: 8 }}
        />
        {buscar.trim() && <div style={{ fontSize: 11, color: '#9AA3AD', marginBottom: 6 }}>{marcasFiltradas.length} de {total} coinciden</div>}
        <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {marcasFiltradas.length === 0 && <div style={{ fontSize: 12, color: '#9AA3AD' }}>Sin resultados para "{buscar}".</div>}
          {marcasFiltradas.map(m => {
            const valPropio = localM2Propio[m.id] !== undefined ? localM2Propio[m.id] : (m.m2Propio == null ? '' : m.m2Propio)
            return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 4, background: m.recibida ? '#E6F5EA' : '#fff', border: '1px solid ' + (m.recibida ? '#B7E0C4' : '#EEE9DF'), fontSize: 12.5 }}>
              <input type="checkbox" checked={!!m.recibida} onChange={() => toggleRecibida(m.id)} style={{ cursor: 'pointer' }} />
              {/* TAG e ID en columnas separadas: es como vienen en el Excel
                  del cliente y como se nombran en planta. El codigo completo
                  (TAG-ID) sigue siendo el identificador interno de la pieza,
                  pero mostrarlo pegado hacia imposible leer la lista. */}
              <span onClick={() => toggleRecibida(m.id)} style={{ flex: 1, cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 8, textDecoration: m.recibida ? 'line-through' : 'none', color: m.recibida ? '#5A736A' : C.carbon }}>
                <span style={{ fontWeight: m.recibida ? 400 : 600 }}>{tagDeMarca(m)}</span>
                {idDeMarca(m) && <span title="ID de la pieza" style={{ color: '#9AA3AD', fontSize: 11.5 }}>ID {idDeMarca(m)}</span>}
              </span>
              {m.m2 > 0 && <span title="m² informado por el cliente" style={{ color: '#9AA3AD' }}>{m.m2} m²</span>}
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <input
                  type="number" step="0.01" min="0" placeholder="0"
                  value={valPropio}
                  onChange={e => cambiarM2Propio(m.id, e.target.value)}
                  title="m² registrados por nosotros en planta"
                  style={{ width: 62, border: '1px solid #DFE4EA', borderRadius: 4, padding: '2px 5px', fontSize: 12, color: C.teal }}
                />
                <span style={{ color: C.teal, fontSize: 11 }}>m² propios</span>
              </span>
              {m.recibida && m.fechaRecibida && <span style={{ color: '#9AA3AD', fontSize: 11 }}>{m.fechaRecibida}</span>}
              <button onClick={() => quitarMarca(m.id)} style={{ background: 'none', border: 'none', color: '#C5453D', cursor: 'pointer', padding: 0, display: 'flex' }}><Trash2 size={12} /></button>
            </div>
            )
          })}
        </div>
      </>)}
      {msg && <div style={{ fontSize: 11.5, color: C.verde, marginTop: 8, fontWeight: 600 }}>{msg}</div>}
    </div>
  )
}

// Resumen automatico por "tipo" (etiqueta manual por fila, ej. "Estanque
// 200lt") para ver de un vistazo cuantas piezas de cada tipo entraron a
// Recepcion. Agrupa por el texto EXACTO de `tipo` (sin heuristica sobre el
// detalle libre) para no armar grupos falsos por variaciones de mayusculas
// o espacios — mas trabajo llenar el campo, pero el resumen no miente.
function resumenTiposRecepcion(partidas) {
  const map = {}
  ;(partidas || []).forEach(p => {
    const t = String(p.tipo || '').trim()
    if (!t) return
    const cant = parseFloat(p.cantidad) || 1
    map[t] = (map[t] || 0) + cant
  })
  return Object.entries(map).sort((a, b) => b[1] - a[1])
}

// Recepcion de material de la OT. Ademas del alta manual de siempre
// (detalle libre + m2 + estado), arriba se puede tildar directamente una
// marca pendiente del checklist "Marcas esperadas": eso crea la fila de
// recepcion con la marca y el m2 del cliente ya cargados, Y marca esa marca
// como recibida arriba — a diferencia de los protocolos (donde
// deliberadamente NO se cruza con "recibida"), acá si corresponde: Recepcion
// es el evento real de recepcion fisica del material.
// Los campos nuevos (cantidad, m2 cliente, m2 propio, tipo) son opcionales y
// se suman a los de siempre (detalle, fecha, m2, estado, obs, fotos) sin
// tocarlos, para no reinterpretar ni perder ninguna recepcion ya cargada.
// Fase D — lectura de guias de recepcion/despacho con IA (extraer-guia,
// clon de extraer-oc con su propio prompt/schema). Cada marca que lee la
// IA se coteja contra las marcas esperadas de la OT: las que calzan se
// proponen tildadas, las que no se muestran aparte para revision manual
// (la guia puede traer piezas de otra OT por error, o venir mal leida).
// TAG e ID de una pieza del checklist. Las piezas cargadas desde un Excel
// con columnas separadas ya los traen en `tag` e `idPieza`; las cargadas
// antes de eso solo tienen `marca` (el codigo completo, ej.
// "2630-SP-32708-10597"), asi que se deducen del texto. Con esto el resto
// del codigo puede razonar por TAG sin preguntarse de donde vino la pieza.
export function tagDeMarca(m) {
  if (m && m.tag) return String(m.tag).trim()
  const txt = String((m && m.marca) || '').trim()
  const idp = String((m && m.idPieza) || '').trim()
  if (idp && txt.toLowerCase().endsWith('-' + idp.toLowerCase())) return txt.slice(0, txt.length - idp.length - 1)
  return txt
}
export function idDeMarca(m) {
  if (m && m.idPieza) return String(m.idPieza).trim()
  const txt = String((m && m.marca) || '').trim()
  const t = m && m.tag ? String(m.tag).trim() : ''
  if (t && txt.toLowerCase().startsWith(t.toLowerCase() + '-')) return txt.slice(t.length + 1)
  return ''
}

// El mismo cotejo sirve para guias y para facturas: lo unico que cambia
// es que la factura puede traer m2 por linea, que se arrastra en el
// resultado (m2Leido) sin afectar en nada a quien no lo use.
//
// Las facturas de venta casi nunca repiten el ID de cada pieza: nombran
// el TAG una sola vez ("2630-SP-32708") aunque cubran varias piezas de
// ese TAG, mientras que el checklist las guarda uno por uno con su ID
// pegado ("2630-SP-32708-10597"). Comparar el texto completo dejaba todo
// como "no calza". Por eso el cotejo va en tres pasadas, de mas a menos
// especifica, y solo la ultima —la que calza por TAG— se activa con
// cruzarPorTag, para no cambiar como se leen las guias de despacho, que
// si detallan cada pieza.
//
// Cuando calza por TAG, una linea de la factura puede corresponder a
// VARIAS piezas: se devuelve una entrada por pieza (con porTag: true)
// para que cada una salga con su propio checkbox y se puedan destildar
// las que esa factura no cubra.
function cotejarGuia(marcasLeidas, marcasEsperadas, cruzarPorTag) {
  const esperadas = marcasEsperadas || []
  const salida = []
  ;(marcasLeidas || []).forEach(ml => {
    const m2n = parseFloat(ml.m2)
    const marcaTxt = ml.id ? (ml.tag + '-' + ml.id) : ml.tag
    const base = { tag: ml.tag, id: ml.id || null, marcaTxt, m2Leido: Number.isFinite(m2n) && m2n > 0 ? m2n : null }
    // 1. El codigo leido es igual al codigo completo de una pieza.
    const exacta = esperadas.find(me => normMarca(me.marca) === normMarca(marcaTxt))
    if (exacta) { salida.push({ ...base, marcaEsperadaId: exacta.id, marcaPieza: exacta.marca, aplicar: true, porTag: false }); return }
    // 2. La factura trae TAG e ID y la pieza los tiene guardados aparte
    //    (el codigo completo puede estar escrito distinto).
    if (ml.id) {
      const porCampos = esperadas.find(me => normMarca(tagDeMarca(me)) === normMarca(ml.tag) && normMarca(idDeMarca(me)) === normMarca(ml.id))
      if (porCampos) { salida.push({ ...base, marcaEsperadaId: porCampos.id, marcaPieza: porCampos.marca, aplicar: true, porTag: false }); return }
    }
    // 3. La factura nombra solo el TAG: calzan todas las piezas de ese TAG.
    if (cruzarPorTag && !ml.id) {
      const t = normMarca(ml.tag)
      const delTag = esperadas.filter(me => {
        if (normMarca(tagDeMarca(me)) === t) return true
        // Piezas cargadas antes de que el Excel separara TAG e ID: solo
        // tienen `marca` con el codigo completo, asi que no hay de donde
        // deducir el TAG. Se aceptan si su codigo empieza con el TAG leido
        // seguido de separador — el separador es lo que evita que el TAG
        // "2630-SP-3270" se coma a las piezas de "2630-SP-32708".
        if (!me.tag && !me.idPieza) return normMarca(me.marca).startsWith(t + '-')
        return false
      })
      if (delTag.length) {
        delTag.forEach(me => salida.push({ ...base, marcaEsperadaId: me.id, marcaPieza: me.marca, aplicar: true, porTag: true, piezasDelTag: delTag.length }))
        return
      }
    }
    salida.push({ ...base, marcaEsperadaId: null, marcaPieza: null, aplicar: false, porTag: false })
  })
  return salida
}
function PanelRevisionGuia({ revision, setRevision, onAplicar, onDescartar, etiquetaAccion, mostrarPlazo, onAgregarMarcaNueva }) {
  const calzan = revision.marcas.filter(m => m.marcaEsperadaId)
  const noCalzan = revision.marcas.filter(m => !m.marcaEsperadaId)
  return (
    <div style={{ border: '1px dashed #CFC9BC', borderRadius: 6, padding: 10, marginBottom: 10, background: '#FBFAF7' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#5A736A', marginBottom: 8, textTransform: 'uppercase' }}>Revisa lo que leyó la IA antes de aplicar</div>
      {mostrarPlazo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#9AA3AD', width: 60 }}>Plazo</span>
          <input type="number" min="0" value={revision.plazoDias.valor} onChange={e => setRevision(r => ({ ...r, plazoDias: { ...r.plazoDias, valor: e.target.value } }))} placeholder="días hábiles comprometidos" style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '5px 7px', fontSize: 12.5, flex: 1 }} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <input type="checkbox" checked={revision.numeroGuia.aplicar} onChange={e => setRevision(r => ({ ...r, numeroGuia: { ...r.numeroGuia, aplicar: e.target.checked } }))} />
        <span style={{ fontSize: 11, color: '#9AA3AD', width: 60 }}>N° guía</span>
        <input value={revision.numeroGuia.valor} onChange={e => setRevision(r => ({ ...r, numeroGuia: { ...r.numeroGuia, valor: e.target.value } }))} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '5px 7px', fontSize: 12.5, flex: 1 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <input type="checkbox" checked={revision.fecha.aplicar} onChange={e => setRevision(r => ({ ...r, fecha: { ...r.fecha, aplicar: e.target.checked } }))} />
        <span style={{ fontSize: 11, color: '#9AA3AD', width: 60 }}>Fecha</span>
        <input type="date" value={revision.fecha.valor} onChange={e => setRevision(r => ({ ...r, fecha: { ...r.fecha, valor: e.target.value } }))} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '5px 7px', fontSize: 12.5, flex: 1 }} />
      </div>
      {calzan.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: C.verde, marginBottom: 4, fontWeight: 700 }}>Calzan con marcas esperadas de esta OT ({calzan.length})</div>
          <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {revision.marcas.map((m, idx) => m.marcaEsperadaId ? (
              <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input type="checkbox" checked={m.aplicar} onChange={e => setRevision(r => ({ ...r, marcas: r.marcas.map((x, j) => j === idx ? { ...x, aplicar: e.target.checked } : x) }))} />
                {m.marcaTxt}
              </label>
            ) : null)}
          </div>
        </div>
      )}
      {noCalzan.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: '#D9600A', marginBottom: 4, fontWeight: 700 }}>No calzan con ninguna marca esperada de esta OT ({noCalzan.length}) — puede ser una guía mal leída, o piezas que faltan en el checklist</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {revision.marcas.map((m, idx) => m.marcaEsperadaId ? null : (
              <span key={idx} style={{ background: '#FDECDD', color: '#D9600A', borderRadius: 10, padding: '2px 4px 2px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {m.marcaTxt}
                {onAgregarMarcaNueva && (
                  <button onClick={() => onAgregarMarcaNueva(idx)} title="Agregar como marca nueva al checklist de esta OT" style={{ background: '#D9600A', color: '#fff', border: 'none', borderRadius: 8, width: 16, height: 16, fontSize: 11, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={onAplicar} style={{ background: C.verde, color: '#fff', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}>{etiquetaAccion}</button>
        <button onClick={onDescartar} style={{ background: 'none', border: '1px solid #DFE4EA', borderRadius: 4, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer' }}>Descartar</button>
      </div>
    </div>
  )
}
function RecepcionOT({ ot, onUpdate, onAgregarArray, onUpdateMarcasEsperadas }) {
  const partidas = ot.partidas || []
  const marcasEsperadas = ot.marcasEsperadas || []
  const pendientes = marcasEsperadas.filter(m => !m.recibida)
  const [buscarPend, setBuscarPend] = useState('')
  const pendFiltradas = buscarPend.trim() ? pendientes.filter(m => [m.marca, m.idPieza, m.referencia].some(v => String(v || '').toLowerCase().includes(buscarPend.trim().toLowerCase()))) : pendientes
  const resumen = resumenTiposRecepcion(partidas)
  const tiposUsados = Array.from(new Set(partidas.map(p => String(p.tipo || '').trim()).filter(Boolean)))
  const inp2 = { border: '1px solid #DFE4EA', borderRadius: 4, padding: '6px 8px', fontSize: 12.5, boxSizing: 'border-box' }

  // Plazo comprometido por defecto para las recepciones creadas desde el
  // checklist rapido (sin pasar por la guia leida con IA) — sin esto, esas
  // recepciones nunca alimentaban el tablero de vencimientos de
  // Trazabilidad y Alertas porque quedaban con plazoDias vacio.
  const [plazoDefault, setPlazoDefault] = useState('')
  const recibirDesdeChecklist = async m => {
    const loteId = 'pa' + Date.now() + Math.random().toString(36).slice(2, 7)
    await onAgregarArray(ot.id, 'partidas', {
      id: loteId,
      detalle: m.marca, fecha: hoy(), estado: 'Recibida',
      m2: m.m2 || '', obs: '', fotos: [],
      cantidad: 1, m2Cliente: m.m2 || '', m2Propio: '', tipo: '', numeroGuia: '', plazoDias: plazoDefault
    })
    onUpdateMarcasEsperadas(ot.id, marcasEsperadas.map(x => x.id === m.id ? { ...x, recibida: true, fechaRecibida: hoy(), loteId } : x))
  }
  const setP = (i, campo, valor) => onUpdate(ot.id, { partidas: partidas.map((x, j) => j === i ? { ...x, [campo]: valor } : x) })

  const [subiendoGuia, setSubiendoGuia] = useState(false)
  const [revisionGuia, setRevisionGuia] = useState(null)
  const [errorGuia, setErrorGuia] = useState('')
  const subirGuia = async e => {
    const fls = [...e.target.files]
    e.target.value = ''
    if (!fls.length) return
    setSubiendoGuia(true); setErrorGuia(''); setRevisionGuia(null)
    try {
      const archivos = await Promise.all(fls.map(async fl => ({ base64: await fileToBase64(fl), mimeType: fl.type || 'application/pdf', filename: fl.name })))
      const { data, error } = await supabase.functions.invoke('extraer-guia', { body: { archivos, filename: fls[0].name } })
      if (error) throw error
      if (!data || !data.ok) throw new Error((data && data.error) || 'No se pudo leer la guía.')
      const d = data.datos || {}
      setRevisionGuia({
        numeroGuia: { valor: d.numeroGuia || '', aplicar: !!d.numeroGuia },
        fecha: { valor: d.fecha || hoy(), aplicar: true },
        plazoDias: { valor: '', aplicar: true },
        marcas: cotejarGuia(d.marcas || [], marcasEsperadas),
      })
    } catch (err) { setErrorGuia('No se pudo leer la guía: ' + ((err && err.message) || String(err))) }
    setSubiendoGuia(false)
  }
  // Agregar una marca leida que no calzaba con ninguna del checklist: se
  // suma como marca esperada nueva de la OT y queda tildada en el panel,
  // para no perder la pieza solo porque no estaba cargada de antes.
  const agregarMarcaNuevaDesdeGuia = idx => {
    const m = revisionGuia.marcas[idx]
    if (!m) return
    const nuevaId = 'me' + Date.now() + Math.random().toString(36).slice(2, 7)
    onUpdateMarcasEsperadas(ot.id, [...marcasEsperadas, { id: nuevaId, marca: m.marcaTxt, tag: m.tag, idPieza: m.id || null, referencia: null, m2: 0, m2Propio: null, recibida: false, fechaRecibida: null }])
    setRevisionGuia(r => ({ ...r, marcas: r.marcas.map((x, j) => j === idx ? { ...x, marcaEsperadaId: nuevaId, aplicar: true } : x) }))
  }
  const aplicarRevisionGuia = async () => {
    if (!revisionGuia) return
    const loteId = 'pa' + Date.now() + Math.random().toString(36).slice(2, 7)
    const fecha = (revisionGuia.fecha.aplicar && revisionGuia.fecha.valor) ? revisionGuia.fecha.valor : hoy()
    const numeroGuia = revisionGuia.numeroGuia.aplicar ? revisionGuia.numeroGuia.valor : ''
    const plazoDias = revisionGuia.plazoDias.aplicar ? revisionGuia.plazoDias.valor : ''
    const marcasAplicar = revisionGuia.marcas.filter(m => m.aplicar && m.marcaEsperadaId)
    await onAgregarArray(ot.id, 'partidas', {
      id: loteId, detalle: 'Guía ' + (numeroGuia || '(leída con IA)'), fecha, estado: 'Recibida',
      m2: '', obs: '', fotos: [], cantidad: marcasAplicar.length || '', m2Cliente: '', m2Propio: '', tipo: '', numeroGuia, plazoDias
    })
    const idsAplicar = new Set(marcasAplicar.map(m => m.marcaEsperadaId))
    onUpdateMarcasEsperadas(ot.id, marcasEsperadas.map(m => idsAplicar.has(m.id) ? { ...m, recibida: true, fechaRecibida: fecha, loteId } : m))
    setRevisionGuia(null)
  }

  return (<div style={{ marginTop: 14, background: '#F2F4F6', border: '1px solid #DBE0E5', borderLeft: '4px solid #5A6B85', borderRadius: 6, padding: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: '#5A6B85' }}>Recepción / Partidas de material</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ cursor: subiendoGuia ? 'wait' : 'pointer', background: '#fff', color: '#5A6B85', border: '1px solid #5A6B85', padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, opacity: subiendoGuia ? 0.6 : 1 }}>
          {subiendoGuia ? 'Leyendo…' : 'Subir guía (leer con IA)'}
          <input type="file" accept="application/pdf,image/*" multiple style={{ display: 'none' }} disabled={subiendoGuia} onChange={subirGuia} />
        </label>
        <button onClick={() => onAgregarArray(ot.id, 'partidas', { id: 'pa' + Date.now() + Math.random().toString(36).slice(2, 7), detalle: '', fecha: '', estado: 'Pendiente', m2: '', obs: '', fotos: [], numeroGuia: '', plazoDias: '' })} style={{ background: C.teal, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={14} /> Agregar recepción</button>
      </div>
    </div>
    {errorGuia && <div style={{ fontSize: 11.5, color: '#C5453D', marginBottom: 8 }}>{errorGuia}</div>}
    {revisionGuia && <PanelRevisionGuia revision={revisionGuia} setRevision={setRevisionGuia} onAplicar={aplicarRevisionGuia} onDescartar={() => setRevisionGuia(null)} etiquetaAccion="Crear recepción" mostrarPlazo onAgregarMarcaNueva={agregarMarcaNuevaDesdeGuia} />}

    {resumen.length > 0 && (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {resumen.map(([tipo, cant]) => (
          <span key={tipo} style={{ fontSize: 11.5, fontWeight: 600, background: '#EFF6F4', color: C.teal, border: '1px solid #CFE4DF', borderRadius: 12, padding: '3px 10px' }}>{tipo} x {cant}</span>
        ))}
      </div>
    )}

    {marcasEsperadas.length > 0 && (
      <div style={{ border: '1px dashed #CFC9BC', borderRadius: 6, padding: 10, marginBottom: 10, background: '#FBFAF7' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#5A736A', textTransform: 'uppercase' }}>Recibir desde el checklist ({pendientes.length} pendientes)</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9AA3AD' }}>Plazo por defecto (días hábiles)
            <input type="number" min="0" value={plazoDefault} onChange={e => setPlazoDefault(e.target.value)} title="Se aplica a las recepciones que crees con los botones de abajo, para que el vencimiento aparezca en Trazabilidad y Alertas" style={{ ...inp2, width: 60 }} />
          </label>
        </div>
        {pendientes.length === 0 ? (
          <div style={{ fontSize: 12, color: '#9AA3AD' }}>No quedan marcas esperadas pendientes por recibir.</div>
        ) : (<>
          {pendientes.length > 6 && <input value={buscarPend} onChange={e => setBuscarPend(e.target.value)} placeholder="Buscar marca por código…" style={{ ...inp2, width: '100%', marginBottom: 6 }} />}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
            {pendFiltradas.map(m => (
              <button key={m.id} onClick={() => recibirDesdeChecklist(m)} title="Crea la recepción con esta marca y la marca como recibida arriba" style={{ background: '#fff', border: '1px solid #CFE4DF', color: C.carbon, borderRadius: 4, padding: '4px 9px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Plus size={12} color={C.teal} /> {m.marca}{m.m2 > 0 && <span style={{ color: '#9AA3AD' }}>({m.m2} m²)</span>}
              </button>
            ))}
          </div>
        </>)}
      </div>
    )}

    {partidas.length === 0 ? (<div style={{ fontSize: 12, color: '#9AA3AD', marginBottom: 6 }}>Sin registros.</div>) : null}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {partidas.map((p, i) => (
        <div key={p.id || i} style={{ border: '1px solid #DBE0E5', borderRadius: 6, padding: 10, background: '#fff' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: C.carbon }}>#{i + 1}</span>
            <input value={p.detalle || ''} onChange={e => setP(i, 'detalle', e.target.value)} placeholder="Detalle del material" style={{ ...inp2, flex: '2 1 150px' }} />
            <input type="date" value={p.fecha || ''} onChange={e => setP(i, 'fecha', e.target.value)} style={{ ...inp2, flex: '0 1 140px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="number" value={p.m2 || ''} onChange={e => setP(i, 'm2', e.target.value)} placeholder="m²" style={{ ...inp2, width: 72 }} /><span style={{ fontSize: 11, color: '#9AA3AD' }}>m²</span></div>
            <select value={p.estado || 'Pendiente'} onChange={e => setP(i, 'estado', e.target.value)} style={{ border: 'none', background: p.estado === 'Recibida' ? '#E6F5EA' : '#F5E5DE', color: p.estado === 'Recibida' ? C.verde : '#D9600A', padding: '5px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}><option>Pendiente</option><option>Recibida</option></select>
            <button onClick={() => {
              const piezasDelLote = marcasEsperadas.filter(x => x.loteId === p.id).length
              if (piezasDelLote && !window.confirm(`Esta recepción tiene ${piezasDelLote} pieza(s) asociada(s) — al eliminarla, esas piezas quedan sin lote (no se borra su estado de recibida). ¿Continuar?`)) return
              onUpdate(ot.id, { partidas: partidas.filter((_, j) => j !== i) })
              if (piezasDelLote) onUpdateMarcasEsperadas(ot.id, marcasEsperadas.map(x => x.loteId === p.id ? { ...x, loteId: null } : x))
            }} style={btnMini}><Trash2 size={13} /></button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><label style={{ fontSize: 10, color: '#9AA3AD' }}>Cantidad</label><input type="number" min="0" value={p.cantidad || ''} onChange={e => setP(i, 'cantidad', e.target.value)} style={{ ...inp2, width: 68 }} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><label style={{ fontSize: 10, color: '#9AA3AD' }}>m² cliente</label><input type="number" step="0.01" min="0" value={p.m2Cliente || ''} onChange={e => setP(i, 'm2Cliente', e.target.value)} style={{ ...inp2, width: 76 }} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><label style={{ fontSize: 10, color: C.teal }}>m² propios</label><input type="number" step="0.01" min="0" value={p.m2Propio || ''} onChange={e => setP(i, 'm2Propio', e.target.value)} style={{ ...inp2, width: 76, color: C.teal }} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <label style={{ fontSize: 10, color: '#9AA3AD' }}>Diferencia</label>
              <span style={{ fontSize: 12.5, fontWeight: 700, padding: '6px 0', color: (() => { const d = (parseFloat(p.m2Propio) || 0) - (parseFloat(p.m2Cliente) || 0); return d === 0 ? '#9AA3AD' : (d < 0 ? '#C5453D' : '#D9600A') })() }}>
                {(p.m2Cliente || p.m2Propio) ? (((parseFloat(p.m2Propio) || 0) - (parseFloat(p.m2Cliente) || 0)).toFixed(2) + ' m²') : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 140px' }}>
              <label style={{ fontSize: 10, color: '#9AA3AD' }}>Tipo (para el resumen de arriba)</label>
              <input list={'tipos-' + ot.id} value={p.tipo || ''} onChange={e => setP(i, 'tipo', e.target.value)} placeholder="ej. Estanque 200lt" style={inp2} />
              <datalist id={'tipos-' + ot.id}>{tiposUsados.map(t => <option key={t} value={t} />)}</datalist>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><label style={{ fontSize: 10, color: '#9AA3AD' }}>N° de guía</label><input value={p.numeroGuia || ''} onChange={e => setP(i, 'numeroGuia', e.target.value)} placeholder="ej. 12345" style={{ ...inp2, width: 100 }} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><label style={{ fontSize: 10, color: '#9AA3AD' }}>Plazo (días hábiles)</label><input type="number" min="0" value={p.plazoDias || ''} onChange={e => setP(i, 'plazoDias', e.target.value)} placeholder="ej. 10" style={{ ...inp2, width: 90 }} /></div>
          </div>
          <textarea value={p.obs || ''} onChange={e => setP(i, 'obs', e.target.value)} placeholder="Observaciones" style={{ ...inp2, width: '100%', minHeight: 38, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            {(p.fotos || []).map((f, k) => (
              <div key={k} style={{ position: 'relative' }}>
                <img src={f} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 4, border: '1px solid #DFE4EA' }} />
                <button onClick={() => setP(i, 'fotos', (p.fotos || []).filter((_, z) => z !== k))} style={{ position: 'absolute', top: -6, right: -6, background: '#C5453D', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 11, cursor: 'pointer', lineHeight: 1 }}>×</button>
              </div>
            ))}
            <label style={{ cursor: 'pointer', width: 64, height: 64, border: '1px dashed #C9C4B8', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#B0A89A' }}>+
              <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { const fls = [...e.target.files]; if (!fls.length) return; const acc = []; let c = 0; fls.forEach(fl => imgToData(fl, d => { acc.push(d); c++; if (c === fls.length) setP(i, 'fotos', [...(p.fotos || []), ...acc]) })) }} />
            </label>
          </div>
        </div>
      ))}
    </div>
  </div>)
}

// Entregas / Despacho de la OT — misma estructura que RecepcionOT (checklist
// para completar rapido, cantidad/m2 cliente/m2 propios/diferencia/tipo por
// fila, resumen por tipo), pero para el evento inverso: despachar lo que ya
// se recibio. El checklist acá sale de las marcas esperadas que YA estan
// "recibida" (ver RecepcionOT/MarcasEsperadasOT) y que todavia no aparecen
// en ningun despacho de esta OT (match por texto de marca, mismo criterio
// que usadasEnOtros en los protocolos). No cambia ni el estado "recibida"
// de la marca ni ningun campo existente de despachos — solo agrega.
function DespachoOT({ ot, onUpdate, onAgregarArray, onUpdateMarcasEsperadas }) {
  const despachos = ot.despachos || []
  const marcasEsperadas = ot.marcasEsperadas || []
  const norm = s => String(s == null ? '' : s).trim().toLowerCase()
  // "Ya despachada" se decide por el vinculo real (despachoId), no por
  // texto: un despacho creado desde una guia leida con IA no repite la
  // marca en su "detalle" (dice "Guia 12345"), asi que comparar por texto
  // dejaba piezas ya despachadas ofrecidas de nuevo en el checklist.
  const pendientes = marcasEsperadas.filter(m => m.recibida && !m.despachoId)
  const [buscarPend, setBuscarPend] = useState('')
  const pendFiltradas = buscarPend.trim() ? pendientes.filter(m => [m.marca, m.idPieza, m.referencia].some(v => norm(v).includes(buscarPend.trim().toLowerCase()))) : pendientes
  const resumen = resumenTiposRecepcion(despachos)
  const tiposUsados = Array.from(new Set(despachos.map(p => String(p.tipo || '').trim()).filter(Boolean)))
  const inp2 = { border: '1px solid #DFE4EA', borderRadius: 4, padding: '6px 8px', fontSize: 12.5, boxSizing: 'border-box' }

  const despacharDesdeChecklist = async m => {
    const despachoId = 'de' + Date.now() + Math.random().toString(36).slice(2, 7)
    await onAgregarArray(ot.id, 'despachos', {
      id: despachoId,
      detalle: m.marca, fecha: hoy(), estado: 'Despachada',
      m2: m.m2 || '', obs: '', fotos: [],
      cantidad: 1, m2Cliente: m.m2 || '', m2Propio: m.m2Propio || '', tipo: '', numeroGuia: ''
    })
    if (onUpdateMarcasEsperadas) onUpdateMarcasEsperadas(ot.id, marcasEsperadas.map(x => x.id === m.id ? { ...x, despachoId, fechaDespacho: hoy() } : x))
  }
  const setP = (i, campo, valor) => onUpdate(ot.id, { despachos: despachos.map((x, j) => j === i ? { ...x, [campo]: valor } : x) })

  const [subiendoGuia, setSubiendoGuia] = useState(false)
  const [revisionGuia, setRevisionGuia] = useState(null)
  const [errorGuia, setErrorGuia] = useState('')
  const subirGuia = async e => {
    const fls = [...e.target.files]
    e.target.value = ''
    if (!fls.length) return
    setSubiendoGuia(true); setErrorGuia(''); setRevisionGuia(null)
    try {
      const archivos = await Promise.all(fls.map(async fl => ({ base64: await fileToBase64(fl), mimeType: fl.type || 'application/pdf', filename: fl.name })))
      const { data, error } = await supabase.functions.invoke('extraer-guia', { body: { archivos, filename: fls[0].name } })
      if (error) throw error
      if (!data || !data.ok) throw new Error((data && data.error) || 'No se pudo leer la guía.')
      const d = data.datos || {}
      setRevisionGuia({
        numeroGuia: { valor: d.numeroGuia || '', aplicar: !!d.numeroGuia },
        fecha: { valor: d.fecha || hoy(), aplicar: true },
        marcas: cotejarGuia(d.marcas || [], marcasEsperadas),
      })
    } catch (err) { setErrorGuia('No se pudo leer la guía: ' + ((err && err.message) || String(err))) }
    setSubiendoGuia(false)
  }
  const agregarMarcaNuevaDesdeGuia = idx => {
    const m = revisionGuia.marcas[idx]
    if (!m) return
    const nuevaId = 'me' + Date.now() + Math.random().toString(36).slice(2, 7)
    if (onUpdateMarcasEsperadas) onUpdateMarcasEsperadas(ot.id, [...marcasEsperadas, { id: nuevaId, marca: m.marcaTxt, tag: m.tag, idPieza: m.id || null, referencia: null, m2: 0, m2Propio: null, recibida: true, fechaRecibida: hoy() }])
    setRevisionGuia(r => ({ ...r, marcas: r.marcas.map((x, j) => j === idx ? { ...x, marcaEsperadaId: nuevaId, aplicar: true } : x) }))
  }
  const aplicarRevisionGuia = async () => {
    if (!revisionGuia) return
    const despachoId = 'de' + Date.now() + Math.random().toString(36).slice(2, 7)
    const fecha = (revisionGuia.fecha.aplicar && revisionGuia.fecha.valor) ? revisionGuia.fecha.valor : hoy()
    const numeroGuia = revisionGuia.numeroGuia.aplicar ? revisionGuia.numeroGuia.valor : ''
    const marcasAplicar = revisionGuia.marcas.filter(m => m.aplicar && m.marcaEsperadaId)
    await onAgregarArray(ot.id, 'despachos', {
      id: despachoId, detalle: 'Guía ' + (numeroGuia || '(leída con IA)'), fecha, estado: 'Despachada',
      m2: '', obs: '', fotos: [], cantidad: marcasAplicar.length || '', m2Cliente: '', m2Propio: '', tipo: '', numeroGuia
    })
    const idsAplicar = new Set(marcasAplicar.map(m => m.marcaEsperadaId))
    if (onUpdateMarcasEsperadas) onUpdateMarcasEsperadas(ot.id, marcasEsperadas.map(m => idsAplicar.has(m.id) ? { ...m, despachoId, fechaDespacho: fecha } : m))
    setRevisionGuia(null)
  }

  return (<div style={{ marginTop: 14, background: '#FFF4EC', border: '1px solid #F3D9C2', borderLeft: '4px solid #D9600A', borderRadius: 6, padding: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: '#D9600A' }}>Entregas / Despacho SEREIN</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ cursor: subiendoGuia ? 'wait' : 'pointer', background: '#fff', color: '#D9600A', border: '1px solid #D9600A', padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, opacity: subiendoGuia ? 0.6 : 1 }}>
          {subiendoGuia ? 'Leyendo…' : 'Subir guía (leer con IA)'}
          <input type="file" accept="application/pdf,image/*" multiple style={{ display: 'none' }} disabled={subiendoGuia} onChange={subirGuia} />
        </label>
        <button onClick={() => onAgregarArray(ot.id, 'despachos', { id: 'de' + Date.now() + Math.random().toString(36).slice(2, 7), detalle: '', fecha: '', estado: 'Pendiente', m2: '', obs: '', fotos: [], numeroGuia: '' })} style={{ background: C.teal, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={14} /> Agregar despacho</button>
      </div>
    </div>
    {errorGuia && <div style={{ fontSize: 11.5, color: '#C5453D', marginBottom: 8 }}>{errorGuia}</div>}
    {revisionGuia && <PanelRevisionGuia revision={revisionGuia} setRevision={setRevisionGuia} onAplicar={aplicarRevisionGuia} onDescartar={() => setRevisionGuia(null)} etiquetaAccion="Crear despacho" onAgregarMarcaNueva={agregarMarcaNuevaDesdeGuia} />}

    <SobrantePanel ot={ot} />

    {resumen.length > 0 && (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {resumen.map(([tipo, cant]) => (
          <span key={tipo} style={{ fontSize: 11.5, fontWeight: 600, background: '#FFF0E4', color: '#D9600A', border: '1px solid #F3D9C2', borderRadius: 12, padding: '3px 10px' }}>{tipo} x {cant}</span>
        ))}
      </div>
    )}

    {marcasEsperadas.length > 0 && (
      <div style={{ border: '1px dashed #E3C3A0', borderRadius: 6, padding: 10, marginBottom: 10, background: '#FFFAF5' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#A56A2E', marginBottom: 6, textTransform: 'uppercase' }}>Despachar desde el checklist ({pendientes.length} recibidas sin despachar)</div>
        {pendientes.length === 0 ? (
          <div style={{ fontSize: 12, color: '#9AA3AD' }}>No hay marcas recibidas pendientes de despacho.</div>
        ) : (<>
          {pendientes.length > 6 && <input value={buscarPend} onChange={e => setBuscarPend(e.target.value)} placeholder="Buscar marca por código…" style={{ ...inp2, width: '100%', marginBottom: 6 }} />}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
            {pendFiltradas.map(m => (
              <button key={m.id} onClick={() => despacharDesdeChecklist(m)} title="Crea el despacho con esta marca" style={{ background: '#fff', border: '1px solid #F3D9C2', color: C.carbon, borderRadius: 4, padding: '4px 9px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Plus size={12} color="#D9600A" /> {m.marca}{m.m2 > 0 && <span style={{ color: '#9AA3AD' }}>({m.m2} m²)</span>}
              </button>
            ))}
          </div>
        </>)}
      </div>
    )}

    {despachos.length === 0 ? (<div style={{ fontSize: 12, color: '#9AA3AD', marginBottom: 6 }}>Sin registros.</div>) : null}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {despachos.map((p, i) => (
        <div key={p.id || i} style={{ border: '1px solid #F3D9C2', borderRadius: 6, padding: 10, background: '#fff' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: C.carbon }}>#{i + 1}</span>
            <input value={p.detalle || ''} onChange={e => setP(i, 'detalle', e.target.value)} placeholder="Detalle del material" style={{ ...inp2, flex: '2 1 150px' }} />
            <input type="date" value={p.fecha || ''} onChange={e => setP(i, 'fecha', e.target.value)} style={{ ...inp2, flex: '0 1 140px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="number" value={p.m2 || ''} onChange={e => setP(i, 'm2', e.target.value)} placeholder="m²" style={{ ...inp2, width: 72 }} /><span style={{ fontSize: 11, color: '#9AA3AD' }}>m²</span></div>
            <select value={p.estado || 'Pendiente'} onChange={e => setP(i, 'estado', e.target.value)} style={{ border: 'none', background: p.estado === 'Despachada' ? '#E6F5EA' : '#F5E5DE', color: p.estado === 'Despachada' ? C.verde : '#D9600A', padding: '5px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}><option>Pendiente</option><option>Despachada</option></select>
            <button onClick={() => {
              const piezasDelDespacho = marcasEsperadas.filter(x => x.despachoId === p.id).length
              if (piezasDelDespacho && !window.confirm(`Este despacho tiene ${piezasDelDespacho} pieza(s) asociada(s) — al eliminarlo, esas piezas quedan sin despacho (siguen recibidas). ¿Continuar?`)) return
              onUpdate(ot.id, { despachos: despachos.filter((_, j) => j !== i) })
              if (piezasDelDespacho && onUpdateMarcasEsperadas) onUpdateMarcasEsperadas(ot.id, marcasEsperadas.map(x => x.despachoId === p.id ? { ...x, despachoId: null, fechaDespacho: null } : x))
            }} style={btnMini}><Trash2 size={13} /></button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><label style={{ fontSize: 10, color: '#9AA3AD' }}>Cantidad</label><input type="number" min="0" value={p.cantidad || ''} onChange={e => setP(i, 'cantidad', e.target.value)} style={{ ...inp2, width: 68 }} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><label style={{ fontSize: 10, color: '#9AA3AD' }}>m² cliente</label><input type="number" step="0.01" min="0" value={p.m2Cliente || ''} onChange={e => setP(i, 'm2Cliente', e.target.value)} style={{ ...inp2, width: 76 }} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><label style={{ fontSize: 10, color: '#D9600A' }}>m² propios</label><input type="number" step="0.01" min="0" value={p.m2Propio || ''} onChange={e => setP(i, 'm2Propio', e.target.value)} style={{ ...inp2, width: 76, color: '#D9600A' }} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <label style={{ fontSize: 10, color: '#9AA3AD' }}>Diferencia</label>
              <span style={{ fontSize: 12.5, fontWeight: 700, padding: '6px 0', color: (() => { const d = (parseFloat(p.m2Propio) || 0) - (parseFloat(p.m2Cliente) || 0); return d === 0 ? '#9AA3AD' : (d < 0 ? '#C5453D' : '#D9600A') })() }}>
                {(p.m2Cliente || p.m2Propio) ? (((parseFloat(p.m2Propio) || 0) - (parseFloat(p.m2Cliente) || 0)).toFixed(2) + ' m²') : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 140px' }}>
              <label style={{ fontSize: 10, color: '#9AA3AD' }}>Tipo (para el resumen de arriba)</label>
              <input list={'tipos-desp-' + ot.id} value={p.tipo || ''} onChange={e => setP(i, 'tipo', e.target.value)} placeholder="ej. Estanque 200lt" style={inp2} />
              <datalist id={'tipos-desp-' + ot.id}>{tiposUsados.map(t => <option key={t} value={t} />)}</datalist>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><label style={{ fontSize: 10, color: '#9AA3AD' }}>N° de guía</label><input value={p.numeroGuia || ''} onChange={e => setP(i, 'numeroGuia', e.target.value)} placeholder="ej. 12345" style={{ ...inp2, width: 100 }} /></div>
          </div>
          <textarea value={p.obs || ''} onChange={e => setP(i, 'obs', e.target.value)} placeholder="Observaciones" style={{ ...inp2, width: '100%', minHeight: 38, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            {(p.fotos || []).map((f, k) => (
              <div key={k} style={{ position: 'relative' }}>
                <img src={f} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 4, border: '1px solid #DFE4EA' }} />
                <button onClick={() => setP(i, 'fotos', (p.fotos || []).filter((_, z) => z !== k))} style={{ position: 'absolute', top: -6, right: -6, background: '#C5453D', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 11, cursor: 'pointer', lineHeight: 1 }}>×</button>
              </div>
            ))}
            <label style={{ cursor: 'pointer', width: 64, height: 64, border: '1px dashed #C9C4B8', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#B0A89A' }}>+
              <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { const fls = [...e.target.files]; if (!fls.length) return; const acc = []; let c = 0; fls.forEach(fl => imgToData(fl, d => { acc.push(d); c++; if (c === fls.length) setP(i, 'fotos', [...(p.fotos || []), ...acc]) })) }} />
            </label>
          </div>
        </div>
      ))}
    </div>
  </div>)
}

// Facturacion de la OT cruzada contra el checklist de piezas. Tercer y
// ultimo paso de la cadena recepcion -> despacho -> facturacion, y sigue
// el mismo patron que DespachoOT: se sube el documento, la IA lo lee, se
// coteja contra las marcas esperadas y recien al confirmar se aplica.
//
// Lo unico que se guarda de nuevo es el vinculo marca.facturaId (mas
// folioFactura/fechaFacturada, informativos para la trazabilidad). No se
// toca ninguna venta ya cargada: las facturas antiguas simplemente no
// tienen piezas ligadas, y todas sus piezas aparecen como pendientes
// hasta que alguien las asocie.
function FacturacionOT({ ot, onAgregarVenta, onUpdateMarcasEsperadas }) {
  const marcasEsperadas = ot.marcasEsperadas || []
  const ventas = ot.ventas || []
  const cruce = cruceFacturacionOT(ot)
  const [subiendo, setSubiendo] = useState(false)
  const [revision, setRevision] = useState(null)
  const [error, setError] = useState('')
  const [buscarPend, setBuscarPend] = useState('')
  const [seleccion, setSeleccion] = useState(() => new Set())
  const [ventaDestino, setVentaDestino] = useState('')
  const norm = s => String(s == null ? '' : s).trim().toLowerCase()

  const subirFactura = async e => {
    const fls = [...e.target.files]
    e.target.value = ''
    if (!fls.length) return
    setSubiendo(true); setError(''); setRevision(null)
    try {
      const archivos = await Promise.all(fls.map(async fl => ({ base64: await fileToBase64(fl), mimeType: fl.type || 'application/pdf', filename: fl.name })))
      const { data, error: errFn } = await supabase.functions.invoke('extraer-factura', { body: { archivos, filename: fls[0].name } })
      if (errFn) throw errFn
      if (!data || !data.ok) throw new Error((data && data.error) || 'No se pudo leer la factura.')
      const d = data.datos || {}
      setRevision({
        folio: { valor: d.folio == null ? '' : String(d.folio), aplicar: !!d.folio },
        fecha: { valor: d.fecha || hoy(), aplicar: true },
        neto: { valor: d.neto == null ? '' : String(Math.round(d.neto)), aplicar: d.neto != null },
        // true = cruzar tambien por TAG, porque las facturas de venta no
        // repiten el ID de cada pieza.
        marcas: cotejarGuia(d.marcas || [], marcasEsperadas, true),
      })
    } catch (err) { setError('No se pudo leer la factura: ' + ((err && err.message) || String(err))) }
    setSubiendo(false)
  }

  // Una marca que la factura nombra pero que no esta en el checklist casi
  // siempre significa que al checklist le falta esa pieza (no que la
  // factura este mala), asi que se puede agregar en el momento — mismo
  // gesto que ya existe al leer una guia.
  //
  // A diferencia de RecepcionOT/DespachoOT, aca la marca nueva NO se
  // escribe al tiro: se deja en cola dentro de la revision y se guarda
  // junto con el resto al confirmar. Guardar al tiro obligaba a esperar
  // el pullState() de actualizarMarcasEsperadas, y si la persona apretaba
  // "Crear factura" antes de que volviera, el array de marcas del render
  // ya estaba viejo y borraba la pieza recien agregada.
  const agregarMarcaNueva = idx => {
    const m = revision.marcas[idx]
    if (!m) return
    const nuevaId = 'me' + Date.now() + Math.random().toString(36).slice(2, 7)
    setRevision(r => ({
      ...r,
      nuevas: [...(r.nuevas || []), { id: nuevaId, marca: m.marcaTxt, tag: m.tag, idPieza: m.id || null, referencia: null, m2: m.m2Leido || 0, m2Propio: null, recibida: false, fechaRecibida: null }],
      marcas: r.marcas.map((x, j) => j === idx ? { ...x, marcaEsperadaId: nuevaId, aplicar: true } : x),
    }))
  }

  // La IA puede devolver la fecha en cualquier formato pese al prompt; si
  // no es ISO el <input type="date"> la muestra vacia pero igual se
  // guardaria tal cual, dejando ventas con fechas que no ordenan ni
  // filtran. Se cae a hoy() en ese caso.
  const fechaValida = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null

  const aplicarRevision = async () => {
    if (!revision) return
    const folio = revision.folio.aplicar ? String(revision.folio.valor || '').trim() : ''
    const fecha = (revision.fecha.aplicar && fechaValida(revision.fecha.valor)) || hoy()
    const neta = revision.neto.aplicar ? num(revision.neto.valor) : 0
    // Misma guarda que el alta manual de ventas: una factura en $0 se
    // cuenta igual como "OT facturada" en Trazabilidad y apaga la alerta
    // de OT terminada sin facturar, asi que no se deja crear.
    if (!(neta > 0)) { window.alert('Ingresa el monto neto de la factura antes de crearla — una factura en $0 haría figurar la OT como facturada.'); return }
    const ventaId = 'vt' + Date.now() + Math.random().toString(36).slice(2, 7)
    // onAgregarVenta valida que el folio no este repetido en otra OT y
    // devuelve false si lo esta — en ese caso no se liga ninguna pieza.
    const ok = await onAgregarVenta(ot.id, { id: ventaId, folio: folio || 's/f', fecha, neta, estadoPago: 'Pendiente' })
    if (!ok) return
    const idsAplicar = new Set(revision.marcas.filter(m => m.aplicar && m.marcaEsperadaId).map(m => m.marcaEsperadaId))
    const nuevas = (revision.nuevas || []).filter(n => idsAplicar.has(n.id))
    const base = [...marcasEsperadas, ...nuevas]
    if (idsAplicar.size || nuevas.length) {
      onUpdateMarcasEsperadas(ot.id, base.map(m => idsAplicar.has(m.id) ? { ...m, facturaId: ventaId, folioFactura: folio || 's/f', fechaFacturada: fecha } : m))
    }
    setRevision(null)
  }

  // Asignacion manual: para las facturas que no detallan TAG en el PDF, o
  // para corregir un cruce que la IA no pillo.
  const alternar = id => setSeleccion(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const asignarSeleccion = () => {
    const venta = ventas.find(v => v.id === ventaDestino)
    if (!venta || !seleccion.size) return
    onUpdateMarcasEsperadas(ot.id, marcasEsperadas.map(m => seleccion.has(m.id) ? { ...m, facturaId: venta.id, folioFactura: venta.folio || 's/f', fechaFacturada: venta.fecha || hoy() } : m))
    setSeleccion(new Set())
    setVentaDestino('')
  }
  const desligar = id => onUpdateMarcasEsperadas(ot.id, marcasEsperadas.map(m => m.id === id ? { ...m, facturaId: null, folioFactura: null, fechaFacturada: null } : m))

  const pendFiltradas = buscarPend.trim()
    ? cruce.pendientes.filter(m => [m.marca, m.idPieza, m.referencia].some(v => norm(v).includes(norm(buscarPend))))
    : cruce.pendientes
  // Solo tiene sentido ofrecer asignacion manual si hay facturas con id;
  // las cargadas antes de esta funcion no lo tienen y no se pueden ligar.
  const ventasLigables = ventas.filter(v => v.id)
  // Si la factura elegida se borro mientras el panel estaba abierto, el
  // select queda en blanco: el destino se recalcula contra las que
  // realmente existen, para no dejar el boton habilitado sin efecto.
  const destino = ventasLigables.some(v => v.id === ventaDestino) ? ventaDestino : ''
  const inp2 = { border: '1px solid #DFE4EA', borderRadius: 4, padding: '6px 8px', fontSize: 12.5, boxSizing: 'border-box' }

  return (<div style={{ marginTop: 18, background: '#F4F7FA', border: '1px solid #D8DCE5', borderLeft: '4px solid ' + C.azul, borderRadius: 6, padding: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: C.azul }}>Facturación por pieza</span>
      <label style={{ cursor: subiendo ? 'wait' : 'pointer', background: '#fff', color: C.azul, border: '1px solid ' + C.azul, padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, opacity: subiendo ? 0.6 : 1 }}>
        {subiendo ? 'Leyendo…' : 'Subir factura (leer con IA)'}
        <input type="file" accept="application/pdf,image/*" multiple style={{ display: 'none' }} disabled={subiendo} onChange={subirFactura} />
      </label>
    </div>
    {error && <div style={{ fontSize: 11.5, color: '#C5453D', marginBottom: 8 }}>{error}</div>}

    {revision && (
      <div style={{ border: '1px dashed #C2CBD9', borderRadius: 6, padding: 10, marginBottom: 10, background: '#FBFCFE' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#5A736A', marginBottom: 8, textTransform: 'uppercase' }}>Revisa lo que leyó la IA antes de crear la factura</div>
        {[['folio', 'Folio', 'text'], ['fecha', 'Fecha', 'date'], ['neto', 'Neto', 'number']].map(([campo, lbl, tipo]) => (
          <div key={campo} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <input type="checkbox" checked={revision[campo].aplicar} onChange={e => setRevision(r => ({ ...r, [campo]: { ...r[campo], aplicar: e.target.checked } }))} />
            <span style={{ fontSize: 11, color: '#9AA3AD', width: 60 }}>{lbl}</span>
            <input type={tipo} value={revision[campo].valor} onChange={e => setRevision(r => ({ ...r, [campo]: { ...r[campo], valor: e.target.value } }))} style={{ ...inp2, flex: 1 }} />
            {campo === 'neto' && num(revision.neto.valor) > 0 && <span style={{ fontSize: 11, color: '#9AA3AD', whiteSpace: 'nowrap' }}>Total c/IVA {clp(Math.round(num(revision.neto.valor) * 1.19))}</span>}
          </div>
        ))}
        {(() => {
          const calzan = revision.marcas.filter(m => m.marcaEsperadaId)
          const noCalzan = revision.marcas.filter(m => !m.marcaEsperadaId)
          const yaFacturadas = calzan.filter(m => { const me = marcasEsperadas.find(x => x.id === m.marcaEsperadaId); return me && me.facturaId })
          return (<>
            {revision.marcas.length === 0 && (
              <div style={{ fontSize: 11.5, color: '#D9600A', marginTop: 6 }}>La factura no detalla piezas — se va a crear igual con folio y monto, y luego puedes asignarle piezas a mano desde la lista de pendientes.</div>
            )}
            {yaFacturadas.length > 0 && (
              <div style={{ fontSize: 11.5, color: '#D9600A', marginTop: 6 }}>Ojo: {yaFacturadas.length} pieza(s) de esta factura ya estaban ligadas a otra factura de esta OT. Si las dejas tildadas, quedarán ligadas a la nueva.</div>
            )}
            {calzan.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: C.verde, marginBottom: 4, fontWeight: 700 }}>Calzan con marcas esperadas de esta OT ({calzan.length})</div>
                {calzan.some(m => m.porTag) && (
                  <div style={{ fontSize: 11, color: '#41618A', marginBottom: 5 }}>
                    La factura nombra el TAG sin el ID, así que se marcan <b>todas las piezas de ese TAG</b>. Si la factura cubre solo algunas, destilda las que no correspondan.
                  </div>
                )}
                <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {revision.marcas.map((m, idx) => m.marcaEsperadaId ? (
                    <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <input type="checkbox" checked={m.aplicar} onChange={e => setRevision(r => ({ ...r, marcas: r.marcas.map((x, j) => j === idx ? { ...x, aplicar: e.target.checked } : x) }))} />
                      {/* Con cruce por TAG se muestra la pieza real del
                          checklist, no el texto de la factura: si no, todas
                          las filas del mismo TAG se verían idénticas. */}
                      <span style={{ fontWeight: 600 }}>{m.marcaPieza || m.marcaTxt}</span>
                      {m.porTag && <span style={{ background: '#E2ECF8', color: '#41618A', borderRadius: 3, padding: '1px 5px', fontSize: 10.5 }}>por TAG</span>}
                      {m.m2Leido && <span style={{ color: '#9AA3AD' }}>{m.m2Leido} m² en la factura</span>}
                    </label>
                  ) : null)}
                </div>
              </div>
            )}
            {noCalzan.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: '#D9600A', marginBottom: 4, fontWeight: 700 }}>No calzan con ninguna marca esperada de esta OT ({noCalzan.length}) — puede ser una factura mal leída, piezas de otra OT, o piezas que faltan en el checklist</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {revision.marcas.map((m, idx) => m.marcaEsperadaId ? null : (
                    <span key={idx} style={{ background: '#FDECDD', color: '#D9600A', borderRadius: 10, padding: '2px 4px 2px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {m.marcaTxt}
                      <button onClick={() => agregarMarcaNueva(idx)} title="Agregar como marca nueva al checklist de esta OT" style={{ background: '#D9600A', color: '#fff', border: 'none', borderRadius: 8, width: 16, height: 16, fontSize: 11, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>)
        })()}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={aplicarRevision} style={{ background: C.verde, color: '#fff', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}>Crear factura y ligar piezas</button>
          <button onClick={() => setRevision(null)} style={{ background: 'none', border: '1px solid #DFE4EA', borderRadius: 4, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer' }}>Descartar</button>
        </div>
      </div>
    )}

    {marcasEsperadas.length === 0 ? (
      <div style={{ fontSize: 12, color: '#9AA3AD' }}>Esta OT todavía no tiene piezas en el checklist, así que no hay contra qué cruzar la facturación. Carga las marcas esperadas en Producción y Trazabilidad.</div>
    ) : (<>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.carbon }}>{cruce.total} piezas</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.verde }}>{cruce.facturadas.length} facturadas · {cruce.m2Facturado.toFixed(2)} m²</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: cruce.pendientes.length ? '#D9600A' : C.verde }}>{cruce.pendientes.length} por facturar · {cruce.m2Pendiente.toFixed(2)} m²</span>
        {cruce.montoPendienteEstimado != null && cruce.pendientes.length > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#D9600A' }} title={'Estimado con ' + clp(Math.round(cruce.precioM2)) + '/m² de la cotización'}>≈ {clp(cruce.montoPendienteEstimado)} por facturar</span>
        )}
      </div>
      {cruce.precioM2 == null && cruce.pendientes.length > 0 && (
        <div style={{ fontSize: 11, color: '#9AA3AD', marginBottom: 8 }}>Sin precio por m² en la cotización ni monto cotizado, así que lo pendiente se muestra solo en piezas y m².</div>
      )}
      {cruce.sinM2.length > 0 && (
        <div style={{ fontSize: 11, color: '#D9600A', marginBottom: 8 }}>{cruce.sinM2.length} pieza(s) pendiente(s) sin m² cargados — no suman al monto estimado hasta que se les cargue la superficie.</div>
      )}

      {cruce.pendientes.length === 0 ? (
        <div style={{ fontSize: 12, color: C.verde, fontWeight: 600 }}>Todas las piezas del checklist están facturadas.</div>
      ) : (
        <div style={{ border: '1px dashed #C2CBD9', borderRadius: 6, padding: 10, background: '#FBFCFE' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#41618A', marginBottom: 6, textTransform: 'uppercase' }}>Falta por facturar ({cruce.pendientes.length})</div>
          {cruce.pendientes.length > 6 && <input value={buscarPend} onChange={e => setBuscarPend(e.target.value)} placeholder="Buscar pieza por código…" style={{ ...inp2, width: '100%', marginBottom: 6 }} />}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 180, overflowY: 'auto', marginBottom: 8 }}>
            {pendFiltradas.map(m => {
              const m2 = m2FacturableDeMarca(m)
              const sel = seleccion.has(m.id)
              return (
                <label key={m.id} title={m.despachoId ? 'Despachada el ' + (m.fechaDespacho || '—') : (m.recibida ? 'Recibida, sin despachar' : 'Aún no recibida')} style={{ background: sel ? '#E2ECF8' : '#fff', border: '1px solid ' + (sel ? C.azul : '#D8DCE5'), color: C.carbon, borderRadius: 4, padding: '4px 9px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input type="checkbox" checked={sel} onChange={() => alternar(m.id)} />
                  <span style={{ fontWeight: 600 }}>{tagDeMarca(m)}</span>
                  {idDeMarca(m) && <span title="ID de la pieza" style={{ color: '#9AA3AD', fontSize: 11.5 }}>ID {idDeMarca(m)}</span>}
                  {m2 > 0 ? <span style={{ color: '#9AA3AD' }}>({m2} m²)</span> : <span style={{ color: '#D9600A' }}>(sin m²)</span>}
                  {m.despachoId && <span title="Ya despachada" style={{ color: C.verde, fontWeight: 700 }}>↑</span>}
                </label>
              )
            })}
            {pendFiltradas.length === 0 && <span style={{ fontSize: 12, color: '#9AA3AD' }}>Sin resultados para "{buscarPend}".</span>}
          </div>
          {ventasLigables.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#9AA3AD' }}>{seleccion.size} seleccionada(s) →</span>
              <select value={destino} onChange={e => setVentaDestino(e.target.value)} style={{ ...inp2, minWidth: 190 }}>
                <option value="">— asignar a la factura… —</option>
                {ventasLigables.map(v => <option key={v.id} value={v.id}>Factura {v.folio} · {v.fecha} · {clp(v.neta)}</option>)}
              </select>
              <button onClick={asignarSeleccion} disabled={!seleccion.size || !destino} style={{ background: (seleccion.size && destino) ? C.azul : '#DFE4EA', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', fontSize: 12.5, cursor: (seleccion.size && destino) ? 'pointer' : 'not-allowed' }}>Marcar como facturadas</button>
            </div>
          )}
        </div>
      )}

      {cruce.facturadas.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#5A736A', marginBottom: 6, textTransform: 'uppercase' }}>Ya facturadas ({cruce.facturadas.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
            {cruce.facturadas.map(m => (
              <span key={m.id} style={{ background: '#E6F5EA', border: '1px solid #B7E0C4', color: '#2F6B44', borderRadius: 4, padding: '3px 4px 3px 8px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {tagDeMarca(m)}{idDeMarca(m) ? ' · ID ' + idDeMarca(m) : ''} · F{m.folioFactura || '—'}
                <button onClick={() => desligar(m.id)} title="Desligar de la factura (vuelve a pendiente)" style={{ background: 'none', border: 'none', color: '#5A736A', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 2px' }}>×</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </>)}
  </div>)
}

// Fase B del rediseno de OT — trazabilidad por pieza. El granallado y las
// capas de pintura NO se marcan a mano aca: se derivan de los Protocolos
// que ya se llenan en la pestana Calidad (una sola fuente de datos, no se
// reescribe nada). Si una pieza esta en la lista de marcas de un PIG, el
// granallado queda con la fecha de ese PIG; si esta en un PGP, cada
// "Capa N" toma la fecha ambiental de esa capa del PGP que la incluye.
//
// normMarca(): quita tildes/mayusculas y colapsa guiones/espacios, para
// que "2610-SP-32402 A" (con espacio) calce con "2610-SP-32402-A" (con
// guion) y con variantes de tildes — antes solo se normalizaba a
// minusculas, y coincidencias reales se perdian por eso.
function normMarca(s) { return String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s-]+/g, '-') }
// Un mismo campo de marcas puede traer varios codigos separados por ";"/","
// /salto de linea (la gente pega varias marcas juntas) — rptMarcas() ya
// separa asi para el PDF; protocoloDeMarca() necesita el mismo criterio
// para no dejar sin trazabilidad a una marca que esta ahi pero acompañada.
function marcasDeCampo(m) { return String(m || '').split(/[;,\n]+/).map(x => x.trim()).filter(Boolean) }
function protocoloDeMarca(protocolos, marcaTxt, tipo) {
  const key = normMarca(marcaTxt)
  if (!key) return null
  return (protocolos || []).find(p => p.tipo === tipo && (p.marcas || []).some(m => marcasDeCampo(m).some(x => normMarca(x) === key))) || null
}
// Una capa/granallado solo cuenta como "hecha" si tiene una medicion real
// cargada — antes se usaba la fecha por defecto (hoy) que trae el
// protocolo al crearse, asi que una pieza aparecia "Lista" apenas alguien
// generaba el PGP, sin haber pintado ni medido nada todavia.
function capaHecha(cap) { return !!(cap && (cap.filas || []).some(fila => (fila || []).some(v => String(v || '').trim()))) }
function granalladoHecho(pig) {
  if (!pig) return false
  if ((pig.medidas || []).some(v => String(v || '').trim())) return true
  if ((pig.checks || []).some(c => (c.fotos || []).length > 0)) return true
  return false
}
// Calculo de las filas de trazabilidad de una OT (una por pieza) — vive
// aparte del componente que las pinta para poder reutilizarlo tal cual en
// la exportacion a Excel de la OT (descargarOT), sin mantener la misma
// logica escrita dos veces en dos lugares que se podrian ir desalineando.
export function calcularFilasTrazabilidad(ot) {
  const marcas = ot.marcasEsperadas || []
  const partidas = ot.partidas || []
  const protocolos = ot.protocolos || []
  const maxCapas = protocolos.filter(p => p.tipo === 'PGP').reduce((mx, p) => Math.max(mx, (p.capas || []).length), 0)
  const filas = marcas.map(m => {
    const pig = protocoloDeMarca(protocolos, m.marca, 'PIG')
    const pgp = protocoloDeMarca(protocolos, m.marca, 'PGP')
    const fechaGranallado = (pig && granalladoHecho(pig)) ? ((pig.amb && pig.amb.fecha) || pig.fecha || null) : null
    const capasTotalPieza = pgp ? (pgp.capas || []).length : 0
    const fechasCapas = Array.from({ length: maxCapas }, (_, i) => {
      const cap = pgp && pgp.capas && pgp.capas[i]
      return (cap && capaHecha(cap)) ? ((cap.amb && cap.amb.fecha) || null) : null
    })
    const capasHechas = fechasCapas.filter(Boolean).length
    const despachada = !!m.despachoId
    let estado, colorEstado
    if (despachada) { estado = 'Despachada'; colorEstado = C.verde }
    else if (pgp && capasTotalPieza > 0 && capasHechas === capasTotalPieza) { estado = 'Lista'; colorEstado = C.verde }
    else if (capasHechas > 0) { estado = `Capa ${capasHechas}/${capasTotalPieza}`; colorEstado = C.teal }
    else if (fechaGranallado) { estado = 'Granallado'; colorEstado = '#5A6B85' }
    else if (m.recibida) { estado = 'Recibida'; colorEstado = '#D9600A' }
    else { estado = 'Por llegar'; colorEstado = '#9AA3AD' }
    // Vencimiento del lote de esta pieza (si tiene uno con plazo cargado) —
    // mismo calculo que usa el tablero de Trazabilidad y Alertas, para que
    // se vea de un vistazo dentro de la propia OT sin tener que ir a
    // buscarlo a otro modulo.
    const lote = m.loteId ? partidas.find(p => p.id === m.loteId) : null
    const vencimiento = (lote && lote.plazoDias && lote.fecha) ? sumarDiasHabiles(lote.fecha, lote.plazoDias) : null
    const diasRestantes = vencimiento && !despachada ? diasHabilesHasta(vencimiento) : null
    return { m, lote, fechaGranallado, fechasCapas, estado, colorEstado, vencimiento, diasRestantes }
  })
  return { filas, maxCapas }
}
function TrazabilidadPiezasOT({ ot, onUpdateMarcasEsperadas }) {
  const marcas = ot.marcasEsperadas || []
  const partidas = ot.partidas || []
  const despachos = ot.despachos || []
  const setMarcas = nuevas => onUpdateMarcasEsperadas(ot.id, nuevas)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroLote, setFiltroLote] = useState('')
  // Overlay local para "Referencia" — mismo patron de debounce que ya usa
  // cambiarM2Propio en MarcasEsperadasOT, para no disparar un guardado a
  // la nube (pullState+pushState) en cada tecla.
  const [localReferencia, setLocalReferencia] = useState({})
  const timersReferencia = useRef({})

  // Memoizado: con muchas piezas y protocolos, este calculo es O(piezas x
  // protocolos) — sin memo se repetia en cada render (incluida cada tecla
  // del campo Referencia, que ya tiene su propio debounce pero igual
  // dispara un render local).
  const { filas, maxCapas } = useMemo(() => calcularFilasTrazabilidad(ot), [ot.marcasEsperadas, ot.partidas, ot.protocolos])

  const filasFiltradas = filas.filter(f => {
    if (filtroEstado && f.estado !== filtroEstado) return false
    if (filtroLote && f.m.loteId !== filtroLote) return false
    return true
  })
  const estadosPresentes = Array.from(new Set(filas.map(f => f.estado)))
  const loteLabel = p => (p.numeroGuia ? 'Guía ' + p.numeroGuia : (p.detalle || 'Lote')) + (p.fecha ? ' · ' + p.fecha : '')

  // Asignar un lote (= una recepcion/partida) a una pieza es, en la
  // practica, recibirla: si no tenia fecha de recepcion, toma la del lote.
  const asignarLote = (id, loteId) => {
    const partida = partidas.find(p => p.id === loteId)
    setMarcas(marcas.map(m => m.id === id ? { ...m, loteId: loteId || null, recibida: loteId ? true : m.recibida, fechaRecibida: loteId ? (m.fechaRecibida || (partida && partida.fecha) || hoy()) : m.fechaRecibida } : m))
  }
  const asignarDespacho = (id, despachoId) => {
    const desp = despachos.find(d => d.id === despachoId)
    setMarcas(marcas.map(m => m.id === id ? { ...m, despachoId: despachoId || null, fechaDespacho: despachoId ? ((desp && desp.fecha) || hoy()) : null } : m))
  }
  const cambiarReferencia = (id, valor) => {
    setLocalReferencia(r => ({ ...r, [id]: valor }))
    clearTimeout(timersReferencia.current[id])
    timersReferencia.current[id] = setTimeout(() => {
      setMarcas(marcas.map(m => m.id === id ? { ...m, referencia: valor } : m))
    }, 700)
  }

  if (!marcas.length) return null

  return (
    <div style={{ marginTop: 14, border: '1px solid #DFE4EA', borderRadius: 6, padding: 12, background: '#FAFAF8' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: C.carbon }}>Trazabilidad por pieza</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '5px 8px', fontSize: 12 }}>
            <option value="">Todos los estados</option>
            {estadosPresentes.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          {partidas.length > 0 && (
            <select value={filtroLote} onChange={e => setFiltroLote(e.target.value)} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '5px 8px', fontSize: 12 }}>
              <option value="">Todos los lotes</option>
              {partidas.map(p => <option key={p.id} value={p.id}>{loteLabel(p)}</option>)}
            </select>
          )}
        </div>
      </div>
      {(
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                {['Marca/TAG', 'ID', 'Referencia', 'm²', 'Recibida', 'Granallado', ...Array.from({ length: maxCapas }, (_, i) => 'Capa ' + (i + 1)), 'Estado', 'Vence', 'Lote', 'Despacho'].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '5px 6px', fontSize: 10.5, color: '#9AA3AD', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.map(({ m, fechaGranallado, fechasCapas, estado, colorEstado, vencimiento, diasRestantes }) => (
                <tr key={m.id} style={{ borderBottom: '1px solid #EEE9DF', background: diasRestantes != null && diasRestantes < 0 ? '#FDECEC' : 'transparent' }}>
                  <td style={{ padding: '5px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>{m.tag || m.marca}</td>
                  <td style={{ padding: '5px 6px', color: '#9AA3AD' }}>{m.idPieza || '—'}</td>
                  <td style={{ padding: '5px 6px' }}><input value={localReferencia[m.id] !== undefined ? localReferencia[m.id] : (m.referencia || '')} onChange={e => cambiarReferencia(m.id, e.target.value)} placeholder="—" style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '3px 5px', fontSize: 11.5, width: 90 }} /></td>
                  <td style={{ padding: '5px 6px', color: '#9AA3AD' }}>{m.m2 || '—'}</td>
                  <td style={{ padding: '5px 6px', color: m.recibida ? C.verde : '#9AA3AD', whiteSpace: 'nowrap' }}>{m.fechaRecibida || '—'}</td>
                  <td style={{ padding: '5px 6px', color: fechaGranallado ? '#5A6B85' : '#C9C4B8', whiteSpace: 'nowrap' }}>{fechaGranallado || '—'}</td>
                  {fechasCapas.map((f, i) => <td key={i} style={{ padding: '5px 6px', color: f ? C.teal : '#C9C4B8', whiteSpace: 'nowrap' }}>{f || '—'}</td>)}
                  <td style={{ padding: '5px 6px' }}><span style={{ background: colorEstado, color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{estado}</span></td>
                  <td style={{ padding: '5px 6px', whiteSpace: 'nowrap' }}>{vencimiento ? (<span style={{ color: diasRestantes < 0 ? '#C5453D' : diasRestantes <= 2 ? '#D9600A' : '#9AA3AD', fontWeight: diasRestantes < 0 ? 700 : 400 }}>{vencimiento}{diasRestantes < 0 ? ` (vencido, ${Math.abs(diasRestantes)} d.h.)` : ` (${diasRestantes} d.h.)`}</span>) : '—'}</td>
                  <td style={{ padding: '5px 6px' }}>
                    <select value={m.loteId || ''} onChange={e => asignarLote(m.id, e.target.value)} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '3px 5px', fontSize: 11 }}>
                      <option value="">— sin lote —</option>
                      {partidas.map(p => <option key={p.id} value={p.id}>{loteLabel(p)}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '5px 6px' }}>
                    <select value={m.despachoId || ''} onChange={e => asignarDespacho(m.id, e.target.value)} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '3px 5px', fontSize: 11 }}>
                      <option value="">— sin despacho —</option>
                      {despachos.map(d => <option key={d.id} value={d.id}>{loteLabel(d)}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

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
  // Trazabilidad por pieza — mismo calculo que se ve en pantalla
  // (calcularFilasTrazabilidad), asi el Excel exportado no puede quedar
  // desalineado con lo que muestra la app. Es el dato que suele pedir un
  // cliente industrial junto al dossier de calidad, y antes no salía en
  // ningún exportable.
  if ((ot.marcasEsperadas || []).length) {
    const { filas, maxCapas } = calcularFilasTrazabilidad(ot)
    const header = ['Marca/TAG', 'ID', 'Referencia', 'm²', 'Recibida', 'Guía recepción', 'Granallado', ...Array.from({ length: maxCapas }, (_, i) => 'Capa ' + (i + 1)), 'Estado', 'Vence', 'Guía despacho']
    const filasHoja = filas.map(f => [
      f.m.tag || f.m.marca, f.m.idPieza || '', f.m.referencia || '', f.m.m2 || '',
      f.m.fechaRecibida || '', (f.lote && f.lote.numeroGuia) || '',
      f.fechaGranallado || '', ...f.fechasCapas.map(c => c || ''),
      f.estado, f.vencimiento || '', f.m.despachoId ? 'Sí' : '',
    ])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...filasHoja]), 'Trazabilidad')
  }
  XLSX.writeFile(wb, `${ot.numero}.xlsx`)
}

// Portada de cada OT — muestra sin necesidad de abrir la ficha: N° de OT,
// N° de OC/NV, N° de cotizacion, cliente, fecha de ingreso, observaciones
// (resumen), esquema, venta neta y estado. Todo lo demas del detalle actual
// sigue disponible al abrir la ficha (TarjetaOT), esto no lo reemplaza.
function TileOT({ ot, onOpen, onDragStart, onDropOn, verValores }) {
  const monto = ventaNetaDeOT(ot)
  const abonoTot = abonoTotalDeOT(ot)
  const saldoPend = monto - abonoTot
  const facturaReal = tieneFactura(ot)
  const saldoFacturar = saldoPorFacturarDeOT(ot)
  const saldoPercibir = saldoPorPercibirDeOT(ot)
  const avanceFact = monto > 0 ? Math.round((totalFacturadoDeOT(ot) / monto) * 1000) / 10 : null
  const alertas = []
  if (ot.estado !== 'Cerrada' && monto <= 0) alertas.push('OT activa sin monto de venta')
  if (ot.estado === 'Cerrada' && !ot.fechaCierre) alertas.push('OT cerrada sin fecha de cierre')
  if (ot.estado === 'Cerrada' && saldoFacturar > 0 && !facturaReal) alertas.push('OT cerrada con saldo pendiente de facturación')
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
          {ot.oc && ot.oc !== '—' ? <span title="Orden de compra del cliente" style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 11.5, background: (ot.area === 'Istria' || ot.sede === 'Istria') ? '#C5453D' : '#1B9E5D', color: '#fff', padding: '2px 7px', borderRadius: 3, whiteSpace: 'nowrap' }}>OC {ot.oc}</span> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ChipEstado ot={ot} />
          <span draggable onDragStart={e => { e.stopPropagation(); onDragStart() }} onClick={e => e.stopPropagation()} title="Arrastrar para reordenar" style={{ cursor: 'grab', color: '#B9C0C6', fontSize: 15, userSelect: 'none', lineHeight: 1, letterSpacing: '-1px' }}>::</span>
        </div>
      </div>
      {ot.nv && ot.nv !== '—' ? <div><span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 11.5, background: '#F77716', color: '#fff', padding: '2px 7px', borderRadius: 3, whiteSpace: 'nowrap' }}>NV {ot.nv}</span></div> : null}
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, color: '#101315', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ot.cliente}</div>
      <div style={{ fontSize: 11.5, color: '#9AA3AD', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {ot.cotizacion && ot.cotizacion !== '—' && <span>Cotización: {ot.cotizacion}</span>}
        <span>Fecha de ingreso: {ot.fecha || '—'}</span>
        {obsResumen && <span title={obs}>Obs.: {obsResumen}</span>}
        {esquemaResumen && <span title={ot.esquema}>{esquemaResumen}</span>}
      </div>
      {cerrada && (
        <div style={{ fontSize: 11, color: facturaReal ? C.verde : '#5B4E8C', fontWeight: 600 }}>
          {facturaReal ? `Factura(s): ${(ot.ventas || []).filter(v => (v.folio || '').trim() && v.folio !== 's/f').map(v => v.folio).join(', ')} · ${estadoPagoOTDeOT(ot)}` : 'Sin factura registrada'}
          {ot.fechaCierre ? ` · Cerrada ${ot.fechaCierre}` : ''}
        </div>
      )}
      {verValores && monto > 0 && (
        <div style={{ marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 10.5, color: '#9AA3AD', textTransform: 'uppercase' }}>Venta neta</span>
          <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, color: '#101315' }}>{clp(monto)}</span>
        </div>
      )}
      {verValores && !facturaReal && abonoTot > 0 && (
        <div style={{ marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 10.5, color: '#9AA3AD', textTransform: 'uppercase' }}>{saldoPend > 0 ? 'Saldo por facturar/percibir' : saldoPend < 0 ? 'Saldo a favor cliente' : 'Saldo'}</span>
          <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 13, color: saldoPend > 0 ? C.ambar : saldoPend < 0 ? '#5B4E8C' : C.verde }}>{clp(Math.abs(saldoPend))}</span>
        </div>
      )}
      {verValores && facturaReal && (
        <>
          {saldoFacturar > 0 && (
            <div style={{ marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 10.5, color: '#9AA3AD', textTransform: 'uppercase' }}>Saldo por facturar</span>
              <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 13, color: C.ambar }}>{clp(saldoFacturar)}</span>
            </div>
          )}
          {saldoPercibir > 0 && (
            <div style={{ marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 10.5, color: '#9AA3AD', textTransform: 'uppercase' }}>Saldo por percibir</span>
              <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 13, color: C.rojo }}>{clp(saldoPercibir)}</span>
            </div>
          )}
          {avanceFact != null && (
            <div style={{ fontSize: 10.5, color: '#9AA3AD' }}>Avance facturado: {avanceFact}%</div>
          )}
        </>
      )}
      {alertas.length > 0 && (
        <div style={{ marginTop: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {alertas.map((a, i) => <span key={i} style={{ fontSize: 10.5, color: C.rojo }}>⚠ {a}</span>)}
        </div>
      )}
    </div>
  )
}

function TarjetaOT({ ot, onUpdate, onUpdateProtocolos, onUpdateMarcasEsperadas, onDelete, onCambiarEstado, onAgregarVenta, onEliminarVenta, onAgregarArray, verValores = true, ordenesCompra = [], mo = null, otsAll = [], instrumentos = null, libroCompras = [], enModal = false }) {
  const [abierta, setAbierta] = useState(false)
  const [addVenta, setAddVenta] = useState(false)
  const [addAbono, setAddAbono] = useState(false)
  const [addCosto, setAddCosto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  // La ficha era un solo scroll largo con todo mezclado (comercial,
  // produccion, calidad, datos) — se reorganiza en pestanas sin eliminar
  // ni mover ninguna funcion fuera del alcance, solo se agrupa lo mismo
  // que ya existia. Nada de esto toca los datos ni los handlers de abajo.
  const [tab, setTab] = useState('resumen')
  const TABS_OT = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'produccion', label: 'Producción y Trazabilidad' },
    { id: 'calidad', label: 'Calidad' },
    { id: 'comercial', label: 'Comercial' },
    { id: 'datos', label: 'Datos' },
  ]
  // Botón explícito de guardar, pedido directamente: todo lo que se edita
  // en esta ficha (campos técnicos, partidas/recepción con fotos,
  // despachos, protocolos) ya sube a la nube apenas se hace el cambio,
  // pero acá se puede forzar y CONFIRMAR de verdad que llegó, en vez de
  // solo confiar en que va a pasar solo.
  const guardarYConfirmar = async () => {
    setGuardando(true)
    const r = await pushState()
    setGuardando(false)
    if (r.ok && r.n === 0) window.alert('Ya está todo guardado en la nube — no había cambios pendientes.')
    else if (r.ok) window.alert('Guardado confirmado: los cambios de esta OT llegaron a Supabase.')
    else window.alert('No se pudo guardar' + (r.error ? ':\n\n' + r.error : '') + '\n\nRevisa tu conexión a internet e inténtalo de nuevo — no cierres esta ficha todavía. Si el mensaje se repite, avisa al administrador con este texto.')
  }

  // Leer la OC/OT del cliente con IA desde el comienzo de la OT (antes
  // vivia solo dentro de un protocolo, en la pestana Calidad — se movio
  // aca porque el cliente/OC/NV y las marcas se conocen antes de llegar a
  // calidad). Aplica directo sobre la OT (cliente/oc/nv) y sobre el
  // checklist compartido de marcas esperadas — no sobre la copia interna
  // de un protocolo. Mismo mecanismo de siempre: nunca escribe directo,
  // pasa por un panel de revision con cada dato tildado y editable.
  const onUpdMarcas = onUpdateMarcasEsperadas || ((id, v) => onUpdate(id, { marcasEsperadas: v }))
  const [subiendoOC, setSubiendoOC] = useState(false)
  const [revisionOC, setRevisionOC] = useState(null)
  const [errorOC, setErrorOC] = useState('')
  const subirOC = async e => {
    const fls = [...e.target.files]
    e.target.value = ''
    if (!fls.length) return
    setSubiendoOC(true); setErrorOC(''); setRevisionOC(null)
    try {
      const archivos = await Promise.all(fls.map(async fl => ({ base64: await fileToBase64(fl), mimeType: fl.type || 'application/pdf', filename: fl.name })))
      const { data, error } = await supabase.functions.invoke('extraer-oc', { body: { archivos, filename: fls[0].name } })
      if (error) throw error
      if (!data || !data.ok) throw new Error((data && data.error) || 'No se pudo leer el documento.')
      const d = data.datos || {}
      setRevisionOC({
        cliente: { valor: d.cliente || '', aplicar: !!d.cliente },
        ocNumero: { valor: d.ocNumero || '', aplicar: !!d.ocNumero },
        nv: { valor: d.nv || '', aplicar: !!d.nv },
        marcas: (d.marcas || []).map(m => ({ ...m, aplicar: true })),
      })
    } catch (err) { setErrorOC('No se pudo leer el documento: ' + ((err && err.message) || String(err))) }
    setSubiendoOC(false)
  }
  const aplicarRevisionOC = () => {
    if (!revisionOC) return
    const cambios = {}
    if (revisionOC.cliente.aplicar && revisionOC.cliente.valor) cambios.cliente = revisionOC.cliente.valor
    if (revisionOC.ocNumero.aplicar && revisionOC.ocNumero.valor) cambios.oc = revisionOC.ocNumero.valor
    if (revisionOC.nv.aplicar && revisionOC.nv.valor) cambios.nv = revisionOC.nv.valor
    if (Object.keys(cambios).length) onUpdate(ot.id, cambios)
    const marcasNuevas = revisionOC.marcas.filter(m => m.aplicar)
    if (marcasNuevas.length) {
      const existentes = ot.marcasEsperadas || []
      const existentesSet = new Set(existentes.map(x => String(x.marca || '').trim().toLowerCase()))
      const aAgregar = marcasNuevas
        .map(m => ({ marcaTxt: m.id ? (m.tag + '-' + m.id) : m.tag, tag: m.tag, idPieza: m.id || null, m2: m.m2 || 0 }))
        .filter(m => m.marcaTxt && !existentesSet.has(m.marcaTxt.trim().toLowerCase()))
        .map(m => ({ id: 'me' + Date.now() + Math.random().toString(36).slice(2, 7), marca: m.marcaTxt, tag: m.tag, idPieza: m.idPieza, referencia: null, m2: m.m2, m2Propio: null, recibida: false, fechaRecibida: null }))
      if (aAgregar.length) onUpdMarcas(ot.id, [...existentes, ...aAgregar])
    }
    setRevisionOC(null)
  }

  const ventaTotal = (ot.ventas || []).reduce((a, v) => a + v.neta, 0)
  const costoOC = costoOCdeOT(ordenesCompra, ot.numero)
  const costoMO = costoMOdeOT(mo, ot.numero)
  const abonoTotal = (ot.abonos || []).reduce((a, x) => a + (x.monto || 0), 0)
  // Saldo real que falta por facturar o percibir: venta neta de la OT (misma
  // fuente única que usan la tarjeta y los KPI) menos lo ya abonado. Si el
  // abono supera la venta, el excedente queda a favor del cliente (negativo).
  const saldoPendiente = ventaNetaDeOT(ot) - abonoTotal
  const facturaReal = tieneFactura(ot)
  const saldoFacturarOT = saldoPorFacturarDeOT(ot)
  const saldoPercibirOT = saldoPorPercibirDeOT(ot)
  const avanceFacturado = ventaNetaDeOT(ot) > 0 ? Math.round((totalFacturadoDeOT(ot) / ventaNetaDeOT(ot)) * 1000) / 10 : null
  const diasDesde = f => { if (!f || f === '—') return null; const d = Math.floor((Date.now() - new Date(f + 'T00:00:00').getTime()) / 86400000); return d >= 0 ? d : null }
  const diasActiva = ot.estado !== 'Cerrada' ? diasDesde(ot.fecha) : null
  const diasCerradaSinFacturar = (ot.estado === 'Cerrada' && !facturaReal) ? diasDesde(ot.fechaCierre) : null
  const primeraFacturaFecha = facturaReal ? (ot.ventas || []).find(v => (v.folio || '').trim() && v.folio !== 's/f' && v.fecha && v.fecha !== '—')?.fecha : null
  const diasFacturadaSinPago = (facturaReal && saldoPercibirOT > 0) ? diasDesde(primeraFacturaFecha) : null
  const alertasOT = []
  if (ot.estado !== 'Cerrada' && ventaNetaDeOT(ot) <= 0) alertasOT.push('OT activa sin monto de venta')
  if (ot.estado === 'Cerrada' && !ot.fechaCierre) alertasOT.push('OT cerrada sin fecha de cierre')
  if (ot.estado === 'Cerrada' && saldoFacturarOT > 0 && !facturaReal) alertasOT.push('OT cerrada con saldo pendiente de facturación')
  if (facturaReal && (ot.ventas || []).some(v => !((v.folio || '').trim()))) alertasOT.push('Factura registrada sin número de folio')
  if (facturaReal && saldoPercibirOT > 0) alertasOT.push('Factura con saldo pendiente de cobro')
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
            <span><FileText size={11} style={{ verticalAlign: -1 }} /> {ot.cotizacion}{ot.oc && ot.oc !== '—' ? <> · Aprob. cliente <b style={{ color: (ot.area === 'Istria' || ot.sede === 'Istria') ? '#C5453D' : '#1B9E5D' }}>{ot.oc}</b></> : ''}</span>
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
          {enModal && (
            <button onClick={guardarYConfirmar} disabled={guardando} title="Sube de inmediato cualquier cambio pendiente de esta OT y confirma que llegó a la nube"
              style={{ background: guardando ? '#5A636E' : C.verde, color: '#fff', border: 'none', borderRadius: 6, padding: '9px 14px', cursor: guardando ? 'default' : 'pointer', fontWeight: 700, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <Save size={14} /> {guardando ? 'Guardando…' : 'Guardar y confirmar'}
            </button>
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
          {/* Aviso de facturación pendiente por pieza — sale del mismo
              cálculo que la pestaña Comercial, para que se vea sin tener
              que abrirla. Solo aparece si la OT tiene checklist cargado y
              quedan piezas sin factura. */}
          {(() => {
            const cf = cruceFacturacionOT(ot)
            if (!cf.total || !cf.pendientes.length) return null
            return (
              <div style={{ fontSize: 12, color: '#D9600A', marginTop: 4 }}>
                Falta por facturar: <b>{cf.pendientes.length} de {cf.total} pieza(s)</b>
                {cf.m2Pendiente > 0 && <> · {cf.m2Pendiente.toFixed(2)} m²</>}
                {cf.montoPendienteEstimado != null && cf.montoPendienteEstimado > 0 && <> · ≈ <b>{clp(cf.montoPendienteEstimado)}</b></>}
              </div>
            )
          })()}
        </div>
      )}
      {!verValores && <div style={{ padding: '0 18px 14px' }}><span style={{ fontSize: 11.5, color: '#9AA3AD', fontStyle: 'italic' }}>Vista de taller · valores visibles solo para Gerencia.</span></div>}
      {(ot.pinturaCotizada || []).length > 0 && <div style={{ padding: '0 18px 14px' }}><div style={{ fontSize: 11, fontWeight: 700, color: '#101315', textTransform: 'uppercase', marginBottom: 4 }}>Pintura cotizada (tope — no exceder)</div>{ot.pinturaCotizada.map((p, k) => <div key={k} style={{ fontSize: 12.5, color: '#344054' }}>{p.producto}: <b>{p.envases} envase(s)</b> · {Math.round((p.litros || 0) * 10) / 10} L</div>)}</div>}

      {(abierta || enModal) && (
        <div style={{ borderTop: '1px solid #DFE4EA', padding: 18 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, borderBottom: '1px solid #DFE4EA', paddingBottom: 12 }}>
            {TABS_OT.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ background: tab === t.id ? '#F77716' : '#fff', color: tab === t.id ? '#fff' : C.carbon, border: '1px solid ' + (tab === t.id ? '#F77716' : '#DFE4EA'), padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontFamily: SEREIN.fontDisplay, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, borderRadius: 4 }}>
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'resumen' && (<>
          {/* Leer la OC/OT con IA — desde el comienzo de la OT, no dentro de un protocolo */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ cursor: subiendoOC ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: C.teal, border: '1px solid ' + C.teal, padding: '8px 14px', fontSize: 12.5, borderRadius: 4, opacity: subiendoOC ? 0.6 : 1 }}>
              {subiendoOC ? 'Leyendo…' : 'Subir OC/OT (auto-completar)'}
              <input type="file" accept="application/pdf,image/*" multiple style={{ display: 'none' }} disabled={subiendoOC} onChange={subirOC} />
            </label>
            {errorOC && <div style={{ fontSize: 11.5, color: '#C5453D', marginTop: 6 }}>{errorOC}</div>}
            {revisionOC && (
              <div style={{ border: '1px dashed #CFC9BC', borderRadius: 6, padding: 10, marginTop: 8, background: '#FBFAF7' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#5A736A', marginBottom: 8, textTransform: 'uppercase' }}>Revisa lo que leyó la IA antes de aplicar</div>
                {[['cliente', 'Cliente'], ['ocNumero', 'N° OC'], ['nv', 'NV']].map(([k, lbl]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <input type="checkbox" checked={revisionOC[k].aplicar} onChange={e => setRevisionOC(r => ({ ...r, [k]: { ...r[k], aplicar: e.target.checked } }))} />
                    <span style={{ fontSize: 11, color: '#9AA3AD', width: 60 }}>{lbl}</span>
                    <input value={revisionOC[k].valor} onChange={e => setRevisionOC(r => ({ ...r, [k]: { ...r[k], valor: e.target.value } }))} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '5px 7px', fontSize: 12.5, flex: 1 }} />
                  </div>
                ))}
                {revisionOC.marcas.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: '#9AA3AD', marginBottom: 4 }}>Marcas encontradas ({revisionOC.marcas.length}) — se agregan al checklist de marcas esperadas</div>
                    <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {revisionOC.marcas.map((m, i) => (
                        <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          <input type="checkbox" checked={m.aplicar} onChange={e => setRevisionOC(r => ({ ...r, marcas: r.marcas.map((x, j) => j === i ? { ...x, aplicar: e.target.checked } : x) }))} />
                          {m.id ? m.tag + '-' + m.id : m.tag}{m.m2 ? <span style={{ color: '#9AA3AD' }}> ({m.m2} m²)</span> : null}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={aplicarRevisionOC} style={{ background: C.verde, color: '#fff', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}>Aplicar a la OT</button>
                  <button onClick={() => setRevisionOC(null)} style={{ background: 'none', border: '1px solid #DFE4EA', borderRadius: 4, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer' }}>Descartar</button>
                </div>
              </div>
            )}
          </div>
          {/* Datos técnicos editables */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 18 }}>
            <label style={{ fontSize: 12, color: '#9AA3AD' }}>Estado OT
              <select value={ot.estado} onChange={e => onCambiarEstado(ot.id, e.target.value)} style={{ ...inp, width: '100%', marginTop: 4 }}>
                {/* "Facturada" se saca de las opciones elegibles: el estado de
                    facturacion ya se calcula solo (ver etiquetaEstado) y elegirlo
                    a mano dejaba la OT atascada para siempre en "OT activas" sin
                    entrar nunca a cerradas/facturadas. Si una OT ya quedo con ese
                    valor de antes, se mantiene visible aca para no romper su
                    selector, pero no se ofrece para las demas. */}
                {ESTADOS_OT.filter(s => s !== 'Facturada' || ot.estado === 'Facturada').map(s => <option key={s}>{s}</option>)}
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
          </>)}

          {tab === 'datos' && (<>
          {/* Esquema de pintura y servicios (visible para todos) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: '#9AA3AD' }}>Esquema de pintura
              <textarea value={ot.esquema === '—' ? '' : (ot.esquema || '')} onChange={e => onUpdate(ot.id, { esquema: e.target.value })} placeholder="Detalle del esquema: preparación, capas, productos, espesores (µm)…" style={{ ...inp, width: '100%', marginTop: 4, minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }} />
            </label>
            <label style={{ fontSize: 12, color: '#9AA3AD' }}>Servicios necesarios / observaciones
              <textarea value={ot.servicios || ''} onChange={e => onUpdate(ot.id, { servicios: e.target.value })} placeholder="Servicios adicionales, requerimientos y notas para el taller…" style={{ ...inp, width: '100%', marginTop: 4, minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }} />
            </label>
          </div>
          </>)}

          {tab === 'produccion' && (<>
          {/* MARCAS ESPERADAS (checklist contra el Excel del cliente) */}
          <MarcasEsperadasOT ot={ot} onGuardar={nuevasMarcas => onUpdateMarcasEsperadas ? onUpdateMarcasEsperadas(ot.id, nuevasMarcas) : onUpdate(ot.id, { marcasEsperadas: nuevasMarcas })} />

          {/* RECEPCION - PARTIDAS */}
          <RecepcionOT ot={ot} onUpdate={onUpdate} onAgregarArray={onAgregarArray} onUpdateMarcasEsperadas={onUpdateMarcasEsperadas || ((id, v) => onUpdate(id, { marcasEsperadas: v }))} />

        {/* TRAZABILIDAD POR PIEZA */}
        <TrazabilidadPiezasOT ot={ot} onUpdateMarcasEsperadas={onUpdateMarcasEsperadas || ((id, v) => onUpdate(id, { marcasEsperadas: v }))} />

        {/* ENTREGAS / DESPACHO SEREIN */}
        <DespachoOT ot={ot} onUpdate={onUpdate} onAgregarArray={onAgregarArray} onUpdateMarcasEsperadas={onUpdateMarcasEsperadas || ((id, v) => onUpdate(id, { marcasEsperadas: v }))} />

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
          </>)}

          {tab === 'comercial' && (<>
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
                      {['Folio', 'Fecha', 'Neta', 'IVA', 'Total', 'Piezas', 'Pago', ''].map((h, i) => (
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
                        {/* Cuantas piezas del checklist respalda esta factura
                            (ver FacturacionOT). Sin vinculo se muestra "—",
                            que es el caso de todas las facturas cargadas
                            antes de que existiera el cruce. */}
                        {(() => {
                          const ligadas = v.id ? (ot.marcasEsperadas || []).filter(m => m.facturaId === v.id) : []
                          const m2Lig = ligadas.reduce((a, m) => a + m2FacturableDeMarca(m), 0)
                          return (
                            <td style={{ padding: '7px 8px', fontSize: 12, color: ligadas.length ? C.verde : '#9AA3AD' }} title={ligadas.length ? ligadas.map(m => m.marca).join(', ') : 'Sin piezas ligadas'}>
                              {ligadas.length ? `${ligadas.length}${m2Lig > 0 ? ` · ${m2Lig.toFixed(1)} m²` : ''}` : '—'}
                            </td>
                          )
                        })()}
                        <td style={{ padding: '7px 8px' }}>
                          <select value={v.estadoPago}
                            onChange={ev => onUpdate(ot.id, { ventas: (ot.ventas || []).map((x, j) => j === i ? { ...x, estadoPago: ev.target.value } : x) })}
                            style={{ border: 'none', background: v.estadoPago === 'Pagado' ? '#E7F2EA' : v.estadoPago === 'Factoring' ? '#F9E9DE' : '#F6E0DA', color: v.estadoPago === 'Pagado' ? C.verde : v.estadoPago === 'Factoring' ? C.ambar : C.rojo, padding: '3px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            <option>Pendiente</option><option>Pagado</option><option>Factoring</option>
                          </select>
                        </td>
                        <td style={{ padding: '7px 4px', textAlign: 'right' }}>
                          {/* Al borrar la factura, las piezas que colgaban
                              de ella vuelven solas a pendiente: el cruce
                              (cruceFacturacionOT) exige que el facturaId
                              siga existiendo entre las ventas de la OT. A
                              propósito NO se hace una segunda escritura
                              para limpiar el campo — serían dos guardados
                              en carrera contra el mismo estado, y el
                              vínculo huérfano es inofensivo. Solo se avisa
                              antes, para que no sea una sorpresa. */}
                          <button onClick={() => {
                            const ligadas = v.id ? (ot.marcasEsperadas || []).filter(m => m.facturaId === v.id) : []
                            const aviso = ligadas.length ? `\n\n${ligadas.length} pieza(s) ligada(s) volverán a quedar pendientes de facturación.` : ''
                            if (!window.confirm(`¿Eliminar factura ${v.folio} (${clp(v.neta)})?${aviso}`)) return
                            onEliminarVenta(ot.id, i)
                          }} style={btnMini}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {addVenta && <FormVenta onAdd={async v => { const ok = await onAgregarVenta(ot.id, v); if (ok) setAddVenta(false) }} onCancel={() => setAddVenta(false)} abonoTotal={abonoTotal} ventaTotalActual={ventaTotal} />}

              {/* Cruce de las facturas contra el checklist de piezas —
                  que se facturó, qué falta, y cuánto vale lo que falta. */}
              <FacturacionOT ot={ot} onAgregarVenta={onAgregarVenta} onUpdateMarcasEsperadas={onUpdMarcas} />

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
              {addAbono && <FormAbono onAdd={x => { onAgregarArray(ot.id, 'abonos', x); setAddAbono(false) }} onCancel={() => setAddAbono(false)} />}

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
              {addCosto && <FormCosto onAdd={c => { onAgregarArray(ot.id, 'costos', c); setAddCosto(false) }} onCancel={() => setAddCosto(false)} />}

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
                {!facturaReal && abonoTotal > 0 && (
                  saldoPendiente > 0
                    ? <span>Saldo pendiente por facturar/percibir: <b style={{ color: C.ambar }}>{clp(saldoPendiente)}</b></span>
                    : saldoPendiente < 0
                      ? <span>Saldo a favor del cliente: <b style={{ color: '#5B4E8C' }}>{clp(-saldoPendiente)}</b></span>
                      : <span>Saldo pendiente: <b style={{ color: C.verde }}>$0</b></span>
                )}
                {facturaReal && saldoFacturarOT > 0 && <span>Saldo por facturar: <b style={{ color: C.ambar }}>{clp(saldoFacturarOT)}</b></span>}
                {facturaReal && saldoPercibirOT > 0 && <span>Saldo por percibir: <b style={{ color: C.rojo }}>{clp(saldoPercibirOT)}</b></span>}
                <span>Costos: <b>{clp(costoTotal)}</b></span>{costoMO > 0 && <span style={{ color: '#9AA3AD' }}>(incluye {clp(costoMO)} de mano de obra)</span>}
                {costoOC > 0 && <span style={{ color: C.teal }}>(incluye {clp(costoOC)} de OC proveedores)</span>}
                <span>Utilidad real: <b style={{ color: margen >= 30 ? C.verde : margen >= 15 ? C.ambar : C.rojo }}>{clp(utilidad)} ({margen.toFixed(1)}%)</b></span>
              </div>
              <div style={{ marginTop: 8, padding: '10px 14px', background: '#fff', border: '1px dashed #DFE4EA', fontSize: 12, display: 'flex', gap: 18, flexWrap: 'wrap', color: '#9AA3AD' }}>
                <span>Facturación: <b style={{ color: C.carbon }}>{estadoFacturacionDeOT(ot)}</b></span>
                <span>Pago: <b style={{ color: C.carbon }}>{estadoPagoOTDeOT(ot)}</b></span>
                {avanceFacturado != null && <span>Avance facturado: <b style={{ color: C.carbon }}>{avanceFacturado}%</b></span>}
                {diasActiva != null && <span>Días activa: <b style={{ color: C.carbon }}>{diasActiva}</b></span>}
                {diasCerradaSinFacturar != null && <span>Días cerrada sin facturar: <b style={{ color: C.ambar }}>{diasCerradaSinFacturar}</b></span>}
                {diasFacturadaSinPago != null && <span>Días facturada sin pago: <b style={{ color: C.rojo }}>{diasFacturadaSinPago}</b></span>}
              </div>
              {alertasOT.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {alertasOT.map((a, i) => <span key={i} style={{ fontSize: 12, color: C.rojo }}>⚠ {a}</span>)}
                </div>
              )}
            </>
          )}
          </>)}

          {tab === 'datos' && (
          <div style={{ marginTop: 14, paddingTop: 12 }}>
            <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 13, textTransform: 'uppercase', marginBottom: 8 }}>Datos del encargado</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8 }}>
              <div><div style={{ fontSize: 11, color: '#9AA3AD', marginBottom: 2 }}>Nombre encargo</div><input style={{ padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, width: '100%', boxSizing: 'border-box' }} value={ot.nombreEncargo || ''} onChange={e => onUpdate(ot.id, { nombreEncargo: e.target.value })} /></div>
              <div><div style={{ fontSize: 11, color: '#9AA3AD', marginBottom: 2 }}>Correo</div><input style={{ padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, width: '100%', boxSizing: 'border-box' }} value={ot.correo || ''} onChange={e => onUpdate(ot.id, { correo: e.target.value })} /></div>
              <div><div style={{ fontSize: 11, color: '#9AA3AD', marginBottom: 2 }}>Telefono</div><input style={{ padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, width: '100%', boxSizing: 'border-box' }} value={ot.telefono || ''} onChange={e => onUpdate(ot.id, { telefono: e.target.value })} /></div>
              <div><div style={{ fontSize: 11, color: '#9AA3AD', marginBottom: 2 }}>NV (Nota de Venta)</div><input style={{ padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, width: '100%', boxSizing: 'border-box' }} value={ot.nv || ''} onChange={e => onUpdate(ot.id, { nv: e.target.value })} /></div>
              <div><div style={{ fontSize: 11, color: (ot.area === 'Istria' || ot.sede === 'Istria') ? '#C5453D' : '#F77716', fontWeight: 700, marginBottom: 2 }}>OC (Orden de compra)</div><input placeholder="Ej. 4500123456" style={{ padding: '6px 8px', border: '2px solid ' + ((ot.area === 'Istria' || ot.sede === 'Istria') ? '#C5453D' : '#F77716'), fontSize: 12.5, fontWeight: 700, width: '100%', boxSizing: 'border-box' }} value={ot.oc && ot.oc !== '\u2014' ? ot.oc : ''} onChange={e => onUpdate(ot.id, { oc: e.target.value })} /></div>
            </div>
          </div>
          )}
          {tab === 'calidad' && (
            <ProtocolosOT ot={ot} onUpdate={onUpdateProtocolos || onUpdate} otsAll={otsAll} instrumentos={instrumentos} />
          )}
          <div style={{ marginTop: 14, borderTop: '1px dashed #DFE4EA', paddingTop: 12 }}>
            <FotosOT ot={ot} onUpdate={onUpdate} />
          </div>

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
// Acumulado real = suma de los minimos de cada capa por un lado y suma de
// los maximos por el otro (no la suma del maximo previo con el minimo
// actual, que angostaba el rango a medida que se agregaban capas).
const acumRango = (capas, idx) => { var accMin = 0, accMax = 0; for (var i = 0; i <= idx; i++) { var r = parseRango(capas[i].solicitado); accMin += r[0]; accMax += r[1] } return [accMin, accMax] }
const autoFila = (vals, lo, hi) => { const n = vals.length; const idxE = []; const entered = []; vals.forEach((v, i) => { if (v === '' || v == null) idxE.push(i); else { const nn = parseFloat(String(v).replace(',', '.')); if (!isNaN(nn)) entered.push(nn) } }); if (idxE.length === 0) return vals.slice(); const desired = lo + Math.random() * ((hi - lo) + 0.6); const sumE = entered.reduce((a, b) => a + b, 0); const meanEmpty = (desired * n - sumE) / idxE.length; const res = vals.slice(); idxE.forEach(i => { let val = meanEmpty + (Math.random() * 1.6 - 0.7); val = Math.max(lo - 1, Math.min(hi + 1.8, val)); res[i] = (Math.round(val * 100) / 100).toFixed(2) }); return res }
const FOTO_W = 800, FOTO_H = 600
// Antes esta función solo comprimía la foto y devolvía un data-URL base64
// para guardar embebido en la OT — eso es justo lo que hacía crecer
// serein_ots a 4.2MB con solo 12 OTs. Ahora, tras comprimir, sube la foto
// directo al bucket "fotos-ot" de Storage y entrega la URL en su lugar —
// una sola función, usada por FotoSlots/partidas/despachos, así que
// arregla los 3 puntos de captura a la vez. Si el bucket todavía no
// existe o falla la subida por cualquier motivo, cae de vuelta al
// comportamiento anterior (guardar el base64 igual) para no perder la
// foto — nunca se cae el flujo por un problema de Storage.
const imgToData = (file, cb) => {
  const r = new FileReader()
  r.onload = e => {
    const img = new Image()
    img.onload = () => {
      var max = 1200; var w = img.width, h = img.height
      if (w > h && w > max) { h = Math.round(h * max / w); w = max } else if (h >= w && h > max) { w = Math.round(w * max / h); h = max }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      cv.getContext('2d').drawImage(img, 0, 0, w, h)
      const dataUrlRespaldo = () => cv.toDataURL('image/jpeg', 0.78)
      if (!cv.toBlob) { cb(dataUrlRespaldo()); return }
      cv.toBlob(async blob => {
        if (!blob) { cb(dataUrlRespaldo()); return }
        try {
          const nombre = `subidas/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
          const { error } = await supabase.storage.from('fotos-ot').upload(nombre, blob, { contentType: 'image/jpeg', upsert: false })
          if (error) { cb(dataUrlRespaldo()); return }
          const { data } = await supabase.storage.from('fotos-ot').createSignedUrl(nombre, 60 * 60 * 24 * 365 * 5)
          cb(data?.signedUrl || dataUrlRespaldo())
        } catch (e) { cb(dataUrlRespaldo()) }
      }, 'image/jpeg', 0.78)
    }
    img.src = e.target.result
  }
  r.readAsDataURL(file)
}
// Cada capa lleva su propio set de condiciones ambientales (pedido
// explícito: las condiciones pueden cambiar de una capa a otra porque se
// aplican en momentos distintos). El bloque general de "Condiciones
// ambientales" del protocolo (arriba del todo) NO se toca ni se elimina —
// este es adicional, uno por capa.
const nuevaCapa = nombre => ({ id: 'cap' + Date.now() + Math.floor(Math.random() * 999), nombre: nombre || 'Capa', producto: 'REZINC', solicitado: '2 a 3 Mils', amb: { fecha: hoy(), humedad: '', tAmbiente: '', tPieza: '', ptoRocio: '', horaInicio: '' }, filas: [['', '', '', '', '', '', ''], ['', '', '', '', '', '', ''], ['', '', '', '', '', '', ''], ['', '', '', '', '', '', ''], ['', '', '', '', '', '', '']], fotos: [] })
// El esquema de pintura ya se escribe una vez al crear la OT (ot.esquema) —
// se precarga aca en cada protocolo nuevo para no tener que volver a
// tipearlo (sigue siendo 100% editable, esto solo ahorra el primer tipeo).
function nuevoProtocolo(tipo, ot, correlativo, instrumentos) {
  const cod = correlativo + '-' + new Date().getFullYear(); const h = new Date().toISOString().slice(0, 10)
  const esquemaOt = (ot.esquema && ot.esquema !== '—') ? ot.esquema : ''
  const base = { id: 'pr' + Date.now() + Math.floor(Math.random() * 999), tipo, correlativo, codigo: tipo + ' ' + cod, pgpCodigo: 'PGP ' + cod, docNro: tipo === 'PIG' ? 'RC-GP-1' : 'RC-PG-6', ot: ot.numero || '', area: ot.area || '', oc: ot.oc || '', nv: ot.nv || '', cliente: ot.cliente || '', proyecto: '', esquemaProyecto: esquemaOt, preparadoPor: 'Boris Gomez', revisadoPor: 'Luis Soto', aprobadoPor: 'Luis Soto', fecha: h, marcas: [], logoCliente: '', firmas: [{ rol: 'Aprobado', quien: 'Boris Gomez', fecha: '' }, { rol: 'Recepcionado', quien: 'Cliente', fecha: '' }, { rol: 'Aprobado', quien: 'Inspector Cliente', fecha: '' }] }
  if (tipo === 'PIG') { return Object.assign(base, { descripcion: 'Proceso de inicio de granallado para pintura.', checks: [{ nombre: 'Control aire presurizado norma ASTM D4285', cumple: 'SI', obs: 'Sin presencia de humedad u otros contaminantes.', fotos: [] }, { nombre: 'Verificacion limpieza de granalla ASTM D7393', cumple: 'SI', obs: 'Sin presencia de sales, aceites u otros contaminantes.', fotos: [] }, { nombre: 'Inspeccion visual pieza granallada', cumple: 'SI', obs: '', fotos: [] }, { nombre: 'Medicion perfil de rugosidad norma ASTM D4417', cumple: 'SI', obs: '', fotos: [] }], limpiezaSSPC: 'SP10', perfilSolicitado: '1 a 3 mils', medidas: ['', '', ''], perfilObtenido: '', perfilCumple: 'SI', amb: { fecha: h, humedad: '', tAmbiente: '', tPieza: '', ptoRocio: '', horaInicio: '' }, fotosGranalla: [] }) }
  var dfI = { espMarca: 'ELCOMETER', espSerie: 'MH11472', rugMarca: 'ELCOMETER', rugSerie: 'NE30319', termoMarca: 'ELCOMETER', termoSerie: 'KCA721' }; var inS = instrumentos || {}; const instr = { espMarca: inS.espMarca || dfI.espMarca, espSerie: inS.espSerie || dfI.espSerie, rugMarca: inS.rugMarca || dfI.rugMarca, rugSerie: inS.rugSerie || dfI.rugSerie, termoMarca: inS.termoMarca || dfI.termoMarca, termoSerie: inS.termoSerie || dfI.termoSerie }
  return Object.assign(base, { instr, amb: { fecha: h, humedad: '', tAmbiente: '', tPieza: '', ptoRocio: '', horaInicio: '' }, limpiezaSSPC: 'sspc-sP 10', perfilSolicitado: '2 a 2,5 Mils', perfilFilas: [['', '', '', '', ''], ['', '', '', '', ''], ['', '', '', '', ''], ['', '', '', '', '']], capas: [nuevaCapa('Primera capa')], fotosGranalla: [] })
}
function fotosHTML(fotos) { var s = ''; (fotos || []).forEach(function (d) { s += '<img src="' + d + '" style="width:32%;margin:0.5%;border:1px solid #999" />' }); return s }
function filasHTML(filas) { var s = ''; for (var i = 0; i < filas.length; i++) { var pr = promArr(filas[i]); s += '<tr><td class="c">' + (i + 1) + '</td>'; for (var j = 0; j < filas[i].length; j++) s += '<td class="c">' + (filas[i][j] || '') + '</td>'; s += '<td class="c"><b>' + (pr ? pr.toFixed(2) : '') + '</b></td></tr>' } return s }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
// logoOverride: logo propio del protocolo (p.logoCliente), cargado por
// pieza a pedido de clientes que quieren su propio logo en el documento en
// vez del de SEREIN/Istria — pisa cualquier logo de localStorage cuando
// viene informado.
function rptLogo(logoOverride) { if (logoOverride) return '<img src="' + logoOverride + '" style="height:44px;display:block" alt="logo"/>'; var _l=''; try { _l = localStorage.getItem('serein_logo') || '' } catch(e){} if (_l) return '<img src="' + _l + '" style="height:44px;display:block" alt="SEREIN"/>'; return '<div class="logo"><span class="lg-a">SEREIN</span><span class="lg-b">GROUP</span></div>' }
function statusBadge(v) { return v === 'SI' ? '<span class="badge badge-ok">&#10003; SI</span>' : (v === 'NO' ? '<span class="badge badge-no">&#10007; NO</span>' : esc(v)) }
function rptHeader(titulo, sub, rows, logoOverride) { if ((logoOverride || (typeof window !== 'undefined' && window.__sereinProtoIstria)) && sub === 'SEREIN GROUP') sub = ''; var d = ''; rows.forEach(function (r) { d += '<div class="cb-row"><span class="cb-k">' + r[0] + '</span><span class="cb-v">' + esc(r[1]) + '</span></div>' }); return '<div class="rhead"><div class="stripe"></div>' + rptLogo(logoOverride) + '<div class="rh-mid"><div class="rh-title">' + titulo + '</div><div class="rh-sub">' + sub + '</div></div><div class="codebox">' + d + '</div></div>' }
// Firmas guardadas en Parametros (ver SeccionInstrumentos en
// ParametrosModule.jsx): se completan solas en el PDF donde el nombre de
// la persona coincida, sin depender de mayusculas ni tildes — asi
// "Boris Gomez" calza con "Boris Gómez" o "boris gomez".
function normNombre(s) { return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') }
function firmaImgPara(equipos, nombre) {
  var mapa = (equipos && equipos.firmas) || {}
  var key = normNombre(nombre)
  if (!key) return ''
  for (var k in mapa) { if (normNombre(k) === key && mapa[k]) return mapa[k] }
  return ''
}
var FILAS_CON_FIRMA = ['Preparado por', 'Revisado por', 'Aprobado por']
function rptInfo(pairs, equipos) { var s = '<div class="infogrid">'; pairs.forEach(function (pr) { var img = FILAS_CON_FIRMA.indexOf(pr[0]) >= 0 ? firmaImgPara(equipos, pr[1]) : ''; s += '<div class="info-item"><span class="info-k">' + pr[0] + '</span><span class="info-v" style="display:flex;align-items:center;justify-content:flex-end;gap:6px">' + (img ? '<img src="' + img + '" style="height:34px;max-width:90px;object-fit:contain"/>' : '') + esc(pr[1]) + '</span></div>' }); return s + '</div>' }
function rptSection(t) { return '<div class="sec-title">' + t + '</div>' }
function rptTable(headers, rows) { var h = ''; for (var i = 0; i < headers.length; i++) h += '<th>' + headers[i] + '</th>'; var b = ''; for (var r = 0; r < rows.length; r++) { b += '<tr>'; for (var c = 0; c < rows[r].length; c++) b += '<td>' + rows[r][c] + '</td>'; b += '</tr>' } return '<table class="dt"><thead><tr>' + h + '</tr></thead><tbody>' + b + '</tbody></table>' }
function rptImageGrid(fotos) { var imgs = fotos || []; var g = imgs.length === 1 ? 'g1' : (imgs.length === 2 ? 'g2' : (imgs.length === 3 ? 'g3' : 'g4')); var ig = ''; for (var i = 0; i < imgs.length; i++) ig += '<div class="imgframe"><img src="' + imgs[i] + '"/></div>'; return '<div class="ev-right ' + g + '">' + ig + '</div>' }
function rptEvidence(num, titulo, obs, fotos) { return '<div class="evcard"><div class="ev-left"><div class="ev-title">EVIDENCIA ' + num + ':</div><div class="ev-desc">' + esc(titulo) + '</div>' + (obs ? '<div class="ev-obs"><b>OBS.:</b> ' + esc(obs) + '</div>' : '') + '</div>' + rptImageGrid(fotos) + '</div>' }
// Si alguien pegó varias marcas separadas por ";" (o "," o salto de
// línea) dentro de un mismo campo, se separan igual acá — así cada marca
// queda en su propia línea de la lista, aunque se hayan cargado todas
// juntas en un solo campo de texto.
function rptMarcas(marcas) {
  var arr = (marcas || []).reduce(function (acc, m) { return acc.concat(String(m || '').split(/[;,\n]+/)) }, [])
    .map(function (m) { return m.trim() }).filter(Boolean)
  arr = arr.filter(function (v, i) { return arr.indexOf(v) === i })
  arr.sort(function (a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) })
  if (!arr.length) return ''
  var items = ''; arr.forEach(function (m) { items += '<li>' + esc(m) + '</li>' })
  return rptSection('Detalle marcas de pieza') + '<ul class="marcas-list">' + items + '</ul>'
}
// Protocolos creados antes de que existiera esta funcion dejaron "Tecnico
// Pintura" como texto fijo en vez de un nombre real -- se mapea aca a
// Boris Gomez (quien cumple ese rol en la practica) para que tanto el
// texto como la firma salgan bien sin tener que editar cada protocolo
// viejo a mano.
function nombreFirmante(quien) { return normNombre(quien) === normNombre('Tecnico Pintura') ? 'Boris Gomez' : quien }
function rptSign(firmas, equipos) { var r = ''; (firmas || []).forEach(function (f) { var nombre = nombreFirmante(f.quien); var img = firmaImgPara(equipos, nombre); r += '<tr><td>' + esc(f.rol) + '</td><td>' + esc(nombre) + '</td><td class="sign-cell" style="overflow:visible">' + (img ? '<img src="' + img + '" style="height:64px;max-width:170px;object-fit:contain;display:block;margin:-16px auto"/>' : '') + '</td><td>' + esc(f.fecha) + '</td></tr>' }); return '<table class="dt"><thead><tr><th>Rol</th><th>Nombre</th><th>Firma</th><th>Fecha</th></tr></thead><tbody>' + r + '</tbody></table>' }
function rptFooter() { return '<div class="rfooter"><div class="rf-navy"><span>Compromiso con la calidad</span><span>Seguridad en cada proceso</span><span>Excelencia en resultados</span></div>' + ((typeof window !== 'undefined' && window.__sereinProtoIstria) ? '' : '<div class="rf-web">www.sereingroup.cl</div>') + '</div>' }
function tablaMedHTML(filas) { var nc = (filas && filas[0] ? filas[0].length : 5); var th = ['Item']; for (var a = 1; a <= nc; a++) th.push('' + a); th.push('Prom.'); var rows = []; for (var i = 0; i < filas.length; i++) { var f = filas[i]; var row = ['' + (i + 1)]; for (var j = 0; j < f.length; j++) row.push(esc(f[j] || '')); var pr = promArr(f); row.push('<span class="prom-badge">' + (pr ? pr.toFixed(2) : '') + '</span>'); rows.push(row) } return rptTable(th, rows) }
function rptEquipos(eq) { eq = eq || {}; var cols = [['Medidor de espesor', eq.espMarca || 'ELCOMETER', eq.espSerie || '', eq.espFotos || []], ['Rugosimetro', eq.rugMarca || 'ELCOMETER', eq.rugSerie || '', eq.rugFotos || []], ['Termohigrometro', eq.termoMarca || 'ELCOMETER', eq.termoSerie || '', eq.termoFotos || []]]; var s = '<div class="equipos">'; cols.forEach(function (c) { var ig = ''; (c[3] || []).forEach(function (d) { ig += '<div class="eq-img"><img src="' + d + '"/></div>' }); s += '<div class="eq-col"><div class="eq-name">' + esc(c[1]) + '</div><div class="eq-code">' + esc(c[2]) + '</div><div class="eq-sub">' + esc(c[0]) + '</div>' + ig + '</div>' }); return s + '</div>' }
function htmlPIG(p, equipos) {
  var prom = promArr(p.medidas); var promTxt = prom ? prom.toFixed(2) : '';
  var info = [['Orden de Trabajo', p.ot], ['Cliente', p.cliente], ['Proyecto', p.proyecto], ['Protoc. Granallado', p.pgpCodigo], ['Protoc. Pintura', p.pgpCodigo], ['Preparado por', p.preparadoPor], ['Revisado por', p.revisadoPor], ['Aprobado por', p.aprobadoPor], ['Fecha', p.fecha], ['NV', p.nv]];
  var chkRows = []; for (var i = 0; i < p.checks.length; i++) { var c = p.checks[i]; chkRows.push(['' + (i + 1), esc(c.nombre), statusBadge(c.cumple), esc(c.obs)]) }
  var perfil = rptTable(['Parametro', 'Valor', 'Parametro', 'Valor'], [['Limpieza superficial SSPC-SP', esc(p.limpiezaSSPC), 'Perfil de anclaje', esc(p.perfilSolicitado)], ['Medidas rugosidad', esc((p.medidas || []).join('  -  ')), 'Promedio', promTxt], ['Perfil obtenido', esc(p.perfilObtenido || promTxt), 'Cumple', statusBadge(p.perfilCumple)]]);
  var amb = rptTable(['Parametro', 'Valor', 'Parametro', 'Valor'], [['Fecha', esc(p.amb.fecha), '% Humedad', esc(p.amb.humedad)], ['T. Ambiente C', esc(p.amb.tAmbiente), 'C Pieza', esc(p.amb.tPieza)], ['Pto. Rocio', esc(p.amb.ptoRocio), 'Hora inicio', esc(p.amb.horaInicio)]].concat((p.ambExtra || []).map(function (c) { return [esc(c.label), esc(c.valor), '', ''] })));
  var page1 = '<div class="page">' + rptHeader('PROTOCOLO INICIO DE GRANALLA', 'SEREIN GROUP', [['Codigo', p.codigo || ''], ['Documento N', p.docNro || '']], p.logoCliente) + rptInfo(info, equipos) + ((p.descripcion || p.esquemaProyecto) ? rptSection('Descripcion y esquema del proyecto') + '<div style="font-size:11px;color:#101828;line-height:1.55;margin:2px 0 12px">' + (p.descripcion ? '<b>Descripcion:</b> ' + esc(p.descripcion) + '<br>' : '') + (p.esquemaProyecto ? '<b>Esquema del proyecto:</b> ' + esc(p.esquemaProyecto) : '') + '</div>' : '') + rptMarcas(p.marcas) + '<div class="keep-together">' + rptSection('1. Analisis proceso de granallado') + rptTable(['N', 'Control', 'Cumple', 'Observacion'], chkRows) + '</div>' + '<div class="keep-together">' + rptSection('2. Inspeccion de perfil') + perfil + '</div>' + '<div class="keep-together">' + rptSection('3. Condiciones ambientales') + amb + '</div>' + '<div class="keep-together">' + rptSection('4. Firmas') + rptSign(p.firmas, equipos) + '</div>' + rptFooter() + '</div>';
  var evChecks = (p.checks || []).filter(function (c) { return c.fotos && c.fotos.length }); var ev = ''; var en = 0; evChecks.forEach(function (c) { en++; ev += rptEvidence(en, c.nombre, c.obs, c.fotos) });
  var info2 = [['Preparado por', p.preparadoPor], ['Revisado por', p.revisadoPor], ['Aprobado por', p.aprobadoPor], ['Cliente', p.cliente], ['Proyecto', p.proyecto], ['Prot. Granallado', p.pgpCodigo], ['Prot. Pintura', p.pgpCodigo], ['Fecha', p.fecha]];
  var page2 = ''; if (evChecks.length) page2 = '<div class="page">' + rptHeader('PROTOCOLO INICIO DE GRANALLA', 'ANEXO IMAGENES EVIDENCIA', [['Documento N', p.docNro || ''], ['Orden de Trabajo', p.ot || ''], ['Pagina', '2/2']], p.logoCliente) + rptInfo(info2, equipos) + rptSection('Anexo imagenes evidencia') + ev + rptSection('Firmas') + rptSign(p.firmas, equipos) + rptFooter() + '</div>';
  var pageEq = '<div class="page">' + rptHeader('PROTOCOLO INICIO DE GRANALLA', 'EQUIPOS DE MEDICION', [['Documento N', p.docNro || ''], ['Orden de Trabajo', p.ot || '']], p.logoCliente) + rptSection('Equipos de medicion') + rptEquipos(equipos) + rptFooter() + '</div>'; return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(p.codigo || 'PIG') + '</title><style>' + PROTO_CSS + '</style></head><body>' + page1 + page2 + pageEq + '</body></html>';
}
function htmlPGP(p, equipos) {
  var pp = (p.perfilFilas || []).map(function (f) { return promArr(f) }); var perfObt = pp.length ? (pp.reduce(function (a, b) { return a + b }, 0) / pp.length) : 0;
  var info = [['Orden de Trabajo', p.ot], ['Cliente', p.cliente], ['Proyecto', p.proyecto], ['Prot. Granallado', p.pgpCodigo], ['Prot. Pintura', p.pgpCodigo], ['Preparado por', p.preparadoPor], ['Revisado por', p.revisadoPor], ['Aprobado por', p.aprobadoPor], ['Fecha', p.fecha], ['NV', p.nv]];
  var instr = rptTable(['Instrumento', 'Marca / Serie', 'Instrumento', 'Marca / Serie'], [['Medidor de espesor', esc((p.instr.espMarca || '') + '  /  ' + (p.instr.espSerie || '')), 'Rugosimetro', esc((p.instr.rugMarca || '') + '  /  ' + (p.instr.rugSerie || ''))], ['Termohigrometro', esc((p.instr.termoMarca || '') + '  /  ' + (p.instr.termoSerie || '')), '', '']]);
  var amb = rptTable(['Parametro', 'Valor', 'Parametro', 'Valor'], [['Fecha', esc(p.amb.fecha), '% Humedad', esc(p.amb.humedad)], ['T. Ambiente C', esc(p.amb.tAmbiente), 'C Pieza', esc(p.amb.tPieza)], ['Pto. Rocio', esc(p.amb.ptoRocio), 'Hora inicio', esc(p.amb.horaInicio)]].concat((p.ambExtra || []).map(function (c) { return [esc(c.label), esc(c.valor), '', ''] })));
  var perfTbl = tablaMedHTML(p.perfilFilas || []);
  var capasHtml = ''; (p.capas || []).forEach(function (cap, ci) {
    var cp = (cap.filas || []).map(function (f) { return promArr(f) }); var cprom = cp.length ? (cp.reduce(function (a, b) { return a + b }, 0) / cp.length) : 0; var ac = acumRango(p.capas, ci);
    var cambAmb = cap.amb || {};
    var cambTbl = rptTable(['Parametro', 'Valor', 'Parametro', 'Valor'], [['Fecha', esc(cambAmb.fecha), '% Humedad', esc(cambAmb.humedad)], ['T. Ambiente C', esc(cambAmb.tAmbiente), 'C Pieza', esc(cambAmb.tPieza)], ['Pto. Rocio', esc(cambAmb.ptoRocio), 'Hora inicio', esc(cambAmb.horaInicio)]]);
    // .keep-together evita que el título de la capa quede solo al final de
    // una hoja y su tabla recién en la siguiente — todo el bloque de una
    // capa (título + condiciones ambientales + tabla de espesores) se
    // mantiene junto al imprimir.
    capasHtml += '<div class="keep-together">' + rptSection('Esquema: ' + esc(cap.nombre || 'Capa') + '  -  ' + esc(cap.producto || '') + '  (Solicitado acum. ' + ac[0] + ' a ' + ac[1] + ' mils  /  Promedio ' + (cprom ? cprom.toFixed(2) : '') + ')') + '<div class="sub-sec-title">Condiciones ambientales de esta capa</div>' + cambTbl + tablaMedHTML(cap.filas || []) + '</div>'
  });
  var page1 = '<div class="page">' + rptHeader('PROTOCOLO GRANALLADO Y PINTURA', 'SEREIN GROUP', [['Codigo', p.codigo || ''], ['Documento N', p.docNro || '']], p.logoCliente) + rptInfo(info, equipos) + ((p.descripcion || p.esquemaProyecto) ? rptSection('Descripcion y esquema del proyecto') + '<div style="font-size:11px;color:#101828;line-height:1.55;margin:2px 0 12px">' + (p.descripcion ? '<b>Descripcion:</b> ' + esc(p.descripcion) + '<br>' : '') + (p.esquemaProyecto ? '<b>Esquema del proyecto:</b> ' + esc(p.esquemaProyecto) : '') + '</div>' : '') + rptMarcas(p.marcas) + '<div class="keep-together">' + rptSection('1. Instrumentos utilizados') + instr + '</div>' + '<div class="keep-together">' + rptSection('2. Condiciones ambientales') + amb + '</div>' + '<div class="keep-together">' + rptSection('3. Perfil de rugosidad (Limpieza ' + esc(p.limpiezaSSPC || '') + '  /  Solicitado ' + esc(p.perfilSolicitado || '') + '  /  Obtenido ' + (perfObt ? perfObt.toFixed(2) : '') + ')') + perfTbl + '</div>' + capasHtml + '<div class="keep-together">' + rptSection('Firmas') + rptSign(p.firmas, equipos) + '</div>' + rptFooter() + '</div>';
  var ev = ''; var en = 0; if ((p.fotosGranalla || []).length) { en++; ev += rptEvidence(en, 'Evidencia granallado', '', p.fotosGranalla) } (p.capas || []).forEach(function (cap) { if ((cap.fotos || []).length) { en++; ev += rptEvidence(en, esc(cap.nombre || 'Capa'), '', cap.fotos) } });
  var info2 = [['Preparado por', p.preparadoPor], ['Revisado por', p.revisadoPor], ['Aprobado por', p.aprobadoPor], ['Cliente', p.cliente], ['Proyecto', p.proyecto], ['Prot. Granallado', p.pgpCodigo], ['Prot. Pintura', p.pgpCodigo], ['Fecha', p.fecha]];
  var page2 = ''; if (en) page2 = '<div class="page">' + rptHeader('PROTOCOLO GRANALLADO Y PINTURA', 'ANEXO IMAGENES EVIDENCIA', [['Documento N', p.docNro || ''], ['Orden de Trabajo', p.ot || ''], ['Pagina', '2/2']], p.logoCliente) + rptInfo(info2, equipos) + rptSection('Anexo imagenes evidencia') + ev + rptSection('Firmas') + rptSign(p.firmas, equipos) + rptFooter() + '</div>';
  var pageEq = '<div class="page">' + rptHeader('PROTOCOLO GRANALLADO Y PINTURA', 'EQUIPOS DE MEDICION', [['Documento N', p.docNro || ''], ['Orden de Trabajo', p.ot || '']], p.logoCliente) + rptSection('Equipos de medicion') + rptEquipos(equipos) + rptFooter() + '</div>'; return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(p.codigo || 'PGP') + '</title><style>' + PROTO_CSS + '</style></head><body>' + page1 + page2 + pageEq + '</body></html>';
}
var PROTO_CSS = '@page{size:A4;margin:20mm 15mm 15mm 15mm}*{box-sizing:border-box}body{font-family:Inter,Arial,Helvetica,sans-serif;color:#101828;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{position:relative;padding-bottom:70px}.page+.page{page-break-before:always}.rhead{position:relative;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #061A40;padding:4px 0 10px;overflow:hidden}.logo{display:flex;align-items:baseline}.lg-a{color:#061A40;font-weight:800;font-size:22px;letter-spacing:1px}.lg-b{color:#FF6B00;font-weight:800;font-size:22px;margin-left:5px;letter-spacing:1px}.rh-mid{flex:1;text-align:center}.rh-title{color:#061A40;font-weight:800;font-size:17px;letter-spacing:.5px}.rh-sub{color:#FF6B00;font-weight:700;font-size:10px;letter-spacing:2px;margin-top:2px}.codebox{background:#061A40;color:#fff;padding:8px 12px;border-radius:6px;font-size:10px;min-width:160px}.cb-row{display:flex;justify-content:space-between;gap:12px;padding:1px 0}.cb-k{color:#9fb0cf}.cb-v{font-weight:700}.stripe{position:absolute;top:-10px;right:120px;width:60px;height:130%;background:#FF6B00;opacity:.10;transform:skewX(-22deg)}.infogrid{display:grid;grid-template-columns:1fr 1fr;gap:0 26px;margin:14px 0 4px}.info-item{display:flex;justify-content:space-between;border-bottom:1px solid #D8DCE5;padding:5px 2px;font-size:11px}.info-k{color:#5a6b85}.info-v{font-weight:700;color:#101828;text-align:right}.sec-title{color:#061A40;font-weight:800;font-size:12px;text-transform:uppercase;border-left:4px solid #FF6B00;padding-left:9px;margin:16px 0 7px;letter-spacing:.4px;page-break-after:avoid}.sub-sec-title{color:#5a6b85;font-weight:700;font-size:10.5px;text-transform:uppercase;margin:8px 0 4px;letter-spacing:.3px}.keep-together{page-break-inside:avoid}.marcas-list{columns:3;column-gap:24px;-webkit-columns:3;margin:0 0 14px;padding-left:18px;font-size:11px;line-height:1.75;color:#101828}.marcas-list li{break-inside:avoid-column}table.dt{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:4px}table.dt th{background:#061A40;color:#fff;padding:6px 8px;text-align:left;font-weight:700;font-size:10px}table.dt td{border:1px solid #D8DCE5;padding:6px 8px}table.dt td.c{text-align:center}.badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700}.badge-ok{background:#e6f7ec;color:#16A34A}.badge-no{background:#fdeaea;color:#DC2626}.prom-badge{display:inline-block;background:#FF6B00;color:#fff;padding:2px 9px;border-radius:4px;font-weight:700;font-size:10.5px}.norm{display:inline-block;padding:1px 7px;border:1px solid #D8DCE5;border-radius:4px;font-size:9px;color:#5a6b85;background:#F5F7FA}.sign-cell{height:32px}.rfooter{display:flex;margin-top:20px;border-radius:6px;overflow:hidden;border:1px solid #D8DCE5}.rf-navy{background:#061A40;color:#fff;flex:1;display:flex;gap:20px;justify-content:center;align-items:center;padding:10px;font-size:10px;font-weight:600}.rf-web{background:#FF6B00;color:#fff;padding:0 16px;font-weight:700;font-size:11px;display:flex;align-items:center}.evcard{border:1px solid #D8DCE5;border-radius:8px;padding:12px 14px;margin-bottom:12px;display:flex;gap:16px;page-break-inside:avoid;background:#fff}.ev-left{width:36%}.ev-title{color:#FF6B00;font-weight:800;font-size:12px}.ev-desc{margin:5px 0;font-size:11px;font-weight:600;color:#101828}.ev-obs{font-size:10.5px;color:#344054;line-height:1.4}.ev-right{flex:1;display:grid;gap:6px}.ev-right.g1{grid-template-columns:1fr}.ev-right.g2{grid-template-columns:repeat(2,1fr)}.ev-right.g3{grid-template-columns:repeat(3,1fr)}.ev-right.g4{grid-template-columns:repeat(2,1fr)}.imgframe{border:2px solid #061A40;border-radius:4px;overflow:hidden;height:150px;background:#F5F7FA;display:flex;align-items:center;justify-content:center}.imgframe img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block}.equipos{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:8px}.eq-col{border:1px solid #D8DCE5;border-radius:8px;padding:10px;text-align:center}.eq-name{color:#061A40;font-weight:800;font-size:12px}.eq-code{color:#FF6B00;font-weight:800;font-size:13px;margin:2px 0}.eq-sub{color:#5a6b85;font-size:10px;margin-bottom:8px}.eq-img{border:2px solid #061A40;border-radius:4px;overflow:hidden;height:130px;background:#F5F7FA;margin-bottom:6px;display:flex;align-items:center;justify-content:center}.eq-img img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}'
// Certificados de calibracion de los instrumentos (cargados en Parametros):
// se descargan solos al descargar el protocolo. Antes se intentaba con
// window.open() por cada uno, pero el navegador bloquea esa cadena de
// popups casi siempre (solo pasa el primero). Ahora se traen con fetch() y
// se bajan como blob via un <a download> — no es un popup, asi que nunca lo
// bloquea el navegador. Si el fetch falla (ej. sin conexion, CORS raro) se
// omite en silencio: el listado de links clickeables que ya se ve en cada
// protocolo sigue disponible como respaldo manual.
function nombreCertificado(label, blob) {
  var ext = ''
  if (blob && blob.type) { if (blob.type.indexOf('pdf') >= 0) ext = '.pdf'; else if (blob.type.indexOf('image/') === 0) ext = '.' + blob.type.split('/')[1] }
  return 'Certificado ' + label + ext
}
async function descargarCertificadosInstrumentos(equipos, soloKeys) {
  if (!equipos) return
  for (var i = 0; i < CERT_LABELS.length; i++) {
    var k = CERT_LABELS[i][0], label = CERT_LABELS[i][1]
    if (soloKeys && soloKeys.indexOf(k) < 0) continue
    var url = equipos[k]
    if (!url) continue
    try {
      var res = await fetch(url)
      var blob = await res.blob()
      var objUrl = URL.createObjectURL(blob)
      var a = document.createElement('a')
      a.href = objUrl; a.download = nombreCertificado(label, blob)
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(function () { URL.revokeObjectURL(objUrl) }, 15000)
    } catch (e) { /* se omite — el link manual del certificado sigue disponible */ }
  }
}
function descargarProto(p, equipos, certsKeys) { const w = window.open('', '_blank'); if (!w) { window.alert('Habilita las ventanas emergentes.'); return } try{var _i=localStorage.getItem('serein_logoIstria')||'',_sv=null,_sw=0;if(_i&&String(p.area||'').toLowerCase().indexOf('istria')>=0){_sv=localStorage.getItem('serein_logo');localStorage.setItem('serein_logo',_i);_sw=1;window.__sereinProtoIstria=true}}catch(e){} w.document.write(p.tipo === 'PIG' ? htmlPIG(p, equipos) : htmlPGP(p, equipos)); try{if(_sw){if(_sv==null)localStorage.removeItem('serein_logo');else localStorage.setItem('serein_logo',_sv);window.__sereinProtoIstria=false;}}catch(e){} w.document.close(); if (certsKeys && certsKeys.length) descargarCertificadosInstrumentos(equipos, certsKeys); setTimeout(function () { w.focus(); w.print() }, 400) }
function PF({ label, children }) { return (<div><div style={{ fontSize: 11, color: '#9AA3AD', marginBottom: 2, marginTop: 4 }}>{label}</div>{children}</div>) }
// Checklist de marcas de pieza para un protocolo: las candidatas salen de
// las "marcas esperadas" cargadas por Excel en la OT (ver MarcasEsperadasOT
// mas arriba), excluyendo las que ya quedaron asignadas a OTRO protocolo de
// la misma OT (usadasEnOtros) — asi al crear un protocolo nuevo solo se ven
// las que todavia no tienen protocolo. Tildar/destildar solo agrega o quita
// el texto de la marca del array `marcas` del protocolo (mismo dato de
// siempre, un array de strings), asi que protocolos ya guardados con marcas
// escritas a mano siguen funcionando igual. Debajo se mantiene la opcion de
// agregar una marca a mano, para piezas que no vinieron en el Excel del
// cliente.
function MarcasPiezaBlock({ marcas, onChange, marcasEsperadas = [], usadasEnOtros = [] }) {
  const arr = Array.isArray(marcas) ? marcas : []
  const norm = s => String(s == null ? '' : s).trim().toLowerCase()
  const usadasSet = new Set(usadasEnOtros.map(norm))
  const arrSet = new Set(arr.map(norm))
  const espSet = new Set(marcasEsperadas.map(m => norm(m.marca)))
  const candidatas = marcasEsperadas.filter(m => !usadasSet.has(norm(m.marca)))
  const toggle = marcaTxt => {
    const key = norm(marcaTxt)
    if (arrSet.has(key)) onChange(arr.filter(s => norm(s) !== key))
    else onChange([...arr, marcaTxt])
  }
  const ip = { padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, boxSizing: 'border-box', width: '100%' }
  return (<div style={{ margin: '10px 0 4px' }}>
    <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '6px 0 4px' }}>Detalle marcas de pieza</div>
    {marcasEsperadas.length === 0 ? (
      <div style={{ fontSize: 11.5, color: '#9AA3AD', marginBottom: 8 }}>No hay marcas esperadas cargadas por Excel en esta OT todavia — puedes agregarlas a mano abajo, o subir el Excel en "Marcas esperadas" mas arriba para marcarlas desde ahi.</div>
    ) : candidatas.length === 0 ? (
      <div style={{ fontSize: 11.5, color: '#9AA3AD', marginBottom: 8 }}>Todas las marcas del Excel ya estan asignadas a otro protocolo de esta OT.</div>
    ) : (
      <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8, border: '1px solid #EEE9DF', borderRadius: 4, padding: 8 }}>
        {candidatas.map(m => {
          const checked = arrSet.has(norm(m.marca))
          return (<label key={m.id || m.marca} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={checked} onChange={() => toggle(m.marca)} style={{ cursor: 'pointer' }} />
            <span>{m.marca}</span>
            {m.m2 > 0 && <span style={{ color: '#9AA3AD', fontSize: 11 }}>({m.m2} m²)</span>}
          </label>)
        })}
      </div>
    )}
    {arr.map((m, i) => espSet.has(norm(m)) ? null : (<div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
      <input style={ip} placeholder="Marca de pieza (ej. 2610-SP-32301)" value={m} onChange={e => onChange(arr.map((x, j) => j === i ? e.target.value : x))} />
      <button onClick={() => onChange(arr.filter((_, j) => j !== i))} style={{ background: 'none', border: '1px solid #DFE4EA', cursor: 'pointer', padding: '4px 8px', color: '#D9600A' }}>×</button>
    </div>))}
    <button onClick={() => onChange([...arr, ''])} style={{ background: C.teal, color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, marginTop: 2 }}>+ Agregar marca a mano</button>
  </div>)
}
function FotoSlots({ label, fotos, max, onChange }) {
  const add = e => { const files = [...(e.target.files || [])].slice(0, max - fotos.length); let pend = files.length; if (!pend) return; const acc = []; files.forEach(f => imgToData(f, d => { acc.push(d); pend--; if (pend === 0) onChange([...fotos, ...acc]) })); e.target.value = '' }
  return (<div style={{ marginTop: 8 }}><div style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AD', marginBottom: 4 }}>{label} ({fotos.length}/{max})</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{fotos.map((d, i) => (<div key={i} style={{ position: 'relative' }}><img src={d} style={{ width: 96, height: 72, objectFit: 'contain', background: '#F2F4F7', border: '1px solid #DFE4EA' }} /><button onClick={() => onChange(fotos.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, background: '#C5453D', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 11 }}>x</button></div>))}{fotos.length < max && (<label style={{ width: 96, height: 72, border: '1px dashed #DFE4EA', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#9AA3AD', fontSize: 22 }}>+<input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={add} /></label>)}</div></div>) }
function TablaMedidas({ titulo, filas, ncols, onSetCell, onAuto, onAddFila, onDelFila, resumen }) {
  const ip = { padding: '4px 5px', border: '1px solid #DFE4EA', fontSize: 12, width: 50, textAlign: 'center', boxSizing: 'border-box' }
  const proms = filas.map(f => promArr(f)); const global = proms.length ? (proms.reduce((a, b) => a + b, 0) / proms.length) : 0
  return (<div style={{ marginTop: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}><span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase' }}>{titulo}</span><div style={{ display: 'flex', gap: 6 }}>{onAddFila && <button onClick={onAddFila} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>+ fila</button>}{onDelFila && filas.length > 1 && <button onClick={onDelFila} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>- fila</button>}<button onClick={onAuto} title="Completa las celdas vacias con valores aceptables" style={{ background: '#3D7A4E', color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>Autocompletar</button></div></div><div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', fontSize: 12, marginTop: 4 }}><thead><tr><th style={{ padding: 3, fontSize: 10, color: '#9AA3AD' }}>Item</th>{Array.from({ length: ncols }).map((_, c) => <th key={c} style={{ padding: 3, fontSize: 10, color: '#9AA3AD' }}>{c + 1}</th>)}<th style={{ padding: 3, fontSize: 10, color: '#9AA3AD' }}>Prom.</th></tr></thead><tbody>{filas.map((f, ri) => (<tr key={ri}><td style={{ padding: 2, textAlign: 'center', fontWeight: 600 }}>{ri + 1}</td>{f.map((v, ci) => <td key={ci} style={{ padding: 2 }}><input style={ip} value={v} onChange={e => onSetCell(ri, ci, e.target.value)} /></td>)}<td style={{ padding: 2, textAlign: 'center', fontWeight: 700, color: '#F77716' }}>{proms[ri] ? proms[ri].toFixed(2) : ''}</td></tr>))}</tbody></table></div><div style={{ fontSize: 12, marginTop: 4 }}>{resumen}: <b>{global ? global.toFixed(2) : ''}</b></div></div>) }
// Certificados: cada uno tiene su propio checkbox (tildado por defecto) —
// se descargan solos (fetch + blob, ver descargarCertificadosInstrumentos)
// al apretar "Descargar PDF" solo los que esten tildados, no es todo o
// nada. El link de cada certificado queda clickeable siempre, tildado o no,
// para bajar uno solo a mano cuando se quiera.
var CERT_LABELS = [['espCertificado', 'Medidor de espesor'], ['rugCertificado', 'Rugosimetro'], ['termoCertificado', 'Termohigrometro'], ['granallaCertificado', 'Granalla'], ['galgasCertificado', 'Galgas de calibracion']]
function ProtoHead({ p, upd, onDel, titulo, equipos, col, onTgl }) {
  const ip = { padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, boxSizing: 'border-box', width: '100%' }
  const set = (k, v) => upd({ ...p, [k]: v })
  const certsDisponibles = CERT_LABELS.filter(c => equipos && equipos[c[0]])
  const [certsSel, setCertsSel] = useState({})
  const certMarcado = k => certsSel[k] !== false
  const toggleCert = k => setCertsSel(s => ({ ...s, [k]: !certMarcado(k) }))

  // Cierre + subida automatica a Drive: solo se habilita cuando el
  // protocolo tiene firmas con fecha y al menos una foto de evidencia —
  // el clic en el boton ES la revision humana antes de cerrarlo (nadie
  // mas lo hace por la persona).
  const [subiendoDrive, setSubiendoDrive] = useState(false)
  const [driveMsg, setDriveMsg] = useState(null)
  const chequeoCompleto = protocoloCompleto(p)
  const cerrarYSubirDrive = async () => {
    setSubiendoDrive(true); setDriveMsg(null)
    try {
      const html = p.tipo === 'PIG' ? htmlPIG(p, equipos) : htmlPGP(p, equipos)
      // Con limite de tiempo: generar la imagen de cada pagina (html-to-image)
      // podia quedarse colgada para siempre si alguna imagen embebida (foto,
      // firma, logo) fallaba en silencio al renderizar — sin este limite, el
      // boton se quedaba diciendo "Subiendo…" eternamente, sin exito ni
      // error, sin ninguna forma de saber que paso.
      const blob = await conLimiteTiempo(generarPdfProtocoloBlob(html), 45000, 'No se pudo generar el PDF a tiempo (45s) — puede que una foto o firma cargada esté dañada. Intenta de nuevo; si se repite, avisa cuál protocolo es.')
      const pdfBase64 = await blobToBase64(blob)
      // El nombre incluye OC y NV cuando existen, para poder ubicar el
      // archivo en Drive sin tener que abrirlo.
      const partesNombre = [p.codigo || 'Protocolo', p.cliente || 'Sin cliente']
      if (p.oc && p.oc !== '—') partesNombre.push('OC ' + p.oc)
      if (p.nv && p.nv !== '—') partesNombre.push('NV ' + p.nv)
      const filename = partesNombre.join(' - ') + '.pdf'
      const { data, error } = await conLimiteTiempo(supabase.functions.invoke('subir-protocolo-drive', { body: { pdfBase64, filename, cliente: p.cliente || 'Sin cliente' } }), 30000, 'La subida a Drive no respondió a tiempo (30s). Revisa tu conexión e intenta de nuevo.')
      if (error) throw error
      if (!data || !data.ok) throw new Error((data && data.error) || 'No se pudo subir a Drive.')
      setDriveMsg({ ok: true, link: data.webViewLink })
    } catch (err) { setDriveMsg({ ok: false, texto: 'No se pudo subir a Drive: ' + ((err && err.message) || String(err)) }) }
    setSubiendoDrive(false)
  }

  return (<div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}><span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 14, textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }} onClick={onTgl}>{col ? '▸ ' : '▾ '}{p.codigo} - {titulo}</span><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button onClick={() => descargarProto(p, equipos, certsDisponibles.filter(c => certMarcado(c[0])).map(c => c[0]))} style={{ background: '#101315', color: '#fff', border: 'none', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5 }}>Descargar PDF</button><button onClick={cerrarYSubirDrive} disabled={!chequeoCompleto.completo || subiendoDrive} title={chequeoCompleto.completo ? 'Genera el PDF y lo sube a Drive, en la carpeta del cliente' : 'Falta: ' + chequeoCompleto.faltantes.join(', ')} style={{ background: chequeoCompleto.completo ? C.verde : '#DFE4EA', color: chequeoCompleto.completo ? '#fff' : '#9AA3AD', border: 'none', padding: '7px 12px', cursor: chequeoCompleto.completo && !subiendoDrive ? 'pointer' : 'not-allowed', fontSize: 12.5 }}>{subiendoDrive ? 'Subiendo…' : 'Cerrar y subir a Drive'}</button><button onClick={onDel} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '7px 10px', cursor: 'pointer', fontSize: 12.5, color: '#9AA3AD' }}>Eliminar</button></div></div>
    {driveMsg && (driveMsg.ok
      ? <div style={{ fontSize: 12.5, fontWeight: 700, color: C.verde, background: '#E6F5EA', border: '1px solid #B7E0C4', borderRadius: 4, padding: '8px 12px', marginBottom: 8 }}>✓ Documento cargado con éxito. <a href={driveMsg.link} target="_blank" rel="noreferrer" style={{ color: C.teal, fontWeight: 700 }}>Ver en Drive</a></div>
      : <div style={{ fontSize: 11.5, color: '#C5453D', marginBottom: 8 }}>{driveMsg.texto}</div>)}
    {certsDisponibles.length > 0 && (<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 11.5, marginBottom: 8, padding: '6px 10px', background: '#F6F9F8', border: '1px solid #DFE4EA', borderRadius: 4 }}><span style={{ color: '#9AA3AD' }}>Certificados a incluir:</span>{certsDisponibles.map(c => (<label key={c[0]} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}><input type="checkbox" checked={certMarcado(c[0])} onChange={() => toggleCert(c[0])} style={{ cursor: 'pointer' }} /><a href={equipos[c[0]]} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#0E7A8F', fontWeight: 600 }}>{c[1]}</a></label>))}</div>)}{!col && (<><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8 }}><PF label="Codigo"><input style={ip} value={p.codigo} onChange={e => set('codigo', e.target.value)} /></PF><PF label="Orden de Trabajo"><input style={ip} value={p.ot} onChange={e => set('ot', e.target.value)} /></PF><PF label="NV"><input style={ip} value={p.nv} onChange={e => set('nv', e.target.value)} /></PF><PF label="Codigo PGP (gran/pintura)"><input style={ip} value={p.pgpCodigo} onChange={e => set('pgpCodigo', e.target.value)} /></PF><PF label="Cliente"><input style={ip} value={p.cliente} onChange={e => set('cliente', e.target.value)} /></PF><PF label="Proyecto"><input style={ip} value={p.proyecto} onChange={e => set('proyecto', e.target.value)} /></PF><PF label="Fecha"><input type="date" style={ip} value={p.fecha} onChange={e => set('fecha', e.target.value)} /></PF><PF label="Preparado por"><input style={ip} value={p.preparadoPor} onChange={e => set('preparadoPor', e.target.value)} /></PF></div><div style={{ marginTop: 10 }}><div style={{ fontSize: 11, color: '#9AA3AD', marginBottom: 4 }}>Logo del cliente (opcional) — si se carga, reemplaza el logo SEREIN solo en este documento</div><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{p.logoCliente ? <img src={p.logoCliente} alt="logo cliente" style={{ height: 40, background: '#fff', border: '1px solid #DFE4EA', borderRadius: 4, padding: 3, objectFit: 'contain' }} /> : <div style={{ height: 40, width: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #DFE4EA', borderRadius: 4, fontSize: 10.5, color: '#9AA3AD' }}>Sin logo</div>}<label style={{ cursor: 'pointer', background: '#101315', color: '#fff', fontSize: 11.5, fontWeight: 600, padding: '6px 11px', borderRadius: 4 }}>Subir logo<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const fl = e.target.files[0]; if (!fl) return; imgToData(fl, d => set('logoCliente', d)); e.target.value = '' }} /></label>{p.logoCliente && <button onClick={() => set('logoCliente', '')} style={{ background: 'transparent', border: '1px solid #DFE4EA', color: '#C5453D', fontSize: 11.5, padding: '6px 10px', borderRadius: 4, cursor: 'pointer' }}>Quitar</button>}</div></div></>)}</div>) }
// Editar un protocolo con estado local + debounce: antes cada tecla llamaba
// de inmediato a upd(), que reescribe el arreglo COMPLETO de OTs en
// localStorage/Supabase y fuerza un re-render de todo el listado — con
// muchas OT cargadas eso es lo que se sentia como "escribe las letras una a
// una, muy lento" (y con re-renders tan pesados, alguna tecla se podia
// perder). Ahora se ve al toque en pantalla (estado local) y el guardado
// real recien se dispara 700ms despues del ultimo cambio, mismo patron ya
// usado en Ordenes de Compra/Facturas/Nomina/Parametros este mismo mes.
function ProtoPIGForm({ p: pProp, upd: updRemoto, onDel, instrumentos, marcasEsperadas = [], usadasEnOtros = [] }) {
  const [p, setPLocal] = useState(pProp)
  useEffect(() => { setPLocal(pProp) }, [pProp.id])
  const timerProto = useRef(null)
  const upd = np => {
    setPLocal(np)
    clearTimeout(timerProto.current)
    timerProto.current = setTimeout(() => updRemoto(np), 700)
  }
  const ip = { padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, boxSizing: 'border-box', width: '100%' }
  const set = (k, v) => upd({ ...p, [k]: v }); const setAmb = (k, v) => upd({ ...p, amb: { ...p.amb, [k]: v } }); const setChk = (i, k, v) => upd({ ...p, checks: p.checks.map((c, j) => j === i ? { ...c, [k]: v } : c) }); const setMed = (i, v) => upd({ ...p, medidas: p.medidas.map((m, j) => j === i ? v : m) }); const [col, setCol] = useState(false)
  return (<div style={{ marginTop: 12, border: '1px solid #DFE4EA', borderTop: '3px solid #F77716', padding: 14 }}><ProtoHead p={p} upd={upd} onDel={onDel} titulo="Protocolo Inicio de Granalla" equipos={instrumentos} col={col} onTgl={() => setCol(!col)} />{!col && (<><div style={{ margin: '10px 0 4px' }}><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '6px 0 4px' }}>Descripción</div><input style={ip} value={p.descripcion || ''} onChange={e => set('descripcion', e.target.value)} /><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '10px 0 4px' }}>Esquema del proyecto</div><textarea style={{ ...ip, minHeight: 54, resize: 'vertical' }} value={p.esquemaProyecto || ''} onChange={e => set('esquemaProyecto', e.target.value)} placeholder="Sistema de pintura, espesores, normas, alcance..." /></div><MarcasPiezaBlock marcas={p.marcas} onChange={v => set('marcas', v)} marcasEsperadas={marcasEsperadas} usadasEnOtros={usadasEnOtros} /><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '10px 0 4px' }}>Controles</div><div>{p.checks.map((c, i) => (<div key={i} style={{ border: '1px solid #DFE4EA', borderRadius: 6, padding: 8, marginBottom: 6 }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 6 }}><input style={ip} value={c.nombre} onChange={e => setChk(i, 'nombre', e.target.value)} /><select value={c.cumple} onChange={e => setChk(i, 'cumple', e.target.value)} style={ip}><option>SI</option><option>NO</option></select></div><input style={{ ...ip, marginTop: 6 }} placeholder="Observacion" value={c.obs} onChange={e => setChk(i, 'obs', e.target.value)} /><FotoSlots label={'Fotos evidencia ' + (i + 1)} fotos={c.fotos || []} max={4} onChange={v => setChk(i, 'fotos', v)} /></div>))}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', gap: 8, marginTop: 8 }}><PF label="Limpieza SSPC-SP"><input style={ip} value={p.limpiezaSSPC} onChange={e => set('limpiezaSSPC', e.target.value)} /></PF><PF label="Perfil de anclaje"><input style={ip} value={p.perfilSolicitado} onChange={e => set('perfilSolicitado', e.target.value)} /></PF><PF label="Medida 1"><input style={ip} value={p.medidas[0]} onChange={e => setMed(0, e.target.value)} /></PF><PF label="Medida 2"><input style={ip} value={p.medidas[1]} onChange={e => setMed(1, e.target.value)} /></PF><PF label="Medida 3"><input style={ip} value={p.medidas[2]} onChange={e => setMed(2, e.target.value)} /></PF><PF label="Perfil obtenido (auto)"><input readOnly style={{ ...ip, background: '#F1EDE6' }} value={promArr(p.medidas) ? promArr(p.medidas).toFixed(2) : ''} /></PF></div><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '12px 0 4px' }}>Condiciones ambientales</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 8 }}><PF label="Fecha"><input type="date" style={ip} value={p.amb.fecha} onChange={e => setAmb('fecha', e.target.value)} /></PF><PF label="% Humedad"><input style={ip} value={p.amb.humedad} onChange={e => setAmb('humedad', e.target.value)} /></PF><PF label="T. Ambiente C"><input style={ip} value={p.amb.tAmbiente} onChange={e => setAmb('tAmbiente', e.target.value)} /></PF><PF label="C Pieza"><input style={ip} value={p.amb.tPieza} onChange={e => setAmb('tPieza', e.target.value)} /></PF><PF label="Pto. Rocio"><input style={ip} value={p.amb.ptoRocio} onChange={e => setAmb('ptoRocio', e.target.value)} /></PF><PF label="Hora inicio"><input style={ip} value={p.amb.horaInicio} onChange={e => setAmb('horaInicio', e.target.value)} /></PF></div><FotoSlots label="Fotos inicio de granalla" fotos={p.fotosGranalla || []} max={4} onChange={v => set('fotosGranalla', v)} /><FirmasBlock firmas={p.firmas} onChange={v => set('firmas', v)} /></>)}</div>) }
// Firmas del protocolo (rol/nombre/fecha): antes solo existian para el
// PDF (rptSign) -- no habia ningun control en pantalla para poner la
// fecha, asi que "Cerrar y subir a Drive" quedaba bloqueado para siempre
// (exige firmas con fecha) sin que nadie pudiera completarlas nunca desde
// la ficha. La firma en si (la imagen) se sigue completando sola desde
// Parametros cuando el nombre calza (ver firmaImgPara) -- esto solo
// agrega el control que faltaba para el rol y la fecha.
function FirmasBlock({ firmas, onChange }) {
  const arr = Array.isArray(firmas) ? firmas : []
  const setFirma = (i, k, v) => onChange(arr.map((f, j) => j === i ? { ...f, [k]: v } : f))
  const quitar = i => onChange(arr.filter((_, j) => j !== i))
  const agregar = () => onChange([...arr, { rol: '', quien: '', fecha: '' }])
  const ip2 = { padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, boxSizing: 'border-box' }
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '10px 0 4px' }}>Firmas</div>
      {arr.length === 0 && <div style={{ fontSize: 11.5, color: '#9AA3AD', marginBottom: 6 }}>Sin firmas cargadas.</div>}
      {arr.map((f, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
          <input style={{ ...ip2, flex: '1 1 120px' }} placeholder="Rol (ej. Aprobado)" value={f.rol || ''} onChange={e => setFirma(i, 'rol', e.target.value)} />
          <input style={{ ...ip2, flex: '1 1 160px' }} placeholder="Nombre (ej. Boris Gomez)" value={f.quien || ''} onChange={e => setFirma(i, 'quien', e.target.value)} />
          <input type="date" style={{ ...ip2, flex: '0 1 160px' }} value={f.fecha || ''} onChange={e => setFirma(i, 'fecha', e.target.value)} />
          <button onClick={() => setFirma(i, 'fecha', hoy())} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '6px 10px', cursor: 'pointer', fontSize: 11.5 }}>Hoy</button>
          <button onClick={() => quitar(i)} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '6px 8px', cursor: 'pointer', fontSize: 11.5, color: '#C5453D' }}>×</button>
        </div>
      ))}
      <button onClick={agregar} style={{ background: C.teal, color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, marginTop: 2 }}>+ Agregar firma</button>
    </div>
  )
}
function CapaBlock({ cap, acum, onSet, onSetAmb, onCell, onAuto, onAddFila, onDelFila, onFotos, onDel }) {
  const ip = { padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, boxSizing: 'border-box', width: '100%' }
  const amb = cap.amb || {}
  return (<div style={{ border: '1px solid #DFE4EA', padding: 10, marginTop: 8, background: '#F2F4F7' }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 8 }}><PF label="Nombre capa"><input style={ip} value={cap.nombre} onChange={e => onSet('nombre', e.target.value)} /></PF><PF label="Producto"><input style={ip} value={cap.producto} onChange={e => onSet('producto', e.target.value)} /></PF><PF label="Espesor solicitado (capa)"><input style={ip} value={cap.solicitado} onChange={e => onSet('solicitado', e.target.value)} /></PF><PF label="Solicitado acumulado"><input readOnly style={{ ...ip, background: '#FDECDD', color: '#D9600A', fontWeight: 600 }} value={acum ? (acum[0] + ' a ' + acum[1] + ' mils') : ''} /></PF></div>{onSetAmb && (<><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12, textTransform: 'uppercase', margin: '10px 0 4px', color: '#5a6b85' }}>Condiciones ambientales de esta capa</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px,1fr))', gap: 8 }}><PF label="Fecha"><input type="date" style={ip} value={amb.fecha || ''} onChange={e => onSetAmb('fecha', e.target.value)} /></PF><PF label="% Humedad"><input style={ip} value={amb.humedad || ''} onChange={e => onSetAmb('humedad', e.target.value)} /></PF><PF label="T. Ambiente"><input style={ip} value={amb.tAmbiente || ''} onChange={e => onSetAmb('tAmbiente', e.target.value)} /></PF><PF label="C Pieza"><input style={ip} value={amb.tPieza || ''} onChange={e => onSetAmb('tPieza', e.target.value)} /></PF><PF label="Pto. Rocio"><input style={ip} value={amb.ptoRocio || ''} onChange={e => onSetAmb('ptoRocio', e.target.value)} /></PF><PF label="Hora inicio"><input style={ip} value={amb.horaInicio || ''} onChange={e => onSetAmb('horaInicio', e.target.value)} /></PF></div></>)}<TablaMedidas titulo="Espesores (DFT)" filas={cap.filas} ncols={(cap.filas[0] || []).length} onSetCell={onCell} onAuto={onAuto} onAddFila={onAddFila} onDelFila={onDelFila} resumen="Promedio capa" /><FotoSlots label={'Fotos ' + (cap.nombre || 'capa')} fotos={cap.fotos || []} max={4} onChange={onFotos} /><div style={{ textAlign: 'right', marginTop: 4 }}><button onClick={onDel} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: '#C5453D' }}>Eliminar capa</button></div></div>) }
// Mismo patron de estado local + debounce que ProtoPIGForm (ver comentario
// ahi) — PGP tiene ademas las capas de pintura, que son las que mas campos
// de texto concentran, asi que era donde mas se notaba el "muy lento".
function ProtoPGPForm({ p: pProp, upd: updRemoto, onDel, instrumentos, marcasEsperadas = [], usadasEnOtros = [] }) {
  const [p, setPLocal] = useState(pProp)
  useEffect(() => { setPLocal(pProp) }, [pProp.id])
  const timerProto = useRef(null)
  const upd = np => {
    setPLocal(np)
    clearTimeout(timerProto.current)
    timerProto.current = setTimeout(() => updRemoto(np), 700)
  }
  const ip = { padding: '6px 8px', border: '1px solid #DFE4EA', fontSize: 12.5, boxSizing: 'border-box', width: '100%' }
  const set = (k, v) => upd({ ...p, [k]: v }); const setAmb = (k, v) => upd({ ...p, amb: { ...p.amb, [k]: v } }); const setInstr = (k, v) => upd({ ...p, instr: { ...p.instr, [k]: v } })
  const setPerfil = (r, c, v) => upd({ ...p, perfilFilas: p.perfilFilas.map((row, ri) => ri === r ? row.map((x, ci) => ci === c ? v : x) : row) })
  const autoPerfil = () => { const [lo, hi] = parseRango(p.perfilSolicitado); upd({ ...p, perfilFilas: p.perfilFilas.map(row => autoFila(row, lo, hi)) }) }
  const capas = Array.isArray(p.capas) ? p.capas : []
  const setCapa = (id, k, v) => upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, [k]: v } : c) })
  const setAmbCapa = (id, k, v) => upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, amb: { ...(c.amb || {}), [k]: v } } : c) })
  const cellCapa = (id, r, cc, v) => upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, filas: c.filas.map((row, ri) => ri === r ? row.map((x, ci) => ci === cc ? v : x) : row) } : c) })
  const autoCapa = id => { const idx = capas.findIndex(c => c.id === id); const ac = acumRango(capas, idx); upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, filas: c.filas.map(row => autoFila(row, ac[0], ac[1])) } : c) }) }
  const addFila = id => upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, filas: [...c.filas, ['', '', '', '', '', '', '']] } : c) })
  const delFila = id => upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, filas: c.filas.slice(0, -1) } : c) })
  const fotosCapa = (id, v) => upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, fotos: v } : c) })
  const addCapa = () => upd({ ...p, capas: [...capas, nuevaCapa('Capa ' + (capas.length + 1))] })
  const delCapa = id => upd({ ...p, capas: capas.filter(c => c.id !== id) }); const [col, setCol] = useState(false)
  return (<div style={{ marginTop: 12, border: '1px solid #DFE4EA', borderTop: '3px solid #101315', padding: 14 }}><ProtoHead p={p} upd={upd} onDel={onDel} titulo="Protocolo Granallado y Pintura" equipos={instrumentos} col={col} onTgl={() => setCol(!col)} />{!col && (<><div style={{ margin: '10px 0 4px' }}><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '6px 0 4px' }}>Descripción</div><input style={ip} value={p.descripcion || ''} onChange={e => set('descripcion', e.target.value)} /><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '10px 0 4px' }}>Esquema del proyecto</div><textarea style={{ ...ip, minHeight: 54, resize: 'vertical' }} value={p.esquemaProyecto || ''} onChange={e => set('esquemaProyecto', e.target.value)} placeholder="Sistema de pintura, espesores, normas, alcance..." /></div><MarcasPiezaBlock marcas={p.marcas} onChange={v => set('marcas', v)} marcasEsperadas={marcasEsperadas} usadasEnOtros={usadasEnOtros} /><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 4px' }}><span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase' }}>Instrumentos (desde Parametros)</span><button onClick={() => { var df = { espMarca: 'ELCOMETER', espSerie: 'MH11472', rugMarca: 'ELCOMETER', rugSerie: 'NE30319', termoMarca: 'ELCOMETER', termoSerie: 'KCA721' }; var s = instrumentos || {}; upd({ ...p, instr: { espMarca: s.espMarca || df.espMarca, espSerie: s.espSerie || df.espSerie, rugMarca: s.rugMarca || df.rugMarca, rugSerie: s.rugSerie || df.rugSerie, termoMarca: s.termoMarca || df.termoMarca, termoSerie: s.termoSerie || df.termoSerie } }) }} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>Cargar de Parametros</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8 }}><PF label="Medidor espesor - marca"><input style={ip} value={p.instr.espMarca} onChange={e => setInstr('espMarca', e.target.value)} /></PF><PF label="Medidor espesor - serie"><input style={ip} value={p.instr.espSerie} onChange={e => setInstr('espSerie', e.target.value)} /></PF><PF label="Rugosimetro - marca"><input style={ip} value={p.instr.rugMarca} onChange={e => setInstr('rugMarca', e.target.value)} /></PF><PF label="Rugosimetro - serie"><input style={ip} value={p.instr.rugSerie} onChange={e => setInstr('rugSerie', e.target.value)} /></PF><PF label="Termohigrometro - marca"><input style={ip} value={p.instr.termoMarca} onChange={e => setInstr('termoMarca', e.target.value)} /></PF><PF label="Termohigrometro - serie"><input style={ip} value={p.instr.termoSerie} onChange={e => setInstr('termoSerie', e.target.value)} /></PF></div><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '10px 0 4px' }}>Condiciones ambientales</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 8 }}><PF label="Fecha"><input type="date" style={ip} value={p.amb.fecha} onChange={e => setAmb('fecha', e.target.value)} /></PF><PF label="% Humedad"><input style={ip} value={p.amb.humedad} onChange={e => setAmb('humedad', e.target.value)} /></PF><PF label="T. Ambiente"><input style={ip} value={p.amb.tAmbiente} onChange={e => setAmb('tAmbiente', e.target.value)} /></PF><PF label="C Pieza"><input style={ip} value={p.amb.tPieza} onChange={e => setAmb('tPieza', e.target.value)} /></PF><PF label="Pto. Rocio"><input style={ip} value={p.amb.ptoRocio} onChange={e => setAmb('ptoRocio', e.target.value)} /></PF><PF label="Hora inicio"><input style={ip} value={p.amb.horaInicio} onChange={e => setAmb('horaInicio', e.target.value)} /></PF></div><div style={{ marginTop: 8 }}>{(p.ambExtra || []).map((c, i) => (<div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}><input style={{ ...ip, flex: '1 1 140px' }} placeholder="Condición" value={c.label || ''} onChange={e => set('ambExtra', (p.ambExtra || []).map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /><input style={{ ...ip, flex: '1 1 100px' }} placeholder="Valor" value={c.valor || ''} onChange={e => set('ambExtra', (p.ambExtra || []).map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} /><button onClick={() => set('ambExtra', (p.ambExtra || []).filter((_, j) => j !== i))} style={{ background: 'none', border: '1px solid #DFE4EA', cursor: 'pointer', padding: '4px 8px', color: '#D9600A' }}>×</button></div>))}<button onClick={() => set('ambExtra', [...(p.ambExtra || []), { label: '', valor: '' }])} style={{ background: C.teal, color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, marginTop: 2 }}>+ Agregar condición ambiental</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8, marginTop: 8 }}><PF label="Limpieza superficial"><input style={ip} value={p.limpiezaSSPC} onChange={e => set('limpiezaSSPC', e.target.value)} /></PF><PF label="Perfil de anclaje"><input style={ip} value={p.perfilSolicitado} onChange={e => set('perfilSolicitado', e.target.value)} /></PF></div><TablaMedidas titulo="Perfil de rugosidad" filas={Array.isArray(p.perfilFilas) ? p.perfilFilas : []} ncols={5} onSetCell={setPerfil} onAuto={autoPerfil} resumen="Perfil obtenido (prom.)" /><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '12px 0 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>Esquema de pintura - capas ({capas.length})</span><button onClick={addCapa} style={{ background: '#F77716', color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>+ Agregar capa</button></div>{capas.map((cap, ci) => (<CapaBlock key={cap.id} cap={cap} acum={acumRango(capas, ci)} onSet={(k, v) => setCapa(cap.id, k, v)} onSetAmb={(k, v) => setAmbCapa(cap.id, k, v)} onCell={(r, c, v) => cellCapa(cap.id, r, c, v)} onAuto={() => autoCapa(cap.id)} onAddFila={() => addFila(cap.id)} onDelFila={() => delFila(cap.id)} onFotos={v => fotosCapa(cap.id, v)} onDel={() => delCapa(cap.id)} />))}<FotoSlots label="Fotos inicio de granalla" fotos={p.fotosGranalla || []} max={4} onChange={v => set('fotosGranalla', v)} /><FirmasBlock firmas={p.firmas} onChange={v => set('firmas', v)} /></>)}</div>) }
function ProtocolosOT({ ot, onUpdate, otsAll = [], instrumentos = null }) {
  const lista = ot.protocolos || []
  // Overlay local mientras se llena un protocolo campo por campo — mismo
  // patron que cambiarM2Propio() en MarcasEsperadasOT. onUpdate (=
  // actualizarProtocolos) trae lo mas fresco de la nube antes de escribir,
  // para no perder un protocolo recien creado desde otra pestaña; eso es un
  // viaje de red, y si se dispara en cada tecla, cada una corre contra la
  // anterior y el campo no llega a aceptar texto de forma confiable. Por
  // eso se pinta desde este estado local al toque y el guardado real (el
  // que hace el pull) se debounce 700ms despues de la ultima tecla.
  const [listaLocal, setListaLocal] = useState(null)
  const listaMostrada = listaLocal || lista
  const timerRef = useRef(null)
  useEffect(() => { setListaLocal(null) }, [ot.id])
  const gen = tipo => { setListaLocal(null); onUpdate(ot.id, { protocolos: [...lista, nuevoProtocolo(tipo, ot, nextCorrelativoProt(otsAll), instrumentos)] }) }
  const updP = np => {
    const nueva = listaMostrada.map(x => x.id === np.id ? np : x)
    setListaLocal(nueva)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { onUpdate(ot.id, { protocolos: nueva }); setListaLocal(null) }, 700)
  }
  const delP = id => { if (!window.confirm('Eliminar este protocolo?')) return; setListaLocal(null); onUpdate(ot.id, { protocolos: lista.filter(x => x.id !== id) }) }
  return (<div style={{ marginTop: 14, borderTop: '1px dashed #DFE4EA', paddingTop: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 13, textTransform: 'uppercase' }}>Protocolos de calidad ({listaMostrada.length})</div><div style={{ display: 'flex', gap: 8 }}><button onClick={() => gen('PIG')} style={{ background: '#F77716', color: '#fff', border: 'none', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5 }}>+ Generar PIG</button><button onClick={() => gen('PGP')} style={{ background: '#101315', color: '#fff', border: 'none', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5 }}>+ Generar PGP</button></div></div>{listaMostrada.map(p => { const usadasEnOtros = listaMostrada.filter(x => x.id !== p.id).flatMap(x => x.marcas || []); const mEsp = ot.marcasEsperadas || []; return p.tipo === 'PIG' ? <ProtoPIGForm key={p.id} p={p} upd={updP} onDel={() => delP(p.id)} instrumentos={instrumentos} marcasEsperadas={mEsp} usadasEnOtros={usadasEnOtros} /> : <ProtoPGPForm key={p.id} p={p} upd={updP} onDel={() => delP(p.id)} instrumentos={instrumentos} marcasEsperadas={mEsp} usadasEnOtros={usadasEnOtros} /> })}</div>) }

export default function OTModule({ areasPermitidas = ['Santa Rosa', 'Istria'], ots: otsExt, setOts: setOtsExt, verValores = true, clientes = [], ordenesCompra = [], mo = null, instrumentos = null }) {
  const [otsInt, setOtsInt] = useState(OTS_INICIALES)
  const [libroCompras, setLibroCompras] = useState([])
  useEffect(() => { supabase.from('libro_compras').select('ot_id,provider_name,document_number,neto,document_total,emission_date').not('ot_id', 'is', null).then(({ data }) => setLibroCompras(data || [])) }, [])
  const otsAll = otsExt ?? otsInt
  const setOts = setOtsExt ?? setOtsInt
  const ots = otsAll.filter(o => areasPermitidas.includes(o.area) && !o.eliminada)
  const [areaSel, setAreaSel] = useState(areasPermitidas[0])
  const [creando, setCreando] = useState(false)
  const [fCliente, setFCliente] = useState('')
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState(null)
  const dragId = React.useRef(null)
  const mover = (fromId, toId) => { if (!fromId || fromId === toId) return; setOts(xs => { const arr = [...xs]; const from = arr.findIndex(x => x.id === fromId); const to = arr.findIndex(x => x.id === toId); if (from < 0 || to < 0) return xs; const [it] = arr.splice(from, 1); arr.splice(to, 0, it); return arr }) }
  const [migrando, setMigrando] = useState(false)
  const [migProgreso, setMigProgreso] = useState('')
  // Migración manual (un botón, un solo uso esperado): mueve las
  // fotos/protocolos guardados como base64 dentro de cada OT al bucket de
  // Storage "fotos-ot", dejando solo el link en su lugar. serein_ots pesa
  // hoy ~4.2MB en la base de datos, casi todo son imágenes embebidas —
  // eso duplicado en localStorage (dato real + copia de confirmación)
  // empuja el uso del navegador cerca de su límite y puede hacer fallar
  // el guardado en silencio. Corre con la sesión YA autenticada de quien
  // hace clic (necesita el bucket creado — Storage → bucket "fotos-ot" —
  // y sus políticas de lectura/escritura para "authenticated").
  const migrarFotosAStorage = async () => {
    if (!window.confirm('Esto va a mover todas las fotos y protocolos de las OT de esta área a almacenamiento en la nube, dejando solo el link en su lugar. Puede tardar varios minutos y no se debe cerrar esta pestaña mientras corre. ¿Continuar?')) return
    setMigrando(true)
    setMigProgreso('Preparando...')
    try {
      await pullState()
      let fresco = null
      try { fresco = JSON.parse(localStorage.getItem('serein_ots') || 'null') } catch (e) {}
      const base = Array.isArray(fresco) ? fresco : otsAll
      const RE_DATA_URI = /^data:image\/([a-zA-Z0-9.+-]+);base64,/
      const subirFoto = async (dataUri, carpeta) => {
        const m = dataUri.match(RE_DATA_URI)
        if (!m) return dataUri
        const ext = m[1].split('+')[0].replace('jpeg', 'jpg')
        const b64 = dataUri.slice(m[0].length)
        const bin = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const blob = new Blob([bytes], { type: 'image/' + ext })
        const nombre = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error } = await supabase.storage.from('fotos-ot').upload(nombre, blob, { contentType: 'image/' + ext, upsert: false })
        if (error) { console.error('migrarFotosAStorage: fallo al subir', nombre, error); return dataUri }
        const { data } = await supabase.storage.from('fotos-ot').createSignedUrl(nombre, 60 * 60 * 24 * 365 * 5)
        return data?.signedUrl || dataUri
      }
      const recorrer = async (nodo, carpeta) => {
        if (typeof nodo === 'string') return RE_DATA_URI.test(nodo) ? subirFoto(nodo, carpeta) : nodo
        if (Array.isArray(nodo)) { const out = []; for (const x of nodo) out.push(await recorrer(x, carpeta)); return out }
        if (nodo && typeof nodo === 'object') { const out = {}; for (const k of Object.keys(nodo)) out[k] = await recorrer(nodo[k], carpeta + '/' + k); return out }
        return nodo
      }
      const pesoAntes = JSON.stringify(base).length
      const nuevo = []
      for (let i = 0; i < base.length; i++) {
        setMigProgreso(`Procesando ${base[i].numero || base[i].id} (${i + 1}/${base.length})...`)
        nuevo.push(await recorrer(base[i], `OT-${base[i].numero || base[i].id}`))
      }
      const pesoDespues = JSON.stringify(nuevo).length
      try { localStorage.setItem('serein_ots', JSON.stringify(nuevo)) } catch (e) {}
      setOts(nuevo)
      const r = await pushState()
      if (r.ok) window.alert(`Listo. Peso de las OT: ${(pesoAntes / 1024 / 1024).toFixed(2)}MB → ${(pesoDespues / 1024 / 1024).toFixed(2)}MB. Las fotos ahora viven en Storage.`)
      else window.alert('Las fotos se subieron a Storage pero el guardado final del listado de OT falló: ' + (r.error || '') + '. Usa el botón "Guardar ahora" del menú lateral para reintentar — las fotos ya subidas no se pierden ni se duplican si vuelves a correr esta migración.')
    } catch (e) {
      window.alert('Error durante la migración: ' + ((e && e.message) || String(e)))
    } finally {
      setMigrando(false)
      setMigProgreso('')
    }
  }
  const [rep, setRep] = useState(false)
  const [repDesde, setRepDesde] = useState('')
  const [repHasta, setRepHasta] = useState('')
  const [repCliente, setRepCliente] = useState('')
  const [vista, setVistaRaw] = useState('activas')
  const [busqueda, setBusqueda] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fFactura, setFFactura] = useState('')
  // Cambiar de pestaña (activas/cerradas/facturadas) limpia el filtro de
  // facturacion — es un desplegable distinto en cada pestaña (opciones de
  // "cerradas" no existen en "facturadas" y viceversa); sin este reset,
  // quedaba un valor invisible filtrando la lista a "vacio sin aviso" al
  // cambiar de pestaña con un filtro puesto.
  const setVista = v => { setVistaRaw(v); setFFactura('') }
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

  // Antes actualizar() solo tocaba el estado de React y dependía del
  // guardado general de Dashboard.jsx (localStorage + push recién 800ms
  // después del último cambio, compartido con TODO el resto del ERP). Es
  // la función que maneja los campos técnicos de la OT — esquema,
  // observaciones, partidas/recepción de material CON FOTOS, despachos,
  // protocolos — así que era la ruta de guardado más expuesta a perder
  // una edición si la persona cerraba la pestaña, cambiaba de OT o se
  // cortaba la conexión antes de que pasaran esos 800ms. Ahora usa el
  // mismo patrón ya probado en cerrar/reabrir OT y agregar factura:
  // localStorage sincrónico + pushState() inmediato.
  // Vuelta atrás urgente (24-jul): escribirConReintento() hace un viaje
  // extra a Supabase (leer + escribir) por cada guardado, y con muchas
  // ediciones seguidas eso saturó la base de datos para toda la app. Se
  // vuelve al patrón liviano: localStorage sincrónico + pushState()
  // inmediato (que junta TODOS los cambios pendientes en una sola subida).
  const actualizar = (id, cambios) => {
    const nuevo = otsAll.map(o => o.id === id ? { ...o, ...cambios } : o)
    try { localStorage.setItem('serein_ots', JSON.stringify(nuevo)) } catch (e) {}
    setOts(nuevo)
    pushState()
  }
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
  // "Eliminar OT" ahora es un borrado SUAVE: la OT se marca eliminada (con
  // quien y cuando) y desaparece de todas las vistas, pero el dato no se
  // destruye — nada en el modulo tenia forma de saber quien borro algo ni
  // de recuperarlo si fue sin querer, y una empresa con protocolos de
  // calidad firmados no puede darse el lujo de perder ese rastro. No
  // cambia nada mas del comportamiento visible: para cualquier vista de
  // la app, una OT eliminada sigue sin aparecer en ningun lado.
  const eliminar = async id => {
    let quien = ''
    try { const { data } = await supabase.auth.getUser(); quien = (data && data.user && data.user.email) || '' } catch (e) {}
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_ots') || 'null') } catch (e) {}
    const base = Array.isArray(fresco) ? fresco : otsAll
    const nuevo = base.map(o => o.id === id ? { ...o, eliminada: true, eliminadaPor: quien, eliminadaFecha: new Date().toISOString() } : o)
    try { localStorage.setItem('serein_ots', JSON.stringify(nuevo)) } catch (e) {}
    setOts(nuevo)
    pushState()
  }

  // Agregar un ítem nuevo a un array de la OT (partidas/despachos: "Agregar
  // recepción"/"Agregar despacho") es distinto a editar un campo existente
  // — si dos personas agregan una entrega/recepción casi al mismo tiempo,
  // cada una parte de SU copia local del array (que puede no tener
  // todavía la del otro) y al guardar reemplaza el array completo: la
  // que se sube último "gana" y la otra desaparece sin aviso, aunque las
  // dos hayan llegado a subirse con éxito. Mismo patrón que ya usa
  // eliminar(): traer lo más fresco de la nube justo antes de agregar,
  // para achicar esa ventana de choque al mínimo.
  const agregarAArray = async (id, campo, item) => {
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_ots') || 'null') } catch (e) {}
    const base = Array.isArray(fresco) ? fresco : otsAll
    const nuevo = base.map(o => o.id === id ? { ...o, [campo]: [...(o[campo] || []), item] } : o)
    try { localStorage.setItem('serein_ots', JSON.stringify(nuevo)) } catch (e) {}
    setOts(nuevo)
    pushState()
  }

  // Los protocolos (PIG/PGP) se editan campo por campo mientras se llenan
  // (cada tecleo dispara un guardado) — con actualizar() normal, cada uno
  // de esos guardados parte de la copia local de otsAll, que puede no
  // traer todavía el protocolo recién creado si el push/pull anterior no
  // alcanzó a completarse. El siguiente guardado reemplaza el arreglo
  // completo de protocolos con esa copia vieja, y el protocolo recién
  // creado desaparece sin aviso — mismo problema que ya se resolvió para
  // eliminar()/agregarAArray(), aplicado acá también.
  const actualizarProtocolos = async (id, cambios) => {
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_ots') || 'null') } catch (e) {}
    const base = Array.isArray(fresco) ? fresco : otsAll
    const nuevo = base.map(o => o.id === id ? { ...o, protocolos: cambios.protocolos } : o)
    try { localStorage.setItem('serein_ots', JSON.stringify(nuevo)) } catch (e) {}
    setOts(nuevo)
    pushState()
  }

  // Checklist de marcas esperadas (subida por Excel) — mismo patron seguro
  // que actualizarProtocolos(): trae lo mas fresco antes de escribir, para
  // no pisar nada si dos personas marcan "recibida" casi al mismo tiempo.
  const actualizarMarcasEsperadas = async (id, marcasEsperadas) => {
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_ots') || 'null') } catch (e) {}
    const base = Array.isArray(fresco) ? fresco : otsAll
    const nuevo = base.map(o => o.id === id ? { ...o, marcasEsperadas } : o)
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
    if ([o.numero, o.cliente, o.oc, o.nv, o.cotizacion].some(v => _norm(v).includes(q))) return true
    // Tambien busca por pieza (marca/TAG, ID o referencia) — antes solo se
    // podia encontrar una OT por sus datos comerciales, y la pregunta mas
    // frecuente en planta ("¿donde esta la marca X?") obligaba a abrir OT
    // por OT para revisar el checklist.
    return (o.marcasEsperadas || []).some(m => [m.marca, m.idPieza, m.referencia].some(v => _norm(v).includes(q)))
  }
  const coincideFiltros = o => {
    if (fEstado && o.estado !== fEstado) return false
    if (fDesde && (!otFecha(o) || otFecha(o) < fDesde)) return false
    if (fHasta && (!otFecha(o) || otFecha(o) > fHasta)) return false
    if (vista === 'cerradas' && fFactura && estadoFacturacionDeOT(o) !== fFactura) return false
    if (vista === 'facturadas' && fFactura && estadoPagoOTDeOT(o) !== fFactura) return false
    return true
  }

  const delArea = ots.filter(o => o.area === areaSel && (!fCliente || _norm(o.cliente) === _norm(fCliente)))
  const activasArea = delArea.filter(o => o.estado !== 'Cerrada')
  // Una OT cerrada se queda en "OT Cerradas" mientras le falte algo por
  // facturar (sin facturar o parcialmente facturada) — recién pasa a "OT
  // Facturadas" cuando el saldo por facturar llega a $0. No se guarda en
  // ningún campo nuevo: se recalcula siempre desde ot.ventas, así que si
  // se borra la única factura la OT vuelve sola a Cerradas.
  const cerradasTodas = delArea.filter(o => o.estado === 'Cerrada')
  const cerradasArea = cerradasTodas.filter(o => estadoFacturacionDeOT(o) !== 'Totalmente facturada')
  const facturadasArea = cerradasTodas.filter(o => estadoFacturacionDeOT(o) === 'Totalmente facturada')
  const porVista = { activas: activasArea, cerradas: cerradasArea, facturadas: facturadasArea }[vista] || activasArea
  const visibles = porVista.filter(o => coincideBusqueda(o) && coincideFiltros(o))

  // Solo se considera el correlativo de OTs con el formato propio de este módulo (OT-AAAA-NNN).
  // Las OT creadas al aprobar una cotización usan 'OT-<folio>' (sin año) y no deben mezclarse con esta secuencia.
  const anioActual = new Date().getFullYear()
  const nums = ots.filter(o => /^OT-\d{4}-\d+$/.test(o.numero || '')).map(o => parseInt((o.numero.match(/(\d+)$/) || [0, 0])[1], 10))
  const siguiente = `OT-${anioActual}-${String(Math.max(100, ...nums) + 1).padStart(3, '0')}`

  const nOTs = { activas: activasArea.length }
  // "Venta en proceso": suma el saldo real de cada OT activa (monto
  // naranja si hay abonos, venta neta completa si no) — no la venta neta
  // completa siempre, que era el bug reportado (una OT con abonos ya
  // hechos no debe aportar el 100% de su venta al indicador de "lo que
  // falta por cerrar").
  const ventaEnProcesoDetalle = activasArea.map(o => ({ ot: o, ...saldoActivoDeOT(o) }))
  const ventaEnProceso = ventaEnProcesoDetalle.reduce((a, x) => a + x.monto, 0)
  const ventaTotalContratada = activasArea.reduce((a, o) => a + ventaNetaDeOT(o), 0)
  const cerradasPorFacturarMonto = cerradasArea.reduce((a, o) => a + saldoPorFacturarDeOT(o), 0)
  // "Facturado por percibir": de las OT ya totalmente facturadas, cuánto
  // de lo facturado sigue sin cobrarse. Las que ya están 100% pagadas
  // quedan en $0 y no suman acá, pero siguen visibles como historial en
  // "OT Facturadas".
  const facturadoPorPercibirCandidatas = facturadasArea.filter(o => saldoPorPercibirDeOT(o) > 0)
  const facturadoPorPercibirMonto = facturadoPorPercibirCandidatas.reduce((a, o) => a + saldoPorPercibirDeOT(o), 0)
  // "Cobrado del periodo": usa el mismo rango Ingreso desde/hasta que ya
  // existe como filtro (aplicado a la fecha del abono, no a la fecha de
  // ingreso de la OT) — sin fechas, es el histórico completo del área.
  const abonosPeriodo = delArea.flatMap(o => (o.abonos || []).map(ab => ({ ...ab, otNumero: o.numero })))
    .filter(ab => (!fDesde || (ab.fecha && ab.fecha !== '—' && ab.fecha >= fDesde)) && (!fHasta || (ab.fecha && ab.fecha !== '—' && ab.fecha <= fHasta)))
  const cobradoPeriodo = abonosPeriodo.reduce((a, ab) => a + (ab.monto || 0), 0)
  const [verDesgloseCobrado, setVerDesgloseCobrado] = useState(false)

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

      {/* KPIs del área — fuente única (ventaNetaDeOT/tieneFactura/saldoPorFacturarDeOT/
          saldoPorPercibirDeOT), clickeables: cada uno abre la pestaña que
          contiene exactamente las OT que componen su total. */}
      {verValores ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
          <KpiCardOT icon={FileText} iconBg={SEREIN.blueSoft} iconColor={SEREIN.blue} value={nOTs.activas} label="OT activas"
            explicacion="Cantidad de OT con estado operativo activo (no cerradas)." onClick={() => { setVista('activas'); setPage(1) }} />
          <KpiCardOT icon={CircleDollarSign} iconBg={SEREIN.orangeSoft} iconColor={SEREIN.orangeDark} value={clp(ventaEnProceso)}
            label={`Venta en proceso · ${activasArea.length} OT`} secundario={`Venta total contratada: ${clp(ventaTotalContratada)}`}
            advertencia={ventaEnProcesoDetalle.some(x => x.advertencia) ? `${ventaEnProcesoDetalle.filter(x => x.advertencia).length} OT sin monto de venta registrado` : null}
            explicacion="Por cada OT activa: si ya tiene abonos, se usa el saldo real (venta neta − abonado); si no tiene abonos, se usa la venta neta completa."
            onClick={() => { setVista('activas'); setPage(1) }} />
          <KpiCardOT icon={Receipt} iconBg={PILL_VARIANT.naranja.bg} iconColor={PILL_VARIANT.naranja.fg} value={clp(cerradasPorFacturarMonto)}
            label={`Cerradas por facturar · ${cerradasArea.length} OT`}
            explicacion="OT cerradas con saldo por facturar mayor a $0 (venta neta menos lo ya facturado con factura real)."
            onClick={() => { setVista('cerradas'); setPage(1) }} />
          <KpiCardOT icon={ShoppingCart} iconBg={SEREIN.greenSoft} iconColor={SEREIN.green} value={clp(facturadoPorPercibirMonto)}
            label={`Facturado por percibir · ${facturadoPorPercibirCandidatas.length} OT`}
            explicacion="De las OT totalmente facturadas, lo que el cliente todavía no pagó (total facturado menos abonos)."
            onClick={() => { setVista('facturadas'); setPage(1) }} />
          <KpiCardOT icon={CircleDollarSign} iconBg={SEREIN.greenSoft} iconColor={SEREIN.green} value={clp(cobradoPeriodo)}
            label={`Cobrado del periodo · ${abonosPeriodo.length} pagos`}
            explicacion="Suma de abonos/pagos registrados en el rango de fechas del filtro (o histórico completo si no hay fechas)."
            onClick={() => setVerDesgloseCobrado(v => !v)} />
        </div>
      ) : (
        <div style={{ marginBottom: 18 }}><KpiCardOT icon={FileText} value={nOTs.activas} label="OT activas" onClick={() => { setVista('activas'); setPage(1) }} /></div>
      )}
      {verDesgloseCobrado && verValores && (
        <div style={{ background: '#fff', border: '1px solid #DFE4EA', padding: 12, marginBottom: 14 }}>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Desglose de pagos del periodo ({abonosPeriodo.length})</div>
          {abonosPeriodo.length === 0 ? <div style={{ fontSize: 12.5, color: '#9AA3AD' }}>Sin pagos registrados en el rango seleccionado.</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ textAlign: 'left', color: '#9AA3AD' }}><th style={{ padding: '4px 6px' }}>OT</th><th style={{ padding: '4px 6px' }}>Fecha</th><th style={{ padding: '4px 6px' }}>Medio</th><th style={{ padding: '4px 6px', textAlign: 'right' }}>Monto</th></tr></thead>
              <tbody>{abonosPeriodo.map((ab, i) => (
                <tr key={i} style={{ borderTop: '1px solid #F2F4F7' }}>
                  <td style={{ padding: '4px 6px' }}>{ab.otNumero}</td><td style={{ padding: '4px 6px' }}>{ab.fecha}</td><td style={{ padding: '4px 6px' }}>{ab.medio || '—'}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>{clp(ab.monto || 0)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      <TabsBar tabs={[
        { key: 'activas', label: `OT activas (${activasArea.length})` },
        { key: 'cerradas', label: `OT cerradas (${cerradasArea.length})` },
        { key: 'facturadas', label: `OT facturadas (${facturadasArea.length})` },
      ]} active={vista} onChange={v => { setVista(v); setPage(1) }} />

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
            {(vista === 'activas' ? ['Cotizada', 'En ejecución', 'Terminada'] : ['Cerrada']).map(es => <option key={es} value={es}>{etiquetaEstado({ estado: es })}</option>)}
          </select>
        </label>
        {vista === 'cerradas' && (
          <label style={{ fontSize: 12, color: '#9AA3AD', display: 'flex', alignItems: 'center', gap: 6 }}>Facturación
            <select value={fFactura} onChange={e => { setFFactura(e.target.value); setPage(1) }} style={inp}>
              <option value="">Todas</option>
              <option value="Sin facturar">Sin facturar</option>
              <option value="Parcialmente facturada">Parcialmente facturada</option>
            </select>
          </label>
        )}
        {vista === 'facturadas' && (
          <label style={{ fontSize: 12, color: '#9AA3AD', display: 'flex', alignItems: 'center', gap: 6 }}>Estado de pago
            <select value={fFactura} onChange={e => { setFFactura(e.target.value); setPage(1) }} style={inp}>
              <option value="">Todos</option>
              <option value="Sin pago">Sin pago</option>
              <option value="Pago parcial">Pago parcial</option>
              <option value="Pagada">Pagada</option>
            </select>
          </label>
        )}
        <label style={{ fontSize: 11, color: '#9AA3AD' }}>Ingreso desde<input type="date" value={fDesde} onChange={e => { setFDesde(e.target.value); setPage(1) }} style={{ ...inp, display: 'block', marginTop: 3 }} /></label>
        <label style={{ fontSize: 11, color: '#9AA3AD' }}>hasta<input type="date" value={fHasta} onChange={e => { setFHasta(e.target.value); setPage(1) }} style={{ ...inp, display: 'block', marginTop: 3 }} /></label>
        <Btn variant="outline" icon={RotateCcw} onClick={() => { limpiarFiltros(); setPage(1) }}>Limpiar filtros</Btn>
        <Btn variant="dark" icon={Download} onClick={() => { setRep(v => !v); setRepCliente(fCliente) }}>Informe Excel</Btn>
        {verValores && (
          <Btn variant="outline" onClick={migrarFotosAStorage} disabled={migrando}>
            {migrando ? (migProgreso || 'Migrando...') : 'Optimizar fotos de OT (una vez)'}
          </Btn>
        )}
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

      {visibles.length === 0 && <div style={{ color: '#9AA3AD', fontSize: 14, padding: 20, textAlign: 'center', background: '#fff', border: '1px dashed #DFE4EA' }}>{{ activas: `Sin OT activas en ${areaSel} con estos filtros.`, cerradas: `Sin OT cerradas en ${areaSel} con estos filtros.`, facturadas: `Sin OT facturadas en ${areaSel} con estos filtros.` }[vista]}</div>}
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
                <TarjetaOT ot={so} onUpdate={actualizar} onUpdateProtocolos={actualizarProtocolos} onUpdateMarcasEsperadas={actualizarMarcasEsperadas} onDelete={id => { eliminar(id); setSel(null) }} onCambiarEstado={cambiarEstado} onAgregarVenta={agregarVenta} onEliminarVenta={eliminarVenta} onAgregarArray={agregarAArray} verValores={verValores} ordenesCompra={ordenesCompra} mo={mo} otsAll={otsAll} instrumentos={instrumentos} libroCompras={libroCompras} enModal />
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
