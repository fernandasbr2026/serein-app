import { SEREIN } from './theme-serein.js'
import { EMPRESA } from './CotizacionesModule.jsx'

// ============================================================
// Informe PDF de Cobranza atrasada (Santa Rosa / Istria).
// El reporte siempre refleja exactamente los filtros que la persona
// tiene activos en la pantalla al momento de descargarlo — eso ya
// cubre las variantes pedidas (todas las vencidas, solo 1-20 días,
// solo 21+, pendientes/publicadas en Boletín, por cliente, por rango
// de fechas) sin necesitar un selector de "tipo de informe" aparte.
// ============================================================

const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const fmtF = v => {
  const t = String(v || '').slice(0, 10)
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (t || '—')
}

const ESTADO_COBRANZA_COLOR = { 'Cobranza atrasada': [SEREIN.orangeSoft, SEREIN.orangeDark], 'Corresponde publicar': [SEREIN.redSoft, SEREIN.red] }
const ESTADO_PUB_COLOR = {
  'No publicada': [SEREIN.fog2, SEREIN.textSoft],
  'Pendiente de publicación': [SEREIN.blueSoft, SEREIN.blue],
  'Publicada en Boletín Comercial': [SEREIN.redSoft, SEREIN.red],
  'Retirada del Boletín Comercial': [SEREIN.greenSoft, SEREIN.green],
}

function estilos() {
  return `@page{size:A4;margin:16mm 14mm 20mm}
:root{color-scheme:light}
body{font-family:Inter,Arial,Helvetica,sans-serif;color:${SEREIN.text};background:#fff;font-size:11.5px;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${SEREIN.orange};padding-bottom:10px}
.emp b{color:${SEREIN.ink};font-size:14px}.emp div{color:${SEREIN.textSoft};line-height:1.4;font-size:10px}
.doc{text-align:right}.doc .t{font-size:18px;font-weight:800;color:${SEREIN.orangeDark}}.doc .f{font-size:10.5px;color:${SEREIN.textSoft};margin-top:2px;line-height:1.5}
.meta{margin-top:10px;font-size:10.5px;color:${SEREIN.textSoft};display:flex;gap:18px;flex-wrap:wrap;border-bottom:1px solid ${SEREIN.line};padding-bottom:8px}
.meta b{color:${SEREIN.ink}}
.resumen{display:flex;gap:14px;flex-wrap:wrap;margin:12px 0}
.resumen .c{border:1px solid ${SEREIN.line};border-radius:6px;padding:8px 12px;background:${SEREIN.fog};min-width:110px}
.resumen .c .l{font-size:9px;color:${SEREIN.textSoft};text-transform:uppercase;letter-spacing:.02em}
.resumen .c .v{font-size:15px;font-weight:800;color:${SEREIN.ink}}
table.items{width:100%;border-collapse:collapse;margin-top:6px}
.items thead{display:table-header-group}
.items tr{page-break-inside:avoid}
.items th{background:${SEREIN.orange};color:#fff;padding:6px 6px;font-size:8.5px;text-align:left;text-transform:uppercase;letter-spacing:.01em}
.items td{border:1px solid ${SEREIN.line};padding:5px 6px;font-size:10px;vertical-align:top}
.items .r{text-align:right}
.pill{display:inline-block;padding:2px 7px;border-radius:16px;font-size:9px;font-weight:700;white-space:nowrap}
.aviso{margin-top:16px;border-top:2px solid ${SEREIN.orange};padding-top:12px;font-size:11px;line-height:1.6;color:${SEREIN.text}}
.aviso p{margin:0 0 8px}
.datos{margin-top:10px;border:1px solid ${SEREIN.line};border-radius:6px;padding:10px 12px;background:${SEREIN.fog};font-size:10.5px;line-height:1.55}
.datos b{color:${SEREIN.ink}}
@page{ @bottom-center{ content:"Página " counter(page) " de " counter(pages) " · ${EMPRESA.nombre} · Emitido el ${fmtF(new Date().toISOString().slice(0, 10))}"; font-size:8.5px; color:${SEREIN.textSoft}; } }`
}

function resumenGeneral(items) {
  const n = items.length
  const saldoNeto = items.reduce((a, x) => a + (x.saldoNeto || 0), 0)
  const saldoBruto = items.reduce((a, x) => a + (x.saldoBruto || 0), 0)
  const n1a20 = items.filter(x => x.estadoCobranza === 'Cobranza atrasada').length
  const n21mas = items.filter(x => x.estadoCobranza === 'Corresponde publicar').length
  const nPendPub = items.filter(x => x.estadoPublicacion === 'Pendiente de publicación').length
  const nPublicadas = items.filter(x => x.estadoPublicacion === 'Publicada en Boletín Comercial').length
  return { n, saldoNeto, saldoBruto, n1a20, n21mas, nPendPub, nPublicadas }
}

// Este informe se envía directamente al cliente moroso, así que el pie
// no explica la metodología interna (eso vivía antes en un bloque de
// "Criterio de clasificación") — en su lugar, un aviso claro sobre qué
// debe hacer. El texto se arma solo desde los estados ya calculados de
// cada factura, nunca se inventa ni se asume: solo dice "publicada" si
// alguna factura del informe ya está realmente registrada como tal.
function avisoCliente(r) {
  const partes = []
  if (r.nPublicadas > 0) {
    partes.push(`<p>Las facturas señaladas como <b>"Publicada en Boletín Comercial"</b> se encuentran actualmente publicadas en el registro de la Cámara de Comercio de Santiago. Si ya cuenta con el comprobante de pago correspondiente, le solicitamos enviarlo a la brevedad a <b>${EMPRESA.email}</b> para gestionar la baja de la publicación.</p>`)
  }
  if (r.n - r.nPublicadas > 0) {
    partes.push(`<p>Las facturas señaladas como <b>pendientes de publicación</b> aún no han sido incorporadas al Boletín Comercial. Le solicitamos regularizar su pago a la brevedad para evitar dicha publicación.</p>`)
  }
  return partes.join('')
}

function htmlInforme({ items, area, filtroDescripcion, periodoDescripcion, usuarioEmail }) {
  const r = resumenGeneral(items)
  const filas = [...items].sort((a, b) => (b.diasMora || 0) - (a.diasMora || 0)).map(x => {
    const [bgC, fgC] = ESTADO_COBRANZA_COLOR[x.estadoCobranza] || [SEREIN.fog2, SEREIN.textSoft]
    const [bgP, fgP] = ESTADO_PUB_COLOR[x.estadoPublicacion] || [SEREIN.fog2, SEREIN.textSoft]
    return `<tr>
      <td>${x.folio || ''}</td>
      <td>${x.cliente || ''}</td>
      <td>${fmtF(x.fechaEmision)}</td>
      <td>${fmtF(x.fechaVencimiento)}</td>
      <td class="r">${clp(x.neto)}</td>
      <td class="r">${clp(x.bruto)}</td>
      <td class="r">${clp(x.pagado)}</td>
      <td class="r">${clp(x.saldoBruto)}</td>
      <td class="r">${x.diasMora}</td>
      <td><span class="pill" style="background:${bgC};color:${fgC}">${x.estadoCobranza}</span></td>
      <td><span class="pill" style="background:${bgP};color:${fgP}">${x.estadoPublicacion}</span></td>
      <td>${fmtF(x.fechaPublicacion)}</td>
    </tr>`
  }).join('')
  const logo = (function () { try { return localStorage.getItem('serein_logo') || '' } catch (e) { return '' } })()
  const ahora = new Date()
  const fechaHora = fmtF(ahora.toISOString().slice(0, 10)) + ' ' + ahora.toTimeString().slice(0, 5)
  const r2 = resumenGeneral(items)
  return `<!doctype html><html><head><meta charset="utf-8"><title>Informe de cobranza atrasada · ${area}</title><style>${estilos()}</style></head><body>
    <div class="head">
      <div class="emp">
        ${logo ? '<img src="' + logo + '" style="height:36px;display:block;margin-bottom:6px"/>' : ''}
        <b>${EMPRESA.nombre}</b>
        <div>R.U.T: ${EMPRESA.rut}</div><div>${EMPRESA.direccion}</div>
      </div>
      <div class="doc">
        <div class="t">Informe de cobranza atrasada</div>
        <div class="f">${area}<br/>Emitido el ${fechaHora}${usuarioEmail ? ' · ' + usuarioEmail : ''}</div>
      </div>
    </div>
    <div class="meta">
      <span>Periodo analizado: <b>${periodoDescripcion || 'Todas las fechas'}</b></span>
    </div>
    <div class="resumen">
      <div class="c"><div class="l">Facturas vencidas</div><div class="v">${r2.n}</div></div>
      <div class="c"><div class="l">Saldo neto pendiente</div><div class="v">${clp(r2.saldoNeto)}</div></div>
      <div class="c"><div class="l">Saldo bruto pendiente</div><div class="v">${clp(r2.saldoBruto)}</div></div>
      <div class="c"><div class="l">1 a 20 días</div><div class="v">${r2.n1a20}</div></div>
      <div class="c"><div class="l">21 días o más</div><div class="v">${r2.n21mas}</div></div>
      <div class="c"><div class="l">Pendientes de publicación</div><div class="v">${r2.nPendPub}</div></div>
      <div class="c"><div class="l">Publicadas en Boletín</div><div class="v">${r2.nPublicadas}</div></div>
    </div>
    ${items.length ? `<table class="items"><thead><tr>
      <th>Factura</th><th>Cliente</th><th>Emisión</th><th>Vencimiento</th><th class="r">Total neto</th><th class="r">Total bruto</th><th class="r">Pagado</th><th class="r">Saldo bruto</th><th class="r">Días mora</th><th>Estado cobranza</th><th>Boletín Comercial</th><th>Fecha publicación</th>
    </tr></thead><tbody>${filas}</tbody></table>` : `<div style="padding:16px 0;color:${SEREIN.green};font-weight:600">Sin facturas vencidas para estos filtros.</div>`}
    <div class="aviso">${avisoCliente(r)}</div>
    <div class="datos"><b>Datos de transferencia</b><br/>
      SERVICIOS REVESTIMIENTOS INDUSTRIALES SpA · RUT 76.860.656-0<br/>
      Banco de Chile · Cuenta Corriente N° 532147409<br/>
      ${EMPRESA.email} · Carolina Marillanca, Gerente Comercial<br/>
      Dirección: Santa Rosa 70, Lampa · sereingroup.cl · Tel: 56 9 7647 1744
    </div>
  </body></html>`
}

export function descargarInformeCobranza({ items, area, filtroDescripcion, periodoDescripcion, usuarioEmail }) {
  const w = window.open('', '_blank')
  if (!w) { window.alert('Habilita las ventanas emergentes para descargar el informe.'); return }
  w.document.write(htmlInforme({ items, area, filtroDescripcion, periodoDescripcion, usuarioEmail }))
  w.document.close()
  setTimeout(() => { w.focus(); w.print() }, 400)
}
