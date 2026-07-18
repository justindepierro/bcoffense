# Coach Grid Roadmap

## Why this exists

Coach Grid is an opt-in system for dense coaching workspaces. It separates a
system-wide visual decision from a feature-specific workflow decision, so a
future wholesale adjustment does not require hunting through every stylesheet.

## System ownership

| Change type | Authority | Rule |
| --- | --- | --- |
| Density, radii, control height, divider, shared surfaces | `css/base.css` `--coach-grid-*` tokens | Change once only when the intent is global across migrated coach surfaces. |
| Shared command and library anatomy | `css/components.css` | Add a primitive after it has two proven feature homes. |
| Layout, data columns, row actions, module-only states | The feature stylesheet and renderer | Keep the behavior with the feature. Do not make shared CSS depend on generic legacy classes. |
| Mobile, player, tablet, print, presentation | The existing feature-specific path | An explicit exception until deliberately migrated and validated. |
| Regression contracts | `scripts/smoke-check.js` | Every migrated root, control surface, or scroll owner gets a durable check. |

## Reusable library system

Large coach play libraries use this order:

1. **Find** — the primary search field.
2. **Refine** — a small number of high-frequency views or toggles.
3. **Advanced** — deeper filter groups, collapsed by default.
4. **Results** — one clearly owned scrolling list, with compact rows and
   meaningful type/status accents.

The shared classes are `coach-grid-library-controls`, `coach-grid-library-find`,
`coach-grid-library-refine`, `coach-grid-library-advanced`, and
`coach-grid-library-status`. They define the structural language, not a
feature's filter fields, selection model, or add action.

## Coverage

| Surface | Status | Current boundary |
| --- | --- | --- |
| Practice Script workbench | Migrated | Coach rows, command strip, and now the library anatomy; preserve its batch add and main list scroll contract. |
| Wristband Maker | Migrated | Find/refine/advanced/results library; preserve physical card and all print paths. |
| Playbook | Migrated | Desktop toolbar and worksheet table; editor and player cards are separate. |
| Call Sheet | Migrated | Desktop toolbar, category cells, and picker; print remains separate. |
| Game Plan | Migrated | Command zone, filters, library, and boxes; retain drag/drop and board state. |
| Team Workspace | Migrated | Roster, personnel, and accounts; player portal is separate. |
| Opponent Scout | Migrated | Opponent list, command strips, stats, and film log; reports and presentation are separate. |
| Signals | Migrated | Coach collection and editor; player clip viewing is separate. |
| Game Week Dashboard | Migrated | Desktop active-opponent command surface; player home, mobile, and dashboard summaries remain separate. |

## Verification checklist

The migration is complete. The checks below distinguish verified shared-system
behavior from scenario coverage that still needs a deliberately exercised
state, so this roadmap cannot accidentally imply that a static CSS review is a
full workflow test.

### Completed system checks

- [x] Shared Coach Grid tokens, command-strip primitive, library primitive,
  migrated roots, cache version, and scroll ownership are covered by
  `node scripts/smoke-check.js`.
- [x] Desktop coach review completed for Playbook, Practice Script, Call Sheet,
  Game Plan, Wristband Maker, Opponent Scout, Signals, and Game Week
  Dashboard: each loaded without runtime errors or horizontal overflow.
- [x] Representative layout-family review completed: table (Playbook), rail
  (Practice Script), board (Game Plan and Call Sheet), card/editor (Signals),
  and command center (Game Week Dashboard).
- [x] Practice Script library was checked at a 1024px laptop width with a
  no-match search. Its empty state keeps the search context, provides clear
  and reset actions, and does not create overflow.
- [x] Player portal remains an explicit exception; player navigation and
  player-facing practice context use their own readability and touch rules.

### Scenario checks still worth exercising with live team data

- [ ] Wristband library: long result set, no matches, active advanced filters,
  selected rows, and narrow laptop width.
- [ ] Practice Script library: active advanced filters and selected-row batch
  actions at narrow laptop width.
- [ ] Game Plan library: confirm its drag/drop library can retain the same
  find/refine/results order without compromising board interactions.
- [ ] Call Sheet picker: confirm the compact modal remains intentionally
  distinct from a rail when a large playbook is loaded.

## Next migration waves

### Wave 1 — validate the shared library system

- Finish the unchecked scenario tests above for Wristband and Practice Script.
- Audit Game Plan's library against the same four-band anatomy. Migrate only if
  it cannot be expressed with the shared primitives without altering drag/drop.
- Keep Call Sheet's modal picker compact; it is not a rail and should not copy
  the full rail layout.

### Wave 2 — command-surface consistency

- Compare common coach command strips: page headers, workspace action bars,
  and report toolbars.
- Promote a new primitive only after two modules need the exact same behavior.
- Prefer a compact menu or drawer for rare actions over adding another visible
  row of controls.

### Wave 3 — deliberate exceptions

- Evaluate player-facing surfaces independently for readability and touch size.
- Evaluate print and presentation independently for physical dimensions and
  viewing distance.
- Do not flatten these surfaces through desktop Coach Grid tokens.

## Wholesale-change playbook

When a future visual change should affect multiple migrated coach surfaces:

1. State the desired system behavior in this file and identify the exact token
   or shared primitive that owns it.
2. Change a `--coach-grid-*` token or one opt-in primitive in
   `css/components.css`; do not start with module overrides.
3. Run the focused smoke contract and inspect one representative migrated
   surface from each layout family: rail, table, board, and card editor.
4. Add module-local deltas only where data layout differs, then document the
   exception in that module's architecture note.
5. Keep mobile, player, tablet, print, and presentation unchanged unless they
   are explicitly in scope.

## Definition of done

- The surface has a named root and one scroll owner.
- Controls follow a predictable hierarchy and height.
- Dense rows preserve call names, selection state, and type/status meaning.
- The shared system is used only where it has a second proven home.
- The matching smoke contract, cache version, and deploy verification are
  updated with the change.
