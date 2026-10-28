// ============================================================
// Escrituras a Supabase que NO pueden fallar en silencio.
// ============================================================
// supabase-js no lanza excepción cuando una consulta falla: devuelve
// { data, error } y sigue. Un `await supabase.from(...).update(...)` dentro
// de un try/catch nunca entra al catch aunque la base haya rechazado el
// cambio (permiso, columna inexistente, red). Auditoría 2026-10-27, C-1:
// 19 sitios asumían lo contrario y la app mostraba «guardado» sin guardar.
// `ejecutar()` convierte ese error en una excepción con un texto legible,
// para que el catch de quien llama sí lo vea y pueda avisar.
export async function ejecutar(consulta, que) {
  const { data, error } = await consulta
  if (error) throw new Error((que ? que + ': ' : '') + (error.message || String(error)))
  return data
}

// Variante para avisar al usuario y seguir: devuelve true si se guardó.
export async function intentar(consulta, que, avisar = m => window.alert(m)) {
  try { await ejecutar(consulta, que); return true } catch (e) { avisar('No se pudo guardar. ' + (e && e.message ? e.message : String(e))); return false }
}
