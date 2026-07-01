-- BCOffense D1 Initial Schema
-- Phase 3 (OMG Roadmap) — Relational foundation for player accounts, discussion, and notifications
-- Run: wrangler d1 execute bcoffense-db --file=migrations/0001_initial_schema.sql

-- ── Teams ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Users (authentication) ────────────────────────────────────────────────────
-- One row per person who can log in.
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  display_name      TEXT NOT NULL,
  first_name        TEXT NOT NULL DEFAULT '',
  last_name         TEXT NOT NULL DEFAULT '',
  role              TEXT NOT NULL CHECK (role IN ('admin', 'coach', 'player', 'assistant_coach')),
  team_id           TEXT REFERENCES teams(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'disabled', 'graduated', 'archived')),
  -- auth fields
  password_hash     TEXT,          -- bcrypt / SHA-256 hash; NULL until first login
  password_changed_at INTEGER,
  last_login_at     INTEGER,
  -- roster link
  roster_player_id  TEXT,          -- FK to roster_players.id once provisioned
  -- meta
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  disabled_at       INTEGER,
  disabled_reason   TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_team ON users(team_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ── Sessions ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,  -- secure random token stored in cookie
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  user_agent TEXT,
  ip_addr    TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ── Verification tokens (password reset, invitations) ────────────────────────
CREATE TABLE IF NOT EXISTS verification_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('password_reset', 'invitation', 'email_verify')),
  token_hash TEXT NOT NULL UNIQUE,  -- hashed; raw token sent by email only
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_vtokens_user ON verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_vtokens_hash ON verification_tokens(token_hash);

-- ── Roster players ────────────────────────────────────────────────────────────
-- Mirrors the existing localStorage team roster, but with stable server-side IDs.
CREATE TABLE IF NOT EXISTS roster_players (
  id              TEXT PRIMARY KEY,
  team_id         TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  display_name    TEXT NOT NULL,
  first_name      TEXT NOT NULL DEFAULT '',
  last_name       TEXT NOT NULL DEFAULT '',
  jersey_number   TEXT,
  primary_position TEXT,
  secondary_positions TEXT,  -- JSON array
  graduation_year INTEGER,
  active          INTEGER NOT NULL DEFAULT 1,  -- 1=active, 0=inactive
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,  -- linked account
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_roster_team ON roster_players(team_id);
CREATE INDEX IF NOT EXISTS idx_roster_user ON roster_players(user_id);

-- ── Play threads ──────────────────────────────────────────────────────────────
-- One canonical thread per play per team. Created lazily on first post.
CREATE TABLE IF NOT EXISTS play_threads (
  id              TEXT PRIMARY KEY,
  team_id         TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  play_id         TEXT NOT NULL,  -- client-side play._id (stable after #101)
  play_signature  TEXT,           -- fallback for plays without stable ID
  enabled         INTEGER NOT NULL DEFAULT 1,
  locked          INTEGER NOT NULL DEFAULT 0,
  comments_enabled  INTEGER NOT NULL DEFAULT 1,
  questions_enabled INTEGER NOT NULL DEFAULT 1,
  reactions_enabled INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_threads_play ON play_threads(team_id, play_id);
CREATE INDEX IF NOT EXISTS idx_threads_team ON play_threads(team_id);

-- ── Discussion posts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discussion_posts (
  id              TEXT PRIMARY KEY,
  thread_id       TEXT NOT NULL REFERENCES play_threads(id) ON DELETE CASCADE,
  parent_post_id  TEXT REFERENCES discussion_posts(id) ON DELETE SET NULL,
  root_post_id    TEXT REFERENCES discussion_posts(id) ON DELETE CASCADE,
  depth           INTEGER NOT NULL DEFAULT 0,
  author_id       TEXT NOT NULL REFERENCES users(id),
  post_type       TEXT NOT NULL CHECK (post_type IN ('comment', 'question', 'coach_clarification', 'announcement')),
  body            TEXT NOT NULL,
  -- question state (for post_type = 'question')
  question_state  TEXT CHECK (question_state IN ('open', 'answered', 'resolved', 'reopened')),
  pinned_reply_id TEXT REFERENCES discussion_posts(id) ON DELETE SET NULL,
  -- source context
  script_id       TEXT,
  script_period_id TEXT,
  opponent_id     TEXT,   -- stable opponent ID (#33)
  game_week_label TEXT,
  position_context TEXT,
  -- moderation
  moderation_status TEXT NOT NULL DEFAULT 'approved' CHECK (moderation_status IN ('approved', 'pending', 'rejected', 'hidden')),
  -- lifecycle
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at      INTEGER,  -- soft delete
  edited_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_posts_thread ON discussion_posts(thread_id);
CREATE INDEX IF NOT EXISTS idx_posts_author ON discussion_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_parent ON discussion_posts(parent_post_id);
CREATE INDEX IF NOT EXISTS idx_posts_root ON discussion_posts(root_post_id);
CREATE INDEX IF NOT EXISTS idx_posts_state ON discussion_posts(question_state) WHERE question_state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_moderation ON discussion_posts(moderation_status);

-- ── Question state history ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS question_state_history (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL REFERENCES discussion_posts(id) ON DELETE CASCADE,
  from_state  TEXT,
  to_state    TEXT NOT NULL,
  changed_by  TEXT NOT NULL REFERENCES users(id),
  changed_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  note        TEXT
);

CREATE INDEX IF NOT EXISTS idx_qsh_post ON question_state_history(post_id);

-- ── Reactions ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reactions (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL REFERENCES discussion_posts(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_key TEXT NOT NULL,  -- 'thumbs_up', 'heart', 'football', 'got_it', 'helpful', 'same_question', etc.
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- One reaction type per user per post
CREATE UNIQUE INDEX IF NOT EXISTS idx_reactions_unique ON reactions(post_id, user_id, reaction_key);
CREATE INDEX IF NOT EXISTS idx_reactions_post ON reactions(post_id);

-- ── In-app notifications ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,  -- 'coach_reply', 'question_resolved', 'new_quiz', 'script_published', etc.
  title         TEXT NOT NULL,
  body          TEXT,
  deep_link     TEXT,           -- URL or in-app path
  read_at       INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifs_read ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- ── Web Push subscriptions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,  -- client public key
  auth        TEXT NOT NULL,  -- auth secret
  user_agent  TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at INTEGER,
  failed_at   INTEGER         -- NULL = active; set when endpoint returns 410
);

CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

-- ── Notification preferences ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,   -- 'coach_reply', 'question_resolved', 'script_published', etc.
  in_app      INTEGER NOT NULL DEFAULT 1,
  push        INTEGER NOT NULL DEFAULT 1,
  email       INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_prefs_unique ON notification_preferences(user_id, category);

-- ── Moderation actions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS moderation_actions (
  id           TEXT PRIMARY KEY,
  post_id      TEXT REFERENCES discussion_posts(id) ON DELETE SET NULL,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,   -- user acted on (may differ from post author)
  moderator_id TEXT NOT NULL REFERENCES users(id),
  action       TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'hide', 'warn', 'lock_thread', 'mute', 'account_review', 'delete')),
  reason       TEXT,
  original_body TEXT,           -- preserved for audit where policy permits
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_modactions_post ON moderation_actions(post_id);
CREATE INDEX IF NOT EXISTS idx_modactions_mod ON moderation_actions(moderator_id);

-- ── Audit events ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_events (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  detail      TEXT,            -- JSON blob with change summary
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_events(created_at);
