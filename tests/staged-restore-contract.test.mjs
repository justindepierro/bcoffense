/**
 * Staged recovery client contract.
 *
 * The browser recovery UI is deliberately thin, but these source contracts
 * protect the important boundaries: server-shaped input is filtered again,
 * a local snapshot happens before apply, and rollback can remove incoming-only
 * team keys through exact allowlisted replacement semantics.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const stagedSource = readFileSync(new URL("../js/staged-restore.js", import.meta.url), "utf8");
const cloudSource = readFileSync(new URL("../js/cloud-sync.js", import.meta.url), "utf8");
const storageSource = readFileSync(new URL("../js/storage.js", import.meta.url), "utf8");

assert.match(stagedSource, /const incoming = canonicalWorkspace\(remote\?\.backup \|\| \{\}\)/, "manual recovery re-filters the incoming workspace");
assert.match(stagedSource, /const snapshot = await saveSnapshot\(state\.local/, "a local safety snapshot is saved before apply");
assert.match(stagedSource, /window\.applyCloudBackupImmediately\(state\.remote/, "the reviewed payload is applied through the shared restore path");
assert.match(stagedSource, /localRollback: true/, "rollback uses an explicit local-only restore mode");
assert.match(stagedSource, /MAX_SNAPSHOTS_PER_TEAM = 5/, "snapshot retention is bounded per team");

assert.match(cloudSource, /const backup = buildCanonicalTeamWorkspace\(remote\?\.backup \|\| \{\}\)/, "all recovery paths reapply the canonical team boundary");
assert.match(cloudSource, /replaceMissingKeys: opts\.replaceMissingKeys === false \? undefined : canonicalKeys/, "team recovery requests exact replacement only for allowlisted keys");
assert.match(cloudSource, /if \(!opts\.localRollback\)/, "local rollback does not rewrite cloud recovery metadata");

assert.match(storageSource, /const replaceMissingKeys = Array\.isArray\(options\.replaceMissingKeys\)/, "storage supports an explicit replacement subset");
assert.match(storageSource, /if \(!Object\.prototype\.hasOwnProperty\.call\(backup, key\)\)/, "incoming-only team keys can be removed on rollback");
assert.match(storageSource, /else if \(replaceMissingKeys\?\.has\(STORAGE_KEYS\.PLAYBOOK\)\)/, "playbook IndexedDB is cleared when a snapshot intentionally lacks it");

console.log("✓ staged restore client contract passed");
