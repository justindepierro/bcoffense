# Refactor Roadmap

This file tracks the repo-wide cleanup, refactor, and performance order so follow-up batches stay aligned.

Use this as the source of truth for what comes next after each completed sweep.

## Current Order

1. Callsheet split and cleanup
2. Startup lazy-init and boot performance
3. Utils split and ownership tightening
4. Script render/performance sweep
5. Tendencies or installation split
6. CSS consolidation and token cleanup

## Phase 1: Callsheet Split and Cleanup

Priority: highest

- [x] Create a repo roadmap so the sequence is tracked in-source
- [x] Start the first callsheet seam with category names/colors/custom-category CRUD
- [x] Extract category notes, targets, and category metadata menu helpers
- [x] Extract callsheet layout/order modal state and drag-drop helpers
- [x] Extract callsheet picker/runtime and remaining drag-drop bindings
- [x] Validate each seam with syntax, targeted browser checks, and saved-state checks

Definition of done:

- `callsheet.js` is no longer the only owner of category management, overlays, render, and runtime.
- New callsheet changes can be placed by responsibility without searching the full monolith.

Status:

- Phase 1 is complete. The next active sweep is Phase 2: startup lazy-init and boot performance.

## Phase 2: Startup Lazy-Init and Boot Performance

Priority: high

- [ ] Measure current startup cost on a representative stored playbook session
- [ ] Gate heavy module init behind first-tab-open where possible
- [ ] Defer non-critical dashboard, tendencies, and callsheet setup until needed
- [ ] Re-check saved-session restore and last-tab restore behavior after the gating pass

Definition of done:

- Initial boot does less work before the user reaches the active tab.
- Deferred modules still restore correctly when opened later in the session.

## Phase 3: Utils Split and Ownership Tightening

Priority: high

- [ ] Separate storage/migrations from modal primitives
- [ ] Separate DOM helper utilities from backup/restore flows
- [ ] Reduce the number of unrelated responsibilities owned by `utils.js`

Definition of done:

- `utils.js` is no longer the default dumping ground for unrelated runtime features.

## Phase 4: Script Render and Performance Sweep

Priority: medium-high

- [ ] Measure large-script render and filter hotspots
- [ ] Reduce broad `innerHTML` rebuilds for small state changes
- [ ] Tighten Script ownership where render, storage, and selection still overlap

## Phase 5: Tendencies or Installation Split

Priority: medium

- [ ] Choose the larger product-value target between `tendencies.js` and `installation.js`
- [ ] Split state, render, and runtime bindings into focused files

## Phase 6: CSS Consolidation and Token Cleanup

Priority: medium

- [ ] Consolidate duplicated component patterns across `script.css`, `callsheet.css`, and `components.css`
- [ ] Normalize token usage and reduce one-off layout rules where the JS ownership is already stable

## Guardrails

- Prefer small validated seams over broad rewrites.
- When adding a split runtime file, update `index.html`, `sw.js`, and instruction docs in the same change.
- Keep persistence through `storageManager` and preserve saved-data compatibility unless a migration is planned.
- Bump `CACHE_NAME` in `sw.js` after any HTML/CSS/JS change.