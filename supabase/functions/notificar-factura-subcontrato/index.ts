// ============================================================
// SEREIN · Aviso por correo — factura de subcontratista pendiente
// Supabase Edge Function — notificar-factura-subcontrato
// ============================================================
// Se dispara desde src/SubcontratoApp.jsx justo despues de que un
// subcontratista sube una factura (insert exitoso en
// facturas_subcontrato) — "dispara y olvida", igual que
// enviar-alertas-vencimiento: si el correo falla, la factura ya quedo
// guardada igual, no se pierde nada.
//
// Requiere los mismos secretos que enviar-alertas-vencimiento
// (Edge Functions > Secrets), ya configurados:
//   RESEND_API_KEY, ALERTAS_EMAIL_FROM, ALERTAS_EMAIL_TO
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}


// ============================================================
// Autorización (auditoría 2026-10-27, hallazgo S-7/S-12)
// ============================================================
// Antes cualquiera que llegara a esta URL podía ejecutarla (y, en las de IA, gastar créditos). Ahora:
// 1) la petición debe traer la sesión del usuario (supabase.functions.invoke la manda sola),
// 2) el perfil de ese usuario tiene que estar en PERMITIDOS,
// 3) hay tope de archivos y tamaño por llamada, y 4) cada llamada a la IA queda anotada en ia_uso.
// Se responde con HTTP 200 y { ok: false, error } para que la app muestre el motivo tal cual.
const PERMITIDOS: string[] = ['gerencia', 'admin', 'comercial', 'proyectos', 'jefe', 'supervisor', 'subcontrato'];
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
    const apiKey = (Deno.env.get("RESEND_API_KEY") || "").trim();
    const from = (Deno.env.get("ALERTAS_EMAIL_FROM") || "").trim();
    const to = (Deno.env.get("ALERTAS_EMAIL_TO") || "").trim();
    if (!apiKey || !from || !to) {
      throw new Error(
        "Faltan secretos por configurar en este proyecto Supabase (Edge Functions > Secrets): " +
        [!apiKey && "RESEND_API_KEY", !from && "ALERTAS_EMAIL_FROM", !to && "ALERTAS_EMAIL_TO"].filter(Boolean).join(", ")
      );
    }

    const { subcontratista, ot, cc, proveedor, monto } = await req.json();

    const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#101828">
      <h2 style="color:#061A40">Nueva factura de subcontratista — Serein</h2>
      <p><b>${escapeHtml(subcontratista)}</b> subió una factura y está pendiente de tu revisión:</p>
      <table style="border-collapse:collapse;font-size:13px">
        <tr><td style="padding:4px 10px;color:#5a6b85">OT</td><td style="padding:4px 10px;font-weight:700">${escapeHtml(ot)}</td></tr>
        <tr><td style="padding:4px 10px;color:#5a6b85">Centro de costo</td><td style="padding:4px 10px;font-weight:700">${escapeHtml(cc)}</td></tr>
        <tr><td style="padding:4px 10px;color:#5a6b85">Proveedor</td><td style="padding:4px 10px">${escapeHtml(proveedor)}</td></tr>
        <tr><td style="padding:4px 10px;color:#5a6b85">Monto neto</td><td style="padding:4px 10px">${clp(monto)}</td></tr>
      </table>
      <p>Revísala y acéptala (o recházala) desde Módulo de Proyectos → Subcontratistas.</p>
    </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: to.split(",").map((s) => s.trim()).filter(Boolean),
        subject: `Nueva factura de ${subcontratista || "subcontratista"} pendiente de revisión`,
        html,
      }),
    });

    if (!res.ok) {
      const detalle = await res.text();
      throw new Error(`Resend respondió ${res.status}: ${detalle.slice(0, 500)}`);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("notificar-factura-subcontrato error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
