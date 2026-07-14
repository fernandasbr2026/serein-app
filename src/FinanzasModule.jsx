import React, { useState, useMemo } from 'react'
import { Plus, Trash2, X, Copy, Landmark, ReceiptText, PieChart as PieIcon, CalendarClock, BarChart3, CheckCircle2 } from 'lucide-react'

const C = { naranja: '#FF6B00', carbon: '#0F1A2E', verde: '#12805C', rojo: '#D64545', gris: '#8A929E' }
const clp = n => '$' + Math.round(n).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const hoy = () => new Date().toISOString().slice(0, 10)
const mesDe = f => (f || '').slice(0, 7)
const inp = { padding: '7px 9px', border: '1px solid #CBD2D6', fontSize: 13, boxSizing: 'border-box' }

export const AREAS_GASTO = ['Santa Rosa', 'Istria', 'Producción / Planta', 'Proyectos', 'Administración', 'Comercial', 'Finanzas', 'Gerencia', 'General empresa']
const CATEGORIAS_FIJO = ['Arriendo', 'Luz', 'Agua', 'Internet', 'Teléfono', 'Contabilidad', 'Software', 'Seguros', 'Sueldos administrativos', 'Sueldos trabajadores', 'Imposiciones', 'Patentes', 'Servicios externos', 'Mantenciones', 'Otros']
const CATEGORIAS_VAR = ['Combustible', 'EPP', 'Herramientas', 'Mantenciones', 'Transporte', 'Materiales menores', 'Repuestos', 'Insumos de planta', 'Otros']
const FRECUENCIAS = ['Mensual', 'Semanal', 'Anual', 'Única']
const ESTADOS_GASTO = ['Pendiente', 'Pagado', 'Vencido', 'Anulado']
const TIPOS_OBLIGACION = ['Crédito', 'Leasing', 'Préstamo', 'Fogape', 'Vehículo', 'Maquinaria', 'Otro']

// ================= DATOS DE PRUEBA (gastos reales de tu Excel, julio 2026) =================
export const FIN_SEED = {
  areas: [...AREAS_GASTO],
  plantillas: [
    { id: 'p1', nombre: 'Santa Rosa / Istria 50-50', items: [{ area: 'Santa Rosa', pct: 50 }, { area: 'Istria', pct: 50 }] },
    { id: 'p2', nombre: 'Santa Rosa / Producción 50-50', items: [{ area: 'Santa Rosa', pct: 50 }, { area: 'Producción / Planta', pct: 50 }] },
    { id: 'p3', nombre: 'Administración 100%', items: [{ area: 'Administración', pct: 100 }] },
    { id: 'p4', nombre: 'General empresa', items: [{ area: 'General empresa', pct: 100 }] },
  ],
  gastos: [
    { id: 'g1', tipo: 'fijo', nombre: 'Arriendo planta Santa Rosa', categoria: 'Arriendo', proveedor: 'Arrendador', neto: 7312972, iva: 0, vencimiento: '2026-07-05', frecuencia: 'Mensual', estado: 'Pagado', ot: '', dist: [{ area: 'Santa Rosa', pct: 100 }], obs: 'Valor UF junio' },
    { id: 'g2', tipo: 'fijo', nombre: 'Sueldo administrativo Mario Vidal', categoria: 'Sueldos administrativos', proveedor: 'Interno', neto: 3200000, iva: 0, vencimiento: '2026-07-30', frecuencia: 'Mensual', estado: 'Pendiente', ot: '', dist: [{ area: 'Proyectos', pct: 100 }], obs: '' },
    { id: 'g3', tipo: 'fijo', nombre: 'Sueldos Fernanda y Luis', categoria: 'Sueldos administrativos', proveedor: 'Interno', neto: 9800000, iva: 0, vencimiento: '2026-07-30', frecuencia: 'Mensual', estado: 'Pendiente', ot: '', dist: [{ area: 'Santa Rosa', pct: 50 }, { area: 'Istria', pct: 50 }], obs: 'Mixto SR-Istria' },
    { id: 'g4', tipo: 'fijo', nombre: 'Sueldo Carolina', categoria: 'Sueldos administrativos', proveedor: 'Interno', neto: 1800000, iva: 0, vencimiento: '2026-07-30', frecuencia: 'Mensual', estado: 'Pendiente', ot: '', dist: [{ area: 'Santa Rosa', pct: 50 }, { area: 'Istria', pct: 50 }], obs: '' },
    { id: 'g5', tipo: 'fijo', nombre: 'Sueldos trabajadores Istria', categoria: 'Sueldos trabajadores', proveedor: 'Interno', neto: 5200000, iva: 0, vencimiento: '2026-07-30', frecuencia: 'Mensual', estado: 'Pendiente', ot: '', dist: [{ area: 'Istria', pct: 100 }], obs: '' },
    { id: 'g6', tipo: 'fijo', nombre: 'Sueldos trabajadores Santa Rosa', categoria: 'Sueldos trabajadores', proveedor: 'Interno', neto: 7450000, iva: 0, vencimiento: '2026-07-30', frecuencia: 'Mensual', estado: 'Pendiente', ot: '', dist: [{ area: 'Santa Rosa', pct: 100 }], obs: '' },
    { id: 'g7', tipo: 'variable', nombre: 'Combustible camioneta', categoria: 'Combustible', proveedor: 'Copec', neto: 180000, iva: 34200, vencimiento: '2026-07-03', frecuencia: 'Única', estado: 'Pagado', ot: '', dist: [{ area: 'General empresa', pct: 100 }], obs: '' },
  ],
  obligaciones: [{"id":"bch-credito-40m","institucion":"Banco de Chile","tipo":"Crédito","producto":"Crédito en Cuotas Fogape","numeroOperacion":"053768606560032016","montoOriginal":40000000,"fechaEmision":"2026-06-05","fechaTermino":"2027-06-07","nCuotas":12,"cuotasPagadas":1,"responsablePago":"propio","dist":[{"area":"General empresa","pct":100}],"cuotas":[{"n":1,"vencimiento":"2026-07-07","capital":null,"interes":null,"seguro":null,"total":3614834,"estado":"Pagada","aCargo":"propio"},{"n":2,"vencimiento":"2026-08-06","capital":3231702,"interes":383132,"seguro":null,"total":3614834,"estado":"Pendiente","aCargo":"propio"},{"n":3,"vencimiento":"2026-09-07","capital":3253470,"interes":361364,"seguro":null,"total":3614834,"estado":"Pendiente","aCargo":"propio"},{"n":4,"vencimiento":"2026-10-06","capital":3318484,"interes":296350,"seguro":null,"total":3614834,"estado":"Pendiente","aCargo":"propio"},{"n":5,"vencimiento":"2026-11-06","capital":3331994,"interes":282840,"seguro":null,"total":3614834,"estado":"Pendiente","aCargo":"propio"},{"n":6,"vencimiento":"2026-12-07","capital":3366080,"interes":248754,"seguro":null,"total":3614834,"estado":"Pendiente","aCargo":"propio"},{"n":7,"vencimiento":"2027-01-06","capital":3407429,"interes":207405,"seguro":null,"total":3614834,"estado":"Pendiente","aCargo":"propio"},{"n":8,"vencimiento":"2027-02-08","capital":3423795,"interes":191039,"seguro":null,"total":3614834,"estado":"Pendiente","aCargo":"propio"},{"n":9,"vencimiento":"2027-03-08","capital":3484376,"interes":130458,"seguro":null,"total":3614834,"estado":"Pendiente","aCargo":"propio"},{"n":10,"vencimiento":"2027-04-06","capital":3513062,"interes":101772,"seguro":null,"total":3614834,"estado":"Pendiente","aCargo":"propio"},{"n":11,"vencimiento":"2027-05-06","capital":3544332,"interes":70502,"seguro":null,"total":3614834,"estado":"Pendiente","aCargo":"propio"},{"n":12,"vencimiento":"2027-06-07","capital":3577056,"interes":37774,"seguro":null,"total":3614830,"estado":"Pendiente","aCargo":"propio"}]},{"id":"bch-credito-50m-especial","institucion":"Banco de Chile","tipo":"Crédito","producto":"Crédito Fogape (préstamo a tercero)","numeroOperacion":"053768606560030160","montoOriginal":50000000,"fechaEmision":"2025-11-20","fechaTermino":"2026-11-23","nCuotas":12,"cuotasPagadas":7,"responsablePago":"mixto","obs":"Préstamo a empresa de la pareja. Solo cuotas 11 y 12 a cargo propio; el resto lo reembolsa el tercero.","dist":[{"area":"General empresa","pct":100}],"cuotas":[{"n":1,"vencimiento":"2025-12-22","capital":null,"interes":null,"seguro":null,"total":4518476,"estado":"Pagada","aCargo":"tercero_reembolsa"},{"n":2,"vencimiento":"2026-01-22","capital":null,"interes":null,"seguro":null,"total":4518476,"estado":"Pagada","aCargo":"tercero_reembolsa"},{"n":3,"vencimiento":"2026-02-23","capital":null,"interes":null,"seguro":null,"total":4518476,"estado":"Pagada","aCargo":"tercero_reembolsa"},{"n":4,"vencimiento":"2026-03-22","capital":null,"interes":null,"seguro":null,"total":4518476,"estado":"Pagada","aCargo":"tercero_reembolsa"},{"n":5,"vencimiento":"2026-04-22","capital":null,"interes":null,"seguro":null,"total":4518476,"estado":"Pagada","aCargo":"tercero_reembolsa"},{"n":6,"vencimiento":"2026-05-22","capital":null,"interes":null,"seguro":null,"total":4518476,"estado":"Pagada","aCargo":"tercero_reembolsa"},{"n":7,"vencimiento":"2026-06-22","capital":null,"interes":null,"seguro":null,"total":4518476,"estado":"Pagada","aCargo":"tercero_reembolsa"},{"n":8,"vencimiento":"2026-07-22","capital":4301459,"interes":217017,"seguro":null,"total":4518476,"estado":"Pendiente","aCargo":"tercero_reembolsa"},{"n":9,"vencimiento":"2026-08-24","capital":4326600,"interes":191876,"seguro":null,"total":4518476,"estado":"Pendiente","aCargo":"tercero_reembolsa"},{"n":10,"vencimiento":"2026-09-22","capital":4391263,"interes":127213,"seguro":null,"total":4518476,"estado":"Pendiente","aCargo":"tercero_reembolsa"},{"n":11,"vencimiento":"2026-10-22","capital":4430350,"interes":88126,"seguro":null,"total":4518476,"estado":"Pendiente","aCargo":"propio"},{"n":12,"vencimiento":"2026-11-23","capital":4471258,"interes":47216,"seguro":null,"total":4518474,"estado":"Pendiente","aCargo":"propio"}]},{"id":"scotia-fogape-100m","institucion":"Scotiabank","tipo":"Crédito","producto":"Crédito Fogape Cuota Fija","numeroOperacion":"7-1015-90372-39","montoOriginal":100000000,"tasa":"0,89%","fechaEmision":"2025-11-20","fechaTermino":"2026-10-20","nCuotas":12,"cuotasPagadas":8,"responsablePago":"propio","dist":[{"area":"General empresa","pct":100}],"cuotas":[{"n":1,"vencimiento":"2025-11-20","capital":7910402,"interes":919667,"seguro":43056,"total":8873125,"estado":"Pagada","aCargo":"propio"},{"n":2,"vencimiento":"2025-12-22","capital":7955832,"interes":874237,"seguro":40929,"total":8870998,"estado":"Pagada","aCargo":"propio"},{"n":3,"vencimiento":"2026-01-20","capital":8106238,"interes":723831,"seguro":53033,"total":8883102,"estado":"Pagada","aCargo":"propio"},{"n":4,"vencimiento":"2026-02-20","capital":8130869,"interes":699200,"seguro":32734,"total":8862803,"estado":"Pagada","aCargo":"propio"},{"n":5,"vencimiento":"2026-03-20","capital":8266074,"interes":563995,"seguro":71023,"total":8901092,"estado":"Pagada","aCargo":"propio"},{"n":6,"vencimiento":"2026-04-20","capital":8281666,"interes":548403,"seguro":25674,"total":8855743,"estado":"Pagada","aCargo":"propio"},{"n":7,"vencimiento":"2026-05-20","capital":8373064,"interes":457005,"seguro":21395,"total":8851464,"estado":"Pagada","aCargo":"propio"},{"n":8,"vencimiento":"2026-06-22","capital":8409335,"interes":420734,"seguro":19697,"total":8849766,"estado":"Pagada","aCargo":"propio"},{"n":9,"vencimiento":"2026-07-20","capital":8542936,"interes":287133,"seguro":12019,"total":8842088,"estado":"Pendiente","aCargo":"propio"},{"n":10,"vencimiento":"2026-08-20","capital":8590739,"interes":239330,"seguro":11205,"total":8841274,"estado":"Pendiente","aCargo":"propio"},{"n":11,"vencimiento":"2026-09-21","capital":8664573,"interes":165496,"seguro":7748,"total":8837817,"estado":"Pendiente","aCargo":"propio"},{"n":12,"vencimiento":"2026-10-20","capital":8768272,"interes":75436,"seguro":3532,"total":8847240,"estado":"Pendiente","aCargo":"propio"}]},{"id":"scotia-comercial-100m-nuevo","institucion":"Scotiabank","tipo":"Crédito","producto":"Crédito comercial","numeroOperacion":"POR CONFIRMAR","montoOriginal":100000000,"nCuotas":12,"cuotasPagadas":0,"responsablePago":"propio","obs":"SUPUESTO: 12 cuotas de 8.816.859, día 17, 1ª 17-07-2026. Confirmar tasa y N° de crédito.","dist":[{"area":"General empresa","pct":100}],"cuotas":[{"n":1,"vencimiento":"2026-07-17","capital":null,"interes":null,"seguro":null,"total":8816859,"estado":"Pendiente","aCargo":"propio"},{"n":2,"vencimiento":"2026-08-17","capital":null,"interes":null,"seguro":null,"total":8816859,"estado":"Pendiente","aCargo":"propio"},{"n":3,"vencimiento":"2026-09-17","capital":null,"interes":null,"seguro":null,"total":8816859,"estado":"Pendiente","aCargo":"propio"},{"n":4,"vencimiento":"2026-10-17","capital":null,"interes":null,"seguro":null,"total":8816859,"estado":"Pendiente","aCargo":"propio"},{"n":5,"vencimiento":"2026-11-17","capital":null,"interes":null,"seguro":null,"total":8816859,"estado":"Pendiente","aCargo":"propio"},{"n":6,"vencimiento":"2026-12-17","capital":null,"interes":null,"seguro":null,"total":8816859,"estado":"Pendiente","aCargo":"propio"},{"n":7,"vencimiento":"2027-01-17","capital":null,"interes":null,"seguro":null,"total":8816859,"estado":"Pendiente","aCargo":"propio"},{"n":8,"vencimiento":"2027-02-17","capital":null,"interes":null,"seguro":null,"total":8816859,"estado":"Pendiente","aCargo":"propio"},{"n":9,"vencimiento":"2027-03-17","capital":null,"interes":null,"seguro":null,"total":8816859,"estado":"Pendiente","aCargo":"propio"},{"n":10,"vencimiento":"2027-04-17","capital":null,"interes":null,"seguro":null,"total":8816859,"estado":"Pendiente","aCargo":"propio"},{"n":11,"vencimiento":"2027-05-17","capital":null,"interes":null,"seguro":null,"total":8816859,"estado":"Pendiente","aCargo":"propio"},{"n":12,"vencimiento":"2027-06-17","capital":null,"interes":null,"seguro":null,"total":8816859,"estado":"Pendiente","aCargo":"propio"}]},{"id":"scotia-leasing-furgon-g7","institucion":"Scotiabank","tipo":"Leasing","producto":"Leasing Financiero (pie 10% + 36 cuotas)","numeroOperacion":"Sim. 787643","montoOriginal":12590000,"bienDescripcion":"Furgón Foton G7 LITE MT 2.0, 2026, nuevo","valorBien":12590000,"pieNeto":1259000,"ivaTasa":0.19,"cuotaNeta":496637,"opcionCompraNeta":496637,"nCuotas":36,"cuotasPagadas":0,"responsablePago":"propio","obs":"SUPUESTO fecha 1ª cuota 02-08-2026. Pie con IVA cobrado: 1.498.210.","dist":[{"area":"Producción / Planta","pct":100}],"cuotas":[{"n":1,"vencimiento":"2026-08-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":2,"vencimiento":"2026-09-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":3,"vencimiento":"2026-10-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":4,"vencimiento":"2026-11-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":5,"vencimiento":"2026-12-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":6,"vencimiento":"2027-01-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":7,"vencimiento":"2027-02-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":8,"vencimiento":"2027-03-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":9,"vencimiento":"2027-04-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":10,"vencimiento":"2027-05-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":11,"vencimiento":"2027-06-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":12,"vencimiento":"2027-07-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":13,"vencimiento":"2027-08-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":14,"vencimiento":"2027-09-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":15,"vencimiento":"2027-10-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":16,"vencimiento":"2027-11-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":17,"vencimiento":"2027-12-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":18,"vencimiento":"2028-01-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":19,"vencimiento":"2028-02-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":20,"vencimiento":"2028-03-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":21,"vencimiento":"2028-04-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":22,"vencimiento":"2028-05-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":23,"vencimiento":"2028-06-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":24,"vencimiento":"2028-07-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":25,"vencimiento":"2028-08-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":26,"vencimiento":"2028-09-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":27,"vencimiento":"2028-10-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":28,"vencimiento":"2028-11-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":29,"vencimiento":"2028-12-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":30,"vencimiento":"2029-01-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":31,"vencimiento":"2029-02-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":32,"vencimiento":"2029-03-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":33,"vencimiento":"2029-04-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":34,"vencimiento":"2029-05-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":35,"vencimiento":"2029-06-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":36,"vencimiento":"2029-07-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio"},{"n":37,"vencimiento":"2029-08-02","neta":496637,"iva":94361,"total":590998.03,"estado":"Pendiente","aCargo":"propio","opcionCompra":true}]},{"id":"scotia-leasing-camioneta-tm5","institucion":"Scotiabank","tipo":"Leasing","producto":"Leasing Financiero (pie 10% + 36 cuotas)","numeroOperacion":"Sim. 787642","montoOriginal":10790000,"bienDescripcion":"Furgón Foton TM5 Cabina Doble, 2026, nuevo","valorBien":10790000,"pieNeto":1079000,"ivaTasa":0.19,"cuotaNeta":442613,"opcionCompraNeta":442613,"nCuotas":36,"cuotasPagadas":0,"responsablePago":"propio","obs":"SUPUESTO fecha 1ª cuota 02-08-2026. Pie con IVA cobrado: 1.284.010.","dist":[{"area":"Producción / Planta","pct":100}],"cuotas":[{"n":1,"vencimiento":"2026-08-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":2,"vencimiento":"2026-09-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":3,"vencimiento":"2026-10-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":4,"vencimiento":"2026-11-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":5,"vencimiento":"2026-12-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":6,"vencimiento":"2027-01-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":7,"vencimiento":"2027-02-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":8,"vencimiento":"2027-03-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":9,"vencimiento":"2027-04-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":10,"vencimiento":"2027-05-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":11,"vencimiento":"2027-06-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":12,"vencimiento":"2027-07-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":13,"vencimiento":"2027-08-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":14,"vencimiento":"2027-09-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":15,"vencimiento":"2027-10-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":16,"vencimiento":"2027-11-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":17,"vencimiento":"2027-12-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":18,"vencimiento":"2028-01-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":19,"vencimiento":"2028-02-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":20,"vencimiento":"2028-03-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":21,"vencimiento":"2028-04-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":22,"vencimiento":"2028-05-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":23,"vencimiento":"2028-06-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":24,"vencimiento":"2028-07-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":25,"vencimiento":"2028-08-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":26,"vencimiento":"2028-09-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":27,"vencimiento":"2028-10-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":28,"vencimiento":"2028-11-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":29,"vencimiento":"2028-12-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":30,"vencimiento":"2029-01-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":31,"vencimiento":"2029-02-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":32,"vencimiento":"2029-03-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":33,"vencimiento":"2029-04-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":34,"vencimiento":"2029-05-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":35,"vencimiento":"2029-06-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":36,"vencimiento":"2029-07-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio"},{"n":37,"vencimiento":"2029-08-02","neta":442613,"iva":84096,"total":526709.47,"estado":"Pendiente","aCargo":"propio","opcionCompra":true}]},{"id":"bch-leasing-10019927","institucion":"Banco de Chile","tipo":"Leasing","producto":"Leasing Financiero (contrato 10.019.927)","numeroOperacion":"10019927","bienDescripcion":"Por confirmar (no viene en el contrato)","ivaTasa":0.19,"nCuotas":26,"cuotasPagadas":4,"responsablePago":"propio","obs":"Contrato BCh 10.019.927. Cuota 1 mayor ($1.844.500). Valores del calendario son con IVA (recuperable). Confirmar bien arrendado.","dist":[{"area":"Producción / Planta","pct":100}],"cuotas":[{"n":1,"vencimiento":"2026-03-30","neta":1550000,"iva":294500,"total":1844500,"estado":"Pagada","aCargo":"propio"},{"n":2,"vencimiento":"2026-04-30","neta":664926,"iva":126336,"total":791262,"estado":"Pagada","aCargo":"propio"},{"n":3,"vencimiento":"2026-05-30","neta":664926,"iva":126336,"total":791262,"estado":"Pagada","aCargo":"propio"},{"n":4,"vencimiento":"2026-06-30","neta":664926,"iva":126336,"total":791262,"estado":"Pagada","aCargo":"propio"},{"n":5,"vencimiento":"2026-07-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":6,"vencimiento":"2026-08-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":7,"vencimiento":"2026-09-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":8,"vencimiento":"2026-10-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":9,"vencimiento":"2026-11-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":10,"vencimiento":"2026-12-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":11,"vencimiento":"2027-01-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":12,"vencimiento":"2027-02-28","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":13,"vencimiento":"2027-03-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":14,"vencimiento":"2027-04-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":15,"vencimiento":"2027-05-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":16,"vencimiento":"2027-06-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":17,"vencimiento":"2027-07-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":18,"vencimiento":"2027-08-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":19,"vencimiento":"2027-09-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":20,"vencimiento":"2027-10-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":21,"vencimiento":"2027-11-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":22,"vencimiento":"2027-12-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":23,"vencimiento":"2028-01-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":24,"vencimiento":"2028-02-29","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":25,"vencimiento":"2028-03-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"},{"n":26,"vencimiento":"2028-04-30","neta":664926,"iva":126336,"total":791262,"estado":"Pendiente","aCargo":"propio"}]}],
  credVer: 3,
  ufValor: 39000,
}

// ================= EDITOR DE DISTRIBUCIÓN (reutilizable) =================
function EditorDistribucion({ dist, setDist, plantillas, areas }) {
  const repartir = arr => { const n = arr.length; if (!n) return arr; const base = Math.floor(10000 / n) / 100; return arr.map((x, i) => ({ ...x, pct: i === n - 1 ? Math.round((100 - base * (n - 1)) * 100) / 100 : base })) }
  const suma = dist.reduce((a, d) => a + (parseFloat(d.pct) || 0), 0)
  const ok = Math.abs(suma - 100) < 0.01
  return (
    <div style={{ background: '#FAF7F3', padding: 12, marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.gris, textTransform: 'uppercase' }}>Distribución por área</span>
        <select onChange={e => { const p = plantillas.find(x => x.id === e.target.value); if (p) setDist(p.items.map(i => ({ ...i }))); e.target.value = '' }} defaultValue="" style={{ ...inp, fontSize: 12 }}>
          <option value="" disabled>Usar plantilla…</option>
          {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>
      {dist.map((d, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <select value={d.area} onChange={e => setDist(dist.map((x, j) => j === i ? { ...x, area: e.target.value } : x))} style={{ ...inp, flex: 1 }}>
            {areas.map(a => <option key={a}>{a}</option>)}
          </select>
          <input type="number" value={d.pct} onChange={e => setDist(dist.map((x, j) => j === i ? { ...x, pct: e.target.value } : x))} style={{ ...inp, width: 70, textAlign: 'right' }} />
          <span style={{ fontSize: 13, color: C.gris }}>%</span>
          {dist.length > 1 && <button onClick={() => setDist(repartir(dist.filter((_, j) => j !== i)))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><X size={15} /></button>}
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => setDist(repartir([...dist, { area: areas[0], pct: 0 }]))} style={{ background: 'none', border: '1px dashed #CBD2D6', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.gris }}>+ Agregar área</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: ok ? C.verde : C.rojo }}>Suma: {suma}% {ok ? '✓' : '— debe ser 100%'}</span>
      </div>
    </div>
  )
}

// ================= FORMULARIO DE GASTO =================
function FormGasto({ tipo, fin, setFin, otsDisponibles, onCerrar }) {
  const cats = tipo === 'fijo' ? CATEGORIAS_FIJO : CATEGORIAS_VAR
  const [f, setF] = useState({ nombre: '', categoria: cats[0], proveedor: '', documento: '', neto: '', conIva: tipo !== 'fijo', vencimiento: hoy(), frecuencia: tipo === 'fijo' ? 'Mensual' : 'Única', estado: 'Pendiente', ot: '', obs: '', esUF: false, uf: '' })
  const [dist, setDist] = useState([{ area: 'General empresa', pct: 100 }])
  const suma = dist.reduce((a, d) => a + (parseFloat(d.pct) || 0), 0)
  const ok = Math.abs(suma - 100) < 0.01

  function guardar() {
    if (!f.nombre || (f.esUF ? num(f.uf) : num(f.neto)) <= 0 || !ok) return
    const neto = f.esUF ? Math.round(num(f.uf) * (fin.ufValor || 0)) : num(f.neto)
    const g = { id: 'g' + Date.now(), tipo, nombre: f.nombre, categoria: f.categoria, proveedor: f.proveedor, documento: f.documento, neto, iva: f.conIva ? Math.round(neto * 0.19) : 0, vencimiento: f.vencimiento, frecuencia: f.frecuencia, estado: f.estado, ot: f.ot, dist: dist.map(d => ({ area: d.area, pct: parseFloat(d.pct) })), obs: f.obs, esUF: f.esUF, uf: num(f.uf) }
    setFin({ ...fin, gastos: [g, ...fin.gastos] })
    onCerrar()
  }

  return (
    <div style={{ background: '#fff', border: `2px solid ${C.naranja}`, padding: 16, marginBottom: 14 }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>
        Nuevo gasto {tipo === 'fijo' ? 'fijo' : 'variable / compra'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
        <input style={inp} placeholder="Nombre del gasto *" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} />
        <select style={inp} value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })}>{cats.map(c => <option key={c}>{c}</option>)}</select>
        <input style={inp} placeholder="Proveedor" value={f.proveedor} onChange={e => setF({ ...f, proveedor: e.target.value })} />
        <input style={inp} placeholder="Nº documento (factura/boleta)" value={f.documento} onChange={e => setF({ ...f, documento: e.target.value })} />
        <input style={inp} placeholder={f.esUF ? "Monto en UF *" : "Monto neto CLP *"} value={f.esUF ? f.uf : f.neto} onChange={e => setF({ ...f, [f.esUF ? 'uf' : 'neto']: e.target.value })} />
        <label style={{ ...inp, display: 'flex', alignItems: 'center', gap: 6, border: 'none' }}><input type="checkbox" checked={f.esUF} onChange={e => setF({ ...f, esUF: e.target.checked })} /> Monto en UF</label>
        {f.esUF ? <div style={{ ...inp, display: 'flex', alignItems: 'center', color: C.gris, fontSize: 12 }}>UF hoy: {clp(fin.ufValor || 0)} · edítala en Parámetros</div> : null}
        {f.esUF && num(f.uf) > 0 ? <div style={{ fontSize: 12, color: C.gris, alignSelf: 'center' }}>= {clp(Math.round(num(f.uf) * (fin.ufValor || 0)))} (UF {f.uf} × {clp(fin.ufValor || 0)})</div> : null}
        <label style={{ ...inp, display: 'flex', alignItems: 'center', gap: 6, border: 'none' }}>
          <input type="checkbox" checked={f.conIva} onChange={e => setF({ ...f, conIva: e.target.checked })} /> Aplica IVA 19%
        </label>
        <label style={{ fontSize: 12, color: C.gris }}>Vencimiento
          <input type="date" style={{ ...inp, width: '100%' }} value={f.vencimiento} onChange={e => setF({ ...f, vencimiento: e.target.value })} />
        </label>
        <select style={inp} value={f.frecuencia} onChange={e => setF({ ...f, frecuencia: e.target.value })}>{FRECUENCIAS.map(x => <option key={x}>{x}</option>)}</select>
        <select style={inp} value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })}>{ESTADOS_GASTO.map(x => <option key={x}>{x}</option>)}</select>
        <select style={inp} value={f.ot} onChange={e => setF({ ...f, ot: e.target.value })}>
          <option value="">Sin OT/OC (gasto general)</option>
          {otsDisponibles.map(o => <option key={o}>{o}</option>)}
        </select>
      </div>
      {num(f.neto) > 0 && f.conIva && <div style={{ fontSize: 12, color: C.gris, marginTop: 6 }}>IVA: {clp(num(f.neto) * 0.19)} · Total: {clp(num(f.neto) * 1.19)}</div>}
      {f.ot && <div style={{ fontSize: 12, color: '#8C4519', background: '#F9E9DE', padding: '6px 10px', marginTop: 6 }}>Este gasto se cargará como costo de la {f.ot} además del área.</div>}
      <EditorDistribucion dist={dist} setDist={setDist} plantillas={fin.plantillas} areas={fin.areas} />
      <input style={{ ...inp, width: '100%', marginTop: 8 }} placeholder="Observaciones" value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={guardar} disabled={!ok}
          style={{ background: ok ? C.verde : '#CBD2D6', color: '#fff', border: 'none', padding: '9px 18px', cursor: ok ? 'pointer' : 'not-allowed', fontSize: 13 }}>Guardar gasto</button>
        <button onClick={onCerrar} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
      </div>
    </div>
  )
}

// ================= LISTA DE GASTOS =================
function ListaGastos({ tipo, fin, setFin, otsDisponibles }) {
  const [creando, setCreando] = useState(false)
  const [fArea, setFArea] = useState('')
  const todosDelTipo = fin.gastos.filter(g => g.tipo === tipo)
  const gastos = fArea ? todosDelTipo.filter(g => (g.dist || []).some(d => d.area === fArea && (+d.pct || 0) > 0)) : todosDelTipo
  // Con filtro de area, se cuenta solo la parte del gasto asignada a esa area
  const pctArea = g => fArea ? (g.dist || []).filter(d => d.area === fArea).reduce((a, d) => a + (+d.pct || 0), 0) / 100 : 1
  const resumen = gastos.filter(g => g.estado !== 'Anulado').reduce((a, g) => {
    const p = pctArea(g)
    const nt = netoEf(g, fin.ufValor)
    return { n: a.n + 1, neto: a.neto + nt * p, total: a.total + (nt + (g.iva || 0)) * p }
  }, { n: 0, neto: 0, total: 0 })

  function duplicarMesSiguiente(g) {
    const d = new Date(g.vencimiento + 'T12:00:00')
    d.setMonth(d.getMonth() + 1)
    setFin({ ...fin, gastos: [{ ...g, id: 'g' + Date.now(), vencimiento: d.toISOString().slice(0, 10), estado: 'Pendiente' }, ...fin.gastos] })
  }

  return (
    <div>
      {!creando && (
        <button onClick={() => setCreando(true)}
          style={{ background: C.naranja, color: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <Plus size={15} /> Nuevo gasto {tipo === 'fijo' ? 'fijo' : 'variable'}
        </button>
      )}
      {creando && <FormGasto tipo={tipo} fin={fin} setFin={setFin} otsDisponibles={otsDisponibles} onCerrar={() => setCreando(false)} />}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '14px 0 10px' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.gris, textTransform: 'uppercase' }}>Area</span>
        <select value={fArea} onChange={e => setFArea(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #CBD2D6', fontSize: 13, background: '#fff' }}>
          <option value="">Todas las areas</option>
          {(fin.areas || []).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        {fArea && <button onClick={() => setFArea('')} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>Limpiar</button>}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {[['Gastos', String(resumen.n)], [fArea ? 'Neto ' + fArea : 'Neto total', clp(Math.round(resumen.neto))], [fArea ? 'Total ' + fArea : 'Total con IVA', clp(Math.round(resumen.total))]].map(([k, v], n) => (
          <div key={n} style={{ flex: '1 1 180px', background: '#fff', border: '1px solid #E2DED4', borderTop: '3px solid ' + C.naranja, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase', fontWeight: 700 }}>{k}</div>
            <div style={{ fontSize: 21, fontWeight: 700, color: C.carbon, fontFamily: "'Oswald',sans-serif" }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
              {['Gasto', 'Categoría', 'Proveedor', 'Neto', 'Total', 'Vence', 'Frec.', 'Estado', 'Distribución', ''].map(h => (
                <th key={h} style={{ textAlign: ['Neto', 'Total'].includes(h) ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gastos.map(g => (
              <tr key={g.id} style={{ borderBottom: '1px solid #EEE9DF', verticalAlign: 'top', opacity: g.estado === 'Anulado' ? 0.45 : 1 }}>
                <td style={{ padding: '8px', fontWeight: 500 }}>{g.nombre}{g.ot && <div style={{ fontSize: 11, color: C.naranja, fontFamily: "'JetBrains Mono',monospace" }}>{g.ot}</div>}</td>
                <td style={{ padding: '8px', color: C.gris }}>{g.categoria}</td>
                <td style={{ padding: '8px', color: C.gris }}>{g.proveedor || '—'}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{clp(netoEf(g, fin.ufValor))}{g.esUF ? <span style={{ fontSize: 10, color: '#7A8288', display: 'block' }}>{g.uf} UF</span> : null}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{clp(g.neto + g.iva)}</td>
                <td style={{ padding: '8px', color: C.gris, whiteSpace: 'nowrap' }}>{g.vencimiento}</td>
                <td style={{ padding: '8px', color: C.gris, fontSize: 12 }}>{g.frecuencia}</td>
                <td style={{ padding: '8px' }}>
                  <select value={g.estado} onChange={e => setFin({ ...fin, gastos: fin.gastos.map(x => x.id === g.id ? { ...x, estado: e.target.value } : x) })}
                    style={{ border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '3px 6px', background: g.estado === 'Pagado' ? '#E7F2EA' : g.estado === 'Vencido' ? '#F6E0DA' : g.estado === 'Anulado' ? '#EEE' : '#F9E9DE', color: g.estado === 'Pagado' ? C.verde : g.estado === 'Vencido' ? C.rojo : g.estado === 'Anulado' ? C.gris : '#8C4519' }}>
                    {ESTADOS_GASTO.map(x => <option key={x}>{x}</option>)}
                  </select>
                </td>
                <td style={{ padding: '8px', fontSize: 12 }}>{g.dist.map(d => <div key={d.area}>{d.area}: {d.pct}% ({clp((g.neto) * d.pct / 100)})</div>)}</td>
                <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                  <button title="Duplicar al mes siguiente" onClick={() => duplicarMesSiguiente(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gris }}><Copy size={14} /></button>
                  <button title="Eliminar" onClick={() => window.confirm(`¿Eliminar "${g.nombre}"?`) && setFin({ ...fin, gastos: fin.gastos.filter(x => x.id !== g.id) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {gastos.length === 0 && <tr><td colSpan={10} style={{ padding: 16, textAlign: 'center', color: '#9AA0A6' }}>Sin gastos registrados.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ================= PLANTILLAS =================
function Plantillas({ fin, setFin }) {
  const [nombre, setNombre] = useState('')
  const [items, setItems] = useState([{ area: AREAS_GASTO[0], pct: 100 }])
  const suma = items.reduce((a, d) => a + (parseFloat(d.pct) || 0), 0)
  const ok = Math.abs(suma - 100) < 0.01

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Crear plantilla</div>
        <input style={{ ...inp, width: '100%', marginBottom: 8 }} placeholder='Nombre (ej: "SR / Istria 50-50")' value={nombre} onChange={e => setNombre(e.target.value)} />
        <EditorDistribucion dist={items} setDist={setItems} plantillas={[]} areas={fin.areas} />
        <button onClick={() => { if (nombre && ok) { setFin({ ...fin, plantillas: [...fin.plantillas, { id: 'p' + Date.now(), nombre, items: items.map(i => ({ area: i.area, pct: parseFloat(i.pct) })) }] }); setNombre(''); setItems([{ area: AREAS_GASTO[0], pct: 100 }]) } }}
          disabled={!ok || !nombre}
          style={{ background: ok && nombre ? C.naranja : '#CBD2D6', color: '#fff', border: 'none', padding: '9px 18px', cursor: ok && nombre ? 'pointer' : 'not-allowed', fontSize: 13, marginTop: 10 }}>
          Guardar plantilla
        </button>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Plantillas guardadas</div>
        {fin.plantillas.map(p => (
          <div key={p.id} style={{ borderBottom: '1px solid #EEE9DF', padding: '8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.nombre}</div>
              <div style={{ fontSize: 12, color: C.gris }}>{p.items.map(i => `${i.area} ${i.pct}%`).join(' · ')}</div>
            </div>
            <button onClick={() => window.confirm(`¿Eliminar plantilla "${p.nombre}"?`) && setFin({ ...fin, plantillas: fin.plantillas.filter(x => x.id !== p.id) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ================= CRÉDITOS Y LEASING =================
function CreditosLeasing({ fin, setFin }) {
  const [creando, setCreando] = useState(false)
  const [abierta, setAbierta] = useState(null)
  const [f, setF] = useState({ tipo: 'Crédito', institucion: '', montoOriginal: '', inicio: hoy(), nCuotas: '', valorCuota: '', diaVenc: '5', tasa: '', activo: '', obs: '' })
  const [dist, setDist] = useState([{ area: 'General empresa', pct: 100 }])
  const ok = Math.abs(dist.reduce((a, d) => a + (parseFloat(d.pct) || 0), 0) - 100) < 0.01

  function crear() {
    const n = parseInt(f.nCuotas); const vc = num(f.valorCuota)
    if (!f.institucion || !n || !vc || !ok) return
    const [a, m, d] = f.inicio.split('-').map(Number)
    const cuotas = Array.from({ length: n }, (_, i) => {
      const fecha = new Date(a, m - 1 + i, parseInt(f.diaVenc) || d).toISOString().slice(0, 10)
      return { n: i + 1, vencimiento: fecha, capital: null, interes: null, seguro: null, total: vc, estado: 'Pendiente', fechaPago: null }
    })
    const o = { id: 'o' + Date.now(), tipo: f.tipo, institucion: f.institucion, montoOriginal: num(f.montoOriginal) || n * vc, inicio: f.inicio, nCuotas: n, valorCuota: vc, diaVenc: parseInt(f.diaVenc) || 5, tasa: f.tasa, estado: 'Vigente', activo: f.activo, dist: dist.map(x => ({ area: x.area, pct: parseFloat(x.pct) })), obs: f.obs, cuotas }
    setFin({ ...fin, obligaciones: [o, ...fin.obligaciones] })
    setCreando(false)
  }

  function actualizarCuota(oid, n, cambios) {
    setFin({ ...fin, obligaciones: fin.obligaciones.map(o => o.id !== oid ? o : { ...o, cuotas: o.cuotas.map(c => c.n === n ? { ...c, ...cambios } : c) }) })
  }

  return (
    <div>
      {!creando && (
        <button onClick={() => setCreando(true)}
          style={{ background: C.naranja, color: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontFamily: "'Oswald',sans-serif", fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <Plus size={15} /> Nuevo crédito / leasing
        </button>
      )}
      {creando && (
        <div style={{ background: '#fff', border: `2px solid ${C.naranja}`, padding: 16, marginBottom: 14 }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Nueva obligación financiera</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            <select style={inp} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{TIPOS_OBLIGACION.map(t => <option key={t}>{t}</option>)}</select>
            <input style={inp} placeholder="Banco / institución *" value={f.institucion} onChange={e => setF({ ...f, institucion: e.target.value })} />
            <input style={inp} placeholder="Monto original CLP" value={f.montoOriginal} onChange={e => setF({ ...f, montoOriginal: e.target.value })} />
            <label style={{ fontSize: 12, color: C.gris }}>Primera cuota
              <input type="date" style={{ ...inp, width: '100%' }} value={f.inicio} onChange={e => setF({ ...f, inicio: e.target.value })} />
            </label>
            <input style={inp} placeholder="Nº cuotas *" value={f.nCuotas} onChange={e => setF({ ...f, nCuotas: e.target.value })} />
            <input style={inp} placeholder="Valor cuota CLP *" value={f.valorCuota} onChange={e => setF({ ...f, valorCuota: e.target.value })} />
            <input style={inp} placeholder="Día vencimiento (ej: 5)" value={f.diaVenc} onChange={e => setF({ ...f, diaVenc: e.target.value })} />
            <input style={inp} placeholder="Tasa % (opcional)" value={f.tasa} onChange={e => setF({ ...f, tasa: e.target.value })} />
            <input style={inp} placeholder="Activo asociado (opcional)" value={f.activo} onChange={e => setF({ ...f, activo: e.target.value })} />
          </div>
          <EditorDistribucion dist={dist} setDist={setDist} plantillas={fin.plantillas} areas={fin.areas} />
          <div style={{ fontSize: 12, color: C.gris, marginTop: 8 }}>El calendario de cuotas se genera automáticamente; luego puedes editar capital/interés cuota a cuota y marcar pagos.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={crear} disabled={!ok} style={{ background: ok ? C.verde : '#CBD2D6', color: '#fff', border: 'none', padding: '9px 18px', cursor: ok ? 'pointer' : 'not-allowed', fontSize: 13 }}>Crear con calendario</button>
            <button onClick={() => setCreando(false)} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
          </div>
        </div>
      )}

      {fin.obligaciones.map(o => {
        const pagadas = o.cuotas.filter(c => c.estado === 'Pagada')
        const saldo = o.cuotas.filter(c => c.estado !== 'Pagada').reduce((a, c) => a + c.total, 0)
        const vencidas = o.cuotas.filter(c => c.estado !== 'Pagada' && c.vencimiento < hoy())
        return (
          <div key={o.id} style={{ background: '#fff', border: '1px solid #E2DED4', marginBottom: 14 }}>
            <div onClick={() => setAbierta(abierta === o.id ? null : o.id)} style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 15 }}>{o.tipo} · {o.institucion}</div>
                <div style={{ fontSize: 12, color: C.gris, marginTop: 2 }}>
                  {o.activo && `${o.activo} · `}{o.nCuotas} cuotas de {clp(o.valorCuota)} · día {o.diaVenc} · {o.dist.map(d => `${d.area} ${d.pct}%`).join(', ')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Pagadas</div>
                  <div style={{ fontWeight: 600 }}>{pagadas.length}/{o.nCuotas}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Saldo pendiente</div>
                  <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 16, color: C.naranja }}>{clp(saldo)}</div>
                </div>
                {vencidas.length > 0 && <span style={{ background: '#F6E0DA', color: C.rojo, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{vencidas.length} vencida{vencidas.length > 1 ? 's' : ''}</span>}
              </div>
            </div>
            {abierta === o.id && (
              <div style={{ borderTop: '1px solid #EEE9DF', padding: 18, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                      {['Nº', 'Vencimiento', 'Capital', 'Interés', 'Total cuota', 'Estado', 'Fecha pago'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {o.cuotas.map(c => {
                      const vencida = c.estado !== 'Pagada' && c.vencimiento < hoy()
                      return (
                        <tr key={c.n} style={{ borderBottom: '1px solid #EEE9DF', background: vencida ? '#FDF3F0' : 'transparent' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 600 }}>{c.n}</td>
                          <td style={{ padding: '6px 8px', color: vencida ? C.rojo : C.gris }}>{c.vencimiento}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <input value={c.capital ?? ''} placeholder="—" onChange={e => actualizarCuota(o.id, c.n, { capital: e.target.value === '' ? null : num(e.target.value) })} style={{ ...inp, width: 100, padding: '4px 6px' }} />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input value={c.interes ?? ''} placeholder="—" onChange={e => actualizarCuota(o.id, c.n, { interes: e.target.value === '' ? null : num(e.target.value) })} style={{ ...inp, width: 90, padding: '4px 6px' }} />
                          </td>
                          <td style={{ padding: '6px 8px', fontWeight: 600 }}>{clp(c.total)}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <button onClick={() => actualizarCuota(o.id, c.n, c.estado === 'Pagada' ? { estado: 'Pendiente', fechaPago: null } : { estado: 'Pagada', fechaPago: hoy() })}
                              style={{ background: c.estado === 'Pagada' ? '#E7F2EA' : vencida ? '#F6E0DA' : '#F9E9DE', color: c.estado === 'Pagada' ? C.verde : vencida ? C.rojo : '#8C4519', border: 'none', padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              {c.estado === 'Pagada' ? '✓ Pagada' : vencida ? 'Vencida' : 'Pendiente'}
                            </button>
                          </td>
                          <td style={{ padding: '6px 8px', color: C.gris, fontSize: 12 }}>{c.fechaPago || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{ marginTop: 12, textAlign: 'right' }}>
                  <button onClick={() => window.confirm(`¿Eliminar ${o.tipo} ${o.institucion} completo?`) && setFin({ ...fin, obligaciones: fin.obligaciones.filter(x => x.id !== o.id) })}
                    style={{ background: 'none', border: `1px solid ${C.rojo}`, color: C.rojo, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
                    <Trash2 size={12} style={{ verticalAlign: -2 }} /> Eliminar obligación
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ================= RESUMEN MENSUAL =================
const netoEf = (g, uf) => g.esUF ? Math.round((g.uf || 0) * (uf || 0)) : (g.neto || 0)
const flujoDe = c => (c.estado === 'Pagada' || c.aCargo === 'tercero_reembolsa') ? 0 : (c.total || 0)

export function calcularResumenFin(fin, mes) {
  const gastosMes = fin.gastos.filter(g => g.estado !== 'Anulado' && (g.frecuencia === 'Mensual' ? mes >= mesDe(g.vencimiento) : (g.frecuencia === 'Anual' ? (mes.slice(5) === (g.vencimiento || '').slice(5) && mes >= mesDe(g.vencimiento)) : mesDe(g.vencimiento) === mes)))
  const fijos = gastosMes.filter(g => g.tipo === 'fijo').reduce((a, g) => a + netoEf(g, fin.ufValor), 0)
  const variables = gastosMes.filter(g => g.tipo === 'variable').reduce((a, g) => a + netoEf(g, fin.ufValor), 0)
  const porArea = {}
  gastosMes.forEach(g => g.dist.forEach(d => { porArea[d.area] = (porArea[d.area] || 0) + netoEf(g, fin.ufValor) * d.pct / 100 }))
  const cuotasMes = fin.obligaciones.flatMap(o => o.cuotas.filter(c => mesDe(c.vencimiento) === mes))
  const totalCuotasMes = cuotasMes.reduce((a, c) => a + flujoDe(c), 0)
  const interesMes = cuotasMes.reduce((a, c) => a + (c.interes || 0), 0)
  const cuotasVencidas = fin.obligaciones.flatMap(o => o.cuotas.filter(c => c.estado !== 'Pagada' && c.vencimiento < hoy()))
  const deudaVigente = fin.obligaciones.reduce((a, o) => a + Math.round(o.cuotas.reduce((x, c) => x + flujoDe(c), 0)), 0)
  const reembolsable = fin.obligaciones.reduce((a, o) => a + Math.round(o.cuotas.filter(c => c.aCargo === 'tercero_reembolsa' && c.estado !== 'Pagada').reduce((x, c) => x + (c.total || 0), 0)), 0)
  return { fijos, variables, porArea, cuotasMes, totalCuotasMes, interesMes, cuotasVencidas, deudaVigente, reembolsable, salidaCaja: fijos + variables + totalCuotasMes }
}

function ProyeccionFin({ fin }) {
  const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
  const now = new Date()
  const nowMes = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
  const r0 = calcularResumenFin(fin, nowMes)
  const fijoM = r0.fijos || 0, varM = r0.variables || 0, totalM = fijoM + varM
  const meses = []
  for (let k = 0; k < 12; k++) { const d = new Date(now.getFullYear(), now.getMonth() + k, 1); meses.push({ key: k, etiqueta: d.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }), fijos: fijoM, total: totalM }) }
  const max = Math.max(1, totalM)
  return (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18, marginTop: 16 }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 4 }}>Proyeccion a 12 meses</div>
      <div style={{ fontSize: 12, color: '#7A8288', marginBottom: 14 }}>Forecast informativo: gastos fijos proyectados, y fijos + variables (promedio del mes vigente). Se actualiza a medida que cargas mas gastos.</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, marginBottom: 8 }}>
        {meses.map(m => (
          <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <div style={{ width: '100%', height: 115, position: 'relative' }}>
              <div title={'Fijos + variables ' + clp(m.total)} style={{ width: '68%', height: (m.total / max * 115) + 'px', background: '#D2642F', position: 'absolute', bottom: 0, left: '16%' }} />
              <div title={'Fijos ' + clp(m.fijos)} style={{ width: '68%', height: (m.fijos / max * 115) + 'px', background: '#061A40', position: 'absolute', bottom: 0, left: '16%' }} />
            </div>
            <div style={{ fontSize: 9, color: '#7A8288', whiteSpace: 'nowrap' }}>{m.etiqueta}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: '#7A8288', marginBottom: 10 }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#061A40', marginRight: 5 }} />Gastos fijos</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#D2642F', marginRight: 5 }} />Fijos + variables</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ borderBottom: '2px solid #161616' }}>{['Mes', 'Fijos', 'Fijos + variables'].map((h, i) => <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '6px 8px', fontSize: 11, color: '#7A8288', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
          <tbody>
            {meses.map(m => (<tr key={m.key} style={{ borderBottom: '1px solid #EEE9DF' }}><td style={{ padding: '6px 8px' }}>{m.etiqueta}</td><td style={{ padding: '6px 8px', textAlign: 'right' }}>{clp(m.fijos)}</td><td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{clp(m.total)}</td></tr>))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ResumenMensual({ fin }) {
  const [mes, setMes] = useState(hoy().slice(0, 7))
  const r = useMemo(() => calcularResumenFin(fin, mes), [fin, mes])

  const kpi = (label, valor, color) => (
    <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 14, flex: '1 1 170px' }}>
      <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 21, fontWeight: 600, color: color || C.carbon, whiteSpace: 'nowrap' }}>{valor}</div>
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)} style={inp} />
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {kpi('Gastos fijos del mes', clp(r.fijos))}
        {kpi('Gastos variables del mes', clp(r.variables))}
        {kpi('Cuotas créditos/leasing', clp(r.totalCuotasMes), C.naranja)}
        {kpi('Salida de caja proyectada', clp(r.salidaCaja), C.rojo)}
        {kpi('Deuda total propia', clp(r.deudaVigente), C.carbon)}
        {r.reembolsable > 0 ? kpi('Reembolsable por tercero', clp(r.reembolsable), C.gris) : null}
        {kpi('Cuotas vencidas', r.cuotasVencidas.length, r.cuotasVencidas.length > 0 ? C.rojo : C.verde)}
      </div>
      <div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 18 }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Gastos del mes por área</div>
        {Object.keys(r.porArea).length === 0 ? <div style={{ fontSize: 13, color: '#9AA0A6' }}>Sin gastos este mes.</div> : (
          Object.entries(r.porArea).sort((a, b) => b[1] - a[1]).map(([area, monto]) => {
            const max = Math.max(...Object.values(r.porArea))
            return (
              <div key={area} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 13, width: 170 }}>{area}</span>
                <div style={{ flex: 1, height: 8, background: '#EEE9DF' }}>
                  <div style={{ width: `${(monto / max) * 100}%`, height: '100%', background: C.naranja }} />
                </div>
                <span style={{ fontSize: 13, width: 110, textAlign: 'right', fontWeight: 600 }}>{clp(monto)}</span>
              </div>
            )
          })
        )}
        {r.interesMes > 0 && <div style={{ fontSize: 12, color: C.gris, marginTop: 10 }}>Del pago de cuotas del mes, {clp(r.interesMes)} corresponde a intereses (gasto financiero) según el desglose ingresado.</div>}
      </div>
    </div>
  )
}

// ================= MÓDULO PRINCIPAL =================
export default function FinanzasModule({ otsDisponibles = [], fin: finExt, setFin: setFinExt }) {
  const [finInt, setFinInt] = useState(FIN_SEED)
  const fin = finExt ?? finInt
  const setFin = setFinExt ?? setFinInt

  const tabs = [
    { id: 'resumen', label: 'Resumen mensual', icono: <BarChart3 size={13} /> },
    { id: 'fijos', label: 'Gastos fijos', icono: <ReceiptText size={13} /> },
    { id: 'variables', label: 'Gastos variables', icono: <ReceiptText size={13} /> },
    { id: 'plantillas', label: 'Reglas de distribución', icono: <PieIcon size={13} /> },
    { id: 'creditos', label: 'Créditos y Leasing', icono: <Landmark size={13} /> },
  ]
  const [tab, setTab] = useState('resumen')

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ background: tab === t.id ? C.carbon : '#fff', color: tab === t.id ? '#fff' : C.carbon, border: '1px solid #CBD2D6', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontFamily: "'Oswald',sans-serif", fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, display: 'flex', alignItems: 'center', gap: 6 }}>
            {t.icono}{t.label}
          </button>
        ))}
      </div>
      {tab === 'resumen' && <><ResumenMensual fin={fin} /><ProyeccionFin fin={fin} /></>}
      {tab === 'fijos' && <ListaGastos tipo="fijo" fin={fin} setFin={setFin} otsDisponibles={otsDisponibles} />}
      {tab === 'variables' && <ListaGastos tipo="variable" fin={fin} setFin={setFin} otsDisponibles={otsDisponibles} />}
      {tab === 'plantillas' && <Plantillas fin={fin} setFin={setFin} />}
      {tab === 'creditos' && <CreditosLeasing fin={fin} setFin={setFin} />}
    </div>
  )
}
