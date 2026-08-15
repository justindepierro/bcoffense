import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [source, cloudSync, storage, workspaceSync, auth, appInit, appShell, appSession, deployScript] = await Promise.all([
  readFile(new URL("functions/workspace/revision.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/cloud-sync.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/storage.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/workspace-sync.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/auth.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/app-init.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/app-shell.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/app-session.js", `file://${root}/`), "utf8"),
  readFile(new URL("scripts/deploy-cloudflare.sh", `file://${root}/`), "utf8"),
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
assert.match(source, /BC_WORKSPACE_STORE_UNAVAILABLE/, "workspace storage outages have a stable, actionable error code");
assert.match(source, /BC_TEAM_CONTEXT_UNAVAILABLE/, "team-context outages are distinct from missing staff authorization");
assert.match(cloudSync, /function rebaseCanonicalWorkspaceForAutoPush/, "automatic saves rebase onto the newest team workspace instead of pushing a stale full browser snapshot");
assert.match(cloudSync, /opts\.auto[\s\S]*rebaseCanonicalWorkspaceForAutoPush/, "only background saves use key-scoped rebasing while deliberate recovery retains its existing behavior");
assert.match(
  cloudSync,
  /function preventEmptyPlaybookOverwrite\(localBackup, remoteBackup, opts = \{\}\)[\s\S]*?protectedCollections\.length[\s\S]*?BC_DESTRUCTIVE_WORKSPACE_REPLACEMENT_BLOCKED[\s\S]*?preventEmptyPlaybookOverwrite\(backup, remoteBeforePush\.backup, opts\);/,
  "a blank device cannot publish over populated canonical team collections",
);
assert.match(cloudSync, /CLOUD_AUTO_PUSH_CONFLICT_RETRY_MS/, "revision conflicts retry promptly after reloading the current head");
assert.match(cloudSync, /const CLOUD_AUTO_PUSH_DELAY_MS = 2500;/, "routine edits coalesce briefly, then automatically sync to the team without an 8-second wait");
assert.match(cloudSync, /const CLOUD_AUTO_PUSH_MAX_HOLD_MS = 30 \* 1000;/, "continuous editing has a bounded automatic-sync deadline instead of leaving work local indefinitely");
assert.match(cloudSync, /const CLOUD_AUTO_PUSH_CRITICAL_DELAY_MS = 1200;/, "player-facing changes retain the faster critical handoff path");
assert.match(cloudSync, /pendingWorkspaceSyncByTeam/, "the former cloudSyncSettings map remains a compatibility migration input rather than silently dropping existing retries");
assert.match(cloudSync, /function normalizePendingWorkspaceSyncByTeam/, "legacy map input is bounded and sanitized before migration");
assert.match(cloudSync, /legacyPendingWorkspaceSync[\s\S]*?source\.pendingWorkspaceSync[\s\S]*?pendingWorkspaceSyncByTeam\[legacyPendingWorkspaceSync\.teamId\]/, "a pre-map pending intent still reaches the compatibility map before transactional migration");
assert.match(storage, /const _WORKSPACE_SYNC_LEDGER_DB_NAME = "bcoffense-workspace-sync-ledger"/, "pending automatic-save intent has its own device-only IndexedDB ledger");
assert.match(storage, /db\.transaction\(_WORKSPACE_SYNC_LEDGER_STORE, "readwrite"\)/, "a per-team ledger mutation runs in one IndexedDB readwrite transaction instead of a localStorage read-modify-write");
assert.match(storage, /async function _mutateWorkspaceSyncLedgerRecord[\s\S]*?store\.get\(normalizedTeamId\)[\s\S]*?const next = mutate\(current\)[\s\S]*?store\.put\(result\)/, "the ledger reads, transforms, and writes one team record inside that transaction");
assert.match(storage, /_WORKSPACE_SYNC_LEDGER_LEGACY_MIGRATION_KEY = "legacy-map-v1-migrated"/, "the v1 map migration has a durable marker so consumed old entries cannot resurrect later");
assert.match(storage, /async function _migrateWorkspaceSyncLedgerRecords[\s\S]*?metadata\.put\(\{ key: _WORKSPACE_SYNC_LEDGER_LEGACY_MIGRATION_KEY/, "legacy map records and their migration marker commit through the same IndexedDB transaction");
assert.match(cloudSync, /function ensurePendingWorkspaceSyncLedgerMigrated[\s\S]*?storageManager\.migratePendingWorkspaceSyncLedger/, "cloud sync migrates old retry records before new transactional writes begin");
assert.match(cloudSync, /function queuePendingWorkspaceSyncLedgerMutation[\s\S]*?storageManager\.mutatePendingWorkspaceSyncLedger/, "new edits use the transactioned per-team mutation API");
assert.match(cloudSync, /function getPendingWorkspaceSyncIntentForCurrentTeam[\s\S]*?getCachedPendingWorkspaceSyncIntent\(teamId\)/, "current-team cache reads cannot consume another team's pending intent");
assert.match(cloudSync, /function persistPendingWorkspaceSyncIntent[\s\S]*?queuePendingWorkspaceSyncLedgerMutation\(teamId/, "new local edits advance only the authenticated team's transactioned durable generation");
const persistPendingIntentSource = cloudSync.slice(
  cloudSync.indexOf("function persistPendingWorkspaceSyncIntent"),
  cloudSync.indexOf("async function clearPendingWorkspaceSyncIntentIfMatching"),
);
assert.doesNotMatch(persistPendingIntentSource, /pendingWorkspaceSyncByTeam/, "new retry writes never put the active intent back into the racy settings map");
assert.match(cloudSync, /async function clearPendingWorkspaceSyncIntentIfMatching[\s\S]*?queuePendingWorkspaceSyncLedgerMutation\(teamId[\s\S]*?current\.generation !== snapshot\.generation/, "a successful publish conditionally clears only its snapshot generation inside the transactioned team record");
assert.match(cloudSync, /async function hydratePendingWorkspaceSyncIntent[\s\S]*?await waitForPendingWorkspaceSyncLedger[\s\S]*?cloudAutoPushDirtyKeys\.add/, "reload recovery waits for the durable ledger before restoring dirty keys and retrying a saved edit");
assert.match(cloudSync, /async function flushCloudAutoPushInternal[\s\S]*?await hydratePendingWorkspaceSyncIntent\(context\.user\)[\s\S]*?await markPendingWorkspaceSyncAttempt\(pendingIntentAtFlush/, "the 2.5-second timer cannot publish before its per-team intent transaction is committed");
assert.match(cloudSync, /let pendingWorkspaceSyncIntent = null;[\s\S]*?pendingWorkspaceSyncIntent = await hydratePendingWorkspaceSyncIntent\(currentUser\)[\s\S]*?let remote = await fetchCanonicalWorkspace/, "startup awaits a pending local write before the canonical pull can replace the workspace");
assert.match(cloudSync, /sessionStorage\.getItem\(CLOUD_SYNC_AUTO_PULL_SESSION_KEY\) === "1"[\s\S]*?await resumePendingWorkspaceSync\(\)/, "a normal reload re-arms a durable pending sync even when the startup-pull guard already exists");
assert.match(auth, /function announceAuthContextChange\(\)[\s\S]*?bc-auth-context-changed/, "auth exposes one explicit secure-principal boundary for sync consumers");
assert.match(auth, /const completeAuthenticatedLogin = async \(user, source\) => \{[\s\S]*?currentAuthUser = user;\s*announceAuthContextChange\(\);/, "a new login clears prior-session volatile sync state before workspace hydration");
assert.match(auth, /async function logoutAuth\(\)[\s\S]*?currentAuthUser = null;\s*announceAuthContextChange\(\);/, "logout clears volatile sync state only after the server confirms the cookie is gone");
assert.match(auth, /function handleExpiredServerSession[\s\S]*?currentAuthUser = null;\s*announceAuthContextChange\(\);/, "an expired server session uses the same sync boundary as an explicit logout");
assert.match(cloudSync, /function getWorkspaceAuthContext\(user = null\)[\s\S]*?generation: cloudSyncAuthGeneration[\s\S]*?key: `\$\{teamId\}\|\$\{role\}\|\$\{subject\}\|\$\{session\}\|\$\{cloudSyncAuthGeneration\}`/, "each save captures team, subject, session, and a local auth generation");
assert.match(cloudSync, /function scheduleCloudAutoPushTimer\(delay, context = cloudAutoPushContext\)[\s\S]*?isCloudAutoPushContextActive\(timerContext\)/, "a delayed Team A timer cannot become Team B's first publish");
assert.match(cloudSync, /async function workspaceFetchWithTimeout\(resource, options = \{\}, opts = \{\}\)[\s\S]*?const authContext = opts\.authContext \|\| null;[\s\S]*?controller\.abort\(\)[\s\S]*?window\.addEventListener\("bc-auth-context-changed", abortForAuthChange\)[\s\S]*?workspaceAuthContextChangedError\(authContext\)/, "an in-flight workspace request is aborted and classified safely when the secure principal changes");
assert.match(cloudSync, /function getResumablePendingWorkspaceSyncIntent[\s\S]*?workspaceTeamId && workspaceTeamId !== authContext\.teamId\) return null/, "a previous team's durable intent remains retained but cannot borrow another team's local cache");
assert.match(cloudSync, /function canCurrentAuthUseLiveEditorDirtyState\(\)[\s\S]*?workspaceTeamId === currentTeamId/, "Team A's global editor-dirty flag cannot block Team B hydration");
assert.match(cloudSync, /const cacheBelongsToAnotherTeam = Boolean\([\s\S]*?storedSettings\.workspaceTeamId !== authContext\.teamId,[\s\S]*?\{ \.\.\.storedSettings, lastWorkspaceRevision: "" \}/, "a prior team's ETag is never used as Team B's workspace identity");
assert.match(cloudSync, /async function pushCloudBackupInternal\(opts = \{\}\)[\s\S]*?assertWorkspaceAuthContext\(authContext\);[\s\S]*?await buildCloudBackupPayload[\s\S]*?assertWorkspaceAuthContext\(authContext\);[\s\S]*?workspaceRevisionRequest\("PUT", payloadText, knownRevision, \{ authContext \}\);[\s\S]*?assertWorkspaceAuthContext\(authContext, \{ committed: true \}\);/, "an in-flight publish rechecks its captured context before and after the canonical PUT");
assert.match(cloudSync, /async function repairCanonicalWorkspace\(remote, opts = \{\}\)[\s\S]*?assertWorkspaceAuthContext\(authContext\);[\s\S]*?workspaceRevisionRequest\("PUT", payload, remote\.revision[\s\S]*?assertWorkspaceAuthContext\(authContext, \{ committed: true \}\);/, "the startup repair PUT is fenced by the same auth context checks");
assert.match(cloudSync, /async function rebuildPlayerRelease\(\)[\s\S]*?const authContext = getWorkspaceAuthContext\(\);[\s\S]*?assertWorkspaceAuthContext\(authContext\);[\s\S]*?workspaceFetchWithTimeout\("\/admin\/player-release"[\s\S]*?\{ authContext \}\);[\s\S]*?assertWorkspaceAuthContext\(authContext, \{ committed: response\.ok && data\?\.ok === true \}\);/, "the explicit player-release rebuild cannot carry an old admin session into a new team context");
assert.match(cloudSync, /window\.addEventListener\("bc-auth-context-changed", \(\) => \{\s*resetCloudAutoPushVolatileState\(\{ bumpAuthGeneration: true \}\);\s*\}\);/, "an auth transition discards timers, live dirty keys, and errors without deleting the durable ledger");
const cloudVolatileReset = cloudSync.slice(
  cloudSync.indexOf("function resetCloudAutoPushVolatileState"),
  cloudSync.indexOf("function activateCloudAutoPushContext"),
);
assert.doesNotMatch(cloudVolatileReset, /pendingWorkspaceSync|saveCloudSyncSettingsObject/, "the auth reset does not erase any previous team's durable retry ledger");
assert.match(workspaceSync, /function resetWorkspaceSyncForAuthContext\(\)[\s\S]*?workspaceSyncJobs\.clear\(\)[\s\S]*?workspaceSyncLastSettled\[channel\] = \{ state: "idle"[\s\S]*?workspaceBackgroundRequests\.clear\(\)/, "the visible header and dock discard Team A jobs, errors, and settled labels at the auth boundary");
assert.match(workspaceSync, /window\.addEventListener\("bc-auth-context-changed", resetWorkspaceSyncForAuthContext\)/, "workspace presentation listens to the same auth boundary as cloud sync");
assert.match(appShell, /window\.addEventListener\("bc-auth-context-changed", \(\) => \{[\s\S]*?localArtifactSaveStates\[key\] = "idle"/, "the shared header clears prior-account editor status at the auth boundary");
assert.match(appSession, /window\.addEventListener\("bc-auth-context-changed", \(\) => \{[\s\S]*?scriptDirty = false;[\s\S]*?wristbandDirty = false;/, "prior-account editor dirty flags cannot reassert a stale local-save warning after sign-in");
assert.match(cloudSync, /function getCloudServerRetryDelay/, "service-unavailable saves use a bounded reconnect delay rather than a request loop");
assert.match(cloudSync, /CLOUD_AUTO_PUSH_SERVER_COOLDOWN_MS/, "an unavailable team service enters a local-save cooldown without repeated failed requests");
assert.match(cloudSync, /cloudAutoPushServerUnavailableUntil/, "new edits respect the service-unavailable cooldown instead of restarting failed requests");
assert.match(cloudSync, /else if \(serviceUnavailable\) \{[\s\S]*?Team service reconnecting — saved on this device[\s\S]*?\} else if \(cloudAutoPushRetryCount <= CLOUD_AUTO_PUSH_MAX_RETRIES\)/, "a 503 enters cooldown before generic retry handling can repeat the failed request");
assert.match(cloudSync, /data\.code \? ` \(\$\{data\.code\}\)`/, "workspace errors retain their safe server diagnostic code for the sync dock");
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
assert.match(workspaceSync, /function hasBlockingWorkspaceSyncWork\(\)/, "a background-retrying publish does not block a safe app-shell upgrade forever");
assert.match(workspaceSync, /\["dirty", "saving", "syncing"\]/, "only actively writing work blocks a service-worker update");
assert.match(workspaceSync, /workspace-published/, "workspace sync broadcasts successful team revision handoffs");
assert.match(workspaceSync, /function canAttemptWorkspaceBackgroundRequest\(key\)/, "background polling shares one retry circuit instead of per-feature retry loops");
assert.match(workspaceSync, /function recordWorkspaceBackgroundRequestFailure\(key, error\)/, "temporary service failures record an exponentially delayed retry");
assert.match(cloudSync, /canAttemptBackgroundRequest\("team-workspace-refresh"\)/, "foreground workspace refresh respects the shared service cooldown");
assert.match(cloudSync, /recordBackgroundRequestFailure\?\.\("team-workspace-refresh", err\)/, "expected workspace service failures are reported to the shared circuit");
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
assert.match(await readFile(new URL("index.html", `file://${root}/`), "utf8"), /hasBlockingWorkspaceSyncWork/, "the app-shell update gate does not wait indefinitely on a locally-saved cloud retry");
assert.match(cloudSync, /err\.code !== "BC_WORKSPACE_TIMEOUT"/, "a startup workspace timeout exits quietly so a device can show its saved workspace");
assert.match(source, /Workspace service unavailable/, "missing workspace bindings are safely logged for server-side diagnosis");
assert.match(source, /Workspace team context unavailable/, "missing team context is safely logged for server-side diagnosis");
assert.match(
  deployScript,
  /required_pages_secrets=\(AUTH_SESSION_SECRET AUTH_PRIMARY_TEAM_ID\)/,
  "production deploys refuse to proceed without the static-staff workspace team binding",
);
assert.match(
  deployScript,
  /pages secret list --project-name bcoffense/,
  "the deployment preflight verifies Pages secret bindings without reading their encrypted values",
);

console.log("workspace revision route and live-sync contract: all assertions passed");
