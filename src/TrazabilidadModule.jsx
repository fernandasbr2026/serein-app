import React from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { ocNeto, ocTotal, vencOC } from './OrdenesCompraModule.jsx'

// ============================================================
// MÓDULO: Trazabilidad y Alertas (Gerencia)
// Cadena: Cotización → OT → OC proveedor / Compras → Producción → Factura → Cobranza
// ============================================================

import { SEREIN } from './theme-serein.js'
// Paleta reskineada a la identidad Serein 2026 — mismas claves, solo cambian los valores hex.
const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const hoy = () => new Date().toISOString().slice(0, 10)

const ocsDeOT = (ocs, numOT) => (ocs || []).filter(o => (o.asignaciones || []).some(a => a.ot === numOT))
const produccionDe = o => ({ 'Cotizada': 'No iniciada', 'En ejecución': 'En proceso', 'Terminada': 'Terminada', 'Facturada': 'Terminada', 'Cerrada': 'Terminada' }[o.estado] || '—')
const facturacionDe = o => (o.ventas && o.ventas.length > 0) ? ('Facturada (' + o.ventas.length + ')') : (['Facturada', 'Cerrada', 'Terminada'].includes(o.estado) ? 'Pendiente' : '—')
const cobranzaDe = o => { const v = o.ventas || []; if (!v.length) return '—'; if (v.every(x => x.estadoPago === 'Pagado')) return 'Cobrado'; if (v.some(x => x.estadoPago === 'Pagado')) return 'Parcial'; return 'Pendiente' }

export default function TrazabilidadModule({ cotizaciones = [], ots = [], ordenesCompra = [] }) {
  // ---- Alertas ----
  const alertas = []
  cotizaciones.filter(c => c.estado === 'Aprobada' && !ots.find(o => o.numero === 'OT-' + c.folio)).forEach(c =>
    alertas.push({ col: C.rojo, txt: `Cotización N° ${c.folio} (${c.cliente}) está aprobada pero no tiene OT creada.` }))
  ots.filter(o => o.estado === 'Terminada' && (!o.ventas || o.ventas.length === 0)).forEach(o =>
    alertas.push({ col: C.ambar, txt: `${o.numero} está terminada pero no tiene factura emitida.` }))
  ordenesCompra.filter(o => o.estadoPago !== 'Pagada' && o.estadoPago !== 'Anulada' && vencOC(o) && vencOC(o) < hoy()).forEach(o =>
    alertas.push({ col: C.rojo, txt: `OC N° ${o.numero} (${o.proveedor}) está vencida sin pago (${clp(ocTotal(o))}).` }))
  ordenesCompra.filter(o => o.estadoPago !== 'Anulada' && (!o.asignaciones || o.asignaciones.length === 0)).slice(0, 30).forEach(o =>
    alertas.push({ col: C.gris, txt: `OC N° ${o.numero} (${o.proveedor}) no está asociada a ninguna OT.` }))
  ots.filter(o => (o.ventas || []).some(v => v.estadoPago !== 'Pagado')).forEach(o =>
    alertas.push({ col: C.ambar, txt: `${o.numero} tiene facturas emitidas pendientes de cobro.` }))

  const paso = (txt, sub, col) => (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 10.5, color: C.gris, textTransform: 'uppercase' }}>{txt}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: col || C.carbon }}>{sub}</div>
    </div>
  )

  return (
    <div>
      {/* ALERTAS */}
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase', marginBottom: 10 }}>Alertas ({alertas.length})</div>
      {alertas.length === 0 ? (
        <div style={{ background: '#E6F7EE', color: C.verde, padding: '10px 14px', fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle2 size={16} /> Sin alertas pendientes.</div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          {alertas.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderLeft: `4px solid ${a.col}`, border: '1px solid #DFE4EA', padding: '9px 14px', marginBottom: 6, fontSize: 13 }}>
              <AlertTriangle size={15} color={a.col} /> <span>{a.txt}</span>
            </div>
          ))}
        </div>
      )}

      {/* TRAZABILIDAD */}
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase', marginBottom: 10 }}>Trazabilidad · Cotización → OT → OC → Producción → Factura → Cobranza</div>
      {cotizaciones.length === 0 && ots.length === 0 && <div style={{ color: '#9AA3AD', fontSize: 13 }}>Aún no hay cotizaciones ni OT.</div>}
      {ots.map(o => {
        const cot = cotizaciones.find(c => 'OT-' + c.folio === o.numero)
        const ocs = ocsDeOT(ordenesCompra, o.numero)
        const ocTot = ocs.reduce((a, x) => a + ocNeto(x), 0)
        return (
          <div key={o.id} style={{ background: '#fff', border: '1px solid #DFE4EA', padding: '12px 16px', marginBottom: 10, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            {paso('Cotización', cot ? ('N° ' + cot.folio) : '—', C.teal)}
            <ArrowRight size={14} color={C.gris} />
            {paso('OT', o.numero + ' · ' + o.estado, C.azul)}
            <ArrowRight size={14} color={C.gris} />
            {paso('OC proveedores', ocs.length ? (ocs.length + ' · ' + clp(ocTot)) : 'sin OC', ocs.length ? C.carbon : C.ambar)}
            <ArrowRight size={14} color={C.gris} />
            {paso('Producción', produccionDe(o), C.carbon)}
            <ArrowRight size={14} color={C.gris} />
            {paso('Facturación', facturacionDe(o), C.carbon)}
            <ArrowRight size={14} color={C.gris} />
            {paso('Cobranza', cobranzaDe(o), cobranzaDe(o) === 'Cobrado' ? C.verde : cobranzaDe(o) === '—' ? C.gris : C.rojo)}
          </div>
        )
      })}
    </div>
  )
}
