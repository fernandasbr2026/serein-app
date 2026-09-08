// ============================================================
// SEREIN · Envio de correo con alertas de vencimiento de lotes
// Supabase Edge Function — enviar-alertas-vencimiento
// ============================================================
// Recibe la lista de lotes vencidos/por vencer que ya calculo el modulo
// Trazabilidad y Alertas (fecha, OT, cliente, guia, dias restantes) y
// manda un correo resumen via Resend (https://resend.com). Se dispara a
// mano con el boton "Enviar alertas de vencimiento por correo" en ese
// modulo — todavia no hay un cron automatico diario (se puede agregar
// despues con pg_cron si se confirma que hace falta sin intervencion
// manual).
//
// Requiere 3 secretos en este proyecto Supabase (Edge Functions >
// Secrets), ninguno tiene un valor por defecto razonable asi que la
// funcion avisa con un error claro si falta alguno en vez de fallar
// en silencio:
//   RESEND_API_KEY     — API key de la cuenta de Resend.
//   ALERTAS_EMAIL_FROM — remitente, ej. "Alertas Serein <alertas@tudominio.cl>"
//                         (el dominio debe estar verificado en Resend).
//   ALERTAS_EMAIL_TO   — destinatario(s), separados por coma si son varios.
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Escapa cualquier campo antes de meterlo en el HTML del correo — vienen
// del navegador (numero de guia, cliente, etc.) y sin esto un valor con
// "<"/">" quedaria interpretado como markup en vez de mostrarse tal cual.
function escapeHtml(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function filaHtml(l: any) {
  const color = l.estado === "vencido" ? "#C5453D" : "#D9600A";
  const etiqueta = l.estado === "vencido" ? "VENCIDO" : "POR VENCER";
  const dias = Number.isFinite(Number(l.diasRestantes)) ? Number(l.diasRestantes) : 0;
  return `<tr>
    <td style="padding:6px 10px;border-bottom:1px solid #DFE4EA">${escapeHtml(l.ot)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #DFE4EA">${escapeHtml(l.cliente)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #DFE4EA">${l.numeroGuia ? escapeHtml(l.numeroGuia) : "—"}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #DFE4EA">${escapeHtml(l.vencimiento)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #DFE4EA;color:${color};font-weight:700">${etiqueta} (${dias} d.h.)</td>
  </tr>`;
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
        [!apiKey && "RESEND_API_KEY", !from && "ALERTAS_EMAIL_FROM", !to && "ALERTAS_EMAIL_TO"].filter(Boolean).join(", ") +
        ". Pide una API key en resend.com, verifica tu dominio de envio, y define el remitente y destinatario."
      );
    }

    const { lotes } = await req.json();
    if (!Array.isArray(lotes) || !lotes.length) throw new Error("No se recibió ningún lote para avisar.");

    const filas = lotes.map(filaHtml).join("");
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#101828">
      <h2 style="color:#061A40">Alertas de vencimiento — Serein</h2>
      <p>Estos lotes de piezas tienen su plazo comprometido vencido o por vencer:</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead><tr style="background:#061A40;color:#fff">
          <th style="padding:6px 10px;text-align:left">OT</th>
          <th style="padding:6px 10px;text-align:left">Cliente</th>
          <th style="padding:6px 10px;text-align:left">Guía</th>
          <th style="padding:6px 10px;text-align:left">Vencimiento</th>
          <th style="padding:6px 10px;text-align:left">Estado</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: to.split(",").map((s) => s.trim()).filter(Boolean),
        subject: `Alertas de vencimiento — ${lotes.length} lote(s)`,
        html,
      }),
    });

    if (!res.ok) {
      const detalle = await res.text();
      throw new Error(`Resend respondió ${res.status}: ${detalle.slice(0, 500)}`);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("enviar-alertas-vencimiento error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
