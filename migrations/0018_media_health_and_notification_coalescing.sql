-- Automated Cloud media-health history and one-time notification cleanup.

CREATE TABLE IF NOT EXISTS media_health_runs (
  id                          TEXT PRIMARY KEY,
  team_id                     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  status                      TEXT NOT NULL,
  started_at                  INTEGER NOT NULL,
  completed_at                INTEGER NOT NULL,
  diagram_pointer_count       INTEGER NOT NULL DEFAULT 0,
  diagram_object_count        INTEGER NOT NULL DEFAULT 0,
  missing_diagram_count       INTEGER NOT NULL DEFAULT 0,
  invalid_diagram_path_count  INTEGER NOT NULL DEFAULT 0,
  checksum_mismatch_count     INTEGER NOT NULL DEFAULT 0,
  clip_manifest_count         INTEGER NOT NULL DEFAULT 0,
  missing_clip_count          INTEGER NOT NULL DEFAULT 0,
  legacy_clip_manifest_count  INTEGER NOT NULL DEFAULT 0,
  release_age_seconds         INTEGER NOT NULL DEFAULT 0,
  detail_json                 TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_media_health_runs_team_time
  ON media_health_runs(team_id, completed_at DESC);

-- Keep the newest unread media update per player. The old client broadcast
-- path could create one alert for every diagram/clip save, which made the bell
-- unusable. Preserve history while clearing redundant unread noise.
UPDATE notifications
SET read_at = unixepoch()
WHERE type = 'media_update'
  AND read_at IS NULL
  AND rowid NOT IN (
    SELECT rowid FROM (
      SELECT rowid,
        ROW_NUMBER() OVER (
          PARTITION BY user_id, type
          ORDER BY created_at DESC, rowid DESC
        ) AS notification_rank
      FROM notifications
      WHERE type = 'media_update' AND read_at IS NULL
    )
    WHERE notification_rank = 1
  );
