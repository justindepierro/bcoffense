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
assert.match(templates, /function setCurrentCallSheetSaveTarget\(template\)/, "all full-sheet save flows share one active-sheet identity update");
assert.match(templates, /if \(includePlays\) setCurrentCallSheetSaveTarget\(created\)/, "saving a full sheet makes that exact saved record the next Save target");
assert.match(templates, /clearCurrentCallSheetSaveTarget\(\)/, "deleting the active saved sheet clears its stale save identity");
assert.doesNotMatch(templates, /renderCallSheet\(\);\s*if \(typeof updateLoadedWristbandDisplay/, "template loading relies on the shared render lifecycle instead of refreshing wristband state twice");
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
assert.match(render, /renderCallSheetPhoneSequenceGroup/, "phone rendering honors a category's one-column sequence layout");
assert.match(render, /Scripted Calls/, "one-column phone categories have an explicit scripted-call heading");
assert.match(picker, /function moveCallSheetPlay\(arg\)/, "phone users have a deterministic move control instead of relying on touch drag-and-drop");
assert.match(render, /cs-mobile-reorder-controls/, "Call Sheet cards render accessible mobile move controls");
assert.match(css, /body\.shell-phone #callsheet \.cs-mobile-reorder-controls/, "mobile move controls meet the phone-specific Call Sheet layout");
assert.doesNotMatch(picker, /const otherHash = hash === "left" \? "right" : "left"/, "a blank spacer stays on the selected hash instead of adding an unrelated partner spacer");
assert.match(picker, /\.callsheet-play, \.cs-blank-row/, "manual Call Sheet drag-and-drop includes blank spacers as well as plays");
assert.match(picker, /event\.dataTransfer\.setData\("text\/plain"/, "cell drags include a browser-compatible payload");
assert.match(picker, /cs-drop-after/, "cell reordering shows a precise before-or-after insertion target");
assert.match(render, /cs-blank-row" draggable="true"/, "blank spacers are draggable cells");
assert.match(render, /cs-cat-drag-handle" draggable="true" data-drag="catDrag"/, "category moves use an explicit drag handle instead of competing with cell drags");
assert.match(filters, /A saved wristband can change after it was loaded into the call sheet/, "new wristband entries are read live before assigning a Call Sheet number");
assert.match(render, /const marker = typeof getPersonnelEmoji/, "additional personnel uses the shared marker language rather than raw chip text");
assert.match(render, /\$\{className\}-marker/, "additional personnel markers render as individual plain markers instead of one pill chip");
assert.match(render, /function renderCallSheetPersonnelBadge\(play, className = "personnel-code"\)/, "known personnel markers render as plain emoji instead of colored text chips");
assert.match(render, /const additionalPersonnelHtml = displayOptions\.showPersonnel/, "the personnel display setting controls all personnel markers on screen");
assert.match(print, /const personnelMarker = typeof getPersonnelEmoji/, "print output resolves plain personnel markers without relying on the interactive renderer");
assert.match(print, /const additionalPersonnelHtml = displayOptions\.showPersonnel/, "the personnel display setting controls all personnel markers in print");
assert.match(print, /<label for="csPrintPaper">Paper<\/label>/, "print controls use programmatic labels instead of visual-only labels");
assert.match(templates, /<label class="sr-only" for="csTemplateName">Call sheet name<\/label>/, "saved-sheet naming has an accessible programmatic label");
assert.match(print, /if \(play\?\._blank\)/, "print output preserves intentional blank spacer cells");
assert.match(print, /print-category--single/, "Call Sheet printing carries the category's sequence layout into the print job");
assert.match(printCss, /\.print-category--single .print-plays-grid/, "single-column print categories use one full-width play column");
assert.match(metadata, /function removeCallSheetBlankRows\(categoryId\)/, "category tools can remove accumulated blank spacers in one action");
assert.match(render, /cs-play-touch-actions[\s\S]*?cs-mobile-reorder-controls[\s\S]*?moveCallSheetPlay[\s\S]*?cs-blank-remove/, "blank rows group deterministic tablet move and remove controls");
assert.match(render, /const swapBtn =[\s\S]*?cs-play-touch-actions[\s\S]*?cs-mobile-reorder-controls[\s\S]*?\$\{swapBtn\}[\s\S]*?removeCallSheetPlay/, "normal Call Sheet rows group move, hash-swap, and remove controls");
assert.match(css, /body\.shell-tablet\.is-mobile-screen\.is-staff-mobile-shell:not\(\[data-auth-role="player"\]\)[\s\S]*?\.callsheet-play,[\s\S]*?\.cs-blank-row \{[\s\S]*?flex-wrap: wrap;/, "tablet Call Sheet rows wrap before their full-width action group so controls cannot overflow horizontally");
assert.match(css, /body\.shell-tablet\.is-mobile-screen\.is-staff-mobile-shell:not\(\[data-auth-role="player"\]\)[\s\S]*?\.cs-play-touch-actions \{[\s\S]*?display: flex;[\s\S]*?flex: 0 0 100%/, "staff tablets expose an explicit full-width action row instead of relying on touch drag-and-drop");
assert.match(css, /\.cs-mobile-reorder-controls button,[\s\S]*?\.cs-hash-swap,[\s\S]*?\.callsheet-play \.remove-play,[\s\S]*?min-height: var\(--coach-workbench-control-height\);[\s\S]*?opacity: 1;/, "tablet move, swap, and remove controls use the shared tablet target size and stay visible");
assert.match(css, /body\.shell-tablet\.is-mobile-screen\.is-portrait-screen\.is-staff-mobile-shell[\s\S]*?#callsheet[\s\S]*?\.cs-cat-header \{[\s\S]*?top: calc\(var\(--app-header-height\) \+ var\(--app-tabs-height\)\);/, "portrait tablet sticky category headers clear the measured document chrome");
assert.ok(css.indexOf("@media print {\n  .cs-play-touch-actions { display: none; }\n}") > css.indexOf(".cs-play-touch-actions { display: contents; }"), "tablet action rows are hidden after their default display rule, so they cannot enter Call Sheet print output");
assert.doesNotMatch(print, /cs-play-touch-actions|cs-mobile-reorder-controls/, "the independent print renderer does not consume interactive tablet controls");

console.log("call sheet current-save contract: layout, live wristband, and save identity contracts passed");
