// Cloud-canonical diagram binary route. New uploads create a versioned R2
// object and atomically switch the current manifest after the object exists.

import { authJson } from "../_lib/auth.js";
import {
  deleteImageManifest,
  imageVersionedR2Key,
  publicImageManifest,
  resolveImageManifest,
  sha256Hex,
  validateImagePayload,
  writeImageManifest,
} from "../_lib/image-media.js";
import { getMediaAccess, getStaffWriteAccess } from "../_lib/media-access.js";

const MAX_SIG_LENGTH = 512;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
function readSig(request) {
  return (new URL(request.url).searchParams.get("sig") || "").trim();
}

function validSig(sig) { return Boolean(sig) && sig.length <= MAX_SIG_LENGTH; }

// The immutable object must be readable from the same R2 binding before D1
// advances the player-facing pointer. A failed verification leaves the prior
// approved manifest untouched; the durable browser outbox can retry safely.
async function verifyStoredDiagram(bucket, r2key, expected = {}) {
  const object = await bucket.head(r2key);
  if (!object) return false;
  const metadata = object.customMetadata || {};
  return Number(object.size || 0) === Number(expected.size || 0)
    && String(metadata.teamId || "") === String(expected.teamId || "")
    && String(metadata.mediaId || "") === String(expected.mediaId || "")
    && String(metadata.version || "") === String(expected.version || "")
    && String(metadata.checksum || "").toLowerCase() === String(expected.checksum || "").toLowerCase();
}

export async function onRequestGet(context) {
  const bucket = context.env && context.env.CLIPS;
  if (!bucket) return authJson({ ok: false, error: "Image storage is not configured." }, { status: 503 });
  const sig = readSig(context.request);
  if (!validSig(sig)) return authJson({ ok: false, error: "A valid play media ID is required." }, { status: 400 });
  const access = await getMediaAccess(context.request, context.env, "diagram", sig);
  if (!access.ok) return authJson({ ok: false, error: access.error }, { status: access.status });
  try {
    const resolved = await resolveImageManifest(context.env, bucket, access.teamId, sig);
    if (!resolved.manifest) return new Response(null, { status: 404 });
    const object = await bucket.get(resolved.manifest.r2key);
    if (!object?.body) return new Response(null, { status: 404 });
    return new Response(object.body, {
      status: 200,
      headers: {
        // The D1 pointer was checksum- and type-verified before it became
        // active. Never trust historic R2 httpMetadata at response time.
        "Content-Type": resolved.manifest.contentType,
        "Content-Length": String(object.size),
        "Cache-Control": "private, no-store",
        "Vary": "Cookie",
        "ETag": object.httpEtag || `\"${resolved.manifest.version}\"`,
        "X-BC-Media-Version": resolved.manifest.version,
      },
    });
  } catch (_err) {
    return authJson({ ok: false, error: "Diagram could not be loaded." }, { status: 502 });
  }
}

export async function onRequestPut(context) {
  const bucket = context.env && context.env.CLIPS;
  if (!bucket) return authJson({ ok: false, error: "Image storage is not configured." }, { status: 503 });
  const access = await getStaffWriteAccess(context.request, context.env);
  if (!access.ok) return authJson({ ok: false, error: access.error }, { status: access.status });
  const sig = readSig(context.request);
  if (!validSig(sig)) return authJson({ ok: false, error: "A valid play media ID is required." }, { status: 400 });
  const declaredContentType = context.request.headers.get("Content-Type") || "";
  const body = await context.request.arrayBuffer();
  if (!body.byteLength) return authJson({ ok: false, error: "Empty image body." }, { status: 400 });
  if (body.byteLength > MAX_IMAGE_BYTES) return authJson({ ok: false, error: "Image exceeds 8 MB limit." }, { status: 413 });
  const validatedImage = validateImagePayload(body, declaredContentType);
  if (!validatedImage.ok) return authJson({ ok: false, error: validatedImage.error }, { status: 415 });
  const contentType = validatedImage.contentType;

  const checksum = await sha256Hex(body);
  const idempotencyKey = (context.request.headers.get("X-BC-Idempotency-Key") || "").trim();
  if (idempotencyKey && idempotencyKey !== checksum) {
    return authJson({ ok: false, error: "Diagram upload checksum did not match its idempotency key." }, { status: 400 });
  }
  const existing = await resolveImageManifest(context.env, bucket, access.teamId, sig);
  if (existing.manifest?.checksum === checksum) {
    return authJson(publicImageManifest(sig, existing.manifest, { idempotent: true }));
  }
  const expectedHeader = context.request.headers.get("X-BC-Expected-Version");
  const expectedVersion = existing.manifest?.version || "";
  // A client that already knows a version can be rejected before we create an
  // immutable candidate object. Older clients still receive safe server-side
  // compare-and-swap using the version observed in this request.
  if (expectedHeader !== null && String(expectedHeader).trim() !== expectedVersion) {
    return authJson({
      ok: false,
      error: "This diagram changed on another device. Refresh it before replacing it.",
      current: publicImageManifest(sig, existing.manifest),
    }, { status: 409 });
  }

  const version = crypto.randomUUID();
  const r2key = imageVersionedR2Key(access.teamId, sig, version);
  const uploadedAt = new Date().toISOString();
  const object = await bucket.put(r2key, body, {
    httpMetadata: { contentType },
    customMetadata: { teamId: access.teamId, mediaId: sig, version, checksum },
  });
  const stored = await verifyStoredDiagram(bucket, r2key, {
    size: object?.size || body.byteLength,
    teamId: access.teamId,
    mediaId: sig,
    version,
    checksum,
  }).catch(() => false);
  if (!stored) {
    return authJson({
      ok: false,
      error: "Diagram upload could not be verified yet. The previous approved diagram remains active; retry safely.",
    }, { status: 502 });
  }
  const manifest = {
    version,
    r2key,
    size: object?.size || body.byteLength,
    contentType,
    checksum,
    uploadedAt,
    uploadedBy: access.session.username,
  };
  try {
    const commit = await writeImageManifest(context.env, access.teamId, sig, manifest, { expectedVersion });
    if (!commit.committed) {
      const current = await resolveImageManifest(context.env, bucket, access.teamId, sig);
      return authJson({
        ok: false,
        error: "This diagram changed on another device. Refresh it before replacing it.",
        current: publicImageManifest(sig, current.manifest),
      }, { status: 409 });
    }
  } catch (_err) {
    return authJson({ ok: false, error: "Diagram saved but its cloud manifest could not be updated. Retry safely." }, { status: 502 });
  }
  return authJson(publicImageManifest(sig, manifest));
}

export async function onRequestDelete(context) {
  if (!context.env?.CLIPS) return authJson({ ok: false, error: "Image storage is not configured." }, { status: 503 });
  const access = await getStaffWriteAccess(context.request, context.env);
  if (!access.ok) return authJson({ ok: false, error: access.error }, { status: access.status });
  const sig = readSig(context.request);
  if (!validSig(sig)) return authJson({ ok: false, error: "A valid play media ID is required." }, { status: 400 });
  const bucket = context.env.CLIPS;
  const current = await resolveImageManifest(context.env, bucket, access.teamId, sig);
  if (!current.manifest) {
    return authJson({ ok: true, sig, published: false, idempotent: true });
  }
  const expectedHeader = context.request.headers.get("X-BC-Expected-Version");
  if (expectedHeader === null || String(expectedHeader).trim() !== current.manifest.version) {
    return authJson({
      ok: false,
      error: "This diagram changed on another device. Refresh it before removing it.",
      current: publicImageManifest(sig, current.manifest),
    }, { status: 409 });
  }
  // Remove only the public pointer. The immutable R2 version stays available
  // to admin recovery/audit tooling until an explicit retention cleanup; a
  // diagram delete must never erase the last known-good binary inline.
  const removed = await deleteImageManifest(context.env, access.teamId, sig, {
    expectedVersion: current.manifest.version,
  });
  if (!removed.committed) {
    const latest = await resolveImageManifest(context.env, bucket, access.teamId, sig);
    // Another delete already reached the desired final state. Treat it as an
    // idempotent success rather than forcing the coach through a conflict UI.
    if (!latest.manifest) return authJson({ ok: true, sig, published: false, idempotent: true });
    return authJson({
      ok: false,
      error: "This diagram changed on another device. Refresh it before removing it.",
      current: publicImageManifest(sig, latest.manifest),
    }, { status: 409 });
  }
  return authJson({ ok: true, sig, published: false, deletedVersion: current.manifest.version });
}
