import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [source, cloudSync, workspaceSync, appInit, appShell] = await Promise.all([
  readFile(new URL("functions/workspace/revision.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/cloud-sync.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/workspace-sync.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/app-init.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/app-shell.js", `file://${root}/`), "utf8"),
]);

assert.match(source, /commitWorkspaceAndPlayerRelease/, "daily workspace route uses the atomic D1\/R2 commit helper");
assert.match(source, /X-BC-Expected-Workspace-Revision/, "daily workspace route accepts an explicit CAS revision");
assert.match(source, /workspaceError\([^\n]+, 428/, "daily workspace route rejects a blind write over an existing head");
assert.match(source, /buildPlayerRelease\(workspace/, "player release is built before the shared head moves");
assert.match(source, /TEAM_WORKSPACE_KEYS/, "daily workspace route uses a strict team-data allowlist");
assert.match(source, /LEGACY_DEVICE_ONLY_KEYS/, "daily workspace route recognizes only an explicit legacy browser-field migration set");
assert.match(source, /unclassified field/, "daily workspace route rejects unclassified future fields");
assert.match(source, /opts\.allowLegacyRepair !== false/, "staff reads repair a recognized legacy workspace once");
assert.match(source, /expectedWorkspaceRevision: current\.pointer\.workspaceRevision/, "legacy repair uses the current workspace head as its CAS base");
assert.doesNotMatch(source, /sync\/backup/, "daily workspace route never delegates to raw recovery backup");
assert.match(source, /readCurrentWorkspaceRevision/, "coach workspace reads use the immutable pointer");
assert.match(source, /validateWorkspaceReplacement\(currentWorkspace, workspace\)/, "the server rejects destructive writes after reading the authoritative workspace payload");
assert.match(source, /BC_DESTRUCTIVE_WORKSPACE_REPLACEMENT_BLOCKED/, "destructive write rejections have a stable machine-readable code");
assert.match(source, /readCurrentWorkspacePointer\(context\.env, principal\.teamId\)/, "foreground freshness checks read the compact current pointer before loading R2 bytes");
assert.match(source, /If-None-Match/, "workspace reads honor ETags for no-body freshness responses");
assert.match(cloudSync, /function rebaseCanonicalWorkspaceForAutoPush/, "automatic saves rebase onto the newest team workspace instead of pushing a stale full browser snapshot");
assert.match(cloudSync, /opts\.auto[\s\S]*rebaseCanonicalWorkspaceForAutoPush/, "only background saves use key-scoped rebasing while deliberate recovery retains its existing behavior");
assert.match(
  cloudSync,
  /function preventEmptyPlaybookOverwrite\(localBackup, remoteBackup, opts = \{\}\)[\s\S]*?protectedCollections\.length[\s\S]*?BC_DESTRUCTIVE_WORKSPACE_REPLACEMENT_BLOCKED[\s\S]*?preventEmptyPlaybookOverwrite\(backup, remoteBeforePush\.backup, opts\);/,
  "a blank device cannot publish over populated canonical team collections",
);
assert.match(cloudSync, /CLOUD_AUTO_PUSH_CONFLICT_RETRY_MS/, "revision conflicts retry promptly after reloading the current head");
assert.match(cloudSync, /function refreshTeamWorkspaceOnForeground/, "open devices perform lightweight foreground freshness checks");
assert.match(cloudSync, /function shouldProtectUntrackedLocalWorkspace/, "only browser-only untracked work is protected from automatic replacement");
assert.match(cloudSync, /remoteMatchesKnownRevision/, "staff freshness follows canonical revision identity instead of device timestamps");
assert.match(cloudSync, /hasLocalTeamEditInProgress\(\)/, "active local saves remain protected during automatic workspace refresh");
assert.match(cloudSync, /function workspaceFetchWithTimeout/, "workspace revision requests have a bounded client deadline");
assert.match(cloudSync, /BC_WORKSPACE_TIMEOUT/, "a timed-out workspace request is classified as safe-to-retry work");
assert.match(cloudSync, /function acquireCloudWorkspaceLease/, "cloud publishing coordinates concurrent browser tabs before a revision write");
assert.match(cloudSync, /auto: opts\.auto === true/, "automatic publishes retain automatic rebase semantics through the publish path");
assert.match(cloudSync, /workspace-sync-remote-update/, "a clean sibling tab refreshes after another tab publishes");
assert.match(workspaceSync, /TEAM_WORKSPACE_LEASE_KEY/, "workspace sync stores an expiring cross-tab lease");
assert.match(workspaceSync, /function acquireTeamWorkspaceLease/, "workspace sync provides a lease acquisition API");
assert.match(workspaceSync, /workspace-published/, "workspace sync broadcasts successful team revision handoffs");
assert.match(appInit, /Loading team workspace\.\.\./, "each staff login checks its canonical workspace before rendering");
assert.match(appInit, /waitForStaffWorkspaceBootstrap/, "staff startup hydration has a bounded bootstrap path");
assert.match(appInit, /return whenAuthReady\(\);/, "startup waits for the authoritative auth result before choosing a workspace path");
assert.doesNotMatch(appInit, /whenAuthReady\(\),\s*new Promise\(\(resolve\) => setTimeout\(resolve, 4200\)\)/, "startup does not continue with an unknown identity after an arbitrary auth race");
assert.match(appInit, /setStartupLoadingHold\(true\)/, "staff startup holds the loader while its canonical pull is in flight");
assert.match(appInit, /autoPullLatestCloudBackup\(\{[\s\S]*timeoutMs: STAFF_WORKSPACE_STARTUP_TIMEOUT_MS/, "staff startup waits for the canonical pull with a bounded deadline instead of rendering a stale shell first");
assert.doesNotMatch(appInit, /Promise\.race\(\[\s*autoPullLatestCloudBackup/, "staff startup does not release an empty UI while the canonical pull continues in the background");
assert.match(cloudSync, /timeoutMs: opts\.timeoutMs/, "the startup deadline reaches every canonical workspace request, including migration repair reads");
assert.match(appShell, /function setStartupLoadingHold/, "the shared startup loader supports an explicit workspace hydration hold");
assert.match(appShell, /!isStartupLoadingHeld\(\)/, "the generic startup fallback cannot dismiss an authoritative workspace load");
assert.match(cloudSync, /err\.code !== "BC_WORKSPACE_TIMEOUT"/, "a startup workspace timeout exits quietly so a device can show its saved workspace");

console.log("workspace revision route and live-sync contract: 41 assertions passed");
