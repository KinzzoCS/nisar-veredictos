"""CLI del procesador: datos sintéticos para desarrollo y gránulos reales locales."""
from __future__ import annotations

import argparse
import shutil
import urllib.request
import sys
from pathlib import Path

import yaml

from .change import Params
from .gcov import GranuleError
from .pipeline import excluded_granules, process_series
from .synthetic import PARRAL_SERIES, generate_series
from .terrain import glo30_tiles


def load_aoi(aoi_dir: Path, aoi_id: str) -> dict:
    path = aoi_dir / f"{aoi_id}.yaml"
    if not path.is_file():
        raise SystemExit(f"Zona desconocida: {aoi_id}")
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def series_id_for(spec) -> str:
    return f"T{spec.track:03d}{spec.direction}-F{spec.frame:03d}"


def seed_synthetic(args: argparse.Namespace) -> int:
    aoi = load_aoi(args.aoi_dir, "parral")
    artifacts = args.data_dir / "artifacts"
    for spec in PARRAL_SERIES:
        series_id = series_id_for(spec)
        if (artifacts / "parral" / series_id / "manifest.json").exists() and not args.force:
            print(f"{series_id}: ya existe, se conserva")
            continue
        raw = args.data_dir / "raw" / "synthetic" / series_id
        shutil.rmtree(raw, ignore_errors=True)
        paths = generate_series(spec, aoi["bbox"], raw)
        manifest = process_series(paths, aoi, series_id, artifacts, aoi["maturity"])
        print(f"{series_id}: {len(manifest['pairs'])} pares sintéticos")
    return 0


def fetch_dem(args: argparse.Namespace) -> int:
    """Baja las teselas públicas GLO-30 que cubren la zona (no necesita cuenta)."""
    aoi = load_aoi(args.aoi_dir, args.aoi)
    target = args.data_dir / "dem" / aoi["id"]
    target.mkdir(parents=True, exist_ok=True)
    for url in glo30_tiles(aoi["bbox"]):
        path = target / url.rsplit("/", 1)[1]
        if path.exists():
            print(f"{path.name}: ya existe")
            continue
        partial = path.with_suffix(".part")
        urllib.request.urlretrieve(url, partial)
        partial.replace(path)
        print(f"{path.name}: {path.stat().st_size / 1e6:.1f} MB")
    return 0


def run(args: argparse.Namespace) -> int:
    aoi = load_aoi(args.aoi_dir, args.aoi)
    paths = sorted(args.input.glob("*.h5"))
    dem_dir = args.dem_dir or args.data_dir / "dem" / aoi["id"]
    dem = sorted(dem_dir.glob("*.tif")) if dem_dir.is_dir() else []
    exclude = excluded_granules(aoi)
    try:
        manifest = process_series(
            paths,
            aoi,
            args.series,
            args.data_dir / "artifacts",
            aoi["maturity"],
            Params(multitemporal=args.multitemporal),
            dem_sources=dem,
            exclude=exclude,
        )
    except GranuleError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    skipped = [notice for notice in manifest["notices"] if notice.startswith("Fechas excluidas")]
    print(f"{args.series}: {len(manifest['pairs'])} pares ({manifest['data_kind']})")
    for notice in skipped:
        print(notice)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="processor")
    parser.add_argument("--aoi-dir", type=Path, default=Path("/config/aois"))
    parser.add_argument("--data-dir", type=Path, default=Path("/data"))
    commands = parser.add_subparsers(dest="command", required=True)

    seed = commands.add_parser("seed-synthetic", help="Genera datos falsos de Parral y sus artefactos")
    seed.add_argument("--force", action="store_true")
    seed.set_defaults(handler=seed_synthetic)

    process = commands.add_parser("run", help="Procesa gránulos .h5 locales de una serie")
    process.add_argument("--aoi", required=True)
    process.add_argument("--series", required=True)
    process.add_argument("--input", type=Path, required=True)
    process.add_argument("--dem-dir", type=Path, help="Teselas GLO-30; por omisión <data-dir>/dem/<zona>")
    process.add_argument(
        "--multitemporal", action="store_true", help="Aplica el filtro multitemporal de speckle (T-ECO-08)"
    )
    process.set_defaults(handler=run)

    dem = commands.add_parser("fetch-dem", help="Baja el DEM Copernicus GLO-30 de una zona")
    dem.add_argument("--aoi", required=True)
    dem.set_defaults(handler=fetch_dem)

    args = parser.parse_args()
    return args.handler(args)


if __name__ == "__main__":
    sys.exit(main())
