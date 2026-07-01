/**
 * GET /api/threads/batch-counts?plays=encodedPlayId1,encodedPlayId2,...
 * Returns total post count and open question count per play ID.
 * Max 100 play IDs per request.
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { getTeamId } from "../../_lib/d1-threads.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  const url = new URL(request.url);
  const playsParam = url.searchParams.get("plays") || "";
  const playIds = playsParam
    .split(",")
    .map((s) => decodeURIComponent(s.trim()))
    .filter(Boolean)
    .slice(0, 100);

  if (!playIds.length) {
    return withSecurityHeaders(authJson({ ok: true, counts: {} }));
  }

  const teamId = await getTeamId(env.DB, session);
  const placeholders = playIds.map(() => "?").join(",");

  const rows = await env.DB.prepare(
    `SELECT t.play_id,
       COUNT(p.id) AS total,
       SUM(CASE WHEN p.post_type = 'question'
         AND (p.question_state = 'open' OR p.question_state = 'reopened' OR p.question_state IS NULL)
         THEN 1 ELSE 0 END) AS open_questions
     FROM play_threads t
     LEFT JOIN discussion_posts p
       ON p.thread_id = t.id
       AND p.deleted_at IS NULL
       AND p.moderation_status = 'approved'
     WHERE t.team_id = ? AND t.play_id IN (${placeholders})
     GROUP BY t.play_id`,
  )
    .bind(teamId, ...playIds)
    .all();

  const counts = {};
  for (const row of rows.results || []) {
    counts[row.play_id] = {
      total: row.total || 0,
      openQuestions: row.open_questions || 0,
    };
  }

  return withSecurityHeaders(authJson({ ok: true, counts }));
}
