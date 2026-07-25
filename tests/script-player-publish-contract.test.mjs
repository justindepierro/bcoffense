import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const [scriptStorage, scriptPlayer, presentation, cloudSync, workspaceSync, notifications, dashboardRender] = await Promise.all([
  source("js/script-storage.js"),
  source("js/script-player.js"),
  source("js/play-presentation.js"),
  source("js/cloud-sync.js"),
  source("js/workspace-sync.js"),
  source("js/app-notifications.js"),
  source("js/dashboard-render.js"),
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
  /function flushCloudAutoPush\(\) \{[\s\S]*?if \(cloudAutoPushFlushPromise\) return cloudAutoPushFlushPromise;[\s\S]*?const run = flushCloudAutoPushInternal\(\);/,
  "overlapping coach and player publish requests join one in-flight canonical commit",
);
assert.match(
  cloudSync,
  /const playerRelease = getPlayerReleaseReceipt\(result\.release\);[\s\S]*?recordPublishActivity\([\s\S]*?releaseRevision: playerRelease\.revision[\s\S]*?async function flushCloudAutoPushInternal\(\)[\s\S]*?window\.completePlayerPublishJobs\(\{ label: playerRelease\.label \}\)/,
  "player receipts show the immutable Cloudflare release revision only after the team workspace publishes",
);
assert.match(
  cloudSync,
  /PLAYER_RELEASE_REFRESH_INTERVAL_MS = 45 \* 1000/,
  "an open player app revalidates an ETag-backed release on a short cadence",
);
assert.match(
  cloudSync,
  /PLAYER_RELEASE_REQUEST_TIMEOUT_MS = 12 \* 1000[\s\S]*?controller\.abort\(\)[\s\S]*?signal: controller\?\.signal[\s\S]*?PLAYER_RELEASE_TIMEOUT/s,
  "a suspended mobile release request is aborted and can recover on the next foreground check",
);
assert.match(
  cloudSync,
  /document\.addEventListener\("visibilitychange"[\s\S]*?force: currentUser\?\.role === "player"[\s\S]*?window\.addEventListener\("pageshow", \(event\) => \{[\s\S]*?if \(!event\.persisted\) return;[\s\S]*?refreshTeamWorkspaceOnForeground\(\{ force: true, quiet: true \}\)/s,
  "a player revalidates immediately after returning from a locked or BFCache-resumed mobile app",
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
  cloudSync,
  /if \(response\.status === 401\) \{[\s\S]*?bc-auth-session-required/,
  "a player-release 401 enters the centralized secure-session recovery path instead of leaving a stale study shell",
);
assert.match(
  scriptPlayer,
  /function showPlayerPracticeLanding\(\)[\s\S]*?script-player-practice-landing/,
  "a player release refresh returns the Script route to the player Practice landing rather than coach workspace chrome",
);
assert.match(
  scriptPlayer,
  /const releaseConfirmed = publishResult !== false[\s\S]*?if \(releaseConfirmed && typeof notifyPlayersOfTeamUpdate === "function"\)/,
  "player notifications are emitted only after a release is confirmed rather than merely queued",
);
assert.match(
  scriptPlayer,
  /if \(publishResult === false && publishJobKey && typeof window\.failWorkspaceSyncJob === "function"\)[\s\S]*?retry: \(\) => recordPlayerPublishStatus\(kind, details, opts\)/,
  "a player publish receipt becomes a retryable error instead of spinning forever when Cloudflare does not confirm it",
);
assert.doesNotMatch(
  scriptPlayer,
  /recordPublishActivity\(/,
  "a player publish request does not create a premature local success receipt before the canonical commit",
);
assert.match(
  notifications,
  /authUser\?\.role === "player" && typeof refreshPlayerRelease === "function"[\s\S]*?await refreshPlayerRelease\(\{ force: true, navigate: false \}\)[\s\S]*?loadPublishedPlayerScript\(scriptId\)/,
  "opening a player practice notification refreshes the release before resolving its script",
);
assert.match(
  dashboardRender,
  /function _dashRenderPlayerRefreshAction\(\)[\s\S]*?Release \$\{releaseRevision\.slice\(0, 12\)\}[\s\S]*?Practice is current[\s\S]*?data-action="refreshPlayerTeamApp"/,
  "the player Home shows a confirmed release revision, script count, and deliberate update check—not only errors",
);
assert.match(
  presentation,
  /scriptId: playPresentationState\.source === "script"[\s\S]*?loadPublishedPlayerScript\(String\(snapshot\.scriptId\), \{ skipToast: true \}\)/,
  "a suspended Swipe View carries its stable script ID and rebuilds it only from the fresh player release",
);
assert.match(
  presentation,
  /document\.addEventListener\("visibilitychange", \(\) => \{[\s\S]*?document\.visibilityState === "hidden"\) capturePlayPresentationResume\(\);[\s\S]*?document\.visibilityState === "visible"\) restorePlayPresentationAfterMobileWake\(\);[\s\S]*?window\.addEventListener\("pagehide"[\s\S]*?window\.addEventListener\("pageshow"/,
  "Swipe View captures its exact resume route on mobile backgrounding and restores it on BFCache wake",
);
assert.match(
  presentation,
  /async function restorePlayPresentationAfterMobileWake\(\)[\s\S]*?await refreshPlayerRelease\(\{ force: true, navigate: false \}\)[\s\S]*?return restorePlayPresentationResume\(\);/,
  "mobile resume refreshes the authorized player release before rebuilding Swipe View",
);
assert.match(
  presentation,
  /function closePlayPresentation\(opts = \{\}\) \{[\s\S]*?clearPlayPresentationResume\(\);/,
  "a deliberate Swipe View close clears the recovery route so it cannot reopen later",
);
assert.match(
  workspaceSync,
  /function completePlayerPublishJobs\(opts = \{\}\)/,
  "the shared sync queue can resolve all player publish receipts after one merged commit",
);

console.log("script player publish contract: persisted release handoff and player freshness checks passed");
