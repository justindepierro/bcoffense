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
  const objects = new Map();
  function copyObject(value) {
    if (!value) return null;
    return {
      key: value.key,
      size: value.size,
      httpMetadata: { ...(value.httpMetadata || {}) },
      customMetadata: { ...(value.customMetadata || {}) },
    };
  }
  const bucket = {
    puts: [],
    putAttempts: [],
    deletes: [],
    async put(key, value, opts = {}) {
      const size = value instanceof ArrayBuffer ? value.byteLength : Number(value?.byteLength || 0);
      this.putAttempts.push({ key, size, opts });
      if (opts?.onlyIf?.get?.("If-None-Match") === "*" && objects.has(key)) {
        events.push({ type: "put-precondition", key });
        return null;
      }
      const object = {
        key,
        size,
        httpMetadata: { ...(opts.httpMetadata || {}) },
        customMetadata: { ...(opts.customMetadata || {}) },
      };
      objects.set(key, object);
      this.puts.push({ key, size, opts });
      events.push({ type: "put", key });
      return copyObject(object);
    },
    async head(key) {
      return copyObject(objects.get(key));
    },
    // Test-only escape hatch for simulating a historic/manual R2 object whose
    // bytes may exist at a deterministic name but which lacks our immutable
    // retry receipt metadata.
    seedObject(key, value = {}) {
      objects.set(key, {
        key,
        size: Number(value.size || 0),
        httpMetadata: { ...(value.httpMetadata || {}) },
        customMetadata: { ...(value.customMetadata || {}) },
      });
    },
    async delete(key) {
      objects.delete(key);
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

async function makeStaffRequest(env, method, sig, id = "", opts = {}) {
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
    const body = opts.body || new Uint8Array([1, 2, 3, 4]);
    init.headers["Content-Type"] = "video/mp4";
    init.headers["Content-Length"] = String(body.byteLength);
    init.body = body;
    if (opts.idempotencyKey) init.headers["X-BC-Idempotency-Key"] = opts.idempotencyKey;
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

// A response can disappear after R2/KV committed the first upload. The retry
// must return the original clip, not append another one or fail against the
// normal three-clip cap.
{
  const sig = "play/idempotent-lost-response";
  const idempotencyKey = "clip-lost-response-retry-0001";
  const { env, kv, bucket } = makeEnvironment();
  const first = await onRequestPost({
    request: await makeStaffRequest(env, "POST", sig, "", { idempotencyKey }),
    env,
  });
  const firstPayload = await first.json();
  const retry = await onRequestPost({
    request: await makeStaffRequest(env, "POST", sig, "", { idempotencyKey }),
    env,
  });
  const retryPayload = await retry.json();
  const manifest = JSON.parse(kv.values.get(teamManifestKey(sig)));
  assert(first.status === 200 && firstPayload.ok, "initial idempotent clip upload succeeds");
  assert(retry.status === 200 && retryPayload.idempotent === true, "lost-response retry returns idempotent success");
  assert(retryPayload.clip.id === firstPayload.clip.id, "retry resolves the original immutable clip ID");
  assert(manifest.length === 1 && manifest[0].idempotencyKey === idempotencyKey, "retry key is committed once with the manifest entry");
  assert(bucket.puts.length === 1, "lost-response retry does not upload a second R2 object");
  assert(
    bucket.puts[0]?.opts?.onlyIf?.get?.("If-None-Match") === "*" &&
      bucket.puts[0]?.opts?.customMetadata?.teamId === TEAM_ID &&
      bucket.puts[0]?.opts?.customMetadata?.mediaSig === sig &&
      bucket.puts[0]?.opts?.customMetadata?.idempotencyKey === idempotencyKey &&
      /^[a-f0-9]{64}$/.test(bucket.puts[0]?.opts?.customMetadata?.checksum || ""),
    "idempotent objects carry scoped identity and byte-integrity metadata behind a conditional create",
  );
}

// Two tabs can flush the same durable upload job concurrently. Their shared
// retry key derives one scoped immutable ID, and their racing manifest writes
// still converge on one active entry.
{
  const sig = "play/idempotent-two-tabs";
  const idempotencyKey = "clip-two-tab-durable-job-0001";
  const { env, kv, bucket } = makeEnvironment();
  const [first, second] = await Promise.all([
    onRequestPost({ request: await makeStaffRequest(env, "POST", sig, "", { idempotencyKey }), env }),
    onRequestPost({ request: await makeStaffRequest(env, "POST", sig, "", { idempotencyKey }), env }),
  ]);
  const [firstPayload, secondPayload] = await Promise.all([first.json(), second.json()]);
  const manifest = JSON.parse(kv.values.get(teamManifestKey(sig)));
  assert(first.status === 200 && second.status === 200, "same durable job can be submitted by two tabs");
  assert(firstPayload.clip.id === secondPayload.clip.id, "two-tab retries derive the same immutable clip ID");
  assert(manifest.length === 1, "two-tab retries leave one active manifest entry");
  assert(new Set(bucket.puts.map((put) => put.key)).size === 1, "two-tab retries target one scoped R2 object key");
  assert(bucket.puts.length === 1 && bucket.putAttempts.length === 2, "two-tab retries create the immutable R2 object once and safely reject the competing write");
}

// A precondition collision must not turn a mismatched retry body into an
// overwrite. If the first request reached R2 but died before KV, only the
// exact bytes may later recover that missing manifest entry.
{
  const sig = "play/idempotent-r2-recovery";
  const idempotencyKey = "clip-r2-recovery-body-identity-01";
  const { env, kv, bucket } = makeEnvironment();
  const initial = await onRequestPost({
    request: await makeStaffRequest(env, "POST", sig, "", { idempotencyKey }),
    env,
  });
  const initialPayload = await initial.json();
  const manifestKey = teamManifestKey(sig);
  kv.values.delete(manifestKey);
  const writesBeforeMismatch = bucket.puts.length;
  const mismatch = await onRequestPost({
    request: await makeStaffRequest(env, "POST", sig, "", {
      idempotencyKey,
      body: new Uint8Array([9, 8, 7, 6]),
    }),
    env,
  });
  const mismatchPayload = await mismatch.json();
  assert(mismatch.status === 409 && /different clip data/i.test(mismatchPayload.error || ""), "mismatched bytes cannot reuse an existing retry object");
  assert(bucket.puts.length === writesBeforeMismatch && !kv.values.has(manifestKey), "mismatched recovery never overwrites R2 or publishes a manifest");

  const recovery = await onRequestPost({
    request: await makeStaffRequest(env, "POST", sig, "", { idempotencyKey }),
    env,
  });
  const recoveryPayload = await recovery.json();
  const recoveredManifest = JSON.parse(kv.values.get(manifestKey));
  assert(recovery.status === 200 && recoveryPayload.idempotent === true && recoveryPayload.recovered === true, "matching bytes safely recover the interrupted manifest commit");
  assert(recoveryPayload.clip?.id === initialPayload.clip?.id && recoveredManifest.length === 1, "recovery restores the original immutable clip identity exactly once");
  assert(bucket.puts.length === writesBeforeMismatch, "manifest recovery never writes a second R2 version");
}

// Historic or manually-created objects are not receipts. Even if one happens
// to sit at a deterministic retry key, it cannot be adopted into a missing
// manifest unless it carries the exact scoped identity and body metadata.
{
  const sig = "play/idempotent-legacy-object-is-not-receipt";
  const idempotencyKey = "clip-legacy-object-recovery-identity-01";
  const { env, kv, bucket } = makeEnvironment();
  await onRequestPost({
    request: await makeStaffRequest(env, "POST", sig, "", { idempotencyKey }),
    env,
  });
  const manifestKey = teamManifestKey(sig);
  const r2key = bucket.puts[0].key;
  kv.values.delete(manifestKey);
  bucket.seedObject(r2key, {
    size: 4,
    httpMetadata: { contentType: "video/mp4" },
    customMetadata: {},
  });
  const writesBeforeRetry = bucket.puts.length;
  const response = await onRequestPost({
    request: await makeStaffRequest(env, "POST", sig, "", { idempotencyKey }),
    env,
  });
  const payload = await response.json();
  assert(response.status === 409 && /different clip data/i.test(payload.error || ""), "unverified historic objects cannot satisfy a retry receipt");
  assert(bucket.puts.length === writesBeforeRetry && !kv.values.has(manifestKey), "unverified historic objects are never overwritten or recovered into a manifest");
}

// Once KV has committed, the replay body must still match the original
// receipt; a reused key cannot silently report success for different bytes.
{
  const sig = "play/idempotent-replay-body-mismatch";
  const idempotencyKey = "clip-replay-body-mismatch-identity-01";
  const { env, bucket } = makeEnvironment();
  await onRequestPost({
    request: await makeStaffRequest(env, "POST", sig, "", { idempotencyKey }),
    env,
  });
  const writesBeforeMismatch = bucket.puts.length;
  const response = await onRequestPost({
    request: await makeStaffRequest(env, "POST", sig, "", {
      idempotencyKey,
      body: new Uint8Array([9, 8, 7, 6]),
    }),
    env,
  });
  const payload = await response.json();
  assert(response.status === 409 && /different clip/i.test(payload.error || ""), "committed replay rejects a different body for the same retry identity");
  assert(bucket.puts.length === writesBeforeMismatch, "committed replay mismatch cannot overwrite the immutable object");
}

// The prior-entry check happens before the normal cap check, otherwise a
// successful upload with a lost response could appear to fail when it was the
// third clip for a play.
{
  const sig = "play/idempotent-at-cap";
  const idempotencyKey = "clip-at-cap-retry-identity-01";
  const { env, kv, bucket } = makeEnvironment();
  const initial = await onRequestPost({
    request: await makeStaffRequest(env, "POST", sig, "", { idempotencyKey }),
    env,
  });
  const initialPayload = await initial.json();
  const retried = JSON.parse(kv.values.get(teamManifestKey(sig)))[0];
  kv.values.set(teamManifestKey(sig), JSON.stringify([
    entry("first", canonicalClipKey("first")),
    entry("second", canonicalClipKey("second")),
    retried,
  ]));
  const writesBeforeRetry = bucket.puts.length;
  const response = await onRequestPost({
    request: await makeStaffRequest(env, "POST", sig, "", { idempotencyKey }),
    env,
  });
  const payload = await response.json();
  assert(response.status === 200 && payload.idempotent === true, "retry at the three-clip cap remains successful");
  assert(
    initialPayload.clip.id === retried.id && payload.clip?.id === retried.id && bucket.puts.length === writesBeforeRetry,
    "capped retry reuses the committed clip without another upload",
  );
}

{
  const sig = "play/invalid-idempotency-key";
  const { env, bucket } = makeEnvironment();
  const response = await onRequestPost({
    request: await makeStaffRequest(env, "POST", sig, "", { idempotencyKey: "too-short" }),
    env,
  });
  assert(response.status === 400, "malformed clip retry identities are rejected");
  assert(bucket.puts.length === 0, "malformed retry identities never create an R2 object");
}

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
