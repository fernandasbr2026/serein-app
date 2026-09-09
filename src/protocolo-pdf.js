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
      // reporto Fernanda). Ahora en vez de achicar se corta en tantas hojas
      // de 297mm como haga falta, a ancho completo — mismo resultado que
      // imprimirla de verdad, aunque el corte sea una tijera ciega (puede
      // partir una tabla o foto justo en el borde; sigue siendo mejor que
      // todo el documento ilegible por chico).
      const nCortes = Math.max(1, Math.ceil(altoMm / 297))
      for (let c = 0; c < nCortes; c++) {
        const altoCorte = Math.min(297, altoMm - c * 297)
        if (!esLaPrimera) pdf.addPage()
        esLaPrimera = false
        const dataUrlCorte = nCortes === 1 ? dataUrl : recortarImagen(img, (c * 297 / altoMm) * img.naturalHeight, (altoCorte / altoMm) * img.naturalHeight)
        pdf.addImage(dataUrlCorte, 'PNG', 0, 0, 210, altoCorte)
      }
    }
    return pdf.output('blob')
  } finally {
    document.body.removeChild(contenedor)
  }
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
