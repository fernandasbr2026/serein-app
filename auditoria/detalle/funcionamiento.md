# Auditoría de FUNCIONAMIENTO — serein-app (main, commit 85627fd)

Fecha: 2026-10-27. Clon: `C:\Users\maria\gwt\serein-audit`. Sin cambios en `src/`, sin commits, sin SQL, sin navegador contra producción. `package-lock.json` quedó restaurado (`git checkout`) después de `npm install`.

Archivos de apoyo en esta carpeta: `npm-ci.log`, `npm-install.log`, `build.log`, `audit.json`, `oxlint.txt`.
Script de bordes: `C:\Users\maria\AppData\Local\Temp\claude\C--Users-maria-Claude-Projects-app-serein\e1f21758-303e-43c7-9aa3-c6e18c6ca770\scratchpad\bordes.mjs` (salida en `bordes.md` al lado).

---

## 1. Build

| Paso | Resultado |
|---|---|
| `npm ci` | **FALLA** (`EUSAGE`): `package.json` y `package-lock.json` no están sincronizados. Faltan en el lock: `@types/babel__generator@7.27.0`, `@types/babel__template@7.4.4`, `@types/babel__traverse@7.28.0`, `@types/d3-color@3.1.3`, `@types/d3-path@3.1.1`. Cualquier CI o despliegue que use `npm ci` se cae. |
| `npm install` | OK (usado como alternativa). Avisos: `core-js@3.49.0` y `esbuild@0.21.5` con scripts de instalación no aprobados (`allowScripts`). |
| `npm run build` (vite 5.4.21) | **OK en 27,5 s**, 2818 módulos. |
| Tests propios del repo (`src/*.test.mjs`) | 4/4 pasan: `intumescente-calc`, `ofertaCalc`, `revisionContable`, `vencimientos`. |

Warnings del build:
1. `OTModule.jsx` se importa dinámicamente desde `CotizacionesModule.jsx:358` pero estáticamente desde `Dashboard.jsx`, `TrazabilidadModule.jsx` y `vistaCliente.js` → el `import()` no divide nada (todo va al chunk principal).
2. Chunk principal > 500 kB.

Tamaño de `dist/assets`:

| Chunk | Bytes | gzip |
|---|---|---|
| `index-11nljCo9.js` | 3.447.313 (3,44 MB) | 953,87 kB |
| `html2canvas.esm-CBrSDip1.js` | 202.301 | 48,03 kB |
| `index.es-BMm4gAVE.js` (jspdf) | 150.731 | 51,55 kB |
| `purify.es-Jn2rvFN8.js` | 28.911 | 10,90 kB |

Todo el ERP (los 31.600 líneas de `src/`, recharts, xlsx, supabase-js, lucide) va en un solo archivo de 3,4 MB; la PWA lo precachea (3,78 MB en 15 entradas, con `maximumFileSizeToCacheInBytes` subido a 6 MB para que quepa). No hay `manualChunks` en `vite.config.js`.

`npm audit`: 11 vulnerabilidades (1 crítica, 3 altas, 2 moderadas, 5 bajas):
- **crítica** `dompurify` ≤3.4.16 (vía jspdf) — fix con `npm audit fix`.
- **alta** `xlsx` (prototype pollution + ReDoS) — **sin fix disponible** (SheetJS no publica en npm; habría que cambiar a la CDN de SheetJS o a `exceljs`).
- **alta** `source-map-js` (vite) — fix con `npm audit fix`.
- **alta** `vite` ≤6.4.3 (vía esbuild dev server) — solo `--force` (vite 8, rompe).
- moderadas `esbuild`, `fast-uri`; bajas `deepmerge`/`workbox-build`/`vite-plugin-pwa`, `serialize-javascript`.

Lint (oxlint 0.16, reglas de identificadores no definidos, claves duplicadas, código inalcanzable y variables sin uso): **ningún identificador indefinido ni código inalcanzable** (los 688 "not defined" son globales del navegador/Node porque no hay config de entorno). Sí hay código muerto: ver §3.

---

## 2. Cálculos críticos con casos de borde

Método: copié el cuerpo literal de cada función pura (no se pueden importar los `.jsx`) y las corrí con Node 24; `vencimientos.js` se importó directo. "Esperado" es lo que el negocio esperaría; "NO" marca diferencia, y en la columna de observaciones digo si el caso es alcanzable desde la pantalla.

### 2.1 Resumen de fallos y su alcance real

| # | Función | Caso | Sale | Debería | ¿Alcanzable desde la UI? |
|---|---|---|---|---|---|
| C1 | `num()` de OC/Cotizaciones/ManoObra (`parseInt` tras quitar todo lo que no es dígito) | `1234.56`, `"1.234,56"`, `1500.5` | 123456 / 123456 / 15005 | 1235 / 1235 / 1501 | Sí: el campo es texto libre. Un precio unitario escrito como `1.500,5` o `12,5` se multiplica ×10 o ×100 sin aviso. En CLP casi nunca hay decimales, pero un `$` con coma de miles al revés (`1,500`) da 1500 (correcto por casualidad) y `1,5` da 15. |
| C2 | `totales()` Cotizaciones, `pUnitario: "-100"` | 100 | 0 o rechazo | Sí (texto). `num` quita el signo (`/\D/g`), así un precio negativo se vuelve positivo. |
| C3 | `ocNeto()` items con `cantidad: "1,5"` o `precio: 1500.5` | 15000 / 30010 | 1500 / 3001 | Sí: en OC `cantidad` usa `num` (entero), a diferencia de Cotizaciones que usa `numDec`. 1,5 galones ×1000 = 15.000. |
| C4 | `costoOCdeOT()` / `costoComprasOpDeOT()` con reparto 150 % | 150 % del neto cargado a la OT | tope 100 % o rechazo | **OC: sí** (`FormOC.guardar` solo muestra "Suma: 150% (debería ser 100%)" en rojo y guarda igual; en edición en línea tampoco bloquea). Compras operativas: el supervisor está bloqueado (`asigOk`), pero Gerencia edita el % en línea sin validación (`ComprasOperativasModule.jsx:405`). |
| C5 | `costoComprasOpDeOT()` pct `"50,5"` | 50 % (pierde el decimal) | 50,5 % | Sí en edición de Gerencia (`parseFloat` sin cambiar coma por punto). OC sí acepta coma (`pctNum`). |
| C6 | `calcularPerdidaFactoring()` con `dias: "abc"`, `tasa: "0,83"` o `tasa: undefined` | `NaN` → se muestra "$NaN" | costoOp / 59.877 / costoOp | Parcial: en Parámetros la tasa pasa por `dec()` al crear y editar, así que `"0,83"` no llega. Pero `dias` viene de `r.dias`/`fac.plazo` sin sanear (`LibroVentasModule.jsx:571`, `FacturasModule.jsx:756`); un `dias` no numérico daría NaN en la pérdida. No vi en el código una fuente que escriba texto ahí, así que lo dejo como riesgo bajo. |
| C7 | `dec("-3")` → 3; `dec("1.234,56")` → 1.234 | signo perdido; punto de miles leído como decimal | -3 / 1234,56 | `dec` se usa para tasas (0,83 / 3,5): el formato con miles no aplica. Tasa negativa no tiene sentido. Bajo. |
| C8 | `limpiaSigno("5-0")` → 50 | 50 | rechazar | Bajo. |
| C9 | `calc(t).horaExtra / calc(t).hora` = 1,4999 (se redondea `hora` y luego `horaExtra` por separado) | 5.950 vs 3.967×1,5=5.950,5 | ±1 peso | Bajo: diferencia de 1 peso por hora extra. |
| C10 | `calc({sueldo: "-800000"})` → día bruto 26.667 | signo ignorado | 0 o rechazo | Bajo (nómina la edita Gerencia). |
| C11 | `horasEntre("08:00","08:00")` → 24 h; `horasEntre("abc","xyz")` → 24 h | 24 h extra | 0 / rechazo | **Sí**: si por error se pone la misma hora de inicio y fin en "Horas extra semana", se paga un turno de 24 h (= 24 × 5.950 = $142.800 para Daniel). El input es `type="time"`, así que "abc" no llega, pero horas iguales sí. |
| C12 | `calcAtrasoMin("25:99")` → 1.119 min | — | — | No alcanzable: inputs `type="time"`. |
| C13 | `descargarOT()` (OTModule.jsx:2070) suma `v.neta` y `c.monto` **sin** `|| 0` | `NaN` si una venta/costo no trae monto | número | Parcial: los formularios siempre guardan `num()`; una ficha importada/antigua sin `neta` deja el Excel de la OT con "NaN" en Venta/Utilidad/Margen. El resto de OTModule (2284+, 3663, 3920) sí usa `|| 0`. |
| C14 | `costo.monto: "1.000"` (texto) en utilidad de OT | 10000 − "1.000" = 9999 | 9000 | Sí si el dato viene de importación; los formularios guardan número. Bajo. |
| C15 | `totalDe()` de Compras operativas con `neto: "23211"` (texto) | `"2321123794410"` (concatena) | 30.000 | No alcanzable hoy: ambos caminos (`FormCompra` y edición Gerencia) pasan por `num()`. |

### 2.2 Lo que SÍ resiste bien
- IVA 19 % y redondeos: `ocNeto/ocIva/ocTotal`, `totales()`: 100.000 → 19.000 → 119.000; `monto` bruto 119.000 → neto 100.000; IVA de $1 → 0; descuento mayor al ítem → 0 (no negativo); OC con `neto` y `monto` ausentes → 0.
- Combustible: boleta real 23.211 + 2.379 + IVA 4.410 = 30.000 ✔; impuesto específico negativo `"-500"` ✔; categoría no combustible ignora el impuesto ✔; `neto: null` → total `null` (no 0) ✔; sin IVA ✔.
- Factoring: 1.190.000 a 30 días con Defontana = 9.877 + 50.000 = 59.877 ✔; `dias: undefined` → solo costoOp ✔; `f = null` → 0 ✔; base 0 → costoOp 50.000 (correcto: el costo fijo existe igual).
- Vencimientos (`vencimientos.js`): 31/02 → `''`; fecha vacía/undefined/`dd/mm/aaaa` → `''`; plazo 4.7 → `''` (no entero); plazo -5 → `null`; 999 → 365; 31-01 + 30 = 02-03; 28-02-2026 + 1 = 01-03; cambio de hora de Chile (sept→oct) = 30 días exactos ✔; emisión 31/02 en el formulario deja vencimiento vacío sin romper nada ✔.
- Mano de obra: 800.000 + 270.981 → día 35.699, hora 3.967, hora extra 5.950 (hora × 1,5 = recargo 50 %) ✔; 15:30→19:10 = 3,67 h ✔; cruce de medianoche 22:00→02:00 = 4 h ✔; atraso 08:30 → 30 min → descuento 1.984 ✔; llegar 07:30 → sin descuento ✔; viernes salida 12:00 → 120 min antes de las 14:00 ✔; media jornada factor 0,5 → 17.850 ✔; atraso enorme → pago 0 (no negativo) ✔; feriado trabajado = valor Domingo del trabajador (100 %; si Domingo = 0 el feriado paga 0 — es por diseño, Domingo se carga a mano).
- Margen OT: venta 1.000.000 / costo 700.000 → 30 % ✔; sin ventas → margen 0 (no división por 0) ✔; venta negativa (NC) → margen 0 ✔.

### 2.3 Tabla completa (110 casos, 27 distintos de lo esperado)

| Módulo | Caso | Entrada | Salida real | Esperado | OK |
|---|---|---|---|---|---|
| OC | neto 100000 | `{"neto":100000}` | `[100000,19000,119000]` | `[100000,19000,119000]` | sí |
| OC | neto 0 | `{"neto":0}` | `0` | `0` | sí |
| OC | neto negativo -5000 | `{"neto":-5000}` | `[-5000,-5950]` | `[-5000,-5950]` | sí |
| OC | neto decimal 1234.56 | `{"neto":1234.56}` | `123456` | `1235` | **NO** |
| OC | neto "1.234,56" | `{"neto":"1.234,56"}` | `123456` | `1235` | **NO** |
| OC | neto texto "abc" | `{"neto":"abc"}` | `0` | `0` | sí |
| OC | neto y monto undefined | `{}` | `0` | `0` | sí |
| OC | solo monto bruto 119000 | `{"monto":119000}` | `[100000,119000]` | `[100000,119000]` | sí |
| OC | solo monto bruto 100 | `{"monto":100}` | `[84,100]` | `[84,100]` | sí |
| OC | items cant 2 × precio 1500.5 | `{"items":[{"cantidad":2,"precio":1500.5}]}` | `30010` | `3001` | **NO** |
| OC | items cant "1,5" × 1000 | `{"items":[{"cantidad":"1,5","precio":1000}]}` | `15000` | `1500` | **NO** |
| OC | descuento > subtotal | `{"items":[{"cantidad":1,"precio":1000,"descuento":5000}]}` | `0` | `0` | sí |
| OC | precio negativo | `{"items":[{"cantidad":1,"precio":-1000}]}` | `0` | `0` | sí |
| OC | items vacíos + neto 500 | `{"items":[],"neto":500}` | `500` | `500` | sí |
| OC | pct "33,33" | `"33,33"` | `33.33` | `33.33` | sí |
| OC | pct 150 (>100) | `150` | `150000` | `100000` | **NO** |
| OC | pct "abc" | `"abc"` | `0` | `0` | sí |
| COT | 1 × 100000 | `{"items":[{"cant":1,"pUnitario":100000}]}` | `{afecto:100000,iva:19000,total:119000}` | igual | sí |
| COT | sin items | `{}` | `{0,0,0}` | igual | sí |
| COT | cant 0 | `{"items":[{"cant":0,"pUnitario":100}]}` | `0` | `0` | sí |
| COT | cant "1.234,56" × 1000 | — | `1234560` | `1234560` | sí |
| COT | cant 1234.56 × 1000 | — | `1234560` | `1234560` | sí |
| COT | cant "1.234" × 1000 (miles) | — | `1234000` | `1234000` | sí |
| COT | pUnitario "-100" | — | `100` | `0` | **NO** |
| COT | pUnitario 1500.5 | — | `15005` | `1501` | **NO** |
| COT | pUnitario "1.234,56" | — | `123456` | `1235` | **NO** |
| COT | pUnitario "abc" | — | `0` | `0` | sí |
| COT | pUnitario undefined | — | `0` | `0` | sí |
| COT | descuento > ítem | — | `0` | `0` | sí |
| COT | cant "-2" | — | `0` | `0` | sí |
| COT | IVA de 1 peso | — | `{1,0,1}` | igual | sí |
| ComprasOp | boleta real diésel | neto 23211, imp 2379, IVA | `[4410,30000]` | `[4410,30000]` | sí |
| ComprasOp | imp. específico "-500" | — | `27121` | `27121` | sí |
| ComprasOp | bencina sin IVA | — | `11000` | `11000` | sí |
| ComprasOp | EPP ignora imp. específico | — | `11900` | `11900` | sí |
| ComprasOp | neto null | — | `null` | `null` | sí |
| ComprasOp | neto 0 + imp 500 | — | `500` | `500` | sí |
| ComprasOp | neto texto "23211" | — | `"2321123794410"` | `30000` | **NO** (no alcanzable) |
| ComprasOp | neto 1234.56 + impEsp "1.234,56" | — | `[123456,235,124925.56]` | `[1235,235,2704]` | **NO** |
| ComprasOp | impEsp "--50" | — | `-50` | `-50` | sí |
| ComprasOp | impEsp "5-0" | — | `50` | `0` | **NO** |
| ComprasOp | reparto 150 % a una OT | — | `16500` | `11000` | **NO** |
| ComprasOp | pct "50,5" | — | `5500` | `5555` | **NO** |
| Factoring | 1.190.000 / 30 d / sin mora | Defontana | `{9877,0,50000,59877}` | igual | sí |
| Factoring | base 0 | — | `50000` | `50000` | sí |
| Factoring | base negativa | — | `{-830,0,50000,49170}` | igual | sí |
| Factoring | dias undefined | — | `50000` | `50000` | sí |
| Factoring | dias "30" | — | `9877` | `9877` | sí |
| Factoring | dias "abc" | — | `null` (NaN) | `50000` | **NO** |
| Factoring | tasa "0,83" texto | — | `null` (NaN) | `59877` | **NO** (Parámetros aplica `dec`) |
| Factoring | tasa undefined | — | `null` (NaN) | `50000` | **NO** |
| Factoring | f = null | — | `0` | `0` | sí |
| Factoring | tasa 150 % | — | `1500000` | `1500000` | sí |
| Factoring | mora 400 días | — | `466667` | `466667` | sí |
| Factoring | dec("0,83") | — | `0.83` | `0.83` | sí |
| Factoring | dec("-3") | — | `3` | `-3` | **NO** |
| Factoring | dec("1.234,56") | — | `1.234` | `1234.56` | **NO** |
| Vencimientos | 2026-01-31 + 30 | — | `2026-03-02` | igual | sí |
| Vencimientos | 2026-02-31 + 30 | — | `""` | `""` | sí |
| Vencimientos | fecha vacía / undefined | — | `""` | `""` | sí |
| Vencimientos | dias "30" texto | — | `2026-03-31` | igual | sí |
| Vencimientos | dias 4.7 | — | `""` | `""` | sí |
| Vencimientos | dias -5 | — | `2026-03-05` | igual | sí |
| Vencimientos | "31/02/2026" | — | `""` | `""` | sí |
| Vencimientos | plazoValido(-5 / 999 / "4,7" / "abc" / 0) | — | `null / 365 / 4 / null / 0` | igual | sí |
| Vencimientos | 28-02-2026 + 1 | — | `2026-03-01` | igual | sí |
| Vencimientos | plazoDe venc < emisión | — | `null` | `null` | sí |
| Vencimientos | plazoDe sept→oct (cambio de hora) | — | `30` | `30` | sí |
| Vencimientos | diasParaVencer hoy / vencida / ISO con hora | — | `0 / -7 / 3` | igual | sí |
| Vencimientos | conFechasCoherentes plazo "abc" | — | se ignora | igual | sí |
| Vencimientos | conFechasCoherentes emisión 31/02 | — | vencimiento `""` | igual | sí |
| Vencimientos | vencimientoAlCambiarEmision plazo absurdo | — | no toca | igual | sí |
| ManoObra | calc Daniel | 800.000 + 270.981 | día 35699, hora 3967, hex 5950 | igual | sí |
| ManoObra | hex/hora | — | `1.4999` | `1.5` | **NO** (±1 peso) |
| ManoObra | sueldo "1.234,56" | — | `4115` | `41` | **NO** |
| ManoObra | sueldo "-800000" | — | `26667` | `0` | **NO** |
| ManoObra | sueldo "abc" / undefined | — | todo 0 | 0 | sí |
| ManoObra | 15:30→19:10 | — | `3.67` | `3.67` | sí |
| ManoObra | 22:00→02:00 | — | `4` | `4` | sí |
| ManoObra | 08:00→08:00 | — | `24` | `0` | **NO** |
| ManoObra | "abc"→"xyz" | — | `24` | `0` | **NO** (no alcanzable) |
| ManoObra | horas vacías | — | `0` | `0` | sí |
| ManoObra | 3,67 h × 5.950 | — | `21837` | `21837` | sí |
| ManoObra | día trabajado llega 08:30 | — | atraso 30, dcto 1984, pago 33715 | igual | sí |
| ManoObra | llega 07:30 | — | `0` | `0` | sí |
| ManoObra | llega "25:99" | — | `1119` | `0` | **NO** (no alcanzable) |
| ManoObra | llega "8" / "abc" | — | `0` | `0` | sí |
| ManoObra | sale 12:00 viernes | — | `120` | `120` | sí |
| ManoObra | sale 12:00 fecha "31/02/2026" | — | `330` (usa 17:30) | `330` | sí |
| ManoObra | factor 0.5 / factor 0 | — | `17850 / 35699` | igual | sí |
| ManoObra | atraso 23:00 | — | pago `0` | `0` | sí |
| OT margen | 1.000.000 / 700.000 | — | `{300000, 30}` | igual | sí |
| OT margen | sin ventas con costos | — | `{-700000, 0}` | igual | sí |
| OT margen | venta.neta undefined (descargarOT) | — | `NaN` | `-1 / 0` | **NO** |
| OT margen | costo.monto "1.000" | — | `{9999, 99.99}` | `{9000, 90}` | **NO** |
| OT margen | costo.monto undefined (descargarOT) | — | `NaN` | `{10000, 100}` | **NO** |
| OT margen | venta negativa (NC) | — | `{-10000, 0}` | igual | sí |

---

## 3. Recorrido por módulo (lectura de código)

Convención: **Funciona** = flujo completo con guardado; **A medias** = existe pero incompleto o con código muerto; **Roto** = no puede funcionar como está.

| Módulo (archivo) | Estado | Detalle |
|---|---|---|
| App / Login (`App.jsx`, `Login.jsx`) | Funciona | Perfil desde `perfiles`; subcontrato y taller externo van a sus apps sin tocar `app_state`. Sincroniza con `pullState()` y luego `setInterval(pushState, 5000)` **aunque el pull haya fallado** (ver F2). |
| Sync (`sync.js`) | Funciona, con reserva | Protección de ediciones locales (90 s / 30 min con fallas), fusión por id de `serein_ots` y `serein_facturas` con lápidas, compare-and-swap `escribirConReintento`. Reserva: `pushState()` sube **cualquier** clave `serein_*` presente en localStorage, sin comprobar que alguna vez se bajó la nube (F2). `serein_ver` (marcador de versión del navegador) también se sube/baja como si fuera dato. |
| Dashboard (`Dashboard.jsx`) | Funciona, con restos de demo | KPI Venta/Cobrado/Por cobrar: Venta sale de `libro_ventas` (BD) si hay filas, pero Cobrado sale de las fichas `serein_facturas` (estado Pagado/Factoring) → "Por cobrar" = BD − fichas, dos fuentes distintas. Panel "Cobranza atrasada" para **Proyectos y TODAS** muestra `DATA.global.atrasadas` de `data.js` (MYG 4.871.562, Viman, CADM…: **datos fijos de demostración**, línea 1023); solo Santa Rosa/Istria usan `CobranzaAtrasadaModule` real. Imports muertos: `CotizadorModule`, `PipelineOT`, `PipelineProyectos`, `LogoSerein`, `costoOCdeOT`; variable `pagarArea` sin uso. Roles por email hardcodeados (`EMAIL_AREA`, `EDITORES_ASISTENCIA`, `caro@`/`mario@` ven valores de OT). |
| Consolidado (`ConsolidadoModule.jsx`) | Funciona | Recibe `cc` y `costosArea` calculados en Dashboard; `pad2` sin uso. |
| Cotizaciones (`CotizacionesModule.jsx`) | Funciona | Alta/edición, PDF (print), Excel, IA (`extraer-cubicacion`, `redactar-oferta`), aprobar → OT. `num` entero para precios (C1/C2). Imports `CheckCircle2`, `X` sin uso. |
| CotizadorCalculo / CotizadorModule / CotizadorParametros | A medias | `CotizadorModule.jsx` (315 líneas) se importa en Dashboard pero **nunca se renderiza** (código muerto). `BuscadorProducto` en CotizadorCalculo nunca se usa. `CotizadorCalculo` escribe `serein_cotizaciones`, misma clave que Cotizaciones. |
| Cotizador intumescente (`CotizadorIntumescenteModule.jsx`, `intumescente-api.js`) | A medias | El comentario en `intumescente-api.js:7` dice que el componente "(paso 3, todavía no implementado)"; el componente sí existe y se monta desde Proyectos. Imports `generarFolio`, variables `card`, `h` sin uso. Usa tablas reales (`cotizaciones`, `cotizacion_revisiones`, `int_*`), distinto al resto. |
| OT (`OTModule.jsx`, 4.087 líneas) | Funciona | Ficha con pestañas, protocolos PIG/PGP/EA, marcas, recepción/despacho (`extraer-guia`), facturación (`extraer-factura`), OC (`extraer-oc`), fotos, Drive. Utilidad = ventas − (costos manuales + OC asignadas + combustible + MO). Las compras del Libro de Compras con `ot_id` se muestran como "Subtotal neto (informativo, aun no sumado a la utilidad)" (línea 2736). `descargarOT()` (2070) puede dar NaN (C13). Seis OT de ejemplo en `OTS_INICIALES` (Viman, etc.) se usan como semilla si no hay nada local. |
| Trazabilidad (`TrazabilidadModule.jsx`) | Funciona | Lee cotizaciones + OT + OC; importador histórico; `enviar-alertas-vencimiento`. |
| Producción (`ProduccionModule.jsx`) | Funciona | `serein_avances`; semilla "OT-234 Howden" de prueba. Imports `useMemo`, `Plus`, `Users` sin uso. |
| Mano de obra / Asistencia (`ManoObraModule.jsx`) | Funciona | Nómina, asistencia, extras (semana/feriado/noche), colación, costos por OT, Excel. `useEffect` final (1548) **reemplaza todo `mo` por `MO_SEED` si `mo.ver !== MO_VER`** (ya lo advierte el comentario de arriba: nunca subir `MO_VER`). `valorDiarioDe` sin uso. C9/C11. |
| Inventario (`InventarioModule.jsx`) | Funciona | Productos + movimientos; `INVENTARIO_SEED` importado sin uso en el módulo (la semilla la aplica Dashboard). |
| Órdenes de compra (`OrdenesCompraModule.jsx`) | Funciona | Ítems, asignación % a OT (sin bloquear ≠100 %, C4), PDF, facturas por OC (`oc.facturas` con `libroId`), gasto mensual (EPP). |
| Compras operativas (`ComprasOperativasModule.jsx`) | Funciona | Combustible con impuesto específico (correcto, §2.2). Tres compras de prueba (`COMPRAS_OP_SEED`: Daniel Matus, OT-385, `foto_factura_8821.jpg`) como semilla. Gerencia edita % sin validar (C4/C5). Imports `useMemo`, `AlertTriangle` sin uso. |
| Proveedores y pagos (`ProveedoresPagosModule.jsx`) | A medias | `SeccionProveedores` y `SeccionOC` **definidas y nunca renderizadas** (código muerto, 120-290); `ESTADOS_OC`, `diasEntre`, `Truck`, `TrendingDown`, `FileText` sin uso. Si `PP_OCS_VER` cambia, Dashboard **reemplaza `pp.ocs` (todas las OC reales) por `OC_SEED` (73 OC de julio)** (`Dashboard.jsx:282`). |
| Libro de compras (`LibroComprasModule.jsx`) | Funciona, con reserva | Lee `libro_compras`, asigna a OC (`setOCdeFactura`), a áreas (`serein_comprasAreas`) y a proyectos. Botón **"Sincronizar" invoca `libro-compras-sync`, que NO existe en `supabase/functions/`** (sí existen `libro-ventas-sync` y `sii-sync`); si tampoco está desplegada, el botón siempre falla. `esGerencia` recibido y no usado; `sel` sin uso. |
| Libro de ventas (`LibroVentasModule.jsx`) | Funciona | BD `libro_ventas` + xlsx; copia fichas a `serein_facturas` por área; NC; alta manual anti-duplicado; marcas de revisión. |
| Facturas por área (`FacturasModule.jsx`, `CobranzaAtrasadaModule`) | Funciona, con reserva | Abonos, estado, factoring, publicación en boletín, Drive. **El estado Pagado/abonos NO se escribe de vuelta a `libro_ventas`** (solo `vencimiento`, línea 150) ni a `ot.ventas` (no recibe `setOts`). |
| Revisión en libro / contable (`RevisionEnLibro.jsx`, `RevisionContableModule.jsx`) | Funciona (solo lectura) | Tests pasan. |
| Finanzas (`FinanzasModule.jsx`) | Funciona | `serein_fin`; FIN_SEED "gastos reales de tu Excel, julio 2026" como semilla; si `credVer` cambia, Dashboard reemplaza `obligaciones` por la semilla (`Dashboard.jsx:281`). Parámetros `setParams`, `proyectos`, `params` recibidos sin uso en dos componentes; `CheckCircle2`, `textoCuenta` sin uso. |
| Asesor IA (`AsesorModule.jsx`, `serein-ai/`) | Funciona | Lee `serein_*` y tablas `ai_*`/`analisis_*`/`recomendaciones`; no vi claves de API en el cliente. `fin` recibido sin uso; `ctxOT` sin uso. |
| Correos (`CorreosModule.jsx`) | Funciona (solo lectura del ERP) | Lee `correo_documentos` (las escribe la función `correos-ingresar`), confirma/descarta/edita; "En ERP" solo compara el N° de OC con `ot.oc`/`proyecto.oc`. **No crea ni enlaza nada en el ERP.** |
| CRM (`CRMModule.jsx`, `crm-api.js`) | Funciona | Tablas `crm_*`, vistas `v_*`. `actualizarVendedor` importado sin uso; `ultimaFactura`, `mesesSinFacturar` calculados y no mostrados. |
| Organigrama (`OrganigramaModule.jsx`) | Funciona | Tablas `organigrama_*`; `guardarCostoManual` importado sin uso; `trabajadores` sin uso en la api. |
| Parámetros (`ParametrosModule.jsx`) | Funciona | Factoring (con `dec`), UF (mindicador), instrumentos, empresa, logos; guardado seguro con pull-fresh. |
| Proyectos (`ProyectosModule.jsx` + ProyCotizador/ProyComprasLibro/ControlTaller/Subcontratistas) | Funciona | CC, EDP, OC proveedor/comercial, factoring, control de taller (`extraer-listado-partes`, `extraer-hoja-avance`). Cotizaciones de proyecto viven en **otra clave** (`serein_proyCotizaciones`), separadas de Cotizaciones. `useEffect` con expresión compleja en deps (194). ControlTaller: `clp`, `abierto/setAbierto` sin uso. |
| Crédito (`CreditoModule.jsx`) | Funciona | Tablas `credito_*`, `extraer-credito`, simulador de OC. |
| Cartolas bancarias (`CartolasBancariasModule.jsx`) | Funciona | `movimientos_bancarios`; `esGerencia` recibido sin uso. |
| Clientes / Contactos | Funciona | `serein_clientes` / `serein_contactos`. |
| SubcontratoApp / TallerExternoApp | Funciona | Portales externos sobre `subcontrato_asignaciones`, `facturas_subcontrato`, `taller_*`. |

Marcadores `TODO|FIXME|XXX|pendiente|próximamente|no implementado`: no hay TODO/FIXME reales; los "TODO"/"XXX" encontrados son palabras castellanas ("TODO lo pendiente") o placeholders de protocolo de muestra (`'PGP XXX-2026'`, `CotizacionesModule.jsx:330`, intencional). Único "no implementado": comentario desactualizado en `intumescente-api.js:7`. No hay `onClick` vacíos ni `alert('pendiente')`.

---

## 4. Flujos de punta a punta

### 4.1 Cotización → aprobar → OT → ventas/facturas → libro de ventas → cobranza
1. **Cotización → OT**: `aprobar()` (`CotizacionesModule.jsx:1010`) crea `OT-<folio>` en `serein_ots` con `montoCotizado = afecto`, `ventas: []`, `costos: []`, área de la cotización, m² de los ítems en m². Pull-fresh antes, repone la cotización si no llegó a la nube, no duplica OT. **OK.** Pero una cotización de **Proyectos** aprobada acá genera una OT en OTModule, no un proyecto: los proyectos nacen de `serein_proyCotizaciones` (otro cotizador). Dos cotizadores paralelos.
2. **OT → ventas**: `ot.ventas` solo se llena **a mano en la ficha de la OT** (`FormVenta` / PDF con `extraer-factura`). Ningún otro módulo escribe `ot.ventas`.
3. **Libro de ventas → fichas**: `libro_ventas` (BD, llega por `libro-ventas-sync`/xlsx/alta manual) → al asignar área se copia a `serein_facturas[área]` (ficha con `libroId`, `ot: r.ot_id`). **OK.**
4. **Ruptura**: la misma factura existe en hasta 3 lugares que no se hablan: `libro_ventas.ot_id` (BD) → `serein_facturas` (ficha con `ot`) → `ot.ventas` (OT). Asignar la OT en el Libro de Ventas **no** agrega la venta a la OT; la OT sigue mostrando "Cerrada con saldo pendiente de facturación" y utilidad sin venta hasta que alguien la cargue otra vez en la ficha. `OTModule` no recibe `facturas` ni `libroVentas`.
5. **Cobranza**: `CobranzaAtrasadaModule` y Finanzas usan `serein_facturas` (abonos/estado). Los abonos de la OT (`ot.abonos`, "saldo por percibir") son otro registro independiente. Marcar "Pagado" en Facturas por área **no** vuelve a `libro_ventas.estado_pago` (solo se sincroniza `vencimiento`) ni a `ot.ventas[].estadoPago`. Resultado: el KPI "Cobrado" del panel (fichas) y la "Venta" (BD) no son comparables; "Por cobrar" puede quedar negativo o inflado.

### 4.2 OC → libro de compras → costo de OT
1. OC a proveedor (`pp.ocs`) con `asignaciones[{ot, pct}]` → `costoOCdeOT()` suma `neto × pct` a la utilidad de la OT. **OK** (sin tope 100 %, C4).
2. Factura del proveedor en `libro_compras` → "Vincular OC" (`setOCdeFactura`) guarda `{libroId, folio, neto}` en `oc.facturas` y avisa si lo facturado difiere >2 % del neto de la OC. **OK.**
3. **Ruptura parcial**: una compra del libro con `ot_id` pero **sin OC** aparece en la ficha de la OT como "informativo, aun no sumado a la utilidad" (`OTModule.jsx:2736`). Para Proyectos sí se suma (`LibroComprasModule.jsx:61` la agrega a `p.compras`). Así, en Santa Rosa/Istria el costo real solo entra si alguien crea la OC; una compra directa queda fuera del margen.
4. Las compras asignadas a área (`serein_comprasAreas`) sí entran en la "Utilidad por área" del Consolidado (`Dashboard.jsx:510+`), pero no en la utilidad de cada OT: dos utilidades distintas (por área: fichas de venta − fijos − libro; por OT: `ot.ventas` − costos manuales − OC − combustible − MO).

### 4.3 Correos → OC
`correos-ingresar` (función) deja OC y cotizaciones de clientes en `correo_documentos`; el módulo Correos las lista, confirma/descarta/edita y exporta Excel. **No hay puente al ERP**: no crea OT, no pega el N° de OC en la OT (`ot.oc`) ni en el proyecto; "En ERP" es solo una comparación de texto. El N° de OC se vuelve a tipear (o se sube el PDF con `extraer-oc`) en la ficha de la OT.

### 4.4 Arranque y versiones (riesgo transversal de datos)
- `Dashboard.jsx:343`: al montar, `guardarSerein({…todo el estado…})` escribe en localStorage todas las claves (con las **semillas** si no había nada) y agenda `pushState()` a los 800 ms; `App.jsx` además empuja cada 5 s aunque el `pullState()` inicial haya fallado. En un navegador nuevo (o tras cambio de `LS_VER`, que borra todo `serein_*`) con Supabase caído o lento al cargar, se suben las semillas (`OTS_INICIALES`, `FACTURAS_SEED`, `FIN_SEED`, `OC_SEED`, `COMPRAS_OP_SEED`…) **encima de los datos reales**. `pushState` no exige haber bajado la nube al menos una vez.
- Cambiar `PP_OCS_VER`, `FIN_SEED.credVer` o `MO_VER` reemplaza OC reales / créditos / nómina+asistencia por la semilla, y por el punto anterior, se sube.

---

## 5. Hallazgos por severidad

### CRÍTICO
- **(F1) `npm ci` falla por lockfile desincronizado** — `package-lock.json`. Riesgo: cualquier despliegue/CI que use `npm ci` (lo normal en Vercel/GitHub Actions con lock) no compila; hoy solo funciona porque se instala con `npm install`. Corrección: `npm install` en local, commitear el `package-lock.json` resultante.

### ALTO
- **(F2) Las semillas de demo pueden pisar la nube** — `Dashboard.jsx:343` + `App.jsx:120-123` + `sync.js:477`. Riesgo: navegador nuevo + pull inicial fallido = se suben OT/facturas/OC/gastos de ejemplo encima de los reales (y `OTS_INICIALES`, `OC_SEED` etc. aparecen mezclados). Corrección: en `pushState()` no subir ninguna clave hasta que `pullState()` haya respondido OK al menos una vez en la sesión; no sembrar `app_state` con datos de prueba (semillas vacías en producción).
- **(F3) Reset por versión borra datos reales** — `Dashboard.jsx:281-282` (`credVer`, `ocsVer`), `ManoObraModule.jsx:1548` (`MO_VER`). Riesgo: subir cualquiera de esas constantes en un PR reemplaza las 73+ OC reales, los créditos/leasing o toda la nómina y asistencia, y lo sube. Corrección: eliminar los resets (migrar aditivamente, como ya hace MO con campos nuevos) o, como mínimo, respaldar el blob anterior en otra clave antes de reemplazar.
- **(F4) Facturación y cobranza triplicadas sin sincronía** — `LibroVentasModule.jsx:177` (ficha), `FacturasModule.jsx:150/429` (solo vencimiento vuelve a BD), `OTModule.jsx:3836` (`agregarVenta` manual). Riesgo: una factura asignada a una OT en el Libro no aparece en la OT (utilidad y "saldo por facturar" equivocados), y un "Pagado" en Facturas no llega ni al Libro ni a la OT; el KPI "Por cobrar" del panel resta fuentes distintas. Corrección: una sola fuente (`libro_ventas` con `ot_id`, `estado_pago`, abonos) y que OT/Facturas/Dashboard lean de ahí; al asignar `ot_id` en el Libro, crear/actualizar la venta en `ot.ventas` (o derivar `ventaNetaDeOT` de las fichas con `ot === numero`).
- **(F5) Reparto de costos a OT sin tope** — `OrdenesCompraModule.jsx:313-322` (no bloquea `sumaPct ≠ 100`), `ComprasOperativasModule.jsx:405` (Gerencia). Riesgo: una OC de $1.000.000 repartida 100 % + 100 % carga $2.000.000 de costo y hunde el margen de dos OT; comprobado con `pct: 150` → 150 % del neto. Corrección: bloquear "Guardar" y la edición en línea cuando la suma difiera de 100 % (ya existe `asigOk` para el supervisor de Compras operativas: reutilizar el mismo criterio).

### MEDIO
- **(F6) `num()` entero destruye decimales y signo** — `CotizacionesModule.jsx:20`, `OrdenesCompraModule.jsx:18`, `ManoObraModule.jsx:11`. Comprobado: `1500.5` → 15005, `"1.234,56"` → 123456, `"-100"` → 100, cantidad de OC `"1,5"` → 15000. Riesgo: una cotización o OC con un precio con coma se dispara ×10/×100 sin aviso. Corrección: usar `numDec` (ya existe en Cotizaciones y maneja coma/punto) para precios y cantidades, y redondear al final; rechazar negativos explícitamente.
- **(F7) Horas extra con inicio = fin pagan 24 h** — `ManoObraModule.jsx:363-368` (`if (min <= 0) min += 24*60`). Comprobado 08:00→08:00 = 24 h ($142.800 para un trabajador de 800.000). Corrección: tratar `min === 0` como error ("Indica hora de inicio y de término") y limitar a, p. ej., 16 h.
- **(F8) Panel "Cobranza atrasada" de Proyectos/TODAS muestra datos ficticios** — `Dashboard.jsx:1023` usa `DATA.global.atrasadas` de `data.js` (MYG 4.871.562, Viman, CADM…). Riesgo: Gerencia ve una lista de morosos inventada en la vista consolidada. Corrección: usar `CobranzaAtrasadaModule` con `facturas` de las tres áreas (o Proyectos) y borrar `data.js`.
- **(F9) Costo de compras directas no entra al margen de la OT** — `OTModule.jsx:2736` ("informativo, aun no sumado"). Riesgo: en Santa Rosa/Istria, toda compra del libro sin OC queda fuera de la utilidad de la OT (la del área sí la cuenta): el margen por OT se ve mejor de lo real. Corrección: sumar las filas de `libro_compras` con `ot_id` que no estén ya vinculadas a una OC (`oc.facturas[].libroId`) para no contar doble.
- **(F10) Botón "Sincronizar" del Libro de Compras llama a una función inexistente en el repo** — `LibroComprasModule.jsx:307` → `libro-compras-sync` (no está en `supabase/functions/`; sí `libro-ventas-sync` y `sii-sync`). No pude verificar si está desplegada en Supabase. Corrección: confirmar en el panel de Supabase; si no existe, apuntar a `sii-sync` o versionar la función en el repo.
- **(F11) Correos no enlaza con el ERP** — `CorreosModule.jsx:97-98`. Riesgo: la cadena "OC del cliente por correo → OT" es manual (volver a tipear/subir el PDF); el "En ERP" es solo un cotejo de texto. Corrección: botón "Crear OT / pegar N° OC en OT-…" desde la fila del correo.
- **(F12) Un solo chunk de 3,4 MB precacheado por la PWA** — `vite.config.js` sin `manualChunks`; `import()` de OTModule inútil (`CotizacionesModule.jsx:358`). Riesgo: cada publicación obliga a bajar 3,4 MB (≈1 MB gzip) en el celular; primer arranque lento en terreno. Corrección: `build.rollupOptions.output.manualChunks` (recharts, xlsx, supabase, OTModule, ProyectosModule) y `React.lazy` por módulo del menú.
- **(F13) Vulnerabilidades npm** — `dompurify` crítica (fix simple), `xlsx` alta sin fix. Corrección: `npm audit fix`; para `xlsx`, pasar a `https://cdn.sheetjs.com/xlsx-0.20.x/xlsx-0.20.x.tgz` o `exceljs`.

### BAJO
- **(F14) Código muerto** — `CotizadorModule.jsx` importado y nunca renderizado (`Dashboard.jsx:15`), `PipelineOT`/`PipelineProyectos` (Dashboard 11-12), `SeccionProveedores`/`SeccionOC` (`ProveedoresPagosModule.jsx:120,203`), `BuscadorProducto` (`CotizadorCalculo.jsx:24`), ~30 imports sin uso (lista en `oxlint.txt`). Riesgo: confusión al mantener (dos cotizadores, "¿cuál es el vivo?") y peso en el bundle. Corrección: borrar o enrutar.
- **(F15) `descargarOT()` puede escribir NaN** — `OTModule.jsx:2070-2081` suma `v.neta`/`c.monto` sin `|| 0`, a diferencia del resto del módulo. Corrección: `(v.neta || 0)`, `(c.monto || 0)`.
- **(F16) Hora extra redondeada dos veces** — `ManoObraModule.jsx:71-86`: `horaExtra = round(round(hora)·1,5)` da ±1 peso por hora respecto de `día/9·1,5`. Corrección: redondear solo al final.
- **(F17) `%` con coma en Compras operativas (Gerencia)** — `ComprasOperativasModule.jsx:405` `parseFloat("50,5")` → 50. Corrección: usar `pctNum` de OC.
- **(F18) Roles por correo en el código** — `Dashboard.jsx:194-205,310` (`joce@`, `jose@`, `produccion@`, `mario@`, `caro@`). Riesgo: cambiar un supervisor exige un deploy. Corrección: mover a `perfiles` (ya existe `modulosPerfil`).
- **(F19) Comentario desactualizado** — `intumescente-api.js:7` dice que el componente "todavía no está implementado"; sí lo está (`CotizadorIntumescenteModule.jsx`, montado desde Proyectos).
- **(F20) `serein_ver` se sincroniza como dato** — `Dashboard.jsx:53-58` + `sync.js` `KEY_RE`. Efecto solo con builds mezclados (PWA vieja cacheada): podría borrar localStorage en cada carga. Corrección: usar un prefijo fuera de `KEY_RE` (p. ej. `__serein_ver`… ojo, `__serein_` también calza; usar `__pushok_`-style distinto).

---

## 6. Lo que NO pude comprobar
- Nada en el navegador contra producción (pide login) ni SQL: no sé si `libro-compras-sync` o las 20 funciones restantes están desplegadas y con sus secretos.
- Props recibidas y no usadas: solo las que marca oxlint (`esGerencia` en Cartolas/LibroCompras, `fin` en Asesor, `setParams`/`proyectos`/`params` en Finanzas, `usuario` en HorasExtras, `nombreProyecto` en ControlTaller); no revisé a mano las 4.000 líneas de OTModule prop por prop.
- Los efectos con dependencias "que cambian cada render": el lint solo reportó la expresión compleja en `ProyectosModule.jsx:194`; no encontré `useEffect` con objetos literales en deps.
