// Durable-upload receipt endpoint.
//
// Upload bytes remain in the browser's IndexedDB outbox until the diagram or
// clip route has verified and published them. This endpoint stores only the
// small lifecycle record so the scheduled health Worker can identify a real
// stuck upload without treating normal offline work as an error.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";
import { resolveSessionTeamId } from "../_lib/team-context.js";

const STAFF_ROLES = new Set(["admin", "coach", "assistant_coach"]);
const STATES = new Set(["queued", "retrying", "completed", "blocked"]);
const MAX_BODY_BYTES = 16 * 1024;

function text(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function unixSeconds(value, fallback) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed / 1000) : fallback;
}

function safeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "{}";
  const metadata = {};
  ["contentType", "duration", "uploadedAt", "version", "mediaId", "clipId"].forEach((key) => {
    const item = value[key];
    if (typeof item === "string") metadata[key] = item.slice(0, 240);
    else if (typeof item === "number" && Number.isFinite(item)) metadata[key] = item;
  });
  return JSON.stringify(metadata);
}

export async function onRequestPost(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!STAFF_ROLES.has(String(session.role || ""))) {
    return authJson({ ok: false, error: "Coach access is required." }, { status: 403 });
  }
  if (!context.env?.DB) return authJson({ ok: false, error: "Media receipt storage is not configured." }, { status: 503 });
  const teamId = await resolveSessionTeamId(session, context.env);
  if (!teamId) return authJson({ ok: false, error: "Team access is not configured." }, { status: 503 });

  const contentLength = Number(context.request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_BODY_BYTES) return authJson({ ok: false, error: "Receipt is too large." }, { status: 413 });
  let payload;
  try { payload = await context.request.json(); } catch (_err) {
    return authJson({ ok: false, error: "Receipt must be valid JSON." }, { status: 400 });
  }

  const id = text(payload?.id, 128);
  const kind = text(payload?.kind, 16).toLowerCase();
  const targetKey = text(payload?.target, 512);
  const state = text(payload?.state, 16).toLowerCase();
  if (!/^[a-z0-9-]{8,128}$/i.test(id) || !["diagram", "clip"].includes(kind) || !targetKey || !STATES.has(state)) {
    return authJson({ ok: false, error: "Receipt identity is invalid." }, { status: 400 });
  }
  const now = Math.floor(Date.now() / 1000);
  const attempts = Math.max(0, Math.min(100, Number(payload?.attempts || 0) || 0));
  const bytes = Math.max(0, Math.min(512 * 1024 * 1024, Number(payload?.bytes || 0) || 0));
  const queuedAt = unixSeconds(payload?.queuedAt, now);
  const completedAt = state === "completed" ? unixSeconds(payload?.completedAt, now) : null;
  const lastError = state === "completed" ? "" : text(payload?.lastError, 1000);
  const existing = await context.env.DB.prepare(
    "SELECT team_id, state FROM team_media_upload_receipts WHERE id = ? LIMIT 1",
  ).bind(id).first();
  if (existing && String(existing.team_id || "") !== String(teamId)) {
    return authJson({ ok: false, error: "Receipt identity is already reserved." }, { status: 409 });
  }
  // An older queued/retry beacon may arrive after the upload completed. Do
  // not let delayed browser traffic regress the server-visible final state.
  if (existing?.state === "completed" && state !== "completed") {
    return authJson({ ok: true, id, state: "completed", idempotent: true });
  }
  const actorId = session.d1UserId || null;
  try {
    await context.env.DB.prepare(
      `INSERT INTO team_media_upload_receipts
        (id, team_id, kind, target_key, state, attempts, bytes, queued_at, updated_at, completed_at,
         created_by, updated_by, last_error, receipt_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind, target_key = excluded.target_key, state = excluded.state,
         attempts = excluded.attempts, bytes = excluded.bytes, updated_at = excluded.updated_at,
         completed_at = excluded.completed_at, updated_by = excluded.updated_by,
         last_error = excluded.last_error, receipt_json = excluded.receipt_json
       WHERE team_media_upload_receipts.team_id = excluded.team_id`,
    ).bind(
      id, teamId, kind, targetKey, state, attempts, bytes, queuedAt, now, completedAt,
      actorId, actorId, lastError, safeMetadata(payload?.receipt),
    ).run();
  } catch (_err) {
    return authJson({ ok: false, error: "Media receipt could not be saved." }, { status: 502 });
  }
  return authJson({ ok: true, id, state, updatedAt: now });
}
