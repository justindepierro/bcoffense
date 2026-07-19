-- Phase 0.5: make diagram pointers a tenant-scoped data plane.
--
-- Keep the original media_manifests table intact as recovery evidence. New
-- routes read only this table, whose composite key makes it impossible for a
-- Team B pointer to overwrite or resolve Team A media with the same media ID.

CREATE TABLE IF NOT EXISTS team_media_manifests (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  version TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL,
  checksum TEXT NOT NULL DEFAULT '',
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (team_id, media_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_team_media_manifests_lookup
  ON team_media_manifests(team_id, media_id, kind);

-- Deliberately do not copy legacy media_manifests into the active pointer
-- table. Historic rows can have blank checksums, ambiguous keys, or point at
-- the old global `media/plays/` namespace. Treating them as runtime authority
-- could show the wrong diagram on a player device. They remain recovery
-- evidence in media_manifests until an admin checksum-verifies the exact R2
-- object and promotes it through the explicit migration endpoint.
