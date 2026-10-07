// Ejecutar: node src/vencimientos.test.mjs
import assert from 'node:assert/strict'
import {
  sumarDias, plazoDe, plazoValido, vencimientoPorPlazo, vencimientoAlCambiarEmision, conFechasCoherentes,
  diasParaVencer, textoDiasParaVencer, hoyISO, PLAZO_MAX,
} from './vencimientos.js'

// ---- Plazo → vencimiento (días corridos) ----
assert.equal(sumarDias('2026-10-07', 30), '2026-11-06')
assert.equal(sumarDias('2026-10-07', 40), '2026-11-16')
assert.equal(sumarDias('2026-10-07', 60), '2026-12-06')
assert.equal(sumarDias('2026-10-07', 0), '2026-10-07')            // contado
assert.equal(sumarDias('2026-01-31', 30), '2026-03-02')           // febrero de 28 días
assert.equal(sumarDias('2028-02-28', 1), '2028-02-29')            // bisiesto
assert.equal(sumarDias('2026-12-15', 60), '2027-02-13')           // cruza de año
assert.equal(sumarDias('2026-09-01', 30), '2026-10-01')           // cambio de hora de Chile: no corre el día
assert.equal(sumarDias('2026-04-01', 30), '2026-05-01')
assert.equal(sumarDias('2026-10-07T00:00:00', 30), '2026-11-06')  // acepta fecha con hora
assert.equal(sumarDias('2026-10-07', 1.5), '')
assert.equal(sumarDias('', 30), '')
assert.equal(sumarDias(null, 30), '')
assert.equal(sumarDias('2026-02-31', 5), '')                      // fecha que no existe
assert.equal(sumarDias('0002-10-07', 30), '')                     // año a medio escribir en el campo de fecha
assert.equal(sumarDias('basura', 30), '')

// ---- Lo que se escribe en el campo Plazo ----
assert.equal(plazoValido('40'), 40)
assert.equal(plazoValido(' 45 '), 45)
assert.equal(plazoValido(0), 0)
assert.equal(plazoValido('0'), 0)
assert.equal(plazoValido(''), null)
assert.equal(plazoValido(null), null)
assert.equal(plazoValido(undefined), null)
assert.equal(plazoValido('abc'), null)
assert.equal(plazoValido('-5'), null)
assert.equal(plazoValido('4.7'), 4)
assert.equal(plazoValido('4,7'), 4)
assert.equal(plazoValido('999'), PLAZO_MAX)
assert.equal(vencimientoPorPlazo('2026-10-07', '30'), '2026-11-06')
assert.equal(vencimientoPorPlazo('2026-10-07', ''), '')
assert.equal(vencimientoPorPlazo('', '30'), '')
assert.equal(vencimientoPorPlazo('2026-10-07', 'x'), '')

// ---- Vencimiento → plazo (se deduce, no se guarda) ----
assert.equal(plazoDe('2026-10-07', '2026-11-06'), 30)
assert.equal(plazoDe('2026-10-07', '2026-10-07'), 0)
assert.equal(plazoDe('2026-10-07', '2026-11-16'), 40)
assert.equal(plazoDe('2026-10-07', '2026-10-06'), null)           // vence antes de emitirse: dato malo
assert.equal(plazoDe('', '2026-11-06'), null)
assert.equal(plazoDe('2026-10-07', ''), null)
assert.equal(plazoDe('2026-10-07', null), null)
// ida y vuelta para todos los plazos habituales y en todos los meses de un año con bisiesto
for (let m = 1; m <= 12; m++) {
  for (const d of [1, 15, 28]) {
    const emision = '2028-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0')
    for (const p of [0, 15, 30, 40, 45, 60, 90, 120, 365]) assert.equal(plazoDe(emision, sumarDias(emision, p)), p)
  }
}

// ---- Corregir la emisión: el vencimiento acompaña con el mismo plazo ----
assert.equal(vencimientoAlCambiarEmision('2026-10-07', '2026-11-06', '2026-10-10'), '2026-11-09')
assert.equal(vencimientoAlCambiarEmision('2026-10-07', '2026-11-16', '2026-09-30'), '2026-11-09')
assert.equal(vencimientoAlCambiarEmision('2026-10-07', '', '2026-10-10'), '')                    // sin vencimiento: nada que mover
assert.equal(vencimientoAlCambiarEmision('', '2026-11-06', '2026-10-10'), '2026-11-06')         // sin emisión previa: no se puede deducir
assert.equal(vencimientoAlCambiarEmision('2026-10-07', '2026-11-06', ''), '2026-11-06')         // fecha nueva borrada
assert.equal(vencimientoAlCambiarEmision('2026-10-07', '2026-11-06', '0002-10-07'), '2026-11-06') // año a medio escribir
assert.equal(vencimientoAlCambiarEmision('0202-10-07', '2026-11-06', '2026-10-07'), '2026-11-06') // plazo deducido absurdo: no se toca
assert.equal(vencimientoAlCambiarEmision('2026-10-07', undefined, '2026-10-10'), '')

// Escribir el año de la emisión dígito por dígito (el campo de fecha emite cada paso): el vencimiento no se corrompe
{
  let emision = '2026-10-07', venc = '2026-11-06'
  for (const paso of ['0002-10-07', '0020-10-07', '0202-10-07', '2025-10-07']) {
    venc = vencimientoAlCambiarEmision(emision, venc, paso)
    emision = paso
  }
  assert.equal(venc, '2026-11-06')
}
// Mover el día de la emisión varias veces seguidas conserva el plazo de 30 días
{
  let emision = '2026-10-07', venc = '2026-11-06'
  for (const paso of ['2026-10-01', '2026-10-15', '2026-10-31']) {
    venc = vencimientoAlCambiarEmision(emision, venc, paso)
    emision = paso
  }
  assert.equal(plazoDe(emision, venc), 30)
  assert.equal(venc, '2026-11-30')
}

// ---- Formulario de alta: emisión, plazo y vencimiento se acompañan ----
{
  const base = { emission_date: '2026-10-07', plazo: '30', vencimiento: '2026-11-06', neto: '' }
  let f = conFechasCoherentes(base, 'plazo', '40')
  assert.equal(f.plazo, '40'); assert.equal(f.vencimiento, '2026-11-16')
  f = conFechasCoherentes(f, 'plazo', '60')
  assert.equal(f.vencimiento, '2026-12-06')
  f = conFechasCoherentes(f, 'plazo', '')                       // plazo vacío: sin vencimiento
  assert.equal(f.plazo, ''); assert.equal(f.vencimiento, '')
  f = conFechasCoherentes(f, 'vencimiento', '2026-11-20')      // fecha elegida a mano: el plazo se deduce
  assert.equal(f.plazo, '44'); assert.equal(f.vencimiento, '2026-11-20')
  f = conFechasCoherentes(f, 'emission_date', '2026-10-17')    // con plazo deducido, la emisión mueve el vencimiento
  assert.equal(f.vencimiento, '2026-11-30')
  f = conFechasCoherentes(f, 'plazo', '999')                   // tope de un año
  assert.equal(f.plazo, String(PLAZO_MAX))
  f = conFechasCoherentes(f, 'plazo', '4.7')
  assert.equal(f.plazo, '4'); assert.equal(f.vencimiento, '2026-10-21')
  f = conFechasCoherentes(f, 'plazo', 'abc')                   // no es un plazo: se ignora, queda el anterior
  assert.equal(f.plazo, '4'); assert.equal(f.vencimiento, '2026-10-21')
  // Emisión a medio escribir y luego completa: el plazo escrito se conserva y el vencimiento vuelve a calcularse
  f = conFechasCoherentes(base, 'emission_date', '')
  assert.equal(f.vencimiento, ''); assert.equal(f.plazo, '30')
  f = conFechasCoherentes(f, 'emission_date', '2026-12-01')
  assert.equal(f.vencimiento, '2026-12-31')
  // Sin plazo, cambiar la emisión no borra un vencimiento puesto a mano
  f = conFechasCoherentes({ emission_date: '2026-10-07', plazo: '', vencimiento: '2026-09-01' }, 'emission_date', '2026-10-08')
  assert.equal(f.vencimiento, '2026-09-01')
  // Otros nombres de campo (Facturas por área)
  const k = { emision: 'fecha_emision', plazo: 'plazo', vencimiento: 'vencimiento' }
  f = conFechasCoherentes({ fecha_emision: '2026-10-07', plazo: '30', vencimiento: '' }, 'plazo', '45', k)
  assert.equal(f.vencimiento, '2026-11-21')
  f = conFechasCoherentes(f, 'fecha_emision', '2026-11-01', k)
  assert.equal(f.vencimiento, '2026-12-16')
}

// ---- Días para vencer y su texto ----
assert.equal(diasParaVencer('2026-10-10', '2026-10-07'), 3)
assert.equal(diasParaVencer('2026-10-07', '2026-10-07'), 0)
assert.equal(diasParaVencer('2026-10-01', '2026-10-07'), -6)
assert.equal(diasParaVencer('', '2026-10-07'), null)
assert.equal(diasParaVencer('2026-02-31', '2026-10-07'), null)
assert.equal(textoDiasParaVencer(3), 'faltan 3 días')
assert.equal(textoDiasParaVencer(1), 'faltan 1 día')
assert.equal(textoDiasParaVencer(0), 'vence hoy')
assert.equal(textoDiasParaVencer(-1), 'atrasada 1 día')
assert.equal(textoDiasParaVencer(-6), 'atrasada 6 días')
assert.equal(textoDiasParaVencer(null), '')

// ---- Hoy en hora local ----
assert.equal(hoyISO(new Date(2026, 9, 7, 23, 30)), '2026-10-07')   // 23:30 locales sigue siendo el 7 (toISOString diría el 8 en Chile)
assert.equal(hoyISO(new Date(2026, 0, 5, 0, 5)), '2026-01-05')

console.log('vencimientos OK — plazo → vencimiento (30/40/60 días), plazo deducido, corrección de emisión y días para vencer')
