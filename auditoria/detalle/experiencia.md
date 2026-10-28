# Auditoría serein-app — Experiencia y rendimiento

Clon: `C:\Users\maria\gwt\serein-audit`, rama main, commit `85627fd`. Revisión solo de lectura. Producción verificada en `https://serein-app-gilt.vercel.app/` (el bundle desplegado `index-11nljCo9.js` tiene el mismo hash que el `dist/` compilado desde este commit, así que lo medido en vivo corresponde a este código).

Nota sobre lo que NO se pudo comprobar: no hay credenciales, así que no se midió `pullState()` real ni el peso de `app_state`; esas cifras salen de los comentarios del propio código (`serein_ots ~4,2 MB con 12 OT`, `src/OTModule.jsx:2884` y `src/sync.js:31-33`) y del análisis estático.

---

## Cifras medidas

### Bundle (`.auditoria/build.log`, `dist/`)
| Archivo | Sin comprimir | gzip |
|---|---|---|
| `assets/index-11nljCo9.js` (TODO el ERP: React, Recharts, xlsx, jspdf, supabase, 21 módulos) | 3.442 kB | 954 kB |
| `assets/html2canvas.esm-*.js` (carga diferida de jspdf) | 201 kB | 48 kB |
| `assets/index.es-*.js` (carga diferida) | 151 kB | 52 kB |
| `assets/purify.es-*.js` (carga diferida) | 29 kB | 11 kB |
| CSS | 0 (todo es estilo en línea) | — |
| Precache del service worker | 15 entradas, 3.781 KiB | — |

- `vite build` avisa: «Some chunks are larger than 500 kB» y «OTModule.jsx is dynamically imported by CotizacionesModule.jsx but also statically imported … dynamic import will not move module into another chunk»: el único `import()` propio no logra dividir nada.
- `React.lazy`/`Suspense`: **0 usos** en `src/` (grep). Todos los módulos entran en el primer chunk.

### Carga inicial en producción (login, sin sesión, navegador integrado, PC)
Primera visita (sin service worker):
- TTFB 217 ms · DOMContentLoaded 1.349 ms · load 1.373 ms.
- Recursos: `index-11nljCo9.js` 951.141 bytes transferidos (3.447.313 decodificados), CSS de Google Fonts (1.074 B, pero declara 3 familias y 12 pesos: Archivo×5, Oswald×3, Inter×4), `registerSW.js`, y **dos** `fetch('/')` idénticos a los 1,5 s (chequeo de versión de `src/App.jsx:52-57`, se dispara dos veces).
- Total transferido ≈ 954 kB antes de ver el login (un celular con 4G de planta a ~2-5 Mbps tarda 2-4 s solo en bajar el JS, más el tiempo de parsear 3,4 MB de JS en un teléfono de gama media).
- Fuentes realmente cargadas en el login: Inter 400/600 y Oswald 600/700. «Archivo» se pide en `index.html:17` con 5 pesos pero el login no la usa.
- First Paint reportado 7,6 s en la 1.ª carga y 5,6 s en la 2.ª: probablemente inflado porque el panel del navegador estaba en segundo plano; no lo tomo como cifra confiable.

Segunda visita (service worker activo): todo sale del precache (transferSize 0), DOMContentLoaded 345 ms. La PWA sí acelera las visitas siguientes.

Login en 360×740: sin desplazamiento horizontal (scrollWidth 360), inputs de 40 px de alto y 14 px, botón «Ingresar» 255×44 px. Correcto.

### Lo que baja el primer render tras iniciar sesión (análisis de código)
1. `perfiles` (1 fila) — `src/App.jsx:88-92`.
2. `pullState()` = `select id, value` de **toda** `app_state` — `src/sync.js:181`, llamado en `src/App.jsx:123`. Incluye `serein_ots` (~4,2 MB según comentarios), `serein_params` (logos/firmas base64 de `src/ParametrosModule.jsx:245-295`, reducidos a 1000 px pero igual base64), `serein_logo`, `serein_logoIstria` (`src/ParametrosModule.jsx:349,466`), cotizaciones, facturas, etc.
3. Luego Dashboard monta y, además del paso 2, llama **otros dos `await pullState()`** completos en efectos de montaje: `src/Dashboard.jsx:484` (libro ventas) y `src/Dashboard.jsx:510` (costos por área) → la tabla completa se baja **3 veces** al entrar, más `libro_ventas` (`Dashboard.jsx:489`) y `libro_compras` (`Dashboard.jsx:514`) completos.
4. Canal realtime `app_state_vivo` (`src/Dashboard.jsx:379`) + sondeo `pullState()` cada 60 s (`src/Dashboard.jsx:398`) + re-`pullState()` y re-suscripción en cada `focus`/`visibilitychange` (`src/Dashboard.jsx:408-414`: al volver de WhatsApp en el celular se baja toda `app_state` otra vez).

---

## 1. Móvil

### Responsivo
- Solo hay **1 `@media`** en todo `src/` (`src/ui.jsx:316`, dentro de `GlobalStyles`, para `.kpi-card` a ≤860 px). Ningún archivo `.css`.
- `useEsMovil()` (`src/ui.jsx:14-26`, umbral 860 px) solo lo usan `Dashboard.jsx:251` (padding del contenedor), `Sidebar` y `PageHeader`. **Ningún módulo de negocio** (OT, Producción, Compras, Asistencia…) adapta su layout al ancho; dependen de `flexWrap: 'wrap'` (379 usos) y de que la tabla se desplace.
- Menú lateral en celular: cajón de 288 px con `position: fixed`, `100dvh`, fondo oscuro y cierre al tocar (`src/ui.jsx:142`). Botón de menú 42×42 px con `aria-label` (`src/ui.jsx:277`). Bien resuelto.
- **El indicador «Guardando… / Guardado en la nube / Error al guardar» vive solo dentro del Sidebar** (`src/ui.jsx:60-80`, `<EstadoGuardado>` en `ui.jsx:155`). En celular el Sidebar está cerrado, así que el supervisor en planta **nunca ve si su protocolo/foto se guardó o falló**, salvo que abra el menú. `PageHeader` no lo muestra.
- Aviso «Hay una versión nueva» (`src/App.jsx:183`): barra `position: fixed; top: 0` sin margen de seguridad; en el celular tapa el botón de menú y el título hasta que se recarga.

### Tablas anchas sin `overflow-x`
Relación `<table>` / contenedores con `overflowX: 'auto'` por archivo (grep): OTModule 12/4, OrdenesCompraModule 8/1, ProveedoresPagosModule 9/2 (pero su `Caja` sí tiene overflow, `src/ProveedoresPagosModule.jsx:107`), CotizacionesModule 20/3 (la mayoría son tablas de las plantillas HTML del PDF, no de pantalla), ManoObraModule 9/6, SubcontratistasModule 2/0, CotizadorModule 1/0. Verificados sin contenedor desplazable: `src/OTModule.jsx:2531` (tabla «Ítems cotizados · ajuste de venta por m² reales», N columnas), `src/OrdenesCompraModule.jsx:154` (facturas de la OC), `src/OTModule.jsx:2590, 2671, 2736, 2750, 2990, 3012, 3977`, `src/ManoObraModule.jsx:965, 1470, 1472`. En 360 px estas tablas rompen el ancho de la página o se aplastan.

### Inputs y botones
- `type="number"`: **61 usos**; `inputMode`: 0; `pattern`: 0. En Android `type=number` sí abre teclado numérico, pero en iOS no muestra el teclado de solo dígitos (se necesita `inputMode="numeric"`/`"decimal"`); además `type=number` permite escribir `e`, `-` y cambia el valor con la rueda del mouse en PC.
- Estilos base de inputs (`const inp… = {…}`): 22 con `fontSize: 13`, 7 con 12.5, 2 con 12. **iOS Safari hace zoom automático** al enfocar cualquier campo con fuente < 16 px; al salir del campo la pantalla queda ampliada. Afecta a casi todos los formularios (OT, protocolos, asistencia).
- Botones con padding vertical ≤ 7 px (altura real ≈ 26-32 px): **114 de 691** `<button>`. Ejemplo: `src/OTModule.jsx:2002` («Ingresar», `padding: '7px 12px', fontSize: 12`). Los botones «×» de borrar foto son de 18-20 px (`src/OTModule.jsx:1300, 1473`). Mínimo táctil recomendado: 40-44 px.
- Cámara: 37 `<input type="file">`, **0 con `capture`**. Con `accept="image/*"` Android/iOS ofrecen «Cámara / Galería» (funciona), pero no se abre la cámara directo; para recepción/despacho en planta un `capture="environment"` ahorra dos toques por foto. En OT solo `accept="image/*"` (`src/OTModule.jsx:1305, 1478, 2039, 3190, 3245`).
- Zoom: no está bloqueado (`index.html:5`, sin `user-scalable=no`). Correcto.

### Modales en 360 px
20 `position: 'fixed'`. Los modales usan `width: '100%' + maxWidth` y el overlay con `overflowY: 'auto'` (p. ej. `src/FinanzasModule.jsx:1160` maxWidth 1080, `src/OTModule.jsx:4067` y `src/ProyectosModule.jsx:2132` maxWidth 1000, `src/OrdenesCompraModule.jsx:320` 780): caben en ancho. Sin overflow en el overlay (si el contenido es más alto que la pantalla, no se puede llegar al botón de abajo): `src/CRMModule.jsx:44, 91, 533`, `src/FinanzasModule.jsx:1363`, `src/OrganigramaModule.jsx:180`, `src/CotizacionesModule.jsx:1121` y `src/CotizadorCalculo.jsx:335` (`width: 440, maxWidth: '100%'`, sin `maxHeight`). Foto ampliada: `src/OTModule.jsx:2059` usa `92vw/80vh`, bien.

### `100vh` en iOS
- `<main style={{ height: '100vh', overflowY: 'auto' }}>` (`src/Dashboard.jsx:817`) y `minHeight: '100vh'` en `App.jsx:20,162`, `Login.jsx:44`, `SubcontratoApp`, `TallerExternoApp`, `SereinChatWidget.jsx:121`. En Safari iOS (sin instalar) `100vh` es más alto que el área visible: la última fila/botón queda detrás de la barra inferior. El Sidebar móvil sí usa `100dvh` (`src/ui.jsx:142`); `main` no.

### `index.html`, manifiesto, iconos
- `index.html:5` viewport `width=device-width, initial-scale=1.0` **sin `viewport-fit=cover`** (en iPhone con notch, instalado, la franja superior/inferior no se pinta de naranja). `theme-color #F77716` ✔, `apple-mobile-web-app-capable` ✔, `apple-touch-icon` ✔, `lang="es"` ✔. Falta `<meta name="mobile-web-app-capable">` (Chrome ya lo toma del manifiesto, no es grave).
- Manifiesto generado (`dist/manifest.webmanifest`): name, short_name, `display: standalone`, `start_url /`, `id /`, `lang es-CL`, iconos 192, 512 y 512 maskable — todos existen en `public/icons/` (4-19 kB). Correcto.
- Google Fonts: `<link rel="stylesheet">` bloqueante en `index.html:17` (3 familias, 12 pesos, `display=swap`). No hay `preconnect` a `fonts.gstatic.com` (solo a googleapis, `index.html:13`). Sin red (PWA offline) las fuentes no están en precache (`globPatterns` solo cubre `woff2` locales, no hay ninguno) → texto con fuente del sistema; aceptable.

### Service worker (`vite.config.js:11`, `dist/sw.js`)
- `registerType: 'autoUpdate'` → `sw.js` lleva `skipWaiting()` y `clientsClaim()`; `registerSW.js` solo registra, **no recarga la página**. Al desplegar: la pestaña abierta sigue con el JS viejo, el SW nuevo toma el control en silencio y la siguiente recarga ya trae lo nuevo. **No recarga sola ni pierde lo que se escribía** (comprobado en `dist/registerSW.js`). El aviso azul de `App.jsx:183` pide recargar; el `beforeunload` de `App.jsx:135-141` retiene el cierre si hay un push en curso. Riesgo residual: entre que el SW nuevo borra el precache viejo y el usuario recarga, un chunk diferido viejo (`html2canvas`, `purify`, `index.es`) podría dar 404 al generar un PDF si Vercel ya no lo sirve; no lo pude provocar.
- `maximumFileSizeToCacheInBytes: 6 MB` y el chunk principal ya va en 3,4 MB: si sigue creciendo pasado 6 MB dejará de precachearse sin aviso.
- `navigateFallback` por defecto a `index.html` ✔ (instalada abre offline la carcasa; sin datos, porque todo viene de Supabase).

---

## 2. Carga inicial — resumen
- Un solo chunk de 3,44 MB / 954 kB gz con **todo** (React, Recharts, xlsx 0.18, jspdf 4, supabase-js, lucide, 21 módulos + Asesor IA). Sin `React.lazy`. `xlsx` y `recharts` solo se usan en módulos de administración, pero el supervisor de planta los baja igual.
- 3 fuentes web + 12 pesos; solo se usan 4 variantes en login.
- `pullState()` completo ×3 al entrar (`App.jsx:123`, `Dashboard.jsx:484`, `Dashboard.jsx:510`) + `libro_ventas` y `libro_compras` completos.
- `app_state` incluye imágenes base64: `serein_params` (logos, firmas; `ParametrosModule.jsx:245-295`, máx. 1000 px, JPEG 0.85/PNG), `serein_logo`, `serein_logoIstria` (`ParametrosModule.jsx:349, 466`), y sobre todo `serein_ots` (~4,2 MB, `OTModule.jsx:2884, 3573`). Hay migración manual a Storage (`OTModule.jsx:3583-3601`, botón con `window.confirm`), y `imgToData` sube a `fotos-ot` (`OTModule.jsx:2891-2915`, redimensiona a 1200 px, JPEG 0.78, cae a base64 si falla). **Pero `FotosOT` (`src/OTModule.jsx:2011-2025`) sigue guardando la foto ORIGINAL en base64** con `readAsDataURL` sin redimensionar ni subir a Storage: una foto de celular de 3-8 MB entra entera en `serein_ots`, se sube en cada `pushState`, la bajan todas las sesiones y arriesga `QuotaExceededError` en localStorage (límite ~5-10 MB, ya descrito en `sync.js:28-37`).

---

## 3. Consultas (inventario)

### `supabase.from(...)` que traen tablas completas sin `range`/`limit`/filtro (solo lecturas; grep de la misma línea)
| Archivo:línea | Tabla | Columnas |
|---|---|---|
| `src/LibroVentasModule.jsx:65` | `libro_ventas` | `*` |
| `src/AsesorModule.jsx:172` | `libro_ventas` | `*` |
| `src/LibroComprasModule.jsx:296` | `libro_compras` | `*` |
| `src/AsesorModule.jsx:151, 171` | `libro_compras` | 6 cols (2 veces) |
| `src/ConsolidadoModule.jsx:530, 537` | `libro_compras`, `libro_ventas` | 7 / 6 cols |
| `src/Dashboard.jsx:489, 514` | `libro_ventas`, `libro_compras` | 6 / 2 cols (en cada montaje del Dashboard) |
| `src/OTModule.jsx:3557` | `libro_compras` | 6 cols |
| `src/CartolasBancariasModule.jsx:130` | `movimientos_bancarios` | `*` |
| `src/LibroComprasModule.jsx:77` | `compras_sin_doc` | `*` |
| `src/AsesorModule.jsx:141`, `ConsolidadoModule.jsx:564` | `compras_sin_doc` | `monto` |
| `src/CreditoModule.jsx:828, 832` | `credito_clientes` `*`, `credito_facturas` 2 cols |
| `src/crm-api.js:12, 79, 121, 136, 141, 146` | `clientes` `*`, `crm_campanas` `*`, `vendedores` `*`, 3 vistas `*` |
| `src/AsesorModule.jsx:50, 115, 120, 125, 128, 131, 437-442` | `ai_conversaciones`, `alertas`, `recomendaciones`, `analisis_*` `*` |
| `src/intumescente-api.js:24, 38, 46` | `int_espesores` `*`, `int_parametros` `*` |
| `src/organigrama-api.js:15, 27, 28` | `organigrama_flujo` `*`, `organigrama_costos` `*`, `trabajadores` |
| `src/SubcontratistasModule.jsx:120, 200`, `SubcontratoApp.jsx:35, 36`, `TallerExternoApp.jsx:26` | asignaciones / facturas_subcontrato `*` |
| `src/LibroComprasModule.jsx:96, 120` | `tipos_gasto`, `proveedor_tipo` |

`correo_documentos` (CorreosModule) sí usa filtros/orden en la misma consulta y no aparece en la lista. Ninguna lectura de la app usa `.range()`; `.limit()` solo en algunas de Asesor/CRM.

### Se repiten en cada montaje de módulo
Todas las de arriba viven en `useEffect(..., [])` del módulo: cada vez que la persona cambia de pestaña y vuelve (el Dashboard desmonta el módulo anterior, `Dashboard.jsx:820`), `libro_ventas`/`libro_compras` completos se vuelven a bajar. No hay caché en memoria entre montajes (salvo los que guardan copia en localStorage, p. ej. `serein_libroVentasXlsx`).

### `functions.invoke` (27 sitios, 1 por línea)
`extraer-factura` (×4: OTModule 1516, ProyectosModule 402, FacturasModule 368, LibroVentasModule 439), `extraer-factura-compra` (×3), `extraer-guia` (×2), `extraer-oc`, `extraer-oc-proveedor`, `extraer-oc-comercial`, `extraer-credito`, `extraer-cubicacion`, `extraer-listado-partes`, `extraer-hoja-avance`, `redactar-oferta`, `subir-factura-compra-drive` (×3), `subir-factura-venta-drive` (×2), `subir-protocolo-drive`, `libro-ventas-sync`, `libro-compras-sync`, `enviar-alertas-vencimiento`, `notificar-factura-subcontrato`. Son todas bajo acción del usuario (correcto); en `ProyectosModule.jsx:284-989` la misma lógica de extraer/subir está copiada 3 veces.

### `await pullState()` dentro de handlers: **86 sitios** (cada uno = toda `app_state`, ≥4-5 MB)
FinanzasModule 16 · ProveedoresPagosModule 11 · ManoObraModule 9 · OTModule 7 · CotizacionesModule 5 · FacturasModule 5 · ProyectosModule 5 · InventarioModule 4 · Dashboard 3 · ParametrosModule 3 · ProduccionModule 3 · Clientes/ComprasOperativas/Contactos/ProyComprasLibro/Trazabilidad 2 c/u · CotizadorCalculo/cuentasProveedor/LibroCompras/OrdenesCompra/ProyCotizador 1 c/u.
Patrón «pull-fresh + merge + push» (`src/FinanzasModule.jsx:85-93`): agregar un gasto = bajar toda `app_state` + subir el blob entero. Un supervisor que registra 10 avances en Producción baja la base 10 veces. Existe `escribirConReintento()` (`src/sync.js:230`, compare-and-swap por fila) y `leerFresco(key)` (`sync.js:296`, baja una sola clave) que son mucho más baratos, pero solo los usan algunos sitios (Cotizaciones, Facturas).

### Intervalo de 5 s de `pushState` (`src/App.jsx:124`)
Cada 5 s recorre todas las claves `serein_*` de localStorage, lee cada valor (strings de varios MB) y lo compara con `lastPushed` (`src/sync.js:328-331`). Solo sube si cambió, pero la lectura/comparación de ~10 MB de strings cada 5 s es trabajo en el hilo principal (perceptible en teléfonos gama media). Además `Dashboard.jsx:340-343` reserializa **las 17 claves** con `JSON.stringify` (incl. `ots` de 4 MB) en **cada cambio de cualquier estado**, y agenda otro `pushState` a los 800 ms.

### Efectos que escriben en cada tecla
- `FinanzasModule.actualizarCuota` (`src/FinanzasModule.jsx:641-660`), `ProveedoresPagosModule.upd` (`:219-236`), y análogos en OT (protocolos), Facturas, Órdenes de Compra, ManoObra: en cada tecla hacen `localStorage.setItem('serein_fin', JSON.stringify(todoFin))` + `setFin(...)` (→ dispara el efecto de `Dashboard.jsx:340` que reserializa las 17 claves) y, con debounce de 700 ms, `await pullState()` (toda `app_state`) + `pushState()` (todo el blob). El debounce evita el pull por tecla, pero la serialización completa por tecla sigue.
- `Dashboard.jsx:340-343` es el efecto central: cualquier `setX` de un módulo → `guardarSerein` de 17 claves + `pushState` en 800 ms.

---

## 4. Percepción
- Estados de carga: 187 textos tipo «Cargando…/Subiendo…/Procesando…» en `src/`; `App.jsx` muestra «Cargando…», «Verificando tu perfil…», «Sincronizando datos con la nube...» (`App.jsx:144-158`) en pantalla oscura sin barra de progreso ni tiempo estimado; con `app_state` de 5+ MB en 4G es una pantalla negra de varios segundos sin indicio de avance.
- Pantalla en blanco al fallar: hay `ErrorBoundary` (`App.jsx:12-31`) con botón «Reiniciar datos locales y recargar» que **borra todas las claves `serein_*`** — si el usuario tenía cambios sin subir (protección de `sync.js`), los pierde con un clic; el texto no lo advierte.
- `window.alert`/`confirm`/`prompt`: **193 llamadas** en 36 archivos (CotizacionesModule 23, OTModule 29, ProyectosModule 23, LibroVentas 12, Facturas 14, ManoObra 12…). En celular son modales nativos que bloquean, no se pueden estilizar y en PWA instalada en iOS aparecen sin título. El propio indicador de guardado usa 3 `alert` (`src/ui.jsx:38-40`) y «Restablecer datos» un `confirm` (`ui.jsx:230`).
- Feedback al guardar: existe y es honesto (`EstadoGuardado`, `src/ui.jsx:28-83`, refleja `pushState` real), pero en móvil queda oculto en el cajón (ver §1). Los módulos no muestran confirmación local («Guardado» junto al formulario) salvo mensajes puntuales (`msg` en `OTModule.jsx:2005`).
- Botones que no indican que trabajan: 132 `disabled=` frente a 27 `functions.invoke` + 86 `await pullState()` + 8 `onClick={async`; muchos handlers `async` largos (p. ej. `agregarGastoFresco`, `FinanzasModule.jsx:85`) no deshabilitan el botón mientras bajan `app_state` → doble toque = doble registro (el `escribirConReintento` lo evita solo donde se usa). Buen ejemplo: `NuevaClave` (`App.jsx:240`, `disabled={cargando}` + «Guardando…») y `ControlTallerModule.jsx:286` (`disabled={subiendo}`).

---

## 5. Accesibilidad básica
- Contraste (calculado WCAG): naranja `#F77716` sobre blanco **2,76:1** (falla AA 4,5:1 texto y 3:1 texto grande); blanco sobre naranja (menú lateral completo, botones primarios, avatar) **2,76:1**; `rgba(255,255,255,.66)` sobre naranja (títulos de sección del menú, `ui.jsx:168`) ≈ **2,0:1**; `orangeDark #D9600A` sobre blanco 3,73:1 (sirve solo para texto ≥18 px/14 px negrita); `textFaint #9AA3AD` sobre blanco **2,56:1** y se usa en cientos de etiquetas de 10-11 px (`fontSize: 10, color: '#9AA3AD'`, p. ej. `OTModule.jsx:1998-2001`); `warn #C9860B` 3,04:1; `green #1B9E5D` 3,45:1 en texto de estado. `textSoft #5A636E` 6,1:1 ✔, naranja sobre `ink` 6,75:1 ✔.
- `label`: 375 `<label>` y **0 `htmlFor`**; la mayoría son `<label>` sueltos encima del input (no envuelven ni asocian): lectores de pantalla y el toque sobre la etiqueta no enfocan el campo. 901 `<input>`, 405 con `placeholder` como única pista. `aria-label`: 12 en todo el ERP.
- Foco visible: `GlobalStyles` (`ui.jsx:316`) define `input:focus … box-shadow 0 0 0 3px rgba(247,119,22,.15)` (anillo muy tenue, 15 % de opacidad) y 10 `outline: 'none'` explícitos (`Login.jsx:14`, `App.jsx:213`, buscador del header `ui.jsx:289`). Los `<button>` no tienen estilo `:focus-visible` propio: en navegación por teclado se ve el outline por defecto del navegador, salvo donde se anuló.
- Tamaño de fuente < 12 px: **825 ocurrencias** (`fontSize: 9-11.5`), 176 de ≤ 10 px; 93 celdas `<td>/<th>` con 9-11 px y 54 tablas con fuente base ≤ 12 px. En planta, con guantes y sol, 10 px es ilegible.

---

## Hallazgos por severidad

### CRÍTICO
1. **Toda la base se baja completa decenas de veces por sesión** — `src/sync.js:181`, `src/App.jsx:123`, `src/Dashboard.jsx:398, 408-414, 484, 510` + 86 `await pullState()` en handlers (lista en §3). Riesgo: cada registro del supervisor (avance, foto, gasto) mueve 4-5+ MB de ida y otro tanto de vuelta por el 4G de planta; fue la causa de la saturación de Supabase que dejó a un usuario sin perfil (comentario en `App.jsx:103-106`). Corrección: (a) un solo pull al entrar y quitar los de `Dashboard.jsx:484/510`; (b) reemplazar «pull-fresh + push» por `escribirConReintento(key, mutar)` o `leerFresco(key)` por clave (ya existen en `sync.js:230, 296`); (c) partir `serein_ots` en una fila por OT (o tabla real) para que el push/pull sea por OT; (d) en el sondeo y el `focus`, comparar `updated_at` antes de bajar `value`.
2. **Fotos de OT guardadas en base64 sin reducir** — `src/OTModule.jsx:2016-2024` (`FotosOT.subir`, `readAsDataURL` directo, sin `imgToData`). Riesgo: una foto de 5 MB del celular entra entera en `serein_ots`, se sube en cada push, la reciben todas las sesiones y puede superar el límite de localStorage (`sync.js:28-37`): el guardado falla en silencio y se pierden protocolos. Corrección: usar `imgToData` (`OTModule.jsx:2891`, ya redimensiona y sube a Storage) en `FotosOT`, y correr la migración de `OTModule.jsx:3583` para las OT existentes.

### ALTO
3. **Un solo bundle de 3,44 MB (954 kB gz) sin división** — `.auditoria/build.log`, `src/Dashboard.jsx:9-38` (imports estáticos de los 21 módulos), 0 `React.lazy`. Riesgo: 2-4 s extra de descarga + parseo en cada actualización (cada deploy invalida el precache) para quien solo usa Producción/OT desde el celular. Corrección: `React.lazy` por módulo en `Dashboard.jsx:820`, `manualChunks` para `recharts`/`xlsx`/`jspdf`, cargar `xlsx` solo al importar Excel.
4. **El estado de guardado no se ve en el celular** — `src/ui.jsx:155` (`EstadoGuardado` solo en Sidebar; `PageHeader` `ui.jsx:267-301` no lo incluye). Riesgo: el supervisor cierra la app creyendo que la foto/protocolo se guardó; si el push falló (sin señal) nadie lo sabe hasta que falta el dato. Corrección: mostrar el mismo `EstadoGuardado` compacto en `PageHeader` cuando `movil`, y un toast «Error al guardar» global.
5. **193 `window.alert/confirm/prompt`** — p. ej. `src/ui.jsx:38-40`, `OTModule.jsx` (29), `CotizacionesModule.jsx` (23), `ProyectosModule.jsx` (23), `LibroComprasModule.jsx` (2 `prompt`). Riesgo: en PWA instalada los diálogos nativos son toscos, bloquean la app y en iOS salen sin contexto; `prompt` no sirve bien en móvil. Corrección: un componente `Confirmar`/`Aviso` único (ya hay modales con el mismo patrón en `CRMModule.jsx:44`) y reemplazar progresivamente, empezando por OT/Producción.
6. **Reserialización completa en cada tecla** — `src/Dashboard.jsx:340-343` (`guardarSerein` de 17 claves + push 800 ms en cada cambio) y los `upd` por tecla (`FinanzasModule.jsx:641-660`, `ProveedoresPagosModule.jsx:219-236`, OT/Facturas/OC/MO). Riesgo: lag al escribir en teléfonos gama media (JSON.stringify de 4+ MB por tecla), batería, y `localStorage.setItem` fallando por cuota en silencio. Corrección: guardar solo la clave que cambió (un efecto por clave o `useEffect` con `[fin]`, `[ots]` separados) y aplicar el cambio local al estado sin reescribir localStorage hasta el debounce.
7. **Contraste de la marca** — `src/theme-serein.js:5-6` (`#F77716` 2,76:1 sobre blanco), menú naranja con texto blanco (`ui.jsx:142`), `#9AA3AD` (2,56:1) en etiquetas de 10-11 px por todo el ERP. Riesgo: ilegible a pleno sol en planta y para personas con baja visión; incumple WCAG AA. Corrección: texto sobre naranja en `#101315` o fondo `orangeDark`/`ink` para texto blanco; subir `textFaint` a ≥ `#6B7580` (4,5:1) en texto < 14 px; reservar el naranja puro para fondos/íconos.

### MEDIO
8. **Tablas sin `overflow-x: auto`** — `src/OTModule.jsx:2531, 2590, 2671, 2736, 2750, 2990, 3012, 3977`, `src/OrdenesCompraModule.jsx:154`, `src/ManoObraModule.jsx:965, 1470, 1472`, `SubcontratistasModule.jsx:168, 242`, `CotizadorModule.jsx:142`. Riesgo: en 360 px la página se ensancha o las celdas se aplastan; columnas de montos quedan cortadas. Corrección: envolver en `<div style={{overflowX:'auto'}}>` (como ya hace `Caja` en `ProveedoresPagosModule.jsx:107`) o vista en tarjetas cuando `useEsMovil()`.
9. **Inputs con fuente < 16 px → zoom automático en iOS** — 31 estilos base `inp*` con 12-13 px (p. ej. `OTModule.jsx:3192` `fontSize: 12`), 61 `type="number"` sin `inputMode`, 0 `capture`. Riesgo: en iPhone cada campo amplía la pantalla y hay que pellizcar para volver; teclado completo en vez de numérico; dos toques extra por foto. Corrección: `fontSize: 16` en inputs cuando `movil`, `inputMode="decimal"` + `type="text"` para cantidades/montos, `capture="environment"` en las fotos de recepción/despacho/protocolos.
10. **Botones táctiles chicos** — 114 `<button>` con padding ≤ 7 px (≈28-32 px), p. ej. `OTModule.jsx:2002`; botones «×» de 18-20 px en `OTModule.jsx:1300, 1473`. Riesgo: toques fallidos y borrados de fotos por error con guantes. Corrección: `minHeight: 40` en `Btn` (`ui.jsx:245`) y en los estilos base de cada módulo cuando `movil`; separar el «×» 8 px del borde.
11. **Tres descargas de `app_state` al entrar + `libro_*` completos en el Dashboard** — `src/Dashboard.jsx:484-489, 510-514`. Riesgo: pantalla «Sincronizando…» más larga y datos repetidos (`libro_ventas` se vuelve a bajar en Consolidado, Libro de Ventas y Asesor). Corrección: una sola carga compartida (contexto o caché en memoria por sesión) y agregados calculados en SQL (vista con `sum(neto)` por área) en lugar de bajar filas.
12. **`100vh` en `main`** — `src/Dashboard.jsx:817` (`height: '100vh'`), `App.jsx:20,162`, `Login.jsx:44`, `SereinChatWidget.jsx:121`. Riesgo: en Safari iOS sin instalar, la última fila/botón del módulo queda bajo la barra del navegador. Corrección: `height: '100dvh'` con fallback `100vh` (como ya hace el Sidebar en `ui.jsx:142`).
13. **Modales sin desplazamiento vertical** — `src/CRMModule.jsx:44, 91, 533`, `FinanzasModule.jsx:1363`, `OrganigramaModule.jsx:180`, `CotizacionesModule.jsx:1121`, `CotizadorCalculo.jsx:335`. Riesgo: en pantallas de 640 px de alto con teclado abierto el botón «Guardar» queda fuera de alcance. Corrección: `maxHeight: '90dvh', overflowY: 'auto'` en la caja del modal.
14. **Etiquetas no asociadas** — 0 `htmlFor` en 375 `<label>` (`src/*.jsx`), 12 `aria-label`, anillo de foco al 15 % (`ui.jsx:316`). Riesgo: lector de pantalla no anuncia qué campo es; tocar la etiqueta no enfoca el campo; navegación por teclado en PC sin saber dónde está el foco. Corrección: envolver `<label><span/>…<input/></label>` o `id`+`htmlFor`; `:focus-visible { outline: 2px solid #F77716; outline-offset: 2px }` global para botones e inputs.
15. **Botones que no muestran que trabajan** — handlers `async` sin `disabled` (p. ej. `agregarGastoFresco` `FinanzasModule.jsx:85`, `OTModule.jsx:2002` «Ingresar»); solo 132 `disabled=` en 691 botones. Riesgo: doble toque en 4G lento = registro duplicado o dos facturas extraídas (cada `functions.invoke` de IA cuesta dinero). Corrección: estado `ocupado` por acción + `disabled` + texto «Guardando…» como en `App.jsx:240`.

### BAJO
16. **Fuentes web** — `index.html:17`: 3 familias/12 pesos bloqueantes; solo se usan Inter 400/600 y Oswald 600/700 en el login; falta `preconnect` a `fonts.gstatic.com`. Corrección: reducir a Inter 400/600/700 + Archivo 700 (y migrar lo que queda en Oswald), `preconnect` a gstatic, o autoalojar woff2 (así entran al precache del SW).
17. **Chequeo de versión duplicado** — `src/App.jsx:46-63`: se observaron 2 `fetch('/')` al cargar; y la barra «Hay una versión nueva» (`App.jsx:183`) tapa el botón de menú en móvil. Corrección: `useRef` para el primer HTML y `top: env(safe-area-inset-top)`/barra inferior.
18. **`viewport-fit=cover` ausente** — `index.html:5`. En iPhone con notch instalada la zona de estado no se pinta; agregar `viewport-fit=cover` + `padding-top: env(safe-area-inset-top)` en el header móvil.
19. **Precache con tope de 6 MB** — `vite.config.js:36`: el chunk principal (3,4 MB) está a la mitad del límite; si crece más deja de cachearse sin aviso. Corrección: dividir el bundle (hallazgo 3) y fijar `chunkSizeWarningLimit` para que el build avise.
20. **«Reiniciar datos locales y recargar»** — `src/App.jsx:24`: borra todas las claves `serein_*` sin advertir que puede haber cambios sin subir. Corrección: avisar si `obtenerEstadoGuardado().fase !== 'guardado'` antes de borrar.
21. **Texto diminuto** — 825 `fontSize` < 12 px, 176 ≤ 10 px (OTModule 167, ProyectosModule 91). Corrección: mínimo 12 px en tablas y 11 px solo en metadatos; en móvil 13 px.
