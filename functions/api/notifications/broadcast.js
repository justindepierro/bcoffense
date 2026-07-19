/**
 * POST /api/notifications/broadcast
 *
 * Staff-only bridge from local/cloud publish actions to D1 player alerts.
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { getTeamId } from "../../_lib/d1-threads.js";
import { notifyTeamPlayers } from "../../_lib/d1-notifications.js";

const STAFF_ROLES = new Set(["admin", "coach", "assistant", "assistant_coach"]);
const ALLOWED_TYPES = new Set([
  "script_published",
  "new_quiz",
  "media_update",
  "team_announcement",
]);

export async function onRequestPost(context) {
  const { request, env } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!STAFF_ROLES.has(session.role)) {
    return authJson({ ok: false, error: "Coach access required." }, { status: 403 });
  }
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  let body = {};
  try {
    body = await request.json();
  } catch (_) {
    return authJson({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const type = String(body.type || "").trim();
  const title = String(body.title || "").trim();
  const message = String(body.body || "").trim();
  const deepLink = String(body.deepLink || "").trim();
  const tag = String(body.tag || "").trim();

  if (!ALLOWED_TYPES.has(type)) return authJson({ ok: false, error: "Unsupported notification type." }, { status: 422 });
  if (!title) return authJson({ ok: false, error: "Title required." }, { status: 422 });

  try {
    const teamId = await getTeamId(env.DB, session);
    if (!teamId) return authJson({ ok: false, error: "Team access is not configured for this account." }, { status: 503 });
    const result = await notifyTeamPlayers(env.DB, teamId, {
      type,
      title,
      body: message,
      deepLink,
      tag,
    }, env);
    return withSecurityHeaders(authJson({ ok: true, ...result }));
  } catch (err) {
    console.error("[POST /api/notifications/broadcast]", err);
    return authJson({ ok: false, error: "Could not send notifications." }, { status: 500 });
  }
}
