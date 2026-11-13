# Antena — plan técnico

## Diseño

- `catalog` (FastAPI) consulta CMR, agrupa series y guarda en caché una hora. Ya existe.
- `ingest` (CLI) pide a `catalog` la serie configurada y lee cada gránulo por HTTPS con `fsspec`, caché `background` y bloques de 16 MB, según la guía de ASF. Escribe primero un `.part` y lo renombra al terminar. Existe en el PR 2.
- La línea de tiempo se calcula con los metadatos de CMR: la hora de inicio de adquisición sale del nombre del gránulo, y el campo `updated` de CMR se usa como aproximación a la publicación. Incluye las series con una sola pasada, porque también dicen cuándo se pudo observar la zona.

- El recorte copia también `/science/LSAR/GCOV/metadata/radarGrid` si existe (T-ANT-11). Son cubos `(altura, y, x)` sobre nodos cada 500 m. Se quedan los nodos que rodean la ventana de `frequencyA` más 2 por lado, en x y en y, con todas las alturas. `heightAboveEllipsoid`, `projection` y cualquier otro dato que no dependa de x e y se copian enteros, y se conservan tipos, valores y atributos. Si el gránulo no trae el grupo, el recorte sale sin él.

## Interfaces nuevas

| Ruta | Respuesta |
|---|---|
| `GET /aois/{id}/timeline` | `passes[]` con `series`, `granule_id`, `acquired_at` (UTC), `published_at`, `latency_hours` y `contains_aoi`; `intervals[]` por serie con `days` y `crosses_gap`; `gaps[]`; `next_pass_estimates[]`, una por serie, con `basis: "12-day cycle"`; `published_at_basis: "cmr_updated"` |
| `GET /aois/{id}/references/optical?date=&days=&max_cloud=` | `acquisitions[]` de Sentinel-2 L2A agrupadas por satélite y día, con `acquired_at`, `days_from_date`, `covers_aoi`, `max_cloud_cover` y `tiles[]` (`id`, `tile`, `cloud_cover`, `visual_url` del COG TCI); además `license`, `license_url`, `attribution` y `cloud_cover_basis: "tile"`. Por defecto `days=7` (máx. 30) y `max_cloud=30`, valor inicial sin calibrar |
| `GET /aois/{id}/references/opera?date=&days=` | `acquisitions[]` de DSWx-S1 agrupadas por pasada de Sentinel-1. Detalle en "Referencias OPERA DSWx-S1" |

Son cambios aditivos de `contracts/catalog.openapi.json`. Hay que avisar a Balanza y a Atlas en el PR.

## Referencias OPERA DSWx-S1 (T-ANT-06)

### Para qué sirve

Balanza contrasta el agua que sugiere el radar NISAR con un producto independiente de agua superficial (RF-BAL-07). `catalog` solo dice **qué productos existen** cerca de una fecha y dónde están. No lee sus píxeles.

### Fuente

- CMR público, `granules.json?short_name=OPERA_L3_DSWX-S1_V1`, con el `bbox` de la zona y la ventana temporal. No necesita token.
- Los archivos están en PO.DAAC, no en ASF. Las capas GeoTIFF (`B01_WTR`, `B02_BWTR`, `B03_CONF`, `B04_DIAG`) están en el bucket protegido y piden cuenta de Earthdata. La vista previa `_BROWSE.png` está en el bucket público y se lee sin cuenta.
- CMR solo publica la caja de cada tesela MGRS (`boxes`), no la huella de los datos válidos.

### Ruta

`GET /aois/{id}/references/opera?date=YYYY-MM-DD&days=7`

| Parámetro | Regla |
|---|---|
| `date` | Obligatorio. Normalmente la fecha de una pasada NISAR |
| `days` | Días antes y después, ambos incluidos. Por defecto 7, de 0 a 30, igual que en la ruta óptica |

La ventana son días completos en UTC, de `date - days` a `date + days`. Se reutiliza `window()` de `optical.py`.

### Respuesta

| Campo | Contenido |
|---|---|
| `aoi`, `date`, `days` | Lo pedido |
| `source` | `"NASA CMR"` |
| `collection` | `"OPERA_L3_DSWX-S1_V1"` |
| `doi` | `"10.5067/OPDSWS1-L3V1"` |
| `attribution` | Texto que debe mostrarse junto al producto: OPERA DSWx-S1 v1, NASA JPL OPERA, distribuido por PO.DAAC, con datos modificados de Copernicus Sentinel de los años presentes |
| `product_spec_url` | Especificación del producto (JPL D-108761 Rev A), tomada de CMR |
| `min_water_body_ha`, `min_water_body_width_m` | `3` y `200`. Límite de detección que declara la colección en CMR |
| `coverage_basis` | `"tile_bbox"`: `covers_aoi` usa la caja de cada tesela, no los píxeles válidos |
| `data_access` | `"earthdata_login"`: los `*_url` de GeoTIFF piden cuenta. `browse_url` no |
| `acquisitions[]` | Ordenadas por `abs(days_from_date)` y después por `acquired_at`. Lista vacía si no hay productos |

Cada elemento de `acquisitions[]`:

| Campo | Contenido |
|---|---|
| `platform` | `sentinel-1a`, `sentinel-1d`, etc., a partir del sensor del título |
| `acquired_at` | `time_start` de CMR de la primera tesela, en UTC |
| `days_from_date` | Días entre la fecha UTC de `acquired_at` y `date`. Negativo si es anterior |
| `covers_aoi` | Las cajas de sus teselas juntas contienen la zona, comprobado con la rejilla de 5 × 5 puntos que ya usa la ruta óptica |
| `tiles[]` | Ordenadas por tesela |

Cada elemento de `tiles[]`:

| Campo | Contenido |
|---|---|
| `id` | Título del gránulo en CMR, sin extensión. Es el que cita el recibo de Balanza |
| `tile` | Tesela MGRS sin la `T` inicial, por ejemplo `13RDK` |
| `acquired_at` | `time_start` de CMR, en UTC |
| `produced_at` | Hora de producción del título, en UTC |
| `wtr_url` | GeoTIFF `B01_WTR`, clasificación de agua. Pide cuenta |
| `conf_url` | GeoTIFF `B03_CONF`, confianza. Pide cuenta |
| `browse_url` | PNG `_BROWSE.png` del bucket público, o `null` si CMR no lo publica |

### Reglas

1. **Título.** Se interpreta con `OPERA_L3_DSWx-S1_T<tesela>_<adquisición>Z_<producción>Z_<sensor>_30_v<versión>`. Un título que no encaja se ignora.
2. **Versiones repetidas.** Si dos gránulos comparten tesela y hora de adquisición del título, se queda el de producción más reciente. Pasa en Parral: 4 de 40 productos en la ventana son versiones anteriores.
3. **Pasadas.** Las teselas del mismo sensor se agrupan si sus horas de adquisición distan 10 minutos o menos. En Parral, las dos teselas de una pasada distan unos 30 s, y las dos pasadas de un mismo día, unas 12 h.
4. **Enlaces.** Solo enlaces `https://`. `wtr_url` y `conf_url` salen de los enlaces `data#` que terminan en `_B01_WTR.tif` y `_B03_CONF.tif`. `browse_url` sale del enlace que termina en `_BROWSE.png` y está en `podaac-ops-cumulus-public`. Una tesela sin `wtr_url` se descarta, porque no sirve para el contraste.
5. **Caja.** `boxes[0]` de CMR viene como `sur oeste norte este`.
6. **Errores.** Zona desconocida, 404. Parámetros fuera de rango, 422. Si CMR falla, 502 con "CMR no respondió; no hay referencias OPERA". Nunca una lista parcial.
7. **Caché.** Una hora por `bbox` y ventana, como el resto de fuentes.

### Código

- Módulo nuevo `services/catalog/src/catalog/opera.py` con `parse_entry`, `OperaSource` (protocolo), `CmrOperaSource` y `group_passes`.
- `create_app(..., opera_source=None)` para inyectar el doble en las pruebas.
- Modelos `OperaTile`, `OperaAcquisition` y `OperaOut` en `main.py`.

### Pruebas

Dobles construidos con títulos reales de Parral, sin guardar respuestas completas de CMR:

- Un título de DSWx-S1 se interpreta; uno de NISAR GCOV, no.
- Dos versiones de T13RDL del 2026-06-22 dejan solo la de producción `20260828T070924Z`.
- Dos pasadas el mismo día (00:58 y 13:04 UTC) dan dos adquisiciones.
- `date=2026-07-08` con la ventana vacía da 200 y `acquisitions: []`.
- `covers_aoi` es `true` con la caja de T13RDK y `false` con la de T13RDL sola.
- `browse_url` nunca apunta al bucket protegido.
- Un error de `httpx` en la fuente da 502.
- La fuente recibe la ventana de `window(date, days)`.
- La prueba de contrato existente cubre la ruta nueva.

## Gránulos excluidos (T-ANT-10)

Un gránulo con metadatos normales puede traer píxeles inservibles. Le pasa a T171 del 2026-08-13: la vista previa de ASF ya muestra la anomalía. Si se usa, salen cambios falsos en los dos pares que lo tocan. La exclusión se declara a mano en la zona, con su evidencia, y nunca se deduce sola.

### Configuración

Cada serie de `config/aois/<zona>.yaml` admite `exclude`, una lista con:

| Campo | Contenido |
|---|---|
| `granule` | `granule_id` exacto, el título de CMR sin extensión |
| `reason` | Código corto. Hoy solo `product_defect`: el fallo está en el producto publicado, no en el recorte |
| `evidence` | Cómo se comprobó, en una frase que se pueda repetir |
| `checked_on` | Fecha de la comprobación, `YYYY-MM-DD` |

### API

- `GET /aois/{id}/series`: el gránulo sale de `granules`, y `max_gap_days`, `spans_data_gap` y `contains_aoi` se calculan sin él. `excluded[]` lo lista con `id`, `date`, `acquired_at`, `reason`, `evidence` y `checked_on`.
- `GET /aois/{id}/timeline`: el gránulo sale de `passes` y de `intervals`, así que el intervalo pasa a unir las fechas vecinas. `excluded[]` lo lista con los mismos campos y `series`. Así Balanza no cuenta como observación una pasada que no sirve, y la línea de tiempo coincide con los artefactos de Eco.
- Ambos campos son aditivos y siempre están, vacíos si no hay exclusiones.

### Ingesta

`ingest fetch` salta los gránulos de `exclude` aunque `catalog` aún los liste, y los informa aparte. Si el archivo ya está en disco, lo avisa y no lo borra, porque `processor` lee toda la carpeta y debe apartarse a mano.

## Registro de ingesta (T-ANT-07)

### Para qué sirve

Hoy las medidas de `MEMORY.md` (MB, segundos y red) salen a mano y con el contador de red de todo el equipo. El registro las deja medidas por gránulo y junto a los recortes, para repetir la ingesta y para que el jurado vea qué se leyó, cuándo y cuánto tardó. También deja la fecha de publicación de cada gránulo, que da su edad y su latencia sin volver a consultar CMR.

### Archivo

`data/raw/real/<zona>/<serie>/ingest.json`, en UTF-8. `processor` lee solo `*.h5` de esa carpeta, así que no le afecta. No se versiona, como todo `data/`. No es un contrato: si otro servicio llega a necesitarlo, se mueve a `contracts/` con el proceso de la constitución.

| Campo | Contenido |
|---|---|
| `schema` | `"ingest-log/1"` |
| `data_kind` | `"real"` |
| `aoi`, `series` | Zona y serie configuradas, por ejemplo `parral` y `T048A-F015` |
| `catalog_series` | `id` de la serie en `catalog`, con modo, polarización y CRID |
| `bbox` | La de la zona, oeste, sur, este, norte |
| `read` | `cache_type` y `block_size_bytes` con los que se leyó |
| `published_at_basis` | `"cmr_updated"`, igual que en la línea de tiempo |
| `updated_at` | Última escritura del registro, en UTC |
| `granules[]` | Una entrada por recorte `.h5` presente en la carpeta, ordenadas por `id` |
| `excluded[]` | `id` y `reason` de los gránulos de `exclude` en esta serie |
| `stale[]` | `id` de los excluidos que siguen en disco |

Cada elemento de `granules[]`:

| Campo | Contenido |
|---|---|
| `id` | `granule_id`, igual que el nombre del archivo sin `.h5` |
| `date` | Fecha de la pasada según `catalog`, o `null` |
| `acquired_at`, `published_at` | Los de la pasada en `GET /aois/{id}/timeline`, en UTC, o `null` |
| `source_size_mb` | `size_mb` del gránulo completo según `catalog`, o `null` |
| `subset_bytes` | Tamaño del recorte en disco |
| `bytes_requested` | Bytes que `fsspec` pidió al servidor (`cache.total_requested_bytes`), incluidos los bloques que leyó por adelantado. `null` si no se midió |
| `seconds` | Segundos de pared desde abrir el gránulo remoto hasta renombrar el recorte. `null` si no se midió |
| `fetched_at` | Hora UTC en que terminó la lectura. `null` si no se midió |
| `origin` | `"fetched"` si lo escribió `ingest` con registro; `"found_on_disk"` si ya estaba y no tenía entrada |

### Reglas

1. **Fusión.** Se lee el registro anterior si existe. Las entradas de recortes que se saltan se conservan tal cual. Las de archivos que ya no están en la carpeta se quitan. Un `.h5` sin entrada se añade como `found_on_disk`, con solo su tamaño.
2. **Escritura.** Tras cada recorte nuevo y al final, en un `.part` que se renombra. Si la ingesta falla a mitad, el registro tiene lo que sí se escribió y nunca queda a medio escribir.
3. **Publicación.** Una sola llamada a `GET /aois/{id}/timeline` por ejecución, unida por `granule_id`. Si falla, `acquired_at` y `published_at` quedan en `null`, se avisa por la salida de error y la ingesta sigue. Se evita así un cambio de `contracts/catalog.openapi.json`.
4. **Registro ilegible.** Si `ingest.json` existe pero no se puede leer, se renombra a `ingest.json.bad` y se empieza uno nuevo, con aviso. No se borra.
5. **Sin secretos.** No se guardan el token ni cabeceras. `download_url` tampoco: ya está en `catalog`.

### Código

- Módulo nuevo `services/ingest/src/ingest/log.py` con `GranuleRecord`, `load`, `merge` y `write`.
- `open_remote` no cambia. `_subset_one` devuelve los bytes pedidos y los segundos, que lee de `remote.cache.total_requested_bytes`.
- `fetch_series` pide la línea de tiempo, escribe el registro y devuelve su ruta en `FetchResult.log`.
- La CLI imprime la ruta del registro y, con él, los MB pedidos a NASA en esa ejecución.

### Pruebas

Con el servidor HTTP local que ya imita a NASA:

- Una ingesta deja una entrada por recorte, con `bytes_requested` igual a lo que pidió `fsspec` y mayor o igual que lo que sirvió el servidor, `subset_bytes` igual al archivo y `seconds > 0`.
- `published_at` y `acquired_at` salen de la línea de tiempo; si `catalog` falla en esa ruta, quedan en `null` y hay recortes.
- La segunda ejecución salta el recorte y conserva su entrada sin cambios.
- Un `.h5` copiado a mano entra como `found_on_disk` con `null` en lo no medido.
- Un excluido va a `excluded`, y a `stale` si su archivo sigue en disco.
- Un fallo en el segundo gránulo deja el registro con el primero.
- Un registro corrupto se aparta a `ingest.json.bad`.
- El texto del registro no contiene el token.

## Datos

- Sentinel-2 L2A desde Earth Search (`https://earth-search.aws.element84.com/v1`), colección `sentinel-2-l2a`, sin cuenta. Licencia: datos Copernicus, de acceso libre y con atribución.
- La zona de Parral cae en cuatro teselas MGRS (13RCK, 13RDK, 13RCL y 13RDL), así que una sola escena nunca la cubre. Por eso se agrupan por adquisición. La nubosidad publicada es la de la tesela completa, no la de la zona, y una adquisición se descarta si alguna de sus teselas supera `max_cloud`. Si hay dos versiones de procesado de una misma escena, se queda la más reciente.
- OPERA DSWx-S1: colección `OPERA_L3_DSWX-S1_V1` en CMR, distribuida por PO.DAAC. Leer sus GeoTIFF requiere token; la vista previa PNG, no. Detalle en "Referencias OPERA DSWx-S1".
- Latencia: diferencia entre adquisición y publicación, en horas.

## Pruebas

- Fuentes externas sustituidas por dobles en las pruebas, como ya hace `catalog`.
- Caso de Parral con el hueco de julio y agosto.
- Ningún mensaje de error contiene el token.

## Riesgos

- La fecha de producción de CMR puede no coincidir con la publicación real. Se declara como aproximación.
- Earth Search puede cambiar su API. Se fija la versión `v1` y se cachean los resultados.
- DSWx-S1 no tiene productos en Parral entre el 2026-06-28 y el 2026-09-13 (CMR, 2026-11-11). La tormenta del 1 de julio queda sin referencia OPERA, y la API debe decirlo con la lista vacía, no ocultarlo.
- DSWx-S1 solo detecta masas de agua abiertas de más de 3 ha y 200 m de ancho. No ver agua en DSWx-S1 no prueba que una calle no se inundara. Balanza debe redactarlo así.
- OPERA reprocesa productos y cambia su hora de producción. El `id` del recibo puede quedar obsoleto; por eso se devuelve siempre la versión más reciente.
- `browse_url` redirige a una URL firmada de CloudFront. Si el gateway la sirve, debe seguir redirecciones.
