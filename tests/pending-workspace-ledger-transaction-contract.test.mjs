import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [storage, cloudSync] = await Promise.all([
  readFile(new URL("js/storage.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/cloud-sync.js", `file://${root}/`), "utf8"),
]);

assert.match(
  storage,
  /const _WORKSPACE_SYNC_LEDGER_DB_NAME = "bcoffense-workspace-sync-ledger"[\s\S]*?const _WORKSPACE_SYNC_LEDGER_STORE = "pendingWorkspaceSync"/,
  "automatic team-sync intent has a dedicated device-only IndexedDB store",
);
assert.match(
  storage,
  /async function _mutateWorkspaceSyncLedgerRecord[\s\S]*?const tx = db\.transaction\(_WORKSPACE_SYNC_LEDGER_STORE, "readwrite"\)[\s\S]*?const request = store\.get\(normalizedTeamId\)[\s\S]*?const next = mutate\(current\)[\s\S]*?store\.put\(result\)/,
  "one team ledger update is an atomic IndexedDB read-mutate-write transaction",
);
assert.match(
  storage,
  /async function _migrateWorkspaceSyncLedgerRecords[\s\S]*?_WORKSPACE_SYNC_LEDGER_LEGACY_MIGRATION_KEY[\s\S]*?metadata\.put\(\{ key: _WORKSPACE_SYNC_LEDGER_LEGACY_MIGRATION_KEY/,
  "the old localStorage map migrates once with a durable transactioned marker",
);
assert.match(
  storage,
  /clearPendingWorkspaceSyncLedger\(\) \{[\s\S]*?_clearWorkspaceSyncLedgerRecords\(\)/,
  "a full coach-device clear removes the device-only retry ledger as well",
);

const persistStart = cloudSync.indexOf("function persistPendingWorkspaceSyncIntent");
const persistEnd = cloudSync.indexOf("async function clearPendingWorkspaceSyncIntentIfMatching");
assert(persistStart >= 0 && persistEnd > persistStart, "pending-intent persistence has a bounded implementation body");
const persist = cloudSync.slice(persistStart, persistEnd);
assert.match(
  persist,
  /queuePendingWorkspaceSyncLedgerMutation\(teamId[\s\S]*?saveCloudSyncSettingsObject\(\{ workspaceTeamId: teamId \}\)/,
  "a save starts the per-team transaction while preserving the shared-device workspace marker",
);
assert.doesNotMatch(
  persist,
  /pendingWorkspaceSyncByTeam/,
  "a new save never writes its active retry intent back into the racy settings-map record",
);
assert.match(
  cloudSync,
  /async function flushCloudAutoPushInternal[\s\S]*?await hydratePendingWorkspaceSyncIntent\(context\.user\)[\s\S]*?await markPendingWorkspaceSyncAttempt\(pendingIntentAtFlush[\s\S]*?publishTeamWorkspace\(\{[\s\S]*?pendingWorkspaceSyncIntent: pendingIntentAtFlush/,
  "the fast timer waits for the committed ledger snapshot before it publishes",
);
assert.match(
  cloudSync,
  /async function clearPendingWorkspaceSyncIntentIfMatching[\s\S]*?current\.generation !== snapshot\.generation[\s\S]*?return null/,
  "a post-publish clear leaves a newer same-team generation intact",
);
assert.match(
  cloudSync,
  /IndexedDB commits[\s\S]*?inherently asynchronous[\s\S]*?if a browser process is killed before this[\s\S]*?We never send[\s\S]*?before the transaction resolves/,
  "the unavoidable pre-commit browser-kill boundary is documented without claiming a false durability guarantee",
);
assert.match(
  cloudSync,
  /journalUnavailable[\s\S]*?Automatic team sync needs attention[\s\S]*?"error"/,
  "a journal failure is visible as attention-needed, never as a settled synced status",
);

console.log("pending workspace ledger transaction contract: all assertions passed");
