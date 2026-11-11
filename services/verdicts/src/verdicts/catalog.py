"""Cliente HTTP de la línea de tiempo de catalog (Antena). Nunca importa código de catalog."""
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
