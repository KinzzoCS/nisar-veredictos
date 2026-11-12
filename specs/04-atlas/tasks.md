# Atlas — tareas

| ID | Tarea | Prioridad | Depende de | Estado |
|---|---|---|---|---|
| T-ATL-01 | [P] Elegir biblioteca y mapa base, comprobar licencias y acordar con Faro la carpeta del mapa | P0 | — | hecha: MapLibre y OSM; Faro confirmó `frontend/src/mapa/` el 2026-11-12 |
| T-ATL-02 | [P] Mapa base encuadrado en Parral con atribución y escala | P0 | T-ATL-01 | hecha, sin fusionar (rama `atlas/mapa-base`) |
| T-ATL-03 | [P] Capas `state`, `change_hh` y `change_hv` con leyenda y trama de lo no observable | P0 | T-ATL-02 | hecha, sin fusionar (rama `atlas/mapa-base`); falta probarla con teselas reales de la API |
| T-ATL-04 | [P] Selección de punto con 5 decimales y serie por píxel | P0 | T-ATL-02 | hecha, sin fusionar (rama `atlas/mapa-base`); falta probarla con la API real |
| T-ATL-05 | Publicar la interfaz del mapa para Faro | P0 | T-ATL-03 | pendiente |
| T-ATL-06 | Línea de tiempo de pasadas, hueco y eventos | P1 | T-ANT-04 | pendiente |
| T-ATL-07 | Comparador deslizante radar frente a óptico | P1 | T-BAL-04 | pendiente |
| T-ATL-08 | Límites de zoom y rendimiento | P2 | T-ATL-03 | pendiente |
