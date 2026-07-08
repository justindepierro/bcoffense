# Player Quiz Experience Audit

Last updated: 2026-07-08

This is the active audit and roadmap for making player quizzes feel more useful,
fair, and fun. The old `PLAYER_QUIZ_ROADMAP.md` was completed and superseded;
this file focuses on the next generation of quiz quality.

## Product Goal

Players should want to open Quiz Center because it feels like a fast study game,
not a test built from whatever metadata happened to exist.

The quiz engine should:

- Prefer clear football questions over tiny metadata guesses.
- Use diagrams and formation recognition as strong fallbacks when assignment
  rules are thin.
- Keep questions easy enough to build confidence before adding harder variants.
- Teach immediately after a miss with the call, diagram, rule, and coach note.
- Let coaches see why a source will feel good or bad before publishing it.

## Current Flow Audit

### 1. Entry Points

Current paths:

- Player Home opens Quiz Center.
- Player Practice opens Quiz Center or starts a script quiz.
- Leaderboard can send a player back into Quiz Center.
- Coach/Admin Quiz Setup controls source availability, settings, rewards, and
  source quality.

What works:

- Quiz is now a real workflow, not only a Practice button.
- Resume state works.
- Script and Game Plan sources are separated.
- Roster-linked position defaults and secondary position mode exist.
- Quiz Center now has player-facing challenge modes: Quick Hits, Diagram Drill,
  Know Your Job, Game Plan Check, and Missed Plays.

Problems:

- Coach setup now recommends the best mode per source, but it does not yet let
  coaches publish a source directly into a specific default mode.
- Thin sources are hidden from player readiness language, but the player can
  still end up with low-interest call-ID questions.

### 2. Source Quality

Current source scoring checks:

- Diagrams.
- Position rules.
- Notes.
- Situation metadata.
- Defense metadata.

What works:

- Coach setup already identifies thin sources.
- Coach setup previews Responsibility, Rule to Play, Call ID, and Diagram ID.
- Thin sources are labelled for coaches.

Problems:

- The quality score overvalues metadata that should not drive player questions.
- "Situation" and "Defense" are useful context, but should rarely be the main
  thing a kid has to identify.
- The source score does not yet answer: "Will this feel fun for a player?"

Better scoring should separate:

- Fun-ready: diagrams, distinct formations, distinct calls, readable choices.
- Learning-ready: player rules, coach notes, wrong-answer feedback.
- Context-ready: situation, defense, tags.

### 3. Question Generation

Current types:

- `responsibility`: Given the call, pick your rule.
- `play_from_rule`: Given a rule, pick the play.
- `diagram`: Given a redacted diagram, pick the play.
- `call`: Pick the full call.

Current selection behavior:

- Responsibility wins when a position rule exists and there are enough unique
  rule choices.
- Rule to Play appears on alternating indexes when a rule exists.
- Diagram is currently used mainly when no position rule exists.
- Call ID is the final fallback.

Problems:

- Diagram questions should not be treated as a last resort. They are often the
  most player-friendly question.
- Call ID questions can be too wordy and too detail-heavy.
- The engine does not ask simpler fallback questions like "What formation is
  this?" or "Run or pass?".
- The engine can ask based on partial information without making the prompt feel
  fair.
- There is no explicit difficulty ladder.

### 4. Choices and Fairness

Current behavior:

- Multiple-choice choices are built from other plays in the quiz source.
- If there are fewer than two choices, the question becomes non-game reveal mode.
- Long choices get layout treatment.

Problems:

- Distractors can be either too obvious or too random.
- Similar calls are not intentionally grouped by difficulty.
- Thin data sources can create choices based on minor call text differences.
- There is no "do not ask this" quality gate per question type.

Fair question rule:

- If the player cannot reasonably answer from the visible prompt and normal
  football learning context, skip that question type.

### 5. Feedback, Rewards, and Replay

Current behavior:

- Correct/wrong feedback exists.
- Wrong answers show review cards, coach notes, and diagrams when available.
- Points, streaks, bonuses, leaderboard, reward events, and helmet stickers
  exist.

What works:

- The reward system is already deep enough.
- Wrong-answer review is one of the strongest parts of the current quiz.

Problems:

- Correct answers feel mostly informational, not celebratory.
- Streaks are visible but not game-like.
- Stickers and rewards are mostly after-the-fact, not part of the moment.
- There are no short modes like "3 quick diagrams" or "formation warmup."

## Recommended Question Ladder

The generator should pick from this ladder in order of player value and source
readiness. Easier, clearer questions should be allowed even when richer metadata
exists.

### Tier 1: Visual and Recognition

Use these often. They are fun, quick, and fair.

- Diagram to Play: show redacted diagram, ask "What play is this?"
- Diagram to Formation: show redacted diagram, ask "What formation is this?"
- Formation to Play: show formation/personnel, ask "Which play is this?"
- Play Type: show call or diagram, ask "Run, pass, screen, or RPO?"

Minimum data:

- Diagram to Play: diagram plus at least two distinct play choices.
- Diagram to Formation: diagram plus at least two distinct formation choices.
- Formation to Play: formation plus at least two plays with distinct names.
- Play Type: type plus at least two distinct types in source.

### Tier 2: Player Job

Use these when player rules are real and distinct.

- Call to Rule: "What's your Q responsibility?"
- Rule to Play: "Which play has this rule?"
- Rule Keyword: "What is the first landmark/key word in your rule?"

Minimum data:

- A selected position rule exists.
- Distractors are not blank.
- At least three unique rule choices for direct rule questions.
- At least two distinct calls for Rule to Play.

### Tier 3: Football Context

Use these sparingly. Good for coach value, but not the core fun loop.

- Situation Fit: "When do we like this call?"
- Defense Recognition: "What coverage/front is tagged for this rep?"
- Key Player: "Who is highlighted on this play?"

Minimum data:

- Only ask if the source has high coverage for that field.
- Choices must be normal football labels, not tiny one-off metadata.
- These should never dominate a thin quiz.

### Tier 4: Full Call ID

Use as a fallback, but improve it.

- Prefer short call display over every tag.
- Limit choices to 2 or 3 on thin sources.
- Prefer distinct calls, not tiny tag differences.
- If call choices are too long, ask Formation or Play Type instead.

## Better Fallback Policy

Current fallback: mostly `call`.

Recommended fallback:

1. If diagram exists, ask Diagram to Play.
2. Else if formation is distinct, ask Formation to Play.
3. Else if play type is distinct, ask Play Type.
4. Else if player rule exists and enough choices exist, ask Call to Rule.
5. Else ask a 2-choice short Call ID.
6. If none of those are fair, show a study card instead of a question.

Study card fallback:

- Shows call.
- Shows diagram if available.
- Shows player rule or coach note.
- Has one button: "Got it".
- Counts as study progress, not a wrong-answer risk.

This keeps thin sources useful without making kids guess.

## Roadmap

### Phase 1: Fairness and Fallback Engine

Goal: stop low-interest and unfair questions from reaching players.

- [x] Add a `quizQuestionQuality` helper that scores each candidate question as
  `playable`, `thin`, or `study_only`.
- [x] Add new question types:
  - `diagram_formation`
  - `formation_to_play`
  - `play_type`
  - `study_card`
- [x] Change the generator so Diagram questions are preferred, not last resort.
- [x] Add first-pass choice-quality gates:
  - minimum unique choices,
  - max choice length,
  - avoid choices that only differ by tiny metadata,
  - avoid blank or duplicate answers.
- [x] Convert unfair fallback questions into Study Cards.
- [x] Update E2E coverage for:
  - diagram-first fallback,
  - formation fallback,
  - play-type fallback,
  - study-card fallback.

Shipped 2026-07-08:

- The quiz engine now evaluates candidate question quality before showing it.
- Thin recognition sources fall back through Diagram, Formation, Play Type, and
  Study Card instead of forcing full-call guesses.
- Study-card reveal shows the call plus player rule and coach note when
  available.
- Focused mobile E2E coverage protects diagram, formation, play-type,
  study-card, scoring, and source-publishing quiz paths.

Definition of done:

- A thin source still creates a good quiz experience.
- The player is never forced to guess based on minor metadata.
- Existing responsibility and rule-to-play tests still pass.

### Phase 2: Game Modes

Goal: Quiz Center should feel like choosing a challenge.

- [x] Add mode cards:
  - Quick Hits: 5 easy questions.
  - Diagram Drill: visual questions first.
  - Know Your Job: player responsibility focus.
  - Game Plan Check: mixed game-plan questions.
  - Missed Plays: retry recent misses.
- [x] Give each mode a clear time/effort label.
- [x] Save mode in attempt summaries.
- [x] Coach setup can recommend the best mode for each source.

Definition of done:

- A player can pick a quiz that sounds fun in under five seconds.
- Coaches can tell which mode a source is ready for.

### Phase 3: Moment-to-Moment Fun

Goal: answers should feel satisfying without becoming distracting.

- [x] Add lightweight correct-answer motion under reduced-motion rules.
- [x] Add streak milestones at 3, 5, and 10.
- [x] Add a "hot streak" visual state.
- [x] Show earned sticker/reward moments inside the result flow.
- [x] Add quick positive labels: "Locked in", "Clean read", "Great memory".
- [x] Keep wrong-answer feedback calm and useful.

Definition of done:

- Correct answers feel rewarding.
- Misses feel like study help, not punishment.
- Mobile performance and reduced-motion checks remain clean.

### Phase 4: Coach Authoring Help

Goal: help coaches make better quizzes without extra work.

- [x] Split source readiness into:
  - Fun readiness,
  - Learning readiness,
  - Context readiness.
- [x] Show "Best next question type" per source.
- [x] Add one-click "Make this quiz better" checklist:
  - add 3 diagrams,
  - add Q/H/Y rules,
  - add coach notes to missed plays,
  - simplify long calls.
- [x] Let coaches open Thin/Needs work saved scripts into a play repair list
  and edit the linked master Playbook plays from there.
- [x] Flag sources that will mostly generate Study Cards.
- [x] Add source preview examples that match the actual generator.

Definition of done:

- Coach setup predicts player experience accurately.
- Coaches know the fastest useful improvement for a source.

### Phase 5: Review and Retention

Goal: quizzes should help kids improve over time.

- [x] Add "Missed Plays" source from recent wrong answers.
- [x] Add spaced retry: missed today appears again tomorrow.
- [x] Add player weak-area cards by question type and position.
- [x] Let players start a 3-question retry from the result screen.
- [x] Add coach view of common missed plays across the team.

Definition of done:

- The quiz system teaches what players missed instead of only recording scores.
- Coaches can see what to re-teach.

## Implementation Notes

Recommended first code slice:

1. Extract question generation out of `script-render.js` into a quiz helper file
   only if the edit stays manageable; otherwise add small helpers first and split
   after tests are stable.
2. Add a pure `buildQuizQuestionCandidates(item, context)` helper.
3. Add `selectBestQuizQuestion(candidates, sourceStats, settings)`.
4. Keep the existing public functions and storage shape stable.
5. Add local E2E tests before changing player UI heavily.

Likely files:

- `js/script-render.js`
- `css/script.css`
- `tests/specs/07-player-mobile.spec.js`
- `scripts/smoke-check.js`
- `CONSOLIDATED_ROADMAP.md`

Cache/deploy note:

- Any shipped JS/CSS change needs the `index.html` asset query and `sw.js`
  cache version bumped together.

## Acceptance Tests to Add

- A script with diagrams and no player rules asks Diagram to Play before Call ID.
- A script with diagrams and multiple formations can ask Diagram to Formation.
- A script with formation but no diagram can ask Formation to Play.
- A script with only type data can ask Run/Pass/Screen/RPO.
- A script with one playable call and no fair distractors shows a Study Card.
- Long call choices use simplified labels or avoid the question.
- Wrong-answer review includes the diagram when one exists.
- Reduced-motion mode suppresses celebratory motion.
- Phone viewport has no horizontal overflow during every mode.
