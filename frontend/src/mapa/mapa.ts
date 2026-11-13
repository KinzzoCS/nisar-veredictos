import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./mapa.css";
import { crearComparador, type Comparador } from "./comparador";
import { crearLeyenda, limitarOpacidad, rangoReescalado } from "./leyenda";
import { ladoDisponible } from "./optico";
import { contornoZona, estiloMapaBase, textoExtension, validarBbox } from "./mapaBase";
import { OPACIDAD_MINIMA_TRAMA } from "./estado";
import { plantillaEstado } from "./protocolo";
import {
  contenidoCargando,
  contenidoError,
  contenidoSerie,
  puntoSeleccionado,
  urlPixel,
  type SeriePixel,
} from "./seleccion";
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
 * Teclado, con el mapa enfocado: flechas para desplazar y + y − para el zoom
 * (de MapLibre); Enter selecciona el punto bajo la cruz central y Escape cierra
 * la ventana del punto.
 */
export function crearMapa(contenedor: HTMLElement, opciones: OpcionesMapa): MapaAtlas {
  const estado = {
    aoi: validarBbox(opciones.aoi),
    zona: opciones.nombreZona,
    layers: opciones.layers,
    capa: opciones.activeLayer ?? ("state" as CapaRadar),
    causa: opciones.causaNoObservable,
    avisoEscena: opciones.desplazamientoEscena ?? false,
    dataKind: opciones.dataKind,
    idioma: opciones.idioma ?? "es",
    opacidad: 0.85,
    pixelUrl: opciones.pixelUrl,
    punto: null as { lon: number; lat: number } | null,
    optical: opciones.optical,
    compare: opciones.compare ?? "off",
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

  // Cruz central y ayuda: solo se ven cuando el mapa tiene el foco del teclado.
  const cruz = document.createElement("div");
  cruz.className = "atlas-cruz";
  cruz.setAttribute("aria-hidden", "true");
  const ayuda = document.createElement("div");
  ayuda.className = "atlas-ayuda";
  ayuda.setAttribute("aria-hidden", "true");
  // Anuncio para lectores de pantalla al seleccionar un punto.
  const anuncio = document.createElement("div");
  anuncio.className = "atlas-solo-lector";
  anuncio.setAttribute("role", "status");
  contenedor.append(cruz, ayuda, anuncio);

  const marcador = new maplibregl.Marker({ color: "#1b1f3b" });
  const ventana = new maplibregl.Popup({ maxWidth: "300px", closeOnClick: false, focusAfterOpen: false });
  let peticion: AbortController | null = null;

  async function seleccionar(lng: number, lat: number) {
    const p = puntoSeleccionado(lng, lat);
    estado.punto = p;
    const t = TEXTOS[estado.idioma];
    marcador.setLngLat([p.lon, p.lat]).addTo(map);
    anuncio.textContent = `${t.puntoSeleccionado}: ${t.lon} ${p.lon}, ${t.lat} ${p.lat}`;
    opciones.onPointSelected?.(p);

    peticion?.abort();
    if (!estado.pixelUrl) {
      ventana.remove();
      return;
    }
    const control = new AbortController();
    peticion = control;
    ventana.setLngLat([p.lon, p.lat]).setDOMContent(contenidoCargando(p, estado.idioma)).addTo(map);
    try {
      const r = await fetch(urlPixel(estado.pixelUrl, p), { signal: control.signal });
      if (r.status === 404) throw new Error(t.fueraDeSerie);
      if (!r.ok) throw new Error(`${t.errorSerie} (HTTP ${r.status})`);
      const serie = (await r.json()) as SeriePixel;
      if (peticion === control) ventana.setDOMContent(contenidoSerie(serie, estado.idioma));
    } catch (e) {
      if (control.signal.aborted) return;
      const msg = e instanceof TypeError ? t.errorSerie : (e as Error).message;
      ventana.setDOMContent(contenidoError(p, msg, estado.idioma));
    }
  }

  function quitarSeleccion() {
    peticion?.abort();
    estado.punto = null;
    ventana.remove();
    marcador.remove();
  }

  map.on("click", (e) => seleccionar(e.lngLat.lng, e.lngLat.lat));

  const canvas = map.getCanvas();
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const c = map.getCenter();
      seleccionar(c.lng, c.lat);
    } else if (e.key === "Escape" && estado.punto) {
      quitarSeleccion();
    }
  });
  // La cruz se muestra solo con foco de teclado, no al hacer clic.
  canvas.addEventListener("focus", () => {
    contenedor.classList.toggle("atlas-foco-teclado", canvas.matches(":focus-visible"));
  });
  canvas.addEventListener("blur", () => contenedor.classList.remove("atlas-foco-teclado"));

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
      avisoEscena: estado.avisoEscena,
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
    ayuda.textContent = t.ayudaTeclado;
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

  // Comparador óptico (T-ATL-07): solo con compare "swipe" y al menos un lado con datos.
  let comparador: Comparador | null = null;

  function aplicarComparador() {
    const activo = estado.compare === "swipe" && ladoDisponible(estado.optical, "after") !== null;
    if (activo && !comparador) {
      comparador = crearComparador(contenedor, map, {
        optical: estado.optical,
        idioma: estado.idioma,
        aoi: estado.aoi,
      });
    } else if (activo && comparador) {
      comparador.actualizar({ optical: estado.optical, idioma: estado.idioma, aoi: estado.aoi });
    } else if (!activo && comparador) {
      comparador.destruir();
      comparador = null;
    }
  }

  map.on("moveend", () => {
    if (!opciones.onViewChanged) return;
    const b = map.getBounds();
    const bbox: Bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    opciones.onViewChanged({ bbox, zoom: map.getZoom() });
  });

  redibujarTextos();
  redibujarLeyenda();
  aplicarComparador();

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
      if ("desplazamientoEscena" in c) estado.avisoEscena = c.desplazamientoEscena ?? false;
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
      // Otra serie o idioma: se vuelve a pedir la historia del punto ya elegido.
      const cambiaSerie = "pixelUrl" in c && c.pixelUrl !== estado.pixelUrl;
      if ("pixelUrl" in c) estado.pixelUrl = c.pixelUrl;
      if (estado.punto && estado.pixelUrl && (cambiaSerie || c.idioma)) {
        seleccionar(estado.punto.lon, estado.punto.lat);
      } else if (cambiaSerie && !estado.pixelUrl) {
        ventana.remove();
      }
      if ("optical" in c) estado.optical = c.optical;
      if (c.compare) estado.compare = c.compare;
      if ("optical" in c || c.compare || c.idioma || c.aoi) aplicarComparador();
    },
    fijarOpacidad,
    encuadrar: () => map.fitBounds(estado.aoi, { padding: 32 }),
    destruir: () => {
      peticion?.abort();
      comparador?.destruir();
      comparador = null;
      map.remove();
      contenedor.replaceChildren();
      contenedor.classList.remove("atlas-mapa");
    },
  };
}
