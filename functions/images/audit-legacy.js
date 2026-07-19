// Admin-only, read-only reconciliation for diagrams migrated from historic R2
// keys. It compares immutable bytes rather than names or script copy fields.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";
import { readImageManifest, sha256Hex } from "../_lib/image-media.js";
import { normalizeLegacyDiagramSourceKey } from "../_lib/legacy-image-source.js";
import { isPrimaryTeam, resolveSessionTeamId } from "../_lib/team-context.js";

const MAX_ITEMS = 100;
const MAX_MEDIA_ID_LENGTH = 512;
const MAX_LEGACY_KEY_LENGTH = 1000;

function clean(value, max) { return String(value || "").trim().slice(0, max); }

function requestedSourceKey(item) {
  const hasSourceKey = item && Object.prototype.hasOwnProperty.call(item, "sourceKey");
  return normalizeLegacyDiagramSourceKey(hasSourceKey ? item.sourceKey : item?.legacyKey, MAX_LEGACY_KEY_LENGTH);
}

export async function onRequestPost(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || session.role !== "admin") {
    return authJson({ ok: false, error: "Only an admin may reconcile archived diagrams." }, { status: 403 });
  }
  const teamId = await resolveSessionTeamId(session, context.env);
  if (!teamId) return authJson({ ok: false, error: "Team access is not configured." }, { status: 503 });
  if (!(await isPrimaryTeam(context.env, teamId))) {
    return authJson({ ok: false, error: "Archived diagram recovery is available only to the configured primary team." }, { status: 403 });
  }
  const bucket = context.env?.CLIPS;
  if (!bucket) return authJson({ ok: false, error: "Image storage is not configured." }, { status: 503 });

  let body = null;
  try { body = await context.request.json(); } catch (_err) { body = null; }
  const items = (Array.isArray(body?.items) ? body.items : []).slice(0, MAX_ITEMS)
    .map((item) => ({
      mediaId: clean(item?.mediaId, MAX_MEDIA_ID_LENGTH),
      sourceKey: requestedSourceKey(item),
    }))
    .filter((item) => item.mediaId && item.sourceKey);
  if (!items.length) return authJson({ ok: false, error: "No valid reconciliation candidates were provided." }, { status: 400 });

  const results = [];
  for (const item of items) {
    try {
      const canonical = await readImageManifest(context.env, teamId, item.mediaId);
      if (!canonical?.r2key || !canonical.checksum) {
        results.push({ ...item, status: "missing-canonical" });
        continue;
      }
      const legacy = await bucket.get(item.sourceKey);
      if (!legacy?.body) {
        results.push({ ...item, status: "missing-legacy", canonicalChecksum: canonical.checksum });
        continue;
      }
      const legacyChecksum = await sha256Hex(await legacy.arrayBuffer());
      results.push({
        ...item,
        status: legacyChecksum === canonical.checksum ? "verified" : "mismatch",
        canonicalChecksum: canonical.checksum,
        legacyChecksum,
        canonicalSize: canonical.size,
        legacySize: legacy.size || 0,
      });
    } catch (_err) {
      results.push({ ...item, status: "error" });
    }
  }
  const counts = results.reduce((summary, item) => {
    summary[item.status] = (summary[item.status] || 0) + 1;
    return summary;
  }, {});
  return authJson({ ok: true, results, counts });
}
