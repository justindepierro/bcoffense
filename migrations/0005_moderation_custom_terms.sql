-- Migration 0005: Custom moderation terms per team
-- Allows coaches/admins to add to the football allowlist or escalate severity
-- for newly observed coded language.

CREATE TABLE IF NOT EXISTS moderation_custom_terms (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  team_id      TEXT REFERENCES teams(id) ON DELETE CASCADE,
  term_display TEXT NOT NULL,           -- original display form (e.g. "hash route")
  term_normalized TEXT NOT NULL,        -- normalized form matched against normalize(text)
  type         TEXT NOT NULL CHECK (type IN ('allowlist', 'blocked')),
  category     TEXT,                    -- for blocked: profanity | slur | harassment | etc.
  severity     INTEGER,                 -- for blocked: 1-4; NULL for allowlist
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_custom_terms_team ON moderation_custom_terms(team_id, type);
