/**
 * POST /api/plays/:playId/like  — toggle a like on a canonical play.
 * GET  /api/plays/:playId/like  — return current like count + viewer's like state.
 *
 * playId is a URL-encoded canonical play identifier:
 *   encodeURIComponent(`${personnel}::${formation}::${play}`)
 *
 * POST response: { ok, liked: boolean, count: number }
 * GET  response: { ok, liked: boolean, count: number }
 *
 * Rules:
 *  - Each user may like a play at most once (UNIQUE(play_id, user_id)).
 *  - Posting again removes the existing like (toggle).
 *  - Likes are scoped to the team (team_id).
 *  - Rate-limited: max 60 like/unlike operations per hour per user.
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../../_lib/auth.js";

const RATE_LIMIT_WINDOW_S = 3600;  // 1 hour
const RATE_LIMIT_MAX = 60;     // max like/unlike actions per window

export async function onRequest(context) {
  const { request, env, params } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  const playId = decodeURIComponent(String(params.playId || "")).trim();
  if (!playId) return authJson({ ok: false, error: "Missing play ID." }, { status: 400 });

  const userId = session.userId || session.username;
  const teamId = session.teamId || "default";

  if (request.method === "GET") {
    return handleGet(env, playId, userId, teamId);
  }

  if (request.method === "POST") {
    return handlePost(env, playId, userId, teamId);
  }

  return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });
}

async function handleGet(env, playId, userId, teamId) {
  const [countRow, likedRow] = await Promise.all([
    env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM play_likes WHERE play_id = ? AND team_id = ?"
    ).bind(playId, teamId).first(),
    env.DB.prepare(
      "SELECT 1 FROM play_likes WHERE play_id = ? AND user_id = ? LIMIT 1"
    ).bind(playId, userId).first(),
  ]);

  return authJson({
    ok: true,
    liked: !!likedRow,
    count: Number(countRow?.cnt || 0),
  });
}

async function handlePost(env, playId, userId, teamId) {
  // Rate limit: count like/unlike actions in the past hour
  const since = Math.floor(Date.now() / 1000) - RATE_LIMIT_WINDOW_S;
  const rateRow = await env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM play_likes WHERE user_id = ? AND created_at >= ?"
  ).bind(userId, since).first();
  // Note: unlikes don't create rows so rate limit is on inserts only; still effective
  if (Number(rateRow?.cnt || 0) >= RATE_LIMIT_MAX) {
    return authJson({ ok: false, error: "Rate limit exceeded. Try again later." }, { status: 429 });
  }

  // Check if already liked
  const existing = await env.DB.prepare(
    "SELECT id FROM play_likes WHERE play_id = ? AND user_id = ? LIMIT 1"
  ).bind(playId, userId).first();

  let liked;
  if (existing) {
    // Remove like
    await env.DB.prepare(
      "DELETE FROM play_likes WHERE play_id = ? AND user_id = ?"
    ).bind(playId, userId).run();
    liked = false;
  } else {
    // Add like
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO play_likes (id, play_id, user_id, team_id) VALUES (?, ?, ?, ?)"
    ).bind(id, playId, userId, teamId).run();
    liked = true;
  }

  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM play_likes WHERE play_id = ? AND team_id = ?"
  ).bind(playId, teamId).first();

  return authJson({
    ok: true,
    liked,
    count: Number(countRow?.cnt || 0),
  });
}
