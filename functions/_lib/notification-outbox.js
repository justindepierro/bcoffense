/**
 * Durable notification delivery outbox.
 *
 * The normal request path creates a per-recipient in-app notification and
 * matching outbox row in one D1 batch. A Queue message contains only
 * `{ v: 1, id }`; the delivery Worker reads all notification copy from this
 * table, claims a short lease, then sends Web Push. The inbox record uses the
 * same UUID as the outbox row, so replaying an event cannot create duplicate
 * bell entries even if Queue delivers a message more than once.
 */

export const NOTIFICATION_OUTBOX_QUEUE_VERSION = 1;
export const NOTIFICATION_OUTBOX_LEASE_SECONDS = 120;
export const NOTIFICATION_OUTBOX_MAX_ATTEMPTS = 8;
export const NOTIFICATION_OUTBOX_REPAIR_AFTER_SECONDS = 5 * 60;

// notifyTeamPlayers historically supports up to 500 active players. Preserve
// that fan-out ceiling. Fan-out itself is set-based through SQLite json_each,
// keeping 500-recipient requests comfortably below D1 Free query/parameter
// limits instead of issuing one statement per player.
const MAX_RECIPIENTS = 500;
const MAX_EVENT_KEY_LENGTH = 240;
const MAX_TEAM_ID_LENGTH = 180;
const MAX_USER_ID_LENGTH = 180;
const MAX_OUTBOX_ID_LENGTH = 64;
const MAX_NOTIFICATION_TYPE_LENGTH = 48;
const MAX_NOTIFICATION_TITLE_LENGTH = 160;
const MAX_NOTIFICATION_BODY_LENGTH = 240;
const MAX_NOTIFICATION_DEEP_LINK_LENGTH = 512;
const MAX_NOTIFICATION_TAG_LENGTH = 160;
const MAX_HOMEWORK_ID_LENGTH = 180;
const MAX_ERROR_LENGTH = 240;
const MAX_QUEUE_PAYLOAD_BYTES = 256;
const OUTBOX_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELIVERY_KINDS = new Set(["team_broadcast", "quiz_homework"]);
const TERMINAL_STATES = new Set(["delivered", "dead"]);

const OUTBOX_COLUMNS = `
  id, event_key, team_id, recipient_user_id, delivery_kind,
  notification_type, title, body, deep_link, tag,
  homework_assignment_id, homework_delivery_event_type,
  state, attempt_count, available_at,
  lease_token, lease_expires_at, last_error, push_sent, push_total,
  created_at, queued_at, delivered_at, cancelled_at, dead_at, updated_at`;

const OUTBOX_COLUMNS_FROM_O = OUTBOX_COLUMNS
  .split(",")
  .map((column) => `o.${column.trim()}`)
  .join(", ");

const OUTBOX_SELECT = `SELECT ${OUTBOX_COLUMNS} FROM notification_outbox`;

export class NotificationOutboxError extends Error {
  constructor(message, code = "invalid_notification_outbox") {
    super(message);
    this.name = "NotificationOutboxError";
    this.code = code;
  }
}

function dbChanges(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function nowSeconds(value = Date.now()) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Math.floor(Date.now() / 1000);
  return Math.max(0, Math.floor(numeric > 100000000000 ? numeric / 1000 : numeric));
}

function requiredText(value, label, maxLength) {
  if (typeof value !== "string") throw new NotificationOutboxError(`${label} must be text.`);
  const text = value.trim();
  if (!text) throw new NotificationOutboxError(`${label} is required.`);
  if (text.length > maxLength) throw new NotificationOutboxError(`${label} is too long.`);
  if (text.includes("\0")) throw new NotificationOutboxError(`${label} contains an invalid character.`);
  return text;
}

function optionalText(value, label, maxLength) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, label, maxLength);
}

function cleanOutboxId(value) {
  const id = requiredText(value, "Notification outbox id", MAX_OUTBOX_ID_LENGTH);
  if (!OUTBOX_ID_PATTERN.test(id)) {
    throw new NotificationOutboxError("Notification outbox id is invalid.", "invalid_outbox_id");
  }
  return id;
}

function cleanLeaseToken(value) {
  if (typeof value !== "string" || !OUTBOX_ID_PATTERN.test(value.trim())) return "";
  return value.trim();
}

function cleanBoundedInteger(value, fallback, min, max) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeError(value, fallback) {
  const source = typeof value === "object" && value !== null
    ? value.message ?? value.error ?? value.reason
    : value;
  const text = String(source ?? fallback).replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, MAX_ERROR_LENGTH);
}

function queuePayloadByteLength(payload) {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
}

function requireBatchDatabase(db) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new NotificationOutboxError("D1 database binding with batch support is required.", "database_unavailable");
  }
  return db;
}

async function runAtomicBatch(db, statements) {
  const results = await requireBatchDatabase(db).batch(statements);
  if (!Array.isArray(results)) {
    throw new NotificationOutboxError("Notification outbox transaction did not commit.", "database_unavailable");
  }
  const failed = results.find((result) => result?.success === false);
  if (failed) {
    throw new NotificationOutboxError(
      String(failed.error || failed.message || failed.meta?.error || "Notification outbox transaction did not commit."),
      "database_unavailable",
    );
  }
  return results;
}

function normalizeCreateInput(input = {}) {
  const teamId = requiredText(input.teamId, "Team id", MAX_TEAM_ID_LENGTH);
  const eventKey = requiredText(input.eventKey, "Notification event key", MAX_EVENT_KEY_LENGTH);
  const deliveryKind = requiredText(input.deliveryKind, "Notification delivery kind", 40);
  if (!DELIVERY_KINDS.has(deliveryKind)) {
    throw new NotificationOutboxError("Notification delivery kind is invalid.", "invalid_delivery_kind");
  }

  const notification = input.notification && typeof input.notification === "object" && !Array.isArray(input.notification)
    ? input.notification
    : null;
  if (!notification) throw new NotificationOutboxError("Notification data is required.");

  const homeworkAssignmentId = optionalText(
    input.homeworkAssignmentId,
    "Homework assignment id",
    MAX_HOMEWORK_ID_LENGTH,
  );
  if (deliveryKind === "quiz_homework" && !homeworkAssignmentId) {
    throw new NotificationOutboxError("Homework delivery requires an assignment id.", "invalid_delivery_kind");
  }
  if (deliveryKind !== "quiz_homework" && homeworkAssignmentId) {
    throw new NotificationOutboxError("Only homework delivery may include an assignment id.", "invalid_delivery_kind");
  }
  const homeworkDeliveryEventType = deliveryKind === "quiz_homework"
    ? requiredText(input.homeworkDeliveryEventType ?? "assigned", "Homework delivery event type", 24)
    : null;
  if (homeworkDeliveryEventType && !["assigned", "reminded"].includes(homeworkDeliveryEventType)) {
    throw new NotificationOutboxError("Homework delivery event type is invalid.", "invalid_delivery_kind");
  }
  if (deliveryKind !== "quiz_homework" && input.homeworkDeliveryEventType !== undefined) {
    throw new NotificationOutboxError("Only homework delivery may include a homework event type.", "invalid_delivery_kind");
  }

  const uniqueRecipients = [];
  const seenRecipients = new Set();
  for (const rawId of Array.isArray(input.recipientUserIds) ? input.recipientUserIds : []) {
    const userId = requiredText(rawId, "Recipient user id", MAX_USER_ID_LENGTH);
    if (!seenRecipients.has(userId)) {
      seenRecipients.add(userId);
      uniqueRecipients.push(userId);
    }
  }
  if (uniqueRecipients.length > MAX_RECIPIENTS) {
    throw new NotificationOutboxError(`A notification can have at most ${MAX_RECIPIENTS} recipients.`);
  }

  return {
    teamId,
    eventKey,
    deliveryKind,
    homeworkAssignmentId,
    homeworkDeliveryEventType,
    recipientUserIds: uniqueRecipients,
    notification: {
      type: requiredText(notification.type, "Notification type", MAX_NOTIFICATION_TYPE_LENGTH),
      title: requiredText(notification.title, "Notification title", MAX_NOTIFICATION_TITLE_LENGTH),
      body: optionalText(notification.body, "Notification body", MAX_NOTIFICATION_BODY_LENGTH),
      deepLink: optionalText(notification.deepLink, "Notification deep link", MAX_NOTIFICATION_DEEP_LINK_LENGTH),
      tag: optionalText(notification.tag, "Notification tag", MAX_NOTIFICATION_TAG_LENGTH),
    },
  };
}

function encodedRecipients(recipientRows) {
  return JSON.stringify(recipientRows.map(({ id, recipientUserId }) => ({ id, recipientUserId })));
}

function sameEventScope(row, input) {
  return Boolean(row)
    && row.team_id === input.teamId
    && row.delivery_kind === input.deliveryKind
    && (row.homework_assignment_id || null) === (input.homeworkAssignmentId || null);
}

function eventScopeInsertStatement(db, input, now) {
  return db.prepare(
    `INSERT OR IGNORE INTO notification_outbox_events
      (event_key, team_id, delivery_kind, homework_assignment_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(input.eventKey, input.teamId, input.deliveryKind, input.homeworkAssignmentId, now, now);
}

async function getEventScope(db, eventKey) {
  return db.prepare(
    `SELECT event_key, team_id, delivery_kind, homework_assignment_id
       FROM notification_outbox_events WHERE event_key = ? LIMIT 1`,
  ).bind(eventKey).first();
}

function recipientCte() {
  return `WITH requested AS (
    SELECT CAST(key AS INTEGER) AS ordinal,
           json_extract(value, '$.id') AS id,
           json_extract(value, '$.recipientUserId') AS recipient_user_id
      FROM json_each(?)
  )`;
}

async function findCurrentOutboxRows(db, input, recipientPayload) {
  const eligibility = input.deliveryKind === "quiz_homework"
    ? `AND EXISTS (
         SELECT 1
           FROM quiz_assignment_recipients r
           JOIN quiz_assignments a ON a.id = r.assignment_id
          WHERE r.assignment_id = o.homework_assignment_id
            AND r.user_id = o.recipient_user_id
            AND a.team_id = o.team_id
            AND a.status = 'published'
       )`
    : "";
  const result = await db.prepare(
    `${recipientCte()}
     SELECT ${OUTBOX_COLUMNS_FROM_O}
       FROM notification_outbox o
       JOIN requested requested ON requested.recipient_user_id = o.recipient_user_id
       JOIN users u ON u.id = o.recipient_user_id
      WHERE o.event_key = ?
        AND o.team_id = ?
        AND o.delivery_kind = ?
        AND o.homework_assignment_id IS ?
        AND u.team_id = o.team_id
        AND u.role = 'player'
        AND u.status = 'active'
        ${eligibility}
      ORDER BY requested.ordinal ASC`,
  ).bind(recipientPayload, input.eventKey, input.teamId, input.deliveryKind, input.homeworkAssignmentId).all();
  return result.results || [];
}

async function getOutboxRow(db, id) {
  return db.prepare(`${OUTBOX_SELECT} WHERE id = ? LIMIT 1`).bind(id).first();
}

function toClaimedDelivery(row) {
  return {
    id: String(row.id),
    recipientUserId: String(row.recipient_user_id),
    teamId: String(row.team_id),
    // This token is intentionally not a Queue payload. It is scoped to one
    // D1 lease and must be echoed to terminal transitions so an expired worker
    // can never complete a newer claimant's delivery.
    leaseToken: String(row.lease_token || ""),
    attemptCount: Number(row.attempt_count || 0),
    notification: {
      type: String(row.notification_type || ""),
      title: String(row.title || ""),
      body: String(row.body || ""),
      deepLink: String(row.deep_link || ""),
      tag: String(row.tag || ""),
    },
  };
}

function isDue(row, now) {
  return Number(row?.available_at || 0) <= now;
}

function hasLiveLease(row, now) {
  return row?.state === "processing" && Number(row?.lease_expires_at || 0) > now;
}

function terminalClaimState(row) {
  if (!row) return "missing";
  if (row.state === "cancelled") return "cancelled";
  if (TERMINAL_STATES.has(row.state)) return "terminal";
  return null;
}

async function currentDeliveryEligibility(db, row) {
  if (!row || !DELIVERY_KINDS.has(String(row.delivery_kind || ""))) {
    return { ok: false, reason: "invalid_delivery_kind" };
  }

  const recipient = await db.prepare(
    `SELECT id FROM users
      WHERE id = ? AND team_id = ? AND role = 'player' AND status = 'active'
      LIMIT 1`,
  ).bind(row.recipient_user_id, row.team_id).first();
  if (!recipient) return { ok: false, reason: "recipient_ineligible" };

  if (row.delivery_kind !== "quiz_homework") return { ok: true };
  if (!row.homework_assignment_id) return { ok: false, reason: "homework_assignment_missing" };

  const assignment = await db.prepare(
    `SELECT a.id
       FROM quiz_assignments a
       JOIN quiz_assignment_recipients r ON r.assignment_id = a.id
       JOIN users u ON u.id = r.user_id
      WHERE a.id = ?
        AND a.team_id = ?
        AND a.status = 'published'
        AND r.user_id = ?
        AND u.team_id = ?
        AND u.role = 'player'
        AND u.status = 'active'
      LIMIT 1`,
  ).bind(
    row.homework_assignment_id,
    row.team_id,
    row.recipient_user_id,
    row.team_id,
  ).first();
  return assignment ? { ok: true } : { ok: false, reason: "homework_no_longer_assigned" };
}

function leaseTokenFrom(value) {
  return cleanLeaseToken(value?.leaseToken ?? value?.lease_token);
}

function transitionResult(row, fallback = "stale") {
  if (!row) return { state: "missing" };
  if (row.state === "cancelled") return { state: "cancelled", id: row.id };
  if (TERMINAL_STATES.has(row.state)) return { state: "terminal", id: row.id };
  return { state: fallback, id: row.id };
}

async function markExceededOutboxAttemptsDead(db, id, timestamp) {
  const result = await db.prepare(
    `UPDATE notification_outbox
        SET state = 'dead',
            dead_at = ?,
            updated_at = ?,
            lease_token = NULL,
            lease_expires_at = NULL,
            last_error = COALESCE(last_error, 'delivery retry limit reached')
      WHERE id = ?
        AND attempt_count >= ?
        AND (
          state IN ('pending', 'queued')
          OR (state = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
        )`,
  ).bind(timestamp, timestamp, id, NOTIFICATION_OUTBOX_MAX_ATTEMPTS, timestamp).run();
  return dbChanges(result) === 1;
}

/**
 * Build the only allowed Queue body. Notification content must never be added
 * here: Queue logs/retention are not the notification data plane.
 */
export function buildNotificationOutboxQueuePayload(outboxId) {
  const id = cleanOutboxId(outboxId);
  const payload = { v: NOTIFICATION_OUTBOX_QUEUE_VERSION, id };
  if (queuePayloadByteLength(payload) > MAX_QUEUE_PAYLOAD_BYTES) {
    throw new NotificationOutboxError("Notification queue payload is too large.", "payload_too_large");
  }
  return payload;
}

/** Strict parser for Queue consumers and tests; returns null for poison data. */
export function parseNotificationOutboxQueuePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const keys = Object.keys(payload).sort();
  if (keys.length !== 2 || keys[0] !== "id" || keys[1] !== "v") return null;
  if (payload.v !== NOTIFICATION_OUTBOX_QUEUE_VERSION || typeof payload.id !== "string") return null;
  try {
    const body = buildNotificationOutboxQueuePayload(payload.id);
    return body.id === payload.id.trim() ? body : null;
  } catch (_) {
    return null;
  }
}

function outboxInsertStatement(db, normalized, recipientPayload, now) {
  const scopeCheck = `EXISTS (
    SELECT 1 FROM notification_outbox_events e
     WHERE e.event_key = ?
       AND e.team_id = ?
       AND e.delivery_kind = ?
       AND e.homework_assignment_id IS ?
  )`;
  const homeworkEligibility = normalized.deliveryKind === "quiz_homework"
    ? `AND EXISTS (
         SELECT 1
           FROM quiz_assignment_recipients r
           JOIN quiz_assignments a ON a.id = r.assignment_id
          WHERE r.assignment_id = ?
            AND r.user_id = requested.recipient_user_id
            AND a.team_id = ?
            AND a.status = 'published'
       )`
    : "";
  const values = [
    recipientPayload,
    normalized.eventKey,
    normalized.teamId,
    normalized.deliveryKind,
    normalized.notification.type,
    normalized.notification.title,
    normalized.notification.body,
    normalized.notification.deepLink,
    normalized.notification.tag,
    normalized.homeworkAssignmentId,
    normalized.homeworkDeliveryEventType,
    now,
    now,
    now,
    normalized.teamId,
  ];
  if (normalized.deliveryKind === "quiz_homework") {
    values.push(normalized.homeworkAssignmentId, normalized.teamId);
  }
  values.push(
    normalized.eventKey,
    normalized.teamId,
    normalized.deliveryKind,
    normalized.homeworkAssignmentId,
  );
  return db.prepare(
    `${recipientCte()}
     INSERT OR IGNORE INTO notification_outbox
       (id, event_key, team_id, recipient_user_id, delivery_kind,
        notification_type, title, body, deep_link, tag,
        homework_assignment_id, homework_delivery_event_type,
        state, attempt_count, available_at, created_at, updated_at)
     SELECT requested.id, ?, ?, requested.recipient_user_id, ?,
            ?, ?, ?, ?, ?, ?, ?,
            'pending', 0, ?, ?, ?
       FROM requested
       JOIN users u ON u.id = requested.recipient_user_id
      WHERE u.team_id = ?
        AND u.role = 'player'
        AND u.status = 'active'
        ${homeworkEligibility}
        AND ${scopeCheck}`,
  ).bind(...values);
}

/**
 * Persist one inbox record and one outbox delivery for each currently eligible
 * recipient. `eventKey` is supplied by the producer and is the idempotency
 * contract: retries with the same event key return the original outbox IDs.
 */
export async function createNotificationOutboxDeliveries(db, input = {}) {
  requireBatchDatabase(db);
  const normalized = normalizeCreateInput(input);
  const now = nowSeconds(input.now);
  if (!normalized.recipientUserIds.length) {
    return {
      eventKey: normalized.eventKey,
      recipientIds: [],
      createdIds: [],
      existingIds: [],
      pendingIds: [],
      deliveries: [],
    };
  }
  const generatedRows = normalized.recipientUserIds.map((recipientUserId) => ({
    id: crypto.randomUUID(),
    recipientUserId,
  }));
  const recipientPayload = encodedRecipients(generatedRows);
  // Both statements run in one D1 transaction. The fan-out statement checks
  // the event registry scope itself, closing the race between a conflicting
  // stable event key and its recipient writes.
  await runAtomicBatch(db, [
    eventScopeInsertStatement(db, normalized, now),
    outboxInsertStatement(db, normalized, recipientPayload, now),
  ]);
  const scope = await getEventScope(db, normalized.eventKey);
  if (!sameEventScope(scope, normalized)) {
    throw new NotificationOutboxError(
      "Notification event key is already attached to a different delivery scope.",
      "event_key_collision",
    );
  }
  const rows = await findCurrentOutboxRows(db, normalized, recipientPayload);
  const generatedIds = new Set(generatedRows.map((row) => row.id));
  const orderedRows = rows;
  return {
    eventKey: normalized.eventKey,
    recipientIds: orderedRows.map((row) => row.recipient_user_id),
    createdIds: orderedRows.filter((row) => generatedIds.has(row.id)).map((row) => row.id),
    existingIds: orderedRows.filter((row) => !generatedIds.has(row.id)).map((row) => row.id),
    // A duplicate request may be the recovery path after Queue.send failed,
    // so return already-pending due IDs as well as newly-created ones.
    pendingIds: orderedRows
      .filter((row) => row.state === "pending" && isDue(row, now))
      .map((row) => row.id),
    deliveries: orderedRows.map((row) => ({
      id: row.id,
      recipientUserId: row.recipient_user_id,
      state: row.state,
      created: generatedIds.has(row.id),
    })),
  };
}

/** Mark a persisted intent queued only after Queue.send() has fulfilled. */
export async function markNotificationOutboxQueued(db, outboxId, now = Date.now()) {
  const id = cleanOutboxId(outboxId);
  const timestamp = nowSeconds(now);
  const result = await db.prepare(
    `UPDATE notification_outbox
        SET state = 'queued', queued_at = ?, updated_at = ?
      WHERE id = ? AND state IN ('pending', 'queued')`,
  ).bind(timestamp, timestamp, id).run();
  const row = await getOutboxRow(db, id);
  return row
    ? { id: row.id, state: row.state, queued: dbChanges(result) === 1 }
    : { state: "missing" };
}

/**
 * Batch form for the scheduled repair Worker. It intentionally returns only
 * an affected-row count: callers already hold opaque IDs and do not need a
 * per-row read merely to record successful Queue publication.
 */
export async function markNotificationOutboxQueuedBatch(db, outboxIds, now = Date.now()) {
  const ids = [...new Set((Array.isArray(outboxIds) ? outboxIds : [])
    .map((id) => String(id || "").trim())
    .filter((id) => OUTBOX_ID_PATTERN.test(id)))].slice(0, MAX_RECIPIENTS);
  if (!ids.length) return 0;
  const timestamp = nowSeconds(now);
  const result = await db.prepare(
    `UPDATE notification_outbox
        SET state = 'queued', queued_at = ?, updated_at = ?
      WHERE id IN (SELECT value FROM json_each(?))
        AND state IN ('pending', 'queued')`,
  ).bind(timestamp, timestamp, JSON.stringify(ids)).run();
  return dbChanges(result);
}

/**
 * Revalidate delivery authorization and atomically lease an outbox row.
 * Queue's at-least-once delivery is safe because only this state transition
 * authorizes a push attempt.
 */
export async function claimNotificationOutboxDelivery(db, outboxId, now = Date.now()) {
  const id = cleanOutboxId(outboxId);
  const timestamp = nowSeconds(now);
  const current = await getOutboxRow(db, id);
  const finalState = terminalClaimState(current);
  if (finalState) return { state: finalState };
  if (Number(current?.attempt_count || 0) >= NOTIFICATION_OUTBOX_MAX_ATTEMPTS && !hasLiveLease(current, timestamp)) {
    await markExceededOutboxAttemptsDead(db, id, timestamp);
    return { state: "terminal" };
  }
  if (!isDue(current, timestamp) || hasLiveLease(current, timestamp)) return { state: "not_due" };

  const eligibility = await currentDeliveryEligibility(db, current);
  if (!eligibility.ok) {
    await cancelNotificationOutboxDelivery(db, id, timestamp, eligibility.reason);
    return { state: "cancelled" };
  }

  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = timestamp + NOTIFICATION_OUTBOX_LEASE_SECONDS;
  // Re-check eligibility inside the write too. The read above gives a useful
  // cancellation reason; this correlated condition closes the race where a
  // player is disabled or a homework assignment is archived between read and
  // claim.
  const result = await db.prepare(
    `UPDATE notification_outbox
        SET state = 'processing',
            attempt_count = attempt_count + 1,
            lease_token = ?,
            lease_expires_at = ?,
            updated_at = ?
      WHERE id = ?
        AND available_at <= ?
        AND attempt_count < ?
        AND (
          state IN ('pending', 'queued')
          OR (state = 'processing' AND (lease_expires_at IS NULL OR lease_expires_at <= ?))
        )
        AND EXISTS (
          SELECT 1 FROM users u
           WHERE u.id = notification_outbox.recipient_user_id
             AND u.team_id = notification_outbox.team_id
             AND u.role = 'player'
             AND u.status = 'active'
        )
        AND (
          delivery_kind = 'team_broadcast'
          OR (
            delivery_kind = 'quiz_homework'
            AND homework_assignment_id IS NOT NULL
            AND EXISTS (
              SELECT 1
                FROM quiz_assignments a
                JOIN quiz_assignment_recipients r ON r.assignment_id = a.id
                JOIN users u ON u.id = r.user_id
               WHERE a.id = notification_outbox.homework_assignment_id
                 AND a.team_id = notification_outbox.team_id
                 AND a.status = 'published'
                 AND r.user_id = notification_outbox.recipient_user_id
                 AND u.team_id = notification_outbox.team_id
                 AND u.role = 'player'
                 AND u.status = 'active'
            )
          )
        )`,
  ).bind(
    leaseToken,
    leaseExpiresAt,
    timestamp,
    id,
    timestamp,
    NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
    timestamp,
  ).run();

  if (dbChanges(result) === 1) {
    const claimed = await db.prepare(
      `${OUTBOX_SELECT} WHERE id = ? AND state = 'processing' AND lease_token = ? LIMIT 1`,
    ).bind(id, leaseToken).first();
    if (claimed) return { state: "claimed", delivery: toClaimedDelivery(claimed) };
  }

  const latest = await getOutboxRow(db, id);
  const latestFinalState = terminalClaimState(latest);
  if (latestFinalState) return { state: latestFinalState };
  if (Number(latest?.attempt_count || 0) >= NOTIFICATION_OUTBOX_MAX_ATTEMPTS && !hasLiveLease(latest, timestamp)) {
    await markExceededOutboxAttemptsDead(db, id, timestamp);
    return { state: "terminal" };
  }
  if (!latest || !isDue(latest, timestamp) || hasLiveLease(latest, timestamp)) return { state: "not_due" };
  // The write's in-query authorization guard may have caught a just-changed
  // recipient or assignment. Cancel it rather than leaving it due forever.
  const latestEligibility = await currentDeliveryEligibility(db, latest);
  if (!latestEligibility.ok) {
    await cancelNotificationOutboxDelivery(db, id, timestamp, latestEligibility.reason);
    return { state: "cancelled" };
  }
  return { state: "not_due" };
}

/** Finalize a claimed delivery after the push worker has reached a terminal outcome. */
export async function completeNotificationOutboxDelivery(db, outboxId, now = Date.now(), result = {}) {
  const id = cleanOutboxId(outboxId);
  const timestamp = nowSeconds(now);
  const leaseToken = leaseTokenFrom(result);
  if (!leaseToken) return transitionResult(await getOutboxRow(db, id));
  const pushSent = cleanBoundedInteger(result?.pushSent, 0, 0, 100000);
  const pushTotal = cleanBoundedInteger(result?.pushTotal, 0, 0, 100000);
  const update = await db.prepare(
    `UPDATE notification_outbox
        SET state = 'delivered', delivered_at = ?, updated_at = ?,
            lease_token = NULL, lease_expires_at = NULL, last_error = NULL,
            push_sent = ?, push_total = ?
      WHERE id = ?
        AND state = 'processing'
        AND lease_token = ?
        AND lease_expires_at > ?`,
  ).bind(timestamp, timestamp, pushSent, pushTotal, id, leaseToken, timestamp).run();
  if (dbChanges(update) === 1) return { state: "delivered", id };
  return transitionResult(await getOutboxRow(db, id));
}

/**
 * Release a claimed record for delayed retry. `detail` can be a string or an
 * object `{ message, delaySeconds, leaseToken }`. A Worker may additionally
 * pass `hold: "configuration"` when a missing operator-managed Web Push
 * configuration prevented every send attempt. A configuration hold releases
 * the matching lease and refunds that claim's attempt, so a deploy missing
 * VAPID secrets cannot exhaust the normal transient-error retry budget.
 */
export async function retryNotificationOutboxDelivery(db, outboxId, now = Date.now(), detail = {}) {
  const id = cleanOutboxId(outboxId);
  const timestamp = nowSeconds(now);
  const leaseToken = leaseTokenFrom(detail);
  if (!leaseToken) return transitionResult(await getOutboxRow(db, id));
  const delaySeconds = cleanBoundedInteger(detail?.delaySeconds, 30, 0, 24 * 60 * 60);
  const configurationHold = detail?.hold === "configuration";
  const maxAttempts = NOTIFICATION_OUTBOX_MAX_ATTEMPTS;
  const error = normalizeError(detail, "Delivery retry requested.");
  const availableAt = timestamp + delaySeconds;
  if (configurationHold) {
    const holdUpdate = await db.prepare(
      `UPDATE notification_outbox
          SET state = 'pending',
              -- Claiming increments attempt_count before the Worker can
              -- discover VAPID configuration is unavailable. Refund only
              -- that successful, fenced claim; do not erase prior genuine
              -- transient delivery attempts.
              attempt_count = CASE WHEN attempt_count > 0 THEN attempt_count - 1 ELSE 0 END,
              available_at = ?,
              lease_token = NULL,
              lease_expires_at = NULL,
              last_error = ?,
              dead_at = NULL,
              updated_at = ?
        WHERE id = ?
          AND state = 'processing'
          AND lease_token = ?
          AND lease_expires_at > ?`,
    ).bind(availableAt, error, timestamp, id, leaseToken, timestamp).run();
    if (dbChanges(holdUpdate) === 1) return { state: "pending", id };
    return transitionResult(await getOutboxRow(db, id));
  }
  const update = await db.prepare(
    `UPDATE notification_outbox
        SET state = CASE WHEN attempt_count >= ? THEN 'dead' ELSE 'pending' END,
            available_at = CASE WHEN attempt_count >= ? THEN available_at ELSE ? END,
            lease_token = NULL,
            lease_expires_at = NULL,
            last_error = ?,
            dead_at = CASE WHEN attempt_count >= ? THEN ? ELSE dead_at END,
            updated_at = ?
      WHERE id = ?
        AND state = 'processing'
        AND lease_token = ?
        AND lease_expires_at > ?`,
  ).bind(
    maxAttempts,
    maxAttempts,
    availableAt,
    error,
    maxAttempts,
    timestamp,
    timestamp,
    id,
    leaseToken,
    timestamp,
  ).run();
  if (dbChanges(update) === 1) {
    const row = await getOutboxRow(db, id);
    return { state: row?.state === "dead" ? "dead" : "pending", id };
  }
  return transitionResult(await getOutboxRow(db, id));
}

/**
 * Stop a stale/malformed delivery and remove its corresponding bell record.
 * A token is mandatory for an active claim; non-claimed pending/queued rows
 * may be cancelled by a producer or revalidation path without one.
 */
export async function cancelNotificationOutboxDelivery(db, outboxId, now = Date.now(), reason = "delivery_cancelled") {
  const id = cleanOutboxId(outboxId);
  const timestamp = nowSeconds(now);
  const leaseToken = leaseTokenFrom(reason);
  const error = normalizeError(reason, "delivery_cancelled");
  const statement = db.prepare(
    `UPDATE notification_outbox
        SET state = 'cancelled', cancelled_at = ?, updated_at = ?,
            lease_token = NULL, lease_expires_at = NULL, last_error = ?
      WHERE id = ?
        AND (
          state IN ('pending', 'queued')
          OR (state = 'processing' AND lease_token = ? AND lease_expires_at > ?)
          OR (state = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
        )`,
  ).bind(timestamp, timestamp, error, id, leaseToken || "", timestamp, timestamp);
  const deleteNotification = db.prepare(
    `DELETE FROM notifications
      WHERE id = ?
        AND EXISTS (
          SELECT 1 FROM notification_outbox
           WHERE id = ? AND state = 'cancelled'
        )`,
  ).bind(id, id);
  const results = await runAtomicBatch(db, [statement, deleteNotification]);
  if (dbChanges(results[0]) === 1) return { state: "cancelled", id };
  return transitionResult(await getOutboxRow(db, id));
}

/**
 * Return opaque ids that need Queue publication. Expired leases are converted
 * back to pending first; the periodic worker sweep can then repair a process
 * that died after claiming a message but before acknowledging it.
 */
export async function findDueNotificationOutboxIds(db, now = Date.now(), limit = 100) {
  const timestamp = nowSeconds(now);
  const boundedLimit = cleanBoundedInteger(limit, 100, 1, 500);
  await db.prepare(
    `UPDATE notification_outbox
        SET state = CASE WHEN attempt_count >= ? THEN 'dead' ELSE 'pending' END,
            lease_token = NULL,
            lease_expires_at = NULL,
            available_at = CASE
              WHEN attempt_count >= ? THEN available_at
              WHEN available_at > ? THEN available_at
              ELSE ?
            END,
            last_error = CASE
              WHEN attempt_count >= ? THEN COALESCE(last_error, 'delivery lease expired after retry limit')
              ELSE COALESCE(last_error, 'delivery lease expired')
            END,
            dead_at = CASE WHEN attempt_count >= ? THEN ? ELSE dead_at END,
            updated_at = ?
      WHERE state = 'processing'
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at <= ?`,
  ).bind(
    NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
    NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
    timestamp,
    timestamp,
    NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
    NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
    timestamp,
    timestamp,
    timestamp,
  ).run();

  const repairBefore = timestamp - NOTIFICATION_OUTBOX_REPAIR_AFTER_SECONDS;
  const result = await db.prepare(
    `SELECT id
       FROM notification_outbox
      WHERE (state = 'pending' AND available_at <= ?)
         OR (state = 'queued' AND available_at <= ? AND queued_at IS NOT NULL AND queued_at <= ?)
      -- Fresh/returned pending intents take precedence over stale queued
      -- repairs. Otherwise a large old queued backlog can consume every
      -- sweep page and starve later work that has never been retried.
      ORDER BY CASE state WHEN 'pending' THEN 0 ELSE 1 END,
               available_at ASC, created_at ASC, id ASC
      LIMIT ?`,
  ).bind(timestamp, timestamp, repairBefore, boundedLimit).all();
  return (result.results || []).map((row) => row?.id).filter((id) => typeof id === "string" && OUTBOX_ID_PATTERN.test(id));
}

/** Exposed for delivery worker diagnostics/tests without leaking row payloads. */
export async function getNotificationOutboxDeliveryState(db, outboxId) {
  const id = cleanOutboxId(outboxId);
  const row = await getOutboxRow(db, id);
  if (!row) return null;
  return {
    id: row.id,
    state: row.state,
    recipientUserId: row.recipient_user_id,
    teamId: row.team_id,
    attemptCount: Number(row.attempt_count || 0),
    availableAt: Number(row.available_at || 0),
    leaseExpiresAt: row.lease_expires_at ? Number(row.lease_expires_at) : null,
  };
}
