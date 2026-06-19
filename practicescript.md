## Practice Script Nuts-to-Bolts Deep Scan (2026-06-19)

This is a full architectural audit of the Practice Script page focused on simplification, clutter reduction, parseability, and performance.

## Complexity Baseline

- Script runtime JS footprint (script-* files only): 10k+ lines
- Largest runtime modules:
  - js/script-render.js: 1747 lines
  - js/script-export.js: 1496 lines
  - js/script-storage.js: 1469 lines
  - js/script-add.js: 820 lines
  - js/script-periods.js: 807 lines
  - js/script-selection.js: 709 lines
  - js/script-smart.js: 691 lines
- CSS footprint:
  - css/script.css: 5771 lines
- Markup footprint:
  - index.html: 3624 lines
  - Script panel spans roughly line 876 to before call sheet panel

Interpretation: page complexity is functional but too concentrated in a few very large files, making it harder to reason about regressions.

---

## 23-Point Re-Audit (Deep)

Status key: PASS, PARTIAL, FAIL

1. PASS — Script DOM ancestry and core panel structure are coherent.
2. PASS — Desktop two-column scroll architecture is present.
3. PASS — Right scroll owner remains #scriptPlays.
4. PARTIAL — CSS contract is correct but duplicated across broad media blocks.
5. PASS — Desktop/mobile contracts are separated by selector strategy.
6. PARTIAL — Toolbar/action hierarchy is functional but visually dense.
7. PASS — Event path is deterministic and mostly delegated.
8. PARTIAL — Action ownership exists but script listeners still contain large switch-style branches.
9. PASS — No broad mobile interception layer blocking taps.
10. PASS — No major invisible click interceptors found.
11. PASS — Modal/overlay state model is coherent.
12. PASS — Presentation orientation behavior is stable.
13. PARTIAL — Presentation lifecycle is mostly stable but needs stress-loop testing.
14. PARTIAL — Render strategy mixes efficient row updates with full container innerHTML refresh paths.
15. PARTIAL — Observer scope is better but still broad in app-shell/auth for large subtree changes.
16. PASS — Mobile content-visibility overrides are in place for script rows/available plays.
17. PARTIAL — Idle CPU improved, but large script rerenders still spike main thread.
18. PASS — Service worker versioning and cache behavior are correct.
19. PASS — Design token usage is consistent.
20. PASS — Ownership boundaries exist but render-related concerns are still concentrated.
21. PASS — Scroll container contract and layout checks pass.
22. PARTIAL — Acceptance quality for layout is strong; measurable perf thresholds are still missing.
23. PARTIAL — Previous reports had drift; this file is now authoritative for current state.

---

## Core Simplification Findings

### A) Event Layer Complexity

Evidence:
- app-events script block contains dense click/change/input handling for many fields/actions.
- Large switch logic and repeated field mapping previously increased cognitive overhead.

Improvement applied:
- Script field update logic has been refactored into handler maps.
- High-frequency input paths are debounced to reduce churn.
- Script-specific listener wiring is now extracted into js/script-events.js.

Remaining simplification target:
- Add focused per-area tracing to script-events handlers for faster incident triage.

### B) Render Layer Complexity

Evidence:
- script-render.js still uses full container innerHTML assignment in core content path.
- Multiple querySelectorAll and innerHTML hot paths across render/export/storage flows.

Risk:
- Large script sizes trigger parse/reflow spikes.

Recommended simplification:
1. Create a small script-dom-patch helper that updates only changed row blocks and period headers.
2. Keep full rerender only for structural operations (insert/remove/reorder periods).
3. Add render reason codes (e.g., row-edit, period-edit, structure-change) to route patching behavior.

### C) CSS Clutter

Evidence:
- script-toolbar/script-actions/script-list/play-list rules appear in multiple regions and breakpoints.
- Broad media ranges create overlap that is hard to audit quickly.

Recommended simplification:
1. Extract explicit “Desktop Contract” block and “Mobile Contract” block near file end.
2. Move duplicated toolbar/action responsive overrides into grouped utility sections.
3. Keep sticky behavior flags scoped to desktop only with one canonical selector set.

### D) Markup Density

Evidence:
- Script panel in index.html includes many control clusters and tool menus inline.

Recommended simplification:
1. Move large repeated button groups to template-builder functions in JS.
2. Keep index.html focused on structural containers and anchor elements.
3. Add lightweight section comments that mirror runtime ownership files.

### E) Reliability/UX

Evidence:
- Heavy tool surface in one viewport can feel cluttered on mobile.
- Many controls are visible at once before intent narrowing.

Recommended simplification:
1. Introduce “Basic vs Advanced” mode toggles for script toolbar/actions.
2. Collapse advanced actions into one predictable drawer by default.
3. Keep search/sort/undo-save always visible; move infrequent tools behind one menu.

---

## What Was Refactored In This Pass

1. Script event ownership split
- Added js/script-events.js for Script-only listeners and drag wiring
- Removed Script-heavy listener block from js/app-events.js
- Preserved delegated action behavior while reducing global router complexity

2. Input pressure reduction
- Debounced high-frequency script input updates retained in extracted Script event module

3. First partial patch-render path
- Notes updates now patch row/preview directly in js/script-render.js without requiring full structural rerender

4. Controls simplification
- Added Basic vs Advanced controls mode toggle and persistence (STORAGE_KEYS.SCRIPT_CONTROLS_MODE)
- Basic mode now hides dense toolbar/action clusters to reduce cognitive load

5. Runtime performance guardrail
- Added slow full-render warning threshold in js/script-render.js

6. Cache rollout
- Service worker bumped to bcoffense-v606

---

## Refactor Plan (Safe Order)

Phase 1 (Low risk, high clarity)
1. DONE - Extract script event registration into dedicated module
2. DONE - Keep map-driven handlers and remove remaining duplicate field wiring
3. NEXT - Add small event tracing utility for script actions

Phase 2 (Performance + parseability)
1. IN PROGRESS - Introduce row/period patch updates in script-render (notes path shipped)
2. NEXT - Keep full rerender only for structural changes
3. DONE - Added render timing warning threshold for slow full renders

Phase 3 (UI simplification)
1. DONE - Basic/Advanced toolbar mode
2. IN PROGRESS - Reduce always-visible buttons on mobile
3. NEXT - Normalize sticky behavior and spacing between toolbar/actions/content

Phase 4 (File structure cleanup)
1. Split oversized script-render into focused files:
   - script-render-timeline.js
   - script-render-rows.js
   - script-render-health.js
2. Keep one shared facade export to avoid load-order breakage

---

## Immediate Next Targets

1. Expand patch-render coverage for defFront/defCoverage/defStunt/defBlitz and call fields
2. Convert one more non-structural update path to zero-full-rerender behavior
3. Add mobile-focused Basic mode tightening for action density

---

## Verification Notes

- Current service worker cache: bcoffense-v606
- This document supersedes prior audit summaries
- This audit is intended to guide active refactor work, not just describe status
