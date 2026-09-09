import React, { useState, useMemo, useRef } from 'react'
import { Upload, Hammer, FileDown, Camera } from 'lucide-react'
import { supabase } from './supabase.js'
import { pullState, pushState } from './sync.js'
import { fileToBase64, generarPdfProtocoloBlob } from './protocolo-pdf.js'
import { normMarcaTaller, estadoDeParte, etapaBucket, ETAPA_BUCKET_LABEL, ETAPAS_TALLER, ETAPA_LABEL, resumenTableroTaller, generarHojaAvanceHtml } from './controlTaller.js'
import { KpiCard } from './ui.jsx'
import { SEREIN } from './theme-serein.js'

const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const kg = n => Math.round(n || 0).toLocaleString('es-CL') + ' kg'
const hoy = () => new Date().toISOString().slice(0, 10)

// Guardado seguro de p.partes (+ opcionalmente una lectura nueva al
// historial) — mismo patrón "pull-fresh + merge + push" que
// actualizarMarcasEsperadas() en OTModule.jsx, aplicado acá sobre
// serein_proyectos para no pisar cambios de otra persona en otro proyecto.
async function actualizarPartesProyecto(proyectosProp, setProyectos, proyectoId, partes, lectura) {
  try { await pullState() } catch (e) {}
  let fresco = null
  try { fresco = JSON.parse(localStorage.getItem('serein_proyectos') || 'null') } catch (e) {}
  const base = Array.isArray(fresco) ? fresco : proyectosProp
  const nuevo = base.map(p => p.id === proyectoId ? { ...p, partes, ...(lectura ? { historialLecturas: [...(p.historialLecturas || []), lectura] } : {}) } : p)
  try { localStorage.setItem('serein_proyectos', JSON.stringify(nuevo)) } catch (e) {}
  setProyectos(nuevo)
  pushState()
}

// Sube la foto de la hoja de avance a Storage (bucket "fotos-ot", el mismo
// que ya usa OTModule.jsx para evidencia — se reutiliza en vez de crear un
// bucket nuevo) y devuelve la URL firmada; si Storage falla por cualquier
// motivo, cae de vuelta al data-URI base64 para no perder la foto.
function subirFotoHojaAvance(file) {
  return new Promise(resolve => {
    const r = new FileReader()
    r.onload = e => {
      const img = new Image()
      img.onload = () => {
        let max = 1400, w = img.width, h = img.height
        if (w > h && w > max) { h = Math.round(h * max / w); w = max } else if (h >= w && h > max) { w = Math.round(w * max / h); h = max }
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h
        cv.getContext('2d').drawImage(img, 0, 0, w, h)
        const respaldo = () => cv.toDataURL('image/jpeg', 0.82)
        if (!cv.toBlob) { resolve(respaldo()); return }
        cv.toBlob(async blob => {
          if (!blob) { resolve(respaldo()); return }
          try {
            const nombre = `hojas-avance/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
            const { error } = await supabase.storage.from('fotos-ot').upload(nombre, blob, { contentType: 'image/jpeg', upsert: false })
            if (error) { resolve(respaldo()); return }
            const { data } = await supabase.storage.from('fotos-ot').createSignedUrl(nombre, 60 * 60 * 24 * 365 * 5)
            resolve(data?.signedUrl || respaldo())
          } catch (e) { resolve(respaldo()) }
        }, 'image/jpeg', 0.82)
      }
      img.src = e.target.result
    }
    r.readAsDataURL(file)
  })
}

// Importador del Listado de Partes — clon del patrón subirOC/revisionOC/
// aplicarRevisionOC de OTModule.jsx: nunca escribe directo, siempre pasa
// por una vista previa con checkbox + valor editable por fila.
function ImportadorListadoPartes({ proyectos, setProyectos, proyecto }) {
  const [abierto, setAbierto] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(null)
  const [msg, setMsg] = useState('')

  const subir = async e => {
    const fls = [...e.target.files]
    e.target.value = ''
    if (!fls.length) return
    setSubiendo(true); setError(''); setRevision(null); setMsg('')
    try {
      const archivos = await Promise.all(fls.map(async fl => ({ base64: await fileToBase64(fl), mimeType: fl.type || 'application/pdf', filename: fl.name })))
      const { data, error: err } = await supabase.functions.invoke('extraer-listado-partes', { body: { archivos, filename: fls[0].name } })
      if (err) throw err
      if (!data || !data.ok) throw new Error((data && data.error) || 'No se pudo leer el documento.')
      const d = data.datos || {}
      const existentes = new Set((proyecto.partes || []).map(p => normMarcaTaller(p.marca)))
      setRevision({
        marcas: (d.marcas || []).map(m => ({
          ...m,
          aplicar: true,
          esNueva: !existentes.has(normMarcaTaller(m.marca)),
        })),
      })
    } catch (err) { setError('No se pudo leer el documento: ' + ((err && err.message) || String(err))) }
    setSubiendo(false)
  }

  const aplicar = async () => {
    if (!revision) return
    const seleccionadas = revision.marcas.filter(m => m.aplicar && m.marca)
    const actuales = [...(proyecto.partes || [])]
    let nuevas = 0, actualizadas = 0
    seleccionadas.forEach(m => {
      const key = normMarcaTaller(m.marca)
      const idx = actuales.findIndex(p => normMarcaTaller(p.marca) === key)
      if (idx >= 0) {
        // Nunca toca el avance ya registrado — solo actualiza los datos
        // del Listado de Partes en sí (perfil/cantidad/material/largo/peso).
        actuales[idx] = { ...actuales[idx], perfil: m.perfil || actuales[idx].perfil, cantidad: m.cantidad ?? actuales[idx].cantidad, material: m.material || actuales[idx].material, largo: m.largo ?? actuales[idx].largo, pesoUnitario: m.pesoUnitario ?? actuales[idx].pesoUnitario }
        actualizadas++
      } else {
        actuales.push({
          id: 'pt' + Date.now() + Math.random().toString(36).slice(2, 7),
          marca: m.marca, perfil: m.perfil || null, cantidad: m.cantidad || 0, material: m.material || null, largo: m.largo || null, pesoUnitario: m.pesoUnitario || null,
          avance: { dimensionado: 0, armado: 0, soldado: 0, liberado: 0 },
        })
        nuevas++
      }
    })
    await actualizarPartesProyecto(proyectos, setProyectos, proyecto.id, actuales)
    setMsg(`Listo — ${nuevas} marca(s) nueva(s), ${actualizadas} actualizada(s). El avance ya registrado no se tocó.`)
    setRevision(null)
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={() => setAbierto(v => !v)} style={{ background: abierto ? '#EEE9DF' : C.teal, color: abierto ? C.carbon : '#fff', border: 'none', borderRadius: 4, padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Upload size={14} /> Importar Listado de Partes
      </button>
      {msg && <div style={{ fontSize: 12.5, color: C.verde, marginTop: 8 }}>{msg}</div>}
      {abierto && (
        <div style={{ marginTop: 10, border: '1px solid #DFE4EA', borderRadius: 6, padding: 12, background: '#FAFAF8' }}>
          <div style={{ fontSize: 12, color: C.gris, marginBottom: 8 }}>
            Sube el PDF del Listado de Partes de {proyecto.nombre || proyecto.ot}. Se agrega cada marca nueva y se actualizan los datos de las que ya existían — el avance de fabricación ya registrado nunca se pisa.
          </div>
          <label style={{ cursor: subiendo ? 'wait' : 'pointer', background: C.carbon, color: '#fff', border: 'none', padding: '7px 14px', fontSize: 12.5, borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: subiendo ? 0.7 : 1 }}>
            {subiendo ? 'Leyendo…' : 'Elegir archivo PDF'}
            <input type="file" accept="application/pdf,image/*" multiple onChange={subir} disabled={subiendo} style={{ display: 'none' }} />
          </label>
          {error && <div style={{ fontSize: 12.5, color: C.rojo, marginTop: 8 }}>{error}</div>}
          {revision && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: C.gris, marginBottom: 6 }}>Vista previa — revisa antes de confirmar ({revision.marcas.length} fila(s) leídas).</div>
              <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.carbon}`, position: 'sticky', top: 0, background: '#FAFAF8' }}>
                      {['', 'Marca', 'Perfil', 'Cant.', 'Material', 'Largo', 'Peso/ud'].map((h, i) => (
                        <th key={i} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 10.5, color: '#9AA3AD', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {revision.marcas.map((m, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #EEE9DF' }}>
                        <td style={{ padding: '4px 8px' }}><input type="checkbox" checked={m.aplicar} onChange={() => setRevision(r => ({ ...r, marcas: r.marcas.map((x, j) => j === i ? { ...x, aplicar: !x.aplicar } : x) }))} /></td>
                        <td style={{ padding: '4px 8px', fontWeight: 600 }}>{m.marca}{m.esNueva ? '' : <span style={{ color: C.gris, fontWeight: 400 }}> (ya existe)</span>}</td>
                        <td style={{ padding: '4px 8px', color: C.gris }}>{m.perfil || '—'}</td>
                        <td style={{ padding: '4px 8px' }}>{m.cantidad ?? '—'}</td>
                        <td style={{ padding: '4px 8px', color: C.gris }}>{m.material || '—'}</td>
                        <td style={{ padding: '4px 8px', color: C.gris }}>{m.largo ?? '—'}</td>
                        <td style={{ padding: '4px 8px', color: C.gris }}>{m.pesoUnitario ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={aplicar} style={{ marginTop: 10, background: C.verde, color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 12.5, cursor: 'pointer' }}>Confirmar importación</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Genera la hoja de avance imprimible y dispara la descarga — reutiliza
// generarPdfProtocoloBlob() de protocolo-pdf.js tal cual (ya sabe cortar en
// varias hojas A4 si la tabla es larga), solo se le pasa un HTML distinto.
function BotonGenerarHoja({ proyecto, partes }) {
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')
  const generar = async () => {
    setGenerando(true); setError('')
    try {
      const html = generarHojaAvanceHtml(proyecto, partes)
      const blob = await generarPdfProtocoloBlob(html)
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl; a.download = `Hoja de avance - ${proyecto.nombre || proyecto.ot}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(objUrl), 15000)
    } catch (err) { setError('No se pudo generar el PDF: ' + ((err && err.message) || String(err))) }
    setGenerando(false)
  }
  return (
    <div style={{ display: 'inline-block' }}>
      <button onClick={generar} disabled={generando || !partes.length} title={!partes.length ? 'Importa primero el Listado de Partes' : ''} style={{ background: generando ? '#9AA3AD' : C.carbon, color: '#fff', border: 'none', borderRadius: 4, padding: '7px 14px', fontSize: 12.5, cursor: (generando || !partes.length) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: !partes.length ? 0.6 : 1 }}>
        <FileDown size={14} /> {generando ? 'Generando…' : 'Generar hoja de avance'}
      </button>
      {error && <div style={{ fontSize: 11.5, color: C.rojo, marginTop: 6 }}>{error}</div>}
    </div>
  )
}

// Lectura del avance por foto de la hoja rayada — clon del patrón
// subirGuia/revisionGuia/aplicarRevisionGuia de OTModule.jsx: cotejo contra
// las partes ya existentes, vista previa con foto de referencia al lado,
// nunca escribe directo. Al aplicar, cada etapa marcada FIJA el conteo
// (es una lectura fresca de la hoja completa, no un incremento) — nunca
// toca una etapa que la hoja dejó en blanco.
function LecturaHojaAvance({ proyectos, setProyectos, proyecto }) {
  const [abierto, setAbierto] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(null)
  const [msg, setMsg] = useState('')
  const fotoRef = useRef(null)

  const subir = async e => {
    const fl = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!fl) return
    setSubiendo(true); setError(''); setRevision(null); setMsg('')
    try {
      const [base64, fotoUrl] = await Promise.all([fileToBase64(fl), subirFotoHojaAvance(fl)])
      const { data, error: err } = await supabase.functions.invoke('extraer-hoja-avance', { body: { archivos: [{ base64, mimeType: fl.type || 'image/jpeg', filename: fl.name }], filename: fl.name } })
      if (err) throw err
      if (!data || !data.ok) throw new Error((data && data.error) || 'No se pudo leer la foto.')
      const d = data.datos || {}
      const partes = proyecto.partes || []
      const filas = (d.filas || []).map(f => {
        const parte = partes.find(p => normMarcaTaller(p.marca) === normMarcaTaller(f.marca))
        const cambios = {}
        ETAPAS_TALLER.forEach(et => {
          const leido = f[et]
          if (leido == null) return
          const actual = parte ? (Number(parte.avance?.[et]) || 0) : 0
          cambios[et] = { valor: leido, aplicar: true, baja: leido < actual, actual }
        })
        return { marca: f.marca, parte, cambios }
      }).filter(f => f.parte)
      setRevision({ fotoUrl, filas })
    } catch (err) { setError('No se pudo leer la foto: ' + ((err && err.message) || String(err))) }
    setSubiendo(false)
  }

  const toggleCelda = (i, etapa) => setRevision(r => ({
    ...r,
    filas: r.filas.map((f, j) => j !== i ? f : { ...f, cambios: { ...f.cambios, [etapa]: { ...f.cambios[etapa], aplicar: !f.cambios[etapa].aplicar } } }),
  }))

  const aplicar = async () => {
    if (!revision) return
    const partes = [...(proyecto.partes || [])]
    const filasLectura = []
    revision.filas.forEach(f => {
      const idx = partes.findIndex(p => p.id === f.parte.id)
      if (idx < 0) return
      const avanceNuevo = { ...partes[idx].avance }
      Object.entries(f.cambios).forEach(([etapa, c]) => {
        if (!c.aplicar) return
        avanceNuevo[etapa] = c.valor
        filasLectura.push({ marca: f.marca, etapa, cantidad: c.valor })
      })
      partes[idx] = { ...partes[idx], avance: avanceNuevo }
    })
    const lectura = { id: 'la' + Date.now() + Math.random().toString(36).slice(2, 7), fecha: hoy(), fotoUrl: revision.fotoUrl, filas: filasLectura, confirmadoPor: '' }
    try {
      const { data } = await supabase.auth.getUser()
      lectura.confirmadoPor = (data && data.user && data.user.email) || ''
    } catch (e) {}
    await actualizarPartesProyecto(proyectos, setProyectos, proyecto.id, partes, lectura)
    setMsg(`Listo — se actualizó el avance de ${new Set(filasLectura.map(f => f.marca)).size} marca(s).`)
    setRevision(null)
  }

  return (
    <div style={{ display: 'inline-block', marginLeft: 8 }}>
      <label style={{ cursor: subiendo ? 'wait' : 'pointer', background: subiendo ? '#9AA3AD' : C.teal, color: '#fff', border: 'none', borderRadius: 4, padding: '7px 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: subiendo ? 0.7 : 1 }}>
        <Camera size={14} /> {subiendo ? 'Leyendo…' : 'Subir hoja de avance'}
        <input ref={fotoRef} type="file" accept="image/*" onChange={subir} disabled={subiendo} style={{ display: 'none' }} />
      </label>
      {msg && <div style={{ fontSize: 12.5, color: C.verde, marginTop: 8 }}>{msg}</div>}
      {error && <div style={{ fontSize: 11.5, color: C.rojo, marginTop: 6 }}>{error}</div>}
      {revision && (
        <div style={{ marginTop: 10, border: '1px solid #DFE4EA', borderRadius: 6, padding: 12, background: '#FAFAF8', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <img src={revision.fotoUrl} alt="Hoja de avance" style={{ width: 220, borderRadius: 4, border: '1px solid #DFE4EA', objectFit: 'contain' }} />
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 11, color: C.gris, marginBottom: 6 }}>Vista previa — revisa antes de confirmar. Las filas marcadas en ámbar bajarían un conteo ya cargado (posible error de lectura).</div>
            {revision.filas.length === 0 ? (
              <div style={{ fontSize: 12.5, color: C.rojo }}>No se encontró ninguna marca de la foto entre las partes ya cargadas de este proyecto.</div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                      {['Marca', ...ETAPAS_TALLER.map(e => ETAPA_LABEL[e])].map((h, i) => (
                        <th key={i} style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10.5, color: '#9AA3AD', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {revision.filas.map((f, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #EEE9DF' }}>
                        <td style={{ padding: '4px 8px', fontWeight: 600 }}>{f.marca}</td>
                        {ETAPAS_TALLER.map(et => {
                          const c = f.cambios[et]
                          if (!c) return <td key={et} style={{ padding: '4px 8px', color: '#C9C4B8' }}>—</td>
                          return (
                            <td key={et} style={{ padding: '4px 8px', background: c.baja ? '#FDECDD' : 'transparent' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <input type="checkbox" checked={c.aplicar} onChange={() => toggleCelda(i, et)} />
                                {c.valor}{c.baja ? <span title={`Ya tenía ${c.actual} registrado`} style={{ color: C.ambar, fontWeight: 700 }}> ⚠</span> : null}
                              </label>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {revision.filas.length > 0 && <button onClick={aplicar} style={{ marginTop: 10, background: C.verde, color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 12.5, cursor: 'pointer' }}>Confirmar avance</button>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ControlTallerModule({ proyectos = [], setProyectos = () => {} }) {
  const [proyectoId, setProyectoId] = useState('')
  const [buscar, setBuscar] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState('')

  const proyecto = proyectos.find(p => p.id === proyectoId) || null
  const partes = (proyecto && proyecto.partes) || []
  const resumen = useMemo(() => resumenTableroTaller(partes), [partes])

  const q = buscar.trim().toLowerCase()
  const partesFiltradas = partes.filter(p => {
    if (filtroEtapa && etapaBucket(p) !== filtroEtapa) return false
    if (q && !String(p.marca || '').toLowerCase().includes(q) && !String(p.perfil || '').toLowerCase().includes(q)) return false
    return true
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}><Hammer size={16} /> Control de Taller</div>
        <select value={proyectoId} onChange={e => setProyectoId(e.target.value)} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '7px 10px', fontSize: 13, minWidth: 260 }}>
          <option value="">Elegir proyecto…</option>
          {proyectos.filter(p => !p.eliminado).map(p => <option key={p.id} value={p.id}>{p.nombre || p.ot} · {p.ot}</option>)}
        </select>
      </div>

      {!proyecto && <div style={{ color: '#9AA3AD', fontSize: 13, marginBottom: 20 }}>Elige un proyecto para ver el avance de fabricación de sus marcas.</div>}

      {proyecto && (
        <>
          <ImportadorListadoPartes proyectos={proyectos} setProyectos={setProyectos} proyecto={proyecto} />
          <div style={{ marginBottom: 16 }}>
            <BotonGenerarHoja proyecto={proyecto} partes={partes} />
            <LecturaHojaAvance proyectos={proyectos} setProyectos={setProyectos} proyecto={proyecto} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
            <KpiCard value={resumen.piezasTotales} label="Piezas totales" />
            <KpiCard value={resumen.piezasLiberadas} label="Piezas liberadas" iconColor={C.verde} />
            <KpiCard value={kg(resumen.kgTotales)} label="Kg totales" />
            <KpiCard value={kg(resumen.kgLiberados)} label="Kg liberados" iconColor={C.verde} />
            <KpiCard value={resumen.piezasTotales > 0 ? Math.round((resumen.piezasLiberadas / resumen.piezasTotales) * 100) + '%' : '0%'} label="% liberado" iconColor={C.verde} />
          </div>

          {partes.length === 0 ? (
            <div style={{ color: '#9AA3AD', fontSize: 13 }}>Este proyecto todavía no tiene un Listado de Partes importado.</div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.gris, textTransform: 'uppercase' }}>Partes ({partesFiltradas.length})</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por marca o perfil…" style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '5px 8px', fontSize: 12, minWidth: 200 }} />
                  <select value={filtroEtapa} onChange={e => setFiltroEtapa(e.target.value)} style={{ border: '1px solid #DFE4EA', borderRadius: 4, padding: '5px 8px', fontSize: 12 }}>
                    <option value="">Todas las etapas</option>
                    {Object.entries(ETAPA_BUCKET_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                      {['Marca', 'Perfil', 'Cant.', 'Material', 'Peso/ud', 'Estado'].map((h, i) => (
                        <th key={i} style={{ textAlign: 'left', padding: '5px 6px', fontSize: 10.5, color: '#9AA3AD', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {partesFiltradas.map(p => {
                      const est = estadoDeParte(p)
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid #EEE9DF' }}>
                          <td style={{ padding: '5px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>{p.marca}</td>
                          <td style={{ padding: '5px 6px', color: '#9AA3AD' }}>{p.perfil || '—'}</td>
                          <td style={{ padding: '5px 6px' }}>{p.cantidad ?? '—'}</td>
                          <td style={{ padding: '5px 6px', color: '#9AA3AD' }}>{p.material || '—'}</td>
                          <td style={{ padding: '5px 6px', color: '#9AA3AD' }}>{p.pesoUnitario ?? '—'}</td>
                          <td style={{ padding: '5px 6px' }}><span style={{ background: est.color, color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{est.label}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
