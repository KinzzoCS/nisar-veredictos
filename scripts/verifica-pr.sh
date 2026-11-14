#!/usr/bin/env bash
# Verificación local equivalente a la CI de GitHub Actions.
#
# Uso:
#   bash scripts/verifica-pr.sh 97            # un PR: lo prueba ya fusionado con main, como la CI
#   bash scripts/verifica-pr.sh main          # una rama
#   bash scripts/verifica-pr.sh 97 --sin-humo # sin levantar la pila (más rápido)
#
# Hace lo mismo que .github/workflows/ci.yml y convenciones.yml:
#   1. Título del PR y nombre de la rama (solo con número de PR).
#   2. pytest -q de cada servicio en un contenedor python:3.11, como la CI.
#   3. docker compose up --build + scripts/smoke.sh con datos sintéticos.
# Y además, aunque la CI no lo hace: lint y vitest del frontend.
#
# Trabaja en un git worktree temporal: no toca tu copia, tu .env ni tus datos.
# La pila de prueba usa otro nombre de proyecto y los puertos 18080 y 13000,
# así que puede convivir con la pila que ya tengas levantada en 8080 y 3000.
set -uo pipefail

usage() { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
[[ $# -ge 1 ]] || usage
REF="$1"; shift
SMOKE=1; FRONT=1
for a in "$@"; do
  case "$a" in
    --sin-humo) SMOKE=0 ;;
    --sin-frontend) FRONT=0 ;;
    *) usage ;;
  esac
done

# Git Bash en Windows: a docker se le pasa MSYS_NO_PATHCONV=1 solo en sus llamadas, para que no
# reescriba rutas como /src; exportarlo para todo rompería curl y git con rutas /tmp.
winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

ROOT=$(git rev-parse --show-toplevel) || exit 2
cd "$ROOT"
SMOKE_PORT="${VERIFICA_PORT:-18080}"
FRONT_PORT="${VERIFICA_FRONT_PORT:-13000}"

declare -a NAMES=() RESULTS=()
record() { NAMES+=("$1"); RESULTS+=("$2"); }

git fetch origin main --quiet || { echo "No se pudo traer origin/main" >&2; exit 2; }

if [[ "$REF" =~ ^[0-9]+$ ]]; then
  ID="pr$REF"
  INFO=$(gh pr view "$REF" --json title,headRefName,headRefOid,state \
    --jq '[.title, .headRefName, .headRefOid, .state] | @tsv') || exit 2
  IFS=$'\t' read -r TITLE BRANCH SHA STATE <<<"$INFO"
  git fetch origin "pull/$REF/head" --quiet || exit 2
  echo "PR $REF ($STATE): $TITLE"
  echo "Rama $BRANCH en ${SHA:0:7}"

  # Mismas expresiones que .github/workflows/convenciones.yml
  title_pattern='^(feat|fix|spec|docs|test|refactor|perf|build|ci|chore|revert)\((antena|eco|balanza|atlas|faro|contratos|repo)\)!?: [^ ].{0,71}$'
  branch_pattern='^(antena|eco|balanza|atlas|faro|contratos|repo)/[a-z0-9._-]+$'
  if [[ "$TITLE" =~ $title_pattern ]]; then record "titulo" OK; else record "titulo" FALLO; fi
  if [[ "$BRANCH" =~ $branch_pattern ]]; then record "rama" OK; else record "rama" FALLO; fi
  MERGE_MAIN=1
else
  ID=$(printf '%s' "$REF" | tr -c 'a-zA-Z0-9' '-')
  git fetch origin "$REF" --quiet || exit 2
  SHA=$(git rev-parse FETCH_HEAD)
  echo "Rama $REF en ${SHA:0:7}"
  MERGE_MAIN=0
  [[ "$REF" == main ]] || MERGE_MAIN=1
fi

# Ruta C:/... en Windows: la entienden igual bash, git y docker.
WORK=$(winpath "$(mktemp -d)")
WT="$WORK/wt"
# Los registros quedan fuera del worktree, que se borra al terminar.
LOGS="$(dirname "$WORK")/verifica-$ID-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$LOGS"
PROJECT="verifica-$(printf '%s' "$ID" | tr 'A-Z' 'a-z')"

cleanup() {
  if [[ $SMOKE -eq 1 && -f "$WORK/override.yml" ]]; then
    docker compose -p "$PROJECT" -f "$(winpath "$WT")/docker-compose.yml" -f "$(winpath "$WORK")/override.yml" \
      down -v --remove-orphans --rmi local >/dev/null 2>&1
  fi
  git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1
  rm -rf "$WORK"
}
trap cleanup EXIT

git worktree add --detach --quiet "$WT" "$SHA" || exit 2

# La CI de pull_request prueba el commit de fusión con main, no la rama sola.
if [[ $MERGE_MAIN -eq 1 ]]; then
  if git -C "$WT" -c user.name=verifica -c user.email=verifica@localhost \
      merge --no-edit --quiet origin/main >"$LOGS/merge.log" 2>&1; then
    record "fusion-con-main" OK
  else
    record "fusion-con-main" FALLO
    echo "La rama no se fusiona limpia con main; ver $LOGS/merge.log"
  fi
fi

WTW=$(winpath "$WT")

# 2. Pruebas de cada servicio, en paralelo, en python:3.11 como la CI.
echo "Pruebas de servicios..."
declare -A PIDS=()
for dir in "$WT"/services/*/; do
  s=$(basename "$dir")
  [[ -f "$dir/pyproject.toml" ]] || continue
  # python:3.11 completa: la -slim no trae libexpat, que necesita rasterio.
  MSYS_NO_PATHCONV=1 docker run --rm -v "$WTW:/src" -v nisar-verifica-pip:/root/.cache/pip \
    -w "/src/services/$s" python:3.11 \
    bash -c 'pip install -q --root-user-action=ignore -e ".[dev]" && pytest -q' \
    >"$LOGS/test-$s.log" 2>&1 &
  PIDS[$s]=$!
done
for s in $(printf '%s\n' "${!PIDS[@]}" | sort); do
  if wait "${PIDS[$s]}"; then record "test ($s)" OK; else record "test ($s)" FALLO; fi
done

# Extra, la CI no lo hace: lint y vitest del frontend.
if [[ $FRONT -eq 1 && -f "$WT/frontend/package.json" ]]; then
  echo "Frontend (lint y vitest)..."
  # Se copia frontend/ y contracts/ (las pruebas de tipos leen ../contracts) al disco del contenedor:
  # con node_modules en un volumen montado desde Windows, vitest no llega a arrancar sus workers.
  if MSYS_NO_PATHCONV=1 docker run --rm -v "$WTW:/src:ro" -v nisar-verifica-npm:/root/.npm node:22-alpine \
      sh -c 'mkdir /w && cp -r /src/contracts /w/ && tar -C /src -cf - --exclude=frontend/node_modules frontend | tar -C /w -xf - \
             && cd /w/frontend && npm ci --no-audit --no-fund --loglevel=error && npm run lint && npm test' \
      >"$LOGS/frontend.log" 2>&1; then
    record "frontend (extra)" OK
  else
    record "frontend (extra)" FALLO
  fi
fi

# 3. Pila completa con datos sintéticos y prueba de humo.
if [[ $SMOKE -eq 1 ]]; then
  echo "Pila de prueba en http://localhost:$SMOKE_PORT y prueba de humo..."
  cat >"$WORK/override.yml" <<EOF
services:
  gateway:
    ports: !override
      - "$SMOKE_PORT:80"
  frontend:
    ports: !override
      - "$FRONT_PORT:80"
EOF
  COMPOSE=(docker compose -p "$PROJECT" -f "$WTW/docker-compose.yml" -f "$(winpath "$WORK")/override.yml")
  if MSYS_NO_PATHCONV=1 "${COMPOSE[@]}" up -d --build >"$LOGS/compose-up.log" 2>&1 \
     && BASE="http://localhost:$SMOKE_PORT" bash "$WT/scripts/smoke.sh" >"$LOGS/smoke.log" 2>&1; then
    record "smoke" OK
  else
    record "smoke" FALLO
    "${COMPOSE[@]}" logs --no-color >"$LOGS/compose-logs.log" 2>&1
  fi
fi

# Resumen
echo
echo "Resultado para ${REF} (${SHA:0:7}):"
status=0
for i in "${!NAMES[@]}"; do
  printf '  %-20s %s\n' "${NAMES[$i]}" "${RESULTS[$i]}"
  [[ "${RESULTS[$i]}" == OK ]] || status=1
done
echo "Registros: $LOGS"
if [[ $status -eq 0 ]]; then echo "TODO EN VERDE"; else echo "HAY FALLOS"; fi
exit $status
