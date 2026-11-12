#!/usr/bin/env bash
# Prueba la pila levantada con docker compose a través del gateway.
set -euo pipefail

BASE="${BASE:-http://localhost:8080}"

for _ in $(seq 1 60); do
  if curl -fsS "$BASE/api/verdicts/health" >/dev/null 2>&1; then
    break
  fi
  sleep 3
done

curl -fsS "$BASE/api/catalog/health" | grep -q ok
curl -fsS "$BASE/api/catalog/aois" | grep -q parral

event=$(curl -fsS "$BASE/api/verdicts/aois/parral/events?date=2026-07-01")
echo "$event" | grep -q '"cause":"no_acquisition_during_event"'
echo "$event" | grep -q '"next_pass":"2026-07-08"'

verdicts=$(curl -fsS "$BASE/api/verdicts/aois/parral/series/T048A-F015/verdicts")
echo "$verdicts" | grep -q '"data_kind":"synthetic"'
echo "$verdicts" | grep -q '"state":"change_probable"'
# T-BAL-02: días entre fechas y frescura del dato en cada veredicto.
echo "$verdicts" | grep -q '"interval_days":'
echo "$verdicts" | grep -q '"latency_status":"synthetic"'

curl -fsS "$BASE/api/verdicts/aois/parral/series/T048A-F015/pixel?lon=-105.67&lat=26.93" | grep -q '"values"'

# Tesela real con las URLs que entrega la API, a un zoom que cubre la zona.
template=$(echo "$verdicts" | python3 -c "import json,sys; print(json.load(sys.stdin)[-1]['layers']['state'])")
tile=$(echo "$template" | sed 's/{z}/9/; s/{x}/106/; s/{y}/216/')
content_type=$(curl -fsS -o /tmp/tile.png -w '%{content_type}' "$BASE$tile")
test "$content_type" = "image/png"

template=$(echo "$verdicts" | python3 -c "import json,sys; print(json.load(sys.stdin)[-1]['layers']['change_hh'])")
tile=$(echo "$template" | sed 's/{z}/9/; s/{x}/106/; s/{y}/216/')
test "$(curl -fsS -o /tmp/tile2.png -w '%{content_type}' "$BASE$tile")" = "image/png"

# El gateway no debe abrir archivos fuera de los artefactos.
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/tiles/cog/info?url=file%3A%2F%2F%2Fetc%2Fpasswd")
test "$code" = "403"

echo "Smoke OK"
