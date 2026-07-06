import React, { useState, useMemo } from 'react'
import { Plus, Trash2, X, FileText, TrendingUp, ArrowRightCircle, ChevronDown, ChevronUp } from 'lucide-react'

const C = { naranja: '#D2642F', carbon: '#161616', verde: '#3D7A4E', rojo: '#B5432E', gris: '#7A8288' }
const clp = n => '$' + Math.round(n).toLocaleString('es-CL')
const num = s => { const v = parseFloat(String(s).replace(/[^\d.]/g, '')); return isNaN(v) ? 0 : v }
const hoy = () => new Date().toISOString().slice(0, 10)
const inp = { padding: '7px 9px', border: '1px solid #CBD2D6', fontSize: 13, boxSizing: 'border-box' }

const ESTADOS_COT = ['Borrador', 'Enviada', 'Aprobada', 'Rechazada', 'Vencida']
const UNIDADES = ['m²', 'unidad', 'global', 'ml', 'kg', 'hr']

// Partidas típicas del rubro para agregar rápido
const PARTIDAS_TIPICAS = [
  { desc: 'Granallado SSPC-SP6 Comercial', unidad: 'm²' },
  { desc: 'Granallado SSPC-SP10 Casi blanco', unidad: 'm²' },
  { desc: 'Esquema epóxico 2 manos (250 µm)', unidad: 'm²' },
  { desc: 'Esquema zinc + epóxico + poliuretano', unidad: 'm²' },
  { desc: 'Pintura intumescente', unidad: 'm²' },
  { desc: 'Mortero ignífugo', unidad: 'm²' },
  { desc: 'Fabricación estructura', unidad: 'kg' },
  { desc: 'Montaje en terreno', unidad: 'global' },
  { desc: 'Movilización y transporte', unidad: 'global' },
]

export const COT_SEED = [
  {
    id: 'cot1', numero: 'COT-2026-201', fecha: '2026-07-01', validezDias: 30,
    cliente: 'Viman', area: 'Santa Rosa', estado: 'Aprobada', obs: 'Basada en tu COT 772 real',
    items: [
      { desc: 'Granallado SSPC-SP6 Comercial', unidad: 'm²', cant: 260, precio: 9500, costo: 4200 },
      { desc: 'Esquema zinc + epóxico + poliuretano', unidad: 'm²', cant: 260, precio: 11730, costo: 6100 },
    ],
  },
  {
    id: 'cot2', numero: 'COT-2026-202', fecha: hoy(), validezDias: 15,
    cliente: 'Besalco', area: 'Istria', estado: 'Enviada', obs: '',
    items: [
      { desc: 'Granallado SSPC-SP10 Casi blanco', unidad: 'm²', cant: 540, precio: 10800, costo: 5300 },
      { desc: 'Esquema epóxico 2 manos (250 µm)', unidad: 'm²', cant: 540, precio: 9200, costo: 4900 },
    ],
  },
]

const totalVenta = c => c.items.reduce((a, i) => a + i.cant * i.precio, 0)
const totalCosto = c => c.items.reduce((a, i) => a + i.cant * (i.costo || 0), 0)
const m2De = c => c.items.filter(i => i.unidad === 'm²').reduce((a, i) => Math.max(a, i.cant), 0)

function ChipEstado({ estado }) {
  const map = { Borrador: ['#EEF1F4', '#5A6B77'], Enviada: ['#F9E9DE', '#8C4519'], Aprobada: ['#E7F2EA', C.verde], Rechazada: ['#F6E0DA', C.rojo], Vencida: ['#EEE', C.gris] }
  const [bg, fg] = map[estado] || ['#EEE', '#666']
  return <span style={{ background: bg, color: fg, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{estado}</span>
}

// ---------- Referencia histórica $/m² desde OTs reales ----------
function ReferenciaHistorica({ ots }) {
  const refs = useMemo(() => {
    return ots
      .filter(o => o.m2 > 0 && o.ventas.length > 0)
      .map(o => ({ numero: o.numero, cliente: o.cliente, prep: o.preparacion, m2: o.m2, ventaM2: o.ventas.reduce((a, v) => a + v.neta, 0) / o.m2 }))
  }, [ots])
  if (refs.length === 0) return null
  const prom = refs.reduce((a, r) => a + r.ventaM2, 0) / refs.length
  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', borderLeft: `4px solid ${C.naranja}`, padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: C.gris, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <TrendingUp size={13} /> Referencia: tu venta histórica por m² (desde OTs reales)
      </div>
      {refs.map(r => (
        <div key={r.numero} style={{ fontSize: 13, marginBottom: 3 }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, background: C.carbon, color: '#fff', padding: '1px 6px', marginRight: 8 }}>{r.numero}</span>
          {r.cliente} · {r.m2} m² · {r.prep} → <b>{clp(r.ventaM2)}/m²</b>
        </div>
      ))}
      <div style={{ fontSize: 13, marginTop: 6, color: C.naranja }}>Promedio: <b>{clp(prom)}/m²</b></div>
    </div>
  )
}

// ---------- Tarjeta de cotización ----------
function TarjetaCot({ cot, onUpdate, onDelete, onConvertir, yaEsOT }) {
  const [abierta, setAbierta] = useState(false)
  const [addItem, setAddItem] = useState(false)
  const [fi, setFi] = useState({ desc: '', unidad: 'm²', cant: '', precio: '', costo: '' })

  const venta = totalVenta(cot)
  const costo = totalCosto(cot)
  const margen = venta > 0 ? ((venta - costo) / venta) * 100 : 0
  const tieneCostos = costo > 0

  function agregarItem(base) {
    const it = base || { desc: fi.desc, unidad: fi.unidad, cant: num(fi.cant), precio: num(fi.precio), costo: num(fi.costo) }
    if (!it.desc || !it.cant || !it.precio) return
    onUpdate(cot.id, { items: [...cot.items, it] })
    setFi({ desc: '', unidad: 'm²', cant: '', precio: '', costo: '' })
    setAddItem(false)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', marginBottom: 14 }}>
      <div onClick={() => setAbierta(!abierta)} style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13, background: C.carbon, color: '#fff', padding: '3px 9px' }}>{cot.numero}</span>
            <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15 }}>{cot.cliente}</span>
            <ChipEstado estado={cot.estado} />
            {yaEsOT && <span style={{ fontSize: 11, color: C.verde, fontWeight: 600 }}>→ convertida en OT</span>}
          </div>
          <div style={{ fontSize: 12, color: C.gris, marginTop: 4 }}>{cot.area} · {cot.fecha} · válida {cot.validezDias} días · {cot.items.length} partida{cot.items.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Total neto</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 17 }}>{clp(venta)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Margen est.</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 17, color: !tieneCostos ? C.gris : margen >= 30 ? C.verde : margen >= 15 ? '#B8860B' : C.rojo }}>
              {tieneCostos ? margen.toFixed(0) + '%' : '—'}
            </div>
          </div>
          {abierta ? <ChevronUp size={18} color={C.gris} /> : <ChevronDown size={18} color={C.gris} />}
        </div>
      </div>

      {abierta && (
        <div style={{ borderTop: '1px solid #EEE9DF', padding: 18 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: C.gris }}>Estado:
              <select value={cot.estado} onChange={e => onUpdate(cot.id, { estado: e.target.value })} style={{ ...inp, marginLeft: 6 }}>
                {ESTADOS_COT.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
            {cot.estado === 'Aprobada' && !yaEsOT && (
              <button onClick={() => onConvertir(cot)}
                style={{ background: C.verde, color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowRightCircle size={15} /> Convertir en OT
              </button>
            )}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                {['Partida', 'Cant.', 'Unidad', 'Precio unit.', 'Subtotal', 'Costo est. unit.', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: ['Cant.', 'Precio unit.', 'Subtotal', 'Costo est. unit.'].includes(h) ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cot.items.map((it, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #EEE9DF' }}>
                  <td style={{ padding: '7px 8px', fontWeight: 500 }}>{it.desc}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>{it.cant.toLocaleString('es-CL')}</td>
                  <td style={{ padding: '7px 8px', color: C.gris }}>{it.unidad}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>{clp(it.precio)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600 }}>{clp(it.cant * it.precio)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: C.gris }}>{it.costo ? clp(it.costo) : '—'}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right' }}>
                    <button onClick={() => window.confirm(`¿Eliminar partida "${it.desc}"?`) && onUpdate(cot.id, { items: cot.items.filter((_, j) => j !== i) })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!addItem ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <button onClick={() => setAddItem(true)} style={{ background: C.naranja, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Plus size={13} /> Agregar partida
              </button>
            </div>
          ) : (
            <div style={{ background: '#F7F4EE', padding: 12, marginTop: 10 }}>
              <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase', marginBottom: 6 }}>Partidas típicas (toca para usar):</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {PARTIDAS_TIPICAS.map(p => (
                  <button key={p.desc} onClick={() => setFi({ ...fi, desc: p.desc, unidad: p.unidad })}
                    style={{ background: fi.desc === p.desc ? C.carbon : '#fff', color: fi.desc === p.desc ? '#fff' : C.carbon, border: '1px solid #CBD2D6', padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>
                    {p.desc}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input style={{ ...inp, flex: '2 1 200px' }} placeholder="Descripción de la partida *" value={fi.desc} onChange={e => setFi({ ...fi, desc: e.target.value })} />
                <input style={{ ...inp, width: 80 }} placeholder="Cant. *" value={fi.cant} onChange={e => setFi({ ...fi, cant: e.target.value })} />
                <select style={inp} value={fi.unidad} onChange={e => setFi({ ...fi, unidad: e.target.value })}>{UNIDADES.map(u => <option key={u}>{u}</option>)}</select>
                <input style={{ ...inp, width: 110 }} placeholder="Precio unit. *" value={fi.precio} onChange={e => setFi({ ...fi, precio: e.target.value })} />
                <input style={{ ...inp, width: 120 }} placeholder="Costo est. unit." value={fi.costo} onChange={e => setFi({ ...fi, costo: e.target.value })} />
                <button onClick={() => agregarItem()} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar</button>
                <button onClick={() => setAddItem(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gris }}><X size={16} /></button>
              </div>
              {num(fi.cant) > 0 && num(fi.precio) > 0 && (
                <div style={{ fontSize: 12, color: C.gris, marginTop: 6 }}>
                  Subtotal: <b>{clp(num(fi.cant) * num(fi.precio))}</b>
                  {num(fi.costo) > 0 && <> · margen partida: <b>{(((num(fi.precio) - num(fi.costo)) / num(fi.precio)) * 100).toFixed(0)}%</b></>}
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 16, padding: '12px 14px', background: '#F7F4EE', fontSize: 13, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <span>Total neto: <b>{clp(venta)}</b></span>
            <span>IVA 19%: <b>{clp(venta * 0.19)}</b></span>
            <span>Total: <b>{clp(venta * 1.19)}</b></span>
            {tieneCostos && <span>Margen estimado: <b style={{ color: margen >= 30 ? C.verde : margen >= 15 ? '#B8860B' : C.rojo }}>{clp(venta - costo)} ({margen.toFixed(1)}%)</b></span>}
          </div>

          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <button onClick={() => window.confirm(`¿Eliminar la ${cot.numero} completa?`) && onDelete(cot.id)}
              style={{ background: 'none', border: `1px solid ${C.rojo}`, color: C.rojo, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
              <Trash2 size={12} style={{ verticalAlign: -2 }} /> Eliminar cotización
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Módulo principal ----------
export default function CotizadorModule({ areasPermitidas = ['Santa Rosa', 'Istria', 'Proyectos'], ots = [], setOts, cots: cotsExt, setCots: setCotsExt }) {
  const [cotsInt, setCotsInt] = useState(COT_SEED)
  const cots = cotsExt ?? cotsInt
  const setCots = setCotsExt ?? setCotsInt
  const [creando, setCreando] = useState(false)
  const [f, setF] = useState({ cliente: '', area: areasPermitidas[0], validezDias: '30', obs: '' })
  const [convertidas, setConvertidas] = useState([])

  const visibles = cots.filter(c => areasPermitidas.includes(c.area))
  const nums = cots.map(c => parseInt((c.numero.match(/(\d+)$/) || [0, 200])[1], 10))
  const siguiente = `COT-2026-${String(Math.max(200, ...nums) + 1).padStart(3, '0')}`

  const actualizar = (id, cambios) => setCots(cs => cs.map(c => c.id === id ? { ...c, ...cambios } : c))
  const eliminar = id => setCots(cs => cs.filter(c => c.id !== id))

  function crear() {
    if (!f.cliente) return
    setCots(cs => [{ id: 'cot' + Date.now(), numero: siguiente, fecha: hoy(), validezDias: parseInt(f.validezDias) || 30, cliente: f.cliente, area: f.area, estado: 'Borrador', obs: f.obs, items: [] }, ...cs])
    setF({ cliente: '', area: areasPermitidas[0], validezDias: '30', obs: '' })
    setCreando(false)
  }

  function convertirEnOT(cot) {
    if (!setOts) return
    const otsNums = ots.map(o => parseInt((o.numero.match(/(\d+)$/) || [0, 100])[1], 10))
    const numeroOT = `OT-2026-${String(Math.max(100, ...otsNums) + 1).padStart(3, '0')}`
    const areaOT = (cot.area === 'Santa Rosa' || cot.area === 'Istria') ? cot.area : 'Santa Rosa'
    const esquema = cot.items.map(i => i.desc).slice(0, 2).join(' + ') || '—'
    const nueva = {
      id: 'ot' + Date.now(), numero: numeroOT, area: areaOT,
      cliente: cot.cliente, cotizacion: cot.numero, oc: '—',
      m2: m2De(cot), montoCotizado: totalVenta(cot),
      preparacion: cot.items.find(i => i.desc.includes('SSPC'))?.desc || 'SSPC-SP6 Comercial',
      esquema, estado: 'En ejecución', ventas: [], costos: [],
    }
    setOts(xs => [nueva, ...xs])
    setConvertidas(cv => [...cv, cot.id])
    alert(`✓ ${cot.numero} convertida en ${numeroOT} (${areaOT}).\nYa aparece en Órdenes de Trabajo y en el cuadro "por facturar" de gerencia con ${clp(totalVenta(cot))}.`)
  }

  const enviadas = visibles.filter(c => c.estado === 'Enviada')
  const tasaAprob = (() => {
    const cerradas = visibles.filter(c => ['Aprobada', 'Rechazada'].includes(c.estado))
    return cerradas.length ? (visibles.filter(c => c.estado === 'Aprobada').length / cerradas.length) * 100 : null
  })()

  return (
    <div>
      <ReferenciaHistorica ots={ots} />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {[['Cotizaciones', visibles.length], ['Enviadas (esperando)', enviadas.length],
          ['Monto en espera', clp(enviadas.reduce((a, c) => a + totalVenta(c), 0))],
          ['Tasa de aprobación', tasaAprob === null ? '—' : tasaAprob.toFixed(0) + '%']].map(([l, v], i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #E2DED4', padding: 14, flex: '1 1 150px' }}>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{l}</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 600 }}>{v}</div>
          </div>
        ))}
      </div>

      {!creando ? (
        <button onClick={() => setCreando(true)}
          style={{ background: C.naranja, color: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <Plus size={15} /> Nueva cotización
        </button>
      ) : (
        <div style={{ background: '#fff', border: `2px solid ${C.naranja}`, padding: 16, marginBottom: 14 }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>
            Nueva cotización <span style={{ fontFamily: "'JetBrains Mono',monospace", background: C.carbon, color: '#fff', padding: '2px 8px', marginLeft: 8 }}>{siguiente}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input style={{ ...inp, flex: '1 1 200px' }} placeholder="Cliente *" value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} />
            <select style={inp} value={f.area} onChange={e => setF({ ...f, area: e.target.value })}>{areasPermitidas.map(a => <option key={a}>{a}</option>)}</select>
            <input style={{ ...inp, width: 130 }} placeholder="Validez (días)" value={f.validezDias} onChange={e => setF({ ...f, validezDias: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={crear} style={{ background: C.verde, color: '#fff', border: 'none', padding: '8px 18px', cursor: 'pointer', fontSize: 13 }}>Crear (luego agregas partidas)</button>
            <button onClick={() => setCreando(false)} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
          </div>
        </div>
      )}

      {visibles.map(c => (
        <TarjetaCot key={c.id} cot={c} onUpdate={actualizar} onDelete={eliminar} onConvertir={convertirEnOT} yaEsOT={convertidas.includes(c.id)} />
      ))}

      <div style={{ fontSize: 12, color: '#9AA0A6', textAlign: 'center', marginTop: 8 }}>
        Vista de prueba: los cambios se pierden al recargar. Con la base de datos conectada, todo queda guardado.
      </div>
    </div>
  )
}
