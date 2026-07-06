# Player Quiz Roadmap

## Current Status

- Local player Quiz Center is usable for Practice Script and Game Plan quizzes.
- Player leaderboard is available from the player bottom nav and can launch quizzes.
- Coach/admin Set Up Quizzes page exists with readiness, preview, rewards, local leaderboard review, custom helmet stickers, and roster-linked reward assignment.
- Local scoring is intentionally paced: a few questions should not hit the 1000-point weekly standard.
- Remaining work is split into local polish and server-backed team-wide persistence.

## Product Contract

- [x] Define quiz as its own player workflow, not just a button inside Practice.
- [x] Keep the existing Practice-tab quiz path working while the new Quiz Center grows.
- [x] Link local quiz identity to the active team roster through a roster account username field.
- [ ] Add formal coach/admin quiz settings for question mix, scoring weights, goals, tiers, eligible sources, and reward rules. Local settings now control scoring, goals, badges, rewards, caps, source eligibility, and question types; tier-name controls remain pending.
- [ ] Add server-backed attempts/rewards/stickers APIs so leaderboards aggregate across all player accounts.

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
- [x] Add source-aware fallback rules so thin scripts/game plans still produce useful quizzes.
- [x] Add diagram-identification questions when rules are missing.
- [x] Add smart diagram title redaction/blur behind one helper before diagram-identification questions ship broadly.
- [x] Add wrong-answer review cards that show the diagram, correct rule, and coach note after an answer.

## Scoring And Goals

- [x] Add weighted point scoring: Script 1.0x, Game Plan 1.25x.
- [x] Rebalance quiz scoring so 15-20 minutes earns roughly one third of the weekly goal instead of one short quiz hitting 1000+.
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
- [x] Include active roster players in the local leaderboard even before they score.
- [x] Show roster number, position, linked login, rank, tier, attempts, and sticker detail when opening a player.
- [x] Add achievements/stars above the 1000-point goal. Local Champion stars now appear every 250 points above the weekly goal.
- [ ] Move leaderboard data to Cloudflare-backed storage for real cross-player ranking.
- [x] Add player profile detail modal with season trend, sticker history, best quiz, weak areas, and recent activity.

## Coach/Admin Workflow

- [x] Add coach/admin "Set Up Quizzes" nav page for customization, readiness, and leaderboard review.
- [x] Add coach preview mode for each source and position.
- [x] Add player attempt review with weak-position and weak-rule summaries.
- [x] Add quiz controls to saved Practice Script publishing.
- [x] Add quiz controls to Game Plan publishing.
- [x] Add a settings panel for weekly goal, scoring weights, bonus thresholds, reward caps, and enabled question types. Tier names remain fixed for now.
- [x] Add roster-link health checks: unlinked roster players, duplicate account usernames, and quiz activity from unknown accounts.

## Learning Readiness

- [x] Show script completeness by diagrams, player rules, coach notes, situation tags, defense tags, and player-visible state.
- [x] Show Game Plan completeness by diagrams, player rules, coach notes, situation tags, defense tags, and populated buckets.
- [x] Flag thin sources before players quiz: no diagrams, missing rules, missing defense, or too few distinct calls.
- [x] Suggest the next best coach action: add diagrams, add player rules, add notes, or add situation/defense metadata.
- [x] Let coaches preview what question types will be generated for each script/game plan.

## Question Incentives

- [x] Define weekly points for asking questions, answering teammates, and coach-marked helpful answers.
- [x] Restrict local coach point awards to active roster players so names stay clean.
- [x] Include question points in week and season leaderboard totals with a visible source breakdown.
- [ ] Prevent spam by capping question points per day/week and requiring coach approval for bonus answers. Local reward caps are in place; discussion approval still needs wiring.
- [ ] Add coach controls for gifting question/answer points from the discussion workflow. Coach staging controls exist; discussion-thread affordances still need wiring.
- [x] Add question/answer reward history to the player profile detail modal.

## Helmet Stickers

- [x] Add coach-awarded helmet stickers tied to a player profile and week/season history.
- [x] Start with sticker types: Sure Hands, Do Your Job, Big Hit, Explosive Play, Great Teammate, Trust the Process.
- [x] Show stickers on the player leaderboard detail drawer when a coach/player opens a name.
- [x] Add coach post-practice award flow with optional notes and practice/game context. Local staging flow added.
- [x] Let teams customize sticker names, descriptions, colors, and icons locally.
- [x] Restrict sticker awards to active roster players so awards attach to the right profile.
- [x] Add edit/delete controls for custom sticker definitions.
- [x] Add sticker award history and revoke controls for coach/admin mistakes.

## Mobile Quiz UX

- [x] Compress the quiz top information so all four answers fit on phone without forced scrolling.
- [x] Make the question prompt the strongest visual element on the quiz screen.
- [x] Keep answer labels readable with long play calls and long responsibility rules.
- [x] Add safe exit flow: Resume, Save & Close, or End Quiz.
- [x] Make partial attempts visible in recent history without pretending they were completed.
- [x] Add a post-answer learning moment with tighter copy, correct answer, rule, and diagram.
- [x] Add a final quiz recap that calls out one strength and one fix-it area.

## Verification

- [x] Add player mobile regression coverage for opening Quiz Center from Home.
- [x] Add tests for Game Plan source when a board has assignments.
- [x] Add tests for responsibility-question generation.
- [x] Add tests for local attempt scoring and badge thresholds.
- [x] Run Chromium and WebKit mobile checks before each shipped quiz slice.
- [x] Add tests for roster-link validation and roster-only reward assignment.
- [x] Add tests for custom sticker edit/delete flows.
- [x] Add tests for quiz settings persistence and scoring effects.
- [x] Add tests for local quiz source publishing controls.
- [x] Add tests for player-facing source readiness chips and thin-source status.
- [x] Add tests for wrong-answer review cards and recap guidance.
- [x] Add tests for diagram-identification questions and title redaction.
- [ ] Add tests for server-backed leaderboard sync once APIs exist.

## Remaining Milestones

### Milestone 1 — Local Admin Controls

- [x] Build the Set Up Quizzes settings panel.
- [x] Persist quiz settings locally through `STORAGE_KEYS`.
- [x] Apply settings to scoring, question mix, weekly goal, bonus thresholds, and reward caps.
- [x] Add validation for bad settings and reset-to-default.
- [x] Add focused Playwright coverage for settings persistence and scoring effects.

### Milestone 2 — Source Publishing Controls

- [x] Add quiz publish controls to saved Practice Script cards.
- [x] Add quiz publish controls to Game Plan boards.
- [x] Show player-facing eligibility: available, locked, thin, or coach-only.
- [x] Include completeness chips for diagrams, rules, notes, defense, and metadata.
- [x] Add tests that locked and coach-only sources do not appear as normal player quiz options.

### Milestone 3 — Better Learning Loop

- [x] Add wrong-answer review cards after each answer.
- [x] Add diagram-identification questions with title redaction guarded behind a helper.
- [x] Add final recap with strengths, misses, suggested review source, and next quiz CTA.
- [x] Add player profile detail modal with reward history, stickers, weak areas, and trend.
- [x] Add focused mobile/WebKit test coverage for opening the player leaderboard profile detail modal.
- [ ] Add mobile/WebKit screenshots for quiz answer, recap, leaderboard, and profile detail.

### Milestone 4 — Discussion Rewards

- [ ] Add coach/admin reward actions directly to player questions and answers.
- [ ] Require coach approval before question/answer points affect leaderboard totals.
- [x] Add daily/weekly reward caps and clear warnings when caps are reached.
- [ ] Show reward history on player leaderboard detail.
- [ ] Add tests for approval, cap enforcement, and history display.

### Milestone 5 — Cloudflare Team Leaderboard

- [ ] Add server-backed player quiz attempts storage.
- [ ] Add server-backed reward events and helmet stickers storage.
- [ ] Sync local attempts/rewards/stickers to the team account.
- [ ] Merge local/offline results without duplicate attempts.
- [ ] Make leaderboard rankings reflect all player accounts, not only one device.
- [ ] Add deploy verification and end-to-end tests against local/mock API paths.

## Definition Of Done

- Player can start, leave, resume, finish, and review quizzes without losing progress.
- Coach can control what quiz sources are eligible and can see readiness before players use them.
- Coach rewards only attach to active roster players.
- Leaderboard shows weekly and season rank, points, tiers, streaks, stickers, and meaningful player detail.
- Points pace supports the weekly goal: roughly 15-20 minutes across several days should matter more than one short burst.
- Every shipped slice passes syntax checks, static UI audit strict gate, Chromium mobile, and WebKit mobile focused coverage.
