// ============================================================
// SEREIN · Subida automática de facturas de venta a Google Drive
// Supabase Edge Function — subir-factura-venta-drive
// ============================================================
// Recibe el PDF de una factura de VENTA (la que sube la persona al
// registrar una factura en Facturas por área) como base64, y lo sube a
// la misma Unidad compartida que ya usan compras y protocolos de
// calidad, organizado en una rama propia: VENTAS / <OT> / archivo.pdf
// — sin nivel de Centro de Costo, porque una venta no se imputa a un
// CC como sí lo hace una compra. Mismo mecanismo exacto que
// subir-factura-compra-drive (cuenta de servicio, JWT firmado, carpetas
// encadenadas buscar-o-crear) — se duplica en vez de compartir código
// porque cada Edge Function de este proyecto se despliega como archivo
// autocontenido.
//
// Requiere los secretos:
//   GOOGLE_SERVICE_ACCOUNT_JSON  (el JSON completo de la cuenta de servicio)
//   DRIVE_ROOT_FOLDER_ID         (la Unidad compartida raíz — la misma que
//                                 usa subir-factura-compra-drive)
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ROOT_FOLDER_ID_DEFAULT = "1ITXE9qjXKDAEm-kOoTYnbc7QfeOYYLWY";

function base64UrlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64Url(obj: object): string {
  return base64UrlFromBytes(new TextEncoder().encode(JSON.stringify(obj)));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const clean = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey("pkcs8", bytes.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

async function tokenDeServicio(credJson: any): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  const claims = {
    iss: credJson.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: credJson.token_uri || "https://oauth2.googleapis.com/token",
    iat: ahora,
    exp: ahora + 3600,
  };
  const header = { alg: "RS256", typ: "JWT" };
  const unsigned = `${base64Url(header)}.${base64Url(claims)}`;
  const key = await importPrivateKey(credJson.private_key);
  const sigBuf = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64UrlFromBytes(new Uint8Array(sigBuf))}`;

  const res = await fetch(credJson.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error("No se pudo autenticar con Google: " + (await res.text()).slice(0, 400));
  const data = await res.json();
  return data.access_token;
}

// Busca una subcarpeta por nombre dentro de un padre dado; si no existe,
// la crea. Se encadena para armar VENTAS / OT. driveId siempre es el id
// de la Unidad compartida raíz (no el de la carpeta padre inmediata) —
// lo exige la API para buscar/crear dentro de una Unidad compartida.
async function buscarOCrearCarpeta(token: string, driveId: string, parentId: string, nombre: string): Promise<string> {
  const limpio = (nombre || "").trim() || "Sin nombre";
  const q = `'${parentId}' in parents and name = '${limpio.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const params = new URLSearchParams({
    q, fields: "files(id,name)",
    supportsAllDrives: "true", includeItemsFromAllDrives: "true",
    corpora: "drive", driveId,
  });
  const buscar = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const encontrado = await buscar.json();
  if (encontrado.files && encontrado.files.length) return encontrado.files[0].id;

  const crear = await fetch("https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: limpio, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!crear.ok) throw new Error(`No se pudo crear la carpeta "${limpio}": ` + (await crear.text()).slice(0, 400));
  const creado = await crear.json();
  return creado.id;
}


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
    const credRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!credRaw) throw new Error("Falta el secreto GOOGLE_SERVICE_ACCOUNT_JSON en este proyecto Supabase (Edge Functions > Secrets).");
    const cred = JSON.parse(credRaw);
    const rootId = Deno.env.get("DRIVE_ROOT_FOLDER_ID") || ROOT_FOLDER_ID_DEFAULT;

    const { pdfBase64, filename, ot } = await req.json();
    if (!pdfBase64) throw new Error("Falta pdfBase64 en la solicitud.");
    if (!filename) throw new Error("Falta filename en la solicitud.");

    const token = await tokenDeServicio(cred);
    const carpetaVentas = await buscarOCrearCarpeta(token, rootId, rootId, "VENTAS");
    const folderId = await buscarOCrearCarpeta(token, rootId, carpetaVentas, ot || "Sin OT");

    const pdfBytesBin = atob(pdfBase64);
    const pdfBytes = new Uint8Array(pdfBytesBin.length);
    for (let i = 0; i < pdfBytesBin.length; i++) pdfBytes[i] = pdfBytesBin.charCodeAt(i);

    const boundary = "serein-" + crypto.randomUUID();
    const metadata = { name: filename, parents: [folderId] };
    const parteMeta = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
    const parteArchivoInicio = `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`;
    const cierre = `\r\n--${boundary}--`;

    const enc = new TextEncoder();
    const cuerpo = new Uint8Array(enc.encode(parteMeta).length + enc.encode(parteArchivoInicio).length + pdfBytes.length + enc.encode(cierre).length);
    let offset = 0;
    for (const parte of [enc.encode(parteMeta), enc.encode(parteArchivoInicio), pdfBytes, enc.encode(cierre)]) {
      cuerpo.set(parte, offset); offset += parte.length;
    }

    const subida = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body: cuerpo,
    });
    if (!subida.ok) throw new Error("No se pudo subir el archivo a Drive: " + (await subida.text()).slice(0, 400));
    const resultado = await subida.json();

    return new Response(JSON.stringify({ ok: true, fileId: resultado.id, webViewLink: resultado.webViewLink }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("subir-factura-venta-drive error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
