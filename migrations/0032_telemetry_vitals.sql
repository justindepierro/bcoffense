-- Web Vitals / performance telemetry (field data). No PII: authenticated
-- session role + coarse device context + numeric vitals only. Retention is
-- expected to be bounded by a periodic prune (kept small; sampled client-side).
CREATE TABLE IF NOT EXISTS telemetry_vitals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at  INTEGER NOT NULL,
  team_id      TEXT,
  role         TEXT,
  tab          TEXT,
  device       TEXT,
  connection   TEXT,
  nav_type     TEXT,
  lcp          REAL,
  inp          REAL,
  cls          REAL,
  fcp          REAL,
  ttfb         REAL,
  lcp_rating   TEXT,
  inp_rating   TEXT,
  cls_rating   TEXT
);

CREATE INDEX IF NOT EXISTS idx_telemetry_vitals_received_at
  ON telemetry_vitals(received_at);
