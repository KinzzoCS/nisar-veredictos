# Mapa (Atlas)

Módulo de mapa de Atlas. Especificación: [`specs/04-atlas`](../../../specs/04-atlas/spec.md).

## Uso

```ts
import { crearMapa } from "./mapa/mapa";

const GATEWAY = "http://localhost:8080";
const conHost = (l) => Object.fromEntries(Object.entries(l).map(([k, t]) => [k, GATEWAY + t]));

const mapa = crearMapa(document.getElementById("mapa")!, {
  aoi: serie.bbox,                      // [oeste, sur, este, norte] de GET /aois/{aoi}/series
  nombreZona: "Hidalgo del Parral",
  dataKind: veredicto.receipt.data_kind, // "synthetic" muestra el distintivo
  layers: conHost(veredicto.layers),     // plantillas de la API con el host delante
  causaNoObservable: veredicto.cause_label ?? undefined,
  idioma: "es",                         // o "en"
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

## Estado

| Parte | Tarea | Estado |
|---|---|---|
| Mapa base OSM con atribución, escala y contorno de la zona | T-ATL-02 | Hecho |
| Capas, opacidad, leyenda y trama de lo no observable | T-ATL-03 | Hecho; falta probarlo con teselas reales |
| Distintivo de sintético y atribución de NISAR solo con datos reales | — | Hecho |
| Teclado: mapa (flechas, + y −), selector de capa y opacidad | — | Hecho |
| `onPointSelected` | T-ATL-04 | Pendiente |
| `optical` y `compare` | T-ATL-07 | Pendiente |

## Desarrollo

Desde `frontend/`:

```bash
npm install
npm run dev:mapa   # banco de pruebas en /src/mapa/demo.html
npm test
npm run typecheck
```

El banco de pruebas lee la serie y el primer veredicto de `http://localhost:8080` (`docker compose up --build`). Sin la pila levantada, usa la extensión de `config/aois/parral.yaml` y **teselas de prueba** con formas geométricas generadas en el navegador, y lo avisa en pantalla.
