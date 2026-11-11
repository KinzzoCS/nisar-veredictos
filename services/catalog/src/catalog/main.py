"""API del catálogo: qué zonas hay y qué series comparables existen para cada una."""
from __future__ import annotations

import os
from collections.abc import Callable
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Literal

import httpx
import yaml
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from .cmr import CmrSource, GranuleSource
from .pairing import Granule, build_series
from .timeline import build_timeline


class Aoi(BaseModel):
    id: str
    name: str
    bbox: list[float]
    collection: str
    maturity: str


class SeriesGranule(BaseModel):
    id: str
    date: date
    size_mb: float
    download_url: str


class SeriesOut(BaseModel):
    id: str
    track: int
    direction: str
    frame: int
    mode: str
    polarization: str
    crid: str
    maturity: str
    contains_aoi: bool
    max_gap_days: int
    spans_data_gap: bool
    granules: list[SeriesGranule]


class TimelinePass(BaseModel):
    series: str
    granule_id: str
    acquired_at: datetime = Field(description="Inicio de la adquisición, en UTC.")
    published_at: datetime | None = Field(
        description="Última actualización del gránulo en CMR, en UTC. Aproxima la publicación."
    )
    latency_hours: float | None = Field(description="Horas entre la adquisición y published_at.")
    contains_aoi: bool = Field(description="La huella de la serie contiene la zona completa.")


class TimelineInterval(BaseModel):
    series: str
    start: datetime
    end: datetime
    days: int = Field(description="Días entre dos pasadas consecutivas de la misma serie.")
    crosses_gap: bool = Field(description="El intervalo atraviesa un hueco de adquisición conocido.")


class TimelineGap(BaseModel):
    start: date = Field(description="Primer día sin adquisiciones, incluido.")
    end: date = Field(description="Último día sin adquisiciones, incluido.")
    source: str


class NextPassEstimate(BaseModel):
    series: str
    expected_at: datetime = Field(description="Estimación, no plan de observación: última pasada más N ciclos.")
    basis: Literal["12-day cycle"]


class TimelineOut(BaseModel):
    aoi: str
    published_at_basis: Literal["cmr_updated"] = Field(
        description="published_at es la fecha 'updated' de CMR, una aproximación a la publicación real."
    )
    passes: list[TimelinePass]
    intervals: list[TimelineInterval]
    gaps: list[TimelineGap]
    next_pass_estimates: list[NextPassEstimate]


def _load_aois(aoi_dir: Path) -> dict[str, dict]:
    result = {}
    for path in sorted(aoi_dir.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        result[data["id"]] = data
    return result


def create_app(
    aoi_dir: Path | None = None,
    source: GranuleSource | None = None,
    clock: Callable[[], datetime] | None = None,
) -> FastAPI:
    directory = aoi_dir or Path(os.environ.get("AOI_DIR", "/config/aois"))
    granule_source = source or CmrSource()
    now = clock or (lambda: datetime.now(timezone.utc))
    app = FastAPI(title="NISAR catalog", version="0.1.0")

    def aoi_or_404(aoi_id: str) -> dict:
        aoi = _load_aois(directory).get(aoi_id)
        if aoi is None:
            raise HTTPException(404, f"Zona desconocida: {aoi_id}")
        return aoi

    def granules_for(aoi: dict) -> list[Granule]:
        try:
            return granule_source.granules(
                aoi["collection"], aoi["bbox"], aoi["window"]["start"], aoi["window"]["end"]
            )
        except httpx.HTTPError as exc:
            raise HTTPException(502, "El catálogo CMR no respondió") from exc

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/aois", response_model=list[Aoi])
    def aois() -> list[dict]:
        return list(_load_aois(directory).values())

    @app.get("/aois/{aoi_id}/series", response_model=list[SeriesOut])
    def series(aoi_id: str, min_dates: int = Query(2, ge=2)) -> list[SeriesOut]:
        aoi = aoi_or_404(aoi_id)
        granules = granules_for(aoi)
        return [
            SeriesOut(
                id=item.id,
                track=item.track,
                direction=item.direction,
                frame=item.frame,
                mode=item.mode,
                polarization=item.polarization,
                crid=item.crid,
                maturity=aoi["maturity"],
                contains_aoi=item.contains_aoi,
                max_gap_days=item.max_gap_days,
                spans_data_gap=item.spans_data_gap,
                granules=[
                    SeriesGranule(id=g.id, date=g.start, size_mb=g.size_mb, download_url=g.download_url)
                    for g in item.granules
                ],
            )
            for item in build_series(granules, aoi["bbox"], min_dates)
        ]

    @app.get("/aois/{aoi_id}/timeline", response_model=TimelineOut)
    def timeline(aoi_id: str) -> TimelineOut:
        aoi = aoi_or_404(aoi_id)
        # Una sola pasada también cuenta: dice cuándo se pudo observar la zona.
        series_list = build_series(granules_for(aoi), aoi["bbox"], min_dates=1)
        result = build_timeline(
            series_list,
            date.fromisoformat(aoi["window"]["start"]),
            date.fromisoformat(aoi["window"]["end"]),
            now(),
        )
        return TimelineOut(
            aoi=aoi["id"],
            published_at_basis="cmr_updated",
            passes=[TimelinePass(**vars(item)) for item in result.passes],
            intervals=[TimelineInterval(**vars(item)) for item in result.intervals],
            gaps=[TimelineGap(**vars(item)) for item in result.gaps],
            next_pass_estimates=[NextPassEstimate(**vars(item)) for item in result.next_pass_estimates],
        )

    return app


app = create_app()
