import json
from datetime import date, datetime, timezone
from pathlib import Path

import httpx
import jsonschema
import numpy as np
import pytest
import rasterio
from fastapi.testclient import TestClient
from rasterio.transform import from_origin

from verdicts import narrative, rules
from verdicts.catalog import CatalogUnavailable, HttpTimeline, PassTime
from verdicts.main import app as public_app
from verdicts.main import create_app

ROOT = Path(__file__).resolve().parents[3]
CODES = {"no_change": 0, "change_probable": 1, "outside_scene": 10, "invalid_or_partial": 11,
         "input_exception": 12, "low_looks": 13, "no_data": 14, "terrain": 15}
LON, LAT = -105.67, 26.93


def counts(**values):
    return {name: values.get(name, 0) for name in CODES}


def test_change_probable():
    decision = rules.decide(counts(no_change=900, change_probable=100))
    assert decision.state == rules.CHANGE_PROBABLE and decision.cause is None


def test_small_change_is_not_reported():
    assert rules.decide(counts(no_change=999, change_probable=1)).state == rules.NO_DETECTABLE_CHANGE


def test_mostly_masked_scene_is_not_observable_with_dominant_cause():
    decision = rules.decide(counts(no_change=100, change_probable=100, invalid_or_partial=600, outside_scene=200))
    assert decision.state == rules.NOT_OBSERVABLE and decision.cause == "invalid_or_partial"


def test_empty_counts_are_not_observable():
    assert rules.decide(counts()).state == rules.NOT_OBSERVABLE


def test_hypotheses_are_ordered_by_area_and_ignore_minor_signatures():
    result = rules.hypotheses({"hh_up_hv_up": 30, "hh_up_hv_stable": 60, "hh_down_hv_down": 5, "other": 5})
    assert result == ["surface_moisture_or_flooded_vegetation", "more_vegetation_wetting_or_water_retreat"]


def test_no_signatures_give_no_hypotheses():
    assert rules.hypotheses({"hh_up_hv_up": 0}) == []


def test_parral_storm_falls_between_passes():
    passes = [date(2026, 6, 26), date(2026, 6, 29), date(2026, 7, 8), date(2026, 7, 11)]
    status = rules.event_status(passes, date(2026, 7, 1), 24)
    assert status.state == rules.NOT_OBSERVABLE and status.cause == "no_acquisition_during_event"
    assert (status.previous_pass, status.next_pass) == (date(2026, 6, 29), date(2026, 7, 8))


def test_event_with_pass_on_time_is_observable():
    passes = [date(2026, 6, 29), date(2026, 7, 2)]
    assert rules.event_status(passes, date(2026, 7, 1), 48).state == rules.OBSERVABLE


def test_event_outside_series():
    assert rules.event_status([date(2026, 6, 29)], date(2027, 1, 1), 24).cause == "outside_series_window"


def _cog(path: Path, value: float, dtype: str, nodata) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = np.full((40, 40), value, dtype)
    transform = from_origin(LON - 0.02, LAT + 0.02, 0.001, 0.001)
    with rasterio.open(path, "w", driver="GTiff", height=40, width=40, count=1, dtype=dtype,
                       crs="EPSG:4326", transform=transform, nodata=nodata) as dataset:
        dataset.write(data, 1)


@pytest.fixture()
def manifest_root(tmp_path):
    prefix = "parral/T048A-F015"
    dates = []
    for day, stamp in (("2026-06-29", "20260629"), ("2026-07-11", "20260711")):
        hh, hv = f"{prefix}/dates/{stamp}/hh_db.tif", f"{prefix}/dates/{stamp}/hv_db.tif"
        _cog(tmp_path / hh, -12.5, "float32", float("nan"))
        _cog(tmp_path / hv, -19.5, "float32", float("nan"))
        dates.append({"date": day, "granule": f"G{stamp}", "hh_db": hh, "hv_db": hv})
    pair_id = "20260629_20260711"
    layers = {
        "state": f"{prefix}/pairs/{pair_id}/state.tif",
        "change_hh": f"{prefix}/pairs/{pair_id}/change_hh.tif",
        "change_hv": f"{prefix}/pairs/{pair_id}/change_hv.tif",
    }
    _cog(tmp_path / layers["state"], 1, "uint8", 255)
    manifest = {
        "schema_version": 1, "aoi": "parral",
        "series": {"id": "T048A-F015", "track": 48, "direction": "A", "frame": 15,
                   "mode": "4005", "polarization": "DHDH", "crid": "P05023"},
        "data_kind": "synthetic", "maturity": "PROVISIONAL", "crs": "EPSG:32613",
        "bbox": [-105.95, 26.7, -105.4, 27.15], "state_codes": CODES,
        "notices": ["DATOS SINTÉTICOS"], "dates": dates,
        "pairs": [{
            "id": pair_id, "from": "2026-06-29", "to": "2026-07-11", "kind": "consecutive", "spans_data_gap": False,
            "granules": ["G20260629", "G20260711"], "layers": layers,
            "stats": {"counts": counts(no_change=900, change_probable=100),
                      "signature_counts": {"hh_up_hv_stable": 100}, "threshold_hh_db": 3.0,
                      "threshold_hv_db": 3.0, "mean_change_hh_db": 5.0, "mean_change_hv_db": 0.4},
        }],
    }
    schema = json.loads((ROOT / "contracts" / "artifact-manifest.schema.json").read_text(encoding="utf-8"))
    jsonschema.validate(manifest, schema)
    (tmp_path / prefix / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return tmp_path


@pytest.fixture()
def client(manifest_root):
    return TestClient(create_app(manifest_root))


def test_verdict_has_receipt_and_marks_synthetic(client):
    body = client.get("/aois/parral/series/T048A-F015/verdicts/20260629_20260711").json()
    assert body["state"] == "change_probable"
    assert body["receipt"]["data_kind"] == "synthetic" and body["receipt"]["crid"] == "P05023"
    assert body["summary"]["detected"].startswith("[DATOS SINTÉTICOS]")
    assert body["hypotheses"] and "file%3A%2F%2F%2Fdata%2Fartifacts" in body["layers"]["state"]


def test_verdict_in_english(client):
    body = client.get("/aois/parral/series/T048A-F015/verdicts/20260629_20260711", params={"lang": "en"}).json()
    assert body["summary"]["detected"].startswith("[SYNTHETIC DATA]")


def test_event_endpoint(client):
    body = client.get("/aois/parral/events", params={"date": "2026-07-01"}).json()
    assert body["state"] == "not_observable" and body["cause"] == "no_acquisition_during_event"


def test_pixel_series(client):
    body = client.get("/aois/parral/series/T048A-F015/pixel", params={"lon": LON, "lat": LAT}).json()
    assert body["values"][0]["hh_db"] == pytest.approx(-12.5)
    assert body["changes"][0]["state"] == "change_probable"


def test_pixel_with_no_change_keeps_its_state(manifest_root):
    _cog(manifest_root / "parral/T048A-F015/pairs/20260629_20260711/state.tif", 0, "uint8", 255)
    body = TestClient(create_app(manifest_root)).get(
        "/aois/parral/series/T048A-F015/pixel", params={"lon": LON, "lat": LAT}
    ).json()
    assert body["changes"][0]["state"] == "no_change"


def test_pixel_at_zero_db_is_not_null(manifest_root):
    _cog(manifest_root / "parral/T048A-F015/dates/20260629/hv_db.tif", 0.0, "float32", float("nan"))
    body = TestClient(create_app(manifest_root)).get(
        "/aois/parral/series/T048A-F015/pixel", params={"lon": LON, "lat": LAT}
    ).json()
    assert body["values"][0]["hv_db"] == 0.0


def test_pixel_outside_series(client):
    assert client.get("/aois/parral/series/T048A-F015/pixel", params={"lon": 10, "lat": 40}).status_code == 404


@pytest.mark.parametrize("path", ["/aois/../series", "/aois/nope/series", "/aois/parral/series/bad/verdicts"])
def test_unknown_resources_are_404(client, path):
    assert client.get(path).status_code == 404


def test_contract_is_current():
    committed = json.loads((ROOT / "contracts" / "verdicts.openapi.json").read_text(encoding="utf-8"))
    assert committed == json.loads(json.dumps(public_app.openapi())), "Regenera el contrato con export_openapi"


# --- T-BAL-02: interval_days y frescura -------------------------------------------------

TODAY = datetime(2026, 11, 11, 18, 0, tzinfo=timezone.utc)
VERDICT = "/aois/parral/series/T048A-F015/verdicts/20260629_20260711"


def _clock():
    return TODAY


class FakeTimeline:
    def __init__(self, passes=None, fail=False):
        self.calls = 0
        self.fail = fail
        self.result = passes or {}

    def passes(self, aoi):
        self.calls += 1
        if self.fail:
            raise CatalogUnavailable(aoi)
        return self.result


def _as_real(manifest_root, **pair_changes):
    path = manifest_root / "parral/T048A-F015/manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    manifest["data_kind"], manifest["notices"] = "real", []
    manifest["pairs"][0].update(pair_changes)
    path.write_text(json.dumps(manifest), encoding="utf-8")


REAL_PASSES = {
    "G20260629": PassTime(datetime(2026, 6, 29, 0, 41, 12, tzinfo=timezone.utc),
                          datetime(2026, 7, 1, 8, 11, tzinfo=timezone.utc), 55.5),
    "G20260711": PassTime(datetime(2026, 7, 11, 0, 41, 30, tzinfo=timezone.utc),
                          datetime(2026, 7, 12, 14, 0, tzinfo=timezone.utc), 37.3),
}


def test_verdict_reports_interval_and_age(manifest_root):
    body = TestClient(create_app(manifest_root, clock=_clock)).get(VERDICT).json()
    assert body["interval_days"] == 12
    freshness = body["receipt"]["freshness"]
    assert freshness["reference_date"] == "2026-11-11"
    assert freshness["before"]["age_days"] == 135 and freshness["after"]["age_days"] == 123
    assert "(12 días)" in body["summary"]["detected"]
    assert "123 días" in body["summary"]["missing"]


def test_synthetic_verdict_never_asks_catalog(manifest_root):
    timeline = FakeTimeline(REAL_PASSES)
    body = TestClient(create_app(manifest_root, timeline=timeline, clock=_clock)).get(VERDICT).json()
    assert timeline.calls == 0
    assert body["receipt"]["freshness"]["after"]["latency_status"] == "synthetic"
    assert body["receipt"]["freshness"]["after"]["publication_latency_hours"] is None
    assert "no aplica a datos sintéticos" in body["summary"]["missing"]


def test_real_verdict_takes_latency_from_catalog(manifest_root):
    _as_real(manifest_root)
    client = TestClient(create_app(manifest_root, timeline=FakeTimeline(REAL_PASSES), clock=_clock))
    body = client.get(VERDICT).json()
    after = body["receipt"]["freshness"]["after"]
    assert after["latency_status"] == "available" and after["publication_latency_hours"] == 37.3
    assert after["acquired_at"].startswith("2026-07-11T00:41:30")
    assert "37,3 horas" in body["summary"]["missing"]
    english = client.get(VERDICT, params={"lang": "en"}).json()["summary"]["missing"]
    assert "123 days old" in english and "37.3 hours" in english


def test_catalog_down_does_not_break_the_verdict(manifest_root):
    _as_real(manifest_root)
    response = TestClient(create_app(manifest_root, timeline=FakeTimeline(fail=True), clock=_clock)).get(VERDICT)
    assert response.status_code == 200
    after = response.json()["receipt"]["freshness"]["after"]
    assert after["latency_status"] == "catalog_unavailable" and after["acquired_at"] is None
    assert "el catálogo no respondió" in response.json()["summary"]["missing"]


def test_granule_missing_from_catalog_is_declared(manifest_root):
    _as_real(manifest_root)
    body = TestClient(create_app(manifest_root, timeline=FakeTimeline({}), clock=_clock)).get(VERDICT).json()
    assert body["receipt"]["freshness"]["after"]["latency_status"] == "granule_not_in_catalog"


def test_pair_across_august_gap_says_24_days_and_why(manifest_root):
    _as_real(manifest_root, **{"from": "2026-07-23", "to": "2026-08-16", "spans_data_gap": True})
    body = TestClient(create_app(manifest_root, clock=_clock)).get(VERDICT).json()
    assert body["interval_days"] == 24
    assert "(24 días)" in body["summary"]["detected"]
    assert "separadas 24 días" in body["summary"]["missing"] and "hueco" in body["summary"]["missing"]


def test_full_window_does_not_blame_the_gap_for_its_length(manifest_root):
    _as_real(manifest_root, **{"from": "2026-06-17", "to": "2026-10-15", "kind": "full_window", "spans_data_gap": True})
    client = TestClient(create_app(manifest_root, clock=_clock))
    body = client.get(VERDICT).json()
    assert body["interval_days"] == 120
    assert "porque el par cruza el hueco" not in body["summary"]["missing"]
    assert "primera y la última fecha" in body["summary"]["missing"] and "incluye el hueco" in body["summary"]["missing"]
    english = client.get(VERDICT, params={"lang": "en"}).json()["summary"]["missing"]
    assert "because the pair crosses" not in english and "first and last dates" in english


def test_singular_day_in_both_languages():
    assert narrative.freshness_text(1, None, "synthetic", "es").startswith("La imagen más reciente tiene 1 día.")
    assert narrative.freshness_text(1, None, "synthetic", "en").startswith("The most recent image is 1 day old.")


def _timeline_body():
    return {"passes": [
        {"granule_id": "G20260711.h5", "acquired_at": "2026-07-11T00:41:30Z",
         "published_at": "2026-07-12T14:00:00Z", "latency_hours": 37.3},
        {"granule_id": "G20260723", "acquired_at": "2026-07-23T00:41:30Z",
         "published_at": None, "latency_hours": None},
    ]}


def test_http_timeline_parses_and_caches():
    calls = []

    def handler(request):
        calls.append(request.url.path)
        return httpx.Response(200, json=_timeline_body())

    clock = [0.0]
    source = HttpTimeline("http://catalog:8000/", httpx.Client(transport=httpx.MockTransport(handler)), lambda: clock[0])
    passes = source.passes("parral")
    assert calls == ["/aois/parral/timeline"]
    assert passes["G20260711"].latency_hours == 37.3 and passes["G20260723"].published_at is None
    source.passes("parral")
    assert len(calls) == 1
    clock[0] = 10_000
    source.passes("parral")
    assert len(calls) == 2


def test_http_timeline_failure_is_cached_briefly():
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(404)

    clock = [0.0]
    source = HttpTimeline("http://catalog:8000", httpx.Client(transport=httpx.MockTransport(handler)), lambda: clock[0])
    for _ in range(2):
        with pytest.raises(CatalogUnavailable):
            source.passes("parral")
    assert len(calls) == 1
    clock[0] = 120
    with pytest.raises(CatalogUnavailable):
        source.passes("parral")
    assert len(calls) == 2
