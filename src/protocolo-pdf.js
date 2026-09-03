// Genera un PDF real (Blob) de un protocolo PIG/PGP en el navegador, a
// partir del mismo HTML que ya usa "Descargar PDF" (impresion del
// navegador) — para poder subirlo solo a Google Drive sin depender de
// que alguien lo imprima a mano. Reutiliza jsPDF + html-to-image, que ya
// son dependencias de la app (ver OrganigramaModule.jsx).
import { jsPDF } from 'jspdf'
import { toPng } from 'html-to-image'

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
