# Interfaz por perfiles y mapa en 3D: plan técnico

## Vistas (Faro)

- Un contexto de React `VistaContexto` con `vista: "public" | "student" | "researcher"` y `perfil` (de `auth`, o `public` sin cuenta). La vista inicial es el perfil; el selector la cambia y se guarda en `localStorage` dentro de un `try/catch`.
- Los componentes no se duplican por vista: cada uno recibe la vista y añade bloques (`<ExplicacionCampo>` en Estudiante, `<TablaEvidencia>` en Investigador). Lo obligatorio de las tres vistas vive fuera de esas ramas, así que no se puede ocultar por error.
- Sesión: el token de acceso en memoria (un módulo, no `localStorage`); `client.ts` añade `Authorization` si hay token y, ante 401, llama una vez a `/api/auth/refresh` y repite. Si vuelve a fallar, cierra la sesión y lo dice.
- Rutas de la aplicación: `/` (historia y respuesta), `/explorar` (mapa y veredicto), `/buscar` y `/cuenta`.

## Sistema de diseño (Faro)

- Variables CSS en `:root` y redefinidas para el tema oscuro, con una prueba que calcula el contraste de cada par texto-fondo declarado y falla por debajo de 4,5:1 (3:1 en texto grande e iconos).
- Colores de estado coordinados con la leyenda de Atlas: cambio probable en color sólido; no observable con trama y borde discontinuo; sin cambio, neutro. Nunca solo color (constitución IX.2).
- Tipografía y escala tipográfica fijas en pocas medidas; la decisión de fuente se anota en MEMORY con su licencia.

## Globo y relieve (Atlas)

- **Proyección.** MapLibre GL JS 6.16.0 admite la proyección de globo sin biblioteca nueva. Comprobado el 2026-11-14 en los tipos de `frontend/node_modules` (observación de Faro en el PR 66): `map.setProjection(projection: ProjectionSpecification)`, cuyo `type` acepta el texto `'globe'` (también `'mercator'` y `'vertical-perspective'`), un estado de transición o una expresión; la librería trae además `GlobeControl`. La transición por zoom de globo a Mercator se hace con una expresión en `type`. **Falta** probar en el navegador la forma exacta de esa expresión y a qué zoom conviene el paso; Atlas lo anota en MEMORY al cerrar T-ATL-09.
- **Relieve.** Eco publica un COG del DEM GLO-30 recortado a la zona en `artifacts/<aoi>/dem.tif` (EPSG:4326 o su CRS declarado). El mapa añade una fuente `raster-dem` con la plantilla `/tiles/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=file:///data/artifacts/<aoi>/dem.tif&algorithm=terrainrgb` y `encoding: "mapbox"`. El gateway ya deja pasar `file:///data/artifacts/`; Balanza solo comprueba que el parámetro `algorithm` llega a TiTiler. La ruta exacta de la plantilla la publica la API, no se construye en el frontend.
- **Modo 2D.** `setProjection` a Mercator, `setTerrain(null)`, `pitch` 0, `bearing` 0 y `maxPitch` 0.
- **Escala.** El control de escala se quita cuando `pitch > 0` y vuelve al llegar a 0. El aviso de perspectiva usa los textos de `textos.ts` en los dos idiomas.
- **Huellas.** Las huellas de las series vienen de catalog (`/aois/{id}/series`, campo nuevo y opcional `footprint` en GeoJSON, tarea de Antena). Si faltan, el globo muestra solo la caja de la zona.
- **Interfaz.** Opciones nuevas de `crearMapa`, todas opcionales: `modo3d: boolean`, `relieve?: { plantilla: string; exageracion?: number; atribucion: string }`, `huellas?: GeoJSON.FeatureCollection` y el evento `onBboxDrawn`. Se documentan en `specs/04-atlas/plan.md`.

## Pruebas

- Faro: pruebas de componentes con las tres vistas; prueba de contraste de variables; prueba de que cambiar de vista no llama a `fetch`; axe en las rutas principales.
- Atlas: pruebas de `estado` y `seleccion` también con `modo3d`; prueba de que con `pitch > 0` no hay control de escala; prueba de que, sin soporte de globo, `crearMapa` abre en 2D y emite el aviso.
- Manual: el recorrido de la demo con teclado en 2D y en 3D, anotado en el PR.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El 3D añade peso y teselas y empeora móviles | Relieve solo en la zona, mapa diferido, presupuesto de RF-INT-08 medido en el PR |
| El 3D distrae del producto (veredictos honestos) | En vista Público el globo vuela a Parral y se queda en la respuesta; el 3D no tiene estados propios ni cifras |
| La inclinación hace engañosas las áreas | Sin escala con inclinación y aviso de perspectiva; el análisis se hace en 2D |
| Un rediseño grande rompe criterios ya aprobados de Faro | Las pruebas actuales de la tarjeta, la consulta de evento y la historia siguen en verde en cada PR |
