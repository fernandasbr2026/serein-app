import { useSyncExternalStore } from 'react'

// El navegador avisa que la app se puede instalar con el evento `beforeinstallprompt`, y lo dispara UNA
// sola vez, a los pocos segundos de abrir la página. Si el botón de instalar se monta más tarde (al
// iniciar sesión sin recargar), el aviso ya pasó y el botón nunca aparecería. Por eso el evento se
// captura acá, apenas arranca la app, y los botones solo leen lo guardado. Mismo mecanismo que COPRESEG.
let aviso = null
let version = 0
const oyentes = new Set()

function estaInstalada() {
  if (typeof window === 'undefined') return false
  return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true
}
let instalada = estaInstalada()

// iPadOS 13+ se presenta como Mac: se distingue por la pantalla táctil.
const esIos = typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

function avisarCambio() { version += 1; oyentes.forEach(f => f()) }

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); aviso = e; avisarCambio() })
  window.addEventListener('appinstalled', () => { aviso = null; instalada = true; avisarCambio() })
}

const suscribir = f => { oyentes.add(f); return () => oyentes.delete(f) }
const leerVersion = () => version

export function useInstalacion() {
  useSyncExternalStore(suscribir, leerVersion, leerVersion)
  return {
    esIos,
    // true si vale la pena mostrar algo: el navegador ofrece instalar, o es iPhone/iPad (se instala a mano)
    ofrecer: !instalada && (!!aviso || esIos),
    async instalar() {
      if (!aviso) return
      const evento = aviso
      aviso = null
      avisarCambio()
      evento.prompt()
      await evento.userChoice
    },
  }
}
