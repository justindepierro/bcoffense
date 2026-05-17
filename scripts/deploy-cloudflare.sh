#!/usr/bin/env bash
# Deploy only the public app assets plus Pages Functions.
# Do not deploy the repo root; it can include local-only files such as .dev.vars.
set -euo pipefail

cd "$(dirname "$0")/.."

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

mkdir -p "$tmpdir/public"
rsync -a index.html manifest.json sw.js offline.html _routes.json css js icons "$tmpdir/public/"

# These placeholders overwrite any previously cached root-level files from
# accidental root deployments.
printf 'Not available\n' > "$tmpdir/public/.dev.vars"
printf 'Not available\n' > "$tmpdir/public/AGENTS.md"
printf 'Not available\n' > "$tmpdir/public/wrangler.toml"

commit_hash="$(git rev-parse HEAD)"
commit_message="$(git log -1 --pretty=%s)"

npx wrangler pages deploy "$tmpdir/public" \
  --project-name bcoffense \
  --branch main \
  --commit-hash "$commit_hash" \
  --commit-message "$commit_message"
