import React, { useState, useMemo } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { LogOut, TrendingUp, Wallet, AlertTriangle, Landmark, User } from 'lucide-react'
import { DATA } from './data.js'
import LogoSerein from './LogoSerein.jsx'
import ProyectosModule from './ProyectosModule.jsx'
import OTModule, { OTS_INICIALES } from './OTModule.jsx'
import PipelineOT from './PipelineOT.jsx'
import PipelineProyectos from './PipelineProyectos.jsx'
import ManoObraModule from './ManoObraModule.jsx'
import FinanzasModule, { FIN_SEED, calcularResumenFin } from './FinanzasModule.jsx'
import CotizadorModule from './CotizadorModule.jsx'
import ProduccionModule, { AVANCES_SEED } from './ProduccionModule.jsx'
import ComprasOperativasModule, { COMPRAS_OP_SEED, CONFIG_COMPRAS_DEFAULT } from './ComprasOperativasModule.jsx'
import ProveedoresPagosModule, { PP_SEED } from './ProveedoresPagosModule.jsx'
import ParametrosModule, { PARAMS_SEED } from './ParametrosModule.jsx'
import ClientesModule, { CLIENTES_SEED } from './ClientesModule.jsx'
import FacturasModule, { FACTURAS_SEED } from './FacturasModule.jsx'
import { MO_SEED } from './ManoObraModule.jsx'
import { PROYECTOS } from './proyectos-data.js'

const C = { azul: '#1D1D1B', teal: '#A8501F', ambar: '#D2642F', rojo: '#B5432E', verde: '#3D7A4E', carbon: '#161616', niebla: '#F6F0EA' }
const AREA_COLOR = { 'Santa Rosa': '#A8501F', 'Proyectos': '#D2642F', 'Istria': '#1D1D1B' }
const clp = n => '$' + Math.round(n).toLocaleString('es-CL')
const clpM = n => '$' + Math.round(n / 1000000).toLocaleString('es-CL') + 'M'

function Kpi({ label, valor, sub, color, icon: Icon }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 16, flex: '1 1 180px', minWidth: 0 }}>
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
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18, minWidth: 0 }}>
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

export default function Dashboard({ perfil, email, onLogout }) {
  const areasUsuario = perfil.areas || []
  const esGerencia = areasUsuario.length > 1 && perfil.tipo !== 'supervisor'
  const esSupervisor = perfil.tipo === 'supervisor'
  const tieneProyectos = areasUsuario.includes('Proyectos')
  const areasOT = areasUsuario.filter(a => a === 'Santa Rosa' || a === 'Istria')
  const tabs = esSupervisor ? ['PRODUCCION', 'COMPRAS_OP', 'ASISTENCIA'] : [
    ...(esGerencia ? ['TODAS'] : []),
    ...areasUsuario.filter(a => a !== 'Proyectos'),
    ...(areasOT.length > 0 ? ['GESTION_OT'] : []),
    ...(tieneProyectos ? ['GESTION_PROYECTOS'] : []),
    'CLIENTES',
    'COTIZADOR',
    ...(areasOT.length > 0 || esGerencia ? ['PRODUCCION'] : []),
    ...(esGerencia ? ['COMPRAS_OP'] : []),
    'ASISTENCIA',
    ...(esGerencia ? ['FINANZAS'] : []),
    ...(esGerencia ? ['PAGOS'] : []),
    ...(esGerencia ? ['PARAMETROS'] : []),
  ]
  const [areaSel, setAreaSel] = useState(tabs[0])

  const esModuloProyectos = areaSel === 'GESTION_PROYECTOS'
  const esModuloOT = areaSel === 'GESTION_OT'
  const esModuloMO = areaSel === 'ASISTENCIA'
  const esModuloFin = areaSel === 'FINANZAS'
  const esModuloPagos = areaSel === 'PAGOS'
  const esModuloParams = areaSel === 'PARAMETROS'
  const esModuloClientes = areaSel === 'CLIENTES'
  const esModuloCot = areaSel === 'COTIZADOR'
  const esModuloProd = areaSel === 'PRODUCCION'
  const [avances, setAvances] = useState(AVANCES_SEED)
  const [mo, setMo] = useState(MO_SEED)
  const esModuloComprasOp = areaSel === 'COMPRAS_OP'
  const [comprasOp, setComprasOp] = useState(COMPRAS_OP_SEED)
  const [configCompras, setConfigCompras] = useState(CONFIG_COMPRAS_DEFAULT)
  const [fin, setFin] = useState(FIN_SEED)
  const [pp, setPp] = useState(PP_SEED)
  const [params, setParams] = useState(PARAMS_SEED)
  const [clientes, setClientes] = useState(CLIENTES_SEED)
  const [facturas, setFacturas] = useState(FACTURAS_SEED)
  const [ots, setOts] = useState(OTS_INICIALES)
  const [proyectos, setProyectos] = useState(PROYECTOS)
  const vista = useMemo(() => (esGerencia && areaSel === 'TODAS') ? DATA.global : (DATA.areas[areaSel] || DATA.global), [areaSel, esGerencia])
  const rentab = vista.venta > 0 ? (vista.utilidad / vista.venta) * 100 : 0

  const mesesVista = useMemo(() => DATA.meses.map(m => ({
    mes: m.mes.slice(0, 3),
    total: (esGerencia && areaSel === 'TODAS') ? m['Santa Rosa'] + m.Proyectos + m.Istria : (m[areaSel] ?? 0),
  })), [areaSel, esGerencia])

  const estados = Object.entries(vista.estados || {})
  const totalEst = estados.reduce((a, [, n]) => a + n, 0) || 1

  const nombreTab = t => t === 'TODAS' ? 'Consolidado' : t === 'GESTION_PROYECTOS' ? '⚙ Gestión Proyectos' : t === 'GESTION_OT' ? '🔧 Órdenes de Trabajo' : t === 'ASISTENCIA' ? '👷 Asistencia' : t === 'FINANZAS' ? '💰 Finanzas' : t === 'PAGOS' ? '💵 Proveedores y Pagos' : t === 'PARAMETROS' ? '🧮 Parámetros' : t === 'CLIENTES' ? '🏢 Clientes' : t === 'COTIZADOR' ? '📋 Cotizaciones' : t === 'PRODUCCION' ? '🏭 Producción' : t === 'COMPRAS_OP' ? '🛒 Compras Operativas' : t

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.niebla, fontFamily: "'Inter',sans-serif" }}>
      <aside style={{ width: 234, flexShrink: 0, background: C.carbon, display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #2A2F33' }}>
          <LogoSerein alto={30} oscuro />
          <div style={{ color: '#6B747A', fontSize: 11, letterSpacing: 1, marginTop: 6 }}>PANEL 2026</div>
        </div>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #2A2F33', color: '#B8C0C6', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <User size={15} />
          <div style={{ minWidth: 0 }}>
            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{perfil.nombre || email}</div>
            <div style={{ color: '#6B747A', fontSize: 11 }}>{perfil.rol}</div>
          </div>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setAreaSel(t)}
              style={{ display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left', background: areaSel === t ? '#22282C' : 'transparent', border: 'none', borderLeft: areaSel === t ? `3px solid ${C.ambar}` : '3px solid transparent', color: areaSel === t ? '#fff' : '#9AA0A6', padding: '11px 16px', cursor: 'pointer', fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 12.5, letterSpacing: 0.4, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              {nombreTab(t)}
            </button>
          ))}
        </nav>
        <button onClick={onLogout} style={{ margin: 16, background: 'transparent', border: '1px solid #3A4045', color: '#B8C0C6', padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}>
          <LogOut size={13} /> Salir
        </button>
      </aside>

      <main style={{ flex: 1, minWidth: 0, height: '100vh', overflowY: 'auto' }}>
      <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
        {esModuloProyectos ? (
          <ProyectosModule proyectos={proyectos} setProyectos={setProyectos} params={params} />
        ) : esModuloOT ? (
          <OTModule areasPermitidas={areasOT} ots={ots} setOts={setOts} />
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
          <CotizadorModule areasPermitidas={areasUsuario} ots={ots} setOts={setOts} />
        ) : esModuloFin && esGerencia ? (
          <FinanzasModule otsDisponibles={ots.map(o => o.numero)} fin={fin} setFin={setFin} />
        ) : esModuloPagos && esGerencia ? (
          <ProveedoresPagosModule pp={pp} setPp={setPp} />
        ) : esModuloParams && esGerencia ? (
          <ParametrosModule params={params} setParams={setParams} />
        ) : esModuloClientes ? (
          <ClientesModule clientes={clientes} setClientes={setClientes} proyectos={proyectos} ots={ots} />
        ) : esModuloMO ? (
          <ManoObraModule
            esGerencia={esGerencia}
            otsDisponibles={ots.map(o => o.numero)}
            usuario={email}
            mo={mo} setMo={setMo}
            areas={esSupervisor || !esGerencia ? areasUsuario : ['Santa Rosa', 'Istria', 'Proyectos']}
          />
        ) : (
        <>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <Kpi label="Venta Neta" valor={clp(vista.venta)} sub={`${vista.nFacturas} facturas`} color={C.azul} icon={TrendingUp} />
          <Kpi label="Cobrado" valor={clp(vista.cobrado)} sub={`${((vista.cobrado / (vista.cobrado + vista.pendiente)) * 100).toFixed(0)}% de la cartera`} color={C.verde} icon={Wallet} />
          <Kpi label="Por Cobrar" valor={clp(vista.pendiente)} sub="pendiente con IVA" color={C.rojo} icon={AlertTriangle} />
          <Kpi label="Pérdida Factoring" valor={clp(vista.perdidaFact)} sub={`${((vista.perdidaFact / vista.venta) * 100).toFixed(2)}% s/ venta`} color={C.ambar} icon={Landmark} />
        </div>

        {esGerencia && areaSel === 'TODAS' && (
          <>
            <PipelineOT ots={ots.filter(o => o.area === 'Santa Rosa' || o.area === 'Istria')} />
            <PipelineProyectos proyectos={proyectos} />
            <ResumenFinancieroCard fin={fin} onIr={() => setAreaSel('FINANZAS')} />
          </>
        )}

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
            <Panel title="Venta por área">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={areasUsuario.map(a => ({ area: a, venta: DATA.areas[a].venta }))} margin={{ left: 4 }}>
                  <CartesianGrid stroke="#EEE9DF" vertical={false} />
                  <XAxis dataKey="area" tick={{ fontSize: 11, fill: '#7A8288' }} />
                  <YAxis tickFormatter={v => `${Math.round(v / 1e6)}M`} tick={{ fontSize: 11, fill: '#7A8288' }} />
                  <Tooltip formatter={v => clp(v)} />
                  <Bar dataKey="venta" name="Venta neta">
                    {areasUsuario.map(a => <Cell key={a} fill={AREA_COLOR[a]} />)}
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
          <FacturasModule area={areaSel} facturas={facturas} setFacturas={setFacturas} />
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
