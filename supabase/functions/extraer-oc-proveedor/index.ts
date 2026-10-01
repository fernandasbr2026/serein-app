// ============================================================
// SEREIN · Lectura de OC A PROVEEDOR con IA para Proyectos (monto +
// etapas de pago)
// Supabase Edge Function — extraer-oc-proveedor
// ============================================================
// Clon de extraer-oc-comercial (misma mecánica: archivos a Claude, JSON
// de vuelta, nunca escribe directo en la base) pero para la dirección
// CONTRARIA del documento: acá SEREIN es quien EMITE la OC hacia un
// PROVEEDOR para confirmar una compra, no quien la recibe de un cliente.
// Se deja como función separada de extraer-oc-comercial — reutilizar esa
// (prompt que asume "el cliente que emite la OC, no SEREIN") sobre un
// documento emitido POR Serein confunde a la IA, que termina leyendo el
// nombre de Serein como si fuera la contraparte.
//
// Requiere el secreto ANTHROPIC_API_KEY (Edge Functions > Secrets) — el
// mismo que ya usan extraer-oc/extraer-oc-comercial/extraer-factura-compra.
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";

const ESQUEMA_JSON = `{
  "proveedor": string | null,
  "rut": string | null,
  "ocNumero": string | null,
  "fecha": string | null,
  "montoTotal": number | null,
  "exento": boolean,
  "etapas": [{ "nombre": string, "pct": number | null, "monto": number | null }],
  "observaciones": string | null
}`;

const PROMPT = `Estás leyendo una Orden de Compra (OC) que SEREIN Group — una empresa chilena de granallado y pintura industrial — le ENTREGA a un PROVEEDOR para confirmar una compra (materiales, arriendo de equipos, servicios, etc.). SEREIN es quien EMITE este documento, no quien lo recibe. Puede venir como uno o varios archivos; trátalos como UN SOLO documento. Extrae la información en un JSON con EXACTAMENTE esta forma (sin texto adicional, sin markdown, sin comentarios):

${ESQUEMA_JSON}

Reglas:
- "proveedor": la razón social del PROVEEDOR al que SEREIN le compra (NUNCA "Servicios Revestimientos Industriales SpA", "SEREIN" o variantes — ese es el emisor del documento, no el proveedor).
- "rut": el RUT del proveedor, no el de SEREIN.
- "ocNumero": el número de la orden de compra tal como aparece.
- "fecha": fecha de emisión del documento, formato YYYY-MM-DD si es posible.
- "montoTotal": el monto NETO total de la OC (sin IVA), en pesos chilenos, como número. Si el documento solo trae el monto con IVA, calcula el neto (divide por 1.19) y dilo en "observaciones". Si no aparece ningún monto, null.
- "exento": true solo si el documento indica explícitamente que está exento de IVA.
- "etapas": SOLO si el documento trae un desglose explícito de cómo se va a pagar (ej. "anticipo 30%, saldo 70% contra entrega", o una tabla de pagos/hitos con sus montos o porcentajes) — en ese caso, una fila por cada etapa con su nombre tal como aparece (o "Anticipo"/"Saldo" si el documento no les da nombre propio), y su "pct" (0-100) o "monto" (el que el documento use; deja el otro en null). Si el documento NO trae ningún desglose de pago por etapas, deja "etapas" como arreglo vacío — la persona las va a definir a mano, no inventes un desglose que no está. No intentes adivinar si una etapa se paga al contado o se factoriza — eso no suele venir en el documento y la persona lo define después.
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
    const archivos = Array.isArray(body.archivos) && body.archivos.length ? body.archivos : [];
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
        max_tokens: 4096,
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
    const limpio = textoRespuesta.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    let datos;
    try { datos = JSON.parse(limpio); }
    catch (e) { throw new Error("La IA no devolvió un JSON válido: " + limpio.slice(0, 300)); }

    return new Response(JSON.stringify({ ok: true, datos, archivo: filename || null }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("extraer-oc-proveedor error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
