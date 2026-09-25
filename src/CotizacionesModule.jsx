import React, { useState } from 'react'
import { Plus, Trash2, FileText, Download, CheckCircle2, Search, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import Paginador, { paginar } from './Paginador.jsx'
import { PROVEEDORES_FICHA } from './proveedores-data.js'
import { pushState, pullState } from './sync.js'
import { SEREIN } from './theme-serein.js'

// ============================================================
// MÓDULO: Cotizaciones (formato PDF descargable) + generación de OT
// - Crear cotización, guardarla en un listado, descargar PDF.
// - Aprobar → genera una OT con el mismo número, en el mismo
//   formato pero SIN valores (para los supervisores).
// ============================================================

// Paleta reskineada a la identidad Serein 2026 — mismas claves de siempre,
// solo cambian los valores hex. La logica de abajo no se toca.
const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
// Cantidad con decimales: la coma es separador decimal; el punto se usa como miles
const numDec = s => { let x = String(s == null ? '' : s).trim().replace(/[^\d.,-]/g, ''); if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.'); else if (/^-?\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, ''); const v = parseFloat(x); return isNaN(v) ? 0 : v }
const fmtCant = s => numDec(s).toLocaleString('es-CL', { maximumFractionDigits: 2 })
const inp = { padding: '9px 11px', border: '1px solid ' + SEREIN.line, borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }
import { COTIZADOR_SEED } from './cotizador-data.js'
import { calcCapa, dftTotal, calcCubicacion, milsAMicras, buscarProducto, fmtDec, CRITERIOS_M2, criterioPorDefecto, m2DeFila, cifrasNoRespaldadas } from './ofertaCalc.js'
import { supabase } from './supabase.js'
import { fileToBase64 } from './protocolo-pdf.js'
// Catálogo de productos/esquemas (el mismo que edita Cotizador → Parámetros).
function leerCatalogo() { try { const o = JSON.parse(localStorage.getItem('cotizador_params_v1') || 'null'); if (o && o.productos) return o } catch (e) {} return COTIZADOR_SEED }
const AREAS = ['Santa Rosa', 'Istria', 'Proyectos']
const ESTADOS_COT = ['Alta probabilidad de cierre', 'Baja probabilidad de cierre', 'Aprobada', 'Rechazada', 'Otro']
const colorEstadoCot = e => ({ 'Aprobada': [SEREIN.greenSoft, C.verde], 'Rechazada': [SEREIN.redSoft, C.rojo], 'Alta probabilidad de cierre': [SEREIN.blueSoft, SEREIN.blue], 'Baja probabilidad de cierre': [SEREIN.orangeSoft, SEREIN.orangeDark], 'Otro': [SEREIN.fog2, C.gris] }[e] || [SEREIN.fog2, C.gris])

// Datos de la empresa (encabezado del documento)
// telefono: numero oficial de la empresa (mismo WhatsApp del sitio web) —
// nunca el celular personal de nadie del equipo. Se puede sobrescribir
// desde Parametros -> Datos empresa; esto es solo el respaldo si no se ha
// configurado.
const _EMP_DEF = { banco: BANCO_DEF.banco, cuenta: BANCO_DEF.cuentaCorriente, nombre: 'SERVICIOS REVESTIMIENTOS INDUSTRIALES SPA', rut: '76.860.656-0', giro: 'Revestimientos Industriales y habitacionales', direccion: 'Santa Rosa 70, Lampa', telefono: '56945917843', email: 'administracion@sereinspa.com' }
function _empVal(k, map) { try { const p = JSON.parse(localStorage.getItem('serein_params') || '{}'); const e = (p && p.empresa) || {}; const v = e[map]; return (v && String(v).trim()) || _EMP_DEF[k] || '' } catch (x) { return _EMP_DEF[k] || '' } }
export const EMPRESA = {}
;[['nombre', 'razonSocial'], ['rut', 'rut'], ['giro', 'giro'], ['direccion', 'direccion'], ['telefono', 'telefono'], ['email', 'correo'], ['banco', 'banco'], ['cuenta', 'cuentaCorriente']].forEach(m => Object.defineProperty(EMPRESA, m[0], { get() { return _empVal(m[0], m[1]) }, enumerable: true }))

const itemTotal = it => Math.max(0, Math.round((numDec(it.cant) * num(it.pUnitario)) - num(it.descuento)))
export function totales(cot) {
  const afecto = (cot.items || []).reduce((a, it) => a + itemTotal(it), 0)
  const iva = Math.round(afecto * 0.19)
  return { afecto, iva, total: afecto + iva }
}

// ---- Número a palabras (CLP, entero) ----
function enPalabras(n) {
  n = Math.round(n || 0)
  if (n === 0) return 'CERO PESOS'
  const U = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE']
  const D = ['', '', 'VEINTI', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
  const Cn = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']
  function dos(x) {
    if (x <= 20) return U[x]
    if (x < 30) return 'VEINTI' + U[x - 20]
    const d = Math.floor(x / 10), u = x % 10
    return D[d] + (u ? ' Y ' + U[u] : '')
  }
  function tres(x) {
    if (x === 100) return 'CIEN'
    const c = Math.floor(x / 100), r = x % 100
    return (c ? Cn[c] + (r ? ' ' : '') : '') + (r ? dos(r) : '')
  }
  function seg(x, sing, plur) {
    if (x === 0) return ''
    if (x === 1) return sing
    return tres(x) + ' ' + plur
  }
  const millones = Math.floor(n / 1000000)
  const miles = Math.floor((n % 1000000) / 1000)
  const resto = n % 1000
  let out = ''
  if (millones) out += seg(millones, 'UN MILLÓN', 'MILLONES') + ' '
  if (miles) out += (miles === 1 ? 'MIL' : tres(miles) + ' MIL') + ' '
  if (resto) out += tres(resto)
  return (out.trim() || 'CERO') + ' PESOS'
}

// ---- Generar el HTML del documento e imprimir (Guardar como PDF) ----
function estilosDoc() { return '@page{size:A4;margin:18mm 14mm 14mm}body{font-family:Inter,Arial,Helvetica,sans-serif;color:#101828;font-size:12px;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #101315;padding-bottom:10px}.emp b{color:#101315;font-size:15px}.emp div{color:#5a6b85;line-height:1.45;font-size:10.5px}.doc{text-align:right}.doc .t{font-size:20px;font-weight:800;color:#101315}.doc .f{font-size:13px;font-weight:700;color:#F77716}table{width:100%;border-collapse:collapse;margin-top:10px}.cli td{padding:4px 8px;font-size:11px;vertical-align:top}.cli .lbl{color:#5a6b85;text-transform:uppercase;font-size:9px}.items th{background:#101315;color:#fff;padding:6px 8px;font-size:10px;text-align:left}.items td{border:1px solid #D8DCE5;padding:6px 8px;font-size:11px;vertical-align:top}.items .r{text-align:right}.tot{width:auto;margin-left:auto;margin-top:10px}.tot td{padding:4px 12px;font-size:12px}.tot .lbl{color:#5a6b85;text-align:right}.tot .big{font-weight:800;font-size:14px;color:#101315}.words{margin-top:8px;font-size:11px;color:#344054}.badge{display:inline-block;border:1px solid #D8DCE5;background:#F5F7FA;color:#5a6b85;padding:2px 8px;font-size:10px;margin-top:6px;border-radius:4px}.pb{page-break-before:always;padding-top:6px}.cond{font-size:11px;border-bottom:1px solid #D8DCE5;padding-bottom:8px;margin:8px 0}.cond ol{padding-left:18px;font-size:11px;line-height:1.5}.cond li{margin-bottom:5px;color:#101828}.cond .datos{margin-top:10px;border:1px solid #D8DCE5;padding:10px;font-size:11px;line-height:1.5;background:#F5F7FA}' }

// Condiciones comerciales y operativas (se adjuntan a la cotización)
// Condiciones comerciales por defecto (las mismas 10 de siempre). Una
// cotización puede traer su propia lista en cot.condiciones ([{t, x}]); si
// no la trae, se usan estas — así las cotizaciones antiguas se ven igual.
import { CONDICIONES_DEF, BANCO_DEF } from './cotizacionDefaults.js'
const escH = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// Orden de prioridad: condiciones propias de la cotización → las estándar
// configuradas en Parámetros → las de fábrica (CONDICIONES_DEF).
const condicionesEstandar = () => { try { const p = JSON.parse(localStorage.getItem('serein_params') || '{}'); if (Array.isArray(p.condicionesCotizacion) && p.condicionesCotizacion.length) return p.condicionesCotizacion } catch (e) {} return CONDICIONES_DEF }
const condicionesDe = cot => (Array.isArray(cot && cot.condiciones) && cot.condiciones.length) ? cot.condiciones : condicionesEstandar()
const datosTransferenciaHtml = () => `<b>Datos de transferencia</b><br>
      SERVICIOS REVESTIMIENTOS INDUSTRIALES SpA · RUT ${escH(EMPRESA.rut)}<br>
      ${escH(EMPRESA.banco)} · Cuenta Corriente N° ${escH(EMPRESA.cuenta)}<br>
      ${escH(EMPRESA.email)}<br>
      Dirección: ${escH(EMPRESA.direccion)} · sereingroup.cl`
function htmlCondiciones(cot) {
  return `<div class="pb cond">
    <h2>Condiciones comerciales y operativas — SEREIN</h2>
    <ol>
      ${condicionesDe(cot).map(c => `<li><b>${escH(c.t)}:</b> ${escH(c.x)}</li>`).join('\n      ')}
    </ol>
    <div class="datos">${datosTransferenciaHtml()}</div>
  </div>`
}
function htmlDoc(cot, { conValores, esOT, conCondiciones }) {
  const t = totales(cot)
  const titulo = esOT ? 'ORDEN DE TRABAJO' : 'Cotización'
  const foliolbl = esOT ? ('OT N° ' + cot.folio) : ('Folio N° ' + cot.folio)
  const cols = conValores
    ? ['Item', 'Código', 'Detalle', 'Cant', 'P. Unitario', 'Rec/Desc', 'Total']
    : ['Item', 'Código', 'Detalle', 'Cant', 'Unidad']
  const filas = (cot.items || []).map((it, i) => {
    const base = `<td>${i + 1}</td><td>${it.codigo || ''}</td><td><b>${it.detalle || ''}</b>${it.descDetallada ? '<br><span style="color:#777">Desc: ' + it.descDetallada + '</span>' : ''}${it.comentario ? '<br><span style="color:#777">Comentario: ' + it.comentario + '</span>' : ''}</td>`
    if (conValores) return `<tr>${base}<td class="r">${fmtCant(it.cant)} ${it.unidad || 'UN'}</td><td class="r">${clp(it.pUnitario)}</td><td class="r">${clp(it.descuento)}</td><td class="r">${clp(itemTotal(it))}</td></tr>`
    return `<tr>${base}<td class="r">${fmtCant(it.cant)}</td><td>${it.unidad || 'UN'}</td></tr>`
  }).join('')
  const totalesHtml = conValores ? `<table class="tot">
    <tr><td class="lbl">Afecto</td><td class="r">${clp(t.afecto)}</td></tr>
    <tr><td class="lbl">Exento</td><td class="r">$0</td></tr>
    <tr><td class="lbl">19% IVA</td><td class="r">${clp(t.iva)}</td></tr>
    <tr><td class="lbl big">Total</td><td class="r big">${clp(t.total)}</td></tr>
  </table><div class="words">${enPalabras(t.total)}</div>` : '<div class="badge">DOCUMENTO SIN VALORES · USO INTERNO / TALLER</div>'
  return `<!doctype html><html><head><meta charset="utf-8"><title>${titulo} ${cot.folio}</title><style>${estilosDoc()}</style></head><body>
    <div class="head">
      ${(function(){var _l='';try{_l=localStorage.getItem('serein_logo')||''}catch(e){}return _l?'<img src="'+_l+'" style="height:46px;display:block;margin-bottom:8px"/>':''})()}
      <div class="emp"><b>${EMPRESA.nombre}</b>
        <div>R.U.T: ${EMPRESA.rut}</div><div>${EMPRESA.giro}</div>
        <div>${EMPRESA.direccion}</div><div>Teléfono: ${EMPRESA.telefono}</div><div>Email: ${EMPRESA.email}</div>
      </div>
      <div class="doc"><div class="t">${titulo}</div><div class="f">${foliolbl}</div></div>
    </div>
    <table class="cli"><tbody>
      <tr><td><div class="lbl">Señor(es)</div>${cot.cliente || ''}</td><td><div class="lbl">Ciudad</div>${cot.ciudad || ''}</td><td><div class="lbl">Giro</div>${cot.giro || ''}</td><td><div class="lbl">R.U.T</div>${cot.rut || ''}</td></tr>
      <tr><td><div class="lbl">Dirección</div>${cot.direccion || ''}</td><td><div class="lbl">Condición de pago</div>${cot.condicionPago || ''}</td><td><div class="lbl">Vendedor</div>${cot.vendedor || ''}</td><td><div class="lbl">Área</div>${cot.area || ''}</td></tr>
      <tr><td><div class="lbl">Comuna</div>${cot.comuna || ''}</td><td><div class="lbl">Fecha Documento</div>${cot.fecha || ''}</td><td><div class="lbl">Fecha Vencimiento</div>${cot.vencimiento || ''}</td><td></td></tr>
    </tbody></table>
    <table class="items"><thead><tr>${cols.map(c => '<th>' + c + '</th>').join('')}</tr></thead><tbody>${filas}</tbody></table>
    ${totalesHtml}
    ${cot.comentario ? '<div style="margin-top:10px;font-size:11px"><b>Comentario:</b> ' + cot.comentario + '</div>' : ''}
    ${conCondiciones ? htmlCondiciones(cot) : ''}
  </body></html>`
}
// ---- Formato "oferta" (reemplaza el PDF anterior de la cotización) ----
// Mismo lenguaje visual que los protocolos y que las ofertas técnicas ya
// enviadas. Todos los bloques nuevos son OPCIONALES: si la cotización no
// trae asunto, sistema, carta, atención, lugar de ejecución o estados de
// pago (todas las anteriores a este cambio), simplemente no se dibujan y
// el documento queda como una cotización limpia — nada se pierde ni se
// rompe en las cotizaciones ya emitidas.
const fechaCorta = f => { const m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '-' + m[2] + '-' + m[1] : (f || '') }
const diasValidez = cot => { const a = new Date(cot.fecha + 'T12:00:00'), b = new Date(cot.vencimiento + 'T12:00:00'); const d = Math.round((b - a) / 86400000); return isFinite(d) && d > 0 ? d : 0 }
// Reparte el neto en estados de pago según su %; el último se lleva el
// resto para que la suma calce exacto con el total del documento.
export function estadosDePago(cot) {
  const t = totales(cot)
  const pagos = (cot.pagos || []).filter(x => numDec(x.pct) > 0)
  let accN = 0, accT = 0
  return pagos.map((x, i) => {
    const ultimo = i === pagos.length - 1
    const neto = ultimo ? t.afecto - accN : Math.round(t.afecto * numDec(x.pct) / 100)
    const total = ultimo ? t.total - accT : neto + Math.round(neto * 0.19)
    accN += neto; accT += total
    return { ...x, pct: numDec(x.pct), neto, total }
  })
}
function estilosOferta() { return '@page{size:A4;margin:14mm 13mm 12mm}*{box-sizing:border-box}body{font-family:Inter,Arial,Helvetica,sans-serif;color:#101828;font-size:11.5px;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.oh{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.oh img{height:50px;display:block;margin-bottom:6px}.oh .emp{font-size:10px;color:#5a6b85;line-height:1.5}.oh .emp b{color:#061A40;font-size:11px}.oh .doc{text-align:right}.oh .t{font-size:26px;font-weight:800;color:#061A40;letter-spacing:.5px}.pill{display:inline-block;background:#FF6B00;color:#fff;font-weight:700;font-size:11px;padding:3px 12px;border-radius:14px;margin-top:4px}.sub{font-size:10px;color:#5a6b85;margin-top:5px}.banner{background:#061A40;color:#fff;border-radius:8px;padding:10px 14px;margin-top:12px;font-size:10.5px;line-height:1.5}.banner b{color:#FF6B00;letter-spacing:.5px}.cli{display:grid;grid-template-columns:2fr 1fr 1fr 1.2fr 1.3fr;gap:10px;border:1px solid #D8DCE5;border-radius:8px;padding:10px 12px;margin-top:12px}.cli .l{font-size:8.5px;color:#8a97ab;text-transform:uppercase;letter-spacing:.6px}.cli .v{font-weight:700;font-size:11px;margin-top:2px}.carta{margin-top:12px;font-size:11px;line-height:1.55;color:#344054;white-space:pre-line}.box{border:2px solid #FF6B00;border-radius:12px;padding:12px 14px;margin-top:14px}.box h3{margin:0 0 8px;font-size:13px;color:#061A40;text-transform:uppercase;letter-spacing:.3px}table.it{width:100%;border-collapse:collapse}table.it th{background:#061A40;color:#fff;padding:6px 8px;font-size:9.5px;text-align:left;text-transform:uppercase}table.it td{border-bottom:1px solid #E2E7EC;padding:6px 8px;font-size:10.5px;vertical-align:top}table.it .r{text-align:right;white-space:nowrap}.tots{display:flex;justify-content:flex-end;margin-top:10px}.tots table{border-collapse:collapse}.tots td{padding:3px 12px;font-size:11px}.tots .lbl{color:#5a6b85;text-align:right}.tots .r{text-align:right}.tots .big td{font-size:20px;font-weight:800;color:#061A40;padding-top:6px}.words{margin-top:8px;font-size:10px;color:#5a6b85;font-style:italic}.sec{font-size:15px;font-weight:800;color:#061A40;margin:16px 0 8px}.bar{display:flex;height:5px;border-radius:3px;overflow:hidden;margin-bottom:10px}.bar i{flex:1}.eps{display:flex;gap:8px}.ep{flex:1;border:1px solid #D8DCE5;border-radius:8px;padding:9px 10px;break-inside:avoid}.ep .h{display:flex;justify-content:space-between;align-items:baseline;font-size:9px;color:#5a6b85;text-transform:uppercase;letter-spacing:.5px}.ep .h b{font-size:15px;color:#FF6B00}.ep .d{font-size:10px;line-height:1.45;margin:6px 0;min-height:34px}.ep .m{font-size:9.5px;color:#5a6b85;border-top:1px solid #EEE;padding-top:5px}.ep .m b{display:block;font-size:12px;color:#061A40}.nota{font-size:9.5px;color:#5a6b85;margin-top:8px;line-height:1.5}.pb{page-break-before:always;padding-top:4px}.cond h2{font-size:15px;color:#061A40;margin:0 0 8px}.cond ol{padding-left:18px;margin:0;font-size:10.5px;line-height:1.5}.cond li{margin-bottom:4px}.datos{margin-top:12px;border:1px solid #D8DCE5;background:#F5F7FA;padding:10px 12px;font-size:10.5px;line-height:1.6}.next{margin-top:12px;background:#FFF3EA;border:1px solid #FFD2B0;border-radius:8px;padding:10px 12px;font-size:10.5px;line-height:1.5}.firma{margin-top:14px;text-align:right;font-size:10.5px}.firma b{display:block}.foot{display:flex;margin-top:16px;border-radius:6px;overflow:hidden}.foot .n{background:#061A40;color:#fff;flex:1;padding:9px 12px;font-size:9.5px;font-weight:600;text-align:center}.foot .w{background:#FF6B00;color:#fff;padding:9px 14px;font-weight:700;font-size:10.5px}' }
function htmlOferta(cot) {
  const t = totales(cot)
  const rev = parseInt(cot.rev, 10) || 0
  const dv = diasValidez(cot)
  const eps = estadosDePago(cot)
  const logo = (function () { let l = ''; try { l = localStorage.getItem('serein_logo') || '' } catch (e) {} return l ? '<img src="' + l + '"/>' : '<div style="font-size:20px;font-weight:800;color:#061A40;margin-bottom:6px">SEREIN <span style="color:#FF6B00">GROUP</span></div>' })()
  const subLinea = [cot.asunto ? escH(cot.asunto) : '', 'Emitida el ' + fechaCorta(cot.fecha), dv ? 'Válida por ' + dv + ' días' : ''].filter(Boolean).join(' · ')
  const filas = (cot.items || []).map((it, i) => `<tr><td>${i + 1}</td><td>${escH(it.codigo)}</td><td><b>${escH(it.detalle)}</b>${it.descDetallada ? '<br><span style="color:#777">' + escH(it.descDetallada) + '</span>' : ''}${it.comentario ? '<br><span style="color:#777">' + escH(it.comentario) + '</span>' : ''}</td><td class="r">${fmtCant(it.cant)} ${escH(it.unidad || 'UN')}</td><td class="r">${clp(it.pUnitario)}</td><td class="r">${numDec(it.descuento) ? clp(it.descuento) : ''}</td><td class="r"><b>${clp(itemTotal(it))}</b></td></tr>`).join('')
  // Cubicación y sistema de pintura (opcionales). Los números salen de
  // ofertaCalc.js — nunca se tipean a mano en el documento.
  const precioCub = cot.cubPrecio || ((cot.items || [])[0] || {}).pUnitario
  const cub = calcCubicacion(cot.cubicacion, precioCub)
  const it0 = (cot.items || [])[0] || {}
  const m2Total = cub.m2 || (/m\s*2|m²/i.test(it0.unidad || '') ? numDec(it0.cant) : 0)
  const capasOk = (cot.capas || []).filter(c => numDec(c.dft) > 0)
  const capasHtml = capasOk.length ? `<div class="box"><h3 style="text-transform:none">Sistema de pintura · ${dftTotal(capasOk)} µm DFT total</h3>
      <table class="it"><thead><tr><th>Capa</th><th>Producto</th><th>Color</th><th style="text-align:right">DFT</th><th style="text-align:right">EPH control*</th><th style="text-align:right">Rend. teórico**</th>${m2Total > 0 ? '<th style="text-align:right">Consumo teórico · ' + fmtDec(m2Total, 2) + ' m²</th>' : ''}</tr></thead><tbody>
      ${capasOk.map((c, i) => { const r = calcCapa(c, m2Total); return `<tr><td>${i + 1}ª</td><td><b>${escH(c.producto)}</b></td><td>${escH(c.color)}</td><td class="r">${r.dft} µm</td><td class="r">${r.eph ? '≈ ' + r.eph + ' µm' : ''}</td><td class="r">${r.rendL ? fmtDec(r.rendL, 1) + ' m²/L · <b>' + fmtDec(r.rendGal, 1) + ' m²/gal</b>' : ''}</td>${m2Total > 0 ? '<td class="r">' + (r.litros ? fmtDec(r.litros, 1) + ' L · ' + fmtDec(r.galones, 1) + ' gal' : '') + '</td>' : ''}</tr>` }).join('')}
      <tr><td colspan="3"><b>Sistema completo</b></td><td class="r"><b>${dftTotal(capasOk)} µm</b></td><td></td><td></td>${m2Total > 0 ? '<td></td>' : ''}</tr></tbody></table>
      <div class="nota">* EPH: espesor húmedo de control, según sólidos en volumen. ** Al DFT indicado, según sólidos en volumen de las fichas técnicas del fabricante. Valores teóricos, sin pérdidas de aplicación.${cot.notaTecnica ? ' ' + escH(cot.notaTecnica) : ''}</div></div>` : (cot.notaTecnica ? `<div class="carta">${escH(cot.notaTecnica)}</div>` : '')
  const cubHtml = cub.rows.some(r => r.m2 > 0) ? `<div class="sec" style="margin-top:14px">Cubicación detallada</div>
      <table class="it"><thead><tr><th>Elemento</th><th>Dato informado</th><th>Criterio</th><th style="text-align:right">M² a pintar</th><th>Color</th><th style="text-align:right">Subtotal neto</th></tr></thead><tbody>
      ${cub.rows.map(r => `<tr><td>${escH(r.elemento)}</td><td>${escH(r.dato)}</td><td>${escH(r.criterio)}</td><td class="r">${fmtDec(r.m2, 2)}</td><td>${escH(r.color)}</td><td class="r">${clp(r.subtotal)}</td></tr>`).join('')}
      <tr><td colspan="3"><b>Total cubicado · precio unitario ${clp(precioCub)}/m²</b></td><td class="r"><b>${fmtDec(cub.m2, 2)}</b></td><td></td><td class="r"><b>${clp(cub.neto)}</b></td></tr></tbody></table>` : ''
  const epsHtml = eps.length ? `<div style="break-inside:avoid;page-break-inside:avoid"><div class="sec">Estados de pago propuestos</div>
    <div class="bar">${['#FF6B00', '#F79A5C', '#061A40', '#6B7A99'].map(c => '<i style="background:' + c + '"></i>').join('')}</div>
    <div class="eps">${eps.map((x, i) => `<div class="ep"><div class="h"><span>EP ${i + 1}${x.t ? ' · ' + escH(x.t) : ''}</span><b>${x.pct}%</b></div><div class="d">${escH(x.d || '')}</div><div class="m">Neto ${clp(x.neto)}<b>${clp(x.total)} <span style="font-size:9px;font-weight:400;color:#5a6b85">c/IVA</span></b></div></div>`).join('')}</div>
    <div class="nota">Montos calculados sobre el total de esta cotización. Cada estado de pago se factura al cumplirse su hito.</div></div>` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cotización ${escH(cot.folio)}${rev ? ' Rev. ' + rev : ''}</title><style>${estilosOferta()}</style></head><body>
    <div class="oh">
      <div>${logo}<div class="emp"><b>${escH(EMPRESA.nombre)}</b> · RUT ${escH(EMPRESA.rut)}<br>${escH(EMPRESA.direccion)} · ${escH(EMPRESA.email)} · ${escH(EMPRESA.telefono)}</div></div>
      <div class="doc"><div class="t">COTIZACIÓN</div><span class="pill">Folio N° ${escH(cot.folio)}${rev ? ' · Rev. ' + rev : ''}</span><div class="sub">${subLinea}</div></div>
    </div>
    ${cot.sistemaResumen ? `<div class="banner"><b>SISTEMA</b> &nbsp; ${escH(cot.sistemaResumen)}</div>` : ''}
    <div class="cli">
      <div><div class="l">Cliente</div><div class="v">${escH(cot.cliente)}</div></div>
      <div><div class="l">RUT</div><div class="v">${escH(cot.rut)}</div></div>
      <div><div class="l">Atención</div><div class="v">${escH(cot.atencion)}</div></div>
      <div><div class="l">Lugar de ejecución</div><div class="v">${escH(cot.lugarEjecucion)}</div></div>
      <div><div class="l">Condición de pago</div><div class="v">${escH(cot.condicionPago)}</div></div>
    </div>
    ${cot.carta ? `<div class="carta">${escH(cot.carta)}</div>` : ''}
    ${capasHtml}${cubHtml}
    <div class="box">
      <h3>Detalle y valorización</h3>
      <table class="it"><thead><tr><th>#</th><th>Código</th><th>Detalle</th><th style="text-align:right">Cant</th><th style="text-align:right">P. unitario</th><th style="text-align:right">Desc.</th><th style="text-align:right">Total</th></tr></thead><tbody>${filas}</tbody></table>
      <div class="tots"><table>
        <tr><td class="lbl">Neto</td><td class="r">${clp(t.afecto)}</td></tr>
        <tr><td class="lbl">IVA 19 %</td><td class="r">${clp(t.iva)}</td></tr>
        <tr class="big"><td class="lbl">Total</td><td class="r">${clp(t.total)}</td></tr>
      </table></div>
      <div class="words">Son: ${escH(enPalabras(t.total).toLowerCase())}.</div>
    </div>
    ${cot.comentario ? `<div class="nota" style="font-size:10.5px;color:#344054"><b>Comentario:</b> ${escH(cot.comentario)}</div>` : ''}
    ${epsHtml}
    <div class="${(capasOk.length || cub.rows.some(r => r.m2 > 0)) ? 'cond' : 'pb cond'}" style="margin-top:18px">
      <h2>Condiciones comerciales y operativas — SEREIN</h2>
      <ol>${condicionesDe(cot).map(c => `<li><b>${escH(c.t)}:</b> ${escH(c.x)}</li>`).join('')}</ol>
      <div class="datos">${datosTransferenciaHtml()}</div>
      ${cot.anexosMuestra ? '<div class="nota">Anexos: A · Protocolo de preparación de superficie (muestra) · B · Protocolo de pintura RC-PG-6 (muestra)</div>' : ''}
      <div class="next"><b>¿Siguiente paso?</b> Con su Orden de Compra activamos la programación de su trabajo. Coordinamos con gusto una visita a nuestras instalaciones para que su equipo conozca el proceso.</div>
      <div class="firma"><b>SEREIN Group</b>${escH(cot.vendedor || 'Gerencia Comercial')}</div>
      <div class="foot"><div class="n">Compromiso con la calidad · Seguridad en cada proceso · Excelencia en resultados</div><div class="w">www.sereingroup.cl</div></div>
    </div>
  </body></html>`
}
function imprimir(html) {
  const w = window.open('', '_blank')
  if (!w) { window.alert('Habilita las ventanas emergentes para descargar el documento.'); return }
  w.document.write(html)
  w.document.close()
  setTimeout(() => { w.focus(); w.print() }, 400)
}
// ---- Anexos de protocolos de muestra (A: PIG, B: PGP) ----
// Se generan con los mismos generadores de protocolos de las OT (OTModule),
// en blanco y con el esquema de esta cotización, y se unen al final del PDF.
// OTModule ya importa este archivo, así que se carga en el momento de usar
// (import dinámico) para no crear un ciclo de módulos.
const milsTxt = um => fmtDec(numDec(um) / 25.4, 1).replace(',', '.') + ' Mils'
function protocolosMuestra(cot, OT) {
  let instr = null
  try { instr = (JSON.parse(localStorage.getItem('serein_params') || '{}') || {}).instrumentos || null } catch (e) {}
  const capas = (cot.capas || []).filter(x => numDec(x.dft) > 0)
  const esquema = cot.sistemaResumen || capas.map(x => (x.producto || '') + (x.color ? ' ' + x.color : '') + ' ' + numDec(x.dft) + ' µm').join(' + ') + (capas.length ? ' · ' + dftTotal(capas) + ' µm DFT' : '')
  const ot = { numero: '', area: '', oc: '', nv: '', cliente: '', esquema: '' }
  const base = (tipo) => { const p = OT.nuevoProtocolo(tipo, ot, 'XXX', instr); p.fecha = ''; p.pgpCodigo = 'PGP XXX-2026'; p.esquemaProyecto = esquema; if (p.amb) p.amb.fecha = ''; return p }
  const pig = base('PIG')
  const pgp = base('PGP')
  if (capas.length) pgp.capas = capas.map((x, i) => ({ id: 'mu' + i, nombre: (['Primera', 'Segunda', 'Tercera', 'Cuarta', 'Quinta', 'Sexta'][i] || (i + 1) + 'ª') + ' capa', producto: (x.producto || '') + (x.color && !(x.producto || '').toLowerCase().includes(String(x.color).toLowerCase()) ? ' ' + x.color : ''), solicitado: milsTxt(x.dft), amb: { fecha: '', humedad: '', tAmbiente: '', tPieza: '', ptoRocio: '', horaInicio: '' }, filas: [0, 1, 2, 3, 4].map(() => ['', '', '', '', '', '', '']), fotos: [] }))
  return [
    { html: OT.htmlDeProtocolo(pig, instr), titulo: 'ANEXO A · Protocolo de preparación de superficie (muestra)' },
    { html: OT.htmlDeProtocolo(pgp, instr), titulo: 'ANEXO B · Protocolo de pintura RC-PG-6 (muestra)' },
  ]
}
// Une el documento principal con los anexos: los estilos de cada protocolo
// se conservan (sin su @page, para no cambiar los márgenes del principal) y
// cada anexo arranca en página nueva con un rótulo de identificación.
function unirConAnexos(htmlPrincipal, anexos, folio) {
  const estilos = [], cuerpos = []
  anexos.forEach(a => {
    const st = (a.html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || ''
    estilos.push(st.replace(/@page\{[^}]*\}/g, ''))
    let body = (a.html.match(/<body>([\s\S]*)<\/body>/) || [])[1] || ''
    const rotulo = '<div style="font:700 10px Arial;color:#5a6b85;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Cotización N° ' + escH(folio) + ' · ' + escH(a.titulo) + '</div>'
    body = body.replace('<div class="page">', '<div class="page">' + rotulo)
    cuerpos.push('<div style="page-break-before:always">' + body + '</div>')
  })
  return htmlPrincipal.replace('</style>', '</style><style>' + estilos.join('\n') + '</style>').replace('</body>', cuerpos.join('') + '</body>')
}
// Documento completo de la cotización (con anexos si corresponde).
export async function htmlCotizacionCompleta(cot) {
  const principal = htmlOferta(cot)
  if (!cot.anexosMuestra) return principal
  const OT = await import('./OTModule.jsx')
  return unirConAnexos(principal, protocolosMuestra(cot, OT), cot.folio)
}
export function descargarCotizacionPDF(cot) {
  if (!cot.anexosMuestra) { imprimir(htmlOferta(cot)); return }
  const w = window.open('', '_blank')
  if (!w) { window.alert('Habilita las ventanas emergentes para descargar el documento.'); return }
  w.document.write('<p style="font-family:Arial;padding:24px">Preparando cotización con anexos…</p>')
  htmlCotizacionCompleta(cot).catch(e => { console.error('anexos de muestra:', e); return htmlOferta(cot) }).then(html => {
    w.document.open(); w.document.write(html); w.document.close()
    setTimeout(() => { w.focus(); w.print() }, 500)
  })
}
export function descargarOTPDF(cot) { imprimir(htmlDoc(cot, { conValores: false, esOT: true })) }
// ---- Informe de compra de pintura (envases completos) ----
export function descargarInformePintura(cot) {
  const items = cot.items || []
  // Consolida por producto sumando envases de todas las piezas que tengan compras
  const filas = []
  let total = 0
  items.forEach((it, idx) => {
    ;(it.comprasPintura || []).forEach(cp => {
      total += cp.costo || 0
      filas.push({ pieza: idx + 1, detalle: it.detalle || ('Item ' + (idx + 1)), m2: it.m2 || 0, producto: cp.producto, envases: cp.envases, litrosEnvase: cp.litrosEnvase, litrosComprados: cp.litrosComprados, sobrante: cp.sobrante, costo: cp.costo })
    })
  })
  const consol = {}
  filas.forEach(f => { if (!consol[f.producto]) consol[f.producto] = { producto: f.producto, litrosEnvase: f.litrosEnvase, envases: 0, litrosComprados: 0, costo: 0 }; consol[f.producto].envases += f.envases; consol[f.producto].litrosComprados += f.litrosComprados; consol[f.producto].costo += f.costo })
  if (!filas.length) { window.alert('Esta cotizacion no tiene detalle de compra de pintura. Vuelve a generarla desde el cotizador (con m2 y esquema) para que quede guardado.'); return }
  const fmt = n => (Math.round((n || 0) * 10) / 10).toLocaleString('es-CL')
  const filasHtml = filas.map(f => `<tr><td>${f.pieza}</td><td>${f.detalle}</td><td class="r">${fmt(f.m2)} m\u00b2</td><td>${f.producto}</td><td class="r">${f.envases}</td><td class="r">${fmt(f.litrosEnvase)} L</td><td class="r">${fmt(f.litrosComprados)} L</td><td class="r">${fmt(f.sobrante)} L</td><td class="r">${clp(f.costo)}</td></tr>`).join('')
  const consolHtml = Object.values(consol).map(c => `<tr><td>${c.producto}</td><td class="r">${c.envases} x ${fmt(c.litrosEnvase)} L</td><td class="r">${fmt(c.litrosComprados)} L</td><td class="r">${clp(c.costo)}</td></tr>`).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Compra pintura ${cot.folio || ''}</title><style>${estilosDoc()} h2{font-family:Oswald,Arial;color:#101315;margin:14px 0 6px;font-size:15px} .sub{color:#5A636E;font-size:12px;margin-bottom:10px}</style></head><body>`
    + `<div class="head"><div class="emp"><b>${EMPRESA.nombre || 'SEREIN SpA'}</b><div>${EMPRESA.rut || ''}</div></div><div class="doc"><div class="t">Compra de pintura</div><div class="f">Cotizaci\u00f3n N\u00b0 ${cot.folio || ''}</div></div></div>`
    + `<div class="sub">Cliente: <b>${cot.cliente || ''}</b> \u00b7 Fecha: ${cot.fecha || ''} \u00b7 \u00c1rea: ${cot.area || ''}</div>`
    + `<h2>Total a comprar por producto</h2>`
    + `<table class="items"><thead><tr><th>Producto</th><th class="r">Envases</th><th class="r">Litros comprados</th><th class="r">Costo</th></tr></thead><tbody>${consolHtml}</tbody></table>`
    + `<table class="tot"><tr><td class="lbl big">Total compra pintura</td><td class="r big">${clp(total)}</td></tr></table>`
    + `<h2>Detalle por pieza</h2>`
    + `<table class="items"><thead><tr><th>Pieza</th><th>Detalle</th><th class="r">m\u00b2</th><th>Producto</th><th class="r">Env.</th><th class="r">L/env</th><th class="r">L comprados</th><th class="r">Sobra</th><th class="r">Costo</th></tr></thead><tbody>${filasHtml}</tbody></table>`
    + `<div class="sub" style="margin-top:12px">La pintura se vende por envase cerrado; el costo considera envases completos. \u201cSobra\u201d es el remanente que queda del \u00faltimo envase.</div>`
    + `</body></html>`
  imprimir(html)
}

// ---- Solicitud de compra de pintura al proveedor (PDF) ----
export function descargarSolicitudPintura(cot) {
const items = cot.items || []
const consol = {}
items.forEach(it => { (it.comprasPintura || []).forEach(cp => { if (!consol[cp.producto]) consol[cp.producto] = { producto: cp.producto, litrosEnvase: cp.litrosEnvase, envases: 0 }; consol[cp.producto].envases += cp.envases }) })
const rows = Object.values(consol)
if (!rows.length) { window.alert('Esta cotizacion no tiene detalle de compra de pintura. Genera la cotizacion desde el cotizador (con m2 y esquema) para que quede guardado.'); return }
const fmt = n => (Math.round((n || 0) * 10) / 10).toLocaleString('es-CL')
const totEnv = rows.reduce((a, c) => a + c.envases, 0)
const filasHtml = rows.map((c, i) => `<tr><td>${i + 1}</td><td>${c.producto}</td><td class="r">${c.envases}</td><td class="r">${fmt(c.litrosEnvase)} L</td><td class="r">${fmt(c.envases * c.litrosEnvase)} L</td></tr>`).join('')
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Solicitud pintura ${cot.folio || ''}</title><style>${estilosDoc()} h2{font-family:Oswald,Arial;color:#101315;margin:14px 0 6px;font-size:15px} .sub{color:#5A636E;font-size:12px;margin-bottom:10px}</style></head><body>`
+ `<div class="head"><div class="emp"><b>${EMPRESA.nombre || 'SEREIN SpA'}</b><div>R.U.T: ${EMPRESA.rut || ''}</div><div>${EMPRESA.direccion || ''}</div><div>${EMPRESA.email || ''}</div></div><div class="doc"><div class="t">Solicitud de compra</div><div class="f">Pintura · Cot. N° ${cot.folio || ''}</div></div></div>`
+ `<div class="sub">Fecha: ${new Date().toISOString().slice(0, 10)} · Obra/Cliente: ${cot.cliente || ''} · Área: ${cot.area || ''}</div>`
+ `<div style="font-size:12px;margin:6px 0 10px">Estimado proveedor, solicitamos cotizar y despachar los siguientes productos (envases completos):</div>`
+ `<table class="items"><thead><tr><th>#</th><th>Producto</th><th class="r">Envases</th><th class="r">Contenido/env</th><th class="r">Total litros</th></tr></thead><tbody>${filasHtml}</tbody></table>`
+ `<table class="tot"><tr><td class="lbl big">Total envases</td><td class="r big">${totEnv}</td></tr></table>`
+ `<div class="sub" style="margin-top:14px">Favor confirmar disponibilidad, precio y plazo de entrega. Despachar a: ${EMPRESA.direccion || ''}.</div>`
+ `<div class="datos" style="margin-top:10px;border:1px solid #D8DCE5;padding:10px;font-size:11px">Contacto: ${EMPRESA.nombre || ''} · ${EMPRESA.email || ''} · Tel: ${EMPRESA.telefono || ''}</div>`
+ `</body></html>`
imprimir(html)
}

// OT en PDF a partir de la OT real (refleja esquema, servicios, marcas
// esperadas, recepcion y despacho editados en la app). A proposito NO
// incluye protocolos de calidad (PIG/PGP) ni certificados de calibracion —
// esos se descargan aparte, desde cada protocolo. Tampoco incluye montos
// (mismo criterio de siempre: "documento sin valores, uso interno/taller").
function tablaDetalleMaterial(titulo, filas) {
  if (!filas.length) return ''
  const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100
  const rows = filas.map((p, i) => {
    const dif = r2(p.m2Propio) - r2(p.m2Cliente)
    const difTxt = (p.m2Cliente || p.m2Propio) ? (dif.toFixed(2) + ' m²') : '—'
    return `<tr><td>${i + 1}</td><td>${p.detalle || ''}</td><td>${p.fecha || ''}</td><td>${p.estado || ''}</td>
      <td class="r">${p.cantidad || ''}</td><td class="r">${p.m2 || ''}</td>
      <td class="r">${p.m2Cliente || ''}</td><td class="r">${p.m2Propio || ''}</td><td class="r">${difTxt}</td>
      <td>${p.tipo || ''}</td><td>${p.obs || ''}</td></tr>`
  }).join('')
  return `<div style="margin-top:12px"><b style="font-size:12px">${titulo}</b>
    <table class="items" style="margin-top:4px"><thead><tr><th>N°</th><th>Detalle</th><th>Fecha</th><th>Estado</th><th class="r">Cant.</th><th class="r">m²</th><th class="r">m² cliente</th><th class="r">m² propios</th><th class="r">Diferencia</th><th>Tipo</th><th>Observaciones</th></tr></thead><tbody>${rows}</tbody></table></div>`
}
function htmlOTDoc(ot) {
  const items = ot.itemsCot || []
  const filas = items.map((it, i) => `<tr><td>${i + 1}</td><td>${it.codigo || ''}</td><td><b>${it.detalle || ''}</b>${it.comentario ? '<br><span style="color:#777">Comentario: ' + it.comentario + '</span>' : ''}</td><td class="r">${fmtCant(it.cant)}</td><td>${it.unidad || 'UN'}</td></tr>`).join('')
  const partidas = ot.partidas || []
  const despachos = ot.despachos || []
  const marcasEsperadas = ot.marcasEsperadas || []
  const partHtml = tablaDetalleMaterial('Recepción / Partidas de material', partidas)
  const despHtml = tablaDetalleMaterial('Entregas / Despacho SEREIN', despachos)
  const marcasHtml = marcasEsperadas.length ? `<div style="margin-top:12px"><b style="font-size:12px">Marcas esperadas (checklist de recepción)</b>
    <table class="items" style="margin-top:4px"><thead><tr><th>Marca</th><th class="r">m² cliente</th><th class="r">m² propios</th><th>Recibida</th><th>Fecha recibida</th></tr></thead><tbody>
    ${marcasEsperadas.map(m => `<tr><td>${m.marca || ''}</td><td class="r">${m.m2 || ''}</td><td class="r">${m.m2Propio || ''}</td><td>${m.recibida ? 'Sí' : 'No'}</td><td>${m.fechaRecibida || ''}</td></tr>`).join('')}</tbody></table></div>` : ''
  const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100
  const m2c = r2(ot.m2)
  const m2r = r2(partidas.reduce((s, p) => s + (parseFloat(p.m2) || 0), 0))
  const m2d = r2(despachos.reduce((s, p) => s + (parseFloat(p.m2) || 0), 0))
  const m2planta = r2(m2r - m2d)
  const resumenM2Html = `<div style="margin-top:12px"><b style="font-size:12px">Resumen de m²</b>
    <table class="items" style="margin-top:4px"><thead><tr><th>m² cotización</th><th>m² recepcionados</th><th>m² despachados</th><th>m² en planta</th></tr></thead><tbody>
    <tr><td class="r">${m2c}</td><td class="r">${m2r}</td><td class="r">${m2d}</td><td class="r">${m2planta}</td></tr></tbody></table></div>`
  const esquema = (ot.esquema && ot.esquema !== '—') ? String(ot.esquema).replace(/\n/g, '<br>') : ''
  const servicios = ot.servicios ? String(ot.servicios).replace(/\n/g, '<br>') : ''; const pintHtml = (ot.pinturaCotizada && ot.pinturaCotizada.length) ? '<div style="margin-top:12px"><b style="font-size:12px">Pintura cotizada (tope de consumo)</b><table class="items" style="margin-top:4px"><thead><tr><th>Producto</th><th>Envases</th><th>Litros</th></tr></thead><tbody>' + ot.pinturaCotizada.map(p => '<tr><td>' + (p.producto || '') + '</td><td>' + (p.envases || 0) + '</td><td>' + (Math.round((p.litros || 0) * 10) / 10) + ' L</td></tr>').join('') + '</tbody></table><div style="font-size:10px;color:#777;margin-top:3px">No usar mas pintura que la cotizada para este proyecto.</div></div>' : ''
  return `<!doctype html><html><head><meta charset="utf-8"><title>OT ${ot.numero || ''}</title><style>${estilosDoc()}</style></head><body>
    <div class="head">
      ${(function(){var _l='';try{_l=localStorage.getItem('serein_logo')||''}catch(e){}return _l?'<img src="'+_l+'" style="height:46px;display:block;margin-bottom:8px"/>':''})()}
      <div class="emp"><b>${EMPRESA.nombre}</b><div>R.U.T: ${EMPRESA.rut}</div><div>${EMPRESA.direccion}</div><div>Tel: ${EMPRESA.telefono} · ${EMPRESA.email}</div></div>
      <div class="doc"><div class="t">Orden de trabajo</div><div class="f">${ot.numero || ''}</div></div>
    </div>
    <table class="cli"><tbody>
      <tr><td><div class="lbl">Cliente</div>${ot.cliente || ''}</td><td><div class="lbl">Área</div>${ot.area || ''}</td><td><div class="lbl">Cotización</div>${ot.cotizacion || ''}</td><td><div class="lbl">OC</div>${ot.oc || ''}</td></tr>
      <tr><td><div class="lbl">m²</div>${ot.m2 || 0}</td><td><div class="lbl">Preparación</div>${ot.preparacion || ''}</td><td><div class="lbl">Estado</div>${ot.estado || ''}</td><td></td></tr>
    </tbody></table>
    ${items.length ? `<table class="items"><thead><tr><th>Item</th><th>Código</th><th>Detalle</th><th>Cant</th><th>Unidad</th></tr></thead><tbody>${filas}</tbody></table>` : ''}
    ${esquema ? `<div style="margin-top:12px;font-size:11px"><b>Esquema de pintura:</b><br>${esquema}</div>` : ''}
    ${servicios ? `<div style="margin-top:8px;font-size:11px"><b>Servicios / observaciones:</b><br>${servicios}</div>` : ''}
    ${resumenM2Html}
    ${marcasHtml}
    ${partHtml}
    ${despHtml}
    ${pintHtml}
    <div class="badge" style="margin-top:12px">DOCUMENTO SIN VALORES · USO INTERNO / TALLER</div>
  </body></html>`
}
export function descargarOTDesdeOT(ot) { imprimir(htmlOTDoc(ot)) }

// Cotización vacía nueva
const hoy = () => new Date().toISOString().slice(0, 10)
function nuevaCot(folio) {
  return { id: 'cot' + Date.now(), folio: String(folio || ''), fecha: hoy(), vencimiento: hoy(), area: 'Santa Rosa', cliente: '', rut: '', giro: '', ciudad: '', comuna: '', direccion: '', condicionPago: 'CONTADO', vendedor: 'Venta general', comentario: '', estado: 'Alta probabilidad de cierre', estadoOtro: '', proveedorPintura: '', items: [{ codigo: 'SPP', detalle: 'SERVICIO GRANALLADO Y PINTURA EN PLANTA', cant: '', unidad: 'UN', pUnitario: '', descuento: '', descDetallada: '', comentario: '' }] }
}

// Mini panel para añadir un cliente nuevo a la lista maestra
function MiniAddCliente({ nombreInicial, onAdd, onCancel }) {
  const [c, setC] = useState({ nombre: nombreInicial || '', rut: '', giro: '', direccion: '', comuna: '' })
  const sc = (k, v) => setC({ ...c, [k]: v })
  return (
    <div style={{ background: '#F2F4F7', border: '1px solid #DFE4EA', padding: 12, marginTop: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.gris, textTransform: 'uppercase', marginBottom: 8 }}>Añadir cliente a la lista</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <input style={inp} placeholder="Nombre / Razón social *" value={c.nombre} onChange={e => sc('nombre', e.target.value)} />
        <input style={inp} placeholder="RUT" value={c.rut} onChange={e => sc('rut', e.target.value)} />
        <input style={inp} placeholder="Giro" value={c.giro} onChange={e => sc('giro', e.target.value)} />
        <input style={inp} placeholder="Dirección" value={c.direccion} onChange={e => sc('direccion', e.target.value)} />
        <input style={inp} placeholder="Comuna" value={c.comuna} onChange={e => sc('comuna', e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" onClick={() => c.nombre.trim() && onAdd(c)} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5 }}>Guardar cliente</button>
        <button type="button" onClick={onCancel} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5 }}>Cancelar</button>
      </div>
    </div>
  )
}

function FormCotizacion({ esEdicion = false, inicial, onGuardar, onCancelar, clientes = [], onAddCliente = () => {} }) {
  const [f, setF] = useState(inicial)
  const [addCli, setAddCli] = useState(false)
  const set = (k, v) => setF({ ...f, [k]: v })
  const _n = s => (s || '').trim().toLowerCase()
  const aplicarCliente = nombre => {
    const cli = (clientes || []).find(x => _n(x.nombre) === _n(nombre))
    if (cli) setF(prev => ({ ...prev, cliente: cli.nombre, rut: cli.rut || prev.rut, giro: cli.giro || prev.giro, direccion: cli.direccion || prev.direccion, comuna: cli.comuna || prev.comuna }))
    else setF(prev => ({ ...prev, cliente: nombre }))
  }
  const setItem = (i, k, v) => setF({ ...f, items: f.items.map((it, j) => j === i ? { ...it, [k]: v } : it) })
  const addItem = () => setF({ ...f, items: [...f.items, { codigo: 'SPP', detalle: '', cant: '', unidad: 'UN', pUnitario: '', descuento: '', descDetallada: '', comentario: '' }] })
  const delItem = i => setF({ ...f, items: f.items.filter((_, j) => j !== i) })
  // Estados de pago y condiciones: opcionales. Sin pagos no se dibuja ese
  // bloque; sin condiciones propias se usan las de siempre (CONDICIONES_DEF).
  const setPago = (i, k, v) => setF({ ...f, pagos: (f.pagos || []).map((x, j) => j === i ? { ...x, [k]: v } : x) })
  const addPago = () => setF({ ...f, pagos: [...(f.pagos || []), { t: '', pct: '', d: '' }] })
  const delPago = i => setF({ ...f, pagos: (f.pagos || []).filter((_, j) => j !== i) })
  const sumaPct = (f.pagos || []).reduce((a, x) => a + numDec(x.pct), 0)
  const personalizarCond = () => setF({ ...f, condiciones: condicionesEstandar().map(c => ({ ...c })) })
  const setCond = (i, k, v) => setF({ ...f, condiciones: f.condiciones.map((x, j) => j === i ? { ...x, [k]: v } : x) })
  const addCond = () => setF({ ...f, condiciones: [...f.condiciones, { t: '', x: '' }] })
  const delCond = i => setF({ ...f, condiciones: f.condiciones.filter((_, j) => j !== i) })
  // Nueva revisión: guarda una foto de la versión actual dentro de la
  // propia cotización (revisiones[]) y sube el N° de Rev. — el folio no
  // cambia. Nada se borra: la versión anterior queda consultable.
  const emitirRevision = () => {
    if (!window.confirm('Se guardará una copia de la versión actual (Rev. ' + (parseInt(f.rev, 10) || 0) + ') y esta pasará a Rev. ' + ((parseInt(f.rev, 10) || 0) + 1) + '. ¿Continuar?')) return
    const { revisiones, ...foto } = f
    setF({ ...f, revisiones: [...(revisiones || []), { rev: parseInt(f.rev, 10) || 0, fecha: f.fecha, snapshot: foto }], rev: (parseInt(f.rev, 10) || 0) + 1, fecha: hoy() })
  }
  // Sistema de pintura y cubicación (opcionales)
  const [cat] = useState(leerCatalogo)
  const setCapa = (i, k, v) => setF(prev => ({ ...prev, capas: (prev.capas || []).map((c, j) => {
    if (j !== i) return c
    const n = { ...c, [k]: v }
    if (k === 'producto') { const pr = buscarProducto(cat.productos, v); if (pr) { if (!numDec(n.s)) n.s = pr.s; if (!numDec(n.dmin) && pr.dmin) n.dmin = pr.dmin; if (!numDec(n.dmax) && pr.dmax) n.dmax = pr.dmax } }
    return n
  }) }))
  const addCapa = () => setF({ ...f, capas: [...(f.capas || []), { producto: '', color: '', s: '', dft: '', dmin: '', dmax: '' }] })
  const delCapa = i => setF({ ...f, capas: (f.capas || []).filter((_, j) => j !== i) })
  const cargarEsquema = nombre => {
    const es = (cat.esquemas || []).find(x => x.n === nombre); if (!es) return
    setF({ ...f, capas: (es.capas || []).map(c => { const pr = buscarProducto(cat.productos, c.p); return { producto: c.p, color: '', s: pr ? pr.s : '', dft: milsAMicras(c.m), dmin: pr && pr.dmin ? pr.dmin : '', dmax: pr && pr.dmax ? pr.dmax : '' } }) })
  }
  const setCub = (i, k, v) => setF({ ...f, cubicacion: (f.cubicacion || []).map((r, j) => j === i ? { ...r, [k]: v } : r) })
  const addCub = () => setF({ ...f, cubicacion: [...(f.cubicacion || []), { elemento: '', dato: '', criterio: '', m2: '', color: '' }] })
  const delCub = i => setF({ ...f, cubicacion: (f.cubicacion || []).filter((_, j) => j !== i) })
  const cubCalc = calcCubicacion(f.cubicacion, f.cubPrecio || (f.items && f.items[0] ? f.items[0].pUnitario : 0))
  const m2Item0 = numDec(f.items && f.items[0] ? f.items[0].cant : 0)
  // ---- Asistente IA ----
  // La IA solo LEE (extraer-cubicacion) y REDACTA (redactar-oferta); nunca
  // guarda nada por su cuenta. Los m² los calcula el navegador con el
  // criterio que elige la persona por fila, y todo pasa por un panel de
  // revisión antes de aplicarse.
  const [lectura, setLectura] = useState(null)
  const [redaccion, setRedaccion] = useState(null)
  const [instrucciones, setInstrucciones] = useState('')
  const esExcel = fl => /\.(xlsx|xlsm|xls|csv)$/i.test(fl.name || '')
  const leerCubicacion = async e => {
    const fls = [...(e.target.files || [])]
    e.target.value = ''
    if (!fls.length) return
    setLectura({ cargando: true })
    try {
      const archivos = [], textos = []
      for (const fl of fls) {
        if (esExcel(fl)) {
          const wb = XLSX.read(await fl.arrayBuffer(), { type: 'array' })
          wb.SheetNames.forEach(n => { const csv = XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: ';', blankrows: false }); if (csv.trim()) textos.push('### Hoja: ' + n + '\n' + csv) })
        } else archivos.push({ base64: await fileToBase64(fl), mimeType: fl.type || 'application/pdf', filename: fl.name })
      }
      const { data, error } = await supabase.functions.invoke('extraer-cubicacion', { body: { archivos, texto: textos.join('\n\n'), filename: fls[0].name } })
      if (error) throw error
      if (!data || !data.ok) throw new Error((data && data.error) || 'No se pudo leer el documento.')
      const d = data.datos || {}
      setLectura({ datos: d, filas: (d.filas || []).map(fi => { const cr = criterioPorDefecto(fi); return { ...fi, aplicar: true, criterio: cr, factor: '', m2: String(m2DeFila(fi, cr, '')).replace('.', ',') } }) })
    } catch (err) { setLectura({ error: (err && err.message) || String(err) }) }
  }
  const setFilaLectura = (i, cambios) => setLectura(l => ({ ...l, filas: l.filas.map((fi, j) => {
    if (j !== i) return fi
    const n = { ...fi, ...cambios }
    if ('criterio' in cambios || 'factor' in cambios) n.m2 = String(m2DeFila(n, n.criterio, n.factor)).replace('.', ',')
    return n
  }) }))
  const aplicarLectura = () => {
    const d = lectura.datos || {}
    const nuevas = lectura.filas.filter(x => x.aplicar).map(x => ({ elemento: x.elemento, dato: x.dato, criterio: (CRITERIOS_M2.find(c => c.id === x.criterio) || {}).texto || '', m2: x.m2, color: '' }))
    setF(prev => ({
      ...prev,
      cubicacion: [...(prev.cubicacion || []), ...nuevas],
      atencion: prev.atencion || d.contacto || '',
      lugarEjecucion: prev.lugarEjecucion || d.lugarEjecucion || '',
      requerimiento: [d.esquemaSolicitado ? 'Esquema solicitado por el cliente: ' + d.esquemaSolicitado : '', d.observaciones ? 'Observaciones: ' + d.observaciones : ''].filter(Boolean).join('\n') || prev.requerimiento || '',
    }))
    setLectura(null)
  }
  const datosParaRedactar = () => {
    const capasOk = (f.capas || []).filter(c => numDec(c.dft) > 0)
    const cubR = calcCubicacion(f.cubicacion, f.cubPrecio || (f.items && f.items[0] ? f.items[0].pUnitario : 0))
    const it0 = (f.items || [])[0] || {}
    const m2Total = cubR.m2 || (/m\s*2|m²/i.test(it0.unidad || '') ? numDec(it0.cant) : 0)
    return {
      cliente: f.cliente || null, atencion: f.atencion || null, lugarEjecucion: f.lugarEjecucion || null, condicionPago: f.condicionPago || null,
      servicio: it0.detalle || null, m2Total: m2Total || null, dftTotalUm: capasOk.length ? dftTotal(capasOk) : null,
      capas: capasOk.map(c => { const r = calcCapa(c, 0); return { producto: c.producto || null, color: c.color || null, dftUm: r.dft, solidosVolPct: numDec(c.s) || null, rangoFichaTecnica: r.rango === null ? 'sin dato' : (r.rango ? 'dentro' : 'fuera') } }),
      cubicacion: cubR.rows.filter(r => r.m2 > 0).map(r => ({ elemento: r.elemento, m2: r.m2, criterio: r.criterio || null, color: r.color || null })),
    }
  }
  const redactar = async () => {
    setRedaccion({ cargando: true })
    try {
      const datos = datosParaRedactar()
      const { data, error } = await supabase.functions.invoke('redactar-oferta', { body: { datos, requerimiento: f.requerimiento || '', instrucciones } })
      if (error) throw error
      if (!data || !data.ok) throw new Error((data && data.error) || 'No se pudo redactar.')
      const pr = data.propuesta || {}
      setRedaccion({ datos, valores: { asunto: pr.asunto || '', sistemaResumen: pr.sistemaResumen || '', carta: pr.carta || '', notaTecnica: pr.notaTecnica || '' }, aplicar: { asunto: !!pr.asunto, sistemaResumen: !!pr.sistemaResumen, carta: !!pr.carta, notaTecnica: !!pr.notaTecnica } })
    } catch (err) { setRedaccion({ error: (err && err.message) || String(err) }) }
  }
  const aplicarRedaccion = () => {
    const v = redaccion.valores, ap = redaccion.aplicar
    setF(prev => { const n = { ...prev }; ['asunto', 'sistemaResumen', 'carta', 'notaTecnica'].forEach(k => { if (ap[k]) n[k] = v[k] }); return n })
    setRedaccion(null)
  }
  const t = totales(f)
  const lab = { fontSize: 11, color: C.gris, display: 'flex', flexDirection: 'column', gap: 3 }
  return (
    <div style={{ background: '#fff', border: `2px solid ${C.teal}`, padding: 16, marginBottom: 16 }}>
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 15, textTransform: 'uppercase', marginBottom: 12 }}>Cotización · Folio N° {f.folio || '—'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <label style={lab}>Folio N° (correlativo automático)<input style={{ ...inp, background: '#E2E7EC', fontWeight: 600 }} value={f.folio} readOnly /></label>
        <div style={{ ...lab, gridColumn: '1 / -1' }}>Área / módulo al que irá la OT *
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {AREAS.map(a => (
              <button key={a} type="button" onClick={() => set('area', a)} style={{ padding: '8px 16px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, border: '1px solid ' + (f.area === a ? C.teal : '#DFE4EA'), background: f.area === a ? C.teal : '#fff', color: f.area === a ? '#fff' : C.carbon }}>{a}</button>
            ))}
          </div>
        </div>
        <div style={{ ...lab, gridColumn: '1 / -1' }}>Cliente / Señor(es) *
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <input style={{ ...inp, flex: '1 1 220px' }} list="dl-cot-cli" value={f.cliente} onChange={e => aplicarCliente(e.target.value)} placeholder="Escribe y selecciona; se autocompletan sus datos" />
            <button type="button" onClick={() => setAddCli(v => !v)} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, whiteSpace: 'nowrap' }}>+ Añadir cliente</button>
          </div>
          <datalist id="dl-cot-cli">{(clientes || []).map(cl => <option key={cl.id || cl.nombre} value={cl.nombre} />)}</datalist>
          {addCli && <MiniAddCliente nombreInicial={f.cliente} onAdd={cli => { onAddCliente(cli); setF(prev => ({ ...prev, cliente: cli.nombre, rut: cli.rut || '', giro: cli.giro || '', direccion: cli.direccion || '', comuna: cli.comuna || '' })); setAddCli(false) }} onCancel={() => setAddCli(false)} />}
        </div>
        <label style={lab}>R.U.T<input style={inp} value={f.rut} onChange={e => set('rut', e.target.value)} /></label>
        <label style={lab}>Giro<input style={inp} value={f.giro} onChange={e => set('giro', e.target.value)} /></label>
        <label style={lab}>Dirección<input style={inp} value={f.direccion} onChange={e => set('direccion', e.target.value)} /></label>
        <label style={lab}>Ciudad<input style={inp} value={f.ciudad} onChange={e => set('ciudad', e.target.value)} /></label>
        <label style={lab}>Comuna<input style={inp} value={f.comuna} onChange={e => set('comuna', e.target.value)} /></label>
        <label style={lab}>Condición de pago<input style={inp} value={f.condicionPago} onChange={e => set('condicionPago', e.target.value)} /></label>
        <label style={lab}>Vendedor
          <select style={inp} value={f.vendedor} onChange={e => set('vendedor', e.target.value)}>
            <option value="Venta general">Venta general</option>
            <option value="Mario Vidal">Mario Vidal</option>
          </select>
        </label>
        <label style={lab}>Fecha documento<input type="date" style={inp} value={f.fecha} onChange={e => set('fecha', e.target.value)} /></label>
        <label style={lab}>Fecha vencimiento<input type="date" style={inp} value={f.vencimiento} onChange={e => set('vencimiento', e.target.value)} /></label>
        <label style={{ ...lab, gridColumn: '1 / -1' }}>Proveedor de pintura (para la OC)<input list="dl-cot-provpint" style={inp} value={f.proveedorPintura || ''} onChange={e => set('proveedorPintura', e.target.value)} placeholder="Escribe o elige un proveedor de pintura" /><datalist id="dl-cot-provpint">{PROVEEDORES_FICHA.map(p => <option key={p.id || p.nombre} value={p.nombre} />)}</datalist></label>
      </div>

      <div style={{ marginTop: 12, border: '1px solid #CFE3E8', background: '#F3FAFB', padding: '10px 12px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, textTransform: 'uppercase', marginBottom: 6 }}>Asistente IA (opcional) — propone, tú revisas y aplicas</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ background: C.teal, color: '#fff', padding: '7px 12px', fontSize: 12.5, cursor: lectura && lectura.cargando ? 'wait' : 'pointer', opacity: lectura && lectura.cargando ? 0.7 : 1 }}>
            {lectura && lectura.cargando ? 'Leyendo…' : 'Leer cubicación del cliente (PDF / Excel / foto)'}
            <input type="file" accept="application/pdf,image/*,.xlsx,.xlsm,.xls,.csv" multiple style={{ display: 'none' }} disabled={!!(lectura && lectura.cargando)} onChange={leerCubicacion} />
          </label>
          <button type="button" onClick={redactar} disabled={!!(redaccion && redaccion.cargando)} style={{ background: C.carbon, color: '#fff', border: 'none', padding: '7px 12px', fontSize: 12.5, cursor: 'pointer', opacity: redaccion && redaccion.cargando ? 0.7 : 1 }}>{redaccion && redaccion.cargando ? 'Redactando…' : 'Redactar carta y nota técnica'}</button>
          <input style={{ ...inp, flex: '1 1 240px' }} placeholder="Indicaciones para la redacción (opcional, ej. destacar que se pinta en planta)" value={instrucciones} onChange={e => setInstrucciones(e.target.value)} />
        </div>
        <div style={{ fontSize: 11, color: C.gris, marginTop: 6 }}>La IA solo transcribe y redacta: los m², precios y espesores los calcula el sistema. Para redactar, primero carga cliente, capas y cubicación.</div>

        {lectura && lectura.error && <div style={{ marginTop: 8, fontSize: 12.5, color: C.rojo }}>No se pudo leer: {lectura.error} <button type="button" onClick={() => setLectura(null)} style={{ marginLeft: 6, background: 'none', border: '1px solid #DFE4EA', padding: '2px 8px', cursor: 'pointer', fontSize: 11.5 }}>Cerrar</button></div>}
        {lectura && lectura.filas && (
          <div style={{ marginTop: 10, background: '#fff', border: '1px solid #DFE4EA', padding: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Revisión de la cubicación leída ({lectura.filas.length} filas)</div>
            {lectura.datos && (lectura.datos.esquemaSolicitado || lectura.datos.observaciones) && <div style={{ fontSize: 11.5, color: C.gris, marginBottom: 6 }}>{lectura.datos.esquemaSolicitado && <div><b>Esquema pedido:</b> {lectura.datos.esquemaSolicitado}</div>}{lectura.datos.observaciones && <div><b>Observaciones:</b> {lectura.datos.observaciones}</div>}</div>}
            <div style={{ fontSize: 11.5, color: C.rojo, marginBottom: 6 }}>Elige cuántas caras / qué factor aplica en cada fila: el m² se recalcula solo. Revisa que lo leído coincida con el documento.</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ borderBottom: '2px solid ' + C.carbon }}>{['', 'Elemento', 'Dato leído', 'Criterio', 'Factor', 'M² a pintar'].map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {lectura.filas.map((fi, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #E2E7EC' }}>
                      <td style={{ padding: '3px 6px' }}><input type="checkbox" checked={fi.aplicar} onChange={e => setFilaLectura(i, { aplicar: e.target.checked })} /></td>
                      <td style={{ padding: '3px 4px' }}><input style={{ ...inp, width: 260, padding: '4px 6px' }} value={fi.elemento} onChange={e => setFilaLectura(i, { elemento: e.target.value })} /></td>
                      <td style={{ padding: '3px 4px' }}><input style={{ ...inp, width: 100, padding: '4px 6px' }} value={fi.dato} onChange={e => setFilaLectura(i, { dato: e.target.value })} /></td>
                      <td style={{ padding: '3px 4px' }}><select style={{ ...inp, padding: '4px 6px' }} value={fi.criterio} onChange={e => setFilaLectura(i, { criterio: e.target.value })}>{CRITERIOS_M2.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></td>
                      <td style={{ padding: '3px 4px' }}>{fi.criterio === 'manual' ? <input style={{ ...inp, width: 60, padding: '4px 6px', textAlign: 'right' }} value={fi.factor} onChange={e => setFilaLectura(i, { factor: e.target.value })} placeholder="×" /> : <span style={{ color: C.gris }}>—</span>}</td>
                      <td style={{ padding: '3px 4px' }}><input style={{ ...inp, width: 80, padding: '4px 6px', textAlign: 'right' }} value={fi.m2} onChange={e => setFilaLectura(i, { m2: e.target.value })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={aplicarLectura} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5 }}>Agregar {lectura.filas.filter(x => x.aplicar).length} fila(s) a la cubicación</button>
              <button type="button" onClick={() => setLectura(null)} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5 }}>Descartar</button>
            </div>
          </div>
        )}

        {redaccion && redaccion.error && <div style={{ marginTop: 8, fontSize: 12.5, color: C.rojo }}>No se pudo redactar: {redaccion.error} <button type="button" onClick={() => setRedaccion(null)} style={{ marginLeft: 6, background: 'none', border: '1px solid #DFE4EA', padding: '2px 8px', cursor: 'pointer', fontSize: 11.5 }}>Cerrar</button></div>}
        {redaccion && redaccion.valores && (
          <div style={{ marginTop: 10, background: '#fff', border: '1px solid #DFE4EA', padding: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Propuesta de redacción — edita lo que quieras antes de aplicar</div>
            {[['asunto', 'Asunto', 1], ['sistemaResumen', 'Sistema (franja azul)', 2], ['carta', 'Carta introductoria', 6], ['notaTecnica', 'Nota técnica', 3]].map(([k, lbl, rows]) => {
              const raros = redaccion.aplicar[k] ? cifrasNoRespaldadas(redaccion.valores[k], redaccion.datos) : []
              return (
                <div key={k} style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11.5, color: C.gris, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}><input type="checkbox" checked={!!redaccion.aplicar[k]} onChange={e => setRedaccion(r => ({ ...r, aplicar: { ...r.aplicar, [k]: e.target.checked } }))} /> {lbl}{(f[k] || '').trim() && <span style={{ color: C.ambar }}> · reemplazará el texto actual</span>}</label>
                  <textarea rows={rows} style={{ ...inp, width: '100%', fontFamily: 'inherit', lineHeight: 1.4, resize: 'vertical' }} value={redaccion.valores[k]} onChange={e => setRedaccion(r => ({ ...r, valores: { ...r.valores, [k]: e.target.value } }))} />
                  {raros.length > 0 && <div style={{ fontSize: 11.5, color: C.rojo, fontWeight: 700 }}>⚠ Cifras que no están en los datos de la cotización: {raros.join(', ')} — revísalas o bórralas.</div>}
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={aplicarRedaccion} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5 }}>Aplicar a la cotización</button>
              <button type="button" onClick={redactar} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5 }}>Redactar de nuevo</button>
              <button type="button" onClick={() => setRedaccion(null)} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5 }}>Descartar</button>
            </div>
          </div>
        )}
      </div>

      <details style={{ marginTop: 12, border: '1px solid #DFE4EA', padding: '8px 12px', background: '#FAFBFC' }} open={!!(f.asunto || f.sistemaResumen || f.carta || f.atencion || f.lugarEjecucion || (f.pagos || []).length || f.condiciones || (parseInt(f.rev, 10) || 0) > 0)}>
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.carbon, textTransform: 'uppercase' }}>Formato oferta (opcional): atención, sistema, carta, estados de pago, condiciones, revisión</summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginTop: 10 }}>
          <label style={lab}>Atención (nombre del contacto)<input style={inp} value={f.atencion || ''} onChange={e => set('atencion', e.target.value)} /></label>
          <label style={lab}>Lugar de ejecución<input style={inp} value={f.lugarEjecucion || ''} onChange={e => set('lugarEjecucion', e.target.value)} placeholder="ej. Planta SEREIN, Lampa" /></label>
          <label style={{ ...lab, gridColumn: '1 / -1' }}>Asunto (subtítulo bajo el folio)<input style={inp} value={f.asunto || ''} onChange={e => set('asunto', e.target.value)} placeholder="ej. Alternativa sistema Jotun" /></label>
          <label style={{ ...lab, gridColumn: '1 / -1' }}>Sistema (franja azul: esquema, espesor total, colores)<textarea rows={2} style={{ ...inp, fontFamily: 'inherit', resize: 'vertical' }} value={f.sistemaResumen || ''} onChange={e => set('sistemaResumen', e.target.value)} /></label>
          <label style={{ ...lab, gridColumn: '1 / -1' }}>Carta / texto introductorio<textarea rows={4} style={{ ...inp, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.4 }} value={f.carta || ''} onChange={e => set('carta', e.target.value)} placeholder="Saludo y explicación breve de la propuesta (opcional)" /></label>
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.gris, textTransform: 'uppercase', margin: '12px 0 6px' }}>Estados de pago</div>
        {(f.pagos || []).map((x, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <input style={{ ...inp, width: 120 }} placeholder="Nombre (Anticipo…)" value={x.t || ''} onChange={e => setPago(i, 't', e.target.value)} />
            <input style={{ ...inp, width: 70, textAlign: 'right' }} placeholder="%" value={x.pct || ''} onChange={e => setPago(i, 'pct', e.target.value)} />
            <input style={{ ...inp, flex: '1 1 240px' }} placeholder="Hito / condición (ej. Con la Orden de Compra)" value={x.d || ''} onChange={e => setPago(i, 'd', e.target.value)} />
            <button type="button" onClick={() => delPago(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button>
          </div>
        ))}
        <button type="button" onClick={addPago} style={{ background: 'none', border: '1px dashed #DFE4EA', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.gris }}>+ Estado de pago</button>
        {(f.pagos || []).length > 0 && <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 700, color: Math.abs(sumaPct - 100) < 0.01 ? C.verde : C.rojo }}>Suma: {sumaPct}% {Math.abs(sumaPct - 100) < 0.01 ? '✓' : '— debería sumar 100%'}</span>}
        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.gris, textTransform: 'uppercase', margin: '14px 0 6px' }}>Condiciones comerciales</div>
        {!f.condiciones ? (
          <div style={{ fontSize: 12, color: C.gris }}>Se usan las condiciones estándar de SEREIN. <button type="button" onClick={personalizarCond} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>Personalizar para esta cotización</button></div>
        ) : (
          <>
            {f.condiciones.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: C.gris, width: 18, paddingTop: 7 }}>{i + 1}.</span>
                <input style={{ ...inp, width: 200 }} placeholder="Título" value={c.t || ''} onChange={e => setCond(i, 't', e.target.value)} />
                <textarea rows={2} style={{ ...inp, flex: '1 1 300px', fontFamily: 'inherit', resize: 'vertical' }} placeholder="Texto" value={c.x || ''} onChange={e => setCond(i, 'x', e.target.value)} />
                <button type="button" onClick={() => delCond(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button>
              </div>
            ))}
            <button type="button" onClick={addCond} style={{ background: 'none', border: '1px dashed #DFE4EA', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.gris }}>+ Condición</button>
            <button type="button" onClick={() => window.confirm('¿Volver a las condiciones estándar?') && setF({ ...f, condiciones: null })} style={{ marginLeft: 8, background: 'none', border: '1px solid #DFE4EA', padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>Restaurar estándar</button>
          </>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, margin: '14px 0 0' }}><input type="checkbox" checked={!!f.anexosMuestra} onChange={e => set('anexosMuestra', e.target.checked)} /> Incluir al final los protocolos de muestra (Anexo A: PIG · Anexo B: PGP con el esquema de esta cotización)</label>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.gris, textTransform: 'uppercase', margin: '14px 0 6px' }}>Revisión</div>
        <div style={{ fontSize: 12.5 }}>Revisión actual: <b>Rev. {parseInt(f.rev, 10) || 0}</b> {(f.revisiones || []).length > 0 && <span style={{ color: C.gris }}>· {(f.revisiones || []).length} versión(es) anterior(es) guardada(s)</span>}
          {esEdicion && (f.items || []).length > 0 && <button type="button" onClick={emitirRevision} style={{ marginLeft: 10, background: C.teal, color: '#fff', border: 'none', padding: '5px 12px', cursor: 'pointer', fontSize: 12 }}>Emitir nueva revisión</button>}
        </div>
      </details>

      <details style={{ marginTop: 10, border: '1px solid #DFE4EA', padding: '8px 12px', background: '#FAFBFC' }} open={!!((f.capas || []).length || (f.cubicacion || []).length || f.notaTecnica)}>
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.carbon, textTransform: 'uppercase' }}>Sistema de pintura y cubicación (opcional): capas con espesores, rendimiento y m² por ítem</summary>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0 6px' }}>
          <select style={{ ...inp, maxWidth: 360 }} value="" onChange={e => { if (e.target.value) cargarEsquema(e.target.value) }}>
            <option value="">Cargar esquema del catálogo…</option>
            {(cat.esquemas || []).map(es => <option key={es.n} value={es.n}>{es.n}</option>)}
          </select>
          <span style={{ fontSize: 11.5, color: C.gris }}>Trae producto, sólidos y espesor (mils → µm); el color y los rangos de ficha los completas tú.</span>
        </div>
        <datalist id="dl-cot-prods">{(cat.productos || []).map(pr => <option key={pr.n} value={pr.n} />)}</datalist>
        {(f.capas || []).map((c, i) => { const r = calcCapa(c, 0); return (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: C.gris, width: 22 }}>{i + 1}ª</span>
            <input list="dl-cot-prods" style={{ ...inp, width: 200 }} placeholder="Producto" value={c.producto || ''} onChange={e => setCapa(i, 'producto', e.target.value)} />
            <input style={{ ...inp, width: 100 }} placeholder="Color" value={c.color || ''} onChange={e => setCapa(i, 'color', e.target.value)} />
            <input style={{ ...inp, width: 64, textAlign: 'right' }} placeholder="Sól. %" title="Sólidos en volumen %" value={c.s || ''} onChange={e => setCapa(i, 's', e.target.value)} />
            <input style={{ ...inp, width: 70, textAlign: 'right' }} placeholder="DFT µm" value={c.dft || ''} onChange={e => setCapa(i, 'dft', e.target.value)} />
            <input style={{ ...inp, width: 64, textAlign: 'right' }} placeholder="Fic. mín" title="DFT mínimo de la ficha técnica (µm)" value={c.dmin || ''} onChange={e => setCapa(i, 'dmin', e.target.value)} />
            <input style={{ ...inp, width: 64, textAlign: 'right' }} placeholder="Fic. máx" title="DFT máximo de la ficha técnica (µm)" value={c.dmax || ''} onChange={e => setCapa(i, 'dmax', e.target.value)} />
            <span style={{ fontSize: 11.5, color: C.gris, minWidth: 190 }}>{r.rendL ? 'EPH ≈ ' + r.eph + ' µm · ' + fmtDec(r.rendL, 1) + ' m²/L · ' + fmtDec(r.rendGal, 1) + ' m²/gal' : 'completa sólidos y DFT'}</span>
            {r.rango === false && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.rojo }}>⚠ fuera del rango de la ficha ({r.dmin || '—'}–{r.dmax || '—'} µm)</span>}
            {r.rango === true && <span style={{ fontSize: 11.5, color: C.verde }}>✓ dentro de ficha</span>}
            <button type="button" onClick={() => delCapa(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button>
          </div>) })}
        <button type="button" onClick={addCapa} style={{ background: 'none', border: '1px dashed #DFE4EA', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.gris }}>+ Capa</button>
        {(f.capas || []).length > 0 && <span style={{ marginLeft: 10, fontSize: 12.5, fontWeight: 700 }}>DFT total: {dftTotal(f.capas)} µm</span>}
        <label style={{ ...lab, marginTop: 10 }}>Nota técnica (se imprime bajo la tabla de capas)<textarea rows={3} style={{ ...inp, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.4 }} value={f.notaTecnica || ''} onChange={e => set('notaTecnica', e.target.value)} /></label>

        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.gris, textTransform: 'uppercase', margin: '14px 0 6px' }}>Cubicación detallada</div>
        {(f.cubicacion || []).map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input style={{ ...inp, flex: '1 1 220px' }} placeholder="Elemento (ej. Puertas de emergencia, 3 un)" value={r.elemento || ''} onChange={e => setCub(i, 'elemento', e.target.value)} />
            <input style={{ ...inp, width: 110 }} placeholder="Dato informado" value={r.dato || ''} onChange={e => setCub(i, 'dato', e.target.value)} />
            <input style={{ ...inp, width: 100 }} placeholder="Criterio" value={r.criterio || ''} onChange={e => setCub(i, 'criterio', e.target.value)} />
            <input style={{ ...inp, width: 80, textAlign: 'right' }} placeholder="M²" value={r.m2 || ''} onChange={e => setCub(i, 'm2', e.target.value)} />
            <input style={{ ...inp, width: 90 }} placeholder="Color" value={r.color || ''} onChange={e => setCub(i, 'color', e.target.value)} />
            <span style={{ fontSize: 12, minWidth: 90, textAlign: 'right' }}>{clp(cubCalc.rows[i] ? cubCalc.rows[i].subtotal : 0)}</span>
            <button type="button" onClick={() => delCub(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button>
          </div>
        ))}
        <button type="button" onClick={addCub} style={{ background: 'none', border: '1px dashed #DFE4EA', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.gris }}>+ Fila de cubicación</button>
        {(f.cubicacion || []).length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12.5, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>Total: <b>{fmtDec(cubCalc.m2, 2)} m²</b> · neto <b>{clp(cubCalc.neto)}</b> (a {clp(f.cubPrecio || (f.items && f.items[0] ? f.items[0].pUnitario : 0))}/m²)</span>
            <label style={{ fontSize: 11.5, color: C.gris }}>Precio unitario de la tabla <input style={{ ...inp, width: 90, textAlign: 'right', marginLeft: 4 }} value={f.cubPrecio || ''} onChange={e => set('cubPrecio', e.target.value)} placeholder="ítem 1" /></label>
            {Math.abs(cubCalc.m2 - m2Item0) > 0.005 && <span style={{ color: C.rojo, fontWeight: 700 }}>⚠ el ítem 1 tiene {fmtDec(m2Item0, 2)} m² y la cubicación suma {fmtDec(cubCalc.m2, 2)} m² <button type="button" onClick={() => setF({ ...f, items: f.items.map((it, j) => j === 0 ? { ...it, cant: String(cubCalc.m2).replace('.', ',') } : it) })} style={{ marginLeft: 6, background: C.teal, color: '#fff', border: 'none', padding: '3px 8px', cursor: 'pointer', fontSize: 11.5 }}>Usar {fmtDec(cubCalc.m2, 2)} m² en el ítem 1</button></span>}
          </div>
        )}
      </details>

      <div style={{ fontSize: 12, fontWeight: 600, color: C.gris, textTransform: 'uppercase', margin: '14px 0 6px' }}>Ítems</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['Código', 'Detalle', 'Cant', 'Unid', 'P. Unitario', 'Desc.', 'Comentario/Esquema', 'Total', ''].map(h => <th key={h} style={{ textAlign: ['P. Unitario', 'Desc.', 'Total', 'Cant'].includes(h) ? 'right' : 'left', padding: '4px 6px', fontSize: 10, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
          <tbody>
            {f.items.map((it, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #E2E7EC' }}>
                <td style={{ padding: '3px 4px' }}><input value={it.codigo} onChange={e => setItem(i, 'codigo', e.target.value)} style={{ ...inp, width: 60, padding: '5px 6px' }} /></td>
                <td style={{ padding: '3px 4px', verticalAlign: 'top' }}><textarea value={it.detalle} onChange={e => setItem(i, 'detalle', e.target.value)} rows={3} style={{ ...inp, width: 280, minWidth: 240, padding: '6px 8px', resize: 'both', fontFamily: 'inherit', lineHeight: 1.4 }} /></td>
                <td style={{ padding: '3px 4px', textAlign: 'right' }}><input value={it.cant} onChange={e => setItem(i, 'cant', e.target.value)} style={{ ...inp, width: 55, padding: '5px 6px', textAlign: 'right' }} /></td>
                <td style={{ padding: '3px 4px' }}><input value={it.unidad} onChange={e => setItem(i, 'unidad', e.target.value)} style={{ ...inp, width: 44, padding: '5px 6px' }} /></td>
                <td style={{ padding: '3px 4px', textAlign: 'right' }}><input value={it.pUnitario} onChange={e => setItem(i, 'pUnitario', e.target.value)} style={{ ...inp, width: 90, padding: '5px 6px', textAlign: 'right' }} /></td>
                <td style={{ padding: '3px 4px', textAlign: 'right' }}><input value={it.descuento} onChange={e => setItem(i, 'descuento', e.target.value)} style={{ ...inp, width: 70, padding: '5px 6px', textAlign: 'right' }} /></td>
                <td style={{ padding: '3px 4px', verticalAlign: 'top' }}><textarea value={it.comentario} onChange={e => setItem(i, 'comentario', e.target.value)} placeholder="Esquema / detalle" rows={3} style={{ ...inp, width: 240, minWidth: 200, padding: '6px 8px', resize: 'both', fontFamily: 'inherit', lineHeight: 1.4 }} /></td>
                <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{clp(itemTotal(it))}</td>
                <td style={{ padding: '3px 2px', textAlign: 'right' }}>{f.items.length > 1 && <button onClick={() => delItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addItem} style={{ background: 'none', border: '1px dashed #DFE4EA', padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: C.gris, marginTop: 8 }}>+ Agregar ítem</button>

      <textarea rows={3} style={{ ...inp, width: '100%', marginTop: 10, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }} placeholder="Comentario general de la cotización (opcional)" value={f.comentario} onChange={e => set('comentario', e.target.value)} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, marginTop: 12, fontSize: 13 }}>
        <span>Afecto: <b>{clp(t.afecto)}</b></span>
        <span>IVA 19%: <b>{clp(t.iva)}</b></span>
        <span>Total: <b style={{ color: C.teal }}>{clp(t.total)}</b></span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => { if (f.folio && f.cliente) onGuardar(f) }} style={{ background: C.verde, color: '#fff', border: 'none', padding: '9px 18px', cursor: 'pointer', fontSize: 13 }}>Guardar cotización</button>
        <button onClick={onCancelar} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
      </div>
    </div>
  )
}

import CotizadorParametros from './CotizadorParametros.jsx'
import CotizadorCalculo from './CotizadorCalculo.jsx'

export default function CotizacionesModule({ cotizaciones = [], setCotizaciones = () => {}, ots = [], setOts = () => {}, clientes = [], onAddCliente = () => {}, pp = { ocs: [] }, setPp = () => {} }) {
  const [creando, setCreando] = useState(false)
  const [modo, setModo] = useState('rapida'); const [calcInicial, setCalcInicial] = useState(null)
  const [aproCot, setAproCot] = useState(null)
  const [aproFecha, setAproFecha] = useState('')
  const [aproResp, setAproResp] = useState('')
  const [editId, setEditId] = useState(null)
  const [busca, setBusca] = useState('')
  const [rep, setRep] = useState(false)
  const [repDesde, setRepDesde] = useState('')
  const [repHasta, setRepHasta] = useState('')
  const [repCliente, setRepCliente] = useState('')
  const [repAreas, setRepAreas] = useState(['Santa Rosa', 'Istria', 'Proyectos'])
  const toggleArea = a => setRepAreas(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])
  const _n = s => (s || '').trim().toLowerCase()
  const nombresBusca = [...new Set([...(clientes || []).map(c => (c.nombre || '').trim()), ...cotizaciones.map(c => (c.cliente || '').trim())].filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const clientesActivos = [...new Set((clientes || []).filter(c => (c.estado || 'Activo') === 'Activo').map(c => (c.nombre || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))

  function generarInformeCot() {
    const lista = cotizaciones.filter(c => {
      if (repCliente && _n(c.cliente) !== _n(repCliente)) return false
      if (repAreas.length && !repAreas.includes(c.area)) return false
      if (repDesde && (!c.fecha || c.fecha < repDesde)) return false
      if (repHasta && (!c.fecha || c.fecha > repHasta)) return false
      return true
    })
    if (!lista.length) { window.alert('No hay cotizaciones que cumplan el filtro seleccionado.'); return }
    const header = ['Folio', 'Cliente', 'Área', 'Fecha', 'Vencimiento', 'Estado', 'Vendedor', 'Condición pago', 'Afecto', 'IVA 19%', 'Total']
    const rows = lista.map(c => { const t = totales(c); return ['N° ' + c.folio, c.cliente, c.area, c.fecha, c.vencimiento, c.estado === 'Otro' ? ('Otro: ' + (c.estadoOtro || '')) : c.estado, c.vendedor, c.condicionPago, t.afecto, t.iva, t.total] })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), 'Cotizaciones')
    XLSX.writeFile(wb, `Cotizaciones_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const maxFolio = cotizaciones.reduce((m, c) => Math.max(m, parseInt(String(c.folio).replace(/\D/g, ''), 10) || 0), 792)

  // pushState() ya devuelve si la subida a la nube falló o no, pero antes
  // nada de este archivo revisaba esa respuesta — si fallaba (sin conexión,
  // error de Supabase, etc.) la pantalla igual mostraba el cambio como
  // hecho porque el estado local sí se actualizó, y la persona seguía
  // trabajando sin saber que esa cotización nunca llegó a la nube ni a
  // las demás sesiones. No se usa await (mismo motivo del comentario de
  // arriba: no bloquear el clic), pero si la subida falla se avisa apenas
  // se sabe.
  const avisarSiFallaSubida = () => { pushState().then(r => { if (!r.ok) window.alert('Esto quedó guardado en este equipo, pero no se pudo subir a la nube todavía' + (r.error ? ':\n\n' + r.error : '') + '\n\nRevisa tu conexión e inténtalo de nuevo, o usa el botón de guardado en el menú lateral.') }) }

  // Vuelta atrás urgente (24-jul): escribirConReintento() hace un viaje
  // extra a Supabase (leer + escribir) por cada guardado, y con la base de
  // datos saturada (timeouts hasta en el login) eso dejó de responder del
  // todo — nadie podía ni crear una cotización. Se vuelve al patrón más
  // liviano de antes (traer lo más fresco con pullState(), que de todas
  // formas ya corre en la app por otros motivos, y subir con pushState()
  // sin un viaje aparte por escritura). Sigue protegido contra choques
  // salvo en el margen de milisegundos entre leer y escribir — peor que el
  // compare-and-swap, pero la prioridad ahora es que la app vuelva a
  // responder.
  const guardar = cot => {
    setCreando(false); setEditId(null)
    ;(async () => {
      try {
        try { await pullState() } catch (e) {}
        let fresco = null
        try { fresco = JSON.parse(localStorage.getItem('serein_cotizaciones') || 'null') } catch (e) {}
        const base = Array.isArray(fresco) ? fresco : (Array.isArray(cotizaciones) ? cotizaciones : [])
        const existe = base.some(c => c.id === cot.id)
        let cotFinal = cot
        if (!existe) {
          // Piso en 825 (no 792): el folio 825 falló al guardarse muchas
          // veces seguidas por administración — se salta por completo.
          let folioFresco = Math.max(825, base.reduce((m, c) => Math.max(m, parseInt(String(c.folio).replace(/\D/g, ''), 10) || 0), 792)) + 1
          while (base.some(c => String(c.folio) === String(folioFresco))) folioFresco++
          cotFinal = { ...cot, folio: String(folioFresco) }
        }
        const nuevo = existe ? base.map(c => c.id === cotFinal.id ? cotFinal : c) : [cotFinal, ...base]
        try { localStorage.setItem('serein_cotizaciones', JSON.stringify(nuevo)) } catch (e) {}
        setCotizaciones(nuevo)
        avisarSiFallaSubida()
      } catch (e) {
        // Antes, cualquier excepción acá (ej. datos inesperados en la base
        // "fresca") detenía la función en silencio: el formulario se
        // cerraba (por el setCreando(false) de más arriba) pero la
        // cotización nunca se agregaba — parecía que "no hacía nada". Ahora
        // se avisa con el error real en vez de fallar callado.
        window.alert('No se pudo guardar la cotización. Detalle técnico: ' + ((e && e.message) || String(e)))
      }
    })()
  }
  const eliminar = async id => {
    if (!window.confirm('¿Eliminar esta cotización?')) return
    try {
      try { await pullState() } catch (e) {}
      let fresco = null
      try { fresco = JSON.parse(localStorage.getItem('serein_cotizaciones') || 'null') } catch (e) {}
      const base = Array.isArray(fresco) ? fresco : (Array.isArray(cotizaciones) ? cotizaciones : [])
      const nuevo = base.filter(c => c.id !== id)
      try { localStorage.setItem('serein_cotizaciones', JSON.stringify(nuevo)) } catch (e) {}
      setCotizaciones(nuevo)
      avisarSiFallaSubida()
    } catch (e) {
      window.alert('No se pudo eliminar la cotización. Detalle técnico: ' + ((e && e.message) || String(e)))
    }
  }

  function aprobar(cot, fechaEntrega = '', responsable = '') {
    ;(async () => {
     try {
      try { await pullState() } catch (e) {}
      let frescoCots = null, frescoOts = null
      try { frescoCots = JSON.parse(localStorage.getItem('serein_cotizaciones') || 'null') } catch (e) {}
      try { frescoOts = JSON.parse(localStorage.getItem('serein_ots') || 'null') } catch (e) {}
      // Si la cotización que se está aprobando todavía no terminó de
      // confirmarse en la nube (ej. se creó hace unos segundos y el push
      // sigue en curso), este pull-fresh puede traer una copia que
      // TODAVÍA no la incluye. Antes, escribir de vuelta esa copia
      // incompleta borraba la cotización recién creada. Ahora, si no
      // aparece en lo recién traído, se vuelve a agregar antes de escribir
      // — nunca se pierde algo que ya existía en la pantalla de quien
      // aprueba.
      const baseCotsFrescas = Array.isArray(frescoCots) ? frescoCots : cotizaciones
      const baseOts = Array.isArray(frescoOts) ? frescoOts : (ots || [])
      const yaEstaba = baseCotsFrescas.some(c => c.id === cot.id)
      const baseCots = yaEstaba ? baseCotsFrescas : [cot, ...baseCotsFrescas]
      const cotFresca = baseCots.find(c => c.id === cot.id) || cot
      if (cotFresca.estado === 'Aprobada') { window.alert('Esta cotización ya fue aprobada y su OT ya existe.'); return }
      const numeroOT = 'OT-' + cotFresca.folio
      let nuevasOts = baseOts
      if (baseOts.some(o => o.numero === numeroOT)) { window.alert('Ya existe una OT creada para esta cotización (' + numeroOT + '). No se creó otra.') }
      else {
        const t = totales(cotFresca)
        const nuevaOT = {
          id: 'ot' + Date.now(), numero: numeroOT, area: cotFresca.area || 'Santa Rosa', cliente: cotFresca.cliente, fecha: cotFresca.fecha,
          cotizacion: 'COT ' + cotFresca.folio, oc: '—', m2: (cotFresca.items || []).filter(i => i.unidad === 'm²').reduce((a, i) => a + numDec(i.cant), 0), montoCotizado: t.afecto,
          procesos: [], preparacion: '—', esquema: (cotFresca.items || []).map(i => i.comentario).filter(Boolean).join(' · ') || '—',
          estado: 'Cotizada', fechaEntrega, responsable, ventas: [], costos: [], itemsCot: cotFresca.items, folioCot: cotFresca.folio, pinturaCotizada: (() => { const m = {}; (cotFresca.items || []).forEach(it => (it.comprasPintura || []).forEach(cp => { if (!m[cp.producto]) m[cp.producto] = { producto: cp.producto, litrosEnvase: cp.litrosEnvase, envases: 0, litros: 0 }; m[cp.producto].envases += cp.envases; m[cp.producto].litros += (cp.litrosComprados || 0) })); return Object.values(m) })(),
        }
        nuevasOts = [nuevaOT, ...baseOts]
      }
      const nuevasCots = baseCots.map(c => c.id === cotFresca.id ? { ...c, estado: 'Aprobada' } : c)
      try { localStorage.setItem('serein_ots', JSON.stringify(nuevasOts)); localStorage.setItem('serein_cotizaciones', JSON.stringify(nuevasCots)) } catch (e) {}
      setOts(nuevasOts)
      setCotizaciones(nuevasCots)
      avisarSiFallaSubida()
      window.alert('Cotización aprobada. Se generó la ' + numeroOT + ' en el módulo Órdenes de Trabajo. Ya puedes descargar la OT (sin valores).')
     } catch (e) {
      window.alert('No se pudo aprobar la cotización. Detalle técnico: ' + ((e && e.message) || String(e)))
     }
    })()
  }

  const generarOCPintura = async (cot) => {
  const prov = (cot.proveedorPintura || '').trim()
  if (!prov) { window.alert('Primero elige el proveedor de pintura en la cotizacion (boton Editar, o en el cotizador por calculo).'); return }
  const ocs = pp.ocs || []
  if (ocs.some(o => o.origenCot === cot.folio && o.categoria === 'Pintura') && !window.confirm('Ya existe una OC de pintura para la cotizacion ' + cot.folio + '. Crear otra?')) return
  const maxOC = ocs.reduce((m, o) => Math.max(m, parseInt(String(o.numero).replace(/\D/g, ''), 10) || 0), 517)
  const numero = String(maxOC + 1)
  const _nn = s => (s || '').trim().toLowerCase()
  const ficha = (PROVEEDORES_FICHA || []).find(p => _nn(p.nombre) === _nn(prov)) || {}
  const consol = {}
  ;(cot.items || []).forEach(it => (it.comprasPintura || []).forEach(cp => { if (!consol[cp.producto]) consol[cp.producto] = { producto: cp.producto, envases: 0, costo: 0 }; consol[cp.producto].envases += cp.envases; consol[cp.producto].costo += (cp.costo || 0) }))
  const ocItems = Object.values(consol).map(c => ({ codigo: '', producto: c.producto, cantidad: c.envases, precio: c.envases ? Math.round(c.costo / c.envases) : 0, comentario: 'Envases completos' }))
  const f0 = new Date().toISOString().slice(0, 10)
  const v0 = new Date(new Date(f0 + 'T12:00:00').getTime() + 30 * 86400000).toISOString().slice(0, 10)
  const oc = { id: 'oc' + Date.now(), numero, proveedor: prov, rut: ficha.rut || '', categoria: 'Pintura', detalle: 'Pintura cotizacion ' + cot.folio + (cot.cliente ? ' - ' + cot.cliente : ''), area: cot.area || 'Santa Rosa', fecha: f0, plazo: 30, vencimiento: v0, estadoPago: 'Pendiente', asignaciones: [], items: ocItems, direccion: ficha.direccion || '', despacho: 'Santa Rosa 70, Lampa', adjunto: '', obs: 'Generada desde la cotizacion ' + cot.folio, origenCot: cot.folio }
  try { await pullState() } catch (e) {}
  let fresco = null
  try { fresco = JSON.parse(localStorage.getItem('serein_pp') || 'null') } catch (e) {}
  const basePp = fresco && typeof fresco === 'object' ? fresco : pp
  const nuevoPp = { ...basePp, ocs: [oc, ...(basePp.ocs || [])] }
  try { localStorage.setItem('serein_pp', JSON.stringify(nuevoPp)) } catch (e) {}
  setPp(nuevoPp)
  avisarSiFallaSubida()
  window.alert('OC N ' + numero + ' creada en Ordenes de Compra (proveedor: ' + prov + '). Revisala y descarga su PDF en el modulo Ordenes de Compra.')
}

  const updateCot = (id, cambios) => {
    ;(async () => {
      try {
        try { await pullState() } catch (e) {}
        let fresco = null
        try { fresco = JSON.parse(localStorage.getItem('serein_cotizaciones') || 'null') } catch (e) {}
        const base = Array.isArray(fresco) ? fresco : (Array.isArray(cotizaciones) ? cotizaciones : [])
        const nuevo = base.map(x => x.id === id ? { ...x, ...cambios } : x)
        try { localStorage.setItem('serein_cotizaciones', JSON.stringify(nuevo)) } catch (e) {}
        setCotizaciones(nuevo)
        avisarSiFallaSubida()
      } catch (e) {
        window.alert('No se pudo actualizar la cotización. Detalle técnico: ' + ((e && e.message) || String(e)))
      }
    })()
  }
  const setEstadoCot = (c, nuevo) => { if (nuevo === 'Aprobada' && c.estado !== 'Aprobada') setAproCot(c); else updateCot(c.id, { estado: nuevo }) }

  const mostradas = cotizaciones.filter(c => !busca || (String(c.folio) + ' ' + (c.cliente || '')).toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => (parseInt(String(b.folio).replace(/\D/g, ''), 10) || 0) - (parseInt(String(a.folio).replace(/\D/g, ''), 10) || 0))
  const [page, setPage] = useState(1)
  const pg = paginar(mostradas, page)

  if (creando || editId) {
    const inicial = editId ? cotizaciones.find(c => c.id === editId) : nuevaCot(maxFolio + 1)
    return <FormCotizacion esEdicion={!!editId} inicial={inicial} onGuardar={guardar} onCancelar={() => { setCreando(false); setEditId(null) }} clientes={clientes} onAddCliente={onAddCliente} />
  }

  if (modo === 'params') return <CotizadorParametros onVolver={() => setModo('rapida')} />
  if (modo === 'calculo') return <CotizadorCalculo clientes={clientes} onAddCliente={onAddCliente} cotizaciones={cotizaciones} setCotizaciones={setCotizaciones} proveedores={PROVEEDORES_FICHA} inicial={calcInicial} onVolver={() => { setModo('rapida'); setCalcInicial(null) }} />

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, borderBottom: '1px solid #DFE4EA', paddingBottom: 8 }}>
        <button onClick={() => setModo('rapida')} style={{ background: 'transparent', border: 'none', borderBottom: '2px solid #F77716', padding: '6px 2px', marginRight: 12, cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#101315' }}>Cotizacion rapida</button>
        <button onClick={() => { setCalcInicial(null); setModo('calculo') }} style={{ background: 'transparent', border: 'none', padding: '6px 2px', marginRight: 12, cursor: 'pointer', fontWeight: 500, fontSize: 13, color: '#5A636E' }}>Nueva por calculo</button>
        <button onClick={() => setModo('params')} style={{ background: 'transparent', border: 'none', padding: '6px 2px', cursor: 'pointer', fontWeight: 500, fontSize: 13, color: '#5A636E' }}>Parametros Cotizador</button>
      </div>
      {aproCot && (<div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(6,26,64,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 20px 50px rgba(16,24,40,.25)', padding: 22, width: 440, maxWidth: '100%' }}>
          <h3 style={{ margin: '0 0 6px', fontFamily: SEREIN.fontDisplay, fontSize: 16, color: '#101315', textTransform: 'uppercase' }}>Aprobar y generar OT</h3>
          <div style={{ fontSize: 12.5, color: '#5A636E', marginBottom: 14 }}>Se creara la OT-{aproCot.folio} con el mismo numero. Completa los datos de la orden:</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div><span style={{ fontSize: 11.5, color: '#9AA3AD', fontWeight: 600, textTransform: 'uppercase' }}>Fecha de entrega</span><input type="date" value={aproFecha} onChange={e => setAproFecha(e.target.value)} style={{ border: '1px solid #DFE4EA', borderRadius: 8, padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' }} /></div>
            <div><span style={{ fontSize: 11.5, color: '#9AA3AD', fontWeight: 600, textTransform: 'uppercase' }}>Responsable</span><input value={aproResp} onChange={e => setAproResp(e.target.value)} placeholder="Nombre del responsable" style={{ border: '1px solid #DFE4EA', borderRadius: 8, padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' }} /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button onClick={() => setAproCot(null)} style={{ background: '#fff', border: '1px solid #DFE4EA', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: '#5A636E' }}>Cancelar</button>
            <button onClick={() => { const cc = aproCot; setAproCot(null); aprobar(cc, aproFecha, aproResp); setAproFecha(''); setAproResp('') }} style={{ background: '#F77716', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 15px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Aprobar y crear OT</button>
          </div>
        </div>
      </div>)}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={() => setCreando(true)} style={{ background: C.teal, color: '#fff', border: 'none', padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={15} /> Nueva cotización</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #DFE4EA', padding: '2px 6px' }}>
          <Search size={13} color={C.gris} />
          <input value={busca} list="dl-cot-busca" onChange={e => setBusca(e.target.value)} placeholder="Buscar folio/cliente…" style={{ border: 'none', outline: 'none', fontSize: 12.5, width: 170 }} />
          <datalist id="dl-cot-busca">{nombresBusca.map(n => <option key={n} value={n} />)}</datalist>
        </div>
        <button onClick={() => { setRep(v => !v); setRepCliente('') }} style={{ background: C.carbon, color: '#fff', border: 'none', padding: '8px 14px', cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}><Download size={14} /> Informe Excel</button>
        <span style={{ fontSize: 12.5, color: C.gris }}>{mostradas.length} cotización(es)</span>
      </div>
      {rep && (
        <div style={{ background: '#F2F4F7', border: '1px solid #DFE4EA', padding: 12, marginBottom: 14, display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, color: C.gris }}>Desde<input type="date" value={repDesde} onChange={e => setRepDesde(e.target.value)} style={{ ...inp, display: 'block', marginTop: 3 }} /></label>
          <label style={{ fontSize: 11, color: C.gris }}>Hasta<input type="date" value={repHasta} onChange={e => setRepHasta(e.target.value)} style={{ ...inp, display: 'block', marginTop: 3 }} /></label>
          <label style={{ fontSize: 11, color: C.gris }}>Cliente<select value={repCliente} onChange={e => setRepCliente(e.target.value)} style={{ ...inp, display: 'block', marginTop: 3 }}><option value="">Todos</option>{clientesActivos.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
          <div style={{ fontSize: 11, color: C.gris }}>Áreas
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {AREAS.map(a => (
                <button key={a} type="button" onClick={() => toggleArea(a)} style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, border: '1px solid ' + (repAreas.includes(a) ? C.teal : '#DFE4EA'), background: repAreas.includes(a) ? C.teal : '#fff', color: repAreas.includes(a) ? '#fff' : C.carbon }}>{a}</button>
              ))}
            </div>
          </div>
          <button onClick={generarInformeCot} style={{ background: C.verde, color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Generar Excel</button>
          <span style={{ fontSize: 11.5, color: '#9AA3AD' }}>Fechas vacías = todo. Toca las áreas para incluirlas o excluirlas.</span>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #DFE4EA', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>{['Folio', 'Cliente', 'Área', 'Fecha', 'Total', 'Estado', 'Acciones'].map(h => <th key={h} style={{ textAlign: h === 'Total' ? 'right' : 'left', padding: '8px 10px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
          <tbody>
            {pg.items.map(c => {
              const t = totales(c)
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid #E2E7EC' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>N° {c.folio}</td>
                  <td style={{ padding: '8px 10px' }}>{c.cliente}
                    {(() => {
                      const ot = (ots || []).find(o => o.numero === 'OT-' + c.folio)
                      if (!ot) return c.estado === 'Aprobada' ? <div style={{ fontSize: 11, color: C.rojo, marginTop: 2 }}>Aprobada · falta crear OT</div> : null
                      const ventas = ot.ventas || []
                      const fact = (ventas.length > 0 || ['Facturada', 'Cerrada'].includes(ot.estado)) ? 'Facturada' : 'Pendiente'
                      const cobro = ventas.length === 0 ? '—' : (ventas.every(v => v.estadoPago === 'Pagado') ? 'Cobrado' : 'Pendiente')
                      return <div style={{ fontSize: 11, color: C.gris, marginTop: 2 }}>🔧 {ot.numero} · {ot.estado} · Fact: {fact} · Cobro: {cobro}</div>
                    })()}
                  </td>
                  <td style={{ padding: '8px 10px', color: C.gris }}>{c.area}</td>
                  <td style={{ padding: '8px 10px', color: C.gris }}>{c.fecha}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{clp(t.total)}</td>
                  <td style={{ padding: '6px 10px', minWidth: 170 }}>
                    {(() => { const [bg, fg] = colorEstadoCot(c.estado); return (
                      <select value={c.estado} onChange={e => setEstadoCot(c, e.target.value)} style={{ border: 'none', background: bg, color: fg, padding: '4px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer', maxWidth: 195 }}>
                        {ESTADOS_COT.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) })()}
                    {c.estado === 'Otro' && <input value={c.estadoOtro || ''} onChange={e => updateCot(c.id, { estadoOtro: e.target.value })} placeholder="Especificar…" style={{ ...inp, marginTop: 4, width: '100%', padding: '5px 7px' }} />}
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => descargarCotizacionPDF(c)} title="Descargar cotización PDF" style={{ background: C.carbon, color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}><Download size={12} /> Cotización</button>
                      {c.estado === 'Aprobada' && <button onClick={() => descargarOTPDF(c)} title="Descargar OT sin valores" style={{ background: C.azul, color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}><Download size={12} /> OT (sin valores)</button>}
                        {c.estado === 'Aprobada' && (c.items || []).some(it => (it.comprasPintura || []).length) && <button onClick={() => descargarInformePintura(c)} title="Descargar informe de compra de pintura" style={{ background: C.ambar || '#F77716', color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, borderRadius: 4 }}>Pintura</button>}
                        {c.estado === 'Aprobada' && (c.items || []).some(it => (it.comprasPintura || []).length) && <button onClick={() => descargarSolicitudPintura(c)} title="Descargar solicitud de compra al proveedor (PDF)" style={{ background: '#0E7A8F', color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, borderRadius: 4 }}>Solicitud proveedor</button>}
                        {(c.proveedorPintura || (c.items || []).some(it => (it.comprasPintura || []).length)) && <button onClick={() => generarOCPintura(c)} title="Generar Orden de Compra de pintura" style={{ background: '#1B9E5D', color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, borderRadius: 4 }}>Generar OC</button>}
                      {c.tipo === 'calculo' && <button onClick={() => { setCalcInicial(c); setModo('calculo') }} title="Abrir/editar en la calculadora por calculo" style={{ background: '#101315', color: '#fff', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 11.5, borderRadius: 4 }}>Calculadora</button>}
                      <button onClick={() => setEditId(c.id)} title="Editar" style={{ background: 'none', border: '1px solid #DFE4EA', padding: '5px 8px', cursor: 'pointer', fontSize: 11.5 }}><FileText size={12} /></button>
                      <button onClick={() => eliminar(c.id)} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {mostradas.length === 0 && <tr><td colSpan={7} style={{ padding: 18, textAlign: 'center', color: '#9AA3AD' }}>Sin cotizaciones. Crea la primera con "Nueva cotización".</td></tr>}
          </tbody>
        </table>
        <Paginador page={pg.page} paginas={pg.paginas} total={pg.total} setPage={setPage} />
      </div>
      <div style={{ fontSize: 12, color: '#9AA3AD', marginTop: 8 }}>
        "Descargar" abre el documento con formato y usa <b>Guardar como PDF</b> del navegador. Al aprobar, se genera la OT con el mismo número en Órdenes de Trabajo; la OT se descarga <b>sin valores</b> para los supervisores.
      </div>
    </div>
  )
}
