// ============================================================
// SEREIN · Lectura de la cubicación / requerimiento del cliente con IA
// Supabase Edge Function — extraer-cubicacion
// ============================================================
// Lee el documento que envía el cliente (PDF, fotos, o el texto de un
// Excel ya convertido por el navegador) y propone las filas de la
// cubicación de una cotización. Mismo mecanismo que extraer-oc/extraer-
// factura: nunca escribe en la base de datos, solo propone datos para que
// la persona los revise antes de aplicar.
//
// REGLA DE ORO: la IA NO calcula m² a pintar. Solo transcribe lo que el
// documento dice (elemento, dato tal como está escrito, unidad y
// cantidad). El factor (1 cara, 2 caras, m²/ml de un perfil) lo elige la
// persona en pantalla y el navegador hace la multiplicación.
//
// Requiere el secreto ANTHROPIC_API_KEY (el mismo de extraer-oc).
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";

const ESQUEMA_JSON = `{
  "cliente": string | null,
  "contacto": string | null,
  "proyecto": string | null,
  "lugarEjecucion": string | null,
  "esquemaSolicitado": string | null,
  "filas": [
    { "elemento": string, "dato": string, "unidad": "m2" | "ml" | "un" | null, "cantidad": number | null, "m2Informado": number | null }
  ],
  "observaciones": string | null
}`;

const PROMPT = `Estás leyendo el REQUERIMIENTO o TABLA DE CUBICACIÓN que un cliente industrial envió a SEREIN (empresa chilena de granallado y pintura industrial) para que SEREIN cotice el pintado/granallado de piezas y estructuras. Puede venir como PDF, fotos o texto de una planilla Excel. Extrae la información en un JSON con EXACTAMENTE esta forma (sin texto adicional, sin markdown, sin comentarios):

${ESQUEMA_JSON}

Reglas:
- "filas": UNA fila por cada elemento o ítem a tratar (puertas, portones, barandas, costaneras, perfiles, parrillas, etc.), en el orden del documento. NO incluyas filas de totales ni subtotales.
- "elemento": el nombre del elemento con sus datos identificadores tal como aparecen (ej. "Puertas de emergencia (3 un, 1,5×2,5 m)"). Incluye el código de ítem del cliente si existe, al inicio.
- "dato": la cantidad o medida informada TAL COMO ESTÁ ESCRITA (ej. "11,25 m²", "750 ml", "480 un").
- "unidad" y "cantidad": la magnitud numérica de ese dato ("m2", "ml" o "un"). Si no se puede determinar, null. Los números como NÚMEROS (sin separadores de miles; el decimal con punto).
- "m2Informado": SOLO si el documento indica explícitamente una superficie en m² para ese elemento (columna "m²", "superficie", "área"); si no, null. NUNCA calcules una superficie tú mismo: no multipliques largos por anchos, no apliques caras ni factores de perfil.
- "esquemaSolicitado": el sistema de pintura o preparación que el cliente pide (productos, espesores, normas) resumido en una frase, si aparece; si no, null.
- "cliente", "contacto", "proyecto", "lugarEjecucion": solo si aparecen explícitos; si no, null.
- "observaciones": notas del cliente relevantes para cotizar (ej. "largo de diagonales por confirmar"), una frase; si no hay, null.
- Si un dato no aparece en el documento, usa null (nunca inventes valores).
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
    const texto = typeof body.texto === "string" ? body.texto.slice(0, 60000) : "";
    if (!archivos.length && !texto.trim()) throw new Error("Falta al menos un archivo o el texto de la planilla en la solicitud.");

    const contenido: any[] = archivos.map((a: any) => {
      const mime = a.mimeType || "application/pdf";
      if (MIME_IMAGEN.has(mime)) return { type: "image", source: { type: "base64", media_type: mime, data: a.base64 } };
      return { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 } };
    });
    if (texto.trim()) contenido.push({ type: "text", text: "TEXTO DE LA PLANILLA (hojas convertidas a texto, columnas separadas por ;):\n\n" + texto });
    contenido.push({ type: "text", text: PROMPT });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 8192, messages: [{ role: "user", content: contenido }] }),
    });
    if (!res.ok) throw new Error(`Anthropic API respondió ${res.status}: ${(await res.text()).slice(0, 500)}`);

    const data = await res.json();
    const textoRespuesta = (data.content || []).map((b: any) => b.text || "").join("").trim();
    const limpio = textoRespuesta.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    let datos;
    try { datos = JSON.parse(limpio); } catch (e) { throw new Error("La IA no devolvió un JSON válido: " + limpio.slice(0, 300)); }

    const aNumero = (v: any) => {
      if (v == null || v === "") return null;
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      const s = String(v).replace(/[^0-9.,-]/g, "");
      if (!s) return null;
      const l = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/\.(?=\d{3}\b)/g, "");
      const n = parseFloat(l);
      return Number.isFinite(n) ? n : null;
    };
    const UNIDADES = new Set(["m2", "ml", "un"]);
    datos.filas = (Array.isArray(datos.filas) ? datos.filas : [])
      .filter((f: any) => f && String(f.elemento || "").trim())
      .map((f: any) => ({
        elemento: String(f.elemento).trim(),
        dato: f.dato == null ? "" : String(f.dato).trim(),
        unidad: UNIDADES.has(f.unidad) ? f.unidad : null,
        cantidad: aNumero(f.cantidad),
        m2Informado: aNumero(f.m2Informado),
      }));

    return new Response(JSON.stringify({ ok: true, datos }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("extraer-cubicacion error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
