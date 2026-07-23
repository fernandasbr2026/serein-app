import React from 'react'

// Logo SEREIN GROUP — chevron naranja + chevron negro interior + wordmark
// Recreado en SVG para que se vea nítido en cualquier tamaño.
// props: alto (px), oscuro (true = para fondos oscuros: texto blanco)
export default function LogoSerein({ alto = 40, oscuro = false }) {
  const naranja = '#F77716'
  const negro = oscuro ? '#FFFFFF' : '#111111'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: alto * 0.22 }}>
      <svg height={alto} viewBox="0 0 90 100" style={{ display: 'block', flexShrink: 0 }} aria-hidden="true">
        {/* Chevron exterior naranja */}
        <polygon points="52,0 88,0 34,50 88,100 52,100 0,50" fill={naranja} />
        {/* Chevron interior negro */}
        <polygon points="72,12 88,12 48,50 88,88 72,88 32,50" fill={oscuro ? '#000000' : '#111111'} />
      </svg>
      <div style={{ lineHeight: 1 }}>
        <div style={{
          fontFamily: "'Oswald', sans-serif",
          fontWeight: 700,
          fontSize: alto * 0.72,
          letterSpacing: alto * 0.02,
          color: naranja,
          textTransform: 'uppercase',
        }}>
          SEREIN
        </div>
        <div style={{
          fontFamily: "'Oswald', sans-serif",
          fontWeight: 600,
          fontSize: alto * 0.24,
          letterSpacing: alto * 0.09,
          color: negro,
          textTransform: 'uppercase',
          textAlign: 'right',
          marginTop: alto * 0.04,
        }}>
          GROUP
        </div>
      </div>
    </div>
  )
}
