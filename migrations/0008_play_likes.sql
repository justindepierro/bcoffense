-- 0008_play_likes.sql
-- Play-level likes for canonical playbook plays.
-- Each user may like a play at most once (UNIQUE constraint).

CREATE TABLE IF NOT EXISTS play_likes (
  id          TEXT    PRIMARY KEY,
  play_id     TEXT    NOT NULL,
  user_id     TEXT    NOT NULL,
  team_id     TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(play_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_play_likes_play ON play_likes(play_id, team_id);
CREATE INDEX IF NOT EXISTS idx_play_likes_user ON play_likes(user_id, team_id);
