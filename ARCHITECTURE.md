# BCOffense Architecture

Last updated: 2026-07-14

This document maps the current wiring of BCOffense and records the cleanup work
that would make the app feel faster and more professional. It is intentionally
implementation-facing: use it before large refactors, media changes, quiz work,
or startup changes.

## Runtime Shape

BCOffense is a single-page PWA with no build step. `index.html` loads every CSS
and JS file with `defer`; all JavaScript shares the global scope and execution
order matters. Adding a JS or CSS file means updating both `index.html` and
`sw.js` `LOCAL_ASSETS`.

Primary runtime layers:

- `index.html` owns all tab markup and modal shells.
- `css/*.css` is split by product area plus shared base/layout/components.
- `js/storage.js` owns compressed localStorage, IndexedDB playbook storage,
  migrations, backup, and restore.
- `js/play-images.js` owns local diagram IndexedDB storage, smart diagram
  rendering, and R2-backed player diagram publish/load.
- `js/play-clips.js` owns R2-backed video clips, silent clip upload, manifest
  reads, loop video configuration, and the clip signature index.
- `js/signals.js` owns component-level signal records and resolves signal clips
  from playbook fields.
- `js/script-render.js` owns the current quiz engine, quiz hub, signal games,
  player quiz attempts, and coach quiz setup.
- `js/workspace-sync.js` owns the shared visible save/publish queue.
- `js/cloud-sync.js` owns team workspace publish/update, activity log, recovery
  sync, and player readiness checks.
- Cloudflare Pages Functions under `functions/` provide auth, backup sync,
  images, clips, leaderboard, notifications, and discussion APIs.

## Boot And Startup

Startup is intentionally bounded. `js/app-init.js` restores local data first,
waits for auth readiness, waits briefly for player bootstrap if the user is a
player, then releases the loading screen. Heavy or non-critical work should be
queued through `window.appStartup.queueTask()` after first paint.

Current first-load sequence:

1. Run storage migrations.
2. Hydrate the playbook from `storageManager.getPlaybook()`; IndexedDB is the
   authority, not localStorage.
3. Restore active app surfaces with `restoreStoredPlaybookSession()`.
4. Initialize modules and active tab surfaces.
5. Wait for `whenAuthReady()` with a bounded timeout.
6. For player logins, wait briefly for `waitForPlayerStartupBootstrap()`.
7. Release the startup loader.
8. Run post-startup tasks such as the clip index warmup.

Rule: do not put image bodies, video manifests, large quiz media, or full media
publish checks in the blocking startup path. Gate only the data needed to show a
stable first screen.

## Event And UI Wiring

Interactive markup uses delegated `data-action`, `data-oninput`, and
`data-onchange` handlers. Central dispatch lives in `js/app-events.js`, with
some container-scoped handlers inside feature modules.

Rules:

- Prefer top-level function declarations for delegated actions.
- Add `window.X = ...` only when code must cross lexical scope, support browser
  diagnostics, or be runtime-patched.
- If a new direct `window.X =` export is intentional, update `AGENTS.md`'s
  export manifest.
- Keep routine save, cloud, media, and player publish state in the workspace
  sync dock, not in ad hoc toasts.

## Data Authority

Use `STORAGE_KEYS` and `storageManager` for persistent records. Literal
localStorage keys should be treated as a bug unless they are a documented
compatibility fallback.

Important authorities:

- Playbook data: IndexedDB through `storageManager.getPlaybook()` /
  `storageManager.setPlaybook()`.
- Module settings and drafts: compressed localStorage through `storageManager`.
- Play diagrams: `bcoffense-images` IndexedDB via `window.playImages`.
- Video clips: Cloudflare R2 plus KV manifests via `window.playClips`.
- Signals: local `STORAGE_KEYS.SIGNALS` records, with clip bytes stored through
  the same remote clip API.
- Player quiz history/rewards/stickers: local storage with leaderboard sync via
  `js/player-quiz-sync.js`.

## Save, Publish, And Player Readiness

The current product contract is one write tree:

1. Save local edits.
2. Publish the team workspace backup.
3. Publish changed player-visible media.
4. Record publish activity and readiness.
5. Let players update quietly on login/resume.

Daily coach-facing language should stay at:

- Save
- Publish
- Update

Lower-level terms such as Cloud Sync, push, pull, diagram sync, and raw backup
restore belong in admin recovery surfaces.

Main owners:

- `js/workspace-sync.js`: shared visible queue and retry surface.
- `js/cloud-sync.js`: publish/update orchestration and activity log.
- `js/script-player.js`: player-visible script publishing and publish status.
- `js/play-images.js`: diagram readiness reports and media publish.
- `js/play-clips.js`: clip upload and clip manifest/index state.
- `js/signals.js`: signal clip upload and signal publish metadata.

## Media Architecture

### Diagrams

Local diagram path:

1. Image file is compressed in `playImages.compress()`.
2. Blob is stored in IndexedDB under compatible play signatures.
3. Render paths use object URLs from `playImages.urlForPlay()` /
   `playImages.urlForDisplayPlay()` when already cached.
4. Async paths call `ensureUrlForPlay()` or `ensureDisplayUrlForPlay()`.
5. Smart crop/canvas hydration is provided by
   `playImages.hydrateSmartDiagramImages()`.

Remote player path:

1. Published diagrams are uploaded to R2 through `PUT /images/file?sig=...`.
2. Players check `GET /images/manifest?sig=...` before fetching the body.
3. Players fetch `GET /images/file?sig=...`; successful blobs are cached back
   into IndexedDB for later local use.
4. Missing states should distinguish checking, unpublished, offline, and load
   error.

Performance note: quiz diagram rendering is currently synchronous. If the
object URL is not already in the local URL cache, a diagram question may fall
back to non-diagram behavior until another path hydrates it.

### Clips

Clips are remote-first. `js/play-clips.js` stores clip metadata in KV manifests
and streams bytes from R2 through `/clips/file`. The service worker intentionally
bypasses `/clips/` so browser video range requests can work without Cache API
206-response problems.

Current fast paths:

- `/clips/sigs` warms a session-level signature index after startup.
- `playClips.hasForPlay()` lets cards show clip availability without per-row
  manifest requests after the index is loaded.
- `playClips.listForSig()` uses a short-lived manifest cache.
- `playClips.listForSigs()` uses `/clips/batch-manifest` when available, then
  falls back to bounded one-at-a-time manifest reads.
- Loop previews use muted autoplay and `preload="auto"`.
- Signal quiz media preloads a small upcoming window through hidden video
  elements.

Current cost centers:

- Signal selector playback fetches each selected chip manifest on demand.
- Player readiness still needs deeper domain-level versioning so "ready" can be
  tied to one published workspace version instead of several module timestamps.

### Signals

Signals are component-level clips, not play-level clips. A signal record stores
component metadata and a `clipKey` such as `signals/motion/jet`. A play resolves
signals by canonical compare keys across formation, tags, blocking, and motion
fields.

This design avoids duplicating the same motion/tag clip across plays. Preserve
that model: do not attach signal clips directly to every play unless a future
migration explicitly changes the media domain.

## Quiz Architecture

The quiz engine currently lives in `js/script-render.js`. It owns:

- Quiz hub and mode cards.
- Coach quiz setup, source readiness, and source preview.
- Quiz settings, source availability, attempts, rewards, and weak areas.
- Question generation and answer feedback.
- Signal Sprint, 6 Seconds of Battle, Heat Check, and Full Play Call.
- Diagram prompt rendering and signal video prompt rendering.

Core flow:

1. Player chooses a source or starts from a published script.
2. Source items become `_quizPlays`.
3. `_buildQuizQuestion()` chooses the fairest available question type.
4. `_getQuizQuestionAndChoices()` builds choices and caches by question key.
5. `renderScriptQuizPlay()` renders prompt, choices, diagrams, signal videos,
   feedback, and preload work.
6. Attempts save locally and queue leaderboard sync.

Quiz media behavior:

- Diagram questions call `_quizDiagramUrl()` and render a smart-diagram image.
- Signal questions carry a ready clip URL on the item/record.
- Signal quizzes call `_preloadUpcomingQuizSignalMedia()` on each render.
- Correct signal answers can auto-advance in speed modes; wrong answers show
  brief feedback first.

## Cleanup And Performance Findings

Baseline audit:

- `node scripts/cleanup-audit.mjs` currently passes:
  no missing `data-action` handlers, no missing declarative input handlers, no
  unloaded JS, no unlinked CSS, no missing index assets, and no service-worker
  cache omissions.

Highest-impact cleanup work:

1. Split quiz engine internals out of `js/script-render.js`.
   Keep the public delegated functions stable, but move pure quiz scoring,
   question generation, source selection, signal games, and render helpers into
   smaller files loaded before `script-render.js` or immediately after it.

2. Extend the quiz media preparation step.
   Before a quiz starts, build a small media plan for the selected source:
   local diagram keys, remote diagram manifest keys, signal clip keys, and the
   first N clip URLs. The first bounded warmup exists; keep expanding it only
   where it measurably reduces player-visible wait.

3. Add a diagram URL cache warmup by quiz source.
   For diagram-heavy modes, call `playImages.ensureDisplayUrlForPlay()` for the
   first few quiz items before showing question one. Keep this bounded and skip
   on data-saver connections.

4. Move media readiness to domain summaries.
   Player publish readiness should answer "script data, diagrams, clips,
   signals, quizzes" from one summary object instead of recomputing each surface
   independently.

5. Keep service-worker strategy explicit.
   Clips should continue to bypass the worker. Images can stay cacheable through
   HTTP cache and IndexedDB, but any SW changes must preserve private/auth-only
   media behavior.

First implementation slice, landed 2026-07-14:

1. Added `playClips.getManifestCache()` / cached `listForSig()` with a short TTL.
2. Added `playClips.listForSigs(sigs)` as a client helper, even before adding a
   server batch endpoint.
3. Used that helper in `getSignalQuizItems()` and Full Play Call item building.
4. Added a bounded `prepareQuizMedia(items, mode)` helper for first-question
   diagrams and signal videos.
5. Added `/clips/batch-manifest` and `/images/batch-manifest` server endpoints.
6. Used the batch endpoints from quiz launch and player media readiness checks.

Second implementation slice, landed 2026-07-14:

1. Added opt-in quiz launch timing through the existing `bcoPerf` / `?perf`
   instrumentation path.
2. Recorded first-question timing with `quiz:first-question-visible`.
3. Recorded media warmup timing with `quiz:media-prep`,
   `quiz:diagram-readiness`, `quiz:video-preload`, and
   `quiz:clip-manifest`.
4. Recorded reusable batch endpoint timing with `media:image-batch-manifest`
   and `media:clip-batch-manifest`.
5. Kept timing out of user-facing UI; inspect with
   `window.perfMonitor.report()` and `window.appDiagnostics.report()` when
   `localStorage.bcoPerf = "1"` or `?perf` is enabled.

Next implementation slice:

1. Add a focused Playwright check that Signal Sprint question one and question
   two render without a visible loading pause on mobile.
2. Split quiz internals out of `js/script-render.js` once the media path stays
   stable.

## Verification Gates

Use these before and after architecture or media changes:

```sh
node scripts/cleanup-audit.mjs
node scripts/smoke-check.js
npm run test:e2e:local:hydration
npm run test:e2e:local:phone
```

For narrow media/quiz work, also run:

```sh
npm --prefix tests exec -- playwright test specs/07-player-mobile.spec.js
```

If repo-wide smoke or Playwright is already red for unrelated reasons, record
the exact failing check and keep the status scoped.
