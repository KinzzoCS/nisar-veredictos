# Eco — tareas

| ID | Tarea | Prioridad | Depende de | Estado |
|---|---|---|---|---|
| T-ECO-01 | Detección de cambio, estados y COGs | — | — | hecha |
| T-ECO-02 | [P] Procesar por pares, sin todas las fechas en memoria, y medir la RAM | P0 | — | hecha (PR 12) |
| T-ECO-03 | [P] Control de calidad por fecha en el manifiesto (`dates[].qa`) | P0 | Visto bueno de Balanza al contrato | hecha (PR 8) |
| T-ECO-04 | [P] Modo y polarización desde los metadatos del producto | P0 | — | hecha (PR 13) |
| T-ECO-05 | Layover y sombra con DEM GLO-30 (estado 15) | P1 | `radarGrid` en el recorte (PR 23 y 25) | hecha (PR 24) |
| T-ECO-06 | Verificar la georreferencia con La Boquilla frente a Sentinel-2 | P1 | Datos reales, T-ANT-05 | hecha (PR 21) |
| T-ECO-07 | Calibrar umbrales con datos reales | P1 | T-ANT-03, acuerdo con Balanza | hecha |
| T-ECO-08 | Filtro multitemporal opcional | P2 | T-ECO-02 | hecha |

## Ola 2: acceso, búsqueda e interfaz

Propuesta del 2026-11-14, pendiente de aprobación. Especificaciones en [06-acceso](../06-acceso/spec.md), [07-busqueda](../07-busqueda/spec.md) y [08-interfaz](../08-interfaz/spec.md). Prioridades de esta ola en [specs/README.md](../README.md#prioridades-de-la-ola-2).

| ID | Tarea | Prioridad | Depende de | Estado |
|---|---|---|---|---|
| T-ECO-09 | [P] Ruido por par en el manifiesto: `stats.noise_hh_db` y `stats.noise_hv_db` (1,4826 · MAD de la diferencia corregida), opcionales (RF-BUS-08) | P1 | — | pendiente |
| T-ECO-10 | [P] Publicar el DEM GLO-30 de la zona como COG en `artifacts/<aoi>/dem.tif` y declararlo en el manifiesto con un campo opcional (RF-INT-12) | P1 | — | pendiente |
| T-ECO-11 | Revisar la exactitud física de las explicaciones de la vista Estudiante (dB, HH y HV, ruido, looks, layover) | P1 | T-FAR-13 | pendiente |
| T-ECO-12 | Fracción de cambio por celda de 1 km como GeoJSON en `artifacts`, para buscar por rectángulo sin leer el COG en cada consulta (RF-BUS-10) | P2 | — | pendiente |
