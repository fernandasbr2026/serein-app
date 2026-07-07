// ===== PROYECTOS por OT (número de cotización) =====
// Modelo:
//   ot            → número de cotización autorizada
//   periodo       → agrupador del consolidado (T1, T2, Proyectos…)
//   m2            → metros cuadrados (opcional)
//   venta_cotizada→ venta neta de la cotización (base de "por facturar")
//   cc            → presupuesto (tope) por centro de costo: A1..A6
//   edps          → ventas / estados de pago (facturación real)
//   compras       → compras imputadas; cada una con su cc, folio y rut
// CC (fijos, calcados del consolidado):
//   A1 Pintura · A2 Diluyente · A3 Insumos · A4 Otras HH · A5 Viáticos · A6 Fijos globales

export const CC_DEFS = [
  { id: 'A1', nombre: 'Pintura' },
  { id: 'A2', nombre: 'Diluyente' },
  { id: 'A3', nombre: 'Insumos' },
  { id: 'A4', nombre: 'Otras HH' },
  { id: 'A5', nombre: 'Viáticos' },
  { id: 'A6', nombre: 'Fijos globales' },
]

export const PROYECTOS = [
  // ---------- OT de Servicio Pintura MV 2026 (T1) ----------
  {
    id: 'ot-633', ot: '633', periodo: 'T1', nombre: 'OT 633 · DEALTEC CHILE SPA', cliente: 'DEALTEC CHILE SPA', m2: 76,
    oc: '633', venta_cotizada: 1197300, avance: 0,
    cc: { A1: 306000, A2: 30000, A3: 30000, A4: 0, A5: 0, A6: 471200 },
    edps: [], compras: [],
  },
  {
    id: 'ot-641', ot: '641', periodo: 'T1', nombre: 'OT 641 · VIMAN', cliente: 'VIMAN', m2: 789,
    oc: '641', venta_cotizada: 13765100, avance: 0,
    cc: { A1: 4810533, A2: 240527, A3: 96211, A4: 0, A5: 0, A6: 4767800 },
    edps: [], compras: [],
  },
  {
    id: 'ot-651', ot: '651', periodo: 'T1', nombre: 'OT 651 · ESIGSA', cliente: 'ESIGSA', m2: 206,
    oc: '651', venta_cotizada: 5500000, avance: 0,
    cc: { A1: 2300000, A2: 115000, A3: 46000, A4: 420000, A5: 0, A6: 1277200 },
    edps: [], compras: [],
  },
  {
    id: 'ot-663', ot: '663', periodo: 'T1', nombre: 'OT 663 · VERTICAL INGENIERIA', cliente: 'VERTICAL INGENIERIA', m2: 16,
    oc: '663', venta_cotizada: 743750, avance: 0,
    cc: { A1: 247917, A2: 30000, A3: 30000, A4: 0, A5: 0, A6: 99200 },
    edps: [], compras: [],
  },
  {
    id: 'ot-683', ot: '683', periodo: 'T1', nombre: 'OT 683 · MAESTRANZA MYG', cliente: 'MAESTRANZA MYG', m2: 125,
    oc: '683', venta_cotizada: 4093750, avance: 0,
    cc: { A1: 1364583, A2: 68229, A3: 40938, A4: 0, A5: 0, A6: 775000 },
    edps: [], compras: [],
  },
  {
    id: 'ot-694', ot: '694', periodo: 'T1', nombre: 'OT 694 · VIMAN', cliente: 'VIMAN', m2: 1600,
    oc: '694', venta_cotizada: 28000000, avance: 0,
    cc: { A1: 10000000, A2: 500000, A3: 300000, A4: 0, A5: 0, A6: 9920000 },
    edps: [], compras: [],
  },
  {
    id: 'ot-695', ot: '695', periodo: 'T1', nombre: 'OT 695 · CLAUDIA SOTO', cliente: 'CLAUDIA SOTO', m2: null,
    oc: '695', venta_cotizada: 8900000, avance: 0,
    cc: { A1: 1920000, A2: 0, A3: 0, A4: 1600000, A5: 1140000, A6: 620000 },
    edps: [], compras: [],
  },

  // ---------- Proyectos grandes (área Proyectos) — se mantienen ----------
  {
    id: 'ttm-49078', ot: '49078', periodo: 'Proyectos',
    nombre: 'Correas transportadoras · TTM',
    cliente: 'Tecnología En Transporte De Minerales S.A.',
    oc: 'S20A19-49078-0', venta_cotizada: null, avance: 75,
    cc: {},
    compras: [
      { proveedor: 'OLYMPO', detalle: 'Materiales', fecha: '2026-02', monto: 3709629, cc: 'A3', folio: '', rut: '' },
      { proveedor: 'OLYMPO', detalle: 'Materiales', fecha: '2026-03', monto: 1890514, cc: 'A3', folio: '', rut: '' },
      { proveedor: 'OLYMPO', detalle: 'Materiales', fecha: '2026-05', monto: 1961915, cc: 'A3', folio: '', rut: '' },
    ],
    edps: [
      { edp: 'Saldo OC ant.', fecha: '2026-02-10', venta: 6159889, estado: 'Pagado' },
      { edp: 'EDP 1', fecha: '2026-02-26', venta: 28904178, estado: 'Pagado' },
      { edp: 'EDP 2', fecha: '2026-05-25', venta: 19269452, estado: 'Pagado' },
      { edp: 'EDP 3', fecha: '2026-06-19', venta: 28904178, estado: 'Pagado' },
    ],
  },
  {
    id: 'innovatec-fv', ot: '673', periodo: 'Proyectos',
    nombre: 'Sistema Fotovoltaico · INNOVATEC',
    cliente: 'INNOVATEC INGENIERÍA Y DESARROLLO SPA',
    oc: 'EDP 673', venta_cotizada: null, avance: 60,
    cc: {}, compras: [],
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
    id: 'construcapital-21', ot: 'OC21', periodo: 'Proyectos',
    nombre: 'Obra OC 21 · CONSTRUCAPITAL',
    cliente: 'INMOB. E INV. CONSTRUCAPITAL SPA',
    oc: 'OC 21 / EDP 603', venta_cotizada: null, avance: 85,
    cc: {}, compras: [],
    edps: [
      { edp: 'EDP 603-1', fecha: '2026-04-22', venta: 4300000, estado: 'Pendiente' },
      { edp: 'EDP 603-2', fecha: '2026-04-29', venta: 800000, estado: 'Pagado' },
      { edp: 'EDP 603-3', fecha: '2026-06-19', venta: 29541931, estado: 'Pendiente' },
    ],
  },
  {
    id: 'proases-2026', ot: '5138', periodo: 'Proyectos',
    nombre: 'Servicios 2026 · PROASES',
    cliente: 'PROASES INGENIERÍA SPA',
    oc: 'OCs 5138–5247', venta_cotizada: null, avance: 90,
    cc: {}, compras: [],
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
