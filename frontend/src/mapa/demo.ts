// Banco de pruebas de Atlas. No es la app: Faro monta el mapa en la suya.
import * as maplibregl from "maplibre-gl";
import { RDBU } from "./leyenda";
import { crearMapa } from "./mapa";
import { registrarCargador } from "./protocolo";
import type { Bbox, CapaRadar } from "./tipos";

const GATEWAY = import.meta.env.VITE_GATEWAY ?? "http://localhost:8080";

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
    aviso.textContent = `Veredicto ${v.id} de la serie ${serie.id}, desde ${GATEWAY}.`;
    crearMapa(document.getElementById("mapa")!, {
      aoi: serie.bbox,
      nombreZona: "Hidalgo del Parral",
      dataKind: v.receipt.data_kind,
      layers,
      causaNoObservable: v.cause_label ?? undefined,
      onViewChanged: (vista) => console.debug("onViewChanged", vista),
      onLayerChanged: (c) => console.debug("onLayerChanged", c),
    });
  } catch (e) {
    aviso.textContent =
      `API no disponible en ${GATEWAY} (${(e as Error).message}). ` +
      "Extensión de config/aois/parral.yaml y teselas de PRUEBA generadas en el navegador.";
    registrarTeselasPrueba(BBOX_RESPALDO);
    crearMapa(document.getElementById("mapa")!, {
      aoi: BBOX_RESPALDO,
      nombreZona: "Hidalgo del Parral",
      dataKind: "synthetic",
      layers: {
        state: "atlas-prueba://{z}/{x}/{y}",
        change_hh: "atlas-prueba-cambio://{z}/{x}/{y}?rescale=-10,10",
        change_hv: "atlas-prueba-cambio://{z}/{x}/{y}?rescale=-10,10",
      },
      causaNoObservable: "muy pocas muestras de radar por píxel (texto de prueba)",
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

function registrarTeselasPrueba(bbox: Bbox) {
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
