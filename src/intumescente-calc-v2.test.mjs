// Tests del motor de cálculo v2 contra los 11 criterios de aceptación de la
// sección 7 del documento de instrucción (valores verificados contra los
// certificados). Correr con: node src/intumescente-calc-v2.test.mjs
import assert from 'node:assert/strict'
import { lookupEspesor, precioLitro, evaluarProducto, evaluarLinea } from './intumescente-calc-v2.js'
import { buildTablas, PRODUCTOS_SEED } from './intumescente-tablas-v2.js'
import { tablaSG864ParaTc, TC_MINIMA_F120 } from './intumescente-tc-avanzada.js'
import PPG_TC from './ppg-sg864-tc-completas.json' with { type: 'json' }

const tablas = buildTablas()
const productos = PRODUCTOS_SEED
const porId = id => productos.find(p => p.id === id)
let n = 0
function test(nombre, fn) { fn(); n++; console.log('✓', nombre) }

// 1. SG864, columna, m=218, F60, Tc500 → 1.169 µm (usa fila 220, no la 200).
test('1. SG864 col4 m=218 F60 -> 1169 µm (fila 220)', () => {
  const { um, fila } = lookupEspesor(tablas.sg864.col4.F60, 218)
  assert.equal(um, 1169)
  assert.equal(fila, 220)
})

// 2. SG864, viga 4 caras, m=200, F60, Tc500 → 1.019 µm.
test('2. SG864 viga4 m=200 F60 -> 1019 µm', () => {
  const { um } = lookupEspesor(tablas.sg864.viga4.F60, 200)
  assert.equal(um, 1019)
})

// 3. SG864, viga 3 caras, m=150, F30, Tc500 → 278 µm.
test('3. SG864 viga3 m=150 F30 -> 278 µm', () => {
  const { um } = lookupEspesor(tablas.sg864.viga3.F30, 150)
  assert.equal(um, 278)
})

// 4. Stofire, columna, m=218, F60 → 1.500 µm.
test('4. Stofire col4 m=218 F60 -> 1500 µm', () => {
  const { um } = lookupEspesor(tablas.stofire.col4.F60, 218)
  assert.equal(um, 1500)
})

// 5. C-Therm IC 600 WB, viga 3 caras, m=150, F60 → 463 µm.
test('5. C-Therm IC 600 WB viga3 m=150 F60 -> 463 µm', () => {
  const { um } = lookupEspesor(tablas.ct600.viga3.F60, 150)
  assert.equal(um, 463)
})

// 6. Rendimiento: 1.169 µm con 75% sólidos y merma 0 -> 1,559 l/m².
test('6. Rendimiento 1169µm @ 75% sv, merma 0 -> 1.559 l/m²', () => {
  const r = evaluarProducto(porId('sg864'), tablas.sg864.col4.F60, { masividad: 218, m2: 1, merma: 0, tc: 1 })
  assert.equal(Math.round(r.lPorM2 * 1000) / 1000, 1.559)
})

// 7. $/L: Stofire = 95.000/18.93 ≈ $5.019/L; SG864 con TC 935 ≈ $21.038/L.
//    (El documento usa "≈"; 95000/18,93 redondea matemáticamente a 5018,
//    dentro del margen de aproximación indicado — se valida con tolerancia ±2.)
test('7. $/L Stofire ≈ 5019, SG864@TC935 ≈ 21038 (±2)', () => {
  assert.ok(Math.abs(precioLitro(porId('stofire'), 1) - 5019) <= 2)
  assert.ok(Math.abs(precioLitro(porId('sg864'), 935) - 21038) <= 2)
})

// 8. Recomendado: columna m=218 F60, precios seed, TC 935.
//    NOTA IMPORTANTE: el documento de instrucción dice "-> Stofire ($/m² ≈
//    11.500 vs ≈ 32.800 de SG864)", pero la fuente de verdad real
//    (especificador-intumescente.html, la MISMA línea precargada por
//    defecto: Pilares eje A, col4, m=218, F60) calcula ★ RECOMENDADO =
//    C-Therm W900 (~$7.855/m²) — más barato que Stofire (~$11.493/m²) y
//    que SG864 (~$32.790/m²), porque C-Therm W900 certifica un espesor
//    (513 µm) mucho menor que Stofire (1500 µm) para esta combinación.
//    Verificado abriendo el .html original en el navegador. Se sigue el
//    HTML (designado "fuente de verdad de lógica y diseño" en la sección 0
//    del documento) por sobre el texto del test — Stofire y SG864 SÍ dan
//    los montos ~11.500/~32.800 que cita el documento, solo que no son los
//    más baratos del catálogo completo. Reportado al usuario para que lo
//    confirme.
test('8. Recomendado col4 m=218 F60 TC935 -> C-Therm W900 (~7.855) — verificado contra el HTML original, difiere del texto del doc', () => {
  const linea = { tipo: 'col4', masividad: 218, f: 'F60', m2: 1, elegido: 'auto' }
  const { ops, mejor } = evaluarLinea(linea, productos, tablas, { merma: 0, tc: 935 })
  const stofire = ops.find(o => o.producto.id === 'stofire')
  const sg864 = ops.find(o => o.producto.id === 'sg864')
  const ctw900 = ops.find(o => o.producto.id === 'ctw900')
  assert.equal(Math.round(stofire.costoM2 / 100) * 100, 11500)
  assert.equal(Math.round(sg864.costoM2 / 100) * 100, 32800)
  assert.ok(Math.abs(ctw900.costoM2 - 7855) <= 2)
  assert.equal(mejor.producto.id, 'ctw900')
})

// 9. Masividad 210 con filas disponibles {200, 220} -> usa 220 (nunca 200).
test('9. masividad 210 entre filas {200,220} -> usa 220', () => {
  const { um, fila } = lookupEspesor({ 200: 100, 220: 120 }, 210)
  assert.equal(fila, 220)
  assert.equal(um, 120)
})

// 10. Masividad mayor que la última fila -> "fuera de tabla", no extrapola.
test('10. masividad fuera de rango -> motivo "fuera", sin extrapolar', () => {
  const { um, motivo } = lookupEspesor({ 200: 100, 220: 120 }, 500)
  assert.equal(um, null)
  assert.equal(motivo, 'fuera')
})

// 11a. F15 solo disponible con Stofire — el resto de los productos no
//      certifican F15 para ninguna combinación (no_cert).
test('11a. F15 solo Stofire (resto no certificado)', () => {
  const { um: umStofire } = lookupEspesor(tablas.stofire.col4.F15, 60)
  assert.equal(umStofire, 400)
  for (const p of productos) {
    if (p.id === 'stofire') continue
    for (const tipo of ['col4', 'viga3', 'viga4', 'tubest']) {
      assert.equal(tablas[p.id]?.[tipo]?.F15, undefined, `${p.id}/${tipo} no debería tener tabla F15`)
    }
  }
})

// 11b. F120 viga3 SG864 usa Tc 620 (límite del certificado) y F120 viga4
//      usa Tc 525 — confirmado con ppg-sg864-tablas-completas.json: para
//      "F120|viga3" el certificado NO tiene datos por debajo de 620°C
//      (temps empieza en 620), y para "F120|viga4" no hay datos por debajo
//      de 525°C. El valor que trae la tabla base del especificador
//      (Tc "500" nominal) para esas dos combinaciones es, en realidad, el
//      valor a la Tc mínima certificada (620/525) — así queda registrado.
test('11b. F120 viga3 SG864 usa Tc 620 (mínima certificada); F120 viga4 usa Tc 525', () => {
  assert.equal(Math.min(...PPG_TC['F120|viga3'].temps), TC_MINIMA_F120.viga3)
  assert.equal(Math.min(...PPG_TC['F120|viga4'].temps), TC_MINIMA_F120.viga4)
  // La tabla base (Tc "500" nominal) para viga3/F120 coincide exactamente
  // con la tabla a Tc 620 real — confirma que ya está usando la mínima
  // certificada, tal como exige la sección 2.8.
  const base = tablas.sg864.viga3.F120
  const tc620 = tablaSG864ParaTc(620).viga3.F120
  for (const m of Object.keys(base)) assert.equal(base[m], tc620[m], `masividad ${m}`)
})

console.log(`\n${n}/11 criterios de la sección 7.1-7.11 verificados.`)
