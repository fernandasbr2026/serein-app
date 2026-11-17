// Pruebas de aceptación del paquete «SEREIN_modulo_avance» (21 casos con los
// datos de OT914 al 11-11-2026). Correr: node src/avance/calc.test.mjs
import assert from 'node:assert'
import fs from 'node:fs'
import * as c from './calc.js'
const s = JSON.parse(fs.readFileSync(new URL('./calc.semilla.json', import.meta.url), 'utf8'))
const E = s.valores_esperados, hoy = s.ot.fecha_corte
const near = (a, b, tol, n) => assert.ok(Math.abs(a - b) <= tol, `${n}: ${a} vs ${b}`)
const ps = c.pesosPorDuracion(s.procesos.map(p => ({ codigo: p.codigo, duracionSem: p.duracion_sem, peso: 0, pesoEdp: p.peso_edp, avance: p.avance, planInicio: p.plan_inicio, planFin: p.plan_fin, partida: p.partida })))
let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name) }
t('pesos suman 100', () => near(ps.reduce((a, p) => a + p.peso, 0), 100, 1e-9, 'pesos'))
t('soldadura pesa más que montaje', () => assert.ok(ps[5].peso > ps[7].peso))
t('avance global 15,5%', () => near(c.avanceGlobal(ps) * 100, E.avance_global_pct, 0.05, 'global'))
const pl = c.plazoVigente(s.libro_obra.map(e => ({ fecha: e.fecha, tipo: e.tipo })), s.ot.plazo_dias, hoy)
t('plazo: inicio renovado', () => assert.strictEqual(pl.inicio, E.inicio_vigente))
t('plazo: término vigente', () => assert.strictEqual(pl.termino, E.termino_vigente))
t('plazo: día actual', () => assert.strictEqual(pl.diaActual, E.dia_actual))
t('plazo: segunda renovación sin efecto', () => { const p2 = c.plazoVigente([...s.libro_obra, { fecha: '2026-11-05', tipo: 'renov' }], 133, hoy); assert.strictEqual(p2.inicio, E.inicio_vigente); assert.strictEqual(p2.sinEfecto.length, 1) })
t('plazo: detención de 10 días', () => { const p3 = c.plazoVigente([...s.libro_obra, { fecha: '2026-11-01', hasta: '2026-11-11', tipo: 'det' }], 133, hoy); assert.strictEqual(p3.termino, '2027-03-05'); assert.strictEqual(p3.diaActual, 19) })
const fab = ps[5].avance * s.ot.kg_contrato / 1000, ritmo = Math.round(fab / c.dias(s.ot.inicio_fabricacion, hoy) * 7 * 10) / 10
t('ritmo medido 5,8 t/sem', () => near(ritmo, E.ritmo_t_semana, 1e-9, 'ritmo'))
const pj = c.proyeccionTermino(s.ot.kg_contrato / 1000 - fab, ritmo, hoy)
t('término proyectado', () => assert.strictEqual(pj.termino, E.termino_proyectado))
const atr = c.atrasoDias(pj.termino, pl.termino)
t('atraso 18 días y multa 6,3 MM', () => { assert.strictEqual(atr, E.atraso_dias); near(c.multaExpuesta(atr, s.ot.multa_dia) / 1e6, E.multa_expuesta_mm, 1e-9, 'multa') })
const av = c.avancePorPartida(ps), bruto = c.brutoAcumulado(s.partidas, av, s.ot.precio_contrato / s.ot.suma_partidas)
t('EDP: bruto 89,3 MM', () => near(bruto / 1e6, E.bruto_acumulado_mm, 0.05, 'bruto'))
t('EDP: amortización total → neto 0', () => assert.strictEqual(c.secuenciaEDP([bruto], { factorDescuento: 1, anticipo: s.ot.anticipo, retencionPct: 0.1, amortizacion: 'total' })[0].neto, 0))
t('EDP: amortización 30% → neto positivo', () => { const e = c.secuenciaEDP([bruto], { factorDescuento: 1, anticipo: s.ot.anticipo, retencionPct: 0.1, amortizacion: 'proporcional', amortizacionPct: 0.3 })[0]; near(e.neto, bruto * 0.7 * 0.9, 1, 'neto') })
t('EDP: el anticipo nunca se amortiza de más', () => { const q = c.secuenciaEDP([100e6, 200e6, 440e6], { factorDescuento: 1, anticipo: s.ot.anticipo, retencionPct: 0.1, amortizacion: 'total' }); near(q.reduce((a, x) => a + x.amortizacion, 0), s.ot.anticipo, 1, 'amort'); assert.ok(q.every(x => x.neto >= 0)) })
t('aprobaciones: 8 días de espera', () => assert.strictEqual(c.esperaClienteTotal([{ estado: 'pend', vence: '2026-11-03' }, { estado: 'resp' }], hoy), E.espera_cliente_dias))
t('avisos: rechazo y comentario envían correo', () => { assert.ok(c.reglaAviso('rej').correo && c.reglaAviso('com').correo && !c.reglaAviso('ok').correo) })
const pc = s.procesos.map(p => ({ codigo: p.codigo, avance: p.avance, cantidadTotal: p.cantidad_total, predecesor: p.predecesor }))
t('parte: soldadura no supera a armado', () => assert.throws(() => c.aplicarParte(pc, 'SOL', 5000), /anterior/))
t('parte: no supera el 100%', () => assert.throws(() => c.aplicarParte(pc, 'SUM', 60000), /total/))
t('parte: cantidad positiva', () => assert.throws(() => c.aplicarParte(pc, 'ARM', 0), /mayor/))
t('parte: armado válido', () => near(c.aplicarParte(pc, 'ARM', 5000), 0.157637, 1e-9, 'arm'))
// resumenOT con las filas tal como vienen de la base
const r = c.resumenOT({ ot: s.ot, procesos: s.procesos, partidas: s.partidas, libro: s.libro_obra, aprobaciones: [{ estado: 'pend', vence: '2026-11-03' }], partes: [] }, hoy)
t('resumenOT: avance, plazo y bruto coinciden', () => { near(r.real * 100, E.avance_global_pct, 0.05, 'real'); assert.strictEqual(r.plazo.termino, E.termino_vigente); near(r.bruto / 1e6, E.bruto_acumulado_mm, 0.05, 'bruto'); assert.strictEqual(r.espera, 8) })
console.log(`RESULTADO: ${n} pruebas OK, 0 fallas`)
