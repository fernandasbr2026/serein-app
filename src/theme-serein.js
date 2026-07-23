// Tokens de diseño de la identidad Serein Group 2026 (panel-serein-v2.html).
// Solo forma (colores, tipografia, radios, sombras) — no contiene ningun dato
// ni logica de negocio. Fuente unica de verdad para el rediseño visual.
export const SEREIN = {
  orange: '#F77716',
  orangeDark: '#D9600A',
  orangeLight: '#FF9D5C',
  orangeSoft: '#FDECDD',
  ink: '#101315',
  ink2: '#16191C',
  ink3: '#1B1F23',
  paper: '#FFFFFF',
  fog: '#F2F4F7',
  fog2: '#E2E7EC',
  line: '#DFE4EA',
  text: '#191C20',
  textSoft: '#5A636E',
  textFaint: '#9AA3AD',
  green: '#1B9E5D',
  greenSoft: '#E6F7EE',
  red: '#C5453D',
  redSoft: '#FCEBEA',
  blue: '#2A5FB0',
  blueSoft: '#E7EFFB',
  radius: 10,
  radiusSm: 6,
  radiusPill: 20,
  shadow: '0 1px 2px rgba(16,19,21,.04)',
  shadowMd: '0 8px 24px -8px rgba(16,19,21,.18)',
  fontDisplay: "'Archivo', sans-serif",
  fontBody: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
}

// Variantes de "pill" de estado (badges), como en el mockup.
export const PILL_VARIANT = {
  verde: { bg: SEREIN.greenSoft, fg: SEREIN.green },
  naranja: { bg: SEREIN.orangeSoft, fg: SEREIN.orangeDark },
  gris: { bg: SEREIN.fog2, fg: SEREIN.textSoft },
  azul: { bg: SEREIN.blueSoft, fg: SEREIN.blue },
  rojo: { bg: SEREIN.redSoft, fg: SEREIN.red },
}
