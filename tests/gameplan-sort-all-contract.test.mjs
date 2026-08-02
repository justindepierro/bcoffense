import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [actions, render, pageActions] = await Promise.all([
  readFile(new URL("js/gameplan-actions.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/gameplan-render.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/page-actions.js", `file://${root}/`), "utf8"),
]);

assert.match(actions, /const GP_BUCKET_SORT_OPTIONS = \[/, "sort-all uses one shared list of supported modes");
assert.match(actions, /function openGamePlanSortAllBuckets\(\)/, "sort-all opens a dedicated picker");
assert.match(actions, /function applyGamePlanSortAllBuckets\(mode\)/, "sort-all persists the selected order");
assert.match(actions, /_gpGetBoardBoxes\(board\)\.forEach/, "sort-all applies to every default, custom, and hidden bucket");
assert.match(actions, /id: "gpSortAllBucketsOverlay"[\s\S]*?blocking: true[\s\S]*?onEscape: close/, "sort picker uses shared dialog lifecycle");
assert.match(render, /data-action="openGamePlanSortAllBuckets"/, "Game Plan command strip exposes Sort All");
assert.match(pageActions, /label: "Sort All Buckets"[\s\S]*?openGamePlanSortAllBuckets/, "Game Plan Actions exposes Sort All");

console.log("game plan sort-all contract: 7 assertions passed");
