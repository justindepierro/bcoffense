/**
 * T-011b — Game Plan legacy blocking-dialog contract.
 *
 * These dialogs are dynamically built across three global-scope files. Keep
 * their layer id, focus, safe viewport, and one-scroll-owner rules visible so
 * a later feature change cannot quietly restore bespoke modal behavior.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
const [actions, smart, render, css] = await Promise.all([
  read("js/gameplan-actions.js"),
  read("js/gameplan-smart.js"),
  read("js/gameplan-render.js"),
  read("css/gameplan.css"),
]);

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `could not isolate ${start}`);
  return source.slice(from, to);
}

function assertManagedDialog(source, name, id, bodyClass, closeSelector) {
  assert.match(
    source,
    new RegExp(`id: "${id}"[\\s\\S]*?scrollElement: overlay\\.querySelector\\("\\.${bodyClass}"\\)[\\s\\S]*?blocking: true,[\\s\\S]*?safeArea: true,[\\s\\S]*?initialFocus: closeButton[\\s\\S]*?onEscape:[\\s\\S]*?returnFocus,`),
    `${name} declares its named scroll body, blocking safe-area layer, close focus, Escape, and return focus`,
  );
  assert.match(
    source,
    new RegExp(`class=\\"[^\\"]*${closeSelector}[^\\"]*\\"|${closeSelector}`),
    `${name} has an explicit header Close control`,
  );
}

const sortAll = between(actions, "function openGamePlanSortAllBuckets", "function applyGamePlanSortAllBuckets");
assert.match(sortAll, /gp-sort-all-modal[\s\S]*?gp-sort-all-body/, "Sort All names its dialog and body");
assertManagedDialog(sortAll, "Sort All Buckets", "gpSortAllBucketsOverlay", "gp-sort-all-body", "data-gp-sort-close");
assert.match(sortAll, /const close = \(\) => \{[\s\S]*?if \(closed\) return;[\s\S]*?closeLayer\("gpSortAllBucketsOverlay"\)[\s\S]*?overlay\.classList\.remove\("visible"\)[\s\S]*?overlay\.remove\(\)/, "Sort All closes its layer before its transition removal");

const personnel = between(actions, "function _gpClosePersonnelVariantsPicker", "async function openGamePlanPersonnelVariantsPicker");
assert.match(personnel, /function _gpClosePersonnelVariantsPicker\(options = \{\}\)[\s\S]*?closeLayer\("gpPersonnelVariantsPickerOverlay", \{[\s\S]*?returnFocus: options\.returnFocus !== false,[\s\S]*?overlay\.remove\(\)/, "Personnel picker preserves return focus except an explicit replacement path");
assert.match(personnel, /_gpClosePersonnelVariantsPicker\(\{ returnFocus: false, immediate: true \}\)/, "Personnel picker only suppresses focus while replacing its own existing overlay");
assert.match(personnel, /gp-personnel-variants-picker-body/, "Personnel picker gives LayerManager its actual inner scroll body");
assertManagedDialog(personnel, "Personnel variants", "gpPersonnelVariantsPickerOverlay", "gp-personnel-variants-picker-body", "data-gp-personnel-close");

const manageBoxes = between(actions, "async function openGamePlanManageBoxes", "async function renameAnyGamePlanBox");
assert.match(manageBoxes, /overlay\.id = "gpManageBoxesOverlay"/, "Manage Boxes has a stable overlay id");
assert.match(manageBoxes, /gp-manage-boxes-modal[\s\S]*?gp-manage-boxes-body/, "Manage Boxes names its dialog and body");
assertManagedDialog(manageBoxes, "Manage Boxes", "gpManageBoxesOverlay", "gp-manage-boxes-body", "data-gp-manage-boxes-close");
assert.match(manageBoxes, /const close = \(v\) => \{[\s\S]*?if \(closed\) return;[\s\S]*?closeLayer\("gpManageBoxesOverlay"\)[\s\S]*?overlay\.classList\.remove\("visible"\)[\s\S]*?overlay\.remove\(\)/, "Manage Boxes releases the layer before its animated DOM removal");

const matching = between(smart, "async function editGamePlanBoxMatching", "const GP_BOX_INTENT_TYPES");
assert.match(matching, /gp-box-matching-modal[\s\S]*?gp-box-matching-body/, "Matching Rules names its dialog and body");
assertManagedDialog(matching, "Box matching rules", "gpBoxMatchingOverlay", "gp-box-matching-body", "gpMetaCloseBtn");
assert.match(matching, /function closeGamePlanBoxMatchingModal\(options = \{\}\)[\s\S]*?closeLayer\("gpBoxMatchingOverlay", options\)[\s\S]*?overlay\.remove\(\)/, "Matching Rules releases its registered layer before removal");

const smartBuilder = between(smart, "function openSmartGamePlanBuilder", "function _gpEnsureSmartRecommendationBoxInBoard");
assert.match(smartBuilder, /gp-smart-builder-modal[\s\S]*?gp-smart-builder-body/, "Smart Builder names its dialog and body");
assertManagedDialog(smartBuilder, "Smart Builder", "gpSmartBuilderOverlay", "gp-smart-builder-body", "gpSmartBuilderCloseBtn");
assert.match(smartBuilder, /function closeSmartGamePlanBuilder\(options = \{\}\)[\s\S]*?closeLayer\("gpSmartBuilderOverlay", options\)[\s\S]*?overlay\.remove\(\)/, "Smart Builder releases its registered layer before removal");

const boxInfo = between(render, "function _gpCloseGamePlanBoxInfo", "function _gpRenderBox");
assert.match(boxInfo, /overlay\.id = "gpBoxInfoOverlay"/, "Box Info has a stable overlay id");
assert.match(boxInfo, /gp-info-modal[\s\S]*?gp-info-modal-body/, "Box Info names its dialog and body");
assertManagedDialog(boxInfo, "Box Info", "gpBoxInfoOverlay", "gp-info-modal-body", "data-gp-info-close");
assert.match(boxInfo, /function _gpCloseGamePlanBoxInfo\(options = \{\}\)[\s\S]*?closeLayer\("gpBoxInfoOverlay", options\)[\s\S]*?overlay\.remove\(\)/, "Box Info releases its registered layer before removal");

assert.doesNotMatch(
  `${actions}\n${smart}\n${render}`,
  /scrollElement: overlay\.querySelector\("\.custom-modal"\)/,
  "the migrated Game Plan dialogs do not register their whole modal as a second scroll owner",
);

assert.match(css, /\.gp-modal-layer\.app-layer-active \{[\s\S]*?height: var\(--app-visual-viewport-height\);[\s\S]*?overflow: hidden;/, "legacy Game Plan overlays use the measured visual viewport and do not scroll themselves");
assert.match(css, /\.gp-legacy-modal \{[\s\S]*?max-height: min\(900px, var\(--app-layer-usable-height\)\);[\s\S]*?overflow: hidden;/, "legacy Game Plan dialogs fit the safe usable height");
assert.match(css, /\.gp-modal-scroll \{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-height: 0;[\s\S]*?overflow: auto;[\s\S]*?overscroll-behavior: contain;/, "each legacy dialog has one named inner scroll owner");
assert.match(css, /\.gp-mgb-list \{[\s\S]*?max-height: none;[\s\S]*?overflow: visible;/, "Manage Boxes no longer nests a capped scrolling list inside its modal body");
assert.match(css, /@media screen and \(pointer: coarse\),[\s\S]*?\.gp-legacy-modal :is\([\s\S]*?min-height: 44px;[\s\S]*?\.gp-legacy-modal-close \{[\s\S]*?width: 44px;[\s\S]*?min-height: 44px;/, "tablet/touch editor controls and every Close button meet the 44px target floor");

console.log("game plan legacy dialog layer contract: six managed modal lifecycles and tablet geometry passed");
