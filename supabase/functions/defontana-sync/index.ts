// ============================================================
// SEREIN · Sincronización con Defontana (Proveedores y OC)
// Supabase Edge Function
// ============================================================
// Descarga desde la API de Integración de Defontana:
//   - El maestro de PROVEEDORES  (PurchaseOrder/GetProviders)
//   - Las ÓRDENES DE COMPRA       (PurchaseOrder/List)
// y los guarda/actualiza en las tablas 'proveedores' y
// 'oc_proveedor' de Supabase.
//
// CÓMO SE ACTIVA (lo hace Gerencia dentro de Supabase):
// 1. Correr antes la migración setup_defontana.sql (SQL Editor).
// 2. Edge Functions → Deploy new function → nombre "defontana-sync"
//    → pegar este archivo → Deploy.
// 3. Project Settings → Edge Functions → Secrets, agregar:
//      DF_BASE_URL   = https://api.defontana.com/api   (produccion)
//                       (pruebas: https://replapi.defontana.com/api)
//      DF_CLIENT     = <Client de integracion Defontana>
//      DF_COMPANY    = <Company>
//      DF_USER       = <User>
//      DF_PASSWORD   = <Password>
//      SERVICE_ROLE_KEY = (Project Settings → API → service_role)
//    (opcionales, con valores por defecto)
//      DF_PROVIDER_STATUS = 1        // estado de proveedor a traer
//      DF_OC_DIAS_ATRAS   = 180      // ventana de OC hacia atras
//      DF_PAGE_SIZE       = 100
// 4. Database → Cron Jobs: programar la funcion cada noche (opcional).
//
// NOTA sobre nombres de campos: la API de Defontana devuelve los
// datos con ciertos nombres que pueden variar segun la version/pais.
// Abajo se leen de forma flexible (varios alias) y se registra en
// consola el primer registro recibido para poder afinar si hiciera
// falta al conectar con las credenciales reales.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const BASE = () => Deno.env.get("DF_BASE_URL") ?? "https://api.defontana.com/api";
const PAGE = () => Number(Deno.env.get("DF_PAGE_SIZE") ?? "100");

// Toma el primer valor definido entre varios posibles nombres de campo
function pick(obj: Record<string, unknown>, ...keys: string[]) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return null;
}
function toDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v);
  // admite '2026-07-15', '2026-07-15T...', o '15-07-2026'
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return null;
}
const intOf = (v: unknown) => {
  const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
  return isNaN(n) ? 0 : n;
};

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

async function getJson(token: string, path: string, params: Record<string, string | number>) {
  const url = new URL(`${BASE()}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const r = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`Defontana ${path} respondió ${r.status}`);
  return await r.json();
}

// Extrae el arreglo de datos venga como venga (data / list / items / raíz)
function rows(resp: unknown): Record<string, unknown>[] {
  if (Array.isArray(resp)) return resp as Record<string, unknown>[];
  const o = resp as Record<string, unknown>;
  for (const k of ["data", "list", "items", "result", "providers", "purchaseOrders", "orders"]) {
    if (Array.isArray(o?.[k])) return o[k] as Record<string, unknown>[];
  }
  return [];
}

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!,
    );
    const token = await login();
    const size = PAGE();
    const out = { proveedores: 0, ordenes: 0 };

    // ---------- PROVEEDORES ----------
    {
      const status = Deno.env.get("DF_PROVIDER_STATUS") ?? "1";
      for (let page = 1; page < 500; page++) {
        const resp = await getJson(token, "/PurchaseOrder/GetProviders", {
          status, itemsPerPage: size, pageNumber: page,
        });
        const data = rows(resp);
        if (page === 1 && data[0]) console.log("Ejemplo proveedor:", JSON.stringify(data[0]));
        if (data.length === 0) break;
        for (const p of data) {
          const rut = String(pick(p, "legalCode", "rut", "code", "providerCode") ?? "");
          const rec = {
            defontana_id: rut || String(pick(p, "id", "providerId") ?? ""),
            nombre: String(pick(p, "name", "description", "businessName", "razonSocial") ?? "Sin nombre"),
            rut,
            giro: pick(p, "activity", "giro", "turn") as string | null,
            contacto: pick(p, "contact", "contactName") as string | null,
            telefono: pick(p, "phone", "telephone") as string | null,
            correo: pick(p, "email", "mail") as string | null,
            direccion: pick(p, "address", "direccion") as string | null,
            tipo: pick(p, "providerType", "type", "tipo") as string | null,
            condicion_pago: pick(p, "paymentCondition", "paymentTerm", "condicionPago") as string | null,
            estado: (String(pick(p, "status", "state") ?? "1") === "0" ? "Inactivo" : "Activo"),
            origen: "defontana",
            actualizado: new Date().toISOString(),
          };
          if (!rec.defontana_id) continue;
          const { error } = await supabase.from("proveedores").upsert(rec, { onConflict: "defontana_id" });
          if (!error) out.proveedores++;
        }
        if (data.length < size) break;
      }
    }

    // ---------- ÓRDENES DE COMPRA ----------
    {
      const dias = Number(Deno.env.get("DF_OC_DIAS_ATRAS") ?? "180");
      const toDateStr = new Date().toISOString().slice(0, 10);
      const fromDateStr = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
      for (let page = 1; page < 500; page++) {
        const resp = await getJson(token, "/PurchaseOrder/List", {
          FromDate: fromDateStr, ToDate: toDateStr, ItemsPerPage: size, Page: page,
        });
        const data = rows(resp);
        if (page === 1 && data[0]) console.log("Ejemplo OC:", JSON.stringify(data[0]));
        if (data.length === 0) break;
        for (const o of data) {
          const neto = intOf(pick(o, "net", "netAmount", "neto", "montoNeto"));
          const iva = intOf(pick(o, "tax", "iva", "vat"));
          const total = intOf(pick(o, "total", "totalAmount", "montoTotal")) || (neto + iva);
          const rec = {
            defontana_id: String(pick(o, "number", "orderNumber", "id", "folio") ?? ""),
            numero_oc: String(pick(o, "number", "orderNumber", "folio") ?? ""),
            fecha_emision: toDate(pick(o, "date", "emissionDate", "fecha", "fechaEmision")),
            proveedor_rut: pick(o, "providerLegalCode", "providerCode", "legalCode", "rut") as string | null,
            proveedor_nombre: pick(o, "providerName", "provider", "proveedor") as string | null,
            categoria: pick(o, "category", "concept", "categoria") as string | null,
            detalle: pick(o, "detail", "comment", "observation", "glosa") as string | null,
            monto_neto: neto,
            iva,
            total,
            condicion_pago: pick(o, "paymentCondition", "paymentTerm") as string | null,
            fecha_vencimiento: toDate(pick(o, "dueDate", "expirationDate", "fechaVencimiento", "paymentDate")),
            estado: String(pick(o, "status", "state", "estado") ?? "Pendiente"),
            origen: "defontana",
            actualizado: new Date().toISOString(),
          };
          if (!rec.defontana_id) continue;
          const { error } = await supabase.from("oc_proveedor").upsert(rec, { onConflict: "defontana_id" });
          if (!error) out.ordenes++;
        }
        if (data.length < size) break;
      }
    }

    return new Response(JSON.stringify({ ok: true, ...out }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }
});
