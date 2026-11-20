// Módulo Avance de Obra · modelo 3D preliminar (fase 4).
// No hay IFC todavía: la estructura se genera desde una geometría simple que
// se configura por OT (ejes, filas, alturas, entrepiso, ala lateral) y cada
// elemento toma el color del proceso que «lo alcanzó»: el avance de un
// proceso se reparte a lo largo de los ejes (frente de trabajo de izquierda a
// derecha), igual que el prototipo de Gerencia pero en claro. Cuando llegue
// el IFC de Tekla (fase 6) este archivo se reemplaza por el lector real; la
// pantalla y la leyenda quedan iguales.
// Three.js se carga solo al abrir esta pestaña (chunk perezoso).
import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { S, Card, Btn, Nota, COLOR_PARTIDA } from './ui.jsx'
import { fmtPct } from './calc.js'

export const GEOMETRIA_DEFECTO = { ejes: 12, sepEjes: 6, filas: [0, 6, 12, 18], altura: 9, entrepiso: 0, ala: 0, alaFilas: 6, prefijoEjes: 'A', nombreFilas: ['1', '2', '3', '4'] }
const COLOR_PROC = { ING: '#9AA3AD', PER: '#B7791F', SUM: '#8FA3B8', COR: '#5A636E', ARM: '#D9600A', SOL: '#F77716', PIN: COLOR_PARTIDA.pin, MON: COLOR_PARTIDA.mon, INT: COLOR_PARTIDA.int, TER: COLOR_PARTIDA.ter }
const PENDIENTE = '#E2E7EC'
const letra = (i, prefijo) => { const base = (prefijo || 'A').charCodeAt(0) - 65; let n = base + i, s = ''; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0); return s }

// Qué proceso «alcanzó» un elemento según su posición relativa (0..1) a lo largo de los ejes:
// el frente avanza de izquierda a derecha; el último proceso de la cadena cuyo avance cubre esa
// posición es el que colorea. Pedestales solo miran PER; el resto, la cadena de fabricación/montaje.
function procesoDe(frac, procesos, tipo) {
  const cadena = tipo === 'pedestal' ? ['PER'] : tipo === 'montaje' ? ['SUM', 'COR', 'ARM', 'SOL', 'PIN', 'MON', 'INT', 'TER'] : ['SUM', 'COR', 'ARM', 'SOL', 'PIN']
  let ultimo = null
  for (const c of cadena) { const p = procesos.find(x => x.codigo === c); if (p && Number(p.avance) >= frac + 1e-6) ultimo = c; else break }
  return ultimo
}

export default function Modelo3D({ datos, res, geometria, onGuardarGeometria }) {
  const caja = useRef(null)
  const [hover, setHover] = useState(null)
  const [filtro, setFiltro] = useState(null)
  const [g, setG] = useState(() => ({ ...GEOMETRIA_DEFECTO, ...(geometria || {}) }))
  const [editando, setEditando] = useState(false)
  const procesos = datos.procesos || []
  const filtroRef = useRef(null); filtroRef.current = filtro

  useEffect(() => {
    const el = caja.current; if (!el) return
    const W = el.clientWidth, H = el.clientHeight || 520
    const ren = new THREE.WebGLRenderer({ antialias: true, alpha: true }); ren.setPixelRatio(Math.min(2, devicePixelRatio)); ren.setSize(W, H); el.appendChild(ren.domElement)
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0xF2F4F7); sc.fog = new THREE.Fog(0xF2F4F7, 220, 420)
    const cam = new THREE.PerspectiveCamera(38, W / H, 1, 1500)
    sc.add(new THREE.AmbientLight(0xffffff, .75)); const dl = new THREE.DirectionalLight(0xffffff, .9); dl.position.set(60, 120, 40); sc.add(dl)
    const largo = (g.ejes - 1) * g.sepEjes, ancho = g.filas[g.filas.length - 1] || 1
    sc.add(new THREE.GridHelper(Math.max(largo, ancho) * 2 + 60, 40, 0xDFE4EA, 0xE9EDF1))
    const items = []
    const mem = (a, b, s, tipo, nombre, frac) => {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length()
      const proc = procesoDe(frac, procesos, tipo === 'pedestal' ? 'pedestal' : tipo === 'pilar' || tipo === 'viga' ? 'montaje' : 'fab')
      const col = new THREE.Color(proc ? COLOR_PROC[proc] : PENDIENTE)
      const mat = new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: proc ? .95 : .55, metalness: .15, roughness: .6 })
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
    const centro = new THREE.Vector3(largo / 2, 3, ancho / 2)
    cam.position.set(centro.x - largo * .9, Math.max(40, largo * .7), centro.z + largo * 1.1); cam.lookAt(centro)
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
  }, [g, procesos]) // eslint-disable-line react-hooks/exhaustive-deps

  const setN = (k, v) => setG(s => ({ ...s, [k]: v }))
  const procesosConColor = procesos.filter(p => COLOR_PROC[p.codigo])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card title="Modelo preliminar" right={<><span>generado desde ejes y niveles · color = proceso que alcanzó el elemento</span><Btn tipo="s" onClick={() => setEditando(v => !v)}>{editando ? 'Cerrar geometría' : 'Geometría'}</Btn></>} pad={false}>
        {editando && (
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
          {hover && <div style={{ position: 'absolute', left: hover.x + 14, top: hover.y + 14, background: S.ink, color: '#fff', fontSize: 11.5, padding: '6px 9px', borderRadius: 6, pointerEvents: 'none', whiteSpace: 'nowrap' }}><b>{hover.nombre}</b> · {hover.tipo}<br />{hover.proc ? <span style={{ color: COLOR_PROC[hover.proc] }}>{hover.proc} · {(procesos.find(p => p.codigo === hover.proc) || {}).nombre}</span> : <span style={{ color: '#B9C0C8' }}>pendiente</span>}</div>}
          <div style={{ position: 'absolute', left: 12, bottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: '80%' }}>
            <button onClick={() => setFiltro(null)} style={{ border: '1px solid ' + S.line, background: !filtro ? S.ink : '#fff', color: !filtro ? '#fff' : S.text, borderRadius: 14, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>Todos</button>
            {procesosConColor.map(p => <button key={p.codigo} onClick={() => setFiltro(f => f === p.codigo ? null : p.codigo)} style={{ border: '1px solid ' + S.line, background: filtro === p.codigo ? COLOR_PROC[p.codigo] : '#fff', color: filtro === p.codigo ? '#fff' : S.text, borderRadius: 14, padding: '3px 10px', fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: COLOR_PROC[p.codigo] }} />{p.codigo} {fmtPct(p.avance)}</button>)}
          </div>
          <div style={{ position: 'absolute', right: 12, top: 12, fontSize: 11, color: S.textSoft, background: 'rgba(255,255,255,.85)', padding: '4px 8px', borderRadius: 6 }}>arrastra para girar · rueda para acercar</div>
        </div>
      </Card>
      <Nota>Modelo preliminar: la geometría la defines tú (botón «Geometría»); el color de cada pieza sigue el avance real de los procesos repartido a lo largo de los ejes. Cuando se cargue el IFC de Tekla, cada pieza real tomará el lugar de estas.</Nota>
    </div>
  )
}
