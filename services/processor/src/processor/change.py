"""Detección de cambio entre dos fechas y estados por píxel."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage

from .gcov import Scene

NO_CHANGE = 0
CHANGE_PROBABLE = 1
OUTSIDE_SCENE = 10
INVALID_OR_PARTIAL = 11
INPUT_EXCEPTION = 12
LOW_LOOKS = 13
NO_DATA = 14
# Layover o sombra, calculados con el DEM y radarGrid (terrain.py); GCOV no los trae.
TERRAIN = 15
STATE_NODATA = 255
STABLE_DB = 2.0

STATE_CODES = {
    "no_change": NO_CHANGE,
    "change_probable": CHANGE_PROBABLE,
    "outside_scene": OUTSIDE_SCENE,
    "invalid_or_partial": INVALID_OR_PARTIAL,
    "input_exception": INPUT_EXCEPTION,
    "low_looks": LOW_LOOKS,
    "no_data": NO_DATA,
    "terrain": TERRAIN,
}


@dataclass(frozen=True)
class Params:
    window: int = 5
    # Looks sumados en la ventana de suavizado (T-ECO-07). Con 50 (unos 2 por píxel) queda fuera ~1 % en Parral;
    # antes se exigían 4 por píxel y quedaba fuera el 15 %, aunque luego se promediaba 5 × 5.
    min_window_looks: float = 50.0
    # Resta a cada par la mediana de su diferencia, para medir el cambio local y no el de toda la escena.
    correct_scene_shift: bool = True
    # Otsu siempre encuentra un umbral, incluso sin cambio; este suelo evita marcar ruido.
    min_threshold_db: float = 3.0
    min_cluster_pixels: int = 4
    # Umbral inicial sin calibrar con banda L: desviación de la mediana de una fecha respecto a la serie.
    qa_outlier_db: float = 1.5


@dataclass
class PairResult:
    state: np.ndarray
    change_hh: np.ndarray
    change_hv: np.ndarray
    stats: dict


def window_looks(scene: Scene, size: int) -> np.ndarray:
    """Suma de `numberOfLooks` de los píxeles válidos en la ventana de suavizado."""
    valid = np.isin(scene.mask, [1, 2, 3, 4, 5])
    looks = np.where(valid, scene.looks, 0).astype(np.float32)
    return ndimage.uniform_filter(looks, size, mode="nearest") * np.float32(size * size)


def enough_looks(scene: Scene, params: "Params") -> np.ndarray:
    return window_looks(scene, params.window) >= params.min_window_looks


def observable(scene: Scene, params: "Params") -> np.ndarray:
    finite = np.isfinite(scene.hh) & np.isfinite(scene.hv) & (scene.hh > 0) & (scene.hv > 0)
    return np.isin(scene.mask, [1, 2, 3, 4, 5]) & (scene.exception == 0) & finite & enough_looks(scene, params)


def valid_weight(valid: np.ndarray, size: int) -> np.ndarray:
    """Fracción de píxeles válidos en cada ventana. Se reutiliza para todas las capas con la misma máscara."""
    return ndimage.uniform_filter(valid.astype(np.float32), size, mode="nearest")


def smooth(power: np.ndarray, valid: np.ndarray, size: int, weight: np.ndarray | None = None) -> np.ndarray:
    """Promedia en potencia lineal usando solo píxeles válidos.

    Trabaja en float32 para que una escena de 5000 x 5500 no duplique su tamaño en temporales.
    """
    if weight is None:
        weight = valid_weight(valid, size)
    result = ndimage.uniform_filter(np.where(valid, power, np.float32(0)).astype(np.float32, copy=False), size, mode="nearest")
    with np.errstate(divide="ignore", invalid="ignore"):
        np.divide(result, weight, out=result)
    result[~valid] = np.nan
    return result


def to_db(power: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        return (10 * np.log10(power)).astype(np.float32)


def otsu(values: np.ndarray, bins: int = 256) -> float:
    histogram, edges = np.histogram(values, bins)
    centers = (edges[:-1] + edges[1:]) / 2
    weight = np.cumsum(histogram).astype(np.float64)
    mean = np.cumsum(histogram * centers)
    total_weight, total_mean = weight[-1], mean[-1]
    with np.errstate(divide="ignore", invalid="ignore"):
        between = (total_mean * weight - mean * total_weight) ** 2 / (weight * (total_weight - weight))
    return float(centers[int(np.nanargmax(np.nan_to_num(between)))])


def _state_for_unobservable(a: Scene, b: Scene, params: Params, terrain: np.ndarray | None = None) -> np.ndarray:
    state = np.full(a.hh.shape, NO_CHANGE, np.uint8)
    for scene in (a, b):
        state[~enough_looks(scene, params)] = LOW_LOOKS
    if terrain is not None:
        # El relieve explica mejor que los pocos looks por qué no se ve: va encima.
        state[terrain] = TERRAIN
    for scene in (a, b):
        state[~(np.isfinite(scene.hh) & np.isfinite(scene.hv) & (scene.hh > 0) & (scene.hv > 0))] = NO_DATA
    for scene in (a, b):
        state[scene.exception != 0] = INPUT_EXCEPTION
    for scene in (a, b):
        state[scene.mask == 0] = INVALID_OR_PARTIAL
    for scene in (a, b):
        state[scene.mask == 255] = OUTSIDE_SCENE
    return state


def _threshold(values: np.ndarray, params: Params) -> float | None:
    if values.size < 2 or np.ptp(values) == 0:
        return None
    return max(otsu(values), params.min_threshold_db)


def _median(values: np.ndarray) -> float | None:
    values = values[np.isfinite(values)]
    return float(np.median(values)) if values.size else None


def _mean(values: np.ndarray) -> float | None:
    return float(np.mean(values)) if values.size else None


def _signature_counts(hh: np.ndarray, hv: np.ndarray) -> dict[str, int]:
    """Cuenta píxeles por firma: un promedio de la escena mezclaría causas distintas."""
    hh_up, hh_down = hh >= STABLE_DB, hh <= -STABLE_DB
    hv_up, hv_down = hv >= STABLE_DB, hv <= -STABLE_DB
    hv_stable = ~hv_up & ~hv_down
    classes = {
        "hh_up_hv_stable": hh_up & hv_stable,
        "hh_up_hv_up": hh_up & hv_up,
        "hh_down_hv_down": hh_down & hv_down,
        "hh_down_hv_stable": hh_down & hv_stable,
    }
    result = {name: int(np.count_nonzero(selected)) for name, selected in classes.items()}
    result["other"] = int(hh.size - sum(result.values()))
    return result


def compare(a: Scene, b: Scene, params: Params = Params(), terrain: np.ndarray | None = None) -> PairResult:
    if a.hh.shape != b.hh.shape or a.transform != b.transform:
        raise ValueError(f"Mallas distintas: {a.meta.granule_id} y {b.meta.granule_id}")

    state = _state_for_unobservable(a, b, params, terrain)
    both = observable(a, params) & observable(b, params)
    if terrain is not None:
        both &= ~terrain
    state[~both & (state == NO_CHANGE)] = NO_DATA

    change = {}
    weight = valid_weight(both, params.window)
    for name in ("hh", "hv"):
        after = to_db(smooth(getattr(b, name), both, params.window, weight))
        after -= to_db(smooth(getattr(a, name), both, params.window, weight))
        change[name] = after
    del weight

    shifts: dict[str, float | None] = {}
    for name, value in change.items():
        shift = _median(value[both])
        shifts[name] = shift
        if params.correct_scene_shift and shift is not None:
            value -= np.float32(shift)

    thresholds = {name: _threshold(np.abs(change[name][both]), params) for name in change}
    changed = np.zeros(state.shape, bool)
    for name, value in change.items():
        if thresholds[name] is not None:
            changed |= both & (np.abs(value) > thresholds[name])

    labels, count = ndimage.label(changed)
    if count:
        sizes = np.bincount(labels.ravel())
        keep = sizes >= params.min_cluster_pixels
        keep[0] = False
        changed = keep[labels]
    state[changed] = CHANGE_PROBABLE

    counts = {name: int(np.count_nonzero(state == code)) for name, code in STATE_CODES.items()}
    signatures = _signature_counts(change["hh"][changed], change["hv"][changed])
    return PairResult(
        state=state,
        change_hh=change["hh"],
        change_hv=change["hv"],
        stats={
            "counts": counts,
            "signature_counts": signatures,
            "threshold_hh_db": thresholds["hh"],
            "threshold_hv_db": thresholds["hv"],
            "mean_change_hh_db": _mean(change["hh"][changed]),
            "mean_change_hv_db": _mean(change["hv"][changed]),
            # Mediana de la diferencia en lo observable: desplazamiento de toda la escena. Se publica siempre;
            # si correct_scene_shift está activo, ya está restado de los cambios y de los umbrales.
            "scene_shift_hh_db": shifts["hh"],
            "scene_shift_hv_db": shifts["hv"],
        },
    )
