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

export async function cargarCampanas() {
  const { data, error } = await supabase.from('crm_campanas').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
export async function crearCampana(campana) {
  const { data, error } = await supabase.from('crm_campanas').insert(campana).select().single()
  if (error) throw error
  return data
}
export async function actualizarCampana(id, cambios) {
  const { error } = await supabase.from('crm_campanas').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
export async function eliminarCampana(id) {
  const { error } = await supabase.from('crm_campanas').delete().eq('id', id)
  if (error) throw error
}

// RUTs se escriben distinto en el CRM (carga manual) y en libro_ventas
// (importado desde Excel), así que se normalizan antes de comparar.
export const normalizarRut = rut => (rut || '').toUpperCase().replace(/[.\-\s]/g, '')

// Mapa rut normalizado -> fecha de la última factura emitida (para
// detectar clientes que llevan tiempo sin comprar). Trae solo las
// columnas necesarias y reduce en el cliente: no hay agregación en
// Supabase sin una función RPC, y el volumen de libro_ventas es bajo.
export async function cargarUltimasFacturasPorRut() {
  const { data, error } = await supabase
    .from('libro_ventas')
    .select('client_rut, emission_date')
    .eq('oculto', false)
  if (error) throw error
  const m = {}
  for (const f of (data || [])) {
    const rut = normalizarRut(f.client_rut)
    if (!rut || !f.emission_date) continue
    if (!m[rut] || f.emission_date > m[rut]) m[rut] = f.emission_date
  }
  return m
}
