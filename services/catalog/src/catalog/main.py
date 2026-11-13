"""API del catálogo: zonas, series comparables, línea de tiempo y referencias externas."""
from __future__ import annotations

import os
from collections.abc import Callable
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Annotated, Literal, TypeVar

import httpx
import yaml
from fastapi import FastAPI, HTTPException, Query
from pydantic import AfterValidator, BaseModel, Field

from .cmr import CmrSource, GranuleSource
from . import opera, plan
from .optical import COLLECTION, LICENSE_URL, EarthSearchSource, SceneSource, group_acquisitions, window
from .pairing import Granule, build_series, series_id
from .timeline import build_timeline

T = TypeVar("T")

# Lo que puede pasar al leer un servicio externo: sin red, error HTTP, o un cuerpo que no es
# JSON (ValueError) o no trae lo esperado (KeyError). Todo acaba en 502, nunca en datos parciales.
UPSTREAM_ERRORS = (httpx.HTTPError, ValueError, KeyError)


def _upstream(call: Callable[[], T], detail: str) -> T:
    try:
        return call()
    except UPSTREAM_ERRORS as exc:
        raise HTTPException(502, detail) from exc


def _as_utc(value: datetime) -> datetime:
    """Toda hora de la API sale en UTC. Una hora sin zona es un fallo del código, no se adivina."""
    if value.tzinfo is None:
        raise ValueError("hora sin zona horaria")
    return value.astimezone(timezone.utc)


UtcDatetime = Annotated[datetime, AfterValidator(_as_utc)]


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


class ExcludedGranule(BaseModel):
    id: str = Field(description="granule_id excluido, el título de CMR sin extensión.")
    date: date
    acquired_at: UtcDatetime = Field(description="Inicio de la adquisición, en UTC.")
    reason: str = Field(description="Código del motivo. product_defect: el fallo está en el producto publicado.")
    evidence: str = Field(description="Cómo se comprobó.")
    checked_on: date = Field(description="Fecha de la comprobación.")


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
    granules: list[SeriesGranule] = Field(description="Fechas utilizables, sin las excluidas.")
    excluded: list[ExcludedGranule] = Field(
        description="Gránulos de la serie que existen en CMR pero se declararon inservibles en la zona."
    )


class TimelinePass(BaseModel):
    series: str
    granule_id: str
    acquired_at: UtcDatetime = Field(description="Inicio de la adquisición, en UTC.")
    published_at: UtcDatetime | None = Field(
        description="Última actualización del gránulo en CMR, en UTC. Aproxima la publicación."
    )
    latency_hours: float | None = Field(description="Horas entre la adquisición y published_at.")
    contains_aoi: bool = Field(description="La huella de la serie contiene la zona completa.")


class TimelineInterval(BaseModel):
    series: str
    start: UtcDatetime
    end: UtcDatetime
    days: int = Field(description="Días entre dos pasadas consecutivas de la misma serie.")
    crosses_gap: bool = Field(description="El intervalo atraviesa un hueco de adquisición conocido.")


class TimelineGap(BaseModel):
    start: date = Field(description="Primer día sin adquisiciones, incluido.")
    end: date = Field(description="Último día sin adquisiciones, incluido.")
    source: str


class ObservationPlan(BaseModel):
    status: Literal["planned", "partial", "not_planned", "no_plan", "unknown"] = Field(
        description=(
            "Qué dice el plan diario de NISAR (NISAR_COP) para la hora estimada. planned: una observación L-SAR "
            "cubre de 10 s antes a 40 s después. partial: la cubre solo en parte. not_planned: hay plan y no la "
            "cubre. no_plan: no hay plan publicado para esa hora. unknown: catalog no tiene el resumen de "
            "`ingest plan` o no coincide con esta pasada. Un plan no garantiza la adquisición: en el hueco de "
            "2026-07-27 a 2026-08-02 hubo planes y no se adquirió nada."
        )
    )
    plan: str | None = Field(description="Título del gránulo de NISAR_COP que se usó, con su versión.")
    config_id: str | None = Field(description="LSAR_CONFIG_ID de la observación planificada.")
    same_config: bool | None = Field(
        description="La configuración coincide con la del plan de la última pasada adquirida. null si falta alguna."
    )
    checked_at: UtcDatetime | None = Field(description="Cuándo consultó ingest el plan, en UTC.")


class NextPassEstimate(BaseModel):
    series: str
    expected_at: UtcDatetime = Field(description="Estimación, no plan de observación: última pasada más N ciclos.")
    basis: Literal["12-day cycle"]
    observation_plan: ObservationPlan = Field(
        description="Si el plan de observación de NISAR incluye esta pasada. No cambia expected_at."
    )


class ExcludedPass(ExcludedGranule):
    series: str


class TimelineOut(BaseModel):
    aoi: str
    published_at_basis: Literal["cmr_updated"] = Field(
        description="published_at es la fecha 'updated' de CMR, una aproximación a la publicación real."
    )
    passes: list[TimelinePass]
    intervals: list[TimelineInterval]
    gaps: list[TimelineGap]
    next_pass_estimates: list[NextPassEstimate]
    excluded: list[ExcludedPass] = Field(
        description="Pasadas que existen pero se declararon inservibles; no están en passes ni en intervals."
    )


class OpticalTile(BaseModel):
    id: str
    tile: str = Field(description="Tesela MGRS de unos 110 km de lado.")
    acquired_at: UtcDatetime
    cloud_cover: float = Field(description="Porcentaje de nubes de la tesela completa, no de la zona.")
    visual_url: str = Field(description="COG en color verdadero (TCI), legible por HTTPS sin cuenta.")


class OpticalAcquisition(BaseModel):
    platform: str
    acquired_at: UtcDatetime = Field(description="Hora UTC de la primera tesela de la adquisición.")
    days_from_date: int = Field(description="Días respecto a la fecha pedida; negativo si es anterior.")
    covers_aoi: bool = Field(description="Las teselas juntas cubren toda la zona.")
    max_cloud_cover: float = Field(description="Mayor nubosidad entre sus teselas. Es de la tesela, no de la zona.")
    tiles: list[OpticalTile]


class OpticalOut(BaseModel):
    aoi: str
    date: date
    days: int
    max_cloud: float
    source: str
    collection: str
    license: str
    license_url: str
    attribution: str = Field(description="Texto de atribución que debe mostrarse junto a la imagen.")
    cloud_cover_basis: Literal["tile"] = Field(
        description="La nubosidad es la de cada tesela MGRS completa; la zona puede estar más o menos nublada."
    )
    acquisitions: list[OpticalAcquisition]


class OperaTileOut(BaseModel):
    id: str = Field(description="Título del gránulo en CMR, sin extensión.")
    tile: str = Field(description="Tesela MGRS sin la T inicial.")
    acquired_at: UtcDatetime = Field(description="time_start de CMR, en UTC.")
    produced_at: UtcDatetime = Field(description="Hora de producción que figura en el título, en UTC.")
    wtr_url: str = Field(description="GeoTIFF B01_WTR, clasificación de agua. Pide cuenta de Earthdata.")
    conf_url: str = Field(description="GeoTIFF B03_CONF, confianza. Pide cuenta de Earthdata. Vacío si CMR no lo publica.")
    browse_url: str | None = Field(description="Vista previa PNG del bucket público de PO.DAAC, sin cuenta ni georreferencia.")


class OperaAcquisition(BaseModel):
    platform: str
    acquired_at: UtcDatetime = Field(description="time_start de CMR de la primera tesela de la pasada, en UTC.")
    days_from_date: int = Field(description="Días entre la fecha UTC de la pasada y la pedida; negativo si es anterior.")
    covers_aoi: bool = Field(description="Las cajas de sus teselas contienen la zona. No dice si hay datos válidos en toda ella.")
    tiles: list[OperaTileOut]


class OperaOut(BaseModel):
    aoi: str
    date: date
    days: int
    source: str
    collection: str
    doi: str
    attribution: str = Field(description="Texto de atribución que debe mostrarse junto al producto.")
    product_spec_url: str
    min_water_body_ha: float = Field(description="Superficie mínima de una masa de agua abierta que el producto detecta.")
    min_water_body_width_m: float = Field(description="Anchura mínima de una masa de agua abierta que el producto detecta.")
    coverage_basis: Literal["tile_bbox"] = Field(
        description="covers_aoi usa la caja de cada tesela MGRS, no los píxeles válidos."
    )
    data_access: Literal["earthdata_login"] = Field(
        description="wtr_url y conf_url piden cuenta de Earthdata; browse_url no."
    )
    acquisitions: list[OperaAcquisition] = Field(description="Vacía si no hay productos en la ventana.")


def _load_aois(aoi_dir: Path) -> dict[str, dict]:
    result = {}
    for path in sorted(aoi_dir.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        result[data["id"]] = data
    return result


def _exclusions(aoi: dict) -> dict[str, dict]:
    """granule_id -> entrada de `exclude` de cualquier serie de la zona."""
    return {
        entry["granule"]: entry
        for item in aoi.get("series", [])
        for entry in item.get("exclude") or []
    }


def _split(aoi: dict, granules: list[Granule]) -> tuple[list[Granule], list[tuple[Granule, dict]]]:
    rules = _exclusions(aoi)
    usable = [g for g in granules if g.id not in rules]
    excluded = sorted(((g, rules[g.id]) for g in granules if g.id in rules), key=lambda pair: pair[0].acquired_at)
    return usable, excluded


def _excluded_fields(granule: Granule, entry: dict) -> dict:
    return {
        "id": granule.id,
        "date": granule.start,
        "acquired_at": granule.acquired_at,
        "reason": entry["reason"],
        "evidence": " ".join(str(entry["evidence"]).split()),
        "checked_on": entry["checked_on"],
    }


def create_app(
    aoi_dir: Path | None = None,
    source: GranuleSource | None = None,
    clock: Callable[[], datetime] | None = None,
    optical_source: SceneSource | None = None,
    opera_source: opera.OperaSource | None = None,
    plan_dir: Path | None = None,
) -> FastAPI:
    directory = aoi_dir or Path(os.environ.get("AOI_DIR", "/config/aois"))
    plans = plan_dir or Path(os.environ.get("PLAN_DIR", "/data/plan"))
    granule_source = source or CmrSource()
    scene_source = optical_source or EarthSearchSource()
    water_source = opera_source or opera.CmrOperaSource()
    now = clock or (lambda: datetime.now(timezone.utc))
    app = FastAPI(title="NISAR catalog", version="0.1.0")

    def aoi_or_404(aoi_id: str) -> dict:
        aoi = _load_aois(directory).get(aoi_id)
        if aoi is None:
            raise HTTPException(404, f"Zona desconocida: {aoi_id}")
        return aoi

    def granules_for(aoi: dict) -> list[Granule]:
        return _upstream(
            lambda: granule_source.granules(
                aoi["collection"], aoi["bbox"], aoi["window"]["start"], aoi["window"]["end"]
            ),
            "El catálogo CMR no respondió o su respuesta no se pudo leer",
        )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/aois", response_model=list[Aoi])
    def aois() -> list[dict]:
        return list(_load_aois(directory).values())

    @app.get("/aois/{aoi_id}/series", response_model=list[SeriesOut])
    def series(aoi_id: str, min_dates: int = Query(2, ge=2)) -> list[SeriesOut]:
        aoi = aoi_or_404(aoi_id)
        usable, excluded = _split(aoi, granules_for(aoi))
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
                excluded=[
                    ExcludedGranule(**_excluded_fields(g, entry))
                    for g, entry in excluded
                    if g.group_key == (item.track, item.direction, item.frame, item.mode, item.polarization, item.crid)
                ],
            )
            for item in build_series(usable, aoi["bbox"], min_dates)
        ]

    @app.get("/aois/{aoi_id}/timeline", response_model=TimelineOut)
    def timeline(aoi_id: str) -> TimelineOut:
        aoi = aoi_or_404(aoi_id)
        usable, excluded = _split(aoi, granules_for(aoi))
        # Una sola pasada también cuenta: dice cuándo se pudo observar la zona.
        series_list = build_series(usable, aoi["bbox"], min_dates=1)
        result = build_timeline(
            series_list,
            date.fromisoformat(aoi["window"]["start"]),
            date.fromisoformat(aoi["window"]["end"]),
            now(),
        )
        observation = plan.load_plan(plans, aoi["id"])
        return TimelineOut(
            aoi=aoi["id"],
            published_at_basis="cmr_updated",
            passes=[TimelinePass(**vars(item)) for item in result.passes],
            intervals=[TimelineInterval(**vars(item)) for item in result.intervals],
            gaps=[TimelineGap(**vars(item)) for item in result.gaps],
            next_pass_estimates=[
                NextPassEstimate(
                    **vars(item),
                    observation_plan=ObservationPlan(**vars(plan.status_for(observation, item.series, item.expected_at))),
                )
                for item in result.next_pass_estimates
            ],
            excluded=[ExcludedPass(series=series_id(*g.group_key), **_excluded_fields(g, entry)) for g, entry in excluded],
        )

    @app.get("/aois/{aoi_id}/references/optical", response_model=OpticalOut)
    def optical(
        aoi_id: str,
        date: date = Query(description="Fecha de referencia, normalmente la de una pasada NISAR."),
        days: int = Query(7, ge=0, le=30, description="Días antes y después de la fecha."),
        max_cloud: float = Query(
            30, ge=0, le=100, description="Nubosidad máxima por tesela, en %. Valor inicial sin calibrar."
        ),
    ) -> OpticalOut:
        aoi = aoi_or_404(aoi_id)
        start, end = window(date, days)
        scenes = _upstream(
            lambda: scene_source.scenes(aoi["bbox"], start, end),
            "Earth Search no respondió o su respuesta no se pudo leer; no hay escenas ópticas",
        )
        acquisitions = group_acquisitions(scenes, aoi["bbox"], date, max_cloud)
        years = sorted({acq.acquired_at.year for acq in acquisitions}) or [date.year]
        return OpticalOut(
            aoi=aoi["id"],
            date=date,
            days=days,
            max_cloud=max_cloud,
            source="Earth Search v1 (Element 84)",
            collection=COLLECTION,
            license="Datos Copernicus Sentinel: acceso libre con atribución",
            license_url=LICENSE_URL,
            attribution=f"Contiene datos modificados de Copernicus Sentinel {', '.join(map(str, years))}",
            cloud_cover_basis="tile",
            acquisitions=[
                OpticalAcquisition(
                    platform=acq.platform,
                    acquired_at=acq.acquired_at,
                    days_from_date=acq.days_from_date,
                    covers_aoi=acq.covers_aoi,
                    max_cloud_cover=acq.max_cloud_cover,
                    tiles=[
                        OpticalTile(
                            id=tile.id,
                            tile=tile.tile,
                            acquired_at=tile.acquired_at,
                            cloud_cover=tile.cloud_cover,
                            visual_url=tile.visual_url,
                        )
                        for tile in acq.tiles
                    ],
                )
                for acq in acquisitions
            ],
        )

    @app.get("/aois/{aoi_id}/references/opera", response_model=OperaOut)
    def opera_water(
        aoi_id: str,
        date: date = Query(description="Fecha de referencia, normalmente la de una pasada NISAR."),
        days: int = Query(7, ge=0, le=30, description="Días antes y después de la fecha."),
    ) -> OperaOut:
        aoi = aoi_or_404(aoi_id)
        start, end = window(date, days)
        tiles = _upstream(
            lambda: water_source.tiles(aoi["bbox"], start, end),
            "CMR no respondió o su respuesta no se pudo leer; no hay referencias OPERA",
        )
        passes = opera.group_passes(tiles, aoi["bbox"], date)
        years = sorted({p.acquired_at.year for p in passes}) or [date.year]
        return OperaOut(
            aoi=aoi["id"],
            date=date,
            days=days,
            source="NASA CMR",
            collection=opera.COLLECTION,
            doi=opera.DOI,
            attribution=(
                "OPERA Dynamic Surface Water Extent from Sentinel-1 (v1), NASA JPL OPERA, distribuido por PO.DAAC. "
                f"Contiene datos modificados de Copernicus Sentinel {', '.join(map(str, years))}"
            ),
            product_spec_url=opera.PRODUCT_SPEC_URL,
            min_water_body_ha=opera.MIN_WATER_BODY_HA,
            min_water_body_width_m=opera.MIN_WATER_BODY_WIDTH_M,
            coverage_basis="tile_bbox",
            data_access="earthdata_login",
            acquisitions=[
                OperaAcquisition(
                    platform=p.platform,
                    acquired_at=p.acquired_at,
                    days_from_date=p.days_from_date,
                    covers_aoi=p.covers_aoi,
                    tiles=[
                        OperaTileOut(
                            id=t.id,
                            tile=t.tile,
                            acquired_at=t.acquired_at,
                            produced_at=t.produced_at,
                            wtr_url=t.wtr_url,
                            conf_url=t.conf_url,
                            browse_url=t.browse_url,
                        )
                        for t in p.tiles
                    ],
                )
                for p in passes
            ],
        )

    return app


app = create_app()
