# BCOffense Deep Audit — Execution Plan

> **Source audit:** BCOFFENSE_DEEP_AUDIT (2026-08-08), ~1,650 lines.
> **Reconciled against live code + production:** 2026-08-09.
>
> This plan preserves the original audit's phase structure (Phase 0 → 1 → 2) and
> records, for each item, the **verified current status** plus the **concrete
> steps** still required. Much of Phase 0 and half of Phase 1 shipped between the
> audit and this reconciliation.

**Legend:** ✅ Done · ◑ Partial · ⬜ Not started · ⏸ Parked (deliberate) ·
🔴 High · 🟠 Medium · 🟢 Low

---

## Phase 0 — Establish Trust

### 0A — Safe releases & reproducible database ✅ (complete)

| Audit finding | Status | Evidence / remaining steps |
| --- | --- | --- |
| Source packaging leaked `.git`/`.wrangler`/421 KB SQL backup | ✅ | `scripts/package-source.sh` (`npm run release:package`) packages from git with an allowlist. `.gitignore` blocks `*.backup`, `.dev.vars`, `.wrangler`. |
| `ship.sh` could deploy non-`main` code | ✅ | `ship.sh` is deploy-only; `scripts/deploy-cloudflare.sh` refuses anything but an exact clean `origin/main`; production ships via the protected **Deploy Production** GitHub Actions workflow. |
| Fresh DB couldn't log in (missing `login_attempts`) | ✅ | Migration `0026` added the table; `0029` indexed its cleanup; `fresh-schema-login-rate-limit.test.mjs` executes the login SQL. Remote D1 is at **migration 0031**. |
| Quality gate red / downgraded to warnings | ✅ | `scripts/release-quality-gate.sh` runs full unit + smoke + browser hydration; deploy blocks on it. Smoke passes. |
| Wrangler unpinned | ✅ | Pinned to `wrangler@4.112.0` across all scripts and workflows. |

### 0B — Server-authoritative leaderboard & quiz ✅ (authoritative path complete)

| Audit finding | Status | Evidence / remaining steps |
| --- | --- | --- |
| Leaderboard trusted client scores | ✅ | Identity is session-derived; staff-only rewards/stickers/approvals enforced; `leaderboard-authority-contract.test.mjs`. |
| Quiz scoring was client-authoritative | ✅ | Server-authoritative session engine exists: D1 `authoritative_quiz_sessions` + `authoritative_quiz_questions`, `functions/_lib/d1-authoritative-quiz.js`, `js/player-quiz-authoritative.js`, `authoritative-quiz-sessions.test.mjs`. Idempotency keys + 409 conflict handling implemented. |
| — | ◑ | The **local practice quiz** (`js/script-quiz.js`) remains client-side by design; it does **not** feed the authoritative leaderboard. Only the authoritative session path is leaderboard-eligible. No action required unless practice results are ever made competitive. |

### 0C — Resolve the 7 hard smoke failures ✅

- ✅ `node scripts/smoke-check.js` passes (diagram-sync, Game Plan provenance,
  image compat, canonical play identity, workspace-pull summaries, storage-key
  inventory). Re-run before every release.

### 0D — Retire shared identities & MFA ◑

| Item | Status | Steps |
| --- | --- | --- |
| Named D1 staff accounts | ✅ | Bootstrap + invite flow live. |
| Retire shared staff login | ✅ | `AUTH_LEGACY_STATIC_STAFF_ENABLED=false` cutoff (default on). |
| Retire shared player login | ✅ | `AUTH_LEGACY_STATIC_PLAYER_ENABLED=false` cutoff added 2026-08-09 (default on, deployed). Flip it once every player is on a personal account (procedure in `CLOUDFLARE_AUTH.md`). |
| MFA (authenticator) | ⏸ | Parked on `feature/mfa-authenticator`; `AUTH_MFA_ENCRYPTION_KEY` secret exists. Resume only when personal accounts are the norm. |

---

## Phase 1 — Stabilize the Product (current focus)

### 1.1 — Telemetry / Web Vitals ◑ 🔴 (in-app shipped 2026-08-09; server beacon pending)

**Status:** ✅ **In-app telemetry shipped** — `js/perf-monitor.js` implements
`window.perfMonitor` with `.record(name, ms, meta)` / `.measure(name, fn, meta)`
(now lighting up the previously no-op call sites in `play-images.js`,
`play-clips.js`, `script-quiz-foundation.js`) and captures **LCP, INP, CLS, FCP,
TTFB** via native `PerformanceObserver` (no npm deps). `?perf` prints a console
report of vitals + slowest recorded ops. Contract test:
`tests/perf-monitor-contract.test.mjs`. **Remaining:** the optional sampled
server beacon (step 5 below) and wiring `perfMonitor.measure` into more hot paths
(startup module init, render).

**Steps:**
1. Implement `window.perfMonitor` (new `js/perf-monitor.js`, load early) exposing
   `.record(name, ms, meta)` and `.measure(name, fn, meta)` — lights up existing
   call sites immediately.
2. Capture Core Web Vitals with native `PerformanceObserver`: **LCP**
   (`largest-contentful-paint`), **CLS** (`layout-shift`), **INP**
   (`event`/`first-input` timing). Targets: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1
   (field p75).
3. Fold in the `appDiagnostics` startup timeline (DOMContentLoaded, first render,
   per-module init) as a "startup" metric group.
4. Surface a `perfMonitor.report()` (console table) behind `?perf`, matching the
   existing diagnostics pattern.
5. **(Follow-up, optional)** add a lightweight same-origin beacon
   `POST /api/telemetry` (bounded body, sampled, no PII) writing to a small D1
   table or Workers Analytics Engine — only after the in-app version proves the
   metrics are trustworthy.
6. Add a contract test asserting `perfMonitor` exists with the two methods + the
   Web Vitals observers.

**Why first:** the audit *could not obtain Lighthouse/runtime traces*; every
later perf decision (startup split, SW tiering) needs this baseline. Low risk
(additive instrumentation).

### 1.2 — Split startup shell from inactive feature JS/CSS ◑ 🔴 (biggest perf lever)

**Status:** only **2 of 142** JS files are deferred (`media-inventory.js`,
`print-studio.js` via `js/feature-loader.js`). ~130 heavy files load eagerly
before `DOMContentLoaded` — Quiz (8), Discussion (3), Dashboard (3), Game Plan
(10), Presentation, etc. A coach opening a Call Sheet pays startup cost for
every unrelated feature.

**Steps (incremental, measured — do after 1.1):**
1. With telemetry live, measure per-module parse/eval cost to rank candidates.
2. Extend `feature-loader.js` to defer whole feature bundles behind their entry
   points (open-on-first-use), starting with the least-cross-referenced:
   **Print Studio (done)**, **Media Inventory (done)**, then **Discussion**,
   **Presentation**, **Game Plan**, **Dashboard**, **authoritative Quiz**.
3. For each deferred bundle: keep a stable `window.*` bridge stub that lazy-loads
   on first call (the existing `loadDeferredFeature` pattern); verify no eager
   cross-module references at load time (only at call time).
4. Move deferred files **out of** `LOCAL_ASSETS` precache into **runtime**
   caching (see 1.3) so first paint downloads less.
5. Re-measure Web Vitals after each bundle; keep only wins, revert regressions.
6. Update `index.html` load order, `sw.js`, and the AGENTS.md load-order docs
   together for every moved file.

**Risk:** medium — load-order/global-scope coupling. Mitigate with the telemetry
baseline + per-bundle verification. **Do not** move all at once.

### 1.3 — SW core precache + runtime feature caching ◑ 🟠

**Status:** `LOCAL_ASSETS` precaches **all 135 JS** files (164 entries). No
separate runtime-feature cache tier.

**Steps:**
1. Reduce `LOCAL_ASSETS` to the **core shell** (files needed for first paint +
   the default tab).
2. Add a runtime cache tier (stale-while-revalidate) for deferred feature bundles
   fetched on first use — pairs with 1.2.
3. Keep app-shell network-first; keep the conservative activation (never reset
   in-progress work); bump `CACHE_NAME` on every change.

### 1.4 — Mobile navigation / status / run-mode shell ✅

- ✅ Bottom-nav (player study portal), coach **run-mode** card
  (`#mobileScriptCoachNow`), mobile **More** sheet, `syncMobileShellState()`
  breakpoint classes. Documented in `MOBILE_AUDIT.md`.
- ◑ **Optional polish:** a single **unified status center** (login/publish/queued
  /update notices are currently embedded in the run-mode card, not one hub). Low
  priority — revisit if sideline clutter is reported.

### 1.5 — Shared accessible dialog/sheet/focus primitives ✅

- ✅ `openLayer()`/`closeLayer()` + `trapFocus()` (`js/dom-helpers.js`), async
  `showModal/showConfirm/showPrompt/showChoice/showListPicker` (`js/utils.js`),
  `.is-bottom-sheet` styling, 50+ adopters. No further work required.

### 1.6 — Server hardening: bodies / schemas / idempotency / logs / roles ◑ 🟠

| Sub-item | Status | Steps |
| --- | --- | --- |
| Bounded request bodies | ✅ | `readBoundedJsonOrFormObject` applied across ~23 auth/API routes. |
| Idempotency | ◑ | Implemented for authoritative quiz + diagram upload. **Extend** to other state-changing writes (workspace revision, player mgmt, broadcasts) with an `Idempotency-Key` + dedupe table. |
| Schema validation | ◑ | Strict validation on workspace revision + quiz; **add** explicit schemas to remaining write routes. |
| Structured logs | ⬜ | Server routes use bare `console.log`. **Add** a small structured logger (JSON: route, requestId, teamId, outcome, ms) and adopt per route; consider Workers observability. |
| Role matrix | ◑ | Role checks are scattered per-route (`session.role`). **Centralize** an authorization policy helper (server mirror of the client `isActionAllowedForRole`) and route through it. |

### 1.7 — Batch D1 writes + queue notification fanout ◑ 🟠

- ✅ **Queue-based notification fanout** shipped (durable outbox: migration 0030,
  `bcoffense-notifications` queue + DLQ, `bcoffense-notification-delivery` Worker).
- ◑ **D1 `batch()`**: the outbox uses set-based/bounded writes. **Audit** other
  hot multi-write paths (leaderboard sync, workspace publish) and adopt
  `db.batch()` where round-trips dominate.

---

## Phase 2 — Modernize Incrementally (later; not started)

> The audit explicitly recommends **no framework rewrite** (no React/Vue). Keep
> vanilla global-scope DOM; modernize delivery only.

| Item | Status | Notes |
| --- | --- | --- |
| Small packaging build (hashed feature chunks + generated SW manifest) | ⬜ | Only after 1.2/1.3 prove the deferral model. Introduces the first build step — decide deliberately (currently intentionally no-build). |
| ES modules migration (one feature at a time, compat shims) | ⬜ | Requires the packaging build first. |
| `checkJs`/JSDoc by owner → TS for shared domains | ◑ | Foundation exists: `jsconfig.json` (`checkJs:false`), ambient `types/bcoffense.d.ts`. Adopt `// @ts-check` file-by-file. |
| Keyed rendering / virtualization / Web Workers | ⬜ | Only where telemetry (1.1) measures a real bottleneck. |

---

## Recommended execution order

1. **1.1 Telemetry / Web Vitals** — measure first (low risk, unblocks everything).
2. **1.2 Startup shell split** — biggest perf win; drive it with 1.1's data.
3. **1.3 SW core precache + runtime tiering** — pairs with 1.2.
4. **1.6 server hardening** (idempotency breadth, structured logs, central roles)
   and **1.7 D1 batch** — steady backend hardening.
5. **0D MFA** and **Phase 2** — deliberate, later.

**Guardrails (every change):** run `scripts/release-quality-gate.sh` (or
`npm run doctor` for the local preflight), bump `CACHE_NAME` + restamp `?v=N`
when cached assets change, keep `index.html`/`sw.js`/AGENTS.md load order in
sync, and deploy only through the protected **Deploy Production** workflow.
