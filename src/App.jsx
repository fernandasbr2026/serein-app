import React, { useState, useEffect } from 'react'
import { supabase } from './supabase.js'
import Login from './Login.jsx'
import Dashboard from './Dashboard.jsx'
import LogoSerein from './LogoSerein.jsx'
import { pullState, pushState } from './sync.js'

// Captura errores de render para que la app no se quede en blanco y muestre el detalle
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('Error en la app:', error, info) }
  render() {
    if (this.state.error) {
      const msg = (this.state.error && this.state.error.message) || String(this.state.error)
      return (
        <div style={{ minHeight: '100vh', background: '#161616', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, fontFamily: "'Inter',sans-serif", padding: 24, textAlign: 'center' }}>
          <div style={{ color: '#E8836F', fontSize: 16, fontWeight: 600 }}>Se produjo un error al mostrar el panel</div>
          <div style={{ color: '#B8C0C6', fontSize: 13, maxWidth: 620, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg}</div>
          <button onClick={() => { try { Object.keys(localStorage).filter(k => k.startsWith('serein_')).forEach(k => localStorage.removeItem(k)) } catch (e) {} location.reload() }}
            style={{ background: '#D2642F', color: '#fff', border: 'none', padding: '10px 20px', cursor: 'pointer', fontWeight: 600 }}>
            Reiniciar datos locales y recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const [session, setSession] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorPerfil, setErrorPerfil] = useState(null)
  const [sincronizado, setSincronizado] = useState(false)
  const [recovery, setRecovery] = useState(false)
  const [syncKey, setSyncKey] = useState(0)
  const [hayNovedades, setHayNovedades] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCargando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setPerfil(null); setErrorPerfil(null); return }
    supabase
      .from('perfiles')
      .select('nombre, rol, areas, tipo, modulos, sin_valores')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error) setErrorPerfil('No pude leer tu perfil. Detalle técnico: ' + error.message + (error.code ? ' [código ' + error.code + ']' : '') + '\n\nUsuario: ' + (session.user.email || '') + ' · id: ' + session.user.id)
        else if (!data) setErrorPerfil('Tu cuenta existe pero no tiene perfil asignado. Pide al administrador que te asigne un área.')
        else { setErrorPerfil(null); setPerfil(data) }
      })
      .catch(e => setErrorPerfil('Error de conexión al leer el perfil: ' + (e && e.message ? e.message : String(e))))
  }, [session])

  useEffect(() => {
    if (!perfil) return
    let vivo = true
    pullState().then(res => { if (res.ok && res.n === 0) pushState() }).finally(() => { if (vivo) setSincronizado(true) })
    const id = setInterval(() => { pushState() }, 2000)

    // Cada pestaña solo EMPUJA sus cambios — nunca vuelve a leer lo que
    // cambió otro usuario, así que dos personas podían ver datos
    // distintos hasta recargar la página a mano. Este re-pull periódico
    // (y al volver a la pestaña) trae lo último de la nube. OJO: no
    // remonta el Dashboard solo — eso resetea la pestaña/formulario en
    // el que la persona está trabajando (le pasó a Joce). Solo avisa
    // con un botón para que decida cuándo actualizar su pantalla.
    const snapshot = () => {
      const s = {}
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && /^(serein_|__serein_|cotizador_)/.test(k)) s[k] = localStorage.getItem(k) }
      return s
    }
    const repull = async () => {
      const antes = snapshot()
      const res = await pullState()
      if (!res.ok) return
      const despues = snapshot()
      const cambio = Object.keys(despues).some(k => despues[k] !== antes[k]) || Object.keys(antes).length !== Object.keys(despues).length
      if (cambio) setHayNovedades(true)
    }
    const repullId = setInterval(repull, 20000)
    const onVisible = () => { if (document.visibilityState === 'visible') repull(); else pushState() }
    const onHide = () => { pushState() }
    window.addEventListener('beforeunload', onHide)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', repull)
    return () => {
      vivo = false; clearInterval(id); clearInterval(repullId)
      window.removeEventListener('beforeunload', onHide)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', repull)
    }
  }, [perfil])

  async function salir() {
    await supabase.auth.signOut()
    setPerfil(null)
    setErrorPerfil(null)
    setRecovery(false)
  }

  if (cargando) return <Pantalla msg="Cargando…" />
  if (recovery && session) return <NuevaClave onListo={() => setRecovery(false)} />
  if (!session) return <Login />
  if (errorPerfil) return <Pantalla msg={errorPerfil} accion={salir} accionTxt="Cerrar sesión" />
  if (!perfil) return <Pantalla msg="Verificando tu perfil…" />
  if (!sincronizado) return <Pantalla msg="Sincronizando datos con la nube..." />
  return (
    <ErrorBoundary>
      <Dashboard key={syncKey} perfil={perfil} email={session.user.email} onLogout={salir} />
      {hayNovedades && (
        <div style={{ position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#1E2732', border: '1px solid #2E3945', borderRadius: 10, padding: '10px 12px 10px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 6px 20px rgba(0,0,0,.35)', fontFamily: "'Inter',sans-serif" }}>
          <span style={{ color: '#DCE3E8', fontSize: 13 }}>Hay cambios nuevos de otros usuarios</span>
          <button onClick={() => { setSyncKey(k => k + 1); setHayNovedades(false) }}
            style={{ background: '#D2642F', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            Actualizar
          </button>
          <button onClick={() => setHayNovedades(false)}
            style={{ background: 'transparent', color: '#8A97A3', border: 'none', cursor: 'pointer', fontSize: 13, padding: '7px 4px' }}>
            Ahora no
          </button>
        </div>
      )}
    </ErrorBoundary>
  )
}

function Pantalla({ msg, accion, accionTxt }) {
  return (
    <div style={{ minHeight: '100vh', background: '#161616', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, fontFamily: "'Inter',sans-serif", padding: 20, textAlign: 'center' }}>
      <div style={{ color: '#B8C0C6', fontSize: 15, maxWidth: 620, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg}</div>
      {accion && (
        <button onClick={accion} style={{ background: '#D2642F', border: 'none', padding: '10px 20px', cursor: 'pointer', fontWeight: 600 }}>
          {accionTxt}
        </button>
      )}
    </div>
  )
}

// Pantalla de recuperacion: aparece cuando el usuario llega desde el enlace
// "Olvidaste tu contrasena" del correo. Permite fijar una nueva contrasena.
function NuevaClave({ onListo }) {
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)
  const [cargando, setCargando] = useState(false)

  const inputBase = {
    width: '100%', boxSizing: 'border-box', padding: '11px 12px', margin: '6px 0 16px',
    border: '1px solid #CBD2D6', borderRadius: 6, fontSize: 14, background: '#fff',
    outline: 'none', fontFamily: "'Inter',sans-serif",
  }

  async function guardar() {
    setErr('')
    if (p1.length < 6) { setErr('La contraseña debe tener al menos 6 caracteres.'); return }
    if (p1 !== p2) { setErr('Las contraseñas no coinciden.'); return }
    setCargando(true)
    const { error } = await supabase.auth.updateUser({ password: p1 })
    setCargando(false)
    if (error) setErr('No se pudo actualizar: ' + error.message)
    else setOk(true)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #F6F0EA 0%, #EFE6DC 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter',sans-serif", padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <LogoSerein alto={54} />
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2DED4', borderTop: '4px solid #D2642F', borderRadius: 4, padding: 30, boxShadow: '0 12px 40px -12px rgba(29,29,27,0.18)' }}>
          {ok ? (
            <>
              <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 18, textTransform: 'uppercase', marginBottom: 8 }}>Contraseña actualizada</div>
              <p style={{ fontSize: 13.5, color: '#5C5750', lineHeight: 1.5, marginBottom: 18 }}>Tu nueva contraseña quedó guardada. Ya puedes ingresar al panel.</p>
              <button onClick={onListo} style={{ width: '100%', padding: 12, background: '#1D1D1B', color: '#fff', border: 'none', borderRadius: 6, fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, letterSpacing: 1, cursor: 'pointer', textTransform: 'uppercase' }}>Entrar al panel</button>
            </>
          ) : (
            <>
              <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 18, textTransform: 'uppercase', marginBottom: 14 }}>Crear nueva contraseña</div>
              <label style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>NUEVA CONTRASEÑA</label>
              <input type="password" value={p1} onChange={e => setP1(e.target.value)} placeholder="••••••••" style={inputBase} />
              <label style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>REPETIR CONTRASEÑA</label>
              <input type="password" value={p2} onChange={e => setP2(e.target.value)} onKeyDown={e => e.key === 'Enter' && guardar()} placeholder="••••••••" style={inputBase} />
              {err && <div style={{ color: '#B5432E', fontSize: 13, marginBottom: 12 }}>{err}</div>}
              <button onClick={guardar} disabled={cargando} style={{ width: '100%', padding: 12, background: '#1D1D1B', color: '#fff', border: 'none', borderRadius: 6, fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, letterSpacing: 1, cursor: 'pointer', textTransform: 'uppercase', opacity: cargando ? 0.7 : 1 }}>{cargando ? 'Guardando…' : 'Guardar contraseña'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
