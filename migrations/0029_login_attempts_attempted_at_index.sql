-- Reset-issue and login-ledger retention both prune by attempted_at alone.
-- The existing IP/user composite indexes cannot serve that cleanup predicate.
CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at
  ON login_attempts(attempted_at);
