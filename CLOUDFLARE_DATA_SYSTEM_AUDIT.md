# Cloudflare Data, Media, Sync, and Backup Architecture Audit

**Audit date:** July 18, 2026  
**Audit type:** read-only remote inspection plus source-code review  
**Release update (July 19, 2026):** a local SQL export was created, migrations
0011–0017 were applied, the remote ledger/preflight passed, one primary team
was verified, all 17 users were assigned to it, and `foreign_key_check` was
clean. Pages source commit `a1075e2` was deployed, and an authenticated admin
created one current canonical workspace head and one current player-release
head (two immutable revisions of each). Clean-role and legacy-media
reconciliation tests remain separate release work.

## Executive conclusion

The correct direction is clear: player media must be a team-scoped,
release-authorized projection of the coach workspace, not a browser backup
that happens to contain diagrams. The containment layer is now deployed with
the required D1 schema and initial heads; it must still earn production trust
through clean-role tests and checksum-backed legacy-media reconciliation.

The production account now has the canonical workspace/release authority
online. Do not yet describe all historical media as canonical: remaining work
is clean-role validation, checksum-backed diagram reconciliation, clip
migration, durable upload jobs, and operations.

## Evidence boundary and verified remote facts

These facts came from read-only Cloudflare inspection. They describe the live
account at audit time, not the code currently in the working tree.

| Surface | Verified finding | Interpretation |
| --- | --- | --- |
| D1 team data | One team and 17 users were present; migration 0011 assigned all 17 users to the verified primary-team ID. | Scoped data now has explicit membership. |
| D1 migration ledger | Migrations 0011–0017 are applied and deployment preflight passes. | The deployed Pages release is schema-compatible. |
| Legacy diagram metadata | The legacy media_manifests table contains 122 rows with blank checksums and legacy media/plays/... object paths. | They are migration/recovery evidence, not verified current canonical diagram pointers. |
| New manifest table | team_media_manifests exists after migration 0012. | Authoritative as of 2026-08-09: 236 team diagram pointers, sole live source; global media_manifests confirmed unreferenced by live code. See MEDIA_CLOUD_CANONICAL_ROADMAP.md closeout. |
| Referential integrity | PRAGMA foreign_key_check returned clean. | Preserve and migrate the data; do not rebuild or mass-delete it. |
| Session invalidation | A sessions_invalid_before users column existed outside the tracked migration history. | Local migration 0013 creates separate state so it works on both known schema shapes. |
| KV inventory | Direct Wrangler listing returned no keys, while an earlier in-app report showed clip/media records. | The namespace/binding/environment needs explicit reconciliation; neither count should drive cleanup. |
| R2 inventory | Earlier UI reports exposed legacy diagram and clip objects, but no checksum-to-play mapping was established for every object. | Retain every object; do not infer ownership from filename or UI count. |
| Production deployment | Commit `a1075e2` was deployed after migration preflight, then admin republish created current workspace and release heads. | The canonical server authority is live; media and clean-role validation remain. |

## What the containment checkout changes

The following are implemented in the checkout and are pending migration,
deployment, and live verification.

| Concern | New behavior | Why it matters |
| --- | --- | --- |
| Player data plane | GET /player/release returns an explicit allow-list projection from the D1-current immutable R2 release. It uses a revision-derived ETag. | A player no longer needs the raw coach workspace to render a practice. |
| Workspace authority | Staff PUT /workspace/revision validates a strict team-data schema, writes immutable workspace/release objects, then advances one D1 CAS head. | A coach cannot silently overwrite a newer device workspace; player release and workspace stay aligned. |
| Raw workspace recovery | /sync/backup is admin-only. A recovery write commits the same canonical head before retaining its KV recovery snapshot. | A player cannot pull or restore the broad recovery snapshot through the new route. |
| Team scoping | Session team resolution uses an explicit primary-team setting and stored user membership rather than selecting an arbitrary team. | A second team cannot inherit another team's media or release because it happens to be first in D1. |
| Diagram authority | New diagram pointers live in D1 team_media_manifests under team_id, media_id, and kind; bytes use immutable media/teams/<teamId>/plays/<mediaId>/diagram/<version> R2 keys. | A permanent play media ID, not a name or content signature, selects the current diagram. |
| Diagram concurrency | The upload route writes an immutable R2 candidate and conditionally advances the D1 pointer using the observed version. A stale writer receives 409; delete removes only the pointer. | It prevents silent overwrite and preserves a last-known-good byte object for recovery. |
| Player diagram access | A player must be authenticated, assigned to a team, and allowed by the current release before image metadata or bytes are returned. Unreleased IDs return 404. | Authentication alone no longer exposes all diagram media. |
| Player cache isolation | Player diagrams use a player-only IndexedDB database and player release local keys; coach cache data is separate. | It removes the shared-device cache collision that could show Halo for Smaug or leave a player stuck on coach-local state. |
| Diagram publication | A diagram attachment saves locally first and starts cloud upload automatically. The player release authorizes a stable media ID, so a successful pointer update does not need a high-contention release rewrite. | Diagram save, not a manual publish action, becomes the normal media path. |
| Legacy diagrams | Runtime player diagram resolution no longer falls back to images/<legacy key>. Admin-only audit, migration, and repair endpoints require primary-team context and checksum evidence. | An old ambiguous key cannot silently win over a missing manifest. |
| Clip boundary | Clip routes now resolve a team and player-release allow-list; new writes use team-namespaced KV keys and R2 paths. | Cross-team reads/writes are contained while clip migration is incomplete. |
| Other tenant boundaries | Discussion attachments, thread access, and play likes are team scoped; raw attachment R2 keys are not returned. | The containment release protects more than diagrams. |
| Session/cache lifecycle | Service worker routing bypasses auth, player release, image, and clip responses; activation is no longer forcibly mixed into an active app session. | It reduces stale identity and mixed-version behavior. |
| Deployment gate | cloudflare-preflight.sh reads the remote migration ledger and the deploy script fails closed on drift. | Pages code cannot accidentally be deployed against an old schema. |

## Current authority model: audited state versus target

| Domain | Live/audited state | Containment checkout | Final professional target |
| --- | --- | --- | --- |
| Coach workspace | Broad mutable KV backup mixes team, browser, and transient data. | Daily staff writes are strict-schema immutable R2 snapshots with D1 compare-and-swap. | Add staged restore/rollback and operational reconciliation. |
| Player data | Historic player flow could rely on full backup restore. | Team-scoped D1/R2 release revision. | Add safe deltas only after deployed correctness is proven. |
| Diagram pointers | Legacy media_manifests rows have unverified legacy keys. | Team-scoped D1 manifest, immutable R2 version, conditional pointer commit. | Same model after complete checksum reconciliation and retention policy. |
| Diagram cache | Browser-local state could collide between roles/devices. | Coach/player IndexedDB and local release storage are separated. | Versioned cache entries and a unified durable outbox. |
| Play/signal clips | KV manifests and signature-based identities. | Team release gate plus team-prefixed KV/R2 writes. | D1 current pointers, permanent media IDs, immutable versions, R2 lifecycle. |
| Backups/restores | Last-writer-wins KV snapshot and mixed local restore. | Nonempty devices are no longer auto-restored; raw recovery is admin-only. | Staged, filtered, checksum-verified revisioned restore with rollback. |

## Risks remaining after the containment code

### P0 — live verification still required

1. **Clean-role behavior is not yet proven.** Admin, coach, and player sessions
   must verify the deployed routes and authorization boundaries end to end.
2. **Legacy diagram rows are not verified media.** Migration 0012 creates the
   scoped table but deliberately does not promote ambiguous legacy metadata;
   0017 quarantines unsafe existing pointers without deleting R2 evidence.
3. **The first player release must be tested.** Player release GET is
   deliberately read-only; it will not silently publish during a player request.

### P1 — target architecture still outstanding

1. **Clip identity and metadata remain legacy-shaped.** Primary-team legacy
   clip fallback and KV-authoritative manifests must be retired after verified
   migration to permanent media IDs and D1 pointers.
2. **The local outbox is not yet unified.** Diagram retry intent and blob
   storage are not one durable record; videos and workspace work have their own
   partial queues.
3. **Restore remains non-atomic.** Blocking destructive automatic restore is
   containment, not a replacement for staged validation and rollback.
4. **No retention, audit event, or scheduled reconciliation system exists
   yet.** Immutable bytes are retained now, but lifecycle policy and
   observability are still required.

### P2 — performance and usability work still required

1. Diagram responses expose ETag/version metadata but remain private,
   no-store; conditional private caching and cache swaps are not complete.
2. Large uploads are buffered and header MIME validation is not full content
   inspection.
3. No route-level metrics yet prove D1/R2 latency, queue age, conflicts,
   orphan objects, or release freshness.
4. Clean-device, offline/reload, concurrent-coach, and responsive portal tests
   still need to run against a deployed environment.

## Completed migration and deployment gate

The following release procedure was completed on July 19, 2026; remaining
role/media tests are deliberately not implied by these infrastructure checks.

1. [x] Take an approved backup of production D1 and document the intended
   primary-team/user assignment.
2. Review the migrations:
   - 0011_player_release_boundary.sql creates the primary-team setting and
     backfills null user team IDs only when exactly one team exists.
   - 0012_team_media_manifests.sql creates the scoped diagram pointer table
     without promoting ambiguous legacy metadata.
   - 0013_account_session_state.sql creates portable session invalidation state
     without relying on the untracked live column.
   - 0014_team_scoped_play_likes.sql rebuilds the small likes table so its
     uniqueness includes team_id.
   - 0015_discussion_status_and_team_integrity.sql repairs discussion enum and
     team-integrity constraints; 0016_workspace_revision_data_plane.sql adds
     the atomic workspace/release head; 0017 quarantines unverified diagram
     pointers while preserving every R2 object.
3. [x] Intentionally apply the migrations. The deploy script will not do this.
4. [x] Verify D1 migration ledger, team setting, user assignments, tables,
   indexes, and foreign keys.
5. [x] Deploy only through ./scripts/deploy-cloudflare.sh after preflight passes.
6. [x] As an admin, create/rebuild the first player release from retained recovery
   data. Then verify the release with a fresh player session.
7. [ ] Run authorization, diagram replacement/conflict, player isolation, clip,
   attachment, and recovery inventory tests before any legacy cleanup.

## Final architecture to build after containment

The end state separates mutable metadata from immutable objects and device
state:

| Store | Owns | Must not own |
| --- | --- | --- |
| D1 | Team membership, media pointers/versions, workspace and release revisions, job receipts, audit events. | Binary files, browser caches, credentials. |
| R2 | Immutable diagrams/videos and compressed recovery snapshots. | The only mutable current-pointer decision. |
| IndexedDB | Device cache plus a single durable blob-and-intent outbox. | Team-wide authority. |
| KV | Optional derived cache or short-lived compatibility data during migration. | Canonical workspace, clip manifests, or player releases. |

The desired write path is an IndexedDB outbox job with a checksum,
idempotency key, stable media ID, and expected revision; immutable R2 upload;
D1 conditional pointer commit; audit receipt; then local cache/release update.
The desired player path is a scoped release revision followed by exact
team/media/version reads—never a raw workspace pull.

## What must not happen

- Do not bulk-delete R2 objects based on old inventory counts or filenames.
- Do not call historic broad promotions canonical without checksum and media ID
  verification.
- Do not bypass deployment preflight or deploy Pages code before the database
  migration ledger matches the checkout.
- Do not restore a raw workspace automatically onto a nonempty device.
- Do not make a player request trigger an implicit release publication.
- Do not treat a browser cache, a legacy tag, or a content-derived signature as
  evidence that an archived object belongs to a play.
