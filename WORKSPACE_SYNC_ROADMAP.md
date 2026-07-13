# BCOffense Workspace Sync Roadmap

Last updated: 2026-07-13

Purpose: make saving, publishing, media upload, cloud sync, and player readiness
feel like one professional system instead of separate utilities.

## Product Goal

The coach should not need to think about local storage, Cloud Sync, diagram sync,
clip uploads, or player publish status as separate systems. The app should show a
single trustworthy workspace state:

- Saving...
- Uploading media...
- Saved locally
- Syncing to team cloud...
- Ready for players
- Offline - saved locally
- Sync needs attention

Manual sync actions should become fallback/retry tools, not the primary daily
workflow.

## Phase 0 - Unified Status Surface

- [x] Add a bottom coach-facing Workspace Sync dock with spinner, status text,
  and saved/error states.
- [x] Route existing local dirty/saving/saved state into the dock.
- [x] Route existing Cloud autosave pending/running/error state into the dock.
- [x] Route play-image/media queue state into the dock.
- [x] Warn before exit while local, cloud, or media work is pending.

## Phase 1 - Save/Publish Queue

- [x] Create one queue abstraction for local save, cloud push, media upload, and
  player publish metadata.
- [x] Deduplicate repeated writes so rapid edits become one visible save cycle.
- [x] Expose retry for failed cloud/media work from the dock.
- [x] Keep manual Cloud Sync and Sync Diagrams as advanced fallback actions.

## Phase 2 - Coach Media Publish

- [x] Replace "Sync Diagrams" daily workflow with "Publish Media".
- [x] Show active player-visible script media coverage: ready, missing, stale,
  unpublished, and failed.
- [x] Upload only stale/unpublished player-visible diagrams; report clip gaps
  because clips are already cloud-published when attached.
- [x] Show result summary and failed items with exact next steps.

## Phase 3 - Player Diagram Readiness

- [ ] Add a remote diagram manifest/check endpoint so players know published
  status before trying image loads.
- [ ] Replace premature "ask coach to sync diagrams" copy with distinct states:
  checking, unpublished, offline, and load error.
- [ ] Prefer cached local diagram when available, then remote published diagram.
- [ ] Make player diagram empty states quiet and professional.

## Phase 4 - Architecture Cleanup

- [ ] Document the single write tree: local save -> cloud data publish -> media
  publish -> player readiness update.
- [ ] Remove redundant sync toasts once the dock owns the status surface.
- [ ] Consolidate module-specific save indicators onto shared primitives where
  they are still needed.
- [ ] Add smoke contracts for the unified status events and before-exit warning.

## Definition Of Done

- Coaches see one save/publish state regardless of what changed.
- Players stop seeing diagram-missing states caused by timing or stale metadata.
- Manual sync remains available, but normal work feels automatic.
- Exiting during pending save/upload work is guarded.
