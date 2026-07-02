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
  getPostReplies,
  getRecentFlaggedCount,
  getRecentSevereCount,
  getPlayerMuteUntil,
  getActiveCoachIds,
} from "../../_lib/d1-threads.js";
import { notifyOnCoachPost, createNotification } from "../../_lib/d1-notifications.js";

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
    const parentPostId = String(body.parent_post_id || "").trim() || null;
    const questionCategory = String(body.question_category || "").trim() || null;

    if (!postBody) return authJson({ ok: false, error: "Post body required." }, { status: 422 });

    // ── Mute check (temporary post ban from coach action) ─────────────────
    const muteUntil = await getPlayerMuteUntil(env.DB, authorId);
    if (muteUntil) {
      const minutesLeft = Math.ceil((muteUntil - Math.floor(Date.now() / 1000)) / 60);
      return authJson({
        ok: false,
        error: `You are temporarily unable to post. Your posting ability will be restored in approximately ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
        muted: true,
      }, { status: 403 });
    }

    // ── Rate limit: block users with 3+ flagged submissions in the last hour ─
    const recentFlagged = await getRecentFlaggedCount(env.DB, authorId, 3600);
    if (recentFlagged >= 3) {
      return authJson({
        ok: false,
        error: "Your recent messages have been flagged multiple times. Please review the team communication standards and try again later.",
        rateLimited: true,
      }, { status: 429 });
    }

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
      parentPostId,
      questionCategory,
    });

    if (result?.error) return authJson({ ok: false, error: result.error }, { status: 422 });

    // Auto-answer parent question when a staff member replies
    const isStaff = session.role === "coach" || session.role === "admin";
    if (isStaff && parentPostId) {
      const parent = await env.DB.prepare(
        "SELECT post_type, question_state FROM discussion_posts WHERE id = ? AND deleted_at IS NULL LIMIT 1"
      ).bind(parentPostId).first();
      if (parent?.post_type === "question" && (parent.question_state === "open" || parent.question_state === "reopened")) {
        await setQuestionState(env.DB, parentPostId, "answered", session);
      }
    }

    // Notify players in the thread when a coach replies (fire-and-forget)
    if (isStaff) {
      const posterName = session.label || session.username;
      notifyOnCoachPost(env.DB, thread.id, authorId, posterName, playId, postBody, env).catch(() => { });
    }

    const modInfo = result._moderation || {};
    const postData = formatPost(result);

    // ── Notify coaches on repeated severe violations (fire-and-forget) ────
    if (modInfo.outcome === "block") {
      _notifyCoachesOnRepeatedViolation(env.DB, authorId, teamId, session, result.id).catch(() => { });
    }

    return withSecurityHeaders(authJson({
      ok: true,
      post: postData,
      moderation: {
        outcome: modInfo.outcome || "allow",
        displayWarning: modInfo.displayWarning || null,
      },
    }));
  }

  return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });
}

function formatPost(p) {
  return {
    id: p.id,
    postType: p.post_type,
    body: p.body,
    questionState: p.question_state,
    questionCategory: p.question_category || null,
    authorId: p.author_id,
    authorName: p.author_name,
    authorRole: p.author_role,
    createdAt: p.created_at,
    editedAt: p.edited_at || null,
    moderationStatus: p.moderation_status,
    parentPostId: p.parent_post_id || null,
    rootPostId: p.root_post_id || null,
    depth: p.depth || 0,
    reactions: p.reactions || [],
    replies: (p.replies || []).map(formatPost),
    replyCount: p.replyCount || 0,
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

/**
 * If a player has 3+ auto_block actions in the last 24 hours, notify engaged
 * coaches so they are aware of repeated severe violations.
 * Only notifies on the 3rd violation (not on every subsequent one) to avoid spam.
 */
async function _notifyCoachesOnRepeatedViolation(db, authorId, teamId, session, postId) {
  try {
    const severeCount = await getRecentSevereCount(db, authorId, 86400);
    if (severeCount !== 3) return; // only notify at exactly 3 (not on every subsequent block)

    const authorRow = await db.prepare("SELECT display_name FROM users WHERE id = ? LIMIT 1").bind(authorId).first();
    const authorName = authorRow?.display_name || "A player";

    const coachIds = await getActiveCoachIds(db, teamId);
    for (const coachId of coachIds) {
      await createNotification(db, {
        userId: coachId,
        type: "moderation_alert",
        title: "Repeated policy violations detected",
        body: `${authorName} has had 3 posts auto-blocked in the last 24 hours. Consider reviewing their account.`,
        deepLink: null,
      });
    }
  } catch (_) { /* fire-and-forget, never surface errors */ }
}
