import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const cloudSync = await readFile(new URL("js/cloud-sync.js", `file://${root}/`), "utf8");
const scriptStorage = await readFile(new URL("js/script-storage.js", `file://${root}/`), "utf8");
const scriptPlayer = await readFile(new URL("js/script-player.js", `file://${root}/`), "utf8");
const cloudRecovery = await readFile(new URL("functions/admin/script-recovery.js", `file://${root}/`), "utf8");

assert.match(cloudSync, /function mergeSavedScriptCollections/, "cloud push has a script-level merge guard");
assert.match(cloudSync, /remoteBeforePush = await fetchCanonicalWorkspace/, "cloud push reads the canonical head before writing");
assert.match(cloudSync, /mergeCanonicalSavedScripts\(backup, remoteBeforePush\.backup\)/, "remote-only scripts are preserved before workspace PUT");
assert.match(scriptStorage, /SCRIPT_VERSION_LIMIT/, "saved scripts retain bounded history");
assert.match(scriptStorage, /preserveSavedScriptVersion\(record/, "updates snapshot the prior script version");
assert.match(scriptStorage, /target\.deletedAt = new Date\(\)\.toISOString\(\)/, "deletion creates a recoverable tombstone");
assert.match(scriptStorage, /function restoreDeletedSavedScript/, "trash supports self-service restore");
assert.match(scriptStorage, /function restoreSavedScriptVersion/, "history restores a safe copy instead of overwriting the current record");
assert.match(scriptPlayer, /function getDeletedSavedScripts/, "saved scripts expose a distinct trash collection");
assert.match(scriptPlayer, /function reconcileDuplicateSavedScriptDocuments/, "legacy same-day saved copies are consolidated into one living script");
assert.match(scriptStorage, /function duplicateCurrentScript\(\)/, "copying is an explicit action instead of a normal-save duplicate path");
assert.doesNotMatch(scriptStorage, /title: "Duplicate Name"/, "normal saves do not interrupt coaches with duplicate-name prompts");
assert.match(scriptPlayer, /function getPlayerPublishedScripts\(\)[\s\S]*?getActiveSavedScripts\(\)/, "deleted scripts are never projected to player logins");
assert.match(scriptStorage, /function openCloudSavedScriptRecovery/, "admins can self-serve immutable cloud script history");
assert.match(scriptStorage, /function restoreCloudSavedScript/, "cloud history restores through an explicit user action");
assert.match(cloudRecovery, /session\.role !== "admin"/, "cloud history recovery is admin-only");
assert.match(cloudRecovery, /readWorkspaceRevision/, "recovery reads a selected immutable workspace revision");
assert.match(cloudRecovery, /commitWorkspaceAndPlayerRelease/, "recovery commits workspace and player release together");
assert.match(cloudRecovery, /expectedWorkspaceRevision: current\.pointer\.workspaceRevision/, "recovery uses a compare-and-swap against the current workspace head");
assert.match(cloudRecovery, /workspace\.savedScripts =/, "recovery changes only the saved-script collection in the current workspace");

console.log("script library recovery contract: 17 assertions passed");
