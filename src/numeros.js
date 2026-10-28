// ============================================================
// Lectura de números escritos a mano (auditoría 2026-10-27, hallazgo D-6)
// ============================================================
// Había 18 copias de `num()` repartidas por los módulos, casi todas con
// `parseInt(String(s).replace(/\D/g, ''))`: borraban el signo y los decimales.
// Comprobado: precio «1500.5» → 15.005; «1.234,56» → 123.456; «-100» → 100;
// cantidad de OC «1,5» → 15.000. Esta versión entiende cómo se escribe en Chile:
//   «1.234.567»  → 1234567   (puntos de miles)
//   «1.234,56»   → 1234.56   (coma decimal, puntos de miles)
//   «1500.5»     → 1500.5    (un punto que no es de miles = decimal)
//   «1,5»        → 1.5
//   «-100»       → -100      (solo si el texto EMPIEZA con el signo)
//   «OT-2026-114» → 2026114  (igual que antes: las letras se ignoran)
//   «$ 2.500»    → 2500
export function num(s) {
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0
  const texto = String(s == null ? '' : s).trim()
  if (!texto) return 0
  const negativo = texto.startsWith('-')
  let x = texto.replace(/[^\d.,]/g, '')
  if (!x) return 0
  if (x.includes(',')) x = x.replace(/\./g, '').replace(/,/g, '.')          // coma decimal
  else if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, '')          // solo puntos de miles
  else if ((x.match(/\./g) || []).length > 1) x = x.replace(/\./g, '')      // «1.234.5»: raro, se toma como miles
  const v = parseFloat(x)
  if (isNaN(v)) return 0
  return negativo ? -v : v
}

// Cantidades, precios y montos que nunca pueden ser negativos.
export const numPos = s => Math.max(0, num(s))

// Pesos enteros (redondea a la unidad).
export const entero = s => Math.round(num(s))
