/**
 * T-011e — Playbook Print drawer layer contract.
 *
 * Print options retains a familiar side-drawer visual, but it blocks the
 * underlying Playbook workbench while options are being edited. Keep the
 * LayerManager lifecycle, exact return target, and one-scroll-owner rule
 * explicit without affecting printed output.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
const [markup, print, css, inventory] = await Promise.all([
  read("index.html"),
  read("js/playbook-print.js"),
  read("css/playbook.css"),
  read("tests/ui-surface-inventory-contract.test.mjs"),
]);

assert.match(
  markup,
  /id="pbPrintOptionsTrigger"[\s\S]*?data-action="togglePrintOptionsPanel"[\s\S]*?aria-controls="pbPrintPanel"[\s\S]*?aria-expanded="false"/,
  "the real Playbook Print trigger names and owns the reusable dialog",
);
assert.match(
  markup,
  /id="pbPrintPanel"[\s\S]*?aria-hidden="true"[\s\S]*?inert[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?aria-labelledby="pbPrintPanelTitle"/,
  "closed Print options stay inert and expose a semantic modal dialog when opened",
);
assert.match(
  markup,
  /id="pbPrintPanelTitle"[\s\S]*?data-layer-close[\s\S]*?data-action="togglePrintOptionsPanel"[\s\S]*?aria-label="Close print options"/,
  "Print options has a discoverable, explicit Close target",
);

assert.match(
  print,
  /const PB_PRINT_LAYER_ID = "pb-print-panel";[\s\S]*?const PB_PRINT_TRIGGER_ID = "pbPrintOptionsTrigger";/,
  "Print options uses stable layer and trigger identities",
);
assert.match(
  print,
  /function _getPbPrintReturnFocus\(panel, requestedFocus\) \{[\s\S]*?document\.getElementById\(PB_PRINT_TRIGGER_ID\)[\s\S]*?return trigger;/,
  "Print options defaults return focus to its exact real trigger when touch activation does not move focus",
);
assert.match(
  print,
  /function openPrintOptionsPanel\(options = \{\}\) \{[\s\S]*?panel\.classList\.add\("open"\);[\s\S]*?panel\.setAttribute\("aria-hidden", "false"\);[\s\S]*?panel\.removeAttribute\("inert"\);[\s\S]*?renderPbPrintSort\(\);[\s\S]*?openLayer\(panel, \{[\s\S]*?id: PB_PRINT_LAYER_ID,[\s\S]*?exclusive: false,[\s\S]*?blocking: true,[\s\S]*?safeArea: true,[\s\S]*?scrollElement: panel\.querySelector\("\.pb-drawer-body"\) \|\| panel,[\s\S]*?initialFocus: closeButton \|\| panel,[\s\S]*?onEscape: \(\) => closePrintOptionsPanel\(\),[\s\S]*?returnFocus,/,
  "Print options registers a nested-safe blocking safe-area layer with its drawer body, Close focus, Escape, and return focus",
);
assert.match(
  print,
  /function closePrintOptionsPanel\(options = \{\}\) \{[\s\S]*?closeLayer\(PB_PRINT_LAYER_ID, \{ returnFocus: shouldReturnFocus \}\);[\s\S]*?panel\.classList\.remove\("open"\);[\s\S]*?panel\.setAttribute\("aria-hidden", "true"\);[\s\S]*?panel\.setAttribute\("inert", ""\);/,
  "Print options releases the managed layer before making its reusable DOM inert",
);
assert.match(
  print,
  /function togglePrintOptionsPanel\(\) \{[\s\S]*?panel\.classList\.contains\("open"\)[\s\S]*?closePrintOptionsPanel\(\);[\s\S]*?openPrintOptionsPanel\(\);/,
  "the deferred public action remains a stable toggle while using dedicated open and close lifecycles",
);

assert.match(
  css,
  /#pbPrintPanel\.app-layer-active \{[\s\S]*?height: var\(--app-visual-viewport-height\);[\s\S]*?overflow: hidden;/,
  "the Print layer follows the measured visual viewport and never becomes a second scroller",
);
assert.match(
  css,
  /#pbPrintPanel\.app-layer-safe-area \{[\s\S]*?safe-area-inset-top[\s\S]*?safe-area-inset-bottom/,
  "the Print layer accounts for tablet safe-area insets",
);
assert.match(
  css,
  /#pbPrintPanel \.pb-drawer \{[\s\S]*?min-height: 0;[\s\S]*?max-height: 100%;[\s\S]*?overflow: hidden;/,
  "the Print drawer itself does not create another vertical scroll region",
);
assert.match(
  css,
  /#pbPrintPanel \.pb-drawer-body \{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-height: 0;[\s\S]*?overflow: auto;[\s\S]*?overscroll-behavior: contain;/,
  "the named Print drawer body remains the one deliberate interior scroller",
);
assert.match(
  inventory,
  /pbPrintPanel: \{ owner: "index\.html", pattern: "blocking-layer", scrollOwner: "layer" \}/,
  "the product-surface inventory classifies Print options as a blocking layer",
);

console.log("playbook print layer contract: managed blocking drawer, focus return, and scroll ownership passed");
