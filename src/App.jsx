import React, { useState, useEffect } from 'react'
import { supabase } from './supabase.js'
import Login from './Login.jsx'
import Dashboard from './Dashboard.jsx'
import LogoSerein from './LogoSerein.jsx'
import { pullState, pushState } from './sync.js'
import { SEREIN } from './theme-serein.js'

// Captura errores de render para que la app no se quede en blanco y muestre el detalle
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('Error en la app:', error, info) }
  render() {
    if (this.state.error) {
      const msg = (this.state.error && this.state.error.message) || String(this.state.error)
      return (
        <div style={{ minHeight: '100vh', background: '#101315', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, fontFamily: "'Inter',sans-serif", padding: 24, textAlign: 'center' }}>
          <div style={{ color: '#C5453D', fontSize: 16, fontWeight: 600 }}>Se produjo un error al mostrar el panel</div>
          <div style={{ color: '#9AA3AD', fontSize: 13, maxWidth: 620, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg}</div>
          <button onClick={() => { try { Object.keys(localStorage).filter(k => k.startsWith('serein_')).forEach(k => localStorage.removeItem(k)) } catch (e) {} location.reload() }}
            style={{ background: '#F77716', color: '#fff', border: 'none', padding: '10px 20px', cursor: 'pointer', fontWeight: 600 }}>
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
  const [hayVersionNueva, setHayVersionNueva] = useState(false)

  // Cuando se publica un arreglo, las pestanas ya abiertas siguen corriendo
  // el codigo viejo hasta que alguien recarga a mano — asi que un bug ya
  // corregido puede "seguir pasando" para quien no recargo. Este chequeo
  // detecta si el HTML publicado cambio (nuevo build) y avisa para recargar.
  useEffect(() => {
    let html0 = null
    const chequear = async () => {
      try {
        const r = await fetch('/', { cache: 'no-store' })
        const t = await r.text()
        if (html0 === null) { html0 = t; return }
        if (t !== html0) setHayVersionNueva(true)
      } catch (e) {}
    }
    chequear()
    const id = setInterval(chequear, 5 * 60 * 1000)
    const onVis = () => { if (document.visibilityState === 'visible') chequear() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCargando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setRecovery(true)
      // Supabase a veces dispara este evento con sesion nula al revisar el
      // token justo al volver a la pestana (ej. despues de mirar WhatsApp),
      // antes de reconfirmarla — si lo tomamos al pie de la letra, se
      // desmonta el Dashboard y al volver a montar pierde la pestana en la
      // que estaba (cae en la primera de su lista). Solo cerramos sesion
      // de verdad ante un SIGNED_OUT explicito.
      if (!s && evento !== 'SIGNED_OUT') return
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

  // Trae lo inicial y sigue empujando los cambios locales cada 2s. Traer de
  // vuelta lo que cambian OTROS usuarios (en vivo + respaldo periodico) ya
  // no pasa aca — pasa dentro de Dashboard.jsx, pieza por pieza, para poder
  // aplicarlo sin remontar nada ni interrumpir a nadie a mitad de una tarea.
  useEffect(() => {
    if (!perfil) return
    let vivo = true
    pullState().then(res => { if (res.ok && res.n === 0) pushState() }).finally(() => { if (vivo) setSincronizado(true) })
    const id = setInterval(() => { pushState() }, 2000)
    const onHide = () => { pushState() }
    const onVisible = () => { if (document.visibilityState !== 'visible') pushState() }
    window.addEventListener('beforeunload', onHide)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      vivo = false; clearInterval(id)
      window.removeEventListener('beforeunload', onHide)
      document.removeEventListener('visibilitychange', onVisible)
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
      <Dashboard perfil={perfil} email={session.user.email} onLogout={salir} />
      {hayVersionNueva && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000, background: '#2A5FB0', color: '#fff', padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, fontFamily: "'Inter',sans-serif", fontSize: 13, boxShadow: '0 2px 10px rgba(0,0,0,.3)' }}>
          <span>Hay una versión nueva de la app — recarga para tener los últimos arreglos</span>
          <button onClick={() => location.reload()}
            style={{ background: '#fff', color: '#2A5FB0', border: 'none', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
            Recargar ahora
          </button>
        </div>
      )}
    </ErrorBoundary>
  )
}

function Pantalla({ msg, accion, accionTxt }) {
  return (
    <div style={{ minHeight: '100vh', background: '#101315', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, fontFamily: "'Inter',sans-serif", padding: 20, textAlign: 'center' }}>
      <div style={{ color: '#9AA3AD', fontSize: 15, maxWidth: 620, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg}</div>
      {accion && (
        <button onClick={accion} style={{ background: '#F77716', border: 'none', padding: '10px 20px', cursor: 'pointer', fontWeight: 600 }}>
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
    border: '1px solid #DFE4EA', borderRadius: 6, fontSize: 14, background: '#fff',
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
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #F2F4F7 0%, #F2F4F7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter',sans-serif", padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <LogoSerein alto={54} />
        </div>
        <div style={{ background: '#fff', border: '1px solid #DFE4EA', borderTop: '4px solid #F77716', borderRadius: 4, padding: 30, boxShadow: '0 12px 40px -12px rgba(29,29,27,0.18)' }}>
          {ok ? (
            <>
              <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 18, textTransform: 'uppercase', marginBottom: 8 }}>Contraseña actualizada</div>
              <p style={{ fontSize: 13.5, color: '#5A636E', lineHeight: 1.5, marginBottom: 18 }}>Tu nueva contraseña quedó guardada. Ya puedes ingresar al panel.</p>
              <button onClick={onListo} style={{ width: '100%', padding: 12, background: '#101315', color: '#fff', border: 'none', borderRadius: 6, fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, letterSpacing: 1, cursor: 'pointer', textTransform: 'uppercase' }}>Entrar al panel</button>
            </>
          ) : (
            <>
              <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 18, textTransform: 'uppercase', marginBottom: 14 }}>Crear nueva contraseña</div>
              <label style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>NUEVA CONTRASEÑA</label>
              <input type="password" value={p1} onChange={e => setP1(e.target.value)} placeholder="••••••••" style={inputBase} />
              <label style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>REPETIR CONTRASEÑA</label>
              <input type="password" value={p2} onChange={e => setP2(e.target.value)} onKeyDown={e => e.key === 'Enter' && guardar()} placeholder="••••••••" style={inputBase} />
              {err && <div style={{ color: '#C5453D', fontSize: 13, marginBottom: 12 }}>{err}</div>}
              <button onClick={guardar} disabled={cargando} style={{ width: '100%', padding: 12, background: '#101315', color: '#fff', border: 'none', borderRadius: 6, fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, letterSpacing: 1, cursor: 'pointer', textTransform: 'uppercase', opacity: cargando ? 0.7 : 1 }}>{cargando ? 'Guardando…' : 'Guardar contraseña'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
