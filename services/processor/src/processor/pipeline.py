"""Convierte una serie de gránulos en COGs, estados y manifiesto."""
from __future__ import annotations

import json
import tempfile
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
import rasterio.shutil

from .change import STATE_CODES, STATE_NODATA, Params, compare, smooth, observable, to_db
from .gcov import GranuleError, GranuleMeta, Scene, read_scene

DATA_GAP = (date(2026, 7, 27), date(2026, 8, 10))
BASE_NOTICES = [
    "Datos PROVISIONAL: se reprocesarán a VALIDATED en 2027 y no deben mezclarse con otra versión.",
    "Hueco permanente de adquisición del 2026-07-27 al 2026-08-10.",
    "Layover y sombra no vienen en GCOV y todavía no se calculan.",
    "Umbrales estimados sobre la propia escena: indicador del modelo, no error calibrado.",
]
SYNTHETIC_NOTICE = "DATOS SINTÉTICOS: sirven para probar el sistema y no describen ningún lugar real."


def _write_cog(path: Path, data: np.ndarray, scene: Scene, nodata, resampling: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    profile = {
        "driver": "GTiff",
        "height": data.shape[0],
        "width": data.shape[1],
        "count": 1,
        "dtype": data.dtype.name,
        "crs": scene.crs,
        "transform": scene.transform,
        "nodata": nodata,
    }
    with tempfile.TemporaryDirectory() as temporary:
        source = Path(temporary) / "raw.tif"
        with rasterio.open(source, "w", **profile) as dataset:
            dataset.write(data, 1)
        rasterio.shutil.copy(source, path, driver="COG", compress="DEFLATE", overview_resampling=resampling)


def _check_comparable(reference: GranuleMeta, other: GranuleMeta) -> None:
    fields = ("track", "direction", "frame", "mode", "polarization", "crid", "data_kind")
    for field in fields:
        if getattr(reference, field) != getattr(other, field):
            raise GranuleError(f"{other.granule_id}: {field} no coincide con la serie")


def _db(scene: Scene, name: str, params: Params) -> np.ndarray:
    return to_db(smooth(getattr(scene, name), observable(scene, params.min_looks), params.window))


def _crosses_gap(first: str, second: str) -> bool:
    return date.fromisoformat(first) < DATA_GAP[1] and date.fromisoformat(second) > DATA_GAP[0]


def process_series(
    paths: list[Path], aoi: dict, series_id: str, artifact_root: Path, maturity: str, params: Params = Params()
) -> dict:
    scenes = sorted((read_scene(path, aoi["bbox"]) for path in paths), key=lambda scene: scene.meta.date)
    if len(scenes) < 2:
        raise GranuleError("Hacen falta al menos dos fechas")
    reference = scenes[0].meta
    for scene in scenes[1:]:
        _check_comparable(reference, scene.meta)

    prefix = f"{aoi['id']}/{series_id}"
    target = artifact_root / aoi["id"] / series_id
    dates = []
    for scene in scenes:
        stamp = scene.meta.date.replace("-", "")
        layers = {}
        for name in ("hh", "hv"):
            relative = f"{prefix}/dates/{stamp}/{name}_db.tif"
            _write_cog(artifact_root / relative, _db(scene, name, params), scene, float("nan"), "average")
            layers[f"{name}_db"] = relative
        dates.append({"date": scene.meta.date, "granule": scene.meta.granule_id, **layers})

    combinations = [(a, b, "consecutive") for a, b in zip(scenes, scenes[1:])]
    if len(scenes) > 2:
        combinations.append((scenes[0], scenes[-1], "full_window"))

    pairs = []
    for before, after, kind in combinations:
        pair_id = f"{before.meta.date.replace('-', '')}_{after.meta.date.replace('-', '')}"
        result = compare(before, after, params)
        layers = {
            "state": f"{prefix}/pairs/{pair_id}/state.tif",
            "change_hh": f"{prefix}/pairs/{pair_id}/change_hh.tif",
            "change_hv": f"{prefix}/pairs/{pair_id}/change_hv.tif",
        }
        _write_cog(artifact_root / layers["state"], result.state, before, STATE_NODATA, "nearest")
        _write_cog(artifact_root / layers["change_hh"], result.change_hh, before, float("nan"), "average")
        _write_cog(artifact_root / layers["change_hv"], result.change_hv, before, float("nan"), "average")
        pairs.append(
            {
                "id": pair_id,
                "from": before.meta.date,
                "to": after.meta.date,
                "kind": kind,
                "spans_data_gap": _crosses_gap(before.meta.date, after.meta.date),
                "granules": [before.meta.granule_id, after.meta.granule_id],
                "layers": layers,
                "stats": result.stats,
            }
        )

    notices = ([SYNTHETIC_NOTICE] if reference.data_kind == "synthetic" else []) + BASE_NOTICES
    manifest = {
        "schema_version": 1,
        "aoi": aoi["id"],
        "series": {
            "id": series_id,
            "track": reference.track,
            "direction": reference.direction,
            "frame": reference.frame,
            "mode": reference.mode,
            "polarization": reference.polarization,
            "crid": reference.crid,
        },
        "data_kind": reference.data_kind,
        "maturity": maturity,
        "crs": scenes[0].crs,
        "bbox": list(aoi["bbox"]),
        "state_codes": STATE_CODES,
        "notices": notices,
        "dates": dates,
        "pairs": pairs,
    }
    target.mkdir(parents=True, exist_ok=True)
    (target / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    return manifest
