import json
from datetime import date
from pathlib import Path

import jsonschema
import numpy as np
import pytest
import rasterio
from fastapi.testclient import TestClient
from rasterio.transform import from_origin

from verdicts import rules
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
