# Product Cleanup Audit

Last updated: 2026-07-21

This is the active cleanup backlog for **product clarity**, not a rewrite list.
The rule is simple: preserve working football workflows and remove cognitive
load, duplicate chrome, hidden actions, and stale compatibility layers in
small, testable releases.

## Audit evidence

- Live admin inspection in Chrome on 2026-07-21.
- Static UI audit: no strict failures; 1,888 review signals were triaged rather
  than treated as defects by count alone.
- Source inventory: 63 persistent overlay/panel entry points, 335 declarative
  actions, and a few very large ownership files (`script.css` 15.8k lines,
  `playbook.css` 8.4k, `script-quiz.js` 7.4k).
- The live Settings surface exposed roster, personnel, sub packages, player
  portal branding, recovery, coach access, and account links in one long
  workspace. It is functional, but its hierarchy is too broad for daily use.

## Product principles

1. **One job per surface.** A screen should have one primary decision and one
   obvious next action.
2. **Progressive disclosure.** Daily coaching controls stay visible; rare
   configuration and recovery work move behind named, predictable entry points.
3. **One action hierarchy.** One primary action, at most two secondary actions,
   and the rest in an anchored menu or a clearly labelled tools drawer.
4. **Coach Grid is desktop workbench language only.** Player, phone, print, and
   presentation experiences remain deliberately simpler.
5. **No false alarms.** Sync, media, and readiness states must distinguish
   checking, queued, offline, failed, and complete without repeated red chips.

## P0 — correctness and trust

- [~] **C-001 · Validate the live offline state.** The old full-width message
  relied only on `navigator.onLine`. Release v1290 replaces it with an
  authenticated `/auth/me` reachability probe and a shared status dock, so
  browser-offline and team-service-unavailable states are now distinct. Do one
  live desktop + phone confirmation after deployment; never let a stale state
  hide media, filter results, or save confidence.
- [ ] **C-002 · Finish player media filter verification.** Confirm phone,
  tablet, and managed-coach views with the real team release: `Has Diagram`,
  `Needs Diagram`, and `Has Video` must reflect the canonical cloud manifests,
  not the device cache. Release `ff132f4` hardens the request path; this needs
  a live role-by-role check.
- [x] **C-003 · Establish a single visual status vocabulary.** Release v1290
  makes the header the quiet local-save indicator and reserves the shared dock
  for `Saving`, `Queued`, `Needs attention`, `Offline`, and temporarily
  unavailable team sync. Normal saved flashes and transient auto-publish
  warning toasts are removed; red is reserved for an unresolved upload or
  publish failure.

## P1 — reduce over-nested and duplicate UI

- [x] **C-010 · Split Settings into an operations landing page.** Release
  v1291 keeps the current data/editor controls intact but replaces the long
  initial wall with focused `Team identity`, `Roster & links`, `Personnel`,
  and `Player portal` workspaces. Player accounts, Coach access, and Recovery
  now have named entry points; the last authoring workspace stays open.
- [x] **C-011 · Make roster editing a purposeful table.** Release v1292
  replaces the always-open roster form with a searchable, filterable Coach Grid
  list. Link health, account state, and homework groups are visible at a glance;
  bulk import/add tools stay collapsed and one player expands for editing only
  when needed.
- [ ] **C-012 · Consolidate overlay families.** Reduce the 63 entry points to
  four approved patterns: anchored menu, side drawer, centered modal, and
  full-screen mobile sheet. Existing features stay intact; their container,
  close behavior, focus handling, and footer anatomy become consistent.
- [ ] **C-013 · Retire obsolete UI aliases after usage checks.** Start with
  explicit legacy display aliases in Call Sheet and Script. Remove an alias
  only after no renderer, saved setting, print path, or delegated action needs
  it; keep data migrations separate from visual cleanup.
- [~] **C-014 · Reduce command-strip duplication.** Release v1293 makes Script
  keep `Library`, `Save`, and `Quiz` visible while display, print, load, send,
  and repair tools live behind `Actions`; Game Plan keeps `Filters` and `Build
  Plan` visible while plans, save, print, and advanced tools live behind the
  same hub. Apply the same hierarchy to Call Sheet and Wristband next.

## P2 — visual consistency and responsive polish

- [ ] **C-020 · Audit every surface at desktop, tablet, and phone widths.**
  Use the role matrix for admin, managed coach, and player. Record only
  reproducible overflow, clipped controls, missing close paths, double scroll,
  or touch targets below 44px on phone.
- [ ] **C-021 · Establish density tiers.** Desktop workbenches use Coach Grid
  compact density; tablet uses readable compact density; phone uses cards,
  sheets, and a single-column primary task. Never scale a desktop table down
  until it merely fits.
- [ ] **C-022 · Cap nonessential timeline and summary height.** Practice
  Timeline, script headers, status chips, and player summaries should preserve
  play-row real estate. Long lists get a single horizontal scroll or an
  explicit `More periods` control, not overflow below the sticky table header.
- [ ] **C-023 · Normalize color semantics.** Use a small, high-contrast
  semantic palette: navy for structure, green for ready/saved, amber for
  pending, red for action-needed, plus distinct personnel/period colors. Avoid
  decorative color chips that compete with the primary call.
- [ ] **C-024 · Tighten print separately from screens.** Keep paper-only
  sizing, clipping, and grayscale controls within print styles. Inspect Chrome
  PDF output for clipping/gray rails before changing live-grid CSS.

## P3 — engineering cleanup that protects UX

- [ ] **C-030 · Split the largest style and behavior owners by surface.**
  Split `script.css` and `script-quiz.js` along existing runtime/render
  boundaries without changing global action names or loading order.
- [ ] **C-031 · Add modal semantics coverage.** The static audit found modal
  shells without explicit dialog semantics. Move each to the shared layer
  helper and require role, accessible label, Escape, close control, focus
  return, and a single scroll owner.
- [ ] **C-032 · Replace direct `scrollIntoView` where it can move the app
  shell.** Scope script/playbook jumps to their intended scroll container so
  sticky headers and tabs stay aligned.
- [ ] **C-033 · Add a UI inventory contract.** Every overlay, drawer, and
  toolbar gets a declared owner and approved pattern. New UI cannot add a fifth
  modal style or a second vertical scroll owner without an explicit exception.

## Safe cleanup sequence

1. Verify P0 with live team data and remove only false/noisy status behavior.
2. Refactor Settings and its account/personnel workflows into named surfaces.
3. Normalize one overlay family and one command strip at a time.
4. Run desktop/tablet/phone visual checks after each surface—not after a giant
   CSS sweep.
5. Delete proven-unused aliases only after behavior and print checks pass.

## Definition of done

- A coach can explain where to find a feature without opening more than one
  unrelated panel.
- Each visible work area has one primary action and one clear status.
- No phone sheet lacks a close path or hides actions behind browser chrome.
- No desktop workbench has competing vertical scroll owners or floating sticky
  headers.
- Player/managed-coach study flows remain intentionally simpler than admin
  authoring flows.
