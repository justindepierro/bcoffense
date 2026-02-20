# UI/UX Consistency & Quality Audit Report

**App:** Football Playbook Web Application  
**Files Audited:** `index.html`, `css/styles.css`, `js/app.js`, `js/utils.js`, `js/playbook.js`, `js/script.js`, `js/wristband.js`, `js/callsheet.js`, `js/tendencies.js`, `js/installation.js`

---

## 1. Hardcoded Colors in CSS (Should Use CSS Variables)

Your `:root` defines an excellent set of variables (`--color-primary`, `--color-success`, `--color-danger`, `--color-text`, `--color-border`, etc.) but hundreds of raw hex colors are used instead throughout `styles.css`. Below is a representative sample — the full count exceeds **200+ instances**.

| Line(s) | Hardcoded Value | Should Be |
|---|---|---|
| 163, 201, 236 | `#1a1a1a` | `--color-text` or new `--color-text-dark` |
| 168, 355, 1700, 1792 | `#888` | `--color-text-secondary` or new `--color-text-light` |
| 206, 242, 303, 1670, 1734 | `#555` | `--color-text-muted` |
| 485, 659, 713, 826, 849, 1650, 1758 | `#666` | `--color-text-secondary` |
| 404, 480, 755, 763, 1951, 2006 | `#999` | New `--color-text-placeholder` |
| 772 | `#777` | Inconsistent gray — pick one variable |
| 776, 1704 | `#aaa` | Inconsistent gray |
| 1110 | `#bbb` | Inconsistent gray |
| 182, 388, 459, 685, 783, 1017, 1088, 1103, 1516 | `#ddd` | `--color-border` |
| 196, 1536, 1567 | `#eee` | `--color-border-light` |
| 412, 419, 496, 653, 742, 1221, 1227, 1985 | `#ccc` | `--color-border-med` |
| 259, 881, 998 | `#d0d0d0` | `--color-border-med` |
| 178, 302, 421, 498, 845, 1042 | `#f0f0f0` | `--color-bg-input` |
| 189, 745 | `#fafafa` | `--color-bg-lighter` (close enough) |
| 192, 325, 476, 749, 1926 | `#f0f7ff` | `--color-bg-blue-light` |
| 400, 471, 836, 1164, 1505, 1607, 1883, 1966 | `#e3f2fd` | `--color-bg-blue-tint` |
| 213, 1173 | `#e8f5e9` | New `--color-bg-success-tint` |
| 214 | `#2e7d32` | Related to `--color-success` |
| 632 | `#cce5ff` | Related to `--color-primary` light tint |
| 306, 427, 503, 892 | `#e0e0e0` / `#e4e4e4` / `#e9e9e9` | `--color-border-med` |
| 183, 351, 709, 822, 882, 1038, 1124, 1693, 1738, 2815 | `#333` | `--color-text` |
| 897, 899, 904 | `#764ba2` / `#5a3a80` | New `--color-accent-alt` |
| 1141 | `#f8f9fa`, `#e9ecef` (gradient) | `--color-bg-light`, `--color-border-light` |
| 1142 | `#adb5bd` | New `--color-border-subtle` |
| 1262 | `#2c3e50`, `#3498db` (gradient) | `--color-dark` family |
| 1244, 1547 | `#6c757d` | `--color-secondary` |
| 1253, 1557 | `#5a6268` | `--color-secondary` hover analog |
| 1386, 1395 | `#20c997`, `#1aa179` | Success gradient — should use variables |
| 1436, 1442 | `#6c757d`/`#495057`/`#5a6268`/`#343a40` | Secondary gradients — variables |
| 1737 | `#ffc107` | `--color-warning` |
| 1852, 1853, 1865, 1870, 1880, 1901, 1914 | `#333`, `#fff` | `--color-text`, `white` |
| 1970 | `#1976d2` | Related to `--color-primary-dark` |
| 1994 | `#ddd` (conic-gradient) | `--color-border` |

**And 100+ more instances in lines 2000-8361** following the same patterns.

---

## 2. Hardcoded CSS Values That Should Use Variables

### Border Radius (13+ distinct values instead of 4 variables)
`:root` defines `--radius-sm: 4px`, `--radius-md: 8px`, `--radius-lg: 12px`, `--radius-xl: 14px`, but raw pixel values are used everywhere:

| Pixel Value | Count (approx) | Should Be |
|---|---|---|
| `3px` | ~15 instances (lines 413, 420, 436, 497, 721, 813, 938, 952, 1159, 1211, 1222, 1228, 1236, 1248) | `--radius-sm` (or new `--radius-xs: 3px`) |
| `4px` | ~12 instances (lines 389, 460, 654, 885, 999, 1089, 1104, 1334, 1580, 1601, 1636, 1720) | `--radius-sm` |
| `5px` | 2 instances (lines 686, 693) | `--radius-sm` |
| `6px` | 6 instances (lines 782, 859, 1273, 1362, 1551, 1678) | New `--radius-md-sm` or `--radius-md` |
| `8px` | ~10 instances (lines 218, 260, 320, 743, 1018, 1263, 1307, 1378, 1428, 1462, 1619, 1659) | `--radius-md` |
| `9px` | 2 instances (lines 260, 285) | Not in system — inconsistent |
| `10px` | 2 instances (lines 1325, 1506) | Between `--radius-md` and `--radius-lg` |
| `14px` | 1 instance (line 125) | `--radius-xl` |
| `20px` | 1 instance (line 1517) | Not in system |

### Font Family (5 different declarations instead of 2 variables)
`:root` defines `--font-sans` and `--font-mono`, but:

| Line | Value | Should Be |
|---|---|---|
| 202 | `"SF Mono", "Menlo", "Consolas", monospace` | `var(--font-mono)` |
| 1160 | `monospace` | `var(--font-mono)` |
| 3514 | `monospace` | `var(--font-mono)` |
| 4847 | `Georgia, serif` | New `--font-serif` or `var(--font-sans)` |
| 4972 | `"SF Mono", "Monaco", "Menlo", "Consolas", monospace` | `var(--font-mono)` (note: includes "Monaco" unlike variable) |
| 6532 | `Arial, Helvetica, sans-serif` | `var(--font-sans)` |

### Font Sizes (many raw values instead of scale)
`:root` defines `--font-size-xs: 11px` through `--font-size-lg: 18px`, but raw sizes like `9px`, `10px`, `12px`, `15px`, `16px`, `20px` etc. are used hundreds of times.

### Spacing (raw pixel values instead of `--space-*`)
`:root` defines `--space-xs: 4px` through `--space-xl: 32px`, but virtually all padding/margin values use raw pixels.

---

## 3. Inline Styles in HTML (`index.html`)

**88 instances found.** Grouped by category:

### Display Toggling (16 instances)
These use `style="display: none"` to initially hide elements — should use a CSS class like `.hidden`:

| Line | Element |
|---|---|
| 25 | Upload format helper |
| 66 | Upload backup restore section |
| 93 | `#mainApp` |
| 306 | Playbook filter section |
| 437 | Script column toggle |
| 971 | Game plan embed |
| 990 | Script saved list |
| 1021 | `#previewContainer` |
| 1079 | Script search bar |
| 1461 | Wristband saved section |
| 1803 | Call sheet format tab |
| 1889 | Call sheet borders tab |
| 2021, 2028, 2037 | Print sections |
| 2046, 2156, 2184, 2192 | More print sections |

### Hardcoded Layout Values (12 instances)
| Line | Code | Issue |
|---|---|---|
| 47 | `style="margin-top: 10px"` | Use CSS class |
| 544, 553, 566, 1124, 1137 | `style="width: 100%"` | Use CSS class `.full-width` |
| 979, 1182 | `style="font-size: 11px"` | Use `--font-size-xs` in CSS |
| 1025 | `style="text-align: center; margin-bottom: 15px"` | CSS class |
| 1119 | `style="margin-top: 10px"` | Duplicate pattern |
| 1143 | `style="max-height: 350px"` | CSS class |
| 2206 | `style="min-width: 350px; max-width: 450px"` | CSS class for popup |

### Hardcoded Table Column Widths (12 instances)
Lines 1031-1042: All `<th>` elements in preview table have inline widths:
```html
<th style="width: 25px">#</th>
<th style="width: 30px">Hash</th>
<th style="width: 40px">Tempo</th>
<!-- ...etc -->
```
Should use CSS classes or a stylesheet rule for `.script-preview th:nth-child(n)`.

### Hardcoded Colors in HTML (25+ instances)
| Line | Code | Issue |
|---|---|---|
| 1150 | `style="font-weight: normal; font-size: 12px; color: #666"` | CSS class |
| 1200 | `style="background: #333"` | Color swatch — acceptable but could use data-attributes |
| 1206 | `style="background: #007bff"` | Color swatch |
| 1211 | `style="background: #28a745"` | Color swatch |
| 1216 | `style="background: #dc3545"` | Color swatch |
| 1221 | `style="background: #6f42c1"` | Color swatch |
| 1226 | `style="background: #fd7e14"` | Color swatch |
| 1270 | `style="background: #6c757d; color: white"` | Button — use `.btn-secondary` |
| 1413 | `style="padding: 3px 6px; font-size: 12px"` | Button override |
| 1450 | `style="cursor: help; color: #666"` | Use CSS class |
| 1894, 1910, 1926, 1942, 1958 | `style="color: #dc3545"` etc. | Border color labels |
| 2265-2400 | Color swatch buttons (13+ instances) | Pattern: `style="background: #hex"` |
| 2407 | `style="background: #6c757d; color: white"` | Use `.btn-secondary` class |
| 2414 | `style="background: #28a745; color: white"` | Use `.btn-success` class |
| 2633 | `style="width: 100px"` | CSS class |

### Cell Popup Extensive Inline Styles (lines 2206-2414)
The entire cell popup section (~208 lines) is heavily styled inline with flexbox layouts, padding, margins, font sizes, colors. This is the single largest concentration of inline styles.

### Smart Script Modal Buttons (lines 2679-2695)
```html
<button class="btn" style="background: #6c757d; color: white" ...>
<button class="btn" style="background: #17a2b8; color: white" ...>
```
These should use `.btn-secondary` and `.btn-info` classes.

---

## 4. Inline Styles in JavaScript

**200+ instances** across all JS files. Major categories:

### Direct `.style.display` Manipulation (~50+ instances)
Pattern: `element.style.display = "none"` / `"block"` / `"flex"`

| File | Lines | Count |
|---|---|---|
| app.js | 170, 171, 176, 185, 186, 208, 209, 242, 243, 711, 727 | 11 |
| script.js | 265, 268, 2853, 2854, 2858, 3332, 3333, 3354, 3371, 3375, 3510, 3511, 3528, 3551, 3554 | 15 |
| wristband.js | 1275, 1278, 1281, 1298, 1305, 1377, 1378, 1379, 1410, 1687, 1726, 1826, 1830, 2086, 2088 | 15 |
| callsheet.js | 1583, 1660, 1918, 1926, 2206, 2213, 2336, 2337, 2338, 2352, 3155, 3156, 3162, 3274, 3275 | 15 |
| tendencies.js | 1236, 1644 | 2 |
| installation.js | 1321, 1327 | 2 |
| utils.js | 2155, 2172 | 2 |

**Recommendation:** Use CSS classes like `.hidden`, `.visible`, `.flex-visible` and toggle with `classList.add/remove`.

### Hardcoded Colors in `.style.color` (~20 instances)
| File | Line | Code |
|---|---|---|
| script.js | 981, 994, 1082, 1446 | `statusEl.style.color = "#dc3545"` (danger) |
| script.js | 1065, 1121, 1186, 1494, 1525, 1650, 2773 | `statusEl.style.color = "#28a745"` (success) |
| script.js | 1200 | `statusEl.style.color = "#6c757d"` (secondary) |
| script.js | 1267 | `.style.borderColor = "#f44336"` (validation error) |
| script.js | 4419, 4479 | `statusEl.style.color = "#764ba2"` (accent alt) |
| callsheet.js | 1646 | `infoSpan.style.color = "#28a745"` or `"#666"` |
| callsheet.js | 1650 | `infoSpan.style.color = "#dc3545"` |

**Recommendation:** Use CSS classes like `.text-danger`, `.text-success`, `.text-muted` instead.

### Template Literals with Inline Styles (~100+ instances)
Major concentrations:

**utils.js `showReorderModal()` (lines 1259-1279):**
```js
style="display: flex;"
style="max-width: 400px;"
style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee;"
style="margin: 0;"
style="background: none; border: none; font-size: 20px; cursor: pointer; color: #666;"
style="font-size: 12px; color: #666; margin-bottom: 10px;"
style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;"
style="padding: 8px 16px;" (×3)
```

**utils.js `getFullCall()` (lines 1152, 1160):**
```js
`<span style="color:red">${shiftHtml}</span>`
`<span style="color:red">${motionHtml}</span>`
```

**script.js "Load Wristband" modal (lines 3108-3146):**
14 separate inline style attributes building an entire modal from JS.

**wristband.js cell rendering (lines 1182-1212, 1336, 1344-1345):**
```js
style="padding: 15px; text-align: center; color: #888;"  // empty state
style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee; font-size: 12px; background: #fafafa;"
style="color: #888; font-size: 10px;"
```

**callsheet.js stat bars (line 3225):**
```js
style="width: ${pct}%; background: ${colorFn(name)};"
```

**callsheet.js run/pass colors (line 3255):**
```js
<span style="color: #28a745">${runs}</span> / <span style="color: #007bff">${passes}</span>
```

**script.js print rendering (lines 3254, 3319-3321, 3460-3461, 3477):**
Entire print layout built with inline styles in template literals.

---

## 5. Inconsistent Button Patterns

### Multiple Button Systems
The codebase has **6+ distinct button pattern families** that don't all interoperate cleanly:

| Class Pattern | Location | Usage |
|---|---|---|
| `.btn` + `.btn-primary/success/danger/secondary` | Global (styles.css L1801+) | Main system |
| `.btn-sm` | styles.css L3381+ | Size modifier |
| `.btn-xs` | styles.css L3928+ | Tiny buttons (call sheet only) |
| `.btn-mini` | styles.css L1574+ | Script/wristband select-all/clear buttons |
| `.pat-btn` / `.pat-btn-smart` | styles.css L872+ | Period action toolbar buttons |
| `.ph-btn` | styles.css L932+ | Period header buttons |
| `.more-tools-btn` | styles.css L993+ | Menu trigger buttons |
| `.cs-tool-btn` | styles.css L3796+ | Call sheet toolbar buttons |
| `.custom-modal-btn` | styles.css L280+ | Modal dialog buttons |

### Buttons Without Classes (Inline-Styled in HTML)
| Line | Code |
|---|---|
| 1270 | `style="background: #6c757d; color: white"` instead of `class="btn btn-secondary"` |
| 2407 | `style="background: #6c757d; color: white"` — same pattern duplicated |
| 2414 | `style="background: #28a745; color: white"` instead of `class="btn btn-success"` |
| 2681 | `style="background: #6c757d; color: white"` — third duplicate |
| 2688 | `style="background: #17a2b8; color: white"` instead of `class="btn btn-info"` |

### Buttons With Mixed Classes + Inline Overrides
| File | Line | Code |
|---|---|---|
| wristband.js | 823 | `class="btn btn-danger" style="margin-left: auto; padding: 6px 12px; font-size: 12px;"` |
| index.html | 1413 | `style="padding: 3px 6px; font-size: 12px"` overriding `.btn-sm` |
| script.js | 3143, 3146 | `class="btn btn-primary" style="padding: 10px 20px;"` |

### Missing `.btn-info` Class
`--color-info: #17a2b8` is defined as a CSS variable but there's no `.btn-info` class. Buttons needing info color resort to inline styles (index.html L2688).

---

## 6. Inconsistent Spacing & Layout

### Arbitrary Gap Values
The flex `gap` property uses many different raw values instead of the `--space-*` scale:

| Value | Example Location |
|---|---|
| `5px` | Various button groups |
| `6px` | Period header buttons |
| `8px` (= `--space-sm`) | Sort criteria |
| `10px` | Modal button groups (utils.js L1272), card tabs |
| `12px` | Script toolbar |
| `15px` | Filter sections |
| `16px` (= `--space-md`) | Rarely used explicitly |
| `20px` | Script builder main gap (styles.css L667) |

### Inconsistent Padding on Similar Components
- `.script-item` padding: `10px 12px` (L782)
- `.play-item` padding: `8px 12px` (L686)
- `.custom-order-item` padding: `6px 10px` (L460)
- `.sort-criteria-item` padding: `6px` (L389)
- `.saved-script-card` padding: `12px 15px` (L1675)

These are all "list item" style components but have 5 different padding schemes.

---

## 7. Missing Hover/Active/Focus States

### Elements WITH Hover States (Good — ~100 rules found)
The app has good hover coverage on most interactive elements: `.btn:hover`, `.play-item:hover`, `.script-item:hover`, `.wristband-cell:hover`, `.callsheet-play:hover`, `.cs-tool-btn:hover`, etc.

### Elements MISSING Hover/Active States
| Selector | Line | Issue |
|---|---|---|
| `.btn-outline` | (used in HTML L45) | No dedicated hover/active defined |
| `.btn-add-period` | L2669 | Has hover (L2676) but no `:active` |
| `.btn-undo`, `.btn-redo` | L2897 | Has hover (L2905) but no `:active` feedback |
| `.back-btn` | L2828 | Has hover (L2840) but no `:active` |
| `.pcf-preset` | L2749 | Has hover (L2759) but no `:active` |
| `.card-tab` | L2346 | Has hover (L2356) but no `:active` |
| `.cs-tab` | L3898 | Has hover (L3909) but no `:active` |
| `.full-day-item` | L1769 | Has hover (L1778) but no `:active` |
| Color swatch buttons | L2306 | `.color-swatch:hover` exists (L2318) but no `:active` state |
| `.cs-border-swatch` | L4096 | Has hover (L4105) but no `:active` |
| Inline buttons in JS modals | Various | Buttons built in template literals have no hover/active CSS at all (they rely on inherited `.btn` styles where class is applied) |

### Missing `:focus-visible` on Custom Interactive Elements
While the global `:focus-visible` rule exists (L75), many custom interactive elements like `.color-swatch`, `.card-tab`, `.cs-tool-btn`, `.pat-btn`, `.ph-btn` don't have explicit focus styles, relying only on the generic outline.

---

## 8. Toast/Notification Inconsistency

### Single Toast Implementation (Good)
`showToast(message, duration = 2000)` is defined in `playbook.js` (L379) and used consistently across all files (~100 calls total).

### Inconsistencies Found

**Duration is always default (2000ms):**
Every single `showToast()` call uses the default 2000ms. The `duration` parameter exists but is never customized — longer messages get the same display time as short ones.

**No severity levels:**
All toasts look identical regardless of whether they're success ("✅ Saved!"), warnings ("⚠️ No empty cells!"), errors, or informational. Toasts rely on emoji prefixes for visual differentiation instead of CSS classes like `.toast-success`, `.toast-warning`, `.toast-error`.

**No toast for destructive actions:**
Some destructive operations (like clearing scripts, deleting wristbands) show a confirmation modal but the subsequent toast has no special styling to indicate the destructive nature.

---

## 9. Loading States

### One Loading Spinner Defined But Rarely Used
CSS defines `.loading-spinner` (L8326) with proper animation:
```css
.loading-spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
```

### Missing Loading States
| Operation | Issue |
|---|---|
| CSV file upload & parsing | No loading spinner during file read/parse |
| Backup import | No spinner during JSON parsing and validation |
| Print/PDF generation | No feedback while print view is being assembled |
| Auto-fill wristband | No spinner during batch cell filling |
| Smart Script generation | No loading indicator during algorithm execution |
| Call sheet render | No loading state when rebuilding complex call sheet layouts |
| Tendencies import | No spinner during CSV/JSON import |
| Dashboard rendering | No loading state while stats are computed |

All these operations happen synchronously on the main thread and may cause brief UI freezes on large datasets with no visual feedback.

---

## 10. Empty States

### Well-Handled Empty States (Good)
| Feature | Implementation |
|---|---|
| Script container | `.script-container.empty::before` (CSS L751) — shows message |
| Script empty guide | `.script-empty-guide` (CSS L760) |
| Call sheet picker | `cs-picker-empty` class with message (callsheet.js L1704, 1860) |
| Tendencies | `.td-empty-state` with icon (CSS L5295) |
| Installation | `.install-empty` with heading (CSS L7312) |
| Call sheet suggestions | `.cs-suggest-empty` (CSS L6891) |
| Storage info | `si-empty` class (CSS L7501) |

### Missing or Inconsistent Empty States
| Feature | Issue |
|---|---|
| Playbook table | No styled empty state when 0 plays match filters — table just shows empty `<tbody>` |
| Wristband play list | Uses inline styled `<div>` in JS: `'<div style="padding: 15px; text-align: center; color: #888;">No plays match filters</div>'` (wristband.js L1336) instead of CSS class |
| Dashboard "No opponent" | Built entirely in template literal with inline HTML (app.js) — should use a reusable empty state component |
| Saved scripts list | No dedicated empty state message when no scripts are saved |
| Saved wristbands list | No dedicated empty state message when no wristbands are saved |
| Full-day section | No empty state when no scripts exist for the full-day view |
| Call sheet "not on sheet" panel | Has styled empty (L3298) but uses an all-green message that looks different from other empty states |

### Inconsistent Empty State Styling
Empty states use at least 4 different visual styles:
1. `::before` pseudo-element (script container)
2. Dedicated `.td-empty-state`, `.install-empty` with icon + heading
3. Inline-styled `<div>` with hardcoded colors (wristband.js L1336)
4. Simple text messages (call sheet L3298, L3338)

---

## 11. Duplicate / Conflicting CSS

### `.play-count` — Defined Twice with Conflicting Styles

**First definition (L657):**
```css
.play-count {
  font-size: 13px;
  color: #666;
  margin-left: 15px;
}
```

**Second definition (L2818):**
```css
.play-count {
  background: var(--color-primary);
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  margin-left: 10px;
}
```

The second definition (badge style) overrides the first (plain text style). The first definition is dead CSS.

### Potential Duplicate Patterns Found

**Multiple near-identical "close button" styles** appear in various selectors:
- `.cs-sort-close:hover` (L4282)
- Custom modal close buttons
- Reorder modal close (built inline in utils.js L1263)
- Template literal modal close buttons

**Multiple "toolbar" patterns:**
- `.pat-btn` toolbox (L872)
- `.ph-btn` toolbox (L932)
- `.cs-tool-btn` toolbox (L3796)
- `.more-tools-btn` + `.more-tools-menu` (L993)

These share ~80% identical styles but are defined separately.

### `!important` Overrides (Potential Conflicts)
| Line | Rule |
|---|---|
| 836 | `.selected-row { background: #e3f2fd !important; }` |
| 1883 | `.full-day-section label:hover { background: #e3f2fd !important; }` |
| 1966 | `.wristband-cell.drag-over { background: #e3f2fd !important; }` |
| 1969 | `.wristband-cell.drag-target { background: #bbdefb !important; }` |
| 1970 | `.wristband-cell.drag-target { border: 2px dashed #1976d2 !important; }` |
| 1973 | `.wristband-cell.num-cell { background: #333 !important; }` |
| 2421+ | Print `@media` rules (~20+ `!important` rules) |

---

## 12. Layout Inconsistencies Across Panels

### Different Panel Header Patterns
| Panel | Header Style |
|---|---|
| Playbook | Tab bar + filter row |
| Script Builder | Unified toolbar with name/date inputs |
| Wristband | Card tabs + toolbar row + sort header |
| Call Sheet | Sub-tabs (Fields/Format/Borders) + preset bar + toolbar |
| Tendencies | Wizard steps + toolbar |
| Installation | Category accordion + progress ring |

Each panel has its own header/toolbar design language. There is no shared `.panel-toolbar` or `.panel-header` component.

### Sidebar vs Main Content Layout
- Script Builder: Left sidebar (play list) + right main (script) — `flex` with `gap: 20px`
- Wristband: Left sidebar (play list) + right main (grid) — similar but independent CSS
- Call Sheet: Full-width grid layout — no sidebar
- Tendencies: Full-width table — no sidebar
- These are inconsistent in how they present the same "select plays from list" pattern.

### Modal Construction Patterns
At least **3 different modal construction approaches**:

1. **`showModal()` / `showConfirm()` / `showPrompt()`** (utils.js) — Proper modal system with `.modal-overlay` + `.modal-content`
2. **Inline HTML modals in template literals** (script.js L3108-3149, utils.js L1259-1280, callsheet.js L2691) — Built from scratch in JS with inline styles
3. **Static HTML modals** (index.html: cell popup L2192+, smart script modal L2619+, keyboard shortcuts L2698+) — Full markup in HTML

### Print Layout Inconsistencies
- Script print: Built via `generatePDF()` and `printFullDay()` with separate table-building logic (script.js L3254+, L3460+)
- Wristband print: Uses `#wristbandPrint` container with grid layout
- Call sheet print: Uses `#callSheetPrint` with its own category-based rendering (callsheet.js L2206+)
- Each print layout has completely independent styling, and hardcoded inline styles in the JS template literals

### Tab System Inconsistencies
- Main tabs (index.html L107-152): Use `.tab` class
- Call sheet sub-tabs (Fields/Format/Borders): Use `.cs-tab` class
- Wristband card tabs: Use `.card-tab` class
- These three tab systems have similar but non-identical CSS (different padding, colors, hover effects).

---

## Summary of Priority Fixes

### Critical (Visual Bugs / Conflicts)
1. **Duplicate `.play-count`** — first definition is dead CSS (lines 657 vs 2818)

### High Priority (Maintainability)
2. **200+ hardcoded colors in CSS** — create and use semantic variables
3. **88 inline styles in HTML** — extract to CSS classes
4. **20+ `.style.color` assignments in JS** — use CSS class toggling
5. **50+ `.style.display` toggles in JS** — use `.hidden` / `.classList.toggle()`
6. **Modals built 3 different ways** — standardize on the utils.js modal system

### Medium Priority (Consistency)
7. **6+ button class families** — consolidate into unified system with size modifiers
8. **13+ distinct border-radius values** — use the 4 existing variables
9. **5+ font-family declarations** — use `--font-sans` and `--font-mono`
10. **Missing `.btn-info`** class
11. **Toast has no severity levels** — add success/warning/error variants
12. **Empty states inconsistent** — create reusable `.empty-state` component

### Low Priority (Polish)
13. **Missing `:active` states** on ~10 interactive element types
14. **Loading spinners** unused during async-feeling operations
15. **Spacing scale** not applied — raw pixel values everywhere
16. **Print layouts** have inline styles and independent markup patterns
