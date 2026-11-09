"""API de veredictos: el contrato principal que consume el frontend."""
from __future__ import annotations

import json
import os
import datetime as dt
from pathlib import Path
from typing import Literal
from urllib.parse import quote

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from . import narrative, rules
from .store import OutsideLayer, Store

TILES_PREFIX = "/tiles/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png"
STATE_COLORS = {
    "0": "#00000000",
    "1": "#e4572eff",
    "10": "#6b7280b3",
    "11": "#6b7280b3",
    "12": "#6b7280b3",
    "13": "#6b7280b3",
    "14": "#6b7280b3",
    "15": "#6b7280b3",
}


class Summary(BaseModel):
    detected: str
    does_not_prove: str
    missing: str


class Receipt(BaseModel):
    data_kind: Literal["real", "synthetic"]
    maturity: str
    series: str
    track: int
    direction: str
    frame: int
    mode: str
    polarization: str
    crid: str
    granules: list[str]
    spans_data_gap: bool
    notices: list[str]


class Evidence(BaseModel):
    observed_fraction: float
    changed_fraction: float
    threshold_hh_db: float | None
    threshold_hv_db: float | None
    mean_change_hh_db: float | None
    mean_change_hv_db: float | None
    pixel_counts: dict[str, int]
    signature_counts: dict[str, int]


class Layers(BaseModel):
    state: str
    change_hh: str
    change_hv: str


class Verdict(BaseModel):
    id: str
    aoi: str
    series: str
    kind: Literal["consecutive", "full_window"]
    from_date: dt.date
    to_date: dt.date
    state: Literal["change_probable", "no_detectable_change", "not_observable"]
    cause: str | None
    cause_label: str | None
    summary: Summary
    hypotheses: list[str]
    evidence: Evidence
    layers: Layers
    receipt: Receipt


class SeriesInfo(BaseModel):
    id: str
    data_kind: Literal["real", "synthetic"]
    maturity: str
    bbox: list[float]
    dates: list[dt.date]


class EventVerdict(BaseModel):
    aoi: str
    event_date: dt.date
    persistence_hours: int
    state: Literal["observable", "not_observable"]
    cause: str | None
    cause_label: str | None
    previous_pass: dt.date | None
    next_pass: dt.date | None
    data_kind: Literal["real", "synthetic"]
    summary: Summary


class PixelDate(BaseModel):
    date: dt.date
    hh_db: float | None
    hv_db: float | None


class PixelChange(BaseModel):
    pair: str
    state: str | None


class PixelSeries(BaseModel):
    aoi: str
    series: str
    lon: float
    lat: float
    data_kind: Literal["real", "synthetic"]
    values: list[PixelDate]
    changes: list[PixelChange]


def _tile_url(relative: str, query: str) -> str:
    return f"{TILES_PREFIX}?url={quote('file:///data/artifacts/' + relative, safe='')}&{query}"


def _layers(pair: dict) -> Layers:
    colormap = quote(json.dumps(STATE_COLORS, separators=(",", ":")), safe="")
    change = "rescale=-10,10&colormap_name=rdbu"
    return Layers(
        state=_tile_url(pair["layers"]["state"], f"colormap={colormap}"),
        change_hh=_tile_url(pair["layers"]["change_hh"], change),
        change_hv=_tile_url(pair["layers"]["change_hv"], change),
    )


def build_verdict(manifest: dict, pair: dict, lang: narrative.Lang) -> Verdict:
    stats = pair["stats"]
    decision = rules.decide(stats["counts"])
    synthetic = manifest["data_kind"] == "synthetic"
    series = manifest["series"]
    hypotheses = []
    if decision.state == rules.CHANGE_PROBABLE:
        hypotheses = [narrative.HYPOTHESES[lang][item] for item in rules.hypotheses(stats["signature_counts"])]
    return Verdict(
        id=pair["id"],
        aoi=manifest["aoi"],
        series=series["id"],
        kind=pair["kind"],
        from_date=pair["from"],
        to_date=pair["to"],
        state=decision.state,
        cause=decision.cause,
        cause_label=narrative.CAUSES[lang][decision.cause] if decision.cause else None,
        summary=Summary(
            **narrative.pair_summary(decision, pair["from"], pair["to"], pair["spans_data_gap"], lang, synthetic)
        ),
        hypotheses=hypotheses,
        evidence=Evidence(
            observed_fraction=decision.observed_fraction,
            changed_fraction=decision.changed_fraction,
            threshold_hh_db=stats["threshold_hh_db"],
            threshold_hv_db=stats["threshold_hv_db"],
            mean_change_hh_db=stats["mean_change_hh_db"],
            mean_change_hv_db=stats["mean_change_hv_db"],
            pixel_counts=stats["counts"],
            signature_counts=stats["signature_counts"],
        ),
        layers=_layers(pair),
        receipt=Receipt(
            data_kind=manifest["data_kind"],
            maturity=manifest["maturity"],
            series=series["id"],
            track=series["track"],
            direction=series["direction"],
            frame=series["frame"],
            mode=series["mode"],
            polarization=series["polarization"],
            crid=series["crid"],
            granules=pair["granules"],
            spans_data_gap=pair["spans_data_gap"],
            notices=manifest["notices"],
        ),
    )


def create_app(artifact_root: Path | None = None) -> FastAPI:
    store = Store(artifact_root or Path(os.environ.get("ARTIFACT_ROOT", "/data/artifacts")))
    app = FastAPI(title="NISAR verdicts", version="0.1.0")

    def manifests_or_404(aoi: str) -> list[dict]:
        manifests = store.manifests(aoi)
        if not manifests:
            raise HTTPException(404, f"Sin artefactos para la zona: {aoi}")
        return manifests

    def manifest_or_404(aoi: str, series: str) -> dict:
        for manifest in manifests_or_404(aoi):
            if manifest["series"]["id"] == series:
                return manifest
        raise HTTPException(404, f"Serie desconocida: {series}")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/aois", response_model=list[str])
    def aois() -> list[str]:
        return store.aois()

    @app.get("/aois/{aoi}/series", response_model=list[SeriesInfo])
    def series(aoi: str) -> list[SeriesInfo]:
        return [
            SeriesInfo(
                id=manifest["series"]["id"],
                data_kind=manifest["data_kind"],
                maturity=manifest["maturity"],
                bbox=manifest["bbox"],
                dates=[item["date"] for item in manifest["dates"]],
            )
            for manifest in manifests_or_404(aoi)
        ]

    @app.get("/aois/{aoi}/series/{series_id}/verdicts", response_model=list[Verdict])
    def verdicts(aoi: str, series_id: str, lang: narrative.Lang = "es") -> list[Verdict]:
        manifest = manifest_or_404(aoi, series_id)
        return [build_verdict(manifest, pair, lang) for pair in manifest["pairs"]]

    @app.get("/aois/{aoi}/series/{series_id}/verdicts/{pair_id}", response_model=Verdict)
    def verdict(aoi: str, series_id: str, pair_id: str, lang: narrative.Lang = "es") -> Verdict:
        manifest = manifest_or_404(aoi, series_id)
        for pair in manifest["pairs"]:
            if pair["id"] == pair_id:
                return build_verdict(manifest, pair, lang)
        raise HTTPException(404, f"Par desconocido: {pair_id}")

    @app.get("/aois/{aoi}/events", response_model=EventVerdict)
    def event(
        aoi: str,
        date: dt.date,
        persistence_hours: int = Query(24, ge=1, le=720),
        lang: narrative.Lang = "es",
    ) -> EventVerdict:
        manifests = manifests_or_404(aoi)
        passes = [dt.date.fromisoformat(item["date"]) for manifest in manifests for item in manifest["dates"]]
        status = rules.event_status(passes, date, persistence_hours)
        synthetic = any(manifest["data_kind"] == "synthetic" for manifest in manifests)
        return EventVerdict(
            aoi=aoi,
            event_date=date,
            persistence_hours=persistence_hours,
            state=status.state,
            cause=status.cause,
            cause_label=narrative.CAUSES[lang][status.cause] if status.cause else None,
            previous_pass=status.previous_pass,
            next_pass=status.next_pass,
            data_kind="synthetic" if synthetic else "real",
            summary=Summary(**narrative.event_summary(status, date.isoformat(), lang, synthetic)),
        )

    @app.get("/aois/{aoi}/series/{series_id}/pixel", response_model=PixelSeries)
    def pixel(
        aoi: str,
        series_id: str,
        lon: float = Query(ge=-180, le=180),
        lat: float = Query(ge=-90, le=90),
    ) -> PixelSeries:
        manifest = manifest_or_404(aoi, series_id)
        names = {code: name for name, code in manifest["state_codes"].items()}
        values, changes = [], []
        try:
            for item in manifest["dates"]:
                values.append(
                    PixelDate(
                        date=item["date"],
                        hh_db=store.sample(item["hh_db"], lon, lat),
                        hv_db=store.sample(item["hv_db"], lon, lat),
                    )
                )
            for pair in manifest["pairs"]:
                if pair["kind"] == "consecutive":
                    code = store.sample(pair["layers"]["state"], lon, lat)
                    changes.append(PixelChange(pair=pair["id"], state=None if code is None else names.get(int(code))))
        except OutsideLayer as exc:
            raise HTTPException(404, "El punto queda fuera de la serie") from exc
        return PixelSeries(
            aoi=aoi, series=series_id, lon=lon, lat=lat, data_kind=manifest["data_kind"], values=values, changes=changes
        )

    return app


app = create_app()
