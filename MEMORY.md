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
- La especificación **no** menciona layover ni sombra. `identification/staticLayersDataAccess` podría llevar a capas estáticas útiles; falta investigarlo.

## Caso de Parral

- Tormenta del 1 de julio de 2026 con calles inundadas: cae entre las pasadas del 29 de junio y el 8 de julio. Es el ejemplo de `not_observable`. La noticia salió de extractos de búsqueda; hay que abrirla antes de usarla en la demo.
- La cifra de lluvia es contradictoria entre fuentes (unos 30 mm frente a 228 mm): no usarla.
- Pruebas previstas: tormenta (no observable), campo durante el monzón (cambio con causa ambigua) y jales de La Prieta (estabilidad).

## Sin verificar

- Enunciado oficial de 2026.
- Lista de recursos oficial del reto.
- Lectura real de un gránulo: troceado HDF5, velocidad por HTTPS y si las mallas coinciden entre fechas. `processor` rechaza mallas distintas.
- Harmony para extraer capas GCOV.
- Umbrales: `min_threshold_db`, `MIN_CHANGED_FRACTION` y las firmas por polarización son valores iniciales sin calibrar con banda L.

## Pendientes

- Cuenta de Earthdata del equipo: el 2026-11-09 el equipo la reportó caída y no se pudo crear.
- Probar `ingest fetch` con un token real. Se verificó con un servidor HTTP local (rangos, token, redirección a otro origen), no contra un gránulo NASA.
- Vigilar memoria en `processor`: a 10 m, 10 fechas de la zona completa ocuparían unos 4 GB de RAM. Empezar con `--limit 2` (T-ECO-02).
- Hacer público el repositorio antes de la entrega.

## Investigación

Informe completo con fuentes en `reports/Panorama herramientas SAR NISAR.md`.
