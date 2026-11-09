# NISAR Veredictos

Convierte datos radar NISAR en respuestas claras sobre cambios en la superficie: qué cambió, qué no se detectó y qué no se puede saber.

> Los datos actuales son **sintéticos**. Prueban el sistema y no describen ningún lugar real.

## Arranque rápido

Necesitas Docker con su motor en marcha.

```bash
docker compose up --build
```

La API queda en `http://localhost:8080`:

| Ruta | Servicio |
|---|---|
| `/api/verdicts/docs` | Veredictos, eventos y serie por píxel |
| `/api/catalog/docs` | Zonas y series comparables en NASA CMR |
| `/tiles/cog/...` | Teselas; la API entrega las URLs ya construidas |

Ejemplo, la tormenta del 1 de julio en Parral:

```bash
curl "http://localhost:8080/api/verdicts/aois/parral/events?date=2026-07-01"
```

## Cómo fluye

```
NASA CMR ──> catalog            series comparables
GCOV .h5 ──> processor ──> data/artifacts (COG + manifiesto)
                                  │
                                  ├──> verdicts  veredictos y textos
                                  └──> tiles     teselas de mapa
              gateway ──> frontend
```

## Equipo

Cada servicio tiene un responsable y se prueba por separado. Las reglas están en [AGENTS.md](AGENTS.md), las decisiones y hechos en [MEMORY.md](MEMORY.md), y la guía de consumo de la API en [frontend/README.md](frontend/README.md).

## Datos reales

Con gránulos `.h5` ya descargados en una carpeta:

```bash
python -m processor --aoi-dir config/aois --data-dir data run --aoi parral --series T048A-F015 --input RUTA
```
