# BCOffense

BCOffense is a football practice management PWA for playbooks, practice
scripts, wristbands, call sheets, game plans, defensive tendency reports,
signals, player quizzes, and player-facing study tools.

The app is intentionally simple to ship: vanilla HTML, CSS, and JavaScript with
no bundler and no build step. The production app runs on Cloudflare Pages with
Pages Functions for auth, backup sync, images, clips, leaderboard, discussion,
notifications, and related APIs.

## Start Here

- Architecture map: `ARCHITECTURE.md`
- Agent/codebase guide: `AGENTS.md`
- Active roadmap: `CONSOLIDATED_ROADMAP.md`
- Save/publish roadmap: `WORKSPACE_SYNC_ROADMAP.md`
- Player quiz audit: `PLAYER_QUIZ_EXPERIENCE_AUDIT.md`
- Mobile audit matrix: `MOBILE_AUDIT.md`

## How The App Runs

`index.html` is the single-page app entry point. Every tab exists in the DOM,
and scripts are loaded with `defer` in a strict order. JavaScript files share
global scope, so load order and public globals are part of the architecture.

Persistent data is split by authority:

- `storageManager` in `js/storage.js` for local app data, drafts, migrations,
  backup, and restore.
- IndexedDB playbook storage through `storageManager.getPlaybook()` /
  `storageManager.setPlaybook()`.
- IndexedDB diagram blobs through `window.playImages`.
- R2/KV video clips through `window.playClips`.
- Cross-media readiness and cleanup inventory through `js/media-inventory.js`.
- Cloudflare backup publish/update through `js/cloud-sync.js`.

## Development

There is no build command. Open `index.html` directly for static UI inspection,
or run the local test server when exercising service worker, auth-adjacent
flows, or Playwright checks.

Useful commands:

```sh
node scripts/cleanup-audit.mjs
node scripts/smoke-check.js
npm run test:e2e:local:hydration
npm run test:e2e:local:phone
npm run test:e2e:local:all
```

Deployments use:

```sh
scripts/deploy-cloudflare.sh
```

## Editing Rules

- Use `data-action`, `data-oninput`, and `data-onchange`; do not add inline
  `onclick` handlers.
- Use `STORAGE_KEYS` and `storageManager`; do not add undocumented literal
  storage keys.
- Add new JS/CSS assets to both `index.html` and `sw.js` `LOCAL_ASSETS`.
- Keep `index.html` asset query strings and `sw.js` `CACHE_NAME` aligned when
  shipping frontend asset changes.
- Route normal save, cloud, media, and player publish state into
  `workspace-sync.js` instead of adding routine toasts.
- Preserve player-friendly loading states: checking, unpublished, offline, and
  load error should mean different things.

## Current Architecture Priorities

The quiz/media speed and quality passes have landed. The app now launches
faster and the quizzes feel like a study game instead of a metadata test.

Shipped and load-bearing:

- **Smarter quizzes.** Wrong answers are plausible look-alikes: signal questions
  keep distractors in the same component type (a formation question offers other
  formations, including ones with no clip yet), and recognition/rule questions
  pull distractors from the same formation/personnel/type family. See
  `_quizPlayDistractorScore` and `_quizQuestionDistractorItems` in
  `js/script-quiz.js`.
- **Auto-advance + celebration.** A correct answer plays a quick celebration and
  advances automatically; a wrong answer stays put so the player can study the
  miss. Speed signal games keep their own timed advance.
- **Diagram auto-crop.** `getSmartDiagramContentBounds()` in `js/play-images.js`
  segments ink into horizontal bands and trims name/title text at the top and
  bottom, then re-centers the play with padding. Non-destructive; applies
  everywhere smart diagrams render.
- **Faster clip video.** New clip uploads are downscaled to 720p with a bitrate
  cap for fast decode on player phones. The service worker bypasses `/clips/` so
  browser range requests stream natively.
- **Optimize Clips pass.** The `Media Inventory` report has an admin
  **Optimize Clips** button that re-encodes existing playbook + signal clips to
  the new caps in place (`playClips.recompressAllClips`). The Signals page has a
  signals-only version.

Measure quiz launch with the opt-in perf path: set `localStorage.bcoPerf = "1"`
or load with `?perf`, then inspect `window.perfMonitor.report()` for
`quiz:first-question-visible`, `quiz:media-prep`, and media batch manifest
samples.

Highest-value next work:

- Keep shrinking `js/script-quiz.js` into smaller, testable files while
  preserving delegated public functions.
- Share one player-readiness domain summary across publish and quiz launch
  instead of recomputing per surface.
- The Playbook `Media Inventory` report stays the staff-facing starting point
  before deleting local diagram blobs, hunting large media files, or tuning
  player quiz launch performance.
