// ============================================================
// Serein AI · Capa de PERMISOS  (modulo puro, sin UI ni red)
// ------------------------------------------------------------
// Deriva, a partir del perfil autenticado (tabla `perfiles`) y el
// email, QUE modulos y QUE areas puede ver el usuario. Es un
// ESPEJO EXACTO de la logica de src/Dashboard.jsx para no divergir.
// Si cambian los permisos en Dashboard.jsx, actualizar tambien aqui.
//
// Serein AI SOLO analiza y muestra informacion que el usuario ya
// esta autorizado a ver. La validacion se aplica en cada tool
// ANTES de leer datos (control real, no solo ocultar botones).
// ============================================================

export const AREAS_NEGOCIO = ['Santa Rosa', 'Istria', 'Proyectos']

// Mapa email -> area (mismo criterio que Dashboard.jsx)
const EMAIL_AREA = {
  'joce@sereinspa.com': 'Santa Rosa',
  'jose@sereinspa.com': 'Santa Rosa',
  'produccion@sereinspa.com': 'Istria',
  'mario@sereinspa.com': 'Proyectos',
}

export function derivarContexto(perfil = {}, email = '') {
  const areasUsuario = Array.isArray(perfil.areas) ? perfil.areas : []
  const modulosPerfil = Array.isArray(perfil.modulos) ? perfil.modulos : null
  const sinValores = Array.isArray(perfil.sin_valores) ? perfil.sin_valores : []
  const esSupervisor = perfil.tipo === 'supervisor'
  const esGerencia = areasUsuario.length > 1 && !esSupervisor
  const _email = (email || '').toLowerCase()
  const areaPorEmail = EMAIL_AREA[_email] || null
  const veTodasLasOT = esGerencia || _email === 'caro@sereinspa.com'

  const areasVisibles = veTodasLasOT
    ? [...AREAS_NEGOCIO]
    : [...new Set([
        ...areasUsuario.filter(a => AREAS_NEGOCIO.includes(a)),
        ...(areaPorEmail ? [areaPorEmail] : []),
      ])]

  const verValoresOT = (esGerencia || ['caro@sereinspa.com', 'mario@sereinspa.com'].includes(_email))
    && !sinValores.includes('GESTION_OT')

  return {
    nombre: perfil.nombre || email || 'usuario',
    rol: perfil.rol || (esGerencia ? 'Gerencia' : esSupervisor ? 'Supervisor' : 'Usuario'),
    email: _email,
    esGerencia,
    esSupervisor,
    areasVisibles,
    modulosPerfil,
    sinValores,
    verValoresOT,
  }
}

// Misma regla que Dashboard.puedeVer: si el perfil trae lista de
// modulos se respeta; si no, solo Gerencia.
export function puedeVer(ctx, code) {
  if (!ctx) return false
  if (ctx.modulosPerfil) return ctx.modulosPerfil.includes(code)
  return !!ctx.esGerencia
}

export function puedeVerArea(ctx, area) {
  if (!ctx) return false
  if (!area) return true
  return ctx.areasVisibles.includes(area)
}

export const MSG_SIN_PERMISO = 'No tienes permisos para consultar esta informacion. Puedes solicitar acceso al administrador.'
