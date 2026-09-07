// ============================================================
// SEREIN · Lectura de OC/OT con IA para auto-completar protocolos
// Supabase Edge Function — extraer-oc
// ============================================================
// Recibe uno o varios archivos de una Orden de Compra (PDF y/o fotos de
// paginas, por ejemplo cuando el cliente manda el documento fotografiado
// en vez de escaneado) como base64, se los manda a Claude (Anthropic)
// pidiendole que extraiga cliente, fechas, m2, marcas/tags, etc. en un
// JSON con forma fija, y devuelve ese JSON al ERP para que la persona
// (Joce) lo revise y corrija antes de aplicarlo al protocolo — esta
// funcion NUNCA escribe directo en la base de datos, solo lee el/los
// archivo(s) y propone datos.
//
// Requiere el secreto ANTHROPIC_API_KEY (Edge Functions > Secrets).
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";

const ESQUEMA_JSON = `{
  "cliente": string | null,
  "rut": string | null,
  "ocNumero": string | null,
  "nv": string | null,
  "fecha": string | null,
  "m2Total": number | null,
  "marcas": [{ "tag": string, "id": string | null, "m2": number | null }],
  "observaciones": string | null
}`;

const PROMPT = `Estás leyendo una Orden de Compra (OC) u Orden de Trabajo que un cliente industrial le envía a SEREIN Group, una empresa chilena de granallado y pintura industrial. Puede venir como uno o varios archivos (PDF con varias páginas, o varias fotos de páginas distintas del mismo documento) — trátalos como UN SOLO documento y combina la información de todos ellos. Extrae la información en un JSON con EXACTAMENTE esta forma (sin texto adicional, sin markdown, sin comentarios):

${ESQUEMA_JSON}

Reglas:
- "cliente": la razón social del cliente que emite la OC (no SEREIN).
- "ocNumero": el número de la orden de compra tal como aparece.
- "nv": número de nota de venta o cotización referenciada, si aparece.
- "fecha": fecha de emisión del documento, formato YYYY-MM-DD si es posible.
- "m2Total": la superficie total en m² si el documento la indica explícitamente. Si no aparece, null.
- "marcas": identifica CADA código de pieza/tag mencionado, revisando la tabla completa de principio a fin sin importar cuántas filas tenga ni en cuántas páginas o archivos esté repartida — no omitas ninguna fila (ej. "2610-SP-32402-A", "2610-SP-32402"). Si el código termina en un sufijo de letra separado por guion (A, B, C...), sepáralo como "tag" (sin el sufijo) e "id" (el sufijo). Si no tiene sufijo, "id" es null. Si el documento trae una tabla con m² por pieza, complétalo; si no, deja "m2" en null. Si el documento no distingue piezas individuales (solo un total), deja "marcas" como arreglo vacío.
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
    // Compatibilidad: acepta tanto el formato nuevo (archivos: [{base64,
    // mimeType}]) como el formato viejo de un solo PDF (pdfBase64), por si
    // queda algun llamado antiguo en cache del navegador de alguien.
    const archivos = Array.isArray(body.archivos) && body.archivos.length
      ? body.archivos
      : (body.pdfBase64 ? [{ base64: body.pdfBase64, mimeType: "application/pdf" }] : []);
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
    console.error("extraer-oc error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
