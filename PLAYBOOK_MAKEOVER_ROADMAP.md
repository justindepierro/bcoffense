# Playbook Page — Engineering Makeover Roadmap

> Deep audit completed 2026-06-24. Scope: `index.html` (playbook panel), `css/playbook.css`,
> and all `js/playbook-*.js` split-runtime files.
>
> **Legend:** 🔴 Bug · 🟡 Enhancement · 🔵 Cohesion · 🟢 Refactor · ⚡ Perf
> **Priority:** P1 = now · P2 = next · P3 = backlog
> **Size:** S (< 30 min) · M (30–90 min) · L (half day+)

---

## Audit Summary

| Area | Finding |
|---|---|
| **Inline event handlers** | ✅ Zero `onclick`/`onchange`/`oninput` violations. All handlers use `data-action`/`data-onchange`/`data-oninput`. |
| **Raw localStorage** | ✅ None. All persistence goes through `storageManager`. |
| **XSS / innerHTML safety** | ✅ All user text wrapped in `escapeHtml()`. Analytics overlays use computed numbers, not user strings. |
| **Dead JS** | ✅ No dead global functions. `clearAllFilters()` is an alias for `clearFilters()` — minor naming inconsistency. |
| **Inline CSS** | ⚠️ 2 inline style attributes in the playbook HTML panel. `style.display` manipulation used instead of `hidden` attribute in 2 JS locations. |
| **Hardcoded CSS colors** | ⚠️ 10 instances: 4 hex values for Vision Mode picture-pill backgrounds; 6 raw `rgba()` values for overlays and shadows. Should use CSS custom properties. |
| **Accessibility** | ⚠️ Multiple toolbar buttons have `title` but no `aria-label`. Dropdown triggers have no `aria-expanded` state. Playbook table `<th>` elements missing `scope="col"`. |
| **Toolbar density** | ⚠️ Top toolbar crams Search + Sort (6 elements) + Wristband select + Columns + Analytics▾ + Data▾ + Present + Add Play into a single row. Sort and Wristband belong in the filter drawer. |
| **File structure** | ⚠️ `playbook-chrome.js` (1924 lines) holds 5 analytics report engines (Balance, Situations, Touches, Constraints, Identity) that should live in a reports file, not the chrome/toolbar file. |
| **UX gaps** | ⚠️ Play count hidden when drawer is closed. "Clear All" button visible even with no active filters. Stats bar has no "total" chip. Collections count badge shows `0`. |

---

## Section 1 — Inline Styles & Pattern Violations

### 1. 🟢 P1 S — Remove inline style from Reset Columns button
**File:** `index.html` ~line 482  
The Reset Columns button carries `style="margin-top:6px;width:100%"` inline. Move to a CSS class.

```html
<!-- before -->
<button type="button" class="btn btn-xs" data-action="resetColumnVisibility" style="margin-top:6px;width:100%">Reset Columns</button>

<!-- after -->
<button type="button" class="btn btn-xs pb-col-reset-btn" data-action="resetColumnVisibility">Reset Columns</button>
```
```css
/* playbook.css */
.pb-col-reset-btn { margin-top: var(--space-xs); width: 100%; }
```

---

### 2. 🟢 P1 S — Replace `style="display:none"` with `hidden` attribute on picture chips row
**File:** `index.html` ~line 602  
The Vision Mode picture chip row has `style="display:none"` as its initial state. Use the semantic `hidden` attribute instead.

```html
<!-- before -->
<div class="pb-controls-row pb-chip-row pb-vision-only" id="pbChipsPictureRow" style="display:none">

<!-- after -->
<div class="pb-controls-row pb-chip-row pb-vision-only" id="pbChipsPictureRow" hidden>
```

---

### 3. 🟢 P1 S — Replace `style.display` manipulation with `hidden` attribute in `_buildPictureChips()`
**File:** `js/playbook.js` (`_buildPictureChips` function)  
Uses `row.style.display = "none"` / `row.style.display = ""` to toggle Vision Mode chip row. Use `el.hidden` attribute instead, consistent with the rest of the codebase.

```js
// before
row.style.display = "none";
// ...
row.style.display = "";

// after
row.hidden = true;
// ...
row.hidden = false;
```

---

### 4. 🟢 P1 S — Replace `style.display` with `hidden` in `updateActiveFilterBar()`
**File:** `js/playbook-filters.js`  
`updateActiveFilterBar()` sets `clearBtn.style.display = "none"` and `clearBtn.style.display = ""`. Use `clearBtn.hidden = true/false` instead.

```js
// before
if (clearBtn) clearBtn.style.display = "none";
// ...
if (clearBtn) clearBtn.style.display = "";

// after
if (clearBtn) clearBtn.hidden = true;
// ...
if (clearBtn) clearBtn.hidden = false;
```

---

### 5. 🟢 P1 S — Fix `body.innerHTML` in play editor → `setInnerHTML()`
**File:** `js/playbook-editor.js` ~line 467  
Direct `body.innerHTML = html` bypasses the project's sanitization layer. Change to `setInnerHTML(body, html)` for consistency.

---

### 6. 🔵 P2 S — Unify `clearFilters` / `clearAllFilters` action naming
**File:** `index.html`, `js/playbook-filters.js`  
The filter drawer's "✕ Clear All" button uses `data-action="clearFilters"`. The empty-state buttons use `data-action="clearAllFilters"`. These two functions are identical (one just calls the other). Change the drawer button to `data-action="clearAllFilters"` so both code paths reference the canonical alias.

```html
<!-- before -->
<button class="pb-clear-all" id="pbClearAll" data-action="clearFilters">

<!-- after -->
<button class="pb-clear-all" id="pbClearAll" data-action="clearAllFilters">
```

---

## Section 2 — CSS Token Violations

### 7. 🟢 P1 S — Add CSS custom properties for Vision Mode picture pill colors
**File:** `css/playbook.css` ~lines 3566–3575  
The 4 Vision Mode picture-pill background colors use hardcoded hex values. Replace with design tokens.

```css
/* base.css :root */
--pb-pic-wz-bg: #1d6fb8;    /* Wide Zone — blue */
--pb-pic-pull-bg: #b8541d;  /* Pullers — orange */
--pb-pic-dh-bg: #6b3fb8;    /* Downhill — purple */
--pb-pic-af-bg: #1d8a4a;    /* Anti-front — green */

/* playbook.css */
.pb-picture-pill.pb-pic-wz   { background: var(--pb-pic-wz-bg); }
.pb-picture-pill.pb-pic-pull { background: var(--pb-pic-pull-bg); }
.pb-picture-pill.pb-pic-dh   { background: var(--pb-pic-dh-bg); }
.pb-picture-pill.pb-pic-af   { background: var(--pb-pic-af-bg); }
```

---

### 8. 🟢 P1 M — Replace hardcoded `rgba()` values with design tokens
**File:** `css/playbook.css`  
Six instances of raw `rgba()` or `rgb()` color values should map to design tokens:

| Line | Value | Suggested token |
|------|-------|----------------|
| ~600 | `linear-gradient(135deg, rgb(10 18 42 / 0.03), rgb(25 42 81 / 0.08))` | `--color-bg-body-gradient` (new token) |
| ~671 | `rgb(255 255 255 / 0.88)` | `--color-bg-tooltip` (new token) or `--color-bg-lighter` |
| ~855 | `rgb(255 255 255 / 0.78)` | `--color-text-inverse-muted` (new token) |
| ~1113 | `rgba(0, 0, 0, 0.22)` | `--color-overlay-light` (new token) |
| ~1139 | `box-shadow: 4px 0 24px rgba(0, 0, 0, 0.18)` | `--shadow-drawer` (new token) |
| ~1626 | `background: rgba(0, 0, 0, 0.4)` | `--color-overlay` (already used elsewhere — check if it exists) |

Define any missing tokens in `css/base.css :root` and apply dark-mode overrides where appropriate.

---

## Section 3 — Accessibility

### 9. 🔴 P1 S — Add `aria-label` to sort direction toggle buttons
**File:** `index.html` (sort group)  
`#pbSortPrimaryDir` and `#pbSortSecondaryDir` buttons have a `title` attribute but no `aria-label`. Screen readers announce the button by its text content (▲/▼), not the title.

```html
<!-- before -->
<button class="pb-sort-dir" id="pbSortPrimaryDir" data-action="toggleSortDir" data-arg="primary" title="Toggle direction">&#9650;</button>

<!-- after -->
<button class="pb-sort-dir" id="pbSortPrimaryDir" data-action="toggleSortDir" data-arg="primary" title="Toggle sort direction" aria-label="Sort primary field: ascending">&#9650;</button>
```

Update the `aria-label` text in `_syncSortUI()` whenever the direction changes:
```js
if (primaryDir) {
  primaryDir.setAttribute('aria-label', `Sort primary field: ${currentSortDirection === 'asc' ? 'ascending' : 'descending'}`);
}
```

---

### 10. 🔴 P1 S — Add `aria-label` to icon-and-text toolbar buttons
**File:** `index.html`  
These toolbar buttons have `title` but no `aria-label`:

| Button | Suggested `aria-label` |
|--------|------------------------|
| `⚙ Columns` | `"Show/hide table columns"` |
| `Present` | `"Present selected play"` |
| `✚ Add Play` | `"Add a new play to the playbook"` |

---

### 11. 🔴 P1 S — Add `aria-label` to dropdown trigger buttons (Analytics, Data)
**File:** `index.html`  
`📊 Analytics ▾` and `📁 Data ▾` toggle buttons have `title` but no `aria-label`. Also add `aria-haspopup="true"` since they trigger dropdowns.

```html
<!-- before -->
<button class="btn btn-sm" data-action="toggleParentOpen" title="Playbook analytics...">📊 Analytics ▾</button>

<!-- after -->
<button class="btn btn-sm" data-action="toggleParentOpen" title="Playbook analytics..." aria-label="Open analytics reports menu" aria-haspopup="true">📊 Analytics ▾</button>
```

---

### 12. 🔴 P1 S — Track `aria-expanded` on dropdown toggles
**File:** `js/app-events.js` (`toggleParentOpen` handler)  
The dropdown menus toggled by `toggleParentOpen` update a CSS `.open` class but never set `aria-expanded` on the trigger button. Screen readers cannot tell if the menu is open.

```js
// app-events.js — in the toggleParentOpen handler, after toggling class:
const isOpen = wrap.classList.contains("open");
const triggerBtn = wrap.querySelector("[data-action='toggleParentOpen']");
if (triggerBtn) triggerBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
```

Apply the same fix to the `removeParentOpen` handler (set `aria-expanded="false"`).

---

### 13. 🔴 P1 S — Add `scope="col"` and accessible labels to table headers
**File:** `index.html` (playbook table `<thead>`)  
All playbook table `<th>` elements are missing `scope="col"`, which is required for screen reader table navigation. The 🎯 icon-only header is also missing a text label.

```html
<!-- before -->
<th class="col-gameplan" title="Game Plan">🎯</th>
<th class="col-install" data-action="sortPlaybook" ...>★ <span ...></span></th>

<!-- after -->
<caption class="sr-only">Playbook</caption>
<th scope="col" class="col-gameplan" title="Game Plan" aria-label="Game Plan">🎯</th>
<th scope="col" class="col-install" data-action="sortPlaybook" ...>★ <span ...></span></th>
<!-- (add scope="col" to all remaining <th> elements) -->
```

---

## Section 4 — Toolbar Density

### 14. 🟡 P1 M — Move Sort group into the filter drawer
**File:** `index.html`, `css/playbook.css`  
The Sort group (Sort label + primary select + direction button + "then" label + secondary select + direction button) occupies ~40% of the top toolbar row and is the biggest contributor to horizontal overflow on tablet/mobile. Sort is conceptually a filter-adjacent operation; it belongs in the filter drawer where filters live.

**Move the `<div class="pb-sort-group">` from `pb-top-row` into the top of `pb-filter-drawer-body`**, above the Type chips. Add a `<div class="pb-drawer-section-label">Sort</div>` heading above it.

Update `css/playbook.css`:
- Remove sort-group styles from the top-row context
- Add sort-group styles inside the drawer body context (full-width layout, consistent spacing)

**Toolbar after this change:** `☰ Filters` | `🔍 Search input` | `⚙ Columns` | `📊 Analytics ▾` | `📁 Data ▾` | `Present` | `✚ Add Play`

---

### 15. 🟡 P1 S — Move Wristband highlight select into the filter drawer
**File:** `index.html`, `css/playbook.css`  
`#playbookWristbandHighlight` is a visualization control (highlight matching wristband plays), not a primary action. Move it into the filter drawer below the Game Plan filter section, with a `<span class="pb-chip-label">🏈 Wristband</span>` label.

```html
<!-- Move from pb-utility-group to pb-filter-drawer-body, above pb-gameplan-bar -->
<div class="pb-drawer-filter-row">
  <span class="pb-chip-label">🏈 Highlight Wristband</span>
  <select id="playbookWristbandHighlight" data-onchange="highlightWristbandPlays" ...>
    <option value="">None</option>
  </select>
</div>
```

---

### 16. 🟡 P2 M — Rebalance toolbar after sort + wristband removal
**File:** `css/playbook.css`  
After items 14 and 15, the top toolbar will have fewer elements. Update `.pb-top-row` flex rules: make the search input grow to fill available space (`flex: 1`), tighten gaps, and ensure all remaining buttons fit comfortably on 768px+ screens without wrapping.

Add a responsive rule: at `< 600px`, collapse the analytics/data dropdowns and the present button behind the existing `☰ Filters` drawer button (they're already in the drawer via drawer-launched modals, so they don't need to be in the collapsed top bar).

---

## Section 5 — Filter UX & Empty States

### 17. 🟡 P1 S — Show play count in the meta bar (always visible)
**File:** `index.html`, `js/playbook-filters.js`  
`#playCount` is inside the filter drawer header — invisible when the drawer is closed. Users lose the filtered count feedback whenever they close the drawer.

**Solution:** Move `#playCount` to the `pb-meta-bar` (below the toolbar, above the stats bar) so it's always visible. Keep a secondary count in the drawer header as well.

```html
<!-- pb-meta-bar, before statsBar -->
<div class="pb-count-row">
  <span id="playCount" class="pb-count-badge"></span>
</div>
```

---

### 18. 🟡 P1 S — Auto-hide Collections count badge when count is 0
**File:** `js/playbook-collections.js`  
`#pbCollectionCount` displays `0` when no collections are saved, which is visual noise. Hide the badge when the count is zero.

```js
// In the function that updates pbCollectionCount:
const badge = document.getElementById("pbCollectionCount");
if (badge) {
  badge.textContent = count;
  badge.hidden = count === 0;
}
```

---

### 19. 🟡 P1 S — Add "total" chip to the stats bar
**File:** `js/playbook-render.js` (`updateStatsBar`)  
The stats bar shows per-type count chips but has no "total plays" indicator. Add a "Total: N" chip at the start that clears all active type chips when clicked.

```js
const totalChip = `<button type="button" class="stat-item stat-item--total${activeTypeChips?.size ? '' : ' stat-item--active'}" data-action="clearTypeFilters"><span class="stat-count">${plays.length}</span> Total</button>`;
statsBar.innerHTML = totalChip + html;
```

Add `clearTypeFilters()` function to `playbook-filters.js` (clears only type chips, then re-filters).

---

### 20. 🟡 P2 S — Improve zero-results empty state with hint text
**File:** `js/playbook-render.js` (`renderPlaybook` empty state section)  
The "No plays match your filters" empty state only shows a headline and a button. Add a `.empty-state__hint` paragraph with contextual advice, consistent with the JV empty state pattern.

```js
emptyEl.innerHTML =
  '<p class="empty-state__text">No plays match your filters.</p>' +
  '<p class="empty-state__hint">Try removing a filter, broadening your search, or checking the Type and Personnel chips above.</p>' +
  '<button class="btn btn-sm btn-secondary" data-action="clearAllFilters">✕ Clear All Filters</button>';
```

---

### 21. 🟡 P2 S — Show active filter count on "More Filters" toggle when collapsed
**File:** `js/playbook-filters.js`, `index.html`  
When `#pbMoreFilters` is collapsed and has active selections (Formation, Base Play, etc.), the user has no visual cue. Add a count badge to the `#pbMoreToggle` button.

```js
// In updateActiveFilterBar(), after calculating parts:
const moreFilterIds = ["filterFormation","filterBasePlay","pbFilterBack","pbFilterMotion","pbFilterProtection","pbFilterTempo"];
const moreCount = moreFilterIds.filter(id => document.getElementById(id)?.value).length;
const toggle = document.getElementById("pbMoreToggle");
if (toggle) {
  let badge = toggle.querySelector(".pb-more-count");
  if (!badge) { badge = document.createElement("span"); badge.className = "pb-more-count badge badge-primary"; toggle.appendChild(badge); }
  badge.textContent = moreCount;
  badge.hidden = moreCount === 0;
}
```

---

## Section 6 — Keyboard & Discovery UX

### 22. 🟡 P2 S — Add dynamic `aria-label` to search input with shortcut hint
**File:** `index.html`  
Update the search input's `aria-label` to mention the `/` focus shortcut for keyboard users.

```html
<!-- before -->
<input type="text" id="searchPlay" placeholder="Search plays..." aria-label="Search plays" .../>

<!-- after -->
<input type="text" id="searchPlay" placeholder="Search plays…" aria-label="Search plays (press / to focus)" .../>
```

---

### 23. 🟡 P2 S — Add "?" shortcut hint button to the toolbar
**File:** `index.html`  
Add a small `?` icon button next to the search input (or at the end of the toolbar) that opens the keyboard shortcuts modal. This makes shortcuts discoverable without knowing the keyboard shortcut first.

```html
<button class="btn btn-xs pb-shortcuts-hint" data-action="showKeyboardShortcuts" title="Keyboard shortcuts" aria-label="View keyboard shortcuts">?</button>
```

---

### 24. 🟡 P2 M — Add sort preset save/load to the filter drawer
**File:** `index.html`, `js/playbook.js`, `js/storage.js`  
After moving the sort group into the drawer (item 14), add a row below the sort controls with "💾 Save Sort" and "📂 Load Sort" buttons that persist/restore named sort configurations. Use `STORAGE_KEYS.SORT_PRESETS` (already exists) for storage.

This brings the playbook in line with the wristband module which already has named sort presets.

---

## Section 7 — Collections Panel Polish

### 25. 🟡 P2 S — Add accessible labels to collections panel actions
**File:** `js/playbook-collections.js`  
Collection "Load" and "Delete" buttons inside the collections list render with generic labels. Add `aria-label` values that include the collection name so screen readers announce "Load collection [name]" / "Delete collection [name]".

```js
// In the collection list render:
`<button data-action="loadCollection" data-arg="${escapeHtml(coll.name)}" aria-label="Load collection ${escapeHtml(coll.name)}">Load</button>
 <button data-action="deleteCollection" data-arg="${escapeHtml(coll.name)}" aria-label="Delete collection ${escapeHtml(coll.name)}" class="btn-danger">✕</button>`
```

---

## Section 8 — Print Panel Polish

### 26. 🔵 P3 S — Wrap print option checkboxes in `<fieldset>/<legend>`
**File:** `index.html` (print options grid in `#pbPrintPanel`)  
The print format checkboxes are in a flat grid with no semantic grouping. Wrap them in a `<fieldset>` with a `<legend class="sr-only">Print formatting options</legend>` so assistive technology announces the group context.

---

## Section 9 — Stats Bar Cache Fix

### 27. 🔴 P2 S — Invalidate stats bar cache when non-type chips are active
**File:** `js/playbook-render.js` (`updateStatsBar`)  
`_statsBarCache` is only skipped when `activeTypeChips.size > 0`. But if only `activePersonnelChips` or a dropdown filter is active, the stats bar will incorrectly use a stale cached value. Also invalidate on any filter change.

```js
// in updateStatsBar:
if (_statsBarCache && !activeTypeChips?.size && !activePersonnelChips?.size && !activePictureChips?.size) {
  statsBar.innerHTML = _statsBarCache;
  return;
}
```

Also call `invalidateStatsBarCache()` from `filterPlays()` and `clearFilters()`.

---

## Section 10 — Major Refactor

### 28. 🟢 P2 L — Split analytics report engines out of `playbook-chrome.js`
**File:** `js/playbook-chrome.js` → `js/playbook-reports.js` (new file)  
`playbook-chrome.js` (1924 lines) violates the owning-file principle: it holds 5 full analytics report engines (Balance, Situation Coverage, Touch Report, Constraint Map, Identity Alignment) that have nothing to do with toolbar chrome. These ~1700 lines should move to a new `js/playbook-reports.js` file.

**`playbook-chrome.js` should own only:**
- Column visibility management (lines 1–99)
- Filter drawer open/close (lines 100–150)
- Play preview tooltip (lines 153–213)
- Stats filter-by-type helper (lines 112–125)
- Column menu toggle / keyboard shortcuts (lines 137–151)

**`playbook-reports.js` should own:**
- Balance report: `_pbBalance*`, `openPlaybookBalanceReport`, `closePlaybookBalanceReport`, `clearPlaybookBalanceFilters`
- Situation coverage: `_pbSituation*`, `openPlaybookSituationCoverage`, `closePlaybookSituationCoverage`, `clearPlaybookSituationFilters`
- Touch report: `_pbTouch*`, `openPlaybookTouchReport`, `closePlaybookTouchReport`, `clearPlaybookTouchFilters`
- Constraint map: `_pbConstraint*`, `openPlaybookConstraintMap`, `closePlaybookConstraintMap`, `clearPlaybookConstraintFilters`
- Identity alignment: `_pbIdentity*`, `openPlaybookIdentityAlignment`, `closePlaybookIdentityAlignment`, `clearPlaybookIdentityFilters`

After the split, `playbook-chrome.js` should be ~200 lines and `playbook-reports.js` ~1700 lines.

**Checklist:**
- [ ] Create `js/playbook-reports.js`
- [ ] Move the 5 report-engine function groups there
- [ ] Add `<script defer src="js/playbook-reports.js">` to `index.html` after `playbook-chrome.js`
- [ ] Add `js/playbook-reports.js` to `LOCAL_ASSETS` in `sw.js`
- [ ] Update `AGENTS.md` file structure and load-order docs
- [ ] Bump SW version

---

## Progress Tracker

| # | Status | Size | Description |
|---|--------|------|-------------|
| 1 | ✅ | S | Remove inline style from Reset Columns button |
| 2 | ✅ | S | Replace `style="display:none"` with `hidden` on picture chips row |
| 3 | ✅ | S | Use `el.hidden` in `_buildPictureChips()` |
| 4 | ✅ | S | Use `el.hidden` in `updateActiveFilterBar()` |
| 5 | ✅ | S | `setInnerHTML()` in playbook-editor.js |
| 6 | ✅ | S | Unify `clearFilters` / `clearAllFilters` action name |
| 7 | ✅ | S | CSS custom properties for picture pill colors |
| 8 | ✅ | M | Replace raw `rgba()` values in playbook.css |
| 9 | ✅ | S | `aria-label` on sort direction toggle buttons |
| 10 | ✅ | S | `aria-label` on Columns / Present / Add Play buttons |
| 11 | ✅ | S | `aria-label` + `aria-haspopup` on Analytics/Data dropdowns |
| 12 | ✅ | S | `aria-expanded` on `toggleParentOpen` dropdowns |
| 13 | ✅ | S | `scope="col"` + `<caption>` on playbook table |
| 14 | ✅ | M | Move Sort group into filter drawer |
| 15 | ✅ | S | Move Wristband highlight into filter drawer |
| 16 | ✅ | M | Rebalance toolbar after sort + wristband removal |
| 17 | ✅ | S | Move play count to meta bar (always visible) |
| 18 | ✅ | S | Auto-hide Collections badge when count is 0 |
| 19 | ✅ | S | Add "Total" chip to stats bar |
| 20 | ✅ | S | Improve zero-results empty state with hint text |
| 21 | ✅ | S | Show active filter count on "More Filters" toggle |
| 22 | ✅ | S | `aria-label` with shortcut hint on search input |
| 23 | ✅ | S | Add `?` shortcut hint button to toolbar |
| 24 | ☐ | M | Sort preset save/load in filter drawer |
| 25 | ✅ | S | `aria-label` on collection Load/Delete buttons |
| 26 | ✅ | S | `<fieldset>/<legend>` for print option checkboxes |
| 27 | ✅ | S | Fix stats bar cache invalidation logic |
| 28 | ✅ | L | Split analytics report engines into `playbook-reports.js` |

---

*Audit completed 2026-06-24. Items 1-23, 25-28 shipped. Item 24 (sort preset save/load) deferred. SW v674 / commit `ea937e5`.*
