"""Control de calidad de Eco en el veredicto (T-BAL-07, RF-BAL-09) y desplazamiento de la escena.

El manifiesto trae `dates[].qa` con la mediana de HH y HV de cada fecha. Con las dos fechas del par
se mide cuánto cambió el nivel de toda la escena: con la serie real, el porcentaje de cambio sigue a ese
desplazamiento (correlación 0,9, MEMORY.md), así que el veredicto lo avisa en vez de callarlo.
Es un aviso: no cambia el estado.
"""
from __future__ import annotations

from dataclasses import dataclass

# Mismo valor que qa_outlier_db de processor (Eco). Inicial y sin calibrar.
SCENE_SHIFT_DB = 1.5
RADIOMETRIC_OUTLIER = "radiometric_outlier"


@dataclass(frozen=True)
class SceneShift:
    hh_db: float | None
    hv_db: float | None
    same_direction: bool | None  # None si falta alguna polarización o alguna no se movió
    exceeds_threshold: bool


def qa_by_date(manifest: dict) -> dict[str, dict]:
    """Bloque qa de cada fecha. Las fechas sin qa (manifiestos anteriores a T-ECO-03) no aparecen."""
    return {item["date"]: item["qa"] for item in manifest["dates"] if item.get("qa")}


def _difference(before: dict, after: dict, name: str) -> float | None:
    first, second = before.get(f"median_{name}_db"), after.get(f"median_{name}_db")
    return None if first is None or second is None else second - first


def scene_shift(before: dict | None, after: dict | None) -> SceneShift | None:
    """Diferencia de medianas entre la segunda fecha y la primera, por polarización. None sin qa."""
    if not before or not after:
        return None
    hh, hv = _difference(before, after, "hh"), _difference(before, after, "hv")
    same = None
    if hh is not None and hv is not None and hh != 0 and hv != 0:
        same = (hh > 0) == (hv > 0)
    exceeds = any(value is not None and abs(value) > SCENE_SHIFT_DB for value in (hh, hv))
    return SceneShift(hh, hv, same, exceeds)


def flagged(qa: dict | None) -> bool:
    return bool(qa) and RADIOMETRIC_OUTLIER in qa.get("flags", [])
