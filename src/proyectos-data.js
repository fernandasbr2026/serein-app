// ===== PROYECTOS REALES EXTRAÍDOS DE VENTAS_SEREIN_SPA_2026 (hoja Proyectos + Compras) =====
// presupuesto: null = aún no definido (lo defines tú en la app; es la base del margen objetivo)
// avance: % estimado editable

export const PROYECTOS = [
  {
    id: 'ttm-49078',
    nombre: 'Correas transportadoras · TTM',
    cliente: 'Tecnología En Transporte De Minerales S.A.',
    oc: 'S20A19-49078-0',
    presupuesto: null,
    avance: 75,
    compras: [
      { proveedor: 'OLYMPO', detalle: 'Materiales', fecha: '2026-02', monto: 3709629 },
      { proveedor: 'OLYMPO', detalle: 'Materiales', fecha: '2026-03', monto: 1890514 },
      { proveedor: 'OLYMPO', detalle: 'Materiales', fecha: '2026-05', monto: 1961915 },
    ],
    edps: [
      { edp: 'Saldo OC ant.', fecha: '2026-02-10', venta: 6159889, estado: 'Pagado' },
      { edp: 'EDP 1', fecha: '2026-02-26', venta: 28904178, estado: 'Pagado' },
      { edp: 'EDP 2', fecha: '2026-05-25', venta: 19269452, estado: 'Pagado' },
      { edp: 'EDP 3', fecha: '2026-06-19', venta: 28904178, estado: 'Pagado' },
    ],
  },
  {
    id: 'innovatec-fv',
    nombre: 'Sistema Fotovoltaico · INNOVATEC',
    cliente: 'INNOVATEC INGENIERÍA Y DESARROLLO SPA',
    oc: 'EDP 673',
    presupuesto: null,
    avance: 60,
    compras: [],
    edps: [
      { edp: 'EDP 673-1', fecha: '2026-04-21', venta: 3000000, estado: 'Pagado' },
      { edp: 'EDP 673-2', fecha: '2026-05-14', venta: 1125887, estado: 'Pendiente' },
      { edp: 'EDP 673-3', fecha: '2026-05-14', venta: 5624113, estado: 'Pendiente' },
      { edp: 'EDP 673-4', fecha: '2026-05-14', venta: 4387500, estado: 'Pendiente' },
      { edp: 'EDP 673-5', fecha: '2026-06-25', venta: 3361345, estado: 'Pendiente' },
      { edp: 'EDP 673-6', fecha: '2026-06-26', venta: 3388655, estado: 'Pendiente' },
    ],
  },
  {
    id: 'construcapital-21',
    nombre: 'Obra OC 21 · CONSTRUCAPITAL',
    cliente: 'INMOB. E INV. CONSTRUCAPITAL SPA',
    oc: 'OC 21 / EDP 603',
    presupuesto: null,
    avance: 85,
    compras: [],
    edps: [
      { edp: 'EDP 603-1', fecha: '2026-04-22', venta: 4300000, estado: 'Pendiente' },
      { edp: 'EDP 603-2', fecha: '2026-04-29', venta: 800000, estado: 'Pagado' },
      { edp: 'EDP 603-3', fecha: '2026-06-19', venta: 29541931, estado: 'Pendiente' },
    ],
  },
  {
    id: 'proases-2026',
    nombre: 'Servicios 2026 · PROASES',
    cliente: 'PROASES INGENIERÍA SPA',
    oc: 'OCs 5138–5247',
    presupuesto: null,
    avance: 90,
    compras: [],
    edps: [
      { edp: 'EDP 696', fecha: '2026-04-29', venta: 7444000, estado: 'Pagado' },
      { edp: 'EDP 696b', fecha: '2026-06-15', venta: 7780000, estado: 'Pagado' },
      { edp: 'EDP 709', fecha: '2026-06-26', venta: 5429000, estado: 'Pagado' },
      { edp: 'EDP 715', fecha: '2026-05-13', venta: 5860000, estado: 'Pagado' },
      { edp: 'EDP 718', fecha: '2026-05-19', venta: 7700000, estado: 'Pagado' },
      { edp: 'EDP 722', fecha: '2026-05-19', venta: 1545650, estado: 'Pagado' },
      { edp: 'EDP 730', fecha: '2026-05-19', venta: 6588118, estado: 'Pagado' },
      { edp: 'EDP 743', fecha: '2026-05-28', venta: 5440500, estado: 'Pagado' },
      { edp: 'EDP 744', fecha: '2026-06-26', venta: 2115690, estado: 'Pagado' },
    ],
  },
]
