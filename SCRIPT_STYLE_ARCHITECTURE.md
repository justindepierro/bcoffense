# Practice Script Style Architecture

This document is the ownership map for the Practice Script UI. It prevents a
new visual change from becoming a late cascade override with an unclear scope.

## Root State Contract

`#script` is the visual state root for coach-owned state:

- `data-controls-mode="basic|run|advanced"` is owned by `js/script-shared.js`.
  Basic is the concise Coach Grid, Run View is the live call/reps view, and
  Advanced exposes the full editing surface.
- `data-layout-mode="detail|compact"` is owned by
  `js/script-display-options.js`. The display radios are the accessible input;
  this attribute is the CSS-facing state marker.
- `.script-rail-collapsed` is owned by `js/script-shared.js`; the rail is
  library-only and deeper workspace tools open from the shared Actions hub.
  `scriptLibraryPinned` persists with display options: one desktop add closes
  the rail unless the coach pins it for batch building.

The app shell owns device and role state on `body` (`is-mobile-screen`,
`shell-phone`, `shell-tablet`, `data-auth-role`, and print classes). Script
styles consume these markers; they must not recreate their own device state.

## CSS Ownership

| Concern | Owner | Rule |
| --- | --- | --- |
| Script workspace, header, library rail, coach rows, player rows, and Script-only responsive behavior | `css/script.css` | Add coach-facing visual rules here, scoped below `#script`. |
| Shared tokens, buttons, panels, and generic controls | `css/base.css`, `css/components.css` | Change only when at least two product areas need the behavior. |
| Global page shell and tab-panel geometry | `css/layout.css` | Do not place Script row styling here. |
| Print and packet output | `css/print.css` | Print is an explicit visual exception. |
| Global device-shell behavior | `css/responsive.css` | Do not add Script-local layout rules here. Script has no selectors in this shared stylesheet; staff-tablet, coach-phone, packet, and player-panel Script behavior live in `css/script.css`. |

The Script library rail is part of the coach worksheet surface. Its header,
filters, and add controls use the same compact square treatment as the grid;
available-play cards retain their type accents and remain a separate list
surface.

The shared Coach Grid density language is an opt-in layer: `css/base.css`
owns the `--coach-grid-*` tuning tokens and `css/components.css` owns the
`.coach-grid-command-strip` primitive. Script keeps its worksheet geometry in
`css/script.css`, but uses those shared values so the approved coach surfaces
can move together without flattening player, print, and legacy UI.

## Coach Row Contract

`js/script-render.js` owns the row markup. The desktop coach grid is one
contract: selection, number, play call, hash, scouting, and notes/actions.
`basic` hides the scouting cell but keeps the notes/actions header. `compact`
and `detail` alter density, not the meaning or order of cells. Period headers
and player cards are separate surfaces and must not inherit coach-row grid
rules. Run View keeps only the number, call, hash, reps, notes, and type
signal; it must not become a second editing grid.

## Working-grid controls

- The number badge is always the play type accent in the live workspace,
  including Print-style Rows. Packet output remains owned by `css/print.css`.
- Desktop inline fields use the Coach Grid inline-field token; short fields
  keep calls scannable without turning each play into a tall form.
- Play rows alternate between two quiet worksheet grays and use their play-type
  accent for the row boundary, including a restrained tinted outline.
- Print preview rows are an explicit Display option, not part of the print
  preset or normal editing grid.
- Period actions render through one native `details.period-actions-menu`, not a
  persistent button strip below every period.
- Game Plan-sourced plays retain compact provenance in their Script record:
  board/opponent, source box or boxes, and JV status. The coach row shows a
  compact `GP · Box` marker plus a separate JV marker; the complete context is
  available through the marker title without widening the working grid.

## Safe Change Sequence

1. Update row markup and its matching header together.
2. Update the corresponding `data-controls-mode` rule in the same change.
3. Verify wide desktop, laptop, staff tablet, coach phone, player, and print
   contexts before removing the superseded selector.
4. Keep `#scriptPlays` as the coach list scroll owner on desktop.
5. Bump `index.html` asset versions and `sw.js` cache name for shipped changes.

## Migration Boundary

The current stylesheet is historical and intentionally being consolidated in
small, behavior-preserving slices. Coach worksheet rules belong in the named
`Practice Script working-grid refinements` section at the end of
`css/script.css`; do not add a second late “polish” block. Move a superseded
rule into that authority when its visual contract is proven, and extend
`scripts/smoke-check.js` for every new Script state contract.
`css/responsive.css` is now a hard boundary: it must remain free of Script
selectors.
