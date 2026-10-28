// ============================================================
// SEREIN · Respaldo diario de la base a Storage
// Supabase Edge Function — respaldo-diario
// ============================================================
// Auditoría 2026-10-27, hallazgo D-2: no existía ningún respaldo propio de
// `app_state` (las OT, cotizaciones, nómina, finanzas…) ni de las tablas.
// Un borrado o una subida atrasada que pisara un bloque no tenía vuelta atrás.
//
// Qué hace: copia TODAS las tablas públicas (incluido `app_state`) a JSON
// comprimido (gzip) en el bucket privado `respaldos`, en una carpeta por
// día: respaldos/AAAA-MM-DD/<tabla>.json.gz, más un `resumen.json` con
// filas y tamaño de cada tabla. Borra las carpetas con más de RETENCION_DIAS.
//
// Quién la llama: el cron de la base (pg_cron + pg_net, ver
// supabase/migrations/2026-10-28-respaldo-diario.sql) una vez al día con la
// clave de servicio, o un usuario de gerencia/admin con su sesión.
//
// Cómo restaurar: bajar el .json.gz del bucket (Storage > respaldos), descomprimir
// y volver a insertar las filas (o pedirle a Claude que lo haga con ese archivo).
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BUCKET = "respaldos";
const RETENCION_DIAS = 30;
const PAGINA = 1000;
const PERMITIDOS = ["gerencia", "admin"];
// Por si la función SQL `respaldo_tablas()` todavía no existe: lista conocida el 2026-10-28.
const TABLAS_CONOCIDAS = [
  "ai_auditoria", "ai_conversaciones", "ai_mensajes", "alertas", "analisis_comercial", "analisis_financiero",
  "analisis_operacional", "app_state", "areas_gasto", "asistencia_ots", "asistencia_trabajadores", "asistencias",
  "avance_ajustes", "avances_produccion", "cargos_mo", "clientes", "compras_op_asignacion", "compras_op_montos",
  "compras_operativas", "compras_proyecto", "config_permisos", "correo_documentos", "correos_vistos", "costos_mo",
  "cotizacion_items", "cotizacion_revisiones", "cotizaciones", "credito_clientes", "credito_documentos",
  "credito_evaluaciones", "credito_facturas", "credito_ordenes_compra", "credito_parametros", "crm_campanas",
  "crm_contactos_persona", "crm_interacciones", "crm_oportunidades", "cuotas", "edps", "facturas_sii",
  "facturas_subcontrato", "gasto_distribucion", "gastos", "horas_extras", "ia_uso", "int_espesores", "int_parametros",
  "int_productos", "libro_compras", "libro_ventas", "movimientos_bancarios", "obligacion_distribucion", "obligaciones",
  "oc_proveedor", "ordenes_trabajo", "organigrama_costos", "organigrama_flujo", "organigrama_persona", "ot_costos",
  "ot_fotos", "ot_ventas", "perfiles", "plantillas_distribucion", "proveedor_tipo", "proveedores", "proyectos",
  "recomendaciones", "reglas_clasificacion", "subcontrato_asignaciones", "taller_asignaciones", "taller_lecturas",
  "taller_partes", "trabajadores", "valores_mo", "vendedores",
];

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Fecha de hoy en Chile (UTC-3 / UTC-4): el cron corre temprano y la carpeta
// debe llevar la fecha local, no la de Londres.
function fechaChile(): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date());
}

async function rpcTablas(url: string, apikey: string, bearer: string): Promise<string[] | null> {
  try {
    const r = await fetch(url + "/rest/v1/rpc/respaldo_tablas", {
      method: "POST", headers: { apikey, Authorization: "Bearer " + bearer, "Content-Type": "application/json" }, body: "{}",
    });
    if (!r.ok) return null;
    const v = await r.json();
    return Array.isArray(v) ? v.map(String) : null;
  } catch (_e) { return null; }
}

// Baja una tabla completa en páginas y devuelve el texto JSON del arreglo sin
// parsearlo (ahorra CPU: app_state pesa varios MB).
async function bajarTabla(url: string, srv: string, tabla: string): Promise<{ texto: string; filas: number }> {
  const trozos: string[] = [];
  let filas = 0;
  for (let desde = 0; ; desde += PAGINA) {
    const r = await fetch(url + "/rest/v1/" + encodeURIComponent(tabla) + "?select=*", {
      headers: { apikey: srv, Authorization: "Bearer " + srv, Range: desde + "-" + (desde + PAGINA - 1), "Range-Unit": "items", Prefer: "count=exact" },
    });
    if (!r.ok && r.status !== 416) throw new Error(tabla + ": HTTP " + r.status + " " + (await r.text()).slice(0, 200));
    const texto = r.ok ? (await r.text()).trim() : "[]";
    const interior = texto.startsWith("[") && texto.endsWith("]") ? texto.slice(1, -1).trim() : "";
    const rango = r.headers.get("content-range") || "";        // «0-999/1234»
    const total = parseInt(rango.split("/")[1] || "", 10);
    const recibidas = interior ? (interior.match(/^\{/) ? 1 : 0) : 0; // solo para saber si llegó algo
    if (interior) trozos.push(interior);
    const fin = parseInt((rango.split("/")[0] || "").split("-")[1] || "", 10);
    filas = isNaN(total) ? filas + (recibidas ? PAGINA : 0) : total;
    if (!interior || isNaN(total) || isNaN(fin) || fin + 1 >= total) break;
  }
  return { texto: "[" + trozos.join(",") + "]", filas };
}

async function gzip(texto: string): Promise<Uint8Array> {
  const flujo = new Blob([texto]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

async function subir(url: string, srv: string, ruta: string, cuerpo: Uint8Array | string, tipo: string) {
  const r = await fetch(url + "/storage/v1/object/" + BUCKET + "/" + ruta, {
    method: "POST", headers: { apikey: srv, Authorization: "Bearer " + srv, "Content-Type": tipo, "x-upsert": "true" }, body: cuerpo,
  });
  if (!r.ok) throw new Error("subir " + ruta + ": HTTP " + r.status + " " + (await r.text()).slice(0, 200));
}

async function listar(url: string, srv: string, prefix: string): Promise<{ name: string; id: string | null }[]> {
  const r = await fetch(url + "/storage/v1/object/list/" + BUCKET, {
    method: "POST", headers: { apikey: srv, Authorization: "Bearer " + srv, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } }),
  });
  if (!r.ok) return [];
  const v = await r.json();
  return Array.isArray(v) ? v : [];
}

// Borra las carpetas de días anteriores a la retención.
async function limpiarAntiguos(url: string, srv: string, hoy: string): Promise<string[]> {
  const limite = new Date(hoy + "T00:00:00Z"); limite.setUTCDate(limite.getUTCDate() - RETENCION_DIAS);
  const corte = limite.toISOString().slice(0, 10);
  const borradas: string[] = [];
  for (const it of await listar(url, srv, "")) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(it.name) || it.name >= corte) continue;
    const archivos = (await listar(url, srv, it.name + "/")).filter((a) => a.id).map((a) => it.name + "/" + a.name);
    if (!archivos.length) continue;
    const r = await fetch(url + "/storage/v1/object/" + BUCKET, {
      method: "DELETE", headers: { apikey: srv, Authorization: "Bearer " + srv, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: archivos }),
    });
    if (r.ok) borradas.push(it.name);
  }
  return borradas;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const srv = (Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!url || !srv) return json({ ok: false, error: "Faltan SUPABASE_URL o la clave de servicio en los secretos de la función." });

  // ---- Autorización ----
  // a) El cron manda la clave de servicio: se comprueba pidiéndole a la base la lista de
  //    tablas con esa misma credencial (la función SQL solo la puede ejecutar el servicio).
  // b) Una persona de gerencia/admin con su sesión (botón manual).
  const auth = (req.headers.get("Authorization") || "").trim();
  const portador = auth.replace(/^Bearer\s+/i, "");
  let quien = "";
  let tablas: string[] | null = null;
  if (portador) {
    tablas = await rpcTablas(url, portador, portador);
    if (tablas) quien = "servicio";
  }
  if (!quien) {
    if (!portador) return json({ ok: false, error: "Debes iniciar sesión para usar esta función." });
    try {
      const u = await fetch(url + "/auth/v1/user", { headers: { Authorization: auth, apikey: anon || srv } });
      if (!u.ok) return json({ ok: false, error: "Tu sesión no es válida o venció: vuelve a iniciar sesión." });
      const user = await u.json();
      const uid = user && user.id ? String(user.id) : "";
      const p = await fetch(url + "/rest/v1/perfiles?select=tipo&id=eq." + encodeURIComponent(uid), { headers: { apikey: srv, Authorization: "Bearer " + srv } });
      const filas = p.ok ? await p.json() : [];
      const tipo = String((Array.isArray(filas) && filas[0] && filas[0].tipo) || "");
      if (!uid || !PERMITIDOS.includes(tipo)) return json({ ok: false, error: "Tu perfil no tiene permiso para usar esta función." });
      quien = tipo;
    } catch (_e) { return json({ ok: false, error: "No se pudo comprobar tu sesión. Inténtalo de nuevo." }); }
  }
  if (!tablas) tablas = (await rpcTablas(url, srv, srv)) || TABLAS_CONOCIDAS;

  // ---- Respaldo ----
  const hoy = fechaChile();
  const inicio = Date.now();
  const resumen: Record<string, { filas: number; bytes: number; comprimido: number } | { error: string }> = {};
  let errores = 0, filasTotal = 0, bytesTotal = 0;
  for (const tabla of tablas) {
    try {
      const { texto, filas } = await bajarTabla(url, srv, tabla);
      const comprimido = await gzip(texto);
      await subir(url, srv, hoy + "/" + tabla + ".json.gz", comprimido, "application/gzip");
      resumen[tabla] = { filas, bytes: texto.length, comprimido: comprimido.byteLength };
      filasTotal += filas; bytesTotal += comprimido.byteLength;
    } catch (e) {
      errores++;
      resumen[tabla] = { error: String(e && (e as Error).message || e).slice(0, 300) };
    }
  }
  let borradas: string[] = [];
  try { borradas = await limpiarAntiguos(url, srv, hoy); } catch (_e) { /* la limpieza no interrumpe el respaldo */ }
  const cabecera = { ok: errores === 0, fecha: hoy, quien, tablas: tablas.length, errores, filas: filasTotal, bytesComprimidos: bytesTotal, segundos: Math.round((Date.now() - inicio) / 100) / 10, borradas, retencionDias: RETENCION_DIAS };
  try { await subir(url, srv, hoy + "/resumen.json", JSON.stringify({ ...cabecera, tablasDetalle: resumen }, null, 1), "application/json"); } catch (_e) { /* sin resumen */ }
  return json({ ...cabecera, detalle: resumen });
});
