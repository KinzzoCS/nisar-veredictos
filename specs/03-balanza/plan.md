# Balanza — plan técnico

## Diseño

- **Frescura.** `receipt.freshness.before` y `.after` con `acquired_at`, `published_at`, `publication_latency_hours`, `latency_status` y `age_days` respecto a `reference_date` (hoy, en UTC). `interval_days` se calcula a partir de las fechas del par. La hora y la latencia salen de `GET /aois/{id}/timeline` de catalog por HTTP (`CATALOG_URL`), cruzadas por id de gránulo, con caché de 10 minutos y tiempo de espera de 3 s. Si catalog no responde, el veredicto sale igual con `latency_status: catalog_unavailable`; con datos sintéticos no se consulta (`synthetic`).
- **Textos.** `summary.detected` dice los días entre fechas; `summary.missing` explica el hueco cuando lo cruza y da la edad de la imagen más reciente y su latencia, o por qué no se conoce.
- **Contraste óptico.** `verdicts` pide a `catalog` las escenas Sentinel-2 del rango y elige la más cercana antes y después con nubosidad ≤ 30 %. Expone `evidence.optical.before` y `.after` con plantilla de tesela, fecha, nubosidad y licencia. Si no hay escena válida, lo dice. `verdicts` se comunica con `catalog` solo por HTTP.
- **Lenguaje.** `services/verdicts/tests/test_language.py` revisa dos cosas con la lista `FORBIDDEN` (confirmar, causado/provocado por, causas en voz activa como "causó", "provocaron" o "caused", debido a, se debe a, a causa de, because of, daño, destrucción y expresiones de certeza, en ES y EN, sin distinguir mayúsculas ni tildes): todos los literales de `narrative.py` y `main.py` salvo docstrings, y todos los resúmenes renderizados con cada combinación de estado, causa, tipo de par, hueco, latencia, idioma y sintético. La palabra prohibida falla aunque vaya en negación; los avisos se redactan sin ella ("ni mide sus consecuencias"). Las excepciones van en `ALLOWED` con su motivo, hoy vacía. Otra prueba exige el prefijo sintético al inicio de `detected` y en ningún otro campo.
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
