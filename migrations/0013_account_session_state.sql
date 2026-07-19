-- Phase 0.5: session invalidation must be forward-migration safe.
--
-- Do not add this as a column to users: some existing D1 databases already
-- received that column outside the tracked migration history while others did
-- not. A separate state table gives every deployment the same contract without
-- an unsafe, non-idempotent ALTER TABLE users ADD COLUMN operation.

CREATE TABLE IF NOT EXISTS account_session_state (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  invalid_before INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_account_session_state_invalid_before
  ON account_session_state(invalid_before);
