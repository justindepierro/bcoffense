import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [periods, index, actions] = await Promise.all([
  readFile(new URL("js/script-periods.js", `file://${root}/`), "utf8"),
  readFile(new URL("index.html", `file://${root}/`), "utf8"),
  readFile(new URL("js/page-actions.js", `file://${root}/`), "utf8"),
]);

assert.match(periods, /function openScriptPeriodManager\(\)/, "period organizer has a dedicated modal");
assert.match(periods, /function moveScriptPeriodFromManager\(value\)/, "period organizer can move whole periods");
assert.match(periods, /function reorderScriptPeriodFromManager\(periodId\)/, "period organizer links to a period play-order modal");
assert.match(periods, /async function deleteScriptPeriodFromManager\(periodId\)/, "period organizer supports confirmed period deletion");
assert.match(periods, /data-action="duplicateScriptPeriodFromManager"/, "period organizer exposes duplication");
assert.match(index, /data-action="openScriptPeriodManager"[\s\S]*?🗂️ Organize Periods/, "Workspace Tools exposes the period organizer");
assert.match(actions, /label: "Organize Periods", run: \(\) => _paCall\("openScriptPeriodManager"\)/, "Actions exposes the period organizer");

console.log("script period manager contract: 7 assertions passed");
