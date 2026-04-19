# Script Page Improvement Roadmap

This file is the working roadmap and checklist for improving the Practice Script page.

It is based on the current verified audit of:

- `js/script.js`
- `js/app.js`
- `css/script.css`
- the Script section in `index.html`

Use this file as the source of truth when choosing the next batch of script-page work.

## Goals

- Eliminate verified dead or redundant code.
- Fix UI state mismatches and inconsistent behavior.
- Improve day-to-day speed for coaches building large practice scripts.
- Improve mobile usability and keyboard accessibility.
- Reduce rendering and filtering overhead for larger playbooks and scripts.
- Keep changes incremental and safe.

## Current Status

Completed already:

- [x] Live inline edits for notes, defense fields, and period labels
- [x] Script keyboard shortcuts for Cmd/Ctrl+A select all and Escape clear selection
- [x] Period header containment/content-visibility performance hint
- [x] Saved scripts now restore workspace context beyond play rows
- [x] Startup init path is hardened against optional UI wiring failures
- [x] Service worker bumped through `SW v71`

Still verified and pending:

- [x] Fix mismatched display-option wiring between live script rows and print/export
- [x] Consolidate duplicate wristband-number toggles into one source of truth
- [x] Remove verified dead state and dead locals
- [x] Fix malformed drag markup on script rows
- [x] Reduce available-play filtering/render cost
- [x] Improve touch targets and mobile usability
- [x] Improve empty states and filter recovery UX
- [x] Reduce global state leakage in sidebar selection/filter flows
- [x] Trim render-path complexity and duplicated formatting work
- [x] Improve saved-script workspace restoration behavior

## Verified Findings

### Correctness / Wiring

- [x] Live script rows currently use `getFullCall(p)` directly instead of the script display options object.
- [x] Print/export rows use the display options object, so live and printed output can diverge.
- [x] `scriptShowWbNum` and `showWristbandNums` overlap and are not the same source of truth.
- [x] Script rows currently emit duplicate `data-drag` attributes.

### Dead / Redundant Code

- [x] Remove `draggedElement` if no read path is introduced.
- [x] Remove unused renderer locals such as `currentPeriodId`.
- [x] Review duplicated UI state that exists in more than one checkbox or panel.

### Performance

- [x] Debounce available-play filtering on typed search.
- [x] Reduce full rebuild work in `renderScript()` where practical.
- [x] Cache formatted play-call output during render cycles.
- [x] Reduce per-row datalist duplication when shared lists are enough.
- [x] Replace `window.currentFilteredPlayIndices` with module-local state.
- [ ] Add a repeatable way to inspect `renderScript()` stage timings during development.

### UI / UX

- [x] Make filter recovery clearer when no plays match.
- [x] Persist filter-collapse state for repeat users.
- [x] Improve script toolbar and sidebar clarity around selection state.
- [x] Improve saved-script cards with stronger metadata and workflow cues.
- [x] Improve period-template flow and preview quality.

### Accessibility / Mobile

- [x] Increase touch targets for period and play controls.
- [x] Improve labels/announcements for checkbox, color, and drag-related controls.
- [x] Review period header focus treatment and mobile control density.
- [x] Review datalist-heavy defense inputs for keyboard and screen-reader clarity.

## Phase 1: Fix Verified Wiring and Cleanup

Priority: highest

- [x] Pass script display options into live row rendering so live view matches print/export
- [x] Remove duplicate WB-number toggle behavior and choose one checkbox / one code path
- [x] Fix duplicate `data-drag` attribute on script rows
- [x] Remove `draggedElement`
- [x] Remove `currentPeriodId` if it remains unused
- [x] Re-check editor diagnostics after cleanup
- [x] Bump service worker after the batch

Definition of done:

- Live script rows and print/export honor the same display settings.
- Only one WB-number toggle controls script numbering badges.
- No verified dead state remains from this cleanup batch.

## Phase 2: Sidebar Filtering and Selection UX

Priority: high

- [x] Debounce `scriptSearchPlay` filtering
- [x] Keep `clear search` and `active filters` feedback in sync with the actual filter state
- [x] Improve zero-results state with a one-click reset path
- [x] Replace `window.currentFilteredPlayIndices` with module-local script state
- [x] Review `selectedAvailablePlays` lifecycle so selection behavior stays predictable across filtering and paging
- [x] Add clearer copy for `Add All` vs `Add Selected`

Definition of done:

- Typing in the available-plays search remains responsive on larger playbooks.
- Sidebar selection feels stable across pages and filters.
- Zero-results state offers obvious recovery.

## Phase 3: Render Performance Pass

Priority: high

- [x] Add memoized/cached `getFullCall()` output inside `renderScript()`
- [x] Avoid repeated per-row formatting where values are reused in the same render
- [x] Reduce per-row datalist generation where shared datalists are sufficient
- [x] Identify updates that can patch DOM or update isolated regions instead of forcing full rebuilds
- [x] Avoid repeated per-period stat rescans during render passes
- [x] Reuse one render summary for stats, empty-state checks, and jump-menu periods
- [x] Add a repeatable render benchmark helper for stage timings
- [ ] Measure `renderScript()` hot paths before and after changes

Definition of done:

- Large scripts feel materially faster during edits and navigation.
- Render work is easier to reason about and less repetitive.

## Phase 4: UI / UX Polish

Priority: medium

- [x] Persist filter-collapse state across sessions
- [x] Improve toolbar clarity for sort state, search state, and selection state
- [x] Improve period template browse/insert workflow
- [x] Improve saved-script cards with richer metadata and stronger action hierarchy
- [x] Improve on-screen empty states for script and sidebar flows
- [x] Reduce control crowding in period action bars

Definition of done:

- The script page is easier to scan and operate without explanation.
- Repeated workflows take fewer clicks and require less recall.

## Phase 5: Accessibility and Mobile Pass

Priority: medium

- [x] Increase small control hit areas to a mobile-safe size
- [x] Review focus rings on period headers, toolbar controls, and row actions
- [x] Add or improve labels for color, drag, and selection controls where needed
- [x] Review keyboard access to bulk-selection flows and period actions
- [x] Audit script controls on narrow screens and reduce accidental taps

Definition of done:

- Core script editing is comfortable on mobile.
- Keyboard and assistive-tech behavior is consistent and explicit.

## Phase 6: Saved Script Workspace Quality

Priority: medium / future

Verified implementation now restores saved display options, sidebar filters/search, linked wristband selection, and collapsed period state when a saved script includes workspace data.

- [x] Decide what UI context should be saved with each script
- [x] Consider saving linked wristband selection with saved scripts
- [x] Consider saving collapse state per period when useful
- [x] Consider saving script-specific display preferences separately from global defaults
- [x] Review whether saved-script load should restore more of the working context

Definition of done:

- Loading a saved script restores the context coaches expect, not just the play rows.

## Future / Stretch Ideas

- [ ] Script presets similar to wristband display presets
- [ ] Script help / tips modal for shortcuts and workflows
- [ ] Better period summaries with run/pass tendencies per period
- [ ] Script health checks: empty periods, missing scouting fields, overloaded periods
- [ ] Optional compact density mode for large scripts
- [ ] Optional period duplication / cloning presets
- [ ] Faster compare / merge workflows for saved scripts
- [ ] Profiling hooks for render performance in development

## Guardrails

- Keep all persistence through `storageManager`.
- Keep event handling aligned with the existing delegation model.
- Prefer small, verified batches over large rewrites.
- Bump `CACHE_NAME` in `sw.js` after HTML/CSS/JS changes.
- Preserve existing saved-data compatibility unless a migration is explicitly planned.

## Recommended Next Batch

When we resume, start here:

- [ ] Use the new script render profiling hooks to capture before/after timing samples for large scripts
