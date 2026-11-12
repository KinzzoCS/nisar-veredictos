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

# Un url= bueno seguido de otro malo, o un nombre codificado, tampoco pasa.
GOOD="url=file%3A%2F%2F%2Fdata%2Fartifacts%2Fx.tif"
for query in \
  "$GOOD&url=http%3A%2F%2Fcatalog%3A8000%2Faois" \
  "$GOOD&URL=file%3A%2F%2F%2Fetc%2Fpasswd" \
  "$GOOD&ur%6C=file%3A%2F%2F%2Fetc%2Fpasswd"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/tiles/cog/info?$query")
  test "$code" = "403" || { echo "El gateway dejó pasar: $query ($code)"; exit 1; }
done

# T-BAL-04: contraste óptico en cada veredicto, con estado aunque no haya red.
echo "$verdicts" | grep -q '"optical":{"data_kind":"real"'
echo "$verdicts" | python3 -c "
import json, sys
for verdict in json.load(sys.stdin):
    optical = verdict['evidence']['optical']
    assert optical['before']['status'] and optical['after']['status'] and optical['text'], verdict['id']
"

# El bucket público de Sentinel-2 sí pasa el filtro (sin red, TiTiler responde otro error, no 403).
S2_URL="https%3A%2F%2Fsentinel-cogs.s3.us-west-2.amazonaws.com%2Fsentinel-s2-l2a-cogs%2F13%2FR%2FCK%2F2026%2F6%2FS2C_13RCK_20260628_0_L2A%2FTCI.tif"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/tiles/cog/info?url=$S2_URL")
test "$code" != "403"
# Otro host HTTPS, otro prefijo del bucket o un segundo url= no pasan.
for query in \
  "url=https%3A%2F%2Fexample.com%2FTCI.tif" \
  "url=https%3A%2F%2Fsentinel-cogs.s3.us-west-2.amazonaws.com.example.com%2Fsentinel-s2-l2a-cogs%2Fx.tif" \
  "url=https%3A%2F%2Fsentinel-cogs.s3.us-west-2.amazonaws.com%2Fotro%2Fx.tif" \
  "url=$S2_URL&url=file%3A%2F%2F%2Fetc%2Fpasswd" \
  "url=$S2_URL&%75rl=file%3A%2F%2F%2Fetc%2Fpasswd"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/tiles/cog/info?$query")
  test "$code" = "403" || { echo "El gateway dejó pasar: $query ($code)"; exit 1; }
done

echo "Smoke OK"
