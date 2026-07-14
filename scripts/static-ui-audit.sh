#!/usr/bin/env bash
# Static UI audit for the classes of issues we keep finding by hand.
#
# This is intentionally bash + ripgrep only. It does not start a server,
# browser, watcher, Node process, or Playwright harness.
#
# Usage:
#   ./scripts/static-ui-audit.sh
#   ./scripts/static-ui-audit.sh --warn-only
#   ./scripts/static-ui-audit.sh --strict-all
#   ./scripts/static-ui-audit.sh --max-lines=120

set -euo pipefail
cd "$(dirname "$0")/.."

MAX_LINES=80
WARN_ONLY=false
STRICT_ALL=false

for arg in "$@"; do
  case "$arg" in
    --warn-only) WARN_ONLY=true ;;
    --strict-all) STRICT_ALL=true ;;
    --max-lines=*) MAX_LINES="${arg#--max-lines=}" ;;
    -h|--help)
      cat <<'USAGE'
Static UI audit for the classes of issues we keep finding by hand.

This is intentionally bash + ripgrep only. It does not start a server,
browser, watcher, Node process, or Playwright harness.

Usage:
  ./scripts/static-ui-audit.sh
  ./scripts/static-ui-audit.sh --warn-only
  ./scripts/static-ui-audit.sh --strict-all
  ./scripts/static-ui-audit.sh --max-lines=120

Exit behavior:
  strict findings fail by default
  review findings report only by default
  --warn-only never fails for findings
  --strict-all also fails on review findings
USAGE
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

if ! command -v rg >/dev/null 2>&1; then
  echo "static-ui-audit: ripgrep (rg) is required" >&2
  exit 2
fi

STRICT_HITS=0
REVIEW_HITS=0
CHECKS_WITH_FINDINGS=0

print_matches() {
  local severity="$1"
  local title="$2"
  local why="$3"
  local file="$4"
  local count
  count=$(wc -l < "$file" | tr -d ' ')
  [[ "$count" == "0" ]] && return 0

  CHECKS_WITH_FINDINGS=$((CHECKS_WITH_FINDINGS + 1))
  if [[ "$severity" == "strict" ]]; then
    STRICT_HITS=$((STRICT_HITS + count))
  else
    REVIEW_HITS=$((REVIEW_HITS + count))
  fi

  echo
  echo "[$severity] $title ($count hit$([[ "$count" == "1" ]] || echo "s"))"
  echo "  $why"
  sed -n "1,${MAX_LINES}p" "$file" | sed 's/^/  /'
  if (( count > MAX_LINES )); then
    echo "  ... $((count - MAX_LINES)) more hit(s) hidden by --max-lines=${MAX_LINES}"
  fi
}

run_rg() {
  local severity="$1"
  local title="$2"
  local why="$3"
  shift 3
  local tmp
  tmp=$(mktemp)
  if rg -n --color=never -S -g '!tests/node_modules/**' -g '!node_modules/**' "$@" > "$tmp"; then
    print_matches "$severity" "$title" "$why" "$tmp"
  fi
  rm -f "$tmp"
}

run_cmd() {
  local severity="$1"
  local title="$2"
  local why="$3"
  local cmd="$4"
  local tmp
  tmp=$(mktemp)
  if bash -c "$cmd" > "$tmp"; then
    print_matches "$severity" "$title" "$why" "$tmp"
  fi
  rm -f "$tmp"
}

echo "Static UI audit: $(pwd)"
echo "Mode: strict findings fail; review findings report only. Use --warn-only or --strict-all to change that."

run_rg strict \
  "inline handlers or static inline styles in index.html" \
  "Use data-action/data-onchange/data-oninput and CSS classes instead of inline presentation or raw event handlers." \
  -g 'index.html' -e '\s(onclick|onchange|oninput)=|style=' .

run_rg strict \
  "search clear buttons hidden by CSS but toggled with style.display" \
  "Search clear buttons use .hidden; JS display toggles can leave them invisible or inconsistent." \
  -g 'js/*.js' -e '(clear(?:Btn|Button)|search-clear-btn|clear[A-Za-z]*Search)[^\n]{0,180}style\.display|style\.display[^\n]{0,180}(clear(?:Btn|Button)|search-clear-btn|clear[A-Za-z]*Search)' .

run_rg strict \
  "trusted composer markup routed through setInnerHTML" \
  "Composer markup has controls and stateful attributes; render trusted app chrome directly after escaping values." \
  -U -g 'js/*.js' -e 'setInnerHTML\([^;]*_discComposerHtml' .

run_cmd review \
  "dialogs missing accessible name" \
  "role=dialog should include aria-label or aria-labelledby." \
  'perl -0ne '\''while (/<[^>]*role="dialog"[^>]*>/g) { my $tag=$&; my $start=substr($_,0,$-[0]); my $line=1+($start=~tr/\n//); print "$ARGV:$line:$tag\n" if $tag !~ /aria-(?:label|labelledby)=/; } close ARGV if eof'\'' index.html js/*.js'

run_cmd strict \
  "icon close buttons missing aria-label" \
  "Close icon buttons need a spoken label, especially in generated modals/drawers." \
  'perl -ne '\''print "$ARGV:$.:$_" if /<button[^>]*(?:modal-close|close-btn|sort-close|drawer-close|disc-floating-close|disc-attachment-viewer-close)[^>]*>/ && !/aria-label=/; close ARGV if eof'\'' index.html js/*.js'

# skipWaiting/clients.claim can disrupt active practice work. The ONE sanctioned
# exception is a message-handler skipWaiting gated on a SKIP_WAITING postMessage
# (user-initiated "update now") — permitted when a SKIP_WAITING guard appears
# within the preceding 2 lines. Install-handler skipWaiting and any clients.claim
# are still flagged.
run_cmd strict \
  "service worker forced takeover" \
  "skipWaiting/clients.claim can disrupt active practice work (message-triggered SKIP_WAITING is exempt)." \
  'perl -ne '\''push @w, $_; shift @w if @w > 3; if (/skipWaiting|clients\.claim/) { my $recent = join("", @w); print "$ARGV:$.:$_" unless (/skipWaiting/ && !/clients\.claim/ && $recent =~ /SKIP_WAITING/); } if (eof) { close ARGV; @w = (); }'\'' sw.js js/*.js'

run_rg review \
  "page reload calls" \
  "Review reload paths: some are intentional after restore/clear, but surprise reloads can disrupt active work." \
  -g 'js/*.js' -e 'controllerchange[^\n]*reload|location\.reload' .

run_rg review \
  "setInnerHTML/sanitizeHTML with controls or table fragments" \
  "Review: controls may lose attributes and orphan table rows can be dropped by DOMParser." \
  -U -g 'js/*.js' -e 'setInnerHTML\([^;]*(button|input|select|textarea|form|table|thead|tbody|tr|td|th)|sanitizeHTML\([^;]*(button|input|select|textarea|form|table|thead|tbody|tr|td|th)' .

run_cmd review \
  "modal-like containers without role=dialog" \
  "Review generated modal shells that may be missing dialog semantics." \
  'perl -ne '\''print "$ARGV:$.:$_" if /class="[^"]*\b(?:custom-modal|modal-content|cs-sort-modal|period-create-modal|gp-info-modal|cell-popup)\b[^"]*"/ && !/role="dialog"/ && !/custom-modal-(?:header|body|actions|input|list|btn)|modal-content-/; close ARGV if eof'\'' index.html js/*.js'

run_rg review \
  "raw localStorage outside storage manager" \
  "Review: app persistence should normally go through storageManager/STORAGE_KEYS." \
  -g 'js/*.js' -g '!js/storage.js' -e 'localStorage\.(getItem|setItem|removeItem|clear)' .

run_rg review \
  "raw viewport or overflow traps in CSS" \
  "Review: raw vh/fixed overflow can break mobile browser chrome, iPad split-screen, and nested scrolls." \
  -g 'css/*.css' -e 'max-height:\s*(calc\(100vh|[0-9]+vh|min\([^;]*100vh)|height:\s*100dvh|max-height:\s*100dvh|overflow-y:\s*hidden|overflow:\s*hidden' .

run_rg review \
  "hardcoded live UI colors" \
  "Review: live UI colors should usually use tokens; print paper/video canvas colors may be intentional." \
  -g 'css/*.css' -g 'js/*.js' -g '!css/print.css' -e 'color:\s*(#fff|white|#000)|background:\s*(#000|#fff|white|black)|border-color:\s*#fff' .

run_rg review \
  "large banner or hero candidates" \
  "Review operational pages for marketing-style hero/header blocks that should be compact or moved to Help." \
  -g 'index.html' -g 'css/*.css' -e 'hero|banner|page-header|player-summary|launcher|empty-state|subtitle|description' .

run_cmd review \
  "wrapping chip/stat rows" \
  "Review chip/stat/badge rows that wrap vertically; use a single horizontal scroll row when space is tight." \
  'perl -0ne '\''my $css=$_; $css =~ s!/\*.*?\*/!!gs; while ($css =~ /([^{}]+)\{([^{}]*)\}/g) { my ($sel,$body)=($1,$2); next unless $sel =~ /(?:chip|stat|badge|pill)/i && $body =~ /flex-wrap:\s*wrap/; my $start=substr($css,0,$-[0]); my $line=1+($start=~tr/\n//); $sel =~ s/\s+/ /g; $sel =~ s/^\s+|\s+$//g; print "$ARGV:$line:$sel { flex-wrap: wrap; }\n"; } close ARGV if eof'\'' css/*.css'

run_rg review \
  "small touch target candidates" \
  "Review interactive controls below typical 44px touch sizing; desktop-only density may be intentional." \
  -g 'css/*.css' -e 'min-height:\s*(1[0-9]|2[0-9]|3[0-5])px|min-width:\s*(1[0-9]|2[0-9]|3[0-5])px|padding:\s*[0-4]px(?:\s|;)' .

# ── Hardening checks (Phase 0 roadmap) ───────────────────────────────────────

run_rg strict \
  "<details>/<summary> used as a toolbar dropdown" \
  "Safari renders summary-as-button inconsistently (invisible/unclickable). Use the anchored .tool-menu-wrap + data-anchored pattern instead." \
  -g 'index.html' -e '<summary[^>]*class="[^"]*\bbtn\b' .

run_cmd strict \
  "transform/will-change:transform on a panel (containing-block trap)" \
  "transform or will-change:transform on .panel.active makes it the containing block for position:fixed/sticky descendants, trapping anchored menus and breaking sticky headers. Keep panel animations opacity-only (transform:none is allowed)." \
  'perl -0ne '\''while (/\.panel\.active[^{]*\{([^}]*)\}/g) { my $body=$1; my $start=substr($_,0,$-[0]); my $line=1+($start=~tr/\n//); print "$ARGV:$line: .panel.active declares a trapping transform\n" if $body =~ /will-change:\s*[^;]*transform/ || $body =~ /transform:\s*(?!none)[A-Za-z]/; } close ARGV if eof'\'' css/layout.css'

run_rg review \
  "scrollIntoView inside module code (desktop shell risk)" \
  "scrollIntoView walks every scroll ancestor including #mainApp (overflow:hidden but scriptable), hiding the tab bar. Prefer scrolling the specific inner container. Some modal/overlay uses are fine." \
  -g 'js/*.js' -e '\.scrollIntoView\(' .

# ── Script cache consistency (index.html <script> vs sw.js LOCAL_ASSETS) ──────
# Every JS file loaded by index.html MUST be in sw.js LOCAL_ASSETS or it won't
# be cached and offline mode breaks. And vice versa (no stale cache entries).
SCRIPT_MISMATCH_TMP=$(mktemp)
grep -oE 'src="js/[a-zA-Z0-9._-]+\.js' index.html | sed 's|src="||' | sort -u > "${SCRIPT_MISMATCH_TMP}.html"
grep -oE '"\./js/[a-zA-Z0-9._-]+\.js"' sw.js | sed 's|"\./||; s|"||' | sort -u > "${SCRIPT_MISMATCH_TMP}.sw"
comm -23 "${SCRIPT_MISMATCH_TMP}.html" "${SCRIPT_MISMATCH_TMP}.sw" | sed 's/^/  loaded in index.html but MISSING from sw.js LOCAL_ASSETS: /' > "$SCRIPT_MISMATCH_TMP"
comm -13 "${SCRIPT_MISMATCH_TMP}.html" "${SCRIPT_MISMATCH_TMP}.sw" | sed 's/^/  in sw.js LOCAL_ASSETS but NOT loaded in index.html: /' >> "$SCRIPT_MISMATCH_TMP"
SCRIPT_MISMATCH_COUNT=$(grep -c . "$SCRIPT_MISMATCH_TMP" || true)
if [[ "$SCRIPT_MISMATCH_COUNT" != "0" ]]; then
  CHECKS_WITH_FINDINGS=$((CHECKS_WITH_FINDINGS + 1))
  STRICT_HITS=$((STRICT_HITS + SCRIPT_MISMATCH_COUNT))
  echo
  echo "[strict] script cache mismatch between index.html and sw.js ($SCRIPT_MISMATCH_COUNT)"
  echo "  A loaded script missing from LOCAL_ASSETS breaks offline mode; a stale entry wastes cache."
  cat "$SCRIPT_MISMATCH_TMP"
fi
rm -f "$SCRIPT_MISMATCH_TMP" "${SCRIPT_MISMATCH_TMP}.html" "${SCRIPT_MISMATCH_TMP}.sw"

# ── Duplicate top-level function definitions (global-scope shadow bug) ────────
# All JS shares one global scope; two files defining the same top-level function
# means the last-loaded one silently shadows the other. Must be zero.
DUP_TMP=$(mktemp)
grep -rhoE "^(async )?function [A-Za-z0-9_]+" js/*.js \
  | sed -E 's/^(async )?function //' \
  | sort | uniq -d > "$DUP_TMP"
DUP_COUNT=$(wc -l < "$DUP_TMP" | tr -d ' ')
if [[ "$DUP_COUNT" != "0" ]]; then
  CHECKS_WITH_FINDINGS=$((CHECKS_WITH_FINDINGS + 1))
  STRICT_HITS=$((STRICT_HITS + DUP_COUNT))
  echo
  echo "[strict] duplicate top-level function definitions ($DUP_COUNT name$([[ "$DUP_COUNT" == "1" ]] || echo "s"))"
  echo "  Two files define the same top-level function; the last-loaded one silently shadows the other. Move the function to one owning file."
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    echo "  duplicate: $name"
    grep -rnE "^(async )?function ${name}\b" js/*.js | sed 's/^/    /'
  done < "$DUP_TMP"
fi
rm -f "$DUP_TMP"

echo
echo "Summary: strict=${STRICT_HITS}, review=${REVIEW_HITS}, checks_with_findings=${CHECKS_WITH_FINDINGS}"

if [[ "$WARN_ONLY" == "true" ]]; then
  exit 0
fi

if [[ "$STRICT_ALL" == "true" && "$REVIEW_HITS" -gt 0 ]]; then
  exit 1
fi

if [[ "$STRICT_HITS" -gt 0 ]]; then
  exit 1
fi

exit 0