// Condiciones comerciales estándar de las cotizaciones. Archivo sin imports para
// que lo usen tanto el módulo de Cotizaciones como Parámetros sin ciclos.
export const CONDICIONES_DEF = [
  { t: 'Alcance y horario de ejecución', x: 'los valores corresponden a trabajos realizados en horario normal y días hábiles.' },
  { t: 'Trabajos fuera de horario regular', x: 'se aplicará recargo por horas extraordinarias y disponibilidad, informado previamente.' },
  { t: 'Condición del material recepcionado', x: 'valores válidos para material nuevo y libre de contaminantes (aceites, grasas, lacas, etc.). Si no cumple, se debe informar para revalorizar.' },
  { t: 'Superficie mínima a cobrar', x: 'piezas menores a 1 m² se valorizan como 1 m². Esquemas de pintura: cobro mínimo 18 m² (por compra mínima de pintura).' },
  { t: 'Piezas especiales y complejidad', x: 'elementos no estándar se valorizan según complejidad (peso/masa, geometría, dimensiones, manipulación, puntos de izaje, protección o preparación adicional).' },
  { t: 'Cálculo de cubicación', x: 'Parrillas estándar: A×B×2 + 30%. Parrillas especiales: desarrollo + 40%. Barandas: A×B + 40%. Enrejados/cerchas/reticulado: desarrollo + 30%. Cañerías hasta 3": +15%.' },
  { t: 'Exclusiones del servicio', x: 'no se consideran trabajos adicionales como mecánicos, enmasillados, silicona, tapas, etiquetado, u otros no mencionados en la cotización.' },
  { t: 'Plazo de retiro y bodegaje', x: 'el material puede permanecer en planta máx. 7 días terminado el proceso. Luego: bodegaje 2 UF/día.' },
  { t: 'Entrega y condiciones de carga', x: 'SEREIN entrega el material puesto sobre camión. Capacidad grúa: 7 toneladas (sobre eso, corre por cuenta del cliente).' },
  { t: 'Responsabilidad del cliente para carguío', x: 'el cliente debe contar con eslingas, maderas, cartón y elementos para carguío. Si se requiere embalaje, tiene costo adicional y debe solicitarse con 48 hrs de anticipación.' },
  { t: 'Orden de Compra (OC)', x: 'es obligatorio el envío de la OC para iniciar producción.' },
]

// Datos bancarios por defecto (se pueden cambiar en Parámetros → Datos empresa)
export const BANCO_DEF = { banco: 'Banco de Chile', cuentaCorriente: '532147409' }
