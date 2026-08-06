import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [callsheet, templates, pageActions, filters, render, picker, css, print, metadata, printCss] = await Promise.all([
  readFile(new URL("js/callsheet.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/callsheet-templates.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/page-actions.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/callsheet-filters.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/callsheet-render.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/callsheet-picker-runtime.js", `file://${root}/`), "utf8"),
  readFile(new URL("css/callsheet.css", `file://${root}/`), "utf8"),
  readFile(new URL("js/callsheet-print.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/callsheet-metadata.js", `file://${root}/`), "utf8"),
  readFile(new URL("css/print.css", `file://${root}/`), "utf8"),
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
assert.match(callsheet, /function toggleCallSheetCategoryColumns\(categoryId\)/, "each Call Sheet category can switch between hash and sequence layouts");
assert.match(render, /cs-single-column/, "the Call Sheet render path exposes the one-column category state");
assert.match(css, /\.callsheet-category\.cs-single-column .category-content/, "one-column categories use a full-width call layout");
assert.doesNotMatch(picker, /const otherHash = hash === "left" \? "right" : "left"/, "a blank spacer stays on the selected hash instead of adding an unrelated partner spacer");
assert.match(picker, /\.callsheet-play, \.cs-blank-row/, "manual Call Sheet drag-and-drop includes blank spacers as well as plays");
assert.match(render, /cs-blank-row" draggable="true"/, "blank spacers are draggable cells");
assert.match(filters, /A saved wristband can change after it was loaded into the call sheet/, "new wristband entries are read live before assigning a Call Sheet number");
assert.match(render, /const marker = typeof getPersonnelEmoji/, "additional personnel uses the shared marker language rather than raw chip text");
assert.match(render, /\$\{className\}-marker/, "additional personnel markers render as individual plain markers instead of one pill chip");
assert.match(render, /function renderCallSheetPersonnelBadge\(play, className = "personnel-code"\)/, "known personnel markers render as plain emoji instead of colored text chips");
assert.match(print, /const personnelMarker = typeof getPersonnelEmoji/, "print output resolves plain personnel markers without relying on the interactive renderer");
assert.match(print, /print-category--single/, "Call Sheet printing carries the category's sequence layout into the print job");
assert.match(printCss, /\.print-category--single .print-plays-grid/, "single-column print categories use one full-width play column");
assert.match(metadata, /function removeCallSheetBlankRows\(categoryId\)/, "category tools can remove accumulated blank spacers in one action");

console.log("call sheet current-save contract: layout, live wristband, and save identity contracts passed");
