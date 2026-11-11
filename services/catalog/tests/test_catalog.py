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
