#!/usr/bin/env bash
# Apply SQL files in database/migrations/ in sorted order (idempotent statements).
# Usage: POSTGRES_URL=postgres://user:pass@host:5432/dbname?sslmode=disable ./database/apply_migrations.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
export PG="${POSTGRES_URL:-postgres://dataplier:dataplier@localhost:5432/dataplier?sslmode=disable}"

shopt -s nullglob
for f in "$ROOT"/migrations/*.sql; do
  echo "Applying $(basename "$f") ..."
  psql "$PG" -v ON_ERROR_STOP=1 -f "$f"
done
echo "Migrations finished."
