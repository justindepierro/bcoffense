/**
 * Clip index KV-read contract.
 *
 * The startup index must use KV list metadata for current manifests. A page
 * with many clips must not turn one index request into one KV get per clip.
 */

import { listTeamClipSigs } from "../functions/_lib/team-workspace.js";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.error(`  ❌ ${label}`);
  }
}

console.log("\n▸ Clip index KV-read contract");

const teamId = "team-a";
const prefix = `team:${encodeURIComponent(teamId)}:clips:`;
const calls = { list: 0, get: 0 };
const store = {
  async list({ prefix: requestedPrefix }) {
    calls.list += 1;
    if (requestedPrefix !== prefix) return { keys: [], list_complete: true };
    return {
      keys: [
        { name: `${prefix}${encodeURIComponent("play-1")}`, metadata: { kind: "clip-manifest", teamId } },
        { name: `${prefix}${encodeURIComponent("play-deleted")}`, metadata: { kind: "clip-manifest", deleted: "true", teamId } },
        // Older current records may not have metadata; retain them rather
        // than hiding a playable clip during the metadata rollout.
        { name: `${prefix}${encodeURIComponent("play-legacy-metadata")}` },
      ],
      list_complete: true,
    };
  },
  async get() {
    calls.get += 1;
    throw new Error("Current clip index must not read each listed manifest");
  },
};

const sigs = await listTeamClipSigs(store, { AUTH_PRIMARY_TEAM_ID: "other-team" }, teamId);
assert(JSON.stringify(sigs.sort()) === JSON.stringify(["play-1", "play-legacy-metadata"]), "returns live current manifests and excludes tombstones");
assert(calls.list === 1, "uses one KV list for the current team prefix");
assert(calls.get === 0, "does not perform per-manifest KV reads for current entries");

if (failed) process.exitCode = 1;
else console.log(`\n${passed} assertions passed.`);
