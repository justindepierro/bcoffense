import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const [scriptStorage, scriptPlayer, cloudSync, workspaceSync] = await Promise.all([
  source("js/script-storage.js"),
  source("js/script-player.js"),
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
  workspaceSync,
  /function completePlayerPublishJobs\(opts = \{\}\)/,
  "the shared sync queue can resolve all player publish receipts after one merged commit",
);

console.log("script player publish contract: persisted release handoff and player freshness checks passed");
