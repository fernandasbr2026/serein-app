// Función avanzada (sección 2.8 del documento): optimización de espesor
// PPG SG864 por temperatura crítica (Tc), 400-700 °C, a partir del
// certificado completo IDIEM (ppg-sg864-tc-completas.json). El baseline
// del especificador (Paso 1) usa siempre Tc 500 °C — esto es opcional,
// por línea, y exige quedar respaldado por memoria de cálculo si se
// elige una Tc > 500.
import PPG_TC from './ppg-sg864-tc-completas.json' with { type: 'json' }

export const TC_DISPONIBLES = [400, 425, 450, 475, 500, 525, 550, 575, 600, 650, 700]
export const TC_DEFAULT = 500

// Tc mínima del certificado para F120 en vigas (regla 2.8): por debajo de
// esa Tc el certificado no cubre la combinación.
export const TC_MINIMA_F120 = { viga4: 525, viga3: 620 }

// Arma las tablas de SG864 (col4/viga3/viga4/tubest, igual forma que
// buildTablas() de intumescente-tablas-v2.js) para UNA temperatura
// crítica específica. tubest reusa col4 (mismo criterio conservador que
// la sección 2.4 del documento).
export function tablaSG864ParaTc(tc) {
  const t = { col4: {}, viga3: {}, viga4: {} }
  for (const key of Object.keys(PPG_TC)) {
    const [f, tipo] = key.split('|')
    const { temps, rows } = PPG_TC[key]
    const idx = temps.indexOf(tc)
    if (idx === -1) continue
    t[tipo] = t[tipo] || {}
    t[tipo][f] = Object.fromEntries(Object.entries(rows).map(([m, arr]) => [Number(m), arr[idx]]))
  }
  t.tubest = t.col4
  return t
}
