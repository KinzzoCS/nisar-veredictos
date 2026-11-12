# Balanza — plan técnico

## Diseño

- **Frescura.** `receipt.freshness.before` y `.after` con `acquired_at`, `published_at`, `publication_latency_hours`, `latency_status` y `age_days` respecto a `reference_date` (hoy, en UTC). `interval_days` se calcula a partir de las fechas del par. La hora y la latencia salen de `GET /aois/{id}/timeline` de catalog por HTTP (`CATALOG_URL`), cruzadas por id de gránulo, con caché de 10 minutos y tiempo de espera de 3 s. Si catalog no responde, el veredicto sale igual con `latency_status: catalog_unavailable`; con datos sintéticos no se consulta (`synthetic`).
- **Textos.** `summary.detected` dice los días entre fechas; `summary.missing` explica el hueco cuando lo cruza y da la edad de la imagen más reciente y su latencia, o por qué no se conoce.
- **Contraste óptico.** `verdicts` pide a `GET /aois/{id}/references/optical` de catalog, por HTTP, todas las escenas a ±10 días de cada fecha del par (`max_cloud=100`), en paralelo, con caché de 1 hora y espera de 15 s. *Antes* es la escena más cercana a `from` que no es posterior a la pasada; *después*, la más cercana a `to` que no es anterior. Si se conoce la hora UTC de la pasada (datos reales), se compara al segundo; si no, por día UTC. Se prefiere la que cubre la zona con nubosidad ≤ 30 % por tesela (`clear`); si no hay, la menos nublada que la cubre (`cloudy`); si ninguna la cubre, la menos nublada (`partial_coverage`). Sin escenas, `none_in_window`; sin catalog, `catalog_unavailable`. `evidence.optical` lleva `before` y `.after` con fecha, días respecto al radar, nubosidad, cobertura, atribución y una plantilla de tesela por cada tesela MGRS; además licencia, fuente, los umbrales usados y un `text` en el idioma pedido. Las escenas se buscan también con datos sintéticos, porque las fechas son pasadas reales, y declaran `data_kind: real`.
- **Lenguaje.** `services/verdicts/tests/test_language.py` revisa dos cosas con la lista `FORBIDDEN` (confirmar, causado/provocado por, causas en voz activa como "causó", "provocaron" o "caused", debido a, se debe a, a causa de, because of, daño, destrucción y expresiones de certeza, en ES y EN, sin distinguir mayúsculas ni tildes): todos los literales de `narrative.py` y `main.py` salvo docstrings, y todos los resúmenes renderizados con cada combinación de estado, causa, tipo de par, hueco, latencia, idioma y sintético. La palabra prohibida falla aunque vaya en negación; los avisos se redactan sin ella ("ni mide sus consecuencias"). Las excepciones van en `ALLOWED` con su motivo, hoy vacía. Otra prueba exige el prefijo sintético al inicio de `detected` y en ningún otro campo.
- **Eventos en horas.** `event_status` compara en horas UTC, no por fechas. El evento empieza a la hora `time` (opcional) o en cualquier momento de su día UTC. Cada pasada cae a su hora de la línea de tiempo de catalog (datos reales) o en cualquier momento de su día. `observable` exige que alguna pasada caiga dentro de la duración en todos los casos posibles; si solo cae en algunos, `not_observable` con causa `timing_uncertain`. `observable` es la respuesta a otra pregunta que los tres estados de los pares (si hubo pasada durante el evento) y no afirma cambio; se mantiene en el contrato y se documenta en la descripción del campo.
- **Eventos.** Tabla de persistencias supuestas en `rules.PERSISTENCE_BY_EVENT_TYPE` (tormenta urbana 6 h, crecida de río 72 h e incendio 240 h, todas iniciales y sin calibrar). `GET /aois/{id}/events` acepta `event_type` opcional; `persistence_hours`, si se da, manda sobre el tipo, y sin ninguno de los dos se usan 24 h. La respuesta añade `event_type` y `assumption` con las horas usadas, su origen (`event_type`, `user` o `default`), `calibrated: false`, la tabla completa y un `text` en el idioma pedido que empieza por "Supuesto:" / "Assumption:" y se añade también a `summary.does_not_prove`. Un tipo desconocido responde 422.

## Interfaces y contratos

Cambios aditivos de `contracts/verdicts.openapi.json`: `interval_days`, `receipt.freshness`, `evidence.optical` y `assumption` en eventos. Hay que avisar a Atlas y a Faro.

## Gateway

`/tiles/cog/` solo deja pasar un `url=` que empiece, codificado, por `file:///data/artifacts/` o por `https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/`. Se rechazan también un segundo `url=` (sin distinguir mayúsculas) y cualquier nombre de parámetro codificado, como `ur%6C=`, porque nginx mira el primer `url=` y TiTiler el último. Todo lo demás sigue bloqueado. Fuera de su huella, una tesela MGRS responde 404: el mapa debe tratarlo como vacío.

## Pruebas

- Prueba de humo ampliada con las nuevas rutas.
- Caso de Parral: tormenta del 1 de julio, par que cruza el hueco y par sin óptico disponible.

## Riesgos

- El óptico en monzón puede estar casi siempre nublado. Entonces se muestra la mejor escena disponible con su nubosidad, nunca se oculta el dato.
