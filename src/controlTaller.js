// Control de Taller (Fase G del plan — ver
// C:\Users\maria\.claude\plans\sorted-singing-sundae.md): avance físico de
// fabricación por marca dentro de un Proyecto, en 4 etapas de taller
// (dimensionado → armado → soldado → liberado). Separado a su propio
// archivo, mismo patrón que plazos.js/vistaCliente.js.

// Copia de normMarca() de OTModule.jsx (no está exportada de ahí) — mismo
// criterio de normalización para que "CA_1" calce con "ca-1" o "CA 1".
export function normMarcaTaller(s) {
  return String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_-]+/g, '-')
}

export const ETAPAS_TALLER = ['dimensionado', 'armado', 'soldado', 'liberado']
export const ETAPA_LABEL = { dimensionado: 'Dimensionado', armado: 'Armado', soldado: 'Soldado', liberado: 'Liberado' }

// Estado derivado de una parte — nunca se guarda, se calcula siempre a
// partir de los conteos reales de avance (mismo espíritu que
// calcularFilasTrazabilidad de OTModule.jsx: una sola fuente de datos).
export function estadoDeParte(parte) {
  const av = parte.avance || {}
  const cant = Number(parte.cantidad) || 0
  const liberado = Number(av.liberado) || 0
  const soldado = Number(av.soldado) || 0
  const armado = Number(av.armado) || 0
  const dimensionado = Number(av.dimensionado) || 0
  if (cant > 0 && liberado >= cant) return { label: 'Liberado', color: '#1B9E5D' }
  if (liberado > 0) return { label: `Liberado ${liberado}/${cant}`, color: '#1B9E5D' }
  if (soldado > 0) return { label: `Soldado ${soldado}/${cant}`, color: '#0E7A8F' }
  if (armado > 0) return { label: `Armado ${armado}/${cant}`, color: '#D9600A' }
  if (dimensionado > 0) return { label: `Dimensionado ${dimensionado}/${cant}`, color: '#5A6B85' }
  return { label: 'Sin iniciar', color: '#9AA3AD' }
}

// Etapa "gruesa" alcanzada por una parte — usada solo para el filtro por
// estado (un select no puede filtrar por el label detallado de
// estadoDeParte, que trae conteos embebidos y es distinto por fila).
export function etapaBucket(parte) {
  const av = parte.avance || {}
  const cant = Number(parte.cantidad) || 0
  if (cant > 0 && (Number(av.liberado) || 0) >= cant) return 'liberado'
  if ((Number(av.liberado) || 0) > 0) return 'liberado'
  if ((Number(av.soldado) || 0) > 0) return 'soldado'
  if ((Number(av.armado) || 0) > 0) return 'armado'
  if ((Number(av.dimensionado) || 0) > 0) return 'dimensionado'
  return 'sin_iniciar'
}
export const ETAPA_BUCKET_LABEL = { sin_iniciar: 'Sin iniciar', dimensionado: 'Dimensionado', armado: 'Armado', soldado: 'Soldado', liberado: 'Liberado' }

// Replica lo que necesita el tablero: piezas totales/liberadas, kg
// totales/liberados (el peso unitario del Listado de Partes se aprovecha
// gratis para reportar avance en kilos, muy usado en fabricación
// estructural).
export function resumenTableroTaller(partes) {
  const piezasTotales = partes.reduce((a, p) => a + (Number(p.cantidad) || 0), 0)
  const piezasLiberadas = partes.reduce((a, p) => a + Math.min(Number(p.avance?.liberado) || 0, Number(p.cantidad) || 0), 0)
  const kgTotales = partes.reduce((a, p) => a + (Number(p.cantidad) || 0) * (Number(p.pesoUnitario) || 0), 0)
  const kgLiberados = partes.reduce((a, p) => a + Math.min(Number(p.avance?.liberado) || 0, Number(p.cantidad) || 0) * (Number(p.pesoUnitario) || 0), 0)
  return { piezasTotales, piezasLiberadas, kgTotales, kgLiberados }
}
