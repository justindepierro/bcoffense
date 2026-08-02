import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [callsheet, templates, pageActions] = await Promise.all([
  readFile(new URL("js/callsheet.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/callsheet-templates.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/page-actions.js", `file://${root}/`), "utf8"),
]);

assert.match(callsheet, /activeSavedCallSheetId/, "Call Sheet settings retain the active saved-sheet identity");
assert.match(templates, /function saveCurrentCallSheet\(\)/, "Call Sheet has a prompt-free current-sheet save path");
assert.match(templates, /function getCurrentCallSheetSaveTarget/, "normal save resolves an existing sheet before creating one");
assert.match(templates, /saveCallSheet\(\);/, "current-sheet save persists the working sheet first");
assert.match(templates, /activeSavedCallSheetName = template\.builtIn \? ""/, "loading a saved sheet makes it the next Save target");
assert.match(pageActions, /label: "Save", sublabel: "Updates current sheet", run: \(\) => _paCall\("saveCurrentCallSheet"\)/, "Actions Save updates the current Call Sheet without a naming prompt");
assert.match(pageActions, /label: "Save As Copy"/, "copy creation remains a distinct deliberate action");

console.log("call sheet current-save contract: 7 assertions passed");
