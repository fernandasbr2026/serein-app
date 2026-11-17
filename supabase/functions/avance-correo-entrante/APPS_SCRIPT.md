# Cómo mandar los correos del cliente al Módulo Avance de Obra

El script de Google (Apps Script) que ya alimenta a `correos-ingresar` debe hacer
una segunda tarea: tomar los correos cuyos remitentes figuran en alguna OT del
módulo de avance y mandarlos a `avance-correo-entrante`. No lee nada con IA: solo
los deja guardados para que «Actualizar proyecto» los considere.

Pasos en el editor de Apps Script de la casilla de Serein:

1. Pegar esta función y programarla cada 15 minutos (Activadores → basado en tiempo).
2. La primera vez, ejecutarla a mano para autorizar los permisos de Gmail.

```javascript
const URL_AVANCE = 'https://fyupirswsvojdswpzvjm.supabase.co/functions/v1/avance-correo-entrante';

function enviarCorreosAvance() {
  const token = ScriptApp.getOAuthToken();               // identifica a la casilla de Serein
  const cab = { 'x-acceso-casilla': token };
  // 1) qué remitentes hay que vigilar (los configurados en cada OT)
  const r = UrlFetchApp.fetch(URL_AVANCE, { method: 'post', contentType: 'application/json', headers: cab, payload: JSON.stringify({ remitentes: true }), muteHttpExceptions: true });
  const remitentes = (JSON.parse(r.getContentText()).remitentes || []);
  if (!remitentes.length) return;
  // 2) correos de esos remitentes de los últimos 3 días
  const q = 'newer_than:3d (' + remitentes.map(x => 'from:' + x).join(' OR ') + ')';
  const hilos = GmailApp.search(q, 0, 40);
  const mensajes = [];
  hilos.forEach(h => h.getMessages().forEach(m => {
    const adjuntos = m.getAttachments().slice(0, 10).map(a => ({ nombre: a.getName(), mimeType: a.getContentType(), base64: a.getSize() <= 10 * 1024 * 1024 ? Utilities.base64Encode(a.getBytes()) : null }));
    mensajes.push({ id: m.getId(), buzon: Session.getActiveUser().getEmail(), de: m.getFrom(), para: m.getTo(), asunto: m.getSubject(), fecha: m.getDate().toISOString(), cuerpo: m.getPlainBody().slice(0, 20000), adjuntos });
  }));
  // 3) se mandan de a 20; la función ignora los que ya tiene (mismo id de Gmail)
  for (let i = 0; i < mensajes.length; i += 20) {
    UrlFetchApp.fetch(URL_AVANCE, { method: 'post', contentType: 'application/json', headers: cab, payload: JSON.stringify({ mensajes: mensajes.slice(i, i + 20) }), muteHttpExceptions: true });
  }
}
```

Prueba de conexión desde el mismo editor:

```javascript
function probarAvance() {
  const r = UrlFetchApp.fetch(URL_AVANCE, { method: 'post', contentType: 'application/json', headers: { 'x-acceso-casilla': ScriptApp.getOAuthToken() }, payload: JSON.stringify({ ping: true }), muteHttpExceptions: true });
  Logger.log(r.getContentText());
}
```

Casillas autorizadas (en el código de la función): comercial@, administracion@,
facturacion@ y proyectos@sereinspa.com. Si el script corre en otra casilla, hay
que agregarla a `CASILLAS_PERMITIDAS` y volver a desplegar.
