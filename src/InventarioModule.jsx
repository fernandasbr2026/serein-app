import React, { useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { Plus, Minus, Trash2, Pencil, Download, Upload, History } from 'lucide-react'
import { INVENTARIO_SEED } from './inventario-data.js'

const C = { navy: '#061A40', carbon: '#0F1A2E', naranja: '#FF6B00', verde: '#12805C', rojo: '#D64545', gris: '#8A929E', teal: '#0B7285' }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const num = s => { const v = parseFloat(String(s).replace(',', '.').replace(/[^\d.\-]/g, '')); return isNaN(v) ? 0 : v }
const inp = { padding: '7px 9px', border: '1px solid #CBD2D6', fontSize: 13, boxSizing: 'border-box' }
const hoy = () => new Date().toISOString().slice(0, 10)
const uid = () => 'm' + Date.now() + Math.floor(Math.random() * 9999)
const SEDES = ['Santa Rosa', 'Istria']
const parseDesc = desc => { const d = String(desc || '').trim(); const m = d.match(/\(([^)]*)\)/); return { proveedor: m ? m[1].trim() : '', color: d.replace(/\s*\([^)]*\)\s*/, '').trim() } }

function MovForm({ tipo, prod, onSave, onCancel }) {
  const [f, setF] = useState({ cantidad: '', motivo: tipo === 'entrada' ? 'Sobrante de proyecto' : 'Consumo', ot: '' })
  const cant = num(f.cantidad)
  const err = tipo === 'salida' && cant > (prod.saldo || 0)
  return (
    <div style={{ background: '#F7F4EE', padding: 10, marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...inp, width: 90 }} placeholder="Cantidad" value={f.cantidad} onChange={e => setF({ ...f, cantidad: e.target.value })} />
        <input style={{ ...inp, width: 190 }} placeholder="Motivo" value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} />
        <input style={{ ...inp, width: 140 }} placeholder="OT / proyecto (opcional)" value={f.ot} onChange={e => setF({ ...f, ot: e.target.value })} />
        <button disabled={cant <= 0 || err} onClick={() => onSave({ cantidad: cant, motivo: f.motivo, ot: f.ot })} style={{ background: cant > 0 && !err ? (tipo === 'entrada' ? C.verde : C.naranja) : '#CBD2D6', color: '#fff', border: 'none', padding: '7px 12px', cursor: cant > 0 && !err ? 'pointer' : 'default', fontSize: 12.5 }}>{tipo === 'entrada' ? 'Ingresar' : 'Usar'}</button>
        <button onClick={onCancel} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '7px 10px', cursor: 'pointer', fontSize: 12.5 }}>Cancelar</button>
      </div>
      {err && <div style={{ color: C.rojo, fontSize: 12, marginTop: 6 }}>La salida ({cant}) supera el saldo disponible ({prod.saldo}).</div>}
    </div>
  )
}

function ProdForm({ prod, onSave, onCancel }) {
  const [f, setF] = useState({ codigo: (prod && prod.codigo) || '', nombre: (prod && prod.nombre) || '', color: (prod && prod.color) || '', proveedor: (prod && prod.proveedor) || '', unidad: (prod && prod.unidad) || 'GALON', catalizador: (prod && prod.catalizador) || '', costo: (prod && prod.costo) || '', saldo: prod ? prod.saldo : '', sede: (prod && prod.sede) || 'Santa Rosa', estado: (prod && prod.estado) || 'usable' })
  const lab = { fontSize: 11, color: C.gris, display: 'flex', flexDirection: 'column', gap: 3 }
  return (
    <div style={{ background: '#FAF7F3', border: '1px solid #E2DED4', padding: 12, marginTop: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8 }}>
        <label style={lab}>Codigo<input style={inp} value={f.codigo} onChange={e => setF({ ...f, codigo: e.target.value })} /></label>
        <label style={lab}>Nombre<input style={inp} value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></label>
        <label style={lab}>Color<input style={inp} value={f.color} onChange={e => setF({ ...f, color: e.target.value })} /></label>
        <label style={lab}>Proveedor / marca<input style={inp} value={f.proveedor} onChange={e => setF({ ...f, proveedor: e.target.value })} /></label>
        <label style={lab}>Unidad<input style={inp} value={f.unidad} onChange={e => setF({ ...f, unidad: e.target.value })} /></label>
        <label style={lab}>Catalizador<input style={inp} value={f.catalizador} onChange={e => setF({ ...f, catalizador: e.target.value })} /></label>
        <label style={lab}>Costo unitario<input style={inp} value={f.costo} onChange={e => setF({ ...f, costo: e.target.value })} /></label>
        <label style={lab}>Saldo<input style={inp} value={f.saldo} onChange={e => setF({ ...f, saldo: e.target.value })} /></label>
        <label style={lab}>Sede<select style={inp} value={f.sede} onChange={e => setF({ ...f, sede: e.target.value })}>{SEDES.map(s => <option key={s}>{s}</option>)}</select></label>
        <label style={lab}>Estado<select style={inp} value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })}><option value="usable">usable</option><option value="vencido">vencido/danado</option></select></label>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button onClick={() => f.nombre && onSave({ ...f, costo: num(f.costo), saldo: num(f.saldo) })} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Guardar</button>
        <button onClick={onCancel} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
      </div>
    </div>
  )
}

export default function InventarioModule({ inventario = [], setInventario = () => {}, movimientos = [], setMovimientos = () => {}, usuario = '' }) {
  const [sede, setSede] = useState('Santa Rosa')
  const [q, setQ] = useState('')
  const [prov, setProv] = useState('')
  const [estado, setEstado] = useState('')
  const [soloStock, setSoloStock] = useState(false)
  const [creando, setCreando] = useState(false)
  const [editId, setEditId] = useState(null)
  const [movFor, setMovFor] = useState(null)
  const [histId, setHistId] = useState(null)
  const [importPrev, setImportPrev] = useState(null)

  const proveedores = useMemo(() => [...new Set(inventario.map(p => p.proveedor).filter(Boolean))].sort(), [inventario])
  const filtrados = inventario.filter(p => {
    if (sede !== 'Todas' && p.sede !== sede) return false
    if (prov && p.proveedor !== prov) return false
    if (estado && p.estado !== estado) return false
    if (soloStock && !(p.saldo > 0)) return false
    if (q) { const t = ((p.nombre || '') + ' ' + (p.color || '') + ' ' + (p.descripcion || '') + ' ' + (p.codigo || '')).toLowerCase(); if (!t.includes(q.toLowerCase())) return false }
    return true
  })
  const valorTotal = inventario.reduce((a, p) => a + (p.saldo || 0) * (p.costo || 0), 0)
  const galonesTotal = inventario.reduce((a, p) => a + (p.saldo || 0), 0)
  const valorSede = s => inventario.filter(p => p.sede === s).reduce((a, p) => a + (p.saldo || 0) * (p.costo || 0), 0)

  const actualizar = (id, cambios) => setInventario(xs => xs.map(p => p.id === id ? { ...p, ...cambios } : p))
  const eliminar = id => { if (window.confirm('Eliminar este producto del inventario?')) setInventario(xs => xs.filter(p => p.id !== id)) }

  function agregarMov(prod, tipo, m) {
    const delta = tipo === 'entrada' ? m.cantidad : -m.cantidad
    const nuevoSaldo = (prod.saldo || 0) + delta
    if (nuevoSaldo < 0) { window.alert('La salida deja el saldo negativo.'); return }
    actualizar(prod.id, { saldo: nuevoSaldo })
    setMovimientos(ms => [{ id: uid(), productoId: prod.id, producto: prod.nombre, sede: prod.sede, fecha: hoy(), tipo, cantidad: m.cantidad, motivo: m.motivo, ot: m.ot, usuario, saldoResultante: nuevoSaldo }, ...(ms || [])])
    setMovFor(null)
  }
  function crearProducto(d) {
    const p = { ...d, id: 'inv-' + Date.now(), descripcion: d.color + (d.proveedor ? ' (' + d.proveedor + ')' : '') }
    setInventario(xs => [p, ...xs])
    if ((d.saldo || 0) > 0) setMovimientos(ms => [{ id: uid(), productoId: p.id, producto: p.nombre, sede: p.sede, fecha: hoy(), tipo: 'entrada', cantidad: d.saldo, motivo: 'Carga inicial', ot: '', usuario, saldoResultante: d.saldo }, ...(ms || [])])
    setCreando(false)
  }
  function exportarExcel() {
    const data = filtrados.map(p => ({ Codigo: p.codigo, Nombre: p.nombre, Color: p.color, Proveedor: p.proveedor, Unidad: p.unidad, Catalizador: p.catalizador, Saldo: p.saldo, Costo: p.costo, Valor: (p.saldo || 0) * (p.costo || 0), Estado: p.estado, Sede: p.sede }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'inventario')
    XLSX.writeFile(wb, 'inventario_' + (sede === 'Todas' ? 'todas' : sede.replace(/\s/g, '_')) + '.xlsx')
  }
  function leerExcel(file, sedeDestino) {
    const rd = new FileReader()
    rd.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames.indexOf('data') >= 0 ? 'data' : wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        const prods = rows.map((r, i) => {
          const desc = String(r.descripcion || r.Descripcion || r.Color || '').trim()
          const pd = parseDesc(desc)
          return { id: 'inv-' + sedeDestino[0] + Date.now() + i, codigo: String(r.codigo || r.Codigo || '').trim(), nombre: String(r.nombre || r.Nombre || '').trim(), color: pd.color || String(r.Color || ''), proveedor: pd.proveedor || String(r.Proveedor || r.proveedor || '').trim(), descripcion: desc, unidad: String(r.unidad || r.Unidad || 'GALON').trim(), catalizador: String(r.Catalizador || r.catalizador || '').trim(), costo: num(r.costo || r.Costo), saldo: num(r.saldo_inicial || r.Saldo || r.saldo), sede: sedeDestino, estado: 'usable' }
        }).filter(p => p.nombre || p.codigo)
        setImportPrev({ sede: sedeDestino, prods })
      } catch (err) { window.alert('No pude leer el Excel: ' + err.message) }
    }
    rd.readAsArrayBuffer(file)
  }
  function confirmarImport() {
    const nuevos = importPrev.prods
    setInventario(xs => [...nuevos, ...xs])
    setMovimientos(ms => [...nuevos.filter(p => (p.saldo || 0) > 0).map(p => ({ id: uid(), productoId: p.id, producto: p.nombre, sede: p.sede, fecha: hoy(), tipo: 'entrada', cantidad: p.saldo, motivo: 'Importacion Excel', ot: '', usuario, saldoResultante: p.saldo })), ...(ms || [])])
    setImportPrev(null)
  }

  const kpi = (l, v) => (<div style={{ background: '#fff', border: '1px solid #E2DED4', padding: 14, flex: '1 1 140px' }}><div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase' }}>{l}</div><div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 20, fontWeight: 600 }}>{v}</div></div>)

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {kpi('Productos', inventario.length)}
        {kpi('Galones en stock', galonesTotal)}
        {kpi('Valor inventario', clp(valorTotal))}
        {kpi('Valor Santa Rosa', clp(valorSede('Santa Rosa')))}
        {kpi('Valor Istria', clp(valorSede('Istria')))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {['Santa Rosa', 'Istria', 'Todas'].map(s => (
          <button key={s} onClick={() => setSede(s)} style={{ background: sede === s ? C.carbon : '#fff', color: sede === s ? '#fff' : C.carbon, border: '1px solid #CBD2D6', padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontFamily: "'Oswald',sans-serif", fontWeight: 600, textTransform: 'uppercase' }}>{s}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setCreando(true)} style={{ background: C.navy, color: '#fff', border: 'none', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Plus size={14} /> Nuevo producto</button>
          <button onClick={exportarExcel} style={{ background: C.teal, color: '#fff', border: 'none', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Download size={14} /> Descargar Excel</button>
          <label style={{ background: C.naranja, color: '#fff', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Upload size={14} /> Importar a {sede === 'Todas' ? 'Santa Rosa' : sede}<input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { const fl = e.target.files[0]; if (fl) leerExcel(fl, sede === 'Todas' ? 'Santa Rosa' : sede); e.target.value = '' }} /></label>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...inp, flex: '1 1 200px' }} placeholder="Buscar producto, color, codigo..." value={q} onChange={e => setQ(e.target.value)} />
        <select style={inp} value={prov} onChange={e => setProv(e.target.value)}><option value="">Todos los proveedores</option>{proveedores.map(p => <option key={p}>{p}</option>)}</select>
        <select style={inp} value={estado} onChange={e => setEstado(e.target.value)}><option value="">Todos los estados</option><option value="usable">usable</option><option value="vencido">vencido/danado</option></select>
        <label style={{ fontSize: 12.5, color: C.gris, display: 'inline-flex', alignItems: 'center', gap: 5 }}><input type="checkbox" checked={soloStock} onChange={e => setSoloStock(e.target.checked)} /> Solo con stock</label>
      </div>

      {creando && <ProdForm onSave={crearProducto} onCancel={() => setCreando(false)} />}

      {importPrev && (
        <div style={{ background: '#F9E9DE', border: '1px solid ' + C.naranja, padding: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Importar {importPrev.prods.length} productos a {importPrev.sede}. Confirmar?</div>
          <div style={{ fontSize: 12, color: C.gris, maxHeight: 120, overflowY: 'auto', marginBottom: 8 }}>{importPrev.prods.slice(0, 8).map((p, i) => <div key={i}>{p.nombre} - {p.color} - {p.proveedor} - saldo {p.saldo}</div>)}{importPrev.prods.length > 8 && <div>...y {importPrev.prods.length - 8} mas</div>}</div>
          <button onClick={confirmarImport} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13, marginRight: 6 }}>Confirmar importacion</button>
          <button onClick={() => setImportPrev(null)} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E2DED4', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 820 }}>
          <thead><tr style={{ background: C.navy, color: '#fff' }}>{['Producto', 'Color', 'Proveedor', 'Sede', 'Saldo', 'Unid.', 'Costo', 'Estado', ''].map((h, i) => <th key={i} style={{ textAlign: h === 'Saldo' || h === 'Costo' ? 'right' : 'left', padding: '9px 10px', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
          <tbody>
            {filtrados.length === 0 && <tr><td colSpan={9} style={{ padding: 16, textAlign: 'center', color: C.gris }}>Sin productos con esos filtros.</td></tr>}
            {filtrados.map(p => (
              <React.Fragment key={p.id}>
                <tr style={{ borderBottom: '1px solid #EEE9DF' }}>
                  <td style={{ padding: '7px 10px' }}><div style={{ fontWeight: 600 }}>{p.nombre}</div><div style={{ color: C.gris, fontSize: 11 }}>{p.codigo}{p.catalizador ? ' - cat: ' + p.catalizador : ''}</div></td>
                  <td style={{ padding: '7px 10px' }}>{p.color}</td>
                  <td style={{ padding: '7px 10px' }}>{p.proveedor || '-'}</td>
                  <td style={{ padding: '7px 10px' }}>{p.sede}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: p.saldo > 0 ? C.verde : C.rojo }}>{p.saldo}</td>
                  <td style={{ padding: '7px 10px' }}>{p.unidad}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right' }}>{p.costo ? clp(p.costo) : '-'}</td>
                  <td style={{ padding: '7px 10px' }}><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: p.estado === 'usable' ? '#E7F2EA' : '#F6E0DA', color: p.estado === 'usable' ? C.verde : C.rojo }}>{p.estado}</span></td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setMovFor({ id: p.id, tipo: 'entrada' })} title="Ingresar" style={{ background: 'none', border: '1px solid ' + C.verde, color: C.verde, cursor: 'pointer', padding: '3px 6px', marginRight: 3 }}><Plus size={13} /></button>
                    <button onClick={() => setMovFor({ id: p.id, tipo: 'salida' })} title="Usar" style={{ background: 'none', border: '1px solid ' + C.naranja, color: C.naranja, cursor: 'pointer', padding: '3px 6px', marginRight: 3 }}><Minus size={13} /></button>
                    <button onClick={() => setHistId(histId === p.id ? null : p.id)} title="Historial" style={{ background: 'none', border: '1px solid #CBD2D6', color: C.gris, cursor: 'pointer', padding: '3px 6px', marginRight: 3 }}><History size={13} /></button>
                    <button onClick={() => setEditId(editId === p.id ? null : p.id)} title="Editar" style={{ background: 'none', border: '1px solid #CBD2D6', color: C.teal, cursor: 'pointer', padding: '3px 6px', marginRight: 3 }}><Pencil size={13} /></button>
                    <button onClick={() => eliminar(p.id)} title="Eliminar" style={{ background: 'none', border: '1px solid #E2C9C2', color: C.rojo, cursor: 'pointer', padding: '3px 6px' }}><Trash2 size={13} /></button>
                  </td>
                </tr>
                {movFor && movFor.id === p.id && <tr><td colSpan={9} style={{ padding: '0 10px 8px' }}><MovForm tipo={movFor.tipo} prod={p} onSave={d => agregarMov(p, movFor.tipo, d)} onCancel={() => setMovFor(null)} /></td></tr>}
                {editId === p.id && <tr><td colSpan={9} style={{ padding: '0 10px 8px' }}><ProdForm prod={p} onSave={d => { actualizar(p.id, { ...d, costo: num(d.costo), saldo: num(d.saldo), descripcion: d.color + (d.proveedor ? ' (' + d.proveedor + ')' : '') }); setEditId(null) }} onCancel={() => setEditId(null)} /></td></tr>}
                {histId === p.id && <tr><td colSpan={9} style={{ padding: '0 10px 10px', background: '#FAF7F3' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.gris, textTransform: 'uppercase', margin: '8px 0 6px' }}>Historial de movimientos</div>
                  {movimientos.filter(m => m.productoId === p.id).length === 0 ? <div style={{ fontSize: 12, color: C.gris, paddingBottom: 8 }}>Sin movimientos.</div> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr style={{ borderBottom: '1px solid ' + C.carbon }}>{['Fecha', 'Tipo', 'Cant.', 'Motivo', 'OT', 'Usuario', 'Saldo'].map((h, i) => <th key={i} style={{ textAlign: i === 2 || i === 6 ? 'right' : 'left', padding: '4px 8px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                      <tbody>{movimientos.filter(m => m.productoId === p.id).map(m => <tr key={m.id} style={{ borderBottom: '1px solid #EEE9DF' }}><td style={{ padding: '4px 8px' }}>{m.fecha}</td><td style={{ padding: '4px 8px', color: m.tipo === 'entrada' ? C.verde : C.naranja, fontWeight: 600 }}>{m.tipo}</td><td style={{ padding: '4px 8px', textAlign: 'right' }}>{m.cantidad}</td><td style={{ padding: '4px 8px' }}>{m.motivo}</td><td style={{ padding: '4px 8px' }}>{m.ot || '-'}</td><td style={{ padding: '4px 8px' }}>{m.usuario || '-'}</td><td style={{ padding: '4px 8px', textAlign: 'right' }}>{m.saldoResultante}</td></tr>)}</tbody></table>
                  )}
                </td></tr>}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: C.gris, marginTop: 8 }}>El saldo se maneja con movimientos (+ Ingresar / - Usar) y queda el historial. El stock es de la empresa; la sede indica donde esta. Todo se guarda en la nube.</div>
    </div>
  )
}
