"""Procesado en línea (run-remote) sin red: los «gránulos remotos» son GCOV sintéticos abiertos como objetos de
archivo, igual que llegarían de fsspec. Comprueba que no se escribe ningún recorte y que salen los artefactos."""
import io

import pytest

from processor.change import Params
from processor.pipeline import process_series
from processor.remote import RemoteGranule, is_nasa_url, latest_granules, run_remote
from processor.synthetic import SeriesSpec, generate_series

BBOX = [-105.75, 26.87, -105.60, 26.98]


def test_only_nasa_hosts_get_the_token():
    assert is_nasa_url("https://nisar.asf.earthdatacloud.nasa.gov/NISAR/x.h5")
    assert not is_nasa_url("https://example.invalid/x.h5") and not is_nasa_url("http://nisar.asf.earthdatacloud.nasa.gov/x")


def test_latest_granules_takes_the_most_recent():
    serie = {"track": 48, "direction": "A", "frame": 15,
             "granules": [{"id": f"G{i}", "date": f"2026-0{6 + i}-01", "download_url": "u"} for i in range(4)]}
    got = latest_granules("http://catalog", {"id": "z"}, {"id": "T048A-F015", "track": 48, "direction": "A", "frame": 15}, 2,
                          getter=lambda url: [serie])
    assert [g["id"] for g in got] == ["G2", "G3"]


def test_run_remote_reads_in_memory_and_writes_only_artifacts(tmp_path):
    paths = generate_series(SeriesSpec(48, "A", 15, ("20260617", "20260629", "20260711")), BBOX, tmp_path / "fuente", posting_m=100.0)
    by_id = {p.stem: p for p in paths}
    serie = {"track": 48, "direction": "A", "frame": 15,
             "granules": [{"id": p.stem, "date": f"2026-0{6 + i}-01", "download_url": f"https://nisar.asf.earthdatacloud.nasa.gov/{p.stem}.h5"}
                          for i, p in enumerate(sorted(paths))]}
    abiertos = []

    def opener(url):
        stem = url.rsplit("/", 1)[1][:-3]
        f = io.BytesIO(by_id[stem].read_bytes())  # en memoria, como el archivo remoto
        abiertos.append(f)
        return f

    aoi = {"id": "z-prueba", "bbox": BBOX, "maturity": "PROVISIONAL", "series": [{"id": "T048A-F015", "track": 48, "direction": "A", "frame": 15}]}
    artifacts = tmp_path / "data" / "artifacts"

    def process(files):
        assert all(isinstance(f, RemoteGranule) for f in files)
        return process_series(files, aoi, "T048A-F015", artifacts, "PROVISIONAL", Params(), dem_sources=None)

    manifest = run_remote(aoi, "T048A-F015", artifacts, "http://catalog", 3, process, opener=opener, getter=lambda url: [serie])
    assert len(manifest["pairs"]) >= 2 and (artifacts / "z-prueba" / "T048A-F015" / "manifest.json").exists()
    assert not (tmp_path / "data" / "raw").exists()  # ningún recorte en disco
    assert all(f.closed for f in abiertos)


def test_run_remote_needs_token(monkeypatch):
    monkeypatch.delenv("EARTHDATA_TOKEN", raising=False)
    with pytest.raises(ValueError, match="EARTHDATA_TOKEN"):
        run_remote({"id": "z", "series": []}, "S", None, "http://c", 2, lambda f: None)
