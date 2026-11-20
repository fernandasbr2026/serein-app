// ============================================================
// SEREIN · Módulo Avance de Obra · avisos por correo
// Supabase Edge Function — avance-alertas-correo
// ============================================================
// Cierra la regla de avisos del paquete de Gerencia: rechazo o comentario
// del cliente → alerta + correo inmediato; aprobación → solo alerta; plazo de
// respuesta vencido → una alerta por día. Esta función:
//   1) crea la alerta diaria por cada aprobación pendiente ya vencida,
//   2) manda por correo (Resend, mismos secretos que enviar-alertas-vencimiento)
//      las alertas de nivel crítico o aviso que aún no se enviaron, agrupadas
//      por OT, y las marca como enviadas.
// La llama el cron de la base cada hora (pg_cron + pg_net con la clave de
// servicio, como respaldo-diario) y también el botón «Enviar avisos ahora» de
// la app (con la sesión de un usuario interno de la OT).
// Secretos: RESEND_API_KEY, ALERTAS_EMAIL_FROM, ALERTAS_EMAIL_TO,
// SERVICE_ROLE_KEY (o SUPABASE_SERVICE_ROLE_KEY). Desplegar con «Verify JWT» activado.
// ============================================================
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const url = () => Deno.env.get("SUPABASE_URL") || "";
const srv = () => (Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
const H = { get h() { return { apikey: srv(), Authorization: "Bearer " + srv(), "Content-Type": "application/json", "Accept-Profile": "avance", "Content-Profile": "avance" }; } };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const fmtF = (s: string | null) => { if (!s) return "—"; const [y, m, d] = String(s).slice(0, 10).split("-"); return d + "-" + m + "-" + y; };
// Fecha de hoy en Chile (UTC-3 en verano / UTC-4 en invierno): se toma UTC-3, suficiente para «vencido ayer o antes».
const hoyChile = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

async function get(path: string) { const r = await fetch(url() + "/rest/v1/" + path, { headers: H.h }); if (!r.ok) throw new Error("GET " + path + ": " + (await r.text()).slice(0, 200)); return r.json(); }
async function post(path: string, body: unknown) { const r = await fetch(url() + "/rest/v1/" + path, { method: "POST", headers: { ...H.h, Prefer: "return=minimal" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error("POST " + path + ": " + (await r.text()).slice(0, 200)); }
async function patch(path: string, body: unknown) { const r = await fetch(url() + "/rest/v1/" + path, { method: "PATCH", headers: { ...H.h, Prefer: "return=minimal" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error("PATCH " + path + ": " + (await r.text()).slice(0, 200)); }

// Acepta la clave de servicio (cron) o la sesión de un usuario interno.
async function autorizar(req: Request): Promise<{ ok: true; quien: string } | { ok: false; error: string }> {
  const auth = (req.headers.get("Authorization") || "").trim();
  const tk = auth.replace(/^Bearer\s+/i, "");
  if (!tk) return { ok: false, error: "Falta la autorización." };
  // El cron manda la clave service_role del Vault; puede ser la legacy (JWT) o la nueva (sb_secret): se aceptan ambas.
  const clavesServicio = [Deno.env.get("SERVICE_ROLE_KEY"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")].map((s) => (s || "").trim()).filter(Boolean);
  if (clavesServicio.includes(tk)) return { ok: true, quien: "cron" };
  // La pasarela ya verificó la firma del JWT («Verify JWT» activado): basta con mirar el rol que declara.
  try { const p = tk.split(".")[1]; if (p) { const j = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))); if (j && j.role === "service_role") return { ok: true, quien: "cron" }; } } catch (_e) { /* no es JWT: sigue como sesión */ }
  const u = await fetch(url() + "/auth/v1/user", { headers: { Authorization: auth, apikey: (Deno.env.get("SUPABASE_ANON_KEY") || "").trim() } });
  if (!u.ok) return { ok: false, error: "Tu sesión no es válida o venció." };
  const uid = String((await u.json())?.id || "");
  const m = await get(`miembros?select=rol&user_id=eq.${uid}&rol=in.(admin,operador)&limit=1`);
  if (!m.length) return { ok: false, error: "Solo el equipo interno puede enviar avisos." };
  return { ok: true, quien: uid };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  try {
    const acceso = await autorizar(req);
    if (!acceso.ok) return json({ ok: false, error: acceso.error });
    const hoy = hoyChile();

    // 1) Alertas diarias por aprobaciones vencidas
    const vencidas = await get(`aprobaciones?select=id,clase,vence,libro_obra!inner(ot_id,titulo)&estado=eq.pend&vence=lt.${hoy}`);
    let creadas = 0;
    for (const a of vencidas) {
      const dias = Math.round((new Date(hoy).getTime() - new Date(a.vence).getTime()) / 864e5);
      const titulo = `Respuesta del cliente vencida: ${a.libro_obra.titulo} (${dias} día${dias === 1 ? "" : "s"} de atraso)`;
      const ya = await get(`alertas?select=id&ot_id=eq.${a.libro_obra.ot_id}&titulo=eq.${encodeURIComponent(titulo)}&creado_en=gte.${hoy}T00:00:00Z&limit=1`);
      if (ya.length) continue;
      await post("alertas", { ot_id: a.libro_obra.ot_id, titulo, cuerpo: `${a.clase} · plazo de respuesta ${fmtF(a.vence)}. Los días se suman a «espera del cliente».`, nivel: "aviso" });
      creadas++;
    }

    // 2) Correo con las alertas pendientes (crítico y aviso), una por OT
    const pendientes = await get(`alertas?select=id,ot_id,titulo,cuerpo,nivel,creado_en&correo_enviado=eq.false&order=creado_en`);
    const info = pendientes.filter((x: any) => x.nivel === "info");
    const porEnviar = pendientes.filter((x: any) => x.nivel !== "info");
    if (info.length) await patch(`alertas?id=in.(${info.map((x: any) => x.id).join(",")})`, { correo_enviado: true });

    const apiKey = (Deno.env.get("RESEND_API_KEY") || "").trim();
    const from = (Deno.env.get("ALERTAS_EMAIL_FROM") || "").trim();
    const to = (Deno.env.get("ALERTAS_EMAIL_TO") || "").trim();
    let correos = 0, enviadas = 0;
    const errores: string[] = [];
    if (porEnviar.length) {
      if (!apiKey || !from || !to) return json({ ok: false, creadas, error: "Faltan los secretos RESEND_API_KEY, ALERTAS_EMAIL_FROM o ALERTAS_EMAIL_TO en las funciones: las alertas quedaron en la app pero no se pudo mandar el correo." });
      const otIds = [...new Set(porEnviar.map((x: any) => x.ot_id))];
      const ots = await get(`ots?select=id,codigo,nombre,cliente&id=in.(${otIds.join(",")})`);
      for (const ot of ots) {
        const mias = porEnviar.filter((x: any) => x.ot_id === ot.id);
        const criticas = mias.filter((x: any) => x.nivel === "critico").length;
        const filas = mias.map((x: any) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #DFE4EA;color:${x.nivel === "critico" ? "#C5453D" : "#B7791F"};font-weight:700">${x.nivel === "critico" ? "CRÍTICO" : "AVISO"}</td><td style="padding:6px 10px;border-bottom:1px solid #DFE4EA"><b>${esc(x.titulo)}</b>${x.cuerpo ? "<br><span style=\"color:#5A636E\">" + esc(x.cuerpo) + "</span>" : ""}</td><td style="padding:6px 10px;border-bottom:1px solid #DFE4EA;color:#9AA3AD;white-space:nowrap">${esc(new Date(x.creado_en).toLocaleString("es-CL", { timeZone: "America/Santiago" }))}</td></tr>`).join("");
        const html = `<div style="font-family:Inter,Arial,sans-serif;color:#191C20;max-width:720px"><div style="border-bottom:3px solid #F77716;padding-bottom:8px;margin-bottom:12px"><div style="font-size:11px;letter-spacing:.08em;color:#5A636E">SEREIN · AVANCE DE OBRA</div><div style="font-size:18px;font-weight:800">${esc(ot.codigo)} · ${esc(ot.nombre)}</div><div style="font-size:12px;color:#5A636E">${esc(ot.cliente || "")}</div></div><p style="font-size:13px">${mias.length} aviso${mias.length === 1 ? "" : "s"} nuevo${mias.length === 1 ? "" : "s"}${criticas ? ", <b style=\"color:#C5453D\">" + criticas + " crítico" + (criticas === 1 ? "" : "s") + "</b>" : ""}:</p><table style="border-collapse:collapse;width:100%;font-size:13px"><tbody>${filas}</tbody></table><p style="font-size:12px;color:#9AA3AD;margin-top:14px">Entra a app.sereinspa.com → Avance de obra → ${esc(ot.codigo)} para ver el detalle y responder. Este correo lo genera el ERP; no responder.</p></div>`;
        const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: to.split(",").map(s => s.trim()).filter(Boolean), subject: `[${ot.codigo}] ${criticas ? "CRÍTICO · " : ""}${mias.length} aviso${mias.length === 1 ? "" : "s"} de avance de obra`, html }) });
        if (!res.ok) { errores.push(ot.codigo + ": Resend " + res.status + " " + (await res.text()).slice(0, 150)); continue; }
        await patch(`alertas?id=in.(${mias.map((x: any) => x.id).join(",")})`, { correo_enviado: true });
        correos++; enviadas += mias.length;
      }
    }
    return json({ ok: errores.length === 0, creadas, correos, enviadas, sin_correo: info.length, errores, quien: acceso.quien });
  } catch (err) {
    console.error("avance-alertas-correo error:", err);
    return json({ ok: false, error: String((err as Error)?.message || err) });
  }
});
