#!/usr/bin/env bash
# Prueba la pila levantada con docker compose a través del gateway (T-BAL-05).
#
# Cubre todas las rutas GET de catalog y verdicts, las teselas y las reglas del
# gateway. Al final compara las rutas probadas con el OpenAPI de cada servicio:
# una ruta nueva sin prueba hace fallar la prueba de humo.
#
# Las rutas de Antena que consultan CMR o Earth Search dependen de la red. Sin
# red responden 502 con su motivo; eso se acepta y se avisa, salvo con
# SMOKE_REQUIRE_NETWORK=1, que lo convierte en fallo.
set -euo pipefail

BASE="${BASE:-http://localhost:8080}"
REQUIRE_NETWORK="${SMOKE_REQUIRE_NETWORK:-0}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

AOI=parral
SERIES=T048A-F015
OTHER_SERIES=T171D-F075
EVENT_DATE=2026-07-01

COVERED=()
WARNINGS=()

fail() {
  echo "FALLO: $*" >&2
  exit 1
}

# Marca una ruta del OpenAPI como probada: servicio y plantilla, p. ej. "catalog /aois/{aoi_id}".
covered() {
  COVERED+=("$1 $2")
}

# GET que debe responder 200; deja el cuerpo en $TMP/$1.json.
get() {
  local name=$1 path=$2 code
  code=$(curl -s -o "$TMP/$name.json" -w '%{http_code}' "$BASE$path") || fail "sin respuesta: $path"
  test "$code" = "200" || fail "$path respondió $code: $(head -c 300 "$TMP/$name.json")"
}

# GET que debe responder el código dado.
expect_code() {
  local expected=$1 path=$2 code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
  test "$code" = "$expected" || fail "$path respondió $code, se esperaba $expected"
}

# Ejecuta código Python sobre el JSON de $TMP/$2.json, disponible como `d`.
check() {
  local what=$1 name=$2 code=$3
  python3 - "$TMP/$name.json" "$code" <<'PY' || fail "$what"
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
exec(sys.argv[2])
PY
}

# GET a una ruta que depende de un servicio externo. 200: valida; 502: avisa o falla.
# Devuelve 0 si hay cuerpo que validar.
external() {
  local name=$1 path=$2 code
  code=$(curl -s -o "$TMP/$name.json" -w '%{http_code}' "$BASE$path") || fail "sin respuesta: $path"
  case "$code" in
    200) return 0 ;;
    502)
      local reason
      reason=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1], encoding='utf-8'))['detail'])" "$TMP/$name.json") \
        || fail "$path respondió 502 sin motivo"
      test "$REQUIRE_NETWORK" = "1" && fail "$path sin red: $reason"
      WARNINGS+=("$path no se validó: $reason")
      return 1
      ;;
    *) fail "$path respondió $code: $(head -c 300 "$TMP/$name.json")" ;;
  esac
}

for _ in $(seq 1 60); do
  if curl -fsS "$BASE/api/verdicts/health" >/dev/null 2>&1; then
    break
  fi
  sleep 3
done

# --- Gateway ----------------------------------------------------------------

get gateway_health "/health"
check "gateway /health" gateway_health "assert d == {'status': 'ok'}"
expect_code 404 "/no-existe"
# Solo lectura: cualquier escritura se rechaza antes de llegar a los servicios.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/verdicts/aois")
test "$code" = "405" || fail "POST respondió $code, se esperaba 405"
code=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$BASE/api/verdicts/aois")
test "$code" = "204" || fail "OPTIONS respondió $code, se esperaba 204"

# --- Catalog (Antena) -------------------------------------------------------

get catalog_health "/api/catalog/health"
check "catalog /health" catalog_health "assert d['status'] == 'ok'"
covered catalog /health

get catalog_aois "/api/catalog/aois"
check "catalog /aois" catalog_aois "
aoi = {a['id']: a for a in d}['$AOI']
assert len(aoi['bbox']) == 4 and aoi['collection'] and aoi['maturity'], aoi
"
covered catalog /aois
expect_code 404 "/api/catalog/aois/no-existe/series"

if external catalog_series "/api/catalog/aois/$AOI/series"; then
  check "catalog /series" catalog_series "
ids = {s['id'].split('-')[0] + '-' + s['id'].split('-')[1] for s in d}
assert {'$SERIES', '$OTHER_SERIES'} <= ids, ids
for s in d:
    assert s['granules'] and all(g['download_url'].startswith('https://') for g in s['granules']), s['id']
"
fi
covered catalog "/aois/{aoi_id}/series"

if external catalog_timeline "/api/catalog/aois/$AOI/timeline"; then
  check "catalog /timeline" catalog_timeline "
assert d['aoi'] == '$AOI' and d['published_at_basis'] == 'cmr_updated'
assert d['passes'] and all(p['acquired_at'] for p in d['passes'])
assert any(i['crosses_gap'] for i in d['intervals']), 'ningún intervalo cruza el hueco de agosto'
assert any(g['start'] <= '2026-08-01' <= g['end'] for g in d['gaps']), d['gaps']
assert all(e['basis'] == '12-day cycle' for e in d['next_pass_estimates'])
"
fi
covered catalog "/aois/{aoi_id}/timeline"

expect_code 422 "/api/catalog/aois/$AOI/references/optical"
if external catalog_optical "/api/catalog/aois/$AOI/references/optical?date=$EVENT_DATE"; then
  check "catalog /references/optical" catalog_optical "
assert d['aoi'] == '$AOI' and d['date'] == '$EVENT_DATE'
assert d['license_url'] and d['attribution'] and d['cloud_cover_basis'] == 'tile'
for acq in d['acquisitions']:
    for tile in acq['tiles']:
        assert tile['visual_url'].startswith('https://sentinel-cogs.s3.us-west-2.amazonaws.com/'), tile
"
fi
covered catalog "/aois/{aoi_id}/references/optical"

# Referencias OPERA DSWx-S1 (T-ANT-06). Se prueban en cuanto catalog las publique.
if curl -fsS "$BASE/api/catalog/openapi.json" | grep -q '/references/opera'; then
  if external catalog_opera "/api/catalog/aois/$AOI/references/opera?date=$EVENT_DATE"; then
    check "catalog /references/opera" catalog_opera "
assert d['aoi'] == '$AOI' and d['date'] == '$EVENT_DATE'
assert d['doi'] and d['attribution'] and d['data_access'] == 'earthdata_login'
for acq in d['acquisitions']:
    assert acq['tiles'] and all(t['wtr_url'] for t in acq['tiles']), acq
"
  fi
  covered catalog "/aois/{aoi_id}/references/opera"
fi

# --- Verdicts (Balanza) -----------------------------------------------------

get verdicts_health "/api/verdicts/health"
check "verdicts /health" verdicts_health "assert d['status'] == 'ok'"
covered verdicts /health

get verdicts_aois "/api/verdicts/aois"
check "verdicts /aois" verdicts_aois "assert '$AOI' in d, d"
covered verdicts /aois

get verdicts_series "/api/verdicts/aois/$AOI/series"
check "verdicts /series" verdicts_series "
by_id = {s['id']: s for s in d}
assert {'$SERIES', '$OTHER_SERIES'} <= set(by_id), list(by_id)
for s in d:
    assert s['data_kind'] in ('real', 'synthetic') and len(s['bbox']) == 4 and len(s['dates']) >= 2, s['id']
"
covered verdicts "/aois/{aoi}/series"
expect_code 404 "/api/verdicts/aois/no-existe/series"

get event "/api/verdicts/aois/$AOI/events?date=$EVENT_DATE"
grep -q '"cause":"no_acquisition_during_event"' "$TMP/event.json" || fail "evento: causa"
grep -q '"next_pass":"2026-07-08"' "$TMP/event.json" || fail "evento: siguiente pasada"
# El corte se cuenta en horas: con 145 h ya no sale "observable", sino la duda declarada.
get event145 "/api/verdicts/aois/$AOI/events?date=$EVENT_DATE&persistence_hours=145"
grep -q '"cause":"timing_uncertain"' "$TMP/event145.json" || fail "evento: 145 h sin hora"
get event_time "/api/verdicts/aois/$AOI/events?date=$EVENT_DATE&persistence_hours=145&time=12:00"
grep -q '"event_time":"12:00:00"' "$TMP/event_time.json" || fail "evento: hora UTC"
# T-BAL-06: la persistencia por tipo de evento sale declarada como supuesto.
get event_type "/api/verdicts/aois/$AOI/events?date=$EVENT_DATE&event_type=urban_storm"
grep -q '"persistence_hours":6' "$TMP/event_type.json" || fail "evento: persistencia por tipo"
grep -q '"source":"event_type"' "$TMP/event_type.json" || fail "evento: origen del supuesto"
grep -q '"calibrated":false' "$TMP/event_type.json" || fail "evento: supuesto sin calibrar"
covered verdicts "/aois/{aoi}/events"

get verdicts "/api/verdicts/aois/$AOI/series/$SERIES/verdicts"
verdicts=$(cat "$TMP/verdicts.json")
echo "$verdicts" | grep -q '"data_kind":"synthetic"' || fail "veredictos: data_kind"
echo "$verdicts" | grep -q '"state":"change_probable"' || fail "veredictos: change_probable"
# T-BAL-02: días entre fechas y frescura del dato en cada veredicto.
echo "$verdicts" | grep -q '"interval_days":' || fail "veredictos: interval_days"
echo "$verdicts" | grep -q '"latency_status":"synthetic"' || fail "veredictos: latency_status"
# Ningún veredicto sin data_kind.
check "veredictos: data_kind en todos" verdicts "
assert d and all(v['receipt']['data_kind'] in ('real', 'synthetic') for v in d)
"
covered verdicts "/aois/{aoi}/series/{series_id}/verdicts"

# Textos en inglés con la misma estructura.
get verdicts_en "/api/verdicts/aois/$AOI/series/$SERIES/verdicts?lang=en"
check "veredictos en inglés" verdicts_en "assert d and all(v['summary'] for v in d)"

# Un par concreto coincide con el de la lista.
pair_id=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1], encoding='utf-8'))[-1]['id'])" "$TMP/verdicts.json")
get verdict "/api/verdicts/aois/$AOI/series/$SERIES/verdicts/$pair_id"
check "veredicto por par" verdict "assert d['id'] == '$pair_id' and d['receipt']['data_kind']"
covered verdicts "/aois/{aoi}/series/{series_id}/verdicts/{pair_id}"
expect_code 404 "/api/verdicts/aois/$AOI/series/$SERIES/verdicts/no-existe"
expect_code 404 "/api/verdicts/aois/$AOI/series/no-existe/verdicts"

# La otra serie también produce veredictos.
get verdicts_other "/api/verdicts/aois/$AOI/series/$OTHER_SERIES/verdicts"
check "veredictos de $OTHER_SERIES" verdicts_other "assert d and all(v['receipt']['data_kind'] for v in d)"

get pixel "/api/verdicts/aois/$AOI/series/$SERIES/pixel?lon=-105.67&lat=26.93"
grep -q '"values"' "$TMP/pixel.json" || fail "píxel: values"
covered verdicts "/aois/{aoi}/series/{series_id}/pixel"
expect_code 422 "/api/verdicts/aois/$AOI/series/$SERIES/pixel?lon=500&lat=26.93"

# --- Teselas ----------------------------------------------------------------

# Tesela real con las URLs que entrega la API, a un zoom que cubre la zona.
for layer in state change_hh; do
  template=$(echo "$verdicts" | python3 -c "import json,sys; print(json.load(sys.stdin)[-1]['layers']['$layer'])")
  tile=$(echo "$template" | sed 's/{z}/9/; s/{x}/106/; s/{y}/216/')
  content_type=$(curl -fsS -o "$TMP/tile.png" -w '%{content_type}' "$BASE$tile") || fail "tesela $layer"
  test "$content_type" = "image/png" || fail "tesela $layer: $content_type"
done

# El gateway no debe abrir archivos fuera de los artefactos.
expect_code 403 "/tiles/cog/info?url=file%3A%2F%2F%2Fetc%2Fpasswd"

# Un url= bueno seguido de otro malo, o un nombre codificado, tampoco pasa.
GOOD="url=file%3A%2F%2F%2Fdata%2Fartifacts%2Fx.tif"
for query in \
  "$GOOD&url=http%3A%2F%2Fcatalog%3A8000%2Faois" \
  "$GOOD&URL=file%3A%2F%2F%2Fetc%2Fpasswd" \
  "$GOOD&ur%6C=file%3A%2F%2F%2Fetc%2Fpasswd"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/tiles/cog/info?$query")
  test "$code" = "403" || fail "El gateway dejó pasar: $query ($code)"
done

# T-BAL-04: contraste óptico en cada veredicto, con estado aunque no haya red.
echo "$verdicts" | grep -q '"optical":{"data_kind":"real"' || fail "veredictos: óptico"
check "veredictos: estado óptico" verdicts "
for verdict in d:
    optical = verdict['evidence']['optical']
    assert optical['before']['status'] and optical['after']['status'] and optical['text'], verdict['id']
"

# T-BAL-08: contraste con OPERA DSWx-S1. Con radar sintético se lista el producto pero nunca se compara.
check "veredictos: contraste de agua" verdicts "
for verdict in d:
    water = verdict['evidence']['water']
    assert water['data_kind'] == 'real' and water['text'], verdict['id']
    for side in (water['before'], water['after']):
        assert side['status'], verdict['id']
        if verdict['receipt']['data_kind'] == 'synthetic':
            assert side['status'] != 'compared' and side['assessment'] is None, verdict['id']
"

# El bucket público de Sentinel-2 sí pasa el filtro (sin red, TiTiler responde otro error, no 403).
S2_URL="https%3A%2F%2Fsentinel-cogs.s3.us-west-2.amazonaws.com%2Fsentinel-s2-l2a-cogs%2F13%2FR%2FCK%2F2026%2F6%2FS2C_13RCK_20260628_0_L2A%2FTCI.tif"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/tiles/cog/info?url=$S2_URL")
test "$code" != "403" || fail "El gateway rechazó el bucket de Sentinel-2"
# Otro host HTTPS, otro prefijo del bucket o un segundo url= no pasan.
for query in \
  "url=https%3A%2F%2Fexample.com%2FTCI.tif" \
  "url=https%3A%2F%2Fsentinel-cogs.s3.us-west-2.amazonaws.com.example.com%2Fsentinel-s2-l2a-cogs%2Fx.tif" \
  "url=https%3A%2F%2Fsentinel-cogs.s3.us-west-2.amazonaws.com%2Fotro%2Fx.tif" \
  "url=$S2_URL&url=file%3A%2F%2F%2Fetc%2Fpasswd" \
  "url=$S2_URL&%75rl=file%3A%2F%2F%2Fetc%2Fpasswd"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/tiles/cog/info?$query")
  test "$code" = "403" || fail "El gateway dejó pasar: $query ($code)"
done

# --- Cobertura --------------------------------------------------------------

# Toda ruta GET publicada por catalog o verdicts debe tener prueba arriba.
printf '%s\n' "${COVERED[@]}" >"$TMP/covered.txt"
for service in catalog verdicts; do
  get "openapi_$service" "/api/$service/openapi.json"
  python3 - "$TMP/openapi_$service.json" "$TMP/covered.txt" "$service" <<'PY' || fail "rutas de $service sin prueba de humo"
import json, sys
spec = json.load(open(sys.argv[1], encoding="utf-8"))
service = sys.argv[3]
covered = {line.split(" ", 1)[1] for line in open(sys.argv[2], encoding="utf-8").read().splitlines()
           if line.split(" ", 1)[0] == service}
published = {path for path, ops in spec["paths"].items() if "get" in ops}
missing = sorted(published - covered)
if missing:
    print(f"{service}: rutas sin prueba en scripts/smoke.sh: {', '.join(missing)}", file=sys.stderr)
    sys.exit(1)
PY
done

for warning in "${WARNINGS[@]+"${WARNINGS[@]}"}"; do
  echo "AVISO: $warning" >&2
done
echo "Smoke OK"
