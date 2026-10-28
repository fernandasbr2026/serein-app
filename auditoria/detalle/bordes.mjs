// Pruebas de borde: copias literales de las funciones puras del ERP (no se puede importar JSX).
import * as V from 'file:///C:/Users/maria/gwt/serein-audit/src/vencimientos.js'

const R = []
const t = (mod, caso, entrada, salida, esperado) => {
  const s = JSON.stringify(salida), e = JSON.stringify(esperado)
  R.push({ mod, caso, entrada, salida: s, esperado: e, ok: s === e })
}

// ---------- OrdenesCompraModule.jsx ----------
{
  const num = s => { const v = parseInt(String(s).replace(/[^\d-]/g, ''), 10); return isNaN(v) ? 0 : v }
  const pctNum = s => { const v = parseFloat(String(s).replace(',', '.')); return isNaN(v) ? 0 : v }
  const itemTotalOC = it => Math.max(0, Math.round(num(it.cantidad) * num(it.precio) - num(it.descuento)))
  const ocNeto = oc => (oc.items && oc.items.length) ? oc.items.reduce((a, it) => a + itemTotalOC(it), 0) : ((oc.neto != null && oc.neto !== '') ? num(oc.neto) : Math.round(num(oc.monto) / 1.19))
  const ocIva = oc => Math.round(ocNeto(oc) * 0.19)
  const ocTotal = oc => ocNeto(oc) + ocIva(oc)
  const M = 'OC'
  t(M, 'neto 100000', { neto: 100000 }, [ocNeto({ neto: 100000 }), ocIva({ neto: 100000 }), ocTotal({ neto: 100000 })], [100000, 19000, 119000])
  t(M, 'neto 0', { neto: 0 }, ocTotal({ neto: 0 }), 0)
  t(M, 'neto negativo -5000', { neto: -5000 }, [ocNeto({ neto: -5000 }), ocTotal({ neto: -5000 })], [-5000, -5950])
  t(M, 'neto decimal 1234.56 (num quita el punto)', { neto: 1234.56 }, ocNeto({ neto: 1234.56 }), 1235)
  t(M, 'neto "1.234,56"', { neto: '1.234,56' }, ocNeto({ neto: '1.234,56' }), 1235)
  t(M, 'neto texto "abc"', { neto: 'abc' }, ocNeto({ neto: 'abc' }), 0)
  t(M, 'neto undefined, monto undefined', {}, ocNeto({}), 0)
  t(M, 'solo monto bruto 119000', { monto: 119000 }, [ocNeto({ monto: 119000 }), ocTotal({ monto: 119000 })], [100000, 119000])
  t(M, 'solo monto bruto 100 (redondeo)', { monto: 100 }, [ocNeto({ monto: 100 }), ocTotal({ monto: 100 })], [84, 100])
  t(M, 'items cant 2 x precio 1500.5', { items: [{ cantidad: 2, precio: 1500.5 }] }, ocNeto({ items: [{ cantidad: 2, precio: 1500.5 }] }), 3001)
  t(M, 'items cant "1,5" x precio 1000', { items: [{ cantidad: '1,5', precio: 1000 }] }, ocNeto({ items: [{ cantidad: '1,5', precio: 1000 }] }), 1500)
  t(M, 'items descuento > subtotal', { items: [{ cantidad: 1, precio: 1000, descuento: 5000 }] }, ocNeto({ items: [{ cantidad: 1, precio: 1000, descuento: 5000 }] }), 0)
  t(M, 'items precio negativo', { items: [{ cantidad: 1, precio: -1000 }] }, ocNeto({ items: [{ cantidad: 1, precio: -1000 }] }), 0)
  t(M, 'items vacíos + neto 500', { items: [], neto: 500 }, ocNeto({ items: [], neto: 500 }), 500)
  t(M, 'pct "33,33"', '33,33', pctNum('33,33'), 33.33)
  t(M, 'pct 150 (>100)', 150, 100000 * pctNum(150) / 100, 100000)
  t(M, 'pct "abc"', 'abc', pctNum('abc'), 0)
}

// ---------- CotizacionesModule.jsx ----------
{
  const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
  const numDec = s => { let x = String(s == null ? '' : s).trim().replace(/[^\d.,-]/g, ''); if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.'); else if (/^-?\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, ''); const v = parseFloat(x); return isNaN(v) ? 0 : v }
  const itemTotal = it => Math.max(0, Math.round((numDec(it.cant) * num(it.pUnitario)) - num(it.descuento)))
  const totales = cot => { const afecto = (cot.items || []).reduce((a, it) => a + itemTotal(it), 0); const iva = Math.round(afecto * 0.19); return { afecto, iva, total: afecto + iva } }
  const M = 'COT'
  t(M, '1 x 100000', { items: [{ cant: 1, pUnitario: 100000 }] }, totales({ items: [{ cant: 1, pUnitario: 100000 }] }), { afecto: 100000, iva: 19000, total: 119000 })
  t(M, 'sin items', {}, totales({}), { afecto: 0, iva: 0, total: 0 })
  t(M, 'cant 0', { items: [{ cant: 0, pUnitario: 100 }] }, totales({ items: [{ cant: 0, pUnitario: 100 }] }).total, 0)
  t(M, 'cant "1.234,56" x 1000', { items: [{ cant: '1.234,56', pUnitario: 1000 }] }, totales({ items: [{ cant: '1.234,56', pUnitario: 1000 }] }).afecto, 1234560)
  t(M, 'cant 1234.56 (número JS) x 1000', { items: [{ cant: 1234.56, pUnitario: 1000 }] }, totales({ items: [{ cant: 1234.56, pUnitario: 1000 }] }).afecto, 1234560)
  t(M, 'cant "1.234" x 1000 (¿miles o decimal?)', { items: [{ cant: '1.234', pUnitario: 1000 }] }, totales({ items: [{ cant: '1.234', pUnitario: 1000 }] }).afecto, 1234000)
  t(M, 'pUnitario negativo "-100"', { items: [{ cant: 1, pUnitario: '-100' }] }, totales({ items: [{ cant: 1, pUnitario: '-100' }] }).afecto, 0)
  t(M, 'pUnitario decimal 1500.5 (num ignora el punto)', { items: [{ cant: 1, pUnitario: 1500.5 }] }, totales({ items: [{ cant: 1, pUnitario: 1500.5 }] }).afecto, 1501)
  t(M, 'pUnitario "1.234,56"', { items: [{ cant: 1, pUnitario: '1.234,56' }] }, totales({ items: [{ cant: 1, pUnitario: '1.234,56' }] }).afecto, 1235)
  t(M, 'pUnitario texto', { items: [{ cant: 1, pUnitario: 'abc' }] }, totales({ items: [{ cant: 1, pUnitario: 'abc' }] }).afecto, 0)
  t(M, 'pUnitario undefined', { items: [{ cant: 1 }] }, totales({ items: [{ cant: 1 }] }).afecto, 0)
  t(M, 'descuento mayor al ítem', { items: [{ cant: 1, pUnitario: 1000, descuento: 9999 }] }, totales({ items: [{ cant: 1, pUnitario: 1000, descuento: 9999 }] }).afecto, 0)
  t(M, 'cant negativa "-2"', { items: [{ cant: '-2', pUnitario: 1000 }] }, totales({ items: [{ cant: '-2', pUnitario: 1000 }] }).afecto, 0)
  t(M, 'IVA de 1 peso', { items: [{ cant: 1, pUnitario: 1 }] }, totales({ items: [{ cant: 1, pUnitario: 1 }] }), { afecto: 1, iva: 0, total: 1 })
}

// ---------- ComprasOperativasModule.jsx ----------
{
  const esCombustible = c => ['Diésel', 'Bencina'].includes(c && c.categoria)
  const limpiaSigno = s => { const t = String(s == null ? '' : s).replace(/[^\d-]/g, ''); return (t.startsWith('-') ? '-' : '') + t.replace(/-/g, '') }
  const numSigno = s => Number(limpiaSigno(s)) || 0
  const impEspDe = c => esCombustible(c) ? numSigno(c.impEsp) : 0
  const ivaDe = c => (c.neto != null && c.aplicaIva) ? Math.round(c.neto * 0.19) : 0
  const totalDe = c => c.neto != null ? c.neto + impEspDe(c) + ivaDe(c) : null
  const costoComprasOpDeOT = (compras, numeroOT) => (compras || []).filter(c => esCombustible(c) && c.estado !== 'Rechazada' && c.neto != null).reduce((a, c) =>
    a + ((c.asignacion && c.asignacion.items) || []).filter(i => i.ref === numeroOT).reduce((s2, i) => s2 + (c.neto + impEspDe(c)) * (parseFloat(i.pct) || 0) / 100, 0), 0)
  const M = 'ComprasOp'
  const boleta = { categoria: 'Diésel', neto: 23211, impEsp: 2379, aplicaIva: true }
  t(M, 'boleta real diésel', boleta, [ivaDe(boleta), totalDe(boleta)], [4410, 30000])
  const neg = { categoria: 'Diésel', neto: 23211, impEsp: '-500', aplicaIva: true }
  t(M, 'imp. específico negativo "-500"', neg, totalDe(neg), 27121)
  const sinIva = { categoria: 'Bencina', neto: 10000, impEsp: 1000, aplicaIva: false }
  t(M, 'bencina sin IVA', sinIva, totalDe(sinIva), 11000)
  const noComb = { categoria: 'EPP', neto: 10000, impEsp: 1000, aplicaIva: true }
  t(M, 'no combustible: imp. específico se ignora', noComb, totalDe(noComb), 11900)
  t(M, 'neto null', { categoria: 'Diésel', neto: null, aplicaIva: true }, totalDe({ categoria: 'Diésel', neto: null, aplicaIva: true }), null)
  t(M, 'neto 0', { categoria: 'Diésel', neto: 0, impEsp: 500, aplicaIva: true }, totalDe({ categoria: 'Diésel', neto: 0, impEsp: 500, aplicaIva: true }), 500)
  const txt = { categoria: 'Diésel', neto: '23211', impEsp: 2379, aplicaIva: true }
  t(M, 'neto como texto "23211" (guardado sin num)', txt, totalDe(txt), 30000)
  const dec = { categoria: 'Diésel', neto: 1234.56, impEsp: '1.234,56', aplicaIva: true }
  t(M, 'neto 1234.56 + impEsp "1.234,56"', dec, [impEspDe(dec), ivaDe(dec), totalDe(dec)], [1235, 235, 2704])
  t(M, 'impEsp "--50"', '--50', numSigno('--50'), -50)
  t(M, 'impEsp "5-0"', '5-0', numSigno('5-0'), 0)
  const comp = [{ categoria: 'Diésel', neto: 10000, impEsp: 1000, estado: 'Aprobada', asignacion: { items: [{ ref: 'OT-1', pct: 150 }] } }]
  t(M, 'reparto 150 % a una OT', comp, costoComprasOpDeOT(comp, 'OT-1'), 11000)
  const comp2 = [{ categoria: 'Diésel', neto: 10000, impEsp: 1000, estado: 'Pendiente de revisión', asignacion: { items: [{ ref: 'OT-1', pct: '50,5' }] } }]
  t(M, 'pct "50,5" (coma) y estado pendiente', comp2, costoComprasOpDeOT(comp2, 'OT-1'), 5555)
}

// ---------- ParametrosModule.jsx ----------
{
  const dec = s => { const v = parseFloat(String(s).replace(',', '.').replace(/[^\d.]/g, '')); return isNaN(v) ? 0 : v }
  function calcularPerdidaFactoring(baseTotal, dias, diasMora, f) {
    if (!f) return { interes: 0, mora: 0, costoOp: 0, total: 0 }
    const interes = baseTotal * (f.tasa / 100) * ((dias || 0) / 30)
    const mora = baseTotal * (f.tasaMora / 100) * ((diasMora || 0) / 30)
    const costoOp = f.costoOp || 0
    return { interes: Math.round(interes), mora: Math.round(mora), costoOp, total: Math.round(interes + mora + costoOp) }
  }
  const M = 'Factoring'
  const f = { tasa: 0.83, tasaMora: 3.5, costoOp: 50000 }
  t(M, '1.190.000 a 30 días sin mora', [1190000, 30, 0], calcularPerdidaFactoring(1190000, 30, 0, f), { interes: 9877, mora: 0, costoOp: 50000, total: 59877 })
  t(M, 'base 0', [0, 30, 0], calcularPerdidaFactoring(0, 30, 0, f).total, 50000)
  t(M, 'base negativa', [-100000, 30, 0], calcularPerdidaFactoring(-100000, 30, 0, f), { interes: -830, mora: 0, costoOp: 50000, total: 49170 })
  t(M, 'dias undefined', [1190000, undefined, undefined], calcularPerdidaFactoring(1190000, undefined, undefined, f).total, 50000)
  t(M, 'dias texto "30"', [1190000, '30', 0], calcularPerdidaFactoring(1190000, '30', 0, f).interes, 9877)
  t(M, 'dias texto "abc"', [1190000, 'abc', 0], calcularPerdidaFactoring(1190000, 'abc', 0, f).total, 50000)
  t(M, 'tasa como texto "0,83" (sin dec)', [1190000, 30, 0], calcularPerdidaFactoring(1190000, 30, 0, { tasa: '0,83', tasaMora: 3.5, costoOp: 50000 }).total, 59877)
  t(M, 'tasa undefined', [1190000, 30, 0], calcularPerdidaFactoring(1190000, 30, 0, { costoOp: 50000 }).total, 50000)
  t(M, 'sin empresa (f=null)', [1190000, 30, 0, null], calcularPerdidaFactoring(1190000, 30, 0, null).total, 0)
  t(M, 'tasa 150 % mensual', [1000000, 30, 0], calcularPerdidaFactoring(1000000, 30, 0, { tasa: 150, tasaMora: 0, costoOp: 0 }).total, 1500000)
  t(M, 'dias mora 400', [1000000, 30, 400], calcularPerdidaFactoring(1000000, 30, 400, f).mora, 466667)
  t(M, 'dec("0,83")', '0,83', dec('0,83'), 0.83)
  t(M, 'dec("-3")', '-3', dec('-3'), -3)
  t(M, 'dec("1.234,56")', '1.234,56', dec('1.234,56'), 1234.56)
}

// ---------- vencimientos.js (importado real) ----------
{
  const M = 'Vencimientos'
  t(M, 'sumarDias 2026-01-31 + 30', ['2026-01-31', 30], V.sumarDias('2026-01-31', 30), '2026-03-02')
  t(M, 'sumarDias 31/02', ['2026-02-31', 30], V.sumarDias('2026-02-31', 30), '')
  t(M, 'sumarDias fecha vacía', ['', 30], V.sumarDias('', 30), '')
  t(M, 'sumarDias undefined', [undefined, 30], V.sumarDias(undefined, 30), '')
  t(M, 'sumarDias dias "30" texto', ['2026-03-01', '30'], V.sumarDias('2026-03-01', '30'), '2026-03-31')
  t(M, 'sumarDias dias 4.7', ['2026-03-01', 4.7], V.sumarDias('2026-03-01', 4.7), '')
  t(M, 'sumarDias dias negativo -5', ['2026-03-10', -5], V.sumarDias('2026-03-10', -5), '2026-03-05')
  t(M, 'sumarDias fecha dd/mm/aaaa', ['31/02/2026', 30], V.sumarDias('31/02/2026', 30), '')
  t(M, 'plazoValido(-5)', -5, V.plazoValido(-5), null)
  t(M, 'plazoValido(999)', 999, V.plazoValido(999), 365)
  t(M, 'plazoValido("4,7")', '4,7', V.plazoValido('4,7'), 4)
  t(M, 'plazoValido("abc")', 'abc', V.plazoValido('abc'), null)
  t(M, 'plazoValido(0)', 0, V.plazoValido(0), 0)
  t(M, 'vencimientoPorPlazo("2026-02-28", 1) (no bisiesto)', ['2026-02-28', 1], V.vencimientoPorPlazo('2026-02-28', 1), '2026-03-01')
  t(M, 'plazoDe venc antes de emisión', ['2026-03-10', '2026-03-01'], V.plazoDe('2026-03-10', '2026-03-01'), null)
  t(M, 'plazoDe cambio de hora Chile (sept)', ['2026-09-01', '2026-10-01'], V.plazoDe('2026-09-01', '2026-10-01'), 30)
  t(M, 'plazoDe emisión vacía', ['', '2026-10-01'], V.plazoDe('', '2026-10-01'), null)
  t(M, 'diasParaVencer hoy', ['2026-10-27', '2026-10-27'], V.diasParaVencer('2026-10-27', '2026-10-27'), 0)
  t(M, 'diasParaVencer vencida', ['2026-10-20', '2026-10-27'], V.diasParaVencer('2026-10-20', '2026-10-27'), -7)
  t(M, 'diasParaVencer fecha con hora ISO', ['2026-10-30T15:00:00Z', '2026-10-27'], V.diasParaVencer('2026-10-30T15:00:00Z', '2026-10-27'), 3)
  t(M, 'conFechasCoherentes plazo "abc" se ignora', 'abc', V.conFechasCoherentes({ emission_date: '2026-10-01', plazo: '30', vencimiento: '2026-10-31' }, 'plazo', 'abc'), { emission_date: '2026-10-01', plazo: '30', vencimiento: '2026-10-31' })
  t(M, 'conFechasCoherentes emisión 31/02', '2026-02-31', V.conFechasCoherentes({ emission_date: '2026-10-01', plazo: '30', vencimiento: '2026-10-31' }, 'emission_date', '2026-02-31'), { emission_date: '2026-02-31', plazo: '30', vencimiento: '' })
  t(M, 'vencimientoAlCambiarEmision plazo deducido absurdo', ['0202-10-01', '2026-10-31', '2026-10-05'], V.vencimientoAlCambiarEmision('0202-10-01', '2026-10-31', '2026-10-05'), '2026-10-31')
  t(M, 'textoDiasParaVencer(-1)', -1, V.textoDiasParaVencer(-1), 'atrasada 1 día')
}

// ---------- ManoObraModule.jsx ----------
{
  const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
  function calc(t) {
    const s = num(t.sueldo), imp = num(t.imposiciones)
    const diaBrutoRaw = (s + imp) / 30, diaSinImpRaw = s / 30, horaRaw = diaBrutoRaw / 9, hexRaw = horaRaw * 1.5
    return { diaBruto: Math.round(diaBrutoRaw), diaSinImp: Math.round(diaSinImpRaw), hora: Math.round(horaRaw), horaExtra: Math.round(hexRaw), sabado: num(t.sabado), domingo: num(t.domingo), turnoNoche: num(t.turnoNoche) }
  }
  const minutosDesde = hhmm => { const p = String(hhmm || '').split(':'); const h = parseInt(p[0], 10), m = parseInt(p[1], 10); return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m) }
  const HORA_ENTRADA_ESTANDAR = '08:00'
  const calcAtrasoMin = horaLlegada => horaLlegada ? Math.max(0, minutosDesde(horaLlegada) - minutosDesde(HORA_ENTRADA_ESTANDAR)) : 0
  const esViernes = fecha => { try { return new Date(fecha + 'T12:00:00').getDay() === 5 } catch (e) { return false } }
  const horaSalidaEstandar = fecha => esViernes(fecha) ? '14:00' : '17:30'
  const calcSalidaAnticipadaMin = (horaSalida, fecha) => horaSalida ? Math.max(0, minutosDesde(horaSalidaEstandar(fecha)) - minutosDesde(horaSalida)) : 0
  function costoDia(t, tipo, horaLlegada, factorJornada, horaSalida, fecha) {
    const c = calc(t)
    const valorDia = Math.round(c.diaBruto * (factorJornada || 1))
    if (tipo === 'Trabajó') {
      const atrasoMin = calcAtrasoMin(horaLlegada)
      const descuentoAtraso = Math.round((atrasoMin / 60) * c.hora)
      const salidaAnticipadaMin = calcSalidaAnticipadaMin(horaSalida, fecha)
      const descuentoSalida = Math.round((salidaAnticipadaMin / 60) * c.hora)
      return { valorDia, atrasoMin, descuentoAtraso, salidaAnticipadaMin, descuentoSalida, pago: Math.max(0, valorDia - descuentoAtraso - descuentoSalida) }
    }
    if (tipo === 'Falta' || tipo === 'Permiso') return { valorDia, pago: 0 }
    if (tipo === 'Vacaciones') return { valorDia, pago: valorDia }
    return { valorDia, pago: 0 }
  }
  function horasEntre(inicio, fin) { if (!inicio || !fin) return 0; let min = minutosDesde(fin) - minutosDesde(inicio); if (min <= 0) min += 24 * 60; return Math.round((min / 60) * 100) / 100 }
  const M = 'ManoObra'
  const t1 = { sueldo: 800000, imposiciones: 270981 }
  t(M, 'calc Daniel (800.000 + 270.981)', t1, calc(t1), { diaBruto: 35699, diaSinImp: 26667, hora: 3967, horaExtra: 5950, sabado: 0, domingo: 0, turnoNoche: 0 })
  t(M, 'hora extra = hora x 1,5 (50 %)', t1, calc(t1).horaExtra / calc(t1).hora, 1.5)
  t(M, 'sueldo "1.234,56"', { sueldo: '1.234,56' }, calc({ sueldo: '1.234,56' }).diaBruto, 41)
  t(M, 'sueldo negativo "-800000"', { sueldo: '-800000' }, calc({ sueldo: '-800000' }).diaBruto, 0)
  t(M, 'sueldo texto', { sueldo: 'abc' }, calc({ sueldo: 'abc' }), { diaBruto: 0, diaSinImp: 0, hora: 0, horaExtra: 0, sabado: 0, domingo: 0, turnoNoche: 0 })
  t(M, 'sueldo undefined', {}, calc({}).horaExtra, 0)
  t(M, 'horas 15:30→19:10', ['15:30', '19:10'], horasEntre('15:30', '19:10'), 3.67)
  t(M, 'horas 22:00→02:00 cruza medianoche', ['22:00', '02:00'], horasEntre('22:00', '02:00'), 4)
  t(M, 'horas iguales 08:00→08:00 (asume 24 h)', ['08:00', '08:00'], horasEntre('08:00', '08:00'), 0)
  t(M, 'horas texto "abc"→"xyz"', ['abc', 'xyz'], horasEntre('abc', 'xyz'), 0)
  t(M, 'horas vacías', ['', ''], horasEntre('', ''), 0)
  t(M, 'pago extra 3,67 h Daniel', [5950, 3.67], Math.round(5950 * 3.67), 21837)
  t(M, 'feriado trabajado = domingo (100 %) con domingo 0', { ...t1, domingo: 0 }, calc({ ...t1, domingo: 0 }).domingo, 0)
  t(M, 'día trabajado, llega 08:30', [t1, '08:30'], costoDia(t1, 'Trabajó', '08:30', 1, '', '2026-10-27'), { valorDia: 35699, atrasoMin: 30, descuentoAtraso: 1984, salidaAnticipadaMin: 0, descuentoSalida: 0, pago: 33715 })
  t(M, 'día trabajado, llega 07:30 (antes)', [t1, '07:30'], costoDia(t1, 'Trabajó', '07:30', 1, '', '2026-10-27').descuentoAtraso, 0)
  t(M, 'llega "25:99"', [t1, '25:99'], costoDia(t1, 'Trabajó', '25:99', 1, '', '2026-10-27').atrasoMin, 0)
  t(M, 'llega "8" (sin minutos)', [t1, '8'], costoDia(t1, 'Trabajó', '8', 1, '', '2026-10-27').atrasoMin, 0)
  t(M, 'llega "abc"', [t1, 'abc'], costoDia(t1, 'Trabajó', 'abc', 1, '', '2026-10-27').atrasoMin, 0)
  t(M, 'sale 12:00 un viernes', [t1, '12:00', '2026-10-30'], costoDia(t1, 'Trabajó', '', 1, '12:00', '2026-10-30').salidaAnticipadaMin, 120)
  t(M, 'sale 12:00 fecha "31/02/2026"', [t1, '12:00', '31/02/2026'], costoDia(t1, 'Trabajó', '', 1, '12:00', '31/02/2026').salidaAnticipadaMin, 330)
  t(M, 'media jornada factor 0.5', [t1, 0.5], costoDia(t1, 'Trabajó', '', 0.5, '', '2026-10-27').pago, 17850)
  t(M, 'factor 0 → se trata como 1', [t1, 0], costoDia(t1, 'Trabajó', '', 0, '', '2026-10-27').pago, 35699)
  t(M, 'atraso enorme no deja pago negativo', [t1, '23:00'], costoDia(t1, 'Trabajó', '23:00', 1, '', '2026-10-27').pago, 0)
}

// ---------- OTModule.jsx: utilidad / margen ----------
{
  const margen = (ventas, costos) => { const v = (ventas || []).reduce((a, x) => a + x.neta, 0); const c = (costos || []).reduce((a, x) => a + x.monto, 0); return { utilidad: v - c, margen: v > 0 ? (v - c) / v * 100 : 0 } }
  const M = 'OT margen'
  t(M, 'venta 1.000.000 costo 700.000', [], margen([{ neta: 1000000 }], [{ monto: 700000 }]), { utilidad: 300000, margen: 30 })
  t(M, 'sin ventas con costos', [], margen([], [{ monto: 700000 }]), { utilidad: -700000, margen: 0 })
  t(M, 'venta.neta undefined (descargarOT)', [], margen([{ folio: '1' }], [{ monto: 1 }]), { utilidad: -1, margen: 0 })
  t(M, 'costo.monto texto "1.000"', [], margen([{ neta: 10000 }], [{ monto: '1.000' }]), { utilidad: 9000, margen: 90 })
  t(M, 'costo.monto undefined (descargarOT)', [], margen([{ neta: 10000 }], [{}]), { utilidad: 10000, margen: 100 })
  t(M, 'venta negativa (NC)', [], margen([{ neta: -10000 }], [{ monto: 0 }]), { utilidad: -10000, margen: 0 })
}

// ---------- salida ----------
let fallos = 0
const lineas = ['| Módulo | Caso | Entrada | Salida real | Esperado | OK |', '|---|---|---|---|---|---|']
for (const r of R) {
  if (!r.ok) fallos++
  lineas.push(`| ${r.mod} | ${r.caso} | \`${JSON.stringify(r.entrada)}\` | \`${r.salida}\` | \`${r.esperado}\` | ${r.ok ? 'sí' : '**NO**'} |`)
}
console.log(lineas.join('\n'))
console.log(`\n${R.length} casos, ${fallos} distintos de lo esperado`)
