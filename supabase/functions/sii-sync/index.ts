// ============================================================
// SEREIN · Sincronización automática con el SII
// Supabase Edge Function — plantilla lista para conectar
// ============================================================
// Esta función descarga el Registro de Compras y Ventas (RCV)
// desde un proveedor de API del SII y lo guarda en la tabla
// facturas_sii, clasificando cada factura por área según las
// reglas de la tabla reglas_clasificacion.
//
// PROVEEDOR: la plantilla usa la forma genérica de SimpleAPI /
// ApiPyme. Cuando contrates uno, solo hay que ajustar la URL y
// los campos del JSON (pídeme ayuda con la documentación que te
// entreguen y lo dejamos fino).
//
// CÓMO SE ACTIVA (cuando llegues a este paso):
// 1. Contrata el proveedor (ApiPyme ~30 días de prueba gratis).
// 2. En Supabase: Edge Functions → Deploy new function → pega este archivo.
// 3. En Project Settings → Edge Functions → Secrets agrega:
//    SII_API_URL, SII_API_KEY  (te los da el proveedor)
//    SERVICE_ROLE_KEY (Project Settings → API → service_role)
// 4. En Database → Cron Jobs programa la función cada noche.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SERVICE_ROLE_KEY")!,
  );

  const periodo = new URL(req.url).searchParams.get("periodo") ??
    new Date().toISOString().slice(0, 7); // '2026-07'

  // 1) Descargar RCV del proveedor (ventas y compras)
  const resultados = { ventas: 0, compras: 0, sinClasificar: 0 };

  for (const tipo of ["venta", "compra"] as const) {
    const resp = await fetch(
      `${Deno.env.get("SII_API_URL")}/rcv/${tipo}s?periodo=${periodo}`,
      { headers: { Authorization: `Bearer ${Deno.env.get("SII_API_KEY")}` } },
    );
    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: `Proveedor SII respondió ${resp.status} en ${tipo}s` }),
        { status: 502 },
      );
    }
    const docs = await resp.json(); // ajustar según formato real del proveedor

    // 2) Cargar reglas de clasificación una vez
    const { data: reglas } = await supabase
      .from("reglas_clasificacion")
      .select("*")
      .order("prioridad");

    for (const d of docs) {
      // Ajustar nombres de campos según el proveedor:
      const razon = (d.razon_social ?? d.rznSoc ?? "").toUpperCase();
      const regla = (reglas ?? []).find((r) =>
        (r.razon_social_contiene && razon.includes(r.razon_social_contiene.toUpperCase())) ||
        (r.rut_contraparte && r.rut_contraparte === d.rut)
      );

      const { error } = await supabase.from("facturas_sii").upsert({
        tipo,
        folio: String(d.folio),
        rut_contraparte: d.rut,
        razon_social: d.razon_social ?? d.rznSoc,
        fecha: d.fecha_emision ?? d.fchEmis,
        neto: d.monto_neto ?? d.mntNeto,
        iva: d.monto_iva ?? d.mntIVA,
        total: d.monto_total ?? d.mntTotal,
        periodo,
        area: regla?.area_destino ?? null,
        proyecto_id: regla?.proyecto_id ?? null,
        clasificacion: regla ? "auto" : "pendiente",
      }, { onConflict: "tipo,folio,rut_contraparte" });

      if (!error) {
        resultados[tipo === "venta" ? "ventas" : "compras"]++;
        if (!regla) resultados.sinClasificar++;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, periodo, ...resultados }), {
    headers: { "Content-Type": "application/json" },
  });
});
