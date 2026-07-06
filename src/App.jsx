import React, { useState, useEffect } from 'react'
import { supabase } from './supabase.js'
import Login from './Login.jsx'
import Dashboard from './Dashboard.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorPerfil, setErrorPerfil] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCargando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setPerfil(null); return }
    supabase
      .from('perfiles')
      .select('nombre, rol, areas, tipo')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setErrorPerfil('Tu cuenta existe pero no tiene perfil asignado. Pide al administrador que te asigne un área.')
        else setPerfil(data)
      })
  }, [session])

  async function salir() {
    await supabase.auth.signOut()
    setPerfil(null)
    setErrorPerfil(null)
  }

  if (cargando) return <Pantalla msg="Cargando…" />
  if (!session) return <Login />
  if (errorPerfil) return <Pantalla msg={errorPerfil} accion={salir} accionTxt="Cerrar sesión" />
  if (!perfil) return <Pantalla msg="Verificando tu perfil…" />
  return <Dashboard perfil={perfil} email={session.user.email} onLogout={salir} />
}

function Pantalla({ msg, accion, accionTxt }) {
  return (
    <div style={{ minHeight: '100vh', background: '#161616', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, fontFamily: "'Inter',sans-serif", padding: 20, textAlign: 'center' }}>
      <div style={{ color: '#B8C0C6', fontSize: 15, maxWidth: 420 }}>{msg}</div>
      {accion && (
        <button onClick={accion} style={{ background: '#D2642F', border: 'none', padding: '10px 20px', cursor: 'pointer', fontWeight: 600 }}>
          {accionTxt}
        </button>
      )}
    </div>
  )
}
