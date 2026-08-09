import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.error(`  ❌ ${label}`);
  }
}

async function source(relativePath) {
  return readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

console.log("\n▸ Quiz Cloudflare data path");

const [release, storage, quizFoundation, quizRuntime, scriptPlayer, sync, releaseClient, revision, syncRoute, authoritativeQuiz, indexHtml] = await Promise.all([
  source("../functions/_lib/player-release.js"),
  source("../js/storage.js"),
  source("../js/script-quiz-foundation.js"),
  source("../js/script-quiz.js"),
  source("../js/script-player.js"),
  source("../js/player-quiz-sync.js"),
  source("../js/cloud-sync.js"),
  source("../functions/workspace/revision.js"),
  source("../functions/api/leaderboard/sync.js"),
  source("../js/player-quiz-authoritative.js"),
  source("../index.html"),
]);
const quiz = `${quizFoundation}\n${quizRuntime}\n${scriptPlayer}`;

assert(
  release.includes("projectActiveGamePlanQuiz")
    && release.includes("gamePlanQuiz")
    && release.includes("isHoldingGamePlanBox"),
  "release builds a player-safe Game Plan quiz source and excludes holding plays",
);
assert(
  release.includes("projectQuizSourceSettings(values.playerQuizSourceSettings, scripts, gamePlanQuiz)")
    && release.includes("signals.forEach((record) =>"),
  "release keeps only current quiz availability settings and authorizes published signal media",
);
assert(
  storage.includes("PLAYER_GAME_PLAN_QUIZ: \"playerGamePlanQuiz\"")
    && storage.includes("[STORAGE_KEYS.PLAYER_GAME_PLAN_QUIZ]: source.gamePlanQuiz")
    && storage.includes("PLAYER_RELEASE_STORAGE_PREFIX"),
  "player applies the released Game Plan source into isolated player storage",
);
assert(
  quiz.includes("_getReleasedGamePlanQuizSource")
    && quiz.includes("_getPlayerGamePlanQuizStorageKey")
    && quiz.includes("Generic quizzes are study/practice records only.")
    && !quiz.includes('window.queuePlayerLeaderboardSync("attempts")'),
  "player quiz reads the immutable release source while generic practice results stay local-only",
);
assert(
  quiz.includes("function getPlayerQuizSourceAvailability")
    && scriptPlayer.includes('isPlayerQuizSourceAvailable("script", requestedId)')
    && quiz.includes("needs-question-pair"),
  "player script quiz launch resolves the released script record and requires a real question pair",
);
assert(
  quiz.includes("function _resolveDiagramFlashItems")
    && quiz.includes("ensureDisplayReadinessForPlay")
    && quiz.includes("No published diagrams are ready for this practice yet"),
  "diagram flash cards verify published cloud diagrams before starting instead of relying on a device cache",
);
assert(
  quiz.includes("function openPlayerQuizHubForScript")
    && quiz.includes("function openPlayerQuizHubForCurrentScript")
    && scriptPlayer.includes('data-action="openPlayerQuizHubForScript"')
    && indexHtml.includes('data-action="openPlayerQuizHubForCurrentScript"'),
  "every player Practice Quiz entry point opens the shared setup screen before the first question",
);
assert(
  /const activeId = String\(typeof activeScriptSaveId/.test(quizRuntime)
    && /option\.id === activeId/.test(quizRuntime),
  "the current-practice quiz shortcut resolves its saved script by durable ID before display-name fallbacks",
);
assert(
  quiz.includes("function setPlayerQuizSource")
    && quiz.includes("function startPlayerQuizHubSelection")
    && indexHtml.includes('data-action="setPlayerQuizSource"')
    && indexHtml.includes('data-action="startPlayerQuizHubSelection"'),
  "quiz setup selects the source, challenge, and position before one explicit start action",
);
assert(
  indexHtml.indexOf('id="authoritativeQuizLaunch"') < indexHtml.indexOf('id="playerQuizPracticeLaunch"')
    && indexHtml.includes("Team standings · online")
    && indexHtml.includes("Local practice · works offline")
    && indexHtml.includes("Signal Study is practice-only")
    && quizRuntime.includes('"Start local practice"')
    && authoritativeQuiz.includes("Signals and homework stay practice-only.")
    && /else if \(source\?\.error\) \{[\s\S]*?disabled = true;/.test(authoritativeQuiz),
  "eligible players see the verified team-standings path before explicit local practice, while signals and homework remain practice-only",
);
assert(
  scriptPlayer.includes("keepCurrentTab: opts.keepCurrentTab === true")
    && quiz.includes('keepCurrentTab: true')
    && quiz.includes('returnDestination: "quiz"')
    && quiz.includes("function _closeScriptQuizOverlayTo")
    && quiz.includes('showTab("quiz")'),
  "player script quizzes load their source without leaving Quiz and always return there on close",
);
assert(
  quiz.includes("function _maybeAutoAdvanceQuizAfterAnswer(questionKey)")
    && quiz.includes("Every non-timed quiz is intentionally player-paced after an answer.")
    && quiz.includes("Timed signal modes advance through _advanceSignalGameAfterAnswer instead."),
  "manual quizzes stay player-paced after an answer while timed signal games retain their own advance path",
);
assert(
  quiz.includes("function _clearStandardQuizAdvance")
    && quiz.includes("function closeScriptQuiz()")
    && quiz.includes("function _renderQuizExitSummary() {\n  _clearStandardQuizAdvance();"),
  "pausing or closing a quiz clears any pending transition state before the exit screen renders",
);
assert(
  quiz.includes('class="btn btn-primary sq-feedback-continue" data-action="nextScriptQuizPlay"')
    && quiz.includes("Continue to next question"),
  "answered questions expose an immediate in-context Continue action instead of requiring players to find the distant footer navigation",
);
assert(
  quiz.includes("function initScriptQuizInteractionRouting()")
    && quiz.includes('overlay.addEventListener("click"')
    && quiz.includes("}, true);")
    && quiz.includes('action !== "answerScriptQuizChoice" && action !== "nextScriptQuizPlay"')
    && quiz.includes("event.stopPropagation();"),
  "dynamic quiz answer and next controls have an overlay-owned click route independent of the global app dispatcher",
);
assert(
  quiz.includes("window.answerScriptQuizChoice = answerScriptQuizChoice;")
    && quiz.includes("window.nextScriptQuizPlay = nextScriptQuizPlay;"),
  "dynamic player quiz actions are explicit window exports for the central delegated action router",
);
assert(
  quiz.indexOf("const question = _quizCurrentQuestion || _buildQuizQuestion(item);")
    < quiz.indexOf("// Nav buttons"),
  "the current question is initialized before navigation evaluates flash-card advance rules after an answer",
);
assert(
  quiz.includes('data-action="nextScriptQuizPlay"') && quiz.includes("function _renderQuizInlineFeedback"),
  "self-paced signal-study feedback includes a local continue action instead of relying on distant footer navigation",
);
assert(
  quiz.includes("const includeContinue = options.includeContinue !== false;")
    && quiz.includes('includeContinue: _quizSourceType !== "signal" || _isSignalAutoAdvanceMode()'),
  "Signal Study renders one nearby continuation action instead of duplicate competing controls",
);
assert(
  quiz.includes("function _focusQuizContinuation()")
    && quiz.includes("continueButton.scrollIntoView")
    && quiz.includes("_focusQuizContinuation();"),
  "answered manual quizzes bring their single next action into view instead of leaving it below feedback",
);
assert(
  releaseClient.includes('fetch("/player/release"')
    && releaseClient.includes("cache: \"no-store\"")
    && releaseClient.includes("storageManager.replacePlayerReleaseData(release)"),
  "player refresh fetches a fresh release and applies it atomically",
);
assert(
  revision.includes('"playerQuizSettings", "playerQuizSourceSettings"')
    && revision.includes('"playerSignalGameSettings", "playerPublishStatus", "signals"'),
  "coach workspace revision retains every shared quiz and signal configuration key",
);
assert(
  sync.includes("requestJson(`/api/leaderboard/summary?weekKey=${weekKey}`)")
    && sync.includes("credentials: \"same-origin\"")
    && sync.includes("SYNC_DELAY_MS = 8000")
    && sync.includes("attempts: []")
    && sync.includes("Local practice attempts are intentionally never uploaded.")
    && !sync.includes('requestJson("/api/leaderboard/sync"'),
  "quiz progress uses an authenticated, debounced verified-summary refresh without uploading practice attempts",
);
assert(
  syncRoute.includes("getSessionFromRequest")
    && syncRoute.includes("getLeaderboardTeamId")
    && syncRoute.includes("syncLeaderboardPayload"),
  "leaderboard writes are authenticated and scoped to the session team in D1",
);

if (failed) {
  console.error(`\n${failed} quiz-cloud contract assertion${failed === 1 ? "" : "s"} failed.`);
  process.exitCode = 1;
} else {
  console.log(`\n${passed} quiz-cloud contract assertions passed.`);
}
