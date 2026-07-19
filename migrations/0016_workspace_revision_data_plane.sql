-- Phase 2: immutable, team-scoped workspace and player-release revisions.
--
-- R2 holds the immutable payload bytes. D1 holds immutable revision metadata,
-- an auditable workspace-to-release commit record, and the current pointers.
-- `team_workspace_current` is the authoritative atomic head; its triggers keep
-- the separately queryable player-release pointer on the exact same commit.

CREATE TABLE IF NOT EXISTS team_workspace_revisions (
  team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  revision      TEXT NOT NULL,
  r2_key        TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL CHECK (size_bytes >= 0),
  content_type  TEXT NOT NULL DEFAULT 'application/json; charset=utf-8',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (team_id, revision),
  UNIQUE (team_id, r2_key)
);

CREATE INDEX IF NOT EXISTS idx_workspace_revisions_team_created
  ON team_workspace_revisions(team_id, created_at DESC);

CREATE TABLE IF NOT EXISTS team_player_release_revisions (
  team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  revision      TEXT NOT NULL,
  r2_key        TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL CHECK (size_bytes >= 0),
  content_type  TEXT NOT NULL DEFAULT 'application/json; charset=utf-8',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (team_id, revision),
  UNIQUE (team_id, r2_key)
);

CREATE INDEX IF NOT EXISTS idx_player_release_revisions_team_created
  ON team_player_release_revisions(team_id, created_at DESC);

-- A release body may be byte-for-byte identical across two workspace
-- revisions. Keep that immutable body deduplicated, while preserving every
-- workspace/release pairing as an auditable commit.
CREATE TABLE IF NOT EXISTS team_workspace_release_commits (
  team_id                 TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  workspace_revision      TEXT NOT NULL,
  player_release_revision TEXT NOT NULL,
  created_at              INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by              TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (team_id, workspace_revision, player_release_revision),
  FOREIGN KEY (team_id, workspace_revision)
    REFERENCES team_workspace_revisions(team_id, revision) ON DELETE CASCADE,
  FOREIGN KEY (team_id, player_release_revision)
    REFERENCES team_player_release_revisions(team_id, revision) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workspace_release_commits_workspace
  ON team_workspace_release_commits(team_id, workspace_revision, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_release_commits_release
  ON team_workspace_release_commits(team_id, player_release_revision, created_at DESC);

-- This is the only mutable workspace head. A conditional update of this row
-- moves both the workspace and the already-built player release together.
CREATE TABLE IF NOT EXISTS team_workspace_current (
  team_id                 TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  workspace_revision      TEXT NOT NULL,
  player_release_revision TEXT NOT NULL,
  updated_at              INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by              TEXT REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (team_id, workspace_revision, player_release_revision)
    REFERENCES team_workspace_release_commits(
      team_id, workspace_revision, player_release_revision
    ) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workspace_current_release
  ON team_workspace_current(team_id, player_release_revision);

-- Kept as a first-class pointer for player reads, but maintained exclusively
-- by the authoritative workspace head so the two cannot drift during normal
-- commits.
CREATE TABLE IF NOT EXISTS team_player_release_current (
  team_id                 TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  player_release_revision TEXT NOT NULL,
  workspace_revision      TEXT NOT NULL,
  updated_at              INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by              TEXT REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (team_id, workspace_revision, player_release_revision)
    REFERENCES team_workspace_release_commits(
      team_id, workspace_revision, player_release_revision
    ) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_release_current_revision
  ON team_player_release_current(team_id, player_release_revision);

CREATE TRIGGER IF NOT EXISTS team_workspace_current_insert_player_release_head
AFTER INSERT ON team_workspace_current
BEGIN
  INSERT INTO team_player_release_current (
    team_id, player_release_revision, workspace_revision, updated_at, updated_by
  ) VALUES (
    NEW.team_id, NEW.player_release_revision, NEW.workspace_revision,
    NEW.updated_at, NEW.updated_by
  )
  ON CONFLICT(team_id) DO UPDATE SET
    player_release_revision = excluded.player_release_revision,
    workspace_revision = excluded.workspace_revision,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;
END;

CREATE TRIGGER IF NOT EXISTS team_workspace_current_update_player_release_head
AFTER UPDATE OF workspace_revision, player_release_revision, updated_at, updated_by
ON team_workspace_current
BEGIN
  INSERT INTO team_player_release_current (
    team_id, player_release_revision, workspace_revision, updated_at, updated_by
  ) VALUES (
    NEW.team_id, NEW.player_release_revision, NEW.workspace_revision,
    NEW.updated_at, NEW.updated_by
  )
  ON CONFLICT(team_id) DO UPDATE SET
    player_release_revision = excluded.player_release_revision,
    workspace_revision = excluded.workspace_revision,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;
END;
