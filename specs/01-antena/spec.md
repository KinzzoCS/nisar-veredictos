# Antena — ingesta y tiempo: especificación

- **Responsable:** @KinzzoCS
- **Estado:** aprobada para el hackathon

## Misión

Alimentar el sistema con los datos correctos y decir con exactitud **cuándo** existen: qué pasadas hay, cada cuánto, con qué huecos y con qué retraso se publican. Antena es la única puerta de entrada de datos externos.

## Alcance

- `services/catalog`, `services/ingest` y `config/aois/`.
- Contratos `contracts/catalog.openapi.json` y `contracts/gcov-subset.md`.

## Historias de usuario

- Como Eco, quiero recortes GCOV de una serie comparable para procesarlos sin descargar gránulos completos.
- Como Balanza, quiero las pasadas con hora UTC para decidir si un evento pudo observarse.
- Como Balanza y Atlas, quiero escenas ópticas y referencias OPERA cercanas a cada fecha para contrastar el radar.
- Como jurado, quiero saber la edad y la latencia de cada dato para juzgar su vigencia.

## Requisitos

| ID | Requisito | Prioridad |
|---|---|---|
| RF-ANT-01 | Listar series comparables por zona sin mezclar pista, dirección, marco, modo, polarización ni CRID | Hecho |
| RF-ANT-02 | Traer por HTTPS solo el recorte de la zona, de forma reanudable y sin exponer el token | P0 |
| RF-ANT-03 | Publicar una línea de tiempo por zona: pasadas con hora UTC, intervalo en días, huecos y latencia de publicación | P0 |
| RF-ANT-04 | Estimar la siguiente pasada y marcarla como estimación | P1 |
| RF-ANT-05 | Listar escenas Sentinel-2 L2A por fecha, dentro de ±N días y con nubosidad máxima configurable | P1 |
| RF-ANT-06 | Listar productos OPERA DSWx-S1 a ±7 días de cada fecha NISAR | P1 |
| RF-ANT-07 | Dejar un registro de ingesta por serie: gránulo, bytes, segundos y fecha de publicación | P1 |

## Criterios de aceptación

- [ ] `ingest fetch --limit 2` con un token real deja dos recortes que `processor run` procesa sin errores.
- [ ] La línea de tiempo de Parral muestra el hueco del 27 de julio al 10 de agosto y un intervalo de 24 días a su través.
- [ ] Todas las horas de la API están en UTC con formato ISO 8601.
- [ ] Un fallo del catálogo externo devuelve un 502 claro, nunca datos parciales sin aviso.
- [ ] Las fuentes ópticas no requieren cuenta y su licencia queda citada.

## Interfaces

- **Consume:** NASA CMR (público), NASA Earthdata (token), Earth Search STAC para Sentinel-2 (público).
- **Produce:** API de catálogo y recortes GCOV en `data/raw/real/`.

## Fuera de alcance

- Procesar o modificar valores radar, que es trabajo de Eco.
- Decidir veredictos, que es trabajo de Balanza.

## Preguntas abiertas

- ¿Ofrece ASF el plan de observación en un formato legible por máquina, para RF-ANT-04?
- ¿Qué nubosidad máxima es útil en el monzón de Chihuahua?
