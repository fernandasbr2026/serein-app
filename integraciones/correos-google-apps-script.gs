// ============================================================
// SEREIN · Envío de correos al ERP (Google Apps Script)
// ============================================================
// Se pega en script.google.com con la cuenta de correo de Serein. Cada 15
// minutos revisa los correos nuevos que parecen ÓRDENES DE COMPRA (recibidos)
// o COTIZACIONES (enviadas por ti), manda cada uno al ERP (función
// correos-ingresar) y recuerda cuáles ya mandó para no repetirlos. Además les
// pone la etiqueta "Serein-Revisado" para que los veas en Gmail.
// No borra, no mueve ni responde ningún correo.
//
// No hay claves que poner: el ERP reconoce la casilla de Google donde está instalado el script. Se instala igual en cada casilla
// (comercial@, administracion@, facturacion@): el ERP junta todo y descarta lo repetido.
// ============================================================

const URL_FUNCION = 'https://TU-PROYECTO.supabase.co/functions/v1/correos-ingresar';

// ---------- Ajustes (se pueden dejar como están) ----------
const DIAS_ATRAS = 180;                    // hasta cuántos días atrás revisar
const DOMINIO_PROPIO = '@sereinspa.com';   // para distinguir tus correos de los de los clientes
const ETIQUETA = 'Serein-Revisado';
const BUZON = Session.getEffectiveUser().getEmail();   // casilla donde está instalado el script (se detecta sola)
const MAX_MB_ADJUNTO = 6;                  // adjuntos más pesados se omiten
const MINUTOS_MAX = 4.5;                   // tiempo máximo por ejecución
const MAX_HILOS = 300;                     // cuántas conversaciones recorrer por consulta

// Palabras que hacen que un correo se considere candidato (la IA confirma después)
const PALABRAS_OC = '"orden de compra" OR "orden compra" OR "o/c" OR oc OR "purchase order" OR "orden de trabajo" OR pedido';
const PALABRAS_COT = 'cotizacion OR cotización OR "COT-SER" OR presupuesto OR oferta OR propuesta';

function consultas_() {
  const base = 'newer_than:' + DIAS_ATRAS + 'd has:attachment filename:pdf';
  return [
    { carpeta: 'entrada', q: 'in:inbox ' + base + ' (' + PALABRAS_OC + ')' },
    { carpeta: 'enviados', q: 'in:sent ' + base + ' (' + PALABRAS_COT + ')' },
  ];
}

// Revisa los correos pendientes y los manda al ERP. Es lo que corre cada 15 minutos.
function sincronizar() {
  const inicio = new Date().getTime();
  const etiqueta = GmailApp.getUserLabelByName(ETIQUETA) || GmailApp.createLabel(ETIQUETA);
  const ya = cargarProcesados_();
  let enviados = 0, errores = 0;
  consultas_().forEach(function (c) {
    for (let desde = 0; desde < MAX_HILOS; desde += 50) {
      if (excedido_(inicio)) break;
      const hilos = GmailApp.search(c.q, desde, 50);
      if (!hilos.length) break;
      hilos.forEach(function (hilo) {
        if (excedido_(inicio)) return;
        let marcar = false;
        hilo.getMessages().forEach(function (msg) {
          if (excedido_(inicio)) return;
          const id = msg.getId();
          if (ya[id]) return;
          const propio = String(msg.getFrom()).toLowerCase().indexOf(DOMINIO_PROPIO) >= 0;
          if (c.carpeta === 'entrada' && propio) return;     // en la entrada solo interesan los de afuera
          if (c.carpeta === 'enviados' && !propio) return;   // en enviados solo los tuyos
          const adjuntos = [];
          msg.getAttachments({ includeInlineImages: false }).forEach(function (a) {
            if (String(a.getContentType()).toLowerCase().indexOf('pdf') < 0) return;
            if (a.getSize() > MAX_MB_ADJUNTO * 1024 * 1024) return;
            adjuntos.push({ nombre: a.getName(), mimeType: 'application/pdf', base64: Utilities.base64Encode(a.getBytes()) });
          });
          if (!adjuntos.length) return;
          const r = enviar_({ mensajes: [{
            id: id,
            buzon: BUZON,
            fecha: msg.getDate().toISOString(),
            de: msg.getFrom(),
            para: msg.getTo(),
            asunto: msg.getSubject(),
            cuerpo: msg.getPlainBody().slice(0, 6000),
            carpeta: c.carpeta,
            adjuntos: adjuntos,
          }] });
          if (r && r.ok && r.resultados && r.resultados[0] && r.resultados[0].ok) { ya[id] = 1; enviados++; marcar = true; }
          else { errores++; Logger.log('Error con "' + msg.getSubject() + '": ' + JSON.stringify(r)); }
        });
        if (marcar) hilo.addLabel(etiqueta);
      });
    }
  });
  guardarProcesados_(ya);
  Logger.log('Listo: ' + enviados + ' correo(s) enviados al ERP, ' + errores + ' con error.');
}

function enviar_(obj) {
  try {
    const resp = UrlFetchApp.fetch(URL_FUNCION, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-google-token': ScriptApp.getOAuthToken() },
      payload: JSON.stringify(obj),
      muteHttpExceptions: true,
    });
    return JSON.parse(resp.getContentText());
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function excedido_(inicio) {
  return (new Date().getTime() - inicio) / 60000 > MINUTOS_MAX;
}

// Lista de correos ya enviados (se guarda en el propio script, repartida en 16 cajitas por la primera letra del id)
function cargarProcesados_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const m = {};
  Object.keys(props).forEach(function (k) {
    if (k.indexOf('p_') !== 0) return;
    try { JSON.parse(props[k]).forEach(function (id) { m[id] = 1; }); } catch (e) {}
  });
  return m;
}

function guardarProcesados_(m) {
  const cubos = {};
  Object.keys(m).forEach(function (id) { const k = 'p_' + id.charAt(0); (cubos[k] = cubos[k] || []).push(id); });
  const props = {};
  Object.keys(cubos).forEach(function (k) {
    let arr = cubos[k];
    while (JSON.stringify(arr).length > 8500) arr = arr.slice(Math.ceil(arr.length / 10));   // si se llena, se olvidan los más antiguos
    props[k] = JSON.stringify(arr);
  });
  PropertiesService.getScriptProperties().setProperties(props);
}

// 1) Ejecuta ESTA primero: autoriza el script y comprueba que el ERP responde.
function probarConexion() {
  const r = enviar_({ ping: true });
  Logger.log(JSON.stringify(r));
  if (!r || !r.ok) throw new Error('No hay conexión con el ERP: ' + JSON.stringify(r));
}

// 2) Ejecuta esta UNA vez: deja el envío automático cada 15 minutos.
function activarEnvioAutomatico() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sincronizar') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(15).create();
  Logger.log('Listo: se enviarán los correos nuevos cada 15 minutos.');
}

// Para apagarlo: ejecuta esta función.
function desactivarEnvioAutomatico() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sincronizar') ScriptApp.deleteTrigger(t); });
  Logger.log('Envío automático apagado.');
}

// Solo si quieres que vuelva a enviar todo desde cero (el ERP ignora lo que ya tiene).
function olvidarEnviados() {
  const props = PropertiesService.getScriptProperties();
  Object.keys(props.getProperties()).forEach(function (k) { if (k.indexOf('p_') === 0) props.deleteProperty(k); });
  Logger.log('Listo: el script olvidó lo que ya había enviado.');
}
