# BCOffense

BCOffense is a football practice-management PWA for playbooks, practice
scripts, wristbands, call sheets, game plans, scouting, signals, player study,
and quizzes. It is a vanilla HTML/CSS/JavaScript app deployed on Cloudflare
Pages with Pages Functions for authentication and player-facing services.

## Season rollout status

The product is at a usable MVP for a controlled player rollout. The core path
is in place: coaches build and save locally, publish one team workspace and its
player-visible media, then players sign in and receive the latest practice
without touching sync tools.

Before inviting the full roster, complete the release checklist in
`CONSOLIDATED_ROADMAP.md`, especially the small live pilot and the staff-secret
rotation described in `CLOUDFLARE_AUTH.md`.

## Documentation map

- `ARCHITECTURE.md` — current runtime, auth, boot, data, and publish contracts.
- `AGENTS.md` — implementation rules, load order, storage keys, and release
  validation requirements.
- `CONSOLIDATED_ROADMAP.md` — active work only; completed planning tracks are
  intentionally removed.
- `AUDIT_ROADMAP.md` — active security and engineering-debt findings.
- `MOBILE_AUDIT.md` — detailed mobile/iPad regression matrix.
- `CLOUDFLARE_AUTH.md` — required Cloudflare bindings, secrets, and deployment.

## How it runs

`index.html` is the single-page entry point. It loads CSS and JavaScript with
`defer` in a strict order; browser-global functions are therefore part of the
runtime contract.

Data authority is deliberately split:

- `storageManager` stores local app data, drafts, migrations, backups, and
  restore metadata.
- The playbook is IndexedDB-first through `storageManager.getPlaybook()` /
  `setPlaybook()`.
- Diagram blobs use IndexedDB through `window.playImages`; clips use Cloudflare
  R2/KV through `window.playClips`.
- `workspace-sync.js` and `cloud-sync.js` own the visible save/publish queue.

## Development and verification

There is no build step. Use the local server for auth, service-worker, and
Playwright checks.

```sh
node scripts/cleanup-audit.mjs
node scripts/smoke-check.js
npm run test:e2e:local:hydration
npm run test:e2e:local:phone
npm run test:e2e:local:all
```

Deploy through:

```sh
./scripts/deploy-cloudflare.sh
```

## Editing rules

- Use delegated `data-action`, `data-oninput`, and `data-onchange`; no inline
  event handlers.
- Use `STORAGE_KEYS` and `storageManager` for persistence.
- Add new JS/CSS assets to both `index.html` and `sw.js` `LOCAL_ASSETS`.
- Keep asset query strings in `index.html` aligned with `sw.js` `CACHE_NAME`.
- Put routine save, cloud, media, and player-publish status in the workspace
  queue, not success toasts.
- Preserve distinct player states for checking, unpublished, offline, and load
  errors.
