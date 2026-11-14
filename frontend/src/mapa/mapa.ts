import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre 6 busca su worker junto a su propio módulo. En `vite build` ese módulo
// queda dentro del bundle y el worker no se copia: "Worker failed to load" y mapa
// en blanco. Con ?url, Vite emite el worker y le pasamos su ruta (vale también
// para el comparador, porque es un ajuste global).
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "./mapa.css";
import { crearComparador, type Comparador } from "./comparador";
import { normalizarAvisoEscena } from "./escena";
import { Control3d } from "./control3d";
import { capacidadGrafica, elegirProyeccion, escalaValida, transicionGlobo } from "./globo";
import { crearLeyenda, limitarOpacidad, rangoReescalado } from "./leyenda";
import { ladoDisponible } from "./optico";
import {
  atribuciones,
  bboxContinuo,
  contornoZona,
  estiloMapaBase,
  textoExtension,
  validarBbox,
} from "./mapaBase";
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

maplibregl.setWorkerUrl(workerUrl);

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
  const capacidad = capacidadGrafica();
  if (capacidad === "sin_webgl2") return mapaSinWebgl(contenedor, opciones);

  const estado = {
    aoi: validarBbox(opciones.aoi),
    zona: opciones.nombreZona,
    layers: opciones.layers,
    capa: opciones.activeLayer ?? ("state" as CapaRadar),
    causa: opciones.causaNoObservable,
    avisoEscena: normalizarAvisoEscena(opciones.desplazamientoEscena),
    dataKind: opciones.dataKind,
    idioma: opciones.idioma ?? "es",
    opacidad: 0.85,
    pixelUrl: opciones.pixelUrl,
    punto: null as { lon: number; lat: number } | null,
    optical: opciones.optical,
    compare: opciones.compare ?? "off",
    modo3d: opciones.modo3d ?? false,
    falloGlobo: false,
  };

  // Comparador óptico (T-ATL-07): solo con compare "swipe" y al menos un lado con datos.
  const quiereComparador = () =>
    estado.compare === "swipe" && ladoDisponible(estado.optical, "after") !== null;
  const proyeccion = () =>
    elegirProyeccion({
      modo3d: estado.modo3d,
      capacidad,
      falloGlobo: estado.falloGlobo,
      comparadorActivo: quiereComparador(),
    });

  contenedor.classList.add("atlas-mapa");
  const lienzo = document.createElement("div");
  lienzo.className = "atlas-lienzo";
  contenedor.append(lienzo);

  const map = new maplibregl.Map({
    container: lienzo,
    style: estiloMapaBase(proyeccion().tipo),
    bounds: bboxContinuo(estado.aoi),
    fitBoundsOptions: { padding: 32 },
    attributionControl: false,
    // En 2D, sin giro ni inclinación: la escala y el contorno se leen con el norte arriba.
    // En 3D se activan (T-ATL-10); ver aplicarInteraccion.
    dragRotate: false,
    pitchWithRotate: true,
    touchPitch: false,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();

  // La atribución se monta con textos propios para que siga al idioma y al tipo de dato.
  let atribucion: maplibregl.AttributionControl | null = null;
  let atribucionActual = "";
  function ponerAtribucion() {
    const textos = atribuciones(estado.idioma, Boolean(estado.layers) && estado.dataKind === "real");
    const clave = textos.join("|");
    if (atribucion && clave === atribucionActual) return;
    if (atribucion) map.removeControl(atribucion);
    atribucion = new maplibregl.AttributionControl({ compact: false, customAttribution: textos });
    map.addControl(atribucion, "bottom-right");
    atribucionActual = clave;
  }
  ponerAtribucion();
  const escala = new maplibregl.ScaleControl({ unit: "metric", maxWidth: 120 });
  map.addControl(escala, "bottom-left");
  // La brújula solo se ve en 3D (CSS con .atlas-plano): devuelve el norte y quita la inclinación.
  map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
  const control3d =
    opciones.control3d === false
      ? null
      : new Control3d(() => {
          estado.modo3d = !estado.modo3d;
          aplicarComparador();
          redibujarLeyenda();
          opciones.onModo3dChanged?.(estado.modo3d);
        });
  if (control3d) {
    map.addControl(control3d, "top-right");
    contenedor.classList.add("atlas-con-3d");
  }

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
  // Por qué el mapa está en 2D si se pidió el 3D (RF-INT-17).
  const aviso3d = document.createElement("div");
  aviso3d.className = "atlas-aviso-3d";
  aviso3d.setAttribute("role", "status");
  // Sustituye a la barra de escala cuando no vale (RF-INT-13).
  const avisoEscala = document.createElement("div");
  avisoEscala.className = "atlas-aviso-escala";
  avisoEscala.hidden = true;
  contenedor.append(cruz, ayuda, anuncio, aviso3d, avisoEscala);

  // setProjection necesita el estilo cargado; antes, la proyección va en el propio estilo.
  let cargado = false;
  let proyeccionActual = proyeccion().tipo;
  function aplicarProyeccion() {
    let p = proyeccion();
    if (p.tipo !== proyeccionActual && cargado) {
      try {
        map.setProjection({ type: p.tipo });
      } catch (e) {
        console.warn("[atlas] el globo falló; el mapa sigue en 2D", e);
        estado.falloGlobo = true;
        p = proyeccion();
        map.setProjection({ type: p.tipo });
      }
      proyeccionActual = p.tipo;
      // La ayuda del teclado y la leyenda cuentan las teclas de 3D solo con el globo.
      redibujarTextos();
      redibujarLeyenda();
    }
    aviso3d.textContent = p.motivo ? TEXTOS[estado.idioma].sin3d[p.motivo] : "";
    aviso3d.hidden = !p.motivo;
    control3d?.dibujar({ pulsado: estado.modo3d, idioma: estado.idioma });
    aplicarInteraccion();
    actualizarEscala();
  }

  const sinAnimacion = () =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Giro e inclinación solo con el globo; al volver a 2D, norte arriba y sin inclinación. */
  function aplicarInteraccion() {
    const en3d = proyeccionActual === "globe";
    contenedor.classList.toggle("atlas-plano", !en3d);
    if (en3d) {
      map.dragRotate.enable();
      map.touchPitch.enable();
      map.touchZoomRotate.enableRotation();
      map.keyboard.enableRotation();
      return;
    }
    map.dragRotate.disable();
    map.touchPitch.disable();
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    if (map.getBearing() !== 0 || map.getPitch() !== 0) {
      if (sinAnimacion()) map.jumpTo({ bearing: 0, pitch: 0 });
      else map.easeTo({ bearing: 0, pitch: 0 });
    }
  }

  /** `transitionState` de la proyección de MapLibre es interno: si no está, se estima por el zoom. */
  function transicion(): number {
    const leido = (map as unknown as { style?: { projection?: { transitionState?: number } } }).style
      ?.projection?.transitionState;
    return transicionGlobo(map.getZoom(), leido);
  }

  function actualizarEscala() {
    const ok = escalaValida({ tipo: proyeccionActual, pitch: map.getPitch(), transicion: transicion() });
    const barra = contenedor.querySelector<HTMLElement>(".maplibregl-ctrl-scale");
    if (barra) barra.style.display = ok ? "" : "none";
    avisoEscala.hidden = ok;
    if (!ok) avisoEscala.textContent = TEXTOS[estado.idioma].sinEscala;
  }
  map.on("move", actualizarEscala);

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
    } else if ((e.key === "n" || e.key === "N") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Volver al norte y quitar la inclinación (RF-INT-15). En 2D ya está así.
      if (map.getBearing() !== 0 || map.getPitch() !== 0) {
        e.preventDefault();
        if (sinAnimacion()) map.jumpTo({ bearing: 0, pitch: 0 });
        else map.resetNorthPitch();
      }
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
      teclas3d: proyeccionActual === "globe",
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
    ayuda.textContent =
      proyeccionActual === "globe" ? `${t.ayudaTeclado}. ${t.teclas3d}` : t.ayudaTeclado;
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
    const fuentes: Record<(typeof IDS_RADAR)[number], string> = {
      "radar-state": plantillaEstado(estado.layers.state, "cambio"),
      "radar-change_hh": estado.layers.change_hh,
      "radar-change_hv": estado.layers.change_hv,
      "radar-trama": plantillaEstado(estado.layers.state, "trama"),
    };
    for (const id of IDS_RADAR) {
      map.addSource(id, { type: "raster", tiles: [fuentes[id]], tileSize: 256 });
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
    cargado = true;
    aplicarProyeccion();
  });

  let comparador: Comparador | null = null;

  function aplicarComparador() {
    const activo = quiereComparador();
    // Antes que el comparador: su mapa óptico copia la cámara del principal ya en 2D.
    aplicarProyeccion();
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
        map.fitBounds(bboxContinuo(estado.aoi), { padding: 32 });
      }
      if ("nombreZona" in c) estado.zona = c.nombreZona;
      if ("causaNoObservable" in c) estado.causa = c.causaNoObservable;
      if ("desplazamientoEscena" in c) estado.avisoEscena = normalizarAvisoEscena(c.desplazamientoEscena);
      if (c.idioma) estado.idioma = c.idioma;
      if (c.activeLayer) estado.capa = c.activeLayer;
      const recargar = "layers" in c || (c.dataKind && c.dataKind !== estado.dataKind);
      if ("layers" in c) estado.layers = c.layers;
      if (c.dataKind) estado.dataKind = c.dataKind;
      if (c.idioma || "layers" in c || c.dataKind) ponerAtribucion();
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
      if ("modo3d" in c) estado.modo3d = c.modo3d ?? false;
      if ("optical" in c || c.compare || c.idioma || c.aoi || "modo3d" in c) aplicarComparador();
    },
    fijarOpacidad,
    encuadrar: () => map.fitBounds(bboxContinuo(estado.aoi), { padding: 32 }),
    destruir: () => {
      peticion?.abort();
      comparador?.destruir();
      comparador = null;
      map.remove();
      contenedor.replaceChildren();
      contenedor.classList.remove("atlas-mapa", "atlas-con-3d", "atlas-plano");
    },
  };
}

/** Sin WebGL 2, MapLibre no dibuja nada: se dice y se deja la zona en texto, sin romper la página. */
function mapaSinWebgl(contenedor: HTMLElement, opciones: OpcionesMapa): MapaAtlas {
  let aoi = validarBbox(opciones.aoi);
  let zona = opciones.nombreZona;
  let idioma = opciones.idioma ?? "es";
  let dataKind = opciones.dataKind;
  contenedor.classList.add("atlas-mapa", "atlas-sin-mapa");
  const extension = document.createElement("div");
  extension.className = "atlas-extension";
  extension.append(document.createElement("strong"), document.createElement("span"));
  const sello = document.createElement("div");
  sello.className = "atlas-sintetico";
  sello.setAttribute("role", "status");
  const aviso = document.createElement("p");
  aviso.className = "atlas-aviso-sin-mapa";
  aviso.setAttribute("role", "alert");
  contenedor.append(extension, sello, aviso);
  function dibujar() {
    const t = TEXTOS[idioma];
    extension.querySelector("strong")!.textContent = t.extensionDe(zona ?? t.zonaPorDefecto);
    extension.querySelector("span")!.textContent = textoExtension(aoi);
    sello.textContent = t.sintetico;
    sello.hidden = dataKind !== "synthetic";
    aviso.textContent = t.sinMapa;
  }
  dibujar();
  return {
    actualizar(c) {
      if (c.aoi) aoi = validarBbox(c.aoi);
      if ("nombreZona" in c) zona = c.nombreZona;
      if (c.idioma) idioma = c.idioma;
      if (c.dataKind) dataKind = c.dataKind;
      dibujar();
    },
    fijarOpacidad: () => {},
    encuadrar: () => {},
    destruir: () => {
      contenedor.replaceChildren();
      contenedor.classList.remove("atlas-mapa", "atlas-sin-mapa");
    },
  };
}
