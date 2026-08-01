import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [actions, exportUi, index] = await Promise.all([
  readFile(new URL("js/page-actions.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/script-export.js", `file://${root}/`), "utf8"),
  readFile(new URL("index.html", `file://${root}/`), "utf8"),
]);

assert.match(actions, /label: "Wristband", sublabel: "Load saved plays", run: \(\) => _paCall\("openLoadWristbandToScriptModal"\)/, "Script Actions exposes wristband import as a primary choice");
assert.match(index, /data-action="openLoadWristbandToScriptModal"[\s\S]*?📟 Wristband/, "Script command strip exposes a direct wristband import button");
assert.match(exportUi, /function refreshLoadWbToScriptCards\(\)/, "import modal refreshes card choices for the selected saved wristband");
assert.match(exportUi, /data-onchange="refreshLoadWbToScriptCards"/, "changing wristbands refreshes its card choices");
assert.match(exportUi, /card\?\.name \|\| `Card \$\{index \+ 1\}`/, "card choices use saved card names when available");

console.log("script wristband discovery contract: 5 assertions passed");
