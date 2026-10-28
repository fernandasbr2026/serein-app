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


// ============================================================
// Autorización (auditoría 2026-10-27, hallazgo S-7/S-12)
// ============================================================
// Antes cualquiera que llegara a esta URL podía ejecutarla (y, en las de IA, gastar créditos). Ahora:
// 1) la petición debe traer la sesión del usuario (supabase.functions.invoke la manda sola),
// 2) el perfil de ese usuario tiene que estar en PERMITIDOS,
// 3) hay tope de archivos y tamaño por llamada, y 4) cada llamada a la IA queda anotada en ia_uso.
// Se responde con HTTP 200 y { ok: false, error } para que la app muestre el motivo tal cual.
const PERMITIDOS: string[] = ['gerencia', 'admin', 'comercial', 'proyectos', 'jefe', 'supervisor', 'taller_externo'];
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
    registrarUsoIA("extraer-hoja-avance", MODEL, data && data.usage, acceso.ok ? acceso.uid : "", res.ok, res.ok ? undefined : JSON.stringify(data).slice(0, 200));
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
