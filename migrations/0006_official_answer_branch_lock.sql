-- Migration 0006: Official answer flag and branch lock on discussion posts.
-- Also adds composite indexes for efficient thread-feed queries.

-- Mark a reply as the official coach answer (denormalized for fast reads)
ALTER TABLE discussion_posts ADD COLUMN is_official INTEGER NOT NULL DEFAULT 0;

-- Allow coaches to lock a single reply branch without locking the whole thread
ALTER TABLE discussion_posts ADD COLUMN is_branch_locked INTEGER NOT NULL DEFAULT 0;

-- Composite index: fetch all posts for a thread ordered by time (paginated feed)
CREATE INDEX IF NOT EXISTS idx_posts_thread_time ON discussion_posts(thread_id, created_at ASC)
  WHERE deleted_at IS NULL AND moderation_status = 'approved';

-- Composite index: fetch all replies for a root post (reply-tree expansion)
CREATE INDEX IF NOT EXISTS idx_posts_root_time ON discussion_posts(root_post_id, created_at ASC)
  WHERE deleted_at IS NULL AND moderation_status = 'approved';

-- Composite index: fetch open questions for a team (coach question queue)
CREATE INDEX IF NOT EXISTS idx_posts_open_questions ON discussion_posts(thread_id, question_state)
  WHERE question_state IN ('open', 'answered', 'reopened') AND deleted_at IS NULL;
