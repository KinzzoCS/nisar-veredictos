# Antena — ingesta y tiempo: especificación

- **Responsable:** @KinzzoCS
- **Estado:** aprobada para el hackathon

## Misión

Alimentar el sistema con los datos correctos y decir con exactitud **cuándo** existen: qué pasadas hay, cada cuánto, con qué huecos y con qué retraso se publican. Antena es la única puerta de entrada de datos externos.

## Alcance

- `services/catalog`, `services/ingest` y `config/aois/`.
- Contratos `contracts/catalog.openapi.json` y `contracts/gcov-subset.md`.

## Historias de usuario

- Como Eco, quiero recortes GCOV de una serie comparable para procesarlos sin descargar gránulos completos.
- Como Balanza, quiero las pasadas con hora UTC para decidir si un evento pudo observarse.
- Como Balanza y Atlas, quiero escenas ópticas y referencias OPERA cercanas a cada fecha para contrastar el radar.
- Como jurado, quiero saber la edad y la latencia de cada dato para juzgar su vigencia.

## Requisitos

| ID | Requisito | Prioridad |
|---|---|---|
| RF-ANT-01 | Listar series comparables por zona sin mezclar pista, dirección, marco, modo, polarización ni CRID | Hecho |
| RF-ANT-02 | Traer por HTTPS solo el recorte de la zona, de forma reanudable y sin exponer el token | Hecho (T-ANT-02, T-ANT-03) |
| RF-ANT-03 | Publicar una línea de tiempo por zona: pasadas con hora UTC, intervalo en días, huecos y latencia de publicación | Hecho (T-ANT-04) |
| RF-ANT-04 | Estimar la siguiente pasada y marcarla como estimación | Hecho con el ciclo de 12 días (T-ANT-04); T-ANT-09 lo mejoraría con el plan de ASF |
| RF-ANT-05 | Listar escenas Sentinel-2 L2A por fecha, dentro de ±N días y con nubosidad máxima configurable | Hecho (T-ANT-05) |
| RF-ANT-06 | Listar productos OPERA DSWx-S1 a ±N días de una fecha (7 por defecto), agrupados por pasada de Sentinel-1, sin versiones reprocesadas repetidas, con su cobertura de la zona y enlaces que dicen si requieren cuenta. Si no hay ninguno, lo dice | Hecho (T-ANT-06) |
| RF-ANT-07 | Dejar un registro de ingesta por serie: gránulo, bytes, segundos y fecha de publicación | P1 |
| RF-ANT-08 | Excluir los gránulos defectuosos declarados en `config/aois`, con motivo, evidencia y fecha de comprobación. `catalog` los quita de las series y de la línea de tiempo y los lista aparte en `excluded`; `ingest` no los trae | Hecho (T-ANT-10) |
| RF-ANT-09 | Copiar al recorte `metadata/radarGrid`, si el gránulo lo trae, recortado a los nodos que cubren la ventana más 2 por lado, con todas las alturas y sin cambiar valores (`contracts/gcov-subset.md`) | Hecho (T-ANT-11) |

## Criterios de aceptación

- [x] `ingest fetch --limit 2` con un token real deja dos recortes que `processor run` procesa sin errores.
- [x] La línea de tiempo de Parral muestra el hueco del 27 de julio al 10 de agosto y un intervalo de 24 días a su través.
- [ ] Todas las horas de la API están en UTC con formato ISO 8601.
- [ ] Un fallo del catálogo externo devuelve un 502 claro, nunca datos parciales sin aviso.
- [x] Las fuentes ópticas no requieren cuenta y su licencia queda citada.
- [x] Un gránulo excluido no aparece en `granules` ni en `passes`, sí en `excluded` con su motivo, y `ingest` no lo descarga.

### OPERA DSWx-S1 (RF-ANT-06)

Se comprueban con dobles de CMR que reproducen los títulos reales de Parral (ver `MEMORY.md`):

- [x] Parral con `date=2026-06-29` devuelve tres pasadas: la del 06-22 (`days_from_date: -7`) y las dos del 06-27, a las 00:58 y a las 13:04 UTC (`-2`).
- [x] Parral con `date=2026-07-08` devuelve 200 con `acquisitions: []`. Nunca un 404 ni una pasada fuera de la ventana.
- [x] Una tesela con dos versiones de producción aparece una sola vez, con la producción más reciente. El caso real es T13RDL del 2026-06-22 a las 12:56 UTC.
- [x] `covers_aoi` es `true` en Parral, y la respuesta declara `coverage_basis: "tile_bbox"`.
- [x] Los enlaces a GeoTIFF están marcados como que requieren cuenta de Earthdata, y `browse_url` solo apunta al bucket público de PO.DAAC.
- [x] La respuesta cita el DOI `10.5067/OPDSWS1-L3V1` y el tamaño mínimo de masa de agua que el producto detecta.
- [x] Si CMR falla, la ruta responde 502 y no devuelve una lista parcial.
- [x] `catalog` no lee ni necesita el token de Earthdata para esta ruta.
- [x] `contracts/catalog.openapi.json` se regenera y su prueba de contrato pasa.

## Interfaces

- **Consume:** NASA CMR (público, también para OPERA DSWx-S1 de PO.DAAC), NASA Earthdata (token), Earth Search STAC para Sentinel-2 (público).
- **Produce:** API de catálogo y recortes GCOV en `data/raw/real/`.

## Fuera de alcance

- Procesar o modificar valores radar, que es trabajo de Eco.
- Decidir veredictos, que es trabajo de Balanza.
- Leer o recortar los GeoTIFF de DSWx-S1 y comparar su agua con el radar, que es trabajo de Balanza (RF-BAL-07).
- Georreferenciar la vista previa PNG de DSWx-S1 sobre el mapa, que es trabajo de Atlas.

## Preguntas abiertas

- ¿Ofrece ASF el plan de observación en un formato legible por máquina, para RF-ANT-04?
- ¿Qué nubosidad máxima es útil en el monzón de Chihuahua?
- ¿El hueco de DSWx-S1 en Parral entre el 2026-06-28 y el 2026-09-13 es definitivo o se rellenará? Hay que volver a consultar CMR antes de la demo.
