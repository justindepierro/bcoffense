-- Phase 0.5: explicit team context for the player-release boundary.
--
-- This migration deliberately seeds a primary-team pointer only when exactly
-- one team exists. A multi-team database must be configured explicitly rather
-- than relying on an arbitrary first row.

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO app_settings (setting_key, setting_value, created_at, updated_at)
SELECT 'primary_team_id', id, unixepoch(), unixepoch()
FROM teams
WHERE (SELECT COUNT(*) FROM teams) = 1
ORDER BY created_at ASC
LIMIT 1;

-- Existing single-team accounts are made explicit. No rows are changed when
-- a primary team was not configured above.
UPDATE users
SET team_id = (
  SELECT setting_value
  FROM app_settings
  WHERE setting_key = 'primary_team_id'
),
updated_at = unixepoch()
WHERE team_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM app_settings
    WHERE setting_key = 'primary_team_id'
      AND setting_value <> ''
  );

