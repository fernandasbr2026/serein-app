// Módulo Avance de Obra · lo que ve el cliente. Se usa en dos lugares con el
// mismo código: (1) dentro del ERP, a la derecha de la vista interna, como
// «así lo verá el cliente» (modo 'preview', los botones no hacen nada), y
// (2) en ClienteObraApp.jsx para el usuario real del cliente (modo 'cliente').
// Acá se filtra lo interno por prolijidad, pero la barrera real la pone la
// base de datos (políticas del esquema `avance`): el cliente no puede pedir
// lo interno aunque conozca la dirección.
import React, { useState } from 'react'
import { SEREIN } from '../theme-serein.js'
import { fmtPct, fmtFecha, TIPOS_EVENTO } from './calc.js'
import { COLOR_PARTIDA } from './ui.jsx'

const S = SEREIN
const card = { background: '#fff', border: '1px solid ' + S.line, borderRadius: 8, padding: '10px 12px', fontSize: 12.5 }
const h5 = { margin: '0 0 6px', fontFamily: S.fontDisplay, fontSize: 12.5, fontWeight: 700 }
const barra = (pct, color) => (
  <span style={{ display: 'block', height: 8, background: S.fog2, borderRadius: 4, overflow: 'hidden' }}>
    <i style={{ display: 'block', height: '100%', width: Math.round(Math.max(0, Math.min(1, pct)) * 100) + '%', background: color }} />
  </span>
)

export function filtrarParaCliente(datos) {
  if (!datos) return datos
  return {
    ...datos,
    procesos: (datos.procesos || []).filter(p => p.visible_cliente !== false),
    libro: (datos.libro || []).filter(e => !e.interno),
    documentos: (datos.documentos || []).filter(d => !d.interno),
    aprobaciones: (datos.aprobaciones || []).filter(a => !(a.libro_obra && a.libro_obra.interno)),
    edp: (datos.edp || []).filter(e => e.estado !== 'borrador'),
  }
}

export default function VistaCliente({ datos, resumen, modo = 'preview', onResponder, usuario }) {
  const [resp, setResp] = useState(null) // { id, accion }
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [err, setErr] = useState('')
  if (!datos || !datos.ot) return null
  const d = filtrarParaCliente(datos)
  const r = resumen
  const ot = d.ot
  const pendientes = d.aprobaciones.filter(a => a.estado === 'pend')
  const estadoPlazo = !r?.plazo ? null : r.atraso > 0 ? { t: 'Con atraso proyectado', bg: S.redSoft, fg: S.red } : r.plazo.renovacion ? { t: 'En plazo renovado', bg: S.greenSoft, fg: S.green } : { t: 'En plazo', bg: S.greenSoft, fg: S.green }
  const esPreview = modo === 'preview'
  const procesosRes = (r?.procesos || []).filter(p => p.visibleCliente)

  const enviar = async () => {
    if (!resp || !onResponder) return
    if (resp.accion !== 'ok' && !comentario.trim()) { setErr('Para comentar o rechazar debes escribir el motivo.'); return }
    setEnviando(true); setErr('')
    try { await onResponder(resp.id, resp.accion, comentario.trim()); setResp(null); setComentario('') } catch (e) { setErr(e.message || String(e)) } finally { setEnviando(false) }
  }

  return (
    <div style={{ background: S.fog, borderRadius: 12, overflow: 'hidden', fontFamily: S.fontBody, color: S.text }}>
      <div style={{ background: '#fff', padding: '12px 14px', borderBottom: '1px solid ' + S.line, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: S.fontDisplay, fontSize: 14.5, fontWeight: 800 }}>{ot.nombre}</div>
          <div style={{ color: S.textSoft, fontSize: 11.5 }}>SEREIN Group · {ot.cliente || 'Cliente'} · {ot.codigo}{usuario && usuario !== ot.cliente ? ' · ' + usuario : ''}</div>
        </div>
        {estadoPlazo && <span style={{ background: estadoPlazo.bg, color: estadoPlazo.fg, borderRadius: 20, padding: '3px 10px', fontSize: 11.5, fontWeight: 600 }}>{estadoPlazo.t}</span>}
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[['Avance', fmtPct(r?.real || 0)], ['Término vigente', fmtFecha(r?.plazo?.termino)], ['EDP presentados', String(d.edp.length)]].map(([l, v]) => (
            <div key={l} style={{ ...card, padding: '9px 10px' }}>
              <div style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: S.textFaint, fontWeight: 700 }}>{l}</div>
              <div style={{ fontFamily: S.fontDisplay, fontSize: 18, fontWeight: 800, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>

        {pendientes.length > 0 && (
          <div style={{ ...card, border: '1px solid ' + S.orange, background: S.orangeSoft }}>
            <div style={h5}>Necesitamos tu respuesta</div>
            {pendientes.map(a => (
              <div key={a.id} style={{ marginBottom: 8 }}>
                <div><b>{a.libro_obra?.titulo || a.clase}</b> · {a.clase}{a.vence ? ' · vence ' + fmtFecha(a.vence) : ''}</div>
                {resp && resp.id === a.id ? (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 11.5, color: S.textSoft, marginBottom: 4 }}>{resp.accion === 'ok' ? 'Puedes agregar un comentario (opcional).' : 'Escribe el motivo (obligatorio).'}</div>
                    <textarea value={comentario} onChange={e => setComentario(e.target.value)} rows={3} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid ' + S.line, borderRadius: 6, padding: 8, fontSize: 12.5, fontFamily: S.fontBody }} />
                    {err && <div style={{ color: S.red, fontSize: 11.5, marginTop: 4 }}>{err}</div>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button disabled={enviando} onClick={enviar} style={{ flex: 1, background: S.orange, color: '#fff', border: 0, borderRadius: 5, padding: 7, fontWeight: 600, cursor: 'pointer' }}>{enviando ? 'Enviando…' : 'Enviar respuesta'}</button>
                      <button disabled={enviando} onClick={() => { setResp(null); setErr('') }} style={{ background: '#fff', border: '1px solid ' + S.line, borderRadius: 5, padding: '7px 10px', cursor: 'pointer' }}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {[['ok', 'Aprobar', true], ['com', 'Con comentarios', false], ['rej', 'Rechazar', false]].map(([ac, t, p]) => (
                      <button key={ac} disabled={esPreview} onClick={() => setResp({ id: a.id, accion: ac })} title={esPreview ? 'En esta vista previa los botones no hacen nada' : ''}
                        style={{ flex: 1, textAlign: 'center', borderRadius: 5, padding: 6, fontSize: 11.5, fontWeight: 600, cursor: esPreview ? 'default' : 'pointer', background: p ? S.orange : '#fff', color: p ? '#fff' : S.text, border: '1px solid ' + (p ? S.orange : S.line), opacity: esPreview ? 0.85 : 1 }}>{t}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={card}>
          <div style={h5}>Procesos</div>
          {procesosRes.length === 0 && <div style={{ color: S.textFaint }}>Sin procesos visibles.</div>}
          {procesosRes.map(p => (
            <div key={p.codigo} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 52px', gap: 8, alignItems: 'center', padding: '4px 0' }}>
              <span style={{ fontFamily: S.fontDisplay, fontWeight: 800, color: COLOR_PARTIDA[p.partida] || S.orangeDark, fontSize: 11.5 }} title={p.nombre}>{p.codigo}</span>
              {barra(p.avance, COLOR_PARTIDA[p.partida] || S.orange)}
              <span style={{ textAlign: 'right', fontFamily: S.fontDisplay, fontWeight: 700 }}>{fmtPct(p.avance)}</span>
            </div>
          ))}
        </div>

        <div style={card}>
          <div style={h5}>Libro de obra</div>
          {d.libro.length === 0 && <div style={{ color: S.textFaint }}>Todavía no hay eventos publicados.</div>}
          {d.libro.slice(0, 8).map(e => (
            <div key={e.id} style={{ padding: '3px 0', borderTop: '1px solid #EEF1F4' }}>
              <b>{fmtFecha(e.fecha)}</b>{e.hasta ? ' → ' + fmtFecha(e.hasta) : ''} · {e.titulo} <span style={{ color: S.textFaint, fontSize: 11 }}>· {TIPOS_EVENTO[e.tipo] || e.tipo}</span>
              {e.detalle && <div style={{ color: S.textSoft, fontSize: 11.5 }}>{e.detalle}</div>}
            </div>
          ))}
        </div>

        <div style={card}>
          <div style={h5}>Documentos</div>
          {d.documentos.length === 0 && <div style={{ color: S.textFaint }}>Sin documentos publicados.</div>}
          {d.documentos.map(doc => (
            <div key={doc.id} style={{ padding: '3px 0', borderTop: '1px solid #EEF1F4' }}>
              {doc.url ? <a href={doc.url} target="_blank" rel="noreferrer" style={{ color: S.orangeDark, fontWeight: 600, textDecoration: 'none' }}>{doc.titulo}</a> : <b>{doc.titulo}</b>}
              {doc.paso && <span style={{ color: S.textFaint, fontSize: 11 }}> · {doc.paso}</span>}
              {doc.descripcion && <div style={{ color: S.textSoft, fontSize: 11.5 }}>{doc.descripcion}</div>}
            </div>
          ))}
          {d.edp.length > 0 && <div style={{ marginTop: 6, color: S.textSoft }}>EDP: {d.edp.map(e => 'N°' + e.numero + ' ' + e.estado).join(' · ')}</div>}
        </div>
        <div style={{ fontSize: 11, color: S.textFaint, textAlign: 'center' }}>Dudas sobre plazos, precios o adicionales: escríbenos a SEREIN. Esta vista muestra solo lo publicado para tu obra.</div>
      </div>
    </div>
  )
}
