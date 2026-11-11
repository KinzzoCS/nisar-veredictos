# Balanza — interpretación y veracidad: especificación

- **Responsable:** @sanchezelvin69305
- **Estado:** aprobada para el hackathon

## Misión

Convertir mediciones en respuestas que una persona entienda **y pueda comprobar**. Balanza decide el veredicto, redacta los textos, contrasta con fuentes independientes y vigila que nada de lo que se muestra exceda lo que el dato sostiene. Además integra la pila: gateway, teselas y compose.

## Alcance

- `services/verdicts`, `gateway/`, `docker-compose.yml` y `scripts/`.
- Contrato `contracts/verdicts.openapi.json`, y la aprobación del manifiesto junto a Eco.

## Historias de usuario

- Como persona usuaria, quiero saber cuántos días separan las imágenes y qué edad tienen los datos.
- Como persona usuaria, quiero ver una imagen óptica de antes y de después para entender el cambio.
- Como periodista, quiero saber si un evento concreto pudo verse y por qué.
- Como jurado, quiero que ningún texto afirme más de lo que el dato prueba.

## Requisitos

| ID | Requisito | Prioridad |
|---|---|---|
| RF-BAL-01 | Veredicto en tres estados con recibo, evidencia y textos ES/EN | Hecho |
| RF-BAL-02 | Cada veredicto informa `interval_days` y la frescura del dato (edad y latencia), y los textos lo mencionan | P0 |
| RF-BAL-03 | Prueba automática de lenguaje: ninguna plantilla afirma causas, daños ni confirmaciones | P0 |
| RF-BAL-04 | Contraste óptico: escena Sentinel-2 anterior y posterior más cercana, con URL de tesela y licencia | P0 |
| RF-BAL-05 | La prueba de humo cubre todas las rutas nuevas, incluidas las de Antena | P0 |
| RF-BAL-06 | Eventos con las horas UTC de la línea de tiempo y persistencias por tipo de evento declaradas como supuestos | P1 |
| RF-BAL-07 | Contraste con OPERA DSWx-S1: acuerdo o desacuerdo sobre agua, presentado como desacuerdo y no como error | P1 |
| RF-BAL-08 | Calibrar reglas con datos reales junto a Eco | P1 |
| RF-BAL-09 | Las fechas con bandera de calidad de Eco se reflejan en el texto y en el recibo | P1 |

## Criterios de aceptación

- [ ] Un par que cruza el hueco de agosto dice "24 días" y lo explica.
- [ ] La prueba de lenguaje falla si una plantilla contiene "confirmado", "causado por" o "daño".
- [ ] El gateway solo deja pasar a TiTiler artefactos propios y el host público de COG de Sentinel-2.
- [ ] Ningún veredicto se emite sin `data_kind`.

## Interfaces

- **Consume:** manifiesto de Eco y API de catálogo de Antena (línea de tiempo y referencias).
- **Produce:** API de veredictos, teselas y entrada única en el puerto 8080.

## Fuera de alcance

- Diseño visual, que es trabajo de Atlas y Faro.
- Calcular el cambio, que es trabajo de Eco.

## Preguntas abiertas

- ¿Qué persistencia suponemos para una tormenta urbana frente a una crecida de río? Debe declararse en la respuesta.
- ¿Qué hacemos si el óptico más cercano está a más de 10 días o muy nublado?
