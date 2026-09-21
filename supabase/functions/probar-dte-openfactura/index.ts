// ============================================================
// SEREIN · Prueba de emisión de DTE vía OpenFactura (Haulmer)
// Supabase Edge Function — SOLO VALIDACIÓN, no es la integración final
// ============================================================
// Existe para responder una pregunta concreta antes de comprometerse
// comercialmente con un proveedor de facturación electrónica: ¿se puede
// emitir factura, guía de despacho y nota de crédito desde el ERP de
// SEREIN (en vez de entrar a Defontana), vía una API con costo menor?
//
// Reenvía la peticion tal cual al ambiente de DESARROLLO de OpenFactura
// (dev-api.haulmer.com) — las emisiones ahí usan un CAF simulado, el
// timbre no es válido ante el SII, pero el folio, la validación de
// campos y la forma de la respuesta son las mismas que en producción.
// Documentación: https://docsapi-openfactura.haulmer.com/
//
// Los 3 tipos de documento que pidió Fernanda, con su TipoDTE:
//   33 = Factura Electrónica       52 = Guía de Despacho Electrónica
//   61 = Nota de Crédito Electrónica (lleva ademas un bloque "Referencia"
//        apuntando al documento que corrige/anula)
//
// CÓMO SE ACTIVA (lo hace Gerencia dentro de Supabase, igual que
// defontana-sync o subir-protocolo-drive):
// 1. Edge Functions → Deploy new function → nombre "probar-dte-openfactura"
//    → pegar este archivo → Deploy.
// 2. No requiere secretos para probar: usa la API Key pública que
//    Haulmer publica en su propia documentación para el ambiente de
//    desarrollo (no es un dato sensible de SEREIN).
// 3. Cuando haya cuenta real de SEREIN en OpenFactura, agregar el
//    secreto OPENFACTURA_API_KEY (Project Settings → Edge Functions →
//    Secrets) — la función la usa automáticamente en vez de la pública,
//    pero mientras siga apuntando a dev-api.haulmer.com sigue siendo
//    ambiente de pruebas, no producción real.
//
// Body esperado (POST):
//   { "dte": { ... } }   — mismo formato que documenta OpenFactura
//   (Encabezado.IdDoc.TipoDTE, Emisor, Receptor, Totales, Detalle, y
//   Referencia para notas de crédito). Este endpoint NO arma el dte por
//   vos: solo lo reenvia — el armado del documento real queda para
//   cuando se decida seguir con esto en serio.
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Key pública de Haulmer para su ambiente de desarrollo — la misma que
// publican en su documentación para que cualquiera pueda probar la
// integración sin crear cuenta. No es un secreto de SEREIN.
const API_KEY_PUBLICA_DEV = "928e15a2d14d4a6292345f04960f4bd3";
const DEV_API_URL = "https://dev-api.haulmer.com/v2/dte/document";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  try {
    const { dte, response: camposRespuesta } = await req.json();
    if (!dte) throw new Error("Falta 'dte' en la solicitud.");

    const apiKey = Deno.env.get("OPENFACTURA_API_KEY") || API_KEY_PUBLICA_DEV;

    const res = await fetch(DEV_API_URL, {
      method: "POST",
      headers: { apikey: apiKey, "Content-type": "application/json" },
      body: JSON.stringify({ response: camposRespuesta || ["FOLIO", "PDF"], dte }),
    });
    const data = await res.json();

    return new Response(JSON.stringify({ ok: res.ok, status: res.status, data }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
