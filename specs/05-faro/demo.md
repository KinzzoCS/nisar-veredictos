# Faro — guion de demo y material para el jurado (T-FAR-09)

Borrador de Faro, 2026-11-14. **Lo revisa todo el equipo antes de la demo** (decisión del 2026-11-14 en `MEMORY.md`).

Regla del guion: **ninguna cifra ni ningún estado se dice de memoria.** Se leen en pantalla, porque los artefactos pueden reprocesarse. Donde el guion pone `[en pantalla]`, se lee lo que muestra la app en ese momento. La única cifra fija es externa y se cita con su fuente: los 22,8 mm del boletín de Protección Civil.

## Antes de salir a escena

- [ ] `docker compose up --build` con los artefactos que se van a enseñar. Si Eco reprocesó con la corrección de T-ECO-07, comprobar que la escena 2 ya no muestra los valores sin corregir (ver "Si cambian los datos").
- [ ] Abrir `http://localhost:3000` **dos minutos antes** y recorrer las tres escenas una vez: la primera carga de veredictos puede tardar más de 40 s (MEMORY, arreglo del 504).
- [ ] Idioma en español, zoom del navegador al 125 % para el proyector, pestañas y notificaciones cerradas.
- [ ] Hay red: el mapa base de OpenStreetMap y la imagen óptica de Sentinel-2 vienen de fuera. Los veredictos no.
- [ ] La serie dice `real` en el selector. Si dijera `synthetic`, se dice en voz alta y se deja el distintivo a la vista: nunca se presenta lo sintético como real (constitución II.2).
- [ ] La escena 1 está seleccionada y la página arriba del todo.

## Guion de 3 minutos

| Tiempo | En pantalla | Qué se dice |
|---|---|---|
| 0:00–0:20 | Portada con la historia en la escena 1 | "El 1 de julio de 2026 cayó una tormenta en Hidalgo del Parral, Chihuahua: Protección Civil registró 22,8 mm de lluvia en una hora. NISAR es un radar que ve a través de las nubes. La pregunta parece fácil: ¿lo vio?" |
| 0:20–0:55 | Escena 1: el estado, el motivo, "Qué encontramos", "Qué no prueba" y "Qué falta". Señalar la pasada anterior y la siguiente | "La respuesta honesta es `[en pantalla: estado]`. El satélite pasó el `[pasada anterior]` y el `[pasada siguiente]`: ninguna de las dos cae dentro de lo que suponemos que duró la tormenta. Fíjense en que no decimos 'sin cambio'. 'No observable' es un estado propio, con su motivo, y lo que no prueba sale al lado, siempre: que no lo viéramos no significa que no pasara." |
| 0:55–1:40 | Escena 2: la tarjeta. Leer el estado, señalar los tres textos y las hipótesis rotuladas. Pulsar "Ver este par en el mapa" y enseñar la capa | "Ahora un par de fechas de agosto, del 16 al 28. El radar dice `[en pantalla: estado]` en el `[porcentaje]` de lo observado. Esto es lo que detectamos, esto lo que no prueba —no dice la causa— y esto lo que falta. Las posibles explicaciones están, pero rotuladas como hipótesis sin comprobar. En el mapa, cada píxel lleva su estado, y lo no observable va con trama, no solo con color." |
| 1:40–2:10 | Escena 3: el recuento por pares en el punto junto a la Mina La Prieta | "Tercera pregunta: un punto junto a la Mina La Prieta. En `[en pantalla: N de M]` pares el radar no detecta cambio. Eso también es información, pero no prueba que nada cambiara: dice que el radar no vio un cambio mayor que su umbral." |
| 2:10–2:40 | Abrir "Recibo: de dónde sale esta respuesta" en la tarjeta de la escena 2 o del selector | "Y la parte que más nos importa: cada respuesta trae su recibo. Los gránulos exactos de NASA, la versión de procesado, la madurez —estos datos son `[en pantalla: madurez]`—, cuántos días tiene la imagen y cuánto tardó en publicarse, y el contraste con Sentinel-2 y con OPERA, también cuando no coincide. Cualquiera puede rastrear una frase hasta el dato." |
| 2:40–3:00 | Volver arriba; el selector de idioma | "NISAR Veredictos convierte el radar en tres respuestas: qué cambió, qué no se detectó y qué no se puede saber. Funciona en español e inglés, es accesible con teclado y es código abierto con licencia GPL-3.0. Gracias." |

Si sobra tiempo o el jurado lo pide: "Consulta de evento" con el botón "Probar con la tormenta del 1 de julio de 2026" (la misma pregunta que la escena 1, con cualquier fecha), el comparador con Sentinel-2 en el mapa y la línea de tiempo de pasadas de Atlas.

## Si cambian los datos

El guion vale con cualquier resultado, porque lo lee de la pantalla. Aun así, hay que ensayarlo con los artefactos de la demo:

- Con los artefactos sin la corrección de T-ECO-07, la pila local da `change_probable` en 10 de los 16 pares consecutivos (consultado el 2026-11-14 en `/series/<serie>/verdicts`). Muchos siguen al desplazamiento de toda la escena, y la tarjeta lo avisa en "Qué no prueba" cuando pasa del umbral.
- Con la corrección, Balanza midió 2 de 16: T048 08-16→08-28 (5,18 %) y 08-28→09-09 (9,56 %) (`MEMORY.md`, decisión del 2026-11-13). La escena 2 queda solo 0,18 puntos sobre el umbral del 5 %: si se recalibra, puede cambiar de estado, y el guion no se toca.
- Si la escena 2 deja de salir `change_probable`, la frase de 0:55 se dice igual con el estado nuevo: el valor de la demo es que la app lo dice tal cual.

## Si algo falla en escena

| Fallo | Qué hacer |
|---|---|
| Una escena muestra "No se pudo cargar esta escena" | Pasar a la siguiente: las demás siguen funcionando. Decirlo: "la app avisa cuando no puede responder, en lugar de inventar". |
| La primera carga tarda | Hablar del 0:00–0:20 mientras carga; por eso se abre dos minutos antes. |
| No hay red | Los veredictos, la historia y el recibo funcionan; el mapa base y Sentinel-2 no. Se salta el mapa y se enseña el recibo. |
| La pila no arranca | Enseñar `README.md` y el recorrido con capturas tomadas en el ensayo. **Pendiente:** hacerlas en el ensayo general. |

## Ficha para el jurado (una página)

**NISAR Veredictos** convierte datos radar NISAR (producto GCOV) en veredictos auditables por zona y par de fechas, para personas sin formación en radar.

- **Tres estados, sin término medio escondido:** cambio probable, sin cambio detectable y no observable con su causa. "No observable" nunca se cuenta como "sin cambio".
- **Siempre tres textos juntos:** qué detectamos, qué no prueba y qué falta. Las posibles explicaciones van rotuladas como hipótesis.
- **Recibo en cada respuesta:** gránulos de NASA, versión de procesado (CRID), madurez, frescura, latencia de publicación, avisos de calidad y contraste con Sentinel-2 y OPERA DSWx-S1.
- **Datos:** dos series reales de NISAR sobre Hidalgo del Parral, T048 ascendente y T171 descendente, de junio a octubre de 2026, madurez PROVISIONAL. Una fecha de T171 (2026-08-13) queda excluida por un defecto del propio producto, documentado en `MEMORY.md`.
- **Qué no hace:** no identifica causas, no mide consecuencias, no procesa en vivo (los artefactos están precalculados) y no sustituye la verificación en campo.
- **Umbral:** el 5 % de superficie cambiada se fijó con el ruido de 16 pares reales de Parral, sin verdad de campo; la API lo declara como no calibrado en cada veredicto.
- **Cómo comprobar una respuesta:** abrir el recibo y buscar los gránulos en NASA Earthdata Search o en la API (`/api/verdicts/docs`).
- **Abierto:** GPL-3.0-only, especificaciones en `specs/`, decisiones y hechos verificados con fecha en `MEMORY.md`.
- **Fuentes externas:** boletín de la Coordinación Estatal de Protección Civil de Chihuahua (1 de julio de 2026), OpenStreetMap, Copernicus Sentinel-2 (Earth Search), OPERA DSWx-S1 (PO.DAAC) y NASA/ISRO NISAR (ASF).

## Preguntas probables del jurado

| Pregunta | Respuesta corta | Dónde está |
|---|---|---|
| ¿Por qué GCOV y no interferometría (GUNW)? | Menos riesgo técnico y nadie del equipo declaró experiencia InSAR. GCOV basta para cambios de retrodispersión. | `MEMORY.md`, decisiones del 2026-11-09 |
| ¿Por qué no vio la tormenta si NISAR ve a través de las nubes? | Porque no pasó por Parral durante el evento: ver de noche o con nubes no sirve si el satélite no está encima. La API da la pasada anterior y la siguiente. | Escena 1, `/events` |
| ¿Cuánto supusieron que duró la tormenta? | 6 h para una tormenta urbana, un supuesto sin calibrar que la respuesta declara. Con la hora del primer incidente, el resultado no cambia hasta las 148 h. | `MEMORY.md`, Caso de Parral |
| ¿Cómo eligieron el 5 %? | Con el ruido medido en 16 pares reales: 14 quedan entre 0,58 % y 4,64 %. Sin verdad de campo, por eso la API lo marca como no calibrado. | `MEMORY.md`, decisión del 2026-11-13 |
| ¿Qué es el desplazamiento de toda la escena? | A veces toda la escena sube o baja de nivel entre fechas. Eco lo resta antes de medir y, si no está restado y pasa de 1,5 dB, la tarjeta avisa de que el cambio puede no ser local. | `MEMORY.md`, T-ECO-07 y T-BAL-07 |
| El radar y OPERA no coinciden en el agua. ¿Quién tiene razón? | No lo afirmamos: se presenta como desacuerdo entre métodos, con el porcentaje comparado. OPERA DSWx-S1 detecta masas de agua abiertas de más de 3 ha y 200 m de ancho. | `MEMORY.md`, T-BAL-08 |
| ¿Funciona en otro lugar? | La zona se define en `config/aois/`. Hoy solo está Parral; añadir otra es configuración más volver a ingerir y procesar. | `specs/01-antena` |
| ¿Qué viene después? | Una segunda ola con cuentas y perfiles (público, estudiante e investigador), búsqueda y globo 3D. Los perfiles cambian la profundidad, nunca la verdad. | `specs/06-acceso`, `07-busqueda` y `08-interfaz` |

## Ensayo

| Fecha | Quién | Duración | Datos | Notas |
|---|---|---|---|---|
| 2026-11-14 | Faro, recorrido en la app sin decirlo en voz alta | Unos 2:20 estimados (unas 320 palabras a 140 por minuto), sin contar los clics | Pila local con artefactos reales sin la corrección de T-ECO-07 | Todo lo marcado `[en pantalla]` aparece: pasadas 2026-06-29 y 2026-07-08, estado del par de agosto, madurez PROVISIONAL, gránulos, CRID, Sentinel-2, OPERA y el recuento de la escena 3. Falta un ensayo hablado y cronometrado |
| | Todo el equipo | | | Ensayo general: revisar el guion y tomar las capturas del plan B |
