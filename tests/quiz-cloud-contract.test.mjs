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

const [release, storage, quizFoundation, quizRuntime, scriptPlayer, sync, releaseClient, revision, syncRoute] = await Promise.all([
  source("../functions/_lib/player-release.js"),
  source("../js/storage.js"),
  source("../js/script-quiz-foundation.js"),
  source("../js/script-quiz.js"),
  source("../js/script-player.js"),
  source("../js/player-quiz-sync.js"),
  source("../js/cloud-sync.js"),
  source("../functions/workspace/revision.js"),
  source("../functions/api/leaderboard/sync.js"),
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
    && quiz.includes('window.queuePlayerLeaderboardSync("attempts")'),
  "player quiz reads the immutable release source and queues attempts for D1 sync",
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
    && scriptPlayer.includes('data-action="openPlayerQuizHubForScript"'),
  "player Practice Quiz buttons open the shared setup screen before the first question",
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
  sync.includes('requestJson("/api/leaderboard/sync"')
    && sync.includes("credentials: \"same-origin\"")
    && sync.includes("SYNC_DELAY_MS = 8000"),
  "quiz progress uses the authenticated, debounced leaderboard sync path",
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
