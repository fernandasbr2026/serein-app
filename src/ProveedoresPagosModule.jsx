import React, { useState, useMemo } from 'react'
import { Plus, Trash2, X, Truck, ReceiptText, CalendarClock, CalendarDays, TrendingUp, TrendingDown, FileText, BarChart3, Wallet, AlertTriangle, Search } from 'lucide-react'
import { OC_SEED } from './ordenes-compra-data.js'
import { ocTotal } from './OrdenesCompraModule.jsx'

// ============================================================
// MÓDULO: Proveedores, Pagos y Calendario de Flujo de Caja
// Solo Gerencia / Administración. Primera versión en memoria
// (mismo patrón que FinanzasModule): datos semilla + useState.
// La persistencia real en Supabase queda para una fase siguiente.
// ============================================================

const C = { naranja: '#FF6B00', carbon: '#0F1A2E', verde: '#12805C', rojo: '#D64545', gris: '#8A929E', azul: '#061A40' }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const hoy = () => new Date().toISOString().slice(0, 10)
const mesDe = f => (f || '').slice(0, 7)
const inp = { padding: '7px 9px', border: '1px solid #CBD2D6', fontSize: 13, boxSizing: 'border-box' }

const TIPOS_PROVEEDOR = ['Pintura', 'Granalla', 'EPP', 'Ferretería', 'Transporte', 'Arriendo de equipos', 'Mantención', 'Servicios externos', 'Combustible', 'Financiero', 'Otro']
const CONDICIONES_PAGO = ['Contado', '7 días', '15 días', '30 días', '45 días', '60 días', 'Otro']
const ESTADOS_PROV = ['Activo', 'Inactivo']
const AREAS = ['Santa Rosa', 'Istria', 'Producción / Planta', 'Proyectos', 'Administración', 'Comercial', 'Finanzas', 'General empresa']
const TIPOS_DOC = ['Factura', 'Boleta', 'Nota de débito', 'Orden de compra', 'Comprobante', 'Cuota', 'Otro']
const FORMAS_PAGO = ['Transferencia', 'Cheque', 'Tarjeta', 'Efectivo', 'Otro']
const ESTADOS_OC = ['Pendiente', 'Parcialmente pagada', 'Pagada', 'Vencida', 'Anulada']
const ESTADOS_PAGO_OC = ['Pendiente', 'Pagada', 'Cancelada', 'Vencida', 'Anulada']
const ESTADOS_COBRO = ['Pendiente', 'Pagada', 'Vencida', 'Factoring', 'Anulada']
// Una OC deja de estar por pagar cuando está Pagada, Cancelada o Anulada.
// ocTotal() (no o.monto) porque las OC creadas en OrdenesCompraModule vía
// items/neto nunca setean `monto` — leer o.monto directo las dejaba afuera
// del calendario de pagos y del flujo de caja sin ningún aviso.
const ocPorPagar = o => !['Pagada', 'Cancelada', 'Anulada'].includes(o.estadoPago) && ocTotal(o) > 0
const vencOC = o => o.vencimiento || (o.fecha ? sumarDias(o.fecha, parseInt(o.plazo, 10) || 0) : '')

// Días según condición de pago (para calcular vencimientos y fecha esperada)
const diasCond = c => ({ 'Contado': 0, '7 días': 7, '15 días': 15, '30 días': 30, '45 días': 45, '60 días': 60 }[c] ?? 0)
const sumarDias = (fecha, dias) => { const d = new Date(fecha + 'T12:00:00'); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10) }
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000)

// Cálculos de un documento por pagar (pagos parciales)
const pagadoDe = d => (d.pagos || []).reduce((a, p) => a + (p.monto || 0), 0)
const saldoDe = d => Math.max(0, (d.total || 0) - pagadoDe(d))
function estadoDoc(d) {
  if (d.anulado) return 'Anulado'
  const pagado = pagadoDe(d)
  if (pagado >= (d.total || 0) && d.total > 0) return 'Pagado'
  if (pagado > 0) return 'Parcial'
  if (d.fecha_vencimiento && d.fecha_vencimiento < hoy()) return 'Vencido'
  return 'Pendiente'
}
const colorEstado = e => ({ Pagado: C.verde, Parcial: C.naranja, Vencido: C.rojo, Pendiente: '#8C4519', Anulado: C.gris, Anulada: C.gris, Factoring: C.naranja, Pagada: C.verde, Cancelada: C.verde, Vencida: C.rojo }[e] || C.gris)
const fondoEstado = e => ({ Pagado: '#E7F2EA', Parcial: '#F9E9DE', Vencido: '#F6E0DA', Pendiente: '#F9E9DE', Anulado: '#EEE', Anulada: '#EEE', Factoring: '#F9E9DE', Pagada: '#E7F2EA', Cancelada: '#E7F2EA', Vencida: '#F6E0DA' }[e] || '#EEE')

// ============================================================
// DATOS DE PRUEBA (los que entregó Gerencia)
// ============================================================
export const PP_OCS_VER = 'oc-defontana-2026-07'
export const PP_SEED = {
  saldoInicial: 0,
  ocsVer: PP_OCS_VER,
  proveedores: [
    { id: 'pv1', nombre: 'Pinturas Industriales', rut: '', giro: 'Venta de pinturas', contacto: '', telefono: '', correo: '', direccion: '', tipo: 'Pintura', condicion: '30 días', estado: 'Activo', obs: '' },
    { id: 'pv2', nombre: 'Ferretería Central', rut: '', giro: 'Ferretería', contacto: '', telefono: '', correo: '', direccion: '', tipo: 'Ferretería', condicion: '15 días', estado: 'Activo', obs: '' },
    { id: 'pv3', nombre: 'Transporte Norte', rut: '', giro: 'Transporte de carga', contacto: '', telefono: '', correo: '', direccion: '', tipo: 'Transporte', condicion: '7 días', estado: 'Activo', obs: '' },
  ],
  ocs: OC_SEED,
  docs: [
    { id: 'd1', tipo_doc: 'Factura', numero: 'FP-001', proveedor: 'Pinturas Industriales', oc: '', fecha_emision: '2026-07-01', fecha_recepcion: '2026-07-01', fecha_vencimiento: '2026-07-31', neto: 1260504, iva: 239496, total: 1500000, area: 'Producción / Planta', ref_ot: '', forma_pago: 'Transferencia', pagos: [], anulado: false, obs: '' },
    { id: 'd2', tipo_doc: 'Factura', numero: 'FP-002', proveedor: 'Ferretería Central', oc: '', fecha_emision: '2026-07-05', fecha_recepcion: '2026-07-05', fecha_vencimiento: '2026-07-20', neto: 378151, iva: 71849, total: 450000, area: 'Santa Rosa', ref_ot: '', forma_pago: 'Transferencia', pagos: [], anulado: false, obs: '' },
    { id: 'd3', tipo_doc: 'Factura', numero: 'FP-003', proveedor: 'Transporte Norte', oc: '', fecha_emision: '2026-07-08', fecha_recepcion: '2026-07-08', fecha_vencimiento: '2026-07-15', neto: 252101, iva: 47899, total: 300000, area: 'Istria', ref_ot: '', forma_pago: 'Transferencia', pagos: [], anulado: false, obs: '' },
  ],
  cobros: [
    { id: 'c1', cliente: 'Howden', factura: '1650', oc_cliente: '', fecha_emision: '2026-07-01', condicion: '30 días', fecha_estimada: '2026-07-31', neto: 4369748, iva: 830252, total: 5200000, estado: 'Pendiente', fecha_real: '', obs: '' },
    { id: 'c2', cliente: 'TTM', factura: '1651', oc_cliente: '', fecha_emision: '2026-07-03', condicion: '45 días', fecha_estimada: '2026-08-17', neto: 7310924, iva: 1389076, total: 8700000, estado: 'Pendiente', fecha_real: '', obs: '' },
  ],
}

// ============================================================
// Componentes auxiliares de layout
// ============================================================
function Kpi({ label, valor, color, sub }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 14, flex: '1 1 165px', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 21, fontWeight: 600, color: color || C.carbon, whiteSpace: 'nowrap', marginTop: 4 }}>{valor}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.gris, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
function Caja({ children }) {
  return <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18, overflowX: 'auto' }}>{children}</div>
}
function BotonNuevo({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ background: C.naranja, color: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
      <Plus size={15} /> {children}
    </button>
  )
}

// ============================================================
// 1) PROVEEDORES (CRUD)
// ============================================================
function SeccionProveedores({ pp, setPp }) {
  const [creando, setCreando] = useState(false)
  const nuevo = () => ({ nombre: '', rut: '', giro: '', contacto: '', telefono: '', correo: '', direccion: '', tipo: TIPOS_PROVEEDOR[0], condicion: '30 días', estado: 'Activo', obs: '' })
  const [f, setF] = useState(nuevo())

  function guardar() {
    if (!f.nombre) return
    setPp({ ...pp, proveedores: [{ id: 'pv' + Date.now(), ...f }, ...pp.proveedores] })
    setF(nuevo()); setCreando(false)
  }
  function eliminar(id) {
    if (window.confirm('¿Eliminar este proveedor?')) setPp({ ...pp, proveedores: pp.proveedores.filter(p => p.id !== id) })
  }

  return (
    <div>
      {!creando && <BotonNuevo onClick={() => setCreando(true)}>Nuevo proveedor</BotonNuevo>}
      {creando && (
        <div style={{ background: '#fff', border: `2px solid ${C.naranja}`, padding: 16, marginBottom: 14 }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Nuevo proveedor</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
            <input style={inp} placeholder="Nombre proveedor *" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} />
            <input style={inp} placeholder="RUT" value={f.rut} onChange={e => setF({ ...f, rut: e.target.value })} />
            <input style={inp} placeholder="Giro" value={f.giro} onChange={e => setF({ ...f, giro: e.target.value })} />
            <input style={inp} placeholder="Contacto" value={f.contacto} onChange={e => setF({ ...f, contacto: e.target.value })} />
            <input style={inp} placeholder="Teléfono" value={f.telefono} onChange={e => setF({ ...f, telefono: e.target.value })} />
            <input style={inp} placeholder="Correo" value={f.correo} onChange={e => setF({ ...f, correo: e.target.value })} />
            <input style={inp} placeholder="Dirección" value={f.direccion} onChange={e => setF({ ...f, direccion: e.target.value })} />
            <select style={inp} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{TIPOS_PROVEEDOR.map(x => <option key={x}>{x}</option>)}</select>
            <select style={inp} value={f.condicion} onChange={e => setF({ ...f, condicion: e.target.value })}>{CONDICIONES_PAGO.map(x => <option key={x}>{x}</option>)}</select>
            <select style={inp} value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })}>{ESTADOS_PROV.map(x => <option key={x}>{x}</option>)}</select>
          </div>
          <input style={{ ...inp, width: '100%', marginTop: 8 }} placeholder="Observaciones" value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={guardar} disabled={!f.nombre} style={{ background: f.nombre ? C.verde : '#CBD2D6', color: '#fff', border: 'none', padding: '9px 18px', cursor: f.nombre ? 'pointer' : 'not-allowed', fontSize: 13 }}>Guardar proveedor</button>
            <button onClick={() => { setF(nuevo()); setCreando(false) }} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
          </div>
        </div>
      )}
      <Caja>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
            {['Proveedor', 'Tipo', 'Condición', 'Contacto', 'Teléfono', 'Estado', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {pp.proveedores.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #EEE9DF', opacity: p.estado === 'Inactivo' ? 0.5 : 1 }}>
                <td style={{ padding: 8, fontWeight: 500 }}>{p.nombre}{p.rut && <div style={{ fontSize: 11, color: C.gris }}>{p.rut}</div>}</td>
                <td style={{ padding: 8, color: C.gris }}>{p.tipo}</td>
                <td style={{ padding: 8 }}>{p.condicion}</td>
                <td style={{ padding: 8, color: C.gris }}>{p.contacto || '—'}</td>
                <td style={{ padding: 8, color: C.gris }}>{p.telefono || '—'}</td>
                <td style={{ padding: 8 }}><span style={{ background: p.estado === 'Activo' ? '#E7F2EA' : '#EEE', color: p.estado === 'Activo' ? C.verde : C.gris, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{p.estado}</span></td>
                <td style={{ padding: 8 }}><button onClick={() => eliminar(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button></td>
              </tr>
            ))}
            {pp.proveedores.length === 0 && <tr><td colSpan={7} style={{ padding: 16, textAlign: 'center', color: '#9AA0A6' }}>Sin proveedores.</td></tr>}
          </tbody>
        </table>
      </Caja>
    </div>
  )
}

// ============================================================
// 2) ÓRDENES DE COMPRA A PROVEEDOR
// ============================================================
function SeccionOC({ pp, setPp }) {
  const ocs = pp.ocs || []
  const setOcs = arr => setPp({ ...pp, ocs: arr })
  const [busca, setBusca] = useState('')
  const [fEst, setFEst] = useState('')
  const upd = (id, cambios) => setOcs(ocs.map(o => {
    if (o.id !== id) return o
    const n = { ...o, ...cambios }
    if (('fecha' in cambios || 'plazo' in cambios) && n.fecha) n.vencimiento = sumarDias(n.fecha, parseInt(n.plazo, 10) || 0)
    return n
  }))
  const agregar = () => setOcs([{ id: 'oc' + Date.now(), numero: '', proveedor: '', rut: '', fecha: hoy(), monto: 0, plazo: 30, vencimiento: sumarDias(hoy(), 30), estadoPago: 'Pendiente', estadoOC: '', obs: '' }, ...ocs])
  const eliminar = id => { if (window.confirm('¿Eliminar esta OC?')) setOcs(ocs.filter(o => o.id !== id)) }

  const mostradas = ocs.filter(o =>
    (!busca || (String(o.numero) + ' ' + (o.proveedor || '') + ' ' + (o.rut || '')).toLowerCase().includes(busca.toLowerCase())) &&
    (!fEst || o.estadoPago === fEst)
  )
  const totalTodas = mostradas.reduce((a, o) => a + ocTotal(o), 0)
  const totalPend = mostradas.filter(ocPorPagar).reduce((a, o) => a + ocTotal(o), 0)

  return (
    <div>
      <div style={{ fontSize: 12, color: '#8C4519', background: '#F9E9DE', padding: '8px 12px', marginBottom: 12 }}>
        Órdenes de compra a proveedores (importadas de Defontana). Todo es editable: fecha, monto, <b>plazo de crédito</b> (días) y <b>vencimiento</b> (se calcula solo = fecha + plazo). Las OC pendientes se suman al flujo de caja y a las cuentas por pagar del Consolidado.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={agregar} style={{ background: C.naranja, color: '#fff', border: 'none', padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={15} /> Agregar OC</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #CBD2D6', padding: '2px 6px' }}>
          <Search size={13} color={C.gris} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar N°/proveedor/RUT…" style={{ border: 'none', outline: 'none', fontSize: 12.5, width: 160 }} />
        </div>
        <select style={inp} value={fEst} onChange={e => setFEst(e.target.value)}><option value="">Todos los estados</option>{ESTADOS_PAGO_OC.map(x => <option key={x}>{x}</option>)}</select>
        <span style={{ fontSize: 12.5, color: C.gris }}>{mostradas.length} OC · Total {clp(totalTodas)} · <b style={{ color: C.rojo }}>Por pagar {clp(totalPend)}</b></span>
      </div>
      <Caja>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
            {['Nº OC', 'Proveedor', 'RUT', 'Fecha', 'Monto', 'Plazo (días)', 'Vencimiento', 'Estado de pago', ''].map(h => <th key={h} style={{ textAlign: h === 'Monto' ? 'right' : 'left', padding: '5px 6px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {mostradas.map(o => {
              const v = vencOC(o), vencido = ocPorPagar(o) && v && v < hoy()
              return (
                <tr key={o.id} style={{ borderBottom: '1px solid #EEE9DF', background: vencido ? '#FDF3F0' : 'transparent' }}>
                  <td style={{ padding: '4px 6px' }}><input value={o.numero} onChange={e => upd(o.id, { numero: e.target.value })} style={{ ...inp, width: 70, padding: '5px 7px', fontWeight: 600 }} /></td>
                  <td style={{ padding: '4px 6px' }}><input value={o.proveedor} onChange={e => upd(o.id, { proveedor: e.target.value })} style={{ ...inp, width: 200, padding: '5px 7px' }} /></td>
                  <td style={{ padding: '4px 6px' }}><input value={o.rut || ''} onChange={e => upd(o.id, { rut: e.target.value })} style={{ ...inp, width: 110, padding: '5px 7px' }} /></td>
                  <td style={{ padding: '4px 6px' }}><input type="date" value={o.fecha || ''} onChange={e => upd(o.id, { fecha: e.target.value })} style={{ ...inp, width: 140, padding: '5px 7px' }} /></td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}><input value={o.monto} onChange={e => upd(o.id, { monto: num(e.target.value) })} style={{ ...inp, width: 110, padding: '5px 7px', textAlign: 'right', fontWeight: 600 }} /></td>
                  <td style={{ padding: '4px 6px' }}><input value={o.plazo} onChange={e => upd(o.id, { plazo: num(e.target.value) })} style={{ ...inp, width: 70, padding: '5px 7px', textAlign: 'right' }} /></td>
                  <td style={{ padding: '4px 6px' }}><input type="date" value={v} onChange={e => upd(o.id, { vencimiento: e.target.value })} style={{ ...inp, width: 140, padding: '5px 7px', color: vencido ? C.rojo : C.carbon }} /></td>
                  <td style={{ padding: '4px 6px' }}>
                    <select value={o.estadoPago} onChange={e => upd(o.id, { estadoPago: e.target.value })} style={{ border: 'none', background: fondoEstado(o.estadoPago), color: colorEstado(o.estadoPago), padding: '4px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {ESTADOS_PAGO_OC.map(x => <option key={x}>{x}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '4px 4px', textAlign: 'right' }}><button onClick={() => eliminar(o.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button></td>
                </tr>
              )
            })}
            {mostradas.length === 0 && <tr><td colSpan={9} style={{ padding: 16, textAlign: 'center', color: '#9AA0A6' }}>Sin órdenes de compra.</td></tr>}
          </tbody>
        </table>
      </Caja>
    </div>
  )
}

// ============================================================
// 3) DOCUMENTOS POR PAGAR (con pagos parciales)
// ============================================================
function SeccionPorPagar({ pp, setPp }) {
  const [creando, setCreando] = useState(false)
  const [abierto, setAbierto] = useState(null)
  const nuevo = () => ({ tipo_doc: 'Factura', numero: '', proveedor: pp.proveedores[0]?.nombre || '', fecha_emision: hoy(), fecha_recepcion: hoy(), condicion: '30 días', fecha_vencimiento: sumarDias(hoy(), 30), neto: '', conIva: true, area: AREAS[0], ref_ot: '', forma_pago: 'Transferencia', obs: '' })
  const [f, setF] = useState(nuevo())

  function guardar() {
    if (!f.numero || num(f.neto) <= 0 || !f.fecha_vencimiento) return
    const neto = num(f.neto), iva = f.conIva ? Math.round(neto * 0.19) : 0
    const d = { id: 'd' + Date.now(), tipo_doc: f.tipo_doc, numero: f.numero, proveedor: f.proveedor, oc: '', fecha_emision: f.fecha_emision, fecha_recepcion: f.fecha_recepcion, fecha_vencimiento: f.fecha_vencimiento, neto, iva, total: neto + iva, area: f.area, ref_ot: f.ref_ot, forma_pago: f.forma_pago, pagos: [], anulado: false, obs: f.obs }
    setPp({ ...pp, docs: [d, ...pp.docs] })
    setF(nuevo()); setCreando(false)
  }
  const actualizar = (id, cambios) => setPp({ ...pp, docs: pp.docs.map(d => d.id === id ? { ...d, ...cambios } : d) })

  return (
    <div>
      {!creando && <BotonNuevo onClick={() => setCreando(true)}>Nuevo documento por pagar</BotonNuevo>}
      {creando && (
        <div style={{ background: '#fff', border: `2px solid ${C.naranja}`, padding: 16, marginBottom: 14 }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Nuevo documento por pagar</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
            <select style={inp} value={f.tipo_doc} onChange={e => setF({ ...f, tipo_doc: e.target.value })}>{TIPOS_DOC.map(x => <option key={x}>{x}</option>)}</select>
            <input style={inp} placeholder="Nº documento *" value={f.numero} onChange={e => setF({ ...f, numero: e.target.value })} />
            <select style={inp} value={f.proveedor} onChange={e => setF({ ...f, proveedor: e.target.value })}>{pp.proveedores.map(p => <option key={p.id}>{p.nombre}</option>)}</select>
            <label style={{ fontSize: 12, color: C.gris }}>Emisión<input type="date" style={{ ...inp, width: '100%' }} value={f.fecha_emision} onChange={e => setF({ ...f, fecha_emision: e.target.value })} /></label>
            <label style={{ fontSize: 12, color: C.gris }}>Recepción<input type="date" style={{ ...inp, width: '100%' }} value={f.fecha_recepcion} onChange={e => setF({ ...f, fecha_recepcion: e.target.value })} /></label>
            <select style={inp} value={f.condicion} onChange={e => { const c = e.target.value; setF({ ...f, condicion: c, fecha_vencimiento: sumarDias(f.fecha_emision, diasCond(c)) }) }}>{CONDICIONES_PAGO.map(x => <option key={x}>{x}</option>)}</select>
            <label style={{ fontSize: 12, color: C.rojo, fontWeight: 600 }}>Vencimiento *<input type="date" style={{ ...inp, width: '100%' }} value={f.fecha_vencimiento} onChange={e => setF({ ...f, fecha_vencimiento: e.target.value })} /></label>
            <input style={inp} placeholder="Monto neto CLP *" value={f.neto} onChange={e => setF({ ...f, neto: e.target.value })} />
            <label style={{ ...inp, display: 'flex', alignItems: 'center', gap: 6, border: 'none' }}><input type="checkbox" checked={f.conIva} onChange={e => setF({ ...f, conIva: e.target.checked })} /> Aplica IVA 19%</label>
            <select style={inp} value={f.area} onChange={e => setF({ ...f, area: e.target.value })}>{AREAS.map(a => <option key={a}>{a}</option>)}</select>
            <input style={inp} placeholder="OT/OC/proyecto asociado" value={f.ref_ot} onChange={e => setF({ ...f, ref_ot: e.target.value })} />
            <select style={inp} value={f.forma_pago} onChange={e => setF({ ...f, forma_pago: e.target.value })}>{FORMAS_PAGO.map(x => <option key={x}>{x}</option>)}</select>
          </div>
          <input style={{ ...inp, width: '100%', marginTop: 8 }} placeholder="Observaciones" value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} />
          {num(f.neto) > 0 && <div style={{ fontSize: 12, color: C.gris, marginTop: 6 }}>Total: {clp(num(f.neto) * (f.conIva ? 1.19 : 1))}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={guardar} disabled={!f.numero || num(f.neto) <= 0 || !f.fecha_vencimiento} style={{ background: (f.numero && num(f.neto) > 0 && f.fecha_vencimiento) ? C.verde : '#CBD2D6', color: '#fff', border: 'none', padding: '9px 18px', cursor: 'pointer', fontSize: 13 }}>Guardar documento</button>
            <button onClick={() => { setF(nuevo()); setCreando(false) }} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
          </div>
        </div>
      )}
      <Caja>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
            {['Documento', 'Proveedor', 'Vence', 'Total', 'Pagado', 'Saldo', 'Estado', ''].map(h => <th key={h} style={{ textAlign: ['Total', 'Pagado', 'Saldo'].includes(h) ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {pp.docs.map(d => {
              const est = estadoDoc(d), saldo = saldoDe(d), pagado = pagadoDe(d)
              const vencido = est === 'Vencido'
              return (
                <React.Fragment key={d.id}>
                  <tr style={{ borderBottom: '1px solid #EEE9DF', background: vencido ? '#FDF3F0' : 'transparent', opacity: d.anulado ? 0.45 : 1 }}>
                    <td style={{ padding: 8, fontWeight: 500 }}>{d.tipo_doc} {d.numero}{d.ref_ot && <div style={{ fontSize: 11, color: C.naranja }}>{d.ref_ot}</div>}<div style={{ fontSize: 11, color: C.gris }}>{d.area}</div></td>
                    <td style={{ padding: 8 }}>{d.proveedor}</td>
                    <td style={{ padding: 8, color: vencido ? C.rojo : C.gris, whiteSpace: 'nowrap' }}>{d.fecha_vencimiento}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{clp(d.total)}</td>
                    <td style={{ padding: 8, textAlign: 'right', color: C.verde }}>{clp(pagado)}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 600, color: saldo > 0 ? C.naranja : C.verde }}>{clp(saldo)}</td>
                    <td style={{ padding: 8 }}><span style={{ background: fondoEstado(est), color: colorEstado(est), padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{est}</span></td>
                    <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                      <button onClick={() => setAbierto(abierto === d.id ? null : d.id)} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '4px 8px', cursor: 'pointer', fontSize: 12, marginRight: 4 }}>Pagos</button>
                      <button title={d.anulado ? 'Reactivar' : 'Anular'} onClick={() => actualizar(d.id, { anulado: !d.anulado })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gris }}><X size={15} /></button>
                      <button title="Eliminar" onClick={() => window.confirm('¿Eliminar documento?') && setPp({ ...pp, docs: pp.docs.filter(x => x.id !== d.id) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                  {abierto === d.id && <tr><td colSpan={8} style={{ padding: 0 }}><PagosDoc doc={d} actualizar={actualizar} /></td></tr>}
                </React.Fragment>
              )
            })}
            {pp.docs.length === 0 && <tr><td colSpan={8} style={{ padding: 16, textAlign: 'center', color: '#9AA0A6' }}>Sin documentos por pagar.</td></tr>}
          </tbody>
        </table>
      </Caja>
    </div>
  )
}

// Historial y registro de pagos parciales de un documento
function PagosDoc({ doc, actualizar }) {
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [forma, setForma] = useState('Transferencia')
  const saldo = saldoDe(doc)

  function registrar() {
    const m = num(monto)
    if (m <= 0) return
    const pagos = [...(doc.pagos || []), { id: 'p' + Date.now(), fecha, monto: Math.min(m, saldo), forma, obs: '' }]
    actualizar(doc.id, { pagos })
    setMonto('')
  }

  return (
    <div style={{ background: '#FAF7F3', padding: 16, borderBottom: '1px solid #EEE9DF' }}>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 12 }}>Total: <b>{clp(doc.total)}</b></span>
        <span style={{ fontSize: 12 }}>Pagado: <b style={{ color: C.verde }}>{clp(pagadoDe(doc))}</b></span>
        <span style={{ fontSize: 12 }}>Saldo pendiente: <b style={{ color: C.naranja }}>{clp(saldo)}</b></span>
      </div>
      {(doc.pagos || []).length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginBottom: 10 }}>
          <thead><tr style={{ borderBottom: '1px solid #CBD2D6' }}>{['Fecha', 'Monto', 'Forma', ''].map(h => <th key={h} style={{ textAlign: h === 'Monto' ? 'right' : 'left', padding: '4px 6px', fontSize: 11, color: C.gris }}>{h}</th>)}</tr></thead>
          <tbody>
            {doc.pagos.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
                <td style={{ padding: '4px 6px' }}>{p.fecha}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>{clp(p.monto)}</td>
                <td style={{ padding: '4px 6px', color: C.gris }}>{p.forma}</td>
                <td style={{ padding: '4px 6px' }}><button onClick={() => actualizar(doc.id, { pagos: doc.pagos.filter(x => x.id !== p.id) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={12} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {saldo > 0 && !doc.anulado && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" style={inp} value={fecha} onChange={e => setFecha(e.target.value)} />
          <input style={{ ...inp, width: 140 }} placeholder="Monto del pago" value={monto} onChange={e => setMonto(e.target.value)} />
          <select style={inp} value={forma} onChange={e => setForma(e.target.value)}>{FORMAS_PAGO.map(x => <option key={x}>{x}</option>)}</select>
          <button onClick={registrar} disabled={num(monto) <= 0} style={{ background: num(monto) > 0 ? C.verde : '#CBD2D6', color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5 }}>Registrar pago</button>
          <button onClick={() => { setMonto(String(saldo)) }} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5 }}>Pagar saldo completo</button>
        </div>
      )}
      {saldo <= 0 && <div style={{ color: C.verde, fontSize: 13 }}>✓ Documento pagado completamente.</div>}
    </div>
  )
}

// ============================================================
// 4) CALENDARIO DE PAGOS (agrupado por fecha, con filtros)
// ============================================================
function SeccionCalendarioPagos({ pp }) {
  const [rango, setRango] = useState('mes')
  const [fArea, setFArea] = useState('')
  const [fProv, setFProv] = useState('')

  const items = useMemo(() => {
    const h = hoy()
    return pp.docs.filter(d => !d.anulado && saldoDe(d) > 0).filter(d => {
      if (fArea && d.area !== fArea) return false
      if (fProv && d.proveedor !== fProv) return false
      const v = d.fecha_vencimiento
      if (rango === 'vencidos') return v < h
      if (rango === 'semana') return v >= h && v <= sumarDias(h, 7)
      if (rango === 'mes') return mesDe(v) === mesDe(h)
      if (rango === 'proximos') return v >= h && v <= sumarDias(h, 3)
      return true
    }).sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
  }, [pp.docs, rango, fArea, fProv])

  const porFecha = useMemo(() => {
    const g = {}
    items.forEach(d => { (g[d.fecha_vencimiento] = g[d.fecha_vencimiento] || []).push(d) })
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  const totalRango = items.reduce((a, d) => a + saldoDe(d), 0)
  const btn = (id, lbl) => <button key={id} onClick={() => setRango(id)} style={{ background: rango === id ? C.carbon : '#fff', color: rango === id ? '#fff' : C.carbon, border: '1px solid #CBD2D6', padding: '6px 12px', cursor: 'pointer', fontSize: 12.5 }}>{lbl}</button>

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {btn('todos', 'Todos')}{btn('mes', 'Este mes')}{btn('semana', 'Próx. 7 días')}{btn('proximos', 'Próx. 3 días')}{btn('vencidos', 'Vencidos')}
        <select style={inp} value={fArea} onChange={e => setFArea(e.target.value)}><option value="">Todas las áreas</option>{AREAS.map(a => <option key={a}>{a}</option>)}</select>
        <select style={inp} value={fProv} onChange={e => setFProv(e.target.value)}><option value="">Todos los proveedores</option>{pp.proveedores.map(p => <option key={p.id}>{p.nombre}</option>)}</select>
      </div>
      <div style={{ background: '#161616', color: '#fff', padding: '12px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 13 }}>Total a pagar en el rango</span>
        <span style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 600, color: C.naranja }}>{clp(totalRango)}</span>
      </div>
      {porFecha.length === 0 ? <Caja><div style={{ color: '#9AA0A6', fontSize: 13 }}>Sin pagos en este rango.</div></Caja> : porFecha.map(([fecha, docs]) => {
        const totalDia = docs.reduce((a, d) => a + saldoDe(d), 0)
        const vencido = fecha < hoy()
        return (
          <div key={fecha} style={{ background: '#fff', border: '1px solid #E2DED4', borderLeft: `4px solid ${vencido ? C.rojo : C.naranja}`, marginBottom: 10 }}>
            <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #EEE9DF', flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontWeight: 600 }}>{fecha} {vencido && <span style={{ color: C.rojo, fontSize: 12 }}>· VENCIDO</span>}</span>
              <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, color: C.naranja }}>{clp(totalDia)}</span>
            </div>
            <div style={{ padding: '6px 16px 10px' }}>
              {docs.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: '1px solid #F4F0E9' }}>
                  <span>{d.proveedor} <span style={{ color: C.gris, fontSize: 12 }}>· {d.tipo_doc} {d.numero} · {d.area}</span></span>
                  <span style={{ fontWeight: 600 }}>{clp(saldoDe(d))}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// 5) COBROS ESPERADOS DE CLIENTES
// ============================================================
function SeccionCobros({ pp, setPp }) {
  const [creando, setCreando] = useState(false)
  const nuevo = () => ({ cliente: '', factura: '', oc_cliente: '', fecha_emision: hoy(), condicion: '30 días', fecha_estimada: sumarDias(hoy(), 30), neto: '', conIva: true, estado: 'Pendiente', obs: '' })
  const [f, setF] = useState(nuevo())

  function guardar() {
    if (!f.cliente || num(f.neto) <= 0) return
    const neto = num(f.neto), iva = f.conIva ? Math.round(neto * 0.19) : 0
    setPp({ ...pp, cobros: [{ id: 'c' + Date.now(), ...f, neto, iva, total: neto + iva, fecha_real: '' }, ...pp.cobros] })
    setF(nuevo()); setCreando(false)
  }
  const actualizar = (id, cambios) => setPp({ ...pp, cobros: pp.cobros.map(c => c.id === id ? { ...c, ...cambios } : c) })

  return (
    <div>
      <div style={{ fontSize: 12, color: '#2F5E3D', background: '#E7F2EA', padding: '8px 12px', marginBottom: 12 }}>
        Ingresos esperados de clientes (plata que <b>entra</b>). En una fase futura se conectarán automáticamente con las facturas de venta.
      </div>
      {!creando && <BotonNuevo onClick={() => setCreando(true)}>Nuevo cobro esperado</BotonNuevo>}
      {creando && (
        <div style={{ background: '#fff', border: `2px solid ${C.verde}`, padding: 16, marginBottom: 14 }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Nuevo cobro esperado</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
            <input style={inp} placeholder="Cliente *" value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} />
            <input style={inp} placeholder="Nº factura" value={f.factura} onChange={e => setF({ ...f, factura: e.target.value })} />
            <input style={inp} placeholder="OC cliente" value={f.oc_cliente} onChange={e => setF({ ...f, oc_cliente: e.target.value })} />
            <label style={{ fontSize: 12, color: C.gris }}>Emisión<input type="date" style={{ ...inp, width: '100%' }} value={f.fecha_emision} onChange={e => setF({ ...f, fecha_emision: e.target.value })} /></label>
            <select style={inp} value={f.condicion} onChange={e => { const c = e.target.value; setF({ ...f, condicion: c, fecha_estimada: sumarDias(f.fecha_emision, diasCond(c)) }) }}>{CONDICIONES_PAGO.map(x => <option key={x}>{x}</option>)}</select>
            <label style={{ fontSize: 12, color: C.gris }}>Fecha esperada de pago<input type="date" style={{ ...inp, width: '100%' }} value={f.fecha_estimada} onChange={e => setF({ ...f, fecha_estimada: e.target.value })} /></label>
            <input style={inp} placeholder="Monto neto CLP *" value={f.neto} onChange={e => setF({ ...f, neto: e.target.value })} />
            <label style={{ ...inp, display: 'flex', alignItems: 'center', gap: 6, border: 'none' }}><input type="checkbox" checked={f.conIva} onChange={e => setF({ ...f, conIva: e.target.checked })} /> Aplica IVA 19%</label>
            <select style={inp} value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })}>{ESTADOS_COBRO.map(x => <option key={x}>{x}</option>)}</select>
          </div>
          {num(f.neto) > 0 && <div style={{ fontSize: 12, color: C.gris, marginTop: 6 }}>Total: {clp(num(f.neto) * (f.conIva ? 1.19 : 1))}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={guardar} disabled={!f.cliente || num(f.neto) <= 0} style={{ background: (f.cliente && num(f.neto) > 0) ? C.verde : '#CBD2D6', color: '#fff', border: 'none', padding: '9px 18px', cursor: 'pointer', fontSize: 13 }}>Guardar cobro</button>
            <button onClick={() => { setF(nuevo()); setCreando(false) }} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
          </div>
        </div>
      )}
      <Caja>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
            {['Cliente', 'Factura', 'Emisión', 'Esperada', 'Total', 'Estado', ''].map(h => <th key={h} style={{ textAlign: ['Total'].includes(h) ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {pp.cobros.map(c => {
              const atrasado = c.estado === 'Pendiente' && c.fecha_estimada < hoy()
              const estMostrar = atrasado ? 'Vencida' : c.estado
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid #EEE9DF', background: atrasado ? '#FDF3F0' : 'transparent' }}>
                  <td style={{ padding: 8, fontWeight: 500 }}>{c.cliente}</td>
                  <td style={{ padding: 8, color: C.gris }}>{c.factura || '—'}</td>
                  <td style={{ padding: 8, color: C.gris }}>{c.fecha_emision}</td>
                  <td style={{ padding: 8, color: atrasado ? C.rojo : C.gris }}>{c.fecha_estimada}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{clp(c.total)}</td>
                  <td style={{ padding: 8 }}>
                    <select value={c.estado} onChange={e => actualizar(c.id, { estado: e.target.value, fecha_real: e.target.value === 'Pagada' ? hoy() : c.fecha_real })} style={{ border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '3px 6px', background: fondoEstado(estMostrar), color: colorEstado(estMostrar) }}>
                      {ESTADOS_COBRO.map(x => <option key={x}>{x}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: 8 }}><button onClick={() => window.confirm('¿Eliminar cobro?') && setPp({ ...pp, cobros: pp.cobros.filter(x => x.id !== c.id) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button></td>
                </tr>
              )
            })}
            {pp.cobros.length === 0 && <tr><td colSpan={7} style={{ padding: 16, textAlign: 'center', color: '#9AA0A6' }}>Sin cobros esperados.</td></tr>}
          </tbody>
        </table>
      </Caja>
    </div>
  )
}

// ============================================================
// 6) FLUJO DE CAJA PROYECTADO (día / semana / mes)
// ============================================================
export function calcularFlujo(pp, mes) {
  const salidas = [
    ...pp.docs.filter(d => !d.anulado && saldoDe(d) > 0 && mesDe(d.fecha_vencimiento) === mes).map(d => ({ fecha: d.fecha_vencimiento, monto: saldoDe(d) })),
    ...(pp.ocs || []).filter(ocPorPagar).filter(o => mesDe(vencOC(o)) === mes).map(o => ({ fecha: vencOC(o), monto: ocTotal(o) })),
  ]
  const entradas = pp.cobros.filter(c => c.estado !== 'Anulada' && c.estado !== 'Pagada' && mesDe(c.fecha_estimada) === mes)
    .map(c => ({ fecha: c.fecha_estimada, monto: c.total }))
  const totalSalidas = salidas.reduce((a, x) => a + x.monto, 0)
  const totalEntradas = entradas.reduce((a, x) => a + x.monto, 0)
  return { salidas, entradas, totalSalidas, totalEntradas, neto: totalEntradas - totalSalidas }
}

function SeccionFlujo({ pp, setPp }) {
  const [mes, setMes] = useState(hoy().slice(0, 7))
  const r = useMemo(() => calcularFlujo(pp, mes), [pp, mes])

  // Agrupar por día combinando entradas/salidas
  const dias = useMemo(() => {
    const g = {}
    r.salidas.forEach(s => { g[s.fecha] = g[s.fecha] || { fecha: s.fecha, ent: 0, sal: 0 }; g[s.fecha].sal += s.monto })
    r.entradas.forEach(e => { g[e.fecha] = g[e.fecha] || { fecha: e.fecha, ent: 0, sal: 0 }; g[e.fecha].ent += e.monto })
    let acum = pp.saldoInicial || 0
    return Object.values(g).sort((a, b) => a.fecha.localeCompare(b.fecha)).map(d => { acum += d.ent - d.sal; return { ...d, neto: d.ent - d.sal, acum } })
  }, [r, pp.saldoInicial])

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)} style={inp} />
        <label style={{ fontSize: 12, color: C.gris, display: 'flex', alignItems: 'center', gap: 6 }}>Saldo inicial de caja:
          <input style={{ ...inp, width: 150 }} value={pp.saldoInicial || 0} onChange={e => setPp({ ...pp, saldoInicial: num(e.target.value) })} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Kpi label="Entradas esperadas" valor={clp(r.totalEntradas)} color={C.verde} />
        <Kpi label="Salidas esperadas" valor={clp(r.totalSalidas)} color={C.rojo} />
        <Kpi label="Flujo proyectado del mes" valor={clp(r.neto)} color={r.neto >= 0 ? C.verde : C.rojo} sub={r.neto >= 0 ? 'Positivo' : 'Negativo'} />
        <Kpi label="Saldo proyectado fin de mes" valor={clp((pp.saldoInicial || 0) + r.neto)} color={C.carbon} />
      </div>
      <Caja>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
            {['Fecha', 'Entradas', 'Salidas', 'Flujo del día', 'Saldo acumulado'].map(h => <th key={h} style={{ textAlign: h === 'Fecha' ? 'left' : 'right', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {dias.map(d => (
              <tr key={d.fecha} style={{ borderBottom: '1px solid #EEE9DF' }}>
                <td style={{ padding: 8, fontWeight: 500 }}>{d.fecha}</td>
                <td style={{ padding: 8, textAlign: 'right', color: d.ent ? C.verde : '#CBD2D6' }}>{d.ent ? clp(d.ent) : '—'}</td>
                <td style={{ padding: 8, textAlign: 'right', color: d.sal ? C.rojo : '#CBD2D6' }}>{d.sal ? clp(d.sal) : '—'}</td>
                <td style={{ padding: 8, textAlign: 'right', fontWeight: 600, color: d.neto >= 0 ? C.verde : C.rojo }}>{clp(d.neto)}</td>
                <td style={{ padding: 8, textAlign: 'right', fontWeight: 600, color: d.acum >= 0 ? C.carbon : C.rojo }}>{clp(d.acum)}</td>
              </tr>
            ))}
            {dias.length === 0 && <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#9AA0A6' }}>Sin movimientos proyectados este mes.</td></tr>}
          </tbody>
        </table>
      </Caja>
      <div style={{ fontSize: 12, color: C.gris, marginTop: 10 }}>
        Nota: por ahora el flujo considera los documentos por pagar y los cobros esperados de este módulo. En una fase siguiente se sumarán automáticamente gastos fijos, créditos y leasing del módulo Finanzas.
      </div>
    </div>
  )
}

// ============================================================
// 7) REPORTES
// ============================================================
function SeccionReportes({ pp }) {
  const h = hoy(), mes = mesDe(h)
  const docsAbiertos = pp.docs.filter(d => !d.anulado && saldoDe(d) > 0)
  const porProveedor = useMemo(() => {
    const g = {}
    docsAbiertos.forEach(d => { g[d.proveedor] = (g[d.proveedor] || 0) + saldoDe(d) })
    return Object.entries(g).sort((a, b) => b[1] - a[1])
  }, [pp.docs])
  const vencidos = docsAbiertos.filter(d => d.fecha_vencimiento < h)
  const totalPorPagarMes = docsAbiertos.filter(d => mesDe(d.fecha_vencimiento) === mes).reduce((a, d) => a + saldoDe(d), 0)
  const cobrosAbiertos = pp.cobros.filter(c => c.estado === 'Pendiente' || c.estado === 'Factoring')
  const cobrosVencidos = cobrosAbiertos.filter(c => c.fecha_estimada < h)
  const totalPorCobrarMes = cobrosAbiertos.filter(c => mesDe(c.fecha_estimada) === mes).reduce((a, c) => a + c.total, 0)
  const totalPorPagar = docsAbiertos.reduce((a, d) => a + saldoDe(d), 0)
  const totalPorCobrar = cobrosAbiertos.reduce((a, c) => a + c.total, 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Kpi label="Total por pagar" valor={clp(totalPorPagar)} color={C.rojo} sub={`${docsAbiertos.length} documentos`} />
        <Kpi label="Total por cobrar" valor={clp(totalPorCobrar)} color={C.verde} sub={`${cobrosAbiertos.length} facturas`} />
        <Kpi label="Diferencia (cobros − pagos)" valor={clp(totalPorCobrar - totalPorPagar)} color={(totalPorCobrar - totalPorPagar) >= 0 ? C.verde : C.rojo} />
        <Kpi label="Pagos vencidos" valor={clp(vencidos.reduce((a, d) => a + saldoDe(d), 0))} color={C.rojo} sub={`${vencidos.length} documentos`} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <Caja>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Pagos pendientes por proveedor</div>
          {porProveedor.length === 0 ? <div style={{ color: '#9AA0A6', fontSize: 13 }}>Sin pagos pendientes.</div> : porProveedor.map(([prov, monto]) => {
            const max = porProveedor[0][1]
            return (
              <div key={prov} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 13, width: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prov}</span>
                <div style={{ flex: 1, height: 8, background: '#EEE9DF' }}><div style={{ width: `${(monto / max) * 100}%`, height: '100%', background: C.naranja }} /></div>
                <span style={{ fontSize: 13, width: 110, textAlign: 'right', fontWeight: 600 }}>{clp(monto)}</span>
              </div>
            )
          })}
        </Caja>
        <Caja>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Resumen del mes</div>
          {[['Total por pagar este mes', clp(totalPorPagarMes), C.rojo], ['Total por cobrar este mes', clp(totalPorCobrarMes), C.verde], ['Pagos vencidos', `${vencidos.length} · ${clp(vencidos.reduce((a, d) => a + saldoDe(d), 0))}`, C.rojo], ['Cobros vencidos', `${cobrosVencidos.length} · ${clp(cobrosVencidos.reduce((a, c) => a + c.total, 0))}`, C.rojo], ['Diferencia proyectada del mes', clp(totalPorCobrarMes - totalPorPagarMes), (totalPorCobrarMes - totalPorPagarMes) >= 0 ? C.verde : C.rojo]].map(([l, v, col]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #EEE9DF', fontSize: 13 }}>
              <span style={{ color: C.gris }}>{l}</span><span style={{ fontWeight: 600, color: col }}>{v}</span>
            </div>
          ))}
        </Caja>
      </div>
    </div>
  )
}

// ============================================================
// RESUMEN (tablero del módulo) — cálculo reutilizable
// ============================================================
export function calcularResumenPP(pp) {
  const h = hoy(), mes = mesDe(h)
  const docsAbiertos = pp.docs.filter(d => !d.anulado && saldoDe(d) > 0)
  const pagos = [
    ...docsAbiertos.map(d => ({ venc: d.fecha_vencimiento, monto: saldoDe(d) })),
    ...(pp.ocs || []).filter(ocPorPagar).map(o => ({ venc: vencOC(o), monto: ocTotal(o) })),
  ]
  const cobrosAbiertos = pp.cobros.filter(c => c.estado === 'Pendiente' || c.estado === 'Factoring')
  const pagosHoy = pagos.filter(p => p.venc === h).reduce((a, p) => a + p.monto, 0)
  const pagos7 = pagos.filter(p => p.venc >= h && p.venc <= sumarDias(h, 7)).reduce((a, p) => a + p.monto, 0)
  const pagosVencidos = pagos.filter(p => p.venc && p.venc < h).reduce((a, p) => a + p.monto, 0)
  const pagosMes = pagos.filter(p => mesDe(p.venc) === mes).reduce((a, p) => a + p.monto, 0)
  const cobrosHoy = cobrosAbiertos.filter(c => c.fecha_estimada === h).reduce((a, c) => a + c.total, 0)
  const cobros7 = cobrosAbiertos.filter(c => c.fecha_estimada >= h && c.fecha_estimada <= sumarDias(h, 7)).reduce((a, c) => a + c.total, 0)
  const cobrosVencidos = cobrosAbiertos.filter(c => c.fecha_estimada < h).reduce((a, c) => a + c.total, 0)
  const cobrosMes = cobrosAbiertos.filter(c => mesDe(c.fecha_estimada) === mes).reduce((a, c) => a + c.total, 0)
  return { pagosHoy, pagos7, pagosVencidos, pagosMes, cobrosHoy, cobros7, cobrosVencidos, cobrosMes, flujoMes: cobrosMes - pagosMes }
}

function SeccionResumen({ pp }) {
  const r = calcularResumenPP(pp)
  const alertas = []
  if (r.pagosVencidos > 0) alertas.push({ txt: `Tienes ${clp(r.pagosVencidos)} en pagos VENCIDOS.`, col: C.rojo })
  if (r.pagos7 > 0) alertas.push({ txt: `Tienes ${clp(r.pagos7)} en pagos que vencen en los próximos 7 días.`, col: C.naranja })
  if (r.cobrosVencidos > 0) alertas.push({ txt: `Tienes ${clp(r.cobrosVencidos)} en cobros atrasados de clientes.`, col: C.rojo })
  return (
    <div>
      {alertas.map((a, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderLeft: `4px solid ${a.col}`, border: '1px solid #E2DED4', padding: '10px 14px', marginBottom: 8, fontSize: 13 }}>
          <AlertTriangle size={16} color={a.col} /> <span><b>Atención:</b> {a.txt}</span>
        </div>
      ))}
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 13, textTransform: 'uppercase', color: C.rojo, margin: '14px 0 8px' }}>Pagos a proveedores (salidas)</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <Kpi label="Pagos hoy" valor={clp(r.pagosHoy)} color={C.rojo} />
        <Kpi label="Próximos 7 días" valor={clp(r.pagos7)} color={C.naranja} />
        <Kpi label="Vencidos" valor={clp(r.pagosVencidos)} color={C.rojo} />
        <Kpi label="Total por pagar este mes" valor={clp(r.pagosMes)} color={C.carbon} />
      </div>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 13, textTransform: 'uppercase', color: C.verde, margin: '14px 0 8px' }}>Cobros de clientes (entradas)</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <Kpi label="Cobros hoy" valor={clp(r.cobrosHoy)} color={C.verde} />
        <Kpi label="Próximos 7 días" valor={clp(r.cobros7)} color={C.verde} />
        <Kpi label="Vencidos" valor={clp(r.cobrosVencidos)} color={C.rojo} />
        <Kpi label="Total por cobrar este mes" valor={clp(r.cobrosMes)} color={C.carbon} />
      </div>
      <div style={{ background: '#161616', color: '#fff', padding: '16px 20px', marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: 0.5 }}>Flujo proyectado del mes (cobros − pagos)</span>
        <span style={{ fontFamily: "'Oswald',sans-serif", fontSize: 26, fontWeight: 600, color: r.flujoMes >= 0 ? '#6FD08C' : '#E8836F' }}>{clp(r.flujoMes)} {r.flujoMes >= 0 ? '▲' : '▼'}</span>
      </div>
    </div>
  )
}

// ============================================================
// MÓDULO PRINCIPAL
// ============================================================
export default function ProveedoresPagosModule({ pp: ppExt, setPp: setPpExt, gastos = [] }) {
  const [ppInt, setPpInt] = useState(PP_SEED)
  const pp = ppExt ?? ppInt
  const setPp = setPpExt ?? setPpInt

  const tabs = [
    { id: 'resumen', label: 'Resumen y flujo', icono: <BarChart3 size={13} /> },
    { id: 'porpagar', label: 'Por pagar', icono: <ReceiptText size={13} /> },
    { id: 'calpagos', label: 'Calendario de pagos', icono: <CalendarClock size={13} /> },
    { id: 'cobros', label: 'Cobros esperados', icono: <Wallet size={13} /> },
    { id: 'flujo', label: 'Flujo de caja', icono: <CalendarDays size={13} /> },
    { id: 'reportes', label: 'Reportes', icono: <TrendingUp size={13} /> },
  ]
  const [tab, setTab] = useState('resumen')

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ background: tab === t.id ? C.carbon : '#fff', color: tab === t.id ? '#fff' : C.carbon, border: '1px solid #CBD2D6', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontFamily: "'Oswald',sans-serif", fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, display: 'flex', alignItems: 'center', gap: 6 }}>
            {t.icono}{t.label}
          </button>
        ))}
      </div>
      {(() => {
        const hoyStr = hoy();
        const en7 = sumarDias(hoyStr, 7);
        const pend = (gastos || []).filter(g => g.tipo === 'fijo' && g.estado !== 'Pagada' && g.estado !== 'Anulado');
        if (!pend.length) return null;
        const hayVencido = pend.some(g => g.vencimiento && g.vencimiento < hoyStr);
        return (<div style={{ background: '#fff', border: '1px solid #E2DED4', borderTop: '3px solid ' + (hayVencido ? '#DC2626' : '#FF6B00'), marginBottom: 16, padding: 14 }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 8 }}>Gastos fijos por pagar ({pend.length})</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}><tbody>
          {pend.slice().sort((a, b) => (a.vencimiento || '').localeCompare(b.vencimiento || '')).map((g, i) => {
            const venc = g.vencimiento || '';
            const vencido = venc && venc < hoyStr;
            const proximo = venc && !vencido && venc <= en7;
            const color = vencido ? '#DC2626' : proximo ? '#FF6B00' : '#7A8288';
            return (<tr key={i} style={{ borderBottom: '1px solid #EEE7DF' }}>
              <td style={{ padding: '6px 8px', fontWeight: 600 }}>{g.nombre}</td>
              <td style={{ padding: '6px 8px', color: '#7A8288' }}>{g.proveedor || '-'}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{clp(g.neto || 0)}</td>
              <td style={{ padding: '6px 8px', color: color, fontWeight: (vencido || proximo) ? 700 : 400, whiteSpace: 'nowrap' }}>{venc || '-'}{vencido ? ' - VENCIDO' : proximo ? ' - vence pronto' : ''}</td>
            </tr>);
          })}
          </tbody></table>
        </div>);
      })()}
      {tab === 'resumen' && <SeccionResumen pp={pp} />}
      {tab === 'porpagar' && <SeccionPorPagar pp={pp} setPp={setPp} />}
      {tab === 'calpagos' && <SeccionCalendarioPagos pp={pp} />}
      {tab === 'cobros' && <SeccionCobros pp={pp} setPp={setPp} />}
      {tab === 'flujo' && <SeccionFlujo pp={pp} setPp={setPp} />}
      {tab === 'reportes' && <SeccionReportes pp={pp} />}
    </div>
  )
}
