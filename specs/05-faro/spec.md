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

## Interfaces

- **Consume:** API de veredictos y la interfaz del mapa de Atlas.
- **Produce:** aplicación web y materiales de la demo.

## Fuera de alcance

- Renderizar capas o calcular coordenadas, que es trabajo de Atlas.
- Redactar los textos del veredicto, que vienen de la API (Balanza). Faro puede proponer cambios a Balanza.

## Preguntas abiertas

- ¿Qué framework usamos? Se decide con Atlas en T-FAR-01.
- ¿La demo se presenta en vivo o grabada?
