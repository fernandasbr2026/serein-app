// Control de Taller para personas externas (Fase J3 del plan — ver
// C:\Users\maria\.claude\plans\sorted-singing-sundae.md). App COMPLETAMENTE
// APARTE del resto del ERP, mismo criterio que SubcontratoApp.jsx: nunca
// importa Dashboard.jsx ni nada que dependa de sync.js/app_state. Reutiliza
// TableroControlTaller de ControlTallerModule.jsx tal cual (ya solo
// necesita un `ot`, gracias al refactor de la Fase J2) — la única
// diferencia con la vista de gerencia es que el selector de proyecto acá
// se arma con `taller_asignaciones` (tabla real con RLS, cada quien solo
// ve las suyas) en vez de con el blob completo de proyectos.
import React, { useState, useEffect } from 'react'
import { LogOut, Hammer } from 'lucide-react'
import { supabase } from './supabase.js'
import { TableroControlTaller } from './ControlTallerModule.jsx'
import { SEREIN } from './theme-serein.js'

const C = { carbon: SEREIN.text, gris: SEREIN.textFaint }

export default function TallerExternoApp({ perfil, email, onLogout }) {
  const [asignaciones, setAsignaciones] = useState([])
  const [ot, setOt] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    supabase.from('taller_asignaciones').select('*').order('ot').then(({ data, error: err }) => {
      if (!vivo) return
      if (err) setError('No se pudo cargar tu información: ' + err.message)
      else setAsignaciones(data || [])
      setCargando(false)
    })
    return () => { vivo = false }
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: SEREIN.fog }}>
      <div style={{ background: C.carbon, color: '#fff', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 16, letterSpacing: 0.3, display: 'flex', alignItems: 'center', gap: 8 }}><Hammer size={17} /> SEREIN · Control de Taller</div>
          <div style={{ fontSize: 12.5, color: '#B7BEC7' }}>{perfil.nombre || email}</div>
        </div>
        <button onClick={onLogout} style={{ background: 'none', border: '1px solid #4A5158', color: '#fff', borderRadius: 4, padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}><LogOut size={14} /> Cerrar sesión</button>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 16px' }}>
        {error && <div style={{ background: '#FCEBEA', color: SEREIN.red, padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>}
        {cargando ? (
          <div style={{ color: C.gris, fontSize: 13 }}>Cargando…</div>
        ) : !asignaciones.length ? (
          <div style={{ background: '#fff', border: '1px solid #DFE4EA', borderRadius: 6, padding: 16, fontSize: 13, color: C.gris }}>Todavía no tienes ningún proyecto asignado. Contacta a Serein para que te habiliten al menos uno.</div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <select value={ot} onChange={e => setOt(e.target.value)} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '7px 10px', fontSize: 13, minWidth: 260 }}>
                <option value="">Elegir proyecto…</option>
                {asignaciones.map(a => <option key={a.id} value={a.ot}>{a.ot}</option>)}
              </select>
            </div>
            {ot && <TableroControlTaller key={ot} ot={ot} nombreProyecto={ot} />}
          </>
        )}
      </div>
    </div>
  )
}
