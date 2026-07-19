/**
 * GET /api/questions — list player questions/comments across all play threads
 *
 * Query params:
 *   type    — "all" | "questions" | "comments" (default "questions")
 *   state   — "open" | "answered" | "resolved" | "" (all active, default "open")
 *   sort    — "newest" | "oldest" | "same_question" (default "newest")
 *   limit   — max results (default 30, max 100)
 *   offset  — pagination offset (default 0)
 *   summary — "1" to include summary counts only (no list)
 *
 * Response: { ok, questions, hasMore, summary: { open, unanswered, answered, resolved, today, playerCommentsToday, playerCommentsRecent } }
 * Requires: coach or admin role
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { getTeamId } from "../../_lib/d1-threads.js";

function isCoach(session) {
  return session.role === "admin" || session.role === "coach";
}

function todayStartUnix() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function recentStartUnix(days = 7) {
  return Math.floor(Date.now() / 1000) - (days * 86400);
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!isCoach(session)) return authJson({ ok: false, error: "Coaches only." }, { status: 403 });

  const db = env.DB;
  if (!db) return authJson({ ok: false, error: "Database unavailable." }, { status: 503 });

  try {
    const teamId = await getTeamId(db, session);
    if (!teamId) return authJson({ ok: false, error: "Team access is not configured for this account." }, { status: 503 });
    const url = new URL(request.url);
    const type = url.searchParams.get("type") ?? "questions";
    const state = url.searchParams.get("state") ?? "open"; // "" = all
    const sort = url.searchParams.get("sort") ?? "newest";
    const summaryOnly = url.searchParams.get("summary") === "1";
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30", 10) || 30, 100);
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

    const todayTs = todayStartUnix();
    const recentTs = recentStartUnix(7);

    // ── Summary counts (always returned) ──────────────────────────────────────
    const sumRow = await db
      .prepare(
        `SELECT
          SUM(CASE WHEN p.post_type = 'question' AND p.question_state IN ('open','answered','reopened') THEN 1 ELSE 0 END) AS active_total,
          SUM(CASE WHEN p.post_type = 'question' AND (p.question_state = 'open' OR p.question_state = 'reopened') THEN 1 ELSE 0 END) AS open_count,
          SUM(CASE WHEN p.post_type = 'question' AND p.question_state = 'answered' THEN 1 ELSE 0 END) AS answered_count,
          SUM(CASE WHEN p.post_type = 'question' AND p.question_state = 'resolved' THEN 1 ELSE 0 END) AS resolved_count,
          SUM(CASE WHEN p.post_type = 'question' AND p.created_at >= ? THEN 1 ELSE 0 END) AS today_count,
          SUM(CASE WHEN p.post_type = 'comment' AND u.role = 'player' THEN 1 ELSE 0 END) AS player_comment_count,
          SUM(CASE WHEN p.post_type = 'comment' AND u.role = 'player' AND p.created_at >= ? THEN 1 ELSE 0 END) AS player_comment_today_count,
          SUM(CASE WHEN p.post_type = 'comment' AND u.role = 'player' AND p.created_at >= ? THEN 1 ELSE 0 END) AS player_comment_recent_count
         FROM discussion_posts p
         JOIN play_threads t ON t.id = p.thread_id
         JOIN users u ON u.id = p.author_id
         WHERE p.deleted_at IS NULL
           AND p.moderation_status = 'approved'
           AND t.team_id = ?`,
      )
      .bind(todayTs, todayTs, recentTs, teamId)
      .first();

    const summary = {
      open: sumRow?.open_count || 0,
      unanswered: sumRow?.open_count || 0,
      answered: sumRow?.answered_count || 0,
      resolved: sumRow?.resolved_count || 0,
      today: sumRow?.today_count || 0,
      activeTotal: sumRow?.active_total || 0,
      playerComments: sumRow?.player_comment_count || 0,
      playerCommentsToday: sumRow?.player_comment_today_count || 0,
      playerCommentsRecent: sumRow?.player_comment_recent_count || 0,
    };
    summary.needsReview = summary.open + summary.playerCommentsRecent;

    if (summaryOnly) {
      return withSecurityHeaders(authJson({ ok: true, summary }));
    }

    // ── Build question list query ─────────────────────────────────────────────
    let stateFilter = "";
    const binds = [teamId];
    const inboxType = ["all", "questions", "comments"].includes(type) ? type : "questions";

    if (state === "open") {
      stateFilter = "AND (p.question_state = 'open' OR p.question_state = 'reopened')";
    } else if (state === "answered") {
      stateFilter = "AND p.question_state = 'answered'";
    } else if (state === "resolved") {
      stateFilter = "AND p.question_state = 'resolved'";
    }
    // "" = all active (not resolved)
    if (!state) {
      stateFilter = "AND p.question_state != 'resolved'";
    }

    let typeFilter = "AND p.post_type = 'question'";
    if (inboxType === "comments") {
      typeFilter = "AND p.post_type = 'comment' AND u.role = 'player'";
      stateFilter = "";
    } else if (inboxType === "all") {
      if (state === "answered" || state === "resolved") {
        typeFilter = "AND p.post_type = 'question'";
      } else {
        typeFilter = `AND (
          (p.post_type = 'question' ${stateFilter.replace(/^AND\s*/, "AND ")})
          OR (p.post_type = 'comment' AND u.role = 'player')
        )`;
        stateFilter = "";
      }
    }

    let orderBy;
    if (sort === "same_question") {
      orderBy = "same_q_count DESC, p.created_at DESC";
    } else if (sort === "oldest") {
      orderBy = "p.created_at ASC";
    } else {
      orderBy = "p.created_at DESC";
    }

    // Subquery for same_question reaction count
    const rows = await db
      .prepare(
        `SELECT
          p.id, p.body, p.post_type, p.question_state, p.created_at, p.edited_at,
          p.parent_post_id, p.root_post_id,
          p.author_id, u.display_name AS author_name, u.role AS author_role,
          t.play_id, t.id AS thread_id,
          (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id AND r.reaction_key = 'same_question') AS same_q_count
         FROM discussion_posts p
         JOIN play_threads t ON t.id = p.thread_id
         JOIN users u ON u.id = p.author_id
         WHERE p.deleted_at IS NULL
           AND p.moderation_status = 'approved'
           AND t.team_id = ?
           ${typeFilter}
           ${stateFilter}
         ORDER BY ${orderBy}
         LIMIT ? OFFSET ?`,
      )
      .bind(...binds, limit + 1, offset)
      .all();

    const all = rows.results || [];
    const hasMore = all.length > limit;
    const questions = (hasMore ? all.slice(0, limit) : all).map((q) => ({
      id: q.id,
      body: q.body,
      postType: q.post_type,
      state: q.question_state,
      createdAt: q.created_at,
      editedAt: q.edited_at,
      authorId: q.author_id,
      authorName: q.author_name,
      authorRole: q.author_role,
      playId: q.play_id,
      threadId: q.thread_id,
      parentPostId: q.parent_post_id,
      rootPostId: q.root_post_id,
      sameQuestionCount: q.same_q_count || 0,
    }));

    return withSecurityHeaders(authJson({ ok: true, questions, hasMore, summary }));
  } catch (err) {
    console.error("[GET /api/questions]", err);
    return authJson({ ok: false, error: "Server error." }, { status: 500 });
  }
}
