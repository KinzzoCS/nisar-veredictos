# Faro — tareas

| ID | Tarea | Prioridad | Depende de | Estado |
|---|---|---|---|---|
| T-FAR-01 | [P] Elegir framework con Atlas, crear la estructura de la app y generar tipos desde el contrato | P0 | — | hecha |
| T-FAR-02 | [P] Tarjeta de veredicto con los tres textos, hipótesis y recibo | P0 | T-FAR-01 | hecha (PR 50) |
| T-FAR-03 | [P] Consulta de evento | P0 | T-FAR-01 | hecha (PR 56) |
| T-FAR-04 | [P] Distintivo de datos sintéticos | P0 | T-FAR-01 | hecha (PR 50) |
| T-FAR-05 | Integrar el mapa de Atlas | P0 | T-ATL-05 | hecha (PR 52) |
| T-FAR-06 | Modo historia de Parral en tres escenas | P1 | T-FAR-02, T-FAR-03, T-FAR-05 | hecha (PR 57) |
| T-FAR-07 | Español e inglés, y WCAG 2.1 AA | P1 | T-FAR-02 | hecha (PR 69) |
| T-FAR-08 | Glosario y explicación del radar | P1 | — | hecha |
| T-FAR-09 | Guion de demo y material para el jurado | P1 | T-FAR-06 | hecha (PR 78) |
| T-FAR-10 | Prueba rápida con 3 a 5 personas | P2 | T-FAR-06 | pendiente |
| T-FAR-11 | Levantar el frontend con `docker compose up --build` en `http://localhost:3000` | P1 | T-FAR-05 | hecha |
| T-FAR-19 | Montar la línea de tiempo de Atlas bajo la respuesta de la consulta de evento: el timeline del catálogo se pide una vez por zona y la respuesta del evento se pasa tal cual; si el catálogo falla, la respuesta sale igual | P1 | T-ATL-06, T-FAR-03 | hecha |

## Ola 2: acceso, búsqueda e interfaz

Aprobada el 2026-11-14 por las cinco personas (PR 66). Especificaciones en [06-acceso](../06-acceso/spec.md), [07-busqueda](../07-busqueda/spec.md) y [08-interfaz](../08-interfaz/spec.md). Prioridades de esta ola en [specs/README.md](../README.md#prioridades-de-la-ola-2).

| ID | Tarea | Prioridad | Depende de | Estado |
|---|---|---|---|---|
| T-FAR-12 | [P] Sistema de diseño: variables, tema claro y oscuro, tipografía con licencia compatible y prueba de contraste (RF-INT-01) | P0 | — | pendiente |
| T-FAR-13 | Selector de vista y vista Público 80/20, con movimiento reducido (RF-INT-02, 03 y 09) | P0 | T-FAR-12 | pendiente |
| T-FAR-14 | Vista Estudiante con la explicación de cada campo de la evidencia, revisada por Eco (RF-INT-04) | P1 | T-FAR-13 | pendiente |
| T-FAR-15 | Vista Investigador: panel denso de evidencia, atajos y enlace al JSON (RF-INT-05) | P1 | T-FAR-13 | pendiente |
| T-FAR-16 | Inicio de sesión, registro, renovación silenciosa y cierre de sesión (RF-INT-06) | P1 | T-ANT-14, T-BAL-10 | pendiente |
| T-FAR-17 | Pantalla de búsqueda con `data_kind` por fila, exportación y explicación de los 403 (RF-INT-07) | P1 | T-BAL-11, T-FAR-16 | pendiente |
| T-FAR-18 | Medir el presupuesto de rendimiento y la auditoría axe en las tres vistas, en 2D y 3D (RF-INT-08) | P1 | T-FAR-13, T-ATL-10 | pendiente |
