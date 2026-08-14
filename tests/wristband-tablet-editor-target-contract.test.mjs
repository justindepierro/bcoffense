/**
 * T-009 P1 — Wristband tablet editor targets.
 *
 * A physical print card may remain dense in print, but the live classic-card
 * editor and print-setup choices are independent touch controls on an iPad.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../css/wristband.css", import.meta.url), "utf8");

const printSetupBlock = css.slice(
  css.indexOf("/* Print setup is an on-screen editor"),
  css.indexOf(".wb-print-preview-canvas {"),
);
assert.ok(printSetupBlock.length > 0, "Wristband print setup has a dedicated touch rule");
assert.match(
  printSetupBlock,
  /@media screen and \(pointer: coarse\) \{[\s\S]*?#wbPrintPreviewOverlay \.wb-print-check-list label,[\s\S]*?#wbPrintPreviewOverlay \.wb-print-toggle \{[\s\S]*?min-height: var\(--tap-min\);/,
  "card/position labels and Blank rule lines are full coarse-pointer targets",
);
assert.match(
  printSetupBlock,
  /#wbPrintPreviewOverlay \.wb-print-check-actions \.btn \{[\s\S]*?min-width: var\(--tap-min\);[\s\S]*?min-height: var\(--tap-min\);/,
  "print setup bulk choices are also usable touch controls",
);
assert.doesNotMatch(printSetupBlock, /\n@media print/, "print setup touch targets do not alter printed output");

const tabletClassicBlock = css.slice(
  css.indexOf("/* A classic wristband is physically compact when printed"),
  css.indexOf("body.shell-phone #wristband .wb-phone-editor-card"),
);
assert.ok(tabletClassicBlock.length > 0, "Classic Wristband has a tablet editor rule");
assert.match(
  tabletClassicBlock,
  /@media screen and \(pointer: coarse\) \{[\s\S]*?body\.shell-tablet\.is-mobile-screen #wristband \.wristband-card:not\(\.pc-card-active\) \{[\s\S]*?height: auto;[\s\S]*?aspect-ratio: auto;/,
  "only a touch tablet's live classic card may grow beyond the physical print ratio",
);
assert.match(
  tabletClassicBlock,
  /\.wristband-grid:not\(\.pc-grid-active\) \{[\s\S]*?grid-template-columns: var\(--tap-min\) minmax\(0, 1fr\) var\(--tap-min\) minmax\(0, 1fr\);[\s\S]*?grid-auto-rows: minmax\(var\(--tap-min\), auto\);[\s\S]*?height: auto;/,
  "the live classic grid retains four-column scanning with 44px rows",
);
assert.match(
  tabletClassicBlock,
  /\.wristband-grid:not\(\.pc-grid-active\) \.wristband-cell \{[\s\S]*?min-height: var\(--tap-min\);/,
  "every live classic grid cell has the tablet target floor",
);
assert.doesNotMatch(tabletClassicBlock, /\n@media print/, "tablet editing geometry never enters print CSS");

console.log("Wristband tablet editor target contract: screen-only classic grid and print setup targets passed");
