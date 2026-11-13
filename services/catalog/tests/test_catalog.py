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


# --- Referencias ópticas Sentinel-2 (T-ANT-05) ---

from catalog.optical import Scene, group_acquisitions, parse_feature, window

# Cuatro teselas que juntas cubren la zona de Parral, como 13RCK, 13RDK, 13RCL y 13RDL.
QUADS = {
    "13RCK": ((-106.5, 26.0), (-105.6, 26.0), (-105.6, 26.9), (-106.5, 26.9)),
    "13RDK": ((-105.7, 26.0), (-104.8, 26.0), (-104.8, 26.9), (-105.7, 26.9)),
    "13RCL": ((-106.5, 26.8), (-105.6, 26.8), (-105.6, 27.7), (-106.5, 27.7)),
    "13RDL": ((-105.7, 26.8), (-104.8, 26.8), (-104.8, 27.7), (-105.7, 27.7)),
}


def scene(tile: str, day: str, cloud: float, platform: str = "sentinel-2b", seq: int = 0, hour: int = 17):
    prefix = {"sentinel-2a": "S2A", "sentinel-2b": "S2B", "sentinel-2c": "S2C"}[platform]
    when = datetime.strptime(day, "%Y%m%d").replace(hour=hour, minute=46, tzinfo=timezone.utc)
    return Scene(
        id=f"{prefix}_{tile}_{day}_{seq}_L2A",
        platform=platform,
        tile=tile,
        acquired_at=when,
        cloud_cover=cloud,
        visual_url=f"https://sentinel-cogs.example/{tile}/{day}/TCI.tif",
        footprint=QUADS[tile],
    )


def pass_of(day: str, clouds: dict, platform: str = "sentinel-2b"):
    return [scene(tile, day, cloud, platform) for tile, cloud in clouds.items()]


CLEAR = {"13RCK": 13.7, "13RDK": 9.9, "13RCL": 3.5, "13RDL": 3.2}


class SceneList:
    def __init__(self, scenes):
        self._scenes = scenes
        self.calls = []

    def scenes(self, bbox, start, end):
        self.calls.append((start, end))
        return self._scenes


class BrokenScenes:
    def scenes(self, bbox, start, end):
        raise httpx.ConnectError("sin red")


def optical_client(source):
    return TestClient(create_app(ROOT / "config" / "aois", ListSource([]), lambda: NOW, source))


def test_parse_feature_reads_earth_search_item():
    feature = {
        "id": "S2C_13RCK_20260708_0_L2A",
        "geometry": {"type": "Polygon", "coordinates": [[[-106.0, 26.0], [-105.0, 26.0], [-105.0, 27.0], [-106.0, 26.0]]]},
        "properties": {"datetime": "2026-07-08T17:46:43.262000Z", "platform": "sentinel-2c",
                       "grid:code": "MGRS-13RCK", "eo:cloud_cover": 51.4},
        "assets": {"visual": {"href": "https://sentinel-cogs.s3.us-west-2.amazonaws.com/x/TCI.tif"}},
    }
    parsed = parse_feature(feature)
    assert parsed.tile == "13RCK" and parsed.cloud_cover == 51.4 and parsed.platform == "sentinel-2c"
    assert parsed.acquired_at == datetime(2026, 7, 8, 17, 46, 43, 262000, tzinfo=timezone.utc)
    assert parse_feature({"id": "x", "properties": {}, "assets": {}}) is None


def test_window_is_whole_utc_days_both_ends_included():
    start, end = window(datetime(2026, 7, 1).date(), 7)
    assert start == datetime(2026, 6, 24, tzinfo=timezone.utc)
    assert end == datetime(2026, 7, 8, 23, 59, 59, tzinfo=timezone.utc)


def test_tiles_of_one_pass_are_grouped_and_cover_the_aoi():
    result = group_acquisitions(pass_of("20260626", CLEAR), BBOX, datetime(2026, 7, 1).date(), 30)
    assert len(result) == 1
    acq = result[0]
    assert [tile.tile for tile in acq.tiles] == ["13RCK", "13RCL", "13RDK", "13RDL"]
    assert acq.covers_aoi and acq.days_from_date == -5 and acq.max_cloud_cover == 13.7


def test_missing_tile_means_aoi_not_covered():
    partial = {"13RCK": 1.0, "13RDK": 1.0, "13RCL": 1.0}
    acq = group_acquisitions(pass_of("20260626", partial), BBOX, datetime(2026, 7, 1).date(), 30)[0]
    assert not acq.covers_aoi


def test_one_cloudy_tile_excludes_the_whole_acquisition():
    cloudy = dict(CLEAR, **{"13RCK": 51.4})
    assert group_acquisitions(pass_of("20260708", cloudy), BBOX, datetime(2026, 7, 1).date(), 30) == []
    assert len(group_acquisitions(pass_of("20260708", cloudy), BBOX, datetime(2026, 7, 1).date(), 60)) == 1


def test_reprocessed_scene_replaces_the_old_one():
    scenes = pass_of("20260703", CLEAR, "sentinel-2a") + [scene("13RCK", "20260703", 2.0, "sentinel-2a", seq=1)]
    acq = group_acquisitions(scenes, BBOX, datetime(2026, 7, 1).date(), 30)[0]
    rck = [tile for tile in acq.tiles if tile.tile == "13RCK"]
    assert len(rck) == 1 and rck[0].id.endswith("_1_L2A")


def test_two_satellites_same_day_are_separate_acquisitions():
    scenes = pass_of("20260703", CLEAR, "sentinel-2a") + pass_of("20260703", CLEAR, "sentinel-2b")
    result = group_acquisitions(scenes, BBOX, datetime(2026, 7, 1).date(), 30)
    assert sorted(acq.platform for acq in result) == ["sentinel-2a", "sentinel-2b"]


def test_closest_acquisition_comes_first():
    scenes = pass_of("20260626", CLEAR) + pass_of("20260630", CLEAR, "sentinel-2a")
    result = group_acquisitions(scenes, BBOX, datetime(2026, 7, 1).date(), 30)
    assert [acq.days_from_date for acq in result] == [-1, -5]


def test_optical_api_declares_license_attribution_and_tile_basis():
    source = SceneList(pass_of("20260626", CLEAR))
    body = optical_client(source).get("/aois/parral/references/optical?date=2026-07-01").json()
    assert body["days"] == 7 and body["max_cloud"] == 30
    assert body["collection"] == "sentinel-2-l2a" and body["cloud_cover_basis"] == "tile"
    assert body["attribution"] == "Contiene datos modificados de Copernicus Sentinel 2026"
    assert body["license_url"].startswith("https://sentinel.esa.int/")
    acq = body["acquisitions"][0]
    assert acq["acquired_at"].endswith("Z") and acq["covers_aoi"] and len(acq["tiles"]) == 4
    assert all(tile["visual_url"].startswith("https://") for tile in acq["tiles"])
    assert source.calls == [(datetime(2026, 6, 24, tzinfo=timezone.utc), datetime(2026, 7, 8, 23, 59, 59, tzinfo=timezone.utc))]


def test_optical_api_validates_parameters():
    client = optical_client(SceneList([]))
    assert client.get("/aois/parral/references/optical").status_code == 422
    assert client.get("/aois/parral/references/optical?date=2026-07-01&days=31").status_code == 422
    assert client.get("/aois/parral/references/optical?date=2026-07-01&max_cloud=101").status_code == 422
    assert client.get("/aois/nope/references/optical?date=2026-07-01").status_code == 404


def test_optical_failure_is_502():
    response = optical_client(BrokenScenes()).get("/aois/parral/references/optical?date=2026-07-01")
    assert response.status_code == 502 and "Earth Search" in response.json()["detail"]


# --- Referencias OPERA DSWx-S1 (T-ANT-06) ---

from catalog.opera import group_passes, latest_versions, parse_entry

PODAAC = "https://archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-{bucket}/OPERA_L3_DSWX-S1_V1/"
REL = "http://esipfed.org/ns/fedsearch/1.1/"
# Cajas reales de CMR ("sur oeste norte este"), consultadas el 2026-11-11.
BOXES = {
    "13RDK": "26.1714959 -106.0587906 27.1667001 -104.9505393",
    "13RDL": "27.0742501 -106.0675069 28.0694794 -104.950132",
}


def cmr_entry(tile: str, acq: str, prod: str, sensor: str = "S1A", start: str | None = None):
    title = f"OPERA_L3_DSWx-S1_T{tile}_{acq}Z_{prod}Z_{sensor}_30_v1.0"
    public, protected = PODAAC.format(bucket="public"), PODAAC.format(bucket="protected")
    return {
        "title": title,
        "time_start": start or f"{acq[:4]}-{acq[4:6]}-{acq[6:8]}T{acq[9:11]}:{acq[11:13]}:{acq[13:15]}.000Z",
        "boxes": [BOXES[tile]],
        "links": [
            {"rel": f"{REL}browse#", "href": f"{public}{title}_BROWSE.png"},
            {"rel": f"{REL}data#", "href": f"{protected}{title}_B01_WTR.tif"},
            {"rel": f"{REL}data#", "href": f"{protected}{title}_B03_CONF.tif"},
            {"rel": f"{REL}metadata#", "href": f"{protected}{title}_BROWSE.tif"},
            {"rel": f"{REL}s3#", "href": f"s3://podaac-ops-cumulus-protected/OPERA_L3_DSWX-S1_V1/{title}_B01_WTR.tif"},
        ],
    }


def opera_tiles(*entries):
    return [parse_entry(entry) for entry in entries]


# Productos reales de Parral alrededor del 2026-06-29, con la versión repetida de T13RDL del 06-22.
JUNE = opera_tiles(
    cmr_entry("13RDL", "20260622T125623", "20260828T070616", start="2026-06-22T12:56:40.000Z"),
    cmr_entry("13RDL", "20260622T125623", "20260828T070924", start="2026-06-22T12:56:40.000Z"),
    cmr_entry("13RDK", "20260622T125653", "20260828T065910", start="2026-06-22T12:56:57.000Z"),
    cmr_entry("13RDK", "20260627T005832", "20260829T161636", start="2026-06-27T00:59:06.000Z"),
    cmr_entry("13RDL", "20260627T005902", "20260829T161817", start="2026-06-27T00:59:08.000Z"),
    cmr_entry("13RDL", "20260627T130437", "20260829T200117", start="2026-06-27T13:04:51.000Z"),
    cmr_entry("13RDK", "20260627T130504", "20260829T195832", start="2026-06-27T13:05:07.000Z"),
)


class OperaList:
    def __init__(self, tiles):
        self._tiles = tiles
        self.calls = []

    def tiles(self, bbox, start, end):
        self.calls.append((start, end))
        return self._tiles


class BrokenOpera:
    def tiles(self, bbox, start, end):
        raise httpx.ConnectError("sin red")


def opera_client(source):
    return TestClient(create_app(ROOT / "config" / "aois", ListSource([]), lambda: NOW, SceneList([]), source))


def test_parse_entry_reads_real_dswx_title_and_links():
    tile = parse_entry(cmr_entry("13RDK", "20260627T130504", "20260829T195832", start="2026-06-27T13:05:07.000Z"))
    assert tile.tile == "13RDK" and tile.platform == "sentinel-1a"
    assert tile.acquired_at == datetime(2026, 6, 27, 13, 5, 7, tzinfo=timezone.utc)
    assert tile.produced_at == datetime(2026, 8, 29, 19, 58, 32, tzinfo=timezone.utc)
    assert tile.wtr_url.endswith("_B01_WTR.tif") and tile.conf_url.endswith("_B03_CONF.tif")
    assert "/podaac-ops-cumulus-public/" in tile.browse_url
    assert tile.box == (-106.0587906, 26.1714959, -104.9505393, 27.1667001)


def test_parse_entry_rejects_foreign_or_unusable_entries():
    nisar = {"title": "NISAR_L2_PR_GCOV_033_048_A_015_4005_DHDH_A_20260617T094225_20260617T094259_P05023_N_F_J_001"}
    assert parse_entry(nisar) is None
    no_water = cmr_entry("13RDK", "20260627T130504", "20260829T195832")
    no_water["links"] = [link for link in no_water["links"] if "WTR" not in link["href"]]
    assert parse_entry(no_water) is None


def test_browse_url_never_points_to_protected_bucket():
    entry = cmr_entry("13RDK", "20260627T130504", "20260829T195832")
    entry["links"] = [link for link in entry["links"] if "public" not in link["href"]]
    entry["links"].append({"rel": f"{REL}browse#", "href": f"{PODAAC.format(bucket='protected')}x_BROWSE.png"})
    assert parse_entry(entry).browse_url is None


def test_reprocessed_dswx_keeps_latest_production():
    kept = [tile for tile in latest_versions(JUNE) if tile.tile == "13RDL" and tile.acquired_at.day == 22]
    assert len(kept) == 1 and "_20260828T070924Z_" in kept[0].id


def test_dswx_passes_around_june_29():
    passes = group_passes(JUNE, BBOX, date(2026, 6, 29))
    assert [p.days_from_date for p in passes] == [-2, -2, -7]
    assert [p.acquired_at.hour for p in passes] == [0, 13, 12]
    assert all([t.tile for t in p.tiles] == ["13RDK", "13RDL"] for p in passes)
    assert all(p.covers_aoi for p in passes)


def test_dswx_tile_rdl_alone_does_not_cover_parral():
    rdl = [tile for tile in JUNE if tile.tile == "13RDL" and tile.acquired_at.hour == 0]
    assert not group_passes(rdl, BBOX, date(2026, 6, 29))[0].covers_aoi


def test_opera_api_lists_passes_and_declares_limits():
    source = OperaList(JUNE)
    body = opera_client(source).get("/aois/parral/references/opera?date=2026-06-29").json()
    assert body["days"] == 7 and body["collection"] == "OPERA_L3_DSWX-S1_V1"
    assert body["doi"] == "10.5067/OPDSWS1-L3V1"
    assert body["min_water_body_ha"] == 3 and body["min_water_body_width_m"] == 200
    assert body["coverage_basis"] == "tile_bbox" and body["data_access"] == "earthdata_login"
    assert "OPERA" in body["attribution"] and "Copernicus Sentinel 2026" in body["attribution"]
    assert [acq["days_from_date"] for acq in body["acquisitions"]] == [-2, -2, -7]
    first = body["acquisitions"][0]
    assert first["acquired_at"] == "2026-06-27T00:59:06Z" and first["covers_aoi"]
    assert source.calls == [(datetime(2026, 6, 22, tzinfo=timezone.utc), datetime(2026, 7, 6, 23, 59, 59, tzinfo=timezone.utc))]


def test_opera_api_without_products_says_so():
    response = opera_client(OperaList([])).get("/aois/parral/references/opera?date=2026-07-08")
    assert response.status_code == 200 and response.json()["acquisitions"] == []


def test_opera_api_validates_parameters():
    client = opera_client(OperaList([]))
    assert client.get("/aois/parral/references/opera").status_code == 422
    assert client.get("/aois/parral/references/opera?date=2026-07-08&days=31").status_code == 422
    assert client.get("/aois/nope/references/opera?date=2026-07-08").status_code == 404


def test_opera_failure_is_502():
    response = opera_client(BrokenOpera()).get("/aois/parral/references/opera?date=2026-06-29")
    assert response.status_code == 502 and "OPERA" in response.json()["detail"]


# --- Gránulos excluidos (T-ANT-10) ---

T171_TITLE = "NISAR_L2_PR_GCOV_027_171_D_075_4005_DHDH_A_{d}T014433_{d}T014508_P05023_N_F_J_001"
T171_BAD = T171_TITLE.format(d="20260813")


def t171(day: str):
    return parse_title(T171_TITLE.format(d=day), 6700.0, BIG)


def test_parral_config_excludes_t171_august_13():
    from catalog.main import _exclusions, _load_aois

    entry = _exclusions(_load_aois(ROOT / "config" / "aois")["parral"])[T171_BAD]
    assert entry["reason"] == "product_defect" and str(entry["checked_on"]) == "2026-11-12"


def test_excluded_granule_leaves_series_but_is_listed_with_its_reason():
    source = ListSource([t171("20260720"), t171("20260813"), t171("20260825")])
    body = TestClient(create_app(ROOT / "config" / "aois", source)).get("/aois/parral/series").json()
    (series,) = body
    assert [g["date"] for g in series["granules"]] == ["2026-07-20", "2026-08-25"]
    assert series["max_gap_days"] == 36 and series["spans_data_gap"]
    (excluded,) = series["excluded"]
    assert excluded["id"] == T171_BAD and excluded["date"] == "2026-08-13"
    assert excluded["reason"] == "product_defect" and excluded["checked_on"] == "2026-11-12"
    assert excluded["acquired_at"] == "2026-08-13T01:44:33Z" and "\n" not in excluded["evidence"]


def test_excluded_granule_leaves_timeline_passes_and_intervals():
    source = ListSource([t171("20260720"), t171("20260813"), t171("20260825")])
    body = timeline_client(source).get("/aois/parral/timeline").json()
    assert T171_BAD not in [p["granule_id"] for p in body["passes"]]
    (interval,) = body["intervals"]
    assert interval["days"] == 36 and interval["crosses_gap"]
    (excluded,) = body["excluded"]
    assert excluded["series"] == "T171D-F075-4005-DHDH-P05023" and excluded["id"] == T171_BAD


def test_no_exclusions_means_empty_lists():
    assert client().get("/aois/parral/series").json()[0]["excluded"] == []
    body = timeline_client(ListSource([granule("20260617")])).get("/aois/parral/timeline").json()
    assert body["excluded"] == []


# --- Criterios de aceptación: fallos externos en 502 y horas en UTC ---

import re
from dataclasses import replace

import pytest
from pydantic import ValidationError

from catalog import cmr as cmr_module
from catalog import opera as opera_module
from catalog.cmr import CmrSource
from catalog.main import NextPassEstimate
from catalog.opera import CmrOperaSource
from catalog.optical import EarthSearchSource
from catalog.pairing import parse_utc

UTC_STAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z")


def mock_client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def cmr_feed(titles):
    entries = [{"title": t, "granule_size": "7000", "updated": "2026-07-09T03:32:43.193Z", "links": []} for t in titles]
    return {"feed": {"entry": entries}}


def second_page_fails(first_page):
    """Primera página completa y la segunda con error, como un CMR que se cae a mitad de la lectura."""
    def handler(request):
        page = request.url.params.get("page_num")
        if page == "1":
            return httpx.Response(200, json=first_page)
        return httpx.Response(503, text="Service Unavailable")
    return handler


def full_client(source=None, scenes=None, water=None):
    return TestClient(create_app(
        ROOT / "config" / "aois",
        source or ListSource([granule("20260617"), granule("20260629")]),
        lambda: NOW,
        scenes or SceneList([]),
        water or OperaList([]),
    ))


def test_parse_utc_handles_z_offsets_naive_and_short_fractions():
    assert parse_utc("2026-07-08T17:46:43.26Z") == datetime(2026, 7, 8, 17, 46, 43, 260000, tzinfo=timezone.utc)
    assert parse_utc("2026-07-09T03:32:43") == datetime(2026, 7, 9, 3, 32, 43, tzinfo=timezone.utc)
    converted = parse_utc("2026-07-08T11:46:43-06:00")
    assert converted == datetime(2026, 7, 8, 17, 46, 43, tzinfo=timezone.utc) and converted.utcoffset().total_seconds() == 0


def test_api_models_convert_offsets_to_utc_and_reject_naive_times():
    local = datetime.fromisoformat("2026-11-20T03:42:25-06:00")
    estimate = NextPassEstimate(series="T048", expected_at=local, basis="12-day cycle")
    assert estimate.model_dump(mode="json")["expected_at"] == "2026-11-20T09:42:25Z"
    with pytest.raises(ValidationError):
        NextPassEstimate(series="T048", expected_at=datetime(2026, 11, 20, 9, 42, 25), basis="12-day cycle")


def test_every_api_time_is_utc_iso8601():
    """Recorre todas las rutas GET con datos en todas sus listas y comprueba cada hora que devuelven."""
    known = published("20260617", when=datetime(2026, 7, 9, 3, 32, 43, tzinfo=timezone.utc))
    source = ListSource([known, granule("20260629"), t171("20260720"), t171("20260813"), t171("20260825")])
    # Una escena con hora local de Chihuahua debe salir convertida a UTC.
    utc = scene("13RCK", "20260626", 5.0)
    local = replace(utc, acquired_at=utc.acquired_at.astimezone(datetime.fromisoformat("2026-06-26T00:00:00-06:00").tzinfo))
    scenes = SceneList([local] + [scene(t, "20260626", 5.0) for t in ("13RDK", "13RCL", "13RDL")])
    app = full_client(source, scenes, OperaList(JUNE))
    urls = {
        "/health": "/health",
        "/aois": "/aois",
        "/aois/{aoi_id}/series": "/aois/parral/series",
        "/aois/{aoi_id}/timeline": "/aois/parral/timeline",
        "/aois/{aoi_id}/references/optical": "/aois/parral/references/optical?date=2026-06-29",
        "/aois/{aoi_id}/references/opera": "/aois/parral/references/opera?date=2026-06-29",
    }
    routes = {route.path for route in public_app.routes if "GET" in getattr(route, "methods", set())}
    routes -= {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}
    assert routes == set(urls), "Añade la ruta nueva a esta prueba de horas UTC"

    def stamps(value):
        if isinstance(value, dict):
            return [s for item in value.values() for s in stamps(item)]
        if isinstance(value, list):
            return [s for item in value for s in stamps(item)]
        return [value] if isinstance(value, str) and re.match(r"\d{4}-\d{2}-\d{2}T", value) else []

    found = {}
    for path, url in urls.items():
        response = app.get(url)
        assert response.status_code == 200, url
        found[path] = stamps(response.json())
        assert all(UTC_STAMP.fullmatch(s) for s in found[path]), (url, found[path])
    # Las rutas con horas devolvieron alguna, así que la prueba no pasa en vacío.
    assert all(found[path] for path in urls if "aoi_id" in path)
    optical = app.get(urls["/aois/{aoi_id}/references/optical"]).json()
    assert "2026-06-26T17:46:00Z" in [t["acquired_at"] for t in optical["acquisitions"][0]["tiles"]]


def test_series_cmr_failure_is_502():
    response = timeline_client(BrokenSource()).get("/aois/parral/series")
    assert response.status_code == 502 and "CMR" in response.json()["detail"]


@pytest.mark.parametrize("path", ["/aois/parral/series", "/aois/parral/timeline"])
def test_cmr_failure_on_second_page_is_502_not_partial(monkeypatch, path):
    monkeypatch.setattr(cmr_module, "PAGE_SIZE", 2)
    first = cmr_feed([TITLE.format(d=d, c="P05023") for d in ("20260617", "20260629")])
    source = CmrSource(mock_client(second_page_fails(first)))
    response = timeline_client(source).get(path)
    assert response.status_code == 502 and "CMR" in response.json()["detail"]


@pytest.mark.parametrize("body", ["<html>Mantenimiento</html>", '{"errors": ["temporal no válido"]}'])
def test_unreadable_cmr_answer_is_502(body):
    source = CmrSource(mock_client(lambda request: httpx.Response(200, text=body)))
    response = timeline_client(source).get("/aois/parral/timeline")
    assert response.status_code == 502 and "no se pudo leer" in response.json()["detail"]


def test_earth_search_failure_on_second_page_is_502_not_partial():
    feature = {
        "id": "S2C_13RCK_20260626_0_L2A",
        "geometry": {"type": "Polygon", "coordinates": [[list(p) for p in QUADS["13RCK"]]]},
        "properties": {"datetime": "2026-06-26T17:46:43Z", "platform": "sentinel-2c", "grid:code": "MGRS-13RCK",
                       "eo:cloud_cover": 1.0},
        "assets": {"visual": {"href": "https://sentinel-cogs.example/TCI.tif"}},
    }
    first = {"features": [feature], "links": [{"rel": "next", "body": {"next": "token"}}]}

    def handler(request):
        if b"token" in request.content:
            return httpx.Response(500, text="Internal Server Error")
        return httpx.Response(200, json=first)

    response = full_client(scenes=EarthSearchSource(mock_client(handler))).get(
        "/aois/parral/references/optical?date=2026-06-29"
    )
    assert response.status_code == 502 and "Earth Search" in response.json()["detail"]


def test_opera_failure_on_second_page_is_502_not_partial(monkeypatch):
    monkeypatch.setattr(opera_module, "PAGE_SIZE", 1)
    first = {"feed": {"entry": [cmr_entry("13RDK", "20260627T130504", "20260829T195832")]}}
    water = CmrOperaSource(mock_client(second_page_fails(first)))
    response = full_client(water=water).get("/aois/parral/references/opera?date=2026-06-29")
    assert response.status_code == 502 and "OPERA" in response.json()["detail"]
