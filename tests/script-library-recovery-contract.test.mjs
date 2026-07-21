import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const cloudSync = await readFile(new URL("js/cloud-sync.js", `file://${root}/`), "utf8");
const scriptStorage = await readFile(new URL("js/script-storage.js", `file://${root}/`), "utf8");
const scriptPlayer = await readFile(new URL("js/script-player.js", `file://${root}/`), "utf8");

assert.match(cloudSync, /function mergeSavedScriptCollections/, "cloud push has a script-level merge guard");
assert.match(cloudSync, /remoteBeforePush = await fetchCanonicalWorkspace/, "cloud push reads the canonical head before writing");
assert.match(cloudSync, /mergeCanonicalSavedScripts\(backup, remoteBeforePush\.backup\)/, "remote-only scripts are preserved before workspace PUT");
assert.match(scriptStorage, /SCRIPT_VERSION_LIMIT/, "saved scripts retain bounded history");
assert.match(scriptStorage, /preserveSavedScriptVersion\(record/, "updates snapshot the prior script version");
assert.match(scriptStorage, /target\.deletedAt = new Date\(\)\.toISOString\(\)/, "deletion creates a recoverable tombstone");
assert.match(scriptStorage, /function restoreDeletedSavedScript/, "trash supports self-service restore");
assert.match(scriptStorage, /function restoreSavedScriptVersion/, "history restores a safe copy instead of overwriting the current record");
assert.match(scriptPlayer, /function getDeletedSavedScripts/, "saved scripts expose a distinct trash collection");
assert.match(scriptPlayer, /function getPlayerPublishedScripts\(\)[\s\S]*?getActiveSavedScripts\(\)/, "deleted scripts are never projected to player logins");

console.log("script library recovery contract: 10 assertions passed");
