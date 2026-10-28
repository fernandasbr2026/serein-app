// ============================================================
// SEREIN · Webhook de WhatsApp Business Cloud API (Meta)
// Supabase Edge Function — whatsapp-webhook
// ============================================================
// Recibe los mensajes entrantes de WhatsApp y los conecta al CRM:
// crea/actualiza el lead en `clientes` (matcheado por whatsapp_id)
// y registra cada mensaje como una fila en `crm_interacciones`
// (tipo='whatsapp', direccion='entrante').
//
// ESTA FUNCIÓN QUEDA LISTA PARA CONECTAR, PERO NO HACE NADA HASTA
// QUE COMPLETES ESTOS PASOS (los tiene que hacer la dueña del
// negocio/administradora — requieren verificación de identidad y
// de la empresa ante Meta, no se pueden automatizar):
//
//   1) Crear una cuenta de WhatsApp Business API con Meta:
//      https://business.facebook.com -> WhatsApp -> Comenzar.
//      Requiere verificar la empresa (RUT, documentos) — puede
//      tomar de días a semanas.
//   2) En el panel de Meta for Developers, crear una app tipo
//      "Business", agregar el producto "WhatsApp", y conseguir:
//        - el número de teléfono de WhatsApp Business (Phone Number ID)
//        - un token de acceso permanente (System User token)
//   3) Cargar DOS secretos en este proyecto Supabase (Edge Functions > Secrets):
//        - WHATSAPP_VERIFY_TOKEN: una palabra clave que tú inventes; Meta la usa
//          solo para verificar que este webhook es tuyo.
//        - WHATSAPP_APP_SECRET: el «App Secret» de tu app en Meta for Developers
//          (Configuración > Básica). Con él se comprueba la firma X-Hub-Signature-256
//          de cada mensaje: sin esa firma válida, el webhook no acepta nada
//          (auditoría 2026-10-27, hallazgo S-11: antes cualquiera que conociera
//          la URL podía inventar clientes e interacciones en el CRM).
//      (SUPABASE_SERVICE_ROLE_KEY ya está disponible automáticamente
//      en toda Edge Function de este proyecto, no hace falta cargarla.)
//   4) Desplegar:  supabase functions deploy whatsapp-webhook
//   5) En Meta for Developers > tu app > WhatsApp > Configuration,
//      pegar como "Callback URL" la URL de esta función
//      (https://fyupirswsvojdswpzvjm.supabase.co/functions/v1/whatsapp-webhook)
//      y como "Verify token" el mismo valor de WHATSAPP_VERIFY_TOKEN.
//      Suscribirse al campo "messages".
//
// Una vez hecho esto, cada mensaje de WhatsApp que te escriban va a
// aparecer solo en el CRM, como un lead nuevo (o una interacción
// más si el número ya existe) — sin tocar nada de este código.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Firma de Meta: HMAC-SHA256 del cuerpo crudo con el App Secret, enviada como
// «sha256=<hex>» en X-Hub-Signature-256. Comparación en tiempo constante.
async function firmaValida(cuerpo: string, cabecera: string | null): Promise<boolean> {
  const secreto = (Deno.env.get("WHATSAPP_APP_SECRET") || "").trim();
  if (!secreto || !cabecera) return false;
  const recibida = cabecera.trim().toLowerCase().replace(/^sha256=/, "");
  if (!/^[0-9a-f]{64}$/.test(recibida)) return false;
  const enc = new TextEncoder();
  const clave = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", clave, enc.encode(cuerpo)));
  const esperada = Array.from(firma).map((b) => b.toString(16).padStart(2, "0")).join("");
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= esperada.charCodeAt(i) ^ recibida.charCodeAt(i);
  return diff === 0;
}

function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL") ?? "https://fyupirswsvojdswpzvjm.supabase.co";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY (Supabase la inyecta automáticamente en Edge Functions).");
  return createClient(url, key);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Paso de verificación que hace Meta al configurar el webhook.
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    if (mode === "subscribe" && expected && token === expected) {
      return new Response(challenge ?? "", { status: 200, headers: CORS });
    }
    return new Response("Verificación fallida", { status: 403, headers: CORS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  // Sin firma válida de Meta no se toca la base. Si falta WHATSAPP_APP_SECRET el
  // webhook queda cerrado (mejor que abierto): se avisa en los logs.
  const cuerpoCrudo = await req.text();
  if (!(await firmaValida(cuerpoCrudo, req.headers.get("X-Hub-Signature-256")))) {
    if (!Deno.env.get("WHATSAPP_APP_SECRET")) console.error("whatsapp-webhook: falta el secreto WHATSAPP_APP_SECRET; se rechaza la petición.");
    return new Response(JSON.stringify({ ok: false, error: "Firma inválida" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  try {
    const body = JSON.parse(cuerpoCrudo || "{}");
    const supabase = supabaseAdmin();

    // Formato del webhook de WhatsApp Cloud API:
    // body.entry[].changes[].value.{contacts[], messages[]}
    const entradas = body?.entry ?? [];
    let procesados = 0;

    for (const entrada of entradas) {
      for (const cambio of entrada.changes ?? []) {
        const valor = cambio.value ?? {};
        const contactos = valor.contacts ?? [];
        const mensajes = valor.messages ?? [];

        for (const msg of mensajes) {
          const whatsappId = "+" + String(msg.from ?? "").replace(/\D/g, "");
          const contacto = contactos.find((c: any) => c.wa_id === msg.from);
          const nombre = contacto?.profile?.name || whatsappId;
          const texto = msg.text?.body ?? (msg.type ? `[${msg.type}]` : "");

          // 1) Busca el lead/cliente por whatsapp_id; si no existe, lo crea como Lead nuevo.
          const { data: existente } = await supabase
            .from("clientes").select("id").eq("whatsapp_id", whatsappId).maybeSingle();

          let clienteId = existente?.id;
          if (!clienteId) {
            const { data: creado, error: errCrear } = await supabase
              .from("clientes")
              .insert({ nombre, whatsapp_id: whatsappId, telefono: whatsappId, origen: "WhatsApp", etapa: "Lead nuevo" })
              .select("id").single();
            if (errCrear) throw errCrear;
            clienteId = creado.id;
          }

          // 2) Registra el mensaje como interacción (whatsapp_message_id evita duplicados
          //    si Meta reenvía el mismo evento).
          await supabase.from("crm_interacciones").insert({
            cliente_id: clienteId,
            tipo: "whatsapp",
            direccion: "entrante",
            texto,
            whatsapp_message_id: msg.id,
            fecha: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString(),
          }).select().maybeSingle(); // sin .single() para no fallar si whatsapp_message_id ya existe (unique)

          procesados++;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, procesados }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("whatsapp-webhook error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
