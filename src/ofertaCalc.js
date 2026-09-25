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

// ---- Apoyo a la lectura con IA (la IA transcribe; el cálculo lo hace esto) ----
// Criterios de superficie que elige la PERSONA por fila. La IA nunca
// calcula m² a pintar.
export const CRITERIOS_M2 = [
  { id: '1cara', label: '1 cara (×1)', f: 1, texto: '1 cara' },
  { id: '2caras', label: '2 caras (×2)', f: 2, texto: '2 caras' },
  { id: 'perfil', label: 'Perfil 0,40 m²/ml', f: 0.4, texto: '0,40 m²/ml' },
  { id: 'tubo', label: 'Tubular Ø2" 0,19 m²/ml', f: 0.19, texto: '0,19 m²/ml' },
  { id: 'informado', label: 'Usar m² informado', f: null, texto: 'm² informado' },
  { id: 'manual', label: 'Factor manual', f: null, texto: 'factor manual' },
]
export function criterioPorDefecto(fila) {
  // Una superficie informada en m² casi siempre es UNA cara: se propone
  // "1 cara" para que la persona decida si son 2. 'informado' solo cuando
  // el documento trae un m² distinto de la cantidad (columna propia).
  if (fila && fila.unidad === 'm2') return (fila.m2Informado != null && fila.cantidad != null && Math.abs(fila.m2Informado - fila.cantidad) > 0.005) ? 'informado' : '1cara'
  if (fila && fila.m2Informado != null) return 'informado'
  if (fila && fila.unidad === 'ml') return 'perfil'
  return 'manual'
}
// m² sugeridos de una fila leída: cantidad × factor (o el m² informado).
export function m2DeFila(fila, criterioId, factorManual) {
  if (criterioId === 'informado') return nd(fila && fila.m2Informado)
  const cr = CRITERIOS_M2.find(c => c.id === criterioId)
  const f = cr && cr.f != null ? cr.f : nd(factorManual)
  return Math.round(nd(fila && fila.cantidad) * f * 100) / 100
}
// Cifras del texto redactado que NO están en los datos de la cotización
// (para avisar antes de aplicar). Se ignoran enteros de 1-2 dígitos.
export function cifrasNoRespaldadas(texto, datos) {
  const val = t => { const l = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : (/^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t); return parseFloat(l) }
  const tokens = s => (String(s || '').match(/\d[\d.,]*\d|\d/g) || [])
  const permitidos = tokens(JSON.stringify(datos)).map(val).filter(n => !isNaN(n))
  const malas = []
  tokens(texto).forEach(t => {
    const n = val(t)
    if (isNaN(n) || (Number.isInteger(n) && n < 100)) return
    if (!permitidos.some(p => Math.abs(p - n) < 0.006)) malas.push(t)
  })
  return [...new Set(malas)]
}
