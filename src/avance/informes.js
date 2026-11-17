// Módulo Avance de Obra · informes imprimibles (misma mecánica que
// informeCobranzaPDF.js: una ventana con HTML limpio y window.print(), que
// el navegador guarda como PDF). Dos documentos: «Informe de avance» (versión
// interna o cliente) y «Estado de pago» (EDP). Todo número sale de calc.js.
import { LOGO_SEREIN_DATA } from '../logoSereinData.js'
import { fmtPct, fmtCLP, fmtFecha, TIPOS_EVENTO, PARTIDAS, secuenciaEDP } from './calc.js'
import { filtrarParaCliente } from './VistaCliente.jsx'

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const COLOR = { prov: '#D9600A', mon: '#2A5FB0', pin: '#0F9BA8', int: '#7A4FB5', ter: '#1B9E5D' }
const CSS = `
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box } body { font-family: Inter, Arial, sans-serif; color: #191C20; font-size: 11.5px; margin: 0 }
  h1 { font-size: 20px; margin: 0; letter-spacing: -.01em } h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .07em; color: #5A636E; margin: 18px 0 6px; border-bottom: 1px solid #DFE4EA; padding-bottom: 4px }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #F77716; padding-bottom: 10px }
  .top img { height: 42px } .meta { color: #5A636E; font-size: 11px; margin-top: 3px } .meta b { color: #191C20 }
  .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 12px }
  .kpi { border: 1px solid #DFE4EA; border-radius: 6px; padding: 8px 10px } .kpi.acc { background: #F77716; color: #fff; border-color: #F77716 }
  .kpi .l { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; opacity: .8; font-weight: 700 } .kpi .v { font-size: 17px; font-weight: 800; margin-top: 2px } .kpi .s { font-size: 9.5px; opacity: .8 }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums } th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: .06em; color: #9AA3AD; padding: 5px 6px; border-bottom: 1px solid #DFE4EA }
  td { padding: 5px 6px; border-bottom: 1px solid #EEF1F4; vertical-align: top } td.n, th.n { text-align: right }
  .bar { height: 7px; background: #E2E7EC; border-radius: 4px; overflow: hidden } .bar i { display: block; height: 100% }
  .pill { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 9.5px; font-weight: 600; background: #F2F4F7; color: #5A636E }
  .foot { position: fixed; bottom: 0; left: 0; right: 0; font-size: 9px; color: #9AA3AD; display: flex; justify-content: space-between }
  .firma { margin-top: 28px; display: flex; gap: 40px } .firma div { flex: 1; border-top: 1px solid #191C20; padding-top: 4px; font-size: 10px; text-align: center }
  .aviso { background: #FDECDD; border: 1px solid #F77716; border-radius: 6px; padding: 8px 10px; margin-top: 10px }
`
const abrir = (titulo, html) => {
  const w = window.open('', '_blank')
  if (!w) { alert('El navegador bloqueó la ventana del informe. Permite ventanas emergentes para app.sereinspa.com.'); return }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${CSS}</style></head><body>${html}<div class="foot"><span>SEREIN Group · Servicios de Revestimientos Industriales SpA</span><span>${esc(titulo)} · generado ${new Date().toLocaleString('es-CL')}</span></div></body></html>`)
  w.document.close()
  setTimeout(() => { w.focus(); w.print() }, 500)
}
const cabecera = (ot, titulo, sub) => `<div class="top"><div><h1>${esc(titulo)}</h1><div class="meta"><b>${esc(ot.codigo)} · ${esc(ot.nombre)}</b> · ${esc(ot.cliente || '')}<br>${esc(sub)}</div></div><img src="${LOGO_SEREIN_DATA}" alt="SEREIN"></div>`

// Informe de avance. `version` = 'interna' | 'cliente' (la de cliente omite lo interno, la multa y el ritmo).
export function informeAvance({ datos, res, version = 'interna' }) {
  const d = version === 'cliente' ? filtrarParaCliente(datos) : datos
  const ot = d.ot, p = res.plazo
  const procesos = res.procesos.filter(x => version !== 'cliente' || x.visibleCliente)
  const libDe = (pid, tipo) => (d.liberaciones || []).find(l => l.proceso_id === pid && l.tipo === tipo)
  const LIB = { ok: 'Liberado', run: 'En proceso', pend: 'Pendiente', blk: 'Bloqueado', na: 'No aplica' }
  const kpis = [
    `<div class="kpi acc"><div class="l">Avance físico</div><div class="v">${fmtPct(res.real)}</div><div class="s">programa a la fecha ${fmtPct(res.plan)}</div></div>`,
    `<div class="kpi"><div class="l">Plazo</div><div class="v">${p ? p.diaActual + ' / ' + ot.plazo_dias : '—'}</div><div class="s">días · término vigente ${fmtFecha(p?.termino)}</div></div>`,
    version === 'cliente'
      ? `<div class="kpi"><div class="l">Inicio vigente</div><div class="v">${fmtFecha(p?.inicio)}</div><div class="s">${p?.renovacion ? 'plazo renovado por planos finales' : 'inicio contractual'}</div></div>`
      : `<div class="kpi"><div class="l">Ritmo medido</div><div class="v">${res.ritmo ? res.ritmo.toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' t/sem' : '—'}</div><div class="s">${Number.isFinite(res.ritmoRequerido) && res.ritmoRequerido ? 'necesario ' + res.ritmoRequerido.toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' t/sem' : ''}</div></div>`,
    version === 'cliente'
      ? `<div class="kpi"><div class="l">Aprobaciones pendientes</div><div class="v">${d.aprobaciones.filter(a => a.estado === 'pend').length}</div><div class="s">esperando respuesta del cliente</div></div>`
      : `<div class="kpi"><div class="l">Término proyectado</div><div class="v">${res.proy.termino ? fmtFecha(res.proy.termino) : '—'}</div><div class="s">${res.atraso > 0 ? res.atraso + ' días de atraso · multa expuesta ' + fmtCLP(res.multa) : 'dentro del plazo'}</div></div>`,
    `<div class="kpi"><div class="l">${version === 'cliente' ? 'EDP presentados' : 'Avance valorizado bruto'}</div><div class="v">${version === 'cliente' ? d.edp.length : fmtCLP(res.bruto)}</div><div class="s">${version === 'cliente' ? '' : 'espera del cliente ' + res.espera + ' días'}</div></div>`,
  ].join('')
  const filas = procesos.map(rp => { const pr = (d.procesos || []).find(x => x.codigo === rp.codigo) || {}; const c = COLOR[rp.partida] || '#F77716'; return `<tr><td><b style="color:${c}">${rp.codigo}</b></td><td>${esc(rp.nombre)}</td><td style="width:160px"><div class="bar"><i style="width:${Math.round(rp.avance * 100)}%;background:${c}"></i></div></td><td class="n"><b>${fmtPct(rp.avance)}</b></td><td class="n">${fmtFecha(rp.planInicio)} → ${fmtFecha(rp.planFin)}</td>${version === 'cliente' ? '' : `<td>${LIB[libDe(pr.id, 'interna')?.estado || 'pend']}</td><td>${pr.req_lib_externa ? LIB[libDe(pr.id, 'externa')?.estado || 'pend'] + (pr.libera_externo ? ' · ' + esc(pr.libera_externo) : '') : 'no aplica'}</td>`}</tr>` }).join('')
  const libro = (d.libro || []).slice(0, 25).map(e => `<tr><td style="white-space:nowrap">${fmtFecha(e.fecha)}${e.hasta ? ' → ' + fmtFecha(e.hasta) : ''}</td><td><b>${esc(e.titulo)}</b>${e.detalle ? '<br><span style="color:#5A636E">' + esc(e.detalle) + '</span>' : ''}</td><td><span class="pill">${esc(TIPOS_EVENTO[e.tipo] || e.tipo)}</span>${e.interno ? ' <span class="pill">interno</span>' : ''}</td></tr>`).join('')
  const pend = d.aprobaciones.filter(a => a.estado === 'pend')
  const html = `${cabecera(ot, 'Informe de avance de obra', (version === 'cliente' ? 'Versión para el cliente' : 'Versión interna') + ' · al ' + fmtFecha(res.hoy))}
    <div class="kpis">${kpis}</div>
    ${p && p.diasDetencion ? `<div class="aviso">Detenciones registradas: ${p.diasDetencion} días, sumados al término vigente.</div>` : ''}
    <h2>Procesos</h2><table><thead><tr><th></th><th>Proceso</th><th>Avance</th><th class="n">Real</th><th class="n">Programa vigente</th>${version === 'cliente' ? '' : '<th>Lib. interna</th><th>Lib. externa</th>'}</tr></thead><tbody>${filas}</tbody></table>
    ${pend.length ? `<h2>Pendiente de respuesta del cliente</h2><table><tbody>${pend.map(a => `<tr><td><b>${esc(a.libro_obra?.titulo || a.clase)}</b> · ${esc(a.clase)}</td><td class="n">${a.vence ? 'respuesta hasta ' + fmtFecha(a.vence) + (a.vence < res.hoy ? ' · <b style="color:#C5453D">vencida</b>' : '') : 'sin plazo'}</td></tr>`).join('')}</tbody></table>` : ''}
    <h2>Libro de obra</h2><table><tbody>${libro || '<tr><td>Sin eventos.</td></tr>'}</tbody></table>
    ${version === 'cliente' ? '' : `<div class="firma"><div>Gerencia de Proyectos · SEREIN Group</div><div>Recibido por el cliente</div></div>`}`
  abrir('Informe de avance ' + ot.codigo, html)
}

// Estado de pago: el EDP indicado (o el próximo calculado) con el detalle por partida.
export function informeEDP({ datos, res, edp }) {
  const ot = datos.ot
  const prm = { anticipo: Number(ot.anticipo || 0), retencionPct: Number(ot.retencion_pct || 0), amortizacion: ot.amortizacion || 'total', amortizacionPct: Number(ot.amortizacion_pct || 0.3) }
  const previos = (datos.edp || []).filter(e => !edp || e.numero < edp.numero).map(e => Number(e.bruto_acumulado))
  const bruto = edp ? Number(edp.bruto_acumulado) : res.bruto
  const sec = secuenciaEDP([...previos, bruto], prm)
  const x = sec[sec.length - 1]
  const numero = edp ? edp.numero : (datos.edp || []).length + 1
  const partidas = PARTIDAS.map(c => ({ c, fila: (datos.partidas || []).find(p => p.codigo === c), av: res.avPartida[c] || 0 })).filter(q => q.fila)
  const html = `${cabecera(ot, 'Estado de pago N°' + numero, (edp ? 'Estado: ' + edp.estado + ' · fecha ' + fmtFecha(edp.fecha) : 'Cálculo a la fecha ' + fmtFecha(res.hoy)) + ' · contrato ' + fmtCLP(ot.precio_contrato) + ' neto')}
    <h2>Avance valorizado por partida (precio lista × avance × factor contrato ${res.factor.toFixed(4)})</h2>
    <table><thead><tr><th>Partida</th><th class="n">Monto lista</th><th class="n">Avance</th><th class="n">Valorizado</th></tr></thead><tbody>
    ${partidas.map(({ c, fila, av }) => `<tr><td><b style="color:${COLOR[c]}">■</b> ${esc(fila.nombre)}</td><td class="n">${fmtCLP(fila.monto)}</td><td class="n">${fmtPct(av)}</td><td class="n">${fmtCLP(Number(fila.monto) * av * res.factor)}</td></tr>`).join('')}
    <tr><td colspan="3"><b>Bruto acumulado</b></td><td class="n"><b>${fmtCLP(x.brutoAcumulado)}</b></td></tr></tbody></table>
    <h2>Cálculo del estado de pago</h2>
    <table><tbody>
      <tr><td>Bruto acumulado a la fecha</td><td class="n">${fmtCLP(x.brutoAcumulado)}</td></tr>
      <tr><td>Menos EDP anteriores (bruto acumulado previo)</td><td class="n">−${fmtCLP(x.brutoAcumulado - x.periodo)}</td></tr>
      <tr><td><b>Avance del periodo</b></td><td class="n"><b>${fmtCLP(x.periodo)}</b></td></tr>
      <tr><td>Amortización del anticipo (${prm.amortizacion === 'total' ? 'total hasta cubrirlo' : fmtPct(prm.amortizacionPct) + ' del periodo'}) · anticipo ${fmtCLP(prm.anticipo)}</td><td class="n">−${fmtCLP(x.amortizacion)}</td></tr>
      <tr><td>Retención ${fmtPct(prm.retencionPct)}</td><td class="n">−${fmtCLP(x.retencion)}</td></tr>
      <tr><td style="font-size:13px"><b>Neto a facturar (sin IVA)</b></td><td class="n" style="font-size:15px"><b>${fmtCLP(x.neto)}</b></td></tr>
      <tr><td style="color:#9AA3AD">Anticipo pendiente de amortizar después de este EDP</td><td class="n" style="color:#9AA3AD">${fmtCLP(x.anticipoPendiente)}</td></tr>
    </tbody></table>
    <div class="firma"><div>Gerencia de Proyectos · SEREIN Group</div><div>V°B° cliente</div></div>`
  abrir('EDP N' + numero + ' ' + ot.codigo, html)
}
