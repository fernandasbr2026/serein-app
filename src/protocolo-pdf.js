// Genera un PDF real (Blob) de un protocolo PIG/PGP en el navegador, a
// partir del mismo HTML que ya usa "Descargar PDF" (impresion del
// navegador) — para poder subirlo solo a Google Drive sin depender de
// que alguien lo imprima a mano. Reutiliza jsPDF + html-to-image, que ya
// son dependencias de la app (ver OrganigramaModule.jsx).
import { jsPDF } from 'jspdf'
import { toPng } from 'html-to-image'

// 794px equivale a 210mm (ancho A4) a 96dpi. Se le fija ese ancho al
// contenedor porque las paginas del protocolo no traen un ancho propio en
// su CSS (estaba pensado solo para @page al imprimir, que no aplica fuera
// de una impresion real) — sin esto, el div se renderiza con un ancho
// impredecible (shrink-to-fit) y todo sale mal proporcionado.
export async function generarPdfProtocoloBlob(fullHtml) {
  const styleMatch = fullHtml.match(/<style>([\s\S]*?)<\/style>/)
  const bodyMatch = fullHtml.match(/<body>([\s\S]*?)<\/body>/)
  if (!styleMatch || !bodyMatch) throw new Error('No se pudo preparar el documento para exportar.')
  const contenedor = document.createElement('div')
  contenedor.style.cssText = 'position:fixed;left:-99999px;top:0;width:794px;background:#fff'
  contenedor.innerHTML = `<style>${styleMatch[1]}</style>${bodyMatch[1]}`
  document.body.appendChild(contenedor)
  try {
    // deja que carguen fuentes/imagenes (fotos base64 ya vienen inline,
    // pero el navegador igual necesita un tick para pintar el layout)
    await new Promise(res => setTimeout(res, 600))
    const paginas = contenedor.querySelectorAll('.page')
    if (!paginas.length) throw new Error('No se encontraron paginas para exportar.')
    // El margen de hoja (20mm arriba, 15mm a los lados y abajo) lo pone el
    // @page del navegador al imprimir de verdad — eso NO se captura al
    // rasterizar el div con html-to-image (el contenido queda pegado al
    // borde). Se replica a mano como padding antes de capturar, con
    // box-sizing:border-box para que el contenido se angoste hacia
    // adentro en vez de ensanchar la pagina (el ancho total sigue siendo
    // 794px = 210mm, igual que asume el resto de este archivo). Mismos
    // valores que el @page de PROTO_CSS en OTModule.jsx — si ese margen
    // cambia algun dia, hay que actualizar este tambien.
    paginas.forEach(pg => {
      pg.style.boxSizing = 'border-box'
      pg.style.width = '794px'
      pg.style.paddingTop = '20mm'
      pg.style.paddingLeft = '15mm'
      pg.style.paddingRight = '15mm'
      pg.style.paddingBottom = 'calc(15mm + 70px)' // 15mm del margen + los 70px que ya reservaba .page para el pie
    })
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    let esLaPrimera = true
    for (let i = 0; i < paginas.length; i++) {
      const dataUrl = await toPng(paginas[i], { pixelRatio: 2, backgroundColor: '#ffffff' })
      const img = await cargarImagen(dataUrl)
      const altoMm = 210 * (img.naturalHeight / img.naturalWidth)
      // Cada .page de la plantilla equivale a una hoja A4 al imprimirla de
      // verdad (@page + el navegador reparte solo el sobrante en paginas
      // siguientes). Aca no hay ese reparto automatico: si el contenido real
      // mide mas de 297mm, antes se achicaba la pagina COMPLETA para que
      // "cupiera" entera — quedaba angosta y con todo achicado (el bug que
      // reporto Fernanda). Ahora se corta en tantas hojas de hasta 297mm
      // como haga falta, a ancho completo — pero el corte YA NO es ciego:
      // antes de rasterizar se mide en el DOM real donde estan los bloques
      // marcados como indivisibles en el CSS (.evcard = una evidencia con
      // sus fotos, .keep-together), y si un corte de 297mm caeria en medio
      // de uno de esos bloques, el corte se adelanta al borde superior del
      // bloque — mismo criterio que "page-break-inside:avoid" logra en una
      // impresion real, pero aplicado a la imagen recortada (reportado:
      // un bloque de evidencia quedaba partido a la mitad entre 2 hojas).
      const bloques = medirBloquesIndivisibles(paginas[i], altoMm)
      const cortes = calcularCortes(altoMm, bloques)
      cortes.forEach(({ inicio, fin }) => {
        if (!esLaPrimera) pdf.addPage()
        esLaPrimera = false
        const alto = fin - inicio
        const dataUrlCorte = cortes.length === 1 ? dataUrl : recortarImagen(img, (inicio / altoMm) * img.naturalHeight, (alto / altoMm) * img.naturalHeight)
        pdf.addImage(dataUrlCorte, 'PNG', 0, 0, 210, alto)
      })
    }
    return pdf.output('blob')
  } finally {
    document.body.removeChild(contenedor)
  }
}

// Mide, en el DOM real (antes de rasterizar), el rango vertical (en mm,
// misma escala que altoMm) de cada bloque que el propio CSS del protocolo
// marca como indivisible (.evcard, .keep-together). getBoundingClientRect
// devuelve px CSS (no depende del pixelRatio de la captura), y el
// contenedor siempre mide 794px = 210mm de ancho, asi que la conversion a
// mm es directa: mm = px * (210/794).
function medirBloquesIndivisibles(pagina, altoMm) {
  const PX_A_MM = 210 / 794
  const base = pagina.getBoundingClientRect()
  return Array.from(pagina.querySelectorAll('.evcard, .keep-together')).map(el => {
    const r = el.getBoundingClientRect()
    return { top: (r.top - base.top) * PX_A_MM, bottom: (r.bottom - base.top) * PX_A_MM }
  }).filter(b => b.bottom > 0 && b.top < altoMm)
}

// Arma los cortes de hasta 297mm cada uno, pero si un corte de 297mm
// caeria en medio de un bloque indivisible, lo adelanta al borde superior
// de ese bloque (deja algo de espacio en blanco al final de la hoja
// anterior, igual que haria una impresion real con page-break-inside).
// Si un bloque es mas alto que una hoja completa no hay forma de
// evitarlo — se corta igual, no hay otra opcion.
function calcularCortes(altoMm, bloques) {
  const MAX = 297
  const cortes = []
  let y = 0
  while (y < altoMm - 0.01) {
    let fin = Math.min(altoMm, y + MAX)
    const cruzando = bloques.filter(b => b.top > y + 0.5 && b.top < fin - 0.5 && b.bottom > fin)
    if (cruzando.length) {
      const nuevoFin = Math.min(...cruzando.map(b => b.top))
      if (nuevoFin > y + 0.5) fin = nuevoFin
    }
    cortes.push({ inicio: y, fin })
    y = fin
  }
  return cortes
}

function cargarImagen(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}

// Recorta una franja horizontal (alto srcH, ancho completo) de la imagen
// capturada, arrancando en srcY — todo en px reales de la imagen. Se usa
// solo cuando una pagina no entra completa en una hoja A4.
function recortarImagen(img, srcY, srcH) {
  const y = Math.round(srcY), h = Math.round(srcH)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, y, img.naturalWidth, h, 0, 0, img.naturalWidth, h)
  return canvas.toDataURL('image/png')
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function fileToBase64(file) {
  return blobToBase64(file)
}

// Criterio de "protocolo completo" para habilitar el cierre + subida a
// Drive: firmas con fecha (quedaron firmadas) y al menos una foto de
// evidencia cargada en algun lado del protocolo. Es deliberadamente
// simple y explicito — mejor que alguien tenga que revisar y confirme
// con el clic, a que el sistema decida solo si "esta listo".
export function protocoloCompleto(p) {
  const firmasOk = (p.firmas || []).length > 0 && (p.firmas || []).every(f => (f.fecha || '').trim())
  let hayFotos = (p.fotosGranalla || []).length > 0
  if (!hayFotos && p.tipo === 'PIG') hayFotos = (p.checks || []).some(c => (c.fotos || []).length > 0)
  if (!hayFotos && p.tipo === 'PGP') hayFotos = (p.capas || []).some(c => (c.fotos || []).length > 0)
  const faltantes = []
  if (!firmasOk) faltantes.push('firmas (falta fecha en alguna)')
  if (!hayFotos) faltantes.push('fotos de evidencia')
  return { completo: firmasOk && hayFotos, faltantes }
}
