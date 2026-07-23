import React, { useState, useEffect, useMemo } from 'react'
import { Plus, X, Trash2, Phone, Mail, MessageCircle, Users as UsersIcon, Target, Clock, Megaphone, AlertTriangle, Trophy, BellRing } from 'lucide-react'
import {
  cargarClientes, crearCliente, actualizarCliente,
  cargarPersonas, crearPersona, eliminarPersona,
  cargarInteracciones, crearInteraccion, eliminarInteraccion,
  cargarOportunidades, crearOportunidad, actualizarOportunidad, eliminarOportunidad,
  cargarCampanas, crearCampana, actualizarCampana, eliminarCampana,
  cargarUltimasFacturasPorRut, normalizarRut,
  cargarVendedores, crearVendedor, actualizarVendedor,
  cargarSeguimientosPendientes, cargarVendedorStats,
} from './crm-api.js'

// ============================================================
// CRM — leads + clientes en una sola tabla (etapa), bitácora de
// seguimiento y pipeline de oportunidades (mismos estados que ya
// usan las cotizaciones). Los leads de WhatsApp entran solos vía
// un webhook (supabase/functions/whatsapp-webhook) una vez que se
// conecte la cuenta de WhatsApp Business API — mientras tanto se
// cargan a mano igual que cualquier otro lead.
// ============================================================

import { SEREIN } from './theme-serein.js'
// Paleta reskineada a la identidad Serein 2026 — mismas claves, solo cambian los valores hex.
const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const inp = { padding: '7px 9px', border: '1px solid #DFE4EA', fontSize: 13, boxSizing: 'border-box' }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')

const ETAPAS = ['Lead nuevo', 'Contactado', 'Calificado', 'Cliente', 'Descartado']
const colorEtapa = e => ({
  'Lead nuevo': ['#F2F4F7', '#5A636E'], 'Contactado': ['#FDECDD', C.ambar], 'Calificado': ['#E7EFFB', C.azul],
  'Cliente': ['#E6F7EE', C.verde], 'Descartado': ['#FCEBEA', C.rojo],
}[e] || ['#EEE', C.gris])
const ORIGENES = ['WhatsApp', 'Referido', 'Web', 'Llamada', 'Meta Ads', 'Google Ads', 'Feria/Evento', 'Otro']
const TIPOS_INT = [['whatsapp', 'WhatsApp', MessageCircle], ['llamada', 'Llamada', Phone], ['reunion', 'Reunión', UsersIcon], ['correo', 'Correo', Mail], ['nota', 'Nota', Clock], ['visita', 'Visita', UsersIcon]]
const ETAPAS_OP = ['Alta probabilidad de cierre', 'Baja probabilidad de cierre', 'Aprobada', 'Rechazada', 'Otro']
const CANALES_CAMPANA = ['Meta Ads', 'Google Ads', 'Otro']
const ESTADOS_CAMPANA = ['Activa', 'Pausada', 'Finalizada']
const colorEstadoCampana = e => ({ 'Activa': ['#E6F7EE', C.verde], 'Pausada': ['#FDECDD', C.ambar], 'Finalizada': ['#F2F4F7', '#5A636E'] }[e] || ['#EEE', C.gris])

function FormLead({ campanas, vendedores, onGuardar, onCancelar }) {
  const [f, setF] = useState({ nombre: '', telefono: '', whatsapp_id: '', correo: '', rut: '', origen: 'WhatsApp', vendedor_id: '', campana_id: '' })
  return (
    <div onClick={onCancelar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,26,46,.55)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: 440, padding: 20, boxShadow: '0 20px 60px -12px rgba(0,0,0,.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase' }}>Agregar lead</span>
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
          <label style={{ fontSize: 11, color: C.gris }}>Campaña (opcional)
            <select value={f.campana_id} onChange={e => setF({ ...f, campana_id: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }}>
              <option value="">— Sin campaña —</option>
              {campanas.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.canal})</option>)}
            </select>
          </label>
          <label style={{ fontSize: 11, color: C.gris }}>Vendedor
            <select value={f.vendedor_id} onChange={e => setF({ ...f, vendedor_id: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }}>
              <option value="">— Sin asignar —</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={onCancelar} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '8px 14px', cursor: 'pointer', fontSize: 12.5 }}>Cancelar</button>
          <button
            onClick={() => f.nombre.trim() && onGuardar({
              ...f, nombre: f.nombre.trim(), whatsapp_id: f.whatsapp_id.trim() || null, campana_id: f.campana_id || null,
              vendedor_id: f.vendedor_id || null, vendedor: (vendedores.find(v => v.id === f.vendedor_id) || {}).nombre || null,
            })}
            disabled={!f.nombre.trim()}
            style={{ background: C.verde, color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, opacity: f.nombre.trim() ? 1 : 0.5 }}
          >Guardar</button>
        </div>
      </div>
    </div>
  )
}

function FormCampana({ campana, onGuardar, onCancelar }) {
  const [f, setF] = useState(campana || { nombre: '', canal: 'Meta Ads', estado: 'Activa', fecha_inicio: '', fecha_fin: '', presupuesto: '', gasto_real: '', notas: '' })
  return (
    <div onClick={onCancelar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,26,46,.55)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: 440, padding: 20, boxShadow: '0 20px 60px -12px rgba(0,0,0,.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase' }}>{campana ? 'Editar campaña' : 'Agregar campaña'}</span>
          <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 11, color: C.gris }}>Nombre de la campaña *<input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Ej: Revestimientos industriales - julio" style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
          <label style={{ fontSize: 11, color: C.gris }}>Canal
            <select value={f.canal} onChange={e => setF({ ...f, canal: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }}>{CANALES_CAMPANA.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </label>
          <label style={{ fontSize: 11, color: C.gris }}>Estado
            <select value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }}>{ESTADOS_CAMPANA.map(e2 => <option key={e2} value={e2}>{e2}</option>)}</select>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ fontSize: 11, color: C.gris, flex: 1 }}>Fecha inicio<input type="date" value={f.fecha_inicio || ''} onChange={e => setF({ ...f, fecha_inicio: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
            <label style={{ fontSize: 11, color: C.gris, flex: 1 }}>Fecha fin<input type="date" value={f.fecha_fin || ''} onChange={e => setF({ ...f, fecha_fin: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ fontSize: 11, color: C.gris, flex: 1 }}>Presupuesto CLP<input value={f.presupuesto || ''} onChange={e => setF({ ...f, presupuesto: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
            <label style={{ fontSize: 11, color: C.gris, flex: 1 }}>Gasto real CLP<input value={f.gasto_real || ''} onChange={e => setF({ ...f, gasto_real: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
          </div>
          <label style={{ fontSize: 11, color: C.gris }}>Notas<textarea value={f.notas || ''} onChange={e => setF({ ...f, notas: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3, minHeight: 50, resize: 'vertical' }} /></label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={onCancelar} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '8px 14px', cursor: 'pointer', fontSize: 12.5 }}>Cancelar</button>
          <button
            onClick={() => f.nombre.trim() && onGuardar({
              ...f, nombre: f.nombre.trim(),
              fecha_inicio: f.fecha_inicio || null, fecha_fin: f.fecha_fin || null,
              presupuesto: Number(f.presupuesto) || null, gasto_real: Number(f.gasto_real) || null,
            })}
            disabled={!f.nombre.trim()}
            style={{ background: C.verde, color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, opacity: f.nombre.trim() ? 1 : 0.5 }}
          >Guardar</button>
        </div>
      </div>
    </div>
  )
}

function FormInteraccion({ onGuardar, onCancelar }) {
  const [f, setF] = useState({ tipo: 'llamada', direccion: 'saliente', texto: '', proxima_accion: '', proxima_fecha: '' })
  return (
    <div style={{ background: '#F2F4F7', padding: 10, marginTop: 8 }}>
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
    <div style={{ background: '#F2F4F7', padding: 10, marginTop: 8 }}>
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
    <div style={{ background: '#F2F4F7', padding: 10, marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
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

function FichaCliente({ cliente, campanas, vendedores, onClose, onActualizado }) {
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
    // ultimaFactura/mesesSinFacturar son campos calculados en el cliente
    // (cruce con libro_ventas), no columnas reales de `clientes` — no se envían.
    const { ultimaFactura, mesesSinFacturar, ...cambios } = f
    try { await actualizarCliente(cliente.id, cambios); onActualizado({ ...cliente, ...cambios }); setMsg('Guardado.') }
    catch (e) { setMsg('Error al guardar: ' + (e.message || e)) }
  }

  const card = { border: '1px solid #DFE4EA', padding: 14, marginBottom: 14, background: '#fff' }
  const h = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: C.gris, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,26,46,.55)', zIndex: 80, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#F2F4F7', width: '100%', maxWidth: 760, boxShadow: '0 20px 60px -12px rgba(0,0,0,.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #DFE4EA', background: '#fff', position: 'sticky', top: 0, zIndex: 2 }}>
          <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase' }}>{cliente.nombre}</span>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #DFE4EA', cursor: 'pointer', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}><X size={15} /> Cerrar</button>
        </div>
        <div style={{ padding: 16 }}>
          {msg && <div style={{ background: msg.startsWith('Error') ? '#FCEBEA' : '#E6F7EE', color: msg.startsWith('Error') ? C.rojo : C.verde, padding: '8px 12px', marginBottom: 12, fontSize: 12.5 }}>{msg}</div>}

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
                <select value={f.vendedor_id || ''} onChange={e => { const v = vendedores.find(x => x.id === e.target.value); setF({ ...f, vendedor_id: e.target.value || null, vendedor: v ? v.nombre : null }) }} style={{ ...inp, width: '100%', marginTop: 3 }}>
                  <option value="">— Sin asignar —</option>
                  {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 11, color: C.gris }}>Etapa
                <select value={f.etapa || 'Lead nuevo'} onChange={e => setF({ ...f, etapa: e.target.value })} style={{ ...inp, width: '100%', marginTop: 3 }}>{ETAPAS.map(e2 => <option key={e2} value={e2}>{e2}</option>)}</select>
              </label>
              <label style={{ fontSize: 11, color: C.gris }}>Campaña
                <select value={f.campana_id || ''} onChange={e => setF({ ...f, campana_id: e.target.value || null })} style={{ ...inp, width: '100%', marginTop: 3 }}>
                  <option value="">— Sin campaña —</option>
                  {campanas.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.canal})</option>)}
                </select>
              </label>
            </div>
            <button onClick={guardarCampos} style={{ marginTop: 10, background: C.azul, color: '#fff', border: 'none', padding: '7px 16px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Guardar datos</button>
          </div>

          <div style={card}>
            <div style={h}><span>Personas de contacto</span><button onClick={() => setAddPersona(true)} style={{ background: C.teal, color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={12} /> Agregar</button></div>
            {personas.length === 0 ? <div style={{ fontSize: 12.5, color: C.gris }}>Sin personas registradas.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {personas.map(p => (
                  <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, borderBottom: '1px solid #DFE4EA', paddingBottom: 4 }}>
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
                  <div key={o.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, borderBottom: '1px solid #DFE4EA', paddingBottom: 4 }}>
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
                    <div key={x.id} style={{ borderBottom: '1px solid #DFE4EA', paddingBottom: 6, fontSize: 12.5 }}>
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
  const [campanas, setCampanas] = useState([])
  const [ultimasFacturas, setUltimasFacturas] = useState({})
  const [vendedores, setVendedores] = useState([])
  const [seguimientos, setSeguimientos] = useState([])
  const [vendedorStats, setVendedorStats] = useState([])
  const [vista, setVista] = useState('leads')
  const [q, setQ] = useState('')
  const [fEtapa, setFEtapa] = useState('')
  const [soloInactivos, setSoloInactivos] = useState(false)
  const [addLead, setAddLead] = useState(false)
  const [seleccionado, setSeleccionado] = useState(null)
  const [addCampana, setAddCampana] = useState(false)
  const [editCampana, setEditCampana] = useState(null)
  const [addVendedor, setAddVendedor] = useState(false)
  const [nombreVendedor, setNombreVendedor] = useState('')

  async function refrescar() {
    try {
      const [c, camp, fact, vend, seg, vstats] = await Promise.all([
        cargarClientes(), cargarCampanas(), cargarUltimasFacturasPorRut(),
        cargarVendedores(), cargarSeguimientosPendientes(), cargarVendedorStats(),
      ])
      setClientes(c); setCampanas(camp); setUltimasFacturas(fact); setVendedores(vend); setSeguimientos(seg); setVendedorStats(vstats)
    } catch (e) { setError('No se pudo cargar el CRM: ' + (e.message || e)) }
  }
  useEffect(() => { refrescar().finally(() => setCargando(false)) }, [])

  // Solo tiene sentido "hace cuánto no facturamos" para etapa=Cliente
  // (un lead que nunca ha comprado no es un cliente "inactivo").
  const MESES_INACTIVO = 6
  const clientesConFactura = useMemo(() => clientes.map(c => {
    if (c.etapa !== 'Cliente') return { ...c, ultimaFactura: null, mesesSinFacturar: null }
    const ultimaFactura = ultimasFacturas[normalizarRut(c.rut)] || null
    const meses = ultimaFactura ? Math.floor((Date.now() - new Date(ultimaFactura)) / (1000 * 60 * 60 * 24 * 30)) : null
    return { ...c, ultimaFactura, mesesSinFacturar: c.rut ? meses : null }
  }), [clientes, ultimasFacturas])

  const inactivos = useMemo(() => clientesConFactura
    .filter(c => c.etapa === 'Cliente' && (c.mesesSinFacturar === null || c.mesesSinFacturar >= MESES_INACTIVO))
    .sort((a, b) => (b.mesesSinFacturar ?? 9999) - (a.mesesSinFacturar ?? 9999))
  , [clientesConFactura])

  const statsCampanas = useMemo(() => campanas.map(camp => {
    const leads = clientes.filter(c => c.campana_id === camp.id)
    const convertidos = leads.filter(c => c.etapa === 'Cliente').length
    const gasto = camp.gasto_real || 0
    return {
      ...camp,
      leadsGenerados: leads.length,
      convertidos,
      tasaConversion: leads.length ? Math.round((convertidos / leads.length) * 100) : 0,
      costoPorLead: leads.length ? Math.round(gasto / leads.length) : null,
    }
  }), [campanas, clientes])

  const filtrados = useMemo(() => (soloInactivos ? inactivos : clientesConFactura).filter(c => {
    if (fEtapa && c.etapa !== fEtapa) return false
    if (q) { const t = ((c.nombre || '') + ' ' + (c.rut || '') + ' ' + (c.telefono || '') + ' ' + (c.correo || '')).toLowerCase(); if (!t.includes(q.toLowerCase())) return false }
    return true
  }), [clientesConFactura, inactivos, soloInactivos, q, fEtapa])

  const porEtapa = useMemo(() => {
    const m = {}; ETAPAS.forEach(e => { m[e] = 0 }); clientes.forEach(c => { m[c.etapa] = (m[c.etapa] || 0) + 1 }); return m
  }, [clientes])

  if (cargando) return <div style={{ padding: 24, color: C.gris, fontSize: 13 }}>Cargando CRM…</div>
  if (error) return <div style={{ padding: 16, background: '#FCEBEA', color: C.rojo, fontSize: 13 }}>{error}</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 20, textTransform: 'uppercase', color: C.azul }}>CRM</div>
          <div style={{ fontSize: 12, color: C.gris }}>Leads, clientes y seguimiento comercial</div>
        </div>
        {vista === 'leads'
          ? <button onClick={() => setAddLead(true)} style={{ background: C.ambar, color: '#fff', border: 'none', padding: '9px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={14} /> Agregar lead</button>
          : vista === 'campanas' ? <button onClick={() => setAddCampana(true)} style={{ background: C.ambar, color: '#fff', border: 'none', padding: '9px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={14} /> Agregar campaña</button>
          : vista === 'vendedores' ? <button onClick={() => setAddVendedor(true)} style={{ background: C.ambar, color: '#fff', border: 'none', padding: '9px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={14} /> Agregar vendedor</button>
          : null}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #DFE4EA', flexWrap: 'wrap' }}>
        <button onClick={() => setVista('leads')} style={{ background: 'none', border: 'none', borderBottom: '2px solid ' + (vista === 'leads' ? C.azul : 'transparent'), color: vista === 'leads' ? C.azul : C.gris, fontWeight: 700, fontSize: 12.5, textTransform: 'uppercase', padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><UsersIcon size={14} /> Leads y clientes</button>
        <button onClick={() => setVista('campanas')} style={{ background: 'none', border: 'none', borderBottom: '2px solid ' + (vista === 'campanas' ? C.azul : 'transparent'), color: vista === 'campanas' ? C.azul : C.gris, fontWeight: 700, fontSize: 12.5, textTransform: 'uppercase', padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><Megaphone size={14} /> Campañas</button>
        <button onClick={() => setVista('vendedores')} style={{ background: 'none', border: 'none', borderBottom: '2px solid ' + (vista === 'vendedores' ? C.azul : 'transparent'), color: vista === 'vendedores' ? C.azul : C.gris, fontWeight: 700, fontSize: 12.5, textTransform: 'uppercase', padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><Trophy size={14} /> Vendedores</button>
        <button onClick={() => setVista('seguimientos')} style={{ background: 'none', border: 'none', borderBottom: '2px solid ' + (vista === 'seguimientos' ? C.azul : 'transparent'), color: vista === 'seguimientos' ? C.azul : C.gris, fontWeight: 700, fontSize: 12.5, textTransform: 'uppercase', padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><BellRing size={14} /> Seguimientos{seguimientos.length > 0 ? ' (' + seguimientos.length + ')' : ''}</button>
      </div>

      {vista === 'vendedores' ? (
        vendedorStats.length === 0 ? (
          <div style={{ color: C.gris, padding: 20, textAlign: 'center', border: '1px dashed #DFE4EA' }}>Sin vendedores registrados.</div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #DFE4EA' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['Vendedor', 'Leads asignados', 'Convertidos', 'Tasa conv.', 'Revenue cerrado', 'Interacciones'].map(h => <th key={h} style={{ textAlign: 'left', padding: '7px 10px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>
                {vendedorStats.map(v => (
                  <tr key={v.vendedor_id} style={{ borderBottom: '1px solid #DFE4EA' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{v.nombre}</td>
                    <td style={{ padding: '8px 10px' }}>{v.leads_asignados}</td>
                    <td style={{ padding: '8px 10px' }}>{v.convertidos}</td>
                    <td style={{ padding: '8px 10px' }}>{v.tasa_conversion ?? 0}%</td>
                    <td style={{ padding: '8px 10px', fontWeight: 600, color: C.verde }}>{clp(v.revenue_cerrado)}</td>
                    <td style={{ padding: '8px 10px', color: C.gris }}>{v.interacciones_totales}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : vista === 'seguimientos' ? (
        seguimientos.length === 0 ? (
          <div style={{ color: C.gris, padding: 20, textAlign: 'center', border: '1px dashed #DFE4EA' }}>Sin seguimientos pendientes — todo al día.</div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #DFE4EA' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['Cliente', 'Etapa', 'Vendedor', 'Próxima acción', 'Fecha', 'Días vencido'].map(h => <th key={h} style={{ textAlign: 'left', padding: '7px 10px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>
                {seguimientos.map(s => (
                  <tr key={s.cliente_id} onClick={() => { const c = clientesConFactura.find(x => x.id === s.cliente_id); if (c) setSeleccionado(c) }} style={{ borderBottom: '1px solid #DFE4EA', cursor: 'pointer', background: s.dias_vencido > 0 ? '#FDECDD' : 'transparent' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{s.nombre}</td>
                    <td style={{ padding: '8px 10px' }}><span style={{ background: colorEtapa(s.etapa)[0], color: colorEtapa(s.etapa)[1], padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>{s.etapa}</span></td>
                    <td style={{ padding: '8px 10px', color: C.gris }}>{s.vendedor_nombre || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{s.proxima_accion}</td>
                    <td style={{ padding: '8px 10px', color: C.gris }}>{s.proxima_fecha}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: s.dias_vencido > 0 ? C.rojo : C.gris }}>{s.dias_vencido > 0 ? s.dias_vencido + ' días' : 'al día'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : vista === 'campanas' ? (
        statsCampanas.length === 0 ? (
          <div style={{ color: C.gris, padding: 20, textAlign: 'center', border: '1px dashed #DFE4EA' }}>Sin campañas registradas. Agrega una para empezar a medir Meta Ads / Google Ads.</div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #DFE4EA' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['Campaña', 'Canal', 'Estado', 'Leads', 'Convertidos', 'Tasa conv.', 'Gasto', 'Costo/lead', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '7px 10px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>
                {statsCampanas.map(c => { const [cf, ct] = colorEstadoCampana(c.estado); return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #DFE4EA' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600, cursor: 'pointer' }} onClick={() => setEditCampana(c)}>{c.nombre}</td>
                    <td style={{ padding: '8px 10px', color: C.gris }}>{c.canal}</td>
                    <td style={{ padding: '8px 10px' }}><span style={{ background: cf, color: ct, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>{c.estado}</span></td>
                    <td style={{ padding: '8px 10px' }}>{c.leadsGenerados}</td>
                    <td style={{ padding: '8px 10px' }}>{c.convertidos}</td>
                    <td style={{ padding: '8px 10px' }}>{c.tasaConversion}%</td>
                    <td style={{ padding: '8px 10px', color: C.gris }}>{c.gasto_real ? clp(c.gasto_real) : '—'}</td>
                    <td style={{ padding: '8px 10px', color: C.gris }}>{c.costoPorLead != null ? clp(c.costoPorLead) : '—'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <button onClick={async () => { if (confirm('¿Eliminar la campaña "' + c.nombre + '"?')) { await eliminarCampana(c.id); refrescar() } }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )
      ) : (<>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {ETAPAS.map(e => { const [cf, ct] = colorEtapa(e); return (
          <button key={e} onClick={() => setFEtapa(fEtapa === e ? '' : e)} style={{ flex: '1 1 130px', border: '1px solid ' + (fEtapa === e ? ct : '#DFE4EA'), background: fEtapa === e ? cf : '#fff', padding: '10px 12px', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontSize: 11, color: ct, textTransform: 'uppercase', fontWeight: 700 }}>{e}</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: C.carbon }}>{porEtapa[e] || 0}</div>
          </button>
        )})}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar nombre, RUT, teléfono o correo…" style={{ ...inp, flex: '1 1 260px' }} />
        <button
          onClick={() => setSoloInactivos(v => !v)}
          title={`Clientes en etapa "Cliente" sin una factura en libro_ventas en los últimos ${MESES_INACTIVO} meses (o nunca facturados)`}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
            border: '1px solid ' + (soloInactivos ? C.rojo : '#DFE4EA'), background: soloInactivos ? '#FCEBEA' : '#fff', color: soloInactivos ? C.rojo : C.carbon, padding: '7px 12px',
          }}
        ><AlertTriangle size={14} /> Sin facturar +{MESES_INACTIVO}m ({inactivos.length})</button>
      </div>

      {filtrados.length === 0 ? (
        <div style={{ color: C.gris, padding: 20, textAlign: 'center', border: '1px dashed #DFE4EA' }}>Sin resultados.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #DFE4EA' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['Nombre', 'RUT', 'Teléfono', 'Origen', 'Vendedor', 'Etapa', 'Última factura'].map(h => <th key={h} style={{ textAlign: 'left', padding: '7px 10px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
            <tbody>
              {filtrados.map(c => { const [cf, ct] = colorEtapa(c.etapa); return (
                <tr key={c.id} onClick={() => setSeleccionado(c)} style={{ borderBottom: '1px solid #DFE4EA', cursor: 'pointer' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{c.nombre}</td>
                  <td style={{ padding: '8px 10px', color: C.gris }}>{c.rut || '—'}</td>
                  <td style={{ padding: '8px 10px', color: C.gris }}>{c.telefono || c.whatsapp_id || '—'}</td>
                  <td style={{ padding: '8px 10px', color: C.gris }}>{c.origen || '—'}</td>
                  <td style={{ padding: '8px 10px', color: C.gris }}>{c.vendedor || '—'}</td>
                  <td style={{ padding: '8px 10px' }}><span style={{ background: cf, color: ct, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>{c.etapa}</span></td>
                  <td style={{ padding: '8px 10px', color: c.etapa === 'Cliente' && c.mesesSinFacturar >= MESES_INACTIVO ? C.rojo : C.gris, fontWeight: c.etapa === 'Cliente' && c.mesesSinFacturar >= MESES_INACTIVO ? 700 : 400 }}>
                    {c.etapa !== 'Cliente' ? '—' : c.ultimaFactura ? new Date(c.ultimaFactura).toLocaleDateString('es-CL') : (c.rut ? 'Nunca' : 'Sin RUT')}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}
      </>)}

      {addLead && <FormLead campanas={campanas} vendedores={vendedores} onGuardar={async d => { try { await crearCliente(d); setAddLead(false); refrescar() } catch (e) { setError('Error al guardar: ' + (e.message || e)) } }} onCancelar={() => setAddLead(false)} />}
      {seleccionado && <FichaCliente cliente={seleccionado} campanas={campanas} vendedores={vendedores} onClose={() => setSeleccionado(null)} onActualizado={c => { setSeleccionado(c); refrescar() }} />}
      {addCampana && <FormCampana onGuardar={async d => { try { await crearCampana(d); setAddCampana(false); refrescar() } catch (e) { setError('Error al guardar: ' + (e.message || e)) } }} onCancelar={() => setAddCampana(false)} />}
      {editCampana && <FormCampana campana={editCampana} onGuardar={async d => { try { await actualizarCampana(editCampana.id, d); setEditCampana(null); refrescar() } catch (e) { setError('Error al guardar: ' + (e.message || e)) } }} onCancelar={() => setEditCampana(null)} />}
      {addVendedor && (
        <div onClick={() => setAddVendedor(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,26,46,.55)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: 360, padding: 20, boxShadow: '0 20px 60px -12px rgba(0,0,0,.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase' }}>Agregar vendedor</span>
              <button onClick={() => setAddVendedor(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <label style={{ fontSize: 11, color: C.gris }}>Nombre<input value={nombreVendedor} onChange={e => setNombreVendedor(e.target.value)} style={{ ...inp, width: '100%', marginTop: 3 }} /></label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => setAddVendedor(false)} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '8px 14px', cursor: 'pointer', fontSize: 12.5 }}>Cancelar</button>
              <button
                onClick={async () => { if (!nombreVendedor.trim()) return; try { await crearVendedor(nombreVendedor.trim()); setNombreVendedor(''); setAddVendedor(false); refrescar() } catch (e) { setError('Error al guardar: ' + (e.message || e)) } }}
                disabled={!nombreVendedor.trim()}
                style={{ background: C.verde, color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, opacity: nombreVendedor.trim() ? 1 : 0.5 }}
              >Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
