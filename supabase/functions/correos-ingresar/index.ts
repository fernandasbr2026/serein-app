// ============================================================
// SEREIN · Ingreso de correos: órdenes de compra y cotizaciones
// Supabase Edge Function — correos-ingresar
// ============================================================
// La llama el script de Google (Apps Script) que corre en la cuenta de correo
// de Serein cada pocos minutos. Recibe correos con sus PDF adjuntos, la IA
// identifica si es una ORDEN DE COMPRA que mandó un cliente o una COTIZACIÓN
// que mandó Serein, transcribe los datos y los deja en la tabla
// correo_documentos (con el PDF en el bucket privado "correos").
//
// - Solo transcribe: nunca inventa datos (lo que no aparece queda en null).
// - Lo que la IA no ve claro (o cuyos montos no cuadran) queda "por_revisar"
//   para que lo confirme una persona en el módulo Correos.
// - No pisa lo ya guardado: si el mismo correo llega de nuevo se ignora.
// - ANTES de llamar a la IA mira si ese correo ya se leyó (tabla correos_vistos
//   y correo_documentos) o si trae exactamente los mismos PDF que otro correo ya
//   leído: en esos casos no gasta ni un token. Cada intento queda anotado en
//   correos_vistos (máximo 3 intentos por correo) y cada llamada a la IA en
//   ia_uso (tokens de entrada/salida/caché), para poder auditar el consumo.
// - El script de Google puede preguntar primero {consultar:[ids]} y recibe
//   {vistos:[ids]} para no mandar lo que el ERP ya tiene.
//
// Secretos necesarios (Edge Functions > Secrets):
//   ANTHROPIC_API_KEY  (el mismo de las otras funciones)
//   SERVICE_ROLE_KEY   (el mismo que usan libro-ventas-sync y defontana-sync)
//   CORREOS_TOKEN      (una clave larga que se inventa una vez; la misma va
//                       en el script de Google). Sin ella la función no responde.
// Al desplegar, dejar "Verify JWT" DESACTIVADO (se protege con CORREOS_TOKEN).
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correos-token, x-acceso-casilla",
};

const MODEL = "claude-sonnet-5";
const BUCKET = "correos";
// La respuesta es un JSON corto (unos 150 tokens por documento): 3000 alcanza para
// correos con varios adjuntos y evita respuestas desbocadas.
const MAX_TOKENS_SALIDA = 4096;
// Tope de llamadas a la IA por cada invocación de la función (el script manda de a uno,
// pero si alguien manda un lote grande no se dispara el gasto en una sola pasada).
const MAX_IA_POR_LLAMADA = 10;
// Un correo que falla (IA caída, JSON inválido, PDF ilegible) se reintenta como máximo
// esta cantidad de veces; después queda anotado como error y no se vuelve a leer.
const MAX_INTENTOS = 3;

const PROMPT = `Eres el asistente de administración de SEREIN Group (Servicios de Revestimientos Industriales SpA), empresa chilena de granallado y pintura industrial. Te paso un correo con sus adjuntos. Debes identificar qué documentos comerciales trae y transcribir sus datos.

Responde SOLO un JSON (sin texto adicional, sin markdown) con esta forma:

{
  "documentos": [
    {
      "archivo": string | null,
      "tipo": "oc" | "cotizacion" | "otro",
      "confianza": "alta" | "media" | "baja",
      "cliente": string | null,
      "rutCliente": string | null,
      "numeroOC": string | null,
      "nv": string | null,
      "folioCotizacion": string | null,
      "refCotizacion": string | null,
      "fechaDocumento": string | null,
      "detalle": string | null,
      "neto": number | null,
      "iva": number | null,
      "total": number | null,
      "moneda": string | null,
      "notas": string | null
    }
  ]
}

Reglas:
- Un elemento por cada adjunto que sea una orden de compra o una cotización. "archivo" es el nombre exacto del adjunto del que sale el dato; si el dato sale solo del texto del correo, "archivo" es null.
- "tipo": "oc" si es una ORDEN DE COMPRA (u orden de trabajo / pedido de compra) que un CLIENTE le manda a Serein; "cotizacion" si es una COTIZACIÓN, oferta o presupuesto que SEREIN le manda a un cliente; "otro" para cualquier otra cosa (facturas, guías, fotos, firmas, avisos). Si el correo es ENVIADO por Serein, lo normal es "cotizacion"; si es RECIBIDO, lo normal es "oc".
- "cliente": la razón social de la EMPRESA CLIENTE (en una orden de compra, quien la emite; en una cotización, a quien va dirigida). Nunca pongas a Serein como cliente. "rutCliente": su RUT tal como aparece.
- "numeroOC": el número de la orden de compra del cliente, tal como está impreso. "nv": el número de nota de venta (NV) que trae la ORDEN DE COMPRA DEL CLIENTE (es un número del propio cliente, no de Serein); si no aparece, null. No confundas el número de OC con folios de cotización, RUT, teléfonos o fechas.
- "folioCotizacion": el número/folio de la cotización de Serein (ej. "942", "COT-SER-REV-0942"). En una orden de compra, "refCotizacion" es el folio de la cotización de Serein a la que hace referencia (si la menciona).
- "fechaDocumento": la fecha del documento (no la del correo), formato YYYY-MM-DD.
- "detalle": resumen corto (máximo 200 caracteres) de lo que se compra o cotiza (servicio, m², piezas, proyecto o planta).
- "neto", "iva", "total": montos en pesos chilenos como número entero, sin puntos, comas ni signo. "neto" es el monto antes de IVA. Si solo aparece el total, deja neto e iva en null (no los calcules). Si la moneda no es peso chileno (UF, USD), pon el monto en su moneda y anótala en "moneda".
- "confianza": "alta" solo si el tipo y los datos principales (cliente, número y monto) se leen con claridad; "media" si algún dato importante es dudoso; "baja" si hay que adivinar.
- Si un dato no aparece, usa null. Nunca inventes.
- Si no hay ninguna orden de compra ni cotización, responde {"documentos": []}.`;

const MIME_IMAGEN = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const aNumero = (v: any) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[^0-9.,-]/g, "");
  if (!s) return null;
  const limpio = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/\.(?=\d{3}\b)/g, "");
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : null;
};
const aFecha = (v: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null);
const texto = (v: any) => (v == null || String(v).trim() === "" ? null : String(v).trim());

function base64ABytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ¿El mismo documento ya entró por otra casilla? (un cliente suele escribir a varias casillas de Serein a la vez)
async function yaExiste(sbUrl: string, sbHeaders: Record<string, string>, tipo: string, d: any): Promise<boolean> {
  const numero = tipo === "oc" ? texto(d.numeroOC) : texto(d.folioCotizacion);
  if (!numero) return false;
  const campo = tipo === "oc" ? "numero_oc" : "folio_cotizacion";
  const rut = texto(d.rutCliente), cliente = texto(d.cliente);
  let filtro = "";
  if (rut) filtro = "&rut_cliente=eq." + encodeURIComponent(rut);
  else if (cliente) filtro = "&cliente=ilike." + encodeURIComponent(cliente);
  else return false;
  const r = await fetch(sbUrl + "/rest/v1/correo_documentos?select=id&tipo=eq." + tipo + "&" + campo + "=eq." + encodeURIComponent(numero) + "&estado=neq.descartado" + filtro + "&limit=1", { headers: sbHeaders });
  if (!r.ok) return false;
  const filas = await r.json();
  return Array.isArray(filas) && filas.length > 0;
}

const nombreSeguro = (n: string) => (n || "adjunto").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);

async function leerConIA(apiKey: string, m: any) {
  const adjuntos = (m.adjuntos || []).filter((a: any) => a && a.base64);
  const contenido: any[] = adjuntos.map((a: any) => {
    const mime = a.mimeType || "application/pdf";
    if (MIME_IMAGEN.has(mime)) return { type: "image", source: { type: "base64", media_type: mime, data: a.base64 } };
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 } };
  });
  const ficha = [
    "CORREO " + (m.carpeta === "enviados" ? "ENVIADO por Serein" : "RECIBIDO por Serein"),
    "De: " + (m.de || ""),
    "Para: " + (m.para || ""),
    "Fecha: " + (m.fecha || ""),
    "Asunto: " + (m.asunto || ""),
    "Adjuntos: " + (adjuntos.map((a: any) => a.nombre).join(" | ") || "(ninguno)"),
    "",
    "Texto del correo:",
    String(m.cuerpo || "").slice(0, 6000),
  ].join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS_SALIDA,
      // Las instrucciones son siempre las mismas: van como "system" con caché de prompt, así
      // cada correo paga solo sus propios adjuntos y no vuelve a pagar las instrucciones.
      system: [{ type: "text", text: PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [...contenido, { type: "text", text: ficha }] }],
    }),
  });
  if (!res.ok) throw new Error("Anthropic respondió " + res.status + ": " + (await res.text()).slice(0, 300));
  const data = await res.json();
  const uso = data.usage || {};
  const bruto = (data.content || []).map((b: any) => b.text || "").join("").trim();
  const sinMarkdown = bruto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // A veces la IA antepone o agrega una frase al JSON: se rescata lo que va entre la primera "{" y la última "}"
  const ini = sinMarkdown.indexOf("{"), fin = sinMarkdown.lastIndexOf("}");
  const limpio = ini >= 0 && fin > ini ? sinMarkdown.slice(ini, fin + 1) : sinMarkdown;
  let parsed: any;
  try { parsed = JSON.parse(limpio); } catch (_e) {
    const motivo = data.stop_reason === "max_tokens" ? " (respuesta cortada por largo)" : "";
    throw Object.assign(new Error("La IA no devolvió un JSON válido" + motivo + ": " + limpio.slice(0, 200)), { uso });
  }
  return { documentos: Array.isArray(parsed.documentos) ? parsed.documentos : [], uso };
}

// Anota cada llamada a la IA (tokens reales que cobró Anthropic). Si la tabla no existe todavía, no interrumpe nada.
async function registrarUso(sbUrl: string, sbHeaders: Record<string, string>, fila: any) {
  try {
    await fetch(sbUrl + "/rest/v1/ia_uso", {
      method: "POST",
      headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ funcion: "correos-ingresar", modelo: MODEL, ...fila }),
    });
  } catch (_e) { /* sin registro */ }
}

const filaUso = (uso: any, referencia: string, ok: boolean, error?: string) => ({
  tokens_entrada: uso?.input_tokens ?? null,
  tokens_salida: uso?.output_tokens ?? null,
  tokens_cache_escritura: uso?.cache_creation_input_tokens ?? null,
  tokens_cache_lectura: uso?.cache_read_input_tokens ?? null,
  referencia, ok, error: error ? error.slice(0, 300) : null,
});

// Huella de los adjuntos (para reconocer el mismo documento aunque llegue en otro correo o a otra casilla)
async function huellaAdjuntos(m: any): Promise<string | null> {
  const adjuntos = (m.adjuntos || []).filter((a: any) => a && a.base64);
  if (!adjuntos.length) return null;
  const partes = adjuntos.map((a: any) => a.base64).sort().join("|");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(partes));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ¿Qué sabemos ya de este correo? Mira correos_vistos y, por si la tabla no existe, correo_documentos.
async function estadoPrevio(sbUrl: string, sbHeaders: Record<string, string>, gmailId: string, huella: string | null) {
  const out = { visto: false, intentos: 0, estado: "", mismoPdf: false };
  try {
    const r = await fetch(sbUrl + "/rest/v1/correos_vistos?select=estado,intentos&gmail_id=eq." + encodeURIComponent(gmailId) + "&limit=1", { headers: sbHeaders });
    if (r.ok) {
      const f = await r.json();
      if (Array.isArray(f) && f.length) { out.intentos = Number(f[0].intentos) || 0; out.estado = String(f[0].estado || ""); out.visto = out.estado !== "error" || out.intentos >= MAX_INTENTOS; }
    }
    if (!out.visto && huella) {
      const h = await fetch(sbUrl + "/rest/v1/correos_vistos?select=gmail_id&adjuntos_hash=eq." + huella + "&estado=in.(ok,sin_documentos)&gmail_id=neq." + encodeURIComponent(gmailId) + "&limit=1", { headers: sbHeaders });
      if (h.ok) { const f = await h.json(); out.mismoPdf = Array.isArray(f) && f.length > 0; }
    }
  } catch (_e) { /* sin tabla todavía */ }
  if (!out.visto) {
    try {
      const d = await fetch(sbUrl + "/rest/v1/correo_documentos?select=id&gmail_id=eq." + encodeURIComponent(gmailId) + "&limit=1", { headers: sbHeaders });
      if (d.ok) { const f = await d.json(); if (Array.isArray(f) && f.length) { out.visto = true; out.estado = "ok"; } }
    } catch (_e) { /* ignorar */ }
  }
  return out;
}

async function anotarVisto(sbUrl: string, sbHeaders: Record<string, string>, fila: any) {
  try {
    await fetch(sbUrl + "/rest/v1/correos_vistos?on_conflict=gmail_id", {
      method: "POST",
      headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ ...fila, actualizado_en: new Date().toISOString() }),
    });
  } catch (_e) { /* sin tabla todavía */ }
}

// Ids que el ERP ya tiene resueltos (leídos, sin documentos, repetidos o agotados sus intentos)
async function consultarVistos(sbUrl: string, sbHeaders: Record<string, string>, ids: string[]): Promise<string[]> {
  const vistos = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100).map((x) => String(x).replace(/[^A-Za-z0-9_-]/g, ""));
    const lista = "(" + lote.map((x) => '"' + x + '"').join(",") + ")";
    try {
      const r = await fetch(sbUrl + "/rest/v1/correos_vistos?select=gmail_id,estado,intentos&gmail_id=in." + lista, { headers: sbHeaders });
      if (r.ok) for (const f of await r.json()) if (f.estado !== "error" || Number(f.intentos) >= MAX_INTENTOS) vistos.add(String(f.gmail_id));
    } catch (_e) { /* sin tabla */ }
    try {
      const r = await fetch(sbUrl + "/rest/v1/correo_documentos?select=gmail_id&gmail_id=in." + lista, { headers: sbHeaders });
      if (r.ok) for (const f of await r.json()) vistos.add(String(f.gmail_id));
    } catch (_e) { /* ignorar */ }
  }
  return Array.from(vistos);
}

// Quién puede enviar correos: solo las casillas de Serein. Se reconoce con el acceso de Google del propio script
// (no hay clave que recordar). CORREOS_TOKEN queda como alternativa opcional si existe en los secretos.
const CASILLAS_PERMITIDAS = ["comercial@sereinspa.com", "administracion@sereinspa.com", "facturacion@sereinspa.com"];

async function autorizado(req: Request): Promise<{ ok: boolean; quien?: string; error?: string }> {
  const secreta = (Deno.env.get("CORREOS_TOKEN") || "").trim();
  const enviada = (req.headers.get("x-correos-token") || "").trim();
  if (secreta && enviada && enviada === secreta) return { ok: true, quien: "clave" };
  const tk = (req.headers.get("x-acceso-casilla") || "").trim();
  if (!tk) return { ok: false, error: "Falta identificarse con la cuenta de Google." };
  const r = await fetch("https://oauth2.googleapis.com/tokeninfo?access_token=" + encodeURIComponent(tk));
  if (!r.ok) return { ok: false, error: "Google no reconoció el acceso. Vuelve a autorizar el script." };
  const info = await r.json();
  const email = String(info.email || "").toLowerCase();
  const verificado = info.email_verified === true || info.email_verified === "true";
  if (email && verificado && CASILLAS_PERMITIDAS.includes(email)) return { ok: true, quien: email };
  return { ok: false, error: "Esta casilla no está autorizada: " + (email || "sin correo") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const acceso = await autorizado(req);
  if (!acceso.ok) return json({ ok: false, error: acceso.error }, 401);

  try {
    const body = await req.json();
    if (body && body.ping) return json({ ok: true, mensaje: "Conexión correcta: la función de correos responde." });

    const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
    const sbUrl = Deno.env.get("SUPABASE_URL") || "";
    // Supabase entrega esta llave sola a cada función (SUPABASE_SERVICE_ROLE_KEY); SERVICE_ROLE_KEY solo hace falta si alguien la guardó a mano
    const sbKey = (Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
    if (!apiKey) throw new Error("Falta el secreto ANTHROPIC_API_KEY.");
    if (!sbUrl || !sbKey) throw new Error("No se encontró la llave de servicio de Supabase.");
    const sbHeaders = { apikey: sbKey, Authorization: "Bearer " + sbKey };

    // El script pregunta primero qué correos ya están resueltos, para no mandarlos (ni leerlos) de nuevo
    if (body && Array.isArray(body.consultar)) {
      return json({ ok: true, vistos: await consultarVistos(sbUrl, sbHeaders, body.consultar.slice(0, 1000)) });
    }

    const mensajes = Array.isArray(body.mensajes) ? body.mensajes : [];
    const resultados: any[] = [];
    let llamadasIA = 0;

    for (const m of mensajes) {
      const r: any = { id: m && m.id, ok: false, guardados: 0, omitidos: 0 };
      let uso: any = null;
      let huella: string | null = null;
      let previo: any = null;
      try {
        if (!m || !m.id) throw new Error("Mensaje sin id.");
        const gmailId = String(m.id);
        huella = await huellaAdjuntos(m);
        previo = await estadoPrevio(sbUrl, sbHeaders, gmailId, huella);
        if (previo.visto) { r.ok = true; r.motivo = "ya_visto"; resultados.push(r); continue; }
        if (previo.mismoPdf) {
          r.ok = true; r.motivo = "mismo_pdf";
          await anotarVisto(sbUrl, sbHeaders, { gmail_id: gmailId, buzon: texto(m.buzon), estado: "duplicado", intentos: previo.intentos + 1, adjuntos_hash: huella, documentos: 0, error: null });
          resultados.push(r); continue;
        }
        if (llamadasIA >= MAX_IA_POR_LLAMADA) { r.motivo = "tope_por_llamada"; r.error = "Se alcanzó el tope de lecturas con IA en esta llamada; se reintenta en la próxima."; resultados.push(r); continue; }
        llamadasIA++;
        const lectura = await leerConIA(apiKey, m);
        uso = lectura.uso;
        const docs = lectura.documentos;
        await registrarUso(sbUrl, sbHeaders, filaUso(uso, gmailId, true));
        const filas: any[] = [];
        for (const d of docs) {
          if (!d || (d.tipo !== "oc" && d.tipo !== "cotizacion")) { r.omitidos++; continue; }
          const archivo = texto(d.archivo) || "";
          const neto = aNumero(d.neto), iva = aNumero(d.iva), total = aNumero(d.total);
          // Cuadra si hay neto + iva = total (con 1% de margen) o si al menos hay un total
          const cuadra = neto != null && iva != null && total != null ? Math.abs(neto + iva - total) <= Math.max(2, total * 0.01) : total != null || neto != null;
          const clienteOk = !!texto(d.cliente);
          const numeroOk = d.tipo === "oc" ? !!texto(d.numeroOC) : !!texto(d.folioCotizacion);
          const repetida = await yaExiste(sbUrl, sbHeaders, d.tipo, d);
          const auto = d.confianza === "alta" && cuadra && clienteOk && numeroOk && !repetida;

          // PDF al bucket privado (si falla, el documento igual se guarda sin PDF)
          let pdfPath: string | null = null;
          const adj = (m.adjuntos || []).find((a: any) => a && a.nombre === archivo && a.base64);
          if (adj) {
            try {
              const ruta = m.id + "/" + nombreSeguro(adj.nombre);
              const up = await fetch(sbUrl + "/storage/v1/object/" + BUCKET + "/" + ruta, {
                method: "POST",
                headers: { ...sbHeaders, "Content-Type": adj.mimeType || "application/pdf", "x-upsert": "true" },
                body: base64ABytes(adj.base64),
              });
              if (up.ok) pdfPath = ruta;
            } catch (_e) { /* sin PDF */ }
          }

          filas.push({
            gmail_id: String(m.id),
            adjunto: archivo,
            tipo: d.tipo,
            estado: repetida ? "descartado" : auto ? "confirmado" : "por_revisar",
            confirmado_por: auto ? "auto" : null,
            confianza: texto(d.confianza),
            fecha_correo: m.fecha || null,
            fecha_documento: aFecha(d.fechaDocumento),
            de: texto(m.de), para: texto(m.para), asunto: texto(m.asunto),
            cliente: texto(d.cliente), rut_cliente: texto(d.rutCliente),
            numero_oc: texto(d.numeroOC), nv: texto(d.nv),
            folio_cotizacion: texto(d.folioCotizacion), ref_cotizacion: texto(d.refCotizacion),
            detalle: texto(d.detalle),
            neto, iva, total,
            moneda: texto(d.moneda) || "CLP",
            notas: repetida ? "Repetida: este documento ya estaba leído desde otra casilla." : texto(d.notas),
            buzon: texto(m.buzon),
            pdf_path: pdfPath,
            datos_ia: d,
          });
        }
        if (filas.length) {
          // ignore-duplicates: si el mismo correo llega otra vez no se pisa lo ya revisado o corregido
          const ins = await fetch(sbUrl + "/rest/v1/correo_documentos?on_conflict=gmail_id,adjunto", {
            method: "POST",
            headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
            body: JSON.stringify(filas),
          });
          if (!ins.ok) throw new Error("No se pudo guardar en la base: " + (await ins.text()).slice(0, 300));
        }
        r.ok = true; r.guardados = filas.length;
        await anotarVisto(sbUrl, sbHeaders, { gmail_id: String(m.id), buzon: texto(m.buzon), estado: filas.length ? "ok" : "sin_documentos", intentos: (previo?.intentos || 0) + 1, adjuntos_hash: huella, documentos: filas.length, error: null });
      } catch (e) {
        r.error = String((e as any)?.message || e);
        const usoErr = (e as any)?.uso || uso;
        if (usoErr) await registrarUso(sbUrl, sbHeaders, filaUso(usoErr, String(m?.id || ""), false, r.error));
        if (m && m.id) {
          const intentos = (previo?.intentos || 0) + 1;
          r.intentos = intentos;
          await anotarVisto(sbUrl, sbHeaders, { gmail_id: String(m.id), buzon: texto(m.buzon), estado: "error", intentos, adjuntos_hash: huella, documentos: 0, error: r.error.slice(0, 300) });
        }
      }
      resultados.push(r);
    }
    return json({ ok: true, resultados });
  } catch (err) {
    console.error("correos-ingresar error:", err);
    return json({ ok: false, error: String((err as any)?.message || err) });
  }
});
