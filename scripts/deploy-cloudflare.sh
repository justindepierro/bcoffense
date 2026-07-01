#!/usr/bin/env bash
# Deploy only the public app assets plus Pages Functions.
# Do not deploy the repo root; it can include local-only files such as .dev.vars.
set -euo pipefail

cd "$(dirname "$0")/.."

# Use globally-installed wrangler directly (faster than npx)
WRANGLER="$(which wrangler 2>/dev/null || echo "npx wrangler")"

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

mkdir -p "$tmpdir/public"
rsync -a index.html manifest.json sw.js offline.html _routes.json css js icons functions "$tmpdir/public/"

# These placeholders overwrite any previously cached root-level files from
# accidental root deployments.
printf 'Not available\n' > "$tmpdir/public/.dev.vars"
printf 'Not available\n' > "$tmpdir/public/AGENTS.md"
printf 'Not available\n' > "$tmpdir/public/wrangler.toml"

commit_hash="$(git rev-parse HEAD)"
commit_message="$(git log -1 --pretty=%s)"

$WRANGLER pages deploy "$tmpdir/public" \
  --project-name bcoffense \
  --branch main \
  --commit-hash "$commit_hash" \
  --commit-message "$commit_message"

expected_source="${commit_hash:0:7}"
deployed_source=""

for attempt in {1..20}; do
  deployments="$(
    $WRANGLER pages deployment list \
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
