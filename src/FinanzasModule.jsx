import React, { useState, useMemo } from 'react'
import { Plus, Trash2, X, Copy, Landmark, ReceiptText, PieChart as PieIcon, CalendarClock, BarChart3, CheckCircle2 } from 'lucide-react'

const C = { naranja: '#D2642F', carbon: '#161616', verde: '#3D7A4E', rojo: '#B5432E', gris: '#7A8288' }
const clp = n => '$' + Math.round(n).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const hoy = () => new Date().toISOString().slice(0, 10)
const mesDe = f => (f || '').slice(0, 7)
const inp = { padding: '7px 9px', border: '1px solid #CBD2D6', fontSize: 13, boxSizing: 'border-box' }

export const AREAS_GASTO = ['Santa Rosa', 'Istria', 'Producción / Planta', 'Proyectos', 'Administración', 'Comercial', 'Finanzas', 'Gerencia', 'General empresa']
const CATEGORIAS_FIJO = ['Arriendo', 'Luz', 'Agua', 'Internet', 'Teléfono', 'Contabilidad', 'Software', 'Seguros', 'Sueldos administrativos', 'Sueldos trabajadores', 'Imposiciones', 'Patentes', 'Servicios externos', 'Mantenciones', 'Otros']
const CATEGORIAS_VAR = ['Combustible', 'EPP', 'Herramientas', 'Mantenciones', 'Transporte', 'Materiales menores', 'Repuestos', 'Insumos de planta', 'Otros']
const FRECUENCIAS = ['Mensual', 'Semanal', 'Anual', 'Única']
const ESTADOS_GASTO = ['Pendiente', 'Pagado', 'Vencido', 'Anulado']
const TIPOS_OBLIGACION = ['Crédito', 'Leasing', 'Préstamo', 'Fogape', 'Vehículo', 'Maquinaria', 'Otro']

// ================= DATOS DE PRUEBA (gastos reales de tu Excel, julio 2026) =================
export const FIN_SEED = {
  areas: [...AREAS_GASTO],
  plantillas: [
    { id: 'p1', nombre: 'Santa Rosa / Istria 50-50', items: [{ area: 'Santa Rosa', pct: 50 }, { area: 'Istria', pct: 50 }] },
    { id: 'p2', nombre: 'Santa Rosa / Producción 50-50', items: [{ area: 'Santa Rosa', pct: 50 }, { area: 'Producción / Planta', pct: 50 }] },
    { id: 'p3', nombre: 'Administración 100%', items: [{ area: 'Administración', pct: 100 }] },
    { id: 'p4', nombre: 'General empresa', items: [{ area: 'General empresa', pct: 100 }] },
  ],
  gastos: [
    { id: 'g1', tipo: 'fijo', nombre: 'Arriendo planta Santa Rosa', categoria: 'Arriendo', proveedor: 'Arrendador', neto: 7312972, iva: 0, vencimiento: '2026-07-05', frecuencia: 'Mensual', estado: 'Pagado', ot: '', dist: [{ area: 'Santa Rosa', pct: 100 }], obs: 'Valor UF junio' },
    { id: 'g2', tipo: 'fijo', nombre: 'Sueldo administrativo Mario Vidal', categoria: 'Sueldos administrativos', proveedor: 'Interno', neto: 3200000, iva: 0, vencimiento: '2026-07-30', frecuencia: 'Mensual', estado: 'Pendiente', ot: '', dist: [{ area: 'Proyectos', pct: 100 }], obs: '' },
    { id: 'g3', tipo: 'fijo', nombre: 'Sueldos Fernanda y Luis', categoria: 'Sueldos administrativos', proveedor: 'Interno', neto: 9800000, iva: 0, vencimiento: '2026-07-30', frecuencia: 'Mensual', estado: 'Pendiente', ot: '', dist: [{ area: 'Santa Rosa', pct: 50 }, { area: 'Istria', pct: 50 }], obs: 'Mixto SR-Istria' },
    { id: 'g4', tipo: 'fijo', nombre: 'Sueldo Carolina', categoria: 'Sueldos administrativos', proveedor: 'Interno', neto: 1800000, iva: 0, vencimiento: '2026-07-30', frecuencia: 'Mensual', estado: 'Pendiente', ot: '', dist: [{ area: 'Santa Rosa', pct: 50 }, { area: 'Istria', pct: 50 }], obs: '' },
    { id: 'g5', tipo: 'fijo', nombre: 'Sueldos trabajadores Istria', categoria: 'Sueldos trabajadores', proveedor: 'Interno', neto: 5200000, iva: 0, vencimiento: '2026-07-30', frecuencia: 'Mensual', estado: 'Pendiente', ot: '', dist: [{ area: 'Istria', pct: 100 }], obs: '' },
    { id: 'g6', tipo: 'fijo', nombre: 'Sueldos trabajadores Santa Rosa', categoria: 'Sueldos trabajadores', proveedor: 'Interno', neto: 7450000, iva: 0, vencimiento: '2026-07-30', frecuencia: 'Mensual', estado: 'Pendiente', ot: '', dist: [{ area: 'Santa Rosa', pct: 100 }], obs: '' },
    { id: 'g7', tipo: 'variable', nombre: 'Combustible camioneta', categoria: 'Combustible', proveedor: 'Copec', neto: 180000, iva: 34200, vencimiento: '2026-07-03', frecuencia: 'Única', estado: 'Pagado', ot: '', dist: [{ area: 'General empresa', pct: 100 }], obs: '' },
  ],
  obligaciones: [
    {
      id: 'o1', tipo: 'Leasing', institucion: 'Banco (EJEMPLO — reemplazar por real)', montoOriginal: 36000000,
      inicio: '2026-01-05', nCuotas: 36, valorCuota: 1150000, diaVenc: 5, tasa: '',
      estado: 'Vigente', activo: 'Camioneta / maquinaria', dist: [{ area: 'Producción / Planta', pct: 100 }], obs: 'Dato de ejemplo: tu hoja de créditos estaba vacía',
      cuotas: Array.from({ length: 36 }, (_, i) => {
        const d = new Date(2026, 0 + i, 5)
        const fecha = d.toISOString().slice(0, 10)
        return { n: i + 1, vencimiento: fecha, capital: null, interes: null, seguro: null, total: 1150000, estado: fecha < hoy() ? 'Pagada' : 'Pendiente', fechaPago: fecha < hoy() ? fecha : null }
      }),
    },
  ],
}

// ================= EDITOR DE DISTRIBUCIÓN (reutilizable) =================
function EditorDistribucion({ dist, setDist, plantillas, areas }) {
  const suma = dist.reduce((a, d) => a + (parseFloat(d.pct) || 0), 0)
  const ok = Math.abs(suma - 100) < 0.01
  return (
    <div style={{ background: '#FAF7F3', padding: 12, marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.gris, textTransform: 'uppercase' }}>Distribución por área</span>
        <select onChange={e => { const p = plantillas.find(x => x.id === e.target.value); if (p) setDist(p.items.map(i => ({ ...i }))); e.target.value = '' }} defaultValue="" style={{ ...inp, fontSize: 12 }}>
          <option value="" disabled>Usar plantilla…</option>
          {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>
      {dist.map((d, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <select value={d.area} onChange={e => setDist(dist.map((x, j) => j === i ? { ...x, area: e.target.value } : x))} style={{ ...inp, flex: 1 }}>
            {areas.map(a => <option key={a}>{a}</option>)}
          </select>
          <input type="number" value={d.pct} onChange={e => setDist(dist.map((x, j) => j === i ? { ...x, pct: e.target.value } : x))} style={{ ...inp, width: 70, textAlign: 'right' }} />
          <span style={{ fontSize: 13, color: C.gris }}>%</span>
          {dist.length > 1 && <button onClick={() => setDist(dist.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><X size={15} /></button>}
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => setDist([...dist, { area: areas[0], pct: 0 }])} style={{ background: 'none', border: '1px dashed #CBD2D6', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.gris }}>+ Agregar área</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: ok ? C.verde : C.rojo }}>Suma: {suma}% {ok ? '✓' : '— debe ser 100%'}</span>
      </div>
    </div>
  )
}

// ================= FORMULARIO DE GASTO =================
function FormGasto({ tipo, fin, setFin, otsDisponibles, onCerrar }) {
  const cats = tipo === 'fijo' ? CATEGORIAS_FIJO : CATEGORIAS_VAR
  const [f, setF] = useState({ nombre: '', categoria: cats[0], proveedor: '', documento: '', neto: '', conIva: tipo !== 'fijo', vencimiento: hoy(), frecuencia: tipo === 'fijo' ? 'Mensual' : 'Única', estado: 'Pendiente', ot: '', obs: '' })
  const [dist, setDist] = useState([{ area: 'General empresa', pct: 100 }])
  const suma = dist.reduce((a, d) => a + (parseFloat(d.pct) || 0), 0)
  const ok = Math.abs(suma - 100) < 0.01

  function guardar() {
    if (!f.nombre || num(f.neto) <= 0 || !ok) return
    const neto = num(f.neto)
    const g = { id: 'g' + Date.now(), tipo, nombre: f.nombre, categoria: f.categoria, proveedor: f.proveedor, documento: f.documento, neto, iva: f.conIva ? Math.round(neto * 0.19) : 0, vencimiento: f.vencimiento, frecuencia: f.frecuencia, estado: f.estado, ot: f.ot, dist: dist.map(d => ({ area: d.area, pct: parseFloat(d.pct) })), obs: f.obs }
    setFin({ ...fin, gastos: [g, ...fin.gastos] })
    onCerrar()
  }

  return (
    <div style={{ background: '#fff', border: `2px solid ${C.naranja}`, padding: 16, marginBottom: 14 }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>
        Nuevo gasto {tipo === 'fijo' ? 'fijo' : 'variable / compra'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
        <input style={inp} placeholder="Nombre del gasto *" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} />
        <select style={inp} value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })}>{cats.map(c => <option key={c}>{c}</option>)}</select>
        <input style={inp} placeholder="Proveedor" value={f.proveedor} onChange={e => setF({ ...f, proveedor: e.target.value })} />
        <input style={inp} placeholder="Nº documento (factura/boleta)" value={f.documento} onChange={e => setF({ ...f, documento: e.target.value })} />
        <input style={inp} placeholder="Monto neto CLP *" value={f.neto} onChange={e => setF({ ...f, neto: e.target.value })} />
        <label style={{ ...inp, display: 'flex', alignItems: 'center', gap: 6, border: 'none' }}>
          <input type="checkbox" checked={f.conIva} onChange={e => setF({ ...f, conIva: e.target.checked })} /> Aplica IVA 19%
        </label>
        <label style={{ fontSize: 12, color: C.gris }}>Vencimiento
          <input type="date" style={{ ...inp, width: '100%' }} value={f.vencimiento} onChange={e => setF({ ...f, vencimiento: e.target.value })} />
        </label>
        <select style={inp} value={f.frecuencia} onChange={e => setF({ ...f, frecuencia: e.target.value })}>{FRECUENCIAS.map(x => <option key={x}>{x}</option>)}</select>
        <select style={inp} value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })}>{ESTADOS_GASTO.map(x => <option key={x}>{x}</option>)}</select>
        <select style={inp} value={f.ot} onChange={e => setF({ ...f, ot: e.target.value })}>
          <option value="">Sin OT/OC (gasto general)</option>
          {otsDisponibles.map(o => <option key={o}>{o}</option>)}
        </select>
      </div>
      {num(f.neto) > 0 && f.conIva && <div style={{ fontSize: 12, color: C.gris, marginTop: 6 }}>IVA: {clp(num(f.neto) * 0.19)} · Total: {clp(num(f.neto) * 1.19)}</div>}
      {f.ot && <div style={{ fontSize: 12, color: '#8C4519', background: '#F9E9DE', padding: '6px 10px', marginTop: 6 }}>Este gasto se cargará como costo de la {f.ot} además del área.</div>}
      <EditorDistribucion dist={dist} setDist={setDist} plantillas={fin.plantillas} areas={fin.areas} />
      <input style={{ ...inp, width: '100%', marginTop: 8 }} placeholder="Observaciones" value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={guardar} disabled={!ok}
          style={{ background: ok ? C.verde : '#CBD2D6', color: '#fff', border: 'none', padding: '9px 18px', cursor: ok ? 'pointer' : 'not-allowed', fontSize: 13 }}>Guardar gasto</button>
        <button onClick={onCerrar} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
      </div>
    </div>
  )
}

// ================= LISTA DE GASTOS =================
function ListaGastos({ tipo, fin, setFin, otsDisponibles }) {
  const [creando, setCreando] = useState(false)
  const gastos = fin.gastos.filter(g => g.tipo === tipo)

  function duplicarMesSiguiente(g) {
    const d = new Date(g.vencimiento + 'T12:00:00')
    d.setMonth(d.getMonth() + 1)
    setFin({ ...fin, gastos: [{ ...g, id: 'g' + Date.now(), vencimiento: d.toISOString().slice(0, 10), estado: 'Pendiente' }, ...fin.gastos] })
  }

  return (
    <div>
      {!creando && (
        <button onClick={() => setCreando(true)}
          style={{ background: C.naranja, color: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <Plus size={15} /> Nuevo gasto {tipo === 'fijo' ? 'fijo' : 'variable'}
        </button>
      )}
      {creando && <FormGasto tipo={tipo} fin={fin} setFin={setFin} otsDisponibles={otsDisponibles} onCerrar={() => setCreando(false)} />}

      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
              {['Gasto', 'Categoría', 'Proveedor', 'Neto', 'Total', 'Vence', 'Frec.', 'Estado', 'Distribución', ''].map(h => (
                <th key={h} style={{ textAlign: ['Neto', 'Total'].includes(h) ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gastos.map(g => (
              <tr key={g.id} style={{ borderBottom: '1px solid #EEE9DF', verticalAlign: 'top', opacity: g.estado === 'Anulado' ? 0.45 : 1 }}>
                <td style={{ padding: '8px', fontWeight: 500 }}>{g.nombre}{g.ot && <div style={{ fontSize: 11, color: C.naranja, fontFamily: "'JetBrains Mono',monospace" }}>{g.ot}</div>}</td>
                <td style={{ padding: '8px', color: C.gris }}>{g.categoria}</td>
                <td style={{ padding: '8px', color: C.gris }}>{g.proveedor || '—'}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{clp(g.neto)}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{clp(g.neto + g.iva)}</td>
                <td style={{ padding: '8px', color: C.gris, whiteSpace: 'nowrap' }}>{g.vencimiento}</td>
                <td style={{ padding: '8px', color: C.gris, fontSize: 12 }}>{g.frecuencia}</td>
                <td style={{ padding: '8px' }}>
                  <select value={g.estado} onChange={e => setFin({ ...fin, gastos: fin.gastos.map(x => x.id === g.id ? { ...x, estado: e.target.value } : x) })}
                    style={{ border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '3px 6px', background: g.estado === 'Pagado' ? '#E7F2EA' : g.estado === 'Vencido' ? '#F6E0DA' : g.estado === 'Anulado' ? '#EEE' : '#F9E9DE', color: g.estado === 'Pagado' ? C.verde : g.estado === 'Vencido' ? C.rojo : g.estado === 'Anulado' ? C.gris : '#8C4519' }}>
                    {ESTADOS_GASTO.map(x => <option key={x}>{x}</option>)}
                  </select>
                </td>
                <td style={{ padding: '8px', fontSize: 12 }}>{g.dist.map(d => <div key={d.area}>{d.area}: {d.pct}% ({clp((g.neto) * d.pct / 100)})</div>)}</td>
                <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                  <button title="Duplicar al mes siguiente" onClick={() => duplicarMesSiguiente(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gris }}><Copy size={14} /></button>
                  <button title="Eliminar" onClick={() => window.confirm(`¿Eliminar "${g.nombre}"?`) && setFin({ ...fin, gastos: fin.gastos.filter(x => x.id !== g.id) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {gastos.length === 0 && <tr><td colSpan={10} style={{ padding: 16, textAlign: 'center', color: '#9AA0A6' }}>Sin gastos registrados.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ================= PLANTILLAS =================
function Plantillas({ fin, setFin }) {
  const [nombre, setNombre] = useState('')
  const [items, setItems] = useState([{ area: AREAS_GASTO[0], pct: 100 }])
  const suma = items.reduce((a, d) => a + (parseFloat(d.pct) || 0), 0)
  const ok = Math.abs(suma - 100) < 0.01

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Crear plantilla</div>
        <input style={{ ...inp, width: '100%', marginBottom: 8 }} placeholder='Nombre (ej: "SR / Istria 50-50")' value={nombre} onChange={e => setNombre(e.target.value)} />
        <EditorDistribucion dist={items} setDist={setItems} plantillas={[]} areas={fin.areas} />
        <button onClick={() => { if (nombre && ok) { setFin({ ...fin, plantillas: [...fin.plantillas, { id: 'p' + Date.now(), nombre, items: items.map(i => ({ area: i.area, pct: parseFloat(i.pct) })) }] }); setNombre(''); setItems([{ area: AREAS_GASTO[0], pct: 100 }]) } }}
          disabled={!ok || !nombre}
          style={{ background: ok && nombre ? C.naranja : '#CBD2D6', color: '#fff', border: 'none', padding: '9px 18px', cursor: ok && nombre ? 'pointer' : 'not-allowed', fontSize: 13, marginTop: 10 }}>
          Guardar plantilla
        </button>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Plantillas guardadas</div>
        {fin.plantillas.map(p => (
          <div key={p.id} style={{ borderBottom: '1px solid #EEE9DF', padding: '8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.nombre}</div>
              <div style={{ fontSize: 12, color: C.gris }}>{p.items.map(i => `${i.area} ${i.pct}%`).join(' · ')}</div>
            </div>
            <button onClick={() => window.confirm(`¿Eliminar plantilla "${p.nombre}"?`) && setFin({ ...fin, plantillas: fin.plantillas.filter(x => x.id !== p.id) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ================= CRÉDITOS Y LEASING =================
function CreditosLeasing({ fin, setFin }) {
  const [creando, setCreando] = useState(false)
  const [abierta, setAbierta] = useState(null)
  const [f, setF] = useState({ tipo: 'Crédito', institucion: '', montoOriginal: '', inicio: hoy(), nCuotas: '', valorCuota: '', diaVenc: '5', tasa: '', activo: '', obs: '' })
  const [dist, setDist] = useState([{ area: 'General empresa', pct: 100 }])
  const ok = Math.abs(dist.reduce((a, d) => a + (parseFloat(d.pct) || 0), 0) - 100) < 0.01

  function crear() {
    const n = parseInt(f.nCuotas); const vc = num(f.valorCuota)
    if (!f.institucion || !n || !vc || !ok) return
    const [a, m, d] = f.inicio.split('-').map(Number)
    const cuotas = Array.from({ length: n }, (_, i) => {
      const fecha = new Date(a, m - 1 + i, parseInt(f.diaVenc) || d).toISOString().slice(0, 10)
      return { n: i + 1, vencimiento: fecha, capital: null, interes: null, seguro: null, total: vc, estado: 'Pendiente', fechaPago: null }
    })
    const o = { id: 'o' + Date.now(), tipo: f.tipo, institucion: f.institucion, montoOriginal: num(f.montoOriginal) || n * vc, inicio: f.inicio, nCuotas: n, valorCuota: vc, diaVenc: parseInt(f.diaVenc) || 5, tasa: f.tasa, estado: 'Vigente', activo: f.activo, dist: dist.map(x => ({ area: x.area, pct: parseFloat(x.pct) })), obs: f.obs, cuotas }
    setFin({ ...fin, obligaciones: [o, ...fin.obligaciones] })
    setCreando(false)
  }

  function actualizarCuota(oid, n, cambios) {
    setFin({ ...fin, obligaciones: fin.obligaciones.map(o => o.id !== oid ? o : { ...o, cuotas: o.cuotas.map(c => c.n === n ? { ...c, ...cambios } : c) }) })
  }

  return (
    <div>
      {!creando && (
        <button onClick={() => setCreando(true)}
          style={{ background: C.naranja, color: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <Plus size={15} /> Nuevo crédito / leasing
        </button>
      )}
      {creando && (
        <div style={{ background: '#fff', border: `2px solid ${C.naranja}`, padding: 16, marginBottom: 14 }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Nueva obligación financiera</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            <select style={inp} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{TIPOS_OBLIGACION.map(t => <option key={t}>{t}</option>)}</select>
            <input style={inp} placeholder="Banco / institución *" value={f.institucion} onChange={e => setF({ ...f, institucion: e.target.value })} />
            <input style={inp} placeholder="Monto original CLP" value={f.montoOriginal} onChange={e => setF({ ...f, montoOriginal: e.target.value })} />
            <label style={{ fontSize: 12, color: C.gris }}>Primera cuota
              <input type="date" style={{ ...inp, width: '100%' }} value={f.inicio} onChange={e => setF({ ...f, inicio: e.target.value })} />
            </label>
            <input style={inp} placeholder="Nº cuotas *" value={f.nCuotas} onChange={e => setF({ ...f, nCuotas: e.target.value })} />
            <input style={inp} placeholder="Valor cuota CLP *" value={f.valorCuota} onChange={e => setF({ ...f, valorCuota: e.target.value })} />
            <input style={inp} placeholder="Día vencimiento (ej: 5)" value={f.diaVenc} onChange={e => setF({ ...f, diaVenc: e.target.value })} />
            <input style={inp} placeholder="Tasa % (opcional)" value={f.tasa} onChange={e => setF({ ...f, tasa: e.target.value })} />
            <input style={inp} placeholder="Activo asociado (opcional)" value={f.activo} onChange={e => setF({ ...f, activo: e.target.value })} />
          </div>
          <EditorDistribucion dist={dist} setDist={setDist} plantillas={fin.plantillas} areas={fin.areas} />
          <div style={{ fontSize: 12, color: C.gris, marginTop: 8 }}>El calendario de cuotas se genera automáticamente; luego puedes editar capital/interés cuota a cuota y marcar pagos.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={crear} disabled={!ok} style={{ background: ok ? C.verde : '#CBD2D6', color: '#fff', border: 'none', padding: '9px 18px', cursor: ok ? 'pointer' : 'not-allowed', fontSize: 13 }}>Crear con calendario</button>
            <button onClick={() => setCreando(false)} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
          </div>
        </div>
      )}

      {fin.obligaciones.map(o => {
        const pagadas = o.cuotas.filter(c => c.estado === 'Pagada')
        const saldo = o.cuotas.filter(c => c.estado !== 'Pagada').reduce((a, c) => a + c.total, 0)
        const vencidas = o.cuotas.filter(c => c.estado !== 'Pagada' && c.vencimiento < hoy())
        return (
          <div key={o.id} style={{ background: '#fff', border: '1px solid #E2DED4', marginBottom: 14 }}>
            <div onClick={() => setAbierta(abierta === o.id ? null : o.id)} style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15 }}>{o.tipo} · {o.institucion}</div>
                <div style={{ fontSize: 12, color: C.gris, marginTop: 2 }}>
                  {o.activo && `${o.activo} · `}{o.nCuotas} cuotas de {clp(o.valorCuota)} · día {o.diaVenc} · {o.dist.map(d => `${d.area} ${d.pct}%`).join(', ')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Pagadas</div>
                  <div style={{ fontWeight: 600 }}>{pagadas.length}/{o.nCuotas}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Saldo pendiente</div>
                  <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 16, color: C.naranja }}>{clp(saldo)}</div>
                </div>
                {vencidas.length > 0 && <span style={{ background: '#F6E0DA', color: C.rojo, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{vencidas.length} vencida{vencidas.length > 1 ? 's' : ''}</span>}
              </div>
            </div>
            {abierta === o.id && (
              <div style={{ borderTop: '1px solid #EEE9DF', padding: 18, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                      {['Nº', 'Vencimiento', 'Capital', 'Interés', 'Total cuota', 'Estado', 'Fecha pago'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {o.cuotas.map(c => {
                      const vencida = c.estado !== 'Pagada' && c.vencimiento < hoy()
                      return (
                        <tr key={c.n} style={{ borderBottom: '1px solid #EEE9DF', background: vencida ? '#FDF3F0' : 'transparent' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 600 }}>{c.n}</td>
                          <td style={{ padding: '6px 8px', color: vencida ? C.rojo : C.gris }}>{c.vencimiento}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <input value={c.capital ?? ''} placeholder="—" onChange={e => actualizarCuota(o.id, c.n, { capital: e.target.value === '' ? null : num(e.target.value) })} style={{ ...inp, width: 100, padding: '4px 6px' }} />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input value={c.interes ?? ''} placeholder="—" onChange={e => actualizarCuota(o.id, c.n, { interes: e.target.value === '' ? null : num(e.target.value) })} style={{ ...inp, width: 90, padding: '4px 6px' }} />
                          </td>
                          <td style={{ padding: '6px 8px', fontWeight: 600 }}>{clp(c.total)}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <button onClick={() => actualizarCuota(o.id, c.n, c.estado === 'Pagada' ? { estado: 'Pendiente', fechaPago: null } : { estado: 'Pagada', fechaPago: hoy() })}
                              style={{ background: c.estado === 'Pagada' ? '#E7F2EA' : vencida ? '#F6E0DA' : '#F9E9DE', color: c.estado === 'Pagada' ? C.verde : vencida ? C.rojo : '#8C4519', border: 'none', padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              {c.estado === 'Pagada' ? '✓ Pagada' : vencida ? 'Vencida' : 'Pendiente'}
                            </button>
                          </td>
                          <td style={{ padding: '6px 8px', color: C.gris, fontSize: 12 }}>{c.fechaPago || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{ marginTop: 12, textAlign: 'right' }}>
                  <button onClick={() => window.confirm(`¿Eliminar ${o.tipo} ${o.institucion} completo?`) && setFin({ ...fin, obligaciones: fin.obligaciones.filter(x => x.id !== o.id) })}
                    style={{ background: 'none', border: `1px solid ${C.rojo}`, color: C.rojo, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
                    <Trash2 size={12} style={{ verticalAlign: -2 }} /> Eliminar obligación
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ================= RESUMEN MENSUAL =================
export function calcularResumenFin(fin, mes) {
  const gastosMes = fin.gastos.filter(g => mesDe(g.vencimiento) === mes && g.estado !== 'Anulado')
  const fijos = gastosMes.filter(g => g.tipo === 'fijo').reduce((a, g) => a + g.neto, 0)
  const variables = gastosMes.filter(g => g.tipo === 'variable').reduce((a, g) => a + g.neto, 0)
  const porArea = {}
  gastosMes.forEach(g => g.dist.forEach(d => { porArea[d.area] = (porArea[d.area] || 0) + g.neto * d.pct / 100 }))
  const cuotasMes = fin.obligaciones.flatMap(o => o.cuotas.filter(c => mesDe(c.vencimiento) === mes))
  const totalCuotasMes = cuotasMes.reduce((a, c) => a + c.total, 0)
  const interesMes = cuotasMes.reduce((a, c) => a + (c.interes || 0), 0)
  const cuotasVencidas = fin.obligaciones.flatMap(o => o.cuotas.filter(c => c.estado !== 'Pagada' && c.vencimiento < hoy()))
  const deudaVigente = fin.obligaciones.reduce((a, o) => a + o.cuotas.filter(c => c.estado !== 'Pagada').reduce((x, c) => x + c.total, 0), 0)
  return { fijos, variables, porArea, cuotasMes, totalCuotasMes, interesMes, cuotasVencidas, deudaVigente, salidaCaja: fijos + variables + totalCuotasMes }
}

function ResumenMensual({ fin }) {
  const [mes, setMes] = useState(hoy().slice(0, 7))
  const r = useMemo(() => calcularResumenFin(fin, mes), [fin, mes])

  const kpi = (label, valor, color) => (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 14, flex: '1 1 170px' }}>
      <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 21, fontWeight: 600, color: color || C.carbon, whiteSpace: 'nowrap' }}>{valor}</div>
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)} style={inp} />
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {kpi('Gastos fijos del mes', clp(r.fijos))}
        {kpi('Gastos variables del mes', clp(r.variables))}
        {kpi('Cuotas créditos/leasing', clp(r.totalCuotasMes), C.naranja)}
        {kpi('Salida de caja proyectada', clp(r.salidaCaja), C.rojo)}
        {kpi('Deuda vigente total', clp(r.deudaVigente), C.carbon)}
        {kpi('Cuotas vencidas', r.cuotasVencidas.length, r.cuotasVencidas.length > 0 ? C.rojo : C.verde)}
      </div>
      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Gastos del mes por área</div>
        {Object.keys(r.porArea).length === 0 ? <div style={{ fontSize: 13, color: '#9AA0A6' }}>Sin gastos este mes.</div> : (
          Object.entries(r.porArea).sort((a, b) => b[1] - a[1]).map(([area, monto]) => {
            const max = Math.max(...Object.values(r.porArea))
            return (
              <div key={area} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 13, width: 170 }}>{area}</span>
                <div style={{ flex: 1, height: 8, background: '#EEE9DF' }}>
                  <div style={{ width: `${(monto / max) * 100}%`, height: '100%', background: C.naranja }} />
                </div>
                <span style={{ fontSize: 13, width: 110, textAlign: 'right', fontWeight: 600 }}>{clp(monto)}</span>
              </div>
            )
          })
        )}
        {r.interesMes > 0 && <div style={{ fontSize: 12, color: C.gris, marginTop: 10 }}>Del pago de cuotas del mes, {clp(r.interesMes)} corresponde a intereses (gasto financiero) según el desglose ingresado.</div>}
      </div>
    </div>
  )
}

// ================= MÓDULO PRINCIPAL =================
export default function FinanzasModule({ otsDisponibles = [], fin: finExt, setFin: setFinExt }) {
  const [finInt, setFinInt] = useState(FIN_SEED)
  const fin = finExt ?? finInt
  const setFin = setFinExt ?? setFinInt

  const tabs = [
    { id: 'resumen', label: 'Resumen mensual', icono: <BarChart3 size={13} /> },
    { id: 'fijos', label: 'Gastos fijos', icono: <ReceiptText size={13} /> },
    { id: 'variables', label: 'Gastos variables', icono: <ReceiptText size={13} /> },
    { id: 'plantillas', label: 'Reglas de distribución', icono: <PieIcon size={13} /> },
    { id: 'creditos', label: 'Créditos y Leasing', icono: <Landmark size={13} /> },
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
      {tab === 'resumen' && <ResumenMensual fin={fin} />}
      {tab === 'fijos' && <ListaGastos tipo="fijo" fin={fin} setFin={setFin} otsDisponibles={otsDisponibles} />}
      {tab === 'variables' && <ListaGastos tipo="variable" fin={fin} setFin={setFin} otsDisponibles={otsDisponibles} />}
      {tab === 'plantillas' && <Plantillas fin={fin} setFin={setFin} />}
      {tab === 'creditos' && <CreditosLeasing fin={fin} setFin={setFin} />}
    </div>
  )
}
