# Atlas — tareas

| ID | Tarea | Prioridad | Depende de | Estado |
|---|---|---|---|---|
| T-ATL-01 | [P] Elegir biblioteca y mapa base, comprobar licencias y acordar con Faro la carpeta del mapa | P0 | — | hecha: MapLibre y OSM; Faro confirmó `frontend/src/mapa/` el 2026-11-12 |
| T-ATL-02 | [P] Mapa base encuadrado en Parral con atribución y escala | P0 | T-ATL-01 | hecha (PR 32). Desde el PR 62 también encuadra zonas que cruzan el antimeridiano |
| T-ATL-03 | [P] Capas `state`, `change_hh` y `change_hv` con leyenda y trama de lo no observable | P0 | T-ATL-02 | hecha (PR 32, 49 y 62): trama para todo el rango 10-63 y aviso de desplazamiento de la escena; falta probarla con teselas reales de la API |
| T-ATL-04 | [P] Selección de punto con 5 decimales y serie por píxel | P0 | T-ATL-02 | hecha (PR 32); falta probarla con la API real |
| T-ATL-05 | Publicar la interfaz del mapa para Faro | P0 | T-ATL-03 | hecha: `plan.md`, `src/types/map.ts` y `src/mapa/README.md` (PR 32); Faro monta el mapa con ella (PR 52) |
| T-ATL-06 | Línea de tiempo de pasadas, hueco y eventos | P1 | T-ANT-04 | pendiente. Compromisos de las revisiones: próxima pasada como estimación con `checked_at` (PR 41), `assumption.text` en los eventos (PR 33) y pasadas excluidas con su motivo (PR 40) |
| T-ATL-07 | Comparador deslizante radar frente a óptico | P1 | T-BAL-04 | en curso: comparador en `main` (PR 32 y 54) y Faro convierte `evidence.optical`, que llega desde el PR 19 (PR 52); falta probarlo con la API real y comprobar La Boquilla |
| T-ATL-08 | Límites de zoom y rendimiento | P2 | T-ATL-03 | pendiente |

## Ola 2: acceso, búsqueda e interfaz

Propuesta del 2026-11-14, pendiente de aprobación. Especificaciones en [06-acceso](../06-acceso/spec.md), [07-busqueda](../07-busqueda/spec.md) y [08-interfaz](../08-interfaz/spec.md). Prioridades de esta ola en [specs/README.md](../README.md#prioridades-de-la-ola-2).

| ID | Tarea | Prioridad | Depende de | Estado |
|---|---|---|---|---|
| T-ATL-09 | [P] Globo 3D con `setProjection({ type: "globe" })` de MapLibre 6.16.0, que pasa a Mercator por dentro al acercarse (comprobado en sus tipos y visto en el navegador el 2026-11-14: Mercator desde el zoom 12; detalle en MEMORY), y caída a 2D si no hay soporte (RF-INT-10 y 17) | P0 | — | pendiente |
| T-ATL-10 | Botón 2D/3D (activa girar e inclinar en 3D; al volver a 2D, norte arriba y los desactiva), escala oculta con inclinación o con el globo a zoom bajo y aviso de perspectiva, misma selección de punto en 3D (probada con `project`/`unproject`), trama y distintivo visibles en 3D, comparador óptico en 3D con la misma proyección y relieve o forzado a 2D, y teclado para girar e inclinar (RF-INT-11, 13 a 15 y 20) | P0 | T-ATL-09 | pendiente |
| T-ATL-11 | Interfaz `crearMapa` ampliada con opciones opcionales, publicada en `plan.md` (RF-INT-19) | P0 | T-ATL-09 | pendiente |
| T-ATL-12 | Relieve GLO-30 con exageración declarada y atribución de Copernicus DEM (RF-INT-12) | P1 | T-ATL-10, T-BAL-15 | pendiente |
| T-ATL-13 | Caja de la zona y huellas de las series en el globo (RF-INT-16) | P1 | T-ANT-17 | pendiente |
| T-ATL-14 | Rectángulo de búsqueda (`onBboxDrawn`) y capa de resultados (RF-INT-18) | P1 | T-ATL-11, T-BAL-17 | pendiente |
