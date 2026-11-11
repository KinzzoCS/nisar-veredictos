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
Antena   NASA CMR / Earthdata ──> catalog + ingest ──> recortes GCOV
Eco      recortes ──> processor ──> COG + manifiesto
Balanza  manifiesto ──> verdicts + tiles + gateway ──> API
Atlas    API ──> mapa
Faro     API + mapa ──> experiencia y relato
```

## Equipo

Trabajamos con desarrollo guiado por especificaciones: primero [la especificación](specs/README.md), después el código.

| Rol | Persona | Se encarga de |
|---|---|---|
| Antena | @KinzzoCS | Ingesta, catálogo y cálculos de tiempo |
| Eco | @TakoKami-dev | Control de calidad, cálculo de cambio y georreferencia |
| Balanza | @sanchezelvin69305 | Interpretación, veracidad, contraste e integración |
| Atlas | @Fransomware | Mapa y representación web |
| Faro | @danielsanchez-033 | UI/UX, relato y demo |

- Principios no negociables: [specs/constitution.md](specs/constitution.md).
- Commits, ramas y PR: [CONTRIBUTING.md](CONTRIBUTING.md).
- Decisiones y hechos verificados: [MEMORY.md](MEMORY.md).
- Guía para agentes de IA: [AGENTS.md](AGENTS.md).

## Licencia

Copyright (C) 2026 colaboradores de NISAR Veredictos. Software libre bajo [GPL-3.0-only](LICENSE).

Los datos NISAR son de NASA e ISRO. Cada fuente externa (OPERA, Copernicus Sentinel-2, DEM y mapa base) se atribuye donde se muestra.

## Datos reales

Con gránulos `.h5` ya descargados en una carpeta:

```bash
python -m processor --aoi-dir config/aois --data-dir data run --aoi parral --series T048A-F015 --input RUTA
```
