"""Procesado en línea sin recortes en disco (2026-11-15).

`run-remote` abre cada gránulo GCOV en NASA por HTTPS, lee en memoria solo la ventana de la zona (las mismas lecturas
que `read_scene` hace sobre un recorte) y escribe únicamente los artefactos del veredicto. Nada de `data/raw`.

Medido el 2026-11-15 con Delicias (T048A-F016, ventana de 1112 × 986 px): las cuatro capas necesarias suman 17,8 MB de
trozos comprimidos, y leerlas con bloques de 1 MB tardó unos 34 s por fecha. La copia de ingest, que además trae los
cubos de `radarGrid` con bloques de 16 MB, había recibido 8,7 GB sin terminar dos fechas. Sin `radarGrid` no se marcan
layover ni sombra: el manifiesto lo avisa, como con cualquier serie sin DEM.
"""
from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path
from urllib.parse import quote, urlsplit

NASA_HOST_SUFFIX = ".earthdatacloud.nasa.gov"
BLOCK_SIZE = 1024 * 1024


class RemoteGranule:
    """Archivo remoto con el aspecto de una ruta para `process_series` (`.stem`, `.name`) y de archivo para h5py."""

    def __init__(self, granule_id: str, handle):
        self.stem = granule_id
        self.name = f"{granule_id}.h5"
        self._h = handle

    def __getattr__(self, attr):
        return getattr(self._h, attr)

    def close(self):
        self._h.close()


def is_nasa_url(url: str) -> bool:
    parts = urlsplit(url)
    return parts.scheme == "https" and (parts.hostname or "").endswith(NASA_HOST_SUFFIX)


def open_remote(url: str, token: str):
    import fsspec  # solo para el modo en línea

    if not is_nasa_url(url):
        raise ValueError(f"Enlace rechazado: no se envía el token a {urlsplit(url).hostname}")
    fs = fsspec.filesystem(
        "https",
        client_kwargs={"headers": {"Authorization": f"Bearer {token}"}, "trust_env": False},
        skip_instance_cache=True,
    )
    return fs.open(url, mode="rb", cache_type="blockcache", block_size=BLOCK_SIZE)


def latest_granules(catalog_url: str, aoi: dict, series_spec: dict, last: int, getter=None) -> list[dict]:
    """Las `last` fechas más recientes de la serie configurada, según catalog (HTTP)."""
    def get(url):
        with urllib.request.urlopen(url, timeout=120) as r:  # noqa: S310 - URL de catalog de la propia pila
            return json.load(r)

    data = (getter or get)(f"{catalog_url.rstrip('/')}/aois/{quote(aoi['id'], safe='')}/series")
    key = (series_spec["track"], series_spec["direction"], series_spec["frame"])
    matches = [s for s in data if (s["track"], s["direction"], s["frame"]) == key]
    if len(matches) != 1:
        raise ValueError(f"Se esperaba una serie {series_spec['id']} en catalog y hay {len(matches)}")
    granules = sorted(matches[0]["granules"], key=lambda g: g.get("date") or "")
    return granules[-last:]


def run_remote(aoi: dict, series_id: str, artifact_root: Path, catalog_url: str, last: int, process, opener=None, getter=None) -> dict:
    """Abre las fechas en NASA y llama a `process(files)`; cierra todo al terminar. Devuelve el manifiesto."""
    token = os.environ.get("EARTHDATA_TOKEN", "").strip()
    if not token and opener is None:
        raise ValueError("Falta EARTHDATA_TOKEN: sin él NASA no deja leer los gránulos")
    spec = next((s for s in aoi.get("series", []) if s["id"] == series_id), None)
    if spec is None:
        raise ValueError(f"La serie {series_id} no está en la zona {aoi['id']}")
    granules = latest_granules(catalog_url, aoi, spec, last, getter)
    if len(granules) < 2:
        raise ValueError("Hacen falta al menos dos fechas")
    opener = opener or (lambda url: open_remote(url, token))
    files = []
    try:
        for g in granules:
            print(f"Abriendo en NASA {g['id']} ({g.get('date')}), solo la ventana de la zona", flush=True)
            files.append(RemoteGranule(g["id"], opener(g["download_url"])))
        return process(files)
    finally:
        for f in files:
            try:
                f.close()
            except Exception:  # noqa: BLE001
                pass
