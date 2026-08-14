/**
 * Playbook report tablet-layer contract.
 *
 * Balance, Situation Coverage, Touches, and Data Health are full blocking
 * reports—not contextual Playbook drawers. Keep their layer lifecycle and
 * tablet visual-viewport ownership explicit without widening the change to
 * the Print drawer. The deferred cleanup/report family has its own scoped
 * contract and tablet block.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const [reports, healthRender, css] = await Promise.all([
  source("js/playbook-reports.js"),
  source("js/playbook-analytics-render.js"),
  source("css/playbook.css"),
]);

assert.match(
  reports,
  /function _pbOpenReportLayer\(overlay, options\) \{[\s\S]*?openLayer\(overlay, \{[\s\S]*?id: layerId,[\s\S]*?scrollElement,[\s\S]*?blocking: true,[\s\S]*?safeArea: true,[\s\S]*?initialFocus,[\s\S]*?onEscape,[\s\S]*?if \(typeof trapFocus === "function"\) trapFocus\(overlay\);[\s\S]*?initialFocus\?\.focus\?\.\(\{ preventScroll: true \}\);/,
  "the shared Playbook report opener uses LayerManager with a safe-area, scroll, focus, and Escape contract",
);
assert.match(
  reports,
  /function _pbCloseReportLayer\(overlay, layerId, options = \{\}\) \{[\s\S]*?closeLayer\(layerId, \{ returnFocus: options\.returnFocus !== false \}\);[\s\S]*?overlay\.classList\.remove\("visible"\);[\s\S]*?setTimeout\(\(\) => overlay\.remove\(\), 180\);/,
  "a report releases its LayerManager registration before its dynamic DOM is removed",
);

for (const [openFn, closeFn, overlayId, layerId, scrollSelector] of [
  [
    "openPlaybookBalanceReport",
    "closePlaybookBalanceReport",
    "playbookBalanceOverlay",
    "playbook-balance-report",
    ".pb-balance-body",
  ],
  [
    "openPlaybookSituationCoverage",
    "closePlaybookSituationCoverage",
    "playbookSituationOverlay",
    "playbook-situation-report",
    ".pb-balance-body",
  ],
  [
    "openPlaybookTouchReport",
    "closePlaybookTouchReport",
    "playbookTouchOverlay",
    "playbook-touch-report",
    ".pb-balance-body",
  ],
]) {
  assert.match(
    reports,
    new RegExp(
      `function ${openFn}\\(\\)[\\s\\S]*?_pbDiscardReportOverlay\\("${overlayId}", "${layerId}"\\)[\\s\\S]*?const closeButton = overlay\\.querySelector\\("\\.modal-close"\\);[\\s\\S]*?_pbOpenReportLayer\\(overlay, \\{[\\s\\S]*?layerId: "${layerId}",[\\s\\S]*?scrollElement: overlay\\.querySelector\\("${scrollSelector}"\\) \\|\\| overlay,[\\s\\S]*?initialFocus: closeButton \\|\\| overlay,[\\s\\S]*?onEscape: \\(\\) => ${closeFn}\\(\\),`,
    ),
    `${openFn} opens a named blocking layer with its report body as the scroll owner`,
  );
  assert.match(
    reports,
    new RegExp(
      `function ${closeFn}\\(options = \\{\\}\\) \\{[\\s\\S]*?_pbCloseReportLayer\\(overlay, "${layerId}", options\\);`,
    ),
    `${closeFn} returns focus by default through the shared report closer`,
  );
}

assert.match(
  healthRender,
  /function openPlaybookDataHealth\(\)[\s\S]*?_pbDiscardReportOverlay\("playbookDataHealthOverlay", "playbook-data-health-report"\)[\s\S]*?const closeButton = overlay\.querySelector\("\.modal-close"\);[\s\S]*?_pbOpenReportLayer\(overlay, \{[\s\S]*?layerId: "playbook-data-health-report",[\s\S]*?scrollElement: overlay\.querySelector\("#playbookDataHealthBody"\) \|\| overlay,[\s\S]*?initialFocus: closeButton \|\| overlay,[\s\S]*?onEscape: \(\) => closePlaybookDataHealth\(\),/,
  "Data Health uses the report-layer lifecycle even though its renderer is deferred separately",
);
assert.match(
  healthRender,
  /function closePlaybookDataHealth\(options = \{\}\) \{[\s\S]*?_pbCloseReportLayer\(overlay, "playbook-data-health-report", options\);/,
  "Data Health releases its layer before removal and returns focus on normal close",
);

const tabletStart = css.indexOf("/* Tablet report layers use the measured visual viewport.");
const tabletEnd = css.indexOf(".pb-health-summary", tabletStart);
const tabletBlock = css.slice(tabletStart, tabletEnd);
assert.ok(tabletBlock.length > 0, "Playbook defines a scoped tablet report-layer rule");
for (const overlayId of [
  "#playbookBalanceOverlay",
  "#playbookSituationOverlay",
  "#playbookTouchOverlay",
  "#playbookDataHealthOverlay",
]) {
  assert.match(tabletBlock, new RegExp(overlayId), `${overlayId} participates in the tablet report-layer rule`);
}
assert.doesNotMatch(tabletBlock, /#pbPrintPanel/, "the report safety rule does not widen into the contextual Print drawer");
assert.match(
  tabletBlock,
  /\.app-layer-active \{[\s\S]*?bottom: auto;[\s\S]*?height: calc\(var\(--app-vh, 1vh\) \* 100\);[\s\S]*?overflow: hidden;/,
  "tablet reports are bounded by the measured visual viewport",
);
assert.match(
  tabletBlock,
  /:is\(\.pb-balance-body, \.pb-health-body\) \{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-height: 0;[\s\S]*?max-height: none;[\s\S]*?overflow: auto;/,
  "report bodies become the one primary tablet scroll owner",
);
assert.match(
  tabletBlock,
  /\.modal-close \{[\s\S]*?min-width: var\(--tap-min\);[\s\S]*?min-height: var\(--tap-min\);/,
  "the report close target meets the tablet control size contract",
);

console.log("playbook report layer contract: blocking lifecycle and tablet geometry passed");
