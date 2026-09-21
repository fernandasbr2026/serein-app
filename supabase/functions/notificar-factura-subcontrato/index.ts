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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
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
