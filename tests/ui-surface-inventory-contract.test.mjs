/**
 * Product-surface inventory contract.
 *
 * A global-scope application can otherwise accumulate anonymous overlays,
 * drawers, and panels until no one knows who owns dismissal, focus, or scroll.
 * Keep this registry deliberately explicit: adding a named surface requires an
 * owner, one approved interaction pattern, and one scroll owner.
 */

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");
const APPROVED_PATTERNS = new Set([
  "blocking-layer",
  "nonblocking-drawer",
  "workspace-panel",
  "embedded-panel",
]);
const APPROVED_SCROLL_OWNERS = new Set(["layer", "panel", "workspace", "document"]);

// id: { owner, pattern, scrollOwner }
// The owner is the only file permitted to create the named surface.
const UI_SURFACES = Object.freeze({
  accountSecurityOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  adminBootstrapOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  authoritativeQuizOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  authoritativeQuizPanel: { owner: "index.html", pattern: "embedded-panel", scrollOwner: "panel" },
  aboutBCOffenseOverlay: { owner: "js/auth.js", pattern: "blocking-layer", scrollOwner: "layer" },
  authLoginOverlay: { owner: "js/auth.js", pattern: "blocking-layer", scrollOwner: "layer" },
  bcOffenseTermsOverlay: { owner: "js/auth.js", pattern: "blocking-layer", scrollOwner: "layer" },
  callSheetPickerOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  cellPopupOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  cloudSavedScriptRecoveryOverlay: { owner: "js/script-storage.js", pattern: "blocking-layer", scrollOwner: "layer" },
  cloudSyncOverlay: { owner: "js/cloud-sync.js", pattern: "blocking-layer", scrollOwner: "layer" },
  coachAccessOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  coachPublishStatusPanel: { owner: "index.html", pattern: "embedded-panel", scrollOwner: "workspace" },
  coachQuizRepairOverlay: { owner: "js/script-quiz-foundation.js", pattern: "blocking-layer", scrollOwner: "layer" },
  commandPaletteOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  constraintPanel: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  csAddCategoryOverlay: { owner: "js/callsheet-categories.js", pattern: "blocking-layer", scrollOwner: "layer" },
  csDisplayPanel: { owner: "index.html", pattern: "nonblocking-drawer", scrollOwner: "panel" },
  csLayoutOverlay: { owner: "js/callsheet-layout.js", pattern: "blocking-layer", scrollOwner: "layer" },
  csIndexCardLibraryOverlay: { owner: "js/callsheet-index-cards.js", pattern: "blocking-layer", scrollOwner: "layer" },
  csManagePresetsOverlay: { owner: "js/callsheet-display.js", pattern: "blocking-layer", scrollOwner: "layer" },
  csNotOnSheetPanel: { owner: "index.html", pattern: "embedded-panel", scrollOwner: "workspace" },
  csSortOverlay: { owner: "js/callsheet-sort.js", pattern: "blocking-layer", scrollOwner: "layer" },
  csStatsPanel: { owner: "index.html", pattern: "embedded-panel", scrollOwner: "workspace" },
  csSuggestOverlay: { owner: "js/callsheet-smart.js", pattern: "blocking-layer", scrollOwner: "layer" },
  csTemplateOverlay: { owner: "js/callsheet-templates.js", pattern: "blocking-layer", scrollOwner: "layer" },
  dashFillPickerOverlay: { owner: "js/dashboard.js", pattern: "blocking-layer", scrollOwner: "layer" },
  discMarkupOverlay: { owner: "js/discussion-media.js", pattern: "blocking-layer", scrollOwner: "layer" },
  discAttachmentViewerOverlay: { owner: "js/discussion-media.js", pattern: "blocking-layer", scrollOwner: "layer" },
  discReactionPickerOverlay: { owner: "js/play-discussion.js", pattern: "blocking-layer", scrollOwner: "layer" },
  discReplySheet: { owner: "js/play-discussion.js", pattern: "blocking-layer", scrollOwner: "layer" },
  discReplySheetOverlay: { owner: "js/play-discussion.js", pattern: "blocking-layer", scrollOwner: "layer" },
  globalLoadingOverlay: { owner: "js/playbook-import.js", pattern: "blocking-layer", scrollOwner: "layer" },
  gpBoxInfoOverlay: { owner: "js/gameplan-render.js", pattern: "blocking-layer", scrollOwner: "layer" },
  gpBoxMatchingOverlay: { owner: "js/gameplan-smart.js", pattern: "blocking-layer", scrollOwner: "layer" },
  gpBulkSheetOverlay: { owner: "js/gameplan-render.js", pattern: "blocking-layer", scrollOwner: "layer" },
  gpDiscModalOverlay: { owner: "js/play-discussion.js", pattern: "blocking-layer", scrollOwner: "layer" },
  gpDrawer: { owner: "index.html", pattern: "nonblocking-drawer", scrollOwner: "panel" },
  gpManageBoxesOverlay: { owner: "js/gameplan-actions.js", pattern: "blocking-layer", scrollOwner: "layer" },
  gpPersonnelVariantsPickerOverlay: { owner: "js/gameplan-actions.js", pattern: "blocking-layer", scrollOwner: "layer" },
  gpPrintModalOverlay: { owner: "js/gameplan-print.js", pattern: "blocking-layer", scrollOwner: "layer" },
  gpSmartBuilderOverlay: { owner: "js/gameplan-smart.js", pattern: "blocking-layer", scrollOwner: "layer" },
  gpSortAllBucketsOverlay: { owner: "js/gameplan-actions.js", pattern: "blocking-layer", scrollOwner: "layer" },
  helpOverlay: { owner: "index.html", pattern: "nonblocking-drawer", scrollOwner: "panel" },
  legacyDiagramRecoveryOverlay: { owner: "js/media-inventory.js", pattern: "blocking-layer", scrollOwner: "layer" },
  loadWbToScriptModal: { owner: "js/script-export.js", pattern: "blocking-layer", scrollOwner: "layer" },
  loadWristbandModal: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  mediaInventoryOverlay: { owner: "js/media-inventory.js", pattern: "blocking-layer", scrollOwner: "layer" },
  mobilePrimaryMoreOverlay: { owner: "js/app-shell.js", pattern: "blocking-layer", scrollOwner: "layer" },
  notifDrawer: { owner: "index.html", pattern: "nonblocking-drawer", scrollOwner: "panel" },
  obDetailPanel: { owner: "js/offensebuilder.js", pattern: "workspace-panel", scrollOwner: "workspace" },
  pageActionsSheet: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  pbActionSheet: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  pbCollectionsPanel: { owner: "index.html", pattern: "nonblocking-drawer", scrollOwner: "panel" },
  pbFilterDrawer: { owner: "index.html", pattern: "nonblocking-drawer", scrollOwner: "panel" },
  pbPrintPanel: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  pbWorkflowPanel: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  recoveryCenterOverlay: { owner: "js/app-session.js", pattern: "blocking-layer", scrollOwner: "layer" },
  playbookBalanceOverlay: { owner: "js/playbook-reports.js", pattern: "blocking-layer", scrollOwner: "layer" },
  playbookCatCleanupOverlay: { owner: "js/playbook-identity.js", pattern: "blocking-layer", scrollOwner: "layer" },
  playbookConstraintOverlay: { owner: "js/playbook-reports-identity.js", pattern: "blocking-layer", scrollOwner: "layer" },
  playbookDataHealthOverlay: { owner: "js/playbook-analytics-render.js", pattern: "blocking-layer", scrollOwner: "layer" },
  playbookIdentityOverlay: { owner: "js/playbook-reports-identity.js", pattern: "blocking-layer", scrollOwner: "layer" },
  playbookReadinessPanel: { owner: "index.html", pattern: "embedded-panel", scrollOwner: "workspace" },
  playbookSanitizeOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  playbookSituationOverlay: { owner: "js/playbook-reports.js", pattern: "blocking-layer", scrollOwner: "layer" },
  playbookTouchOverlay: { owner: "js/playbook-reports.js", pattern: "blocking-layer", scrollOwner: "layer" },
  playDiagramHealthOverlay: { owner: "js/play-images.js", pattern: "blocking-layer", scrollOwner: "layer" },
  playEditorOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  playerLeaderboardProfileOverlay: { owner: "js/script-quiz-foundation.js", pattern: "blocking-layer", scrollOwner: "layer" },
  playerLeaderboardProfilePanel: { owner: "js/script-quiz-foundation.js", pattern: "embedded-panel", scrollOwner: "panel" },
  playerPlaybookFilterOverlay: { owner: "js/playbook-filters.js", pattern: "blocking-layer", scrollOwner: "layer" },
  playerPortalOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  playerQuizHubOverlay: { owner: "index.html", pattern: "workspace-panel", scrollOwner: "workspace" },
  playerQuizHubPanel: { owner: "index.html", pattern: "embedded-panel", scrollOwner: "workspace" },
  playersAdminOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  playPresentationDetailPanel: { owner: "index.html", pattern: "nonblocking-drawer", scrollOwner: "panel" },
  playPresentationOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  playReadinessModalOverlay: { owner: "js/play-readiness.js", pattern: "blocking-layer", scrollOwner: "layer" },
  playRuleInheritanceOverlay: { owner: "js/playbook-editor.js", pattern: "blocking-layer", scrollOwner: "layer" },
  ppDiscDrawer: { owner: "index.html", pattern: "nonblocking-drawer", scrollOwner: "panel" },
  printStudioOverlay: { owner: "js/print-studio.js", pattern: "blocking-layer", scrollOwner: "layer" },
  publishMediaOverlay: { owner: "js/play-images.js", pattern: "blocking-layer", scrollOwner: "layer" },
  qInboxOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  quizAssignmentDetailsOverlay: { owner: "js/script-quiz-assignments.js", pattern: "blocking-layer", scrollOwner: "layer" },
  quizAssignmentOverlay: { owner: "js/script-quiz-assignments.js", pattern: "blocking-layer", scrollOwner: "layer" },
  savedScriptsArchiveOverlay: { owner: "js/script-storage.js", pattern: "blocking-layer", scrollOwner: "layer" },
  scoutPresentOverlay: { owner: "js/tendencies.js", pattern: "blocking-layer", scrollOwner: "layer" },
  scriptCallOverrideModalOverlay: { owner: "js/script-shared.js", pattern: "blocking-layer", scrollOwner: "layer" },
  scriptDisplayOverlay: { owner: "index.html", pattern: "nonblocking-drawer", scrollOwner: "panel" },
  scriptPeriodManagerModal: { owner: "js/script-periods.js", pattern: "blocking-layer", scrollOwner: "layer" },
  scriptPeriodColorModalOverlay: { owner: "js/script-periods.js", pattern: "blocking-layer", scrollOwner: "layer" },
  scriptPersonnelOverrideModalOverlay: { owner: "js/script-shared.js", pattern: "blocking-layer", scrollOwner: "layer" },
  scriptQuizOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  scriptShortcutsModal: { owner: "js/script-health.js", pattern: "blocking-layer", scrollOwner: "layer" },
  scriptToolsDrawer: { owner: "index.html", pattern: "nonblocking-drawer", scrollOwner: "panel" },
  scriptWristbandLinkRepairModal: { owner: "js/script-export.js", pattern: "blocking-layer", scrollOwner: "layer" },
  scriptWristbandNumbersModal: { owner: "js/script-export.js", pattern: "blocking-layer", scrollOwner: "layer" },
  shortcutsModal: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  signalClipModalOverlay: { owner: "js/signals.js", pattern: "blocking-layer", scrollOwner: "layer" },
  signalSelectorOverlay: { owner: "js/signals.js", pattern: "blocking-layer", scrollOwner: "layer" },
  signalUploadModalOverlay: { owner: "js/signals.js", pattern: "blocking-layer", scrollOwner: "layer" },
  signalUploadReviewModalOverlay: { owner: "js/signals.js", pattern: "blocking-layer", scrollOwner: "layer" },
  smartScriptModal: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  stagedRestoreOverlay: { owner: "js/staged-restore.js", pattern: "blocking-layer", scrollOwner: "layer" },
  tdColumnPanel: { owner: "js/tendencies-render.js", pattern: "nonblocking-drawer", scrollOwner: "panel" },
  teamPortalSettingsPanel: { owner: "index.html", pattern: "workspace-panel", scrollOwner: "workspace" },
  visionRepPanel: { owner: "js/script-vision.js", pattern: "workspace-panel", scrollOwner: "workspace" },
  wbFindReplaceOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  wbHelpOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  wbLogoCardOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  wbPrintPreviewOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  wbQuickSearchOverlay: { owner: "js/wristband-search.js", pattern: "blocking-layer", scrollOwner: "layer" },
  wbSavedManagerOverlay: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
  wbSettingsModal: { owner: "index.html", pattern: "blocking-layer", scrollOwner: "layer" },
});

// Conceptual command bars are inventory entries too. A new top-level workbench
// must extend an existing owner instead of introducing a floating command row.
const WORKBENCH_TOOLBARS = Object.freeze({
  playbook: { owner: "js/playbook-chrome.js", marker: "function togglePbActionSheet" },
  script: { owner: "js/script-render.js", marker: "function renderScript" },
  callsheet: { owner: "js/callsheet-render.js", marker: "function renderCallSheet" },
  gameplan: { owner: "js/gameplan-render.js", marker: "function renderGamePlan" },
  wristband: { owner: "js/wristband-render.js", marker: "function renderWristbandGrid" },
  signals: { owner: "js/signals.js", marker: "function renderSignals" },
  dashboard: { owner: "js/dashboard-render.js", marker: "function renderDashboard" },
  playerPortal: { owner: "js/player-portal.js", marker: "function openPlayerPortal" },
  settings: { owner: "js/team-settings.js", marker: "function renderTeamSettings" },
});

const files = [
  "index.html",
  ...(await readdir(new URL("js/", `file://${root}/`)))
    .filter((name) => name.endsWith(".js"))
    .map((name) => `js/${name}`),
];
const observed = new Map();
const surfaceIdPattern = /\bid\s*=\s*"([A-Za-z0-9]+(?:Overlay|Modal|Panel|Drawer|Sheet))"|\.id\s*=\s*"([A-Za-z0-9]+(?:Overlay|Modal|Panel|Drawer|Sheet))"/g;

for (const file of files) {
  const content = await source(file);
  for (const match of content.matchAll(surfaceIdPattern)) {
    const id = match[1] || match[2];
    if (!observed.has(id)) observed.set(id, new Set());
    observed.get(id).add(file);
  }
}

for (const [id, owners] of observed) {
  const entry = UI_SURFACES[id];
  assert.ok(entry, `${id} is a named product surface but has no inventory record`);
  assert.ok(APPROVED_PATTERNS.has(entry.pattern), `${id} uses an unapproved interaction pattern`);
  assert.ok(APPROVED_SCROLL_OWNERS.has(entry.scrollOwner), `${id} has no approved scroll owner`);
  assert.deepEqual([...owners], [entry.owner], `${id} must be created only by its declared owner`);
}

for (const [id, entry] of Object.entries(UI_SURFACES)) {
  assert.ok(observed.has(id), `${id} remains in the inventory after its surface was removed`);
  assert.ok(entry.owner && entry.pattern && entry.scrollOwner, `${id} has a complete ownership declaration`);
}

const blockingLayers = Object.values(UI_SURFACES).filter((entry) => entry.pattern === "blocking-layer");
const drawers = Object.values(UI_SURFACES).filter((entry) => entry.pattern === "nonblocking-drawer");
assert.ok(blockingLayers.length > 0 && drawers.length > 0, "the inventory distinguishes blocking dialogs from nonblocking drawers");

const [callSheetCategories, callSheetSmart, callSheetTemplates] = await Promise.all([
  source("js/callsheet-categories.js"),
  source("js/callsheet-smart.js"),
  source("js/callsheet-templates.js"),
]);
for (const [name, content, surfaceId] of [
  ["Call Sheet category editor", callSheetCategories, "csAddCategoryOverlay"],
  ["Call Sheet suggestions", callSheetSmart, "csSuggestOverlay"],
  ["Call Sheet templates", callSheetTemplates, "csTemplateOverlay"],
]) {
  assert.match(content, new RegExp(`openLayer\\(overlay, \\{[\\s\\S]*?id: "${surfaceId}"[\\s\\S]*?scrollElement: overlay\\.querySelector[\\s\\S]*?blocking: true[\\s\\S]*?onEscape:`), `${name} uses the shared blocking-layer lifecycle`);
  assert.match(content, new RegExp(`closeLayer\\("${surfaceId}"`), `${name} releases the shared blocking-layer lifecycle before removal`);
}

const [callSheetPicker, callSheetDisplay, callSheetSort, domHelpers] = await Promise.all([
  source("js/callsheet-picker-runtime.js"),
  source("js/callsheet-display.js"),
  source("js/callsheet-sort.js"),
  source("js/dom-helpers.js"),
]);
for (const [name, surfaceId] of [
  ["Call Sheet play picker", "callSheetPickerOverlay"],
  ["Call Sheet wristband loader", "loadWristbandModal"],
]) {
  assert.match(callSheetPicker, new RegExp(`openLayer\\([^,]+, \\{[\\s\\S]*?id: "${surfaceId}"[\\s\\S]*?scrollElement:[\\s\\S]*?blocking: true[\\s\\S]*?onEscape:`), `${name} uses the shared focus, safe-area, and Escape lifecycle`);
  assert.match(callSheetPicker, new RegExp(`closeLayer\\("${surfaceId}"`), `${name} releases its registered layer before it hides`);
}
assert.match(callSheetDisplay, /id: "csDisplayPanel"[\s\S]*?blocking: false[\s\S]*?trapFocus: false[\s\S]*?onEscape:/, "the Call Sheet display drawer remains nonblocking instead of freezing the workbench");
assert.match(callSheetDisplay, /id: "csManagePresetsOverlay"[\s\S]*?blocking: true[\s\S]*?exclusive: false[\s\S]*?onEscape:/, "display preset management nests above its nonblocking drawer safely");
assert.match(callSheetDisplay, /closeLayer\("csManagePresetsOverlay"/, "display preset management releases its blocking layer before removal");
assert.match(callSheetSort, /id: "csSortOverlay"[\s\S]*?scrollElement:[\s\S]*?blocking: true[\s\S]*?onEscape:/, "Call Sheet sorting uses one shared blocking layer");
assert.match(callSheetSort, /closeCsSortModal\(\{ returnFocus: false \}\)/, "applying a Call Sheet sort releases the modal lifecycle instead of removing the DOM node directly");
assert.match(domHelpers, /function hasBlockingAppLayer\(\)[\s\S]*?state\.blocking/, "layer ownership distinguishes nonblocking drawers from dialogs that lock the page");
assert.match(domHelpers, /if \(!appLayerBodyLockState \|\| hasBlockingAppLayer\(\)\) return;/, "closing a dialog above a drawer releases the page lock when no blocking layer remains");

const [constraintsUi, constraintsCss, indexMarkup, responsiveCss, pageActions] = await Promise.all([
  source("js/constraints-ui.js"),
  source("css/callsheet.css"),
  source("index.html"),
  source("css/responsive.css"),
  source("js/page-actions.js"),
]);
assert.match(indexMarkup, /id="constraintPanel"[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?aria-labelledby="constraintPanelTitle"/, "Game Plan Constraints is exposed as a semantic blocking dialog");
assert.match(indexMarkup, /<h3 id="constraintPanelTitle">[\s\S]*?Game Plan Constraints[\s\S]*?<button type="button" class="cr-close-btn"[\s\S]*?aria-label="Close constraints"/, "Game Plan Constraints has a stable heading and visible close control");
assert.match(constraintsUi, /function runConstraintCheck\(options = \{\}\)[\s\S]*?const body = document\.getElementById\("constraintPanelBody"\);[\s\S]*?const closeButton = panel\.querySelector\("\.cr-close-btn"\);[\s\S]*?const returnFocus = options\?\.returnFocus instanceof HTMLElement[\s\S]*?openLayer\(panel, \{[\s\S]*?id: "constraintPanel"[\s\S]*?scrollElement: body \|\| panel,[\s\S]*?blocking: true,[\s\S]*?initialFocus: closeButton \|\| panel,[\s\S]*?returnFocus,[\s\S]*?onEscape: \(\) => closeConstraintPanel\(\)/, "Game Plan Constraints uses the shared blocking, scroll, initial-focus, return-focus, and Escape lifecycle");
assert.match(pageActions, /label: "Check Constraints",[\s\S]*?handoffFocus: true,[\s\S]*?run: \(options\) => _paCall\("runConstraintCheck", options\)/, "Call Sheet Actions passes its launch focus through to Constraints");
assert.match(pageActions, /function _paRunVerb\(verb, options = \{\}\)[\s\S]*?const handoffOptions = verb\.handoffFocus[\s\S]*?returnFocus: getPageActionsLaunchTrigger\(\)[\s\S]*?verb\.run\(handoffOptions\)/, "Page Actions captures the original external trigger before its delayed dialog handoff");
assert.match(pageActions, /document\.addEventListener\("click", \(event\) => \{[\s\S]*?\[data-action='openPageActions'\][\s\S]*?pageActionsPendingTrigger = trigger;[\s\S]*?function openPageActions\(\)[\s\S]*?const captured = pageActionsPendingTrigger;[\s\S]*?if \(overlay\.dataset\.layerOpen !== "true"\)[\s\S]*?pageActionsLaunchTrigger = captured instanceof HTMLElement[\s\S]*?returnFocus: getPageActionsLaunchTrigger\(\)/, "Page Actions retains its actual touch/keyboard launcher across the delayed Constraints handoff");
assert.match(constraintsUi, /function closeConstraintPanel\(options = \{\}\) \{[\s\S]*?closeLayer\("constraintPanel", options\);[\s\S]*?panel\.classList\.remove\("visible"\)[\s\S]*?panel\.setAttribute\("inert", ""\);/, "Game Plan Constraints releases its app layer before hiding the reusable dialog");
assert.match(constraintsCss, /\.constraint-panel-overlay \{[\s\S]*?height: calc\(var\(--app-vh, 1vh\) \* 100\);[\s\S]*?overflow: hidden;[\s\S]*?overscroll-behavior: contain;/, "Game Plan Constraints uses measured visual viewport height and contains background scrolling");
assert.match(constraintsCss, /\.constraint-panel \{[\s\S]*?width: min\(520px, 100%\);[\s\S]*?min-height: 0;[\s\S]*?max-height: 100%;/, "Game Plan Constraints panel fits within the shared safe-area layer padding");
assert.match(constraintsCss, /\.constraint-panel-body \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;/, "Game Plan Constraints has one deliberate inner scroll region");
assert.match(constraintsCss, /\.cr-close-btn \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/, "Game Plan Constraints close control meets the tablet touch-target floor");
assert.doesNotMatch(responsiveCss, /:is\(\s*\.constraint-panel-overlay,/, "the blocking Constraints dialog stays full-viewport on tablet landscape instead of becoming a contextual rail");

const [scriptShared, scriptPeriods, scriptHealth] = await Promise.all([
  source("js/script-shared.js"),
  source("js/script-periods.js"),
  source("js/script-health.js"),
]);
for (const [name, content, surfaceId] of [
  ["Script personnel override", scriptShared, "scriptPersonnelOverrideModalOverlay"],
  ["Script call wording", scriptShared, "scriptCallOverrideModalOverlay"],
  ["Script period colors", scriptPeriods, "scriptPeriodColorModalOverlay"],
]) {
  assert.match(content, new RegExp(`openLayer\\(overlay, \\{[\\s\\S]*?id: "${surfaceId}"[\\s\\S]*?scrollElement: overlay\\.querySelector[\\s\\S]*?blocking: true`), `${name} uses the shared blocking-layer lifecycle`);
  assert.match(content, new RegExp(`closeLayer\\("${surfaceId}"`), `${name} releases the shared blocking-layer lifecycle before removal`);
}
assert.match(scriptShared, /function wireScriptOverlayDismiss\(overlay\)[\s\S]*?closeLayer\(overlay\.dataset\.layerId \|\| overlay\.id\)[\s\S]*?overlay\.remove\(\)/, "legacy Script backdrop and Escape dismissal releases a registered layer first");
assert.match(scriptHealth, /openLayer\(overlay, \{[\s\S]*?id: "scriptShortcutsModal"[\s\S]*?scrollElement: overlay\.querySelector[\s\S]*?blocking: true[\s\S]*?onEscape:/, "Script shortcuts use the shared focus, safe-area, and Escape lifecycle");
assert.match(scriptHealth, /closeLayer\("scriptShortcutsModal"/, "Script shortcuts release their layer state before their closing animation");

const playersAdmin = await source("js/players-admin.js");
assert.match(playersAdmin, /openLayer\(overlay, \{[\s\S]*?id: "adminBootstrapOverlay"[\s\S]*?scrollElement: overlay\.querySelector[\s\S]*?blocking: true[\s\S]*?onEscape:/, "Admin bootstrap uses the shared blocking-layer lifecycle");
assert.match(playersAdmin, /closeLayer\("adminBootstrapOverlay"/, "Admin bootstrap releases its blocking layer when it closes");

const authClient = await source("js/auth.js");
assert.match(authClient, /openLayer\(overlay, \{[\s\S]*?id: "accountSecurityOverlay"[\s\S]*?scrollElement: overlay\.querySelector[\s\S]*?blocking: true[\s\S]*?onEscape:/, "Account security uses the shared blocking-layer lifecycle");
assert.match(authClient, /closeLayer\("accountSecurityOverlay"/, "Account security releases its blocking layer when it closes");

const [signals, signalsCss] = await Promise.all([
  source("js/signals.js"),
  source("css/signals.css"),
]);
assert.match(signals, /function openSignalSelectorForPlay\(play, options = \{\}\)[\s\S]*?_closeSignalSelector\(\{ returnFocus: false \}\)[\s\S]*?const closeButton = overlay\.querySelector\("\.signals-play-close"\)[\s\S]*?openLayer\(overlay, \{[\s\S]*?id: "signalSelectorOverlay"[\s\S]*?scrollElement: overlay\.querySelector\("\.signals-play-dialog"\) \|\| overlay[\s\S]*?blocking: true[\s\S]*?initialFocus: closeButton[\s\S]*?onEscape: \(\) => closeSignalSelector\(\)/, "Signal selection uses the shared blocking, scroll, focus, and Escape lifecycle");
assert.match(signals, /function _closeSignalSelector\(options = \{\}\)[\s\S]*?closeLayer\(overlay, \{ returnFocus: options\.returnFocus !== false \}\)[\s\S]*?overlay\.remove\(\)[\s\S]*?function closeSignalSelector\(\) \{[\s\S]*?_closeSignalSelector\(\);/, "Signal selection releases its layer before removing the overlay while preserving its public close action");
assert.match(signalsCss, /\.signals-play-overlay \{[\s\S]*?safe-area-inset-top[\s\S]*?safe-area-inset-bottom[\s\S]*?height: calc\(var\(--app-vh, 1vh\) \* 100\)/, "Signal selection uses measured viewport height and safe-area insets");
assert.match(signalsCss, /\.signals-play-dialog \{[\s\S]*?var\(--app-vh, 1vh\)/, "Signal selection dialog fits the usable visual viewport");
assert.match(signalsCss, /\.signals-play-close \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/, "Signal selection close control meets the tablet touch-target floor");

const [playbookRender, playbookCss] = await Promise.all([
  source("js/playbook-render.js"),
  source("css/playbook.css"),
]);
assert.match(indexMarkup, /id="pbWorkflowPanel"[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?aria-labelledby="pbWfPanelTitle"[\s\S]*?aria-hidden="true" inert/, "Playbook Workflow is a semantic dialog while closed");
assert.match(indexMarkup, /id="pbWfPanelClose"[\s\S]*?data-action="closePlayWorkflowPanel"[\s\S]*?aria-label="Close panel"/, "Playbook Workflow has a dedicated close control");
assert.match(playbookRender, /function openPlayWorkflowPanel\(idx\)[\s\S]*?panel\.removeAttribute\("inert"\)[\s\S]*?panel\.setAttribute\("aria-hidden", "false"\)[\s\S]*?panel\.classList\.add\("visible"\)[\s\S]*?openLayer\(panel, \{[\s\S]*?id: "pbWorkflowPanel"[\s\S]*?blocking: true,[\s\S]*?scrollElement: drawer,[\s\S]*?initialFocus: closeButton,[\s\S]*?onEscape: \(\) => closePlayWorkflowPanel\(\)/, "Playbook Workflow uses the shared blocking, scroll, initial-focus, and Escape lifecycle");
assert.match(playbookRender, /function closePlayWorkflowPanel\(options = \{\}\) \{[\s\S]*?closeLayer\(panel,[\s\S]*?panel\.classList\.remove\("visible"\)[\s\S]*?panel\.setAttribute\("inert", ""\);/, "Playbook Workflow releases its app layer before hiding its reusable dialog");
assert.match(playbookCss, /\.pb-wf-panel-overlay\.app-layer-active \{[\s\S]*?height: calc\(var\(--app-vh, 1vh\) \* 100\);/, "Playbook Workflow fits the measured visual viewport when the keyboard opens");
assert.match(playbookCss, /\.pb-wf-panel-close \{[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/, "Playbook Workflow close control meets the tablet touch-target floor");
assert.doesNotMatch(responsiveCss, /body\.shell-tablet\.is-staff-mobile-shell\.is-landscape-screen\s+:is\([\s\S]{0,300}?\.pb-wf-panel-overlay/, "the blocking Workflow dialog stays full-viewport on tablet landscape instead of becoming a contextual rail");

const gamePlanSmart = await source("js/gameplan-smart.js");
for (const [name, surfaceId] of [
  ["Game Plan box matching", "gpBoxMatchingOverlay"],
  ["Game Plan Smart Builder", "gpSmartBuilderOverlay"],
]) {
  assert.match(gamePlanSmart, new RegExp(`openLayer\\(overlay, \\{[\\s\\S]*?id: "${surfaceId}"[\\s\\S]*?scrollElement: overlay\\.querySelector[\\s\\S]*?blocking: true[\\s\\S]*?onEscape:`), `${name} uses the shared blocking-layer lifecycle`);
  assert.match(gamePlanSmart, new RegExp(`closeLayer\\("${surfaceId}"`), `${name} releases the shared blocking-layer lifecycle before removal`);
}

const playbookEditor = await source("js/playbook-editor.js");
assert.match(playbookEditor, /openLayer\(overlay, \{[\s\S]*?id: "playEditorOverlay"[\s\S]*?scrollElement: body \|\| overlay[\s\S]*?blocking: true[\s\S]*?onEscape:/, "the Playbook editor uses the shared blocking-layer lifecycle without resetting its focus target during play-to-play navigation");
assert.match(playbookEditor, /closeLayer\("playEditorOverlay"/, "the Playbook editor releases its layer state before it is hidden");
assert.match(playbookEditor, /openLayer\(overlay, \{[\s\S]*?id: "playRuleInheritanceOverlay"[\s\S]*?blocking: true[\s\S]*?exclusive: false[\s\S]*?onEscape:/, "rule inheritance nests above the editor without unlocking the underlying edit session");
assert.match(playbookEditor, /closeLayer\("playRuleInheritanceOverlay"/, "the rule inheritance picker releases its layer state before removal");

for (const [name, toolbar] of Object.entries(WORKBENCH_TOOLBARS)) {
  const ownerSource = await source(toolbar.owner);
  assert.ok(ownerSource.includes(toolbar.marker), `${name} toolbar has an active declared owner`);
}

console.log(`UI surface inventory contract: ${Object.keys(UI_SURFACES).length} named surfaces and ${Object.keys(WORKBENCH_TOOLBARS).length} workbench toolbars have declared ownership`);
