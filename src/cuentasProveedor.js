import { pullState, pushState } from './sync.js'

// Cuenta bancaria fija por proveedor: vive en contactos.proveedores (la misma
// ficha que se edita en "Clientes y Proveedores"), así se escribe una sola vez
// y se reutiliza en cada factura/compra/pago de ese proveedor.
export const CAMPOS_CUENTA = ['banco', 'tipoCuenta', 'numeroCuenta', 'titularCuenta', 'emailPago']
export const TIPOS_CUENTA = ['Cuenta corriente', 'Cuenta vista', 'Cuenta RUT', 'Cuenta de ahorro']

const normNombre = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
const normRut = s => (s || '').toString().toLowerCase().replace(/[^0-9k]/g, '')

export const tieneCuenta = p => !!(p && (p.banco || p.numeroCuenta))

export function buscarProveedor(contactos, { nombre, rut } = {}) {
  const lista = (contactos && contactos.proveedores) || []
  const r = normRut(rut)
  if (r.length >= 7) {
    const porRut = lista.find(p => normRut(p.rut) === r)
    if (porRut) return porRut
  }
  const n = normNombre(nombre)
  if (n.length < 3) return null
  return lista.find(p => normNombre(p.nombre) === n) || null
}

export function cuentaDe(contactos, datos) {
  const p = buscarProveedor(contactos, datos)
  if (!tieneCuenta(p)) return null
  return { banco: p.banco || '', tipoCuenta: p.tipoCuenta || '', numeroCuenta: p.numeroCuenta || '', titularCuenta: p.titularCuenta || '', emailPago: p.emailPago || '' }
}

export const textoCuenta = c => c ? [c.banco, c.tipoCuenta, c.numeroCuenta ? 'N° ' + c.numeroCuenta : ''].filter(Boolean).join(' · ') : ''

// Guarda la cuenta en la ficha del proveedor (la crea si no existe). Mismo
// patrón pull-fresh + merge + push que el resto de la app.
export async function guardarCuentaProveedor(contactos, setContactos, { nombre, rut }, cuenta) {
  if (!setContactos || (!(nombre || '').trim() && !(rut || '').trim())) return
  try { await pullState() } catch (e) {}
  let fresco = null
  try { fresco = JSON.parse(localStorage.getItem('serein_contactos') || 'null') } catch (e) {}
  const base = fresco && typeof fresco === 'object' ? fresco : (contactos || {})
  const proveedores = [...(base.proveedores || [])]
  const hallado = buscarProveedor({ proveedores }, { nombre, rut })
  const limpia = {}
  CAMPOS_CUENTA.forEach(k => { limpia[k] = ((cuenta && cuenta[k]) || '').toString().trim() })
  if (hallado) {
    const i = proveedores.findIndex(p => p.id === hallado.id)
    proveedores[i] = { ...hallado, ...limpia, rut: hallado.rut || (rut || '').trim() }
  } else {
    proveedores.unshift({ id: 'pv' + Date.now(), rut: (rut || '').trim(), nombre: (nombre || '').trim(), giro: '', direccion: '', comuna: '', estado: 'Activo', ...limpia })
  }
  const nuevo = { ...base, proveedores }
  try { localStorage.setItem('serein_contactos', JSON.stringify(nuevo)) } catch (e) {}
  setContactos(nuevo)
  pushState()
}
