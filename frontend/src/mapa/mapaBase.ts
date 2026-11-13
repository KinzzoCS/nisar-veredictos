import type { StyleSpecification } from "maplibre-gl";
import type { Feature, Polygon } from "geojson";
import type { Bbox } from "./tipos";

// Decisión T-ATL-01 (2026-11-12): teselas raster de OpenStreetMap.
// Datos ODbL; la política de uso de tile.openstreetmap.org exige atribución visible
// con enlace y prohíbe el tráfico alto. Vale para la demo, no para producción.
// https://operations.osmfoundation.org/policies/tiles/
export const ATRIBUCION_OSM =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a>';

export const ZOOM_MAXIMO_BASE = 19;

export function estiloMapaBase(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: ZOOM_MAXIMO_BASE,
        attribution: ATRIBUCION_OSM,
      },
    },
    layers: [
      // Fondo claro mientras cargan las teselas, en lugar del negro del lienzo.
      { id: "fondo", type: "background", paint: { "background-color": "#f2efe9" } },
      { id: "osm", type: "raster", source: "osm" },
    ],
  };
}

/** La zona cruza el antimeridiano (180°): su oeste está a la derecha de su este, p. ej. [170, s, -170, n]. */
export function cruzaAntimeridiano(aoi: Bbox): boolean {
  return aoi[0] > aoi[2];
}

/**
 * La misma zona con el este sin saltos, para MapLibre: si cruza el antimeridiano, el este pasa
 * a más de 180° ([170, s, -170, n] → [170, s, 190, n]). Sirve para encuadrar y para el contorno.
 */
export function bboxContinuo(aoi: Bbox): Bbox {
  const [o, s, e, n] = validarBbox(aoi);
  return [o, s, cruzaAntimeridiano(aoi) ? e + 360 : e, n];
}

/** Contorno de la zona como polígono GeoJSON cerrado. Si cruza el antimeridiano, no da la vuelta al mundo. */
export function contornoZona(aoi: Bbox): Feature<Polygon> {
  const [o, s, e, n] = bboxContinuo(aoi);
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[[o, s], [e, s], [e, n], [o, n], [o, s]]],
    },
  };
}

/**
 * Comprueba [oeste, sur, este, norte] en WGS84. Oeste mayor que este es válido: la zona cruza
 * el antimeridiano (ver `bboxContinuo`). Solo se rechaza un ancho nulo.
 */
export function validarBbox(aoi: Bbox): Bbox {
  const [o, s, e, n] = aoi;
  const ok =
    aoi.length === 4 &&
    aoi.every(Number.isFinite) &&
    o >= -180 && o <= 180 && e >= -180 && e <= 180 && s >= -90 && n <= 90 &&
    o !== e && s < n;
  if (!ok) throw new Error(`Extensión no válida: ${JSON.stringify(aoi)}`);
  return aoi;
}

/**
 * Coordenada para mostrar: como mucho 5 decimales (constitución V.3) y sin
 * rellenar con ceros, para no aparentar más precisión que la del dato.
 */
export function formatoCoordenada(x: number): string {
  return String(Number(x.toFixed(5))).replace("-", "−");
}

export function textoExtension(aoi: Bbox): string {
  const [o, s, e, n] = aoi.map(formatoCoordenada);
  return `O ${o}° · S ${s}° · E ${e}° · N ${n}°`;
}
