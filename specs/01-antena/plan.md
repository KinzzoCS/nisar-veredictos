# Antena — plan técnico

## Diseño

- `catalog` (FastAPI) consulta CMR, agrupa series y guarda en caché una hora. Ya existe.
- `ingest` (CLI) pide a `catalog` la serie configurada y lee cada gránulo por HTTPS con `fsspec`, caché `background` y bloques de 16 MB, según la guía de ASF. Escribe primero un `.part` y lo renombra al terminar. Existe en el PR 2.
- La línea de tiempo se calcula con los metadatos de CMR: la hora de inicio de adquisición sale del nombre del gránulo, y el campo `updated` de CMR se usa como aproximación a la publicación. Incluye las series con una sola pasada, porque también dicen cuándo se pudo observar la zona.

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
