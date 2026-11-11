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
| `optical` | `{ before?, after? }` | Plantillas Sentinel-2 del veredicto |
| `compare` | `"off" \| "swipe"` | Modo de comparación |
| `dataKind` | `"real" \| "synthetic"` | El mapa muestra un distintivo si es sintético |

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
