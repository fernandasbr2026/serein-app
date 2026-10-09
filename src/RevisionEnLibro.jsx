import React, { useMemo } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { SEREIN } from './theme-serein.js'
import { revisar, nombreTipo } from './revisionContable.js'

// ============================================================
// Revisión de ventas DENTRO del Libro de Ventas: marca las filas repetidas,
// deja filtrar «solo repetidas» y lista los folios que faltan con un botón
// para agregarlos. Usa la misma lógica que la pantalla «Revisión contable»
// (revisionContable.js) sobre las filas que el libro ya tiene cargadas, sin
// consultar nada más. No cambia ningún documento: ocultar o agregar lo hace
// la persona con los botones de siempre del libro.
// ============================================================
const C = { naranja: SEREIN.orange, rojo: SEREIN.red, verde: SEREIN.green, azul: SEREIN.blue, suave: SEREIN.textSoft, linea: SEREIN.line, fog: SEREIN.fog }
const fmtF = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? m[3] + '-' + m[2] + '-' + m[1] : 'sin fecha' }
const MAX_CHIPS = 60   // sobre esto se resume: son demasiados folios para ir uno por uno

// `todas`: las filas del libro (base + Excel). `facturas`: Facturas por área (sus abonos pesan al sugerir qué copia dejar).
export function useRevisionVentas(todas, facturas) {
  const abonos = useMemo(() => {
    const m = new Map()
    Object.values(facturas || {}).forEach(l => (l || []).forEach(f => { if (f.libroId && (f.abonos || []).length) m.set(f.libroId, f.abonos.length) }))
    return m
  }, [facturas])
  return useMemo(() => {
    const r = revisar({ ventas: todas, compras: [], abonosVentas: abonos })
    const info = new Map()
    const repetidos = new Set()
    const sobrantes = new Set()
    const orden = new Map()   // para listar juntas las copias de un mismo folio (la que conviene dejar, primero)
    let n = 0
    for (const g of r.ventas.grupos) {
      for (const it of g.items) {
        orden.set(it.doc.id, n++)
        repetidos.add(it.doc.id)
        info.set(it.doc.id, { clase: g.clase, conservar: it.conservar, hayGanador: g.hayGanador, copias: g.items.length, motivo: g.motivo })
        if (g.hayGanador && !it.conservar) sobrantes.add(it.doc.id)
      }
    }
    for (const g of r.ventas.sospechosos) for (const it of g.items) if (!info.has(it.doc.id)) info.set(it.doc.id, { clase: 'doble', conservar: false, hayGanador: false, copias: g.items.length })
    const porExcel = [...sobrantes].filter(id => (todas.find(x => x.id === id) || {}).origen === 'xlsx').length
    return {
      r,
      grupos: r.ventas.grupos,
      seguros: r.ventas.seguros,
      sospechosos: r.ventas.sospechosos.length,
      faltantes: r.faltantes,
      info,
      orden,
      idsRepetidos: repetidos,
      idsSobrantes: sobrantes,
      sobrantesDeExcel: porExcel,
    }
  }, [todas, abonos])
}

const TEXTO_CLASE = {
  exacto: 'Repetida: hay otra copia igual de este documento',
  montos: 'Mismo folio con otro monto: revisar cuál es la correcta',
  cliente: 'Mismo folio con otro cliente: revisar cuál es la correcta',
  doble: 'Posible doble: otro folio con el mismo cliente, monto y fecha',
}

// Marca chica junto al folio de una fila.
export function ChipRepetida({ info }) {
  if (!info) return null
  const color = info.clase === 'exacto' ? C.rojo : info.clase === 'doble' ? C.azul : C.naranja
  const texto = info.clase === 'exacto' ? (info.conservar ? 'Repetida' : 'Sobra') : info.clase === 'doble' ? '¿Doble?' : 'Revisar'
  return (
    <span title={TEXTO_CLASE[info.clase] + (info.hayGanador ? (info.conservar ? ' (esta es la que conviene dejar)' : ' (se sugiere ocultar esta)') : '')}
      style={{ background: color + '1F', color, fontWeight: 700, fontSize: 10, padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap', lineHeight: 1.5 }}>{texto}</span>
  )
}

const botonLink = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, textDecoration: 'underline', color: 'inherit' }

// Franja bajo las tarjetas del libro: cuánto hay y atajos para verlo.
export function BannerRevision({ rev, soloRepetidas, setSoloRepetidas, verFaltantes, setVerFaltantes, onSeleccionarSobrantes, onIr }) {
  const nGrupos = rev.grupos.length
  const faltan = rev.faltantes.faltan
  const grandes = rev.faltantes.tramosGrandes
  const todoBien = !nGrupos && !faltan && !grandes && !rev.sospechosos
  return (
    <div style={{ border: '1px solid ' + (todoBien ? C.verde : C.naranja), background: todoBien ? SEREIN.greenSoft : '#FFF7E6', borderRadius: 6, padding: '9px 12px', marginBottom: 12, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5 }}>
      {todoBien
        ? <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.verde, fontWeight: 600 }}><CheckCircle2 size={15} /> Revisión del libro: no hay folios repetidos ni saltos en la numeración.</span>
        : <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: SEREIN.orangeDark }}><AlertTriangle size={15} /> Revisión del libro</span>}
      {nGrupos > 0 && (
        <span>
          <b>{nGrupos}</b> {nGrupos === 1 ? 'folio repetido' : 'folios repetidos'}{rev.seguros ? ' (' + rev.seguros + ' seguro' + (rev.seguros === 1 ? '' : 's') + ')' : ''}{' · '}
          <button onClick={() => setSoloRepetidas(!soloRepetidas)} style={botonLink}>{soloRepetidas ? 'Ver todas las filas' : 'Ver solo las repetidas'}</button>
          {rev.idsSobrantes.size > 0 && <> {' · '}<button onClick={onSeleccionarSobrantes} style={botonLink} title="Marca la casilla de las copias que se sugiere ocultar; después tú las ocultas con «Eliminar seleccionados»">Marcar las que sobran ({rev.idsSobrantes.size})</button>{rev.sobrantesDeExcel > 0 && <span style={{ color: C.suave, fontSize: 11.5 }}> ({rev.sobrantesDeExcel} de Excel: al eliminarlas se borran para siempre)</span>}</>}
        </span>
      )}
      {(faltan > 0 || grandes > 0) && (
        <span>
          <b>{faltan}</b> {faltan === 1 ? 'folio que falta' : 'folios que faltan'}{grandes > 0 ? ' + ' + grandes + (grandes === 1 ? ' tramo largo' : ' tramos largos') : ''}{' · '}
          <button onClick={() => setVerFaltantes(!verFaltantes)} style={botonLink}>{verFaltantes ? 'Ocultar la lista' : 'Ver la lista y agregarlos'}</button>
        </span>
      )}
      {rev.sospechosos > 0 && <span style={{ color: C.suave }}>{rev.sospechosos} posible{rev.sospechosos === 1 ? '' : 's'} doble{rev.sospechosos === 1 ? '' : 's'} (ver revisión completa)</span>}
      {onIr && <button onClick={onIr} style={{ ...botonLink, marginLeft: 'auto', color: C.suave }}>Revisión completa y Excel ▸</button>}
    </div>
  )
}

// Lista de folios que faltan; cada uno es un botón que abre el formulario de agregar con ese folio ya puesto.
export function PanelFaltantes({ faltantes, onAgregar }) {
  if (!faltantes.tipos.length) return null
  return (
    <div style={{ border: '1px solid ' + C.linea, background: '#fff', borderRadius: 6, padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ fontSize: 12.5, color: C.suave, marginBottom: 8 }}>
        Pulsa un folio para agregarlo: se abre el formulario con el número ya puesto. Si tienes el PDF, usa mejor «Leer factura con IA». Si ese folio se anuló o nunca se emitió, no hace falta agregarlo.
      </div>
      {faltantes.tipos.map(t => {
        const chips = []
        let omitidos = 0
        t.tramos.forEach(tr => {
          if (tr.grande) { omitidos += tr.cantidad; return }
          for (let f = tr.desde; f <= tr.hasta; f++) chips.push({ folio: f, tr })
        })
        if (!chips.length && !omitidos) return null
        return (
          <div key={t.tipo} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 5 }}>
              {t.nombre}{' '}<span style={{ fontWeight: 400, color: C.suave }}>· cargados del folio {t.primero.folio} al {t.ultimo.folio} · {chips.length ? 'faltan ' + chips.length : 'sin saltos sueltos'}{omitidos ? ' · ' + omitidos + ' folios en tramos largos (período sin cargar)' : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {chips.slice(0, MAX_CHIPS).map(({ folio, tr }) => (
                <button key={folio} onClick={() => onAgregar(t, folio, tr)}
                  title={'Quedó entre el ' + tr.antes.folio + ' (' + fmtF(tr.antes.fecha) + (tr.antes.nombre ? ', ' + tr.antes.nombre : '') + ') y el ' + tr.despues.folio + ' (' + fmtF(tr.despues.fecha) + (tr.despues.nombre ? ', ' + tr.despues.nombre : '') + ')'}
                  style={{ background: '#fff', border: '1px solid ' + C.rojo, color: C.rojo, borderRadius: 14, padding: '3px 11px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>+ {folio}</button>
              ))}
              {chips.length > MAX_CHIPS && <span style={{ fontSize: 12, color: C.suave, alignSelf: 'center' }}>… y {chips.length - MAX_CHIPS} más (míralos en la revisión completa)</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Frase para el formulario cuando se agrega un folio que faltaba.
export const pistaDeFolio = (t, folio, tr) =>
  'Agregando el folio ' + folio + ' (' + nombreTipo(t.tipo).toLowerCase() + '): por la numeración quedó entre el ' + tr.antes.folio + ' (' + fmtF(tr.antes.fecha) + ') y el ' + tr.despues.folio + ' (' + fmtF(tr.despues.fecha) + '). Pon la fecha, el cliente y los montos reales de ese documento.'
