-- Migration 0007: Post attachments for visual coach replies.
-- Stores metadata for images (markup screenshots, uploaded photos) attached
-- to discussion posts. Blobs live in the CLIPS R2 bucket under the
-- disc-attachments/ prefix; D1 stores only the metadata.

CREATE TABLE IF NOT EXISTS post_attachments (
  id           TEXT PRIMARY KEY,              -- UUID
  post_id      TEXT NOT NULL REFERENCES discussion_posts(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('markup', 'image')),
  r2_key       TEXT NOT NULL,                 -- e.g. disc-attachments/uuid.jpg
  width        INTEGER,
  height       INTEGER,
  size_bytes   INTEGER,
  caption      TEXT,
  source_play_id TEXT,                        -- canonical play ID for markup type
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_attachments_post ON post_attachments(post_id);
