#!/usr/bin/env bash
# Production deployment wrapper. It deploys only a clean, already-pushed main
# commit; it never stages, commits, or pushes code.
#
# Usage:
#   ./ship.sh                                  — verify and deploy exact origin/main
#
set -euo pipefail
cd "$(dirname "$0")"

if (( $# != 0 )); then
  echo "Usage: ./ship.sh"
  echo "Commit and push your reviewed change to main before deploying."
  exit 1
fi

START=$(date +%s)

# ── Deploy ────────────────────────────────────────────────────────────────────
echo "→ Verifying and deploying exact origin/main..."
./scripts/deploy-cloudflare.sh

END=$(date +%s)
echo "✓ Total time: $((END - START))s"
