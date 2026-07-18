// ============================================================
// Serein AI - WIDGET FLOTANTE (boton robot + panel de chat)
// ------------------------------------------------------------
// Se monta UNA vez en Dashboard.jsx y aparece sobre cualquier
// pantalla autorizada. Fase 1: SOLO CONSULTA. No crea, edita,
// aprueba ni envia nada. Responde con el motor (reglas + tools
// controladas) sobre los datos reales que el usuario ya puede ver.
//
// Aislado con un ErrorBoundary propio: si algo falla, el widget se
// oculta y el resto del panel sigue funcionando normalmente.
// ============================================================

import React, { useState, useRef, useEffect } from 'react'
import { Bot, X, Send, Plus, Maximize2, Minimize2, ExternalLink } from 'lucide-react'
import { derivarContexto } from './permisos.js'
import { responder, saludo } from './motor.js'
import { crearConversacion, guardarMensaje, registrarAuditoria } from './historial.js'

const C = { carbon: '#161616', ambar: '#D2642F', borde: '#E2DED4', gris: '#7A8288', niebla: '#F6F0EA' }

// Etiqueta amable para el enlace de una fuente.
function etiquetaFuente(f) {
  const map = {
    GESTION_OT: 'Ver OT', COTIZADOR: 'Ver cotizacion', PRODUCCION: 'Ver produccion',
    FINANZAS: 'Ver finanzas', ORDENES_COMPRA: 'Ver OC', 'Santa Rosa': 'Ver facturas',
    'Istria': 'Ver facturas', GESTION_PROYECTOS: 'Ver proyectos', COMPRAS_OP: 'Ver compras',
  }
  if (f.enlace && map[f.enlace]) return map[f.enlace] + (f.ref ? ` ${f.ref}` : '')
  return 'Ver ' + (f.modulo || 'detalle')
}

function hora(ts) {
  try { return new Date(ts).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }
  catch (e) { return '' }
}

class Guard extends React.Component {
  constructor(p) { super(p); this.state = { err: false } }
  static getDerivedStateFromError() { return { err: true } }
  componentDidCatch(e) { try { console.error('Serein AI widget:', e) } catch (x) {} }
  render() { return this.state.err ? null : this.props.children }
}

function Widget({ perfil = {}, email = '', areaSel, onNavegar, datos = {} }) {
  const ctx = React.useMemo(() => derivarContexto(perfil, email), [perfil, email])
  const [abierto, setAbierto] = useState(false)
  const [full, setFull] = useState(false)
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [noLeido, setNoLeido] = useState(false)
  const [convId, setConvId] = useState(null)
  const [mensajes, setMensajes] = useState(() => ([
    { rol: 'assistant', texto: saludo(ctx.nombre), fuentes: [], ts: Date.now() },
  ]))
  const finRef = useRef(null)
  const inputRef = useRef(null)
  const memoriaRef = useRef({ ultimasEntidades: [] })

  useEffect(() => { if (abierto) finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes, pensando, abierto])
  useEffect(() => { if (abierto) { setNoLeido(false); setTimeout(() => inputRef.current?.focus(), 60) } }, [abierto])

  function nuevaConversacion() {
    setConvId(null)
    setMensajes([{ rol: 'assistant', texto: saludo(ctx.nombre), fuentes: [], ts: Date.now() }])
    setTexto('')
    memoriaRef.current = { ultimasEntidades: [] }
  }

  async function enviar(e) {
    e?.preventDefault()
    const pregunta = texto.trim()
    if (!pregunta || pensando) return
    setTexto('')
    setMensajes(m => [...m, { rol: 'user', texto: pregunta, ts: Date.now() }])
    setPensando(true)

    // Conversacion persistente (si el historial esta disponible)
    let cid = convId
    try {
      if (!cid) { cid = await crearConversacion(pregunta.slice(0, 60)); if (cid) setConvId(cid) }
      if (cid) guardarMensaje(cid, 'user', pregunta)
    } catch (x) {}

    let r
    try {
      r = await responder(pregunta, ctx, datos, { areaSel, memoria: memoriaRef.current })
    } catch (x) {
      r = { texto: 'No pude consultar esta informacion en este momento. El error quedo registrado para revision.', fuentes: [], intent: 'error', ok: false, error: String(x), meta: {}, duracion_ms: 0 }
    }
    // Recuerda las entidades de esta respuesta (ej: la lista de OT) para resolver preguntas de seguimiento como "cual tiene mas m2".
    if (r.meta && Array.isArray(r.meta.entidades) && r.meta.entidades.length > 0) {
      memoriaRef.current = { ultimasEntidades: r.meta.entidades }
    }
    setMensajes(m => [...m, { rol: 'assistant', texto: r.texto, fuentes: r.fuentes || [], ts: Date.now() }])
    setPensando(false)
    if (!abierto) setNoLeido(true)

    // Persistencia + auditoria (silenciosas)
    try {
      if (cid) guardarMensaje(cid, 'assistant', r.texto, { intent: r.intent, fuentes: r.fuentes })
      registrarAuditoria({
        email: ctx.email, rol: ctx.rol, pregunta, intent: r.intent, herramienta: r.herramienta,
        modulos_consultados: r.meta?.modulos_consultados, registros_consultados: r.meta?.registros_consultados,
        permisos_aplicados: r.meta?.permisos_aplicados, ok: r.ok, error: r.error, duracion_ms: r.duracion_ms, modelo: 'reglas',
      })
    } catch (x) {}
  }

  // ---- Boton flotante (cerrado) ----
  if (!abierto) {
    return (
      <>
        <style>{'@keyframes sereinPulse{0%{box-shadow:0 0 0 0 rgba(210,100,47,.45)}70%{box-shadow:0 0 0 14px rgba(210,100,47,0)}100%{box-shadow:0 0 0 0 rgba(210,100,47,0)}}'}</style>
        <button aria-label="Abrir Serein AI" onClick={() => setAbierto(true)}
          style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 2147483000, width: 58, height: 58, borderRadius: '50%', border: 'none', cursor: 'pointer', background: C.carbon, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 20px rgba(16,24,40,.28)', animation: 'sereinPulse 2.6s infinite' }}>
          <Bot size={26} color={C.ambar} />
          {noLeido && <span style={{ position: 'absolute', top: 6, right: 6, width: 12, height: 12, borderRadius: '50%', background: '#3D7A4E', border: '2px solid #fff' }} />}
        </button>
      </>
    )
  }

  // ---- Panel abierto ----
  const ancho = full ? 'min(760px, calc(100vw - 24px))' : 'min(400px, calc(100vw - 24px))'
  const alto = full ? 'calc(100vh - 24px)' : 'min(560px, calc(100vh - 40px))'

  return (
    <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 2147483000, width: ancho, height: alto, display: 'flex', flexDirection: 'column', background: '#fff', border: `1px solid ${C.borde}`, borderRadius: 12, boxShadow: '0 12px 40px rgba(16,24,40,.32)', overflow: 'hidden', fontFamily: "'Inter',sans-serif" }}>
      {/* Encabezado */}
      <div style={{ background: C.carbon, color: '#fff', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#22201E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bot size={18} color={C.ambar} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15, letterSpacing: .3 }}>Serein AI</div>
          <div style={{ fontSize: 10.5, color: '#B8C0C6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ctx.nombre} · {ctx.rol}</div>
        </div>
        <button title="Nueva conversacion" onClick={nuevaConversacion} style={iconBtn}><Plus size={17} /></button>
        <button title={full ? 'Reducir' : 'Pantalla completa'} onClick={() => setFull(f => !f)} style={iconBtn}>{full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
        <button title="Minimizar" onClick={() => setAbierto(false)} style={iconBtn}><X size={18} /></button>
      </div>

      {/* Aviso Fase 1 */}
      <div style={{ background: '#FBF3EC', borderBottom: `1px solid ${C.borde}`, padding: '6px 12px', fontSize: 10.5, color: '#7A5A3A' }}>
        Solo consulta · responde con tus datos reales y respeta tus permisos. No crea ni modifica registros.
      </div>

      {/* Mensajes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: '#FCFBF9' }}>
        {mensajes.map((m, i) => (
          <div key={i} style={{ alignSelf: m.rol === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
            <div style={{ background: m.rol === 'user' ? C.carbon : '#fff', color: m.rol === 'user' ? '#fff' : C.carbon, padding: '9px 12px', fontSize: 13, lineHeight: 1.5, borderRadius: 10, border: m.rol === 'user' ? 'none' : `1px solid ${C.borde}`, whiteSpace: 'pre-wrap' }}>{m.texto}</div>
            {m.fuentes && m.fuentes.length > 0 && (
              <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {m.fuentes.map((f, j) => (
                  <button key={j} onClick={() => f.enlace && onNavegar?.(f.enlace)} disabled={!f.enlace}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.ambar, background: '#fff', border: `1px solid ${C.borde}`, borderRadius: 20, padding: '3px 9px', cursor: f.enlace ? 'pointer' : 'default' }}>
                    <ExternalLink size={11} /> {etiquetaFuente(f)}
                  </button>
                ))}
              </div>
            )}
            <div style={{ fontSize: 9.5, color: C.gris, marginTop: 3, textAlign: m.rol === 'user' ? 'right' : 'left' }}>{hora(m.ts)}</div>
          </div>
        ))}
        {pensando && (
          <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, color: C.gris, fontSize: 12.5, padding: '4px 2px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.ambar, animation: 'sereinPulse 1.2s infinite' }} /> Analizando informacion…
          </div>
        )}
        <div ref={finRef} />
      </div>

      {/* Entrada */}
      <form onSubmit={enviar} style={{ display: 'flex', borderTop: `1px solid ${C.borde}`, background: '#fff' }}>
        <input ref={inputRef} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe tu pregunta…"
          style={{ flex: 1, border: 'none', padding: '12px 12px', fontSize: 13, outline: 'none', fontFamily: "'Inter',sans-serif" }} />
        <button type="submit" disabled={pensando || !texto.trim()} aria-label="Enviar"
          style={{ background: (pensando || !texto.trim()) ? '#CBD2D6' : C.ambar, color: '#fff', border: 'none', padding: '0 16px', cursor: (pensando || !texto.trim()) ? 'default' : 'pointer', display: 'flex', alignItems: 'center' }}>
          <Send size={17} />
        </button>
      </form>
    </div>
  )
}

const iconBtn = { background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', opacity: .85 }

export default function SereinChatWidget(props) {
  if (!props || !props.perfil) return null
  return <Guard><Widget {...props} /></Guard>
}
