# BCOffense Active Roadmap

Last updated: 2026-07-15

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

### Player reliability

- [ ] Make the mobile viewport harness a required release check, or document
  the exact manual replacement for soft keyboard, 200% text zoom, safe areas,
  full-screen drawers, and landscape presentation controls.
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
- Run the phone/iPad matrix after mobile shell or player-flow changes.
- Keep `index.html` asset versions and `sw.js` `CACHE_NAME` aligned for every
  shipped frontend change.
- Deploy only through `./scripts/deploy-cloudflare.sh` and verify production
  points at the intended commit.
