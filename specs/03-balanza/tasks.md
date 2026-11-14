# Balanza — tareas

| ID | Tarea | Prioridad | Depende de | Estado |
|---|---|---|---|---|
| T-BAL-01 | Veredictos, eventos, serie por píxel y gateway | — | — | hecha |
| T-BAL-02 | [P] `interval_days` y frescura en el veredicto y en los textos | P0 | — | hecha |
| T-BAL-03 | [P] Prueba de lenguaje prohibido en ES y EN | P0 | — | hecha |
| T-BAL-04 | Contraste óptico Sentinel-2 en el veredicto y ampliación del gateway | P0 | T-ANT-05 | hecha |
| T-BAL-05 | Prueba de humo con todas las rutas nuevas | P0 | T-ANT-04, T-BAL-04 | hecha |
| T-BAL-06 | Eventos con horas UTC y persistencias declaradas | P1 | T-ANT-04 | hecha |
| T-BAL-07 | Reflejar las banderas de calidad de Eco en textos y recibo, y avisar del desplazamiento de la escena | P1 | T-ECO-03 | hecha |
| T-BAL-08 | Contraste con OPERA DSWx-S1 | P1 | T-ANT-06, cuenta de Earthdata | hecha; probada con radar real y token el 2026-11-12 |
| T-BAL-09 | Calibrar reglas con datos reales | P1 | T-ECO-07 | hecha: 5 % fijado con el ruido de 16 pares reales; el resto queda como supuesto declarado |

## Ola 2: acceso, búsqueda e interfaz

Aprobada el 2026-11-14 por las cinco personas (PR 66). Especificaciones en [06-acceso](../06-acceso/spec.md), [07-busqueda](../07-busqueda/spec.md) y [08-interfaz](../08-interfaz/spec.md). Prioridades de esta ola en [specs/README.md](../README.md#prioridades-de-la-ola-2).

| ID | Tarea | Prioridad | Depende de | Estado |
|---|---|---|---|---|
| T-BAL-10 | Gateway con `auth_request`, cabeceras `X-Auth-*` de confianza, POST solo en `/api/auth/` (la comprobación del método pasa del `server` a cada `location`), CORS con `Authorization` nombrada, `AUTH_ENABLED` (0 por omisión) con `auth-on.conf`/`auth-off.conf` en plantilla, y servicio `auth` en el compose (RF-ACC-05 a 07 y 10) | P0 | T-ANT-14 | pendiente |
| T-BAL-11 | [P] `GET /search/verdicts`: índice que calcula todos los veredictos al arrancar (hoy no se calculan), `water: not_available` mientras falte el contraste con OPERA, filtros, orden, cursor y permisos por perfil (RF-BUS-01, 03 a 05) | P0 | — | hecha: el gateway ya borra `X-Auth-*` del cliente, así que hasta T-BAL-10 la ruta responde 403 a todos |
| T-BAL-12 | Cuotas por perfil en el gateway solo en las rutas nuevas, y cuota estricta por IP en `login` y `register`, medidas con la pila (RF-ACC-09) | P1 | T-BAL-10 | pendiente |
| T-BAL-13 | Exportación CSV, GeoJSON y JSON con recibo, en streaming (RF-BUS-06) | P1 | T-BAL-11 | pendiente |
| T-BAL-14 | `evidence.noise` en el veredicto y filtro y orden por dispersión (RF-BUS-09) | P1 | T-ECO-09 (su cambio de esquema se fusiona antes que cualquier manifiesto con `noise_*`: `stats` tiene `additionalProperties: false`) | pendiente |
| T-BAL-15 | Plantilla de relieve en la API y paso de `algorithm=terrainrgb` por el gateway (RF-INT-12) | P1 | T-ECO-10 | pendiente |
| T-BAL-16 | Prueba de humo de acceso: rutas de `auth`, 401 (también en una ruta actual), 403, 429 en una ruta nueva y en `login`, rutas actuales sin cuota, CORS con `Authorization`, cabecera falsificada y cuerpos idénticos con los tres perfiles | P0 | T-BAL-10 | pendiente |
| T-BAL-17 | Texto libre (FTS5) y filtro por `bbox` con la huella de la serie (RF-BUS-02 y 10) | P1 | T-BAL-11, T-ANT-17 | pendiente |
| T-BAL-18 | Fracción de cambio dentro de un rectángulo con las celdas de Eco, ponderada por su `observed_fraction` (RF-BUS-10) | P2 | T-ECO-12, T-BAL-17 | pendiente |
