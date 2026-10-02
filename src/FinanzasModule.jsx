import React, { useState, useMemo, useRef } from 'react'
import { Plus, Trash2, X, Copy, Landmark, ReceiptText, PieChart as PieIcon, CalendarClock, BarChart3, CheckCircle2, Download, TrendingUp, Pencil } from 'lucide-react'
import * as XLSX from 'xlsx'

import { SEREIN } from './theme-serein.js'
import { pullState, pushState } from './sync.js'
import { montoBrutoCompra } from './ProyectosModule.jsx'
import { cuentaDe, textoCuenta, guardarCuentaProveedor, buscarProveedor, TIPOS_CUENTA } from './cuentasProveedor.js'
// Paleta reskineada a la identidad Serein 2026 — mismas claves, solo cambian los valores hex.
const C = { naranja: SEREIN.orange, carbon: SEREIN.text, verde: SEREIN.green, rojo: SEREIN.red, gris: SEREIN.textFaint }
const clp = n => '$' + Math.round(n).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const hoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
const mesDe = f => (f || '').slice(0, 7)
const inp = { padding: '7px 9px', border: '1px solid #DFE4EA', fontSize: 13, boxSizing: 'border-box' }

export const AREAS_GASTO = ['Santa Rosa', 'Istria', 'Producción / Planta', 'Proyectos', 'Administración', 'Comercial', 'Finanzas', 'Gerencia', 'General empresa']
const CATEGORIAS_FIJO = ['Arriendo', 'Luz', 'Agua', 'Internet', 'Teléfono', 'Contabilidad', 'Software', 'Seguros', 'Sueldos administrativos', 'Sueldos trabajadores', 'Imposiciones', 'Patentes', 'Servicios externos', 'Mantenciones', 'Otros']
const CATEGORIAS_VAR = ['Combustible', 'EPP', 'Herramientas', 'Mantenciones', 'Transporte', 'Materiales menores', 'Repuestos', 'Insumos de planta', 'Otros']
const FRECUENCIAS = ['Mensual', 'Semanal', 'Anual', 'Única']
const ESTADOS_GASTO = ['Pendiente', 'Pagado', 'Vencido', 'Anulado']
const FORMAS_PAGO = ['Transferencia', 'Cheque']
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
    <div style={{ background: '#F2F4F7', padding: 12, marginTop: 8 }}>
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
        <button onClick={() => setDist(repartir([...dist, { area: areas[0], pct: 0 }]))} style={{ background: 'none', border: '1px dashed #DFE4EA', padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: C.gris }}>+ Agregar área</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: ok ? C.verde : C.rojo }}>Suma: {suma}% {ok ? '✓' : '— debe ser 100%'}</span>
      </div>
    </div>
  )
}

// ================= FORMULARIO DE GASTO =================
// ---- Escritura de gastos (pull-fresh + merge + push) — funciones de
// modulo, no atadas a ningun componente, para que tanto ListaGastos como
// FormGasto como el modal de detalle de Pagos escriban siempre con el
// mismo criterio seguro y sin duplicar el codigo tres veces. ----
async function agregarGastoFresco(fin, setFin, gasto) {
  try { await pullState() } catch (e) {}
  let fresco = null
  try { fresco = JSON.parse(localStorage.getItem('serein_fin') || 'null') } catch (e) {}
  const baseFin = fresco && typeof fresco === 'object' ? fresco : fin
  const nuevoFin = { ...baseFin, gastos: [gasto, ...(baseFin.gastos || [])] }
  try { localStorage.setItem('serein_fin', JSON.stringify(nuevoFin)) } catch (e) {}
  setFin(nuevoFin)
  pushState()
}
async function editarGastoFresco(fin, setFin, gasto) {
  try { await pullState() } catch (e) {}
  let fresco = null
  try { fresco = JSON.parse(localStorage.getItem('serein_fin') || 'null') } catch (e) {}
  const baseFin = fresco && typeof fresco === 'object' ? fresco : fin
  const nuevoFin = { ...baseFin, gastos: (baseFin.gastos || []).map(g => g.id === gasto.id ? gasto : g) }
  try { localStorage.setItem('serein_fin', JSON.stringify(nuevoFin)) } catch (e) {}
  setFin(nuevoFin)
  pushState()
}
async function eliminarGastoFresco(fin, setFin, id) {
  try { await pullState() } catch (e) {}
  let fresco = null
  try { fresco = JSON.parse(localStorage.getItem('serein_fin') || 'null') } catch (e) {}
  const baseFin = fresco && typeof fresco === 'object' ? fresco : fin
  const nuevoFin = { ...baseFin, gastos: (baseFin.gastos || []).filter(x => x.id !== id) }
  try { localStorage.setItem('serein_fin', JSON.stringify(nuevoFin)) } catch (e) {}
  setFin(nuevoFin)
  pushState()
}
async function cambiarEstadoGasto(fin, setFin, id, estado) {
  try { await pullState() } catch (e) {}
  let fresco = null
  try { fresco = JSON.parse(localStorage.getItem('serein_fin') || 'null') } catch (e) {}
  const baseFin = fresco && typeof fresco === 'object' ? fresco : fin
  const nuevoFin = { ...baseFin, gastos: (baseFin.gastos || []).map(g => g.id === id ? { ...g, estado } : g) }
  try { localStorage.setItem('serein_fin', JSON.stringify(nuevoFin)) } catch (e) {}
  setFin(nuevoFin)
  pushState()
}
// Serie de un gasto recurrente: todas las filas materializadas de un mismo
// gasto Mensual/Anual comparten un serieId (el id de la fila original que
// las originó). Una fila sin serieId es su propia serie de una sola fila
// (gastos ya existentes de antes de este campo, o gastos Única/Semanal).
const serieDe = g => g.serieId || g.id
// ¿Ya existe, en esta serie, una fila real con vencimiento en este mes? —
// evita proyectar de nuevo un mes que ya fue confirmado (pagado, dejado
// pendiente con datos editados, o eliminado/anulado para ese mes puntual).
function serieTieneFilaPropiaEnMes(gastos, serieId, mes) {
  return gastos.some(g => serieDe(g) === serieId && mesDe(g.vencimiento) === mes)
}
// Convierte la ocurrencia PROYECTADA de un gasto recurrente (Mensual/Anual)
// en una fila real para ese mes puntual — con el estado y los campos que
// se le pasen en `cambios` (permite editar monto/proveedor/etc antes de
// confirmar, no solo copiar tal cual el gasto original). La fila ancla
// NUNCA se toca ni se cierra: sigue siendo la fuente de la proyección de
// cualquier otro mes que todavía no tenga su propia fila real (ver
// serieTieneFilaPropiaEnMes) — así materializar un mes no rompe la
// proyección de los demás, vengan antes o después.
async function materializarGastoProyectado(fin, setFin, gastoAnclaId, fechaOcurrencia, cambios) {
  try { await pullState() } catch (e) {}
  let fresco = null
  try { fresco = JSON.parse(localStorage.getItem('serein_fin') || 'null') } catch (e) {}
  const baseFin = fresco && typeof fresco === 'object' ? fresco : fin
  const gastos = baseFin.gastos || []
  const ancla = gastos.find(g => g.id === gastoAnclaId)
  if (!ancla) return
  const nueva = { ...ancla, ...cambios, id: 'g' + Date.now() + Math.random().toString(36).slice(2, 7), serieId: serieDe(ancla), vencimiento: fechaOcurrencia, frecuencia: 'Única' }
  const nuevoFin = { ...baseFin, gastos: [nueva, ...gastos] }
  try { localStorage.setItem('serein_fin', JSON.stringify(nuevoFin)) } catch (e) {}
  setFin(nuevoFin)
  pushState()
}
// Marca pagada una cuota puntual de un credito/leasing — las cuotas no se
// editan libremente (son parte de la tabla de amortizacion), solo se
// marcan como pagadas desde aca.
async function marcarCuotaPagada(fin, setFin, obligacionId, n) {
  try { await pullState() } catch (e) {}
  let fresco = null
  try { fresco = JSON.parse(localStorage.getItem('serein_fin') || 'null') } catch (e) {}
  const baseFin = fresco && typeof fresco === 'object' ? fresco : fin
  const nuevoFin = { ...baseFin, obligaciones: (baseFin.obligaciones || []).map(o => o.id !== obligacionId ? o : { ...o, cuotas: (o.cuotas || []).map(c => c.n === n ? { ...c, estado: 'Pagada' } : c) }) }
  try { localStorage.setItem('serein_fin', JSON.stringify(nuevoFin)) } catch (e) {}
  setFin(nuevoFin)
  pushState()
}
// Edita/elimina una compra de proyecto DIRECTO en p.compras[compraIndex] —
// misma fila y mismo criterio pull-fresh+merge+push que usa updCompra() en
// la ficha del proyecto (ProyectosModule.jsx), para que editar desde Pagos
// sea exactamente lo mismo que editarla ahi, nunca una copia paralela. El
// indice es el del arreglo COMPLETO de compras de ese proyecto (no de una
// vista filtrada) — asi nunca se pisa la fila equivocada.
async function actualizarCompraProyecto(proyectos, setProyectos, proyectoId, compraIndex, cambios) {
  try { await pullState() } catch (e) {}
  let fresco = null
  try { fresco = JSON.parse(localStorage.getItem('serein_proyectos') || 'null') } catch (e) {}
  const base = Array.isArray(fresco) ? fresco : proyectos
  const nuevo = base.map(p => p.id !== proyectoId ? p : { ...p, compras: p.compras.map((c, j) => j === compraIndex ? { ...c, ...cambios } : c) })
  try { localStorage.setItem('serein_proyectos', JSON.stringify(nuevo)) } catch (e) {}
  setProyectos(nuevo)
  pushState()
}
async function eliminarCompraProyecto(proyectos, setProyectos, proyectoId, compraIndex) {
  try { await pullState() } catch (e) {}
  let fresco = null
  try { fresco = JSON.parse(localStorage.getItem('serein_proyectos') || 'null') } catch (e) {}
  const base = Array.isArray(fresco) ? fresco : proyectos
  const nuevo = base.map(p => p.id !== proyectoId ? p : { ...p, compras: p.compras.filter((_, j) => j !== compraIndex) })
  try { localStorage.setItem('serein_proyectos', JSON.stringify(nuevo)) } catch (e) {}
  setProyectos(nuevo)
  pushState()
}
// Edicion rapida de una compra de proyecto desde Pagos — mismos campos
// clave que FormCompra (ProyectosModule.jsx), salvo el Centro de Costo:
// ese se deja tal cual (reclasificarlo requiere el catalogo de CC del
// proyecto, que es informacion propia de la ficha del proyecto) — para
// cambiar el CC se sigue entrando a Proyectos, todo lo demas se edita aca.
function FormEditarCompra({ item, proyectos, setProyectos, onCerrar }) {
  const c = item.compra
  const [f, setF] = useState({
    proveedor: c.proveedor || '', folio: c.folio || '', detalle: c.detalle || '',
    fecha: (c.fecha && c.fecha !== '—') ? c.fecha : '', monto: String(c.monto || ''), exento: !!c.exento, abonado: String(c.abonado || ''),
  })
  function guardar() {
    if (!f.proveedor || num(f.monto) <= 0) return
    actualizarCompraProyecto(proyectos, setProyectos, item.proyectoId, item.compraIndex, {
      proveedor: f.proveedor, folio: f.folio, detalle: f.detalle, fecha: f.fecha || '—',
      monto: num(f.monto), exento: f.exento, abonado: num(f.abonado),
    })
    onCerrar()
  }
  return (
    <div style={{ background: '#fff', border: `2px solid ${COLOR_TIPO_PAGO['Compra proyecto']}`, padding: 16, marginBottom: 14 }}>
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Editar compra de proyecto</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <input style={inp} placeholder="Proveedor *" value={f.proveedor} onChange={e => setF({ ...f, proveedor: e.target.value })} />
        <input style={inp} placeholder="N° doc / folio" value={f.folio} onChange={e => setF({ ...f, folio: e.target.value })} />
        <input style={inp} placeholder="Detalle" value={f.detalle} onChange={e => setF({ ...f, detalle: e.target.value })} />
        <label style={{ fontSize: 12, color: C.gris }}>Fecha<input type="date" style={{ ...inp, width: '100%' }} value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></label>
        <input style={inp} placeholder="Monto neto CLP *" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} />
        <label style={{ ...inp, display: 'flex', alignItems: 'center', gap: 6, border: 'none' }}><input type="checkbox" checked={f.exento} onChange={e => setF({ ...f, exento: e.target.checked })} /> Exenta (sin IVA)</label>
        <input style={inp} placeholder="Abonado CLP" value={f.abonado} onChange={e => setF({ ...f, abonado: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={guardar} style={{ background: C.verde, color: '#fff', border: 'none', padding: '9px 18px', cursor: 'pointer', fontSize: 13 }}>Guardar cambios</button>
        <button onClick={onCerrar} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
      </div>
    </div>
  )
}

// gastoInicial: si se pasa, el formulario edita esa fila en vez de crear
// una nueva (mismos campos, precargados) — usado tanto por el boton
// "Editar" de ListaGastos como por el modal de detalle de Pagos.
// proyectadoInicial: si se pasa (en vez de gastoInicial), el formulario
// precarga los datos de una ocurrencia PROYECTADA (item con .gasto = fila
// ancla, .vencimiento = fecha de ese mes) para poder editarla — al guardar
// no toca la fila ancla, crea una fila real nueva para ese mes puntual con
// los valores que queden en el formulario (mismo camino que
// materializarGastoProyectado, pero permitiendo cambiar cualquier campo
// antes de confirmar, no solo el estado).
function FormGasto({ tipo, fin, setFin, otsDisponibles = [], onCerrar, gastoInicial, proyectadoInicial }) {
  const editando = !!gastoInicial
  const materializando = !!proyectadoInicial
  const base = gastoInicial || (proyectadoInicial && proyectadoInicial.gasto)
  const cats = tipo === 'fijo' ? CATEGORIAS_FIJO : CATEGORIAS_VAR
  const [f, setF] = useState(() => base ? {
    nombre: base.nombre, categoria: base.categoria, proveedor: base.proveedor || '', documento: base.documento || '',
    neto: base.esUF ? '' : String(base.neto || ''), conIva: !!base.iva, vencimiento: materializando ? proyectadoInicial.vencimiento : (base.vencimiento || hoy()),
    frecuencia: base.frecuencia || 'Única', estado: materializando ? 'Pendiente' : (base.estado || 'Pendiente'), ot: base.ot || '', obs: base.obs || '',
    esUF: !!base.esUF, uf: base.esUF ? String(base.uf || '') : '', formaPago: base.formaPago || 'Transferencia',
    numeroCheque: base.numeroCheque || '', fechaCheque: base.fechaCheque || '',
  } : { nombre: '', categoria: cats[0], proveedor: '', documento: '', neto: '', conIva: tipo !== 'fijo', vencimiento: hoy(), frecuencia: tipo === 'fijo' ? 'Mensual' : 'Única', estado: 'Pendiente', ot: '', obs: '', esUF: false, uf: '', formaPago: 'Transferencia', numeroCheque: '', fechaCheque: '' })
  const [dist, setDist] = useState(() => base ? base.dist.map(d => ({ ...d })) : [{ area: 'General empresa', pct: 100 }])
  const suma = dist.reduce((a, d) => a + (parseFloat(d.pct) || 0), 0)
  const ok = Math.abs(suma - 100) < 0.01

  function guardar() {
    if (!f.nombre || (f.esUF ? num(f.uf) : num(f.neto)) <= 0 || !ok) return
    const neto = f.esUF ? Math.round(num(f.uf) * (fin.ufValor || 0)) : num(f.neto)
    const distFinal = dist.map(d => ({ area: d.area, pct: parseFloat(d.pct) }))
    if (materializando) {
      materializarGastoProyectado(fin, setFin, base.id, f.vencimiento, {
        nombre: f.nombre, categoria: f.categoria, proveedor: f.proveedor, documento: f.documento, neto, iva: f.conIva ? Math.round(neto * 0.19) : 0,
        estado: f.estado, ot: f.ot, dist: distFinal, obs: f.obs, esUF: f.esUF, uf: num(f.uf), formaPago: f.formaPago,
        numeroCheque: f.formaPago === 'Cheque' ? f.numeroCheque : '', fechaCheque: f.formaPago === 'Cheque' ? f.fechaCheque : '',
      })
      onCerrar()
      return
    }
    const g = { id: editando ? gastoInicial.id : 'g' + Date.now(), serieId: editando ? gastoInicial.serieId : undefined, tipo: editando ? gastoInicial.tipo : tipo, nombre: f.nombre, categoria: f.categoria, proveedor: f.proveedor, documento: f.documento, neto, iva: f.conIva ? Math.round(neto * 0.19) : 0, vencimiento: f.vencimiento, frecuencia: f.frecuencia, estado: f.estado, ot: f.ot, dist: distFinal, obs: f.obs, esUF: f.esUF, uf: num(f.uf), formaPago: f.formaPago, numeroCheque: f.formaPago === 'Cheque' ? f.numeroCheque : '', fechaCheque: f.formaPago === 'Cheque' ? f.fechaCheque : '' }
    if (editando) editarGastoFresco(fin, setFin, g); else agregarGastoFresco(fin, setFin, g)
    onCerrar()
  }

  return (
    <div style={{ background: '#fff', border: `2px solid ${C.naranja}`, padding: 16, marginBottom: 14 }}>
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>
        {materializando ? `Confirmar ${f.vencimiento.slice(0, 7)} de "${base.nombre}"` : editando ? 'Editar gasto' : `Nuevo gasto ${tipo === 'fijo' ? 'fijo' : 'variable / compra'}`}
      </div>
      {materializando && <div style={{ fontSize: 12, color: C.gris, marginBottom: 10 }}>Edita lo que cambie este mes en particular (monto, proveedor, etc.) — no afecta a los demás meses, que se siguen proyectando desde el gasto original.</div>}
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
        {!materializando && <select style={inp} value={f.frecuencia} onChange={e => setF({ ...f, frecuencia: e.target.value })}>{FRECUENCIAS.map(x => <option key={x}>{x}</option>)}</select>}
        <select style={inp} value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })}>{ESTADOS_GASTO.map(x => <option key={x}>{x}</option>)}</select>
        <select style={inp} value={f.ot} onChange={e => setF({ ...f, ot: e.target.value })}>
          <option value="">Sin OT/OC (gasto general)</option>
          {otsDisponibles.map(o => <option key={o}>{o}</option>)}
        </select>
        <select style={inp} value={f.formaPago} onChange={e => setF({ ...f, formaPago: e.target.value })}>{FORMAS_PAGO.map(x => <option key={x}>{x}</option>)}</select>
        {f.formaPago === 'Cheque' && <input style={inp} placeholder="Nº de cheque" value={f.numeroCheque} onChange={e => setF({ ...f, numeroCheque: e.target.value })} />}
        {f.formaPago === 'Cheque' && <label style={{ fontSize: 12, color: C.gris }}>Fecha del cheque<input type="date" style={{ ...inp, width: '100%' }} value={f.fechaCheque} onChange={e => setF({ ...f, fechaCheque: e.target.value })} /></label>}
      </div>
      {num(f.neto) > 0 && f.conIva && <div style={{ fontSize: 12, color: C.gris, marginTop: 6 }}>IVA: {clp(num(f.neto) * 0.19)} · Total: {clp(num(f.neto) * 1.19)}</div>}
      {f.ot && <div style={{ fontSize: 12, color: '#D9600A', background: '#FDECDD', padding: '6px 10px', marginTop: 6 }}>Este gasto se cargará como costo de la {f.ot} además del área.</div>}
      <EditorDistribucion dist={dist} setDist={setDist} plantillas={fin.plantillas} areas={fin.areas} />
      <input style={{ ...inp, width: '100%', marginTop: 8 }} placeholder="Observaciones" value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={guardar} disabled={!ok}
          style={{ background: ok ? C.verde : '#DFE4EA', color: '#fff', border: 'none', padding: '9px 18px', cursor: ok ? 'pointer' : 'not-allowed', fontSize: 13 }}>{materializando ? 'Confirmar este mes' : editando ? 'Guardar cambios' : 'Guardar gasto'}</button>
        <button onClick={onCerrar} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
      </div>
    </div>
  )
}

// ================= LISTA DE GASTOS =================
function ListaGastos({ tipo, fin, setFin, otsDisponibles }) {
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState(null)
  const [editandoProyectado, setEditandoProyectado] = useState(null)
  const [fArea, setFArea] = useState('')
  // Pestañas de mes (Ene-Dic de un año elegible con ‹ ›): reemplaza el
  // selector "Todos los meses"/un mes suelto de antes — se navega el año
  // completo. Por defecto abre en el mes en curso.
  const anioActual = Number(hoy().slice(0, 4))
  const [anioSel, setAnioSel] = useState(anioActual)
  const [mesSel, setMesSel] = useState(Number(hoy().slice(5, 7)))
  const mesKey = anioSel + '-' + String(mesSel).padStart(2, '0')
  const [seleccion, setSeleccion] = useState(() => new Set())
  const todosDelTipo = fin.gastos.filter(g => g.tipo === tipo)
  const porArea = fArea ? todosDelTipo.filter(g => (g.dist || []).some(d => d.area === fArea && (+d.pct || 0) > 0)) : todosDelTipo
  // Filas reales de este mes (su propia fila vive aca, se pueden editar) +
  // ocurrencias proyectadas de gastos Mensual/Anual cuya fila real vive en
  // otro mes — de solo lectura, solo para ver cuanto va a costar ese mes
  // sin tener que cargarlo de nuevo cada vez (pedido explícito: "mis fijos
  // los debo cargar solo 1 vez y luego deberían aparecer todos los meses").
  const gastosReales = porArea.filter(g => mesDe(g.vencimiento) === mesKey)
  const gastosProyectados = porArea
    .filter(g => g.estado !== 'Anulado' && (g.frecuencia === 'Mensual' || g.frecuencia === 'Anual') && mesDe(g.vencimiento) !== mesKey && gastoOcurreEnMes(g, mesKey) && !serieTieneFilaPropiaEnMes(todosDelTipo, serieDe(g), mesKey))
    .map(g => ({ ...g, vencimiento: fechaOcurrenciaEnMes(g, mesKey), _proyectado: true }))
  const gastos = [...gastosReales, ...gastosProyectados].sort((a, b) => (a.vencimiento || '').localeCompare(b.vencimiento || ''))
  // Con filtro de area, se cuenta solo la parte del gasto asignada a esa area
  const pctArea = g => fArea ? (g.dist || []).filter(d => d.area === fArea).reduce((a, d) => a + (+d.pct || 0), 0) / 100 : 1
  const resumen = gastos.filter(g => g.estado !== 'Anulado').reduce((a, g) => {
    const p = pctArea(g)
    const nt = netoEf(g, fin.ufValor)
    return { n: a.n + 1, neto: a.neto + nt * p, total: a.total + (nt + (g.iva || 0)) * p }
  }, { n: 0, neto: 0, total: 0 })

  async function duplicarMesSiguiente(g) {
    const d = new Date(g.vencimiento + 'T12:00:00')
    d.setMonth(d.getMonth() + 1)
    const nuevo = { ...g, id: 'g' + Date.now(), vencimiento: d.toISOString().slice(0, 10), estado: 'Pendiente' }
    // Un gasto "Mensual" cuenta desde su vencimiento en adelante en todos los meses futuros (ver gastosMes).
    // Si al duplicar se dejara la fila original también como "Mensual", ambas seguirían sumando el mismo
    // gasto para siempre. Por eso la fila original se cierra a "Única" (solo cuenta su propio mes) y la
    // nueva fila queda como la "Mensual" vigente hacia adelante.
    // Antes esto solo llamaba setFin(...) — nunca escribía en localStorage
    // ni llamaba pushState(), a diferencia de agregarGastoFresco/eliminarGastoFresco
    // de aquí mismo. La fila duplicada vivía solo en memoria: se perdía al
    // refrescar la página y nunca llegaba a otros dispositivos/sesiones.
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_fin') || 'null') } catch (e) {}
    const baseFin = fresco && typeof fresco === 'object' ? fresco : fin
    const nuevoFin = {
      ...baseFin,
      gastos: [nuevo, ...(baseFin.gastos || []).map(x => x.id === g.id && x.frecuencia === 'Mensual' ? { ...x, frecuencia: 'Única' } : x)],
    }
    try { localStorage.setItem('serein_fin', JSON.stringify(nuevoFin)) } catch (e) {}
    setFin(nuevoFin)
    pushState()
  }

  // Marcar varios gastos como pagados de una vez — antes había que abrir
  // el select de Estado fila por fila. Una sola escritura (pull-fresh +
  // merge) en vez de llamar cambiarEstadoGasto() en un loop, que
  // dispararía N pullState()/pushState() en paralelo con riesgo de
  // pisarse entre sí.
  async function marcarSeleccionadosPagados() {
    if (!seleccion.size) return
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_fin') || 'null') } catch (e) {}
    const baseFin = fresco && typeof fresco === 'object' ? fresco : fin
    const nuevoFin = { ...baseFin, gastos: (baseFin.gastos || []).map(g => seleccion.has(g.id) ? { ...g, estado: 'Pagado' } : g) }
    try { localStorage.setItem('serein_fin', JSON.stringify(nuevoFin)) } catch (e) {}
    setFin(nuevoFin)
    pushState()
    setSeleccion(new Set())
  }

  // Duplicar varios gastos al mes siguiente de una vez (mismo criterio
  // que duplicarMesSiguiente() de una fila: la original se cierra a
  // "Única" si era "Mensual", para no sumarse dos veces en la
  // proyección). Es lo que resuelve "necesito ingresar las de septiembre
  // y las futuras" sin tener que clickear el ícono de copiar fila por
  // fila.
  async function duplicarSeleccionadosMesSiguiente() {
    if (!seleccion.size) return
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_fin') || 'null') } catch (e) {}
    const baseFin = fresco && typeof fresco === 'object' ? fresco : fin
    const base = baseFin.gastos || []
    const nuevos = []
    const actualizados = base.map(g => {
      if (!seleccion.has(g.id)) return g
      const d = new Date(g.vencimiento + 'T12:00:00')
      d.setMonth(d.getMonth() + 1)
      nuevos.push({ ...g, id: 'g' + Date.now() + Math.random().toString(36).slice(2, 7), vencimiento: d.toISOString().slice(0, 10), estado: 'Pendiente' })
      return g.frecuencia === 'Mensual' ? { ...g, frecuencia: 'Única' } : g
    })
    const nuevoFin = { ...baseFin, gastos: [...nuevos, ...actualizados] }
    try { localStorage.setItem('serein_fin', JSON.stringify(nuevoFin)) } catch (e) {}
    setFin(nuevoFin)
    pushState()
    setSeleccion(new Set())
  }
  const alternarSeleccion = id => setSeleccion(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const seleccionarTodos = () => setSeleccion(s => s.size === gastosReales.length ? new Set() : new Set(gastosReales.map(g => g.id)))
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

  return (
    <div>
      {!creando && !editando && !editandoProyectado && (
        <button onClick={() => setCreando(true)}
          style={{ background: C.naranja, color: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <Plus size={15} /> Nuevo gasto {tipo === 'fijo' ? 'fijo' : 'variable'}
        </button>
      )}
      {creando && <FormGasto tipo={tipo} fin={fin} setFin={setFin} otsDisponibles={otsDisponibles} onCerrar={() => setCreando(false)} />}
      {editando && <FormGasto tipo={editando.tipo} fin={fin} setFin={setFin} otsDisponibles={otsDisponibles} gastoInicial={editando} onCerrar={() => setEditando(null)} />}
      {editandoProyectado && <FormGasto tipo={tipo} fin={fin} setFin={setFin} otsDisponibles={otsDisponibles} proyectadoInicial={editandoProyectado} onCerrar={() => setEditandoProyectado(null)} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 6px' }}>
        <button onClick={() => setAnioSel(a => a - 1)} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '4px 9px', cursor: 'pointer', fontSize: 13 }}>‹</button>
        <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 14, minWidth: 44, textAlign: 'center' }}>{anioSel}</span>
        <button onClick={() => setAnioSel(a => a + 1)} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '4px 9px', cursor: 'pointer', fontSize: 13 }}>›</button>
        <span style={{ fontSize: 11.5, color: C.gris, marginLeft: 6 }}>Los meses en gris muestran lo proyectado de tus gastos mensuales/anuales — se cargan una sola vez, no hace falta repetirlos.</span>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {MESES.map((m, i) => (
          <button key={m} onClick={() => { setMesSel(i + 1); setSeleccion(new Set()) }}
            style={{ background: mesSel === i + 1 ? C.naranja : '#fff', color: mesSel === i + 1 ? '#fff' : C.carbon, border: '1px solid #DFE4EA', padding: '6px 11px', fontSize: 12.5, fontWeight: mesSel === i + 1 ? 700 : 500, cursor: 'pointer' }}>
            {m}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.gris, textTransform: 'uppercase' }}>Area</span>
        <select value={fArea} onChange={e => setFArea(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #DFE4EA', fontSize: 13, background: '#fff' }}>
          <option value="">Todas las areas</option>
          {(fin.areas || []).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        {fArea && <button onClick={() => setFArea('')} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>Limpiar</button>}
      </div>

      {seleccion.size > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: '#FFF7E6', border: '1px solid #F0DBA8', padding: '8px 12px', marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{seleccion.size} seleccionada(s)</span>
          <button onClick={marcarSeleccionadosPagados} style={{ background: C.verde, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>Marcar como pagadas</button>
          <button onClick={duplicarSeleccionadosMesSiguiente} style={{ background: C.naranja, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>Duplicar al mes siguiente</button>
          <button onClick={() => setSeleccion(new Set())} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>Deseleccionar</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {[['Gastos', String(resumen.n)], [fArea ? 'Neto ' + fArea : 'Neto total', clp(Math.round(resumen.neto))], [fArea ? 'Total ' + fArea : 'Total con IVA', clp(Math.round(resumen.total))]].map(([k, v], n) => (
          <div key={n} style={{ flex: '1 1 180px', background: '#fff', border: '1px solid #DFE4EA', borderTop: '3px solid ' + C.naranja, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase', fontWeight: 700 }}>{k}</div>
            <div style={{ fontSize: 21, fontWeight: 700, color: C.carbon, fontFamily: SEREIN.fontDisplay }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #DFE4EA', padding: 18, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
                <th style={{ padding: '5px 8px' }}><input type="checkbox" checked={gastosReales.length > 0 && seleccion.size === gastosReales.length} onChange={seleccionarTodos} style={{ cursor: 'pointer' }} /></th>
              {['Gasto', 'Categoría', 'Proveedor', 'Neto', 'Total', 'Vence', 'Frec.', 'Estado', 'Distribución', ''].map(h => (
                <th key={h} style={{ textAlign: ['Neto', 'Total'].includes(h) ? 'right' : 'left', padding: '5px 8px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gastos.map(g => (
              <tr key={g._proyectado ? 'proy-' + g.id : g.id} style={{ borderBottom: '1px solid #DFE4EA', verticalAlign: 'top', background: g._proyectado ? '#FAFAF8' : 'transparent', opacity: g._proyectado ? 0.72 : (g.estado === 'Anulado' ? 0.45 : 1) }}>
                <td style={{ padding: '8px' }}>{!g._proyectado && <input type="checkbox" checked={seleccion.has(g.id)} onChange={() => alternarSeleccion(g.id)} style={{ cursor: 'pointer' }} />}</td>
                <td style={{ padding: '8px', fontWeight: 500 }}>{g.nombre}{g.ot && <div style={{ fontSize: 11, color: C.naranja, fontFamily: "'JetBrains Mono',monospace" }}>{g.ot}</div>}</td>
                <td style={{ padding: '8px', color: C.gris }}>{g.categoria}</td>
                <td style={{ padding: '8px', color: C.gris }}>{g.proveedor || '—'}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{clp(netoEf(g, fin.ufValor))}{g.esUF ? <span style={{ fontSize: 10, color: '#9AA3AD', display: 'block' }}>{g.uf} UF</span> : null}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{clp(netoEf(g, fin.ufValor) + g.iva)}</td>
                <td style={{ padding: '8px', color: C.gris, whiteSpace: 'nowrap' }}>{g.vencimiento}</td>
                <td style={{ padding: '8px', color: C.gris, fontSize: 12 }}>{g.frecuencia}</td>
                <td style={{ padding: '8px' }}>
                  {g._proyectado ? (
                    <select defaultValue="" onChange={e => e.target.value && materializarGastoProyectado(fin, setFin, g.id, g.vencimiento, { estado: e.target.value })} title="Elegir un estado carga este mes como una cuenta real"
                      style={{ border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '3px 6px', background: '#EEE', color: C.gris }}>
                      <option value="" disabled>Proyectado</option>
                      {ESTADOS_GASTO.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                  ) : (
                    <select value={g.estado} onChange={e => cambiarEstadoGasto(fin, setFin, g.id, e.target.value)}
                      style={{ border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '3px 6px', background: g.estado === 'Pagado' ? '#E6F7EE' : g.estado === 'Vencido' ? '#FCEBEA' : g.estado === 'Anulado' ? '#EEE' : '#FDECDD', color: g.estado === 'Pagado' ? C.verde : g.estado === 'Vencido' ? C.rojo : g.estado === 'Anulado' ? C.gris : '#D9600A' }}>
                      {ESTADOS_GASTO.map(x => <option key={x}>{x}</option>)}
                    </select>
                  )}
                </td>
                <td style={{ padding: '8px', fontSize: 12 }}>{g.dist.map(d => <div key={d.area}>{d.area}: {d.pct}% ({clp(netoEf(g, fin.ufValor) * d.pct / 100)})</div>)}</td>
                <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                  {g._proyectado ? (<>
                    <button title="Editar este mes antes de confirmar" onClick={() => setEditandoProyectado({ gasto: g, vencimiento: g.vencimiento })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gris }}><Pencil size={14} /></button>
                    <button title="Eliminar este mes (no afecta los demás)" onClick={() => window.confirm(`¿Marcar "${g.nombre}" de ${g.vencimiento} como que no corresponde pagarlo? No afecta otros meses.`) && materializarGastoProyectado(fin, setFin, g.id, g.vencimiento, { estado: 'Anulado' })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
                  </>) : (<>
                    <button title="Editar" onClick={() => setEditando(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gris }}><Pencil size={14} /></button>
                    <button title="Duplicar al mes siguiente" onClick={() => duplicarMesSiguiente(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gris }}><Copy size={14} /></button>
                    <button title="Eliminar" onClick={() => window.confirm(`¿Eliminar "${g.nombre}"?`) && eliminarGastoFresco(fin, setFin, g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
                  </>)}
                </td>
              </tr>
            ))}
            {gastos.length === 0 && <tr><td colSpan={11} style={{ padding: 16, textAlign: 'center', color: '#9AA3AD' }}>Sin gastos para {MESES[mesSel - 1]} {anioSel}.</td></tr>}
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

  async function agregarPlantillaFresca(plantilla) {
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_fin') || 'null') } catch (e) {}
    const baseFin = fresco && typeof fresco === 'object' ? fresco : fin
    const nuevoFin = { ...baseFin, plantillas: [...(baseFin.plantillas || []), plantilla] }
    try { localStorage.setItem('serein_fin', JSON.stringify(nuevoFin)) } catch (e) {}
    setFin(nuevoFin)
    pushState()
  }

  async function eliminarPlantillaFresca(id) {
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_fin') || 'null') } catch (e) {}
    const baseFin = fresco && typeof fresco === 'object' ? fresco : fin
    const nuevoFin = { ...baseFin, plantillas: (baseFin.plantillas || []).filter(x => x.id !== id) }
    try { localStorage.setItem('serein_fin', JSON.stringify(nuevoFin)) } catch (e) {}
    setFin(nuevoFin)
    pushState()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
      <div style={{ background: '#fff', border: '1px solid #DFE4EA', padding: 18 }}>
        <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Crear plantilla</div>
        <input style={{ ...inp, width: '100%', marginBottom: 8 }} placeholder='Nombre (ej: "SR / Istria 50-50")' value={nombre} onChange={e => setNombre(e.target.value)} />
        <EditorDistribucion dist={items} setDist={setItems} plantillas={[]} areas={fin.areas} />
        <button onClick={() => { if (nombre && ok) { agregarPlantillaFresca({ id: 'p' + Date.now(), nombre, items: items.map(i => ({ area: i.area, pct: parseFloat(i.pct) })) }); setNombre(''); setItems([{ area: AREAS_GASTO[0], pct: 100 }]) } }}
          disabled={!ok || !nombre}
          style={{ background: ok && nombre ? C.naranja : '#DFE4EA', color: '#fff', border: 'none', padding: '9px 18px', cursor: ok && nombre ? 'pointer' : 'not-allowed', fontSize: 13, marginTop: 10 }}>
          Guardar plantilla
        </button>
      </div>
      <div style={{ background: '#fff', border: '1px solid #DFE4EA', padding: 18 }}>
        <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Plantillas guardadas</div>
        {fin.plantillas.map(p => (
          <div key={p.id} style={{ borderBottom: '1px solid #DFE4EA', padding: '8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.nombre}</div>
              <div style={{ fontSize: 12, color: C.gris }}>{p.items.map(i => `${i.area} ${i.pct}%`).join(' · ')}</div>
            </div>
            <button onClick={() => window.confirm(`¿Eliminar plantilla "${p.nombre}"?`) && eliminarPlantillaFresca(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
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
    agregarObligacionFresca(o)
    setCreando(false)
  }

  async function agregarObligacionFresca(o) {
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_fin') || 'null') } catch (e) {}
    const baseFin = fresco && typeof fresco === 'object' ? fresco : fin
    const nuevoFin = { ...baseFin, obligaciones: [o, ...(baseFin.obligaciones || [])] }
    try { localStorage.setItem('serein_fin', JSON.stringify(nuevoFin)) } catch (e) {}
    setFin(nuevoFin)
    pushState()
  }

  // actualizarCuota() se llama por cada tecla al editar capital/interés de
  // una cuota. Antes escribía directo sobre la copia local (sin traer lo
  // más fresco) y subía al toque — mismo riesgo ya arreglado en OT
  // (protocolos), Facturas y Órdenes de Compra. La UI se actualiza al
  // instante; el guardado real hacia la nube se agrupa por cuota y se
  // posterga un momento (pull-fresh + merge + push recién cuando la
  // persona deja de escribir), para no disparar un pullState() por cada
  // tecla.
  const pendientesCuota = useRef({})
  const timersCuota = useRef({})
  function actualizarCuota(oid, n, cambios) {
    const nuevo = { ...fin, obligaciones: fin.obligaciones.map(o => o.id !== oid ? o : { ...o, cuotas: o.cuotas.map(c => c.n === n ? { ...c, ...cambios } : c) }) }
    try { localStorage.setItem('serein_fin', JSON.stringify(nuevo)) } catch (e) {}
    setFin(nuevo)
    const key = oid + ':' + n
    pendientesCuota.current[key] = { ...(pendientesCuota.current[key] || {}), ...cambios }
    clearTimeout(timersCuota.current[key])
    timersCuota.current[key] = setTimeout(async () => {
      const acumulados = pendientesCuota.current[key]
      delete pendientesCuota.current[key]
      if (!acumulados) return
      try { await pullState() } catch (e) {}
      let fresco = null
      try { fresco = JSON.parse(localStorage.getItem('serein_fin') || 'null') } catch (e) {}
      const baseFin = fresco && typeof fresco === 'object' ? fresco : fin
      const nuevoFin = { ...baseFin, obligaciones: (baseFin.obligaciones || []).map(o => o.id !== oid ? o : { ...o, cuotas: (o.cuotas || []).map(c => c.n === n ? { ...c, ...acumulados } : c) }) }
      try { localStorage.setItem('serein_fin', JSON.stringify(nuevoFin)) } catch (e) {}
      setFin(nuevoFin)
      pushState()
    }, 700)
  }

  async function eliminarObligacionFresca(id) {
    try { await pullState() } catch (e) {}
    let fresco = null
    try { fresco = JSON.parse(localStorage.getItem('serein_fin') || 'null') } catch (e) {}
    const baseFin = fresco && typeof fresco === 'object' ? fresco : fin
    const nuevoFin = { ...baseFin, obligaciones: (baseFin.obligaciones || []).filter(x => x.id !== id) }
    try { localStorage.setItem('serein_fin', JSON.stringify(nuevoFin)) } catch (e) {}
    setFin(nuevoFin)
    pushState()
  }

  return (
    <div>
      {!creando && (
        <button onClick={() => setCreando(true)}
          style={{ background: C.naranja, color: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontFamily: SEREIN.fontDisplay, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <Plus size={15} /> Nuevo crédito / leasing
        </button>
      )}
      {creando && (
        <div style={{ background: '#fff', border: `2px solid ${C.naranja}`, padding: 16, marginBottom: 14 }}>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Nueva obligación financiera</div>
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
            <button onClick={crear} disabled={!ok} style={{ background: ok ? C.verde : '#DFE4EA', color: '#fff', border: 'none', padding: '9px 18px', cursor: ok ? 'pointer' : 'not-allowed', fontSize: 13 }}>Crear con calendario</button>
            <button onClick={() => setCreando(false)} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
          </div>
        </div>
      )}

      {fin.obligaciones.map(o => {
        const pagadas = o.cuotas.filter(c => c.estado === 'Pagada')
        const saldo = o.cuotas.filter(c => c.estado !== 'Pagada').reduce((a, c) => a + c.total, 0)
        const vencidas = o.cuotas.filter(c => c.estado !== 'Pagada' && c.vencimiento < hoy())
        return (
          <div key={o.id} style={{ background: '#fff', border: '1px solid #DFE4EA', marginBottom: 14 }}>
            <div onClick={() => setAbierta(abierta === o.id ? null : o.id)} style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 15 }}>{o.tipo} · {o.institucion}</div>
                <div style={{ fontSize: 12, color: C.gris, marginTop: 2 }}>
                  {o.activo && `${o.activo} · `}{o.nCuotas} cuotas de {clp(o.valorCuota || (o.cuotas[0] && o.cuotas[0].total) || 0)} · día {o.diaVenc || (o.cuotas[0] && (o.cuotas[0].vencimiento || '').slice(8, 10)) || '—'} · {o.dist.map(d => `${d.area} ${d.pct}%`).join(', ')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Pagadas</div>
                  <div style={{ fontWeight: 600 }}>{pagadas.length}/{o.nCuotas}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>Saldo pendiente</div>
                  <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 16, color: C.naranja }}>{clp(saldo)}</div>
                </div>
                {vencidas.length > 0 && <span style={{ background: '#FCEBEA', color: C.rojo, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{vencidas.length} vencida{vencidas.length > 1 ? 's' : ''}</span>}
              </div>
            </div>
            {abierta === o.id && (
              <div style={{ borderTop: '1px solid #DFE4EA', padding: 18, overflowX: 'auto' }}>
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
                        <tr key={c.n} style={{ borderBottom: '1px solid #DFE4EA', background: vencida ? '#FDECDD' : 'transparent' }}>
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
                              style={{ background: c.estado === 'Pagada' ? '#E6F7EE' : vencida ? '#FCEBEA' : '#FDECDD', color: c.estado === 'Pagada' ? C.verde : vencida ? C.rojo : '#D9600A', border: 'none', padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
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
                  <button onClick={() => window.confirm(`¿Eliminar ${o.tipo} ${o.institucion} completo?`) && eliminarObligacionFresca(o.id)}
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
export const netoEf = (g, uf) => g.esUF ? Math.round((g.uf || 0) * (uf || 0)) : (g.neto || 0)
const flujoDe = c => (c.estado === 'Pagada' || c.aCargo === 'tercero_reembolsa') ? 0 : (c.total || 0)

// Un gasto "Mensual" tiene una ocurrencia cada mes desde su vencimiento en
// adelante (arriendo, ERP, etc. — se carga UNA vez y se repite solo); uno
// "Anual" la tiene cada año en el mismo mes/día (ej. patente); "Semanal" y
// "Única" solo cuentan en su propio mes. Una sola fuente para esta regla —
// calcularResumenFin/resumenGastosPeriodoArea la usan para sumar, y
// ListaGastos la usa para decidir qué mostrar en las pestañas de mes.
// g.vencimiento es 'YYYY-MM-DD': el mes va en slice(5,7), no slice(5)
// (que compara '07' contra '07-05' y nunca calza -> los gastos Anual
// desaparecían de todos los resúmenes/proyecciones).
function gastoOcurreEnMes(g, mes) {
  if (g.frecuencia === 'Mensual') return mes >= mesDe(g.vencimiento)
  if (g.frecuencia === 'Anual') return mes.slice(5, 7) === (g.vencimiento || '').slice(5, 7) && mes >= mesDe(g.vencimiento)
  return mesDe(g.vencimiento) === mes
}
// Fecha efectiva de la ocurrencia de un gasto recurrente en un mes dado —
// mismo día del mes original, ajustado si ese mes tiene menos días (ej. el
// 31 de un mes cae el último día del mes en uno de 30 o menos).
function fechaOcurrenciaEnMes(g, mes) {
  if (g.frecuencia !== 'Mensual' && g.frecuencia !== 'Anual') return g.vencimiento
  const dia = Number((g.vencimiento || '').slice(8, 10)) || 1
  const [anio, mesNum] = mes.split('-').map(Number)
  const ultimoDia = new Date(anio, mesNum, 0).getDate()
  return mes + '-' + String(Math.min(dia, ultimoDia)).padStart(2, '0')
}

export function calcularResumenFin(fin, mes) {
  const gastosMes = fin.gastos.filter(g => g.estado !== 'Anulado' && gastoOcurreEnMes(g, mes))
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

// calcularResumenFin() ya separa fijos/variables, pero solo a nivel
// empresa (no por área) y para UN mes. Para el resumen financiero por
// área (Santa Rosa/Istria) se necesita la misma separación fijo/variable
// pero prorrateada por área y sumada sobre varios meses (el periodo
// elegido) — se agrega esta función nueva en vez de modificar
// calcularResumenFin(), que ya usan Finanzas y el Consolidado.
export function resumenGastosPeriodoArea(fin, meses, area) {
  let fijos = 0, variables = 0, sinClasificar = 0
  ;(meses || []).forEach(mes => {
    const gastosMes = fin.gastos.filter(g => g.estado !== 'Anulado' && gastoOcurreEnMes(g, mes))
    gastosMes.forEach(g => {
      const pct = ((g.dist || []).find(d => d.area === area) || {}).pct || 0
      if (!pct) return
      const monto = netoEf(g, fin.ufValor) * pct / 100
      if (g.tipo === 'fijo') fijos += monto
      else if (g.tipo === 'variable') variables += monto
      else sinClasificar += monto
    })
  })
  return { fijos, variables, sinClasificar }
}

function ProyeccionFin({ fin }) {
  const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
  const now = new Date()
  // Antes calcularResumenFin() se llamaba UNA sola vez para el mes vigente
  // (r0) y ese mismo total (fijoM/varM) se repetía tal cual en las 12
  // barras/filas — la "proyección" mostraba el mismo número para todos los
  // meses en vez de un forecast real. calcularResumenFin(fin, mes) ya sabe
  // calcular la cifra correcta para CUALQUIER mes (filtra gastos Mensual/
  // Anual/Única por vencimiento y frecuencia, y cuotas por su propio
  // vencimiento), así que ahora se llama una vez POR mes futuro — igual que
  // ya hace ResumenMensual para el mes que el usuario elige ahí.
  const meses = []
  for (let k = 0; k < 12; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() + k, 1)
    const mesKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    const r = calcularResumenFin(fin, mesKey)
    const fijos = r.fijos || 0, total = fijos + (r.variables || 0)
    meses.push({ key: k, etiqueta: d.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }), fijos, total })
  }
  const max = Math.max(1, ...meses.map(m => m.total))
  return (
    <div style={{ background: '#fff', border: '1px solid #DFE4EA', padding: 18, marginTop: 16 }}>
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 4 }}>Proyeccion a 12 meses</div>
      <div style={{ fontSize: 12, color: '#9AA3AD', marginBottom: 14 }}>Forecast informativo: gastos fijos y variables proyectados mes a mes segun vencimiento y frecuencia cargada (los Mensuales y Anuales se repiten hacia adelante). Se actualiza a medida que cargas mas gastos.</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, marginBottom: 8 }}>
        {meses.map(m => (
          <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <div style={{ width: '100%', height: 115, position: 'relative' }}>
              <div title={'Fijos + variables ' + clp(m.total)} style={{ width: '68%', height: (m.total / max * 115) + 'px', background: '#F77716', position: 'absolute', bottom: 0, left: '16%' }} />
              <div title={'Fijos ' + clp(m.fijos)} style={{ width: '68%', height: (m.fijos / max * 115) + 'px', background: '#101315', position: 'absolute', bottom: 0, left: '16%' }} />
            </div>
            <div style={{ fontSize: 9, color: '#9AA3AD', whiteSpace: 'nowrap' }}>{m.etiqueta}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: '#9AA3AD', marginBottom: 10 }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#101315', marginRight: 5 }} />Gastos fijos</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#F77716', marginRight: 5 }} />Fijos + variables</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ borderBottom: '2px solid #101315' }}>{['Mes', 'Fijos', 'Fijos + variables'].map((h, i) => <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '6px 8px', fontSize: 11, color: '#9AA3AD', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
          <tbody>
            {meses.map(m => (<tr key={m.key} style={{ borderBottom: '1px solid #DFE4EA' }}><td style={{ padding: '6px 8px' }}>{m.etiqueta}</td><td style={{ padding: '6px 8px', textAlign: 'right' }}>{clp(m.fijos)}</td><td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{clp(m.total)}</td></tr>))}
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
    <div style={{ background: '#fff', border: '1px solid #DFE4EA', padding: 14, flex: '1 1 170px' }}>
      <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: SEREIN.fontDisplay, fontSize: 21, fontWeight: 600, color: color || C.carbon, whiteSpace: 'nowrap' }}>{valor}</div>
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
      <div style={{ background: '#fff', border: '1px solid #DFE4EA', padding: 18 }}>
        <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 10 }}>Gastos del mes por área</div>
        {Object.keys(r.porArea).length === 0 ? <div style={{ fontSize: 13, color: '#9AA3AD' }}>Sin gastos este mes.</div> : (
          Object.entries(r.porArea).sort((a, b) => b[1] - a[1]).map(([area, monto]) => {
            const max = Math.max(...Object.values(r.porArea))
            return (
              <div key={area} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 13, width: 170 }}>{area}</span>
                <div style={{ flex: 1, height: 8, background: '#DFE4EA' }}>
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

// ================= CUENTAS POR PAGAR: FUENTE ÚNICA =================
// Lista plana de todo lo pendiente por pagar (gastos fijos/variables +
// cuotas de créditos/leasing), ordenada por vencimiento. Reutilizada por
// la pantalla "Por pagar" y por el informe Excel — un solo cálculo, para
// que nunca se desalineen entre sí. Excluye lo Anulado/Pagado y las
// cuotas a cargo de un tercero que reembolsa (mismo criterio que
// flujoDe(): no son una salida de caja real de Serein).
function itemsPorPagar(fin, proyectos = []) {
  const areasDe = dist => (dist || []).map(d => `${d.area} ${d.pct}%`).join(', ')
  const items = []
  fin.gastos.filter(g => g.estado !== 'Anulado' && g.estado !== 'Pagado').forEach(g => {
    items.push({
      id: 'g-' + g.id,
      vencimiento: g.vencimiento || '',
      tipo: g.tipo === 'fijo' ? 'Gasto fijo' : 'Gasto variable',
      detalle: g.nombre || g.categoria || '',
      proveedor: g.proveedor || '',
      area: areasDe(g.dist),
      categoria: g.categoria || '',
      monto: Math.round(netoEf(g, fin.ufValor)),
      tabDestino: g.tipo === 'fijo' ? 'fijos' : 'variables',
      formaPago: g.formaPago || 'Transferencia',
      chequeInfo: g.formaPago === 'Cheque' ? [g.numeroCheque, g.fechaCheque].filter(Boolean).join(' · ') : '',
      origen: 'gasto',
      gasto: g,
    })
  })
  fin.obligaciones.forEach(o => {
    (o.cuotas || []).filter(c => c.estado !== 'Pagada' && c.aCargo !== 'tercero_reembolsa').forEach(c => {
      items.push({
        id: 'c-' + o.id + '-' + c.n,
        vencimiento: c.vencimiento || '',
        tipo: o.tipo || 'Crédito',
        detalle: (o.producto || o.institucion || '') + ' · cuota ' + c.n + '/' + o.nCuotas,
        proveedor: o.institucion || '',
        area: areasDe(o.dist),
        monto: Math.round(c.total || 0),
        tabDestino: 'creditos',
        origen: 'cuota',
        obligacionId: o.id,
        cuotaN: c.n,
      })
    })
  })
  // Compras de cada proyecto (pintura, materiales, subcontratos) con saldo
  // pendiente — se leen desde ProyectosModule, nunca se duplican: es la
  // MISMA fila que ProyectosModule guarda en p.compras[j], por eso se
  // guarda aca su indice real (compraIndex, sobre el arreglo completo sin
  // filtrar) — permite editarla/eliminarla desde Pagos escribiendo
  // directo sobre esa fila, sin mantener una copia aparte.
  ;(proyectos || []).forEach(p => {
    ;(p.compras || []).forEach((c, i) => {
      const bruto = montoBrutoCompra(c)
      const pendiente = bruto - (+c.abonado || 0)
      if (pendiente <= 0) return
      // El vencimiento que importa para Pagos es la fecha de PAGO, no la de
      // emisión — una compra "Programado" trae su propia fecha de
      // vencimiento (pedido explícito: "con su respectiva fecha de
      // vencimiento"); si es al contado o no se cargó vencimiento, se usa
      // la fecha de emisión como antes, para no perder las compras viejas.
      const vencimientoPago = (c.formaPago === 'Programado' && c.vencimiento) ? c.vencimiento : ((c.fecha && c.fecha !== '—') ? c.fecha : '')
      const notaFactoring = c.factorizada ? (' · Factorizada' + (c.factoringNombre ? (' a ' + c.factoringNombre) : '')) : ''
      items.push({
        id: 'c-' + p.id + '-' + (c.folio || '') + '-' + (c.fecha || '') + '-' + bruto,
        vencimiento: vencimientoPago,
        tipo: 'Compra proyecto',
        detalle: (c.detalle || c.proveedor || 'Compra') + ' · OT ' + (p.ot || p.nombre || '—') + (c.formaPago === 'Programado' ? ' · Pago programado' : '') + notaFactoring,
        proveedor: c.proveedor || '',
        rut: c.rut || '',
        folio: c.folio || '',
        ot: p.ot || '',
        area: '',
        monto: Math.round(pendiente),
        tabDestino: null,
        formaPago: 'Transferencia',
        chequeInfo: '',
        origen: 'compra_proyecto',
        proyectoId: p.id,
        compraIndex: i,
        compra: c,
      })
    })
  })
  items.sort((a, b) => (a.vencimiento || '9999').localeCompare(b.vencimiento || '9999'))
  return items
}

// ================= PANTALLA: POR PAGAR (hub de entrada al módulo) =================
// Responde al pedido "ver de manera amigable lo que debo pagar, lo que
// está por vencer" — agrupa itemsPorPagar() por urgencia real (vencido /
// esta semana / resto del mes / más adelante) en vez de por tipo de
// dato, que es como estaba organizado el módulo antes (había que saber
// de antemano si algo era "fijo" o "variable" para encontrarlo). Los
// botones de abajo llevan a la pestaña correspondiente para cargar un
// gasto o crédito nuevo — no duplican los formularios que ya existen.
const COLOR_TIPO_PAGO = { 'Gasto fijo': '#2563EB', 'Gasto variable': '#D97706', 'Compra proyecto': '#0E9F6E', 'Nómina': '#7C3AED', default: C.gris }
// Nómina = sueldos + imposiciones — se agrupan SIEMPRE juntos, aparte del
// resto, para no tener que revisarlos "parte por parte" mezclados con
// arriendo/luz/etc. (pedido explícito). Categorías de CATEGORIAS_FIJO.
const esNomina = categoria => /sueldo/i.test(categoria || '') || categoria === 'Imposiciones'
// Tarjeta de KPI al estilo tablero de colores sólidos (fondo lleno, no solo
// un borde) — más llamativo que las tarjetas blancas del resto de la app,
// a pedido explícito ("visualización de estos colores").
function kpiSolida(label, valor, color, icono, sub, onClick) {
  return (
    <div onClick={onClick} style={{ background: color, color: '#fff', borderRadius: 10, padding: '14px 16px', flex: '1 1 190px', boxShadow: '0 2px 6px rgba(0,0,0,.12)', cursor: onClick ? 'pointer' : 'default', transition: 'transform .1s ease, box-shadow .1s ease' }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 14px rgba(0,0,0,.2)' } }}
      onMouseLeave={e => { if (onClick) { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,.12)' } }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 22 }}>{valor}</div>
        {icono}
      </div>
      <div style={{ fontSize: 12, marginTop: 4, opacity: 0.92 }}>{label}</div>
      {sub && <div style={{ fontSize: 10.5, marginTop: 3, opacity: 0.8 }}>{sub}</div>}
      {onClick && <div style={{ fontSize: 10, marginTop: 6, opacity: 0.75, textDecoration: 'underline' }}>Ver detalle</div>}
    </div>
  )
}
// Celda "Cuenta bancaria" de cada fila: si el proveedor ya tiene cuenta en su
// ficha se muestra (y se puede corregir); si no, deja cargarla ahi mismo. Las
// cuotas de credito no llevan (el banco ya es el acreedor).
function celdaCuenta(x, cuentas) {
  if (x.origen === 'cuota' || !x.proveedor) return <span style={{ color: C.gris }}>—</span>
  const c = cuentas.de(x)
  return c ? (
    <div>
      <div style={{ fontWeight: 600 }}>{c.banco}{c.tipoCuenta ? ' · ' + c.tipoCuenta : ''}</div>
      <div style={{ color: C.gris }}>{c.numeroCuenta ? 'N° ' + c.numeroCuenta : ''}{c.titularCuenta ? ' · ' + c.titularCuenta : ''}</div>
      <button onClick={() => cuentas.editar(x)} style={{ background: 'none', border: 'none', color: C.naranja, cursor: 'pointer', fontSize: 11, padding: 0 }}>Editar</button>
    </div>
  ) : (
    <button onClick={() => cuentas.editar(x)} style={{ background: 'none', border: `1px dashed ${C.naranja}`, color: C.naranja, cursor: 'pointer', fontSize: 11, padding: '3px 8px' }}>+ Agregar cuenta</button>
  )
}
const BANCOS_CL = ['Banco de Chile', 'BancoEstado', 'Banco Santander', 'Banco BCI', 'Scotiabank', 'Banco Itaú', 'Banco Security', 'Banco Falabella', 'Banco Ripley', 'Banco Consorcio', 'Banco Internacional', 'Banco BICE', 'Tenpo', 'Mercado Pago', 'Mach']
function FormCuentaProveedor({ proveedor, rut, contactos, setContactos, onCerrar }) {
  const actual = cuentaDe(contactos, { nombre: proveedor, rut }) || {}
  const [f, setF] = useState({ banco: actual.banco || '', tipoCuenta: actual.tipoCuenta || 'Cuenta corriente', numeroCuenta: actual.numeroCuenta || '', titularCuenta: actual.titularCuenta || '', emailPago: actual.emailPago || '', rut: rut || (buscarProveedor(contactos, { nombre: proveedor, rut }) || {}).rut || '' })
  const guardar = async () => {
    if (!f.banco.trim() || !f.numeroCuenta.trim()) return
    await guardarCuentaProveedor(contactos, setContactos, { nombre: proveedor, rut: f.rut }, f)
    onCerrar()
  }
  return (
    <div style={{ background: '#fff', border: `2px solid ${C.naranja}`, padding: 16 }}>
      <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', marginBottom: 2 }}>Cuenta bancaria · {proveedor}</div>
      <div style={{ fontSize: 11.5, color: C.gris, marginBottom: 10 }}>Queda guardada en la ficha del proveedor: en la próxima factura o pago de este proveedor ya no hay que volver a escribirla.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
        <input list="bancos-cl" style={inp} placeholder="Banco *" value={f.banco} onChange={e => setF({ ...f, banco: e.target.value })} />
        <datalist id="bancos-cl">{BANCOS_CL.map(b => <option key={b} value={b} />)}</datalist>
        <select style={inp} value={f.tipoCuenta} onChange={e => setF({ ...f, tipoCuenta: e.target.value })}>{TIPOS_CUENTA.map(t => <option key={t}>{t}</option>)}</select>
        <input style={inp} placeholder="N° de cuenta *" value={f.numeroCuenta} onChange={e => setF({ ...f, numeroCuenta: e.target.value })} />
        <input style={inp} placeholder="RUT del titular / proveedor" value={f.rut} onChange={e => setF({ ...f, rut: e.target.value })} />
        <input style={inp} placeholder="Titular (si es distinto)" value={f.titularCuenta} onChange={e => setF({ ...f, titularCuenta: e.target.value })} />
        <input style={inp} placeholder="Correo para aviso de pago" value={f.emailPago} onChange={e => setF({ ...f, emailPago: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={guardar} style={{ background: C.verde, color: '#fff', border: 'none', padding: '9px 18px', cursor: 'pointer', fontSize: 13 }}>Guardar cuenta</button>
        <button onClick={onCerrar} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
      </div>
    </div>
  )
}
// Tabla de filas de itemsPorPagar() — reutilizada tanto por cada seccion()
// de la pantalla (solo lectura, sin acciones) como por el modal de detalle
// que abren las tarjetas KPI (con acciones), para no mantener dos veces el
// mismo marcado. acciones() opcional: recibe la fila y devuelve el JSX de
// la columna de la derecha (editar/eliminar/marcar pagada segun el origen).
function tablaItemsPago(filas, acciones, cuentas) {
  return (
    <div style={{ background: '#fff', border: '1px solid #DFE4EA', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ borderBottom: '1px solid #DFE4EA' }}>
          {['Vencimiento', 'Tipo', 'Detalle', 'Forma de pago', ...(cuentas ? ['Cuenta bancaria'] : []), 'Monto', ...(acciones ? [''] : [])].map(hh => (
            <th key={hh} style={{ textAlign: hh === 'Monto' ? 'right' : 'left', padding: '6px 10px', fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{hh}</th>
          ))}
        </tr></thead>
        <tbody>
          {filas.map(x => { const colorTipo = COLOR_TIPO_PAGO[x.tipo] || COLOR_TIPO_PAGO.default; return (
            <tr key={x.id} style={{ borderBottom: '1px solid #F2F4F7' }}>
              <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{x.vencimiento || <span style={{ color: C.gris }}>—</span>}</td>
              <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}><span style={{ background: colorTipo + '22', color: colorTipo, fontWeight: 700, fontSize: 11, padding: '3px 8px', borderRadius: 20 }}>{x.tipo}</span></td>
              <td style={{ padding: '6px 10px' }}>{x.detalle}{x.proveedor ? <span style={{ color: C.gris }}> · {x.proveedor}</span> : ''}</td>
              <td style={{ padding: '6px 10px', fontSize: 12 }}>{x.formaPago === 'Cheque' ? <span title={x.chequeInfo}>🧾 Cheque{x.chequeInfo ? ' · ' + x.chequeInfo : ''}</span> : <span style={{ color: C.gris }}>Transferencia</span>}</td>
              {cuentas && <td style={{ padding: '6px 10px', fontSize: 12, minWidth: 150 }}>{celdaCuenta(x, cuentas)}</td>}
              <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>{clp(x.monto)}</td>
              {acciones && <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{acciones(x)}</td>}
            </tr>
          )})}
        </tbody>
      </table>
    </div>
  )
}
// Modal de detalle que abre cada tarjeta KPI de colores — mismo patron de
// overlay ya usado en la ficha de OT (fondo oscuro + panel centrado, clic
// afuera o boton Cerrar para salir). A pedido explicito ("necesito agregar,
// eliminar, editar") las filas que son gastos (fijo/variable) se pueden
// editar/eliminar directo desde aca, las cuotas de credito se pueden marcar
// pagadas, y hay un boton para cargar un gasto nuevo sin salir del modal —
// todo escribe con los mismos helpers pull-fresh+merge+push que usa
// ListaGastos, nunca una copia paralela. Las compras de proyecto siguen
// siendo de solo lectura aca (se editan en la ficha del proyecto, que es
// donde vive el resto de sus datos — folio, abono, etc.).
// Puramente presentacional — quien la abre (PorPagar) le pasa que hacer al
// tocar cada boton (acciones) y los botones de "cargar gasto nuevo"
// (onCrearGasto), para que editar/crear se comporte identico venga el clic
// de esta ventana o de las secciones de la pantalla principal de Pagos: un
// solo estado de edicion, un solo formulario, nunca dos copias.
function ModalDetallePago({ titulo, color, filas, sub, onClose, acciones, onCrearGasto, cuentas, onExcel }) {
  const total = (filas || []).reduce((a, x) => a + x.monto, 0)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,26,46,.55)', zIndex: 70, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#F7F6F3', width: '100%', maxWidth: 1080, boxShadow: '0 20px 60px -12px rgba(0,0,0,.4)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `3px solid ${color}`, background: '#fff' }}>
          <div>
            <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 15, textTransform: 'uppercase', color }}>{titulo}</div>
            {sub && <div style={{ fontSize: 12, color: C.gris, marginTop: 2 }}>{sub}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #DFE4EA', cursor: 'pointer', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}><X size={15} /> Cerrar</button>
        </div>
        <div style={{ padding: 16 }}>
          {onCrearGasto && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button onClick={() => onCrearGasto('fijo')} style={{ background: C.naranja, color: '#fff', border: 'none', padding: '8px 14px', cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={13} /> Gasto fijo</button>
              <button onClick={() => onCrearGasto('variable')} style={{ background: 'none', border: `1px dashed ${C.naranja}`, color: C.carbon, padding: '8px 14px', cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={13} /> Gasto variable</button>
              {onExcel && filas && filas.length > 0 && <button onClick={onExcel} style={{ marginLeft: 'auto', background: 'none', border: `1px solid ${C.verde}`, color: C.verde, padding: '8px 14px', cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}><Download size={13} /> Descargar Excel</button>}
            </div>
          )}
          {filas ? (
            filas.length === 0 ? (
              <div style={{ fontSize: 13, color: C.gris }}>No hay cuentas en este grupo.</div>
            ) : (<>
              <div style={{ fontSize: 12.5, color: C.gris, marginBottom: 8 }}>{filas.length} cuenta(s) · total <b style={{ color: C.carbon }}>{clp(total)}</b></div>
              {tablaItemsPago(filas, acciones, cuentas)}
            </>)
          ) : null}
        </div>
      </div>
    </div>
  )
}
// Overlay generico para el formulario de edicion/creacion que dispara
// cualquier boton de accion — flota por encima del modal de detalle
// cuando corresponde (zIndex mas alto), mismo patron de fondo oscuro +
// clic afuera para cerrar que el resto de la app.
function OverlayFormulario({ onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,26,46,.65)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 640 }}>{children}</div>
    </div>
  )
}
// Excel de pagos con todos los datos de cada fila + la cuenta bancaria fija del
// proveedor (de su ficha en Clientes y Proveedores), lista para transferir.
function descargarExcelPagos(filas, contactos, nombreArchivo) {
  const h = hoy()
  const data = filas.map(x => {
    const prov = buscarProveedor(contactos, { nombre: x.proveedor, rut: x.rut }) || {}
    const c = cuentaDe(contactos, { nombre: x.proveedor, rut: x.rut }) || {}
    return {
      Vencimiento: x.vencimiento || '',
      Estado: x.origen === 'proyectado' ? 'Proyectado' : (x.vencimiento && x.vencimiento < h) ? 'Vencido' : 'Pendiente',
      Tipo: x.tipo || '',
      Detalle: x.detalle || '',
      Proveedor: x.proveedor || '',
      RUT: x.rut || prov.rut || '',
      'N° documento': x.folio || '',
      OT: x.ot || '',
      Área: x.area || '',
      Categoría: x.categoria || '',
      'Forma de pago': x.formaPago === 'Cheque' ? 'Cheque' + (x.chequeInfo ? ' · ' + x.chequeInfo : '') : 'Transferencia',
      Banco: c.banco || '',
      'Tipo de cuenta': c.tipoCuenta || '',
      'N° de cuenta': c.numeroCuenta || '',
      Titular: c.titularCuenta || '',
      'Correo aviso de pago': c.emailPago || prov.emailPago || '',
      Monto: x.monto || 0,
    }
  })
  const total = data.reduce((a, r) => a + (r.Monto || 0), 0)
  const hoja = XLSX.utils.json_to_sheet(data.length ? data : [{ Vencimiento: 'Sin cuentas pendientes' }])
  if (data.length) XLSX.utils.sheet_add_aoa(hoja, [['', '', '', 'TOTAL', '', '', '', '', '', '', '', '', '', '', '', '', total]], { origin: -1 })
  hoja['!cols'] = [12, 11, 16, 46, 32, 13, 12, 10, 14, 14, 18, 16, 16, 16, 24, 26, 14].map(w => ({ wch: w }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, hoja, 'Pagos')
  XLSX.writeFile(wb, nombreArchivo + '_' + h + '.xlsx')
}
export function PorPagar({ fin, setFin, proyectos, setProyectos, params, setParams, contactos, setContactos, otsDisponibles, irA }) {
  const [detalle, setDetalle] = useState(null)
  // Un solo estado de edicion/creacion para TODA la pantalla — lo usan por
  // igual las secciones de abajo (Nominas, Proveedores, Vencido, etc.) y el
  // modal de detalle que abre cada tarjeta, asi editar una fila se ve y se
  // comporta identico sin importar desde donde se clickeo.
  const [editandoGasto, setEditandoGasto] = useState(null)
  const [creandoGasto, setCreandoGasto] = useState(null) // 'fijo' | 'variable' | null
  const [editandoCompra, setEditandoCompra] = useState(null)
  const [editandoProyectado, setEditandoProyectado] = useState(null)
  const [editandoCuenta, setEditandoCuenta] = useState(null)
  const cuentas = setContactos ? { de: x => cuentaDe(contactos, { nombre: x.proveedor, rut: x.rut }), editar: x => setEditandoCuenta(x) } : null
  const puedeEditarProyectos = !!setProyectos
  const items = itemsPorPagar(fin, proyectos)
  const h = hoy()
  const en7 = new Date(); en7.setDate(en7.getDate() + 7)
  const en7s = en7.toISOString().slice(0, 10)
  const mesActual = h.slice(0, 7)
  // Pestañas Ene-Dic (con año navegable) — al elegir un mes se ve TODO lo
  // que corresponde pagar ese mes en un solo lugar (fijos, variables,
  // créditos, nóminas, proveedores), no solo lo vencido/de esta semana.
  // Abre por defecto en el mes en curso. Mismo criterio de proyección que
  // ya usa ListaGastos (Finanzas): un gasto Mensual/Anual cuya fila real
  // vive en otro mes aparece igual, de solo lectura ("Proyectado") — el
  // pago en sí se marca cuando ese mes llega de verdad.
  const MESES_PAGOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const [anioPagos, setAnioPagos] = useState(Number(h.slice(0, 4)))
  const [mesPagos, setMesPagos] = useState(Number(h.slice(5, 7)))
  const mesPagosKey = anioPagos + '-' + String(mesPagos).padStart(2, '0')
  const itemsRealesMes = items.filter(x => mesDe(x.vencimiento) === mesPagosKey)
  const gastosProyectadosMes = fin.gastos
    .filter(g => g.estado !== 'Anulado' && (g.frecuencia === 'Mensual' || g.frecuencia === 'Anual') && mesDe(g.vencimiento) !== mesPagosKey && gastoOcurreEnMes(g, mesPagosKey) && !serieTieneFilaPropiaEnMes(fin.gastos, serieDe(g), mesPagosKey))
    .map(g => ({
      id: 'proy-' + g.id + '-' + mesPagosKey,
      vencimiento: fechaOcurrenciaEnMes(g, mesPagosKey),
      tipo: g.tipo === 'fijo' ? 'Gasto fijo' : 'Gasto variable',
      detalle: g.nombre || g.categoria || '',
      proveedor: g.proveedor || '',
      categoria: g.categoria || '',
      monto: Math.round(netoEf(g, fin.ufValor)),
      formaPago: g.formaPago || 'Transferencia',
      chequeInfo: '',
      origen: 'proyectado',
      gasto: g,
    }))
  const itemsMes = [...itemsRealesMes, ...gastosProyectadosMes].sort((a, b) => (a.vencimiento || '9999').localeCompare(b.vencimiento || '9999'))
  const nominasMes = itemsMes.filter(x => esNomina(x.categoria))
  const proveedoresMes = itemsMes.filter(x => x.tipo === 'Compra proyecto')
  const restoMes = itemsMes.filter(x => !esNomina(x.categoria) && x.tipo !== 'Compra proyecto')
  const totalMesPagos = itemsMes.reduce((a, x) => a + x.monto, 0)
  const nominas = items.filter(x => esNomina(x.categoria)).sort((a, b) => (a.vencimiento || '9999').localeCompare(b.vencimiento || '9999'))
  const proveedores = items.filter(x => x.tipo === 'Compra proyecto')
  const grupos = [
    { id: 'vencido', label: 'Vencido', color: C.rojo, filtro: x => !!x.vencimiento && x.vencimiento < h },
    { id: 'semana', label: 'Esta semana', color: C.naranja, filtro: x => x.vencimiento >= h && x.vencimiento <= en7s },
    { id: 'mes', label: 'Resto del mes', color: '#0E7A8F', filtro: x => x.vencimiento > en7s && mesDe(x.vencimiento) === mesActual },
    { id: 'despues', label: 'Más adelante', color: C.gris, filtro: x => x.vencimiento > en7s && mesDe(x.vencimiento) !== mesActual },
  ]
  const totalGeneral = items.reduce((a, x) => a + x.monto, 0)
  const totalVencido = items.filter(grupos[0].filtro).reduce((a, x) => a + x.monto, 0)
  const totalSemana = items.filter(grupos[1].filtro).reduce((a, x) => a + x.monto, 0)
  const totalMes = items.filter(x => mesDe(x.vencimiento) === mesActual).reduce((a, x) => a + x.monto, 0)
  const totalNominas = nominas.reduce((a, x) => a + x.monto, 0)
  const totalProveedores = proveedores.reduce((a, x) => a + x.monto, 0)
  const uf = (params && params.uf) || { valor: fin.ufValor || 0, fecha: '' }
  const ufHoyOk = uf.fecha === h
  const btnAgregar = { background: 'none', border: `1px dashed #C9C4B8`, color: C.carbon, padding: '8px 14px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }
  // Acciones por fila (editar/eliminar un gasto, marcar pagada una cuota,
  // editar/eliminar una compra de proyecto) — una sola vez para toda la
  // pantalla, la usan tanto las secciones de abajo como el modal de detalle.
  const estiloEstado = estado => ({ border: 'none', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: '3px 6px', borderRadius: 4, marginRight: 4, background: estado === 'Pagado' ? '#E6F7EE' : estado === 'Vencido' ? '#FCEBEA' : estado === 'Anulado' ? '#EEE' : '#FDECDD', color: estado === 'Pagado' ? C.verde : estado === 'Vencido' ? C.rojo : estado === 'Anulado' ? C.gris : '#D9600A' })
  const acciones = x => {
    if (x.origen === 'gasto') return (<>
      <select value={x.gasto.estado} onChange={e => cambiarEstadoGasto(fin, setFin, x.gasto.id, e.target.value)} style={estiloEstado(x.gasto.estado)}>
        {ESTADOS_GASTO.map(v => <option key={v}>{v}</option>)}
      </select>
      <button title="Editar" onClick={() => setEditandoGasto(x.gasto)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gris }}><Pencil size={14} /></button>
      <button title="Eliminar" onClick={() => window.confirm(`¿Eliminar "${x.gasto.nombre}"?`) && eliminarGastoFresco(fin, setFin, x.gasto.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
    </>)
    if (x.origen === 'cuota') return (
      <button onClick={() => marcarCuotaPagada(fin, setFin, x.obligacionId, x.cuotaN)} style={{ background: 'none', border: `1px solid ${C.verde}`, color: C.verde, borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>Marcar pagada</button>
    )
    // "Marcar pagada" escribe directo en la MISMA fila p.compras[j] que
    // usa la ficha del proyecto (actualizarCompraProyecto, ya pull-fresh +
    // merge + push) — así pagarla desde acá o desde Proyectos es
    // literalmente la misma escritura, nunca dos copias que puedan
    // desincronizarse entre sí.
    if (x.origen === 'compra_proyecto') return puedeEditarProyectos ? (<>
      <button onClick={() => actualizarCompraProyecto(proyectos, setProyectos, x.proyectoId, x.compraIndex, { abonado: montoBrutoCompra(x.compra) })} style={{ background: 'none', border: `1px solid ${C.verde}`, color: C.verde, borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', marginRight: 4 }}>Marcar pagada</button>
      <button title="Editar" onClick={() => setEditandoCompra(x)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gris }}><Pencil size={14} /></button>
      <button title="Eliminar" onClick={() => window.confirm(`¿Eliminar la compra de "${x.proveedor || x.detalle}"?`) && eliminarCompraProyecto(proyectos, setProyectos, x.proyectoId, x.compraIndex)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
    </>) : <span title="Se edita en la ficha del proyecto correspondiente" style={{ color: C.gris, fontSize: 11 }}>—</span>
    // Proyectado: al elegir un estado, o al guardar el formulario de
    // Editar, se crea recien ahi la fila real de ese mes puntual
    // (materializarGastoProyectado) — antes de eso no existe nada que
    // tocar. Eliminar = confirmar ese mes como Anulado (no corresponde
    // pagarlo), sin afectar ningun otro mes de la misma serie.
    if (x.origen === 'proyectado') return (<>
      <select defaultValue="" onChange={e => e.target.value && materializarGastoProyectado(fin, setFin, x.gasto.id, x.vencimiento, { estado: e.target.value })} title="Elegir un estado carga este mes como una cuenta real" style={{ ...estiloEstado(''), background: '#EEE', color: C.gris }}>
        <option value="" disabled>Proyectado</option>
        {ESTADOS_GASTO.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <button title="Editar este mes antes de confirmar" onClick={() => setEditandoProyectado(x)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gris }}><Pencil size={14} /></button>
      <button title="Eliminar este mes (no afecta los demás)" onClick={() => window.confirm(`¿Marcar "${x.detalle}" de ${x.vencimiento} como que no corresponde pagarlo? No afecta otros meses.`) && materializarGastoProyectado(fin, setFin, x.gasto.id, x.vencimiento, { estado: 'Anulado' })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={14} /></button>
    </>)
    return null
  }
  const seccion = (titulo, color, filas, icono) => filas.length > 0 && (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: `4px solid ${color}`, paddingLeft: 10, marginBottom: 8 }}>
        <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 13, textTransform: 'uppercase', color, display: 'flex', alignItems: 'center', gap: 6 }}>{icono} {titulo} ({filas.length})</span>
        <span style={{ fontWeight: 700, fontFamily: SEREIN.fontDisplay }}>{clp(filas.reduce((a, x) => a + x.monto, 0))}</span>
      </div>
      {tablaItemsPago(filas, acciones, cuentas)}
    </div>
  )
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {kpiSolida('Por pagar esta semana', clp(totalSemana), C.naranja, <CalendarClock size={20} />, null, () => setDetalle('semana'))}
        {kpiSolida('Por pagar este mes', clp(totalMes), '#0E7A8F', <BarChart3 size={20} />, mesActual, () => setDetalle('mes'))}
        {kpiSolida('Nóminas pendientes', clp(totalNominas), COLOR_TIPO_PAGO['Nómina'], <span style={{ fontSize: 18 }}>👥</span>, null, () => setDetalle('nominas'))}
        {kpiSolida('Proveedores (proyectos)', clp(totalProveedores), COLOR_TIPO_PAGO['Compra proyecto'], <span style={{ fontSize: 18 }}>🎨</span>, null, () => setDetalle('proveedores'))}
        {kpiSolida('Vencido', clp(totalVencido), C.rojo, <span style={{ fontSize: 18 }}>⚠</span>, null, () => setDetalle('vencido'))}
        {kpiSolida('UF hoy', clp(uf.valor), ufHoyOk ? C.verde : '#94A3B8', <TrendingUp size={20} />, uf.fecha ? ('al ' + uf.fecha + (ufHoyOk ? ' · al día' : ' · desactualizada')) : 'sin datos', () => setDetalle('uf'))}
      </div>
      {detalle === 'uf' && (
        <div onClick={() => setDetalle(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,26,46,.55)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 8, maxWidth: 420, width: '100%', padding: 20, boxShadow: '0 20px 60px -12px rgba(0,0,0,.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 15, textTransform: 'uppercase', color: ufHoyOk ? C.verde : '#94A3B8' }}>Valor UF</div>
              <button onClick={() => setDetalle(null)} style={{ background: 'none', border: '1px solid #DFE4EA', cursor: 'pointer', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}><X size={15} /> Cerrar</button>
            </div>
            <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 26, marginBottom: 4 }}>{clp(uf.valor)}</div>
            <div style={{ fontSize: 12.5, color: C.gris, marginBottom: 12 }}>{uf.fecha ? ('Actualizada al ' + uf.fecha + (ufHoyOk ? ' · al día' : ' · desactualizada, se sincroniza sola en cuanto se abra la app')) : 'Sin datos aún'}</div>
            <div style={{ fontSize: 12.5, color: C.carbon, lineHeight: 1.5 }}>El valor se trae automáticamente cada día desde mindicador.cl y se usa para calcular en pesos los gastos indexados a UF (como el arriendo) dentro de "Por pagar esta semana" y "Por pagar este mes".</div>
          </div>
        </div>
      )}
      {detalle && detalle !== 'uf' && (() => {
        // filas se recalcula en cada render desde items/nominas/proveedores
        // (ya recalculados arriba a partir de fin/proyectos vigentes) — asi
        // el modal queda al dia apenas se edita o elimina algo adentro, sin
        // quedarse con una foto vieja tomada al momento del clic.
        const cfg = {
          semana: { titulo: 'Por pagar esta semana', color: C.naranja, sub: h + ' al ' + en7s, filas: items.filter(grupos[1].filtro) },
          mes: { titulo: 'Por pagar este mes', color: '#0E7A8F', sub: mesActual, filas: items.filter(x => mesDe(x.vencimiento) === mesActual) },
          nominas: { titulo: 'Nóminas pendientes', color: COLOR_TIPO_PAGO['Nómina'], sub: 'Sueldos e imposiciones', filas: nominas },
          proveedores: { titulo: 'Proveedores (proyectos)', color: COLOR_TIPO_PAGO['Compra proyecto'], sub: 'Compras de proyecto con saldo pendiente', filas: proveedores },
          vencido: { titulo: 'Vencido', color: C.rojo, sub: 'Antes de ' + h, filas: items.filter(grupos[0].filtro) },
        }[detalle]
        return <ModalDetallePago titulo={cfg.titulo} color={cfg.color} sub={cfg.sub} filas={cfg.filas} acciones={acciones} cuentas={cuentas} onExcel={() => descargarExcelPagos(cfg.filas, contactos, 'Pagos_' + detalle)} onCrearGasto={setCreandoGasto} onClose={() => setDetalle(null)} />
      })()}
      {editandoGasto && <OverlayFormulario onClose={() => setEditandoGasto(null)}><FormGasto tipo={editandoGasto.tipo} fin={fin} setFin={setFin} otsDisponibles={otsDisponibles} gastoInicial={editandoGasto} onCerrar={() => setEditandoGasto(null)} /></OverlayFormulario>}
      {creandoGasto && <OverlayFormulario onClose={() => setCreandoGasto(null)}><FormGasto tipo={creandoGasto} fin={fin} setFin={setFin} otsDisponibles={otsDisponibles} onCerrar={() => setCreandoGasto(null)} /></OverlayFormulario>}
      {editandoCompra && <OverlayFormulario onClose={() => setEditandoCompra(null)}><FormEditarCompra item={editandoCompra} proyectos={proyectos} setProyectos={setProyectos} onCerrar={() => setEditandoCompra(null)} /></OverlayFormulario>}
      {editandoCuenta && <OverlayFormulario onClose={() => setEditandoCuenta(null)}><FormCuentaProveedor proveedor={editandoCuenta.proveedor} rut={editandoCuenta.rut} contactos={contactos} setContactos={setContactos} onCerrar={() => setEditandoCuenta(null)} /></OverlayFormulario>}
      {editandoProyectado && <OverlayFormulario onClose={() => setEditandoProyectado(null)}><FormGasto tipo={editandoProyectado.gasto.tipo} fin={fin} setFin={setFin} otsDisponibles={otsDisponibles} proyectadoInicial={editandoProyectado} onCerrar={() => setEditandoProyectado(null)} /></OverlayFormulario>}
      <div style={{ fontSize: 11.5, color: C.gris, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span>Total general pendiente: <b style={{ color: C.carbon }}>{clp(totalGeneral)}</b></span>
        <button onClick={() => descargarExcelPagos(items, contactos, 'Pagos_pendientes')} style={{ background: 'none', border: `1px solid ${C.verde}`, color: C.verde, padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Download size={13} /> Excel: todo lo pendiente</button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <button onClick={() => irA('fijos')} style={btnAgregar}><Plus size={13} /> Gasto fijo</button>
        <button onClick={() => irA('variables')} style={btnAgregar}><Plus size={13} /> Gasto variable</button>
        <button onClick={() => irA('creditos')} style={btnAgregar}><Plus size={13} /> Crédito / Leasing</button>
        <div title="Una compra de proyecto nueva se carga desde la ficha del proyecto (necesita elegir Centro de Costo) — pero una vez cargada, se puede editar o eliminar directo desde acá." style={{ ...btnAgregar, cursor: 'default', color: COLOR_TIPO_PAGO['Compra proyecto'], borderColor: COLOR_TIPO_PAGO['Compra proyecto'] }}>ℹ Compras de proyecto nuevas: se agregan en Proyectos</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <button onClick={() => setAnioPagos(a => a - 1)} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '4px 9px', cursor: 'pointer', fontSize: 13 }}>‹</button>
        <span style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 14, minWidth: 44, textAlign: 'center' }}>{anioPagos}</span>
        <button onClick={() => setAnioPagos(a => a + 1)} style={{ background: 'none', border: '1px solid #DFE4EA', padding: '4px 9px', cursor: 'pointer', fontSize: 13 }}>›</button>
        <span style={{ fontSize: 11.5, color: C.gris, marginLeft: 6 }}>Elige un mes para ver todos tus pagos de ese mes — fijos, variables, créditos, nóminas y proveedores juntos.</span>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
        {MESES_PAGOS.map((m, i) => (
          <button key={m} onClick={() => setMesPagos(i + 1)}
            style={{ background: mesPagos === i + 1 ? C.naranja : '#fff', color: mesPagos === i + 1 ? '#fff' : C.carbon, border: '1px solid #DFE4EA', padding: '6px 11px', fontSize: 12.5, fontWeight: mesPagos === i + 1 ? 700 : 500, cursor: 'pointer' }}>
            {m}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 13, color: C.carbon, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span>Total de {MESES_PAGOS[mesPagos - 1]} {anioPagos}: <b style={{ fontFamily: SEREIN.fontDisplay }}>{clp(totalMesPagos)}</b></span>
        {itemsMes.length > 0 && <button onClick={() => descargarExcelPagos(itemsMes, contactos, 'Pagos_' + mesPagosKey)} style={{ background: 'none', border: `1px solid ${C.verde}`, color: C.verde, padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Download size={13} /> Descargar Excel de {MESES_PAGOS[mesPagos - 1]}</button>}
      </div>

      {itemsMes.length === 0 && <div style={{ fontSize: 13, color: C.gris, background: '#fff', border: '1px solid #DFE4EA', padding: 16 }}>No hay pagos para {MESES_PAGOS[mesPagos - 1]} {anioPagos}.</div>}
      {seccion('Nóminas (sueldos e imposiciones)', COLOR_TIPO_PAGO['Nómina'], nominasMes, '👥')}
      {seccion('Proveedores de proyecto', COLOR_TIPO_PAGO['Compra proyecto'], proveedoresMes, '🎨')}
      {seccion('Otros pagos del mes', C.naranja, restoMes, '💵')}
    </div>
  )
}

// ================= INFORME EXCEL: PROYECCIÓN DE CUENTAS POR PAGAR =================
// Reutiliza itemsPorPagar() (misma fuente que la pantalla "Por pagar")
// para la primera hoja, más la proyección mensual (reutiliza
// calcularResumenFin, la misma fuente que ya usa "Resumen mensual" y
// "Proyección" en pantalla) y el detalle de cada crédito/leasing.
function descargarInformeCuentasPorPagar(fin) {
  const areasDe = dist => (dist || []).map(d => `${d.area} ${d.pct}%`).join(', ')
  const h = hoy()

  const pendientes = itemsPorPagar(fin).map(x => ({
    Vencimiento: x.vencimiento,
    Tipo: x.tipo,
    Detalle: x.detalle,
    Proveedor: x.proveedor,
    Área: x.area,
    'Monto neto': x.monto,
    Estado: (x.vencimiento && x.vencimiento < h) ? 'Vencido' : 'Pendiente',
  }))
  const totalPendiente = pendientes.reduce((a, x) => a + (x['Monto neto'] || 0), 0)
  pendientes.push({ Vencimiento: '', Tipo: '', Detalle: '', Proveedor: '', Área: '', 'Monto neto': '', Estado: '' })
  pendientes.push({ Vencimiento: '', Tipo: '', Detalle: 'TOTAL CUENTAS POR PAGAR', Proveedor: '', Área: '', 'Monto neto': totalPendiente, Estado: '' })

  const now = new Date()
  const proyeccion = []
  for (let k = 0; k < 12; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() + k, 1)
    const mesKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    const r = calcularResumenFin(fin, mesKey)
    proyeccion.push({
      Mes: d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }),
      'Gastos fijos': Math.round(r.fijos),
      'Gastos variables': Math.round(r.variables),
      'Cuotas créditos/leasing': Math.round(r.totalCuotasMes),
      'Total salida de caja': Math.round(r.salidaCaja),
    })
  }

  const creditos = fin.obligaciones.map(o => {
    const cuotas = o.cuotas || []
    const pagadas = cuotas.filter(c => c.estado === 'Pagada').length
    const saldo = cuotas.filter(c => c.estado !== 'Pagada').reduce((a, c) => a + (c.total || 0), 0)
    const proxima = cuotas.find(c => c.estado !== 'Pagada')
    const vencidas = cuotas.filter(c => c.estado !== 'Pagada' && c.vencimiento < hoy()).length
    return {
      Institución: o.institucion || '',
      Tipo: o.tipo || '',
      Producto: o.producto || '',
      'Cuotas pagadas': pagadas,
      'Cuotas totales': o.nCuotas || cuotas.length,
      'Próximo vencimiento': proxima ? proxima.vencimiento : '',
      'Saldo pendiente': Math.round(saldo),
      'Cuotas vencidas': vencidas,
      Área: areasDe(o.dist),
    }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pendientes.length ? pendientes : [{ Vencimiento: 'Sin cuentas pendientes' }]), 'Cuentas por pagar')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(proyeccion), 'Proyección mensual')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(creditos.length ? creditos : [{ Institución: 'Sin créditos/leasing' }]), 'Créditos y Leasing')
  XLSX.writeFile(wb, 'Cuentas_por_pagar_Serein_' + hoy() + '.xlsx')
}

// ================= MÓDULO PRINCIPAL =================
export default function FinanzasModule({ otsDisponibles = [], fin: finExt, setFin: setFinExt, proyectos = [], params, setParams, tabInicial }) {
  const [finInt, setFinInt] = useState(FIN_SEED)
  const fin = finExt ?? finInt
  const setFin = setFinExt ?? setFinInt

  const tabs = [
    { id: 'resumen', label: 'Resumen mensual', icono: <BarChart3 size={13} /> },
    { id: 'fijos', label: 'Gastos fijos', icono: <ReceiptText size={13} /> },
    { id: 'variables', label: 'Gastos variables', icono: <ReceiptText size={13} /> },
    { id: 'creditos', label: 'Créditos y Leasing', icono: <Landmark size={13} /> },
    { id: 'plantillas', label: 'Reglas de distribución', icono: <PieIcon size={13} /> },
  ]
  const [tab, setTab] = useState(tabInicial || 'resumen')

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ background: tab === t.id ? C.carbon : '#fff', color: tab === t.id ? '#fff' : C.carbon, border: '1px solid #DFE4EA', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontFamily: SEREIN.fontDisplay, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, display: 'flex', alignItems: 'center', gap: 6 }}>
              {t.icono}{t.label}
            </button>
          ))}
        </div>
        <button onClick={() => descargarInformeCuentasPorPagar(fin)} title="Descarga un Excel con cuentas por pagar, proyección mensual a 12 meses, y detalle de créditos/leasing"
          style={{ background: C.naranja, color: '#fff', border: 'none', padding: '8px 14px', cursor: 'pointer', fontSize: 12.5, fontFamily: SEREIN.fontDisplay, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Download size={13} /> Descargar Excel
        </button>
      </div>
      {tab === 'resumen' && <><ResumenMensual fin={fin} /><ProyeccionFin fin={fin} /></>}
      {tab === 'fijos' && <ListaGastos tipo="fijo" fin={fin} setFin={setFin} otsDisponibles={otsDisponibles} />}
      {tab === 'variables' && <ListaGastos tipo="variable" fin={fin} setFin={setFin} otsDisponibles={otsDisponibles} />}
      {tab === 'plantillas' && <Plantillas fin={fin} setFin={setFin} />}
      {tab === 'creditos' && <CreditosLeasing fin={fin} setFin={setFin} />}
    </div>
  )
}
