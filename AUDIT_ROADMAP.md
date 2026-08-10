# BCOffense Architecture & Optimization Roadmap

> Source: comprehensive top-down audit (2026-07-14, SW v1100). Read-only analysis
> across auth/login, CSS/responsive, JS architecture/perf, and the HTML shell.
> Check items off as they ship. Each item is independently shippable.

**Legend:** Severity — 🔴 High · 🟠 Medium · 🟢 Low · ✅ Confirmed good (no action)

---

## Reels Experience — "it just plays" for players (phones/teenagers)

> Goal: media feels like an Instagram reel — never blank, smooth, autoplay/loop,
> the next one already ready. Foundation already shipped: viewport-gating
> (v1104/v1107), 1400px player diagrams (v1106), windowed video preload, quiz
> video preserved across answers (v1103).

**Wave 1 — smooth & never-blank (shipped, SW v1108, `d55e51c`)**

- [x] 🟠 **Skeleton shimmer while loading + fade-in on load** on player playbook cards (never a blank box; smooth appear instead of pop). Theme-aware, reduced-motion safe. — `css/playbook.css`
- [x] 🟠 **Decode-ahead** the next quiz diagrams (`_decodeAheadImage` warms the browser's decoded-image cache) so they paint instantly, not stall on decode. — `js/script-quiz.js`
- [x] ✅ Reserved `aspect-ratio`/min-height already present on card + quiz diagram (no layout shift).

**Wave 2 — content-aware placeholders (assessed)**

- [ ] 🟢 **LQIP blur placeholder** — LOWER value here than on Instagram: play diagrams are line art, so a 24px blur is a muddy blob; the clean skeleton shimmer (Wave 1) reads better for diagrams. Revisit only if we add photo media. Would also need publish→player delivery (manifest-embedded data URL or client-cached on first view).

**Wave 3 — video "just plays" polish (remaining, higher effort)**

- [x] 🟠 **Video element pool** — ✅ shipped (SW v1109). `renderScriptQuizPlay` now reuses the previous render's signal `<video>` decoder elements (count-guarded positional reuse), swapping `src` only when it changes: same-question re-render keeps the clip playing; next question reuses the element instead of create/destroy churn. Generalizes the v1103 same-question preservation. — `js/script-quiz.js`
- [ ] 🟢 **Poster frames on player videos** — capture a first-frame at publish so clips show an image instantly instead of black. Needs first-frame capture in the upload pipeline. (Note: `preload="metadata"` already shows a first frame on the gated signal grid.)
- [ ] 🟢 **SW-cache watched clips (offline replay)** — online replay is ALREADY fast via HTTP `Cache-Control: max-age=86400`; the SW cache would only add offline. Range/206 semantics make it fiddly. Low marginal value.

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
- [x] 🟠 **M6 — Leaderboard sync trusts client scores.** ✅ Done (server-only; superseded by the authoritative-quiz system). Player `/api/leaderboard/sync` is summary-refresh only — it rejects browser-submitted attempts, rewards, and stickers. Scored rows are inserted exclusively by the server-authoritative quiz completion transaction, which computes correctness server-side (`is_correct = correct_choice_id` compare), derives `score = correct × POINTS_PER_CORRECT_ANSWER`, and `SELECT`s `player_name`/`user_id`/`score` from the session row while stamping `score_origin='server'`. Leaderboard summaries read only `score_origin='server'`; staff awards go through the role-gated `mutateStaffLeaderboardRecord`. The client never supplies a score or name. — `functions/_lib/d1-authoritative-quiz.js`, `functions/_lib/d1-leaderboard.js`, `functions/api/leaderboard/sync.js`
- [ ] 🟢 **L1 — Double session verification per request.** Middleware verifies HMAC, then each handler re-verifies. Attach the verified session to `context.data.session` and have handlers read it. — `functions/_middleware.js`
- [x] 🟢 **L2 — Host-only session cookie.** Done. Sessions use the browser-enforced `__Host-bc_auth` prefix with `Secure`, `Path=/`, and no `Domain`. — `functions/_lib/auth.js`
- [x] 🟢 **L3 — Username-enumeration timing.** Done. Unknown/inactive D1 accounts perform equivalent dummy PBKDF2 work before rejection. — `functions/_lib/d1-auth.js`
- [x] 🟢 **L4 — Atomic token consumption.** Done. Reset/invitation consumption requires `used_at IS NULL` in the authority update and accepts exactly one changed row. — `functions/_lib/d1-auth.js`
- [x] 🟢 **L5 — New password minimum.** Done. Invitation and reset flows enforce a 10-character minimum. Common-password screening remains a future optional hardening step. — `functions/_lib/d1-auth.js`

---

## Phase 2 — CSS Breakpoint Unification (top structural risk)

> **Reassessed 2026-07-14.** The observation (24 distinct `@media` max-widths; JS
> `is-mobile-screen`=768 vs dominant CSS 640/820) is real, but a wholesale
> refactor of all 24 breakpoints across 17 files is high-churn and risky — and
> the extensive v642–v650 live-audit history shows layouts are currently tuned
> and working at desktop widths. **Do NOT churn all breakpoints.** Instead:
> verify a specific, reproducible layout bug in the 641–820px tablet band with a
> live test, then fix that surgically. Introduce shared breakpoint tokens only
> opportunistically as those files are touched.

- [ ] 🔴 **Verify the 641–820px tablet band with a live test** (resize to ~700px on each tab) — confirm whether class-driven (`is-mobile-screen`≤768) and query-driven (`≤640`) rules actually conflict in practice, or whether it's only a theoretical seam.
- [ ] 🟠 **If a real bug is found:** align the JS mobile threshold and the module `@media` for that specific component; add a documented shared tier in `base.css` for it.
- [ ] 🟢 **Fix off-by-one drift opportunistically** (639/640/641, 820/821, 1199/1200) only in files already being edited — not as a standalone sweep.

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

- [x] 🟠 **Build per-render lookup indices to kill nested `plays.find()`/`playsMatch` scans.** ✅ Done. Added `buildPlaysMatchLookup(arr)` to `utils.js` (semantics-preserving O(1) matcher = 5 per-strategy key Sets, verified equivalent to `playsMatch` over 3200 randomized checks). Applied to `playbook-render.js` `_renderWorkflowChips` (was O(rows × script) + O(rows × scoutRecs) per render → one index build + O(1) lookups). `gameplan-render.js` was already Set-optimized (v585/v358). **The remaining `findIndex` sites (`script-render.js` `jumpToPlayInPlaybook`, `playbook-editor.js`) are one-off user actions, NOT render loops — not worth optimizing.** The one true render hot-path is fixed.
- [ ] 🟢 **Audit render functions for per-render `addEventListener`** (470 add vs 16 remove). Move any per-row handlers to `data-action` delegation to prevent accumulation on re-render.
- [ ] 🟢 **Confirm all keystroke-driven re-renders are debounced** (`debounce()` exists in `utils.js`).

---

## Phase 5 — Dark Mode & Design Tokens

> **Investigated 2026-07-14 → MOSTLY FALSE POSITIVE.** The audit's "343 hardcoded
> hex" count came from a grep that also matched `var(--token, #fallback)`
> fallbacks and print colors gated by the `body.gp-printing` class (not
> `@media print`). On inspection: **callsheet.css has 0 genuinely hardcoded hex**
> (all `var(--token, #fallback)`); **gameplan.css**'s hardcoded hex are all print
> inks on white paper (correct, must not flip); **playbook.css**'s are an
> intentional multi-hue category/tag palette (with dark overrides); **wristband**
> has print vars + one print logo-card white. The codebase is well-tokenized;
> there is no meaningful dark-mode conversion work here.

- [x] 🟠 **Audit callsheet/gameplan/playbook/wristband hardcoded hex.** ✅ Done — verified they are tokenized-with-fallback or intentional print/palette colors. No conversion needed.
- [ ] 🟢 **Reduce non-print `!important` debt (~200)** in wristband/script/callsheet via more specific selectors or source-order fixes (of 702 total, ~500 are legit print overrides). Still a real (low-priority) maintainability item.
- [ ] 🟢 _(Optional consistency nit)_ `wristband.css` `.wb-logo-print-card` uses a raw `#fff`; could become `var(--wristband-print-paper, #fff)` to match the other print vars. Cosmetic only.

---

## Phase 6 — Guard / Global Hygiene

- [ ] 🟠 **Triage optional function guards one ownership area at a time.** The global-contract audit reports the current count and same-file candidates. Keep genuinely optional cross-module integrations; make guaranteed same-owner calls unconditional; add `console.warn` else-branches for required dependencies.
- [x] 🟢 **Reconcile direct `window.X =` assignments with the `window-export-manifest`.** Done. `scripts/global-contract-audit.mjs --strict` and smoke both reject undocumented or stale manifest entries. New debug globals should prefer `window.bc.*`.
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
