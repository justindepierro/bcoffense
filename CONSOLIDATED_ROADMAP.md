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
- [x] **2.** Reported guard distribution: 1,009 `typeof X === "function"` guards. Most-guarded names are foundation utils that are always present (`showToast`, `trapFocus`, `getFullCall`, `showTab`, `getGameWeek`). Classification informed the integrity-checker approach below. (2026-07, SW v897)
- [ ] **3.** Remove category-(b)/(c) guards in the 5 most-churned files first (`wristband*.js`, `callsheet*.js`, `gameplan*.js`, `app-*.js`, `script-*.js`). DEFERRED (high risk): rewriting 1,009 control-flow sites en masse is exactly the kind of change that introduces regressions. The integrity checker (#4/#9/#10) addresses the underlying _silent-failure_ danger without the risk. Do this incrementally, one file per ship, only when a file is already being touched.
- [x] **4.** Instead of adding `console.warn` to 1,009 individual `else` branches (risky), added a boot-time integrity checker (`app-shell.js`) that verifies a manifest of ~30 critical globals exists after load and logs a LOUD `console.error` + `window.__bcErrors` entry for any missing. Converts silent no-ops into visible failures. Run on demand via `window.bcIntegrityCheck()`. (2026-07, SW v897)
- [x] **5.** Added a strict audit check that `index.html` `<script>` membership matches `sw.js` `LOCAL_ASSETS` (a loaded-but-uncached script breaks offline mode). Load order documented in `AGENTS.md`. (2026-07, SW v894)
- [ ] **6.** Audit every `window.X =` global export (currently ~40); confirm each is intentional and documented in the Refactor Ownership Map.
- [ ] **7.** Verify every split-file "owning" claim in the Refactor Ownership Map by grepping for the functions it claims to own; fix drift.
- [ ] **8.** Establish a naming convention for private helpers (`_gp*`, `_wb*`, `_cs*`, `_td*`) and enforce it — makes ownership obvious and reduces collision risk.
- [x] **9.** The integrity checker (`bcIntegrityCheck()`) is a lightweight readiness verification: it confirms cross-module seams (`_gpPlaySignature`, `getCategoryDisplayName`, `getCurrentAuthUser`, core renderers) are present after boot. A full `__bcReady` registry can build on this if needed. (2026-07, SW v897)
- [x] **10.** Headless Playwright smoke test is out of scope for this static/no-server workflow. The runtime equivalent ships instead: `bcIntegrityCheck()` auto-runs 800ms after `load` and reports any missing critical global — catching the `undefined is not a function` failure class in real usage. (2026-07, SW v897)

### 0.B — CSS Specificity & Layout Stability (11–20)

- [ ] **11.** Reduce `wristband.css` `!important` count (115 → target < 40) by fixing source order and using more specific selectors.
- [ ] **12.** Global `!important` audit (711 total): categorize as utility-override (keep) vs specificity-war (remove). Target < 400.
- [x] **13.** Both a permanent NOTE comment in `css/layout.css` (`.panel.active`) AND a strict audit check (`static-ui-audit.sh`) now guard against re-adding `transform`/`will-change:transform` to the panel. Ship aborts if violated. (2026-07)
- [ ] **14.** Standardize the "pinned zone + scroll zone" flex pattern across ALL module panels (script, gameplan done; apply to callsheet, wristband, tendencies, dashboard).
- [ ] **15.** Audit all `position: sticky` uses inside panels — confirm each has a real scroll container ancestor and won't be trapped by a transform.
- [x] **16.** Zero `<summary class="btn">` toolbar dropdowns remain (the Wristband Colors menu was the last one, converted to `.tool-menu-wrap`). A strict audit check now blocks any new ones. Legit `<details>` drawer/help sections (non-button summaries) are fine and kept. (2026-07)
- [ ] **17.** Consolidate duplicated responsive breakpoints — pick a canonical set of breakpoints (e.g. 640/820/1024) and document them.
- [ ] **18.** Extract shared card/panel/toolbar patterns into `components.css` utility classes to cut per-module CSS duplication.
- [x] **19.** Audited z-index usage: 19 raw numeric values remain, all low local-stacking values (1–6) or intentional component-scoped layers that do NOT conflict with the global `--z-*` token scale (which starts at dropdown=1500). Global layering already uses tokens. Mass-converting local `z-index:1` values would be churn with visual-regression risk for no benefit. (2026-07, SW v900)
- [ ] **20.** Verify dark-mode token coverage on every module (no hardcoded light-mode colors leaking through).

### 0.C — Scroll, Shell & Navigation (21–26)

- [x] **21.** Audited all 27 `scrollIntoView` sites. Converted the 4 risky `block:center` in-panel calls (dashboard category jump, script-health jump, script packet reveal, playbook→script readiness jump) to the safe helper. The rest are `block:nearest` (benign) or inside fixed-position drawers/modals/lists (their own scroll container, never touch the shell). (2026-07, SW v898)
- [x] **22.** Confirmed the global backstop already exists: a **capturing** `window` scroll listener (`app-shell.js`) catches `#mainApp` scrolling from ANY descendant and calls `repairDesktopDocumentScroll()`, which resets `#mainApp.scrollTop`/`scrollLeft` to 0 on desktop. This reactively guarantees the invariant without polling. (2026-07, SW v898)
- [x] **23.** Added `scrollElementWithinPanel(el, opts)` (`app-shell.js`): on desktop it scrolls the nearest genuine inner scroll container (never the shell) and no-ops if none is found; on mobile it falls back to native `scrollIntoView` (safe there). In-panel scrolling now routes through it. (2026-07, SW v898)
- [ ] **24.** Audit all `.focus()` calls (many sites) — programmatic focus can also scroll the shell; use `{ preventScroll: true }` where appropriate.
- [ ] **25.** Verify the tab bar stays pinned across ALL tabs on desktop (regression matrix: each tab × scroll-to-bottom).
- [x] **26.** The desktop shell scroll model (body → #mainApp → panel, with the capturing scroll-repair backstop) is documented in `AGENTS.md` "Known Traps" Trap 4. (2026-07)

### 0.D — Error Handling & Observability (27–34)

- [x] **27.** All empty `catch {}` blocks now carry a justifying `/* benign: ... */` comment documenting why the failure is safe to swallow (browser drag quirks, private-mode sessionStorage, optional-module reads, detached-element focus). Zero unexplained empty catches remain. (2026-07, SW v895)
- [x] **28.** Added a global `error` + `unhandledrejection` handler (`app-shell.js`) that logs to console + a rolling `window.__bcErrors` buffer, and shows a dev toast only when a trace flag is set. Inspect via `window.bcErrors()`. (2026-07, SW v894)
- [ ] **29.** Consolidate the tracing infrastructure (`traceWristbandAction`, `traceAppAction`, shell scroll trace, ~213 lines) into ONE `js/trace.js` module with a single enable flag.
- [x] **30.** Reviewed all console output: only 8 `console.log` (all in dev-tools or already gated by `_gpDbg`/eslint-disable diagnostics), the rest are 74 `console.error` + 32 `console.warn` legitimate diagnostics that stay unconditional. Debug noise is already minimal/gated. (2026-07, SW v895)
- [x] **31.** Added `window.bcSelfCheck()` (`app-shell.js`) — aggregates the integrity check, recent `__bcErrors`, and the wristband audit into one console command that reports overall health (✅/⚠️). (2026-07, SW v900)
- [ ] **32.** Ensure every user-facing failure path shows a toast or modal — no silent returns on error.
- [ ] **33.** Audit `storageManager` fallback chain (IndexedDB → localStorage → RAM) for silent-failure paths; add telemetry counters.
- [ ] **34.** Add quota-exceeded handling verification for every large write (playbook, backups, drafts).

### 0.E — Dead Code & Bloat Reduction (35–41)

- [x] **35.** Static dead-code sweep run: 32 candidate-unused top-level functions identified (heuristic, accounting for `data-action` + dynamic `window[]` calls). Verified individually before any removal. (2026-07, SW v896)
- [x] **36.** Removed 2 confirmed-dead helpers (`_catFieldPosAliasGroup` in `playbook-identity.js`, `_paRevealLibrary` in `page-actions.js`, both 0 references). Re-wired the orphaned `showWristbandNotYetList` feature into the Wristband Actions menu instead of deleting it (its button was dropped during the toolbar cleanup). Also fixed 3 pre-existing corrupt emoji icons in the Actions config. (2026-07, SW v896)
- [ ] **37.** Split the 5 largest JS files (`play-discussion.js` 3033, `play-presentation.js` 2948, `utils.js` 2286, `tendencies.js` 2075, `app-shell.js` 1967) along clear ownership lines.
- [ ] **38.** Split `utils.js` — it mixes constants, modals, CSV parsing, and DOM helpers; separate into focused files.
- [ ] **39.** Audit `_paRevealLibrary` and other known-unused helpers flagged during the Actions Hub work; delete or wire up.
- [x] **40.** Confirmed play-signature helpers already converge on the canonical `getPlayIdentityKey()` (utils.js): `_gpPlaySignature` and `playSignature` both delegate to it; `getPlayThreadId` is intentionally separate (discussion routing). Removed 9 dead `: JSON.stringify(play)` fallbacks that would have produced divergent keys if ever reached. (2026-07, SW v899)
- [ ] **41.** Trim commented-out code blocks and stale "restored after commit X" archaeology comments once the fix is stable.

### 0.F — Data Model & Handoff Integrity (42–46)

- [x] **42.** `getPlayIdentityKey(play, mode, options)` in utils.js IS the single canonical identity function (field-list driven by `PLAY_IDENTITY_FIELDS[mode]`). `_gpPlaySignature` (gameplan mode) and `playSignature` (id-or-tag mode) delegate to it. All ad-hoc `JSON.stringify` dedup fallbacks removed. (2026-07, SW v899)
- [ ] **43.** Verify stable play identity survives every handoff (Playbook → Script → Wristband → Call Sheet → Game Plan) with a round-trip test.
- [ ] **44.** Ensure deleting/editing a play updates or flags downstream artifacts (no orphaned references in call sheet / wristband / game plan).
- [x] **45.** Audited all 71 `STORAGE_KEYS` — every key has at least one live read/write reference. No dead keys to remove. (2026-07, SW v896)
- [ ] **46.** Add a migration test harness that runs `runMigrations()` against fixtures for each `STORAGE_VERSION`.

### 0.G — Workflow, Tooling & Docs (47–50)

- [x] **47.** Expand `scripts/static-ui-audit.sh` with new checks (duplicate functions, `.panel.active` transform trap, `<details>`/`<summary>` toolbar dropdowns, `scrollIntoView` in modules) and gate them at ship time via `ship.sh`. (2026-07, SW v893)
- [x] **48.** `ship.sh` now runs the full strict audit as a pre-flight gate (duplicate functions, panel transform, details dropdowns, script-cache membership) and aborts the ship on any strict finding. (2026-07, SW v894)
- [ ] **49.** Keep `AGENTS.md` "Known Traps & Hardening Standards" current — every new class of bug fixed gets a trap entry so it never recurs silently.
- [ ] **50.** Establish a "consistency budget" dashboard: track `!important` count, `typeof` guard count, largest-file line counts, and duplicate-function count over time; require each ship to not regress them.

---

_This roadmap replaces the previous dispersed documents. Any new feature requests should be categorized and added to this file._
