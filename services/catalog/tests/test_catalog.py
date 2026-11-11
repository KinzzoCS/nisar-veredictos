import json
from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient

from catalog.cmr import data_url
from catalog.main import app as public_app
from catalog.main import create_app
from catalog.pairing import build_series, crosses_gap, parse_title

ROOT = Path(__file__).resolve().parents[3]
BBOX = [-105.95, 26.70, -105.40, 27.15]
BIG = ((-107.0, 26.0), (-104.0, 26.0), (-104.0, 28.0), (-107.0, 28.0))
TITLE = "NISAR_L2_PR_GCOV_033_048_A_015_4005_DHDH_A_{d}T094225_{d}T094259_{c}_N_F_J_001"


def granule(day: str, crid: str = "P05023", footprint=BIG):
    return parse_title(TITLE.format(d=day, c=crid), 7000.0, footprint)


def test_parse_real_title():
    parsed = parse_title(
        "NISAR_L2_PR_GCOV_033_132_A_169_2005_DHDH_A_20261021T094225_20261021T094259_P05023_N_F_J_001"
    )
    assert (parsed.track, parsed.direction, parsed.frame, parsed.mode, parsed.crid) == (132, "A", 169, "2005", "P05023")
    assert parsed.start == date(2026, 10, 21)


def test_parse_rejects_foreign_title():
    assert parse_title("OPERA_L3_DSWX-S1_V1") is None


def test_different_crid_never_shares_a_series():
    granules = [granule("20260617"), granule("20260629"), granule("20261103", "P05036"), granule("20261115", "P05036")]
    series = build_series(granules, BBOX)
    assert {item.crid for item in series} == {"P05023", "P05036"}
    assert all(len(item.granules) == 2 for item in series)


def test_data_gap_is_flagged():
    assert crosses_gap(date(2026, 7, 23), date(2026, 8, 16))
    assert not crosses_gap(date(2026, 8, 16), date(2026, 8, 28))
    series = build_series([granule("20260723"), granule("20260816")], BBOX)[0]
    assert series.spans_data_gap and series.max_gap_days == 24


def test_partial_footprint_does_not_contain_aoi():
    small = ((-105.7, 26.8), (-105.5, 26.8), (-105.5, 27.0), (-105.7, 27.0))
    series = build_series([granule("20260617", footprint=small), granule("20260629", footprint=small)], BBOX)[0]
    assert not series.contains_aoi


def test_data_url_picks_only_the_main_https_product():
    prefix = "http://esipfed.org/ns/fedsearch/1.1"
    entry = {
        "links": [
            {"rel": f"{prefix}/s3#", "href": "s3://bucket/product.h5"},
            {"rel": f"{prefix}/metadata#", "href": "https://host/product_QA_STATS.h5"},
            {"rel": f"{prefix}/data#", "href": "https://search.asf.alaska.edu/"},
            {"rel": f"{prefix}/data#", "href": "https://host/product.h5"},
        ]
    }
    assert data_url(entry) == "https://host/product.h5"
    assert data_url({"links": []}) == ""


class FakeSource:
    def granules(self, collection, bbox, start, end):
        return [granule("20260617"), granule("20260629")]


def client():
    return TestClient(create_app(ROOT / "config" / "aois", FakeSource()))


def test_api_lists_series():
    body = client().get("/aois/parral/series").json()
    assert body[0]["id"] == "T048A-F015-4005-DHDH-P05023"
    assert body[0]["maturity"] == "PROVISIONAL" and body[0]["contains_aoi"]


def test_unknown_aoi_is_404():
    assert client().get("/aois/nope/series").status_code == 404


def test_contract_is_current():
    committed = json.loads((ROOT / "contracts" / "catalog.openapi.json").read_text(encoding="utf-8"))
    assert committed == json.loads(json.dumps(public_app.openapi())), "Regenera el contrato con export_openapi"


# --- Línea de tiempo (T-ANT-04) ---

from datetime import datetime, timezone

import httpx

from catalog.cmr import updated_at
from catalog.timeline import build_timeline

# Fechas de T048 ascendente medidas en CMR el 2026-11-09 (MEMORY.md).
T048_DATES = ["20260617", "20260629", "20260711", "20260723", "20260816",
              "20260828", "20260909", "20260921", "20261003", "20261015"]
NOW = datetime(2026, 11, 10, tzinfo=timezone.utc)


def published(day: str, crid: str = "P05023", when: datetime | None = None):
    return parse_title(TITLE.format(d=day, c=crid), 7000.0, BIG, "", when)


class ListSource:
    def __init__(self, granules):
        self._granules = granules

    def granules(self, collection, bbox, start, end):
        return self._granules


class BrokenSource:
    def granules(self, collection, bbox, start, end):
        raise httpx.ConnectError("sin red")


def timeline_client(source):
    return TestClient(create_app(ROOT / "config" / "aois", source, clock=lambda: NOW))


def test_parse_title_keeps_acquisition_time_in_utc():
    parsed = granule("20260617")
    assert parsed.acquired_at == datetime(2026, 6, 17, 9, 42, 25, tzinfo=timezone.utc)


def test_updated_at_reads_cmr_utc_timestamp():
    assert updated_at({"updated": "2026-07-09T03:32:43.193Z"}) == datetime(
        2026, 7, 9, 3, 32, 43, 193000, tzinfo=timezone.utc
    )
    assert updated_at({}) is None


def test_parral_timeline_shows_gap_and_24_day_interval():
    body = timeline_client(ListSource([granule(d) for d in T048_DATES])).get("/aois/parral/timeline").json()
    assert body["gaps"] == [{"start": "2026-07-27", "end": "2026-08-10", "source": "ASF"}]
    crossing = [item for item in body["intervals"] if item["crosses_gap"]]
    assert len(crossing) == 1
    assert crossing[0]["days"] == 24
    assert crossing[0]["start"].startswith("2026-07-23") and crossing[0]["end"].startswith("2026-08-16")
    assert {item["days"] for item in body["intervals"] if not item["crosses_gap"]} == {12}
    assert len(body["passes"]) == 10


def test_timeline_times_are_utc_iso8601():
    body = timeline_client(ListSource([granule("20260617"), granule("20260629")])).get("/aois/parral/timeline").json()
    stamps = [p["acquired_at"] for p in body["passes"]] + [i["start"] for i in body["intervals"]]
    stamps += [e["expected_at"] for e in body["next_pass_estimates"]]
    assert stamps and all(s.endswith("Z") for s in stamps)
    assert body["passes"][0]["acquired_at"] == "2026-06-17T09:42:25Z"


def test_timeline_reports_publication_latency_or_null():
    known = published("20260617", when=datetime(2026, 7, 9, 3, 32, 43, tzinfo=timezone.utc))
    body = timeline_client(ListSource([known, granule("20260629")])).get("/aois/parral/timeline").json()
    first, second = body["passes"]
    assert first["published_at"] == "2026-07-09T03:32:43Z"
    assert first["latency_hours"] == 521.8
    assert second["published_at"] is None and second["latency_hours"] is None
    assert body["published_at_basis"] == "cmr_updated"


def test_next_pass_is_an_estimate_after_now():
    body = timeline_client(ListSource([granule(d) for d in T048_DATES])).get("/aois/parral/timeline").json()
    assert body["next_pass_estimates"] == [
        {"series": "T048A-F015-4005-DHDH-P05023", "expected_at": "2026-11-20T09:42:25Z", "basis": "12-day cycle"}
    ]


def test_single_pass_series_appears_without_intervals():
    body = timeline_client(ListSource([granule("20260617", "P05036")])).get("/aois/parral/timeline").json()
    assert len(body["passes"]) == 1 and body["intervals"] == []


def test_timeline_cmr_failure_is_502():
    response = timeline_client(BrokenSource()).get("/aois/parral/timeline")
    assert response.status_code == 502
    assert "CMR" in response.json()["detail"]


def test_timeline_unknown_aoi_is_404():
    assert timeline_client(ListSource([])).get("/aois/nope/timeline").status_code == 404


def test_gap_outside_window_is_not_reported():
    result = build_timeline([], datetime(2026, 9, 1).date(), datetime(2026, 10, 1).date(), NOW)
    assert result.gaps == []
