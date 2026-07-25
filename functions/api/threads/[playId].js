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
  getCustomTermOpts,
  createPostAttachment,
} from "../../_lib/d1-threads.js";
import {
  isCanonicalDiscussionAttachmentKey,
  normalizeDiscussionAttachmentId,
} from "../../_lib/discussion-attachments.js";
import { notifyOnCoachPost, notifyOnReply, notifyOnVisualReply, notifyTeamStaffOfPlayerPost, createNotification } from "../../_lib/d1-notifications.js";

export async function onRequest(context) {
  const { request, env, params } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  const playId = decodeURIComponent(String(params.playId || "")).trim();
  if (!playId) return authJson({ ok: false, error: "Play ID required." }, { status: 400 });

  const teamId = await getTeamId(env.DB, session);
  if (!teamId) {
    return authJson({ ok: false, error: "Team access is not configured for this account." }, { status: 503 });
  }

  // ── GET — load thread + posts ─────────────────────────────────────────────
  if (request.method === "GET") {
    const url = new URL(request.url);
    const afterId = url.searchParams.get("cursor") || null;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "25", 10), 50);

    const thread = await getThread(env.DB, teamId, playId);
    if (!thread) {
      const emptyEtag = `"disc-empty-${encodeURIComponent(playId)}"`;
      if (request.headers.get("If-None-Match") === emptyEtag) {
        return withSecurityHeaders(new Response(null, {
          status: 304,
          headers: { "ETag": emptyEtag, "Cache-Control": "private, no-cache" },
        }));
      }
      return authJson({ ok: true, thread: null, posts: [], hasMore: false }, {
        headers: { "ETag": emptyEtag, "Cache-Control": "private, no-cache" },
      });
    }

    const userId = session.d1UserId || null;
    const { posts, hasMore } = await getThreadPosts(env.DB, thread.id, { limit, afterId, userId });
    const total = await countThreadPosts(env.DB, thread.id);
    const revision = await env.DB.prepare(
      `SELECT COALESCE(MAX(updated_at), 0) AS post_updated_at
       FROM discussion_posts WHERE thread_id = ?`,
    ).bind(thread.id).first();
    const etag = `"disc-${thread.id}-${thread.updated_at || 0}-${revision?.post_updated_at || 0}-${total}"`;
    if (request.headers.get("If-None-Match") === etag) {
      return withSecurityHeaders(new Response(null, {
        status: 304,
        headers: { "ETag": etag, "Cache-Control": "private, no-cache" },
      }));
    }

    return authJson({
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
      }, { headers: { "ETag": etag, "Cache-Control": "private, no-cache" } });
  }

  // ── POST — create post ────────────────────────────────────────────────────
  if (request.method === "POST") {
    // Players need an account to post
    if (session.role === "player" && !session.d1UserId) {
      return authJson({ ok: false, error: "Player account required to post." }, { status: 403 });
    }
    // Coaches/admins get a synthetic user if not in D1 yet
    const authorId = await resolveAuthorId(env.DB, session, teamId);
    if (!authorId) return authJson({ ok: false, error: "Could not resolve author." }, { status: 500 });

    let body = {};
    try {
      const ct = request.headers.get("Content-Type") || "";
      body = ct.includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
    } catch (_) {
      return authJson({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    const postBody = String(body.body || "").trim();
    const _validTypes = ["question", "comment", "coach_clarification"];
    const postType = _validTypes.includes(body.post_type) ? body.post_type : "comment";
    const playSig = String(body.play_signature || "").trim() || null;
    const parentPostId = String(body.parent_post_id || "").trim() || null;
    const questionCategory = String(body.question_category || "").trim() || null;
    const clientPostId = String(body.client_post_id || "").trim() || null;
    const isStaff = ["coach", "admin", "assistant", "assistant_coach"].includes(session.role);
    // Optional attachment: { id, r2_key, type, caption, sourcePlayId, sizeBytes }
    const attachmentMeta = body.attachment && typeof body.attachment === "object"
      ? body.attachment : null;

    if (!postBody) return authJson({ ok: false, error: "Post body required." }, { status: 422 });

    // An attachment upload happens before the discussion post is created. Bind
    // it back to the post only when its opaque R2 key is exactly the canonical
    // key for this authenticated team and still exists with matching metadata.
    // This blocks a client from submitting another team's known attachment ID
    // or a legacy unscoped key as the attachment on a new post.
    let attachment = null;
    if (attachmentMeta) {
      if (!isStaff) {
        return authJson({ ok: false, error: "Only coaches may attach images." }, { status: 403 });
      }
      const attachmentValidation = await validateUploadedAttachment(env, teamId, attachmentMeta);
      if (attachmentValidation.error) {
        return authJson({ ok: false, error: attachmentValidation.error }, { status: 422 });
      }
      attachment = attachmentValidation.attachment;
    }

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

    const moderationOpts = await getCustomTermOpts(env.DB, teamId).catch(() => ({}));

    const result = await createPost(env.DB, {
      threadId: thread.id,
      authorId,
      postType,
      body: postBody,
      parentPostId,
      questionCategory,
      moderationOpts,
      clientPostId,
    });

    if (result?.error) return authJson({ ok: false, error: result.error }, { status: 422 });

    // ── Create attachment record if image was uploaded before posting ──────
    if (attachment) {
      await createPostAttachment(env.DB, {
        id: attachment.id,
        postId: result.id,
        type: attachment.type,
        r2Key: attachment.r2Key,
        caption: attachment.caption,
        sourcePlayId: attachment.sourcePlayId,
        sizeBytes: attachment.sizeBytes,
      }).catch(() => { /* non-fatal — attachment metadata loss is acceptable */ });
    }

    const isIdempotentRetry = result._idempotent === true;

    // A response can be lost after the server stored a post. Retries carry the
    // same client UUID, so only the original request may fan out alerts or
    // change question state. This keeps weak mobile connections duplicate-safe.
    if (!isIdempotentRetry && isStaff && parentPostId && postType !== "coach_clarification") {
      const parent = await env.DB.prepare(
        "SELECT post_type, question_state FROM discussion_posts WHERE id = ? AND deleted_at IS NULL LIMIT 1"
      ).bind(parentPostId).first();
      if (parent?.post_type === "question" && (parent.question_state === "open" || parent.question_state === "reopened")) {
        await setQuestionState(env.DB, teamId, parentPostId, "answered", session);
      }
    }

    const modInfo = result._moderation || {};

    // Player comments and questions both belong in every active staff
    // notification feed. Do this after the post has been stored, but never
    // make a successful player post fail just because its alert cannot be
    // written. The bell will surface the durable notification on its next
    // normal poll.
    if (!isIdempotentRetry && !isStaff && modInfo.outcome !== "block") {
      await notifyTeamStaffOfPlayerPost(env.DB, teamId, {
        authorId,
        authorName: session.label || session.username,
        postType,
        parentPostId,
        postId: result.id,
        playId,
        playLabel: playSig,
        body: postBody,
      }).catch((err) => console.error("[discussion] staff notification failed", err));
    }

    // A coach's top-level note is relevant to players already participating
    // in this play discussion. A reply is intentionally narrower: it belongs
    // to the player being answered, not every player who ever posted here.
    const isCoachVisualReply = Boolean(isStaff && parentPostId && attachment);
    if (!isIdempotentRetry && isStaff && !parentPostId) {
      const posterName = session.label || session.username;
      notifyOnCoachPost(env.DB, thread.id, authorId, posterName, playId, postBody, env).catch(() => { });
    }

    // Notify the parent author only when the activity did not already produce
    // a more specific receipt. Player replies are delivered to all staff by
    // notifyTeamStaffOfPlayerPost; marked-up coach replies have visual_reply.
    if (!isIdempotentRetry && parentPostId) {
      const posterName = session.label || session.username;
      notifyOnReply(env.DB, parentPostId, authorId, posterName, playId, postBody, env, {
        notificationType: isStaff ? "coach_reply" : "reply",
        skipPlayerRecipient: isCoachVisualReply,
        skipStaffRecipient: !isStaff,
      }).catch(() => { });
    }

    // Notify when a coach posts a visual (markup/image) reply (fire-and-forget)
    if (!isIdempotentRetry && isStaff && parentPostId && attachment) {
      const posterName = session.label || session.username;
      notifyOnVisualReply(env.DB, parentPostId, posterName, playId, env).catch(() => { });
    }

    const postData = formatPost(result);

    // ── Notify coaches on repeated severe violations (fire-and-forget) ────
    if (!isIdempotentRetry && modInfo.outcome === "block") {
      _notifyCoachesOnRepeatedViolation(env.DB, authorId, teamId, session, result.id).catch(() => { });
    }

    return withSecurityHeaders(authJson({
      ok: true,
      post: postData,
      moderation: {
        outcome: modInfo.outcome || "allow",
        displayWarning: modInfo.displayWarning || null,
      },
      idempotent: isIdempotentRetry,
    }));
  }

  return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });
}

async function validateUploadedAttachment(env, teamId, attachmentMeta) {
  const attachmentId = normalizeDiscussionAttachmentId(attachmentMeta?.id);
  const r2Key = String(attachmentMeta?.r2_key || "").trim();
  const type = attachmentMeta?.type === "markup" ? "markup" : attachmentMeta?.type === "image" ? "image" : "";
  if (!attachmentId || !r2Key || !type || !isCanonicalDiscussionAttachmentKey(teamId, attachmentId, r2Key)) {
    return { error: "Attachment is invalid or belongs to a different team. Please upload it again." };
  }
  if (!env.CLIPS) {
    return { error: "Attachment storage is temporarily unavailable. Please try again." };
  }

  let object;
  try {
    object = await env.CLIPS.head(r2Key);
  } catch (err) {
    console.error("Attachment validation lookup failed:", err);
    return { error: "Attachment storage is temporarily unavailable. Please try again." };
  }
  if (!object) return { error: "Attachment upload was not found. Please upload it again." };

  const metadata = object.customMetadata || {};
  if (String(metadata.teamId || "").trim() !== String(teamId) || String(metadata.type || "").trim() !== type) {
    return { error: "Attachment is invalid or belongs to a different team. Please upload it again." };
  }

  return {
    attachment: {
      id: attachmentId,
      r2Key,
      type,
      caption: String(attachmentMeta.caption || "").slice(0, 500).trim() || null,
      sourcePlayId: String(attachmentMeta.sourcePlayId || "").slice(0, 512).trim() || null,
      sizeBytes: Number(attachmentMeta.sizeBytes) || null,
    },
  };
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
    attachments: p.attachments || [],
    replies: (p.replies || []).map(formatPost),
    replyCount: p.replyCount || 0,
    isOfficial: !!p.is_official,
    isBranchLocked: !!p.is_branch_locked,
  };
}

/** Resolve or create a D1 user record for hardcoded staff accounts. */
async function resolveAuthorId(db, session, teamId) {
  if (session.d1UserId) return session.d1UserId;

  // Hardcoded staff — look up by email (username) or create a synthetic record
  const email = `${session.username}@bcoffense.internal`;
  const existing = await db.prepare("SELECT id, team_id FROM users WHERE email = ? LIMIT 1").bind(email).first();
  if (existing) return String(existing.team_id || "") === String(teamId) ? existing.id : null;

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    `INSERT INTO users (id, email, display_name, role, team_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).bind(id, email, session.label || session.username, session.role, teamId, now, now).run();

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
