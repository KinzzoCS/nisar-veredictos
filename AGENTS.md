# Instrucciones para agentes y colaboradores

Antes de trabajar, lee en este orden:

1. [specs/constitution.md](specs/constitution.md): principios no negociables.
2. La especificación del rol que vas a tocar, en [specs/](specs/README.md).
3. [MEMORY.md](MEMORY.md): decisiones, hechos verificados y lo que sigue abierto.

## Qué construimos

Una aplicación abierta (GPL-3.0-only) para el reto NASA/ISRO NISAR. Convierte datos radar GCOV en **veredictos auditables** por zona y par de fechas, con tres estados: `change_probable`, `no_detectable_change` y `not_observable` con su causa. El centro del producto es decir también lo que no se sabe.

## Roles y carpetas

| Rol | Persona | Carpetas | Especificación |
|---|---|---|---|
| Antena: ingesta y tiempo | @KinzzoCS | `services/catalog`, `services/ingest`, `config/aois` | [01-antena](specs/01-antena/spec.md) |
| Eco: señal y georreferencia | @TakoKami-dev | `services/processor` | [02-eco](specs/02-eco/spec.md) |
| Balanza: interpretación y veracidad | PapuPro05 (@sanchezelvin69305) | `services/verdicts`, `gateway`, `docker-compose.yml`, `scripts` | [03-balanza](specs/03-balanza/spec.md) |
| Atlas: mapa y representación web | @Fransomware | Módulo de mapa en `frontend/` | [04-atlas](specs/04-atlas/spec.md) |
| Faro: relato y experiencia | @danielsanchez-033 | Resto de `frontend/` | [05-faro](specs/05-faro/spec.md) |

## Reglas de trabajo para agentes

- Trabaja solo dentro de las carpetas del rol que te pidieron. Para tocar otra, pide la aprobación de su dueño.
- Si el cambio altera lo que el sistema promete, actualiza primero la especificación del rol.
- Cita la tarea (`T-XXX-NN`) en el commit y en el PR, y márcala en `tasks.md` al terminarla.
- Los servicios no importan código entre sí. Se comunican por HTTP o por los contratos de `contracts/`.
- Nunca presentes datos sintéticos como reales ni escribas una afirmación que la API no sostenga.
- No modifiques `frontend/` salvo que el equipo de frontend lo pida.

## Contratos

| Contrato | Dueño | Regenerar o validar |
|---|---|---|
| `contracts/catalog.openapi.json` | Antena | `python -m catalog.export_openapi contracts/catalog.openapi.json` |
| `contracts/gcov-subset.md` | Antena con Eco | Pruebas de `ingest` |
| `contracts/artifact-manifest.schema.json` | Eco con Balanza | Pruebas de `processor` y `verdicts` |
| `contracts/verdicts.openapi.json` | Balanza | `python -m verdicts.export_openapi contracts/verdicts.openapi.json` |

Las pruebas fallan si el contrato publicado no coincide con el código. Los contratos se congelan el 13 de noviembre.

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

## Git

- Ramas `<ámbito>/<tema>` y commits `tipo(ámbito): resumen` en español. Detalle en [CONTRIBUTING.md](CONTRIBUTING.md).
- Validación local: `git config core.hooksPath .githooks`.
- Todo entra a `main` por PR con fusión squash y CI en verde.
- Nunca se suben datos, tokens ni archivos `.env`.

## Actualizar la memoria

Cuando se tome una decisión o se verifique algo que otro necesite, actualiza `MEMORY.md` en la misma rama. Escribe la fecha absoluta y cómo se comprobó. Si algo ya no es cierto, corrígelo en lugar de añadir otra línea.
