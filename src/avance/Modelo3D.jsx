// Módulo Avance de Obra · modelo 3D (fases 4 y 6).
// Dos fuentes para la misma pantalla:
//  · IFC real (Tekla/Revit) subido a la OT: se lee en el navegador con web-ifc
//    (src/avance/ifc.js) y cada pieza se dibuja con su geometría verdadera.
//  · Modelo generado: mientras no hay IFC, la estructura se arma desde una
//    geometría simple por OT (ejes, filas, alturas, entrepiso, ala).
// En ambos casos el color de cada pieza es el del proceso que «la alcanzó»:
// el avance de cada proceso se reparte a lo largo del eje más largo de la obra
// (frente de trabajo de izquierda a derecha), como el prototipo de Gerencia.
// Three.js y web-ifc se descargan solo al abrir esta pestaña.
import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { S, Card, Btn, Nota, Aviso, COLOR_PARTIDA } from './ui.jsx'
import { fmtPct, fmtFecha } from './calc.js'
import * as api from './api.js'

export const GEOMETRIA_DEFECTO = { ejes: 12, sepEjes: 6, filas: [0, 6, 12, 18], altura: 9, entrepiso: 0, ala: 0, alaFilas: 6, prefijoEjes: 'A', nombreFilas: ['1', '2', '3', '4'] }
const COLOR_PROC = { ING: '#9AA3AD', PER: '#B7791F', SUM: '#8FA3B8', COR: '#5A636E', ARM: '#D9600A', SOL: '#F77716', PIN: COLOR_PARTIDA.pin, MON: COLOR_PARTIDA.mon, INT: COLOR_PARTIDA.int, TER: COLOR_PARTIDA.ter }
const PENDIENTE = '#E2E7EC'
const letra = (i, prefijo) => { const base = (prefijo || 'A').charCodeAt(0) - 65; let n = base + i, s = ''; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0); return s }
const CADENA = { pedestal: ['PER'], montaje: ['SUM', 'COR', 'ARM', 'SOL', 'PIN', 'MON', 'INT', 'TER'], fab: ['SUM', 'COR', 'ARM', 'SOL', 'PIN'] }
const cadenaDe = tipo => tipo === 'pedestal' ? 'pedestal' : tipo === 'placa' || tipo === 'costanera' ? 'fab' : 'montaje'

// Qué proceso «alcanzó» un elemento según su posición relativa (0..1) a lo largo del frente:
// el último proceso de la cadena cuyo avance cubre esa posición es el que colorea.
function procesoDe(frac, procesos, tipo) {
  let ultimo = null
  for (const c of CADENA[cadenaDe(tipo)]) { const p = procesos.find(x => x.codigo === c); if (p && Number(p.avance) >= frac + 1e-6) ultimo = c; else break }
  return ultimo
}
const materialDe = (proc) => {
  const col = new THREE.Color(proc ? COLOR_PROC[proc] : PENDIENTE)
  return { col, mat: new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: proc ? .95 : .55, metalness: .15, roughness: .6, side: THREE.DoubleSide }) }
}

export default function Modelo3D({ datos, res, geometria, onGuardarGeometria, onCambio, puedeEditar = true }) {
  const caja = useRef(null)
  const [hover, setHover] = useState(null)
  const [filtro, setFiltro] = useState(null)
  const [g, setG] = useState(() => ({ ...GEOMETRIA_DEFECTO, ...(geometria || {}) }))
  const [editando, setEditando] = useState(false)
  const procesos = datos.procesos || []
  const filtroRef = useRef(null); filtroRef.current = filtro
  const ot = datos.ot || {}
  const hayIFC = !!ot.ifc_path
  const [fuente, setFuente] = useState(hayIFC ? 'ifc' : 'generado')
  const [ifc, setIfc] = useState(null)        // { piezas, caja, eje }
  const [estadoIFC, setEstadoIFC] = useState('') // '' | 'cargando' | 'leyendo N' | 'error: …'
  const [subiendo, setSubiendo] = useState(false)
  const [msg, setMsg] = useState('')
  const archivoRef = useRef(null)
  useEffect(() => { if (hayIFC && !ifc) setFuente('ifc'); if (!hayIFC) { setFuente('generado'); setIfc(null) } }, [hayIFC]) // eslint-disable-line react-hooks/exhaustive-deps

  // Descarga y lectura del IFC (una vez por ruta).
  useEffect(() => {
    if (!hayIFC || fuente !== 'ifc' || ifc) return
    let vivo = true
    ;(async () => {
      try {
        setEstadoIFC('cargando')
        const buf = await api.descargarIFC(ot.ifc_path)
        const { leerIFC } = await import('./ifc.js')
        const r = await leerIFC(buf, n => vivo && setEstadoIFC('leyendo ' + n + ' piezas…'))
        if (!vivo) return
        setIfc(r); setEstadoIFC('')
      } catch (e) { if (vivo) setEstadoIFC('error: ' + api.errorLegible(e)) }
    })()
    return () => { vivo = false }
  }, [hayIFC, fuente, ot.ifc_path]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = caja.current; if (!el) return
    const usarIFC = fuente === 'ifc' && ifc
    if (fuente === 'ifc' && !ifc) return
    const W = el.clientWidth, H = el.clientHeight || 520
    const ren = new THREE.WebGLRenderer({ antialias: true, alpha: true }); ren.setPixelRatio(Math.min(2, devicePixelRatio)); ren.setSize(W, H); el.appendChild(ren.domElement)
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0xF2F4F7)
    const cam = new THREE.PerspectiveCamera(38, W / H, .5, 3000)
    sc.add(new THREE.AmbientLight(0xffffff, .75)); const dl = new THREE.DirectionalLight(0xffffff, .9); dl.position.set(60, 120, 40); sc.add(dl)
    const items = []
    let centro, radio
    if (usarIFC) {
      const { piezas, caja: bb } = ifc
      for (const p of piezas) {
        const proc = procesoDe(p.frac, procesos, p.tipo)
        const { col, mat } = materialDe(proc)
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(p.posiciones, 3))
        geo.setAttribute('normal', new THREE.BufferAttribute(p.normales, 3))
        geo.setIndex(new THREE.BufferAttribute(p.indices, 1))
        const m = new THREE.Mesh(geo, mat)
        m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: proc ? col.clone().lerp(new THREE.Color(0x000000), .35) : 0xC9D1DA, transparent: true, opacity: .7 })))
        m.userData = { tipo: p.tipo, nombre: p.nombre, clase: p.clase, proc }
        sc.add(m); items.push(m)
      }
      centro = new THREE.Vector3((bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2)
      radio = Math.max(5, Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]) / 2)
      const piso = new THREE.GridHelper(radio * 4, 40, 0xDFE4EA, 0xE9EDF1); piso.position.set(centro.x, bb.min[1], centro.z); sc.add(piso)
    } else {
      const largo = (g.ejes - 1) * g.sepEjes, ancho = g.filas[g.filas.length - 1] || 1
      sc.add(new THREE.GridHelper(Math.max(largo, ancho) * 2 + 60, 40, 0xDFE4EA, 0xE9EDF1))
      const mem = (a, b, s, tipo, nombre, frac) => {
        const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length()
        const proc = procesoDe(frac, procesos, tipo)
        const { col, mat } = materialDe(proc)
        const m = new THREE.Mesh(new THREE.BoxGeometry(s, len, s), mat)
        m.position.copy(A.clone().add(B).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
        m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: proc ? col.clone().lerp(new THREE.Color(0x000000), .35) : 0xC9D1DA, transparent: true, opacity: .8 })))
        m.userData = { tipo, nombre, proc }
        sc.add(m); items.push(m)
      }
      const nf = g.filas.length
      for (let i = 0; i < g.ejes; i++) {
        const x = i * g.sepEjes, e = letra(i, g.prefijoEjes), frac = g.ejes > 1 ? i / (g.ejes - 1) : 0
        g.filas.forEach((z, j) => {
          const f = (g.nombreFilas || [])[j] || String(j + 1)
          mem([x, 0, z], [x, .5, z], .9, 'pedestal', `Pedestal ${e}/${f}`, frac)
          mem([x, .5, z], [x, g.altura, z], .45, 'pilar', `Pilar ${e}/${f}`, frac)
          if (j < nf - 1) mem([x, g.altura, z], [x, g.altura, g.filas[j + 1]], .4, 'viga', `Viga de techo eje ${e} ${f}→${(g.nombreFilas || [])[j + 1] || j + 2}`, frac)
          if (g.entrepiso > 0 && j < nf - 1) mem([x, g.entrepiso, z], [x, g.entrepiso, g.filas[j + 1]], .35, 'viga', `Viga entrepiso eje ${e}`, frac)
        })
        if (i < g.ejes - 1) {
          const frac2 = g.ejes > 1 ? (i + .5) / (g.ejes - 1) : 0
          ;[g.filas[0], g.filas[nf - 1]].forEach(z => mem([x, g.altura, z], [x + g.sepEjes, g.altura, z], .3, 'viga', `Viga de borde ${e}–${letra(i + 1, g.prefijoEjes)}`, frac2))
          if (g.entrepiso > 0) g.filas.forEach(z => mem([x, g.entrepiso, z], [x + g.sepEjes, g.entrepiso, z], .3, 'viga', `Viga entrepiso ${e}–${letra(i + 1, g.prefijoEjes)}`, frac2))
          for (let k = 1; k <= 3; k++) { const z = g.filas[0] + (ancho * k) / 4; mem([x, g.altura + .3, z], [x + g.sepEjes, g.altura + .3, z], .15, 'costanera', `Costanera ${e}–${letra(i + 1, g.prefijoEjes)}`, frac2) }
        }
      }
      if (g.ala > 0) {
        const x0 = largo + g.sepEjes * 1.5
        for (let i = 0; i < g.ala; i++) { const x = x0 + i * g.sepEjes; for (let k = 0; k < g.alaFilas; k++) { const z = k * g.sepEjes; mem([x, 0, z], [x, .5, z], .9, 'pedestal', `Pedestal ala ${i + 1}/${k + 1}`, 1); mem([x, .5, z], [x, g.altura * .7, z], .4, 'pilar', `Pilar ala ${i + 1}/${k + 1}`, 1); if (k < g.alaFilas - 1) mem([x, g.altura * .7, z], [x, g.altura * .7, z + g.sepEjes], .3, 'viga', `Viga ala ${i + 1}`, 1) } }
      }
      centro = new THREE.Vector3(largo / 2, 3, ancho / 2)
      radio = Math.max(20, Math.hypot(largo, ancho) / 2)
    }
    cam.position.set(centro.x - radio * 1.1, centro.y + radio * .9, centro.z + radio * 1.4); cam.lookAt(centro)
    const ctl = new OrbitControls(cam, ren.domElement); ctl.target.copy(centro); ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI / 2.05; ctl.autoRotate = true; ctl.autoRotateSpeed = .5
    ren.domElement.addEventListener('pointerdown', () => { ctl.autoRotate = false })
    const ray = new THREE.Raycaster(), mp = new THREE.Vector2()
    const onMove = e => { const r = ren.domElement.getBoundingClientRect(); mp.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(mp, cam); const hit = ray.intersectObjects(items, false)[0]; setHover(hit ? { ...hit.object.userData, x: e.clientX - r.left, y: e.clientY - r.top } : null) }
    ren.domElement.addEventListener('pointermove', onMove); ren.domElement.addEventListener('pointerleave', () => setHover(null))
    let raf = 0
    const loop = () => { const f = filtroRef.current; items.forEach(m => { const on = !f || m.userData.proc === f; m.material.opacity = on ? (m.userData.proc ? .95 : .55) : .06 }); ctl.update(); ren.render(sc, cam); raf = requestAnimationFrame(loop) }
    loop()
    const ro = new ResizeObserver(() => { const w = el.clientWidth, h = el.clientHeight; ren.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix() }); ro.observe(el)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); ctl.dispose(); items.forEach(m => { m.geometry.dispose(); m.material.dispose() }); ren.dispose(); try { el.removeChild(ren.domElement) } catch (e) {} }
  }, [g, procesos, fuente, ifc]) // eslint-disable-line react-hooks/exhaustive-deps

  const subir = async (archivo) => {
    if (!archivo) return
    if (!/\.ifc$/i.test(archivo.name)) { setMsg('ERROR: el archivo debe ser .ifc (exportado desde Tekla o Revit).'); return }
    setSubiendo(true); setMsg('')
    try { await api.subirIFC(ot.id, archivo); setIfc(null); setFuente('ifc'); setMsg('IFC subido: ' + archivo.name + '. Leyéndolo…'); onCambio && onCambio() } catch (e) { setMsg('ERROR: ' + api.errorLegible(e)) } finally { setSubiendo(false) }
  }
  const quitar = async () => {
    if (!window.confirm('¿Quitar el IFC de esta OT? Volverá el modelo generado.')) return
    try { await api.quitarIFC(ot.id, ot.ifc_path); setIfc(null); setFuente('generado'); setMsg('IFC quitado.'); onCambio && onCambio() } catch (e) { setMsg('ERROR: ' + api.errorLegible(e)) }
  }
  const setN = (k, v) => setG(s => ({ ...s, [k]: v }))
  const procesosConColor = procesos.filter(p => COLOR_PROC[p.codigo])
  const conteo = ifc ? ifc.piezas.length : null
  const titulo = fuente === 'ifc' ? 'Modelo IFC' : 'Modelo preliminar'
  const subtitulo = fuente === 'ifc' ? (ot.ifc_nombre || 'modelo.ifc') + (conteo != null ? ' · ' + conteo.toLocaleString('es-CL') + ' piezas' : '') + (ot.ifc_subido_en ? ' · subido el ' + fmtFecha(String(ot.ifc_subido_en).slice(0, 10)) : '') : 'generado desde ejes y niveles'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {msg && <Aviso tono={msg.startsWith('ERROR') ? 'rojo' : 'verde'}>{msg}</Aviso>}
      <Card title={titulo} right={<>
        <span>{subtitulo} · color = proceso que alcanzó la pieza</span>
        {hayIFC && <div style={{ display: 'inline-flex', border: '1px solid ' + S.line, borderRadius: 6, overflow: 'hidden' }}>{[['ifc', 'IFC'], ['generado', 'Generado']].map(([v, t]) => <button key={v} onClick={() => setFuente(v)} style={{ border: 0, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: fuente === v ? S.ink : '#fff', color: fuente === v ? '#fff' : S.textSoft }}>{t}</button>)}</div>}
        {puedeEditar && <>
          <input ref={archivoRef} type="file" accept=".ifc" style={{ display: 'none' }} onChange={e => { subir(e.target.files && e.target.files[0]); e.target.value = '' }} />
          <Btn tipo="s" disabled={subiendo} onClick={() => archivoRef.current && archivoRef.current.click()}>{subiendo ? 'Subiendo…' : hayIFC ? 'Reemplazar IFC' : 'Subir IFC'}</Btn>
          {hayIFC && <Btn tipo="s" onClick={quitar}>Quitar IFC</Btn>}
          {fuente === 'generado' && <Btn tipo="s" onClick={() => setEditando(v => !v)}>{editando ? 'Cerrar geometría' : 'Geometría'}</Btn>}
        </>}
      </>} pad={false}>
        {editando && fuente === 'generado' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, padding: '12px 16px', borderBottom: '1px solid ' + S.line, fontSize: 12 }}>
            {[['ejes', 'N° de ejes', 2, 40], ['sepEjes', 'Separación ejes (m)', 2, 20], ['altura', 'Altura pilares (m)', 3, 30], ['entrepiso', 'Entrepiso (m, 0 = no)', 0, 20], ['ala', 'Ejes del ala lateral (0 = no)', 0, 12], ['alaFilas', 'Filas del ala', 2, 20]].map(([k, l, mn, mx]) => (
              <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: 10.5, color: S.textFaint, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{l}</span><input type="number" min={mn} max={mx} value={g[k]} onChange={e => setN(k, Math.max(mn, Math.min(mx, Number(e.target.value) || 0)))} style={{ border: '1px solid ' + S.line, borderRadius: 6, padding: '5px 8px' }} /></label>
            ))}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, gridColumn: 'span 2' }}><span style={{ fontSize: 10.5, color: S.textFaint, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Filas (distancias en m, separadas por coma)</span><input value={g.filas.join(', ')} onChange={e => { const f = e.target.value.split(',').map(x => Number(x.trim())).filter(x => Number.isFinite(x)); if (f.length >= 2) setN('filas', f) }} style={{ border: '1px solid ' + S.line, borderRadius: 6, padding: '5px 8px' }} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: 10.5, color: S.textFaint, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Primer eje</span><input value={g.prefijoEjes} maxLength={1} onChange={e => setN('prefijoEjes', (e.target.value || 'A').toUpperCase().slice(0, 1))} style={{ border: '1px solid ' + S.line, borderRadius: 6, padding: '5px 8px' }} /></label>
            <div style={{ alignSelf: 'end' }}><Btn tipo="p" onClick={() => onGuardarGeometria && onGuardarGeometria(g)}>Guardar geometría</Btn></div>
          </div>
        )}
        <div style={{ position: 'relative' }}>
          <div ref={caja} style={{ height: 520, width: '100%' }} />
          {fuente === 'ifc' && !ifc && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F2F4F7', color: estadoIFC.startsWith('error') ? S.red : S.textSoft, fontSize: 13, padding: 20, textAlign: 'center' }}>{estadoIFC.startsWith('error') ? 'No se pudo leer el IFC. ' + estadoIFC.slice(7) : estadoIFC === 'cargando' ? 'Descargando el modelo IFC…' : estadoIFC || 'Preparando…'}</div>
          )}
          {hover && <div style={{ position: 'absolute', left: hover.x + 14, top: hover.y + 14, background: S.ink, color: '#fff', fontSize: 11.5, padding: '6px 9px', borderRadius: 6, pointerEvents: 'none', whiteSpace: 'nowrap' }}><b>{hover.nombre}</b> · {hover.clase || hover.tipo}<br />{hover.proc ? <span style={{ color: COLOR_PROC[hover.proc] }}>{hover.proc} · {(procesos.find(p => p.codigo === hover.proc) || {}).nombre}</span> : <span style={{ color: '#B9C0C8' }}>pendiente</span>}</div>}
          <div style={{ position: 'absolute', left: 12, bottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: '80%' }}>
            <button onClick={() => setFiltro(null)} style={{ border: '1px solid ' + S.line, background: !filtro ? S.ink : '#fff', color: !filtro ? '#fff' : S.text, borderRadius: 14, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>Todos</button>
            {procesosConColor.map(p => <button key={p.codigo} onClick={() => setFiltro(f => f === p.codigo ? null : p.codigo)} style={{ border: '1px solid ' + S.line, background: filtro === p.codigo ? COLOR_PROC[p.codigo] : '#fff', color: filtro === p.codigo ? '#fff' : S.text, borderRadius: 14, padding: '3px 10px', fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: COLOR_PROC[p.codigo] }} />{p.codigo} {fmtPct(p.avance)}</button>)}
          </div>
          <div style={{ position: 'absolute', right: 12, top: 12, fontSize: 11, color: S.textSoft, background: 'rgba(255,255,255,.85)', padding: '4px 8px', borderRadius: 6 }}>arrastra para girar · rueda para acercar</div>
        </div>
      </Card>
      <Nota>{fuente === 'ifc'
        ? 'Modelo real leído del IFC. Cada pieza toma el color del proceso que la alcanzó según el avance registrado, repartido a lo largo del frente de la obra. Puedes reemplazarlo cuando Tekla emita una revisión nueva.'
        : 'Modelo preliminar: la geometría la defines tú (botón «Geometría»); el color de cada pieza sigue el avance real de los procesos. Sube el IFC exportado de Tekla («Subir IFC») y cada pieza real tomará el lugar de estas.'}</Nota>
    </div>
  )
}
