# Auditoría de DATOS — serein-app (commit 85627fd, rama main)

Revisión en solo lectura del clon `C:\Users\maria\gwt\serein-audit`. Todo lo que se afirma abajo
está respaldado por archivo:línea del repo. Lo que NO se puede ver desde el repo (estado real de la
base, PITR, buckets, políticas creadas a mano) se marca como **«verificar en la base»**.

---

## 0. Resumen ejecutivo

| Severidad | Hallazgo | Dónde |
|---|---|---|
| CRÍTICO | 15 de las ~17 claves `serein_*` siguen con «la última subida gana»: la fusión por id solo cubre `serein_ots` y `serein_facturas`. OC, cotizaciones, proyectos, finanzas, nómina, inventario, compras operativas, parámetros, contactos… se pisan entre sesiones. | `src/sync.js:111`, `:283-308` |
| CRÍTICO | No existe respaldo alguno en el repo ni en el código (ni export de `app_state`, ni snapshot programado; `backups/` está en `.gitignore` y no existe en el clon) y la mayoría de los borrados son duros sin papelera. | `.gitignore`, `scripts/migrar-fotos-ot-a-storage.mjs:8-10`, lista en §4.3 |
| ALTO | La tabla `app_state` y las tablas núcleo (`libro_ventas`, `libro_compras`, `compras_sin_doc`, `proveedor_tipo`, `tipos_gasto`, `oc_proveedor`, `proveedores`, `correos`, `ai_*`, `alertas`, `recomendaciones`, `analisis_*`) NO tienen definición en el repo. El esquema real está parcialmente versionado y depende de SQL corrido a mano. | §1.1 |
| ALTO | Las semillas (`*_SEED`, `OTS_INICIALES`) pueden subirse a producción: tras «Reiniciar datos locales» o un cambio de `LS_VER`, si el `pullState()` inicial falla, el Dashboard igual monta, escribe las semillas en localStorage y el `setInterval` de 5 s las sube. | `src/App.jsx:120-121`, `src/Dashboard.jsx:53-58,343` |
| ALTO | Puertas de versión destructivas en el frontend: si `mo.ver`, `pp.ocsVer`, `fin.credVer` o `contactos.ver` no coinciden con la constante del código, se descartan los datos reales y se vuelve a la semilla. | `src/ManoObraModule.jsx:1539,1548`, `src/Dashboard.jsx:281,282,306` |
| ALTO | Fotos: la galería `FotosOT` guarda la imagen sin comprimir en base64 dentro de `serein_ots`; el resto cae a base64 si Storage falla. `localStorage.setItem` está en `try/catch` vacío en toda la app → `QuotaExceededError` es invisible y el dato «guardado» nunca sube. Ya pasó (el propio código lo documenta). | `src/OTModule.jsx:2015-2025, 2884-2911`, `src/sync.js:29-37`, `src/Dashboard.jsx:62-64` |
| ALTO | Protección de cambios locales se descarta a los 90 s (30 min si hay fallas de push): «se prefiere perder una edición atascada». | `src/sync.js:18-23,154-159` |
| ALTO | Correlativos calculados en el cliente sin unicidad: dos sesiones pueden crear la misma `OT-2026-NNN` (y la fusión conserva ambas) o el mismo N° de OC; el N° de OC además es texto libre editable. | `src/OTModule.jsx:3885-3887`, `src/OrdenesCompraModule.jsx:120-122,201`, `src/ProveedoresPagosModule.jsx:293` |
| MEDIO | `num()` de casi todos los módulos borra el signo y los decimales: «-5.000» se guarda como 5000 y «12,5 m²» como 125. Validaciones silenciosas (`return` sin mensaje). | `src/OTModule.jsx:29,2861`, `src/FacturasModule.jsx:29,402-406`, `src/FinanzasModule.jsx:12`, `src/ManoObraModule.jsx:11` |
| MEDIO | Inventario acepta una **entrada** negativa (solo valida que el saldo final no quede < 0). | `src/InventarioModule.jsx:11,20-21,105-107` |
| MEDIO | URLs firmadas de Storage a 5 años guardadas dentro del blob: fotos, certificados y hojas de avance dejan de abrir al vencer; no hay re-firma. | `src/OTModule.jsx:2908,3601`, `src/ControlTallerModule.jsx:59`, `src/ParametrosModule.jsx:307` |
| MEDIO | Tabla de espesores intumescentes se reemplaza con `delete` + `insert` sin transacción: si el insert falla, la tabla de seguridad contra incendio queda vacía. | `src/intumescente-api.js:80-90` |
| MEDIO | Lápidas de facturas (`serein_facturasEliminadas`) y lista «no volver a traer» (`serein_facturasOcultasLibro`) son blobs compartidos sin fusión: una sesión atrasada puede pisarlas y «resucitar» facturas borradas. | `src/sync.js:69-76,111`, `src/facturasOcultas.js:10-22` |
| MEDIO | Seed de cartolas (610 filas) sin `unique`/`on conflict`: correrlo dos veces duplica todo; la tabla no tiene política de `delete`. | `supabase/migrations/2026-08-07-cartolas-bancarias-seed.sql:11`, `…cartolas-bancarias.sql:49-60` |
| MEDIO | Referencias a OT/CC/cotización como texto suelto sin FK en `libro_ventas.ot_id`, `libro_ventas.cc_ot`, `libro_compras.cc_ot`, `subcontrato_asignaciones.ot/cc`, `taller_*.ot`, `correo_documentos.numero_oc/ref_cotizacion`, `crm_oportunidades.cotizacion_folio`. Como las OT viven en un JSON, no hay FK posible hoy. | §1.4 |
| MEDIO | Tres fuentes paralelas de «clientes»: `serein_clientes`, `serein_contactos.clientes` y la tabla `clientes` del CRM. | `src/ClientesModule.jsx:19`, `src/ContactosModule.jsx:25-29`, `src/crm-api.js:11` |
| MEDIO | Mano de Obra: la «semilla» trae nombres y sueldos reales compilados en el bundle JS que descarga cualquier usuario con sesión; `FIN_SEED` trae el número de operación de un crédito real. | `src/ManoObraModule.jsx:55-65`, `src/FinanzasModule.jsx:26-44` |
| BAJO | `perfiles.modulos`, `perfiles.sin_valores`, `perfiles.tipo` con valores `subcontrato/taller_externo`, bucket `fotos-ot` y sus políticas: solo existen en comentarios o se descubrieron «resultó ser jsonb». Migración con uuid de usuario hardcodeado. | `…2026-09-29-quitar-santa-rosa…sql:7-12`, `…09-30…sql:11-13`, `…09-07-corregir…sql:4-6` |
| BAJO | Fechas sin validación de rango (futuras, 1900, vacías) en facturas, producción, OC, gastos. | §3.5 |
| BAJO | Claves auxiliares (`serein_ver`, `serein_libroVentasXlsx`, `serein_mapeosExcel`, `cotizador_params_v1`) se suben a `app_state` como si fueran datos. | `src/sync.js:3`, `src/FacturasModule.jsx:144`, `src/OTModule.jsx:634` |
| BAJO | `setup.sql` define ~30 tablas «fantasma» (`ordenes_trabajo`, `ot_ventas`, `ot_costos`, `asistencias`, `gastos`, `obligaciones`, `cuotas`, `avances_produccion`, `compras_operativas`, `ot_fotos`…) que el frontend nunca consulta: todo eso vive en blobs. | §1.3 |

---

## 1. Esquema real según el repo

### 1.1 Qué hay y qué falta

Archivos SQL del repo:

- `supabase/setup.sql` (761 líneas) — «Pega TODO este archivo en Supabase > SQL Editor» (línea 3). Fases 1-9.
- `supabase/migrations/*.sql` — 26 archivos, cada uno con la misma instrucción de pegarse a mano en el SQL Editor (ej. `2026-07-18-cotizacion-intumescente.sql:7`, `2026-08-19-libro-ventas-numero-cheque.sql:2`).

**Tablas que el código usa y que NO están definidas en ningún SQL del repo** (verificado con `grep` de `from('…')` en `src/` y `supabase/functions/` contra `setup.sql` + migraciones):

| Tabla / objeto | Quién la usa | Comentario |
|---|---|---|
| `app_state` (id, value, updated_at) | `src/sync.js:177,220,237,240,261,295,308` | Es la tabla principal de la app. Solo se la menciona en `2026-07-25-fix-permisos-app-state.sql` (función `puede_escribir_app_state`, política `app_state_select_all` citada en comentario línea 12) y en seeds que leen de ella. Su `create table`, PK y políticas **no están en el repo**. |
| `libro_ventas` | `LibroVentasModule`, `FacturasModule`, `Dashboard`, `ConsolidadoModule`, `AsesorModule`, `crm-api`, función `libro-ventas-sync` | Solo hay `alter table … add column if not exists` (`2026-07-20-libros-columnas-faltantes.sql:20-29`, `2026-08-19-*`). Sin PK/unique visibles. |
| `libro_compras` | `LibroComprasModule`, `OTModule`, `ProyComprasLibro`, `Dashboard`, `Consolidado`, `Asesor` | Igual: solo `add column` (`…libros-columnas-faltantes.sql:13-18`, `2026-10-08-libro-compras-anula-folio.sql:6`). |
| `compras_sin_doc`, `proveedor_tipo`, `tipos_gasto` | `LibroComprasModule`, `Consolidado`, `Asesor` | Citadas como «ya existentes» en `2026-08-07-cartolas-bancarias.sql:6` pero no definidas. |
| `oc_proveedor`, `proveedores`, `facturas_sii` (upsert) | `supabase/functions/defontana-sync`, `sii-sync` | `facturas_sii` sí está en `setup.sql:86`; las otras dos no. |
| `correos` | `src/CorreosModule.jsx` | No definida. |
| `ai_conversaciones`, `ai_mensajes`, `ai_auditoria`, `alertas`, `recomendaciones`, `analisis_cobranza/comercial/financiero/operacional` | `src/AsesorModule.jsx`, `src/serein-ai/historial.js` | Ninguna definida. |
| Bucket `fotos-ot` + políticas | `OTModule:2906`, `ControlTaller:57`, `Parametros:305` | Solo en comentario de `scripts/migrar-fotos-ot-a-storage.mjs:14-20` y `setup.sql:742`. |
| `perfiles.modulos` (jsonb), `perfiles.sin_valores` (jsonb) | `src/App.jsx:88` | `setup.sql:7-12` crea `perfiles` con `id, nombre, rol, areas text[]`; `setup.sql:263` agrega `tipo`; `2026-09-07` agrega `proyectos_ids`, `ocultar_inventario`. `modulos` y `sin_valores` nunca se crean: la migración `2026-09-29-perfil-facturacion.sql:20-21` dice «modulos es jsonb en esta base» y `2026-09-30…sql:11-13` «sin_valores resultó ser jsonb (no text[] como se asumió)». |

Conclusión: el esquema «de verdad» se construyó por partes a mano; el repo no permite reconstruir la base desde cero. **Verificar en la base**: `\d app_state`, `\d libro_ventas`, `\d libro_compras`, `\d perfiles`, índices/unique en `libro_ventas(document_number, client_rut)`.

### 1.2 Mapa de tablas definidas en el repo (tabla → columnas clave → relaciones)

Notación: PK = clave primaria, FK = foránea, U = unique, C = check, I = índice, NN = not null. «Usada por la app» se verificó con `grep from('tabla')`.

**`supabase/setup.sql`**

| Tabla (línea) | PK / claves | FK | Restricciones | Usada por la app |
|---|---|---|---|---|
| `perfiles` (7) | `id uuid` PK → `auth.users` cascade | — | `areas text[] NN default '{}'`; `tipo text NN default 'jefe'` (263) | Sí (`App.jsx:86-88`, Subcontratistas) |
| `proyectos` (63), `edps` (75), `facturas_sii` (86), `reglas_clasificacion` (104), `compras_proyecto` (155) | uuid PK | `edps.proyecto_id`, `compras_proyecto.proyecto_id` | RLS por área | `facturas_sii` solo desde `sii-sync`; el resto **no** |
| `ordenes_trabajo` (197) | uuid PK, `numero text NN U` | — | `area C in ('Santa Rosa','Istria')` — **excluye 'Proyectos'**, que la app sí usa | **No** (la app guarda OT en `serein_ots`) |
| `ot_ventas` (211), `ot_costos` (221), `ot_fotos` (744) | uuid PK | `ot_id → ordenes_trabajo` cascade; `factura_sii_id → facturas_sii` | `ot_fotos.etiqueta C` | **No** |
| `cargos_mo` (270), `valores_mo` (277), `trabajadores` (288), `asistencias` (295), `asistencia_trabajadores` (305), `asistencia_ots` (311), `horas_extras` (317), `costos_mo` (328) | uuid PK | varias | RLS: valores/costos solo gerencia | Solo `trabajadores` y `valores_mo` desde `organigrama-api.js`. **Mano de Obra no las usa** (usa `serein_mo`). |
| `areas_gasto` (412), `gastos` (421), `gasto_distribucion` (439) + trigger `validar_distribucion_100` (447-458), `plantillas_distribucion` (462), `obligaciones` (474), `obligacion_distribucion` (490), `cuotas` (497) | uuid PK | cascade | trigger suma 100 % | **No** (Finanzas usa `serein_fin`) |
| `cotizaciones` (534) | uuid PK, `numero text NN U` | `ot_id → ordenes_trabajo` | `estado C` 5 valores (reemplazado por 7 en `2026-07-18…sql:78-81`) | Sí, solo cotizador intumescente (`intumescente-api.js`). Las cotizaciones generales viven en `serein_cotizaciones`. |
| `cotizacion_items` (546) | uuid PK | `cotizacion_id` cascade | — | No |
| `avances_produccion` (579), `avance_ajustes` (595) | uuid PK | — | — | **No** (`serein_avances`) |
| `config_permisos` (646), `compras_operativas` (656), `compras_op_asignacion` (676), `compras_op_montos` (686) | PK; `compras_op_montos.compra_id` PK+FK | cascade | `porcentaje C >0 y <=100`; `iva/total generated` | **No** (`serein_comprasOp`) |

**`supabase/migrations/`**

| Tabla (archivo:línea) | PK / U / I | FK | Checks / defaults | Observación |
|---|---|---|---|---|
| `int_productos` (07-18:18) | uuid PK, `slug U` | — | `solidos_pct numeric(5,2) NN`, `densidad numeric(5,3) NN`, `precio_kg numeric(12,2) NN`, `capa_max_um int NN default 250`, `certificada bool NN default false`, `activo bool NN default true` | Borrado suave `activo=false` (`intumescente-api.js:74`) |
| `int_espesores` (07-18:37) | uuid PK, I `(producto_id, seccion_tipo)` | `producto_id → int_productos` cascade | `seccion_tipo C ('abierto','cerrado')`, `f15..f120_um int NN default 0`, `masividad_max` nullable (= banda máxima) | Sin unique por (producto, sección, banda): duplicables |
| `int_parametros` (07-18:51) | `clave text` PK | — | `valor numeric(14,4) NN` | upsert |
| `cotizaciones` + columnas (07-18:62-74) | — | `proyecto_id → proyectos`, `created_by → auth.users` | `moneda C ('CLP','UF')`, `motivo_no_adjudicacion C`, `revision_actual int NN default 1`, `tipo text NN default 'general'` | `monto_* bigint` |
| `cotizacion_revisiones` (07-18:89) | uuid PK, U `(cotizacion_id, revision)` | `cotizacion_id` cascade, `created_by` | `snapshot jsonb NN`, `resultados jsonb NN`; trigger `trg_revision_inmutable` bloquea UPDATE si estado ≠ Borrador (105-118) | **No bloquea DELETE** |
| `organigrama_persona` (07-19:19) | uuid PK, `slug U`, I `jefe_id` | `jefe_id`, `jefe_id_punteado` → self set null; `trabajador_id → trabajadores` | `area C` 6 valores, `tipo C`, `nivel_visual C`, `activo` | Seed con 26 personas reales (87-138) |
| `organigrama_flujo` (07-19:37) | uuid PK, `orden int NN U` | `persona_id` set null | — | |
| `organigrama_costos` (07-19:50) | `persona_id` PK+FK cascade | | `costo_manual bigint` | solo gerencia |
| `clientes` (07-20-crm:13) | uuid PK, `legacy_id U`, `whatsapp_id U`, I `whatsapp_id`, I `etapa`, I `campana_id`, I `vendedor_id` | `campana_id → crm_campanas` set null (07-20-campanas:26); `vendedor_id → vendedores` (07-21:34) | `etapa C` 5 valores, `estado C` | `vendedor text` y `vendedor_id` coexisten (07-21:31-37) |
| `crm_contactos_persona` (:37), `crm_interacciones` (:50), `crm_oportunidades` (:68) | uuid PK; `whatsapp_message_id U`; I `(cliente_id, fecha desc)`; I `cliente_id` | `cliente_id → clientes` cascade; `autor → auth.users` | `tipo C`, `direccion C`, `etapa C` | `cotizacion_folio text` sin FK |
| `crm_campanas` (07-20-campanas:9) | uuid PK | — | `canal C`, `estado C`, `presupuesto/gasto_real bigint` | |
| `vendedores` (07-21:12) | uuid PK, `nombre U` | — | | + 3 vistas `v_*` (44-86) |
| `libro_compras` / `libro_ventas` add columns (07-20-libros:13-29; 08-19 ×2; 10-08) | — | — | `oculto bool NN default false`, `estado_pago text NN default 'Pendiente'` | `ot_id`, `cc_ot`, `factoring_id`, `anula_folio`, `oc`, `nv`, `medio_pago`, `numero_cheque` todos `text` |
| `movimientos_bancarios` (08-07:15) | `id bigint identity` PK; I fecha/categoria/tipo/cuenta | — | `tipo_movimiento C ('Cargo','Abono')`, `monto numeric NN C >= 0`, `origen NN default 'pdf_banco_chile'`, `oculto` | **Sin unique** (glosa+fecha+monto); políticas solo select/insert/update (49-60): **no hay delete**. Seed de 610 filas sin `on conflict` (seed:11,291,373,459,548) |
| `perfiles` + `proyectos_ids jsonb`, `ocultar_inventario bool NN default false` (09-07) | | | | `2026-09-07-corregir…sql:4-6` hace `update perfiles … where id = 'ab768e64-…'` (uuid de producción hardcodeado) |
| `subcontrato_asignaciones` (09-20:23) | uuid PK, U `(perfil_id, ot, cc)` | `perfil_id → perfiles` cascade | `ot text NN`, `cc text NN` | OT/CC sin FK (viven en JSON) |
| `facturas_subcontrato` (09-20:53) | uuid PK | `perfil_id` cascade | `monto bigint NN default 0`, `exento`, `pdf_path NN`, `estado C ('pendiente','aceptada','rechazada')`, `abonado bigint` | insert solo si existe asignación (88-96) — regla de negocio en RLS, bien |
| Bucket `facturas-subcontrato` + 3 políticas storage (09-20:110-133) | | | | |
| `perfiles_leer_gerencia` (09-20:142-145) | | | | **Recursiva** → corregida en `2026-09-20-fix-perfiles-recursion.sql:14-30` con `es_gerencia_o_admin()` security definer. Si alguien corre el archivo 09-20 después del fix, vuelve la recursión y **rompe el login de todos** (fix:6-8). |
| `taller_asignaciones` (09-21:23) | uuid PK, U `(perfil_id, ot)` | `perfil_id` cascade | | |
| `taller_partes` (09-21:46) | uuid PK, U `(ot, marca)` | — | `avance jsonb NN default {…0}`, `cantidad/largo/peso_unitario numeric` sin check ≥ 0 | copia desde `serein_proyectos` (118-134) con `on conflict do nothing` |
| `taller_lecturas` (09-21:85) | uuid PK | — | `filas jsonb NN default '[]'` | **sin unique**: la copia (136-148) no tiene `on conflict` → correr dos veces duplica lecturas. Solo políticas select/insert (96-110): **no update ni delete**. |
| `credito_clientes` (10-07:14) | uuid PK, `rut U` | `created_by default auth.uid()` | `trabajos_pagados int NN default 0`, `estado_credito C`, `categoria C ('A'..'D')`, `linea_aprobada numeric NN default 0`, `deuda_vigente numeric NN default 0` | sin check ≥ 0 |
| `credito_documentos` (:40) | uuid PK, I `cliente_id` | `cliente_id` cascade | `tipo C` (ampliado con 'otro' en `10-07-credito-documentos-otros.sql:12-14`), `datos_extraidos jsonb` (16) | |
| `credito_evaluaciones` (:52) | uuid PK, I `(cliente_id, created_at desc)` | `cliente_id` cascade | `estado C`, `categoria C`, `puntaje int` | |
| `credito_parametros` (:80) | `id int PK default 1 C (id = 1)` | | `valores jsonb NN` | fila única |
| `credito_ordenes_compra` (10-07-oc:9), `credito_facturas` (:27) | uuid PK; I por cliente | `cliente_id` cascade; `oc_id → credito_ordenes_compra` set null | `estado C`, montos `numeric NN default 0` sin check ≥ 0 | |
| Bucket `credito` + política (10-07:110-117) | | | | |
| `correo_documentos` (10-08:11) | uuid PK, U `(gmail_id, adjunto)`, I `(tipo, fecha_documento desc)`, I `estado` | **ninguna FK** | `tipo C ('oc','cotizacion')`, `estado C`, `moneda NN default 'CLP'`, `neto/iva/total numeric` | `numero_oc`, `ref_cotizacion`, `folio_cotizacion`, `rut_cliente` texto suelto |
| Bucket `correos` (10-08:54-61) | | | | |
| `correos_vistos` (10-15:17) | `gmail_id text` PK, I `adjuntos_hash` | — | `estado NN default 'ok'`, `intentos int NN default 1` | RLS sin políticas: solo service role |
| `ia_uso` (10-15:43) | `id bigserial` PK, I fecha, I `(funcion, creado_en)` | — | `ok bool NN default true` | + vista `ia_uso_por_dia` |

### 1.3 Tablas fantasma vs. blobs (qué vive dónde de verdad)

| Dato de negocio | Dónde lo guarda la app hoy | Tabla real existente pero no usada |
|---|---|---|
| Órdenes de trabajo, ventas/costos por OT, fotos, protocolos PIG/PGP, partidas, despachos | `app_state.serein_ots` (JSON completo) | `ordenes_trabajo`, `ot_ventas`, `ot_costos`, `ot_fotos` (`setup.sql:197-233,744`) |
| Facturas por área | `serein_facturas` `{area:[…]}` | `ot_ventas` |
| Cotizaciones generales | `serein_cotizaciones` | `cotizaciones`/`cotizacion_items` (solo las intumescentes las usan) |
| Nómina, asistencia, horas extra | `serein_mo` | `trabajadores`, `asistencias`, `horas_extras`, `valores_mo`, `costos_mo` |
| Gastos fijos/variables, obligaciones, cuotas, UF | `serein_fin`, `serein_params` | `gastos`, `obligaciones`, `cuotas` |
| OC a proveedores, docs, cobros, cheques | `serein_pp` | `oc_proveedor` (solo la escribe `defontana-sync`) |
| Avances de producción | `serein_avances` | `avances_produccion` |
| Compras operativas | `serein_comprasOp`, `serein_configCompras` | `compras_operativas`, `compras_op_montos` |
| Inventario y movimientos | `serein_inventario`, `serein_invMov` | — |
| Proyectos (OC cliente, EDP, compras, partes) | `serein_proyectos` | `proyectos`, `edps`, `compras_proyecto`; `taller_partes`/`taller_lecturas` (copiadas, no removidas del blob) |
| Clientes / contactos | `serein_clientes`, `serein_contactos` **y** tabla `clientes` (CRM) | |
| Asignación de compras a área | `serein_comprasAreas` (`LibroComprasModule.jsx:205`) | |
| Catálogo del cotizador | `cotizador_params_v1` (`CotizadorCalculo.jsx:8`) | `int_*` solo para intumescente |

Consecuencia directa: todas las garantías de integridad de `setup.sql` (unique de `numero`, FKs con cascade, checks de estado, trigger de 100 %) **no protegen nada** porque los datos no pasan por esas tablas.

### 1.4 FKs que deberían existir y no pueden (o no existen)

- `libro_ventas.ot_id text` ↔ OT: se asigna desde un `<select>` con el N° de OT (`LibroVentasModule.jsx:746`) y se lee como `String(r.ot_id || '')` (`:177`). Sin FK porque las OT son JSON. Lo mismo `cc_ot` (`:753-755`) y `libro_compras.cc_ot`.
- `subcontrato_asignaciones.ot/cc`, `facturas_subcontrato.ot/cc`, `taller_asignaciones.ot`, `taller_partes.ot`, `taller_lecturas.ot`: texto suelto; si se renombra/elimina una OT en el blob, las filas quedan huérfanas sin aviso.
- `correo_documentos`: cero FKs; `cliente`, `rut_cliente`, `numero_oc`, `ref_cotizacion` son texto.
- `crm_oportunidades.cotizacion_folio text` (`2026-07-20-crm.sql:75`): apunta a un folio del blob `serein_cotizaciones`.
- `clientes.vendedor text` + `clientes.vendedor_id uuid` conviven (`2026-07-21:31-37`): dos verdades posibles para el mismo dato.
- `organigrama_persona.trabajador_id → trabajadores`: FK a una tabla que la app de nómina no alimenta (usa `serein_mo.trabajadores` con ids `t1…t5`).

### 1.5 Migraciones que se contradicen o dependen de ejecución manual

1. `2026-09-20-portal-subcontratistas.sql:142-145` crea `perfiles_leer_gerencia` consultando `perfiles` dentro de su propia política → recursión infinita; `2026-09-20-fix-perfiles-recursion.sql` la reemplaza. **Orden de ejecución importa y no hay registro de qué se corrió** (no hay tabla de migraciones ni carpeta `supabase/migrations` con timestamps del CLI).
2. `setup.sql:534-545` fija `cotizaciones.estado` en 5 valores; `2026-07-18…sql:78-81` lo amplía a 7. Si se re-corre `setup.sql` después, el `create table if not exists` no hace nada (bien), pero el `drop policy / create policy` de `setup.sql:559-567` sí se reaplica.
3. `2026-09-29-quitar-santa-rosa-istria-facturacion.sql:7-12` y `2026-09-30…sql:11-13`: escritas «sin asumir nada» porque el intento anterior falló con «column areas does not exist»: evidencia de que el esquema real divergió del repo.
4. `2026-09-07-corregir-proyectos-ids-usuario.sql:4-6`: `update perfiles … where id = 'ab768e64-…'` — uuid de producción en el repo.
5. Seeds que dependen del contenido vivo de `app_state`: `2026-07-20-crm.sql:113-126` (clientes desde `serein_contactos`), `2026-09-21-taller-externo.sql:118-148` (partes/lecturas desde `serein_proyectos`). Su resultado depende del momento en que se corran.
6. Bloques comentados que la administradora debe editar y correr a mano: alta de Franco (`09-20:152-161`), de Iván (`09-21:155-163`), bucket `fotos-ot` (`scripts/migrar…mjs:14-20`).
7. `2026-07-25-fix-permisos-app-state.sql`: abre la **escritura** de `app_state` a cualquier perfil (línea 28), argumentando que la lectura ya era abierta. Cualquier empleado con cuenta puede sobrescribir cualquier blob (Finanzas, nómina, cotizaciones).
8. `2026-08-07-cartolas-bancarias-seed.sql`: 5 `insert … values` de 610 filas sin `on conflict`; re-ejecutar = duplicar.
9. **Verificar en la base**: si existen `app_state.updated_at` (lo usa el CAS de `sync.js:220-240`), índices en `libro_ventas(document_number, client_rut)` (la función `libro-ventas-sync/index.ts:149-167` deduplica en código, no en la base), y si las columnas `modulos`/`sin_valores` son jsonb.

---

## 2. Datos en memoria / mock / seeds

### 2.1 Inventario de semillas en el código

| Constante | Archivo:línea | Contenido | Clave donde persiste | ¿Es mock? |
|---|---|---|---|---|
| `MO_SEED` | `src/ManoObraModule.jsx:55-65` | 5 trabajadores con nombre, cargo, **sueldo e imposiciones reales** (Daniel Matos 800.000, Mario Vidal 3.200.000, Carolina Marillanca 3.200.000, Fernanda Soto 2.000.000…); `asistencias: []`, `horasExtras: []` | `serein_mo` (`Dashboard.jsx:272`) | Semilla real, no mock. **Pero**: nómina real compilada en el JS público; el registro de asistencia y extras sí persiste en el blob. |
| `OTS_INICIALES` | `src/OTModule.jsx:230-300` («OTs DE EJEMPLO CON DATOS REALES DEL EXCEL») | OT-2026-114, OT-2026-115, OT-234 Howden, OT-385 TTM, OT-304/302 IMMA | `serein_ots` (`Dashboard.jsx:313`) | Ejemplo. Aparece si localStorage está vacío y no llega la nube. |
| `PP_SEED` / `OC_SEED` | `src/ProveedoresPagosModule.jsx:59-80` («DATOS DE PRUEBA»), `src/ordenes-compra-data.js:2` | proveedores ficticios «Pinturas Industriales», «Ferretería Central», «Transporte Norte»; docs FP-001..003; cobros Howden 1650 / TTM 1651 | `serein_pp` | **Mock** explícito. |
| `FIN_SEED` | `src/FinanzasModule.jsx:26-44` («DATOS DE PRUEBA (gastos reales de tu Excel)») | gastos con sueldos reales, `obligaciones` con `numeroOperacion '053768606560032016'` (crédito Fogape Banco de Chile 40 M), `credVer: 3` | `serein_fin` | Semilla con datos reales sensibles. |
| `AVANCES_SEED` | `src/ProduccionModule.jsx:17` | avances de ejemplo | `serein_avances` | Mock. |
| `COMPRAS_OP_SEED` | `src/ComprasOperativasModule.jsx:28` | compras de ejemplo | `serein_comprasOp` | Mock. |
| `CLIENTES_SEED` | `src/ClientesModule.jsx:19-28` | 8 clientes; PROASES con rut `'76.xxx.xxx-x'` | `serein_clientes` | Placeholder. |
| `CONTACTOS_SEED` | `src/ContactosModule.jsx:25-29` (desde `clientes-data.js` / `proveedores-data.js`) | ficha real de clientes/proveedores, con `ver` | `serein_contactos` | Semilla real. |
| `FACTURAS_SEED` | `src/facturas-data.js:2` | facturas reales por área (1466 Ingecoat…) | `serein_facturas` | Semilla real. |
| `INVENTARIO_SEED` | `src/inventario-data.js:1-139` | 135 productos de «STOCK PINTURA PLANTA.xlsx» | `serein_inventario` | Semilla real. |
| `PARAMS_SEED` | `src/ParametrosModule.jsx:23` | parámetros, UF, instrumentos | `serein_params` | |
| `COTIZADOR_SEED` | `src/cotizador-data.js:3` | catálogo de productos/sedes | `cotizador_params_v1` (`CotizadorCalculo.jsx:8`, `CotizadorParametros.jsx:8`) | |
| `COT_SEED` | `src/CotizadorModule.jsx:26` | | interno (`:224`) | |

### 2.2 Módulo por módulo (los pedidos)

- **Mano de Obra / Asistencia** (`src/ManoObraModule.jsx`): NO es mock en el sentido de «no se guarda»: todo (`trabajadores`, `asistencias`, `horasExtras`, `valorColacion`) va al blob `serein_mo` vía `setMo` de Dashboard. Lo que sí es cierto: (a) la nómina base está escrita a mano en el código (`:55-65`); (b) las tablas `trabajadores/asistencias/horas_extras/valores_mo/costos_mo` de `setup.sql:270-345` existen con RLS «solo gerencia ve valores» pero **no se usan**: los sueldos viajan en `serein_mo`, que cualquier perfil puede leer (`2026-07-25-fix…sql:12-14`) y que además está en el bundle; (c) `MO_VER = 'nomina-real-2026-07'` (`:41`): si el `ver` guardado no coincide, **se descarta todo y vuelve a `MO_SEED`** (`:1539` para la vista, `:1548` escribe la semilla en la nube). El comentario `:35-39` lo advierte.
- **Inventario** (`src/InventarioModule.jsx`): persiste en `serein_inventario` / `serein_invMov` con pull-fresh antes de escribir (`:95-115`). No mock.
- **Producción** (`src/ProduccionModule.jsx`): persiste en `serein_avances` (`:80-100`), con anti-duplicado día+OT+proceso (`:85`). Semilla de ejemplo `AVANCES_SEED`.
- **Organigrama** (`src/organigrama-api.js`): tablas reales `organigrama_persona/flujo/costos`; costos desde `trabajadores/valores_mo` (que la app de nómina no alimenta → costos de planta quedarán vacíos salvo carga manual por SQL).
- **CRM** (`src/crm-api.js`): tablas reales `clientes`, `crm_*`, `vendedores`. No mock. Borrados duros (`:39,55,74,93`).
- **Control de Taller** (`src/ControlTallerModule.jsx`): tablas reales `taller_partes/taller_lecturas`.
- **Crédito, Correos, Cartolas, Subcontratistas**: tablas reales.
- **Asesor IA** (`src/AsesorModule.jsx`): tablas `ai_*`, `alertas`, `recomendaciones`, `analisis_*` **sin definición en el repo**.

### 2.3 Qué se pierde al recargar / cerrar

- Por diseño nada «vive solo en memoria»: `Dashboard.jsx:341-344` escribe todo el estado en localStorage en cada cambio y programa un `pushState()` a 800 ms.
- Se pierde: lo que estaba subiendo al cerrar la pestaña (`App.jsx:122-141`, caso documentado «cotización 865»); un `setItem` que falló por cuota (todos los `setItem` están en `try/catch` vacío: `Dashboard.jsx:62-64`, `sync.js:75,245,298,327`, `OTModule.jsx:3735`, etc.); un cambio local «protegido» más de 90 s (`sync.js:154-159`).
- Cada módulo tiene un `useState(SEED)` de respaldo cuando se monta sin props (`ManoObraModule.jsx:1536`, `FinanzasModule.jsx:1497`, `ProveedoresPagosModule.jsx:940`, `ParametrosModule.jsx:474`, `ComprasOperativasModule.jsx:515`, `ClientesModule.jsx:135`): en ese modo los datos quedan solo en memoria. Desde `Dashboard.jsx` se pasan las props (`:271-316`), así que en producción no aplica, pero cualquier montaje nuevo sin props (p.ej. una vista aparte) perdería todo al recargar.

---

## 3. Integridad del blob `app_state`

### 3.1 Qué valida el frontend (lo que leí)

| Validación | Dónde |
|---|---|
| Duplicado de factura por área en alta manual: folio+cliente+tipo | `FacturasModule.jsx:100,404` |
| Duplicado en Libro de Ventas (alta manual): folio+RUT, con mensaje que explica si está oculta | `LibroVentasModule.jsx:485-492` |
| Duplicado al sincronizar Defontana: (document_number, client_rut) en código | `supabase/functions/libro-ventas-sync/index.ts:149-167` |
| Folio de cotización: pull-fresh + `while (base.some(folio))` | `CotizacionesModule.jsx:976-977`; `CotizadorCalculo.jsx:116-118` |
| OT ya creada al aprobar cotización | `CotizacionesModule.jsx:1032` |
| Distribución de gasto = 100 % | `FinanzasModule.jsx:52-53,263` |
| Saldo de inventario no negativo (salida) | `InventarioModule.jsx:21,107` |
| Anti-duplicado avance día+OT+proceso | `ProduccionModule.jsx:85` |
| Compra con folio+RUT repetido avisa (no bloquea) | `ProyectosModule.jsx:267,305,1961` |
| Clientes corruptos (string esparcido letra a letra) se reparan | `Dashboard.jsx:66-85` (ocurrió el 2026-08-07) |
| Horas extra: inicio/fin y OT obligatorios | `ManoObraModule.jsx:399-401` |
| `pushState` exige `.select('id')` para detectar RLS que filtra en silencio | `sync.js:302-324` |

### 3.2 Qué NO se valida — ejemplos reproducibles

1. **Signo y decimales se pierden** — `num = s => parseInt(String(s).replace(/\D/g,''),10)` en `OTModule.jsx:29`, `FacturasModule.jsx:29`, `FinanzasModule.jsx:12`, `ManoObraModule.jsx:11`, `ParametrosModule.jsx:18`, `ProveedoresPagosModule.jsx:18`, `ProyectosModule.jsx:40`, `CotizacionesModule.jsx:20`, `ComprasOperativasModule.jsx:10`.
   - `FormOT` (`OTModule.jsx:2850,2861`): escribir **«12,5»** en «Metros cuadrados» guarda `m2: 125`; «-5000» en «Monto cotizado» guarda `5000`.
   - `FacturasModule.agregar` (`:402-406`): neto «-5000» → `nt = 5000` y se guarda como factura positiva; neto «0» o vacío → `return` **sin ningún mensaje** (la persona cree que se guardó). `setNeto` (`:412-416`) igual al editar en la tabla.
   - `FinanzasModule` (`:209,263`): `num(f.monto) <= 0` → `return` silencioso; «-1.000.000» pasa como 1.000.000.
   - Las únicas variantes que respetan el signo: `OrdenesCompraModule.jsx:17` (`[^\d-]`), `InventarioModule.jsx:11`, `CreditoModule.jsx:22`, `creditoCalculo.js:29`, `enteroDe` en `FacturasModule.jsx:44`.
2. **Entrada de inventario negativa**: `InventarioModule.jsx:11` acepta «-», `MovForm:20-21` solo marca error si `salida > saldo`; `agregarMov:105-107` solo bloquea `nuevoSaldo < 0`. Una «entrada» de -5 descuenta 5 unidades sin aviso.
3. **Correlativo de OT duplicable**: `siguiente = OT-año-(max+1)` sobre la lista local (`OTModule.jsx:3885-3887`); `FormOT` lo usa sin volver a comprobar (`:2859`). Dos personas con el formulario abierto crean la misma `OT-2026-NNN` con ids distintos (`'ot'+Date.now()`), y `fusionarOts` (`sync.js:52-61`) **conserva las dos**. No hay chequeo de `numero` único en ninguna parte del módulo.
4. **N° de OC**: `nuevaOC` = max+1 sobre la copia local (`OrdenesCompraModule.jsx:120-122`) y el número es un `<input>` libre (`:201`, `ProveedoresPagosModule.jsx:293`): duplicados y vacíos permitidos. `serein_pp` no se fusiona (ver §4.1).
5. **Folio de cotización**: la ventana de choque sigue abierta por decisión explícita (`CotizacionesModule.jsx:953-962`: «peor que el compare-and-swap, pero la prioridad ahora es que la app vuelva a responder»); `escribirConReintento` existe en `sync.js:209` pero **ya nadie la llama** (grep: solo comentarios).
6. **Porcentajes > 100**: hitos de proyecto `pct: num(nuevoHito.pct)` sin tope (`ProyectosModule.jsx:1016`); barra `pctFact > 100` solo cambia de color (`:1430`). El check `porcentaje <= 100` de `compras_op_asignacion` (`setup.sql:681`) no aplica porque la tabla no se usa.
7. **Fechas**: `fecha_emision` de facturas es texto libre (`FACTURAS_SEED` trae `""`); `ProduccionModule.jsx:117` `type=date` sin mín/máx (futuro permitido); OC `fecha: hoy()` editable; nadie compara `vencimiento >= emisión`.
8. **NaN**: `num()` lo convierte en 0 (silencioso); `parseFloat(o.m2) || 0` (`OTModule.jsx:435`). 61 inputs `type="number"`, 27 con `min=` (grep).
9. **Sin esquema al bajar de la nube**: `aplicarSiSeguro` guarda `value` tal cual en localStorage (`sync.js:167`) sin `JSON.parse` de verificación; un blob corrupto en la nube se replica a todos. El saneo solo existe para `clientes` (`Dashboard.jsx:66-85,369-371`).
10. **RLS no es barrera de integridad**: cualquier `perfiles` escribe cualquier clave (`2026-07-25-fix-permisos-app-state.sql:21-29`).

---

## 4. Riesgo de pérdida de información

### 4.1 Blob pisado («última subida gana»)

- `pushState()` sube **el valor completo** de cada clave `serein_*`/`__serein_`/`cotizador_` cuya cadena difiera de `lastPushed` (`sync.js:283-285,308`). `lastPushed` vive en memoria (`:25`): tras recargar, todo lo local se considera «pendiente».
- Fusión por id solo para `serein_ots` y `serein_facturas` (`sync.js:111`, `FUSIONES`). Para `serein_pp` (OC, docs, cobros, cheques), `serein_cotizaciones`, `serein_proyectos`, `serein_fin`, `serein_mo`, `serein_inventario`, `serein_invMov`, `serein_avances`, `serein_comprasOp`, `serein_params`, `serein_contactos`, `serein_clientes`, `serein_comprasAreas`, `serein_facturasOcultasLibro`, `serein_facturasEliminadas`: el patrón es «pull-fresh y escribir» (`OrdenesCompraModule.jsx:111-117`, `CotizacionesModule.jsx:966-983`, `InventarioModule.jsx:95-115`, `ProduccionModule.jsx:97-100`…), que el propio código reconoce que no elimina el choque (`CotizacionesModule.jsx:953-962`; `OTModule.jsx:3748-3758`).
- Caso ya documentado: OC perdidas el 2026-10-15 durante una caída (`sync.js:19-22`); OT-977 el 2026-10-23 (`:45-48`); cotización 825 (`:196-198`).
- Las **lápidas** (`serein_facturasEliminadas`, `sync.js:69-76`) y la lista «no volver a traer» (`facturasOcultas.js:10`) se guardan como claves `serein_*` y por tanto **se suben y bajan enteras sin fusión**: la sesión B con la lista vieja la pisa y una factura borrada en A reaparece en la próxima sincronización del Libro de Ventas.
- Protección local: 90 s / 30 min y luego se acepta la nube (`sync.js:18-23,149-159`). Para `serein_ots` la fusión rescata OT que solo existían localmente (`:162-170`); para el resto, la edición se pierde.

### 4.2 Semillas que pueden pisar producción

Secuencia que leí en el código:
1. `App.jsx:23` (botón «Reiniciar datos locales y recargar»), `Dashboard.jsx:89` (`borrarDatosLocales`) o cambio de `LS_VER` (`Dashboard.jsx:53-58`) borran todas las claves `serein_*` del navegador.
2. `App.jsx:120`: `pullState().then(…).finally(() => setSincronizado(true))` — **monta el Dashboard aunque `pullState` haya fallado** (`sync.js:178,185` devuelve `{ok:false}` sin lanzar).
3. `Dashboard.jsx:271-316` inicializa cada estado con su `*_SEED`; `:341-344` los escribe en localStorage y programa `pushState()`; `App.jsx:121` además llama `pushState()` cada 5 s.
4. `pushState` sube todo lo que difiere de `lastPushed` (vacío) → **las semillas (OT de ejemplo, proveedores ficticios, nómina de 5 personas, 8 clientes…) reemplazan los blobs reales en `app_state`** en cuanto vuelva la red.
Mitigante parcial: `aplicarSiSeguro` no protege nada porque `__pushok_*` no existe tras el borrado (`sync.js:149`), así que un `pullState` **exitoso posterior** sí traería la nube — pero si el push ocurrió antes, la nube ya tiene las semillas.

### 4.3 Borrado duro vs. suave

**Suave (recuperable):** OT (`eliminada/eliminadaPor/eliminadaFecha`, `OTModule.jsx:3726-3737`); `libro_ventas.oculto` y `libro_compras.oculto` (`LibroVentasModule.jsx:354-363`, migración 07-20); productos intumescentes `activo=false` (`intumescente-api.js:73-75`); `movimientos_bancarios.oculto`; facturas por área con lápidas (`sync.js:77-82`); `int_productos`.

**Duro (sin papelera ni auditoría):**

| Qué | Dónde | Confirmación |
|---|---|---|
| Cotización completa | `CotizacionesModule.jsx:994-1003` | `confirm` |
| OC proveedor | `OrdenesCompraModule.jsx:456`, `ProveedoresPagosModule.jsx:251-256` | `confirm` |
| Proveedor, documento, cobro, cheque | `ProveedoresPagosModule.jsx:139,398,617,670` | `confirm` |
| Facturas por área: selección, duplicadas, **«vaciar TODAS las facturas del área»** | `FacturasModule.jsx:504-508,546-550,556-559,814` | doble `confirm` (dice «no se puede deshacer») |
| Producto de inventario | `InventarioModule.jsx:95-101` | |
| Trabajador de nómina | `ManoObraModule.jsx:1098` | `confirm` |
| Filas CRM (persona, interacción, oportunidad, campaña) | `crm-api.js:39,55,74,93` | |
| Crédito: documentos (+ archivo en Storage), OC, facturas | `CreditoModule.jsx:234,280,288-289,432,452` | |
| Asignaciones subcontrato/taller | `SubcontratistasModule.jsx:139,217` | |
| Compras sin documento | `LibroComprasModule.jsx:86` (`catch` vacío) | |
| Tabla de espesores: `delete` + `insert` sin transacción | `intumescente-api.js:80-90` | si el insert falla, queda vacía |
| Reemplazo masivo al importar Excel de facturas («reemplazarán las de <área>») | `FacturasModule.jsx:471` | `confirm` |

### 4.4 localStorage / cuota

- Evidencia interna: `sync.js:29-37` («serein_ots pesando ~4.2MB … QuotaExceededError, descartado por los try/catch de todo el código — el dato se veía guardado en la sesión pero nunca llegaba a persistir»). `OTModule.jsx:2884` («4.2MB con solo 12 OTs»).
- Puntos que siguen metiendo base64 al blob: `FotosOT.subir` (`OTModule.jsx:2015-2025`) usa `readAsDataURL` **sin comprimir ni subir a Storage**; `imgToData` (`:2890-2911`) y `subirFotoHojaAvance` (`ControlTallerModule.jsx:41-67`) **caen a base64 si Storage falla** (bucket inexistente, sin política, sin red); logo e imágenes de instrumentos en `serein_params` (`ParametrosModule.jsx:268-296`, fotos a 700 px PNG/JPEG); `protocolo-pdf.js` embebe imágenes.
- `pushState` lee **desde localStorage** (`sync.js:283-285`): si `setItem` falló por cuota, la nube nunca recibe el cambio y la pantalla sigue mostrándolo (estado React).

### 4.5 Edge Functions y scripts

- Ninguna Edge Function hace `delete` (grep vacío en `supabase/functions/`). `libro-ventas-sync/index.ts:149-151` abandonó el «delete + insert» anterior. `defontana-sync` y `sii-sync` hacen `upsert`; `whatsapp-webhook` `insert` en `crm_interacciones`; `correos-ingresar` sube a Storage con `x-upsert: true` (`:344`).
- `scripts/migrar-fotos-ot-a-storage.mjs` reescribe `app_state.serein_ots` completo con la service role (`:28-35`); pide un respaldo previo a mano (`:8-10`) y `--dry-run` (`:24`). No hay bloqueo de concurrencia: si alguien edita una OT mientras corre, su cambio o el del script se pierde.

### 4.6 Respaldo

- No hay ningún código, script, cron, Edge Function ni documentación en el repo que respalde `app_state` ni las tablas. `backups/` está en `.gitignore` y no existe en el clon; la única mención es un comando manual en `scripts/migrar-fotos-ot-a-storage.mjs:8-10` (`supabase db query … > backups/app_state_backup_$(date).json`) y un archivo `app_state_backup_2026-07-25.json` que **no está en el repo**.
- No hay botón de «exportar todo»; las exportaciones existentes son Excel/PDF por módulo (informes), no un volcado restaurable.
- PITR / backups diarios de Supabase: **no se puede ver desde el repo**; depende del plan del proyecto `fyupirswsvojdswpzvjm` (`src/supabase.js:3`).
- Las URLs firmadas a 5 años (`OTModule.jsx:2908,3601`, `ControlTallerModule.jsx:59`, `ParametrosModule.jsx:307`, `scripts/…:65`) quedan escritas dentro del blob; no hay rutina de re-firma ni se guarda la ruta del objeto aparte, así que al vencer habrá que reconstruir el enlace a mano desde el nombre embebido en la URL.

---

## 5. Tamaño y crecimiento

| Blob | Qué contiene | Estimación / evidencia | Riesgo |
|---|---|---|---|
| `serein_ots` | todas las OT con ventas, costos, partidas, despachos, protocolos PIG/PGP (fotos por capa), galería `fotos[]` | **~4.2 MB con 12 OT** antes de la migración a Storage (`OTModule.jsx:2884,3572-3574`, `sync.js:32`). Una foto de celular sin comprimir vía `FotosOT` (`:2015-2025`) son 3-8 MB × 1,33 en base64. | Supera el límite típico de localStorage (5-10 MB) con pocas fotos; cada edición de cualquier campo de cualquier OT sube el blob entero (`sync.js:308`). |
| `serein_params` | parámetros + logo + fotos de instrumentos en base64 | `Dashboard.jsx:392-397`: «cada pestaña traía la tabla app_state COMPLETA (incluye imágenes base64 de parámetros) cuatro veces por minuto» → se bajó a 60 s. | Se descarga entero en cada `pullState` (`sync.js:177` trae `id, value` de **todas** las filas) por cada pestaña abierta. |
| `serein_mo` | nómina + 1 registro por trabajador por día + extras | crece linealmente: N trabajadores × días hábiles, sin archivado por año. | Sin tope; se reescribe entero por cada marca de asistencia. |
| `serein_facturas`, `serein_cotizaciones`, `serein_pp`, `serein_proyectos` | históricos completos (nunca se archivan) | `serein_proyectos` conserva `partes[]` e `historialLecturas[]` aunque ya se copiaron a `taller_*` (`2026-09-21…sql:112-116` «NO borra nada del blob»). | Crecimiento indefinido; `escribirConReintento` ya tuvo que dejar de comparar por `value` porque el arreglo superaba el largo máximo de la condición (`sync.js:214-219`). |
| `serein_libroVentasXlsx` / `serein_libroComprasXlsx` | copia completa del Excel importado | `FacturasModule.jsx:144`, `LibroVentasModule.jsx:156` | Duplica en el blob lo que ya está en `libro_ventas`. |
| `serein_facturasEliminadas` | ids | tope 5000 (`sync.js:74`) | OK. |
| `localStorage` total | datos + huellas `__pushok_*` (ya no copias completas, `sync.js:38-42`) | | El límite por origen no se controla en código: no hay medición ni aviso al usuario. |

Realtime: el canal `app_state_vivo` recibe `payload.new` con el **valor completo** de la fila (`Dashboard.jsx:379-383`). Supabase impone un tope de tamaño por mensaje de Realtime que **no puedo verificar desde el repo**; si un blob lo supera, el evento no llega y la sincronización queda solo en el sondeo de 60 s (`:398`). Verificar en el panel de Supabase con el tamaño actual de `serein_ots` y `serein_params` (`select id, length(value) from app_state order by 2 desc`).

---

## 6. Recomendaciones (orden sugerido)

1. **Respaldo hoy mismo**: Edge Function o cron (pg_cron / GitHub Action con service role) que vuelque `app_state` + tablas a Storage diariamente con retención; activar PITR si el plan lo permite. Botón «Exportar todo» en Parámetros.
2. **Fusión por id para todas las claves de arreglo** (`serein_pp.ocs/docs/cobros/cheques`, `serein_cotizaciones`, `serein_proyectos`, `serein_fin.gastos/obligaciones`, `serein_mo.asistencias/horasExtras`, `serein_inventario`, `serein_invMov`, `serein_avances`, `serein_comprasOp`) con lápidas, o mejor: migrar esos arreglos a tablas reales (las de `setup.sql` ya existen).
3. **Borrado suave universal** (`eliminada`, `eliminadaPor`, fecha) + vista «Papelera» con restaurar.
4. **Quitar las semillas de producción**: inicializar con `[]`/`{}` y, si `pullState` falla, **no montar** el Dashboard ni correr el `setInterval` de push hasta tener una lectura exitosa (`App.jsx:120-121`). Eliminar las puertas de versión destructivas o convertirlas en migraciones aditivas.
5. **Fotos**: comprimir y subir siempre (quitar el fallback a base64 y el `readAsDataURL` crudo de `FotosOT`); guardar la ruta del objeto y firmar al mostrar; medir `localStorage` y avisar.
6. **`num()` único** que respete signo y decimales (`Number(String(s).replace(/\./g,'').replace(',','.'))`), validaciones con mensaje visible, `min/max` en fechas y porcentajes.
7. **Correlativos en la base**: secuencia/`unique` para N° de OT, OC y folio de cotización (p. ej. función RPC que reserve el siguiente).
8. **Versionar el esquema real**: `supabase db dump` del proyecto al repo, tabla de migraciones aplicadas, y dejar de pegar SQL a mano.
9. Sacar sueldos y números de crédito del código fuente.
