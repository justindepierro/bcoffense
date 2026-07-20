-- Private coach-assigned quiz homework. Assignments are team-scoped and each
-- recipient row is the authorization boundary for a player's work.

CREATE TABLE IF NOT EXISTS quiz_assignments (
  id                TEXT PRIMARY KEY,
  team_id           TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  instructions      TEXT,
  items_json        TEXT NOT NULL,
  quiz_mode         TEXT NOT NULL DEFAULT 'quick',
  position_key      TEXT,
  required_score    INTEGER NOT NULL DEFAULT 0,
  due_at            INTEGER,
  status            TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  archived_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_quiz_assignments_team_status_due
  ON quiz_assignments(team_id, status, due_at DESC);

CREATE TABLE IF NOT EXISTS quiz_assignment_recipients (
  assignment_id     TEXT NOT NULL REFERENCES quiz_assignments(id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at        INTEGER,
  completed_at      INTEGER,
  latest_attempt_id TEXT,
  best_percent      INTEGER NOT NULL DEFAULT 0,
  attempts_count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (assignment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_assignment_recipients_player
  ON quiz_assignment_recipients(user_id, completed_at, assigned_at DESC);
