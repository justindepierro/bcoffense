/**
 * T-011a — Game Plan index-card and print dialog layer contract.
 *
 * These dialogs are dynamic DOM surfaces, so keep the viewport, scroll, focus,
 * and print separation visible in a fast source contract. The iPad rail spec
 * covers the surrounding workbench independently.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
const [css, indexCards, print] = await Promise.all([
  read("css/gameplan.css"),
  read("js/gameplan-index-cards.js"),
  read("js/gameplan-print.js"),
]);

assert.doesNotMatch(
  css,
  /\.gp-index-modal \{[^}]*92vh/,
  "Game Plan Index Cards do not use the raw 92vh modal cap",
);
assert.match(
  css,
  /\.gp-index-modal \{[^}]*var\(--app-layer-usable-height\)/,
  "Game Plan Index Cards use the shared safe usable-height token",
);
assert.match(
  css,
  /:is\(\.gp-index-overlay, \.gp-print-modal-overlay\)\.app-layer-active \{[\s\S]*?height: var\(--app-visual-viewport-height\);[\s\S]*?overflow: hidden;/,
  "both Game Plan blocking dialogs use the measured visual viewport and keep overflow inside",
);
assert.match(
  css,
  /\.gp-index-scroll,[\s\S]*?\.gp-print-modal-body \{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-height: 0;[\s\S]*?overflow: auto;[\s\S]*?overscroll-behavior: contain;/,
  "each dialog has one explicit inner scroll owner",
);
assert.match(
  css,
  /@media screen and \(pointer: coarse\),[\s\S]*?screen and \(max-width: 820px\) \{[\s\S]*?\.gp-index-modal :is\(\.btn, \.gp-index-bucket-actions button\),[\s\S]*?\.gp-print-modal :is\(\.btn, select, \.gp-print-toggles label\),[\s\S]*?:is\(\.gp-index-close, \.gp-print-close\) \{[\s\S]*?min-height: 44px;/,
  "touch/tablet editor controls upgrade to the 44px target without changing desktop print controls",
);
assert.match(
  css,
  /@media print \{[\s\S]*?body\.gp-index-printing \.gp-index-card \{[\s\S]*?height: 5\.84in;/,
  "the physical 4×6 print card remains separately defined in print styles",
);

assert.match(
  indexCards,
  /function openGamePlanIndexCards\(\)[\s\S]*?openLayer\(overlay, \{[\s\S]*?id: "gp-index-cards",[\s\S]*?blocking: true,[\s\S]*?safeArea: true,[\s\S]*?scrollElement: overlay\.querySelector\("\.gp-index-scroll"\)[\s\S]*?initialFocus: overlay\.querySelector\("\.gp-index-close"\)[\s\S]*?onEscape: \(\) => closeGamePlanIndexCards\(\),[\s\S]*?returnFocus,/,
  "Index Cards declare blocking, safe-area, scroll, initial-focus, Escape, and return-focus lifecycle",
);
assert.match(
  indexCards,
  /function closeGamePlanIndexCards\(\) \{[\s\S]*?closeLayer\("gp-index-cards"\)[\s\S]*?overlay\.remove\(\)/,
  "Index Cards release their shared layer before removal",
);
assert.match(
  indexCards,
  /if \(overlay\.dataset\.layerOpen === "true"[\s\S]*?scrollElement: overlay\.querySelector\("\.gp-index-scroll"\)/,
  "Index Card re-renders refresh the managed inner scroll owner",
);
assert.match(
  indexCards,
  /controls \? `<span class="gp-index-bucket-actions"[\s\S]*?printable \? "gp-index-card-print"/,
  "editor-only bucket controls stay out of printed card markup",
);

assert.match(
  print,
  /async function openGamePlanPrintModal\(\)[\s\S]*?overlay\.className = "custom-modal-overlay gp-print-modal-overlay"[\s\S]*?openLayer\(overlay, \{[\s\S]*?id: "gp-print-modal",[\s\S]*?blocking: true,[\s\S]*?safeArea: true,[\s\S]*?scrollElement: overlay\.querySelector\("\.gp-print-modal-body"\)[\s\S]*?initialFocus: overlay\.querySelector\("#gpPrintClose"\)[\s\S]*?onEscape: \(\) => close\(false\),[\s\S]*?returnFocus,/,
  "Game Plan Print declares the full blocking LayerManager lifecycle",
);
assert.match(
  print,
  /const close = \(ok\) => \{[\s\S]*?if \(closed\) return;[\s\S]*?closeLayer\("gp-print-modal"\)[\s\S]*?resolve\(ok\);/,
  "Game Plan Print settles one close path even when backdrop, Escape, and buttons race",
);
assert.doesNotMatch(
  print,
  /trapFocus: false/,
  "Game Plan Print does not opt out of the shared dialog focus trap",
);

console.log("game plan index/print layer contract: safe viewport, one scroll owner, and managed focus passed");
