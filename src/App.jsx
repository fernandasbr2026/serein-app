import React, { useState, useEffect } from 'react'
import { supabase } from './supabase.js'
import Login from './Login.jsx'
import Dashboard from './Dashboard.jsx'
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCargando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
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
    const id = setInterval(() => { pushState() }, 8000)
    const onHide = () => { pushState() }
    window.addEventListener('beforeunload', onHide)
    return () => { vivo = false; clearInterval(id); window.removeEventListener('beforeunload', onHide) }
  }, [perfil])

  async function salir() {
    await supabase.auth.signOut()
    setPerfil(null)
    setErrorPerfil(null)
  }

  if (cargando) return <Pantalla msg="Cargando…" />
  if (!session) return <Login />
  if (errorPerfil) return <Pantalla msg={errorPerfil} accion={salir} accionTxt="Cerrar sesión" />
  if (!perfil) return <Pantalla msg="Verificando tu perfil…" />
  if (!sincronizado) return <Pantalla msg="Sincronizando datos con la nube..." />
  return <ErrorBoundary><Dashboard perfil={perfil} email={session.user.email} onLogout={salir} /></ErrorBoundary>
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
