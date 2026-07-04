# Consolidated Product Roadmap

This document serves as the master roadmap for the BCOffense application, consolidating all incomplete tasks from previous roadmaps (`ROADMAP_TO_MVP.md`, `ROADMAP_TWO_OMG.md`, `ACTIONS_HUB_ROADMAP.md`, `PRODUCT_ROADMAP.md`).

## Phase 1: Deep Clean, Audit, and Performance Stabilization

Before adding any new features, the codebase must undergo a rigorous audit to ensure stability, reduce technical debt, and prevent regressions.

- [ ] **Global Code Consistency Audit**
  - [ ] Enforce standard formatting across all JS, CSS, and HTML files.
  - [ ] Identify and resolve any conflicting CSS rules, particularly around responsive layouts and modal z-indexes.
  - [ ] Standardize nomenclature (e.g., ensure "Game Week", "Opponent Scout", "Wristband" are used consistently in the UI and variable names).
- [ ] **Error and Bug Hunt**
  - [ ] Review all console warnings and errors during the complete workflow (Import -> Scout -> Plan -> Script -> Wristband -> Call Sheet).
  - [ ] Test all `storageManager` fallback logic (IndexedDB -> localStorage -> RAM) and address any silent failures.
  - [ ] Audit service worker caching to ensure updates are reliably propagated without breaking offline mode.
- [ ] **Workflow Friction Points**
  - [ ] Identify and smooth out any remaining friction points in the primary Game Week workflow.
  - [ ] Consolidate or eliminate redundant UI components that clutter the mobile experience.
- [ ] **Data Model Validation**
  - [ ] Verify that all stable play IDs are correctly tracked and preserved across all modules and handoffs.
  - [ ] Ensure that deleting or updating a play correctly updates downstream artifacts without orphans.

## Phase 2: Completion of Planned Workflow Enhancements

Complete the remaining tasks from the previous Core Workflow and UX Implementation Roadmap.

- [ ] `TODO: MANUAL` — Establish baseline task times for Playbook-to-Call-Sheet workflow.
- [ ] `TODO: OMG ROADMAP` — Add team-level scope and Varsity/JV scope (Requires D1 teams table + multi-team auth).
- [ ] `TODO: MANUAL` — Run manual iPad Safari and installed-web-app testing.
- [ ] `TODO: MANUAL` — Run iPad portrait, landscape, split-screen, and external-display tests.
- [ ] `TODO: MANUAL` — Run phone Safari and Chrome tests.
- [ ] `TODO: MANUAL` — Measure the updated full-workflow task time.
- [ ] `TODO: MANUAL` — Compare clicks, page switches, and duplicate data entry against baseline.
- [ ] `TODO: MANUAL` — Document the final workflow for coaches.
- [ ] `TODO: MANUAL` — Collect coach feedback on terminology and ordering.

## Phase 3: Player Experience and Play Discussion (The "Facebook-Style" Communication Layer)

Implement the communication layer intended to allow players to ask questions and interact with plays.

### 3.1 Architecture, Auth, and Storage Prep

- [ ] **Storage & Infrastructure Audit**
  - [ ] Document current monthly Cloudflare usage, Worker/Pages Functions request volume, and KV reads/writes.
  - [ ] Estimate expected accounts, comments, questions per week, and in-app/push notification volume.
  - [ ] Create a cost worksheet for various user tiers and establish billing alerts/maximum budgets.
- [ ] **Authentication Selection**
  - [ ] Evaluate Better Auth (or fallbacks like Firebase, Supabase, Clerk) for self-hosted D1 auth.
  - [ ] Create a proof-of-concept replacing the custom auth with the selected library.
- [ ] **D1 Database Implementation**
  - [ ] Create preview/staging databases.
  - [ ] Add migration journal, backup/restore documentation.
  - [ ] Create teams table, team memberships table, player profile table, position tables.
  - [ ] Create post edit history table.
  - [ ] Add migration tests.

### 3.2 Player Account Model and Roster Management

- [ ] **Account Model**
  - [ ] Link authenticated player accounts to a roster player record.
  - [ ] Allow one roster player to have at most one active primary account by default.
  - [ ] Support coach-approved account relinking.
  - [ ] Store jersey number, graduation year, active/inactive roster status, secondary positions, team membership.
  - [ ] Support transferring a player between rosters while preserving history.
- [ ] **Roster Workflow**
  - [ ] Allow coaches to bulk invite selected players.
  - [ ] Allow CSV roster import to create pending account records.
  - [ ] Allow coaches to print invitation cards.
  - [ ] Allow coaches to revoke an unused invitation.
  - [ ] Allow coaches to correct a linked email address.
  - [ ] Allow players to claim an existing roster record.
  - [ ] Require coach approval when account claiming is ambiguous.
  - [ ] Prevent two users from claiming the same roster record.
  - [ ] Add roster account-status filter, counts to dash, reminder list, and activation completion percentage.
  - [ ] Add account onboarding instructions, QR-code invitations, direct login URL, and audit logs.

### 3.3 Core Discussion Features (Replies, Visuals, Reactions)

- [ ] **Discussion Logic**
  - [ ] Store source context (Script ID, opponent, week, position context) on posts.
  - [ ] Add unread-count queries without loading complete threads.
  - [ ] Set reply-depth limits.
  - [ ] Allow replies to visual attachments.
  - [ ] Avoid one database query per reply (batch loading).
- [ ] **Visual Attachments**
  - [ ] Allow an uploaded image to be marked up before posting.
  - [ ] Generate optimized previews of uploads.
  - [ ] Allow a coach to present a marked-up answer during film or practice.
- [ ] **Moderation and Limits**
  - [ ] Add daily upload/attachment limits per user.
  - [ ] Allow players to report a visual attachment.
- [ ] **Notifications**
  - [ ] Bundle multiple ordinary player replies.
  - [ ] Show reaction activity inside the application.
  - [ ] Deep-link notifications to exact replies.

### 3.4 Notifications & Analytics

- [ ] **Analytics**
  - [ ] Track visual replies, most-explained plays/positions.
  - [ ] Add a "Most Helpful Visual Explanations" report.
  - [ ] Allow promoting helpful discussions to canonical Playbook notes.

## Phase 4: Large Playbook Performance Track (From PRODUCT_ROADMAP.md)

- [ ] Implement virtualization/lazy loading for massive playbooks to ensure buttery smooth performance on older mobile devices.
- [ ] Optimize filter application logic for heavy playbooks.

## Phase 5: Swipe View Upgrades (From ACTIONS_HUB_ROADMAP.md)

- [ ] **Player-facing action set in swipe view**
  - Bigger, fewer, "what do I do next" options. Needs design direction for final polish.

## Phase 6: Cloudflare D1 Team and Varsity/JV Management

- [ ] Implement a `teams` table to support multi-team architecture.
- [ ] Segment data by Varsity, JV, and Freshman scoping where appropriate.

## Phase 7: Outstanding Playbook/Module Enhancements

- [ ] **Telestrator Refactor**
  - [ ] Separate reusable drawing-engine logic from presentation-specific UI.
  - [ ] Add explicit annotation modes (Temporary Presentation, Saved Coach Reply, Uploaded Image Markup).

---

## Phase 0: 50-Point Hardening Roadmap (Do This First)

> **Why this exists.** A deep audit (2026-07, SW v891) found the codebase is
> _mostly_ clean on the obvious metrics (0 hardcoded colors in JS, 0 `debugger`,
> 1 stray inline handler comment, raw `localStorage` only in debug flags) — but
> it carries **structural fragility** that turns small changes into recurring
> bugs. The three biggest offenders:
>
> - **~1,012 `typeof X === "function"` guards** — every cross-file call is
>   defensively wrapped because global load order is fragile. When a function is
>   actually missing, the guard silently no-ops → a dead feature instead of a
>   loud error.
> - **711 `!important` rules** (115 in `wristband.css` alone) — a CSS
>   specificity war that makes every layout change unpredictable.
> - **The `.panel.active` transform trap + `scrollIntoView` shell breakage** —
>   one root cause behind ~4 separate "nav bar / floating menu" bugs this cycle.
>
> Audit snapshot: 120 JS files / ~82.7k lines, 16 CSS files / ~44.5k lines.
> Largest JS: `play-discussion.js` (3033), `play-presentation.js` (2948),
> `utils.js` (2286). Largest CSS: `script.css` (7168), `playbook.css` (6293).
> Findings already fixed during the audit: removed the shadowed duplicate
> `sendScoutRecsToGamePlan` in `tendencies.js`; duplicate-function scan is now 0.

### 0.A — Architecture & Load-Order Integrity (1–10)

- [x] **1.** Add a duplicate top-level `function` scan that fails ship if any name is defined in 2+ files — implemented inside `scripts/static-ui-audit.sh` (strict) and gated by `ship.sh` pre-flight. (2026-07, SW v893)
- [ ] **2.** Generate a one-time report of every `typeof X === "function"` guard; classify each as (a) legitimate optional integration, (b) same-module call that should be a direct call, (c) guaranteed-present call. Track counts.
- [ ] **3.** Remove category-(b)/(c) guards in the 5 most-churned files first (`wristband*.js`, `callsheet*.js`, `gameplan*.js`, `app-*.js`, `script-*.js`).
- [ ] **4.** For remaining legitimate guards, add a `console.warn` in the `else` branch (dev-only) so missing dependencies surface loudly instead of no-op'ing.
- [x] **5.** Added a strict audit check that `index.html` `<script>` membership matches `sw.js` `LOCAL_ASSETS` (a loaded-but-uncached script breaks offline mode). Load order documented in `AGENTS.md`. (2026-07, SW v894)
- [ ] **6.** Audit every `window.X =` global export (currently ~40); confirm each is intentional and documented in the Refactor Ownership Map.
- [ ] **7.** Verify every split-file "owning" claim in the Refactor Ownership Map by grepping for the functions it claims to own; fix drift.
- [ ] **8.** Establish a naming convention for private helpers (`_gp*`, `_wb*`, `_cs*`, `_td*`) and enforce it — makes ownership obvious and reduces collision risk.
- [ ] **9.** Add a lightweight runtime "module ready" registry (e.g. `window.__bcReady.gameplan = true`) so cross-module calls can check readiness explicitly instead of `typeof` guessing.
- [ ] **10.** Write a smoke test that loads `index.html` headless and asserts no `ReferenceError`/`undefined is not a function` during a full tab tour.

### 0.B — CSS Specificity & Layout Stability (11–20)

- [ ] **11.** Reduce `wristband.css` `!important` count (115 → target < 40) by fixing source order and using more specific selectors.
- [ ] **12.** Global `!important` audit (711 total): categorize as utility-override (keep) vs specificity-war (remove). Target < 400.
- [ ] **13.** Add a permanent regression comment + guard test around `.panel.active` staying opacity-only (no `transform`/`will-change: transform`/`filter`).
- [ ] **14.** Standardize the "pinned zone + scroll zone" flex pattern across ALL module panels (script, gameplan done; apply to callsheet, wristband, tendencies, dashboard).
- [ ] **15.** Audit all `position: sticky` uses inside panels — confirm each has a real scroll container ancestor and won't be trapped by a transform.
- [ ] **16.** Replace every remaining `<details>`/`<summary>` toolbar dropdown with the anchored `.tool-menu-wrap` pattern (Safari reliability).
- [ ] **17.** Consolidate duplicated responsive breakpoints — pick a canonical set of breakpoints (e.g. 640/820/1024) and document them.
- [ ] **18.** Extract shared card/panel/toolbar patterns into `components.css` utility classes to cut per-module CSS duplication.
- [ ] **19.** Audit z-index usage against the `--z-*` token scale; replace any raw numeric z-index with a token.
- [ ] **20.** Verify dark-mode token coverage on every module (no hardcoded light-mode colors leaking through).

### 0.C — Scroll, Shell & Navigation (21–26)

- [ ] **21.** Grep every `scrollIntoView` call (34+ sites); replace those inside `.panel` with direct inner-container scrolling.
- [ ] **22.** Expand `repairDesktopDocumentScroll()` coverage and add a periodic assertion (dev-only) that `#mainApp.scrollTop === 0` on desktop.
- [ ] **23.** Add a shared `scrollElementIntoContainer(el, container)` helper and route all in-panel scrolling through it.
- [ ] **24.** Audit all `.focus()` calls (many sites) — programmatic focus can also scroll the shell; use `{ preventScroll: true }` where appropriate.
- [ ] **25.** Verify the tab bar stays pinned across ALL tabs on desktop (regression matrix: each tab × scroll-to-bottom).
- [ ] **26.** Document the desktop shell scroll model (body → #mainApp → panel) prominently in `AGENTS.md` (done — keep updated).

### 0.D — Error Handling & Observability (27–34)

- [x] **27.** All empty `catch {}` blocks now carry a justifying `/* benign: ... */` comment documenting why the failure is safe to swallow (browser drag quirks, private-mode sessionStorage, optional-module reads, detached-element focus). Zero unexplained empty catches remain. (2026-07, SW v895)
- [x] **28.** Added a global `error` + `unhandledrejection` handler (`app-shell.js`) that logs to console + a rolling `window.__bcErrors` buffer, and shows a dev toast only when a trace flag is set. Inspect via `window.bcErrors()`. (2026-07, SW v894)
- [ ] **29.** Consolidate the tracing infrastructure (`traceWristbandAction`, `traceAppAction`, shell scroll trace, ~213 lines) into ONE `js/trace.js` module with a single enable flag.
- [x] **30.** Reviewed all console output: only 8 `console.log` (all in dev-tools or already gated by `_gpDbg`/eslint-disable diagnostics), the rest are 74 `console.error` + 32 `console.warn` legitimate diagnostics that stay unconditional. Debug noise is already minimal/gated. (2026-07, SW v895)
- [ ] **31.** Add a "self-check" dev command (`window.bcSelfCheck()`) that runs the wristband/gameplan/callsheet audit snapshots and reports issues in one call.
- [ ] **32.** Ensure every user-facing failure path shows a toast or modal — no silent returns on error.
- [ ] **33.** Audit `storageManager` fallback chain (IndexedDB → localStorage → RAM) for silent-failure paths; add telemetry counters.
- [ ] **34.** Add quota-exceeded handling verification for every large write (playbook, backups, drafts).

### 0.E — Dead Code & Bloat Reduction (35–41)

- [ ] **35.** Static dead-code sweep: for each top-level function, grep for references; produce a candidate-unused list for manual review.
- [ ] **36.** Remove confirmed dead code (start with the newly-orphaned patterns exposed by removing the `sendScoutRecsToGamePlan` duplicate).
- [ ] **37.** Split the 5 largest JS files (`play-discussion.js` 3033, `play-presentation.js` 2948, `utils.js` 2286, `tendencies.js` 2075, `app-shell.js` 1967) along clear ownership lines.
- [ ] **38.** Split `utils.js` — it mixes constants, modals, CSV parsing, and DOM helpers; separate into focused files.
- [ ] **39.** Audit `_paRevealLibrary` and other known-unused helpers flagged during the Actions Hub work; delete or wire up.
- [ ] **40.** Deduplicate near-identical helpers across modules (e.g. multiple play-signature / play-matching implementations) into shared utils.
- [ ] **41.** Trim commented-out code blocks and stale "restored after commit X" archaeology comments once the fix is stable.

### 0.F — Data Model & Handoff Integrity (42–46)

- [ ] **42.** Define ONE canonical play-signature function and route every dedup/match through it (audit `_gpPlaySignature`, `playsMatch`, `playSignature`, ad-hoc `JSON.stringify`).
- [ ] **43.** Verify stable play identity survives every handoff (Playbook → Script → Wristband → Call Sheet → Game Plan) with a round-trip test.
- [ ] **44.** Ensure deleting/editing a play updates or flags downstream artifacts (no orphaned references in call sheet / wristband / game plan).
- [ ] **45.** Validate all `STORAGE_KEYS` are actually used; remove dead keys and document each key's owning module.
- [ ] **46.** Add a migration test harness that runs `runMigrations()` against fixtures for each `STORAGE_VERSION`.

### 0.G — Workflow, Tooling & Docs (47–50)

- [x] **47.** Expand `scripts/static-ui-audit.sh` with new checks (duplicate functions, `.panel.active` transform trap, `<details>`/`<summary>` toolbar dropdowns, `scrollIntoView` in modules) and gate them at ship time via `ship.sh`. (2026-07, SW v893)
- [x] **48.** `ship.sh` now runs the full strict audit as a pre-flight gate (duplicate functions, panel transform, details dropdowns, script-cache membership) and aborts the ship on any strict finding. (2026-07, SW v894)
- [ ] **49.** Keep `AGENTS.md` "Known Traps & Hardening Standards" current — every new class of bug fixed gets a trap entry so it never recurs silently.
- [ ] **50.** Establish a "consistency budget" dashboard: track `!important` count, `typeof` guard count, largest-file line counts, and duplicate-function count over time; require each ship to not regress them.

---

_This roadmap replaces the previous dispersed documents. Any new feature requests should be categorized and added to this file._
