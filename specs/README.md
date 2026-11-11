# Desarrollo guiado por especificaciones (SDD)

Aquí se decide **qué** se construye y **por qué** antes de escribir código. El código sigue a la especificación, nunca al revés.

## Estructura

| Archivo | Contenido | Quién lo cambia |
|---|---|---|
| [`constitution.md`](constitution.md) | Principios no negociables de todo el proyecto | Las cinco personas, por consenso |
| [`00-sistema/spec.md`](00-sistema/spec.md) | Visión, flujo de datos, contratos, calendario y demo | Cualquier rol, con revisión de los afectados |
| `0N-<rol>/spec.md` | Qué debe lograr el rol y cómo se acepta | El dueño del rol, con revisión de quien consume su trabajo |
| `0N-<rol>/plan.md` | Cómo lo construye: diseño, interfaces y riesgos | El dueño del rol |
| `0N-<rol>/tasks.md` | Tareas con identificador, prioridad y dependencias | El dueño del rol |
| [`_plantillas/`](_plantillas) | Plantillas para nuevas especificaciones | — |

## Roles

| Rol | Persona | Especificación |
|---|---|---|
| Antena — ingesta y tiempo | @KinzzoCS | [01-antena](01-antena/spec.md) |
| Eco — señal y georreferencia | @TakoKami-dev | [02-eco](02-eco/spec.md) |
| Balanza — interpretación y veracidad | @sanchezelvin69305 | [03-balanza](03-balanza/spec.md) |
| Atlas — mapa y representación web | @Fransomware | [04-atlas](04-atlas/spec.md) |
| Faro — relato y experiencia | @danielsanchez-033 | [05-faro](05-faro/spec.md) |

## Ciclo de trabajo

1. **Especificar.** Si una tarea cambia lo que el sistema promete, primero se actualiza `spec.md` en un PR `spec(<rol>): ...`. Lo revisa quien consume ese trabajo.
2. **Planificar.** `plan.md` explica el diseño y las interfaces. Si toca un contrato, se sigue el proceso de la constitución.
3. **Desglosar.** `tasks.md` lista tareas `T-<ROL>-NN` con prioridad y dependencias.
4. **Implementar.** Una rama por tarea o grupo pequeño de tareas. El commit y el PR citan la tarea (`Refs: T-ECO-03`).
5. **Cerrar.** En el mismo PR se marca la tarea como hecha y, si se verificó algo nuevo, se actualiza `MEMORY.md`.

## Prioridades

- **P0:** imprescindible antes del 12 de noviembre.
- **P1:** antes del evento.
- **P2:** si sobra tiempo.

`[P]` marca las tareas que no esperan a otro rol y pueden empezar ya.
