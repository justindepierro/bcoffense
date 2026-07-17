# Library Surface Architecture

The app has several places a coach selects from a large play library. They do
not share a renderer, but they now share a deliberate desktop contract so a
visual fix on one screen does not accidentally alter another.

## Shared contract

- `app-library-pane` identifies a Coach Grid library surface.
- `app-library-list` identifies the one element that may own list scrolling.
- `app-library-row` identifies a selectable row with square borders, compact
  spacing, and a minimum scan height of `--coach-grid-library-row-height`.
- `coach-grid-library-controls` is the optional control stack. Its order is
  **find → refine → advanced → results**; `coach-grid-library-advanced` stays
  collapsed until the coach asks for it.
- `coach-grid-library-find`, `coach-grid-library-refine`, and
  `coach-grid-library-status` make the control stack tunable in one place
  without requiring shared CSS to know a renderer's fields or actions.
- The primitives are desktop coach-only. Mobile, player, and print surfaces
  retain their existing component-specific rules.
- A library renderer owns its row markup. Shared CSS never depends on a broad
  class such as `.play-item` alone.

## Scroll ownership

| Surface | Desktop scroll owner | Notes |
| --- | --- | --- |
| Practice Script | `.script-sidebar-panel` | Filters, result rows, and pagination travel together. |
| Wristband Maker | `.wb-available-plays` | Search, filters, and library status remain visible above the scrolling results. |
| Game Plan | `.gp-library-list` | The board stays fixed while the filtered library scrolls. |
| Call Sheet picker | `.cs-picker-list` | The dialog filters stay visible above its results. |
| Playbook | `.table-container` | The worksheet table is the library equivalent. |

## Row anatomy

Rows reserve a narrow action/control column, one flexible call column, and an
optional compact metadata/type column. Call names truncate on desktop instead
of wrapping into neighboring controls. The selected state remains owned by the
feature module so adding a play, selecting a batch, drag-and-drop, favorites,
and duplicate warnings retain their existing behavior.

## Guardrails

- Do not reintroduce generic `.play-item` or `.available-plays-container`
  rules outside the owning module.
- Do not give both a library pane and its nested list independent scrolling.
- Keep Coach Grid changes behind the desktop, non-player media/role guard.
- Verify Script, Wristband, Game Plan, Call Sheet picker, and Playbook after
  changing shared library geometry.
