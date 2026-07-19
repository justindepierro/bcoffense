/**
 * GET /api/moderation/stats  — moderation activity summary for coaches/admins
 *
 * Returns counts of auto-flagged posts, actions taken, and false-positive reversals
 * over the last 7 and 30 days. Use this to monitor for false-positive and
 * false-negative trends and trigger a term-list review when rates shift.
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { getTeamId, getModerationStats } from "../../_lib/d1-threads.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET") return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (session.role !== "coach" && session.role !== "admin") {
    return authJson({ ok: false, error: "Coach access required." }, { status: 403 });
  }
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  const teamId = await getTeamId(env.DB, session);
  if (!teamId) return authJson({ ok: false, error: "Team access is not configured for this account." }, { status: 503 });
  const stats = await getModerationStats(env.DB, teamId);

  return withSecurityHeaders(authJson({ ok: true, stats }));
}
