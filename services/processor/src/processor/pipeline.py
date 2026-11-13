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
from .gcov import GranuleError, GranuleMeta, Scene, read_meta_path, read_scene
from .qa import finalize_qa, scene_stats
from .multitemporal import MultitemporalFilter
from .terrain import terrain_mask

DATA_GAP = (date(2026, 7, 27), date(2026, 8, 10))
BASE_NOTICES = [
    "Datos PROVISIONAL: se reprocesarán a VALIDATED en 2027 y no deben mezclarse con otra versión.",
    "Hueco permanente de adquisición del 2026-07-27 al 2026-08-10.",
    "Umbrales estimados sobre la propia escena: indicador del modelo, no error calibrado.",
]
SHIFT_NOTICE = (
    "El cambio de cada par se mide respecto al desplazamiento de toda la escena: se resta la mediana de la "
    "diferencia (scene_shift_hh_db y scene_shift_hv_db en stats) antes de aplicar el umbral. Un cambio que "
    "afecta a casi toda la zona, como una lluvia general, queda en ese desplazamiento y no como cambio local."
)
QA_NOTICE = (
    "El control de calidad marca una fecha si su mediana se aparta más de {:g} dB de la serie. "
    "Ese umbral no está calibrado y la marca es una advertencia, no una exclusión."
)
GDAL_CACHE_MB = 128
TERRAIN_NOTICE = (
    "Layover y sombra (estado terrain) calculados con el DEM Copernicus GLO-30 y la geometría radarGrid de la "
    "primera fecha ({detail}), con un criterio local por pendiente: no incluye sombras proyectadas por crestas."
)
NO_TERRAIN_NOTICE = "Layover y sombra no se marcaron: {reason}. Las laderas empinadas pueden aparecer como cambio o sin cambio."
MULTITEMPORAL_NOTICE = (
    "Filtro multitemporal de speckle (Quegan y Yu, ventana {window}×{window}, {dates} fechas) aplicado antes de "
    "calcular QA, capas y cambios: cada fecha conserva su media local, pero su textura fina sale del promedio de la "
    "serie, así que un cambio fuerte en una fecha se ve atenuado en las demás."
)
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
    # La caché de GDAL por omisión es el 5 % de la RAM; con una escena completa en memoria basta con poca.
    with tempfile.TemporaryDirectory() as temporary, rasterio.Env(GDAL_CACHEMAX=GDAL_CACHE_MB):
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
    return to_db(smooth(getattr(scene, name), observable(scene, params), params.window))


def _crosses_gap(first: str, second: str) -> bool:
    return date.fromisoformat(first) < DATA_GAP[1] and date.fromisoformat(second) > DATA_GAP[0]


def _stamp(meta: GranuleMeta) -> str:
    return meta.date.replace("-", "")


def _write_date(scene: Scene, prefix: str, artifact_root: Path, params: Params) -> dict:
    layers = {}
    for name in ("hh", "hv"):
        relative = f"{prefix}/dates/{_stamp(scene.meta)}/{name}_db.tif"
        _write_cog(artifact_root / relative, _db(scene, name, params), scene, float("nan"), "average")
        layers[f"{name}_db"] = relative
    return {"date": scene.meta.date, "granule": scene.meta.granule_id, **layers}


def _write_pair(
    before: Scene, after: Scene, kind: str, prefix: str, artifact_root: Path, params: Params, terrain=None
) -> dict:
    pair_id = f"{_stamp(before.meta)}_{_stamp(after.meta)}"
    result = compare(before, after, params, terrain)
    layers = {
        "state": f"{prefix}/pairs/{pair_id}/state.tif",
        "change_hh": f"{prefix}/pairs/{pair_id}/change_hh.tif",
        "change_hv": f"{prefix}/pairs/{pair_id}/change_hv.tif",
    }
    _write_cog(artifact_root / layers["state"], result.state, before, STATE_NODATA, "nearest")
    _write_cog(artifact_root / layers["change_hh"], result.change_hh, before, float("nan"), "average")
    _write_cog(artifact_root / layers["change_hv"], result.change_hv, before, float("nan"), "average")
    return {
        "id": pair_id,
        "from": before.meta.date,
        "to": after.meta.date,
        "kind": kind,
        "spans_data_gap": _crosses_gap(before.meta.date, after.meta.date),
        "granules": [before.meta.granule_id, after.meta.granule_id],
        "layers": layers,
        "stats": result.stats,
    }


def _multitemporal(ordered, bbox: list[float], params: Params) -> MultitemporalFilter:
    """Primera pasada: acumula la textura de todas las fechas, leyendo una escena cada vez."""
    speckle = None
    for _, path in ordered:
        scene = read_scene(path, bbox)
        speckle = speckle or MultitemporalFilter(scene.hh.shape, params.multitemporal_window)
        speckle.add(scene, observable(scene, params))
        del scene
    return speckle


def _read(path: Path, bbox: list[float], params: Params, speckle: MultitemporalFilter | None) -> Scene:
    scene = read_scene(path, bbox)
    return speckle.apply(scene, observable(scene, params)) if speckle else scene


def process_series(
    paths: list[Path],
    aoi: dict,
    series_id: str,
    artifact_root: Path,
    maturity: str,
    params: Params = Params(),
    dem_sources: list[Path | str] | None = None,
) -> dict:
    """Procesa la serie con como máximo dos escenas en memoria, sea cual sea el número de fechas."""
    ordered = sorted(((read_meta_path(path), path) for path in paths), key=lambda item: item[0].date)
    if len(ordered) < 2:
        raise GranuleError("Hacen falta al menos dos fechas")
    reference = ordered[0][0]
    for meta, _ in ordered[1:]:
        _check_comparable(reference, meta)

    prefix = f"{aoi['id']}/{series_id}"
    target = artifact_root / aoi["id"] / series_id
    dates, stats, pairs = [], [], []
    crs = None
    previous: Scene | None = None
    terrain, terrain_detail = None, "no hay DEM"
    speckle = _multitemporal(ordered, aoi["bbox"], params) if params.multitemporal else None
    for index, (_, path) in enumerate(ordered):
        scene = _read(path, aoi["bbox"], params, speckle)
        crs = crs or scene.crs
        if index == 0 and dem_sources:
            # La geometría casi no cambia entre pasadas de la misma órbita: basta la primera fecha.
            terrain, terrain_detail = terrain_mask(
                path, list(dem_sources), scene.crs, scene.transform, scene.hh.shape, reference.direction
            )
        dates.append(_write_date(scene, prefix, artifact_root, params))
        stats.append(scene_stats(scene, params))
        if previous is not None:
            pairs.append(_write_pair(previous, scene, "consecutive", prefix, artifact_root, params, terrain))
        previous = scene
        del scene

    if len(ordered) > 2:
        # La primera fecha se vuelve a leer: guardarla toda la serie costaría una escena más de RAM.
        first = _read(ordered[0][1], aoi["bbox"], params, speckle)
        pairs.append(_write_pair(first, previous, "full_window", prefix, artifact_root, params, terrain))
        del first
    del previous

    for item, qa in zip(dates, finalize_qa(stats, params)):
        item["qa"] = qa

    notices = (
        ([SYNTHETIC_NOTICE] if reference.data_kind == "synthetic" else [])
        + BASE_NOTICES
        + ([SHIFT_NOTICE] if params.correct_scene_shift else [])
        + [
            TERRAIN_NOTICE.format(detail=terrain_detail)
            if terrain is not None
            else NO_TERRAIN_NOTICE.format(reason=terrain_detail)
        ]
        + [QA_NOTICE.format(params.qa_outlier_db)]
        + ([MULTITEMPORAL_NOTICE.format(window=params.multitemporal_window, dates=len(ordered))] if speckle else [])
    )
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
        "crs": crs,
        "bbox": list(aoi["bbox"]),
        "state_codes": STATE_CODES,
        "notices": notices,
        "dates": dates,
        "pairs": pairs,
    }
    target.mkdir(parents=True, exist_ok=True)
    (target / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    return manifest
