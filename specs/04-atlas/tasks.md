# Atlas — tareas

| ID | Tarea | Prioridad | Depende de | Estado |
|---|---|---|---|---|
| T-ATL-01 | [P] Elegir biblioteca y mapa base, comprobar licencias y acordar con Faro la carpeta del mapa | P0 | — | hecha: MapLibre y OSM; Faro confirmó `frontend/src/mapa/` el 2026-11-12 |
| T-ATL-02 | [P] Mapa base encuadrado en Parral con atribución y escala | P0 | T-ATL-01 | hecha, sin fusionar (rama `atlas/mapa-base`) |
| T-ATL-03 | [P] Capas `state`, `change_hh` y `change_hv` con leyenda y trama de lo no observable | P0 | T-ATL-02 | hecha, sin fusionar (rama `atlas/mapa-base`); falta probarla con teselas reales de la API |
| T-ATL-04 | [P] Selección de punto con 5 decimales y serie por píxel | P0 | T-ATL-02 | hecha, sin fusionar (rama `atlas/mapa-base`); falta probarla con la API real |
| T-ATL-05 | Publicar la interfaz del mapa para Faro | P0 | T-ATL-03 | pendiente |
| T-ATL-06 | Línea de tiempo de pasadas, hueco y eventos | P1 | T-ANT-04 | pendiente |
| T-ATL-07 | Comparador deslizante radar frente a óptico | P1 | T-BAL-04 | en curso (rama `atlas/mapa-base`): deslizador y panel hechos con teselas de prueba; falta la API con el PR 19 |
| T-ATL-08 | Límites de zoom y rendimiento | P2 | T-ATL-03 | pendiente |

## Ola 2: acceso, búsqueda e interfaz

Propuesta del 2026-11-14, pendiente de aprobación. Especificaciones en [06-acceso](../06-acceso/spec.md), [07-busqueda](../07-busqueda/spec.md) y [08-interfaz](../08-interfaz/spec.md). Prioridades de esta ola en [specs/README.md](../README.md#prioridades-de-la-ola-2).

| ID | Tarea | Prioridad | Depende de | Estado |
|---|---|---|---|---|
| T-ATL-09 | [P] Globo 3D con `setProjection` y el tipo `'globe'` de MapLibre 6.16.0 (comprobado en sus tipos el 2026-11-14), transición a plano al acercarse con una expresión por zoom (probarla en el navegador y anotarla en MEMORY) y caída a 2D si no hay soporte (RF-INT-10 y 17) | P0 | — | pendiente |
| T-ATL-10 | Botón 2D/3D, escala oculta con inclinación y aviso de perspectiva, misma selección de punto en 3D y teclado para girar e inclinar (RF-INT-11, 13 a 15) | P0 | T-ATL-09 | pendiente |
| T-ATL-11 | Interfaz `crearMapa` ampliada con opciones opcionales, publicada en `plan.md` (RF-INT-19) | P0 | T-ATL-09 | pendiente |
| T-ATL-12 | Relieve GLO-30 con exageración declarada y atribución de Copernicus DEM (RF-INT-12) | P1 | T-ATL-10, T-BAL-15 | pendiente |
| T-ATL-13 | Caja de la zona y huellas de las series en el globo (RF-INT-16) | P1 | T-ANT-17 | pendiente |
| T-ATL-14 | Rectángulo de búsqueda (`onBboxDrawn`) y capa de resultados (RF-INT-18) | P1 | T-ATL-11, T-BAL-17 | pendiente |
