import React from 'react'
import { Hourglass, AlertCircle } from 'lucide-react'

const C = { azul: '#061A40', teal: '#0B7285', ambar: '#FF6B00', rojo: '#D64545', verde: '#12805C', carbon: '#0F1A2E' }
const clp = n => '$' + Math.round(n).toLocaleString('es-CL')

// Un proyecto está "en curso" si le falta por facturar contra presupuesto,
// o si su avance físico no llegó al 100%
const facturadoDe = p => p.edps.reduce((a, e) => a + e.venta, 0)
const porFacturarDe = p => (p.presupuesto && p.presupuesto > 0) ? Math.max(0, p.presupuesto - facturadoDe(p)) : null

export default function PipelineProyectos({ proyectos }) {
  const enCurso = proyectos.filter(p => {
    const saldo = porFacturarDe(p)
    return (saldo !== null && saldo > 0) || (saldo === null && p.avance < 100)
  })

  const totPorFacturar = enCurso.reduce((a, p) => a + (porFacturarDe(p) ?? 0), 0)
  const sinPresupuesto = enCurso.filter(p => porFacturarDe(p) === null).length
  const porCobrar = proyectos.reduce((a, p) => a + p.edps.filter(e => e.estado !== 'Pagado').reduce((x, e) => x + e.venta, 0), 0)

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', borderTop: `4px solid ${C.azul}`, marginBottom: 16 }}>
      <div style={{ padding: '14px 18px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 7 }}>
          <Hourglass size={15} color={C.azul} /> Proyectos en curso · por facturar
        </span>
        <span style={{ fontSize: 12, color: '#7A8288' }}>Área Proyectos · {enCurso.length} proyecto{enCurso.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ padding: '0 18px 8px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>Por facturar (saldo vs presupuesto)</div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 26, fontWeight: 600, color: C.azul }}>{clp(totPorFacturar)}</div>
        </div>
        {porCobrar > 0 && (
          <div>
            <div style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>Facturado, aún por cobrar</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 26, fontWeight: 600, color: C.rojo }}>{clp(porCobrar)}</div>
          </div>
        )}
      </div>

      <div style={{ padding: '0 18px 16px', overflowX: 'auto' }}>
        {enCurso.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9AA0A6', padding: '8px 0' }}>No hay proyectos en curso.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                {['Proyecto', 'Cliente', 'Avance', 'Facturado', 'Por facturar'].map(h => (
                  <th key={h} style={{ textAlign: ['Facturado', 'Por facturar'].includes(h) ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enCurso.map(p => {
                const saldo = porFacturarDe(p)
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
                    <td style={{ padding: '8px', fontWeight: 500 }}>{p.nombre}</td>
                    <td style={{ padding: '8px', color: '#7A8288', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cliente}</td>
                    <td style={{ padding: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 6, background: '#EEE9DF' }}>
                          <div style={{ width: `${p.avance}%`, height: '100%', background: C.teal }} />
                        </div>
                        <span style={{ fontSize: 12, color: '#7A8288' }}>{p.avance}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{clp(facturadoDe(p))}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>
                      {saldo !== null
                        ? <span style={{ color: C.azul }}>{clp(saldo)}</span>
                        : <span style={{ color: C.ambar, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertCircle size={12} /> sin presupuesto</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {sinPresupuesto > 0 && (
        <div style={{ background: '#F9E9DE', padding: '8px 18px', fontSize: 12, color: '#8C4519' }}>
          {sinPresupuesto} proyecto{sinPresupuesto !== 1 ? 's' : ''} sin presupuesto definido — defínelo en Gestión Proyectos para que su saldo por facturar aparezca aquí.
        </div>
      )}
    </div>
  )
}
