import LogoSerein from './LogoSerein.jsx'
import { LayoutGrid, Sparkles, Building2, Factory, Wrench, Wallet, ShoppingCart, FileText, Receipt, ShieldAlert, Landmark, Users, ClipboardList, Package, Settings, User, Search, Bell, Menu, ChevronsLeft, LogOut, Circle } from 'lucide-react'

export const THEME = {
  navy: '#061A40', navy2: '#0B2A5B', orange: '#FF6B00', orange2: '#FF8A33',
  bg: '#F6F7F9', surface: '#FFFFFF', border: '#E6E8EE', borderSoft: '#EEF0F4',
  text: '#141C2B', textSoft: '#5A6472', textMute: '#8A929E',
  success: '#12805C', danger: '#D64545', warn: '#C9860B',
  radius: 12, radiusSm: 8, radiusPill: 999,
  shadow: '0 1px 2px rgba(16,24,40,.06)', shadowMd: '0 6px 18px rgba(16,24,40,.08)',
  font: "'Inter', system-ui, -apple-system, sans-serif"
}

const ICON = {
  TODAS: LayoutGrid, ASESOR: Sparkles,
  'Santa Rosa': Factory, 'Istria': Factory, 'Proyectos': Building2,
  GESTION_PROYECTOS: Building2, GESTION_OT: Wrench, PRODUCCION: Factory,
  COMPRAS_OP: Package, ASISTENCIA: Users, COTIZADOR: ClipboardList,
  CLIENTES: Users, CONTACTOS: User, FINANZAS: Landmark, PAGOS: Wallet,
  ORDENES_COMPRA: ShoppingCart, LIBRO_COMPRAS: FileText, LIBRO_VENTAS: Receipt,
  TRAZABILIDAD: ShieldAlert, PARAMETROS: Settings
}
const iconoTab = c => ICON[c] || Circle

const CATS = [
  { nombre: 'Principal', codes: ['TODAS', 'ASESOR', 'Santa Rosa', 'Istria', 'Proyectos', 'GESTION_PROYECTOS'] },
  { nombre: 'Finanzas', codes: ['FINANZAS', 'ORDENES_COMPRA', 'PAGOS', 'LIBRO_COMPRAS', 'LIBRO_VENTAS', 'TRAZABILIDAD'] },
  { nombre: 'Comercial', codes: ['COTIZADOR', 'CLIENTES', 'CONTACTOS', 'COMPRAS_OP'] },
  { nombre: 'Producción', codes: ['PRODUCCION', 'GESTION_OT', 'ASISTENCIA'] },
  { nombre: 'Configuración', codes: ['PARAMETROS'] }
]

function iniciales(txt) {
  const s = (txt || '?').toString().trim()
  const p = s.split(/[\s@.]+/).filter(Boolean)
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase()
}

export function Sidebar({ tabs, areaSel, setAreaSel, nombreTab, perfil, email, onLogout, colapsado, setColapsado, onReset }) {
  const W = colapsado ? 72 : 250
  const grupos = CATS.map(cat => ({ nombre: cat.nombre, items: cat.codes.filter(c => tabs.includes(c)) })).filter(g => g.items.length)
  const restantes = tabs.filter(t => !CATS.some(c => c.codes.includes(t)))
  if (restantes.length) grupos.push({ nombre: 'Otros', items: restantes })
  const nom = (perfil && perfil.nombre) || email || 'Usuario'
  const rol = (perfil && perfil.rol) || ''
  return (<aside style={{ width: W, minWidth: W, maxWidth: W, overflowX: 'hidden', flexShrink: 0, background: THEME.surface, borderRight: '1px solid ' + THEME.border, display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', transition: 'width .18s ease', fontFamily: THEME.font }}>
    <div style={{ padding: colapsado ? '16px 0' : '16px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: colapsado ? 'center' : 'space-between', borderBottom: '1px solid ' + THEME.borderSoft }}>
      {!colapsado && <div><LogoSerein alto={26} /><div style={{ color: THEME.textMute, fontSize: 10, letterSpacing: 1.5, marginTop: 4, fontWeight: 600 }}>PANEL 2026</div></div>}
      <button onClick={() => setColapsado(!colapsado)} title="Colapsar menú" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: THEME.textSoft, display: 'flex', padding: 6, borderRadius: 8 }}>
        {colapsado ? <Menu size={18} /> : <ChevronsLeft size={18} />}
      </button>
    </div>
    <div style={{ padding: colapsado ? '10px 0' : '10px 14px', display: 'flex', alignItems: 'center', gap: 10, justifyContent: colapsado ? 'center' : 'flex-start', borderBottom: '1px solid ' + THEME.borderSoft }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,' + THEME.navy + ',' + THEME.navy2 + ')', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{iniciales(nom)}</div>
      {!colapsado && <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: THEME.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>
        <div style={{ fontSize: 11, color: THEME.textMute }}>{rol}</div>
      </div>}
    </div>
    <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
      {grupos.map(g => (<div key={g.nombre} style={{ marginBottom: 10 }}>
        {!colapsado && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: THEME.textMute, textTransform: 'uppercase', padding: '4px 10px 6px' }}>{g.nombre}</div>}
        {g.items.map(t => {
          const act = areaSel === t
          const Ico = iconoTab(t)
          const label = nombreTab(t).replace(/^[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]+/, '').trim()
          return (<button key={t} onClick={() => setAreaSel(t)} title={label} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', marginBottom: 2, padding: colapsado ? '10px 0' : '9px 11px', justifyContent: colapsado ? 'center' : 'flex-start', borderRadius: THEME.radiusSm, position: 'relative', background: act ? 'linear-gradient(90deg, rgba(255,107,0,.14), rgba(255,107,0,.02))' : 'transparent', color: act ? THEME.navy : THEME.textSoft, fontWeight: act ? 600 : 500, fontSize: 13, fontFamily: THEME.font, transition: 'background .12s' }}
            onMouseEnter={e => { if (!act) e.currentTarget.style.background = '#F3F4F6' }}
            onMouseLeave={e => { if (!act) e.currentTarget.style.background = 'transparent' }}>
            {act && <span style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, borderRadius: 3, background: THEME.orange }} />}
            <Ico size={17} color={act ? THEME.orange : THEME.textMute} style={{ flexShrink: 0 }} />
            {!colapsado && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
          </button>)
        })}
      </div>))}
    </nav>
    <div style={{ borderTop: '1px solid ' + THEME.borderSoft, padding: colapsado ? '10px 0' : '10px 12px' }}>
      <button onClick={onLogout} title="Salir" style={{ display: 'flex', alignItems: 'center', gap: 9, justifyContent: colapsado ? 'center' : 'flex-start', width: '100%', background: 'transparent', border: '1px solid ' + THEME.border, color: THEME.textSoft, padding: '8px 10px', borderRadius: THEME.radiusSm, cursor: 'pointer', fontSize: 12.5, fontFamily: THEME.font }}>
        <LogOut size={15} />{!colapsado && 'Salir'}
      </button>
      {!colapsado && <div style={{ marginTop: 8, fontSize: 10, color: THEME.textMute, textAlign: 'center', lineHeight: 1.6 }}>
        SEREIN GROUP · Panel 2026
        {onReset && <div style={{ marginTop: 2 }}><span onClick={() => { if (window.confirm('¿Borrar los datos guardados y volver a los valores base? Esta acción no se puede deshacer.')) onReset() }} style={{ color: THEME.textMute, textDecoration: 'underline', cursor: 'pointer' }}>Restablecer datos</span></div>}
      </div>}
    </div>
  </aside>)
}

export function GlobalStyles() {
  return (<style>{'*{box-sizing:border-box}' + 'body{margin:0}' + '::selection{background:rgba(255,107,0,.18)}' + '::-webkit-scrollbar{width:10px;height:10px}' + '::-webkit-scrollbar-thumb{background:#CBD2DC;border-radius:8px;border:2px solid transparent;background-clip:content-box}' + '::-webkit-scrollbar-thumb:hover{background:#AAB3C0;background-clip:content-box}' + '::-webkit-scrollbar-track{background:transparent}' + 'table tbody tr{transition:background .12s ease}' + 'table tbody tr:hover{background:#F4F7FB}' + 'input:focus,select:focus,textarea:focus{outline:none;box-shadow:0 0 0 3px rgba(255,107,0,.15);border-color:#FF6B00 !important}' + 'button{transition:filter .12s ease,transform .06s ease,background .12s ease}' + 'button:not(:disabled):active{transform:translateY(1px)}'}</style>)
}

export function PageHeader({ titulo, perfil, email }) {
  const hoy = new Date()
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const fecha = dias[hoy.getDay()] + ' ' + hoy.getDate() + ' de ' + meses[hoy.getMonth()] + ', ' + hoy.getFullYear()
  const nom = (perfil && perfil.nombre) || email || 'Usuario'
  return (<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid ' + THEME.border, fontFamily: THEME.font }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: THEME.textMute, fontWeight: 500, marginBottom: 3 }}>SEREIN GROUP <span style={{ opacity: 0.5 }}>›</span> {titulo}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontFamily: "'Oswald', sans-serif", fontSize: 23, fontWeight: 600, color: THEME.navy, textTransform: 'uppercase', letterSpacing: 0.3 }}>{titulo}</h1>
        <span style={{ fontSize: 12, color: THEME.textMute, textTransform: 'capitalize' }}>{fecha}</span>
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: THEME.surface, border: '1px solid ' + THEME.border, borderRadius: THEME.radiusPill, padding: '7px 12px', minWidth: 170 }}>
        <Search size={15} color={THEME.textMute} />
        <input placeholder="Buscar..." style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, width: '100%', color: THEME.text, fontFamily: THEME.font }} />
      </div>
      <button title="Notificaciones" style={{ position: 'relative', width: 38, height: 38, borderRadius: '50%', background: THEME.surface, border: '1px solid ' + THEME.border, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.textSoft }}>
        <Bell size={17} />
        <span style={{ position: 'absolute', top: 8, right: 9, width: 7, height: 7, borderRadius: '50%', background: THEME.orange, border: '1.5px solid #fff' }} />
      </button>
      <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,' + THEME.navy + ',' + THEME.navy2 + ')', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{iniciales(nom)}</div>
    </div>
  </div>)
}
