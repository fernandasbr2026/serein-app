// Se carga dentro del service worker (ver vite.config.js, workbox.importScripts).
// Cuando se activa una versión nueva del ERP, recarga todas las pestañas abiertas
// de la versión anterior. Antes, una pestaña abierta hace días seguía con el
// código viejo hasta que alguien la recargaba a mano, y mientras tanto guardaba
// con reglas antiguas y pisaba lo que otros ingresaban (2026-11-11: OT eliminadas
// que volvían a aparecer). La recarga espera 1,5 s para no cortar un guardado
// que esté en vuelo.
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try {
      await self.clients.claim()
      await new Promise(function (r) { setTimeout(r, 1500) })
      const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of clientes) {
        try { if (c.url && c.url.indexOf(self.location.origin) === 0 && 'navigate' in c) await c.navigate(c.url) } catch (e) {}
      }
    } catch (e) {}
  })())
})
