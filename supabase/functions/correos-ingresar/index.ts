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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correos-token",
};

const MODEL = "claude-sonnet-5";
const BUCKET = "correos";

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
      max_tokens: 4096,
      messages: [{ role: "user", content: [...contenido, { type: "text", text: PROMPT + "\n\n" + ficha }] }],
    }),
  });
  if (!res.ok) throw new Error("Anthropic respondió " + res.status + ": " + (await res.text()).slice(0, 300));
  const data = await res.json();
  const bruto = (data.content || []).map((b: any) => b.text || "").join("").trim();
  const limpio = bruto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: any;
  try { parsed = JSON.parse(limpio); } catch (_e) { throw new Error("La IA no devolvió un JSON válido: " + limpio.slice(0, 200)); }
  return Array.isArray(parsed.documentos) ? parsed.documentos : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const clave = (Deno.env.get("CORREOS_TOKEN") || "").trim();
  if (!clave) return json({ ok: false, error: "Falta el secreto CORREOS_TOKEN en Supabase (Edge Functions > Secrets)." }, 500);
  if ((req.headers.get("x-correos-token") || "").trim() !== clave) return json({ ok: false, error: "Clave incorrecta." }, 401);

  try {
    const body = await req.json();
    if (body && body.ping) return json({ ok: true, mensaje: "Conexión correcta: la función de correos responde." });

    const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
    const sbUrl = Deno.env.get("SUPABASE_URL") || "";
    const sbKey = (Deno.env.get("SERVICE_ROLE_KEY") || "").trim();
    if (!apiKey) throw new Error("Falta el secreto ANTHROPIC_API_KEY.");
    if (!sbUrl || !sbKey) throw new Error("Falta el secreto SERVICE_ROLE_KEY.");
    const sbHeaders = { apikey: sbKey, Authorization: "Bearer " + sbKey };

    const mensajes = Array.isArray(body.mensajes) ? body.mensajes : [];
    const resultados: any[] = [];

    for (const m of mensajes) {
      const r: any = { id: m && m.id, ok: false, guardados: 0, omitidos: 0 };
      try {
        if (!m || !m.id) throw new Error("Mensaje sin id.");
        const docs = await leerConIA(apiKey, m);
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
      } catch (e) {
        r.error = String((e as any)?.message || e);
      }
      resultados.push(r);
    }
    return json({ ok: true, resultados });
  } catch (err) {
    console.error("correos-ingresar error:", err);
    return json({ ok: false, error: String((err as any)?.message || err) });
  }
});
