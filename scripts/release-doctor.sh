#!/usr/bin/env bash
# Release doctor: one command that auto-fixes the mechanical release blockers
# and runs every LOCAL gate, then prints a deploy-readiness report plus the
# exact remaining manual production steps.
#
# It deliberately NEVER commits, pushes, bumps the SW on its own, applies
# migrations, creates queues, enters secrets, or deploys. Those steps require
# human review and production credentials, and the existing guard scripts own
# them (deploy-cloudflare.sh, deploy-notification-worker.sh).
#
# Usage:
#   ./scripts/release-doctor.sh           # auto-fix safe issues, run all checks
#   ./scripts/release-doctor.sh --check   # report only; do not modify any files
#   ./scripts/release-doctor.sh --fast    # skip the browser hydration e2e gate
set -uo pipefail
cd "$(dirname "$0")/.."

MODE="fix"
RUN_E2E=1
for arg in "$@"; do
  case "$arg" in
    --check) MODE="check" ;;
    --fast) RUN_E2E=0 ;;
    -h|--help)
      grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) printf 'Unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

FIX_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

section() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
ok()    { printf '  \033[32m ok \033[0m %s\n' "$1"; }
warn()  { printf '  \033[33mwarn\033[0m %s\n' "$1"; WARN_COUNT=$((WARN_COUNT + 1)); }
fail()  { printf '  \033[31mfail\033[0m %s\n' "$1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
fixed() { printf '  \033[36mfix \033[0m %s\n' "$1"; FIX_COUNT=$((FIX_COUNT + 1)); }

# ── 1. Service worker <-> index.html cache-buster sync ────────────────────────
# The smoke gate hard-fails when index.html ?v= stamps do not match the SW
# CACHE_NAME. This is the single most common "why won't it deploy" blocker, so
# fix it automatically toward whatever sw.js currently declares.
section "Service worker / index.html version sync"
sw_version="$(grep -oE 'bcoffense-v[0-9]+' sw.js | head -1 | sed 's/bcoffense-v//')"
if [[ -z "$sw_version" ]]; then
  fail "could not read CACHE_NAME from sw.js"
else
  stray="$(grep -oE '\?v=[0-9]+' index.html | sort -u | grep -vx "?v=${sw_version}" || true)"
  if [[ -z "$stray" ]]; then
    ok "index.html asset stamps all match SW v${sw_version}"
  elif [[ "$MODE" == "fix" ]]; then
    python3 - "$sw_version" <<'PY'
import re, sys, pathlib
v = sys.argv[1]
p = pathlib.Path("index.html")
s = p.read_text()
s = re.sub(r'(src=")(js/[^"?]+\.js)(\?v=\d+)?(")', rf'\1\2?v={v}\4', s)
s = re.sub(r'(href=")(css/[^"?]+\.css)(\?v=\d+)?(")', rf'\1\2?v={v}\4', s)
p.write_text(s)
PY
    fixed "restamped index.html asset versions to SW v${sw_version}"
  else
    fail "index.html has stamps not matching SW v${sw_version}: $(echo "$stray" | tr '\n' ' ')"
  fi
fi

# ── 2. Cached assets changed but SW not bumped (advisory) ─────────────────────
# If frontend assets changed versus origin/main but CACHE_NAME did not, players
# may keep stale code. This needs judgment + a commit, so warn rather than fix.
section "Cached-asset / SW bump advisory"
if git rev-parse --verify --quiet origin/main >/dev/null; then
  asset_changes="$(git diff --name-only origin/main...HEAD 2>/dev/null | grep -E '\.(css|js|html)$' | grep -vE '^sw\.js$' || true)"
  sw_changed="$(git diff --name-only origin/main...HEAD 2>/dev/null | grep -xE 'sw\.js' || true)"
  if [[ -n "$asset_changes" && -z "$sw_changed" ]]; then
    warn "cached assets changed vs origin/main but sw.js was not bumped — run ./bump-version.sh, then re-run this doctor"
  else
    ok "SW bump state is consistent with cached-asset changes"
  fi
else
  warn "origin/main not found locally; run 'git fetch origin main' for the SW-bump advisory"
fi

# ── 3. Syntax check changed JS/MJS ────────────────────────────────────────────
section "JavaScript syntax check (changed files)"
changed_js=()
while IFS= read -r line; do
  [[ -n "$line" ]] && changed_js+=("$line")
done < <(
  {
    git diff --name-only origin/main...HEAD 2>/dev/null
    git diff --name-only
    git ls-files --others --exclude-standard
  } | grep -E '\.(js|mjs)$' | grep -vE 'lz-string\.min\.js$' | sort -u
)
if [[ ${#changed_js[@]} -eq 0 ]]; then
  ok "no changed JS/MJS files to check"
else
  syntax_bad=0
  for f in "${changed_js[@]}"; do
    [[ -f "$f" ]] || continue
    if ! node --check "$f" 2>/dev/null; then
      fail "syntax error in $f"
      syntax_bad=1
    fi
  done
  [[ $syntax_bad -eq 0 ]] && ok "${#changed_js[@]} changed JS/MJS file(s) parse cleanly"
fi

# ── 4. Whitespace / merge markers ─────────────────────────────────────────────
section "Whitespace and merge markers"
if git diff --check >/tmp/doctor-diffcheck.log 2>&1; then
  ok "git diff --check clean"
else
  fail "git diff --check found issues:"
  sed 's/^/       /' /tmp/doctor-diffcheck.log
fi

# ── 5. Duplicate top-level function names (shadow-bug guard) ──────────────────
section "Duplicate top-level function scan"
dups="$(grep -rhoE '^(async )?function [A-Za-z0-9_]+' js/*.js | sed -E 's/async //; s/function //' | sort | uniq -d || true)"
if [[ -z "$dups" ]]; then
  ok "no duplicate top-level function names in js/*.js"
else
  fail "duplicate top-level functions (last-loaded shadows earlier): $(echo "$dups" | tr '\n' ' ')"
fi

# ── 6. Authoritative quality gate ─────────────────────────────────────────────
section "Quality gate"
if [[ $RUN_E2E -eq 1 ]] && [[ -d tests/node_modules ]]; then
  if npm run release:quality >/tmp/doctor-gate.log 2>&1; then
    ok "full release-quality gate passed (globals, schema, unit, smoke, hydration e2e)"
  else
    fail "release-quality gate failed — see detail below"
    grep -inE '^smoke-check:|AssertionError|[1-9][0-9]* failed|Error:' /tmp/doctor-gate.log | grep -viE '0 failed|advisory' | head -20 | sed 's/^/       /'
  fi
else
  [[ $RUN_E2E -eq 0 ]] && warn "skipping browser hydration e2e (--fast)"
  [[ -d tests/node_modules ]] || warn "tests/node_modules missing — skipping hydration e2e (run: npm --prefix tests install)"
  if node scripts/smoke-check.js >/tmp/doctor-smoke.log 2>&1; then ok "smoke check passed"; else
    fail "smoke check failed"; grep -n '^smoke-check:' /tmp/doctor-smoke.log | head -10 | sed 's/^/       /'
  fi
  if npm run test:unit >/tmp/doctor-unit.log 2>&1; then ok "unit suite passed"; else
    fail "unit suite failed"; grep -inE 'AssertionError|[1-9][0-9]* failed|Error:' /tmp/doctor-unit.log | grep -viE '0 failed' | head -20 | sed 's/^/       /'
  fi
fi

# ── 7. Git / deploy readiness ─────────────────────────────────────────────────
section "Deploy readiness"
branch="$(git branch --show-current)"
printf '  branch: %s\n' "$branch"
if [[ -n "$(git status --porcelain)" ]]; then
  warn "working tree has changes (auto-fixes and/or edits) — review and commit before deploying"
  git status --short | sed 's/^/       /'
else
  ok "working tree clean"
fi
if git rev-parse --verify --quiet origin/main >/dev/null; then
  ahead="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo '?')"
  behind="$(git rev-list --count HEAD..origin/main 2>/dev/null || echo '?')"
  printf '  vs origin/main: %s ahead, %s behind\n' "$ahead" "$behind"
  [[ "$branch" != "main" ]] && warn "guarded deploys require an exact, clean origin/main checkout — merge this branch to main first"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
section "Summary"
printf '  auto-fixed: %s   warnings: %s   failures: %s\n' "$FIX_COUNT" "$WARN_COUNT" "$FAIL_COUNT"

if [[ $FAIL_COUNT -gt 0 ]]; then
  printf '\n\033[31mNot release-ready: resolve the failures above.\033[0m\n'
  exit 1
fi

cat <<'NEXT'

Local checks are green. Remaining MANUAL production steps (guards keep these
deliberate — this script never runs them):

  1. Merge the reviewed branch to main (PR quality gate must pass).
  2. From a clean main checkout, apply the DB migration and preflight:
       npx --yes wrangler@4.112.0 d1 migrations apply bcoffense-db --remote
       ./scripts/cloudflare-preflight.sh
  3. Create the queue + DLQ once (skip if they already exist):
       npx --yes wrangler@4.112.0 queues create bcoffense-notifications
       npx --yes wrangler@4.112.0 queues create bcoffense-notifications-dlq
  4. Bootstrap Worker VAPID secrets (interactive; you type them), then deploy:
       npx --yes wrangler@4.112.0 secret put VAPID_PRIVATE_KEY --config wrangler.notifications.toml
       npx --yes wrangler@4.112.0 secret put VAPID_PUBLIC_KEY  --config wrangler.notifications.toml
       npx --yes wrangler@4.112.0 secret put VAPID_SUBJECT     --config wrangler.notifications.toml
       ./scripts/deploy-notification-worker.sh
  5. Deploy Pages LAST (this flips producers on):
       ./scripts/deploy-cloudflare.sh

Steps 2-4 must precede step 5 so coaches never wait on push fanout.
NEXT

[[ $WARN_COUNT -gt 0 ]] && printf '\n\033[33m%s warning(s) above are non-blocking.\033[0m\n' "$WARN_COUNT"
exit 0
