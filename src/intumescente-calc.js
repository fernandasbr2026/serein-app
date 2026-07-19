// ============================================================
// Cotización Intumescente — motor de cálculo (puro, sin UI ni red)
// ------------------------------------------------------------
// Portado tal cual desde cotizador-pintura-intumescente.jsx
// (espesorPorMasividad, calcItem y el useMemo de totales), para
// que el componente y cualquier validación de servidor usen
// exactamente la misma lógica. No modificar los números aquí sin
// actualizar también las 4 pruebas de src/intumescente-calc.test.mjs.
// ============================================================

export const F_LEVELS = ['F15', 'F30', 'F60', 'F90', 'F120']
export const F_LABEL = { F15: 'F-15', F30: 'F-30', F60: 'F-60', F90: 'F-90', F120: 'F-120' }

// Convierte las filas de int_espesores (una fila por banda) de un
// producto en la tabla [{ max, esp:{F15,F30,F60,F90,F120} }, ...]
// que usan espesorPorMasividad/calcItem, para una seccion_tipo dada.
export function filasDbATabla(filasEspesores, seccionTipo) {
  return filasEspesores
    .filter(f => f.seccion_tipo === seccionTipo)
    .map(f => ({
      max: f.masividad_max === null || f.masividad_max === undefined ? null : Number(f.masividad_max),
      esp: { F15: f.f15_um, F30: f.f30_um, F60: f.f60_um, F90: f.f90_um, F120: f.f120_um },
    }))
}

// Arma el objeto "producto" con la forma que usa calcItem, a partir
// de una fila de int_productos + sus filas de int_espesores.
export function productoDesdeDb(producto, filasEspesores) {
  return {
    id: producto.id,
    slug: producto.slug,
    marca: producto.marca,
    nombre: producto.nombre,
    solidos: Number(producto.solidos_pct),
    densidad: Number(producto.densidad),
    precioKg: Number(producto.precio_kg),
    kgEnvase: producto.kg_envase === null ? null : Number(producto.kg_envase),
    capaMaxUm: Number(producto.capa_max_um),
    certificada: !!producto.certificada,
    fuente: producto.fuente || null,
    tablas: {
      abierto: filasDbATabla(filasEspesores, 'abierto'),
      cerrado: filasDbATabla(filasEspesores, 'cerrado'),
    },
  }
}

// Arma el objeto "globals" que usa calcItem/calc a partir de las
// filas clave/valor de int_parametros.
export function globalsDesdeParametros(filasParametros, overrides = {}) {
  const v = Object.fromEntries((filasParametros || []).map(p => [p.clave, Number(p.valor)]))
  return {
    mermaViga: v.merma_viga ?? 1.1,
    mermaPilar: v.merma_pilar ?? 1.45,
    prepM2: v.prep_m2 ?? 1200,
    imprimanteM2: v.imprimante_m2 ?? 1800,
    topcoatM2: v.topcoat_m2 ?? 2500,
    aplicacionPropiaM2Capa: v.aplicacion_propia_m2_capa ?? 0,
    ggPct: v.gg_pct ?? 12,
    utilPct: v.util_pct ?? 25,
    conIVA: true,
    moneda: 'CLP',
    valorUF: v.valor_uf ?? 39000,
    ...overrides,
  }
}

export function espesorPorMasividad(tabla, masividad, f) {
  if (!tabla?.length || !masividad) return 0
  const filas = [...tabla].sort((a, b) => (a.max ?? Infinity) - (b.max ?? Infinity))
  const fila = filas.find(r => masividad <= (r.max ?? Infinity)) || filas[filas.length - 1]
  return Number(fila.esp[f]) || 0
}

export function calcItem(item, product, g) {
  if (!product) return null
  const m2 = item.modo === 'm2'
    ? Number(item.m2) || 0
    : (Number(item.perimetro) || 0) * (Number(item.largo) || 0) * (Number(item.cantidad) || 0)
  const masividad = item.masividadAuto && item.modo === 'perfil'
    ? (Number(item.seccion) > 0 ? (Number(item.perimetro) || 0) / (Number(item.seccion) / 10000) : 0)
    : Number(item.masividad) || 0
  const tabla = product.tablas?.[item.seccionTipo] || []
  const um = espesorPorMasividad(tabla, masividad, item.f)
  const disponible = um > 0 && masividad > 0
  const lPorM2 = disponible ? um / ((Number(product.solidos) || 1) * 10) : 0
  const merma = item.tipo === 'pilar' ? g.mermaPilar : g.mermaViga
  const kg = lPorM2 * (Number(product.densidad) || 0) * m2 * merma
  const capas = disponible ? Math.max(1, Math.ceil(um / (Number(product.capaMaxUm) || um))) : 0
  const costoPintura = kg * (Number(product.precioKg) || 0)
  const costoPrep = m2 * g.prepM2
  const costoImprimante = m2 * g.imprimanteM2
  const costoTopcoat = item.topcoat ? m2 * g.topcoatM2 : 0
  const costoAplicacionPropia = m2 * g.aplicacionPropiaM2Capa * capas
  const total = costoPintura + costoPrep + costoImprimante + costoTopcoat + costoAplicacionPropia
  return { m2, masividad, um, kg, capas, merma, costoPintura, costoPrep, costoImprimante, costoTopcoat, costoAplicacionPropia, total, disponible }
}

// Equivalente al useMemo `calc` del prototipo: totales de la
// cotización completa a partir de items + catálogo + parámetros.
export function calcularCotizacion(items, byId, globals, aplicador, otros) {
  const rows = items.map(it => ({ it, r: calcItem(it, byId[it.productId], globals) }))
  const m2Total = rows.reduce((s, x) => s + (x.r?.m2 || 0), 0)
  const m2Capas = rows.reduce((s, x) => s + (x.r ? x.r.m2 * x.r.capas : 0), 0)
  const kgTotal = rows.reduce((s, x) => s + (x.r?.kg || 0), 0)
  const pinturaTotal = rows.reduce((s, x) => s + (x.r?.costoPintura || 0), 0)
  const directoPartidas = rows.reduce((s, x) => s + (x.r?.total || 0), 0)

  let aplicadorBase = 0
  if (aplicador.modo === 'obra') aplicadorBase = Number(aplicador.montoObra) || 0
  if (aplicador.modo === 'm2') aplicadorBase = (Number(aplicador.valorM2) || 0) * (aplicador.porCapas ? m2Capas : m2Total)
  if (aplicador.modo === 'kg') aplicadorBase = (Number(aplicador.valorKg) || 0) * kgTotal
  if (aplicador.modo === 'dia') aplicadorBase = (Number(aplicador.valorDia) || 0) * (Number(aplicador.dias) || 0)
  const aplicadorRecargo = aplicadorBase * ((Number(aplicador.recargoPct) || 0) / 100)
  const aplicadorTotal = aplicadorBase + aplicadorRecargo

  const retoques = pinturaTotal * ((Number(otros.retoquesPct) || 0) / 100)
  const certificacion = otros.incCertificacion ? Number(otros.certificacion) || 0 : 0
  const otrosTotal = retoques + certificacion + (Number(otros.equipos) || 0) + (Number(otros.movilizacion) || 0)

  const directo = directoPartidas + aplicadorTotal + otrosTotal
  const gg = directo * (globals.ggPct / 100)
  const util = (directo + gg) * (globals.utilPct / 100)
  const neto = directo + gg + util
  const iva = globals.conIVA ? neto * 0.19 : 0

  const kgPorProducto = {}
  rows.forEach(({ it, r }) => {
    if (!r || !r.disponible) return
    kgPorProducto[it.productId] = (kgPorProducto[it.productId] || 0) + r.kg
  })

  return { rows, m2Total, m2Capas, kgTotal, directoPartidas, aplicadorBase, aplicadorRecargo, aplicadorTotal, retoques, certificacion, otrosTotal, directo, gg, util, neto, iva, total: neto + iva, kgPorProducto }
}
