#!/usr/bin/env python3
"""One-off mechanical splitter for js/gameplan.js."""
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "js" / "gameplan.js"
lines = SRC.read_text().splitlines(keepends=True)
N = len(lines)
print(f"source: {SRC} ({N} lines)")

def grab(*ranges):
    out = []
    for (a, b) in ranges:
        out.extend(lines[a-1:b])
    return "".join(out)

BANNER = lambda title: f"""/* =========================================================================
   {title}
   Split out of gameplan.js — see AGENTS.md for ownership map.
   ========================================================================= */

"""

manifest = {
    "gameplan.js": [
        (1, 533),
        (3320, 3403),
        (4785, 4827),
    ],
    "gameplan-render.js":       [(534, 1513)],
    "gameplan-dnd.js":          [(1514, 1903)],
    "gameplan-actions.js": [
        (1905, 2078),
        (2457, 2538),
        (2540, 2672),
        (2886, 2947),
        (2949, 3031),
        (4428, 4598),
    ],
    "gameplan-smart.js": [
        (2079, 2125),
        (2674, 2884),
        (3033, 3124),
        (3405, 3592),
        (3594, 3816),
        (4600, 4783),
    ],
    "gameplan-print.js": [
        (2323, 2330),
        (3818, 4232),
    ],
    "gameplan-integrations.js": [
        (2127, 2321),
        (2332, 2455),
        (3126, 3210),
        (4234, 4301),
        (4303, 4426),
    ],
    "gameplan-snapshots.js":    [(3212, 3319)],
}

titles = {
    "gameplan.js":               "core (kept)",
    "gameplan-render.js":        "Game Plan — rendering (header, library, boxes, chips, scoreboard, scenarios)",
    "gameplan-dnd.js":           "Game Plan — drag & drop wiring",
    "gameplan-actions.js":       "Game Plan — box CRUD, selection, density, manage/reorder/hide/rename",
    "gameplan-smart.js":         "Game Plan — smart features (criteria detect, suggest fill, templates, health, touches, spotlight, coverage matrix, tendency mirror)",
    "gameplan-print.js":         "Game Plan — print modal + print render",
    "gameplan-integrations.js":  "Game Plan — push to call sheet, push to script, dashboard send, compare",
    "gameplan-snapshots.js":     "Game Plan — named snapshots (save/load/delete/menu)",
}

moved = sorted([r for n, rs in manifest.items() if n != "gameplan.js" for r in rs])
for i in range(len(moved) - 1):
    if moved[i][1] >= moved[i+1][0]:
        raise SystemExit(f"OVERLAP: {moved[i]} vs {moved[i+1]}")

covered = [0] * (N + 2)
for ranges in manifest.values():
    for (a, b) in ranges:
        for i in range(a, b+1):
            covered[i] += 1
uncov = [i for i in range(1, N+1) if covered[i] == 0]
dbl  = [i for i in range(1, N+1) if covered[i] > 1]
print(f"  uncovered lines (expect blank gap lines only): {len(uncov)}")
for i in uncov:
    if lines[i-1].strip():
        print(f"    !! NON-BLANK uncovered line {i}: {lines[i-1]!r}")
print(f"  double-covered: {len(dbl)}", dbl[:10])

for name, ranges in manifest.items():
    body = grab(*ranges)
    out = body if name == "gameplan.js" else BANNER(titles[name]) + body
    p = ROOT / "js" / name
    p.write_text(out)
    print(f"  wrote {p.relative_to(ROOT)} ({out.count(chr(10))} lines)")

print("done.")
