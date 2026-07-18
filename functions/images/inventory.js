// functions/images/inventory.js — Staff-only read-only diagram inventory.
//
// This endpoint is deliberately diagnostic: it lists metadata for diagram
// objects under both the canonical `media/plays/` and legacy `images/` prefixes
// so coaches can audit migration progress without exposing object data or keys
// to player sessions.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";

const CANONICAL_PREFIX = "media/plays/";
const LEGACY_PREFIX = "images/";
const PAGE_SIZE = 1000;
const MAX_OBJECTS = 5000;

function classifyObjectKey(key) {
  const value = String(key || "");
  if (value.startsWith(CANONICAL_PREFIX)) return "canonical";
  const sig = value.slice(LEGACY_PREFIX.length);
  if (sig.startsWith("play:")) return "legacy-canonical-key";
  if (sig.includes("|")) return "legacy-content";
  return "legacy-signature";
}

function mediaIdForObjectKey(key) {
  const value = String(key || "");
  if (!value.startsWith(CANONICAL_PREFIX)) return "";
  const [encodedMediaId, kind] = value.slice(CANONICAL_PREFIX.length).split("/");
  if (!encodedMediaId || kind !== "diagram") return "";
  try {
    return decodeURIComponent(encodedMediaId);
  } catch (_err) {
    return encodedMediaId;
  }
}

function publicObject(object) {
  const key = String(object?.key || "");
  return {
    key,
    kind: classifyObjectKey(key),
    mediaId: mediaIdForObjectKey(key),
    size: Number(object?.size || 0),
    contentType: object?.httpMetadata?.contentType || "image/jpeg",
    uploadedAt: object?.uploaded ? new Date(object.uploaded).toISOString() : "",
  };
}

export async function onRequestGet(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || (session.role !== "admin" && session.role !== "coach")) {
    return authJson({ ok: false, error: "Only coaches may inspect cloud diagram inventory." }, { status: 403 });
  }

  const bucket = context.env && context.env.CLIPS;
  if (!bucket) {
    return authJson({ ok: false, error: "Image storage is not configured." }, { status: 503 });
  }

  const objects = [];
  let truncated = false;
  try {
    for (const prefix of [CANONICAL_PREFIX, LEGACY_PREFIX]) {
      let cursor;
      let prefixTruncated = false;
      do {
        const page = await bucket.list({
          prefix,
          cursor,
          limit: Math.min(PAGE_SIZE, MAX_OBJECTS - objects.length),
          include: ["httpMetadata"],
        });
        objects.push(...(Array.isArray(page.objects) ? page.objects : []));
        cursor = page.cursor;
        prefixTruncated = Boolean(page.truncated);
      } while (prefixTruncated && objects.length < MAX_OBJECTS);
      truncated = truncated || prefixTruncated;
      if (objects.length >= MAX_OBJECTS) {
        truncated = true;
        break;
      }
    }
  } catch (_err) {
    return authJson({ ok: false, error: "Cloud diagram inventory could not be read." }, { status: 502 });
  }

  const entries = objects.map(publicObject);
  const counts = entries.reduce((summary, entry) => {
    summary[entry.kind] = (summary[entry.kind] || 0) + 1;
    summary.totalBytes += entry.size;
    return summary;
  }, {
    total: entries.length,
    totalBytes: 0,
    canonical: 0,
    "legacy-canonical-key": 0,
    "legacy-content": 0,
    "legacy-signature": 0,
  });

  return authJson({
    ok: true,
    prefixes: [CANONICAL_PREFIX, LEGACY_PREFIX],
    generatedAt: new Date().toISOString(),
    counts,
    truncated,
    objects: entries,
  });
}
