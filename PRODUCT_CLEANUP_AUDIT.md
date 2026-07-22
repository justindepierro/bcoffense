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
  actions, and a few high-churn ownership files (`script.css` 8.4k lines,
  `script-quiz.css` 7.4k, `playbook.css` 8.4k, and
  `script-quiz-foundation.js` 4.1k).
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
  not the device cache. Release `ff132f4` hardens the request path; release
  `v1305` additionally separates player/managed-coach diagram filtering from
  local IndexedDB blobs, so only a signed Cloudflare manifest can mark a
  player-visible play diagram-ready. Release `v1306` warms that same manifest
  on opening Player Playbook and reports `Checking diagrams…` rather than a
  device-cache count. Release `v1307` also treats a background release refresh
  as a fresh manifest check, so `Needs Diagram` cannot briefly classify every
  play as missing after its cache is intentionally cleared. Release `v1308`
  applies the same canonical-only, refresh-safe model to `Has Video`; release
  `v1309` fixes the server index so the player receives only real, authorized
  clip manifests—not every play media ID that is merely authorized for a future
  upload. Release `v1310` also fetches that private, role-scoped clip index
  with `no-store`, preventing a browser from retaining the old broad index.
  Automated contracts pass; this still needs the final phone, tablet, and
  managed-coach role check against a live team release.
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
- [x] **C-012 · Consolidate overlay families.** Release v1295 moves the shared
  `Actions` hub and Player Playbook filter sheet onto the common layer helper:
  one scroll owner, backdrop/Escape dismissal, focus capture/return, and a
  phone-safe sheet. Release v1301 brings Signals watch, upload, and upload
  review dialogs into that same contract; quiz homework already followed it.
  Release v1302 adds the Media Inventory and Archived Diagram Recovery dialogs,
  including a clean handoff from the audit into recovery. Release v1303
  completes this family with Diagram Health and Publish Media. The daily
  authoring, quiz/homework, and media workflows now share one layer contract
  without changing their underlying recovery or publishing behavior.
- [~] **C-013 · Retire obsolete UI aliases after usage checks.** The first safe
  slice removes the unused `setPlaybookCategoryCleanupHide` no-op and ten
  readiness-only Script CSS aliases with zero remaining renderer, setting,
  print, or delegated-action references. `shell-cleanup-contract.test.mjs`
  now verifies each runtime script is loaded/cached exactly once, those aliases
  cannot quietly return, and Playbook filter-chip listeners remain idempotent
  across workspace rehydration. Keep data migrations separate from visual
  cleanup; Call Sheet aliases still need their own usage audit.
- [x] **C-014 · Reduce command-strip duplication.** Release v1294 applies one
  action hierarchy across the four daily workbenches. Script keeps `Library`,
  `Save`, and `Quiz`; Game Plan keeps `Filters` and `Build Plan`; Call Sheet
  keeps page/orientation controls and `Auto-Populate`; Wristband keeps undo,
  redo, colors, library, and `Save`. Print, display, load, templates,
  transfers, repair, and rare bulk tools now use the shared `Actions` hub.

## P2 — visual consistency and responsive polish

- [~] **C-020 · Audit every surface at desktop, tablet, and phone widths.**
  Live admin pass on 2026-07-21: the Script workbench has no page-level
  horizontal overflow at 1440px or 390px; the phone Playbook filter drawer has
  a visible close control and closes cleanly. The tab rail and timeline rail
  scroll intentionally. Release v1296 raises the mobile `Filters` trigger to
  a 44px touch target and gives the Script a dedicated tablet command row, so
  identity, status, and date remain readable above its actions at 1024px.
  Managed coach and player release checks remain required for media-filter
  truth and role-specific touch targets.
- [~] **C-021 · Establish density tiers.** Release v1299 declares shared
  desktop, tablet, and phone density tokens. Desktop keeps Coach Grid compact;
  tablet gives Script, Game Plan, Call Sheet, and Wristband a common readable
  40px toolbar-control tier; phone preserves its card/sheet, single-primary-
  task flows. Confirm one iPad/tablet coach session before marking done.
- [x] **C-022 · Cap nonessential timeline and summary height.** Release v1298
  makes the Practice Timeline a 92px jump rail with a single compact action
  row per period; additional periods remain horizontally scrollable instead of
  taking play-row real estate. It also restores a 44px mobile search field and
  Filter entry point for players and managed coaches; the signed-in behavior
  was confirmed after deployment.
- [~] **C-023 · Normalize color semantics.** Release v1300 establishes navy
  for structure/context, green for ready, amber for pending, and red for
  action-needed. The Script period chooser now offers 16 high-contrast,
  deliberately distinct coaching colors instead of 24 near-duplicates; its
  default, editor, timeline, and print header share the same navy foundation.
  Confirm the period-color modal and a printed Script, then mark done.
- [~] **C-024 · Tighten print separately from screens.** Release v1297 gives
  every printed play-row cell an explicit white-or-highlighted surface, so
  Chrome cannot show a gray compositor rail through the Reps edge; the status
  dock remains excluded from both the page and isolated artifact. Confirm once
  in Chrome PDF preview before marking it complete. Keep paper-only sizing,
  clipping, and grayscale controls within print styles.

## P3 — engineering cleanup that protects UX

- [~] **C-030 · Split the largest style and behavior owners by surface.**
  Release v1343 begins the safe CSS split at the existing Script Quiz boundary:
  `script.css` now owns the Coach Grid workbench and `script-quiz.css` owns the
  7.4k-line quiz/assignment surface. The browser loads them in their exact
  former order, and the shell contract verifies both are loaded and cached once.
  The same release moves Quiz settings, roster health, awards, and coach setup
  into `script-quiz-foundation.js`, leaving the 3.3k-line player runtime in
  `script-quiz.js`; the two scripts retain their exact former execution order.
  The same release corrects the player-script handoff: a player-visible script
  is written locally before its release is requested, its sync receipt remains
  active until the immutable cloud release commits, and an open player app
  revalidates the tiny ETag-backed release every 45 seconds without a visible
  refresh state.
- [~] **C-031 · Add modal semantics coverage.** Release v1295 establishes the
  contract on the shared Actions hub and Player Playbook filters: dialog
  semantics, Escape, close control, focus return, and one scroll owner. Release
  v1301 adds static enforcement for Signals watch/upload/review overlays;
  v1302 adds Media Inventory and Archived Diagram Recovery coverage; and v1303
  adds Diagram Health and Publish Media. Continue migrating the remaining
  specialized modal families in small slices.
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
