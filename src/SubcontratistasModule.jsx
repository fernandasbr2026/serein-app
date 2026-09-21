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
import { SEREIN } from './theme-serein.js'

const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const inp = { padding: '7px 9px', border: '1px solid #DFE4EA', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }
const montoBruto = f => f.exento ? (f.monto || 0) : Math.round((f.monto || 0) * 1.19)

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
      })
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
          <div style={{ fontSize: 12.5, color: C.gris }}>OT {f.ot} · {f.cc_nombre || f.cc} · {f.fecha || 'sin fecha'} · {clp(bruto)}{pdfUrl && <> · <a href={pdfUrl} target="_blank" rel="noreferrer" style={{ color: C.teal }}>ver PDF</a></>}</div>
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

function PanelAsignar() {
  const [subcontratistas, setSubcontratistas] = useState([])
  const [asignaciones, setAsignaciones] = useState([])
  const [perfilId, setPerfilId] = useState('')
  const [ot, setOt] = useState('')
  const [cc, setCc] = useState('')
  const [ccNombre, setCcNombre] = useState('')
  const [msg, setMsg] = useState('')

  const cargar = async () => {
    const [p, a] = await Promise.all([
      supabase.from('perfiles').select('id,nombre').eq('tipo', 'subcontrato'),
      supabase.from('subcontrato_asignaciones').select('*').order('created_at', { ascending: false }),
    ])
    setSubcontratistas(p.data || [])
    setAsignaciones(a.data || [])
  }
  useEffect(() => { cargar() }, [])

  const agregar = async () => {
    if (!perfilId || !ot.trim() || !cc.trim()) { window.alert('Elige el subcontratista y completa OT y Centro de Costo.'); return }
    const { error } = await supabase.from('subcontrato_asignaciones').insert({ perfil_id: perfilId, ot: ot.trim(), cc: cc.trim(), cc_nombre: ccNombre.trim() || cc.trim() })
    if (error) { window.alert('No se pudo agregar: ' + error.message); return }
    setOt(''); setCc(''); setCcNombre(''); setMsg('Asignación agregada.')
    cargar()
  }
  const quitar = async id => {
    if (!window.confirm('¿Quitar esta asignación?')) return
    await supabase.from('subcontrato_asignaciones').delete().eq('id', id)
    cargar()
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
        <input value={ot} onChange={e => setOt(e.target.value)} placeholder="OT (ej. OT-2026-102)" style={{ ...inp, width: 150 }} />
        <input value={cc} onChange={e => setCc(e.target.value)} placeholder="Código CC (ej. A1)" style={{ ...inp, width: 120 }} />
        <input value={ccNombre} onChange={e => setCcNombre(e.target.value)} placeholder="Nombre CC (ej. Pintura)" style={{ ...inp, width: 140 }} />
        <button onClick={agregar} style={{ background: C.teal, color: '#fff', border: 'none', borderRadius: 4, padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5 }}><UserPlus size={13} /> Asignar</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: C.verde, marginBottom: 8 }}>{msg}</div>}
      {asignaciones.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['Subcontratista', 'OT', 'Centro de costo', ''].map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
          <tbody>
            {asignaciones.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid #DFE4EA' }}>
                <td style={{ padding: '5px 8px' }}>{nombreDe(a.perfil_id)}</td>
                <td style={{ padding: '5px 8px' }}>{a.ot}</td>
                <td style={{ padding: '5px 8px' }}>{a.cc_nombre || a.cc}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}><button onClick={() => quitar(a.id)} style={{ background: 'none', border: 'none', color: C.rojo, cursor: 'pointer' }}><X size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function SubcontratistasModule({ onAddCompraPorOT }) {
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
      <PanelAsignar />
    </div>
  )
}
