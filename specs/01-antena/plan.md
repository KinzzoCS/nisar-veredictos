# Antena — plan técnico

## Diseño

- `catalog` (FastAPI) consulta CMR, agrupa series y guarda en caché una hora. Ya existe.
- `ingest` (CLI) pide a `catalog` la serie configurada y lee cada gránulo por HTTPS con `fsspec`, caché `background` y bloques de 16 MB, según la guía de ASF. Escribe primero un `.part` y lo renombra al terminar. Existe en el PR 2.
- La línea de tiempo se calcula con los metadatos de CMR: la hora de inicio de adquisición sale del nombre del gránulo, y el campo `updated` de CMR se usa como aproximación a la publicación. Incluye las series con una sola pasada, porque también dicen cuándo se pudo observar la zona.

## Interfaces nuevas

| Ruta | Respuesta |
|---|---|
| `GET /aois/{id}/timeline` | `passes[]` con `series`, `granule_id`, `acquired_at` (UTC), `published_at`, `latency_hours` y `contains_aoi`; `intervals[]` por serie con `days` y `crosses_gap`; `gaps[]`; `next_pass_estimates[]`, una por serie, con `basis: "12-day cycle"`; `published_at_basis: "cmr_updated"` |
| `GET /aois/{id}/references/optical?date=&days=&max_cloud=` | Escenas Sentinel-2 L2A: `id`, `datetime`, `cloud_cover`, URL del COG visual y `license` |
| `GET /aois/{id}/references/opera?date=` | Productos DSWx-S1 a ±7 días: `id`, `datetime` y `download_url` |

Son cambios aditivos de `contracts/catalog.openapi.json`. Hay que avisar a Balanza y a Atlas en el PR.

## Datos

- Sentinel-2 L2A desde Earth Search (`https://earth-search.aws.element84.com/v1`), colección `sentinel-2-l2a`, sin cuenta. Licencia: datos Copernicus, de acceso libre y con atribución.
- OPERA DSWx-S1: colección `OPERA_L3_DSWX-S1_V1` en CMR. Leer sus archivos requiere token.
- Latencia: diferencia entre adquisición y publicación, en horas.

## Pruebas

- Fuentes externas sustituidas por dobles en las pruebas, como ya hace `catalog`.
- Caso de Parral con el hueco de julio y agosto.
- Ningún mensaje de error contiene el token.

## Riesgos

- La fecha de producción de CMR puede no coincidir con la publicación real. Se declara como aproximación.
- Earth Search puede cambiar su API. Se fija la versión `v1` y se cachean los resultados.
