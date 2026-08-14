/**
 * T-011c — shared reorder-dialog layer contract.
 *
 * `showReorderModal` is a cross-workbench helper. Keep its nested-layer,
 * viewport, focus, and touch move semantics explicit without duplicating the
 * six callers' data transformations in a second implementation.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
const [helpers, css, scriptSelection, scriptSort, callSheetSort, wristbandSort, wristbandPopup, gamePlanActions] = await Promise.all([
  read("js/dom-helpers.js"),
  read("css/components.css"),
  read("js/script-selection.js"),
  read("js/script-sort.js"),
  read("js/callsheet-sort.js"),
  read("js/wristband-sort.js"),
  read("js/wristband-cell-popup.js"),
  read("js/gameplan-actions.js"),
]);

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `could not isolate ${start}`);
  return source.slice(from, to);
}

const reorder = between(
  helpers,
  "function showReorderModal",
  "// ============================================================\n// Page-Help Persistence",
);

assert.match(
  reorder,
  /const layerId = "reorder-modal";[\s\S]*?const sourceValues = Array\.isArray\(values\) \? values : \[\];[\s\S]*?_reorderTempOrder = \[\.\.\.sourceValues\];/,
  "the singleton reorder layer uses a stable managed id and copies caller values without changing their identity semantics",
);
assert.match(
  reorder,
  /openLayer\(overlay, \{[\s\S]*?id: layerId,[\s\S]*?exclusive: false,[\s\S]*?blocking: true,[\s\S]*?safeArea: true,[\s\S]*?scrollElement: body,[\s\S]*?initialFocus: closeButton \|\| overlay,[\s\S]*?onEscape: \(\) => close\(\),[\s\S]*?returnFocus: true,/,
  "reorder opens as a blocking, safe-area, nested-safe managed layer with a named body scroll owner, Close focus, Escape, and return focus",
);
assert.match(
  reorder,
  /function close\(options = \{\}\) \{[\s\S]*?closeLayer\(layerId, \{ returnFocus: options\.returnFocus !== false \}\);[\s\S]*?if \(el\) el\.remove\(\);/,
  "each close path unregisters the layer before removing its dynamic DOM",
);
assert.match(
  reorder,
  /role="dialog" aria-modal="true" aria-labelledby="reorderModalTitle"[\s\S]*?class="reorder-modal-body"[\s\S]*?id="\$\{listId\}" class="custom-order-list" role="list"/,
  "the dialog names its one inner body/list region for assistive technology and scrolling",
);
assert.match(
  reorder,
  /data-reorder-move="up"[\s\S]*?data-reorder-move="down"[\s\S]*?const moveItem = \(sourceIdx, delta\) => \{[\s\S]*?_reorderTempOrder\.splice\(sourceIdx, 1\)[\s\S]*?_reorderTempOrder\.splice\(targetIdx, 0, moved\)/,
  "deterministic up/down controls move the same ordered values used by drag-and-drop",
);
assert.match(
  reorder,
  /const continuedMove = movedRow\?\.querySelector\([\s\S]*?focusLayerElement\(continuedMove \|\| fallbackMove\);/,
  "a deterministic move preserves keyboard focus after list re-rendering",
);

assert.match(
  css,
  /\.reorder-modal-overlay \{[\s\S]*?z-index: calc\(var\(--z-modal-top\) \+ 1\);/,
  "the shared reorder layer stacks above legacy top-level modals",
);
assert.match(
  css,
  /\.reorder-modal-overlay\.app-layer-active \{[\s\S]*?height: var\(--app-visual-viewport-height\);[\s\S]*?overflow: hidden;/,
  "the outer reorder layer follows the visual viewport and never becomes a second scroller",
);
assert.match(
  css,
  /\.reorder-modal-dialog \{[\s\S]*?max-height: var\(--app-layer-usable-height\);[\s\S]*?overflow: hidden;/,
  "the dialog uses the shared safe usable height",
);
assert.match(
  css,
  /\.reorder-modal-body \{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-height: 0;[\s\S]*?overflow: auto;[\s\S]*?overscroll-behavior: contain;/,
  "the named dialog body is the one interior scroll owner",
);
assert.match(
  css,
  /\.reorder-modal-body \.custom-order-list \{[\s\S]*?max-height: none;[\s\S]*?overflow: visible;/,
  "the list does not introduce a nested capped scroller",
);
assert.match(
  css,
  /@media screen and \(pointer: coarse\),[\s\S]*?\.reorder-modal-close,[\s\S]*?\.reorder-modal-move \{[\s\S]*?width: 44px;[\s\S]*?min-height: 44px;/,
  "iPad/touch Close and move controls meet the 44px target floor",
);

assert.match(
  scriptSelection,
  /if \(selectedPeriod === null\) return;[\s\S]*?await new Promise\(\(resolve\) => setTimeout\(resolve, 210\)\);[\s\S]*?openPeriodReorderModal\(selectedPeriod\);/,
  "only the Script multi-period chooser waits for its list-picker focus teardown before opening reorder",
);

const callerContracts = [
  [scriptSelection, "Script play/period reorder"],
  [scriptSort, "Script custom sort"],
  [callSheetSort, "Call Sheet custom sort"],
  [wristbandSort, "Wristband custom sort"],
  [wristbandPopup, "Wristband cell component reorder"],
  [gamePlanActions, "Game Plan box reorder"],
];
callerContracts.forEach(([source, name]) => {
  assert.match(source, /showReorderModal\(/, `${name} still uses the shared helper`);
});
assert.match(
  wristbandPopup,
  /while \(idsByLabel\.has\(unique\)\)[\s\S]*?showReorderModal\(labels,[\s\S]*?idsByLabel\.get\(label\)/,
  "the Wristband component caller retains duplicate-label disambiguation and id restoration",
);
assert.match(
  gamePlanActions,
  /const idsByLabel = new Map\(\);[\s\S]*?showReorderModal\(labels,[\s\S]*?newOrder\.map\(\(lab\) => idsByLabel\.get\(lab\)\)/,
  "the Game Plan caller retains its label-to-box-id mapping",
);

console.log("reorder modal layer contract: nested layer lifecycle, one scroller, touch moves, and six caller mappings passed");
