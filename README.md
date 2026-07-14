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

The first quiz/media speed pass now focuses the code around faster launch:

- Cache clip manifests and reuse them across Signal quiz and selector flows.
- Use a bounded quiz media preparation step for first-question diagrams and
  upcoming signal clips.
- Use server-side batch image and clip manifest checks for player readiness and
  quiz launch.
- Measure quiz launch with the existing opt-in perf path:
  set `localStorage.bcoPerf = "1"` or load with `?perf`, then inspect
  `window.perfMonitor.report()` for `quiz:first-question-visible`,
  `quiz:media-prep`, and media batch manifest samples.
- Keep shrinking `js/script-quiz.js` into smaller, testable files while
  preserving delegated public functions.

The current static wiring audit is clean, so the highest value work is not
missing handlers or missing assets. It is making media and quiz preparation more
intentional.
