// ============================================================
// SEREIN · Lectura de guías de recepción/despacho con IA
// Supabase Edge Function — extraer-guia
// ============================================================
// Mismo mecanismo que extraer-oc (PDF y/o fotos, un solo documento
// combinado, misma forma de respuesta) pero para guias de despacho o de
// recepcion del cliente: extrae numero de guia, fecha y las marcas/tags
// mencionadas, para cotejarlas despues contra las marcas esperadas de la
// OT en el ERP. Nunca escribe directo en la base de datos — solo lee el
// archivo y propone datos para que la persona revise antes de aplicar.
//
// Requiere el secreto ANTHROPIC_API_KEY (Edge Functions > Secrets) — el
// mismo que ya usa extraer-oc.
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";

const ESQUEMA_JSON = `{
  "numeroGuia": string | null,
  "fecha": string | null,
  "marcas": [{ "tag": string, "id": string | null }]
}`;

const PROMPT = `Estás leyendo una guía de despacho o de recepción de materiales, entre SEREIN Group (empresa chilena de granallado y pintura industrial) y uno de sus clientes. Puede venir como uno o varios archivos (PDF con varias páginas, o varias fotos de páginas distintas del mismo documento) — trátalos como UN SOLO documento y combina la información de todos ellos. Extrae la información en un JSON con EXACTAMENTE esta forma (sin texto adicional, sin markdown, sin comentarios):

${ESQUEMA_JSON}

Reglas:
- "numeroGuia": el número de la guía tal como aparece impreso en el documento.
- "fecha": fecha de emisión de la guía, formato YYYY-MM-DD si es posible.
- "marcas": identifica CADA código de pieza/tag mencionado en el detalle de la guía, revisando la tabla completa de principio a fin sin importar cuántas filas tenga ni en cuántas páginas o archivos esté repartida — no omitas ninguna fila (ej. "2610-SP-32402-A", "2610-SP-32402"). Si el código termina en un sufijo de letra separado por guion (A, B, C...), sepáralo como "tag" (sin el sufijo) e "id" (el sufijo). Si no tiene sufijo, "id" es null.
- Si la guía NO detalla piezas individuales (solo trae una cantidad total, ej. "12 bultos"), deja "marcas" como arreglo vacío — no inventes códigos.
- Si un campo no aparece en el documento, usa null (nunca inventes un valor).
- Responde SOLO el JSON, nada más.`;

const MIME_IMAGEN = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  try {
    const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
    if (!apiKey) throw new Error("Falta el secreto ANTHROPIC_API_KEY en este proyecto Supabase (Edge Functions > Secrets).");

    const body = await req.json();
    const archivos = Array.isArray(body.archivos) ? body.archivos : [];
    const filename = body.filename;
    if (!archivos.length) throw new Error("Falta al menos un archivo en la solicitud.");

    const contenidoArchivos = archivos.map((a: any) => {
      const mime = a.mimeType || "application/pdf";
      if (MIME_IMAGEN.has(mime)) {
        return { type: "image", source: { type: "base64", media_type: mime, data: a.base64 } };
      }
      return { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 } };
    });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: [...contenidoArchivos, { type: "text", text: PROMPT }],
          },
        ],
      }),
    });

    if (!res.ok) {
      const detalle = await res.text();
      throw new Error(`Anthropic API respondió ${res.status}: ${detalle.slice(0, 500)}`);
    }

    const data = await res.json();
    const textoRespuesta = (data.content || []).map((b: any) => b.text || "").join("").trim();

    // Claude a veces envuelve el JSON en ```json ... ``` a pesar de la
    // instruccion — se lo saca antes de parsear, para no romper por eso.
    const limpio = textoRespuesta.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    let datos;
    try { datos = JSON.parse(limpio); }
    catch (e) { throw new Error("La IA no devolvió un JSON válido: " + limpio.slice(0, 300)); }

    return new Response(JSON.stringify({ ok: true, datos, archivo: filename || null }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("extraer-guia error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
