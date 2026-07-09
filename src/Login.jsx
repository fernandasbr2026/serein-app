import React, { useState } from 'react'
import { supabase } from './supabase.js'
import { Lock } from 'lucide-react'
import LogoSerein from './LogoSerein.jsx'

const C = { azul: '#1D1D1B', ambar: '#D2642F', rojo: '#B5432E', verde: '#3D7A4E', carbon: '#161616', niebla: '#F6F0EA', borde: '#E2DED4' }

const inputBase = {
  width: '100%', boxSizing: 'border-box', padding: '11px 12px', margin: '6px 0 16px',
  border: '1px solid #CBD2D6', borderRadius: 6, fontSize: 14, background: '#fff',
  outline: 'none', fontFamily: "'Inter',sans-serif",
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [cargando, setCargando] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function entrar() {
    setErr(''); setInfo(''); setCargando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
    setCargando(false)
    if (error) setErr('Correo o contraseña incorrectos.')
  }

  async function recuperar() {
    setErr(''); setInfo('')
    const correo = email.trim()
    if (!correo) { setErr('Escribe tu correo arriba y vuelve a tocar “¿Olvidaste tu contraseña?”.'); return }
    setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(correo, { redirectTo: window.location.origin })
    setEnviando(false)
    if (error) setErr('No pudimos enviar el correo. Revisa la dirección e inténtalo de nuevo.')
    else setInfo('Te enviamos un correo a ' + correo + ' con un enlace para crear una nueva contraseña. Revisa tu bandeja (y la carpeta de spam).')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #F6F0EA 0%, #EFE6DC 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter',sans-serif", padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <LogoSerein alto={54} />
          <p style={{ color: '#8A7F72', fontSize: 11.5, margin: '14px 0 0', letterSpacing: 1.5, fontWeight: 600 }}>REVESTIMIENTOS INDUSTRIALES · PANEL 2026</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid ' + C.borde, borderTop: '4px solid ' + C.ambar, borderRadius: 4, padding: 30, boxShadow: '0 12px 40px -12px rgba(29,29,27,0.18)' }}>
          <label style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5, color: C.carbon }}>CORREO</label>
          <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()}
            type="email" placeholder="tu@correo.com" autoComplete="username" style={inputBase} />
          <label style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5, color: C.carbon }}>CONTRASEÑA</label>
          <input value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()}
            type="password" placeholder="••••••••" autoComplete="current-password" style={inputBase} />
          {err && <div style={{ color: C.rojo, fontSize: 13, marginBottom: 12, lineHeight: 1.4 }}>{err}</div>}
          {info && <div style={{ color: C.verde, fontSize: 13, marginBottom: 12, lineHeight: 1.5, background: '#EEF6F0', border: '1px solid #CDE6D5', padding: '9px 11px', borderRadius: 6 }}>{info}</div>}
          <button onClick={entrar} disabled={cargando}
            style={{ width: '100%', padding: 12, background: C.azul, color: '#fff', border: 'none', borderRadius: 6, fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, letterSpacing: 1, cursor: 'pointer', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: cargando ? 0.7 : 1 }}>
            <Lock size={16} /> {cargando ? 'Verificando…' : 'Ingresar'}
          </button>
          <button onClick={recuperar} disabled={enviando}
            style={{ width: '100%', marginTop: 14, background: 'none', border: 'none', color: C.ambar, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>
            {enviando ? 'Enviando…' : '¿Olvidaste tu contraseña?'}
          </button>
        </div>
        <p style={{ color: '#8A7F72', fontSize: 11, textAlign: 'center', marginTop: 16 }}>
          Acceso solo para personal autorizado de SEREIN SpA.
        </p>
      </div>
    </div>
  )
}
