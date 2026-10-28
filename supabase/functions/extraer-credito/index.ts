// ============================================================
// SEREIN · Lectura con IA de los antecedentes de crédito de un cliente
// Supabase Edge Function — extraer-credito
// ============================================================
// Recibe { tipo, archivos: [{ base64, mimeType, filename }] } y devuelve
// { ok, datos } con los campos de ese tipo de documento (carpeta tributaria
// del SII, informe DICOM, certificado bancario, solicitud de crédito o
// certificado TGR). Nunca escribe en la base: el módulo de Crédito muestra los
// datos en pantalla y la persona los revisa y corrige antes de calcular.
// La IA solo TRANSCRIBE: los totales, la tendencia y el puntaje los calcula el
// sistema (creditoCalculo.js).
//
// Requiere el secreto ANTHROPIC_API_KEY (Edge Functions > Secrets) — el mismo
// que ya usan extraer-oc, extraer-factura-compra y las demás.
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-5";

const REGLAS_COMUNES = `Reglas generales:
- Responde SOLO el JSON, sin texto adicional, sin markdown, sin comentarios.
- Los montos van como número entero en pesos chilenos, sin puntos ni signo $.
- Las fechas van en formato YYYY-MM-DD (los períodos tributarios, en YYYY-MM).
- Si un dato no aparece en el documento, usa null (nunca inventes ni estimes un valor).
- Transcribe lo que dice el documento; no calcules totales ni promedios.`;

const ESQUEMAS: Record<string, { esquema: string; instrucciones: string }> = {
  carpeta_tributaria: {
    esquema: `{
  "fechaGeneracion": string | null,
  "rut": string | null,
  "razonSocial": string | null,
  "fechaInicioActividades": string | null,
  "observacionesTributarias": boolean | null,
  "ventasMensuales": [{ "periodo": string, "debitos": number | null, "fechaPresentacion": string | null }],
  "resultadoTributario": [{ "anio": number, "valor": number | null, "tipo": "utilidad" | "perdida" | null }],
  "bienesRaices": boolean | null
}`,
    instrucciones: `Es una Carpeta Tributaria Electrónica del SII de una empresa chilena.
- "fechaGeneracion": fecha en que se generó la carpeta (primera página).
- "fechaInicioActividades": fecha de inicio de actividades del contribuyente.
- "observacionesTributarias": true SOLO si la sección "Anotaciones y Observaciones tributarias vigentes" lista anotaciones vigentes; false si dice que no registra.
- "ventasMensuales": una fila por cada mes que aparezca en los Formularios 29 (hasta los 24 meses más recientes): "periodo" YYYY-MM, "debitos" = valor del código 538 (Total débitos) de ese mes, "fechaPresentacion" = fecha en que se presentó el formulario.
- "resultadoTributario": una fila por cada año de los Formularios 22 (hasta 3): "anio" = año comercial, "valor" = código 1440 (base imponible de primera categoría o pérdida; negativo si es pérdida), "tipo" = "utilidad" o "perdida".
- "bienesRaices": true si la sección "Propiedades y Bienes Raíces" lista alguna propiedad; false si no registra.`,
  },
  dicom: {
    esquema: `{
  "fechaEmision": string | null,
  "registros": "limpio" | "aclaradas" | "vigentes" | null,
  "detalle": string | null
}`,
    instrucciones: `Es un informe comercial (DICOM / Equifax) de una empresa y/o su representante legal.
- "registros": "vigentes" si muestra morosidades, protestos o deudas impagas vigentes; "aclaradas" si solo hay deudas antiguas ya pagadas o aclaradas; "limpio" si no registra nada.
- "detalle": una frase breve con lo más relevante que informa el documento (montos y fechas si los hay), o null.`,
  },
  certificado_bancario: {
    esquema: `{
  "fechaEmision": string | null,
  "banco": string | null,
  "fechaAperturaCuenta": string | null,
  "antiguedadTexto": string | null,
  "chequesProtestados": boolean | null
}`,
    instrucciones: `Es un certificado o referencia bancaria de la cuenta corriente de una empresa.
- "fechaAperturaCuenta": fecha de apertura de la cuenta corriente o "cliente desde", si aparece.
- "antiguedadTexto": la antigüedad tal como la escribe el documento (ej. "más de 3 años"), si no hay fecha.
- "chequesProtestados": true SOLO si informa cheques protestados; false si dice que no registra.`,
  },
  solicitud: {
    esquema: `{
  "razonSocial": string | null,
  "rut": string | null,
  "giro": string | null,
  "direccion": string | null,
  "representanteLegal": string | null,
  "contactoCompras": string | null,
  "contactoPagos": string | null,
  "emailFacturas": string | null,
  "lineaSolicitada": number | null,
  "referencias": [{ "empresa": string, "contacto": string | null }]
}`,
    instrucciones: `Es la solicitud de crédito firmada por el cliente. "lineaSolicitada" es el monto de crédito que pide (si lo indica). "referencias" son las referencias comerciales que informa.`,
  },
  auto: {
    esquema: `{
  "tipoDocumento": "carpeta_tributaria" | "dicom" | "certificado_bancario" | "solicitud" | "tgr" | "certificado_vigencia" | "rut_sii" | "poder_representante" | "sitio_web" | "otro",
  "descripcion": string,
  "fechaEmision": string | null,
  "razonSocial": string | null,
  "rut": string | null,
  "representanteLegal": string | null,
  "giro": string | null,
  "direccion": string | null,
  "fechaInicioActividades": string | null,
  "vigente": boolean | null,
  "datosRelevantes": [{ "etiqueta": string, "valor": string }],
  "alertas": [string]
}`,
    instrucciones: `No sabes qué documento es: IDENTIFÍCALO tú y extrae lo que sirva para evaluar el riesgo de crédito de la empresa cliente (una empresa chilena que le pide crédito a SEREIN).
- "tipoDocumento": "carpeta_tributaria" (Carpeta Tributaria Electrónica del SII), "dicom" (informe comercial DICOM/Equifax), "certificado_bancario" (certificado o referencia bancaria), "solicitud" (solicitud de apertura de crédito o similar, con datos de la empresa y referencias), "tgr" (certificado de deuda de la Tesorería), "certificado_vigencia" (certificado de vigencia de la sociedad, del Conservador de Bienes Raíces / Registro de Comercio), "rut_sii" (cédula o tarjeta RUT / E-RUT del SII), "poder_representante" (poder, mandato o escritura de representación legal), "sitio_web" (captura o página de un sitio web de la empresa) u "otro".
- "descripcion": UNA frase que diga qué es el documento (ej. "Certificado de vigencia de la sociedad emitido por el CBR de Santiago").
- "fechaEmision": fecha de emisión del documento si aparece.
- "razonSocial", "rut", "representanteLegal", "giro", "direccion", "fechaInicioActividades": solo si aparecen en el documento.
- "vigente": true/false SOLO si el documento declara explícitamente la vigencia de la sociedad, del poder o del registro (por ejemplo "se encuentra vigente" o "no se encuentra vigente"); si no habla de vigencia, null.
- "datosRelevantes": hechos concretos del documento que ayudan a evaluar al cliente (ej. {"etiqueta":"Años de trayectoria","valor":"Fundada en 1985"}, {"etiqueta":"Capital","valor":"$50.000.000"}, {"etiqueta":"Directorio","valor":"..."}). Máximo 8, sin inventar.
- "alertas": SOLO cosas que el documento evidencia y que un analista de crédito querría revisar (ej. "Poder revocado a nombre de ...", "La sociedad no figura vigente", "Documento con más de 90 días", "Los datos del representante no coinciden"). Si no hay nada preocupante, deja el arreglo vacío.`,
  },
  tgr: {
    esquema: `{
  "fechaEmision": string | null,
  "contribucionesVencidas": boolean | null
}`,
    instrucciones: `Es un certificado de deuda de la Tesorería General de la República. "contribucionesVencidas": true SOLO si muestra contribuciones de bienes raíces vencidas o morosas; false si no registra deuda.`,
  },
};

const MIME_IMAGEN = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);


// ============================================================
// Autorización (auditoría 2026-10-27, hallazgo S-7/S-12)
// ============================================================
// Antes cualquiera que llegara a esta URL podía ejecutarla (y, en las de IA, gastar créditos). Ahora:
// 1) la petición debe traer la sesión del usuario (supabase.functions.invoke la manda sola),
// 2) el perfil de ese usuario tiene que estar en PERMITIDOS,
// 3) hay tope de archivos y tamaño por llamada, y 4) cada llamada a la IA queda anotada en ia_uso.
// Se responde con HTTP 200 y { ok: false, error } para que la app muestre el motivo tal cual.
const PERMITIDOS: string[] = ['gerencia', 'admin', 'comercial', 'proyectos', 'jefe', 'supervisor'];
const MAX_ARCHIVOS = 8;
const MAX_MB_ARCHIVOS = 25;
async function autorizarPeticion(req: Request): Promise<{ ok: true; uid: string; tipo: string } | { ok: false; error: string }> {
  const auth = (req.headers.get("Authorization") || "").trim();
  if (!/^Bearer\s+\S+/i.test(auth)) return { ok: false, error: "Debes iniciar sesión para usar esta función." };
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const srv = (Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  try {
    const u = await fetch(url + "/auth/v1/user", { headers: { Authorization: auth, apikey: anon || srv } });
    if (!u.ok) return { ok: false, error: "Tu sesión no es válida o venció: vuelve a iniciar sesión." };
    const user = await u.json();
    const uid = user && user.id ? String(user.id) : "";
    if (!uid) return { ok: false, error: "Tu sesión no es válida: vuelve a iniciar sesión." };
    const p = await fetch(url + "/rest/v1/perfiles?select=tipo&id=eq." + encodeURIComponent(uid), { headers: { apikey: srv, Authorization: "Bearer " + srv } });
    const filas = p.ok ? await p.json() : [];
    const tipo = String((Array.isArray(filas) && filas[0] && filas[0].tipo) || "");
    if (!tipo || !PERMITIDOS.includes(tipo)) return { ok: false, error: "Tu perfil no tiene permiso para usar esta función." };
    return { ok: true, uid, tipo };
  } catch (_e) { return { ok: false, error: "No se pudo comprobar tu sesión. Inténtalo de nuevo." }; }
}
function limitarArchivos(archivos: any[]) {
  if (!Array.isArray(archivos)) return;
  if (archivos.length > MAX_ARCHIVOS) throw new Error("Máximo " + MAX_ARCHIVOS + " archivos por lectura.");
  const bytes = archivos.reduce((a: number, x: any) => a + Math.floor(String((x && x.base64) || "").length * 3 / 4), 0);
  if (bytes > MAX_MB_ARCHIVOS * 1024 * 1024) throw new Error("Los archivos superan " + MAX_MB_ARCHIVOS + " MB en total: súbelos en menos partes o con menor resolución.");
}
// Deja constancia de cada llamada a la IA (tokens reales). Si la tabla no existe, no interrumpe nada.
async function registrarUsoIA(funcion: string, modelo: string | null, uso: any, referencia: string, ok: boolean, error?: string) {
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const srv = (Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
    await fetch(url + "/rest/v1/ia_uso", {
      method: "POST",
      headers: { apikey: srv, Authorization: "Bearer " + srv, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        funcion, modelo,
        tokens_entrada: uso?.input_tokens ?? null, tokens_salida: uso?.output_tokens ?? null,
        tokens_cache_escritura: uso?.cache_creation_input_tokens ?? null, tokens_cache_lectura: uso?.cache_read_input_tokens ?? null,
        referencia, ok, error: error ? String(error).slice(0, 300) : null,
      }),
    });
  } catch (_e) { /* sin registro */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const acceso = await autorizarPeticion(req);
  if (!acceso.ok) return new Response(JSON.stringify({ ok: false, error: acceso.error }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  try {
    const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
    if (!apiKey) throw new Error("Falta el secreto ANTHROPIC_API_KEY en este proyecto Supabase (Edge Functions > Secrets).");

    const body = await req.json();
    const tipo = String(body.tipo || "");
    const cfg = ESQUEMAS[tipo];
    if (!cfg) throw new Error("Tipo de documento no soportado: " + tipo);
    const archivos = Array.isArray(body.archivos) && body.archivos.length ? body.archivos : [];
    limitarArchivos(archivos);
    if (!archivos.length) throw new Error("Falta al menos un archivo en la solicitud.");

    const contenidoArchivos = archivos.map((a: any) => {
      const mime = a.mimeType || "application/pdf";
      if (MIME_IMAGEN.has(mime)) {
        return { type: "image", source: { type: "base64", media_type: mime, data: a.base64 } };
      }
      return { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 } };
    });

    const PROMPT = `Estás leyendo un documento de antecedentes de crédito para SEREIN Group, una empresa chilena de granallado y pintura industrial. ${cfg.instrucciones}

Devuelve un JSON con EXACTAMENTE esta forma:

${cfg.esquema}

${REGLAS_COMUNES}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        messages: [{ role: "user", content: [...contenidoArchivos, { type: "text", text: PROMPT }] }],
      }),
    });

    if (!res.ok) {
      const detalle = await res.text();
      throw new Error(`Anthropic API respondió ${res.status}: ${detalle.slice(0, 500)}`);
    }

    const data = await res.json();
    registrarUsoIA("extraer-credito", MODEL, data && data.usage, acceso.ok ? acceso.uid : "", res.ok, res.ok ? undefined : JSON.stringify(data).slice(0, 200));
    const textoRespuesta = (data.content || []).map((b: any) => b.text || "").join("").trim();
    const limpio = textoRespuesta.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    let datos;
    try { datos = JSON.parse(limpio); }
    catch (e) { throw new Error("La IA no devolvió un JSON válido: " + limpio.slice(0, 300)); }

    return new Response(JSON.stringify({ ok: true, tipo, datos }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("extraer-credito error:", err);
    return new Response(JSON.stringify({ ok: false, error: String((err as any)?.message || err) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
