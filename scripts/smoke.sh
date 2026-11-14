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
#
# Vale para la pila sintética y para la real: mira el data_kind de la serie en
# /series y ajusta lo que depende de él. SMOKE_DATA=synthetic o SMOKE_DATA=real
# lo fija y falla si la pila trae otra cosa.
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

# En Windows, python3 puede ser el alias de la Microsoft Store, que no ejecuta nada.
if python3 -c "" >/dev/null 2>&1; then
  PY=python3
elif python -c "" >/dev/null 2>&1; then
  PY=python
else
  echo "FALLO: hace falta python3 o python" >&2
  exit 1
fi

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
  "$PY" - "$TMP/$name.json" "$code" <<'PY' || fail "$what"
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
      reason=$("$PY" -c "import json,sys; print(json.load(open(sys.argv[1], encoding='utf-8'))['detail'])" "$TMP/$name.json") \
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

# Acceso en el gateway (T-BAL-10). AUTH_ENABLED es la misma variable que lee el compose: 0 por omisión.
# La prueba completa de acceso (registro, 403, 429 y perfiles) es T-BAL-16.
AUTH_ENABLED="${AUTH_ENABLED:-0}"
# La comprobación previa de CORS con Authorization debe pasar desde el frontend, que está en otro origen.
curl -s -o /dev/null -D "$TMP/preflight.txt" -X OPTIONS -H "Origin: http://localhost:3000"   -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: authorization" "$BASE/api/verdicts/aois"
grep -qi '^access-control-allow-headers:.*authorization' "$TMP/preflight.txt" || fail "CORS de /api/ sin Authorization"
code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer no-es-un-token" "$BASE/api/verdicts/aois")
code_auth=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/auth/health")
if [ "$AUTH_ENABLED" = "1" ]; then
  # Un token roto da 401 también en una ruta actual, nunca 200 como public (RF-ACC-06).
  test "$code" = "401" || fail "token roto en una ruta actual respondió $code, se esperaba 401"
  test "$code_auth" = "200" || fail "/api/auth/health respondió $code_auth"
  expect_code 404 "/api/auth/verify"
else
  # Sin validación, el token no se mira y todo es public; las rutas de auth dicen que el acceso está apagado.
  test "$code" = "200" || fail "con AUTH_ENABLED=0, una ruta actual con token respondió $code"
  test "$code_auth" = "503" || fail "con AUTH_ENABLED=0, /api/auth/health respondió $code_auth, se esperaba 503"
fi

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

# Búsqueda de pasadas (T-ANT-16). Pide el perfil student: sin cuenta (public) responde 403 y dice cuál falta.
# No se prueba con X-Auth-Role a mano: hasta T-BAL-10 el gateway no borra esa cabecera del cliente.
if curl -fsS "$BASE/api/catalog/openapi.json" | grep -q '/search/passes'; then
  code=$(curl -s -o "$TMP/catalog_search_passes.json" -w '%{http_code}' "$BASE/api/catalog/search/passes")
  test "$code" = "403" || fail "/api/catalog/search/passes sin cuenta respondió $code, se esperaba 403"
  check "catalog /search/passes" catalog_search_passes "assert d['required_role'] == 'student', d"
  covered catalog "/search/passes"
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

# Datos de la serie principal: sintéticos o reales. Lo que depende de ello se comprueba según el caso.
DATA_KIND=$("$PY" -c "import json,sys; print({s['id']: s for s in json.load(open(sys.argv[1], encoding='utf-8'))}[sys.argv[2]]['data_kind'])" "$TMP/verdicts_series.json" "$SERIES")
if [ -n "${SMOKE_DATA:-}" ] && [ "$SMOKE_DATA" != "$DATA_KIND" ]; then
  fail "SMOKE_DATA=$SMOKE_DATA, pero $SERIES trae datos $DATA_KIND"
fi
echo "Datos de $SERIES: $DATA_KIND"

get event "/api/verdicts/aois/$AOI/events?date=$EVENT_DATE"
grep -q '"cause":"no_acquisition_during_event"' "$TMP/event.json" || fail "evento: causa"
grep -q '"next_pass":"2026-07-08"' "$TMP/event.json" || fail "evento: siguiente pasada"
# El corte se cuenta en horas: con 145 h ya no sale "observable". Con sintéticos no se sabe la hora de la
# pasada y sale la duda declarada; con datos reales catalog da la hora (07-08 01:44 UTC) y no llega.
get event145 "/api/verdicts/aois/$AOI/events?date=$EVENT_DATE&persistence_hours=145"
if [ "$DATA_KIND" = synthetic ]; then
  grep -q '"cause":"timing_uncertain"' "$TMP/event145.json" || fail "evento: 145 h sin hora"
else
  grep -q '"state":"not_observable"' "$TMP/event145.json" || fail "evento: 145 h con la hora real"
fi
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
echo "$verdicts" | grep -q "\"data_kind\":\"$DATA_KIND\"" || fail "veredictos: data_kind"
# T-BAL-02: días entre fechas y frescura del dato en cada veredicto.
echo "$verdicts" | grep -q '"interval_days":' || fail "veredictos: interval_days"
if [ "$DATA_KIND" = synthetic ]; then
  # Los sintéticos se generan con cambio, y la latencia no aplica.
  echo "$verdicts" | grep -q '"state":"change_probable"' || fail "veredictos: change_probable"
  echo "$verdicts" | grep -q '"latency_status":"synthetic"' || fail "veredictos: latency_status"
else
  # Con datos reales vale cualquier estado; la latencia sale de catalog o se dice por qué no se sabe.
  check "veredictos: latencia real" verdicts "
for v in d:
    for side in ('before', 'after'):
        assert v['receipt']['freshness'][side]['latency_status'] != 'synthetic', v['id']
"
fi
# Ningún veredicto sin data_kind.
check "veredictos: data_kind en todos" verdicts "
assert d and all(v['receipt']['data_kind'] in ('real', 'synthetic') for v in d)
"
covered verdicts "/aois/{aoi}/series/{series_id}/verdicts"

# Textos en inglés con la misma estructura.
get verdicts_en "/api/verdicts/aois/$AOI/series/$SERIES/verdicts?lang=en"
check "veredictos en inglés" verdicts_en "assert d and all(v['summary'] for v in d)"

# Un par concreto coincide con el de la lista.
pair_id=$("$PY" -c "import json,sys; print(json.load(open(sys.argv[1], encoding='utf-8'))[-1]['id'])" "$TMP/verdicts.json")
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

# Búsqueda (T-BAL-11). Sin token la petición es public, con AUTH_ENABLED a 0 o a 1: 403 con el perfil que haría
# falta, también si el cliente se inventa X-Auth-Role (el gateway la pisa). Los 200 con token los añade T-BAL-16.
for role_header in "" "X-Auth-Role: researcher"; do
  code=$(curl -s -o "$TMP/search.json" -w '%{http_code}' ${role_header:+-H "$role_header"} \
    "$BASE/api/verdicts/search/verdicts?state=change_probable")
  test "$code" = "403" || fail "búsqueda sin token respondió $code con '${role_header:-sin cabecera}'"
  check "búsqueda: required_role" search "assert d['required_role'] == 'student', d"
done
covered verdicts "/search/verdicts"

# --- Teselas ----------------------------------------------------------------

# Tesela real con las URLs que entrega la API, a un zoom que cubre la zona.
for layer in state change_hh; do
  template=$(echo "$verdicts" | "$PY" -c "import json,sys; print(json.load(sys.stdin)[-1]['layers']['$layer'])")
  tile=$(echo "$template" | sed 's/{z}/9/; s/{x}/106/; s/{y}/216/')
  content_type=$(curl -fsS -o "$TMP/tile.png" -w '%{content_type}' "$BASE$tile") || fail "tesela $layer"
  test "$content_type" = "image/png" || fail "tesela $layer: $content_type"
done

# Relieve (T-BAL-15): si el manifiesto trae dem, /series da una plantilla terrainrgb y su tesela es un PNG. Sin dem
# (el seed sintético aún no lo trae), relief es null y se avisa.
"$PY" - "$TMP/verdicts_series.json" >"$TMP/relief.txt" <<'PY' || fail "relieve en /series"
import json, sys
templates = set()
for item in json.load(open(sys.argv[1], encoding="utf-8")):
    relief = item["relief"]
    if relief is None:
        continue
    assert "algorithm=terrainrgb" in relief["tiles"] and relief["encoding"] == "mapbox", relief
    assert relief["attribution"] and relief["exaggeration"] == 1 and relief["units"] == "m", relief
    templates.add(relief["tiles"])
assert len(templates) <= 1, "cada zona tiene un solo DEM"
print(templates.pop() if templates else "")
PY
relief_template=$(tr -d '\r' <"$TMP/relief.txt")
if [ -n "$relief_template" ]; then
  tile=$(echo "$relief_template" | sed 's/{z}/9/; s/{x}/106/; s/{y}/216/')
  content_type=$(curl -fsS -o "$TMP/relief.png" -w '%{content_type}' "$BASE$tile") || fail "tesela de relieve"
  test "$content_type" = "image/png" || fail "tesela de relieve: $content_type"
  echo "Relieve: tesela terrainrgb servida"
else
  WARNINGS+=("relieve sin probar: ninguna serie trae dem en su manifiesto (falta un DEM sintético o reprocesar)")
fi
# Solo el algoritmo del relieve pasa el gateway: otro, sus parámetros o un segundo algorithm= dan 403.
DEM_URL="url=file%3A%2F%2F%2Fdata%2Fartifacts%2F$AOI%2Fdem.tif"
for query in "algorithm=hillshade" "algorithm=terrainrgb&algorithm=hillshade" "algorithm=terrainrgb&algorithm_params=%7B%7D"; do
  expect_code 403 "/tiles/cog/tiles/WebMercatorQuad/9/106/216.png?$DEM_URL&$query"
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

# T-BAL-07: QA de Eco en el recibo y desplazamiento de la escena (null si el manifiesto no trae qa).
check "veredictos: calidad y desplazamiento" verdicts "
for verdict in d:
    assert verdict['receipt']['quality']['source'] == 'manifest_qa', verdict['id']
    shift = verdict['evidence']['scene_shift']
    if shift is not None:
        assert shift['calibrated'] is False and shift['threshold_db'] > 0, verdict['id']
"

# Pasadas excluidas por catalog: el campo existe siempre; con sintéticos va vacío.
check "veredictos: pasadas excluidas" verdicts "
for verdict in d:
    excluded = verdict['receipt']['excluded_passes']
    assert isinstance(excluded, list), verdict['id']
    if verdict['receipt']['data_kind'] == 'synthetic':
        assert excluded == [], verdict['id']
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
  "$PY" - "$TMP/openapi_$service.json" "$TMP/covered.txt" "$service" <<'PY' || fail "rutas de $service sin prueba de humo"
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
