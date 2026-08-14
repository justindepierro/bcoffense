/**
 * Call Sheet tablet layer geometry contract.
 *
 * The Call Sheet has several older modal families (sort/layout, index cards,
 * and print proofing).  Keep their safe viewport, scroll, focus, and Escape
 * contracts explicit so a new dialog cannot silently reintroduce a 100vh
 * keyboard trap on iPad.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const [css, layout, print, indexCards] = await Promise.all([
  source("css/callsheet.css"),
  source("js/callsheet-layout.js"),
  source("js/callsheet-print.js"),
  source("js/callsheet-index-cards.js"),
]);

for (const legacyViewportValue of ["92vh", "84vh", "68vh", "64vh"]) {
  assert.doesNotMatch(
    css,
    new RegExp(legacyViewportValue),
    `Call Sheet preview and Index Card modal sizing no longer relies on raw ${legacyViewportValue}`,
  );
}

assert.match(
  css,
  /Tablet layer geometry:[\s\S]*?body\.shell-tablet\.is-mobile-screen\.is-staff-mobile-shell:not\(\[data-auth-role="player"\]\)[\s\S]*?\.cs-index-print-modal-overlay,[\s\S]*?height: calc\(var\(--app-vh, 1vh\) \* 100\);[\s\S]*?overflow: hidden;/,
  "staff tablet Call Sheet blocking layers fit the measured visual viewport instead of the layout viewport",
);
assert.match(
  css,
  /\.app-layer-safe-area \{[\s\S]*?safe-area-inset-top[\s\S]*?safe-area-inset-bottom/,
  "staff tablet Call Sheet layers preserve safe-area padding",
);
assert.match(
  css,
  /#csLayoutOverlay[\s\S]*?\.cs-layout-modal-body \{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-height: 0;[\s\S]*?overflow: auto;[\s\S]*?overscroll-behavior: contain;/,
  "Call Sheet Layout has one deliberate tablet scroll owner",
);
assert.match(
  css,
  /:is\(\.cs-index-print-preview-pages, \.cs-print-preview-pages\) \{[\s\S]*?flex: 1 1 auto;[\s\S]*?max-height: none;[\s\S]*?overflow: auto;/,
  "print previews shrink their proof canvas inside the measured tablet dialog instead of pushing its actions below the keyboard",
);
assert.match(
  css,
  /:is\(\.cs-index-manual-duplex-overlay, \.cs-index-print-modal-overlay, \.cs-print-modal-overlay\)[\s\S]*?\.custom-modal \{[\s\S]*?display: flex;[\s\S]*?max-height: 100%;[\s\S]*?overflow: hidden;/,
  "Call Sheet print option dialogs retain actions while their modal bodies own tablet overflow",
);

assert.match(
  layout,
  /function openCallSheetLayoutModal\(\)[\s\S]*?const modal = overlay\.querySelector\("\.cs-layout-modal"\);[\s\S]*?const closeButton = overlay\.querySelector\("\.cs-sort-close"\);[\s\S]*?openLayer\(overlay, \{[\s\S]*?id: "cs-layout-modal",[\s\S]*?scrollElement: overlay\.querySelector\("\.cs-layout-modal-body"\) \|\| modal \|\| overlay,[\s\S]*?blocking: true,[\s\S]*?initialFocus: closeButton \|\| modal \|\| overlay,[\s\S]*?onEscape: \(\) => closeCallSheetLayoutModal\(\)/,
  "Call Sheet Layout owns focus, Escape, and its body scroll through LayerManager",
);
assert.match(
  layout,
  /function closeCallSheetLayoutModal\(\) \{[\s\S]*?closeLayer\("cs-layout-modal"\)[\s\S]*?overlay\.remove\(\)/,
  "Call Sheet Layout releases the shared layer before removing its dialog",
);

for (const [name, content, functionName, layerId] of [
  [
    "Call Sheet print options",
    print,
    "openCallSheetPrintModal",
    "cs-print-modal",
  ],
  [
    "Call Sheet print preview",
    print,
    "openCallSheetPrintPreview",
    "cs-print-preview",
  ],
  [
    "Index Card manual duplex prompt",
    indexCards,
    "_csIndexManualDuplexPrompt",
    "cs-index-manual-duplex",
  ],
  [
    "Index Card print options",
    indexCards,
    "openCallSheetIndexCardPrintModal",
    "cs-index-print-modal",
  ],
  [
    "Index Card print preview",
    indexCards,
    "openCallSheetIndexCardPrintPreview",
    "cs-index-print-preview",
  ],
]) {
  const escapedFunction = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedLayer = layerId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(
    content,
    new RegExp(
      `function ${escapedFunction}\\([\\s\\S]*?openLayer\\(overlay, \\{[\\s\\S]*?id: "${escapedLayer}",[\\s\\S]*?scrollElement:[\\s\\S]*?blocking: true,[\\s\\S]*?initialFocus:[\\s\\S]*?onEscape:`,
    ),
    `${name} is a blocking LayerManager dialog with one scroll owner, initial focus, and managed Escape`,
  );
}

assert.doesNotMatch(print, /trapFocus: false/, "Call Sheet print surfaces no longer opt out of the shared dialog focus trap");
assert.doesNotMatch(indexCards, /trapFocus: false/, "Index Card print surfaces no longer opt out of the shared dialog focus trap");

console.log("call sheet tablet layer geometry contract: safe viewport, scroll, and focus lifecycle passed");
