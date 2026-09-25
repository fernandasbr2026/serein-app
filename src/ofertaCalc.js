// Cálculos del formato "oferta" de cotización (capas del esquema y cubicación).
// Funciones puras: mismos números que el documento — nada se calcula "a ojo"
// en el PDF. Validadas contra la Cotización N° 918 Rev.1 (ver
// ofertaCalc.test.mjs).

const LITROS_POR_GALON = 3.785
const nd = s => {
  let x = String(s == null ? '' : s).trim().replace(/[^\d.,-]/g, '')
  if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, '')
  const v = parseFloat(x)
  return isNaN(v) ? 0 : v
}

export const MILS_A_UM = 25.4
export const milsAMicras = mils => Math.round(nd(mils) * MILS_A_UM)

// Producto del catálogo por nombre (sin distinguir mayúsculas/espacios)
export function buscarProducto(productos, nombre) {
  const k = String(nombre || '').trim().toLowerCase()
  if (!k) return null
  return (productos || []).find(p => String(p.n || '').trim().toLowerCase() === k) || null
}

// Una capa: { producto, s (sólidos en volumen %), color, dft (µm), dmin, dmax (µm, ficha técnica) }
// m2 = superficie total para el consumo teórico (0 = no calcular consumo).
//  - EPH (espesor húmedo de control) = DFT ÷ sólidos, redondeado a la decena.
//  - Rendimiento teórico (m²/L) = sólidos × 10 ÷ DFT (sin pérdidas de aplicación).
export function calcCapa(capa, m2) {
  const s = nd(capa && capa.s), dft = nd(capa && capa.dft)
  const ok = s > 0 && dft > 0
  const rendL = ok ? (s * 10) / dft : 0
  const eph = ok ? Math.round((dft / (s / 100)) / 10) * 10 : 0
  const dmin = nd(capa && capa.dmin), dmax = nd(capa && capa.dmax)
  let rango = null // null = sin datos de ficha
  if (dft > 0 && (dmin > 0 || dmax > 0)) rango = (!dmin || dft >= dmin) && (!dmax || dft <= dmax)
  const litros = rendL > 0 && m2 > 0 ? m2 / rendL : 0
  return { dft, eph, rendL, rendGal: rendL * LITROS_POR_GALON, litros, galones: litros / LITROS_POR_GALON, rango, dmin, dmax }
}

export const dftTotal = capas => (capas || []).reduce((a, c) => a + nd(c.dft), 0)

// Cubicación: filas { elemento, dato, criterio, m2, color }. Subtotal = m² × precio unitario.
export function calcCubicacion(filas, precioUnitario) {
  const pu = nd(precioUnitario)
  const rows = (filas || []).map(f => ({ ...f, m2: nd(f.m2), subtotal: Math.round(nd(f.m2) * pu) }))
  return { rows, m2: rows.reduce((a, r) => a + r.m2, 0), neto: rows.reduce((a, r) => a + r.subtotal, 0) }
}

export const fmtDec = (n, d = 1) => (Number(n) || 0).toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })
