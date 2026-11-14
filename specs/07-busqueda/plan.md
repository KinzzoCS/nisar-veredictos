# Búsqueda: plan técnico

## Diseño

- **Índice derivado, nunca fuente de verdad.** `verdicts` ya calcula todos los veredictos al arrancar (`VERDICTS_WARM_CACHE=1`). Al terminar, vuelca una fila por veredicto e idioma en un SQLite en memoria con FTS5 para el texto. Si cambia un manifiesto, se reconstruye entero: con cientos de pares tarda menos de un segundo. Cada resultado se genera desde el veredicto en caché, así que no puede contradecirlo.
- **Filtros como parámetros de consulta**, no un lenguaje propio: `state=change_probable&min_fraction=0.05&max_noise_hh_db=1.0&from=2026-07-01&to=2026-09-30&water=disagree`. Los parámetros repetidos se combinan con O dentro del mismo campo y con Y entre campos. La respuesta devuelve `query` con la interpretación.
- **Paginación por cursor** opaco (base64 del último orden y del `pair_id`), estable aunque cambie el índice entre páginas.
- **Exportación en streaming** (`StreamingResponse`) para no cargar todo en memoria. GeoJSON usa como geometría la caja de la zona en WGS84, con 5 decimales (constitución V.3).

## Forma de la respuesta

```json
{
  "query": {"state": ["change_probable"], "max_noise_hh_db": 1.0},
  "total": 2,
  "next_cursor": null,
  "results": [
    {
      "aoi": "parral", "series_id": "T048A-F015", "pair_id": "20260816_20260828",
      "from": "2026-08-16", "to": "2026-08-28", "interval_days": 12,
      "state": "change_probable", "changed_fraction": 0.0518,
      "noise_hh_db": 1.27, "scene_shift_exceeds": false, "water": "none_in_window",
      "data_kind": "real", "href": "/aois/parral/series/T048A-F015/verdicts/20260816_20260828"
    }
  ]
}
```

Los valores del ejemplo son ilustrativos de la forma; los reales salen de la API.

## Ruido por par (Eco)

`processor` ya calcula la diferencia corregida por el desplazamiento de escena (T-ECO-07). Se añade la desviación robusta de esa diferencia sobre los píxeles observables, en HH y en HV, a `pairs[].stats` como `noise_hh_db` y `noise_hv_db`. Es el número de la tabla por par del PR 39, que hoy solo vive en esa descripción. Campo opcional del manifiesto: cambio aditivo.

## Búsqueda de pasadas (Antena)

`catalog` ya arma la línea de tiempo con `published_at`, `latency_hours`, `excluded[]` y `observation_plan`. `/search/passes` filtra esa misma lista; la precisión de órbita sale de la letra del nombre del gránulo (P, M, N o F según la guía de ASF) y se declara que `ORBIT_TYPE` de CMR no coincide (ver MEMORY, 2026-11-12).

## Permisos

Las rutas `/search/*` llaman a `requiere_perfil("student")`; la exportación, los filtros de calidad y ruido y `limit > 50` piden `researcher` (`specs/06-acceso`). Con `AUTH_ENABLED=0` todo `/search/*` responde 403 con el perfil necesario, y la interfaz lo explica.

## Pruebas

- Con artefactos sintéticos: cada filtro solo y combinado, orden, cursor y total.
- Con la lista de veredictos real de MEMORY: `state=change_probable` da los dos pares conocidos.
- Exportación: el CSV se vuelve a leer y cada fila tiene `data_kind` y gránulos.
- Permisos: 403 por perfil, como en la matriz.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Presentar 18 veredictos como "motor de búsqueda masivo" | La interfaz muestra el total real y la zona; la especificación lo prohíbe |
| El índice se desfasa del veredicto | Se reconstruye desde la caché de veredictos, nunca se edita a mano |
| Exportaciones grandes saturan `verdicts` | Streaming, solo `researcher` y cuota del gateway |
