// ============================================================
// SEREIN · Módulo Avance de Obra · correos del cliente
// Supabase Edge Function — avance-correo-entrante
// ============================================================
// La llama el MISMO script de Google (Apps Script) que ya alimenta a
// correos-ingresar, con los correos cuyos remitentes figuran en alguna OT del
// módulo de avance (ots.remitentes_cliente). Solo los guarda en
// avance.correos_entrantes (texto + adjuntos en el bucket privado «correos»,
// carpeta avance/); NO llama a la IA. La lectura con IA ocurre después,
// cuando alguien pulsa «Actualizar proyecto» (avance-actualizar).
//
// Protocolo: POST { ping:true } → prueba · POST { remitentes:true } → lista
// de remitentes a vigilar (para que el script filtre en Gmail) ·
// POST { mensajes:[{ id, buzon, de, para, asunto, fecha, cuerpo,
//   adjuntos:[{ nombre, mimeType, base64 }] }] } → guarda.
// Autorización igual que correos-ingresar: cabecera x-acceso-casilla con el
// token de Google del script (casillas de Serein) o x-correos-token.
// Desplegar con «Verify JWT» DESACTIVADO.
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correos-token, x-acceso-casilla",
};
const BUCKET = "correos";
const CASILLAS_PERMITIDAS = ["comercial@sereinspa.com", "administracion@sereinspa.com", "facturacion@sereinspa.com", "proyectos@sereinspa.com"];
const MAX_MENSAJES = 50;
const MAX_MB_ADJUNTO = 10;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function autorizado(req: Request): Promise<{ ok: boolean; quien?: string; error?: string }> {
  const secreta = (Deno.env.get("CORREOS_TOKEN") || "").trim();
  const enviada = (req.headers.get("x-correos-token") || "").trim();
  if (secreta && enviada && enviada === secreta) return { ok: true, quien: "clave" };
  const tk = (req.headers.get("x-acceso-casilla") || "").trim();
  if (!tk) return { ok: false, error: "Falta identificarse con la cuenta de Google." };
  const r = await fetch("https://oauth2.googleapis.com/tokeninfo?access_token=" + encodeURIComponent(tk));
  if (!r.ok) return { ok: false, error: "Google no reconoció el acceso. Vuelve a autorizar el script." };
  const info = await r.json();
  const email = String(info.email || "").toLowerCase();
  const verificado = info.email_verified === true || info.email_verified === "true";
  if (email && verificado && CASILLAS_PERMITIDAS.includes(email)) return { ok: true, quien: email };
  return { ok: false, error: "Esta casilla no está autorizada: " + (email || "sin correo") };
}
const correoDe = (s: string) => { const m = String(s || "").match(/<([^>]+)>/); return (m ? m[1] : String(s || "")).trim().toLowerCase(); };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const acceso = await autorizado(req);
  if (!acceso.ok) return json({ ok: false, error: acceso.error }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    const url = Deno.env.get("SUPABASE_URL") || "";
    const key = (Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
    if (!url || !key) throw new Error("No se encontró la llave de servicio de Supabase.");
    const h = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", "Accept-Profile": "avance", "Content-Profile": "avance" };
    if (body?.ping) return json({ ok: true, mensaje: "Conexión correcta: la función de correos de avance responde." });

    // OTs con remitentes: para asignar cada correo a su OT (y para que el script filtre)
    const r = await fetch(url + "/rest/v1/ots?select=id,codigo,remitentes_cliente", { headers: h });
    const ots: any[] = r.ok ? await r.json() : [];
    const porRemitente = new Map<string, string>();
    for (const o of ots) for (const rem of o.remitentes_cliente || []) porRemitente.set(String(rem).toLowerCase().trim(), o.id);
    if (body?.remitentes) return json({ ok: true, remitentes: [...porRemitente.keys()] });

    const mensajes = Array.isArray(body?.mensajes) ? body.mensajes.slice(0, MAX_MENSAJES) : [];
    const resultados: any[] = [];
    for (const m of mensajes) {
      const gmailId = String(m?.id || "").trim();
      if (!gmailId) { resultados.push({ id: null, estado: "sin_id" }); continue; }
      const de = correoDe(m.de);
      const otId = porRemitente.get(de) || [...porRemitente.entries()].find(([rem]) => de.endsWith("@" + rem.split("@")[1]) && rem.startsWith("*"))?.[1] || null;
      const adjuntos: any[] = [];
      for (const a of (Array.isArray(m.adjuntos) ? m.adjuntos : []).slice(0, 10)) {
        if (!a?.nombre) continue;
        const fila: any = { nombre: String(a.nombre).slice(0, 200), mime: a.mimeType || "application/octet-stream" };
        if (a.base64 && String(a.base64).length * 3 / 4 <= MAX_MB_ADJUNTO * 1024 * 1024) {
          const ruta = `avance/${gmailId}/${fila.nombre.replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ ]/g, "_")}`;
          const bin = Uint8Array.from(atob(String(a.base64)), c => c.charCodeAt(0));
          const up = await fetch(`${url}/storage/v1/object/${BUCKET}/${encodeURIComponent(ruta).replace(/%2F/g, "/")}`, { method: "POST", headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": fila.mime, "x-upsert": "true" }, body: bin });
          if (up.ok) fila.ruta = ruta;
        }
        adjuntos.push(fila);
      }
      const ins = await fetch(url + "/rest/v1/correos_entrantes?on_conflict=gmail_id", { method: "POST", headers: { ...h, Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ gmail_id: gmailId, ot_id: otId, buzon: m.buzon || acceso.quien || null, de: String(m.de || "").slice(0, 300), para: String(m.para || "").slice(0, 300), asunto: String(m.asunto || "").slice(0, 500), fecha: m.fecha || null, cuerpo: String(m.cuerpo || "").slice(0, 20000), adjuntos }) });
      if (!ins.ok) { resultados.push({ id: gmailId, estado: "error", error: (await ins.text()).slice(0, 200) }); continue; }
      const filas = await ins.json();
      resultados.push({ id: gmailId, estado: filas.length ? (otId ? "guardado" : "guardado_sin_ot") : "duplicado" });
    }
    return json({ ok: true, resultados });
  } catch (err) {
    console.error("avance-correo-entrante error:", err);
    return json({ ok: false, error: String((err as Error)?.message || err) });
  }
});
