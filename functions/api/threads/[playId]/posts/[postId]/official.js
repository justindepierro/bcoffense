/**
 * POST /api/threads/:playId/posts/:postId/official
 * Toggle a reply as the official coach answer for its parent question.
 * Body: { official: true | false }
 *
 * Coach-only. Fires notifications to the question author and same_question reactors.
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../../../_lib/auth.js";
import { setOfficialAnswer, getPostContext } from "../../../../_lib/d1-threads.js";
import { notifyOnOfficialAnswer } from "../../../../_lib/d1-notifications.js";

export async function onRequestPost(context) {
  const { request, env, params } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  const isStaff = session.role === "coach" || session.role === "admin";
  if (!isStaff) return authJson({ ok: false, error: "Coaches only." }, { status: 403 });

  const playId = decodeURIComponent(String(params.playId || "")).trim();
  const postId = String(params.postId || "").trim();
  if (!playId || !postId) return authJson({ ok: false, error: "Play ID and Post ID required." }, { status: 400 });

  let body = {};
  try {
    const ct = request.headers.get("Content-Type") || "";
    body = ct.includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
  } catch (_) {
    return authJson({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  // Resolve team ID for this session
  const teamRow = await env.DB
    .prepare(`SELECT team_id FROM users WHERE id = ? LIMIT 1`)
    .bind(session.d1UserId || "")
    .first()
    .catch(() => null);
  const teamId = teamRow?.team_id || session.teamId;
  if (!teamId) return authJson({ ok: false, error: "Team not found." }, { status: 404 });

  const official = body.official === true || body.official === "true" || body.official === 1;

  const result = await setOfficialAnswer(env.DB, teamId, postId, official, session);
  if (result.error) return authJson({ ok: false, error: result.error }, { status: 403 });

  // Fire notifications when marking official (fire-and-forget)
  if (official && result.questionId) {
    const coachName = session.label || session.username;
    notifyOnOfficialAnswer(env.DB, result.questionId, coachName, playId, env).catch(() => { });
  }

  return withSecurityHeaders(authJson({ ok: true, official: result.official }));
}
