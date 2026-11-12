# Memoria del proyecto

Contexto compartido para personas y agentes. Fechas absolutas; indica cómo se comprobó cada hecho.

## Estado

- 2026-11-09: esqueleto completo con datos sintéticos.
- 2026-11-11: **serie T048 completa** (10 fechas) y **T171 completa** (9 fechas), más un recorte de La Boquilla para T-ECO-06. Detalle en "Series completas".
- 2026-11-11: **primeros recortes reales.** `ingest fetch --limit 2` trajo T048 del 06-17 y del 06-29, y `processor run` los procesó sin errores (T-ANT-03). Detalle en "Datos verificados".
- Evento: sábado 14 y domingo 15 de noviembre de 2026. Confirmado por el equipo el 2026-11-11.
- 2026-11-09: el equipo confirma que las reglas permiten llevar avances al evento.
- 2026-11-10: roles asignados y especificaciones SDD en `specs/`.

## Equipo

| Rol | Persona |
|---|---|
| Antena: ingesta y tiempo | @KinzzoCS |
| Eco: señal y georreferencia | @TakoKami-dev |
| Balanza: interpretación y veracidad | @lospapulindos2-netizen |
| Atlas: mapa y representación web | @Fransomware |
| Faro: relato y experiencia | @danielsanchez-033 |

Acceso comprobado con la API de GitHub el 2026-11-10:

- Balanza usa la cuenta `lospapulindos2-netizen`, que ya tiene acceso de escritura (confirmado por el equipo).
- 2026-11-11: `Fransomware` ya aceptó la invitación y tiene acceso de escritura (API de colaboradores).
- 2026-11-11: el repositorio es privado en un plan gratuito, así que GitHub **no** pide revisión automática a `CODEOWNERS` ni permite proteger `main` (la API de protección responde 403). Hasta hacerlo público, los revisores se añaden a mano en cada PR. Comprobado en el PR 5, que se abrió sin revisores asignados.
- `sanchezelvin69305` tiene una invitación pendiente y ya no tiene rol.

## Decisiones

| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-11-09 | Producto GCOV, sin GUNW como eje | Menos riesgo técnico, y nadie del equipo declaró experiencia InSAR |
| 2026-11-09 | Veredicto en tres estados con recibo de procedencia | Ninguna herramienta revisada convierte NISAR en información de cambio para no especialistas |
| 2026-11-09 | Caso inicial: Hidalgo del Parral, Chihuahua | Elección del equipo; contexto local real |
| 2026-11-09 | Servicios independientes con contratos | Varias personas trabajando sin pisarse |
| 2026-11-09 | Artefactos precalculados; la demo no procesa en vivo | Evita depender de la red y del tiempo de lectura |
| 2026-11-09 | COG por fecha, sin Zarr | Unas 10 fechas no lo justifican |
| 2026-11-09 | Leer por HTTPS solo el recorte (`fsspec`, caché `background`, bloques de 16 MB, valores de la guía de ASF) | Evita bajar unos 69 GB por serie |
| 2026-11-10 | Cinco roles por etapa del flujo de datos: Antena, Eco, Balanza, Atlas y Faro | Trabajo en paralelo con fronteras claras |
| 2026-11-10 | Desarrollo guiado por especificaciones en `specs/` | Acordar qué se construye antes de escribir código |
| 2026-11-10 | Conventional Commits con resumen en español y ámbito por rol, validado en CI | Historial legible y comprobable |
| 2026-11-10 | Licencia GPL-3.0-only | Elección del equipo; el reto pide código abierto |
| 2026-11-10 | La ingesta pasa a un servicio propio, `services/ingest` | Separar el trabajo de Antena del de Eco |
| 2026-11-11 | El manifiesto añade `dates[].qa` como campo **opcional** (T-ECO-03) | Cambio aditivo: los manifiestos y las pruebas de `verdicts` sin `qa` siguen siendo válidos. `processor` siempre lo escribe |
| 2026-11-12 | Los contratos se congelan al terminar el sábado 14 de noviembre, hora de Parral (15 de noviembre, 06:00 UTC), no el 13. Hasta entonces cualquier cambio de contrato sigue el proceso de la constitución (VI.2); después solo cambios aditivos. Aprobado por las cinco personas el 2026-11-12 | El evento es el 14 y 15, y varios PR que tocan contratos (16, 22, 23 y 25) seguían en revisión |
| 2026-11-11 | La prueba de lenguaje prohíbe la palabra aunque vaya en negación ("ni mide daños" pasa a "ni mide sus consecuencias"); excepciones solo en `ALLOWED` con motivo (T-BAL-03) | Más fácil de auditar; la lista vive en `services/verdicts/tests/test_language.py` y Faro puede reutilizarla |
| 2026-11-12 | Eventos en horas UTC: sin hora conocida, el evento o la pasada ocupan su día entero y la duda sale como `timing_uncertain`; se mantiene el estado `observable` (T-BAL-06) | Antena detectó que con 145 h ya salía `observable`, 24 h antes de la pasada del 07-08, porque se contaba por fechas; renombrar el estado un día antes de congelar contratos no sería aditivo |
| 2026-11-12 | Persistencias supuestas por tipo de evento (T-BAL-06): `urban_storm` 6 h, `river_flood` 72 h y `wildfire` 240 h, sin calibrar. Las horas explícitas mandan sobre el tipo; sin ninguno, 24 h. Cada respuesta de `/events` las declara en `assumption` (con `source` y `calibrated: false`) y en `summary.does_not_prove` | Responde la pregunta abierta de Balanza; cambio aditivo del contrato antes del congelamiento. Con la tormenta del 1 de julio, ni 6 h ni 72 h alcanzan la pasada del 07-08 |
| 2026-11-11 | `verdicts` toma la hora UTC y la latencia de la línea de tiempo de catalog por HTTP, no del manifiesto (T-BAL-02) | No cambia el contrato de Eco; si catalog cae, el veredicto sale y declara `latency_status` |
| 2026-11-11 | Contraste óptico (T-BAL-04): escena Sentinel-2 a ±10 días, ≤ 30 % de nubes por tesela; si no hay, se muestra la menos nublada y se dice. Se busca también con radar sintético | Responde la pregunta abierta de Balanza sin ocultar datos; las escenas son reales y lo declaran |
| 2026-11-12 | La prueba de humo (T-BAL-05) compara las rutas probadas con el OpenAPI de catalog y verdicts: una ruta GET nueva sin prueba en `scripts/smoke.sh` hace fallar la CI. Las rutas que dependen de CMR o Earth Search aceptan un 502 con motivo y lo avisan; `SMOKE_REQUIRE_NETWORK=1` lo vuelve fallo | Cumple RF-BAL-05 también para rutas futuras; la CI no se cae si un servicio externo falla |
| 2026-11-12 | Contraste con OPERA DSWx-S1 (T-BAL-08): por cada fecha de radar, la pasada DSWx-S1 más cercana a ±7 días; se compara B01_WTR (clases 1 y 3 son agua) con el radar promediado a 30 m (HH < −15 dB y HV < −23 dB, umbrales de T-ECO-06). Coinciden si ninguna ve agua en el 0,1 % de lo comparable o si comparten el 50 % del agua (IoU); todo sin calibrar. Solo con radar real y con `EARTHDATA_TOKEN` en el `.env` de `verdicts`; si no, se lista el producto y se dice por qué no se comparó. Un desacuerdo se redacta como desacuerdo entre métodos, nunca como error | Cumple RF-BAL-07 sin compartir el token de Antena (cada persona usa el suyo); cambio aditivo del contrato antes del congelamiento |

## Datos verificados

Consultados en CMR el 2026-11-09, con `NISAR_L2_GCOV_PROVISIONAL_V1`, del 2026-06-17 al 2026-10-22.

| Serie | Fechas | Tamaño medio | Fechas disponibles |
|---|---|---|---|
| T048 ascendente, marco 15, 40 MHz, DHDH, P05023 | 10 | ~6,9 GB | 06-17, 06-29, 07-11, 07-23, 08-16, 08-28, 09-09, 09-21, 10-03, 10-15 |
| T171 descendente, marco 75, 40 MHz, DHDH, P05023 | 9 | ~6,7 GB | 06-26, 07-08, 07-20, 08-13, 08-25, 09-06, 09-18, 09-30, 10-12 |

- Cada serie contiene por completo la zona de `config/aois/parral.yaml`.
- El marco 15 de T048 también cubre la presa La Boquilla.
- Referencia OPERA: 40 productos DSWx-S1 en la zona dentro de la ventana. DIST-ALERT-S1 tiene 0 en la ventana.
- Hueco permanente de adquisición del 2026-07-27 al 2026-08-10 (ASF).
- Latencia de publicación medida el 2026-11-10 con `GET /aois/parral/timeline` contra CMR: entre 40 y 533 horas en las 19 pasadas. Se usa el campo `updated` de CMR, que en la revisión 1 coincide con la fecha `Insert` de UMM-G (comprobado en `G4240430318-ASF`). Si ASF reprocesa un gránulo, esa fecha se desplaza.
- 2026-11-11, T-BAL-04 con la pila de Docker y Earth Search real: los 10 pares de T048 reciben escena de antes y de después, todas de las 17:46 UTC y con las 4 teselas. Solo dos lados quedan `cloudy` (la del 2026-07-03, con 39 %); el resto, `clear`. Una tesela TCI pedida por el gateway (`/tiles/cog/...url=https%3A%2F%2Fsentinel-cogs...`) devolvió PNG; fuera de la huella de su tesela MGRS, TiTiler responde 404.
- 2026-11-12, T-BAL-05: `bash scripts/smoke.sh` pasa contra la pila de Docker con red real, sin avisos. Las comprobaciones de `/references/opera` se probaron aparte con el catalog de `antena/referencias-opera` (2 adquisiciones para el 2026-07-01). Al quitar la prueba de `/events`, el control de cobertura falla, como debe.
- 2026-11-12, T-BAL-08: el cliente de `verdicts` lee la respuesta real de `GET /aois/parral/references/opera` (catalog de `antena/referencias-opera` contra CMR). Para el 06-29 elige la pasada del 06-27 a las 00:59 UTC (−2 días, 13RDK y 13RDL); el 07-08 no tiene producto; el 10-15 tiene uno el mismo día. Todas las `wtr_url` están en `archive.podaac.earthdata.nasa.gov`. Clases de B01_WTR en DSWx-S1 v1 (catálogo de Earth Engine de `OPERA/DSWX/L3_V1/S1`, consultado el 2026-11-12): 0 no agua, 1 agua abierta, 3 vegetación inundada, 250 HAND, 251 layover o sombra, 255 sin dato. **Sin probar:** la lectura con token y la comparación con radar real, porque esta copia no tiene token ni artefactos reales.
- Sentinel-2 en Earth Search, consultado el 2026-11-11 con `GET /aois/parral/references/optical`: la zona cae en 4 teselas MGRS (13RCK, 13RDK, 13RCL y 13RDL). Las pasadas de las 17:46 UTC la cubren entera; las de las 17:56 UTC, solo en parte. Para la tormenta del 1 de julio, con nubosidad de hasta 30 % por tesela, solo hay imagen previa (2026-06-28, 26,6 %). La primera posterior que cubre la zona es la del 2026-07-03, con 39 %.
- Cada gránulo tiene un enlace HTTPS directo en `nisar.asf.earthdatacloud.nasa.gov` (CMR, 2026-11-09). Sin token válido, NASA rechaza la lectura.

### Primera lectura real (2026-11-11)

Medido en el equipo de Antena (Windows, Python 3.10, fuera de Docker) con `ingest fetch --aoi parral --series T048A-F015 --limit 2` y `processor run` sobre esos recortes.

| Medida | Valor |
|---|---|
| Recortes | 2, de unos 312 MB cada uno (624 MB en disco) |
| Tiempo de `ingest` | 324 s para los dos, unos 2,7 min por fecha |
| RAM máxima de `ingest` | 747 MB |
| Red recibida | ~1,9 GB para los dos (contador de todo el equipo, aproximado), frente a ~14 GB de los gránulos completos |
| Tiempo de `processor` | 80 s para 2 fechas y 1 par |
| RAM máxima de `processor` | 2,25 GB con 2 fechas |

- Malla: EPSG:32613 (UTM 13N), paso de 10 m, 5014 × 5488 píxeles. **Las mallas de las dos fechas son idénticas** (`xCoordinates` e `yCoordinates` iguales).
- Capas presentes: `HHHH`, `HVHV`, `mask`, `numberOfLooks`, `inputDataExceptionMask` y `projection`.
- `mask`: 99,99 % con valor 1 y 0,01 % con valor 0. `inputDataExceptionMask` vale 0 en todo el recorte.
- `HHHH` en dB (p5/p50/p95): -17,3/-10,6/-4,0 el 06-17 y -18,5/-11,4/-4,7 el 06-29.
- Par 06-17 a 06-29 con los umbrales sin calibrar: 3,5 % `change_probable`, y 15 % de los píxeles marcados como `low_looks` (código 13). Eco y Balanza deben revisar ese 15 %.
- Identificador del gránulo: el `granule_id` de catalog (campo `title` de CMR), el nombre del archivo que escribe `ingest` e `identification/granuleId` son idénticos, sin extensión ni sufijos. Comprobado el 2026-11-11 leyendo `granuleId` con h5py en los 10 recortes de T048 y en los de T171.

### Series completas (2026-11-11)

Mismo equipo y comandos que arriba, sin `--limit`, con `catalog` local en lugar de la pila de Docker.

| Recortes | Fechas | Tiempo de `ingest` | En disco |
|---|---|---|---|
| Parral, T048A-F015 | las 10 | 1020 s para las 8 nuevas, unos 2,1 min por fecha | 3,1 GB |
| Parral, T171D-F075 | las 9 | 292 s para 06-26 y 07-08, y 1167 s para las 7 restantes; unos 2,6 min por fecha | 2,8 GB |
| La Boquilla, T048A-F015 | 06-17 | 148 s | 65 MB |

- **Las 10 fechas de T048 tienen la misma malla, y T171 usa esa misma malla** (`xCoordinates` e `yCoordinates` iguales entre series, comprobado con h5py en las 9 fechas de T171 frente al 06-17 de T048). Las dos series se pueden comparar píxel a píxel sin remuestrear.
- En todos los recortes, `identification/listOfObservationModes` vale `["(NOT SPECIFIED)"]`. No sirve para comprobar el modo; Eco lo avisó y se confirmó en los 19 recortes de Parral.
- `mask` vale 1 en el 99,99 % de los píxeles en todas las fechas.
- En T171, los gránulos del 09-18 y del 10-12 terminan en `_P05023_F_F_J_001`; los otros 17 de Parral terminan en `_P05023_N_F_J_001`. No se sabe qué indica esa `F`: hay que buscarlo en la convención de nombres antes de comparar esas fechas.
- Recorte de La Boquilla para T-ECO-06: bbox `[-105.73, 27.46, -105.36, 27.60]`, que es el embalse según OpenStreetMap (`water reservoir`, consultado el 2026-11-11) con ~0,02° de margen. Cabe completo en el `boundingPolygon` del marco 15. Malla de 3660 × 1567 píxeles en EPSG:32613. Se eligió el 06-17 porque Sentinel-2 tiene una escena el 06-18 a las 17:46 UTC con 3,4 % de nubes, en una sola tesela (13RDL) que cubre toda la zona. No hay zona `boquilla` en `config/aois`: se trajo con un YAML temporal, así que `catalog` no la publica.

## Especificación GCOV

Fuente: JPL D-102274 Rev F, versión 1.5.0, 2026-07-08.

- Rutas en `/science/LSAR/GCOV/grids/frequencyA/`: `HHHH`, `HVHV` (Float32), `numberOfLooks` (Float32), `mask` y `inputDataExceptionMask` (UByte), `xCoordinates`, `yCoordinates`, y `projection` con el atributo `epsg_code`.
- `mask`: 0 inválido o parcialmente enfocado, 1-5 válido con su subfranja, 255 fuera de la escena.
- `inputDataExceptionMask`: 0 sin anomalía.
- En los recortes reales de T048 (2026-11-11): `listOfObservationModes = ["(NOT SPECIFIED)"]`, `isMixedMode = "False"`, `listOfFrequencies = [A, B]`, `isGeocoded = "True"`; los booleanos son texto, no enteros. El recorte no trae el ancho de banda ni `listOfPolarizations`. Desde T-ECO-04, `processor` deduce la polarización de A por las capas presentes, rechaza modo mixto, productos sin HH+HV y nombres que contradicen capas o frecuencias, y solo toma del nombre el código de ancho de banda.
- La especificación **no** menciona layover ni sombra.
- Capas estáticas (`NISAR_L2_STATIC`): **todavía no se publican.** Comprobado el 2026-11-11 de dos formas. Primero, `identification/staticLayersDataAccess` apunta a `nisar-services.earthdata.nasa.gov/redirect/NISAR_L2_STATIC/<granule_id>.h5`, que responde 200 con una página que dice que no están disponibles. Segundo, CMR no tiene ninguna colección `NISAR*STATIC*`. Las colecciones L2 publicadas son GCOV, GSLC, GUNW y GOFF.

## Caso de Parral

- Tormenta del 1 de julio de 2026 con calles inundadas: cae entre las pasadas del 29 de junio y el 8 de julio. Es el ejemplo de `not_observable`. La noticia salió de extractos de búsqueda; hay que abrirla antes de usarla en la demo.
- La cifra de lluvia es contradictoria entre fuentes (unos 30 mm frente a 228 mm): no usarla.
- Pruebas previstas: tormenta (no observable), campo durante el monzón (cambio con causa ambigua) y jales de La Prieta (estabilidad).

## Sin verificar

- Enunciado oficial de 2026.
- Lista de recursos oficial del reto.
- Troceado HDF5 de los gránulos reales. La coincidencia de mallas ya se verificó en las 10 fechas de T048 y entre T048 y T171 (ver "Series completas").
- Harmony para extraer capas GCOV.
- Umbrales: `min_threshold_db`, `MIN_CHANGED_FRACTION`, `qa_outlier_db` (1,5 dB) y las firmas por polarización son valores iniciales sin calibrar con banda L.

## Pendientes

- 2026-11-11: el glosario de Faro (PR #11) usa "daño"/"damage" y "confirmarla"/"confirming" en negación (línea 10 y 39 de cada idioma); lo detectó `violations()` de la prueba de lenguaje. Decidir con Faro si se reescribe o si la comprobación se extiende a `frontend/content`.
- 2026-11-11: Antena creó la cuenta de Earthdata. El token vive solo en el `.env` local, que git ignora, y **no se comparte**. Antena trae los recortes y los pasa como archivos. Si otra persona necesita leer de NASA, crea su propia cuenta de Earthdata (gratuita) y su propio token.
- Memoria de `processor` (T-ECO-02): desde el 2026-11-11 procesa por pares, con como máximo dos escenas en memoria, y suaviza en float32. Medido con `services/processor/bench/memoria.py` sobre 10 fechas **sintéticas** de 5022 × 5496 px (Windows, Python 3.14): 5048 MB y 715 s antes, 1510 MB y 516 s después, con conteos, umbrales y QA idénticos. Con las 2 fechas reales de T048 en Docker (`docker compose --profile real run process`), el pico del contenedor fue de 1586 MB (`memory.peak` del cgroup, que incluye la caché de archivos) y 52 s, frente a los 2,25 GB que midió Antena. Con las **10 fechas reales** de T048 (2026-11-12, mismo método): 1611 MB y 389 s.
- 2026-11-11, `numberOfLooks` en los recortes reales de T048 (iguales en las dos fechas): p1 1,88, p5 3,12, p15 3,99, mediana 4,52 y p95 6,14. Con `min_looks = 4` queda fuera el 15,2 %; por debajo de 3 solo el 4,3 % y por debajo de 2 el 1,2 %. La fracción baja de oeste a este (del 24-29 % al 6 %), lo que apunta al ángulo de incidencia, y esos píxeles son más brillantes en HH (mediana −7,9 dB frente a −11,1 dB), lo que apunta a laderas orientadas al sensor. Ambas son hipótesis. El umbral se aplica por píxel antes de promediar 5 × 5; la suma de looks en esa ventana baja de 25 solo en el 0,01 %. Decidir el criterio con Balanza (T-ECO-07).
- 2026-11-12, serie real completa de T048 (10 fechas, umbrales sin calibrar):
  - El porcentaje de `change_probable` en cada par consecutivo sigue al desplazamiento de la mediana de toda la escena (correlación 0,9 en 9 pares). Con desplazamientos de ±0,6 a ±1,1 dB sale 2-3 %; con ±1,75 a ±1,84 dB, 14-22 % de lo observable (08-28→09-09, 09-09→09-21, 10-03→10-15), casi todo con HH y HV en el mismo sentido.
  - El umbral de Otsu nunca supera el mínimo: los 10 pares quedan en 3,0 dB, así que hoy el umbral es fijo en la práctica.
  - El QA marca solo el 2026-10-15 (+1,89 dB en HH); el 2026-09-09 queda cerca (+1,37 dB).
  - Hipótesis, sin verificar: humedad del suelo por lluvias del monzón, que sube toda la escena. También podría ser radiométrico. Hasta resolverlo, un "cambio" en esos pares no debe leerse como cambio local. Opciones para T-ECO-07 con Balanza: medir el cambio respecto al desplazamiento de la escena, o avisar en los pares con desplazamiento grande.
- 2026-11-12, serie real completa de T171 (9 fechas), mismo método que T048: 1611 MB y 389 s en T048, **1782 MB y 393 s en T171**. Las dos series quedan por debajo de 2 GB.
- 2026-11-12, T171 del 2026-08-13 (defecto del producto; la evidencia está en la nota de Antena, PR 22). Efecto en `processor`: el QA lo marcaba con +6,4 dB en HH y en HV, pero la marca es solo un aviso, y los pares 07-20→08-13 y 08-13→08-25 salían con un 46 % y un 50 % de `change_probable` falso. Se apartó a `data/raw/cuarentena/parral/T171D-F075/` (no se borró) y T171 se reprocesó con 8 fechas (1806 MB, 359 s). El par consecutivo pasa a ser 07-20→08-25, que cruza el hueco de adquisición y da un 8,8 % de cambio.
- Desplazamiento entre fechas, medido con correlación de fase en 3 ventanas (2026-11-12): en T171, todas las fechas (también las `_F_F_J_001`) se desplazan unos 0,8 px en filas respecto al 06-26; en T048, las 10 fechas coinciden con el 06-17 con menos de 0,4 px de diferencia.
- En T171, el QA también marca el 2026-09-30 (+1,59 dB), y el par 09-18→09-30 da un 24,9 % de cambio con HH y HV subiendo a la vez: el mismo patrón de desplazamiento de toda la escena que en T048.
- 2026-11-12, **georreferencia (T-ECO-06)**: sin desplazamiento detectable mayor que un píxel (10 m) entre NISAR y Sentinel-2.
  - Datos: T048 del 2026-06-17 recortado sobre La Boquilla frente a `S2C_13RDL_20260618_0_L2A` (Earth Search, 3,4 % de nubes). Los dos están en EPSG:32613 y en la misma rejilla de 10 m, así que se comparan sin remuestrear.
  - Método (`services/processor/bench/georref.py`): agua del radar con HH < −15 dB y HV < −23 dB suavizados en 5 × 5; agua del óptico con NDWI > 0. Se quitan las nubes con SCL y se dejan solo los cuerpos de agua que aparecen en las dos máscaras. Se busca el desplazamiento entero que maximiza el IoU.
  - Resultado: el IoU sin desplazar es 0,7154 y el mejor, 1 px al este, da 0,7155. Las mitades oeste y este, por separado, dan (0, 0). La superficie de IoU es casi plana, así que la resolución del método es de un píxel.
  - Las máscaras difieren en área, no en posición: el radar ve oscuras zonas fuera del agua óptica, posiblemente orillas expuestas o suelo liso, y el óptico ve agua en el brazo del este que el radar no ve oscuro. Los umbrales se eligieron mirando esta misma escena y no están calibrados para otras.
  - La correlación de fase de las máscaras no sirvió (picos de 0,02 e inconsistentes) y se descartó.
  - Entre órbitas, T048 (06-17) frente a T171 (06-26 y 07-08) en Parral, la correlación de fase en 4 ventanas da 0,5-1,1 px en filas y menos de 0,6 px en columnas, de forma consistente. Se pueden cruzar las dos series con ese margen.
- Hacer público el repositorio antes de la entrega.

## Investigación

Informe completo con fuentes en `reports/Panorama herramientas SAR NISAR.md`.
