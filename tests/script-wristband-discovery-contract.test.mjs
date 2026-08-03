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
assert.match(actions, /label: "Add Plays from Wristband", run: \(\) => _paCall\("openLoadWristbandToScriptModal"\)/, "bulk wristband import remains a clearly secondary action");
assert.match(actions, /label: "Workspace Tools", keepOpen: true, run: openScriptToolsFromPageActions/, "Workspace Tools waits for the Actions sheet to close before opening its drawer");
assert.match(index, /data-action="openScriptWristbandNumbersModal"[\s\S]*?#️⃣ Wristband Numbers/, "Script command strip exposes wristband numbers without importing plays");
assert.match(exportUi, /function openScriptWristbandNumbersModal\(\)/, "number overlay selector has a dedicated modal");
assert.match(exportUi, /This only overlays matching wristband numbers on plays already in your script\./, "number overlay modal explicitly promises not to add plays");
assert.match(storage, /function setScriptWristbandSelection\([\s\S]*?markScriptDirty\(\);[\s\S]*?scheduleScriptAutosave\(\);/, "wristband-number selection persists with the script workspace");
assert.match(storage, /scriptWristband = wb;[\s\S]*?scriptShowWbNum[\s\S]*?showWristbandNumbers\.checked = true[\s\S]*?saveScriptDisplayOptions\(\)/, "linking a wristband restores its visible number layer in the live Script grid");
assert.match(exportUi, /function refreshLoadWbToScriptCards\(\)/, "import modal refreshes card choices for the selected saved wristband");
assert.match(exportUi, /data-onchange="refreshLoadWbToScriptCards"/, "changing wristbands refreshes its card choices");
assert.match(exportUi, /card\?\.name \|\| `Card \$\{index \+ 1\}`/, "card choices use saved card names when available");

console.log("script wristband discovery contract: 7 assertions passed");
