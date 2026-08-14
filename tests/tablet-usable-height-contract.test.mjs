/**
 * T-007b source contract.
 *
 * This keeps the visual-viewport rule explicit for the first migrated
 * Playbook/Script/Presentation group. Browser coverage lives in the matching
 * iPad spec; this fast contract catches an accidental raw viewport reversion.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
const [base, playbookCss, playbookFilters, quizCss, quizJs, authoritativeQuiz, quizFoundation, quizAssignments, presentationCss, presentationJs] = await Promise.all([
  read("css/base.css"),
  read("css/playbook.css"),
  read("js/playbook-filters.js"),
  read("css/script-quiz.css"),
  read("js/script-quiz.js"),
  read("js/player-quiz-authoritative.js"),
  read("js/script-quiz-foundation.js"),
  read("js/script-quiz-assignments.js"),
  read("css/play-presentation.css"),
  read("js/play-presentation.js"),
]);

assert.match(base, /--app-visual-viewport-height: calc\(var\(--app-vh, 1vh\) \* 100\);/, "the shell exposes one visual-viewport height token");
assert.match(base, /--app-layer-usable-height: calc\([\s\S]*?var\(--app-visual-viewport-height\)[\s\S]*?var\(--app-layer-safe-top\)[\s\S]*?var\(--app-layer-safe-bottom\)/, "the layer token subtracts safe-area clearance");

assert.match(playbookCss, /\.pb-player-filter-overlay\.app-layer-active \{[\s\S]*?height: var\(--app-visual-viewport-height\);/, "player filters use the measured viewport while active");
assert.match(playbookCss, /\.pb-player-filter-dialog \{[\s\S]*?max-height: min\(760px, var\(--app-layer-usable-height\)\);/, "player filter body remains inside the safe usable height");
assert.doesNotMatch(playbookCss, /\.pb-player-filter-dialog \{[\s\S]*?100vh/, "player filters do not fall back to raw vh sizing");
assert.match(playbookFilters, /id: "player-playbook-filters"[\s\S]*?scrollElement: overlay\.querySelector\("\.pb-player-filter-body"\)[\s\S]*?blocking: true,[\s\S]*?initialFocus: "\.pb-player-filter-close",[\s\S]*?onEscape:/, "player filters declare their scroll, focus, and Escape lifecycle");

assert.match(quizCss, /\.script-quiz-overlay\.app-layer-active,[\s\S]*?\.aqz-overlay\.app-layer-active,[\s\S]*?\.player-leaderboard-profile-overlay\.app-layer-active \{[\s\S]*?height: var\(--app-visual-viewport-height\);/, "quiz overlays are visual-viewport sized layers");
assert.match(quizCss, /\.script-quiz-panel \{[\s\S]*?var\(--app-layer-usable-height\)/, "local quiz panel respects safe usable height");
assert.match(quizCss, /\.aqz-panel \{[\s\S]*?var\(--app-layer-usable-height\)/, "verified quiz panel respects safe usable height");
assert.match(quizCss, /\.player-leaderboard-profile-panel \{[\s\S]*?var\(--app-layer-usable-height\)/, "leaderboard profile respects safe usable height");
assert.match(quizJs, /function _openScriptQuizLayer[\s\S]*?initialFocus:[\s\S]*?onEscape: \(\) => closeScriptQuiz\(\)/, "local quiz owns initial focus and Escape through LayerManager");
assert.match(authoritativeQuiz, /id: "authoritativeQuizOverlay"[\s\S]*?initialFocus:[\s\S]*?onEscape: \(\) => closeAuthoritativeQuiz\(\)/, "verified quiz owns initial focus and Escape through LayerManager");
assert.match(quizFoundation, /id: "player-leaderboard-profile"[\s\S]*?initialFocus:[\s\S]*?onEscape: \(\) => closePlayerLeaderboardProfile\(\)/, "leaderboard profile owns initial focus and Escape through LayerManager");
assert.match(quizAssignments, /id: "quizAssignmentOverlay"[\s\S]*?scrollElement: overlay\.querySelector\("\.quiz-assignment-modal"\)[\s\S]*?initialFocus:[\s\S]*?onEscape: \(\) => closeQuizAssignmentManager\(\)/, "quiz assignment editor declares its modal scroll, focus, and Escape lifecycle");

assert.match(presentationCss, /\.play-presentation-overlay\.app-layer-active:not\(:fullscreen\) \{[\s\S]*?height: var\(--app-visual-viewport-height\);/, "presentation uses visual viewport height outside browser fullscreen");
assert.match(presentationCss, /\.pp-sheet-close \{[\s\S]*?width: var\(--tap-min\);[\s\S]*?height: var\(--tap-min\);/, "presentation sheets retain a full tablet close target");
assert.doesNotMatch(presentationCss, /max-height: 76dvh/, "presentation sheets do not override measured height with dvh");
assert.match(presentationJs, /id: "play-presentation"[\s\S]*?blocking: true,[\s\S]*?onEscape: \(\) => closePlayPresentation\(\)/, "presentation is a managed blocking layer");
assert.match(presentationJs, /id: "play-presentation-setup"[\s\S]*?safeArea: true,[\s\S]*?initialFocus:[\s\S]*?onEscape: \(\) => closePlayPresentationSetup\(\)/, "presentation setup uses safe-area sizing and managed dismissal");

console.log("tablet usable-height contract: Playbook, Script quiz, and Presentation layers use measured safe geometry");
