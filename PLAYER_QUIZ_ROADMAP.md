# Player Quiz Roadmap

## Product Contract

- [x] Define quiz as its own player workflow, not just a button inside Practice.
- [x] Keep the existing Practice-tab quiz path working while the new Quiz Center grows.
- [ ] Add coach/admin quiz settings for question mix, scoring weights, goals, tiers, and eligible sources.
- [ ] Add a server-backed attempts API so leaderboards can aggregate across all player accounts.

## Player Quiz Center

- [x] Add a player Quiz Center hub with source selection and position selection.
- [x] Support Practice Script quiz entry from the hub.
- [x] Support Game Plan quiz entry from the hub using current board assignments.
- [ ] Add a full standalone Quiz tab/page once player navigation policy is finalized.
- [ ] Add script picker polish: date, play count, readiness, and last-attempt status.

## Question Engine

- [x] Reuse the existing Kahoot-style multiple-choice runner for the first safe slice.
- [x] Track quiz source type and selected position inside the runner.
- [ ] Prioritize responsibility questions: "On this play, what is your responsibility?"
- [ ] Add play-from-rule questions: "Which play has you kick the EMLOS?"
- [ ] Add diagram-identification questions when rules are missing.
- [ ] Add smart diagram title redaction/blur as an experiment behind one helper.
- [ ] Add source-aware fallback rules so thin scripts/game plans still produce useful quizzes.

## Scoring And Goals

- [x] Add weighted point scoring: Script 1.0x, Game Plan 1.25x.
- [x] Show the weekly 1000-point standard in the Quiz Center.
- [ ] Persist attempts locally as a staging layer.
- [ ] Award threshold badges: Honor Roll 85%, High Honor Roll 90%, Coaches List 95%.
- [ ] Add daily and weekly streak calculations.
- [ ] Add weekly and season views.

## Leaderboard

- [x] Define football tiers: Champion, Baller, Starter, Contributor, Defense.
- [ ] Build local leaderboard preview from stored attempts.
- [ ] Build coach/admin leaderboard view with week and season toggles.
- [ ] Move leaderboard data to Cloudflare-backed storage for real cross-player ranking.
- [ ] Add achievements/stars above the 1000-point goal.

## Coach/Admin Workflow

- [ ] Add quiz controls to saved Practice Script publishing.
- [ ] Add quiz controls to Game Plan publishing.
- [ ] Add coach preview mode for each source and position.
- [ ] Add player attempt review with weak-position and weak-rule summaries.

## Verification

- [x] Add player mobile regression coverage for opening Quiz Center from Home.
- [ ] Add tests for Game Plan source when a board has assignments.
- [ ] Add tests for responsibility-question generation.
- [ ] Add tests for local attempt scoring and badge thresholds.
- [ ] Run Chromium and WebKit mobile checks before each shipped quiz slice.
