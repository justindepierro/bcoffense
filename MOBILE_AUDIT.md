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

1. `M-023` - iPad/tablet responsiveness pass: make tablet a near-full editing workspace, not a stretched phone or cramped desktop.
2. `M-032` - Call Sheet phone situation-card view: replace the print-like dense sheet on phones.
3. `M-033` - Wristband phone card editor: make cell editing/search workable without horizontal body scroll.
4. `M-012` - Shared layer/body lock utility: fix modal/drawer scroll, focus return, safe-area footers, and background touch leaks.
5. `M-031` - Practice Script touch reordering fallback: give touch users move/reorder controls that do not depend on drag.
6. `M-040` - Presentation orientation QA: finish iPhone/iPad portrait/landscape checks after the player cut-off fix.

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

## Phase 1 - Stabilize Shared Mobile Foundations

### M-010 - Canonical responsive state contract

- Status: `[~]`
- Priority: P0
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

- Status: `[~]`
- Priority: P0
- Files: `css/responsive.css`, `css/script.css`, `css/components.css`, `css/callsheet.css`, `css/wristband.css`, `js/app-shell.js`
- Work:
  - `[x]` Expose active scroll ownership on `body.dataset.scrollOwner`.
  - `[x]` Set mobile shells to document/body vertical scroll and desktop shells to panel/workbench scroll.
  - `[x]` Add viewport harness assertion that phone roles report `scrollOwner="document"`.
  - `[~]` Define scroll ownership per shell mode:
    - Phone normal pages: document/body owns vertical scroll.
    - Desktop workbench pages: panel/workbench owns scroll.
    - Blocking modal/drawer: layer owns scroll; body locked.
    - Tables: horizontal scroll only inside approved wrappers.
  - `[~]` Add shell classes or attributes for active scroll mode.
  - `[ ]` Remove competing page/body/internal scroll rules where they fight.
- Acceptance:
  - No page has two vertical scroll owners in the same mode.
  - Bottom content is not hidden behind player nav or coach dock.
  - Orientation change does not strand content out of reach.
- Verification:
  - `node scripts/mobile-viewport-check.mjs --roles=admin,coach,player --viewports=320x568,390x844,568x320,820x1180 --warn-only --no-screenshots`
  - Targeted Script phone probe verified `scrollOwner="document"` at 390x844.
  - Still needs browser scroll ancestry probe for Script, Call Sheet, Wristband, and Playbook.
  - Still needs static smoke contract for approved scroll owners.

### M-012 - Shared layer/body lock utility

- Status: `[ ]`
- Priority: P0
- Files: `js/dom-helpers.js` or new shared file, `js/app-events.js`, modal/drawer callers, `css/components.css`
- Work:
  - Create `openLayer()` / `closeLayer()` utility.
  - Save body scroll Y and restore it on close.
  - Apply a body lock class.
  - Trap focus and return focus.
  - Prevent background `touchmove`.
  - Account for safe-area padding.
  - Enforce one active blocking layer at a time.
- Acceptance:
  - Opening a blocking layer prevents background scroll.
  - Closing restores scroll and focus.
  - Layer footer/header respect safe areas.
- Verification:
  - Unit/static smoke checks for API existence and body lock class.
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

- Status: `[ ]`
- Priority: P1
- Files: `index.html`, `css/responsive.css`, `js/app-shell.js`, `js/app-events.js`
- Work:
  - Keep primary header actions visible.
  - Move secondary phone actions into an overflow menu.
  - Show short role/avatar chip; expose full username in menu.
  - Keep brand text ellipsized with `min-width: 0`.
- Acceptance:
  - Header does not crowd at 320px.
  - No action target drops below `44x44`.
  - Full username is discoverable.
- Verification:
  - Browser screenshot at 320px, 375px, 390px, and 200% text zoom.

### M-023 - iPad and tablet responsiveness pass

- Status: `[~]`
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
  - Verify header, tabs, coach dock, modals, and presentation controls around iPad safe areas.
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

- Status: `[ ]`
- Priority: P1
- Files: `js/script-sort.js`, `js/script-render.js`, `js/script-events.js`, `css/script.css`
- Work:
  - Add non-drag move controls or a reorder sheet for touch devices.
  - Preserve keyboard accessibility.
- Acceptance:
  - Reordering does not require drag-and-drop on phone.
  - Period context stays visible during reorder.
- Verification:
  - Touch and keyboard reorder test.

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
- Acceptance:
  - Player Practice tab only exposes published/loaded scripts and player-facing script rows.
  - Player cannot create periods, edit practice title/date, or use builder controls.
  - Coach/admin retain full Script builder access.
- Verification:
  - `node --check js/auth.js`
  - Static smoke contract for player Script builder chrome and read-only action filtering.
  - Targeted player mobile DOM probe.

### M-032 - Call Sheet phone situation-card view

- Status: `[~]`
- Priority: P0
- Files: `js/callsheet-render.js`, `js/callsheet.js`, `css/callsheet.css`, `css/responsive.css`
- Work:
  - `[x]` Default phone to situation-card/call-list view instead of print-like layout.
  - Keep full sheet editing tablet/desktop focused.
  - `[x]` Keep full sheet editing tablet/desktop focused.
  - `[x]` Add phone card render path with stacked situation cards and left/right hash call lists.
  - `[x]` Keep existing add, remove, swap, sort, collapse, and category menu actions reachable in phone cards.
  - `[x]` Re-render Call Sheet when shell size changes so phone/tablet rotation does not keep stale markup.
  - Move display and game-plan drawers onto shared layer system.
- Acceptance:
  - Phone call sheet is readable without horizontal body scroll.
  - Situation actions are reachable without dense table editing.
  - Drawer footer respects safe area.
- Verification:
  - Phone screenshots and horizontal overflow assertion.
  - Static smoke contract for phone card render path, phone styling, and shell-size rerender.

### M-033 - Wristband phone card editor

- Status: `[~]`
- Priority: P0
- Files: `js/wristband-render.js`, `js/wristband-cell-popup.js`, `js/wristband-runtime.js`, `css/wristband.css`
- Work:
  - `[x]` Phone defaults to card-by-card cell editor and searchable library.
  - `[x]` Separate classic phone editing from the printed wristband grid by rendering row cards.
  - `[x]` Reuse existing cell popup/search/edit flow from each phone row.
  - `[x]` Re-render on phone/tablet shell changes so rotation does not leave stale grid markup.
  - Use explicit horizontal-scroll affordance only where unavoidable.
- Acceptance:
  - Small phone width does not force body-level horizontal overflow.
  - Cell editing and search are reachable with keyboard open.
- Verification:
  - 320px and 390px viewport checks.
  - Static smoke contract for phone row editor render path and 44px row controls.

### M-034 - Playbook phone action/filter sheets

- Status: `[ ]`
- Priority: P1
- Files: `js/playbook-*.js`, `css/playbook.css`, `css/responsive.css`
- Work:
  - Use cards on phone; table on tablet/desktop.
  - Consolidate primary actions into one phone action sheet.
  - Consolidate filters into one filter sheet with active-filter count.
  - Use disclosure for secondary metadata.
- Acceptance:
  - Phone toolbar is not a compressed desktop toolbar.
  - Filters are reachable and resettable.
  - No body-level horizontal scroll.
- Verification:
  - Phone screenshots and active-filter interaction test.

### M-035 - Defensive Tendencies dedicated mobile layout

- Status: `[ ]`
- Priority: P1
- Files: `css/tendencies.css`, `js/tendencies*.js`
- Work:
  - Add explicit 760px and 560px mobile sections.
  - Convert stats to two-column compact grid.
  - Move row actions into a menu.
  - Use bottom sheets for detail/filter surfaces.
  - Clamp tooltip/popover width to `calc(100vw - 24px)` and both left/right bounds.
- Acceptance:
  - Opponent detail header and actions do not collide.
  - Tables do not force body-level horizontal overflow.
  - Touch users can access hover-dependent details.
- Verification:
  - Phone and tablet screenshots.
  - Tooltip position test at 320px.

### M-036 - Game Plan mobile action hierarchy

- Status: `[ ]`
- Priority: P1
- Files: `css/gameplan.css`, `js/gameplan-*.js`
- Work:
  - Keep search, active plan, and Add/Run primary.
  - Collapse advanced filters by default.
  - Move bulk operations to action sheet.
- Acceptance:
  - Toolbar height stays reasonable on phone.
  - Bulk actions remain available but secondary.
- Verification:
  - 390x844 and 844x390 screenshots.

### M-037 - Dashboard role layouts

- Status: `[ ]`
- Priority: P2
- Files: `css/dashboard.css`, `js/dashboard*.js`
- Work:
  - Split into phone summary, tablet command center, and desktop command center patterns.
  - Use container behavior inside cards where practical.
  - Remove viewport-width font scaling that violates CSS guardrail.
- Acceptance:
  - Dashboard remains usable at phone sizes and split-screen tablet widths.
  - `css/dashboard.css` no longer scales font size with viewport width.
- Verification:
  - `node scripts/smoke-check.js` no longer reports dashboard viewport font sizing.

### M-038 - Installation phone cards

- Status: `[ ]`
- Priority: P2
- Files: `css/installation.css`, `js/installation*.js`
- Work:
  - Phone uses week/day cards and expandable install items.
  - Provide Move Up/Down/To Day controls where drag exists.
- Acceptance:
  - Phone workflow does not require drag.
  - Matrix/timeline remains tablet/desktop.
- Verification:
  - Phone keyboard and touch test.

### M-039 - Identity and Offense Builder quick-edit mode

- Status: `[ ]`
- Priority: P2
- Files: `css/identity.css`, `css/offense-builder.css`, `js/identity.js`, `js/offensebuilder.js`
- Work:
  - Treat phone as review and quick-edit mode.
  - Use accordion sections and sticky Save bar.
  - Validate color picker, roster/personnel controls, and multiline editors with keyboard open.
- Acceptance:
  - Configuration pages are operable on phone without pretending to be full desktop.
  - Sticky Save bar does not cover focused fields.
- Verification:
  - Phone keyboard-open screenshots.

### M-040 - Player presentation orientation stability

- Status: `[~]`
- Priority: P1
- Files: `js/play-presentation.js`, `css/play-presentation.css`
- Work:
  - `[x]` Fix portrait player presentation cut-off by letting the presentation body scroll.
  - `[x]` Add safe-area bottom padding so the rule section clears mobile browser controls.
  - Recalculate current card after orientation settles.
  - Preserve current play identity, not pixel scroll position.
  - Test notched landscape left and right orientation.
  - Show rotate recommendation only when current mode cannot fit.
- Acceptance:
  - Player rule text at the bottom of script presentation is reachable in portrait.
  - Orientation change preserves active play.
  - Landscape phone controls respect safe areas.
- Verification:
  - Static smoke contract for portrait player presentation scroll and bottom padding.
  - Targeted player portrait presentation probe.
  - Landscape phone screenshots and orientation-change test.

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
  - `[ ]` Focused input remains inside `visualViewport` after keyboard resize.
  - `[ ]` Opening a blocking layer prevents background scrolling.
  - `[ ]` Closing a layer restores scroll and focus.
  - `[ ]` Orientation change preserves active page and selected record/play.
  - `[ ]` No critical action is hidden solely because width is small.
  - `[ ]` Text at 200% zoom remains readable and controls remain operable.
  - `[~]` Player cannot see staff controls; coach/admin can reach promised mobile capabilities.

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

1. `[~]` M-023 - Finish iPad/tablet QA across Call Sheet, Wristband, and Presentation.
2. `[~]` M-032 - Finish Call Sheet phone drawer layer/safe-area QA.
3. `[~]` M-033 - Finish Wristband phone popup/body-lock and player-card QA.
4. `[ ]` M-012 - Build shared layer/body lock utility.
5. `[ ]` M-020 - Write role capability matrix.
6. `[ ]` M-031 - Add Practice Script touch reordering fallback.
7. `[~]` M-040 - Finish player presentation orientation/cut-off QA.
8. `[ ]` M-034 - Build Playbook phone action/filter sheets.
9. `[ ]` M-021 - Run login visual QA matrix.
10. `[~]` M-010 - Finish canonical responsive state migration.

---

## Running Completed List

- `[x]` M-001 - Shell chrome measurement: measured header, tabs, and coach dock drive mobile CSS vars.
- `[x]` M-002 - Login short-screen and keyboard behavior: login card and focused fields stay reachable on short/keyboard screens.
- `[x]` M-003 - Player phone header touch targets: player header controls meet the 44px phone target.
- `[x]` M-004 - Auth session syntax/expiry repair: expired sessions clear cleanly and `auth.js` parses.
- `[x]` M-005 - Regression guards and cache bump: early mobile smoke guards and cache versioning were added.
- `[x]` M-010 partial - Responsive state contract: canonical `shell-*` classes/data states exist and mobile no-playbook startup opens the app shell.
- `[x]` M-011 partial - Scroll ownership: mobile shells report document scroll ownership and the viewport harness checks phone roles.
- `[x]` M-013 partial - Touch-target guardrail: shared controls and phone viewport checks catch undersized standalone targets.
- `[x]` M-014 - Development horizontal overflow detector: `bcDebugMobileOverflow()` reports visible overflow suspects.
- `[x]` M-015 partial - Reduced motion: global reduced-motion guardrail is covered by smoke checks.
- `[x]` M-023 partial - iPad/tablet responsiveness: touch-tablet shell detection covers iPad Pro, staff tablet Script keeps a two-pane editing layout, and the viewport harness has iPad assertions.
- `[x]` M-030 partial - Practice Script phone run mode: staff phones get current-call controls, scoring, period jump, log/present actions, and an Edit Sheet toggle.
- `[x]` M-031A - Player Script read-only portal: player logins see published/loaded scripts and cannot create/edit builder content.
- `[x]` M-032 partial - Call Sheet phone cards: phones render stacked situation cards with readable left/right hash call lists and reachable add/remove/swap/category actions.
- `[x]` M-033 partial - Wristband phone editor: classic wristbands render as tappable row cards on phones while tablet/desktop keep the printed card grid.
- `[x]` M-040 partial - Player presentation cut-off: portrait player presentation scrolls and clears bottom browser controls.
- `[x]` M-050 partial - Viewport harness: `scripts/mobile-viewport-check.mjs` runs local auth/viewport checks for admin, coach, and player.
- `[x]` M-051 partial - Automated assertions: horizontal overflow, phone startup, fixed overlap, touch target, and player-control assertions have initial coverage.
