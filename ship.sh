#!/usr/bin/env bash
# One-command dev workflow: [bump SW] → stage → commit → push GitHub → deploy Cloudflare
#
# Usage:
#   ./ship.sh "feat: add something"           — commit + push + deploy (no SW bump)
#   ./ship.sh --bump "feat: add something"    — bump SW first, then commit + push + deploy
#   ./ship.sh --bump-only                     — bump SW only, no commit/deploy
#
# When --bump is used, the SW version is auto-incremented and the commit message
# is updated to include "(SW vN)" if not already present.

set -euo pipefail
cd "$(dirname "$0")"

BUMP=false
BUMP_ONLY=false
MSG=""

# ── Parse args ────────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --bump)      BUMP=true ;;
    --bump-only) BUMP_ONLY=true ;;
    *)           MSG="$arg" ;;
  esac
done

if [[ "$BUMP_ONLY" == "true" ]]; then
  ./bump-version.sh
  echo "Done. Run ./ship.sh \"<message>\" to commit and deploy."
  exit 0
fi

if [[ -z "$MSG" ]]; then
  echo "Usage: ./ship.sh [--bump] \"commit message\""
  echo "       ./ship.sh --bump-only"
  exit 1
fi

START=$(date +%s)

# ── Pre-flight hardening gate ─────────────────────────────────────────────────
# Fail fast on the regression classes we keep re-introducing (duplicate global
# functions, panel transform trap, <details> toolbar dropdowns). Runs strict:
# any strict finding aborts the ship. Skip with SKIP_AUDIT=1 for docs-only ships.
if [[ "${SKIP_AUDIT:-0}" != "1" ]]; then
  if [[ -x scripts/static-ui-audit.sh ]]; then
    echo "→ Running hardening audit (strict gate)..."
    if ! scripts/static-ui-audit.sh >/tmp/bc-audit.log 2>&1; then
      echo "✗ Hardening audit found STRICT issues — aborting ship."
      echo "  (Set SKIP_AUDIT=1 to override for docs-only changes.)"
      grep -E "^\[strict\]|duplicate:|declares a trapping|toolbar dropdown" /tmp/bc-audit.log | head -40
      exit 1
    fi
    echo "→ Hardening audit passed (no strict issues)."
  fi
fi

# ── Bump SW version if requested ──────────────────────────────────────────────
if [[ "$BUMP" == "true" ]]; then
  CURRENT=$(grep -oE 'bcoffense-v[0-9]+' sw.js | head -1 | sed 's/bcoffense-v//')
  NEXT=$((CURRENT + 1))
  ./bump-version.sh
  # Append (SW vN) to message if not already there
  if [[ "$MSG" != *"SW v"* ]]; then
    MSG="${MSG} (SW v${NEXT})"
  fi
  echo "→ SW bumped: v${CURRENT} → v${NEXT}"
fi

# ── Stage + commit ─────────────────────────────────────────────────────────────
git add -A
if git diff --cached --quiet; then
  echo "→ Nothing to commit — deploying current HEAD"
else
  git commit -m "$MSG"
  echo "→ Committed: $MSG"
fi

# ── Push to GitHub ────────────────────────────────────────────────────────────
echo "→ Pushing to GitHub..."
git push origin main
echo "→ GitHub up to date"

# ── Deploy to Cloudflare ──────────────────────────────────────────────────────
echo "→ Deploying to Cloudflare..."
./scripts/deploy-cloudflare.sh

END=$(date +%s)
echo "✓ Total time: $((END - START))s"
