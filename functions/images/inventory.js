// functions/images/inventory.js — Staff-only read-only diagram inventory.
//
// New objects live under an encoded team prefix. Historic global paths are
// recoverable only for the explicitly configured primary team; a second team
// must never discover another team's objects through a diagnostic endpoint.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";
import { getPrimaryTeamId, resolveSessionTeamId } from "../_lib/team-context.js";

const LEGACY_CANONICAL_PREFIX = "media/plays/";
const LEGACY_PREFIX = "images/";
const PAGE_SIZE = 1000;
const MAX_OBJECTS = 5000;

function teamDiagramPrefix(teamId) {
  return `media/teams/${encodeURIComponent(String(teamId || "").trim())}/plays/`;
}

function decodeComponent(value) {
  try { return decodeURIComponent(value); } catch (_err) { return ""; }
}

async function canInspectLegacyForTeam(env, teamId) {
  const primaryTeamId = await getPrimaryTeamId(env);
  return Boolean(primaryTeamId && String(primaryTeamId) === String(teamId));
}

function classifyObjectKey(key, canonicalPrefix) {
  const value = String(key || "");
  if (value.startsWith(canonicalPrefix)) return "canonical";
  if (value.startsWith(LEGACY_CANONICAL_PREFIX)) return "legacy-canonical-key";
  const sig = value.slice(LEGACY_PREFIX.length);
  if (sig.startsWith("play:")) return "legacy-canonical-key";
  if (sig.includes("|")) return "legacy-content";
  return "legacy-signature";
}

function mediaIdForObjectKey(key, canonicalPrefix) {
  const value = String(key || "");
  if (!value.startsWith(canonicalPrefix)) return "";
  const [encodedMediaId, kind] = value.slice(canonicalPrefix.length).split("/");
  if (!encodedMediaId || kind !== "diagram") return "";
  return decodeComponent(encodedMediaId) || encodedMediaId;
}

function publicObject(object, canonicalPrefix) {
  const key = String(object?.key || "");
  return {
    key,
    kind: classifyObjectKey(key, canonicalPrefix),
    mediaId: mediaIdForObjectKey(key, canonicalPrefix),
    size: Number(object?.size || 0),
    contentType: object?.httpMetadata?.contentType || "image/jpeg",
    uploadedAt: object?.uploaded ? new Date(object.uploaded).toISOString() : "",
  };
}

async function listObjects(bucket, prefixes) {
  const objects = [];
  let truncated = false;
  for (const prefix of prefixes) {
    let cursor;
    do {
      const remaining = MAX_OBJECTS - objects.length;
      if (remaining <= 0) return { objects, truncated: true };
      const page = await bucket.list({
        prefix,
        cursor,
        limit: Math.min(PAGE_SIZE, remaining),
        include: ["httpMetadata", "customMetadata"],
      });
      objects.push(...(Array.isArray(page.objects) ? page.objects : []));
      cursor = page.truncated ? page.cursor : undefined;
      if (page.truncated && !cursor) truncated = true;
    } while (cursor && objects.length < MAX_OBJECTS);
    if (objects.length >= MAX_OBJECTS) return { objects, truncated: true };
  }
  return { objects, truncated };
}

export async function onRequestGet(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || (session.role !== "admin" && session.role !== "coach")) {
    return authJson({ ok: false, error: "Only coaches may inspect cloud diagram inventory." }, { status: 403 });
  }
  const teamId = await resolveSessionTeamId(session, context.env);
  if (!teamId) {
    return authJson({ ok: false, error: "Team access is not configured for this account." }, { status: 503 });
  }

  const bucket = context.env && context.env.CLIPS;
  if (!bucket) {
    return authJson({ ok: false, error: "Image storage is not configured." }, { status: 503 });
  }

  try {
    const canonicalPrefix = teamDiagramPrefix(teamId);
    const includeLegacy = await canInspectLegacyForTeam(context.env, teamId);
    const prefixes = [
      canonicalPrefix,
      ...(includeLegacy ? [LEGACY_CANONICAL_PREFIX, LEGACY_PREFIX] : []),
    ];
    const listed = await listObjects(bucket, prefixes);
    const entries = listed.objects.map((object) => publicObject(object, canonicalPrefix));
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
      prefixes,
      generatedAt: new Date().toISOString(),
      scope: { legacyIncluded: includeLegacy },
      counts,
      truncated: listed.truncated,
      objects: entries,
    });
  } catch (_err) {
    return authJson({ ok: false, error: "Cloud diagram inventory could not be read." }, { status: 502 });
  }
}
