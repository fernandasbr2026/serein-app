// ============================================================
// CRM — capa API (Supabase)
// ------------------------------------------------------------
// clientes: leads + clientes en UNA sola tabla (campo `etapa`).
// crm_contactos_persona / crm_interacciones / crm_oportunidades:
// datos nuevos, sin equivalente previo en la app.
// ============================================================

import { supabase } from './supabase.js'

export async function cargarClientes() {
  const { data, error } = await supabase.from('clientes').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function crearCliente(cliente) {
  const { data, error } = await supabase.from('clientes').insert(cliente).select().single()
  if (error) throw error
  return data
}

export async function actualizarCliente(id, cambios) {
  const { error } = await supabase.from('clientes').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function cargarPersonas(clienteId) {
  const { data, error } = await supabase.from('crm_contactos_persona').select('*').eq('cliente_id', clienteId).order('es_principal', { ascending: false })
  if (error) throw error
  return data || []
}
export async function crearPersona(persona) {
  const { data, error } = await supabase.from('crm_contactos_persona').insert(persona).select().single()
  if (error) throw error
  return data
}
export async function eliminarPersona(id) {
  const { error } = await supabase.from('crm_contactos_persona').delete().eq('id', id)
  if (error) throw error
}

export async function cargarInteracciones(clienteId) {
  const { data, error } = await supabase.from('crm_interacciones').select('*').eq('cliente_id', clienteId).order('fecha', { ascending: false })
  if (error) throw error
  return data || []
}
export async function crearInteraccion(interaccion) {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('crm_interacciones').insert({ ...interaccion, autor: (userData && userData.user && userData.user.id) || null }).select().single()
  if (error) throw error
  return data
}
export async function eliminarInteraccion(id) {
  const { error } = await supabase.from('crm_interacciones').delete().eq('id', id)
  if (error) throw error
}

export async function cargarOportunidades(clienteId) {
  const { data, error } = await supabase.from('crm_oportunidades').select('*').eq('cliente_id', clienteId).order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
export async function crearOportunidad(op) {
  const { data, error } = await supabase.from('crm_oportunidades').insert(op).select().single()
  if (error) throw error
  return data
}
export async function actualizarOportunidad(id, cambios) {
  const { error } = await supabase.from('crm_oportunidades').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
export async function eliminarOportunidad(id) {
  const { error } = await supabase.from('crm_oportunidades').delete().eq('id', id)
  if (error) throw error
}
