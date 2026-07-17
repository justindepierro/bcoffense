# Coach Grid Theme

## Purpose

The Coach Grid theme makes the app feel like a reliable coaching worksheet:
fast to scan, dense without being cramped, and built around clear operational
choices instead of decorative UI. The Practice Script is the reference
implementation.

## Visual rules

1. Use square or near-square controls (`1px` radius) for coach workspaces.
   Pills are reserved for short status labels, not primary commands.
2. Use a muted surface, a visible border, and a single clear action color.
   Avoid layered cards, large shadows, and gradients inside work areas.
3. Treat rows and columns as a worksheet: consistent heights, cell dividers,
   tight labels, and one owner for each editable field.
4. Use color for meaning only: play type, status, warnings, and destructive
   actions. Never rely on color alone to identify an action or state.
5. Make secondary actions available but quiet: compact menus, drawers, and
   details controls instead of persistent multi-button strips.
6. Keep desktop density high while preserving existing coach-phone, player,
   tablet, and print behavior until each surface is explicitly migrated.

## Reusable primitives

| Primitive | Job | First home |
| --- | --- | --- |
| Command strip | Compact title, counts, and primary actions | `toolbar-surface--compact` |
| Worksheet grid | Bordered rows, aligned columns, type/status accents | Script coach grid |
| Command rail | Dense side-panel filters, search, add, and load controls | Script library rail |
| Cell input | Low-height square input/select with an explicit label or placeholder | Script coach rows |
| Status marker | Small count, state, or type signal; not a primary button | Existing badge/type tokens |
| Exception panel | Expand-on-demand detail for personnel, tools, or advanced settings | native `details`, drawers |

## Global tuning layer

`css/base.css` owns the opt-in Coach Grid tokens: radius, control heights,
gap, border, surface, and shadow. `css/components.css` exposes
`.coach-grid-command-strip` for shared command geometry. A module opts in with
that class and consumes the tokens in its local layout rules; this intentionally
does **not** globally flatten every button, modal, player card, or print sheet.

To adjust the system, change the Coach Grid tokens once. To change a module's
layout or responsive behavior, keep that rule in the module stylesheet.

## Module migration order

1. **Practice Script** — reference surface. Coach rows and library command rail
   are in the system; keep validating real practice-building work.
2. **Playbook** — the desktop coach toolbar and table are now in the first
   Coach Grid pass. Preserve the editor modal and player-facing cards until a
   separate pass.
3. **Call Sheet** — the desktop toolbar, category headers, and call cells are
   now in the Coach Grid system. Print remains its own verified contract.
4. **Game Plan** — the desktop command zone, filters, library, and boxes now
   share Coach Grid density. Keep its accent borders, drag/drop states, and
   print output as explicit exceptions.
5. **Wristband Maker** — migrate coach controls, not the printed/player card
   design.
6. **Scouting, Signals, Settings, and Admin** — use compact command strips and
   clear tables where they improve scanning.

## Migration rules

- Migrate one module or sub-surface per release. Do not change global border
  radius tokens to force the theme everywhere.
- Put new cross-module primitives in `css/components.css` only after two
  modules share the same proven behavior. Keep module layout deltas local.
- Preserve role, mobile, tablet, and print behavior. A desktop styling win is
  not permission to alter a player flow or a packet.
- Add or extend a smoke contract for each new root state, command surface, or
  layout guarantee.
- Validate the working screen with real data before migrating the next module:
  long names, empty states, selected rows, menus, and horizontal limits.

## Definition of done for a migrated surface

- Primary work is visible without scrolling past decorative chrome.
- Commands align to a predictable height and hierarchy.
- Editable data reads as cells; optional detail is collapsed by default.
- Functional colors match the shared status/type tokens.
- The matching mobile and print paths have been checked or explicitly left
  unchanged.
