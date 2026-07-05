# Player Mobile Experience Audit

Goal: make the player phone/tablet experience fast, clear, fun, and hard to break. This audit focuses on the kid-facing flow: login, home, playbook study, published practice, swipe/presentation, questions/chat, quiz, notifications, and responsive transitions.

## Product Standard

- Player mobile is a consumer study app, not a compressed staff dashboard.
- Every primary action should answer one question: what should I do next?
- Sensitive overlays must use shared layer locking, focus restore, and safe-area padding.
- Player role must stay read-only, but read-only navigation, filters, pagination, chat, and study actions must not be blocked by auth guards.
- Phone portrait, phone landscape, iPad portrait, iPad split-screen, and iPad landscape must all preserve the active page and selected practice/play.

## Current Strengths

- Player role is scoped to Home, Playbook, and Practice.
- Player home has a clear practice-first card, quick actions, ready confirmation, MOTD, notification CTA, and recent scripts.
- Published Practice loads into a player-specific read-only card view.
- Swipe View/presentation has player-safe modes, orientation handling, clean view, Wake Lock, detail panel, zoom/pan, and telestrator support.
- The general mobile viewport harness passes player shell checks across common phone and tablet sizes.

## Findings

### P0 - My Questions Overlay Bypassed Shared Layer Contract

Status: fixed in this slice.

Symptoms/risk:
- The player question overlay manually toggled `hidden`/`aria-hidden`.
- It did not use `openLayer`/`closeLayer`, so body scroll ownership, focus restore, and background touch prevention were not guaranteed.
- This is high risk because players bounce from questions into discussions/presentation and back.

Fix:
- `openPlayerPortal()` now opens via shared blocking layer with `playerPortalBody` as its scroll surface.
- `closePlayerPortal()` now closes via shared layer and restores focus.
- Close button/filter targets meet mobile touch sizing and respect safe-area bottom padding.

### P0 - Player Auth Guard Hid Read-Only Question Pagination

Status: fixed in this slice.

Symptoms/risk:
- `loadMorePlayerPortal` starts with `load`, so the player read-only guard treated it as mutating and hid the button.
- Players could see the first page of questions but not page through their own history.

Fix:
- Added explicit read-only allowlist entries for player portal open/close, filters, retry, load more, and discussion navigation.

### P1 - My Questions Pagination Was Fragile

Status: fixed in this slice.

Symptoms/risk:
- Append rendering depended on a `_lastAppendCount` value that was never written.
- API naming was assumed to be `hasMore` only.

Fix:
- Append rendering now uses the newly fetched page directly.
- Client accepts both `hasMore` and `has_more`.

### P1 - Existing Mobile Harness Does Not Exercise Real Player Content

Status: first focused spec added.

Gap:
- The broad viewport harness validates shell mechanics, role restrictions, scroll ownership, and touch targets, but it does not seed a published practice or open question/chat surfaces.

Fix:
- Added a seeded player mobile Playwright spec covering Home -> My Questions -> Load More -> close/focus restore -> Open Practice.

### P1 - Remaining Surfaces Need Seeded Player Flow Coverage

Status: in progress.

Completed in the Home/Quiz slice:
- Home now exposes Practice, Swipe View, Quiz, Questions, and Playbook as visible player actions.
- Practice now exposes a player-safe Quiz action in the current-practice bar and each published-practice card.
- Quiz opens through the shared layer lock, restores the page when closed, and has larger mobile reveal/navigation/close targets.
- Added seeded coverage for Home, Practice, Quiz, Playbook, and Questions surfaces on a phone viewport.

Next coverage targets:
- Playbook -> filter sheet -> current game plan filter -> row media thumbnail/presentation.
- Notification drawer -> push opt-in/offline states.
- iPad portrait and landscape for My Questions, Quiz, discussion drawer, and presentation detail panel.

### P1 - Swipe View Felt Like Compressed Coach UI

Status: fixed in the Swipe View mobile/iPad slice.

Symptoms/risk:
- Player Swipe View exposed the right engine, but the visual hierarchy did not strongly guide players through call, rule, question.
- Phone portrait showed the diagram before the player study content, which made the first viewport feel sparse when a diagram was missing.
- iPad portrait used the stacked phone layout instead of a roomy two-column study board.
- Asking a question from Swipe View required opening a generic discussion drawer and then finding the question type.

Fix:
- Player mode now renders a study strip, stronger call/rule cards, metadata chips, and distinct Ask Coach / Review Thread actions.
- Phone portrait prioritizes player study content first, then diagram review.
- iPad portrait keeps a two-column diagram + player study layout.
- Ask Coach opens the presentation discussion drawer and preselects the question composer.
- Added seeded coverage for Practice -> Swipe View -> Ask Coach -> post question -> close drawer -> next play -> close back to Practice.

### P1 - Swipe View Diagram Was Buried On Phone

Status: fixed in the diagram-first Swipe View follow-up.

Symptoms/risk:
- With an actual stored play diagram, phone portrait placed the picture below the player controls and rule card.
- Players had to scroll before seeing the diagram, even though their real study flow is diagram -> rule -> coach note -> question.
- Position selection was too prominent and pushed the actual learning content down.

Fix:
- Phone portrait now renders the diagram first in a stable frame.
- Player rule, responsibility notes, and coach notes appear before the position picker.
- Added a coach/admin `Player Notes` field in the play editor; those notes render as kid-facing Coach Notes in Swipe View.
- CSV import/update recognizes `PlayerNotes`, `PlayerNote`, `CoachNotes`, and `CoachesNotes`.
- Added seeded diagram coverage so the test checks that the diagram appears before the rule near the top of the phone viewport.

### P1 - Swipe View Rule/Diagram Source Was Not Obvious Enough

Status: fixed in this hardening slice.

Symptoms/risk:
- Kids could see a rule and diagram, but the screen did not clearly say whether the current play had a synced diagram or which position rule was being shown.
- When a diagram was missing, the empty state did not tell the player what was wrong in player-safe language.
- Auto-position is useful, but it can feel like the app changed pages or changed roles unless the UI confirms the selected rule.

Fix:
- Player Swipe View now shows compact status chips for rule position, diagram state, and coach-note presence.
- Diagram status changes from `Diagram checking` to `Diagram ready`, `Needs diagram`, or `Diagram issue` as the actual image loader resolves.
- Missing/error diagram messages now tell players to ask a coach to sync diagrams instead of leaving a generic blank state.
- The rule card now includes a `Showing [position] rule` meta line so auto-position is legible.
- Added regression coverage for rule status, diagram-ready status, coach notes, and the full Ask Coach flow.

### P1 - Practice Page Needed A Player Mission Card

Status: fixed in this workflow slice.

Symptoms/risk:
- Home had a clear player workflow, but once a kid landed on Practice, the current-practice card only showed title/meta plus Quiz and Swipe View.
- Players needed a stronger answer to: "Do I have diagrams? Are rules entered? Are there coach notes? What should I tap next?"
- Adding more toolbar rows would repeat the header clutter problem, so the fix needed to be compact and glanceable.

Fix:
- Current Practice now includes a short mission sentence and compact chips for diagram coverage, player-rule coverage, and coach-note coverage.
- The same card now exposes Questions, Quiz, Playbook, and Open Swipe View as the next actions, in a phone-friendly two-column grid.
- Diagram chip counts refresh after local image keys load, so synced diagrams show up without opening every row first.
- Added seeded mobile coverage for the new Practice mission copy, status chips, and action buttons.

### P1 - Player Pages Were Spending Too Much Phone Height On Headers

Status: fixed in this real-estate slice.

Symptoms/risk:
- Home used nearly the whole first phone viewport on hero/status/quick actions before players reached actual work.
- The phone Home hero inherited a desktop `flex-basis` from the Today card, turning it into unnecessary vertical height.
- Practice kept the published-script launcher visible after a practice was already loaded, duplicating the new Current Practice mission card.

Fix:
- Phone Home now uses a compact hero/status block and a two-column quick-action grid with Open Practice as the full-width lead action.
- Phone-only duplicate hero/status copy is hidden while preserving the actionable Today status.
- Loaded Practice hides the duplicate launcher when there are no other practices to switch to; the mission card becomes the top working surface.
- Loaded Practice mission card spacing, chips, and meta are tighter on phone while preserving 44px action buttons.
- Added seeded mobile coverage that guards the Home hero/quick-action height and loaded-Practice launcher behavior.

### P1 - Player Playbook Needed Real Study Cards

Status: fixed in this Playbook study slice.

Symptoms/risk:
- Player Playbook cards only showed tiny diagram/status badges, so stored diagrams were not visible in the row list until a player opened a play.
- Common player filters required opening the full filter sheet, even for obvious study decisions like Game Plan, Diagrams, and Coach Notes.
- Touch-tablet players still got the dense staff table instead of a study-first card/grid view.

Fix:
- Player phone and iPad/tablet Playbook views now use study cards instead of the staff table.
- Stored IndexedDB diagrams hydrate into visible 16:9 thumbnails on the current page without opening each row first.
- Game Plan, Diagrams, and Coach Notes are one-tap quick filters with active visual state; deeper filters remain available in the filter sheet.
- Player cards now surface coach-note snippets and clear Study / Ask / Film actions without exposing staff controls.
- Added seeded mobile coverage for compact Playbook summary height, thumbnail hydration, quick filters, coach notes, and player-safe actions.

## Verification Commands

- `BASE_URL=http://127.0.0.1:4173 npx playwright test --project=chromium-desktop specs/07-player-mobile.spec.js`
- `node scripts/mobile-viewport-check.mjs --roles=player --viewports=320x568,360x640,390x844,393x852,412x915,568x320,844x390,768x1024,820x1180 --warn-only --no-screenshots`

## Next Implementation Slices

1. Notifications/offline: make opt-in, denied, offline, and newly published practice states feel clear and non-scary.
2. iPad player pass: continue screenshot review on Home, Playbook, Practice, Swipe View, and Questions.
3. Visual polish pass: keep using color and icon accents to show the next best action without crowding phone screens.
4. Practice/Home polish: reduce repeated section styling and add stronger color hierarchy where the next action is ambiguous.
