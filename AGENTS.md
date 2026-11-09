# Instrucciones para agentes y colaboradores

Antes de trabajar, lee [MEMORY.md](MEMORY.md): tiene las decisiones, los hechos verificados y lo que sigue abierto.

## Qué construimos

Una aplicación para el reto NASA/ISRO NISAR. Convierte datos radar GCOV en **veredictos auditables** por zona y par de fechas, con tres estados: `change_probable`, `no_detectable_change` y `not_observable` con su causa. El centro del producto es decir también lo que no se sabe.

## Mapa del repositorio

| Carpeta | Responsabilidad | Equipo |
|---|---|---|
| `services/catalog` | Busca en CMR y agrupa series comparables | Back 1 |
| `services/processor` | Lee GCOV y genera COGs, estados y manifiesto | Back 2 |
| `services/verdicts` | Decide veredictos y escribe los textos; API principal | Back 3 |
| `gateway/`, `docker-compose.yml` | Entrada única e integración, incluida TiTiler | Back 3 |
| `frontend/` | Libre para el equipo de frontend | Front 1 y 2 |
| `contracts/` | Fronteras entre servicios | Acuerdo entre las partes afectadas |
| `config/aois/` | Zonas de estudio | Back 1 |

## Límites entre servicios

- Una rama toca una sola carpeta de servicio, salvo cambios acordados de contrato.
- Los servicios no importan código entre sí. Se comunican solo por HTTP o por los artefactos descritos en `contracts/`.
- `processor` escribe artefactos y `verdicts` los lee: ningún servicio escribe en el dominio de otro.
- Los agentes no modifican `frontend/` salvo que el equipo de frontend lo pida.

## Cambiar un contrato

1. Avisa a quien lo consume antes de cambiarlo.
2. Modifica `contracts/artifact-manifest.schema.json`, o los modelos de la API y regenera su OpenAPI:

```bash
python -m catalog.export_openapi contracts/catalog.openapi.json
python -m verdicts.export_openapi contracts/verdicts.openapi.json
```

3. Las pruebas fallan si el contrato publicado no coincide con el código.

## Reglas de datos que no se negocian

- Solo se comparan fechas con la misma pista, dirección, marco, modo, polarización y CRID. Nunca se mezclan PROVISIONAL y VALIDATED.
- `data_kind` viaja en cada respuesta. Lo sintético nunca se presenta como real, ni en texto ni en la demo.
- Un píxel no observable se conserva con su causa. Nunca se borra ni se cuenta como "sin cambio".
- Las hipótesis se redactan como hipótesis. No afirmamos causas, daños ni que NISAR supere a otro sistema si no se ha medido.
- Solo se usan los términos diagonales `HHHH` y `HVHV`.
- GCOV está en potencia gamma-0: se promedia en lineal y después se convierte a dB.

## Comandos

Cada servicio se prueba por separado desde su carpeta:

```bash
pip install -e ".[dev]"
pytest -q
```

Toda la pila con datos sintéticos, en `http://localhost:8080`:

```bash
docker compose up --build
```

Prueba de humo con la pila levantada:

```bash
bash scripts/smoke.sh
```

## Flujo de Git

- Ramas `area/tema`, por ejemplo `verdicts/umbrales` o `front/mapa`.
- Todo entra a `main` por pull request con CI en verde.
- Nunca se suben datos, tokens ni archivos `.env`. El token de Earthdata va solo en `.env` local.

## Actualizar la memoria

Cuando se tome una decisión o se verifique algo que otro necesite, actualiza `MEMORY.md` en la misma rama. Escribe la fecha absoluta y cómo se comprobó. Si algo ya no es cierto, corrígelo en lugar de añadir otra línea.
