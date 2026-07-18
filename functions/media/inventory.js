// functions/media/inventory.js — Staff-only complete Cloudflare media inventory.
//
// Unlike the diagram-only route, this reconciles every diagram object in R2
// with every persisted play/video and signal/video manifest in KV.  It is a
// diagnostic/recovery read: player sessions never receive object listings.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";

const R2_PAGE_SIZE = 1000;
const KV_PAGE_SIZE = 1000;
const MAX_OBJECTS = 5000;
const MAX_MANIFESTS = 5000;
const MANIFEST_READ_CONCURRENCY = 12;
const DIAGRAM_PREFIXES = ["media/plays/", "images/"];
const CLIP_PREFIX = "clips/";
const CLIP_MANIFEST_PREFIX = "clips:";

function isStaff(session) {
  return session && (session.role === "admin" || session.role === "coach");
}

function classifyDiagramKey(key) {
  const value = String(key || "");
  if (value.startsWith("media/plays/")) return "canonical";
  const sig = value.slice("images/".length);
  if (sig.startsWith("play:")) return "legacy-canonical-key";
  if (sig.includes("|")) return "legacy-content";
  return "legacy-signature";
}

function mediaIdForDiagramKey(key) {
  const value = String(key || "");
  if (!value.startsWith("media/plays/")) return "";
  const [encodedMediaId, kind] = value.slice("media/plays/".length).split("/");
  if (!encodedMediaId || kind !== "diagram") return "";
  try { return decodeURIComponent(encodedMediaId); } catch (_err) { return encodedMediaId; }
}

async function listR2(bucket, prefixes) {
  const objects = [];
  let truncated = false;
  for (const prefix of prefixes) {
    let cursor;
    do {
      const page = await bucket.list({
        prefix,
        cursor,
        limit: Math.min(R2_PAGE_SIZE, MAX_OBJECTS - objects.length),
        include: ["httpMetadata"],
      });
      objects.push(...(Array.isArray(page.objects) ? page.objects : []));
      cursor = page.cursor;
      truncated = truncated || Boolean(page.truncated);
    } while (cursor && objects.length < MAX_OBJECTS);
    if (objects.length >= MAX_OBJECTS) return { objects, truncated: true };
  }
  return { objects, truncated };
}

async function listManifestKeys(store) {
  const keys = [];
  let cursor;
  let truncated = false;
  do {
    const page = await store.list({ prefix: CLIP_MANIFEST_PREFIX, cursor, limit: KV_PAGE_SIZE });
    keys.push(...(Array.isArray(page.keys) ? page.keys : []));
    cursor = page.cursor;
    truncated = truncated || Boolean(page.list_complete === false);
  } while (cursor && keys.length < MAX_MANIFESTS);
  return { keys: keys.slice(0, MAX_MANIFESTS), truncated: truncated || keys.length >= MAX_MANIFESTS };
}

async function readManifests(store, keys) {
  const rows = [];
  let cursor = 0;
  async function worker() {
    while (cursor < keys.length) {
      const key = keys[cursor++];
      const sig = String(key?.name || "").slice(CLIP_MANIFEST_PREFIX.length);
      const value = await store.get(String(key?.name || ""), { type: "json" });
      const entries = Array.isArray(value) ? value : [];
      rows.push({
        sig,
        kind: sig.startsWith("signals/") ? "signal" : "play",
        clips: entries.map((entry) => ({
          id: String(entry?.id || ""),
          size: Number(entry?.size || 0),
          contentType: String(entry?.contentType || "video/mp4"),
          uploadedAt: String(entry?.uploadedAt || ""),
        })).filter((entry) => entry.id),
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(MANIFEST_READ_CONCURRENCY, Math.max(1, keys.length)) }, worker));
  return rows.sort((a, b) => a.sig.localeCompare(b.sig));
}

export async function onRequestGet(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!isStaff(session)) {
    return authJson({ ok: false, error: "Only coaches may inspect cloud media inventory." }, { status: 403 });
  }
  const bucket = context.env?.CLIPS;
  const store = context.env?.SYNC_KV;
  if (!bucket || !store) return authJson({ ok: false, error: "Cloud media storage is not configured." }, { status: 503 });

  try {
    const [diagramList, clipList, manifestList] = await Promise.all([
      listR2(bucket, DIAGRAM_PREFIXES),
      listR2(bucket, [CLIP_PREFIX]),
      listManifestKeys(store),
    ]);
    const manifests = await readManifests(store, manifestList.keys);
    const diagrams = diagramList.objects.map((object) => ({
      key: String(object.key || ""), kind: classifyDiagramKey(object.key), mediaId: mediaIdForDiagramKey(object.key),
      size: Number(object.size || 0), contentType: object.httpMetadata?.contentType || "image/jpeg",
      uploadedAt: object.uploaded ? new Date(object.uploaded).toISOString() : "",
    }));
    const diagramCounts = diagrams.reduce((counts, item) => {
      counts.total += 1; counts.totalBytes += item.size; counts[item.kind] = (counts[item.kind] || 0) + 1; return counts;
    }, { total: 0, totalBytes: 0, canonical: 0, "legacy-canonical-key": 0, "legacy-content": 0, "legacy-signature": 0 });
    const referencedClipIds = new Set(manifests.flatMap((row) => row.clips.map((clip) => clip.id)));
    const clipObjects = clipList.objects.map((object) => ({ id: String(object.key || "").slice(CLIP_PREFIX.length), size: Number(object.size || 0) }));
    const clipCount = manifests.reduce((total, row) => total + row.clips.length, 0);
    return authJson({
      ok: true, generatedAt: new Date().toISOString(),
      diagrams: { objects: diagrams, counts: diagramCounts, truncated: diagramList.truncated },
      clips: {
        manifests,
        manifestCount: manifests.length,
        clipCount,
        playClipCount: manifests.filter((row) => row.kind === "play").reduce((total, row) => total + row.clips.length, 0),
        signalClipCount: manifests.filter((row) => row.kind === "signal").reduce((total, row) => total + row.clips.length, 0),
        r2ObjectCount: clipObjects.length,
        orphanObjectCount: clipObjects.filter((object) => !referencedClipIds.has(object.id)).length,
        totalBytes: clipObjects.reduce((total, object) => total + object.size, 0),
        truncated: clipList.truncated || manifestList.truncated,
      },
    });
  } catch (_err) {
    return authJson({ ok: false, error: "Cloud media inventory could not be read." }, { status: 502 });
  }
}
