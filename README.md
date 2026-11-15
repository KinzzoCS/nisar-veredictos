# NISAR Veredictos

Convierte datos radar NISAR en respuestas claras sobre cambios en la superficie: qué cambió, qué no se detectó y qué no se puede saber.

> **Datos reales y sintéticos.** Los datos no se suben al repositorio. Una copia recién clonada genera datos **sintéticos**, que prueban el sistema y no describen ningún lugar real. La demo usa dos series **reales** de NISAR sobre Hidalgo del Parral, que se traen con una cuenta de Earthdata (ver [Datos reales](#datos-reales)). Cada respuesta dice cuál es en `data_kind`, y la interfaz lo muestra.

## Arranque rápido

Necesitas Docker con su motor en marcha.

```bash
docker compose up --build
```

La aplicación queda en `http://localhost:3000`, y la API en `http://localhost:8080`:

| Ruta | Servicio |
|---|---|
| `/api/verdicts/docs` | Veredictos, eventos y serie por píxel |
| `/api/catalog/docs` | Zonas y series comparables en NASA CMR |
| `/api/research/docs` | Investigaciones: de una pregunta a una historia con evidencia ([docs/API.md](docs/API.md)) |
| `/tiles/cog/...` | Teselas; la API entrega las URLs ya construidas |

Ejemplo, la tormenta del 1 de julio en Parral:

```bash
curl "http://localhost:8080/api/verdicts/aois/parral/events?date=2026-07-01"
```

## Investigar con una pregunta

En la pestaña **Investigar** (o con la API) se escribe una pregunta, por ejemplo «¿Cómo ha cambiado el terreno
alrededor de las zonas mineras de Hidalgo del Parral entre 2016 y 2026?». El servicio `research` busca en el catálogo
de NASA qué datos existen (NISAR, Sentinel-1, OPERA, GPM, ICESat-2, GRACE-FO, HLS, MODIS), mide los cambios donde este
proyecto procesó NISAR, cruza acontecimientos verificados y escribe una historia de 17 capítulos en la que cada cifra
cita su evidencia. No afirma causas y dice lo que no se pudo medir. Detalle en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```bash
curl -X POST localhost:8080/api/research/research -H 'Content-Type: application/json'   -d '{"question": "Compara Parral y Jakobshavn durante 2026", "run": true}'
```

## Cómo fluye

```
Antena   NASA CMR / Earthdata ──> catalog + ingest ──> recortes GCOV
Eco      recortes ──> processor ──> COG + manifiesto
Balanza  manifiesto ──> verdicts + tiles + gateway ──> API
Atlas    API ──> mapa
Faro     API + mapa ──> experiencia y relato
research CMR + EONET + verdicts ──> investigación ──> historia con evidencia
```

## Equipo

Trabajamos con desarrollo guiado por especificaciones: primero [la especificación](specs/README.md), después el código.

| Rol | Persona | Se encarga de |
|---|---|---|
| Antena | @KinzzoCS | Ingesta, catálogo y cálculos de tiempo |
| Eco | @TakoKami-dev | Control de calidad, cálculo de cambio y georreferencia |
| Balanza | @lospapulindos2-netizen | Interpretación, veracidad, contraste e integración |
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

Crea un token en tu perfil de [Earthdata](https://urs.earthdata.nasa.gov/) y guárdalo en `.env` como `EARTHDATA_TOKEN` (copia `.env.example`). Nunca lo subas al repositorio.

Primero una prueba con dos fechas. `fetch` lee por HTTPS solo el recorte de la zona y guarda archivos pequeños; si se interrumpe, al repetirlo continúa donde iba.

```bash
docker compose run --rm fetch --aoi parral --series T048A-F015 --limit 2
```

Después se generan los artefactos. Esto reemplaza los sintéticos de esa serie:

```bash
docker compose run --rm process --aoi parral --series T048A-F015 --input /data/raw/real/parral/T048A-F015
```

Para la serie completa, quita `--limit 2`. La demo usa las dos series de Parral, de junio a octubre de 2026:

| Serie | Órbita | Fechas |
|---|---|---|
| `T048A-F015` | Ascendente | 10 |
| `T171D-F075` | Descendente | 8 |

T171 tiene una novena fecha, el 2026-08-13, que `config/aois/parral.yaml` excluye por un defecto del propio producto. `fetch` no la trae y `process` la salta. Cada fecha tarda unos 6 minutos en bajar y ocupa unos 340 MB.

Para volver a sintéticos, borra `data/artifacts/parral/<serie>` y levanta la pila otra vez.
