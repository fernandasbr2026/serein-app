// ===== DATOS EXTRAÍDOS DE VENTAS_SEREIN_SPA_2026.xlsm (CLP) =====
// Fase 2: estos datos se moverán a la base de datos y se actualizarán subiendo el Excel.
export const DATA = {
  meses: [
    { mes: 'Enero', 'Santa Rosa': 2507330, Proyectos: 0, Istria: 82404863 },
    { mes: 'Febrero', 'Santa Rosa': 35475491, Proyectos: 35064067, Istria: 79944203 },
    { mes: 'Marzo', 'Santa Rosa': 17697550, Proyectos: 0, Istria: 101836875 },
    { mes: 'Abril', 'Santa Rosa': 39293472, Proyectos: 22988000, Istria: 50363260 },
    { mes: 'Mayo', 'Santa Rosa': 39778395, Proyectos: 79234988, Istria: 47288008 },
    { mes: 'Junio', 'Santa Rosa': 26795123, Proyectos: 95845489, Istria: 32334898 },
    { mes: 'Julio', 'Santa Rosa': 6865400, Proyectos: 0, Istria: 0 },
  ],
  areas: {
    'Santa Rosa': {
      venta: 222888274, cobrado: 214223399, pendiente: 42265014, utilidad: 222409050,
      perdidaFact: 299149, nFacturas: 106,
      estados: { Pagado: 82, Factoring: 2, Pendiente: 22 },
      topClientes: [
        { cliente: 'Viman', venta: 66541165 }, { cliente: 'IMMA', venta: 26874000 },
        { cliente: 'Ingomar', venta: 26423428 }, { cliente: 'Servicat', venta: 18818880 },
        { cliente: 'RM ingenieria', venta: 12775119 }, { cliente: 'CADM', venta: 11565000 },
        { cliente: 'Ingecoat', venta: 9070500 }, { cliente: 'Claudia Soto Rojas', venta: 8900000 },
      ],
      atrasadas: [
        { cliente: 'MYG', pendiente: 4871562, dias: 44 }, { cliente: 'Viman', pendiente: 428400, dias: 37 },
        { cliente: 'CADM', pendiente: 1499400, dias: 32 }, { cliente: 'RM ingenieria', pendiente: 1985415, dias: 29 },
        { cliente: 'CADM', pendiente: 3189200, dias: 25 }, { cliente: 'Viman', pendiente: 1411935, dias: 24 },
        { cliente: 'M. Los Libertadores', pendiente: 1498008, dias: 22 }, { cliente: 'CADM', pendiente: 4464880, dias: 15 },
        { cliente: 'RM ingenieria', pendiente: 1237080, dias: 11 }, { cliente: 'Viman', pendiente: 952000, dias: 8 },
      ],
    },
    'Proyectos': {
      venta: 233132544, cobrado: 241744767, pendiente: 35682960, utilidad: 229179451,
      perdidaFact: 3953093, nFacturas: 30,
      estados: { Pagado: 23, Pendiente: 7 },
      topClientes: [
        { cliente: 'PROASES INGENIERIA SPA', venta: 88924916 },
        { cliente: 'Tec. Transporte De Minerales S.A.', venta: 83237697 },
        { cliente: 'INMOB. CONSTRUCAPITAL SP', venta: 34641931 },
        { cliente: 'INNOVATEC INGENIERIA SPA', venta: 20887500 },
        { cliente: 'PROASES INGENIERIA SPA 743', venta: 5440500 },
      ],
      atrasadas: [
        { cliente: 'INMOB. CONSTRUCAPITAL SP', pendiente: 102340, dias: 71 },
        { cliente: 'INNOVATEC INGENIERIA SPA', pendiente: 133854, dias: 49 },
        { cliente: 'INNOVATEC INGENIERIA SPA', pendiente: 104422, dias: 49 },
        { cliente: 'INNOVATEC INGENIERIA SPA', pendiente: 26796, dias: 49 },
        { cliente: 'INNOVATEC INGENIERIA SPA', pendiente: 80000, dias: 8 },
        { cliente: 'INNOVATEC INGENIERIA SPA', pendiente: 80650, dias: 7 },
      ],
    },
    'Istria': {
      venta: 454339863, cobrado: 58830193, pendiente: 38478529, utilidad: 446298069,
      perdidaFact: 8041796, nFacturas: 109,
      estados: { Pagado: 100, 'Sin estado': 9 },
      topClientes: [
        { cliente: 'Besalco', venta: 79485010 }, { cliente: 'Equipex', venta: 72053466 },
        { cliente: 'WIN WATER', venta: 68068800 }, { cliente: 'Experticia', venta: 28710425 },
        { cliente: 'BESALCO', venta: 23830000 }, { cliente: 'EMIN', venta: 22212750 },
        { cliente: 'TECHINT', venta: 18741670 }, { cliente: 'EQUIPEX', venta: 16992533 },
      ],
      atrasadas: [],
    },
  },
  global: { venta: 910360681, cobrado: 514798359, pendiente: 116426503, utilidad: 897886570, perdidaFact: 12294038, nFacturas: 245 },
}
