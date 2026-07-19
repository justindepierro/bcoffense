/**
 * GET /api/questions/mine
 * Returns the authenticated player's own questions with first coach reply.
 * Player-only endpoint — coaches see all questions via /api/questions.
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "GET") {
    return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });
  }

  const session = await getSessionFromRequest(request, env);
  if (!session) {
    return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  // Resolve the player's D1 user ID
  const userId = session.d1UserId;
  if (!userId) {
    // Staff accounts don't ask questions through the player portal
    return withSecurityHeaders(authJson({ ok: true, questions: [], summary: { open: 0, answered: 0, resolved: 0 } }));
  }

  if (!env.DB) {
    return authJson({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  // auth.js revalidates a D1 principal and resolves this value on every
  // request. Never degrade to an unscoped personal-query path if a malformed
  // legacy session lacks it.
  const teamId = String(session.teamId || "").trim();
  if (!teamId) {
    return authJson({ ok: false, error: "Team access is not configured for this account." }, { status: 503 });
  }

  const url = new URL(request.url);
  const stateFilter = url.searchParams.get("state") || ""; // "open"|"answered"|"resolved"|""
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  // Build parameterized state filter — no string interpolation
  let stateWhere = "";
  let stateBinds = [];
  if (stateFilter === "open") {
    stateWhere = "AND dp.question_state IN (?, ?)";
    stateBinds = ["open", "reopened"];
  } else if (stateFilter === "answered" || stateFilter === "resolved") {
    stateWhere = "AND dp.question_state = ?";
    stateBinds = [stateFilter];
  }

  const teamWhere = "AND pt.team_id = ?";
  const teamBinds = [teamId];

  const mainQuery = `
    SELECT
      dp.id               AS post_id,
      dp.thread_id,
      dp.body,
      dp.question_state   AS state,
      dp.created_at,
      pt.play_id,
      (SELECT r.body
       FROM discussion_posts r
       JOIN users u ON u.id = r.author_id
       WHERE r.thread_id = dp.thread_id
         AND r.deleted_at IS NULL
         AND r.created_at > dp.created_at
         AND u.role != 'player'
       ORDER BY r.created_at ASC
       LIMIT 1) AS coach_reply,
      (SELECT u.display_name
       FROM discussion_posts r
       JOIN users u ON u.id = r.author_id
       WHERE r.thread_id = dp.thread_id
         AND r.deleted_at IS NULL
         AND r.created_at > dp.created_at
         AND u.role != 'player'
       ORDER BY r.created_at ASC
       LIMIT 1) AS coach_name
    FROM discussion_posts dp
    JOIN play_threads pt ON pt.id = dp.thread_id
    WHERE dp.author_id = ?
      AND dp.post_type = 'question'
      AND dp.deleted_at IS NULL
      ${teamWhere}
      ${stateWhere}
    ORDER BY
      CASE dp.question_state
        WHEN 'open'     THEN 1
        WHEN 'reopened' THEN 1
        WHEN 'answered' THEN 2
        WHEN 'resolved' THEN 3
        ELSE 4
      END,
      dp.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const rows = await env.DB.prepare(mainQuery)
    .bind(userId, ...teamBinds, ...stateBinds, limit + 1, offset)
    .all();

  const all = rows.results || [];
  const hasMore = all.length > limit;
  const questions = all.slice(0, limit).map((r) => ({
    postId: r.post_id,
    threadId: r.thread_id,
    playId: r.play_id,
    body: r.body,
    state: r.state,
    createdAt: r.created_at,
    coachReply: r.coach_reply || null,
    coachName: r.coach_name || null,
  }));

  // Summary counts (all states, regardless of filter)
  const summaryQuery = `SELECT
       COUNT(CASE WHEN dp.question_state IN ('open','reopened') THEN 1 END) AS open_count,
       COUNT(CASE WHEN dp.question_state = 'answered' THEN 1 END)           AS answered_count,
       COUNT(CASE WHEN dp.question_state = 'resolved' THEN 1 END)           AS resolved_count
     FROM discussion_posts dp
     JOIN play_threads pt ON pt.id = dp.thread_id
     WHERE dp.author_id = ? AND dp.post_type = 'question' AND dp.deleted_at IS NULL AND pt.team_id = ?`;

  const summaryBinds = [userId, teamId];
  const summary = await env.DB.prepare(summaryQuery).bind(...summaryBinds).first();

  return withSecurityHeaders(authJson({
    ok: true,
    questions,
    hasMore,
    summary: {
      open: summary?.open_count ?? 0,
      answered: summary?.answered_count ?? 0,
      resolved: summary?.resolved_count ?? 0,
    },
  }));
}
