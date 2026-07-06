import React from 'react'
import { Hourglass, CheckCircle2, ArrowRight } from 'lucide-react'

const C = { azul: '#1D1D1B', teal: '#A8501F', ambar: '#D2642F', rojo: '#B5432E', verde: '#3D7A4E', carbon: '#161616' }
const clp = n => '$' + Math.round(n).toLocaleString('es-CL')
const AREA_COLOR = { 'Santa Rosa': '#A8501F', 'Istria': '#1D1D1B', 'Proyectos': '#D2642F' }

const EN_CURSO = ['Cotizada', 'En ejecución', 'Terminada']
const FACTURADAS = ['Facturada', 'Cerrada']

// Monto esperado: lo cotizado; si no hay cotización cargada, lo ya facturado
const montoEsperado = ot => (ot.montoCotizado && ot.montoCotizado > 0)
  ? ot.montoCotizado
  : ot.ventas.reduce((a, v) => a + v.neta, 0)

export default function PipelineOT({ ots }) {
  const enCurso = ots.filter(o => EN_CURSO.includes(o.estado))
  const facturadas = ots.filter(o => FACTURADAS.includes(o.estado))

  const totPorFacturar = enCurso.reduce((a, o) => a + montoEsperado(o), 0)
  const totFacturado = facturadas.reduce((a, o) => a + o.ventas.reduce((x, v) => x + v.neta, 0), 0)
  const porCobrar = facturadas.reduce((a, o) => a + o.ventas.filter(v => v.estadoPago === 'Pendiente').reduce((x, v) => x + v.neta, 0), 0)

  const fila = (o, monto, esPipeline) => (
    <tr key={o.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
      <td style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 12, background: C.carbon, color: '#fff', padding: '2px 7px' }}>{o.numero}</span>
      </td>
      <td style={{ padding: '8px 8px', fontWeight: 500 }}>{o.cliente}</td>
      <td style={{ padding: '8px 8px' }}>
        <span style={{ fontSize: 12, color: AREA_COLOR[o.area] || '#666', fontWeight: 600 }}>{o.area}</span>
      </td>
      <td style={{ padding: '8px 8px', fontSize: 12, color: '#7A8288' }}>{o.estado}</td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600, color: esPipeline ? C.ambar : C.verde }}>{clp(monto)}</td>
    </tr>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 16 }}>
      {/* POR FACTURAR */}
      <div style={{ background: '#fff', border: '1px solid #E2DED4', borderTop: `4px solid ${C.ambar}` }}>
        <div style={{ padding: '14px 18px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Hourglass size={15} color={C.ambar} /> OT por facturar · Santa Rosa e Istria
          </span>
          <span style={{ fontSize: 12, color: '#7A8288' }}>{enCurso.length} OT{enCurso.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ padding: '0 18px 8px' }}>
          <div style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>Por ingresar a caja (neto estimado)</div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 26, fontWeight: 600, color: C.ambar }}>{clp(totPorFacturar)}</div>
        </div>
        <div style={{ padding: '0 18px 16px', overflowX: 'auto' }}>
          {enCurso.length === 0 ? (
            <div style={{ fontSize: 13, color: '#9AA0A6', padding: '8px 0' }}>No hay trabajos en curso.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>{enCurso.map(o => fila(o, montoEsperado(o), true))}</tbody>
            </table>
          )}
        </div>
        <div style={{ background: '#F9E9DE', padding: '8px 18px', fontSize: 12, color: '#8C4519', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ArrowRight size={13} /> Al cambiar una OT a "Facturada" pasa automáticamente al cuadro de la derecha.
        </div>
      </div>

      {/* FACTURADAS */}
      <div style={{ background: '#fff', border: '1px solid #E2DED4', borderTop: `4px solid ${C.verde}` }}>
        <div style={{ padding: '14px 18px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 7 }}>
            <CheckCircle2 size={15} color={C.verde} /> OT facturadas
          </span>
          <span style={{ fontSize: 12, color: '#7A8288' }}>{facturadas.length} OT{facturadas.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ padding: '0 18px 8px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>Facturado (neto)</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 26, fontWeight: 600, color: C.verde }}>{clp(totFacturado)}</div>
          </div>
          {porCobrar > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>De eso, aún por cobrar</div>
              <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 26, fontWeight: 600, color: C.rojo }}>{clp(porCobrar)}</div>
            </div>
          )}
        </div>
        <div style={{ padding: '0 18px 16px', overflowX: 'auto' }}>
          {facturadas.length === 0 ? (
            <div style={{ fontSize: 13, color: '#9AA0A6', padding: '8px 0' }}>Aún no hay OTs facturadas.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>{facturadas.map(o => fila(o, o.ventas.reduce((a, v) => a + v.neta, 0), false))}</tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
