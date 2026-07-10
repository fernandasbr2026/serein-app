import { supabase } from './supabase.js'

const KEY_RE = /^(serein_|__serein_|cotizador_)/
let lastPushed = {}

export async function pullState() {
  try {
    const { data, error } = await supabase.from('app_state').select('id, value')
    if (error || !data) return { ok: false, n: 0 }
    let n = 0
    data.forEach(row => { if (row.id && row.value != null) { try { localStorage.setItem(row.id, row.value); lastPushed[row.id] = row.value; n++ } catch (e) {} } })
    return { ok: true, n }
  } catch (e) { return { ok: false, n: 0 } }
}

let ocupado = false
export async function pushState() {
  if (ocupado) return { ok: false }
  ocupado = true
  try {
    const rows = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && KEY_RE.test(k)) { const v = localStorage.getItem(k); if (v !== lastPushed[k]) rows.push({ id: k, value: v, updated_at: new Date().toISOString() }) }
    }
    if (rows.length) { const { error } = await supabase.from('app_state').upsert(rows, { onConflict: 'id' }); if (error) return { ok: false }; rows.forEach(r => { lastPushed[r.id] = r.value }) }
    return { ok: true, n: rows.length }
  } catch (e) { return { ok: false } } finally { ocupado = false }
}
