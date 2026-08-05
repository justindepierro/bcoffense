import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [actions, exportUi, index, storage] = await Promise.all([
  readFile(new URL("js/page-actions.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/script-export.js", `file://${root}/`), "utf8"),
  readFile(new URL("index.html", `file://${root}/`), "utf8"),
  readFile(new URL("js/script-storage.js", `file://${root}/`), "utf8"),
]);

assert.match(actions, /label: "Wristband Numbers", sublabel: "Show numbers on this script", run: \(\) => _paCall\("openScriptWristbandNumbersModal"\)/, "Script Actions exposes wristband numbers without importing plays");
assert.match(actions, /label: "Workspace Tools", sublabel: "Organize, packet, send & more", postCloseDelayMs: 200, run: \(\) => _paCall\("openScriptToolsDrawer"\)/, "one Actions entry hands advanced Script work to the dedicated tools drawer");
assert.doesNotMatch(actions, /label: "Add Plays from Wristband"/, "bulk wristband import stays in its Script workspace owner instead of duplicating the Actions hub");
assert.match(index, /data-action="openScriptWristbandNumbersModal"[\s\S]*?#️⃣ Wristband Numbers/, "Script command strip exposes wristband numbers without importing plays");
assert.match(exportUi, /function openScriptWristbandNumbersModal\(\)/, "number overlay selector has a dedicated modal");
assert.match(exportUi, /This only overlays matching wristband numbers on plays already in your script\./, "number overlay modal explicitly promises not to add plays");
assert.match(exportUi, /function openScriptWristbandLinkRepairModal\(\)[\s\S]*?Repair missing wristband links[\s\S]*?function saveScriptWristbandLinkRepairs\(\)/, "missing legacy wristband links have a dedicated one-time repair flow");
assert.match(storage, /function setScriptWristbandSelection\([\s\S]*?markScriptDirty\(\);[\s\S]*?scheduleScriptAutosave\(\);/, "wristband-number selection persists with the script workspace");
assert.match(storage, /scriptWristband = wb;[\s\S]*?scriptShowWbNum[\s\S]*?showWristbandNumbers\.checked = true[\s\S]*?saveScriptDisplayOptions\(\)/, "linking a wristband restores its visible number layer in the live Script grid");
assert.match(storage, /function findPlayOnWristband\(play\)[\s\S]*?playbookId[\s\S]*?sourcePlayId[\s\S]*?originalPlayId[\s\S]*?wristbandLinkId[\s\S]*?wristbandIds\.has\(id\)[\s\S]*?playsMatch/, "wristband lookup checks durable source identifiers before any display-text fallback");
assert.match(storage, /function findPlayOnWristband\(play\)[\s\S]*?play\?\.lineCall[\s\S]*?fallbackMatches\.length === 1/, "wristband lookup supports only an unambiguous Line Call or One Word fallback for abbreviated calls");
assert.match(storage, /normalizeWristbandCall[\s\S]*?\(leo\|l\)[\s\S]*?\(bb\|bob\)[\s\S]*?canonicalMatches\.length === 1/, "wristband lookup safely normalizes common imported call abbreviations only when the full call is unique");
assert.match(exportUi, /function refreshLoadWbToScriptCards\(\)/, "import modal refreshes card choices for the selected saved wristband");
assert.match(exportUi, /data-onchange="refreshLoadWbToScriptCards"/, "changing wristbands refreshes its card choices");
assert.match(exportUi, /card\?\.name \|\| `Card \$\{index \+ 1\}`/, "card choices use saved card names when available");

console.log("script wristband discovery contract: 7 assertions passed");
