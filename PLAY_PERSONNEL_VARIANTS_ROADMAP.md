# Play Personnel Variants Roadmap

## Goal

Allow one base play to be approved for multiple personnel packages without
copying the play. A variant inherits the base play by default and stores only
the differences that a coach intentionally enters.

This must preserve every existing play, saved script, wristband, call sheet,
game plan, backup, and player release.

## Non-negotiable safety rules

- [x] `play.personnel` remains the primary/default personnel for compatibility.
- [ ] No migration may change a play's current call, primary personnel, or
  signature.
- [ ] A variant may never silently change a saved script, wristband cell, or
  call-sheet play.
- [ ] Old backups and CSV imports must load before and after this work.
- [ ] New data must safely degrade on older records: no variants means the
  existing single-personnel behavior.
- [ ] Every slice must include an explicit data fixture, regression checks,
  commit, push, and Cloudflare deploy.
- [ ] Variant work stays additive until the final cleanup phase; no legacy
  field is removed while any saved data still depends on it.

## Data contract

### Base play

The existing play remains the source of truth for all shared data:

```js
{
  _id: "existing-id-if-present",
  personnel: "Blue", // primary/default; never removed
  formation: "Navy Rt",
  play: "Zorro Wolf",
  // existing fields remain unchanged
  personnelVariants: []
}
```

### Personnel variant

`personnelVariants` is an optional array. Each variant is a small patch, not a
copied play:

```js
{
  id: "pv_unique_stable_id",
  personnel: "Gold",
  overrides: {
    // Empty at first. Only fields intentionally changed for Gold are stored.
    // Future approved fields: formation, tags, motions, shifts, protections,
    // notes, player rules, and lineup-related metadata.
  }
}
```

Rules:

1. The base personnel is implicit and represented by variant reference
   `"base"`; it is not duplicated in `personnelVariants`.
2. A variant has a stable ID so saved Script, Wristband, and Call Sheet choices
   do not break if its label changes.
3. `getEffectivePlayVariant(play, variantId)` will return a derived play:
   base fields plus approved variant overrides. It must not mutate the base
   play.
4. `getPlayPersonnelOptions(play)` will always return the primary personnel
   first, followed by valid variants.
5. Variant overrides are restricted to an allowlist. Unknown or unsafe
   override keys are ignored on read and removed by normalization.

## Per-surface selection contract

Each downstream use of a play stores a reference to the original play plus its
chosen presentation, never a cloned variant.

```js
{
  // Existing copied/saved play data remains intact.
  personnelVariantId: "base" | "pv_unique_stable_id",
  personnelDisplayMode: "selected" | "approved-options",
  personnelDisplayVariantIds: ["base", "pv_unique_stable_id"]
}
```

- **selected**: uses one personnel variant for the call, emoji, package,
  lineup, rules, filters, and exports.
- **approved-options**: shows a coach-selected list of possible personnel
  packages. This is presentation-only; it does not change the active lineup.
- A Wristband cell may display multiple approved options, but one selected
  variant remains its active metadata/lineup context.

## Coach experience

### Edit Play

- [ ] Keep the existing `Personnel` field as **Primary Personnel**.
- [ ] Add **Also approved in** beneath it, using chip controls and team
  personnel suggestions.
- [ ] Add a clear base/variant editor switch with persistent visual context:
  `Editing base play` versus `Editing Gold variant`.
- [ ] Display inherited fields as inherited, and changed fields as local
  overrides with a `Reset to base` action.
- [ ] Prevent duplicate personnel labels, blank labels, and duplicate variant
  IDs.

### Script

- [ ] Replace the free-form script-only personnel picker with approved
  personnel choices for that play; retain a guarded legacy/custom option only
  where needed for existing records.
- [ ] Let a script row choose one active variant or show selected approved
  options.
- [ ] Resolve package slots, depth chart, substitutions, and player rules from
  the active variant's effective personnel.

### Wristband

- [ ] Reuse the same approved variant picker per cell.
- [ ] Allow multiple approved labels to print/display cleanly without treating
  them as separate plays.
- [ ] Migrate the current cell-level `extraPersonnel` text safely into the new
  display model only after verifying every existing saved wristband.

### Call Sheet and Game Plan

- [ ] Let a call-sheet play select an active variant or show selected approved
  options.
- [ ] Let the Game Plan filter by any approved personnel, while preserving the
  current primary-personnel grouping until explicitly enhanced.
- [ ] Make the Personnel call-sheet page use the active game-plan play and its
  selected effective personnel—never every play in the library.

### Player-facing views

- [ ] Swipe View and quizzes use the selected active variant only.
- [ ] Never expose coach-only alternate personnel or variant notes to players
  unless the coach explicitly chooses to show them.

## Implementation slices

### Phase 0 — Inventory and regression fixtures

- [ ] Capture representative records: base-only play, alternate personnel,
  script override, multi-personnel wristband cell, call-sheet play, active
  game-plan play, CSV import/export, and cloud backup/restore.
- [ ] Record the current signatures and counts for those fixtures.
- [ ] Add contract tests proving base-only records remain byte-for-byte
  behavior-compatible.

### Phase 1 — Canonical read model (no visible behavior change)

- [ ] Add normalization for `personnelVariants` at playbook hydration,
  import, restore, and cloud release boundaries.
- [ ] Add shared helpers for options, lookup, effective-play derivation, and
  validation.
- [ ] Add tests for malformed, duplicate, old, and new records.
- [ ] Deploy with no UI write path enabled yet.

### Phase 2 — Edit Play authoring

- [ ] Add the primary/additional personnel controls.
- [ ] Add the base-versus-variant editing context and inherited-field visual
  feedback.
- [ ] Allow only safe metadata overrides in the first release: formation,
  tags, shifts, motions, protections, notes, and player rules.
- [ ] Verify CSV export retains the primary field and backup/cloud sync retain
  all variant data.

### Phase 3 — Coach workflow adoption

- [ ] Script variant selector and effective lineup/rule resolution.
- [ ] Wristband active/display selection and print verification.
- [ ] Call-sheet active/display selection and third personnel-sheet support.
- [ ] Game Plan filtering by approved personnel.

### Phase 4 — Player release and publishing hardening

- [ ] Explicitly define the selected variant payload sent to players.
- [ ] Verify publish, resume, offline cache, and Cloudflare release behavior.
- [ ] Verify Swipe View, Quiz, notifications, and comments still target the
  original play identity.

### Phase 5 — Controlled migration and cleanup

- [ ] Offer a review report for existing script overrides and wristband
  `extraPersonnel` values; do not auto-delete either.
- [ ] Migrate only coach-approved compatible values.
- [ ] Remove duplicate legacy paths only after backup/restore and production
  regression checks pass.

## Definition of done

- [ ] A coach can create a Gold variant of a Blue play without copying the
  play.
- [ ] The Gold variant inherits every base field until it is explicitly
  overridden.
- [ ] A coach can see unmistakable base/variant editing context and reset an
  override safely.
- [ ] Script, Wristband, Call Sheet, Game Plan, printing, export, backup,
  restore, cloud publish, player Swipe View, and Quiz all resolve the chosen
  variant correctly.
- [ ] Existing base-only data behaves exactly as it did before this feature.
