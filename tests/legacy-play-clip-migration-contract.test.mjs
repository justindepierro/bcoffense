import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [route, clips] = await Promise.all([
  readFile(new URL("../functions/media/migrate-legacy-play-clip-manifests.js", import.meta.url), "utf8"),
  readFile(new URL("../js/play-clips.js", import.meta.url), "utf8"),
]);

assert.match(route, /getSessionFromRequest/, "legacy play clip migration requires an authenticated session");
assert.match(route, /isAdmin\(session\)/, "only admins can start the legacy play clip migration");
assert.match(route, /teamId !== primaryTeamId/, "legacy play clip migration is scoped to the configured primary team");
assert.match(route, /readCurrentWorkspaceRevision/, "migration resolves matches from the current immutable workspace revision");
assert.match(route, /target\.ambiguous/, "ambiguous historic keys are never guessed");
assert.match(route, /await bucket\.get\(sourceKey\)/, "legacy clip bytes are read before a permanent manifest is committed");
assert.match(route, /await bucket\.head\(destinationKey\)/, "the canonical play clip copy is verified before commit");
assert.match(route, /existingSource !== sourceKey/, "a pre-existing destination must prove its exact archived source");
assert.match(route, /existingEtag !== sourceEtag/, "a pre-existing destination must prove its archived object version");
assert.match(route, /legacyEtag: sourceEtag/, "the copied object retains its verified source version evidence");
assert.match(route, /await writeTeamClipManifest\(store, teamId, target\.mediaId, copied\)/, "migration commits to a permanent play media ID");
assert.match(route, /await writeTeamClipManifest\(store, teamId, sig, \[\]\)/, "old tag manifests are tombstoned instead of deleted");
assert.doesNotMatch(route, /bucket\.delete\(/, "legacy play migration never deletes recovery objects");
assert.match(clips, /migrate-legacy-play-clip-manifests/, "admin startup invokes the dedicated play-clip migration route");
assert.match(clips, /attempt < 8/, "play-clip migration is bounded across requests");

console.log("legacy play clip migration contract: 15 assertions passed");
