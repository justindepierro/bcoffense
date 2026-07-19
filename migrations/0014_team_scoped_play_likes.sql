-- Phase 0.5: the original uniqueness constraint omitted team_id.
--
-- Rebuild this small table so the same authenticated person can safely like a
-- play in two different teams. Until this migration runs, the route fails
-- closed with 409 rather than touching another team's row.

PRAGMA foreign_keys = OFF;

CREATE TABLE play_likes_v14 (
  id          TEXT    PRIMARY KEY,
  play_id     TEXT    NOT NULL,
  user_id     TEXT    NOT NULL,
  team_id     TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(team_id, play_id, user_id)
);

INSERT INTO play_likes_v14 (id, play_id, user_id, team_id, created_at)
SELECT id, play_id, user_id, team_id, created_at
FROM play_likes;

DROP TABLE play_likes;
ALTER TABLE play_likes_v14 RENAME TO play_likes;

CREATE INDEX IF NOT EXISTS idx_play_likes_play ON play_likes(play_id, team_id);
CREATE INDEX IF NOT EXISTS idx_play_likes_user ON play_likes(user_id, team_id);

PRAGMA foreign_keys = ON;
