# UI Surface Inventory

This is the ownership policy for overlays, drawers, panels, and command bars.
It exists to prevent the app from drifting back into duplicate modal styles,
unknown close behavior, and competing scroll containers.

The machine-readable registry is enforced by
`tests/ui-surface-inventory-contract.test.mjs`. It covers every named root
whose ID ends in `Overlay`, `Modal`, `Panel`, `Drawer`, or `Sheet`.

## Approved surface patterns

| Pattern | When to use it | Scroll owner |
| --- | --- | --- |
| `blocking-layer` | A focused decision that pauses the current task: edit, recover, upload, quiz setup, or confirmation. | `layer` |
| `nonblocking-drawer` | Context that can stay visible beside the task: filters, notifications, discussion, display tools. | `panel` |
| `workspace-panel` | A permanent part of one workbench, never a page-level overlay. | `workspace` |
| `embedded-panel` | Supporting status or summary inside an existing workbench. | `workspace` or `panel` |

## Ownership rules

1. A named surface has one creator/owner file. Its close, focus, and lifecycle
   behavior live with that owner; do not use a same-name compatibility alias in
   another file.
2. A `blocking-layer` uses the shared layer contract: one scroll owner,
   Escape/close path, focus handling, and safe-area-aware actions.
3. A `nonblocking-drawer` may not also create a page-level vertical scroll.
   Navigation within it uses `scrollElementWithinPanel`.
4. Desktop workbenches own their inner scroll regions. No feature may use
   browser-wide `scrollIntoView` to reach a row inside Script, Playbook, Call
   Sheet, Game Plan, Wristband, or a discussion panel.
5. Toolbars are owned by their feature chrome: Playbook (`playbook-chrome.js`),
   Script (`script-render.js`/`script-display-options.js`), Call Sheet
   (`callsheet-render.js`), Game Plan (`gameplan-render.js`), and Wristband
   (`wristband-chrome.js`). New commands belong in that feature's existing
   action hierarchy, not a new floating toolbar.

## Adding a surface

Before adding an overlay, drawer, panel, or sheet:

1. Prefer an existing approved pattern.
2. Add the exact ID, owner, pattern, and scroll owner to the registry test.
3. Use the shared layer helper for blocking work, or the feature's established
   drawer for persistent context.
4. Add a close path that works by button, Escape, and backdrop when applicable.
5. Run `npm run test:unit` and `npm run test:quality`.

If a new interaction cannot fit one of the four patterns, it needs an explicit
architecture decision before implementation—not another one-off modal family.
