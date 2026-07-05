# Player Mobile Experience Audit

Goal: make the player phone/tablet experience fast, clear, fun, and hard to break. This audit focuses on the kid-facing flow: login, home, playbook study, published practice, swipe/presentation, questions/chat, quiz, notifications, and responsive transitions.

## Product Standard

- Player mobile is a consumer study app, not a compressed staff dashboard.
- Every primary action should answer one question: what should I do next?
- Sensitive overlays must use shared layer locking, focus restore, and safe-area padding.
- Player role must stay read-only, but read-only navigation, filters, pagination, chat, and study actions must not be blocked by auth guards.
- Phone portrait, phone landscape, iPad portrait, iPad split-screen, and iPad landscape must all preserve the active page and selected practice/play.

## Current Strengths

- Player role is scoped to Home, Playbook, and Practice.
- Player home has a clear practice-first card, quick actions, ready confirmation, MOTD, notification CTA, and recent scripts.
- Published Practice loads into a player-specific read-only card view.
- Swipe View/presentation has player-safe modes, orientation handling, clean view, Wake Lock, detail panel, zoom/pan, and telestrator support.
- The general mobile viewport harness passes player shell checks across common phone and tablet sizes.

## Findings

### P0 - My Questions Overlay Bypassed Shared Layer Contract

Status: fixed in this slice.

Symptoms/risk:
- The player question overlay manually toggled `hidden`/`aria-hidden`.
- It did not use `openLayer`/`closeLayer`, so body scroll ownership, focus restore, and background touch prevention were not guaranteed.
- This is high risk because players bounce from questions into discussions/presentation and back.

Fix:
- `openPlayerPortal()` now opens via shared blocking layer with `playerPortalBody` as its scroll surface.
- `closePlayerPortal()` now closes via shared layer and restores focus.
- Close button/filter targets meet mobile touch sizing and respect safe-area bottom padding.

### P0 - Player Auth Guard Hid Read-Only Question Pagination

Status: fixed in this slice.

Symptoms/risk:
- `loadMorePlayerPortal` starts with `load`, so the player read-only guard treated it as mutating and hid the button.
- Players could see the first page of questions but not page through their own history.

Fix:
- Added explicit read-only allowlist entries for player portal open/close, filters, retry, load more, and discussion navigation.

### P1 - My Questions Pagination Was Fragile

Status: fixed in this slice.

Symptoms/risk:
- Append rendering depended on a `_lastAppendCount` value that was never written.
- API naming was assumed to be `hasMore` only.

Fix:
- Append rendering now uses the newly fetched page directly.
- Client accepts both `hasMore` and `has_more`.

### P1 - Existing Mobile Harness Does Not Exercise Real Player Content

Status: first focused spec added.

Gap:
- The broad viewport harness validates shell mechanics, role restrictions, scroll ownership, and touch targets, but it does not seed a published practice or open question/chat surfaces.

Fix:
- Added a seeded player mobile Playwright spec covering Home -> My Questions -> Load More -> close/focus restore -> Open Practice.

### P1 - Remaining Surfaces Need Seeded Player Flow Coverage

Next coverage targets:
- Practice -> Swipe View -> discussion drawer -> ask question -> close -> return to same play.
- Practice -> Play Quiz -> reveal/next/close on phone portrait and landscape.
- Playbook -> filter sheet -> current game plan filter -> row media thumbnail/presentation.
- Notification drawer -> push opt-in/offline states.
- iPad portrait and landscape for My Questions, discussion drawer, and presentation detail panel.

## Verification Commands

- `BASE_URL=http://127.0.0.1:4173 npx playwright test --project=chromium-desktop specs/07-player-mobile.spec.js`
- `node scripts/mobile-viewport-check.mjs --roles=player --viewports=320x568,360x640,390x844,393x852,412x915,568x320,844x390,768x1024,820x1180 --warn-only --no-screenshots`

## Next Implementation Slices

1. Seeded discussion drawer flow: open from Practice and Swipe View, ask a question, verify body lock/focus/page return.
2. Player quiz polish: make the quiz feel game-like on phone with progress, big reveal/next targets, and no hidden close controls.
3. Player Playbook study filters: verify Game Plan filter, media thumbnails, row state, and presentation buttons are visible without staff tools.
4. Notifications/offline: make opt-in, denied, offline, and newly published practice states feel clear and non-scary.
5. iPad player pass: treat tablet as a roomy study product, not a stretched phone.
