-- Server-authoritative Verified Call Recognition sessions.
--
-- Browser-generated quiz attempts remain in the historical ledger for audit,
-- but only rows explicitly stamped `score_origin = 'server'` count toward the
-- verified leaderboard. Historic browser reward and sticker records are also
-- retained for audit, but only post-migration staff mutations stamped with a
-- trusted staff origin may affect verified standings. The session and question
-- snapshots below are the source of truth for server-owned quiz rows.

ALTER TABLE player_quiz_attempts
  ADD COLUMN score_origin TEXT NOT NULL DEFAULT 'legacy_client'
  CHECK (score_origin IN ('legacy_client', 'server'));

ALTER TABLE player_quiz_attempts
  ADD COLUMN authoritative_session_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_quiz_attempts_authoritative_session
  ON player_quiz_attempts(team_id, authoritative_session_id)
  WHERE authoritative_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_player_quiz_attempts_verified_week
  ON player_quiz_attempts(team_id, score_origin, week_key);

ALTER TABLE player_reward_events
  ADD COLUMN reward_origin TEXT NOT NULL DEFAULT 'legacy_client'
  CHECK (reward_origin IN ('legacy_client', 'staff'));

ALTER TABLE player_helmet_stickers
  ADD COLUMN sticker_origin TEXT NOT NULL DEFAULT 'legacy_client'
  CHECK (sticker_origin IN ('legacy_client', 'staff'));

CREATE INDEX IF NOT EXISTS idx_player_reward_events_verified_week
  ON player_reward_events(team_id, reward_origin, week_key);

CREATE INDEX IF NOT EXISTS idx_player_helmet_stickers_verified_week
  ON player_helmet_stickers(team_id, sticker_origin, week_key);

CREATE TABLE IF NOT EXISTS authoritative_quiz_sessions (
  id                TEXT PRIMARY KEY,
  team_id           TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_name       TEXT NOT NULL,
  source_type       TEXT NOT NULL CHECK (source_type IN ('script', 'gameplan')),
  source_id         TEXT NOT NULL,
  source_title      TEXT NOT NULL,
  release_revision  TEXT NOT NULL,
  start_key         TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
  question_count    INTEGER NOT NULL CHECK (question_count BETWEEN 1 AND 10),
  score             INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  total_points      INTEGER NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  answered_count    INTEGER NOT NULL DEFAULT 0 CHECK (answered_count >= 0),
  correct_count     INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  wrong_count       INTEGER NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
  percent           INTEGER NOT NULL DEFAULT 0 CHECK (percent BETWEEN 0 AND 100),
  date_key          TEXT,
  week_key          TEXT,
  attempt_id        TEXT,
  started_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at        INTEGER NOT NULL,
  completed_at      INTEGER,
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(team_id, user_id, start_key)
);

-- A player may resume one live run at a time. Expired runs are transitioned to
-- `expired` by the server before a new source is accepted, preventing a UI
-- from accidentally switching sources while a scored run is still in flight.
CREATE UNIQUE INDEX IF NOT EXISTS idx_authoritative_quiz_sessions_active_player
  ON authoritative_quiz_sessions(team_id, user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_authoritative_quiz_sessions_player_recent
  ON authoritative_quiz_sessions(team_id, user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS authoritative_quiz_questions (
  session_id          TEXT NOT NULL REFERENCES authoritative_quiz_sessions(id) ON DELETE CASCADE,
  ordinal             INTEGER NOT NULL CHECK (ordinal BETWEEN 0 AND 9),
  prompt_json         TEXT NOT NULL,
  choices_json        TEXT NOT NULL,
  correct_choice_id   TEXT NOT NULL,
  answered_choice_id  TEXT,
  answered_at         INTEGER,
  is_correct          INTEGER CHECK (is_correct IN (0, 1)),
  PRIMARY KEY (session_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_authoritative_quiz_questions_unanswered
  ON authoritative_quiz_questions(session_id, answered_choice_id, ordinal);
