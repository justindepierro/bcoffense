# BCOffense Workspace Sync Roadmap

Last updated: 2026-07-13

Purpose: make saving, publishing, media upload, cloud sync, and player readiness
feel like one professional system instead of separate utilities.

## Product Goal

The coach should not need to think about local storage, Cloud Sync, diagram sync,
clip uploads, or player publish status as separate systems. The app should show a
single trustworthy workspace state:

- Saving...
- Publishing...
- Saved
- Offline - saved locally
- Sync needs attention

Manual sync actions should become fallback/retry tools, not the primary daily
workflow. Normal completion should not open modal dialogs or bottom loading
toasts.

## Phase 0 - Unified Status Surface

- [x] Add a top coach-facing Workspace Sync chip with spinner, status text,
  and saved/error states.
- [x] Route existing local dirty/saving/saved state into the chip.
- [x] Route existing Cloud autosave pending/running/error state into the chip.
- [x] Route play-image/media queue state into the chip.
- [x] Warn before exit while local, cloud, or media work is pending.
- [x] Replace bottom loading-bar style feedback with compact top `Saving...`,
  `Publishing...`, and `Saved` feedback.

## Phase 1 - Save/Publish Queue

- [x] Create one queue abstraction for local save, cloud push, media upload, and
  player publish metadata.
- [x] Deduplicate repeated writes so rapid edits become one visible save cycle.
- [x] Expose retry for failed cloud/media work from the chip.
- [x] Keep manual Cloud Sync and Sync Diagrams as advanced fallback actions.

## Phase 2 - Coach Media Publish

- [x] Replace "Sync Diagrams" daily workflow with "Publish Media".
- [x] Show active player-visible script media coverage: ready, missing, stale,
  unpublished, and failed.
- [x] Upload only stale/unpublished player-visible diagrams; report clip gaps
  because clips are already cloud-published when attached.
- [x] Show result summary and failed items with exact next steps.

## Phase 3 - Player Diagram Readiness

- [x] Add a remote diagram manifest/check endpoint so players know published
  status before trying image loads.
- [x] Replace premature "ask coach to sync diagrams" copy with distinct states:
  checking, unpublished, offline, and load error.
- [x] Prefer cached local diagram when available, then remote published diagram.
- [x] Make player diagram empty states quiet and professional.

## Phase 4 - Architecture Cleanup

- [x] Document the single write tree: local save -> cloud data publish -> media
  publish -> player readiness update.
- [x] Remove redundant sync toasts once the chip owns the status surface.
- [x] Remove normal success modals from publish, update, and media completion
  flows.
- [x] Consolidate module-specific save indicators onto shared primitives where
  they are still needed.
- [x] Add smoke contracts for the unified status events and before-exit warning.

## Definition Of Done

- Coaches see one save/publish state regardless of what changed.
- Players stop seeing diagram-missing states caused by timing or stale metadata.
- Manual sync remains available, but normal work feels automatic.
- Exiting during pending save/upload work is guarded.

---

# V2 Architecture Reset - Professional Team Workspace

Why this exists: the Phase 0-4 work improved the old system, but it did not
fully change the mental model. Coaches still see too many verbs (`sync`, `push`,
`pull`, `publish`, `refresh`) and too many surfaces (`Team Sync`, `Publish
Media`, `Sync Diagrams`, player refresh, app update status). Players should
never think about syncing. Coaches should not need to decide which low-level
thing to push before practice.

## New Product Contract

There are only three user-facing concepts:

- **Save** - local edits are preserved on the coach device immediately.
- **Publish** - the latest team workspace is made available to players and
  other coach devices.
- **Update** - this device quietly receives the latest published team workspace.

Everything else is implementation detail.

Daily behavior:

- Players never see Cloud Sync, Sync Diagrams, or backup language.
- Player login automatically checks for the latest published workspace, app
  shell, quiz state, media manifests, and notifications.
- If player update fails, the only visible action is `Try Again`, not `Pull from
  Cloudflare`.
- Coaches work normally. The app autosaves locally and auto-publishes eligible
  team data when safe.
- Coaches see one top status: `Saving`, `Publishing`, `Saved`,
  `Offline - saved locally`, or `Needs retry`.
- Manual sync tools move to an admin-only `Recovery Tools` area.

## Current Pain To Remove

- `Push Workspace` and `Pull Workspace` sound like backup tools, not practice
  workflows.
- `Sync Diagrams` still exists as a visible advanced action even though `Publish
  Media` is the preferred workflow.
- Cloud autosave can say `Team cloud synced` while player media or publish
  metadata may still be incomplete.
- Player freshness mixes app-cache updates, cloud data restores, media
  manifests, and notifications in one confusing visible path.
- Coach devices have no simple answer to "what version is live for players?"
- There is no durable activity log answering who published, when, and what
  changed.

## Target Architecture

### 1. One Published Workspace Version

Create a durable published workspace record with a version id, timestamp,
publisher, and domain summary:

- playbook
- scripts
- game plan
- call sheet
- wristbands
- diagrams
- clips
- signals
- quizzes
- notifications/comments

The UI should say `Published 2:14 PM by Coach` instead of exposing backup size
or low-level pull/push timestamps.

### 2. One Publish Pipeline

Replace scattered publish/sync paths with one orchestration path:

1. Save local data.
2. Build team workspace snapshot.
3. Upload changed media/manifests.
4. Write publish metadata/version.
5. Verify player-visible readiness.
6. Update coach status to `Ready for players`.

If any step fails, the dock shows exactly which domain needs retry.

### 3. One Player Bootstrap

Player startup should call one high-level bootstrap/update path that answers:

- latest published workspace version
- whether this device is current
- data payload or no-op
- media manifest freshness
- app shell update availability
- notification/comment freshness

The player app applies it silently after login and again on resume. Manual
refresh is a retry, not a normal workflow.

### 4. Recovery Tools, Not Daily Sync

Move these out of the main coach flow:

- manual Cloud Sync push/pull
- all-local diagram sync
- raw backup restore/export
- force app-cache update diagnostics

Keep them available for admins under `Data Management -> Recovery Tools` with
plain warnings.

## V2 Implementation Phases

### Phase V2.0 - Language And Surface Cleanup

- [x] Rename coach-facing daily verbs:
  - `Team Sync` -> `Publish Status`
  - `Push Workspace` -> `Publish Team Update`
  - `Pull Workspace` -> `Update This Device`
  - `Sync Diagrams` -> `Recovery: Upload All Local Diagrams`
  - First pass updated the main Data Management, Playbook action sheet, command
    palette, Publish Status modal, Dashboard pull summary, workspace dock cloud
    label, and diagram recovery upload copy.
- [x] Hide advanced diagram sync from primary Playbook chrome; keep `Publish
  Media` as the normal action.
- [x] Rewrite player update copy so players only see `Checking for coach
  updates`, `Ready`, or `Try Again`.
- [x] Add a simple coach explanation panel: `Saved on this device`,
  `Published for team`, `Ready for players`.
- [x] Decide login loading direction: use a bounded first-load readiness gate
  with clear step names, not an unbounded longer spinner. Auth, local playbook,
  player update status, dashboard shell, and critical publish metadata should
  settle before reveal; diagrams, clips, and heavy media should lazy-load after
  entry.

### Phase V2.1 - Published Workspace Ledger

- [x] Add a lightweight publish activity log with version, actor, timestamp,
  changed domains, and result.
- [x] Show the latest published version on Dashboard and in Publish Status.
- [x] Record failed publish attempts with the exact failed domain and retry
  action.
- [x] Add smoke coverage for publish status labels and activity-log rendering.

### Phase V2.2 - Unified Publish Orchestrator

- [x] Introduce one `publishTeamWorkspace()` orchestration function.
- [x] Route cloud backup push, player publish metadata, media manifest updates,
  diagrams, clips, signals, quizzes, and notification freshness through that
  orchestrator.
- [x] Make the dock state domain-aware: data, media, quizzes, notifications.
- [x] Stop showing `Team cloud synced` until player-visible readiness checks are
  complete.

### Phase V2.3 - Player Bootstrap Contract

- [x] Add a bounded startup readiness gate with visible statuses for secure
  session, saved data, latest coach update, dashboard shell, and media manifest
  checks.
- [x] Replace player-visible Cloud Sync pull behavior with one player bootstrap
  result object.
- [x] Apply data, media manifest, app-shell, quiz, and notification freshness in
  one quiet startup/update path.
- [x] Make manual player refresh call the same bootstrap path.
- [x] Add diagnostics only for admins; hide technical sync terms from players.

### Phase V2.4 - Recovery Tools Demotion

- [ ] Move raw Cloud Sync modal into admin-only recovery tools.
- [ ] Move all-local diagram sync into recovery tools.
- [ ] Keep export/import backup tools but separate them from publish status.
- [ ] Add warnings that recovery tools are not the normal practice workflow.

### Phase V2.5 - Legacy Cleanup

- [ ] Remove duplicate status toasts that compete with the dock.
- [ ] Collapse overlapping publish status stores into one publish ledger.
- [ ] Audit every user-facing instance of `sync`, `push`, and `pull`.
- [ ] Add regression checks that players do not see Cloudflare/pull/sync copy.

## V2 Definition Of Done

- A player can log in on a fresh device and simply sees the latest coach-published
  practice without choosing a sync action.
- A coach can make edits and see one status that truthfully says whether players
  are ready.
- Admins can still recover data, but recovery tools are clearly separate from
  daily publishing.
- The app can answer: `What is live for players right now? Who published it?
  Did media/quizzes/comments publish too?`
