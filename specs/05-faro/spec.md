# Faro — relato y experiencia: especificación

- **Responsable:** @danielsanchez-033
- **Estado:** aprobada para el hackathon

## Misión

Que cualquier persona entienda en menos de un minuto qué pasó, qué no sabemos y por qué confiar en la respuesta. Faro diseña la experiencia completa, la historia de Parral y la presentación ante el jurado.

## Alcance

- Toda la aplicación de `frontend/` salvo el módulo de mapa de Atlas: estructura, navegación, tarjetas, formularios, textos de interfaz, idiomas y accesibilidad.
- Guion y materiales de la demo.

## Historias de usuario

- Como persona sin formación técnica, quiero una respuesta en una frase y poder ampliar los detalles si los necesito.
- Como habitante de Parral, quiero preguntar por la tormenta del 1 de julio y entender por qué el satélite no la vio.
- Como jurado, quiero ver en tres pasos el valor del producto y abrir el recibo de cualquier afirmación.
- Como persona que usa lector de pantalla o teclado, quiero usar la aplicación completa.

## Requisitos

| ID | Requisito | Prioridad |
|---|---|---|
| RF-FAR-01 | Tarjeta de veredicto: estado, "qué detectamos", "qué no prueba", "qué falta", hipótesis y recibo desplegable | P0 |
| RF-FAR-02 | Consulta de evento: fecha y tipo de evento, con la respuesta y sus supuestos | P0 |
| RF-FAR-03 | Distintivo permanente cuando los datos son sintéticos | P0 |
| RF-FAR-04 | Modo historia de Parral en tres escenas: tormenta no observable, cambio en el monzón y estabilidad de los jales | P1 |
| RF-FAR-05 | Español e inglés en toda la interfaz | P1 |
| RF-FAR-06 | WCAG 2.1 AA: contraste, teclado, foco visible y estados no solo por color | P1 |
| RF-FAR-07 | Glosario y explicación breve de cómo ve el radar | P1 |
| RF-FAR-08 | Guion de demo de 3 minutos y material para el jurado | P1 |
| RF-FAR-09 | Prueba rápida con 3 a 5 personas y ajustes resultantes | P2 |

## Criterios de aceptación

- [ ] La tarjeta muestra siempre los tres textos juntos, nunca solo "qué detectamos".
- [ ] `not_observable` tiene su propio estilo y texto, distinto de "sin cambio".
- [ ] Ningún texto de interfaz afirma más que la API.
- [ ] La demo completa funciona solo con teclado.

### Tarjeta de veredicto (T-FAR-02) y distintivo de datos sintéticos (T-FAR-04)

Consume `GET /aois/{aoi}/series` y `GET /aois/{aoi}/series/{series_id}/verdicts?lang=`. Los textos del veredicto se muestran tal como llegan de la API: Faro solo pone rótulos.

- [x] La persona elige la serie y el par de fechas con controles nativos (`select`) que tienen rótulo y se usan con teclado. Al abrir, se elige el primer par consecutivo de la primera serie.
- [x] El encabezado de la tarjeta dice el estado en una frase, con un icono distinto por estado y el texto escrito, nunca solo con color: "Cambio probable", "Sin cambio detectable" y "No observable".
- [x] `not_observable` tiene un estilo propio (borde discontinuo y trama), distinto de `no_detectable_change`, y muestra `cause_label` junto al estado.
- [x] Bajo el estado se ven las fechas y `interval_days` ("del 2026-06-17 al 2026-06-29 · 12 días").
- [x] "Qué detectamos", "Qué no prueba" y "Qué falta" (`summary.detected`, `summary.does_not_prove` y `summary.missing`) salen siempre juntos y visibles, sin plegar.
- [x] Las hipótesis salen en una lista con el rótulo "Hipótesis, no conclusiones" solo si `hypotheses` no está vacío.
- [x] El recibo va plegado en un `details` nativo y muestra: tipo de datos, madurez, serie (pista, dirección y marco), modo y polarización, CRID, gránulos, si cruza el hueco de adquisición, avisos (`notices`), la frescura de cada pasada (antigüedad en días y latencia de publicación o su motivo) y el texto del contraste óptico (`evidence.optical.text`).
- [x] Al cambiar de idioma se vuelven a pedir los veredictos con el `lang` nuevo.
- [x] Si la API falla, se avisa con `role="alert"` sin mostrar un veredicto viejo como si fuera actual.
- [x] **Distintivo de datos sintéticos:** si la serie elegida o el recibo tiene `data_kind: synthetic`, se muestra en la cabecera de la página un aviso fijo, que no se puede cerrar, y otro dentro de la tarjeta. El texto dice que los datos son sintéticos y que no describen Parral. Con datos reales no aparece.
- [x] Ningún texto de interfaz en `src/i18n/` usa las palabras que prohíbe la prueba de lenguaje de Balanza (`services/verdicts/tests/test_language.py`): una prueba del frontend lo comprueba.

Fuera de esta entrega: el mapa (T-FAR-05), la consulta de evento (T-FAR-03), la serie por píxel, el comparador óptico (Atlas) y la auditoría WCAG completa (T-FAR-07). Se cuidan desde ya el teclado, el foco visible y los estados no solo por color.

## Interfaces

- **Consume:** API de veredictos y la interfaz del mapa de Atlas.
- **Produce:** aplicación web y materiales de la demo.

## Fuera de alcance

- Renderizar capas o calcular coordenadas, que es trabajo de Atlas.
- Redactar los textos del veredicto, que vienen de la API (Balanza). Faro puede proponer cambios a Balanza.

## Preguntas abiertas

- ¿Qué framework usamos? Se decide con Atlas en T-FAR-01.
- ¿La demo se presenta en vivo o grabada?
