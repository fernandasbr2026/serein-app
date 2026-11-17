// Módulo Avance de Obra · paneles internos: Procesos y liberaciones, EDP,
// Libro de obra, Documentos, Registros y Carga de avance. Cada uno recibe
// `datos` (filas de la base), `res` (resumenOT) y `recargar`.
import React, { useState, useMemo, useEffect } from 'react'
import * as api from './api.js'
import { S, Card, Eyebrow, Pill, Btn, inp, Campo, Nota, Aviso, Switch, Luz, ESTADO_LIB, Estanque, Barras, colorProceso, COLOR_PARTIDA, COLOR_PARTIDA_SUAVE } from './ui.jsx'
import { fmtPct, fmtCLP, fmtMM, fmtFecha, hoyISO, planProceso, secuenciaEDP, TIPOS_EVENTO, PARTIDAS_NOMBRE, PARTIDAS, dias } from './calc.js'

const num = v => { const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const useGuardar = recargar => {
  const [msg, setMsg] = useState('')
  const run = async (fn, okMsg) => { setMsg(''); try { await fn(); setMsg(okMsg || 'Guardado'); recargar && recargar(); setTimeout(() => setMsg(''), 2500) } catch (e) { setMsg('ERROR: ' + api.errorLegible(e)) } }
  return [msg, run]
}
const Msg = ({ m }) => m ? <span style={{ fontSize: 11.5, color: m.startsWith('ERROR') ? S.red : S.green, whiteSpace: 'pre-wrap' }}>{m}</span> : null

/* ---------------- 02 · Procesos y liberaciones ---------------- */
export function PanelProcesos({ datos, res, recargar }) {
  const [msg, run] = useGuardar(recargar)
  const [ed, setEd] = useState({}) // id -> cambios pendientes
  const libDe = (pid, tipo) => (datos.liberaciones || []).find(l => l.proceso_id === pid && l.tipo === tipo)
  const hoy = res?.hoy || hoyISO()
  const campo = (p, k, extra) => <input {...extra} value={ed[p.id]?.[k] ?? p[k] ?? ''} onChange={e => setEd(s => ({ ...s, [p.id]: { ...(s[p.id] || {}), [k]: e.target.value } }))} style={{ ...inp, padding: '4px 7px', width: 74, textAlign: 'right' }} />
  const guardarFila = p => run(async () => {
    const c = ed[p.id]; if (!c) return
    const cambios = {}
    if (c.duracion_sem != null) cambios.duracion_sem = num(c.duracion_sem)
    if (c.peso_edp != null) cambios.peso_edp = num(c.peso_edp)
    if (c.cantidad_total != null) cambios.cantidad_total = Math.max(0.000001, num(c.cantidad_total))
    if (c.nombre != null) cambios.nombre = c.nombre
    if (c.libera_externo != null) cambios.libera_externo = c.libera_externo
    await api.guardarProceso(p.id, cambios)
    setEd(s => { const n = { ...s }; delete n[p.id]; return n })
  })
  const cambiarLib = (p, tipo, estado) => run(() => api.fijarLiberacion(p.id, tipo, { estado }), 'Liberación actualizada')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card title="Cadena de procesos" right={<><span>real a rayas · marca gris = programa a hoy</span><Msg m={msg} /></>}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, datos.procesos.length)}, 1fr)`, gap: 6 }}>
          {res.procesos.map((rp, i) => {
            const p = datos.procesos[i]
            const col = colorProceso(p)
            const plan = res.plazo ? planProceso(rp, hoy, res.plazo.desplazamiento) : 0
            return (
              <div key={p.id} style={{ textAlign: 'center', borderTop: '3px solid ' + col, background: S.fog, borderRadius: 8, padding: '8px 4px 6px', position: 'relative' }}>
                {i < datos.procesos.length - 1 && <span style={{ position: 'absolute', right: -7, top: 14, color: S.textFaint, fontSize: 12 }}>›</span>}
                <div style={{ fontFamily: S.fontDisplay, fontWeight: 800, color: col, fontSize: 12.5 }}>{p.codigo}</div>
                <div style={{ fontSize: 10, color: S.textSoft, height: 26, overflow: 'hidden', lineHeight: 1.2 }}>{p.nombre}</div>
                <div style={{ display: 'flex', justifyContent: 'center' }}><Estanque p={rp} plan={plan} color={col} alto={110} /></div>
                <div style={{ fontFamily: S.fontDisplay, fontWeight: 800, fontSize: 14 }}>{fmtPct(rp.avance)}</div>
                <div style={{ fontSize: 10, color: S.textFaint }}>prog. {fmtPct(plan)}</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 4 }}><Luz estado={libDe(p.id, 'interna')?.estado} etiqueta="INT" /><Luz estado={libDe(p.id, 'externa')?.estado} etiqueta="EXT" /></div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card title="Duración, peso y visibilidad" right="el avance sale solo de los partes cargados; aquí no se edita" pad={false}>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 1180, borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
          <thead><tr>{['', 'Proceso', 'Semanas', 'Peso EDP %', 'Cantidad total', 'Unidad', 'Partida', 'Liberación interna', 'Liberación externa', 'Ve cliente', ' '].map((h, i) => <th key={i} style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: S.textFaint, fontWeight: 700, textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid ' + S.line }}>{h}</th>)}</tr></thead>
          <tbody>
            {datos.procesos.map(p => {
              const li = libDe(p.id, 'interna'), le = libDe(p.id, 'externa')
              const selLib = (tipo, l) => <select value={l?.estado || 'pend'} onChange={e => cambiarLib(p, tipo, e.target.value)} style={{ ...inp, padding: '4px 6px', width: 'auto', color: (ESTADO_LIB[l?.estado || 'pend'] || [])[1] === S.fog2 ? S.textSoft : (ESTADO_LIB[l?.estado || 'pend'] || [])[1], fontWeight: 600 }}>{Object.entries(ESTADO_LIB).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select>
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #EEF1F4' }}>
                  <td style={{ padding: '6px 10px', fontFamily: S.fontDisplay, fontWeight: 800, color: colorProceso(p) }}>{p.codigo}</td>
                  <td style={{ padding: '6px 10px' }}><input value={ed[p.id]?.nombre ?? p.nombre} onChange={e => setEd(s => ({ ...s, [p.id]: { ...(s[p.id] || {}), nombre: e.target.value } }))} style={{ ...inp, padding: '4px 7px', minWidth: 170 }} /><div style={{ fontSize: 10.5, color: S.textFaint }}>{p.predecesor ? 'no puede superar a ' + p.predecesor : 'sin predecesor'}</div></td>
                  <td style={{ padding: '6px 10px' }}>{campo(p, 'duracion_sem', { inputMode: 'decimal' })}</td>
                  <td style={{ padding: '6px 10px' }}>{campo(p, 'peso_edp', { inputMode: 'decimal' })}</td>
                  <td style={{ padding: '6px 10px' }}>{campo(p, 'cantidad_total', { inputMode: 'decimal' })}</td>
                  <td style={{ padding: '6px 10px', color: S.textSoft }}>{p.unidad}</td>
                  <td style={{ padding: '6px 10px' }}><Pill style={{ background: COLOR_PARTIDA_SUAVE[p.partida], color: COLOR_PARTIDA[p.partida] }}>{PARTIDAS_NOMBRE[p.partida] || p.partida}</Pill></td>
                  <td style={{ padding: '6px 10px' }}>{selLib('interna', li)}</td>
                  <td style={{ padding: '6px 10px' }}>{p.req_lib_externa ? <>{selLib('externa', le)}<div style={{ fontSize: 10.5, color: S.textFaint }}>{p.libera_externo}</div></> : <span style={{ color: S.textFaint }}>no aplica</span>}</td>
                  <td style={{ padding: '6px 10px' }}><Switch on={p.visible_cliente !== false} onChange={v => run(() => api.guardarProceso(p.id, { visible_cliente: v }), v ? 'El cliente ahora ve ' + p.codigo : 'El cliente ya no ve ' + p.codigo)} /></td>
                  <td style={{ padding: '6px 10px' }}>{ed[p.id] && <Btn tipo="s" onClick={() => guardarFila(p)} style={{ background: S.orange, borderColor: S.orange, color: '#fff' }}>Guardar</Btn>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  )
}

/* ---------------- 03 · EDP ---------------- */
export function PanelEDP({ datos, res, recargar, onPDF }) {
  const [msg, run] = useGuardar(recargar)
  const ot = datos.ot
  const prm = { anticipo: Number(ot.anticipo || 0), retencionPct: Number(ot.retencion_pct || 0), amortizacion: ot.amortizacion || 'total', amortizacionPct: Number(ot.amortizacion_pct || 0.3) }
  const previos = (datos.edp || []).map(e => Number(e.bruto_acumulado))
  const sec = secuenciaEDP([...previos, res.bruto], prm)
  const prox = sec[sec.length - 1]
  const emitir = () => run(() => api.crearEDP({ ot_id: ot.id, numero: (datos.edp || []).length + 1, fecha: hoyISO(), bruto_acumulado: Math.round(res.bruto), periodo: Math.round(prox.periodo), amortizacion: Math.round(prox.amortizacion), retencion: Math.round(prox.retencion), neto: Math.round(prox.neto), estado: 'borrador' }), 'EDP creado en borrador')
  const partidas = PARTIDAS.map(c => ({ c, fila: (datos.partidas || []).find(p => p.codigo === c), av: res.avPartida[c] || 0 })).filter(x => x.fila)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14 }}>
      <Card title="Avance valorizado por partida" right={<span>factor contrato {res.factor.toFixed(4)} · bruto cobrable <b style={{ color: S.text }}>{fmtMM(res.bruto)}</b></span>}>
        {partidas.map(({ c, fila, av }) => (
          <div key={c} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 90px 110px', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #EEF1F4', fontSize: 12 }}>
            <span style={{ fontWeight: 600 }}><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: COLOR_PARTIDA[c], marginRight: 6 }} />{fila.nombre}</span>
            <span style={{ display: 'block', height: 8, background: S.fog2, borderRadius: 4, overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: Math.round(av * 100) + '%', background: COLOR_PARTIDA[c] }} /></span>
            <span style={{ textAlign: 'right', fontFamily: S.fontDisplay, fontWeight: 700 }}>{fmtPct(av)}</span>
            <span style={{ textAlign: 'right', color: S.textSoft }}>{fmtCLP(Number(fila.monto) * av * res.factor)}</span>
          </div>
        ))}
        <Nota style={{ marginTop: 8 }}>Cada partida avanza según el peso EDP (valor) de sus procesos, no según la duración. Montos de partida: edítalos en Configuración.</Nota>
      </Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card title="Próximo EDP (cálculo)" right={<Msg m={msg} />}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 5, fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
            <span>Bruto acumulado</span><b>{fmtCLP(prox.brutoAcumulado)}</b>
            <span>Periodo</span><b>{fmtCLP(prox.periodo)}</b>
            <span>Amortización anticipo ({prm.amortizacion === 'total' ? 'total' : fmtPct(prm.amortizacionPct)})</span><b style={{ color: S.red }}>−{fmtCLP(prox.amortizacion)}</b>
            <span>Retención ({fmtPct(prm.retencionPct)})</span><b style={{ color: S.red }}>−{fmtCLP(prox.retencion)}</b>
            <span style={{ fontWeight: 700 }}>Neto a cobrar</span><b style={{ fontFamily: S.fontDisplay, fontSize: 18, color: S.orangeDark }}>{fmtCLP(prox.neto)}</b>
            <span style={{ color: S.textFaint }}>Anticipo pendiente después</span><span style={{ color: S.textFaint }}>{fmtCLP(prox.anticipoPendiente)}</span>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}><Btn tipo="p" onClick={emitir}>Crear EDP N°{(datos.edp || []).length + 1} en borrador</Btn>{onPDF && <Btn onClick={() => onPDF(null)}>PDF del cálculo</Btn>}</div>
          <Nota style={{ marginTop: 6 }}>El cliente solo ve los EDP presentados, aprobados o pagados.</Nota>
        </Card>
        <Card title="EDP registrados" pad={false}>
          {(datos.edp || []).length === 0 ? <Nota style={{ padding: 12 }}>Todavía no hay EDP.</Nota> : (datos.edp || []).map(e => (
            <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '50px 80px 1fr auto auto auto', gap: 8, alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid #EEF1F4', fontSize: 12 }}>
              <b>N°{e.numero}</b><span style={{ color: S.textSoft }}>{fmtFecha(e.fecha)}</span><span>neto <b>{fmtCLP(e.neto)}</b> · bruto acum. {fmtMM(e.bruto_acumulado)}</span>
              <select value={e.estado} onChange={ev => run(() => api.actualizarEDP(e.id, { estado: ev.target.value }), 'Estado del EDP actualizado')} style={{ ...inp, width: 'auto', padding: '3px 6px' }}>{['borrador', 'presentado', 'aprobado', 'pagado'].map(s => <option key={s}>{s}</option>)}</select>
              <Pill tono={e.estado === 'pagado' ? 'verde' : e.estado === 'borrador' ? 'gris' : 'naranja'}>{e.estado}</Pill>
              {onPDF && <Btn tipo="s" onClick={() => onPDF(e)}>PDF</Btn>}
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}

/* ---------------- 04 · Libro de obra ---------------- */
const TONO_EV = { ini: 'verde', renov: 'naranja', det: 'ambar', com: 'gris', pla: 'azul', tra: 'azul', ava: 'verde' }
export function PanelLibro({ datos, res, recargar, userId }) {
  const [msg, run] = useGuardar(recargar)
  const [f, setF] = useState({ tipo: 'com', fecha: hoyISO(), hasta: '', titulo: '', detalle: '', respaldo: '', interno: false, pedir: false, clase: 'Aprobación de planos', vence: '' })
  const set = k => e => setF(s => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const aprobDe = id => (datos.aprobaciones || []).find(a => a.evento_id === id)
  const hoy = res?.hoy || hoyISO()
  const yaRenov = (datos.libro || []).some(e => e.tipo === 'renov')
  const guardar = () => run(async () => {
    if (!f.titulo.trim()) throw new Error('Escribe un título')
    await api.registrarEvento({ ot_id: datos.ot.id, fecha: f.fecha, hasta: f.tipo === 'det' && f.hasta ? f.hasta : null, tipo: f.tipo, titulo: f.titulo.trim(), detalle: f.detalle || null, respaldo: f.respaldo || null, interno: !!f.interno }, f.pedir && !f.interno ? { clase: f.clase, vence: f.vence || null } : null)
    setF(s => ({ ...s, titulo: '', detalle: '', respaldo: '', pedir: false, vence: '' }))
  }, 'Evento registrado')
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, alignItems: 'start' }}>
      <Card title="Bitácora" right={res.plazo ? <span>inicio vigente <b style={{ color: S.text }}>{fmtFecha(res.plazo.inicio)}</b> · término <b style={{ color: S.text }}>{fmtFecha(res.plazo.termino)}</b>{res.plazo.diasDetencion ? ' · ' + res.plazo.diasDetencion + ' días detenidos' : ''}</span> : null} pad={false}>
        {(datos.libro || []).length === 0 && <Nota style={{ padding: 12 }}>Sin eventos.</Nota>}
        {(datos.libro || []).map(e => {
          const a = aprobDe(e.id)
          const sinEfecto = res.plazo && res.plazo.sinEfecto.some(x => x.fecha === e.fecha && e.tipo === 'renov' && res.plazo.renovacion !== e.fecha)
          const vencida = a && a.estado === 'pend' && a.vence && a.vence < hoy
          return (
            <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '74px 1fr auto', gap: 12, padding: '10px 14px', borderBottom: '1px solid #EEF1F4', fontSize: 12.5, background: e.interno ? '#FBFBFC' : '#fff' }}>
              <div><div style={{ fontFamily: S.fontDisplay, fontWeight: 800, color: S.orangeDark }}>{fmtFecha(e.fecha).slice(0, 5)}</div><div style={{ fontSize: 10.5, color: S.textFaint }}>{String(e.fecha).slice(0, 4)}{e.hasta ? ' → ' + fmtFecha(e.hasta).slice(0, 5) : ''}</div></div>
              <div>
                <div style={{ fontWeight: 600 }}>{e.titulo} {e.interno && <Pill tono="gris">interno</Pill>} {e.origen_ia && <Pill tono="azul">propuesto por IA</Pill>}</div>
                {e.detalle && <div style={{ color: S.textSoft }}>{e.detalle}</div>}
                {e.respaldo && <div style={{ fontSize: 11, color: S.textFaint }}>Respaldo · {e.respaldo}</div>}
                {a && <div style={{ marginTop: 4, fontSize: 11.5 }}>{a.clase} · {a.vence ? 'respuesta hasta ' + fmtFecha(a.vence) : 'sin plazo'} · <Pill tono={a.estado === 'ok' ? 'verde' : a.estado === 'rej' ? 'rojo' : a.estado === 'com' ? 'ambar' : vencida ? 'rojo' : 'naranja'}>{{ pend: vencida ? 'VENCIDA · ' + dias(a.vence, hoy) + ' días de atraso del cliente' : 'Esperando al cliente', ok: 'Aprobado', com: 'Aprobado con comentarios', rej: 'Rechazado', resp: 'Respondido' }[a.estado]}</Pill></div>}
              </div>
              <div style={{ textAlign: 'right' }}><Pill tono={TONO_EV[e.tipo] || 'gris'}>{TIPOS_EVENTO[e.tipo] || e.tipo}</Pill>{sinEfecto && <div><Pill tono="gris">sin efecto</Pill></div>}</div>
            </div>
          )
        })}
      </Card>
      <Card title="Registrar evento" right={<Msg m={msg} />}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Campo label="Tipo" style={{ gridColumn: '1 / -1' }}><select value={f.tipo} onChange={set('tipo')} style={inp}>{Object.entries(TIPOS_EVENTO).filter(([k]) => k !== 'ini').map(([k, t]) => <option key={k} value={k} disabled={k === 'renov' && yaRenov}>{t}{k === 'renov' && yaRenov ? ' · ya registrado' : ''}</option>)}</select></Campo>
          <Campo label="Fecha"><input type="date" value={f.fecha} onChange={set('fecha')} style={inp} /></Campo>
          {f.tipo === 'det' && <Campo label="Hasta (vacío = en curso)"><input type="date" value={f.hasta} onChange={set('hasta')} style={inp} /></Campo>}
          <Campo label="Título" style={{ gridColumn: '1 / -1' }}><input value={f.titulo} onChange={set('titulo')} style={inp} placeholder="Ej.: Planos finales para fabricar recibidos" /></Campo>
          <Campo label="Detalle" style={{ gridColumn: '1 / -1' }}><textarea value={f.detalle} onChange={set('detalle')} rows={2} style={inp} /></Campo>
          <Campo label="Respaldo (correo, transmittal, archivo)" style={{ gridColumn: '1 / -1' }}><input value={f.respaldo} onChange={set('respaldo')} style={inp} /></Campo>
          <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.interno} onChange={set('interno')} /> Solo interno (el cliente no lo ve)</label>
          <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', opacity: f.interno ? .4 : 1 }}><input type="checkbox" disabled={f.interno} checked={f.pedir} onChange={set('pedir')} /> Pedir respuesta al cliente</label>
          {f.pedir && !f.interno && <><Campo label="Clase"><input value={f.clase} onChange={set('clase')} style={inp} /></Campo><Campo label="Responder hasta"><input type="date" value={f.vence} onChange={set('vence')} style={inp} /></Campo></>}
        </div>
        {f.tipo === 'renov' && <Aviso tono="naranja">Este evento renueva el plazo una sola vez: el inicio vigente pasa a esta fecha y el programa se corre los mismos días.</Aviso>}
        {f.tipo === 'det' && <Aviso tono="naranja">Los días de detención se suman al término y no cuentan como plazo consumido.</Aviso>}
        <div style={{ marginTop: 10 }}><Btn tipo="p" onClick={guardar}>Registrar</Btn></div>
      </Card>
    </div>
  )
}

/* ---------------- 05 · Documentos ---------------- */
export function PanelDocumentos({ datos, recargar }) {
  const [msg, run] = useGuardar(recargar)
  const [f, setF] = useState({ paso: 'Ingeniería', titulo: '', carpeta: '', url: '', descripcion: '', interno: false })
  const set = k => e => setF(s => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const pasos = ['Contrato', 'Ingeniería', 'Calidad · dimensional', 'Calidad · pintura', 'Calidad · montaje', 'Calidad · intumescente', 'EDP', 'Comercial (interno)', 'Otro']
  const agregar = () => run(async () => { if (!f.titulo.trim()) throw new Error('Escribe un título'); await api.agregarDocumento({ ot_id: datos.ot.id, paso: f.paso, titulo: f.titulo.trim(), carpeta: f.carpeta || null, url: f.url || null, descripcion: f.descripcion || null, interno: !!f.interno || f.paso.startsWith('Comercial'), orden: (datos.documentos || []).length }); setF(s => ({ ...s, titulo: '', url: '', descripcion: '' })) }, 'Documento agregado')
  const porPaso = useMemo(() => { const m = {}; for (const d of datos.documentos || []) (m[d.paso || 'Otro'] = m[d.paso || 'Otro'] || []).push(d); return m }, [datos.documentos])
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, alignItems: 'start' }}>
      <Card title="Documentos y calidad por paso" right="el enlace abre solo si la carpeta de Drive está compartida con esa persona">
        {Object.keys(porPaso).length === 0 && <Nota>Sin documentos. Agrega enlaces a las carpetas de Drive o a archivos puntuales.</Nota>}
        {Object.entries(porPaso).map(([paso, docs]) => (
          <div key={paso} style={{ marginBottom: 10 }}>
            <Eyebrow style={{ marginBottom: 4 }}>{paso}</Eyebrow>
            {docs.map(d => (
              <div key={d.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #EEF1F4', fontSize: 12.5 }}>
                <span style={{ flex: 1 }}>{d.url ? <a href={d.url} target="_blank" rel="noreferrer" style={{ color: S.orangeDark, fontWeight: 600, textDecoration: 'none' }}>{d.titulo}</a> : <b>{d.titulo}</b>}{d.descripcion && <span style={{ color: S.textSoft }}> · {d.descripcion}</span>}</span>
                {d.interno ? <Pill tono="gris">interno</Pill> : <Pill tono="verde">cliente</Pill>}
                <Btn tipo="s" onClick={() => run(() => api.borrarDocumento(d.id), 'Documento quitado')}>Quitar</Btn>
              </div>
            ))}
          </div>
        ))}
      </Card>
      <Card title="Agregar documento o carpeta" right={<Msg m={msg} />}>
        <div style={{ display: 'grid', gap: 10 }}>
          <Campo label="Paso del proceso"><select value={f.paso} onChange={set('paso')} style={inp}>{pasos.map(p => <option key={p}>{p}</option>)}</select></Campo>
          <Campo label="Título"><input value={f.titulo} onChange={set('titulo')} style={inp} placeholder="Ej.: Planos de taller G2 (carpeta)" /></Campo>
          <Campo label="Enlace (Drive u otro)"><input value={f.url} onChange={set('url')} style={inp} placeholder="https://drive.google.com/…" /></Campo>
          <Campo label="Descripción"><input value={f.descripcion} onChange={set('descripcion')} style={inp} /></Campo>
          <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.interno} onChange={set('interno')} /> Solo interno</label>
          <div><Btn tipo="p" onClick={agregar}>Agregar</Btn></div>
        </div>
      </Card>
    </div>
  )
}

/* ---------------- 06 · Registros ---------------- */
export function PanelRegistros({ datos }) {
  return (
    <Card title="Registros" right="cada parte diario y cada evento dejan su huella aquí" pad={false}>
      {(datos.registros || []).length === 0 && <Nota style={{ padding: 12 }}>Sin registros todavía.</Nota>}
      {(datos.registros || []).map(r => (
        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 10, padding: '7px 14px', borderBottom: '1px solid #EEF1F4', fontSize: 12.5 }}>
          <b>{fmtFecha(r.fecha)}</b><span>{r.titulo}{r.detalle && <span style={{ color: S.textSoft }}> · {r.detalle}</span>}{r.respaldo && <span style={{ color: S.textFaint, fontSize: 11 }}> · {r.respaldo}</span>}</span>
          <span><Pill tono={r.origen === 'parte' ? 'naranja' : 'gris'}>{r.origen}</Pill>{r.interno && <Pill tono="gris" style={{ marginLeft: 4 }}>interno</Pill>}</span>
        </div>
      ))}
    </Card>
  )
}

/* ---------------- 07 · Carga de avance ---------------- */
export function PanelCarga({ datos, res, recargar, userId }) {
  const [msg, run] = useGuardar(recargar)
  const [f, setF] = useState({ proceso_id: '', fecha: hoyISO(), cantidad: '', zona: '', detalle: '', responsable: '', n_parte: '' })
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }))
  const p = datos.procesos.find(x => x.id === f.proceso_id)
  const rp = p && res.procesos.find(x => x.codigo === p.codigo)
  const restante = p ? Math.max(0, Number(p.cantidad_total) * (1 - Number(p.avance))) : 0
  const guardar = () => run(async () => {
    if (!p) throw new Error('Elige el proceso')
    const cantidad = num(f.cantidad)
    if (!(cantidad > 0)) throw new Error('La cantidad debe ser mayor que cero')
    await api.registrarParte({ ot_id: datos.ot.id, proceso_id: p.id, fecha: f.fecha, cantidad, zona: f.zona || null, detalle: f.detalle || null, responsable: f.responsable || null, n_parte: f.n_parte || null, creado_por: userId || null })
    setF(s => ({ ...s, cantidad: '', detalle: '', n_parte: '' }))
  }, 'Parte cargado: el avance del proceso ya se actualizó')
  const formatos = [['F-01', 'Parte diario de taller', 'Corte, armado y soldadura por marca, kg y soldador'], ['F-02', 'Parte diario de pintura', 'Granallado, anticorrosivo, intumescente y terminación: m², espesores, clima'], ['F-03', 'Parte diario de montaje', 'Piezas montadas, aplome, torque y pernos por eje'], ['F-04', 'Recepción de materiales', 'Guía, perfiles, kg, colada y certificado']]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 14, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card title="Ingresar parte" right={<Msg m={msg} />}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Campo label="Proceso" style={{ gridColumn: '1 / -1' }}><select value={f.proceso_id} onChange={set('proceso_id')} style={inp}><option value="">Elegir…</option>{datos.procesos.map(x => <option key={x.id} value={x.id}>{x.codigo} · {x.nombre} ({x.unidad})</option>)}</select></Campo>
            <Campo label="Fecha"><input type="date" value={f.fecha} onChange={set('fecha')} style={inp} /></Campo>
            <Campo label={'Cantidad' + (p ? ' (' + p.unidad + ')' : '')}><input inputMode="decimal" value={f.cantidad} onChange={set('cantidad')} style={inp} placeholder={p ? 'quedan ' + restante.toLocaleString('es-CL', { maximumFractionDigits: 1 }) : ''} /></Campo>
            <Campo label="Zona / eje"><input value={f.zona} onChange={set('zona')} style={inp} /></Campo>
            <Campo label="N° de parte"><input value={f.n_parte} onChange={set('n_parte')} style={inp} placeholder="F-01 n° 118" /></Campo>
            <Campo label="Responsable"><input value={f.responsable} onChange={set('responsable')} style={inp} /></Campo>
            <Campo label="Detalle" style={{ gridColumn: '1 / -1' }}><input value={f.detalle} onChange={set('detalle')} style={inp} placeholder="marcas, soldador, observaciones" /></Campo>
          </div>
          {p && <Nota style={{ marginTop: 8 }}>{p.codigo} va en {fmtPct(p.avance)} de {Number(p.cantidad_total).toLocaleString('es-CL')} {p.unidad}{p.predecesor ? ' · no puede superar a ' + p.predecesor : ''}. La base rechaza el parte si pasa del total o supera al proceso anterior.</Nota>}
          <div style={{ marginTop: 10 }}><Btn tipo="p" onClick={guardar}>Cargar parte</Btn></div>
        </Card>
        <Card title="Formatos físicos">
          {formatos.map(([c, t, d]) => (
            <div key={c} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #EEF1F4', fontSize: 12.5 }}>
              <div style={{ flex: 1 }}><b>{c} · {t}</b><div style={{ color: S.textSoft, fontSize: 11.5 }}>{d}</div></div>
              <a href="/avance/formatos-parte-diario-F01-F04.pdf" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><Pill tono="verde">PDF</Pill></a>
            </div>
          ))}
          <Nota style={{ marginTop: 8 }}>Se llenan y firman en taller u obra y se transcriben aquí con los mismos campos. Más adelante se podrá subir la foto del formato y el sistema propondrá la carga.</Nota>
        </Card>
      </div>
      <Card title={'Partes cargados (' + (datos.partes || []).length + ')'} right={res.ritmo ? <span>ritmo medido <b style={{ color: S.text }}>{res.ritmo.toLocaleString('es-CL', { maximumFractionDigits: 1 })} t/semana</b></span> : 'sin ritmo todavía'} pad={false}>
        {(datos.partes || []).length === 0 && <Nota style={{ padding: 12 }}>Todavía no hay partes. El avance de cada proceso sale solo de lo que cargues aquí.</Nota>}
        {(datos.partes || []).map(pt => { const pr = datos.procesos.find(x => x.id === pt.proceso_id); return (
          <div key={pt.id} style={{ display: 'grid', gridTemplateColumns: '78px 48px 1fr auto', gap: 10, padding: '7px 14px', borderBottom: '1px solid #EEF1F4', fontSize: 12.5, alignItems: 'center' }}>
            <span>{fmtFecha(pt.fecha)}</span><b style={{ color: pr ? colorProceso(pr) : S.text, fontFamily: S.fontDisplay }}>{pr?.codigo}</b>
            <span><b>{Number(pt.cantidad).toLocaleString('es-CL')} {pr?.unidad}</b>{pt.zona && ' · ' + pt.zona}{pt.detalle && <span style={{ color: S.textSoft }}> · {pt.detalle}</span>}</span>
            <span style={{ color: S.textFaint, fontSize: 11 }}>{[pt.responsable, pt.n_parte].filter(Boolean).join(' · ')}</span>
          </div>) })}
      </Card>
    </div>
  )
}

/* ---------------- 02 · Propuestas (fase 2: el sistema lee, tú confirmas) ---------------- */
const TIPO_PROP = { evento: ['Libro de obra', 'naranja'], documento: ['Documento', 'azul'], avance: ['Avance', 'verde'], contrato: ['Contrato', 'ambar'], alerta: ['Alerta', 'rojo'] }
export function PanelPropuestas({ datos, res, recargar, onActualizar, actualizando, ultimoResultado }) {
  const [msg, run] = useGuardar(recargar)
  const [ed, setEd] = useState(null) // { id, datos }
  const [lecturas, setLecturas] = useState([])
  useEffect(() => { api.listarLecturas(datos.ot.id).then(setLecturas).catch(() => {}) }, [datos.ot.id, ultimoResultado])
  const props = datos.propuestas || []
  const confirmar = (pr, d) => run(() => api.aplicarPropuesta(pr.id, d || null), 'Propuesta aplicada')
  const descartar = pr => run(() => api.descartarPropuesta(pr.id), 'Propuesta descartada')
  const confirmarTodas = () => run(async () => { for (const pr of props) await api.aplicarPropuesta(pr.id) }, 'Todas aplicadas')
  const setD = (k, v) => setEd(s => ({ ...s, datos: { ...s.datos, [k]: v } }))
  const campoEd = (k, label, type = 'text') => <Campo key={k} label={label}><input type={type} value={ed.datos[k] ?? ''} onChange={e => setD(k, e.target.value)} style={inp} /></Campo>
  const resumenDatos = pr => {
    const d = pr.datos || {}
    if (pr.tipo === 'evento') return `${TIPOS_EVENTO[d.tipo] || d.tipo} · ${fmtFecha(d.fecha)}${d.hasta ? ' → ' + fmtFecha(d.hasta) : ''}${d.aprobacion ? ' · pide respuesta del cliente' + (d.aprobacion.vence ? ' hasta ' + fmtFecha(d.aprobacion.vence) : '') : ''}${d.interno ? ' · interno' : ''}`
    if (pr.tipo === 'documento') return `${d.paso || 'Otro'}${d.url ? ' · con enlace' : ''}${d.interno ? ' · interno' : ' · visible para el cliente'}`
    if (pr.tipo === 'avance') return `${d.proceso}: ${Number(d.cantidad || 0).toLocaleString('es-CL')} · ${fmtFecha(d.fecha)}${d.zona ? ' · ' + d.zona : ''}`
    if (pr.tipo === 'contrato') return Object.entries(d).filter(([, v]) => v != null && v !== '').map(([k, v]) => k + ' = ' + v).join(' · ')
    if (pr.tipo === 'alerta') return (d.nivel || 'aviso') + (d.cuerpo ? ' · ' + d.cuerpo : '')
    return ''
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14, alignItems: 'start' }}>
      <Card title={<>Propuestas del sistema {props.length > 0 && <span style={{ background: S.orange, color: '#fff', borderRadius: 11, padding: '0 8px', fontSize: 11.5, marginLeft: 6 }}>{props.length}</span>}</>} right={<><span>nada se aplica hasta que lo confirmes</span><Msg m={msg} />{props.length > 1 && <Btn tipo="s" onClick={confirmarTodas}>Confirmar todas</Btn>}</>} pad={false}>
        {props.length === 0 && <Nota style={{ padding: 14 }}>No hay propuestas pendientes. Pulsa «Actualizar proyecto» para que el sistema relea la carpeta de Drive y los correos del cliente.</Nota>}
        {props.map(pr => { const [t, tono] = TIPO_PROP[pr.tipo] || ['', 'gris']; const enEd = ed && ed.id === pr.id; return (
          <div key={pr.id} style={{ padding: '10px 16px', borderBottom: '1px solid #EEF1F4' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr auto', gap: 12, alignItems: 'start' }}>
              <div style={{ fontSize: 11, color: S.textSoft }}><Eyebrow>{pr.origen}</Eyebrow><div style={{ wordBreak: 'break-all' }}>{String(pr.referencia || '').slice(0, 18)}</div><Pill tono={pr.confianza === 'alta' ? 'verde' : pr.confianza === 'baja' ? 'rojo' : 'ambar'} style={{ marginTop: 3 }}>{pr.confianza || 'media'}</Pill></div>
              <div style={{ fontSize: 12.5 }}><Pill tono={tono}>{t}</Pill> <b>{pr.titulo}</b>{pr.detalle && <div style={{ color: S.textSoft, marginTop: 2 }}>{pr.detalle}</div>}<div style={{ color: S.textFaint, fontSize: 11.5, marginTop: 2 }}>{resumenDatos(pr)}</div></div>
              <div style={{ display: 'flex', gap: 6 }}><Btn tipo="ok" style={{ padding: '4px 9px', fontSize: 11 }} onClick={() => confirmar(pr)}>Confirmar</Btn><Btn tipo="s" onClick={() => setEd(enEd ? null : { id: pr.id, datos: { ...(pr.datos || {}) } })}>{enEd ? 'Cerrar' : 'Editar'}</Btn><Btn tipo="no" style={{ padding: '4px 9px', fontSize: 11 }} onClick={() => descartar(pr)}>Descartar</Btn></div>
            </div>
            {enEd && (
              <div style={{ marginTop: 10, background: S.fog, borderRadius: 8, padding: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {pr.tipo === 'evento' && <><Campo label="Tipo"><select value={ed.datos.tipo || 'com'} onChange={e => setD('tipo', e.target.value)} style={inp}>{Object.entries(TIPOS_EVENTO).filter(([k]) => k !== 'ini').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>{campoEd('fecha', 'Fecha', 'date')}{campoEd('hasta', 'Hasta', 'date')}<Campo label="Título" style={{ gridColumn: '1 / -1' }}><input value={ed.datos.titulo ?? pr.titulo} onChange={e => setD('titulo', e.target.value)} style={inp} /></Campo>{campoEd('detalle', 'Detalle')}{campoEd('respaldo', 'Respaldo')}<label style={{ fontSize: 12, alignSelf: 'end' }}><input type="checkbox" checked={!!ed.datos.interno} onChange={e => setD('interno', e.target.checked)} /> Solo interno</label></>}
                {pr.tipo === 'documento' && <>{campoEd('paso', 'Paso')}<Campo label="Título" style={{ gridColumn: '2 / -1' }}><input value={ed.datos.titulo ?? pr.titulo} onChange={e => setD('titulo', e.target.value)} style={inp} /></Campo><Campo label="Enlace" style={{ gridColumn: '1 / 3' }}><input value={ed.datos.url ?? ''} onChange={e => setD('url', e.target.value)} style={inp} /></Campo><label style={{ fontSize: 12, alignSelf: 'end' }}><input type="checkbox" checked={!!ed.datos.interno} onChange={e => setD('interno', e.target.checked)} /> Solo interno</label></>}
                {pr.tipo === 'avance' && <><Campo label="Proceso"><select value={ed.datos.proceso || ''} onChange={e => setD('proceso', e.target.value)} style={inp}>{datos.procesos.map(x => <option key={x.codigo} value={x.codigo}>{x.codigo} · {x.nombre} ({x.unidad})</option>)}</select></Campo>{campoEd('fecha', 'Fecha', 'date')}{campoEd('cantidad', 'Cantidad')}{campoEd('zona', 'Zona')}{campoEd('detalle', 'Detalle')}{campoEd('respaldo', 'Respaldo')}</>}
                {pr.tipo === 'contrato' && ['fecha_inicio_contractual', 'plazo_dias', 'kg_contrato', 'precio_contrato', 'suma_partidas', 'anticipo', 'retencion_pct', 'amortizacion', 'amortizacion_pct', 'multa_dia'].map(k => campoEd(k, k.replace(/_/g, ' ')))}
                {pr.tipo === 'alerta' && <>{campoEd('titulo', 'Título')}{campoEd('cuerpo', 'Cuerpo')}<Campo label="Nivel"><select value={ed.datos.nivel || 'aviso'} onChange={e => setD('nivel', e.target.value)} style={inp}><option value="info">info</option><option value="aviso">aviso</option><option value="critico">crítico</option></select></Campo></>}
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}><Btn tipo="p" onClick={() => { confirmar(pr, ed.datos); setEd(null) }}>Confirmar con estos datos</Btn><Btn onClick={() => setEd(null)}>Cancelar</Btn></div>
              </div>
            )}
          </div>) })}
      </Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card title="Fuentes" right={<Btn tipo="p" disabled={actualizando} onClick={onActualizar}>{actualizando ? 'Leyendo…' : 'Actualizar ahora'}</Btn>}>
          <div style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>Drive: {datos.ot.drive_folder_id ? <b>carpeta configurada</b> : <span style={{ color: S.red }}>sin carpeta</span>} · última lectura {datos.ot.ultima_lectura ? new Date(datos.ot.ultima_lectura).toLocaleString('es-CL') : 'nunca'}</div>
            <div>Remitentes del cliente: {(datos.ot.remitentes_cliente || []).length ? <b>{(datos.ot.remitentes_cliente || []).join(', ')}</b> : <span style={{ color: S.red }}>ninguno</span>}</div>
          </div>
          {ultimoResultado && <div style={{ marginTop: 8 }}><Aviso tono={ultimoResultado.ok ? 'verde' : 'rojo'}>{ultimoResultado.texto}</Aviso></div>}
          <Nota style={{ marginTop: 8 }}>Cada lectura revisa solo lo nuevo desde la última vez (máximo 6 archivos con contenido y 12 correos por vez) y hace UNA consulta a la IA, que queda anotada en el registro de consumo.</Nota>
        </Card>
        <Card title="Últimas lecturas" pad={false}>
          {lecturas.length === 0 && <Nota style={{ padding: 12 }}>Todavía no se ha leído nada.</Nota>}
          {lecturas.map(l => <div key={l.id} style={{ padding: '7px 14px', borderBottom: '1px solid #EEF1F4', fontSize: 12 }}><b>{new Date(l.inicio).toLocaleString('es-CL')}</b> · {l.drive_archivos} archivos · {l.correos} correos · <b>{l.propuestas} propuestas</b>{l.error && <div style={{ color: S.red }}>{l.error}</div>}{!l.fin && !l.error && <span style={{ color: S.textFaint }}> · en curso</span>}</div>)}
        </Card>
      </div>
    </div>
  )
}
