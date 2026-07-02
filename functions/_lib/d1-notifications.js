/**
 * d1-notifications.js
 * CRUD helpers for in-app notifications stored in D1.
 * Also fires Web Push when env is provided.
 */

import { sendPushToUser } from "./d1-push.js";
import { getReactorsByKey } from "./d1-threads.js";

const NOTIF_EXPIRY_DAYS = 30;

/**
 * Create a notification for a user.
 * @param {object} opts - { userId, type, title, body, deepLink }
 */
export async function createNotification(db, { userId, type, title, body = null, deepLink = null }) {
  if (!userId || !type || !title) return null;
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + NOTIF_EXPIRY_DAYS * 86400;
  await db
    .prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, deep_link, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, userId, type, title, body, deepLink, now, expiresAt)
    .run();
  return id;
}

/**
 * Notify all players who have posted in a thread, when a coach replies.
 * Excludes the poster themselves. Caps at 20 recipients.
 */
export async function notifyOnCoachPost(db, threadId, coachId, coachName, playId, postBody, env = null) {
  const truncBody = String(postBody || "").slice(0, 120);
  const players = await db
    .prepare(
      `SELECT DISTINCT p.author_id FROM discussion_posts p
       JOIN users u ON u.id = p.author_id
       WHERE p.thread_id = ? AND p.author_id != ?
         AND p.deleted_at IS NULL AND u.role = 'player'
       LIMIT 20`,
    )
    .bind(threadId, coachId)
    .all();

  for (const row of players.results || []) {
    await createNotification(db, {
      userId: row.author_id,
      type: "coach_reply",
      title: `${coachName} replied`,
      body: truncBody,
      deepLink: playId,
    });
    if (env) {
      sendPushToUser(env, db, row.author_id, {
        title: `${coachName} replied`,
        body: truncBody,
        url: "/",
        tag: `coach-reply-${playId}`,
      }).catch(() => { });
    }
  }
}

/**
 * Notify the author of a question post when it is resolved.
 */
export async function notifyOnQuestionResolved(db, postId, resolverName, playId, env = null) {
  const post = await db
    .prepare(
      `SELECT p.author_id, p.body, u.role FROM discussion_posts p
       JOIN users u ON u.id = p.author_id WHERE p.id = ? LIMIT 1`,
    )
    .bind(postId)
    .first();
  if (!post || post.role !== "player") return;

  await createNotification(db, {
    userId: post.author_id,
    type: "question_resolved",
    title: `${resolverName} resolved your question`,
    body: String(post.body || "").slice(0, 120),
    deepLink: playId,
  });

  if (env) {
    sendPushToUser(env, db, post.author_id, {
      title: `${resolverName} resolved your question ✅`,
      body: String(post.body || "").slice(0, 100),
      url: "/",
      tag: `resolved-${postId}`,
    }).catch(() => { });
  }
}

/**
 * Return paginated notifications for a user (newest first).
 */
export async function getNotifications(db, userId, { limit = 25, offset = 0 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const rows = await db
    .prepare(
      `SELECT * FROM notifications
       WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(userId, now, limit + 1, offset)
    .all();
  const all = rows.results || [];
  const hasMore = all.length > limit;
  return { notifications: hasMore ? all.slice(0, limit) : all, hasMore };
}

/**
 * Return unread notification count for a user.
 */
export async function countUnread(db, userId) {
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM notifications
       WHERE user_id = ? AND read_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`,
    )
    .bind(userId, now)
    .first();
  return row?.cnt || 0;
}

/**
 * Mark a single notification read. Verifies ownership.
 */
export async function markRead(db, notifId, userId) {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(`UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL`)
    .bind(now, notifId, userId)
    .run();
}

/**
 * Mark all unread notifications read for a user.
 */
export async function markAllRead(db, userId) {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL`)
    .bind(now, userId)
    .run();
}

/**
 * Notify the author of a post when someone replies to it.
 * Skips notification if the replier is the post author (self-reply).
 */
export async function notifyOnReply(db, parentPostId, replyAuthorId, replyAuthorName, playId, replyBody, env = null) {
  const post = await db
    .prepare(
      `SELECT p.author_id, u.role FROM discussion_posts p
       JOIN users u ON u.id = p.author_id WHERE p.id = ? LIMIT 1`,
    )
    .bind(parentPostId)
    .first();
  if (!post || post.author_id === replyAuthorId) return; // no self-notify

  const truncBody = String(replyBody || "").slice(0, 120);
  await createNotification(db, {
    userId: post.author_id,
    type: "reply",
    title: `${replyAuthorName} replied to your post`,
    body: truncBody,
    deepLink: playId,
  });

  if (env) {
    sendPushToUser(env, db, post.author_id, {
      title: `${replyAuthorName} replied`,
      body: truncBody,
      url: "/",
      tag: `reply-${parentPostId}`,
    }).catch(() => { });
  }
}

/**
 * Notify when a coach marks a reply as the official answer:
 *   1. Notifies the question author.
 *   2. Notifies all users who reacted with "same_question" on the question.
 * Caps at 50 recipients total.
 */
export async function notifyOnOfficialAnswer(db, questionPostId, coachName, playId, env = null) {
  // Get the question author
  const question = await db
    .prepare(
      `SELECT p.author_id, p.body, u.role FROM discussion_posts p
       JOIN users u ON u.id = p.author_id WHERE p.id = ? LIMIT 1`,
    )
    .bind(questionPostId)
    .first();

  const recipientSet = new Set();

  if (question && question.role === "player") {
    recipientSet.add(question.author_id);
  }

  // Add "same_question" reactors (interested in the same answer)
  const sameQReactors = await getReactorsByKey(db, questionPostId, "same_question");
  for (const uid of sameQReactors) {
    if (recipientSet.size >= 50) break;
    recipientSet.add(uid);
  }

  for (const userId of recipientSet) {
    const isQuestionAuthor = question && userId === question.author_id;
    const title = isQuestionAuthor
      ? `${coachName} answered your question`
      : `${coachName} answered a question you followed`;
    const body = String(question?.body || "").slice(0, 100);

    await createNotification(db, {
      userId,
      type: "official_answer",
      title,
      body,
      deepLink: playId,
    });

    if (env) {
      sendPushToUser(env, db, userId, {
        title,
        body,
        url: "/",
        tag: `official-answer-${questionPostId}`,
      }).catch(() => { });
    }
  }
}

/**
 * Notify the original post author (and same_question reactors) that a coach
 * posted a visual (markup or image) reply to their post.
 */
export async function notifyOnVisualReply(db, parentPostId, coachName, playId, env = null) {
  const parent = await db
    .prepare(
      `SELECT p.author_id, p.body, u.role FROM discussion_posts p
       JOIN users u ON u.id = p.author_id WHERE p.id = ? LIMIT 1`,
    )
    .bind(parentPostId)
    .first();

  if (!parent || parent.role !== "player") return;

  const recipientSet = new Set([parent.author_id]);
  const sameQReactors = await getReactorsByKey(db, parentPostId, "same_question");
  for (const uid of sameQReactors) {
    if (recipientSet.size >= 50) break;
    recipientSet.add(uid);
  }

  for (const userId of recipientSet) {
    const title = `${coachName} added a marked-up answer`;
    const body  = String(parent.body || "").slice(0, 100);
    await createNotification(db, {
      userId,
      type:     "visual_reply",
      title,
      body,
      deepLink: playId,
    });
    if (env) {
      sendPushToUser(env, db, userId, {
        title,
        body,
        url: "/",
        tag: `visual-reply-${parentPostId}`,
      }).catch(() => {});
    }
  }
}
