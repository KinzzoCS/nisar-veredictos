"""Lectura de gránulos GCOV según la especificación JPL D-102274 Rev F."""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import h5py
import numpy as np
from rasterio.transform import Affine
from rasterio.warp import transform_bounds

GRID = "/science/LSAR/GCOV/grids/frequencyA"
IDENTIFICATION = "/science/LSAR/identification"
_MODE = re.compile(r"_(\d{4})_([A-Z]{4})_")


class GranuleError(ValueError):
    """El gránulo no se puede usar para esta zona o esta serie."""


@dataclass(frozen=True)
class GranuleMeta:
    granule_id: str
    date: str  # YYYY-MM-DD
    track: int
    direction: str
    frame: int
    mode: str
    polarization: str
    crid: str
    data_kind: str


@dataclass
class Scene:
    hh: np.ndarray
    hv: np.ndarray
    mask: np.ndarray
    looks: np.ndarray
    exception: np.ndarray
    transform: Affine
    crs: str
    meta: GranuleMeta


def _text(value) -> str:
    if isinstance(value, np.ndarray):
        value = value.item()
    return value.decode() if isinstance(value, bytes) else str(value)


def read_meta(handle: h5py.File) -> GranuleMeta:
    identification = handle[IDENTIFICATION]
    granule_id = _text(identification["granuleId"][()])
    mode = _MODE.search(granule_id)
    direction = _text(identification["orbitPassDirection"][()]).strip().upper()[0]
    return GranuleMeta(
        granule_id=granule_id,
        date=_text(identification["zeroDopplerStartTime"][()])[:10],
        track=int(identification["trackNumber"][()]),
        direction=direction,
        frame=int(identification["frameNumber"][()]),
        mode=mode.group(1) if mode else "unknown",
        polarization=mode.group(2) if mode else "unknown",
        crid=_text(identification["compositeReleaseId"][()]),
        data_kind=_text(handle.attrs.get("data_kind", "real")),
    )


def read_scene(path: Path, bbox: list[float]) -> Scene:
    """Lee solo la ventana de la zona, sin cargar el gránulo completo."""
    with h5py.File(path, "r") as handle:
        grid = handle[GRID]
        x = grid["xCoordinates"][()]
        y = grid["yCoordinates"][()]
        crs = f"EPSG:{int(grid['projection'].attrs['epsg_code'])}"
        left, bottom, right, top = transform_bounds("EPSG:4326", crs, *bbox)

        descending = y[0] > y[-1]
        keys = -y if descending else y
        low, high = (-top, -bottom) if descending else (bottom, top)
        row0, row1 = np.searchsorted(keys, [low, high])
        col0, col1 = np.searchsorted(x, [left, right])
        if row1 <= row0 or col1 <= col0:
            raise GranuleError(f"La zona queda fuera de {path.name}")

        def window(name: str) -> np.ndarray:
            data = grid[name][row0:row1, col0:col1]
            return data if descending else data[::-1]

        hh = window("HHHH")
        exception = (
            window("inputDataExceptionMask") if "inputDataExceptionMask" in grid else np.zeros(hh.shape, np.uint8)
        )
        dx = float(x[1] - x[0])
        dy = abs(float(y[1] - y[0]))
        top_center = float(y[row0:row1].max())
        return Scene(
            hh=hh,
            hv=window("HVHV"),
            mask=window("mask"),
            looks=window("numberOfLooks"),
            exception=exception,
            transform=Affine(dx, 0, float(x[col0]) - dx / 2, 0, -dy, top_center + dy / 2),
            crs=crs,
            meta=read_meta(handle),
        )
