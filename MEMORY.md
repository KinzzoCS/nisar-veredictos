# Memoria del proyecto

Contexto compartido para personas y agentes. Fechas absolutas; indica cómo se comprobó cada hecho.

## Estado

- 2026-11-09: esqueleto completo con datos sintéticos. **Todavía no se ha abierto ningún gránulo real.**
- Evento: 14 y 15 de noviembre de 2026, según una fuente secundaria. Falta confirmarlo.
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
- `Fransomware` tenía la invitación pendiente de aceptar. Hasta que la acepte, `CODEOWNERS` no puede pedirle revisión.
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
- Cada gránulo tiene un enlace HTTPS directo en `nisar.asf.earthdatacloud.nasa.gov` (CMR, 2026-11-09). Sin token válido, NASA rechaza la lectura.

## Especificación GCOV

Fuente: JPL D-102274 Rev F, versión 1.5.0, 2026-07-08.

- Rutas en `/science/LSAR/GCOV/grids/frequencyA/`: `HHHH`, `HVHV` (Float32), `numberOfLooks` (Float32), `mask` y `inputDataExceptionMask` (UByte), `xCoordinates`, `yCoordinates`, y `projection` con el atributo `epsg_code`.
- `mask`: 0 inválido o parcialmente enfocado, 1-5 válido con su subfranja, 255 fuera de la escena.
- `inputDataExceptionMask`: 0 sin anomalía.
- En los recortes reales de T048 (2026-11-11): `listOfObservationModes = ["(NOT SPECIFIED)"]`, `isMixedMode = "False"`, `listOfFrequencies = [A, B]`, `isGeocoded = "True"`; los booleanos son texto, no enteros. El recorte no trae el ancho de banda ni `listOfPolarizations`. Desde T-ECO-04, `processor` deduce la polarización de A por las capas presentes, rechaza modo mixto, productos sin HH+HV y nombres que contradicen capas o frecuencias, y solo toma del nombre el código de ancho de banda.
- `identification/staticLayersDataAccess` apunta a un producto aparte, `NISAR_L2_STATIC`, del mismo gránulo. Falta abrir uno.
- La especificación **no** menciona layover ni sombra.

## Caso de Parral

- Tormenta del 1 de julio de 2026 con calles inundadas: cae entre las pasadas del 29 de junio y el 8 de julio. Es el ejemplo de `not_observable`. La noticia salió de extractos de búsqueda; hay que abrirla antes de usarla en la demo.
- La cifra de lluvia es contradictoria entre fuentes (unos 30 mm frente a 228 mm): no usarla.
- Pruebas previstas: tormenta (no observable), campo durante el monzón (cambio con causa ambigua) y jales de La Prieta (estabilidad).

## Sin verificar

- Enunciado oficial de 2026.
- Lista de recursos oficial del reto.
- Lectura real de un gránulo: troceado HDF5, velocidad por HTTPS y si las mallas coinciden entre fechas. `processor` rechaza mallas distintas.
- Harmony para extraer capas GCOV.
- Umbrales: `min_threshold_db`, `MIN_CHANGED_FRACTION`, `qa_outlier_db` (1,5 dB) y las firmas por polarización son valores iniciales sin calibrar con banda L.

## Pendientes

- Cuenta de Earthdata del equipo: el 2026-11-09 el equipo la reportó caída y no se pudo crear.
- Probar `ingest fetch` con un token real. Se verificó con un servidor HTTP local (rangos, token, redirección a otro origen), no contra un gránulo NASA.
- Memoria de `processor` (T-ECO-02): desde el 2026-11-11 procesa por pares, con como máximo dos escenas en memoria, y suaviza en float32. Medido con `services/processor/bench/memoria.py` sobre 10 fechas **sintéticas** de 5022 × 5496 px (Windows, Python 3.14): 5048 MB y 715 s antes, 1510 MB y 516 s después, con conteos, umbrales y QA idénticos. Con las 2 fechas reales de T048 en Docker (`docker compose --profile real run process`), el pico del contenedor fue de 1586 MB (`memory.peak` del cgroup, que incluye la caché de archivos) y 52 s, frente a los 2,25 GB que midió Antena. Con las **10 fechas reales** de T048 (2026-11-12, mismo método): 1611 MB y 389 s.
- 2026-11-11, `numberOfLooks` en los recortes reales de T048 (iguales en las dos fechas): p1 1,88, p5 3,12, p15 3,99, mediana 4,52 y p95 6,14. Con `min_looks = 4` queda fuera el 15,2 %; por debajo de 3 solo el 4,3 % y por debajo de 2 el 1,2 %. La fracción baja de oeste a este (del 24-29 % al 6 %), lo que apunta al ángulo de incidencia, y esos píxeles son más brillantes en HH (mediana −7,9 dB frente a −11,1 dB), lo que apunta a laderas orientadas al sensor. Ambas son hipótesis. El umbral se aplica por píxel antes de promediar 5 × 5; la suma de looks en esa ventana baja de 25 solo en el 0,01 %. Decidir el criterio con Balanza (T-ECO-07).
- 2026-11-12, serie real completa de T048 (10 fechas, umbrales sin calibrar):
  - El porcentaje de `change_probable` en cada par consecutivo sigue al desplazamiento de la mediana de toda la escena (correlación 0,9 en 9 pares). Con desplazamientos de ±0,6 a ±1,1 dB sale 2-3 %; con ±1,75 a ±1,84 dB, 14-22 % de lo observable (08-28→09-09, 09-09→09-21, 10-03→10-15), casi todo con HH y HV en el mismo sentido.
  - El umbral de Otsu nunca supera el mínimo: los 10 pares quedan en 3,0 dB, así que hoy el umbral es fijo en la práctica.
  - El QA marca solo el 2026-10-15 (+1,89 dB en HH); el 2026-09-09 queda cerca (+1,37 dB).
  - Hipótesis, sin verificar: humedad del suelo por lluvias del monzón, que sube toda la escena. También podría ser radiométrico. Hasta resolverlo, un "cambio" en esos pares no debe leerse como cambio local. Opciones para T-ECO-07 con Balanza: medir el cambio respecto al desplazamiento de la escena, o avisar en los pares con desplazamiento grande.
  - Las 9 fechas de T171 y el recorte de La Boquilla están en `data/raw/real/`, sin procesar.
- 2026-11-12, serie real completa de T171 (9 fechas), mismo método que T048: 1611 MB y 389 s en T048, **1782 MB y 393 s en T171**. Las dos series quedan por debajo de 2 GB.
- 2026-11-12, **T171 del 2026-08-13 no es utilizable.** Sus metadatos son normales (marco 75, órbita 5460, `boundingPolygon` como el de las demás fechas), pero los píxeles no muestran Parral:
  - la vista rápida enseña sierra con relieve, sin la ciudad ni los ríos que se ven el 07-20 y el 08-25;
  - la correlación de fase con las demás fechas da un pico de 0,01, frente a 0,2-0,3 entre fechas buenas;
  - la mediana de HH es −5,0 dB, unos 6 dB por encima del resto.
  El QA lo marca (+6,4 dB en HH y en HV), pero la marca es solo un aviso: los pares 07-20→08-13 y 08-13→08-25 salen con un 46 % y un 50 % de `change_probable` falso. No se sabe si el fallo es del producto de NASA o del recorte de `ingest`; para saberlo hay que comparar con el gránulo original. Hasta entonces, no usar esa fecha. El 2026-11-12 se apartó a `data/raw/cuarentena/parral/T171D-F075/` (no se borró) y T171 se reprocesó con 8 fechas (1806 MB, 359 s). El par consecutivo pasa a ser 07-20→08-25, que cruza el hueco de adquisición y da un 8,8 % de cambio.
- Letra después del CRID en el nombre (`_N_F_J_001` frente a `_F_F_J_001`): según la guía de ASF (`nisar-docs.asf.alaska.edu/gcov/`, consultada el 2026-11-12) es la precisión de la órbita y del apuntamiento: P precisa, M media, N casi en tiempo real, F pronóstico. La segunda letra es la cobertura (F completa, P parcial), J es JPL y 001 el contador. Medido con correlación de fase en 3 ventanas: el 09-18 y el 10-12 de T171 (F) se desplazan lo mismo que las fechas N, unos 0,8 px en filas respecto al 06-26. En T048, las 10 fechas coinciden con el 06-17 con menos de 0,4 px de diferencia.
- En T171, el QA también marca el 2026-09-30 (+1,59 dB), y el par 09-18→09-30 da un 24,9 % de cambio con HH y HV subiendo a la vez: el mismo patrón de desplazamiento de toda la escena que en T048.
- Hacer público el repositorio antes de la entrega.

## Investigación

Informe completo con fuentes en `reports/Panorama herramientas SAR NISAR.md`.
