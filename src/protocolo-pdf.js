// Genera un PDF real (Blob) de un protocolo PIG/PGP en el navegador, a
// partir del mismo HTML que ya usa "Descargar PDF" (impresion del
// navegador) — para poder subirlo solo a Google Drive sin depender de
// que alguien lo imprima a mano. Reutiliza jsPDF + html-to-image, que ya
// son dependencias de la app (ver OrganigramaModule.jsx).
import { jsPDF } from 'jspdf'
import { toPng } from 'html-to-image'
import { PDFDocument } from 'pdf-lib'

export async function generarPdfProtocoloBlob(fullHtml) {
  const styleMatch = fullHtml.match(/<style>([\s\S]*?)<\/style>/)
  const bodyMatch = fullHtml.match(/<body>([\s\S]*?)<\/body>/)
  if (!styleMatch || !bodyMatch) throw new Error('No se pudo preparar el documento para exportar.')
  const contenedor = document.createElement('div')
  contenedor.style.cssText = 'position:fixed;left:-99999px;top:0;background:#fff'
  contenedor.innerHTML = `<style>${styleMatch[1]}</style>${bodyMatch[1]}`
  document.body.appendChild(contenedor)
  try {
    // deja que carguen fuentes/imagenes (fotos base64 ya vienen inline,
    // pero el navegador igual necesita un tick para pintar el layout)
    await new Promise(res => setTimeout(res, 600))
    const paginas = contenedor.querySelectorAll('.page')
    if (!paginas.length) throw new Error('No se encontraron paginas para exportar.')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    for (let i = 0; i < paginas.length; i++) {
      const dataUrl = await toPng(paginas[i], { pixelRatio: 2, backgroundColor: '#ffffff' })
      if (i > 0) pdf.addPage()
      pdf.addImage(dataUrl, 'PNG', 0, 0, 210, 297)
    }
    return pdf.output('blob')
  } finally {
    document.body.removeChild(contenedor)
  }
}

// Convierte cualquier imagen (webp, gif, etc.) a un ArrayBuffer PNG,
// para los formatos que pdf-lib no sabe incrustar directo (solo soporta
// PNG y JPG nativamente).
function imagenAPngBuffer(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const cv = document.createElement('canvas')
      cv.width = img.naturalWidth; cv.height = img.naturalHeight
      cv.getContext('2d').drawImage(img, 0, 0)
      cv.toBlob(png => {
        URL.revokeObjectURL(url)
        if (!png) { reject(new Error('No se pudo convertir la imagen')); return }
        png.arrayBuffer().then(resolve, reject)
      }, 'image/png')
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo cargar la imagen')) }
    img.src = url
  })
}

// Fusiona los certificados de calibracion tildados en las mismas paginas
// del PDF del protocolo, para que quede UN solo archivo al descargar (en
// vez de un archivo por certificado aparte). Cada certificado puede ser
// un PDF (se copian sus paginas tal cual) o una imagen (se agrega como
// una pagina A4 nueva, centrada). Si un certificado puntual falla al
// traerlo o leerlo, se omite y se sigue con el resto — nunca se cae la
// descarga del protocolo completo por un certificado con problemas.
export async function agregarCertificadosAlPdf(protocoloBlob, certUrls) {
  const pdfDoc = await PDFDocument.load(await protocoloBlob.arrayBuffer())
  for (const url of certUrls) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const blob = await res.blob()
      const tipo = (blob.type || res.headers.get('content-type') || '').toLowerCase()
      if (tipo.indexOf('pdf') >= 0) {
        const certDoc = await PDFDocument.load(await blob.arrayBuffer())
        const paginas = await pdfDoc.copyPages(certDoc, certDoc.getPageIndices())
        paginas.forEach(pg => pdfDoc.addPage(pg))
        continue
      }
      let buf = await blob.arrayBuffer()
      let img
      try {
        img = tipo.indexOf('png') >= 0 ? await pdfDoc.embedPng(buf) : await pdfDoc.embedJpg(buf)
      } catch (e) {
        img = await pdfDoc.embedPng(await imagenAPngBuffer(blob))
      }
      const pagina = pdfDoc.addPage([595.28, 841.89]) // A4 en puntos
      const { width, height } = pagina.getSize()
      const margen = 40
      const escala = Math.min((width - margen * 2) / img.width, (height - margen * 2) / img.height, 1)
      const w = img.width * escala, h = img.height * escala
      pagina.drawImage(img, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h })
    } catch (e) { /* se omite ese certificado — el resto del PDF sigue */ }
  }
  const bytes = await pdfDoc.save()
  return new Blob([bytes], { type: 'application/pdf' })
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
