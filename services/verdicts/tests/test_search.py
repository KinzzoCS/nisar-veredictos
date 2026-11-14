"""Búsqueda de veredictos (T-BAL-11, RF-BUS-01 y 03 a 05)."""
import json

import pytest
from fastapi.testclient import TestClient

from test_verdicts import _clock, counts, manifest_root  # noqa: F401  (fixture)
from test_water import FakeFetcher
from verdicts import water
from verdicts.main import app as public_app
from verdicts.main import create_app

SEARCH = "/search/verdicts"
STUDENT = {"X-Auth-Role": "student"}
RESEARCHER = {"X-Auth-Role": "researcher"}
SERIES = "parral/T048A-F015"


def _pair(base, pair_id, start, end, kind="consecutive", **values):
    return {**base, "id": pair_id, "from": start, "to": end, "kind": kind,
            "stats": {**base["stats"], "counts": counts(**values)}}


@pytest.fixture()
def root(manifest_root):  # noqa: F811
    """Cuatro pares: dos change_probable (10 % y 6 %), uno sin cambio y uno not_observable."""
    path = manifest_root / SERIES / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    base = manifest["pairs"][0]
    manifest["dates"].append({**manifest["dates"][1], "date": "2026-07-23", "granule": "G20260723"})
    manifest["pairs"] = [
        base,
        _pair(base, "20260711_20260723", "2026-07-11", "2026-07-23", no_change=940, change_probable=60),
        _pair(base, "20260629_20260723", "2026-06-29", "2026-07-23", "full_window", no_change=1000),
        _pair(base, "20260723_20260816", "2026-07-23", "2026-08-16", no_change=100, low_looks=900),
    ]
    path.write_text(json.dumps(manifest), encoding="utf-8")
    return manifest_root


@pytest.fixture()
def client(root):
    return TestClient(create_app(root, clock=_clock, build_index=False))


def _ids(body):
    return [row["pair_id"] for row in body["results"]]


@pytest.mark.parametrize("headers", [{}, {"X-Auth-Role": "admin"}, {"X-Auth-Role": "public"}])
def test_public_gets_403_with_required_role(client, headers):
    response = client.get(SEARCH, headers=headers)
    assert response.status_code == 403
    assert response.json()["required_role"] == "student"


def test_student_lists_every_verdict_with_data_kind_and_link(client):
    body = client.get(SEARCH, headers=STUDENT).json()
    assert body["total"] == 4 and body["next_cursor"] is None
    assert all(row["data_kind"] == "synthetic" for row in body["results"])
    row = next(row for row in body["results"] if row["pair_id"] == "20260629_20260711")
    assert row["verdict_path"] == "/aois/parral/series/T048A-F015/verdicts/20260629_20260711"
    assert row["granules"] == ["G20260629", "G20260711"] and row["direction"] == "A"
    assert body["query"]["role"] == "student" and body["query"]["sort"] == "date"


def test_rows_copy_the_full_verdict(client):
    """Ningún resultado afirma más que el veredicto completo: mismos valores, sin texto propio."""
    full = {v["id"]: v for v in client.get("/aois/parral/series/T048A-F015/verdicts").json()}
    for row in client.get(SEARCH, headers=STUDENT).json()["results"]:
        verdict = full[row["pair_id"]]
        assert row["state"] == verdict["state"] and row["cause"] == verdict["cause"]
        assert row["changed_fraction"] == verdict["evidence"]["changed_fraction"]
        assert row["observed_fraction"] == verdict["evidence"]["observed_fraction"]
        assert row["interval_days"] == verdict["interval_days"]
        assert row["data_kind"] == verdict["receipt"]["data_kind"]
        assert not {"summary", "hypotheses", "cause_label"} & set(row)


@pytest.mark.parametrize("state", ["change_probable", "no_detectable_change", "not_observable"])
def test_state_filter_matches_the_verdicts_route(client, state):
    expected = {v["id"] for v in client.get("/aois/parral/series/T048A-F015/verdicts").json() if v["state"] == state}
    body = client.get(SEARCH, params={"state": state}, headers=STUDENT).json()
    assert set(_ids(body)) == expected and body["total"] == len(expected) and expected


def test_several_states_and_structured_filters(client):
    body = client.get(SEARCH, params=[("state", "change_probable"), ("state", "not_observable")], headers=STUDENT).json()
    assert body["total"] == 3
    assert _ids(client.get(SEARCH, params={"kind": "full_window"}, headers=STUDENT).json()) == ["20260629_20260723"]
    assert client.get(SEARCH, params={"interval_min": 13}, headers=STUDENT).json()["total"] == 2
    assert client.get(SEARCH, params={"cause": "low_looks"}, headers=STUDENT).json()["total"] == 1
    body = client.get(SEARCH, params={"changed_min": 0.07}, headers=STUDENT).json()
    assert _ids(body) == ["20260629_20260711"]
    body = client.get(SEARCH, params={"date_from": "2026-07-11", "date_to": "2026-07-23"}, headers=STUDENT).json()
    assert _ids(body) == ["20260711_20260723"]
    assert client.get(SEARCH, params={"data_kind": "synthetic", "aoi": "parral"}, headers=STUDENT).json()["total"] == 4


def test_no_match_is_an_empty_list_not_a_404(client):
    response = client.get(SEARCH, params={"direction": "D", "series_id": "T048A-F015"}, headers=STUDENT)
    body = response.json()
    assert response.status_code == 200 and body["total"] == 0 and body["results"] == []
    assert body["query"]["filters"] == {"direction": "D", "series_id": "T048A-F015"}


def test_sort_by_changed_fraction_and_interval(client):
    body = client.get(SEARCH, params={"sort": "changed_fraction"}, headers=STUDENT).json()
    values = [row["changed_fraction"] for row in body["results"]]
    assert values == sorted(values, reverse=True)
    body = client.get(SEARCH, params={"sort": "interval", "order": "asc"}, headers=STUDENT).json()
    values = [row["interval_days"] for row in body["results"]]
    assert values == sorted(values)


def test_cursor_walks_every_row_once(client):
    seen, cursor = [], None
    while True:
        params = {"limit": 1, "sort": "date", **({"cursor": cursor} if cursor else {})}
        body = client.get(SEARCH, params=params, headers=STUDENT).json()
        assert body["total"] == 4
        seen += _ids(body)
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert len(seen) == 4 and len(set(seen)) == 4


def test_cursor_of_another_query_or_garbage_is_400(client):
    cursor = client.get(SEARCH, params={"limit": 1}, headers=STUDENT).json()["next_cursor"]
    assert client.get(SEARCH, params={"limit": 1, "state": "not_observable", "cursor": cursor},
                      headers=STUDENT).status_code == 400
    assert client.get(SEARCH, params={"cursor": "%%%"}, headers=STUDENT).status_code == 400


def test_quality_filter_is_for_researchers(client):
    response = client.get(SEARCH, params={"quality_flag": "true"}, headers=STUDENT)
    assert response.status_code == 403 and response.json()["required_role"] == "researcher"
    body = client.get(SEARCH, params={"quality_flag": "false"}, headers=RESEARCHER).json()
    assert body["total"] == 4 and body["query"]["role"] == "researcher"


def test_page_size_by_role(client):
    response = client.get(SEARCH, params={"limit": 51}, headers=STUDENT)
    assert response.status_code == 403 and response.json()["required_role"] == "researcher"
    assert client.get(SEARCH, params={"limit": 50}, headers=STUDENT).status_code == 200
    assert client.get(SEARCH, params={"limit": 500}, headers=RESEARCHER).status_code == 200
    assert client.get(SEARCH, params={"limit": 501}, headers=RESEARCHER).status_code == 422


def test_water_without_contrast_is_not_available_and_counted(client):
    body = client.get(SEARCH, headers=STUDENT).json()
    assert all(row["water"]["summary"] == "not_available" for row in body["results"])
    assert body["results"][0]["water"]["reasons"] == ["catalog_unavailable"]
    body = client.get(SEARCH, params={"water": "disagree"}, headers=STUDENT).json()
    assert body["total"] == 0
    assert body["query"]["not_evaluated"]["water"] == {"count": 4, "reasons": {"catalog_unavailable": 4}}


def test_water_is_pending_until_the_contrast_is_warmed(root):
    contrast = water.WaterContrast(root, FakeFetcher())
    client = TestClient(create_app(root, clock=_clock, water_contrast=contrast, build_index=False))
    body = client.get(SEARCH, headers=STUDENT).json()
    assert body["query"]["water_contrast"] == "pending"
    assert {tuple(row["water"]["reasons"]) for row in body["results"]} == {("contrast_not_computed",)}


def test_cloud_filter_skips_rows_without_scene(client):
    body = client.get(SEARCH, params={"max_cloud_cover": 30}, headers=STUDENT).json()
    assert body["total"] == 0 and body["query"]["not_evaluated"]["max_cloud_cover"]["count"] == 4


def test_index_is_built_at_startup(root):
    with TestClient(create_app(root, clock=_clock, build_index=True)) as client:
        assert client.get(SEARCH, headers=STUDENT).json()["total"] == 4


def test_contract_declares_profile_and_security():
    spec = public_app.openapi()
    operation = spec["paths"][SEARCH]["get"]
    assert operation["x-required-role"] == "student" and operation["security"] == [{"bearerAuth": []}]
    assert "403" in operation["responses"]
    assert spec["components"]["securitySchemes"]["bearerAuth"]["scheme"] == "bearer"
    assert all("security" not in ops["get"] for path, ops in spec["paths"].items() if path != SEARCH)
