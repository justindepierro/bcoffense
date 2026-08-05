import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [callsheet, templates, pageActions, filters] = await Promise.all([
  readFile(new URL("js/callsheet.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/callsheet-templates.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/page-actions.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/callsheet-filters.js", `file://${root}/`), "utf8"),
]);

assert.match(callsheet, /activeSavedCallSheetId/, "Call Sheet settings retain the active saved-sheet identity");
assert.match(templates, /function saveCurrentCallSheet\(\)/, "Call Sheet has a prompt-free current-sheet save path");
assert.match(templates, /function getCurrentCallSheetSaveTarget/, "normal save resolves an existing sheet before creating one");
assert.match(templates, /function hasAmbiguousCurrentCallSheetName/, "a duplicate display name cannot silently choose a saved Call Sheet");
assert.match(templates, /More than one saved call sheet has this name/, "ambiguous legacy Call Sheet identity asks the coach to load the intended record");
assert.match(templates, /saveCallSheet\(\);/, "current-sheet save persists the working sheet first");
assert.match(templates, /activeSavedCallSheetName = template\.builtIn \? ""/, "loading a saved sheet makes it the next Save target");
assert.match(pageActions, /label: "Save", sublabel: "Updates current sheet", run: \(\) => _paCall\("saveCurrentCallSheet"\)/, "Actions Save updates the current Call Sheet without a naming prompt");
assert.match(pageActions, /label: "Save As Copy"/, "copy creation remains a distinct deliberate action");
assert.match(pageActions, /label: "Save safely"/, "copy creation is grouped with the save workflow instead of a generic More list");
assert.match(pageActions, /label: "Review & sideline"/, "Call Sheet review tools have a named home");
assert.match(pageActions, /label: "Layout"/, "Call Sheet layout controls have a named home");
assert.doesNotMatch(pageActions, /label: "Saved Call Sheets"/, "saved-sheet browsing has one owner through Templates & saves");
assert.match(filters, /play\?\.playbookId, play\?\.sourcePlayId, play\?\.originalPlayId, play\?\.wristbandLinkId/, "Call Sheet wristband matching starts with durable play identity");
assert.match(filters, /typeof playsMatch === "function"/, "Call Sheet wristband matching shares the canonical compare-key fallback");
assert.match(filters, /Legacy imports may lack source identity metadata/, "display-text matching is explicitly retained only for legacy wristbands");

console.log("call sheet current-save contract: 14 assertions passed");
