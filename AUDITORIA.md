# Auditoría del ERP serein-app

**Fecha:** 27 de octubre de 2026 · **Versión auditada:** rama `main`, commit `85627fd` (la que está publicada en https://serein-app-gilt.vercel.app) · **Base de datos:** proyecto Supabase `fyupirswsvojdswpzvjm`.

**Cómo se hizo:** cinco revisores trabajaron en paralelo sobre un clon del repositorio (seguridad, datos, funcionamiento, calidad de código, experiencia y rendimiento), solo en lectura: no se modificó código ni datos. El coordinador contrastó lo más importante directamente contra la base de datos real (políticas de seguridad vigentes, tamaños, usuarios) y con sondas anónimas usando únicamente la clave pública del sitio. Los informes detallados por área están en `auditoria/detalle/` y las cifras de compilación en `auditoria/detalle/build.log` y `audit.json`.

**Qué no se pudo verificar:** si las copias de seguridad automáticas de Supabase (PITR) están contratadas; si cada función Edge tiene activado «Verify JWT» (no se ve desde el repositorio); y el comportamiento con sesión iniciada en producción (no se usaron credenciales de nadie).

---

## 1. Resumen ejecutivo (en simple)

El ERP funciona y el equipo lo usa a diario, pero tiene **cuatro problemas de fondo** que conviene atacar en este orden:

1. **Cualquier persona con usuario puede ver y cambiar todo.** La base guarda casi toda la información (OT, cotizaciones, facturas, sueldos, pagos, clientes) en una sola tabla que **cualquier usuario con sesión puede leer y escribir completa**, incluidos los supervisores y los externos (Franco, el subcontratista). Que un supervisor «no vea montos» es solo un tapón en la pantalla: con dos clics en el navegador ve los sueldos y los márgenes. Y además de leer, puede sobrescribir o vaciar cotizaciones y OT sin querer o queriendo. Esto es lo más grave de la auditoría.

2. **Sin iniciar sesión se puede ver la lista de usuarios y sus roles.** Con la clave pública del sitio (que va en el código que cualquier navegador descarga) se puede pedir la tabla `perfiles` y obtener nombre, rol y módulos de cada persona del equipo. No expone correos ni contraseñas, pero es información interna que no debería salir. Lo comprobé con una consulta anónima.

3. **Los datos se pueden perder y no hay copia de seguridad.** Esta semana se arregló que las OT, las ventas y las facturas por área se borraran entre sí cuando dos personas guardaban casi al mismo tiempo. Pero el mismo defecto sigue en otras 15 partes (órdenes de compra, cotizaciones, proyectos, finanzas, nómina, inventario, parámetros, contactos). Además, varios borrados son definitivos (sin papelera) y en ciertas condiciones la app puede subir **datos de ejemplo encima de los reales**. No existe ningún respaldo propio: todo depende de lo que Supabase guarde.

4. **Supabase muestra un aviso de facturas pendientes de pago** («Outstanding invoices · pay your invoices to avoid service disruption»). Si Supabase suspende el proyecto, el ERP deja de funcionar entero. Esto no es código: es revisar la facturación de Supabase hoy mismo.

Además hay cosas que pesan en el día a día: la app baja la base de datos completa decenas de veces por sesión (lento en 4G de planta), el archivo principal pesa 3,4 MB sin dividir, el naranja de la marca sobre blanco no cumple contraste (ilegible al sol), hay 193 avisos nativos del navegador (molestos en celular), y 11 vulnerabilidades en librerías, una de ellas crítica pero de arreglo inmediato.

**Lo que está bien:** no hay ninguna llave secreta en el código ni en el historial del repositorio (la fuga antigua de la service_role no pasó por aquí); el frontend usa solo la clave pública; las partes construidas este año con tablas propias (subcontratistas, taller externo, crédito, correos, cartolas, compras operativas) tienen reglas de seguridad por rol correctas; nadie puede autopromoverse a gerencia; los cálculos de IVA, impuesto específico, factoring, vencimientos y margen de OT dan bien en los casos normales; la app se compila sin errores y es instalable en el celular.

---

## 2. Hallazgos por severidad

Cada hallazgo indica el archivo y la línea, el riesgo concreto para el negocio y cómo corregirlo. Prefijos: **S** seguridad, **D** datos, **F** funcionamiento, **C** calidad de código, **X** experiencia y rendimiento.

### CRÍTICO (atender hoy)

**S-1. `app_state` legible y escribible por cualquier usuario con perfil, incluidos supervisores y externos.**
Dónde: política real en la base `app_state_select_all` (SELECT, `using (true)` para `authenticated`) y `app_state_write_por_rol` (ALL, `puede_escribir_app_state(id)`); la función `puede_escribir_app_state(clave)` ignora la clave y solo exige tener fila en `perfiles` (`supabase/migrations/2026-07-25-fix-permisos-app-state.sql:12-29`). Verificado en `pg_policies`.
Riesgo: Franco (subcontrato) o cualquier supervisor puede, con su propia sesión y una herramienta como `curl`, leer finanzas (`serein_fin`), pagos y OC (`serein_pp`), **sueldos** (`serein_mo`, cuya nómina base con nombres y sueldos reales además está compilada en el código en `src/ManoObraModule.jsx:55-65`), márgenes, facturas, inventario y cartera de clientes, y también **sobrescribir o vaciar** OT, cotizaciones y facturas de toda la empresa.
Corrección: políticas por rol en `app_state` (externos sin acceso; claves monetarias `serein_fin`, `serein_pp`, `serein_mo`, `serein_facturas`, `serein_cotizaciones` solo gerencia/admin), usando el parámetro `clave` que la función ya recibe; y a mediano plazo mover lo monetario a tablas reales con RLS, como ya se hizo con subcontratos, taller y crédito.

**S-2. Tabla `perfiles` y `reglas_clasificacion` legibles sin iniciar sesión.**
Dónde: políticas reales `leer_perfiles_todos` (SELECT, `using (true)`, rol `public`) y `reglas_lectura` (`setup.sql:133`); el rol `anon` tiene permisos de tabla sobre ambas. Comprobado con una consulta anónima con la clave pública: devuelve los 8 perfiles con `nombre`, `tipo`, `areas`, `modulos`, `sin_valores`, y las 26 reglas de clasificación (razón social del cliente → área/proyecto).
Riesgo: cualquiera que abra el sitio sabe quiénes trabajan en Serein, qué rol tienen y qué pantallas ven; y conoce los clientes con sus áreas. Es la puerta de entrada típica para suplantación y phishing dirigido.
Corrección: borrar `leer_perfiles_todos` (ya existen `leer_mi_perfil` y `perfiles_leer_gerencia`, que bastan), y en `reglas_clasificacion` cambiar `using (true)` por `es_gerencia_o_admin()`. Revocar `select` al rol `anon` en todas las tablas públicas que no lo necesiten.

**D-1. «La última subida gana» sigue vigente en 15 de 17 bloques de datos.**
Dónde: `src/sync.js:111` (`FUSIONES` solo cubre `serein_ots` y `serein_facturas`); cada módulo escribe su bloque completo con `pushState()`.
Riesgo: una OC, una cotización, un registro de asistencia o un pago que alguien acaba de guardar desaparece cuando otra pestaña con copia atrasada guarda cualquier cosa. Ya ocurrió con OC (15-oct), con la cotización 825, con OT y con facturas esta semana.
Corrección: extender la fusión por id con lápidas (el patrón ya existe) a `serein_pp`, `serein_cotizaciones`, `serein_proyectos`, `serein_fin`, `serein_mo`, `serein_inventario`, `serein_comprasOp`, `serein_avances`, `serein_contactos`, `serein_clientes` y las listas auxiliares; a mediano plazo, una fila por registro en tablas reales.

**D-2. Sin copia de seguridad propia y con borrados definitivos.**
Dónde: no existe export, cron ni función de respaldo (`.gitignore` ignora una carpeta `backups/` que no existe; única mención en `scripts/migrar-fotos-ot-a-storage.mjs:8-10`). Borrado duro en cotizaciones (`src/CotizacionesModule.jsx:994-1003`), OC (`src/OrdenesCompraModule.jsx:456`, `src/ProveedoresPagosModule.jsx:256`), proveedores/documentos/cobros (`ProveedoresPagosModule.jsx:139,398,617,670`), facturas por área incluido «vaciar TODAS» (`src/FacturasModule.jsx:504-559`), inventario, trabajadores (`src/ManoObraModule.jsx:1098`), CRM (`src/crm-api.js:39,55,74,93`), crédito (`src/CreditoModule.jsx:234,280,289,432,452`).
Riesgo: un clic equivocado o un bloque pisado borra información contable sin forma de recuperarla.
Corrección: confirmar/contratar PITR en Supabase; una función programada que vuelque `app_state` y las tablas a Storage a diario con retención de 30 días; borrado suave universal con «Papelera».

**F-1. Las semillas de ejemplo pueden pisar los datos reales.**
Dónde: `src/Dashboard.jsx:271-316` arranca con `OTS_INICIALES`, `OC_SEED`, `FIN_SEED`, `COMPRAS_OP_SEED`, `FACTURAS_SEED`; `:343` los escribe en localStorage; `src/App.jsx:120-124` monta el Dashboard y sube cada 5 s aunque la lectura inicial de la nube haya fallado; `src/sync.js` sube cualquier `serein_*` sin exigir haber bajado antes.
Riesgo: navegador nuevo o «Reiniciar datos locales» (`App.jsx:23`) con Supabase lento o caído = al volver la red, los datos reales se reemplazan por 73 OC ficticias, OT de ejemplo y una nómina de 5 personas. Lo mismo pasa si en un despliegue se cambia `MO_VER` (`ManoObraModule.jsx:1539-1548`: descarta toda la asistencia), `pp.ocsVer` (`Dashboard.jsx:282`) o `fin.credVer` (`:281`).
Corrección: en producción iniciar vacío; no montar ni subir hasta una lectura exitosa de la nube; eliminar las «puertas de versión» que reemplazan bloques enteros (migrar siempre de forma aditiva).

**OP-1. Aviso de facturas impagas en Supabase.**
Dónde: cabecera del panel de Supabase del proyecto (27-oct): «Outstanding invoices · Please pay your invoices to avoid service disruption».
Riesgo: suspensión del proyecto = ERP, correos y funciones de IA fuera de servicio.
Corrección: revisar Billing en Supabase hoy y regularizar el medio de pago.

### ALTO (esta semana)

**S-3. Supervisores bajan la base completa; «sin valores» es solo visual.** `src/Dashboard.jsx:188-192, 310`, `src/serein-ai/permisos.js:6-7`; todo queda en `localStorage` (`Dashboard.jsx:60`). Riesgo: sueldos y márgenes visibles con las herramientas del navegador. Corrección: depende de S-1; mientras tanto, `pullState` solo con las claves que el perfil necesita.

**S-4. Cartolas bancarias (`movimientos_bancarios`) legibles y editables por cualquier perfil, incluidos externos.** Políticas reales `mb_select_auth`/`mb_update_auth`: basta tener fila en `perfiles` (`2026-08-07-cartolas-bancarias.sql:44-60`; su propio comentario dice que la restricción es «visual»). Corrección: `using (es_gerencia_o_admin())`.

**S-5. CRM completo con `using (auth.uid() is not null)`.** `clientes`, `crm_contactos_persona`, `crm_interacciones`, `crm_oportunidades`, `crm_campanas`, `vendedores` (`2026-07-20-crm.sql:98-99`, `crm-campanas.sql:32`, `crm-vendedores.sql:21`). Riesgo: un subcontratista puede exportar o **borrar** la cartera de clientes. Corrección: lectura para internos, escritura/borrado solo gerencia/admin.

**S-6. `libro_ventas` y `libro_compras` legibles por cualquier autenticado (`lv_select_all`, `lc_select_all` con `true`).** Incluye externos y supervisores. Corrección: `using (es_gerencia_o_admin() or tipo in (...))` según quién deba verlos.

**S-7. Once funciones de IA sin autorización por rol ni límites.** `supabase/functions/extraer-*`, `redactar-oferta` (p. ej. `extraer-factura/index.ts:63-85`): sin `getUser`, sin tope de tamaño ni cantidad, `max_tokens` 8192, sin registro en `ia_uso` (solo `correos-ingresar` lo hace). Riesgo: cualquier usuario, incluidos externos, puede gastar créditos de Anthropic sin control (el consumo de octubre llegó a USD 112). Corrección: validar JWT y `perfiles.tipo` en cada función, límite de archivos/bytes, registro en `ia_uso`, y confirmar en el panel que «Verify JWT» está activo salvo en `correos-ingresar` y `whatsapp-webhook`.

**S-8. XSS almacenado en informes impresos.** `src/informeFacturas.js:83,127`, `src/informeCobranzaPDF.js:100,158`, `src/ManoObraModule.jsx:1456-1457,1478` interpolan nombres sin escapar en `document.write`. Como cualquiera escribe `app_state` (S-1), un nombre de cliente malicioso se ejecuta en la sesión de gerencia al imprimir. Corrección: usar la función `esc()` que ya existe (`OrdenesCompraModule.jsx:60`).

**S-9. Fotos de OT visibles para cualquier autenticado.** Política real de Storage `fotos_ot_leer` (SELECT, solo `bucket_id = 'fotos-ot'`, sin condición de usuario): los 2.093 archivos del bucket son legibles por externos. Corrección: condicionar por rol.

**D-3. Esquema real no versionado y migraciones a mano sin registro.** `app_state`, `libro_ventas`, `libro_compras`, `proveedores`, `oc_proveedor`, `ai_*`, `alertas`, `recomendaciones`, `compras_sin_doc`, `tipos_gasto`, el bucket `fotos-ot` y columnas como `perfiles.modulos/sin_valores` no tienen `create` en el repositorio; migraciones como `2026-09-29-quitar…sql:7-12` documentan que el esquema divergió. Riesgo: no se puede reconstruir la base ni saber qué se corrió. Corrección: `supabase db dump` al repositorio y una tabla de migraciones aplicadas.

**D-4. Fotos en base64 dentro del bloque de OT y cuota de almacenamiento silenciosa.** `src/OTModule.jsx:2015-2025` (`FotosOT.subir` guarda la foto sin comprimir en `serein_ots`; `imgToData` de `:2890` sí redimensiona y sube a Storage pero no se usa ahí); todo `localStorage.setItem` está en `try/catch` vacío (`Dashboard.jsx:62-64`, `sync.js:75,245,298,327`). Riesgo: con el navegador lleno, el dato «se ve guardado» y nunca sube; además cada foto viaja a todas las sesiones en cada sincronización. Corrección: subir siempre a Storage, quitar el fallback a base64, avisar al usuario si falla.

**D-5. Correlativos duplicables.** N° de OT = máximo local + 1 (`OTModule.jsx:3885-3887, 2859`); N° de OC igual y editable libre (`OrdenesCompraModule.jsx:120-122,201`); folio de cotización con ventana de choque reconocida (`CotizacionesModule.jsx:976-977`). Dos sesiones pueden crear la misma `OT-2026-NNN`. Corrección: secuencias en la base (RPC) y `unique`.

**F-2. Facturación y cobranza existen por triplicado sin sincronía.** `libro_ventas.ot_id` (base) → ficha en `serein_facturas` (`src/LibroVentasModule.jsx:177`) → `ot.ventas` solo a mano (`src/OTModule.jsx:3836`). Asignar OT en el Libro no agrega la venta a la OT (utilidad y «saldo por facturar» quedan mal); «Pagado» y abonos en Facturas por área no vuelven al libro ni a la OT. El panel resta «Venta» (base) menos «Cobrado» (fichas). Corrección: una sola fuente (`libro_ventas` con estado y abonos) de la que OT, Facturas y Dashboard deriven.

**F-3. Reparto de costos a OT sin tope.** `OrdenesCompraModule.jsx:313-322` solo pinta «Suma: 150 % (debería ser 100 %)» y guarda igual; `ComprasOperativasModule.jsx:405` gerencia edita el porcentaje libre. Comprobado: 150 % carga el 150 % del neto a la OT y el margen sale mal. Corrección: bloquear si la suma ≠ 100 (ya existe `asigOk` para el supervisor).

**F-4. `npm ci` falla: el lock no coincide con `package.json`.** Faltan `@types/babel__generator@7.27.0`, `@types/babel__template@7.4.4`, `@types/babel__traverse@7.28.0`, `@types/d3-color@3.1.3`, `@types/d3-path@3.1.1`. Vercel compila igual porque usa `npm install`, pero cualquier CI o instalación reproducible se cae. Corrección: `npm install` y confirmar el `package-lock.json`.

**C-1. 19 escrituras a la base que pueden fallar en silencio.** `src/CreditoModule.jsx:216,289,432,589,595`, `src/AsesorModule.jsx:78,229,245,289,327,375,426`, `src/SubcontratistasModule.jsx:139,217`, `src/serein-ai/historial.js:55,59,66`, `src/LibroComprasModule.jsx:105,117`. `supabase-js` no lanza excepción, así que los `try/catch` no atrapan nada. Ejemplo: en `CreditoModule.jsx:589` el ERP muestra «Línea bloqueada automáticamente» aunque el bloqueo no se haya guardado. Corrección: comprobar `error` en cada llamada y una envoltura común que lo convierta en excepción.

**C-2. Fecha «de hoy» en UTC.** `src/LibroComprasModule.jsx:135` y `src/ProyectosModule.jsx:43` usan `toISOString()`: después de las 20:00-21:00 hora de Chile registran la fecha de **mañana**. Corrección: usar `hoyISO()` de `src/vencimientos.js:37`.

**C-3. 11 vulnerabilidades en dependencias (1 crítica, 3 altas).** Crítica: `dompurify` ≤ 3.4.16 vía `jspdf` (XSS) → `npm audit fix`. Alta sin arreglo en npm: `xlsx` 0.18.5 (contaminación de prototipos y ReDoS) usada en 16 archivos para leer Excel que suben usuarios → instalar la 0.20.x desde el CDN de SheetJS o pasar a `exceljs`. Las de `vite`/`esbuild` afectan solo al entorno de desarrollo.

**X-1. La base completa se baja decenas de veces por sesión.** `src/sync.js:181`, `src/App.jsx:123`, `src/Dashboard.jsx:398, 408-414, 484, 510` (tres descargas al entrar, sondeo cada 60 s, otra en cada cambio de pestaña o foco) y **86 handlers** con `await pullState()` (Finanzas 16, Pagos 11, Mano de Obra 9, OT 7…). Hoy `app_state` pesa 1,3 MB (`serein_params` 473 KB con logos en base64, `serein_ots` 460 KB). Riesgo: cada avance o foto del supervisor mueve megabytes por el 4G de planta; ya saturó Supabase antes (`App.jsx:103-106`). Corrección: una descarga al entrar; comparar `updated_at` antes de bajar; `escribirConReintento`/`leerFresco` por clave (ya existen en `sync.js`); sacar las imágenes de `serein_params` a Storage.

**X-2. Un solo archivo JavaScript de 3,44 MB (954 KB comprimido).** `src/Dashboard.jsx:9-38` importa los 21 módulos; sin `React.lazy` ni `manualChunks` en `vite.config.js`. Riesgo: 2-4 s extra tras cada despliegue para quien solo usa OT en el celular. Corrección: carga diferida por módulo y separar recharts/xlsx/jspdf.

**X-3. El estado «Guardando / Guardado / Error» no se ve en el celular.** Solo está en el menú lateral (`src/ui.jsx:155`), cerrado en móvil. Riesgo: el supervisor cierra la app sin saber que el protocolo no subió. Corrección: indicador compacto en la cabecera móvil y aviso de error global.

**X-4. Contraste de la marca por debajo del mínimo.** `src/theme-serein.js:5-6`: naranja `#F77716` sobre blanco 2,76:1 (mínimo 4,5:1), blanco sobre naranja en todo el menú y botones, gris `#9AA3AD` en cientos de etiquetas de 10-11 px. Riesgo: ilegible al sol en planta. Corrección: texto oscuro sobre naranja o fondo más oscuro; gris de apoyo ≥ `#6B7580`.

### MEDIO (este mes)

**S-10.** Cerrar sesión no borra `localStorage` (`src/App.jsx:153-158`): el ERP entero queda en equipos compartidos. Limpiar `serein_*`, `cotizador_*`, `__pushok_*`, `__protdesde_*` al salir.
**S-11.** Webhook de WhatsApp sin verificar la firma de Meta (`supabase/functions/whatsapp-webhook/index.ts:70-119`): cualquiera puede insertar clientes e interacciones. Validar `X-Hub-Signature-256`.
**S-12.** Funciones de correo, Drive, sincronización y DTE sin autorización (`enviar-alertas-vencimiento`, `notificar-factura-subcontrato` (asunto sin escapar en `:62`), `subir-*-drive` (cuenta de servicio con permiso `drive` completo), `libro-ventas-sync`, `defontana-sync`, `probar-dte-openfactura`). Riesgo: spam desde el dominio, archivos basura en Drive. Mismo arreglo que S-7.
**S-13.** URLs firmadas a 5 años guardadas dentro de `app_state` (`OTModule.jsx:2908,3601`, `ParametrosModule.jsx:307`, `ControlTallerModule.jsx:59`): quien leyó el bloque conserva acceso a fotos y certificados aunque se le quite la cuenta; y dejarán de abrir sin re-firma. Guardar rutas y firmar al mostrar (como `CorreosModule.jsx:133`).
**S-14.** `.gitignore` no cubre `.env` (`.gitignore:1-4`); 610 movimientos bancarios reales versionados en `2026-08-07-cartolas-bancarias-seed.sql`; sin límite de tamaño en 36 subidas de archivos ni en las funciones.
**D-6.** `num()` borra signo y decimales en 18 copias (`OTModule.jsx:29`, `FacturasModule.jsx:29`, `FinanzasModule.jsx:12`, `ManoObraModule.jsx:11`, `CotizacionesModule.jsx:20`, `OrdenesCompraModule.jsx:18`…). Comprobado: precio `1500.5` → 15.005; `"1.234,56"` → 123.456; `"-100"` → 100; cantidad de OC `"1,5"` → 15.000. Un solo `num()` común que respete signo y decimales, y rechazo de negativos.
**D-7.** Lápidas y lista «no volver a traer» (`serein_facturasEliminadas`, `serein_facturasOcultasLibro`) se pisan entre dispositivos (sin fusión): facturas borradas pueden reaparecer.
**D-8.** Referencias a OT, CC y cotización como texto sin clave foránea (`libro_ventas.ot_id/cc_ot`, `libro_compras.cc_ot`, `subcontrato_*`, `taller_*`, `correo_documentos`); tres fuentes distintas de clientes (`serein_clientes`, `serein_contactos.clientes`, tabla `clientes`); entrada de inventario negativa descuenta stock (`InventarioModule.jsx:105-107`); espesores intumescentes con `delete` + `insert` sin transacción (`intumescente-api.js:80-90`).
**F-5.** Horas extra con inicio = fin pagan 24 h (`ManoObraModule.jsx:363-368`: 08:00 → 08:00 = 24 h, $142.800 para un sueldo de 800.000). Verificado en el código. Tratar 0 minutos como error y poner tope.
**F-6.** «Cobranza atrasada» de Proyectos y TODAS muestra datos inventados: `src/Dashboard.jsx:1023` usa `vista.atrasadas` de `src/data.js` (MYG 4.871.562, Viman, CADM…). Verificado. Usar `CobranzaAtrasadaModule` con facturas reales y borrar `data.js`.
**F-7.** Compras del libro asignadas a una OT no entran a su margen (`OTModule.jsx:2736`: «informativo, aún no sumado»); en Proyectos sí. El margen por OT se ve mejor de lo real.
**F-8.** Correos no enlaza con el ERP: «En ERP» es solo cotejo de texto (`CorreosModule.jsx:97-98`); la cadena correo → OC → OT es manual. Y el cotizador de Proyectos (`serein_proyCotizaciones`) es un sistema paralelo al de Cotizaciones.
**C-4.** Manejo de errores inconsistente: 104 `window.alert` con texto técnico, 362 `catch` vacíos (31 alrededor de Supabase), 22 promesas sin `.catch`; las funciones Edge devuelven errores con HTTP 200 (`extraer-factura/index.ts:156-160`). Solo el bloque `app_state` tiene estado de guardado centralizado.
**C-5.** Dashboard como componente único: 29 `useState`, 52 props en cadena, 34 agregados recalculados en cada render (`Dashboard.jsx:244-642, 820-1078`); 0 `useCallback`, 0 `React.memo`; dos componentes definidos dentro del render (`Dashboard.jsx:665`, `ManoObraModule.jsx:796`) que se desmontan en cada tecla. `OTModule.jsx` tiene 4.087 líneas.
**C-6.** Sin lint, sin script de test, sin CI: 4 tests existen y pasan (`node src/x.test.mjs`) pero nada los ejecuta; 58 imports sin uso; 505 líneas de archivos importados y nunca usados (`PipelineOT.jsx`, `PipelineProyectos.jsx`, `CotizadorModule.jsx`); `escribirConReintento`/`leerFresco` revertidos en julio y hoy sin uso.
**C-7.** Dependencias atrasadas: react 18.3 → 19.3, vite 5.4 → 8.3, recharts 2.15 → 3.10, lucide 0.383 → 1.62, supabase-js 2.110 → 2.118. Edge Functions sin código compartido (helpers de Drive copiados 3 veces, bloque Anthropic copiado 12 veces con el modelo escrito a mano).
**X-5.** Tablas sin desplazamiento horizontal en móvil (`OTModule.jsx:2531, 2590, 2671, 2736, 2750, 2990, 3012, 3977`, `OrdenesCompraModule.jsx:154`, `ManoObraModule.jsx:965, 1470`, `SubcontratistasModule.jsx:168, 242`); inputs de 12-13 px que disparan zoom en iPhone; 61 campos numéricos sin `inputMode`; 0 `capture` para abrir la cámara en las 5 subidas de fotos; 114 botones menores de 32 px; «×» de borrar foto de 18 px.
**X-6.** 193 `window.alert/confirm/prompt` (OT 29, Cotizaciones 23, Proyectos 23; 2 `prompt` inutilizables en móvil). Componente único de confirmación (patrón ya existe en `CRMModule.jsx:44`).
**X-7.** `100vh` en Safari iOS deja la última fila bajo la barra (`Dashboard.jsx:817`, `App.jsx:20,162`, `Login.jsx:44`); modales sin desplazamiento vertical (`CRMModule.jsx:44,91,533`, `FinanzasModule.jsx:1363`, `OrganigramaModule.jsx:180`, `CotizacionesModule.jsx:1121`, `CotizadorCalculo.jsx:335`); botones sin estado «trabajando» en acciones con IA (doble toque = doble cobro).
**X-8.** Reserialización completa por tecla: `Dashboard.jsx:340-343` serializa 17 claves (incluido `serein_ots`) y agenda subida a 800 ms en cada cambio; `App.jsx:124` compara todas las cadenas cada 5 s.

### BAJO

- `es_gerencia()` sin `security definer` ni `search_path`, duplicada con `es_gerencia_o_admin()` (`setup.sql:265-268`); permisos por correo escritos a mano (`Dashboard.jsx:194,197,310`, `serein-ai/permisos.js:17-22,33`); `window.open` sin `noopener` (`CreditoModule.jsx:284`); CORS `*` en las 20 funciones; `ia_uso` sin política de lectura (la UI no puede mostrar el consumo).
- `setup.sql` define unas 30 tablas que el frontend nunca usa (`ordenes_trabajo`, `ot_ventas`, `gastos`, `obligaciones`…): sus restricciones no protegen nada.
- `clp()` sin `|| 0` muestra `$NaN` (`Dashboard.jsx:47`, `OTModule.jsx:28`, `FinanzasModule.jsx:11`…); `descargarOT()` (`OTModule.jsx:2070-2081`) suma sin `|| 0`; hora extra redondeada dos veces (±1 peso).
- Fechas sin rango ni validación «vencimiento ≥ emisión»; porcentajes de hitos sin tope (`ProyectosModule.jsx:1016`).
- Claves auxiliares subidas como datos (`serein_ver`, `serein_libroVentasXlsx`, `serein_mapeosExcel`, `cotizador_params_v1`).
- Fuentes de Google: 3 familias/12 pesos bloqueantes, se usan 4; sin `preconnect`. Sin `viewport-fit=cover`. Tope del precache en 6 MB con el archivo ya en 3,4 MB. 825 textos menores de 12 px.
- 44 copias de `clp`, 21 de `hoy`, 18 de `num`, 14 de `norm`, 10 de `sumarDias`; 40 paletas `C = {...}`; 29 `import React` innecesarios; 98 `export` que solo se usan localmente.

---

## 3. Comprobaciones directas en la base (27-oct)

| Qué | Resultado |
|---|---|
| Tablas en `public` | 76, todas con RLS activado |
| Tablas con RLS sin ninguna política (solo service role) | `correos_vistos`, `ia_uso`, `app_state_backup_20260709` |
| `app_state` | lectura `true` para autenticados; escritura si existe fila en `perfiles` (la función ignora la clave) |
| Legible sin sesión (rol `anon`) | `perfiles` (8 filas: nombre, tipo, áreas, módulos), `reglas_clasificacion` (26 filas) |
| Políticas con `auth.uid() is not null` (cualquier autenticado) | CRM (6 tablas), `cargos_mo`, `config_permisos`, `int_*`, `organigrama_*`, `trabajadores`, `proveedor_tipo` (ALL) |
| Storage | 4 buckets privados; `fotos-ot`: lectura para cualquier autenticado (2.093 archivos), escritura para cualquier autenticado; `correos` y `credito` solo gerencia/admin; `facturas-subcontrato` por carpeta del usuario |
| Funciones de seguridad | `es_gerencia_o_admin()` y `puede_escribir_app_state()` con `security definer`; `es_gerencia()` sin él |
| Tamaño de `app_state` | 1,3 MB en total: `serein_params` 473 KB, `serein_ots` 460 KB, logos 180 KB |
| Perfiles | 8 (gerencia 2, comercial, proyectos, supervisor, jefe 2, subcontrato) |
| Panel de Supabase | aviso de facturas pendientes de pago |

---

## 4. Plan de corrección priorizado

### Hoy
1. Regularizar la facturación de Supabase (OP-1).
2. Quitar la política `leer_perfiles_todos` y cerrar `reglas_clasificacion` al rol anónimo (S-2). Es un SQL de dos líneas.
3. Restringir `app_state`: externos sin acceso; claves monetarias solo gerencia/admin (S-1). Requiere un SQL cuidadoso y probar el ingreso de cada rol después.
4. `npm audit fix` para la vulnerabilidad crítica de `dompurify` (C-3) y `npm install` para arreglar el lock (F-4).
5. Confirmar que PITR está activo en Supabase; si no, activarlo (D-2).

### Esta semana
6. Fusión por id con lápidas para los 15 bloques restantes, empezando por OC, cotizaciones y nómina (D-1).
7. Semillas vacías en producción y no subir nada hasta una lectura exitosa de la nube; eliminar las puertas de versión destructivas (F-1).
8. Cerrar cartolas, CRM, libros y fotos a los roles que corresponden (S-4, S-5, S-6, S-9).
9. Autorización por rol, límites y registro de consumo en las funciones de IA, y verificar «Verify JWT» (S-7, S-12).
10. Escapar nombres en los informes impresos (S-8) y borrar `localStorage` al cerrar sesión (S-10).
11. Bloquear repartos de costo ≠ 100 % (F-3), corregir la fecha UTC (C-2) y las 19 escrituras sin comprobación de error (C-1).
12. Respaldo diario de `app_state` y tablas a Storage (D-2).

### Este mes
13. Una sola fuente para facturación y cobranza (F-2) y sumar las compras directas al margen de la OT (F-7).
14. Reducir descargas de la base: una al entrar, comparar `updated_at`, usar lectura/escritura por clave; sacar logos de `serein_params` (X-1, X-8).
15. Dividir el bundle por módulo (X-2); indicador de guardado en móvil (X-3); contraste de marca (X-4); tablas con desplazamiento, `inputMode`, cámara con `capture`, botones ≥ 40 px (X-5).
16. `num()` común con decimales y signo; rechazo de negativos; horas extra con tope (D-6, F-5); borrar `data.js` y la cobranza inventada (F-6).
17. Esquema versionado con `supabase db dump` y registro de migraciones (D-3); fotos siempre a Storage y aviso de cuota (D-4); secuencias para OT/OC/cotizaciones (D-5).
18. ESLint + script de test + CI (C-6); reemplazar `window.alert/confirm` por un componente (X-6); consolidar helpers duplicados y partir `OTModule.jsx` (C-5, C-7).
19. Reemplazar `xlsx` por una versión sin vulnerabilidades (C-3) y actualizar dependencias mayores en una rama aparte.

### Más adelante (cambio de fondo)
20. Migrar los bloques JSON de `app_state` a tablas reales con RLS por fila (OT, cotizaciones, OC, facturas, nómina). Es lo único que resuelve de raíz S-1, S-3, D-1, D-5 y X-1 a la vez; conviene hacerlo módulo por módulo, empezando por nómina y finanzas (lo más sensible).

---

*Informes por área: `auditoria/detalle/seguridad.md`, `datos.md`, `funcionamiento.md`, `calidad.md`, `experiencia.md`; tabla de 110 casos de cálculo en `bordes.md`; registro de compilación en `build.log`; vulnerabilidades en `audit.json`.*
