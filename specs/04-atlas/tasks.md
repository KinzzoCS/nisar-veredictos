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
