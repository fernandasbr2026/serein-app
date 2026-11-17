// ============================================================
// SEREIN · Módulo Avance de Obra · acceso del cliente
// Supabase Edge Function — avance-invitar-cliente
// ============================================================
// Crea (o reinicia / revoca) el usuario con el que el cliente entra al portal
// de su obra. Lo pide un ADMIN de la OT desde Configuración.
//
// Regla pedida por Gerencia: usuario = nombre corto del cliente; clave inicial
// = código de la OT. Como Supabase exige 6 caracteres y «OT914» tiene 5, la
// clave inicial es el código de la OT más 4 dígitos al azar (p. ej.
// OT914-4821); el cliente debe cambiarla en su primer ingreso.
//
// Auth exige un correo: se usa uno técnico <usuario>@obras.sereinspa.com que
// nunca recibe nada; el cliente escribe solo su usuario en la pantalla de
// entrada (Login.jsx le agrega el dominio).
//
// POST { ot_id, accion: 'crear'|'reiniciar'|'revocar', usuario, nombre, correo_aviso? }
// Secretos: SERVICE_ROLE_KEY (o SUPABASE_SERVICE_ROLE_KEY). Desplegar con
// «Verify JWT» activado.
// ============================================================
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const DOMINIO = "obras.sereinspa.com";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const url = () => Deno.env.get("SUPABASE_URL") || "";
const srv = () => (Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
const H = (perfil?: string) => ({ apikey: srv(), Authorization: "Bearer " + srv(), "Content-Type": "application/json", ...(perfil ? { "Accept-Profile": perfil, "Content-Profile": perfil } : {}) });

async function autorizar(req: Request, otId: string) {
  const auth = (req.headers.get("Authorization") || "").trim();
  if (!/^Bearer\s+\S+/i.test(auth)) return { ok: false as const, error: "Debes iniciar sesión." };
  const u = await fetch(url() + "/auth/v1/user", { headers: { Authorization: auth, apikey: (Deno.env.get("SUPABASE_ANON_KEY") || "").trim() } });
  if (!u.ok) return { ok: false as const, error: "Tu sesión no es válida o venció." };
  const uid = String((await u.json())?.id || "");
  const r = await fetch(url() + `/rest/v1/miembros?select=rol&ot_id=eq.${otId}&user_id=eq.${uid}`, { headers: H("avance") });
  const m = r.ok ? await r.json() : [];
  if (!(m[0] && m[0].rol === "admin")) return { ok: false as const, error: "Solo un administrador de la OT puede gestionar el acceso del cliente." };
  return { ok: true as const, uid };
}
const slug = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 40);
const claveInicial = (codigo: string) => String(codigo || "OT").replace(/[^A-Za-z0-9]/g, "").toUpperCase() + "-" + String(Math.floor(1000 + Math.random() * 9000));

async function buscarUsuario(email: string): Promise<any | null> {
  const r = await fetch(url() + "/auth/v1/admin/users?page=1&per_page=1000", { headers: H() });
  if (!r.ok) return null;
  const d = await r.json();
  return (d.users || []).find((x: any) => String(x.email || "").toLowerCase() === email) || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const otId = String(body?.ot_id || "");
    const accion = String(body?.accion || "crear");
    if (!otId) return json({ ok: false, error: "Falta ot_id." });
    const acceso = await autorizar(req, otId);
    if (!acceso.ok) return json({ ok: false, error: acceso.error });

    const ro = await fetch(url() + `/rest/v1/ots?select=id,codigo,nombre,cliente&id=eq.${otId}`, { headers: H("avance") });
    const ot = (ro.ok ? await ro.json() : [])[0];
    if (!ot) return json({ ok: false, error: "La OT no existe." });

    const usuario = slug(body?.usuario || ot.cliente || "cliente");
    if (usuario.length < 3) return json({ ok: false, error: "El usuario debe tener al menos 3 letras o números." });
    const email = usuario + "@" + DOMINIO;
    const nombre = String(body?.nombre || ot.cliente || usuario).slice(0, 120);

    if (accion === "revocar") {
      const u = await buscarUsuario(email);
      if (u) {
        await fetch(url() + `/rest/v1/miembros?ot_id=eq.${otId}&user_id=eq.${u.id}`, { method: "DELETE", headers: H("avance") });
        // Si no queda en ninguna otra OT, se elimina el usuario (y su perfil).
        const r = await fetch(url() + `/rest/v1/miembros?select=ot_id&user_id=eq.${u.id}`, { headers: H("avance") });
        const resto = r.ok ? await r.json() : [];
        if (!resto.length) {
          await fetch(url() + `/rest/v1/perfiles?id=eq.${u.id}`, { method: "DELETE", headers: H() });
          await fetch(url() + `/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: H() });
        }
      }
      return json({ ok: true, mensaje: "Acceso revocado para " + usuario + "." });
    }

    const clave = claveInicial(ot.codigo);
    let user = await buscarUsuario(email);
    if (accion === "crear") {
      if (!user) {
        const c = await fetch(url() + "/auth/v1/admin/users", { method: "POST", headers: H(), body: JSON.stringify({ email, password: clave, email_confirm: true, user_metadata: { nombre, tipo: "cliente", ot: ot.codigo } }) });
        const d = await c.json();
        if (!c.ok) return json({ ok: false, error: "No pude crear el usuario: " + (d?.msg || d?.message || JSON.stringify(d)).slice(0, 200) });
        user = d;
      } else {
        // Ya existía (otra OT u otro intento): se le fija la clave nueva igual.
        await fetch(url() + `/auth/v1/admin/users/${user.id}`, { method: "PUT", headers: H(), body: JSON.stringify({ password: clave }) });
      }
      // Perfil tipo 'cliente' (App.jsx lo manda a ClienteObraApp, nunca al ERP).
      const pf = await fetch(url() + "/rest/v1/perfiles?on_conflict=id", { method: "POST", headers: { ...H(), Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: user.id, nombre, tipo: "cliente", areas: [] }) });
      if (!pf.ok) {
        const t = await pf.text();
        // Si la tabla tiene columnas obligatorias distintas, se intenta sin 'areas'.
        const pf2 = await fetch(url() + "/rest/v1/perfiles?on_conflict=id", { method: "POST", headers: { ...H(), Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: user.id, nombre, tipo: "cliente" }) });
        if (!pf2.ok) return json({ ok: false, error: "Usuario creado pero no pude crear su perfil: " + t.slice(0, 200) });
      }
      const mb = await fetch(url() + "/rest/v1/miembros?on_conflict=ot_id,user_id", { method: "POST", headers: { ...H("avance"), Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ ot_id: otId, user_id: user.id, rol: "cliente", usuario, debe_cambiar_clave: true }) });
      if (!mb.ok) return json({ ok: false, error: "No pude asociar al cliente a la OT: " + (await mb.text()).slice(0, 200) });
      await fetch(url() + "/rest/v1/alertas", { method: "POST", headers: { ...H("avance"), Prefer: "return=minimal" }, body: JSON.stringify({ ot_id: otId, titulo: "Acceso del cliente creado: usuario «" + usuario + "»", cuerpo: "Debe cambiar la clave en su primer ingreso.", nivel: "info" }) });
      return json({ ok: true, usuario, clave_inicial: clave, entrada: "https://app.sereinspa.com", mensaje: "Usuario creado. Entrega la clave inicial por un canal seguro; se mostrará solo esta vez." });
    }
    if (accion === "reiniciar") {
      if (!user) return json({ ok: false, error: "Ese usuario no existe. Usa «Crear acceso»." });
      const r = await fetch(url() + `/auth/v1/admin/users/${user.id}`, { method: "PUT", headers: H(), body: JSON.stringify({ password: clave }) });
      if (!r.ok) return json({ ok: false, error: "No pude reiniciar la clave: " + (await r.text()).slice(0, 200) });
      await fetch(url() + `/rest/v1/miembros?ot_id=eq.${otId}&user_id=eq.${user.id}`, { method: "PATCH", headers: { ...H("avance"), Prefer: "return=minimal" }, body: JSON.stringify({ debe_cambiar_clave: true }) });
      return json({ ok: true, usuario, clave_inicial: clave, mensaje: "Clave reiniciada. Se mostrará solo esta vez." });
    }
    return json({ ok: false, error: "Acción desconocida." });
  } catch (err) {
    console.error("avance-invitar-cliente error:", err);
    return json({ ok: false, error: String((err as Error)?.message || err) });
  }
});
