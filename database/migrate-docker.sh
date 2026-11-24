#!/usr/bin/env bash
# Apply database/*.sql and database/migrations/*.sql via docker compose postgres.
# Skips a file if it is already recorded in schema_migrations (rerun-safe).
# Usage (from repo root): ./database/migrate-docker.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
cd "$REPO_ROOT"

PSQL=(docker compose exec -T postgres psql -U dataplier -d dataplier -v ON_ERROR_STOP=1)

sql_escape() {
  printf '%s' "$1" | sed "s/'/''/g"
}

migration_applied() {
  local bn="$1"
  local esc
  esc="$(sql_escape "$bn")"
  local cnt
  cnt="$("${PSQL[@]}" -tAc "SELECT COUNT(*) FROM schema_migrations WHERE filename = '$esc';" | tr -d '[:space:]')"
  [[ "${cnt:-0}" != "0" ]]
}

record_migration() {
  local bn="$1"
  local esc
  esc="$(sql_escape "$bn")"
  "${PSQL[@]}" -c "INSERT INTO schema_migrations (filename) VALUES ('$esc') ON CONFLICT (filename) DO NOTHING;"
}

ensure_migrations_table() {
  "${PSQL[@]}" -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);"
}

collect_sql_files() {
  local f
  [[ -f "$ROOT/schema.sql" ]] && printf '%s\n' "$ROOT/schema.sql"
  [[ -f "$ROOT/seed.sql" ]] && printf '%s\n' "$ROOT/seed.sql"
  shopt -s nullglob
  # Sort all versioned SQL by basename so migrations/001_*.sql runs before 003-*.sql.
  for f in "$ROOT"/[0-9][0-9][0-9]-*.sql "$ROOT"/migrations/*.sql; do
    [[ -f "$f" ]] || continue
    printf '%s\t%s\n' "$(basename "$f")" "$f"
  done | LC_ALL=C sort -k1,1 -u | cut -f2-
  shopt -u nullglob
}

files=()
while IFS= read -r line; do
  [[ -n "${line:-}" ]] && files+=("$line")
done < <(collect_sql_files)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No .sql files found under $ROOT or $ROOT/migrations/"
  exit 0
fi

echo "Ensuring schema_migrations table exists ..."
ensure_migrations_table

for f in "${files[@]}"; do
  bn="$(basename "$f")"
  if migration_applied "$bn"; then
    echo "Skipping $bn (already applied — present in schema_migrations)."
    continue
  fi
  echo "Applying $bn ..."
  "${PSQL[@]}" -f - <"$f"
  record_migration "$bn"
done

echo "Migrations finished."
