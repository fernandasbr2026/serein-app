// ============================================================
// SEREIN · Lectura del Listado de Partes (BOM) con IA
// Supabase Edge Function — extraer-listado-partes
// ============================================================
// Recibe uno o varios archivos del "Listado de Partes" que exporta el
// software de detallamiento estructural (Marca/Perfil/Cantidad/Material/
// Largo/Peso) como base64, se los manda a Claude pidiendole que extraiga
// cada fila en un JSON con forma fija, y devuelve ese JSON al ERP para que
// la persona lo revise y corrija antes de aplicarlo al proyecto — esta
// funcion NUNCA escribe directo en la base de datos, solo lee el/los
// archivo(s) y propone datos (mismo contrato que extraer-oc/extraer-guia).
//
// Requiere el secreto ANTHROPIC_API_KEY (Edge Functions > Secrets).
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";

const ESQUEMA_JSON = `{
  "proyecto": string | null,
  "modelo": string | null,
  "marcas": [{ "marca": string, "perfil": string | null, "cantidad": number | null, "material": string | null, "largo": number | null, "pesoUnitario": number | null }]
}`;

const PROMPT = `Estás leyendo un "Listado de Partes" (BOM / lista de materiales) de estructuras metálicas, exportado de un software de detallamiento (Tekla, SDS2 o similar), que usa SEREIN Group para fabricación en taller. Puede venir como uno o varios archivos (PDF con varias páginas) — trátalos como UN SOLO documento y combina la información de todos ellos. Extrae la información en un JSON con EXACTAMENTE esta forma (sin texto adicional, sin markdown, sin comentarios):

${ESQUEMA_JSON}

Reglas:
- "proyecto": el código o nombre de proyecto que aparece en el encabezado (ej. "0093-26"), si aparece.
- "modelo": el nombre del modelo si aparece en el encabezado (ej. "SEREIN_ALMACEN").
- "marcas": una fila por cada línea de la tabla de partes (columnas típicas: Marca/Parte, Perfil, Cant., Material, Largo, Peso/ud). Revisa la tabla completa de principio a fin sin importar cuántas filas tenga ni en cuántas páginas esté repartida — no omitas ninguna fila, incluida la segunda página si el listado continúa ahí.
  - "marca": el código de marca/parte tal como aparece (ej. "CA_1", "an-3", "pc-12").
  - "perfil": la descripción del perfil (ej. "C150X75X5", "W250X44.8", "PL10*150").
  - "cantidad": el número de piezas de esa marca (columna "Cant.").
  - "material": el grado de material (ej. "A36", "A572-50").
  - "largo": el largo en milímetros, como número (sin unidad).
  - "pesoUnitario": el peso por unidad en kilogramos, como número (sin unidad) — columna "Peso/ud".
- Si un campo no aparece o no se puede leer, usa null (nunca inventes un valor).
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
    console.error("extraer-listado-partes error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
