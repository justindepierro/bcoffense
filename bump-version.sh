#!/usr/bin/env bash
# Bump the SW cache version and refresh the ?v=NNN cache-buster on every
# <script src="js/..."> and <link href="css/..."> reference in index.html.
#
# Usage:  ./bump-version.sh           (auto-increments current SW version by 1)
#         ./bump-version.sh 392       (sets explicit version)
set -euo pipefail
cd "$(dirname "$0")"

current=$(grep -oE 'bcoffense-v[0-9]+' sw.js | head -1 | sed 's/bcoffense-v//')
if [ -z "${1:-}" ]; then
  next=$((current + 1))
else
  next=$1
fi

sed -i '' "s/bcoffense-v${current}/bcoffense-v${next}/" sw.js

python3 - "$next" <<'PY'
import re, sys, pathlib
v = sys.argv[1]
p = pathlib.Path('index.html')
s = p.read_text()
s = re.sub(r'(src=")(js/[^"?]+\.js)(\?v=\d+)?(")',  rf'\1\2?v={v}\4', s)
s = re.sub(r'(href=")(css/[^"?]+\.css)(\?v=\d+)?(")', rf'\1\2?v={v}\4', s)
p.write_text(s)
PY

echo "Bumped: v${current} -> v${next}"
echo "Stamps in index.html: $(grep -c "?v=${next}" index.html)"
