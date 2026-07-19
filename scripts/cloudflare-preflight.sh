#!/usr/bin/env bash
# Refuse a Pages deployment if the remote D1 migration ledger and this checkout
# disagree. This script intentionally performs only a SELECT; it never applies
# migrations or creates the d1_migrations tracking table as a side effect.
set -euo pipefail

cd "$(dirname "$0")/.."

DATABASE_NAME="${BCOFFENSE_D1_DATABASE:-bcoffense-db}"
MIGRATIONS_DIR="${BCOFFENSE_MIGRATIONS_DIR:-migrations}"
MIGRATIONS_TABLE="d1_migrations"

fail() {
  printf 'Cloudflare deployment preflight: %s\n' "$*" >&2
  exit 1
}

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  fail "local migrations directory was not found: $MIGRATIONS_DIR"
fi

if command -v wrangler >/dev/null 2>&1; then
  WRANGLER=(wrangler)
elif command -v npx >/dev/null 2>&1; then
  WRANGLER=(npx wrangler)
else
  fail "Wrangler v4 is required. Install it, authenticate, then rerun the deploy."
fi

if ! wrangler_version="$("${WRANGLER[@]}" --version 2>/dev/null)"; then
  fail "could not run Wrangler. Install Wrangler v4 and authenticate before deploying."
fi

if [[ ! "$wrangler_version" =~ ^4\. ]]; then
  fail "Wrangler v4 is required (found ${wrangler_version:-unknown})."
fi

local_migrations=()
while IFS= read -r migration_path; do
  local_migrations+=("${migration_path##*/}")
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' -print | LC_ALL=C sort)

if (( ${#local_migrations[@]} == 0 )); then
  fail "no local .sql migrations were found in $MIGRATIONS_DIR."
fi

printf 'Checking remote D1 migration ledger for %s…\n' "$DATABASE_NAME"

# Do not use `wrangler d1 migrations list` here: Wrangler initializes the
# migration ledger before listing it. A direct SELECT keeps the deployment
# guard read-only and fails closed if the ledger is missing or inaccessible.
if ! remote_ledger_json="$(NO_COLOR=1 "${WRANGLER[@]}" d1 execute "$DATABASE_NAME" --remote --json \
  --command "SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY id;")"; then
  printf '\n' >&2
  fail "could not read the remote migration ledger. No Pages deployment was attempted. Check Cloudflare authentication, the D1 binding, and the database name."
fi

if ! remote_migrations="$(printf '%s' "$remote_ledger_json" | node -e '
  const fs = require("fs");
  const response = JSON.parse(fs.readFileSync(0, "utf8"));
  const rows = Array.isArray(response)
    ? response.flatMap((result) => Array.isArray(result?.results) ? result.results : [])
    : [];
  for (const row of rows) {
    if (typeof row?.name === "string" && row.name) process.stdout.write(`${row.name}\n`);
  }
')"; then
  fail "could not parse the remote migration ledger. No Pages deployment was attempted."
fi

array_contains() {
  local expected="$1"
  shift
  local candidate
  for candidate in "$@"; do
    [[ "$candidate" == "$expected" ]] && return 0
  done
  return 1
}

join_with() {
  local separator="$1"
  shift
  local output=""
  local item
  for item in "$@"; do
    [[ -n "$output" ]] && output+="$separator"
    output+="$item"
  done
  printf '%s' "$output"
}

remote_migration_names=()
while IFS= read -r migration; do
  if [[ -n "$migration" ]] && ! array_contains "$migration" "${remote_migration_names[@]:-}"; then
    remote_migration_names+=("$migration")
  fi
done <<< "$remote_migrations"

pending_migrations=()
for migration in "${local_migrations[@]}"; do
  if ! array_contains "$migration" "${remote_migration_names[@]:-}"; then
    pending_migrations+=("$migration")
  fi
done

unexpected_remote_migrations=()
for migration in "${remote_migration_names[@]:-}"; do
  [[ -z "$migration" ]] && continue
  if ! array_contains "$migration" "${local_migrations[@]}"; then
    unexpected_remote_migrations+=("$migration")
  fi
done

if (( ${#unexpected_remote_migrations[@]} > 0 )); then
  printf '\nPages deployment stopped: remote D1 migration history does not match this checkout.\n' >&2
  printf 'Remote-only migration(s): %s\n' "$(join_with ', ' "${unexpected_remote_migrations[@]}")" >&2
  printf 'Restore the missing migration file(s) or deploy from the checkout that owns them.\n' >&2
  exit 1
fi

if (( ${#pending_migrations[@]} > 0 )); then
  printf '\nPages deployment stopped: %s has unapplied D1 migration(s).\n' "$DATABASE_NAME" >&2
  printf 'Pending: %s\n' "$(join_with ', ' "${pending_migrations[@]}")" >&2
  printf '\nReview the SQL, back up if appropriate, then intentionally apply it with:\n' >&2
  printf '  %s d1 migrations apply %q --remote\n' "${WRANGLER[*]}" "$DATABASE_NAME" >&2
  printf '\nRerun ./scripts/deploy-cloudflare.sh after the migration command succeeds.\n' >&2
  exit 1
fi

printf 'D1 migration preflight passed: %s remote migration(s) match %s local file(s).\n' \
  "${#remote_migration_names[@]}" "${#local_migrations[@]}"
