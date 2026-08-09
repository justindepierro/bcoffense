/**
 * Dedicated Cloudflare Queue consumer for notification delivery.
 *
 * This Worker deliberately has no `fetch()` handler. Pages Functions enqueue
 * an opaque `{ v: 1, id }` reference after durable outbox work is committed;
 * all notification content remains in D1 instead of travelling through Queue
 * storage or logs.
 *
 * Core outbox contract (implemented in functions/_lib/notification-outbox.js):
 *
 * - claimNotificationOutboxDelivery(db, id, now) returns
 *   `{ state, delivery }`, where state is `claimed`, `missing`, `terminal`,
 *   `not_due`, or `cancelled`. A claimed delivery contains an id, recipient
 *   user/team ids, and the bounded notification data needed for Web Push.
 * - completeNotificationOutboxDelivery(db, id, now, result) records a final
 *   push outcome after a successful/terminal attempt. Its result includes the
 *   claimed `leaseToken` so an expired worker cannot finalize a reclaimed row.
 * - retryNotificationOutboxDelivery(db, id, now, detail) keeps the delivery
 *   durable and due again after the selected delay, guarded by that lease.
 * - cancelNotificationOutboxDelivery(db, id, now, detail) terminates a
 *   malformed or no-longer-eligible claimed record without retrying it, also
 *   guarded by that lease.
 * - findDueNotificationOutboxIds(db, now, limit) returns only opaque ids that
 *   need queue repair (including expired delivery leases).
 * - markNotificationOutboxQueued(db, id, now) records a successful Queue
 *   publication so the next sweep does not needlessly replay it.
 */

import {
  cancelNotificationOutboxDelivery,
  claimNotificationOutboxDelivery,
  completeNotificationOutboxDelivery,
  findDueNotificationOutboxIds,
  retryNotificationOutboxDelivery,
} from "../functions/_lib/notification-outbox.js";
import { sendPushToUser } from "../functions/_lib/d1-push.js";
import { enqueueNotificationOutboxDeliveries } from "../functions/_lib/notification-outbox-queue.js";
import {
  getPendingQuizAssignmentInitialDispatches,
  reconcileQuizAssignmentInitialDispatch,
} from "../functions/_lib/d1-quiz-assignments.js";

const OUTBOX_MESSAGE_VERSION = 1;
const OUTBOX_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL_CLAIM_STATES = new Set(["missing", "terminal", "not_due", "cancelled"]);
const SWEEP_LIMIT = 100;
// A reconciliation costs roughly nine D1 statements (marker, assignment,
// current recipients, set-based outbox fan-out, and marker acknowledgement).
// Three markers plus the regular due scan and its bounded queued-state marks
// stays below D1 Free's 50-query invocation ceiling even when each homework
// assignment has the 300-player maximum recipient list.
const INITIAL_DISPATCH_SWEEP_LIMIT = 3;
const RETRY_BASE_SECONDS = 30;
// Normal exponential retries top out at one hour, but Cloudflare Queue lets
// an explicit per-message delay reach 24 hours. Keep the larger bound for a
// provider's Retry-After directive so a 429 never burns delivery attempts.
const RETRY_MAX_SECONDS = 60 * 60;
const MAX_QUEUE_DELAY_SECONDS = 24 * 60 * 60;
// Missing VAPID configuration needs operator action, not a tight retry loop.
// It remains bounded so the queue's normal DLQ policy still protects capacity.
const CONFIGURATION_RETRY_SECONDS = 15 * 60;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function safeErrorDetail(error) {
  const message = error instanceof Error ? error.message : String(error || "Delivery failed.");
  return message.replace(/\s+/g, " ").trim().slice(0, 240) || "Delivery failed.";
}

function log(level, event, detail = {}) {
  const record = JSON.stringify({ event, ...detail });
  if (level === "error") console.error(record);
  else if (level === "warn") console.warn(record);
  else console.log(record);
}

/**
 * Only accept the versioned outbox reference. The strict key check ensures
 * Queue messages cannot become a second, unvalidated notification payload.
 */
export function parseNotificationOutboxMessage(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const keys = Object.keys(body).sort();
  if (keys.length !== 2 || keys[0] !== "id" || keys[1] !== "v") return null;
  if (body.v !== OUTBOX_MESSAGE_VERSION || typeof body.id !== "string") return null;
  const id = body.id.trim();
  return OUTBOX_ID_PATTERN.test(id) ? { v: OUTBOX_MESSAGE_VERSION, id } : null;
}

export function retryDelaySeconds(attempts) {
  const retryAttempt = Math.max(1, Number(attempts) || 1);
  return Math.min(RETRY_BASE_SECONDS * (2 ** Math.min(retryAttempt - 1, 7)), RETRY_MAX_SECONDS);
}

export function retryDelayWithFloorSeconds(attempts, minimumDelaySeconds = 0) {
  const providerFloor = Math.max(0, Math.floor(Number(minimumDelaySeconds) || 0));
  return Math.min(
    MAX_QUEUE_DELAY_SECONDS,
    Math.max(retryDelaySeconds(attempts), providerFloor),
  );
}

function isClaimedDelivery(delivery) {
  const notification = delivery?.notification;
  return Boolean(
    delivery
      && OUTBOX_ID_PATTERN.test(String(delivery.id || ""))
      // D1 user and team IDs are opaque application identifiers. Do not
      // accidentally reject a valid imported/legacy team merely because it
      // does not happen to use a UUID representation.
      && typeof delivery.recipientUserId === "string" && delivery.recipientUserId.trim()
      && typeof delivery.teamId === "string" && delivery.teamId.trim()
      && typeof delivery.leaseToken === "string" && delivery.leaseToken.trim()
      && Number.isInteger(Number(delivery.attemptCount)) && Number(delivery.attemptCount) > 0
      && notification
      && typeof notification.type === "string" && notification.type.trim()
      && typeof notification.title === "string" && notification.title.trim(),
  );
}

function isPermanentDeliveryError(error) {
  const status = Number(error?.status || 0);
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return true;
  return ["invalid_outbox_delivery", "recipient_ineligible", "recipient_missing"].includes(String(error?.code || ""));
}

function pushUrlForDeepLink(deepLink) {
  const target = String(deepLink || "").trim();
  return target ? `/?push=${encodeURIComponent(target)}` : "/";
}

function buildPushNotification(delivery) {
  const notification = delivery.notification;
  const deepLink = typeof notification.deepLink === "string" ? notification.deepLink.trim() : "";
  const type = String(notification.type || "notification").trim() || "notification";
  return {
    title: notification.title.trim(),
    body: typeof notification.body === "string" ? notification.body : "",
    url: pushUrlForDeepLink(deepLink),
    deepLink,
    tag: typeof notification.tag === "string" && notification.tag.trim()
      ? notification.tag.trim()
      : `${type}-${delivery.id}`,
  };
}

async function retryQueueMessage(
  message,
  env,
  outboxId,
  stage,
  error,
  leaseToken = "",
  attemptCount = 0,
  minimumDelaySeconds = 0,
  hold = "",
) {
  // Queue attempt counters reset if the scheduled repair sweep creates a new
  // message. Prefer the durable outbox count after a claim so backoff remains
  // exponential across both direct retries and repaired queue publications.
  const delaySeconds = retryDelayWithFloorSeconds(
    attemptCount || message.attempts,
    minimumDelaySeconds,
  );
  const detail = {
    stage,
    error: safeErrorDetail(error),
    delaySeconds,
  };
  if (hold === "configuration") detail.hold = "configuration";
  if (leaseToken) {
    try {
      const transition = await retryNotificationOutboxDelivery(env.DB, outboxId, nowSeconds(), { ...detail, leaseToken });
      if (["dead", "missing", "cancelled", "terminal", "stale", "delivered"].includes(String(transition?.state || ""))) {
        // A newer lease may already own this work, or the durable retry cap
        // may have stopped it. Do not push an obsolete message into the DLQ.
        log("warn", "notification_outbox_retry_not_requeued", {
          outboxId,
          stage,
          state: String(transition?.state || ""),
        });
        message.ack();
        return;
      }
    } catch (persistError) {
      // The Queue retry remains useful even if D1 is temporarily unavailable;
      // the scheduled sweep will later reconcile the durable record.
      log("error", "notification_outbox_retry_persist_failed", {
        outboxId,
        stage,
        error: safeErrorDetail(persistError),
      });
    }
  }
  log("warn", "notification_outbox_retry_scheduled", { outboxId, stage, delaySeconds });
  message.retry({ delaySeconds });
}

async function cancelMalformedClaim(message, env, outboxId, leaseToken, reason, attemptCount = 0) {
  if (!leaseToken) {
    await retryQueueMessage(
      message,
      env,
      outboxId,
      "cancel-without-lease",
      new Error("Claimed notification delivery has no lease token."),
    );
    return;
  }
  try {
    await cancelNotificationOutboxDelivery(env.DB, outboxId, nowSeconds(), { reason, leaseToken });
    log("warn", "notification_outbox_cancelled", { outboxId, reason });
    message.ack();
  } catch (error) {
    await retryQueueMessage(message, env, outboxId, "cancel", error, leaseToken, attemptCount);
  }
}

async function processNotificationOutboxMessage(message, env) {
  const envelope = parseNotificationOutboxMessage(message.body);
  if (!envelope) {
    // Poisoned/old queue data has no durable record to repair. Acknowledge it
    // deliberately so it cannot cause a permanent retry loop or reach a DLQ.
    log("warn", "notification_outbox_invalid_message", { messageId: String(message.id || "") });
    message.ack();
    return;
  }

  let claim;
  try {
    claim = await claimNotificationOutboxDelivery(env.DB, envelope.id, nowSeconds());
  } catch (error) {
    await retryQueueMessage(message, env, envelope.id, "claim", error);
    return;
  }

  if (TERMINAL_CLAIM_STATES.has(claim?.state)) {
    // Missing/finished/leased messages are normal with at-least-once delivery.
    message.ack();
    return;
  }

  if (claim?.state !== "claimed") {
    await retryQueueMessage(
      message,
      env,
      envelope.id,
      "claim-state",
      new Error(`Unexpected notification outbox claim state: ${String(claim?.state || "")}`),
    );
    return;
  }

  const delivery = claim.delivery;
  if (!isClaimedDelivery(delivery)) {
    await cancelMalformedClaim(
      message,
      env,
      envelope.id,
      typeof delivery?.leaseToken === "string" ? delivery.leaseToken : "",
      "invalid_outbox_delivery",
      Number(delivery?.attemptCount || 0),
    );
    return;
  }

  try {
    const outcome = await sendPushToUser(
      env,
      env.DB,
      delivery.recipientUserId,
      buildPushNotification(delivery),
    );
    if (!outcome || typeof outcome !== "object") {
      throw new Error("Push helper returned no delivery outcome.");
    }
    if (Number(outcome.configuration || 0) > 0) {
      // A missing VAPID secret means no endpoint has received this push. Keep
      // the claimed row durable and retry after configuration is restored.
      await retryQueueMessage(
        message,
        env,
        delivery.id,
        "push-configuration",
        new Error("Web Push configuration is unavailable."),
        delivery.leaseToken,
        delivery.attemptCount,
        CONFIGURATION_RETRY_SECONDS,
        "configuration",
      );
      return;
    }
    if (outcome?.hasRetryableFailure) {
      // Respect a push provider's Retry-After value when it is longer than
      // our normal exponential delay. Ignoring it can hammer a throttled
      // service and consume the durable retry budget before the window ends.
      const retryAfterSeconds = Number(outcome?.retryAfterSeconds || 0);
      await retryQueueMessage(
        message,
        env,
        delivery.id,
        "push",
        new Error("Push service reported a retryable delivery failure."),
        delivery.leaseToken,
        delivery.attemptCount,
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : 0,
      );
      return;
    }
    await completeNotificationOutboxDelivery(env.DB, delivery.id, nowSeconds(), {
      pushSent: Number(outcome?.sent || 0) || 0,
      pushTotal: Number(outcome?.total || 0) || 0,
      noSubscriptions: Boolean(outcome?.noSubscriptions),
      permanent: Number(outcome?.permanent || 0) || 0,
      terminal: Number(outcome?.terminal || 0) || 0,
      configuration: Number(outcome?.configuration || 0) || 0,
      leaseToken: delivery.leaseToken,
    });
    log("info", "notification_outbox_completed", {
      outboxId: delivery.id,
      pushSent: Number(outcome?.sent || 0) || 0,
      pushTotal: Number(outcome?.total || 0) || 0,
    });
    message.ack();
  } catch (error) {
    if (isPermanentDeliveryError(error)) {
      await cancelMalformedClaim(
        message,
        env,
        delivery.id,
        delivery.leaseToken,
        String(error?.code || "permanent_delivery_error"),
        delivery.attemptCount,
      );
      return;
    }
    await retryQueueMessage(message, env, delivery.id, "deliver", error, delivery.leaseToken, delivery.attemptCount);
  }
}

/**
 * Re-enqueue due rows after an initial Queue publish failure or an abandoned
 * lease. Duplicates are harmless because claimNotificationOutboxDelivery is
 * the only transition that permits a push attempt.
 */
export async function sweepNotificationOutbox(env) {
  if (!env?.DB || !env?.NOTIFICATION_QUEUE) {
    throw new Error("Notification outbox bindings are not configured.");
  }
  const sweepNow = nowSeconds();
  // A published assignment can commit with its immutable initial-dispatch
  // marker before a later outbox fan-out succeeds. Repair a deliberately small
  // number on every cron so recovery does not depend on a coach reopening the
  // assignment page. Gather their IDs first and publish once with the regular
  // due rows, which keeps Queue and D1 work bounded.
  const pendingDispatches = await getPendingQuizAssignmentInitialDispatches(
    env.DB,
    null,
    INITIAL_DISPATCH_SWEEP_LIMIT,
  );
  const reconciledOutboxIds = [];
  let markerReconciled = 0;
  let markerFailed = 0;
  for (const dispatch of pendingDispatches) {
    try {
      const reconciliation = await reconcileQuizAssignmentInitialDispatch(
        env.DB,
        dispatch.teamId,
        dispatch.assignmentId,
        sweepNow,
      );
      reconciledOutboxIds.push(...(Array.isArray(reconciliation?.pendingOutboxIds)
        ? reconciliation.pendingOutboxIds
        : []));
      if (reconciliation?.state === "outbox_persisted") markerReconciled += 1;
    } catch (error) {
      // The marker remains pending. A later cron reuses the same stored event
      // key, so retrying is idempotent and never creates a second assignment.
      markerFailed += 1;
      log("error", "notification_initial_dispatch_deferred", {
        assignmentId: String(dispatch?.assignmentId || ""),
        error: safeErrorDetail(error),
      });
    }
  }
  const rows = await findDueNotificationOutboxIds(env.DB, sweepNow, SWEEP_LIMIT);
  const ids = [...new Set([
    ...reconciledOutboxIds,
    ...(rows || []).map((row) => String(row?.id || row || "").trim()),
  ])]
    .filter((id) => OUTBOX_ID_PATTERN.test(id));
  // Reuse the Pages producer bridge: it sends Queue batches of up to 100 and
  // records successful wake-ups with set-based, 98-id D1 updates. A serial
  // send/update loop would exceed D1 Free's per-invocation budget on a full
  // repair sweep, despite the consumer's small Queue batch size.
  const publication = await enqueueNotificationOutboxDeliveries(null, env, ids);
  const enqueued = Number(publication?.queued || 0) || 0;
  const failed = Math.max(0, ids.length - enqueued);
  log("info", "notification_outbox_sweep", {
    found: ids.length,
    enqueued,
    failed,
    markerFound: pendingDispatches.length,
    markerReconciled,
    markerFailed,
  });
  return {
    found: ids.length,
    enqueued,
    failed,
    markerFound: pendingDispatches.length,
    markerReconciled,
    markerFailed,
  };
}

export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        await processNotificationOutboxMessage(message, env);
      } catch (error) {
        // A final guard keeps one unexpected message fault from replaying the
        // whole batch. Invalid envelopes are explicitly acknowledged.
        const envelope = parseNotificationOutboxMessage(message.body);
        if (!envelope) {
          log("error", "notification_outbox_unexpected_invalid_message", {
            messageId: String(message.id || ""),
            error: safeErrorDetail(error),
          });
          message.ack();
        } else {
          await retryQueueMessage(message, env, envelope.id, "queue-handler", error);
        }
      }
    }
  },

  async scheduled(_controller, env) {
    await sweepNotificationOutbox(env);
  },
};
