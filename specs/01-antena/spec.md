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
| RF-ANT-07 | Dejar junto a los recortes de cada serie un registro de ingesta (`ingest.json`) con, por gránulo, los bytes pedidos a NASA y los escritos en disco, los segundos de lectura, la hora UTC de la lectura y la fecha de publicación según `catalog`. Lo que no se midió queda en `null`, nunca estimado | Hecho (T-ANT-07) |
| RF-ANT-08 | Excluir los gránulos defectuosos declarados en `config/aois`, con motivo, evidencia y fecha de comprobación. `catalog` los quita de las series y de la línea de tiempo y los lista aparte en `excluded`; `ingest` no los trae | Hecho (T-ANT-10) |
| RF-ANT-09 | Copiar al recorte `metadata/radarGrid`, si el gránulo lo trae, recortado a los nodos que cubren la ventana más 2 por lado, con todas las alturas y sin cambiar valores (`contracts/gcov-subset.md`) | Hecho (T-ANT-11) |

## Criterios de aceptación

- [x] `ingest fetch --limit 2` con un token real deja dos recortes que `processor run` procesa sin errores.
- [x] La línea de tiempo de Parral muestra el hueco del 27 de julio al 10 de agosto y un intervalo de 24 días a su través.
- [x] Todas las horas de la API están en UTC con formato ISO 8601.
- [x] Un fallo del catálogo externo devuelve un 502 claro, nunca datos parciales sin aviso.
- [x] Las fuentes ópticas no requieren cuenta y su licencia queda citada.
- [x] Un gránulo excluido no aparece en `granules` ni en `passes`, sí en `excluded` con su motivo, y `ingest` no lo descarga.

### Horas UTC y fallos externos (T-ANT-12)

Detalle de los dos primeros criterios sin marcar hasta el 2026-11-12:

- [x] Cada hora de la API sale como `AAAA-MM-DDTHH:MM:SS[.ffffff]Z`. Lo comprueba una prueba que recorre todas las rutas GET con datos en todas sus listas; si se añade una ruta sin incluirla, falla.
- [x] Una hora con otra zona horaria, de CMR o de Earth Search, sale convertida a UTC. Una hora sin zona que llegue de fuera se toma como UTC, que es la referencia de CMR y de STAC.
- [x] Una hora sin zona creada por el propio `catalog` es un fallo del código: el modelo de respuesta la rechaza, nunca adivina la zona.
- [x] CMR, Earth Search u OPERA caídos, con error HTTP, con una respuesta que no es JSON o sin los campos esperados devuelven 502 con el servicio en `detail`. Nunca un 500 ni una lista vacía.
- [x] Si falla una página posterior a la primera, la respuesta es 502 y no la lista de las páginas ya leídas.

### Registro de ingesta (RF-ANT-07)

Se comprueban con el servidor HTTP local que ya imita a NASA en las pruebas de `ingest`:

- [x] Tras `ingest fetch`, `data/raw/real/<zona>/<serie>/ingest.json` tiene una entrada por cada recorte `.h5` de la carpeta, y ninguna más.
- [x] Cada entrada leída en esa ejecución tiene `bytes_requested` igual a los bytes que pidió `fsspec` al servidor, `subset_bytes` igual al tamaño del archivo y `seconds` mayor que cero.
- [x] `published_at` y `acquired_at` coinciden con los de la pasada en `GET /aois/{id}/timeline`. Si `catalog` no la tiene o no responde, quedan en `null` y la ingesta sigue.
- [x] Una segunda ejecución que salta un recorte conserva su entrada sin cambios.
- [x] Un recorte que ya estaba en disco sin entrada se registra con `origin: "found_on_disk"`, su tamaño, y `null` en `bytes_requested`, `seconds` y `fetched_at`.
- [x] Los gránulos excluidos aparecen en `excluded` y no en `granules`. Si su archivo sigue en disco, también en `stale`.
- [x] Si la ingesta falla a mitad, el registro conserva los recortes que sí se escribieron y nunca queda a medio escribir.
- [x] El registro no contiene el token, y declara `data_kind: "real"` y `published_at_basis: "cmr_updated"`.

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
- **Produce:** API de catálogo, recortes GCOV en `data/raw/real/` y un registro `ingest.json` por serie junto a ellos. El registro es interno de Antena: no es un contrato, y ningún servicio lo lee todavía.

## Fuera de alcance

- Procesar o modificar valores radar, que es trabajo de Eco.
- Decidir veredictos, que es trabajo de Balanza.
- Leer o recortar los GeoTIFF de DSWx-S1 y comparar su agua con el radar, que es trabajo de Balanza (RF-BAL-07).
- Georreferenciar la vista previa PNG de DSWx-S1 sobre el mapa, que es trabajo de Atlas.

## Preguntas abiertas

- ¿Ofrece ASF el plan de observación en un formato legible por máquina, para RF-ANT-04?
- ¿Qué nubosidad máxima es útil en el monzón de Chihuahua?
- ¿El hueco de DSWx-S1 en Parral entre el 2026-06-28 y el 2026-09-13 es definitivo o se rellenará? Hay que volver a consultar CMR antes de la demo.
