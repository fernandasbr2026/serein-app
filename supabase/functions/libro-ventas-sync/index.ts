// ============================================================
// SEREIN · Sincronización de VENTAS con Defontana
// Supabase Edge Function — libro-ventas-sync
// ============================================================
// Descarga los documentos de venta emitidos (libro de ventas)
// desde la API de Integración de Defontana (módulo "Sale") y los
// guarda en la tabla 'libro_ventas' de Supabase.
//
// CÓMO SE ACTIVA (lo hace Gerencia dentro de Supabase):
//   1) Cargar los SECRETOS (Project Settings > Edge Functions > Secrets):
//        DF_CLIENT     = identificador de cliente en Defontana
//        DF_COMPANY    = identificador de empresa en Defontana
//        DF_USER       = usuario de la API de integración
//        DF_PASSWORD   = contraseña de ese usuario
//        SERVICE_ROLE_KEY = service_role key de este proyecto Supabase
//      (Opcionales, ya tienen valor por defecto:)
//        DF_BASE_URL   = https://api.defontana.com/api
//        DF_SALES_PATH = Sale/getSalesBook   (ver NOTA)
//        DF_PAGE_SIZE  = 100
//        DF_MONTHS     = 12   (cuántos meses hacia atrás traer)
//   2) Desplegar:  supabase functions deploy libro-ventas-sync
//   3) Ejecutar:   botón "Sincronizar" del módulo Libro de Ventas.
//
// NOTA sobre el endpoint: Defontana agrupa las ventas en el módulo
// "Sale". El nombre exacto del método de listado puede variar según
// el plan contratado; por eso el path es configurable con
// DF_SALES_PATH y el mapeo de campos es tolerante (acepta varios
// nombres posibles). La función deja en la consola (Logs) el primer
// registro recibido para afinar el mapeo al conectar con datos reales.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const BASE = () => Deno.env.get("DF_BASE_URL") ?? "https://api.defontana.com/api";
const SALES_PATH = () => Deno.env.get("DF_SALES_PATH") ?? "Sale/getSalesBook";
const PAGE = () => Number(Deno.env.get("DF_PAGE_SIZE") ?? "100");
const MONTHS = () => Number(Deno.env.get("DF_MONTHS") ?? "12");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Toma el primer valor definido entre varios posibles nombres de campo
function pick(obj: Record<string, unknown>, ...keys: string[]) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return null;
}
function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}
function toDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v);
  const m = s.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// 1) Autenticación → token bearer
async function login(): Promise<string> {
  const url = new URL(`${BASE()}/auth`);
  url.searchParams.set("Client", Deno.env.get("DF_CLIENT") ?? "");
  url.searchParams.set("Company", Deno.env.get("DF_COMPANY") ?? "");
  url.searchParams.set("User", Deno.env.get("DF_USER") ?? "");
  url.searchParams.set("Password", Deno.env.get("DF_PASSWORD") ?? "");
  const r = await fetch(url.toString(), { method: "GET" });
  const j = await r.json();
  if (!j?.access_token) throw new Error("Defontana Auth falló: " + (j?.message ?? r.status));
  return j.access_token as string;
}

// Extrae el arreglo de documentos de la respuesta (tolerante al formato)
function rowsOf(j: any): Record<string, unknown>[] {
  if (Array.isArray(j)) return j;
  for (const k of ["data", "result", "results", "items", "sales", "documents", "list", "Ventas", "registros"]) {
    if (j && Array.isArray(j[k])) return j[k];
    if (j && j[k] && Array.isArray(j[k].items)) return j[k].items;
  }
  if (j && j.data && Array.isArray(j.data.items)) return j.data.items;
  return [];
}

// Mapea un documento de Defontana → fila de la tabla libro_ventas
function mapRow(d: Record<string, unknown>) {
  const neto = num(pick(d, "net", "neto", "netAmount", "montoNeto", "MntNeto"));
  const iva = num(pick(d, "tax", "iva", "taxAmount", "montoIva", "IVA"));
  const exento = num(pick(d, "exempt", "exento", "exemptAmount", "montoExento", "MntExe"));
  const total = num(pick(d, "total", "totalAmount", "amount", "montoTotal", "MntTotal"));
  return {
    emission_date: toDate(pick(d, "date", "emissionDate", "emission_date", "fecha", "FchEmis", "documentDate")),
    document_type: (String(pick(d, "voucherTypeName", "documentTypeName", "documentType", "tipoDocumento", "voucherType", "TipoDTE") ?? "") || null),
    document_number: (String(pick(d, "number", "folio", "documentNumber", "numero", "Folio") ?? "") || null),
    client_name: (String(pick(d, "clientName", "name", "razonSocial", "businessName", "RznSoc", "socialReason") ?? "") || null),
    client_rut: (String(pick(d, "clientLegalCode", "legalCode", "rut", "clientRut", "RUTRecep", "clientCode") ?? "") || null),
    neto,
    iva,
    exento,
    total: total || (neto + iva + exento),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!,
    );
    const token = await login();
    const size = PAGE();
    const headers = { "Content-Type": "application/json", "Authorization": "bearer " + token };

    // Rango: últimos N meses hasta hoy
    const to = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - MONTHS());
    const fmt = (dd: Date) => dd.toISOString().slice(0, 10);

    // Descarga paginada
    const collected: any[] = [];
    let page = 1;
    let guard = 0;
    while (guard++ < 300) {
      const url = new URL(`${BASE()}/${SALES_PATH()}`);
      url.searchParams.set("page", String(page));
      url.searchParams.set("pageSize", String(size));
      url.searchParams.set("from", fmt(from));
      url.searchParams.set("to", fmt(to));
      const r = await fetch(url.toString(), { method: "GET", headers });
      if (!r.ok) {
        if (page === 1) throw new Error("Defontana ventas HTTP " + r.status + ": " + (await r.text()).slice(0, 200));
        break;
      }
      const j = await r.json();
      const batch = rowsOf(j);
      if (page === 1 && batch[0]) console.log("Primer registro de venta:", JSON.stringify(batch[0]).slice(0, 800));
      if (!batch.length) break;
      for (const d of batch) collected.push(mapRow(d));
      if (batch.length < size) break;
      page++;
    }

    // Upsert por (document_number, client_rut) — NUNCA se borra la tabla.
    // El reemplazo-completo anterior (delete + insert) destruía en cada
    // sincronización todos los campos que el equipo edita a mano en el
    // libro (area, ot_id, cc_ot, estado_pago, fecha_pago, banco,
    // factoring_id, dias, dias_mora, anula_folio, oculto), porque el
    // insert solo trae las columnas que vienen de Defontana.
    const key = (r: { document_number: unknown; client_rut: unknown }) =>
      `${r.document_number ?? ""}|${r.client_rut ?? ""}`;

    let inserted = 0;
    let updated = 0;
    if (collected.length) {
      const { data: existentes, error: errSel } = await supabase
        .from("libro_ventas")
        .select("id, document_number, client_rut");
      if (errSel) throw new Error("Leer libro_ventas: " + errSel.message);

      const idPorClave = new Map<string, string>();
      for (const r of existentes ?? []) idPorClave.set(key(r), r.id as string);

      const aInsertar: typeof collected = [];
      const aActualizar: { id: string; row: typeof collected[number] }[] = [];
      for (const row of collected) {
        const id = idPorClave.get(key(row));
        if (id) aActualizar.push({ id, row });
        else aInsertar.push(row);
      }

      for (let i = 0; i < aInsertar.length; i += 500) {
        const chunk = aInsertar.slice(i, i + 500);
        const { error } = await supabase.from("libro_ventas").insert(chunk);
        if (error) throw new Error("Insert libro_ventas: " + error.message);
        inserted += chunk.length;
      }

      // Solo se tocan las columnas que vienen de Defontana — el resto
      // (area, estado_pago, oculto, etc.) queda intacto para filas ya
      // existentes. Se actualiza en paralelo por lotes chicos.
      for (let i = 0; i < aActualizar.length; i += 20) {
        const chunk = aActualizar.slice(i, i + 20);
        const resultados = await Promise.all(
          chunk.map(({ id, row }) => supabase.from("libro_ventas").update(row).eq("id", id)),
        );
        for (const { error } of resultados) {
          if (error) throw new Error("Update libro_ventas: " + error.message);
        }
        updated += chunk.length;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, ventas: inserted + updated, nuevas: inserted, actualizadas: updated, desde: fmt(from), hasta: fmt(to) }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
