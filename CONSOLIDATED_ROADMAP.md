# BCOffense Active Roadmap

Last updated: 2026-07-13

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

### 0. Playbook Data Quality, Media, and Signal Collection

Why now: play identity, clean vocabulary, diagrams, clips, and signals are all
part of the same coach-to-player handoff. If these are treated separately,
small naming inconsistencies and media gaps keep leaking into Script, Playbook,
Wristband, and player study workflows.

Data normalization policy:

- [x] Keep stored playbook text human-readable instead of forcing every field to
  all caps at write time.
- [x] Add canonical compare keys for routing, duplicate detection, matching, and
  analytics: trim whitespace, collapse punctuation/hyphens, ignore case, and
  strip accents.
  - Added shared canonical compare helpers while preserving exact stored identity strings for readable play names and stable saved data.
  - Wired canonical keys through call sheet duplicate keys, playbook health duplicates, cleanup similarity normalization, wristband highlighting, Script usage, Script integrations, and Game Plan wristband matching.
- [ ] Add an optional display setting for uppercase call rendering where a coach
  wants a uniform look on print/player views.
- [x] Add a bulk "standardize selected field" cleanup action that applies the
  most common capitalization/spelling variant after review.
  - The Playbook cleanup modal now detects canonical variants for the selected field, previews row counts, lets coaches choose the readable standard, and applies after confirmation.

Cleanup intelligence:

- [x] Fuzzy cleanup suggestions compare case-insensitive values.
- [x] Fuzzy cleanup suggestions understand punctuation/hyphen/connected-word
  variants and one-letter misses.
- [x] Add one-click merge from a health issue into the field cleanup panel with
  the suspected variants prefiltered.
- [x] Add preview counts before applying any bulk rename.

Diagram/media workflow:

- [x] Allow image and clip selection while creating a new play; attach/upload the
  pending media after the play is saved.
- [x] Presentation diagrams already trim whitespace to the drawn content with a
  buffer and fit to the screen aspect ratio.
- [ ] Reuse smart-crop rendering for Playbook cards, editor previews, and any
  player-facing diagram view that still uses raw `<img>` containment.
- [ ] Add a small "fit: full / smart crop" control if coaches need to inspect
  edge labels that the cropper considers whitespace.

Signal collection roadmap:

Core concept: Signals are short component-level clips, not play-level clips. A
single signal for `motion: Jet` should automatically resolve for every play
that uses Jet motion. Signal matching must use the canonical compare keys from
the data-quality work so labels can stay readable while matching remains stable.

Signal categories:

- `CORE`: personnel, formation, play name, base play.
- `TAGS`: form tag 1/2, play tag 1/2, one-word call.
- `BLOCKING`: protection, line call, back, under.
- `MOTIONS`: shift, motion.

Phase 0 - data and media architecture:

- [x] Define `SIGNAL_COMPONENTS` with category, component type, source playbook
  fields, label, and canonical compare-key behavior.
- [x] Define the stored signal record shape:
  `id`, `category`, `componentType`, `componentValue`, `compareKey`,
  `clipKey`, `durationMs`, `visibility`, `createdBy`, `updatedAt`, and
  optional notes.
- [x] Decide the media namespace before implementation. Recommended first pass:
  reuse the existing remote clip upload path, but store signal media under a
  separate `signals/{componentType}/{compareKey}` namespace so permissions,
  retention, and cleanup can diverge later.
- [x] Enforce short clips under 5 seconds at upload/attach time, with a clear
  coach-facing error when clips are too long.

Phase 1 - dedicated Signals tab:

- [x] Create a top-level Signals tab available to athletes, coaches, and admins.
- [x] Render the four category groups: `CORE`, `TAGS`, `BLOCKING`, `MOTIONS`.
- [x] Build chips from real playbook vocabulary for each component type, using
  canonical compare keys to group variants while displaying the chosen readable
  value.
- [x] Let coaches/admins click a chip to open a signal detail panel with upload,
  preview, replace, delete, notes, and visibility controls.
- [x] Let players view only signal clips that are visible/published; no editing
  controls.

Phase 2 - play resolution:

- [x] Add a resolver that takes a play and returns matching signal records by
  component, grouped under `CORE`, `TAGS`, `BLOCKING`, and `MOTIONS`.
- [ ] Add a Playbook detail surface for "Signals for this play" that shows only
  components with signal clips attached.
- [ ] Keep empty states quiet: if no signals exist for a play, the play detail
  should not feel broken or unfinished.

Phase 3 - Practice Script and Swipe View integration:

- [ ] Add a small `Signals` button to Practice Script play rows/cards when the
  current play resolves at least one signal.
- [ ] Add the same signal selector to Script Swipe View / presentation-style
  study views so athletes can open signals while studying the current play.
- [ ] The selector should show grouped chips by `CORE`, `TAGS`, `BLOCKING`, and
  `MOTIONS`; tapping a chip plays the very short clip.
- [ ] Keep the main play view clean. Signals should open in a compact selector,
  drawer, or lightweight modal rather than occupying permanent space.

Phase 4 - player study extensions:

- [ ] Add signal availability to player-facing play detail and current-practice
  study surfaces.
- [ ] Add future quiz hooks so players can be asked to identify the signal for a
  motion, tag, formation, or play name.
- [ ] Add simple coach/admin coverage reporting: components with signals,
  components missing signals, and most-used play components without clips.

First build slice:

- [x] Ship `MOTIONS` first in the new Signals tab because motion signals are
  easy for athletes to understand, high value in practice, and a clean proof of
  the component-level model.
- [x] Use one upload/preview path and one play-resolution entry point before
  expanding into Script and Playbook surfaces.

Definition of done:

- Coaches can clean data without losing the original readable play names.
- New plays can be created with diagrams/clips in one pass.
- Signal clips are searchable by component and visible from a play without
  duplicating media per play.

### 0A. Cloud Sync and Restore Modernization

Why now: Cloud Sync was built around an older restore model. The app now has
role-aware startup, richer dashboard surfaces, IndexedDB-backed playbook data,
player-visible media, and in-memory workspace hydration. Pulling from cloud
should feel like entering a refreshed team workspace, not like a low-level
backup utility.

- [x] Manual Cloud Sync pull refreshes the workspace and lands on Dashboard.
- [x] Player fresh-device login uses automatic team refresh and Dashboard/Home
  fallback instead of exposing the staff Cloud Sync pull modal.
- [x] Add a startup coordinator so first render, auth restore, cloud refresh,
  service-worker update checks, clip index warming, and diagram key scans do not
  all fire independently.
- [x] Suppress Cloud autosave during boot, restore, and startup normalization so
  playbook ID backfills or restored state do not look like coach-initiated
  uploads.
- [ ] Replace the backup-style modal copy with a clearer "Team Workspace Sync"
  flow that separates Push, Pull, and Last Updated state.
- [ ] Show a post-pull summary on Dashboard with counts for playbook, scripts,
  call sheets, wristbands, game plans, diagrams, clips, and player data.
- [ ] Add stale/local-conflict warnings before replacing a device that has newer
  local edits.
- [ ] Add a lightweight sync activity log so coaches can see who pushed/pulled
  and when.
- [ ] Decide whether auto-pull should stay silent or become an explicit
  "new workspace update available" banner for staff devices.

Definition of done:

- Coaches understand what data will change before a pull.
- A successful pull lands in a useful review surface.
- Cloud Sync reads as a team-workspace workflow, not a raw backup restore.

### 0B. Player App Update Reliability

Why now: athletes are reporting that after login they sometimes still see old
practice content or old app behavior. That can come from two different places:
the team data sync pipeline or the PWA/service-worker app shell cache. We need a
clear update experience that makes both visible.

- [x] Add an explicit waiting-service-worker update path so new app versions do
  not sit idle until a tab fully closes.
- [x] Auto-apply app-shell updates for player sessions when there is no dirty
  workspace state.
- [x] Add a player-facing "Checking for team updates" state on login/dashboard
  that distinguishes app version updates from practice-data updates.
- [x] Add a visible "Updated at" / "Practice version" marker on Player Home.
- [x] Add a coach-side publish status showing when player-visible scripts,
  diagrams, clips, and quiz sources were last changed.
- [x] Add a manual "Refresh team app" action for players that updates the app
  shell and re-renders player data without requiring them to know browser cache
  steps.
- [x] Defer automatic service-worker update checks until after first visible
  render so clean player sessions can update without racing the initial data
  refresh.
- [x] Add a diagnostic tile for admins showing current app cache version,
  service-worker state, last cloud pull, and last player publish time.

Definition of done:

- Players can reliably get the newest app shell and newest published team data.
- Coaches can tell whether a report is a cache/app-version issue or a data
  publish/sync issue.
- Updating does not interrupt coaches with unsaved local work.

### 0C. Notifications, Comments, and Player Alerts

Why now: scripts, quiz availability, play discussions, and coach replies now
span several player-facing surfaces. Athletes need useful alerts when new team
work is available, and coaches/admins need one reliable place to see player
comments and questions instead of missing them inside individual plays.

- [ ] Add a unified notification inbox for coaches/admins covering player play
  comments, questions, replies, quiz completions, rewards, and moderation items.
- [x] Add a coach/admin Dashboard player inbox for open player questions and
  recent player comments on play discussion threads.
- [x] Add player notifications for newly published scripts, newly available or
  unlocked quizzes, coach replies, approved discussion replies, clips/diagrams
  added to assigned plays, and team announcements.
- [x] Add unread counts/badges that roll up from play discussion threads into
  Dashboard, Playbook, Script, and Game Plan surfaces.
- [x] Add a coach review queue for player comments on plays so comments cannot
  disappear inside a play drawer.
- [x] Add notification preference and delivery-state UI for players: allowed,
  blocked, quiet/offline, and last checked.
- [x] Include notification sync status in the player update/freshness experience
  so athletes know whether alerts are current on their device.

Definition of done:

- Coaches can see and respond to player comments/questions from one inbox.
- Players get clear alerts for new scripts, quiz work, replies, and important
  media updates.
- Notification state is visible enough to tell app-cache, sync, and permission
  problems apart.

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
- [x] Make manual diagram sync preflighted and scoped, with a recommended
  player-visible sync path instead of immediately pushing every local diagram.

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
- [x] Split coach source readiness into fun, learning, and context readiness.
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

- [x] Script command surface style pass: stop toolbar/action-button overflow and
  add a smoke-check style contract for the Script page controls.
- [x] Playbook command surface and player filters: stabilize top controls,
  drawer actions, and player filter pills with a smoke-check style contract.
- [x] Game Plan command bar cleanup on shared primitives: stabilize the
  identity/actions row and filter toolbar with a smoke-check style contract.
- [x] Wristband command hierarchy: stabilize builder actions, Player Card
  controls, card tabs, and batch edit controls with a smoke-check style
  contract.
- [x] Call Sheet command hierarchy: stabilize the primary toolbar, quick-action
  groups, and sideline-mode exit controls with a smoke-check style contract.
- [x] Dashboard/player portal quick actions: stabilize coach dashboard commands,
  quick links, schedule/game-plan action rows, cleanup actions, and player quick
  action cards with a smoke-check style contract.
- [x] Tendencies, Installation, Identity, and Offense Builder cleanup: stabilize
  low-traffic command rows, action clusters, report controls, and builder
  filters with a smoke-check style contract.

Definition of done:

- Desktop command zones do not wrap into clutter at 1280px.
- Phone has one search/filter entry and one Actions entry where needed.
- Player role shows study/practice/presentation actions only.
- Admin data/storage tools are available but grouped away from daily coaching actions.

### 6. Readiness Reimagined

Goal: simplify play readiness from a complex weighted model into a clearer coach
workflow.

P0 model changes:

- [x] Unify `reps[]` and `actionReports[]` into one `logs[]` stream.
- [x] Simplify rep types into five intensity tiers.
- [x] Drop `complexity` from the data model and UI.
- [x] Collapse install status to `New`, `Installed`, and `Core`.
- [x] Replace the confidence formula with a transparent three-part model.
- [x] Replace five confidence labels with four tiers.

P0 UX changes:

- [x] Replace "Add Rep" plus "Action Report" with one "Log Rep" modal.
- [x] Remove yards, manual confidence, and event checkbox clutter from new logging UI.
- [x] Make quick-score 1-5 create a minimal log entry immediately.
- [x] Redesign the script widget so score buttons are front-center with one CTA.
- [x] Enlarge score buttons for touch.
- [x] Replace weighted-rep chips with plain-language status.

P1/P2 polish:

- [x] Add last rep result inline in the widget header.
- [x] Animate score button selection.
- [x] Remove "Seed Sample Data" from daily coach UI.
- [x] Redesign playbook readiness panel around the readiness score.
- [x] Redesign history and presentation coach cards around the new log model.
- [x] Remove dead sweet-spot/weekly-weighted/action-metrics paths after migration.

Definition of done:

- A coach can log useful readiness data in one tap or one short modal.
- The displayed score is explainable without weighted-rep math.
- Existing saved readiness data migrates or remains readable.

### 7. Startup, Refactor, and Ownership

Current large JS files from the scan:

- `js/script-render.js` - 7187 lines.
- `js/play-discussion.js` - 3050 lines.
- `js/play-presentation.js` - 2989 lines.
- `js/utils.js` - 2469 lines.
- `js/dashboard-render.js` - 2399 lines.
- `js/app-shell.js` - 2376 lines.
- `js/tendencies.js` - 1997 lines.
- `js/callsheet.js` - 1860 lines.

Work left:

- [x] Add a local stress seed audit for large playbooks, saved scripts, wristbands, call sheets, game plans, player data, and role/viewport loading checks.
- [x] Add local E2E viewport matrix commands for desktop, phone, and iPad runs.
- [x] Add local backup/restore integrity E2E coverage for playbook plus downstream artifacts.
- [x] Add local source-identity E2E coverage for edited/deleted playbook sources.
- [x] Use stress-audit reports to prioritize the highest-impact loading, overflow, touch-target, and console-error fixes.
- [x] Defer non-critical dashboard, tendencies, and remaining callsheet setup until first use.
- [x] Reduce unrelated responsibilities still owned by `utils.js`.
- [x] Measure large-script render and filter hotspots before optimizing `script-render.js`.
  - 2026-07-13 `npm run stress:script-perf`: 900-play playbook, 96-play script, 8 periods, 12 render samples.
  - Hotspots measured: full Script render averaged 534.29ms, with `contentMs` at 477.18ms; available-play all-plays rebuild took 270.5ms for 900 plays / 50 rendered rows.
- [x] Reduce broad `innerHTML` rebuilds for small Script state changes.
  - Selection-only changes now update checkbox state and `.bulk-selected` row styling directly instead of re-rendering the full Script list on clear/select-all shortcuts.
  - Bulk field edits still use the full render path because they mutate multiple play rows; next optimization should target `renderScriptContent()` row rebuilds.
- [x] Choose the next product-value split between `tendencies.js` and `installation.js`.
  - Decision: split `tendencies.js` next, not `installation.js`.
  - First target: extract a `js/tendencies-intel.js` module for the shared scout-intel engine: `queryTendencies()`, `getTendenciesForCategory()`, `scorePlayForSituation()`, and closely related situation/scoring helpers.
  - Reason: `installation.js` is already relatively small with render/print extracted; `tendencies.js` still owns cross-module intelligence consumed by Call Sheet, Game Plan, Dashboard, Script shared surfaces, and Tendencies reports.
- [x] Verify split-file ownership claims by grepping for the functions each file claims to own.
  - `Owns:` comments now use backticked top-level symbols, and smoke verifies each claimed function/constant is declared in the same split file.
  - Covered current split ownership headers in call sheet, tendencies render, and installation render files.
- [x] Audit intentional `window.X =` exports and document the real public globals.
  - Added a smoke-checked `window-export-manifest` in `AGENTS.md` covering all direct `window.X =` assignments in `js/*.js`.
  - New exports now require explicit documentation instead of silently expanding the browser-global surface.
- [x] Establish helper naming conventions by module prefix.
  - Added a smoke-checked `module-prefix-manifest` to `AGENTS.md` covering JS public actions, module-private helpers, shared utility exceptions, and CSS module prefixes.

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

- [x] Fix Script page action buttons that overflow or look cramped in the workbench, library rail, toolbar, and tools drawer.
  - Script buttons now wrap within their containers, keep `min-width: 0`, and smoke verifies the key overflow-safe selectors.
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
