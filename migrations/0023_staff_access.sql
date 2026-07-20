-- Managed coach permissions. New D1 coach accounts are denied write access
-- until an administrator grants explicit capability keys.
CREATE TABLE IF NOT EXISTS staff_access (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  permissions_json TEXT NOT NULL DEFAULT '[]',
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_staff_access_team_updated
  ON staff_access(team_id, updated_at DESC);
