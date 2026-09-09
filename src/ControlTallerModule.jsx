import React, { useState, useMemo } from 'react'
import { Upload, Hammer } from 'lucide-react'
import { supabase } from './supabase.js'
import { pullState, pushState } from './sync.js'
import { fileToBase64 } from './protocolo-pdf.js'
import { normMarcaTaller, estadoDeParte, etapaBucket, ETAPA_BUCKET_LABEL, resumenTableroTaller } from './controlTaller.js'
import { KpiCard } from './ui.jsx'
import { SEREIN } from './theme-serein.js'

const C = { azul: SEREIN.ink, teal: '#0E7A8F', ambar: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, carbon: SEREIN.text, gris: SEREIN.textFaint }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const kg = n => Math.round(n || 0).toLocaleString('es-CL') + ' kg'

// Guardado seguro de p.partes — mismo patrón "pull-fresh + merge + push"
// que actualizarMarcasEsperadas() en OTModule.jsx, aplicado acá sobre
// serein_proyectos para no pisar cambios de otra persona en otro proyecto.
async function actualizarPartesProyecto(proyectosProp, setProyectos, proyectoId, partes) {
  try { await pullState() } catch (e) {}
  let fresco = null
  try { fresco = JSON.parse(localStorage.getItem('serein_proyectos') || 'null') } catch (e) {}
  const base = Array.isArray(fresco) ? fresco : proyectosProp
  const nuevo = base.map(p => p.id === proyectoId ? { ...p, partes } : p)
  try { localStorage.setItem('serein_proyectos', JSON.stringify(nuevo)) } catch (e) {}
  setProyectos(nuevo)
  pushState()
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
