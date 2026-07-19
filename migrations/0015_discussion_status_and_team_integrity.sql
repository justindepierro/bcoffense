-- Phase 0.5: align the database moderation enum with the runtime model.
--
-- The initial schema allowed only approved/pending/rejected/hidden while the
-- moderation engine has always emitted pending_review and blocked. Rebuild the
-- table instead of silently collapsing states: those states drive the coach
-- queue and must survive a backup/recovery round trip.
--
-- This migration also preserves every later discussion column/index introduced
-- by migrations 0002, 0006, and 0007. Foreign keys are temporarily disabled
-- only for the standard SQLite parent-table rebuild; the release preflight and
-- local migration test run PRAGMA foreign_key_check afterwards.

PRAGMA foreign_keys = OFF;

CREATE TABLE discussion_posts_v15 (
  id                TEXT PRIMARY KEY,
  thread_id         TEXT NOT NULL REFERENCES play_threads(id) ON DELETE CASCADE,
  -- These intentionally name the final table, not the temporary rebuild
  -- table. After the original table is dropped and this table is renamed,
  -- SQLite resolves them as the final table's self-references. Pointing at
  -- discussion_posts_v15 would leave broken foreign keys after the rename.
  parent_post_id    TEXT REFERENCES discussion_posts(id) ON DELETE SET NULL,
  root_post_id      TEXT REFERENCES discussion_posts(id) ON DELETE CASCADE,
  depth             INTEGER NOT NULL DEFAULT 0,
  author_id         TEXT NOT NULL REFERENCES users(id),
  post_type         TEXT NOT NULL CHECK (post_type IN ('comment', 'question', 'coach_clarification', 'announcement')),
  body              TEXT NOT NULL,
  question_state    TEXT CHECK (question_state IN ('open', 'answered', 'resolved', 'reopened')),
  pinned_reply_id   TEXT REFERENCES discussion_posts(id) ON DELETE SET NULL,
  script_id         TEXT,
  script_period_id  TEXT,
  opponent_id       TEXT,
  game_week_label   TEXT,
  position_context  TEXT,
  moderation_status TEXT NOT NULL DEFAULT 'approved' CHECK (moderation_status IN (
    'approved', 'pending', 'rejected', 'hidden', 'pending_review', 'blocked'
  )),
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at        INTEGER,
  edited_at         INTEGER,
  question_category TEXT,
  is_official       INTEGER NOT NULL DEFAULT 0,
  is_branch_locked  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO discussion_posts_v15 (
  id, thread_id, parent_post_id, root_post_id, depth, author_id, post_type,
  body, question_state, pinned_reply_id, script_id, script_period_id,
  opponent_id, game_week_label, position_context, moderation_status,
  created_at, updated_at, deleted_at, edited_at, question_category,
  is_official, is_branch_locked
)
SELECT
  id, thread_id, parent_post_id, root_post_id, depth, author_id, post_type,
  body, question_state, pinned_reply_id, script_id, script_period_id,
  opponent_id, game_week_label, position_context, moderation_status,
  created_at, updated_at, deleted_at, edited_at, question_category,
  is_official, is_branch_locked
FROM discussion_posts;

DROP TABLE discussion_posts;
ALTER TABLE discussion_posts_v15 RENAME TO discussion_posts;

CREATE INDEX IF NOT EXISTS idx_posts_thread ON discussion_posts(thread_id);
CREATE INDEX IF NOT EXISTS idx_posts_author ON discussion_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_parent ON discussion_posts(parent_post_id);
CREATE INDEX IF NOT EXISTS idx_posts_root ON discussion_posts(root_post_id);
CREATE INDEX IF NOT EXISTS idx_posts_state ON discussion_posts(question_state)
  WHERE question_state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_moderation ON discussion_posts(moderation_status);
CREATE INDEX IF NOT EXISTS idx_posts_thread_time ON discussion_posts(thread_id, created_at ASC)
  WHERE deleted_at IS NULL AND moderation_status = 'approved';
CREATE INDEX IF NOT EXISTS idx_posts_root_time ON discussion_posts(root_post_id, created_at ASC)
  WHERE deleted_at IS NULL AND moderation_status = 'approved';
CREATE INDEX IF NOT EXISTS idx_posts_open_questions ON discussion_posts(thread_id, question_state)
  WHERE question_state IN ('open', 'answered', 'reopened') AND deleted_at IS NULL;

PRAGMA foreign_keys = ON;
