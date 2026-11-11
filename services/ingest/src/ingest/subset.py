"""Recorte de un gránulo GCOV según contracts/gcov-subset.md."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

import h5py
import numpy as np
from rasterio.warp import transform_bounds

LSAR = "/science/LSAR"
IDENTIFICATION = f"{LSAR}/identification"
GRID = f"{LSAR}/GCOV/grids/frequencyA"
REQUIRED_LAYERS = ("HHHH", "HVHV", "mask", "numberOfLooks")
OPTIONAL_LAYERS = ("inputDataExceptionMask",)


class SubsetError(ValueError):
    """El gránulo no sirve para esta zona o esta serie."""


@dataclass(frozen=True)
class Identity:
    granule_id: str
    track: int
    direction: str
    frame: int


def _text(value) -> str:
    if isinstance(value, np.ndarray):
        value = value.item()
    return value.decode() if isinstance(value, bytes) else str(value)


def read_identity(handle: h5py.File) -> Identity:
    identification = handle[IDENTIFICATION]
    return Identity(
        granule_id=_text(identification["granuleId"][()]),
        track=int(identification["trackNumber"][()]),
        direction=_text(identification["orbitPassDirection"][()]).strip().upper()[0],
        frame=int(identification["frameNumber"][()]),
    )


def _window(x: np.ndarray, y: np.ndarray, bounds: tuple[float, float, float, float]) -> tuple[slice, slice]:
    left, bottom, right, top = bounds
    descending = y[0] > y[-1]
    keys = -y if descending else y
    low, high = (-top, -bottom) if descending else (bottom, top)
    row0, row1 = np.searchsorted(keys, [low, high])
    col0, col1 = np.searchsorted(x, [left, right])
    return slice(int(row0), int(row1)), slice(int(col0), int(col1))


def subset(source: Path | BinaryIO, bbox: list[float], expected: dict, destination: Path) -> Identity:
    """Copia la identificación y solo la ventana de la zona; conserva tipos y orientación."""
    with h5py.File(source, "r") as src:
        identity = read_identity(src)
        if (identity.track, identity.direction, identity.frame) != (
            expected["track"],
            expected["direction"],
            expected["frame"],
        ):
            raise SubsetError(f"{identity.granule_id} no corresponde a la serie {expected['id']}")

        grid = src[GRID]
        x = grid["xCoordinates"][()]
        y = grid["yCoordinates"][()]
        crs = f"EPSG:{int(grid['projection'].attrs['epsg_code'])}"
        rows, cols = _window(x, y, transform_bounds("EPSG:4326", crs, *bbox))
        if rows.stop <= rows.start or cols.stop <= cols.start:
            raise SubsetError(f"La zona queda fuera de {identity.granule_id}")

        with h5py.File(destination, "w") as dst:
            dst.attrs["subset_of"] = identity.granule_id
            dst.attrs["subset_bbox"] = np.asarray(bbox, dtype=np.float64)
            src.copy(src[IDENTIFICATION], dst.require_group(LSAR), name="identification")
            out = dst.require_group(GRID)
            out["xCoordinates"] = x[cols]
            out["yCoordinates"] = y[rows]
            src.copy(grid["projection"], out, name="projection")
            for name in REQUIRED_LAYERS + OPTIONAL_LAYERS:
                if name in grid:
                    out.create_dataset(name, data=grid[name][rows, cols], chunks=True, compression="lzf")
                elif name in REQUIRED_LAYERS:
                    raise SubsetError(f"{identity.granule_id}: falta la capa {name}")
    return identity
