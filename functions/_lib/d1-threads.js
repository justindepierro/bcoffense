/**
 * D1 helpers for play discussion threads and posts.
 */

const MAX_POST_LENGTH = 2000;
const PLAYER_EDIT_WINDOW_SECONDS = 900; // 15 minutes

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
  p.id, p.thread_id, p.post_type, p.body, p.question_state,
  p.created_at, p.updated_at, p.edited_at, p.deleted_at,
  p.author_id, p.moderation_status,
  u.display_name AS author_name, u.role AS author_role
`;

/** Load posts for a thread (paginated, flat, oldest first). */
export async function getThreadPosts(db, threadId, { limit = 20, afterId = null } = {}) {
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
             ORDER BY p.created_at ASC LIMIT ?`;
    binds = [threadId, limit + 1];
  }

  const rows = await db.prepare(query).bind(...binds).all();
  const all = rows.results || [];
  const hasMore = all.length > limit;
  return { posts: hasMore ? all.slice(0, limit) : all, hasMore };
}

/** Create a new post. Returns the new post row. */
export async function createPost(db, { threadId, authorId, postType, body }) {
  const trimmed = String(body || "").trim();
  if (!trimmed) return { error: "Post body is required." };
  if (trimmed.length > MAX_POST_LENGTH) return { error: `Posts must be ${MAX_POST_LENGTH} characters or fewer.` };

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const type = postType === "question" ? "question" : "comment";
  const questionState = type === "question" ? "open" : null;

  await db.prepare(
    `INSERT INTO discussion_posts
       (id, thread_id, author_id, post_type, body, question_state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, threadId, authorId, type, trimmed, questionState, now, now).run();

  // Update thread updated_at
  await db.prepare("UPDATE play_threads SET updated_at = ? WHERE id = ?").bind(now, threadId).run();

  // Return the post with author info
  return db.prepare(`SELECT ${POST_SELECT} FROM discussion_posts p
    JOIN users u ON u.id = p.author_id WHERE p.id = ? LIMIT 1`).bind(id).first();
}

/** Edit a post. Returns updated post or { error }. */
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

  const trimmed = String(newBody || "").trim();
  if (!trimmed) return { error: "Post body cannot be empty." };
  if (trimmed.length > MAX_POST_LENGTH) return { error: `Posts must be ${MAX_POST_LENGTH} characters or fewer.` };

  const now = Math.floor(Date.now() / 1000);
  await db.prepare("UPDATE discussion_posts SET body = ?, edited_at = ?, updated_at = ? WHERE id = ?")
    .bind(trimmed, now, now, postId).run();

  return db.prepare(`SELECT ${POST_SELECT} FROM discussion_posts p
    JOIN users u ON u.id = p.author_id WHERE p.id = ? LIMIT 1`).bind(postId).first();
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
