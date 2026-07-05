# Player Quiz Roadmap

## Product Contract

- [x] Define quiz as its own player workflow, not just a button inside Practice.
- [x] Keep the existing Practice-tab quiz path working while the new Quiz Center grows.
- [ ] Add coach/admin quiz settings for question mix, scoring weights, goals, tiers, eligible sources, and reward rules. Local reward staging exists; formal settings still need controls.
- [ ] Add a server-backed attempts API so leaderboards can aggregate across all player accounts.

## Player Quiz Center

- [x] Add a player Quiz Center hub with source selection and position selection.
- [x] Support Practice Script quiz entry from the hub.
- [x] Support Game Plan quiz entry from the hub using current board assignments.
- [x] Add a standalone player Leaderboard bottom-nav page with quiz launch access.
- [x] Add script picker polish: date, play count, readiness, and last-attempt status.
- [x] Add script-card quiz progress: percent complete, trophy for ace, ribbon for complete, medal for 80%+.

## Question Engine

- [x] Reuse the existing Kahoot-style multiple-choice runner for the first safe slice.
- [x] Track quiz source type and selected position inside the runner.
- [x] Prioritize responsibility questions: "On this play, what is your responsibility?"
- [x] Add play-from-rule questions: "Which play has you kick the EMLOS?"
- [ ] Add diagram-identification questions when rules are missing.
- [ ] Add smart diagram title redaction/blur as an experiment behind one helper.
- [x] Add source-aware fallback rules so thin scripts/game plans still produce useful quizzes.

## Scoring And Goals

- [x] Add weighted point scoring: Script 1.0x, Game Plan 1.25x.
- [x] Show the weekly 1000-point standard in the Quiz Center.
- [x] Persist attempts locally as a staging layer.
- [x] Award threshold badges: Honor Roll 85%, High Honor Roll 90%, Coaches List 95%.
- [x] Persist resumable in-progress quiz drafts with "pick up where left off."
- [x] Show exit summaries for interrupted quizzes: points, right/wrong, and remaining questions.
- [x] Add daily and weekly streak calculations.
- [x] Add weekly and season views.
- [x] Award weekly question points when players ask good football questions. Local coach staging control added.
- [x] Allow coaches to gift bonus points to players who answer teammates' questions. Local coach staging control added.

## Leaderboard

- [x] Define football tiers: Champion, Baller, Starter, Contributor, Defense.
- [x] Build local leaderboard preview from stored attempts.
- [x] Build coach/admin leaderboard view with week and season toggles. Local weekly reward totals now appear on Set Up Quizzes.
- [ ] Move leaderboard data to Cloudflare-backed storage for real cross-player ranking.
- [ ] Add achievements/stars above the 1000-point goal.

## Coach/Admin Workflow

- [ ] Add quiz controls to saved Practice Script publishing.
- [ ] Add quiz controls to Game Plan publishing.
- [x] Add coach/admin "Set Up Quizzes" nav page for customization, readiness, and leaderboard review.
- [x] Add coach preview mode for each source and position.
- [x] Add player attempt review with weak-position and weak-rule summaries.

## Learning Readiness

- [x] Show script completeness by diagrams, player rules, coach notes, situation tags, defense tags, and player-visible state.
- [x] Show Game Plan completeness by diagrams, player rules, coach notes, situation tags, defense tags, and populated buckets.
- [x] Flag thin sources before players quiz: no diagrams, missing rules, missing defense, or too few distinct calls.
- [x] Suggest the next best coach action: add diagrams, add player rules, add notes, or add situation/defense metadata.
- [x] Let coaches preview what question types will be generated for each script/game plan.

## Question Incentives

- [x] Define weekly points for asking questions, answering teammates, and coach-marked helpful answers.
- [ ] Prevent spam by capping question points per day/week and requiring coach approval for bonus answers.
- [ ] Add coach controls for gifting question/answer points from the discussion workflow. Coach staging controls exist; discussion-thread affordances still need wiring.
- [x] Include question points in week and season leaderboard totals with a visible source breakdown.

## Helmet Stickers

- [x] Add coach-awarded helmet stickers tied to a player profile and week/season history.
- [x] Start with sticker types: Sure Hands, Do Your Job, Big Hit, Explosive Play, Great Teammate, Trust the Process.
- [x] Show stickers on the player leaderboard detail drawer when a coach/player opens a name.
- [x] Add coach post-practice award flow with optional notes and practice/game context. Local staging flow added.
- [ ] Let teams customize sticker names, colors, and icons later.

## Mobile Quiz UX

- [x] Compress the quiz top information so all four answers fit on phone without forced scrolling.
- [x] Make the question prompt the strongest visual element on the quiz screen.
- [ ] Keep answer labels readable with long play calls and long responsibility rules.
- [x] Add safe exit flow: Resume, Save & Close, or End Quiz.
- [x] Make partial attempts visible in recent history without pretending they were completed.

## Verification

- [x] Add player mobile regression coverage for opening Quiz Center from Home.
- [ ] Add tests for Game Plan source when a board has assignments.
- [x] Add tests for responsibility-question generation.
- [x] Add tests for local attempt scoring and badge thresholds.
- [ ] Run Chromium and WebKit mobile checks before each shipped quiz slice.
