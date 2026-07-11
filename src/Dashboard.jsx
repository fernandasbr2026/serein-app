import React, { useState, useMemo, useEffect } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { LogOut, TrendingUp, Wallet, AlertTriangle, Landmark, User } from 'lucide-react'
import { DATA } from './data.js'
import LogoSerein from './LogoSerein.jsx'
import { Sidebar, PageHeader, THEME, GlobalStyles } from './ui.jsx'
import ProyectosModule from './ProyectosModule.jsx'
import OTModule, { OTS_INICIALES } from './OTModule.jsx'
import PipelineOT from './PipelineOT.jsx'
import PipelineProyectos from './PipelineProyectos.jsx'
import ManoObraModule from './ManoObraModule.jsx'
import FinanzasModule, { FIN_SEED, calcularResumenFin } from './FinanzasModule.jsx'
import CotizadorModule from './CotizadorModule.jsx'
import CotizacionesModule from './CotizacionesModule.jsx'
import ProduccionModule, { AVANCES_SEED } from './ProduccionModule.jsx'
import ComprasOperativasModule, { COMPRAS_OP_SEED, CONFIG_COMPRAS_DEFAULT } from './ComprasOperativasModule.jsx'
import ProveedoresPagosModule, { PP_SEED } from './ProveedoresPagosModule.jsx'
import OrdenesCompraModule, { ocTotal, costoOCdeOT } from './OrdenesCompraModule.jsx'
import TrazabilidadModule from './TrazabilidadModule.jsx'
import ParametrosModule, { PARAMS_SEED, perdidaFactoringFactura } from './ParametrosModule.jsx'
import ClientesModule, { CLIENTES_SEED } from './ClientesModule.jsx'
import LibroComprasModule from './LibroComprasModule.jsx'
import LibroVentasModule from './LibroVentasModule.jsx'
import AsesorModule from './AsesorModule.jsx'
import ConsolidadoModule from './ConsolidadoModule.jsx'
import ContactosModule, { CONTACTOS_SEED, nombresClientes } from './ContactosModule.jsx'
import FacturasModule, { FACTURAS_SEED } from './FacturasModule.jsx'
import { MO_SEED } from './ManoObraModule.jsx'
import { PROYECTOS } from './proyectos-data.js'
import InventarioModule from './InventarioModule.jsx'
import { INVENTARIO_SEED } from './inventario-data.js'
import { pushState } from './sync.js'

const C = { azul: '#1D1D1B', teal: '#A8501F', ambar: '#D2642F', rojo: '#B5432E', verde: '#3D7A4E', carbon: '#161616', niebla: '#F6F0EA' }
const AREA_COLOR = { 'Santa Rosa': '#A8501F', 'Proyectos': '#D2642F', 'Istria': '#1D1D1B' }
const clp = n => '$' + Math.round(n).toLocaleString('es-CL')
const clpM = n => '$' + Math.round(n / 1000000).toLocaleString('es-CL') + 'M'

// ---- Guardado local (persistencia en el navegador) ----
// Los datos que la usuaria ingresa/edita quedan guardados en localStorage y
// se recargan al abrir la app. Cambiar LS_VER limpia los datos si cambia la estructura de los SEED.
const LS_VER = '2026-07-08'
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('serein_ver') !== LS_VER) {
    Object.keys(localStorage).filter(k => k.startsWith('serein_')).forEach(k => localStorage.removeItem(k))
    localStorage.setItem('serein_ver', LS_VER)
  }
} catch (e) {}
const LS = (k, fb) => {
  try { const v = localStorage.getItem('serein_' + k); return v ? JSON.parse(v) : fb } catch (e) { return fb }
}
const guardarSerein = obj => {
  try { Object.entries(obj).forEach(([k, v]) => localStorage.setItem('serein_' + k, JSON.stringify(v))) } catch (e) {}
}
export function borrarDatosLocales() {
  try { Object.keys(localStorage).filter(k => k.startsWith('serein_')).forEach(k => localStorage.removeItem(k)); location.reload() } catch (e) {}
}

function Kpi({ label, valor, sub, color, icon: Icon }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #EEF0F4', borderRadius: 14, boxShadow: '0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.04)', padding: '16px 18px', flex: '1 1 180px', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>{label}</span>
        <Icon size={16} color={color} />
      </div>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 23, fontWeight: 600, color: C.carbon, marginTop: 8, whiteSpace: 'nowrap' }}>{valor}</div>
      {sub && <div style={{ fontSize: 12, color: '#7A8288', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function Panel({ title, children, right }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #EEF0F4', borderRadius: 14, boxShadow: '0 1px 3px rgba(16,24,40,.06)', padding: 18, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <h3 style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, letterSpacing: 0.5, textTransform: 'uppercase', margin: 0 }}>{title}</h3>
        {right}
      </div>
      {children}
    </div>
  )
}


function ResumenFinancieroCard({ fin, onIr }) {
  const mes = new Date().toISOString().slice(0, 7)
  const r = calcularResumenFin(fin, mes)
  const item = (label, valor, color) => (
    <div>
      <div style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 600, color: color || '#161616', whiteSpace: 'nowrap' }}>{valor}</div>
    </div>
  )
  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', borderTop: '4px solid #161616', marginBottom: 16 }}>
      <div style={{ padding: '14px 18px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase' }}>💰 Resumen financiero del mes</span>
        <button onClick={onIr} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '5px 12px', cursor: 'pointer', fontSize: 12 }}>Ver módulo Finanzas →</button>
      </div>
      <div style={{ padding: '0 18px 16px', display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        {item('Gastos fijos + variables', clp(r.fijos + r.variables))}
        {item('Cuotas créditos/leasing', clp(r.totalCuotasMes), '#D2642F')}
        {item('Salida de caja proyectada', clp(r.salidaCaja), '#B5432E')}
        {item('Deuda vigente', clp(r.deudaVigente))}
        {item('Cuotas vencidas', r.cuotasVencidas.length, r.cuotasVencidas.length > 0 ? '#B5432E' : '#3D7A4E')}
      </div>
    </div>
  )
}

function CardModulo({ titulo, color, abiertasN, abiertasMonto, porFacturar, facturadoPorCobrar }) {
  const it = (label, val, col) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, color: '#7A8288', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 18, fontWeight: 600, color: col || '#161616', whiteSpace: 'nowrap' }}>{val}</div>
    </div>
  )
  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', borderTop: `4px solid ${color}`, padding: '14px 16px' }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 12 }}>{titulo}</div>
      {it(`Abiertas · ${abiertasN} en curso`, clp(abiertasMonto) + ' por facturar', color)}
      {it('Cerradas por facturar', clp(porFacturar), '#D2642F')}
      {it('Facturado, aún por cobrar', clp(facturadoPorCobrar), '#B5432E')}
    </div>
  )
}

function ResumenModulos({ ots, proyectos }) {
  const meOT = o => (o.montoCotizado > 0 ? o.montoCotizado : (o.ventas || []).reduce((a, v) => a + (v.neta || 0), 0))
  const areaData = a => {
    const list = (ots || []).filter(o => o.area === a)
    const abiertas = list.filter(o => ['Cotizada', 'En ejecución'].includes(o.estado))
    const terminadas = list.filter(o => o.estado === 'Terminada')
    const facturadas = list.filter(o => ['Facturada', 'Cerrada'].includes(o.estado))
    return {
      abiertasN: abiertas.length,
      abiertasMonto: abiertas.reduce((s, o) => s + meOT(o), 0),
      porFacturar: terminadas.reduce((s, o) => s + meOT(o), 0),
      facturadoPorCobrar: facturadas.reduce((s, o) => s + (o.ventas || []).filter(v => v.estadoPago === 'Pendiente').reduce((x, v) => x + (v.neta || 0), 0), 0),
    }
  }
  const facturadoDe = p => (p.edps || []).reduce((a, e) => a + (e.venta || 0), 0)
  const proyList = proyectos || []
  const saldoP = p => (p.presupuesto > 0) ? Math.max(0, p.presupuesto - facturadoDe(p)) : null
  const proyAbiertas = proyList.filter(p => { const s = saldoP(p); return (s !== null && s > 0) || (s === null && p.avance < 100) })
  const proyData = {
    abiertasN: proyAbiertas.length,
    abiertasMonto: proyAbiertas.reduce((a, p) => a + (saldoP(p) || 0), 0),
    porFacturar: proyList.reduce((a, p) => a + (saldoP(p) || 0), 0),
    facturadoPorCobrar: proyList.reduce((a, p) => a + (p.edps || []).filter(e => e.estado !== 'Pagado').reduce((x, e) => x + (e.venta || 0), 0), 0),
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>OT y proyectos por módulo</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <CardModulo titulo="Santa Rosa" color="#A8501F" {...areaData('Santa Rosa')} />
        <CardModulo titulo="Istria" color="#1D1D1B" {...areaData('Istria')} />
        <CardModulo titulo="Proyectos" color="#D2642F" {...proyData} />
      </div>
    </div>
  )
}

export default function Dashboard({ perfil, email, onLogout }) {
  const areasUsuario = perfil.areas || []
  const modulosPerfil = Array.isArray(perfil.modulos) ? perfil.modulos : null
  const sinValores = Array.isArray(perfil.sin_valores) ? perfil.sin_valores : []
  const esGerencia = areasUsuario.length > 1 && perfil.tipo !== 'supervisor'
  const esSupervisor = perfil.tipo === 'supervisor'
  const tieneProyectos = areasUsuario.includes('Proyectos')
  const areasOT = areasUsuario.filter(a => a === 'Santa Rosa' || a === 'Istria')
  const puedeVer = code => modulosPerfil ? modulosPerfil.includes(code) : esGerencia
  // Cada usuario ve en paralelo las OT de su área asignada
  const EMAIL_AREA = { 'joce@sereinspa.com': 'Santa Rosa', 'jose@sereinspa.com': 'Santa Rosa', 'produccion@sereinspa.com': 'Istria', 'mario@sereinspa.com': 'Proyectos' }
  const _email = (email || '').toLowerCase()
  const areaPorEmail = EMAIL_AREA[_email] || null
  const veTodasLasOT = esGerencia || _email === 'caro@sereinspa.com'
  const areasOTUsuario = veTodasLasOT
    ? ['Santa Rosa', 'Istria', 'Proyectos']
    : [...new Set([...areasUsuario.filter(a => ['Santa Rosa', 'Istria', 'Proyectos'].includes(a)), ...(areaPorEmail ? [areaPorEmail] : [])])]
  let tabs = esSupervisor ? [...(areasOTUsuario.length > 0 ? ['GESTION_OT'] : []), 'PRODUCCION', 'COMPRAS_OP', 'LIBRO_COMPRAS', 'ASISTENCIA'] : [
    ...(esGerencia ? ['TODAS'] : []),
    ...(esGerencia ? ['ASESOR'] : []),
    ...areasUsuario.filter(a => a !== 'Proyectos'),
    ...(tieneProyectos ? ['GESTION_PROYECTOS'] : []),
    ...(esGerencia ? ['PAGOS'] : []),
    ...(esGerencia ? ['ORDENES_COMPRA'] : []),
      ...(esGerencia ? ['LIBRO_COMPRAS'] : []),
      ...(esGerencia ? ['LIBRO_VENTAS'] : []),
    ...(esGerencia ? ['TRAZABILIDAD'] : []),
    ...(esGerencia ? ['FINANZAS'] : []),
    'CLIENTES',
    'COTIZADOR',
    ...(areasOTUsuario.length > 0 ? ['GESTION_OT'] : []),
    ...(esGerencia ? ['COMPRAS_OP'] : []),
    ...(areasOT.length > 0 || esGerencia ? ['PRODUCCION'] : []),
    'ASISTENCIA',
    'CONTACTOS',
    'INVENTARIO',
    ...(esGerencia ? ['PARAMETROS'] : []),
  ]
  const ORDEN_MODULOS = ['TODAS', 'ASESOR', 'Santa Rosa', 'Istria', 'GESTION_PROYECTOS', 'FINANZAS', 'ORDENES_COMPRA', 'PAGOS', 'LIBRO_COMPRAS', 'LIBRO_VENTAS', 'TRAZABILIDAD', 'COTIZADOR', 'CLIENTES', 'CONTACTOS', 'COMPRAS_OP', 'PRODUCCION', 'GESTION_OT', 'ASISTENCIA', 'INVENTARIO', 'PARAMETROS']
  if (modulosPerfil) tabs = ORDEN_MODULOS.filter(c => c === 'INVENTARIO' || modulosPerfil.includes(c))
  const [areaSel, setAreaSel] = useState(tabs[0])
  const [sidebarColapsado, setSidebarColapsado] = useState(false)

  const esModuloProyectos = areaSel === 'GESTION_PROYECTOS'
  const esModuloOT = areaSel === 'GESTION_OT'
  const esModuloMO = areaSel === 'ASISTENCIA'
  const esModuloFin = areaSel === 'FINANZAS'
  const esModuloPagos = areaSel === 'PAGOS'
  const esModuloOC = areaSel === 'ORDENES_COMPRA'
  const esModuloTraza = areaSel === 'TRAZABILIDAD'
  const esModuloParams = areaSel === 'PARAMETROS'
  const esModuloClientes = areaSel === 'CLIENTES'
  const esModuloContactos = areaSel === 'CONTACTOS'
  const esModuloCot = areaSel === 'COTIZADOR'
  const esModuloProd = areaSel === 'PRODUCCION'
  const [avances, setAvances] = useState(() => LS('avances', AVANCES_SEED))
  const [mo, setMo] = useState(() => LS('mo', MO_SEED))
  const esModuloComprasOp = areaSel === 'COMPRAS_OP'
  const esModuloLibroCompras = areaSel === 'LIBRO_COMPRAS'
  const esModuloLibroVentas = areaSel === 'LIBRO_VENTAS'
  const esModuloAsesor = areaSel === 'ASESOR'
  const [comprasOp, setComprasOp] = useState(() => LS('comprasOp', COMPRAS_OP_SEED))
  const [configCompras, setConfigCompras] = useState(() => LS('configCompras', CONFIG_COMPRAS_DEFAULT))
  const [fin, setFin] = useState(() => { const _f = LS('fin', FIN_SEED); if (_f && _f.credVer !== FIN_SEED.credVer) { _f.obligaciones = FIN_SEED.obligaciones; _f.credVer = FIN_SEED.credVer } return _f })
  const [pp, setPp] = useState(() => { const s = LS('pp', null); if (!s) return PP_SEED; return (s.ocsVer === PP_SEED.ocsVer) ? s : { ...s, ocs: PP_SEED.ocs, ocsVer: PP_SEED.ocsVer } })
  const [params, setParams] = useState(() => LS('params', PARAMS_SEED))
  useEffect(() => { const uv = (params.uf && params.uf.valor) || 0; if ((fin.ufValor || 0) !== uv) setFin(f => ({ ...f, ufValor: uv })) }, [params.uf && params.uf.valor])
  const [clientes, setClientes] = useState(() => LS('clientes', CLIENTES_SEED))
  const [contactos, setContactos] = useState(() => { const s = LS('contactos', null); return (s && s.ver === CONTACTOS_SEED.ver) ? s : CONTACTOS_SEED })
  const [facturas, setFacturas] = useState(() => LS('facturas', FACTURAS_SEED))
  const [cotizaciones, setCotizaciones] = useState(() => LS('cotizaciones', []))
  // Valores de las OT visibles solo para Gerencia, Caro y Mario
  const verValoresOT = (esGerencia || ['caro@sereinspa.com', 'mario@sereinspa.com'].includes((email || '').toLowerCase())) && !sinValores.includes('GESTION_OT')
  const [comisiones, setComisiones] = useState(() => LS('comisiones', { 'Santa Rosa': 3, 'Istria': 2, 'Proyectos': 2 }))
  const [ppmPct, setPpmPct] = useState(() => LS('ppmPct', 2))
  const [ots, setOts] = useState(() => LS('ots', OTS_INICIALES))
  const [proyectos, setProyectos] = useState(() => LS('proyectos', PROYECTOS))
  const [inventario, setInventario] = useState(() => LS('inventario', INVENTARIO_SEED))
  const [invMov, setInvMov] = useState(() => LS('invMov', []))

  useEffect(() => {
    window.__sereinAddSobrante = (d) => {
      try {
        const nombre = String((d && d.nombre) || '').trim(); const cant = +((d && d.cantidad)) || 0
        if (!nombre || cant <= 0) return { ok: false, msg: 'Indica producto y cantidad.' }
        const sede = (d && d.sede) || 'Santa Rosa'; const nm = nombre.toLowerCase()
        let arr = []; try { arr = JSON.parse(localStorage.getItem('serein_inventario') || '[]') } catch (e) { arr = [] }
        const idx = (arr || []).findIndex(p => String(p.nombre || '').trim().toLowerCase() === nm && p.sede === sede)
        let prodId, saldoRes
        if (idx >= 0) { prodId = arr[idx].id; saldoRes = (arr[idx].saldo || 0) + cant } else { prodId = 'inv-' + Date.now(); saldoRes = cant }
        setInventario(prev => {
          const a = (prev || []).slice()
          const j = a.findIndex(p => String(p.nombre || '').trim().toLowerCase() === nm && p.sede === sede)
          if (j >= 0) { a[j] = { ...a[j], saldo: (a[j].saldo || 0) + cant }; return a }
          return [{ id: prodId, codigo: '', nombre, color: (d && d.color) || '', proveedor: '', tipo: '', unidad: 'GALON', catalizador: '', saldo: cant, sede, estado: 'usable', costo: 0, descripcion: (d && d.color) || '' }, ...a]
        })
        setInvMov(prev => [{ id: 'mv-' + Date.now(), productoId: prodId, producto: nombre, sede, fecha: new Date().toISOString().slice(0, 10), tipo: 'entrada', cantidad: cant, motivo: 'sobrante de proyecto', ot: (d && d.ot) || '', usuario: (d && d.usuario) || '', saldoResultante: saldoRes }, ...(prev || [])])
        return { ok: true, saldoRes }
      } catch (e) { return { ok: false, msg: 'Error al ingresar.' } }
    }
    return () => { try { delete window.__sereinAddSobrante } catch (e) {} }
  }, [])

  // Guarda automáticamente en el navegador cada vez que cambian los datos
  useEffect(() => {
    guardarSerein({ avances, mo, comprasOp, configCompras, fin, pp, params, clientes, contactos, facturas, cotizaciones, comisiones, ppmPct, ots, proyectos, inventario, invMov }); try { clearTimeout(window.__sereinPushT); window.__sereinPushT = setTimeout(function () { pushState() }, 800) } catch (e) {}
  }, [avances, mo, comprasOp, configCompras, fin, pp, params, clientes, contactos, facturas, cotizaciones, comisiones, ppmPct, ots, proyectos, inventario, invMov])

  // Trae la UF (valor del día) al cargar la app, desde mindicador.cl (Banco Central)
  useEffect(() => {
    fetch('https://mindicador.cl/api/uf')
      .then(r => r.json())
      .then(d => { const s = d.serie && d.serie[0]; if (s) setParams(p => ({ ...p, uf: { valor: Math.round(s.valor), fecha: (s.fecha || '').slice(0, 10) } })) })
      .catch(() => {})
  }, [])

  // Sincroniza los gastos en UF (arriendo Santa Rosa = 180 UF) con el valor vigente
  useEffect(() => {
    const ufv = (params.uf && params.uf.valor) || 0
    if (!ufv) return
    setFin(f => ({
      ...f,
      gastos: (f.gastos || []).map(g => {
        if (g.id === 'g1') return { ...g, uf: 180, tipo: 'fijo', categoria: 'Arriendo', nombre: 'Arriendo Santa Rosa · 180 UF', dist: [{ area: 'Santa Rosa', pct: 100 }], neto: Math.round(180 * ufv), iva: 0, obs: '180 UF × $' + Math.round(ufv).toLocaleString('es-CL') + ' (vence el 5 de cada mes)' }
        if (g.uf > 0) return { ...g, neto: Math.round(g.uf * ufv) }
        return g
      }),
    }))
  }, [params.uf && params.uf.valor])
  const vista = useMemo(() => (esGerencia && areaSel === 'TODAS') ? DATA.global : (DATA.areas[areaSel] || DATA.global), [areaSel, esGerencia])
  const rentab = vista.venta > 0 ? (vista.utilidad / vista.venta) * 100 : 0

  const mesesVista = useMemo(() => DATA.meses.map(m => ({
    mes: m.mes.slice(0, 3),
    total: (esGerencia && areaSel === 'TODAS') ? m['Santa Rosa'] + m.Proyectos + m.Istria : (m[areaSel] ?? 0),
  })), [areaSel, esGerencia])

  const estados = Object.entries(vista.estados || {})
  const totalEst = estados.reduce((a, [, n]) => a + n, 0) || 1

  // ----- Consolidado y áreas: suman desde las FACTURAS consolidadas (Venta Neta) -----
  const areasFact = ['Santa Rosa', 'Istria', 'Proyectos']
  const facNeto = a => (facturas[a] || []).reduce((s, x) => s + (x.neto || 0), 0)
  const facCobN = a => (facturas[a] || []).filter(x => x.estado === 'Pagado').reduce((s, x) => s + (x.neto || 0), 0)
  const facCount = a => (facturas[a] || []).length
  const esTODAS = esGerencia && areaSel === 'TODAS'
  const esAreaFact = areasFact.includes(areaSel)
  const kVenta = esTODAS ? areasFact.reduce((s, a) => s + facNeto(a), 0) : (esAreaFact ? facNeto(areaSel) : vista.venta)
  const kCobrado = esTODAS ? areasFact.reduce((s, a) => s + facCobN(a), 0) : (esAreaFact ? facCobN(areaSel) : vista.cobrado)
  const kPend = (esTODAS || esAreaFact) ? (kVenta - kCobrado) : vista.pendiente
  const perdFactArea = a => (facturas[a] || []).reduce((s, f) => s + perdidaFactoringFactura(f, params), 0)
  const kPerd = esTODAS ? areasFact.reduce((s, a) => s + perdFactArea(a), 0) : (esAreaFact ? perdFactArea(areaSel) : vista.perdidaFact)
  const kNFact = esTODAS ? areasFact.reduce((s, a) => s + facCount(a), 0) : (esAreaFact ? facCount(areaSel) : vista.nFacturas)
  const ventaAreaLive = areasFact.map(a => ({ area: a, venta: facNeto(a) }))

  // ----- Flujo de caja proyectado (consolidado): lo que se debe pagar vs lo que va a entrar -----
  const _hoy = new Date().toISOString().slice(0, 10)
  const _en7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const gastosPend = (fin.gastos || []).filter(g => g.estado !== 'Pagado' && g.estado !== 'Anulado')
  const cuotasPend = (fin.obligaciones || []).flatMap(o => o.cuotas || []).filter(c => c.estado !== 'Pagada')
  const docsPend = (pp.docs || []).filter(d => !d.anulado).map(d => ({ venc: d.fecha_vencimiento, monto: Math.max(0, (d.total || 0) - (d.pagos || []).reduce((a, p) => a + (p.monto || 0), 0)) })).filter(d => d.monto > 0)
  // Órdenes de compra pendientes (no Pagadas/Canceladas/Anuladas) → cuentas por pagar y flujo
  const ocsPend = (pp.ocs || []).filter(o => !['Pagada', 'Anulada'].includes(o.estadoPago) && ocTotal(o) > 0).map(o => ({ venc: o.vencimiento || o.fecha, monto: ocTotal(o) }))
  const porPagarDocs = docsPend.concat(ocsPend)
  const totalPagar = gastosPend.reduce((a, g) => a + (g.neto || 0), 0) + cuotasPend.reduce((a, c) => a + (c.total || 0), 0) + porPagarDocs.reduce((a, d) => a + d.monto, 0)
  const pagar7 = gastosPend.filter(g => g.vencimiento >= _hoy && g.vencimiento <= _en7).reduce((a, g) => a + (g.neto || 0), 0) + cuotasPend.filter(c => c.vencimiento >= _hoy && c.vencimiento <= _en7).reduce((a, c) => a + (c.total || 0), 0) + porPagarDocs.filter(d => d.venc >= _hoy && d.venc <= _en7).reduce((a, d) => a + d.monto, 0)
  const cobrosPend = (pp.cobros || []).filter(c => c.estado === 'Pendiente' || c.estado === 'Factoring')
  const factPend = ['Santa Rosa', 'Istria'].flatMap(a => (facturas[a] || [])).filter(f => f.estado !== 'Pagado' && f.estado !== 'Anulada')
  const proyPorCobrar = proyectos.flatMap(p => (p.edps || [])).filter(e => e.estado !== 'Pagado')
  const totalEntrar = cobrosPend.reduce((a, c) => a + (c.total || 0), 0) + factPend.reduce((a, f) => a + (f.monto || 0), 0) + proyPorCobrar.reduce((a, e) => a + (e.venta || 0), 0)
  const saldoProy = totalEntrar - totalPagar

  // ===== RESUMEN FINANCIERO TOTAL (montos con IVA / bruto) =====
  const brutoF = f => { const n = f.neto || 0; return n + Math.round(n * 0.19) }
  const noPagada = f => f.estado !== 'Pagado' && f.estado !== 'Anulada'
  const esPagada = f => f.estado === 'Pagado'
  const facBrutoArea = (a, filtro) => (facturas[a] || []).filter(filtro).reduce((s, f) => s + brutoF(f), 0)
  // Cuentas por cobrar (bruto): facturas no pagadas de las tres áreas
  const cxcTotal = areasFact.reduce((s, a) => s + facBrutoArea(a, noPagada), 0)
  // Cuentas por pagar (bruto): gastos + cuotas + facturas de proveedores pendientes
  const cxpTotal = gastosPend.reduce((a, g) => a + ((g.neto || 0) + (g.iva || 0)), 0) + cuotasPend.reduce((a, c) => a + (c.total || 0), 0) + porPagarDocs.reduce((a, d) => a + d.monto, 0)
  // OT en curso por facturar: OT (SR/Istria) + saldo de proyectos vs presupuesto
  const meOT = o => (o.montoCotizado > 0 ? o.montoCotizado : (o.ventas || []).reduce((x, v) => x + (v.neta || 0), 0))
  const otEnCurso = (ots || []).filter(o => ['Cotizada', 'En ejecución', 'Terminada'].includes(o.estado)).reduce((a, o) => a + meOT(o), 0)
  const facturadoDeP = p => (p.edps || []).reduce((a, e) => a + (e.venta || 0), 0)
  const proyPorFacturar = (proyectos || []).reduce((a, p) => a + ((p.presupuesto > 0) ? Math.max(0, p.presupuesto - facturadoDeP(p)) : 0), 0)
  const otEnCursoTotal = otEnCurso + proyPorFacturar
  // Caja = saldo inicial + cobros registrados − pagos registrados (desde Finanzas/Pagos)
  const cobrosReg = (pp.cobros || []).filter(c => c.estado === 'Cobrado' || c.estado === 'Pagado').reduce((a, c) => a + (c.total || 0), 0)
  const pagosReg = (fin.gastos || []).filter(g => g.estado === 'Pagado').reduce((a, g) => a + ((g.neto || 0) + (g.iva || 0)), 0)
    + (fin.obligaciones || []).flatMap(o => o.cuotas || []).filter(c => c.estado === 'Pagada').reduce((a, c) => a + (c.total || 0), 0)
    + (pp.docs || []).flatMap(d => d.pagos || []).reduce((a, p) => a + (p.monto || 0), 0)
  const caja = (pp.saldoInicial || 0) + cobrosReg - pagosReg
  const posicionFin = caja + cxcTotal - cxpTotal + otEnCursoTotal
  // % factorizado sobre venta neta total
  const netoFactTotal = areasFact.reduce((s, a) => s + (facturas[a] || []).filter(f => f.estado === 'Factoring' || /factor/i.test(f.medio || '')).reduce((x, f) => x + (f.neto || 0), 0), 0)
  const netoTotalFact = areasFact.reduce((s, a) => s + facNeto(a), 0)
  const pctFactorizado = netoTotalFact > 0 ? (netoFactTotal / netoTotalFact * 100) : 0
  // Cuentas por pagar atribuidas a un área (para el resumen por módulo)
  const pagarArea = a => {
    const g = (fin.gastos || []).filter(x => x.estado !== 'Pagado' && x.estado !== 'Anulado').reduce((s, x) => s + ((x.neto || 0) + (x.iva || 0)) * (((x.dist || []).find(d => d.area === a) || {}).pct || 0) / 100, 0)
    const doc = (pp.docs || []).filter(d => !d.anulado && d.area === a).reduce((s, d) => s + Math.max(0, (d.total || 0) - (d.pagos || []).reduce((x, p) => x + (p.monto || 0), 0)), 0)
    const cuo = (fin.obligaciones || []).flatMap(o => (o.cuotas || []).filter(c => c.estado !== 'Pagada').map(c => ({ c, o }))).reduce((s, { c, o }) => s + (c.total || 0) * (((o.dist || []).find(d => d.area === a) || {}).pct || 0) / 100, 0)
    return g + doc + cuo
  }
  // Recuadro reutilizable: resumen financiero de un área
  const resumenFinancieroArea = a => {
    const venta = facNeto(a), cobradoA = facBrutoArea(a, esPagada), porCobrarA = facBrutoArea(a, noPagada), porPagarA = pagarArea(a)
    const resultadoA = porCobrarA - porPagarA
    const it = (l, v, c) => (<div><div style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>{l}</div><div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 20, fontWeight: 600, color: c || C.carbon, whiteSpace: 'nowrap' }}>{clp(v)}</div></div>)
    return (
      <div style={{ background: '#fff', border: '1px solid #E2DED4', borderTop: `4px solid ${AREA_COLOR[a] || C.teal}`, marginBottom: 16 }}>
        <div style={{ padding: '14px 18px 6px', fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase' }}>Resumen financiero · {a}</div>
        <div style={{ padding: '0 18px 16px', display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {it('Venta neta', venta, C.azul)}
          {it('Cobrado', cobradoA, C.verde)}
          {it('Por cobrar', porCobrarA, C.rojo)}
          {it('Por pagar', porPagarA, C.ambar)}
          {it('Resultado (por cobrar − por pagar)', resultadoA, resultadoA >= 0 ? C.verde : C.rojo)}
        </div>
      </div>
    )
  }

  const flujoItem = (label, valor, color) => (
    <div>
      <div style={{ fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 600, color: color || '#161616', whiteSpace: 'nowrap' }}>{valor}</div>
    </div>
  )

  const nombreTab = t => t === 'ASESOR' ? 'Asesor IA' : t === 'TODAS' ? 'Consolidado' : t === 'GESTION_PROYECTOS' ? 'Proyectos' : t === 'GESTION_OT' ? '🔧 Órdenes de Trabajo' : t === 'ASISTENCIA' ? '👷 Asistencia' : t === 'FINANZAS' ? '💰 Finanzas' : t === 'PAGOS' ? '💵 Proveedores y Pagos' : t === 'ORDENES_COMPRA' ? '🧾 Órdenes de Compra' : t === 'TRAZABILIDAD' ? '🔗 Trazabilidad y Alertas' : t === 'INVENTARIO' ? '📦 Inventario' : t === 'PARAMETROS' ? '🧮 Parámetros' : t === 'CLIENTES' ? '🏢 Resumen ventas por cliente' : t === 'CONTACTOS' ? '📇 Clientes y Proveedores' : t === 'COTIZADOR' ? '📋 Cotizaciones' : t === 'PRODUCCION' ? '🏭 Producción' : t === 'COMPRAS_OP' ? '🛒 Compras Operativas' : t === 'LIBRO_COMPRAS' ? 'Libro de Compras' : t === 'LIBRO_VENTAS' ? 'Libro de Ventas' : t

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: THEME.bg, fontFamily: THEME.font }}>
      <GlobalStyles />
      <Sidebar tabs={tabs} areaSel={areaSel} setAreaSel={setAreaSel} nombreTab={nombreTab} perfil={perfil} email={email} onLogout={onLogout} colapsado={sidebarColapsado} setColapsado={setSidebarColapsado} onReset={borrarDatosLocales} />

      <main style={{ flex: 1, minWidth: 0, height: '100vh', overflowY: 'auto' }}>
      <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
              <PageHeader titulo={nombreTab(areaSel)} perfil={perfil} email={email} />
        {esModuloAsesor && puedeVer('ASESOR') ? (<AsesorModule fin={fin} pp={pp} proyectos={proyectos} ots={ots} params={params} onIr={setAreaSel} />) : esModuloLibroCompras ? (<LibroComprasModule esGerencia={esGerencia} ots={ots} factoringList={params.factoring || []} />) : esModuloLibroVentas ? (<LibroVentasModule ots={ots} />) : esModuloProyectos ? (
          <>
          {resumenFinancieroArea('Proyectos')}
          <ProyectosModule proyectos={proyectos} setProyectos={setProyectos} params={params} facturas={facturas} setFacturas={setFacturas} comisionPct={comisiones['Proyectos'] ?? 2} setComisionPct={v => setComisiones(c => ({ ...c, Proyectos: v }))} ppmPct={ppmPct} setPpmPct={setPpmPct} clientesSugeridos={nombresClientes(contactos)} />
          </>
        ) : esModuloOT ? (
          <OTModule areasPermitidas={areasOTUsuario} ots={ots} setOts={setOts} verValores={verValoresOT} clientes={contactos.clientes || []} ordenesCompra={pp.ocs || []} mo={mo} instrumentos={params.instrumentos} />
        ) : esModuloComprasOp ? (
          <ComprasOperativasModule
            esGerencia={esGerencia}
            planta={esSupervisor ? areasUsuario[0] : null}
            usuario={perfil.nombre || email}
            ots={ots}
            proyectos={proyectos}
            mo={mo}
            comprasOp={comprasOp}
            setComprasOp={setComprasOp}
            config={configCompras}
            setConfig={setConfigCompras}
          />
        ) : esModuloProd ? (
          <ProduccionModule
            esGerencia={esGerencia}
            plantaFija={esSupervisor ? areasUsuario[0] : null}
            plantasVisibles={esGerencia ? ['Santa Rosa', 'Istria'] : areasUsuario.filter(a => a === 'Santa Rosa' || a === 'Istria')}
            ots={ots}
            avances={avances}
            setAvances={setAvances}
            usuario={email}
            mo={mo}
          />
        ) : esModuloCot ? (
          <CotizacionesModule cotizaciones={cotizaciones} setCotizaciones={setCotizaciones} ots={ots} setOts={setOts} clientes={contactos.clientes || []} onAddCliente={cli => { const nuevoCli = { id: 'cf' + Date.now(), estado: 'Activo', giro: '', direccion: '', comuna: '', vendedor: '', ...cli }; setContactos(prev => ({ ...prev, clientes: [nuevoCli, ...(prev.clientes || [])] })); setClientes(prev => [nuevoCli, ...(prev || [])]) }} />
        ) : esModuloFin && puedeVer('FINANZAS') ? (
          <FinanzasModule otsDisponibles={ots.map(o => o.numero)} fin={fin} setFin={setFin} />
        ) : esModuloPagos && puedeVer('PAGOS') ? (
          <ProveedoresPagosModule pp={pp} setPp={setPp} gastos={fin.gastos || []} />
        ) : esModuloOC && puedeVer('ORDENES_COMPRA') ? (
          <OrdenesCompraModule pp={pp} setPp={setPp} ots={ots} />
        ) : esModuloTraza && puedeVer('TRAZABILIDAD') ? (
          <TrazabilidadModule cotizaciones={cotizaciones} ots={ots} ordenesCompra={pp.ocs || []} />
        ) : (areaSel === 'INVENTARIO') ? (
          <InventarioModule inventario={inventario} setInventario={setInventario} movimientos={invMov} setMovimientos={setInvMov} usuario={email} />
        ) : esModuloParams && puedeVer('PARAMETROS') ? (
          <ParametrosModule params={params} setParams={setParams} />
        ) : esModuloClientes ? (
          <ClientesModule clientes={clientes} setClientes={setClientes} proyectos={proyectos} ots={ots} />
        ) : esModuloContactos ? (
          <ContactosModule contactos={contactos} setContactos={setContactos} />
        ) : esModuloMO ? (
          <ManoObraModule
            esGerencia={esGerencia && !sinValores.includes('ASISTENCIA')}
            otsDisponibles={ots.map(o => o.numero)}
            usuario={email}
            mo={mo} setMo={setMo}
            areas={esSupervisor || !esGerencia ? areasUsuario : ['Santa Rosa', 'Istria', 'Proyectos']}
          />
        ) : (
        <>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <Kpi label="Venta Neta" valor={clp(kVenta)} sub={`${kNFact} facturas`} color={C.azul} icon={TrendingUp} />
          <Kpi label="Cobrado" valor={clp(kCobrado)} sub={`${((kCobrado / ((kCobrado + kPend) || 1)) * 100).toFixed(0)}% de la cartera`} color={C.verde} icon={Wallet} />
          <Kpi label="Por Cobrar" valor={clp(kPend)} sub="pendiente" color={C.rojo} icon={AlertTriangle} />
          <Kpi label="Pérdida Factoring" valor={clp(kPerd)} sub={kVenta > 0 ? `${((kPerd / kVenta) * 100).toFixed(2)}% s/ venta` : '—'} color={C.ambar} icon={Landmark} />
          {esGerencia && <Kpi label="Carga financiera" valor={clp(calcularResumenFin(fin, new Date().toISOString().slice(0, 7)).deudaVigente)} sub="deuda total propia" color="#061A40" icon={Landmark} />}
            {esTODAS && <Kpi label="% Factorizado" valor={`${pctFactorizado.toFixed(1)}%`} sub={`${clp(netoFactTotal)} de ${clp(netoTotalFact)}`} color={C.teal} icon={Landmark} />}
        </div>

        {esGerencia && areaSel === 'TODAS' && (<ConsolidadoModule cc={{ caja, cxcTotal, cxpTotal, otEnCursoTotal, posicionFin, totalPagar, pagar7, totalEntrar, saldoProy, netoFactTotal, netoTotalFact, pctFactorizado, kVenta, kCobrado, kPend, kPerd, rentab, utilidad: vista.utilidad }} facturas={facturas} ots={ots} proyectos={proyectos} cotizaciones={cotizaciones} clientes={clientes} params={params} fin={fin} pp={pp} ppmPct={ppmPct} onIr={setAreaSel} />)}
            {false && esGerencia && areaSel === 'TODAS' && (
          <>
            <div style={{ background: '#fff', border: '1px solid #E2DED4', borderTop: `4px solid ${C.verde}`, marginBottom: 16 }}>
              <div style={{ padding: '14px 18px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase' }}>📊 Resumen financiero total</span>
                <span style={{ fontSize: 11, color: '#7A8288' }}>caja + por cobrar − por pagar + OT en curso · montos con IVA</span>
              </div>
              <div style={{ padding: '0 18px 16px', display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {flujoItem('Caja', clp(caja), caja >= 0 ? C.verde : C.rojo)}
                {flujoItem('Cuentas por cobrar', clp(cxcTotal), C.azul)}
                {flujoItem('Cuentas por pagar', clp(cxpTotal), C.rojo)}
                {flujoItem('OT en curso (por facturar)', clp(otEnCursoTotal), C.ambar)}
                <div style={{ borderLeft: '2px solid #E2DED4', paddingLeft: 20 }}>
                  {flujoItem('Posición financiera', clp(posicionFin), posicionFin >= 0 ? C.verde : C.rojo)}
                </div>
              </div>
            </div>

            <ResumenModulos ots={ots} proyectos={proyectos} />

            <ResumenFinancieroCard fin={fin} onIr={() => setAreaSel('FINANZAS')} />
            <div style={{ background: '#fff', border: '1px solid #E2DED4', borderTop: `4px solid ${C.verde}`, marginBottom: 16 }}>
              <div style={{ padding: '14px 18px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase' }}>💵 Flujo de caja proyectado · todas las áreas</span>
                <span style={{ fontSize: 11, color: '#7A8288' }}>pagos: gastos + cuotas + proveedores · ingresos: cobros + facturas por cobrar</span>
              </div>
              <div style={{ padding: '0 18px 16px', display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {flujoItem('Total a pagar', clp(totalPagar), C.rojo)}
                {flujoItem('Vence en 7 días', clp(pagar7), C.ambar)}
                {flujoItem('Total a entrar', clp(totalEntrar), C.verde)}
                {flujoItem('Saldo proyectado', clp(saldoProy), saldoProy >= 0 ? C.verde : C.rojo)}
              </div>
            </div>
          </>
        )}

        {(areaSel === 'Santa Rosa' || areaSel === 'Istria') && resumenFinancieroArea(areaSel)}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
          <div style={{ gridColumn: 'span 1' }}>
            <Panel title={`Venta neta por mes · ${areaSel === 'TODAS' ? 'consolidado' : areaSel}`}>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={mesesVista} margin={{ left: 4, right: 8 }}>
                  <CartesianGrid stroke="#EEE9DF" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#7A8288' }} />
                  <YAxis tickFormatter={v => `${Math.round(v / 1e6)}M`} tick={{ fontSize: 11, fill: '#7A8288' }} />
                  <Tooltip formatter={v => clp(v)} />
                  <Line type="monotone" dataKey="total" name="Venta neta" stroke={areaSel === 'TODAS' ? C.azul : AREA_COLOR[areaSel]} strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <Panel title="Estado facturas">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
              {estados.map(([est, n]) => {
                const col = est === 'Pagado' ? C.verde : est === 'Pendiente' ? C.rojo : est === 'Factoring' ? C.ambar : '#9AA0A6'
                return (
                  <div key={est}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span>{est}</span><span style={{ fontWeight: 600, color: col }}>{n}</span>
                    </div>
                    <div style={{ height: 8, background: '#EEE9DF' }}>
                      <div style={{ width: `${(n / totalEst) * 100}%`, height: '100%', background: col }} />
                    </div>
                  </div>
                )
              })}
              <div style={{ borderTop: '1px solid #EEE9DF', paddingTop: 10, marginTop: 4, fontSize: 13, color: '#7A8288' }}>
                Rentabilidad estimada: <b style={{ color: C.carbon }}>{rentab.toFixed(1)}%</b>
              </div>
            </div>
          </Panel>
        </div>

        {esGerencia && areaSel === 'TODAS' && (
          <div style={{ marginBottom: 16 }}>
            <Panel title="Venta por área (facturas)">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={ventaAreaLive} margin={{ left: 4 }}>
                  <CartesianGrid stroke="#EEE9DF" vertical={false} />
                  <XAxis dataKey="area" tick={{ fontSize: 11, fill: '#7A8288' }} />
                  <YAxis tickFormatter={v => `${Math.round(v / 1e6)}M`} tick={{ fontSize: 11, fill: '#7A8288' }} />
                  <Tooltip formatter={v => clp(v)} />
                  <Bar dataKey="venta" name="Venta neta">
                    {ventaAreaLive.map(d => <Cell key={d.area} fill={AREA_COLOR[d.area]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>
        )}

        {areaSel !== 'TODAS' && (
          <>
            <div style={{ marginBottom: 16 }}>
              <Panel title="Principales clientes">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {vista.topClientes.map((c, i) => {
                    const max = vista.topClientes[0].venta
                    return (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '62%' }}>{c.cliente}</span>
                          <span style={{ color: '#7A8288' }}>{clpM(c.venta)}</span>
                        </div>
                        <div style={{ height: 6, background: '#EEE9DF' }}>
                          <div style={{ width: `${(c.venta / max) * 100}%`, height: '100%', background: AREA_COLOR[areaSel] }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Panel>
            </div>

            <Panel title="Cobranza atrasada" right={<span style={{ fontSize: 12, color: C.rojo }}>{vista.atrasadas.length} facturas</span>}>
              {vista.atrasadas.length === 0 ? (
                <div style={{ color: C.verde, fontSize: 14, padding: '10px 0' }}>✓ Sin facturas atrasadas en esta área.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>Cliente</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>Pendiente</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>Días</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vista.atrasadas.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #EEE9DF' }}>
                          <td style={{ padding: 8 }}>{r.cliente}</td>
                          <td style={{ padding: 8, textAlign: 'right' }}>{clp(r.pendiente)}</td>
                          <td style={{ padding: 8, textAlign: 'right' }}>
                            <span style={{ background: r.dias > 30 ? '#F6E0DA' : '#F9E9DE', color: r.dias > 30 ? C.rojo : C.ambar, padding: '2px 8px', fontWeight: 600 }}>{r.dias}d</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </>
        )}
        {(areaSel === 'Santa Rosa' || areaSel === 'Istria') && (
          <FacturasModule area={areaSel} proyectos={proyectos} ots={ots} facturas={facturas} setFacturas={setFacturas} params={params} comisionPct={comisiones[areaSel] ?? 0} setComisionPct={v => setComisiones(c => ({ ...c, [areaSel]: v }))} ppmPct={ppmPct} setPpmPct={setPpmPct} clientesSugeridos={nombresClientes(contactos)} />
        )}
        </>
        )}

        <div style={{ textAlign: 'center', color: '#9AA0A6', fontSize: 11, marginTop: 20 }}>
          SEREIN SpA · Datos: VENTAS_SEREIN_SPA_2026
        </div>
      </div>
      </main>
    </div>
  )
}
