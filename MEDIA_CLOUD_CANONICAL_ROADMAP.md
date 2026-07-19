# Cloud-Canonical Media Roadmap

## Product contract — locked

Diagrams and videos are team assets, not browser assets. When a coach adds,
replaces, or deletes approved media, the change is saved to the team media
library immediately and becomes available to every authorized coach and player
without a separate publish-media action.

`Publish Media` is therefore not a daily workflow. The normal experience is:

```text
Coach chooses a diagram or video
        ↓
App prepares the file and saves a durable local retry record
        ↓
App uploads the asset and its metadata to Cloudflare
        ↓
Cloud manifest points the permanent play media ID to the new version
        ↓
Coaches and players fetch that version; IndexedDB keeps an offline cache
```

If the device is offline, the coach sees a clear `Saving when online` state.
The app retries automatically. A player never has to ask a coach to manually
publish media after the upload has succeeded.

## Non-negotiable rules

- [ ] Cloudflare R2 is the canonical binary store for all player-safe diagrams
  and videos.
- [ ] A permanent media ID, assigned once per play, is the only cloud lookup
  key. Play names, script-row IDs, and content-derived signatures are never
  canonical cloud keys.
- [ ] IndexedDB is an offline cache and retry staging area only. Losing a
  browser cache cannot make a successfully saved team asset disappear.
- [ ] A media replacement is atomic from the user's point of view: the old
  approved version remains available until the new version is uploaded and its
  manifest update succeeds.
- [ ] Every upload records content type, byte size, checksum, version,
  uploader, and timestamps.
- [ ] Player-visible scripts resolve media directly from the cloud manifest;
  they do not depend on the coach device that first uploaded the file.
- [ ] Routine media success is quiet and visible in the shared status dock;
  errors and prolonged offline work receive actionable attention.
- [ ] Manual recovery stays available only as an admin tool. It is never the
  normal route for making newly attached media visible.

## Target model

### Canonical IDs

Each play receives a stable, immutable `mediaId`, for example
`play:<uuid>`. It is created when the play is imported or created and travels
with playbook, script, game-plan, wristband, and player-publish data. Existing
source play IDs are preserved as compatibility aliases during migration, but
new code only writes the canonical ID.

### Cloud records

R2 stores immutable versions rather than one mutable anonymous object:

```text
media/plays/<mediaId>/diagram/<version>
media/plays/<mediaId>/video/<version>
```

The server-side manifest for each `mediaId` stores the current approved
diagram and video version plus metadata. A client reads the manifest first,
then loads that exact object. Versioned object paths prevent stale caches from
showing an old diagram after a coach replaces it.

### Local cache and queue

The browser stores:

- downloaded cloud objects for offline use, keyed by `mediaId + version`;
- a durable upload intent before any file upload begins;
- enough upload metadata to retry safely after reload, reconnect, or a
  temporary server failure.

The browser does **not** decide whether a team asset exists. The manifest does.

## Delivery plan

### Phase 0 — inventory and recovery baseline

- [x] Add a read-only, staff-only R2 inventory endpoint/report that paginates
  `images/` and future `media/` objects, counts canonical and legacy keys, and
  never exposes object data to players.
- [x] Compare R2 inventory with every player-visible play's expected media ID.
- [x] Produce a migration report with: canonical media found, legacy media
  found, local-only media found, and genuinely missing assets.
- [x] Preserve all current legacy lookup paths as read-only fallbacks while
  the migration is in progress.
- [x] Expand the staff-only inventory to include every Cloudflare play-video
  and signal-video manifest plus unlinked R2 video objects; recovery reports
  never delete media.
- [ ] Recover any diagrams that exist only in an old browser backup or device
  before declaring an asset permanently missing.

**Exit criterion:** we know exactly which diagrams exist in R2, which only
exist locally, and which have no recoverable file.

### Phase 1 — stable media identity

- [x] Add `mediaId` to the canonical play model and generate it for imports,
  manual play creation, and restored records.
- [x] Backfill every existing play deterministically, preserving a migration
  alias map for old source IDs and legacy diagram signatures.
- [x] Include `mediaId` in every play-copy path: script, game plan, call
  sheet, wristband, player snapshot, export, and cloud backup.
- [ ] Add smoke checks that reject new player-visible plays without a
  `mediaId`.

**Exit criterion:** the same play has the same `mediaId` everywhere it is
used, regardless of renames, edits, or copied script rows.

### Phase 2 — server manifest and versioned R2 storage

- [x] Add authenticated media-manifest routes for read, create/replace,
  metadata-only status, and staff deletion.
- [x] Store a manifest record with current versions, checksum, content type,
  size, upload time, uploader, and optional source-file label.
- [x] Write binaries under versioned R2 paths and update the manifest only
  after the object write verifies successfully.
- [x] Apply authorization server-side: players can read player-safe approved
  media; coaches/admins can write; admin recovery can inspect or migrate.
- [x] Return cache-safe version headers/ETags so a replacement propagates
  predictably without a hard refresh.

**Exit criterion:** an R2 object and its manifest cannot disagree in a way
that leaves a player without the last known-good media.

### Phase 3 — automatic upload and retry

- [ ] Change the diagram/video attach flow to create a local upload intent,
  optimistically show `Saving…`, and start upload immediately.
- [x] Diagram attach flow now saves locally first and uploads automatically.
- [x] Video clips retain a prepared local copy and retry automatically after reconnect.
- [x] On success, update local cache from the returned canonical manifest and
  clear the queue item.
- [x] On offline/network failure, retain the compressed file and queue item,
  show `Saving when online`, and retry on reconnect, app launch, and bounded
  backoff intervals.
- [x] Detect duplicate retries by checksum/idempotency key so reconnects never
  create duplicate versions.
- [x] Surface only meaningful failures in the workspace sync dock: auth,
  invalid file, quota, retry exhausted, or server rejection.
- [x] Remove the normal `Publish Media` button and replace it with a compact
  media status indicator plus a staff-only recovery/diagnostics entry point.

**Exit criterion:** a coach uploads a file once; the asset reaches Cloudflare
automatically or remains visibly queued until it does.

### Phase 4 — cloud-first coach and player loading

- [x] Resolve diagrams by `mediaId` and cloud manifest first whenever online,
  with legacy reads retained during migration.
- [x] Use IndexedDB as the offline fallback cache after a cloud read succeeds;
  a live cloud manifest wins over an older local diagram.
  media for offline presentation.
- [ ] Keep the old version on screen while a newer version downloads, then
  swap only after the new object is ready.
- [ ] Give every loading state a precise meaning: checking, downloading,
  cached offline, saving when online, unavailable, and load error.
- [x] Prefetch the current practice's manifest and diagrams after a player
  opens it, with bounded concurrency and no full-library download.
- [ ] Add explicit cache-management controls that clear only local copies, not
  team assets.

**Exit criterion:** a fresh player device can load the current diagram/video
from Cloudflare without ever having opened the coach workspace.

### Phase 5 — migration and retirement

- [x] Use the Phase 0 inventory to copy recoverable legacy R2 diagram objects
  to their canonical `mediaId` paths and write manifests. Completed July 18,
  2026: migrated 25 verified diagrams; the 194 legacy objects remain intact
  as read-only recovery copies.
- [ ] Reconcile every legacy-migrated diagram before legacy retirement:
  compare its canonical checksum with the one uniquely attributable stable/tag
  legacy key, repair only verified mismatches, and retain all old versions for
  audit. The July 18, 2026 batch of 97 broad "exact" promotions is now
  provisional after a Smaug→Halo mismatch was found and repaired.
- [x] Restrict all new legacy recovery and player fallback reads to permanent
  media IDs, stable source IDs, and unique tag identities. Content-derived
  signature keys are no longer eligible to choose a player diagram.
- [x] Make player diagram loading canonical-only: the player reads one
  `mediaId` manifest and may use only an offline cache stored under that same
  media ID. It never probes legacy R2 keys.
- [x] Add an admin-only checksum reconciliation and guarded repair API. A
  repair requires the audited current checksum and archived checksum to still
  match at write time, then creates a new immutable version rather than
  overwriting history.
- [x] Reconcile the first player-visible batch (July 19, 2026): 29 uniquely
  attributable plays audited; 6 verified, 5 checksum-proven mismatches
  repaired into new immutable versions, 4 diagrams missing a canonical
  record, and 14 retained as unverified because no unique archived tag file
  exists. No ambiguous item was auto-repaired.
- [ ] Offer an admin-only local-cache migration that uploads known legacy
  browser diagrams into their canonical records automatically.
- [ ] Verify each migrated media ID from a clean player session and a second
  coach session.
- [ ] Retain legacy reads for one release window with telemetry/counts.
- [ ] Remove legacy write paths only after the inventory reports zero
  unresolved recoverable assets.
- [ ] Keep legacy objects until a documented retention window passes; delete
  them only with an explicit, reviewed cleanup operation.

**Exit criterion:** no active surface writes or depends on legacy signatures.

## User experience specification

| Situation | Coach sees | Player sees |
| --- | --- | --- |
| New file selected online | `Saving diagram…` then `Saved` | New media when its manifest updates |
| New file selected offline | `Saving when online` in status dock | Last approved version, or `Not available yet` if none exists |
| File replaced | `Updating diagram…` then `Saved` | Previous version until new version is ready, then updated media |
| Upload repeatedly fails | Actionable error with retry; file remains safely queued | Last approved version remains available |
| Fresh device | `Downloading` once, then cached | `Downloading` once, then cached |
| No media has ever been attached | `No diagram attached` | `Diagram not provided` |

There is deliberately no `Publish` state for ordinary media. Saving the media
is publishing the media.

## Verification and release gates

- [ ] Unit/smoke contract: every player-visible play resolves a valid
  `mediaId`; no new write uses a legacy key.
- [ ] Upload test: attach a diagram on one coach device and load it from a
  clean player session without pressing any publication control.
- [ ] Replacement test: replace the same diagram and verify the new version
  reaches a second device while the old one remains available during transfer.
- [ ] Offline test: add a diagram offline, reload, reconnect, and verify one
  successful cloud version without duplicate upload.
- [ ] Video test: repeat the same attach/replace/offline scenarios for clips.
- [ ] Authorization test: players cannot write, coaches cannot perform admin
  cleanup, and no inventory/object listing is exposed to players.
- [ ] Migration test: legacy R2 and IndexedDB examples resolve to the correct
  canonical media ID with no cross-play diagram reuse; checksum reconciliation
  must pass for every legacy-migrated player-visible diagram.
- [ ] Responsive test: media status is understandable on coach desktop,
  tablet, phone, and player portal widths.
- [ ] Backup/restore test: restoring a workspace restores media metadata and
  rehydrates cloud media; it does not become the authority for binary files.

## Definition of done

- A coach can add or replace a diagram/video once and see a durable saved
  state without clicking a publish button.
- Every authorized player receives that media from Cloudflare on a fresh
  device.
- Offline work survives reload and completes automatically after reconnect.
- A browser cache loss cannot remove a successfully saved team asset.
- The media report is a diagnostic health view, not a required operational
  step.
- Recovery tools are rare, staff-only, and never required for routine work.
