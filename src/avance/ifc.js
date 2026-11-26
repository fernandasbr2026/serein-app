// Módulo Avance de Obra · lector IFC (fase 6).
// Convierte un archivo IFC (Tekla, Revit, etc.) en piezas listas para Three.js
// usando web-ifc (WebAssembly; el .wasm se sirve desde /avance/). Cada pieza
// sale con su nombre, clase IFC, triángulos ya transformados a metros (Y hacia
// arriba, como lo entrega web-ifc) y su posición relativa 0..1 a lo largo del
// eje horizontal más largo de la obra, que es lo que usa el modelo para decidir
// qué proceso «alcanzó» la pieza (mismo criterio que el modelo generado).
let apiPromesa = null
async function api() {
  if (!apiPromesa) {
    apiPromesa = (async () => {
      const WebIFC = await import('web-ifc')
      const a = new WebIFC.IfcAPI()
      a.SetWasmPath('/avance/', true)
      await a.Init()
      return { a, WebIFC }
    })()
  }
  return apiPromesa
}

// Clase IFC → tipo del modelo (decide la cadena de procesos que colorea la pieza).
export function tipoDesdeClase(clase) {
  const c = String(clase || '').toLowerCase()
  if (c.includes('footing') || c.includes('pile')) return 'pedestal'
  if (c.includes('column')) return 'pilar'
  if (c.includes('beam') || c.includes('member')) return 'viga'
  if (c.includes('plate')) return 'placa'
  if (c.includes('slab') || c.includes('wall') || c.includes('roof') || c.includes('covering')) return 'cubierta'
  return 'pieza'
}

// Devuelve { piezas: [{ id, nombre, clase, tipo, posiciones: Float32Array, normales, indices, frac }], caja: { min, max }, eje: 'x'|'z' }
export async function leerIFC(buffer, onProgreso) {
  const { a } = await api()
  const modelo = a.OpenModel(new Uint8Array(buffer), { COORDINATE_TO_ORIGIN: true })
  const piezas = []
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  let n = 0
  try {
    a.StreamAllMeshes(modelo, (mesh) => {
      const linea = a.GetLine(modelo, mesh.expressID)
      const clase = a.GetNameFromTypeCode(linea.type)
      const nombre = (linea.Name && linea.Name.value) || (linea.Tag && linea.Tag.value) || clase + ' ' + mesh.expressID
      const partes = []
      let nv = 0, ni = 0
      for (let i = 0; i < mesh.geometries.size(); i++) {
        const g = mesh.geometries.get(i)
        const geo = a.GetGeometry(modelo, g.geometryExpressID)
        const v = a.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize())
        const idx = a.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize())
        partes.push({ v: new Float32Array(v), idx: new Uint32Array(idx), t: Array.from(g.flatTransformation) })
        nv += v.length / 6; ni += idx.length
        geo.delete()
      }
      const posiciones = new Float32Array(nv * 3), normales = new Float32Array(nv * 3), indices = new Uint32Array(ni)
      let pv = 0, pi = 0, base = 0
      const pmin = [Infinity, Infinity, Infinity], pmax = [-Infinity, -Infinity, -Infinity]
      for (const { v, idx, t } of partes) {
        for (let k = 0; k < v.length; k += 6) {
          const x = v[k], y = v[k + 1], z = v[k + 2], nx = v[k + 3], ny = v[k + 4], nz = v[k + 5]
          const X = t[0] * x + t[4] * y + t[8] * z + t[12], Y = t[1] * x + t[5] * y + t[9] * z + t[13], Z = t[2] * x + t[6] * y + t[10] * z + t[14]
          posiciones[pv] = X; posiciones[pv + 1] = Y; posiciones[pv + 2] = Z
          normales[pv] = t[0] * nx + t[4] * ny + t[8] * nz; normales[pv + 1] = t[1] * nx + t[5] * ny + t[9] * nz; normales[pv + 2] = t[2] * nx + t[6] * ny + t[10] * nz
          pv += 3
          if (X < pmin[0]) pmin[0] = X; if (Y < pmin[1]) pmin[1] = Y; if (Z < pmin[2]) pmin[2] = Z
          if (X > pmax[0]) pmax[0] = X; if (Y > pmax[1]) pmax[1] = Y; if (Z > pmax[2]) pmax[2] = Z
        }
        for (let k = 0; k < idx.length; k++) indices[pi++] = idx[k] + base
        base += v.length / 6
      }
      for (let d = 0; d < 3; d++) { if (pmin[d] < min[d]) min[d] = pmin[d]; if (pmax[d] > max[d]) max[d] = pmax[d] }
      piezas.push({ id: mesh.expressID, nombre: String(nombre), clase, tipo: tipoDesdeClase(clase), posiciones, normales, indices, centro: [(pmin[0] + pmax[0]) / 2, (pmin[1] + pmax[1]) / 2, (pmin[2] + pmax[2]) / 2] })
      n++
      if (onProgreso && n % 50 === 0) onProgreso(n)
    })
  } finally {
    a.CloseModel(modelo)
  }
  // Eje horizontal más largo (X o Z, porque Y es la altura): el frente de trabajo avanza a lo largo de él.
  const largoX = max[0] - min[0], largoZ = max[2] - min[2]
  const eje = largoX >= largoZ ? 0 : 2
  const largo = Math.max(1e-6, eje === 0 ? largoX : largoZ)
  for (const p of piezas) p.frac = Math.min(1, Math.max(0, (p.centro[eje] - min[eje]) / largo))
  return { piezas, caja: { min, max }, eje: eje === 0 ? 'x' : 'z' }
}
