#!/usr/bin/env sh
# V0.4-B local infrastructure checks only.
# Verifies Docker services are reachable — does not wire app code.

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT_DIR"

COMPOSE=${COMPOSE:-"docker compose"}

echo "== docker compose ps =="
$COMPOSE ps

echo
echo "== PostgreSQL =="
$COMPOSE exec -T postgres pg_isready
$COMPOSE exec -T postgres psql -U "${POSTGRES_USER:-akb}" -d "${POSTGRES_DB:-ai_knowledge_base}" -c "SELECT version();"
$COMPOSE exec -T postgres psql -U "${POSTGRES_USER:-akb}" -d "${POSTGRES_DB:-ai_knowledge_base}" -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"
$COMPOSE exec -T postgres psql -U "${POSTGRES_USER:-akb}" -d "${POSTGRES_DB:-ai_knowledge_base}" -c "SELECT '[1,2,3]'::vector;"

echo
echo "== Redis =="
PONG=$($COMPOSE exec -T redis redis-cli ping | tr -d '\r')
echo "PING -> $PONG"
if [ "$PONG" != "PONG" ]; then
  echo "Redis healthcheck FAILED"
  exit 1
fi

echo
echo "== MinIO =="
API_PORT=${MINIO_API_PORT:-9000}
CONSOLE_PORT=${MINIO_CONSOLE_PORT:-9001}
if command -v curl >/dev/null 2>&1; then
  curl -fsS -o /dev/null -w "S3 API http://127.0.0.1:${API_PORT} -> %{http_code}\n" "http://127.0.0.1:${API_PORT}/minio/health/live" || true
  curl -fsS -o /dev/null -w "Console http://127.0.0.1:${CONSOLE_PORT} -> %{http_code}\n" "http://127.0.0.1:${CONSOLE_PORT}/" || true
fi
$COMPOSE run --rm minio-init

echo
echo "Infrastructure checks completed."
