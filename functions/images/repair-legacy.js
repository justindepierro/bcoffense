// Admin-only, explicit repair for a canonical diagram that was mapped to the
// wrong archived object by an earlier migration. The old version stays in R2;
// this creates a new immutable version and atomically repoints its manifest.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";
import { imageVersionedR2Key, readImageManifest, sha256Hex, writeImageManifest } from "../_lib/image-media.js";

const MAX_MEDIA_ID_LENGTH = 512;
const MAX_LEGACY_KEY_LENGTH = 1000;

function clean(value, max) { return String(value || "").trim().slice(0, max); }

export async function onRequestPost(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || session.role !== "admin") {
    return authJson({ ok: false, error: "Only an admin may repair a diagram mapping." }, { status: 403 });
  }
  const bucket = context.env?.CLIPS;
  if (!bucket) return authJson({ ok: false, error: "Image storage is not configured." }, { status: 503 });

  let body = null;
  try { body = await context.request.json(); } catch (_err) { body = null; }
  const mediaId = clean(body?.mediaId, MAX_MEDIA_ID_LENGTH);
  const legacyKey = clean(body?.legacyKey, MAX_LEGACY_KEY_LENGTH);
  const expectedCurrentChecksum = clean(body?.expectedCurrentChecksum, 128);
  const expectedLegacyChecksum = clean(body?.expectedLegacyChecksum, 128);
  if (!mediaId || !legacyKey || !expectedCurrentChecksum || !expectedLegacyChecksum || legacyKey.startsWith("/") || legacyKey.includes("..")) {
    return authJson({ ok: false, error: "A media ID, archived key, and both verified checksums are required." }, { status: 400 });
  }

  try {
    const current = await readImageManifest(context.env, mediaId);
    if (!current || current.checksum !== expectedCurrentChecksum) {
      return authJson({ ok: false, error: "The canonical diagram changed; rerun reconciliation before repairing." }, { status: 409 });
    }
    const source = await bucket.get(`images/${legacyKey}`);
    if (!source?.body) return authJson({ ok: false, error: "The archived diagram was not found." }, { status: 404 });
    const bytes = await source.arrayBuffer();
    const checksum = await sha256Hex(bytes);
    if (checksum !== expectedLegacyChecksum) {
      return authJson({ ok: false, error: "The archived diagram changed; rerun reconciliation before repairing." }, { status: 409 });
    }
    const version = crypto.randomUUID();
    const contentType = source.httpMetadata?.contentType || "image/jpeg";
    const uploadedAt = new Date().toISOString();
    const r2key = imageVersionedR2Key(mediaId, version);
    const saved = await bucket.put(r2key, bytes, {
      httpMetadata: { contentType },
      customMetadata: { mediaId, version, checksum, repairedFrom: `images/${legacyKey}` },
    });
    await writeImageManifest(context.env, mediaId, {
      version,
      r2key,
      size: saved?.size || bytes.byteLength,
      contentType,
      checksum,
      uploadedAt,
      uploadedBy: `${session.username}:legacy-repair`,
    });
    return authJson({ ok: true, mediaId, version, size: saved?.size || bytes.byteLength, repairedFrom: legacyKey });
  } catch (_err) {
    return authJson({ ok: false, error: "Diagram mapping could not be repaired." }, { status: 502 });
  }
}
