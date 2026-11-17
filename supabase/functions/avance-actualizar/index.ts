// ============================================================
// SEREIN · Módulo Avance de Obra · «Actualizar proyecto»
// Supabase Edge Function — avance-actualizar
// ============================================================
// La llama la app (botón «Actualizar proyecto») con { ot_id }. Vuelve a leer
// la carpeta de Drive de la OT (archivos nuevos o modificados desde la última
// lectura) y los correos del cliente que llegaron a avance.correos_entrantes
// (los manda el script de Google a avance-correo-entrante), se los pasa a la
// IA junto con el estado actual de la OT y guarda PROPUESTAS en
// avance.propuestas. Nada se aplica: una persona confirma o descarta cada
// una en la app (avance.aplicar_propuesta).
//
// Reglas: la IA propone, el usuario confirma; nunca inventa; tope de
// archivos, tamaño y UNA llamada a la IA por ejecución; cada llamada queda
// en ia_uso. Si la carpeta de Drive no está compartida con la cuenta de
// servicio, lo dice con el correo exacto que hay que compartir.
//
// Secretos (los mismos de las otras funciones): ANTHROPIC_API_KEY,
// GOOGLE_SERVICE_ACCOUNT_JSON, SERVICE_ROLE_KEY (o SUPABASE_SERVICE_ROLE_KEY).
// Desplegar con «Verify JWT» activado (la app manda la sesión del usuario).
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MODEL = "claude-sonnet-5";
const MAX_ARCHIVOS = 6;            // archivos de Drive que se leen por ejecución
const MAX_MB_ARCHIVO = 8;          // tamaño máximo por archivo
const MAX_CORREOS = 12;            // correos por ejecución
const MAX_TOKENS_SALIDA = 4096;
const MIME_LEIBLES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const MIME_GOOGLE_TEXTO: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
};

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------- Google (cuenta de servicio, igual que subir-protocolo-drive) ----------
function b64url(bytes: Uint8Array) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function tokenDeServicio(cred: any): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  const enc = (o: object) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = enc({ alg: "RS256", typ: "JWT" }) + "." + enc({ iss: cred.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: cred.token_uri || "https://oauth2.googleapis.com/token", iat: ahora, exp: ahora + 3600 });
  const pem = String(cred.private_key).replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const bin = atob(pem); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const key = await crypto.subtle.importKey("pkcs8", bytes.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const r = await fetch(cred.token_uri || "https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + b64url(new Uint8Array(sig)) }) });
  if (!r.ok) throw new Error("No se pudo autenticar con Google: " + (await r.text()).slice(0, 300));
  return (await r.json()).access_token;
}
function idDeCarpeta(v: string): string {
  const s = String(v || "").trim();
  const m = s.match(/\/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : s;
}
type Archivo = { id: string; name: string; mimeType: string; modifiedTime: string; size?: string; webViewLink?: string; carpeta: string };
// Lista la carpeta y sus subcarpetas (2 niveles); devuelve solo lo modificado después de `desde`.
async function listarDrive(token: string, folderId: string, desde: string | null): Promise<{ archivos: Archivo[]; total: number }> {
  const salida: Archivo[] = []; let total = 0;
  const pendientes: { id: string; ruta: string; nivel: number }[] = [{ id: folderId, ruta: "", nivel: 0 }];
  while (pendientes.length) {
    const c = pendientes.shift()!;
    const q = `'${c.id}' in parents and trashed = false`;
    const p = new URLSearchParams({ q, fields: "files(id,name,mimeType,modifiedTime,size,webViewLink)", pageSize: "200", supportsAllDrives: "true", includeItemsFromAllDrives: "true", orderBy: "modifiedTime desc" });
    const r = await fetch("https://www.googleapis.com/drive/v3/files?" + p.toString(), { headers: { Authorization: "Bearer " + token } });
    if (r.status === 403 || r.status === 404) throw new Error("NO_COMPARTIDA");
    if (!r.ok) throw new Error("Drive respondió " + r.status + ": " + (await r.text()).slice(0, 200));
    const d = await r.json();
    for (const f of d.files || []) {
      if (f.mimeType === "application/vnd.google-apps.folder") { if (c.nivel < 2) pendientes.push({ id: f.id, ruta: (c.ruta ? c.ruta + " / " : "") + f.name, nivel: c.nivel + 1 }); continue; }
      total++;
      if (!desde || String(f.modifiedTime) > desde) salida.push({ ...f, carpeta: c.ruta || "(raíz)" });
    }
  }
  salida.sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)));
  return { archivos: salida, total };
}
async function descargarDrive(token: string, f: Archivo): Promise<{ base64?: string; texto?: string; mime: string } | null> {
  if (MIME_GOOGLE_TEXTO[f.mimeType]) {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}/export?mimeType=${encodeURIComponent(MIME_GOOGLE_TEXTO[f.mimeType])}`, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) return null;
    return { texto: (await r.text()).slice(0, 40000), mime: "text/plain" };
  }
  if (!MIME_LEIBLES.has(f.mimeType)) return null;
  if (Number(f.size || 0) > MAX_MB_ARCHIVO * 1024 * 1024) return null;
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) return null;
  const buf = new Uint8Array(await r.arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
  return { base64: btoa(s), mime: f.mimeType };
}

// ---------- Supabase (service role) ----------
const sb = () => {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = (Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  const h = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", "Accept-Profile": "avance", "Content-Profile": "avance" };
  return {
    url, key,
    async get(path: string) { const r = await fetch(url + "/rest/v1/" + path, { headers: h }); if (!r.ok) throw new Error("Supabase GET " + path + ": " + (await r.text()).slice(0, 200)); return r.json(); },
    async post(path: string, body: unknown, prefer = "return=minimal") { const r = await fetch(url + "/rest/v1/" + path, { method: "POST", headers: { ...h, Prefer: prefer }, body: JSON.stringify(body) }); if (!r.ok) throw new Error("Supabase POST " + path + ": " + (await r.text()).slice(0, 200)); return prefer.includes("representation") ? r.json() : null; },
    async patch(path: string, body: unknown) { const r = await fetch(url + "/rest/v1/" + path, { method: "PATCH", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error("Supabase PATCH " + path + ": " + (await r.text()).slice(0, 200)); },
    async publico(path: string) { const r = await fetch(url + "/rest/v1/" + path, { headers: { apikey: key, Authorization: "Bearer " + key } }); return r.ok ? r.json() : []; },
  };
};
async function autorizar(req: Request, otId: string) {
  const auth = (req.headers.get("Authorization") || "").trim();
  if (!/^Bearer\s+\S+/i.test(auth)) return { ok: false as const, error: "Debes iniciar sesión." };
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const u = await fetch(url + "/auth/v1/user", { headers: { Authorization: auth, apikey: anon } });
  if (!u.ok) return { ok: false as const, error: "Tu sesión no es válida o venció: vuelve a iniciar sesión." };
  const user = await u.json(); const uid = String(user?.id || "");
  const m = await sb().get(`miembros?select=rol&ot_id=eq.${otId}&user_id=eq.${uid}`);
  const rol = Array.isArray(m) && m[0] ? String(m[0].rol) : "";
  if (!["admin", "operador"].includes(rol)) return { ok: false as const, error: "No tienes acceso interno a esta OT." };
  return { ok: true as const, uid };
}
async function registrarUsoIA(uso: any, referencia: string, ok: boolean, error?: string) {
  try { const s = sb(); await fetch(s.url + "/rest/v1/ia_uso", { method: "POST", headers: { apikey: s.key, Authorization: "Bearer " + s.key, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ funcion: "avance-actualizar", modelo: MODEL, tokens_entrada: uso?.input_tokens ?? null, tokens_salida: uso?.output_tokens ?? null, tokens_cache_escritura: uso?.cache_creation_input_tokens ?? null, tokens_cache_lectura: uso?.cache_read_input_tokens ?? null, referencia, ok, error: error ? String(error).slice(0, 300) : null }) }); } catch (_e) { /* no interrumpe */ }
}

const PROMPT = `Eres el asistente de Gerencia de Proyectos de SEREIN Group (estructuras metálicas, granallado, pintura industrial e intumescente, Chile). Te paso el ESTADO ACTUAL de una obra (OT) y material NUEVO: archivos de su carpeta de Drive y correos del cliente. Tu trabajo es PROPONER qué registrar en el sistema. Una persona revisará cada propuesta: no inventes nada; si un dato no aparece, déjalo null. No repitas lo que ya está registrado (compara con el libro de obra, los documentos y los partes que te paso).

Responde SOLO un JSON (sin texto adicional ni markdown):
{"propuestas":[{"tipo":"evento"|"documento"|"avance"|"contrato"|"alerta","titulo":string,"detalle":string|null,"confianza":"alta"|"media"|"baja","origen":"drive"|"correo","referencia":string,"datos":object}]}

Reglas por tipo (el objeto "datos"):
- evento (libro de obra): {"tipo":"renov"|"det"|"com"|"pla"|"tra"|"ava","fecha":"YYYY-MM-DD","hasta":"YYYY-MM-DD"|null,"titulo":string,"detalle":string|null,"respaldo":string|null,"interno":false,"aprobacion":{"clase":string,"vence":"YYYY-MM-DD"|null}|null}
  · renov = recepción de PLANOS FINALES PARA FABRICAR (solo una vez por obra; si ya existe en el libro, no la propongas). · det = detención o paralización (con "hasta" si terminó). · com = comunicación relevante. · pla = planos o ingeniería recibidos/emitidos. · tra = transmittal. · ava = hito de avance (despachos, entregas, recepciones). · Si el documento pide respuesta o aprobación del cliente, llena "aprobacion" con el plazo si lo dice.
- documento: {"paso":"Contrato"|"Ingeniería"|"Calidad · dimensional"|"Calidad · pintura"|"Calidad · montaje"|"Calidad · intumescente"|"EDP"|"Comercial (interno)"|"Otro","titulo":string,"url":string|null,"descripcion":string|null,"interno":boolean} — un archivo nuevo de Drive relevante para la obra; usa su webViewLink como url. Lo comercial (cotizaciones, márgenes) va interno:true.
- avance: {"proceso":CODIGO,"fecha":"YYYY-MM-DD","cantidad":number,"zona":string|null,"detalle":string|null,"respaldo":string|null} — SOLO si el material trae una cantidad explícita ejecutada de un proceso (kg soldados, m² pintados, pedestales, % de ingeniería) en la unidad del proceso. Nunca estimes.
- contrato: {"plazo_dias":int|null,"fecha_inicio_contractual":"YYYY-MM-DD"|null,"kg_contrato":number|null,"precio_contrato":number|null,"suma_partidas":number|null,"anticipo":number|null,"retencion_pct":number(0-1)|null,"amortizacion":"total"|"proporcional"|null,"amortizacion_pct":number(0-1)|null,"multa_dia":number|null} — solo cuando un contrato o anexo fija o cambia esos valores y difieren de los actuales.
- alerta: {"titulo":string,"cuerpo":string|null,"nivel":"info"|"aviso"|"critico"} — algo que Gerencia debe saber y no calza en los otros tipos (reclamo, riesgo, cobro, plazo que vence).

"referencia" = id del archivo de Drive o id del correo del que sale la propuesta. Máximo 25 propuestas; prioriza las de confianza alta. Si no hay nada nuevo que proponer, devuelve {"propuestas":[]}.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  let lecturaId: string | null = null;
  const s = sb();
  try {
    const body = await req.json().catch(() => ({}));
    const otId = String(body?.ot_id || "");
    if (!otId) return json({ ok: false, error: "Falta ot_id." });
    const acceso = await autorizar(req, otId);
    if (!acceso.ok) return json({ ok: false, error: acceso.error });

    const [ot] = await s.get(`ots?select=*&id=eq.${otId}`);
    if (!ot) return json({ ok: false, error: "La OT no existe." });
    const lect = await s.post("lecturas", { ot_id: otId, por: acceso.uid }, "return=representation");
    lecturaId = lect?.[0]?.id || null;
    const desde: string | null = ot.ultima_lectura || null;

    // ---- contexto actual de la OT ----
    const [procesos, libro, documentos, partes, aprobaciones] = await Promise.all([
      s.get(`procesos?select=id,codigo,nombre,unidad,cantidad_total,avance,plan_inicio,plan_fin&ot_id=eq.${otId}&order=orden`),
      s.get(`libro_obra?select=fecha,hasta,tipo,titulo,detalle&ot_id=eq.${otId}&order=fecha.desc&limit=40`),
      s.get(`documentos?select=paso,titulo,url&ot_id=eq.${otId}`),
      s.get(`partes_diarios?select=fecha,cantidad,zona,proceso_id&ot_id=eq.${otId}&order=fecha.desc&limit=30`),
      s.get(`aprobaciones?select=clase,estado,vence,libro_obra!inner(ot_id,titulo)&libro_obra.ot_id=eq.${otId}`),
    ]);

    // ---- Drive ----
    const contenido: any[] = [];
    const avisos: string[] = [];
    let nArchivos = 0, totalDrive = 0;
    const credRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    let cuentaServicio = "";
    if (ot.drive_folder_id && credRaw) {
      try {
        const cred = JSON.parse(credRaw); cuentaServicio = cred.client_email || "";
        const token = await tokenDeServicio(cred);
        const { archivos, total } = await listarDrive(token, idDeCarpeta(ot.drive_folder_id), desde);
        totalDrive = total;
        const resumen = archivos.slice(0, 60).map(f => ({ id: f.id, nombre: f.name, carpeta: f.carpeta, tipo: f.mimeType, modificado: f.modifiedTime, url: f.webViewLink || null }));
        contenido.push({ type: "text", text: "ARCHIVOS NUEVOS O MODIFICADOS EN DRIVE (" + archivos.length + " de " + total + " en la carpeta):\n" + JSON.stringify(resumen) });
        for (const f of archivos.slice(0, MAX_ARCHIVOS)) {
          const d = await descargarDrive(token, f);
          if (!d) continue;
          nArchivos++;
          contenido.push({ type: "text", text: `--- Archivo de Drive id=${f.id} · ${f.name} (${f.carpeta}) ---` });
          if (d.texto) contenido.push({ type: "text", text: d.texto });
          else if (d.mime === "application/pdf") contenido.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: d.base64 } });
          else contenido.push({ type: "image", source: { type: "base64", media_type: d.mime, data: d.base64 } });
        }
        if (archivos.length > MAX_ARCHIVOS) avisos.push(`Había ${archivos.length} archivos nuevos; leí el contenido de los ${MAX_ARCHIVOS} más recientes y el nombre de los demás. Vuelve a actualizar para seguir.`);
      } catch (e) {
        const msg = String((e as Error)?.message || e);
        if (msg === "NO_COMPARTIDA") avisos.push(`No pude entrar a la carpeta de Drive. Compártela (al menos como Lector) con ${cuentaServicio || "la cuenta de servicio del ERP"} y vuelve a actualizar.`);
        else avisos.push("Drive: " + msg);
      }
    } else if (!ot.drive_folder_id) avisos.push("La OT no tiene carpeta de Drive configurada (Configuración → Fuentes).");
    else avisos.push("Falta el secreto GOOGLE_SERVICE_ACCOUNT_JSON en las funciones.");

    // ---- correos del cliente ----
    const remit = (ot.remitentes_cliente || []).map((x: string) => String(x).toLowerCase().trim()).filter(Boolean);
    let correos: any[] = [];
    try {
      correos = await s.get(`correos_entrantes?select=id,gmail_id,de,asunto,fecha,cuerpo,adjuntos&leido=eq.false&or=(ot_id.eq.${otId}${remit.length ? ",de.ilike.*" + remit.map((r: string) => r.replace(/[%*,()]/g, "")).join("*,de.ilike.*") + "*" : ""})&order=fecha.desc&limit=${MAX_CORREOS}`);
    } catch (_e) { correos = []; }
    // Correos con OC/cotización que ya procesó el módulo Correos (solo metadatos)
    let correosDocs: any[] = [];
    if (remit.length) {
      const f = remit.map((r: string) => "de.ilike.*" + r.replace(/[%*,()]/g, "") + "*").join(",");
      correosDocs = await s.publico(`correo_documentos?select=gmail_id,fecha_correo,de,asunto,tipo,numero_oc,total&or=(${f})${desde ? "&fecha_correo=gt." + encodeURIComponent(desde) : ""}&order=fecha_correo.desc&limit=10`);
    }
    if (correos.length) contenido.push({ type: "text", text: "CORREOS NUEVOS DEL CLIENTE:\n" + correos.map(c => `--- Correo id=${c.gmail_id} · ${c.fecha || ""} · De: ${c.de} · Asunto: ${c.asunto}\n${String(c.cuerpo || "").slice(0, 4000)}\nAdjuntos: ${(c.adjuntos || []).map((a: any) => a.nombre).join(", ") || "ninguno"}`).join("\n\n") });
    if (correosDocs.length) contenido.push({ type: "text", text: "CORREOS CON DOCUMENTOS COMERCIALES YA LEÍDOS POR EL MÓDULO CORREOS (solo referencia):\n" + JSON.stringify(correosDocs) });
    if (!remit.length) avisos.push("La OT no tiene remitentes del cliente configurados: no se leen correos.");

    const nuevo = nArchivos > 0 || correos.length > 0 || contenido.length > 0;
    let propuestas: any[] = [];
    let uso: any = null;
    if (nuevo) {
      const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
      if (!apiKey) throw new Error("Falta el secreto ANTHROPIC_API_KEY.");
      const codigoDe = Object.fromEntries(procesos.map((p: any) => [p.id, p.codigo]));
      const contexto = {
        ot: { codigo: ot.codigo, nombre: ot.nombre, cliente: ot.cliente, inicio_contractual: ot.fecha_inicio_contractual, plazo_dias: ot.plazo_dias, kg_contrato: ot.kg_contrato, precio_contrato: ot.precio_contrato, anticipo: ot.anticipo, retencion_pct: ot.retencion_pct, amortizacion: ot.amortizacion, multa_dia: ot.multa_dia, ultima_lectura: desde, hoy: new Date().toISOString().slice(0, 10) },
        procesos: procesos.map(({ id: _id, ...p }: any) => p), libro_obra: libro, documentos, aprobaciones_pendientes: aprobaciones.filter((a: any) => a.estado === "pend").map((a: any) => ({ clase: a.clase, vence: a.vence, evento: a.libro_obra?.titulo })),
        ultimos_partes: partes.map((p: any) => ({ fecha: p.fecha, cantidad: p.cantidad, zona: p.zona, proceso: codigoDe[p.proceso_id] || null })),
      };
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS_SALIDA, messages: [{ role: "user", content: [{ type: "text", text: "ESTADO ACTUAL DE LA OT:\n" + JSON.stringify(contexto) }, ...contenido, { type: "text", text: PROMPT }] }] }),
      });
      const data = await res.json().catch(() => ({}));
      uso = data?.usage || null;
      await registrarUsoIA(uso, otId, res.ok, res.ok ? undefined : JSON.stringify(data).slice(0, 200));
      if (!res.ok) throw new Error("La IA respondió " + res.status + ": " + JSON.stringify(data).slice(0, 300));
      const texto = (data.content || []).map((b: any) => b.text || "").join("").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
      let parsed: any; try { parsed = JSON.parse(texto); } catch (_e) { throw new Error("La IA no devolvió un JSON válido: " + texto.slice(0, 200)); }
      propuestas = Array.isArray(parsed?.propuestas) ? parsed.propuestas.slice(0, 25) : [];
    }

    const TIPOS = new Set(["evento", "documento", "avance", "contrato", "alerta"]);
    const filas = propuestas.filter(p => p && TIPOS.has(p.tipo) && p.titulo).map(p => ({
      ot_id: otId, origen: p.origen === "correo" ? "correo" : "drive", referencia: String(p.referencia || "").slice(0, 200), tipo: p.tipo,
      titulo: String(p.titulo).slice(0, 300), detalle: p.detalle ? String(p.detalle).slice(0, 2000) : null, confianza: ["alta", "media", "baja"].includes(p.confianza) ? p.confianza : "media",
      datos: p.datos && typeof p.datos === "object" ? p.datos : {},
    }));
    let insertadas = 0;
    if (filas.length) {
      const r = await fetch(s.url + "/rest/v1/propuestas?on_conflict=ot_id,origen,referencia,tipo,titulo", { method: "POST", headers: { apikey: s.key, Authorization: "Bearer " + s.key, "Content-Type": "application/json", "Content-Profile": "avance", Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(filas) });
      if (!r.ok) throw new Error("No pude guardar las propuestas: " + (await r.text()).slice(0, 200));
      insertadas = ((await r.json()) || []).length;
    }
    if (correos.length) await s.patch(`correos_entrantes?id=in.(${correos.map(c => c.id).join(",")})`, { leido: true, ot_id: otId });
    await s.patch(`ots?id=eq.${otId}`, { ultima_lectura: new Date().toISOString() });
    if (lecturaId) await s.patch(`lecturas?id=eq.${lecturaId}`, { fin: new Date().toISOString(), drive_archivos: nArchivos, correos: correos.length, propuestas: insertadas });

    return json({ ok: true, propuestas: insertadas, duplicadas: filas.length - insertadas, archivos_leidos: nArchivos, archivos_en_carpeta: totalDrive, correos: correos.length, avisos, tokens: uso ? { entrada: uso.input_tokens, salida: uso.output_tokens } : null });
  } catch (err) {
    console.error("avance-actualizar error:", err);
    const msg = String((err as Error)?.message || err);
    if (lecturaId) { try { await s.patch(`lecturas?id=eq.${lecturaId}`, { fin: new Date().toISOString(), error: msg.slice(0, 500) }); } catch (_e) { /* nada */ } }
    return json({ ok: false, error: msg });
  }
});
