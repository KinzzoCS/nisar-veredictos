# Memoria del proyecto

Contexto compartido para personas y agentes. Fechas absolutas; indica cómo se comprobó cada hecho.

## Estado

- 2026-11-09: esqueleto completo con datos sintéticos.
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
- Identificador del gránulo, comprobado el 2026-11-11 en los dos recortes: el `granule_id` de catalog (campo `title` de CMR), el nombre del archivo que escribe `ingest` y el texto del gránulo dentro del HDF5 son idénticos, sin extensión ni sufijos. Se comprobó buscando el identificador en los bytes de cada archivo: aparece un único identificador `NISAR_L2_PR_GCOV_…`, tres veces, igual al nombre. No se leyó `identification/granuleId` con h5py, y falta comprobarlo en T171.

## Especificación GCOV

Fuente: JPL D-102274 Rev F, versión 1.5.0, 2026-07-08.

- Rutas en `/science/LSAR/GCOV/grids/frequencyA/`: `HHHH`, `HVHV` (Float32), `numberOfLooks` (Float32), `mask` y `inputDataExceptionMask` (UByte), `xCoordinates`, `yCoordinates`, y `projection` con el atributo `epsg_code`.
- `mask`: 0 inválido o parcialmente enfocado, 1-5 válido con su subfranja, 255 fuera de la escena.
- `inputDataExceptionMask`: 0 sin anomalía.
- La especificación **no** menciona layover ni sombra. `identification/staticLayersDataAccess` podría llevar a capas estáticas útiles; falta investigarlo.

## Caso de Parral

- Tormenta del 1 de julio de 2026 con calles inundadas: cae entre las pasadas del 29 de junio y el 8 de julio. Es el ejemplo de `not_observable`. La noticia salió de extractos de búsqueda; hay que abrirla antes de usarla en la demo.
- La cifra de lluvia es contradictoria entre fuentes (unos 30 mm frente a 228 mm): no usarla.
- Pruebas previstas: tormenta (no observable), campo durante el monzón (cambio con causa ambigua) y jales de La Prieta (estabilidad).

## Sin verificar

- Enunciado oficial de 2026.
- Lista de recursos oficial del reto.
- Troceado HDF5 de los gránulos reales. Velocidad y coincidencia de mallas ya se verificaron con T048 (ver "Primera lectura real"); falta comprobar las mallas en T171 y en más fechas. `processor` rechaza mallas distintas.
- Harmony para extraer capas GCOV.
- Umbrales: `min_threshold_db`, `MIN_CHANGED_FRACTION` y las firmas por polarización son valores iniciales sin calibrar con banda L.

## Pendientes

- 2026-11-11: Antena creó la cuenta de Earthdata. El token vive solo en el `.env` local, que git ignora, y **no se comparte**. Antena trae los recortes y los pasa como archivos. Si otra persona necesita leer de NASA, crea su propia cuenta de Earthdata (gratuita) y su propio token.
- Vigilar memoria en `processor`: con 2 fechas reales usó 2,25 GB, más de lo que se estimaba (unos 4 GB para 10 fechas). Con las 10 fechas cargadas a la vez probablemente no cabe; conviene procesar por pares (T-ECO-02).
- Hacer público el repositorio antes de la entrega.

## Investigación

Informe completo con fuentes en `reports/Panorama herramientas SAR NISAR.md`.
