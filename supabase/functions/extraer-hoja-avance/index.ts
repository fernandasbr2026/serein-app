// ============================================================
// SEREIN · Lectura de la hoja de avance de taller con IA
// Supabase Edge Function — extraer-hoja-avance
// ============================================================
// Mismo mecanismo que extraer-guia (foto de un documento, misma forma de
// respuesta) pero para la "hoja de avance" que el propio ERP genera e
// imprime (ver generarHojaAvanceHtml en src/controlTaller.js): una tabla
// impresa de Marca | Cantidad total | Dimensionado | Armado | Soldado |
// Liberado, con casilleros en blanco que el taller raya o escribe a mano
// a medida que completa cada etapa. Se lee foto por foto (no el plano de
// ingeniería completo) para que el reconocimiento sea confiable: texto
// impreso conocido + números manuscritos al lado. Nunca escribe directo
// en la base de datos — solo lee la foto y propone datos para que la
// persona revise antes de aplicar.
//
// Requiere el secreto ANTHROPIC_API_KEY (Edge Functions > Secrets) — el
// mismo que ya usa extraer-oc/extraer-guia.
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";

const ESQUEMA_JSON = `{
  "filas": [{ "marca": string, "dimensionado": number | null, "armado": number | null, "soldado": number | null, "liberado": number | null }]
}`;

const PROMPT = `Estás leyendo una "hoja de avance de taller" fotografiada — un documento impreso por SEREIN Group (empresa chilena de fabricación estructural) con una tabla de columnas: Marca | Perfil | Cant. total | Dimensionado | Armado | Soldado | Liberado. Las primeras columnas vienen impresas a máquina; las últimas 4 (Dimensionado/Armado/Soldado/Liberado) tienen casilleros en blanco donde un operario de taller escribió A MANO, con lápiz o lapicera, cuántas piezas de esa marca completaron esa etapa (puede ser un número, una marca de cotejo interpretada como "todas las piezas de esa fila", o quedar vacío si no se tocó esa etapa).

Extrae la información en un JSON con EXACTAMENTE esta forma (sin texto adicional, sin markdown, sin comentarios):

${ESQUEMA_JSON}

Reglas:
- "marca": el código de marca tal como aparece impreso en la fila (ej. "CA_1", "an-3", "pc-12") — cópialo exactamente, no lo modifiques.
- Para cada una de las 4 columnas (dimensionado/armado/soldado/liberado): si el casillero tiene un número escrito a mano, ese es el valor. Si tiene una marca de cotejo (✓, X) sin número, interpreta que corresponde a TODAS las piezas de esa marca (usa la cantidad total impresa en la columna "Cant. total" de esa misma fila si está visible, o null si no puedes determinar la cantidad total). Si el casillero está vacío o no fue tocado, usa null — nunca inventes un valor ni asumas que vacío significa cero.
- Revisa la tabla completa de principio a fin, todas las filas visibles en la foto.
- Si la letra es ambigua o no se puede leer con confianza, usa null para esa celda en particular — es preferible dejarlo en blanco para que la persona lo revise a mano, que adivinar mal.
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
    console.error("extraer-hoja-avance error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
