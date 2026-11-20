// Módulo Avance de Obra · chat maestro (fase 5). Panel lateral: preguntas en
// lenguaje natural sobre la OT y pedidos de cambio que el servidor convierte
// en PROPUESTAS (pestaña Propuestas), nunca en cambios directos. El mismo
// componente sirve al cliente (modo 'cliente': solo datos publicados y sin
// propuestas; lo decide la función de servidor según el rol, no la pantalla).
import React, { useState, useRef, useEffect } from 'react'
import { X, Send, Sparkles } from 'lucide-react'
import { S, Btn, Nota } from './ui.jsx'
import * as api from './api.js'

const SUGERENCIAS_INTERNO = ['¿Cómo vamos respecto del programa?', '¿Cuánto cobraríamos hoy en el próximo EDP?', '¿Qué está esperando respuesta del cliente?', 'Registra una detención por lluvia desde ayer', '¿Qué procesos tienen liberación bloqueada?']
const SUGERENCIAS_CLIENTE = ['¿En qué va mi obra?', '¿Cuándo termina según el plan vigente?', '¿Qué documentos hay publicados?', '¿Hay algo pendiente de mi respuesta?']

export default function ChatMaestro({ otId, otCodigo, modo = 'interno', onCerrar, onPropuestas, embebido = false }) {
  const clave = 'serein_avance_chat_' + otId
  const [msgs, setMsgs] = useState(() => { try { return JSON.parse(sessionStorage.getItem(clave) || '[]') } catch (e) { return [] } })
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const fin = useRef(null)
  useEffect(() => { try { sessionStorage.setItem(clave, JSON.stringify(msgs.slice(-30))) } catch (e) {} ; fin.current && fin.current.scrollIntoView({ behavior: 'smooth' }) }, [msgs, clave])

  const enviar = async (q) => {
    const pregunta = (q || texto).trim()
    if (!pregunta || pensando) return
    setTexto('')
    const nuevo = [...msgs, { rol: 'user', texto: pregunta, t: Date.now() }]
    setMsgs(nuevo); setPensando(true)
    try {
      const r = await api.chatMaestro(otId, pregunta, nuevo.slice(-12).map(m => ({ rol: m.rol, texto: m.texto })))
      setMsgs(m => [...m, { rol: 'assistant', texto: r.respuesta, propuestas: r.propuestas_creadas || 0, t: Date.now() }])
      if (r.propuestas_creadas && onPropuestas) onPropuestas(r.propuestas_creadas)
    } catch (e) {
      setMsgs(m => [...m, { rol: 'assistant', texto: 'No pude responder: ' + api.errorLegible(e), error: true, t: Date.now() }])
    } finally { setPensando(false) }
  }
  const sug = modo === 'cliente' ? SUGERENCIAS_CLIENTE : SUGERENCIAS_INTERNO
  const cont = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', fontFamily: S.fontBody, color: S.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid ' + S.line, background: S.ink, color: '#fff' }}>
        <Sparkles size={15} color={S.orange} />
        <div style={{ flex: 1 }}><div style={{ fontFamily: S.fontDisplay, fontWeight: 800, fontSize: 13.5 }}>{modo === 'cliente' ? 'Asistente de tu obra' : 'Chat maestro'}</div><div style={{ fontSize: 11, color: '#B9C0C8' }}>{otCodigo} · {modo === 'cliente' ? 'responde solo con lo publicado' : 'responde con los datos de la OT; los cambios quedan como propuestas'}</div></div>
        {msgs.length > 0 && <button onClick={() => setMsgs([])} title="Borrar conversación" style={{ background: 'none', border: 0, color: '#B9C0C8', cursor: 'pointer', fontSize: 11 }}>limpiar</button>}
        {onCerrar && <button onClick={onCerrar} style={{ background: 'none', border: 0, color: '#fff', cursor: 'pointer' }}><X size={16} /></button>}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, background: S.fog }}>
        {msgs.length === 0 && (
          <div>
            <Nota style={{ marginBottom: 8 }}>Prueba con:</Nota>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{sug.map(s => <button key={s} onClick={() => enviar(s)} style={{ textAlign: 'left', background: '#fff', border: '1px solid ' + S.line, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', color: S.text }}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.rol === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%', background: m.rol === 'user' ? S.orange : '#fff', color: m.rol === 'user' ? '#fff' : m.error ? S.red : S.text, border: m.rol === 'user' ? 0 : '1px solid ' + S.line, borderRadius: 10, padding: '8px 11px', fontSize: 12.5, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
            {m.texto}
            {m.propuestas > 0 && <div style={{ marginTop: 6, fontSize: 11.5, color: S.orangeDark, fontWeight: 600 }}>Dejé {m.propuestas} propuesta{m.propuestas === 1 ? '' : 's'} en la pestaña «Propuestas» para que la confirmes.</div>}
          </div>
        ))}
        {pensando && <div style={{ alignSelf: 'flex-start', color: S.textFaint, fontSize: 12 }}>Pensando con los datos de la OT…</div>}
        <div ref={fin} />
      </div>
      <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid ' + S.line }}>
        <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }} placeholder={modo === 'cliente' ? 'Pregunta sobre tu obra…' : 'Pregunta o pide un cambio…'} style={{ flex: 1, border: '1px solid ' + S.line, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, fontFamily: S.fontBody }} />
        <Btn tipo="p" disabled={pensando || !texto.trim()} onClick={() => enviar()}><Send size={13} /></Btn>
      </div>
    </div>
  )
  if (embebido) return <div style={{ height: 520, border: '1px solid ' + S.line, borderRadius: 10, overflow: 'hidden' }}>{cont}</div>
  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 100vw)', zIndex: 900, boxShadow: '-12px 0 32px -12px rgba(16,19,21,.35)' }}>{cont}</div>
  )
}
