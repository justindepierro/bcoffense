# BCOffense Architecture

Last updated: 2026-07-15

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
- `js/media-inventory.js` owns the cross-media inventory report for diagram
  storage, remote clips, signals, player-visible scripts, and quiz readiness.
- `js/signals.js` owns component-level signal records and resolves signal clips
  from playbook fields.
- `js/script-render.js` owns Practice Script rendering surfaces.
- `js/script-quiz-state.js` owns the Quiz runtime state and immutable
  configuration, loaded immediately before the Quiz runtime.
- `js/script-quiz.js` owns the quiz engine, quiz hub, signal games, and coach
  setup UI. `js/script-quiz-progress.js` owns player/coach attempt summaries
  and weak-area aggregation; `js/script-quiz-leaderboard.js` owns reusable
  leaderboard-list presentation. Preserve this load order and delegated public
  actions when splitting further.
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

## Authentication Contract

Cloudflare middleware protects the deployed app before the SPA loads. The
server owns authentication; `js/auth.js` only mirrors the confirmed session
into role-aware UI after `/auth/me` resolves. The first screen stays locked
until that bounded check completes, so no role-restricted controls flash before
the user is known.

- Sessions use the browser-enforced `__Host-bc_auth` cookie: secure, HTTP-only,
  same-site, path-rooted, and host-only.
- Player accounts live in D1 and use PBKDF2 password hashes, per-account
  lockout, and server-side session invalidation on password change/reset.
- Invitation and password-reset tokens are hashed at rest and atomically
  consumed once.
- Static staff credentials support PBKDF2 values in their existing Cloudflare
  secret names during the pre-season secret rotation; legacy SHA-256 values are
  a short-term compatibility path, not the desired steady state.
- If `/auth/me` cannot resolve in 3.5 seconds, the app presents sign-in rather
  than releasing an unverified session. Local cached sessions are only reused
  offline or on localhost.

The remaining external decision is availability policy during a D1 outage:
staff can still authenticate with their static credentials, while D1 player
login and D1-backed rate-limit checks depend on the database.

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

## Quality Gate And Safe Refactoring

`npm run test:quality` is the local V1 quality gate: static/contract checks,
function-logic tests, and first-load hydration. GitHub Actions runs the same
gate on pushes and pull requests. The Playwright phone/iPad suites remain the
required focused checks after player-shell or responsive changes.

The app is intentionally global-scope, so global cleanup means making the
contract explicit—not converting it wholesale into modules. Run
`npm run audit:globals` to verify every direct `window.X =` export is declared
in `AGENTS.md` and to identify same-file optional guards worth reviewing in the
next small ownership slice.

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
- `js/media-inventory.js`: coach-facing media inventory and cleanup candidate
  report.
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
   `playImages.hydrateSmartDiagramImages()`. `getSmartDiagramContentBounds()`
   segments ink into horizontal bands and trims name/title text at the extreme
   top and bottom (short, low-ink, gap-separated bands only), then re-centers
   the play from the retained rows with padding. It never trims interior
   content, so deep safeties and wide splits are preserved.

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
- New clip uploads are downscaled to a 720p long edge with a bitrate cap in
  `createSilentVideoFile()`, so player phones decode small clips instead of full
  1080p source. Existing clips can be shrunk in place with the admin
  **Optimize Clips** pass (`playClips.recompressAllClips`), reachable from the
  Media Inventory report (all clips) and the Signals page (signals only).

Current cost centers:

- Signal selector playback fetches each selected chip manifest on demand.
- Player readiness still needs deeper domain-level versioning so "ready" can be
  tied to one published workspace version instead of several module timestamps.

### Inventory

`js/media-inventory.js` provides the coach-facing `Media Inventory` report from
the Playbook analytics and data tools. It intentionally reads existing media
authorities instead of creating a new source of truth:

- Local diagram keys and blob sizes from `playImages.loadKeys()` /
  `playImages.get()`.
- Player-visible script readiness from
  `playImages.buildPlayerMediaPublishReport()`.
- Remote play and signal clip manifests from `playClips.listForSigs()`.
- Signal records from `STORAGE_KEYS.SIGNALS`.

Use this report before deleting local media or tuning quiz load performance. It
surfaces largest blobs, unreferenced local diagram keys, player-visible diagram
or clip gaps, signal clip gaps, and quiz source readiness in one place.

### Signals

Signals are component-level clips, not play-level clips. A signal record stores
component metadata and a `clipKey` such as `signals/motion/jet`. A play resolves
signals by canonical compare keys across formation, tags, blocking, and motion
fields.

This design avoids duplicating the same motion/tag clip across plays. Preserve
that model: do not attach signal clips directly to every play unless a future
migration explicitly changes the media domain.

## Quiz Architecture

The quiz engine lives in `js/script-quiz.js`, with diagram warmup and
signal-video preparation isolated in `js/script-quiz-media.js`. Its progress
data layer loads immediately afterward in `js/script-quiz-progress.js`.
Together they own:

- Quiz hub and mode cards.
- Coach quiz setup, source readiness, and source preview.
- Quiz settings and source availability; progress owns attempts, rewards,
  leaderboard summaries, and weak areas.
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
- A correct answer auto-advances after a short celebration in every non-timed
  quiz (`_maybeAutoAdvanceQuizAfterAnswer`); a wrong answer stays so the player
  can study the miss. Speed signal games keep their own timed advance.

Quiz question quality:

- Distractors are believable look-alikes, not random plays. Signal questions
  keep wrong answers in the same signal component type (a formation question
  offers other formations, pulled from the full signal library including values
  with no clip yet). Recognition/rule questions rank distractors by
  `_quizPlayDistractorScore` (shared formation/personnel/type/base play), then
  shuffle within a small plausibility window so repeats still vary.
- `_quizQuestionQuality()` still downgrades a question to a study card when it
  cannot find enough clean distractors.

## Cleanup And Performance Findings

Baseline audit:

- `node scripts/cleanup-audit.mjs` currently passes:
  no missing `data-action` handlers, no missing declarative input handlers, no
  unloaded JS, no unlinked CSS, no missing index assets, and no service-worker
  cache omissions.

Highest-impact cleanup work:

1. Continue shrinking `js/script-quiz.js` behind the same public delegated
   functions. Pure quiz scoring, question generation, source selection, signal
   games, and render helpers can move into smaller follow-up files once the
   first split stays stable.

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
   independently. The first staff-facing summary now exists as Media Inventory;
   the next step is sharing that summary with publish and quiz launch flows.

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

Second implementation slice, landed 2026-07-14:

1. Added `/clips/batch-manifest` and `/images/batch-manifest` server endpoints.
2. Used the batch endpoints from quiz launch and player media readiness checks.
3. Added opt-in quiz launch timing through the existing `bcoPerf` / `?perf`
   instrumentation path.
4. Recorded first-question timing with `quiz:first-question-visible`.
5. Recorded media warmup timing with `quiz:media-prep`,
   `quiz:diagram-readiness`, `quiz:video-preload`, and
   `quiz:clip-manifest`.
6. Recorded reusable batch endpoint timing with `media:image-batch-manifest`
   and `media:clip-batch-manifest`.
7. Kept timing out of user-facing UI; inspect with
   `window.perfMonitor.report()` and `window.appDiagnostics.report()` when
   `localStorage.bcoPerf = "1"` or `?perf` is enabled.

Third implementation slice, landed 2026-07-14:

1. Added `js/media-inventory.js` for a cross-media inventory/report modal.
2. Wired Media Inventory into Playbook analytics and data actions.
3. Counted local diagram storage, largest files, unreferenced diagram keys,
   player-visible script media gaps, signal clip gaps, and quiz source readiness.
4. Added smoke contracts for the new report and asset wiring.

Fourth implementation slice, landed 2026-07-14 (quiz quality + media speed):

1. Made signal-quiz distractors same-component-type and sourced them from the
   full signal library, including values without clips.
2. Ranked recognition/rule distractors by play similarity
   (`_quizPlayDistractorScore`) and shuffled within a plausibility window.
3. Added correct-answer auto-advance with a celebration to standard quizzes
   (`_maybeAutoAdvanceQuizAfterAnswer`), keeping wrong answers for study.
4. Extended `getSmartDiagramContentBounds()` to trim name/title text bands and
   re-center the play from retained rows.
5. Capped new clip uploads to a 720p long edge with a bitrate ceiling in
   `createSilentVideoFile()`.
6. Added `playClips.recompressClipForSig()` / `recompressAllClips()` and the
   admin **Optimize Clips** pass (Media Inventory + Signals), with safe
   delete-then-upload and rollback for play clips.

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
