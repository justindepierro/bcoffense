-- Durable authentication rate-limit ledger.
-- The login route fails closed when this table is unavailable, so it must be
-- created by the migration history rather than assumed to exist in production.

CREATE TABLE IF NOT EXISTS login_attempts (
  id           TEXT PRIMARY KEY,
  ip_addr      TEXT NOT NULL,
  username     TEXT NOT NULL,
  success      INTEGER NOT NULL CHECK (success IN (0, 1)),
  attempted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip
  ON login_attempts(ip_addr, attempted_at);

CREATE INDEX IF NOT EXISTS idx_login_attempts_user
  ON login_attempts(username, attempted_at);
