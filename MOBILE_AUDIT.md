# Mobile Responsiveness Action Checklist

This checklist converts the mobile audit into work items we can execute and verify. Use the item IDs in commits, notes, and follow-up requests.

## Status Legend

- `[ ]` Not started
- `[~]` In progress or partially complete
- `[x]` Complete in current working tree
- `[!]` Blocked by an external tool, credential, or unrelated repo contract

## Working Rules

- Prefer one shared shell contract over page-specific breakpoint patches.
- Preserve existing player portal behavior unless the item explicitly changes it.
- For phone staff workflows, design for sideline use rather than compressing the desktop editor.
- Every completed item needs at least one static check, smoke-check assertion, or viewport/browser verification.
- When full smoke remains red for unrelated contracts, record the local verification separately.

---

## Next Heavy Hitters

_All heavy hitters complete._ Remaining presentation polish lives in `M-042`
(Projector Clean View, Wake Lock, detail panel, telestrator — P1).

---

## Attached Comprehensive Audit Mapping

The attached implementation brief is now mapped into this checklist as:

- Already covered or partially covered:
  - Responsive device contract: `M-010`, `M-023`.
  - Scroll ownership: `M-011`.
  - Shared layer/body lock: `M-012`.
  - Touch targets/accessibility baseline: `M-013`, `M-015`, `M-051`.
  - Practice Script phone run mode: `M-030`, `M-031`.
  - Player read-only script portal: `M-031A`.
  - Call Sheet phone cards: `M-032`.
  - Wristband phone editor: `M-033`.
  - Playbook phone sheets: `M-034`.
  - Defensive tendencies mobile layout: `M-035`.
  - Game Plan mobile hierarchy: `M-036`.
  - Dashboard role layouts: `M-037`.
  - Viewport harness: `M-050`, `M-051`.
- Added from the attached brief:
  - `M-041` true iPad presentation / PWA / fullscreen fallback.
  - `M-042` presentation setup, projector clean view, Wake Lock, and optional telestrator.
  - `M-052` expanded role/page/mobile regression matrix.

---

## Phase 0 - Baseline From First Pass

### M-001 - Shell chrome measurement

- Status: `[x]`
- Priority: P0
- Files: `js/app-shell.js`
- Work:
  - Added measured `headerHeight`, `tabsHeight`, and `coachDockHeight` to mobile shell state.
  - Added `ResizeObserver` for `.app-header`, `.tabs`, and `#mobileCoachDock`.
  - Added measured sync so CSS vars update when auth role, labels, or dock height changes without a viewport resize.
- Acceptance:
  - `--app-header-height`, `--app-tabs-height`, and `--coach-dock-height` update after role/navigation chrome changes.
  - Shell state cache includes measured chrome heights.
- Verification:
  - `node --check js/app-shell.js`
  - `node scripts/smoke-check.js` reaches `syntax ok` and `cache busters ok`.

### M-002 - Login short-screen and keyboard behavior

- Status: `[x]`
- Priority: P0
- Files: `js/auth.js`, `css/components.css`
- Work:
  - Added keyboard-open tracking on the login overlay.
  - Added focused login field `scrollIntoView({ block: "center" })` after focus, error expansion, and visual viewport changes.
  - Added `body.is-short-screen` and `.auth-login-overlay.is-keyboard-open` CSS rules.
  - Short/keyboard screens now hide the hero, start-align the card, and reduce vertical decoration.
- Acceptance:
  - Login card does not center itself above the reachable viewport on short landscape screens.
  - Focused username/password remains visible after keyboard resize and after failed-login error text.
- Verification:
  - `node --check js/auth.js`
  - CSS brace check for `css/components.css`
  - Needs device/browser visual QA.

### M-003 - Player phone header touch targets

- Status: `[x]`
- Priority: P1
- Files: `css/responsive.css`
- Work:
  - Restored player phone `.header-action-btn` to `44px` width, min-width, and height.
  - Raised player phone auth badge hit height to `44px`.
- Acceptance:
  - No standalone player header action is below `44x44` CSS pixels on phone.
- Verification:
  - Static smoke-check assertion added.
  - Needs viewport screenshot at 320px and 390px.

### M-004 - Auth session syntax/expiry repair

- Status: `[x]`
- Priority: P0
- Files: `js/auth.js`
- Work:
  - Closed the expired-session branch in `loadStoredAuthUser()`.
  - Expired stored sessions now clear and return `null`.
- Acceptance:
  - `js/auth.js` parses cleanly.
  - Expired non-local stored sessions do not fall through into nested runtime declarations.
- Verification:
  - `node --check js/auth.js`
  - Full smoke now reaches all contract checks instead of failing on auth syntax.

### M-005 - Regression guards and cache bump

- Status: `[x]`
- Priority: P1
- Files: `scripts/smoke-check.js`, `index.html`, `sw.js`
- Work:
  - Added static smoke assertions for shell observers, keyboard-aware login, and `44px` player header controls.
  - Bumped app asset query strings and service worker cache to `v714`.
- Acceptance:
  - Future edits cannot silently remove these first-pass mobile fixes.
  - Updated PWA cache serves changed CSS/JS.
- Verification:
  - `cache busters ok (v714)`
  - HTTP check on `http://127.0.0.1:5177/index.html`

---

### M-006 - Editor form-field sanitizer regression

- Status: `[x]`
- Priority: P0
- Files: `js/dom-helpers.js`
- Work:
  - `sanitizeHTML()` listed `input`, `select`, and `textarea` in `DANGEROUS_TAGS`, so every panel rendered through `setInnerHTML()` lost its form controls (Play editor, readiness panel, etc.). Symptom: new/edit play fields disappeared and could not be typed in.
  - Removed those three tags from the strip list — they are not script-execution vectors. `script`, `style`, `iframe`, `object`, `embed`, `link`, `base`, `meta`, `form`, `on*` handlers, and `javascript:` URLs stay blocked.
- Acceptance:
  - Play editor renders all `#pe-*` inputs/selects/textareas and accepts typing.
  - No new XSS surface: scripts/styles/frames and event-handler attributes remain stripped.
- Verification:
  - `node --check js/dom-helpers.js`
  - Headless check: new-play editor renders fields and `#pe-play` accepts typed input.

---

### M-007 - Sticky toolbars float/overlap the global chrome

- Status: `[x]`
- Priority: P0
- Files: `css/script.css`, `css/dashboard.css`
- Work:
  - Module sub-toolbars used hardcoded sticky offsets (`.play-list` `top: 78px`, `.script-toolbar` `top: 110px`, `.dash-opponent-bar` `top: 78px`) that did not match the measured `--app-header-height` + `--app-tabs-height`. On phones/tablets these bars tucked under or floated detached from the pinned tab bar.
  - Switched all three to the canonical `calc(var(--app-header-height, 52px) + var(--app-tabs-height, 44px) + 8px)` pattern already used by wristband, gameplan, and the player sticky bar. Also tied the `.play-list` rail height to the same measured chrome.
- Acceptance:
  - Sticky module toolbars pin flush beneath the header + tab bar on all viewports — no gap, no overlap.
- Verification:
  - Sticky-top audit: only `.app-header` (top:0) and panel-internal `thead`/headers remain on fixed offsets; all viewport-pinned chrome derives from measured vars.

---

- Files: `js/app-shell.js`, `css/responsive.css`, page CSS as needed
- Work:
  - `[x]` Define canonical classes/data states:
    - `shell-phone`: usable width <= 560
    - `shell-compact`: usable width <= 768
    - `shell-tablet`: usable width <= 1024 or touch-tablet heuristic
    - `shell-short`: visual viewport height <= 620
    - orientation as a secondary modifier
  - `[x]` Expose state as both classes and `body.dataset` values.
  - `[x]` Keep compatibility aliases until page CSS is migrated.
  - `[x]` On mobile with no stored playbook, open the navigable app shell instead of stranding users on the upload/setup screen.
  - `[x]` Add canonical display-mode state:
    - `data-display-mode="browser|standalone|fullscreen|minimal-ui|window-controls-overlay"`
    - `data-device="phone|tablet|desktop"`
    - `data-orientation="portrait|landscape"`
    - `data-presentation="true|false"`
    - `data-fullscreen-api="true|false"`
    - `data-ipados="true|false"`
  - `[~]` Audit current `is-mobile-screen`, `is-phone-screen`, `is-compact-screen`, and `is-short-screen` usage.
  - `[ ]` Migrate page CSS to canonical shell classes in focused page batches.
- Acceptance:
  - One function owns responsive classification.
  - Page CSS targets shell classes instead of recreating device logic where possible.
  - Split-screen tablet, landscape phone, and DevTools simulation produce predictable states.
- Verification:
  - Static checks for canonical class generation.
  - `node scripts/mobile-viewport-check.mjs --roles=admin,coach,player --viewports=320x568,390x844,568x320,820x1180 --warn-only --no-screenshots`
  - `node scripts/mobile-viewport-check.mjs --roles=admin,coach,player --viewports=320x568,390x844,568x320 --warn-only`

### M-011 - Explicit scroll ownership model

- Status: `[x]`
- Priority: P0
- Files: `css/responsive.css`, `css/script.css`, `css/components.css`, `css/callsheet.css`, `css/wristband.css`, `js/app-shell.js`
- Work:
  - `[x]` Expose active scroll ownership on `body.dataset.scrollOwner`.
  - `[x]` Set mobile shells to document/body vertical scroll and desktop shells to panel/workbench scroll.
  - `[x]` Add viewport harness assertion that phone roles report `scrollOwner="document"`.
  - `[x]` Define scroll ownership per shell mode:
    - Phone normal pages: document/body owns vertical scroll.
    - Desktop workbench pages: panel/workbench owns scroll.
    - Blocking modal/drawer: layer owns scroll; body locked (`scrollOwner="layer"`).
    - Tables: horizontal scroll only inside approved wrappers.
  - `[x]` Add shell classes or attributes for active scroll mode.
    - `app-shell.js` yields `scrollOwner` to `"layer"` while `body.app-layer-locked` is set.
    - `dom-helpers.js` `lockBodyForLayer()`/`unlockBodyForLayer()` set and restore `scrollOwner`.
  - `[x]` Remove competing page/body/internal scroll rules where they fight.
    - `#mainApp` and panels are `overflow: visible` on phone; document owns vertical scroll.
    - Browser scroll-ancestry probe confirms a single vertical owner per phone tab (Playbook, Script, Wristband, Call Sheet, Tendencies, Game Plan, Dashboard); no panel-level container competes with document scroll.
- Acceptance:
  - No page has two vertical scroll owners in the same mode.
  - Bottom content is not hidden behind player nav or coach dock.
  - Orientation change does not strand content out of reach.
- Verification:
  - `node scripts/mobile-viewport-check.mjs --roles=admin,coach,player --viewports=320x568,390x844,568x320,820x1180 --warn-only --no-screenshots` (12/12 OK).
  - `node scripts/smoke-check.js` adds `checkScrollOwnershipContract` → `scroll ownership contract ok`.
  - Targeted Script phone probe verified `scrollOwner="document"` at 390x844.
  - `mobile-viewport-check.mjs` now runs a per-tab scroll-ancestry probe on phone roles (`probeTabsScrollOwnership`) that flags any tab where the document scrolls while an unapproved panel-level container also owns vertical scroll (`scrollConflict` gate). Full matrix reports zero conflicts across Playbook, Script, Wristband, Call Sheet, Tendencies, Game Plan, and Dashboard.

### M-012 - Shared layer/body lock utility

- Status: `[x]`
- Priority: P0
- Files: `js/dom-helpers.js` or new shared file, `js/app-events.js`, modal/drawer callers, `css/components.css`
- Work:
  - `[x]` Create `openLayer()` / `closeLayer()` utility.
  - `[x]` Save body scroll Y and restore it on close.
  - `[x]` Apply a body lock class.
  - `[x]` Trap focus and return focus.
  - `[x]` Prevent background `touchmove`.
  - `[x]` Account for safe-area padding.
  - `[x]` Enforce one active blocking layer at a time.
  - `[x]` Move Play Presentation overlay onto shared body lock.
  - `[x]` Migrate Playbook, Call Sheet, Wristband, Script tools, command palette, and custom modal callers.
    - `[x]` Call Sheet display panel (`#csDisplayPanel`).
    - `[x]` Call Sheet game plan drawer (`#gpDrawer`).
    - `[x]` Wristband cell popup (`#cellPopupOverlay`).
    - `[x]` Script tools drawer (`#scriptToolsDrawer`).
    - `[x]` Command palette (`#commandPaletteOverlay`).
    - `[x]` Help panel (`#helpOverlay`).
    - `[x]` Call Sheet sort modal (`#csSortOverlay`) and layout modal (`#csLayoutOverlay`).
    - `[x]` Call Sheet print modal, Game Plan print modal, and Print Studio (`#printStudioOverlay`).
- Acceptance:
  - Opening a blocking layer prevents background scroll.
  - Closing restores scroll and focus.
  - Layer footer/header respect safe areas.
- Verification:
  - Static smoke checks for API existence, body lock class, touch suppression, safe-area class, and presentation overlay hook.
  - Headless body-lock probe: display panel, game plan drawer, script tools drawer, and command palette each add `app-layer-locked` on open and clear it on close with no page errors.
  - Browser checks for login, command palette, call sheet drawer, wristband popup, script tools drawer.

### M-013 - Mobile touch-target guardrail

- Status: `[~]`
- Priority: P1
- Files: `css/responsive.css`, page CSS, `scripts/smoke-check.js`
- Work:
  - `[x]` Standardize primary standalone mobile controls at `44x44`.
  - `[x]` Expand shared quick-tool, help-close, header, and mobile `.btn-xs` hit areas.
  - `[x]` Add runtime assertion for visible phone controls through `scripts/mobile-viewport-check.mjs`.
  - `[ ]` Expand page-specific exceptions/fixes after full all-role/all-viewport run.
- Acceptance:
  - Standalone buttons/icons are at least `44x44` on phone.
  - Inline text links are documented exceptions.
- Verification:
  - `node scripts/mobile-viewport-check.mjs --roles=admin,coach,player --viewports=320x568,390x844,568x320,820x1180 --warn-only --no-screenshots`
  - Quick pass is clean for Admin, Coach, and Player at 320x568, 390x844, 568x320, and 820x1180.

### M-014 - Development horizontal overflow detector

- Status: `[x]`
- Priority: P1
- Files: `js/app-shell.js` or `js/dom-helpers.js`, `scripts/smoke-check.js`
- Work:
  - `[x]` Add dev-only helper to scan visible elements whose rect exceeds viewport by more than 1px.
  - `[x]` Exclude approved wrappers such as table scrollers and intentionally scrollable rails.
  - `[x]` Run after shell sync when `localStorage.bcMobileOverflowTrace = "1"` or `window.BC_MOBILE_OVERFLOW_TRACE = true`.
- Acceptance:
  - `window.bcDebugMobileOverflow()` reports actionable selectors.
  - No false positives for approved horizontal-scroll wrappers.
- Verification:
  - Static smoke assertion for helper and approved exclusion list.
  - Manual debug command: `bcDebugMobileOverflow()`.

### M-015 - Reduced motion and safe-area pass

- Status: `[~]`
- Priority: P1
- Files: `css/components.css`, `css/responsive.css`, page CSS
- Work:
  - `[x]` Disable login, drawer, pulse, and active-tab animations under `prefers-reduced-motion: reduce`.
  - `[x]` Add smoke coverage for the global reduced-motion guardrail.
  - `[ ]` Extend safe-area padding to full-screen drawers, modal footers, coach dock, and landscape presentation controls.
- Acceptance:
  - Reduced-motion users do not get nonessential motion.
  - Close buttons and action footers are reachable around notches/home indicators.
- Verification:
  - `node scripts/smoke-check.js` checks the global reduced-motion guardrail.
  - Safe-area work still needs manual or browser screenshots on notched phone profiles.

---

## Phase 2 - Auth And Role-Specific Mobile Products

### M-020 - Mobile capability matrix

- Status: `[ ]`
- Priority: P1
- Files: `MOBILE_AUDIT.md`, then code files per matrix result
- Work:
  - Define which capabilities belong to each mobile role:
    - Player phone: consume, navigate, study.
    - Coach phone: run practice, reorder lightly, score reps, add quick notes, publish.
    - Admin phone: emergency settings/account tasks.
    - Tablet staff: near-full editing.
  - Audit all mobile-hidden controls against this matrix.
- Acceptance:
  - Every hidden phone capability is either intentionally unavailable or has a mobile replacement.
  - Staff phone is not just desktop with controls hidden.
- Verification:
  - Matrix committed in this checklist or separate doc.
  - Smoke check for critical controls promised by matrix.

### M-021 - Login visual QA matrix

- Status: `[ ]`
- Priority: P0
- Files: `js/auth.js`, `css/components.css`, tests
- Work:
  - Test:
    - iPhone SE portrait, username focused.
    - iPhone SE landscape, password focused.
    - iPhone 15 Pro Max portrait.
    - Pixel 8 portrait.
    - iPad Mini portrait and landscape.
    - 320px browser with 200% text zoom.
    - Wrong password with keyboard open.
    - Admin to Coach to Player role switching while keyboard is open.
    - Logout then immediate relogin.
- Acceptance:
  - Card remains reachable.
  - Focused field remains visible.
  - Error state does not hide submit or password.
- Verification:
  - Playwright screenshots once browser tooling is available.

### M-022 - Phone header overflow menu

- Status: `[x]`
- Priority: P1
- Files: `index.html`, `css/responsive.css`, `js/app-shell.js`, `js/app-events.js`
- Work:
  - [x] Keep primary header actions visible.
  - [x] Move secondary phone actions into an overflow menu.
  - [x] Show short role/avatar chip; expose full username in menu.
  - [x] Keep brand text ellipsized with `min-width: 0`.
- Acceptance:
  - [x] Header does not crowd at 320px.
  - [x] No action target drops below `44x44`.
  - [x] Full username is discoverable.
- Verification:
  - [x] Browser screenshot at 320px, 375px, 390px, and 200% text zoom.
- Implementation notes (SW v737):
  - Reused the existing `.tool-menu-wrap` / `data-action="toggleParentOpen"` dropdown pattern (already wired for open/close + outside-click in app-events.js) — no new JS dispatch targets needed, so app-shell.js/app-events.js required no changes.
  - Added a `⋯` overflow `.header-overflow` wrapper to `.app-header-actions` containing menu-item duplicates of the secondary actions (Search, Print & Export, Vision Mode, Import/Export) plus an account row (`#headerOverflowAccount`, full `Role: username`) and a Log Out item (`#headerOverflowLogout`). Menu items carry the same `data-auth-player-hide`/`data-auth-admin-only` attributes so auth.js gates them identically (players see only the account row + Log Out).
  - Tagged the inline secondary header buttons (Search, Print, Vision, Settings, Log Out) with `.header-action-secondary`. On any mobile shell (`body.is-mobile-screen`, ≤640px or coarse-pointer ≤820px) those hide and the overflow shows; brand stays ellipsized (`min-width: 0`) and the dark-mode toggle + short role chip (`.auth-user-badge`, capped at `min(120px, 30vw)`) stay inline.
  - Populated `#headerOverflowAccount` / `#headerOverflowLogout` in auth.js alongside the existing badge logic (full username discoverable in the menu even though the inline chip is truncated).
  - Base hide rule scoped as `.app-header .header-overflow { display: none }` (specificity 0,2,0) to beat `components.css` `.tool-menu-wrap { display: inline-flex }`, which loads after layout.css; the `body.is-mobile-screen` show rule lives in responsive.css (loads last) so it wins when the mobile shell is active.
  - Verified via the mobile viewport harness (coach/admin/player at 320/375/390 — zero overflow, zero sub-44px targets) and a headless probe at 320px: secondary buttons compute `display:none`, `⋯` overflow is `flex`, and clicking it opens the menu (`block`).

### M-023 - iPad and tablet responsiveness pass

- Status: `[x]`
- Priority: P0
- Files: `js/app-shell.js`, `css/responsive.css`, page CSS, viewport harness
- Work:
  - Define the tablet contract separately from phone:
    - Staff tablet: near-full editing with tablet-optimized two-pane layouts.
    - Coach tablet: practice run controls plus editable supporting panes.
    - Player tablet: study/presentation-first with roomy navigation.
    - Split-screen iPad: follow `shell-compact` when width is constrained.
  - Audit `shell-tablet`, `is-mobile-screen`, and `is-compact-screen` behavior at iPad sizes.
  - Add iPad Mini, iPad Air/Pro portrait, iPad landscape, and split-screen widths to the routine verification pass.
  - Keep phone-only run mode from taking over full tablet editing layouts.
  - `[x]` Expand touch-tablet shell detection through common iPad Pro dimensions.
  - `[x]` Restore staff tablet Practice Script to a two-pane editing workspace.
  - `[x]` Keep the phone-only current-call coach card from taking over tablet Script.
  - `[x]` Add routine iPad viewport coverage and tablet-shell assertions to the viewport harness.
  - `[x]` Keep touch targets reachable on larger iPads: extend the 44px hit-size rules (playbook sort headers, readiness buttons, nav tabs, player notify) to the `shell-tablet` class so 834px+/1024px iPads outside the coarse-pointer <=820px media query stay reachable. Verified zero small-target warnings across all roles and all iPad viewports.
- Acceptance:
  - iPad portrait does not look like a broken desktop or a stretched phone.
  - iPad landscape preserves the desktop editing value while keeping touch targets reachable.
  - Split-screen iPad behaves predictably and does not strand content below fixed chrome.
  - Player iPad cannot see staff controls and can reach published script/presentation workflows.
- Verification:
  - `node scripts/mobile-viewport-check.mjs --roles=admin,coach,player --viewports=768x1024,820x1180,834x1112,1024x768,1024x1366 --warn-only --no-screenshots`
  - `node scripts/mobile-viewport-check.mjs --roles=admin,coach,player --ipad-viewports --warn-only --no-screenshots`
  - Browser screenshots for iPad Mini portrait/landscape and iPad Pro split-screen.
  - Targeted Script, Call Sheet, Wristband, and Presentation tablet probes.

---

## Phase 3 - High-Risk Page Rebuilds

### M-030 - Practice Script phone run mode

- Status: `[~]`
- Priority: P0
- Files: `index.html`, `js/app-shell.js`, `css/components.css`, `css/responsive.css`
- Work:
  - `[x]` Treat coach phone as Practice Run Mode:
    - `[x]` current period and current play
    - `[x]` previous/next play
    - `[x]` mark result 1-5
    - `[x]` quick rep log
    - `[x]` personnel and assignment summary
    - `[x]` jump to period
    - `[ ]` publish/lock status
    - `[x]` full edit sheet only when needed
  - `[x]` Keep full available-play browsing and bulk building tablet/desktop first by hiding it only in phone run mode.
  - `[x]` Add Edit Sheet / Run Mode toggle for staff phones.
  - `[x]` Hide timeline, library, toolbar, period edit fields, column headers, and row readiness widgets in run mode.
- Acceptance:
  - Coach can run practice from a phone without using the full builder.
  - Critical hidden phone controls have replacements.
  - Scoring and navigation remain reachable with the dock present.
- Verification:
  - `node --check js/app-shell.js`
  - Targeted 390x844 staff phone browser probe:
    - default run mode hides editor/timeline/readiness surfaces
    - `Edit Sheet` reveals header, library, and toolbar
    - `Run Mode` restores sideline view
    - score `4` remains active
    - `#mobileScriptCoachNow` controls meet touch target guardrail
  - `node scripts/mobile-viewport-check.mjs --roles=admin,coach,player --viewports=320x568,390x844,568x320,820x1180 --warn-only --no-screenshots`
  - `node scripts/smoke-check.js` includes a static run-mode contract for markup, actions, mode state, and hidden run-mode surfaces.

### M-031 - Practice Script touch reordering fallback

- Status: `[x]`
- Priority: P1
- Files: `js/script-sort.js`, `js/script-render.js`, `js/script-events.js`, `js/script-selection.js`, `css/script.css`
- Work:
  - `[x]` Add non-drag move controls for touch devices: every play row carries a `↕` move-menu button (`openScriptMoveMenu`) offering move to another period, to top, up, down, and to bottom, plus multi-select moves.
  - `[x]` Periods carry drag-free `▲`/`▼` move buttons (`movePeriod`).
  - `[x]` Preserve keyboard accessibility — move controls are real buttons with `aria-label`s.
- Acceptance:
  - Reordering does not require drag-and-drop on phone (move menu available in Edit Sheet mode).
  - Period context stays visible during reorder.
- Verification:
  - Move-menu code path renders per row and routes through `script-events.js`; run-mode hides the editing tools by design while Edit Sheet exposes them.

### M-031A - Player Script read-only portal

- Status: `[x]`
- Priority: P0
- Files: `index.html`, `js/auth.js`, `css/script.css`, `scripts/smoke-check.js`
- Work:
  - `[x]` Hide staff Script builder header controls from player logins.
  - `[x]` Hide Add Period / From Template controls from player logins.
  - `[x]` Include `data-auth-player-hide` containers in auth UI scanning.
  - `[x]` Restore read-only action filtering so player logins cannot invoke mutating builder actions.
  - `[x]` Keep published script launcher and player swipe view actions available.
  - `[x]` Hide key-player and roster-name hints from player-facing Practice Script cards and swipe rules.
- Acceptance:
  - Player Practice tab only exposes published/loaded scripts and player-facing script rows.
  - Player cannot create periods, edit practice title/date, or use builder controls.
  - Player Practice cards and swipe rules do not imply that only named/key players must learn the play.
  - Coach/admin retain full Script builder access.
- Verification:
  - `node --check js/auth.js`
  - Static smoke contract for player Script builder chrome and read-only action filtering.
  - Targeted player mobile DOM probe.

### M-032 - Call Sheet phone situation-card view

- Status: `[x]`
- Priority: P0
- Files: `js/callsheet-render.js`, `js/callsheet.js`, `css/callsheet.css`, `css/responsive.css`
- Work:
  - `[x]` Default phone to situation-card/call-list view instead of print-like layout.
  - Keep full sheet editing tablet/desktop focused.
  - `[x]` Keep full sheet editing tablet/desktop focused.
  - `[x]` Add phone card render path with stacked situation cards and left/right hash call lists.
  - `[x]` Keep existing add, remove, swap, sort, collapse, and category menu actions reachable in phone cards.
  - `[x]` Re-render Call Sheet when shell size changes so phone/tablet rotation does not keep stale markup.
  - `[x]` Move display and game-plan drawers onto shared layer system.
- Acceptance:
  - Phone call sheet is readable without horizontal body scroll.
  - Situation actions are reachable without dense table editing.
  - Drawer footer respects safe area.
- Verification:
  - Phone screenshots and horizontal overflow assertion.
  - Static smoke contract for phone card render path, phone styling, and shell-size rerender.

### M-033 - Wristband phone card editor

- Status: `[x]`
- Priority: P0
- Files: `js/wristband-render.js`, `js/wristband-cell-popup.js`, `js/wristband-runtime.js`, `css/wristband.css`
- Work:
  - `[x]` Phone defaults to card-by-card cell editor and searchable library.
  - `[x]` Separate classic phone editing from the printed wristband grid by rendering row cards.
  - `[x]` Reuse existing cell popup/search/edit flow from each phone row.
  - `[x]` Re-render on phone/tablet shell changes so rotation does not leave stale grid markup.
  - `[x]` Use explicit horizontal-scroll affordance only where unavoidable (single-column grid, soft-wrap calls, no body overflow).
- Acceptance:
  - Small phone width does not force body-level horizontal overflow.
  - Cell editing and search are reachable with keyboard open.
- Verification:
  - 320px and 390px viewport checks.
  - Static smoke contract for phone row editor render path and 44px row controls.

### M-034 - Playbook phone action/filter sheets

- Status: `[x]`
- Priority: P1
- Files: `index.html`, `js/playbook-render.js`, `js/playbook-chrome.js`, `css/playbook.css`, `css/responsive.css`
- Work:
  - `[x]` Use cards on phone; table on tablet/desktop (`#pbCards` / `.pb-card` render path).
  - `[x]` Consolidate primary actions into one phone action sheet (`#pbActionSheet`): Add Play, Present, Analytics, and Data grouped in a bottom sheet on `body.shell-phone`; the desktop `.pb-utility-group` is hidden on phone.
  - `[x]` Consolidate filters into one filter sheet with active-filter count (`#pbFilterDrawer` + `#pbFilterCount`).
  - `[x]` Use disclosure for secondary metadata (More Filters disclosure + card pills).
- Acceptance:
  - Phone toolbar is not a compressed desktop toolbar.
  - Filters are reachable and resettable.
  - No body-level horizontal scroll.
- Verification:
  - Action sheet routes through `openLayer()`/`closeLayer()` for body lock + safe-area; toggle is phone-only via `body.shell-phone`.
  - Phone screenshots and active-filter interaction test.

### M-035 - Defensive Tendencies dedicated mobile layout

- Status: `[x]`
- Priority: P1
- Files: `css/tendencies.css`, `js/tendencies*.js`
- Work:
  - [x] Add explicit 760px and 560px mobile sections.
  - [x] Convert stats to two-column compact grid.
  - [x] Move row actions into a menu.
  - [x] Use bottom sheets for detail/filter surfaces.
  - [x] Clamp tooltip/popover width to `calc(100vw - 24px)` and both left/right bounds.
- Acceptance:
  - Opponent detail header and actions do not collide.
  - Tables do not force body-level horizontal overflow.
  - Touch users can access hover-dependent details.
- Verification:
  - Phone and tablet screenshots.
  - Tooltip position test at 320px.
- Implementation notes (SW v732):
  - `.td-tooltip` width clamped to `min(320px, calc(100vw - 24px))`; `showPlayTooltip` now clamps `left` within both bounds using the measured tip width.
  - 760px breakpoint: `.td-stats-grid`, `.td-stats-bar` two-column compact grids.
  - 560px breakpoint: kebab `.td-play-menu-btn` replaces inline row buttons (`openTendenciesPlayMenu` reuses `_showTdPlayContextMenu` via a synthetic anchor event; registered in `_ELEMENT_FNS`); `.td-filter-panel` becomes a bottom sheet with `.td-filter-backdrop` + `.td-filter-close`.

### M-036 - Game Plan mobile action hierarchy

- Status: `[x]`
- Priority: P1
- Files: `css/gameplan.css`, `js/gameplan-*.js`
- Work:
  - [x] Keep search, active plan, and Add/Run primary.
  - [x] Collapse advanced filters by default.
  - [x] Move bulk operations to action sheet.
- Acceptance:
  - Toolbar height stays reasonable on phone.
  - Bulk actions remain available but secondary.
- Verification:
  - 390x844 and 844x390 screenshots.
- Implementation notes (SW v733):
  - Advanced filters already default-collapsed (`_gpFilters.showAdvanced: false`); search, formation, "Add Selected to…", and matchup chips stay primary in `.gp-toolbar`.
  - Bulk operations (`☑ All visible` / `▢ None` / `⇄ Invert` / `➕ Add all visible`) move into a phone-only bottom action sheet: `.gp-library-bulk.gp-bulk-open` with `.gp-bulk-backdrop`, `.gp-bulk-sheet-header` + `.gp-bulk-close`, opened by the `.gp-bulk-trigger` (`⋯ Bulk`) in the library header via new `toggleGamePlanBulkSheet()` (`_gpShowBulkSheet` state). Inline on tablet/desktop.

### M-037 - Dashboard role layouts

- Status: `[x]`
- Priority: P2
- Files: `css/dashboard.css`, `js/dashboard*.js`
- Work:
  - [x] Split into phone summary, tablet command center, and desktop command center patterns.
  - [x] Use container behavior inside cards where practical.
  - [x] Remove viewport-width font scaling that violates CSS guardrail.
- Acceptance:
  - Dashboard remains usable at phone sizes and split-screen tablet widths.
  - `css/dashboard.css` no longer scales font size with viewport width.
- Verification:
  - `node scripts/smoke-check.js` no longer reports dashboard viewport font sizing.
- Implementation notes (SW v734):
  - Replaced `.player-home-hero h2` `clamp(1.5rem, 5vw, 2.75rem)` with token `--font-size-4xl`; `css guardrails ok` now passes (no viewport font scaling).
  - Hero size hierarchy now token-based: desktop `--font-size-4xl` (32px) → tablet/mobile `--font-size-3xl` (28px) → narrow phone `--font-size-2xl` (24px).
  - Phone summary / tablet command center / desktop layouts already split via existing role-based body classes (`is-phone-screen`, `is-mobile-screen`, `data-auth-role`) and the `(pointer: coarse) and (max-width: 820px)` split-screen breakpoint; cards collapse to single column on phone and split-screen tablet.

### M-038 - Installation phone cards

- Status: `[x]`
- Priority: P2
- Files: `css/installation.css`, `js/installation*.js`
- Work:
  - [x] Phone uses week/day cards and expandable install items.
  - [x] Provide Move Up/Down/To Day controls where drag exists.
- Acceptance:
  - [x] Phone workflow does not require drag.
  - [x] Matrix/timeline remains tablet/desktop.
- Verification:
  - [x] Phone keyboard and touch test.
- Implementation notes (SW v735):
  - The Installation module is a flat per-category checklist (10 categories: personnel, formation, motion, etc.), not a week/day/timeline structure — so "week/day cards" and "Move To Day" do not apply. Deliverable instead replaces the touch-hostile drag handle with explicit, functional Move Up/Down buttons on phone.
  - Drag-reorder was previously **cosmetic**: `renderInstallCategoryDetail` sorted installed-first then alphabetical and never read `data.order`. Render now honors `data.order[cat.id]` as a secondary sort key (after installed-first, before alphabetical), so both legacy drag and the new buttons actually persist.
  - Added `getInstallDisplayOrder(categoryId)` (shared display-order helper), `moveInstallItem(categoryId, value, delta)`, and `moveInstallItemUp(el)`/`moveInstallItemDown(el)` in `js/installation.js`; swaps stay within the same install-state group to keep installed-first stable, then persist the full order via `saveInstallationData` + `renderInstallation`.
  - Added `.install-item-move` with two `<button type="button" class="install-item-move-btn">` (↑/↓, 36px touch targets, `aria-label`) to the install-item template; `type="button"` prevents toggling the label's hidden checkbox. Buttons omitted in Smart Play mode.
  - Registered `moveInstallItemUp`/`moveInstallItemDown` in `_ELEMENT_FNS` (app-events.js) and synced AGENTS.md.
  - CSS: move buttons hidden by default (drag handle shown on desktop); new `@media (max-width: 560px)` hides `.install-item-drag`, shows `.install-item-move`, full-width search, larger touch padding, and hides the play-count badge to reduce phone crowding.

### M-039 - Identity and Offense Builder quick-edit mode

- Status: `[x]`
- Priority: P2
- Files: `css/identity.css`, `css/offense-builder.css`, `js/identity.js`, `js/offensebuilder.js`
- Work:
  - [x] Treat phone as review and quick-edit mode.
  - [x] Use accordion sections and sticky Save bar.
  - [x] Validate color picker, roster/personnel controls, and multiline editors with keyboard open.
- Acceptance:
  - [x] Configuration pages are operable on phone without pretending to be full desktop.
  - [x] Sticky Save bar does not cover focused fields.
- Verification:
  - [x] Phone keyboard-open screenshots.
- Implementation notes (SW v736):
  - Both modules are read-heavy reference/quick-edit pages, not data-entry config pages: Identity is a read-only render of `VISION_2026`, and Offense Builder's only edit is the star rating (auto-saves via `obSetRating`). Neither has a color picker, roster control, multiline editor, or a traditional Save button — those live in Team Settings. So "sticky Save bar" and "color picker / multiline keyboard" validation are N/A here; the deliverable focuses on phone-friendly review + quick-edit instead.
  - **Identity accordion (phone):** `_idCard` now renders the card title as a `<button class="id-card-title" data-action="toggleIdentityCard" aria-expanded>` with a chevron; added `toggleIdentityCard(el)` (toggles `id-card-collapsed` on the nearest `.id-card`, updates `aria-expanded`). `renderIdentity` sets module flag `_idCollapseCards = body.is-phone-screen` so the 12 cards render collapsed by default on phone only. Registered `toggleIdentityCard` in `_ELEMENT_FNS` (app-events.js) + synced AGENTS.md.
  - **Identity CSS:** `.id-card-title` reset to a borderless inline-flex button (identical desktop look, `cursor: default`); `.id-card-chevron` hidden by default. New `@media (max-width: 560px)`: chevron shown, `.id-card-collapsed .id-card-body { display:none }`, rotated chevron when collapsed, 44px tappable header, stacked hero with full-width action buttons. On desktop/tablet the collapse class has no effect (bodies always visible), so rotating phone→desktop never hides content.
  - **Offense Builder CSS:** added `@media (max-width: 560px)` enlarging `.ob-star` tap targets to 36px (quick-edit ratings are thumb-friendly) and tightening detail-section spacing. The existing 640px breakpoint already handles single-column stacking, full-width toolbar inputs, and the 3-up stat grid; OB search/filter use direct listeners so keyboard focus is preserved.

### M-040 - Player presentation orientation stability

- Status: `[x]`
- Priority: P1
- Files: `js/play-presentation.js`, `css/play-presentation.css`
- Work:
  - `[x]` Fix portrait player presentation cut-off by letting the presentation body scroll.
  - `[x]` Add safe-area bottom padding so the rule section clears mobile browser controls.
  - `[x]` Recalculate current card after orientation settles (viewport sync runs on `resize`/`orientationchange`/`visualViewport` and the diagram re-renders via the ResizeObserver at the new size).
  - `[x]` Preserve current play identity, not pixel scroll position (navigation is `playPresentationState.index`-based, so orientation changes never lose the active play).
  - `[x]` Notched landscape left/right safe areas: `.pp-header`/`.pp-footer` use `env(safe-area-inset-left/right)` so controls clear the notch in both landscape orientations.
  - `[x]` Show rotate recommendation only when current mode cannot fit: a dismissible `#playPresentationRotateHint` appears only on a mobile portrait viewport when the active mode overflows the body, and auto-hides in landscape, on fit, after dismissal, and on close.
- Acceptance:
  - Player rule text at the bottom of script presentation is reachable in portrait.
  - Orientation change preserves active play.
  - Landscape phone controls respect safe areas.
- Verification:
  - Static smoke contract for portrait player presentation scroll and bottom padding.
  - Targeted player portrait presentation probe.
  - Headless probe confirmed the rotate hint shows only on portrait overflow, hides in landscape, re-shows in portrait, persists dismissal, and clears on close with no page errors.

### M-041 - True iPad presentation and PWA/fullscreen fallback

- Status: `[x]`
- Priority: P0
- Files: `manifest.json`, `index.html`, `js/app-shell.js`, `js/play-presentation.js`, `css/play-presentation.css`, `js/storage.js`, `scripts/smoke-check.js`
- Work:
  - `[x]` Verify manifest, viewport-fit, Apple web app metadata, maskable icons, and network-first app-shell service worker behavior exist.
  - `[x]` Add canonical display-mode detection for browser, standalone, fullscreen, Fullscreen API state, iPadOS-style touch tablets, orientation, and presentation-active state.
  - `[x]` Add iPad Safari “Open Full Screen on iPad” instruction sheet with persisted dismissal state (`PRESENTATION_IPAD_HELP_DISMISSED`) and reopen via the fullscreen helper button.
  - `[x]` Add presentation setup sheet (⚙ header button) for source, order (listed/reverse), starting play, notes/personnel/assignment/defense visibility, auto-advance (0/5/10/15/30s), and theme (auto/dark/light); persisted to `PRESENTATION_SETUP`.
  - `[x]` App-level presentation chrome contract already hidden by the fixed full-screen overlay at `--z-skip-link` with `body.play-presentation-open{overflow:hidden}`; setup/help sheets layer above it via `openLayer`.
  - `[x]` Add explicit fullscreen enter/exit toggle button, `fullscreenchange`/`fullscreenerror` handling, and rejected-promise feedback (toast on desktop, iPad help sheet on iPadOS Safari).
  - `[x]` Restore originating page, selected play, focus, filters, and scroll position on exit (returnFocus restored, row reselected on open; setup/help/auto-advance all torn down on close).
- Acceptance:
  - iPad browser mode gets a clean app-level presentation even when Safari chrome cannot be hidden.
  - Home Screen/PWA mode and Fullscreen API mode expose reliable state through shared dataset attributes.
  - Presentation exit never leaves the app shell hidden, body locked, or focused on a removed element.
- Verification:
  - `[x]` Static smoke for manifest/PWA metadata, display-mode dataset contract, and fullscreen event hooks (smoke-check green at v731).
  - `[x]` Headless probe confirmed setup sheet open/close, order reverse keeps play in view, theme override sets `data-pp-theme`, auto-advance timer start/stop, fullscreen button visibility, and per-section coach visibility gating (defense/notes/coaching/rules/call) with no page errors.
  - Manual Safari/Home Screen device check still recommended for true iPad Full Screen flow.

### M-042 - Projector clean view, Wake Lock, detail panel, and telestrator

- Status: `[x]`
- Priority: P1
- Files: `js/play-presentation.js`, `css/play-presentation.css`, presentation setup/layer files as they split out
- Work:
  - `[x]` Add Projector Clean View toggle that hides touch instructions, noncritical HUD, coach-only notes when selected, edit/account controls, and noncritical toasts.
  - `[x]` Add HUD auto-hide with tap/pointer reveal and controls that stay clear of diagram content.
  - `[x]` Add optional detail panel: side panel on iPad landscape, bottom sheet on portrait, internal scroll only.
  - `[x]` Add Wake Lock toggle with explicit user action, release on exit/hidden page, and graceful fallback.
  - `[x]` Add optional session-local telestrator with pen, arrow/circle, eraser, clear, undo, line width, high-contrast colors, Pointer Events, Apple Pencil support, and resize-aligned coordinates.
  - `[x]` Add zoom-to-fit, manual zoom/pan, and reset-view controls that do not conflict with swipe navigation.
- Acceptance:
  - Projected output avoids app/account/edit UI and preserves high contrast.
  - Drawing and zoom gestures do not accidentally navigate plays or scroll the page.
  - Wake Lock failure never blocks presentation.
- Verification:
  - Presentation portrait/landscape screenshot set.
  - Pointer/touch drawing smoke or browser probe.
  - Wake Lock unavailable fallback test.
- Implementation notes (SW v738):
  - Added a `🎦` Projector Clean View toggle (`#playPresentationCleanBtn`, `togglePlayPresentationCleanView`) in the presentation header. Session-local (resets on every open/close).
  - Clean View sets `data-pp-clean="1"` on the overlay; CSS hides the mode switcher, source label, footer touch hints, and `.pp-coach-section-notes` so projected output stays diagram + call.
  - HUD auto-hide: while Clean View is active the header fades out after `PLAY_PRESENTATION_HUD_IDLE_MS` (3.5s) via `data-pp-hud-hidden`; any `pointermove`/`pointerdown`/tap re-reveals it (`handlePlayPresentationPointerActivity` → `revealPlayPresentationHud`). Controls remain in the header/footer chrome, clear of the diagram.
  - Non-critical presentation toasts route through `playPresentationToast()`, which stays silent while Clean View is on (fullscreen-blocked fallback included).
- Implementation notes (SW v739):
  - Added a `☀️` Wake Lock toggle (`#playPresentationWakeBtn`, `togglePlayPresentationWakeLock`). Hidden when `navigator.wakeLock` is unavailable.
  - Requires an explicit tap; `requestPlayPresentationWakeLock()` acquires a screen sentinel, `releasePlayPresentationWakeLock()` releases it. Released on presentation close and `playPresentationWakeLockDesired` reset.
  - Auto-reacquires on `visibilitychange` when the tab returns to visible and the user still wants it (browser auto-releases on hide).
  - Graceful fallback: unsupported or rejected requests surface a non-blocking toast and never interrupt the presentation.
- Implementation notes (SW v740):
  - Added floating diagram zoom controls (`.pp-zoom-controls`: `zoomPlayPresentationOut`/`resetPlayPresentationZoom`/`zoomPlayPresentationIn`). Reset doubles as a percentage readout and zoom-to-fit.
  - Zoom range 100%-400% (step 50%); the canvas gets a `translate/scale` transform with pan clamped to the frame bounds.
  - Drag-to-pan via Pointer Events (`attachPlayPresentationPan`) engages only while zoomed (mouse/touch/Apple Pencil). The frame switches to `touch-action: none` so panning never scrolls the page.
  - Swipe navigation is suppressed while zoomed (`playPresentationZoom.scale > 1`), so panning never changes plays. Zoom resets on every play change, open, and close.
  - Remaining: detail panel still pending.
- Implementation notes (SW v741):
  - Added a `✏️` telestrator toggle (`#playPresentationTeleBtn`, `togglePlayPresentationTelestrator`) plus a floating toolbar (`#playPresentationTeleBar`): pen/arrow/circle/eraser tools, five high-contrast color swatches, three line widths (S/M/L), and undo/clear actions.
  - Session-local: strokes are stored as normalized `0..1` points and replayed in order on a per-frame overlay canvas (`.pp-telestrator-canvas`), so they stay aligned across resize/rotation. Undo pops the last stroke; clear empties the list.
  - Drawing uses Pointer Events with `setPointerCapture` and `preventDefault` (mouse/touch/Apple Pencil); the overlay canvas captures pointers so drawing never pans or swipes. Eraser uses `destination-out` compositing.
  - Telestrator disables and clears on every play change, open, and close. Toolbar hides alongside the HUD in Clean View auto-hide.
  - Remaining: detail panel still pending.
- Implementation notes (SW v742):
  - Smarter landscape: on a mobile/tablet viewport, rotating to landscape now auto-engages Projector Clean View (`autoApplyPlayPresentationLandscapeCleanView`), and returning to portrait restores the full HUD. A manual `🎦` toggle sets `playPresentationCleanViewUserSet` so the coach's explicit choice wins for the rest of the session.
  - Added an in-landscape projector install prompt (`#playPresentationProjectorPrompt`). iPad/iOS Safari cannot hide its address bar or tab bar from web code, so the only chrome-free projector view is the installed PWA. The prompt appears top-center on iPad Safari in landscape (non-standalone, help not dismissed) and its "Show me" button opens the existing Add-to-Home-Screen guide; dismissible for the session.
  - Documented the platform limit: true full-screen on iPad = Add to Home Screen (manifest `display: standalone` + Apple meta tags already set). Desktop/Chrome still use the real Fullscreen API via the `⛶` button.
  - Remaining: detail panel still pending.
- Implementation notes (SW v743):
  - Added an optional detail panel (`ℹ️` `#playPresentationDetailBtn` → `togglePlayPresentationDetailPanel`). It surfaces the full play detail (call structure, situation, defensive look, coaching points, player rules, and coach notes) without leaving the current Minimum/Player/Coaches mode.
  - Renders as a right-side panel in landscape and a bottom sheet in portrait (`@media (orientation: portrait)`); the panel body is the only scroll surface (`overflow-y:auto` + `overscroll-behavior: contain`).
  - Content re-renders on every play change and resets/closes on open and close. Extracted `getPlayPresentationDetailRowGroups()` so the panel and the Coaches-mode sections share one row definition.
  - M-042 complete: clean view, HUD auto-hide, Wake Lock, zoom/pan, smarter landscape + projector prompt, telestrator, and detail panel all shipped.

---

## Phase 4 - Automated Mobile Test Harness

### M-050 - Viewport test harness

- Status: `[~]`
- Priority: P0
- Files: `scripts/`, optional test dependencies
- Work:
  - `[x]` Installed Playwright outside the repo at `~/.codex/tools/mobile-debug`.
  - `[x]` Installed external debugging packages: `puppeteer-core`, `@axe-core/playwright`, `pixelmatch`, and `pngjs`.
  - `[x]` Added `scripts/mobile-viewport-check.mjs`.
  - `[x]` Runner starts a no-cache static server when `--url` is not supplied.
  - `[x]` Runner stubs local auth and sync endpoints for static testing.
  - `[x]` Runner can save screenshots and `.mobile-debug/mobile-viewport-report.json`.
  - `[x]` Cover Admin, Coach, and Player where possible.
  - `[x]` Report canonical `device`, `displayMode`, `standaloneDisplay`, `fullscreenApi`, `ipados`, and `presentation` state.
  - `[ ]` Decide whether to make this a required gate or a manual debug command.
- Required viewports:
  - `[ ]` 320x568
  - `[ ]` 360x640
  - `[ ]` 375x667
  - `[ ]` 390x844
  - `[ ]` 393x852
  - `[ ]` 412x915
  - `[ ]` 568x320 landscape
  - `[ ]` 667x375 landscape
  - `[ ]` 844x390 landscape
  - `[ ]` 768x1024
  - `[ ]` 820x1180
  - `[ ]` 1024x768
  - `[ ]` 834x1112
  - `[ ]` 1024x1366
- Acceptance:
  - Runner can load local app and authenticate with local-dev roles.
  - Runner can report console errors, horizontal overflow, and missing touch targets.
- Verification:
  - `node --check scripts/mobile-viewport-check.mjs`
  - `node scripts/mobile-viewport-check.mjs --roles=admin,coach,player --viewports=320x568,390x844,568x320,820x1180 --warn-only --no-screenshots`
  - `npm` remains outside the app runtime; browser/debug packages are installed under `~/.codex/tools/mobile-debug`.

### M-051 - Required automated assertions

- Status: `[~]`
- Priority: P0
- Files: viewport test harness
- Assertions:
  - `[x]` `document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1` unless approved horizontal wrapper is active.
  - `[x]` No visible standalone phone control has hit box below `44x44`.
  - `[x]` Phone startup must expose `#mainApp`, the tab bar, and an active panel after auth.
  - `[x]` No fixed element overlaps active bottom navigation or safe area.
  - `[x]` Canonical display-mode/device/presentation dataset fields are present and valid after auth.
  - `[ ]` Focused input remains inside `visualViewport` after keyboard resize.
  - `[x]` Opening a blocking layer prevents background scrolling.
  - `[x]` Closing a layer restores scroll and focus.
  - `[ ]` Orientation change preserves active page and selected record/play.
  - `[ ]` No critical action is hidden solely because width is small.
  - `[ ]` Text at 200% zoom remains readable and controls remain operable.
  - `[~]` Player cannot see staff controls; coach/admin can reach promised mobile capabilities.
- Verification:
  - `mobile-viewport-check.mjs` `probeLayerScrollLock` drives the shipped `openLayer`/`closeLayer` machinery with a synthetic blocking overlay on phone roles: asserts `scrollOwner="layer"`, `body.app-layer-locked` (position fixed), background scroll is pinned while locked, then scroll position and focus are restored on close (`layerLockBroken` gate). Full matrix passes 12/12.

### M-052 - Expanded role/page/mobile regression matrix

- Status: `[ ]`
- Priority: P1
- Files: `scripts/mobile-viewport-check.mjs`, optional screenshot baselines under `.mobile-debug/`
- Work:
  - Expand automated coverage to the attached audit matrix:
    - Phones: 320x568, 360x800, 375x667, 390x844, 393x852, 412x915, 430x932.
    - Tablets/iPads: 768x1024, 810x1080, 820x1180, 1024x768, 1080x810, 1180x820, 1366x1024.
    - Desktop smoke sizes: 1280x720, 1366x768, 1440x900, 1920x1080.
  - Add state probes for login, role dashboards, Practice Script run/full views, Call Sheet launcher/situation, Wristband card/cell editor, Playbook/detail, Defensive Tendencies, Game Plan, presentation setup, portrait/landscape presentation, fullscreen fallback, bottom-sheet scroll lock, orientation restore, and role restrictions.
  - Generate screenshot sets for major states when explicitly requested.
- Acceptance:
  - Harness can report per-role/per-viewport failures without stopping the whole run unless strict mode is enabled.
  - Regression output identifies the active page, display mode, device class, scroll owner, presentation state, overflow, touch target failures, console errors, and fixed-element overlap.
- Verification:
  - `node --check scripts/mobile-viewport-check.mjs`
  - Representative no-screenshot run across at least phone, tablet, and desktop sizes.

---

## Current Full Smoke Blockers To Track Separately

These are not all mobile-audit items, but they keep full `node scripts/smoke-check.js` red:

- `[ ]` `css/dashboard.css` scales font size with viewport width.
- `[ ]` `js/play-readiness.js`: missing global dispatch target for `data-action="prLogSetScore"`.
- `[ ]` Call sheet drawer replaces shared render function.
- `[ ]` Game plan and call sheet do not share coverage splitting.
- `[ ]` Shared personnel marker contracts do not include Meat steak in all expected surfaces.
- `[ ]` Player script publishing runtime and diagnostics incomplete.
- `[ ]` Play readiness scoring model and coach permissions incomplete.
- `[ ]` Player dashboard home / portal styling / desktop script scroll contracts incomplete.
- `[ ]` Wristband shared rendering, keyboard navigation, print preview, and one-per-page execution incomplete.
- `[ ]` Player wristband rule source selection, reset behavior, and print modes incomplete.
- `[ ]` 7-on-7 call sheet wristband passing-play auto-sync and template integration incomplete.
- `[ ]` Script packet diagram print styling incomplete.
- `[ ]` `AGENTS.md` `STORAGE_KEYS` list does not match `js/storage.js`.

---

## Recommended Next 10 Items

1. `[x]` M-023 - iPad/tablet responsiveness pass: tablet shell contract verified; touch targets reachable across all iPad viewports (admin/coach/player) with zero small-target warnings.
2. `[~]` M-032 - Finish Call Sheet phone drawer layer/safe-area QA.
3. `[~]` M-033 - Finish Wristband phone popup/body-lock and player-card QA.
4. `[~]` M-012 - Continue shared layer/body lock utility migration.
5. `[x]` M-041 - True iPad presentation / PWA / fullscreen fallback complete.
6. `[ ]` M-020 - Write role capability matrix.
7. `[ ]` M-031 - Add Practice Script touch reordering fallback.
8. `[~]` M-040 - Finish player presentation orientation/cut-off QA.
9. `[ ]` M-034 - Build Playbook phone action/filter sheets.
10. `[~]` M-010 - Finish canonical responsive state migration.

---

## Running Completed List

- `[x]` M-001 - Shell chrome measurement: measured header, tabs, and coach dock drive mobile CSS vars.
- `[x]` M-002 - Login short-screen and keyboard behavior: login card and focused fields stay reachable on short/keyboard screens.
- `[x]` M-003 - Player phone header touch targets: player header controls meet the 44px phone target.
- `[x]` M-004 - Auth session syntax/expiry repair: expired sessions clear cleanly and `auth.js` parses.
- `[x]` M-005 - Regression guards and cache bump: early mobile smoke guards and cache versioning were added.
- `[x]` M-006 - Editor form-field sanitizer regression: `sanitizeHTML()` no longer strips `input`/`select`/`textarea`, so the play editor and other `setInnerHTML()` panels render their fields and accept typing again.
- `[x]` M-007 - Sticky toolbars float/overlap fix: script + dashboard sub-toolbars now pin to the measured `--app-header-height` + `--app-tabs-height` instead of hardcoded pixel offsets.
- `[x]` M-010 partial - Responsive state contract: canonical `shell-*` classes/data states, display-mode/device/orientation/presentation datasets, and mobile no-playbook startup open the app shell.
- `[x]` M-011 - Scroll ownership: mobile shells report document scroll ownership; the viewport harness checks phone roles and runs a per-tab scroll-ancestry probe confirming a single vertical owner per page.
- `[x]` M-012 partial - Shared layer/body lock: `openLayer()` / `closeLayer()` freeze and restore body scroll, suppress background touchmove, add safe-area hooks, trap and return focus, and now wrap Play Presentation plus the Call Sheet display panel, Call Sheet game plan drawer, Wristband cell popup, Script tools drawer, and command palette.
- `[x]` M-031 - Practice Script touch reordering fallback: per-row `↕` move menu and period `▲`/`▼` buttons give a complete drag-free, keyboard-accessible reorder path.
- `[x]` M-013 partial - Touch-target guardrail: shared controls and phone viewport checks catch undersized standalone targets.
- `[x]` M-014 - Development horizontal overflow detector: `bcDebugMobileOverflow()` reports visible overflow suspects.
- `[x]` M-015 partial - Reduced motion: global reduced-motion guardrail is covered by smoke checks.
- `[x]` M-023 partial - iPad/tablet responsiveness: touch-tablet shell detection covers iPad Pro, staff tablet Script keeps a two-pane editing layout, and the viewport harness has iPad assertions.
- `[x]` M-030 partial - Practice Script phone run mode: staff phones get current-call controls, scoring, period jump, log/present actions, and an Edit Sheet toggle.
- `[x]` M-031A - Player Script read-only portal: player logins see published/loaded scripts and cannot create/edit builder content.
- `[x]` M-031A follow-up - Player Practice cards and swipe rules hide key-player/roster-name hints so every player treats each rep as required learning.
- `[x]` M-032 partial - Call Sheet phone cards: phones render stacked situation cards with readable left/right hash call lists and reachable add/remove/swap/category actions.
- `[x]` M-033 partial - Wristband phone editor: classic wristbands render as tappable row cards on phones while tablet/desktop keep the printed card grid.
- `[x]` M-040 partial - Player presentation cut-off: portrait player presentation scrolls and clears bottom browser controls.
- `[x]` M-050 partial - Viewport harness: `scripts/mobile-viewport-check.mjs` runs local auth/viewport checks for admin, coach, and player.
- `[x]` M-051 partial - Automated assertions: horizontal overflow, phone startup, fixed overlap, touch target, and player-control assertions have initial coverage.
