# BCOffense Active Roadmap

Last updated: 2026-08-13

This is the active queue only. Completed planning tracks have been removed;
their durable implementation contracts live in `ARCHITECTURE.md`, `AGENTS.md`,
and the code/tests they produced.

## Season rollout gate

- [ ] Run a 15-minute live pilot with two real player accounts on a phone and
  an iPad: accept invite, sign in, open the assigned practice, view diagrams
  and clips, take a quiz, refresh, sign out, and sign back in.
- [ ] Publish one representative practice and use the coach publish status to
  resolve every missing/stale player-visible diagram or clip before invitations
  go to the full roster.
- [ ] Rotate every staff `AUTH_*_PASSWORD_SHA256` secret to the PBKDF2 format
  documented in `CLOUDFLARE_AUTH.md`; the legacy SHA-256 format remains only as
  a temporary compatibility fallback.
- [ ] Confirm the Cloudflare D1/KV bindings and production email sender are
  available; retry the pilot with a normal cellular connection.
- [ ] Record the pilot’s issues here only if they block the core coach-to-player
  path. Everything else belongs in a later product pass.

## Active product work

### Tablet system

- [~] Ship the named tablet shell, scroll-owner, fixed-control, and test-gate
  foundation tracked in [TABLET_SYSTEM_ROADMAP.md](TABLET_SYSTEM_ROADMAP.md).
  Shell/portrait/stack behavior, player navigation, Playbook drawers, and live
  Call Sheet touch editing, and the first shared blocking-layer tranche
  (Signals selector, Constraints, and Playbook Workflow) are complete.
  Wristband, Call Sheet Index Cards, Game Plan, Signals, and Tendencies now
  have verified landscape tablet workbenches. The active follow-through is
  the remaining legacy layer geometry, target exceptions, and secondary-module
  migration; the first keyboard-safe Playbook/Script/Presentation/Call Sheet/
  Game Plan Index-and-Print layer tranche, the remaining Game Plan dialogs,
  the shared nested Reorder dialog, and the first Playbook analytics-report
  layer family, and the deferred Playbook cleanup/identity report family are
  now verified. The
  P0 Player Wristband Reset and Script Period Manager targets are also verified.
  Script secondary editor controls and live Wristband classic/print-setup
  targets are now verified as well.
  Playbook editor, Data Cleanup, and Category Cleanup controls now have
  screen-only tablet targets, including explicit WebKit-native select sizing.
  Dashboard, Installation, Identity, and
  Offense Builder staff-landscape work are now verified; the remaining queue
  is deferred legacy-layer geometry, P2 inline/print target exceptions,
  uncovered secondary surfaces, and the manual physical-device release check.
  Game Plan's native Coverage and Touch Tracker disclosures are also now
  tablet-size compliant. The required release gate includes both the 24-case
  Chromium matrix and a curated Playwright WebKit iPad-emulation smoke.

### Player reliability

- [x] Player Presentation now keeps an already-downloaded canonical diagram visible when a fresh published-file request fails transiently. It never uses that fallback after authentication denial or an unpublished response; focused local browser coverage reproduces manifest-success/file-503 → rendered diagram.
- [x] Make the mobile viewport harness a required release check. The
  fail-closed Chromium gate covers admin, coach, and player at 744x768,
  744x1024, 768x1024, 820x1180, 834x1112, 1024x768, 1366x768, and 1024x1366
  through PR/main CI and guarded deploy paths. A curated, fail-closed
  Playwright WebKit iPad-emulation smoke now runs alongside it; a manual
  physical Safari/iPad installed-PWA release-candidate check remains required
  before treating that emulation as real-device proof.
- [ ] Complete a unified coach/admin notification inbox for player comments,
  questions, quiz completions, rewards, and moderation work.

### Coaching workflow polish

- [ ] Call Sheet: decide and ship only the print improvements coaches need for
  game week (current page, front/back, combined output, or preview).
- [ ] Script/Game Plan: preserve board/JV context and make Game Plan-sourced
  plays obvious when they enter a practice script.
- [ ] Playbook: add a full/smart-crop control only if real diagrams show labels
  that the automatic crop hides.

### Engineering follow-through

- [ ] Split `js/script-quiz.js` by rendering/runtime responsibility without
  changing its public delegated actions.
- [ ] Treat only measured mobile breakpoint, save, or render regressions as
  refactor triggers; avoid broad cleanup churn during the season.

## Release guardrails

- Run `node scripts/smoke-check.js` before every app release.
- Run the focused local hydration test after boot/auth/storage changes.
- Run `npm run test:quality` after mobile shell, player-flow, layer, or target
  changes; it includes the Chromium tablet matrix, WebKit iPad-emulation smoke,
  and local hydration coverage.
- Perform the documented physical Safari/iPad installed-PWA check before a
  release that changes shell, safe-area, keyboard, or presentation behavior.
- Keep `index.html` asset versions and `sw.js` `CACHE_NAME` aligned for every
  shipped frontend change.
- Deploy only through `./scripts/deploy-cloudflare.sh` and verify production
  points at the intended commit.
