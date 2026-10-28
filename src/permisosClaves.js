// ============================================================
// Qué claves de app_state puede ver (y escribir) cada perfil.
// ============================================================
// Es el ESPEJO exacto de la función SQL public.puede_leer_app_state(clave)
// (supabase/migrations/2026-10-28-seguridad-roles.sql). La base es la que
// manda: si acá se deja pasar algo que la base niega, la subida simplemente
// no se confirma. Pero el frontend necesita saberlo igual, para no intentar
// subir claves que el perfil no puede escribir (si lo hiciera, Supabase
// filtraría esas filas en silencio y la app creería que falló TODO el
// guardado, bloqueando al usuario con la protección de 30 minutos).
//
// Reglas (auditoría 2026-10-27, hallazgo S-1):
//  - externos (subcontrato, taller_externo): nada de app_state.
//  - gerencia / admin: todo.
//  - el resto: las claves operativas siempre; las claves con dinero solo si
//    el perfil tiene algún módulo financiero/comercial en `modulos`.
// Las claves operativas (OT, asistencia, compras operativas, avances,
// contactos, parámetros) TAMBIÉN contienen montos (ventas y costos dentro
// de cada OT, sueldos dentro de la nómina): eso solo se resuelve cuando
// esos datos pasen a tablas reales con RLS por fila. Queda documentado.

export const CLAVES_OPERATIVAS = new Set([
  'serein_ots', 'serein_mo', 'serein_avances', 'serein_comprasOp', 'serein_comprasAreas', 'serein_configCompras',
  'serein_contactos', 'serein_params', 'serein_logo', 'serein_logoIstria', 'serein_tiposCustom', 'serein_ver',
  'serein_areaSel', 'serein_mapeosExcel', 'serein_ai', 'serein_lapidas',
])

// Si el perfil tiene cualquiera de estos módulos, ve también las claves con dinero
export const MODULOS_FINANCIEROS = [
  'TODAS', 'Santa Rosa', 'Istria', 'GESTION_PROYECTOS', 'ORDENES_COMPRA', 'PAGOS', 'LIBRO_COMPRAS', 'LIBRO_VENTAS',
  'COTIZADOR', 'CLIENTES', 'INVENTARIO', 'FINANZAS', 'CREDITO', 'CRM', 'REVISION_CONTABLE', 'CARTOLAS_BANCARIAS',
]

export const EXTERNOS = ['subcontrato', 'taller_externo']

export function perfilFinanciero(perfil) {
  if (!perfil) return false
  const tipo = String(perfil.tipo || '')
  if (EXTERNOS.includes(tipo)) return false
  if (tipo === 'gerencia' || tipo === 'admin') return true
  const mods = JSON.stringify(perfil.modulos || [])
  return MODULOS_FINANCIEROS.some(m => mods.includes('"' + m + '"'))
}

export function claveVisible(perfil, clave) {
  if (!perfil) return false
  const tipo = String(perfil.tipo || '')
  if (EXTERNOS.includes(tipo)) return false
  if (tipo === 'gerencia' || tipo === 'admin') return true
  if (CLAVES_OPERATIVAS.has(clave) || clave.startsWith('__serein_') || clave.startsWith('cotizador_')) return true
  return perfilFinanciero(perfil)
}
