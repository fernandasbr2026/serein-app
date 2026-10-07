// Condiciones comerciales estándar de las cotizaciones. Archivo sin imports para
// que lo usen tanto el módulo de Cotizaciones como Parámetros sin ciclos.
export const CONDICIONES_DEF = [
  { t: 'Cubicación', x: 'superficie calculada según listado del cliente; se verifica y rectifica una vez recibido el material en planta, manteniendo el valor unitario.' },
  { t: 'Alcance y horario de ejecución', x: 'los valores corresponden a trabajos realizados en horario normal y días hábiles.' },
  { t: 'Trabajos fuera de horario regular', x: 'se aplicará recargo por horas extraordinarias y disponibilidad, informado previamente.' },
  { t: 'Condición del material recepcionado', x: 'valores válidos para material nuevo y libre de contaminantes (aceites, grasas, lacas, etc.). Si no cumple, se informa para revalorizar.' },
  { t: 'Superficie mínima a cobrar', x: 'piezas menores a 1 m² se valorizan como 1 m². Esquemas de pintura: cobro mínimo 18 m² (por compra mínima de pintura).' },
  { t: 'Piezas especiales y complejidad', x: 'elementos no estándar se valorizan según complejidad (peso/masa, geometría, dimensiones, manipulación, puntos de izaje, protección o preparación adicional).' },
  { t: 'Exclusiones del servicio', x: 'no se consideran trabajos adicionales como mecánicos, enmasillados, silicona, tapas, etiquetado u otros no mencionados en la cotización.' },
  { t: 'Plazo de retiro y bodegaje', x: 'el material puede permanecer en planta hasta 7 días desde el término del proceso. Luego se aplica bodegaje de 2 UF/día.' },
  { t: 'Entrega y condiciones de carga', x: 'SEREIN entrega el material puesto sobre camión, sin embalaje; el cliente aporta eslingas, maderas, cartón y elementos de carguío. Capacidad de grúa: 7 toneladas.' },
  { t: 'Orden de Compra (OC)', x: 'es obligatorio el envío de la OC para iniciar producción.' },
]

// Datos bancarios por defecto (se pueden cambiar en Parámetros → Datos empresa)
export const BANCO_DEF = { banco: 'Banco de Chile', cuentaCorriente: '532147409' }
