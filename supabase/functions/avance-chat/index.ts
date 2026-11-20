// ============================================================
// SEREIN · Módulo Avance de Obra · chat maestro
// Supabase Edge Function — avance-chat
// ============================================================
// Responde preguntas sobre una OT con los datos reales del módulo (contrato,
// procesos, libro de obra, aprobaciones, partes, alertas, documentos, EDP,
// propuestas pendientes). Cuando la persona pide un CAMBIO (registrar un
// evento, un avance, un documento, una alerta), la IA no lo aplica: deja una
// PROPUESTA en avance.propuestas (origen 'ia') para que se confirme en la
// pestaña Propuestas. Regla de siempre: la IA propone, el usuario confirma.
//
// Dos modos: interno (admin/operador: todos los datos) y cliente (rol
// 'cliente': solo lo publicado y no interno; plazos, precios y adicionales
// se derivan a SEREIN). Una llamada a la IA por mensaje, anotada en ia_uso.
// Secretos: ANTHROPIC_API_KEY, SERVICE_ROLE_KEY. «Verify JWT» activado.
// ============================================================
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1800;
const MAX_HISTORIAL = 12;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const url = () => Deno.env.get("SUPABASE_URL") || "";
const srv = () => (Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
const H = () => ({ apikey: srv(), Authorization: "Bearer " + srv(), "Content-Type": "application/json", "Accept-Profile": "avance", "Content-Profile": "avance" });
async function get(path: string) { const r = await fetch(url() + "/rest/v1/" + path, { headers: H() }); if (!r.ok) throw new Error("GET " + path + ": " + (await r.text()).slice(0, 200)); return r.json(); }

async function autorizar(req: Request, otId: string) {
  const auth = (req.headers.get("Authorization") || "").trim();
  if (!/^Bearer\s+\S+/i.test(auth)) return { ok: false as const, error: "Debes iniciar sesión." };
  const u = await fetch(url() + "/auth/v1/user", { headers: { Authorization: auth, apikey: (Deno.env.get("SUPABASE_ANON_KEY") || "").trim() } });
  if (!u.ok) return { ok: false as const, error: "Tu sesión no es válida o venció." };
  const uid = String((await u.json())?.id || "");
  const m = await get(`miembros?select=rol,usuario&ot_id=eq.${otId}&user_id=eq.${uid}`);
  const rol = m[0]?.rol as string | undefined;
  if (!rol) return { ok: false as const, error: "No tienes acceso a esta OT." };
  return { ok: true as const, uid, rol, usuario: m[0].usuario as string };
}
async function registrarUsoIA(uso: any, referencia: string, ok: boolean, error?: string) {
  try { await fetch(url() + "/rest/v1/ia_uso", { method: "POST", headers: { apikey: srv(), Authorization: "Bearer " + srv(), "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ funcion: "avance-chat", modelo: MODEL, tokens_entrada: uso?.input_tokens ?? null, tokens_salida: uso?.output_tokens ?? null, tokens_cache_escritura: uso?.cache_creation_input_tokens ?? null, tokens_cache_lectura: uso?.cache_read_input_tokens ?? null, referencia, ok, error: error ? String(error).slice(0, 300) : null }) }); } catch (_e) { /* no interrumpe */ }
}

const PROMPT_INTERNO = `Eres el CHAT MAESTRO del Módulo Avance de Obra de SEREIN Group (estructuras metálicas, granallado, pintura industrial e intumescente, Chile). Hablas con el equipo interno (Gerencia de Proyectos, administración). Te paso el ESTADO COMPLETO de una OT en JSON y la conversación.

Cómo respondes:
- En español de Chile, directo y breve. Usa cifras exactas del estado (fechas DD-MM-AAAA, pesos con separador de miles, porcentajes con una decimal). Nunca inventes: si algo no está en los datos, dilo.
- Reglas del módulo: el avance físico pondera cada proceso por su duración; el plazo vigente parte en el inicio contractual, se renueva UNA sola vez con «planos finales para fabricar» y las detenciones suman días al término; el EDP sale del avance por partida con amortización del anticipo y retención; la espera del cliente son los días de aprobaciones vencidas.
- Si te piden REGISTRAR o CAMBIAR algo (un evento del libro, un avance, un documento, un dato del contrato, una alerta), NO digas que lo hiciste: propónlo. Termina tu respuesta con un bloque JSON en una línea, exactamente así:
  PROPUESTAS: {"propuestas":[{"tipo":"evento"|"documento"|"avance"|"contrato"|"alerta","titulo":string,"detalle":string|null,"confianza":"alta"|"media"|"baja","datos":object}]}
  con los mismos formatos de "datos" que usa el sistema: evento {"tipo":"renov"|"det"|"com"|"pla"|"tra"|"ava","fecha":"YYYY-MM-DD","hasta":"YYYY-MM-DD"|null,"titulo":string,"detalle":string|null,"respaldo":string|null,"interno":boolean,"aprobacion":{"clase":string,"vence":"YYYY-MM-DD"|null}|null}; documento {"paso":string,"titulo":string,"url":string|null,"descripcion":string|null,"interno":boolean}; avance {"proceso":CODIGO,"fecha":"YYYY-MM-DD","cantidad":number,"zona":string|null,"detalle":string|null,"respaldo":string|null}; contrato {campo:valor…}; alerta {"titulo":string,"cuerpo":string|null,"nivel":"info"|"aviso"|"critico"}.
  Si no hay nada que proponer, no incluyas el bloque. Nunca propongas un segundo evento "renov" si ya existe uno.
- Puedes hacer cálculos (días de atraso, multa, neto de EDP) mostrando la cuenta en una línea.`;

const PROMPT_CLIENTE = `Eres el asistente del portal de obra de SEREIN Group para el CLIENTE. Te paso solo la información PUBLICADA de su obra. Responde en español de Chile, breve y cordial, únicamente con esos datos (avance por proceso, término vigente, eventos del libro de obra publicados, documentos publicados, estados de pago presentados). No inventes nada. Si preguntan por plazos contractuales, precios, adicionales, multas, descuentos o cualquier tema comercial o legal, responde que esos temas los ve directamente el equipo de SEREIN y sugiere escribirles. Nunca propongas cambios ni incluyas bloques JSON.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const otId = String(body?.ot_id || "");
    const pregunta = String(body?.pregunta || "").trim().slice(0, 4000);
    const historial = Array.isArray(body?.historial) ? body.historial.slice(-MAX_HISTORIAL) : [];
    if (!otId || !pregunta) return json({ ok: false, error: "Falta la OT o la pregunta." });
    const acceso = await autorizar(req, otId);
    if (!acceso.ok) return json({ ok: false, error: acceso.error });
    const cliente = acceso.rol === "cliente";

    const [ot] = await get(`ots?select=*&id=eq.${otId}`);
    if (!ot) return json({ ok: false, error: "La OT no existe." });
    if (cliente && !ot.portal_publicado) return json({ ok: false, error: "Esta obra todavía no está publicada." });
    const [procesos, libro, documentos, partes, aprobaciones, alertas, edp, propuestas, liberaciones] = await Promise.all([
      get(`procesos?select=codigo,nombre,unidad,cantidad_total,avance,duracion_sem,peso_edp,partida,plan_inicio,plan_fin,predecesor,visible_cliente&ot_id=eq.${otId}&order=orden`),
      get(`libro_obra?select=fecha,hasta,tipo,titulo,detalle,respaldo,interno&ot_id=eq.${otId}&order=fecha.desc&limit=60`),
      get(`documentos?select=paso,titulo,url,descripcion,interno&ot_id=eq.${otId}`),
      cliente ? Promise.resolve([]) : get(`partes_diarios?select=fecha,cantidad,zona,detalle,responsable,n_parte,proceso_id&ot_id=eq.${otId}&order=fecha.desc&limit=40`),
      get(`aprobaciones?select=clase,estado,vence,libro_obra!inner(ot_id,titulo,fecha,interno)&libro_obra.ot_id=eq.${otId}`),
      cliente ? Promise.resolve([]) : get(`alertas?select=titulo,cuerpo,nivel,leida,creado_en&ot_id=eq.${otId}&order=creado_en.desc&limit=25`),
      get(`edp?select=numero,fecha,bruto_acumulado,periodo,amortizacion,retencion,neto,estado&ot_id=eq.${otId}&order=numero`),
      cliente ? Promise.resolve([]) : get(`propuestas?select=tipo,titulo,detalle,confianza,origen&ot_id=eq.${otId}&estado=eq.pend`),
      cliente ? Promise.resolve([]) : get(`liberaciones?select=tipo,estado,motivo,procesos!inner(ot_id,codigo)&procesos.ot_id=eq.${otId}`),
    ]);
    const codigoDe = Object.fromEntries((await get(`procesos?select=id,codigo&ot_id=eq.${otId}`)).map((p: any) => [p.id, p.codigo]));
    const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const estado: any = cliente ? {
      hoy, ot: { codigo: ot.codigo, nombre: ot.nombre, cliente: ot.cliente, inicio_contractual: ot.fecha_inicio_contractual, plazo_dias: ot.plazo_dias },
      procesos: procesos.filter((p: any) => p.visible_cliente !== false).map((p: any) => ({ codigo: p.codigo, nombre: p.nombre, avance: p.avance, plan_inicio: p.plan_inicio, plan_fin: p.plan_fin })),
      libro_obra: libro.filter((e: any) => !e.interno).map(({ interno: _i, respaldo: _r, ...e }: any) => e),
      documentos: documentos.filter((d: any) => !d.interno),
      aprobaciones_pendientes: aprobaciones.filter((a: any) => a.estado === "pend" && !a.libro_obra.interno).map((a: any) => ({ clase: a.clase, vence: a.vence, evento: a.libro_obra.titulo })),
      edp: edp.filter((e: any) => e.estado !== "borrador").map((e: any) => ({ numero: e.numero, fecha: e.fecha, estado: e.estado })),
    } : {
      hoy, ot: { ...ot, drive_folder_id: ot.drive_folder_id ? "configurada" : null }, procesos, liberaciones: liberaciones.map((l: any) => ({ proceso: l.procesos.codigo, tipo: l.tipo, estado: l.estado, motivo: l.motivo })),
      libro_obra: libro, aprobaciones: aprobaciones.map((a: any) => ({ clase: a.clase, estado: a.estado, vence: a.vence, evento: a.libro_obra.titulo, fecha_evento: a.libro_obra.fecha })),
      partes: partes.map((p: any) => ({ ...p, proceso: codigoDe[p.proceso_id] || null, proceso_id: undefined })), alertas, documentos, edp, propuestas_pendientes: propuestas,
    };

    const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
    if (!apiKey) throw new Error("Falta el secreto ANTHROPIC_API_KEY.");
    const mensajes = [
      ...historial.filter((m: any) => m && (m.rol === "user" || m.rol === "assistant") && m.texto).map((m: any) => ({ role: m.rol, content: String(m.texto).slice(0, 4000) })),
      { role: "user", content: pregunta },
    ];
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: [{ type: "text", text: (cliente ? PROMPT_CLIENTE : PROMPT_INTERNO) + "\n\nESTADO ACTUAL DE LA OT:\n" + JSON.stringify(estado), cache_control: { type: "ephemeral" } }], messages: mensajes }),
    });
    const data = await res.json().catch(() => ({}));
    await registrarUsoIA(data?.usage, otId, res.ok, res.ok ? undefined : JSON.stringify(data).slice(0, 200));
    if (!res.ok) throw new Error("La IA respondió " + res.status + ": " + JSON.stringify(data).slice(0, 300));
    let texto = (data.content || []).map((b: any) => b.text || "").join("").trim();

    // Propuestas que deja el chat (solo internos): se guardan para confirmar en la pestaña Propuestas.
    let creadas = 0;
    if (!cliente) {
      const m = texto.match(/PROPUESTAS:\s*(\{[\s\S]*\})\s*$/);
      if (m) {
        texto = texto.slice(0, m.index).trim();
        try {
          const parsed = JSON.parse(m[1]);
          const TIPOS = new Set(["evento", "documento", "avance", "contrato", "alerta"]);
          const filas = (Array.isArray(parsed?.propuestas) ? parsed.propuestas : []).filter((p: any) => p && TIPOS.has(p.tipo) && p.titulo).slice(0, 10).map((p: any) => ({
            ot_id: otId, origen: "ia", referencia: "chat-" + Date.now(), tipo: p.tipo, titulo: String(p.titulo).slice(0, 300), detalle: p.detalle ? String(p.detalle).slice(0, 2000) : null,
            confianza: ["alta", "media", "baja"].includes(p.confianza) ? p.confianza : "media", datos: p.datos && typeof p.datos === "object" ? p.datos : {},
          }));
          if (filas.length) {
            const r = await fetch(url() + "/rest/v1/propuestas", { method: "POST", headers: { ...H(), Prefer: "return=representation" }, body: JSON.stringify(filas) });
            if (r.ok) creadas = ((await r.json()) || []).length;
          }
        } catch (_e) { /* el texto queda igual */ }
      }
    }
    return json({ ok: true, respuesta: texto, propuestas_creadas: creadas, modo: cliente ? "cliente" : "interno", tokens: data?.usage ? { entrada: data.usage.input_tokens, salida: data.usage.output_tokens } : null });
  } catch (err) {
    console.error("avance-chat error:", err);
    return json({ ok: false, error: String((err as Error)?.message || err) });
  }
});
