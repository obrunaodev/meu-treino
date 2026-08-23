#!/bin/sh
set -eu

APP_DIR=${APP_DIR:-/opt/meu-treino}
TAG=${1:-}
LOCK_DIR="$APP_DIR/.deploy-lock"
PREVIOUS_FILE="$APP_DIR/.deploy-tag"

case "$TAG" in
  ''|*[!0-9a-f]*) echo "tag de imagem inválida" >&2; exit 2 ;;
esac

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "outro deploy está em andamento" >&2
  exit 3
fi
trap 'rmdir "$LOCK_DIR"' EXIT INT TERM

cd "$APP_DIR"
previous=$(test -f "$PREVIOUS_FILE" && sed -n '1p' "$PREVIOUS_FILE" || true)

compose() {
  image_tag=$1
  shift
  IMAGE_TAG="$image_tag" docker compose --env-file .env --profile prod "$@"
}

healthy() {
  site_address=$(sed -n 's/^SITE_ADDRESS=//p' .env | tail -n 1)
  test -n "$site_address" \
    && compose "$1" ps --format json api | grep -q '"Health":"healthy"' \
    && compose "$1" ps --status running --services | grep -qx web \
    && curl --fail --silent --show-error --retry 12 --retry-delay 5 \
      "https://${site_address}/health" >/dev/null
}

rollback() {
  test -n "$previous" || return 0
  echo "health check falhou; voltando para $previous" >&2
  compose "$previous" up -d --no-build api whatsapp-bot web proxy
}

# Banco e objeto sobem antes da migration; `--wait` respeita os healthchecks.
compose "$TAG" up -d --no-build --wait db minio
compose "$TAG" run --rm minio-init
compose "$TAG" run --rm --no-deps api node dist/src/db/migrate.js
compose "$TAG" run --rm --no-deps api node dist/scripts/import-catalog.js

if ! compose "$TAG" up -d --no-build --remove-orphans api whatsapp-bot web proxy; then
  rollback
  exit 1
fi

if ! healthy "$TAG"; then
  rollback
  exit 1
fi

printf '%s\n' "$TAG" > "$PREVIOUS_FILE"
echo "deploy $TAG concluído"
