# Eco — señal y georreferencia: especificación

- **Responsable:** @TakoKami-dev
- **Estado:** aprobada para el hackathon

## Misión

Convertir recortes GCOV en mediciones fiables y bien ubicadas: control de calidad de cada fecha, detección de cambio y capas georreferenciadas que el resto del equipo pueda creer sin revisar el HDF5.

## Alcance

- `services/processor`.
- Contrato `contracts/artifact-manifest.schema.json`, compartido con Balanza.

## Historias de usuario

- Como Balanza, quiero saber qué fechas son sospechosas antes de interpretar un cambio.
- Como Atlas, quiero capas COG con su CRS correcto para que se alineen con el mapa y con el óptico.
- Como jurado, quiero saber por qué un píxel no es observable, incluido el relieve.

## Requisitos

| ID | Requisito | Prioridad |
|---|---|---|
| RF-ECO-01 | Detectar cambio entre pares comparables y clasificar cada píxel con su estado | Hecho |
| RF-ECO-02 | Procesar una serie real completa de la zona sin cargar todas las fechas en memoria | Hecho (T-ECO-02) |
| RF-ECO-03 | Control de calidad por fecha en el manifiesto: fracción válida, mediana en dB de HH y HV, desviación respecto a la serie y banderas | Hecho (T-ECO-03) |
| RF-ECO-04 | Leer modo y polarización de los metadatos del producto, no del nombre del archivo | Hecho (T-ECO-04) |
| RF-ECO-05 | Marcar layover y sombra con el DEM Copernicus GLO-30 (estado 15) | Hecho (T-ECO-05) |
| RF-ECO-06 | Verificar la georreferencia contra un rasgo conocido y documentar el desplazamiento | Hecho (T-ECO-06) |
| RF-ECO-07 | Calibrar umbrales con datos reales junto a Balanza | P1 |
| RF-ECO-08 | Filtro multitemporal opcional para reducir el speckle | P2 |

## Criterios de aceptación

- [x] Procesar 10 fechas reales de Parral con menos de 2 GB de RAM. Comprobado el 2026-11-12 con las 10 fechas reales de T048 en Docker: 1611 MB de pico del contenedor (`memory.peak`, incluye caché de archivos) y 389 s.
- [x] Una fecha con su mediana desplazada más de 1,5 dB respecto a la serie aparece marcada en el control de calidad. Comprobado con datos sintéticos (+3 dB), no con datos reales.
- [x] Toda capa COG declara su CRS, y su extensión en WGS84 coincide con la del manifiesto. Prueba `test_every_cog_declares_the_crs_and_covers_the_manifest_bbox`: cada COG cubre el `bbox` y lo excede menos de 0,01°. En las 36 capas reales de Parral (T048 y T171, 2026-11-12) el exceso máximo es 0,004°, por recortar en UTM.
- [x] Ningún píxel no observable cambia de estado por el procesamiento. Prueba `test_unobservable_pixels_keep_their_cause_in_the_written_state`: en cada `state.tif` escrito, los píxeles no observables conservan su causa y nunca valen `no_change` ni `change_probable`.
- [x] Las pruebas sintéticas siguen pasando (28 en `processor`, 2026-11-12).

## Interfaces

- **Consume:** recortes GCOV (`contracts/gcov-subset.md`) y el DEM Copernicus GLO-30.
- **Produce:** COGs, estados y manifiesto (`contracts/artifact-manifest.schema.json`).

## Fuera de alcance

- Redactar textos o decidir el veredicto final, que es trabajo de Balanza.
- Descargar datos, que es trabajo de Antena.

## Resultados

- RF-ECO-06 (2026-11-12): frente a Sentinel-2 en La Boquilla no hay un desplazamiento detectable mayor que un píxel (10 m). Método y cifras en `MEMORY.md`; se repite con `bench/georref.py`.

## Preguntas abiertas

- ¿Coinciden píxel a píxel las mallas de un mismo marco entre fechas? Hoy se rechazan si difieren.
- ¿Trae el producto `NISAR_L2_STATIC` capas de geometría útiles para layover y sombra? En los gránulos reales, `identification/staticLayersDataAccess` apunta a él (comprobado el 2026-11-11), pero aún no se ha abierto ninguno.
- El recorte no copia el ancho de banda de la fuente, y `listOfObservationModes` llega como `(NOT SPECIFIED)`. Hoy el código de ancho de banda (`4005`) sale del nombre tras comprobarlo con `listOfFrequencies`. ¿Lo copia Antena en el recorte?
