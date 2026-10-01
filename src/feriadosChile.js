// ============================================================
// Feriados legales de Chile — para pintar los calendarios de
// Asistencia/Horas extra en ManoObraModule.jsx.
// Se consultan en línea (Nager.Date, API pública sin key, con CORS
// abierto) y se guardan en localStorage por 30 días para no pegarle a
// la API en cada apertura del módulo. Si la consulta falla (sin
// internet, la API cae, etc.) se usa FERIADOS_FALLBACK, una lista
// aproximada escrita a mano — sirve para no dejar el calendario sin
// nada, pero la fuente real es siempre la API.
// ============================================================

const CACHE_DIAS = 30

// Aproximado — algunos feriados (Pascua, San Pedro y San Pablo cuando
// se corre al lunes más cercano, Encuentro de Dos Mundos) pueden variar
// un poco respecto al calendario oficial del año. Solo se usa si la
// API no responde.
export const FERIADOS_FALLBACK = {
  2025: [
    { fecha: '2025-01-01', nombre: 'Año Nuevo' },
    { fecha: '2025-04-18', nombre: 'Viernes Santo' },
    { fecha: '2025-04-19', nombre: 'Sábado Santo' },
    { fecha: '2025-05-01', nombre: 'Día del Trabajo' },
    { fecha: '2025-05-21', nombre: 'Día de las Glorias Navales' },
    { fecha: '2025-06-29', nombre: 'San Pedro y San Pablo' },
    { fecha: '2025-07-16', nombre: 'Virgen del Carmen' },
    { fecha: '2025-08-15', nombre: 'Asunción de la Virgen' },
    { fecha: '2025-09-18', nombre: 'Fiestas Patrias' },
    { fecha: '2025-09-19', nombre: 'Glorias del Ejército' },
    { fecha: '2025-10-12', nombre: 'Encuentro de Dos Mundos' },
    { fecha: '2025-10-31', nombre: 'Día de las Iglesias Evangélicas' },
    { fecha: '2025-11-01', nombre: 'Día de Todos los Santos' },
    { fecha: '2025-12-08', nombre: 'Inmaculada Concepción' },
    { fecha: '2025-12-25', nombre: 'Navidad' },
  ],
  2026: [
    { fecha: '2026-01-01', nombre: 'Año Nuevo' },
    { fecha: '2026-04-03', nombre: 'Viernes Santo' },
    { fecha: '2026-04-04', nombre: 'Sábado Santo' },
    { fecha: '2026-05-01', nombre: 'Día del Trabajo' },
    { fecha: '2026-05-21', nombre: 'Día de las Glorias Navales' },
    { fecha: '2026-06-29', nombre: 'San Pedro y San Pablo' },
    { fecha: '2026-07-16', nombre: 'Virgen del Carmen' },
    { fecha: '2026-08-15', nombre: 'Asunción de la Virgen' },
    { fecha: '2026-09-18', nombre: 'Fiestas Patrias' },
    { fecha: '2026-09-19', nombre: 'Glorias del Ejército' },
    { fecha: '2026-10-12', nombre: 'Encuentro de Dos Mundos' },
    { fecha: '2026-10-31', nombre: 'Día de las Iglesias Evangélicas' },
    { fecha: '2026-11-01', nombre: 'Día de Todos los Santos' },
    { fecha: '2026-12-08', nombre: 'Inmaculada Concepción' },
    { fecha: '2026-12-25', nombre: 'Navidad' },
  ],
  2027: [
    { fecha: '2027-01-01', nombre: 'Año Nuevo' },
    { fecha: '2027-03-26', nombre: 'Viernes Santo' },
    { fecha: '2027-03-27', nombre: 'Sábado Santo' },
    { fecha: '2027-05-01', nombre: 'Día del Trabajo' },
    { fecha: '2027-05-21', nombre: 'Día de las Glorias Navales' },
    { fecha: '2027-06-29', nombre: 'San Pedro y San Pablo' },
    { fecha: '2027-07-16', nombre: 'Virgen del Carmen' },
    { fecha: '2027-08-15', nombre: 'Asunción de la Virgen' },
    { fecha: '2027-09-18', nombre: 'Fiestas Patrias' },
    { fecha: '2027-09-19', nombre: 'Glorias del Ejército' },
    { fecha: '2027-10-12', nombre: 'Encuentro de Dos Mundos' },
    { fecha: '2027-10-31', nombre: 'Día de las Iglesias Evangélicas' },
    { fecha: '2027-11-01', nombre: 'Día de Todos los Santos' },
    { fecha: '2027-12-08', nombre: 'Inmaculada Concepción' },
    { fecha: '2027-12-25', nombre: 'Navidad' },
  ],
}

export async function obtenerFeriadosChile(anio) {
  const claveCache = `feriados_cl_${anio}`
  try {
    const cacheado = JSON.parse(localStorage.getItem(claveCache) || 'null')
    if (cacheado && cacheado.obtenidoEn && (Date.now() - cacheado.obtenidoEn) < CACHE_DIAS * 24 * 60 * 60 * 1000) {
      return cacheado.feriados
    }
  } catch (e) {}

  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${anio}/CL`)
    if (!res.ok) throw new Error('respuesta no ok')
    const datos = await res.json()
    const feriados = datos.map(f => ({ fecha: f.date, nombre: f.localName || f.name }))
    try { localStorage.setItem(claveCache, JSON.stringify({ obtenidoEn: Date.now(), feriados })) } catch (e) {}
    return feriados
  } catch (e) {
    return FERIADOS_FALLBACK[anio] || []
  }
}
