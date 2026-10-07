import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Search, ArrowLeft, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { supabase } from './supabase.js'
import { SEREIN } from './theme-serein.js'
import { evaluarCredito, condicionesOC, mezclarParams, PARAMS_CREDITO_DEFAULT, diasEntre } from './creditoCalculo.js'

// ============================================================
// MÓDULO DE CRÉDITO — factibilidad de crédito a 30 días y condiciones
// recomendables por cliente (spec Modulo_Credito_serein-app.pdf).
// Datos en tablas reales con RLS (credito_*), solo Gerencia/Admin.
// Etapa 1: clientes, evaluación con datos a mano, resultado, aprobación,
// simulador de OC y parámetros editables.
// ============================================================
const C = { naranja: SEREIN.orange, verde: SEREIN.green, rojo: SEREIN.red, carbon: SEREIN.text, gris: SEREIN.textFaint, azul: SEREIN.blue, teal: '#0E7A8F', ambar: '#C9860B' }
const CAT_COLOR = { A: C.verde, B: C.teal, C: C.ambar, D: C.rojo }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const hoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
const addMeses = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
const num = v => { const n = parseFloat(String(v).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0 }
const inp = { padding: '7px 9px', border: '1px solid #DFE4EA', fontSize: 13, boxSizing: 'border-box', width: '100%', background: '#fff' }
const card = { background: '#fff', border: '1px solid #DFE4EA', borderRadius: 8, padding: 16, marginBottom: 14 }
const btn = (color, outline) => ({ background: outline ? '#fff' : color, color: outline ? color : '#fff', border: '1px solid ' + color, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 })
const titulo = { fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }
const esErrorTablas = e => !!e && (e.code === '42P01' || /does not exist|relation|schema cache/i.test(e.message || ''))

function Campo({ label, children, span }) {
  return <label style={{ fontSize: 11.5, color: C.gris, display: 'block', gridColumn: span ? 'span ' + span : undefined }}>{label}<div style={{ marginTop: 3 }}>{children}</div></label>
}
function Chk({ label, value, onChange }) {
  return <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} /> {label}</label>
}
const ChipCat = ({ cat, grande }) => cat ? <span style={{ background: CAT_COLOR[cat] + '22', color: CAT_COLOR[cat], fontWeight: 800, fontSize: grande ? 22 : 12, padding: grande ? '4px 16px' : '2px 9px', borderRadius: 6, fontFamily: SEREIN.fontDisplay }}>{grande ? 'Categoría ' + cat : cat}</span> : <span style={{ color: C.gris, fontSize: 12 }}>Sin evaluar</span>

// ---------- Resultado de una evaluación ----------
function Resultado({ res }) {
  return (
    <div style={{ ...card, borderLeft: '4px solid ' + CAT_COLOR[res.categoria] }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <ChipCat cat={res.categoria} grande />
        <div><div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Puntaje</div><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 24 }}>{res.puntaje}<span style={{ fontSize: 13, color: C.gris }}> / 100</span></div></div>
        <div><div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Línea sugerida</div><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 24 }}>{clp(res.lineaSugerida)}</div></div>
        <div><div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Anticipo mínimo</div><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 24 }}>{Math.round(res.anticipoMinimo * 100)}%</div></div>
      </div>
      <div style={{ padding: '10px 12px', background: CAT_COLOR[res.categoria] + '14', color: C.carbon, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
        {res.califica30 ? '✓ ' : ''}{res.condicionTexto}
        <div style={{ fontSize: 12, fontWeight: 400, color: C.gris, marginTop: 3 }}>Garantía: {res.garantia} · Próxima revisión en {res.revisionMeses} meses.</div>
      </div>
      <div style={{ ...titulo, fontSize: 12, marginBottom: 6 }}>Filtros de rechazo</div>
      <div style={{ marginBottom: 10 }}>
        {res.filtros.map(f => (
          <div key={f.id} style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center', color: f.activo ? C.rojo : C.carbon, fontWeight: f.activo ? 700 : 400, padding: '2px 0' }}>
            {f.activo ? <XCircle size={14} /> : <CheckCircle2 size={14} color={C.verde} />} {f.texto} <span style={{ marginLeft: 'auto', fontSize: 11 }}>{f.activo ? 'SÍ' : 'no'}</span>
          </div>
        ))}
      </div>
      <div style={{ ...titulo, fontSize: 12, marginBottom: 6 }}>Detalle del puntaje</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr style={{ borderBottom: '2px solid ' + C.carbon }}>{['Factor', 'Dato observado', 'Puntos', 'Máx.'].map((h, i) => <th key={h} style={{ textAlign: i > 1 ? 'right' : 'left', padding: '4px 6px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
        <tbody>
          {res.detalle.map(x => <tr key={x.factor} style={{ borderBottom: '1px solid #EEF1F4' }}><td style={{ padding: '4px 6px' }}>{x.factor}</td><td style={{ padding: '4px 6px', color: C.gris }}>{x.dato}</td><td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>{x.puntos}</td><td style={{ padding: '4px 6px', textAlign: 'right', color: C.gris }}>{x.max}</td></tr>)}
          <tr><td colSpan={2} style={{ padding: '5px 6px', fontWeight: 700 }}>Total</td><td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700 }}>{res.puntaje}</td><td style={{ padding: '5px 6px', textAlign: 'right', color: C.gris }}>100</td></tr>
        </tbody>
      </table>
      {res.notas && res.notas.length > 0 && <div style={{ fontSize: 12, color: C.ambar, marginTop: 8 }}>{res.notas.map((n, i) => <div key={i}><AlertTriangle size={12} style={{ verticalAlign: -2 }} /> {n}</div>)}</div>}
    </div>
  )
}

// ---------- Formulario de evaluación (datos a mano) ----------
const DATOS_VACIOS = { registros: 'limpio', chequesProtestados: false, observacionesTributarias: false, referenciaMala: false, antecedentesCompletos: true, fechaCarpeta: '', mesesIvaAlDia: 12, ventas12m: '', ventasPrevias12m: '', resultadoUltimoAnio: 'utilidad', antiguedadCtaCteAnios: 2, referenciasBuenas: 0, bienesRaices: false, contribucionesVencidas: false, diasFacturaVencida: 0, lineaSolicitada: '' }

function FormEvaluacion({ cliente, ultima, params, esGerencia, onCerrar, onGuardada }) {
  const [d, setD] = useState({ ...DATOS_VACIOS, ...(ultima || {}), fechaCarpeta: '', trabajosPagados: cliente.trabajos_pagados || 0, fechaInicioActividades: cliente.fecha_inicio_actividades || '' })
  const [obs, setObs] = useState('')
  const [guardada, setGuardada] = useState(null) // { id, res }
  const [linea, setLinea] = useState('')
  const [err, setErr] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const set = (k, v) => setD(s => ({ ...s, [k]: v }))
  const res = useMemo(() => evaluarCredito({ ...d, ventas12m: num(d.ventas12m), ventasPrevias12m: num(d.ventasPrevias12m) }, params), [d, params])
  const diasCarpeta = d.fechaCarpeta ? diasEntre(d.fechaCarpeta, hoy()) : null

  const guardar = async () => {
    setTrabajando(true); setErr('')
    const { data, error } = await supabase.from('credito_evaluaciones').insert({
      cliente_id: cliente.id, datos_confirmados: d, resultado: { filtros: res.filtros, detalle: res.detalle, notas: res.notas, resumen: res.resumen, condicionTexto: res.condicionTexto, califica30: res.califica30, revisionMeses: res.revisionMeses },
      puntaje: res.puntaje, categoria: res.categoria, linea_sugerida: res.lineaSugerida, anticipo_minimo: res.anticipoMinimo, garantia: res.garantia, estado: 'evaluada', observaciones: obs,
    }).select('id').single()
    setTrabajando(false)
    if (error) { setErr('No se pudo guardar: ' + error.message); return }
    setGuardada({ id: data.id, res }); setLinea(String(res.lineaSugerida))
  }
  const decidir = async aprobar => {
    const g = guardada
    const lineaAprob = aprobar ? Math.min(num(linea), params.tope_cliente) : 0
    if (aprobar && lineaAprob <= 0) { setErr('Indica una línea aprobada mayor a $0.'); return }
    setTrabajando(true); setErr('')
    const { data: u } = await supabase.auth.getUser()
    const e1 = await supabase.from('credito_evaluaciones').update({ estado: aprobar ? 'aprobada' : 'rechazada', linea_aprobada: lineaAprob, aprobada_por: u && u.user ? u.user.id : null }).eq('id', g.id)
    const e2 = await supabase.from('credito_clientes').update({ categoria: g.res.categoria, linea_aprobada: lineaAprob, estado_credito: aprobar ? 'activa' : 'bloqueada', fecha_revision: addMeses(hoy(), g.res.revisionMeses), fecha_inicio_actividades: d.fechaInicioActividades || null }).eq('id', cliente.id)
    setTrabajando(false)
    if (e1.error || e2.error) { setErr('No se pudo registrar la decisión: ' + ((e1.error || e2.error).message)); return }
    onGuardada()
  }
  const sinTrabajos = res.filtros.find(f => f.id === 'sin_trabajos').activo

  return (
    <div>
      <div style={card}>
        <div style={titulo}>Datos de la evaluación · {cliente.razon_social}</div>
        <div style={{ fontSize: 12, color: C.gris, marginBottom: 12 }}>Completa lo que sale de la carpeta tributaria, el informe DICOM y el certificado bancario. El resultado se calcula en vivo abajo.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          <Campo label="Registros comerciales (DICOM)"><select style={inp} value={d.registros} onChange={e => set('registros', e.target.value)}><option value="limpio">Limpio</option><option value="aclaradas">Deudas antiguas aclaradas</option><option value="vigentes">Morosidades / protestos vigentes</option></select></Campo>
          <Campo label="Fecha de emisión de la carpeta tributaria"><input type="date" style={inp} value={d.fechaCarpeta} onChange={e => set('fechaCarpeta', e.target.value)} />{diasCarpeta != null && <span style={{ fontSize: 11, color: diasCarpeta > params.carpeta_max_dias ? C.rojo : C.gris }}>{diasCarpeta} días{diasCarpeta > params.carpeta_max_dias ? ' — vencida (máx. ' + params.carpeta_max_dias + ')' : ''}</span>}</Campo>
          <Campo label="Inicio de actividades"><input type="date" style={inp} value={d.fechaInicioActividades} onChange={e => set('fechaInicioActividades', e.target.value)} /></Campo>
          <Campo label="Meses de IVA declarado a tiempo (de 12)"><input type="number" min="0" max="12" style={inp} value={d.mesesIvaAlDia} onChange={e => set('mesesIvaAlDia', e.target.value)} /></Campo>
          <Campo label="Ventas netas últimos 12 meses (CLP)"><input style={inp} value={d.ventas12m} onChange={e => set('ventas12m', e.target.value)} placeholder="Débitos F29 ÷ 0,19" /></Campo>
          <Campo label="Ventas netas 12 meses anteriores (CLP)"><input style={inp} value={d.ventasPrevias12m} onChange={e => set('ventasPrevias12m', e.target.value)} placeholder="Para medir la tendencia" /></Campo>
          <Campo label="Resultado tributario último año (F22)"><select style={inp} value={d.resultadoUltimoAnio} onChange={e => set('resultadoUltimoAnio', e.target.value)}><option value="utilidad">Utilidad</option><option value="perdida">Pérdida</option></select></Campo>
          <Campo label="Antigüedad cuenta corriente (años)"><input type="number" min="0" step="0.5" style={inp} value={d.antiguedadCtaCteAnios} onChange={e => set('antiguedadCtaCteAnios', e.target.value)} /></Campo>
          <Campo label="Referencias comerciales buenas"><input type="number" min="0" style={inp} value={d.referenciasBuenas} onChange={e => set('referenciasBuenas', e.target.value)} /></Campo>
          <Campo label="Trabajos ya pagados con Serein"><input type="number" min="0" style={inp} value={d.trabajosPagados} onChange={e => set('trabajosPagados', e.target.value)} /></Campo>
          <Campo label="Máx. días de factura vencida con Serein"><input type="number" min="0" style={inp} value={d.diasFacturaVencida} onChange={e => set('diasFacturaVencida', e.target.value)} /></Campo>
          <Campo label="Línea solicitada por el cliente (opcional)"><input style={inp} value={d.lineaSolicitada} onChange={e => set('lineaSolicitada', e.target.value)} /></Campo>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8, marginTop: 14 }}>
          <Chk label="Observaciones tributarias vigentes en la carpeta" value={d.observacionesTributarias} onChange={v => set('observacionesTributarias', v)} />
          <Chk label="Cheques protestados en el certificado bancario" value={d.chequesProtestados} onChange={v => set('chequesProtestados', v)} />
          <Chk label="Una referencia informa no pago o pago muy tardío" value={d.referenciaMala} onChange={v => set('referenciaMala', v)} />
          <Chk label="Tiene bienes raíces" value={d.bienesRaices} onChange={v => set('bienesRaices', v)} />
          {d.bienesRaices && <Chk label="…con contribuciones vencidas" value={d.contribucionesVencidas} onChange={v => set('contribucionesVencidas', v)} />}
          <Chk label="Antecedentes completos (carpeta, DICOM, certificado bancario, solicitud firmada)" value={d.antecedentesCompletos} onChange={v => set('antecedentesCompletos', v)} />
        </div>
        <div style={{ marginTop: 12 }}><Campo label="Observaciones de quien evalúa"><textarea style={{ ...inp, minHeight: 56, resize: 'vertical' }} value={obs} onChange={e => setObs(e.target.value)} /></Campo></div>
      </div>

      <Resultado res={guardada ? guardada.res : res} />

      {err && <div style={{ color: C.rojo, fontSize: 13, marginBottom: 8 }}>{err}</div>}
      {!guardada ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={guardar} disabled={trabajando} style={btn(C.verde)}>{trabajando ? 'Guardando…' : 'Guardar evaluación'}</button>
          <button onClick={onCerrar} style={btn(C.gris, true)}>Cancelar</button>
        </div>
      ) : (
        <div style={card}>
          <div style={titulo}>Decisión de Gerencia</div>
          {esGerencia ? (<>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Campo label={'Línea aprobada (tope ' + clp(params.tope_cliente) + ')'}><input style={{ ...inp, width: 200 }} value={linea} onChange={e => setLinea(e.target.value)} /></Campo>
              <button onClick={() => decidir(true)} disabled={trabajando || guardada.res.categoria === 'D' || sinTrabajos} style={{ ...btn(C.verde), opacity: (guardada.res.categoria === 'D' || sinTrabajos) ? 0.4 : 1 }}>Aprobar línea</button>
              <button onClick={() => decidir(false)} disabled={trabajando} style={btn(C.rojo)}>{guardada.res.categoria === 'D' ? 'Dejar sin crédito' : 'Rechazar'}</button>
              <button onClick={onGuardada} style={btn(C.gris, true)}>Decidir después</button>
            </div>
            {sinTrabajos && <div style={{ fontSize: 12, color: C.rojo, marginTop: 8 }}>El crédito aplica desde el segundo trabajo: un cliente sin trabajos pagados no puede quedar aprobado.</div>}
            {guardada.res.categoria === 'D' && !sinTrabajos && <div style={{ fontSize: 12, color: C.gris, marginTop: 8 }}>Categoría D: no hay línea que aprobar; se registra sin crédito (anticipo 50% y saldo contra entrega).</div>}
          </>) : (
            <div style={{ fontSize: 13, color: C.gris }}>Evaluación guardada. La aprobación de la línea la hace Gerencia. <button onClick={onGuardada} style={{ ...btn(C.gris, true), marginLeft: 8 }}>Volver</button></div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Ficha del cliente ----------
const CAMPOS_FICHA = [['razon_social', 'Razón social'], ['rut', 'RUT'], ['giro', 'Giro'], ['direccion', 'Dirección'], ['representante_legal', 'Representante legal'], ['contacto_compras', 'Contacto de compras'], ['contacto_pagos', 'Contacto de pagos'], ['email_facturas', 'Correo para facturas'], ['portal_proveedores', 'Portal de proveedores']]

function FichaCliente({ cliente, params, esGerencia, onVolver, onCambio }) {
  const [f, setF] = useState(cliente)
  const [evals, setEvals] = useState([])
  const [evaluando, setEvaluando] = useState(false)
  const [msg, setMsg] = useState('')
  const [abierta, setAbierta] = useState(null)
  const cargarEvals = async () => {
    const { data } = await supabase.from('credito_evaluaciones').select('*').eq('cliente_id', cliente.id).order('created_at', { ascending: false })
    setEvals(data || [])
  }
  useEffect(() => { setF(cliente); cargarEvals() }, [cliente.id])
  const guardar = async () => {
    setMsg('')
    const { error } = await supabase.from('credito_clientes').update({
      razon_social: f.razon_social, rut: f.rut, giro: f.giro, direccion: f.direccion, representante_legal: f.representante_legal, contacto_compras: f.contacto_compras, contacto_pagos: f.contacto_pagos,
      email_facturas: f.email_facturas, portal_proveedores: f.portal_proveedores, fecha_inicio_actividades: f.fecha_inicio_actividades || null, trabajos_pagados: parseInt(f.trabajos_pagados, 10) || 0, deuda_vigente: num(f.deuda_vigente),
      ...(esGerencia ? { estado_credito: f.estado_credito } : {}),
    }).eq('id', cliente.id)
    if (error) { setMsg('No se pudo guardar: ' + error.message); return }
    setMsg('Guardado'); onCambio()
  }
  const ultimaDatos = evals[0] && evals[0].datos_confirmados
  if (evaluando) return <div><button onClick={() => setEvaluando(false)} style={{ ...btn(C.gris, true), marginBottom: 12 }}><ArrowLeft size={13} style={{ verticalAlign: -2 }} /> Volver a la ficha</button>
    <FormEvaluacion cliente={f} ultima={ultimaDatos} params={params} esGerencia={esGerencia} onCerrar={() => setEvaluando(false)} onGuardada={() => { setEvaluando(false); cargarEvals(); onCambio() }} /></div>
  const cupo = Math.max(num(cliente.linea_aprobada) - num(cliente.deuda_vigente), 0)
  const revVencida = cliente.fecha_revision && cliente.fecha_revision < hoy()
  return (
    <div>
      <button onClick={onVolver} style={{ ...btn(C.gris, true), marginBottom: 12 }}><ArrowLeft size={13} style={{ verticalAlign: -2 }} /> Clientes</button>
      <div style={{ ...card, display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
        <div><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 18 }}>{cliente.razon_social}</div><div style={{ fontSize: 12, color: C.gris }}>{cliente.rut}</div></div>
        <ChipCat cat={cliente.categoria} grande />
        <div><div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Línea aprobada</div><b>{clp(cliente.linea_aprobada)}</b></div>
        <div><div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Deuda vigente</div><b>{clp(cliente.deuda_vigente)}</b></div>
        <div><div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Cupo disponible</div><b style={{ color: cupo > 0 ? C.verde : C.rojo }}>{clp(cupo)}</b></div>
        <div><div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Próxima revisión</div><b style={{ color: revVencida ? C.rojo : C.carbon }}>{cliente.fecha_revision || '—'}{revVencida ? ' (vencida)' : ''}</b></div>
        <button onClick={() => setEvaluando(true)} style={{ ...btn(C.naranja), marginLeft: 'auto' }}>Nueva evaluación</button>
      </div>

      <div style={card}>
        <div style={titulo}>Datos de la empresa</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {CAMPOS_FICHA.map(([k, l]) => <Campo key={k} label={l}><input style={inp} value={f[k] || ''} onChange={e => setF({ ...f, [k]: e.target.value })} /></Campo>)}
          <Campo label="Inicio de actividades"><input type="date" style={inp} value={f.fecha_inicio_actividades || ''} onChange={e => setF({ ...f, fecha_inicio_actividades: e.target.value })} /></Campo>
          <Campo label="Trabajos pagados con Serein"><input type="number" min="0" style={inp} value={f.trabajos_pagados ?? 0} onChange={e => setF({ ...f, trabajos_pagados: e.target.value })} /></Campo>
          <Campo label="Deuda vigente con Serein (CLP)"><input style={inp} value={f.deuda_vigente ?? 0} onChange={e => setF({ ...f, deuda_vigente: e.target.value })} /></Campo>
          {esGerencia && <Campo label="Estado del crédito"><select style={inp} value={f.estado_credito} onChange={e => setF({ ...f, estado_credito: e.target.value })}><option value="sin_evaluar">Sin evaluar</option><option value="activa">Activa</option><option value="bloqueada">Bloqueada</option></select></Campo>}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}><button onClick={guardar} style={btn(C.verde)}>Guardar datos</button>{msg && <span style={{ fontSize: 12.5, color: msg === 'Guardado' ? C.verde : C.rojo }}>{msg}</span>}</div>
      </div>

      <div style={card}>
        <div style={titulo}>Historial de evaluaciones ({evals.length})</div>
        {evals.length === 0 && <div style={{ fontSize: 13, color: C.gris }}>Sin evaluaciones todavía. Usa "Nueva evaluación".</div>}
        {evals.map(e => (
          <div key={e.id} style={{ borderBottom: '1px solid #EEF1F4', padding: '8px 0' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <span style={{ minWidth: 90 }}>{e.fecha}</span><ChipCat cat={e.categoria} /><span>Puntaje <b>{e.puntaje}</b></span><span>Sugerida {clp(e.linea_sugerida)}</span><span>Aprobada <b>{clp(e.linea_aprobada)}</b></span>
              <span style={{ color: e.estado === 'aprobada' ? C.verde : e.estado === 'rechazada' ? C.rojo : C.gris, fontWeight: 600, textTransform: 'capitalize' }}>{e.estado}</span>
              {e.resultado && <button onClick={() => setAbierta(abierta === e.id ? null : e.id)} style={{ ...btn(C.azul, true), padding: '3px 10px', fontSize: 12, marginLeft: 'auto' }}>{abierta === e.id ? 'Ocultar' : 'Ver detalle'}</button>}
            </div>
            {abierta === e.id && e.resultado && <div style={{ marginTop: 8 }}><Resultado res={{ ...e.resultado, categoria: e.categoria, puntaje: e.puntaje, lineaSugerida: e.linea_sugerida, anticipoMinimo: e.anticipo_minimo, garantia: e.garantia }} />{e.observaciones && <div style={{ fontSize: 12.5, color: C.gris }}>Observaciones: {e.observaciones}</div>}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Simulador de OC ----------
function Simulador({ clientes, params }) {
  const [clienteId, setClienteId] = useState('')
  const [s, setS] = useState({ montoNeto: '', categoria: 'B', lineaAprobada: '', deudaVigente: '' })
  const elegir = id => {
    setClienteId(id)
    const c = clientes.find(x => x.id === id)
    if (c) setS(v => ({ ...v, categoria: c.categoria || 'D', lineaAprobada: String(c.linea_aprobada || 0), deudaVigente: String(c.deuda_vigente || 0) }))
  }
  const r = num(s.montoNeto) > 0 ? condicionesOC({ montoNeto: num(s.montoNeto), categoria: s.categoria, lineaAprobada: num(s.lineaAprobada), deudaVigente: num(s.deudaVigente) }, params) : null
  const estados = []
  if (r && r.nEstadosPago > 0) { let resto = r.aCredito; while (resto > 0) { const m = Math.min(r.cupo, resto); estados.push(m); resto -= m } }
  return (
    <div style={card}>
      <div style={titulo}>Simulador de orden de compra</div>
      <div style={{ fontSize: 12, color: C.gris, marginBottom: 12 }}>Ingresa el monto de la OC del cliente y te dice cuánto va de anticipo, cuánto a crédito a {params.plazo_credito_dias} días y si hay que partirla en estados de pago.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Campo label="Cliente (precarga categoría, línea y deuda)"><select style={inp} value={clienteId} onChange={e => elegir(e.target.value)}><option value="">— manual —</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}</select></Campo>
        <Campo label="Monto neto de la OC (CLP)"><input style={inp} value={s.montoNeto} onChange={e => setS({ ...s, montoNeto: e.target.value })} /></Campo>
        <Campo label="Categoría"><select style={inp} value={s.categoria} onChange={e => setS({ ...s, categoria: e.target.value })}>{['A', 'B', 'C', 'D'].map(k => <option key={k}>{k}</option>)}</select></Campo>
        <Campo label="Línea aprobada (CLP)"><input style={inp} value={s.lineaAprobada} onChange={e => setS({ ...s, lineaAprobada: e.target.value })} /></Campo>
        <Campo label="Deuda vigente (CLP)"><input style={inp} value={s.deudaVigente} onChange={e => setS({ ...s, deudaVigente: e.target.value })} /></Campo>
      </div>
      {r && (
        <div style={{ marginTop: 16, borderTop: '1px solid #EEF1F4', paddingTop: 14 }}>
          <div style={{ padding: '10px 12px', background: CAT_COLOR[s.categoria] + '14', fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{r.texto}</div>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            {[['Total con IVA', clp(r.total)], ['Tipo de OC', r.esGrande ? 'Grande' : 'Normal'], ['Cupo disponible', clp(r.cupo)], ['Anticipo (' + r.pctAnticipo + '%)', clp(r.anticipo)], ['A crédito a ' + r.plazo + ' días (' + r.pctCredito + '%)', clp(r.aCredito)], ...(r.saldoContraEntrega > 0 ? [['Saldo contra entrega', clp(r.saldoContraEntrega)]] : [])].map(([l, v]) => (
              <div key={l}><div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{l}</div><div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 18 }}>{v}</div></div>
            ))}
          </div>
          {estados.length > 1 && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <b>Estados de pago sugeridos ({estados.length}):</b>
              {estados.map((m, i) => <div key={i} style={{ padding: '2px 0' }}>Estado {i + 1}: {clp(m)} a {r.plazo} días</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Parámetros ----------
function Parametros({ params, onGuardar, esGerencia }) {
  const [p, setP] = useState(params)
  const [msg, setMsg] = useState('')
  useEffect(() => setP(params), [params])
  const setCat = (k, campo, v) => setP(s => ({ ...s, categorias: { ...s.categorias, [k]: { ...s.categorias[k], [campo]: v } } }))
  const guardar = async () => {
    const limpio = mezclarParams({
      ...p, tope_cliente: num(p.tope_cliente), oc_grande_desde: num(p.oc_grande_desde), anticipo_oc_grande: num(p.anticipo_oc_grande), iva: num(p.iva), plazo_credito_dias: num(p.plazo_credito_dias), carpeta_max_dias: num(p.carpeta_max_dias), factura_vencida_max_dias: num(p.factura_vencida_max_dias),
      categorias: Object.fromEntries(Object.entries(p.categorias).map(([k, c]) => [k, { ...c, puntaje_minimo: num(c.puntaje_minimo), pct_ventas: num(c.pct_ventas), anticipo_minimo: num(c.anticipo_minimo), meses_revision: num(c.meses_revision) }])),
    })
    const { error } = await supabase.from('credito_parametros').upsert({ id: 1, valores: limpio, updated_at: new Date().toISOString() })
    if (error) { setMsg('No se pudo guardar: ' + error.message); return }
    setMsg('Guardado'); onGuardar(limpio)
  }
  const pct = v => Math.round(num(v) * 1000) / 10
  const campoPct = (k, v, fn) => <input type="number" step="0.5" style={{ ...inp, width: 80 }} disabled={!esGerencia} value={pct(v)} onChange={e => fn(num(e.target.value) / 100)} />
  return (
    <div style={card}>
      <div style={titulo}>Parámetros de crédito</div>
      <div style={{ fontSize: 12, color: C.gris, marginBottom: 12 }}>Valores iniciales de la especificación; Gerencia los ajusta según la experiencia y el flujo de caja. No cambian evaluaciones ya guardadas.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 14 }}>
        <Campo label="Tope de línea por cliente (CLP)"><input style={inp} disabled={!esGerencia} value={p.tope_cliente} onChange={e => setP({ ...p, tope_cliente: e.target.value })} /></Campo>
        <Campo label="OC grande desde (total con IVA, CLP)"><input style={inp} disabled={!esGerencia} value={p.oc_grande_desde} onChange={e => setP({ ...p, oc_grande_desde: e.target.value })} /></Campo>
        <Campo label="Anticipo en OC grande (%)">{campoPct('a', p.anticipo_oc_grande, v => setP({ ...p, anticipo_oc_grande: v }))}</Campo>
        <Campo label="IVA (%)">{campoPct('i', p.iva, v => setP({ ...p, iva: v }))}</Campo>
        <Campo label="Plazo de crédito (días)"><input type="number" style={inp} disabled={!esGerencia} value={p.plazo_credito_dias} onChange={e => setP({ ...p, plazo_credito_dias: e.target.value })} /></Campo>
        <Campo label="Vigencia máx. carpeta tributaria (días)"><input type="number" style={inp} disabled={!esGerencia} value={p.carpeta_max_dias} onChange={e => setP({ ...p, carpeta_max_dias: e.target.value })} /></Campo>
        <Campo label="Días de factura vencida que rechazan"><input type="number" style={inp} disabled={!esGerencia} value={p.factura_vencida_max_dias} onChange={e => setP({ ...p, factura_vencida_max_dias: e.target.value })} /></Campo>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ borderBottom: '2px solid ' + C.carbon }}>{['Categoría', 'Puntaje mínimo', 'Línea (% ventas mensuales)', 'Anticipo mínimo (%)', 'Revisión (meses)', 'Garantía'].map(h => <th key={h} style={{ textAlign: 'left', padding: '5px 6px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
        <tbody>
          {Object.keys(p.categorias).map(k => { const c = p.categorias[k]; return (
            <tr key={k} style={{ borderBottom: '1px solid #EEF1F4' }}>
              <td style={{ padding: 6 }}><ChipCat cat={k} /></td>
              <td style={{ padding: 6 }}><input type="number" style={{ ...inp, width: 80 }} disabled={!esGerencia || k === 'D'} value={c.puntaje_minimo} onChange={e => setCat(k, 'puntaje_minimo', e.target.value)} /></td>
              <td style={{ padding: 6 }}>{campoPct(k, c.pct_ventas, v => setCat(k, 'pct_ventas', v))}</td>
              <td style={{ padding: 6 }}>{campoPct(k, c.anticipo_minimo, v => setCat(k, 'anticipo_minimo', v))}</td>
              <td style={{ padding: 6 }}><input type="number" style={{ ...inp, width: 80 }} disabled={!esGerencia} value={c.meses_revision} onChange={e => setCat(k, 'meses_revision', e.target.value)} /></td>
              <td style={{ padding: 6 }}><input style={inp} disabled={!esGerencia} value={c.garantia} onChange={e => setCat(k, 'garantia', e.target.value)} /></td>
            </tr>) })}
        </tbody>
      </table>
      {esGerencia && <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
        <button onClick={guardar} style={btn(C.verde)}>Guardar parámetros</button>
        <button onClick={() => { setP(mezclarParams(PARAMS_CREDITO_DEFAULT)); setMsg('') }} style={btn(C.gris, true)}>Volver a los valores iniciales</button>
        {msg && <span style={{ fontSize: 12.5, color: msg === 'Guardado' ? C.verde : C.rojo }}>{msg}</span>}
      </div>}
    </div>
  )
}

// ---------- Módulo ----------
export default function CreditoModule({ esGerencia }) {
  const [vista, setVista] = useState('clientes')
  const [clientes, setClientes] = useState([])
  const [params, setParams] = useState(mezclarParams(null))
  const [cargando, setCargando] = useState(true)
  const [sinTablas, setSinTablas] = useState(false)
  const [error, setError] = useState('')
  const [selId, setSelId] = useState(null)
  const [busca, setBusca] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [nuevo, setNuevo] = useState(null)

  const cargar = async () => {
    const { data, error: e } = await supabase.from('credito_clientes').select('*').order('razon_social')
    if (e) { if (esErrorTablas(e)) setSinTablas(true); else setError(e.message); setCargando(false); return }
    setClientes(data || [])
    const { data: pr } = await supabase.from('credito_parametros').select('valores').eq('id', 1).maybeSingle()
    if (pr && pr.valores) setParams(mezclarParams(pr.valores))
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const crear = async () => {
    if (!nuevo.razon_social.trim() || !nuevo.rut.trim()) { setError('Faltan la razón social y el RUT.'); return }
    const { data, error: e } = await supabase.from('credito_clientes').insert({ razon_social: nuevo.razon_social.trim(), rut: nuevo.rut.trim(), giro: nuevo.giro }).select('*').single()
    if (e) { setError(e.code === '23505' ? 'Ya existe un cliente con ese RUT.' : 'No se pudo crear: ' + e.message); return }
    setError(''); setNuevo(null); await cargar(); setSelId(data.id)
  }

  if (cargando) return <div style={{ padding: 20, color: C.gris }}>Cargando…</div>
  if (sinTablas) return <div style={{ ...card, marginTop: 16 }}><div style={titulo}>Falta activar el módulo</div><div style={{ fontSize: 13 }}>Las tablas del módulo de crédito todavía no existen en la base. Hay que correr la migración <code>2026-10-07-modulo-credito.sql</code> en el SQL Editor de Supabase.</div></div>

  const sel = clientes.find(c => c.id === selId)
  const lista = clientes.filter(c => (!busca || (c.razon_social + ' ' + c.rut).toLowerCase().includes(busca.toLowerCase())) && (!filtroEstado || c.estado_credito === filtroEstado))
  const tabBtn = (id, lbl) => <button key={id} onClick={() => { setVista(id); setSelId(null) }} style={{ background: vista === id ? C.carbon : '#fff', color: vista === id ? '#fff' : C.carbon, border: '1px solid #DFE4EA', padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{lbl}</button>

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>{tabBtn('clientes', 'Clientes (' + clientes.length + ')')}{tabBtn('simulador', 'Simulador de OC')}{tabBtn('parametros', 'Parámetros')}</div>
      {error && <div style={{ color: C.rojo, fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {vista === 'simulador' && <Simulador clientes={clientes} params={params} />}
      {vista === 'parametros' && <Parametros params={params} esGerencia={esGerencia} onGuardar={setParams} />}
      {vista === 'clientes' && sel && <FichaCliente cliente={sel} params={params} esGerencia={esGerencia} onVolver={() => setSelId(null)} onCambio={cargar} />}
      {vista === 'clientes' && !sel && (
        <div style={card}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #DFE4EA', padding: '4px 8px' }}><Search size={14} color={C.gris} /><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar razón social o RUT…" style={{ border: 'none', outline: 'none', fontSize: 13, width: 220 }} /></div>
            <select style={{ ...inp, width: 160 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}><option value="">Todos los estados</option><option value="sin_evaluar">Sin evaluar</option><option value="activa">Activa</option><option value="bloqueada">Bloqueada</option></select>
            <button onClick={() => setNuevo({ razon_social: '', rut: '', giro: '' })} style={{ ...btn(C.naranja), marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={14} /> Nuevo cliente</button>
          </div>
          {nuevo && (
            <div style={{ background: '#F2F4F7', padding: 12, marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Campo label="Razón social *"><input style={{ ...inp, width: 240 }} value={nuevo.razon_social} onChange={e => setNuevo({ ...nuevo, razon_social: e.target.value })} /></Campo>
              <Campo label="RUT *"><input style={{ ...inp, width: 130 }} value={nuevo.rut} onChange={e => setNuevo({ ...nuevo, rut: e.target.value })} /></Campo>
              <Campo label="Giro"><input style={{ ...inp, width: 200 }} value={nuevo.giro} onChange={e => setNuevo({ ...nuevo, giro: e.target.value })} /></Campo>
              <button onClick={crear} style={btn(C.verde)}>Crear</button><button onClick={() => setNuevo(null)} style={btn(C.gris, true)}>Cancelar</button>
            </div>
          )}
          {lista.length === 0 ? <div style={{ fontSize: 13, color: C.gris }}>{clientes.length === 0 ? 'Aún no hay clientes. Crea el primero con "Nuevo cliente".' : 'Ningún cliente coincide.'}</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ borderBottom: '2px solid ' + C.carbon }}>{['Cliente', 'RUT', 'Categoría', 'Línea aprobada', 'Deuda vigente', 'Estado', 'Próxima revisión'].map((h, i) => <th key={h} style={{ textAlign: [3, 4].includes(i) ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {lista.map(c => { const vencida = c.fecha_revision && c.fecha_revision < hoy(); return (
                    <tr key={c.id} onClick={() => setSelId(c.id)} style={{ borderBottom: '1px solid #EEF1F4', cursor: 'pointer' }}>
                      <td style={{ padding: '8px', fontWeight: 600 }}>{c.razon_social}</td>
                      <td style={{ padding: '8px', color: C.gris }}>{c.rut}</td>
                      <td style={{ padding: '8px' }}><ChipCat cat={c.categoria} /></td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{clp(c.linea_aprobada)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{clp(c.deuda_vigente)}</td>
                      <td style={{ padding: '8px', textTransform: 'capitalize', color: c.estado_credito === 'activa' ? C.verde : c.estado_credito === 'bloqueada' ? C.rojo : C.gris, fontWeight: 600 }}>{c.estado_credito.replace('_', ' ')}</td>
                      <td style={{ padding: '8px', color: vencida ? C.rojo : C.carbon }}>{c.fecha_revision || '—'}{vencida ? ' ⚠' : ''}</td>
                    </tr>) })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
