// Módulo Avance de Obra · acceso a la base. Todo vive en el esquema `avance`
// de Supabase (tablas propias con seguridad por fila; ver
// supabase/migrations/2026-11-17-modulo-avance-esquema.sql). Nada de esto
// pasa por app_state ni por sync.js: si el módulo se apaga, el resto del ERP
// no lo nota.
import { supabase } from '../supabase.js'

const av = () => supabase.schema('avance')

// Mensaje entendible cuando la base todavía no tiene el esquema (migración
// sin correr o esquema no expuesto en Settings → API).
export function errorLegible(e) {
  const m = (e && e.message) || String(e || '')
  if (/schema|avance|PGRST106|PGRST205|relation .* does not exist/i.test(m)) {
    return 'El módulo de avance todavía no está habilitado en la base de datos: falta correr la migración «2026-11-17-modulo-avance-esquema.sql» en Supabase y agregar el esquema «avance» en Settings → API → Exposed schemas. Detalle: ' + m
  }
  return m
}

const sel = async q => { const { data, error } = await q; if (error) throw error; return data || [] }

export const listarOts = () => sel(av().from('ots').select('*').order('creado_en', { ascending: false }))

export async function cargarOT(id) {
  const [ots, procesos, partidas, libro, aprobaciones, partes, documentos, alertas, miembros, liberaciones, edp, registros] = await Promise.all([
    sel(av().from('ots').select('*').eq('id', id)),
    sel(av().from('procesos').select('*').eq('ot_id', id).order('orden')),
    sel(av().from('partidas').select('*').eq('ot_id', id)),
    sel(av().from('libro_obra').select('*').eq('ot_id', id).order('fecha', { ascending: false })),
    sel(av().from('aprobaciones').select('*, libro_obra!inner(ot_id, titulo, fecha, interno)').eq('libro_obra.ot_id', id)),
    sel(av().from('partes_diarios').select('*').eq('ot_id', id).order('fecha', { ascending: false }).limit(300)),
    sel(av().from('documentos').select('*').eq('ot_id', id).order('orden')),
    sel(av().from('alertas').select('*').eq('ot_id', id).order('creado_en', { ascending: false }).limit(60)),
    sel(av().from('miembros').select('*').eq('ot_id', id)),
    sel(av().from('liberaciones').select('*, procesos!inner(ot_id, codigo)').eq('procesos.ot_id', id)),
    sel(av().from('edp').select('*').eq('ot_id', id).order('numero')),
    sel(av().from('registros').select('*').eq('ot_id', id).order('fecha', { ascending: false }).limit(200)),
  ])
  return { ot: ots[0] || null, procesos, partidas, libro, aprobaciones, partes, documentos, alertas, miembros, liberaciones, edp, registros }
}

export async function crearOT(datos) {
  const { data, error } = await av().rpc('crear_ot', { datos })
  if (error) throw error
  return data
}

const upd = async (tabla, id, cambios) => { const { error } = await av().from(tabla).update(cambios).eq('id', id); if (error) throw error }
const ins = async (tabla, fila) => { const { data, error } = await av().from(tabla).insert(fila).select().single(); if (error) throw error; return data }

export const actualizarOT = (id, cambios) => upd('ots', id, cambios)
export const guardarProceso = (id, cambios) => upd('procesos', id, cambios)
export const guardarPartida = (id, cambios) => upd('partidas', id, cambios)
// El disparador de la base valida el parte (cantidad > 0, no pasar del total,
// no superar al predecesor) y actualiza el avance del proceso.
export const registrarParte = parte => ins('partes_diarios', parte)
export async function registrarEvento(ev, aprobacion) {
  const fila = await ins('libro_obra', ev)
  if (aprobacion) await ins('aprobaciones', { evento_id: fila.id, clase: aprobacion.clase || 'Aprobación', vence: aprobacion.vence || null })
  return fila
}
export const responderAprobacion = (aprobacion_id, user_id, accion, comentario) => ins('aprobacion_respuestas', { aprobacion_id, user_id, accion, comentario: comentario || null })
export async function fijarLiberacion(proceso_id, tipo, cambios) {
  const { error } = await av().from('liberaciones').upsert({ proceso_id, tipo, ...cambios, actualizado_en: new Date().toISOString() }, { onConflict: 'proceso_id,tipo' })
  if (error) throw error
}
export const agregarDocumento = doc => ins('documentos', doc)
export const borrarDocumento = async id => { const { error } = await av().from('documentos').delete().eq('id', id); if (error) throw error }
export const marcarAlertaLeida = id => upd('alertas', id, { leida: true })
export const crearAlerta = a => ins('alertas', a)
export const crearEDP = e => ins('edp', e)
export const actualizarEDP = (id, cambios) => upd('edp', id, cambios)
export async function fijarMiembro(p_ot, p_user, p_rol) { const { error } = await av().rpc('fijar_miembro', { p_ot, p_user, p_rol }); if (error) throw error }
export const listarPerfilesInternos = () => sel(supabase.from('perfiles').select('id, nombre, tipo').order('nombre'))
export const usuarioActual = async () => { const { data } = await supabase.auth.getUser(); return data?.user || null }
