// ============================================================
// Semillas de ejemplo vs. producción (auditoría 2026-10-27, hallazgo F-1)
// ============================================================
// Varios módulos arrancan con datos de ejemplo (OT, OC, facturas, compras,
// avances, clientes) para que la app se vea «con vida» al desarrollar o al
// armar un instructivo. En producción esos datos ficticios son un riesgo:
// si la nube no responde al entrar, la pantalla muestra OT y OC inventadas, y
// cualquier sesión que arranque de cero parte de ahí. Por eso en el sitio
// publicado (build de producción de Vite) las listas de ejemplo arrancan
// VACÍAS y lo único que se ve es lo que trae la nube.
//
// Lo que NO se vacía: las semillas que son estructura o datos reales
// (parámetros, configuración de compras, nómina real, inventario cargado de la
// planilla, plantillas y gastos fijos de Finanzas, fichas de clientes).
export const EN_PRODUCCION = !!(import.meta.env && import.meta.env.PROD)

// Devuelve la semilla de ejemplo en desarrollo y el valor vacío en producción.
export const semilla = (ejemplo, vacio) => (EN_PRODUCCION ? vacio : ejemplo)

// Versión «vacía» de una semilla conservando su forma: un arreglo queda [];
// un objeto conserva sus claves escalares (versiones, saldos, flags) y vacía
// las listas que contiene.
export function vaciar(v) {
  if (Array.isArray(v)) return []
  if (v && typeof v === 'object') {
    const out = {}
    Object.keys(v).forEach(k => { out[k] = Array.isArray(v[k]) ? [] : v[k] })
    return out
  }
  return v
}
