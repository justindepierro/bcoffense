/**
 * D1 helpers for play discussion threads and posts.
 */

import { moderateContent, outcomeToStatus } from "./moderation.js";

const MAX_POST_LENGTH = 2000;
const PLAYER_EDIT_WINDOW_SECONDS = 900; // 15 minutes

/** Allowed reaction keys (extended emoji set). */
const REACTION_KEYS = new Set([
  "thumbs_up", "thumbs_down", "heart", "football",
  "gold_medal", "six", "happy", "strong", "got_it",
  "same_question", "helpful",
]);

// ── Team helpers ──────────────────────────────────────────────────────────────

/** Return the first team in DB, or create a default one. */
export async function getOrCreateDefaultTeam(db) {
  const existing = await db.prepare("SELECT id FROM teams LIMIT 1").first();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await db.prepare("INSERT INTO teams (id, name, created_at, updated_at) VALUES (?, 'BCOffense', ?, ?)")
    .bind(id, now, now).run();
  return id;
}

/** Get team ID for a session user (D1 user has team_id; staff use default). */
export async function getTeamId(db, session) {
  if (session.d1UserId) {
    const user = await db.prepare("SELECT team_id FROM users WHERE id = ? LIMIT 1")
      .bind(session.d1UserId).first();
    if (user?.team_id) return user.team_id;
  }
  return getOrCreateDefaultTeam(db);
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

  const posts = page.map((p) => {
    const rootReplies = (repliesByRoot[p.id] || []).map((r) => ({
      ...r,
      reactions: replyReactionsMap[r.id] || [],
    }));
    return {
      ...p,
      reactions: reactionsMap[p.id] || [],
      replies: rootReplies,
      replyCount: replyTotalByRoot[p.id] || 0,
    };
  });

  return { posts, hasMore };
}

/** Load replies for a specific root post (for "load more replies" expansion). */
export async function getPostReplies(db, rootPostId, { limit = 20, afterId = null, userId = null } = {}) {
  let query, binds;
  if (afterId) {
    const cursor = await db
      .prepare("SELECT created_at FROM discussion_posts WHERE id = ? LIMIT 1")
      .bind(afterId).first();
    if (cursor) {
      query = `SELECT ${POST_SELECT} FROM discussion_posts p
               JOIN users u ON u.id = p.author_id
               WHERE p.root_post_id = ? AND p.deleted_at IS NULL
                 AND p.moderation_status = 'approved' AND p.depth > 0
                 AND p.created_at > ?
               ORDER BY p.created_at ASC LIMIT ?`;
      binds = [rootPostId, cursor.created_at, limit + 1];
    }
  }
  if (!query) {
    query = `SELECT ${POST_SELECT} FROM discussion_posts p
             JOIN users u ON u.id = p.author_id
             WHERE p.root_post_id = ? AND p.deleted_at IS NULL
               AND p.moderation_status = 'approved' AND p.depth > 0
             ORDER BY p.created_at ASC LIMIT ?`;
    binds = [rootPostId, limit + 1];
  }
  const rows = await db.prepare(query).bind(...binds).all();
  const all = rows.results || [];
  const hasMore = all.length > limit;
  const page = hasMore ? all.slice(0, limit) : all;
  if (!page.length) return { replies: [], hasMore };
  const ids = page.map((r) => r.id);
  const reactionsMap = await getReactionsForPosts(db, ids, userId);
  return { replies: page.map((r) => ({ ...r, reactions: reactionsMap[r.id] || [] })), hasMore };
}

/**
 * Create a new post (or reply). Returns the new post row + moderation info.
 * parentPostId: set to create a reply; omit for root posts.
 */
export async function createPost(db, { threadId, authorId, postType, body, parentPostId = null, questionCategory = null }) {
  const trimmed = sanitizePostBody(body);
  if (!trimmed) return { error: "Post body is required." };
  if (trimmed.length > MAX_POST_LENGTH) return { error: `Posts must be ${MAX_POST_LENGTH} characters or fewer.` };

  // ── Reply ancestry ──────────────────────────────────────────────────────
  let rootPostId = null;
  let depth = 0;
  if (parentPostId) {
    const parent = await db
      .prepare("SELECT id, root_post_id, depth FROM discussion_posts WHERE id = ? AND deleted_at IS NULL LIMIT 1")
      .bind(parentPostId).first();
    if (!parent) return { error: "Parent post not found." };
    rootPostId = parent.root_post_id || parent.id; // parent is root if it has no root_post_id
    depth = Math.min((parent.depth || 0) + 1, 2);  // cap visual depth at 2
  }

  // ── Content moderation ──────────────────────────────────────────────────
  const modResult = moderateContent(trimmed);
  const moderationStatus = outcomeToStatus(modResult.outcome);

  const id = crypto.randomUUID();
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
export async function editPost(db, postId, newBody, session) {
  const post = await db.prepare("SELECT * FROM discussion_posts WHERE id = ? AND deleted_at IS NULL LIMIT 1")
    .bind(postId).first();
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
export async function deletePost(db, postId, session) {
  const post = await db.prepare("SELECT * FROM discussion_posts WHERE id = ? AND deleted_at IS NULL LIMIT 1")
    .bind(postId).first();
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
  // Build query: group by post + key, flag user's own reactions
  const rows = await db
    .prepare(
      `SELECT post_id, reaction_key, COUNT(*) AS cnt,
       MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
       FROM reactions WHERE post_id IN (${placeholders})
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
export async function toggleReaction(db, postId, userId, reactionKey) {
  if (!REACTION_KEYS.has(reactionKey)) return { error: "Invalid reaction." };
  if (!userId) return { error: "Player account required to react." };

  const post = await db.prepare("SELECT id FROM discussion_posts WHERE id = ? AND deleted_at IS NULL LIMIT 1")
    .bind(postId).first();
  if (!post) return { error: "Post not found." };

  const existing = await db
    .prepare("SELECT id FROM reactions WHERE post_id = ? AND user_id = ? AND reaction_key = ? LIMIT 1")
    .bind(postId, userId, reactionKey).first();

  if (existing) {
    await db.prepare("DELETE FROM reactions WHERE id = ?").bind(existing.id).run();
  } else {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("INSERT INTO reactions (id, post_id, user_id, reaction_key, created_at) VALUES (?,?,?,?,?)")
      .bind(id, postId, userId, reactionKey, now).run();
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
export async function setQuestionState(db, postId, newState, session) {
  if (!VALID_QUESTION_STATES.has(newState)) return { error: "Invalid state." };

  const post = await db.prepare("SELECT * FROM discussion_posts WHERE id = ? AND deleted_at IS NULL LIMIT 1")
    .bind(postId).first();
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
 * Apply a moderation action to a post. Returns { ok } or { error }.
 * actions: "approve" | "reject" | "block" | "warn"
 */
export async function moderatePostAction(db, postId, action, reason, moderatorId) {
  const validActions = new Set(["approve", "reject", "block", "warn"]);
  if (!validActions.has(action)) return { error: "Invalid action." };

  const post = await db.prepare("SELECT * FROM discussion_posts WHERE id = ? LIMIT 1")
    .bind(postId).first();
  if (!post) return { error: "Post not found." };

  const now = Math.floor(Date.now() / 1000);

  let newStatus;
  if (action === "approve") newStatus = "approved";
  else if (action === "reject" || action === "block") newStatus = "blocked";
  else newStatus = post.moderation_status; // warn doesn't change visibility

  await db.prepare("UPDATE discussion_posts SET moderation_status = ?, updated_at = ? WHERE id = ?")
    .bind(newStatus, now, postId).run();

  const actionId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO moderation_actions (id, post_id, moderator_id, action, reason, original_body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(actionId, postId, moderatorId, action, reason || null, post.body, now).run();

  return { ok: true, newStatus };
}

