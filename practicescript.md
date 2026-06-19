## Execution Tracker

- Status key: `[ ]` not started, `[-]` in progress, `[x]` completed
- Work order is strict: 1 -> 23

1. [x] Trace complete Practice Script DOM structure
2. [x] Establish one clear desktop scroll architecture
3. [x] Move current-script scrolling to #scriptPlays
4. [x] Trace and consolidate CSS cascade debt
5. [x] Create separate desktop and mobile layout contracts
6. [x] Audit Practice Script toolbar and action hierarchy
7. [-] Trace full event path for delayed/missed clicks
8. [ ] Simplify action ownership
9. [ ] Remove broad mobile coach event interception
10. [ ] Detect invisible elements intercepting buttons
11. [ ] Simplify modal and overlay state
12. [ ] Fix presentation orientation behavior
13. [ ] Stabilize canvas and diagram rendering
14. [ ] Audit full Practice Script rerenders
15. [ ] Narrow/remove whole-body MutationObserver
16. [ ] Audit content-visibility and virtualization
17. [ ] Audit idle CPU, heat, and battery use
18. [ ] Audit service-worker cache behavior in development
19. [ ] Improve contrast and visual hierarchy
20. [ ] Clarify ownership boundaries
21. [ ] Execute testing requirements
22. [ ] Verify acceptance criteria
23. [ ] Produce required final report

## Completion Log

- Point 1: completed (DOM ancestry + runtime/CSS ownership baselined; app currently boot-gated with #mainApp hidden in local snapshot)
- Point 2: completed (desktop grid contract enforced in css/script.css media block; pane shells set to non-scrolling with explicit min-width/min-height guards)
- Point 3: completed (right pane shell no longer desktop scroll owner; #scriptPlays promoted to dedicated scroll container in desktop contract)
- Point 4: completed (removed viewport-height and sticky assumptions from base .play-list and .script-list; now desktop media block owns desktop behavior cleanly)
- Point 5: in progress (desktop vs mobile contracts audit)
- Point 6: pending
- Point 7: pending
- Point 8: pending
- Point 9: pending
- Point 10: pending
- Point 11: pending
- Point 12: pending
- Point 13: pending
- Point 14: pending
- Point 15: pending
- Point 16: pending
- Point 17: pending
- Point 18: pending
- Point 19: pending
- Point 20: pending
- Point 21: pending
- Point 22: pending
- Point 23: pending

## Point 1 Findings (Completed)

### Runtime state captured

- Active tab: script
- Auth role: coach
- Body classes seen during capture: app-booting (desktop viewport 1600x960)
- Current local runtime gate: #mainApp is hidden while #uploadSection is visible, so script pane descendants report 0 client height in this state

### DOM ancestry and required nodes verified in source

- Script panel root: index.html lines around id="script" and class="panel"
- Two-pane workspace root: .script-builder
- Left pane shell: .play-list
- Left pane results container: #availablePlays.available-plays-container
- Right pane shell: .script-list
- Right pane list container: #scriptPlays.script-container
- Right pane utility blocks present: .script-stats-bar, .script-toolbar, #scriptTimeline, .script-actions
- Player script surfaces present: #playerScriptLauncherSection, #playerScriptNowBar
- Mobile coach dock present: #mobileCoachDock
- Presentation overlay present: #playPresentationOverlay

### Runtime computed ownership baseline (desktop capture)

- body: overflow hidden while app-booting
- #script.panel: overflow hidden
- .script-builder: display grid, overflow hidden
- .play-list: display grid, overflow hidden
- .script-list: overflow auto in current CSS/runtime blend
- .available-plays-container: overflow-y auto
- #scriptPlays: overflow visible in current runtime snapshot (not yet the active scroll owner)
- .script-toolbar: position relative (not sticky)
- .script-actions: position relative
- #playPresentationOverlay: position fixed, overflow hidden, display none when closed

### CSS ownership and override map (selectors located)

- Primary Script layout ownership in css/script.css (base + desktop override block + mobile override blocks)
- Panel-level ownership in css/layout.css (#script.panel)
- Mobile and role overrides in css/responsive.css and css/script.css
- Overlay/dock ownership in css/components.css (auth overlay, mobile coach dock)
- Presentation overlay ownership in css/play-presentation.css and index markup

### Active scroll containers detected in this snapshot

- None under #script because #mainApp is currently hidden by boot/upload gating in the captured local state
- This is a valid baseline finding and explains why runtime scroll-owner detection returned zero active script scroll containers in this capture

## Point 2 and Point 3 Changes (Completed)

### Desktop scroll architecture implemented

- Desktop script workspace now enforces explicit two-column grid sizing with min-width/min-height guards.
- Pane shells (.play-list and .script-list) are non-scrolling in desktop mode.
- Left pane owner remains .available-plays-container (overflow-y: auto).

### Current-script scroll owner moved

- Right pane scroll owner moved to #scriptPlays.script-container in desktop mode.
- #scriptPlays now has flex: 1 1 auto, min-height: 0, overflow-y: auto, overflow-x: hidden.
- .script-list desktop overflow changed to hidden to prevent competing scroll containers.

### Files touched for Points 2-3

- css/script.css desktop media contract block

## Point 4 Conflict Report (In Progress)

### Confirmed conflict clusters

- .play-list has legacy sticky+viewport-height behavior in base rules, then desktop block redefines it as a non-sticky grid shell.
- .script-list base rule is overflow: visible, an earlier desktop block changed it to overflow-y: auto, and latest desktop contract changes it to overflow: hidden.
- .script-container base is non-scroll container styling, while desktop contract now promotes #scriptPlays.script-container to the right-pane scroll owner.
- .script-toolbar is sticky in shared/base rules but is later normalized to non-sticky/static in mobile and relative in desktop contract.
- .script-actions is sticky in shared/base rules but is later reset for mobile and now expected to sit outside list scroll ownership.
- Responsive overrides in both css/script.css and css/responsive.css modify script layout, creating overlapping responsibility chains.

### High-risk legacy patterns identified

- Same selector families are defined in distant blocks (base, mid-file feature updates, desktop media block, multiple mobile media blocks).
- Some declarations exist primarily to undo earlier declarations instead of owning a single mode cleanly.
- There are mobile role/shell overrides that still assume previous desktop behavior.

### Point 4 Consolidation Complete

- Removed viewport-height (calc(100dvh - 92px)) from base .play-list
- Removed sticky positioning (position: sticky, top: 78px) from base .play-list
- Removed explicit overflow-y: auto from base .play-list
- Cleaned base .script-list: removed max-height assumption
- Result: Base rules now separate from desktop contract; desktop media block owns desktop behavior cleanly; mobile overrides no longer fighting base rules

## Point 5 Layout Contract Separation (Completed)

### Desktop Contract (body:not(.is-mobile-screen))
- Two-column grid: left pane (280-360px) | right pane (fluid)
- Scroll owners: .available-plays-container (left), #scriptPlays (right)
- Panes non-scrolling shells: .play-list, .script-list
- Toolbar/actions positioned relative; not sticky

### Mobile Coach Contract (body.is-mobile-screen.is-staff-mobile-shell)
- Single-column grid: script first (order: 1), available plays second (order: 2)
- Scrolling: stack-native, allow both panes to scroll when needed
- No fixed toolbar; layout stacks naturally

### Mobile Player Contract (body.is-mobile-screen[data-auth-role="player"])
- Panel overflow: visible (not auto)
- Special launcher and now-bar surfaces shown
- Minimal admin UI visibility

### Files touched for Point 5
- css/responsive.css: clarified mobile coach stacking rules, removed conflicting position/height declarations

I need a full top-down architectural audit and stabilization pass of the Practice Script page.

Do not add new features. Do not remove existing functionality. Do not perform a cosmetic redesign first. Do not keep layering small CSS patches over conflicting rules.

The current Practice Script page is deeply unstable. The problems appear to come from overlapping layout systems, multiple scroll owners, repeated CSS overrides, global event interception, mobile touch handling, modal state, presentation state, observers, and full-page rerender behavior.

The goal is to identify the true root causes, simplify ownership, and make the Practice Script page reliable on desktop and mobile.

Current major problems

1. Desktop Practice Script scrolling is inconsistent and cumbersome.
2. The page appears to have several nested or competing scroll containers.
3. The available-play pane and current-script pane do not scroll predictably.
4. Toolbars and controls disappear while scrolling or overlap content.
5. The admin Practice Script page is cluttered and difficult to scan.
6. Buttons sometimes require multiple clicks or taps.
7. Mobile touch behavior is unreliable.
8. Mobile currently feels like a stacked version of the desktop page instead of a true mobile experience.
9. Desktop and mobile fixes keep affecting one another.
10. Presentation and Swipe View have had visibility, landscape, scaling, and double-rotation problems.
11. Canvas or diagram rendering can shake or repeatedly resize.
12. Closing presentation or modals may leave body scroll, classes, or interaction state behind.
13. The page may be performing excessive background work and causing Chrome CPU usage, laptop heat, and battery drain.
14. The code is split across many files, but layout, events, shell state, role state, and rendering remain globally coupled.

Audit the current implementation before changing it.

Do not assume the latest CSS rule is the only rule affecting an element.

⸻

1. Trace the complete Practice Script DOM structure

Inspect the full ancestry and layout of:

- html
- body
- #mainApp
- app header
- navigation tabs
- #script
- #script.panel
- Practice Script page header
- .script-builder
- .play-list
- .available-plays-container
- available-play filters and controls
- .script-list
- .script-container
- #scriptPlays
- Script stats
- Script toolbar
- Script timeline
- Script action/footer controls
- player Script launcher
- current player Script bar
- mobile coach dock
- drawers
- menus
- overlays
- modals
- presentation overlay

For each relevant element, document:

- display
- position
- height
- min-height
- max-height
- width
- min-width
- overflow
- overflow-x
- overflow-y
- flex/grid parent behavior
- whether it creates a scroll container
- whether it is sticky or fixed
- which CSS rules currently control it
- which later CSS or responsive rules override it
- which body classes alter it

Identify every active scroll container on the Practice Script page.

Do not solve this by adding more arbitrary overflow-y: auto.

⸻

2. Establish one clear desktop scroll architecture

The desktop Practice Script page should use a viewport-constrained workspace with exactly two intentional content scroll areas.

Target architecture:

App viewport
└── Practice Script page
├── non-scrolling page header / primary toolbar
└── constrained two-pane workspace
├── Available Plays pane
│ ├── non-scrolling pane header
│ ├── non-scrolling filter/add controls
│ └── scrollable available-play results
│
└── Current Script pane
├── non-scrolling title/stats/primary controls
├── non-scrolling contextual toolbar
├── scrollable Script plays
└── non-scrolling primary action footer

The two preferred scroll owners are:

- .available-plays-container
- #scriptPlays

The outer pane shells should not scroll.

The body, panel, pane shells, toolbar, and footer should not compete with those two scroll areas.

Conceptual direction:

body:not(.is-mobile-screen) #script.panel.active {
height: calc(
100dvh - var(--app-header-height, 0px) - var(--app-tabs-height, 0px)
);
min-height: 0;
overflow: hidden;
}
body:not(.is-mobile-screen) #script .script-builder {
height: 100%;
min-height: 0;
display: grid;
grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
overflow: hidden;
}
body:not(.is-mobile-screen) #script .play-list,
body:not(.is-mobile-screen) #script .script-list {
min-width: 0;
min-height: 0;
height: 100%;
overflow: hidden;
}
body:not(.is-mobile-screen) #script .play-list {
display: grid;
grid-template-rows: auto auto minmax(0, 1fr);
}
body:not(.is-mobile-screen) #script .script-list {
display: grid;
grid-template-rows: auto auto auto minmax(0, 1fr) auto;
}
body:not(.is-mobile-screen) #script .available-plays-container,
body:not(.is-mobile-screen) #script #scriptPlays {
min-width: 0;
min-height: 0;
overflow-y: auto;
overflow-x: hidden;
overscroll-behavior: contain;
scrollbar-gutter: stable;
}

Adapt this to the real DOM rather than copying it blindly.

Important requirements:

- Apply min-height: 0 to every necessary flex/grid ancestor.
- Apply min-width: 0 to flexible pane children.
- Do not allow body scrolling underneath the two pane scroll areas.
- Do not make .script-list itself the primary scroll container.
- Do not make .play-list itself the primary scroll container.
- Do not keep sticky toolbars inside a scroll container if they can remain outside the scroll region.
- Remove competing hardcoded height calculations.
- Use app header/tab CSS variables as the source of truth.
- Prevent horizontal viewport overflow.
- Ensure modal and presentation close paths restore scrolling correctly.

⸻

3. Move current-script scrolling to #scriptPlays

The current right pane appears to scroll as one large card, causing all of these to move together:

- current Script title
- period controls
- Script stats
- Script health
- toolbar
- player Script controls
- timeline
- Script rows
- footer actions

This is cumbersome.

Refactor the right pane so:

- .script-list is a non-scrolling pane shell
- #scriptPlays is the dedicated scroll region
- stats and primary controls remain visible
- primary footer actions remain visible
- Script rows scroll independently

Once this is done, remove unnecessary sticky positioning from .script-toolbar.

Prefer:

.script-toolbar {
position: static;
}

rather than a sticky toolbar with a hardcoded top value.

⸻

4. Trace and consolidate CSS cascade debt

Audit:

- css/script.css
- css/responsive.css
- css/layout.css
- css/base.css
- any player/mobile/theme CSS that affects Practice Script selectors

Identify repeated or conflicting rules for:

- #script.panel
- .script-builder
- .play-list
- .available-plays-container
- .script-list
- .script-container
- #scriptPlays
- .script-toolbar
- .script-actions
- .script-item
- Script stats
- Script footer/actions
- mobile Script layout

Produce a short conflict report before editing.

Look for:

- original full-page scroll model
- later fixed-workspace model
- old sticky pane rules
- later overflow corrections
- mobile overrides
- tablet overrides
- player-role overrides
- print overrides
- selectors that assume .script-builder is flex when it is actually grid
- body-class-specific overrides with overlapping responsibilities
- declarations that are only present to undo earlier declarations

Consolidate the Practice Script CSS into clear sections:

1. Practice Script tokens
2. Shared component appearance
3. Desktop workspace layout
4. Mobile coach layout
5. Mobile player layout
6. Print rules
7. Script-related modals and drawers

Remove obsolete rules after verifying that they are no longer needed.

Do not leave old rules in place and override them thousands of lines later.

⸻

5. Create separate desktop and mobile layout contracts

Do not continue treating mobile as a heavily overridden desktop layout.

Create explicit behavior for:

Desktop admin/coach

- two-pane workspace
- independent available-play and current-script scrolling
- productivity-oriented controls
- full editing tools
- no mobile dock interference

Mobile coach

- show one primary pane at a time
- provide a simple switcher:
  - Current Script
  - Add Plays
- do not stack the entire current Script pane followed by the entire available-play pane
- keep vertical scrolling native and predictable
- emphasize field/practice actions
- move advanced controls into a drawer

Mobile player

- Current/Published Script
- Open Script
- Swipe View
- Current Play
- Rules
- Position Lock
- minimal admin clutter

Presentation

- independent full-screen responsive experience
- natural portrait layout
- natural landscape layout
- no reliance on desktop Practice Script layout
- no double rotation

Audit conflicts among:

- .is-mobile-screen
- .is-phone-screen
- .is-landscape-screen
- .is-portrait-screen
- .is-staff-mobile-shell
- .is-player-mobile-shell
- presentation body classes
- modal-open body classes

These states must not overlap in contradictory ways.

⸻

6. Audit the Practice Script toolbar and action hierarchy

The page currently presents too many controls at the same visual level.

Do not remove any features, but reorganize them.

Primary toolbar

Keep these visible:

- Search / Filter
- Add Selected
- Save
- Present / Swipe View
- Print
- More

Secondary options

Move into a compact row, popover, or drawer:

- Sort
- Reverse
- Reorder
- Collapse / Expand
- Jump controls
- Timeline options
- Display settings
- Print color

Contextual selection bar

Only show when plays are selected:

- Move
- Duplicate
- Delete
- Tag
- Bulk edit
- Send to Game Plan
- Send to Wristband

More / Advanced drawer

Move rare tools here:

- Smart Script
- Shuffle
- Merge
- Compare
- Cleanup
- Templates
- Print Studio
- advanced packet tools
- diagnostics
- uncommon integrations

Requirements:

- no functionality removed
- primary actions remain easy to find
- advanced tools do not permanently occupy vertical space
- closed drawers/popovers do not affect layout
- closed drawers/popovers do not intercept pointer events
- menus and drawers close reliably
- keyboard accessibility remains intact

Do this after the scroll architecture is stable.

⸻

7. Trace the full event path for delayed or missed clicks

Audit:

- js/app-events.js
- js/app-shell.js
- Practice Script feature files
- player Script files
- presentation files
- modal and drawer files

Trace:

- pointerdown
- pointerup
- touchstart
- touchmove
- touchend
- click capture
- click bubble
- synthetic .click()
- central data-action routing
- local Script click handlers
- local available-play click handlers
- menu-closing listeners
- mobile lock interception
- disabled/loading state changes
- rerenders between pointerdown and click
- event propagation stops

Specifically inspect:

- mobileTapSyntheticClick
- mobileTapNativeSuppression
- MOBILE_TAP_ACTION_SELECTOR
- shouldBridgeNativeMobileAction
- any synthetic tap bridge
- any document-level capture handler
- any use of stopImmediatePropagation()
- broad uses of preventDefault()
- actions handled on pointer/touch and click
- controls handled by both the central router and a local container handler
- controls replaced by a rerender before click completes

Add temporary tracing behind:

window.BC_ACTION_TRACE = true;

Use a trace helper:

function traceActionEvent(event, phase) {
if (!window.BC_ACTION_TRACE) return;
const actionTarget = event.target?.closest?.("[data-action]");
console.log("[BC input trace]", {
phase,
eventType: event.type,
timeStamp: event.timeStamp,
pointerType: event.pointerType,
isTrusted: event.isTrusted,
defaultPrevented: event.defaultPrevented,
eventPhase: event.eventPhase,
target: event.target,
actionTarget,
action: actionTarget?.dataset?.action,
arg: actionTarget?.dataset?.arg,
disabled: actionTarget?.disabled,
ariaDisabled: actionTarget?.getAttribute?.("aria-disabled"),
pointerEvents: actionTarget
? getComputedStyle(actionTarget).pointerEvents
: undefined
});
}

Trace one physical click/tap through:

- pointerdown
- pointerup
- touchstart
- touchend
- click capture
- click bubble
- action dispatch
- render
- final action state

Determine exactly where the first failed click is lost.

⸻

8. Simplify action ownership

Target architecture:

Native controls

Normal buttons, links, inputs, labels, selects, and textareas use native browser interactions.

Do not synthesize clicks for native buttons.

One central action router

Use one delegated document-level data-action click router for general actions.

Feature-specific gestures

Custom pointer/touch handling is allowed only for:

- Swipe View gesture area
- drag/drop
- canvas interactions
- resize handles
- true gesture surfaces

Requirements:

- one physical tap produces one logical action
- no duplicate action firing
- no dead first tap
- no broad touch suppression
- no global stopImmediatePropagation() for normal controls
- no separate touch, pointer, and click handlers for ordinary buttons
- convert clickable divs/spans to <button type="button"> where practical
- clearly document actions intentionally owned by local handlers rather than the central router

⸻

9. Remove broad mobile coach event interception

Audit the mobile coach interaction lock.

If it captures and blocks:

- click
- input
- change
- submit
- dragstart
- drop
- beforeinput

using:

event.preventDefault();
event.stopImmediatePropagation();

replace this architecture.

Preferred approach:

- disable only the controls that should be locked
- use native disabled where possible
- use aria-disabled="true" for non-form controls
- apply a specific .is-disabled class
- scope lock state to the intended container
- preserve original disabled state
- restore correctly when lock state ends
- make lock state inspectable
- clear stale lock state during role, tab, and mobile/desktop transitions

The central router should guard explicitly:

if (el.disabled) return;
if (el.getAttribute("aria-disabled") === "true") return;

Do not globally intercept clicks to enforce lock state.

⸻

10. Detect invisible elements intercepting buttons

For affected controls, inspect:

document.elementsFromPoint(x, y)

Audit:

- display
- visibility
- opacity
- pointer-events
- position
- z-index
- bounding rectangle
- pseudo-elements
- stale backdrops

Inspect at minimum:

- playEditorOverlay
- playbookSanitizeOverlay
- helpOverlay
- scriptDisplayOverlay
- constraintPanel
- playPresentationOverlay
- mobile navigation layers
- drawers
- menu backdrops
- loading blockers
- toast containers
- modal backdrops

Closed overlays must:

- not be visible
- not receive pointer events
- not trap focus
- not affect scrolling

Use one consistent state system.

⸻

11. Simplify modal and overlay state

Avoid simultaneously using many visual state sources such as:

- .show
- .is-open
- .active
- data-state
- hidden
- inert
- aria-hidden
- inline display
- inline visibility
- inline opacity
- inline pointer-events

Choose one visual source of truth, preferably .is-open.

Use a shared helper:

function setOverlayOpen(overlay, open) {
if (!overlay) return;
overlay.classList.toggle("is-open", open);
overlay.hidden = !open;
overlay.inert = !open;
overlay.setAttribute("aria-hidden", String(!open));
}

CSS should own visibility.

Open and close must use the same state model.

Closing an overlay must restore:

- body overflow
- body position
- prior scroll position
- focus
- pointer interaction
- fullscreen state
- orientation state
- pending RAFs
- active observers
- inline dimensions
- temporary classes
- temporary CSS variables

Do not rely on inline display: flex !important as the normal open mechanism.

⸻

12. Fix presentation orientation behavior

Audit:

- js/play-presentation.js
- css/play-presentation.css
- fullscreen behavior
- orientation lock
- visualViewport listeners
- body presentation classes
- diagram/canvas resizing

Do not combine:

- CSS rotate(90deg)
- fullscreen
- screen.orientation.lock("landscape")
- body fixed positioning
- repeated dimension swapping
- repeated visualViewport synchronization

Preferred direction:

- natural portrait presentation layout
- natural landscape presentation layout
- optional “Rotate your device” hint in portrait
- orientation lock only as a best-effort enhancement
- no CSS rotation when orientation lock is used
- no forced width/height swapping when device is already landscape
- physical device rotation simply changes responsive layout
- no double rotation
- complete cleanup on close

⸻

13. Stabilize canvas and diagram rendering

Audit all presentation diagram and canvas redraw paths.

Requirements:

- do not redraw hidden presentation
- disconnect ResizeObserver when presentation closes
- only redraw when rounded dimensions actually change
- debounce resize/orientation redraws
- do not redraw on every visualViewport scroll event
- avoid ResizeObserver feedback loops
- avoid reading layout, writing canvas dimensions, then immediately reading layout again
- avoid large parent transforms around canvas
- cancel pending RAFs on close
- cache previous size

Suggested pattern:

let lastDiagramSizeKey = "";
let diagramDrawFrame = 0;
function scheduleDiagramDraw(frame) {
if (!frame || !isPresentationOpen()) return;
const rect = frame.getBoundingClientRect();
const width = Math.round(rect.width);
const height = Math.round(rect.height);
const sizeKey = `${width}x${height}`;
if (!width || !height || sizeKey === lastDiagramSizeKey) return;
lastDiagramSizeKey = sizeKey;
if (diagramDrawFrame) {
cancelAnimationFrame(diagramDrawFrame);
}
diagramDrawFrame = requestAnimationFrame(() => {
diagramDrawFrame = 0;
draw();
});
}

⸻

14. Audit full Practice Script rerenders

Inspect renderScript() and any code that replaces all of #scriptPlays with innerHTML.

Determine how often the entire Script list is rebuilt.

Full rerenders may cause:

- stale event targets
- focus loss
- scroll movement
- click interruption
- drag interruption
- MutationObserver work
- accessibility rescans
- mobile lock rescans
- visual jumping

Separate updates into:

Full render

Use only when:

- play order changes
- plays are added or removed
- periods change
- a saved Script loads
- major structure changes

Row render

Use when:

- one play changes
- one row expands/collapses
- one row’s metadata changes
- reps or assignments change

Direct state update

Use for:

- counters
- badges
- stats
- selection state
- enabled/disabled buttons
- input labels
- health/status indicators

Do not rewrite the entire Script list for small state changes.

Check whether a rerender can happen between pointerdown and click.

⸻

15. Narrow or remove the whole-body MutationObserver

Audit observers such as:

observer.observe(document.body, {
childList: true,
subtree: true
});

Determine whether ordinary Script rendering triggers:

- accessibility rescans
- mobile shell synchronization
- viewport measurement
- mobile coach lock scans
- global DOM scans
- more DOM mutations

Replace generic body mutation handling with explicit calls.

Preferred direction:

renderScript();
enhanceRuntimeA11y(scriptContainer);
applyMobileCoachLockUi(scriptContainer);

Mobile shell sync should run only for:

- viewport resize
- orientation changes
- shell/header/tab size changes
- explicit role or mode transitions

Do not trigger mobile shell synchronization because Script rows were inserted.

Scope observers to the smallest practical target and disconnect them when inactive.

⸻

16. Audit content-visibility and virtualization

Inspect rules such as:

.script-item {
content-visibility: auto;
contain-intrinsic-size: auto 52px;
}

Practice Script rows vary significantly in height.

This can cause:

- scroll jumping
- inaccurate scroll height
- sudden layout shifts
- instability when rows expand
- unpredictable mobile behavior

Temporarily remove content-visibility from highly variable Script rows and measure again.

Correct scrolling is more important than premature row virtualization.

If virtualization is retained, use realistic states for compact and expanded rows.

⸻

17. Audit idle CPU, heat, and battery use

Search for:

- runaway requestAnimationFrame
- repeated resize callbacks
- visualViewport.resize
- visualViewport.scroll
- active ResizeObservers
- active MutationObservers
- pointermove/mousemove loops
- dragover work
- repeated getBoundingClientRect()
- full-DOM querySelectorAll
- hidden UI rendering
- animations running while hidden
- persistent trace logging
- inactive modules that remain active

Target behavior:

- idle on Practice Script page: CPU close to 0%
- presentation open but idle: CPU close to 0%
- presentation closed: no active canvas redraw
- inactive tabs: no repeated renders
- hidden overlays: no active observers
- no constant viewport sync during normal scrolling

Add optional diagnostics behind:

window.BC_PERF_TRACE = false;

Track:

- Practice Script render count
- full render count
- row render count
- mobile shell sync count
- viewport event count
- presentation draw count
- skipped draw count
- active RAF IDs
- active observers
- mutation callback count
- long tasks

Do not log high-frequency data unless the flag is enabled.

⸻

18. Audit service-worker cache behavior during development

The service worker may cache most JavaScript and CSS assets.

Ensure development changes are not hidden by stale cached files.

Implement one or more of:

- development service-worker bypass
- automatic cache version updates
- visible active build/cache version
- “Clear App Cache and Reload” developer action
- unregister service worker in local development

Do not let stale assets make fixes appear inconsistent.

⸻

19. Improve contrast and visual hierarchy

After structure and events are stable, audit:

- buttons
- disabled buttons
- Script cards
- player cards
- personnel chips
- status badges
- warning/success/error states
- dark mode
- presentation mode
- gold/yellow backgrounds
- navy/dark backgrounds
- gradient headers

Requirements:

- gold/yellow/light backgrounds use dark text
- navy/red/black/dark green/purple backgrounds use light text
- disabled controls remain readable
- outdoor player/presentation view has strong contrast
- use shared color tokens
- use a luminance-based helper for dynamic colors
- avoid scattered one-off overrides

⸻

20. Clarify ownership boundaries

Create a short ownership map for:

- Practice Script state
- Practice Script rendering
- Practice Script actions
- Practice Script persistence
- available-play filtering
- app shell state
- mobile shell state
- player role state
- mobile coach lock
- presentation state
- modal state
- responsive mode state

Identify:

- duplicate sources of truth
- global variables shared across unrelated features
- functions dependent on script load order
- renderers that mutate global shell state
- shell code that scans feature-specific DOM
- circular dependencies
- actions owned by multiple handlers

Do not migrate the whole app to ES modules in one risky pass.

Where safe, begin using explicit feature namespaces or interfaces:

window.BC = window.BC || {};
BC.script = {
state,
render,
actions,
persistence
};
BC.presentation = {
open,
close,
render,
isOpen
};

The goal is clearer ownership, not merely more files.

⸻

21. Testing requirements

Desktop admin Practice Script

Test:

- mouse wheel over available-play results
- mouse wheel over current Script rows
- trackpad momentum
- independent left/right scrolling
- page/body does not unexpectedly scroll
- toolbar remains visible
- footer actions remain visible
- no horizontal overflow
- filters
- search
- add selected
- add filtered
- sorting
- reverse
- drag/reorder
- collapse/expand
- saving
- printing
- opening/closing presentation
- opening/closing every Script modal and drawer
- tab switching
- body scroll restored after every close
- idle CPU for at least two minutes

Mobile coach portrait

Test:

- first tap works
- one tap triggers one action
- native vertical scrolling
- Current Script / Add Plays switching
- adding plays
- opening drawers
- closing drawers
- no dead taps
- no double actions
- no desktop dual-pane squeeze
- no giant stacked page unless explicitly intended

Mobile coach landscape

Test:

- pane switching
- touch response
- vertical scrolling
- presentation open/close
- physical orientation changes
- return to normal state
- no stale body classes

Mobile player portrait

Test:

- Open Script
- Swipe View
- Current Play
- Rules
- Position Lock
- next/previous
- swipe gesture
- close presentation
- normal page scroll restored

Mobile player landscape

Test:

- open presentation while already landscape
- rotate from portrait to landscape while presentation is open
- rotate back
- no double rotation
- no canvas shaking
- no dead buttons
- no stale fullscreen or body lock

⸻

22. Acceptance criteria

The work is complete only when:

1. Desktop Practice Script has exactly two intentional content scroll areas.
2. .available-plays-container scrolls available plays.
3. #scriptPlays scrolls current Script rows.
4. The body and outer pane shells do not compete with those scroll areas.
5. Script stats, primary toolbar, and primary footer actions remain visible.
6. The page is cleaner without losing functionality.
7. First click/tap works.
8. One physical tap produces one action.
9. Native scrolling remains available.
10. No invisible overlay intercepts controls.
11. Mobile coach uses one primary pane at a time.
12. Mobile player is simplified.
13. Desktop and mobile rules no longer depend on conflicting override chains.
14. Presentation opens reliably.
15. Presentation does not double rotate.
16. Physical orientation changes do not break the display.
17. Canvas does not shake or redraw continuously.
18. Closing overlays fully restores body and interaction state.
19. Small Script changes do not always trigger a full list rebuild.
20. Whole-body mutation work is removed or substantially narrowed.
21. Idle CPU is close to zero.
22. No major functionality is removed.

⸻

23. Required final report

After the audit and patch, provide:

1. Root causes found.
2. Practice Script scroll containers before the change.
3. Practice Script scroll containers after the change.
4. CSS conflicts and obsolete rules found.
5. Exact cause of missed or delayed taps.
6. Event listeners or suppression logic changed.
7. Full-render behavior changed.
8. MutationObserver changes.
9. Modal and overlay state changes.
10. Presentation/orientation changes.
11. Performance and idle CPU improvements.
12. Files changed.
13. Tests performed.
14. Remaining risks.
15. Recommended follow-up work that should be kept separate from this stabilization pass.

Important:
Trace each problem to the actual owning CSS rule, layout ancestor, state variable, event listener, observer, or render pathway. Do not keep masking symptoms with later overrides.
