"""Contraste del agua que sugiere el radar con OPERA DSWx-S1 (T-BAL-08, RF-BAL-07).

Para cada fecha de radar se elige la pasada DSWx-S1 más cercana a ±SEARCH_DAYS y se compara,
píxel a píxel y sobre la malla de DSWx-S1 (30 m), su clasificación de agua (capa B01_WTR) con
una máscara de agua del radar hecha con umbrales fijos. El resultado es acuerdo o desacuerdo
entre dos métodos: nunca dice cuál de los dos acierta.

Solo se compara con radar real. Leer B01_WTR pide una cuenta de Earthdata: sin token, el
producto se lista igual y se declara que no se comparó.
"""
from __future__ import annotations

import datetime as dt
import math
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Literal, Protocol
from urllib.parse import urlsplit

import httpx
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.errors import RasterioError
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT
from rasterio.warp import reproject, transform_bounds

from .catalog import OperaAcquisition, OperaReference

# Ventana por omisión de la ruta de catalog (RF-ANT-06).
SEARCH_DAYS = 7

# Máscara de agua del radar: umbrales del método de georreferencia de Eco (T-ECO-06), elegidos
# mirando La Boquilla. Valores iniciales sin calibrar; se devuelven en cada veredicto.
RADAR_WATER_HH_DB = -15.0
RADAR_WATER_HV_DB = -23.0

# Clases de B01_WTR en DSWx-S1 v1: 0 no agua, 1 agua abierta, 3 vegetación inundada,
# 250 enmascarado por HAND, 251 layover o sombra, 255 sin dato.
WTR_NOT_WATER = 0
WTR_WATER = (1, 3)
WTR_VALID = (WTR_NOT_WATER, *WTR_WATER)
WTR_NODATA = 255

# Reglas del acuerdo, iniciales y sin calibrar. Si ninguna fuente ve agua en al menos
# MIN_WATER_FRACTION de los píxeles comparables, coinciden en que no hay agua apreciable;
# si no, coinciden cuando comparten al menos MIN_WATER_IOU de los píxeles que alguna marca como agua.
MIN_WATER_FRACTION = 0.001
MIN_WATER_IOU = 0.5
# Fracción mínima de la zona con dato en las dos fuentes para hablar de acuerdo o desacuerdo; mismo valor que
# MIN_OBSERVED_FRACTION de las reglas. covers_aoi de catalog mira la caja de la tesela, no los píxeles: en
# Parral, una pasada con 13RDK y 13RDL dejó el 78,9 % de la zona en WTR 255 (revisión de Antena, 2026-11-12).
MIN_COMPARED_FRACTION = 0.5

# Único host al que se envía el token de Earthdata: el archivo de PO.DAAC.
TOKEN_HOSTS = frozenset({"archive.podaac.earthdata.nasa.gov"})
DOWNLOAD_TIMEOUT_SECONDS = 60.0

Status = Literal[
    "compared", "synthetic", "no_credentials", "none_in_window", "catalog_unavailable", "read_failed", "no_overlap",
    "partial_overlap",
]
Assessment = Literal["agree", "disagree"]
AssessmentBasis = Literal["little_water", "water_overlap"]


@dataclass(frozen=True)
class Comparison:
    both_water: int
    radar_only_water: int
    reference_only_water: int
    both_not_water: int
    not_comparable: int

    @property
    def comparable(self) -> int:
        return self.both_water + self.radar_only_water + self.reference_only_water + self.both_not_water

    @property
    def compared_fraction(self) -> float:
        """Fracción de la malla de la zona con dato en las dos fuentes."""
        total = self.comparable + self.not_comparable
        return self.comparable / total if total else 0.0

    @property
    def any_water(self) -> int:
        return self.both_water + self.radar_only_water + self.reference_only_water

    @property
    def agreement_fraction(self) -> float:
        return (self.both_water + self.both_not_water) / self.comparable if self.comparable else 0.0

    @property
    def water_iou(self) -> float | None:
        return self.both_water / self.any_water if self.any_water else None

    @property
    def radar_water_fraction(self) -> float:
        return (self.both_water + self.radar_only_water) / self.comparable if self.comparable else 0.0

    @property
    def reference_water_fraction(self) -> float:
        return (self.both_water + self.reference_only_water) / self.comparable if self.comparable else 0.0

    @property
    def basis(self) -> AssessmentBasis:
        little = self.comparable and self.any_water / self.comparable < MIN_WATER_FRACTION
        return "little_water" if little else "water_overlap"

    @property
    def assessment(self) -> Assessment:
        if self.basis == "little_water":
            return "agree"
        iou = self.water_iou
        return "agree" if iou is not None and iou >= MIN_WATER_IOU else "disagree"


@dataclass(frozen=True)
class Side:
    status: Status
    radar_date: dt.date
    acquisition: OperaAcquisition | None = None
    days_from_radar: int | None = None
    comparison: Comparison | None = None


def pick(acquisitions: tuple[OperaAcquisition, ...] | list[OperaAcquisition], radar_date: dt.date):
    """La pasada más cercana a la fecha de radar, antes o después; primero las que cubren la zona.

    Devuelve (pasada, días respecto a la fecha de radar) o None si no hay ninguna a ±SEARCH_DAYS.
    """
    candidates = [
        (acq, (acq.acquired_at.date() - radar_date).days)
        for acq in acquisitions
        if abs((acq.acquired_at.date() - radar_date).days) <= SEARCH_DAYS
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda item: (not item[0].covers_aoi, abs(item[1]), item[0].acquired_at))


def compare(hh_db: np.ndarray, hv_db: np.ndarray, wtr: np.ndarray) -> Comparison:
    """Cuenta píxeles en la misma malla. Un píxel cuenta si el radar tiene dato y WTR es 0, 1 o 3."""
    radar_valid = np.isfinite(hh_db) & np.isfinite(hv_db)
    reference_valid = np.isin(wtr, WTR_VALID)
    valid = radar_valid & reference_valid
    with np.errstate(invalid="ignore"):
        radar_water = (hh_db < RADAR_WATER_HH_DB) & (hv_db < RADAR_WATER_HV_DB)
    reference_water = np.isin(wtr, WTR_WATER)
    both = int(np.count_nonzero(valid & radar_water & reference_water))
    radar_only = int(np.count_nonzero(valid & radar_water & ~reference_water))
    reference_only = int(np.count_nonzero(valid & ~radar_water & reference_water))
    neither = int(np.count_nonzero(valid & ~radar_water & ~reference_water))
    return Comparison(both, radar_only, reference_only, neither, int(valid.size - np.count_nonzero(valid)))


def _radar_on_grid(path: Path, crs, transform, width: int, height: int) -> np.ndarray:
    # Promedio de los píxeles de 10 m que caen en cada píxel de 30 m; fuera del radar queda NaN.
    with rasterio.open(path) as src, WarpedVRT(
        src, crs=crs, transform=transform, width=width, height=height,
        resampling=Resampling.average, nodata=np.nan, dtype="float32",
    ) as vrt:
        data = vrt.read(1, masked=True)
    return data.filled(np.nan).astype("float32")


def sample_grid(
    tiles: list[bytes], bbox: list[float], hh_path: Path, hv_path: Path
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Lleva las teselas B01_WTR y el radar a una malla común: la zona en el CRS y paso de la primera tesela.

    Las teselas MGRS se solapan; un píxel toma el valor de la primera que tiene dato en él.
    """
    with MemoryFile(tiles[0]) as memory, memory.open() as first:
        crs, (xres, yres) = first.crs, first.res
    left, bottom, right, top = transform_bounds("EPSG:4326", crs, *bbox, densify_pts=21)
    width, height = math.ceil((right - left) / xres), math.ceil((top - bottom) / yres)
    transform = from_origin(left, top, xres, yres)
    wtr = np.full((height, width), WTR_NODATA, dtype="uint8")
    for data in tiles:
        with MemoryFile(data) as memory, memory.open() as src:
            layer = np.full((height, width), WTR_NODATA, dtype="uint8")
            reproject(
                source=src.read(1), destination=layer,
                src_transform=src.transform, src_crs=src.crs,
                src_nodata=src.nodata if src.nodata is not None else WTR_NODATA,
                dst_transform=transform, dst_crs=crs, dst_nodata=WTR_NODATA, resampling=Resampling.nearest,
            )
        wtr = np.where(wtr == WTR_NODATA, layer, wtr)
    hh = _radar_on_grid(hh_path, crs, transform, width, height)
    hv = _radar_on_grid(hv_path, crs, transform, width, height)
    return hh, hv, wtr


class Fetcher(Protocol):
    def get(self, url: str) -> bytes:
        """Bytes del GeoTIFF. Lanza httpx.HTTPError o ValueError si no se puede leer."""


class EarthdataFetcher:
    """Descarga B01_WTR con el token de Earthdata, que solo se envía al archivo de PO.DAAC.

    httpx quita la cabecera Authorization cuando PO.DAAC redirige a la URL firmada de CloudFront.
    """

    def __init__(self, token: str, client: httpx.Client | None = None):
        self._token = token
        self._client = client or httpx.Client(timeout=DOWNLOAD_TIMEOUT_SECONDS, follow_redirects=True)

    def get(self, url: str) -> bytes:
        parts = urlsplit(url)
        if parts.scheme != "https" or parts.hostname not in TOKEN_HOSTS:
            raise ValueError(f"Host no permitido para el token de Earthdata: {parts.hostname}")
        response = self._client.get(url, headers={"Authorization": f"Bearer {self._token}"})
        response.raise_for_status()
        return response.content


class WaterContrast:
    """Decide y guarda el contraste de cada fecha de radar. Los productos no cambian, así que la caché no caduca."""

    def __init__(self, artifact_root: Path, fetcher: Fetcher | None):
        self.root = artifact_root
        self.fetcher = fetcher
        self._cache: dict[tuple, Comparison | None] = {}
        self._lock = threading.Lock()

    def side(self, manifest: dict, radar_date: dt.date, reference: OperaReference | None) -> Side:
        if reference is None:
            return Side("catalog_unavailable", radar_date)
        chosen = pick(reference.acquisitions, radar_date)
        if chosen is None:
            return Side("none_in_window", radar_date)
        acquisition, days = chosen
        found = lambda status, comparison=None: Side(status, radar_date, acquisition, days, comparison)  # noqa: E731
        if manifest["data_kind"] != "real":
            return found("synthetic")
        if self.fetcher is None:
            return found("no_credentials")
        comparison = self._compare(manifest, radar_date, acquisition)
        if comparison is None:
            return found("read_failed")
        if comparison.comparable == 0:
            return found("no_overlap", comparison)
        if comparison.compared_fraction < MIN_COMPARED_FRACTION:
            # Se dan los conteos, pero no un acuerdo o desacuerdo que valdría solo para una parte de la zona.
            return found("partial_overlap", comparison)
        return found("compared", comparison)

    def _compare(self, manifest: dict, radar_date: dt.date, acquisition: OperaAcquisition) -> Comparison | None:
        entry = next((item for item in manifest["dates"] if item["date"] == radar_date.isoformat()), None)
        if entry is None:
            return None
        key = (manifest["aoi"], entry["hh_db"], entry["hv_db"], tuple(tile.id for tile in acquisition.tiles))
        with self._lock:
            if key in self._cache:
                return self._cache[key]
        try:
            tiles = [self.fetcher.get(tile.wtr_url) for tile in acquisition.tiles]
            grids = sample_grid(tiles, manifest["bbox"], self.root / entry["hh_db"], self.root / entry["hv_db"])
            result = compare(*grids)
        except (httpx.HTTPError, ValueError, OSError, RasterioError):
            # Un fallo de red no se guarda: se reintenta en la próxima consulta.
            return None
        with self._lock:
            self._cache[key] = result
        return result


def contrast_from_env(artifact_root: Path, getenv: Callable[[str], str | None]) -> WaterContrast:
    token = (getenv("EARTHDATA_TOKEN") or "").strip()
    return WaterContrast(artifact_root, EarthdataFetcher(token) if token else None)
