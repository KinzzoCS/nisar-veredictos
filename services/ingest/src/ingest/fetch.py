"""Trae por HTTPS solo el recorte de una zona, sin descargar gránulos completos."""
from __future__ import annotations

import asyncio
import json
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable
from urllib.parse import quote, urlsplit

import aiohttp
import fsspec

from .subset import subset

# Valores que documenta ASF para leer NISAR por HTTPS.
CACHE_TYPE = "background"
BLOCK_SIZE = 16 * 1024 * 1024
NASA_HOST_SUFFIX = ".earthdatacloud.nasa.gov"


class FetchError(RuntimeError):
    """No se pudo obtener un gránulo; el mensaje nunca incluye el token."""


@dataclass(frozen=True)
class FetchResult:
    target: Path
    written: list[str]
    skipped: list[str]
    excluded: list[str] = field(default_factory=list)  # Declarados inservibles en la zona; no se traen.
    stale: list[str] = field(default_factory=list)  # Excluidos que siguen en disco; processor los leería.


def is_nasa_url(url: str) -> bool:
    parts = urlsplit(url)
    return parts.scheme == "https" and (parts.hostname or "").endswith(NASA_HOST_SUFFIX)


def get_json(url: str) -> list[dict]:
    request = urllib.request.Request(url, headers={"User-Agent": "nisar-veredictos"})
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.load(response)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise FetchError(f"El servicio catalog no respondió en {url}") from exc


def open_remote(url: str, token: str, block_size: int):
    filesystem = fsspec.filesystem(
        "https",
        client_kwargs={"headers": {"Authorization": f"Bearer {token}"}, "trust_env": False},
        skip_instance_cache=True,
    )
    return filesystem.open(url, mode="rb", cache_type=CACHE_TYPE, block_size=block_size)


def select_series(available: list[dict], wanted: dict) -> dict:
    """Localiza la serie configurada; si hay varias versiones no elige por su cuenta."""
    matches = [
        item
        for item in available
        if (item["track"], item["direction"], item["frame"]) == (wanted["track"], wanted["direction"], wanted["frame"])
    ]
    if len(matches) != 1:
        found = ", ".join(item["id"] for item in matches) or "ninguna"
        raise FetchError(f"Se esperaba una serie para {wanted['id']} y se encontró: {found}")
    return matches[0]


def _subset_one(granule: dict, bbox: list[float], wanted: dict, destination: Path, token: str, block_size: int) -> None:
    partial = destination.with_suffix(".part")
    try:
        with open_remote(granule["download_url"], token, block_size) as remote:
            subset(remote, bbox, wanted, partial)
        partial.replace(destination)
    except (OSError, aiohttp.ClientError, asyncio.TimeoutError) as exc:
        raise FetchError(
            f"No se pudo leer {granule['id']} ({type(exc).__name__}). Revisa el token de Earthdata y la conexión."
        ) from exc
    finally:
        partial.unlink(missing_ok=True)


def fetch_series(
    aoi: dict,
    series_id: str,
    data_dir: Path,
    token: str,
    catalog_url: str,
    limit: int | None = None,
    json_getter: Callable[[str], list[dict]] = get_json,
    is_allowed: Callable[[str], bool] = is_nasa_url,
    block_size: int = BLOCK_SIZE,
) -> FetchResult:
    wanted = next((item for item in aoi["series"] if item["id"] == series_id), None)
    if wanted is None:
        raise FetchError(f"La serie {series_id} no está configurada en la zona {aoi['id']}")

    available = json_getter(f"{catalog_url.rstrip('/')}/aois/{quote(aoi['id'], safe='')}/series")
    granules = select_series(available, wanted)["granules"]
    # Se aplica aquí también, por si catalog todavía no conoce la exclusión.
    banned = {entry["granule"] for entry in wanted.get("exclude") or []}
    excluded = [granule["id"] for granule in granules if granule["id"] in banned]
    granules = [granule for granule in granules if granule["id"] not in banned]

    if limit is not None:
        granules = granules[:limit]

    target = data_dir / "raw" / "real" / aoi["id"] / series_id
    target.mkdir(parents=True, exist_ok=True)
    stale = sorted(name for name in banned if (target / f"{name}.h5").exists())
    written, skipped = [], []
    for granule in granules:
        url = granule["download_url"]
        if not is_allowed(url):
            raise FetchError(f"{granule['id']}: enlace rechazado, no se envía el token a {urlsplit(url).hostname}")
        destination = target / f"{granule['id']}.h5"
        if destination.exists():
            skipped.append(granule["id"])
            continue
        _subset_one(granule, aoi["bbox"], wanted, destination, token, block_size)
        written.append(granule["id"])
    return FetchResult(target=target, written=written, skipped=skipped, excluded=excluded, stale=stale)
