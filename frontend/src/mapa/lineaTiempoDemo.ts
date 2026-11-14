// Banco de pruebas de la línea de tiempo (T-ATL-06). No es la app: Faro la monta en la suya.
// Parámetros de la URL: ?fecha=2026-07-01&tipo=urban_storm&hora=18:30&serie=…&lang=en
import { crearLineaTiempo, type EventoLinea, type LineaTiempoApi } from "./lineaTiempo";

const GATEWAY =
  import.meta.env.VITE_GATEWAY ?? import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

async function json<T>(ruta: string): Promise<T> {
  const r = await fetch(`${GATEWAY}${ruta}`);
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${ruta}`);
  return r.json();
}

async function main() {
  const q = new URLSearchParams(location.search);
  const idioma = q.get("lang") === "en" ? "en" : "es";
  const aviso = document.getElementById("aviso")!;
  const linea = crearLineaTiempo(document.getElementById("linea")!, {
    timeline: null,
    idioma,
    serie: q.get("serie") ?? undefined,
    onPassSelected: (p) => {
      aviso.textContent = `Pasada elegida: ${p.granule_id}`;
    },
  });
  try {
    const timeline = await json<LineaTiempoApi>("/api/catalog/aois/parral/timeline");
    let evento: EventoLinea | null = null;
    const fecha = q.get("fecha");
    if (fecha) {
      const p = new URLSearchParams({ date: fecha, lang: idioma });
      if (q.get("tipo")) p.set("event_type", q.get("tipo")!);
      if (q.get("hora")) p.set("time", q.get("hora")!);
      evento = await json<EventoLinea>(`/api/verdicts/aois/parral/events?${p}`);
    }
    linea.actualizar({ timeline, evento });
  } catch (e) {
    aviso.textContent = `No se pudo cargar la línea de tiempo desde ${GATEWAY}: ${String(e)}`;
  }
}

void main();
