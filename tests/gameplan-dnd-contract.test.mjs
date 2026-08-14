import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [dnd, render, actions, css, appEvents] = await Promise.all([
  readFile(new URL("js/gameplan-dnd.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/gameplan-render.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/gameplan-actions.js", `file://${root}/`), "utf8"),
  readFile(new URL("css/gameplan.css", `file://${root}/`), "utf8"),
  readFile(new URL("js/app-events.js", `file://${root}/`), "utf8"),
]);

assert.match(
  dnd,
  /let toIdx = Number\.isFinite\(targetIdx\) \? targetIdx : arr\.length;[\s\S]*?if \(fromIdx < toIdx\) toIdx -= 1;[\s\S]*?toIdx = Math\.max\(0, Math\.min\(arr\.length, toIdx\)\);/,
  "intra-bucket drops shift the pre-removal target before clamping, including a bottom drop",
);
assert.match(dnd, /is-drag-source/, "dragging a box play exposes a source-state affordance");
assert.match(render, /gp-box-play-grip/, "box plays render a dedicated reorder grip");
assert.match(css, /\.gp-box-play\.is-drag-source[\s\S]*?\.gp-box-play-grip/, "the reorder grip and drag source have visible feedback");
assert.match(render, /gp-box-play-tablet-menu[\s\S]*?openGamePlanPlayActionMenu/, "staff tablet rows have one persistent actions entry");
assert.match(actions, /function openGamePlanPlayActionMenu\(playArg, trigger\)/, "the tablet actions entry opens the deterministic context menu");
assert.match(actions, /Mark for wristband[\s\S]*?Mark as JV \/ freshmen/, "the long-press/context menu exposes both play flags");
assert.match(appEvents, /"openGamePlanPlayActionMenu"/, "the delegated dispatcher passes the source control to the tablet actions menu");
assert.match(css, /\.gp-box-play-actions[\s\S]*?> :not\(\.gp-box-play-tablet-menu\)[\s\S]*?display: none/, "tablet rows replace hover controls with one disclosure");
assert.match(css, /\.gp-box-play-tablet-menu[\s\S]*?min-height: var\(--tap-min\)/, "the tablet actions disclosure meets the named touch target");
assert.match(css, /\.cs-context-menu\.gp-play-context-menu[\s\S]*?min-height: var\(--tap-min\)/, "the tablet play menu keeps every revealed action reachable");

console.log("game plan drag-drop contract: passed");
