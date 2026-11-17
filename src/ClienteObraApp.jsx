// Portal del cliente del Módulo Avance de Obra (perfil tipo 'cliente').
// App COMPLETAMENTE APARTE del resto del ERP, mismo criterio que
// SubcontratoApp.jsx y TallerExternoApp.jsx: nunca importa Dashboard.jsx ni
// nada que dependa de sync.js/app_state. Solo lee el esquema `avance`, y las
// políticas de la base ya le entregan únicamente las OT publicadas en las que
// es miembro, sin nada marcado como interno.
import React, { useState, useEffect } from 'react'
import { LogOut, HardHat } from 'lucide-react'
import { SEREIN } from './theme-serein.js'
import VistaCliente from './avance/VistaCliente.jsx'
import { listarOts, cargarOT, responderAprobacion, errorLegible, miMembresia, claveCambiada } from './avance/api.js'
import { supabase } from './supabase.js'
import { resumenOT } from './avance/calc.js'

export default function ClienteObraApp({ perfil, email, onLogout, userId }) {
  const [ots, setOts] = useState([])
  const [otId, setOtId] = useState('')
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [debeCambiar, setDebeCambiar] = useState(false)
  const [p1, setP1] = useState(''); const [p2, setP2] = useState(''); const [errClave, setErrClave] = useState(''); const [cambiando, setCambiando] = useState(false)

  useEffect(() => { miMembresia().then(ms => setDebeCambiar(ms.some(m => m.debe_cambiar_clave))).catch(() => {}) }, [])
  const cambiarClave = async () => {
    setErrClave('')
    if (p1.length < 8) { setErrClave('La clave nueva debe tener al menos 8 caracteres.'); return }
    if (p1 !== p2) { setErrClave('Las dos claves no coinciden.'); return }
    setCambiando(true)
    try { const { error: e1 } = await supabase.auth.updateUser({ password: p1 }); if (e1) throw e1; await claveCambiada(); setDebeCambiar(false); setP1(''); setP2('') }
    catch (e) { setErrClave(e.message || String(e)) } finally { setCambiando(false) }
  }

  useEffect(() => {
    let vivo = true
    listarOts().then(rows => { if (!vivo) return; setOts(rows); if (rows.length === 1) setOtId(rows[0].id) })
      .catch(e => vivo && setError(errorLegible(e))).finally(() => vivo && setCargando(false))
    return () => { vivo = false }
  }, [])

  const recargar = () => { if (!otId) { setDatos(null); return } cargarOT(otId).then(setDatos).catch(e => setError(errorLegible(e))) }
  useEffect(() => { recargar() }, [otId]) // eslint-disable-line react-hooks/exhaustive-deps

  const responder = async (aprobacionId, accion, comentario) => {
    await responderAprobacion(aprobacionId, userId, accion, comentario)
    recargar()
  }

  const resumen = datos && datos.ot ? resumenOT(datos) : null
  return (
    <div style={{ minHeight: '100vh', background: SEREIN.fog, fontFamily: SEREIN.fontBody }}>
      <div style={{ background: SEREIN.text, color: '#fff', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 16, letterSpacing: 0.3, display: 'flex', alignItems: 'center', gap: 8 }}><HardHat size={17} /> SEREIN · Avance de tu obra</div>
          <div style={{ fontSize: 12.5, color: '#B7BEC7' }}>{perfil.nombre || email}</div>
        </div>
        <button onClick={onLogout} style={{ background: 'none', border: '1px solid #4A5158', color: '#fff', borderRadius: 4, padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}><LogOut size={14} /> Cerrar sesión</button>
      </div>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px' }}>
        {error && <div style={{ background: SEREIN.redSoft, color: SEREIN.red, padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>}
        {debeCambiar ? (
          <div style={{ background: '#fff', border: '1px solid ' + SEREIN.orange, borderRadius: 10, padding: 18, maxWidth: 440, margin: '0 auto' }}>
            <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 800, fontSize: 16 }}>Crea tu clave personal</div>
            <div style={{ fontSize: 12.5, color: SEREIN.textSoft, marginTop: 4 }}>Entraste con la clave inicial que te entregó SEREIN. Por seguridad, elige una clave propia antes de continuar.</div>
            <input type="password" value={p1} onChange={e => setP1(e.target.value)} placeholder="Clave nueva (mínimo 8 caracteres)" autoComplete="new-password" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid ' + SEREIN.line, borderRadius: 6, padding: 9, fontSize: 13, marginTop: 12 }} />
            <input type="password" value={p2} onChange={e => setP2(e.target.value)} placeholder="Repite la clave" autoComplete="new-password" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid ' + SEREIN.line, borderRadius: 6, padding: 9, fontSize: 13, marginTop: 8 }} />
            {errClave && <div style={{ color: SEREIN.red, fontSize: 12, marginTop: 6 }}>{errClave}</div>}
            <button disabled={cambiando} onClick={cambiarClave} style={{ marginTop: 12, width: '100%', background: SEREIN.orange, color: '#fff', border: 0, borderRadius: 6, padding: 10, fontWeight: 600, cursor: 'pointer' }}>{cambiando ? 'Guardando…' : 'Guardar clave y entrar'}</button>
          </div>
        ) : cargando ? <div style={{ color: SEREIN.textFaint, fontSize: 13 }}>Cargando…</div>
          : !ots.length ? <div style={{ background: '#fff', border: '1px solid ' + SEREIN.line, borderRadius: 8, padding: 16, fontSize: 13, color: SEREIN.textSoft }}>Todavía no hay ninguna obra publicada para tu cuenta. Si crees que es un error, escríbenos a SEREIN.</div>
          : (
            <>
              {ots.length > 1 && (
                <select value={otId} onChange={e => setOtId(e.target.value)} style={{ border: '1px solid ' + SEREIN.line, borderRadius: 6, padding: '8px 10px', fontSize: 13, minWidth: 260, marginBottom: 14, background: '#fff' }}>
                  <option value="">Elegir obra…</option>
                  {ots.map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nombre}</option>)}
                </select>
              )}
              {datos && datos.ot && <VistaCliente datos={datos} resumen={resumen} modo="cliente" onResponder={responder} usuario={perfil.nombre || email} />}
            </>
          )}
      </div>
    </div>
  )
}
