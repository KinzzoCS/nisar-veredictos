# Atlas — plan técnico

## Biblioteca

Recomendada: **MapLibre GL JS** (BSD-3, compatible con GPL-3.0), que admite teselas raster `{z}/{x}/{y}` como las de la API. La decisión final es de Atlas y se registra en MEMORY.

## Mapa base: opciones a verificar

| Opción | Licencia a comprobar | Nota |
|---|---|---|
| Teselas de OpenStreetMap | Datos ODbL; el servidor público tiene una política de uso | Válido para la demo con atribución; no para tráfico alto |
| Sentinel-2 de la propia API (Balanza) | Copernicus, libre con atribución | El óptico del mismo periodo; puede salir nublado |
| Sentinel-2 cloudless de EOX | Depende de la edición; algunas no permiten uso comercial | Revisar antes de usar |

## Interfaz del mapa para Faro

Contrato interno del frontend, independiente del framework:

| Entrada | Tipo | Descripción |
|---|---|---|
| `aoi` | `[oeste, sur, este, norte]` | Encuadre inicial y contorno |
| `layers` | `{ state, change_hh, change_hv }` | Plantillas de tesela tal como vienen de la API, con el host del gateway delante |
| `activeLayer` | `"state" \| "change_hh" \| "change_hv"` | Capa visible |
| `optical` | `{ before?: VistaOptica, after?: VistaOptica }` | Escenas Sentinel-2 de antes y después del veredicto (`verdict.evidence.optical`). Ver la tabla de abajo |
| `compare` | `"off" \| "swipe"` | Modo de comparación |
| `dataKind` | `"real" \| "synthetic"` | El mapa muestra un distintivo si es sintético |

`VistaOptica` sale de `evidence.optical.before` o `.after` de la API de veredictos (PR 19):

| Campo | Tipo | Desde la API | Descripción |
|---|---|---|---|
| `status` | `"clear" \| "cloudy" \| "partial_coverage" \| "none_in_window" \| "catalog_unavailable"` | `status` | Siempre presente. Con `none_in_window` o `catalog_unavailable` no hay escena y el mapa lo dice en lugar de dejar el lado vacío. Con `cloudy` o `partial_coverage` avisa junto a la imagen |
| `tiles` | `string[]` | `scene.tiles[].tile_url` | Una plantilla XYZ por tesela MGRS (4 en Parral), con el host del gateway delante. Se pinta una capa por tesela. Fuera de la huella de su tesela, TiTiler responde 404: el mapa lo trata como tesela vacía, no como error. Vacío si no hay escena |
| `attribution` | `string?` | `scene.attribution` | Se muestra junto a la imagen (licencia Copernicus) |
| `cloudCover` | `number?` | `scene.max_cloud_cover` | Nubosidad en %, de la tesela MGRS completa y no de la zona; el texto lo dice así |
| `acquiredAt` | `string?` | `scene.acquired_at` | Hora UTC de la escena |
| `daysFromRadar` | `number?` | `scene.days_from_radar` | Días respecto a la pasada de radar; negativo si es anterior |
| `coversAoi` | `boolean?` | `scene.covers_aoi` | Si las teselas juntas cubren toda la zona |

Los campos con `?` faltan cuando `scene` es `null`. Faro hace la conversión desde la respuesta de la API; el mapa no llama a la API óptica.

| Evento | Carga | Cuándo |
|---|---|---|
| `onPointSelected` | `{ lon, lat }` con 5 decimales | Clic o tecla Enter sobre el mapa |
| `onViewChanged` | `{ bbox, zoom }` | Al terminar un desplazamiento o zoom |

## Leyenda de estados

| Código | Estado | Representación |
|---|---|---|
| 0 | Sin cambio | Transparente |
| 1 | Cambio probable | Color de acento opaco |
| 10-15 | No observable | Gris con trama diagonal y etiqueta de causa |

## Pruebas

- Prueba visual de la leyenda y de la trama de lo no observable.
- Prueba de que `onPointSelected` redondea a 5 decimales.

## Riesgos

- Las teselas de 10 m a zoom bajo pueden verse vacías. Se limita el zoom y se explica.
- Límites de zoom (T-ATL-08, 2026-11-14): el mapa llega como mucho al zoom 16, dos niveles sobre el dato, donde un píxel de 10 m ocupa unos 5 px de pantalla. Las fuentes de radar y ópticas piden teselas hasta el zoom 14 (unos 8,5 m por píxel a 27° de latitud) y MapLibre las amplía por encima, porque más teselas no traerían más detalle. La trama de lo no observable no se amplía: se dibuja por píxel de tesela y saldría más gruesa. Todas las fuentes de datos llevan `bounds` con la caja de la zona, salvo si cruza el antimeridiano.
