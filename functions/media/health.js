// Staff-only latest result from the scheduled media health monitor.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";
import { resolveSessionTeamId } from "../_lib/team-context.js";

function isStaff(session) {
  return session && ["admin", "coach", "assistant", "assistant_coach"].includes(session.role);
}

export async function onRequestGet(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!isStaff(session)) return authJson({ ok: false, error: "Coach access is required." }, { status: 403 });
  if (!context.env?.DB) return authJson({ ok: false, error: "Media health storage is not configured." }, { status: 503 });
  const teamId = await resolveSessionTeamId(session, context.env);
  if (!teamId) return authJson({ ok: false, error: "Team access is not configured." }, { status: 503 });
  try {
    const row = await context.env.DB.prepare(
      `SELECT status, completed_at, diagram_pointer_count, diagram_object_count,
        missing_diagram_count, invalid_diagram_path_count, checksum_mismatch_count,
        clip_manifest_count, missing_clip_count, legacy_clip_manifest_count,
        release_age_seconds, detail_json
       FROM media_health_runs WHERE team_id = ? ORDER BY completed_at DESC LIMIT 1`,
    ).bind(teamId).first();
    if (!row) return authJson({ ok: true, available: false, reason: "The first hourly media check has not run yet." });
    let detail = {};
    try { detail = JSON.parse(row.detail_json || "{}"); } catch (_err) { detail = {}; }
    return authJson({ ok: true, available: true, health: {
      status: String(row.status || "unknown"), completedAt: Number(row.completed_at || 0),
      diagramPointerCount: Number(row.diagram_pointer_count || 0), diagramObjectCount: Number(row.diagram_object_count || 0),
      missingDiagramCount: Number(row.missing_diagram_count || 0), invalidDiagramPathCount: Number(row.invalid_diagram_path_count || 0),
      checksumMismatchCount: Number(row.checksum_mismatch_count || 0),
      clipManifestCount: Number(row.clip_manifest_count || 0), missingClipCount: Number(row.missing_clip_count || 0),
      legacyClipManifestCount: Number(row.legacy_clip_manifest_count || 0), releaseAgeSeconds: Number(row.release_age_seconds || 0), detail,
    } });
  } catch (_err) {
    return authJson({ ok: false, error: "Scheduled media health could not be read." }, { status: 502 });
  }
}
