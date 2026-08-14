/**
 * T-011e — Game Plan phone Bulk Actions layer contract.
 *
 * The Game Plan root re-renders after each selection mutation, so its phone
 * action sheet must live outside that root and use the shared LayerManager.
 * Keep the small but important portal, focus, viewport, and navigation rules
 * visible in a fast source test.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
const [render, css, navigation, utils] = await Promise.all([
  read("js/gameplan-render.js"),
  read("css/gameplan.css"),
  read("js/app-navigation.js"),
  read("js/utils.js"),
]);

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `could not isolate ${start}`);
  return source.slice(from, to);
}

const library = between(render, "const libraryHtml =", "const boxesHtml =");
assert.match(
  library,
  /id="gpBulkSheetTrigger"[\s\S]*?data-action="openGamePlanBulkSheet"[\s\S]*?aria-haspopup="dialog"[\s\S]*?aria-controls="gpBulkSheetOverlay"/,
  "the phone trigger explicitly opens the named portal dialog",
);
assert.match(
  library,
  /<div class="gp-library-bulk">[\s\S]*?gpAddAllVisibleToBox/,
  "the normal bulk row remains inline for tablet and desktop",
);
assert.doesNotMatch(
  library,
  /gp-bulk-open|gp-bulk-backdrop|toggleGamePlanBulkSheet/,
  "the re-rendered Game Plan root no longer owns the phone sheet or its backdrop",
);

const open = between(render, "function openGamePlanBulkSheet", "function closeGamePlanBulkSheet");
assert.match(open, /_gpIsPhoneBulkSheetViewport\(\)/, "the portal refuses to open outside the phone breakpoint");
assert.match(open, /overlay\.id = "gpBulkSheetOverlay"[\s\S]*?document\.body\.appendChild\(overlay\)/, "the stable overlay is portaled to body");
const markup = between(render, "function _gpBulkSheetMarkup", "function _gpSetBulkSheetTriggerExpanded");
assert.match(markup, /role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?gpBulkSheetTitle/, "the sheet has semantic dialog markup");
assert.match(open, /event\.target === overlay\) closeGamePlanBulkSheet\(\)/, "only the backdrop closes the sheet");
assert.match(
  open,
  /openLayer\(overlay, \{[\s\S]*?id: "gp-bulk-sheet",[\s\S]*?exclusive: false,[\s\S]*?blocking: true,[\s\S]*?safeArea: true,[\s\S]*?scrollElement: scrollBody \|\| overlay,[\s\S]*?initialFocus: closeButton \|\| overlay,[\s\S]*?onEscape: \(\) => closeGamePlanBulkSheet\(\),[\s\S]*?returnFocus:/,
  "the sheet declares a nonexclusive blocking safe-area layer with its actual inner scroll body, Close focus, Escape, and return focus",
);

const close = between(render, "function closeGamePlanBulkSheet", "function toggleGamePlanBulkSheet");
assert.match(close, /closeLayer\("gp-bulk-sheet"/, "the explicit closer releases the LayerManager registration");
assert.match(close, /overlay\.classList\.remove\("visible", "app-layer-active", "app-layer-safe-area"\)/, "the explicit closer hides the portal after releasing its layer");
assert.match(close, /_gpGetBulkSheetReturnTarget/, "a post-rerender trigger remains a valid return-focus fallback");

const phoneCss = between(css, "@media (max-width: 640px)", "  .gp-boxes,");
assert.match(css, /\.gp-bulk-sheet-overlay \{\s*display: none;/, "the portaled sheet has no desktop/tablet presentation");
assert.match(phoneCss, /\.gp-bulk-sheet-overlay\.visible \{[\s\S]*?position: fixed;[\s\S]*?overflow: hidden;/, "the phone backdrop itself never becomes a second scroll owner");
assert.match(phoneCss, /\.gp-bulk-sheet-overlay\.app-layer-active \{[\s\S]*?height: var\(--app-visual-viewport-height\);[\s\S]*?overflow: hidden;/, "the active phone layer follows the measured visual viewport");
assert.match(phoneCss, /\.gp-bulk-sheet \{[\s\S]*?max-height: calc\(var\(--app-visual-viewport-height\) - var\(--app-layer-safe-top\)\);[\s\S]*?overflow: hidden;/, "the sheet fits the safe visual viewport without scrolling itself");
assert.match(phoneCss, /\.gp-bulk-sheet-body \{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-height: 0;[\s\S]*?overflow: auto;[\s\S]*?overscroll-behavior: contain;/, "the sheet body is its one deliberate scroll owner");
assert.match(phoneCss, /\.gp-bulk-close \{[\s\S]*?width: 44px;[\s\S]*?min-height: 44px;/, "the phone Close control meets the 44px target floor");

assert.match(
  navigation,
  /currentActiveTab === "gameplan"[\s\S]*?tabName !== "gameplan"[\s\S]*?closeGamePlanBulkSheet\(\{ returnFocus: false, immediate: true \}\)/,
  "leaving Game Plan releases the portaled layer without stealing focus back into the old tab",
);
assert.match(
  utils,
  /function _openCustomModalLayer\(overlay, id\) \{[\s\S]*?exclusive: false,[\s\S]*?trapFocus: false,/,
  "the existing list picker remains nonexclusive so it can safely sit above Bulk Actions",
);

console.log("game plan phone bulk sheet contract: body portal, managed layer, and phone-only geometry passed");
