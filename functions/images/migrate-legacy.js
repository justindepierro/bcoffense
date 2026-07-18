// Admin-only, non-destructive legacy diagram migration. Copies a verified
// `images/<legacyKey>` object into the canonical versioned path and writes a
// manifest for its permanent media ID. Legacy objects stay in place.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";
import { imageVersionedR2Key, readImageManifest, sha256Hex, writeImageManifest } from "../_lib/image-media.js";

const MAX_ITEMS = 100;
const MAX_MEDIA_ID_LENGTH = 512;
const MAX_LEGACY_KEYS = 12;

function clean(value, max) { return String(value || "").trim().slice(0, max); }

function validLegacyKey(value) {
  const key = clean(value, 1000);
  return Boolean(key) && !key.startsWith("/") && !key.includes("..") && !key.includes("\u0000");
}

async function bodyJson(request) {
  try { return await request.json(); } catch (_err) { return null; }
}

export async function onRequestPost(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || session.role !== "admin") {
    return authJson({ ok: false, error: "Only an admin may migrate legacy diagrams." }, { status: 403 });
  }
  const bucket = context.env?.CLIPS;
  if (!bucket) return authJson({ ok: false, error: "Image storage is not configured." }, { status: 503 });
  const body = await bodyJson(context.request);
  const requested = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : [];
  if (!requested.length) return authJson({ ok: false, error: "No legacy diagram mappings were provided." }, { status: 400 });

  const results = [];
  for (const item of requested) {
    const mediaId = clean(item?.mediaId, MAX_MEDIA_ID_LENGTH);
    const legacyKeys = [...new Set((Array.isArray(item?.legacyKeys) ? item.legacyKeys : [])
      .map((key) => clean(key, 1000)).filter(validLegacyKey))].slice(0, MAX_LEGACY_KEYS);
    if (!mediaId || !legacyKeys.length) {
      results.push({ mediaId, status: "invalid" });
      continue;
    }
    try {
      if (await readImageManifest(context.env, mediaId)) {
        results.push({ mediaId, status: "already-canonical" });
        continue;
      }
      let source = null;
      let sourceKey = "";
      for (const legacyKey of legacyKeys) {
        const object = await bucket.get(`images/${legacyKey}`);
        if (object?.body) { source = object; sourceKey = legacyKey; break; }
      }
      if (!source) {
        results.push({ mediaId, status: "legacy-not-found" });
        continue;
      }
      const bytes = await source.arrayBuffer();
      const checksum = await sha256Hex(bytes);
      const version = crypto.randomUUID();
      const contentType = source.httpMetadata?.contentType || "image/jpeg";
      const r2key = imageVersionedR2Key(mediaId, version);
      const uploadedAt = new Date().toISOString();
      const saved = await bucket.put(r2key, bytes, {
        httpMetadata: { contentType },
        customMetadata: { mediaId, version, checksum, migratedFrom: `images/${sourceKey}` },
      });
      await writeImageManifest(context.env, mediaId, {
        version, r2key, size: saved?.size || bytes.byteLength, contentType, checksum, uploadedAt,
        uploadedBy: `${session.username}:legacy-migration`,
      });
      results.push({ mediaId, status: "migrated", sourceKey });
    } catch (_err) {
      results.push({ mediaId, status: "failed" });
    }
  }
  const counts = results.reduce((summary, result) => {
    summary[result.status] = (summary[result.status] || 0) + 1;
    return summary;
  }, {});
  return authJson({ ok: true, results, counts });
}
