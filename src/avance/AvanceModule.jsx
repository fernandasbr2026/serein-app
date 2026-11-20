// Módulo Avance de Obra + Portal Cliente · vista interna (fase 1).
// Diseño elegido por Fernanda (maqueta C, 2026-11-16): a la izquierda lo
// interno que ella edita; a la derecha, en vivo, lo que ve el cliente. El
// estilo (tabs numerados, cadena de procesos con «estanques» y luces
// INT/EXT, interruptor INTERNA/CLIENTE) viene del prototipo de Gerencia de
// Proyectos, llevado a la paleta clara y la tipografía del ERP.
//
// Reglas de arquitectura: nada de app_state ni sync.js (tablas propias en el
// esquema `avance`, ver api.js); todo cálculo sale de calc.js; se carga
// perezosamente desde Dashboard.jsx. La lectura de Drive y correo
// («Actualizar proyecto») y el acceso real del cliente llegan en las fases
// 2 y 3: aquí quedan señalados, no simulados.
import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react'
import { Bell, Plus, RefreshCw, Eye, Columns2, PanelLeft, Upload, MessageSquare } from 'lucide-react'
import * as api from './api.js'
import { resumenOT, fmtPct, fmtCLP, fmtMM, fmtFecha, hoyISO, sumarDias, dias, planGlobal, PLANTILLA_PROCESOS, PARTIDAS, PARTIDAS_NOMBRE } from './calc.js'
import { S, Card, Eyebrow, Pill, Btn, inp, Campo, Nota, Aviso, Switch, Luz, Estanque, Barras, Dona, Curva, Kpi, TabsNum, colorProceso, COLOR_PARTIDA } from './ui.jsx'
import VistaCliente from './VistaCliente.jsx'
import { PanelProcesos, PanelEDP, PanelLibro, PanelDocumentos, PanelRegistros, PanelCarga, PanelPropuestas } from './AvancePaneles.jsx'
import { informeAvance, informeEDP } from './informes.js'
import ChatMaestro from './ChatMaestro.jsx'
// Three.js solo se descarga al abrir la pestaña 3D.
const Modelo3D = lazy(() => import('./Modelo3D.jsx'))
import { FileText } from 'lucide-react'

const TABS = [{ id: 'comando', t: 'Comando' }, { id: 'propuestas', t: 'Propuestas' }, { id: 'procesos', t: 'Procesos y liberaciones' }, { id: 'edp', t: 'EDP' }, { id: 'libro', t: 'Libro de obra' }, { id: 'docs', t: 'Documentos' }, { id: 'registros', t: 'Registros' }, { id: 'modelo', t: 'Modelo 3D' }, { id: 'carga', t: 'Carga de avance' }, { id: 'config', t: 'Configuración' }]
const num = v => { const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }

export default function AvanceModule({ ots: otsERP = [], email }) {
  const [lista, setLista] = useState([])
  const [otId, setOtId] = useState(() => { try { return sessionStorage.getItem('serein_avance_ot') || '' } catch (e) { return '' } })
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('comando')
  const [vista, setVista] = useState('ambas') // 'ambas' | 'interna' | 'cliente'
  const [wizard, setWizard] = useState(false)
  const [userId, setUserId] = useState(null)
  const [ultima, setUltima] = useState(null)
  const [actualizando, setActualizando] = useState(false)
  const [ultimoResultado, setUltimoResultado] = useState(null)
  const [chat, setChat] = useState(false)

  useEffect(() => { api.usuarioActual().then(u => setUserId(u?.id || null)) }, [])
  const cargarLista = useCallback(async () => {
    try { const rows = await api.listarOts(); setLista(rows); setError(''); return rows } catch (e) { setError(api.errorLegible(e)); return [] } finally { setCargando(false) }
  }, [])
  useEffect(() => { cargarLista().then(rows => { if (rows.length && !rows.some(o => o.id === otId)) setOtId(rows[0].id) }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const recargar = useCallback(() => {
    if (!otId) { setDatos(null); return }
    api.cargarOT(otId).then(d => { setDatos(d); setUltima(new Date()); setError('') }).catch(e => setError(api.errorLegible(e)))
  }, [otId])
  useEffect(() => { recargar(); try { sessionStorage.setItem('serein_avance_ot', otId || '') } catch (e) {} }, [otId, recargar])
  // Refresco de respaldo cada 60 s + tiempo real: cualquier cambio en las tablas de la OT recarga (con un pequeño retardo para agrupar ráfagas).
  useEffect(() => { const id = setInterval(recargar, 60000); return () => clearInterval(id) }, [recargar])
  useEffect(() => {
    if (!otId) return
    let t = null
    const parar = api.escucharOT(otId, () => { clearTimeout(t); t = setTimeout(recargar, 700) })
    return () => { clearTimeout(t); parar() }
  }, [otId, recargar])
  const actualizarProyecto = async () => {
    if (!otId || actualizando) return
    setActualizando(true); setUltimoResultado(null)
    try {
      const r = await api.actualizarProyecto(otId)
      const pl = (n, u, p) => n + ' ' + (n === 1 ? u : p)
      const partes = [pl(r.propuestas, 'propuesta nueva', 'propuestas nuevas'), pl(r.archivos_leidos, 'archivo de Drive leído', 'archivos de Drive leídos') + (r.archivos_en_carpeta ? ' (' + r.archivos_en_carpeta + ' en la carpeta)' : ''), pl(r.correos, 'correo', 'correos')]
      if (r.duplicadas) partes.push(r.duplicadas + ' ya propuestas antes')
      setUltimoResultado({ ok: true, texto: partes.join(' · ') + (r.avisos && r.avisos.length ? '\n' + r.avisos.join('\n') : '') })
      setTab('propuestas')
    } catch (e) { setUltimoResultado({ ok: false, texto: api.errorLegible(e) }) } finally { setActualizando(false); recargar() }
  }

  const res = useMemo(() => (datos && datos.ot ? resumenOT(datos) : null), [datos])
  const alertasNoLeidas = (datos?.alertas || []).filter(a => !a.leida).length
  const pendientesCliente = (datos?.aprobaciones || []).filter(a => a.estado === 'pend').length
  const nPropuestas = (datos?.propuestas || []).length
  const tabs = TABS.map(t => ({ ...t, n: t.id === 'libro' ? pendientesCliente : t.id === 'propuestas' ? nPropuestas : 0 }))

  const cabecera = (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <Eyebrow>SEREIN · Control de obra</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          <select value={otId} onChange={e => setOtId(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 300, fontFamily: S.fontDisplay, fontWeight: 800, fontSize: 18, border: '1px solid ' + S.orange, background: S.orangeSoft, color: S.text, padding: '6px 10px' }}>
            {lista.length === 0 && <option value="">Sin proyectos todavía</option>}
            {lista.map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nombre}</option>)}
          </select>
          {datos?.ot && (datos.ot.portal_publicado ? <Pill tono="verde">portal publicado</Pill> : <Pill tono="gris">portal sin publicar</Pill>)}
        </div>
        {datos?.ot && res && (
          <div style={{ color: S.textSoft, fontSize: 12.5, marginTop: 6 }}>
            {datos.ot.cliente || 'Sin cliente'} · inicio vigente <b style={{ color: S.text }}>{fmtFecha(res.plazo?.inicio)}</b> · término vigente <b style={{ color: S.text }}>{fmtFecha(res.plazo?.termino)}</b> · día <b style={{ color: S.text }}>{res.plazo?.diaActual ?? '—'} de {datos.ot.plazo_dias}</b>
            <span style={{ marginLeft: 10, color: S.green, fontWeight: 600 }}>● enlace activo</span> <span style={{ color: S.textFaint }}>{ultima ? ultima.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Btn tipo="p" title="Relee la carpeta de Drive y los correos del cliente y deja propuestas para que confirmes" disabled={!datos?.ot || actualizando} onClick={actualizarProyecto}><RefreshCw size={13} style={actualizando ? { animation: 'girar 1s linear infinite' } : null} /> {actualizando ? 'Leyendo Drive y correos…' : 'Actualizar proyecto'}</Btn>
          <Btn disabled={!datos?.ot} onClick={() => datos?.ot && res && informeAvance({ datos, res, version: 'interna' })} title="Informe de avance en PDF (versión interna)"><FileText size={13} /> Informe</Btn>
          <Btn disabled={!datos?.ot} onClick={() => datos?.ot && res && informeAvance({ datos, res, version: 'cliente' })} title="Informe de avance en PDF tal como lo ve el cliente"><FileText size={13} /> Informe cliente</Btn>
          <Btn onClick={() => setTab('carga')}><Upload size={13} /> Cargar avance</Btn>
          <Btn tipo={chat ? 'p' : undefined} disabled={!datos?.ot} onClick={() => setChat(v => !v)} title="Pregunta en lenguaje natural sobre la OT; los cambios que pidas quedan como propuestas"><MessageSquare size={13} /> Chat</Btn>
          <Btn onClick={() => setTab('libro')} style={{ position: 'relative' }}><Bell size={13} /> Alertas{alertasNoLeidas > 0 && <span style={{ background: S.red, color: '#fff', borderRadius: 10, fontSize: 10.5, padding: '0 6px', marginLeft: 2 }}>{alertasNoLeidas}</span>}</Btn>
          <Btn tipo="g" onClick={() => setWizard(true)}><Plus size={13} /> Nueva OT</Btn>
        </div>
        <div style={{ display: 'inline-flex', border: '1px solid ' + S.line, borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
          {[['interna', 'Interna', PanelLeft], ['ambas', 'Lado a lado', Columns2], ['cliente', 'Cliente', Eye]].map(([v, t, I]) => (
            <button key={v} onClick={() => setVista(v)} style={{ border: 0, padding: '6px 12px', fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', fontFamily: S.fontDisplay, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', background: vista === v ? S.orange : 'transparent', color: vista === v ? '#fff' : S.textSoft }}><I size={12} /> {t}</button>
          ))}
        </div>
      </div>
    </div>
  )

  if (cargando) return <div style={{ padding: 28, color: S.textFaint, fontSize: 13 }}>Cargando módulo de avance…</div>
  return (
    <div style={{ padding: '18px 22px 40px', fontFamily: S.fontBody, color: S.text }}>
      {cabecera}
      <style>{'@keyframes girar{to{transform:rotate(360deg)}}'}</style>
      {error && <div style={{ marginTop: 12 }}><Aviso>{error}</Aviso></div>}
      {ultimoResultado && tab !== 'propuestas' && <div style={{ marginTop: 12 }}><Aviso tono={ultimoResultado.ok ? 'verde' : 'rojo'}>{ultimoResultado.texto}</Aviso></div>}
      {!error && lista.length === 0 && (
        <Card style={{ marginTop: 16 }}><div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}><div style={{ fontFamily: S.fontDisplay, fontWeight: 800, fontSize: 16 }}>Todavía no hay proyectos en el módulo de avance</div><Nota style={{ marginTop: 4 }}>Crea la primera OT con el asistente: en 4 pasos defines el contrato, la carpeta de Drive y los correos del cliente. Los procesos se crean con la plantilla de Gerencia y después los ajustas.</Nota></div>
          <Btn tipo="p" onClick={() => setWizard(true)}><Plus size={13} /> Nueva OT</Btn>
        </div></Card>
      )}
      {datos?.ot && res && (
        <>
          <div style={{ marginTop: 14 }}><TabsNum tabs={tabs} sel={tab} onSel={setTab} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: vista === 'ambas' ? 'minmax(0, 1.55fr) minmax(320px, 1fr)' : '1fr', gap: 18, marginTop: 16, alignItems: 'start' }}>
            {vista !== 'cliente' && (
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}><span style={{ fontFamily: S.fontDisplay, fontWeight: 800, fontSize: 14 }}>Interno · tú editas</span><Nota>administrador y operadores</Nota></div>
                {tab === 'comando' && <PanelComando datos={datos} res={res} recargar={recargar} irA={setTab} />}
                {tab === 'propuestas' && <PanelPropuestas datos={datos} res={res} recargar={recargar} onActualizar={actualizarProyecto} actualizando={actualizando} ultimoResultado={ultimoResultado} />}
                {tab === 'procesos' && <PanelProcesos datos={datos} res={res} recargar={recargar} />}
                {tab === 'edp' && <PanelEDP datos={datos} res={res} recargar={recargar} onPDF={edp => informeEDP({ datos, res, edp })} />}
                {tab === 'libro' && <PanelLibro datos={datos} res={res} recargar={recargar} userId={userId} />}
                {tab === 'docs' && <PanelDocumentos datos={datos} recargar={recargar} />}
                {tab === 'registros' && <PanelRegistros datos={datos} />}
                {tab === 'modelo' && <Suspense fallback={<Nota>Cargando el modelo 3D…</Nota>}><Modelo3D datos={datos} res={res} geometria={datos.ot.geometria} onGuardarGeometria={async g => { try { await api.actualizarOT(datos.ot.id, { geometria: g }); recargar() } catch (e) { setError(api.errorLegible(e)) } }} /></Suspense>}
                {tab === 'carga' && <PanelCarga datos={datos} res={res} recargar={recargar} userId={userId} />}
                {tab === 'config' && <PanelConfig datos={datos} res={res} recargar={recargar} otsERP={otsERP} />}
              </div>
            )}
            {vista !== 'interna' && (
              <div style={{ position: vista === 'ambas' ? 'sticky' : 'static', top: 12, maxWidth: vista === 'cliente' ? 720 : 'none', margin: vista === 'cliente' ? '0 auto' : 0, width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}><span style={{ fontFamily: S.fontDisplay, fontWeight: 800, fontSize: 14 }}>Cliente · solo ve y responde</span><Nota>{datos.ot.portal_publicado ? 'así lo ve hoy' : 'así lo verá cuando publiques'}</Nota></div>
                <div style={{ background: S.ink, borderRadius: 18, padding: 12, boxShadow: S.shadowMd }}><VistaCliente datos={datos} resumen={res} modo="preview" usuario={datos.ot.cliente} /></div>
                <Nota style={{ marginTop: 8 }}><b style={{ color: S.text }}>La separación la hace la base de datos</b>, no la pantalla: el cliente recibe solo lo publicado y nada marcado interno, aunque conozca la dirección.</Nota>
              </div>
            )}
          </div>
        </>
      )}
      {chat && datos?.ot && <ChatMaestro otId={datos.ot.id} otCodigo={datos.ot.codigo} onCerrar={() => setChat(false)} onPropuestas={() => { recargar(); setTab('propuestas') }} />}
      {wizard && <NuevaOT otsERP={otsERP} onCerrar={() => setWizard(false)} onCreada={async id => { setWizard(false); await cargarLista(); setOtId(id); setTab('config') }} />}
    </div>
  )
}

/* ---------------- 01 · Comando ---------------- */
function PanelComando({ datos, res, recargar, irA }) {
  const ot = datos.ot, hoy = res.hoy
  const [enviandoCorreo, setEnviandoCorreo] = useState(false)
  const [msgCorreo, setMsgCorreo] = useState('')
  const libDe = (pid, tipo) => (datos.liberaciones || []).find(l => l.proceso_id === pid && l.tipo === tipo)
  // Curva: plan desde el inicio vigente hasta el término; real = puntos acumulados por fecha de parte (aproximación con el avance actual al último parte).
  const curva = useMemo(() => {
    if (!res.plazo) return []
    const ini = res.plazo.inicio, fin = res.plazo.termino, total = Math.max(1, dias(ini, fin))
    const pts = []
    for (let i = 0; i <= 20; i++) { const f = sumarDias(ini, Math.round((total * i) / 20)); pts.push({ x: i / 20, plan: planGlobal(res.procesos, f, res.plazo.desplazamiento), real: null }) }
    const xHoy = Math.max(0, Math.min(1, dias(ini, hoy) / total))
    // puntos reales: cero al inicio y el avance actual a hoy (los partes históricos darán la curva fina en la fase 2)
    pts.push({ x: 0, plan: null, real: 0 }, { x: xHoy, plan: null, real: res.real })
    return pts.sort((a, b) => a.x - b.x)
  }, [res, hoy])
  const alertas = (datos.alertas || []).slice(0, 6)
  const pendientes = (datos.aprobaciones || []).filter(a => a.estado === 'pend')
  const zonas = useMemo(() => { const m = {}; for (const p of datos.partes || []) { const z = p.zona || 'Sin zona'; m[z] = (m[z] || 0) + Number(p.cantidad) } return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8) }, [datos.partes])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Kpi acento l="Avance físico" v={fmtPct(res.real)} s={'programa a hoy ' + fmtPct(res.plan) + ' · ' + (res.real >= res.plan ? '+' : '') + ((res.real - res.plan) * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' pts'}>
          <div style={{ marginTop: 8 }}><Barras datos={res.procesos.map(p => ({ l: p.codigo, v: p.avance, t: fmtPct(p.avance) }))} color="rgba(255,255,255,.9)" alto={40} /></div>
        </Kpi>
        <Kpi l="Plazo" v={res.plazo ? res.plazo.diaActual + ' / ' + ot.plazo_dias : '—'} s={res.plazo ? 'días · término ' + fmtFecha(res.plazo.termino) + (res.plazo.renovacion ? ' · renovado' : '') : 'falta el inicio'}>
          <div style={{ position: 'absolute' }} />
        </Kpi>
        <Kpi l="Ritmo medido" v={res.ritmo ? res.ritmo.toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' t/sem' : '—'} s={res.ritmoRequerido && Number.isFinite(res.ritmoRequerido) ? 'necesario ' + res.ritmoRequerido.toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' t/sem' : 'se mide con los partes'} />
        <Kpi l="Término proyectado" v={res.proy.termino ? fmtFecha(res.proy.termino) : '—'} s={res.proy.termino ? (res.atraso > 0 ? res.atraso + ' días de atraso · multa ' + fmtMM(res.multa) : 'dentro del plazo') : 'necesita ritmo medido'} />
        <Kpi oscuro l="Cobrable (bruto)" v={fmtMM(res.bruto)} s={(datos.edp || []).length + ' EDP · espera del cliente ' + res.espera + ' días'} />
      </div>

      <Card title="Cadena de procesos" right={<Btn tipo="s" onClick={() => irA('procesos')}>Editar procesos →</Btn>}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, datos.procesos.length)}, 1fr)`, gap: 6 }}>
          {res.procesos.map((rp, i) => { const p = datos.procesos[i]; const col = colorProceso(p); return (
            <div key={p.id} style={{ textAlign: 'center', borderTop: '3px solid ' + col, background: S.fog, borderRadius: 8, padding: '7px 3px 6px', position: 'relative' }}>
              {i < datos.procesos.length - 1 && <span style={{ position: 'absolute', right: -7, top: 12, color: S.textFaint }}>›</span>}
              <div style={{ fontFamily: S.fontDisplay, fontWeight: 800, color: col, fontSize: 12 }}>{p.codigo}</div>
              <div style={{ display: 'flex', justifyContent: 'center' }}><Estanque p={rp} plan={res.plazo ? Math.max(0, Math.min(1, (dias(sumarDias(rp.planInicio, res.plazo.desplazamiento), hoy)) / Math.max(1, dias(rp.planInicio, rp.planFin)))) : 0} color={col} alto={86} /></div>
              <div style={{ fontFamily: S.fontDisplay, fontWeight: 800, fontSize: 13 }}>{fmtPct(rp.avance)}</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginTop: 3 }}><Luz estado={libDe(p.id, 'interna')?.estado} etiqueta="INT" /><Luz estado={libDe(p.id, 'externa')?.estado} etiqueta="EXT" /></div>
            </div>) })}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        <Card title="Curva de avance · programa (gris) vs. real (naranja)" right={res.plazo ? 'del ' + fmtFecha(res.plazo.inicio) + ' al ' + fmtFecha(res.plazo.termino) : ''}>
          <Curva puntos={curva} alto={120} />
          <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11, color: S.textSoft }}><span><i style={{ display: 'inline-block', width: 14, height: 2, background: '#C9D1DA', verticalAlign: 'middle', marginRight: 5 }} />programa</span><span><i style={{ display: 'inline-block', width: 14, height: 3, background: S.orange, verticalAlign: 'middle', marginRight: 5 }} />real</span><span style={{ marginLeft: 'auto' }}>índice de cumplimiento {res.spi.toLocaleString('es-CL', { maximumFractionDigits: 2 })}</span></div>
        </Card>
        <Card title="Plazo consumido" right={res.plazo?.diasDetencion ? res.plazo.diasDetencion + ' días de detención' : null}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <Dona pct={res.plazo?.plazoConsumido || 0} color={res.atraso > 0 ? S.red : S.orange} texto={fmtPct(res.plazo?.plazoConsumido || 0)} />
            <div style={{ fontSize: 12, color: S.textSoft, lineHeight: 1.6 }}>Inicio vigente <b style={{ color: S.text }}>{fmtFecha(res.plazo?.inicio)}</b><br />Término vigente <b style={{ color: S.text }}>{fmtFecha(res.plazo?.termino)}</b><br />Multa por día <b style={{ color: S.text }}>{fmtCLP(ot.multa_dia)}</b></div>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Alertas y pendientes" right={<><Btn tipo="s" disabled={enviandoCorreo} title="Manda por correo a Gerencia las alertas críticas y los avisos que aún no se enviaron (el cron lo hace solo cada hora)" onClick={async () => { setEnviandoCorreo(true); setMsgCorreo(''); try { const r = await api.enviarAlertasCorreo(); setMsgCorreo(r.correos ? r.correos + ' correo' + (r.correos === 1 ? '' : 's') + ' enviado' + (r.correos === 1 ? '' : 's') + ' (' + r.enviadas + ' alertas)' : 'Nada pendiente de enviar' + (r.creadas ? ' · ' + r.creadas + ' alerta(s) de vencimiento creadas' : '')) } catch (e) { setMsgCorreo('ERROR: ' + api.errorLegible(e)) } finally { setEnviandoCorreo(false); recargar() } }}>{enviandoCorreo ? 'Enviando…' : 'Enviar avisos ahora'}</Btn><Btn tipo="s" onClick={() => irA('libro')}>Libro de obra →</Btn></>}>
          {msgCorreo && <div style={{ fontSize: 11.5, color: msgCorreo.startsWith('ERROR') ? S.red : S.green, marginBottom: 6 }}>{msgCorreo}</div>}
          {(datos.propuestas || []).length > 0 && <div onClick={() => irA('propuestas')} style={{ cursor: 'pointer', marginBottom: 8, padding: '9px 12px', border: '1px solid ' + S.orange, background: S.orangeSoft, borderRadius: 8, fontSize: 12.5 }}><b>{datos.propuestas.length} propuesta{datos.propuestas.length === 1 ? '' : 's'} del sistema</b> esperan tu confirmación · ver →</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {pendientes.map(a => { const vencida = a.vence && a.vence < hoy; return (
              <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', border: '1px solid ' + S.line, borderRadius: 8 }}>
                <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: vencida ? S.red : '#B7791F' }} />
                <div style={{ fontSize: 12 }}>{vencida ? 'Vencida: ' : 'Esperando al cliente: '}<b>{a.libro_obra?.titulo || a.clase}</b><div style={{ color: S.textFaint, fontSize: 11 }}>{a.vence ? 'respuesta hasta ' + fmtFecha(a.vence) + (vencida ? ' · ' + dias(a.vence, hoy) + ' días de atraso del cliente' : '') : 'sin plazo'}</div></div>
              </div>) })}
            {alertas.map(a => (
              <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', border: '1px solid ' + S.line, borderRadius: 8, opacity: a.leida ? .6 : 1 }}>
                <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: a.nivel === 'critico' ? S.red : a.nivel === 'aviso' ? '#B7791F' : S.green }} />
                <div style={{ fontSize: 12, flex: 1 }}>{a.titulo}{a.cuerpo && <div style={{ color: S.textSoft }}>{a.cuerpo}</div>}<div style={{ color: S.textFaint, fontSize: 11 }}>{new Date(a.creado_en).toLocaleString('es-CL')}{a.correo_enviado ? ' · correo enviado' : ''}</div></div>
                {!a.leida && <Btn tipo="s" onClick={async () => { await api.marcarAlertaLeida(a.id); recargar() }}>Leída</Btn>}
              </div>
            ))}
            {pendientes.length === 0 && alertas.length === 0 && <Nota>Sin alertas. Las respuestas del cliente y los plazos vencidos aparecerán aquí.</Nota>}
          </div>
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card title="Zonas con avance cargado" right={<Btn tipo="s" onClick={() => irA('carga')}>Cargar avance →</Btn>}>
            {zonas.length === 0 ? <Nota>Cuando cargues partes con zona o eje, aquí verás cuánto lleva cada una.</Nota> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                {zonas.map(([z, c]) => <div key={z} style={{ border: '1px solid ' + S.line, borderRadius: 8, padding: '8px 10px', background: S.fog }}><b style={{ fontFamily: S.fontDisplay }}>{z}</b><div style={{ fontSize: 11, color: S.textSoft }}>{c.toLocaleString('es-CL')} cargados</div></div>)}
              </div>
            )}
          </Card>
          <Card title="Últimos registros" right={<Btn tipo="s" onClick={() => irA('registros')}>Todos →</Btn>}>
            {(datos.registros || []).slice(0, 5).map(r => <div key={r.id} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid #EEF1F4' }}><b>{fmtFecha(r.fecha).slice(0, 5)}</b> · {r.titulo}{r.detalle && <span style={{ color: S.textSoft }}> · {r.detalle}</span>}</div>)}
            {(datos.registros || []).length === 0 && <Nota>Sin registros todavía.</Nota>}
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ---------------- 08 · Configuración ---------------- */
function PanelConfig({ datos, res, recargar, otsERP }) {
  const ot = datos.ot
  const [f, setF] = useState(() => ({ codigo: ot.codigo, nombre: ot.nombre, cliente: ot.cliente || '', fecha_inicio_contractual: ot.fecha_inicio_contractual, plazo_dias: ot.plazo_dias, kg_contrato: ot.kg_contrato, precio_contrato: ot.precio_contrato, suma_partidas: ot.suma_partidas, anticipo: ot.anticipo, retencion_pct: Math.round(Number(ot.retencion_pct) * 10000) / 100, amortizacion: ot.amortizacion, amortizacion_pct: Math.round(Number(ot.amortizacion_pct) * 10000) / 100, multa_dia: ot.multa_dia, drive_folder_id: ot.drive_folder_id || '', remitentes: (ot.remitentes_cliente || []).join(', '), correo_cliente: ot.correo_cliente || '' }))
  const [msg, setMsg] = useState('')
  const [perfiles, setPerfiles] = useState([])
  const [partidas, setPartidas] = useState(() => Object.fromEntries((datos.partidas || []).map(p => [p.id, p.monto])))
  useEffect(() => { api.listarPerfilesInternos().then(setPerfiles).catch(() => {}) }, [])
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }))
  const run = async (fn, ok) => { setMsg(''); try { await fn(); setMsg(ok || 'Guardado'); recargar(); setTimeout(() => setMsg(''), 2500) } catch (e) { setMsg('ERROR: ' + api.errorLegible(e)) } }
  const guardarContrato = () => run(() => api.actualizarOT(ot.id, { codigo: (f.codigo || ot.codigo).trim(), nombre: f.nombre, cliente: f.cliente || null, fecha_inicio_contractual: f.fecha_inicio_contractual, plazo_dias: Math.max(1, Math.round(num(f.plazo_dias))), kg_contrato: num(f.kg_contrato), precio_contrato: num(f.precio_contrato), suma_partidas: num(f.suma_partidas), anticipo: num(f.anticipo), retencion_pct: num(f.retencion_pct) / 100, amortizacion: f.amortizacion, amortizacion_pct: num(f.amortizacion_pct) / 100, multa_dia: num(f.multa_dia) }))
  const guardarFuentes = () => run(() => api.actualizarOT(ot.id, { drive_folder_id: f.drive_folder_id || null, remitentes_cliente: f.remitentes.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean), correo_cliente: f.correo_cliente || null }))
  const guardarPartidas = () => run(() => Promise.all((datos.partidas || []).map(p => api.guardarPartida(p.id, { monto: num(partidas[p.id]) }))), 'Montos de partida guardados')
  const sumaPartidas = (datos.partidas || []).reduce((a, p) => a + num(partidas[p.id]), 0)
  const miembroDe = uid => (datos.miembros || []).find(m => m.user_id === uid)
  const col2 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {msg && <Aviso tono={msg.startsWith('ERROR') ? 'rojo' : 'verde'}>{msg}</Aviso>}
      <Card title="Portal del cliente" right={ot.portal_publicado ? <Pill tono="verde">publicado</Pill> : <Pill tono="gris">sin publicar</Pill>}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <Switch on={ot.portal_publicado} onChange={v => run(() => api.actualizarOT(ot.id, { portal_publicado: v }), v ? 'Portal publicado: el cliente con acceso ya puede ver la obra' : 'Portal despublicado')} />
          <div style={{ fontSize: 12.5, flex: 1, minWidth: 240 }}>Mientras esté apagado, el cliente no ve nada aunque tenga usuario. Lo que ve está a la derecha (vista «Cliente»).</div>
        </div>
      </Card>
      <AccesoCliente datos={datos} recargar={recargar} />

      <Card title="Datos del contrato" right={<Btn tipo="p" onClick={guardarContrato}>Guardar contrato</Btn>}>
        <div style={col2}>
          <Campo label="Código"><input value={f.codigo} onChange={set('codigo')} style={inp} /></Campo>
          <Campo label="Nombre de la obra"><input value={f.nombre} onChange={set('nombre')} style={inp} /></Campo>
          <Campo label="Cliente"><input value={f.cliente} onChange={set('cliente')} style={inp} list="avance-clientes" /><datalist id="avance-clientes">{[...new Set(otsERP.map(o => o.cliente).filter(Boolean))].map(c => <option key={c} value={c} />)}</datalist></Campo>
          <Campo label="Inicio contractual"><input type="date" value={f.fecha_inicio_contractual} onChange={set('fecha_inicio_contractual')} style={inp} /></Campo>
          <Campo label="Plazo (días)"><input inputMode="numeric" value={f.plazo_dias} onChange={set('plazo_dias')} style={inp} /></Campo>
          <Campo label="Kg de contrato"><input inputMode="decimal" value={f.kg_contrato} onChange={set('kg_contrato')} style={inp} /></Campo>
          <Campo label="Precio contrato (neto)"><input inputMode="decimal" value={f.precio_contrato} onChange={set('precio_contrato')} style={inp} /></Campo>
          <Campo label="Suma de partidas a precio lista"><input inputMode="decimal" value={f.suma_partidas} onChange={set('suma_partidas')} style={inp} /></Campo>
          <Campo label="Anticipo (neto)"><input inputMode="decimal" value={f.anticipo} onChange={set('anticipo')} style={inp} /></Campo>
          <Campo label="Retención %"><input inputMode="decimal" value={f.retencion_pct} onChange={set('retencion_pct')} style={inp} /></Campo>
          <Campo label="Amortización del anticipo"><select value={f.amortizacion} onChange={set('amortizacion')} style={inp}><option value="total">Total (todo el periodo hasta cubrirlo)</option><option value="proporcional">Proporcional (% de cada EDP)</option></select></Campo>
          <Campo label="% si es proporcional"><input inputMode="decimal" value={f.amortizacion_pct} onChange={set('amortizacion_pct')} style={inp} disabled={f.amortizacion !== 'proporcional'} /></Campo>
          <Campo label="Multa por día de atraso"><input inputMode="decimal" value={f.multa_dia} onChange={set('multa_dia')} style={inp} /></Campo>
        </div>
        <Nota style={{ marginTop: 8 }}>Factor contrato = precio ÷ suma de partidas = <b>{num(f.suma_partidas) > 0 ? (num(f.precio_contrato) / num(f.suma_partidas)).toFixed(4) : '—'}</b>. El método de amortización es una de las decisiones pendientes de Gerencia.</Nota>
      </Card>

      <Card title="Partidas del contrato (precio lista)" right={<><span>suma {fmtCLP(sumaPartidas)}</span><Btn tipo="p" onClick={guardarPartidas}>Guardar partidas</Btn></>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {(datos.partidas || []).map(p => <Campo key={p.id} label={<span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: COLOR_PARTIDA[p.codigo], marginRight: 5 }} />{p.nombre}</span>}><input inputMode="decimal" value={partidas[p.id] ?? ''} onChange={e => setPartidas(s => ({ ...s, [p.id]: e.target.value }))} style={inp} /></Campo>)}
        </div>
      </Card>

      <Card title="Fuentes que lee el sistema" right={<Btn tipo="p" onClick={guardarFuentes}>Guardar fuentes</Btn>}>
        <div style={col2}>
          <Campo label="Carpeta de Drive (id o enlace)" style={{ gridColumn: '1 / 3' }}><input value={f.drive_folder_id} onChange={set('drive_folder_id')} style={inp} placeholder="https://drive.google.com/drive/folders/…" /></Campo>
          <Campo label="Correo de contacto del cliente"><input value={f.correo_cliente} onChange={set('correo_cliente')} style={inp} /></Campo>
          <Campo label="Remitentes del cliente a leer (separados por coma)" style={{ gridColumn: '1 / -1' }}><input value={f.remitentes} onChange={set('remitentes')} style={inp} placeholder="ito@cliente.cl, obras@cliente.cl" /></Campo>
        </div>
        <Nota style={{ marginTop: 8 }}>Última lectura: {ot.ultima_lectura ? new Date(ot.ultima_lectura).toLocaleString('es-CL') : 'nunca'}. En la fase 2 el botón «Actualizar proyecto» leerá esta carpeta y estos remitentes y te propondrá eventos, documentos y ajustes para confirmar.</Nota>
      </Card>

      <Card title="Quién puede entrar a esta OT (equipo SEREIN)" right="admin edita todo · operador carga avance y eventos">
        {perfiles.length === 0 ? <Nota>No pude leer la lista de usuarios del ERP.</Nota> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
            {perfiles.filter(p => !['subcontrato', 'taller_externo', 'cliente'].includes(p.tipo || '')).map(p => { const m = miembroDe(p.id); return (
              <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1px solid ' + S.line, borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
                <span style={{ flex: 1 }}>{p.nombre || p.id}<div style={{ fontSize: 10.5, color: S.textFaint }}>{p.tipo || 'interno'}</div></span>
                <select value={m?.rol || ''} onChange={e => run(() => api.fijarMiembro(ot.id, p.id, e.target.value), 'Acceso actualizado')} style={{ ...inp, width: 'auto', padding: '3px 6px' }}><option value="">sin acceso</option><option value="operador">operador</option><option value="admin">admin</option></select>
              </div>) })}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ---------------- Asistente «Nueva OT» (4 pasos) ---------------- */
function NuevaOT({ otsERP, onCerrar, onCreada }) {
  const [paso, setPaso] = useState(0)
  const [f, setF] = useState({ codigo: '', nombre: '', cliente: '', fecha_inicio_contractual: hoyISO(), plazo_dias: '120', kg_contrato: '', precio_contrato: '', suma_partidas: '', anticipo: '', retencion_pct: '10', amortizacion: 'total', amortizacion_pct: '30', multa_dia: '', drive_folder_id: '', remitentes: '', correo_cliente: '', partidas: { prov: '', mon: '', pin: '', int: '', ter: '' } })
  const [err, setErr] = useState('')
  const [creando, setCreando] = useState(false)
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }))
  const elegirOT = e => { const o = otsERP.find(x => String(x.numero) === e.target.value); if (!o) return; setF(s => ({ ...s, codigo: /^ot/i.test(String(o.numero)) ? String(o.numero).toUpperCase() : 'OT' + o.numero, cliente: o.cliente || s.cliente, nombre: s.nombre || o.nombre || o.proyecto || o.descripcion || '' })) }
  const pasos = ['OT y contrato', 'Carpeta de Drive', 'Correo del cliente', 'Confirmar']
  const validar = () => {
    if (paso === 0) { if (!f.codigo.trim()) return 'Falta el código de la OT'; if (!f.nombre.trim()) return 'Falta el nombre de la obra'; if (!f.fecha_inicio_contractual) return 'Falta el inicio contractual'; if (!(num(f.plazo_dias) > 0)) return 'El plazo debe ser mayor que cero' }
    return ''
  }
  const siguiente = () => { const e = validar(); if (e) { setErr(e); return } setErr(''); setPaso(p => p + 1) }
  const crear = async () => {
    setCreando(true); setErr('')
    try {
      const kg = num(f.kg_contrato)
      const procesos = PLANTILLA_PROCESOS.map((p, i) => ({ codigo: p.codigo, nombre: p.nombre, orden: i + 1, duracion_sem: p.duracion_sem, peso_edp: p.peso_edp, partida: p.partida, unidad: p.unidad, cantidad_total: p.cantidad === 'kg' ? (kg || 1) : p.cantidad === '100' ? 100 : 1, plan_inicio: sumarDias(f.fecha_inicio_contractual, p.ini), plan_fin: sumarDias(f.fecha_inicio_contractual, p.fin), predecesor: p.predecesor, req_lib_externa: p.req_lib_externa, libera_externo: p.libera_externo, visible_cliente: true }))
      const partidas = PARTIDAS.map(c => ({ codigo: c, nombre: PARTIDAS_NOMBRE[c], monto: num(f.partidas[c]) }))
      const suma = num(f.suma_partidas) || partidas.reduce((a, p) => a + p.monto, 0)
      const id = await api.crearOT({ codigo: f.codigo.trim(), nombre: f.nombre.trim(), cliente: f.cliente.trim() || null, fecha_inicio_contractual: f.fecha_inicio_contractual, plazo_dias: Math.round(num(f.plazo_dias)), kg_contrato: kg, precio_contrato: num(f.precio_contrato), suma_partidas: suma, anticipo: num(f.anticipo), retencion_pct: num(f.retencion_pct) / 100, amortizacion: f.amortizacion, amortizacion_pct: num(f.amortizacion_pct) / 100, multa_dia: num(f.multa_dia), drive_folder_id: f.drive_folder_id.trim() || null, remitentes_cliente: f.remitentes.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean), correo_cliente: f.correo_cliente.trim() || null, partidas, procesos })
      await onCreada(id)
    } catch (e) { setErr(api.errorLegible(e)) } finally { setCreando(false) }
  }
  const g3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }
  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(16,19,21,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 'min(860px, 100%)', maxHeight: '92vh', overflow: 'auto', boxShadow: S.shadowMd, fontFamily: S.fontBody, color: S.text }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid ' + S.line, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><Eyebrow>Nueva OT en el módulo de avance</Eyebrow><div style={{ fontFamily: S.fontDisplay, fontWeight: 800, fontSize: 18 }}>{pasos[paso]}</div></div>
          <div style={{ display: 'flex', gap: 6 }}>{pasos.map((p, i) => <span key={p} style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: S.fontDisplay, fontWeight: 800, fontSize: 12, background: i === paso ? S.orange : i < paso ? S.ink : S.fog2, color: i <= paso ? '#fff' : S.textSoft }}>{i + 1}</span>)}</div>
        </div>
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {paso === 0 && (<>
            <div style={g3}>
              <Campo label="Tomar de una OT del ERP (opcional)"><select onChange={elegirOT} defaultValue="" style={inp}><option value="">Elegir…</option>{otsERP.slice().sort((a, b) => Number(b.numero) - Number(a.numero)).slice(0, 300).map(o => <option key={o.id || o.numero} value={o.numero}>{o.numero} · {o.cliente || ''}</option>)}</select></Campo>
              <Campo label="Código"><input value={f.codigo} onChange={set('codigo')} style={inp} placeholder="OT1030" /></Campo>
              <Campo label="Cliente"><input value={f.cliente} onChange={set('cliente')} style={inp} /></Campo>
              <Campo label="Nombre de la obra" style={{ gridColumn: '1 / -1' }}><input value={f.nombre} onChange={set('nombre')} style={inp} placeholder="Nave industrial · Galpón 2" /></Campo>
              <Campo label="Inicio contractual"><input type="date" value={f.fecha_inicio_contractual} onChange={set('fecha_inicio_contractual')} style={inp} /></Campo>
              <Campo label="Plazo (días)"><input inputMode="numeric" value={f.plazo_dias} onChange={set('plazo_dias')} style={inp} /></Campo>
              <Campo label="Kg de contrato"><input inputMode="decimal" value={f.kg_contrato} onChange={set('kg_contrato')} style={inp} /></Campo>
              <Campo label="Precio contrato (neto)"><input inputMode="decimal" value={f.precio_contrato} onChange={set('precio_contrato')} style={inp} /></Campo>
              <Campo label="Anticipo (neto)"><input inputMode="decimal" value={f.anticipo} onChange={set('anticipo')} style={inp} /></Campo>
              <Campo label="Multa por día"><input inputMode="decimal" value={f.multa_dia} onChange={set('multa_dia')} style={inp} /></Campo>
              <Campo label="Retención %"><input inputMode="decimal" value={f.retencion_pct} onChange={set('retencion_pct')} style={inp} /></Campo>
              <Campo label="Amortización del anticipo"><select value={f.amortizacion} onChange={set('amortizacion')} style={inp}><option value="total">Total</option><option value="proporcional">Proporcional</option></select></Campo>
              <Campo label="% si es proporcional"><input inputMode="decimal" value={f.amortizacion_pct} onChange={set('amortizacion_pct')} style={inp} disabled={f.amortizacion !== 'proporcional'} /></Campo>
            </div>
            <Eyebrow>Partidas del contrato a precio lista (puedes dejarlas en cero y completarlas después)</Eyebrow>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>{PARTIDAS.map(c => <Campo key={c} label={PARTIDAS_NOMBRE[c]}><input inputMode="decimal" value={f.partidas[c]} onChange={e => setF(s => ({ ...s, partidas: { ...s.partidas, [c]: e.target.value } }))} style={inp} /></Campo>)}</div>
          </>)}
          {paso === 1 && (<>
            <Campo label="Carpeta de Drive de la obra (enlace o id)"><input value={f.drive_folder_id} onChange={set('drive_folder_id')} style={inp} placeholder="https://drive.google.com/drive/folders/…" /></Campo>
            <Nota>Es la carpeta que el sistema leerá en la fase 2 (contrato, planos, calidad). Puedes dejarla vacía y agregarla después en Configuración.</Nota>
          </>)}
          {paso === 2 && (<>
            <Campo label="Correo de contacto del cliente"><input value={f.correo_cliente} onChange={set('correo_cliente')} style={inp} /></Campo>
            <Campo label="Remitentes del cliente cuyos correos se leerán (separados por coma)"><input value={f.remitentes} onChange={set('remitentes')} style={inp} placeholder="ito@cliente.cl, obras@cliente.cl" /></Campo>
            <Nota>Solo se leerán correos de estos remitentes, y nada se aplicará sin tu confirmación.</Nota>
          </>)}
          {paso === 3 && (
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              Se creará <b>{f.codigo} · {f.nombre}</b>{f.cliente ? ' para ' + f.cliente : ''}, inicio {fmtFecha(f.fecha_inicio_contractual)}, plazo {f.plazo_dias} días, con los <b>10 procesos de la plantilla</b> (ING → PER → SUM → COR → ARM → SOL → PIN → MON → INT → TER), sus liberaciones interna y externa, las 5 partidas y el evento de inicio en el libro de obra.<br />
              Tú quedas como administradora y el resto del equipo interno del ERP queda con acceso (gerencia como admin, los demás como operadores). El portal del cliente nace <b>sin publicar</b>.
              <Nota style={{ marginTop: 6 }}>Las cantidades totales de los procesos en kg toman los kg de contrato; las de m² y pedestales quedan en 1 para que las completes en «Procesos y liberaciones» antes de cargar avance.</Nota>
            </div>
          )}
          {err && <Aviso>{err}</Aviso>}
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid ' + S.line, display: 'flex', justifyContent: 'space-between' }}>
          <Btn onClick={onCerrar}>Cancelar</Btn>
          <div style={{ display: 'flex', gap: 8 }}>
            {paso > 0 && <Btn onClick={() => setPaso(p => p - 1)}>Atrás</Btn>}
            {paso < 3 ? <Btn tipo="p" onClick={siguiente}>Siguiente</Btn> : <Btn tipo="p" disabled={creando} onClick={crear}>{creando ? 'Creando…' : 'Crear OT'}</Btn>}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Acceso del cliente (fase 3) ---------------- */
function AccesoCliente({ datos, recargar }) {
  const ot = datos.ot
  const clientes = (datos.miembros || []).filter(m => m.rol === 'cliente')
  const [usuario, setUsuario] = useState(() => String(ot.cliente || 'cliente').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 40))
  const [nombre, setNombre] = useState(ot.cliente || '')
  const [msg, setMsg] = useState(null) // { ok, texto, usuario, clave }
  const [trab, setTrab] = useState(false)
  const llamar = async (accion, u) => {
    setTrab(true); setMsg(null)
    try { const r = await api.invitarCliente({ ot_id: ot.id, accion, usuario: u || usuario, nombre }); setMsg({ ok: true, texto: r.mensaje, usuario: r.usuario, clave: r.clave_inicial }); recargar() }
    catch (e) { setMsg({ ok: false, texto: api.errorLegible(e) }) } finally { setTrab(false) }
  }
  return (
    <Card title="Acceso del cliente al portal" right={clientes.length ? <Pill tono="verde">{clientes.length} usuario{clientes.length > 1 ? 's' : ''}</Pill> : <Pill tono="gris">sin usuario</Pill>}>
      {clientes.map(m => (
        <div key={m.user_id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #EEF1F4', fontSize: 12.5 }}>
          <span style={{ flex: 1 }}>Usuario <b>{m.usuario}</b>{m.debe_cambiar_clave ? <Pill tono="ambar" style={{ marginLeft: 6 }}>debe cambiar su clave al entrar</Pill> : <Pill tono="verde" style={{ marginLeft: 6 }}>clave propia</Pill>}</span>
          <Btn tipo="s" disabled={trab} onClick={() => llamar('reiniciar', m.usuario)}>Reiniciar clave</Btn>
          <Btn tipo="s" disabled={trab} onClick={() => { if (window.confirm('¿Quitar el acceso de ' + m.usuario + '? Podrás crearlo de nuevo.')) llamar('revocar', m.usuario) }} style={{ color: S.red }}>Revocar</Btn>
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end', marginTop: 10 }}>
        <Campo label="Usuario (sin espacios ni @)"><input value={usuario} onChange={e => setUsuario(e.target.value.toLowerCase().replace(/[^a-z0-9.]/g, ''))} style={inp} /></Campo>
        <Campo label="Nombre que verá en pantalla"><input value={nombre} onChange={e => setNombre(e.target.value)} style={inp} /></Campo>
        <Btn tipo="p" disabled={trab || usuario.length < 3} onClick={() => llamar('crear')}>{trab ? 'Creando…' : 'Crear acceso'}</Btn>
      </div>
      {msg && <div style={{ marginTop: 10 }}><Aviso tono={msg.ok ? 'verde' : 'rojo'}>{msg.texto}{msg.clave && <div style={{ marginTop: 8, fontFamily: S.fontDisplay, fontSize: 15 }}>Usuario: <b>{msg.usuario}</b> · Clave inicial: <b>{msg.clave}</b><div style={{ fontSize: 11.5, fontFamily: S.fontBody, fontWeight: 400, marginTop: 4 }}>Entra en app.sereinspa.com escribiendo solo el usuario (sin @). Anótala ahora: no se vuelve a mostrar. El cliente deberá cambiarla en su primer ingreso.</div></div>}</Aviso></div>}
      <Nota style={{ marginTop: 8 }}>El cliente entra por la misma dirección del ERP y solo ve el portal de su obra (lo decide la base de datos, no la pantalla). Mientras el portal esté sin publicar, no verá nada aunque tenga usuario.</Nota>
    </Card>
  )
}
