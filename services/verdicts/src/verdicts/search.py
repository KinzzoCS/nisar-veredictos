"""Búsqueda de veredictos (T-BAL-11, RF-BUS-01 y 03 a 05).

Cada fila sale de un veredicto completo ya calculado: copia sus campos y no redacta texto propio, así que nunca
afirma más que el veredicto. El índice se construye al arrancar y la consulta solo filtra, ordena y pagina en
memoria: con decenas o cientos de pares no hace falta una base de datos.
"""
from __future__ import annotations

import base64
import binascii
import datetime as dt
import hashlib
import json
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["public", "student", "researcher"]
ROLES: tuple[Role, ...] = ("public", "student", "researcher")
PAGE_LIMIT: dict[str, int] = {"student": 50, "researcher": 500}
DEFAULT_LIMIT = 50

# Filtros que solo puede usar researcher (RF-BUS-05: el estudiante no tiene los de calidad ni de ruido).
# El de ruido llegará con T-BAL-14.
RESEARCHER_FILTERS = ("quality_flag",)

SortKey = Literal["date", "interval", "changed_fraction"]
WaterFilter = Literal["agree", "disagree"]
WaterSummary = Literal["agree", "disagree", "not_available"]
CONTRAST_NOT_COMPUTED = "contrast_not_computed"


def role_from_header(value: str | None) -> Role:
    """X-Auth-Role lo pone el gateway y borra el del cliente. Cualquier otro valor cuenta como public."""
    return value if value in ROLES else "public"  # type: ignore[return-value]


class WaterSideRow(BaseModel):
    status: str = Field(description="evidence.water.<lado>.status del veredicto.")
    assessment: Literal["agree", "disagree"] | None
    compared_fraction: float | None = Field(description="Fracción de la zona comparada. null si no se comparó.")


class WaterRow(BaseModel):
    summary: WaterSummary = Field(
        description="disagree si alguna de las dos fechas del par sale disagree; agree si las dos salen agree; "
        "not_available en cualquier otro caso, también mientras el contraste con OPERA no está calculado o si "
        "verdicts no tiene token. disagree es un desacuerdo entre dos métodos, no dice cuál acierta."
    )
    reasons: list[str] = Field(
        description="Por qué no hay contraste en alguna fecha: los status distintos de compared, o "
        "contrast_not_computed si el índice aún no tiene el contraste. Vacía si las dos fechas se compararon."
    )
    before: WaterSideRow | None = Field(description="null mientras el contraste no está calculado.")
    after: WaterSideRow | None


class SearchResult(BaseModel):
    aoi: str
    series_id: str
    pair_id: str
    kind: Literal["consecutive", "full_window"]
    direction: str = Field(description="Dirección de la órbita de la serie: A ascendente, D descendente.")
    data_kind: Literal["real", "synthetic"] = Field(description="Nunca falta: los datos sintéticos lo dicen en cada fila.")
    state: Literal["change_probable", "no_detectable_change", "not_observable"]
    cause: str | None
    from_date: dt.date
    to_date: dt.date
    interval_days: int
    observed_fraction: float
    changed_fraction: float
    scene_shift_hh_db: float | None = Field(description="evidence.scene_shift.hh_db. null si el veredicto no lo trae.")
    scene_shift_hv_db: float | None
    scene_shift_exceeds_threshold: bool | None = Field(
        description="evidence.scene_shift.exceeds_threshold. null si el veredicto no trae desplazamiento."
    )
    flagged_dates: list[dt.date] = Field(
        description="Fechas del par con la bandera radiometric_outlier del QA de Eco (receipt.quality)."
    )
    optical_max_cloud_cover: float | None = Field(
        description="Mayor max_cloud_cover de las escenas ópticas de antes y después, por tesela. null si falta "
        "alguna de las dos escenas."
    )
    water: WaterRow
    granules: list[str] = Field(description="granule_id de las dos fechas, como en receipt.granules.")
    verdict_path: str = Field(
        description="Ruta del veredicto completo en esta API. Por el gateway lleva delante /api/verdicts."
    )


class NotEvaluated(BaseModel):
    count: int = Field(description="Filas que el filtro dejó fuera porque no se podía evaluar en ellas.")
    reasons: dict[str, int] = Field(description="Cuántas filas por cada motivo.")


class SearchQuery(BaseModel):
    filters: dict[str, object] = Field(description="Filtros aplicados, tal como se interpretaron.")
    sort: SortKey
    order: Literal["asc", "desc"]
    limit: int
    role: Role
    not_evaluated: dict[str, NotEvaluated] = Field(
        description="Por filtro: filas que quedaron fuera porque el dato no existe (p. ej. water sin contraste)."
    )
    water_contrast: Literal["included", "pending"] = Field(
        description="pending: el índice aún no tiene el contraste con OPERA y todas las filas dicen not_available."
    )
    indexed_at: dt.datetime = Field(description="Cuándo se calcularon los veredictos del índice, en UTC.")


class SearchPage(BaseModel):
    total: int = Field(description="Resultados que cumplen la consulta, sumando todas las páginas.")
    results: list[SearchResult]
    next_cursor: str | None = Field(description="Cursor de la página siguiente. null en la última.")
    query: SearchQuery


class AccessDenied(BaseModel):
    detail: str
    required_role: Role


class InvalidCursor(ValueError):
    pass


@dataclass(frozen=True)
class Filters:
    aoi: str | None = None
    series_id: str | None = None
    direction: str | None = None
    kind: str | None = None
    date_from: dt.date | None = None
    date_to: dt.date | None = None
    interval_min: int | None = None
    interval_max: int | None = None
    state: tuple[str, ...] = ()
    cause: tuple[str, ...] = ()
    changed_min: float | None = None
    changed_max: float | None = None
    scene_shift_exceeds: bool | None = None
    quality_flag: bool | None = None
    water: str | None = None
    max_cloud_cover: float | None = None
    data_kind: str | None = None

    def applied(self) -> dict[str, object]:
        result: dict[str, object] = {}
        for name, value in self.__dict__.items():
            if value is None or value == ():
                continue
            if isinstance(value, dt.date):
                value = value.isoformat()
            elif isinstance(value, tuple):
                value = list(value)
            result[name] = value
        return result


@dataclass
class Index:
    rows: list[SearchResult]
    water_included: bool
    built_at: dt.datetime
    generation: int = 0
    errors: list[str] = field(default_factory=list)


def water_row(evidence, included: bool) -> WaterRow:
    """Resumen del contraste con OPERA de un veredicto. evidence es su evidence.water."""
    if not included:
        return WaterRow(summary="not_available", reasons=[CONTRAST_NOT_COMPUTED], before=None, after=None)
    sides = (evidence.before, evidence.after)
    rows = [
        WaterSideRow(
            status=side.status,
            assessment=side.assessment,
            compared_fraction=side.comparison.compared_fraction if side.comparison else None,
        )
        for side in sides
    ]
    assessments = [side.assessment for side in sides]
    if "disagree" in assessments:
        summary = "disagree"
    elif all(item == "agree" for item in assessments):
        summary = "agree"
    else:
        summary = "not_available"
    reasons = sorted({side.status for side in sides if side.status != "compared"})
    return WaterRow(summary=summary, reasons=reasons, before=rows[0], after=rows[1])


def row_from_verdict(verdict, water_included: bool) -> SearchResult:
    """Fila de búsqueda con los mismos valores que el veredicto completo."""
    evidence, receipt = verdict.evidence, verdict.receipt
    shift = evidence.scene_shift
    scenes = (evidence.optical.before.scene, evidence.optical.after.scene)
    clouds = None if any(scene is None for scene in scenes) else max(scene.max_cloud_cover for scene in scenes)
    flagged = [
        item.date for item in (receipt.quality.before, receipt.quality.after)
        if item is not None and "radiometric_outlier" in item.flags
    ]
    return SearchResult(
        aoi=verdict.aoi,
        series_id=verdict.series,
        pair_id=verdict.id,
        kind=verdict.kind,
        direction=receipt.direction,
        data_kind=receipt.data_kind,
        state=verdict.state,
        cause=verdict.cause,
        from_date=verdict.from_date,
        to_date=verdict.to_date,
        interval_days=verdict.interval_days,
        observed_fraction=evidence.observed_fraction,
        changed_fraction=evidence.changed_fraction,
        scene_shift_hh_db=shift.hh_db if shift else None,
        scene_shift_hv_db=shift.hv_db if shift else None,
        scene_shift_exceeds_threshold=shift.exceeds_threshold if shift else None,
        flagged_dates=flagged,
        optical_max_cloud_cover=clouds,
        water=water_row(evidence.water, water_included),
        granules=list(receipt.granules),
        verdict_path=f"/aois/{verdict.aoi}/series/{verdict.series}/verdicts/{verdict.id}",
    )


def _between(value, low, high) -> bool:
    return (low is None or value >= low) and (high is None or value <= high)


def apply(rows: list[SearchResult], filters: Filters) -> tuple[list[SearchResult], dict[str, NotEvaluated]]:
    """Filas que cumplen todos los filtros y, por filtro, las que no se pudieron evaluar."""
    kept: list[SearchResult] = []
    skipped: dict[str, NotEvaluated] = {}

    def skip(name: str, *reasons: str) -> None:
        """Una fila más sin evaluar; en water puede tener dos motivos, uno por fecha."""
        entry = skipped.setdefault(name, NotEvaluated(count=0, reasons={}))
        entry.count += 1
        for reason in reasons:
            entry.reasons[reason] = entry.reasons.get(reason, 0) + 1

    for row in rows:
        if filters.aoi is not None and row.aoi != filters.aoi:
            continue
        if filters.series_id is not None and row.series_id != filters.series_id:
            continue
        if filters.direction is not None and row.direction != filters.direction:
            continue
        if filters.kind is not None and row.kind != filters.kind:
            continue
        if filters.data_kind is not None and row.data_kind != filters.data_kind:
            continue
        if filters.date_from is not None and row.from_date < filters.date_from:
            continue
        if filters.date_to is not None and row.to_date > filters.date_to:
            continue
        if not _between(row.interval_days, filters.interval_min, filters.interval_max):
            continue
        if filters.state and row.state not in filters.state:
            continue
        if filters.cause and row.cause not in filters.cause:
            continue
        if not _between(row.changed_fraction, filters.changed_min, filters.changed_max):
            continue
        if filters.scene_shift_exceeds is not None:
            if row.scene_shift_exceeds_threshold is None:
                skip("scene_shift_exceeds", "no_scene_shift")
                continue
            if row.scene_shift_exceeds_threshold != filters.scene_shift_exceeds:
                continue
        if filters.quality_flag is not None and bool(row.flagged_dates) != filters.quality_flag:
            continue
        if filters.max_cloud_cover is not None:
            if row.optical_max_cloud_cover is None:
                skip("max_cloud_cover", "no_optical_scene")
                continue
            if row.optical_max_cloud_cover > filters.max_cloud_cover:
                continue
        if filters.water is not None:
            if row.water.summary == "not_available":
                skip("water", *(row.water.reasons or ["not_compared"]))
                continue
            if row.water.summary != filters.water:
                continue
        kept.append(row)
    return kept, skipped


def _sort_value(row: SearchResult, key: SortKey):
    if key == "interval":
        return row.interval_days
    if key == "changed_fraction":
        return row.changed_fraction
    return row.to_date


def order(rows: list[SearchResult], key: SortKey, direction: str) -> list[SearchResult]:
    """Orden estable: a igual valor, por zona, serie y par, siempre ascendente, para que el cursor no salte filas."""
    tie = sorted(rows, key=lambda row: (row.aoi, row.series_id, row.from_date, row.to_date, row.pair_id))
    return sorted(tie, key=lambda row: _sort_value(row, key), reverse=direction == "desc")


def fingerprint(filters: Filters, key: str, direction: str) -> str:
    text = json.dumps({"f": filters.applied(), "s": key, "o": direction}, sort_keys=True, default=str)
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def encode_cursor(offset: int, print_: str, generation: int) -> str:
    raw = json.dumps({"o": offset, "q": print_, "g": generation}, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str, print_: str, generation: int) -> int:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded.encode()))
        offset, query, gen = int(data["o"]), data["q"], int(data["g"])
    except (binascii.Error, ValueError, KeyError, TypeError) as exc:
        raise InvalidCursor("Cursor ilegible") from exc
    if query != print_:
        raise InvalidCursor("El cursor es de otra consulta: repite la consulta sin cursor")
    if gen != generation:
        raise InvalidCursor("El índice se recalculó desde esa página (p. ej. llegó el contraste con OPERA): "
                            "repite la consulta sin cursor")
    if offset < 0:
        raise InvalidCursor("Cursor ilegible")
    return offset
