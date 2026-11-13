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
| 2026-11-12 | `processor` decide `low_looks` con la suma de looks en la ventana de 5 × 5 (mínimo 50) y resta a cada par el desplazamiento de toda la escena antes del umbral; lo publica en `stats.scene_shift_hh_db`/`hv_db`, campos opcionales del manifiesto (T-ECO-07) | Acordado con Balanza: el veredicto pregunta por un cambio local, y la regla por píxel dejaba fuera el 15 % aunque luego se promediaba 5 × 5 |
| 2026-11-12 | Los contratos se congelan al terminar el sábado 14 de noviembre, hora de Parral (15 de noviembre, 06:00 UTC), no el 13. Hasta entonces cualquier cambio de contrato sigue el proceso de la constitución (VI.2); después solo cambios aditivos. Aprobado por las cinco personas el 2026-11-12 | El evento es el 14 y 15, y varios PR que tocan contratos (16, 22, 23 y 25) seguían en revisión |
| 2026-11-11 | La prueba de lenguaje prohíbe la palabra aunque vaya en negación ("ni mide daños" pasa a "ni mide sus consecuencias"); excepciones solo en `ALLOWED` con motivo (T-BAL-03) | Más fácil de auditar; la lista vive en `services/verdicts/tests/test_language.py` y Faro puede reutilizarla |
| 2026-11-12 | Eventos en horas UTC: sin hora conocida, el evento o la pasada ocupan su día entero y la duda sale como `timing_uncertain`; se mantiene el estado `observable` (T-BAL-06) | Antena detectó que con 145 h ya salía `observable`, 24 h antes de la pasada del 07-08, porque se contaba por fechas; renombrar el estado un día antes de congelar contratos no sería aditivo |
| 2026-11-12 | Persistencias supuestas por tipo de evento (T-BAL-06): `urban_storm` 6 h, `river_flood` 72 h y `wildfire` 240 h, sin calibrar. Las horas explícitas mandan sobre el tipo; sin ninguno, 24 h. Cada respuesta de `/events` las declara en `assumption` (con `source` y `calibrated: false`) y en `summary.does_not_prove` | Responde la pregunta abierta de Balanza; cambio aditivo del contrato antes del congelamiento. Con la tormenta del 1 de julio, ni 6 h ni 72 h alcanzan la pasada del 07-08 |
| 2026-11-11 | `verdicts` toma la hora UTC y la latencia de la línea de tiempo de catalog por HTTP, no del manifiesto (T-BAL-02) | No cambia el contrato de Eco; si catalog cae, el veredicto sale y declara `latency_status` |
| 2026-11-11 | Contraste óptico (T-BAL-04): escena Sentinel-2 a ±10 días, ≤ 30 % de nubes por tesela; si no hay, se muestra la menos nublada y se dice. Se busca también con radar sintético | Responde la pregunta abierta de Balanza sin ocultar datos; las escenas son reales y lo declaran |
| 2026-11-12 | La prueba de humo (T-BAL-05) compara las rutas probadas con el OpenAPI de catalog y verdicts: una ruta GET nueva sin prueba en `scripts/smoke.sh` hace fallar la CI. Las rutas que dependen de CMR o Earth Search aceptan un 502 con motivo y lo avisan; `SMOKE_REQUIRE_NETWORK=1` lo vuelve fallo | Cumple RF-BAL-05 también para rutas futuras; la CI no se cae si un servicio externo falla |
| 2026-11-12 | Mapa con **MapLibre GL JS 6.16.0** (BSD-3-Clause) y mapa base de **teselas raster de OpenStreetMap** con atribución visible (T-ATL-01) | Licencias de los paquetes comprobadas con `npm view` (MapLibre BSD-3-Clause; Vite y Vitest MIT). Las teselas de OSM son ODbL y exigen atribución visible; su política de uso (operations.osmfoundation.org/policies/tiles) no admite tráfico alto, así que valen para la demo y no para producción. Esa política no se releyó el 2026-11-12: conviene revisarla antes de la entrega. EOX cloudless se descarta por las restricciones de algunas ediciones |
| 2026-11-12 | El mapa es una función, `crearMapa(contenedor, opciones)`, que no depende del framework y vive en `frontend/src/mapa/` dentro de la app de Faro (Vite + React + TypeScript, PR 27). Atlas solo añade esa carpeta, la dependencia `maplibre-gl` y el script `dev:mapa` | Faro monta el mapa desde React con `actualizar()` y `destruir()`. Carpeta y forma confirmadas por Faro el 2026-11-12 |
| 2026-11-12 | El mapa pide `state` con su propia paleta: sustituye el parámetro `colormap` de la plantilla para que cada píxel lleve su código (0, 1, 10-15) en el canal rojo, y pinta en el navegador el cambio probable en color sólido y lo no observable con trama diagonal (T-ATL-03) | TiTiler no dibuja tramas, y lo no observable debe distinguirse sin depender del color (constitución IX.2). La trama va en una capa propia, siempre visible y con opacidad mínima del 70 %. Depende de dos cosas de Balanza y Eco: que la API siga aceptando `colormap` y que `state` use remuestreo `nearest`. Probado solo con teselas generadas en el navegador, no con la API |

## Datos verificados

Consultados en CMR el 2026-11-09, con `NISAR_L2_GCOV_PROVISIONAL_V1`, del 2026-06-17 al 2026-10-22.

| Serie | Fechas | Tamaño medio | Fechas disponibles |
|---|---|---|---|
| T048 ascendente, marco 15, 40 MHz, DHDH, P05023 | 10 | ~6,9 GB | 06-17, 06-29, 07-11, 07-23, 08-16, 08-28, 09-09, 09-21, 10-03, 10-15 |
| T171 descendente, marco 75, 40 MHz, DHDH, P05023 | 9 | ~6,7 GB | 06-26, 07-08, 07-20, 08-13, 08-25, 09-06, 09-18, 09-30, 10-12 |

- Cada serie contiene por completo la zona de `config/aois/parral.yaml`.
- El marco 15 de T048 también cubre la presa La Boquilla.
- Referencia OPERA: 40 productos DSWx-S1 en la zona dentro de la ventana. DIST-ALERT-S1 tiene 0 en la ventana.
- OPERA DSWx-S1 en Parral, consultado en CMR el 2026-11-11 (`OPERA_L3_DSWX-S1_V1`, ventana de la zona):
  - Los 40 productos son 36 tras quitar 4 versiones reprocesadas (misma tesela y adquisición, otra producción), en 18 pasadas de Sentinel-1A (hasta el 06-27) y Sentinel-1D (desde el 09-14). Cada pasada trae las teselas 13RDK y 13RDL, y la caja de 13RDK contiene sola toda la zona.
  - **No hay ningún producto entre el 2026-06-28 y el 2026-09-13.** 9 de las 19 fechas NISAR no tienen DSWx-S1 a ±7 días: T048 del 07-11 al 08-28 y T171 del 07-08 al 09-06. El par de la tormenta (06-29 a 07-08) solo tiene referencia antes.
  - Los distribuye PO.DAAC, no ASF. Los GeoTIFF están en el bucket protegido: sin cuenta responden 401 y redirigen a Earthdata Login. La vista previa `_BROWSE.png` está en el bucket público y se lee sin cuenta (206 tras una redirección a CloudFront).
  - CMR solo da la caja de la tesela (`boxes`), no polígonos.
  - DOI `10.5067/OPDSWS1-L3V1`. Según el resumen de la colección, detecta masas de agua abiertas de más de 3 ha y 200 m de ancho, así que no sirve para ver calles inundadas.
  - Horas entre adquisición y `updated` de CMR: de 16 a 1634, porque los productos de junio se reprocesaron a finales de agosto.
  - `GET /aois/parral/references/opera` (T-ANT-06) probado contra CMR real el 2026-11-11: `date=2026-06-29` da 3 pasadas (-2, -2 y -7 días), `2026-07-08` da `acquisitions: []` y `2026-10-15` da 6 pasadas sin versiones repetidas. Todas con `covers_aoi`, vista previa pública y capa de confianza.
- Hueco permanente de adquisición del 2026-07-27 al 2026-08-10 (ASF).
- Latencia de publicación medida el 2026-11-10 con `GET /aois/parral/timeline` contra CMR: entre 40 y 533 horas en las 19 pasadas. Se usa el campo `updated` de CMR, que en la revisión 1 coincide con la fecha `Insert` de UMM-G (comprobado en `G4240430318-ASF`). Si ASF reprocesa un gránulo, esa fecha se desplaza.
- 2026-11-11, T-BAL-04 con la pila de Docker y Earth Search real: los 10 pares de T048 reciben escena de antes y de después, todas de las 17:46 UTC y con las 4 teselas. Solo dos lados quedan `cloudy` (la del 2026-07-03, con 39 %); el resto, `clear`. Una tesela TCI pedida por el gateway (`/tiles/cog/...url=https%3A%2F%2Fsentinel-cogs...`) devolvió PNG; fuera de la huella de su tesela MGRS, TiTiler responde 404.
- 2026-11-12, T-BAL-05: `bash scripts/smoke.sh` pasa contra la pila de Docker con red real, sin avisos. Las comprobaciones de `/references/opera` se probaron aparte con el catalog de `antena/referencias-opera` (2 adquisiciones para el 2026-07-01). Al quitar la prueba de `/events`, el control de cobertura falla, como debe.
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
- En T171, los gránulos del 09-18 y del 10-12 terminan en `_P05023_F_F_J_001`; los otros 17 de Parral terminan en `_P05023_N_F_J_001`. Según la guía de ASF (`nisar-docs.asf.alaska.edu/gcov/`, consultada el 2026-11-12), esa primera letra es la precisión de la órbita y del apuntamiento: P precisa, M media, N casi en tiempo real y F pronóstico. Sin embargo, el atributo `ORBIT_TYPE` de CMR vale `MOE` en los 9 gránulos de T171, incluidos los dos F (CMR, 2026-11-12). Eco midió que esas fechas no se desplazan más que las N, así que se pueden usar.
- **T171 del 2026-08-13 queda fuera de la serie: el fallo es del producto, no del recorte.** Comprobado por Antena el 2026-11-12. El recorte da una mediana de HH de −5,2 dB, frente a −10,2 dB el 07-20 y −12,1 dB el 08-25. La vista previa `_LATLON.png` que publica ASF para ese gránulo (pública, sin cuenta) ya muestra la anomalía: no se ven la ciudad, los ríos ni las parcelas, hay relieve sombreado y rayas, mientras el 07-20 y el 08-25 se ven casi iguales. `ingest` no puede causarlo, porque toma la ventana de las coordenadas del propio gránulo y no modifica valores. `config/aois/parral.yaml` lo excluye con su evidencia (T-ANT-10): `catalog` lo quita de `/series` y de `/timeline` y lo lista en `excluded`, y `ingest` no lo trae. T171 queda con 8 fechas, y el intervalo del 07-20 al 08-25 es de 36 días y cruza el hueco (CMR real, 2026-11-12).
- Recorte de La Boquilla para T-ECO-06: bbox `[-105.73, 27.46, -105.36, 27.60]`, que es el embalse según OpenStreetMap (`water reservoir`, consultado el 2026-11-11) con ~0,02° de margen. Cabe completo en el `boundingPolygon` del marco 15. Malla de 3660 × 1567 píxeles en EPSG:32613. Se eligió el 06-17 porque Sentinel-2 tiene una escena el 06-18 a las 17:46 UTC con 3,4 % de nubes, en una sola tesela (13RDL) que cubre toda la zona. No hay zona `boquilla` en `config/aois`: se trajo con un YAML temporal, así que `catalog` no la publica.

## Especificación GCOV

Fuente: JPL D-102274 Rev F, versión 1.5.0, 2026-07-08.

- Rutas en `/science/LSAR/GCOV/grids/frequencyA/`: `HHHH`, `HVHV` (Float32), `numberOfLooks` (Float32), `mask` y `inputDataExceptionMask` (UByte), `xCoordinates`, `yCoordinates`, y `projection` con el atributo `epsg_code`.
- `mask`: 0 inválido o parcialmente enfocado, 1-5 válido con su subfranja, 255 fuera de la escena.
- `inputDataExceptionMask`: 0 sin anomalía.
- En los recortes reales de T048 (2026-11-11): `listOfObservationModes = ["(NOT SPECIFIED)"]`, `isMixedMode = "False"`, `listOfFrequencies = [A, B]`, `isGeocoded = "True"`; los booleanos son texto, no enteros. El recorte no trae el ancho de banda ni `listOfPolarizations`. Desde T-ECO-04, `processor` deduce la polarización de A por las capas presentes, rechaza modo mixto, productos sin HH+HV y nombres que contradicen capas o frecuencias, y solo toma del nombre el código de ancho de banda.
- La especificación **no** menciona layover ni sombra.
- Capas estáticas (`NISAR_L2_STATIC`): **todavía no se publican.** Comprobado el 2026-11-11 de dos formas. Primero, `identification/staticLayersDataAccess` apunta a `nisar-services.earthdata.nasa.gov/redirect/NISAR_L2_STATIC/<granule_id>.h5`, que responde 200 con una página que dice que no están disponibles. Segundo, CMR no tiene ninguna colección `NISAR*STATIC*`. Las colecciones L2 publicadas son GCOV, GSLC, GUNW y GOFF.
- `metadata/radarGrid` **sí está** en los gránulos reales, en `/science/LSAR/GCOV/metadata/radarGrid`. Comprobado el 2026-11-12 por Antena leyendo por HTTPS el gránulo de T048 del 06-17.
  - Cubos `(altura, y, x)` de 21 × 689 × 702: `incidenceAngle`, `elevationAngle`, `losUnitVectorX`, `losUnitVectorY`, `alongTrackUnitVectorX` y `alongTrackUnitVectorY` en Float32, y `slantRange`, `groundTrackVelocity` y `zeroDopplerAzimuthTime` en Float64. Bloques de 1 × 512 × 512 con gzip.
  - Nodos cada 500 m (`yCoordinates` descendente) en EPSG:32613, con su propio `projection`. `heightAboveEllipsoid` va de −1000 a 9000 m cada 500 m.
  - Desde T-ANT-11, `ingest` lo copia recortado a los nodos que rodean la ventana más 2 por lado: 21 × 106 × 116 en Parral, unos 11 MB más por recorte.
  - Probado el 2026-11-12 con T048 del 06-17 y T171 del 06-26. Las capas de `frequencyA` salen idénticas a los recortes anteriores. La incidencia a 0 m sobre la zona va de 38,0° a 41,8° en T048 y de 39,5° a 43,2° en T171.
  - `ingest` tardó 350 s y 370 s por fecha, frente a unos 130-160 s sin `radarGrid`. Falta saber si es la red o la lectura de los cubos.

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
- 2026-11-12, **layover y sombra (T-ECO-05)**, probado con geometría real.
  - El recorte copia `metadata/radarGrid` desde el PR 25 de Antena (contrato en el PR 23). Probado con T048 del 06-17 y T171 del 06-26 de "data v3/radargrid" en Drive: cubos 21 × 106 × 116, EPSG:32613, nodos cada 500 m. Incidencia a 0 m: 38,0-41,8° en T048 y 39,5-43,2° en T171, creciendo hacia el alcance lejano. `losUnitVector` va del suelo al sensor (X medio +0,62 en T048 y −0,63 en T171); el código no depende de ese signo.
  - Resultado (par 06-17→06-29 en T048 y 06-26→07-08 en T171): layover 0,05 % y 0,06 %; sombra 0,01 % y 0,00 %. Unos 45 s por par.
  - Comprobación física: en T048 (sensor al este) el 100 % del layover está en laderas que miran al este y el 100 % de la sombra en laderas que miran al oeste; en T171, al revés. La pendiente media en layover es de unos 46°, por encima de la incidencia.
  - El 98-99 % del layover ya salía como `low_looks`; ahora queda con la causa `terrain`. El layover no explica el 15 % de `low_looks` (son unos 15 000 de unos 4 millones de píxeles), que sigue pendiente para T-ECO-07.
  - La sombra sale muy brillante en HH (+6 a +7 dB de mediana, frente a unos −11 dB de la escena). Hipótesis sin verificar: la corrección radiométrica de relieve de GCOV divide por un área iluminada casi nula.
  - `processor run` usa `radarGrid` y el DEM de `data/dem/<zona>/` (`processor fetch-dem --aoi parral`: 2 teselas GLO-30, 77 MB, sin cuenta). Si falta alguno de los dos, no marca relieve y lo avisa en el manifiesto.
  - Criterio local por pendiente en la dirección de alcance: layover si la ladera sube más que la incidencia; sombra si baja más que 90° menos la incidencia. No incluye sombras proyectadas por crestas.
  - Coste medido con 2 fechas reales de T048, el DEM real y un `radarGrid` supuesto: +112 MB (1760 frente a 1648 MB de `ru_maxrss`) y unos 9 s más.
- 2026-11-12, **ruido de la diferencia (T-ECO-07)**, par 06-17→06-29 de T048: la desviación robusta (1,4826 · MAD) tras restar la mediana es de 1,19 dB en HH y 0,90 dB en HV. En teoría, con unos 112 looks independientes (4,5 por píxel × 25), serían 0,58 dB; la diferencia sale de que los píxeles vecinos de GCOV no son independientes, más la textura real. Con 3 dB de umbral, el 2,2 % de los píxeles lo supera en HH y el 0,65 % en HV, así que un 2-3 % de cambio no se puede atribuir a un cambio real. (Corregido abajo: ese 2,2 % se midió con la máscara vieja de looks por píxel; con la de T-ECO-07 es 1,97 %).
- 2026-11-12, **por qué hay pares corregidos con 0,58 % si el ruido da un 2 % (T-ECO-07)**: no lo explica `min_cluster_pixels`. Medido en los 16 pares consecutivos reales (sin el 08-13), el filtro de grupos de 4 píxeles solo quita entre el 5 % y el 10 % de lo que supera el umbral (T171 09-06→09-18: 0,64 % → 0,58 %; T048 06-17→06-29: 2,33 % → 2,11 %). Lo que cambia es el ruido de cada par: la desviación robusta de HH va de 0,76 dB (T171 07-08→07-20) a 1,59 dB (T048 08-28→09-09), y el 1,19 dB era de un par ruidoso. La fracción sobre 3 dB sigue a esa desviación: 0,58-1,1 % con HH ≤ 0,9 dB y 4-10 % con HH ≥ 1,2 dB. Tampoco es ruido gaussiano puro: con 1,18 dB, una gaussiana pasaría 3 dB en el 1,1 % y se mide el 1,97 %; con 0,90 dB, el 0,09 % frente al 0,51 %. Con estos datos no se puede separar cuánto es ruido de cola larga y cuánto cambio real repartido (humedad, vegetación). Consecuencia para el umbral de fracción del veredicto (T-BAL-09): el suelo de ruido no es fijo, va de ~0,6 % a ~5 % según el par, así que conviene leerlo junto con la dispersión del par y no como una constante. La tabla por par está en la descripción del PR 39.
- 2026-11-12, looks sumados en 5 × 5 en T048 (06-17): p1 50, p5 80, mediana 113. Quedan por debajo de 25 el 0,14 %, de 50 el 0,98 % y de 100 el 14,4 %.
- 2026-11-12, **calibración en `processor` (T-ECO-07)** con las series reales (T048 de 10 fechas y T171 de 8; 16 pares consecutivos y 2 ventanas completas). Cambio sobre lo observable:
  - Con la regla nueva de looks y sin corregir: del 1,8 % al 29,3 %, siguiendo al desplazamiento de la escena. Corregido: del 0,58 % al 5,2 %, salvo T048 08-28→09-09 (9,6 %, con desplazamiento de +1,61 dB en HH). Ventanas completas: 2,7 % en T048 y 3,3 % en T171.
  - Los pares con desplazamiento grande se desinflan: T171 09-18→09-30 pasa del 29,3 % al 2,3 % (+2,29 dB en HH) y T048 10-03→10-15 del 12,5 % al 1,6 %.
  - `low_looks` baja del 15,2 % al 0,98 % en T048 y del 12,2 % al 1,00 % en T171.
  - El par T048 08-28→09-09 sigue alto después de corregir: o hay cambio local, o el desplazamiento no es uniforme en la escena. Sin verificar.
  - La fracción mínima para `change_probable` la decide Balanza (T-BAL-07) sobre estos valores corregidos.
- 2026-11-12, **filtro multitemporal (T-ECO-08)**: Quegan y Yu (2001), ventana de 7 × 7, opcional con `processor run --multitemporal` y apagado por omisión, porque mezcla información entre fechas. Hace dos pasadas: la primera acumula la textura de la serie y la segunda filtra cada fecha al leerla, así que sigue habiendo como máximo dos escenas en memoria.
  - Con las 10 fechas reales de T048: 345 s y 1913 MB de `ru_maxrss`. Está cerca del límite de 2 GB; sin filtro, el pico del contenedor fue de 1611 MB.
  - Speckle: el ENL mediano en bloques de 15 × 15 (fecha 08-16) pasa de 2,14 a 3,39 en HH y de 2,15 a 3,64 en HV. Es una medida tosca, porque la textura real también cuenta como varianza.
  - `change_probable` baja en todos los pares (por ejemplo, 06-17→06-29 de 3,50 a 1,85 % y la ventana completa de 11,03 a 6,97 %). Los pares con desplazamiento de toda la escena siguen altos (08-28→09-09 de 18,59 a 17,11 %): el filtro no resuelve T-ECO-07.
- Hacer público el repositorio antes de la entrega.

## Investigación

Informe completo con fuentes en `reports/Panorama herramientas SAR NISAR.md`.
