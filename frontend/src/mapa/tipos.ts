// Interfaz del mapa para Faro. Fuente: specs/04-atlas/plan.md y src/types/map.ts.
import type { MapLayerName, MapProps } from "../types/map";
import type { Idioma } from "./textos";

/** Extensión en WGS84 (EPSG:4326): [oeste, sur, este, norte]. */
export type Bbox = MapProps["aoi"];

export type CapaRadar = MapLayerName;

/**
 * Opciones de `crearMapa`. Cualquier `MapProps` de `src/types/map.ts` es válido tal cual;
 * aquí `layers`, `activeLayer` y `compare` son opcionales y hay extras propios de Atlas.
 */
export interface OpcionesMapa
  extends Omit<MapProps, "layers" | "activeLayer" | "compare"> {
  /** Plantillas de tesela de la API (`verdict.layers`) con el host del gateway delante. */
  layers?: MapProps["layers"];
  /** Capa visible. Por defecto, "state". */
  activeLayer?: MapProps["activeLayer"];
  /** Modo de comparación (T-ATL-07). Por defecto, "off". */
  compare?: MapProps["compare"];
  /** Nombre de la zona, para la etiqueta de extensión y lectores de pantalla. */
  nombreZona?: string;
  /** `verdict.cause_label`, si el veredicto es no observable. Se muestra en la leyenda. */
  causaNoObservable?: string;
  /** Idioma de los textos del mapa. Por defecto, "es". */
  idioma?: Idioma;
  /**
   * Ruta de la serie por píxel de la serie activa, con el host delante; por ejemplo,
   * `http://localhost:8080/api/verdicts/aois/parral/series/T048A-F015/pixel`.
   * Si está, al seleccionar un punto el mapa pide `?lon=…&lat=…` y enseña la historia.
   */
  pixelUrl?: string;
  /** Muestra el selector de capa y la opacidad dentro del mapa. Por defecto, true. */
  controlCapas?: boolean;
  /** Se llama cuando la persona cambia de capa con el selector del mapa. */
  onLayerChanged?: (capa: CapaRadar) => void;
}

/** Lo que se puede cambiar después de crear el mapa. */
export type CambiosMapa = Partial<
  Pick<
    OpcionesMapa,
    | "aoi"
    | "nombreZona"
    | "layers"
    | "activeLayer"
    | "causaNoObservable"
    | "dataKind"
    | "idioma"
    | "pixelUrl"
  >
>;

export interface MapaAtlas {
  /** Aplica cambios sin recrear el mapa; por ejemplo, al elegir otro veredicto. */
  actualizar(cambios: CambiosMapa): void;
  /** Opacidad de las capas radar, entre 0,2 y 1. */
  fijarOpacidad(opacidad: number): void;
  /** Vuelve a encuadrar la zona. */
  encuadrar(): void;
  destruir(): void;
}
