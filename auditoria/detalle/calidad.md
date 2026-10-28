# Auditoría de calidad de código — serein-app

Clon: `C:\Users\maria\gwt\serein-audit`, rama `main`, commit `85627fd` (2026-10-27).
Revisión solo de lectura. Todo lo que figura abajo se comprobó con `grep`, `wc`, un script Node de análisis de imports, `npm view` y `npm audit --package-lock-only`. Las cifras que no pude verificar se marcan como tales.

---

## 0. Resumen ejecutivo

| Severidad | Hallazgo | Dónde |
|---|---|---|
| CRÍTICO | 19 escrituras a Supabase que no leen `error` (9 de ellas dentro de `try/catch` que nunca atrapa, porque `supabase-js` no lanza) → borrados y actualizaciones que pueden fallar en silencio mientras la pantalla dice "listo" | `CreditoModule.jsx:216,289,432,589,595`, `AsesorModule.jsx:78,229,245,289,327,375,426`, `SubcontratistasModule.jsx:139,217`, `serein-ai/historial.js:55,59,66`, `LibroComprasModule.jsx:105,117` |
| ALTO | Dos copias de `hoy()` usan `toISOString()` (hora UTC): desde las 21:00 en Chile devuelven la fecha de **mañana** | `LibroComprasModule.jsx:135`, `ProyectosModule.jsx:43` |
| ALTO | Vulnerabilidades: 1 crítica (dompurify, vía jspdf, con arreglo), 3 altas (xlsx **sin arreglo**, vite, source-map-js), 2 moderadas, 5 bajas | `package-lock.json` |
| ALTO | `Dashboard.jsx` concentra todo el estado (29 `useState`, 52 pases de props, sin router, 2 `useMemo`, 0 `useCallback`, 0 `React.memo` en todo `src/`) | `Dashboard.jsx:244-642, 820-1078` |
| ALTO | Sin ESLint, sin Prettier, sin script `test`, sin CI: 58 imports sin uso y 505 líneas de archivos muertos entraron sin que nada avisara | `package.json`, raíz |
| ALTO | 5 copias de `clp()` sin `|| 0` muestran `$NaN` si el valor viene vacío | `Dashboard.jsx:47`, `OTModule.jsx:28`, `FinanzasModule.jsx:11`, `CotizadorModule.jsx:5`, `ComprasOperativasModule.jsx:9` |
| MEDIO | Manejo de errores inconsistente: 104 `window.alert`, 83 `window.confirm`, 362 `catch` vacíos (31 envuelven llamadas a Supabase), 7 `console.error` | ver §5 |
| MEDIO | Código muerto: `PipelineOT.jsx`, `PipelineProyectos.jsx`, `CotizadorModule.jsx` (505 líneas, importados solo donde no se usan), `escribirConReintento`/`leerFresco` (revertidos en julio pero siguen en `sync.js`), 11 funciones exportadas sin uso, 98 `export` innecesarios | ver §3 |
| MEDIO | 2 componentes definidos dentro del render (se desmontan y remontan en cada render) | `Dashboard.jsx:665` (`PeriodoSelector`), `ManoObraModule.jsx:796` (`ToggleVista`) |
| MEDIO | Edge Functions: 22 funciones sin carpeta `_shared`; `tokenDeServicio`, `importPrivateKey`, `buscarOCrearCarpeta`, `base64Url`, `base64UrlFromBytes` copiadas 3 veces; modelo `claude-sonnet-5` escrito a mano 12 veces | `supabase/functions/*` |
| MEDIO | `pushState()` cada 5 s recorre todo `localStorage` y compara cadenas de ~4,2 MB (`serein_ots`) | `App.jsx:124`, `sync.js:283-286` |
| MEDIO | Dependencias atrasadas: lucide-react 0.383 → 1.62, react 18.3 → 19.3, recharts 2.15 → 3.10, vite 5.4 → 8.3 | `package.json` |
| BAJO | 44 copias de `clp`, 21 de `hoy`, 18 de `num`, 14 de `norm`, 10 de `sumarDias`, 26 de `inp`, 40 paletas `C = {...}`, 2.185 colores hex literales | ver §2 |
| BAJO | 29 `import React` que no se usan (Vite usa el runtime automático de JSX) | ver §3.2 |

---

## 1. Estructura

### 1.1 Tamaño de `src/` (líneas, `wc -l`)

Total: **32.041 líneas** en 81 archivos de `src/` + 912 líneas en `src/serein-ai/` (6 archivos). Sin `node_modules`, sin `dist`.

| Archivo | Líneas | Nota |
|---|---:|---|
| `OTModule.jsx` | 4.087 | 31 funciones de primer nivel; `TarjetaOT` 635 líneas (desde la 2.317), `OTModule` 533 líneas (3.554-4.087), `MarcasEsperadasOT` 339, `FacturacionOT` 284 |
| `ProyectosModule.jsx` | 2.153 | 22 funciones de primer nivel |
| `ManoObraModule.jsx` | 1.579 | |
| `FinanzasModule.jsx` | 1.533 | |
| `CotizacionesModule.jsx` | 1.217 | |
| `FacturasModule.jsx` | 1.107 | |
| `Dashboard.jsx` | 1.093 | |
| `ProveedoresPagosModule.jsx` | 1.019 | |
| `CreditoModule.jsx` | 917 | |
| `LibroVentasModule.jsx` | 836 | |
| `AsesorModule.jsx` | 757 | |
| `LibroComprasModule.jsx` | 705 | |
| `ConsolidadoModule.jsx` | 654 | |
| `TrazabilidadModule.jsx` | 604 | |
| `proveedores-data.js` | 602 | datos semilla |
| `ComprasOperativasModule.jsx` | 570 | |
| `CotizadorIntumescenteModule.jsx` | 566 | |
| `CRMModule.jsx` | 553 | |
| `OrdenesCompraModule.jsx` | 533 | |
| `ParametrosModule.jsx` | 497 | |
| `ProduccionModule.jsx` | 481 | |
| `ControlTallerModule.jsx` | 451 | |
| `CartolasBancariasModule.jsx` | 444 | |
| `OrganigramaModule.jsx` | 365 | |
| `CotizadorCalculo.jsx` | 354 | |
| `sync.js` | 342 | |
| `RevisionContableModule.jsx` | 339 | |
| `CorreosModule.jsx` | 320 | |
| `CotizadorModule.jsx` | 315 | **muerto** (ver §3.1) |
| `ui.jsx` | 312 | |
| `creditoCalculo.js` | 303 | |
| `revisionContable.js` | 295 | |
| `SubcontratistasModule.jsx` | 291 | |
| `intumescente-api.js` | 278 | |
| `InventarioModule.jsx` | 268 | |
| `App.jsx` | 267 | |
| `ProyCotizador.jsx` | 243 | |
| `importKronos.js` | 220 | |
| `CotizadorParametros.jsx` | 219 | |
| `SubcontratoApp.jsx` | 213 | |
| `revisionContable.test.mjs` | 208 | |
| `ClientesModule.jsx` | 206 | |
| resto (41 archivos) | < 200 c/u | |
| `serein-ai/tools.js` | 325 | |
| `serein-ai/SereinChatWidget.jsx` | 188 | |

8 archivos superan las 1.000 líneas; suman 13.688 líneas (43 % del código).

### 1.2 Componentes definidos dentro de otros componentes

Solo 2 reales (el resto de los `const Mayúscula =` con sangría son variables, no componentes):

- `Dashboard.jsx:665` — `const PeriodoSelector = () => (...)` definido dentro de `Dashboard`. Contiene los `<select>`/`<input>` de período (`setPeriodoModo`, `setPeriodoAnio`, `setPeriodoDesde`, `setPeriodoHasta`). Al estar dentro del render, React lo trata como un tipo nuevo en cada render y desmonta/remonta su subárbol: cualquier cambio de estado del Dashboard mientras se escribe una fecha puede quitar el foco del campo. No lo probé en navegador; es la consecuencia conocida del patrón.
- `ManoObraModule.jsx:796` — `const ToggleVista = ({ vista, setVista }) => (...)` dentro del módulo. Mismo patrón; solo contiene botones, así que el efecto es menor.

### 1.3 Estado global pasado por props en cadena

- `Dashboard.jsx` tiene **29 `useState`** (líneas 124-642): `avances, mo, comprasOp, configCompras, fin, pp, params, clientes, contactos, facturas, cotizaciones, comisiones, ppmPct, ots, proyectos, inventario, invMov, libroVentasDb, costosArea, periodo*` etc. Cada uno se inicializa desde `localStorage` (`LS()` en `Dashboard.jsx:60`).
- **52 pases de props** del tipo `pp={pp}`, `setPp=`, `ots=`, `setOts=`, `facturas=`, `proyectos=` en el render del Dashboard (líneas 820-1078). Ejemplo: `Dashboard.jsx:841` pasa 11 props a `OTModule`; `OTModule.jsx:3554` las recibe y `TarjetaOT` (`OTModule.jsx:2317`) vuelve a recibir `pp, setPp, comprasOp, ot, onUpdate, onUpdateProtocolos…`.
- `setPp` lo reciben por props 5 módulos: `CotizacionesModule`, `LibroComprasModule`, `OrdenesCompraModule`, `OTModule`, `ProveedoresPagosModule`. `setOts` lo reciben `CotizadorModule`, `OTModule`, `TrazabilidadModule`.
- No hay Context ni store: la única forma de que un módulo lea un dato de otro es que el Dashboard se lo pase.

### 1.4 Sin router

- `react-router` no está en `package.json` ni en `src/` (grep vacío).
- La navegación es `areaSel` (`Dashboard.jsx:244-248`, guardado en `sessionStorage`) con **38 comparaciones `areaSel ===`** y una cadena de ternarios de 260 líneas (`Dashboard.jsx:820-1081`) que decide qué módulo renderizar. No hay URLs por módulo: no se puede enlazar a "la OT 977" ni usar el botón atrás del navegador.

### 1.5 Tests

Existen 4 archivos, todos de lógica pura (sin React ni Supabase), y **los 4 pasan** al correrlos con `node src/<archivo>.test.mjs` (lo ejecuté, sin `node_modules`):

- `src/intumescente-calc.test.mjs` (53 líneas)
- `src/ofertaCalc.test.mjs` (40)
- `src/revisionContable.test.mjs` (208)
- `src/vencimientos.test.mjs` (142)

Pero: `package.json` no tiene script `test`; no hay `.github/` ni ningún CI; nada los corre automáticamente. Los 4 cubren `intumescente-calc.js`, `ofertaCalc.js`, `revisionContable.js` y `vencimientos.js` (≈ 636 líneas de 32.041 ≈ 2 %). Cero pruebas de los módulos React, de `sync.js` y de las Edge Functions.

### 1.6 ESLint / Prettier

No existen `.eslintrc*`, `eslint.config.*`, `.prettierrc*` ni `.editorconfig`; `package.json` no declara `eslint` ni `prettier`. Los scripts son solo `dev`, `build`, `preview`.

---

## 2. Duplicación

Conteos con `grep -rn --include=*.js --include=*.jsx -F "<patrón>" src`.

| Helper | Definiciones | Archivos | Observación |
|---|---:|---|---|
| `const clp = ` | **44** | 41 archivos (3 lo redefinen 2-3 veces: `ConsolidadoModule.jsx:15,434,461`, `FinanzasModule.jsx:11,849`) | 5 variantes **sin `|| 0`** devuelven `$NaN` con `undefined`: `Dashboard.jsx:47`, `OTModule.jsx:28`, `FinanzasModule.jsx:11`, `CotizadorModule.jsx:5`, `ComprasOperativasModule.jsx:9`. Otras 2 tienen semántica distinta: `CorreosModule.jsx:15` devuelve `—` si está vacío; `RevisionContableModule.jsx:16` pone el signo adelante (`-$`). |
| `hoy` (fecha de hoy AAAA-MM-DD) | **21** | `AsesorModule:11`, `ComprasOperativasModule:11`, `ControlTallerModule:22`, `CotizacionesModule:489`, `CotizadorModule:7`, `CreditoModule:20`, `FinanzasModule:13`, `intumescente-api:120,209`, `InventarioModule:13`, `LibroComprasModule:135`, `ManoObraModule:12`, `OrdenesCompraModule:21`, `OTModule:37`, `plazos:6`, `ProduccionModule:9`, `ProveedoresPagosModule:19`, `ProyectosModule:43`, `serein-ai/tools:240`, `TrazabilidadModule:151` | **2 usan `new Date().toISOString().slice(0, 10)`** (`LibroComprasModule.jsx:135`, `ProyectosModule.jsx:43`): eso es la fecha en UTC. Chile está en UTC-3/-4, así que desde las 20:00/21:00 devuelve la fecha de mañana. Las otras 19 usan hora local. Además ya existe `hoyISO()` exportada en `vencimientos.js:37` que nadie reutiliza. |
| `const num = ` | 18 | ComprasOperativas, Consolidado, Correos, Cotizaciones, CotizadorModule, creditoCalculo, Credito, Facturas, Finanzas, Inventario, ManoObra, OrdenesCompra, OT, Parametros, ProveedoresPagos, ProyCotizador, Proyectos, ProyParametros | |
| `norm` (normalizar texto) | 14 | 11 `const norm` + 3 `function norm` (`controlTaller.js`, `OTModule.jsx` tiene ambas, `revisionContable.js`) | |
| `sumarDias` | 10 | `AsesorModule`, `FacturasModule`, `LibroVentasModule`, `OrdenesCompraModule`, `OTModule`, `plazos.js`, `ProveedoresPagosModule`, `ProyectosModule`, `TrazabilidadModule`, `vencimientos.js` (6 definiciones + usos) | `vencimientos.js` ya la exporta. |
| `rutN` / `rutNorm` | 4 | `LibroComprasModule`, `revisionContable.js` (`rutN`); `LibroVentasModule`, `OrdenesCompraModule` (`rutNorm`) | `crm-api.js` exporta además `normalizarRut`. |
| `const pct = ` | 9 | Asesor, CotizadorCalculo, creditoCalculo, creditoInforme, Credito, Dashboard, Finanzas, OrdenesCompra, Proyectos | |
| `const fmtF…` (fecha corta) | 8 | Cartolas, Correos, informeCobranzaPDF, informeFacturas, LibroCompras, LibroVentas, RevisionContable, RevisionEnLibro | |
| `const uid = ` | 3 | Asesor, CotizadorIntumescente, Inventario | |
| Estilo `const inp = ` | 26 archivos | | `ui.jsx` exporta `THEME`, `Btn`, `Pill`, `KpiCard`… pero cada módulo define su propio `inp`. |
| Estilo `const sel = ` | 13 | | |
| Estilo `const btn = ` | 4 | | |
| Paleta `const C = {` | **40 archivos** | 37 son alias de `SEREIN.*` (`theme-serein.js`), 3 definen colores propios: `CotizadorModule.jsx`, `PipelineOT.jsx`, `PipelineProyectos.jsx` (los 3 muertos, ver §3) | Hay **2.185 literales hex `#RRGGBB`** en `src/`, 182 distintos. |

Duplicación en Edge Functions (`supabase/functions/`, 22 funciones, 3.191 líneas, sin carpeta `_shared/`):
`tokenDeServicio` ×3, `importPrivateKey` ×3, `buscarOCrearCarpeta` ×3, `base64Url` ×3, `base64UrlFromBytes` ×3 (las 3 funciones `subir-*-drive`), `escapeHtml` ×2, `login` ×2, `pick` ×2, `toDate` ×2, `const PAGE`/`BASE` ×2 (`defontana-sync`, `libro-ventas-sync`). Las 12 funciones `extraer-*`/`redactar-oferta`/`correos-ingresar` repiten el mismo bloque `fetch("https://api.anthropic.com/v1/messages", …)` + `if (!res.ok)` + limpieza de ```` ```json ```` + `JSON.parse` (`extraer-factura/index.ts:87-125` es el patrón).

---

## 3. Código muerto

Método: script Node que resuelve todos los `import … from './x'` (incluidos multilínea) y compara con los `export`; luego confirmé cada candidato con `grep -c` de la palabra completa en el archivo (1 aparición = solo la definición/import).

### 3.1 Archivos muertos

Importados **únicamente** por `Dashboard.jsx`, donde el import no se usa (1 sola aparición del nombre en todo el archivo):

- `src/PipelineOT.jsx` (98 líneas) — `Dashboard.jsx` lo importa y nunca lo renderiza.
- `src/PipelineProyectos.jsx` (92 líneas) — ídem.
- `src/CotizadorModule.jsx` (315 líneas) — ídem; además su propio texto dice "Vista de prueba: los cambios se pierden al recargar" (`CotizadorModule.jsx:311`). Es la versión vieja del cotizador (`CotizadorCalculo.jsx` es la vigente, importada por `CotizacionesModule`).

Total: **505 líneas** que se compilan en el bundle sin que nadie las vea.

`src/facturas-data.js` aparece sin importadores directos, pero `FacturasModule.jsx:13` la re-exporta (`export { FACTURAS_SEED } from`) y `Dashboard.jsx:35` la usa: **no** está muerta.

### 3.2 Imports sin uso (58 confirmados con `grep -c` = 1)

29 son `import React from 'react'` sin ningún `React.` después (inofensivo con el runtime automático de JSX de Vite, pero es ruido que un linter marcaría): `ClientesModule, ComprasOperativasModule, ControlTallerModule, CorreosModule, CotizacionesModule, CotizadorIntumescenteModule, CotizadorModule, CreditoModule, CRMModule, FinanzasModule, InstalarApp, Login, LogoSerein, main.jsx, OrdenesCompraModule, Paginador, PipelineOT, PipelineProyectos, ProduccionModule, ProyComprasLibro, ProyCotizador, ProyParametros, RevisionContableModule, RevisionEnLibro, SubcontratistasModule, SubcontratoApp, TallerExternoApp, TrazabilidadModule` (+1 más).

Los otros 29:

| Archivo | Import sin uso |
|---|---|
| `Dashboard.jsx` | `PipelineOT`, `PipelineProyectos`, `CotizadorModule`, `LogoSerein`, `costoOCdeOT` (de `OrdenesCompraModule`), `LogOut`, `User` |
| `OTModule.jsx` | `CalendarDays`, `KpiCard`, `Pill` |
| `ProveedoresPagosModule.jsx` | `Truck`, `TrendingDown`, `FileText` |
| `ProduccionModule.jsx` | `Plus`, `Users`, `useMemo` |
| `CotizacionesModule.jsx` | `CheckCircle2`, `X` |
| `ComprasOperativasModule.jsx` | `AlertTriangle`, `useMemo` |
| `FinanzasModule.jsx` | `CheckCircle2`, `textoCuenta` (de `cuentasProveedor.js`) |
| `CRMModule.jsx` | `actualizarVendedor` (de `crm-api.js`) |
| `CotizadorIntumescenteModule.jsx` | `generarFolio` (de `intumescente-api.js`) |
| `OrganigramaModule.jsx` | `guardarCostoManual` (de `organigrama-api.js`) |
| `InventarioModule.jsx` | `INVENTARIO_SEED` |
| `ConsolidadoModule.jsx` | `TrendingDown` |
| `CorreosModule.jsx` | `Mail` |
| `CotizadorModule.jsx` | `FileText` |
| `SubcontratistasModule.jsx` | `useMemo` |

Falsos positivos del script que descarté a mano: `OTModule.jsx` `generarPdfProtocoloBlob`/`protocoloCompleto`/`blobToBase64`/`useEffect` (sí se usan, líneas 3215-3225).

### 3.3 Funciones exportadas que nadie importa ni usa en su propio archivo (13)

- `sync.js`: `escribirConReintento`, `leerFresco` — son el mecanismo que se **revirtió** el 24-jul ("Vuelta atrás urgente", ver §3.5); siguen ahí sin uso.
- `intumescente-api.js`: `cargarParametros`, `eliminarProducto`, `guardarTablaEspesores`, `marcarVencidas`, `listarRevisiones`, `paraListadoCentral` (6).
- `serein-ai/historial.js`: `historialDisponible`, `listarConversaciones`, `cargarMensajes` (3).
- `crm-api.js`: `cargarClientesSinContacto`.
- `cotizador-data.js`: `precioM2`.

### 3.4 `export` innecesarios (98)

98 nombres se exportan pero solo se usan dentro de su propio archivo (p. ej. las 16 funciones `*DeOT` de `OTModule.jsx`, las 17 de `cotizador-data.js`, las 10 `obtener_*` de `serein-ai/tools.js` que se consumen vía el objeto `TOOLS`, las 7 de `FacturasModule.jsx`, las 9 de `ManoObraModule.jsx`). No es código muerto, pero hace creer que hay dependencias cruzadas que no existen. Lista completa en la salida del script (sección "INNECESARIO").

### 3.5 Comentarios de "vuelta atrás" y código viejo

- `CotizacionesModule.jsx:953-962`, `CotizadorCalculo.jsx:105-108`, `OTModule.jsx:3682`, `FacturasModule.jsx:314`: cuatro comentarios "Vuelta atrás urgente (24-jul): escribirConReintento() hace un viaje extra…" explican por qué se dejó de usar `escribirConReintento`. La función sigue en `sync.js` (muerta). El comentario reconoce que el patrón actual "sigue protegido contra choques salvo en el margen de milisegundos entre leer y escribir — peor que el compare-and-swap".
- `Dashboard.jsx:928-936`: comentario de 9 líneas que describe un bloque ya eliminado (`{false && ...}`, `ResumenFinancieroCard`, `CardModulo`, `ResumenModulos`). El código ya no está; el comentario sobra.
- `ConsolidadoModule.jsx:125`, `cotizador-data.js:17-18`: comentarios "Antes era…" que documentan el cambio; aceptables.
- `OTModule.jsx` tiene 26 bloques `{/* … */}`; los que miré (357, 845, 946, 1651, 2317…) son explicativos, no código comentado.
- Bloques de código comentado (`// const …`, `// return …`): solo 1 línea en `importKronos.js`. No hay código viejo comentado en masa.
- No hay `TODO`/`FIXME`/`HACK` (el grep de 217 coincidencias es casi todo la palabra "todo"/"Todos" en castellano).

---

## 4. Dependencias

### 4.1 Versiones (`npm view <pkg> version`, 2026-10-27) vs `package.json` vs instalado en `package-lock.json`

| Paquete | package.json | Instalado (lock) | Última | Salto |
|---|---|---|---|---|
| `@supabase/supabase-js` | ^2.45.0 | 2.110.7 | 2.118.0 | menor |
| `html-to-image` | ^1.11.13 | 1.11.13 | 1.11.13 | al día |
| `jspdf` | ^4.2.1 | 4.2.1 | 4.2.1 | al día |
| `lucide-react` | ^0.383.0 | 0.383.0 | **1.62.0** | mayor (0.x → 1.x) |
| `react` / `react-dom` | ^18.3.1 | 18.3.1 | **19.3.1** | mayor |
| `recharts` | ^2.12.7 | 2.15.4 | **3.10.1** | mayor |
| `xlsx` | ^0.18.5 | 0.18.5 | 0.18.5 (npm) | el paquete npm está abandonado por SheetJS; las versiones nuevas (0.20.x) solo se publican en su CDN |
| `@vitejs/plugin-react` (dev) | ^4.3.1 | — | **6.1.2** | mayor |
| `vite` (dev) | ^5.4.0 | 5.4.21 | **8.3.5** | 3 mayores |
| `vite-plugin-pwa` (dev) | ^2.0.0 | 2.0.0 | 2.0.0 | al día |

### 4.2 `npm audit --package-lock-only --json`

**11 vulnerabilidades: 1 crítica, 3 altas, 2 moderadas, 5 bajas.**

| Sev. | Paquete | Vía | Arreglo | Afecta a |
|---|---|---|---|---|
| **crítica** | `dompurify` ≤3.4.16 | `jspdf` (transitiva) | **sí, sin cambio mayor** (`npm audit fix`) | Generación de PDF en el navegador (cotizaciones, OC, informes). 5 avisos de XSS vía `IN_PLACE`/`SAFE_FOR_TEMPLATES`. |
| alta | `xlsx` (todas las versiones) | directa | **no hay** en npm | Prototype Pollution (GHSA-4r6h-8v6p-xvw6) y ReDoS (GHSA-5pgg-2g8v-p4x9). Se usa en 16 archivos para **leer Excel que suben usuarios** (importaciones Kronos, cartolas, libros). |
| alta | `vite` ≤6.4.3 | directa (dev) | solo subiendo a vite 8 | Solo el servidor de desarrollo (path traversal, `server.fs.deny`, `launch-editor`). No afecta al build publicado. |
| alta | `source-map-js` 1.0.0-1.2.1 | transitiva (build) | sí | DoS en el build; no afecta producción. |
| moderada | `esbuild` ≤0.24.2 | vite (dev) | solo con vite 8 | Servidor de desarrollo. |
| moderada | `fast-uri` 3.0.0-3.1.8 | transitiva | sí | |
| baja ×5 | `deepmerge`, `@rollup/plugin-node-resolve`, `workbox-build`, `vite-plugin-pwa`, `serialize-javascript` | vite-plugin-pwa (build) | `serialize-javascript` sí; el resto npm propone **bajar** vite-plugin-pwa a 0.2.1 (no tiene sentido) | Build. |

### 4.3 Paquetes declarados y no usados / usados y no declarados

- Los 8 `dependencies` se usan: `@supabase/supabase-js` (1 archivo: `supabase.js`), `html-to-image` (2), `jspdf` (4), `lucide-react` (40), `react` (49), `react-dom` (1), `recharts` (1: `Dashboard.jsx`), `xlsx` (16).
- Ningún paquete usado sin declarar: los únicos imports externos son esos 8 + `node:assert` (built-in, solo en los `.test.mjs`).
- `recharts` (≈ 500 kB) se carga por un solo archivo; no medí el bundle.

---

## 5. Manejo de errores

Cifras (`grep` sobre `src/`, incluye `serein-ai/`):

| Patrón | Cantidad |
|---|---:|
| Llamadas `supabase.from/rpc/auth/storage/functions` | 256 |
| `const { data, error } / { error } = await supabase…` | 97 (+24 con alias `error: xxx`) — en todas las que revisé en contexto el `error` sí se comprueba en las líneas siguientes |
| `const { data } = await supabase…` (ignora `error`) | 9 |
| `await supabase.from(…).update/insert/upsert/delete(…)` **sin leer el resultado** | **19** |
| `.then(` sin `.catch` | 22 |
| `pushState()` sin `await` | 127 (vs 3 con `await`) — por diseño: `pushState` nunca rechaza, atrapa todo adentro (`sync.js:329-336`) y devuelve `{ok,error}`; el comentario en `App.jsx:125-130` reconoce el caso de la cotización 865 que se perdió al cerrar la pestaña |
| `catch (e) {}` / `catch {}` vacíos | **362** (31 envuelven llamadas a Supabase en las 4 líneas previas); 7 más con comentario `/* silencioso */` |
| `window.alert(` | **104** (CotizacionesModule 19, OTModule 16, LibroVentas 10, Proyectos 9, LibroCompras 8, Subcontratistas 7, Cartolas 7, Facturas 6…) |
| `window.confirm(` / `window.prompt(` | 83 / 2 |
| `console.error` / `console.warn` | 7 / 3 |
| `setErr*/setError/setMsg(` (mensaje en pantalla) | 94 llamadas en 19 archivos |
| `functions.invoke(` | 27 llamadas en 11 archivos; la mayoría mira `data.ok`/`error` (63 líneas de chequeo en las 3 siguientes) |

### 5.1 `supabase-js` no lanza en `update/insert/delete`: sitios que lo asumen mal

`supabase-js` v2 devuelve `{ data, error }`; **nunca lanza** por un error de la base (RLS, constraint, columna inexistente). Por tanto un `try { await supabase.from(...).delete() } catch {}` no atrapa nada. Sitios encontrados:

**a) Dentro de `try/catch` que nunca verá el error (9):**
- `AsesorModule.jsx:229, 245, 289, 327, 375, 426` — `await supabase.from('alertas'|'recomendaciones'|'analisis_*').upsert(rows, …)` dentro de `try { … } catch (e) {}`. Si el upsert falla, el Asesor cree que guardó el análisis.
- `serein-ai/historial.js:55, 59, 66` — `insert` en `ai_mensajes`, `update` en `ai_conversaciones`, `insert` en `ai_auditoria` dentro de `try { … } catch (e) { /* silencioso */ }`. La "trazabilidad técnica de cada consulta" que el comentario promete puede no guardarse nunca.

**b) Sin ninguna comprobación (8):**
- `CreditoModule.jsx:289` — `await supabase.from('credito_documentos').delete().eq('id', d.id)` tras `window.confirm('¿Eliminar…')`; justo antes (288) ya borró el archivo de Storage. Si el delete de la fila falla, queda una fila apuntando a un archivo que ya no existe, y la pantalla quita el documento igual (290-291).
- `CreditoModule.jsx:432` — `delete` de `credito_ordenes_compra`, luego `recargar()`.
- `CreditoModule.jsx:589` — `update(cambios)` en `credito_clientes` que puede **bloquear una línea de crédito** (`estado_credito: 'bloqueada'`); si falla, el mensaje "Línea bloqueada automáticamente" (590) se muestra igual.
- `CreditoModule.jsx:595` — `update` de `trabajos_pagados`.
- `CreditoModule.jsx:216` — `update` de `datos_extraidos`.
- `SubcontratistasModule.jsx:139, 217` — `delete` de asignaciones tras `window.confirm`; luego `cargar()` recarga, así que el usuario al menos vería que sigue ahí, sin saber por qué.
- `AsesorModule.jsx:78` — `update` de `updated_at` sin `await` ni `.then`.

**c) Resultado tragado a propósito (2):**
- `LibroComprasModule.jsx:105, 117` — `.upsert(…).then(() => {}, () => {})`: el tipo de gasto nuevo se guarda en `localStorage` (104) pero si el upsert a `tipos_gasto`/`proveedor_tipo` falla, nadie se entera y en el otro equipo no aparece.

**d) `{ data }` sin `error` (9):** `ControlTallerModule.jsx:59, 272`, `CreditoModule.jsx:558, 562`, `OTModule.jsx:2908, 3601, 3728`, `ParametrosModule.jsx:307`, `SubcontratistasModule.jsx:265`. Son lecturas (`select`, `createSignedUrl`, `getUser`): si fallan, la pantalla muestra una lista vacía o una foto rota sin explicación.

### 5.2 Qué ve el usuario cuando falla una consulta

Tres comportamientos conviven, según el módulo:
1. **`window.alert`** con el texto técnico de Supabase (104 sitios; ej. `CotizacionesModule.jsx:951` "Esto quedó guardado en este equipo, pero no se pudo subir a la nube…").
2. **Mensaje inline** vía `setErr/setMsg` (19 módulos; ej. `CreditoModule.jsx:103, 418, 663`, `CartolasBancariasModule.jsx:140`).
3. **Nada** (los 362 `catch` vacíos y los 19 sitios de §5.1; `AsesorModule`, `historial.js`, `LibroCompras` tipos de gasto).

Lo único centralizado es el estado de guardado del blob `app_state` (`sync.js:120-131` + `EstadoGuardado` en `ui.jsx:28`), que sí distingue "Guardando / Guardado / Error" y detecta el caso de RLS que devuelve 0 filas (`sync.js:296-322`). Eso cubre solo lo que va por `pushState`; las tablas propias (crédito, CRM, cartolas, intumescente, subcontratos, IA) quedan fuera.

### 5.3 Edge Functions

- Las 22 tienen `try/catch` (salvo `sii-sync`, 0 `try`); 0 `catch` vacíos.
- Las 12 que llaman a Anthropic comprueban `res.ok` y lanzan con el `status` (`extraer-factura/index.ts:111-114`).
- Convención: **los errores se devuelven con HTTP 200** y `{ ok: false, error }` (`extraer-factura/index.ts:156-160`). Funciona porque el cliente mira `data.ok`, pero `supabase.functions.invoke` nunca verá `error` y los logs de Supabase no cuentan fallos como fallos.
- Modelo `claude-sonnet-5` escrito a mano en 12 archivos (sin variable de entorno ni constante compartida): cambiar de modelo es tocar 12 archivos.

---

## 6. Rendimiento de código

| Métrica | Valor |
|---|---|
| `useMemo(` en todo `src/` | 96 (CorreosModule 13, Trazabilidad 11, Asesor 10, LibroVentas 7, Cartolas 7…) — **Dashboard.jsx: 2, OTModule.jsx: 2** (4.087 líneas) |
| `useCallback(` | **0** en todo `src/` |
| `React.memo` / `memo(` | **0** |
| `JSON.stringify` para comparar | 2: `CotizadorIntumescenteModule.jsx:487` (`cambiado = JSON.stringify(form) !== JSON.stringify(inicial)` en cada render), `LibroVentasModule.jsx:287` |
| `JSON.stringify` total | 137 (casi todo persistencia a `localStorage`) |
| Líneas con `.some/.find/.filter` dentro de `.map/.filter` (O(n·m)) | 186 (OTModule 24, Asesor 9, LibroCompras 7, Facturas 7, Trazabilidad 6, Dashboard 6, Correos 6…) |

Hallazgos concretos:

1. **Dashboard recalcula 34 agregados en cada render** (`Dashboard.jsx:531-625`: `facNeto`, `gastosPend`, `cuotasPend`, `docsPend`, `ocsPend`, `cobrosPend`, `factPend`, `proyPorCobrar`, `otEnCurso`, `proyPorFacturar`, `cobrosReg`, `pagosReg`, `netoFactTotal`…) con `filter/reduce/flatMap` sobre `facturas`, `ots`, `proyectos`, `fin`, `pp`, sin `useMemo`. Como todo el estado vive en el Dashboard, cualquier `setX` de cualquier módulo (una OT que cambia de estado, una factura cobrada) vuelve a correr todo esto y re-renderiza el módulo activo completo (OTModule de 4.000 líneas incluido). Lo que **no** pasa: escribir en los formularios de OT no toca el Dashboard, porque `OTModule` usa estado local (`setF` ×25, `setP` ×21, `setAmb` ×12 en los `onChange`; 79 `useState` propios) y recién al guardar llama a `setOts`. Los únicos inputs que escriben directo en el Dashboard son los 5 selectores de período (`setPeriodoAnio/Modo/MesNum/Desde/Hasta`).
2. **`OTModule.jsx:3559`** `const ots = otsAll.filter(…)` y **`:3881`** `const visibles = porVista.filter(o => coincideBusqueda(o) && coincideFiltros(o))` se recalculan en cada render sin memo; con el buscador escribiendo, cada tecla filtra toda la lista (es local al módulo, no llega al Dashboard).
3. **Sondeo de 5 segundos** (`App.jsx:124` `setInterval(() => { pushState() }, 5000)`): `pushState` (`sync.js:283-286`) recorre todas las claves de `localStorage`, hace `getItem` de cada una y compara `v !== lastPushed[k]` — con `serein_ots` de ~4,2 MB (comentarios en `OTModule.jsx:2884, 3573` y `sync.js:31-33`) eso es leer y comparar 4 MB de texto 12 veces por minuto, en el hilo principal. Se suma el `pullState` cada 60 s (`Dashboard.jsx:398`), el canal realtime (`Dashboard.jsx:379`) y el chequeo de versión cada 60 s (`App.jsx:59`).
4. **Componentes anidados** (§1.2) se remontan en cada render del padre.
5. `Dashboard.jsx:841`, `:879`, `:881` crean arreglos nuevos en cada render (`ots.map(o => o.numero)`, `pp.ocs || []`, `contactos.clientes || []`) y los pasan como props: aunque se añadiera `React.memo` a los módulos, no serviría sin memoizar estas props.

No medí tiempos en navegador; esto es análisis estático.

---

## 7. Cómo corregir (orden sugerido)

1. **Escrituras sin comprobar (CRÍTICO)** — en los 19 sitios de §5.1 cambiar a `const { error } = await …; if (error) { setMsg('No se pudo…: ' + error.message); return }`. En `CreditoModule.jsx:288-289` borrar primero la fila y después el archivo. Regla para el equipo: "todo `await supabase` se destructura y se mira `error`". Un ESLint custom o una función envoltorio `db(q)` que lance si `error` resolvería la clase entera.
2. **`hoy()` UTC (ALTO)** — reemplazar `LibroComprasModule.jsx:135` y `ProyectosModule.jsx:43` por `hoyISO()` de `vencimientos.js`; después migrar las otras 19 copias al mismo import.
3. **`npm audit fix`** (sin `--force`): arregla dompurify (crítica), source-map-js, fast-uri y serialize-javascript sin cambios mayores. Para `xlsx`: instalar la 0.20.x desde el CDN de SheetJS (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` en `package.json`) o reemplazar por `exceljs`; mientras tanto, no procesar Excel de origen desconocido. Vite 8 solo cuando se pueda probar el build.
4. **Lint + test en el flujo** — añadir `eslint` con `eslint-plugin-react-hooks` y `no-unused-vars`, `"test": "node --test src/*.test.mjs"` en `package.json`, y un workflow de GitHub Actions que corra `npm ci && npm run lint && npm test && npm run build` en cada PR (la memoria indica que el permiso `workflow` lo debe dar Fernanda).
5. **Helpers compartidos** — crear `src/lib/formato.js` (`clp`, `num`, `pct`, `fmtFecha`), `src/lib/fechas.js` (`hoyISO`, `sumarDias`, ya en `vencimientos.js`/`plazos.js`), `src/lib/texto.js` (`norm`, `rutN`), y un `src/lib/estilos.js` (`inp`, `sel`, `btn`) o usar los de `ui.jsx`. Reemplazar las 44+21+18+14+10 copias con imports. Es mecánico y bajo riesgo si `clp` queda con `|| 0`.
6. **Borrar lo muerto** — `PipelineOT.jsx`, `PipelineProyectos.jsx`, `CotizadorModule.jsx`, `escribirConReintento`/`leerFresco` en `sync.js`, las 11 funciones de §3.3, los 58 imports de §3.2 y el comentario de `Dashboard.jsx:928-936`. Quitar `export` a los 98 nombres de §3.4 (opcional).
7. **Dashboard** — sacar `PeriodoSelector` (`:665`) y `ToggleVista` (`ManoObraModule.jsx:796`) fuera del render; envolver los 34 agregados (`:531-625`) en 3-4 `useMemo` por fuente (`facturas`, `ots`, `proyectos`, `fin`/`pp`); a mediano plazo, mover el estado a un Context por dominio (`OtsContext`, `FacturasContext`…) para que `OTModule` no reciba 11 props y un cambio en facturas no re-renderice OT. Un router (`react-router` o un `useHashRoute` de 20 líneas) daría URL por módulo y botón atrás.
8. **Edge Functions** — carpeta `supabase/functions/_shared/` con `anthropic.ts` (fetch + limpieza de JSON + modelo desde `Deno.env.get('ANTHROPIC_MODEL')`), `drive.ts` (`tokenDeServicio`, `importPrivateKey`, `buscarOCrearCarpeta`, `base64Url*`) y `http.ts` (CORS, respuesta de error con status 4xx/5xx en vez de 200).
9. **Sondeo** — en `pushState` comparar `huella()` (ya existe, `sync.js:38`) guardada por clave en vez de la cadena completa, o marcar "sucio" al escribir en `localStorage` y solo entonces subir; subir el intervalo a 15-30 s con `visibilitychange`.
