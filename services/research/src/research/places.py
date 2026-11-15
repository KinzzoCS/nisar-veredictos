"""Lugares: un nomenclátor curado con procedencia y, opcional, el geocodificador Nominatim de OpenStreetMap.

Las cajas curadas son [oeste, sur, este, norte] en WGS84. Cada una dice de dónde sale; las que son una
delimitación nuestra (no un límite oficial) llevan `approximate: True`.
"""
from __future__ import annotations

import os
import time
import unicodedata
from dataclasses import asdict, dataclass

import httpx


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    bbox: tuple[float, float, float, float]
    source: str
    aliases: tuple[str, ...] = ()
    aoi: str | None = None
    approximate: bool = False
    note: str = ""

    def to_dict(self) -> dict:
        d = asdict(self)
        d["bbox"] = list(self.bbox)
        d.pop("aliases")
        return d


GAZETTEER: tuple[Place, ...] = (
    Place(
        "parral", "Hidalgo del Parral, Chihuahua", (-105.75, 26.87, -105.60, 26.98),
        "config/aois/parral.yaml (city_bbox)", ("parral", "hidalgo del parral", "ciudad de parral"), aoi="parral",
    ),
    Place(
        "parral_aoi", "Zona de estudio de Parral", (-105.95, 26.70, -105.40, 27.15),
        "config/aois/parral.yaml (bbox)", ("zona de parral", "alrededores de parral", "region de parral"), aoi="parral",
    ),
    Place(
        "la_prieta", "Mina La Prieta, Parral", (-105.68631, 26.91807, -105.64631, 26.95807),
        "OpenStreetMap (Nominatim), punto 26.93807, -105.66631, consultado el 2026-11-13; caja de ±0,02°",
        ("la prieta", "mina la prieta", "zonas mineras de hidalgo del parral", "zona minera de hidalgo del parral", "zonas mineras de parral", "zona minera de parral", "minas de parral"),
        aoi="parral", approximate=True,
        note="OSM marca la mina como atracción turística; la ubicación de los jales no está verificada.",
    ),
    Place(
        "la_boquilla", "Presa La Boquilla, Chihuahua", (-105.73, 27.46, -105.36, 27.60),
        "OpenStreetMap (water reservoir) con ~0,02° de margen, consultado el 2026-11-11",
        ("la boquilla", "presa la boquilla", "presa boquilla"),
        note="Fuera de la zona procesada de Parral (llega a 27,15° N).",
    ),
    Place(
        "sur_chihuahua", "Sur de Chihuahua", (-107.5, 25.6, -104.5, 27.6),
        "Delimitación propia del proyecto para el perfil de laderas", ("sur de chihuahua", "region sur de chihuahua"),
        approximate=True,
    ),
    Place(
        "sermeq_kujalleq", "Sermeq Kujalleq (Jakobshavn Isbræ), Groenlandia", (-50.2, 69.1, -49.6, 69.3),
        "Caja de trabajo alrededor del frente del glaciar; delimitación propia", ("jakobshavn", "sermeq kujalleq", "ilulissat"),
        approximate=True,
    ),
    Place(
        "helheim", "Glaciar Helheim, Groenlandia", (-38.6, 66.25, -38.0, 66.5),
        "Caja de trabajo alrededor del frente del glaciar; delimitación propia", ("helheim",), approximate=True,
    ),
    Place(
        "greenland", "Groenlandia", (-73.0, 59.7, -11.0, 83.7), "Caja envolvente de la isla",
        ("groenlandia", "greenland"), approximate=True,
    ),
)


def norm(text: str) -> str:
    t = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in t if not unicodedata.combining(c))


def find_in_text(text: str) -> list[Place]:
    """Lugares del nomenclátor nombrados en el texto, por orden de aparición y sin repetir."""
    t = norm(text)
    hits: list[tuple[int, int, Place]] = []
    for p in GAZETTEER:
        best = None
        for alias in (p.id.replace("_", " "), *p.aliases):
            i = t.find(alias)
            if i >= 0 and (best is None or len(alias) > best[1]):
                best = (i, len(alias))
        if best:
            hits.append((best[0], -best[1], p))
    hits.sort(key=lambda h: (h[0], h[1]))
    out: list[Place] = []
    spans: list[tuple[int, int]] = []
    for i, neg_len, p in hits:
        end = i - neg_len
        if any(s <= i < e for s, e in spans):  # alias contenido en otro más largo ya elegido
            continue
        spans.append((i, end))
        out.append(p)
    return out


def search_gazetteer(q: str) -> list[Place]:
    t = norm(q.strip())
    if not t:
        return []
    return [p for p in GAZETTEER if t in norm(p.name) or any(t in a or a in t for a in p.aliases)]


class Geocoder:
    """Nominatim de OpenStreetMap: una petición por búsqueda explícita, con caché y una por segundo como máximo
    (política de uso de Nominatim). Se activa con RESEARCH_GEOCODER=nominatim; sin ella, solo el nomenclátor."""

    URL = "https://nominatim.openstreetmap.org/search"

    def __init__(self, enabled: bool | None = None, client: httpx.Client | None = None):
        self.enabled = (os.environ.get("RESEARCH_GEOCODER", "") == "nominatim") if enabled is None else enabled
        self.client = client
        self._cache: dict[str, list[dict]] = {}
        self._last = 0.0

    def search(self, q: str, limit: int = 5) -> list[dict]:
        if not self.enabled or not q.strip():
            return []
        key = norm(q.strip())
        if key in self._cache:
            return self._cache[key]
        wait = 1.0 - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()
        client = self.client or httpx.Client(timeout=10, headers={"User-Agent": "dancing-with-the-sar-research/0.1"})
        r = client.get(self.URL, params={"q": q, "format": "jsonv2", "limit": limit})
        r.raise_for_status()
        out = []
        for e in r.json():
            s, n, w, ea = (float(x) for x in e["boundingbox"])
            out.append({
                "id": f"osm_{e.get('osm_type', 'x')}_{e.get('osm_id', '')}",
                "name": e.get("display_name", q),
                "bbox": [w, s, ea, n],
                "source": "OpenStreetMap Nominatim (ODbL)",
                "aoi": None,
                "approximate": False,
                "note": f"Tipo OSM: {e.get('category', '')}/{e.get('type', '')}",
            })
        self._cache[key] = out
        return out
