import React, { useState } from 'react'
import { Smartphone, X } from 'lucide-react'
import { useInstalacion } from './instalacion.js'
import { SEREIN } from './theme-serein.js'

// Invitación a dejar el ERP en la pantalla de inicio del celular, como una app más. Se muestra en el
// login y abajo en el menú. No aparece si el navegador no permite instalar o si ya se abrió instalada.
// `compacto` = dentro del menú naranja (texto blanco, sin fondo propio).
export default function InstalarApp({ compacto = false }) {
  const { ofrecer, esIos, instalar } = useInstalacion()
  const [pasosIos, setPasosIos] = useState(false)
  if (!ofrecer) return null
  const fg = compacto ? '#fff' : SEREIN.text
  const sub = compacto ? 'rgba(255,255,255,.8)' : SEREIN.textSoft
  const pasos = (
    <ol style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: sub }}>
      <li>Toca el botón <b style={{ color: fg }}>Compartir</b> (el cuadrado con la flecha hacia arriba).</li>
      <li>Elige <b style={{ color: fg }}>«Agregar a pantalla de inicio»</b>.</li>
      <li>Toca <b style={{ color: fg }}>Agregar</b>.</li>
    </ol>
  )
  const boton = esIos
    ? <button onClick={() => setPasosIos(v => !v)} style={{ marginTop: 10, width: '100%', background: compacto ? 'rgba(255,255,255,.16)' : SEREIN.orange, color: '#fff', border: compacto ? '1px solid rgba(255,255,255,.45)' : 'none', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {pasosIos ? <><X size={14} /> Ocultar pasos</> : 'Cómo instalarla en iPhone'}
      </button>
    : <button onClick={instalar} style={{ marginTop: 10, width: '100%', background: compacto ? '#fff' : SEREIN.orange, color: compacto ? SEREIN.orangeDark : '#fff', border: 'none', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Instalar app</button>
  return (
    <div style={compacto
      ? { marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.12)' }
      : { marginTop: 16, padding: '14px 16px', borderRadius: 14, background: '#fff', border: '1px solid ' + SEREIN.line, boxShadow: SEREIN.shadow, textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: compacto ? 'rgba(255,255,255,.18)' : SEREIN.orangeSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Smartphone size={18} color={compacto ? '#fff' : SEREIN.orangeDark} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: fg }}>Instala el ERP en tu celular</div>
          <div style={{ fontSize: 12, color: sub, lineHeight: 1.35 }}>Queda en tu pantalla de inicio, como una app, sin buscar el link.</div>
        </div>
      </div>
      {boton}
      {esIos && pasosIos && pasos}
    </div>
  )
}
