"""API del catálogo: qué zonas hay y qué series comparables existen para cada una."""
from __future__ import annotations

import os
from datetime import date
from pathlib import Path

import httpx
import yaml
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from .cmr import CmrSource, GranuleSource
from .pairing import build_series


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


def _load_aois(aoi_dir: Path) -> dict[str, dict]:
    result = {}
    for path in sorted(aoi_dir.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        result[data["id"]] = data
    return result


def create_app(aoi_dir: Path | None = None, source: GranuleSource | None = None) -> FastAPI:
    directory = aoi_dir or Path(os.environ.get("AOI_DIR", "/config/aois"))
    granule_source = source or CmrSource()
    app = FastAPI(title="NISAR catalog", version="0.1.0")

    def aoi_or_404(aoi_id: str) -> dict:
        aoi = _load_aois(directory).get(aoi_id)
        if aoi is None:
            raise HTTPException(404, f"Zona desconocida: {aoi_id}")
        return aoi

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/aois", response_model=list[Aoi])
    def aois() -> list[dict]:
        return list(_load_aois(directory).values())

    @app.get("/aois/{aoi_id}/series", response_model=list[SeriesOut])
    def series(aoi_id: str, min_dates: int = Query(2, ge=2)) -> list[SeriesOut]:
        aoi = aoi_or_404(aoi_id)
        try:
            granules = granule_source.granules(
                aoi["collection"], aoi["bbox"], aoi["window"]["start"], aoi["window"]["end"]
            )
        except httpx.HTTPError as exc:
            raise HTTPException(502, "El catálogo CMR no respondió") from exc
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
                granules=[SeriesGranule(id=g.id, date=g.start, size_mb=g.size_mb) for g in item.granules],
            )
            for item in build_series(granules, aoi["bbox"], min_dates)
        ]

    return app


app = create_app()
