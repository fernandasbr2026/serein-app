import React from 'react'

// Paginador reutilizable: muestra de a PAGE_SIZE registros
export const PAGE_SIZE = 15

export function paginar(lista, page) {
  const total = lista.length
  const paginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const p = Math.min(Math.max(1, page), paginas)
  return { items: lista.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE), page: p, paginas, total }
}

export default function Paginador({ page, paginas, total, setPage }) {
  if (paginas <= 1) return null
  const b = { background: '#fff', border: '1px solid #CBD2D6', padding: '5px 12px', cursor: 'pointer', fontSize: 12.5 }
  const bd = { ...b, color: '#C7CBCF', cursor: 'not-allowed' }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', padding: '12px 0', flexWrap: 'wrap' }}>
      <button onClick={() => page > 1 && setPage(1)} style={page > 1 ? b : bd}>«</button>
      <button onClick={() => page > 1 && setPage(page - 1)} style={page > 1 ? b : bd}>‹ Anterior</button>
      <span style={{ fontSize: 12.5, color: '#7A8288' }}>Página <b style={{ color: '#161616' }}>{page}</b> de {paginas} · {total} registros</span>
      <button onClick={() => page < paginas && setPage(page + 1)} style={page < paginas ? b : bd}>Siguiente ›</button>
      <button onClick={() => page < paginas && setPage(paginas)} style={page < paginas ? b : bd}>»</button>
    </div>
  )
}
