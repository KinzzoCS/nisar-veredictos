"""CLI de ingesta: python -m ingest fetch --aoi parral --series T048A-F015."""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import yaml

from .fetch import FetchError, fetch_series
from .subset import SubsetError


def fetch(args: argparse.Namespace) -> int:
    token = os.environ.get("EARTHDATA_TOKEN", "").strip()
    if not token:
        print("Error: falta EARTHDATA_TOKEN (cópialo a .env desde tu cuenta de Earthdata)", file=sys.stderr)
        return 2
    path = args.aoi_dir / f"{args.aoi}.yaml"
    if not path.is_file():
        print(f"Error: zona desconocida: {args.aoi}", file=sys.stderr)
        return 1
    aoi = yaml.safe_load(path.read_text(encoding="utf-8"))
    started = time.monotonic()
    try:
        result = fetch_series(aoi, args.series, args.data_dir, token, args.catalog_url, args.limit)
    except (FetchError, SubsetError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    megabytes = sum(item.stat().st_size for item in result.target.glob("*.h5")) / 1024**2
    print(
        f"{args.series}: {len(result.written)} recortes nuevos, {len(result.skipped)} ya existían, "
        f"{megabytes:.0f} MB en disco, {time.monotonic() - started:.0f} s"
    )
    if result.excluded:
        print(f"Excluidos en config/aois/{args.aoi}.yaml, no se traen: {', '.join(result.excluded)}")
    for name in result.stale:
        print(f"Aviso: {name}.h5 está excluido pero sigue en {result.target}; apártalo antes de processor run", file=sys.stderr)
    print(f"Siguiente paso, en processor: run --aoi {args.aoi} --series {args.series} --input {result.target}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="ingest")
    parser.add_argument("--aoi-dir", type=Path, default=Path("/config/aois"))
    parser.add_argument("--data-dir", type=Path, default=Path("/data"))
    commands = parser.add_subparsers(dest="command", required=True)

    remote = commands.add_parser("fetch", help="Trae por HTTPS el recorte de la zona desde NASA")
    remote.add_argument("--aoi", required=True)
    remote.add_argument("--series", required=True)
    remote.add_argument("--limit", type=int, help="Solo las primeras N fechas; útil para una primera prueba")
    remote.add_argument("--catalog-url", default=os.environ.get("CATALOG_URL", "http://localhost:8080/api/catalog"))
    remote.set_defaults(handler=fetch)

    args = parser.parse_args()
    return args.handler(args)


if __name__ == "__main__":
    sys.exit(main())
