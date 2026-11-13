# Antena — tareas

| ID | Tarea | Prioridad | Depende de | Estado |
|---|---|---|---|---|
| T-ANT-01 | Series comparables desde CMR | — | — | hecha |
| T-ANT-02 | Servicio `ingest` con lectura por recorte | P0 | — | hecha (PR 2) |
| T-ANT-03 | Prueba real con `--limit 2`: medir MB, segundos y RAM, y anotarlo en MEMORY | P0 | Cuenta de Earthdata, T-ANT-02 | hecha |
| T-ANT-04 | [P] `GET /aois/{id}/timeline` con pasadas UTC, intervalos, huecos y latencia | P0 | — | hecha (PR 5) |
| T-ANT-05 | [P] `GET /aois/{id}/references/optical` con Sentinel-2 L2A de Earth Search | P1 | — | hecha (PR 7) |
| T-ANT-06 | [P] `GET /aois/{id}/references/opera` con DSWx-S1 a ±N días, agrupado por pasada y sin versiones repetidas (diseño en `plan.md`) | P1 | — | hecha |
| T-ANT-07 | Registro de ingesta por serie (`ingest.json`) | P1 | T-ANT-02 | hecha |
| T-ANT-08 | Ingesta de la serie T171 descendente | P1 | T-ANT-03 | hecha |
| T-ANT-09 | Siguiente pasada con el plan de observación de NISAR (`NISAR_COP`): `ingest plan` y `observation_plan` en la línea de tiempo (diseño en `plan.md`) | P2 | — | hecha |
| T-ANT-10 | Excluir gránulos defectuosos declarados en la zona (T171 del 2026-08-13) | P0 | — | hecha |
| T-ANT-11 | Copiar `radarGrid` al recorte para que Eco marque layover y sombra (T-ECO-05) | P0 | — | hecha |
| T-ANT-12 | Cerrar los criterios de horas UTC en ISO 8601 y de 502 ante fallos externos | P1 | — | hecha |
| T-ANT-13 | Sacar la caja de cada tesela OPERA (`bbox`) en `/references/opera`, para que Atlas sitúe `browse_url` en el mapa | P1 | T-ANT-06 | hecha |
