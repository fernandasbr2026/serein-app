import React, { useState, useMemo } from 'react'
import { Plus, Trash2, X, ShoppingCart, ClipboardList, Factory, CheckCircle2, AlertTriangle, Paperclip, Settings2, Filter } from 'lucide-react'

const C = { naranja: '#D2642F', carbon: '#161616', verde: '#3D7A4E', rojo: '#B5432E', gris: '#7A8288', azul: '#1D5A73' }
const clp = n => '$' + Math.round(n).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const hoy = () => new Date().toISOString().slice(0, 10)
const inp = { padding: '7px 9px', border: '1px solid #CBD2D6', fontSize: 13, boxSizing: 'border-box' }

const AREAS_COMPRA = ['Santa Rosa', 'Istria', 'Producción / Planta', 'Proyectos', 'Administración', 'Comercial', 'Otra']
const CATEGORIAS = ['Pintura', 'Granalla', 'Diésel', 'EPP', 'Herramientas', 'Repuestos', 'Transporte', 'Materiales menores', 'Arriendo de equipo', 'Mantención', 'Otro']
const TIPOS_DOC = ['Factura', 'Boleta', 'Guía', 'Comprobante', 'Sin documento', 'Otro']
const ESTADOS = ['Pendiente de revisión', 'Aprobada', 'Observada', 'Rechazada', 'Corregida por Gerencia', 'Contabilizada', 'Pagada']
const TIPOS_ASIG = ['Área completa', 'OT/OC específica', 'Proyecto específico', 'Varias OT/OC', 'Varias áreas', 'Pendiente de revisión por Gerencia']

// Configuración de permisos (spec: sí/no editables por gerencia)
export const CONFIG_COMPRAS_DEFAULT = {
  supervisorIngresaMonto: true,     // puede escribirlo si viene en el documento
  supervisorVeMontoDespues: false,  // no lo ve tras guardar
  supervisorEditaMonto: false,      // no puede editarlo
}

// ===== DATOS DE PRUEBA (según especificación — Supervisor Daniel Matus) =====
export const COMPRAS_OP_SEED = [
  {
    id: 'cp1', fecha: '2026-07-06', supervisor: 'Daniel Matus', area: 'Santa Rosa',
    proveedor: 'Ferretería Industrial', tipoDoc: 'Boleta', numDoc: '10245', categoria: 'EPP',
    descripcion: 'Guantes y antiparras', cantidad: '10', unidad: 'unidades', obs: '',
    adjunto: null, neto: 68500, aplicaIva: false,   // boleta: no contempla IVA
    asignacion: { tipo: 'Área completa', items: [{ ref: 'Producción / Planta', pct: 100 }] },
    estado: 'Pendiente de revisión', obsGerencia: '',
  },
  {
    id: 'cp2', fecha: '2026-07-06', supervisor: 'Daniel Matus', area: 'Santa Rosa',
    proveedor: 'Pinturas Industriales', tipoDoc: 'Factura', numDoc: 'F-8821', categoria: 'Pintura',
    descripcion: 'Pintura para estructura', cantidad: '8', unidad: 'galones', obs: '',
    adjunto: 'foto_factura_8821.jpg', neto: 412000, aplicaIva: true,
    asignacion: { tipo: 'OT/OC específica', items: [{ ref: 'OT-385', pct: 100 }] },
    estado: 'Pendiente de revisión', obsGerencia: '',
  },
  {
    id: 'cp3', fecha: '2026-07-06', supervisor: 'Daniel Matus', area: 'Santa Rosa',
    proveedor: 'Combustibles', tipoDoc: 'Guía', numDoc: 'G-3310', categoria: 'Diésel',
    descripcion: 'Diésel para operación', cantidad: '120', unidad: 'litros', obs: '',
    adjunto: null, neto: null, aplicaIva: true,
    asignacion: { tipo: 'Varias OT/OC', items: [{ ref: 'OT-385', pct: 50 }, { ref: 'OT-302', pct: 50 }] },
    estado: 'Pendiente de revisión', obsGerencia: '',
  },
]

function ChipEstado({ e }) {
  const map = {
    'Pendiente de revisión': ['#F9E9DE', '#8C4519'], 'Aprobada': ['#E7F2EA', C.verde],
    'Observada': ['#FDF3D7', '#8A6A00'], 'Rechazada': ['#F6E0DA', C.rojo],
    'Corregida por Gerencia': ['#E7EEF2', C.azul], 'Contabilizada': ['#E9E7F2', '#5B4E8C'], 'Pagada': ['#E7F2EA', C.verde],
  }
  const [bg, fg] = map[e] || ['#EEE', '#666']
  return <span style={{ background: bg, color: fg, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{e}</span>
}

// Cálculo de IVA y total bruto a partir del neto
const ivaDe = c => (c.neto != null && c.aplicaIva) ? Math.round(c.neto * 0.19) : 0
const totalDe = c => c.neto != null ? c.neto + ivaDe(c) : null

// ===== VISTA SUPERVISOR: MIS OT/OC/PROYECTOS (información limitada) =====
function MisOTs({ ots, proyectos, mo, comprasOp, planta }) {
  const otsPlanta = ots.filter(o => o.area === planta)
  const asistDe = otNum => mo ? [...new Set(mo.asistencias.filter(a => a.ots.includes(otNum)).map(a => a.fecha))].length : 0
  const comprasDe = ref => comprasOp.filter(c => c.asignacion.items.some(i => i.ref === ref)).length

  return (
    <div>
      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18, marginBottom: 14, overflowX: 'auto' }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>OT/OC de {planta} · vista operativa</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
              {['OT/OC', 'Cliente', 'Descripción', 'Estado', 'Días c/asistencia', 'Compras'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {otsPlanta.map(o => (
              <tr key={o.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
                <td style={{ padding: '7px 8px', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 12 }}>{o.numero}</td>
                <td style={{ padding: '7px 8px', fontWeight: 500 }}>{o.cliente}</td>
                <td style={{ padding: '7px 8px', color: C.gris }}>{o.esquema}</td>
                <td style={{ padding: '7px 8px' }}><span style={{ background: '#EEF1F4', padding: '2px 8px', fontSize: 12 }}>{o.estado}</span></td>
                <td style={{ padding: '7px 8px', textAlign: 'center' }}>{asistDe(o.numero)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'center' }}>{comprasDe(o.numero)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {proyectos?.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Proyectos activos · vista operativa</div>
          {proyectos.map(p => (
            <div key={p.id} style={{ borderBottom: '1px solid #EEE9DF', padding: '7px 0', fontSize: 13, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <span><b>{p.nombre}</b> · {p.cliente}</span>
              <span style={{ color: C.gris }}>avance {p.avance}% · {comprasDe(p.nombre)} compra{comprasDe(p.nombre) !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12, color: C.gris, marginTop: 10 }}>Vista sin información financiera: los precios, montos y márgenes solo son visibles para Gerencia.</div>
    </div>
  )
}

// ===== FORMULARIO REGISTRAR COMPRA =====
function FormCompra({ config, ots, proyectos, planta, usuario, onGuardar }) {
  const [f, setF] = useState({
    fecha: hoy(), area: planta || AREAS_COMPRA[0], proveedor: '', tipoDoc: 'Factura', numDoc: '',
    categoria: CATEGORIAS[0], descripcion: '', cantidad: '', unidad: '', obs: '', neto: '', aplicaIva: true, adjunto: null,
  })
  const [tipoAsig, setTipoAsig] = useState('Área completa')
  const [items, setItems] = useState([{ ref: 'Producción / Planta', pct: 100 }])
  const [guardado, setGuardado] = useState(false)

  const refsOT = ots.map(o => o.numero)
  const refsProy = (proyectos || []).map(p => p.nombre)

  function cambiarTipo(t) {
    setTipoAsig(t)
    if (t === 'Área completa') setItems([{ ref: AREAS_COMPRA[0], pct: 100 }])
    else if (t === 'OT/OC específica') setItems([{ ref: refsOT[0] || '', pct: 100 }])
    else if (t === 'Proyecto específico') setItems([{ ref: refsProy[0] || '', pct: 100 }])
    else if (t === 'Varias OT/OC') setItems([{ ref: refsOT[0] || '', pct: 50 }, { ref: refsOT[1] || '', pct: 50 }])
    else if (t === 'Varias áreas') setItems([{ ref: 'Santa Rosa', pct: 50 }, { ref: 'Istria', pct: 50 }])
    else setItems([])
  }

  function agregarItem() {
    const nuevos = [...items, { ref: '', pct: 0 }]
    const pctIgual = Math.round(10000 / nuevos.length) / 100
    setItems(nuevos.map(i => ({ ...i, pct: pctIgual })))
  }

  const opciones = tipoAsig.includes('OT') ? refsOT : tipoAsig.includes('Proyecto') ? refsProy : AREAS_COMPRA
  const suma = items.reduce((a, i) => a + (parseFloat(i.pct) || 0), 0)
  const asigOk = tipoAsig === 'Pendiente de revisión por Gerencia' || (items.length > 0 && Math.abs(suma - 100) < 0.02 && items.every(i => i.ref))

  function guardar() {
    if (!f.proveedor || !f.descripcion || !asigOk) return
    onGuardar({
      id: 'cp' + Date.now(), fecha: f.fecha, supervisor: usuario, area: f.area,
      proveedor: f.proveedor, tipoDoc: f.tipoDoc, numDoc: f.numDoc, categoria: f.categoria,
      descripcion: f.descripcion, cantidad: f.cantidad, unidad: f.unidad, obs: f.obs,
      adjunto: f.adjunto,
      neto: config.supervisorIngresaMonto && num(f.neto) > 0 ? num(f.neto) : null,
      aplicaIva: f.aplicaIva,
      asignacion: { tipo: tipoAsig, items: items.map(i => ({ ref: i.ref, pct: parseFloat(i.pct) })) },
      estado: 'Pendiente de revisión', obsGerencia: '',
    })
    setF({ ...f, proveedor: '', numDoc: '', descripcion: '', cantidad: '', unidad: '', obs: '', neto: '', aplicaIva: true, adjunto: null })
    setGuardado(true); setTimeout(() => setGuardado(false), 4000)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
        <label style={{ fontSize: 12, color: C.gris }}>Fecha de compra
          <input type="date" style={{ ...inp, width: '100%', marginTop: 4 }} value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} />
        </label>
        <label style={{ fontSize: 12, color: C.gris }}>Área
          <select style={{ ...inp, width: '100%', marginTop: 4 }} value={f.area} onChange={e => setF({ ...f, area: e.target.value })}>
            {AREAS_COMPRA.map(a => <option key={a}>{a}</option>)}
          </select>
        </label>
        <input style={inp} placeholder="Proveedor *" value={f.proveedor} onChange={e => setF({ ...f, proveedor: e.target.value })} />
        <select style={inp} value={f.tipoDoc} onChange={e => setF({ ...f, tipoDoc: e.target.value })}>{TIPOS_DOC.map(t => <option key={t}>{t}</option>)}</select>
        <input style={inp} placeholder="Nº documento" value={f.numDoc} onChange={e => setF({ ...f, numDoc: e.target.value })} />
        <select style={inp} value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })}>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select>
        <input style={{ ...inp, gridColumn: 'span 2' }} placeholder="Descripción de la compra *" value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} />
        <input style={inp} placeholder="Cantidad" value={f.cantidad} onChange={e => setF({ ...f, cantidad: e.target.value })} />
        <input style={inp} placeholder="Unidad (lt, kg, un…)" value={f.unidad} onChange={e => setF({ ...f, unidad: e.target.value })} />
        {config.supervisorIngresaMonto && (
          <input style={inp} placeholder="Monto NETO (si viene en el documento)" value={f.neto} onChange={e => setF({ ...f, neto: e.target.value })} />
        )}
        {config.supervisorIngresaMonto && (
          <button type="button" onClick={() => setF({ ...f, aplicaIva: !f.aplicaIva })}
            style={{ ...inp, cursor: 'pointer', background: f.aplicaIva ? '#fff' : '#F9E9DE', color: f.aplicaIva ? C.carbon : '#8C4519', fontWeight: 600, textAlign: 'left' }}>
            {f.aplicaIva ? '✓ Con IVA 19% (factura)' : '✕ No contempla IVA (boleta u otro)'}
          </button>
        )}
        <label style={{ ...inp, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: C.gris }}>
          <Paperclip size={14} /> {f.adjunto || 'Adjuntar foto/comprobante'}
          <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => setF({ ...f, adjunto: e.target.files?.[0]?.name || null })} />
        </label>
      </div>

      {config.supervisorIngresaMonto && num(f.neto) > 0 && (
        <div style={{ fontSize: 13, background: '#F7F4EE', padding: '8px 12px', marginTop: 10, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <span>Neto: <b>{clp(num(f.neto))}</b></span>
          <span>IVA {f.aplicaIva ? '19%' : '(no aplica)'}: <b>{clp(f.aplicaIva ? Math.round(num(f.neto) * 0.19) : 0)}</b></span>
          <span>Total bruto: <b style={{ color: C.naranja }}>{clp(f.aplicaIva ? num(f.neto) + Math.round(num(f.neto) * 0.19) : num(f.neto))}</b></span>
        </div>
      )}

      {/* ASIGNACIÓN */}
      <div style={{ background: '#FAF7F3', padding: 12, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.gris, textTransform: 'uppercase', marginBottom: 8 }}>¿A dónde corresponde esta compra?</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {TIPOS_ASIG.map(t => (
            <button key={t} onClick={() => cambiarTipo(t)}
              style={{ background: tipoAsig === t ? C.carbon : '#fff', color: tipoAsig === t ? '#fff' : C.carbon, border: '1px solid #CBD2D6', padding: '6px 11px', cursor: 'pointer', fontSize: 12 }}>
              {t}
            </button>
          ))}
        </div>
        {tipoAsig === 'Pendiente de revisión por Gerencia' ? (
          <div style={{ fontSize: 13, color: '#8C4519' }}>Gerencia asignará esta compra después. Puedes guardarla igual.</div>
        ) : (
          <>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <select value={it.ref} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, ref: e.target.value } : x))} style={{ ...inp, flex: 1 }}>
                  <option value="">— seleccionar —</option>
                  {opciones.map(o => <option key={o}>{o}</option>)}
                </select>
                <input type="number" value={it.pct} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, pct: e.target.value } : x))} style={{ ...inp, width: 76, textAlign: 'right' }} />
                <span style={{ fontSize: 13, color: C.gris }}>%</span>
                {items.length > 1 && <button onClick={() => setItems(items.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><X size={15} /></button>}
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {(tipoAsig === 'Varias OT/OC' || tipoAsig === 'Varias áreas') && (
                <button onClick={agregarItem} style={{ background: 'none', border: '1px dashed #CBD2D6', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.gris }}>+ Agregar (reparte en partes iguales)</button>
              )}
              <span style={{ fontSize: 13, fontWeight: 700, color: asigOk ? C.verde : C.rojo, marginLeft: 'auto' }}>Suma: {suma.toFixed(2).replace('.00', '')}% {asigOk ? '✓' : '— debe ser 100%'}</span>
            </div>
          </>
        )}
      </div>

      <textarea placeholder="Observaciones" value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} rows={2} style={{ ...inp, width: '100%', marginTop: 10, resize: 'vertical' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <button onClick={guardar} disabled={!asigOk}
          style={{ background: asigOk ? C.naranja : '#CBD2D6', color: '#fff', border: 'none', padding: '10px 22px', cursor: asigOk ? 'pointer' : 'not-allowed', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Guardar compra
        </button>
        {guardado && <span style={{ color: C.verde, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={15} /> Compra registrada — quedó pendiente de revisión por Gerencia</span>}
      </div>
      {!config.supervisorVeMontoDespues && config.supervisorIngresaMonto && (
        <div style={{ fontSize: 12, color: '#8C4519', background: '#F9E9DE', padding: '6px 10px', marginTop: 10 }}>
          El monto que ingreses es solo dato de registro: después de guardar no será visible para ti, solo para Gerencia.
        </div>
      )}
    </div>
  )
}

// ===== MIS COMPRAS (supervisor, sin montos según config) =====
function MisCompras({ comprasOp, usuario, config }) {
  const mias = comprasOp.filter(c => c.supervisor === usuario)
  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
            {['Fecha', 'Proveedor', 'Categoría', 'Asignación', 'Doc.', config.supervisorVeMontoDespues ? 'Monto' : null, 'Estado', 'Obs. Gerencia'].filter(Boolean).map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {mias.map(c => (
            <tr key={c.id} style={{ borderBottom: '1px solid #EEE9DF', verticalAlign: 'top' }}>
              <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>{c.fecha}</td>
              <td style={{ padding: '7px 8px', fontWeight: 500 }}>{c.proveedor}<div style={{ fontSize: 11, color: C.gris }}>{c.descripcion}</div></td>
              <td style={{ padding: '7px 8px' }}>{c.categoria}</td>
              <td style={{ padding: '7px 8px', fontSize: 12 }}>{c.asignacion.tipo === 'Pendiente de revisión por Gerencia' ? <span style={{ color: '#8C4519' }}>Pendiente</span> : c.asignacion.items.map(i => `${i.ref} ${i.pct}%`).join(' · ')}</td>
              <td style={{ padding: '7px 8px', fontSize: 12, color: C.gris }}>{c.tipoDoc}{c.numDoc && ` ${c.numDoc}`}{c.adjunto && <span title={c.adjunto}> 📎</span>}</td>
              {config.supervisorVeMontoDespues && <td style={{ padding: '7px 8px' }}>{c.neto != null ? clp(totalDe(c)) : '—'}</td>}
              <td style={{ padding: '7px 8px' }}><ChipEstado e={c.estado} /></td>
              <td style={{ padding: '7px 8px', fontSize: 12, color: c.obsGerencia ? '#8A6A00' : C.gris }}>{c.obsGerencia || '—'}</td>
            </tr>
          ))}
          {mias.length === 0 && <tr><td colSpan={8} style={{ padding: 16, textAlign: 'center', color: '#9AA0A6' }}>Aún no has registrado compras.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ===== VISTA GERENCIA: revisión, filtros, totales y alertas =====
function RevisionGerencia({ comprasOp, setComprasOp }) {
  const [fEstado, setFEstado] = useState('Todos')
  const [fArea, setFArea] = useState('Todas')
  const [fTexto, setFTexto] = useState('')

  const filtradas = comprasOp.filter(c =>
    (fEstado === 'Todos' || c.estado === fEstado) &&
    (fArea === 'Todas' || c.area === fArea || c.asignacion.items.some(i => i.ref === fArea)) &&
    (fTexto === '' || (c.proveedor + c.descripcion + c.supervisor + c.asignacion.items.map(i => i.ref).join(' ')).toLowerCase().includes(fTexto.toLowerCase()))
  )

  const upd = (id, cambios) => setComprasOp(cs => cs.map(c => c.id === id ? { ...c, ...cambios } : c))

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <Filter size={15} color={C.gris} />
        <select value={fEstado} onChange={e => setFEstado(e.target.value)} style={inp}>
          <option>Todos</option>{ESTADOS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={fArea} onChange={e => setFArea(e.target.value)} style={inp}>
          <option>Todas</option>{AREAS_COMPRA.map(a => <option key={a}>{a}</option>)}
        </select>
        <input style={{ ...inp, flex: '1 1 180px' }} placeholder="Buscar proveedor, OT, supervisor…" value={fTexto} onChange={e => setFTexto(e.target.value)} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
              {['Fecha', 'Supervisor', 'Proveedor / Descripción', 'Categoría', 'Asignación', 'Neto / IVA / Total', 'Estado', 'Obs. Gerencia', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #EEE9DF', verticalAlign: 'top' }}>
                <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>{c.fecha}</td>
                <td style={{ padding: '7px 8px', fontSize: 12 }}>{c.supervisor}</td>
                <td style={{ padding: '7px 8px', fontWeight: 500 }}>{c.proveedor}<div style={{ fontSize: 11, color: C.gris }}>{c.descripcion} {c.cantidad && `· ${c.cantidad} ${c.unidad}`} {c.adjunto && '📎'}</div></td>
                <td style={{ padding: '7px 8px' }}>
                  <select value={c.categoria} onChange={e => upd(c.id, { categoria: e.target.value })} style={{ ...inp, padding: '3px 5px', fontSize: 12 }}>
                    {CATEGORIAS.map(x => <option key={x}>{x}</option>)}
                  </select>
                </td>
                <td style={{ padding: '7px 8px', fontSize: 12 }}>
                  {c.asignacion.tipo === 'Pendiente de revisión por Gerencia'
                    ? <span style={{ color: C.rojo, fontWeight: 600 }}>⚠ Sin asignar</span>
                    : c.asignacion.items.map((i, ix) => (
                      <div key={ix} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 2 }}>
                        <span>{i.ref}</span>
                        <input value={i.pct} onChange={e => upd(c.id, { asignacion: { ...c.asignacion, items: c.asignacion.items.map((x, j) => j === ix ? { ...x, pct: parseFloat(e.target.value) || 0 } : x) }, estado: 'Corregida por Gerencia' })}
                          style={{ ...inp, width: 52, padding: '2px 4px', fontSize: 12, textAlign: 'right' }} />%
                      </div>
                    ))}
                </td>
                <td style={{ padding: '7px 8px' }}>
                  <input value={c.neto ?? ''} placeholder="neto"
                    onChange={e => upd(c.id, { neto: e.target.value === '' ? null : num(e.target.value) })}
                    style={{ ...inp, width: 92, padding: '4px 6px', fontStyle: c.neto == null ? 'italic' : 'normal' }} />
                  <div onClick={() => upd(c.id, { aplicaIva: !c.aplicaIva })} title="Tocar para cambiar"
                    style={{ fontSize: 11, cursor: 'pointer', marginTop: 3, color: c.aplicaIva ? C.gris : '#8C4519', fontWeight: 600 }}>
                    {c.aplicaIva ? `+IVA ${clp(ivaDe(c))}` : 'sin IVA ✕'}
                  </div>
                  {c.neto != null && <div style={{ fontSize: 12, fontWeight: 700, color: C.naranja, marginTop: 2 }}>{clp(totalDe(c))}</div>}
                </td>
                <td style={{ padding: '7px 8px' }}>
                  <select value={c.estado} onChange={e => upd(c.id, { estado: e.target.value })}
                    style={{ border: '1px solid #E2DED4', padding: '3px 5px', fontSize: 11, cursor: 'pointer', background: '#fff' }}>
                    {ESTADOS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{ padding: '7px 8px' }}>
                  <input value={c.obsGerencia} placeholder="—" onChange={e => upd(c.id, { obsGerencia: e.target.value })} style={{ ...inp, width: 130, padding: '4px 6px', fontSize: 12 }} />
                </td>
                <td style={{ padding: '7px 4px' }}>
                  <button onClick={() => window.confirm('¿Eliminar esta compra?') && setComprasOp(cs => cs.filter(x => x.id !== c.id))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {filtradas.length === 0 && <tr><td colSpan={9} style={{ padding: 16, textAlign: 'center', color: '#9AA0A6' }}>Sin compras con esos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TotalesAlertas({ comprasOp, config, setConfig }) {
  const activas = comprasOp.filter(c => c.estado !== 'Rechazada')
  const porRef = {}
  activas.forEach(c => (c.neto != null) && c.asignacion.items.forEach(i => { porRef[i.ref] = (porRef[i.ref] || 0) + totalDe(c) * i.pct / 100 }))
  const totalMes = activas.filter(c => c.fecha.startsWith(hoy().slice(0, 7)) && c.neto != null).reduce((a, c) => a + totalDe(c), 0)

  const alertas = [
    ['Pendientes de aprobación', comprasOp.filter(c => c.estado === 'Pendiente de revisión').length],
    ['Sin documento', comprasOp.filter(c => c.tipoDoc === 'Sin documento').length],
    ['Sin monto', comprasOp.filter(c => c.neto == null && c.estado !== 'Rechazada').length],
    ['Asignación pendiente', comprasOp.filter(c => c.asignacion.tipo === 'Pendiente de revisión por Gerencia').length],
    ['Observadas', comprasOp.filter(c => c.estado === 'Observada').length],
  ]

  const toggle = k => setConfig({ ...config, [k]: !config[k] })

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 14, flex: '1 1 170px' }}>
          <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Total compras del mes (bruto)</div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 600, color: C.naranja }}>{clp(totalMes)}</div>
        </div>
        {alertas.map(([l, n]) => (
          <div key={l} style={{ background: '#fff', border: '1px solid #E2DED4', padding: 14, flex: '1 1 150px' }}>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{l}</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 600, color: n > 0 ? C.rojo : C.verde }}>{n}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18, marginBottom: 14 }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Total bruto por área / OT / proyecto (montos ingresados)</div>
        {Object.keys(porRef).length === 0 ? <div style={{ fontSize: 13, color: '#9AA0A6' }}>Sin montos ingresados aún.</div> :
          Object.entries(porRef).sort((a, b) => b[1] - a[1]).map(([ref, m]) => (
            <div key={ref} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #EEE9DF', padding: '6px 0', fontSize: 13 }}>
              <span style={{ fontFamily: ref.startsWith('OT') ? "'JetBrains Mono',monospace" : 'inherit', fontWeight: 600 }}>{ref}</span>
              <b>{clp(m)}</b>
            </div>
          ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Settings2 size={15} /> Configuración de permisos del Supervisor
        </div>
        <div style={{ fontSize: 12, color: C.gris, marginBottom: 10 }}>Solo Gerencia ve y cambia estos permisos.</div>
        {[['supervisorIngresaMonto', 'Supervisor puede registrar compra con monto'],
          ['supervisorVeMontoDespues', 'Supervisor puede ver el monto después de guardar'],
          ['supervisorEditaMonto', 'Supervisor puede editar el monto']].map(([k, l]) => (
          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '6px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={config[k]} onChange={() => toggle(k)} /> {l}
            <span style={{ color: config[k] ? C.verde : C.rojo, fontWeight: 600 }}>{config[k] ? 'Sí' : 'No'}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

// ===== MÓDULO PRINCIPAL =====
export default function ComprasOperativasModule({ esGerencia, planta = null, usuario = 'Daniel Matus', ots = [], proyectos = [], mo = null, comprasOp: extC, setComprasOp: extSet, config: extCfg, setConfig: extSetCfg }) {
  const [intC, setIntC] = useState(COMPRAS_OP_SEED)
  const [intCfg, setIntCfg] = useState(CONFIG_COMPRAS_DEFAULT)
  const comprasOp = extC ?? intC
  const setComprasOp = extSet ?? setIntC
  const config = extCfg ?? intCfg
  const setConfig = extSetCfg ?? setIntCfg

  const tabs = esGerencia ? [
    { id: 'revision', label: 'Todas las compras', icono: <ClipboardList size={13} /> },
    { id: 'totales', label: 'Totales, alertas y permisos', icono: <Settings2 size={13} /> },
    { id: 'registrar', label: 'Registrar compra', icono: <Plus size={13} /> },
  ] : [
    { id: 'registrar', label: 'Registrar compra', icono: <Plus size={13} /> },
    { id: 'mias', label: 'Mis compras', icono: <ShoppingCart size={13} /> },
    { id: 'misots', label: 'Mis OT/OC/Proyectos', icono: <Factory size={13} /> },
  ]
  const [tab, setTab] = useState(tabs[0].id)

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
      {tab === 'registrar' && <FormCompra config={config} ots={esGerencia ? ots : ots.filter(o => o.area === planta)} proyectos={proyectos} planta={planta} usuario={usuario} onGuardar={c => setComprasOp(cs => [c, ...cs])} />}
      {tab === 'mias' && !esGerencia && <MisCompras comprasOp={comprasOp} usuario={usuario} config={config} />}
      {tab === 'misots' && !esGerencia && <MisOTs ots={ots} proyectos={proyectos} mo={mo} comprasOp={comprasOp} planta={planta} />}
      {tab === 'revision' && esGerencia && <RevisionGerencia comprasOp={comprasOp} setComprasOp={setComprasOp} />}
      {tab === 'totales' && esGerencia && <TotalesAlertas comprasOp={comprasOp} config={config} setConfig={setConfig} />}
    </div>
  )
}
