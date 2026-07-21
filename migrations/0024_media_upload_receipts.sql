-- Server-visible receipts for browser-resident media upload intents.
--
-- The binary stays in the durable IndexedDB outbox until the source-specific
-- upload verifies it. These compact records let the scheduled health Worker
-- distinguish a normal offline device from a reachable device with a stalled
-- diagram or clip upload; no media bytes or player-private data are stored.

CREATE TABLE IF NOT EXISTS team_media_upload_receipts (
  id              TEXT PRIMARY KEY,
  team_id         TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('diagram', 'clip')),
  target_key      TEXT NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('queued', 'retrying', 'completed', 'blocked')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  bytes           INTEGER NOT NULL DEFAULT 0,
  queued_at       INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  completed_at    INTEGER,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  last_error      TEXT NOT NULL DEFAULT '',
  receipt_json    TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_team_media_upload_receipts_open
  ON team_media_upload_receipts(team_id, state, updated_at DESC);

-- Keep the media-health history compact but include the number of outstanding
-- browser intents reported to D1 at the time of each scheduled scan.
ALTER TABLE media_health_runs ADD COLUMN pending_upload_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE media_health_runs ADD COLUMN stuck_upload_count INTEGER NOT NULL DEFAULT 0;
