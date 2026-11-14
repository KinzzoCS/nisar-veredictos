// Banco de pruebas de Atlas. No es la app: Faro monta el mapa en la suya.
import * as maplibregl from "maplibre-gl";
import { RDBU } from "./leyenda";
import { avisoEscena, type DesplazamientoEscenaApi } from "./escena";
import { crearMapa } from "./mapa";
import { ErrorHttp, registrarCargador } from "./protocolo";
import type { Bbox, CapaRadar, MapaAtlas } from "./tipos";
import type { EstadoOptico, VistaOptica } from "../types/map";

const GATEWAY =
  import.meta.env.VITE_GATEWAY ?? import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

// ?3d abre el globo (T-ATL-09); ?sin-comparador lo quita, porque con él el mapa queda en 2D.
const PARAMS = new URLSearchParams(location.search);
const MODO_3D = PARAMS.has("3d");
const CON_COMPARADOR = !PARAMS.has("sin-comparador");

declare global {
  interface Window {
    /** Para probar `actualizar` desde la consola del navegador. */
    atlasMapa?: MapaAtlas;
  }
}

// Respaldo solo para desarrollar sin la pila levantada; se avisa en pantalla.
const BBOX_RESPALDO: Bbox = [-105.95, 26.7, -105.4, 27.15]; // config/aois/parral.yaml

interface SerieApi {
  id: string;
  bbox: Bbox;
  data_kind: "real" | "synthetic";
}
interface VeredictoApi {
  id: string;
  layers: Record<CapaRadar, string>;
  cause_label: string | null;
  receipt: { data_kind: "real" | "synthetic" };
  /** Llega con el PR 19 de Balanza; antes no existe. */
  evidence?: {
    optical?: { before: LadoOpticoApi; after: LadoOpticoApi };
    /** Llega con el PR 37 de Balanza; `corrected`, con el PR 42. */
    scene_shift?: DesplazamientoEscenaApi | null;
  };
}
interface LadoOpticoApi {
  status: EstadoOptico;
  scene: {
    acquired_at: string;
    days_from_radar: number;
    covers_aoi: boolean;
    max_cloud_cover: number;
    attribution: string;
    tiles: { tile_url: string }[];
  } | null;
}

/** Lo mismo que hará Faro: un lado de evidence.optical a VistaOptica (specs/04-atlas/plan.md). */
function vistaDesdeApi(l: LadoOpticoApi): VistaOptica {
  if (!l.scene) return { status: l.status, tiles: [] };
  return {
    status: l.status,
    tiles: l.scene.tiles.map((t) => GATEWAY + t.tile_url),
    attribution: l.scene.attribution,
    cloudCover: l.scene.max_cloud_cover,
    acquiredAt: l.scene.acquired_at,
    daysFromRadar: l.scene.days_from_radar,
    coversAoi: l.scene.covers_aoi,
  };
}

async function json<T>(ruta: string): Promise<T> {
  const r = await fetch(`${GATEWAY}${ruta}`);
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${ruta}`);
  return r.json();
}

async function main() {
  const aviso = document.getElementById("aviso")!;
  try {
    const [serie] = await json<SerieApi[]>("/api/verdicts/aois/parral/series");
    const [v] = await json<VeredictoApi[]>(
      `/api/verdicts/aois/parral/series/${serie.id}/verdicts?lang=es`,
    );
    const layers = Object.fromEntries(
      Object.entries(v.layers).map(([k, t]) => [k, GATEWAY + t]),
    ) as Record<CapaRadar, string>;
    const optica = v.evidence?.optical;
    aviso.textContent =
      `Veredicto ${v.id} de la serie ${serie.id}, desde ${GATEWAY}.` +
      (optica ? "" : " La API aún no trae evidence.optical (PR 19): sin comparador.");
    window.atlasMapa = crearMapa(document.getElementById("mapa")!, {
      aoi: serie.bbox,
      nombreZona: "Hidalgo del Parral",
      dataKind: v.receipt.data_kind,
      layers,
      causaNoObservable: v.cause_label ?? undefined,
      desplazamientoEscena: avisoEscena(v.evidence?.scene_shift),
      pixelUrl: `${GATEWAY}/api/verdicts/aois/parral/series/${serie.id}/pixel`,
      optical: optica && { before: vistaDesdeApi(optica.before), after: vistaDesdeApi(optica.after) },
      compare: CON_COMPARADOR ? "swipe" : "off",
      modo3d: MODO_3D,
      onPointSelected: (p) => console.debug("onPointSelected", p),
      onViewChanged: (vista) => console.debug("onViewChanged", vista),
      onLayerChanged: (c) => console.debug("onLayerChanged", c),
    });
  } catch (e) {
    aviso.textContent =
      `API no disponible en ${GATEWAY} (${(e as Error).message}). ` +
      "Extensión de config/aois/parral.yaml y teselas de PRUEBA generadas en el navegador.";
    registrarTeselasPrueba(BBOX_RESPALDO);
    window.atlasMapa = crearMapa(document.getElementById("mapa")!, {
      aoi: BBOX_RESPALDO,
      nombreZona: "Hidalgo del Parral",
      dataKind: "synthetic",
      layers: {
        state: "atlas-prueba://{z}/{x}/{y}",
        change_hh: "atlas-prueba-cambio://{z}/{x}/{y}?rescale=-10,10",
        change_hv: "atlas-prueba-cambio://{z}/{x}/{y}?rescale=-10,10",
      },
      causaNoObservable: "muy pocas muestras de radar por píxel (texto de prueba)",
      // De prueba: enseña la nota de desplazamiento ya descontado. "sin_corregir" enseña el aviso.
      desplazamientoEscena: "corregido",
      pixelUrl: RUTA_PIXEL_PRUEBA,
      // Óptico de PRUEBA: dibujos generados en el navegador, no una escena Sentinel-2.
      optical: {
        before: {
          status: "clear",
          tiles: ["atlas-prueba-optico://oeste/{z}/{x}/{y}", "atlas-prueba-optico://este/{z}/{x}/{y}"],
          attribution: "PRUEBA: imagen generada en el navegador, no es Sentinel-2",
          cloudCover: 12.5,
          acquiredAt: "2026-06-28T17:46:21Z",
          daysFromRadar: -1,
          coversAoi: true,
        },
        after: { status: "none_in_window", tiles: [] },
      },
      compare: CON_COMPARADOR ? "swipe" : "off",
      modo3d: MODO_3D,
      onPointSelected: (p) => console.debug("onPointSelected", p),
      onViewChanged: (vista) => console.debug("onViewChanged", vista),
      onLayerChanged: (c) => console.debug("onLayerChanged", c),
    });
  }
}

// ---- Teselas de prueba: formas geométricas, no datos -------------------------

function lonLat(z: number, x: number, y: number, px: number, py: number): [number, number] {
  const n = 2 ** z;
  const lon = ((x + px / 256) / n) * 360 - 180;
  const t = Math.PI * (1 - (2 * (y + py / 256)) / n);
  return [lon, (Math.atan(Math.sinh(t)) * 180) / Math.PI];
}

function zxy(url: string): [number, number, number] {
  const [z, x, y] = url.split("://")[1].split("?")[0].split("/").map(Number);
  return [z, x, y];
}

function dentro([lon, lat]: [number, number], [o, s, e, n]: Bbox) {
  return lon >= o && lon <= e && lat >= s && lat <= n;
}

/** Códigos: 1 en un círculo junto a Parral, 13 en una franja oeste y 15 en un círculo al sureste. */
function codigoPrueba([lon, lat]: [number, number]): number {
  if (Math.hypot(lon + 105.66, lat - 26.93) < 0.05) return 1;
  if (lon < -105.85) return 13;
  if (Math.hypot(lon + 105.52, lat - 26.8) < 0.04) return 15;
  return 0;
}

async function teselaPng(
  url: string,
  pixel: (ll: [number, number]) => [number, number, number, number],
): Promise<Blob> {
  const [z, x, y] = zxy(url);
  const lienzo = new OffscreenCanvas(256, 256);
  const ctx = lienzo.getContext("2d")!;
  const datos = ctx.createImageData(256, 256);
  for (let py = 0; py < 256; py++) {
    for (let px = 0; px < 256; px++) {
      datos.data.set(pixel(lonLat(z, x, y, px + 0.5, py + 0.5)), (py * 256 + px) * 4);
    }
  }
  ctx.putImageData(datos, 0, 0);
  return lienzo.convertToBlob({ type: "image/png" });
}

// Serie por píxel de prueba: el banco de pruebas intercepta fetch solo para esta ruta.
const RUTA_PIXEL_PRUEBA = "http://atlas-prueba.invalid/pixel";
const FECHAS_PRUEBA = ["2026-06-17", "2026-06-29", "2026-07-11", "2026-07-23", "2026-08-16"];

function seriePixelPrueba(lon: number, lat: number, bbox: Bbox) {
  if (!dentro([lon, lat], bbox)) return null;
  const c = codigoPrueba([lon, lat]);
  const estado = c === 1 ? "change_probable" : c === 13 ? "low_looks" : c === 15 ? "terrain" : "no_change";
  const values = FECHAS_PRUEBA.map((date, i) => ({
    date,
    hh_db: c >= 10 && i === 2 ? null : -11 + Math.sin(i + lon * 50) * 1.5 - (c === 1 && i >= 3 ? 7 : 0),
    hv_db: c >= 10 && i === 2 ? null : -18 + Math.cos(i + lat * 50) * 1.2,
  }));
  const changes = FECHAS_PRUEBA.slice(1).map((d, i) => ({
    pair: `${FECHAS_PRUEBA[i].replaceAll("-", "")}_${d.replaceAll("-", "")}`,
    state: i === 2 ? estado : c === 1 ? "no_change" : estado,
  }));
  return { aoi: "parral", series: "PRUEBA", lon, lat, data_kind: "synthetic", values, changes };
}

function interceptarPixelPrueba(bbox: Bbox) {
  const original = window.fetch.bind(window);
  window.fetch = async (entrada, init) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    if (!url.startsWith(RUTA_PIXEL_PRUEBA)) return original(entrada, init);
    const q = new URL(url).searchParams;
    await new Promise((r) => setTimeout(r, 300)); // simula la red
    const s = seriePixelPrueba(Number(q.get("lon")), Number(q.get("lat")), bbox);
    return s
      ? new Response(JSON.stringify(s), { headers: { "content-type": "application/json" } })
      : new Response(JSON.stringify({ detail: "El punto queda fuera de la serie" }), { status: 404 });
  };
}

/**
 * Óptico de prueba en dos "teselas" (mitad oeste y mitad este de la zona). Fuera de su
 * mitad responde 404, como TiTiler fuera de la huella MGRS, para probar la tesela vacía.
 */
function registrarOpticoPrueba([o, s, e, n]: Bbox) {
  const mitad = (o + e) / 2;
  registrarCargador("atlas-prueba-optico", async (url) => {
    const [parte, z, x, y] = url.split("://")[1].split("/");
    const [zi, xi, yi] = [z, x, y].map(Number);
    const huella: Bbox = parte === "oeste" ? [o - 0.05, s, mitad, n] : [mitad, s, e + 0.05, n];
    // ¿La tesela XYZ toca la huella? Si no, 404.
    const [lo1, la1] = lonLat(zi, xi, yi, 0, 256);
    const [lo2, la2] = lonLat(zi, xi, yi, 256, 0);
    if (lo2 < huella[0] || lo1 > huella[2] || la2 < huella[1] || la1 > huella[3]) {
      throw new ErrorHttp(404, url);
    }
    return teselaPng(`x://${zi}/${xi}/${yi}`, (ll) => {
      if (!dentro(ll, huella)) return [0, 0, 0, 0];
      if (codigoPrueba(ll) === 1) return [40, 90, 150, 255]; // "agua" donde el radar ve cambio
      const v = Math.sin(ll[0] * 90) * Math.cos(ll[1] * 70);
      return v > 0 ? [120, 140, 80, 255] : [170, 150, 110, 255];
    });
  });
}

function registrarTeselasPrueba(bbox: Bbox) {
  registrarOpticoPrueba(bbox);
  interceptarPixelPrueba(bbox);
  // Igual que la API con la paleta de Atlas: código en el canal rojo, nodata transparente.
  registrarCargador("atlas-prueba", (url) =>
    teselaPng(url, (ll) => {
      if (!dentro(ll, bbox)) return [0, 0, 0, 0];
      const c = codigoPrueba(ll);
      return c === 0 ? [0, 0, 0, 0] : [c, 0, 0, 255];
    }),
  );

  // Cambio continuo en dB, coloreado con rdbu como TiTiler; NaN (no observable) transparente.
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  maplibregl.addProtocol("atlas-prueba-cambio", async (params) => {
    const blob = await teselaPng(params.url, (ll) => {
      if (!dentro(ll, bbox) || codigoPrueba(ll) >= 10) return [0, 0, 0, 0];
      const db = codigoPrueba(ll) === 1 ? -8 : 6 * Math.sin(ll[0] * 40) * Math.cos(ll[1] * 40);
      const i = Math.round(((db + 10) / 20) * (RDBU.length - 1));
      return [...hex(RDBU[Math.min(RDBU.length - 1, Math.max(0, i))]), 255] as [
        number, number, number, number,
      ];
    });
    return { data: await blob.arrayBuffer() };
  });
}

main();
