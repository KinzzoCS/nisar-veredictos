# Mapa (Atlas)

Módulo de mapa de Atlas. Especificación: [`specs/04-atlas`](../../../specs/04-atlas/spec.md).

## Uso

```ts
import { avisoEscena } from "./mapa/escena";
import { crearMapa } from "./mapa/mapa";

const GATEWAY = "http://localhost:8080";
const conHost = (l) => Object.fromEntries(Object.entries(l).map(([k, t]) => [k, GATEWAY + t]));

const mapa = crearMapa(document.getElementById("mapa")!, {
  aoi: serie.bbox,                      // [oeste, sur, este, norte] de GET /aois/{aoi}/series
  nombreZona: "Hidalgo del Parral",
  dataKind: veredicto.receipt.data_kind, // "synthetic" muestra el distintivo
  layers: conHost(veredicto.layers),     // plantillas de la API con el host delante
  causaNoObservable: veredicto.cause_label ?? undefined,
  // Cambio de nivel de toda la escena (PR 37 y 42), con avisoEscena de "./mapa/escena":
  // sin corregir, la leyenda avisa de que puede no ser local; corregido, anota que se descontó.
  desplazamientoEscena: avisoEscena(veredicto.evidence.scene_shift),
  idioma: "es",                         // o "en"
  // Serie por píxel de la serie activa: al seleccionar un punto, el mapa la pide y la enseña.
  pixelUrl: `${GATEWAY}/api/verdicts/aois/parral/series/${serie.id}/pixel`,
  onPointSelected: ({ lon, lat }) => {}, // ya redondeados a 5 decimales
  onLayerChanged: (capa) => {},
  onViewChanged: ({ bbox, zoom }) => {},
});

// Al elegir otro veredicto, sin recrear el mapa:
mapa.actualizar({ layers: conHost(otro.layers), dataKind: otro.receipt.data_kind });

mapa.destruir(); // al desmontar
```

El contenedor necesita una altura (mínimo 320 px). La interfaz completa está en [`tipos.ts`](tipos.ts). Si Faro quiere su propio selector de capa, pasa `controlCapas: false` y cambia la capa con `actualizar({ activeLayer })`.

## Cómo se pinta cada capa

| Capa | Qué se ve |
|---|---|
| `state` | Cambio probable en naranja sólido. Sin cambio, transparente |
| `change_hh`, `change_hv` | Diferencia en dB con la paleta `rdbu` de la API. El rango de la leyenda sale del parámetro `rescale` de la plantilla |
| Trama (siempre encima) | Lo no observable (códigos 10-15) con rayas diagonales gris oscuro y gris claro. Opacidad mínima del 70 % |

Para la trama, el mapa sustituye el `colormap` de la plantilla `state` por uno que guarda el código en el canal rojo ([`estado.ts`](estado.ts)) y pinta cada tesela en el navegador ([`protocolo.ts`](protocolo.ts)).

## Selección de punto

- Clic sobre el mapa, o Enter con el mapa enfocado, que selecciona el punto bajo la cruz central. La cruz y la ayuda solo aparecen con foco de teclado.
- El mapa pone un marcador, anuncia las coordenadas a los lectores de pantalla y llama a `onPointSelected` con `{ lon, lat }` redondeados a 5 decimales.
- Con `pixelUrl`, abre una ventana con la historia del punto: gráfica de HH (línea continua) y HV (discontinua), el resultado de cada par consecutivo y la tabla de valores. Si la API responde 404, dice que el punto queda fuera de la zona con datos.
- Escape cierra la ventana y quita el marcador.

## Comparador óptico

Con `compare: "swipe"` y `optical` con al menos un lado (`VistaOptica`, ver [`src/types/map.ts`](../types/map.ts)), el mapa monta un deslizador: a la izquierda el radar y a la derecha la escena Sentinel-2.

- La escena se pinta en un segundo mapa MapLibre, sin interacción propia, que sigue la cámara del principal ([`comparador.ts`](comparador.ts)).
- Una capa por tesela MGRS. Fuera de su huella TiTiler responde 404, que se pinta como tesela vacía.
- Un panel elige antes o después y muestra la fecha UTC, los días respecto a la pasada de radar, la nubosidad (de la tesela, no de la zona) y la atribución. Con `cloudy`, `partial_coverage`, `none_in_window` o `catalog_unavailable` dice por qué ([`optico.ts`](optico.ts)).
- El deslizador se arrastra o se mueve con el teclado: flechas, Re Pág, Av Pág, Inicio y Fin.

```ts
mapa.actualizar({ optical: { before, after }, compare: "swipe" }); // "off" lo quita
```

## Estado

| Parte | Tarea | Estado |
|---|---|---|
| Mapa base OSM con atribución, escala y contorno de la zona | T-ATL-02 | Hecho |
| Capas, opacidad, leyenda y trama de lo no observable | T-ATL-03 | Hecho; falta probarlo con teselas reales |
| Selección de punto y serie por píxel | T-ATL-04 | Hecho; falta probarlo con la API real |
| Distintivo de sintético y atribución de NISAR solo con datos reales | — | Hecho |
| Teclado: mapa (flechas, + y −, Enter, Escape), selector de capa y opacidad | — | Hecho |
| Comparador óptico (`optical` y `compare`) | T-ATL-07 | En curso: probado solo con teselas de prueba; falta la API con el PR 19 y comprobar La Boquilla |

## Desarrollo

Desde `frontend/`:

```bash
npm install
npm run dev:mapa   # banco de pruebas en /src/mapa/demo.html
npm test
npx tsc -b         # tipos, igual que npm run build
```

El banco de pruebas lee la serie y el primer veredicto de `http://localhost:8080` (`docker compose up --build`). Sin la pila levantada, usa la extensión de `config/aois/parral.yaml`, **teselas de prueba** con formas geométricas generadas en el navegador y una serie por píxel de prueba, y lo avisa en pantalla.
