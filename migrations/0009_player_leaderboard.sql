-- Cloudflare-backed player leaderboard data.
-- Stores local quiz attempts, coach/player reward events, and helmet stickers
-- so weekly/season leaderboards can aggregate across devices and accounts.

CREATE TABLE IF NOT EXISTS player_quiz_attempts (
  id                TEXT NOT NULL,
  team_id           TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  player_name       TEXT NOT NULL,
  source_type       TEXT,
  source_id         TEXT,
  title             TEXT,
  position_key      TEXT,
  position_label    TEXT,
  score             INTEGER NOT NULL DEFAULT 0,
  bonus_points      INTEGER NOT NULL DEFAULT 0,
  total_points      INTEGER NOT NULL DEFAULT 0,
  answered          INTEGER NOT NULL DEFAULT 0,
  correct           INTEGER NOT NULL DEFAULT 0,
  wrong             INTEGER NOT NULL DEFAULT 0,
  total_questions   INTEGER NOT NULL DEFAULT 0,
  remaining         INTEGER NOT NULL DEFAULT 0,
  percent           INTEGER NOT NULL DEFAULT 0,
  badge             TEXT,
  best_streak       INTEGER NOT NULL DEFAULT 0,
  question_breakdown TEXT,
  review            TEXT,
  completed         INTEGER NOT NULL DEFAULT 1,
  date_key          TEXT,
  week_key          TEXT,
  completed_at      INTEGER,
  client_updated_at INTEGER,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (team_id, id)
);

CREATE INDEX IF NOT EXISTS idx_player_quiz_attempts_team_week ON player_quiz_attempts(team_id, week_key);
CREATE INDEX IF NOT EXISTS idx_player_quiz_attempts_team_player ON player_quiz_attempts(team_id, player_name);
CREATE INDEX IF NOT EXISTS idx_player_quiz_attempts_team_user ON player_quiz_attempts(team_id, user_id);

CREATE TABLE IF NOT EXISTS player_reward_events (
  id                TEXT NOT NULL,
  team_id           TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  player_name       TEXT NOT NULL,
  type              TEXT,
  label             TEXT,
  points            INTEGER NOT NULL DEFAULT 0,
  note              TEXT,
  awarded_by        TEXT,
  source            TEXT,
  source_post_id    TEXT,
  source_play_id    TEXT,
  status            TEXT NOT NULL DEFAULT 'approved',
  date_key          TEXT,
  week_key          TEXT,
  created_at_client INTEGER,
  approved_at       INTEGER,
  approved_by       TEXT,
  server_created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (team_id, id)
);

CREATE INDEX IF NOT EXISTS idx_player_reward_events_team_week ON player_reward_events(team_id, week_key);
CREATE INDEX IF NOT EXISTS idx_player_reward_events_team_player ON player_reward_events(team_id, player_name);
CREATE INDEX IF NOT EXISTS idx_player_reward_events_team_status ON player_reward_events(team_id, status);

CREATE TABLE IF NOT EXISTS player_helmet_stickers (
  id                TEXT NOT NULL,
  team_id           TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  player_name       TEXT NOT NULL,
  sticker_key       TEXT,
  label             TEXT,
  icon              TEXT,
  color             TEXT,
  description       TEXT,
  note              TEXT,
  awarded_by        TEXT,
  context           TEXT,
  date_key          TEXT,
  week_key          TEXT,
  created_at_client INTEGER,
  server_created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (team_id, id)
);

CREATE INDEX IF NOT EXISTS idx_player_helmet_stickers_team_week ON player_helmet_stickers(team_id, week_key);
CREATE INDEX IF NOT EXISTS idx_player_helmet_stickers_team_player ON player_helmet_stickers(team_id, player_name);
