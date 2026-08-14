/**
 * Deferred Playbook blocking-layer contract.
 *
 * Category Cleanup, Constraint Map, and Identity Alignment are coach reports
 * that load after first paint. Keep their full dialog lifecycle explicit
 * without widening the work to the intentionally nonblocking Print drawer.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const [reportHelpers, identityReports, categoryCleanup, css] = await Promise.all([
  source("js/playbook-reports.js"),
  source("js/playbook-reports-identity.js"),
  source("js/playbook-identity.js"),
  source("css/playbook.css"),
]);

assert.match(
  reportHelpers,
  /function _pbOpenReportLayer\(overlay, options\) \{[\s\S]*?openLayer\(overlay, \{[\s\S]*?id: layerId,[\s\S]*?scrollElement,[\s\S]*?blocking: true,[\s\S]*?safeArea: true,[\s\S]*?initialFocus,[\s\S]*?onEscape,/,
  "deferred Playbook reports share the safe-area blocking-layer opener",
);
assert.match(
  reportHelpers,
  /function _pbCloseReportLayer\(overlay, layerId, options = \{\}\) \{[\s\S]*?closeLayer\(layerId, \{ returnFocus: options\.returnFocus !== false \}\);[\s\S]*?overlay\.classList\.remove\("visible"\);[\s\S]*?setTimeout\(\(\) => overlay\.remove\(\), 180\);/,
  "a deferred report releases its managed layer before its dynamic overlay is removed",
);

for (const [openFn, closeFn, overlayId, layerId] of [
  [
    "openPlaybookConstraintMap",
    "closePlaybookConstraintMap",
    "playbookConstraintOverlay",
    "playbook-constraint-report",
  ],
  [
    "openPlaybookIdentityAlignment",
    "closePlaybookIdentityAlignment",
    "playbookIdentityOverlay",
    "playbook-identity-report",
  ],
]) {
  assert.match(
    identityReports,
    new RegExp(
      `function ${openFn}\\(\\)[\\s\\S]*?_pbDiscardReportOverlay\\("${overlayId}", "${layerId}"\\)[\\s\\S]*?const closeButton = overlay\\.querySelector\\("\\.modal-close"\\);[\\s\\S]*?_pbOpenReportLayer\\(overlay, \\{[\\s\\S]*?layerId: "${layerId}",[\\s\\S]*?scrollElement: overlay\\.querySelector\\("\\.pb-balance-body"\\) \\|\\| overlay,[\\s\\S]*?initialFocus: closeButton \\|\\| overlay,[\\s\\S]*?onEscape: \\(\\) => ${closeFn}\\(\\),`,
    ),
    `${openFn} opens a named report layer with its body as the only scroll owner`,
  );
  assert.match(
    identityReports,
    new RegExp(
      `function ${closeFn}\\(options = \\{\\}\\) \\{[\\s\\S]*?_pbCloseReportLayer\\(overlay, "${layerId}", options\\);`,
    ),
    `${closeFn} restores trigger focus by default through the shared closer`,
  );
}

assert.match(
  identityReports,
  /function clearPlaybookConstraintFilters\(\) \{[\s\S]*?closePlaybookConstraintMap\(\{ returnFocus: false \}\)[\s\S]*?requestAnimationFrame\(\(\) => openPlaybookConstraintMap\(\)\);/,
  "Constraint Map suppresses a transient focus return when it immediately rebuilds after clearing filters",
);
assert.match(
  identityReports,
  /function clearPlaybookIdentityFilters\(\) \{[\s\S]*?closePlaybookIdentityAlignment\(\{ returnFocus: false \}\)[\s\S]*?requestAnimationFrame\(\(\) => openPlaybookIdentityAlignment\(\)\);/,
  "Identity Alignment suppresses a transient focus return when it immediately rebuilds after clearing filters",
);

assert.match(
  categoryCleanup,
  /function openPlaybookCategoryCleanup\(\) \{[\s\S]*?_pbDiscardReportOverlay\("playbookCatCleanupOverlay", "playbook-category-cleanup"\)[\s\S]*?pb-category-cleanup-modal[\s\S]*?const closeButton = overlay\.querySelector\("\.modal-close"\);[\s\S]*?_pbOpenReportLayer\(overlay, \{[\s\S]*?layerId: "playbook-category-cleanup",[\s\S]*?scrollElement: overlay\.querySelector\("\.cat-cleanup-body"\) \|\| overlay,[\s\S]*?initialFocus: closeButton \|\| overlay,/,
  "Category Cleanup opens as a named layer with Close as its initial focus and the modal body as its scroll owner",
);
assert.match(
  categoryCleanup,
  /onEscape: \(event\) => \{[\s\S]*?search\?\.id === "catCleanupSearch" && search\.value[\s\S]*?clearPlaybookCategoryCleanupSearch\(\);[\s\S]*?closePlaybookCategoryCleanup\(\);/,
  "Category Cleanup keeps its first-Escape-clears-search behavior under capture-phase LayerManager Escape handling",
);
assert.match(
  categoryCleanup,
  /function closePlaybookCategoryCleanup\(options = \{\}\) \{[\s\S]*?_pbCloseReportLayer\(overlay, "playbook-category-cleanup", options\);/,
  "Category Cleanup releases its managed layer and restores focus before removal",
);
assert.doesNotMatch(
  categoryCleanup,
  /setTimeout\(\(\) => searchInput\?\.focus\(\), 50\)/,
  "Category Cleanup no longer overrides the required initial Close focus with a delayed search focus",
);

const tabletBlockMarker = "/* Category Cleanup, Constraint Map, and Identity Alignment are full blocking";
const tabletBlock = css.slice(css.indexOf(tabletBlockMarker));
assert.ok(tabletBlock.length > 0, "Playbook defines a scoped tablet rule for the deferred blocking family");
for (const overlayId of [
  "#playbookCatCleanupOverlay",
  "#playbookConstraintOverlay",
  "#playbookIdentityOverlay",
]) {
  assert.match(tabletBlock, new RegExp(overlayId), `${overlayId} participates in the deferred tablet-layer rule`);
}
assert.doesNotMatch(
  tabletBlock,
  /#pbPrintPanel/,
  "the intentionally nonblocking Print drawer stays outside the blocking-layer geometry rule",
);
assert.match(
  tabletBlock,
  /\.app-layer-active \{[\s\S]*?bottom: auto;[\s\S]*?height: calc\(var\(--app-vh, 1vh\) \* 100\);[\s\S]*?overflow: hidden;/,
  "the deferred dialogs use the measured visual viewport instead of the layout viewport",
);
assert.match(
  tabletBlock,
  /:is\(\.cat-cleanup-body, \.pb-balance-body\) \{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-height: 0;[\s\S]*?max-height: none;[\s\S]*?overflow: auto;/,
  "each deferred dialog body is its deliberate vertical scroll owner",
);
assert.match(
  tabletBlock,
  /#playbookCatCleanupOverlay[\s\S]*?\.cat-cleanup-list \{[\s\S]*?max-height: none;[\s\S]*?overflow: visible;/,
  "Category Cleanup removes its nested list scroller on tablet",
);
assert.match(
  tabletBlock,
  /\.modal-close \{[\s\S]*?min-width: var\(--tap-min\);[\s\S]*?min-height: var\(--tap-min\);/,
  "the deferred dialogs retain a tablet-sized close target",
);

console.log("playbook deferred layer contract: lifecycle, Escape, and tablet geometry passed");
