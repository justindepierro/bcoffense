import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createSessionCookie } from "../functions/_lib/auth.js";
import { imageVersionedR2Key, sha256Hex } from "../functions/_lib/image-media.js";
import { onRequestPost as batchManifest } from "../functions/images/batch-manifest.js";
import { onRequestGet as getDiagramFile, onRequestPut as putDiagramFile } from "../functions/images/file.js";
import { onRequestGet as getDiagramManifest } from "../functions/images/manifest.js";

const TEAM_ID = "team-a";
const MEDIA_ID = "play:diagram-cloud-availability";
const VERSION = "diagram-version-1";
// The route verifies image magic bytes, so this compact PNG header is enough
// to exercise the immutable-object safety path without a fixture binary.
const ORIGINAL_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DIFFERENT_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x52, 0x45, 0x50, 0x4c,
]);
const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

function cloneBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  throw new Error("Expected ArrayBuffer-compatible diagram bytes.");
}

function makeBucket() {
  const objects = new Map();
  const calls = { head: [], get: [], put: [] };
  return {
    calls,
    remove(key) { objects.delete(key); },
    async head(key) {
      calls.head.push(key);
      const entry = objects.get(key);
      if (!entry) return null;
      return {
        size: entry.bytes.byteLength,
        httpMetadata: { ...entry.httpMetadata },
        customMetadata: { ...entry.customMetadata },
      };
    },
    async get(key) {
      calls.get.push(key);
      const entry = objects.get(key);
      if (!entry) return null;
      return {
        body: new Response(entry.bytes).body,
        size: entry.bytes.byteLength,
        httpEtag: "\"diagram-test-etag\"",
      };
    },
    async put(key, value, options = {}) {
      const bytes = cloneBytes(value);
      calls.put.push({ key, bytes, options });
      objects.set(key, {
        bytes,
        httpMetadata: { ...(options.httpMetadata || {}) },
        customMetadata: { ...(options.customMetadata || {}) },
      });
      return { key, size: bytes.byteLength };
    },
  };
}

async function makeFixture() {
  const checksum = await sha256Hex(ORIGINAL_BYTES);
  const manifest = {
    version: VERSION,
    r2_key: imageVersionedR2Key(TEAM_ID, MEDIA_ID, VERSION),
    size: ORIGINAL_BYTES.byteLength,
    content_type: "image/png",
    checksum,
    uploaded_at: "2026-08-14T12:00:00.000Z",
    uploaded_by: "admin",
  };
  let writes = 0;
  const env = {
    AUTH_SESSION_SECRET: "diagram-cloud-availability-test-secret",
    AUTH_PRIMARY_TEAM_ID: TEAM_ID,
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async first() { return { ...manifest }; },
              async all() { return { results: [] }; },
              async run() {
                writes += 1;
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
    CLIPS: makeBucket(),
  };
  const cookie = await createSessionCookie({
    username: "admin",
    role: "admin",
    label: "Admin",
  }, env);
  const request = (path, options = {}) => new Request(`https://bcoffense.test${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Cookie: cookie.split(";", 1)[0],
      ...(options.headers || {}),
    },
  });
  return {
    env,
    manifest,
    request,
    get writes() { return writes; },
  };
}

async function putRequest(fixture, bytes, options = {}) {
  const checksum = await sha256Hex(bytes);
  return fixture.request(`/images/file?sig=${encodeURIComponent(MEDIA_ID)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "image/png",
      "X-BC-Idempotency-Key": checksum,
      "X-BC-Expected-Version": VERSION,
      ...(options.recoveryOnly ? { "X-BC-Recovery-Upload": "1" } : {}),
    },
    body: bytes,
  });
}

console.log("\n▸ Diagram cloud availability and repair");

const fixture = await makeFixture();

const manifestBefore = await getDiagramManifest({
  request: fixture.request(`/images/manifest?sig=${encodeURIComponent(MEDIA_ID)}`),
  env: fixture.env,
});
assert.equal(manifestBefore.status, 200, "a dangling manifest remains a readable team-scoped record");
assert.deepEqual(
  await manifestBefore.json(),
  {
    ok: true,
    sig: MEDIA_ID,
    published: true,
    available: false,
    version: VERSION,
    size: ORIGINAL_BYTES.byteLength,
    contentType: "image/png",
    checksum: fixture.manifest.checksum,
    uploadedAt: fixture.manifest.uploaded_at,
    uploadedBy: fixture.manifest.uploaded_by,
    legacy: false,
    idempotent: false,
    recovered: false,
  },
  "the single manifest endpoint never labels a missing R2 object usable",
);

const batchBefore = await batchManifest({
  request: fixture.request("/images/batch-manifest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sigs: [MEDIA_ID] }),
  }),
  env: fixture.env,
});
const batchPayload = await batchBefore.json();
assert.equal(batchPayload.manifests[MEDIA_ID].published, true, "the batch endpoint retains the published pointer state");
assert.equal(batchPayload.manifests[MEDIA_ID].available, false, "the batch endpoint also exposes the missing binary truthfully");

const fileBefore = await getDiagramFile({
  request: fixture.request(`/images/file?sig=${encodeURIComponent(MEDIA_ID)}`),
  env: fixture.env,
});
assert.equal(fileBefore.status, 404, "the binary endpoint refuses a dangling pointer instead of serving an empty success");
assert.match((await fileBefore.json()).error, /restore it from Recovery Upload/i, "the missing binary response is actionable");

const restored = await putDiagramFile({
  request: await putRequest(fixture, ORIGINAL_BYTES, { recoveryOnly: true }),
  env: fixture.env,
});
const restoredPayload = await restored.json();
assert.equal(restored.status, 200, "the exact checked-in immutable bytes can repair a missing R2 object");
assert.equal(restoredPayload.idempotent, true, "repair retains the original immutable manifest identity");
assert.equal(restoredPayload.recovered, true, "repair receipt distinguishes restored bytes from a normal replacement");
assert.equal(restoredPayload.available, true, "repair receipt is usable only after R2 HEAD verification");
assert.equal(fixture.env.CLIPS.calls.put.length, 1, "repair writes exactly one object");
assert.equal(fixture.env.CLIPS.calls.put[0].key, fixture.manifest.r2_key, "repair writes only the exact manifest-owned immutable key");
assert.equal(fixture.writes, 0, "repair does not advance or rewrite the D1 manifest pointer");

const fileAfter = await getDiagramFile({
  request: fixture.request(`/images/file?sig=${encodeURIComponent(MEDIA_ID)}`),
  env: fixture.env,
});
assert.equal(fileAfter.status, 200, "the restored binary is available through the same authenticated file route");
assert.deepEqual(
  [...new Uint8Array(await fileAfter.arrayBuffer())],
  [...ORIGINAL_BYTES],
  "the file route serves the exact repaired bytes",
);

fixture.env.CLIPS.remove(fixture.manifest.r2_key);
const putsBeforeMismatch = fixture.env.CLIPS.calls.put.length;
const mismatchedRecovery = await putDiagramFile({
  request: await putRequest(fixture, DIFFERENT_BYTES, { recoveryOnly: true }),
  env: fixture.env,
});
const mismatchPayload = await mismatchedRecovery.json();
assert.equal(mismatchedRecovery.status, 409, "a nonmatching local blob cannot enter the repair path");
assert.match(mismatchPayload.error, /restores exact matches only/i, "a mismatched recovery explains the explicit replacement boundary");
assert.equal(fixture.env.CLIPS.calls.put.length, putsBeforeMismatch, "a mismatched recovery cannot overwrite the missing immutable key");
assert.equal(fixture.writes, 0, "a mismatched recovery cannot advance the D1 pointer");

const [filters, images, gamePlanRender, playbookRender] = await Promise.all([
  source("js/playbook-filters.js"),
  source("js/play-images.js"),
  source("js/gameplan-render.js"),
  source("js/playbook-render.js"),
]);
assert.match(
  filters,
  /remote\?\.published && remote\?\.available !== false/,
  "study filters do not treat a dangling published pointer as a diagram",
);
assert.match(
  filters,
  /\["published", "unpublished", "unavailable"\]/,
  "an unavailable manifest is definitive for filter warm-up rather than retried as unknown",
);
assert.match(
  images,
  /function hasPublishedDiagramForPlay\(play\)[\s\S]*?remote\?\.available === false[\s\S]*?return false;/,
  "readiness scoring does not count unavailable remote media as published",
);
assert.match(
  images,
  /async function prefetchForPlays\(playList\)[\s\S]*?remote\?\.available === false[\s\S]*?result\.failed \+= 1[\s\S]*?return;/,
  "packet prefetch does not fetch or count an unavailable remote diagram as ready",
);
assert.match(
  gamePlanRender,
  /function _gpMediaStatusForPlay\(play\)[\s\S]*?remoteDiagram\?\.available !== false/,
  "Game Plan completion requires an available canonical diagram",
);
assert.match(
  playbookRender,
  /\["unpublished", "unavailable"\]\.includes\(remoteImage\?\.status\)[\s\S]*?_playbookKnownCloudDiagramMediaIds\.delete/,
  "Playbook cloud markers clear when the pointer is unavailable",
);

console.log("diagram cloud availability contract: dangling pointers, exact repair, and mismatch containment passed");
