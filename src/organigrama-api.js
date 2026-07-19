// ============================================================
// Organigrama Serein — capa API (Supabase)
// ------------------------------------------------------------
// Estructura: organigrama_persona / organigrama_flujo (lectura para
// cualquier autenticado, escritura solo Gerencia vía RLS).
// Costos: organigrama_costos (tabla separada, SOLO Gerencia lee/
// escribe — ni siquiera se intenta consultar si no hay permiso).
// ============================================================

import { supabase } from './supabase.js'

export async function cargarOrganigrama() {
  const [{ data: personas, error: e1 }, { data: flujo, error: e2 }] = await Promise.all([
    supabase.from('organigrama_persona').select('*').eq('activo', true).order('orden'),
    supabase.from('organigrama_flujo').select('*').order('orden'),
  ])
  if (e1) throw e1
  if (e2) throw e2
  return { personas: personas || [], flujo: flujo || [] }
}

// Se llama solo cuando el usuario activa la vista de costos (Gerencia).
// Si no tiene permiso, RLS devuelve simplemente 0 filas (no error) para
// organigrama_costos; valores_mo puede dar error de RLS, que se ignora.
export async function cargarCostos(personas) {
  const [{ data: costosManual }, { data: trabajadores }, { data: valores }] = await Promise.all([
    supabase.from('organigrama_costos').select('*'),
    supabase.from('trabajadores').select('id, nombre, cargo_id'),
    supabase.from('valores_mo').select('*').eq('activo', true),
  ])
  const manualPorPersona = Object.fromEntries((costosManual || []).map(c => [c.persona_id, c.costo_manual]))
  const valorPorTrabajador = {}
  for (const v of valores || []) {
    if (v.trabajador_id) valorPorTrabajador[v.trabajador_id] = v
  }
  const costoPorPersona = {}
  for (const p of personas) {
    if (p.trabajador_id && valorPorTrabajador[p.trabajador_id]) {
      costoPorPersona[p.id] = Number(valorPorTrabajador[p.trabajador_id].valor_diario || 0) * 30
    } else if (manualPorPersona[p.id] != null) {
      costoPorPersona[p.id] = Number(manualPorPersona[p.id])
    }
  }
  return costoPorPersona
}

export async function guardarCostoManual(personaId, costoManual) {
  const { error } = await supabase.from('organigrama_costos').upsert({ persona_id: personaId, costo_manual: costoManual, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function crearPersona(persona) {
  const { data, error } = await supabase.from('organigrama_persona').insert(persona).select().single()
  if (error) throw error
  return data
}

export async function actualizarPersona(id, cambios) {
  const { error } = await supabase.from('organigrama_persona').update(cambios).eq('id', id)
  if (error) throw error
}

// Baja lógica: nunca se borra de verdad, para no perder historial.
export async function eliminarPersona(id) {
  const { error } = await supabase.from('organigrama_persona').update({ activo: false }).eq('id', id)
  if (error) throw error
}

export async function reordenar(cambios) {
  // cambios: [{ id, orden }, ...]
  await Promise.all(cambios.map(c => supabase.from('organigrama_persona').update({ orden: c.orden }).eq('id', c.id)))
}
