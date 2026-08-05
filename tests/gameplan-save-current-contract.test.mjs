import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [snapshots, pageActions] = await Promise.all([
  readFile(new URL("js/gameplan-snapshots.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/page-actions.js", `file://${root}/`), "utf8"),
]);

assert.match(snapshots, /function _gpResolveCurrentSnapshotForSave\(board, all, key\)/, "normal Save resolves a current sheet");
assert.match(snapshots, /_gpFindSnapshotByName\(snapshots, sheetName\)/, "a matching named sheet is reused instead of copied");
assert.match(snapshots, /function _gpHasAmbiguousSnapshotName/, "a duplicate plan label is distinguished from a unique legacy recovery match");
assert.match(snapshots, /More than one saved plan has this name/, "ambiguous legacy plan identity cannot overwrite an arbitrary record");
assert.match(snapshots, /return key === "__unassigned__" \? "Current Game Plan" : `vs \$\{key\} Game Plan`/, "an unnamed board gets one stable default sheet name");
assert.match(snapshots, /options\.asNew\n    \? null\n    : _gpResolveCurrentSnapshotForSave/, "ordinary Save resolves the current sheet while Save As does not");
assert.match(snapshots, /title: "Save Game Plan as New"/, "the naming prompt belongs only to Save As");
assert.match(snapshots, /board\.sheetTitle = String\(snapshot\?\.name \|\| board\.sheetTitle \|\| ""\)/, "visible sheet title stays aligned with the saved sheet");
assert.match(pageActions, /label: "Save As"/, "Game Plan uses the app-wide Save / Save As vocabulary");
assert.match(pageActions, /<strong>Save<\/strong> updates this current sheet/, "Plan Center explains the no-copy save behavior");

console.log("game plan current-sheet save contract: 7 assertions passed");
