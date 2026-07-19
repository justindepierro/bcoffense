// Admin-only, non-destructive legacy diagram migration. Copies a verified
// exact `images/...` or `media/plays/...` object into the canonical versioned
// path and writes a manifest for its permanent media ID. Source objects stay
// in place as recoverable evidence.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";
import {
  detectImageContentType,
  imageVersionedR2Key,
  normalizeImageContentType,
  readImageManifest,
  sha256Hex,
  writeImageManifest,
} from "../_lib/image-media.js";
import { normalizeLegacyDiagramSourceKey } from "../_lib/legacy-image-source.js";
import { isPrimaryTeam, resolveSessionTeamId } from "../_lib/team-context.js";

const MAX_ITEMS = 100;
const MAX_MEDIA_ID_LENGTH = 512;

function clean(value, max) { return String(value || "").trim().slice(0, max); }

function requestedSourceKey(item) {
  const hasSourceKey = item && Object.prototype.hasOwnProperty.call(item, "sourceKey");
  return normalizeLegacyDiagramSourceKey(hasSourceKey ? item.sourceKey : item?.legacyKey);
}

async function findCanonicalChecksumOwner(env, teamId, checksum) {
  const row = await env.DB.prepare(
    "SELECT media_id FROM team_media_manifests WHERE team_id = ? AND kind = 'diagram' AND checksum = ? LIMIT 1",
  ).bind(teamId, checksum).first();
  return String(row?.media_id || "").trim();
}

async function bodyJson(request) {
  try { return await request.json(); } catch (_err) { return null; }
}

export async function onRequestPost(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || session.role !== "admin") {
    return authJson({ ok: false, error: "Only an admin may migrate legacy diagrams." }, { status: 403 });
  }
  const teamId = await resolveSessionTeamId(session, context.env);
  if (!teamId) return authJson({ ok: false, error: "Team access is not configured." }, { status: 503 });
  if (!(await isPrimaryTeam(context.env, teamId))) {
    return authJson({ ok: false, error: "Archived diagram recovery is available only to the configured primary team." }, { status: 403 });
  }
  const bucket = context.env?.CLIPS;
  if (!bucket) return authJson({ ok: false, error: "Image storage is not configured." }, { status: 503 });
  const body = await bodyJson(context.request);
  const requested = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : [];
  if (!requested.length) return authJson({ ok: false, error: "No legacy diagram mappings were provided." }, { status: 400 });

  const results = [];
  for (const item of requested) {
    const mediaId = clean(item?.mediaId, MAX_MEDIA_ID_LENGTH);
    const sourceKey = requestedSourceKey(item);
    const expectedLegacyChecksum = clean(item?.expectedLegacyChecksum, 128).toLowerCase();
    if (!mediaId || !sourceKey || !/^[a-f0-9]{64}$/.test(expectedLegacyChecksum)) {
      results.push({ mediaId, sourceKey, status: "invalid" });
      continue;
    }
    try {
      if (await readImageManifest(context.env, teamId, mediaId)) {
        results.push({ mediaId, sourceKey, status: "already-canonical" });
        continue;
      }
      const source = await bucket.get(sourceKey);
      if (!source?.body) {
        results.push({ mediaId, sourceKey, status: "legacy-not-found" });
        continue;
      }
      const bytes = await source.arrayBuffer();
      const checksum = await sha256Hex(bytes);
      if (checksum !== expectedLegacyChecksum) {
        results.push({ mediaId, sourceKey, status: "checksum-mismatch" });
        continue;
      }
      // A legacy key can be exact while its old bytes were already copied to
      // a different play. That is evidence of historic key corruption, not a
      // reason to duplicate a known wrong diagram onto another player play.
      // Require an explicit visual/manual replacement in that case.
      const canonicalChecksumOwner = await findCanonicalChecksumOwner(context.env, teamId, checksum);
      if (canonicalChecksumOwner && canonicalChecksumOwner !== mediaId) {
        results.push({ mediaId, sourceKey, status: "duplicate-canonical-content", canonicalChecksumOwner });
        continue;
      }
      const contentType = detectImageContentType(bytes);
      const declaredContentType = normalizeImageContentType(source.httpMetadata?.contentType);
      if (!contentType || (declaredContentType && declaredContentType !== contentType)) {
        results.push({ mediaId, sourceKey, status: "unsupported-image" });
        continue;
      }
      const version = crypto.randomUUID();
      const r2key = imageVersionedR2Key(teamId, mediaId, version);
      const uploadedAt = new Date().toISOString();
      const saved = await bucket.put(r2key, bytes, {
        httpMetadata: { contentType },
        customMetadata: { teamId, mediaId, version, checksum, migratedFrom: sourceKey },
      });
      const commit = await writeImageManifest(context.env, teamId, mediaId, {
        version, r2key, size: saved?.size || bytes.byteLength, contentType, checksum, uploadedAt,
        uploadedBy: `${session.username}:legacy-migration`,
      }, { expectedVersion: "" });
      results.push(commit.committed
        ? { mediaId, status: "migrated", sourceKey }
        : { mediaId, sourceKey, status: "conflict" });
    } catch (_err) {
      results.push({ mediaId, sourceKey, status: "failed" });
    }
  }
  const counts = results.reduce((summary, result) => {
    summary[result.status] = (summary[result.status] || 0) + 1;
    return summary;
  }, {});
  return authJson({ ok: true, results, counts });
}
