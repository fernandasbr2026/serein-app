// ============================================================
// SEREIN · Envío de correos al ERP (Google Apps Script) — versión 15-10-2026
// ============================================================
// Se pega en script.google.com con la cuenta de correo de Serein. Cada 10
// minutos revisa los correos nuevos que parecen ÓRDENES DE COMPRA (recibidos)
// o COTIZACIONES (enviadas por ti), manda cada uno al ERP (función
// correos-ingresar) y recuerda cuáles ya mandó para no repetirlos. Además les
// pone la etiqueta "Serein-Revisado" para que los veas en Gmail.
// No borra, no mueve ni responde ningún correo.
//
// No hay claves que poner: el ERP reconoce la casilla de Google donde está instalado el script. Se instala igual en cada casilla
// (comercial@, administracion@): el ERP junta todo y descarta lo repetido.
//
// Qué cambió el 15-10-2026 (auditoría de consumo de IA):
//  - Antes de mandar un correo, el script le PREGUNTA al ERP cuáles ya tiene ({consultar:[ids]}).
//    La memoria local (Propiedades del script) es solo un atajo: la fuente de verdad es el ERP.
//    Así, aunque la memoria se llene o se borre, nunca se vuelve a leer un correo con la IA.
//  - Un correo se marca como visto apenas el ERP lo recibe (con o sin documentos, con o sin error):
//    el ERP lleva la cuenta de reintentos (máximo 3). Antes, un correo con error se reenviaba cada 10 min para siempre.
//  - Los correos sin PDF utilizable también se recuerdan (antes se volvían a revisar en cada pasada).
//  - Tope de correos NUEVOS enviados por ejecución (MAX_NUEVOS_POR_EJECUCION): acota el gasto por hora.
//  - La memoria local se reparte en 16 cajitas por el ÚLTIMO carácter del id (antes casi todos caían en la misma).
// ============================================================

const URL_FUNCION = 'https://TU-PROYECTO.supabase.co/functions/v1/correos-ingresar';

// ---------- Ajustes (se pueden dejar como están) ----------
const DIAS_ATRAS = 180;                    // hasta cuántos días atrás revisar
const DOMINIO_PROPIO = '@sereinspa.com';   // para distinguir tus correos de los de los clientes
const ETIQUETA = 'Serein-Revisado';
const BUZON = Session.getEffectiveUser().getEmail();   // casilla donde está instalado el script (se detecta sola)
const MAX_MB_ADJUNTO = 6;                  // adjuntos más pesados se omiten
const MINUTOS_MAX = 4.5;                   // tiempo máximo por ejecución
const MAX_HILOS = 800;                     // cuántas conversaciones recorrer por consulta
const MAX_NUEVOS_POR_EJECUCION = 12;       // correos nuevos (que SÍ se leen con IA) por ejecución; el resto espera a la siguiente
const CLIENTES_PRIORITARIOS = ['kronos']; // se leen primero, sin filtro de palabras
const ANIOS_PRIORITARIOS = 5;              // y hasta cuántos años atrás

// Palabras que hacen que un correo se considere candidato (la IA confirma después)
const PALABRAS_OC = '"orden de compra" OR "orden compra" OR "o/c" OR oc OR "purchase order" OR "orden de trabajo" OR pedido';
const PALABRAS_COT = 'cotizacion OR cotización OR "COT-SER" OR presupuesto OR oferta OR propuesta';

function consultas_() {
  const prior = [];
  CLIENTES_PRIORITARIOS.forEach(function (cl) {
    const b = cl + ' newer_than:' + (ANIOS_PRIORITARIOS * 365) + 'd has:attachment filename:pdf';
    prior.push({ carpeta: 'entrada', q: 'in:inbox ' + b });
    prior.push({ carpeta: 'enviados', q: 'in:sent ' + b });
  });
  const base = 'newer_than:' + DIAS_ATRAS + 'd has:attachment filename:pdf';
  return prior.concat([
    { carpeta: 'entrada', q: 'in:inbox ' + base + ' (' + PALABRAS_OC + ')' },
    { carpeta: 'enviados', q: 'in:sent ' + base + ' (' + PALABRAS_COT + ')' },
  ]);
}

// Revisa los correos pendientes y los manda al ERP. Es lo que corre cada 10 minutos.
function sincronizar() {
  const inicio = new Date().getTime();
  const etiqueta = GmailApp.getUserLabelByName(ETIQUETA) || GmailApp.createLabel(ETIQUETA);
  const ya = cargarProcesados_();
  let enviados = 0, errores = 0, saltados = 0, nuevos = 0, tope = false;
  consultas_().forEach(function (c) {
    if (tope) return;
    for (let desde = 0; desde < MAX_HILOS && !tope; desde += 50) {
      if (excedido_(inicio)) break;
      const hilos = GmailApp.search(c.q, desde, 50);
      if (!hilos.length) break;

      // 1) Junta los mensajes candidatos de este lote que la memoria local no conoce
      const candidatos = [];
      hilos.forEach(function (hilo) {
        hilo.getMessages().forEach(function (msg) {
          const id = msg.getId();
          if (ya[id]) return;
          const propio = String(msg.getFrom()).toLowerCase().indexOf(DOMINIO_PROPIO) >= 0;
          if (c.carpeta === 'entrada' && propio) { ya[id] = 1; return; }     // en la entrada solo interesan los de afuera
          if (c.carpeta === 'enviados' && !propio) { ya[id] = 1; return; }   // en enviados solo los tuyos
          candidatos.push({ id: id, msg: msg, hilo: hilo });
        });
      });
      if (!candidatos.length) continue;

      // 2) Le pregunta al ERP cuáles de esos ya tiene resueltos (una sola llamada por lote, sin IA)
      const vistos = consultarVistos_(candidatos.map(function (x) { return x.id; }));
      vistos.forEach(function (id) { ya[id] = 1; saltados++; });

      // 3) Manda solo los que faltan, de a uno
      candidatos.forEach(function (cand) {
        if (tope || ya[cand.id] || excedido_(inicio)) return;
        const msg = cand.msg, id = cand.id;
        const adjuntos = [];
        msg.getAttachments({ includeInlineImages: false }).forEach(function (a) {
          if (String(a.getContentType()).toLowerCase().indexOf('pdf') < 0) return;
          if (a.getSize() > MAX_MB_ADJUNTO * 1024 * 1024) return;
          adjuntos.push({ nombre: a.getName(), mimeType: 'application/pdf', base64: Utilities.base64Encode(a.getBytes()) });
        });
        if (!adjuntos.length) { ya[id] = 1; return; }   // sin PDF utilizable: no hay nada que leer, no se vuelve a revisar
        if (nuevos >= MAX_NUEVOS_POR_EJECUCION) { tope = true; return; }
        nuevos++;
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
        const res = r && r.ok && r.resultados && r.resultados[0];
        if (res) {
          // El ERP ya anotó este correo (leído, sin documentos, repetido o con error y su cuenta de intentos):
          // se recuerda acá para no volver a mandarlo. Si al ERP le quedan intentos, él mismo lo dirá en "consultar".
          ya[id] = 1;
          if (res.ok) { enviados++; if ((res.guardados || 0) > 0) cand.hilo.addLabel(etiqueta); }
          else if (res.motivo === 'tope_por_llamada') { delete ya[id]; nuevos--; }
          else { errores++; Logger.log('Error con "' + msg.getSubject() + '": ' + JSON.stringify(res)); }
        } else {
          errores++; Logger.log('Sin respuesta del ERP para "' + msg.getSubject() + '": ' + JSON.stringify(r));
        }
      });
    }
  });
  guardarProcesados_(ya);
  Logger.log('Listo: ' + enviados + ' correo(s) enviados al ERP, ' + saltados + ' ya los tenía, ' + errores + ' con error' + (tope ? ' (tope de ' + MAX_NUEVOS_POR_EJECUCION + ' por ejecución: el resto sigue en la próxima)' : '') + '.');
}

// Pregunta al ERP qué ids ya están resueltos. Si el ERP no responde, devuelve [] (se manda igual y el ERP descarta).
function consultarVistos_(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    const r = enviar_({ consultar: ids.slice(i, i + 200) });
    if (r && r.ok && r.vistos) r.vistos.forEach(function (id) { out.push(id); });
  }
  return out;
}

function enviar_(obj) {
  try {
    const resp = UrlFetchApp.fetch(URL_FUNCION, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-acceso-casilla': ScriptApp.getOAuthToken() },
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

// Memoria local de correos ya resueltos (16 cajitas por el ÚLTIMO carácter del id, que sí varía;
// la primera letra de los ids de Gmail es casi siempre la misma). Es solo un atajo: el ERP es la fuente de verdad.
function cargarProcesados_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const m = {};
  Object.keys(props).forEach(function (k) {
    if (k.indexOf('p_') !== 0 && k.indexOf('q_') !== 0) return;
    try { JSON.parse(props[k]).forEach(function (id) { m[id] = 1; }); } catch (e) {}
  });
  return m;
}

function guardarProcesados_(m) {
  const cubos = {};
  Object.keys(m).forEach(function (id) { const k = 'q_' + id.charAt(id.length - 1); (cubos[k] = cubos[k] || []).push(id); });
  const props = {};
  Object.keys(cubos).forEach(function (k) {
    let arr = cubos[k];
    while (JSON.stringify(arr).length > 8500) arr = arr.slice(Math.ceil(arr.length / 10));   // si se llena, se olvidan los más antiguos (el ERP los sigue recordando)
    props[k] = JSON.stringify(arr);
  });
  const store = PropertiesService.getScriptProperties();
  Object.keys(store.getProperties()).forEach(function (k) { if (k.indexOf('p_') === 0) store.deleteProperty(k); });   // cajitas viejas
  store.setProperties(props);
}

// 1) Ejecuta ESTA primero: autoriza el script y comprueba que el ERP responde.
function probarConexion() {
  const r = enviar_({ ping: true });
  Logger.log(JSON.stringify(r));
  if (!r || !r.ok) throw new Error('No hay conexión con el ERP: ' + JSON.stringify(r));
}

// 2) Ejecuta esta UNA vez: deja el envío automático cada 10 minutos.
function activarEnvioAutomatico() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sincronizar') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(10).create();
  Logger.log('Listo: se enviarán los correos nuevos cada 10 minutos.');
}

// Para apagarlo: ejecuta esta función.
function desactivarEnvioAutomatico() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sincronizar') ScriptApp.deleteTrigger(t); });
  Logger.log('Envío automático apagado.');
}

// Solo si quieres que vuelva a revisar todo desde cero. OJO: el ERP recuerda igual lo que ya leyó
// (tabla correos_vistos), así que esto NO vuelve a gastar IA en correos ya procesados.
function olvidarEnviados() {
  const props = PropertiesService.getScriptProperties();
  Object.keys(props.getProperties()).forEach(function (k) { if (k.indexOf('p_') === 0 || k.indexOf('q_') === 0) props.deleteProperty(k); });
  Logger.log('Listo: el script olvidó su memoria local (el ERP sigue recordando lo ya leído).');
}
