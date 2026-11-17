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
import { listarOts, cargarOT, responderAprobacion, errorLegible } from './avance/api.js'
import { resumenOT } from './avance/calc.js'

export default function ClienteObraApp({ perfil, email, onLogout, userId }) {
  const [ots, setOts] = useState([])
  const [otId, setOtId] = useState('')
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

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
        {cargando ? <div style={{ color: SEREIN.textFaint, fontSize: 13 }}>Cargando…</div>
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
