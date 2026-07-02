-- Migration 0004: Expanded moderation action set + nullable moderator_id + temporary mute
--
-- Fixes:
--   1. Adds auto_review, auto_block, edit_approve to moderation_actions action CHECK.
--   2. Makes moderator_id nullable so system (auto) actions can be recorded without a user.
--   3. Adds muted_until column to users for temporary post muting.
--
-- D1 / SQLite does not support ALTER TABLE ... MODIFY COLUMN or DROP CONSTRAINT.
-- We recreate the table using the standard rename-and-replace pattern.

PRAGMA foreign_keys = OFF;

CREATE TABLE moderation_actions_v4 (
  id            TEXT PRIMARY KEY,
  post_id       TEXT REFERENCES discussion_posts(id) ON DELETE SET NULL,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  moderator_id  TEXT REFERENCES users(id) ON DELETE SET NULL,  -- NULL for system auto-actions
  action        TEXT NOT NULL CHECK (action IN (
    'approve', 'reject', 'hide', 'warn', 'lock_thread', 'mute',
    'account_review', 'delete', 'auto_review', 'auto_block', 'edit_approve'
  )),
  reason        TEXT,
  original_body TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO moderation_actions_v4
  SELECT id, post_id, user_id, moderator_id, action, reason, original_body, created_at
  FROM moderation_actions;

DROP TABLE moderation_actions;
ALTER TABLE moderation_actions_v4 RENAME TO moderation_actions;

CREATE INDEX IF NOT EXISTS idx_modactions_post ON moderation_actions(post_id);
CREATE INDEX IF NOT EXISTS idx_modactions_mod  ON moderation_actions(moderator_id);
CREATE INDEX IF NOT EXISTS idx_modactions_user ON moderation_actions(user_id);

PRAGMA foreign_keys = ON;

-- Add temporary mute support to users (NULL = not muted)
ALTER TABLE users ADD COLUMN muted_until INTEGER;
