// Módulo Avance de Obra · piezas visuales compartidas (vista interna y
// cliente). Paleta del ERP (theme-serein.js) en fondo claro; la estructura
// toma del prototipo de Gerencia los «estanques» por proceso con sus luces
// INT/EXT, los tabs numerados y la cadena de procesos, y de la biblioteca de
// diseño (lime-metrics) la fila de tarjetas de cifras con una de acento y
// gráficos SVG hechos a mano. Colores de partida validados con el
// comprobador de paletas (daltonismo y contraste) el 2026-11-17.
import React from 'react'
import { SEREIN } from '../theme-serein.js'

export const S = SEREIN
// Un color por partida contractual (identidad), nunca por rango.
export const COLOR_PARTIDA = { prov: '#D9600A', mon: '#2A5FB0', pin: '#0F9BA8', int: '#7A4FB5', ter: '#1B9E5D' }
export const COLOR_PARTIDA_SUAVE = { prov: '#FDECDD', mon: '#E7EFFB', pin: '#E3F5F7', int: '#EFE8F8', ter: '#E6F7EE' }
export const colorProceso = p => COLOR_PARTIDA[p.partida] || S.orange

export const Card = ({ title, right, children, style, pad = true }) => (
  <div style={{ background: '#fff', border: '1px solid ' + S.line, borderRadius: S.radius, boxShadow: S.shadow, ...style }}>
    {(title || right) && (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 16px', borderBottom: '1px solid ' + S.line }}>
        <h3 style={{ margin: 0, fontFamily: S.fontDisplay, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{title}</h3>
        <div style={{ fontSize: 11.5, color: S.textSoft, display: 'flex', gap: 8, alignItems: 'center' }}>{right}</div>
      </div>
    )}
    <div style={pad ? { padding: '12px 16px' } : null}>{children}</div>
  </div>
)
export const Eyebrow = ({ children, style }) => <div style={{ fontSize: 10.5, letterSpacing: '.09em', textTransform: 'uppercase', color: S.textFaint, fontWeight: 700, ...style }}>{children}</div>
export const Pill = ({ tono = 'gris', children, style }) => {
  const t = { verde: [S.greenSoft, S.green], naranja: [S.orangeSoft, S.orangeDark], gris: [S.fog2, S.textSoft], azul: [S.blueSoft, S.blue], rojo: [S.redSoft, S.red], ambar: ['#FBF1DC', '#B7791F'] }[tono] || [S.fog2, S.textSoft]
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: t[0], color: t[1], ...style }}>{children}</span>
}
export const Btn = ({ tipo, children, style, ...p }) => {
  const base = { display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: S.radiusSm, padding: '7px 12px', fontSize: 12, fontWeight: 600, border: '1px solid ' + S.line, background: '#fff', color: S.text, cursor: p.disabled ? 'not-allowed' : 'pointer', opacity: p.disabled ? 0.55 : 1, fontFamily: S.fontBody }
  const v = tipo === 'p' ? { background: S.orange, borderColor: S.orange, color: '#fff' } : tipo === 'g' ? { background: S.ink, borderColor: S.ink, color: '#fff' } : tipo === 'ok' ? { background: S.greenSoft, borderColor: '#BFE8D0', color: S.green } : tipo === 'no' ? { color: S.red, borderColor: '#F1C7C4' } : tipo === 's' ? { padding: '4px 9px', fontSize: 11 } : {}
  return <button {...p} style={{ ...base, ...v, ...style }}>{children}</button>
}
export const inp = { border: '1px solid ' + S.line, borderRadius: 6, padding: '7px 9px', fontSize: 12.5, fontFamily: S.fontBody, background: '#fff', color: S.text, width: '100%', boxSizing: 'border-box' }
export const Campo = ({ label, children, style }) => <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, ...style }}><Eyebrow>{label}</Eyebrow>{children}</label>
export const Nota = ({ children, style }) => <div style={{ fontSize: 11.5, color: S.textFaint, ...style }}>{children}</div>
export const Aviso = ({ tono = 'rojo', children }) => <div style={{ background: tono === 'rojo' ? S.redSoft : tono === 'verde' ? S.greenSoft : S.orangeSoft, color: tono === 'rojo' ? S.red : tono === 'verde' ? S.green : S.orangeDark, padding: '9px 12px', borderRadius: 8, fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{children}</div>

// Interruptor sí/no
export const Switch = ({ on, onChange, title }) => (
  <span role="switch" aria-checked={!!on} title={title} onClick={() => onChange && onChange(!on)}
    style={{ display: 'inline-block', width: 30, height: 17, borderRadius: 9, background: on ? S.green : S.fog2, position: 'relative', cursor: 'pointer', verticalAlign: 'middle', transition: 'background .15s' }}>
    <i style={{ position: 'absolute', top: 2, left: on ? 15 : 2, width: 13, height: 13, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.25)', transition: 'left .15s' }} />
  </span>
)

// Luces de liberación INT / EXT (estado con color + texto, nunca solo color)
export const ESTADO_LIB = { ok: ['Liberado', S.green], run: ['En proceso', '#B7791F'], pend: ['Pendiente', S.fog2], blk: ['Bloqueado', S.red], na: ['No aplica', '#C9D1DA'] }
export const Luz = ({ estado = 'pend', etiqueta }) => {
  const [t, c] = ESTADO_LIB[estado] || ESTADO_LIB.pend
  return <span title={etiqueta + ': ' + t} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 9.5, color: S.textFaint, fontWeight: 700, letterSpacing: '.04em' }}>
    <i style={{ width: 10, height: 10, borderRadius: '50%', background: c, boxShadow: estado === 'pend' ? 'inset 0 0 0 1px ' + S.textFaint : '0 0 0 2px ' + c + '33' }} />{etiqueta}
  </span>
}

// «Estanque» de un proceso: el relleno a rayas sube con el avance; una
// marca gris señala dónde debería ir según el programa.
export const Estanque = ({ p, plan, color, alto = 120 }) => {
  const av = Math.max(0, Math.min(1, p.avance || 0))
  const pl = Math.max(0, Math.min(1, plan || 0))
  const id = 'rayas-' + p.codigo
  return (
    <svg width="46" height={alto} viewBox={`0 0 46 ${alto}`} style={{ display: 'block' }} role="img" aria-label={`${p.nombre}: ${Math.round(av * 100)} % real, ${Math.round(pl * 100)} % programado`}>
      <defs><pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="4" fill={color} /><rect y="4" width="6" height="2" fill={color} opacity=".45" /></pattern></defs>
      <rect x="8" y="4" width="30" height={alto - 8} rx="5" fill={S.fog} stroke={S.line} />
      <rect x="8" y={4 + (alto - 8) * (1 - av)} width="30" height={(alto - 8) * av} rx="4" fill={`url(#${id})`} />
      {pl > 0 && <line x1="4" x2="42" y1={4 + (alto - 8) * (1 - pl)} y2={4 + (alto - 8) * (1 - pl)} stroke={S.textSoft} strokeWidth="2" strokeDasharray="3 2" />}
    </svg>
  )
}

// Barras verticales (cifras) — tarjeta 1 de lime-metrics re-coloreada
export const Barras = ({ datos, color = '#fff', alto = 64, suave = false }) => {
  const max = Math.max(1e-9, ...datos.map(d => d.v))
  const w = 100 / datos.length
  return (
    <svg viewBox={`0 0 100 ${alto}`} width="100%" height={alto} preserveAspectRatio="none" style={{ display: 'block' }}>
      {datos.map((d, i) => { const h = Math.max(1.5, (d.v / max) * (alto - 4)); return <rect key={i} x={i * w + w * 0.2} y={alto - h} width={w * 0.6} height={h} rx="1.5" fill={d.color || color} opacity={suave && d.v === 0 ? .3 : 1}><title>{d.l}: {d.t || d.v}</title></rect> })}
    </svg>
  )
}
// Dona (plazo consumido) — tarjeta 2
export const Dona = ({ pct, color = S.orange, tam = 72, grosor = 9, texto }) => {
  const r = (tam - grosor) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, pct || 0))
  return (
    <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} role="img" aria-label={texto}>
      <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={S.fog2} strokeWidth={grosor} />
      <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={color} strokeWidth={grosor} strokeDasharray={`${c * v} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${tam / 2} ${tam / 2})`} />
      <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" fontFamily={S.fontDisplay} fontWeight="800" fontSize={tam * 0.22} fill={S.text}>{texto}</text>
    </svg>
  )
}
// Curva plan (gris) vs real (naranja) en el tiempo — tarjeta 3 (área escalonada)
export const Curva = ({ puntos, alto = 110 }) => {
  // puntos: [{x: 0..1, plan: 0..1, real: 0..1|null}]
  if (!puntos || !puntos.length) return null
  const W = 600, H = alto, px = x => x * W, py = y => H - 4 - y * (H - 10)
  const linea = k => puntos.filter(p => p[k] != null).map((p, i) => (i ? 'L' : 'M') + px(p.x).toFixed(1) + ' ' + py(p[k]).toFixed(1)).join(' ')
  const reales = puntos.filter(p => p.real != null)
  const ult = reales[reales.length - 1]
  const area = reales.length ? linea('real') + ` L ${px(ult.x).toFixed(1)} ${py(0)} L ${px(reales[0].x).toFixed(1)} ${py(0)} Z` : ''
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block', background: `linear-gradient(to top, ${S.fog2} 1px, transparent 1px) 0 0 / 100% ${(H - 10) / 4}px` }}>
      <path d={linea('plan')} fill="none" stroke="#C9D1DA" strokeWidth="2" />
      {area && <path d={area} fill={S.orange} opacity=".12" />}
      {reales.length > 0 && <path d={linea('real')} fill="none" stroke={S.orange} strokeWidth="2.5" />}
      {ult && <><line x1={px(ult.x)} x2={px(ult.x)} y1="0" y2={H} stroke={S.orange} strokeDasharray="3 3" opacity=".5" /><circle cx={px(ult.x)} cy={py(ult.real)} r="4.5" fill={S.orange} stroke="#fff" strokeWidth="2" /></>}
    </svg>
  )
}

// Tarjeta de cifra (KPI)
export const Kpi = ({ l, v, s, acento, oscuro, children, style }) => (
  <div style={{ background: acento ? S.orange : oscuro ? S.ink : '#fff', border: '1px solid ' + (acento ? S.orange : oscuro ? S.ink : S.line), borderRadius: S.radius, padding: '13px 15px', boxShadow: acento ? S.shadowMd : S.shadow, color: acento || oscuro ? '#fff' : S.text, minWidth: 0, ...style }}>
    <div style={{ fontSize: 10.5, letterSpacing: '.09em', textTransform: 'uppercase', fontWeight: 700, color: acento ? 'rgba(255,255,255,.85)' : oscuro ? '#B9C0C8' : S.textFaint }}>{l}</div>
    <div style={{ fontFamily: S.fontDisplay, fontSize: 24, fontWeight: 800, marginTop: 3, lineHeight: 1.1 }}>{v}</div>
    {s && <div style={{ fontSize: 11.5, marginTop: 3, color: acento ? 'rgba(255,255,255,.85)' : oscuro ? '#B9C0C8' : S.textSoft }}>{s}</div>}
    {children}
  </div>
)

// Tabs numerados «01 COMANDO · 02 PROCESOS…» (del prototipo), en claro.
export const TabsNum = ({ tabs, sel, onSel }) => (
  <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid ' + S.line, flexWrap: 'wrap' }}>
    {tabs.map((t, i) => (
      <button key={t.id} onClick={() => onSel(t.id)} style={{ background: 'none', border: 0, borderBottom: '2px solid ' + (sel === t.id ? S.orange : 'transparent'), marginBottom: -2, padding: '9px 13px', fontFamily: S.fontDisplay, fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: sel === t.id ? S.text : S.textSoft, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', gap: 7, alignItems: 'center' }}>
        <span style={{ color: sel === t.id ? S.orange : S.textFaint, fontSize: 10.5 }}>{String(i + 1).padStart(2, '0')}</span>{t.t}
        {t.n > 0 && <span style={{ background: sel === t.id ? S.orangeSoft : S.fog2, color: sel === t.id ? S.orangeDark : S.textSoft, borderRadius: 10, padding: '0 6px', fontSize: 10.5 }}>{t.n}</span>}
      </button>
    ))}
  </div>
)
