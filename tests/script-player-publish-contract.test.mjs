import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const [scriptStorage, scriptPlayer, presentation, cloudSync, workspaceSync] = await Promise.all([
  source("js/script-storage.js"),
  source("js/script-player.js"),
  source("js/play-presentation.js"),
  source("js/cloud-sync.js"),
  source("js/workspace-sync.js"),
]);

assert.match(
  scriptStorage,
  /storageManager\.set\(STORAGE_KEYS\.SAVED_SCRIPTS, savedScripts\);\s*if \(playerVisible\) \{\s*if \(typeof recordPlayerPublishStatus === "function"\) \{\s*await recordPlayerPublishStatus\("scripts",[\s\S]*?awaitCompletion: true/s,
  "a player-visible script is persisted before its player release is requested",
);
assert.match(
  scriptPlayer,
  /async function recordPlayerPublishStatus[\s\S]*?awaitCompletion: opts\.awaitCompletion === true[\s\S]*?return publishResult !== false/s,
  "player publish receipts can wait for the canonical release result",
);
assert.doesNotMatch(
  scriptPlayer,
  /completeWorkspaceSyncJob\(publishJobKey, \{ label: "Player publish updated" \}\)/,
  "a queued player receipt is not incorrectly marked complete before the cloud commit",
);
assert.match(
  scriptPlayer,
  /visibility: savedScript\.playerVisible \? "published" : "unpublished"/,
  "both publishing and removing a script request a fresh player release",
);
assert.match(
  scriptPlayer,
  /const requestedId = id !== undefined && id !== null \? String\(id\)\.trim\(\) : "";[\s\S]*?if \(requestedId\) \{[\s\S]*?return presentPublishedPlayerScript\(requestedId\);[\s\S]*?if \(loadedPlayCount > 0\)/s,
  "an explicit player launcher choice loads that published script instead of reopening stale in-memory plays",
);
assert.match(
  scriptPlayer,
  /const returnContext = \{[\s\S]*?tab: typeof currentActiveTab === "string" \? currentActiveTab : "",[\s\S]*?openScriptPresentation\(undefined, \{ returnContext \}\)/,
  "opening a published player script captures the launching tab before it loads the temporary script view",
);
assert.match(
  presentation,
  /function openScriptPresentation\(scriptIndex, options = \{\}\)[\s\S]*?openPlayPresentation\([\s\S]*?options,/,
  "script presentation forwards a caller return context into the shared presenter",
);
assert.match(
  presentation,
  /const returnContext = playPresentationState\.returnContext;[\s\S]*?showTab\(returnContext\.tab\)/,
  "closing a launched presentation restores the originating allowed tab instead of leaving a temporary script page open",
);
assert.match(
  cloudSync,
  /function requestImmediateTeamPublish\(reason = "substantial-update", opts = \{\}\)[\s\S]*?opts\.awaitCompletion === true[\s\S]*?return flushCloudAutoPush\(\)/s,
  "a substantial update can force and await its canonical workspace commit",
);
assert.match(
  cloudSync,
  /window\.completePlayerPublishJobs\(\{ label: "Player update ready" \}\)/,
  "player receipts complete only after the team workspace publishes",
);
assert.match(
  cloudSync,
  /PLAYER_RELEASE_REFRESH_INTERVAL_MS = 45 \* 1000/,
  "an open player app revalidates an ETag-backed release on a short cadence",
);
assert.match(
  cloudSync,
  /function getPlayerReleaseReloadTab\(opts = \{\}\)[\s\S]*?const activeTab = String\([\s\S]*?return activeTab;[\s\S]*?return "dashboard";/,
  "a new player release preserves the current allowed study tab instead of forcing Dashboard",
);
assert.doesNotMatch(
  cloudSync,
  /const targetTab = opts\.navigate === false \? "" : "dashboard";/,
  "player release refreshes cannot unconditionally displace a player to Dashboard",
);
assert.match(
  cloudSync,
  /let pendingPlayerReleaseApply = null;[\s\S]*?if \(presentationOpen\) \{[\s\S]*?pendingPlayerReleaseApply = \{ release: fetched\.release, etag: fetched\.etag[\s\S]*?document\.addEventListener\("play-presentation-closed"[\s\S]*?applyPlayerRelease\(pending\.release, pending\.opts\)/,
  "a new player release is deferred while Swipe View is open and applied only after the viewer closes",
);
assert.match(
  scriptPlayer,
  /function showPlayerPracticeLanding\(\)[\s\S]*?script-player-practice-landing/,
  "a player release refresh returns the Script route to the player Practice landing rather than coach workspace chrome",
);
assert.match(
  workspaceSync,
  /function completePlayerPublishJobs\(opts = \{\}\)/,
  "the shared sync queue can resolve all player publish receipts after one merged commit",
);

console.log("script player publish contract: persisted release handoff and player freshness checks passed");
