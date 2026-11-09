"""CLI del procesador: datos sintéticos para desarrollo y gránulos reales locales."""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

import yaml

from .gcov import GranuleError
from .pipeline import process_series
from .synthetic import PARRAL_SERIES, generate_series


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


def run(args: argparse.Namespace) -> int:
    aoi = load_aoi(args.aoi_dir, args.aoi)
    paths = sorted(args.input.glob("*.h5"))
    try:
        manifest = process_series(paths, aoi, args.series, args.data_dir / "artifacts", aoi["maturity"])
    except GranuleError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    print(f"{args.series}: {len(manifest['pairs'])} pares ({manifest['data_kind']})")
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
    process.set_defaults(handler=run)

    args = parser.parse_args()
    return args.handler(args)


if __name__ == "__main__":
    sys.exit(main())
