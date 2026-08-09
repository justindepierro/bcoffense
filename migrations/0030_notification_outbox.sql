-- Durable, per-recipient notification delivery intents.
--
-- The Pages producer writes the in-app notification and this row together.
-- Queue messages carry only this row's UUID; a dedicated Worker claims the
-- row before it performs the non-transactional Web Push side effect.

CREATE TABLE IF NOT EXISTS notification_outbox (
  id                     TEXT PRIMARY KEY,
  event_key              TEXT NOT NULL,
  team_id                TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  recipient_user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivery_kind          TEXT NOT NULL CHECK (delivery_kind IN ('team_broadcast', 'quiz_homework')),
  notification_type      TEXT NOT NULL,
  title                  TEXT NOT NULL,
  body                   TEXT,
  deep_link              TEXT,
  tag                    TEXT,
  homework_assignment_id TEXT REFERENCES quiz_assignments(id) ON DELETE CASCADE,
  homework_delivery_event_type TEXT
                         CHECK (homework_delivery_event_type IN ('assigned', 'reminded')),
  state                  TEXT NOT NULL DEFAULT 'pending'
                         CHECK (state IN ('pending', 'queued', 'processing', 'delivered', 'cancelled', 'dead')),
  attempt_count          INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at           INTEGER NOT NULL DEFAULT (unixepoch()),
  lease_token            TEXT,
  lease_expires_at       INTEGER,
  last_error             TEXT,
  push_sent              INTEGER NOT NULL DEFAULT 0 CHECK (push_sent >= 0),
  push_total             INTEGER NOT NULL DEFAULT 0 CHECK (push_total >= 0),
  created_at             INTEGER NOT NULL DEFAULT (unixepoch()),
  queued_at              INTEGER,
  delivered_at           INTEGER,
  cancelled_at           INTEGER,
  dead_at                INTEGER,
  updated_at             INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (
    (delivery_kind = 'team_broadcast' AND homework_assignment_id IS NULL)
    OR
    (delivery_kind = 'quiz_homework' AND homework_assignment_id IS NOT NULL
     AND homework_delivery_event_type IN ('assigned', 'reminded'))
  )
);

-- Claim a stable event key once, before recipient fan-out. The per-recipient
-- index below prevents duplicates, while this registry prevents an accidental
-- reuse of the same source event key for a different team/kind when recipient
-- sets do not overlap. Every outbox insert checks this scope in its own SQL,
-- so a concurrent conflicting caller cannot partially write deliveries.
CREATE TABLE IF NOT EXISTS notification_outbox_events (
  event_key              TEXT PRIMARY KEY,
  team_id                TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  delivery_kind          TEXT NOT NULL CHECK (delivery_kind IN ('team_broadcast', 'quiz_homework')),
  homework_assignment_id TEXT REFERENCES quiz_assignments(id) ON DELETE CASCADE,
  created_at             INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at             INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (
    (delivery_kind = 'team_broadcast' AND homework_assignment_id IS NULL)
    OR
    (delivery_kind = 'quiz_homework' AND homework_assignment_id IS NOT NULL)
  )
);

-- This is the durable idempotency boundary. Replaying a producer request with
-- the same stable event key cannot create a second delivery for a recipient.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_outbox_event_recipient
  ON notification_outbox(event_key, recipient_user_id);

-- The producer/cron repair loop looks only for intents that still need their
-- opaque Queue reference sent. The separate lease index makes abandoned Queue
-- consumer work recoverable without scanning delivery history.
CREATE INDEX IF NOT EXISTS idx_notification_outbox_due
  ON notification_outbox(state, available_at, created_at);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_lease
  ON notification_outbox(state, lease_expires_at);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_recipient
  ON notification_outbox(recipient_user_id, created_at DESC);

-- Publishing homework is a domain transaction that can finish before the
-- later per-recipient outbox fan-out. Keep one immutable initial-dispatch
-- marker in that same domain transaction so a Pages Function interruption or
-- temporary D1 failure cannot leave a published assignment permanently
-- unannounced. `event_key` and `payload_fingerprint` make reconciliation
-- replay-safe and prevent a later, changed publish payload from being treated
-- as a retry of the original assignment.
CREATE TABLE IF NOT EXISTS quiz_assignment_initial_notification_dispatches (
  assignment_id       TEXT PRIMARY KEY REFERENCES quiz_assignments(id) ON DELETE CASCADE,
  team_id             TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  event_key           TEXT NOT NULL UNIQUE,
  payload_fingerprint TEXT NOT NULL,
  state               TEXT NOT NULL DEFAULT 'pending'
                      CHECK (state IN ('pending', 'outbox_persisted')),
  outbox_persisted_at INTEGER,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_quiz_assignment_initial_dispatches_pending
  ON quiz_assignment_initial_notification_dispatches(team_id, state, created_at);

-- A homework delivery event is a receipt, not a best-effort side effect. Link
-- it to the outbox UUID so producer retries cannot double-increment reminders.
-- The table was introduced by migration 0022; retaining this idempotent
-- definition also keeps isolated Worker/database fixtures compatible.
CREATE TABLE IF NOT EXISTS quiz_assignment_delivery_events (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES quiz_assignments(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN ('assigned', 'reminded', 'opened', 'attempted', 'completed')),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

ALTER TABLE quiz_assignment_delivery_events
  ADD COLUMN notification_outbox_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_assignment_delivery_events_outbox
  ON quiz_assignment_delivery_events(notification_outbox_id)
  WHERE notification_outbox_id IS NOT NULL;

-- The outbox insert is the one durable creation boundary. Triggers keep the
-- matching bell record and homework receipt in the same D1 transaction while
-- allowing set-based fan-out (one D1 statement for up to 500 recipients).
CREATE TRIGGER IF NOT EXISTS trg_notification_outbox_insert_notification
AFTER INSERT ON notification_outbox
BEGIN
  INSERT OR IGNORE INTO notifications
    (id, user_id, type, title, body, deep_link, created_at, expires_at)
  VALUES
    (NEW.id, NEW.recipient_user_id, NEW.notification_type, NEW.title,
     NEW.body, NEW.deep_link, NEW.created_at, NEW.created_at + 2592000);
END;

CREATE TRIGGER IF NOT EXISTS trg_notification_outbox_insert_homework_receipt
AFTER INSERT ON notification_outbox
WHEN NEW.delivery_kind = 'quiz_homework'
 AND NEW.homework_delivery_event_type IN ('assigned', 'reminded')
BEGIN
  INSERT OR IGNORE INTO quiz_assignment_delivery_events
    (id, assignment_id, user_id, event_type, created_at, notification_outbox_id)
  VALUES
    (lower(hex(randomblob(16))), NEW.homework_assignment_id,
     NEW.recipient_user_id, NEW.homework_delivery_event_type,
     NEW.created_at, NEW.id);
END;

-- Only durable outbox receipts use notification_outbox_id. Keeping this in an
-- INSERT trigger makes a retry a no-op: the unique outbox receipt cannot make
-- a second reminder increment, while legacy NULL-linked receipts retain their
-- existing direct-helper behavior.
CREATE TRIGGER IF NOT EXISTS trg_notification_outbox_reminder_receipt
AFTER INSERT ON quiz_assignment_delivery_events
WHEN NEW.notification_outbox_id IS NOT NULL AND NEW.event_type = 'reminded'
BEGIN
  UPDATE quiz_assignment_recipients
     SET last_reminded_at = NEW.created_at,
         notification_count = notification_count + 1
   WHERE assignment_id = NEW.assignment_id
     AND user_id = NEW.user_id;
END;

-- `homework_assignment_id` cascades when a coach deletes an assignment. The
-- in-app notification table intentionally has no outbox foreign key, so make
-- the shared UUID linkage explicit and remove its now-invalid deep link too.
CREATE TRIGGER IF NOT EXISTS trg_notification_outbox_delete_notification
AFTER DELETE ON notification_outbox
BEGIN
  DELETE FROM notifications WHERE id = OLD.id;
END;
