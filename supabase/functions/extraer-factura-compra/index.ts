// ============================================================
// SEREIN · Lectura de facturas de COMPRA (proveedores) con IA
// Supabase Edge Function — extraer-factura-compra
// ============================================================
// Mismo mecanismo que extraer-factura (facturas de venta) pero al revés:
// esta lee una factura que un PROVEEDOR le emite a SEREIN Group, para
// precargar el formulario de "Compras imputadas" de un proyecto (Módulo
// de Proyectos). Extrae proveedor, RUT, folio, fecha y montos. El centro
// de costo NUNCA lo decide la IA — eso lo elige la persona a mano en la
// vista previa, es una decisión de negocio que no está en el documento.
// Nunca escribe directo en la base de datos — solo lee el archivo y
// propone datos para que la persona revise antes de aplicar.
//
// Requiere el secreto ANTHROPIC_API_KEY (Edge Functions > Secrets) — el
// mismo que ya usan extraer-oc/extraer-guia/extraer-factura.
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";

const ESQUEMA_JSON = `{
  "proveedor": string | null,
  "rut": string | null,
  "folio": string | null,
  "fecha": string | null,
  "neto": number | null,
  "iva": number | null,
  "total": number | null,
  "exento": boolean,
  "detalle": string | null
}`;

const PROMPT = `Estás leyendo una FACTURA DE COMPRA que un proveedor le emite a SEREIN Group (empresa chilena de granallado y pintura industrial) — SEREIN es quien RECIBE esta factura, no quien la emite. Puede venir como uno o varios archivos (PDF con varias páginas, o varias fotos de páginas distintas del mismo documento) — trátalos como UN SOLO documento y combina la información de todos ellos. Extrae la información en un JSON con EXACTAMENTE esta forma (sin texto adicional, sin markdown, sin comentarios):

${ESQUEMA_JSON}

Reglas:
- "proveedor": la razón social de quien EMITE la factura (el proveedor, no "Servicios Revestimientos Industriales SpA" ni "SEREIN", que es quien la recibe).
- "rut": el RUT del proveedor emisor (no el de SEREIN).
- "folio": el número de folio de la factura tal como aparece impreso (solo el número, sin la palabra "Factura" ni el tipo de documento).
- "fecha": fecha de emisión, formato YYYY-MM-DD si es posible.
- "neto", "iva", "total": montos en pesos chilenos, como NÚMEROS enteros sin puntos, comas, ni símbolo de moneda. "neto" es el monto afecto antes de IVA.
- "exento": true si la factura es exenta de IVA (sin IVA), false si es afecta.
- "detalle": una descripción breve (una línea) de qué se compró — el concepto principal o un resumen si hay varias líneas.
- Si un campo no aparece en el documento, usa null (nunca inventes un valor, y nunca inventes un centro de costo — eso no está en el documento).
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

    // Claude a veces envuelve el JSON en ```json ... ``` a pesar de la
    // instruccion — se lo saca antes de parsear, para no romper por eso.
    const limpio = textoRespuesta.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    let datos;
    try { datos = JSON.parse(limpio); }
    catch (e) { throw new Error("La IA no devolvió un JSON válido: " + limpio.slice(0, 300)); }

    // Los montos a veces vuelven como texto ("1.234.567") pese al prompt:
    // se normalizan aca para que el ERP reciba siempre numeros.
    const aNumero = (v: any) => {
      if (v == null || v === "") return null;
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      const s = String(v).replace(/[^0-9.,-]/g, "");
      if (!s) return null;
      const limpioNum = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/\.(?=\d{3}\b)/g, "");
      const n = parseFloat(limpioNum);
      return Number.isFinite(n) ? n : null;
    };
    datos.neto = aNumero(datos.neto);
    datos.iva = aNumero(datos.iva);
    datos.total = aNumero(datos.total);
    datos.exento = !!datos.exento;
    // Si vino total pero no neto, se despeja el neto asumiendo IVA 19% —
    // queda igualmente editable en la revision.
    if (datos.neto == null && datos.total != null) {
      datos.neto = datos.exento ? datos.total : (datos.iva != null ? Math.round(datos.total - datos.iva) : Math.round(datos.total / 1.19));
    }

    return new Response(JSON.stringify({ ok: true, datos, archivo: filename || null }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("extraer-factura-compra error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
