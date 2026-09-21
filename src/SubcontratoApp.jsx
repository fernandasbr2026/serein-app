// Portal de Subcontratistas (Fase I del plan — ver
// C:\Users\maria\.claude\plans\sorted-singing-sundae.md). App COMPLETAMENTE
// APARTE del resto del ERP: nunca importa Dashboard.jsx ni nada que
// dependa de sync.js/app_state (esa es justo la razón de que exista —
// app_state hoy se puede leer completo por cualquier autenticado, y un
// subcontratista es externo). Todo lo que esta pantalla necesita lo lee y
// escribe directo contra tablas reales con RLS propia
// (subcontrato_asignaciones / facturas_subcontrato), que solo dejan ver o
// tocar lo que le corresponde a este usuario — ver la migración
// supabase/migrations/2026-09-20-portal-subcontratistas.sql.
import React, { useState, useEffect, useMemo } from 'react'
import { LogOut, Upload, FileText } from 'lucide-react'
import { supabase } from './supabase.js'
import { fileToBase64 } from './protocolo-pdf.js'
import { KpiCard } from './ui.jsx'
import { SEREIN } from './theme-serein.js'

const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const inp = { padding: '7px 9px', border: '1px solid #DFE4EA', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }
const montoBruto = f => f.exento ? (f.monto || 0) : Math.round((f.monto || 0) * 1.19)
const ESTADO_LABEL = { pendiente: 'Pendiente', aceptada: 'Aceptada', rechazada: 'Rechazada' }
const ESTADO_COLOR = { pendiente: C.ambar, aceptada: C.verde, rechazada: C.rojo }

export default function SubcontratoApp({ perfil, email, onLogout }) {
  const [asignaciones, setAsignaciones] = useState([])
  const [facturas, setFacturas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargar = async () => {
    setCargando(true); setError('')
    try {
      const [a, f] = await Promise.all([
        supabase.from('subcontrato_asignaciones').select('*').order('ot'),
        supabase.from('facturas_subcontrato').select('*').order('created_at', { ascending: false }),
      ])
      if (a.error) throw a.error
      if (f.error) throw f.error
      setAsignaciones(a.data || [])
      setFacturas(f.data || [])
    } catch (err) { setError('No se pudo cargar tu información: ' + ((err && err.message) || String(err))) }
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const resumen = useMemo(() => {
    const facturado = facturas.reduce((a, f) => a + montoBruto(f), 0)
    const percibido = facturas.filter(f => f.estado === 'aceptada').reduce((a, f) => a + (f.abonado || 0), 0)
    return {
      facturado, percibido, porPercibir: Math.max(0, facturado - percibido),
      pendientes: facturas.filter(f => f.estado === 'pendiente').length,
      aceptadas: facturas.filter(f => f.estado === 'aceptada').length,
      rechazadas: facturas.filter(f => f.estado === 'rechazada').length,
    }
  }, [facturas])

  return (
    <div style={{ minHeight: '100vh', background: SEREIN.fog }}>
      <div style={{ background: C.carbon, color: '#fff', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 16, letterSpacing: 0.3 }}>SEREIN · Portal de Subcontratistas</div>
          <div style={{ fontSize: 12.5, color: '#B7BEC7' }}>{perfil.nombre || email}</div>
        </div>
        <button onClick={onLogout} style={{ background: 'none', border: '1px solid #4A5158', color: '#fff', borderRadius: 4, padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}><LogOut size={14} /> Cerrar sesión</button>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
        {error && <div style={{ background: '#FCEBEA', color: C.rojo, padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>}
        {cargando ? (
          <div style={{ color: C.gris, fontSize: 13 }}>Cargando…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
              <KpiCard value={clp(resumen.facturado)} label="Facturado" />
              <KpiCard value={clp(resumen.percibido)} label="Percibido" iconColor={C.verde} />
              <KpiCard value={clp(resumen.porPercibir)} label="Por percibir" iconColor={C.ambar} />
              <KpiCard value={resumen.pendientes} label="Pendientes de revisión" />
            </div>

            <SubirFactura asignaciones={asignaciones} perfil={perfil} onSubido={cargar} />

            <div style={{ marginTop: 24 }}>
              <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Tus facturas ({facturas.length})</div>
              {facturas.length === 0 ? (
                <div style={{ color: C.gris, fontSize: 13 }}>Todavía no has subido ninguna factura.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                        {['OT', 'Centro de costo', 'Folio', 'Fecha', 'Monto', 'Abonado', 'Estado'].map((h, i) => (
                          <th key={i} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {facturas.map(f => (
                        <tr key={f.id} style={{ borderBottom: '1px solid #DFE4EA' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 600 }}>{f.ot}</td>
                          <td style={{ padding: '6px 8px' }}>{f.cc_nombre || f.cc}</td>
                          <td style={{ padding: '6px 8px', color: C.gris }}>{f.folio || '—'}</td>
                          <td style={{ padding: '6px 8px', color: C.gris }}>{f.fecha || '—'}</td>
                          <td style={{ padding: '6px 8px' }}>{clp(montoBruto(f))}</td>
                          <td style={{ padding: '6px 8px' }}>{clp(f.abonado)}</td>
                          <td style={{ padding: '6px 8px' }}><span style={{ background: ESTADO_COLOR[f.estado], color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 10.5, fontWeight: 700 }}>{ESTADO_LABEL[f.estado]}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SubirFactura({ asignaciones, perfil, onSubido }) {
  const [asignacionId, setAsignacionId] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')

  if (!asignaciones.length) {
    return <div style={{ background: '#fff', border: '1px solid #DFE4EA', borderRadius: 6, padding: 16, fontSize: 13, color: C.gris }}>Todavía no tienes ninguna OT/Centro de Costo asignado. Contacta a Serein para que te habiliten al menos uno antes de poder subir facturas.</div>
  }

  const subir = async e => {
    const fl = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!fl) return
    if (!asignacionId) { window.alert('Elige primero a qué OT / Centro de Costo corresponde.'); return }
    setSubiendo(true); setError(''); setRevision(null); setMsg('')
    try {
      const base64 = await fileToBase64(fl)
      const { data, error: err } = await supabase.functions.invoke('extraer-factura-compra', { body: { archivos: [{ base64, mimeType: fl.type || 'application/pdf', filename: fl.name }], filename: fl.name } })
      if (err) throw err
      if (!data || !data.ok) throw new Error((data && data.error) || 'No se pudo leer el documento.')
      const d = data.datos || {}
      setRevision({
        archivo: fl, proveedor: d.proveedor || '', rut: d.rut || '', folio: d.folio || '',
        fecha: d.fecha || '', monto: d.neto != null ? String(d.neto) : '', exento: !!d.exento, detalle: d.detalle || '',
      })
    } catch (err) { setError('No se pudo leer la factura: ' + ((err && err.message) || String(err))) }
    setSubiendo(false)
  }

  const confirmar = async () => {
    if (!revision) return
    const asig = asignaciones.find(a => a.id === asignacionId)
    if (!asig) { window.alert('Elige a qué OT / Centro de Costo corresponde.'); return }
    const monto = parseInt(String(revision.monto).replace(/\D/g, ''), 10) || 0
    if (!revision.proveedor.trim() || monto <= 0) { window.alert('Falta el proveedor o el monto no es válido — revisa antes de confirmar.'); return }
    setGuardando(true)
    try {
      const nombreArchivo = `${Date.now()}-${revision.archivo.name}`.replace(/[^a-zA-Z0-9_.-]/g, '_')
      const path = `${perfil.id || ''}/${nombreArchivo}`
      const { error: errSubida } = await supabase.storage.from('facturas-subcontrato').upload(path, revision.archivo, { contentType: 'application/pdf', upsert: false })
      if (errSubida) throw errSubida
      const { error: errInsert } = await supabase.from('facturas_subcontrato').insert({
        perfil_id: perfil.id, ot: asig.ot, cc: asig.cc, cc_nombre: asig.cc_nombre,
        proveedor: revision.proveedor, rut: revision.rut, folio: revision.folio, fecha: revision.fecha || null,
        monto, exento: !!revision.exento, detalle: revision.detalle, pdf_path: path,
      })
      if (errInsert) throw errInsert
      try { await supabase.functions.invoke('notificar-factura-subcontrato', { body: { subcontratista: perfil.nombre || '', ot: asig.ot, cc: asig.cc_nombre || asig.cc, proveedor: revision.proveedor, monto } }) } catch (e) { /* el aviso es best-effort — la factura ya quedó guardada igual */ }
      setMsg('Factura subida — queda pendiente de revisión.')
      setRevision(null)
      onSubido()
    } catch (err) { window.alert('No se pudo guardar la factura: ' + ((err && err.message) || String(err))) }
    setGuardando(false)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #DFE4EA', borderRadius: 6, padding: 16 }}>
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}><FileText size={16} /> Subir factura</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <select value={asignacionId} onChange={e => setAsignacionId(e.target.value)} style={{ ...inp, minWidth: 240 }}>
          <option value="">Elegir OT / Centro de costo…</option>
          {asignaciones.map(a => <option key={a.id} value={a.id}>{a.ot} · {a.cc_nombre || a.cc}</option>)}
        </select>
        <label style={{ cursor: subiendo ? 'wait' : 'pointer', background: C.teal, color: '#fff', border: 'none', borderRadius: 4, padding: '7px 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: subiendo ? 0.7 : 1 }}>
          <Upload size={13} /> {subiendo ? 'Leyendo…' : 'Elegir PDF'}
          <input type="file" accept="application/pdf,image/*" onChange={subir} disabled={subiendo} style={{ display: 'none' }} />
        </label>
      </div>
      {msg && <div style={{ fontSize: 12.5, color: C.verde, marginBottom: 8 }}>{msg}</div>}
      {error && <div style={{ fontSize: 12.5, color: C.rojo, marginBottom: 8 }}>{error}</div>}
      {revision && (
        <div style={{ background: '#F2F4F7', padding: 12, borderRadius: 6 }}>
          <div style={{ fontSize: 11, color: C.gris, marginBottom: 6 }}>Revisa los datos antes de confirmar.</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input style={{ ...inp, width: 150 }} placeholder="Proveedor" value={revision.proveedor} onChange={e => setRevision(r => ({ ...r, proveedor: e.target.value }))} />
            <input style={{ ...inp, width: 100 }} placeholder="N° doc / folio" value={revision.folio} onChange={e => setRevision(r => ({ ...r, folio: e.target.value }))} />
            <input style={{ ...inp, width: 110 }} placeholder="RUT" value={revision.rut} onChange={e => setRevision(r => ({ ...r, rut: e.target.value }))} />
            <input style={{ ...inp, width: 120 }} type="date" value={revision.fecha} onChange={e => setRevision(r => ({ ...r, fecha: e.target.value }))} />
            <input style={{ ...inp, width: 120 }} placeholder="Monto neto CLP" value={revision.monto} onChange={e => setRevision(r => ({ ...r, monto: e.target.value }))} />
            <label style={{ fontSize: 12, color: C.gris, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={!!revision.exento} onChange={e => setRevision(r => ({ ...r, exento: e.target.checked }))} /> Exenta (sin IVA)</label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={confirmar} disabled={guardando} style={{ background: guardando ? '#9AA3AD' : C.verde, color: '#fff', border: 'none', borderRadius: 4, padding: '7px 14px', cursor: guardando ? 'default' : 'pointer', fontSize: 13 }}>{guardando ? 'Guardando…' : 'Confirmar'}</button>
            <button onClick={() => setRevision(null)} style={{ background: 'none', border: '1px solid #DFE4EA', borderRadius: 4, padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
