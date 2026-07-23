// Lista de facturas del Libro de Ventas que el usuario eliminó explícitamente
// desde Facturas por área. LibroVentasModule.jsx sincroniza automáticamente
// hacia Facturas cualquier venta con área asignada — sin esta lista, borrar
// una factura duplicada/errónea en Facturas no servía de nada: la próxima
// vez que alguien abría Libro de Ventas, la sincronización la volvía a crear
// porque el registro de origen seguía existiendo ahí. Se guarda con el
// prefijo serein_ para que sync.js la suba/baje igual que el resto del
// estado — no necesita cablearse en Dashboard.jsx porque no se renderiza
// directamente, solo se consulta antes de escribir.
const OCULTAS_KEY = 'serein_facturasOcultasLibro'

export function leerFacturasOcultasLibro() {
  try { return new Set(JSON.parse(localStorage.getItem(OCULTAS_KEY) || '[]')) } catch (e) { return new Set() }
}

export function ocultarFacturasDeLibro(libroIds, pushState) {
  if (!libroIds || !libroIds.length) return
  const s = leerFacturasOcultasLibro()
  libroIds.forEach(id => s.add(id))
  try { localStorage.setItem(OCULTAS_KEY, JSON.stringify([...s])) } catch (e) {}
  pushState()
}
