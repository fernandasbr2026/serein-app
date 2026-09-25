// Ejecutar: node src/ofertaCalc.test.mjs
import assert from 'node:assert/strict'
import { calcCapa, dftTotal, calcCubicacion, milsAMicras } from './ofertaCalc.js'

// Cotización N° 918 Rev.1 (Jotun): valores del PDF emitido
const M2 = 502.3
const c1 = calcCapa({ producto: 'Jotamastic 80', s: 80, dft: 135, dmin: 75, dmax: 200 }, M2)
const c2 = calcCapa({ producto: 'Jotamastic 80 Aluminio', s: 80, dft: 150, dmin: 75, dmax: 200 }, M2)
const c3 = calcCapa({ producto: 'Hardtop Flexi', s: 64, dft: 75, dmin: 50, dmax: 150 }, M2)

assert.equal(c1.eph, 170); assert.equal(c2.eph, 190); assert.equal(c3.eph, 120)
assert.equal(c1.rendL.toFixed(1), '5.9'); assert.equal(c2.rendL.toFixed(1), '5.3'); assert.equal(c3.rendL.toFixed(1), '8.5')
assert.equal(c1.rendGal.toFixed(1), '22.4'); assert.equal(c2.rendGal.toFixed(1), '20.2'); assert.equal(c3.rendGal.toFixed(1), '32.3')
assert.equal(c1.litros.toFixed(1), '84.8'); assert.equal(c2.litros.toFixed(1), '94.2'); assert.equal(c3.litros.toFixed(1), '58.9')
assert.equal(c1.galones.toFixed(1), '22.4'); assert.equal(c2.galones.toFixed(1), '24.9'); assert.equal(c3.galones.toFixed(1), '15.6')
assert.equal(dftTotal([{ dft: 135 }, { dft: 150 }, { dft: 75 }]), 360)
assert.equal(c1.rango, true)
assert.equal(calcCapa({ s: 80, dft: 250, dmin: 75, dmax: 200 }, 0).rango, false)
assert.equal(calcCapa({ s: 80, dft: 100 }, 0).rango, null)
assert.equal(milsAMicras(5.3), 135)

const cub = calcCubicacion([{ m2: '22,5' }, { m2: '136' }, { m2: '35,28' }, { m2: '8,52' }, { m2: '300' }], 34467)
assert.equal(cub.m2.toFixed(2), '502.30')
console.log('ofertaCalc OK — coincide con la N° 918 (EPH, rendimiento, consumo, DFT total, m²)')

// ---- Lectura con IA: criterios y verificación de cifras ----
import { m2DeFila, criterioPorDefecto, cifrasNoRespaldadas } from './ofertaCalc.js'
assert.equal(m2DeFila({ cantidad: 11.25, unidad: 'm2' }, '2caras'), 22.5)
assert.equal(m2DeFila({ cantidad: 750, unidad: 'ml' }, 'perfil'), 300)
assert.equal(m2DeFila({ cantidad: 45, unidad: 'ml' }, 'tubo'), 8.55)
assert.equal(m2DeFila({ m2Informado: 12.5 }, 'informado'), 12.5)
assert.equal(m2DeFila({ cantidad: 10 }, 'manual', '1,5'), 15)
assert.equal(criterioPorDefecto({ unidad: 'ml' }), 'perfil')
assert.equal(criterioPorDefecto({ m2Informado: 3 }), 'informado')
assert.equal(criterioPorDefecto({ unidad: 'm2', cantidad: 11.25, m2Informado: 11.25 }), '1cara')
assert.equal(criterioPorDefecto({ unidad: 'm2', cantidad: 11.25, m2Informado: 22.5 }), 'informado')
const datos = { m2Total: 502.3, dftTotalUm: 360, capas: [{ dft: 135 }] }
assert.deepEqual(cifrasNoRespaldadas('Cubicamos 502,30 m² con 360 µm en 3 manos.', datos), [])
assert.deepEqual(cifrasNoRespaldadas('Garantía de 24 meses y 1.500 m² adicionales, 360 µm.', datos), ['1.500'])
console.log('lectura IA: criterios y verificación de cifras OK')
