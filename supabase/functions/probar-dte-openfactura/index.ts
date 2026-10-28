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


// ============================================================
// Autorización (auditoría 2026-10-27, hallazgo S-7/S-12)
// ============================================================
// Antes cualquiera que llegara a esta URL podía ejecutarla (y, en las de IA, gastar créditos). Ahora:
// 1) la petición debe traer la sesión del usuario (supabase.functions.invoke la manda sola),
// 2) el perfil de ese usuario tiene que estar en PERMITIDOS,
// 3) hay tope de archivos y tamaño por llamada, y 4) cada llamada a la IA queda anotada en ia_uso.
// Se responde con HTTP 200 y { ok: false, error } para que la app muestre el motivo tal cual.
const PERMITIDOS: string[] = ['gerencia', 'admin', 'comercial', 'proyectos', 'jefe', 'supervisor'];
const MAX_ARCHIVOS = 8;
const MAX_MB_ARCHIVOS = 25;
async function autorizarPeticion(req: Request): Promise<{ ok: true; uid: string; tipo: string } | { ok: false; error: string }> {
  const auth = (req.headers.get("Authorization") || "").trim();
  if (!/^Bearer\s+\S+/i.test(auth)) return { ok: false, error: "Debes iniciar sesión para usar esta función." };
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const srv = (Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  try {
    const u = await fetch(url + "/auth/v1/user", { headers: { Authorization: auth, apikey: anon || srv } });
    if (!u.ok) return { ok: false, error: "Tu sesión no es válida o venció: vuelve a iniciar sesión." };
    const user = await u.json();
    const uid = user && user.id ? String(user.id) : "";
    if (!uid) return { ok: false, error: "Tu sesión no es válida: vuelve a iniciar sesión." };
    const p = await fetch(url + "/rest/v1/perfiles?select=tipo&id=eq." + encodeURIComponent(uid), { headers: { apikey: srv, Authorization: "Bearer " + srv } });
    const filas = p.ok ? await p.json() : [];
    const tipo = String((Array.isArray(filas) && filas[0] && filas[0].tipo) || "");
    if (!tipo || !PERMITIDOS.includes(tipo)) return { ok: false, error: "Tu perfil no tiene permiso para usar esta función." };
    return { ok: true, uid, tipo };
  } catch (_e) { return { ok: false, error: "No se pudo comprobar tu sesión. Inténtalo de nuevo." }; }
}
function limitarArchivos(archivos: any[]) {
  if (!Array.isArray(archivos)) return;
  if (archivos.length > MAX_ARCHIVOS) throw new Error("Máximo " + MAX_ARCHIVOS + " archivos por lectura.");
  const bytes = archivos.reduce((a: number, x: any) => a + Math.floor(String((x && x.base64) || "").length * 3 / 4), 0);
  if (bytes > MAX_MB_ARCHIVOS * 1024 * 1024) throw new Error("Los archivos superan " + MAX_MB_ARCHIVOS + " MB en total: súbelos en menos partes o con menor resolución.");
}
// Deja constancia de cada llamada a la IA (tokens reales). Si la tabla no existe, no interrumpe nada.
async function registrarUsoIA(funcion: string, modelo: string | null, uso: any, referencia: string, ok: boolean, error?: string) {
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const srv = (Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
    await fetch(url + "/rest/v1/ia_uso", {
      method: "POST",
      headers: { apikey: srv, Authorization: "Bearer " + srv, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        funcion, modelo,
        tokens_entrada: uso?.input_tokens ?? null, tokens_salida: uso?.output_tokens ?? null,
        tokens_cache_escritura: uso?.cache_creation_input_tokens ?? null, tokens_cache_lectura: uso?.cache_read_input_tokens ?? null,
        referencia, ok, error: error ? String(error).slice(0, 300) : null,
      }),
    });
  } catch (_e) { /* sin registro */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const acceso = await autorizarPeticion(req);
  if (!acceso.ok) return new Response(JSON.stringify({ ok: false, error: acceso.error }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
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
