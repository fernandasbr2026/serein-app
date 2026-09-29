// Calculo de plazos en dias HABILES para lotes de piezas (Fase E del
// rediseno de OT) — usado tanto por OTModule.jsx (columna "Vence" en la
// tabla de trazabilidad por pieza) como por TrazabilidadModule.jsx (tablero
// de lotes y alarmas). Separado a su propio archivo para no duplicar la
// misma logica en dos modulos.
const hoy = () => new Date().toISOString().slice(0, 10)

// Tope defensivo de iteraciones (~27 años de dias habiles) — una fecha mal
// escrita a mano (texto libre, formato distinto) o un plazo en dias con un
// valor absurdo (typo de varios ceros de mas) puede hacer que estos bucles
// caminen dia por dia durante millones de vueltas y congelen la pestana del
// navegador. Con datos validos jamas se llega ni cerca de este tope.
const TOPE_ITERACIONES = 10000

// A partir de la fecha del lote (partida de recepcion) suma solo dias de
// semana para llegar a la fecha de vencimiento.
export function sumarDiasHabiles(fechaStr, dias) {
  if (!fechaStr || !dias) return null
  let d = new Date(fechaStr + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  let restante = Number(dias)
  if (!isFinite(restante) || restante <= 0) return null
  restante = Math.min(restante, TOPE_ITERACIONES)
  while (restante > 0) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) restante--
  }
  return d.toISOString().slice(0, 10)
}

// Dias habiles entre hoy y una fecha de vencimiento (negativo = ya vencio).
export function diasHabilesHasta(fechaVenc) {
  if (!fechaVenc) return null
  const a = new Date(hoy() + 'T00:00:00'), b = new Date(fechaVenc + 'T00:00:00')
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null
  const signo = b >= a ? 1 : -1
  let d = new Date(a), n = 0
  let pasos = 0
  while (d.getTime() !== b.getTime() && pasos < TOPE_ITERACIONES) {
    d.setDate(d.getDate() + signo)
    if (d.getDay() !== 0 && d.getDay() !== 6) n += signo
    pasos++
  }
  return n
}
