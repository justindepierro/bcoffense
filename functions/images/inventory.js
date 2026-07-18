// functions/images/inventory.js — Staff-only read-only diagram inventory.
//
// This endpoint is deliberately diagnostic: it lists metadata for diagram
// objects under the R2 `images/` prefix so coaches can audit canonical and
// legacy uploads without exposing object data or keys to player sessions.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";

const PREFIX = "images/";
const PAGE_SIZE = 1000;
const MAX_OBJECTS = 5000;

function classifyObjectKey(key) {
  const sig = String(key || "").slice(PREFIX.length);
  if (sig.startsWith("play:")) return "canonical";
  if (sig.includes("|")) return "legacy-content";
  return "legacy-signature";
}

function publicObject(object) {
  const key = String(object?.key || "");
  return {
    key,
    kind: classifyObjectKey(key),
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
  let cursor;
  let truncated = false;
  try {
    do {
      const page = await bucket.list({
        prefix: PREFIX,
        cursor,
        limit: Math.min(PAGE_SIZE, MAX_OBJECTS - objects.length),
        include: ["httpMetadata"],
      });
      objects.push(...(Array.isArray(page.objects) ? page.objects : []));
      cursor = page.cursor;
      truncated = Boolean(page.truncated);
    } while (truncated && objects.length < MAX_OBJECTS);
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
    "legacy-content": 0,
    "legacy-signature": 0,
  });

  return authJson({
    ok: true,
    prefix: PREFIX,
    generatedAt: new Date().toISOString(),
    counts,
    truncated,
    objects: entries,
  });
}
