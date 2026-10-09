import React, { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { ClipboardCheck, RotateCw, Download, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { supabase } from './supabase.js'
import { SEREIN } from './theme-serein.js'
import { revisar, ETIQUETA_CLASE, nombreTipo, TRAMO_GRANDE } from './revisionContable.js'
import { hoyISO } from './vencimientos.js'

// ============================================================
// REVISIÓN CONTABLE — busca documentos repetidos (facturas y notas de
// crédito) y folios que faltan en los libros de ventas y de compras.
// Primera versión: SOLO MIRA. No oculta, borra ni cambia ningún documento;
// la lógica está en revisionContable.js (funciones puras con pruebas).
// ============================================================
const C = { naranja: SEREIN.orange, verde: SEREIN.green, rojo: SEREIN.red, carbon: SEREIN.text, gris: SEREIN.textFaint, suave: SEREIN.textSoft, azul: SEREIN.blue, linea: SEREIN.line, fog: SEREIN.fog }
const clp = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString('es-CL')
const fmtF = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? m[3] + '-' + m[2] + '-' + m[1] : '—' }
const LS_VENTAS = 'serein_libroVentasXlsx'
const LS_COMPRAS = 'serein_libroComprasXlsx'
const POR_PAGINA = 40
const card = { background: '#fff', border: '1px solid ' + C.linea, borderRadius: 8, padding: 16, marginBottom: 14 }
const titulo = { fontFamily: SEREIN.fontDisplay, fontWeight: 600, fontSize: 14, textTransform: 'uppercase', margin: 0 }
const th = { textAlign: 'left', padding: '6px 8px', fontSize: 10.5, color: C.gris, textTransform: 'uppercase', whiteSpace: 'nowrap', fontWeight: 600 }
const td = { padding: '6px 8px', fontSize: 12.5, verticalAlign: 'top' }
const COLOR_CLASE = { exacto: C.rojo, montos: C.naranja, cliente: C.naranja, doble: C.azul }
const MOTIVO = {
  iguales: 'Las copias son idénticas: da lo mismo cuál se deje.',
  origen: 'Las copias son idénticas; se sugiere dejar la que viene de la base de datos.',
  trabajo: 'Se sugiere dejar la que tiene más trabajo encima (pago, área, OT o abonos).',
  dudoso: 'Ninguna copia se ve claramente mejor: hay que mirar el documento real para saber cuál es la correcta.',
}
const ANCHOS = [92, 96, 128, null, 112, 120, 170, 110]   // columnas iguales en todas las tarjetas
const pl = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios)

const leerExcel = k => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : [] } catch (e) { return [] } }

// La API entrega como máximo 1.000 filas por consulta: se trae de a páginas hasta terminar.
async function traerTodo(tabla) {
  const filas = []
  for (let desde = 0; desde < 200000; desde += 1000) {
    const { data, error } = await supabase.from(tabla).select('*').order('id', { ascending: true }).range(desde, desde + 999)
    if (error) throw new Error(tabla + ': ' + error.message)
    filas.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return filas
}

// Los libros piden la tabla entera sin paginar. Si la base devuelve menos filas que las que hay, ellos muestran (y suman) menos.
async function loQuePideElLibro(tabla) {
  try {
    const a = await supabase.from(tabla).select('id', { count: 'exact', head: true })
    const b = await supabase.from(tabla).select('id')
    if (a.error || b.error || a.count == null) return null
    return { total: a.count, queCarga: (b.data || []).length }
  } catch (e) { return null }
}

// Une lo de la base con lo importado desde Excel igual que los libros: la fila de Excel no se muestra si ya hay una
// de la base con el mismo "folio|RUT" escrito tal cual.
function unirConExcel(base, excel, campoRut) {
  const k = r => (r.document_number || '') + '|' + (r[campoRut] || '')
  const vistos = new Set(base.map(k))
  return [...base, ...excel.filter(r => !vistos.has(k(r)))]
}

function Etiqueta({ color, children }) {
  return <span style={{ display: 'inline-block', background: color + '1F', color, fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>{children}</span>
}

function Resumen({ titulo: t, valor, detalle, color, ok }) {
  return (
    <div style={{ ...card, marginBottom: 0, padding: '12px 14px', borderTop: '3px solid ' + (ok ? C.verde : color) }}>
      <div style={{ fontSize: 11, color: C.gris, textTransform: 'uppercase', fontWeight: 600 }}>{t}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: ok ? C.verde : color, lineHeight: 1.2, marginTop: 2 }}>{valor}</div>
      <div style={{ fontSize: 12, color: C.suave, marginTop: 2 }}>{detalle}</div>
    </div>
  )
}

function FilaDoc({ item, libro, hayGanador }) {
  const d = item.doc
  const chip = item.conservar ? <Etiqueta color={C.verde}>Conservar</Etiqueta> : hayGanador ? <Etiqueta color={C.naranja}>Ocultar</Etiqueta> : <Etiqueta color={C.azul}>Revisar</Etiqueta>
  return (
    <tr style={{ borderTop: '1px solid ' + C.linea }}>
      <td style={td}>{chip}</td>
      <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtF(d.fecha)}</td>
      <td style={{ ...td, fontWeight: 600 }}>{d.folioTxt || '—'}<div style={{ fontWeight: 400, fontSize: 11, color: C.gris }}>{nombreTipo(d.tipo)}{d.tipoTexto && d.tipoTexto !== d.tipo ? ' · «' + d.tipoTexto + '»' : ''}</div></td>
      <td style={td}>{d.nombre || '—'}<div style={{ fontSize: 11, color: C.gris }}>{d.rutTxt || 'sin RUT'}</div></td>
      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600, color: d.esNC ? C.rojo : C.carbon }}>{clp((d.esNC ? -1 : 1) * d.total)}</td>
      <td style={td}>{d.estado || '—'}</td>
      <td style={td}>{libro === 'ventas' ? ([d.area, d.ot && 'OT ' + d.ot].filter(Boolean).join(' · ') || '—') : ([d.raw.tipo_compra, d.ot && 'OT ' + d.ot].filter(Boolean).join(' · ') || '—')}</td>
      <td style={td}>{d.origen === 'excel' ? 'Excel' : 'Base de datos'}</td>
    </tr>
  )
}

function TarjetaGrupo({ g, libro, sugerir = true }) {
  const copias = g.items.length
  const efecto = g.efectoTotal
  return (
    <div style={{ border: '1px solid ' + C.linea, borderLeft: '4px solid ' + COLOR_CLASE[g.clase], borderRadius: 6, marginBottom: 10, background: '#fff' }}>
      <div style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 14 }}>{nombreTipo(g.tipo)} {g.folioTxt || ''}</b>
        <span style={{ fontSize: 12, color: C.suave }}>{copias} copias</span>
        <Etiqueta color={COLOR_CLASE[g.clase]}>{ETIQUETA_CLASE[g.clase]}</Etiqueta>
        {sugerir && g.hayGanador && efecto !== 0 && (
          <span style={{ fontSize: 12, color: C.suave, marginLeft: 'auto' }}>
            Si se oculta la copia sobrante, {efecto > 0 ? 'las ' + (libro === 'ventas' ? 'ventas' : 'compras') + ' bajan' : 'el descuento de notas de crédito baja'} <b style={{ color: C.carbon }}>{clp(Math.abs(efecto))}</b>
          </span>
        )}
      </div>
      {sugerir && <div style={{ padding: '0 12px 8px', fontSize: 12, color: C.suave }}>{MOTIVO[g.motivo]}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860, tableLayout: 'fixed' }}>
          <colgroup>{ANCHOS.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
          <thead><tr><th style={th}></th><th style={th}>Fecha</th><th style={th}>Folio</th><th style={th}>{libro === 'ventas' ? 'Cliente' : 'Proveedor'}</th><th style={{ ...th, textAlign: 'right' }}>Total</th><th style={th}>Estado de pago</th><th style={th}>{libro === 'ventas' ? 'Área / OT' : 'Tipo / OT'}</th><th style={th}>Origen</th></tr></thead>
          <tbody>{g.items.map((it, i) => <FilaDoc key={i} item={it} libro={libro} hayGanador={sugerir && g.hayGanador} />)}</tbody>
        </table>
      </div>
    </div>
  )
}

function ListaGrupos({ grupos, libro, vacio, sugerir = true }) {
  const [todos, setTodos] = useState(false)
  if (!grupos.length) return <div style={{ color: C.verde, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={16} /> {vacio}</div>
  const ver = todos ? grupos : grupos.slice(0, POR_PAGINA)
  return (
    <div>
      {ver.map(g => <TarjetaGrupo key={g.clave} g={g} libro={libro} sugerir={sugerir} />)}
      {grupos.length > ver.length && <button onClick={() => setTodos(true)} style={{ background: '#fff', border: '1px solid ' + C.linea, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Mostrar los {grupos.length - ver.length} restantes</button>}
    </div>
  )
}

function Faltantes({ faltantes }) {
  if (!faltantes.tipos.length) return <div style={{ color: C.suave, fontSize: 13 }}>No hay suficientes documentos numerados para revisar saltos de folio.</div>
  return (
    <div>
      {faltantes.tipos.map(t => (
        <div key={t.tipo} style={{ border: '1px solid ' + C.linea, borderRadius: 6, marginBottom: 10, background: '#fff' }}>
          <div style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14 }}>{t.nombre}</b>
            <span style={{ fontSize: 12.5, color: C.suave }}>cargados {t.documentos} documentos, del folio {t.primero.folio} ({fmtF(t.primero.fecha)}) al {t.ultimo.folio} ({fmtF(t.ultimo.fecha)})</span>
            {t.faltan > 0 ? <Etiqueta color={C.rojo}>Faltan {t.faltan}</Etiqueta> : t.tramosGrandes > 0 ? <Etiqueta color={C.suave}>Solo tramos largos</Etiqueta> : <Etiqueta color={C.verde}>Sin saltos</Etiqueta>}
          </div>
          {t.tramos.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead><tr><th style={th}>Folio</th><th style={th}>Cantidad</th><th style={th}>Quedó entre</th><th style={th}>Fechas</th></tr></thead>
                <tbody>
                  {t.tramos.map(tr => (
                    <tr key={tr.desde} style={{ borderTop: '1px solid ' + C.linea, background: tr.grande ? C.fog : 'transparent' }}>
                      <td style={{ ...td, fontWeight: 700 }}>{tr.desde === tr.hasta ? tr.desde : tr.desde + ' al ' + tr.hasta}</td>
                      <td style={td}>{tr.cantidad}{tr.grande && <div style={{ fontSize: 11, color: C.suave, maxWidth: 260 }}>Tramo largo (más de {TRAMO_GRANDE}): casi seguro es un período que no se ha cargado, no folios sueltos.</div>}</td>
                      <td style={td}>{tr.antes.folio}{tr.antes.nombre ? ' · ' + tr.antes.nombre : ''}<br />{tr.despues.folio}{tr.despues.nombre ? ' · ' + tr.despues.nombre : ''}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtF(tr.antes.fecha)}<br />{fmtF(tr.despues.fecha)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function Tipos({ titulo: t, tipos, libro }) {
  if (!tipos.length) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>{t}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
          <thead><tr><th style={th}>Como viene escrito</th><th style={th}>El sistema lo entiende como</th><th style={{ ...th, textAlign: 'right' }}>Documentos</th><th style={th}></th></tr></thead>
          <tbody>
            {tipos.map(x => (
              <tr key={x.texto} style={{ borderTop: '1px solid ' + C.linea }}>
                <td style={td}>{x.texto ? '«' + x.texto + '»' : '(vacío)'}</td>
                <td style={td}>{x.nombre}{x.codigo && /^\d+$/.test(x.codigo) ? ' (' + x.codigo + ')' : ''}</td>
                <td style={{ ...td, textAlign: 'right' }}>{x.cantidad}</td>
                <td style={td}>{x.libroNoLaResta && <Etiqueta color={C.rojo}>Parece nota de crédito pero el libro de {libro} la suma</Etiqueta>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function filasExcel(grupos, libro, sugerir) {
  const out = []
  for (const g of grupos) {
    for (const it of g.items) {
      const d = it.doc
      out.push({
        Libro: libro === 'ventas' ? 'Ventas' : 'Compras',
        Clase: ETIQUETA_CLASE[g.clase],
        Sugerencia: it.conservar ? 'Conservar' : (sugerir && g.hayGanador) ? 'Ocultar' : 'Revisar',
        Fecha: d.fecha, Tipo: nombreTipo(d.tipo), Folio: d.folioTxt, RUT: d.rutTxt, Nombre: d.nombre,
        Total: (d.esNC ? -1 : 1) * d.total, 'Estado de pago': d.estado, Área: d.area, OT: d.ot, Origen: d.origen === 'excel' ? 'Excel' : 'Base de datos', Id: String(d.id),
      })
    }
  }
  return out
}

function Seccion({ titulo: t, nota, children }) {
  return (
    <div style={card}>
      <h3 style={titulo}>{t}</h3>
      {nota && <div style={{ fontSize: 12, color: C.suave, margin: '4px 0 12px' }}>{nota}</div>}
      <div style={{ marginTop: nota ? 0 : 12 }}>{children}</div>
    </div>
  )
}

export default function RevisionContableModule({ facturas = {} }) {
  const [estado, setEstado] = useState('cargando')
  const [error, setError] = useState('')
  const [datos, setDatos] = useState(null)

  const cargar = async () => {
    setEstado('cargando'); setError('')
    try {
      const [vBase, cBase, topeV, topeC] = await Promise.all([traerTodo('libro_ventas'), traerTodo('libro_compras'), loQuePideElLibro('libro_ventas'), loQuePideElLibro('libro_compras')])
      const ventas = unirConExcel(vBase, leerExcel(LS_VENTAS), 'client_rut')
      const compras = unirConExcel(cBase, leerExcel(LS_COMPRAS), 'provider_rut')
      setDatos({
        ventas, compras,
        nBaseV: vBase.length, nExcelV: ventas.length - vBase.length,
        nBaseC: cBase.length, nExcelC: compras.length - cBase.length,
        topeV, topeC,
        hora: new Date(),
      })
      setEstado('listo')
    } catch (e) { setError(e.message || String(e)); setEstado('error') }
  }
  useEffect(() => { cargar() }, [])

  // abonos registrados en la ficha de Facturas por área (pesan al elegir cuál copia conservar)
  const abonosVentas = useMemo(() => {
    const m = new Map()
    Object.values(facturas || {}).forEach(l => (l || []).forEach(f => { if (f.libroId && (f.abonos || []).length) m.set(f.libroId, f.abonos.length) }))
    return m
  }, [facturas])

  const r = useMemo(() => datos ? revisar({ ventas: datos.ventas, compras: datos.compras, abonosVentas }) : null, [datos, abonosVentas])

  const descargar = () => {
    if (!r) return
    const wb = XLSX.utils.book_new()
    const hoja = (nombre, filas, vacio) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas.length ? filas : [vacio]), nombre)
    hoja('Repetidos ventas', filasExcel(r.ventas.grupos, 'ventas', true), { Resultado: 'Sin repetidos' })
    hoja('Repetidos compras', filasExcel(r.compras.grupos, 'compras', true), { Resultado: 'Sin repetidos' })
    hoja('Posibles dobles', [...filasExcel(r.ventas.sospechosos, 'ventas', false), ...filasExcel(r.compras.sospechosos, 'compras', false)], { Resultado: 'Ninguno' })
    const falt = []
    r.faltantes.tipos.forEach(t => t.tramos.forEach(tr => falt.push({ Tipo: t.nombre, Desde: tr.desde, Hasta: tr.hasta, Cantidad: tr.cantidad, 'Tramo largo': tr.grande ? 'Sí' : '', 'Folio anterior': tr.antes.folio, 'Fecha anterior': tr.antes.fecha, 'Folio siguiente': tr.despues.folio, 'Fecha siguiente': tr.despues.fecha })))
    hoja('Folios que faltan', falt, { Resultado: 'Sin saltos' })
    const tipos = [...r.ventas.tipos.map(t => ({ Libro: 'Ventas', ...t })), ...r.compras.tipos.map(t => ({ Libro: 'Compras', ...t }))].map(t => ({ Libro: t.Libro, 'Como viene escrito': t.texto, 'El sistema lo entiende como': t.nombre, Documentos: t.cantidad, 'Parece nota de crédito y el libro la suma': t.libroNoLaResta ? 'Sí' : '' }))
    hoja('Tipos de documento', tipos, { Resultado: 'Sin datos' })
    XLSX.writeFile(wb, 'Revision_contable_' + hoyISO() + '.xlsx')
  }

  const avisosTope = datos ? [['Libro de Ventas', datos.topeV], ['Libro de Compras', datos.topeC]].filter(([, t]) => t && t.queCarga < t.total) : []

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: SEREIN.fontDisplay, fontWeight: 700, fontSize: 20, textTransform: 'uppercase', color: SEREIN.ink, display: 'flex', alignItems: 'center', gap: 8 }}><ClipboardCheck size={20} /> Revisión contable</div>
          <div style={{ fontSize: 12.5, color: C.suave, maxWidth: 640, marginTop: 2 }}>Busca documentos repetidos (facturas y notas de crédito) y folios que faltan en los libros de ventas y de compras. <b>Esta versión solo muestra: no oculta, borra ni cambia nada.</b></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={cargar} disabled={estado === 'cargando'} style={{ background: '#fff', border: '1px solid ' + C.linea, padding: '8px 14px', cursor: estado === 'cargando' ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><RotateCw size={14} /> {estado === 'cargando' ? 'Revisando…' : 'Revisar de nuevo'}</button>
          <button onClick={descargar} disabled={!r} style={{ background: r ? SEREIN.ink : '#DFE4EA', color: r ? '#fff' : C.gris, border: 'none', padding: '8px 14px', cursor: r ? 'pointer' : 'default', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Download size={14} /> Descargar Excel</button>
        </div>
      </div>

      {estado === 'cargando' && !r && <div style={{ color: C.suave, padding: 20 }}>Leyendo los libros…</div>}
      {estado === 'error' && <div style={{ background: SEREIN.redSoft, border: '1px solid ' + C.rojo, color: C.rojo, padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>No se pudieron leer los libros: {error}</div>}

      {r && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
            <Resumen titulo="Ventas repetidas" valor={r.resumen.gruposVentas} detalle={r.resumen.gruposVentas ? pl(r.ventas.copiasDeMas, 'copia de más', 'copias de más') + (r.ventas.seguros ? ' · los repetidos seguros ' + (r.ventas.efectoSeguro >= 0 ? 'suman ' : 'restan ') + clp(Math.abs(r.ventas.efectoSeguro)) + ' de más' : '') : 'ningún folio repetido'} color={C.rojo} ok={!r.resumen.gruposVentas} />
            <Resumen titulo="Folios que faltan (ventas)" valor={r.resumen.foliosQueFaltan} detalle={r.resumen.tramosGrandes ? pl(r.resumen.tramosGrandes, 'tramo largo', 'tramos largos') + ' aparte (período sin cargar)' : 'saltos sueltos en la numeración'} color={C.rojo} ok={!r.resumen.foliosQueFaltan && !r.resumen.tramosGrandes} />
            <Resumen titulo="Compras repetidas" valor={r.resumen.gruposCompras} detalle={r.resumen.gruposCompras ? pl(r.compras.copiasDeMas, 'copia de más', 'copias de más') + (r.compras.seguros ? ' · los repetidos seguros ' + (r.compras.efectoSeguro >= 0 ? 'suman ' : 'restan ') + clp(Math.abs(r.compras.efectoSeguro)) + ' de más' : '') : 'ningún documento repetido'} color={C.rojo} ok={!r.resumen.gruposCompras} />
            <Resumen titulo="Para mirar con calma" valor={r.resumen.sospechosos + r.resumen.alertasTipo} detalle={pl(r.resumen.sospechosos, 'posible doble', 'posibles dobles') + ' · ' + pl(r.resumen.alertasTipo, 'tipo de documento dudoso', 'tipos de documento dudosos')} color={C.naranja} ok={!r.resumen.sospechosos && !r.resumen.alertasTipo} />
          </div>

          <div style={{ fontSize: 12, color: C.suave, marginBottom: 14 }}>
            Se revisaron {r.ventas.documentos} documentos de ventas ({datos.nBaseV} de la base de datos{datos.nExcelV ? ' + ' + datos.nExcelV + ' de Excel' : ''}) y {r.compras.documentos} de compras ({datos.nBaseC} de la base de datos{datos.nExcelC ? ' + ' + datos.nExcelC + ' de Excel' : ''}) · {datos.hora.toLocaleString('es-CL')}
            {(r.ventas.sinFolio + r.compras.sinFolio) > 0 && <> · {r.ventas.sinFolio + r.compras.sinFolio} sin folio (no se pueden comparar)</>}
          </div>

          {avisosTope.map(([nombre, t]) => (
            <div key={nombre} style={{ background: '#FFF7E6', border: '1px solid ' + C.naranja, borderRadius: 6, padding: '10px 14px', fontSize: 13, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertTriangle size={16} color={C.naranja} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>El <b>{nombre}</b> solo carga {t.queCarga} de los {t.total} documentos que hay en la base, así que sus totales quedan cortos. Esta revisión sí leyó los {t.total}.</span>
            </div>
          ))}

          <Seccion titulo={'Ventas: documentos repetidos (' + r.resumen.gruposVentas + ')'} nota="Dos filas con el mismo tipo y folio son el mismo documento aunque el cliente o el RUT estén escritos distinto. Se sugiere conservar la copia que tiene más trabajo encima (pago, área, OT, abonos).">
            <ListaGrupos grupos={r.ventas.grupos} libro="ventas" vacio="No hay folios repetidos en el Libro de Ventas." />
          </Seccion>

          <Seccion titulo={'Ventas: folios que faltan (' + r.resumen.foliosQueFaltan + ')'} nota="Cada tipo de documento (factura, factura exenta, nota de crédito…) tiene su numeración. Se listan los números que no aparecen entre el menor y el mayor cargados; pueden ser documentos que no se cargaron o anulados.">
            <Faltantes faltantes={r.faltantes} />
          </Seccion>

          <Seccion titulo={'Compras: documentos repetidos (' + r.resumen.gruposCompras + ')'} nota="En compras cada proveedor numera por su cuenta: se compara tipo + folio + RUT del proveedor. Los saltos de folio no se revisan aquí porque no tienen sentido entre proveedores distintos.">
            <ListaGrupos grupos={r.compras.grupos} libro="compras" vacio="No hay documentos repetidos en el Libro de Compras." />
          </Seccion>

          <details style={card} open={r.resumen.sospechosos > 0 && r.resumen.sospechosos <= 8}>
            <summary style={{ ...titulo, cursor: 'pointer' }}>Posibles dobles con distinto folio ({r.resumen.sospechosos})</summary>
            <div style={{ fontSize: 12, color: C.suave, margin: '8px 0 12px' }}>Mismo tipo, mismo RUT, mismo total y misma fecha, pero con folios distintos. Pueden ser dos ventas reales iguales o una cargada dos veces con el folio mal escrito: aquí solo se avisa.</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Ventas</div>
            <ListaGrupos grupos={r.ventas.sospechosos} libro="ventas" vacio="Ninguno en ventas." sugerir={false} />
            <div style={{ fontSize: 12.5, fontWeight: 700, margin: '14px 0 6px' }}>Compras</div>
            <ListaGrupos grupos={r.compras.sospechosos} libro="compras" vacio="Ninguno en compras." sugerir={false} />
          </details>

          <details style={card} open={r.resumen.alertasTipo > 0}>
            <summary style={{ ...titulo, cursor: 'pointer' }}>Tipos de documento que traen los libros ({r.ventas.tipos.length + r.compras.tipos.length})</summary>
            <div style={{ fontSize: 12, color: C.suave, margin: '8px 0 12px' }}>Los libros solo restan como nota de crédito lo que dice exactamente «61». Si Defontana manda las notas de crédito escritas con texto, el libro las suma como venta o compra y el total queda inflado. Si aparece el aviso rojo, avísame.</div>
            <Tipos titulo="Libro de Ventas" tipos={r.ventas.tipos} libro="ventas" />
            <Tipos titulo="Libro de Compras" tipos={r.compras.tipos} libro="compras" />
          </details>
        </>
      )}
    </div>
  )
}
