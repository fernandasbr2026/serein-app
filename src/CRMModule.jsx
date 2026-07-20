import React, { useState, useEffect, useMemo } from 'react'
import { Plus, X, Trash2, Phone, Mail, MessageCircle, Users as UsersIcon, Target, Clock } from 'lucide-react'
import {
  cargarClientes, crearCliente, actualizarCliente,
  cargarPersonas, crearPersona, eliminarPersona,
  cargarInteracciones, crearInteraccion, eliminarInteraccion,
  cargarOportunidades, crearOportunidad, actualizarOportunidad, eliminarOportunidad,
} from './crm-api.js'

// ============================================================
// CRM — leads + clientes en una sola tabla (etapa), bitácora de
// seguimiento y pipeline de oportunidades (mismos estados que ya
// usan las cotizaciones). Los leads de WhatsApp entran solos vía
// un webhook (supabase/functions/whatsapp-webhook) una vez que se
// conecte la cuenta de WhatsApp Business API — mientras tanto se
// cargan a mano igual que cualquier otro lead.
// ============================================================

const C = { azul: '#061A40', teal: '#0B7285', ambar: '#FF6B00', rojo: '#D64545', verde: '#12805C', carbon: '#0F1A2E', gris: '#8A929E' }
const inp = { padding: '7px 9px', border: '1px solid #CBD2D6', fontSize: 13, boxSizing: 'border-box' }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')

const ETAPAS = ['Lead nuevo', 'Contactado', 'Calificado', 'Cliente', 'Descartado']
const colorEtapa = e => ({
  'Lead nuevo': ['#EEF1F4', '#5A6B77'], 'Contactado': ['#F9E9DE', C.ambar], 'Calificado': ['#E7EEF2', C.azul],
  'Cliente': ['#E7F2EA', C.verde], 'Descartado': ['#F6E0DA', C.rojo],
}[e] || ['#EEE', C.gris])
const ORIGENES = ['WhatsApp', 'Referido', 'Web', 'Llamada', 'Feria/Evento', 'Otro']
const TIPOS_INT = [['whatsapp', 'WhatsApp', MessageCircle], ['llamada', 'Llamada', Phone], ['reunion', 'Reunión', UsersIcon], ['correo', 'Correo', Mail], ['nota', 'Nota', Clock], ['visita', 'Visita', UsersIcon]]
const ETAPAS_OP = ['Alta probabilidad de cierre', 'Baja probabilidad de cierre', 'Aprobada', 'Rechazada', 'Otro']

function FormLead({ onGuardar, onCancelar }) {
  const [f, setF] = useState({ nombre: '', telefono: '', whatsapp_id: '', correo: '', rut: '', origen: 'WhatsApp', vendedor: 'Venta general' })
  return (
    <div onClick={onCancelar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,26,46,.55)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: 440, padding: 20, boxShadow: '0 20px 60px -12px rgba(0,0,0,.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, textTransform: 'uppercase' }}>Agregar lead</span>
          <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 11, color: C.gris }}>Nombre / Empresa *<input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
          <label style={{ fontSize: 11, color: C.gris }}>Teléfono<input value={f.telefono} onChange={e => setF({ ...f, telefono: e.target.value })} placeholder="+56 9 1234 5678" style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
          <label style={{ fontSize: 11, color: C.gris }}>WhatsApp (formato +56912345678, opcional)<input value={f.whatsapp_id} onChange={e => setF({ ...f, whatsapp_id: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
          <label style={{ fontSize: 11, color: C.gris }}>Correo<input value={f.correo} onChange={e => setF({ ...f, correo: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
          <label style={{ fontSize: 11, color: C.gris }}>RUT (si ya se sabe)<input value={f.rut} onChange={e => setF({ ...f, rut: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
          <label style={{ fontSize: 11, color: C.gris }}>Origen
            <select value={f.origen} onChange={e => setF({ ...f, origen: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }}>{ORIGENES.map(o => <option key={o} value={o}>{o}</option>)}</select>
          </label>
          <label style={{ fontSize: 11, color: C.gris }}>Vendedor
            <select value={f.vendedor} onChange={e => setF({ ...f, vendedor: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }}><option value="Venta general">Venta general</option><option value="Mario Vidal">Mario Vidal</option></select>
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={onCancelar} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '8px 14px', cursor: 'pointer', fontSize: 12.5 }}>Cancelar</button>
          <button onClick={() => f.nombre.trim() && onGuardar({ ...f, nombre: f.nombre.trim(), whatsapp_id: f.whatsapp_id.trim() || null })} disabled={!f.nombre.trim()} style={{ background: C.verde, color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, opacity: f.nombre.trim() ? 1 : 0.5 }}>Guardar</button>
        </div>
      </div>
    </div>
  )
}

function FormInteraccion({ onGuardar, onCancelar }) {
  const [f, setF] = useState({ tipo: 'llamada', direccion: 'saliente', texto: '', proxima_accion: '', proxima_fecha: '' })
  return (
    <div style={{ background: '#F7F4EE', padding: 10, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })} style={inp}>{TIPOS_INT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={f.direccion} onChange={e => setF({ ...f, direccion: e.target.value })} style={inp}><option value="saliente">Saliente (nosotros)</option><option value="entrante">Entrante (cliente)</option></select>
      </div>
      <textarea value={f.texto} onChange={e => setF({ ...f, texto: e.target.value })} placeholder="Qué se conversó / notas…" style={{ ...inp, width: '100%', minHeight: 60, resize: 'vertical', marginBottom: 6 }} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={f.proxima_accion} onChange={e => setF({ ...f, proxima_accion: e.target.value })} placeholder="Próxima acción (opcional)" style={{ ...inp, flex: '1 1 180px' }} />
        <input type="date" value={f.proxima_fecha} onChange={e => setF({ ...f, proxima_fecha: e.target.value })} style={inp} />
        <button onClick={() => onGuardar({ ...f, proxima_accion: f.proxima_accion || null, proxima_fecha: f.proxima_fecha || null })} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar</button>
        <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gris }}><X size={16} /></button>
      </div>
    </div>
  )
}

function FormOportunidad({ onGuardar, onCancelar }) {
  const [f, setF] = useState({ nombre: '', etapa: 'Alta probabilidad de cierre', monto_estimado: '', cotizacion_folio: '', fecha_cierre_estimada: '' })
  return (
    <div style={{ background: '#F7F4EE', padding: 10, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Obra / motivo" style={{ ...inp, flex: '1 1 180px' }} />
        <select value={f.etapa} onChange={e => setF({ ...f, etapa: e.target.value })} style={inp}>{ETAPAS_OP.map(e2 => <option key={e2} value={e2}>{e2}</option>)}</select>
        <input value={f.monto_estimado} onChange={e => setF({ ...f, monto_estimado: e.target.value })} placeholder="Monto estimado CLP" style={{ ...inp, width: 150 }} />
        <input value={f.cotizacion_folio} onChange={e => setF({ ...f, cotizacion_folio: e.target.value })} placeholder="Folio cotización (opcional)" style={{ ...inp, width: 160 }} />
        <input type="date" value={f.fecha_cierre_estimada} onChange={e => setF({ ...f, fecha_cierre_estimada: e.target.value })} style={inp} />
        <button onClick={() => f.nombre.trim() && onGuardar({ ...f, nombre: f.nombre.trim(), monto_estimado: Number(f.monto_estimado) || null, cotizacion_folio: f.cotizacion_folio || null, fecha_cierre_estimada: f.fecha_cierre_estimada || null })} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar</button>
        <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gris }}><X size={16} /></button>
      </div>
    </div>
  )
}

function FormPersonaContacto({ onGuardar, onCancelar }) {
  const [f, setF] = useState({ nombre: '', cargo: '', telefono: '', correo: '', es_principal: false })
  return (
    <div style={{ background: '#F7F4EE', padding: 10, marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Nombre" style={{ ...inp, width: 150 }} />
      <input value={f.cargo} onChange={e => setF({ ...f, cargo: e.target.value })} placeholder="Cargo" style={{ ...inp, width: 130 }} />
      <input value={f.telefono} onChange={e => setF({ ...f, telefono: e.target.value })} placeholder="Teléfono" style={{ ...inp, width: 130 }} />
      <input value={f.correo} onChange={e => setF({ ...f, correo: e.target.value })} placeholder="Correo" style={{ ...inp, width: 170 }} />
      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={f.es_principal} onChange={e => setF({ ...f, es_principal: e.target.checked })} /> Principal</label>
      <button onClick={() => f.nombre.trim() && onGuardar({ ...f, nombre: f.nombre.trim() })} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar</button>
      <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gris }}><X size={16} /></button>
    </div>
  )
}

function FichaCliente({ cliente, onClose, onActualizado }) {
  const [f, setF] = useState(cliente)
  const [personas, setPersonas] = useState([])
  const [interacciones, setInteracciones] = useState([])
  const [oportunidades, setOportunidades] = useState([])
  const [addPersona, setAddPersona] = useState(false)
  const [addInt, setAddInt] = useState(false)
  const [addOp, setAddOp] = useState(false)
  const [msg, setMsg] = useState('')

  async function refrescar() {
    try {
      const [p, i, o] = await Promise.all([cargarPersonas(cliente.id), cargarInteracciones(cliente.id), cargarOportunidades(cliente.id)])
      setPersonas(p); setInteracciones(i); setOportunidades(o)
    } catch (e) { setMsg('Error al cargar: ' + (e.message || e)) }
  }
  useEffect(() => { refrescar() }, [cliente.id])

  async function guardarCampos() {
    try { await actualizarCliente(cliente.id, f); onActualizado({ ...cliente, ...f }); setMsg('Guardado.') }
    catch (e) { setMsg('Error al guardar: ' + (e.message || e)) }
  }

  const card = { border: '1px solid #E2DED4', padding: 14, marginBottom: 14, background: '#fff' }
  const h = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: C.gris, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,26,46,.55)', zIndex: 80, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#F7F6F3', width: '100%', maxWidth: 760, boxShadow: '0 20px 60px -12px rgba(0,0,0,.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #E2DED4', background: '#fff', position: 'sticky', top: 0, zIndex: 2 }}>
          <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, textTransform: 'uppercase' }}>{cliente.nombre}</span>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #CBD2D6', cursor: 'pointer', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}><X size={15} /> Cerrar</button>
        </div>
        <div style={{ padding: 16 }}>
          {msg && <div style={{ background: msg.startsWith('Error') ? '#F6E0DA' : '#E7F2EA', color: msg.startsWith('Error') ? C.rojo : C.verde, padding: '8px 12px', marginBottom: 12, fontSize: 12.5 }}>{msg}</div>}

          <div style={card}>
            <div style={h}><span>Datos</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
              <label style={{ fontSize: 11, color: C.gris }}>Nombre<input value={f.nombre || ''} onChange={e => setF({ ...f, nombre: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
              <label style={{ fontSize: 11, color: C.gris }}>RUT<input value={f.rut || ''} onChange={e => setF({ ...f, rut: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
              <label style={{ fontSize: 11, color: C.gris }}>Giro<input value={f.giro || ''} onChange={e => setF({ ...f, giro: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
              <label style={{ fontSize: 11, color: C.gris }}>Teléfono<input value={f.telefono || ''} onChange={e => setF({ ...f, telefono: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
              <label style={{ fontSize: 11, color: C.gris }}>WhatsApp<input value={f.whatsapp_id || ''} onChange={e => setF({ ...f, whatsapp_id: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
              <label style={{ fontSize: 11, color: C.gris }}>Correo<input value={f.correo || ''} onChange={e => setF({ ...f, correo: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
              <label style={{ fontSize: 11, color: C.gris }}>Dirección<input value={f.direccion || ''} onChange={e => setF({ ...f, direccion: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
              <label style={{ fontSize: 11, color: C.gris }}>Comuna<input value={f.comuna || ''} onChange={e => setF({ ...f, comuna: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
              <label style={{ fontSize: 11, color: C.gris }}>Vendedor
                <select value={f.vendedor || 'Venta general'} onChange={e => setF({ ...f, vendedor: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }}><option value="Venta general">Venta general</option><option value="Mario Vidal">Mario Vidal</option></select>
              </label>
              <label style={{ fontSize: 11, color: C.gris }}>Etapa
                <select value={f.etapa || 'Lead nuevo'} onChange={e => setF({ ...f, etapa: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }}>{ETAPAS.map(e2 => <option key={e2} value={e2}>{e2}</option>)}</select>
              </label>
            </div>
            <button onClick={guardarCampos} style={{ marginTop: 10, background: C.azul, color: '#fff', border: 'none', padding: '7px 16px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Guardar datos</button>
          </div>

          <div style={card}>
            <div style={h}><span>Personas de contacto</span><button onClick={() => setAddPersona(true)} style={{ background: C.teal, color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={12} /> Agregar</button></div>
            {personas.length === 0 ? <div style={{ fontSize: 12.5, color: C.gris }}>Sin personas registradas.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {personas.map(p => (
                  <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, borderBottom: '1px solid #EEE9DF', paddingBottom: 4 }}>
                    <b>{p.nombre}</b>{p.es_principal && <span style={{ fontSize: 10, background: C.verde, color: '#fff', padding: '1px 6px' }}>Principal</span>}
                    <span style={{ color: C.gris }}>{p.cargo}</span><span style={{ color: C.gris }}>{p.telefono}</span><span style={{ color: C.gris }}>{p.correo}</span>
                    <button onClick={async () => { await eliminarPersona(p.id); refrescar() }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            {addPersona && <FormPersonaContacto onGuardar={async d => { try { await crearPersona({ ...d, cliente_id: cliente.id }); setAddPersona(false); refrescar() } catch (e) { setMsg('Error: ' + (e.message || e)) } }} onCancelar={() => setAddPersona(false)} />}
          </div>

          <div style={card}>
            <div style={h}><span><Target size={13} style={{ verticalAlign: -2 }} /> Oportunidades</span><button onClick={() => setAddOp(true)} style={{ background: C.teal, color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={12} /> Agregar</button></div>
            {oportunidades.length === 0 ? <div style={{ fontSize: 12.5, color: C.gris }}>Sin oportunidades registradas.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {oportunidades.map(o => { const [cf, ct] = colorEtapa(o.etapa === 'Aprobada' ? 'Cliente' : o.etapa === 'Rechazada' ? 'Descartado' : 'Contactado'); return (
                  <div key={o.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, borderBottom: '1px solid #EEE9DF', paddingBottom: 4 }}>
                    <b>{o.nombre}</b>
                    <select value={o.etapa} onChange={async e => { await actualizarOportunidad(o.id, { etapa: e.target.value }); refrescar() }} style={{ border: 'none', background: cf, color: ct, padding: '3px 6px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{ETAPAS_OP.map(e2 => <option key={e2} value={e2}>{e2}</option>)}</select>
                    {o.monto_estimado ? <span style={{ color: C.gris }}>{clp(o.monto_estimado)}</span> : null}
                    {o.cotizacion_folio && <span style={{ color: C.gris }}>Folio {o.cotizacion_folio}</span>}
                    <button onClick={async () => { await eliminarOportunidad(o.id); refrescar() }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button>
                  </div>
                )})}
              </div>
            )}
            {addOp && <FormOportunidad onGuardar={async d => { try { await crearOportunidad({ ...d, cliente_id: cliente.id }); setAddOp(false); refrescar() } catch (e) { setMsg('Error: ' + (e.message || e)) } }} onCancelar={() => setAddOp(false)} />}
          </div>

          <div style={card}>
            <div style={h}><span><Clock size={13} style={{ verticalAlign: -2 }} /> Bitácora de seguimiento</span><button onClick={() => setAddInt(true)} style={{ background: C.teal, color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={12} /> Agregar</button></div>
            {interacciones.length === 0 ? <div style={{ fontSize: 12.5, color: C.gris }}>Sin interacciones registradas.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {interacciones.map(x => {
                  const Icono = (TIPOS_INT.find(t => t[0] === x.tipo) || [])[2] || Clock
                  return (
                    <div key={x.id} style={{ borderBottom: '1px solid #EEE9DF', paddingBottom: 6, fontSize: 12.5 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Icono size={13} color={C.teal} />
                        <b>{(TIPOS_INT.find(t => t[0] === x.tipo) || [null, x.tipo])[1]}</b>
                        {x.direccion && <span style={{ color: C.gris }}>({x.direccion})</span>}
                        <span style={{ color: C.gris, marginLeft: 'auto' }}>{new Date(x.fecha).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <button onClick={async () => { await eliminarInteraccion(x.id); refrescar() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={12} /></button>
                      </div>
                      {x.texto && <div style={{ marginTop: 3, color: C.carbon }}>{x.texto}</div>}
                      {x.proxima_accion && <div style={{ marginTop: 3, color: C.ambar, fontWeight: 600 }}>Próxima acción: {x.proxima_accion}{x.proxima_fecha ? ' — ' + x.proxima_fecha : ''}</div>}
                    </div>
                  )
                })}
              </div>
            )}
            {addInt && <FormInteraccion onGuardar={async d => { try { await crearInteraccion({ ...d, cliente_id: cliente.id }); setAddInt(false); refrescar() } catch (e) { setMsg('Error: ' + (e.message || e)) } }} onCancelar={() => setAddInt(false)} />}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CRMModule() {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [clientes, setClientes] = useState([])
  const [q, setQ] = useState('')
  const [fEtapa, setFEtapa] = useState('')
  const [addLead, setAddLead] = useState(false)
  const [seleccionado, setSeleccionado] = useState(null)

  async function refrescar() {
    try { setClientes(await cargarClientes()) } catch (e) { setError('No se pudo cargar el CRM: ' + (e.message || e)) }
  }
  useEffect(() => { refrescar().finally(() => setCargando(false)) }, [])

  const filtrados = useMemo(() => clientes.filter(c => {
    if (fEtapa && c.etapa !== fEtapa) return false
    if (q) { const t = ((c.nombre || '') + ' ' + (c.rut || '') + ' ' + (c.telefono || '') + ' ' + (c.correo || '')).toLowerCase(); if (!t.includes(q.toLowerCase())) return false }
    return true
  }), [clientes, q, fEtapa])

  const porEtapa = useMemo(() => {
    const m = {}; ETAPAS.forEach(e => { m[e] = 0 }); clientes.forEach(c => { m[c.etapa] = (m[c.etapa] || 0) + 1 }); return m
  }, [clientes])

  if (cargando) return <div style={{ padding: 24, color: C.gris, fontSize: 13 }}>Cargando CRM…</div>
  if (error) return <div style={{ padding: 16, background: '#F6E0DA', color: C.rojo, fontSize: 13 }}>{error}</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 20, textTransform: 'uppercase', color: C.azul }}>CRM</div>
          <div style={{ fontSize: 12, color: C.gris }}>Leads, clientes y seguimiento comercial</div>
        </div>
        <button onClick={() => setAddLead(true)} style={{ background: C.ambar, color: '#fff', border: 'none', padding: '9px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={14} /> Agregar lead</button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {ETAPAS.map(e => { const [cf, ct] = colorEtapa(e); return (
          <button key={e} onClick={() => setFEtapa(fEtapa === e ? '' : e)} style={{ flex: '1 1 130px', border: '1px solid ' + (fEtapa === e ? ct : '#E2DED4'), background: fEtapa === e ? cf : '#fff', padding: '10px 12px', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontSize: 11, color: ct, textTransform: 'uppercase', fontWeight: 700 }}>{e}</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: C.carbon }}>{porEtapa[e] || 0}</div>
          </button>
        )})}
      </div>

      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar nombre, RUT, teléfono o correo…" style={{ ...inp, width: '100%', marginBottom: 12 }} />

      {filtrados.length === 0 ? (
        <div style={{ color: C.gris, padding: 20, textAlign: 'center', border: '1px dashed #E2DED4' }}>Sin resultados.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #E2DED4' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['Nombre', 'RUT', 'Teléfono', 'Origen', 'Vendedor', 'Etapa'].map(h => <th key={h} style={{ textAlign: 'left', padding: '7px 10px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
            <tbody>
              {filtrados.map(c => { const [cf, ct] = colorEtapa(c.etapa); return (
                <tr key={c.id} onClick={() => setSeleccionado(c)} style={{ borderBottom: '1px solid #EEE9DF', cursor: 'pointer' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{c.nombre}</td>
                  <td style={{ padding: '8px 10px', color: C.gris }}>{c.rut || '—'}</td>
                  <td style={{ padding: '8px 10px', color: C.gris }}>{c.telefono || c.whatsapp_id || '—'}</td>
                  <td style={{ padding: '8px 10px', color: C.gris }}>{c.origen || '—'}</td>
                  <td style={{ padding: '8px 10px', color: C.gris }}>{c.vendedor || '—'}</td>
                  <td style={{ padding: '8px 10px' }}><span style={{ background: cf, color: ct, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>{c.etapa}</span></td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}

      {addLead && <FormLead onGuardar={async d => { try { await crearCliente(d); setAddLead(false); refrescar() } catch (e) { setError('Error al guardar: ' + (e.message || e)) } }} onCancelar={() => setAddLead(false)} />}
      {seleccionado && <FichaCliente cliente={seleccionado} onClose={() => setSeleccionado(null)} onActualizado={c => { setSeleccionado(c); refrescar() }} />}
    </div>
  )
}
