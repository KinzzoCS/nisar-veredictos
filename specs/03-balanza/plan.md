# Balanza — plan técnico

## Diseño

- **Frescura.** `receipt.freshness` con `acquired_at` de cada fecha, `age_days` respecto a hoy y `publication_latency_hours` cuando Antena la publique. `interval_days` se calcula a partir de las fechas del par.
- **Contraste óptico.** `verdicts` pide a `catalog` las escenas Sentinel-2 del rango y elige la más cercana antes y después con nubosidad ≤ 30 %. Expone `evidence.optical.before` y `.after` con plantilla de tesela, fecha, nubosidad y licencia. Si no hay escena válida, lo dice. `verdicts` se comunica con `catalog` solo por HTTP.
- **Lenguaje.** Prueba que recorre todas las plantillas en ES y EN con una lista de expresiones prohibidas, más una prueba de que todo texto sintético lleva su prefijo.
- **Eventos.** Tabla de persistencias supuestas (tormenta urbana 6 h, crecida de río 72 h e incendio 240 h, todas iniciales), devueltas en la respuesta como `assumption`.

## Interfaces y contratos

Cambios aditivos de `contracts/verdicts.openapi.json`: `interval_days`, `receipt.freshness`, `evidence.optical` y `assumption` en eventos. Hay que avisar a Atlas y a Faro.

## Gateway

Se amplía la lista de URLs permitidas en `/tiles/cog/` con `https://sentinel-cogs.s3.us-west-2.amazonaws.com/`. Todo lo demás sigue bloqueado.

## Pruebas

- Prueba de humo ampliada con las nuevas rutas.
- Caso de Parral: tormenta del 1 de julio, par que cruza el hueco y par sin óptico disponible.

## Riesgos

- El óptico en monzón puede estar casi siempre nublado. Entonces se muestra la mejor escena disponible con su nubosidad, nunca se oculta el dato.
