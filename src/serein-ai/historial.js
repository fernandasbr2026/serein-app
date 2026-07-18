// ============================================================
// Serein AI - HISTORIAL + AUDITORIA  (Supabase, tolerante a fallos)
// ------------------------------------------------------------
// Persiste conversaciones, mensajes y auditoria por usuario (RLS:
// cada quien ve SOLO lo suyo). Si las tablas aun no existen o hay
// error de red, degrada con gracia: el chat sigue funcionando en
// memoria y nada se rompe. Nunca lanza excepciones a la UI.
// ============================================================

import { supabase } from '../supabase.js'

let _disponible = null // cache: true/false si las tablas existen

export async function historialDisponible() {
  if (_disponible !== null) return _disponible
  try {
    const { error } = await supabase.from('ai_conversaciones').select('id').limit(1)
    _disponible = !error
  } catch (e) { _disponible = false }
  return _disponible
}

export async function crearConversacion(titulo) {
  try {
    const { data, error } = await supabase.from('ai_conversaciones')
      .insert({ titulo: (titulo || 'Conversacion').slice(0, 120) }).select('id').single()
    if (error) return null
    return data?.id || null
  } catch (e) { return null }
}

export async function listarConversaciones() {
  try {
    const { data, error } = await supabase.from('ai_conversaciones')
      .select('id, titulo, updated_at').order('updated_at', { ascending: false }).limit(30)
    if (error) return []
    return data || []
  } catch (e) { return [] }
}

export async function cargarMensajes(conversacionId) {
  if (!conversacionId) return []
  try {
    const { data, error } = await supabase.from('ai_mensajes')
      .select('rol, texto, intent, fuentes, created_at')
      .eq('conversacion_id', conversacionId).order('created_at', { ascending: true })
    if (error) return []
    return data || []
  } catch (e) { return [] }
}

export async function guardarMensaje(conversacionId, rol, texto, extra) {
  if (!conversacionId) return
  try {
    await supabase.from('ai_mensajes').insert({
      conversacion_id: conversacionId, rol, texto,
      intent: extra?.intent || null, fuentes: extra?.fuentes || null,
    })
    await supabase.from('ai_conversaciones').update({ updated_at: new Date().toISOString() }).eq('id', conversacionId)
  } catch (e) { /* silencioso */ }
}

// Registra la trazabilidad tecnica de cada consulta (aunque se cierre el chat).
export async function registrarAuditoria(reg) {
  try {
    await supabase.from('ai_auditoria').insert({
      email: reg.email || null,
      rol: reg.rol || null,
      pregunta: reg.pregunta || null,
      intent: reg.intent || null,
      herramienta: reg.herramienta || null,
      modulos_consultados: reg.modulos_consultados || null,
      registros_consultados: reg.registros_consultados || null,
      permisos_aplicados: reg.permisos_aplicados || null,
      ok: reg.ok !== false,
      error: reg.error || null,
      duracion_ms: reg.duracion_ms || null,
      modelo: reg.modelo || 'reglas',
    })
  } catch (e) { /* silencioso */ }
}
