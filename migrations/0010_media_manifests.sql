-- Cloud-canonical media pointer. R2 stores immutable binary versions; D1
-- stores the one current approved version per media ID and media kind.
CREATE TABLE IF NOT EXISTS media_manifests (
  media_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  version TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL,
  checksum TEXT NOT NULL DEFAULT '',
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (media_id, kind)
);
