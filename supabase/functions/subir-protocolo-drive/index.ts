// ============================================================
// SEREIN · Subida automática de protocolos cerrados a Google Drive
// Supabase Edge Function — subir-protocolo-drive
// ============================================================
// Recibe el PDF ya armado de un protocolo (generado en el navegador con
// jsPDF/html-to-image, ver src/protocolo-pdf.js) como base64, y lo sube
// a la carpeta de Drive de SEREIN, organizada por cliente: crea (o
// reutiliza) una subcarpeta con el nombre del cliente dentro de la
// carpeta raiz, y sube el archivo ahi.
//
// Autenticacion: cuenta de servicio de Google Cloud (JWT firmado con su
// clave privada, cambiado por un access token OAuth2) — no requiere que
// nadie inicie sesion en Google, la cuenta de servicio ya tiene permiso
// de Editor sobre la carpeta (se le compartio a mano una vez).
//
// Requiere los secretos:
//   GOOGLE_SERVICE_ACCOUNT_JSON  (el JSON completo de la cuenta de servicio)
//   DRIVE_ROOT_FOLDER_ID         (opcional — si no esta, usa el ID de abajo)
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Carpeta "PROTOCOLOS SEREIN GROUP" en Drive, compartida como Editor con
// la cuenta de servicio erp-protocolos-drive@serein-erp-drive.iam.gserviceaccount.com
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

// Cambia la cuenta de servicio por un access token OAuth2 de corta
// duracion (1 hora) — se pide uno nuevo en cada invocacion, mas simple
// que cachear y suficiente para el volumen de protocolos que se cierran.
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

// Busca la subcarpeta del cliente dentro de la raiz; si no existe, la crea.
// La raiz es una Unidad compartida (Shared Drive) — las cuentas de servicio
// no tienen cuota propia para escribir en una carpeta normal de "Mi unidad"
// (Google lo rechaza con 403), asi que TODAS las llamadas necesitan
// supportsAllDrives=true (y las de busqueda ademas
// includeItemsFromAllDrives + corpora=drive + driveId) para que la API
// funcione dentro de una unidad compartida.
async function carpetaDelCliente(token: string, rootId: string, cliente: string): Promise<string> {
  const nombre = (cliente || "Sin cliente").trim() || "Sin cliente";
  const q = `'${rootId}' in parents and name = '${nombre.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const params = new URLSearchParams({
    q, fields: "files(id,name)",
    supportsAllDrives: "true", includeItemsFromAllDrives: "true",
    corpora: "drive", driveId: rootId,
  });
  const buscar = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const encontrado = await buscar.json();
  if (encontrado.files && encontrado.files.length) return encontrado.files[0].id;

  const crear = await fetch("https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: nombre, mimeType: "application/vnd.google-apps.folder", parents: [rootId] }),
  });
  if (!crear.ok) throw new Error("No se pudo crear la carpeta del cliente: " + (await crear.text()).slice(0, 400));
  const creado = await crear.json();
  return creado.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  try {
    const credRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!credRaw) throw new Error("Falta el secreto GOOGLE_SERVICE_ACCOUNT_JSON en este proyecto Supabase (Edge Functions > Secrets).");
    const cred = JSON.parse(credRaw);
    const rootId = Deno.env.get("DRIVE_ROOT_FOLDER_ID") || ROOT_FOLDER_ID_DEFAULT;

    const { pdfBase64, filename, cliente } = await req.json();
    if (!pdfBase64) throw new Error("Falta pdfBase64 en la solicitud.");
    if (!filename) throw new Error("Falta filename en la solicitud.");

    const token = await tokenDeServicio(cred);
    const folderId = await carpetaDelCliente(token, rootId, cliente);

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
    console.error("subir-protocolo-drive error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
