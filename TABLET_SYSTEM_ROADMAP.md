# Tablet System Roadmap

This is the implementation plan for the 768–1366px tablet product: portrait and landscape, staff and player roles, browser and installed PWA. It turns the current static tablet audit into a shared system rather than a set of page-by-page media-query fixes.

This file complements [MOBILE_AUDIT.md](MOBILE_AUDIT.md). It does not replace, restate, or change that audit's completed-item history. In particular:

| Existing mobile item | What remains true | Tablet-system follow-through |
| --- | --- | --- |
| M-010 / M-023 | Canonical shell classes, tablet detection, Script tablet work, and initial iPad coverage exist. | Make shell classes the sole authority for every tablet mode. |
| M-011 | Phone document scroll and desktop panel scroll are defined and tested. | Define the actual scroll owner for tablet portrait and staff-landscape panel shells. |
| M-013 / M-015 | Shared phone target and safe-area guardrails exist, with known follow-up. | Apply them to tablet-only generated controls, fixed launchers, and layers. |
| M-050 / M-051 / M-052 | A viewport harness and initial iPad tests exist. | Add tablet-specific behavioral assertions, the missing wide-landscape profile, and a release gate decision. |

## Status legend and ownership

- [ ] Not started
- [~] In progress / partially complete
- [x] Completed and verified
- [!] Blocked

“Owner” is the accountable workstream, not a named individual. Assign a person when the item is scheduled.

## Coach/admin iPad phase — next

The player-study shell is now intentionally tablet-native. The next phase is not another general responsive pass: it makes the staff product a dependable iPad workbench for preparing a practice, managing a team, and publishing player material.

**System rule:** `staff rail → exactly one active workspace and vertical scroll owner → contextual workbench actions → managed task layer`.

| Order | Tranche | Outcome | Proof before release |
| --- | --- | --- | --- |
| P0.1 | **Workspace-surface isolation** | Opening Team/Admin Settings from Dashboard, Scout, Game Plan, or any sibling route hides the prior workspace completely. Settings owns the available canvas and its scroll; returning restores the original route. | 1024×768 and M1 WebKit: Dashboard → Settings leaves one visible workspace, a full-height settings scroller, and no underlying actionable panel. |
| P0.2 | **Clear the staff shell** | Remove any roomy-iPad fixed utility that covers live work; keep utilities in rail/header/page actions instead. Make staff header More rows touch-safe and give the rail/More entry a truthful active state for secondary destinations. | Geometry probe finds no fixed launcher over an actionable control; staff More targets are at least 44px; current route is visually represented in navigation. |
| P1.1 | **Team Ops first** | Turn Settings into a Team Ops workspace: team identity, roster, personnel, portal, and publish readiness come first. CSV replacement, backups, recovery, and destructive actions move to a clearly named Data & recovery area. Import remains the first-use path for an empty workspace, not the normal admin landing. | A 28-player iPad fixture reaches roster work in the first viewport; all independent Team Ops controls meet the tablet target policy. |
| P1.2 | **Accounts and access as iPad tasks** | Keep the existing data/layer behavior for Player Accounts and Coach Access, but give them usable-height layouts, 44px Close/actions, a focused list/detail flow, and a pinned Save/status footer where changes matter. | Portrait and landscape WebKit flows can select, edit, save, Escape-close, and return focus without losing work or hiding the footer behind keyboard/browser chrome. |
| P1.3 | **Coach command hierarchy** | Promote the Coach Home/Dashboard to a deliberate primary destination (recommended) and move only a lower-frequency workspace to More. Reduce mixed global/account/admin controls in the header. | A coach can identify the active destination and reach today’s next action, Script, Game Plan, Call Sheet, and Playbook without hunting through an ambiguous rail. |
| P1.4 | **Unified Coach Inbox foundation** | Migrate the existing Questions Inbox to the managed layer contract first, then evolve it into one staff triage surface for player questions, publishing/media readiness, quiz work, and moderation. Do not create a parallel inbox. | Layer lock, Escape, focus return, one scroll owner, and list/detail behavior pass at 1024×768, M1 landscape, and portrait. |
| P2 | **Physical-device release proof** | Complete the automated tablet evidence with a real M1 Safari and installed-PWA pass: rotation, keyboard, split view, account menu, settings, roster, accounts/access, and a live practice workflow. | Release checklist records the device/profile, tested workflow, and any intentionally unsupported narrow Split View size. |

### Decisions to make deliberately

- **Recommended:** make Dashboard/Coach Home a direct rail destination, then move Wristband to More. It makes the sideline workflow start with the current game week rather than a tool.
- Keep data recovery intentionally separate from ordinary team setup. It is vital, but it should never be the first surface a coach sees when they are preparing practice.
- Do not solve fixed-control collisions by adding more corner reservations. On roomy coach iPads, the rail and contextual actions are the calmer, more predictable home for utility actions.

### Already complete — do not redo

- Player navigation, Home, Presentation, diagram empty states, and the player iPad header are a separate completed track.
- Staff Script, Game Plan, Call Sheet, Playbook, Wristband, Signals, Tendencies, Dashboard command actions, Installation, Identity, and Offense Builder already have their first tablet workbench passes.
- Existing Player Accounts and Coach Access data behavior and blocking-layer lifecycle should be preserved; this phase changes their tablet ergonomics and task hierarchy, not their business logic.

## Current baseline

- Touch/iPadOS devices through a 1024px short side and 1366px long side become `.shell-tablet` / `.is-mobile-screen`. The shell now separates layout viewport, visual viewport, and device geometry in [js/app-shell.js](js/app-shell.js), so opening the software keyboard cannot reclassify an iPad as a phone or reverse its physical orientation.
- Tablet profiles are now explicit: `tablet-portrait`, `tablet-landscape`, and `tablet-compact`. The compact profile keeps a narrow Split View/Stage Manager window in the document shell instead of activating the landscape coach rail.
- Staff portrait tablets now use a document-scroll bridge in [css/responsive.css](css/responsive.css); roomy staff landscape tablets truthfully report panel scroll ownership and retain the fixed shell/rail in [css/layout.css](css/layout.css). Live verification confirms rail → More → Quiz is visible and scrollable; it is not an open defect.
- Staff tablet floating controls now occupy named stack slots: workspace sync at the usable edge, page actions above it, and Quick Tools above that on roomy profiles. The compact Split View profile deliberately suppresses Quick Tools and exposes Help in the existing header overflow, so two fixed launchers never compete for the same corner. The shared tablet matrix measures the rendered rectangles instead of relying on CSS values.
- The 44px tablet target gate now covers the player Dashboard refresh control, and the fixed-stack/rail test runs in `npm run test:tablet` as part of `npm run test:quality`.
- Player/study navigation now follows one explicit policy: narrow/short touch windows use the existing fixed bottom strip; roomy tablets retain sticky top tabs. The shell reserves only the chrome that is actually rendered.
- The first blocking-layer P0 is complete: Signals selector, Call Sheet Constraints, and Playbook Workflow now use the same focus, Escape, scroll-lock, safe-area, and return-focus lifecycle. The remaining layer work is the P1 migration of legacy surfaces and raw viewport-unit limits.
- Playbook now has a modal, locked filter sheet in portrait/compact tablet modes and a contextual, non-locking right rail in staff landscape. Call Sheet staff tablets now have persistent move/swap/remove controls rather than depending on drag-and-drop or hover.
- Container-driven Wristband, Game Plan, Signals, Tendencies, and Offense Builder workbenches now each have a named staff-tablet-landscape layout. The Chromium tablet matrix and curated Playwright WebKit iPad-emulation smoke are fail-closed release requirements; remaining work is legacy-layer semantics, residual target exceptions, uncovered secondary surfaces, and the separate physical-device Safari/PWA check.

### Latest verified implementation run — 2026-08-13

- `npm run test:tablet`: 24/24 pass — admin, coach, and player across the narrow-landscape Split View case (744x768), 744x1024, 768x1024, 820x1180, 834x1112, 1024x1366, 1024x768, and 1366x768. Every iPad case also simulates the keyboard’s `visualViewport` resize and verifies stable shell identity plus correct usable-height restoration.
- The staff iPad matrix now also exercises Signals selector, Constraints, and Playbook Workflow on every admin/coach case (14/14 layer probes): initial Close focus, background lock, one owned scroll region, reduced usable-height geometry, Escape, and original-trigger focus restoration.
- The same required matrix now seeds the Index Card editor at 744x1024 and 1024x768 (admin and coach): three persistent touch actions, bounded call/situation moves without hover or native drag, editor-free print markup, reachable Library close, explicit exit, and state restoration (4/4 focused editor probes).
- Focused local Playwright WebKit iPad-emulation runs pass for the constrained Wristband rail (1024x768 and 1366x768, with portrait preservation) and Signals landscape compaction (1024x768 and 1366x768, with portrait preservation).
- Focused local Playwright WebKit iPad-emulation runs also pass for the Game Plan Library/board rail (1024x768 and 1366x768, with portrait preservation) and the Wristband/Presentation target pass. The Tendencies command-path probe passes for admin and coach at both landscape widths (4/4).
- Focused local Playwright WebKit iPad-emulation contracts pass for the three shared blocking layers and the Page Actions → Constraints focus handoff in portrait and landscape.
- The keyboard-safe layer tranche passes focused local Playwright WebKit iPad-emulation checks in portrait and landscape for Playbook player filters, Script quiz, and Presentation. Call Sheet Layout/index/print lifecycle and geometry are enforced by a unit contract.
- Player Presentation now treats a published-diagram file refresh failure as transient when the same permanent media ID is already cached on that player device. It retains the cached diagram without allowing a sign-out, denial, or unpublished response to bypass the current release.
- Player navigation assertions verify `phone-primary-bottom` at 390x844, `tab-strip-bottom` at 768x1024, and `top-tabs` at 834x1112, 1024x1366, and 1024x768, with matching chrome variables.
- The focused local Playwright WebKit iPad-emulation drawer contract passes: 2 checks passed / 2 intentionally project-scoped skips, including landscape 1024x768 and 1366x768 geometry plus the portrait layer lifecycle.
- `npm run test:quality`: clean pass after the current tablet tranche — smoke checks, all unit contracts, the 24-case Chromium tablet geometry gate, the curated WebKit iPad-emulation smoke (30 passed / 6 intentionally project-scoped skips, no retries), and all five local first-load hydration cases with no retry.
- Focused player Presentation regression: a published manifest followed by a temporary `503` file response still renders the canonical player-cache diagram and never shows the misleading stable-connection fallback (`tests/specs/19-player-presentation-diagram-cache.spec.js`, Chromium and iPad-landscape local runs).
- Consolidation checkpoint: `npm run test:unit`, `node scripts/smoke-check.js`, and the 24-case `npm run test:tablet` matrix all pass after the shared Reorder and Game Plan disclosure-target work.
- Release-gate contract: `npm run test:tablet` is fail-closed inside `test:quality` and `release-quality-gate`, which run in PR/main CI and both guarded production deploy paths. Its required Chromium matrix is admin, coach, and player at 744x768, 744x1024, 768x1024, 820x1180, 834x1112, 1024x768, 1366x768, and 1024x1366; the contract prevents it becoming `--warn-only`. `test:quality` also runs the strict, serial WebKit iPad-emulation smoke across the curated interaction surfaces; CI installs both browsers and reserves 30 minutes for the complete fail-closed gate.
- T-011e completes the two intentionally deferred blocking surfaces: Playbook Print keeps its drawer visual while using a safe-area LayerManager lifecycle with an owned inner scroller, managed Escape, delayed iPad initial-focus handoff, and nested Reorder return focus; the Game Plan phone Bulk sheet is now a body-level managed dialog that survives board re-renders and closes safely on navigation. Their focused Playwright checks and unit contracts pass.
- T-009 Playbook authoring/Data Cleanup completion: tablet staff authoring controls, Data Cleanup fields/actions, and Category Cleanup controls now receive screen-only coarse-pointer targets. Native WebKit selects use explicit 44px heights, rather than relying on `min-height`; portrait and 1366x768 landscape flows cover editor, cleanup, suggest/Keep, merge, and category-cleanup interactions.
- Cache version: `v1697` in both `index.html` and `sw.js` so installed/PWA clients receive the shell and CSS changes together.

### Visual UX closeout — 2026-08-13

- A role-by-role WebKit visual pass closed the observed collision and density defects rather than relying only on breakpoint coverage: Call Sheet page/orientation controls now remain separate 44px targets, and the short compact profile hides the redundant Game Plan pull-tab instead of letting it cover Finalize.
- The compact staff policy now has one lower-corner primary action surface: Page Actions remains visible, Help is available from header overflow, and Quick Tools is intentionally absent. Roomy landscape reuses the vacant page-action slot for Quick Tools, clear of Script and Call Sheet commands. The required harness and [compact WebKit regression](tests/specs/29-compact-tablet-quick-tools.spec.js) prove both behaviors.
- Player compact Dashboard no longer reserves a 360px empty “Today” card after its hero stacks; Player Playbook filter choices are 44px; and the Questions header action stays an accessible icon-only control instead of wrapping into the compact header.
- Wristband staff-landscape Library/Actions/Save controls now take one readable row rather than splitting words inside the post-rail workspace. [Call Sheet portrait control coverage](tests/specs/28-callsheet-ipad-portrait-controls.spec.js) and the expanded WebKit release smoke prevent the regressions.
- Final quality proof: `npm run test:quality` passed — 24/24 Chromium tablet matrix cases, 37 WebKit iPad checks with 13 intentional profile-scoped skips, and 5/5 local hydration checks. The only remaining visual note is optional Player Playbook quick-filter edge affordance; the row is functional and intentionally backed by the full Filters entry.

### Second-pass audit — 2026-08-13

This pass exercised real touch-emulated tablet shells after the core shell work. The 24/24 matrix remains green; its current route coverage does **not** make the issues below acceptable. These are the next evidence-backed product risks, ordered by the shared primitive that removes them.

| Priority | System defect | Concrete evidence | Required outcome |
| --- | --- | --- | --- |
| P0 — closed by T-007a | Blocking surfaces did not consistently use the layer lifecycle. | Signals selector, Call Sheet Constraints, and Playbook Workflow now use `openLayer()` / `closeLayer()` and have dedicated WebKit and Chromium tablet regression coverage. | Every migrated blocking surface locks background scroll, transfers the scroll owner to `layer`, moves/traps focus, has Escape/visible Close, respects safe areas, and restores trigger focus. |
| P0 — closed by T-008a | Wristband became a serial page in constrained staff landscape. | At 1024x768, the 78px rail left an ~850px inner workspace, but the `max-width:1024` rule stacked Library above Builder. The scoped rail now keeps them side-by-side. | A coach can inspect plays and edit a wristband in the same landscape workbench: 240–280px collapsible Library rail, full-height Builder, and deliberate pane scrolling. |
| P1 — closed by T-006b | Index Card editing was mouse-density UI in a tablet product. | Bucket/row controls measured 15–30px, row actions were hover-gated, and situation ordering was HTML drag-and-drop only. | Preserve print fidelity while supplying a 40px editor-only action-sheet path and deterministic move controls. |
| P1 — closed by T-008 | Tablet-landscape board layouts skipped their compact Coach Grid systems. | Wristband, Game Plan, Signals, and Tendencies now each use a shell-scoped staff-landscape workbench path, with named scroll owners and reachable primary/overflow actions. | Select layouts from usable post-rail width, keep 44px primary targets, and place secondary actions in overflow. |
| P1 — partially closed | A few legacy layer families still need normalized viewport ownership. | Signals, Playbook player filters, Call Sheet/Game Plan index/print modals, Script quiz, Game Plan legacy dialogs, and the complete first Playbook report/cleanup family now use the shared usable-height contract. The shared Reorder dialog is also managed safely above nested parents. | Shared usable-height and safe-area sizing follows `--app-vh`, so a keyboard or browser chrome cannot hide Close/footer actions. |
| P1 — partially closed | The tablet gate missed stateful editors and print-derived controls. | The matrix now seeds/navigates to Call Sheet Index Cards; Wristband grids remain deliberately exempt. | Add seeded editor/layer scenarios and require target/behavior assertions, not only the landing screen scan. |
| P2 — partially closed | Remaining target exceptions are undocumented. | `--tap-min` (44px) and `--tap-compact` (40px) now govern repaired Wristband batch swatches, Player Card Reset, Script Period Manager and secondary editors, Presentation navigation, Game Plan assigned-play Actions, native Coverage/Touch Tracker disclosures, and live Wristband classic/print-setup controls. That Game Plan menu exposes flags and deterministic reorder without hover or native drag. The remaining P1/P2 exception inventory is now explicit. | Introduce named compact/minimum target tokens and an explicit, narrow print/inline-text exception list. |

### Next implementation tranche — do in this order

1. **Physical-device release check:** retain a documented Safari/iPad installed-PWA release-candidate pass for safe areas, keyboard, rotation, and Split View/Stage Manager; Playwright WebKit emulation is a release gate, not a substitute for that device proof.
2. **T-009 residual exceptions:** audit the remaining explicit P2 inline/print exceptions one editor at a time and promote only independently tappable controls to the tablet target standard.
3. **Legacy modal follow-through:** audit remaining layer families one at a time rather than applying a broad modal conversion.

## Priority checklist

### P0 — establish the tablet contract first

- [~] **T-001 — Canonical tablet shell modes**
  - Owner: Shell & interaction platform
  - Status: Core shell modes and player/study policy shipped; broader profile/release coverage remains.
  - Evidence: [js/app-shell.js](js/app-shell.js), [css/responsive.css](css/responsive.css), [css/layout.css](css/layout.css)
  - Define exactly three tablet modes:
    1. tablet-portrait-document: document owns vertical scroll.
    2. tablet-staff-landscape-panel: fixed shell, panel/workbench owns vertical scroll, rail replaces top tabs.
    3. tablet-player-or-study: choose and document either top-tab document navigation or bottom navigation; CSS and variables must agree.
  - Remove the implicit “mobile” meaning from page media queries. A page may refine a named shell mode, but must not reclassify the device from physical width.
  - Completed: stable tablet classification, keyboard state, compact layout profile, staff portrait/landscape mode selection, and the explicit narrow-bottom/wide-top player navigation policy.
  - Remaining: cover the wider landscape profiles in the regular tablet matrix and make the WebKit/iPad release policy explicit.
  - Acceptance: 744x768, 744x1024, 768x1024, 820x1180, 834x1112, 1024x1366, 1024x768, and 1366x768 each produce one documented shell mode and one vertical scroll owner.

- [~] **T-002 — Make scroll-owner state truthful**
  - Owner: Shell & interaction platform
  - Status: Staff shell contract shipped; module-level inner scroll review remains.
  - Evidence: [js/app-shell.js](js/app-shell.js), [css/layout.css](css/layout.css), [css/script-quiz.css](css/script-quiz.css).
  - Derive data-scroll-owner from the actual named tablet mode, not isMobile alone.
  - Extend scrollElementWithinPanel() so it uses the real owner rather than “not mobile means panel” ([js/app-shell.js:368](js/app-shell.js:368)).
  - Replace direct panel scrollIntoView() calls with the shared helper where a panel can be the owner.
  - Completed: staff `tablet-landscape` reports `panel`; tablet portrait and compact report `document`; the shared scrolling helper now follows that state.
  - Remaining: replace the remaining direct module scroll calls and audit intentional inner workbench panes.
  - Acceptance: rotation preserves the active tab and selected record without moving the hidden main shell; no mode has competing document + unapproved panel vertical scrolling.

- [x] **T-003 — Fixed-control coordinator**
  - Owner: Shell & interaction platform
  - Status: Completed and covered by the tablet quality gate.
  - Evidence: [css/components.css](css/components.css), [css/layout.css](css/layout.css), [scripts/mobile-viewport-check.mjs](scripts/mobile-viewport-check.mjs).
  - Create named fixed slots and clearance variables, for example --fixed-bottom-clearance and --fixed-action-slot.
  - Allow only one primary launcher in a slot. Consolidate, move, or suppress Quick Tools when page actions are active; offset sync status from the interactive launcher.
  - Give every document-scroll panel bottom padding from the same clearance variable.
  - Completed: named slots reserve the usable edge, page-action cluster, and Quick Tools stack; compact tablet deliberately uses Page Actions plus header-overflow Help instead of Quick Tools. Portrait/landscape role checks measure actual visible rectangles and restore their UI state after probing.
  - Acceptance: on 744x768, 744x1024, 768x1024, 820x1180, 834x1112, 1024x1366, and 1024x768 staff screens, Page Actions/Library, Quick Tools, sync status, toast, and any dock never overlap or obscure one another.

- [x] **T-004 — Player/study navigation consistency**
  - Owner: Player experience + shell platform
  - Status: Completed and enforced by the tablet harness.
  - Evidence: [js/app-shell.js](js/app-shell.js), [css/responsive.css](css/responsive.css), [scripts/mobile-viewport-check.mjs](scripts/mobile-viewport-check.mjs), [tests/mobile-shell-viewport-contract.test.mjs](tests/mobile-shell-viewport-contract.test.mjs).
  - Completed: the shell uses the same narrow/short media rule as CSS to select the fixed bottom strip. At 834px+ / 1024px tablets it retains sticky top tabs and their measured `--app-tabs-height`; at 768x1024 it reserves the real bottom strip instead.
  - Acceptance: active navigation, sticky offsets, panel bottom padding, and visible chrome match at 834x1112, 1024x1366, and 1024x768.

- [ ] **T-004a — Ultra-narrow tablet Split View navigation policy**
  - Owner: Player experience + shell platform
  - Status: Deferred boundary decision.
  - Evidence: a physical iPad window narrower than 560px can match phone CSS that hides the main tab strip while remaining `.shell-tablet`; the current supported compact-tablet matrix begins at 744px.
  - Decide whether sub-560px iPad Split View should promote to the phone primary navigation, keep a reduced tablet strip, or be a documented unsupported size. Then add that profile to the matrix.

### P1 — remove confirmed module seams

- [x] **T-005 — Playbook tablet drawer contract**
  - Owner: Playbook
  - Status: Completed and covered by a focused local WebKit iPad contract.
  - Evidence: [css/playbook.css](css/playbook.css), [js/playbook-chrome.js](js/playbook-chrome.js), [tests/specs/11-playbook-tablet-drawers.spec.js](tests/specs/11-playbook-tablet-drawers.spec.js).
  - Completed: portrait and compact tablet filters are a blocking, Escape-closeable layer with a visible 44px Close target. Staff tablet landscape uses a contextual right rail, clear of the 78px navigation rail, so navigation stays available and the background is intentionally not locked. Phone-only action sheets cannot create a hidden tablet layer.
  - Acceptance: opening/filtering/closing works at 1024x768 and 1366x768 landscape plus portrait; Close remains visible; modal modes lock and restore scroll/focus; the contextual landscape rail neither clips behind nor overlaps the app rail.

- [x] **T-006 — Call Sheet sticky and touch affordances**
  - Owner: Call Sheet
  - Status: Completed and enforced by the tablet harness.
  - Evidence: [css/callsheet.css](css/callsheet.css), [js/callsheet-render.js](js/callsheet-render.js), [tests/callsheet-save-current-contract.test.mjs](tests/callsheet-save-current-contract.test.mjs).
  - Tie sticky offset to the active scroll-owner mode: panel top 0 versus document header + tabs.
  - Make destructive/context actions visible and touch-reachable on shell-tablet, not hover-dependent.
  - Completed: portrait tablet category headers clear measured app chrome. Live staff rows and blank spacers wrap to a persistent second action row with visible token-sized move, hash-swap, and remove controls; the interaction-only wrapper is isolated from print.
  - Completed: Index Cards retain their fixed physical print markup, while tablet editing now exposes one persistent 40px Actions control per call with move/indent/compact/edit/remove choices. Situation Manage provides bounded up/down through the existing `moveCallSheetIndexBucket()` helper. The toolbar wraps/scrolls rather than shrinking controls, has an explicit Call Sheet exit, and the Index Card Library close is 40px.
  - Proof: the required matrix seeds two situations and three calls at 744x1024 and 1024x768 for admin and coach, exercises call/situation moves without hover or native drag, asserts print markup is editor-free, and restores state.
  - Acceptance: category headers never hide under chrome, and a touch-only user can remove/edit/reorder live calls and index-card calls without hover.

- [~] **T-007 — Layer and viewport-unit normalization**
  - Owner: Shell & interaction platform
  - Status: T-007a P0 complete; targeted T-007b through T-011e families complete; deliberately deferred legacy families remain.
  - Evidence: [js/dom-helpers.js](js/dom-helpers.js) now provides initial-focus fallback (explicit target, autofocus/Close, then first enabled focusable), `preventScroll`, idempotent same-layer reopens, blocking Escape ownership, nested-safe layer opening, and safe return-focus behavior. Signals selector ([js/signals.js](js/signals.js)), Call Sheet Constraints ([js/constraints-ui.js](js/constraints-ui.js)), and Playbook Workflow ([js/playbook-render.js](js/playbook-render.js)) use it. Game Plan and the Playbook report/cleanup families are now migrated; only deliberately deferred legacy modal semantics remain.
  - **T-007a P0 — completed:** all three P0 surfaces call `openLayer(... { blocking:true, scrollElement, initialFocus, onEscape })` and `closeLayer()` before hiding/removal. Constraints also carries the original Page Actions trigger through its delayed handoff. The manager contains focus even for an otherwise empty dialog and consumes managed Escape before legacy page shortcuts can react. Coverage: [tests/layer-manager-focus-contract.test.mjs](tests/layer-manager-focus-contract.test.mjs), [tests/specs/12-tablet-blocking-layers.spec.js](tests/specs/12-tablet-blocking-layers.spec.js), [tests/specs/12-callsheet-constraints-layer.spec.js](tests/specs/12-callsheet-constraints-layer.spec.js), and the required iPad harness probe.
  - **T-007b P1 — migration tranche complete:** [css/base.css](css/base.css) now exposes visual-viewport and safe-area-derived usable-height tokens. Playbook player filters, Script local/authoritative/homework/leaderboard dialogs, Presentation, Call Sheet Layout/index/print, and Game Plan Index Cards/Print options use the contract; their blocking paths own focus, Escape, and a bounded scroll region. Game Plan Index Cards and Print now have a source contract in [tests/gameplan-index-print-modal-contract.test.mjs](tests/gameplan-index-print-modal-contract.test.mjs), included in `test:unit`, plus a focused iPad-landscape lifecycle/geometry test. A real tablet-portrait Presentation Close regression (28.7px) was corrected to 44px.
  - **T-007b P1 — Game Plan and first Playbook report families complete:** Game Plan Manage Boxes, Box Info, Sort All, Personnel Variants, Matching Rules, and Smart Builder now use named inner scroll regions and the managed layer lifecycle. Playbook Balance, Situation Coverage, Touches, and Data Health do the same, with portrait/landscape iPad proof for the report family. Their static contracts are included in `test:unit`.
  - **T-011c — shared Reorder complete:** Script, Call Sheet, Wristband, and Game Plan retain their existing caller-specific mappings through one managed `showReorderModal()` layer. It is safe above legacy top-level dialogs, preserves parent layers with `exclusive:false`, has a single body scroll owner and safe visual-viewport sizing, exposes 44px touch move controls as an alternative to drag-and-drop, and restores focus correctly after Escape. Focused iPad portrait/landscape coverage in [tests/specs/23-reorder-modal-layers.spec.js](tests/specs/23-reorder-modal-layers.spec.js) proves standalone Script and nested Call Sheet flows; [tests/reorder-modal-layer-contract.test.mjs](tests/reorder-modal-layer-contract.test.mjs) keeps all six callers on the shared path.
  - **T-011d — deferred Playbook cleanup/report family complete:** Category Cleanup, Constraint Map, and Identity Alignment now reuse the named blocking report-layer lifecycle with one body scroll owner, safe-area visual-viewport geometry, initial Close focus, Escape, and trigger return focus. Category Cleanup deliberately retains its first-Escape-clears-search behavior before a second Escape closes it. The Print drawer remains explicitly outside this migration. [tests/specs/24-playbook-deferred-layers.spec.js](tests/specs/24-playbook-deferred-layers.spec.js) proves portrait/landscape lifecycle; [tests/playbook-deferred-layer-contract.test.mjs](tests/playbook-deferred-layer-contract.test.mjs) is included in `test:unit`.
  - **T-011e — Print drawer and Game Plan phone Bulk sheet complete:** Print options is now a real blocking drawer with safe-area geometry, a single inner scroll owner, managed Escape, initial Close focus, exact trigger restoration, and nested Reorder support. The phone Bulk sheet is a stable body portal with equivalent blocking lifecycle and navigation cleanup, so it cannot be destroyed by a board re-render. Both are covered by focused device-form-factor checks and unit contracts.
  - **T-007 remaining:** audit other legacy modal families one at a time and remove residual raw viewport assumptions only after each surface has a behavior check.
  - Decide whether full-screen-pointer-capturing panels such as Call Sheet/Script Display are true contextual, nonmodal panels or blocking layers; their current semantics are ambiguous.
  - Required proof: portrait/landscape and reduced-`visualViewport` runs assert visible Close/action controls, `body.app-layer-locked`, `data-scroll-owner="layer"`, Escape close, and trigger-focus restoration.
  - Acceptance: browser chrome, installed PWA, keyboard resize, and rotation never make a close/action footer unreachable or allow background interaction under a blocking surface.

- [x] **T-008 — Container-driven board layouts**
  - Owner: Game Plan, Signals, Tendencies, Wristband
  - Status: Completed and covered by focused iPad tests plus the Tendencies tablet harness probe.
  - **T-008a P0 Wristband — completed:** staff tablet landscape now uses a 240–280px collapsible Library rail beside a full-height Builder. The Library results list and Builder are named, independent scroll regions; close returns focus to the persistent Builder Library toggle. Desktop, portrait, player, and print rules remain unchanged. Coverage: [tests/specs/13-wristband-tablet-rail.spec.js](tests/specs/13-wristband-tablet-rail.spec.js).
  - **T-008b P1 Game Plan — completed:** staff tablet landscape now uses a direct-toggle, closable 240–280px Library rail alongside guarded >=300px board cards. `gpLibraryList` and `gpBoxes` are named scroll owners. Box headers retain a 44px Add path and move the rest into a reachable 44px More disclosure. Coverage: [tests/specs/15-gameplan-tablet-rail.spec.js](tests/specs/15-gameplan-tablet-rail.spec.js).
  - **T-008c P1 Signals — completed:** staff tablet landscape restores a four-stat compact row, adaptive 280px category tracks, and 44px Optimize/Watch targets while preserving the constrained 1024 detail-below-categories mode. Coverage: [tests/specs/14-signals-tablet-landscape.spec.js](tests/specs/14-signals-tablet-landscape.spec.js).
  - **T-008c P1 Tendencies — completed:** staff tablet landscape keeps Back + Overview/Film Log + Chart/New direct and puts secondary header/toolbar actions in anchored 44px More menus. The film table owns only horizontal scroll while the panel remains the vertical owner; menu Undo/Redo state stays synchronized. The required harness exercises admin and coach at 1024x768 and 1366x768 (4/4).
  - Evidence: no document-level horizontal overflow was found; active panels correctly own vertical scroll. The defect is layout density caused by physical-width/desktop-only selectors, not general shell overflow.
  - Use available inline workspace size (container queries where practical), not raw viewport width, especially after the 78px rail is reserved. For each workspace, document deliberate scroll regions.
  - Acceptance: at 1024x768 and 1366x768, a coach sees the active editor and source context together, board cards remain legible, and nested scrolling is deliberate and visibly bounded.

### P2 — consistency and density hardening

- [~] **T-009 — Tablet touch-target audit**
  - Owner: Design system + module owners
  - Status: P0 and the identified P1 paths are repaired; only explicit P2 inline/print exception review remains.
  - Evidence: [css/base.css](css/base.css) now supplies `--tap-min: 44px` and `--tap-compact: 40px`. Staff-tablet Wristband batch swatches and tablet-landscape Presentation Prev/Next/Close now meet the standard, while Signals Watch and Game Plan primary actions are also repaired by their workbench migrations.
  - Establish --tap-min and --tap-compact tokens with documented exceptions for print replicas.
  - Require an invisible expansion wrapper or a 40–44px control for interactive tablet elements; do not enlarge printed output merely to enlarge a hit area.
  - Completed: the viewport harness now makes remaining non-exempt controls under 44px fatal for every iPad profile; the player Dashboard refresh target is corrected to 44px. The named target tokens, Wristband swatches, and tablet Presentation nav/Close are now covered by focused WebKit checks.
  - Completed: staff tablet Game Plan assigned-play rows now have one persistent 44px Actions target; its menu and the matching long-press menu expose wristband/JV flags, deterministic moves, move-to-box, and removal. Focused WebKit coverage verifies the target sizes and flag path at 1024x768 and 1366x768.
  - Completed P0: Player Wristband's destructive assignment Reset is no longer a 14px overlay. On coarse pointers, only override-bearing cells reflow to an in-flow 44px Reset column beside independently usable rule-source and assignment fields; desktop and print remain dense. Script Period Manager's Close, row reorder/duplicate/delete actions, and footer actions now use scoped 44px coarse-pointer controls with managed initial Close focus and Escape. Focused iPad portrait/landscape coverage exercises the real Reset mutation plus Period Manager movement, Close, and Escape.
  - Completed P1: Game Plan's real Coverage and Touch Tracker `<summary>` disclosures now retain native `details` behavior while exposing 44px screen-only coarse-pointer targets. Media scoreboards, print, rails, and dialogs remain unchanged; focused iPad portrait/landscape coverage opens and closes both disclosures.
  - Completed P1: Script quick-personnel, period presets, and live color controls now have scoped 44px staff-tablet targets without widening phone, desktop, print, or template-picker behavior. Focused portrait/landscape flows mutate a real personnel variant, preset, and color.
  - Completed P1: Wristband’s physical print card stays exact-size, while the live classic-card editor now uses 44px tablet rows and its print-setup card/position/Blank-rule controls are real 44px screen targets. Focused portrait/landscape coverage opens a real cell editor and operates both classic and player print setup.
  - Completed P1: Player Playbook summary actions and quick-filter pills now use 44px targets only in coarse-pointer tablet study shells. Compact phones, staff authoring density, editor/report layers, and print remain unchanged; real player filter flows pass in portrait and landscape.
  - Completed P1: Playbook editor/data-cleanup and Category Cleanup controls now use scoped, screen-only coarse-pointer targets in staff tablet shells. Native WebKit selects receive explicit 44px heights, avoiding their intrinsic compact height. Focused portrait and 1366x768 landscape flows cover editor, Data Cleanup, suggestions/Keep, merge, and Category Cleanup; print remains untouched.
  - Remaining: review only the documented P2 inline/print exceptions individually; do not apply a global target-size override to print replicas or dense static reference content.
  - Acceptance: every independently tappable control in the tablet matrix meets the assigned target or has a documented inline-text/print exception.

### T-010 status — secondary-page migration, evidence-qualified

The next staff-tablet-landscape tranche is **Dashboard + Installation + Identity**. It shares one selector problem: their operational compact rules are constrained to `body:not(.is-mobile-screen)`, while their narrow fallback rules stop at 768–900px. A 1024px staff iPad landscape therefore gets neither intentional desktop Coach Grid density nor an intentional tablet path.

1. **Dashboard — P1 — complete:** direct Search, active opponent, and week controls remain visible; Duplicate, Archive, and Archives use a 44px anchored More menu; its panel owns vertical scroll.
2. **Installation — P1 — complete:** direct search plus 44px header/checklist overflow controls make the compact command hierarchy intentional at both landscape widths.
3. **Identity — P2 — complete:** readable two-column landscape reference cards and 40px hero controls preserve portrait and print behavior.
4. **Offense Builder — P1 — complete:** clickable cards, star ratings, clear, concept, and related-play controls are native buttons; staff landscape uses a 240–280px source rail with independent list/detail scroll owners, while portrait stays stacked. The global Arrow-key selection path now scrolls the rendered active card correctly.

**Completed 2026-08-13:** Dashboard now keeps Search, active opponent, and week direct in staff tablet landscape, while Duplicate/Archive/Archives use a 44px anchored More menu; its focused WebKit check covers 1024x768 and 1366x768. Installation now keeps search direct with 44px anchored header/checklist More menus, and Identity retains a readable two-column landscape reference with 40px hero controls. Both preserve portrait behavior and pass their focused iPad contract. Offense Builder now has semantic card/rating/navigation controls, 44px tablet targets, a compact 240–280px landscape source rail, independent scroll owners, and focused portrait/landscape iPad coverage; its static contract is part of `test:unit`.

- [~] **T-010 — Secondary-page migration**
  - Owner: Module owners
  - Status: The evidence-backed Dashboard, Installation, Identity, and Offense Builder tranche is complete. Other secondary surfaces remain an audit queue, not an implied acceptance.
  - Scope: Dashboard, Offense Builder, Identity, Installation, Tendencies, Signals, Wristband, and presentation supporting layers.
  - Evidence: several modules still switch only at <=640/<=820 (for example Dashboard [css/dashboard.css:1308](css/dashboard.css:1308), Offense Builder [css/offense-builder.css:110](css/offense-builder.css:110), and Installation [css/installation.css:610](css/installation.css:610)).
  - Completed for Dashboard, Installation, Identity, and Offense Builder: each has a named landscape intent, an explicit scroll-owner decision, and focused iPad behavior proof. Migrate all remaining modules one at a time; do not apply broad width-only overrides.
  - Acceptance: each migrated module has a documented portrait and landscape intent, one scroll-owner decision, and a screenshot/behavioral test.

## Phased top-down execution

### Phase A — contract and shell (T-001 through T-004)

Deliver a small, explicit tablet shell API before editing feature CSS:

| Concern | Required contract |
| --- | --- |
| Classification | js/app-shell.js is the only classifier; CSS consumes its classes/data attributes. |
| Scroll | One semantic owner per mode: document, panel, or layer. |
| Chrome | Measured header/tab/rail/dock variables are valid in every role and orientation. |
| Fixed UI | Slots, offsets, and content clearance are centrally allocated. |
| Navigation | Staff landscape rail, staff portrait tabs/dock, and player/study navigation each have a documented mode. |

Phase-A exit criteria:

- The browser can expose a debug snapshot with mode, actual scroll owner, fixed-slot occupants, and measured chrome.
- A 90-degree rotation changes only the intended mode and preserves active route/selection.
- No module is allowed to set a global fixed bottom/right position without using the slot system.

### Phase B — shared primitives (T-005 through T-007)

Build and use these reusable primitives:

1. A tablet drawer primitive with a defined viewport/panel owner.
2. A sticky-offset token derived from the active scroll owner.
3. One blocking LayerManager contract: lock, safe-area/usable-height sizing, initial focus, focus trap, Escape, and return focus.
4. Touch-target wrappers and compact action sheets for print-derived/dense editor controls.
5. A single scrolling helper that respects document, panel, and layer ownership.

Phase-B exit criteria:

- Playbook, Call Sheet, Signals, Script tools, Page Actions, and global overlays follow the same drawer/layer/scroll rules.
- A visual collision probe finds no active fixed controls covering another actionable control.

### Phase C — workspace migrations (T-008 through T-010)

Sequence modules by sideline risk:

1. Wristband landscape editor and Call Sheet Index Cards.
2. Game Plan board and Playbook/Script supporting surfaces.
3. Signals and Tendencies.
4. Dashboard, Installation, Identity, and Offense Builder.
5. Presentation refinements last; it is already the strongest shell-class example and should be preserved as a reference implementation.

Phase-C exit criteria:

- Each workspace uses an available-width decision where a rail/sidebar can change usable width.
- Each module has no more than its documented scroll regions.
- Tablet landscape does not silently inherit phone density or desktop mouse-only affordances.

### Phase D — proof and release policy

Add the following required tablet profiles:

| Profile | Role coverage | Key assertions |
| --- | --- | --- |
| 744x768 | admin, coach, player | landscape iPad Split View / Stage Manager window uses `tablet-compact` document mode |
| 744x1024 | admin, coach, player | narrow portrait tablet candidate, document ownership |
| 768x1024 | admin, coach, player | portrait document mode, visible bottom clearance |
| 820x1180 | admin, coach, player | breakpoint seam / no fixed collisions |
| 834x1112 | admin, coach, player | larger-iPad shell rules and player navigation |
| 1024x1366 | admin, coach, player | large portrait, drawers, sticky offsets |
| 1024x768 | admin, coach, player | staff rail / constrained workspace |
| 1080x810 and 1180x820 | admin, coach, player | realistic iPad landscape |
| 1366x768 | admin, coach, player | wide iPad landscape; Playbook drawer and available-width layouts |

Required assertions:

- correct named shell and actual scroll owner;
- no horizontal overflow except approved tables;
- no fixed-control rectangle overlap;
- active navigation and selected item survive rotation;
- drawers and layers have a visible close control and correct lock/focus restoration;
- required targets meet tablet hit sizing;
- seeded Index Card and Wristband editor states work without hover or native drag-and-drop;
- reduced `visualViewport` preserves a visible Close/action footer and blocks background interaction;
- player role cannot expose staff controls.

The Chromium geometry matrix is required through `npm run test:tablet` inside `npm run test:quality`. A curated, fail-closed Playwright WebKit iPad-emulation smoke now runs beside it through `npm run test:webkit:ipad`; CI installs both browsers in [.github/workflows/quality.yml](.github/workflows/quality.yml). This does not replace physical-device proof: retain a manual installed-PWA Safari/iPad release-candidate check for safe areas, keyboard, rotation, and Split View/Stage Manager.

## Definition of done

The tablet system is complete only when all of the following are true:

- [ ] Every 768–1366 profile maps to a named shell mode with a truthful scroll owner.
- [ ] The system, rather than individual pages, allocates sticky offsets, fixed controls, safe areas, layers, and touch targets.
- [ ] Staff can edit efficiently in landscape without hover-only actions or crowded rails.
- [x] Player/study tablet navigation and content clearance match the chosen navigation model for the supported matrix.
- [~] Drawers, modals, and presentation surfaces work across browser/PWA modes and rotation. Playbook is complete; shared layer migration and other modules remain.
- [~] The tablet regression matrix runs routinely, includes 1366x768, and has an explicit WebKit policy: required Playwright WebKit emulation plus a pending manual physical Safari/iPad PWA release-candidate check.

## Verification command set

Use these after implementation; do not treat a green static scan as a substitute for the matrix:

1. node scripts/smoke-check.js
2. npm run test:tablet
3. npm run test:webkit:ipad
4. npm run test:e2e:local:hydration
5. npm run test:quality
6. Manual installed-PWA Safari/iPad checks for safe areas, keyboard, rotation, and Split View/Stage Manager.

### Physical Safari/iPad PWA release-candidate checklist

Playwright's WebKit project is required automated coverage, but it is still browser emulation. For a release that changes shell, layer, safe-area, keyboard, or Presentation behavior, record this short check on a real iPad before declaring the device policy complete:

1. In Safari, sign in as a player to a release that contains at least one published play with a diagram. Open that play in Presentation while online so its canonical diagram is cached on the device.
2. Add the app to the Home Screen, open the installed PWA, and repeat the Presentation check in portrait and landscape. The diagram, Close/Prev/Next controls, and safe-area spacing must remain visible.
3. Without clearing site data, temporarily disable connectivity and reopen the same cached diagram in Presentation. It must render from the device cache and must not show the misleading stable-connection message. Re-enable connectivity before continuing.
4. As staff, rotate while an input keyboard is open, then check a landscape rail/workspace and one blocking layer (for example Playbook filters, Call Sheet Constraints, or Print). Navigation must not change form factor, the layer Close/footer must remain visible, and the background must not respond while the layer is open.
5. In supported Split View or Stage Manager widths (744px+), verify the compact/portrait/landscape shell route still has one scroll owner and reachable Page Actions/Quick Tools. Treat sub-560px windows as the separately deferred T-004a policy rather than passing them implicitly.
6. Record device model, iPadOS version, browser versus installed-PWA result, and any failure screenshot. A failure blocks release when it prevents a player from viewing a cached, authorized diagram or makes an active control unreachable.
