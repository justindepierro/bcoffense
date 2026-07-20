-- Delivery receipts make homework operationally visible without changing the
-- immutable quiz snapshot a player was originally assigned.

ALTER TABLE quiz_assignment_recipients ADD COLUMN last_reminded_at INTEGER;
ALTER TABLE quiz_assignment_recipients ADD COLUMN notification_count INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS quiz_assignment_delivery_events (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES quiz_assignments(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN ('assigned', 'reminded', 'opened', 'attempted', 'completed')),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_quiz_assignment_delivery_events_assignment
  ON quiz_assignment_delivery_events(assignment_id, created_at DESC);
