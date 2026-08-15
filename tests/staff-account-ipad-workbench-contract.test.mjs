/**
 * Staff account task-surface contract.
 *
 * Player Accounts and Coach Access are already permission-sensitive blocking
 * dialogs. Lock their tablet-specific focus, safe-height, scroll, and action
 * hierarchy without changing their server-side permission model.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
const [players, access, events, css] = await Promise.all([
  read("js/players-admin.js"),
  read("js/coach-access.js"),
  read("js/app-events.js"),
  read("css/components.css"),
]);

assert.match(
  events,
  /"openPlayersAdmin",[\s\S]*?"openCoachAccessManager"/,
  "account task triggers pass the real touch source through delegated actions",
);
assert.match(
  players,
  /function openPlayersAdmin\(rosterPlayerId = "", trigger\) \{[\s\S]*?rosterPlayerId instanceof HTMLElement[\s\S]*?id: "playersAdminOverlay",[\s\S]*?scrollElement: body \|\| panel \|\| overlay,[\s\S]*?blocking: true,[\s\S]*?safeArea: true,[\s\S]*?initialFocus: closeButton \|\| panel \|\| overlay,[\s\S]*?onEscape: \(\) => closePlayersAdmin\(\),[\s\S]*?returnFocus: trigger instanceof HTMLElement \? trigger : undefined,/,
  "Player Accounts names the actual body scroller and preserves its trigger, focus, Escape, and safe-area layer lifecycle",
);
assert.match(
  players,
  /function closePlayersAdmin\(options = \{\}\) \{[\s\S]*?closeLayer\("playersAdminOverlay", options\);[\s\S]*?overlay\.setAttribute\("inert", ""\);/,
  "Player Accounts releases its layer before making its reusable DOM inert",
);
assert.match(
  access,
  /function openCoachAccessManager\(trigger\) \{[\s\S]*?id: "coachAccessOverlay",[\s\S]*?scrollElement: body \|\| panel \|\| overlay,[\s\S]*?blocking: true,[\s\S]*?safeArea: true,[\s\S]*?initialFocus: closeButton \|\| panel \|\| overlay,[\s\S]*?onEscape: \(\) => closeCoachAccessManager\(\),[\s\S]*?returnFocus: trigger instanceof HTMLElement \? trigger : undefined,/,
  "Coach Access uses the same managed layer with its body as the only owner",
);
assert.match(
  access,
  /function closeCoachAccessManager\(options = \{\}\) \{[\s\S]*?closeLayer\("coachAccessOverlay", options\);[\s\S]*?overlay\.setAttribute\("inert", ""\);/,
  "Coach Access restores its source before its dialog becomes inert",
);

const tabletMarker = "/* ── Staff iPad account workbenches";
const tabletCss = css.slice(css.indexOf(tabletMarker));
assert.ok(tabletCss.length > 0, "staff tablet account CSS has an isolated section");
assert.match(tabletCss, /\.pa-overlay\.app-layer-active \{[\s\S]*?height: var\(--app-visual-viewport-height\);[\s\S]*?overflow: hidden;/, "active account overlays follow the visual viewport");
assert.match(tabletCss, /\.pa-overlay\.app-layer-active[\s\S]*?\.pa-panel \{[\s\S]*?max-height: var\(--app-layer-usable-height\);[\s\S]*?overflow: hidden;/, "account panels fit safe height without outer scrolling");
assert.match(tabletCss, /\.pa-overlay\.app-layer-active[\s\S]*?\.pa-body \{[\s\S]*?overflow: auto;[\s\S]*?overscroll-behavior: contain;/, "the account body is the deliberate interior scroller");
assert.match(tabletCss, /\.pa-close-btn \{[\s\S]*?width: var\(--tap-min\);[\s\S]*?height: var\(--tap-min\);[\s\S]*?flex: 0 0 var\(--tap-min\);/, "account Close is a fixed 44px touch target");
assert.match(tabletCss, /\.coach-access-layout \{[\s\S]*?grid-template-columns: minmax\(240px, 0\.72fr\) minmax\(0, 1\.28fr\);/, "Coach Access keeps a useful list/detail workbench on roomy iPads");
assert.match(tabletCss, /\.coach-access-save \{[\s\S]*?position: sticky;[\s\S]*?bottom:/, "Coach Access keeps save/status reachable while permissions scroll");

console.log("staff account iPad workbench contract: managed focus, scroll, and touch targets passed");
