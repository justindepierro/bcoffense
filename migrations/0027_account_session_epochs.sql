-- Opaque, per-account session-revocation epoch.
--
-- `invalid_before` remains in account_session_state for legacy cookies and
-- historic revocations. This separate state table avoids an unsafe ALTER on
-- prior production schemas and removes the same-second ambiguity inherent in
-- timestamp-only session invalidation: a revoked account receives a new random
-- epoch, and only a cookie signed with that exact epoch is accepted.

CREATE TABLE IF NOT EXISTS account_session_epochs (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  session_epoch TEXT NOT NULL,
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
