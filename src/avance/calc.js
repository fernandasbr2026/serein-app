// Módulo Avance de Obra · lógica de cálculo (funciones puras, sin dependencias).
// Es la traducción a JavaScript del `calc.ts` entregado por Gerencia de
// Proyectos (paquete «SEREIN_modulo_avance»); los nombres y las reglas se
// mantienen iguales para que las 21 pruebas del paquete sigan valiendo
// (ver calc.test.mjs en esta misma carpeta). Toda cifra que muestre la
// pantalla debe salir de aquí, nunca calcularse a mano en el JSX.

const DAY = 86_400_000
export const toDate = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
export const dias = (a, b) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY)
export const sumarDias = (a, n) => new Date(toDate(a).getTime() + n * DAY).toISOString().slice(0, 10)
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x))
export const hoyISO = () => new Date().toISOString().slice(0, 10)

/* 1. Procesos y avance global ------------------------------------------ */
// Peso de avance físico: proporcional a la duración. 100 % = último proceso.
export const pesosPorDuracion = ps => {
  const t = ps.reduce((a, p) => a + Number(p.duracionSem || 0), 0)
  return ps.map(p => ({ ...p, peso: t > 0 ? (Number(p.duracionSem || 0) / t) * 100 : 0 }))
}
export const avanceGlobal = ps => {
  const t = ps.reduce((a, p) => a + p.peso, 0)
  return t > 0 ? ps.reduce((a, p) => a + p.peso * p.avance, 0) / t : 0
}
// Avance programado de un proceso a una fecha; `desplazamiento` = días que se corrió el inicio (renovación).
export const planProceso = (p, fecha, desplazamiento = 0) => {
  const ini = sumarDias(p.planInicio, desplazamiento), fin = sumarDias(p.planFin, desplazamiento)
  const dur = dias(ini, fin)
  return dur > 0 ? clamp(dias(ini, fecha) / dur) : (dias(ini, fecha) >= 0 ? 1 : 0)
}
export const planGlobal = (ps, fecha, desplazamiento = 0) => {
  const t = ps.reduce((a, p) => a + p.peso, 0)
  return t > 0 ? ps.reduce((a, p) => a + p.peso * planProceso(p, fecha, desplazamiento), 0) / t : 0
}
export const spi = (real, plan) => (plan > 0 ? real / plan : 1)

/* 2. Libro de obra → plazo vigente -------------------------------------- */
// 'ini' fija el inicio contractual; 'renov' (planos finales para fabricar)
// reinicia el plazo UNA sola vez; 'det' (detención) suma sus días al término
// y no cuenta como plazo consumido (sin `hasta` = en curso).
export function plazoVigente(eventos, plazoDias, hoy) {
  const ev = [...eventos].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const evIni = ev.find(e => e.tipo === 'ini')
  if (!evIni) throw new Error('El libro de obra necesita un evento de inicio (ini).')
  let inicio = evIni.fecha
  const inicioContractual = inicio
  let renovacion = null, diasDetencion = 0, diasDetenidosALaFecha = 0
  const sinEfecto = []
  for (const e of ev) {
    if (e.tipo === 'renov') { if (renovacion) sinEfecto.push(e); else { renovacion = e.fecha; inicio = e.fecha } }
    if (e.tipo === 'det') {
      const fin = e.hasta || hoy
      diasDetencion += Math.max(0, dias(e.fecha, fin))
      diasDetenidosALaFecha += Math.max(0, dias(e.fecha, fin < hoy ? fin : hoy))
    }
  }
  const termino = sumarDias(inicio, plazoDias + diasDetencion)
  const diaActual = Math.max(0, dias(inicio, hoy) - diasDetenidosALaFecha)
  return {
    inicioContractual, inicio, termino, renovacion, diasDetencion, diaActual,
    plazoConsumido: plazoDias > 0 ? diaActual / plazoDias : 0,
    desplazamiento: dias(inicioContractual, inicio),
    sinEfecto,
  }
}

/* 3. Proyección de término y multa -------------------------------------- */
export function proyeccionTermino(tRestantes, ritmoTSemana, hoy, desfaseCierreDias = 14) {
  if (!(ritmoTSemana > 0)) return { finFabricacion: null, termino: null }
  const finFabricacion = sumarDias(hoy, Math.ceil((tRestantes / ritmoTSemana) * 7))
  return { finFabricacion, termino: sumarDias(finFabricacion, desfaseCierreDias) }
}
export const atrasoDias = (terminoProyectado, terminoVigente) => Math.max(0, dias(terminoVigente, terminoProyectado))
export const multaExpuesta = (atraso, multaDia) => atraso * multaDia
export const ritmoRequerido = (tRestantes, hoy, fechaObjetivo) => { const s = dias(hoy, fechaObjetivo) / 7; return s > 0 ? tRestantes / s : Infinity }

/* 4. EDP ----------------------------------------------------------------- */
export const PARTIDAS = ['prov', 'mon', 'pin', 'int', 'ter']
// Avance de cada partida = promedio ponderado por pesoEdp (valor), NO por duración.
export function avancePorPartida(ps) {
  const r = {}
  for (const c of PARTIDAS) {
    const src = ps.filter(p => p.partida === c)
    const t = src.reduce((a, p) => a + p.pesoEdp, 0)
    r[c] = src.length && t > 0 ? src.reduce((a, p) => a + p.pesoEdp * p.avance, 0) / t : 0
  }
  return r
}
export const brutoAcumulado = (partidas, avance, factor) =>
  partidas.reduce((a, p) => a + Number(p.monto) * (avance[p.codigo] ?? 0), 0) * factor

// Secuencia de EDP a partir del bruto acumulado en cada corte; el anticipo pendiente se arrastra.
export function secuenciaEDP(brutosAcumulados, prm) {
  let previo = 0, anticipoPendiente = prm.anticipo
  return brutosAcumulados.map((B, i) => {
    const periodo = B - previo
    const amort = Math.min(anticipoPendiente, prm.amortizacion === 'total' ? periodo : periodo * (prm.amortizacionPct ?? 0.3))
    anticipoPendiente -= amort
    const retencion = Math.max(0, (periodo - amort) * prm.retencionPct)
    const neto = Math.max(0, periodo - amort - retencion)
    previo = B
    return { n: i, brutoAcumulado: B, periodo, amortizacion: amort, retencion, neto, anticipoPendiente }
  })
}

/* 5. Aprobaciones del cliente ------------------------------------------- */
export const diasAtrasoCliente = (a, hoy) => (a.estado === 'pend' && a.vence ? Math.max(0, dias(a.vence, hoy)) : 0)
export const esperaClienteTotal = (as, hoy) => as.reduce((s, a) => s + diasAtrasoCliente(a, hoy), 0)
export const reglaAviso = accion => (accion === 'rej' || accion === 'com' ? { alerta: true, correo: true } : { alerta: true, correo: false })

/* 6. Parte diario (carga de avance) ------------------------------------- */
// Valida un parte diario. Devuelve el nuevo avance (0..1) o lanza el motivo.
export function aplicarParte(ps, codigo, cantidad) {
  const p = ps.find(x => x.codigo === codigo)
  if (!p) throw new Error('Proceso desconocido')
  if (!(cantidad > 0)) throw new Error('La cantidad debe ser mayor que cero')
  const nuevo = p.avance + cantidad / p.cantidadTotal
  if (nuevo > 1.0001) throw new Error('Supera el total del proceso')
  const pre = p.predecesor ? ps.find(x => x.codigo === p.predecesor) : undefined
  if (pre && nuevo > pre.avance + 1e-9) throw new Error('No puede superar al proceso anterior')
  return Math.min(1, nuevo)
}

/* 7. Resumen de una OT para la pantalla ---------------------------------- */
// Convierte las filas de la base (snake_case) al formato de las funciones de
// arriba y calcula todo lo que muestran la vista interna y la del cliente.
export function resumenOT({ ot, procesos, partidas, libro, aprobaciones, partes }, hoy = hoyISO()) {
  const ps = pesosPorDuracion((procesos || []).map(p => ({
    codigo: p.codigo, nombre: p.nombre, duracionSem: Number(p.duracion_sem), pesoEdp: Number(p.peso_edp),
    avance: Number(p.avance), planInicio: p.plan_inicio, planFin: p.plan_fin, partida: p.partida,
    unidad: p.unidad, cantidadTotal: Number(p.cantidad_total), predecesor: p.predecesor, visibleCliente: p.visible_cliente !== false,
  })))
  // El inicio contractual manda desde la ficha de la OT: si en Configuración se
  // corrige la fecha, el evento 'ini' del libro se lee con esa fecha.
  const eventos = (libro || []).filter(e => e.tipo !== 'ini' || !ot?.fecha_inicio_contractual).map(e => ({ fecha: e.fecha, hasta: e.hasta, tipo: e.tipo }))
  if (ot?.fecha_inicio_contractual) eventos.push({ fecha: ot.fecha_inicio_contractual, tipo: 'ini' })
  let plazo = null
  try { plazo = plazoVigente(eventos, Number(ot?.plazo_dias || 0), hoy) } catch (e) { plazo = null }
  const real = avanceGlobal(ps)
  const plan = plazo ? planGlobal(ps, hoy, plazo.desplazamiento) : 0
  // Ritmo de fabricación medido SOLO con lo cargado (nunca con capacidad
  // declarada): toneladas soldadas (la soldadura es la pieza fabricada) entre
  // la fecha del primer parte de taller y hoy. Igual que la lista de
  // aceptación del paquete (ritmo = kg soldados / días desde inicio de fabricación × 7).
  const kg = Number(ot?.kg_contrato || 0)
  const sol = ps.find(p => p.codigo === 'SOL')
  const avFab = sol ? sol.avance : 0
  const idsTaller = new Set((procesos || []).filter(p => ['COR', 'ARM', 'SOL'].includes(p.codigo)).map(p => p.id))
  const fechasTaller = (partes || []).filter(p => idsTaller.has(p.proceso_id)).map(p => p.fecha).sort()
  const semanas = fechasTaller.length ? Math.max(7, dias(fechasTaller[0], hoy)) / 7 : 0
  const ritmo = semanas > 0 ? (kg * avFab) / 1000 / semanas : 0
  const tRestantes = (kg * (1 - avFab)) / 1000
  const proy = proyeccionTermino(tRestantes, ritmo, hoy)
  const atraso = plazo && proy.termino ? atrasoDias(proy.termino, plazo.termino) : 0
  const avPartida = avancePorPartida(ps)
  const factor = Number(ot?.suma_partidas) > 0 ? Number(ot.precio_contrato) / Number(ot.suma_partidas) : 1
  const bruto = brutoAcumulado(partidas || [], avPartida, factor)
  const espera = esperaClienteTotal((aprobaciones || []).map(a => ({ estado: a.estado, vence: a.vence })), hoy)
  return {
    hoy, procesos: ps, plazo, real, plan, spi: spi(real, plan), ritmo, tRestantes, proy, atraso,
    multa: multaExpuesta(atraso, Number(ot?.multa_dia || 0)), avPartida, factor, bruto, espera,
    ritmoRequerido: plazo ? ritmoRequerido(tRestantes, hoy, sumarDias(plazo.termino, -14)) : null,
  }
}

/* 8. Plantilla de procesos para una OT nueva ------------------------------ */
// Diez procesos en orden; duraciones y pesos EDP del paquete (estimados por
// Gerencia; se editan por OT). Las fechas del programa son días desde el
// inicio contractual, tomadas del plan de referencia.
export const PLANTILLA_PROCESOS = [
  { codigo: 'ING', nombre: 'Ingeniería de detalle', duracion_sem: 3, peso_edp: 8, partida: 'prov', unidad: '%', cantidad: '100', predecesor: null, ini: 0, fin: 72, libera_externo: 'Cliente / ingeniería', req_lib_externa: true },
  { codigo: 'PER', nombre: 'Pernos de anclaje', duracion_sem: 0.5, peso_edp: 4, partida: 'prov', unidad: 'pedestales', cantidad: null, predecesor: null, ini: 27, fin: 77, libera_externo: 'Topografía cliente', req_lib_externa: true },
  { codigo: 'SUM', nombre: 'Suministro de material', duracion_sem: 2, peso_edp: 42, partida: 'prov', unidad: 'kg', cantidad: 'kg', predecesor: null, ini: 11, fin: 87, libera_externo: null, req_lib_externa: false },
  { codigo: 'COR', nombre: 'Corte', duracion_sem: 2, peso_edp: 10, partida: 'prov', unidad: 'kg', cantidad: 'kg', predecesor: 'SUM', ini: 27, fin: 97, libera_externo: null, req_lib_externa: false },
  { codigo: 'ARM', nombre: 'Armado', duracion_sem: 6.5, peso_edp: 16, partida: 'prov', unidad: 'kg', cantidad: 'kg', predecesor: 'COR', ini: 31, fin: 102, libera_externo: 'ITO cliente', req_lib_externa: true },
  { codigo: 'SOL', nombre: 'Soldadura', duracion_sem: 8.5, peso_edp: 20, partida: 'prov', unidad: 'kg', cantidad: 'kg', predecesor: 'ARM', ini: 36, fin: 107, libera_externo: 'ITO cliente', req_lib_externa: true },
  { codigo: 'PIN', nombre: 'Granallado y anticorrosivo', duracion_sem: 2.5, peso_edp: 100, partida: 'pin', unidad: 'm²', cantidad: null, predecesor: 'SOL', ini: 41, fin: 115, libera_externo: 'ITO cliente', req_lib_externa: true },
  { codigo: 'MON', nombre: 'Montaje', duracion_sem: 4.5, peso_edp: 100, partida: 'mon', unidad: 'kg', cantidad: 'kg', predecesor: 'PIN', ini: 58, fin: 123, libera_externo: 'Cliente', req_lib_externa: true },
  { codigo: 'INT', nombre: 'Protección intumescente', duracion_sem: 2, peso_edp: 100, partida: 'int', unidad: 'm²', cantidad: null, predecesor: 'MON', ini: 97, fin: 130, libera_externo: 'Mandante / arquitectos', req_lib_externa: true },
  { codigo: 'TER', nombre: 'Pintura de terminación en obra', duracion_sem: 2, peso_edp: 100, partida: 'ter', unidad: 'm²', cantidad: null, predecesor: 'INT', ini: 107, fin: 133, libera_externo: 'ITO cliente', req_lib_externa: true },
]
export const PARTIDAS_NOMBRE = { prov: 'Provisión estructura', mon: 'Montaje estructura', pin: 'Pintura anticorrosiva', int: 'Protección intumescente', ter: 'Pintura terminación' }
export const TIPOS_EVENTO = { ini: 'Inicio contractual', renov: 'Planos finales para fabricar (renueva el plazo)', det: 'Detención', com: 'Comunicación', pla: 'Planos / ingeniería', tra: 'Transmittal', ava: 'Avance' }

export const fmtPct = x => (Number(x || 0) * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' %'
export const fmtCLP = n => '$' + Math.round(Number(n || 0)).toLocaleString('es-CL')
export const fmtMM = n => '$' + (Number(n || 0) / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' MM'
export const fmtFecha = s => { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return d + '-' + m + '-' + y }
