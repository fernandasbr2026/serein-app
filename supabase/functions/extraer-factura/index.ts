// ============================================================
// SEREIN · Lectura de facturas de venta con IA
// Supabase Edge Function — extraer-factura
// ============================================================
// Mismo mecanismo que extraer-guia y extraer-oc (PDF y/o fotos, un solo
// documento combinado, misma forma de respuesta) pero para las facturas
// de venta que SEREIN emite a sus clientes: extrae folio, fecha, montos
// y las marcas/tags que aparecen en el detalle, para cotejarlas despues
// contra las marcas esperadas de la OT en el ERP y saber que piezas
// quedan sin facturar. Nunca escribe directo en la base de datos — solo
// lee el archivo y propone datos para que la persona revise antes de
// aplicar.
//
// Requiere el secreto ANTHROPIC_API_KEY (Edge Functions > Secrets) — el
// mismo que ya usan extraer-oc y extraer-guia.
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";

const ESQUEMA_JSON = `{
  "folio": string | null,
  "fecha": string | null,
  "neto": number | null,
  "iva": number | null,
  "total": number | null,
  "ordenCompra": string | null,
  "notaVenta": string | null,
  "cliente": string | null,
  "rutCliente": string | null,
  "tipoDocumento": string | null,
  "folioReferencia": string | null,
  "m2Total": number | null,
  "marcas": [{ "tag": string, "id": string | null, "m2": number | null }]
}`;

const PROMPT = `Estás leyendo una FACTURA DE VENTA emitida por SEREIN Group (empresa chilena de granallado y pintura industrial) a uno de sus clientes. Puede venir como uno o varios archivos (PDF con varias páginas, o varias fotos de páginas distintas del mismo documento) — trátalos como UN SOLO documento y combina la información de todos ellos. Extrae la información en un JSON con EXACTAMENTE esta forma (sin texto adicional, sin markdown, sin comentarios):

${ESQUEMA_JSON}

Reglas:
- "folio": el número de folio de la factura tal como aparece impreso (solo el número, sin la palabra "Factura" ni el tipo de documento).
- "fecha": fecha de emisión, formato YYYY-MM-DD si es posible.
- "neto", "iva", "total": montos en pesos chilenos, como NÚMEROS enteros sin puntos, comas, ni símbolo de moneda. "neto" es el monto afecto antes de IVA. Si el documento es exento, "iva" es 0 y "neto" es igual a "total".
- "ordenCompra": el número de orden de compra (OC) del cliente si aparece referenciado en la factura; si no aparece, null.
- "notaVenta": el número de nota de venta (NV) si aparece referenciado; si no, null.
- "cliente": la razón social del CLIENTE al que se factura (el receptor, no SEREIN que es quien emite); si no aparece, null.
- "rutCliente": el RUT de ese cliente tal como aparece impreso (ej. "96.946.410-1"); si no aparece, null.
- "tipoDocumento": "Factura", "Factura exenta", "Nota de crédito" o "Nota de débito" según el documento; si no se distingue, null.
- "folioReferencia": solo si el documento es una NOTA DE CRÉDITO: el folio de la factura que corrige o anula, tal como aparece en la sección de referencias; si no es nota de crédito o no aparece, null.
- "m2Total": si el detalle indica una superficie total en metros cuadrados, ese número; si no aparece, null.
- "marcas": identifica CADA código de pieza/tag mencionado en el detalle de la factura, revisando la tabla completa de principio a fin sin importar cuántas filas tenga ni en cuántas páginas o archivos esté repartida — no omitas ninguna fila (ej. "2610-SP-32402-A", "2610-SP-32402"). Si el código termina en un sufijo de letra separado por guion (A, B, C...), sepáralo como "tag" (sin el sufijo) e "id" (el sufijo). Si no tiene sufijo, "id" es null. "m2" es la superficie de esa línea si la factura la detalla por pieza; si no, null.
- Si la factura NO detalla piezas individuales (solo trae un concepto global, ej. "Aplicación de pintura intumescente según OC 1234"), deja "marcas" como arreglo vacío — no inventes códigos.
- No confundas el número de OC, el número de guía de despacho ni el RUT con un código de pieza.
- Si un campo no aparece en el documento, usa null (nunca inventes un valor).
- Responde SOLO el JSON, nada más.`;

const MIME_IMAGEN = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);


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
    const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
    if (!apiKey) throw new Error("Falta el secreto ANTHROPIC_API_KEY en este proyecto Supabase (Edge Functions > Secrets).");

    const body = await req.json();
    const archivos = Array.isArray(body.archivos) ? body.archivos : [];
    limitarArchivos(archivos);
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
    registrarUsoIA("extraer-factura", MODEL, data && data.usage, acceso.ok ? acceso.uid : "", res.ok, res.ok ? undefined : JSON.stringify(data).slice(0, 200));
    const textoRespuesta = (data.content || []).map((b: any) => b.text || "").join("").trim();

    // Claude a veces envuelve el JSON en ```json ... ``` a pesar de la
    // instruccion — se lo saca antes de parsear, para no romper por eso.
    const limpio = textoRespuesta.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    let datos;
    try { datos = JSON.parse(limpio); }
    catch (e) { throw new Error("La IA no devolvió un JSON válido: " + limpio.slice(0, 300)); }

    // Los montos a veces vuelven como texto ("1.234.567") pese al prompt:
    // se normalizan aca para que el ERP reciba siempre numeros y no tenga
    // que adivinar el formato.
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
    datos.m2Total = aNumero(datos.m2Total);
    if (Array.isArray(datos.marcas)) {
      datos.marcas = datos.marcas
        .filter((m: any) => m && String(m.tag || "").trim())
        .map((m: any) => ({ tag: String(m.tag).trim(), id: m.id == null || m.id === "" ? null : String(m.id).trim(), m2: aNumero(m.m2) }));
    } else {
      datos.marcas = [];
    }
    // Si vino total pero no neto (facturas donde la IA solo pilla el total
    // impreso grande), se despeja el neto asumiendo IVA 19%, que es lo que
    // usa el resto del ERP. Queda igualmente editable en la revision.
    if (datos.neto == null && datos.total != null) {
      datos.neto = datos.iva != null ? Math.round(datos.total - datos.iva) : Math.round(datos.total / 1.19);
    }

    return new Response(JSON.stringify({ ok: true, datos, archivo: filename || null }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("extraer-factura error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
