import React, { useState, useRef } from 'react'
import { Plus, Trash2, Receipt, Upload, Search } from 'lucide-react'
import * as XLSX from 'xlsx'
import { calcularPerdidaFactoring } from './ParametrosModule.jsx'
export { FACTURAS_SEED } from './facturas-data.js'
const CONDICIONES_DIAS = [{ label: '30 días', dias: 30 }, { label: '45 días', dias: 45 }, { label: '60 días', dias: 60 }, { label: '90 días', dias: 90 }]
const norm = s => (s || '').toString().toLowerCase()

// ============================================================
// MÓDULO: Facturas por área (Santa Rosa / Istria)
// Lista editable de facturas: ver, editar, comentar, registrar
// fecha de pago y banco de depósito.
// Versión en memoria. Preparado para llenarse automáticamente
// desde Defontana / SII en la fase de sincronización.
// ============================================================

const C = { azul: '#1D1D1B', teal: '#A8501F', ambar: '#D2642F', rojo: '#B5432E', verde: '#3D7A4E', carbon: '#161616', gris: '#7A8288' }
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const num = s => { const v = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v }
const inp = { padding: '6px 8px', border: '1px solid #CBD2D6', fontSize: 12.5, boxSizing: 'border-box' }
const ESTADOS = ['Pendiente', 'Pagado', 'Factoring', 'Vencida', 'Anulada']
const BANCOS = ['', 'Banco de Chile', 'BCI', 'Santander', 'Estado', 'Scotiabank', 'Itaú', 'Security', 'BICE', 'Otro']

const fondoEstado = e => ({ Pagado: '#E7F2EA', Factoring: '#F9E9DE', Vencida: '#F6E0DA', Anulada: '#EEE', Pendiente: '#F9E9DE' }[e] || '#EEE')
const colorEstado = e => ({ Pagado: C.verde, Factoring: C.ambar, Vencida: C.rojo, Anulada: C.gris, Pendiente: '#8C4519' }[e] || C.gris)

export default function FacturasModule({ area, facturas, setFacturas, params = { factoring: [] } }) {
  const lista = (facturas && facturas[area]) || []
  const [creando, setCreando] = useState(false)
  const nueva = () => ({ numero: '', cliente: '', ot: '', fecha_emision: '', monto: '', estado: 'Pendiente', fecha_pago: '', banco: '', comentarios: '' })
  const [f, setF] = useState(nueva())
  const [busca, setBusca] = useState('')
  const fileRef = useRef(null)

  const setLista = nuevaLista => setFacturas({ ...(facturas || {}), [area]: nuevaLista })
  const actualizar = (id, campo, valor) => setLista(lista.map(x => x.id === id ? { ...x, [campo]: valor } : x))
  function agregar() {
    if (!f.numero || num(f.monto) <= 0) return
    setLista([{ id: 'f' + Date.now(), ...f, monto: num(f.monto) }, ...lista])
    setF(nueva()); setCreando(false)
  }

  // Importar facturas desde Excel (.xlsx / .xlsm). Lee la hoja del área o la primera.
  function importarExcel(file) {
    const toInt = v => { const n = Math.round(Number(v)); return isNaN(n) ? num(v) : n }
    const excelDate = v => {
      if (v == null || v === '') return ''
      if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10) }
      const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ''
    }
    const estadoN = v => { const t = norm(v); if (t.includes('pag')) return 'Pagado'; if (t.includes('factor')) return 'Factoring'; if (t.includes('venc')) return 'Vencida'; if (t.includes('anul')) return 'Anulada'; return 'Pendiente' }
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const sheet = wb.SheetNames.find(n => norm(n).trim() === norm(area).trim()) || wb.SheetNames[0]
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, blankrows: false })
        if (!rows.length) return
        const hdr = (rows[0] || []).map(h => norm(h).trim())
        const col = (...nn) => { for (const nm of nn) { const i = hdr.findIndex(h => h.includes(nm)); if (i >= 0) return i } return -1 }
        const ci = { fecha: col('fecha'), doc: col('documento'), cli: col('cliente'), neto: col('venta neta', 'neto'), total: col('total'), oc: col('oc'), ent: col('entidad'), venc: col('vencimiento'), est: col('estado'), obs: col('observaci') }
        const nuevas = []
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r]; if (!row) continue
          const numero = String(row[ci.doc] ?? '').replace(/\.0$/, '').trim()
          const cliente = String(row[ci.cli] ?? '').trim()
          if (!numero && !cliente) continue
          nuevas.push({ id: 'imp' + r, numero, cliente, ot: String(row[ci.oc] ?? '').trim(), fecha_emision: excelDate(row[ci.fecha]), neto: toInt(row[ci.neto]), monto: toInt(row[ci.total]) || toInt(row[ci.neto]), estado: estadoN(row[ci.est]), fecha_pago: '', banco: String(row[ci.ent] ?? '').trim(), vencimiento: excelDate(row[ci.venc]), comentarios: String(row[ci.obs] ?? '').trim() })
        }
        if (!nuevas.length) { window.alert('No se encontraron facturas en la hoja "' + sheet + '".'); return }
        if (window.confirm('Se importarán ' + nuevas.length + ' facturas de la hoja "' + sheet + '" y reemplazarán las de ' + area + '. ¿Continuar?')) setLista(nuevas)
      } catch (err) { window.alert('No se pudo leer el Excel: ' + err) }
    }
    reader.readAsArrayBuffer(file)
  }

  const mostradas = busca ? lista.filter(x => (norm(x.numero) + ' ' + norm(x.cliente) + ' ' + norm(x.ot)).includes(norm(busca))) : lista
  const totalMonto = lista.reduce((a, x) => a + x.monto, 0)
  const cobrado = lista.filter(x => x.estado === 'Pagado').reduce((a, x) => a + x.monto, 0)

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ background: '#fff', border: '1px solid #E2DED4', borderTop: `3px solid ${C.teal}` }}>
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid #EEE9DF' }}>
          <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 14, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}><Receipt size={15} /> Facturas · {area}</span>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: C.gris, flexWrap: 'wrap' }}>
            <span>{lista.length} facturas</span>
            <span>Total: <b style={{ color: C.carbon }}>{clp(totalMonto)}</b></span>
            <span>Cobrado: <b style={{ color: C.verde }}>{clp(cobrado)}</b></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #CBD2D6', padding: '2px 6px' }}>
              <Search size={13} color={C.gris} />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar N°/cliente/OT…" style={{ border: 'none', outline: 'none', fontSize: 12.5, width: 150 }} />
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" style={{ display: 'none' }} onChange={e => { const file = e.target.files[0]; if (file) importarExcel(file); e.target.value = '' }} />
            <button onClick={() => fileRef.current && fileRef.current.click()} style={{ background: C.carbon, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Upload size={13} /> Importar Excel</button>
            {!creando && <button onClick={() => setCreando(true)} style={{ background: C.teal, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Nueva factura</button>}
          </div>
        </div>

        {creando && (
          <div style={{ background: '#FAF7F3', padding: 12, borderBottom: '1px solid #EEE9DF' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8 }}>
              <input style={inp} placeholder="N° factura *" value={f.numero} onChange={e => setF({ ...f, numero: e.target.value })} />
              <input style={inp} placeholder="Cliente" value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} />
              <input style={inp} placeholder="OT" value={f.ot} onChange={e => setF({ ...f, ot: e.target.value })} />
              <label style={{ fontSize: 11, color: C.gris }}>Emisión<input type="date" style={{ ...inp, width: '100%' }} value={f.fecha_emision} onChange={e => setF({ ...f, fecha_emision: e.target.value })} /></label>
              <input style={inp} placeholder="Monto CLP *" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} />
            </div>
            <input style={{ ...inp, width: '100%', marginTop: 8 }} placeholder="Observación / comentario (opcional)" value={f.comentarios} onChange={e => setF({ ...f, comentarios: e.target.value })} />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={agregar} style={{ background: C.verde, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Agregar</button>
              <button onClick={() => { setF(nueva()); setCreando(false) }} style={{ background: 'none', border: '1px solid #CBD2D6', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto', padding: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ borderBottom: `2px solid ${C.carbon}` }}>
              {['N° factura', 'Cliente', 'OT', 'Emisión', 'Monto', 'Estado', 'Fecha pago', 'Banco depósito', 'Comentarios', ''].map((h, i) => (
                <th key={i} style={{ textAlign: h === 'Monto' ? 'right' : 'left', padding: '5px 6px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {mostradas.map(x => {
                const facs = params.factoring || []
                const fSel = facs.find(ff => ff.id === x.factoringId) || facs[0]
                const perd = x.estado === 'Factoring' ? calcularPerdidaFactoring(x.monto, x.dias || 30, x.diasMora || 0, fSel) : null
                return (
                <React.Fragment key={x.id}>
                <tr style={{ borderBottom: '1px solid #EEE9DF', opacity: x.estado === 'Anulada' ? 0.5 : 1 }}>
                  <td style={{ padding: '5px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>{x.numero}</td>
                  <td style={{ padding: '5px 6px' }}>{x.cliente}</td>
                  <td style={{ padding: '5px 6px', color: C.gris }}>{x.ot || '—'}</td>
                  <td style={{ padding: '5px 6px', color: C.gris, whiteSpace: 'nowrap' }}>{x.fecha_emision || '—'}</td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{clp(x.monto)}</td>
                  <td style={{ padding: '5px 6px' }}>
                    <select value={x.estado} onChange={e => actualizar(x.id, 'estado', e.target.value)} style={{ border: 'none', background: fondoEstado(x.estado), color: colorEstado(x.estado), padding: '3px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {ESTADOS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '5px 6px' }}><input type="date" value={x.fecha_pago} onChange={e => actualizar(x.id, 'fecha_pago', e.target.value)} style={{ ...inp, width: 130 }} /></td>
                  <td style={{ padding: '5px 6px' }}>
                    <input value={x.banco} onChange={e => actualizar(x.id, 'banco', e.target.value)} placeholder="Banco…" style={{ ...inp, width: 130 }} />
                  </td>
                  <td style={{ padding: '5px 6px' }}><input value={x.comentarios} onChange={e => actualizar(x.id, 'comentarios', e.target.value)} placeholder="Comentario…" style={{ ...inp, width: 160 }} /></td>
                  <td style={{ padding: '5px 4px', textAlign: 'right' }}><button onClick={() => window.confirm(`¿Eliminar factura ${x.numero}?`) && setLista(lista.filter(y => y.id !== x.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo }}><Trash2 size={13} /></button></td>
                </tr>
                {x.estado === 'Factoring' && (
                  <tr style={{ background: '#FBF3EE' }}>
                    <td colSpan={10} style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                        <span style={{ color: C.gris, fontWeight: 600 }}>Factoring:</span>
                        <select value={x.factoringId || (fSel ? fSel.id : '')} onChange={e => actualizar(x.id, 'factoringId', e.target.value)} style={inp}>
                          {facs.length === 0 && <option value="">(define en Parámetros)</option>}
                          {facs.map(ff => <option key={ff.id} value={ff.id}>{ff.nombre}</option>)}
                        </select>
                        <select value={x.dias || 30} onChange={e => actualizar(x.id, 'dias', parseInt(e.target.value))} style={inp}>
                          {CONDICIONES_DIAS.map(cd => <option key={cd.dias} value={cd.dias}>{cd.label}</option>)}
                        </select>
                        <input placeholder="Días mora" value={x.diasMora || ''} onChange={e => actualizar(x.id, 'diasMora', num(e.target.value))} style={{ ...inp, width: 90 }} />
                        <span style={{ color: C.rojo, fontWeight: 600 }}>Descuento factoring: {clp(perd ? perd.total : 0)}</span>
                        <span style={{ color: C.gris }}>(interés {clp(perd ? perd.interes : 0)} + costo op {clp(perd ? perd.costoOp : 0)}{perd && perd.mora ? ` + mora ${clp(perd.mora)}` : ''}) → Neto a recibir: <b style={{ color: C.carbon }}>{clp(x.monto - (perd ? perd.total : 0))}</b></span>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ) })}
              {mostradas.length === 0 && <tr><td colSpan={10} style={{ padding: 14, textAlign: 'center', color: '#9AA0A6' }}>{busca ? 'Sin resultados para la búsqueda.' : 'Sin facturas en esta área.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#9AA0A6', marginTop: 6 }}>
        Estas facturas se llenarán automáticamente desde Defontana/SII cuando activemos la sincronización. Por ahora puedes cargarlas y editarlas a mano.
      </div>
    </div>
  )
}
