/**
 * D1 helpers for play discussion threads and posts.
 */

import { moderateContent, outcomeToStatus } from "./moderation.js";

const MAX_POST_LENGTH = 2000;
const PLAYER_EDIT_WINDOW_SECONDS = 900; // 15 minutes

/** Allowed reaction keys. Existing keys remain accepted for old reactions. */
const REACTION_KEYS = new Set([
  "thumbs_up", "thumbs_down", "heart", "football",
  "gold_medal", "six", "happy", "strong", "got_it",
  "same_question", "helpful",
]);

// ── Team helpers ──────────────────────────────────────────────────────────────

/**
 * Resolve the team already validated at the authentication boundary.
 *
 * New sessions always carry `teamId`: D1 principals are revalidated against
 * `users.team_id` on every request and static staff sessions receive the
 * configured primary-team ID. Keep the D1 lookup only for legacy callers that
 * pass an older session shape. A D1 principal with no team must fail closed;
 * it must never inherit an arbitrary team's discussion data.
 */
export async function getTeamId(db, session) {
  const directTeamId = String(session?.teamId || session?.team_id || "").trim();
  if (directTeamId) return directTeamId;

  const d1UserId = String(session?.d1UserId || session?.d1_user_id || "").trim();
  if (d1UserId) {
    const user = await db.prepare("SELECT team_id FROM users WHERE id = ? LIMIT 1")
      .bind(d1UserId).first();
    return String(user?.team_id || "").trim();
  }

  // Do not select or create a fallback team here. A missing team context is a
  // configuration/authentication error, not permission to act on whichever
  // team happens to be first in D1.
  return "";
}

/**
 * Load a post only after proving its owning thread belongs to `teamId`.
 *
 * Post IDs are globally addressable UUIDs and appear in several client URLs,
 * so an ID by itself must never be treated as authorization. Keep this join at
 * the data-helper layer so edits, reactions, moderation, and question-state
 * changes all fail closed consistently.
 */
export async function getTeamScopedPost(db, teamId, postId, opts = {}) {
  const cleanTeamId = String(teamId || "").trim();
  const cleanPostId = String(postId || "").trim();
  if (!cleanTeamId || !cleanPostId) return null;
  const includeDeleted = opts.includeDeleted === true;
  return db.prepare(
    `SELECT p.*, t.team_id, t.play_id
     FROM discussion_posts p
     JOIN play_threads t ON t.id = p.thread_id
     WHERE p.id = ? AND t.team_id = ?${includeDeleted ? "" : " AND p.deleted_at IS NULL"}
     LIMIT 1`,
  ).bind(cleanPostId, cleanTeamId).first() || null;
}

// ── Thread helpers ────────────────────────────────────────────────────────────

/** Get or lazily create a thread for a play. */
export async function getOrCreateThread(db, teamId, playId, playSig) {
  const existing = await db
    .prepare("SELECT * FROM play_threads WHERE team_id = ? AND play_id = ? LIMIT 1")
    .bind(teamId, playId)
    .first();
  if (existing) return existing;

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO play_threads (id, team_id, play_id, play_signature, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, teamId, playId, playSig || null, now, now)
    .run();
  return { id, team_id: teamId, play_id: playId, enabled: 1, locked: 0, comments_enabled: 1, questions_enabled: 1 };
}

export async function getThread(db, teamId, playId) {
  return db
    .prepare("SELECT * FROM play_threads WHERE team_id = ? AND play_id = ? LIMIT 1")
    .bind(teamId, playId)
    .first() || null;
}

// ── Post helpers ──────────────────────────────────────────────────────────────

const POST_SELECT = `
  p.id, p.thread_id, p.parent_post_id, p.root_post_id, p.depth,
  p.post_type, p.body, p.question_state, p.question_category,
  p.is_official, p.is_branch_locked,
  p.created_at, p.updated_at, p.edited_at, p.deleted_at,
  p.author_id, p.moderation_status,
  u.display_name AS author_name, u.role AS author_role
`;

/**
 * Load root posts for a thread (paginated, depth=0, oldest first).
 * Includes first few replies and reaction counts.
 */
export async function getThreadPosts(db, threadId, { limit = 20, afterId = null, userId = null } = {}) {
  let query, binds;
  if (afterId) {
    const cursor = await db
      .prepare("SELECT created_at FROM discussion_posts WHERE id = ? LIMIT 1")
      .bind(afterId).first();
    if (cursor) {
      query = `SELECT ${POST_SELECT} FROM discussion_posts p
               JOIN users u ON u.id = p.author_id
               WHERE p.thread_id = ? AND p.deleted_at IS NULL
                 AND p.moderation_status = 'approved'
                 AND (p.parent_post_id IS NULL OR p.depth = 0)
                 AND p.created_at > ?
               ORDER BY p.created_at ASC LIMIT ?`;
      binds = [threadId, cursor.created_at, limit + 1];
    }
  }
  if (!query) {
    query = `SELECT ${POST_SELECT} FROM discussion_posts p
             JOIN users u ON u.id = p.author_id
             WHERE p.thread_id = ? AND p.deleted_at IS NULL
               AND p.moderation_status = 'approved'
               AND (p.parent_post_id IS NULL OR p.depth = 0)
             ORDER BY p.created_at ASC LIMIT ?`;
    binds = [threadId, limit + 1];
  }

  const rows = await db.prepare(query).bind(...binds).all();
  const all = rows.results || [];
  const hasMore = all.length > limit;
  const page = hasMore ? all.slice(0, limit) : all;

  if (!page.length) return { posts: [], hasMore };

  // Attach reactions to root posts
  const postIds = page.map((p) => p.id);
  const reactionsMap = await getReactionsForPosts(db, postIds, userId);

  // Load first 3 replies per root post
  const replyRows = await db
    .prepare(
      `SELECT ${POST_SELECT},
         (SELECT COUNT(*) FROM discussion_posts r2
          WHERE r2.root_post_id = p.root_post_id AND r2.deleted_at IS NULL
            AND r2.moderation_status = 'approved') AS sibling_count
       FROM discussion_posts p
       JOIN users u ON u.id = p.author_id
       WHERE p.root_post_id IN (${postIds.map(() => '?').join(',')})
         AND p.deleted_at IS NULL AND p.moderation_status = 'approved'
         AND p.depth > 0
       ORDER BY p.created_at ASC`,
    )
    .bind(...postIds)
    .all();

  // Group replies by root_post_id, take first 3
  const repliesByRoot = {};
  const replyTotalByRoot = {};
  const replyIds = [];
  for (const r of (replyRows.results || [])) {
    const rid = r.root_post_id;
    if (!repliesByRoot[rid]) repliesByRoot[rid] = [];
    replyTotalByRoot[rid] = r.sibling_count || 0;
    if (repliesByRoot[rid].length < 3) {
      repliesByRoot[rid].push(r);
      replyIds.push(r.id);
    }
  }

  // Attach reactions to replies too
  const replyReactionsMap = replyIds.length
    ? await getReactionsForPosts(db, replyIds, userId)
    : {};

  // Batch-fetch attachments for all posts and visible replies
  const allFetchedIds = [...postIds, ...replyIds];
  const attachmentsMap = allFetchedIds.length
    ? await getAttachmentsForPosts(db, allFetchedIds)
    : {};

  const posts = page.map((p) => {
    const rootReplies = (repliesByRoot[p.id] || []).map((r) => ({
      ...r,
      reactions: replyReactionsMap[r.id] || [],
      attachments: attachmentsMap[r.id] || [],
    }));
    return {
      ...p,
      reactions: reactionsMap[p.id] || [],
      attachments: attachmentsMap[p.id] || [],
      replies: rootReplies,
      replyCount: replyTotalByRoot[p.id] || 0,
    };
  });

  return { posts, hasMore };
}

/** Load replies for a specific root post (for "load more replies" expansion). */
export async function getPostReplies(db, teamId, playId, rootPostId, { limit = 20, afterId = null, userId = null } = {}) {
  const root = await db.prepare(
    `SELECT p.id, p.thread_id
     FROM discussion_posts p
     JOIN play_threads t ON t.id = p.thread_id
     WHERE p.id = ?
       AND p.depth = 0
       AND p.deleted_at IS NULL
       AND t.team_id = ?
       AND t.play_id = ?
     LIMIT 1`,
  ).bind(rootPostId, teamId, playId).first();
  // Use the same no-results shape for an unknown, deleted, different-team, or
  // different-play root. That avoids turning this endpoint into a post-ID
  // enumeration oracle.
  if (!root) return { replies: [], hasMore: false };

  let query, binds;
  if (afterId) {
    const cursor = await db
      .prepare("SELECT created_at FROM discussion_posts WHERE id = ? AND thread_id = ? LIMIT 1")
      .bind(afterId, root.thread_id).first();
    if (cursor) {
      query = `SELECT ${POST_SELECT} FROM discussion_posts p
               JOIN users u ON u.id = p.author_id
               WHERE p.root_post_id = ? AND p.deleted_at IS NULL
                 AND p.thread_id = ?
                 AND p.moderation_status = 'approved' AND p.depth > 0
                 AND p.created_at > ?
               ORDER BY p.created_at ASC LIMIT ?`;
      binds = [rootPostId, root.thread_id, cursor.created_at, limit + 1];
    }
  }
  if (!query) {
    query = `SELECT ${POST_SELECT} FROM discussion_posts p
             JOIN users u ON u.id = p.author_id
             WHERE p.root_post_id = ? AND p.deleted_at IS NULL
               AND p.thread_id = ?
               AND p.moderation_status = 'approved' AND p.depth > 0
             ORDER BY p.created_at ASC LIMIT ?`;
    binds = [rootPostId, root.thread_id, limit + 1];
  }
  const rows = await db.prepare(query).bind(...binds).all();
  const all = rows.results || [];
  const hasMore = all.length > limit;
  const page = hasMore ? all.slice(0, limit) : all;
  if (!page.length) return { replies: [], hasMore };
  const ids = page.map((r) => r.id);
  const reactionsMap = await getReactionsForPosts(db, ids, userId);
  const attachmentsMap = await getAttachmentsForPosts(db, ids);
  return {
    replies: page.map((r) => ({
      ...r,
      reactions: reactionsMap[r.id] || [],
      attachments: attachmentsMap[r.id] || [],
    })),
    hasMore,
  };
}

/**
 * Create a new post (or reply). Returns the new post row + moderation info.
 * parentPostId: set to create a reply; omit for root posts.
 */
export async function createPost(db, { threadId, authorId, postType, body, parentPostId = null, questionCategory = null, moderationOpts = {}, clientPostId = null }) {
  const trimmed = sanitizePostBody(body);
  if (!trimmed) return { error: "Post body is required." };
  if (trimmed.length > MAX_POST_LENGTH) return { error: `Posts must be ${MAX_POST_LENGTH} characters or fewer.` };

  const id = clientPostId ? String(clientPostId).trim() : crypto.randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return { error: "Invalid message retry identifier." };
  }
  // The browser saves this UUID before sending. A lost mobile response may
  // retry the request, so return the original team/author-owned post instead
  // of inserting the same thought twice.
  const existingIdentity = await db.prepare(
    "SELECT thread_id, author_id FROM discussion_posts WHERE id = ? LIMIT 1",
  ).bind(id).first();
  if (existingIdentity) {
    if (existingIdentity.thread_id !== threadId || existingIdentity.author_id !== authorId) {
      return { error: "Message retry identifier is not valid for this thread." };
    }
    const existing = await db.prepare(`SELECT ${POST_SELECT} FROM discussion_posts p
      JOIN users u ON u.id = p.author_id WHERE p.id = ? LIMIT 1`).bind(id).first();
    if (!existing) return { error: "Could not recover the previous message." };
    const outcome = existing.moderation_status === "blocked"
      ? "block"
      : existing.moderation_status === "held" ? "review" : "allow";
    return { ...existing, _moderation: { outcome, displayWarning: null }, _idempotent: true };
  }

  // ── Reply ancestry ──────────────────────────────────────────────────────
  let rootPostId = null;
  let depth = 0;
  if (parentPostId) {
    const parent = await db
      .prepare("SELECT id, root_post_id, depth FROM discussion_posts WHERE id = ? AND thread_id = ? AND deleted_at IS NULL LIMIT 1")
      .bind(parentPostId, threadId).first();
    if (!parent) return { error: "Parent post not found." };
    rootPostId = parent.root_post_id || parent.id; // parent is root if it has no root_post_id
    depth = Math.min((parent.depth || 0) + 1, 2);  // cap visual depth at 2
  }

  // ── Content moderation ──────────────────────────────────────────────────
  const modResult = moderateContent(trimmed, {}, moderationOpts);
  const moderationStatus = outcomeToStatus(modResult.outcome);

  const now = Math.floor(Date.now() / 1000);
  const type = postType === "question" ? "question" : "comment";
  const questionState = type === "question" ? "open" : null;
  const qCategory = (type === "question" && questionCategory) ? String(questionCategory).slice(0, 64) : null;

  await db.prepare(
    `INSERT INTO discussion_posts
       (id, thread_id, author_id, post_type, body, question_state, question_category,
        parent_post_id, root_post_id, depth, moderation_status,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, threadId, authorId, type, trimmed, questionState, qCategory,
    parentPostId, rootPostId, depth, moderationStatus, now, now).run();

  // ── Store moderation action if held/blocked ──────────────────────────────
  if (modResult.outcome === "review" || modResult.outcome === "block") {
    const actionId = crypto.randomUUID();
    const actionType = modResult.outcome === "block" ? "auto_block" : "auto_review";
    const reason = modResult.category
      ? `Auto-${actionType}: ${modResult.category} (severity ${modResult.severity})`
      : `Auto-${actionType}`;
    await db.prepare(
      `INSERT INTO moderation_actions (id, post_id, action, reason, original_body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(actionId, id, actionType, reason, trimmed, now).run();
  }

  // Update thread updated_at (even for held posts — activity still happened)
  await db.prepare("UPDATE play_threads SET updated_at = ? WHERE id = ?").bind(now, threadId).run();

  // Return the post with author info
  const row = await db.prepare(`SELECT ${POST_SELECT} FROM discussion_posts p
    JOIN users u ON u.id = p.author_id WHERE p.id = ? LIMIT 1`).bind(id).first();

  return { ...row, _moderation: modResult };
}

/** Edit a post. Runs moderation on new body. Returns updated post or { error }. */
export async function editPost(db, teamId, postId, newBody, session) {
  const post = await getTeamScopedPost(db, teamId, postId);
  if (!post) return { error: "Post not found." };

  const isAuthor = session.d1UserId === post.author_id;
  const isStaff = session.role === "coach" || session.role === "admin";

  if (!isAuthor && !isStaff) return { error: "Not authorized." };

  // Players have a 15-min edit window
  if (isAuthor && !isStaff) {
    const age = Math.floor(Date.now() / 1000) - post.created_at;
    if (age > PLAYER_EDIT_WINDOW_SECONDS) return { error: "The edit window has passed." };
  }

  const trimmed = sanitizePostBody(newBody);
  if (!trimmed) return { error: "Post body cannot be empty." };
  if (trimmed.length > MAX_POST_LENGTH) return { error: `Posts must be ${MAX_POST_LENGTH} characters or fewer.` };

  // Run moderation on the new body
  const modResult = moderateContent(trimmed);
  const newStatus = outcomeToStatus(modResult.outcome);

  const now = Math.floor(Date.now() / 1000);
  await db.prepare("UPDATE discussion_posts SET body = ?, edited_at = ?, updated_at = ?, moderation_status = ? WHERE id = ?")
    .bind(trimmed, now, now, newStatus, postId).run();

  // Store moderation action if edited content is held/blocked
  if (modResult.outcome === "review" || modResult.outcome === "block") {
    const actionId = crypto.randomUUID();
    const actionType = modResult.outcome === "block" ? "auto_block" : "auto_review";
    const reason = `Edit ${actionType}: ${modResult.category || "policy"}`;
    await db.prepare(
      `INSERT INTO moderation_actions (id, post_id, action, reason, original_body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(actionId, postId, actionType, reason, trimmed, now).run();
  }

  const row = await db.prepare(`SELECT ${POST_SELECT} FROM discussion_posts p
    JOIN users u ON u.id = p.author_id WHERE p.id = ? LIMIT 1`).bind(postId).first();

  return { ...row, _moderation: modResult };
}

/** Soft-delete a post. Returns { ok } or { error }. */
export async function deletePost(db, teamId, postId, session) {
  const post = await getTeamScopedPost(db, teamId, postId);
  if (!post) return { error: "Post not found." };

  const isAuthor = session.d1UserId === post.author_id;
  const isStaff = session.role === "coach" || session.role === "admin";

  if (!isAuthor && !isStaff) return { error: "Not authorized." };

  if (isAuthor && !isStaff) {
    const age = Math.floor(Date.now() / 1000) - post.created_at;
    if (age > PLAYER_EDIT_WINDOW_SECONDS) return { error: "The delete window has passed." };
  }

  const now = Math.floor(Date.now() / 1000);
  await db.prepare("UPDATE discussion_posts SET deleted_at = ?, updated_at = ? WHERE id = ?")
    .bind(now, now, postId).run();

  return { ok: true };
}

/** Count posts in a thread (for display badge). */
export async function countThreadPosts(db, threadId) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM discussion_posts WHERE thread_id = ? AND deleted_at IS NULL AND moderation_status = 'approved'")
    .bind(threadId).first();
  return row?.n || 0;
}

/** Strip HTML to prevent XSS — server side defense-in-depth. */
export function sanitizePostBody(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, "")   // strip all tags
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();
}

// ── Reactions ─────────────────────────────────────────────────────────────────

/**
 * Get reaction counts (and "mine" flag) for a set of post IDs.
 * Returns { [postId]: [{key, count, mine}] }
 */
export async function getReactionsForPosts(db, postIds, userId) {
  if (!postIds || !postIds.length) return {};
  const placeholders = postIds.map(() => "?").join(",");
  const uid = userId || "";
  // Keep old stacked reaction rows from legacy clients from appearing as
  // several current choices. New writes replace the older choice; this query
  // also renders historic data with the same one-choice rule.
  const rows = await db
    .prepare(
      `SELECT post_id, reaction_key, COUNT(*) AS cnt,
       MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
       FROM reactions r WHERE post_id IN (${placeholders})
       AND NOT EXISTS (
         SELECT 1 FROM reactions newer
         WHERE newer.post_id = r.post_id AND newer.user_id = r.user_id
           AND (newer.created_at > r.created_at OR (newer.created_at = r.created_at AND newer.id > r.id))
       )
       GROUP BY post_id, reaction_key`,
    )
    .bind(uid, ...postIds)
    .all();

  const result = {};
  for (const row of rows.results || []) {
    if (!result[row.post_id]) result[row.post_id] = [];
    result[row.post_id].push({ key: row.reaction_key, count: row.cnt, mine: !!row.mine });
  }
  return result;
}

/**
 * Toggle a reaction on a post. Returns { ok, added, reactions } or { error }.
 * reactions is the updated list for the post.
 */
export async function toggleReaction(db, teamId, postId, userId, reactionKey) {
  if (!REACTION_KEYS.has(reactionKey)) return { error: "Invalid reaction." };
  if (!userId) return { error: "Player account required to react." };

  const post = await getTeamScopedPost(db, teamId, postId);
  if (!post) return { error: "Post not found." };

  const existing = await db
    .prepare("SELECT id FROM reactions WHERE post_id = ? AND user_id = ? AND reaction_key = ? LIMIT 1")
    .bind(postId, userId, reactionKey).first();

  const now = Math.floor(Date.now() / 1000);
  if (existing) {
    await db.batch([
      db.prepare("DELETE FROM reactions WHERE id = ?").bind(existing.id),
      db.prepare("UPDATE discussion_posts SET updated_at = ? WHERE id = ?").bind(now, postId),
    ]);
  } else {
    const id = crypto.randomUUID();
    // A reaction is one quick acknowledgment, not a stack of competing
    // emoji choices. Replacing the prior choice keeps the feed legible and
    // makes the picker state agree with the stored data.
    await db.batch([
      db.prepare("DELETE FROM reactions WHERE post_id = ? AND user_id = ?")
        .bind(postId, userId),
      db.prepare("INSERT INTO reactions (id, post_id, user_id, reaction_key, created_at) VALUES (?,?,?,?,?)")
        .bind(id, postId, userId, reactionKey, now),
      db.prepare("UPDATE discussion_posts SET updated_at = ? WHERE id = ?").bind(now, postId),
    ]);
  }

  // Return updated reactions for this post
  const reactionsMap = await getReactionsForPosts(db, [postId], userId);
  return { ok: true, added: !existing, reactions: reactionsMap[postId] || [] };
}

// ── Question state (Slice 6) ──────────────────────────────────────────────────

const VALID_QUESTION_STATES = new Set(["open", "answered", "resolved", "reopened"]);

/**
 * Set question state on a question post. Coaches can set any state;
 * question authors can set 'reopened' only.
 */
export async function setQuestionState(db, teamId, postId, newState, session) {
  if (!VALID_QUESTION_STATES.has(newState)) return { error: "Invalid state." };

  const post = await getTeamScopedPost(db, teamId, postId);
  if (!post) return { error: "Post not found." };
  if (post.post_type !== "question") return { error: "Only questions have a state." };

  const isStaff = session.role === "coach" || session.role === "admin";
  const isAuthor = session.d1UserId === post.author_id;
  if (!isStaff && !isAuthor) return { error: "Not authorized." };
  // Players can only reopen, not resolve
  if (!isStaff && newState !== "reopened") return { error: "Players can only reopen questions." };

  const now = Math.floor(Date.now() / 1000);
  await db.prepare("UPDATE discussion_posts SET question_state = ?, updated_at = ? WHERE id = ?")
    .bind(newState, now, postId).run();

  // Write state transition to history (best-effort)
  const changedById = session.d1UserId || null;
  if (changedById) {
    const histId = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO question_state_history (id, post_id, from_state, to_state, changed_by, changed_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(histId, postId, post.question_state, newState, changedById, now).run();
  }

  return { ok: true, questionState: newState };
}

/**
 * Lock or unlock a thread. Coaches only.
 */
export async function setThreadLock(db, teamId, playId, locked, session) {
  const isStaff = session.role === "coach" || session.role === "admin";
  if (!isStaff) return { error: "Coaches only." };

  const thread = await db
    .prepare("SELECT id FROM play_threads WHERE team_id = ? AND play_id = ? LIMIT 1")
    .bind(teamId, playId).first();
  if (!thread) return { error: "Thread not found." };

  const now = Math.floor(Date.now() / 1000);
  await db.prepare("UPDATE play_threads SET locked = ?, updated_at = ? WHERE id = ?")
    .bind(locked ? 1 : 0, now, thread.id).run();

  return { ok: true, locked: !!locked };
}

// ── Moderation queue helpers ──────────────────────────────────────────────────

/** Return posts pending moderation review for a team. Coaches only. */
export async function getPendingPosts(db, teamId, { limit = 50 } = {}) {
  const rows = await db.prepare(
    `SELECT ${POST_SELECT},
       t.play_id,
       ma.action AS mod_action, ma.reason AS mod_reason
     FROM discussion_posts p
     JOIN users u ON u.id = p.author_id
     JOIN play_threads t ON t.id = p.thread_id
     LEFT JOIN moderation_actions ma ON ma.post_id = p.id
     WHERE t.team_id = ?
       AND p.deleted_at IS NULL
       AND p.moderation_status IN ('pending_review', 'blocked')
     ORDER BY p.created_at ASC LIMIT ?`,
  ).bind(teamId, limit).all();
  return rows.results || [];
}

/**
 * Apply a moderation action to a post. Returns { ok, newStatus } or { error }.
 *
 * actions:
 *   "approve"      — publish the post as-is
 *   "reject"       — block the post permanently
 *   "warn"         — publish but record a warning against the author
 *   "edit_approve" — replace body with editedBody then publish (requires opts.editedBody)
 *   "mute"         — approve post but temporarily mute the author (requires opts.muteDays)
 *   "account_review" — flag author for manual account review (post stays pending)
 *   "lock_thread" — caller handles thread locking separately; here we just log the action
 */
export async function moderatePostAction(db, teamId, postId, action, reason, moderatorId, opts = {}) {
  const validActions = new Set(["approve", "reject", "block", "warn", "edit_approve", "mute", "account_review", "lock_thread"]);
  if (!validActions.has(action)) return { error: "Invalid action." };

  const post = await getTeamScopedPost(db, teamId, postId, { includeDeleted: true });
  if (!post) return { error: "Post not found." };

  const now = Math.floor(Date.now() / 1000);

  // ── Determine new visibility status ──────────────────────────────────────
  let newStatus;
  if (action === "approve" || action === "warn" || action === "mute") {
    newStatus = "approved";          // post becomes visible; author gets logged warning / mute
  } else if (action === "reject" || action === "block") {
    newStatus = "blocked";
  } else if (action === "edit_approve") {
    newStatus = "approved";
  } else {
    newStatus = post.moderation_status; // account_review / lock_thread — no visibility change
  }

  // ── Update post ──────────────────────────────────────────────────────────
  if (action === "edit_approve" && opts.editedBody) {
    const sanitized = sanitizePostBody(opts.editedBody);
    if (!sanitized) return { error: "Edited body is empty." };
    await db.prepare("UPDATE discussion_posts SET body = ?, moderation_status = ?, edited_at = ?, updated_at = ? WHERE id = ?")
      .bind(sanitized, newStatus, now, now, postId).run();
  } else {
    await db.prepare("UPDATE discussion_posts SET moderation_status = ?, updated_at = ? WHERE id = ?")
      .bind(newStatus, now, postId).run();
  }

  // ── Apply mute if requested ──────────────────────────────────────────────
  if (action === "mute" && post.author_id) {
    const muteDays = Math.min(Math.max(parseInt(opts.muteDays || 1, 10), 1), 30);
    const muteUntil = now + muteDays * 86400;
    await db.prepare("UPDATE users SET muted_until = ?, updated_at = ? WHERE id = ?")
      .bind(muteUntil, now, post.author_id).run();
  }

  // ── Log moderation action ─────────────────────────────────────────────────
  const actionId = crypto.randomUUID();
  const dbAction = (action === "block") ? "reject" : action; // normalize "block" alias
  await db.prepare(
    `INSERT INTO moderation_actions (id, post_id, user_id, moderator_id, action, reason, original_body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(actionId, postId, post.author_id || null, moderatorId, dbAction, reason || null, post.body, now).run();

  return { ok: true, newStatus };
}

// ── Rate-limit helpers ────────────────────────────────────────────────────────

/**
 * Count auto-flagged submissions (auto_review + auto_block) by an author within
 * the given time window. Used for rate limiting.
 */
export async function getRecentFlaggedCount(db, authorId, windowSecs) {
  const since = Math.floor(Date.now() / 1000) - windowSecs;
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM moderation_actions ma
       JOIN discussion_posts p ON p.id = ma.post_id
       WHERE p.author_id = ? AND ma.action IN ('auto_review', 'auto_block')
         AND ma.created_at >= ?`,
    )
    .bind(authorId, since)
    .first();
  return (row && row.cnt) || 0;
}

/**
 * Count posts auto-blocked (severe violations) by an author within the window.
 * Used to trigger coach notifications on repeated severe behaviour.
 */
export async function getRecentSevereCount(db, authorId, windowSecs) {
  const since = Math.floor(Date.now() / 1000) - windowSecs;
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM moderation_actions ma
       JOIN discussion_posts p ON p.id = ma.post_id
       WHERE p.author_id = ? AND ma.action = 'auto_block'
         AND ma.created_at >= ?`,
    )
    .bind(authorId, since)
    .first();
  return (row && row.cnt) || 0;
}

/**
 * Return the Unix timestamp for when a user's mute expires, or null if not muted.
 */
export async function getPlayerMuteUntil(db, userId) {
  const row = await db.prepare("SELECT muted_until FROM users WHERE id = ? LIMIT 1").bind(userId).first();
  if (!row || !row.muted_until) return null;
  const now = Math.floor(Date.now() / 1000);
  return row.muted_until > now ? row.muted_until : null; // expired mutes return null
}

/**
 * Load team-specific custom moderation terms from D1 and return them as
 * opts for moderateContent(). Called once per post creation request.
 * Returns { extraAllowlist: Set, extraBlocked: [] }
 */
export async function getCustomTermOpts(db, teamId) {
  if (!teamId) return { extraAllowlist: new Set(), extraBlocked: [] };
  const rows = await db.prepare(
    "SELECT term_normalized, type, category, severity FROM moderation_custom_terms WHERE team_id = ? LIMIT 200",
  ).bind(teamId).all();

  const extraAllowlist = new Set();
  const extraBlocked = [];

  for (const row of rows.results || []) {
    if (row.type === "allowlist") {
      extraAllowlist.add(String(row.term_normalized));
    } else if (row.type === "blocked" && row.category && row.severity) {
      const escaped = String(row.term_normalized).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      extraBlocked.push({
        re: new RegExp(`\\b${escaped}\\b`, "i"),
        category: row.category,
        severity: Number(row.severity),
        normCheck: true,
      });
    }
  }
  return { extraAllowlist, extraBlocked };
}

/**
 * Get moderation action counts by category for the past 7 and 30 days.
 * Used by the monitoring stats endpoint.
 */
export async function getModerationStats(db, teamId) {
  const now = Math.floor(Date.now() / 1000);
  const d7 = now - 7 * 86400;
  const d30 = now - 30 * 86400;

  // Count by action type for each time window
  const [total, week, month] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) AS cnt FROM moderation_actions ma
       JOIN discussion_posts p ON p.id = ma.post_id
       JOIN play_threads t ON t.id = p.thread_id
       WHERE t.team_id = ?`,
    ).bind(teamId).first(),
    db.prepare(
      `SELECT COUNT(*) AS cnt FROM moderation_actions ma
       JOIN discussion_posts p ON p.id = ma.post_id
       JOIN play_threads t ON t.id = p.thread_id
       WHERE t.team_id = ? AND ma.created_at >= ?`,
    ).bind(teamId, d7).first(),
    db.prepare(
      `SELECT COUNT(*) AS cnt FROM moderation_actions ma
       JOIN discussion_posts p ON p.id = ma.post_id
       JOIN play_threads t ON t.id = p.thread_id
       WHERE t.team_id = ? AND ma.created_at >= ?`,
    ).bind(teamId, d30).first(),
  ]);

  // Count false-positive reversals (approve of auto-flagged post)
  const reversals = await db.prepare(
    `SELECT COUNT(*) AS cnt FROM moderation_actions ma
     JOIN discussion_posts p ON p.id = ma.post_id
     JOIN play_threads t ON t.id = p.thread_id
     WHERE t.team_id = ? AND ma.action = 'approve'
       AND EXISTS (
         SELECT 1 FROM moderation_actions ma2
         WHERE ma2.post_id = ma.post_id AND ma2.action IN ('auto_review', 'auto_block')
       )`,
  ).bind(teamId).first();

  return {
    total: total?.cnt || 0,
    last7Days: week?.cnt || 0,
    last30Days: month?.cnt || 0,
    falsePositiveReversals: reversals?.cnt || 0,
  };
}

/**
 * Returns IDs of coaches/admins who are active in the team's discussions.
 * Used to target repeated-violation notifications.
 */
export async function getActiveCoachIds(db, teamId) {
  const rows = await db
    .prepare(
      `SELECT DISTINCT u.id FROM users u
       JOIN discussion_posts p ON p.author_id = u.id
       JOIN play_threads t ON t.id = p.thread_id
       WHERE t.team_id = ? AND u.role IN ('coach', 'admin', 'assistant', 'assistant_coach')
         AND p.deleted_at IS NULL`,
    )
    .bind(teamId)
    .all();
  return (rows.results || []).map((r) => r.id);
}

/**
 * Mark (or unmark) a reply as the official coach answer for its parent question.
 *
 * When marking official:
 *   - Sets is_official = 1 on the reply post.
 *   - Clears is_official from any previous official reply on the same question.
 *   - Sets pinned_reply_id on the root/question post to this reply.
 *
 * When unmarking:
 *   - Clears is_official on this post.
 *   - If pinned_reply_id on the question points to this post, clears it.
 *
 * Returns { ok, official } or { error }.
 */
export async function setOfficialAnswer(db, teamId, playId, postId, official, session) {
  const isStaff = session?.role === "coach" || session?.role === "admin";
  if (!isStaff) return { error: "Coaches only." };

  const now = Math.floor(Date.now() / 1000);

  // Load the reply post and verify it belongs to this team
  const post = await db
    .prepare(
      `SELECT p.id, p.thread_id, p.root_post_id, p.parent_post_id, p.depth
       FROM discussion_posts p
       JOIN play_threads t ON t.id = p.thread_id
       WHERE p.id = ? AND t.team_id = ? AND t.play_id = ? AND p.deleted_at IS NULL LIMIT 1`,
    )
    .bind(postId, teamId, playId)
    .first();
  if (!post) return { error: "Post not found." };
  if (post.depth === 0) return { error: "Cannot mark a root post as the official answer." };

  const questionId = post.root_post_id || post.parent_post_id;

  if (official) {
    // Clear any existing official answer on this question (only one allowed)
    await db
      .prepare(
        `UPDATE discussion_posts SET is_official = 0, updated_at = ?
         WHERE root_post_id = ? AND is_official = 1 AND id != ?`,
      )
      .bind(now, questionId, postId)
      .run();

    // Mark this reply as official
    await db
      .prepare(`UPDATE discussion_posts SET is_official = 1, updated_at = ? WHERE id = ?`)
      .bind(now, postId)
      .run();

    // Pin it on the parent question
    await db
      .prepare(`UPDATE discussion_posts SET pinned_reply_id = ?, updated_at = ? WHERE id = ?`)
      .bind(postId, now, questionId)
      .run();
  } else {
    // Unmark official
    await db
      .prepare(`UPDATE discussion_posts SET is_official = 0, updated_at = ? WHERE id = ?`)
      .bind(now, postId)
      .run();

    // Clear pinned_reply_id on the question only if it pointed to this post
    await db
      .prepare(
        `UPDATE discussion_posts SET pinned_reply_id = NULL, updated_at = ?
         WHERE id = ? AND pinned_reply_id = ?`,
      )
      .bind(now, questionId, postId)
      .run();
  }

  return { ok: true, official: !!official, questionId };
}

/**
 * Lock or unlock a single reply branch.
 * Locked branches prevent further replies under that root post.
 * Does not affect the rest of the play discussion.
 *
 * Returns { ok, locked } or { error }.
 */
export async function lockReplyBranch(db, teamId, postId, lock, session) {
  const isStaff = session?.role === "coach" || session?.role === "admin";
  if (!isStaff) return { error: "Coaches only." };

  const now = Math.floor(Date.now() / 1000);

  const post = await db
    .prepare(
      `SELECT p.id FROM discussion_posts p
       JOIN play_threads t ON t.id = p.thread_id
       WHERE p.id = ? AND t.team_id = ? AND p.deleted_at IS NULL LIMIT 1`,
    )
    .bind(postId, teamId)
    .first();
  if (!post) return { error: "Post not found." };

  await db
    .prepare(`UPDATE discussion_posts SET is_branch_locked = ?, updated_at = ? WHERE id = ?`)
    .bind(lock ? 1 : 0, now, postId)
    .run();

  return { ok: true, locked: !!lock };
}

/**
 * Look up the author_id and play_id for a post (for notification targeting).
 */
export async function getPostContext(db, postId) {
  return db
    .prepare(
      `SELECT p.author_id, p.body, p.post_type, p.root_post_id,
              t.play_id, t.team_id
       FROM discussion_posts p
       JOIN play_threads t ON t.id = p.thread_id
       WHERE p.id = ? AND p.deleted_at IS NULL LIMIT 1`,
    )
    .bind(postId)
    .first();
}

/**
 * Get all user IDs who reacted with a specific key on a given post.
 * Used to target "same question" reactors when a question is answered.
 */
export async function getReactorsByKey(db, postId, reactionKey) {
  const rows = await db
    .prepare(
      `SELECT r.user_id FROM reactions r
       WHERE r.post_id = ? AND r.reaction_key = ?
       AND NOT EXISTS (
         SELECT 1 FROM reactions newer
         WHERE newer.post_id = r.post_id AND newer.user_id = r.user_id
           AND (newer.created_at > r.created_at OR (newer.created_at = r.created_at AND newer.id > r.id))
       )`,
    )
    .bind(postId, reactionKey)
    .all();
  return (rows.results || []).map((r) => r.user_id);
}

// ── Attachment helpers ────────────────────────────────────────────────────────

/**
 * Create a post_attachments record after a post has been created.
 */
export async function createPostAttachment(db, { id, postId, type, r2Key, caption, sourcePlayId, sizeBytes }) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO post_attachments (id, post_id, type, r2_key, caption, source_play_id, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())`,
    )
    .bind(id, postId, type, r2Key, caption || null, sourcePlayId || null, sizeBytes || null)
    .run();
}

/**
 * Load attachments for a list of post IDs.
 * Returns only presentation metadata. R2 keys stay server-side; attachment
 * downloads resolve by ID through the post/team authorization join.
 */
export async function getAttachmentsForPosts(db, postIds) {
  if (!postIds || postIds.length === 0) return {};
  const ph = postIds.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT id, post_id, type, r2_key, caption, source_play_id, size_bytes, width, height
       FROM post_attachments WHERE post_id IN (${ph})
       ORDER BY created_at ASC`,
    )
    .bind(...postIds)
    .all();

  const map = {};
  for (const row of (rows.results || [])) {
    if (!map[row.post_id]) map[row.post_id] = [];
    map[row.post_id].push({
      id: row.id,
      type: row.type,
      caption: row.caption,
      sourcePlayId: row.source_play_id,
      sizeBytes: row.size_bytes,
      width: row.width,
      height: row.height,
    });
  }
  return map;
}
