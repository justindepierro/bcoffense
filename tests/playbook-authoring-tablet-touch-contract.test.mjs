/**
 * T-009 P1 Playbook authoring and cleanup tablet touch contract.
 *
 * The coach's live editor, Data Cleanup, and Category Cleanup surfaces need
 * full iPad touch targets without changing dense desktop tables, player
 * study, reports, Print, or phone layouts.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
const [css, index, editor, sanitize, identity] = await Promise.all([
  read("css/playbook.css"),
  read("index.html"),
  read("js/playbook-editor.js"),
  read("js/playbook-sanitize.js"),
  read("js/playbook-identity.js"),
]);

const startMarker = "/* T-009 P1 — Playbook authoring and cleanup touch targets.";
const endMarker = "/* End T-009 P1 Playbook authoring and cleanup touch targets. */";
const start = css.indexOf(startMarker);
const end = css.indexOf(endMarker, start);
assert.ok(start >= 0 && end > start, "Playbook authoring defines one dedicated tablet touch block");
const touchBlock = css.slice(start, end);

assert.match(
  touchBlock,
  /@media screen and \(pointer: coarse\) and \(min-width: 744px\) \{[\s\S]*?body\.shell-tablet\.is-mobile-screen\.is-staff-mobile-shell:not\(\[data-auth-role="player"\]\)/,
  "the adjustment is restricted to coarse-pointer staff tablets, including wide iPad landscape",
);
assert.doesNotMatch(
  touchBlock,
  /max-width:\s*1180px/,
  "the tablet shell selector—not an 1180px media cap—keeps the 1366px iPad landscape profile in scope",
);

assert.match(
  touchBlock,
  /#playEditorOverlay[\s\S]*?\.pb-editor-nav \{[\s\S]*?width: var\(--tap-min\);[\s\S]*?min-height: var\(--tap-min\);[\s\S]*?\.pb-personnel-variant-choice \{[\s\S]*?min-width: var\(--tap-min\);[\s\S]*?min-height: var\(--tap-min\);/,
  "the live editor's previous/next and personnel-version controls reach the touch floor",
);

assert.match(
  touchBlock,
  /#playbookSanitizeOverlay[\s\S]*?\.pb-sanitize-close-btn \{[\s\S]*?width: var\(--tap-min\);[\s\S]*?min-height: var\(--tap-min\);[\s\S]*?\.pb-sanitize-field-picker,[\s\S]*?\.pb-sanitize-standardize-action select,[\s\S]*?#pbSanitizeMergeTarget[\s\S]*?height: var\(--tap-min\);[\s\S]*?\.pb-sanitize-input \{[\s\S]*?min-height: var\(--tap-min\);/,
  "Data Cleanup gives its close control and inputs an explicit tablet target, including a WebKit-safe select height",
);

assert.match(
  touchBlock,
  /\.pb-sanitize-toggle,[\s\S]*?\.pb-sanitize-edit-btn,[\s\S]*?\.pb-sanitize-suggest-chip,[\s\S]*?\.pb-sanitize-suggest-keep,[\s\S]*?\.pb-sanitize-focus-head \.btn,[\s\S]*?\.pb-sanitize-standardize-action \.btn[\s\S]*?min-width: var\(--tap-min\);[\s\S]*?min-height: var\(--tap-min\);/,
  "Data Cleanup's live toggle, edit, suggestion, keep, merge, and standardize actions are independently tappable",
);

assert.match(
  touchBlock,
  /#playbookCatCleanupOverlay[\s\S]*?\.cat-cleanup-cat-label[\s\S]*?select \{[\s\S]*?height: var\(--tap-min\);[\s\S]*?min-height: var\(--tap-min\);[\s\S]*?\.cat-cleanup-scope[\s\S]*?label,[\s\S]*?\.cat-cleanup-pill,[\s\S]*?\.cat-cleanup-chip,[\s\S]*?\.cat-cleanup-bulk[\s\S]*?\.btn[\s\S]*?min-height: var\(--tap-min\);/,
  "Category Cleanup gives its native chooser a WebKit-safe height and makes scope, filter, type, and bulk controls tablet-safe",
);

assert.match(
  touchBlock,
  /\.cat-cleanup-search-wrap[\s\S]*?input\[type="search"\] \{[\s\S]*?padding-right: calc\(var\(--tap-min\) \+ 8px\);[\s\S]*?\.cat-cleanup-search-clear \{[\s\S]*?width: var\(--tap-min\);[\s\S]*?height: var\(--tap-min\);[\s\S]*?\.cat-cleanup-row \{[\s\S]*?min-height: var\(--tap-min\);/,
  "Category Cleanup preserves text clearance around its full target clear control and keeps each result row tappable",
);

assert.match(index, /id="playEditorOverlay"[\s\S]*?class="[^"]*pb-editor-nav[^"]*"[\s\S]*?id="playbookSanitizeOverlay"[\s\S]*?class="pb-sanitize-close-btn"/, "the persistent editor and Data Cleanup targets remain live DOM controls");
assert.match(editor, /function openPlayEditor\(filteredIdx\)[\s\S]*?_populateEditorForm\(play, false\)/, "the editor test uses the production editor flow");
assert.match(sanitize, /function openPlaybookSanitize\(options = \{\}\)[\s\S]*?overlay\.classList\.add\("visible"\)[\s\S]*?_renderSanitizePicker\(\)[\s\S]*?_renderSanitizeList\(\)/, "the cleanup test uses the production cleanup flow");
assert.match(identity, /function openPlaybookCategoryCleanup\(\)[\s\S]*?overlay\.id = "playbookCatCleanupOverlay"[\s\S]*?cat-cleanup-search-clear[\s\S]*?cat-cleanup-bulk/, "the category-cleanup test uses its live generated controls");

assert.doesNotMatch(
  touchBlock,
  /#pbPrintPanel|\.pb-drawer|@media print|#playbookTable|pb-balance|playerPlaybookSummary|shell-phone/,
  "the narrow tablet adjustment does not leak into Print, reports, player study, phone, or dense table controls",
);

console.log("Playbook authoring and cleanup tablet touch contract passed");
