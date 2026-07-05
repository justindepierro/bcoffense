# Header and Toolbar Professionalization Audit

Status: active
Last updated: 2026-07-05

## Goal

Create one professional command language across BCOffense so players, coaches, and admins always know where to look for:

- page identity and current context
- primary workflow action
- search and filters
- display/view controls
- bulk/send/export/admin actions

The app should feel dense and operational, not like each module invented a separate toolbar.

## Current Findings

### App Chrome and Navigation

Current state:

- The global header and tab bar must always remain above panel-level drawers, FABs, and command surfaces.
- True overlays, modals, toasts, and skip links may still sit above the app chrome.
- `#mainApp` must never become the scroll owner on desktop; inner panels own scroll.

Professionalization direction:

- Treat the app header and tab bar as a formal app-chrome layer.
- Keep in-panel drawers below app chrome unless they are true modal overlays.
- Guard the z-index order in smoke checks so future UI layers cannot bury navigation.

### Shared primitives already exist

`css/components.css` already provides the preferred primitives:

- `page-header-surface`
- `page-header-row`
- `toolbar-surface`
- `toolbar-surface--compact`
- `toolbar-primary`
- `toolbar-secondary`
- `toolbar-status`
- `toolbar-overflow`
- `control-block`
- `segmented-control`

The Script page uses these best. New work should migrate toward these primitives instead of creating more bespoke module CSS.

### Playbook

Current state:

- Had a bespoke `pb-controls` top row plus a separate slide-out filter drawer and phone action sheet.
- Player summary exposed practice, filter, present, clear, stats, and quick filter pills in the same visual weight.
- Game Plan filter existed in the drawer but was missing from the newer player filter modal.

Professionalization direction:

- Treat the top row as a compact command bar.
- Make `Filter Plays` the lead player Playbook action.
- Keep `Present Showing` next to filters.
- Move less frequent staff/admin actions into overflow menus or action sheets.
- Keep quick filters as a low-height row, not as competing primary buttons.

### Game Plan

Current state:

- Uses a compact JS-rendered `gp-cmd-bar`, now migrated onto `page-header-surface` / `page-header-row`.
- Filter drawer is already separated from the board scroll region.
- Partially uses `toolbar-surface`.

Professionalization direction:

- Continue slimming Game Plan local CSS now that `gp-cmd-bar` uses the shared page-header/toolbar pattern.
- Keep identity, opponent, board name, health, and count in a status cluster.
- Keep `Filters`, `Build Plan`, `Print`, and `Actions` as the only top-level commands.

### Script

Current state:

- Best example in the app.
- Uses `page-header-surface`, `toolbar-surface--compact`, `control-block`, and `segmented-control`.

Professionalization direction:

- Preserve this pattern.
- Use Script as the reference for other module migrations.

### Wristband

Current state:

- Recently improved with a reliable settings modal.
- Still has many dense controls, bottom panels, and older module-specific styling.

Professionalization direction:

- Promote Save/Print/Appearance/Display/Sort into a single command hierarchy.
- Keep Colors, Display Options, and Sort in the reliable modal family.
- Collapse lower-frequency construction tools behind Actions.

### Call Sheet

Current state:

- High-density operational tool with many category/layout/display actions.
- Needs clearer separation between sheet identity, display, auto-populate, print, and templates.

Professionalization direction:

- Create a compact command zone: Load, Save, Print, Display, Actions.
- Keep category-level tools inside category headers, not the global toolbar.

### Dashboard / Player Portal

Current state:

- Role-specific surfaces exist, but action patterns differ from module pages.

Professionalization direction:

- Player: big next-step actions and clean study/practice entry points.
- Coach: game-week setup, readiness, publish, and handoff actions.
- Admin: storage, sync, roster/auth, import/export.

## Role-Based Command Rules

### Player

- Primary actions should be study or consume: Filter, Present, Open Practice, Player Home.
- No admin/data actions.
- Search and filters must remain visible or one tap away on Playbook.
- Mobile should expose a thumb-reachable Actions button only where useful.

### Coach

- Primary actions should build practice/game-week outputs: Add, Send, Build, Print, Publish.
- Filters/search should be first-class but compact.
- Bulk actions belong in Actions/overflow unless they are the page's main job.

### Admin

- Data, storage, import/export, sync, and cleanup are available but should not dominate daily coaching workflow.
- Admin-only actions should live in Data/Admin overflow groups.

## Target Header Contract

Every major module should converge on:

1. Identity/status cluster: page name, opponent/week, selected object, counts, health.
2. Primary action cluster: 2-4 common workflow actions.
3. Search/filter cluster: visible compact search plus a filter drawer/modal when needed.
4. Overflow/action hub: templates, data, exports, destructive actions, rare tools.
5. Role gate: player/coach/admin views should hide irrelevant commands before layout is calculated.

## QA Tooling Recommendation

Do not add Playwright as a runtime app dependency. BCOffense is intentionally a static, no-build PWA.

Approved exception:

- Keep Playwright isolated in `tests/`; it is not part of the app runtime, service worker cache, or shipped static shell.
- Use `BASE_URL=http://127.0.0.1:4173 npm run test:headers` from `tests/` after starting a local static server.
- The focused header suite covers app-chrome stacking, Playbook drawers, Game Plan command bar structure, and player Playbook actions/filters.

Useful next steps:

- Add an optional visual QA harness outside the shipped app path.
- Extend the existing local tool cache against a local static server.
- Cover desktop, tablet, phone, player, coach, and admin roles.
- Capture nav/header screenshots and layout assertions for each primary module.

Minimum useful scenarios:

- Header and tab bar remain visible above panel drawers/FABs.
- Playbook filters/actions do not wrap into clutter at 1280px.
- Game Plan command bar keeps Filters, Build Plan, Print, Actions visible.
- Player role shows only study/presentation/practice actions.
- Coach/admin role shows daily workflow actions first and data/admin actions in overflow.

## Migration Order

1. Playbook command surface and player filters.
2. Game Plan command bar using shared header primitives.
3. Wristband command hierarchy.
4. Call Sheet command hierarchy.
5. Dashboard/player portal quick actions.
6. Tendencies, Installation, Identity, Offense Builder cleanup.

## Verification Checklist

- Desktop: command zone does not wrap into visual clutter at 1280px.
- Tablet/iPad: primary actions remain visible; overflow is reachable.
- Phone: one search/filter entry point, one Actions entry point, no duplicate stacked buttons.
- Player role: no coach/admin controls are visible or auth-blocked in normal flow.
- Coach role: daily workflow actions are top-level.
- Admin role: data/storage tools are available but grouped.
- App shell: command zones do not scroll `#mainApp` or bury tabs.
- Stacking: `--z-header` > `--z-tab-bar` > `--z-fab` > `--z-drawer`, while `--z-overlay` / `--z-modal` remain above app chrome.
