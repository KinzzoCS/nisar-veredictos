import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./mapa.css";
import { crearLeyenda, limitarOpacidad, rangoReescalado } from "./leyenda";
import { contornoZona, estiloMapaBase, textoExtension, validarBbox } from "./mapaBase";
import { OPACIDAD_MINIMA_TRAMA } from "./estado";
import { plantillaEstado } from "./protocolo";
import { TEXTOS } from "./textos";
import type { Bbox, CambiosMapa, CapaRadar, MapaAtlas, OpcionesMapa } from "./tipos";

const ATRIBUCION_NISAR =
  'Radar: <a href="https://nisar.jpl.nasa.gov/" target="_blank" rel="noopener">NASA/ISRO NISAR</a> (GCOV)';
const CAPA_ENCIMA = "aoi-contorno-halo";
const IDS_RADAR = ["radar-state", "radar-change_hh", "radar-change_hv", "radar-trama"] as const;

/**
 * Crea el mapa de Atlas dentro de `contenedor`. Independiente del framework:
 * Faro lo monta, lo cambia con `actualizar()` y lo desmonta con `destruir()`.
 *
 * Teclado (por defecto en MapLibre, con el mapa enfocado): flechas para
 * desplazar, + y − para el zoom.
 */
export function crearMapa(contenedor: HTMLElement, opciones: OpcionesMapa): MapaAtlas {
  const estado = {
    aoi: validarBbox(opciones.aoi),
    zona: opciones.nombreZona,
    layers: opciones.layers,
    capa: opciones.activeLayer ?? ("state" as CapaRadar),
    causa: opciones.causaNoObservable,
    dataKind: opciones.dataKind,
    idioma: opciones.idioma ?? "es",
    opacidad: 0.85,
  };

  contenedor.classList.add("atlas-mapa");
  const lienzo = document.createElement("div");
  lienzo.className = "atlas-lienzo";
  contenedor.append(lienzo);

  const map = new maplibregl.Map({
    container: lienzo,
    style: estiloMapaBase(),
    bounds: estado.aoi,
    fitBoundsOptions: { padding: 32 },
    attributionControl: false,
    // Sin rotación: la escala y el contorno se leen siempre con el norte arriba.
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();

  map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 120 }), "bottom-left");
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  const extension = document.createElement("div");
  extension.className = "atlas-extension";
  extension.append(document.createElement("strong"), document.createElement("span"));
  contenedor.append(extension);

  const sello = document.createElement("div");
  sello.className = "atlas-sintetico";
  sello.setAttribute("role", "status");
  contenedor.append(sello);

  const dibujarLeyenda = crearLeyenda(contenedor, {
          alCambiarCapa: (c) => {
            estado.capa = c;
            aplicarVisibilidad();
            redibujarLeyenda();
            opciones.onLayerChanged?.(c);
          },
          alCambiarOpacidad: (o) => fijarOpacidad(o),
        });

  function redibujarLeyenda() {
    dibujarLeyenda(!estado.layers ? null : {
      idioma: estado.idioma,
      capa: estado.capa,
      capasDisponibles: opciones.controlCapas !== false,
      opacidad: estado.opacidad,
      rango: estado.capa === "state" ? null : rangoReescalado(estado.layers[estado.capa]),
      causa: estado.causa,
    });
  }

  function redibujarTextos() {
    const t = TEXTOS[estado.idioma];
    const zona = estado.zona ?? t.zonaPorDefecto;
    map.getCanvas().setAttribute("aria-label", t.mapaDe(zona));
    extension.querySelector("strong")!.textContent = t.extensionDe(zona);
    extension.querySelector("span")!.textContent = textoExtension(estado.aoi);
    sello.textContent = t.sintetico;
    sello.hidden = estado.dataKind !== "synthetic";
  }

  function quitarCapasRadar() {
    for (const id of IDS_RADAR) {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    }
  }

  function aplicarCapas() {
    quitarCapasRadar();
    if (!estado.layers) return;
    // Solo se atribuye NISAR cuando el dato es real (constitución II.2 y VIII.2).
    const attribution = estado.dataKind === "real" ? ATRIBUCION_NISAR : undefined;
    const fuentes: Record<(typeof IDS_RADAR)[number], string> = {
      "radar-state": plantillaEstado(estado.layers.state, "cambio"),
      "radar-change_hh": estado.layers.change_hh,
      "radar-change_hv": estado.layers.change_hv,
      "radar-trama": plantillaEstado(estado.layers.state, "trama"),
    };
    for (const id of IDS_RADAR) {
      map.addSource(id, { type: "raster", tiles: [fuentes[id]], tileSize: 256, attribution });
      const categorica = id === "radar-state" || id === "radar-trama";
      map.addLayer(
        {
          id,
          type: "raster",
          source: id,
          paint: {
            "raster-opacity": opacidadDe(id),
            // Los códigos y la trama se ven nítidos; el cambio continuo, suavizado.
            "raster-resampling": categorica ? "nearest" : "linear",
            "raster-fade-duration": 0,
          },
        },
        CAPA_ENCIMA,
      );
    }
    aplicarVisibilidad();
  }

  function aplicarVisibilidad() {
    if (!estado.layers || !map.getLayer("radar-state")) return;
    // La trama de lo no observable está siempre encima: nunca queda transparente.
    const visibles = new Set([`radar-${estado.capa}`, "radar-trama"]);
    for (const id of IDS_RADAR) {
      map.setLayoutProperty(id, "visibility", visibles.has(id) ? "visible" : "none");
    }
  }

  function opacidadDe(id: (typeof IDS_RADAR)[number]): number {
    return id === "radar-trama" ? Math.max(estado.opacidad, OPACIDAD_MINIMA_TRAMA) : estado.opacidad;
  }

  function fijarOpacidad(o: number) {
    estado.opacidad = limitarOpacidad(o);
    for (const id of IDS_RADAR) {
      if (map.getLayer(id)) map.setPaintProperty(id, "raster-opacity", opacidadDe(id));
    }
  }

  map.on("load", () => {
    map.addSource("aoi", { type: "geojson", data: contornoZona(estado.aoi) });
    map.addLayer({
      id: "aoi-contorno-halo",
      type: "line",
      source: "aoi",
      paint: { "line-color": "#ffffff", "line-width": 4, "line-opacity": 0.9 },
    });
    map.addLayer({
      id: "aoi-contorno",
      type: "line",
      source: "aoi",
      paint: { "line-color": "#1b1f3b", "line-width": 2, "line-dasharray": [3, 2] },
    });
    aplicarCapas();
  });

  map.on("moveend", () => {
    if (!opciones.onViewChanged) return;
    const b = map.getBounds();
    const bbox: Bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    opciones.onViewChanged({ bbox, zoom: map.getZoom() });
  });

  redibujarTextos();
  redibujarLeyenda();

  return {
    actualizar(c: CambiosMapa) {
      if (c.aoi) {
        estado.aoi = validarBbox(c.aoi);
        (map.getSource("aoi") as maplibregl.GeoJSONSource | undefined)?.setData(
          contornoZona(estado.aoi),
        );
        map.fitBounds(estado.aoi, { padding: 32 });
      }
      if ("nombreZona" in c) estado.zona = c.nombreZona;
      if ("causaNoObservable" in c) estado.causa = c.causaNoObservable;
      if (c.idioma) estado.idioma = c.idioma;
      if (c.activeLayer) estado.capa = c.activeLayer;
      const recargar = "layers" in c || (c.dataKind && c.dataKind !== estado.dataKind);
      if ("layers" in c) estado.layers = c.layers;
      if (c.dataKind) estado.dataKind = c.dataKind;
      // La fuente "aoi" existe desde el evento load; antes, load ya aplicará las capas.
      if (recargar && map.getSource("aoi")) aplicarCapas();
      else aplicarVisibilidad();
      redibujarTextos();
      redibujarLeyenda();
    },
    fijarOpacidad,
    encuadrar: () => map.fitBounds(estado.aoi, { padding: 32 }),
    destruir: () => {
      map.remove();
      contenedor.replaceChildren();
      contenedor.classList.remove("atlas-mapa");
    },
  };
}
