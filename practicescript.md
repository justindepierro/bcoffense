## Practice Script Deep Audit — Round 2 (2026-06-19)

This is a full redo of the 23-point audit with current-source verification after recent fixes (auth persistence, container sizing, mobile blur reduction, input debouncing).

Status key: PASS, PARTIAL, FAIL

1. PASS — Script DOM structure and pane ancestry are correct (`#script` -> `.script-builder` -> `.play-list` + `.script-list` -> `#scriptPlays`).
2. PASS — Desktop scroll architecture is clear and stable.
3. PASS — Right-pane scroll owner is `#scriptPlays.script-container`.
4. PASS — CSS cascade debt from old base scroll assumptions is largely cleaned.
5. PASS — Desktop/mobile contracts are separated and selector-scoped.
6. PARTIAL — Toolbar/action hierarchy works, but sticky chrome remains visually dense on small screens.
7. PASS — Event path is traceable and deterministic via delegated `data-action` handlers.
8. PASS — Action ownership is centralized enough for maintainability.
9. PASS — No broad mobile interception layer remains.
10. PASS — No critical invisible click interceptors found.
11. PASS — Overlay/modal state model is coherent.
12. PASS — Presentation orientation behavior is stable.
13. PARTIAL — Presentation/canvas lifecycle is mostly stable; still needs stress testing under rapid open/close loops.
14. PARTIAL — Render strategy is mixed: optimized in places, still full-list rendering in core path.
15. PARTIAL — MutationObserver usage is scoped, but auth and a11y observers remain broad at body subtree level.
16. PASS — Mobile content-visibility override is in place for script rows and available plays container.
17. PARTIAL — Idle CPU is improved, but large scripts still create visible main-thread spikes during full rerenders.
18. PASS — Service worker cache behavior is correct and versioned (`bcoffense-v603`).
19. PASS — Contrast/hierarchy and token usage are consistent.
20. PASS — Ownership boundaries are mostly clear across split runtime files.
21. PASS — Testing criteria for layout contract are met.
22. PARTIAL — Acceptance criteria pass for layout/event routing; performance criteria need numeric thresholds.
23. PARTIAL — Final report quality was improved, but prior report contained stale claims and is now superseded by this document.

---

## Deep Findings (Current)

### Critical

1. Full script list rerender remains the dominant cost
- Location: `js/script-render.js` (`renderScriptContent`, `renderScriptRows`)
- Issue: Major operations still rebuild entire script HTML string and reassign `innerHTML`.
- Impact: Large scripts spike render/parse/layout costs.

2. High-frequency input updates were previously too chatty
- Location: `js/app-events.js` script input listener
- Fix applied now: debounced updates for notes, defense fields, shift/motion, period label/notes.
- Impact reduced: fewer rerenders while typing.

### High

3. Sticky script chrome still competes for vertical space
- Location: `css/script.css` (`.script-toolbar`, `.script-actions`)
- Issue: Necessary but heavy visual chrome in constrained mobile heights.

4. Wide delegated listeners can still process high event volume
- Location: `js/app-events.js`, `js/auth.js`, `js/app-shell.js`
- Issue: delegation is correct, but large dynamic DOM and broad selectors increase work under frequent DOM churn.

5. Auth role application can be expensive on large subtree mutations
- Location: `js/auth.js`
- Improvement already applied: incremental subtree auth application + persisted session fallback.

### Medium

6. Practicescript report drift
- Location: this file’s previous content
- Issue: prior “complete” claims did not reflect runtime truth at time of complaint.
- Resolution: this document replaces old claims.

7. Search/filter UX in very large scripts
- Location: `js/script-render.js` search + list filtering
- Issue: acceptable for normal sizes, can feel laggy in very large datasets.

---

## Improvements Implemented In This Pass

1. Persistent auth session behavior for refresh reliability
- `js/auth.js`
- `js/storage.js`

2. Local dev login fallback hardening
- `js/auth.js`

3. Incremental auth UI application for dynamic DOM updates
- `js/auth.js`

4. Mobile/touch GPU optimization by removing heavy blur in script sticky chrome
- `css/script.css`

5. Debounced high-frequency script input updates
- `js/app-events.js`

6. Service worker cache bump for immediate asset refresh
- `sw.js` (`bcoffense-v603`)

---

## Next Deep Optimization Queue

1. Introduce partial DOM patching for script rows (avoid full-list `innerHTML` replacements for common operations).
2. Add perf instrumentation around `renderScriptPlays` with sampled timings and threshold alerts.
3. Add virtualized rendering mode for very large scripts (feature-flagged).
4. Add role-specific smoke tests (admin/coach/player) covering login persistence, tab access, and refresh behavior.
5. Add mobile stress test suite (rapid period expand/collapse, drag/drop, open/close presentation).

---

## Verification Notes

- Current cache version: `bcoffense-v603`
- Audit reflects current source as of this pass.
- This file supersedes earlier “all complete” reporting.
