# Auditoría de seguridad — serein-app (commit 85627fd, rama main)

Revisión solo en lectura del clon `C:\Users\maria\gwt\serein-audit`. Todo lo afirmado aquí se leyó en el repo; lo que no se puede verificar desde el repo (estado real de `pg_policies`, `verify_jwt` de cada función, políticas del bucket `fotos-ot`, tablas sin migración) queda marcado como **NO VERIFICABLE DESDE EL REPO**.

Nota previa: el enunciado describía "autenticación con magic link"; el código usa **correo + contraseña** (`supabase.auth.signInWithPassword`, `src/Login.jsx:27`) y recuperación por correo (`resetPasswordForEmail`, `src/Login.jsx:37`). No hay magic link.

---

## 1. Secretos (árbol actual e historial de git)

### 1.1 Árbol actual
- No existe ningún archivo `.env*` en el árbol (`find` sobre todo el repo, excluyendo `node_modules`/`.git`).
- No hay literales con forma de llave en el árbol: búsqueda regex de `eyJ…` (JWT), `sk-ant-`, `GOCSPX`, `AIza…`, `ghp_`, `xoxb-`, `sb_secret_`, `EAAG…` → **0 coincidencias**.
- `service_role` / `SERVICE_ROLE` aparece en 7 archivos, **siempre como nombre de variable de entorno o comentario**, nunca como valor:
  - `supabase/functions/correos-ingresar/index.ts:26,182,183` (`Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`)
  - `supabase/functions/defontana-sync/index.ts:22,101`
  - `supabase/functions/libro-ventas-sync/index.ts:15,113`
  - `supabase/functions/sii-sync/index.ts:20,29`
  - `supabase/functions/whatsapp-webhook/index.ts:26,49`
  - `scripts/migrar-fotos-ot-a-storage.mjs:5,22,38,40` (`process.env.SUPABASE_SERVICE_ROLE_KEY`, aborta si falta)
  - `supabase/migrations/2026-07-20-crm.sql:1` (solo comentario)
- `src/supabase.js:3-4`: URL del proyecto y **clave publishable (`sb_publishable_…`) escritas en el código**, no leídas de `VITE_SUPABASE_ANON_KEY`. Es la clave pública por diseño (equivale a la anon key), así que no es una fuga, pero contradice la convención esperada. No hay ningún `import.meta.env` en `src/` (grep = 0), por lo tanto **no se inyecta ninguna variable `VITE_`** en el bundle; no existe `dist/` en el clon.
- `supabase/functions/probar-dte-openfactura/index.ts:50-51`: una API key del **ambiente de desarrollo público de Haulmer** (el propio comentario, líneas 26-29, dice que es la publicada en su documentación) y la URL `dev-api.haulmer.com`. No es un secreto de Serein. Si algún día se carga `OPENFACTURA_API_KEY` de producción, la función la usará pero seguirá apuntando a dev (línea 51) — verificar antes de reutilizar este archivo.
- `supabase/migrations/2026-08-07-cartolas-bancarias-seed.sql`: **610 movimientos bancarios reales** (Banco de Chile, enero–julio 2026) y el **número de cuenta corriente** en el encabezado (línea 2), versionados en git. No es una credencial, pero es información financiera sensible que viaja con cada clon del repositorio.
- `integraciones/correos-google-apps-script.gs:25`: URL de la función con placeholder `TU-PROYECTO`; sin tokens. Se autentica con `ScriptApp.getOAuthToken()` (línea 148).
- `supabase/functions/whatsapp-webhook/index.ts:31,49`: URL del proyecto Supabase hardcodeada (pública, no es secreto).

### 1.2 Historial completo de git
Comandos usados: `git log --all -S <patrón>` para `service_role`, `eyJ`, `sk-ant`, `SUPABASE_SERVICE`, `GOCSPX`, `AIza`, `ghp_`, `xoxb-`, `sb_secret_`, `client_secret`, `refresh_token`, `apikey=`, `Bearer ey`, `EAAG`; `git log --all --diff-filter=A --name-only -- '*.env*'`; `git grep` en cada commit que tocó `service_role`.

| Patrón | Commits con el patrón | Resultado |
|---|---|---|
| `eyJ` (JWT) | 0 | Nunca se commiteó un JWT (ni anon legacy ni service_role). |
| `sk-ant` | 0 | Nunca se commiteó una llave de Anthropic. |
| `GOCSPX`, `AIza`, `ghp_`, `xoxb-`, `sb_secret_`, `client_secret`, `refresh_token`, `apikey=`, `Bearer ey`, `EAAG` | 0 | Nada. |
| `*.env*` añadido alguna vez | 0 archivos | Ningún `.env` entró jamás al repo. |
| `service_role` / `SUPABASE_SERVICE` | 6989d14, 1b23dfd, 3a2de46, 16a2729, e5fb58a, ab9760c, 8b8c2bd, 724c289, 2174f10 | En **todos** los casos es `Deno.env.get(...)`, `process.env...` o comentario (verificado con `git grep -o` en cada commit). |
| `VITE_SUPABASE_ANON_KEY` | 6989d14, 724c289, 2174f10 | Solo aparece en `INSTRUCTIVO.md`/texto; `src/supabase.js` nunca usó la variable de entorno (único commit del archivo: 6989d14, ya con la publishable key literal). |

Archivos alguna vez commiteados fuera de `src/`, `supabase/`, `public/`, `integraciones/`, `scripts/`: `.gitignore`, `INSTRUCTIVO.md`, `index.html`, `libro-ventas-sync_index.ts` (copia temporal de la función, commit 3a2de46, también solo env vars), `package*.json`, `vite.config.js`. Nunca se commiteó `dist/` ni `backups/`.

**Conclusión:** la exposición pasada de la service_role **no ocurrió a través de este repositorio** (ni en el árbol ni en ningún commit de ninguna rama). Si no se rotó en su momento, igual corresponde rotarla desde el panel de Supabase.

### 1.3 `.gitignore`
`.gitignore` (4 líneas): `backups/`, `node_modules/`, `dist/`, `supabase/.temp/`. **No cubre `.env`, `.env.local` ni `.env.*`.** Hoy no hay daño porque nunca se creó un `.env`, pero el primer `.env` que alguien cree para desarrollo local entraría con `git add -A`.

---

## 2. Frontend

- `src/supabase.js:1-6` crea un único cliente con la publishable key. Ningún archivo de `src/` referencia `service_role`/`SERVICE_ROLE` (grep sobre `src/` = 0).
- No hay `import.meta.env` ni `process.env` en `src/` → el bundle no recibe variables `VITE_`; solo lleva la URL y la publishable key (ambas públicas).
- `src/serein-ai/` (chat widget): no llama a Anthropic desde el navegador (grep `anthropic|x-api-key|fetch(` = 0); solo lee/escribe `ai_conversaciones`, `ai_mensajes`, `ai_auditoria` (`src/serein-ai/historial.js:17-66`). Esas tres tablas **no tienen migración en el repo** → RLS NO VERIFICABLE.
- La app hace `fetch` a servicios externos sin credenciales: `mindicador.cl` (`src/Dashboard.jsx:297,425`, `src/ParametrosModule.jsx:191`) y `date.nager.at` (`src/feriadosChile.js:82`). Sin riesgo de credenciales; sí dependencia de terceros.

---

## 3. RLS (desde las migraciones; contrastar con `pg_policies`)

### 3.1 Tablas que la app usa y que NO tienen migración en el repo (RLS NO VERIFICABLE)
`app_state`, `libro_ventas` y `libro_compras` (solo `alter table … add column` en 2026-07-20/08-19/10-08), `proveedores`, `oc_proveedor`, `ai_conversaciones`, `ai_mensajes`, `ai_auditoria`, `recomendaciones`, `alertas`, `analisis_financiero`, `analisis_operacional`, `analisis_comercial`, `analisis_cobranza`, `compras_sin_doc`, `tipos_gasto`, `proveedor_tipo`, `correos`, vistas `v_vendedor_stats`, `v_seguimientos_pendientes`, `v_clientes_sin_contacto`. También faltan en el repo las políticas de `storage.objects` para el bucket **`fotos-ot`** (setup.sql:742 solo dice "crear bucket privado") y la Edge Function `libro-compras-sync` que invoca `src/LibroComprasModule.jsx:307`.

Lo que se sabe de `app_state` por comentarios y por la función de la migración:
- `supabase/migrations/2026-07-25-fix-permisos-app-state.sql:12-14`: "La política de LECTURA (`app_state_select_all`) ya es `true` para cualquier usuario autenticado — cualquier persona con sesión ya puede leer TODOS los blobs".
- `…:21-29`: `puede_escribir_app_state(clave text)` → `security definer`, devuelve `exists (select 1 from perfiles where id = auth.uid())`. **Ignora el parámetro `clave`**: cualquier usuario con fila en `perfiles` puede escribir **cualquier** clave `serein_*`.
- Los perfiles `subcontrato` y `taller_externo` **tienen fila en `perfiles`** (es lo que `App.jsx:89-96` lee para enrutarlos), por lo tanto cumplen `puede_escribir_app_state()` y `app_state_select_all`. El frontend no les ejecuta `pullState()` (`App.jsx:121`), pero con su JWT y la publishable key pueden pedir `GET /rest/v1/app_state` o `PATCH`/`POST` desde cualquier cliente HTTP.

### 3.2 (a) Qué queda expuesto en `app_state` aunque la UI lo oculte
Claves escritas por el frontend (grep `localStorage.setItem('serein_…')`), todas suben enteras con `pushState()` (`src/sync.js:277-331`) y bajan enteras con `pullState()` (`src/sync.js:175-186`) y por el canal realtime (`src/Dashboard.jsx:379`):

| Clave | Contenido monetario / sensible |
|---|---|
| `serein_fin` | gastos, obligaciones, cuotas, deudas (módulo Finanzas, solo gerencia en UI) |
| `serein_pp` | órdenes de compra, cobros, pagos a proveedores, facturas por cobrar |
| `serein_ots` | valor de cada OT, costos, márgenes (lo que `verValores` oculta a supervisores), fotos (URLs firmadas 5 años) |
| `serein_cotizaciones` | precios, márgenes y condiciones de cada cotización |
| `serein_facturas` | facturas por área con montos y estado de pago |
| `serein_mo` | **sueldos, imposiciones, valor hora, horas extra por trabajador** (`ManoObraModule`) |
| `serein_proyectos` | EDP, ventas, avances, costos de proyectos |
| `serein_comprasOp`, `serein_configCompras` | compras con monto (la UI decide `supervisorVeMontoDespues`) |
| `serein_inventario`, `serein_invMov` | stock y valorización |
| `serein_params` | parámetros de costos, UF, comisiones, certificados (URLs firmadas) |
| `serein_contactos`, `serein_clientes` | cartera de clientes con contactos |
| `serein_logo`, `serein_logoIstria` | imágenes base64 (sin riesgo, pero infla cada descarga) |

El filtro de valores para supervisores es **solo visual**: `src/Dashboard.jsx:310` (`verValoresOT = (esGerencia || ['caro@…','mario@…'].includes(email)) && !sinValores.includes('GESTION_OT')`), `:188-192` (`esGerencia`, `puedeVer`), y `src/serein-ai/permisos.js:6-7` lo reconoce como "espejo" de la UI. Un supervisor ejecuta `pullState()` igual que gerencia (`App.jsx:120-123`), así que todo lo anterior queda en **su `localStorage`** (`Dashboard.jsx:60` `LS()` lo lee de ahí) y basta abrir DevTools → Application → Local Storage para ver sueldos y márgenes. Además `src/Dashboard.jsx:365` deja la UI en estado "sincronizando" para cualquier perfil no externo.

Lo mismo vale para la tabla real `movimientos_bancarios` (cartolas del banco): `supabase/migrations/2026-08-07-cartolas-bancarias.sql:44-60` — select/insert/update para **cualquier fila en `perfiles`** (incluye supervisores, `subcontrato`, `taller_externo`); el comentario de la migración (líneas 44-48) reconoce que la restricción es "visual, en Dashboard.jsx". No hay política `delete` (bien).

### 3.3 Inventario de tablas con RLS según migraciones

**Con RLS habilitado y políticas**

| Tabla (archivo:línea) | Lee | Escribe | Observación |
|---|---|---|---|
| `perfiles` (setup.sql:15-20; 2026-09-20-fix-perfiles-recursion.sql:24-27) | propio (`auth.uid() = id`) + gerencia/admin (`es_gerencia_o_admin()`) | **ninguna política** → solo service_role / SQL Editor | Correcto: nadie puede escalar editando su `tipo`/`modulos`. |
| `proyectos`, `edps`, `facturas_sii`, `compras_proyecto` (setup.sql:114-190) | por área del perfil | por área (`for all`) | `facturas_sii`: `area is null or …` → filas sin área las ve cualquier autenticado (línea 130). |
| `reglas_clasificacion` (setup.sql:133) | **`using (true)`** sin `to authenticated` | ninguna | Legible también por `anon` (rol público). Solo reglas razón social→área: fuga menor. |
| `ordenes_trabajo`, `ot_ventas`, `ot_costos`, `ot_fotos` (setup.sql:235-252, 756-761) | por área / gerencia | por área | OK (pero la app no usa estas tablas: usa `serein_ots` en `app_state`). |
| `cargos_mo`, `trabajadores` (setup.sql:351-359) | `auth.uid() is not null` (cualquier autenticado, incl. externos) | gerencia | Nombres/datos de trabajadores visibles para subcontratistas. |
| `valores_mo`, `costos_mo` (setup.sql:362-369) | gerencia | gerencia | OK (sueldos protegidos **aquí**, pero el mismo dato vive en `serein_mo` de `app_state`). |
| `asistencias`, `asistencia_trabajadores`, `asistencia_ots`, `horas_extras` (setup.sql:372-396) | supervisor dueño o gerencia | ídem | OK. |
| `areas_gasto`, `gastos`, `gasto_distribucion`, `plantillas_distribucion`, `obligaciones`, `obligacion_distribucion`, `cuotas` (setup.sql:513-527) | gerencia (`fin_solo_gerencia`) | gerencia | OK. |
| `cotizaciones`, `cotizacion_items`, `cotizacion_revisiones` (setup.sql:556-569; 2026-07-18:151-157) | por área | por área | OK. |
| `avances_produccion`, `avance_ajustes` (setup.sql:611-632) | planta del perfil / gerencia | supervisor en su planta / gerencia | OK. |
| `compras_operativas`, `compras_op_asignacion`, `compras_op_montos`, `config_permisos` (setup.sql:701-738) | dueño/gerencia; montos solo gerencia | ídem | OK. |
| `int_productos`, `int_espesores`, `int_parametros` (2026-07-18:132-148) | cualquier autenticado | gerencia | Precios de productos intumescentes visibles a externos. |
| `organigrama_persona`, `organigrama_flujo` (2026-07-19:66-76) | cualquier autenticado | gerencia | — |
| `organigrama_costos` (2026-07-19:78-80) | gerencia | gerencia | OK. |
| `clientes`, `crm_contactos_persona`, `crm_interacciones`, `crm_oportunidades` (2026-07-20-crm.sql:98-99), `crm_campanas` (2026-07-20-crm-campanas.sql:32), `vendedores` (2026-07-21:21) | **`auth.uid() is not null`** | **`for all` con `auth.uid() is not null`** (incluye delete) | Cualquier autenticado —también `subcontrato`/`taller_externo`— puede leer, modificar y **borrar** la cartera de clientes, oportunidades e inversión en campañas. |
| `movimientos_bancarios` (2026-08-07:49-60) | cualquier fila en `perfiles` | insert/update ídem | Ver 3.2. |
| `subcontrato_asignaciones`, `facturas_subcontrato` (2026-09-20:34-105) | propio o gerencia/admin | insert propio **solo si hay asignación real** (líneas 88-96); decidir: gerencia | Bien diseñado. Nota: las políticas consultan `perfiles` directamente (líneas 39, 47-48, 80, 104-105) en vez de `es_gerencia_o_admin()`; no recursan porque no son políticas *de* `perfiles`, pero dependen de `leer_mi_perfil`. |
| `taller_asignaciones`, `taller_partes`, `taller_lecturas` (2026-09-21:32-110) | propio/gerencia | propio por OT asignada | Bien. `taller_lecturas` no tiene update/delete (solo insert) — correcto. |
| `credito_clientes`, `credito_documentos`, `credito_evaluaciones`, `credito_parametros`, `credito_ordenes_compra`, `credito_facturas` (2026-10-07:92-106; credito-ordenes-facturas:48-54) | gerencia/admin | gerencia/admin | OK. |
| `correo_documentos` (2026-10-08:49-51) | gerencia/admin | gerencia/admin | OK. |
| `storage.objects` — `facturas-subcontrato` (2026-09-20:117-133) | propio (carpeta = `auth.uid()`) o gerencia | insert solo en carpeta propia | Bien. Sin política de delete (nadie borra desde la app). |
| `storage.objects` — `credito` (2026-10-07:114-117), `correos` (2026-10-08:58-61) | gerencia/admin | gerencia/admin | OK. |

**(b) Con RLS habilitado y SIN políticas (solo service_role)**
- `correos_vistos` (2026-10-15:32) — intencional y correcto.
- `ia_uso` (2026-10-15:59) — intencional. Consecuencia: el módulo de consumo de IA no puede leerla desde el frontend sin una política o función.

**(c) Políticas `using (true)` o equivalentes**
- `reglas_clasificacion` → `using (true)` (setup.sql:133) — única literal.
- Equivalentes "cualquier autenticado": `auth.uid() is not null` en CRM (6 tablas), `cargos_mo`, `trabajadores`, `int_*`, `organigrama_persona/flujo`, `config_permisos`; `exists(perfiles where id = auth.uid())` en `movimientos_bancarios` y en `puede_escribir_app_state()`.
- `app_state_select_all = true` para autenticados: solo conocida por el comentario (2026-07-25:12-14), NO VERIFICABLE.

**(d) Funciones de rol y recursión**
- `es_gerencia()` (setup.sql:265-268): `language sql stable`, **sin `security definer` ni `set search_path`**. Funciona porque consulta `perfiles` como el propio usuario, al que `leer_mi_perfil` le deja ver su fila. Si alguna vez se endurece `leer_mi_perfil`, todas las políticas que la usan (≈30) dejarían de funcionar. Sin `search_path` fijo es vulnerable a *search_path hijacking* solo si un atacante pudiera crear objetos en un esquema previo — bajo en Supabase, pero es la recomendación estándar.
- `es_gerencia_o_admin()` (2026-09-20-fix-perfiles-recursion.sql:14-22): `security definer`, `set search_path to 'public'`, `stable`. Correcta; es la que resolvió la recursión de `perfiles_leer_gerencia` (la versión rota, 2026-09-20-portal-subcontratistas.sql:142-145, consultaba `perfiles` desde una política *de* `perfiles`). La migración "fix" **debe haberse corrido después** de la del portal; si en `pg_policies` `perfiles_leer_gerencia` sigue con el `exists(... perfiles pf ...)` literal, el login está roto para todos (según el comentario de la propia migración).
- `puede_escribir_app_state(clave)` (2026-07-25:21-29): `security definer`, `search_path` fijo, pero ignora `clave` (ver 3.1).
- Dos funciones con el mismo criterio (`es_gerencia` y `es_gerencia_o_admin`) → riesgo de divergencia futura.

**Migraciones que podrían no haberse corrido** (solo verificable en la base): todas son archivos sueltos sin tabla de control de versiones (no hay `supabase/config.toml` ni `schema_migrations` en el repo). Las críticas para seguridad: `2026-09-20-fix-perfiles-recursion.sql`, `2026-07-25-fix-permisos-app-state.sql`, `2026-10-15-correos-vistos-ia-uso.sql` (sin ella `correos-ingresar` escribe en tablas inexistentes y lo ignora en silencio, `index.ts:177-185, 227-233`).

---

## 4. Autenticación y rutas

- **Sesión**: `src/App.jsx:65-82` usa `supabase.auth.getSession()` y `onAuthStateChange`. El refresh del token lo hace supabase-js (autoRefreshToken por defecto, sesión persistida en `localStorage`). La app solo desmonta el Dashboard ante `SIGNED_OUT` explícito (`App.jsx:78`), que supabase-js también emite cuando falla la renovación.
- **URL directa sin sesión**: no hay router; cualquier ruta renderiza `<App/>` y, sin sesión, `<Login/>` (`App.jsx:162`). Los datos no se cargan antes de tener sesión y perfil (`App.jsx:120`). Correcto. (Vercel: no hay `vercel.json` en el repo, así que no se puede verificar el rewrite SPA ni cabeceras de seguridad.)
- **Cierre de sesión**: `App.jsx:153-158` llama `supabase.auth.signOut()` y limpia estado React, **pero no borra `localStorage`**: todas las claves `serein_*` (finanzas, sueldos, márgenes) quedan en el disco del equipo después de cerrar sesión. Grep de `localStorage.clear`/`removeItem('serein` solo encuentra el botón de emergencia del `ErrorBoundary` (`App.jsx:23`). En un computador compartido de planta, el siguiente usuario (o cualquiera con acceso físico) abre DevTools y ve todo sin iniciar sesión. Además, por la PWA (`vite.config.js:9-35`) la app queda instalada en celulares; el service worker solo cachea archivos estáticos (comentario línea 5), no datos.
- **Rama por tipo de perfil**: `App.jsx:176-177` → `subcontrato` → `SubcontratoApp`; `taller_externo` → `TallerExternoApp`; cualquier otro `tipo` (gerencia, admin, jefe, supervisor, proyectos, facturación…) → `Dashboard`. La decisión viene de `perfiles.tipo`, que el usuario no puede editar (sin política de escritura). Bien.
- **¿Puede un `subcontrato`/`taller_externo` ejecutar `pullState()`?** Desde la UI no: `App.jsx:121` devuelve antes y los componentes externos no importan `sync.js` (`SubcontratoApp.jsx:1-14`, `TallerExternoApp.jsx:1-14`). `TallerExternoApp` reutiliza `TableroControlTaller` (`ControlTallerModule.jsx`), que lee `taller_partes`/`taller_lecturas` y sube a `fotos-ot` (líneas 32, 57, 115, 265, 273), no `app_state`. **Pero** la barrera es solo de frontend: con su JWT pueden llamar a `/rest/v1/app_state` directamente (ver 3.1). También pueden invocar cualquier Edge Function (ver 6).
- **Roles por email hardcodeados**: `src/Dashboard.jsx:194,197,310` y `src/serein-ai/permisos.js:17-22,33` conceden permisos a `caro@`, `mario@`, `joce@`, `jose@`, `produccion@` por el correo. Si se reasigna un correo, el permiso viaja con él; y es una segunda fuente de verdad distinta de `perfiles`.
- **Recuperación de contraseña**: `Login.jsx:37` redirige al origen actual; `App.jsx:71,161,215-237` fija nueva clave (mínimo 6 caracteres, `App.jsx:230`). La política de contraseñas real la define Supabase Auth (no verificable aquí).
- **Supervisores**: `Dashboard.jsx:206` les arma pestañas limitadas, pero igual se ejecuta `pullState()` completo (ver 3.2).

---

## 5. Inputs e inyección

- **REST con texto del usuario** (Edge Function `correos-ingresar`): `index.ts:119-122` usa `encodeURIComponent` para `rut`, `cliente` (`ilike`) y `numero`; `tipo` y `campo` (línea 122) son valores internos ya validados (solo `oc`/`cotizacion`); `index.ts:208,220` `encodeURIComponent(gmailId)`; `index.ts:214` interpola `huella` (hex SHA-256 generado en la función, seguro); `index.ts:242-248` construye `gmail_id=in.(…)` **saneando cada id a `[A-Za-z0-9_-]`** antes de entrecomillar. No encontré inyección de filtros PostgREST.
- **supabase-js en el frontend**: todo va por el query builder (`.eq`, `.update`, `.insert`); no hay `.or()`/`.ilike()` con texto crudo (grep = 0) ni consultas REST manuales.
- **`document.write` / `innerHTML` con datos de la base** — vector de **XSS almacenado entre usuarios** (como todos pueden escribir `app_state`, un nombre de cliente/trabajador con `<img src=x onerror=…>` se ejecuta en el origen de la app cuando otro usuario imprime):
  - `src/informeFacturas.js:83` (`${f.cliente}`) → `:127 w.document.write(...)`; sin ninguna función de escape en el archivo.
  - `src/informeCobranzaPDF.js:100` (`${x.cliente}`) → `:158`; sin escape.
  - `src/ManoObraModule.jsx:1456-1457` (`${r.Nombre}`, `${r.Cargo}`, `${r.Trabajador}`) → `:1478`; sin escape.
  - `src/CotizacionesModule.jsx:413` (`${cot.folio}` en `<title>`) — el resto del archivo usa `escH` (`:94`); revisar que todas las interpolaciones de `htmlDoc`/`htmlOferta` pasen por `escH`.
  - `src/protocolo-pdf.js:20` `innerHTML` con el HTML del protocolo (generado por `OTModule` con `esc()`, `:3021` y 31 usos más) — OK si todo pasa por `esc`.
  - `src/OrdenesCompraModule.jsx:59-70` usa `esc()` — OK.
  - No hay `dangerouslySetInnerHTML`, `eval` ni `new Function` (grep = 0).
- **`window.open` con URLs**: solo se abren URLs firmadas generadas por Supabase (`CorreosModule.jsx:135` con `noopener`; `CreditoModule.jsx:284` **sin `noopener`**) o ventanas en blanco. `OTModule.jsx:3117` hace `fetch(url)` de certificados cuyo URL viene de `serein_params` (editable por cualquier autenticado) y lo descarga como archivo — un URL malicioso solo descargaría un archivo, no ejecuta.
- **Subida de archivos**: 36 `<input type="file">` con `accept` (pdf/imágenes/xlsx). **No hay validación de tamaño en ningún archivo de `src/`** (grep `.size >`, `MAX_` = 0). Las imágenes de OT se comprimen a JPEG antes de subir (`OTModule.jsx:2884-2910`). Los certificados (`ParametrosModule.jsx:302-310`) se suben con el `file.type` que declara el navegador y `application/octet-stream` por defecto, al bucket `fotos-ot`, y se guarda un **URL firmado de 5 años** (`:307`; igual en `OTModule.jsx:2908,3601` y `ControlTallerModule.jsx:59`) dentro de `app_state`. Esos enlaces no se pueden revocar sin borrar el archivo, y cualquiera que lea el blob los tiene. El subcontratista sube con `contentType: 'application/pdf'` fijo (`SubcontratoApp.jsx:163`) aunque el `accept` permite imágenes, y el nombre se sanea (`:161`).
- **Edge Functions antes de insertar**:
  - `extraer-*` (ej. `extraer-factura/index.ts:68-85`): aceptan cualquier `archivos[].base64` y `mimeType`; **sin límite de cantidad ni tamaño** (grep `length >`/`MAX_` en todos los `extraer-*` y `redactar-oferta` = 0). Un solo POST puede mandar decenas de PDF pesados a Claude con `max_tokens: 8192`. No escriben en la base (línea 10-12 del comentario) y normalizan montos (`:122-150`).
  - `correos-ingresar/index.ts:38-46`: topes `MAX_IA_POR_LLAMADA = 10`, `MAX_INTENTOS = 3`, `consultar` limitado a 1000 ids (`:296`); desduplica por `correos_vistos` antes de llamar a la IA; escribe con service_role usando `on_conflict`. Bien.
  - `whatsapp-webhook/index.ts:70-119`: inserta en `clientes`/`crm_interacciones` **lo que venga en el body**, con service_role, sin validar la firma `X-Hub-Signature-256` de Meta (no hay ningún `crypto`/`signature` en el archivo). Solo se verifica el `hub.verify_token` del GET de suscripción (`:58-67`).
  - `enviar-alertas-vencimiento/index.ts:31-47` y `notificar-factura-subcontrato/index.ts:44-52`: escapan HTML (`escapeHtml`). El **asunto** de `notificar-…` (`:62`) interpola `subcontratista` sin escape (en un asunto no ejecuta, pero permite suplantar texto).
  - `subir-*-drive/index.ts:77`: nombre de carpeta en la query de Drive con escape de comillas; `filename` (`:111-124`) se usa tal cual como nombre en Drive.
  - `probar-dte-openfactura/index.ts:60-66`: reenvía el `dte` sin validar al ambiente dev de Haulmer.

---

## 6. Edge Functions

No existe `supabase/config.toml` ni `deno.json`/metadatos en `supabase/functions/*` (solo `index.ts`), así que **el estado real de `verify_jwt` de cada función NO ES VERIFICABLE desde el repo**. Lo que dicen los comentarios y el código:

| Función | `verify_jwt` según comentarios | Autorización en el código | CORS | Riesgo si la llama un anónimo / un autenticado sin permiso |
|---|---|---|---|---|
| `correos-ingresar` | **Desactivado** (`index.ts:28`) | `x-correos-token` == `CORREOS_TOKEN` **o** `x-acceso-casilla` validado contra `oauth2.googleapis.com/tokeninfo` y lista de 3 casillas (`:257-271`). Devuelve 401 antes de leer el body (`:278-279`). | `*` | Bien protegida. Sin `CORREOS_TOKEN` cargado, solo vale la vía Google (correcto). Comparación `===` no es tiempo-constante (menor). |
| `whatsapp-webhook` | Debe estar desactivado para que Meta lo llame (`:29-34`) | GET: `hub.verify_token`. **POST: ninguna** | `*` | Cualquiera que conozca la URL (está en el comentario `:31`) crea leads falsos / interacciones en el CRM con service_role. |
| `libro-ventas-sync`, `defontana-sync`, `sii-sync` | No se indica | **Ninguna** (`libro-ventas-sync/index.ts:110-116`; `defontana-sync/index.ts:97` ignora `req`) | `*` | Disparar sincronizaciones con Defontana/SII a voluntad (carga, posibles bloqueos de la API del proveedor); escriben con service_role en `libro_ventas`, `proveedores`, `oc_proveedor`. |
| `extraer-factura`, `extraer-factura-compra`, `extraer-guia`, `extraer-oc`, `extraer-oc-comercial`, `extraer-oc-proveedor`, `extraer-cubicacion`, `extraer-hoja-avance`, `extraer-listado-partes`, `extraer-credito`, `redactar-oferta` | No se indica (la app las invoca con `supabase.functions.invoke`, que manda el JWT de sesión) | **Ninguna** dentro de la función (ningún `getUser`/`Authorization` en 11 archivos) | `*` | Si `verify_jwt` está apagado: **cualquier anónimo gasta créditos de Anthropic** (`ANTHROPIC_API_KEY`, 12 usos) sin límite de tamaño ni frecuencia. Si está encendido: cualquier usuario autenticado —incluidos `subcontrato`/`taller_externo` (que legítimamente usan `extraer-factura-compra`, `SubcontratoApp.jsx:141`, y `extraer-listado-partes`/`extraer-hoja-avance`, `ControlTallerModule.jsx:90,226`)— puede llamar a **todas** las demás y gastar sin tope. |
| `enviar-alertas-vencimiento`, `notificar-factura-subcontrato` | No se indica | Ninguna | `*` | Enviar correos arbitrarios (contenido escapado) desde el dominio de Serein a `ALERTAS_EMAIL_TO` vía Resend: spam/phishing interno y consumo de cuota. |
| `subir-factura-venta-drive`, `subir-factura-compra-drive`, `subir-protocolo-drive` | No se indica | Ninguna | `*` | Subir archivos arbitrarios (base64) al Google Drive de Serein con la cuenta de servicio (`GOOGLE_SERVICE_ACCOUNT_JSON`, scope `drive` completo, `:50`). |
| `probar-dte-openfactura` | No se indica | Ninguna | `*` | Emitir DTE de prueba contra el ambiente dev de Haulmer; si se carga `OPENFACTURA_API_KEY` de producción y se cambia la URL, pasaría a emitir documentos reales sin control. |

Notas sobre `verify_jwt`: aunque esté activado, solo comprueba que el `Authorization: Bearer` sea un JWT válido del proyecto; **no distingue roles** y, con la anon key legacy (que es un JWT), también pasa. La app usa la clave `sb_publishable_`; cómo trata la pasarela esa clave como Bearer sin sesión no se puede confirmar desde el repo. En cualquier caso, ninguna de las 20 funciones comprueba `perfiles.tipo`, por lo que la autorización por rol no existe en el backend.

`Access-Control-Allow-Origin: *` en las 20 funciones: aceptable para endpoints que exigen token, pero facilita que un sitio de terceros use el navegador de un usuario con sesión activa para invocar funciones (el JWT está en `localStorage`, no en cookie, así que un tercero no lo tiene; el riesgo real es bajo). Mejor restringir al dominio de Vercel.

Consumo de IA: solo `correos-ingresar` registra en `ia_uso` (`:177-185`); las 11 funciones `extraer-*`/`redactar-oferta` **no registran consumo ni limitan**, y `ia_uso` no tiene política de lectura, así que el módulo de la app no puede mostrarlo.

---

## Resumen por severidad

### CRÍTICO
1. **`app_state` legible y escribible por cualquier usuario con perfil, incluidos externos** — `supabase/migrations/2026-07-25-fix-permisos-app-state.sql:12-29` (función ignora `clave`; lectura `true` para autenticados según el comentario); `src/App.jsx:120-123`; `src/sync.js:175-186, 277-331`. Riesgo: un subcontratista o un taller externo (y cualquier supervisor) puede descargar con un `curl` todas las finanzas, sueldos, márgenes y cotizaciones de Serein, y también **sobrescribir o vaciar** OTs, cotizaciones y facturas (la app ya sufrió pérdidas por pisadas accidentales; una maliciosa es trivial). Corrección: política de `app_state` por rol (`select`/`update` solo si `perfiles.tipo in ('gerencia','admin','jefe','supervisor', …)` y `tipo not in ('subcontrato','taller_externo')`), y a mediano plazo separar en claves por módulo con políticas por clave (la función ya recibe `clave`: usarla), o migrar los datos monetarios a tablas reales con RLS como ya se hizo con subcontratos/taller/crédito.

### ALTO
2. **Supervisores reciben el blob completo con valores monetarios; el filtro es solo visual** — `src/Dashboard.jsx:188-192, 310`, `src/serein-ai/permisos.js:6-7`; datos en `localStorage` (`Dashboard.jsx:60`). Riesgo: cualquier supervisor ve sueldos (`serein_mo`), márgenes de OT y finanzas abriendo DevTools. Corrección: depende del punto 1 (RLS por rol/clave); mientras tanto, no cargar `serein_fin`, `serein_pp`, `serein_mo` para perfiles sin permiso (filtrar en `pullState` por lista de claves según `perfil`, y la política en la base).
3. **`movimientos_bancarios` (cartolas del banco) legible y editable por cualquier perfil, incluidos externos** — `supabase/migrations/2026-08-07-cartolas-bancarias.sql:44-60`. Riesgo: exposición de todos los movimientos de la cuenta corriente y posibilidad de alterar categorías/montos. Corrección: `using (public.es_gerencia_o_admin())` en las tres políticas.
4. **CRM completo (`clientes`, `crm_*`, `vendedores`, `crm_campanas`) legible, editable y borrable por cualquier autenticado, incluidos externos** — `2026-07-20-crm.sql:98-99`, `2026-07-20-crm-campanas.sql:32`, `2026-07-21-crm-vendedores.sql:21`. Riesgo: un subcontratista puede exportar o borrar la cartera de clientes y ver la inversión publicitaria. Corrección: `for select/insert/update` con `tipo not in ('subcontrato','taller_externo')`; `delete` solo gerencia/admin.
5. **Edge Functions de IA sin autorización por rol ni límites, y `verify_jwt` no verificable** — 11 funciones `extraer-*`/`redactar-oferta` (ej. `supabase/functions/extraer-factura/index.ts:63-85`), sin `getUser`, sin tope de tamaño/cantidad, `max_tokens` 8192. Riesgo: gasto descontrolado de la cuenta de Anthropic (ya hubo un incidente de consumo el 2026-10-15) por cualquier usuario autenticado, y por anónimos si `verify_jwt` está apagado. Corrección: en cada función validar el JWT con `supabase.auth.getUser(token)` y el `tipo` del perfil (externos solo a las 3 que usan), limitar `archivos.length` y bytes de base64, registrar en `ia_uso` como ya hace `correos-ingresar`, y confirmar en el panel que `verify_jwt` esté activo en todas salvo `correos-ingresar` y `whatsapp-webhook`.
6. **XSS almacenado en informes impresos** — `src/informeFacturas.js:83,127`, `src/informeCobranzaPDF.js:100,158`, `src/ManoObraModule.jsx:1456-1457,1478` interpolan nombres de cliente/trabajador sin escapar en `document.write`. Riesgo: como cualquier usuario puede escribir `app_state`, un nombre con `<script>`/`onerror` se ejecuta en la sesión de gerencia al imprimir y puede leer su token de `localStorage`. Corrección: usar la misma `esc()` de `OrdenesCompraModule.jsx:60` en todas las interpolaciones; idealmente generar los informes con React/jsPDF en vez de concatenar HTML.

### MEDIO
7. **Cerrar sesión no borra los datos locales** — `src/App.jsx:153-158`. Riesgo: en equipos compartidos de planta, todo el ERP queda en `localStorage` tras salir. Corrección: en `salir()` eliminar todas las claves `serein_*`, `cotizador_*`, `__pushok_*`, `__protdesde_*` tras `signOut()` (asegurando antes que no haya push pendiente).
8. **Webhook de WhatsApp sin verificación de firma** — `supabase/functions/whatsapp-webhook/index.ts:70-119`. Riesgo: inserción de leads e interacciones falsas en el CRM por cualquiera que conozca la URL. Corrección: validar `X-Hub-Signature-256` con el App Secret de Meta antes de procesar.
9. **Funciones de correo, Drive, sincronización y DTE sin autorización** — `enviar-alertas-vencimiento/index.ts:48-66`, `notificar-factura-subcontrato/index.ts:25-42`, `subir-*-drive/index.ts:99-124`, `libro-ventas-sync/index.ts:110`, `defontana-sync/index.ts:97`, `probar-dte-openfactura/index.ts:53-66`. Riesgo: spam desde el dominio de Serein, archivos basura en el Drive corporativo, sincronizaciones forzadas. Corrección: mismo patrón del punto 5 (validar usuario y rol; `defontana-sync`/`sii-sync` deberían aceptar solo un token de cron).
10. **URLs firmadas de 5 años guardadas dentro de `app_state`** — `src/OTModule.jsx:2908,3601`, `src/ParametrosModule.jsx:307`, `src/ControlTallerModule.jsx:59`; políticas del bucket `fotos-ot` no están en el repo. Riesgo: cualquiera que haya leído el blob conserva acceso a fotos y certificados durante 5 años aunque se le quite la cuenta. Corrección: guardar solo la ruta y generar URLs firmadas cortas al mostrar (como ya hace `CorreosModule.jsx:133` con 120 s); documentar/crear las políticas de `fotos-ot`.
11. **`.gitignore` no cubre `.env`** — `.gitignore:1-4`. Riesgo: el primer `.env` local con la service_role entraría al repo con `git add -A`. Corrección: añadir `.env`, `.env.*`, `*.local`, `supabase/.env`.
12. **Datos bancarios reales versionados en git** — `supabase/migrations/2026-08-07-cartolas-bancarias-seed.sql` (610 movimientos + número de cuenta en la línea 2). Riesgo: cualquier persona con acceso al repositorio (colaboradores, forks, copias en Temp) tiene la contabilidad bancaria del primer semestre. Corrección: mover el seed fuera del repo (backup privado) y reescribir historial si se considera necesario; al menos no añadir más cargas así.
13. **Sin límite de tamaño en subidas** — ninguno de los 36 `<input type="file">` ni las funciones valida bytes; base64 en el body de las Edge Functions. Riesgo: cuotas de Storage/IA y bloqueos por payloads enormes. Corrección: tope en el cliente (p. ej. 10 MB) y en cada función (`base64.length`).

### BAJO
14. **`es_gerencia()` sin `security definer` ni `search_path`** — `supabase/setup.sql:265-268`; duplicada con `es_gerencia_o_admin()`. Corrección: redefinirla como alias de `es_gerencia_o_admin()` con `security definer set search_path = public`.
15. **`reglas_clasificacion` con `using (true)` legible por `anon`** — `supabase/setup.sql:133`. Corrección: `using (auth.uid() is not null)`.
16. **Tablas de solo-lectura general que ven los externos** (`trabajadores`, `cargos_mo`, `int_*`, `organigrama_persona`, `config_permisos`) — `setup.sql:352,357,736`; `2026-07-18:133-145`; `2026-07-19:67-73`. Corrección: excluir `subcontrato`/`taller_externo`.
17. **Permisos por correo hardcodeado** — `src/Dashboard.jsx:194,197,310`, `src/serein-ai/permisos.js:17-22,33`. Corrección: mover a columnas de `perfiles` (`areas`, `modulos`, `sin_valores` ya existen).
18. **`window.open` sin `noopener`** — `src/CreditoModule.jsx:284`. Corrección: añadir `'noopener'` como en `CorreosModule.jsx:135`.
19. **CORS `*` en las 20 funciones** — restringir a `https://<dominio-vercel>`; y comparación de `CORREOS_TOKEN` con `===` (`correos-ingresar/index.ts:262`) → usar comparación de tiempo constante.
20. **Clave publishable hardcodeada en vez de `VITE_SUPABASE_ANON_KEY`** — `src/supabase.js:3-4`. No es fuga (clave pública), pero dificulta usar un proyecto de staging. Corrección: `import.meta.env.VITE_SUPABASE_ANON_KEY` con fallback.
21. **`ia_uso` sin política de lectura** — `2026-10-15-correos-vistos-ia-uso.sql:59`. La UI no puede auditar el consumo. Corrección: `select` para gerencia/admin.
22. **Tablas y función usadas por la app sin migración en el repo** (lista en 3.1; `libro-compras-sync` invocada en `src/LibroComprasModule.jsx:307` sin código). No es vulnerabilidad en sí, pero impide auditar y reproducir el esquema. Corrección: exportar el esquema real (`supabase db dump`) al repo.

### Verificado y correcto
- Ninguna llave privada en el árbol ni en el historial; service_role solo por variables de entorno.
- `perfiles` sin políticas de escritura (nadie se auto-promueve); `es_gerencia_o_admin()` bien definida.
- Portal de subcontratistas y taller externo: RLS propia, inserción solo con asignación real, Storage por carpeta `auth.uid()`.
- Módulo de crédito, correos, finanzas (tablas reales), asistencias, compras operativas: solo gerencia/admin o dueño.
- `correos-ingresar`: autorización sólida, dedupe antes de la IA, topes por llamada, PostgREST saneado.
- Frontend sin `eval`, sin `dangerouslySetInnerHTML`, sin consultas REST manuales con texto libre.
