// ============================================================
// SEREIN · Redacción asistida de los textos de una cotización
// Supabase Edge Function — redactar-oferta
// ============================================================
// Recibe los datos YA CARGADOS de una cotización (cliente, sistema de
// pintura, cubicación, m², lugar de ejecución) y propone los textos
// libres: asunto, franja de sistema, carta introductoria y nota técnica.
// Nunca escribe en la base de datos: la persona revisa y edita antes de
// aplicar.
//
// REGLAS: usa SOLO los hechos y cifras recibidos. No inventa precios,
// plazos, garantías, normas ni marcas. El navegador además marca cualquier
// cifra del texto que no esté en los datos.
//
// Requiere el secreto ANTHROPIC_API_KEY (el mismo de extraer-oc).
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";

const PROMPT = `Eres el redactor comercial de SEREIN Group (Servicios de Revestimientos Industriales SpA, Chile: granallado, pintura industrial, montajes). Te entrego los DATOS de una cotización ya armada. Redacta los textos libres del documento, en español de Chile, tono profesional, cercano y directo — el de una empresa seria que le escribe a un cliente industrial (minera, contratista, mandante).

Devuelve SOLO un JSON con EXACTAMENTE esta forma (sin markdown, sin comentarios):
{
  "asunto": string | null,
  "sistemaResumen": string | null,
  "carta": string,
  "notaTecnica": string | null
}

Reglas estrictas:
- Usa ÚNICAMENTE los hechos y cifras que aparecen en los DATOS. Prohibido inventar o suponer: precios, plazos, garantías, normas, marcas, ubicaciones, nombres, condiciones de pago o resultados. Si algo no está en los datos, no lo menciones.
- No escribas precios ni montos en pesos en ningún texto (el precio ya está en el documento).
- "asunto": línea corta bajo el folio (ej. "Pintura de portones y barandas", "Alternativa sistema X" si los datos lo justifican); null si no hay base.
- "sistemaResumen": una línea con el sistema: tipo de producto(s), espesor total en µm si se conoce, preparación de superficie si se conoce y colores si se conocen. Null si no hay capas.
- "carta": 70 a 130 palabras. Empieza agradeciendo la oportunidad de cotizar (y la información entregada si el cliente envió cubicación/requerimiento). Resume qué se propone (sistema, superficie total en m² si existe, dónde se ejecuta si se indica). Puedes cerrar aclarando que las superficies se rectifican al ingreso del material solo si los datos lo indican. Sin listas ni viñetas; párrafos cortos.
- "notaTecnica": 1 a 3 frases con puntos técnicos derivables de los datos (ej. espesor total, capas dentro/fuera del rango de ficha técnica según los indicadores recibidos, colores contrastantes entre manos si los datos los muestran). Null si no hay nada técnico que aportar. Nunca afirmes cumplimiento de una norma que no esté en los datos.
- Cifras: cópialas exactamente como vienen en los datos.
- Responde SOLO el JSON.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  try {
    const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
    if (!apiKey) throw new Error("Falta el secreto ANTHROPIC_API_KEY en este proyecto Supabase (Edge Functions > Secrets).");

    const body = await req.json();
    const datos = body && body.datos;
    if (!datos || typeof datos !== "object") throw new Error("Faltan los datos de la cotización.");
    const requerimiento = typeof body.requerimiento === "string" ? body.requerimiento.slice(0, 4000) : "";
    const instrucciones = typeof body.instrucciones === "string" ? body.instrucciones.slice(0, 1000) : "";

    let contenido = PROMPT + "\n\nDATOS DE LA COTIZACIÓN (JSON):\n" + JSON.stringify(datos, null, 1).slice(0, 20000);
    if (requerimiento.trim()) contenido += "\n\nTEXTO DEL REQUERIMIENTO DEL CLIENTE (para contexto; no copies cifras que no estén también en los datos):\n" + requerimiento;
    if (instrucciones.trim()) contenido += "\n\nINDICACIONES DEL VENDEDOR (respétalas mientras no contradigan las reglas):\n" + instrucciones;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: "user", content: contenido }] }),
    });
    if (!res.ok) throw new Error(`Anthropic API respondió ${res.status}: ${(await res.text()).slice(0, 500)}`);

    const data = await res.json();
    const texto = (data.content || []).map((b: any) => b.text || "").join("").trim();
    const limpio = texto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    let out;
    try { out = JSON.parse(limpio); } catch (e) { throw new Error("La IA no devolvió un JSON válido: " + limpio.slice(0, 300)); }
    const str = (v: any) => (v == null || String(v).trim() === "" ? null : String(v).trim());
    const propuesta = { asunto: str(out.asunto), sistemaResumen: str(out.sistemaResumen), carta: str(out.carta) || "", notaTecnica: str(out.notaTecnica) };

    return new Response(JSON.stringify({ ok: true, propuesta }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("redactar-oferta error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
