"""Procesado en línea con catalog e ingest/processor de prueba (sin red ni NASA). Ids y datos sintéticos."""
import time

import httpx
import pytest
import yaml
from fastapi.testclient import TestClient

from online.main import Runner, choose_series, clamp_bbox, create_app, series_config_id


def serie(id_, pol, n, contains=True, track=48, direction="A", frame=15):
    return {"id": id_, "track": track, "direction": direction, "frame": frame, "polarization": pol, "contains_aoi": contains,
            "granules": [{"id": f"SYNTH-{id_}-{i}", "date": f"2026-0{6 + i}-01"} for i in range(n)]}


def test_clamp_centers_and_limits_the_box():
    assert clamp_bbox([-106.0, 26.0, -105.0, 27.0], 0.3) == [-105.65, 26.35, -105.35, 26.65]
    # Un punto se amplía a 0,1° para que haya algo que medir.
    assert clamp_bbox([-105.66, 26.93, -105.66, 26.93], 0.3) == [-105.71, 26.88, -105.61, 26.98]


def test_choose_series_needs_hh_and_hv():
    chosen, found = choose_series([serie("A", "SHNA", 9), serie("B", "DHDH", 3, contains=False), serie("C", "DHDH", 2)])
    assert chosen["id"] == "C"  # contiene la zona aunque tenga menos fechas
    assert {f["id"] for f in found} == {"A", "B", "C"}
    assert choose_series([serie("A", "SHNA", 9)])[0] is None
    assert series_config_id(serie("X", "DHDH", 2, track=7, direction="D", frame=5)) == "T007D-F005"


def _runner(tmp_path, series_json, rc=0):
    calls = []

    def handler(req):
        return httpx.Response(200, json=series_json)

    def run(args, job):
        calls.append(args)
        job["log"].append("SYNTH " + args[2])
        return rc

    r = Runner(tmp_path / "zones", tmp_path, "http://catalog.test", max_dates=3, window_days=150, run=run,
               client=httpx.Client(transport=httpx.MockTransport(handler)))
    return r, calls


def _wait(r, zid):
    for _ in range(200):
        job = r.get(zid)
        if job["state"] not in ("queued", "running"):
            return job
        time.sleep(0.02)
    raise AssertionError("no terminó")


def test_full_pipeline_writes_zone_and_calls_ingest_and_processor(tmp_path):
    r, calls = _runner(tmp_path, [serie("T048A-F015-4005-DHDH-P05023", "DHDH", 5)])
    job = r.submit("Hidalgo del Parral", [-105.75, 26.87, -105.60, 26.98], 0.3)
    job = _wait(r, job["id"])
    assert job["state"] == "done" and job["series"]["id"] == "T048A-F015"
    zone = yaml.safe_load((tmp_path / "zones" / f"{job['id']}.yaml").read_text(encoding="utf-8"))
    assert zone["series"] == [{"id": "T048A-F015", "track": 48, "direction": "A", "frame": 15}] and zone["maturity"] == "PROVISIONAL"
    (run,) = calls
    # Un solo paso, en memoria: processor run-remote, sin ingest ni recortes en disco.
    assert run[2:4] == ["processor", "--aoi-dir"] and "run-remote" in run and run[run.index("--last") + 1] == "3"
    assert not (tmp_path / "raw").exists()
    # Volver a pedirla no repite el trabajo.
    assert r.submit("Hidalgo del Parral", [-105.75, 26.87, -105.60, 26.98], 0.3)["state"] == "done"


def test_zone_without_hh_hv_says_so(tmp_path):
    r, calls = _runner(tmp_path, [serie("T126D-F055-7700-SHNA-P05023", "SHNA", 9)])
    job = _wait(r, r.submit("Helheim", [-38.6, 66.25, -38.0, 66.5], 0.3)["id"])
    assert job["state"] == "no_processable_series" and calls == []
    assert job["series_found"][0]["polarization"] == "SHNA" and "HH y HV" in job["error"]


def test_failed_fetch_is_reported(tmp_path):
    r, _ = _runner(tmp_path, [serie("S", "DHDH", 4)], rc=1)
    job = _wait(r, r.submit("X", [10, 10, 10.2, 10.2], 0.3)["id"])
    assert job["state"] == "failed" and "EARTHDATA_TOKEN" in job["error"] and job["steps"]["process"].startswith("failed")


def test_api_requires_token(tmp_path, monkeypatch):
    r, _ = _runner(tmp_path, [])
    monkeypatch.delenv("EARTHDATA_TOKEN", raising=False)
    c = TestClient(create_app(r))
    assert c.get("/health").json()["earthdata_token"] is False
    assert c.post("/zones", json={"name": "X", "bbox": [1, 1, 2, 2]}).status_code == 503
    monkeypatch.setenv("EARTHDATA_TOKEN", "token-de-prueba")
    c = TestClient(create_app(r))
    assert c.post("/zones", json={"name": "X", "bbox": [2, 1, 1, 2]}).status_code == 422


def test_restart_marks_interrupted_jobs(tmp_path):
    r, _ = _runner(tmp_path, [])
    job = {"id": "z-x", "state": "running", "created_at": "2026-11-15T00:00:00+00:00", "log": []}
    r._save(job)
    r2, _ = _runner(tmp_path, [])
    assert r2.get("z-x")["state"] == "failed" and "reinicio" in r2.get("z-x")["error"]
