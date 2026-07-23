import { SEREIN } from './theme-serein.js'
import { EMPRESA } from './CotizacionesModule.jsx'

// ============================================================
// Informe PDF de facturas seleccionadas (Facturas / Libro de Ventas).
// Recibe una lista ya normalizada: { folio, cliente, fechaEmision,
// ventaNeta, iva, total, fechaVencimiento, estado }.
// ============================================================

const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const fmtF = s => {
  const t = String(s || '').slice(0, 10)
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : t
}
const ESTADOS_SIN_MORA = ['pagado', 'pagada', 'anulada']
const ESTADO_COLOR = {
  Pagado: [SEREIN.greenSoft, SEREIN.green],
  Factoring: [SEREIN.orangeSoft, SEREIN.orangeDark],
  Vencida: [SEREIN.redSoft, SEREIN.red],
  Anulada: [SEREIN.fog2, SEREIN.textFaint],
  Pendiente: [SEREIN.orangeSoft, SEREIN.orangeDark],
}
const colorEstado = e => ESTADO_COLOR[e] || [SEREIN.fog2, SEREIN.textSoft]

function diasMoraDe(f) {
  if (!f.fechaVencimiento || ESTADOS_SIN_MORA.includes(String(f.estado || '').toLowerCase())) return null
  const venc = new Date(f.fechaVencimiento + 'T00:00:00')
  if (isNaN(venc.getTime())) return null
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((hoy - venc) / 86400000))
}

function estilosInforme() {
  return `@page{size:A4;margin:16mm 14mm}:root{color-scheme:light}body{font-family:Inter,Arial,Helvetica,sans-serif;color:${SEREIN.text};background:#fff;font-size:12px;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid ${SEREIN.orange};padding-bottom:10px}
.emp b{color:${SEREIN.ink};font-size:15px}.emp div{color:${SEREIN.textSoft};line-height:1.45;font-size:10.5px}
.doc{text-align:right}.doc .t{font-size:20px;font-weight:800;color:${SEREIN.orangeDark}}.doc .f{font-size:11.5px;color:${SEREIN.textSoft};margin-top:2px}
table.items{width:100%;border-collapse:collapse;margin-top:14px}
.items th{background:${SEREIN.orange};color:#fff;padding:7px 8px;font-size:9.5px;text-align:left;text-transform:uppercase;letter-spacing:.02em}
.items td{border:1px solid ${SEREIN.line};padding:6px 8px;font-size:11px;vertical-align:top}
.items .r{text-align:right}
.items tfoot td{font-weight:800;background:${SEREIN.orangeSoft};border-top:2px solid ${SEREIN.orange};color:${SEREIN.orangeDark}}
.mora{color:${SEREIN.red};font-weight:700}
.pill{display:inline-block;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;white-space:nowrap}
.datos{margin-top:16px;border:1px solid ${SEREIN.line};padding:10px;font-size:11px;line-height:1.55;background:${SEREIN.fog}}
.datos b{color:${SEREIN.orangeDark}}`
}

function htmlInforme(items) {
  const filas = [...items].sort((a, b) => String(a.fechaEmision || '').localeCompare(String(b.fechaEmision || '')))
  const tot = filas.reduce((a, f) => ({
    neta: a.neta + (Number(f.ventaNeta) || 0),
    iva: a.iva + (Number(f.iva) || 0),
    total: a.total + (Number(f.total) || 0),
  }), { neta: 0, iva: 0, total: 0 })
  const filasHtml = filas.map(f => {
    const mora = diasMoraDe(f)
    const [bg, fg] = colorEstado(f.estado)
    return `<tr>
      <td>${fmtF(f.fechaEmision)}</td>
      <td>${f.folio || ''}</td>
      <td>${f.cliente || ''}</td>
      <td class="r">${clp(f.ventaNeta)}</td>
      <td class="r">${clp(f.iva)}</td>
      <td class="r">${clp(f.total)}</td>
      <td><span class="pill" style="background:${bg};color:${fg}">${f.estado || '-'}</span></td>
      <td>${fmtF(f.fechaVencimiento)}</td>
      <td class="r${mora ? ' mora' : ''}">${mora == null ? '-' : mora}</td>
    </tr>`
  }).join('')
  const logo = (function () { try { return localStorage.getItem('serein_logo') || '' } catch (e) { return '' } })()
  return `<!doctype html><html><head><meta charset="utf-8"><title>Informe de facturas</title><style>${estilosInforme()}</style></head><body>
    <div class="head">
      <div class="emp">
        ${logo ? '<img src="' + logo + '" style="height:40px;display:block;margin-bottom:6px"/>' : ''}
        <b>${EMPRESA.nombre}</b>
        <div>R.U.T: ${EMPRESA.rut}</div><div>${EMPRESA.giro}</div>
        <div>${EMPRESA.direccion}</div><div>Teléfono: ${EMPRESA.telefono}</div><div>Email: ${EMPRESA.email}</div>
      </div>
      <div class="doc"><div class="t">Informe de facturas</div><div class="f">${filas.length} documento(s) · Emitido el ${fmtF(new Date().toISOString().slice(0, 10))}</div></div>
    </div>
    <table class="items"><thead><tr>
      <th>Fecha emisión</th><th>Folio</th><th>Cliente</th><th class="r">Venta neta</th><th class="r">IVA</th><th class="r">Total</th><th>Estado</th><th>Vencimiento</th><th class="r">Días mora</th>
    </tr></thead>
    <tbody>${filasHtml}</tbody>
    <tfoot><tr><td colspan="3">Totales</td><td class="r">${clp(tot.neta)}</td><td class="r">${clp(tot.iva)}</td><td class="r">${clp(tot.total)}</td><td></td><td></td><td></td></tr></tfoot>
    </table>
    <div class="datos"><b>Datos de transferencia</b><br>
      SERVICIOS REVESTIMIENTOS INDUSTRIALES SpA · RUT 76.860.656-0<br>
      Banco de Chile · Cuenta Corriente N° 532147409<br>
      administracion@sereinspa.com · Carolina Marillanca, Gerente Comercial<br>
      Dirección: Santa Rosa 70, Lampa · sereingroup.cl · Tel: 56 9 7647 1744
    </div>
  </body></html>`
}

export function descargarInformeFacturas(items) {
  if (!items || !items.length) return
  const w = window.open('', '_blank')
  if (!w) { window.alert('Habilita las ventanas emergentes para descargar el informe.'); return }
  w.document.write(htmlInforme(items))
  w.document.close()
  setTimeout(() => { w.focus(); w.print() }, 400)
}
