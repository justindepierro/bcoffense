# Product Roadmap

This roadmap tracks high-impact product work for BCOffense: features that make the app faster, easier to use on mobile, and more professional for weekly football operations.

## Priority Order

1. [x] Universal Search and Command Palette
2. [x] Mobile Coach Mode
3. [x] Data Health Center
4. [x] Game Week Command Center
5. [ ] Smart Game Plan Builder
6. [ ] Practice Script Timeline View
7. [ ] Print and Export Studio
8. [ ] Saved Templates Everywhere
9. [ ] Playbook Intelligence
10. [ ] Large Playbook Performance Track

## 1. Universal Search and Command Palette

Goal: Let coaches move around the app and find work quickly from one keyboard/touch entry point.

- [x] Open from the header and with `Cmd/Ctrl+K`
- [x] Jump to major tabs and high-value actions
- [x] Search imported plays by call, formation, personnel, type, situation, and tags
- [x] Offer context actions such as send to script, open game plan, or open call sheet
- [x] Make the palette fully usable on mobile screens

Definition of done:

- A coach can find a play or destination without knowing which tab owns it.
- Desktop users can navigate quickly by keyboard.
- Mobile users have a reliable app-wide search affordance.

## 2. Mobile Coach Mode

Goal: Provide a simplified sideline/practice interface for fast use on phones.

- [x] Bottom navigation for Script, Call Sheet, Wristband, Game Plan, and Notes
- [x] Larger touch targets and condensed text
- [x] Current period/current call controls
- [x] Quick notes and opponent reminders
- [x] Optional "lock" view to prevent accidental edits

Definition of done:

- Coaches can run practice or game-day reference from a phone without fighting desktop controls.

Status:

- Phase 1 added a mobile-only coach dock for the five sideline destinations.
- Phase 2 added current period/current call controls inside Script on phones.
- Phase 3 added a mobile Notes card with game-week notes, opponent status, and prep reminders.
- Phase 4 added a mobile coach lock that preserves navigation/current-call review while blocking accidental edits.
- Mobile Coach Mode is complete for the current roadmap scope.

## 3. Data Health Center

Goal: Improve playbook quality so every downstream feature gets better.

- [x] Detect duplicate plays and near-duplicates
- [x] Flag missing critical fields
- [x] Find inconsistent casing/spelling in formation, personnel, tags, and base plays
- [x] Show unused or overloaded categories
- [x] Provide CSV import cleanup recommendations

Definition of done:

- A coach can trust the playbook data before building scripts, wristbands, and game plans.

Status:

- Phase 1 added a Playbook Data Health Center with exact duplicate, near-duplicate, and missing critical field review.
- Phase 2 added casing, spacing, and likely spelling checks across formation, personnel, tags, and base plays.
- Phase 3 added call sheet category coverage checks for unused, overloaded, and unrouted plays.
- Phase 4 added source CSV cleanup recommendations for missing columns, invalid values, sparse routing data, duplicate rows, and template alignment.
- Data Health Center is now complete for the current roadmap scope.
- Next slice moved into the Game Week Command Center.

## 4. Game Week Command Center

Goal: Turn the Dashboard into a true weekly operations hub.

- [x] Active opponent and game-week status summary
- [x] Prep checklist across playbook, script, wristband, call sheet, and game plan
- [x] Links to unfinished work and stale saved artifacts
- [x] Weekly notes and install priorities
- [x] Readiness score with actionable gaps

Definition of done:

- The dashboard answers "What do I still need to do this week?" in one view.

Status:

- Phase 1 added a dashboard Game Week Command Center summary with active opponent, schedule context, readiness status, and key prep counts.
- Phase 2 added a prep checklist across playbook, opponent scouting, game plan, script, wristband, call sheet, and notes.
- Phase 3 added an Action Queue for unfinished drafts, dirty current work, and stale saved scripts, wristbands, game-plan snapshots, and call-sheet templates.
- Phase 4 added a Weekly Focus block with a notes preview and top installation priorities from the Smart Install Report.
- Phase 5 added a readiness score panel with completion count, progress bar, and clickable next gaps.
- Game Week Command Center is now complete for the current roadmap scope.
- Next slice should move into the Smart Game Plan Builder.

## 5. Smart Game Plan Builder

Goal: Help coaches assemble a plan from identity, opponent tendencies, and situation needs.

- [x] Recommend openers, must-haves, answers, constraints, and situational calls
- [x] Use opponent tendency data when available
- [x] Highlight missing complements and overloaded concepts
- [x] Push recommendations to call sheet, script, and wristband

Definition of done:

- The app can suggest a usable first draft while keeping the coach in control.

Status:

- Phase 1 added a Smart Game Plan Builder modal with recommendation lanes for openers, must-haves, answers, constraints, and situational calls.
- Phase 2 uses active opponent tendency data to boost and label recommendations by top fronts, coverages, blitzes, and pressure rate.
- Phase 3 added Plan Balance alerts for missing complements and overloaded base-play concepts, with one-click adds for available complements.
- Phase 4 added top-pick push actions for the board, call sheet, practice script, and wristband card builder.
- Smart Game Plan Builder is now complete for the current roadmap scope.
- Next slice should move into the Practice Script Timeline View.

## 6. Practice Script Timeline View

Goal: Make script building feel like planning a practice, not editing a long table.

- [ ] Period blocks with rep counts, duration, tempo, and personnel load
- [ ] Drag/drop period ordering
- [ ] Per-period run/pass and situation summaries
- [ ] Quick duplicate, protect, template, and print controls

Definition of done:

- A full practice script is scannable at a glance and easy to reorganize.

## 7. Print and Export Studio

Goal: Make printed and exported materials look consistent, branded, and game-ready.

- [ ] Unified preview shell for scripts, call sheets, wristbands, game plans, and scouting reports
- [ ] Team branding, density, and column presets
- [ ] Print-safe overflow checks
- [ ] Export naming conventions tied to game week/opponent

Definition of done:

- Coaches can produce professional staff/player handouts without trial-and-error printing.

## 8. Saved Templates Everywhere

Goal: Reduce repetitive weekly setup.

- [ ] Game plan templates
- [ ] Script week/day templates
- [ ] Call sheet structure templates
- [ ] Wristband templates by position/group
- [ ] Installation templates

Definition of done:

- Common weekly workflows start from proven team defaults instead of a blank slate.

## 9. Playbook Intelligence

Goal: Show what the offense actually looks like from the imported data.

- [ ] Personnel, formation, and concept balance
- [ ] Situation coverage by down, distance, field zone, and tempo
- [ ] Player touch/opportunity summaries
- [ ] Constraint/complement map
- [ ] Identity alignment score

Definition of done:

- Coaches can spot gaps and tendencies in their own offense before opponents do.

## 10. Large Playbook Performance Track

Goal: Keep the app fast with hundreds or thousands of plays.

- [ ] Virtualize large playbook and picker lists
- [ ] Cache normalized search fields
- [ ] Defer expensive rendering until visible
- [ ] Move heavy parsing/filtering work off the critical path where possible
- [ ] Add repeatable browser performance probes

Definition of done:

- Large playbooks remain responsive on laptops, tablets, and phones.

## Guardrails

- Keep the app usable offline.
- Preserve desktop functionality while improving mobile workflows.
- Use existing vanilla JS/CSS patterns and delegated `data-action` behavior.
- Make features incremental and shippable; avoid broad rewrites.
- Bump the service worker cache after any HTML/CSS/JS change.
