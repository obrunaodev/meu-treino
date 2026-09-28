#!/bin/sh
set -eu

image=${1:-meu-treino-minio:2025-04-22}
container="treino-minio-smoke-$$"
docker run -d --name "$container" \
  -e MINIO_ROOT_USER=treino \
  -e MINIO_ROOT_PASSWORD=smoke-test-password \
  "$image" server /data >/dev/null
trap 'docker rm -f "$container" >/dev/null' EXIT INT TERM

attempt=0
until docker exec "$container" mc alias set smoke http://127.0.0.1:9000 \
  treino smoke-test-password >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    docker logs "$container"
    exit 1
  fi
  sleep 1
done

# Exercise the same bundled client, private bucket and readiness used by Compose.
docker exec "$container" mc ready local
docker exec "$container" mc mb smoke/treino-media
docker exec "$container" mc anonymous set none smoke/treino-media
printf 'image-smoke-test' | docker exec -i "$container" mc pipe smoke/treino-media/probe
test "$(docker exec "$container" mc cat smoke/treino-media/probe)" = image-smoke-test
echo 'MinIO image: readiness, private bucket and object round trip passed'
