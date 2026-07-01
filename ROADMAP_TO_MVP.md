# Script 6 — Core Workflow and UX Implementation Checklist

> Use `- [ ]` for incomplete work and change it to `- [x]` when completed. Add implementation notes, commit hashes, screenshots, or test results as indented bullets beneath each task.

## Executive conclusion

The application has six strong core tools but they still behave as adjacent modules rather than one guided weekly workflow:

1. Playbook
2. Opponent Scout
3. Game Plan
4. Practice Script
5. Wristband
6. Call Sheet

The correct consolidation strategy is not to delete features. It is to create a shared **Game Week workspace** that connects these tools through one active opponent, shared play identity, shared selection state, explicit handoffs, status indicators, and return paths.

The supporting pages—Dashboard, Installation, Identity, Offense Builder, readiness reports, notes, analytics, storage, and administrative tools—should become secondary utilities surfaced contextually rather than equal-weight destinations in the main workflow.

---

# Major findings

## 1. Navigation does not reflect the real coaching workflow

The top-level tab bar currently gives nearly equal weight to Playbook, Practice Script, Wristband, Defensive Tendencies, Game Plan, Call Sheet, Installation, Identity, Offense Builder, Dashboard, and CSV upload.

This hides the actual sequence:

**Playbook → Opponent Scout and/or Game Plan → Practice Script → Wristband → Call Sheet**

A coach should always know:

- Which opponent is active.
- Which game week is active.
- How many plays have been selected.
- Which plays have reached each downstream artifact.
- What remains incomplete.
- Which version is currently published or printed.

## 2. Opponent Scout has significant logic but weak product framing

The existing Defensive Tendencies module contains:

- Opponent creation and selection.
- Play-by-play charting.
- Rapid and wizard entry modes.
- Search and filters.
- Bulk editing.
- Statistics.
- CSV and JSON import/export.
- Printing.
- Active-opponent selection.
- Query helpers used by scouting integrations.

It therefore is not an empty feature. However, it feels underdeveloped because:

- The label “Def Tendencies” is narrower than the intended “Opponent Scout” job.
- The home screen is primarily a list of opponents plus import/export controls.
- Opponent cards do not communicate report readiness, film count, sample size, or the next action.
- There is no obvious scouting dashboard before the raw charting table.
- The module does not clearly feed recommendations into Game Plan.
- There is no strong “Scout this opponent → build plan” handoff.
- The first click target competes with nested rename/delete controls.
- The page is rendered into one empty container, so initial failures can appear as a blank/nonclicking page.
- Mobile information architecture is still heavily table-oriented.

## 3. Integrations exist but are fragmented

There are already functions for:

- Sending Playbook selections to Game Plan.
- Loading Game Plan selections in Playbook.
- Pushing Game Plan to Practice Script.
- Pushing Game Plan boxes to Call Sheet.
- Sending Wristband data to Game Plan.
- Loading Wristband into Call Sheet.
- Showing scouting intel in Call Sheet.
- Linking an active opponent to the game week.

The problem is discoverability, state transparency, and synchronization—not total absence of integration.

## 4. Dropdowns use multiple positioning systems

The application contains:

- Generic `.tool-menu` dropdowns positioned absolutely inside wrappers.
- Column menus.
- More-tools menus.
- Quick-tools menus.
- Context menus moved to `document.body` and positioned fixed.
- Page-specific menus and action sheets.
- Mobile drawers and modal overlays.

Only some menus clamp to viewport edges. Absolutely positioned menus can be clipped by:

- Overflowing toolbars.
- Scroll containers.
- Sticky headers.
- Narrow viewports.
- Right-aligned triggers.
- Browser zoom.
- iPad split screen.

The app needs one anchored floating-layer utility rather than many independent dropdown implementations.

## 5. Page introductions consume too much mobile space

Descriptive headers, subtitles, hints, workflow explanations, and long instruction strips are helpful during onboarding, but they remain permanently expanded.

On mobile they compete with the work itself. The Call Sheet hint is a clear example: useful desktop instructions become a large permanent block above the actual sheet.

The correct model is:

- Full introduction on first use and desktop.
- Compact one-line page identity during normal use.
- Expandable “How this works” help.
- Persistent progress/status, not persistent prose.

## 6. Responsive button behavior is page-specific instead of systematic

Each large page defines its own toolbars and wrapping behavior. This produces uneven results as width decreases.

The application needs shared control-layout primitives that intentionally transform:

- Desktop: maximum useful actions on one row.
- Tablet: primary actions visible, secondary actions grouped.
- Phone: even two-column or three-column action grid, with one full-width primary action where appropriate.
- Very narrow phone: one or two columns without crushed labels.

---

# Recommended product architecture

## Primary navigation

Create a primary workflow navigation containing:

1. Playbook
2. Opponent Scout
3. Game Plan
4. Practice
5. Wristband
6. Call Sheet

Move these into a secondary utility menu:

- Dashboard
- Installation
- Identity
- Offense Builder
- Reports and analytics
- Storage/import/export
- Team settings
- Administration

Dashboard may remain the default landing page, but it should function as a Game Week command center rather than another disconnected tool.

## Shared Game Week context

Create one canonical Game Week object that contains:

- Opponent ID and name.
- Week label/date.
- Varsity/JV/team scope.
- Selected Playbook play IDs.
- Game Plan snapshot/version.
- Practice Script IDs and publication state.
- Wristband ID/version.
- Call Sheet ID/version.
- Scout report ID/version.
- Last modified timestamps.
- Completion/status values.

Every core page should display the same compact Game Week bar.

## Workflow status model

Suggested statuses:

- Not started
- In progress
- Ready for review
- Approved
- Published
- Printed
- Out of sync

Each downstream artifact should show when its source changed after the artifact was generated.

Example:

- Game Plan changed after Practice Script was built.
- Wristband changed after Call Sheet loaded it.
- Scout report gained 42 new charted plays after Game Plan recommendations were generated.

---

# 300-step implementation roadmap

## Phase 1 — Baseline and instrumentation

- [ ] **1.** Create a branch dedicated to workflow and responsive architecture.
- [ ] **2.** Record screenshots of all six pages at desktop, iPad portrait, iPad landscape, and phone widths.
- [ ] **3.** Record the current click path for a complete game-week workflow.
- [ ] **4.** Inventory every top-level page and classify it as Core Workflow, Supporting Utility, Administration, or Player Experience.
- [ ] **5.** Inventory every dropdown, popover, context menu, bottom sheet, side drawer, and modal.
- [ ] **6.** Inventory every page header, subtitle, instruction block, hint strip, and step indicator.
- [ ] **7.** Inventory every toolbar and button group.
- [ ] **8.** Add a development report that lists visible fixed and absolute-positioned floating layers.
- [ ] **9.** Add a development report that lists elements creating horizontal overflow.
- [ ] **10.** Add interaction tests for every top-level tab.
- [ ] **11.** Add a test proving Opponent Scout renders a nonempty home state.
- [ ] **12.** Add a test proving an opponent card opens its detail view.
- [ ] **13.** Add a test proving nested rename/delete actions do not also open the card.
- [ ] **14.** Add screenshots for empty, populated, and active Opponent Scout states.
- [ ] **15.** Establish baseline task times for Playbook-to-Call-Sheet workflow.

## Phase 2 — Canonical workflow and information architecture

- [x] **16.** Rename the user-facing “Def Tendencies” tab to “Opponent Scout.”
  - Done via immediate fix #1. Commit `8ef1d3c` (SW v754).
- [x] **17.** Preserve internal IDs temporarily to avoid unnecessary migration risk.
  - `tendencies` tab id, storage keys, and function/variable names left untouched.
- [x] **18.** Define the six primary workflow destinations.
- [x] **19.** Move supporting pages into a single Utilities or More destination.
- [x] **20.** Keep role-based access rules intact.
- [x] **21.** Create a compact desktop workflow nav with all six primary tools visible.
- [x] **22.** Create a tablet workflow nav that remains stable in portrait and landscape.
- [ ] **23.** Create a phone workflow switcher or bottom navigation that does not attempt to show every utility.
- [x] **24.** Add a visible active-opponent indicator to the global shell.
- [x] **25.** Add a visible game-week label to the global shell.
- [x] **26.** Allow opponent switching from the shared context bar.
- [ ] **27.** Warn before switching opponents when unsaved page state exists.
- [ ] **28.** Preserve each opponent’s last active page and artifact selections.
- [ ] **29.** Add Previous Step and Next Step controls where they provide a natural handoff.
- [ ] **30.** Do not force a strictly linear workflow; support branching from Playbook to Scout, Game Plan, or Practice.

## Phase 3 — Shared Game Week data model

- [ ] **31.** Audit the existing game-week and active-opponent storage models.
- [ ] **32.** Create one canonical game-week accessor.
- [ ] **33.** Replace duplicate opponent-name matching with stable opponent IDs where possible.
- [ ] **34.** Add migration logic for existing name-based data.
- [ ] **35.** Add artifact references for scout report, plan, scripts, wristband, and call sheet.
- [ ] **36.** Add artifact version numbers.
- [ ] **37.** Add source-version references.
- [ ] **38.** Add last-modified timestamps.
- [ ] **39.** Add created-by and last-edited-by fields where authentication supports them.
- [ ] **40.** Add team-level scope and Varsity/JV scope.
- [ ] **41.** Add a safe unassigned-game-week state.
- [ ] **42.** Add validation for orphaned artifact references.
- [ ] **43.** Add a game-week duplication command for recurring opponents or rematches.
- [ ] **44.** Add archive and restore support.
- [ ] **45.** Add backward-compatible reads for older locally stored data.

## Phase 4 — Game Week command center

- [x] **46.** Redesign Dashboard as a Game Week command center.
- [x] **47.** Show the active opponent prominently.
- [x] **48.** Show the next game/date if available.
- [x] **49.** Show six workflow cards in order.
- [x] **50.** Display each card’s status and last modified time.
- [x] **51.** Display counts such as selected plays, scripted plays, wristband cells, and call-sheet calls.
- [x] **52.** Add Continue buttons that reopen the exact prior state.
- [x] **53.** Add warning badges for out-of-sync artifacts.
- [x] **54.** Add a “Start New Game Week” guided action.
- [x] **55.** Add a “Resume Current Week” action.
- [x] **56.** Add quick access to printing without making print controls dominate editing pages.
- [x] **57.** Add a consolidated recent activity feed.
- [x] **58.** Add a small notes/reminders area rather than allowing notes to compete with workflow.
- [x] **59.** Add role-specific command-center content.
- [x] **60.** Keep analytics and administrative details behind secondary links.

## Phase 5 — Opponent Scout rebuild

- [x] **61.** Replace the current plain opponent list with opponent workspace cards.
- [x] **62.** Show opponent name, record/date metadata if available, charted-play count, games charted, and last updated.
- [x] **63.** Show whether the opponent is active for the current week.
- [x] **64.** Show a scout completeness score based on sample size and field coverage.
- [x] **65.** Make the full card a reliable accessible button or link.
- [x] **66.** Move rename/delete into an explicit overflow menu.
- [x] **67.** Stop nested action bubbling from triggering card navigation.
- [x] **68.** Add loading, render-error, and empty states so the page never appears silently blank.
- [x] **69.** Add a Scout Overview screen before the raw play table.
- [x] **70.** Show sample-size warnings.
- [x] **71.** Show run/pass tendency summary.
- [x] **72.** Show personnel summary.
- [x] **73.** Show formation summary.
- [x] **74.** Show down-and-distance summary.
- [x] **75.** Show field-zone summary.
- [x] **76.** Show motion/shift summary.
- [x] **77.** Show pressure/blitz summary if charted.
- [x] **78.** Show coverage/front summary if charted.
- [x] **79.** Show top tendencies with confidence indicators.
- [x] **80.** Show “What this means for us” recommendations.
- [x] **81.** Add links from each recommendation to matching Playbook plays.
- [x] **82.** Add “Send recommendation to Game Plan.”
- [x] **83.** Add “Filter Playbook against this tendency.”
- [x] **84.** Add “Create Practice Period from tendency.”
- [x] **85.** Add “Add scouting note to Call Sheet.”
- [x] **86.** Add game/film source records to opponent data.
- [x] **87.** Support charting separate games rather than one undifferentiated play pool.
- [ ] **88.** Add quarter, score state, hash, field position, and drive context where useful.
- [ ] **89.** Add charting templates for common opponent data.
- [ ] **90.** Retain Rapid and Wizard modes, but make their purpose obvious.
- [ ] **91.** Create a phone-native charting workflow using one step/card at a time.
- [ ] **92.** Create an iPad split view with play list, charting form, and live summary.
- [ ] **93.** Replace wide tables on phone with cards or focused detail sheets.
- [ ] **94.** Add direct import validation with field mapping preview.
- [ ] **95.** Add duplicate-play/import detection.
- [ ] **96.** Add a scout report print preset using the existing print suite.
- [ ] **97.** Add presentation mode for opponent summaries.
- [ ] **98.** Add export to Game Plan as structured recommendations, not just notes.
- [ ] **99.** Add opponent-specific archived reports by season/week.
- [ ] **100.** Add tests for all opponent card and handoff actions.

## Phase 6 — Playbook as the source of truth

- [ ] **101.** Confirm every play has a stable play ID used across all modules.
- [ ] **102.** Remove signature-only matching where stable IDs can be used.
- [x] **103.** Add workflow status chips to Playbook rows/cards.
- [x] **104.** Show whether a play is in the active Game Plan.
- [x] **105.** Show whether it is in the active Practice Script.
- [x] **106.** Show Wristband number when assigned.
- [x] **107.** Show Call Sheet category membership.
- [x] **108.** Show scout relevance for the active opponent.
- [x] **109.** Add a single “Add to Week” action that opens destination choices.
- [x] **110.** Add bulk Add to Game Plan, Practice, Wristband, and Call Sheet.
- [x] **111.** Preserve existing specialized actions.
- [x] **112.** Add a compact active-opponent filter.
- [x] **113.** Add a scout-recommended filter.
- [x] **114.** Add a not-yet-used-this-week filter.
- [x] **115.** Add a workflow side panel showing downstream status for the selected play.

## Phase 7 — Game Plan handoffs

- [x] **116.** Make Game Plan the main curation workspace for coaches who use it.
- [x] **117.** Add a source badge showing Playbook and Scout inputs.
- [x] **118.** Show why a play was recommended for the active opponent.
- [x] **119.** Add recommendation confidence and supporting tendency.
- [x] **120.** Add a preview of downstream Practice, Wristband, and Call Sheet placement.
- [x] **121.** Add one-click Push to Practice with a period-mapping preview.
- [x] **122.** Add one-click Send to Wristband with card/cell mapping preview.
- [x] **123.** Add one-click Push to Call Sheet with category mapping preview.
- [x] **124.** Detect and skip duplicates using stable IDs.
- [x] **125.** Show a handoff receipt after every transfer.
- [x] **126.** Include Added, Updated, Skipped, Conflict, and Removed counts.
- [x] **127.** Allow Undo Transfer immediately after handoff.
- [x] **128.** Mark destination artifacts out of sync when Game Plan changes later.
- [x] **129.** Add Compare with Destination before overwriting.
- [x] **130.** Preserve manual destination edits unless the coach explicitly replaces them.

## Phase 8 — Practice Script integration

- [x] **131.** Add a visible source indicator for Game Plan-loaded plays.
- [x] **132.** Add an active-opponent badge to the Script workspace.
- [x] **133.** Add a compact “Available this week” play rail.
- [x] **134.** Separate Game Plan selections from the entire Playbook in the rail.
- [x] **135.** Add Create Script from Game Plan with period templates.
- [ ] **136.** Add scout-driven period suggestions such as pressure pickup or red-zone tendency.
- [ ] **137.** Show plays not yet scripted.
- [ ] **138.** Show scripted plays no longer in Game Plan.
- [ ] **139.** Add reconcile actions rather than silently changing the script.
- [x] **140.** Add Send Script Plays to Wristband.
  - `sendScriptToWristband()` already in `script-integrations.js`; "🃏 Wristband" button in "Send To" drawer. Commit pre-existing.
- [ ] **141.** Add Send Selected Script Plays to Call Sheet.
- [ ] **142.** Add quiz creation entry point from a published script.
- [x] **143.** Preserve focused Team Run mode.
  - Team Run mode in `script-render.js` unchanged; no regression introduced.
- [ ] **144.** Add an artifact status bar for Save, Publish, Quiz, Present, Print.
- [x] **145.** Keep secondary editing tools in a drawer.
  - Script "⋯ More Tools" drawer already contains all secondary editing tools.

## Phase 9 — Wristband integration

- [x] **146.** Add Create Wristband from Game Plan.
  - `createWristbandCardFromGamePlan()` in `wristband-chrome.js` — new named card from all GP box plays in box order; undo-able. Commit `9ff5701` (SW v777).
- [x] **147.** Add Create Wristband from Practice Script.
  - `createWristbandCardFromScript()` in `wristband-chrome.js` — new card from script plays in script order. Commit `9ff5701` (SW v777).
- [x] **148.** Preserve the source order when requested.
  - Source order (GP box order / script order) maintained natively by both create functions. Commit `9ff5701` (SW v777).
- [x] **149.** Show source and synchronization state.
  - `updateWristbandSourceBadge()` + `#wbSourceBadge` pill in card tab row shows creation source and date; updates on card switch. Commit `9ff5701` (SW v777).
- [x] **150.** Show call-sheet usage for each wristband play.
  - `_wbCsDot()` in `wristband-render.js` adds a small blue dot to any cell whose play appears on the call sheet (with category tooltip). Hidden in print. Commit `9ff5701` (SW v777).
- [x] **151.** Add a compact "Not yet on Wristband" source list.
  - `showWristbandNotYetList()` in `wristband-chrome.js` — modal listing source plays (GP or Script) not yet placed on any card. ⋯ → "Not Yet on Wristband". Commit `9ff5701` (SW v777).
- [x] **152.** Add update/reconcile instead of destructive reload.
  - `reconcileWristbandWithSource()` diffs the active card against its source; adds new plays to empty cells, removes stale ones. Undo-able. Commit `9ff5701` (SW v777).
- [x] **153.** Add conflict handling when a source play changed.
  - Reconcile detects stale source-tagged cells (`_gpSource`/`_scriptSource`) no longer in the source and offers removal. Commit `9ff5701` (SW v777).
- [x] **154.** Preserve manual cell customization during source refresh.
  - Reconcile only removes source-tagged cells; manual entries and all cell customizations are preserved. Commit `9ff5701` (SW v777).
- [x] **155.** Add Send Wristband to Call Sheet with mapping preview.
  - `sendWristbandToCallSheet()` in `wristband-chrome.js` — fans out card plays to CS categories with append/replace choice, category breakdown, and undo. Commit `9ff5701` (SW v777).
- [x] **156.** Add Return to Practice and Continue to Call Sheet actions.
  - "← Script" and "Call Sheet →" quick-nav buttons added to wristband toolbar right. Commit `9ff5701` (SW v777).
- [x] **157.** Preserve the printing suite as a first-class output.
  - Wristband print suite (`wristband-export.js`, `wristband-chrome.js`) unchanged; existing print flow verified. Commit `9ff5701` (SW v777).
- [x] **158.** Keep print settings separate from normal cell entry on phone.
  - Print dialog is already separate (`printWristband` modal) from the cell editor; no structural changes needed. Commit `9ff5701` (SW v777).

## Phase 10 — Call Sheet as final game-day artifact

- [ ] **159.** Treat Call Sheet as the workflow endpoint.
- [ ] **160.** Display active opponent and source versions.
- [ ] **161.** Show loaded Game Plan, Script, and Wristband status.
- [ ] **162.** Add a source reconciliation panel.
- [ ] **163.** Show missing Game Plan plays.
- [ ] **164.** Show Wristband plays not placed on the sheet.
- [ ] **165.** Show Call Sheet plays no longer present upstream.
- [ ] **166.** Keep scouting intel contextually available.
- [ ] **167.** Convert scouting intel into category-specific recommendations.
- [ ] **168.** Add one-click insert from recommendations.
- [ ] **169.** Preserve the full print layout and existing print suite.
- [ ] **170.** Separate editing view, sideline situation view, and print preview.
- [ ] **171.** Add Finalize Week action with validation checklist.
- [ ] **172.** Validate that critical situations have calls.
- [ ] **173.** Validate that displayed wristband numbers match the active wristband.
- [ ] **174.** Validate that no removed/deprecated plays remain unintentionally.
- [ ] **175.** Save a locked game-day snapshot before printing.

## Phase 11 — Unified dropdown and floating-layer system

- [ ] **176.** Inventory all `.tool-menu`, column menus, quick menus, context menus, and page-specific popovers.
- [x] **177.** Create one `AnchoredMenu` or equivalent shared utility.
- [x] **178.** Portal anchored menus to a shared floating-layer root under `document.body`.
- [x] **179.** Position menus from the trigger’s `getBoundingClientRect()`.
- [x] **180.** Reposition on open, resize, orientation change, visualViewport resize, and relevant scroll events.
- [x] **181.** Support preferred placements: bottom-start, bottom-end, top-start, top-end.
- [x] **182.** Automatically flip when insufficient space exists.
- [x] **183.** Shift/clamp within safe viewport margins.
- [x] **184.** Account for safe-area insets.
- [x] **185.** Account for iPad split-screen widths.
- [x] **186.** Account for browser zoom and visual viewport offsets.
- [x] **187.** Add max-height and internal scrolling for tall menus.
- [x] **188.** Keep the menu attached visually to its trigger.
- [ ] **189.** Close when the trigger leaves the viewport or relevant container.
- [x] **190.** Close on outside click, Escape, route/page change, and another menu opening.
- [ ] **191.** Restore focus to the trigger.
- [ ] **192.** Add roving keyboard navigation for menu items.
- [ ] **193.** Add Home, End, ArrowUp, and ArrowDown support.
- [ ] **194.** Add correct menu/menuitem semantics where appropriate.
- [ ] **195.** Do not use menu semantics for form-heavy popovers; use dialog/popover semantics instead.
- [ ] **196.** Prevent nested menus from closing before their action executes.
- [x] **197.** Migrate header overflow first.
- [ ] **198.** Migrate Playbook analytics/data menus.
- [x] **199.** Migrate Call Sheet More menu.
- [ ] **200.** Migrate Wristband menus.
- [ ] **201.** Migrate Script tools.
- [ ] **202.** Migrate Game Plan context menus.
- [ ] **203.** Migrate Opponent Scout action menus.
- [ ] **204.** Migrate column visibility menus.
- [ ] **205.** Add automated edge tests at all four viewport corners.
- [ ] **206.** Add tests inside sticky and scrollable containers.
- [ ] **207.** Remove obsolete page-specific positioning code after migration.

## Phase 12 — Mobile page-header compaction

- [x] **208.** Create a shared `PageIntro` component or markup contract.
- [ ] **209.** Divide each intro into identity, status, primary action, and help content.
- [x] **210.** Keep title and essential state always visible.
- [x] **211.** Hide long subtitle text by default on phone after first use.
- [x] **212.** Add a compact Help or How It Works disclosure.
- [ ] **213.** Save dismissal/expanded preference by page.
- [ ] **214.** Show onboarding prose automatically only for new/empty states.
- [x] **215.** Replace permanent hint strips with small contextual help buttons.
- [x] **216.** Convert the Call Sheet long hint to an expandable help sheet.
- [ ] **217.** Convert Script instructions into contextual help near relevant tools.
- [ ] **218.** Convert Opponent Scout subtitle into first-use guidance.
- [ ] **219.** Use one-line compact subtitles on tablet.
- [ ] **220.** Preserve full descriptive headers in desktop onboarding states.
- [ ] **221.** Avoid repeating the page title in both global navigation and local header when space is constrained.
- [ ] **222.** Add `aria-expanded` and accessible labels to help disclosures.
- [ ] **223.** Test header height with long opponent names and localization-safe wrapping.

## Phase 13 — Responsive button layout system

- [ ] **224.** Create shared toolbar primitives:
- [ ] **225.** `toolbar-surface`
- [ ] **226.** `toolbar-primary`
- [ ] **227.** `toolbar-secondary`
- [ ] **228.** `toolbar-status`
- [ ] **229.** `toolbar-overflow`
- [x] **230.** `action-grid`
- [ ] **231.** `segmented-control`
- [ ] **232.** `icon-action`
- [x] **233.** `full-width-primary`
- [x] **234.** Define action priority levels: primary, frequent, secondary, destructive, contextual.
- [x] **235.** Desktop: keep primary and frequent actions on one row where width permits.
- [x] **236.** Desktop: allow compact icon-label buttons with stable heights.
- [ ] **237.** Desktop: move rarely used tools into one overflow menu.
- [ ] **238.** Tablet: keep one or two primary actions visible and group the rest logically.
- [x] **239.** Phone: use an even two-column grid for normal action groups.
- [x] **240.** Phone: allow three columns only for short, icon-forward controls.
- [x] **241.** Phone: make the dominant action full width when appropriate.
- [x] **242.** Very narrow phone: collapse to one column without truncating critical labels.
- [x] **243.** Keep all touch targets at least 44×44; prefer 48px on tablet.
- [ ] **244.** Use `grid-template-columns: repeat(auto-fit, minmax(...))` where it produces stable ordering.
- [ ] **245.** Do not use auto-fit when it reorders conceptual groups unpredictably.
- [ ] **246.** Preserve DOM order as task order.
- [ ] **247.** Prevent isolated buttons from stretching absurdly unless designated full width.
- [ ] **248.** Normalize gaps, heights, icon spacing, and text alignment.
- [ ] **249.** Normalize loading, disabled, active, warning, and destructive states.
- [ ] **250.** Add an overflow rule based on priority rather than arbitrary CSS hiding.
- [ ] **251.** Use ResizeObserver to detect when a toolbar cannot fit.
- [ ] **252.** Avoid measuring every frame or creating layout loops.
- [ ] **253.** Add screenshots for each toolbar at key widths.
- [ ] **254.** Migrate Call Sheet toolbar.
- [ ] **255.** Migrate Wristband toolbar.
- [ ] **256.** Migrate Practice Script toolbar.
- [ ] **257.** Migrate Game Plan toolbar.
- [ ] **258.** Migrate Playbook toolbar.
- [ ] **259.** Migrate Opponent Scout toolbar.

## Phase 14 — Supporting-feature consolidation

- [ ] **260.** Keep all existing features but reduce equal-weight navigation.
- [ ] **261.** Group Installation, Identity, and Offense Builder under Offense Setup.
- [ ] **262.** Group readiness, balance, touch, situation, and constraint reports under Analytics.
- [ ] **263.** Group import, export, cleanup, sync, and storage under Data Tools.
- [ ] **264.** Group team settings, users, and permissions under Administration.
- [ ] **265.** Surface a supporting feature contextually from the core page where it matters.
- [ ] **266.** Link Identity alignment from Playbook and Game Plan.
- [ ] **267.** Link Installation status from Playbook and Practice.
- [ ] **268.** Link readiness from Practice and Dashboard.
- [ ] **269.** Link constraints from Game Plan and Call Sheet.
- [ ] **270.** Avoid deleting deep tools simply because they are less frequently used.

## Phase 15 — Validation, polish, and rollout

- [ ] **271.** Add end-to-end test: select active opponent.
- [ ] **272.** Add end-to-end test: chart scout data.
- [ ] **273.** Add end-to-end test: send recommendation to Game Plan.
- [ ] **274.** Add end-to-end test: push Game Plan to Practice.
- [ ] **275.** Add end-to-end test: create/load Wristband.
- [ ] **276.** Add end-to-end test: load Wristband into Call Sheet.
- [ ] **277.** Add end-to-end test: print final artifacts.
- [ ] **278.** Assert stable play IDs survive every transfer.
- [ ] **279.** Assert no duplicate play creation during repeated handoffs.
- [ ] **280.** Assert manual destination edits survive reconcile unless replacement is confirmed.
- [ ] **281.** Assert out-of-sync badges appear after upstream changes.
- [ ] **282.** Assert every dropdown stays inside viewport.
- [ ] **283.** Assert every dropdown remains anchored during scroll and resize.
- [ ] **284.** Assert headers remain compact on phone.
- [ ] **285.** Assert button grids remain orderly at 320, 360, 390, 430, 768, 820, 1024, 1366, and 1440 widths.
- [ ] **286.** Assert no button drops below minimum touch target size.
- [ ] **287.** Assert no page-level horizontal overflow.
- [ ] **288.** Run manual iPad Safari and installed-web-app testing.
- [ ] **289.** Run iPad portrait, landscape, split-screen, and external-display tests.
- [ ] **290.** Run phone Safari and Chrome tests.
- [ ] **291.** Measure the updated full-workflow task time.
- [ ] **292.** Compare clicks, page switches, and duplicate data entry against baseline.
- [ ] **293.** Roll out the shared menu utility before redesigning every page simultaneously.
- [ ] **294.** Roll out the shared header and toolbar systems page by page.
- [ ] **295.** Regress the printing suite after every structural page change.
- [ ] **296.** Preserve print-only DOM and CSS separation.
- [ ] **297.** Document the final workflow for coaches.
- [ ] **298.** Add a one-screen first-use walkthrough.
- [ ] **299.** Collect coach feedback on terminology and ordering.
- [ ] **300.** Archive obsolete CSS and JavaScript only after successful regression testing.

---

# Recommended implementation order

## Release 1 — Architecture and reliability

- [ ] Canonical Game Week context.
- [x] Six-tool primary navigation.
- [x] Shared anchored dropdown utility.
- [x] Compact mobile page-intro system.
- [x] Shared responsive toolbar/action-grid system.
- [x] Opponent Scout card click reliability and nonblank states.

## Release 2 — Opponent Scout product rebuild

- [x] Scout Overview.
- [ ] Film/game grouping.
- [ ] Tendency summaries.
- [x] Confidence/sample-size indicators.
- [ ] Recommendations linked to Playbook and Game Plan.
- [ ] Mobile/iPad charting redesign.

## Release 3 — Workflow handoffs

- [ ] Stable play identity across modules.
- [x] Transfer receipts.
- [ ] Reconcile instead of overwrite.
- [ ] Out-of-sync detection.
- [ ] Game Plan → Practice/Wristband/Call Sheet improvements.

## Release 4 — Final game-week workspace

- [x] Dashboard command center.
- [x] Artifact completion statuses.
- [ ] Finalize-week validation.
- [ ] Locked game-day snapshots.
- [ ] Unified Present and Print entry points.

---

# Highest-priority immediate fixes

- [x] **1.** Rename Defensive Tendencies to Opponent Scout in the UI.
  - UI-only rename (tab, nav, headings, short label "Scout"); internal `tendencies` IDs/keys/functions preserved. Commit `8ef1d3c` (SW v754).
- [x] **2.** Make each opponent card a true accessible navigation target and isolate rename/delete controls.
  - Card is now a real `<button>` primary target plus a sibling `⋯` overflow menu (Rename/Delete) using the shared `.tool-menu` pattern — no more nested-interactive antipattern. Commit `ccacfec` (SW v755).
- [x] **3.** Add explicit render-error and loading states to `tendenciesContent`.
  - Home render wrapped in try/catch with `.td-state` loading spinner + error card with Retry; respects reduced-motion. Commit `08150e6` (SW v756).
- [x] **4.** Build one shared anchored-menu utility and migrate the header and Call Sheet menus first.
  - New `js/anchored-menu.js` positions any `.tool-menu-wrap[data-anchored]` via `position: fixed` from the trigger rect — flips vertically, clamps horizontally, scrolls when tall, honors safe-area insets + visual viewport (iPad split-screen), and repositions on scroll/resize. Header overflow and Call Sheet "More" menus opted in. Smoke contract `checkAnchoredMenuContract`. Commit `4fa5037` (SW v757).
- [x] **5.** Replace permanent mobile instruction blocks with expandable help.
  - New reusable `.page-help` `<details>` component (compact one-line summary + expandable "How this works", native/no-JS, keyboard-accessible). Call Sheet hint (the named example) converted from a permanent `.cs-hint` block that was hidden on phone to the expandable disclosure that now shows collapsed on every width; dead `.cs-hint` CSS removed. Smoke contract `checkPageHelpContract`. Commit `0488e0c` (SW v758).
- [x] **6.** Build one shared responsive action-grid/toolbar contract.
  - New reusable `.action-grid` primitive in `components.css`: desktop actions flow on one row (flex, wrap only when out of space); phone (≤640px) becomes an even two-column grid with ≥44px touch targets and stable DOM order; very narrow (≤380px) collapses to a single column with labels intact. Helpers: `.action-grid--icons` (three columns for icon-forward controls) and `.full-width-primary` / `[data-action-span="full"]` (dominant action spans the full width). First adopted on the Opponent Scout export/import group, replacing its bespoke stacked-column phone rules in `responsive.css`. Smoke contract `checkActionGridContract`. Commit `ff5f213` (SW v759).
- [x] **7.** Reduce the main navigation to the six core workflow tools plus Utilities.
  - Primary strip is now the six core Game Week tools in workflow order (Playbook → Opponent Scout → Game Plan → Practice → Wristband → Call Sheet). Dashboard, Installation, Identity, Offense Builder, and Load New CSV moved into one anchored "⋯ More" Utilities menu (reusing the fix #4 anchored-menu positioner). Active-tab highlighting refactored from brittle index-based lookup to id-based (`#tab-<name>`), so reordering and menu-housed tabs stay correct; `dashGoToTab` likewise. Auth tab-gating generalized to any `showTab` control so player-restricted utilities stay hidden even outside the `.tab` strip. Utilities remain fully discoverable via the command palette. Smoke contract `checkPrimaryNavContract`. Commit `065ec39` (SW v760).
- [x] **8.** Create a shared active-opponent/game-week bar.
  - New `#gameWeekBar` strip between the tab rail and the content panels shows the active opponent name and week label across all pages. Hidden when no opponent is set (zero-empty-state), revealed automatically when `setGameWeek` is called. Compact 28px bar using `--color-primary` background; dark-mode token override; truncates long names with ellipsis; collapses gracefully at ≤480px. Edit button (✏️ `data-action="focusDashOpponentSelect"`) jumps to Dashboard and focuses the opponent selector. `updateGameWeekBar()` added to `utils.js` and hooked into `setGameWeek()` (updates on every opponent change) and `initAllModules()` (restores from storage on session load). Smoke contract `checkGameWeekBarContract`. Commit `1f16995` (SW v762).
- [x] **9.** Add transfer receipts and destination status after every cross-page action.
  - Extended `showToast()` in `utils.js` to accept `action` as either a string (existing delegate path) or a **callback function** (new: called directly on click + toast dismissed). Seven cross-page success toasts upgraded with `actionLabel`/`action` pairs: Game Plan drafted→Call Sheet (×2, both "→ Call Sheet"), Game Plan→Script ("→ Script"), Dashboard→Game Plan ("→ Game Plan" + Holding count clarified), Playbook/wristband send→Game Plan ("→ Game Plan"), Script→Game Plan ("→ Game Plan"), Script→Wristband ("→ Wristband"). Descriptions also updated to name the destination page explicitly. Smoke contract `checkTransferReceiptContract`. Commit `8328a6e` (SW v763).
- [x] **10.** Begin the Opponent Scout Overview screen before expanding more raw charting fields.
  - New `renderScoutOverview()` in `tendencies-render.js`: shows after selecting an opponent with charted plays. Displays sample-size warning when < 20 plays; run/pass split bar; top fronts, top coverages, blitz types, and offensive formations faced — all computed from `queryTendencies({})` with horizontal percentage bars and raw counts. Direct action buttons (＋ Chart Play, 📋 Film Log, 🎯 View in Game Plan) use the `action-grid` contract from fix #6. Film Log gets an "⬅ Overview" back button. Empty opponents skip straight to Film Log. `selectTendenciesOpponent()` routes to Overview or Film Log based on play count via `tdShowScoutOverview` flag. CSS added in `tendencies.css` (`.td-ov-card`, `.td-ov-bar`, `.td-ov-split`, responsive grid). Smoke contract `checkScoutOverviewContract`. Commit `2f68bcf` (SW v764).

---

# Product principle

Do not consolidate by removing the features the coach loves. Consolidate by making every feature answer one of three questions:

- What am I building right now?
- Where did this information come from?
- What is the next useful action?

The application should feel like one game-week operating system with six major workstations, not six separate applications sharing a tab bar.
