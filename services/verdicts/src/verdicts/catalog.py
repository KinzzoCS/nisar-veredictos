"""Cliente HTTP de catalog (Antena): línea de tiempo y escenas ópticas. Nunca importa código de catalog."""
from __future__ import annotations

import datetime as dt
import time
from dataclasses import dataclass
from typing import Callable, Protocol

import httpx

# Tiempos cortos: si catalog tarda, el veredicto sale igual y dice que falta la latencia.
TIMEOUT_SECONDS = 3.0
CACHE_SECONDS = 600
FAILURE_CACHE_SECONDS = 60


class CatalogUnavailable(RuntimeError):
    """catalog no respondió o devolvió algo que no se puede leer."""


@dataclass(frozen=True)
class PassTime:
    acquired_at: dt.datetime
    published_at: dt.datetime | None
    latency_hours: float | None


class TimelineSource(Protocol):
    def passes(self, aoi: str) -> dict[str, PassTime]:
        """Pasadas de la zona por id de gránulo. Lanza CatalogUnavailable si no hay respuesta."""


def granule_key(granule_id: str) -> str:
    """El id de CMR y el de identification/granuleId pueden diferir solo en la extensión."""
    return granule_id.removesuffix(".h5")


def _parse(body: dict) -> dict[str, PassTime]:
    result = {}
    for item in body["passes"]:
        published = item.get("published_at")
        result[granule_key(item["granule_id"])] = PassTime(
            acquired_at=dt.datetime.fromisoformat(item["acquired_at"]),
            published_at=dt.datetime.fromisoformat(published) if published else None,
            latency_hours=item.get("latency_hours"),
        )
    return result


class HttpTimeline:
    """Lee GET {base}/aois/{aoi}/timeline y guarda el resultado unos minutos."""

    def __init__(self, base_url: str, client: httpx.Client | None = None, monotonic: Callable[[], float] = time.monotonic):
        self.base_url = base_url.rstrip("/")
        self.client = client or httpx.Client(timeout=TIMEOUT_SECONDS)
        self.monotonic = monotonic
        self._cache: dict[str, tuple[float, dict[str, PassTime] | None]] = {}

    def passes(self, aoi: str) -> dict[str, PassTime]:
        now = self.monotonic()
        cached = self._cache.get(aoi)
        if cached and cached[0] > now:
            if cached[1] is None:
                raise CatalogUnavailable(aoi)
            return cached[1]
        try:
            response = self.client.get(f"{self.base_url}/aois/{aoi}/timeline")
            response.raise_for_status()
            result = _parse(response.json())
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            self._cache[aoi] = (now + FAILURE_CACHE_SECONDS, None)
            raise CatalogUnavailable(aoi) from exc
        self._cache[aoi] = (now + CACHE_SECONDS, result)
        return result


# --- T-BAL-04: escenas Sentinel-2 de catalog ---------------------------------------------

# Earth Search puede tardar varios segundos en la primera consulta; catalog la guarda una hora.
OPTICAL_TIMEOUT_SECONDS = 15.0


@dataclass(frozen=True)
class OpticalTile:
    tile: str
    cloud_cover: float
    visual_url: str


@dataclass(frozen=True)
class OpticalAcquisition:
    platform: str
    acquired_at: dt.datetime
    covers_aoi: bool
    max_cloud_cover: float
    tiles: tuple[OpticalTile, ...]


@dataclass(frozen=True)
class OpticalReference:
    source: str
    collection: str
    license: str
    license_url: str
    attribution: str
    acquisitions: tuple[OpticalAcquisition, ...]


class OpticalSource(Protocol):
    def scenes(self, aoi: str, day: dt.date, days: int) -> OpticalReference:
        """Todas las adquisiciones a ±days de day, sin filtrar nubes. Lanza CatalogUnavailable si no hay respuesta."""


def _parse_optical(body: dict) -> OpticalReference:
    acquisitions = []
    for item in body["acquisitions"]:
        tiles = tuple(
            OpticalTile(tile=str(tile["tile"]), cloud_cover=float(tile["cloud_cover"]), visual_url=tile["visual_url"])
            for tile in item["tiles"]
            if str(tile["visual_url"]).startswith("https://")
        )
        if not tiles:
            continue
        acquisitions.append(
            OpticalAcquisition(
                platform=item["platform"],
                acquired_at=dt.datetime.fromisoformat(item["acquired_at"].replace("Z", "+00:00")),
                covers_aoi=bool(item["covers_aoi"]),
                max_cloud_cover=float(item["max_cloud_cover"]),
                tiles=tiles,
            )
        )
    return OpticalReference(
        source=body["source"],
        collection=body["collection"],
        license=body["license"],
        license_url=body["license_url"],
        attribution=body["attribution"],
        acquisitions=tuple(acquisitions),
    )


class HttpOptical:
    """Lee GET {base}/aois/{aoi}/references/optical sin límite de nubes; la selección la hace verdicts."""

    def __init__(
        self, base_url: str, client: httpx.Client | None = None, monotonic: Callable[[], float] = time.monotonic
    ):
        self.base_url = base_url.rstrip("/")
        self.client = client or httpx.Client(timeout=OPTICAL_TIMEOUT_SECONDS)
        self.monotonic = monotonic
        self._cache: dict[tuple[str, dt.date, int], tuple[float, OpticalReference | None]] = {}

    def scenes(self, aoi: str, day: dt.date, days: int) -> OpticalReference:
        key = (aoi, day, days)
        now = self.monotonic()
        cached = self._cache.get(key)
        if cached and cached[0] > now:
            if cached[1] is None:
                raise CatalogUnavailable(aoi)
            return cached[1]
        try:
            response = self.client.get(
                f"{self.base_url}/aois/{aoi}/references/optical",
                params={"date": day.isoformat(), "days": days, "max_cloud": 100},
            )
            response.raise_for_status()
            result = _parse_optical(response.json())
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            self._cache[key] = (now + FAILURE_CACHE_SECONDS, None)
            raise CatalogUnavailable(aoi) from exc
        self._cache[key] = (now + CACHE_SECONDS, result)
        return result
