-- Read-only retention ledger for canonical media cleanup.
-- A row is evidence that an immutable R2 diagram version has remained outside
-- the active manifest across complete scheduled scans. This table never grants
-- deletion on its own; a later admin review must make that explicit.

CREATE TABLE IF NOT EXISTS media_cleanup_candidates (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  scan_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'deleted')),
  PRIMARY KEY (team_id, r2_key)
);

CREATE INDEX IF NOT EXISTS idx_media_cleanup_candidates_due
  ON media_cleanup_candidates(team_id, status, first_seen_at);
