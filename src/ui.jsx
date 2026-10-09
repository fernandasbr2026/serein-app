import LogoSerein from './LogoSerein.jsx'
import { ShieldCheck, LayoutGrid, Sparkles, Building2, Factory, Wrench, Wallet, ShoppingCart, FileText, Receipt, ShieldAlert, Landmark, Users, ClipboardList, Package, Settings, User, Search, Bell, Menu, ChevronsLeft, LogOut, Circle, ChevronDown, Network, Handshake, Archive, ArrowUp, ArrowDown, CheckCircle2, UploadCloud, AlertTriangle, RotateCw, Banknote, CalendarClock, ClipboardCheck } from 'lucide-react'
import { useState, useEffect } from 'react'
import { SEREIN, PILL_VARIANT } from './theme-serein.js'
import { suscribirEstadoGuardado, pushState } from './sync.js'

// Indicador honesto de guardado: refleja el ciclo real de pushState() (no
// una suposición) — se muestra en el Sidebar, visible para todos los
// usuarios en todo momento, para cualquier tipo de cambio (texto, fotos,
// documentos: todo pasa por el mismo pushState()). Incluye un botón para
// forzar el guardado y confirmar que efectivamente llegó a la nube.
// true en pantallas angostas (teléfono): ahí el menú lateral pasa a ser un cajón que se abre con el botón de menú.
export function useEsMovil(ancho = 860) {
  const consulta = '(max-width:' + ancho + 'px)'
  const [movil, setMovil] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(consulta).matches)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(consulta)
    const f = () => setMovil(mq.matches)
    f()
    if (mq.addEventListener) mq.addEventListener('change', f); else mq.addListener(f)
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', f); else mq.removeListener(f) }
  }, [consulta])
  return movil
}

export function EstadoGuardado({ colapsado }) {
  const [estado, setEstado] = useState(() => ({ fase: 'guardado', ultimoOk: null, ultimoError: null }))
  const [forzando, setForzando] = useState(false)
  useEffect(() => suscribirEstadoGuardado(setEstado), [])

  const forzar = async () => {
    setForzando(true)
    const r = await pushState()
    setForzando(false)
    if (r.ok && r.n === 0) window.alert('No hay cambios pendientes — todo lo que cargaste ya está guardado en la nube.')
    else if (r.ok) window.alert('Guardado confirmado: los cambios llegaron a la nube (Supabase).')
    else window.alert('No se pudo guardar' + (r.error ? ':\n\n' + r.error : '') + '\n\nRevisa tu conexión a internet e inténtalo de nuevo. Si el mensaje se repite, avisa al administrador con este texto.')
  }

  const cfg = {
    guardando: { icon: UploadCloud, color: SEREIN.orange, bg: SEREIN.orangeSoft, texto: 'Guardando…' },
    guardado: { icon: CheckCircle2, color: SEREIN.green, bg: SEREIN.greenSoft, texto: 'Guardado en la nube' },
    error: { icon: AlertTriangle, color: SEREIN.red, bg: SEREIN.redSoft, texto: 'Error al guardar' },
  }[estado.fase] || { icon: CheckCircle2, color: SEREIN.green, bg: SEREIN.greenSoft, texto: 'Guardado en la nube' }
  const Icon = cfg.icon

  if (colapsado) {
    return (
      <button onClick={forzar} title={cfg.texto + ' · Click para forzar guardado'} disabled={forzando}
        style={{ margin: '10px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,.94)', border: 'none', cursor: 'pointer' }}>
        <Icon size={17} color={cfg.color} style={estado.fase === 'guardando' || forzando ? { animation: 'girar 1s linear infinite' } : undefined} />
      </button>
    )
  }
  return (
    <div style={{ margin: '0 18px 12px', padding: '9px 12px', borderRadius: 12, background: 'rgba(255,255,255,.94)', boxShadow: '0 6px 16px -8px rgba(120,45,0,.45)', display: 'flex', alignItems: 'center', gap: 9 }}>
      <Icon size={16} color={cfg.color} style={estado.fase === 'guardando' || forzando ? { animation: 'girar 1s linear infinite', flexShrink: 0 } : { flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: SEREIN.text }}>{forzando ? 'Guardando…' : cfg.texto}</div>
        {estado.fase === 'error' && estado.ultimoError && <div style={{ fontSize: 10, color: SEREIN.textSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={estado.ultimoError}>{estado.ultimoError}</div>}
      </div>
      <button onClick={forzar} disabled={forzando} title="Forzar guardado y confirmar" style={{ background: 'none', border: 'none', cursor: forzando ? 'default' : 'pointer', color: SEREIN.textFaint, padding: 4, flexShrink: 0, display: 'flex' }}>
        <RotateCw size={13} style={forzando ? { animation: 'girar 1s linear infinite' } : undefined} />
      </button>
    </div>
  )
}

// THEME mantiene las mismas claves de siempre (los modulos que ya lo importan
// no cambian una linea de codigo) — solo se actualizan los VALORES a la
// identidad Serein 2026 (theme-serein.js). Es un cambio de forma, no de fondo.
export const THEME = {
  navy: SEREIN.ink, navy2: SEREIN.ink2, orange: SEREIN.orange, orange2: SEREIN.orangeLight,
  bg: SEREIN.fog, surface: SEREIN.paper, border: SEREIN.line, borderSoft: SEREIN.fog2,
  text: SEREIN.text, textSoft: SEREIN.textSoft, textMute: SEREIN.textFaint,
  success: SEREIN.green, danger: SEREIN.red, warn: '#C9860B',
  radius: SEREIN.radius, radiusSm: SEREIN.radiusSm, radiusPill: SEREIN.radiusPill,
  shadow: SEREIN.shadow, shadowMd: SEREIN.shadowMd,
  font: SEREIN.fontBody, fontDisplay: SEREIN.fontDisplay
}

const ICON = {
  TODAS: LayoutGrid, ASESOR: Sparkles, ORGANIGRAMA: Network, CRM: Handshake,
  'Santa Rosa': Factory, 'Istria': Factory, 'Proyectos': Building2,
  GESTION_PROYECTOS: Building2, GESTION_OT: Wrench, PRODUCCION: Factory,
  COMPRAS_OP: Package, ASISTENCIA: Users, COTIZADOR: ClipboardList,
  CLIENTES: Users, CONTACTOS: User, FINANZAS: Landmark, CALENDARIO_PAGOS: CalendarClock, PAGOS: Wallet,
  ORDENES_COMPRA: ShoppingCart, LIBRO_COMPRAS: FileText, LIBRO_VENTAS: Receipt,
  CARTOLAS_BANCARIAS: Banknote, CREDITO: ShieldCheck, REVISION_CONTABLE: ClipboardCheck,
  TRAZABILIDAD: ShieldAlert, PARAMETROS: Settings, INVENTARIO: Archive
}
const iconoTab = c => ICON[c] || Circle

// Agrupacion en 6 secciones tipo acordeon (identidad Serein 2026), calcada
// del mapa de navegacion del mockup panel-serein-v2.html — mismos 21 modulos
// reales que ya calcula Dashboard.jsx, solo reorganizados visualmente.
const SECCIONES_SEREIN = [
  { nombre: 'General', codes: ['TODAS', 'ORGANIGRAMA', 'CRM', 'ASESOR', 'Santa Rosa', 'Istria', 'Proyectos'] },
  { nombre: 'Proyectos', codes: ['GESTION_PROYECTOS'] },
  { nombre: 'Finanzas', codes: ['CALENDARIO_PAGOS', 'FINANZAS', 'ORDENES_COMPRA', 'PAGOS', 'LIBRO_COMPRAS', 'LIBRO_VENTAS', 'REVISION_CONTABLE', 'CARTOLAS_BANCARIAS'] },
  { nombre: 'Comercial', codes: ['TRAZABILIDAD', 'COTIZADOR', 'CLIENTES', 'CREDITO', 'CONTACTOS', 'COMPRAS_OP'] },
  { nombre: 'Operaciones', codes: ['PRODUCCION', 'GESTION_OT', 'ASISTENCIA', 'INVENTARIO'] },
  { nombre: 'Sistema', codes: ['PARAMETROS'] }
]
// Vista previa de las pestañas internas de cada modulo (son estado interno
// de cada componente, no rutas propias) — se muestran solo por fidelidad
// visual con el mockup; al hacer clic en cualquiera se abre el modulo padre,
// exactamente igual que hoy. No agrega ni quita ninguna pantalla real.
const SUBITEMS_SEREIN = {
  CRM: ['Leads y clientes', 'Campañas', 'Vendedores', 'Seguimientos'],
  ASESOR: ['Dashboard Inteligente', 'Alertas', 'Analista Financiero', 'Analista Comercial', 'Analista Operacional', 'Recomendaciones', 'Chat'],
  GESTION_PROYECTOS: ['Tarjetas', 'Cotización Proyecto', 'Cotizaciones', 'Cotización Intumescente', 'Compras SII', 'Consolidado de proyectos', 'Proyectos cerrados', 'Facturas', 'Parámetros Proyectos'],
  FINANZAS: ['Resumen mensual', 'Gastos fijos', 'Gastos variables', 'Reglas de distribución', 'Créditos y Leasing'],
  PAGOS: ['Resumen y flujo', 'Por pagar', 'Calendario de pagos', 'Cobros esperados', 'Flujo de caja', 'Reportes'],
  COTIZADOR: ['Cotización rápida', 'Nueva por cálculo', 'Parámetros Cotizador'],
  CONTACTOS: ['Clientes', 'Proveedores'],
  COMPRAS_OP: ['Registrar compra', 'Mis compras / OT / OC'],
  PRODUCCION: ['Registrar avance', 'Avance por OT'],
  ASISTENCIA: ['Registro diario', 'Horas extras'],
  PARAMETROS: ['Factoring', 'Valor UF', 'Instrumentos', 'Datos empresa']
}

function iniciales(txt) {
  const s = (txt || '?').toString().trim()
  const p = s.split(/[\s@.]+/).filter(Boolean)
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase()
}

export function Sidebar({ tabs, areaSel, setAreaSel, nombreTab, perfil, email, onLogout, colapsado: colapsadoProp, setColapsado, onReset, movilAbierto = false, setMovilAbierto = () => {} }) {
  const movil = useEsMovil()
  const colapsado = movil ? false : colapsadoProp
  const W = colapsado ? 76 : 272
  const grupos = SECCIONES_SEREIN.map(cat => ({ nombre: cat.nombre, items: cat.codes.filter(c => tabs.includes(c)) })).filter(g => g.items.length)
  const restantes = tabs.filter(t => !SECCIONES_SEREIN.some(c => c.codes.includes(t)))
  if (restantes.length) grupos.push({ nombre: 'General', items: restantes })
  const nom = (perfil && perfil.nombre) || email || 'Usuario'
  const rol = (perfil && perfil.rol) || ''
  const [abiertos, setAbiertos] = useState(() => new Set([areaSel]))
  const toggleAbierto = t => setAbiertos(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n })
  return (<>{movil && movilAbierto && <div onClick={() => setMovilAbierto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(16,19,21,.45)', zIndex: 999 }} />}<aside style={{ width: W, minWidth: W, maxWidth: W, overflowX: 'hidden', flexShrink: 0, background: 'radial-gradient(520px 360px at 105% -6%, rgba(255,214,170,.55), transparent 62%), radial-gradient(460px 420px at -20% 108%, rgba(168,62,0,.55), transparent 60%), linear-gradient(168deg, #FF8A2E 0%, #F77716 46%, #E0630C 100%)', color: '#fff', borderRight: 'none', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', transition: 'width .18s ease', fontFamily: THEME.font, ...(movil ? { position: 'fixed', top: 0, left: 0, zIndex: 1000, height: '100dvh', width: 288, minWidth: 288, maxWidth: 288, transform: movilAbierto ? 'translateX(0)' : 'translateX(-105%)', boxShadow: movilAbierto ? '0 0 40px rgba(0,0,0,.35)' : 'none', transition: 'transform .22s ease' } : {}) }}>
    <div style={{ padding: colapsado ? '18px 0' : '18px 18px 14px', display: 'flex', alignItems: 'center', justifyContent: colapsado ? 'center' : 'space-between' }}>
      {!colapsado && <div><LogoSerein alto={24} sobreNaranja /><div style={{ color: 'rgba(255,255,255,.78)', fontSize: 10, letterSpacing: 1.8, marginTop: 6, fontWeight: 600, textTransform: 'uppercase' }}>Panel de Gestión</div></div>}
      <button onClick={() => movil ? setMovilAbierto(false) : setColapsado(!colapsado)} title={movil ? 'Cerrar menú' : 'Colapsar menú'} style={{ background: 'rgba(255,255,255,.18)', border: '1px solid rgba(255,255,255,.35)', cursor: 'pointer', color: '#fff', display: 'flex', padding: 6, borderRadius: 8 }}>
        {colapsado ? <Menu size={16} /> : <ChevronsLeft size={16} />}
      </button>
    </div>
    <div style={{ margin: colapsado ? '14px 0' : '16px 18px 10px', padding: colapsado ? 0 : '12px 14px', display: 'flex', alignItems: 'center', gap: 12, justifyContent: colapsado ? 'center' : 'flex-start', background: colapsado ? 'transparent' : 'rgba(255,255,255,.16)', border: colapsado ? 'none' : '1px solid rgba(255,255,255,.34)', backdropFilter: 'blur(6px)', borderRadius: 12 }}>
      <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#fff', color: SEREIN.orangeDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, fontFamily: THEME.fontDisplay, flexShrink: 0 }}>{iniciales(nom)}</div>
      {!colapsado && <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.8)' }}>{rol}</div>
      </div>}
    </div>
    <EstadoGuardado colapsado={colapsado} />
    <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 16px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,.45) transparent' }}>
      {grupos.map(g => (<div key={g.nombre} style={{ marginBottom: 2 }}>
        {!colapsado && <div style={{ fontFamily: THEME.fontDisplay, fontSize: 10.5, fontWeight: 700, letterSpacing: 1.8, color: 'rgba(255,255,255,.66)', textTransform: 'uppercase', margin: '20px 6px 8px' }}>{g.nombre}</div>}
        {g.items.map(t => {
          const act = areaSel === t
          const Ico = iconoTab(t)
          const label = nombreTab(t).replace(/^[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]+/, '').trim()
          const hijos = SUBITEMS_SEREIN[t]
          const abierto = abiertos.has(t)
          return (<div key={t}>
            <button onClick={() => { setAreaSel(t); if (hijos) toggleAbierto(t); if (movil) setMovilAbierto(false) }} title={label}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', marginBottom: 1, padding: colapsado ? '10px 0' : '10px 12px', justifyContent: colapsado ? 'center' : 'flex-start', borderRadius: 8, position: 'relative', background: act ? '#fff' : 'transparent', boxShadow: act ? '0 6px 14px -6px rgba(120,45,0,.5)' : 'none', color: act ? SEREIN.ink : 'rgba(255,255,255,.95)', fontWeight: act ? 600 : 500, fontSize: 13.5, fontFamily: THEME.font, transition: 'background .12s' }}
              onMouseEnter={e => { if (!act) e.currentTarget.style.background = 'rgba(255,255,255,.16)' }}
              onMouseLeave={e => { if (!act) e.currentTarget.style.background = 'transparent' }}>
              <Ico size={17} strokeWidth={1.75} color={act ? SEREIN.orange : 'rgba(255,255,255,.88)'} style={{ flexShrink: 0 }} />
              {!colapsado && <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
              {!colapsado && hijos && <ChevronDown size={14} color={act ? SEREIN.textFaint : 'rgba(255,255,255,.7)'} style={{ flexShrink: 0, transition: 'transform .2s ease', transform: abierto ? 'rotate(180deg)' : 'none' }} />}
            </button>
            {!colapsado && hijos && (
              <ul style={{ maxHeight: abierto ? 900 : 0, overflow: 'hidden', transition: 'max-height .25s ease', listStyle: 'none', margin: 0, padding: 0 }}>
                {hijos.map(h => (
                  <li key={h}>
                    <a onClick={() => { setAreaSel(t); if (movil) setMovilAbierto(false) }} title={label + ' · ' + h}
                      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 12px 7px 22px', fontSize: 12.5, color: 'rgba(255,255,255,.82)', borderLeft: '1px solid rgba(255,255,255,.34)', marginLeft: 17, cursor: 'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#fff' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,.82)' }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
                      {h}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>)
        })}
      </div>))}
    </nav>
    <div style={{ borderTop: '1px solid rgba(255,255,255,.28)', padding: colapsado ? '12px 0' : '12px 16px 16px' }}>
      <button onClick={onLogout} title="Salir" style={{ display: 'flex', alignItems: 'center', gap: 9, justifyContent: colapsado ? 'center' : 'flex-start', width: '100%', background: 'transparent', border: 'none', color: '#fff', padding: '8px 4px', cursor: 'pointer', fontSize: 13 }}
        onMouseEnter={e => { e.currentTarget.style.opacity = .75 }}
        onMouseLeave={e => { e.currentTarget.style.opacity = 1 }}>
        <LogOut size={15} />{!colapsado && 'Salir'}
      </button>
      {!colapsado && <div style={{ marginTop: 8, fontSize: 10.5, color: 'rgba(255,255,255,.75)', lineHeight: 1.7 }}>
        SEREIN GROUP · Panel de Gestión
        {onReset && <div><span onClick={() => { if (window.confirm('¿Borrar los datos guardados y volver a los valores base? Esta acción no se puede deshacer.')) onReset() }} style={{ color: '#fff', textDecoration: 'underline', cursor: 'pointer' }}>Restablecer datos</span></div>}
      </div>}
    </div>
  </aside></>)
}

export function GlobalStyles() {
  return (<style>{'*{box-sizing:border-box}' + 'body{margin:0}' + '::selection{background:rgba(247,119,22,.18)}' + '::-webkit-scrollbar{width:10px;height:10px}' + '::-webkit-scrollbar-thumb{background:#CBD2DC;border-radius:8px;border:2px solid transparent;background-clip:content-box}' + '::-webkit-scrollbar-thumb:hover{background:#AAB3C0;background-clip:content-box}' + '::-webkit-scrollbar-track{background:transparent}' + 'table tbody tr{transition:background .12s ease}' + 'table tbody tr:hover{background:#FAFBFB}' + 'input:focus,select:focus,textarea:focus{outline:none;box-shadow:0 0 0 3px rgba(247,119,22,.15);border-color:#F77716 !important}' + 'button{transition:filter .12s ease,transform .06s ease,background .12s ease}' + 'button:not(:disabled):active{transform:translateY(1px)}' + 'table thead th{background:#F5F6F8 !important;color:#59626C !important;font-weight:600 !important;border-bottom:1px solid #E4E8ED !important;letter-spacing:.4px}' + 'table thead tr{border-bottom-color:#E4E8ED !important}' + 'table tbody td{border-color:#EEF0F3 !important}' + 'input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea{border-radius:6px !important;border-color:#DFE4EA !important}' + 'input:not([type=checkbox]):not([type=radio]):not([type=range]):hover,select:hover,textarea:hover{border-color:#C9D0D8 !important}' + 'h1,h2,h3{text-wrap:balance}' + 'label{max-width:100%}select{max-width:100%;min-width:0}' + '@media (max-width:860px){.kpi-card{padding:12px 12px !important;flex:1 1 calc(50% - 6px) !important;min-width:0 !important}.kpi-v{font-size:18px !important;letter-spacing:-0.4px !important;min-width:0}.kpi-solid{padding:12px 12px !important}.kpi-ic{width:30px !important;height:30px !important;margin-bottom:8px !important}div[style*="display: grid"]:has(> .kpi-card){grid-template-columns:repeat(2,minmax(0,1fr)) !important;gap:10px !important}}' + 'button{text-transform:none !important;letter-spacing:0 !important;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif !important}' + 'button:not([style*="border-radius: 50%"]):not([style*="border-radius: 1"]):not([style*="border-radius: 2"]):not([style*="border-radius: 99"]){border-radius:8px !important}' + '@keyframes girar{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>)
}

// ---------------- Componentes de presentacion reutilizables (Serein 2026) ----------------
// Envoltorios puramente visuales — no leen ni escriben ningun dato propio,
// solo reciben props y las muestran. Cada modulo sigue siendo dueño de sus
// datos/calculos; esto solo evita que cada archivo reinvente su propia
// tarjeta/boton/badge con estilos sueltos.

export function Panel({ children, style }) {
  return <div style={{ background: SEREIN.paper, border: '1px solid ' + SEREIN.line, borderRadius: 14, boxShadow: SEREIN.shadow, overflow: 'hidden', ...style }}>{children}</div>
}

// acento: una sola tarjeta por fila lleva el color de marca (idea de lime-metrics, re-coloreada a naranja)
export function KpiCard({ icon: Icon, iconBg, iconColor, trend, trendUp, value, label, acento }) {
  const ac = !!acento
  return (<div className="kpi-card" style={{ background: ac ? 'linear-gradient(135deg, #F77716 0%, #FF9D5C 100%)' : SEREIN.paper, border: '1px solid ' + (ac ? 'transparent' : SEREIN.line), borderRadius: 14, boxShadow: ac ? '0 10px 24px -12px rgba(247,119,22,.55)' : SEREIN.shadow, padding: 20 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      {Icon && <div className="kpi-ic" style={{ width: 38, height: 38, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ac ? 'rgba(255,255,255,.22)' : (iconBg || SEREIN.orangeSoft), color: ac ? '#fff' : (iconColor || SEREIN.orangeDark) }}><Icon size={19} strokeWidth={1.75} /></div>}
      {trend != null && (<span style={{ fontSize: 12, fontWeight: 700, fontFamily: SEREIN.fontDisplay, display: 'inline-flex', alignItems: 'center', gap: 3, color: ac ? '#fff' : (trendUp ? SEREIN.green : SEREIN.red) }}>
        {trendUp ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{trend}
      </span>)}
    </div>
    <div className="kpi-v" style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 28, color: ac ? '#fff' : SEREIN.text, lineHeight: 1, letterSpacing: -0.5 }}>{value}</div>
    <div style={{ fontSize: 13, color: ac ? 'rgba(255,255,255,.88)' : SEREIN.textSoft, marginTop: 8 }}>{label}</div>
  </div>)
}

// Tarjeta de indicador financiero: neto primero, grande y con jerarquía
// visual; el bruto/total debajo, en tamaño menor. Usada en toda la
// pantalla de Resumen financiero (Santa Rosa/Istria) para que un mismo
// indicador siempre muestre ambos valores en el mismo orden.
export function MontoNetoBruto({ icon: Icon, iconBg, iconColor, label, neto, bruto, brutoLabel = 'Total' }) {
  return (<div className="kpi-card" style={{ background: SEREIN.paper, border: '1px solid ' + SEREIN.line, borderRadius: 14, boxShadow: SEREIN.shadow, padding: 20 }}>
    {Icon && <div className="kpi-ic" style={{ width: 38, height: 38, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: iconBg || SEREIN.orangeSoft, color: iconColor || SEREIN.orangeDark, marginBottom: 14 }}><Icon size={19} strokeWidth={1.75} /></div>}
    <div style={{ fontSize: 13, color: SEREIN.textSoft, marginBottom: 4 }}>{label}</div>
    <div className="kpi-v" style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 26, color: SEREIN.text, lineHeight: 1.15, letterSpacing: -0.4 }}>{neto}</div>
    {bruto != null && <div style={{ fontSize: 12.5, color: SEREIN.textSoft, marginTop: 4 }}>{brutoLabel}: {bruto}</div>}
  </div>)
}

// variant: 'verde' | 'naranja' | 'gris' | 'azul' | 'rojo'
export function Pill({ variant = 'gris', children }) {
  const v = PILL_VARIANT[variant] || PILL_VARIANT.gris
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: SEREIN.radiusPill, whiteSpace: 'nowrap', background: v.bg, color: v.fg }}>{children}</span>
}

// variant: 'primary' | 'dark' | 'outline' | 'green'
export function Btn({ variant = 'primary', children, onClick, type = 'button', disabled, style, icon: Icon }) {
  const base = { display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: SEREIN.fontBody, fontWeight: 600, fontSize: 13.5, padding: '9px 16px', borderRadius: 8, border: '1px solid transparent', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }
  const variants = {
    primary: { background: SEREIN.orange, color: '#fff' },
    dark: { background: SEREIN.ink, color: '#fff' },
    outline: { background: SEREIN.paper, color: SEREIN.text, borderColor: SEREIN.line },
    green: { background: SEREIN.green, color: '#fff' },
  }
  return <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...(variants[variant] || variants.primary), ...style }}>{Icon && <Icon size={15} />}{children}</button>
}

export function TabsBar({ tabs, active, onChange }) {
  return (<div style={{ display: 'flex', gap: 26, borderBottom: '1px solid ' + SEREIN.line, marginBottom: 22, overflowX: 'auto' }}>
    {tabs.map(t => {
      const key = typeof t === 'string' ? t : t.key
      const label = typeof t === 'string' ? t : t.label
      const act = active === key
      return (<button key={key} onClick={() => onChange(key)} style={{ fontFamily: SEREIN.fontBody, fontWeight: 600, fontSize: 13.5, color: act ? SEREIN.text : SEREIN.textSoft, padding: '10px 2px 12px', border: 'none', borderBottom: '2px solid ' + (act ? SEREIN.orange : 'transparent'), background: 'none', whiteSpace: 'nowrap' }}>{label}</button>)
    })}
  </div>)
}

export function PageHeader({ titulo, perfil, email, onMenu }) {
  const movil = useEsMovil()
  const hoy = new Date()
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const fecha = (dias[hoy.getDay()] + ' ' + hoy.getDate() + ' de ' + meses[hoy.getMonth()] + ', ' + hoy.getFullYear()).replace(/^./, c => c.toUpperCase())
  const nom = (perfil && perfil.nombre) || email || 'Usuario'
  // Los títulos de cada módulo traen un emoji decorativo adelante; en el encabezado se muestra solo el nombre.
  titulo = String(titulo || '').replace(/^[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]+/, '').trim()
  return (<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: movil ? 'nowrap' : 'wrap', gap: 12, marginBottom: movil ? 16 : 22, paddingBottom: 4, fontFamily: THEME.font }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
    {movil && onMenu && <button onClick={onMenu} title="Abrir menú" aria-label="Abrir menú" style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 12, background: SEREIN.orange, color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 18px -10px rgba(247,119,22,.8)' }}><Menu size={20} /></button>}
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: THEME.textMute, fontWeight: 500, marginBottom: 3 }}>SEREIN GROUP <span style={{ opacity: 0.5 }}>›</span> {titulo}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontFamily: THEME.fontDisplay, fontSize: 24, fontWeight: 700, color: THEME.text, textTransform: 'none', letterSpacing: -0.5 }}>{titulo}</h1>
        <span style={{ fontSize: 12.5, color: THEME.textMute, display: movil ? 'none' : 'inline' }}>{fecha}</span>
      </div>
    </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ display: movil ? 'none' : 'flex', alignItems: 'center', gap: 7, background: THEME.surface, border: '1px solid ' + THEME.border, borderRadius: THEME.radiusPill, padding: '7px 12px', minWidth: 170 }}>
        <Search size={15} color={THEME.textMute} />
        <input placeholder="Buscar..." style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, width: '100%', color: THEME.text, fontFamily: THEME.font }} />
      </div>
      <button title="Notificaciones" style={{ position: 'relative', width: 38, height: 38, borderRadius: '50%', background: THEME.surface, border: '1px solid ' + THEME.border, cursor: 'pointer', display: movil ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.textSoft }}>
        <Bell size={17} />
        <span style={{ position: 'absolute', top: 8, right: 9, width: 7, height: 7, borderRadius: '50%', background: THEME.orange, border: '1.5px solid #fff' }} />
      </button>
      <div style={{ width: 38, height: 38, borderRadius: '50%', background: THEME.orange, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, fontFamily: THEME.fontDisplay }}>{iniciales(nom)}</div>
    </div>
  </div>)
}
