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
  const [ots, procesos, partidas, libro, aprobaciones, partes, documentos, alertas, miembros, liberaciones, edp, registros, propuestas] = await Promise.all([
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
    sel(av().from('propuestas').select('*').eq('ot_id', id).eq('estado', 'pend').order('creado_en', { ascending: false }).limit(200)).catch(() => []),
  ])
  return { ot: ots[0] || null, procesos, partidas, libro, aprobaciones, partes, documentos, alertas, miembros, liberaciones, edp, registros, propuestas }
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

/* ---------- Fase 2: propuestas («el sistema propone, tú confirmas») ---------- */
export const listarPropuestas = (ot_id, estado = 'pend') => sel(av().from('propuestas').select('*').eq('ot_id', ot_id).eq('estado', estado).order('creado_en', { ascending: false }).limit(200))
export async function aplicarPropuesta(p_id, p_datos) { const { error } = await av().rpc('aplicar_propuesta', p_datos ? { p_id, p_datos } : { p_id }); if (error) throw error }
export async function descartarPropuesta(p_id) { const { error } = await av().rpc('descartar_propuesta', { p_id }); if (error) throw error }
export const listarLecturas = ot_id => sel(av().from('lecturas').select('*').eq('ot_id', ot_id).order('inicio', { ascending: false }).limit(10))
// Llama a la función de servidor que relee Drive y correos y deja propuestas.
export async function actualizarProyecto(ot_id) {
  const { data, error } = await supabase.functions.invoke('avance-actualizar', { body: { ot_id } })
  if (error) throw new Error(error.message || String(error))
  if (!data || data.ok === false) throw new Error((data && data.error) || 'La función no respondió')
  return data
}
// Tiempo real: avisa cuando cambia cualquier tabla del módulo para esta OT.
export function escucharOT(ot_id, onCambio) {
  const canal = supabase.channel('avance-' + ot_id)
  for (const t of ['procesos', 'libro_obra', 'aprobaciones', 'alertas', 'partes_diarios', 'propuestas', 'documentos', 'liberaciones', 'edp', 'ots']) {
    canal.on('postgres_changes', { event: '*', schema: 'avance', table: t }, () => onCambio(t))
  }
  canal.subscribe()
  return () => { try { supabase.removeChannel(canal) } catch (e) {} }
}

/* ---------- Fase 3: acceso del cliente ---------- */
export async function invitarCliente(body) {
  const { data, error } = await supabase.functions.invoke('avance-invitar-cliente', { body })
  if (error) throw new Error(error.message || String(error))
  if (!data || data.ok === false) throw new Error((data && data.error) || 'La función no respondió')
  return data
}
export async function claveCambiada() { const { error } = await av().rpc('clave_cambiada'); if (error) throw error }
export const miMembresia = async () => { const u = await usuarioActual(); if (!u) return []; return sel(av().from('miembros').select('*').eq('user_id', u.id)) }

// Manda por correo las alertas pendientes (crítico/aviso) y crea las alertas diarias de aprobaciones vencidas.
export async function enviarAlertasCorreo() {
  const { data, error } = await supabase.functions.invoke('avance-alertas-correo', { body: {} })
  if (error) throw new Error(error.message || String(error))
  if (!data || data.ok === false) throw new Error((data && data.error) || (data && data.errores && data.errores.join(' · ')) || 'La función no respondió')
  return data
}

/* ---------- Fase 5: chat maestro ---------- */
// Pregunta sobre la OT (o pedido de cambio) a la función de servidor; los cambios vuelven como propuestas.
export async function chatMaestro(ot_id, pregunta, historial = [], resumen = null) {
  const { data, error } = await supabase.functions.invoke('avance-chat', { body: { ot_id, pregunta, historial, resumen } })
  if (error) throw new Error(error.message || String(error))
  if (!data || data.ok === false) throw new Error((data && data.error) || 'La función no respondió')
  return data
}

/* ---------- Fase 6: modelo IFC ---------- */
const BUCKET_MODELOS = 'avance-modelos'
// Sube el IFC de la OT (reemplaza el anterior) y lo anota en la ficha de la OT.
export async function subirIFC(ot_id, archivo) {
  const ruta = ot_id + '/modelo.ifc'
  const { error } = await supabase.storage.from(BUCKET_MODELOS).upload(ruta, archivo, { upsert: true, contentType: 'application/octet-stream' })
  if (error) throw error
  await actualizarOT(ot_id, { ifc_path: ruta, ifc_nombre: archivo.name || 'modelo.ifc', ifc_subido_en: new Date().toISOString() })
  return ruta
}
export async function descargarIFC(ruta) {
  const { data, error } = await supabase.storage.from(BUCKET_MODELOS).download(ruta)
  if (error) throw error
  return await data.arrayBuffer()
}
export async function quitarIFC(ot_id, ruta) {
  if (ruta) { const { error } = await supabase.storage.from(BUCKET_MODELOS).remove([ruta]); if (error) throw error }
  await actualizarOT(ot_id, { ifc_path: null, ifc_nombre: null, ifc_subido_en: null })
}
