# AGENTS.md — BCOffense Codebase Guide

> **For AI coding agents** — conventions, architecture, data models, and patterns  
> needed to make correct changes to this project on the first attempt.

---

## Project Overview

**BCOffense** is a football practice management PWA (Progressive Web App) for building practice scripts, wristbands, call sheets, defensive tendency reports, and game plans. The core app runs client-side: most data lives in compressed `localStorage`, the playbook and play images use IndexedDB with fallbacks, playbook data is imported via CSV, and Cloudflare Pages Functions provide a lightweight username/password auth gate for the deployed site.

- **Repo:** `justindepierro/bcoffense` on GitHub
- **Stack:** Vanilla HTML / CSS / JS — zero build tools, no bundler, no npm, no TypeScript
- **Hosting:** Cloudflare Pages (static app + Pages Functions auth); GitHub Pages can still serve static builds but is not the secure entry point
- **Offline:** Service Worker (`sw.js`) with network-first app-shell caching and stale-while-revalidate for other local assets
- **Entry point:** `index.html` (single-page app, all tabs exist in the DOM)

---

## File Structure

```
index.html              ← Single HTML file (all markup, ~3300 lines)
manifest.json           ← PWA manifest
sw.js                   ← Service worker (cache name: bcoffense-vN)
offline.html            ← Offline fallback page

css/
  base.css              ← Design tokens (:root vars), reset, form inputs
  layout.css            ← Header, tab bar, panels, upload screen
  components.css        ← Buttons, modals, toast, badges, utilities
  playbook.css          ← Playbook table, collections, print panel
  signals.css           ← Signal collection tab and component clip UI
  script.css            ← Practice script builder
  play-presentation.css ← Shared landscape play presenter for Playbook and Script
  wristband.css         ← Wristband maker, cards, grid
  callsheet.css         ← Call sheet grid, columns, constraints panel
  tendencies.css        ← Defensive tendencies analysis
  offense-builder.css   ← Offense builder module
  dashboard.css         ← Dashboard, stats, game plan
  gameplan.css          ← Game plan board and print controls
  installation.css      ← Installation guide
  identity.css          ← Offensive identity screens
  print.css             ← Shared/global print rules and cross-module print modes
  responsive.css        ← Shared/global breakpoints

js/
  utils.js              ← Shared utilities, constants, modals, and CSV parser
  app-diagnostics.js    ← Startup diagnostics and boot timeline debug API
  startup-orchestrator.js ← Post-startup task queue and boot-time sync suppression
  history.js            ← Shared undo/redo history manager
  dom-helpers.js        ← Shared DOM sanitization, context menu, long-press, and reorder helpers
  lz-string.min.js      ← Local LZ compression library used by storage.js
  storage.js            ← Storage keys, migrations, backup/restore, and draft persistence
  storage-ui.js         ← Storage-facing backup, restore, and storage info UI
  workspace-sync.js     ← Shared save/cloud/media/player publish queue and status dock
  media-upload-outbox.js ← Durable IndexedDB binary upload intents and server receipts
  play-images.js        ← IndexedDB play-image storage and backup image import/export
  cloud-sync.js         ← Cloudflare-backed complete backup push/pull sync
  staged-restore.js     ← Validated recovery preview, local snapshots, and rollback
  auth.js               ← Server-session readiness, login overlay, and role-based UI restrictions
  play-clips.js         ← Remote play video clips (R2-backed) client API
  signals.js            ← Component-level signal clip collection and resolver
  vision.js             ← Vision mode UI state
  team-settings.js      ← Team identity, roster, packages, depth chart runtime
  playbook.js           ← Shared playbook helpers and compatibility surface
  playbook-collections.js ← Saved collections and collection UI
  playbook-print.js     ← Playbook print/export panel
  playbook-editor.js    ← Play editor modal and edit actions
  playbook-import.js    ← CSV import, hydration, parser, and import loading UI
  playbook-export.js    ← Playbook export helpers
  playbook-chrome.js    ← Playbook toolbar, badges, and chrome actions
  playbook-reports.js   ← Analytics report engines (Balance, Situations, Touches, Complements, Identity)
  playbook-state.js     ← Shared playbook state helpers and filter cache
  playbook-filters.js   ← Playbook filter state and matching
  playbook-navigation.js ← Pagination and table navigation
  playbook-actions.js   ← Row actions and play mutations
  playbook-render.js    ← Playbook table rendering
  playbook-sanitize.js  ← CSV field cleanup tool (field-by-field bulk edit)
  playbook-analytics.js ← Playbook data health center (duplicates, missing fields, vocabulary, category coverage)
  playbook-identity.js  ← Cleanup by call sheet category (identity alignment checker)
  script-*.js           ← Practice script runtime split by concern (state, add, render, storage, integrations, etc.)
  media-inventory.js    ← Cross-media inventory report for diagrams, clips, signals, and quiz readiness
  play-readiness.js     ← Coach-only play readiness scoring model, rep/action report storage, and script row widgets
  play-presentation.js  ← Shared landscape play presentation viewer
  wristband.js          ← Wristband core state, display helpers, and history helpers
  wristband-library.js  ← Wristband library filters, counts, and available plays
  wristband-render.js   ← Wristband grid rendering, colors, clear, auto-fill
  wristband-cards.js    ← Card tabs and card lifecycle
  wristband-export.js   ← Wristband print and CSV export
  wristband-search.js   ← Quick search, favorites, and smart fill
  wristband-modals.js   ← Wristband help and find/replace modals
  wristband-cell-popup.js ← Cell popup editor and pending tag state
  wristband-cell-actions.js ← Cell-level actions, swaps, batch edits, copy/paste
  wristband-sort.js     ← Wristband sorting and reorder helpers
  wristband-storage.js  ← Save/load/draft hydration helpers
  wristband-runtime.js  ← DOMContentLoaded bindings and delegated runtime wiring
  callsheet-render.js   ← Call sheet constants, personnel helpers, live render path (renderCallSheet, renderCategory, renderCallSheetPlay, buildCallSheetPlayParts), display option getters
  callsheet.js          ← Core call sheet state, init, auto-populate orchestration, history, undo/redo, draft lifecycle
  callsheet-print.js    ← Call sheet print modal, print rendering, and print option persistence
  callsheet-sort.js     ← Sort modal, multi-criteria sort state, custom value order, sort execution
  callsheet-filters.js  ← Auto-populate helpers: play matching, coverage/keyword/key-player matching, player auto-fill targets
  callsheet-smart.js    ← Scouting overlay, dead-vs badges, smart suggestions modal
  callsheet-export.js   ← exportCallSheetCSV, isPlayOnCallSheet, getCallSheetPlayLocations
  callsheet-display.js  ← Display options panel: BUILTIN_PRESETS, loadDisplayPreset, saveDisplayPreset, manageDisplayPresets, saveCallSheetDisplayOptions
  callsheet-categories.js ← Call sheet category names, colors, and custom-category CRUD
  callsheet-metadata.js ← Call sheet notes, targets, and category metadata menus
  callsheet-layout.js   ← Call sheet layout/order modal state, drag-drop helpers, smart reorder, and category reset
  callsheet-templates.js ← Call sheet template management: built-in templates, save/load/delete, apply template flow
  callsheet-picker-runtime.js ← Call sheet picker flows, wristband loading, and runtime bindings
  callsheet-gameplan-drawer.js ← Game plan drawer inside the call sheet
  constraints.js        ← Game plan constraints evaluation engine
  script-vision.js      ← Script vision-mode rendering and controls
  tendencies-render.js  ← Defensive tendencies render helpers during split migration
  tendencies.js         ← Defensive tendencies (opponents, wizard, analysis)
  installation-render.js ← Installation render helpers during split migration
  installation.js       ← Installation/help guide
  identity.js           ← Offensive identity runtime
  offensebuilder.js     ← Offense builder tool
  help.js               ← Context-sensitive help content and panel runtime
  dashboard.js          ← Dashboard and game-week runtime
  gameplan.js           ← Game plan core: state, storage, filtering, signatures, init
  gameplan-render.js    ← Game plan rendering (header, library, boxes, chips, scoreboard)
  gameplan-dnd.js       ← Game plan drag & drop wiring
  gameplan-actions.js   ← Game plan box CRUD, per-play flags, selection, density, manage/reorder/hide/rename
  gameplan-smart.js     ← Game plan smart features (criteria detect, suggest fill, templates, health, touches, spotlight, coverage matrix, tendency mirror)
  gameplan-print.js     ← Game plan print modal, print render, and one-page presets
  gameplan-integrations.js ← Game plan push to call sheet/script, dashboard send, plan compare
  gameplan-snapshots.js ← Game plan named snapshots and built-in/reusable templates
  print-studio.js       ← Unified print/export hub, naming conventions, and print-safe checks
  app-events.js         ← Central delegated event routing and DOM listeners
  app-shell.js          ← Theme, chrome, keyboard shortcuts, page-level runtime
  app-session.js        ← Dirty-state and draft-restore session helpers
  app-navigation.js     ← Tab routing and tab index mapping
  app-module-init.js    ← Shared module initialization after playbook load
  app-bootstrap.js      ← Stored-session restore and one-time DOM bootstrap helpers
  app-init.js           ← Top-level app boot and backup wrapper runtime
  app.js                ← Shared global state only

icons/                  ← PWA icons (192px, 512px)
functions/              ← Cloudflare Pages Functions auth middleware and endpoints
scripts/
  deploy-cloudflare.sh  ← Safe Pages deploy; verifies production matches the current commit
_routes.json            ← Cloudflare Pages Function route config protecting every route
CLOUDFLARE_AUTH.md      ← Cloudflare deployment and secret setup notes
```

---

## Script Load Order (Critical)

All scripts use `defer` and load in this exact order from index.html:

```
1.   js/utils.js
2.   js/app-diagnostics.js
3.   js/startup-orchestrator.js
4.   js/history.js
5.   js/dom-helpers.js
6.   js/lz-string.min.js
7.   js/storage.js
8.   js/storage-ui.js
9.   js/workspace-sync.js
10.  js/media-upload-outbox.js
11.   js/play-images.js
12.   js/cloud-sync.js
13.   js/staged-restore.js
14.   js/auth.js
15.   js/play-clips.js
16.   js/signals.js
17.   js/vision.js
18.   js/team-settings.js
19.   js/players-admin.js
20.   js/coach-access.js
21.   js/play-discussion.js
22.   js/playbook.js
22.   js/playbook-collections.js
23.   js/playbook-print.js
24.   js/playbook-editor.js
25.   js/playbook-import.js
26.   js/playbook-export.js
27.   js/playbook-chrome.js
28.   js/playbook-reports.js
29.   js/playbook-reports-identity.js
30.   js/playbook-state.js
31.   js/playbook-filters.js
32.   js/playbook-navigation.js
33.   js/playbook-actions.js
34.   js/playbook-render.js
35.   js/playbook-sanitize.js
36.   js/playbook-analytics.js
37.   js/playbook-analytics-render.js
38.   js/playbook-identity.js
39.   js/script-state.js
40.   js/script-shared.js
41.   js/script-players.js
42.   js/script-display-options.js
43.   js/play-readiness.js
44.   js/script-add.js
45.   js/script-sort.js
46.   js/script-export.js
47.   js/script-available.js
48.   js/script-selection.js
49.   js/script-timeline.js
50.   js/script-render.js
51.   js/script-quiz-state.js
52.   js/script-quiz.js
53.   js/script-quiz-progress.js
54.   js/script-quiz-leaderboard.js
55.   js/player-quiz-sync.js
56.   js/script-quiz-assignments.js
57.   js/script-health.js
58.   js/script-periods.js
59.   js/script-period-sync.js
60.   js/script-smart.js
61.   js/script-storage.js
62.   js/script-player.js
63.   js/media-inventory.js
64.   js/script-integrations.js
64.   js/play-presentation.js
65.   js/wristband.js
66.   js/wristband-library.js
67.   js/wristband-render.js
68.   js/wristband-cards.js
69.   js/wristband-export.js
70.   js/wristband-chrome.js
71.   js/wristband-logo.js
72.   js/wristband-search.js
73.   js/wristband-modals.js
74.   js/wristband-cell-popup.js
75.   js/wristband-cell-actions.js
76.   js/wristband-sort.js
77.   js/wristband-storage.js
78.   js/wristband-runtime.js
79.   js/callsheet-render.js
80.   js/callsheet.js
81.   js/callsheet-print.js
82.   js/callsheet-sort.js
83.   js/callsheet-filters.js
84.   js/callsheet-smart.js
85.   js/callsheet-export.js
86.   js/callsheet-display.js
87.   js/callsheet-categories.js
88.   js/callsheet-metadata.js
89.   js/callsheet-layout.js
90.   js/callsheet-templates.js
91.   js/callsheet-picker-runtime.js
92.   js/callsheet-gameplan-drawer.js
93.   js/constraints.js
94.   js/constraints-ui.js
95.   js/script-vision.js
96.   js/tendencies-render.js
97.   js/tendencies.js
98.   js/tendencies-print.js
99.   js/installation-render.js
100.   js/installation.js
101.   js/installation-print.js
102.   js/identity.js
103.   js/offensebuilder.js
104.   js/help.js
105.   js/dashboard-render.js
106.   js/dashboard.js
107.   js/gameplan.js
108.   js/gameplan-render.js
109.   js/gameplan-dnd.js
110.   js/gameplan-actions.js
111.   js/gameplan-smart.js
112.   js/gameplan-health.js
113.   js/gameplan-print.js
114.   js/gameplan-integrations.js
115.   js/gameplan-snapshots.js
116.   js/print-studio.js
117.   js/script-events.js
118.   js/anchored-menu.js
119.   js/app-events.js
120.   js/app-command.js
121.   js/page-actions.js
122.   js/app-notifications.js
123.   js/push-notifications.js
124.   js/player-portal.js
125.   js/dashboard-questions.js
126.   js/app-shell.js
127.   js/app-session.js
128.   js/app-navigation.js
129.   js/app-module-init.js
130.   js/app-bootstrap.js
131.   js/app-init.js
132.   js/app.js
```

All files share the **global scope** — there are no modules, imports, or bundling. Any function or variable declared at the top level of any file is accessible from any other file, but only after that file's script has executed. If you create a new JS file, you must add it to both `index.html` (in the correct position) and the `LOCAL_ASSETS` array in `sw.js`.

### Intentional Window Exports

Direct `window.X =` assignments are a public/global contract, even when the
property is only a debug helper or internal scratch flag. Prefer top-level
function declarations for delegated actions. Add a `window` export only when
code must be callable from a different lexical scope, from browser diagnostics,
or by async/runtime patching.

The manifest below is smoke-checked against direct assignments in `js/*.js`.
If a new `window.X =` export is intentional, add it here in sorted order and
explain the purpose in the owning file.

```window-export-manifest
window.__bcErrorHandlerInstalled
window.__bcErrors
window.__bcLastActionTrace
window.__bcWristbandTrace
window.__startupLoaderFinished
window._gpDrawerVisiblePlays
window._gpKeydownBound
window._reorderClear
window._reorderClose
window._reorderSave
window.appDiagnostics
window.appStartup
window.applyCloudBackupImmediately
window.applyPendingRestoredStartupTab
window.applyRoleUi
window.autoPullLatestCloudBackup
window.BC_SHELL_SCROLL_TRACE
window.BC_WRISTBAND_TRACE
window.SIGNAL_CATEGORIES
window.SIGNAL_COMPONENTS
window.bcAuditWristband
window.bcDebugHitTest
window.bcDebugMobileOverflow
window.bcDebugScrollAncestry
window.bcDebugShellScroll
window.bcDebugStartup
window.bcDebugWristband
window.bcDisableWristbandTrace
window.bcEnableShellScrollTrace
window.bcEnableWristbandTrace
window.bcErrors
window.bcIntegrityCheck
window.bcRepairShellScroll
window.bcSelfCheck
window.buildPlayerLeaderboardSyncPayload
window.buildCanonicalTeamWorkspace
window.buildMediaInventoryReport
window.canAccessTab
window.canEditUser
window.canManageSettings
window.closeAnchoredMenu
window.closeCloudSyncModal
window.closeStagedRestoreModal
window.closeLegacyDiagramRecoveryWizard
window.closeMediaInventoryReport
window.closeSignalClipModal
window.closeSignalUploadModal
window.closeSignalUploadReviewModal
window.completeWorkspaceSyncJob
window.confirmSignalReviewedUpload
window.confirmStagedRestore
window.closePlayDiagramHealth
window.closePlayEditor
window.closePublishMedia
window.debouncedFilterScriptItems
window.debouncedOnDashSearchInput
window.deleteSignalClip
window.dismissTeamWorkspacePullSummary
window.deletePlayImage
window.ensurePlayImageUrl
window.failWorkspaceSyncJob
window.flushCloudAutoPush
window.getCurrentAuthUser
window.getCanonicalTeamWorkspaceKeys
window.getDefaultAuthTab
window.getLatestPublishActivity
window.getPlayImageUrl
window.getPublishActivityLog
window.rebuildPlayerRelease
window.recordPublishActivity
window.recoverSelectedLegacyDiagrams
window.getRemotePlayerLeaderboardMeta
window.getRemotePlayerLeaderboardRows
window.getScriptVisiblePlayerSummary
window.getSignalAvailabilityForPlay
window.getSignalCountForPlay
window.getSignalQuizItems
window.getSignalQuizStats
window.getTeamWorkspacePullSummary
window.hasWorkspaceSyncWork
window.hasPlayImage
window.historyManager
window.initScriptEvents
window.initSignals
window.isActionAllowedForRole
window.isAdminUser
window.logoutAuth
window.mediaUploadOutbox
window.openCloudSyncModal
window.openStagedRestoreHistory
window.openStagedRestorePreview
window.openLegacyDiagramRecoveryWizard
window.openMediaInventoryReport
window.openSignalComponent
window.openSignalComponentDetails
window.openSignalClipModal
window.openSignalUploadModal
window.openPlaybookClipViewer
window.openPlayClipViewer
window.openPlayDiagramHealth
window.openPlayDiagramHealthEdit
window.openPlaybookSignalSelector
window.openPublishMediaModal
window.openScriptClipViewer
window.openScriptSignalSelector
window.openSignalSelectorForPlay
window.optimizeAllClips
window.perfMonitor
window.playClips
window.playerNotificationState
window.playerTeamRefreshState
window.playImages
window.positionAnchoredMenu
window.processSignalUploadReview
window.pullCloudBackup
window.publishPlayerMedia
window.publishTeamWorkspace
window.pushCloudBackup
window.queueCloudAutoPush
window.queuePlayerLeaderboardSync
window.queueWorkspaceSyncJob
window.requestImmediateTeamPublish
window.refreshPlayerCloudBackup
window.refreshPlayerLeaderboardSummary
window.refreshPlayerRelease
window.resetAnchoredMenu
window.resetCloudSyncAutoPull
window.resetSignalUploadReview
window.retryWorkspaceSyncWork
window.rollbackStagedRestore
window.renderSignals
window.renderSignalAvailabilityForPlay
window.resolveSignalsForPlay
window.saveCloudSyncSettings
window.saveSignalDetails
window.setWorkspaceSyncStatus
window.runWorkspaceSyncJob
window.startWorkspaceSyncJob
window.stagedRestore
window.STORAGE_KEYS
window.storageManager
window.syncPlayerLeaderboardNow
window.syncPlayImagesToCloud
window.testCloudSyncConnection
window.uploadSelectedSignalClip
window.watchSignalUploadModalClip
window.whenAuthReady
window.workspaceSync
```

---

## Event Delegation Pattern

**No inline `onclick` attributes.** All interactive elements use `data-action` attributes dispatched through the central delegated listeners in `app-events.js`.

### Click Delegation

```html
<!-- Basic action (no args) -->
<button data-action="saveScript">Save</button>

<!-- Action with argument -->
<button data-action="showTab" data-arg="playbook">Playbook</button>

<!-- Overlay close (only fires when clicking backdrop, not children) -->
<div data-action="closeModalOverlay" class="overlay">...</div>
```

**Dispatch priority order:**

1. **Overlay close** — action ending in `"Overlay"` → strips suffix, calls `window[action.slice(0,-7)]()`; only fires on backdrop click (`e.target === el`)
2. **Click proxy** — `data-action="triggerClick"` + `data-target="elementId"` → clicks that element
3. **Inline DOM toggles** — `toggleParentOpen`, `removeParentOpen`, `reloadPage`
4. **Explicit switch/case** — Actions needing `data-idx`, `data-sid`, `data-layer`, `data-preset`, etc.
5. **Generic fallback** — `window[action](arg)` with smart argument handling:

| Condition                               | Call                 |
| --------------------------------------- | -------------------- |
| `data-arg` + action in `_ELEMENT_FNS`   | `fn(arg, element)`   |
| `data-arg` + action in `_BOOL_FNS`      | `fn(arg === "true")` |
| `data-arg` present                      | `fn(arg)`            |
| No `data-arg`, action in `_ELEMENT_FNS` | `fn(element)`        |
| No `data-arg`                           | `fn()`               |

**Special sets:**

```js
const _ELEMENT_FNS = new Set([
  "toggleFilterSection",
  "toggleCollapsiblePanel",
  "setHeaderColor",
  "setCardColor",
  "csPickerAddPlay",
  "toggleSirCollapse",
  "toggleScriptCheckbox",
  "toggleWbCheckbox",
  "quickPlayReadinessScriptScore",
  "quickPlayReadinessPlaybookScore",
  "quickPlayReadinessPresentationScore",
  "updatePlayReadinessReportScore",
  "deletePlayReadinessReport",
  "moveSortCriteria",
  "removeScheduleGame",
  "setScheduleActive",
  "openTendenciesPlayMenu",
  "moveInstallItemUp",
  "moveInstallItemDown",
  "toggleIdentityCard",
  // Discussion actions (need both arg + element)
  "submitDiscPost",
  "deleteDiscPost",
  "loadMoreDiscussion",
  "submitDiscReply",
  "loadMoreDiscReplies",
  "setDiscFilter",
  "setDiscQCategory",
  "openDiscReplyComposer",
  "closeDiscReplyComposer",
  "startEditPost",
  "toggleDiscReaction",
  "openDiscReactionPicker",
  "selectDiscReaction",
  "resolveDiscPost",
  "markDiscPostOfficial",
]);
const _BOOL_FNS = new Set(["toggleAllPbPrintOptions", "csSelectAllFields"]);
```

### Container-Scoped Delegation

Some containers (`#scriptPlays`, `#availablePlays`, `#playbookTable tbody`) have their own event listeners that dispatch by `data-action` or `data-field` within `DOMContentLoaded`.

### Change/Input Delegation

```html
<select data-onchange="handleSort" data-pass="value">
  ...
</select>
<input data-oninput="filterPlays;updateCount" data-pass="value" />
```

- `data-onchange` / `data-oninput` → semicolon-separated function names
- `data-pass="value"` → passes `el.value`
- `data-pass="event"` → passes the event object
- `data-arg="x"` → passes string `"x"`
- No modifier → calls `fn()` with no arguments
- Declarative handlers resolve through `window`; use a top-level function declaration or explicitly export callable `const` handlers

---

## Storage System

Persistent data uses the `storageManager` singleton. Most records are LZ-compressed in `localStorage`; the playbook uses IndexedDB with a transparent `localStorage` fallback.

### storageManager API

```js
storageManager.get(key, (defaultValue = null)); // JSON.parse; returns default on miss/error
storageManager.set(key, value); // JSON.stringify; shows quota modal on overflow
storageManager.remove(key); // localStorage.removeItem
await storageManager.getPlaybook(); // Read playbook from IndexedDB; migrates/falls back as needed
storageManager.setPlaybook(plays); // Async IndexedDB write with localStorage fallback
storageManager.getAllData(); // Full backup object for export
storageManager.restoreAllData(backup, options); // Restore from backup (async)
storageManager.getStorageInfo(); // { totalSize, totalSizeFormatted, itemSizes, itemCount }
storageManager.clearAll((confirmFirst = true)); // Wipe all keys (async)
```

Always use `STORAGE_KEYS`; literal keys passed to `storageManager.get/set/remove` bypass backup, cross-tab, and documentation contracts.

### STORAGE_KEYS (complete list)

```js
PLAYBOOK                        → "playbook"
SAVED_SCRIPTS                   → "savedScripts"
SAVED_WRISTBANDS                → "savedWristbands"
WRISTBAND_TEMPLATES             → "wristbandTemplates"
SORT_PRESETS                    → "sortPresets"
CUSTOM_SORT_ORDERS              → "customSortOrders"
SCRIPT_CUSTOM_SORT_ORDERS       → "scriptCustomSortOrders"
PERIOD_TEMPLATES                → "periodTemplates"
SCRIPT_TEMPLATES                → "scriptTemplates"
CALL_SHEET                      → "callSheet"
CALL_SHEET_SETTINGS             → "callSheetSettings"
COLUMN_VISIBILITY               → "columnVisibility"
PLAYBOOK_STATE                  → "playbookState"
SCRIPT_DISPLAY_OPTIONS          → "scriptDisplayOptions"
SCRIPT_CONTROLS_MODE            → "scriptControlsMode"
PLAY_READINESS                  → "playReadiness"
SCRIPT_DRAFT                    → "scriptDraft"
WRISTBAND_DRAFT                 → "wristbandDraft"
CALLSHEET_DISPLAY_OPTIONS       → "callSheetDisplayOptions"
CALLSHEET_DISPLAY_PRESETS       → "callSheetDisplayPresets"
CALLSHEET_DRAFT                 → "callSheetDraft"
CALLSHEET_TEMPLATES             → "callSheetTemplates"
CALLSHEET_CATEGORY_ORDER        → "callSheetCategoryOrder"
CALLSHEET_NOTES                 → "callSheetNotes"
CALLSHEET_TARGETS               → "callSheetTargets"
CALLSHEET_COLLAPSED             → "callSheetCollapsed"
CALLSHEET_QUICK_ACTIONS_OPEN    → "csQuickActionsOpen"
CALLSHEET_SNAPSHOTS             → "callSheetSnapshots"
PAGE_HELP_OPEN                  → "pageHelpOpen"
DEFENSIVE_TENDENCIES            → "defensiveTendencies"
TENDENCIES_DRAFT                → "tendenciesDraft"
TENDENCIES_SETTINGS             → "tendenciesSettings"
GAME_WEEK                       → "gameWeek"
MOBILE_COACH_LOCK               → "mobileCoachLock"
INSTALLATION                    → "installationData"
INSTALLATION_TEMPLATES          → "installationTemplates"
CS_SCOUTING_OVERLAY             → "csScoutingOverlay"
PLAY_COLLECTIONS                → "playCollections"
CALLSHEET_CONSTRAINTS           → "callSheetConstraints"
OB_PLAY_RATINGS                 → "ob_playRatings"
LAST_ACTIVE_TAB                 → "lastActiveTab"
THEME                           → "theme"
VISION_MODE                     → "visionMode"
SCHEDULE                        → "schedule"
GAME_PLAN_TAGS                  → "gamePlanTags"
PRINT_STUDIO_SETTINGS           → "printStudioSettings"
PRESENTATION_SETUP              → "presentationSetup"
PRESENTATION_IPAD_HELP_DISMISSED → "presentationIpadHelpDismissed"
WRISTBAND_SORT_CRITERIA         → "wristbandSortCriteria"
WRISTBAND_FAVORITES             → "wristbandFavorites"
WRISTBAND_RECENT_PLAYS          → "wristbandRecentPlays"
WRISTBAND_LOGO_CARD             → "wristbandLogoCard"
TEAM_ROSTER                     → "teamRoster"
TEAM_NAME                       → "teamName"
TEAM_PERSONNEL_PACKAGES         → "teamPersonnelPackages"
TEAM_SWAP_GROUPS                → "teamSwapGroups"
TEAM_ASSIGNMENT_LABELS          → "teamAssignmentLabels"
TEAM_SETTINGS_COLLAPSED         → "teamSettingsCollapsed"
GAME_PLAN_BOARDS                → "gamePlanBoards"
GAME_PLAN_SNAPSHOTS             → "gamePlanSnapshots"
GAME_PLAN_TEMPLATES             → "gamePlanTemplates"
CALLSHEET_PRINT_OPTIONS         → "callSheetPrintOptions"
CLOUD_SYNC_SETTINGS             → "cloudSyncSettings"
PUBLISH_ACTIVITY_LOG            → "publishActivityLog"
COLOR_PRESET                    → "colorPreset"
AUTH_SESSION                    → "authSession"
A2HS_DISMISSED                  → "a2hsDismissed"
MOTD                            → "motd"
PLAYER_READY                    → "playerReady"
PLAYER_PORTAL_BRANDING          → "playerPortalBranding"
PLAYER_QUIZ_RESULTS             → "playerQuizResults"
PLAYER_QUIZ_DRAFT               → "playerQuizDraft"
PLAYER_QUIZ_SETTINGS            → "playerQuizSettings"
PLAYER_QUIZ_SOURCE_SETTINGS     → "playerQuizSourceSettings"
QUIZ_ASSIGNMENT_TEMPLATES       → "quizAssignmentTemplates"
PLAYER_GAME_PLAN_QUIZ           → "playerGamePlanQuiz"
PLAYER_SIGNAL_GAME_SETTINGS     → "playerSignalGameSettings"
PLAYER_PUBLISH_STATUS           → "playerPublishStatus"
SIGNALS                         → "signals"
PLAYER_REWARD_EVENTS            → "playerRewardEvents"
PLAYER_HELMET_STICKER_TYPES     → "playerHelmetStickerTypes"
PLAYER_HELMET_STICKERS          → "playerHelmetStickers"
PLAYER_LEADERBOARD_REMOTE       → "playerLeaderboardRemote"
PLAYER_RELEASE_STATE            → "playerReleaseState"
PLAYER_DEVICE_OWNER             → "playerDeviceOwner"
DIAGRAM_UPLOAD_QUEUE            → "diagramUploadQueue"
CLIP_UPLOAD_QUEUE               → "clipUploadQueue"
GAME_WEEK_ARCHIVE               → "gameWeekArchive"
TENDENCIES_REPORTS              → "tendenciesReports"
FIRST_USE_DISMISSED             → "firstUseDismissed"
```

### Autosave / Draft Pattern

- **Debounce:** `AUTOSAVE_DEBOUNCE_MS = 3000` (3 seconds)
- **Draft expiry:** `DRAFT_EXPIRY_MS = 86400000` (24 hours)
- Each module has its own timer: `scriptAutosaveTimer`, `callSheetAutosaveTimer`, `wristbandAutosaveTimer`, `tendenciesAutosaveTimer`
- Dirty tracking: `scriptDirty` / `wristbandDirty` booleans with `markScriptDirty()` / `markScriptClean()` etc.
- `beforeunload` warns if any dirty flag or `hasWorkspaceSyncWork()` queue state is pending/error

### Workspace Sync / Player Publish Architecture

The app treats save and publish as one write tree: local save -> cloud data
publish -> media publish -> player readiness update.

1. Local save/draft writes stay module-owned through `storageManager`, module
   save helpers, dirty flags, and autosave timers.
2. `js/workspace-sync.js` owns the shared bottom status dock and the visible
   queue surface. Use `queueWorkspaceSyncJob()`, `startWorkspaceSyncJob()`,
   `completeWorkspaceSyncJob()`, `failWorkspaceSyncJob()`,
   `retryWorkspaceSyncWork()`, `setWorkspaceSyncStatus()`, and
   `hasWorkspaceSyncWork()` instead of adding module-specific sync UI.
3. `js/cloud-sync.js` queues Cloud autosave/push work into the shared dock.
   Raw cloud push/pull is admin-only recovery tooling, not the daily coach
   workflow.
4. Diagram attachment saves to the cloud automatically. The binary remains in
   IndexedDB and retry metadata is retained locally when offline; the workspace
   dock reports `Saving when online`. Phase 3 still needs a single durable
   outbox that stores each intent and its blob together. Manual all-local
   upload is admin-only recovery.
5. Player-facing diagram surfaces resolve the authorized, team-scoped cloud
   manifest first, then cache the current media ID in a player-only IndexedDB
   database for offline use. They fetch `/images/file?sig=...` only when the
   manifest says the diagram is published.

Rules:

- Do not add noisy success/progress toasts for routine autosave, Cloud autosave,
  diagram sync, or player publish work. Route normal work into the workspace
  dock and reserve toasts for explicit user actions or failures that need
  attention.
- Keep raw cloud recovery and all-local diagram upload under admin-only
  `Recovery Tools`. Do not make them the primary first-run or daily workflow.
- Player-facing diagram copy must distinguish checking, unpublished, offline,
  and load-error states. Avoid generic "ask coach to sync diagrams" copy.
- Exit guards must include both local dirty flags and `hasWorkspaceSyncWork()`
  so pending or failed cloud/media/player work cannot be missed.

### Undo/Redo (historyManager)

```js
historyManager.saveState(type, state); // type: "script" | "wristband" | "tendencies" | "callsheet"
historyManager.undo(type, currentState); // Returns previous state or null
historyManager.redo(type, currentState); // Returns next state or null
historyManager.clear(type);
historyManager.canUndo(type); // boolean
historyManager.canRedo(type); // boolean
historyManager.updateButtons(type); // Enable/disable #<type>UndoBtn / #<type>RedoBtn
// maxHistory: 25 snapshots per type
```

### Storage Migrations

- `STORAGE_VERSION = 3` stored in `localStorage._storageVersion`
- `runMigrations()` applies version-keyed transforms on app init
- The stored version advances after each successful step so failed migrations retry on the next load

---

## Data Models

### Play Object (Playbook)

Imported from CSV via `parseCSV()`. This is the core data shape used everywhere:

```js
{
  type: "",                  // "Run", "Pass", "RPO", "Screen", "Quick", "Play Action", "Run Option", "Movement"
  personnel: "",             // Personnel grouping
  formation: "",             // Formation name
  formTag1: "",              // Formation tag 1
  formTag2: "",              // Formation tag 2
  under: "",                 // Under center indicator
  back: "",                  // Backfield alignment
  shift: "",                 // Pre-snap shift
  motion: "",                // Motion call
  protection: "",            // Protection call
  lineCall: "",              // Line call
  play: "",                  // Play name
  playTag1: "",              // Play tag 1
  playTag2: "",              // Play tag 2
  basePlay: "",              // Base play family
  oneWord: "",               // One-word call
  preferredSituation: "",    // "Short Yardage" | "2 Minute" | "4 Minute"
  preferredDown: "",         // "1" | "2" | "3" | "4"
  preferredDistance: "",     // "Short" | "Medium" | "Long"
  preferredHash: "",         // Hash preference
  preferredFieldPosition: "", // "Green" | "Lo-RZ" | "Hi-RZ" | "Goal Line" | "Backed Up" | "Saigon"
  tempo: "",                 // Tempo designation
  practiceFront: "",         // Practice defensive front
  practiceDefense: "",       // Practice defense
  practiceCoverage: "",      // Practice coverage
  practiceBlitz: "",         // Practice blitz
  practiceStunt: "",         // Practice stunt
  keyPlayer1: "",            // Key player 1 position code
  keyPlayer2: "",            // Key player 2 position code
  keyPlayer3: "",            // Key player 3 position code
  keyPlayerName1: "",        // Key player 1 name
  keyPlayerName2: "",        // Key player 2 name
  keyPlayerName3: "",        // Key player 3 name
  constraint1: "",           // Constraint / complement 1
  constraint2: "",           // Constraint / complement 2
  constraint3: "",           // Constraint / complement 3
  hitChart1: "",             // Hit chart target 1
  hitChart2: "",             // Hit chart target 2
  hitChart3: "",             // Hit chart target 3
  deadVs: "",                // Dead vs (defensive looks to avoid)
  opponent: "",              // Opponent-specific
  notes: "",                 // Free-text notes
}
```

### Call Sheet Category

```js
{
  id: "category-slug",        // Unique key (e.g. "1st-down", "rz-20", "player2")
  name: "Display Name",       // Human label
  color: "#hex",               // From CS_COLORS palette
  // Filter criteria (optional, varies):
  down: "1"|"2"|"3"|"4",
  distance: "Short"|"Medium"|"Long",
  position: "Green"|"Lo-RZ"|"Hi-RZ"|"Goal Line"|"Backed Up"|"Saigon"|null,
  situation: "Short Yardage"|"2 Minute"|"4 Minute"|null,
  playType: "Run"|"Pass"|"Screen"|"Quick"|"Play Action"|"RPO"|"Run Option"|"Movement"|"Opener",
  playerSpecific: true,        // Player-specific buckets (player1-player5)
  manual: true|false,          // If true, no auto-populate from playbook
}
```

**CALLSHEET_FRONT** — 19 situation/down-based buckets (front page):
`2nd-medium`, `2nd-long`, `3rd-short-1-3`, `short-yardage`, `gbot`, `3rd-short-2down`, `rz-20`, `4th-down`, `3rd-medium`, `rz-10`, `4-minute`, `3rd-long`, `rz-5`, `2-minute`, `backed-up`, `goal-line`, `last-plays`, `saigon`, `must-haves`

**CALLSHEET_BACK** — 18 type/player-based buckets (back page):
`openers`, `1st-down`, `perimeter-screens`, `screen`, `p-and-10`, `2-point`, `base-run`, `run-options`, `base-pass`, `quick`, `play-action`, `rpos`, `player1`–`player5`, `movement`

**Runtime structure:**

```js
callSheet = {
  "1st-down": { left: [play, play, ...], right: [play, ...], customName: "..." },
  "rz-20":    { left: [...], right: [...] },
  // ...one entry per populated category
}
```

### Game Plan Board

Game plan boards may restrict valid play types and carry a print identity used
by built-in templates:

```js
{
  id: "board-id",
  name: "Tournament",
  assignments: { "box-id": [play, play] },
  customBoxes: [{ id, name, target, notes }],
  boxOrder: ["box-id"],
  hiddenBoxes: ["box-id"],
  allowedPlayTypes: ["Pass", "Quick", "Screen", "Play Action", "Movement"],
  sheetTitle: "7-on-7 Passing Plan",
  printPreset: "sevenOnSeven",
  wristbandAutoBoxId: "7on7-wristband-passes",
}
```

Game plan box criteria can match down, distance, situation, field position,
play type, practice coverage, key player name/position, and keyword
alternatives. Keyword alternatives use `|` separators. A board with
`wristbandAutoBoxId` replaces that bucket with unique passing calls whenever a
wristband is loaded and clears it when the wristband is unloaded.

---

## Key Global Variables

### app.js

```js
let plays = []; // Master playbook array (all imported plays)
let script = []; // Current working practice script
let scriptWristband = null; // Currently linked wristband
let filteredPlays = []; // Filtered playbook subset
```

### help.js

```js
let currentActiveTab = "playbook"; // Active UI tab name for help + navigation state
```

### callsheet.js

```js
let callSheet = {}; // The call sheet data (see structure above)
let callSheetSettings = {}; // Orientation, current page, custom names
const CALLSHEET_CATEGORIES = []; // All 37 base category definitions
```

### script runtime (script-\*.js)

```js
let collapsedPeriods = new Set(); // Collapsed period IDs
let periodTemplates = []; // Saved period templates
let bulkSelectedIndices = []; // Multi-selected play indices
let selectedAvailablePlays = []; // Checked available plays
```

### wristband runtime (utils.js + wristband\*.js)

```js
let wristbandCards = []; // Array of card objects
let currentCardIndex = 0; // Active card tab
const WB_ROWS = 20; // Rows per card
const MAX_CARDS = 5; // Maximum cards
const CELLS_PER_CARD = 40; // Total cells per card (2 columns × 20 rows)
```

---

## Key Utility Functions

### HTML Safety

```js
escapeHtml(text); // Escapes & < > " ' — use for text interpolation
sanitizeHTML(html); // Strips dangerous tags/attrs — use for innerHTML
setInnerHTML(el, html); // el.innerHTML = sanitizeHTML(html)
```

**Rule:** Always `escapeHtml()` user-provided text in template literals. Use `sanitizeHTML()` only when you need to preserve safe HTML formatting. `getFullCall()` already calls `escapeHtml()` internally — never double-escape its output.

### Play Display

```js
getFullCall(play, (options = {})); // Returns HTML string with formatted play call
// Options: showEmoji, useSquares, underEmoji, boldShifts, redShifts,
//          italicMotions, redMotions, noVowels, showLineCall,
//          highlightHuddle, highlightCandy

buildCallSheetPlayParts(play, options); // Returns array of HTML part strings (call sheet specific)
```

### Modals (async, Promise-based)

```js
showModal(message, { title, icon }); // Alert → Promise<void>
showConfirm(message, { title, icon, confirmText, cancelText, danger }); // → Promise<boolean>
showPrompt(message, defaultValue, { title, icon, placeholder }); // → Promise<string|null>
showChoice(message, { title, icon, option1, option2 }); // → Promise<"option1"|"option2"|null>
showListPicker(message, items, { title, icon }); // → Promise<value|null>
```

### Notifications

```js
showToast(message, durationOrOpts); // number | { duration, type, actionLabel, action }
showUndoToast(message, undoCallback, duration); // Toast with undo button (default 5s)
```

`showToast()` treats messages as text. Use `{ actionLabel, action }` for interactive toasts instead of embedding HTML.

### Other Important Utils

```js
debounce(fn, (wait = 150));
safeJSONParse(str, fallback);
safeDeepClone(obj); // structuredClone with JSON fallback
parseCSV(text); // → { plays: [], skipped: [] }
removeVowels(str); // Strip vowels for compressed display
playsMatch(p1, p2); // Compare two play objects by key fields
showContextMenu(event, menuItems); // Right-click context menus
showReorderModal(values, opts); // Drag-to-reorder modal
trapFocus(overlay); // Focus trap for accessibility
addLongPress(element, callback, duration); // Mobile long-press handler
```

---

## CSS Architecture

### Design Tokens

All colors, spacing, typography, shadows, and z-indexes are defined as CSS custom properties in `:root` (base.css). Always use tokens rather than hardcoded values.

**Key token families:**

| Category    | Examples                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| Brand       | `--color-primary`, `--color-accent`, `--color-primary-dark`                                                      |
| Functional  | `--color-success`, `--color-danger`, `--color-warning`, `--color-info` (each has `-hover`, `-light` variants)    |
| Backgrounds | `--color-bg-body`, `--color-bg-light`, `--color-bg-lighter`, `--color-bg-input`, `--color-bg-hover-row`          |
| Borders     | `--color-border`, `--color-border-light`, `--color-border-med`, `--color-border-input`                           |
| Text        | `--color-text`, `--color-text-muted`, `--color-text-secondary`, `--color-text-light`                             |
| Spacing     | `--space-xs` (4px) through `--space-xl` (32px)                                                                   |
| Radius      | `--radius-sm` (6px), `--radius-md` (10px), `--radius-lg` (14px), `--radius-pill` (999px)                         |
| Shadows     | `--shadow-xs` through `--shadow-lg`, `--shadow-focus`                                                            |
| Z-index     | `--z-base` (1) → `--z-toast` (10000) → `--z-skip-link` (100000)                                                  |
| Typography  | `--font-sans` (Inter stack), `--font-mono` (IBM Plex Mono), `--font-size-micro` (8px) → `--font-size-5xl` (48px) |
| Transitions | `--transition-fast` (0.15s), `--transition-normal` (0.25s)                                                       |

### Dark Mode

Supported via `[data-theme="dark"]` selector overriding all token values. Never use hardcoded colors in JS-generated HTML — use CSS classes or design tokens.

### Accessibility

- `prefers-reduced-motion: reduce` disables all animations
- `:focus-visible` ring on interactive elements
- `.sr-only` for screen-reader-only text
- `.skip-link` for skip-to-content
- `#liveAnnouncer` for ARIA live region announcements

### File Responsibilities

| File             | Scope                                                                              |
| ---------------- | ---------------------------------------------------------------------------------- |
| `base.css`       | Tokens, reset, form elements, selections                                           |
| `layout.css`     | Page structure, header, tab bar, panels                                            |
| `components.css` | Reusable: `.btn-*`, `.modal-*`, `.toast`, `.badge-*`, utilities                    |
| `print.css`      | Shared/global print rules; module-only print rules may stay with their module      |
| `responsive.css` | Shared/global breakpoints; module-only responsive rules may stay with their module |
| `[module].css`   | Module-specific styles (callsheet.css, script.css, etc.)                           |

### Naming Conventions

- **JS public actions:** Delegated handlers and public module functions keep readable verb names (`renderScript`, `saveCallSheetTemplate`, `openGamePlanPrintModal`).
- **JS private helpers:** Module-private helpers use a leading underscore plus the owning module prefix. Avoid new generic helpers such as `renderRow`, `saveTemplate`, `updateState`, or `openModal` in split files.
- **Shared utilities:** Unprefixed helpers belong only in `utils.js` or `dom-helpers.js` when they are truly cross-module.
- **CSS module prefix:** Use the same module prefix in class names (`cs-cell-format-dot`, `cr-bucket-row`, `wb-card-tab`).
- **BEM-lite:** Mostly flat class names with dashes (`cs-cell-format-dot`, `cr-bucket-row`)
- **State classes:** `active`, `open`, `visible`, `highlighted`, `collapsed`
- **Status classes:** `cr-status-ok`, `cr-status-warn`, `cr-status-error`, `cr-status-empty`
- **Button variants:** `.btn`, `.btn-sm`, `.btn-primary`, `.btn-danger`, `.btn-warning`, `.btn-success`

```module-prefix-manifest
app-shell:_shell
dashboard:_dash
page-actions:_pa
playbook:pb,_pb
script:script,_script
player-quiz:quiz,playerQuiz,_quiz,_playerQuiz
call-sheet:cs,_cs
constraints:cr,_cr
game-plan:gp,_gp
tendencies:td,_td
wristband:wb,_wb
storage:storage
```

---

## Service Worker

**Cache name:** `bcoffense-vN` in `sw.js`

**Strategy:**

- **Install:** Pre-cache all local assets listed in `LOCAL_ASSETS` array
- **Update activation:** Let a new worker wait until existing app tabs close; never force-reload an active workspace
- **Navigations and app-shell HTML/CSS/JS:** Network-first with cache fallback
- **Other same-origin assets:** Stale-while-revalidate
- **External resources:** Network-first with cache fallback (Google Fonts, CDNs)
- **Offline:** Navigation requests fall back to `offline.html`
- Cache only successful responses without `Cache-Control: no-store`; auth/login responses must not replace app-shell assets

**When to bump the version:**

- Any time you modify CSS, JS, or HTML files
- Increment the number in `const CACHE_NAME = "bcoffense-vN"` in `sw.js`
- If you add a new file, also add it to the `LOCAL_ASSETS` array
- Never call `skipWaiting()` from the install handler or reload on `controllerchange`; background update checks must not reset in-progress work

---

## Git Conventions

### Commit Messages

Follow Conventional Commits format:

```
feat: Description of new feature (SW vN)
fix: Description of bug fix (SW vN)
perf: Performance improvement description
style: Formatting only, no logic changes
refactor: Code restructuring, no behavior change
```

- **Prefix:** `feat:`, `fix:`, `perf:`, `style:`, `refactor:`
- Optionally scoped: `feat(tier-8):`, `fix(callsheet):`
- Include `(SW vN)` when bumping service worker version
- Lowercase after prefix
- Body: bullet list of specific changes (use `-` prefix)

### Workflow

- Single branch: `main`
- No PRs, no CI — direct commit and push
- After completing and validating a requested change, commit and push to `main` unless the user explicitly asks to keep changes local.
- After every successful commit and push, run `./scripts/deploy-cloudflare.sh`. This applies to code, documentation, configuration, and agent-instruction commits.
- Do not report the task complete until the deploy script confirms Cloudflare production points to the current commit.
- Always bump SW version when changing cached assets
- Always use `./scripts/deploy-cloudflare.sh`; never deploy the repo root or call `wrangler pages deploy` directly.

---

## Adding New Features — Checklist

1. **Identify which JS file** owns the feature (or create a new one)
2. **Use `data-action`** for all interactive elements — never inline `onclick`
3. **Use `escapeHtml()`** on all user text in template literals
4. **Use design tokens** (CSS custom properties) — never hardcode colors
5. **Use `storageManager`** for persistence — add a key to `STORAGE_KEYS` in storage.js if needed
6. **Add to `LOCAL_ASSETS`** in sw.js if creating a new file
7. **Add the `<script>` tag** in index.html in the correct load order position
8. **Bump `CACHE_NAME`** version in sw.js
9. **Test offline** — ensure Service Worker caches necessary assets
10. **Commit** with conventional commit message including `(SW vN)`
11. **Push** the commit to `main`
12. **Deploy** with `./scripts/deploy-cloudflare.sh`
13. **Verify production** — the deploy script must confirm Cloudflare's source matches `HEAD`

---

## Refactor Ownership Map

### Playbook runtime

- `playbook.js` keeps shared helpers and compatibility globals used across playbook slices.
- `history.js` owns the shared `historyManager` undo/redo runtime.
- `dom-helpers.js` owns shared DOM sanitization, long-press, context menu, and reorder modal helpers.
- `storage.js` owns storage keys, migrations, backup/restore state, storage info data, and draft persistence helpers.
- `storage-ui.js` owns backup export/import UI and the storage info modal.
- `cloud-sync.js` owns Cloudflare-backed complete backup push/pull sync.
- `auth.js` owns client-side role UI after Cloudflare `/auth/me` confirms the server session.
- `functions/` owns Cloudflare Pages server-side login, signed session cookies, and route protection.
- `playbook-collections.js` owns collection CRUD and collection-related UI.
- `playbook-print.js` owns playbook print workflows.
- `playbook-editor.js` owns play edit/create modal behavior.
- `playbook-import.js` owns CSV import, parser logic, imported state hydration, and import loading overlay UI.
- `playbook-export.js` owns playbook export flows.
- `playbook-chrome.js` owns toolbar-level playbook actions and status UI.
- `playbook-reports.js` owns all five analytics report engines: Balance, Situations, Touches, Complements, and Identity.
- `playbook-state.js` owns shared state helpers, reset logic, and playbook filter cache.
- `playbook-filters.js` owns filter extraction and matching.
- `playbook-navigation.js` owns pagination and table navigation.
- `playbook-actions.js` owns row-level mutations and action handlers.
- `playbook-render.js` owns playbook table rendering.

### Wristband runtime

- `wristband.js` is the foundation layer: globals, mode state, capacity helpers, custom display/tag helpers, and undo/history helpers.
- `wristband-library.js` owns available-play filtering, search state, counts, and stats.
- `wristband-render.js` owns card rendering, color controls, clear, and auto-fill.
- `wristband-cards.js` owns card tabs, duplicate/remove/rename, and active card switching.
- `wristband-export.js` owns print and CSV export.
- `wristband-search.js` owns quick search, favorites, and smart fill.
- `wristband-modals.js` owns help and find/replace overlays.
- `wristband-cell-popup.js` owns the cell editor popup and pending tag/color state.
- `wristband-cell-actions.js` owns cell mutations, drag/drop, copy/paste, and batch actions.
- `wristband-sort.js` owns wristband sorting helpers.
- `wristband-storage.js` owns save/load/draft hydration.
- `wristband-runtime.js` owns DOM bootstrap and delegated event bindings.

### Callsheet runtime

- `callsheet.js` currently owns the core call sheet state, rendering, and sort helpers.
- `callsheet-categories.js` owns category display names/colors and custom-category CRUD.
- `callsheet-metadata.js` owns category notes, target counts, clear actions, and category metadata menus.
- `callsheet-layout.js` owns category ordering persistence, layout modal draft state, drag-drop helpers, smart category reorder, and reset-to-default.
- `callsheet-templates.js` owns built-in call sheet templates, template CRUD (save/load/delete), and template apply flow.
- `callsheet-picker-runtime.js` owns picker search/filter flows, wristband loading, call sheet play drag/drop, and callsheet-specific runtime listeners.

## Refactor Guardrails

- Prefer editing the owning split file instead of adding more logic back into compatibility surfaces like `playbook.js` or `wristband.js`.
- When a global function is used by both delegated DOM events and direct programmatic calls, make optional event parameters truly optional.
- Persisted wristband UI mutations must do both: `markWristbandDirty()` and `scheduleWristbandAutosave()`.
- After adding any new split runtime file, update `index.html`, `sw.js`, and this load-order documentation together.

---

## Common Patterns to Follow

### Creating a New Storage Key

```js
// 1. Add to STORAGE_KEYS in storage.js
const STORAGE_KEYS = {
  // ...existing...
  MY_NEW_KEY: "myNewData",
};

// 2. Use via storageManager
const data = storageManager.get(STORAGE_KEYS.MY_NEW_KEY, defaultValue);
storageManager.set(STORAGE_KEYS.MY_NEW_KEY, data);
```

### Adding a Button with Delegation

```html
<!-- In index.html -->
<button
  class="btn btn-sm btn-primary"
  data-action="myFunction"
  data-arg="optionalArg"
>
  Label
</button>
```

```js
// In the appropriate JS file — function must be global
function myFunction(arg) {
  // ...
}
```

### Creating a Modal Overlay

```html
<!-- Overlay with data-action ending in "Overlay" auto-closes on backdrop click -->
<div class="my-panel-overlay" id="myPanel" data-action="closeMyPanelOverlay">
  <div class="my-panel">
    <button data-action="closeMyPanel">×</button>
    <div id="myPanelBody"></div>
  </div>
</div>
```

```js
function openMyPanel() {
  document.getElementById("myPanel").classList.add("visible");
}
function closeMyPanel() {
  document.getElementById("myPanel").classList.remove("visible");
}
```

### Toast Notifications

```js
showToast("Play added to script"); // Default 2s
showToast("Saved successfully", { duration: 3000, type: "success" });
showToast("Something went wrong", { duration: 4000, type: "error" });
```

### Dirty Tracking + Autosave

```js
// Mark data as changed
markScriptDirty();

// Debounced autosave pattern
clearTimeout(scriptAutosaveTimer);
scriptAutosaveTimer = setTimeout(() => {
  saveScriptDraft();
}, AUTOSAVE_DEBOUNCE_MS);

// On explicit save
saveScript();
markScriptClean();
```

---

## Constraints Module (js/constraints.js)

The constraints engine evaluates call sheet buckets against an offensive philosophy config. Key structures:

- **`CALLSHEET_CONSTRAINTS`** — master config with `global`, `roleMap`, `familyMap`, `shotPartnerFamilies`, `qbRunKeywords`, `bucketRules`
- **`categorizePlay(play)`** — classifies a play by family, category, flags (isRun, isScreen, isShot, etc.), and touch targets
- **`evaluateBucket(key, bucket)`** — returns `{ score, status, errors, warnings, successes, philosophy, touchCounts, ... }`
- **`evaluateCallSheet(cs)`** — evaluates entire call sheet, returns `{ overallScore, bucketReports, summary }`
- **`suggestFixesForBucket(report, playbookPlays)`** — suggests playbook plays to fix bucket deficiencies

To change player names: edit `roleMap` in `CALLSHEET_CONSTRAINTS`.  
To add play families: add entries to `familyMap` array.  
To change bucket rules: edit `bucketRules` object.  
To disable entirely: set `CONSTRAINTS_ENABLED = false`.

---

## Things to NEVER Do

- **Never use inline `onclick`/`onchange`/`oninput`** — use `data-action` / `data-onchange` / `data-oninput`
- **Never skip `escapeHtml()`** on user text in template literals
- **Never double-escape** `getFullCall()` output (it already escapes internally)
- **Never hardcode colors** — use CSS custom properties
- **Never use ES modules** (`import`/`export`) — this is a global-scope, no-build project
- **Never add a build step** — no webpack, no Vite, no npm scripts
- **Never create `package.json`** — this is intentionally dependency-free
- **Never forget to bump `sw.js`** cache version after code changes
- **Never use `innerHTML` with unsanitized user content** — use `setInnerHTML()` or `escapeHtml()`
- **Never define the same top-level `function name` in two files** — the last-loaded file silently shadows the earlier one (a "shadow bug"). Put a function in exactly one owning file.
- **Never use `<details>`/`<summary>` for toolbar dropdowns** — Safari renders them inconsistently (the summary button can be invisible/unclickable). Use the anchored `.tool-menu-wrap` + `data-anchored` pattern instead.
- **Never call `element.scrollIntoView()` inside a `.panel`** — it propagates up to `#mainApp` (which is `overflow:hidden` on desktop but still accepts programmatic `scrollTop`), pushing the tab bar off-screen. Scroll the specific inner scroll container directly instead.
- **Never add `transform`, `will-change: transform`, `filter`, or `perspective` to `.panel.active`** — any of these makes the panel a containing block for `position: fixed`/`sticky` descendants, which traps anchored menus ~230px too low and breaks sticky headers. Keep panel animations opacity-only.

---

## Known Traps & Hardening Standards

> These are the recurring root causes behind past regressions. Check this list
> FIRST when a symptom matches — most "new" bugs are one of these repeating.

### Trap 1 — The `.panel.active` containing-block trap

`css/layout.css` `.panel.active` must stay **opacity-only** for animation and
`will-change`. A `transform` (even `translateY(0)` left over from an animation
`fill: both`) or `will-change: transform` turns the panel into the containing
block for every `position: fixed`/`position: sticky` descendant. Symptoms:

- Anchored dropdown menus float ~230px below their trigger button.
- Sticky module headers (game plan, call sheet) leak / detach on scroll.

Fix pattern: remove the transform/will-change; if you need a pinned region,
use a flex column (`overflow:hidden` panel → `flex:0 0 auto` pinned zone →
`flex:1 1 auto; min-height:0; overflow:auto` scroll zone). See the Script and
Game Plan pages for the reference implementation.

### Trap 2 — Load-order shadowing of global functions

All 120 JS files share one global scope and load in a fixed order. If two files
define `function foo`, the **last-loaded one wins** and silently shadows the
other. This has caused live bugs (e.g. a stale `sendScoutRecsToGamePlan` in
`tendencies.js` shadowed the modern one in `tendencies-render.js`). Guardrails:

- Every function has exactly ONE owning file (see the Refactor Ownership Map).
- The smoke check / audit greps for duplicate top-level `function` names.
- When splitting a file, move the function — do not copy it.

### Trap 3 — `typeof X === "function"` guards mask missing dependencies

There are ~1000 `typeof fn === "function"` guards across the codebase. They exist
because global load order is fragile. The danger: a guard silently **no-ops**
when a function is genuinely missing (typo, wrong load order, deleted export),
turning a loud error into a silent dead feature. Standard going forward:

- Use a guard ONLY for a genuinely optional cross-module integration
  (e.g. calling into a module that may not be initialized yet).
- Do NOT wrap same-module or guaranteed-present calls in guards.
- When a guard is required, prefer failing loudly in dev: log a `console.warn`
  in the `else` branch so a missing dependency is visible, not swallowed.

### Trap 4 — `scrollIntoView` breaks the desktop shell

On desktop the shell is a fixed-height flex column: `body` → `#mainApp`
(`overflow:hidden`) → `.panel.active` (own scroll). `element.scrollIntoView()`
walks EVERY scrollable ancestor including `#mainApp`, and browsers honor
programmatic `scrollTop` even on `overflow:hidden`. Result: the tab bar scrolls
out of view. Always scroll the specific inner container (`.gp-board-scroll`,
`.wristband-preview`, etc.) by computing the offset delta yourself.
`repairDesktopDocumentScroll()` in `app-shell.js` resets `#mainApp.scrollTop` as
a safety net.

### Trap 5 — Swallowed errors

Empty `catch {}` and `catch (e) { /* ignore */ }` blocks hide real failures.
When adding error handling, log via `console.warn`/`console.error` (or surface a
toast) unless the failure is genuinely expected and benign — and say why in a
comment.

### Trap 6 — CSS specificity wars (`!important`)

High `!important` counts (esp. in churn-heavy modules like `wristband.css`) make
layout changes unpredictable and force MORE `!important`. Before adding one,
check whether a more specific selector or fixing source order solves it. Reach
for `!important` only for utility/override classes (`.wb-hidden`,
`.wb-toolbar-hidden`) where overriding inline/computed styles is the intent.

### Validation ritual before every ship

1. `node --check <changed>.js` for each edited JS file.
2. `get_errors` on edited files.
3. `git diff --check` (whitespace/merge markers).
4. `bash scripts/static-ui-audit.sh --warn-only --max-lines=0 | tail -1` →
   require `strict=0` (review count is heuristic noise; watch for large jumps).
5. Duplicate-function scan:
   `grep -rhoE "^(async )?function [A-Za-z0-9_]+" js/*.js | sed -E 's/async //; s/function //' | sort | uniq -d`
   → must be empty.
6. Bump `CACHE_NAME` in `sw.js` AND restamp `?v=N` in `index.html`.
7. `./ship.sh "message (SW vN)"` and confirm
   `Verified Cloudflare production source: <hash>` matches `HEAD`.

### Pre-season player-release gate

For an auth, startup, storage, publish, or player-surface release, do not rely
on a static smoke pass alone. Run the focused hydration test and a two-account
live pilot that covers invite/password setup, login, first-load practice,
media, quiz, refresh, logout, and a new login. Publish status must be clear of
player-visible media gaps before inviting the full roster. The active checklist
lives in `CONSOLIDATED_ROADMAP.md`; do not recreate completed roadmaps.

---

## Type Safety & Formatting (no-build tooling)

The frontend stays no-build, but these tools add safety WITHOUT a bundler:

### Type checking (opt-in, zero runtime cost)

- `types/bcoffense.d.ts` declares the core data shapes (`Play`,
  `CallSheetCategory`, `GamePlanBoard`) plus foundation utilities. These are
  **ambient** declarations — compile-time only, nothing ships.
- Autocomplete on the `Play` object works everywhere already (VS Code reads the
  ambient interface). In JSDoc use `/** @param {Play} play */` or
  `/** @type {Play} */` to get field checking.
- `jsconfig.json` keeps `checkJs: false` globally so the Problems panel stays
  quiet. To type-check a specific file, add `// @ts-check` at the top. Because
  the codebase is global-scope, a checked file may report "Cannot find name X"
  for cross-file globals — declare those in `types/bcoffense.d.ts` as you adopt
  checking module-by-module.
- Incremental adoption path: pick a file → add `// @ts-check` → declare any
  globals it needs → fix what surfaces → move on. Never flip `checkJs: true`
  globally in one shot (it would flood thousands of pre-existing findings).

### Formatting (deterministic)

- `.prettierrc.json` pins the exact style the codebase already uses
  (printWidth 80, 2-space, double quotes, semicolons, trailing commas). It
  matches the current formatting, so committing it does NOT reflow existing
  code.
- `.prettierignore` keeps the formatter off vendored/minified files
  (`lz-string.min.js`, `node_modules`, icons).
- `.editorconfig` freezes indentation/charset/EOL across editors.

### Do not commit dependencies

- `tests/node_modules/` is git-ignored (Playwright deps are regenerable via
  `npm install` inside `tests/`). Never re-track it.
