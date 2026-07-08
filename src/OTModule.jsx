import React, { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2, X, Ruler, Paintbrush, FileText, Receipt, ShoppingCart, CircleDollarSign, Download, Camera } from 'lucide-react'
import * as XLSX from 'xlsx'
import { descargarOTDesdeOT } from './CotizacionesModule.jsx'
import { costoOCdeOT } from './OrdenesCompraModule.jsx'
import { costoMOdeOT } from './ManoObraModule.jsx'
import Paginador, { paginar } from './Paginador.jsx'

const C = { azul: '#1D1D1B', teal: '#A8501F', ambar: '#D2642F', rojo: '#B5432E', verde: '#3D7A4E', carbon: '#161616', gris: '#7A8288' }
const clp = n => '$' + Math.round(n).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const inp = { padding: '7px 9px', border: '1px solid #CBD2D6', fontSize: 13, boxSizing: 'border-box' }
const btnMini = { background: 'none', border: 'none', cursor: 'pointer', color: C.rojo, padding: 4 }

const CATEGORIAS_COSTO = ['Materiales', 'Mano de obra', 'Gastos asociados', 'Arriendo equipos', 'Factoring', 'Transporte', 'Otros']
const ESTADOS_OT = ['Cotizada', 'En ejecución', 'Terminada', 'Facturada', 'Cerrada']
const PREPARACIONES = ['SSPC-SP1 Limpieza solvente', 'SSPC-SP2/SP3 Manual/Mecánica', 'SSPC-SP6 Comercial', 'SSPC-SP10 Casi blanco', 'SSPC-SP5 Metal blanco', 'Hidrolavado', 'Otra']

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
    <div style={{ height: alto, background: '#EEE9DF', width: '100%' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, transition: 'width .3s' }} />
    </div>
  )
}

function ChipEstado({ estado }) {
  const map = {
    'Cotizada': ['#EEF1F4', '#5A6B77'], 'En ejecución': ['#F9E9DE', C.ambar],
    'Terminada': ['#E7EEF2', C.azul], 'Facturada': ['#E7F2EA', C.verde], 'Cerrada': ['#E9E7F2', '#5B4E8C'],
  }
  const [bg, fg] = map[estado] || ['#EEE', '#666']
  return <span style={{ background: bg, color: fg, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{estado}</span>
}

// ---------- Formularios inline ----------
function FormVenta({ onAdd, onCancel }) {
  const [f, setF] = useState({ folio: '', fecha: '', neta: '', estadoPago: 'Pendiente' })
  const iva = Math.round(num(f.neta) * 0.19)
  return (
    <div style={{ background: '#F7F4EE', padding: 10, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...inp, width: 100 }} placeholder="Folio fact." value={f.folio} onChange={e => setF({ ...f, folio: e.target.value })} />
        <input style={{ ...inp, width: 130 }} type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} />
        <input style={{ ...inp, width: 140 }} placeholder="Venta neta CLP" value={f.neta} onChange={e => setF({ ...f, neta: e.target.value })} />
        <select style={inp} value={f.estadoPago} onChange={e => setF({ ...f, estadoPago: e.target.value })}>
          <option>Pendiente</option><option>Pagado</option><option>Factoring</option>
        </select>
        <button onClick={() => num(f.neta) > 0 && onAdd({ folio: f.folio || 's/f', fecha: f.fecha || '—', neta: num(f.neta), estadoPago: f.estadoPago })}
          style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar</button>
        <button onClick={onCancel} style={{ ...btnMini, color: '#7A8288' }}><X size={16} /></button>
      </div>
      {num(f.neta) > 0 && <div style={{ fontSize: 12, color: '#7A8288', marginTop: 6 }}>IVA 19%: {clp(iva)} · Total factura: {clp(num(f.neta) + iva)}</div>}
    </div>
  )
}

function FormCosto({ onAdd, onCancel }) {
  const [f, setF] = useState({ categoria: 'Materiales', detalle: '', monto: '' })
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', background: '#F7F4EE', padding: 10, marginTop: 8, alignItems: 'center' }}>
      <select style={inp} value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })}>
        {CATEGORIAS_COSTO.map(c => <option key={c}>{c}</option>)}
      </select>
      <input style={{ ...inp, flex: '1 1 160px' }} placeholder="Detalle (proveedor, concepto…)" value={f.detalle} onChange={e => setF({ ...f, detalle: e.target.value })} />
      <input style={{ ...inp, width: 140 }} placeholder="Monto neto CLP" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} />
      <button onClick={() => num(f.monto) > 0 && onAdd({ categoria: f.categoria, detalle: f.detalle, monto: num(f.monto) })}
        style={{ background: C.teal, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar</button>
      <button onClick={onCancel} style={{ ...btnMini, color: '#7A8288' }}><X size={16} /></button>
    </div>
  )
}

// ---------- Tarjeta OT ----------
const ETIQUETAS_FOTO = ['Recepción', 'Proceso', 'Despacho', 'Otro']

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
        <select value={etiqueta} onChange={e => setEtiqueta(e.target.value)} style={{ padding: '6px 9px', border: '1px solid #CBD2D6', fontSize: 12 }}>
          {ETIQUETAS_FOTO.map(t => <option key={t}>{t}</option>)}
        </select>
        <label style={{ background: C.carbon, color: '#fff', padding: '7px 14px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Camera size={13} /> Subir foto(s)
          <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={subir} />
        </label>
        <span style={{ fontSize: 11, color: '#9AA0A6' }}>Ej: camión al recibir, avance del proceso, despacho.</span>
      </div>
      {fotos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {fotos.map(f => (
            <div key={f.id} style={{ width: 110 }}>
              <img src={f.url} alt={f.etiqueta} onClick={() => setAmpliada(f)}
                style={{ width: 110, height: 82, objectFit: 'cover', cursor: 'pointer', border: '1px solid #E2DED4', display: 'block' }} />
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
  const ventaTotal = ot.ventas.reduce((a, v) => a + v.neta, 0)
  const costoTotal = ot.costos.reduce((a, c) => a + c.monto, 0)
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
    ...ot.ventas.map(v => [v.folio, v.fecha, v.neta, Math.round(v.neta * 0.19), Math.round(v.neta * 1.19), v.estadoPago || v.estado_pago || '—']),
  ]), 'Ventas')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Categoría', 'Detalle', 'Fecha', 'Monto'],
    ...ot.costos.map(x => [x.categoria, x.detalle || '—', x.fecha || '—', x.monto]),
  ]), 'Costos')
  XLSX.writeFile(wb, `${ot.numero}.xlsx`)
}

function TarjetaOT({ ot, onUpdate, onDelete, verValores = true, ordenesCompra = [], mo = null, otsAll = [], instrumentos = null }) {
  const [abierta, setAbierta] = useState(false)
  const [addVenta, setAddVenta] = useState(false)
  const [addCosto, setAddCosto] = useState(false)

  const ventaTotal = ot.ventas.reduce((a, v) => a + v.neta, 0)
  const costoOC = costoOCdeOT(ordenesCompra, ot.numero)
  const costoMO = costoMOdeOT(mo, ot.numero)
  const costoTotal = ot.costos.reduce((a, c) => a + c.monto, 0) + costoOC + costoMO
  const utilidad = ventaTotal - costoTotal
  const margen = ventaTotal > 0 ? (utilidad / ventaTotal) * 100 : 0
  const precioM2 = ot.m2 > 0 && ventaTotal > 0 ? ventaTotal / ot.m2 : null
  const costoM2 = ot.m2 > 0 && costoTotal > 0 ? costoTotal / ot.m2 : null

  const porCat = CATEGORIAS_COSTO.map(cat => ({ cat, monto: ot.costos.filter(c => c.categoria === cat).reduce((a, c) => a + c.monto, 0) })).filter(x => x.monto > 0)

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', marginBottom: 14 }}>
      {/* Cabecera */}
      <div onClick={() => setAbierta(!abierta)} style={{ padding: '15px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 14, background: C.carbon, color: '#fff', padding: '3px 9px' }}>{ot.numero}</span>
            <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15 }}>{ot.cliente}</span>
            <ChipEstado estado={ot.estado} />
          </div>
          <div style={{ fontSize: 12, color: '#7A8288', marginTop: 5, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span><FileText size={11} style={{ verticalAlign: -1 }} /> <b style={{ color: '#A8501F' }}>NV: {ot.nv || '\u2014'}</b> · {ot.cotizacion}{ot.oc && ot.oc !== '—' ? ' · Aprob. cliente ' + ot.oc : ''}</span>
            {ot.m2 > 0 && <span><Ruler size={11} style={{ verticalAlign: -1 }} /> {ot.m2} m²</span>}
            <span><Paintbrush size={11} style={{ verticalAlign: -1 }} /> {ot.esquema}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {verValores && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>Utilidad real</div>
              <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 17, color: margen >= 30 ? C.verde : margen >= 15 ? C.ambar : C.rojo }}>
                {clp(utilidad)} <span style={{ fontSize: 13 }}>({margen.toFixed(0)}%)</span>
              </div>
            </div>
          )}
          {abierta ? <ChevronUp size={18} color="#7A8288" /> : <ChevronDown size={18} color="#7A8288" />}
        </div>
      </div>

      {/* Barra venta vs costo (solo con permiso de valores) */}
      {verValores && (
        <div style={{ padding: '0 18px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#7A8288', marginBottom: 4 }}>
            <span>Venta {clp(ventaTotal)}</span>
            <span>Costos {clp(costoTotal)}</span>
          </div>
          <Barra pct={ventaTotal > 0 ? (costoTotal / ventaTotal) * 100 : 0} color={margen >= 30 ? C.teal : margen >= 15 ? C.ambar : C.rojo} />
          {(precioM2 || costoM2) && (
            <div style={{ fontSize: 12, color: '#7A8288', marginTop: 4 }}>
              {precioM2 && <>Venta: <b>{clp(precioM2)}/m²</b></>}{precioM2 && costoM2 && ' · '}
              {costoM2 && <>Costo: <b>{clp(costoM2)}/m²</b></>}
            </div>
          )}
        </div>
      )}
      {!verValores && <div style={{ padding: '0 18px 14px' }}><span style={{ fontSize: 11.5, color: '#9AA0A6', fontStyle: 'italic' }}>Vista de taller · valores visibles solo para Gerencia.</span></div>}

      {abierta && (
        <div style={{ borderTop: '1px solid #EEE9DF', padding: 18 }}>
          {/* Datos técnicos editables */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 18 }}>
            <label style={{ fontSize: 12, color: '#7A8288' }}>Estado OT
              <select value={ot.estado} onChange={e => onUpdate(ot.id, { estado: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }}>
                {ESTADOS_OT.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: '#7A8288' }}>Metros cuadrados
              <input type="number" value={ot.m2} onChange={e => onUpdate(ot.id, { m2: Math.max(0, +e.target.value) })} style={{ ...inp, width: '100%', marginTop: 4 }} />
            </label>
            {verValores && (
              <label style={{ fontSize: 12, color: '#7A8288' }}>Monto cotizado (CLP)
                <input value={ot.montoCotizado || ''} onChange={e => onUpdate(ot.id, { montoCotizado: num(e.target.value) })} style={{ ...inp, width: '100%', marginTop: 4 }} />
              </label>
            )}
            <label style={{ fontSize: 12, color: '#7A8288' }}>Preparación superficial
              <select value={ot.preparacion} onChange={e => onUpdate(ot.id, { preparacion: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }}>
                {PREPARACIONES.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>

          {/* Esquema de pintura y servicios (visible para todos) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: '#7A8288' }}>Esquema de pintura
              <textarea value={ot.esquema === '—' ? '' : (ot.esquema || '')} onChange={e => onUpdate(ot.id, { esquema: e.target.value })} placeholder="Detalle del esquema: preparación, capas, productos, espesores (µm)…" style={{ ...inp, width: '100%', marginTop: 4, minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }} />
            </label>
            <label style={{ fontSize: 12, color: '#7A8288' }}>Servicios necesarios / observaciones
              <textarea value={ot.servicios || ''} onChange={e => onUpdate(ot.id, { servicios: e.target.value })} placeholder="Servicios adicionales, requerimientos y notas para el taller…" style={{ ...inp, width: '100%', marginTop: 4, minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }} />
            </label>
          </div>

          {/* PARTIDAS / ENTREGAS DE MATERIAL (visible para todos) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 8px' }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#7A8288' }}>Partidas / entregas de material</span>
            <button onClick={() => onUpdate(ot.id, { partidas: [...(ot.partidas || []), { id: 'pa' + Date.now(), detalle: '', fecha: '', estado: 'Pendiente' }] })} style={{ background: C.teal, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Agregar partida</button>
          </div>
          {(ot.partidas || []).length === 0 ? (
            <div style={{ fontSize: 13, color: '#9AA0A6', marginBottom: 10 }}>Sin partidas. Indica en cuántas entregas llegará el material.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 10 }}>
              <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['N°', 'Detalle del material', 'Fecha estimada', 'Estado', ''].map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>
                {(ot.partidas || []).map((p, i) => (
                  <tr key={p.id || i} style={{ borderBottom: '1px solid #EEE9DF' }}>
                    <td style={{ padding: '4px 8px', fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ padding: '4px 8px' }}><input value={p.detalle} onChange={e => onUpdate(ot.id, { partidas: ot.partidas.map((x, j) => j === i ? { ...x, detalle: e.target.value } : x) })} placeholder="Ej: 16 barandas / 33 soportes" style={{ ...inp, width: '100%', padding: '5px 7px' }} /></td>
                    <td style={{ padding: '4px 8px' }}><input type="date" value={p.fecha} onChange={e => onUpdate(ot.id, { partidas: ot.partidas.map((x, j) => j === i ? { ...x, fecha: e.target.value } : x) })} style={{ ...inp, width: 140, padding: '5px 7px' }} /></td>
                    <td style={{ padding: '4px 8px' }}><select value={p.estado} onChange={e => onUpdate(ot.id, { partidas: ot.partidas.map((x, j) => j === i ? { ...x, estado: e.target.value } : x) })} style={{ border: 'none', background: p.estado === 'Recibida' ? '#E7F2EA' : '#F9E9DE', color: p.estado === 'Recibida' ? C.verde : '#8C4519', padding: '3px 8px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><option>Pendiente</option><option>Recibida</option></select></td>
                    <td style={{ padding: '4px 4px', textAlign: 'right' }}><button onClick={() => onUpdate(ot.id, { partidas: ot.partidas.filter((_, j) => j !== i) })} style={btnMini}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {verValores && (
            <>
              {/* VENTAS */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#7A8288', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Receipt size={13} /> Ventas facturadas
                </span>
                <button onClick={() => setAddVenta(true)} style={{ background: C.azul, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Plus size={13} /> Agregar venta
                </button>
              </div>
              {ot.ventas.length === 0 ? (
                <div style={{ fontSize: 13, color: '#9AA0A6' }}>Aún sin facturar.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                      {['Folio', 'Fecha', 'Neta', 'IVA', 'Total', 'Pago', ''].map((h, i) => (
                        <th key={i} style={{ textAlign: ['Neta', 'IVA', 'Total'].includes(h) ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ot.ventas.map((v, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #EEE9DF' }}>
                        <td style={{ padding: '7px 8px', fontWeight: 500 }}>{v.folio}</td>
                        <td style={{ padding: '7px 8px', color: '#7A8288' }}>{v.fecha}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right' }}>{clp(v.neta)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#7A8288' }}>{clp(v.neta * 0.19)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 500 }}>{clp(v.neta * 1.19)}</td>
                        <td style={{ padding: '7px 8px' }}>
                          <select value={v.estadoPago}
                            onChange={ev => onUpdate(ot.id, { ventas: ot.ventas.map((x, j) => j === i ? { ...x, estadoPago: ev.target.value } : x) })}
                            style={{ border: 'none', background: v.estadoPago === 'Pagado' ? '#E7F2EA' : v.estadoPago === 'Factoring' ? '#F9E9DE' : '#F6E0DA', color: v.estadoPago === 'Pagado' ? C.verde : v.estadoPago === 'Factoring' ? C.ambar : C.rojo, padding: '3px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            <option>Pendiente</option><option>Pagado</option><option>Factoring</option>
                          </select>
                        </td>
                        <td style={{ padding: '7px 4px', textAlign: 'right' }}>
                          <button onClick={() => window.confirm(`¿Eliminar factura ${v.folio} (${clp(v.neta)})?`) && onUpdate(ot.id, { ventas: ot.ventas.filter((_, j) => j !== i) })} style={btnMini}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {addVenta && <FormVenta onAdd={v => { onUpdate(ot.id, { ventas: [...ot.ventas, v] }); setAddVenta(false) }} onCancel={() => setAddVenta(false)} />}

              {/* COSTOS */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '18px 0 8px' }}>
                <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: '#7A8288', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <ShoppingCart size={13} /> Compras y costos de la OT
                </span>
                <button onClick={() => setAddCosto(true)} style={{ background: C.teal, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Plus size={13} /> Agregar costo
                </button>
              </div>
              {ot.costos.length === 0 ? (
                <div style={{ fontSize: 13, color: '#9AA0A6' }}>Sin costos registrados — la utilidad mostrada es bruta.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                      {['Categoría', 'Detalle', 'Monto', ''].map((h, i) => (
                        <th key={i} style={{ textAlign: h === 'Monto' ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ot.costos.map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #EEE9DF' }}>
                        <td style={{ padding: '7px 8px', fontWeight: 500 }}>{c.categoria}</td>
                        <td style={{ padding: '7px 8px', color: '#7A8288' }}>{c.detalle || '—'}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right' }}>{clp(c.monto)}</td>
                        <td style={{ padding: '7px 4px', textAlign: 'right' }}>
                          <button onClick={() => window.confirm(`¿Eliminar costo ${c.categoria} (${clp(c.monto)})?`) && onUpdate(ot.id, { costos: ot.costos.filter((_, j) => j !== i) })} style={btnMini}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {addCosto && <FormCosto onAdd={c => { onUpdate(ot.id, { costos: [...ot.costos, c] }); setAddCosto(false) }} onCancel={() => setAddCosto(false)} />}

              {porCat.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase', marginBottom: 6 }}>Estructura de costos</div>
                  {porCat.map(x => (
                    <div key={x.cat} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, width: 130, color: C.carbon }}>{x.cat}</span>
                      <div style={{ flex: 1 }}><Barra pct={(x.monto / costoTotal) * 100} color={C.teal} alto={6} /></div>
                      <span style={{ fontSize: 12, color: '#7A8288', width: 90, textAlign: 'right' }}>{clp(x.monto)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 16, padding: '12px 14px', background: '#F7F4EE', fontSize: 13, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                <CircleDollarSign size={16} color={margen >= 30 ? C.verde : C.ambar} />
                <span>Venta neta: <b>{clp(ventaTotal)}</b></span>
                <span>Costos: <b>{clp(costoTotal)}</b></span>{costoMO > 0 && <span style={{ color: '#7A8288' }}>(incluye {clp(costoMO)} de mano de obra)</span>}
                {costoOC > 0 && <span style={{ color: C.teal }}>(incluye {clp(costoOC)} de OC proveedores)</span>}
                <span>Utilidad real: <b style={{ color: margen >= 30 ? C.verde : margen >= 15 ? C.ambar : C.rojo }}>{clp(utilidad)} ({margen.toFixed(1)}%)</b></span>
              </div>
            </>
          )}

          <div style={{ marginTop: 14, borderTop: '1px dashed #CBD2D6', paddingTop: 12 }}>
            <div style={{ fontFamily: "\u0027Oswald\u0027,sans-serif", fontWeight: 600, fontSize: 13, textTransform: 'uppercase', marginBottom: 8 }}>Datos del encargo</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8 }}>
              <div><div style={{ fontSize: 11, color: '#7A8288', marginBottom: 2 }}>Nombre encargo</div><input style={{ padding: '6px 8px', border: '1px solid #CBD2D6', fontSize: 12.5, width: '100%', boxSizing: 'border-box' }} value={ot.nombreEncargo || ''} onChange={e => onUpdate(ot.id, { nombreEncargo: e.target.value })} /></div>
              <div><div style={{ fontSize: 11, color: '#7A8288', marginBottom: 2 }}>Correo</div><input style={{ padding: '6px 8px', border: '1px solid #CBD2D6', fontSize: 12.5, width: '100%', boxSizing: 'border-box' }} value={ot.correo || ''} onChange={e => onUpdate(ot.id, { correo: e.target.value })} /></div>
              <div><div style={{ fontSize: 11, color: '#7A8288', marginBottom: 2 }}>Telefono</div><input style={{ padding: '6px 8px', border: '1px solid #CBD2D6', fontSize: 12.5, width: '100%', boxSizing: 'border-box' }} value={ot.telefono || ''} onChange={e => onUpdate(ot.id, { telefono: e.target.value })} /></div>
              <div><div style={{ fontSize: 11, color: '#7A8288', marginBottom: 2 }}>NV (Nota de Venta)</div><input style={{ padding: '6px 8px', border: '1px solid #CBD2D6', fontSize: 12.5, width: '100%', boxSizing: 'border-box' }} value={ot.nv || ''} onChange={e => onUpdate(ot.id, { nv: e.target.value })} /></div>
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
function FormOT({ area, siguienteNumero, onAdd, onCancel }) {
  const [f, setF] = useState({ cliente: '', cotizacion: '', oc: '', m2: '', montoCotizado: '', preparacion: PREPARACIONES[2], esquema: '', nombreEncargo: '', correo: '', telefono: '', nv: '' })
  return (
    <div style={{ background: '#fff', border: `2px solid ${C.azul}`, padding: 16, marginBottom: 14 }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>
        Nueva OT · {area} <span style={{ fontFamily: "'JetBrains Mono',monospace", background: C.carbon, color: '#fff', padding: '2px 8px', marginLeft: 8 }}>{siguienteNumero}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        <input style={inp} placeholder="Cliente *" value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} />
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
        <button onClick={onCancel} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
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
const autoFila = (vals, lo, hi) => { const n = vals.length; const idxE = []; const entered = []; vals.forEach((v, i) => { if (v === '' || v == null) idxE.push(i); else { const nn = parseFloat(String(v).replace(',', '.')); if (!isNaN(nn)) entered.push(nn) } }); if (idxE.length === 0) return vals.slice(); const desired = lo + Math.random() * ((hi - lo) + 0.6); const sumE = entered.reduce((a, b) => a + b, 0); const meanEmpty = (desired * n - sumE) / idxE.length; const res = vals.slice(); idxE.forEach(i => { let val = meanEmpty + (Math.random() * 1.6 - 0.7); val = Math.max(lo - 1, Math.min(hi + 1.8, val)); res[i] = (Math.round(val * 100) / 100).toFixed(2) }); return res }
const FOTO_W = 800, FOTO_H = 600
const imgToData = (file, cb) => { const r = new FileReader(); r.onload = e => { const img = new Image(); img.onload = () => { var max = 1200; var w = img.width, h = img.height; if (w > h && w > max) { h = Math.round(h * max / w); w = max } else if (h >= w && h > max) { w = Math.round(w * max / h); h = max } const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); cb(cv.toDataURL('image/jpeg', 0.78)) }; img.src = e.target.result }; r.readAsDataURL(file) }
const nuevaCapa = nombre => ({ id: 'cap' + Date.now() + Math.floor(Math.random() * 999), nombre: nombre || 'Capa', producto: 'REZINC', solicitado: '2 a 3 Mils', filas: [['', '', '', '', '', '', ''], ['', '', '', '', '', '', ''], ['', '', '', '', '', '', ''], ['', '', '', '', '', '', ''], ['', '', '', '', '', '', '']], fotos: [] })
function nuevoProtocolo(tipo, ot, correlativo, instrumentos) {
  const cod = correlativo + '-' + new Date().getFullYear(); const h = new Date().toISOString().slice(0, 10)
  const base = { id: 'pr' + Date.now() + Math.floor(Math.random() * 999), tipo, correlativo, codigo: tipo + ' ' + cod, pgpCodigo: 'PGP ' + cod, docNro: tipo === 'PIG' ? 'RC-GP-1' : 'RC-PG-6', ot: ot.numero || '', oc: ot.oc || '', nv: ot.nv || '', cliente: ot.cliente || '', proyecto: '', preparadoPor: 'Boris Gomez', revisadoPor: 'Luis Soto', aprobadoPor: 'Luis Soto', fecha: h, firmas: [{ rol: 'Aprobado', quien: 'Tecnico Pintura', fecha: '' }, { rol: 'Recepcionado', quien: 'Cliente', fecha: '' }, { rol: 'Aprobado', quien: 'Inspector Cliente', fecha: '' }] }
  if (tipo === 'PIG') { return Object.assign(base, { descripcion: 'Proceso de inicio de granallado para pintura.', checks: [{ nombre: 'Control aire presurizado norma ASTM D4285', cumple: 'SI', obs: 'Sin presencia de humedad u otros contaminantes.', fotos: [] }, { nombre: 'Verificacion limpieza de granalla ASTM D7393', cumple: 'SI', obs: 'Sin presencia de sales, aceites u otros contaminantes.', fotos: [] }, { nombre: 'Inspeccion visual pieza granallada', cumple: 'SI', obs: '', fotos: [] }, { nombre: 'Medicion perfil de rugosidad norma ASTM D4417', cumple: 'SI', obs: '', fotos: [] }], limpiezaSSPC: 'SP10', perfilSolicitado: '1 a 3 mils', medidas: ['', '', ''], perfilObtenido: '', perfilCumple: 'SI', amb: { fecha: h, humedad: '', tAmbiente: '', tPieza: '', ptoRocio: '', horaInicio: '' }, fotosGranalla: [] }) }
  const instr = instrumentos ? { espMarca: instrumentos.espMarca || 'ELCOMETER', espSerie: instrumentos.espSerie || '', rugMarca: instrumentos.rugMarca || 'ELCOMETER', rugSerie: instrumentos.rugSerie || '', termoMarca: instrumentos.termoMarca || 'ELCOMETER', termoSerie: instrumentos.termoSerie || '' } : { espMarca: 'ELCOMETER', espSerie: 'MH11472', rugMarca: 'ELCOMETER', rugSerie: 'NE30319', termoMarca: 'ELCOMETER', termoSerie: 'KCA721' }
  return Object.assign(base, { instr, amb: { fecha: h, humedad: '', tAmbiente: '', tPieza: '', ptoRocio: '', horaInicio: '' }, limpiezaSSPC: 'sspc-sP 10', perfilSolicitado: '2 a 2,5 Mils', perfilFilas: [['', '', '', '', ''], ['', '', '', '', ''], ['', '', '', '', ''], ['', '', '', '', '']], capas: [nuevaCapa('Primera capa')], fotosGranalla: [] })
}
function fotosHTML(fotos) { var s = ''; (fotos || []).forEach(function (d) { s += '<img src="' + d + '" style="width:32%;margin:0.5%;border:1px solid #999" />' }); return s }
function filasHTML(filas) { var s = ''; for (var i = 0; i < filas.length; i++) { var pr = promArr(filas[i]); s += '<tr><td class="c">' + (i + 1) + '</td>'; for (var j = 0; j < filas[i].length; j++) s += '<td class="c">' + (filas[i][j] || '') + '</td>'; s += '<td class="c"><b>' + (pr ? pr.toFixed(2) : '') + '</b></td></tr>' } return s }
function htmlPIG(p) {
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
  function logo() { return '<div class="logo"><span class="lg-a">SEREIN</span><span class="lg-b">GROUP</span></div>' }
  function chkIcon(v) { return v === 'SI' ? '<span class="chk-yes">&#10003;</span>' : (v === 'NO' ? '<span class="chk-no">&#10007;</span>' : '') }
  function head(sub, rows) { var d = ''; rows.forEach(function (r) { d += '<div class="cb-row"><span class="cb-k">' + r[0] + '</span><span class="cb-v">' + esc(r[1]) + '</span></div>' }); return '<div class="rhead"><div class="stripe"></div>' + logo() + '<div class="rh-mid"><div class="rh-title">PROTOCOLO INICIO DE GRANALLA</div><div class="rh-sub">' + sub + '</div></div><div class="codebox">' + d + '</div></div>' }
  function infoGrid(pairs) { var s = '<div class="infogrid">'; pairs.forEach(function (pr) { s += '<div class="info-item"><span class="info-k">' + pr[0] + '</span><span class="info-v">' + esc(pr[1]) + '</span></div>' }); return s + '</div>' }
  function sec(t) { return '<div class="sec-title">' + t + '</div>' }
  function signTable(firmas) { var r = ''; (firmas || []).forEach(function (f) { r += '<tr><td>' + esc(f.rol) + '</td><td>' + esc(f.quien) + '</td><td class="sign-cell"></td><td>' + esc(f.fecha) + '</td></tr>' }); return '<table class="dt"><thead><tr><th>Rol</th><th>Nombre</th><th>Firma</th><th>Fecha</th></tr></thead><tbody>' + r + '</tbody></table>' }
  function footer() { return '<div class="rfooter"><div class="rf-navy"><span>Compromiso con la calidad</span><span>Seguridad en cada proceso</span><span>Excelencia en resultados</span></div><div class="rf-web">www.sereingroup.cl</div></div>' }
  var prom = promArr(p.medidas); var promTxt = prom ? prom.toFixed(2) : '';
  var info = [['Orden de Trabajo', p.ot], ['Cliente', p.cliente], ['Proyecto', p.proyecto], ['Protoc. Granallado', p.pgpCodigo], ['Protoc. Pintura', p.pgpCodigo], ['Preparado por', p.preparadoPor], ['Revisado por', p.revisadoPor], ['Aprobado por', p.aprobadoPor], ['Fecha', p.fecha], ['NV', p.nv]];
  var chkRows = ''; for (var i = 0; i < p.checks.length; i++) { var c = p.checks[i]; chkRows += '<tr><td class="c">' + (i + 1) + '</td><td>' + esc(c.nombre) + '</td><td class="c">' + chkIcon(c.cumple) + '</td><td>' + esc(c.obs) + '</td></tr>' }
  var perfilRows = '<tr><td>Limpieza superficial SSPC-SP</td><td>' + esc(p.limpiezaSSPC) + '</td></tr><tr><td>Medidas rugosidad</td><td>' + esc((p.medidas || []).join('  -  ')) + '</td></tr><tr><td>Perfil solicitado</td><td>' + esc(p.perfilSolicitado) + '</td></tr><tr><td>Perfil obtenido</td><td>' + esc(p.perfilObtenido || promTxt) + '</td></tr><tr><td>Promedio</td><td>' + promTxt + '</td></tr><tr><td>Cumple</td><td>' + chkIcon(p.perfilCumple) + '</td></tr>';
  var ambRows = '<tr><td>Fecha</td><td>' + esc(p.amb.fecha) + '</td><td>% Humedad</td><td>' + esc(p.amb.humedad) + '</td></tr><tr><td>T. Ambiente C</td><td>' + esc(p.amb.tAmbiente) + '</td><td>C Pieza</td><td>' + esc(p.amb.tPieza) + '</td></tr><tr><td>Pto. Rocio</td><td>' + esc(p.amb.ptoRocio) + '</td><td>Hora inicio</td><td>' + esc(p.amb.horaInicio) + '</td></tr>';
  var page1 = '<div class="page">' + head('SEREIN GROUP', [['Codigo', p.codigo || ''], ['Documento N', p.docNro || '']]) + infoGrid(info) + sec('1. Analisis proceso de granallado') + '<table class="dt"><thead><tr><th>N</th><th>Control</th><th>Cumple</th><th>Observacion</th></tr></thead><tbody>' + chkRows + '</tbody></table>' + sec('2. Inspeccion de perfil') + '<table class="dt kv"><tbody>' + perfilRows + '</tbody></table>' + sec('3. Condiciones ambientales') + '<table class="dt"><tbody>' + ambRows + '</tbody></table>' + sec('4. Firmas') + signTable(p.firmas) + footer() + '</div>';
  var evChecks = (p.checks || []).filter(function (c) { return c.fotos && c.fotos.length });
  var evHtml = ''; var en = 0; evChecks.forEach(function (c) { en++; var imgs = c.fotos || []; var grid = imgs.length === 1 ? 'g1' : (imgs.length === 2 ? 'g2' : (imgs.length === 3 ? 'g3' : 'g4')); var ig = ''; imgs.forEach(function (d) { ig += '<div class="imgframe"><img src="' + d + '"/></div>' }); evHtml += '<div class="evcard"><div class="ev-left"><div class="ev-title">EVIDENCIA ' + en + ':</div><div class="ev-desc">' + esc(c.nombre) + '</div><div class="ev-obs"><b>OBS.:</b> ' + esc(c.obs) + '</div></div><div class="ev-right ' + grid + '">' + ig + '</div></div>' });
  var info2 = [['Preparado por', p.preparadoPor], ['Revisado por', p.revisadoPor], ['Aprobado por', p.aprobadoPor], ['Cliente', p.cliente], ['Proyecto', p.proyecto], ['Prot. Granallado', p.pgpCodigo], ['Prot. Pintura', p.pgpCodigo], ['Fecha', p.fecha]];
  var page2 = ''; if (evChecks.length) { page2 = '<div class="page">' + head('ANEXO IMAGENES EVIDENCIA', [['Documento N', p.docNro || ''], ['Orden de Trabajo', p.ot || ''], ['Pagina', '2/2']]) + infoGrid(info2) + sec('Anexo imagenes evidencia') + evHtml + sec('Firmas') + signTable(p.firmas) + footer() + '</div>' }
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(p.codigo || 'PIG') + '</title><style>' + PROTO_CSS + '</style></head><body>' + page1 + page2 + '</body></html>';
}

function htmlPGP(p) {
  var pp = (p.perfilFilas || []).map(function (f) { return promArr(f) }); var perfObt = pp.length ? (pp.reduce(function (a, b) { return a + b }, 0) / pp.length) : 0
  var fr = ''; for (var j = 0; j < p.firmas.length; j++) { var f = p.firmas[j]; fr += '<tr><td>' + (f.rol || '') + '</td><td>' + (f.quien || '') + '</td><td>__________</td><td>' + (f.fecha || '') + '</td></tr>' }
  var thP = '<th>Item</th>'; for (var a = 1; a <= 5; a++) thP += '<th>' + a + '</th>'; thP += '<th>Prom.</th>'
  var s = '<!doctype html><html><head><meta charset="utf-8"><title>' + (p.codigo || 'PGP') + '</title><style>' + PROTO_CSS + '</style></head><body>'
  s += '<div class="hd"><div class="t">PROTOCOLO GRANALLADO Y PINTURA - SEREIN GROUP</div><div style="text-align:right"><b>' + (p.codigo || '') + '</b><br>Documento N: ' + (p.docNro || '') + '</div></div>'
  s += '<table class="meta"><tbody><tr><td class="k">Orden de Trabajo</td><td>' + (p.ot || '') + '</td><td class="k">NV</td><td>' + (p.nv || '') + '</td></tr><tr><td class="k">Cliente</td><td>' + (p.cliente || '') + '</td><td class="k">Proyecto</td><td>' + (p.proyecto || '') + '</td></tr><tr><td class="k">Prot. Granallado</td><td>' + (p.pgpCodigo || '') + '</td><td class="k">Protoc. Pintura</td><td>' + (p.pgpCodigo || '') + '</td></tr><tr><td class="k">Preparado por</td><td>' + (p.preparadoPor || '') + '</td><td class="k">Fecha</td><td>' + (p.fecha || '') + '</td></tr></tbody></table>'
  s += '<h2>Instrumentos utilizados</h2><table class="d"><tbody><tr><td>Medidor espesor</td><td>' + (p.instr.espMarca || '') + ' / ' + (p.instr.espSerie || '') + '</td><td>Rugosimetro</td><td>' + (p.instr.rugMarca || '') + ' / ' + (p.instr.rugSerie || '') + '</td><td>Termohigrometro</td><td>' + (p.instr.termoMarca || '') + ' / ' + (p.instr.termoSerie || '') + '</td></tr></tbody></table>'
  s += '<h2>Condiciones ambientales</h2><table class="d"><tbody><tr><td>Fecha</td><td>' + (p.amb.fecha || '') + '</td><td>% Humedad</td><td>' + (p.amb.humedad || '') + '</td><td>T. Ambiente</td><td>' + (p.amb.tAmbiente || '') + '</td></tr><tr><td>C Pieza</td><td>' + (p.amb.tPieza || '') + '</td><td>Pto. Rocio</td><td>' + (p.amb.ptoRocio || '') + '</td><td>Hora inicio</td><td>' + (p.amb.horaInicio || '') + '</td></tr></tbody></table>'
  s += '<h2>Perfil de rugosidad (Limpieza ' + (p.limpiezaSSPC || '') + ' / Solicitado ' + (p.perfilSolicitado || '') + ' / Obtenido ' + (perfObt ? perfObt.toFixed(2) : '') + ')</h2>'
  s += '<table class="d"><thead><tr>' + thP + '</tr></thead><tbody>' + filasHTML(p.perfilFilas) + '</tbody></table>'
  ;(Array.isArray(p.capas) ? p.capas : []).forEach(function (cap) { var cp = (cap.filas || []).map(function (f) { return promArr(f) }); var cprom = cp.length ? (cp.reduce(function (a, b) { return a + b }, 0) / cp.length) : 0; var nc = (cap.filas && cap.filas[0]) ? cap.filas[0].length : 7; var th = '<th>Item</th>'; for (var a = 1; a <= nc; a++) th += '<th>' + a + '</th>'; th += '<th>Prom.</th>'; s += '<h2>' + (cap.nombre || 'Capa') + ' - ' + (cap.producto || '') + ' (Solicitado ' + (cap.solicitado || '') + ' / Promedio ' + (cprom ? cprom.toFixed(2) : '') + ')</h2>'; s += '<table class="d"><thead><tr>' + th + '</tr></thead><tbody>' + filasHTML(cap.filas) + '</tbody></table>'; if ((cap.fotos || []).length) s += '<div style="margin-top:4px">' + fotosHTML(cap.fotos) + '</div>' })
  if ((p.fotosGranalla || []).length) s += '<h2>Anexo imagenes evidencia granallado</h2><div>' + fotosHTML(p.fotosGranalla) + '</div>'
  s += '<h2>Firmas</h2><table class="d"><thead><tr><th>Rol</th><th>Nombre</th><th>Firma</th><th>Fecha</th></tr></thead><tbody>' + fr + '</tbody></table>'
  return s + '</body></html>'
}
var PROTO_CSS = '@page{size:A4;margin:20mm 15mm 15mm 15mm}*{box-sizing:border-box}body{font-family:Inter,Arial,Helvetica,sans-serif;color:#101828;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{position:relative;padding-bottom:70px}.page+.page{page-break-before:always}.rhead{position:relative;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #061A40;padding:4px 0 10px;overflow:hidden}.logo{display:flex;align-items:baseline}.lg-a{color:#061A40;font-weight:800;font-size:22px;letter-spacing:1px}.lg-b{color:#FF6B00;font-weight:800;font-size:22px;margin-left:5px;letter-spacing:1px}.rh-mid{flex:1;text-align:center}.rh-title{color:#061A40;font-weight:800;font-size:17px;letter-spacing:.5px}.rh-sub{color:#FF6B00;font-weight:700;font-size:10px;letter-spacing:2px;margin-top:2px}.codebox{background:#061A40;color:#fff;padding:8px 12px;border-radius:6px;font-size:10px;min-width:160px}.cb-row{display:flex;justify-content:space-between;gap:12px;padding:1px 0}.cb-k{color:#9fb0cf}.cb-v{font-weight:700}.stripe{position:absolute;top:-10px;right:120px;width:60px;height:130%;background:#FF6B00;opacity:.10;transform:skewX(-22deg)}.infogrid{display:grid;grid-template-columns:1fr 1fr;gap:0 26px;margin:14px 0 4px}.info-item{display:flex;justify-content:space-between;border-bottom:1px solid #D9DEE8;padding:5px 2px;font-size:11px}.info-k{color:#5a6b85}.info-v{font-weight:700;color:#101828;text-align:right}.sec-title{color:#061A40;font-weight:800;font-size:12px;text-transform:uppercase;border-left:4px solid #FF6B00;padding-left:9px;margin:16px 0 7px;letter-spacing:.4px}table.dt{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:4px}table.dt th{background:#061A40;color:#fff;padding:6px 8px;text-align:left;font-weight:700;font-size:10px}table.dt td{border:1px solid #D9DEE8;padding:6px 8px}table.dt td.c{text-align:center}table.dt.kv td:first-child{background:#F5F7FA;font-weight:600;width:42%}.chk-yes{color:#128a4b;font-weight:800;font-size:13px}.chk-no{color:#B5432E;font-weight:800}.sign-cell{height:32px}.rfooter{display:flex;margin-top:20px;border-radius:6px;overflow:hidden;border:1px solid #D9DEE8}.rf-navy{background:#061A40;color:#fff;flex:1;display:flex;gap:20px;justify-content:center;align-items:center;padding:10px;font-size:10px;font-weight:600}.rf-web{background:#FF6B00;color:#fff;padding:0 16px;font-weight:700;font-size:11px;display:flex;align-items:center}.evcard{border:1px solid #D9DEE8;border-radius:8px;padding:12px 14px;margin-bottom:12px;display:flex;gap:16px;page-break-inside:avoid;background:#fff}.ev-left{width:36%}.ev-title{color:#FF6B00;font-weight:800;font-size:12px}.ev-desc{margin:5px 0;font-size:11px;font-weight:600;color:#101828}.ev-obs{font-size:10.5px;color:#344054;line-height:1.4}.ev-right{flex:1;display:grid;gap:6px}.ev-right.g1{grid-template-columns:1fr}.ev-right.g2{grid-template-columns:repeat(2,1fr)}.ev-right.g3{grid-template-columns:repeat(3,1fr)}.ev-right.g4{grid-template-columns:repeat(2,1fr)}.imgframe{border:2px solid #061A40;border-radius:4px;overflow:hidden;height:150px;background:#F5F7FA;display:flex;align-items:center;justify-content:center}.imgframe img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block}.hd{display:flex;justify-content:space-between;border-bottom:3px solid #061A40;padding:6px 0;align-items:center}.hd .t{font-weight:800;font-size:15px;color:#061A40}table.meta{width:100%;border-collapse:collapse;margin-top:6px}table.meta td{border:1px solid #D9DEE8;padding:4px 6px;font-size:11px}table.meta .k{background:#F5F7FA;font-weight:700;width:130px}h2{font-size:12px;text-transform:uppercase;color:#061A40;border-left:4px solid #FF6B00;padding-left:9px;margin:14px 0 5px;font-weight:800}table.d{width:100%;border-collapse:collapse}table.d th{background:#061A40;color:#fff;padding:5px 6px;font-size:10px;text-align:left}table.d td{border:1px solid #D9DEE8;padding:5px 6px;font-size:11px}table.d td.c{text-align:center}'
function descargarProto(p) { const w = window.open('', '_blank'); if (!w) { window.alert('Habilita las ventanas emergentes.'); return } w.document.write(p.tipo === 'PIG' ? htmlPIG(p) : htmlPGP(p)); w.document.close(); setTimeout(function () { w.focus(); w.print() }, 400) }
function PF({ label, children }) { return (<div><div style={{ fontSize: 11, color: '#7A8288', marginBottom: 2, marginTop: 4 }}>{label}</div>{children}</div>) }
function FotoSlots({ label, fotos, max, onChange }) {
  const add = e => { const files = [...(e.target.files || [])].slice(0, max - fotos.length); let pend = files.length; if (!pend) return; const acc = []; files.forEach(f => imgToData(f, d => { acc.push(d); pend--; if (pend === 0) onChange([...fotos, ...acc]) })); e.target.value = '' }
  return (<div style={{ marginTop: 8 }}><div style={{ fontSize: 11.5, fontWeight: 600, color: '#7A8288', marginBottom: 4 }}>{label} ({fotos.length}/{max})</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{fotos.map((d, i) => (<div key={i} style={{ position: 'relative' }}><img src={d} style={{ width: 96, height: 72, objectFit: 'contain', background: '#F5F7FA', border: '1px solid #CBD2D6' }} /><button onClick={() => onChange(fotos.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, background: '#B5432E', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 11 }}>x</button></div>))}{fotos.length < max && (<label style={{ width: 96, height: 72, border: '1px dashed #CBD2D6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#7A8288', fontSize: 22 }}>+<input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={add} /></label>)}</div></div>) }
function TablaMedidas({ titulo, filas, ncols, onSetCell, onAuto, onAddFila, onDelFila, resumen }) {
  const ip = { padding: '4px 5px', border: '1px solid #CBD2D6', fontSize: 12, width: 50, textAlign: 'center', boxSizing: 'border-box' }
  const proms = filas.map(f => promArr(f)); const global = proms.length ? (proms.reduce((a, b) => a + b, 0) / proms.length) : 0
  return (<div style={{ marginTop: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}><span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase' }}>{titulo}</span><div style={{ display: 'flex', gap: 6 }}>{onAddFila && <button onClick={onAddFila} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>+ fila</button>}{onDelFila && filas.length > 1 && <button onClick={onDelFila} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>- fila</button>}<button onClick={onAuto} title="Completa las celdas vacias con valores aceptables" style={{ background: '#3D7A4E', color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>Autocompletar</button></div></div><div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', fontSize: 12, marginTop: 4 }}><thead><tr><th style={{ padding: 3, fontSize: 10, color: '#7A8288' }}>Item</th>{Array.from({ length: ncols }).map((_, c) => <th key={c} style={{ padding: 3, fontSize: 10, color: '#7A8288' }}>{c + 1}</th>)}<th style={{ padding: 3, fontSize: 10, color: '#7A8288' }}>Prom.</th></tr></thead><tbody>{filas.map((f, ri) => (<tr key={ri}><td style={{ padding: 2, textAlign: 'center', fontWeight: 600 }}>{ri + 1}</td>{f.map((v, ci) => <td key={ci} style={{ padding: 2 }}><input style={ip} value={v} onChange={e => onSetCell(ri, ci, e.target.value)} /></td>)}<td style={{ padding: 2, textAlign: 'center', fontWeight: 700, color: '#D2642F' }}>{proms[ri] ? proms[ri].toFixed(2) : ''}</td></tr>))}</tbody></table></div><div style={{ fontSize: 12, marginTop: 4 }}>{resumen}: <b>{global ? global.toFixed(2) : ''}</b></div></div>) }
function ProtoHead({ p, upd, onDel, titulo }) {
  const ip = { padding: '6px 8px', border: '1px solid #CBD2D6', fontSize: 12.5, boxSizing: 'border-box', width: '100%' }
  const set = (k, v) => upd({ ...p, [k]: v })
  return (<div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}><span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 14, textTransform: 'uppercase' }}>{p.codigo} - {titulo}</span><div style={{ display: 'flex', gap: 8 }}><button onClick={() => descargarProto(p)} style={{ background: '#161616', color: '#fff', border: 'none', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5 }}>Descargar PDF</button><button onClick={onDel} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '7px 10px', cursor: 'pointer', fontSize: 12.5, color: '#7A8288' }}>Eliminar</button></div></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8 }}><PF label="Codigo"><input style={ip} value={p.codigo} onChange={e => set('codigo', e.target.value)} /></PF><PF label="Orden de Trabajo"><input style={ip} value={p.ot} onChange={e => set('ot', e.target.value)} /></PF><PF label="NV"><input style={ip} value={p.nv} onChange={e => set('nv', e.target.value)} /></PF><PF label="Codigo PGP (gran/pintura)"><input style={ip} value={p.pgpCodigo} onChange={e => set('pgpCodigo', e.target.value)} /></PF><PF label="Cliente"><input style={ip} value={p.cliente} onChange={e => set('cliente', e.target.value)} /></PF><PF label="Proyecto"><input style={ip} value={p.proyecto} onChange={e => set('proyecto', e.target.value)} /></PF><PF label="Fecha"><input type="date" style={ip} value={p.fecha} onChange={e => set('fecha', e.target.value)} /></PF><PF label="Preparado por"><input style={ip} value={p.preparadoPor} onChange={e => set('preparadoPor', e.target.value)} /></PF></div></div>) }
function ProtoPIGForm({ p, upd, onDel }) {
  const ip = { padding: '6px 8px', border: '1px solid #CBD2D6', fontSize: 12.5, boxSizing: 'border-box', width: '100%' }
  const set = (k, v) => upd({ ...p, [k]: v }); const setAmb = (k, v) => upd({ ...p, amb: { ...p.amb, [k]: v } }); const setChk = (i, k, v) => upd({ ...p, checks: p.checks.map((c, j) => j === i ? { ...c, [k]: v } : c) }); const setMed = (i, v) => upd({ ...p, medidas: p.medidas.map((m, j) => j === i ? v : m) })
  return (<div style={{ marginTop: 12, border: '1px solid #E2DED4', borderTop: '3px solid #D2642F', padding: 14 }}><ProtoHead p={p} upd={upd} onDel={onDel} titulo="Protocolo Inicio de Granalla" /><div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '10px 0 4px' }}>Controles</div><div>{p.checks.map((c, i) => (<div key={i} style={{ border: '1px solid #EEE9DF', borderRadius: 6, padding: 8, marginBottom: 6 }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 6 }}><input style={ip} value={c.nombre} onChange={e => setChk(i, 'nombre', e.target.value)} /><select value={c.cumple} onChange={e => setChk(i, 'cumple', e.target.value)} style={ip}><option>SI</option><option>NO</option></select></div><input style={{ ...ip, marginTop: 6 }} placeholder="Observacion" value={c.obs} onChange={e => setChk(i, 'obs', e.target.value)} /><FotoSlots label={'Fotos evidencia ' + (i + 1)} fotos={c.fotos || []} max={4} onChange={v => setChk(i, 'fotos', v)} /></div>))}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', gap: 8, marginTop: 8 }}><PF label="Limpieza SSPC-SP"><input style={ip} value={p.limpiezaSSPC} onChange={e => set('limpiezaSSPC', e.target.value)} /></PF><PF label="Perfil solicitado"><input style={ip} value={p.perfilSolicitado} onChange={e => set('perfilSolicitado', e.target.value)} /></PF><PF label="Medida 1"><input style={ip} value={p.medidas[0]} onChange={e => setMed(0, e.target.value)} /></PF><PF label="Medida 2"><input style={ip} value={p.medidas[1]} onChange={e => setMed(1, e.target.value)} /></PF><PF label="Medida 3"><input style={ip} value={p.medidas[2]} onChange={e => setMed(2, e.target.value)} /></PF><PF label="Perfil obtenido (auto)"><input readOnly style={{ ...ip, background: '#F1EDE6' }} value={promArr(p.medidas) ? promArr(p.medidas).toFixed(2) : ''} /></PF></div><div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '12px 0 4px' }}>Condiciones ambientales</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 8 }}><PF label="Fecha"><input type="date" style={ip} value={p.amb.fecha} onChange={e => setAmb('fecha', e.target.value)} /></PF><PF label="% Humedad"><input style={ip} value={p.amb.humedad} onChange={e => setAmb('humedad', e.target.value)} /></PF><PF label="T. Ambiente C"><input style={ip} value={p.amb.tAmbiente} onChange={e => setAmb('tAmbiente', e.target.value)} /></PF><PF label="C Pieza"><input style={ip} value={p.amb.tPieza} onChange={e => setAmb('tPieza', e.target.value)} /></PF><PF label="Pto. Rocio"><input style={ip} value={p.amb.ptoRocio} onChange={e => setAmb('ptoRocio', e.target.value)} /></PF><PF label="Hora inicio"><input style={ip} value={p.amb.horaInicio} onChange={e => setAmb('horaInicio', e.target.value)} /></PF></div><FotoSlots label="Fotos inicio de granalla" fotos={p.fotosGranalla || []} max={4} onChange={v => set('fotosGranalla', v)} /></div>) }
function CapaBlock({ cap, onSet, onCell, onAuto, onAddFila, onDelFila, onFotos, onDel }) {
  const ip = { padding: '6px 8px', border: '1px solid #CBD2D6', fontSize: 12.5, boxSizing: 'border-box', width: '100%' }
  return (<div style={{ border: '1px solid #E2DED4', padding: 10, marginTop: 8, background: '#FBF9F6' }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 8 }}><PF label="Nombre capa"><input style={ip} value={cap.nombre} onChange={e => onSet('nombre', e.target.value)} /></PF><PF label="Producto"><input style={ip} value={cap.producto} onChange={e => onSet('producto', e.target.value)} /></PF><PF label="Espesor solicitado"><input style={ip} value={cap.solicitado} onChange={e => onSet('solicitado', e.target.value)} /></PF></div><TablaMedidas titulo="Espesores (DFT)" filas={cap.filas} ncols={(cap.filas[0] || []).length} onSetCell={onCell} onAuto={onAuto} onAddFila={onAddFila} onDelFila={onDelFila} resumen="Promedio capa" /><FotoSlots label={'Fotos ' + (cap.nombre || 'capa')} fotos={cap.fotos || []} max={4} onChange={onFotos} /><div style={{ textAlign: 'right', marginTop: 4 }}><button onClick={onDel} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: '#B5432E' }}>Eliminar capa</button></div></div>) }
function ProtoPGPForm({ p, upd, onDel }) {
  const ip = { padding: '6px 8px', border: '1px solid #CBD2D6', fontSize: 12.5, boxSizing: 'border-box', width: '100%' }
  const set = (k, v) => upd({ ...p, [k]: v }); const setAmb = (k, v) => upd({ ...p, amb: { ...p.amb, [k]: v } }); const setInstr = (k, v) => upd({ ...p, instr: { ...p.instr, [k]: v } })
  const setPerfil = (r, c, v) => upd({ ...p, perfilFilas: p.perfilFilas.map((row, ri) => ri === r ? row.map((x, ci) => ci === c ? v : x) : row) })
  const autoPerfil = () => { const [lo, hi] = parseRango(p.perfilSolicitado); upd({ ...p, perfilFilas: p.perfilFilas.map(row => autoFila(row, lo, hi)) }) }
  const capas = Array.isArray(p.capas) ? p.capas : []
  const setCapa = (id, k, v) => upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, [k]: v } : c) })
  const cellCapa = (id, r, cc, v) => upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, filas: c.filas.map((row, ri) => ri === r ? row.map((x, ci) => ci === cc ? v : x) : row) } : c) })
  const autoCapa = id => { const cap = capas.find(c => c.id === id); const [lo, hi] = parseRango(cap.solicitado); upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, filas: c.filas.map(row => autoFila(row, lo, hi)) } : c) }) }
  const addFila = id => upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, filas: [...c.filas, ['', '', '', '', '', '', '']] } : c) })
  const delFila = id => upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, filas: c.filas.slice(0, -1) } : c) })
  const fotosCapa = (id, v) => upd({ ...p, capas: capas.map(c => c.id === id ? { ...c, fotos: v } : c) })
  const addCapa = () => upd({ ...p, capas: [...capas, nuevaCapa('Capa ' + (capas.length + 1))] })
  const delCapa = id => upd({ ...p, capas: capas.filter(c => c.id !== id) })
  return (<div style={{ marginTop: 12, border: '1px solid #E2DED4', borderTop: '3px solid #161616', padding: 14 }}><ProtoHead p={p} upd={upd} onDel={onDel} titulo="Protocolo Granallado y Pintura" /><div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '10px 0 4px' }}>Instrumentos (desde Parametros, editables)</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8 }}><PF label="Medidor espesor - marca"><input style={ip} value={p.instr.espMarca} onChange={e => setInstr('espMarca', e.target.value)} /></PF><PF label="Medidor espesor - serie"><input style={ip} value={p.instr.espSerie} onChange={e => setInstr('espSerie', e.target.value)} /></PF><PF label="Rugosimetro - marca"><input style={ip} value={p.instr.rugMarca} onChange={e => setInstr('rugMarca', e.target.value)} /></PF><PF label="Rugosimetro - serie"><input style={ip} value={p.instr.rugSerie} onChange={e => setInstr('rugSerie', e.target.value)} /></PF><PF label="Termohigrometro - marca"><input style={ip} value={p.instr.termoMarca} onChange={e => setInstr('termoMarca', e.target.value)} /></PF><PF label="Termohigrometro - serie"><input style={ip} value={p.instr.termoSerie} onChange={e => setInstr('termoSerie', e.target.value)} /></PF></div><div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '10px 0 4px' }}>Condiciones ambientales</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 8 }}><PF label="Fecha"><input type="date" style={ip} value={p.amb.fecha} onChange={e => setAmb('fecha', e.target.value)} /></PF><PF label="% Humedad"><input style={ip} value={p.amb.humedad} onChange={e => setAmb('humedad', e.target.value)} /></PF><PF label="T. Ambiente"><input style={ip} value={p.amb.tAmbiente} onChange={e => setAmb('tAmbiente', e.target.value)} /></PF><PF label="C Pieza"><input style={ip} value={p.amb.tPieza} onChange={e => setAmb('tPieza', e.target.value)} /></PF><PF label="Pto. Rocio"><input style={ip} value={p.amb.ptoRocio} onChange={e => setAmb('ptoRocio', e.target.value)} /></PF><PF label="Hora inicio"><input style={ip} value={p.amb.horaInicio} onChange={e => setAmb('horaInicio', e.target.value)} /></PF></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8, marginTop: 8 }}><PF label="Limpieza superficial"><input style={ip} value={p.limpiezaSSPC} onChange={e => set('limpiezaSSPC', e.target.value)} /></PF><PF label="Perfil solicitado"><input style={ip} value={p.perfilSolicitado} onChange={e => set('perfilSolicitado', e.target.value)} /></PF></div><TablaMedidas titulo="Perfil de rugosidad" filas={Array.isArray(p.perfilFilas) ? p.perfilFilas : []} ncols={5} onSetCell={setPerfil} onAuto={autoPerfil} resumen="Perfil obtenido (prom.)" /><div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', margin: '12px 0 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>Esquema de pintura - capas ({capas.length})</span><button onClick={addCapa} style={{ background: '#D2642F', color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>+ Agregar capa</button></div>{capas.map(cap => (<CapaBlock key={cap.id} cap={cap} onSet={(k, v) => setCapa(cap.id, k, v)} onCell={(r, c, v) => cellCapa(cap.id, r, c, v)} onAuto={() => autoCapa(cap.id)} onAddFila={() => addFila(cap.id)} onDelFila={() => delFila(cap.id)} onFotos={v => fotosCapa(cap.id, v)} onDel={() => delCapa(cap.id)} />))}<FotoSlots label="Fotos inicio de granalla" fotos={p.fotosGranalla || []} max={4} onChange={v => set('fotosGranalla', v)} /></div>) }
function ProtocolosOT({ ot, onUpdate, otsAll = [], instrumentos = null }) {
  const lista = ot.protocolos || []
  const gen = tipo => onUpdate(ot.id, { protocolos: [...lista, nuevoProtocolo(tipo, ot, nextCorrelativoProt(otsAll), instrumentos)] })
  const updP = np => onUpdate(ot.id, { protocolos: lista.map(x => x.id === np.id ? np : x) })
  const delP = id => window.confirm('Eliminar este protocolo?') && onUpdate(ot.id, { protocolos: lista.filter(x => x.id !== id) })
  return (<div style={{ marginTop: 14, borderTop: '1px dashed #CBD2D6', paddingTop: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}><div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 13, textTransform: 'uppercase' }}>Protocolos de calidad ({lista.length})</div><div style={{ display: 'flex', gap: 8 }}><button onClick={() => gen('PIG')} style={{ background: '#D2642F', color: '#fff', border: 'none', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5 }}>+ Generar PIG</button><button onClick={() => gen('PGP')} style={{ background: '#161616', color: '#fff', border: 'none', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5 }}>+ Generar PGP</button></div></div>{lista.map(p => p.tipo === 'PIG' ? <ProtoPIGForm key={p.id} p={p} upd={updP} onDel={() => delP(p.id)} /> : <ProtoPGPForm key={p.id} p={p} upd={updP} onDel={() => delP(p.id)} />)}</div>) }

export default function OTModule({ areasPermitidas = ['Santa Rosa', 'Istria'], ots: otsExt, setOts: setOtsExt, verValores = true, clientes = [], ordenesCompra = [], mo = null, instrumentos = null }) {
  const [otsInt, setOtsInt] = useState(OTS_INICIALES)
  const otsAll = otsExt ?? otsInt
  const setOts = setOtsExt ?? setOtsInt
  const ots = otsAll.filter(o => areasPermitidas.includes(o.area))
  const [areaSel, setAreaSel] = useState(areasPermitidas[0])
  const [creando, setCreando] = useState(false)
  const [fCliente, setFCliente] = useState('')
  const [page, setPage] = useState(1)
  const [rep, setRep] = useState(false)
  const [repDesde, setRepDesde] = useState('')
  const [repHasta, setRepHasta] = useState('')
  const [repCliente, setRepCliente] = useState('')
  const _norm = s => (s || '').trim().toLowerCase()
  const otFecha = o => o.fecha || ((o.ventas || []).map(v => v.fecha).filter(f => f && f !== '—').sort()[0]) || ''
  const clientesActivos = [...new Set((clientes || []).filter(c => (c.estado || 'Activo') === 'Activo').map(c => (c.nombre || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))

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
  const eliminar = id => setOts(xs => xs.filter(o => o.id !== id))

  const visibles = ots.filter(o => o.area === areaSel && (!fCliente || _norm(o.cliente) === _norm(fCliente)))
  const ventaTot = visibles.reduce((a, o) => a + o.ventas.reduce((x, v) => x + v.neta, 0), 0)
  const costoTot = visibles.reduce((a, o) => a + o.costos.reduce((x, c) => x + c.monto, 0) + costoOCdeOT(ordenesCompra, o.numero) + costoMOdeOT(mo, o.numero), 0)
  const utilTot = ventaTot - costoTot

  const nums = ots.map(o => parseInt((o.numero.match(/(\d+)$/) || [0, 0])[1], 10))
  const siguiente = `OT-2026-${String(Math.max(100, ...nums) + 1).padStart(3, '0')}`

  const kpis = verValores
    ? [['OTs', visibles.length], ['Venta neta', clp(ventaTot)], ['Costos', clp(costoTot)], ['Utilidad real', clp(utilTot)]]
    : [['OTs', visibles.length]]

  return (
    <div>
      {/* Selector de área */}
      {areasPermitidas.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {areasPermitidas.map(a => (
            <button key={a} onClick={() => setAreaSel(a)}
              style={{ background: areaSel === a ? C.carbon : '#fff', color: areaSel === a ? '#fff' : C.carbon, border: '1px solid #CBD2D6', padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {a}
            </button>
          ))}
        </div>
      )}

      {/* Filtro por cliente activo + informe Excel */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: '#7A8288', display: 'flex', alignItems: 'center', gap: 6 }}>Cliente
          <select value={fCliente} onChange={e => setFCliente(e.target.value)} style={inp}>
            <option value="">Todos</option>
            {clientesActivos.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <button onClick={() => { setRep(v => !v); setRepCliente(fCliente) }} style={{ background: C.carbon, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}><Download size={14} /> Informe Excel</button>
      </div>
      {rep && (
        <div style={{ background: '#FAF7F3', border: '1px solid #E2DED4', padding: 12, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, color: '#7A8288' }}>Desde<input type="date" value={repDesde} onChange={e => setRepDesde(e.target.value)} style={{ ...inp, display: 'block', marginTop: 3 }} /></label>
          <label style={{ fontSize: 11, color: '#7A8288' }}>Hasta<input type="date" value={repHasta} onChange={e => setRepHasta(e.target.value)} style={{ ...inp, display: 'block', marginTop: 3 }} /></label>
          <label style={{ fontSize: 11, color: '#7A8288' }}>Cliente<select value={repCliente} onChange={e => setRepCliente(e.target.value)} style={{ ...inp, display: 'block', marginTop: 3 }}><option value="">Todos</option>{clientesActivos.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
          <button onClick={generarInforme} style={{ background: C.verde, color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Generar Excel</button>
          <span style={{ fontSize: 11.5, color: '#9AA0A6' }}>Deja las fechas vacías para incluir todo. Cubre tus áreas visibles.</span>
        </div>
      )}

      {/* KPIs del área */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {kpis.map(([l, v], i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #E2DED4', padding: 14, flex: '1 1 150px' }}>
            <div style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>{l}</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 600, color: l === 'Utilidad real' ? C.verde : C.carbon }}>{v}</div>
          </div>
        ))}
      </div>

      {!creando && (
        <button onClick={() => setCreando(true)}
          style={{ background: C.azul, color: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <Plus size={15} /> Nueva OT en {areaSel}
        </button>
      )}
      {creando && <FormOT area={areaSel} siguienteNumero={siguiente} onAdd={o => { setOts(xs => [o, ...xs]); setCreando(false) }} onCancel={() => setCreando(false)} />}

      {visibles.length === 0 && <div style={{ color: '#9AA0A6', fontSize: 14, padding: 20, textAlign: 'center', background: '#fff', border: '1px dashed #CBD2D6' }}>Sin OTs en {areaSel}. Crea la primera.</div>}
      {paginar(visibles, page).items.map(o => <TarjetaOT key={o.id} ot={o} onUpdate={actualizar} onDelete={eliminar} verValores={verValores} ordenesCompra={ordenesCompra} mo={mo} otsAll={otsAll} instrumentos={instrumentos} />)}
      <Paginador page={paginar(visibles, page).page} paginas={paginar(visibles, page).paginas} total={visibles.length} setPage={setPage} />

      <div style={{ fontSize: 12, color: '#9AA0A6', textAlign: 'center', marginTop: 8 }}>
        Vista de prueba: los cambios se pierden al recargar. En la versión con base de datos todo queda guardado.
      </div>
    </div>
  )
}
