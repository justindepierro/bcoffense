# BCOffense Architecture & Optimization Roadmap

> Source: comprehensive top-down audit (2026-07-14, SW v1100). Read-only analysis
> across auth/login, CSS/responsive, JS architecture/perf, and the HTML shell.
> Check items off as they ship. Each item is independently shippable.

**Legend:** Severity — 🔴 High · 🟠 Medium · 🟢 Low · ✅ Confirmed good (no action)

---

## Phase 1 — Auth / Login Security

Foundation is sound: HMAC-signed session cookie, global `_middleware.js` gates
every non-static route, server-side role checks per endpoint, no hardcoded
secrets, dev login is localhost-gated. The items below are hardening gaps.

- [x] 🔴 **H1 — Invalidate sessions on password change/reset.** ✅ Done (SW-N/A, server-only). `updateD1Password` now bumps `sessions_invalid_before` (covers both the reset flow and `changeD1Password`); the self-change endpoint re-issues a fresh cookie so the current user stays signed in. — `functions/_lib/d1-auth.js`, `functions/api/account/password.js`
- [ ] 🟠 **M2 — Staff passwords use single-round SHA-256.** ⏸ Needs ops step (rotate `AUTH_*_PASSWORD_SHA256` secrets to a PBKDF2 format, or migrate staff into D1). Deferred pending secret rotation. — `functions/_lib/auth.js` L167-175
- [ ] 🟠 **M3 — Rate limiting + logout-all fail OPEN on D1 outage.** ⏸ Product decision: failing closed blocks staff logins during a D1 outage; the durable fix is a KV/edge counter. Left as-is pending your call. — `functions/auth/login.js` L36-52, `functions/_lib/auth.js` L230-240
- [x] 🟠 **M4 — No CSRF/Origin check; logout is a GET.** ✅ Done. Logout is now POST-only (kills `<img>`-tag force-logout); the middleware rejects any cross-origin state-changing request (defense-in-depth beyond SameSite=Lax). — `functions/auth/logout.js`, `functions/_middleware.js`
- [x] 🟠 **M5 — No Content-Security-Policy header.** ✅ Done. Added a CSP to `SECURITY_HEADERS` (applied globally via the middleware): `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, scoped script/style/font/img/media/connect sources. — `functions/_lib/auth.js`
- [x] 🟠 **M1 — HMAC verify hardening.** ✅ Done. Session verification now uses `crypto.subtle.verify("HMAC", ...)` (constant-time) instead of re-sign-and-string-compare. — `functions/_lib/auth.js`
- [ ] 🟠 **M6 — Leaderboard sync trusts client scores.** `userId` is session-derived (good), but scores/`playerName` are client-authoritative and only max-clamped. Recompute/validate server-side or sign attempt results at issue time. — `functions/api/leaderboard/sync.js`, `functions/_lib/d1-leaderboard.js`
- [ ] 🟢 **L1 — Double session verification per request.** Middleware verifies HMAC, then each handler re-verifies. Attach the verified session to `context.data.session` and have handlers read it. — `functions/_middleware.js`
- [ ] 🟢 **L2 — Cookie not `__Host-` prefixed.** Rename `bc_auth` → `__Host-bc_auth` (keep `Secure`, `Path=/`, omit `Domain`) so the browser enforces the flags. — `functions/_lib/auth.js`
- [ ] 🟢 **L3 — Username enumeration via timing.** Unknown users skip hash work; valid users run PBKDF2. Run a constant dummy PBKDF2 on the unknown-user path. — `functions/_lib/auth.js` L160-182
- [ ] 🟢 **L4 — Token consume is non-atomic SELECT-then-UPDATE.** Use `UPDATE ... WHERE id=? AND used_at IS NULL` and treat `changes === 0` as already-consumed. — `functions/_lib/d1-auth.js` L242-262
- [ ] 🟢 **L5 — Weak password policy** (length 8–128 only). Consider common-password screening. — `functions/_lib/d1-auth.js` L268-273

---

## Phase 2 — CSS Breakpoint Unification (top structural risk)

Two parallel responsive systems disagree on where "mobile" starts: JS classes
(`is-mobile-screen` ≤768, `is-phone-screen` ≤560, `shell-tablet` ≤1024) vs 24
distinct `@media` max-widths (dominant 640×26, 600×14, 820×9). The **641–820px
band** is where they contradict — root cause of iPad / small-laptop layout bugs.

- [ ] 🔴 **Define canonical breakpoint tiers in `base.css`** (e.g. phone ≤560, tablet ≤820/coarse, desktop >820) as documented tokens/comments; collapse the 24 max-widths toward ~4 tiers.
- [ ] 🔴 **Align the JS mobile threshold (768) to the dominant CSS tablet query (820)** so class-driven and query-driven rules can't be in opposite states in 641–820px. — `js/app-shell.js` ~L565
- [ ] 🟠 **Fix off-by-one breakpoint drift** (639/640/641, 600/601, 820/821, 1023/1024, 1199/1200) — collapse each pair to one canonical value.
- [ ] 🟠 **Standardize the coarse-tablet compound query** `(max-width: 640px), (pointer: coarse) and (max-width: 820px)` (copied 5× with drifting widths) into one documented tier.
- [ ] 🟢 **Stop introducing new bare-width `@media` blocks** in module CSS; reference the shared tiers.

---

## Phase 3 — JS Cold-Boot Parse Cost

> **Investigated 2026-07-14 → DEFERRED (poor ROI / high risk).** Mapping the real
> surface showed the presenter's open-entry functions are called synchronously
> from ~9 eager files (many behind `typeof fn === "function"` guards that
> silently no-op if unloaded), `script-quiz.js` has 5 external callers + a
> companion `player-quiz-sync.js`, and `play-discussion.js` has a boot-time
> deep-link `DOMContentLoaded` handler. Correct lazy-loading needs self-replacing
> stubs across those files. Meanwhile V8 lazy-compiles unused function bodies and
> the SW already caches these files, so the true boot saving is small. Not worth
> the live-production regression risk. Revisit only if boot is measured slow.

- [ ] ⏸️ **Lazy-load `script-quiz.js` (7625 lines)** — deferred (see note; 5 external callers + `player-quiz-sync.js`).
- [ ] ⏸️ **Lazy-load `play-presentation.js` (3077)** — deferred (see note; ~9 eager call sites, several guarded).
- [ ] ⏸️ **Lazy-load `play-discussion.js` (3050)** — deferred (see note; boot deep-link handler + delegated listeners).
- [ ] 🟠 **Split `script-quiz.js`** into `-render`/`-runtime` per existing wristband/callsheet conventions (2.5× the next-largest file) — still valid as a maintainability win with no lazy-load risk.

_Lazy-load target abandoned; the V8 lazy-compile + SW cache means the win is small._

---

## Phase 4 — Render Performance

- [x] 🟠 **Build per-render lookup indices to kill nested `plays.find()`/`playsMatch` scans.** ✅ Started. Added `buildPlaysMatchLookup(arr)` to `utils.js` (a semantics-preserving O(1) matcher = 5 per-strategy key Sets, verified equivalent to `playsMatch` over 3200 randomized checks). Applied to `playbook-render.js` `_renderWorkflowChips` (was O(rows × script) + O(rows × scoutRecs) per filter/sort/page render → now one index build + O(1) lookups). Verified `gameplan-render.js` already uses `assignedSigs`/`rawIndexByPlay` Sets (perf-fixed v585/v358). Remaining: `script-render.js:1157` and `playbook-editor.js` use `findIndex` (need a key→index Map variant, lower frequency) — follow-up.
- [ ] 🟢 **Audit render functions for per-render `addEventListener`** (470 add vs 16 remove). Move any per-row handlers to `data-action` delegation to prevent accumulation on re-render.
- [ ] 🟢 **Confirm all keystroke-driven re-renders are debounced** (`debounce()` exists in `utils.js`).

---

## Phase 5 — Dark Mode & Design Tokens

343 hardcoded hex colors leak outside `base.css` — these don't respond to
`[data-theme="dark"]` and are the concrete dark-mode defects.

- [ ] 🟠 **Convert `callsheet.css` hardcoded hex → tokens** (66 occurrences, **zero** dark overrides today).
- [ ] 🟠 **Convert `gameplan.css` hardcoded hex → tokens** (58 occurrences, **zero** dark overrides today).
- [ ] 🟢 **Convert `playbook.css` hex → tokens** (50) and `wristband.css` (46).
- [ ] 🟢 **Reduce non-print `!important` debt (~200)** in wristband/script/callsheet via more specific selectors or source-order fixes (of 702 total, ~500 are legit print overrides).

---

## Phase 6 — Guard / Global Hygiene

- [ ] 🟠 **Triage the 1461 `typeof X === "function"` guards.** Keep genuinely-optional cross-module integrations; make same-file/guaranteed calls unconditional; add `console.warn` else-branches for required deps so missing dependencies surface instead of silently no-op'ing.
- [ ] 🟢 **Reconcile 142 `window.X =` assignments vs the `window-export-manifest`** in AGENTS.md (~12 may be undocumented); consider namespacing new debug globals under `window.bc.*`.
- [ ] 🟢 **Confirm the 6 empty `catch {}` blocks are annotated** with why the swallow is intentional.

---

## Phase 7 — HTML Shell / CSS Organization (polish)

- [ ] 🟢 **Add a dark `theme-color` variant** via `<meta name="theme-color" media="(prefers-color-scheme: dark)">`.
- [ ] 🟢 **Add `apple-mobile-web-app-title`** meta for the iOS home-screen label.
- [ ] 🟢 **Non-render-blocking Google Fonts** (swap-in pattern) so first paint isn't gated on the font stylesheet.
- [ ] 🟢 **Split `script.css` (12k lines)** along the existing JS seams (`script-render`, `script-periods`, `script-vision`, script print) into 3–4 module files.
- [ ] 🟢 **Consolidate duplicated print scaffolding** (wristband grid exists in both `print.css` and `wristband.css`); move module print rules into `print.css`.

---

## ✅ Confirmed Good (no action)

- No duplicate top-level function definitions (0 shadow bugs).
- All 6 `setInterval` sites clear correctly; no self-scheduling poll loops.
- Service worker: complete `LOCAL_ASSETS` (127/127 JS + 17/17 CSS), sound
  network-first app-shell strategy, non-destructive activation.
- No hardcoded secrets under `functions/`; middleware gates all protected routes;
  server-side role enforcement is consistent; dev login is localhost-only.
- Only 6 empty catch blocks in ~100k lines; dark-mode token foundation in
  `base.css` overrides the full palette.
