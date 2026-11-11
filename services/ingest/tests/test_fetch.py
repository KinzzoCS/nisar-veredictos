"""Prueba la ingesta con un servidor HTTP local que se comporta como NASA."""
import threading
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import h5py
import numpy as np
import pytest

from ingest.fetch import FetchError, fetch_series, is_nasa_url, select_series
from ingest.subset import GRID, IDENTIFICATION, SubsetError

TOKEN = "token-de-prueba"
SIZE = 1500
POSTING = 200.0
# Malla en UTM 13N alrededor de Parral, con la y descendente como en los productos reales.
LEFT, TOP = 400000.0, 3100000.0
AOI_SMALL = [-105.95, 26.70, -105.90, 26.75]
SERIES = {"id": "T048A-F015", "track": 48, "direction": "A", "frame": 15}
AOI = {"id": "parral", "bbox": AOI_SMALL, "series": [SERIES]}
ALLOW_LOCAL = lambda url: url.startswith("http://127.0.0.1")  # noqa: E731


def write_granule(path):
    rng = np.random.default_rng(3)
    with h5py.File(path, "w") as handle:
        identification = handle.create_group(IDENTIFICATION)
        identification["granuleId"] = "NISAR_GRANULE"
        identification["trackNumber"] = np.uint32(48)
        identification["frameNumber"] = np.uint16(15)
        identification["orbitPassDirection"] = "Ascending"
        identification["zeroDopplerStartTime"] = "2026-06-17T12:24:34.000000"
        identification["compositeReleaseId"] = "P05023"
        grid = handle.create_group(GRID)
        grid["xCoordinates"] = LEFT + POSTING * (np.arange(SIZE) + 0.5)
        grid["yCoordinates"] = TOP - POSTING * (np.arange(SIZE) + 0.5)
        shape = (SIZE, SIZE)
        for name, data in (
            ("HHHH", rng.random(shape, np.float32)),
            ("HVHV", rng.random(shape, np.float32)),
            ("mask", np.ones(shape, np.uint8)),
            ("numberOfLooks", np.full(shape, 20.0, np.float32)),
            ("inputDataExceptionMask", np.zeros(shape, np.uint8)),
        ):
            grid.create_dataset(name, data=data, chunks=(250, 250))
        grid["projection"] = np.uint32(32613)
        grid["projection"].attrs["epsg_code"] = 32613


class State:
    def __init__(self, file_bytes):
        self.file_bytes = file_bytes
        self.served = 0
        self.auth_seen = []
        self.redirect_to = None


class Handler(BaseHTTPRequestHandler):
    def __init__(self, state, *args, **kwargs):
        self.state = state
        super().__init__(*args, **kwargs)

    def log_message(self, *args):
        pass

    def _respond(self, send_body):
        auth = self.headers.get("Authorization")
        self.state.auth_seen.append(auth)
        # El destino firmado imita a CloudFront: no pide token.
        if not self.path.startswith("/signed") and auth != f"Bearer {TOKEN}":
            self.send_response(401)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if self.path.startswith("/redirect"):
            self.send_response(303)
            self.send_header("Location", self.state.redirect_to)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        data = self.state.file_bytes
        header = self.headers.get("Range")
        if header:
            start, end = header.split("=")[1].split("-")
            start, end = int(start), min(int(end or len(data) - 1), len(data) - 1)
            body = data[start : end + 1]
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{len(data)}")
        else:
            body = data
            self.send_response(200)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if send_body:
            self.state.served += len(body)
            self.wfile.write(body)

    def do_HEAD(self):
        self._respond(False)

    def do_GET(self):
        self._respond(True)


def serve(state):
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, state))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


@pytest.fixture(scope="module")
def granule_bytes(tmp_path_factory):
    path = tmp_path_factory.mktemp("remote") / "granule.h5"
    write_granule(path)
    return path.read_bytes()


@pytest.fixture()
def nasa(granule_bytes):
    state = State(granule_bytes)
    server = serve(state)
    yield state, f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def catalog_with(*urls, frame=15):
    series = [{
        "id": "T048A-F015-4005-DHDH-P05023", "track": 48, "direction": "A", "frame": frame,
        "granules": [{"id": f"GRANULE_{index}", "download_url": url} for index, url in enumerate(urls)],
    }]
    return lambda url: series


def run(tmp_path, json_getter, token=TOKEN, is_allowed=ALLOW_LOCAL, limit=None, aoi=AOI):
    return fetch_series(aoi, "T048A-F015", tmp_path, token, "http://catalog", limit, json_getter, is_allowed, 64 * 1024)


def test_subset_follows_contract_and_reads_a_fraction(tmp_path, nasa):
    state, base = nasa
    result = run(tmp_path, catalog_with(f"{base}/g0.h5"))
    assert result.written == ["GRANULE_0"]
    with h5py.File(result.target / "GRANULE_0.h5", "r") as handle:
        grid = handle[GRID]
        assert 0 < grid["HHHH"].shape[0] < SIZE and grid["HHHH"].dtype == np.float32
        assert grid["HHHH"].shape == (grid["yCoordinates"].size, grid["xCoordinates"].size)
        assert grid["yCoordinates"][0] > grid["yCoordinates"][-1]
        assert grid["projection"].attrs["epsg_code"] == 32613
        assert handle[IDENTIFICATION]["trackNumber"].dtype == np.uint32
        assert handle.attrs["subset_of"] == "NISAR_GRANULE" and "data_kind" not in handle.attrs
    assert state.served < len(state.file_bytes) * 0.5


def test_second_run_skips_existing_subset(tmp_path, nasa):
    state, base = nasa
    getter = catalog_with(f"{base}/g0.h5")
    run(tmp_path, getter)
    served = state.served
    result = run(tmp_path, getter)
    assert result.skipped == ["GRANULE_0"] and result.written == [] and state.served == served


def test_limit_restricts_dates(tmp_path, nasa):
    _, base = nasa
    result = run(tmp_path, catalog_with(f"{base}/g0.h5", f"{base}/g1.h5"), limit=1)
    assert result.written == ["GRANULE_0"]


def test_bad_token_gives_clear_error_without_leaving_files_or_token(tmp_path, nasa):
    _, base = nasa
    with pytest.raises(FetchError) as error:
        run(tmp_path, catalog_with(f"{base}/g0.h5"), token="malo")
    assert "malo" not in str(error.value) and "token" in str(error.value)
    assert not list((tmp_path / "raw" / "real" / "parral" / "T048A-F015").iterdir())


def test_redirect_to_other_origin_drops_token(tmp_path, nasa, granule_bytes):
    state, base = nasa
    signed_state = State(granule_bytes)
    signed = serve(signed_state)
    state.redirect_to = f"http://127.0.0.1:{signed.server_address[1]}/signed.h5"
    try:
        result = run(tmp_path, catalog_with(f"{base}/redirect.h5"))
    finally:
        signed.shutdown()
    assert result.written == ["GRANULE_0"]
    assert signed_state.auth_seen and all(value is None for value in signed_state.auth_seen)


def test_token_is_never_sent_to_a_foreign_host(tmp_path, nasa):
    state, _ = nasa
    with pytest.raises(FetchError):
        run(tmp_path, catalog_with("https://attacker.example/g.h5"), is_allowed=is_nasa_url)
    assert state.auth_seen == []


def test_granule_from_another_series_is_rejected(tmp_path, nasa):
    _, base = nasa
    aoi = {**AOI, "series": [{**SERIES, "frame": 99}]}
    with pytest.raises(SubsetError):
        run(tmp_path, catalog_with(f"{base}/g0.h5", frame=99), aoi=aoi)


@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://nisar.asf.earthdatacloud.nasa.gov/NISAR/a.h5", True),
        ("http://nisar.asf.earthdatacloud.nasa.gov/NISAR/a.h5", False),
        ("https://earthdatacloud.nasa.gov.evil.example/a.h5", False),
    ],
)
def test_host_allow_list(url, expected):
    assert is_nasa_url(url) is expected


def test_multiple_versions_are_not_chosen_silently():
    candidates = [{"id": "a", "track": 48, "direction": "A", "frame": 15}, {"id": "b", "track": 48, "direction": "A", "frame": 15}]
    with pytest.raises(FetchError):
        select_series(candidates, SERIES)
