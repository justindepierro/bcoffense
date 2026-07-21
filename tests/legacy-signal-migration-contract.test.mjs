import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [route, signals] = await Promise.all([
  readFile(new URL("../functions/media/migrate-legacy-signal-manifests.js", import.meta.url), "utf8"),
  readFile(new URL("../js/signals.js", import.meta.url), "utf8"),
]);

assert.match(route, /getSessionFromRequest/, "legacy signal migration requires an authenticated session");
assert.match(route, /isAdmin\(session\)/, "only admins can start the legacy signal migration");
assert.match(route, /teamId !== primaryTeamId/, "legacy migration is scoped to the configured primary team");
assert.match(route, /await bucket\.get\(sourceKey\)/, "legacy clip bytes are read before a canonical manifest is committed");
assert.match(route, /await bucket\.put\(destinationKey, source\.body/, "legacy signal bytes are copied into canonical R2 storage");
assert.match(route, /await bucket\.head\(destinationKey\)/, "the canonical copy is verified before the manifest changes");
assert.match(route, /await writeTeamClipManifest\(store, teamId, sig, copied\)/, "the canonical manifest is the migration commit point");
assert.doesNotMatch(route, /\.delete\(/, "legacy migration never deletes recovery objects");
assert.match(signals, /_sigMigrateLegacySignalManifests/, "admin startup invokes bounded legacy signal migration");
assert.match(signals, /migrate-legacy-signal-manifests/, "client calls the dedicated canonical migration route");
assert.match(signals, /attempt < 8/, "client migration is bounded even when old media needs several batches");

console.log("legacy signal migration contract: 11 assertions passed");
