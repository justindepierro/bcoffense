/**
 * d1-notifications.js
 * CRUD helpers for in-app notifications stored in D1.
 * Also fires Web Push when env is provided.
 */

import { sendPushToUser } from "./d1-push.js";
import { getReactorsByKey } from "./d1-threads.js";

const NOTIF_EXPIRY_DAYS = 30;
// Team-wide publish events can be emitted several times while a coach saves a
// script and its media. These are useful as one current alert, not dozens.
const TEAM_UPDATE_DEDUPE_WINDOWS = Object.freeze({
  media_update: 24 * 60 * 60,
  script_published: 24 * 60 * 60,
  new_quiz: 24 * 60 * 60,
  team_announcement: 10 * 60,
});

const STAFF_NOTIFICATION_ROLES = Object.freeze(["admin", "coach", "assistant", "assistant_coach"]);
const DISCUSSION_COMMENT_DEDUPE_SECONDS = 15 * 60;

/**
 * Return the D1 identity that owns an in-app notification feed.
 *
 * Player and managed-coach sessions already carry a D1 user id. The two
 * primary staff logins are static sessions, though, so they need a durable
 * team-scoped user row before the bell can receive alerts. Provision that row
 * the first time a staff member opens or polls notifications. This keeps the
 * notification recipient model identical for every staff account and avoids
 * tying delivery to whether someone has posted in a discussion before.
 */
export async function ensureNotificationUser(db, session) {
  const d1UserId = String(session?.d1UserId || "").trim();
  if (d1UserId) return d1UserId;

  const role = String(session?.role || "").trim();
  const teamId = String(session?.teamId || session?.team_id || "").trim();
  const username = String(session?.username || "").trim();
  if (!STAFF_NOTIFICATION_ROLES.includes(role) || !teamId || !username) return null;

  const email = `${username}@bcoffense.internal`;
  const existing = await db.prepare(
    "SELECT id, team_id, status FROM users WHERE email = ? LIMIT 1",
  ).bind(email).first();
  if (existing) {
    return String(existing.team_id || "") === teamId && existing.status === "active"
      ? existing.id
      : null;
  }

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  try {
    await db.prepare(
      `INSERT INTO users (id, email, display_name, role, team_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
    ).bind(id, email, session.label || username, role, teamId, now, now).run();
    return id;
  } catch (err) {
    // A second request may have provisioned the same static account while the
    // first was in flight. Re-read once before treating it as unavailable.
    const concurrent = await db.prepare(
      "SELECT id, team_id, status FROM users WHERE email = ? LIMIT 1",
    ).bind(email).first().catch(() => null);
    if (concurrent && String(concurrent.team_id || "") === teamId && concurrent.status === "active") {
      return concurrent.id;
    }
    throw err;
  }
}

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

async function createOrRefreshTeamNotification(db, { userId, type, title, body, deepLink }) {
  const now = Math.floor(Date.now() / 1000);
  const windowSeconds = TEAM_UPDATE_DEDUPE_WINDOWS[type] || 0;
  if (windowSeconds > 0) {
    const existing = await db.prepare(
      `SELECT id FROM notifications
       WHERE user_id = ? AND type = ? AND COALESCE(deep_link, '') = COALESCE(?, '')
         AND created_at >= ?
       ORDER BY created_at DESC LIMIT 1`,
    ).bind(userId, type, deepLink, now - windowSeconds).first();
    if (existing?.id) {
      await db.prepare(
        `UPDATE notifications
         SET title = ?, body = ?, read_at = NULL, created_at = ?, expires_at = ?
         WHERE id = ? AND user_id = ?`,
      ).bind(title, body, now, now + NOTIF_EXPIRY_DAYS * 86400, existing.id, userId).run();
      return { id: existing.id, coalesced: true };
    }
  }
  return { id: await createNotification(db, { userId, type, title, body, deepLink }), coalesced: false };
}

/**
 * Notify every active player on a team. Used when staff publish player-facing
 * work that lives in local/cloud backup data rather than D1 rows.
 */
export async function notifyTeamPlayers(db, teamId, notification = {}, env = null) {
  if (!teamId || !notification?.type || !notification?.title) {
    return { recipients: 0, pushSent: 0, pushTotal: 0 };
  }

  const rows = await db
    .prepare(
      `SELECT id FROM users
       WHERE team_id = ?
         AND role = 'player'
         AND status = 'active'
       LIMIT 500`,
    )
    .bind(teamId)
    .all();

  let recipients = 0;
  let pushSent = 0;
  let pushTotal = 0;
  let coalesced = 0;
  const body = notification.body ? String(notification.body).slice(0, 240) : null;
  const deepLink = notification.deepLink ? String(notification.deepLink).slice(0, 512) : null;

  for (const row of rows.results || []) {
    const notificationResult = await createOrRefreshTeamNotification(db, {
      userId: row.id,
      type: notification.type,
      title: String(notification.title).slice(0, 160),
      body,
      deepLink,
    });
    recipients += 1;
    if (notificationResult.coalesced) {
      coalesced += 1;
      continue;
    }

    if (env) {
      const result = await sendPushToUser(env, db, row.id, {
        title: String(notification.title).slice(0, 160),
        body: body || "",
        url: "/",
        tag: notification.tag || `${notification.type}-${deepLink || "team"}`,
      }).catch(() => null);
      if (result) {
        pushSent += result.sent || 0;
        pushTotal += result.total || 0;
      }
    }
  }

  return { recipients, coalesced, pushSent, pushTotal };
}

/**
 * Alert every active staff account on a team when a player contributes to a
 * play discussion. Questions and ordinary comments are deliberately both
 * first-class alerts: coaches should not have to rely on a player labeling a
 * message as a question for it to be visible in the bell.
 */
export async function notifyTeamStaffOfPlayerPost(db, teamId, {
  authorId,
  authorName,
  postType = "comment",
  parentPostId = null,
  playId,
  playLabel = "",
  body = "",
} = {}) {
  const cleanTeamId = String(teamId || "").trim();
  if (!cleanTeamId || !authorId || !playId) return { recipients: 0 };

  const rows = await db.prepare(
    `SELECT id FROM users
     WHERE team_id = ?
       AND status = 'active'
       AND role IN ('admin', 'coach', 'assistant', 'assistant_coach')
       AND id != ?
     LIMIT 100`,
  ).bind(cleanTeamId, authorId).all();

  const isQuestion = postType === "question";
  const isReply = Boolean(parentPostId);
  const kind = isQuestion ? "question" : isReply ? "reply" : "comment";
  const safeName = String(authorName || "A player").trim().slice(0, 120) || "A player";
  const safeLabel = String(playLabel || "").trim().slice(0, 160);
  const title = isQuestion
    ? `${safeName} asked a question`
    : `${safeName} ${isReply ? "replied" : "commented"}`;
  const context = safeLabel ? ` on ${safeLabel}` : " on a play";
  const message = String(body || "").trim().replace(/\s+/g, " ").slice(0, 220);

  let recipients = 0;
  for (const row of rows.results || []) {
    const notification = {
      userId: row.id,
      type: `player_${kind}`,
      title: `${title}${context}`,
      body: message || null,
      deepLink: `play:${playId}`,
    };
    // Several ordinary comments from the same player on the same play should
    // keep one fresh coach alert rather than turn the bell into a stack of
    // near-identical receipts. Questions and replies remain individual
    // because they need a direct coach response trail.
    if (kind === "comment") {
      await createOrRefreshDiscussionCommentNotification(db, notification);
    } else {
      await createNotification(db, notification);
    }
    recipients += 1;
  }
  return { recipients };
}

async function createOrRefreshDiscussionCommentNotification(db, notification) {
  const now = Math.floor(Date.now() / 1000);
  const existing = await db.prepare(
    `SELECT id FROM notifications
     WHERE user_id = ? AND type = ? AND title = ?
       AND COALESCE(deep_link, '') = COALESCE(?, '')
       AND created_at >= ?
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(
    notification.userId,
    notification.type,
    notification.title,
    notification.deepLink,
    now - DISCUSSION_COMMENT_DEDUPE_SECONDS,
  ).first();
  if (!existing?.id) return createNotification(db, notification);
  await db.prepare(
    `UPDATE notifications
     SET body = ?, read_at = NULL, created_at = ?, expires_at = ?
     WHERE id = ? AND user_id = ?`,
  ).bind(
    notification.body,
    now,
    now + NOTIF_EXPIRY_DAYS * 86400,
    existing.id,
    notification.userId,
  ).run();
  return existing.id;
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
export async function notifyOnReply(db, parentPostId, replyAuthorId, replyAuthorName, playId, replyBody, env = null, opts = {}) {
  const post = await db
    .prepare(
      `SELECT p.author_id, u.role FROM discussion_posts p
       JOIN users u ON u.id = p.author_id WHERE p.id = ? LIMIT 1`,
    )
    .bind(parentPostId)
    .first();
  if (!post || post.author_id === replyAuthorId) return; // no self-notify
  // Do not issue a generic reply notification when a richer visual-reply
  // receipt will be delivered separately.
  if (opts.skipPlayerRecipient && post.role === "player") return;
  // Player posts are already delivered to every active staff feed through
  // notifyTeamStaffOfPlayerPost(). Avoid placing a second generic reply alert
  // in the one staff member's bell when they were the parent author.
  if (opts.skipStaffRecipient && STAFF_NOTIFICATION_ROLES.includes(post.role)) return;

  const truncBody = String(replyBody || "").slice(0, 120);
  const notificationType = opts.notificationType === "coach_reply" ? "coach_reply" : "reply";
  const title = opts.title || `${replyAuthorName} replied to your post`;
  await createNotification(db, {
    userId: post.author_id,
    type: notificationType,
    title,
    body: truncBody,
    deepLink: playId,
  });

  if (env) {
    sendPushToUser(env, db, post.author_id, {
      title,
      body: truncBody,
      url: "/",
      tag: `${notificationType}-${parentPostId}`,
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
    const body = String(parent.body || "").slice(0, 100);
    await createNotification(db, {
      userId,
      type: "visual_reply",
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
      }).catch(() => { });
    }
  }
}
