// Cloud-canonical diagram binary route. New uploads create a versioned R2
// object and atomically switch the current manifest after the object exists.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";
import {
  deleteImageManifest,
  imageVersionedR2Key,
  publicImageManifest,
  resolveImageManifest,
  sha256Hex,
  writeImageManifest,
} from "../_lib/image-media.js";

const MAX_SIG_LENGTH = 512;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function readSig(request) {
  return (new URL(request.url).searchParams.get("sig") || "").trim();
}

function validSig(sig) { return Boolean(sig) && sig.length <= MAX_SIG_LENGTH; }

async function requireCoach(request, env) {
  const session = await getSessionFromRequest(request, env);
  return session && (session.role === "admin" || session.role === "coach") ? session : null;
}

export async function onRequestGet(context) {
  const bucket = context.env && context.env.CLIPS;
  if (!bucket) return authJson({ ok: false, error: "Image storage is not configured." }, { status: 503 });
  const sig = readSig(context.request);
  if (!validSig(sig)) return authJson({ ok: false, error: "A valid play media ID is required." }, { status: 400 });
  try {
    const resolved = await resolveImageManifest(context.env, bucket, sig);
    if (!resolved.manifest) return new Response(null, { status: 404 });
    const object = await bucket.get(resolved.manifest.r2key);
    if (!object?.body) return new Response(null, { status: 404 });
    return new Response(object.body, {
      status: 200,
      headers: {
        "Content-Type": resolved.manifest.contentType || object.httpMetadata?.contentType || "image/jpeg",
        "Content-Length": String(object.size),
        "Cache-Control": "private, no-store",
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
  const session = await requireCoach(context.request, context.env);
  if (!session) return authJson({ ok: false, error: "Only coaches may upload images." }, { status: 403 });
  const sig = readSig(context.request);
  if (!validSig(sig)) return authJson({ ok: false, error: "A valid play media ID is required." }, { status: 400 });
  const contentType = (context.request.headers.get("Content-Type") || "").split(";")[0].trim();
  if (!ALLOWED_TYPES.has(contentType)) return authJson({ ok: false, error: "Unsupported image type. Use JPEG, PNG, or WebP." }, { status: 415 });
  const body = await context.request.arrayBuffer();
  if (!body.byteLength) return authJson({ ok: false, error: "Empty image body." }, { status: 400 });
  if (body.byteLength > MAX_IMAGE_BYTES) return authJson({ ok: false, error: "Image exceeds 8 MB limit." }, { status: 413 });

  const checksum = await sha256Hex(body);
  const idempotencyKey = (context.request.headers.get("X-BC-Idempotency-Key") || "").trim();
  if (idempotencyKey && idempotencyKey !== checksum) {
    return authJson({ ok: false, error: "Diagram upload checksum did not match its idempotency key." }, { status: 400 });
  }
  const existing = await resolveImageManifest(context.env, bucket, sig);
  if (!existing.legacy && existing.manifest?.checksum === checksum) {
    return authJson(publicImageManifest(sig, existing.manifest, { idempotent: true }));
  }

  const version = crypto.randomUUID();
  const r2key = imageVersionedR2Key(sig, version);
  const uploadedAt = new Date().toISOString();
  const object = await bucket.put(r2key, body, {
    httpMetadata: { contentType },
    customMetadata: { mediaId: sig, version, checksum },
  });
  const manifest = {
    version,
    r2key,
    size: object?.size || body.byteLength,
    contentType,
    checksum,
    uploadedAt,
    uploadedBy: session.username,
  };
  try {
    await writeImageManifest(context.env, sig, manifest);
  } catch (_err) {
    return authJson({ ok: false, error: "Diagram saved but its cloud manifest could not be updated. Retry safely." }, { status: 502 });
  }
  return authJson(publicImageManifest(sig, manifest));
}

export async function onRequestDelete(context) {
  const bucket = context.env && context.env.CLIPS;
  if (!bucket) return authJson({ ok: false, error: "Image storage is not configured." }, { status: 503 });
  const session = await requireCoach(context.request, context.env);
  if (!session) return authJson({ ok: false, error: "Only coaches may delete images." }, { status: 403 });
  const sig = readSig(context.request);
  if (!validSig(sig)) return authJson({ ok: false, error: "A valid play media ID is required." }, { status: 400 });
  const resolved = await resolveImageManifest(context.env, bucket, sig);
  if (resolved.manifest && !resolved.legacy) await bucket.delete(resolved.manifest.r2key);
  await deleteImageManifest(context.env, sig);
  return authJson({ ok: true });
}
