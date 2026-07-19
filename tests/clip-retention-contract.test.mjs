/**
 * Clip retention contract — historic R2 objects are recovery evidence.
 *
 * This exercises the manifest endpoint with an in-memory KV/R2 pair rather
 * than mirroring its logic. It proves that a manifest mutation is committed
 * before an eligible cleanup and that no legacy or merely prefix-matching
 * object can be physically deleted by routine clip replacement/deletion.
 */

import { createSessionCookie } from "../functions/_lib/auth.js";
import {
  onRequestDelete,
  onRequestPost,
} from "../functions/clips/manifest.js";

const TEAM_ID = "team-a";
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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function teamManifestKey(sig) {
  return `team:${encodeURIComponent(TEAM_ID)}:clips:${encodeURIComponent(sig)}`;
}

function canonicalClipKey(id) {
  return `media/teams/${TEAM_ID}/clips/${encodeURIComponent(id)}`;
}

function makeKv(initial = {}, events = []) {
  const values = new Map(Object.entries(initial));
  const puts = [];
  return {
    values,
    puts,
    async get(key, opts = {}) {
      if (!values.has(key)) return null;
      const value = values.get(key);
      if (opts.type === "json") {
        try {
          return cloneJson(typeof value === "string" ? JSON.parse(value) : value);
        } catch (_err) {
          return null;
        }
      }
      return typeof value === "string" ? value : JSON.stringify(value);
    },
    async put(key, value, opts = {}) {
      values.set(key, String(value));
      puts.push({ key, value: String(value), opts });
      events.push({ type: "manifest", key });
    },
  };
}

function makeEnvironment(initial = {}) {
  const events = [];
  const kv = makeKv(initial, events);
  const bucket = {
    puts: [],
    deletes: [],
    async put(key, value, opts = {}) {
      const size = value instanceof ArrayBuffer ? value.byteLength : Number(value?.byteLength || 0);
      this.puts.push({ key, size, opts });
      events.push({ type: "put", key });
      return { key, size };
    },
    async delete(key) {
      this.deletes.push(key);
      events.push({ type: "delete", key });
    },
  };
  return {
    env: {
      AUTH_SESSION_SECRET: "clip-retention-test-session-secret",
      AUTH_PRIMARY_TEAM_ID: TEAM_ID,
      SYNC_KV: kv,
      CLIPS: bucket,
    },
    kv,
    bucket,
    events,
  };
}

async function makeStaffRequest(env, method, sig, id = "") {
  const sessionCookie = await createSessionCookie({
    username: "coach",
    role: "coach",
    label: "Coach",
  }, env);
  const url = new URL("https://bcoffense.test/clips/manifest");
  url.searchParams.set("sig", sig);
  if (id) url.searchParams.set("id", id);
  const init = {
    method,
    headers: {
      Accept: "application/json",
      Cookie: sessionCookie.split(";")[0],
    },
  };
  if (method === "POST") {
    init.headers["Content-Type"] = "video/mp4";
    init.headers["Content-Length"] = "4";
    init.body = new Uint8Array([1, 2, 3, 4]);
  }
  return new Request(url, init);
}

function entry(id, r2key) {
  return {
    id,
    r2key,
    label: id,
    contentType: "video/mp4",
    size: 4,
    uploadedAt: "2026-07-18T00:00:00.000Z",
    uploadedBy: "coach",
  };
}

console.log("\n▸ Clip R2 retention contract");

// Replacing a signal sourced from a legacy KV record creates a canonical
// manifest but leaves all legacy-reachable bytes untouched for recovery.
{
  const sig = "signals/formation/legacy";
  const legacyObject = "clips/legacy-signal";
  const { env, kv, bucket } = makeEnvironment({
    [`clips:${sig}`]: JSON.stringify([entry("legacy-signal", legacyObject)]),
  });
  const response = await onRequestPost({
    request: await makeStaffRequest(env, "POST", sig),
    env,
  });
  const payload = await response.json();
  assert(response.status === 200 && payload.ok, "replacement of a legacy signal manifest succeeds");
  assert(bucket.deletes.length === 0, "replacement never deletes an object reached through a legacy manifest");
  assert(kv.values.get(`clips:${sig}`).includes(legacyObject), "legacy KV manifest remains recovery evidence");
  assert(kv.values.has(teamManifestKey(sig)), "replacement commits a team-scoped manifest");
}

// Removing a legacy entry writes a canonical tombstone but still keeps the
// old R2 bytes and historic record available to dedicated recovery tooling.
{
  const sig = "signals/formation/remove-legacy";
  const legacyObject = "clips/legacy-delete";
  const { env, kv, bucket } = makeEnvironment({
    [`clips:${sig}`]: JSON.stringify([entry("legacy-delete", legacyObject)]),
  });
  const response = await onRequestDelete({
    request: await makeStaffRequest(env, "DELETE", sig, "legacy-delete"),
    env,
  });
  const payload = await response.json();
  assert(response.status === 200 && payload.ok, "deletion of a legacy clip entry succeeds");
  assert(bucket.deletes.length === 0, "deletion never removes a legacy R2 object");
  assert(kv.values.get(`clips:${sig}`).includes(legacyObject), "legacy manifest remains available after a delete tombstone");
}

// A normal team-scoped replacement may reclaim only an exact immutable key
// that this endpoint itself could have created. The manifest commit happens
// before that best-effort cleanup.
{
  const sig = "signals/formation/canonical";
  const oldKey = canonicalClipKey("canonical-signal");
  const { env, bucket, events } = makeEnvironment({
    [teamManifestKey(sig)]: JSON.stringify([entry("canonical-signal", oldKey)]),
  });
  const response = await onRequestPost({
    request: await makeStaffRequest(env, "POST", sig),
    env,
  });
  assert(response.status === 200, "replacement of an exact canonical entry succeeds");
  assert(JSON.stringify(bucket.deletes) === JSON.stringify([oldKey]), "replacement only reclaims the superseded exact canonical object");
  assert(events.findIndex((event) => event.type === "manifest") < events.findIndex((event) => event.type === "delete"), "replacement commits the manifest before cleanup");
}

// Even when an entry now lives in a team-scoped KV manifest, a historic key
// (or a key that merely starts with the canonical prefix) is still retained.
{
  const sig = "play/retain-ambiguous";
  const legacyObject = "clips/retained-legacy";
  const prefixOnlyObject = `${canonicalClipKey("prefix-only")}/unexpected-version`;
  const { env, bucket } = makeEnvironment({
    [teamManifestKey(sig)]: JSON.stringify([
      entry("retained-legacy", legacyObject),
      entry("prefix-only", prefixOnlyObject),
    ]),
  });
  const first = await onRequestDelete({
    request: await makeStaffRequest(env, "DELETE", sig, "retained-legacy"),
    env,
  });
  const second = await onRequestDelete({
    request: await makeStaffRequest(env, "DELETE", sig, "prefix-only"),
    env,
  });
  assert(first.status === 200 && second.status === 200, "legacy and prefix-only entries can be removed from the active manifest");
  assert(bucket.deletes.length === 0, "cleanup never infers deletion safety from a fallback or prefix-matching key");
}

// Explicit deletion of an exact current canonical object remains supported,
// and also commits the tombstone before touching R2.
{
  const sig = "play/delete-canonical";
  const objectKey = canonicalClipKey("delete-canonical");
  const { env, bucket, events } = makeEnvironment({
    [teamManifestKey(sig)]: JSON.stringify([entry("delete-canonical", objectKey)]),
  });
  const response = await onRequestDelete({
    request: await makeStaffRequest(env, "DELETE", sig, "delete-canonical"),
    env,
  });
  assert(response.status === 200, "explicit deletion of an exact canonical entry succeeds");
  assert(JSON.stringify(bucket.deletes) === JSON.stringify([objectKey]), "explicit deletion only removes the exact canonical R2 object");
  assert(events.findIndex((event) => event.type === "manifest") < events.findIndex((event) => event.type === "delete"), "deletion commits the manifest tombstone before cleanup");
}

// Malformed historic data can contain a duplicate object reference. It is not
// safe to reclaim a candidate while the newly committed manifest still uses
// that same key.
{
  const sig = "play/retain-shared-object";
  const objectKey = canonicalClipKey("shared-object");
  const { env, bucket } = makeEnvironment({
    [teamManifestKey(sig)]: JSON.stringify([
      entry("shared-object", objectKey),
      entry("secondary-reference", objectKey),
    ]),
  });
  const response = await onRequestDelete({
    request: await makeStaffRequest(env, "DELETE", sig, "shared-object"),
    env,
  });
  assert(response.status === 200, "deletion with a duplicate active reference succeeds");
  assert(bucket.deletes.length === 0, "cleanup retains a canonical object still referenced by the committed manifest");
}

if (failed) {
  console.error(`\n${failed} clip retention assertion${failed === 1 ? "" : "s"} failed.`);
  process.exitCode = 1;
} else {
  console.log(`\n${passed} clip retention assertions passed.`);
}
