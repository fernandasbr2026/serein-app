// Vista de gerencia para el Portal de Subcontratistas (Fase I3 del plan).
// Dos partes: la cola de facturas pendientes de aceptar/rechazar, y el
// panel para asignar a cada subcontratista qué OT/Centro de Costo puede
// usar. A diferencia de SubcontratoApp.jsx, este componente SÍ corre
// dentro del árbol normal de Dashboard.jsx (gerencia ya tiene acceso a
// todo hoy) — lee `facturas_subcontrato`/`subcontrato_asignaciones`
// directo de Supabase (tablas reales con RLS), y para aplicar una
// aceptación reutiliza `onAddCompra` que ya recibe ProyectosModule, para
// que quede exactamente igual que si la persona hubiera cargado la
// compra ella misma.
import React, { useState, useEffect, useMemo } from 'react'
import { Check, X, UserPlus, FileText } from 'lucide-react'
import { supabase } from './supabase.js'
import { intentar } from './db.js'
import { SEREIN } from './theme-serein.js'
import { CC_DEFS } from './proyectos-data.js'
import { blobToBase64 } from './protocolo-pdf.js'

const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const inp = { padding: '7px 9px', border: '1px solid #DFE4EA', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }
const montoBruto = f => f.exento ? (f.monto || 0) : Math.round((f.monto || 0) * 1.19)
// Mismo criterio que ccCodigos()/nombreCC() de ProyectosModule.jsx (no
// exportados de ahí, se duplica la misma lógica chica — igual que
// normMarca() se duplica entre módulos en el resto de la app) para poder
// mostrar los Centros de Costo REALES de cada proyecto en vez de que la
// persona tenga que adivinar/escribir el código a mano.
const nombreDefaultCC = id => (CC_DEFS.find(c => c.id === id) || {}).nombre || id
const nombreCC = (p, id) => (p.ccNombres && p.ccNombres[id]) || nombreDefaultCC(id)
const ccCodigos = p => [...new Set([...CC_DEFS.map(c => c.id), ...Object.keys(p.cc || {}), ...(p.compras || []).map(c => c.cc)])].filter(Boolean)

function FilaPendiente({ f, onAddCompra, onDecidido }) {
  const [abonado, setAbonado] = useState('')
  const [pagadaCompleta, setPagadaCompleta] = useState(false)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [procesando, setProcesando] = useState(false)
  const bruto = montoBruto(f)

  useEffect(() => {
    let vivo = true
    supabase.storage.from('facturas-subcontrato').createSignedUrl(f.pdf_path, 3600).then(({ data }) => { if (vivo && data) setPdfUrl(data.signedUrl) })
    return () => { vivo = false }
  }, [f.pdf_path])

  const aceptar = async () => {
    setProcesando(true)
    try {
      const abonadoFinal = pagadaCompleta ? bruto : (parseInt(String(abonado).replace(/\D/g, ''), 10) || 0)
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('facturas_subcontrato').update({
        estado: 'aceptada', abonado: abonadoFinal, decidido_por: (user && user.email) || '', decidido_en: new Date().toISOString(),
      }).eq('id', f.id)
      if (error) throw error
      onAddCompra(f.ot, {
        proveedor: f.proveedor, detalle: f.detalle, fecha: f.fecha || '—', monto: f.monto,
        cc: f.cc, folio: f.folio, rut: f.rut, exento: !!f.exento, abonado: abonadoFinal,
        // Enlace con la factura del portal: portal_subcontrato_resumen() lo usa
        // para mostrarle al subcontratista el abonado ACTUAL de esta compra.
        facturaSubcontratoId: f.id,
      })
      // Sube el PDF (ya guardado en el bucket propio de Franco) a Drive,
      // organizado COMPRAS / OT / Centro de Costo — misma Edge Function
      // que ya usa el "Subir factura" de la ficha de proyecto, recien al
      // aceptar (no cuando Franco lo sube, todavia puede rechazarse).
      try {
        const { data: descarga, error: errDescarga } = await supabase.storage.from('facturas-subcontrato').download(f.pdf_path)
        if (errDescarga) throw errDescarga
        const pdfBase64 = await blobToBase64(descarga)
        const filename = (f.folio ? f.folio + ' - ' : '') + (f.proveedor || 'Proveedor') + '.pdf'
        const { data: subida, error: errSubida } = await supabase.functions.invoke('subir-factura-compra-drive', { body: { pdfBase64, filename, ot: f.ot, centroCosto: f.cc_nombre || f.cc } })
        if (errSubida) throw errSubida
        if (!subida || !subida.ok) throw new Error((subida && subida.error) || 'No se pudo subir a Drive.')
      } catch (err) {
        window.alert('La factura quedó aceptada y agregada a Compras, pero no se pudo subir el PDF a Drive: ' + ((err && err.message) || String(err)))
      }
      onDecidido()
    } catch (err) { window.alert('No se pudo aceptar la factura: ' + ((err && err.message) || String(err))) }
    setProcesando(false)
  }

  const rechazar = async () => {
    if (!window.confirm(`¿Rechazar la factura de ${f.proveedor} (${clp(bruto)})? No se creará ninguna compra.`)) return
    setProcesando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('facturas_subcontrato').update({
        estado: 'rechazada', decidido_por: (user && user.email) || '', decidido_en: new Date().toISOString(),
      }).eq('id', f.id)
      if (error) throw error
      onDecidido()
    } catch (err) { window.alert('No se pudo rechazar la factura: ' + ((err && err.message) || String(err))) }
    setProcesando(false)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #DFE4EA', borderRadius: 6, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{f.proveedor || 'Sin proveedor'} {f.folio ? '· Folio ' + f.folio : ''}</div>
          <div style={{ fontSize: 12.5, color: C.gris }}>OT {f.ot} · <b>{f.cc}</b> {f.cc_nombre ? '· ' + f.cc_nombre : ''} · {f.fecha || 'sin fecha'} · {clp(bruto)}{pdfUrl && <> · <a href={pdfUrl} target="_blank" rel="noreferrer" style={{ color: C.teal }}>ver PDF</a></>}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={pagadaCompleta ? bruto : abonado} disabled={pagadaCompleta} onChange={e => setAbonado(e.target.value)} placeholder="Abonado" style={{ ...inp, width: 100 }} />
          <label style={{ fontSize: 11.5, color: C.gris, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={pagadaCompleta} onChange={e => setPagadaCompleta(e.target.checked)} /> Pago completo</label>
          <button onClick={aceptar} disabled={procesando} style={{ background: procesando ? '#9AA3AD' : C.verde, color: '#fff', border: 'none', borderRadius: 4, padding: '7px 12px', cursor: procesando ? 'default' : 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5 }}><Check size={13} /> Aceptar</button>
          <button onClick={rechazar} disabled={procesando} style={{ background: 'none', border: '1px solid ' + C.rojo, color: C.rojo, borderRadius: 4, padding: '7px 12px', cursor: procesando ? 'default' : 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5 }}><X size={13} /> Rechazar</button>
        </div>
      </div>
    </div>
  )
}

function PanelAsignar({ proyectos = [] }) {
  const [subcontratistas, setSubcontratistas] = useState([])
  const [asignaciones, setAsignaciones] = useState([])
  const [perfilId, setPerfilId] = useState('')
  const [proyectoId, setProyectoId] = useState('')
  const [cc, setCc] = useState('')
  const [montoAcordado, setMontoAcordado] = useState('')
  const [msg, setMsg] = useState('')
  const [editando, setEditando] = useState(null)   // { id, valor } de la fila cuyo monto acordado se está editando

  const cargar = async () => {
    const [p, a] = await Promise.all([
      supabase.from('perfiles').select('id,nombre').eq('tipo', 'subcontrato'),
      supabase.from('subcontrato_asignaciones').select('*').order('created_at', { ascending: false }),
    ])
    setSubcontratistas(p.data || [])
    setAsignaciones(a.data || [])
  }
  useEffect(() => { cargar() }, [])

  const proyecto = proyectos.find(p => p.id === proyectoId) || null
  const ccsDelProyecto = proyecto ? ccCodigos(proyecto) : []

  const agregar = async () => {
    if (!perfilId || !proyecto || !cc) { window.alert('Elige el subcontratista, el proyecto y el centro de costo.'); return }
    const fila = { perfil_id: perfilId, ot: proyecto.ot, cc, cc_nombre: nombreCC(proyecto, cc) }
    const monto = parseInt(String(montoAcordado).replace(/\D/g, ''), 10)
    // monto_acordado existe desde la migración 2026-11-11; si todavía no se
    // corrió, se asigna igual (sin monto) para no frenar a gerencia.
    let { error } = await supabase.from('subcontrato_asignaciones').insert(monto > 0 ? { ...fila, monto_acordado: monto } : fila)
    if (error && monto > 0 && /monto_acordado/.test(error.message || '')) {
      ;({ error } = await supabase.from('subcontrato_asignaciones').insert(fila))
      if (!error) window.alert('La asignación quedó guardada, pero SIN el monto acordado: falta correr en Supabase la migración 2026-11-11-portal-subcontratista-resumen.sql.')
    }
    if (error) { window.alert('No se pudo agregar: ' + error.message); return }
    setCc(''); setMontoAcordado(''); setMsg('Asignación agregada.')
    cargar()
  }
  const guardarMonto = async () => {
    if (!editando) return
    const monto = parseInt(String(editando.valor).replace(/\D/g, ''), 10)
    const { error } = await supabase.from('subcontrato_asignaciones').update({ monto_acordado: monto > 0 ? monto : null }).eq('id', editando.id)
    if (error) { window.alert('No se pudo guardar el monto acordado: ' + error.message + (/monto_acordado/.test(error.message || '') ? ' (falta correr la migración 2026-11-11-portal-subcontratista-resumen.sql)' : '')); return }
    setEditando(null)
    cargar()
  }
  const quitar = async id => {
    if (!window.confirm('¿Quitar esta asignación?')) return
    if (await intentar(supabase.from('subcontrato_asignaciones').delete().eq('id', id), 'Quitar asignación')) cargar()
  }

  const nombreDe = pid => (subcontratistas.find(s => s.id === pid) || {}).nombre || pid

  if (!subcontratistas.length) {
    return <div style={{ fontSize: 13, color: C.gris }}>No hay ningún perfil con tipo "subcontrato" todavía — créalo primero (ver migración del Portal de Subcontratistas).</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <select value={perfilId} onChange={e => setPerfilId(e.target.value)} style={inp}>
          <option value="">Subcontratista…</option>
          {subcontratistas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select value={proyectoId} onChange={e => { setProyectoId(e.target.value); setCc('') }} style={{ ...inp, minWidth: 220 }}>
          <option value="">Proyecto / OT…</option>
          {proyectos.filter(p => !p.cerrado).map(p => <option key={p.id} value={p.id}>{p.nombre || p.ot} · {p.ot}</option>)}
        </select>
        <select value={cc} onChange={e => setCc(e.target.value)} disabled={!proyecto} style={inp}>
          <option value="">{proyecto ? 'Centro de costo…' : 'Elige un proyecto primero'}</option>
          {ccsDelProyecto.map(id => <option key={id} value={id}>{id} · {nombreCC(proyecto, id)}</option>)}
        </select>
        <input value={montoAcordado} onChange={e => setMontoAcordado(e.target.value)} placeholder="Monto acordado neto (opcional)" title="Lo que Serein acordó pagarle en este centro de costo (neto). El subcontratista lo ve en su portal como «Acordado» y «Por facturar». Si queda vacío, su portal usa el presupuesto del CC." style={{ ...inp, width: 210 }} />
        <button onClick={agregar} style={{ background: C.teal, color: '#fff', border: 'none', borderRadius: 4, padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5 }}><UserPlus size={13} /> Asignar</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: C.verde, marginBottom: 8 }}>{msg}</div>}
      {asignaciones.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ borderBottom: '1px solid #E4E8ED' }}>{['Subcontratista', 'OT', 'CC', 'Centro de costo', 'Monto acordado (neto)', ''].map((h, i) => <th key={i} style={{ textAlign: i === 4 ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
          <tbody>
            {asignaciones.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid #DFE4EA' }}>
                <td style={{ padding: '5px 8px' }}>{nombreDe(a.perfil_id)}</td>
                <td style={{ padding: '5px 8px', fontWeight: 600 }}>{a.ot}</td>
                <td style={{ padding: '5px 8px', fontWeight: 700 }}>{a.cc}</td>
                <td style={{ padding: '5px 8px' }}>{a.cc_nombre || ''}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {editando && editando.id === a.id ? (
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <input autoFocus value={editando.valor} onChange={e => setEditando({ id: a.id, valor: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') guardarMonto(); if (e.key === 'Escape') setEditando(null) }} style={{ ...inp, width: 120, textAlign: 'right', padding: '4px 6px' }} />
                      <button onClick={guardarMonto} style={{ background: C.verde, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 11.5 }}>Guardar</button>
                      <button onClick={() => setEditando(null)} style={{ background: 'none', border: '1px solid #DFE4EA', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 11.5 }}>Cancelar</button>
                    </span>
                  ) : (
                    <button onClick={() => setEditando({ id: a.id, valor: a.monto_acordado || '' })} title="Cambiar el monto acordado" style={{ background: 'none', border: 'none', cursor: 'pointer', color: a.monto_acordado ? C.carbon : C.gris, fontSize: 12.5, textDecoration: 'underline dotted', padding: 0 }}>{a.monto_acordado ? clp(a.monto_acordado) : 'fijar monto'}</button>
                  )}
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}><button onClick={() => quitar(a.id)} style={{ background: 'none', border: 'none', color: C.rojo, cursor: 'pointer' }}><X size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// Asignar OT de Control de Taller a una persona externa (Fase J4) — mismo
// patrón que PanelAsignar de arriba, pero sin Centro de Costo (Control de
// Taller no tiene ese concepto) y sobre taller_asignaciones en vez de
// subcontrato_asignaciones.
function PanelAsignarTaller({ proyectos = [] }) {
  const [personas, setPersonas] = useState([])
  const [asignaciones, setAsignaciones] = useState([])
  const [perfilId, setPerfilId] = useState('')
  const [proyectoId, setProyectoId] = useState('')
  const [msg, setMsg] = useState('')

  const cargar = async () => {
    const [p, a] = await Promise.all([
      supabase.from('perfiles').select('id,nombre').eq('tipo', 'taller_externo'),
      supabase.from('taller_asignaciones').select('*').order('created_at', { ascending: false }),
    ])
    setPersonas(p.data || [])
    setAsignaciones(a.data || [])
  }
  useEffect(() => { cargar() }, [])

  const agregar = async () => {
    const proyecto = proyectos.find(p => p.id === proyectoId)
    if (!perfilId || !proyecto) { window.alert('Elige la persona y el proyecto.'); return }
    const { error } = await supabase.from('taller_asignaciones').insert({ perfil_id: perfilId, ot: proyecto.ot })
    if (error) { window.alert('No se pudo agregar: ' + error.message); return }
    setMsg('Asignación agregada.')
    cargar()
  }
  const quitar = async id => {
    if (!window.confirm('¿Quitar esta asignación?')) return
    if (await intentar(supabase.from('taller_asignaciones').delete().eq('id', id), 'Quitar asignación')) cargar()
  }

  const nombreDe = pid => (personas.find(s => s.id === pid) || {}).nombre || pid

  if (!personas.length) {
    return <div style={{ fontSize: 13, color: C.gris }}>No hay ningún perfil con tipo "taller_externo" todavía — créalo primero (ver migración de Control de Taller para externos).</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <select value={perfilId} onChange={e => setPerfilId(e.target.value)} style={inp}>
          <option value="">Persona…</option>
          {personas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select value={proyectoId} onChange={e => setProyectoId(e.target.value)} style={{ ...inp, minWidth: 220 }}>
          <option value="">Proyecto / OT…</option>
          {proyectos.filter(p => !p.cerrado).map(p => <option key={p.id} value={p.id}>{p.nombre || p.ot} · {p.ot}</option>)}
        </select>
        <button onClick={agregar} style={{ background: C.teal, color: '#fff', border: 'none', borderRadius: 4, padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5 }}><UserPlus size={13} /> Asignar</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: C.verde, marginBottom: 8 }}>{msg}</div>}
      {asignaciones.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ borderBottom: '1px solid #E4E8ED' }}>{['Persona', 'OT', ''].map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
          <tbody>
            {asignaciones.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid #DFE4EA' }}>
                <td style={{ padding: '5px 8px' }}>{nombreDe(a.perfil_id)}</td>
                <td style={{ padding: '5px 8px' }}>{a.ot}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}><button onClick={() => quitar(a.id)} style={{ background: 'none', border: 'none', color: C.rojo, cursor: 'pointer' }}><X size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function SubcontratistasModule({ onAddCompraPorOT, proyectos = [] }) {
  const [pendientes, setPendientes] = useState([])
  const [cargando, setCargando] = useState(true)

  const cargar = async () => {
    setCargando(true)
    const { data } = await supabase.from('facturas_subcontrato').select('*').eq('estado', 'pendiente').order('created_at')
    setPendientes(data || [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  return (
    <div>
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}><FileText size={16} /> Facturas de subcontratistas pendientes ({pendientes.length})</div>
      {cargando ? (
        <div style={{ fontSize: 13, color: C.gris }}>Cargando…</div>
      ) : pendientes.length === 0 ? (
        <div style={{ fontSize: 13, color: C.gris, marginBottom: 24 }}>No hay facturas pendientes de revisión.</div>
      ) : (
        <div style={{ marginBottom: 24 }}>
          {pendientes.map(f => <FilaPendiente key={f.id} f={f} onAddCompra={onAddCompraPorOT} onDecidido={cargar} />)}
        </div>
      )}

      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase', marginBottom: 10 }}>Asignar subcontratista a OT / Centro de Costo</div>
      <PanelAsignar proyectos={proyectos} />

      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase', margin: '24px 0 10px' }}>Asignar Control de Taller (acceso externo)</div>
      <PanelAsignarTaller proyectos={proyectos} />
    </div>
  )
}
