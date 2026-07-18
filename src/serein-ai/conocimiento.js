// ============================================================
// Serein AI - BASE DE CONOCIMIENTO de procedimientos
// ------------------------------------------------------------
// Procedimientos de uso del sistema, versionados y administrables.
// El asistente SOLO usa procedimientos con estado 'activo'. Cada
// procedimiento declara el modulo/rol necesario para EJECUTARLO;
// el asistente puede explicarlo igual, pero avisa si el usuario no
// tiene permiso para crear registros (solo consulta).
//
// Esta lista es la semilla editable (Fase 1). En una fase siguiente
// puede migrarse a una tabla administrable en Supabase.
// ============================================================

export const PROCEDIMIENTOS = [
  {
    id: 'compra-ingresar',
    titulo: 'Como ingreso una compra',
    modulo: 'COMPRAS_OP',
    enlace: 'COMPRAS_OP',
    estado: 'activo',
    version: '1.0',
    fecha: '2026-07-18',
    responsable: 'Administracion',
    descripcion: 'Registrar una compra de materiales/servicios y asociarla a un area, OT o gasto general.',
    pasos: [
      'Ingresa al modulo Compras.',
      'Presiona "Nueva compra".',
      'Selecciona el proveedor.',
      'Registra el documento, fecha, neto, IVA y total.',
      'Asocia la compra a un area, OT o gasto general.',
      'Adjunta el respaldo y guarda.',
    ],
    keywords: ['compra', 'comprar', 'ingresar compra', 'nueva compra', 'factura de compra', 'proveedor', 'documento de compra'],
  },
  {
    id: 'ot-crear',
    titulo: 'Como creo una OT',
    modulo: 'GESTION_OT',
    enlace: 'GESTION_OT',
    estado: 'activo',
    version: '1.0',
    fecha: '2026-07-18',
    responsable: 'Operaciones',
    descripcion: 'Crear una Orden de Trabajo nueva en su area.',
    pasos: [
      'Ingresa al modulo Ordenes de Trabajo.',
      'Presiona "Nueva OT".',
      'Selecciona el area, el cliente y la cotizacion/OC asociada.',
      'Indica m2, preparacion superficial y esquema de pintura.',
      'Guarda: la OT queda en estado Cotizada / En ejecucion.',
    ],
    keywords: ['crear ot', 'nueva ot', 'orden de trabajo', 'abrir ot', 'ingresar ot'],
  },
  {
    id: 'produccion-avance',
    titulo: 'Como registro un avance de produccion',
    modulo: 'PRODUCCION',
    enlace: 'PRODUCCION',
    estado: 'activo',
    version: '1.0',
    fecha: '2026-07-18',
    responsable: 'Produccion',
    descripcion: 'Registrar el trabajo del dia por OT y proceso. Los m2 se calculan automaticamente.',
    pasos: [
      'Ingresa al modulo Produccion, pestana "Registrar avance".',
      'Selecciona la fecha y la planta.',
      'Toca la OT trabajada y marca el/los procesos realizados hoy (Granallado, Pintura, etc.).',
      'Agrega observaciones si corresponde y guarda.',
      'Los m2 del dia se calculan solos segun los dias trabajados por proceso.',
    ],
    keywords: ['avance', 'produccion', 'registrar avance', 'm2 del dia', 'pintado', 'granallado dia'],
  },
  {
    id: 'cotizacion-crear',
    titulo: 'Como creo una cotizacion',
    modulo: 'COTIZADOR',
    enlace: 'COTIZADOR',
    estado: 'activo',
    version: '1.0',
    fecha: '2026-07-18',
    responsable: 'Comercial',
    descripcion: 'Crear una cotizacion nueva para un cliente.',
    pasos: [
      'Ingresa al modulo Cotizaciones.',
      'Presiona "Nueva cotizacion" (el folio es correlativo automatico).',
      'Selecciona el cliente (se autocompletan RUT, giro y direccion).',
      'Agrega los items del servicio con cantidad y precio unitario.',
      'Revisa el total y guarda.',
    ],
    keywords: ['cotizacion', 'cotizar', 'nueva cotizacion', 'crear cotizacion', 'presupuesto'],
  },
  {
    id: 'oc-generar',
    titulo: 'Como genero una Orden de Compra',
    modulo: 'ORDENES_COMPRA',
    enlace: 'ORDENES_COMPRA',
    estado: 'activo',
    version: '1.0',
    fecha: '2026-07-18',
    responsable: 'Administracion',
    descripcion: 'Generar una Orden de Compra a un proveedor.',
    pasos: [
      'Ingresa al modulo Ordenes de Compra.',
      'Presiona "Nueva OC" (folio correlativo automatico).',
      'Selecciona el proveedor (se autocompletan RUT y direccion).',
      'Agrega los items, cantidades y precios.',
      'Asocia a la OT o area y guarda. Puedes descargar el PDF de la OC.',
    ],
    keywords: ['orden de compra', 'oc', 'generar oc', 'nueva oc', 'compra proveedor'],
  },
]

const _norm = s => (s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Busca el procedimiento activo mas relevante para la pregunta.
 * @returns {object|null} { ...procedimiento, score }
 */
export function buscarProcedimiento(pregunta) {
  const q = _norm(pregunta)
  if (!q) return null
  let mejor = null
  for (const p of PROCEDIMIENTOS) {
    if (p.estado !== 'activo') continue
    let score = 0
    for (const kw of p.keywords) {
      if (q.includes(_norm(kw))) score += kw.split(' ').length // frases valen mas
    }
    if (q.includes(_norm(p.titulo))) score += 3
    if (!mejor || score > mejor.score) mejor = score > 0 ? { ...p, score } : mejor
  }
  return mejor && mejor.score > 0 ? mejor : null
}
