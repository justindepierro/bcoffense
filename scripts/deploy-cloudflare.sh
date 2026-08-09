#!/usr/bin/env bash
# Deploy only the public app assets plus Pages Functions.
# Do not deploy the repo root; it can include local-only files such as .dev.vars.
set -euo pipefail

cd "$(dirname "$0")/.."

# Release-quality executes application tests and browser tooling. Preserve
# locally configured Wrangler credentials, but do not let Cloudflare CI
# credentials flow into those child processes. They are restored only after
# the mandatory quality gate succeeds, immediately before Cloudflare commands
# need them.
cloudflare_account_id="${CLOUDFLARE_ACCOUNT_ID:-}"
cloudflare_api_token="${CLOUDFLARE_API_TOKEN:-}"
unset CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN

# Production is only allowed to receive the exact, clean commit currently at
# origin/main. This script deliberately never stages, commits, or pushes.
if [[ "$(git branch --show-current)" != "main" && "${GITHUB_REF:-}" != "refs/heads/main" ]]; then
  printf 'Production deployment refused: check out main first.\n' >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  printf 'Production deployment refused: working tree is not clean.\n' >&2
  exit 1
fi
git fetch --quiet origin main
head_commit="$(git rev-parse HEAD)"
main_commit="$(git rev-parse origin/main)"
if [[ "$head_commit" != "$main_commit" ]]; then
  printf 'Production deployment refused: HEAD (%s) is not exact origin/main (%s).\n' "$head_commit" "$main_commit" >&2
  exit 1
fi

# Keep deployment blocked until the same full quality suite used by CI passes.
./scripts/release-quality-gate.sh

# Restore explicitly supplied CI credentials only after untrusted quality-test
# processes have completed. When these were not supplied (for example a local
# Wrangler login), leave the environment untouched so Wrangler can use its
# normal authenticated profile.
if [[ -n "$cloudflare_account_id" ]]; then
  export CLOUDFLARE_ACCOUNT_ID="$cloudflare_account_id"
fi
if [[ -n "$cloudflare_api_token" ]]; then
  export CLOUDFLARE_API_TOKEN="$cloudflare_api_token"
fi

# Pages Functions can reference tables introduced by the same release. Confirm
# the remote schema is current before staging or uploading any Pages assets.
# The preflight is read-only and refuses to apply migrations on its own.
./scripts/cloudflare-preflight.sh

# Pin the deployment CLI so its production behavior cannot drift with a global
# install. `npx` caches the package between invocations on CI runners.
WRANGLER=(npx --yes wrangler@4.112.0)

# The workspace revision route needs both a signing key and an explicit
# primary-team value for static staff sessions. Without the latter, a cold
# Pages Function falls back to D1 just to identify its team; a transient D1
# lookup can then surface as a misleading /workspace/revision 503. Values are
# never read or printed here—this guard verifies only that production has the
# encrypted secret bindings required by the deployed Function.
required_pages_secrets=(AUTH_SESSION_SECRET AUTH_PRIMARY_TEAM_ID)
pages_secrets="$("${WRANGLER[@]}" pages secret list --project-name bcoffense)"
for required_secret in "${required_pages_secrets[@]}"; do
  if ! grep -Fq -- "- ${required_secret}:" <<<"$pages_secrets"; then
    printf 'Missing required production Pages secret: %s\n' "$required_secret" >&2
    exit 1
  fi
done

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

mkdir -p "$tmpdir/public"
rsync -a index.html manifest.json sw.js offline.html _routes.json _headers css js icons functions "$tmpdir/public/"

# These placeholders overwrite any previously cached root-level files from
# accidental root deployments.
printf 'Not available\n' > "$tmpdir/public/.dev.vars"
printf 'Not available\n' > "$tmpdir/public/AGENTS.md"
printf 'Not available\n' > "$tmpdir/public/wrangler.toml"

commit_hash="$head_commit"
commit_message="$(git log -1 --pretty=%s)"

"${WRANGLER[@]}" pages deploy "$tmpdir/public" \
  --project-name bcoffense \
  --branch main \
  --commit-hash "$commit_hash" \
  --commit-message "$commit_message"

expected_source="${commit_hash:0:7}"
deployed_source=""

for attempt in {1..20}; do
  deployments="$(
    "${WRANGLER[@]}" pages deployment list \
      --project-name bcoffense \
      --environment production \
      --json
  )"
  deployed_source="$(
    node -e '
      const deployments = JSON.parse(process.argv[1]);
      process.stdout.write(deployments[0]?.Source || "");
    ' "$deployments"
  )"

  if [[ "$deployed_source" == "$expected_source" ]]; then
    printf 'Verified Cloudflare production source: %s\n' "$deployed_source"
    exit 0
  fi

  if (( attempt < 20 )); then
    sleep 2
  fi
done

printf 'Cloudflare production source is %s; expected %s\n' \
  "${deployed_source:-unknown}" \
  "$expected_source" >&2
exit 1
