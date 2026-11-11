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
| RF-ECO-02 | Procesar una serie real completa de la zona sin cargar todas las fechas en memoria | P0 |
| RF-ECO-03 | Control de calidad por fecha en el manifiesto: fracción válida, mediana en dB de HH y HV, desviación respecto a la serie y banderas | P0 |
| RF-ECO-04 | Leer modo y polarización de los metadatos del producto, no del nombre del archivo | P0 |
| RF-ECO-05 | Marcar layover y sombra con el DEM Copernicus GLO-30 (estado 15) | P1 |
| RF-ECO-06 | Verificar la georreferencia contra un rasgo conocido y documentar el desplazamiento | P1 |
| RF-ECO-07 | Calibrar umbrales con datos reales junto a Balanza | P1 |
| RF-ECO-08 | Filtro multitemporal opcional para reducir el speckle | P2 |

## Criterios de aceptación

- [ ] Procesar 10 fechas reales de Parral con menos de 2 GB de RAM.
- [x] Una fecha con su mediana desplazada más de 1,5 dB respecto a la serie aparece marcada en el control de calidad. Comprobado con datos sintéticos (+3 dB), no con datos reales.
- [ ] Toda capa COG declara su CRS, y su extensión en WGS84 coincide con la del manifiesto.
- [ ] Ningún píxel no observable cambia de estado por el procesamiento.
- [ ] Las pruebas sintéticas siguen pasando.

## Interfaces

- **Consume:** recortes GCOV (`contracts/gcov-subset.md`) y el DEM Copernicus GLO-30.
- **Produce:** COGs, estados y manifiesto (`contracts/artifact-manifest.schema.json`).

## Fuera de alcance

- Redactar textos o decidir el veredicto final, que es trabajo de Balanza.
- Descargar datos, que es trabajo de Antena.

## Preguntas abiertas

- ¿Coinciden píxel a píxel las mallas de un mismo marco entre fechas? Hoy se rechazan si difieren.
- ¿Trae `identification/staticLayersDataAccess` capas de geometría útiles para layover y sombra?
