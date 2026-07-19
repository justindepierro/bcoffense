# Cloud-Canonical Media Roadmap

## Status and evidence rules

This roadmap distinguishes the implementation checkout from the live Cloudflare
account.

- [x] means the code or migration file exists in this checkout and is ready for
  code-level verification. It does not mean that Cloudflare has been migrated
  or that a production device has exercised it.
- [ ] means implementation, data reconciliation, migration, deployment, or
  production verification is still required.
- Nothing in this document records a migration, deployment, upload, or repair
  in the live Cloudflare account.

On July 19, 2026, migrations 0011–0017 were applied to production after a
local SQL export and a one-team verification. The D1 preflight now passes.
Pages code has not yet been deployed at this point in the release record.

## Product contract — locked

Diagrams and videos are team assets, not browser assets. The intended daily
experience is:

~~~text
Coach selects or replaces approved media
        ↓
Browser keeps a local retry record and begins the cloud save
        ↓
Cloudflare stores an immutable binary version and advances the team pointer
        ↓
Authorized devices resolve the exact current version and cache it offline
~~~

There is no normal Publish Media step. A successful media save is the
publication event. Recovery, migration, and bulk repair remain explicit
admin-only operations.

The final contract is:

- R2 owns immutable diagram and video bytes.
- Every play has a stable media ID; names, script row IDs, tags, and content
  signatures are never canonical diagram identities.
- D1 owns team-scoped current pointers, revisions, and audit metadata.
- IndexedDB is a device cache and durable outbox, not a team source of truth.
- Players receive only a narrow, team-scoped player release; they never
  download or restore a coach workspace backup.
- Every media request is authorized by session role, resolved team, and—for a
  player—the current released media allow-list.
- An old approved version stays recoverable until a newer version is committed
  and verified.

## Verified production starting point

The following are read-only findings from the July 18, 2026 Cloudflare audit.
They describe the remote account, not the un-deployed code below.

| Area | Verified fact | Consequence |
| --- | --- | --- |
| Teams and accounts | D1 has one team and 17 user rows. Migration 0011 assigned all 17 users to the verified primary team. | Team-scoped routes now have an explicit membership basis. |
| D1 migrations | The remote ledger records 0011–0017 and the release preflight passes. | Pages deployment may proceed from this reviewed checkout. |
| Legacy diagram metadata | The old media_manifests table has 122 rows with blank checksums and legacy media/plays/... keys. | Those rows are recovery evidence, not proof of a correct canonical mapping. |
| New diagram table | team_media_manifests does not exist in production before migration 0012. | New team-scoped diagram routes cannot run safely against the current remote schema. |
| Referential integrity | PRAGMA foreign_key_check was clean. | Preserve the database; this is not a corruption-rebuild exercise. |
| Session state | A live users.sessions_invalid_before column was observed outside the tracked migrations. | Migration 0013 uses a separate state table rather than an unsafe ALTER TABLE. |
| KV inventory | A direct Wrangler key listing returned no keys, while an earlier UI inventory reported media/clip records. | Reconcile the binding/environment after deployment; do not treat either count as canonical evidence. |

Earlier browser inventory reports and historic migration counts are useful
leads, but they are not accepted as completed canonical data migration until
every mapping is rechecked against a stable media ID, a checksum, and a clean
player session.

## Containment release implemented in this checkout

| Boundary | Implemented behavior | Important limitation |
| --- | --- | --- |
| Team context | Requests resolve an explicit session team; a single-team bootstrap is defined in migration 0011 rather than selecting an arbitrary team. | Live users still need the migration/backfill. Multi-team onboarding needs explicit assignment tooling. |
| Player data | GET /player/release reads a D1-current immutable R2 release with revision/ETag support. Player startup uses it instead of raw backup restore. | A first canonical head must be bootstrapped from recovery data after migration. |
| Coach workspace | Daily coach saves use immutable R2 workspace/release records and one D1 compare-and-swap head. | Concurrent-device conflicts require an explicit refresh; raw KV remains recovery-only. |
| Raw recovery backup | /sync/backup is admin-only; a recovery write commits the same canonical workspace/release head before retaining a labeled KV snapshot. | The retained KV object is recovery evidence, never player or normal-sync authority. |
| Diagrams | Manifest rows are keyed by team_id, media_id, and kind; bytes use media/teams/<teamId>/plays/<mediaId>/diagram/<version>. The D1 pointer is a compare-and-swap commit point. | Migration 0012 must run and legacy rows need individual reconciliation. |
| Player diagram correctness | Player diagrams are authorized by release media ID, resolve only through the team D1 manifest, and cache in a player-only IndexedDB database. | Must be proven on clean coach and player devices after deployment. |
| Diagram saving | A chosen diagram saves locally first, uploads automatically, sends an expected version/checksum, and keeps an immutable candidate if a replacement conflicts. Delete removes only the pointer. | Diagram retry metadata and the binary are not yet one unified durable outbox record. |
| Legacy diagrams | Player runtime resolution has no legacy diagram fallback. Admin-only audit, migration, and repair routes require a primary-team context and checksum evidence. | Archived legacy objects remain; they are not fully reconciled or retired. |
| Clips | New writes and primary reads use team-namespaced KV keys, and player reads are gated by release allow-lists. | Clip manifests are still KV-authoritative and a primary-team legacy clip fallback remains during transition. |
| Other team boundaries | Discussion attachments, threads, and play likes are team scoped; raw attachment R2 keys are not returned. | Migration 0014 is required before the revised like uniqueness rule is live. |
| Session/cache lifecycle | The service worker bypasses auth, release, image, and clip routes; install no longer forces uncontrolled skipWaiting. Account invalidation uses migration 0013. | Browser/session behavior still needs live validation after migration and deployment. |
| Deployment safety | cloudflare-preflight.sh reads the remote migration ledger and makes the deploy script fail closed. | It intentionally blocks this release until the seven pending migrations are applied. |

## Delivery plan

### Phase 0 — inventory and recovery baseline

- [x] Provide staff-only media inventory/reporting for local diagrams, R2
  diagrams, play clips, signal clips, player script readiness, and cleanup
  candidates.
- [x] Preserve legacy R2 objects and expose read-only, primary-team,
  admin-only diagram recovery/audit routes.
- [x] Add checksum-gated legacy diagram migration and repair routes that write
  a new immutable version rather than overwriting history.
- [ ] Run a fresh, admin-authenticated row-level inventory of the actual R2
  bucket and D1 pointers after migration 0012.
- [ ] Reconcile every historic diagram mapping by permanent media ID, source
  object checksum, and a visual review where necessary. Do not trust broad
  historic exact promotions or count them as migrated.
- [ ] Recover known local-only diagrams from old browsers/backups before
  declaring an asset permanently missing.
- [ ] Reconcile the direct KV inventory with the earlier UI inventory and
  identify the active namespace/environment for each retained clip manifest.

**Exit criterion:** every player-visible diagram is classified as verified
canonical, verified missing, or explicitly retained as unresolved recovery
evidence.

### Phase 0.5 — security and data-plane containment

- [x] Add a server-generated, team-scoped player release and switch player
  refresh/startup away from raw workspace restoration.
- [x] Restrict raw workspace backup reads and writes to admin recovery work.
- [x] Bypass service-worker caching for identity, release, image, and clip
  responses.
- [x] Require resolved team context, role eligibility, and player-release
  allow-list checks on new image and clip routes.
- [x] Remove runtime legacy fallback from player diagram paths; keep diagram
  legacy access in explicit primary-team admin recovery routes only.
- [x] Freeze automatic diagram promotion: migration and repair require a
  permanent media ID plus a supplied verified checksum.
- [x] Stop automatic cloud restore from replacing a nonempty coach device;
  automatic work records remote metadata rather than destructively restoring.
- [ ] Remove the remaining primary-team legacy clip fallback from player
  runtime routes after those clip records are reconciled.
- [x] Apply migrations 0011–0017 after backup and verify the team assignment,
  tables, and foreign keys.
- [ ] Bootstrap a canonical workspace/release head, deploy Pages, and prove
  all authorization paths from clean admin, coach, and player sessions.

**Exit criterion:** a player cannot request a raw workspace, unrelated team
media, an unreleased media ID, or an archived diagram merely by being signed
in.

### Phase 1 — stable media identity

- [x] Generate/preserve mediaId across import, manual creation, restore,
  script copies, exports, player projection, and cloud media helpers.
- [x] Ensure the player release projects a stable media ID for each visible
  non-separator play when a stable source ID exists.
- [x] Use the same media ID as the diagram manifest key, player authorization
  key, local cache key, and versioned R2 path component.
- [ ] Reject or quarantine a new player-visible play that cannot be assigned a
  permanent server-compatible media ID; the compatibility fallback is not a
  full import/write validation gate.
- [ ] Backfill and verify the identity mapping for existing production plays,
  scripts, game plans, wristbands, and legacy diagram keys.

**Exit criterion:** a rename, copied script row, or tag change can never
change which diagram belongs to a play.

### Phase 2 — team-scoped manifest and immutable diagram storage

- [x] Add migration 0012 for team_media_manifests with a composite team/media/
  kind primary key.
- [x] Upload diagram bytes to a new immutable, team-namespaced R2 version and
  only then conditionally advance the D1 pointer.
- [x] Return a 409 conflict rather than silently overwriting another coach's
  newer diagram; retain the losing immutable candidate for recovery.
- [x] Retain old diagram bytes on delete; remove only the current manifest
  pointer until an explicit retention cleanup exists.
- [x] Return media version and ETag metadata on diagram byte responses.
- [ ] Implement safe conditional GET/version cache policy. Responses are
  intentionally private, no-store today, so ETag is diagnostic rather than
  the finished fast-cache contract.
- [ ] Move video/current-clip pointers into D1 and use the same permanent
  media identity and immutable-version model as diagrams.
- [ ] Apply migration 0012 and validate that no legacy row with a blank
  checksum is treated as a trusted canonical pointer.

**Exit criterion:** only a team-scoped D1 pointer can select the diagram shown
to a player, and concurrent writes cannot silently replace it.

### Phase 3 — automatic save, retry, and status

- [x] Save diagram attachments locally and begin automatic Cloudflare upload;
  routine success uses the workspace status surface rather than a publish
  button.
- [x] Send an expected diagram version and checksum/idempotency value; surface
  a meaningful conflict instead of retrying an overwrite forever.
- [x] Isolate coach and player diagram IndexedDB databases so a shared device
  cannot reuse a coach blob for a player release or vice versa.
- [ ] Store each upload intent and its binary blob together in one IndexedDB
  outbox with attempt state, backoff, cancellation, and a server receipt.
- [ ] Make diagram, play-video, signal-video, and workspace jobs report from
  the same durable job model.
- [ ] Make clip/video uploads survive reload and reconnect with their original
  file, checksum/idempotency key, and exactly-once commit semantics.
- [x] Make ordinary team workspace saves produce an immutable workspace and
  player-release revision through one D1 compare-and-swap head.
- [ ] Add explicit terminal states for invalid media, auth failure, quota,
  retry exhaustion, and unresolved conflict.

**Exit criterion:** a coach selects media once; it commits automatically or
remains visibly and durably queued until it can.

### Phase 4 — cloud-first loading and offline behavior

- [x] Have player refresh fetch /player/release with revision/ETag support and
  save player release data under player-specific local keys.
- [x] Resolve player diagrams by release-authorized media ID, then the
  team-scoped manifest; player runtime does not probe legacy diagram keys.
- [x] Keep player and coach diagram caches separate and prefetch bounded
  current-practice diagram work.
- [ ] Verify fresh-device coach and player loading against deployed Cloudflare
  media, including a shared-browser role switch.
- [ ] Keep a verified old version on screen until a newer version is fully
  downloaded, then atomically swap the local cache entry.
- [ ] Finish precise visual states for checking, downloading, cached offline,
  saving when online, unpublished, unavailable, and load error across every
  player surface.
- [ ] Add cache-management controls that delete only a device copy, never a
  team asset or manifest pointer.

**Exit criterion:** a fresh player device can open the current practice and
receive exact diagrams from Cloudflare without ever loading a coach workspace.

### Phase 5 — legacy reconciliation and retirement

- [x] Keep archived diagram inspection, migration, and repair admin-only,
  primary-team-scoped, checksum-gated, and non-destructive in the codebase.
- [ ] Establish the real production list of archived objects and verify each
  candidate against the correct permanent media ID. Historic UI counts and
  prior broad migration results require revalidation.
- [ ] Migrate only checksum-proven mappings into new immutable team paths,
  then verify each from a clean player session and a second coach session.
- [ ] Migrate recoverable local IndexedDB diagrams with an explicit admin
  review flow; never treat a browser cache as proof of team ownership.
- [ ] Retire legacy diagram and clip read paths only after the inventory has
  zero unresolved recoverable items and a documented retention window passes.
- [ ] Delete archived bytes only through an explicit reviewed cleanup plan,
  never as an upload, replace, or pointer-delete side effect.

**Exit criterion:** active player surfaces never depend on legacy signatures
or arbitrary old R2 objects.

### Phase 6 — workspace, backup, and release authority

- [x] Prevent automatic destructive restore of a nonempty coach device.
- [x] Scope the retained recovery workspace key by team for new writes and
  isolate raw access to admin recovery tooling.
- [x] Replace daily mutable KV workspace sync with immutable R2 snapshots,
  D1 workspace revisions, checksums, base-revision compare-and-swap, and
  retained recovery objects.
- [x] Store player releases as D1/R2 revisioned records with the workspace
  commit, rather than KV payloads.
- [x] Filter the normal team workspace through a strict server allowlist;
  exclude auth, drafts, local queues, browser caches, device UI state, and
  per-user private state.
- [ ] Stage and validate a restore, capture a local pre-restore recovery
  snapshot, and provide rollback rather than applying mixed stores in place.
- [ ] Classify every persistence key as team, player-private, user-private, or
  device-private and make only team mutations schedule shared cloud work.

**Exit criterion:** backups are safe admin recovery artifacts—not the normal
sync engine or player data plane.

### Phase 7 — operational maturity and performance

- [x] Add a fail-closed, read-only D1 migration preflight to the deployment
  script.
- [ ] Add post-deploy authorization, media replacement, player release,
  workspace restore, and clean-device smoke tests.
- [ ] Add structured audit events and metrics for D1/R2 operations, release
  freshness, queue age, conflicts, pointer mismatches, and recovery actions.
- [ ] Schedule reconciliation for dangling pointers, orphan immutable bytes,
  checksum mismatches, stale outbox jobs, and release readiness.
- [ ] Define retention/lifecycle policy for object versions and snapshots.
- [ ] Measure route-level D1/R2 latency and implement private,
  version-aware caching only after authorization correctness is proven.

## Required deployment sequence

No deployment is recorded yet. When this release is intentionally promoted,
the safe order is:

1. Back up and inspect production D1. Confirm that the sole existing team is
   the intended primary team and that assigning all 17 unassigned users to it
   is correct.
2. Review and intentionally apply migrations 0011–0017. In particular, 0015
   repairs discussion integrity, 0016 establishes the revision data plane,
   and 0017 removes only unverified diagram pointers (never R2 bytes). Do not
   ask the deploy script to apply them; it never will.
3. Validate the D1 post-migration state: primary-team setting, non-null user
   team assignments, team_media_manifests, account_session_state, and the
   rebuilt team-scoped play_likes uniqueness constraint.
4. Treat copied legacy diagram pointers from migration 0012 as provisional
   recovery records until their checksums and object ownership are reconciled.
5. Deploy through ./scripts/deploy-cloudflare.sh; its preflight must pass.
6. As an admin, bootstrap the first player release from retained recovery data,
   then test it with a fresh player session.
7. Test admin, coach, and player diagram/clip permissions; attach and replace
   a diagram from two coach sessions; verify a player receives only the
   released practice and its authorized media.
8. Run the full recovery inventory before changing or deleting any archived
   object.

## Release gates

- [x] Remote D1 records migrations 0011–0017 as applied and passes foreign-key
  validation.
- [ ] All users have the intended explicit team assignment; no second team can
  inherit the primary team's data by accident.
- [ ] A fresh player receives only the released projection and cannot access
  /sync/backup, unrelated team media, or unreleased media IDs.
- [ ] A clean player and a second coach see the correct diagram after a
  replacement, with a 409 conflict instead of a silent overwrite for a stale
  writer.
- [ ] Legacy media has been checksum-reconciled and no active player surface
  uses a legacy diagram or clip fallback.
- [ ] Offline/reload behavior keeps the original blob and produces exactly one
  committed version after reconnect.
- [ ] Backup/restore is staged, filtered, revisioned, and recoverable.
- [ ] Player release, media authorization, migration, visual responsiveness,
  and post-deploy contract tests all pass.

## Definition of done

The system is complete only when an authorized coach can save media once and
an authorized player can receive the exact approved version on a fresh device;
when cache loss cannot erase team media; when offline work survives reload;
and when no player or second team can observe coach-private workspace data.
