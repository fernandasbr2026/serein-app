import React, { useState } from 'react'
import { supabase } from './supabase.js'
import { Lock } from 'lucide-react'
import LogoSerein from './LogoSerein.jsx'

const C = { azul: '#1D1D1B', ambar: '#D2642F', rojo: '#B5432E', carbon: '#161616' }

export default function Login() {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [cargando, setCargando] = useState(false)

  async function entrar() {
    setErr(''); setCargando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
    setCargando(false)
    if (error) setErr('Correo o contraseña incorrectos.')
  }

  return (
    <div style={{ minHeight: '100vh', background: C.carbon, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter',sans-serif", padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <LogoSerein alto={52} oscuro />
          <p style={{ color: '#8A9299', fontSize: 12, margin: '14px 0 0', letterSpacing: 1 }}>REVESTIMIENTOS INDUSTRIALES · PANEL 2026</p>
        </div>
        <div style={{ background: '#fff', padding: 26 }}>
          <label style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>CORREO</label>
          <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()}
            type="email" placeholder="tu@correo.com" autoComplete="username"
            style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', margin: '6px 0 16px', border: '1px solid #CBD2D6', fontSize: 14 }} />
          <label style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>CONTRASEÑA</label>
          <input value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()}
            type="password" placeholder="••••••••" autoComplete="current-password"
            style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', margin: '6px 0 16px', border: '1px solid #CBD2D6', fontSize: 14 }} />
          {err && <div style={{ color: C.rojo, fontSize: 13, marginBottom: 12 }}>{err}</div>}
          <button onClick={entrar} disabled={cargando}
            style={{ width: '100%', padding: 12, background: C.azul, color: '#fff', border: 'none', fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, letterSpacing: 1, cursor: 'pointer', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: cargando ? 0.7 : 1 }}>
            <Lock size={16} /> {cargando ? 'Verificando…' : 'Ingresar'}
          </button>
        </div>
        <p style={{ color: '#6B747A', fontSize: 11, textAlign: 'center', marginTop: 14 }}>
          Acceso solo para personal autorizado de SEREIN SpA.
        </p>
      </div>
    </div>
  )
}
