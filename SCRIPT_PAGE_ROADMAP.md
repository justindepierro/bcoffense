# Script Page Roadmap

This file tracks the post-refactor state of the Practice Script surface and the next recommended batches.

It is based on the current runtime split and the verified behavior in:

- `js/script-state.js` through `js/script-storage.js`
- `js/app-navigation.js`, `js/app-events.js`, and `js/app-shell.js`
- `css/script.css`
- the Script section in `index.html`

Use this file as the source of truth when planning follow-up work on the Script page.

## Refactor Status

The major Script refactor is complete.

- [x] The old `js/script.js` monolith has been removed.
- [x] Script runtime ownership is split across focused `script-*` files.
- [x] Missing helper boundaries exposed by the split were restored and validated.
- [x] Saved-script workspace restoration now includes display/filter/collapse context.
- [x] Overlay accessibility regressions found during the cleanup pass were fixed.
- [x] The current service worker version is aligned with the refactor batches.

## Completed Work

### Structure and Ownership

- [x] Extract script shared state into `script-state.js`
- [x] Extract shared Script UI helpers into `script-shared.js`
- [x] Extract player-assignment behavior into `script-players.js`
- [x] Extract add/insert/drag-drop flows into `script-add.js`
- [x] Extract sort/custom-order flows into `script-sort.js`
- [x] Extract export and print flows into `script-export.js`
- [x] Keep render/stat/search/jump responsibilities in `script-render.js`
- [x] Keep period/template behavior in `script-periods.js`
- [x] Keep preferred metadata sync in `script-period-sync.js`
- [x] Keep persistence/draft/save/restore behavior in `script-storage.js`

### Verified Cleanup and Behavior Fixes

- [x] Live rows and print/export now use the same Script display settings
- [x] Duplicate wristband-number toggle state was consolidated
- [x] Verified dead state and stale locals were removed
- [x] Available-play filtering and selection flows were stabilized
- [x] Script render-path duplication was reduced
- [x] Saved-script cards and empty states were improved
- [x] Mobile/touch targets and keyboard behavior were improved
- [x] Hidden help, constraints, and play-editor overlays no longer keep focusable controls active while closed

### Validation Already Completed

- [x] `node --check` clean across the refactored Script runtime
- [x] focused browser smoke checks for add/search/filter collapse/undo/redo
- [x] draft restore behavior verified after cleanup
- [x] overlay state audit for hidden-but-focusable regressions

## Open Work

These are the remaining high-value items after the structural refactor.

### Phase 1: Measure Before Optimizing More

Priority: highest

- [ ] Use the render benchmark helper on a representative large saved script
- [ ] Capture baseline `renderScript()` stage timings for common actions
- [ ] Document the worst hot paths before making another performance pass

Definition of done:

- We have a repeatable timing baseline for large-script operations.
- The next performance batch is based on measured cost, not guesswork.

### Phase 2: Script Ownership Tightening

Priority: high

- [ ] Review remaining cross-file helper leakage between `script-shared.js`, `script-render.js`, and `script-storage.js`
- [ ] Trim any remaining compatibility wrappers that no longer need to exist
- [ ] Make the owner of each Script toolbar/status/helper path explicit and minimal

Definition of done:

- The Script runtime split is easier to reason about without “temporary” ownership seams.
- New Script changes can be placed by responsibility without searching the whole runtime.

### Phase 3: Script UX Follow-Through

Priority: medium

- [ ] Decide whether Script display presets should exist like wristband presets
- [ ] Decide whether Script should have a dedicated shortcuts/help modal
- [ ] Evaluate period summaries with per-period run/pass breakdowns
- [ ] Evaluate script health checks for empty periods and missing metadata

Definition of done:

- The next Script improvements are productized workflow features rather than refactor cleanup.

## Related Repo Follow-Up

The Script page is no longer the primary architecture risk. After the measurement batch, the next repo-wide cleanup should target the remaining large ownership surfaces.

- [ ] Audit `callsheet.js` for the next low-risk ownership/dead-code cleanup pass
- [ ] Audit `wristband.js` for duplicated helpers and stale modal/overlay patterns
- [ ] Keep architecture docs aligned with the post-Script split runtime

## Guardrails

- Keep all persistence through `storageManager`.
- Keep event handling aligned with the delegated `data-action` model.
- Prefer small validated batches over broad rewrites.
- Bump `CACHE_NAME` in `sw.js` after any HTML/CSS/JS change.
- Preserve saved-data compatibility unless a migration is explicitly planned.

## Recommended Next Batch

When work resumes on Script, start here:

- [ ] Run the render benchmark helper on a large saved script and record the timing summary
