#!/usr/bin/env bash
# Deploy only the dedicated notification-delivery Worker. Pages stays on its
# own guarded deployment path and never receives this Worker-specific token.
set -euo pipefail

cd "$(dirname "$0")/.."

# Keep Cloudflare credentials out of release-quality tests and dependency
# processes. The dedicated Worker token is deliberately mapped to Wrangler's
# standard variable only after the mandatory quality gate completes. A local
# Wrangler OAuth session remains available when no environment token is set.
cloudflare_account_id="${CLOUDFLARE_ACCOUNT_ID:-}"
notification_worker_api_token="${CLOUDFLARE_NOTIFICATION_WORKER_API_TOKEN:-}"
# These lowercase shell variables normally are not exported, but explicitly
# clear a hypothetical inherited export attribute before invoking any tests.
export -n cloudflare_account_id notification_worker_api_token
unset CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN CLOUDFLARE_NOTIFICATION_WORKER_API_TOKEN

# Production can receive only the exact, clean commit currently at origin/main.
# This script deliberately never stages, commits, pushes, creates queues, or
# applies migrations.
if [[ "$(git branch --show-current)" != "main" && "${GITHUB_REF:-}" != "refs/heads/main" ]]; then
  printf 'Notification Worker deployment refused: check out main first.\n' >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  printf 'Notification Worker deployment refused: working tree is not clean.\n' >&2
  exit 1
fi
git fetch --quiet origin main
head_commit="$(git rev-parse HEAD)"
main_commit="$(git rev-parse origin/main)"
if [[ "$head_commit" != "$main_commit" ]]; then
  printf 'Notification Worker deployment refused: HEAD (%s) is not exact origin/main (%s).\n' "$head_commit" "$main_commit" >&2
  exit 1
fi

# Keep this gate before credentials are restored. It runs unit, smoke, and
# browser-quality checks without any Cloudflare token in its child environment.
./scripts/release-quality-gate.sh

# Restore only the dedicated Worker credentials after quality succeeds. Do not
# re-export an inherited CLOUDFLARE_API_TOKEN: it may have broader Pages scope.
if [[ -n "$cloudflare_account_id" ]]; then
  export CLOUDFLARE_ACCOUNT_ID="$cloudflare_account_id"
fi
if [[ -n "$notification_worker_api_token" ]]; then
  export CLOUDFLARE_API_TOKEN="$notification_worker_api_token"
fi

# The shared preflight is read-only. It refuses to deploy if the D1 migration
# ledger or critical schema differs from this exact checkout.
./scripts/cloudflare-preflight.sh

# Pin the release CLI so secret verification and Worker deployment cannot drift
# with a globally installed Wrangler version.
WRANGLER=(npx --yes wrangler@4.112.0)
WORKER_CONFIG="wrangler.notifications.toml"
if [[ ! -f "$WORKER_CONFIG" ]]; then
  printf 'Notification Worker deployment refused: missing %s.\n' "$WORKER_CONFIG" >&2
  exit 1
fi

# Verify names only: Wrangler returns secret metadata, never values. The
# secrets must already exist because the outbox Worker must use the current
# Pages VAPID key pair rather than rotating player subscriptions during deploy.
required_worker_secrets=(VAPID_PRIVATE_KEY VAPID_PUBLIC_KEY VAPID_SUBJECT)
if ! worker_secrets_json="$(NO_COLOR=1 "${WRANGLER[@]}" secret list --config "$WORKER_CONFIG" --format json)"; then
  printf 'Could not list Notification Worker secret names. Bootstrap the Worker secrets first; no deploy was attempted.\n' >&2
  exit 1
fi
if ! missing_worker_secrets="$(printf '%s' "$worker_secrets_json" | node -e '
  const fs = require("fs");
  const required = process.argv.slice(1);
  const rows = JSON.parse(fs.readFileSync(0, "utf8"));
  const names = new Set(Array.isArray(rows)
    ? rows.map((row) => typeof row?.name === "string" ? row.name : "")
    : []);
  for (const name of required) {
    if (!names.has(name)) process.stdout.write(`${name}\n`);
  }
' "${required_worker_secrets[@]}")"; then
  printf 'Could not parse Notification Worker secret metadata. No deploy was attempted.\n' >&2
  exit 1
fi
if [[ -n "$missing_worker_secrets" ]]; then
  printf 'Missing required Notification Worker secret name(s): %s\n' \
    "$(tr '\n' ' ' <<<"$missing_worker_secrets")" >&2
  printf 'Set the existing VAPID values on the Worker, then retry. No deploy was attempted.\n' >&2
  exit 1
fi

"${WRANGLER[@]}" deploy --config "$WORKER_CONFIG"
