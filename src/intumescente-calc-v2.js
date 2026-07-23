// Motor de cálculo del especificador intumescente v2 (comparador de
// productos por costo). Reglas tal como las fija la sección 2 del
// documento de instrucción — funciones puras, sin dependencias de React,
// para poder testearlas directo con Node.
import { GAL_L } from './intumescente-tablas-v2.js'

// Espesor certificado para una masividad dada: se busca la fila de
// masividad IGUAL O SUPERIOR a la ingresada (criterio conservador). Si la
// masividad ingresada supera la última fila de la tabla, la combinación
// queda "fuera de tabla certificada" — PROHIBIDO extrapolar (regla 2.3).
export function lookupEspesor(tabla, masividad) {
  if (!tabla) return { um: null, motivo: 'no_cert' }
  const ms = Object.keys(tabla).map(Number).sort((a, b) => a - b)
  if (!ms.length) return { um: null, motivo: 'no_cert' }
  if (masividad > ms[ms.length - 1]) return { um: null, motivo: 'fuera' }
  const fila = ms.find(x => x >= masividad) ?? ms[ms.length - 1]
  return { um: tabla[fila], fila }
}

// $/L de un producto: precio de envase / litros de envase, convertido a
// CLP con el tipo de cambio si el producto está en USD (regla 2.6).
export function precioLitro(producto, tc) {
  const precioClp = producto.moneda === 'USD' ? producto.precioEnvase * tc : producto.precioEnvase
  return precioClp / producto.litrosEnvase
}

// Evalúa UN producto para una línea (tipo/masividad/RF/m²) dada. Devuelve
// null en `um` si el producto no tiene tabla certificada para esa
// combinación o la masividad excede lo certificado.
export function evaluarProducto(producto, tabla, { masividad, m2, merma = 0, tc = 1 }) {
  const { um, motivo } = lookupEspesor(tabla, masividad)
  if (!um) return { producto, um: null, motivo }
  // l/m² = µm / (sólidos_vol% × 10), afectado por la merma (regla 2.5).
  const lPorM2 = (um / (producto.sv * 10)) * (1 + merma / 100)
  const pl = precioLitro(producto, tc)
  const litros = lPorM2 * (Number(m2) || 0)
  // capas/kg alimentan el Paso 2 (aplicador por m²×capas o por kg —
  // sección 5 del documento); capaMaxUm/densidad son valores editables del
  // catálogo, ver nota en intumescente-tablas-v2.js.
  const capas = Math.max(1, Math.ceil(um / (Number(producto.capaMaxUm) || um)))
  const kg = litros * (Number(producto.densidad) || 0)
  return {
    producto, um, lPorM2, costoM2: lPorM2 * pl, litros,
    galones: litros / GAL_L, envases: Math.ceil(litros / producto.litrosEnvase || 0),
    costo: litros * pl, capas, kg,
  }
}

// Evalúa una línea completa contra TODOS los productos del catálogo y
// determina el recomendado (menor $/m² entre los certificados — regla 2.7).
// Si `linea.elegido` no es 'auto', se respeta la elección manual del
// usuario (si esa combinación es válida; si no, cae al recomendado).
export function evaluarLinea(linea, productos, tablas, { merma = 0, tc = 1 } = {}) {
  const ops = productos.map(p => evaluarProducto(p, tablas[p.id]?.[linea.tipo]?.[linea.f], { masividad: Number(linea.masividad) || 0, m2: linea.m2, merma, tc }))
  const validas = ops.filter(o => o.um)
  const mejor = validas.length ? validas.reduce((a, b) => (a.costoM2 <= b.costoM2 ? a : b)) : null
  const elegida = linea.elegido && linea.elegido !== 'auto' ? (validas.find(o => o.producto.id === linea.elegido) || mejor) : mejor
  return { ops, mejor, elegida }
}
