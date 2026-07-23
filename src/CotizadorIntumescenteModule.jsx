import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Trash2, Save, Send, RefreshCw } from 'lucide-react'
import { supabase } from './supabase.js'
import { calcularCotizacion, F_LEVELS, F_LABEL } from './intumescente-calc.js'
import {
  cargarCatalogo, cargarParametrosCompletos, generarFolio,
  crearCotizacionBorrador, guardarBorrador, emitir, nuevaRevision,
  cambiarEstado, listarCotizacionesIntumescentes, obtenerRevision,
  guardarProducto, guardarParametro,
} from './intumescente-api.js'

// ============================================================
// Cotización Intumescente — paso 3 de la spec: componente de UI,
// conectado a las tablas reales (int_productos/int_espesores/
// int_parametros, cotizaciones, cotizacion_revisiones) vía
// intumescente-api.js. Cálculo puro en intumescente-calc.js
// (portado 1:1 del prototipo cotizador-pintura-intumescente.jsx).
//
// Snapshot inmutable (requerimiento de Mario): al guardar mientras
// la cotización está en Borrador, se sobreescribe la revisión
// vigente. Si ya fue emitida, "Guardar" crea una revisión nueva en
// vez de tocar la anterior (la BD lo refuerza con un trigger).
// ============================================================

import { SEREIN } from './theme-serein.js'
// Paleta reskineada a la identidad Serein 2026 — mismas claves, solo cambian los valores hex.
const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const inp = { padding: '7px 9px', border: '1px solid #DFE4EA', fontSize: 13, boxSizing: 'border-box' }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const num2 = n => (n || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 })
const num1 = n => (n || 0).toLocaleString('es-CL', { maximumFractionDigits: 1 })
const uid = () => 'it' + Date.now() + Math.floor(Math.random() * 1000)

const ESTADOS_COT = ['Borrador', 'Enviada', 'En seguimiento', 'Aprobada', 'Rechazada', 'Vencida', 'Cerrada']
const MOTIVOS = [
  { v: 'precio', l: 'Precio' }, { v: 'plazo', l: 'Plazo' }, { v: 'otro_proveedor', l: 'Otro proveedor' },
  { v: 'proyecto_postergado', l: 'Proyecto postergado' }, { v: 'sin_respuesta', l: 'Sin respuesta' },
]
const colorEstado = e => ({
  Borrador: ['#EEE', C.gris], Enviada: ['#E7EFFB', C.azul], 'En seguimiento': ['#FDECDD', '#D9600A'],
  Aprobada: ['#E6F7EE', C.verde], Rechazada: ['#FCEBEA', C.rojo], Vencida: ['#FCEBEA', C.rojo], Cerrada: ['#EEE', C.gris],
}[e] || ['#EEE', C.gris])

const nuevaPartida = productId => ({
  id: uid(), desc: 'Nueva partida', tipo: 'viga', seccionTipo: 'abierto', modo: 'perfil',
  m2: 0, perimetro: 1, largo: 6, cantidad: 1, caras: 4, seccion: 40,
  masividadAuto: true, masividad: 0, f: 'F30', productId: productId || '', topcoat: true,
})
const DEFAULT_OFERTA = {
  validezDias: 15,
  formaPago: '50% anticipo contra orden de compra · 50% contra entrega y recepción conforme.',
  plazoEntrega: 'A convenir según programa de obra.',
  condiciones: 'Precios netos, IVA adicional según se indica.\nEspesores según tabla certificada del sistema aplicado y masividad de cada perfil (NCh935/1).\nInspección y certificación de espesores en obra según NCh3040 por organismo acreditado.',
  exclusiones: 'Superficies entregadas libres de óxido, grasa, polvo y calamina (salvo partida de preparación cotizada).\nAndamios o plataformas adicionales no indicados en esta oferta.\nCualquier partida no descrita explícitamente en esta cotización.',
}

function Field({ label, children, w }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, width: w }}>
      <span style={{ fontSize: 10.5, color: C.gris, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
      {children}
    </label>
  )
}
function NumInput({ value, onChange, step = 1, w }) {
  return <input type="number" step={step} value={value} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} style={{ ...inp, width: w || '100%', textAlign: 'right' }} />
}

export default function CotizadorIntumescenteModule({ proyectoInicial = null, clientesSugeridos = [] }) {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [userId, setUserId] = useState(null)
  const [tab, setTab] = useState('cotizacion')

  const [catalogo, setCatalogo] = useState(null) // { products, byId }
  const [productosExtra, setProductosExtra] = useState([]) // productos_usados de un snapshot reabierto, no vigentes en catálogo
  const [globals, setGlobals] = useState(null)
  const [aplicador, setAplicador] = useState(null)
  const [otros, setOtros] = useState(null)
  const [oferta, setOferta] = useState(DEFAULT_OFERTA)
  const [items, setItems] = useState([])
  const [cliente, setCliente] = useState(proyectoInicial?.cliente || '')
  const [obra, setObra] = useState(proyectoInicial?.nombre || '')
  const [proyectoId] = useState(proyectoInicial?.id || null)

  const [cotizacionId, setCotizacionId] = useState(null)
  const [folio, setFolio] = useState('')
  const [estado, setEstado] = useState('Borrador')
  const [revisionActual, setRevisionActual] = useState(1)
  const [guardando, setGuardando] = useState(false)

  const [listado, setListado] = useState([])
  const [pendienteMotivo, setPendienteMotivo] = useState(null) // { cotizacion, nuevoEstado }
  const [motivoSel, setMotivoSel] = useState('')

  async function refrescarListado() {
    try { setListado(await listarCotizacionesIntumescentes()) } catch (e) { /* silencioso: no bloquea el resto de la pantalla */ }
  }

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const [cat, params] = await Promise.all([cargarCatalogo(), cargarParametrosCompletos()])
        if (!vivo) return
        setCatalogo(cat); setGlobals(params.globals); setAplicador(params.aplicador); setOtros(params.otros)
        if (cat.products.length) setItems([nuevaPartida(cat.products[0].id)])
        supabase.auth.getUser().then(({ data }) => { if (vivo) setUserId((data && data.user && data.user.id) || null) })
        await refrescarListado()
      } catch (e) {
        if (vivo) setError('No se pudo cargar el catálogo de cotización intumescente: ' + (e.message || e))
      } finally { if (vivo) setCargando(false) }
    })()
    return () => { vivo = false }
  }, [])

  const byId = useMemo(() => {
    if (!catalogo) return {}
    const extra = Object.fromEntries(productosExtra.map(p => [p.id, p]))
    return { ...extra, ...catalogo.byId }
  }, [catalogo, productosExtra])

  const calc = useMemo(() => {
    if (!catalogo || !globals || !aplicador || !otros) return null
    return calcularCotizacion(items, byId, globals, aplicador, otros)
  }, [items, byId, globals, aplicador, otros, catalogo])

  const money = v => (globals && globals.moneda === 'UF') ? `UF ${num2(v / (globals.valorUF || 1))}` : clp(v)

  const setItem = (id, patch) => setItems(xs => xs.map(x => x.id === id ? { ...x, ...patch } : x))
  const addItem = () => setItems(xs => [...xs, nuevaPartida(catalogo?.products?.[0]?.id)])
  const delItem = id => setItems(xs => xs.filter(x => x.id !== id))
  const dupItem = id => setItems(xs => { const s = xs.find(x => x.id === id); return s ? [...xs, { ...s, id: uid(), desc: s.desc + ' (copia)' }] : xs })

  function nuevaCotizacionEnBlanco() {
    setCotizacionId(null); setFolio(''); setEstado('Borrador'); setRevisionActual(1)
    setCliente(proyectoInicial?.cliente || ''); setObra(proyectoInicial?.nombre || '')
    setItems(catalogo?.products?.length ? [nuevaPartida(catalogo.products[0].id)] : [])
    setOferta(DEFAULT_OFERTA); setProductosExtra([])
    setMsg('')
  }

  async function abrir(cot) {
    setMsg('')
    try {
      const rev = await obtenerRevision(cot.id, cot.revision_actual)
      if (!rev) { setMsg('No se encontró la revisión vigente de ' + cot.numero); return }
      const snap = rev.snapshot || {}
      setCotizacionId(cot.id); setFolio(cot.numero); setEstado(cot.estado); setRevisionActual(cot.revision_actual)
      setCliente(snap.cliente || cot.cliente || ''); setObra(snap.obra || cot.observaciones || '')
      setItems(snap.items && snap.items.length ? snap.items : [])
      setProductosExtra(snap.productos_usados || [])
      if (snap.globals) setGlobals(snap.globals)
      if (snap.aplicador) setAplicador(snap.aplicador)
      if (snap.otros) setOtros(snap.otros)
      setOferta(snap.oferta || DEFAULT_OFERTA)
      setTab('cotizacion')
    } catch (e) { setMsg('Error al abrir: ' + (e.message || e)) }
  }

  function construirSnapshot() {
    return {
      cliente: cliente.trim(), obra: obra.trim(), items,
      productos_usados: (catalogo?.products || []).filter(p => items.some(it => it.productId === p.id)),
      globals, aplicador, otros, oferta,
    }
  }
  function construirResultados() {
    return {
      partidas: calc.rows.map(({ it, r }) => ({ id: it.id, desc: it.desc, ...r })),
      totales: {
        m2Total: calc.m2Total, m2Capas: calc.m2Capas, kgTotal: calc.kgTotal, kgPorProducto: calc.kgPorProducto,
        directoPartidas: calc.directoPartidas, aplicadorBase: calc.aplicadorBase, aplicadorRecargo: calc.aplicadorRecargo,
        aplicadorTotal: calc.aplicadorTotal, retoques: calc.retoques, certificacion: calc.certificacion,
        otrosTotal: calc.otrosTotal, directo: calc.directo, gg: calc.gg, util: calc.util,
        neto: calc.neto, iva: calc.iva, total: calc.total,
      },
    }
  }

  async function guardar() {
    if (!cliente.trim()) { setMsg('Escribe el cliente.'); return }
    if (!items.length) { setMsg('Agrega al menos una partida.'); return }
    setGuardando(true); setMsg('')
    try {
      const snapshot = construirSnapshot()
      const resultados = construirResultados()
      const base = { cliente: cliente.trim(), area: 'Proyectos', proyectoId, obra: obra.trim(), moneda: globals.moneda, valorUf: globals.valorUF, validezDias: oferta.validezDias, snapshot, resultados }
      if (!cotizacionId) {
        const { cotizacion } = await crearCotizacionBorrador({ ...base, userId })
        setCotizacionId(cotizacion.id); setFolio(cotizacion.numero); setEstado(cotizacion.estado); setRevisionActual(cotizacion.revision_actual)
        setMsg('Borrador guardado: ' + cotizacion.numero)
      } else if (estado === 'Borrador') {
        await guardarBorrador(cotizacionId, base)
        setMsg('Borrador actualizado (' + folio + ').')
      } else {
        const rev = await nuevaRevision(cotizacionId, snapshot, resultados, userId)
        setRevisionActual(rev.revision); setEstado('Borrador')
        setMsg('Se creó una nueva revisión (Rev ' + rev.revision + ') a partir del estado "' + estado + '" anterior — quedó editable como borrador.')
      }
      await refrescarListado()
    } catch (e) { setMsg('Error al guardar: ' + (e.message || e)) }
    setGuardando(false)
  }

  async function emitirActual() {
    if (!cotizacionId) { setMsg('Guarda un borrador antes de emitir.'); return }
    if (!window.confirm('¿Emitir la cotización ' + folio + '? Esta revisión quedará congelada; para modificarla después se creará una revisión nueva.')) return
    try { await emitir(cotizacionId); setEstado('Enviada'); setMsg('Cotización emitida.'); await refrescarListado() }
    catch (e) { setMsg('Error al emitir: ' + (e.message || e)) }
  }

  function pedirCambioEstado(cot, nuevoEstado) {
    if (['Rechazada', 'Cerrada'].includes(nuevoEstado)) { setPendienteMotivo({ cotizacion: cot, nuevoEstado }); setMotivoSel(''); return }
    aplicarCambioEstado(cot, nuevoEstado, null)
  }
  async function aplicarCambioEstado(cot, nuevoEstado, motivo) {
    try {
      await cambiarEstado(cot.id, nuevoEstado, motivo)
      if (cot.id === cotizacionId) setEstado(nuevoEstado)
      await refrescarListado()
      setPendienteMotivo(null)
    } catch (e) { setMsg('Error al cambiar estado: ' + (e.message || e)) }
  }

  if (cargando) return <div style={{ padding: 24, color: C.gris, fontSize: 13 }}>Cargando catálogo de cotización intumescente…</div>
  if (error) return <div style={{ padding: 16, background: '#FCEBEA', color: C.rojo, fontSize: 13 }}>{error}</div>
  if (!catalogo || !calc) return null

  const card = { background: '#fff', border: '1px solid #DFE4EA', padding: 16, marginBottom: 16 }
  const h = { fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 8 }
  const [colFondo, colTexto] = colorEstado(estado)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase' }}>{folio || 'Cotización intumescente nueva'}</span>
          {folio && <span style={{ background: colFondo, color: colTexto, fontSize: 11, fontWeight: 700, padding: '3px 9px', textTransform: 'uppercase' }}>{estado}{revisionActual > 1 ? ' · Rev ' + revisionActual : ''}</span>}
        </div>
        <button onClick={nuevaCotizacionEnBlanco} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '6px 12px', cursor: 'pointer', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={14} /> Nueva</button>
      </div>

      {estado !== 'Borrador' && cotizacionId && (
        <div style={{ background: '#E7EFFB', border: '1px solid ' + C.azul, padding: '8px 14px', marginBottom: 14, fontSize: 12.5, color: C.azul }}>
          Esta cotización ya fue emitida (estado: {estado}). Los cambios que hagas y guardes crearán una <b>revisión nueva</b> — la revisión {revisionActual} actual queda intacta.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['cotizacion', 'Cotización'], ['aplicador', 'Aplicador'], ['catalogo', 'Catálogo'], ['oferta', 'Oferta / Guardar']].map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)} style={{ background: tab === id ? C.carbon : '#fff', color: tab === id ? '#fff' : C.carbon, border: '1px solid #DFE4EA', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontFamily: SEREIN.fontDisplay, fontWeight: 600, textTransform: 'uppercase' }}>{lbl}</button>
        ))}
      </div>

      {msg && <div style={{ background: msg.startsWith('Error') ? '#FCEBEA' : '#E6F7EE', color: msg.startsWith('Error') ? C.rojo : C.verde, padding: '8px 12px', marginBottom: 14, fontSize: 12.5 }}>{msg}</div>}

      {tab === 'cotizacion' && (
        <div>
          <div style={card}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Field label="Cliente" w="240px">
                <input list="dl-int-cli" value={cliente} onChange={e => setCliente(e.target.value)} style={inp} />
                <datalist id="dl-int-cli">{[...new Set((clientesSugeridos || []).map(c => (c && c.nombre) ? c.nombre : (typeof c === 'string' ? c : '')).filter(Boolean))].map(n => <option key={n} value={n} />)}</datalist>
              </Field>
              <Field label="Obra / proyecto" w="280px"><input value={obra} onChange={e => setObra(e.target.value)} style={inp} /></Field>
            </div>
          </div>

          {items.map(it => {
            const r = calc.rows.find(x => x.it.id === it.id)?.r
            return (
              <div key={it.id} style={card}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
                  <Field label="Partida" w="220px"><input value={it.desc} onChange={e => setItem(it.id, { desc: e.target.value })} style={inp} /></Field>
                  <Field label="Elemento" w="100px">
                    <select value={it.tipo} onChange={e => setItem(it.id, { tipo: e.target.value })} style={inp}><option value="viga">Viga</option><option value="pilar">Pilar</option></select>
                  </Field>
                  <Field label="Sección" w="110px">
                    <select value={it.seccionTipo} onChange={e => setItem(it.id, { seccionTipo: e.target.value })} style={inp}><option value="abierto">Abierta</option><option value="cerrado">Cerrada</option></select>
                  </Field>
                  <Field label="Resistencia" w="90px">
                    <select value={it.f} onChange={e => setItem(it.id, { f: e.target.value })} style={inp}>{F_LEVELS.map(f => <option key={f} value={f}>{F_LABEL[f]}</option>)}</select>
                  </Field>
                  <Field label="Producto" w="260px">
                    <select value={it.productId} onChange={e => setItem(it.id, { productId: e.target.value })} style={inp}>
                      {catalogo.products.map(p => <option key={p.id} value={p.id}>{p.marca} · {p.nombre}</option>)}
                    </select>
                  </Field>
                  <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5, paddingBottom: 7 }}><input type="checkbox" checked={it.topcoat} onChange={e => setItem(it.id, { topcoat: e.target.checked })} /> Terminación</label>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, paddingBottom: 2 }}>
                    <button onClick={() => dupItem(it.id)} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '5px 9px', cursor: 'pointer', fontSize: 11.5 }}>Duplicar</button>
                    <button onClick={() => delItem(it.id)} style={{ background: 'none', border: '1px solid #DFE4EA', color: C.rojo, padding: '5px 9px', cursor: 'pointer', fontSize: 11.5 }}><Trash2 size={13} /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
                  <Field label="Medición" w="120px">
                    <select value={it.modo} onChange={e => setItem(it.id, { modo: e.target.value, ...(e.target.value === 'm2' ? { masividadAuto: false } : {}) })} style={inp}><option value="perfil">Por perfil</option><option value="m2">m² directos</option></select>
                  </Field>
                  {it.modo === 'perfil' ? (
                    <>
                      <Field label="Caras" w="70px"><select value={it.caras} onChange={e => setItem(it.id, { caras: Number(e.target.value) })} style={inp}><option value={3}>3</option><option value={4}>4</option></select></Field>
                      <Field label="Perím. (m/ml)" w="100px"><NumInput value={it.perimetro} step={0.01} onChange={v => setItem(it.id, { perimetro: v })} /></Field>
                      <Field label="Sección (cm²)" w="100px"><NumInput value={it.seccion} step={0.1} onChange={v => setItem(it.id, { seccion: v })} /></Field>
                      <Field label="Largo (m)" w="85px"><NumInput value={it.largo} step={0.1} onChange={v => setItem(it.id, { largo: v })} /></Field>
                      <Field label="Cant." w="70px"><NumInput value={it.cantidad} onChange={v => setItem(it.id, { cantidad: v })} /></Field>
                    </>
                  ) : (
                    <Field label="Superficie (m²)" w="130px"><NumInput value={it.m2} step={0.1} onChange={v => setItem(it.id, { m2: v })} /></Field>
                  )}
                  <Field label={it.masividadAuto && it.modo === 'perfil' ? 'Hp/A (auto)' : 'Hp/A (m⁻¹)'} w="100px">
                    {it.masividadAuto && it.modo === 'perfil' ? <div style={{ ...inp, background: '#E2E7EC', textAlign: 'right', fontWeight: 600 }}>{r?.masividad ? num1(r.masividad) : '—'}</div> : <NumInput value={it.masividad} onChange={v => setItem(it.id, { masividad: v })} />}
                  </Field>
                  {it.modo === 'perfil' && <label style={{ fontSize: 11.5, color: C.gris, display: 'flex', alignItems: 'center', gap: 4, paddingBottom: 7 }}><input type="checkbox" checked={it.masividadAuto} onChange={e => setItem(it.id, { masividadAuto: e.target.checked })} /> auto</label>}
                </div>
                {r && r.disponible ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', borderTop: '1px solid #DFE4EA' }}>
                    <div style={{ display: 'flex', gap: 16, padding: '10px 12px', background: C.carbon, color: '#fff' }}>
                      <div><div style={{ fontSize: 9.5, color: '#9AA3AD' }}>Hp/A</div><div style={{ fontWeight: 600 }}>{num1(r.masividad)}</div></div>
                      <div><div style={{ fontSize: 9.5, color: '#9AA3AD' }}>DFT</div><div style={{ fontWeight: 600, color: C.ambar }}>{r.um} µm</div></div>
                      <div><div style={{ fontSize: 9.5, color: '#9AA3AD' }}>CAPAS</div><div style={{ fontWeight: 600 }}>{r.capas}</div></div>
                      <div><div style={{ fontSize: 9.5, color: '#9AA3AD' }}>PINTURA</div><div style={{ fontWeight: 600 }}>{num1(r.kg)} kg</div></div>
                    </div>
                    <div style={{ marginLeft: 'auto', padding: '10px 12px', textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: C.gris, textTransform: 'uppercase' }}>Materiales + prep.</div>
                      <div style={{ fontWeight: 600, fontSize: 16 }}>{money(r.total)}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '8px 10px', background: '#FDECDD', color: '#D9600A', fontSize: 12.5 }}>
                    {!r?.masividad ? 'Falta la masividad: complete perímetro y sección, o ingrésela manualmente.' : `El producto no tiene espesor certificado para ${F_LABEL[it.f]} en sección ${it.seccionTipo} a esta masividad. Elija otro sistema o ajuste la tabla en Catálogo.`}
                  </div>
                )}
              </div>
            )
          })}
          <button onClick={addItem} style={{ background: C.ambar, color: '#fff', border: 'none', padding: '9px 16px', cursor: 'pointer', fontSize: 12.5, fontFamily: SEREIN.fontDisplay, fontWeight: 600, textTransform: 'uppercase', marginBottom: 16 }}><Plus size={14} style={{ verticalAlign: -2 }} /> Agregar partida</button>

          <div style={card}>
            <div style={h}>Otros costos de obra</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5 }}><input type="checkbox" checked={otros.incCertificacion} onChange={e => setOtros({ ...otros, incCertificacion: e.target.checked })} /> Certificación NCh3040</label>
              <Field label="Certificación ($)" w="140px"><NumInput value={otros.certificacion} step={10000} onChange={v => setOtros({ ...otros, certificacion: v })} /></Field>
              <Field label="Retoques (% s/pintura)" w="150px"><NumInput value={otros.retoquesPct} step={0.5} onChange={v => setOtros({ ...otros, retoquesPct: v })} /></Field>
              <Field label="Equipos y andamios ($)" w="150px"><NumInput value={otros.equipos} step={10000} onChange={v => setOtros({ ...otros, equipos: v })} /></Field>
              <Field label="Movilización ($)" w="130px"><NumInput value={otros.movilizacion} step={10000} onChange={v => setOtros({ ...otros, movilizacion: v })} /></Field>
              <div style={{ marginLeft: 'auto', fontSize: 13 }}>Subtotal otros: <b>{money(calc.otrosTotal)}</b></div>
            </div>
          </div>
        </div>
      )}

      {tab === 'aplicador' && (
        <div style={card}>
          <div style={h}>Aplicador subcontratado</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <Field label="Aplicador / subcontratista" w="280px"><input value={aplicador.nombre} onChange={e => setAplicador({ ...aplicador, nombre: e.target.value })} style={inp} /></Field>
            <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
              {[['obra', 'Monto por obra'], ['m2', 'Por m²'], ['kg', 'Por kg'], ['dia', 'Por día']].map(([k, l]) => (
                <button key={k} onClick={() => setAplicador({ ...aplicador, modo: k })} style={{ background: aplicador.modo === k ? C.carbon : '#fff', color: aplicador.modo === k ? C.ambar : C.gris, border: '1px solid #DFE4EA', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {aplicador.modo === 'obra' && <Field label="Monto cerrado ($)" w="180px"><NumInput value={aplicador.montoObra} step={50000} onChange={v => setAplicador({ ...aplicador, montoObra: v })} /></Field>}
            {aplicador.modo === 'm2' && (<>
              <Field label="Valor ($/m²)" w="140px"><NumInput value={aplicador.valorM2} step={100} onChange={v => setAplicador({ ...aplicador, valorM2: v })} /></Field>
              <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5, paddingBottom: 7 }}><input type="checkbox" checked={aplicador.porCapas} onChange={e => setAplicador({ ...aplicador, porCapas: e.target.checked })} /> × N° de capas</label>
            </>)}
            {aplicador.modo === 'kg' && <Field label="Valor ($/kg)" w="150px"><NumInput value={aplicador.valorKg} step={100} onChange={v => setAplicador({ ...aplicador, valorKg: v })} /></Field>}
            {aplicador.modo === 'dia' && (<>
              <Field label="Valor día ($)" w="140px"><NumInput value={aplicador.valorDia} step={10000} onChange={v => setAplicador({ ...aplicador, valorDia: v })} /></Field>
              <Field label="Días estimados" w="120px"><NumInput value={aplicador.dias} step={0.5} onChange={v => setAplicador({ ...aplicador, dias: v })} /></Field>
            </>)}
            <Field label="Recargo administración (%)" w="170px"><NumInput value={aplicador.recargoPct} step={1} onChange={v => setAplicador({ ...aplicador, recargoPct: v })} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 24, marginTop: 14, paddingTop: 12, borderTop: '1px solid #DFE4EA', fontSize: 13 }}>
            <div>Subcontrato: <b>{money(calc.aplicadorBase)}</b></div>
            <div>Recargo: <b>{money(calc.aplicadorRecargo)}</b></div>
            <div>Total aplicador: <b style={{ color: C.ambar }}>{money(calc.aplicadorTotal)}</b></div>
          </div>
        </div>
      )}

      {tab === 'catalogo' && (
        <CatalogoTab catalogo={catalogo} globals={globals} setGlobals={setGlobals} onRecargar={async () => { setCatalogo(await cargarCatalogo()) }} onMsg={setMsg} />
      )}

      {tab === 'oferta' && (
        <div>
          <div style={card}>
            <div style={h}>Condiciones de la oferta</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Field label="Validez (días)" w="120px"><NumInput value={oferta.validezDias} onChange={v => setOferta({ ...oferta, validezDias: v })} /></Field>
              <Field label="Forma de pago" w="360px"><input value={oferta.formaPago} onChange={e => setOferta({ ...oferta, formaPago: e.target.value })} style={inp} /></Field>
              <Field label="Plazo de entrega" w="280px"><input value={oferta.plazoEntrega} onChange={e => setOferta({ ...oferta, plazoEntrega: e.target.value })} style={inp} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
              <Field label="Condiciones" w="48%"><textarea rows={5} value={oferta.condiciones} onChange={e => setOferta({ ...oferta, condiciones: e.target.value })} style={{ ...inp, resize: 'vertical' }} /></Field>
              <Field label="Exclusiones" w="48%"><textarea rows={5} value={oferta.exclusiones} onChange={e => setOferta({ ...oferta, exclusiones: e.target.value })} style={{ ...inp, resize: 'vertical' }} /></Field>
            </div>
          </div>

          <div style={card}>
            <div style={h}>Totales</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 13, alignItems: 'flex-end' }}>
              <div>Directo (materiales, aplicador, otros): {money(calc.directo)}</div>
              <div>Gastos generales + utilidad: {money(calc.gg + calc.util)}</div>
              <div>Neto: <b>{money(calc.neto)}</b></div>
              {globals.conIVA && <div>IVA 19%: {money(calc.iva)}</div>}
              <div style={{ fontSize: 18 }}>TOTAL: <b style={{ color: C.ambar }}>{money(calc.total)}</b></div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <button onClick={guardar} disabled={guardando} style={{ background: C.verde, color: '#fff', border: 'none', padding: '10px 18px', cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.6 : 1, fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Save size={15} /> {estado === 'Borrador' || !cotizacionId ? 'Guardar borrador' : 'Guardar como nueva revisión'}</button>
            {cotizacionId && estado === 'Borrador' && (
              <button onClick={emitirActual} style={{ background: C.azul, color: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Send size={15} /> Emitir</button>
            )}
          </div>
        </div>
      )}

      <div style={{ ...card, marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={h}>Cotizaciones intumescentes</div>
          <button onClick={refrescarListado} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '5px 10px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}><RefreshCw size={13} /> Refrescar</button>
        </div>
        {pendienteMotivo && (
          <div style={{ background: '#FCEBEA', border: '1px solid ' + C.rojo, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12.5, marginBottom: 8 }}>Motivo de no adjudicación para <b>{pendienteMotivo.cotizacion.numero}</b> (obligatorio al marcar {pendienteMotivo.nuevoEstado}):</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={motivoSel} onChange={e => setMotivoSel(e.target.value)} style={inp}><option value="">Elegir…</option>{MOTIVOS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}</select>
              <button disabled={!motivoSel} onClick={() => aplicarCambioEstado(pendienteMotivo.cotizacion, pendienteMotivo.nuevoEstado, motivoSel)} style={{ background: C.rojo, color: '#fff', border: 'none', padding: '7px 14px', cursor: motivoSel ? 'pointer' : 'default', opacity: motivoSel ? 1 : 0.5, fontSize: 12.5 }}>Confirmar</button>
              <button onClick={() => setPendienteMotivo(null)} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5 }}>Cancelar</button>
            </div>
          </div>
        )}
        {listado.length === 0 ? (
          <div style={{ fontSize: 13, color: C.gris }}>Aún no hay cotizaciones intumescentes guardadas.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['Folio', 'Cliente', 'Obra', 'Fecha', 'Vencimiento', 'Total', 'Estado', ''].map(h2 => <th key={h2} style={{ textAlign: h2 === 'Total' ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h2}</th>)}</tr></thead>
              <tbody>
                {listado.map(cot => { const [cf, ct] = colorEstado(cot.estado); return (
                  <tr key={cot.id} style={{ borderBottom: '1px solid #DFE4EA' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{cot.numero}</td>
                    <td style={{ padding: '6px 8px' }}>{cot.cliente}</td>
                    <td style={{ padding: '6px 8px', color: C.gris }}>{cot.observaciones || '—'}</td>
                    <td style={{ padding: '6px 8px', color: C.gris, whiteSpace: 'nowrap' }}>{cot.fecha || '—'}</td>
                    <td style={{ padding: '6px 8px', color: C.gris, whiteSpace: 'nowrap' }}>{cot.fecha_vencimiento || '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{clp(cot.monto_total)}</td>
                    <td style={{ padding: '6px 8px' }}><select value={cot.estado} onChange={e => pedirCambioEstado(cot, e.target.value)} style={{ border: 'none', background: cf, color: ct, padding: '4px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{ESTADOS_COT.map(e2 => <option key={e2} value={e2}>{e2}</option>)}</select></td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}><button onClick={() => abrir(cot)} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '4px 10px', cursor: 'pointer', fontSize: 11.5 }}>Abrir</button></td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function CatalogoTab({ catalogo, globals, setGlobals, onRecargar, onMsg }) {
  const card = { background: '#fff', border: '1px solid #DFE4EA', padding: 16, marginBottom: 16 }
  const h = { fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 8 }
  return (
    <div>
      <div style={{ background: '#FDECDD', border: '1px solid #FF9D5C', padding: '10px 14px', marginBottom: 14, fontSize: 12.5, color: '#D9600A' }}>
        Las tablas de espesores precargadas son <b>referenciales</b>, no certificadas. Márcalas como certificadas solo cuando reemplaces la tabla en Supabase (<code>int_espesores</code>) por la del certificado IDIEM/DICTUC correspondiente. Editar aquí <b>nunca</b> altera cotizaciones ya guardadas — cada una queda congelada en su propia revisión.
      </div>
      {catalogo.products.map(p => <ProductoCard key={p.id} p={p} onSaved={onRecargar} onMsg={onMsg} />)}

      <ParametrosGlobalesCard globals={globals} setGlobals={setGlobals} onMsg={onMsg} />
    </div>
  )
}

function ProductoCard({ p, onSaved, onMsg }) {
  const inicial = { marca: p.marca, nombre: p.nombre, solidos: p.solidos, densidad: p.densidad, precioKg: p.precioKg, kgEnvase: p.kgEnvase, capaMaxUm: p.capaMaxUm, certificada: p.certificada, fuente: p.fuente || '' }
  const [form, setForm] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const cambiado = JSON.stringify(form) !== JSON.stringify(inicial)
  const card = { background: '#fff', border: '1px solid #DFE4EA', padding: 16, marginBottom: 16 }

  async function guardar() {
    setGuardando(true)
    try {
      await guardarProducto({
        id: p.id, marca: form.marca, nombre: form.nombre, solidos_pct: Number(form.solidos) || 0,
        densidad: Number(form.densidad) || 0, precio_kg: Number(form.precioKg) || 0,
        kg_envase: form.kgEnvase === '' ? null : Number(form.kgEnvase), capa_max_um: Number(form.capaMaxUm) || 0,
        certificada: !!form.certificada, fuente: form.fuente || null,
      })
      onMsg('Producto actualizado: ' + form.marca + ' ' + form.nombre + '. No afecta cotizaciones ya guardadas.')
      await onSaved()
    } catch (e) { onMsg('Error al guardar producto (¿tienes permisos de Gerencia?): ' + (e.message || e)) }
    setGuardando(false)
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Marca" w="150px"><input value={form.marca} onChange={e => setForm({ ...form, marca: e.target.value })} style={inp} /></Field>
        <Field label="Nombre" w="220px"><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={inp} /></Field>
        <Field label="Sólidos (%)" w="90px"><NumInput value={form.solidos} step={0.5} onChange={v => setForm({ ...form, solidos: v })} /></Field>
        <Field label="Densidad (kg/l)" w="100px"><NumInput value={form.densidad} step={0.01} onChange={v => setForm({ ...form, densidad: v })} /></Field>
        <Field label="Precio ($/kg)" w="110px"><NumInput value={form.precioKg} step={100} onChange={v => setForm({ ...form, precioKg: v })} /></Field>
        <Field label="Envase (kg)" w="90px"><NumInput value={form.kgEnvase} onChange={v => setForm({ ...form, kgEnvase: v })} /></Field>
        <Field label="Capa máx (µm)" w="100px"><NumInput value={form.capaMaxUm} step={10} onChange={v => setForm({ ...form, capaMaxUm: v })} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><input type="checkbox" checked={form.certificada} onChange={e => setForm({ ...form, certificada: e.target.checked })} /> {form.certificada ? <b style={{ color: C.verde }}>Tabla certificada</b> : 'Marcar como certificada'}</label>
        {form.certificada && <Field label="N° certificado / fecha" w="260px"><input value={form.fuente} onChange={e => setForm({ ...form, fuente: e.target.value })} placeholder="Ej: IDIEM 12345, 03-2026" style={inp} /></Field>}
        <button onClick={guardar} disabled={!cambiado || guardando} style={{ marginLeft: 'auto', background: cambiado ? C.verde : '#DFE4EA', color: '#fff', border: 'none', padding: '7px 16px', cursor: cambiado && !guardando ? 'pointer' : 'default', fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase' }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  )
}

function ParametrosGlobalesCard({ globals, setGlobals, onMsg }) {
  const [guardando, setGuardando] = useState(false)
  const card = { background: '#fff', border: '1px solid #DFE4EA', padding: 16, marginBottom: 16 }
  const h = { fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 8 }

  async function guardarComoDefecto() {
    setGuardando(true)
    try {
      const mapa = {
        merma_viga: globals.mermaViga, merma_pilar: globals.mermaPilar, prep_m2: globals.prepM2,
        imprimante_m2: globals.imprimanteM2, topcoat_m2: globals.topcoatM2,
        gg_pct: globals.ggPct, util_pct: globals.utilPct, valor_uf: globals.valorUF,
      }
      await Promise.all(Object.entries(mapa).map(([clave, valor]) => guardarParametro(clave, Number(valor) || 0)))
      onMsg('Parámetros globales guardados como valor por defecto para nuevas cotizaciones.')
    } catch (e) { onMsg('Error al guardar parámetros (¿tienes permisos de Gerencia?): ' + (e.message || e)) }
    setGuardando(false)
  }

  return (
    <div style={card}>
      <div style={h}>Parámetros globales</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <Field label="Merma vigas (×)"><NumInput value={globals.mermaViga} step={0.05} onChange={v => setGlobals({ ...globals, mermaViga: v })} /></Field>
        <Field label="Merma pilares (×)"><NumInput value={globals.mermaPilar} step={0.05} onChange={v => setGlobals({ ...globals, mermaPilar: v })} /></Field>
        <Field label="Preparación ($/m²)"><NumInput value={globals.prepM2} step={100} onChange={v => setGlobals({ ...globals, prepM2: v })} /></Field>
        <Field label="Imprimante ($/m²)"><NumInput value={globals.imprimanteM2} step={100} onChange={v => setGlobals({ ...globals, imprimanteM2: v })} /></Field>
        <Field label="Terminación ($/m²)"><NumInput value={globals.topcoatM2} step={100} onChange={v => setGlobals({ ...globals, topcoatM2: v })} /></Field>
        <Field label="Gastos generales (%)"><NumInput value={globals.ggPct} step={1} onChange={v => setGlobals({ ...globals, ggPct: v })} /></Field>
        <Field label="Utilidad (%)"><NumInput value={globals.utilPct} step={1} onChange={v => setGlobals({ ...globals, utilPct: v })} /></Field>
        <Field label="Moneda">
          <select value={globals.moneda} onChange={e => setGlobals({ ...globals, moneda: e.target.value })} style={inp}><option value="CLP">CLP ($)</option><option value="UF">UF</option></select>
        </Field>
        {globals.moneda === 'UF' && <Field label="Valor UF ($)"><NumInput value={globals.valorUF} step={100} onChange={v => setGlobals({ ...globals, valorUF: v })} /></Field>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <button onClick={guardarComoDefecto} disabled={guardando} style={{ background: C.azul, color: '#fff', border: 'none', padding: '8px 16px', cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.6 : 1, fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase' }}>{guardando ? 'Guardando…' : 'Guardar como valor por defecto'}</button>
        <span style={{ fontSize: 11.5, color: C.gris }}>Cambia el punto de partida de las próximas cotizaciones nuevas. No afecta cotizaciones ya guardadas.</span>
      </div>
    </div>
  )
}
