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

/** Contorno de la zona como polígono GeoJSON cerrado. */
export function contornoZona(aoi: Bbox): Feature<Polygon> {
  const [o, s, e, n] = validarBbox(aoi);
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[[o, s], [e, s], [e, n], [o, n], [o, s]]],
    },
  };
}

export function validarBbox(aoi: Bbox): Bbox {
  const [o, s, e, n] = aoi;
  const ok =
    aoi.length === 4 &&
    aoi.every(Number.isFinite) &&
    o >= -180 && e <= 180 && s >= -90 && n <= 90 &&
    o < e && s < n;
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
