-- Drop the legacy global media_manifests table (created in migration 0010),
-- superseded by team_media_manifests (migration 0012). Verified on 2026-08-09:
-- no live code references the bare media_manifests table, and its 122 rows are
-- a strict subset of the authoritative team-scoped table. A row-level export was
-- retained locally before this drop, so the change is recoverable if needed.
DROP TABLE IF EXISTS media_manifests;
