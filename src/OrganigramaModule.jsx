import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Download, Image as ImageIcon, Eye, EyeOff, X } from 'lucide-react'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { cargarOrganigrama, cargarCostos, guardarCostoManual, crearPersona, actualizarPersona, eliminarPersona, reordenar } from './organigrama-api.js'

// ============================================================
// Organigrama Serein — estructura organizacional editable, con
// exportación a PDF/PNG (A3 horizontal). Estructura visible para
// cualquier autenticado; edición y vista de costos solo Gerencia
// (reforzado por RLS, no solo por la UI).
// ============================================================

const C = { azul: '#061A40', teal: '#0B7285', ambar: '#FF6B00', rojo: '#D64545', verde: '#12805C', carbon: '#0F1A2E', gris: '#8A929E' }
const inp = { padding: '7px 9px', border: '1px solid #CBD2D6', fontSize: 13, boxSizing: 'border-box' }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')

const NIVEL_COLOR = {
  gerencia_general: { bg: '#1A2224', fg: '#fff' },
  gerencia: { bg: '#3B3538', fg: '#fff' },
  jefatura: { bg: '#6E6468', fg: '#fff' },
  planta: { bg: '#FF5C00', fg: '#fff' },
  supervision: { bg: '#FFCFAF', fg: '#3B3538' },
  maestro: { bg: '#FFE7D6', fg: '#3B3538' },
  ayudante: { bg: '#F2F1EF', fg: '#3B3538' },
  externo: { bg: '#fff', fg: '#3B3538' },
}
const NIVEL_LABEL = {
  gerencia_general: 'Gerencia General', gerencia: 'Gerencias', jefatura: 'Jefatura de producción',
  planta: 'Plantas', supervision: 'Supervisión', maestro: 'Maestros', ayudante: 'Ayudantes', externo: 'Externos / subcontratos',
}
const AREAS = ['Gerencia', 'Administración', 'Comercial', 'Proyectos', 'Santa Rosa', 'Istria']
const TIPOS = [['interno', 'Interno'], ['externo', 'Externo'], ['subcontrato', 'Subcontrato'], ['asesor_externo', 'Asesor externo']]
const NIVELES = Object.keys(NIVEL_COLOR)

function TreeStyles() {
  return (
    <style>{`
      .org-tree, .org-tree ul { margin: 0; padding: 0; list-style: none; }
      .org-tree { text-align: center; }
      .org-tree ul { display: flex; padding-top: 28px; position: relative; }
      .org-tree li { display: flex; flex-direction: column; align-items: center; padding: 28px 8px 0 8px; position: relative; }
      .org-tree li::before, .org-tree li::after { content: ''; position: absolute; top: 0; right: 50%; border-top: 1px solid #B9B4AE; width: 50%; height: 28px; }
      .org-tree li::after { right: auto; left: 50%; border-left: 1px solid #B9B4AE; }
      .org-tree li:only-child::after, .org-tree li:only-child::before { display: none; }
      .org-tree li:first-child::before, .org-tree li:last-child::after { border: 0 none; }
      .org-tree li:last-child::before { border-right: 1px solid #B9B4AE; }
      .org-tree li:first-child::after { border-left: 1px solid #B9B4AE; }
      .org-tree > li { padding-top: 0; }
      .org-tree ul::before { content: ''; position: absolute; top: 0; left: 50%; border-left: 1px solid #B9B4AE; width: 0; height: 28px; }
      .org-tree li:only-child { padding-top: 0; }
      .org-tree li:only-child > ul::before { display: none; }
    `}</style>
  )
}

function hijosDe(personas, jefeId) {
  return personas.filter(p => p.jefe_id === jefeId && p.tipo !== 'asesor_externo').sort((a, b) => a.orden - b.orden)
}

function Caja({ persona, costo, mostrarCostos, esGerencia, onEditar, onMover, esPrimero, esUltimo }) {
  const col = NIVEL_COLOR[persona.nivel_visual] || NIVEL_COLOR.ayudante
  const externo = persona.tipo !== 'interno'
  return (
    <div style={{
      background: col.bg, color: col.fg, minWidth: 148, maxWidth: 190, padding: '8px 12px',
      borderRadius: 4, border: externo ? '1.5px dashed #B9B4AE' : '1px solid transparent',
      position: 'relative', boxShadow: '0 1px 2px rgba(0,0,0,.08)',
    }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 12.5, lineHeight: 1.25 }}>{persona.nombre}</div>
      <div style={{ fontSize: 10.5, opacity: 0.85, marginTop: 2 }}>{persona.cargo}</div>
      {persona.jefe_id_punteado && <div style={{ fontSize: 9, opacity: 0.75, marginTop: 3, fontStyle: 'italic' }}>· también reporta (punteado)</div>}
      {mostrarCostos && costo != null && <div style={{ fontSize: 10.5, marginTop: 4, fontWeight: 700 }}>{clp(costo)}/mes</div>}
      {esGerencia && (
        <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 6 }}>
          <button onClick={() => onMover(persona, -1)} disabled={esPrimero} title="Mover antes" style={{ background: 'rgba(255,255,255,.25)', border: 'none', cursor: esPrimero ? 'default' : 'pointer', opacity: esPrimero ? 0.3 : 1, padding: 2, display: 'flex', color: col.fg }}><ArrowUp size={11} /></button>
          <button onClick={() => onMover(persona, 1)} disabled={esUltimo} title="Mover después" style={{ background: 'rgba(255,255,255,.25)', border: 'none', cursor: esUltimo ? 'default' : 'pointer', opacity: esUltimo ? 0.3 : 1, padding: 2, display: 'flex', color: col.fg }}><ArrowDown size={11} /></button>
          <button onClick={() => onEditar(persona)} title="Editar" style={{ background: 'rgba(255,255,255,.25)', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: col.fg }}><Pencil size={11} /></button>
        </div>
      )}
    </div>
  )
}

function CajaGrupo({ etiqueta, n }) {
  const col = NIVEL_COLOR.planta
  return <div style={{ background: col.bg, color: col.fg, minWidth: 148, padding: '8px 12px', borderRadius: 4, fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 12.5 }}>{etiqueta} · {n}</div>
}

function Nodo({ persona, personas, costos, mostrarCostos, esGerencia, onEditar, onMover }) {
  const hijos = hijosDe(personas, persona.id)
  const hermanos = hijosDe(personas, persona.jefe_id)
  const idx = hermanos.findIndex(h => h.id === persona.id)
  const porPlanta = { 'Santa Rosa': hijos.filter(h => h.area === 'Santa Rosa'), 'Istria': hijos.filter(h => h.area === 'Istria') }
  const otrosHijos = hijos.filter(h => h.area !== 'Santa Rosa' && h.area !== 'Istria')
  const areasConPlanta = ['Santa Rosa', 'Istria'].filter(a => porPlanta[a].length > 0)

  return (
    <li>
      <Caja persona={persona} costo={costos[persona.id]} mostrarCostos={mostrarCostos} esGerencia={esGerencia} onEditar={onEditar} onMover={onMover} esPrimero={idx <= 0} esUltimo={idx < 0 || idx === hermanos.length - 1} />
      {(otrosHijos.length > 0 || areasConPlanta.length > 0) && (
        <ul>
          {otrosHijos.map(h => <Nodo key={h.id} persona={h} personas={personas} costos={costos} mostrarCostos={mostrarCostos} esGerencia={esGerencia} onEditar={onEditar} onMover={onMover} />)}
          {areasConPlanta.map(area => (
            <li key={area}>
              <CajaGrupo etiqueta={'Planta ' + area} n={porPlanta[area].length} />
              <ul>
                {porPlanta[area].map(h => <Nodo key={h.id} persona={h} personas={personas} costos={costos} mostrarCostos={mostrarCostos} esGerencia={esGerencia} onEditar={onEditar} onMover={onMover} />)}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function PanelAsesores({ asesores }) {
  if (!asesores.length) return null
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 170, border: '1.5px dashed #B9B4AE', borderRadius: 4, background: '#FAF7F4', padding: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.gris, marginBottom: 6, letterSpacing: '.04em' }}>Asesores externos</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {asesores.map(a => (
          <div key={a.id} style={{ background: '#fff', border: '1px dashed #B9B4AE', borderRadius: 3, padding: '5px 8px' }}>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 11.5 }}>{a.nombre}</div>
            <div style={{ fontSize: 10, color: C.gris }}>{a.cargo}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BandaFlujo({ flujo, personas }) {
  const nombreDe = p => p.persona_id ? (personas.find(x => x.id === p.persona_id)?.nombre || '—') : (p.texto || '—')
  return (
    <div style={{ background: '#FAF7F4', border: '1px solid #E2DED4', borderLeft: '4px solid ' + C.ambar, padding: 14, marginTop: 24 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: C.gris, marginBottom: 10, letterSpacing: '.04em' }}>Flujo de trabajo</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {flujo.map((p, i) => (
          <React.Fragment key={p.id}>
            {i > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.ambar, fontSize: 11, fontWeight: 700 }}>
                <div style={{ width: 28, height: 1, background: C.ambar }} />{p.etiqueta_flecha}<div style={{ width: 0, height: 0, borderTop: '4px solid transparent', borderBottom: '4px solid transparent', borderLeft: '6px solid ' + C.ambar }} />
              </div>
            )}
            <div style={{ background: '#fff', border: '1px solid #E2DED4', borderRadius: 4, padding: '8px 14px', minWidth: 140, textAlign: 'center' }}>
              <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 12.5 }}>{nombreDe(p)}</div>
              <div style={{ fontSize: 10.5, color: C.gris, marginTop: 2 }}>{p.subtexto}</div>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

function Leyenda() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 20, paddingTop: 14, borderTop: '1px solid #E2DED4', fontSize: 11, alignItems: 'center' }}>
      <span style={{ fontWeight: 700, textTransform: 'uppercase', color: C.gris, fontSize: 10 }}>Leyenda</span>
      {NIVELES.map(n => (
        <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 13, height: 13, borderRadius: 2, background: NIVEL_COLOR[n].bg, border: n === 'externo' ? '1.5px dashed #B9B4AE' : '1px solid transparent', display: 'inline-block' }} />
          {NIVEL_LABEL[n]}
        </span>
      ))}
      <span style={{ color: C.gris, fontStyle: 'italic' }}>Borde y línea punteada = externo a la empresa</span>
    </div>
  )
}

function FormPersona({ personas, inicial, onGuardar, onCancelar, onEliminar }) {
  const [f, setF] = useState(inicial || { nombre: '', cargo: '', area: 'Santa Rosa', tipo: 'interno', nivel_visual: 'ayudante', jefe_id: '', jefe_id_punteado: '' })
  const opciones = personas.filter(p => !inicial || p.id !== inicial.id)
  return (
    <div onClick={onCancelar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,26,46,.55)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: 480, padding: 20, boxShadow: '0 20px 60px -12px rgba(0,0,0,.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, textTransform: 'uppercase' }}>{inicial ? 'Editar persona' : 'Agregar persona'}</span>
          <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 11, color: C.gris }}>Nombre<input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
          <label style={{ fontSize: 11, color: C.gris }}>Cargo<input value={f.cargo} onChange={e => setF({ ...f, cargo: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ fontSize: 11, color: C.gris, flex: 1 }}>Área
              <select value={f.area} onChange={e => setF({ ...f, area: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }}>{AREAS.map(a => <option key={a} value={a}>{a}</option>)}</select>
            </label>
            <label style={{ fontSize: 11, color: C.gris, flex: 1 }}>Tipo
              <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }}>{TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
          </div>
          <label style={{ fontSize: 11, color: C.gris }}>Nivel visual (color en el organigrama)
            <select value={f.nivel_visual} onChange={e => setF({ ...f, nivel_visual: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }}>{NIVELES.map(n => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}</select>
          </label>
          {f.tipo !== 'asesor_externo' && (
            <label style={{ fontSize: 11, color: C.gris }}>Reporta a
              <select value={f.jefe_id || ''} onChange={e => setF({ ...f, jefe_id: e.target.value || null })} style={{ ...inp, width: '100%', marginTop: 3 }}>
                <option value="">(nadie — raíz del organigrama)</option>
                {opciones.map(p => <option key={p.id} value={p.id}>{p.nombre} — {p.cargo}</option>)}
              </select>
            </label>
          )}
          {f.tipo === 'asesor_externo' && (
            <label style={{ fontSize: 11, color: C.gris }}>Asesora a (normalmente Gerencia General)
              <select value={f.jefe_id || ''} onChange={e => setF({ ...f, jefe_id: e.target.value || null })} style={{ ...inp, width: '100%', marginTop: 3 }}>
                <option value="">(elegir)</option>
                {opciones.map(p => <option key={p.id} value={p.id}>{p.nombre} — {p.cargo}</option>)}
              </select>
            </label>
          )}
          <label style={{ fontSize: 11, color: C.gris }}>Reporte adicional punteado (opcional — ej. doble jefatura)
            <select value={f.jefe_id_punteado || ''} onChange={e => setF({ ...f, jefe_id_punteado: e.target.value || null })} style={{ ...inp, width: '100%', marginTop: 3 }}>
              <option value="">(ninguno)</option>
              {opciones.map(p => <option key={p.id} value={p.id}>{p.nombre} — {p.cargo}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
          {inicial ? <button onClick={() => onEliminar(inicial)} style={{ background: 'none', border: '1px solid #E2C9C2', color: C.rojo, padding: '8px 14px', cursor: 'pointer', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Trash2 size={13} /> Eliminar</button> : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCancelar} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '8px 14px', cursor: 'pointer', fontSize: 12.5 }}>Cancelar</button>
            <button onClick={() => onGuardar(f)} disabled={!f.nombre.trim() || !f.cargo.trim()} style={{ background: C.verde, color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, opacity: (!f.nombre.trim() || !f.cargo.trim()) ? 0.5 : 1 }}>Guardar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OrganigramaModule({ esGerencia = false }) {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [personas, setPersonas] = useState([])
  const [flujo, setFlujo] = useState([])
  const [costos, setCostos] = useState({})
  const [mostrarCostos, setMostrarCostos] = useState(false)
  const [editando, setEditando] = useState(null) // persona | 'nueva' | null
  const [exportando, setExportando] = useState(false)
  const contenedorRef = useRef(null)

  async function refrescar() {
    try { const d = await cargarOrganigrama(); setPersonas(d.personas); setFlujo(d.flujo) }
    catch (e) { setError('No se pudo cargar el organigrama: ' + (e.message || e)) }
  }
  useEffect(() => { refrescar().finally(() => setCargando(false)) }, [])

  async function toggleCostos() {
    if (!mostrarCostos && Object.keys(costos).length === 0) {
      try { setCostos(await cargarCostos(personas)) } catch (e) { setMsg('No se pudieron cargar los costos: ' + (e.message || e)); return }
    }
    setMostrarCostos(v => !v)
  }

  async function guardar(f) {
    try {
      const cambios = { nombre: f.nombre.trim(), cargo: f.cargo.trim(), area: f.area, tipo: f.tipo, nivel_visual: f.nivel_visual, jefe_id: f.jefe_id || null, jefe_id_punteado: f.jefe_id_punteado || null }
      if (f.id) await actualizarPersona(f.id, cambios)
      else await crearPersona({ ...cambios, orden: personas.filter(p => p.jefe_id === cambios.jefe_id).length + 1 })
      setEditando(null); setMsg('Guardado.'); await refrescar()
    } catch (e) { setMsg('Error al guardar (¿tienes permisos de Gerencia?): ' + (e.message || e)) }
  }
  async function eliminar(persona) {
    if (!window.confirm('¿Marcar como inactivo a ' + persona.nombre + '? No se borra el historial, solo deja de mostrarse.')) return
    try { await eliminarPersona(persona.id); setEditando(null); setMsg('Persona dada de baja.'); await refrescar() }
    catch (e) { setMsg('Error al eliminar: ' + (e.message || e)) }
  }
  async function mover(persona, dir) {
    const hermanos = hijosDe(personas, persona.jefe_id)
    const idx = hermanos.findIndex(h => h.id === persona.id)
    const otroIdx = idx + dir
    if (otroIdx < 0 || otroIdx >= hermanos.length) return
    const otro = hermanos[otroIdx]
    try {
      await reordenar([{ id: persona.id, orden: otro.orden }, { id: otro.id, orden: persona.orden }])
      await refrescar()
    } catch (e) { setMsg('Error al reordenar: ' + (e.message || e)) }
  }

  async function exportar(tipo) {
    if (!contenedorRef.current) return
    setExportando(true)
    try {
      const dataUrl = await toPng(contenedorRef.current, { backgroundColor: '#ffffff', pixelRatio: 2 })
      if (tipo === 'png') {
        const a = document.createElement('a'); a.href = dataUrl; a.download = 'organigrama-serein.png'; a.click()
      } else {
        const img = new window.Image()
        await new Promise(res => { img.onload = res; img.src = dataUrl })
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
        const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight()
        const ratio = Math.min(pageW / img.width, pageH / img.height)
        const w = img.width * ratio, h = img.height * ratio
        pdf.addImage(dataUrl, 'PNG', (pageW - w) / 2, (pageH - h) / 2, w, h)
        pdf.save('organigrama-serein.pdf')
      }
    } catch (e) { setMsg('Error al exportar: ' + (e.message || e)) }
    setExportando(false)
  }

  const raices = useMemo(() => personas.filter(p => !p.jefe_id && p.tipo !== 'asesor_externo'), [personas])
  const asesores = useMemo(() => personas.filter(p => p.tipo === 'asesor_externo'), [personas])
  const totalPersonas = personas.filter(p => p.tipo !== 'asesor_externo' && p.tipo !== 'subcontrato').length

  if (cargando) return <div style={{ padding: 24, color: C.gris, fontSize: 13 }}>Cargando organigrama…</div>
  if (error) return <div style={{ padding: 16, background: '#F6E0DA', color: C.rojo, fontSize: 13 }}>{error}</div>

  return (
    <div>
      <TreeStyles />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, color: C.gris }}>{totalPersonas} colaboradores · {personas.filter(p => p.tipo === 'subcontrato').length} subcontratos · {asesores.length} asesores externos</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {esGerencia && <button onClick={toggleCostos} style={{ background: mostrarCostos ? C.carbon : '#fff', color: mostrarCostos ? '#fff' : C.carbon, border: '1px solid #CBD2D6', padding: '7px 12px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>{mostrarCostos ? <EyeOff size={13} /> : <Eye size={13} />} {mostrarCostos ? 'Ocultar costos' : 'Ver costos'}</button>}
          {esGerencia && <button onClick={() => setEditando('nueva')} style={{ background: C.ambar, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Agregar persona</button>}
          <button onClick={() => exportar('png')} disabled={exportando} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '7px 12px', cursor: exportando ? 'default' : 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}><ImageIcon size={13} /> PNG</button>
          <button onClick={() => exportar('pdf')} disabled={exportando} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '7px 12px', cursor: exportando ? 'default' : 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Download size={13} /> PDF (A3)</button>
        </div>
      </div>

      {msg && <div style={{ background: msg.startsWith('Error') ? '#F6E0DA' : '#E7F2EA', color: msg.startsWith('Error') ? C.rojo : C.verde, padding: '8px 12px', marginBottom: 14, fontSize: 12.5 }}>{msg}</div>}

      <div ref={contenedorRef} style={{ background: '#fff', padding: 24, overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, paddingBottom: 14, borderBottom: '3px solid ' + C.ambar }}>
          <img src="/logo-serein.jpg" alt="Serein" style={{ height: 40 }} />
          <div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 20, textTransform: 'uppercase' }}>Organigrama</div>
            <div style={{ fontSize: 11.5, color: C.gris }}>Estructura organizacional · Santa Rosa · Istria · Proyectos · {totalPersonas} colaboradores</div>
          </div>
        </div>

        <div style={{ position: 'relative', minHeight: 60 }}>
          <PanelAsesores asesores={asesores} />
          <ul className="org-tree" style={{ display: 'flex', justifyContent: 'center' }}>
            {raices.map(r => <Nodo key={r.id} persona={r} personas={personas} costos={costos} mostrarCostos={mostrarCostos} esGerencia={esGerencia} onEditar={setEditando} onMover={mover} />)}
          </ul>
        </div>

        {flujo.length > 0 && <BandaFlujo flujo={flujo} personas={personas} />}
        <Leyenda />
      </div>

      {editando && (
        <FormPersona
          personas={personas}
          inicial={editando === 'nueva' ? null : editando}
          onGuardar={guardar}
          onCancelar={() => setEditando(null)}
          onEliminar={eliminar}
        />
      )}
    </div>
  )
}
