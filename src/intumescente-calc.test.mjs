// Pruebas minimas requeridas por SPEC-modulo-cotizacion-intumescente.md
// seccion 3. Ejecutar con: node src/intumescente-calc.test.mjs
import { espesorPorMasividad, calcItem } from './intumescente-calc.js'

let fallos = 0
function assertClose(nombre, actual, esperado, tolerancia = 0.01) {
  const ok = Math.abs(actual - esperado) <= tolerancia
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${nombre}: esperado=${esperado} actual=${actual}`)
  if (!ok) fallos++
}

// (a) 250 um con 68% solidos -> 0.37 l/m2  (lPorM2 = um / (solidos% * 10))
{
  const um = 250, solidos = 68
  const lPorM2 = um / (solidos * 10)
  assertClose('(a) rendimiento 250um/68%', lPorM2, 0.3676, 0.01)
}

// (b) cajon 200x200x6 (per 0.8 m, sec 46.6 cm2) -> Hp/A ~ 172
{
  const perimetro = 0.8, seccion = 46.6
  const masividad = perimetro / (seccion / 10000)
  assertClose('(b) masividad cajon 200x200x6', masividad, 171.67, 0.5)
}

// (c) masividad 210 con bandas [200, 260] -> toma la banda 260, no la 200
{
  const tabla = [
    { max: 200, esp: { F60: 800 } },
    { max: 260, esp: { F60: 960 } },
  ]
  const um = espesorPorMasividad(tabla, 210, 'F60')
  assertClose('(c) banda conservadora (210 -> banda 260)', um, 960, 0)
}

// (d) 785 um con capa maxima 250 -> 4 capas
{
  const item = { modo: 'perfil', perimetro: 1, largo: 1, cantidad: 1, seccionTipo: 'abierto', f: 'F60', tipo: 'viga', masividadAuto: false, masividad: 100, topcoat: false }
  const product = {
    solidos: 65.5, densidad: 1.3, precioKg: 10800, capaMaxUm: 250,
    tablas: { abierto: [{ max: null, esp: { F60: 785 } }] },
  }
  const g = { mermaViga: 1.1, mermaPilar: 1.45, prepM2: 0, imprimanteM2: 0, topcoatM2: 0, aplicacionPropiaM2Capa: 0 }
  const r = calcItem(item, product, g)
  assertClose('(d) capas para 785um/capaMax250', r.capas, 4, 0)
}

if (fallos > 0) {
  console.error(`\n${fallos} prueba(s) fallaron`)
  process.exit(1)
} else {
  console.log('\nTodas las pruebas pasaron.')
}
