# BCOffense Active Roadmap

Last updated: 2026-07-08

This is the single active work queue for BCOffense. Older roadmap files were
scanned in July 2026; completed or superseded docs were removed so we do not
keep re-reading stale checklists.

`MOBILE_AUDIT.md` remains as the detailed mobile verification matrix. Use this
file for priority and implementation order.

## Cleanup Result

Deleted as completed or superseded:

- `PLAYBOOK_SCRIPT_ROADMAP.md` - all shipped or marked N/A.
- `PLAYBOOK_MAKEOVER_ROADMAP.md` - all 28 items shipped.
- `PLAYER_AUTH_ROADMAP.md` - all 50 items shipped.
- `PLAYER_QUIZ_ROADMAP.md` - all milestones shipped; one smoke contract moved here.
- `UIUX_PERF_ROADMAP.md` - all phases shipped.
- `CALLSHEET_PAGE_ROADMAP.md` - structural split sections were stale; live work below.
- `HEADER_TOOLBAR_AUDIT.md` - active guidance folded into the command-surface track.
- `PLAYER_MOBILE_AUDIT.md` - active next slices folded into the player-mobile track.
- `SCRIPT_GAMEPLAN_INTEGRATION.md` - old shipped log plus small on-deck items folded below.
- `READINESS_REIMAGINE_ROADMAP.md` - active readiness redesign folded below.
- `SCRIPT_PAGE_ROADMAP.md` - active Script follow-up folded below.
- `REFACTOR_ROADMAP.md` - active refactor order folded below.

## Current Best Next Work

### 1. Diagram and Play Identity Hardening

Why now: the recent player Swipe View issue proved that diagram identity and
handoffs must be explicit. We already shipped stricter player-visible diagram
matching and Diagram Health. The next step is to make identity breakage harder
to reintroduce.

- [x] Player Swipe View hides ambiguous legacy diagram keys.
- [x] Playbook includes Diagram Health for ready, missing, and unsafe diagram keys.
- [x] Add shared source-identity copy helper for Script, Game Plan, and Wristband handoffs.
- [x] Add a round-trip identity check: Playbook -> Script -> Wristband -> Call Sheet -> Game Plan.
- [x] Flag downstream artifacts when a source play is edited or deleted.
- [x] Add focused fixture coverage for play IDs, `playbookId`, `sourcePlayId`, and legacy tag keys.
- [x] Document which diagram keys are player-visible versus local/legacy-only.

Diagram key contract:

- Player-visible diagrams use the source play's stable `id` / `playbookId` /
  `sourcePlayId` plus the current unique source identity key. If a local diagram
  cannot be tied to exactly one source play, players do not see it.
- Local/legacy-only diagram keys are older tag/signature matches that may still
  help a coach recover or reattach a diagram, but they are intentionally hidden
  from Player Swipe View when ambiguous.
- Downstream copies now show source status badges in Script, Wristband, Call
  Sheet, and Game Plan when their playbook source is missing or has changed.

Definition of done:

- A play with a stable ID keeps the same identity through every handoff.
- A deleted or edited play cannot silently leave stale downstream artifacts.
- Player-facing diagram lookup never falls back to an ambiguous legacy key.

### 2. Call Sheet UX and Print Finish

Current state: the old duplicate render-path warning is stale. Live render now
lives in `callsheet-render.js`; print, export, smart/scouting, layout, display,
sort, categories, metadata, picker, and game-plan drawer are already split.

Work left:

- [ ] Collapse the display-options unified bar by default on mobile.
- [ ] Add display preset quick-switch chips above the board.
- [ ] Persist the last-active display preset name as a board subtitle.
- [ ] Add a keyboard shortcut to open the picker for the focused or last category.
- [ ] Add "print what you see" for only the current front/back page.
- [ ] Add a front+back combined print flow.
- [x] Add live print selection summary for current, front, back, and front+back output.
- [ ] Add a print preview thumbnail before printing.
- [ ] Decide whether a compact density preset is worth shipping.

Definition of done:

- Call Sheet is easier to use on phones.
- Coaches can print the exact intended sheet without switching pages manually.
- The split ownership remains clear and smoke checks stay green.

### 3. Player Mobile Follow-Through

Detailed matrix: `MOBILE_AUDIT.md`.

Work left from the player mobile scan:

- [x] Add visible Player Home practice status for offline, newly published, loaded, and waiting states.
- [ ] Notifications/offline polish: opt-in, denied, and deeper notification recovery states should feel clear and non-scary.
- [ ] iPad player screenshot pass across Home, Playbook, Practice, Swipe View, Quiz, Leaderboard, and Questions.
- [ ] Player delight pass: selective motion/feedback for quiz answers, streaks, sticker awards, and ready confirmation.
- [ ] Practice/Home polish follow-up with real team data; trim repeated copy.
- [ ] Continue safe-area/body-lock QA for full-screen drawers, modal footers, coach dock, and landscape presentation controls.
- [ ] Decide whether the viewport harness becomes a required ship gate.
- [ ] Add or document manual coverage for soft-keyboard `visualViewport` resize and 200% text zoom.

Definition of done:

- Player phone and iPad flows feel like a study app, not a compressed staff app.
- Mobile regressions have repeatable checks or a clear manual QA note.

### 4. Player Quiz Experience Pass

Detailed audit: `PLAYER_QUIZ_EXPERIENCE_AUDIT.md`.

Goal: make Quiz Center feel like a fast study game instead of a metadata test.

Work left:

- [x] Add fair-question quality gates so players are not asked to guess from
  tiny or partial metadata.
- [x] Prefer diagram and formation recognition fallbacks before full call-ID
  questions.
- [x] Add easy fallback types: Diagram to Formation, Formation to Play, Play
  Type, and Study Card.
- [x] Add game modes: Quick Hits, Diagram Drill, Know Your Job, Game Plan Check,
  and Missed Plays.
- [x] Add lightweight answer feedback, streak milestones, and reward moments
  while respecting reduced-motion.
- [x] Let coaches click Thin/Needs work saved scripts and repair linked
  Playbook plays from a source-specific list.
- [ ] Split coach source readiness into fun, learning, and context readiness.
- [x] Add E2E coverage for diagram-first, formation, play-type, study-card, and
  long-choice fallback behavior.

Definition of done:

- Thin quiz sources still create fair, useful study reps.
- Diagram questions feel like a first-class mode, not a last-resort fallback.
- Players see simple challenges they want to start, and coaches can predict what
  kind of questions a source will generate.

### 5. Header and Command-Surface Standardization

Target contract:

1. Identity/status cluster: page name, opponent/week, selected object, counts, health.
2. Primary workflow actions: 2-4 top-level actions.
3. Search/filter cluster: compact search plus one filter entry point.
4. Overflow/action hub: templates, data, exports, destructive actions, rare tools.
5. Role gate: player/coach/admin commands are hidden before layout is calculated.

Migration order:

- [ ] Playbook command surface and player filters.
- [ ] Game Plan command bar cleanup on shared primitives.
- [ ] Wristband command hierarchy.
- [ ] Call Sheet command hierarchy.
- [ ] Dashboard/player portal quick actions.
- [ ] Tendencies, Installation, Identity, and Offense Builder cleanup.

Definition of done:

- Desktop command zones do not wrap into clutter at 1280px.
- Phone has one search/filter entry and one Actions entry where needed.
- Player role shows study/practice/presentation actions only.
- Admin data/storage tools are available but grouped away from daily coaching actions.

### 6. Readiness Reimagined

Goal: simplify play readiness from a complex weighted model into a clearer coach
workflow.

P0 model changes:

- [ ] Unify `reps[]` and `actionReports[]` into one `logs[]` stream.
- [ ] Simplify rep types into five intensity tiers.
- [ ] Drop `complexity` from the data model and UI.
- [ ] Collapse install status to `New`, `Installed`, and `Core`.
- [ ] Replace the confidence formula with a transparent three-part model.
- [ ] Replace five confidence labels with four tiers.

P0 UX changes:

- [ ] Replace "Add Rep" plus "Action Report" with one "Log Rep" modal.
- [x] Remove yards, manual confidence, and event checkbox clutter from new logging UI.
- [ ] Make quick-score 1-5 create a minimal log entry immediately.
- [ ] Redesign the script widget so score buttons are front-center with one CTA.
- [ ] Enlarge score buttons for touch.
- [ ] Replace weighted-rep chips with plain-language status.

P1/P2 polish:

- [ ] Add last rep result inline in the widget header.
- [ ] Animate score button selection.
- [x] Remove "Seed Sample Data" from daily coach UI.
- [ ] Redesign playbook readiness panel around the readiness score.
- [ ] Redesign history and presentation coach cards around the new log model.
- [ ] Remove dead sweet-spot/weekly-weighted/action-metrics paths after migration.

Definition of done:

- A coach can log useful readiness data in one tap or one short modal.
- The displayed score is explainable without weighted-rep math.
- Existing saved readiness data migrates or remains readable.

### 7. Startup, Refactor, and Ownership

Current large JS files from the scan:

- `js/script-render.js` - 6105 lines.
- `js/play-discussion.js` - 3050 lines.
- `js/play-presentation.js` - 2989 lines.
- `js/utils.js` - 2455 lines.
- `js/app-shell.js` - 2215 lines.
- `js/dashboard-render.js` - 2078 lines.
- `js/tendencies.js` - 1997 lines.
- `js/callsheet.js` - 1832 lines.

Work left:

- [x] Add a local stress seed audit for large playbooks, saved scripts, wristbands, call sheets, game plans, player data, and role/viewport loading checks.
- [x] Add local E2E viewport matrix commands for desktop, phone, and iPad runs.
- [x] Add local backup/restore integrity E2E coverage for playbook plus downstream artifacts.
- [x] Add local source-identity E2E coverage for edited/deleted playbook sources.
- [ ] Use stress-audit reports to prioritize the highest-impact loading, overflow, touch-target, and console-error fixes.
- [ ] Defer non-critical dashboard, tendencies, and remaining callsheet setup until first use.
- [ ] Reduce unrelated responsibilities still owned by `utils.js`.
- [ ] Measure large-script render and filter hotspots before optimizing `script-render.js`.
- [ ] Reduce broad `innerHTML` rebuilds for small Script state changes.
- [ ] Choose the next product-value split between `tendencies.js` and `installation.js`.
- [ ] Verify split-file ownership claims by grepping for the functions each file claims to own.
- [ ] Audit intentional `window.X =` exports and document the real public globals.
- [ ] Establish helper naming conventions by module prefix.

Definition of done:

- Boot does less work before the active tab is usable.
- File ownership is obvious from names, load order, and smoke contracts.
- New features do not land in `utils.js` or another catch-all file by default.

### 8. CSS and Layout Debt

Current `!important` hotspots from the scan:

- `css/print.css` - 381.
- `css/wristband.css` - 116.
- `css/components.css` - 111.
- `css/script.css` - 21.
- `css/callsheet.css` - 18.
- `css/gameplan.css` - 16.

Work left:

- [ ] Reduce `wristband.css` `!important` count by fixing source order and selectors.
- [ ] Categorize global `!important` usage as utility override versus specificity war.
- [ ] Standardize pinned-zone plus scroll-zone layout across Call Sheet, Wristband, Tendencies, and Dashboard.
- [ ] Audit sticky positioning inside panels.
- [ ] Consolidate duplicated responsive breakpoints and document the canonical set.
- [ ] Verify dark-mode token coverage on every module.
- [ ] Continue extracting shared card/panel/toolbar patterns into `components.css`.

Definition of done:

- Layout behavior is driven by shared primitives instead of per-page overrides.
- CSS changes become less likely to create mobile or print regressions.

### 8. Script and Game Plan Handoff Polish

Old shipped Game Plan integration is mostly complete. Remaining product polish:

- [ ] Add a clear Script editing affordance for plays sourced from the active Game Plan.
- [ ] Preserve board/JV context when a Game Plan play is pushed into Script.
- [ ] Make game-plan-origin filters obvious in Script and Playbook.
- [ ] Add manual acceptance coverage: build board, push to Script, edit, and confirm origin/context survives.

Definition of done:

- A coach can tell which Script plays came from the Game Plan.
- Editing a Script play does not erase important board/JV context.

## Completed Product Tracks

### Player Quiz

- [x] Define quiz as its own player workflow, not just a button inside Practice.
- [x] Keep the existing Practice-tab quiz path working while the Quiz Center grows.
- [x] Add formal coach/admin quiz settings for question mix, scoring weights, goals, tiers, eligible sources, and reward rules.
- [x] Add editable tier names for Champion, Baller, Starter, Contributor, and Defense.
- [x] Add server-backed attempts, rewards, stickers, and team leaderboard sync.
- [x] Add player profile detail, weak areas, reward history, and recent activity.
- [x] Add mobile/WebKit coverage for the shipped quiz slices.

### Player Auth and Portal

- [x] Local login experience includes compact player-first UX, longer player sessions, role preselection, dark mode, and loading skeletons.
- [x] Player Home has greeting, recent practice, quick actions, ready confirmation, MOTD, notifications, and team branding.
- [x] Player mobile interactions include tab swipe, haptic feedback where supported, refresh-on-resume, A2HS prompt, offline indicator, and pull-to-refresh.

### Playbook and Script Makeover

- [x] Playbook toolbar density, accessibility, stats, filters, collections, and report ownership were cleaned up.
- [x] Playbook analytics report engines were split out of chrome ownership.
- [x] Type-chip colors and dark-mode contrast were standardized.
- [x] Script timeline and health helpers were split from `script-render.js`.
- [x] Shared empty-state and filter-active patterns are in place.

### UI/UX Performance

- [x] Heavy blur usage reduced.
- [x] Drag/render performance and modernization phases shipped.
- [x] Cross-app consistency and dead CSS/bloat cull phases shipped.

## Ship Guardrails

- Run `node scripts/smoke-check.js` before committing app changes.
- Run `node scripts/cleanup-audit.mjs` for action/declarative/asset ownership changes.
- Keep `index.html` asset query strings and `sw.js` `CACHE_NAME` aligned.
- If a new JS/CSS asset is added, update `index.html` and `sw.js`.
- All persistent data goes through `storageManager` and `STORAGE_KEYS`.
- All interactive UI uses delegated `data-action`, `data-oninput`, or `data-onchange`.
- Use `escapeHtml()` for user-provided text in template literals.
- Cloudflare deploys should use `scripts/deploy-cloudflare.sh`.
