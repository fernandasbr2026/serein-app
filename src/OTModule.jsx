import React, { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2, X, Ruler, Paintbrush, FileText, Receipt, ShoppingCart, CircleDollarSign, Download, Camera } from 'lucide-react'
import * as XLSX from 'xlsx'
import { descargarOTDesdeOT } from './CotizacionesModule.jsx'

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

function TarjetaOT({ ot, onUpdate, onDelete, verValores = true }) {
  const [abierta, setAbierta] = useState(false)
  const [addVenta, setAddVenta] = useState(false)
  const [addCosto, setAddCosto] = useState(false)

  const ventaTotal = ot.ventas.reduce((a, v) => a + v.neta, 0)
  const costoTotal = ot.costos.reduce((a, c) => a + c.monto, 0)
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
            <span><FileText size={11} style={{ verticalAlign: -1 }} /> {ot.cotizacion} · OC {ot.oc}</span>
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
                <span>Costos: <b>{clp(costoTotal)}</b></span>
                <span>Utilidad real: <b style={{ color: margen >= 30 ? C.verde : margen >= 15 ? C.ambar : C.rojo }}>{clp(utilidad)} ({margen.toFixed(1)}%)</b></span>
              </div>
            </>
          )}

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
  const [f, setF] = useState({ cliente: '', cotizacion: '', oc: '', m2: '', montoCotizado: '', preparacion: PREPARACIONES[2], esquema: '' })
  return (
    <div style={{ background: '#fff', border: `2px solid ${C.azul}`, padding: 16, marginBottom: 14 }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>
        Nueva OT · {area} <span style={{ fontFamily: "'JetBrains Mono',monospace", background: C.carbon, color: '#fff', padding: '2px 8px', marginLeft: 8 }}>{siguienteNumero}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        <input style={inp} placeholder="Cliente *" value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} />
        <input style={inp} placeholder="Cotización" value={f.cotizacion} onChange={e => setF({ ...f, cotizacion: e.target.value })} />
        <input style={inp} placeholder="OC / NV" value={f.oc} onChange={e => setF({ ...f, oc: e.target.value })} />
        <input style={inp} placeholder="Metros cuadrados" value={f.m2} onChange={e => setF({ ...f, m2: e.target.value })} />
        <input style={inp} placeholder="Monto cotizado CLP" value={f.montoCotizado} onChange={e => setF({ ...f, montoCotizado: e.target.value })} />
        <select style={inp} value={f.preparacion} onChange={e => setF({ ...f, preparacion: e.target.value })}>
          {PREPARACIONES.map(p => <option key={p}>{p}</option>)}
        </select>
        <input style={inp} placeholder="Esquema de pintura" value={f.esquema} onChange={e => setF({ ...f, esquema: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => f.cliente && onAdd({
          id: 'ot' + Date.now(), numero: siguienteNumero, area,
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
export default function OTModule({ areasPermitidas = ['Santa Rosa', 'Istria'], ots: otsExt, setOts: setOtsExt, verValores = true }) {
  const [otsInt, setOtsInt] = useState(OTS_INICIALES)
  const otsAll = otsExt ?? otsInt
  const setOts = setOtsExt ?? setOtsInt
  const ots = otsAll.filter(o => areasPermitidas.includes(o.area))
  const [areaSel, setAreaSel] = useState(areasPermitidas[0])
  const [creando, setCreando] = useState(false)

  const actualizar = (id, cambios) => setOts(xs => xs.map(o => o.id === id ? { ...o, ...cambios } : o))
  const eliminar = id => setOts(xs => xs.filter(o => o.id !== id))

  const visibles = ots.filter(o => o.area === areaSel)
  const ventaTot = visibles.reduce((a, o) => a + o.ventas.reduce((x, v) => x + v.neta, 0), 0)
  const costoTot = visibles.reduce((a, o) => a + o.costos.reduce((x, c) => x + c.monto, 0), 0)
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
      {visibles.map(o => <TarjetaOT key={o.id} ot={o} onUpdate={actualizar} onDelete={eliminar} verValores={verValores} />)}

      <div style={{ fontSize: 12, color: '#9AA0A6', textAlign: 'center', marginTop: 8 }}>
        Vista de prueba: los cambios se pierden al recargar. En la versión con base de datos todo queda guardado.
      </div>
    </div>
  )
}
