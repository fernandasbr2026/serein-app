| Módulo | Caso | Entrada | Salida real | Esperado | OK |
|---|---|---|---|---|---|
| OC | neto 100000 | `{"neto":100000}` | `[100000,19000,119000]` | `[100000,19000,119000]` | sí |
| OC | neto 0 | `{"neto":0}` | `0` | `0` | sí |
| OC | neto negativo -5000 | `{"neto":-5000}` | `[-5000,-5950]` | `[-5000,-5950]` | sí |
| OC | neto decimal 1234.56 (num quita el punto) | `{"neto":1234.56}` | `123456` | `1235` | **NO** |
| OC | neto "1.234,56" | `{"neto":"1.234,56"}` | `123456` | `1235` | **NO** |
| OC | neto texto "abc" | `{"neto":"abc"}` | `0` | `0` | sí |
| OC | neto undefined, monto undefined | `{}` | `0` | `0` | sí |
| OC | solo monto bruto 119000 | `{"monto":119000}` | `[100000,119000]` | `[100000,119000]` | sí |
| OC | solo monto bruto 100 (redondeo) | `{"monto":100}` | `[84,100]` | `[84,100]` | sí |
| OC | items cant 2 x precio 1500.5 | `{"items":[{"cantidad":2,"precio":1500.5}]}` | `30010` | `3001` | **NO** |
| OC | items cant "1,5" x precio 1000 | `{"items":[{"cantidad":"1,5","precio":1000}]}` | `15000` | `1500` | **NO** |
| OC | items descuento > subtotal | `{"items":[{"cantidad":1,"precio":1000,"descuento":5000}]}` | `0` | `0` | sí |
| OC | items precio negativo | `{"items":[{"cantidad":1,"precio":-1000}]}` | `0` | `0` | sí |
| OC | items vacíos + neto 500 | `{"items":[],"neto":500}` | `500` | `500` | sí |
| OC | pct "33,33" | `"33,33"` | `33.33` | `33.33` | sí |
| OC | pct 150 (>100) | `150` | `150000` | `100000` | **NO** |
| OC | pct "abc" | `"abc"` | `0` | `0` | sí |
| COT | 1 x 100000 | `{"items":[{"cant":1,"pUnitario":100000}]}` | `{"afecto":100000,"iva":19000,"total":119000}` | `{"afecto":100000,"iva":19000,"total":119000}` | sí |
| COT | sin items | `{}` | `{"afecto":0,"iva":0,"total":0}` | `{"afecto":0,"iva":0,"total":0}` | sí |
| COT | cant 0 | `{"items":[{"cant":0,"pUnitario":100}]}` | `0` | `0` | sí |
| COT | cant "1.234,56" x 1000 | `{"items":[{"cant":"1.234,56","pUnitario":1000}]}` | `1234560` | `1234560` | sí |
| COT | cant 1234.56 (número JS) x 1000 | `{"items":[{"cant":1234.56,"pUnitario":1000}]}` | `1234560` | `1234560` | sí |
| COT | cant "1.234" x 1000 (¿miles o decimal?) | `{"items":[{"cant":"1.234","pUnitario":1000}]}` | `1234000` | `1234000` | sí |
| COT | pUnitario negativo "-100" | `{"items":[{"cant":1,"pUnitario":"-100"}]}` | `100` | `0` | **NO** |
| COT | pUnitario decimal 1500.5 (num ignora el punto) | `{"items":[{"cant":1,"pUnitario":1500.5}]}` | `15005` | `1501` | **NO** |
| COT | pUnitario "1.234,56" | `{"items":[{"cant":1,"pUnitario":"1.234,56"}]}` | `123456` | `1235` | **NO** |
| COT | pUnitario texto | `{"items":[{"cant":1,"pUnitario":"abc"}]}` | `0` | `0` | sí |
| COT | pUnitario undefined | `{"items":[{"cant":1}]}` | `0` | `0` | sí |
| COT | descuento mayor al ítem | `{"items":[{"cant":1,"pUnitario":1000,"descuento":9999}]}` | `0` | `0` | sí |
| COT | cant negativa "-2" | `{"items":[{"cant":"-2","pUnitario":1000}]}` | `0` | `0` | sí |
| COT | IVA de 1 peso | `{"items":[{"cant":1,"pUnitario":1}]}` | `{"afecto":1,"iva":0,"total":1}` | `{"afecto":1,"iva":0,"total":1}` | sí |
| ComprasOp | boleta real diésel | `{"categoria":"Diésel","neto":23211,"impEsp":2379,"aplicaIva":true}` | `[4410,30000]` | `[4410,30000]` | sí |
| ComprasOp | imp. específico negativo "-500" | `{"categoria":"Diésel","neto":23211,"impEsp":"-500","aplicaIva":true}` | `27121` | `27121` | sí |
| ComprasOp | bencina sin IVA | `{"categoria":"Bencina","neto":10000,"impEsp":1000,"aplicaIva":false}` | `11000` | `11000` | sí |
| ComprasOp | no combustible: imp. específico se ignora | `{"categoria":"EPP","neto":10000,"impEsp":1000,"aplicaIva":true}` | `11900` | `11900` | sí |
| ComprasOp | neto null | `{"categoria":"Diésel","neto":null,"aplicaIva":true}` | `null` | `null` | sí |
| ComprasOp | neto 0 | `{"categoria":"Diésel","neto":0,"impEsp":500,"aplicaIva":true}` | `500` | `500` | sí |
| ComprasOp | neto como texto "23211" (guardado sin num) | `{"categoria":"Diésel","neto":"23211","impEsp":2379,"aplicaIva":true}` | `"2321123794410"` | `30000` | **NO** |
| ComprasOp | neto 1234.56 + impEsp "1.234,56" | `{"categoria":"Diésel","neto":1234.56,"impEsp":"1.234,56","aplicaIva":true}` | `[123456,235,124925.56]` | `[1235,235,2704]` | **NO** |
| ComprasOp | impEsp "--50" | `"--50"` | `-50` | `-50` | sí |
| ComprasOp | impEsp "5-0" | `"5-0"` | `50` | `0` | **NO** |
| ComprasOp | reparto 150 % a una OT | `[{"categoria":"Diésel","neto":10000,"impEsp":1000,"estado":"Aprobada","asignacion":{"items":[{"ref":"OT-1","pct":150}]}}]` | `16500` | `11000` | **NO** |
| ComprasOp | pct "50,5" (coma) y estado pendiente | `[{"categoria":"Diésel","neto":10000,"impEsp":1000,"estado":"Pendiente de revisión","asignacion":{"items":[{"ref":"OT-1","pct":"50,5"}]}}]` | `5500` | `5555` | **NO** |
| Factoring | 1.190.000 a 30 días sin mora | `[1190000,30,0]` | `{"interes":9877,"mora":0,"costoOp":50000,"total":59877}` | `{"interes":9877,"mora":0,"costoOp":50000,"total":59877}` | sí |
| Factoring | base 0 | `[0,30,0]` | `50000` | `50000` | sí |
| Factoring | base negativa | `[-100000,30,0]` | `{"interes":-830,"mora":0,"costoOp":50000,"total":49170}` | `{"interes":-830,"mora":0,"costoOp":50000,"total":49170}` | sí |
| Factoring | dias undefined | `[1190000,null,null]` | `50000` | `50000` | sí |
| Factoring | dias texto "30" | `[1190000,"30",0]` | `9877` | `9877` | sí |
| Factoring | dias texto "abc" | `[1190000,"abc",0]` | `null` | `50000` | **NO** |
| Factoring | tasa como texto "0,83" (sin dec) | `[1190000,30,0]` | `null` | `59877` | **NO** |
| Factoring | tasa undefined | `[1190000,30,0]` | `null` | `50000` | **NO** |
| Factoring | sin empresa (f=null) | `[1190000,30,0,null]` | `0` | `0` | sí |
| Factoring | tasa 150 % mensual | `[1000000,30,0]` | `1500000` | `1500000` | sí |
| Factoring | dias mora 400 | `[1000000,30,400]` | `466667` | `466667` | sí |
| Factoring | dec("0,83") | `"0,83"` | `0.83` | `0.83` | sí |
| Factoring | dec("-3") | `"-3"` | `3` | `-3` | **NO** |
| Factoring | dec("1.234,56") | `"1.234,56"` | `1.234` | `1234.56` | **NO** |
| Vencimientos | sumarDias 2026-01-31 + 30 | `["2026-01-31",30]` | `"2026-03-02"` | `"2026-03-02"` | sí |
| Vencimientos | sumarDias 31/02 | `["2026-02-31",30]` | `""` | `""` | sí |
| Vencimientos | sumarDias fecha vacía | `["",30]` | `""` | `""` | sí |
| Vencimientos | sumarDias undefined | `[null,30]` | `""` | `""` | sí |
| Vencimientos | sumarDias dias "30" texto | `["2026-03-01","30"]` | `"2026-03-31"` | `"2026-03-31"` | sí |
| Vencimientos | sumarDias dias 4.7 | `["2026-03-01",4.7]` | `""` | `""` | sí |
| Vencimientos | sumarDias dias negativo -5 | `["2026-03-10",-5]` | `"2026-03-05"` | `"2026-03-05"` | sí |
| Vencimientos | sumarDias fecha dd/mm/aaaa | `["31/02/2026",30]` | `""` | `""` | sí |
| Vencimientos | plazoValido(-5) | `-5` | `null` | `null` | sí |
| Vencimientos | plazoValido(999) | `999` | `365` | `365` | sí |
| Vencimientos | plazoValido("4,7") | `"4,7"` | `4` | `4` | sí |
| Vencimientos | plazoValido("abc") | `"abc"` | `null` | `null` | sí |
| Vencimientos | plazoValido(0) | `0` | `0` | `0` | sí |
| Vencimientos | vencimientoPorPlazo("2026-02-28", 1) (no bisiesto) | `["2026-02-28",1]` | `"2026-03-01"` | `"2026-03-01"` | sí |
| Vencimientos | plazoDe venc antes de emisión | `["2026-03-10","2026-03-01"]` | `null` | `null` | sí |
| Vencimientos | plazoDe cambio de hora Chile (sept) | `["2026-09-01","2026-10-01"]` | `30` | `30` | sí |
| Vencimientos | plazoDe emisión vacía | `["","2026-10-01"]` | `null` | `null` | sí |
| Vencimientos | diasParaVencer hoy | `["2026-10-27","2026-10-27"]` | `0` | `0` | sí |
| Vencimientos | diasParaVencer vencida | `["2026-10-20","2026-10-27"]` | `-7` | `-7` | sí |
| Vencimientos | diasParaVencer fecha con hora ISO | `["2026-10-30T15:00:00Z","2026-10-27"]` | `3` | `3` | sí |
| Vencimientos | conFechasCoherentes plazo "abc" se ignora | `"abc"` | `{"emission_date":"2026-10-01","plazo":"30","vencimiento":"2026-10-31"}` | `{"emission_date":"2026-10-01","plazo":"30","vencimiento":"2026-10-31"}` | sí |
| Vencimientos | conFechasCoherentes emisión 31/02 | `"2026-02-31"` | `{"emission_date":"2026-02-31","plazo":"30","vencimiento":""}` | `{"emission_date":"2026-02-31","plazo":"30","vencimiento":""}` | sí |
| Vencimientos | vencimientoAlCambiarEmision plazo deducido absurdo | `["0202-10-01","2026-10-31","2026-10-05"]` | `"2026-10-31"` | `"2026-10-31"` | sí |
| Vencimientos | textoDiasParaVencer(-1) | `-1` | `"atrasada 1 día"` | `"atrasada 1 día"` | sí |
| ManoObra | calc Daniel (800.000 + 270.981) | `{"sueldo":800000,"imposiciones":270981}` | `{"diaBruto":35699,"diaSinImp":26667,"hora":3967,"horaExtra":5950,"sabado":0,"domingo":0,"turnoNoche":0}` | `{"diaBruto":35699,"diaSinImp":26667,"hora":3967,"horaExtra":5950,"sabado":0,"domingo":0,"turnoNoche":0}` | sí |
| ManoObra | hora extra = hora x 1,5 (50 %) | `{"sueldo":800000,"imposiciones":270981}` | `1.4998739601714142` | `1.5` | **NO** |
| ManoObra | sueldo "1.234,56" | `{"sueldo":"1.234,56"}` | `4115` | `41` | **NO** |
| ManoObra | sueldo negativo "-800000" | `{"sueldo":"-800000"}` | `26667` | `0` | **NO** |
| ManoObra | sueldo texto | `{"sueldo":"abc"}` | `{"diaBruto":0,"diaSinImp":0,"hora":0,"horaExtra":0,"sabado":0,"domingo":0,"turnoNoche":0}` | `{"diaBruto":0,"diaSinImp":0,"hora":0,"horaExtra":0,"sabado":0,"domingo":0,"turnoNoche":0}` | sí |
| ManoObra | sueldo undefined | `{}` | `0` | `0` | sí |
| ManoObra | horas 15:30→19:10 | `["15:30","19:10"]` | `3.67` | `3.67` | sí |
| ManoObra | horas 22:00→02:00 cruza medianoche | `["22:00","02:00"]` | `4` | `4` | sí |
| ManoObra | horas iguales 08:00→08:00 (asume 24 h) | `["08:00","08:00"]` | `24` | `0` | **NO** |
| ManoObra | horas texto "abc"→"xyz" | `["abc","xyz"]` | `24` | `0` | **NO** |
| ManoObra | horas vacías | `["",""]` | `0` | `0` | sí |
| ManoObra | pago extra 3,67 h Daniel | `[5950,3.67]` | `21837` | `21837` | sí |
| ManoObra | feriado trabajado = domingo (100 %) con domingo 0 | `{"sueldo":800000,"imposiciones":270981,"domingo":0}` | `0` | `0` | sí |
| ManoObra | día trabajado, llega 08:30 | `[{"sueldo":800000,"imposiciones":270981},"08:30"]` | `{"valorDia":35699,"atrasoMin":30,"descuentoAtraso":1984,"salidaAnticipadaMin":0,"descuentoSalida":0,"pago":33715}` | `{"valorDia":35699,"atrasoMin":30,"descuentoAtraso":1984,"salidaAnticipadaMin":0,"descuentoSalida":0,"pago":33715}` | sí |
| ManoObra | día trabajado, llega 07:30 (antes) | `[{"sueldo":800000,"imposiciones":270981},"07:30"]` | `0` | `0` | sí |
| ManoObra | llega "25:99" | `[{"sueldo":800000,"imposiciones":270981},"25:99"]` | `1119` | `0` | **NO** |
| ManoObra | llega "8" (sin minutos) | `[{"sueldo":800000,"imposiciones":270981},"8"]` | `0` | `0` | sí |
| ManoObra | llega "abc" | `[{"sueldo":800000,"imposiciones":270981},"abc"]` | `0` | `0` | sí |
| ManoObra | sale 12:00 un viernes | `[{"sueldo":800000,"imposiciones":270981},"12:00","2026-10-30"]` | `120` | `120` | sí |
| ManoObra | sale 12:00 fecha "31/02/2026" | `[{"sueldo":800000,"imposiciones":270981},"12:00","31/02/2026"]` | `330` | `330` | sí |
| ManoObra | media jornada factor 0.5 | `[{"sueldo":800000,"imposiciones":270981},0.5]` | `17850` | `17850` | sí |
| ManoObra | factor 0 → se trata como 1 | `[{"sueldo":800000,"imposiciones":270981},0]` | `35699` | `35699` | sí |
| ManoObra | atraso enorme no deja pago negativo | `[{"sueldo":800000,"imposiciones":270981},"23:00"]` | `0` | `0` | sí |
| OT margen | venta 1.000.000 costo 700.000 | `[]` | `{"utilidad":300000,"margen":30}` | `{"utilidad":300000,"margen":30}` | sí |
| OT margen | sin ventas con costos | `[]` | `{"utilidad":-700000,"margen":0}` | `{"utilidad":-700000,"margen":0}` | sí |
| OT margen | venta.neta undefined (descargarOT) | `[]` | `{"utilidad":null,"margen":0}` | `{"utilidad":-1,"margen":0}` | **NO** |
| OT margen | costo.monto texto "1.000" | `[]` | `{"utilidad":9999,"margen":99.99}` | `{"utilidad":9000,"margen":90}` | **NO** |
| OT margen | costo.monto undefined (descargarOT) | `[]` | `{"utilidad":null,"margen":null}` | `{"utilidad":10000,"margen":100}` | **NO** |
| OT margen | venta negativa (NC) | `[]` | `{"utilidad":-10000,"margen":0}` | `{"utilidad":-10000,"margen":0}` | sí |

110 casos, 27 distintos de lo esperado
