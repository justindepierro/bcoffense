/**
 * GET  /api/threads/:playId  — load thread + posts
 * POST /api/threads/:playId  — create post (lazily creates thread)
 *
 * playId is a URL-encoded canonical play identifier:
 *   encodeURIComponent(`${personnel}::${formation}::${play}`)
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import {
  getTeamId,
  getOrCreateThread,
  getThread,
  getThreadPosts,
  createPost,
  countThreadPosts,
  setQuestionState,
} from "../../_lib/d1-threads.js";
import { notifyOnCoachPost } from "../../_lib/d1-notifications.js";

export async function onRequest(context) {
  const { request, env, params } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  const playId = decodeURIComponent(String(params.playId || "")).trim();
  if (!playId) return authJson({ ok: false, error: "Play ID required." }, { status: 400 });

  const teamId = await getTeamId(env.DB, session);

  // ── GET — load thread + posts ─────────────────────────────────────────────
  if (request.method === "GET") {
    const url = new URL(request.url);
    const afterId = url.searchParams.get("cursor") || null;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "25", 10), 50);

    const thread = await getThread(env.DB, teamId, playId);
    if (!thread) {
      return withSecurityHeaders(authJson({ ok: true, thread: null, posts: [], hasMore: false }));
    }

    const userId = session.d1UserId || null;
    const { posts, hasMore } = await getThreadPosts(env.DB, thread.id, { limit, afterId, userId });
    const total = await countThreadPosts(env.DB, thread.id);

    return withSecurityHeaders(
      authJson({
        ok: true,
        thread: {
          id: thread.id,
          enabled: !!thread.enabled,
          locked: !!thread.locked,
          commentsEnabled: !!thread.comments_enabled,
          questionsEnabled: !!thread.questions_enabled,
          total,
        },
        posts: posts.map(formatPost),
        hasMore,
      }),
    );
  }

  // ── POST — create post ────────────────────────────────────────────────────
  if (request.method === "POST") {
    // Players need an account to post
    if (session.role === "player" && !session.d1UserId) {
      return authJson({ ok: false, error: "Player account required to post." }, { status: 403 });
    }
    // Coaches/admins get a synthetic user if not in D1 yet
    const authorId = await resolveAuthorId(env.DB, session);
    if (!authorId) return authJson({ ok: false, error: "Could not resolve author." }, { status: 500 });

    let body = {};
    try {
      const ct = request.headers.get("Content-Type") || "";
      body = ct.includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
    } catch (_) {
      return authJson({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    const postBody = String(body.body || "").trim();
    const postType = body.post_type === "question" ? "question" : "comment";
    const playSig = String(body.play_signature || "").trim() || null;

    if (!postBody) return authJson({ ok: false, error: "Post body required." }, { status: 422 });

    // Get or create thread (lazy)
    const thread = await getOrCreateThread(env.DB, teamId, playId, playSig);

    if (!thread.enabled) return authJson({ ok: false, error: "Discussion is disabled for this play." }, { status: 403 });
    if (thread.locked && session.role === "player") {
      return authJson({ ok: false, error: "This thread is locked." }, { status: 403 });
    }

    const result = await createPost(env.DB, {
      threadId: thread.id,
      authorId,
      postType,
      body: postBody,
    });

    if (result?.error) return authJson({ ok: false, error: result.error }, { status: 422 });

    // Notify players in the thread when a coach replies (fire-and-forget)
    const isStaff = session.role === "coach" || session.role === "admin";
    if (isStaff) {
      const posterName = session.label || session.username;
      notifyOnCoachPost(env.DB, thread.id, authorId, posterName, playId, postBody, env).catch(() => { });
    }

    return withSecurityHeaders(authJson({ ok: true, post: formatPost(result) }));
  }

  return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });
}

function formatPost(p) {
  return {
    id: p.id,
    postType: p.post_type,
    body: p.body,
    questionState: p.question_state,
    authorId: p.author_id,
    authorName: p.author_name,
    authorRole: p.author_role,
    createdAt: p.created_at,
    editedAt: p.edited_at || null,
    moderationStatus: p.moderation_status,
    reactions: p.reactions || [],
  };
}

/** Resolve or create a D1 user record for hardcoded staff accounts. */
async function resolveAuthorId(db, session) {
  if (session.d1UserId) return session.d1UserId;

  // Hardcoded staff — look up by email (username) or create a synthetic record
  const email = `${session.username}@bcoffense.internal`;
  const existing = await db.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(email).first();
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    `INSERT INTO users (id, email, display_name, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  ).bind(id, email, session.label || session.username, session.role, now, now).run();

  return id;
}
