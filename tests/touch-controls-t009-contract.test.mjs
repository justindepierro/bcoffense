/**
 * T-009 P0 touch-control contract.
 *
 * Keep the Player Wristband reset as a separate coarse-pointer grid action
 * (never an enlarged overlay on its input), and keep the Period Manager's
 * touch sizing/lifecycle local to that modal.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const [wristbandChrome, wristbandCss, scriptPeriods, scriptCss] = await Promise.all([
  source("js/wristband-chrome.js"),
  source("css/wristband.css"),
  source("js/script-periods.js"),
  source("css/script.css"),
]);

assert.match(
  wristbandChrome,
  /let hasPlayerAssignmentReset = false;[\s\S]*?if \(hasOverride\) hasPlayerAssignmentReset = true;[\s\S]*?pc-assignment-cell\$\{hasOverride \? " pc-assignment-cell--has-reset" : ""\}[\s\S]*?<button type="button" class="pc-resp-reset"[\s\S]*?grid\.classList\.toggle\("pc-grid-has-reset", hasPlayerAssignmentReset\);/,
  "Player Wristband marks only reset-bearing cells/grids for the touch reflow",
);

const wristbandTouchBlock = wristbandCss.slice(
  wristbandCss.indexOf("/* Player Wristband reset used to be a 14px overlay"),
  wristbandCss.indexOf("body.shell-phone #wristband .wb-phone-editor-card"),
);
assert.ok(wristbandTouchBlock.length > 0, "Player Wristband defines a dedicated touch-reset rule");
assert.match(
  wristbandTouchBlock,
  /@media screen and \(pointer: coarse\) \{[\s\S]*?\.pc-grid-has-reset \{[\s\S]*?height: auto !important;[\s\S]*?grid-template-rows: repeat\(20, minmax\(var\(--tap-min\), auto\)\) !important;/,
  "a reset-bearing Player Wristband becomes a real touch row layout",
);
assert.match(
  wristbandTouchBlock,
  /\.pc-assignment-cell--has-reset \{[\s\S]*?grid-template-columns: var\(--tap-min\) minmax\(0, 1fr\) var\(--tap-min\);/,
  "the reset owns a distinct column beside the select and textarea",
);
assert.match(
  wristbandTouchBlock,
  /\.pc-assignment-cell--has-reset \.pc-resp-reset \{[\s\S]*?position: static;[\s\S]*?width: var\(--tap-min\);[\s\S]*?height: var\(--tap-min\);/,
  "the touch reset is a true 44px in-flow control rather than an input overlay",
);
assert.doesNotMatch(
  wristbandTouchBlock,
  /@media print/,
  "the editor-only reset reflow does not alter print output",
);

assert.match(
  scriptPeriods,
  /class="modal-close-btn script-period-manager-close"[\s\S]*?script-period-manager-footer-action[\s\S]*?initialFocus: closeButton \|\| overlay,[\s\S]*?onEscape: \(\) => closeScriptPeriodManager\(\),/,
  "Period Manager has a named, initially focused managed close target",
);
assert.match(
  scriptPeriods,
  /class="btn btn-sm script-period-manager-action"[\s\S]*?class="btn btn-sm btn-danger script-period-manager-action script-period-manager-delete"/,
  "all row actions, including Delete, have the scoped touch-action class",
);
assert.match(
  scriptPeriods,
  /function closeScriptPeriodManager\(eventOrOptions = \{\}\) \{[\s\S]*?closeLayer\("scriptPeriodManagerModal", isEvent \? \{\} : eventOrOptions\);[\s\S]*?overlay\?\.remove\(\);/,
  "Period Manager closes its existing layer before removing the overlay",
);

const periodTouchBlock = scriptCss.slice(
  scriptCss.indexOf("/* Period Manager is a coach touch surface."),
  scriptCss.indexOf(".script-period-color-palette"),
);
assert.ok(periodTouchBlock.length > 0, "Period Manager defines a scoped coarse-pointer rule");
assert.match(
  periodTouchBlock,
  /@media screen and \(pointer: coarse\) \{[\s\S]*?#scriptPeriodManagerModal \.script-period-manager-actions \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?\.script-period-manager-action,[\s\S]*?\.script-period-manager-footer-action \{[\s\S]*?min-width: var\(--tap-min\);[\s\S]*?min-height: var\(--tap-min\);/,
  "Period Manager row/footer actions reflow to 44px touch controls",
);
assert.match(
  periodTouchBlock,
  /#scriptPeriodManagerModal \.script-period-manager-close \{[\s\S]*?width: var\(--tap-min\);[\s\S]*?height: var\(--tap-min\);/,
  "Period Manager has a 44px header Close target",
);
assert.doesNotMatch(
  periodTouchBlock,
  /#scriptPeriodColorModalOverlay|@media print/,
  "the P0 Period Manager rule does not widen into color/print workflows",
);

console.log("T-009 touch controls contract: Player Wristband reset and Period Manager passed");
