/**
 * T-009 P1 Script secondary editor touch-control contract.
 *
 * Keep the dense desktop worksheet and phone run view unchanged while the
 * independent coach-tablet actions that open/mutate personnel and periods
 * retain 44px hit areas.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const [scriptShared, scriptPeriods, scriptCss] = await Promise.all([
  source("js/script-shared.js"),
  source("js/script-periods.js"),
  source("css/script.css"),
]);

assert.match(
  scriptShared,
  /script-personnel-override-btn--quick[\s\S]*?data-action="openScriptPersonnelOverrideModal"[\s\S]*?aria-label=/,
  "the compact Script row keeps a named personnel-entry action",
);
assert.match(
  scriptShared,
  /scriptPersonnelOverrideModalOverlay[\s\S]*?script-personnel-override-choice[\s\S]*?data-personnel-variant-id=[\s\S]*?script-personnel-legacy-options/,
  "the real personnel modal still renders approved choices and the legacy disclosure",
);
assert.match(
  scriptPeriods,
  /period-create-presets[\s\S]*?class="pcf-preset"[\s\S]*?data-action="setPeriodPreset"[\s\S]*?Goal Line/,
  "New Period keeps its real quick presets",
);
assert.match(
  scriptPeriods,
  /script-period-color-palette--create[\s\S]*?renderScriptPeriodPaletteButtons[\s\S]*?script-period-custom-color/,
  "New Period keeps standard and custom color choices",
);
assert.match(
  scriptPeriods,
  /class="ph-color-palette-btn"[\s\S]*?data-action="openScriptPeriodColorPalette"/,
  "each live period keeps its dedicated color-entry action",
);

const touchBlockStart = scriptCss.indexOf("/* T-009 P1 — Script secondary editor touch targets.");
const touchBlock = scriptCss.slice(touchBlockStart);
const touchRules = touchBlock.replace(/\/\*[\s\S]*?\*\//g, "");
assert.ok(touchBlockStart >= 0, "Script secondary touch behavior has a dedicated Script stylesheet block");
assert.match(
  touchBlock,
  /@media screen and \(pointer: coarse\) \{[\s\S]*?body\.shell-tablet\.is-mobile-screen\.is-staff-mobile-shell[\s\S]*?\.script-personnel-override-btn--quick \{[\s\S]*?width: var\(--tap-min\);[\s\S]*?height: var\(--tap-min\);/,
  "the compact row personnel entry is a 44px coach-tablet target",
);
assert.match(
  touchBlock,
  /#scriptPersonnelOverrideModalOverlay[\s\S]*?\.script-personnel-override-choice[\s\S]*?\.script-personnel-legacy-options > summary[\s\S]*?min-width: var\(--tap-min\);[\s\S]*?min-height: var\(--tap-min\);/,
  "personnel choices and their legacy disclosure remain independent 44px targets",
);
assert.match(
  touchBlock,
  /#scriptPersonnelOverrideModalOverlay[\s\S]*?\.modal-close-btn,[\s\S]*?#scriptPeriodColorModalOverlay[\s\S]*?\.modal-close-btn \{[\s\S]*?width: var\(--tap-min\);[\s\S]*?height: var\(--tap-min\);/,
  "the adjacent personnel and color modal close actions are 44px targets",
);
assert.match(
  touchBlock,
  /\.ph-color-palette-btn,[\s\S]*?\.script-period-color-swatch,[\s\S]*?\.pcf-preset \{[\s\S]*?min-width: var\(--tap-min\);[\s\S]*?min-height: var\(--tap-min\);/,
  "live period color entry, standard swatches, and quick presets are touch-safe",
);
assert.match(
  touchBlock,
  /\.script-period-custom-color[\s\S]*?input \{[\s\S]*?width: var\(--tap-min\);[\s\S]*?height: var\(--tap-min\);/,
  "the custom color input remains usable beside its standard swatches",
);
assert.doesNotMatch(
  touchRules,
  /@media print|shell-phone/,
  "the targeted tablet-only adjustment does not alter print or phone intent",
);
assert.match(
  touchRules,
  /period-create-overlay:not\(\.template-picker-overlay\)/,
  "the quick-preset adjustment explicitly leaves the distinct template picker alone",
);

console.log("T-009 Script secondary touch contract passed");
