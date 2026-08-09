/**
 * functions/_lib/d1-push.js
 * D1 helpers for push_subscriptions table + user-level send helper.
 */

import { sendWebPush } from "./web-push.js";

// ── Subscription CRUD ────────────────────────────────────────────────────────

/**
 * Save or update a push subscription for a user.
 * Upserts on endpoint (one row per device endpoint).
 */
export async function savePushSubscription(db, userId, subscription, userAgent) {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const { endpoint, keys } = subscription;

  await db
    .prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id    = excluded.user_id,
         p256dh     = excluded.p256dh,
         auth       = excluded.auth,
         user_agent = excluded.user_agent,
         failed_at  = NULL`,
    )
    .bind(id, userId, endpoint, keys.p256dh, keys.auth, userAgent || null, now)
    .run();
}

/**
 * Remove a specific subscription by endpoint.
 */
export async function removePushSubscription(db, userId, endpoint) {
  await db
    .prepare(
      "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
    )
    .bind(userId, endpoint)
    .run();
}

/**
 * Get all active (non-failed) subscriptions for a user.
 */
export async function getUserPushSubscriptions(db, userId) {
  const rows = await db
    .prepare(
      `SELECT id, endpoint, p256dh, auth
       FROM push_subscriptions
       WHERE user_id = ? AND failed_at IS NULL`,
    )
    .bind(userId)
    .all();
  return rows.results || [];
}

/**
 * Mark a subscription as permanently failed (410 Gone from push service).
 */
export async function markSubscriptionFailed(db, endpoint) {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      "UPDATE push_subscriptions SET failed_at = ? WHERE endpoint = ?",
    )
    .bind(now, endpoint)
    .run();
}

// ── Send helpers ─────────────────────────────────────────────────────────────

/**
 * Send a push notification to all active devices for a user.
 * Dead endpoints are automatically marked failed.
 *
 * @param {object} env - Cloudflare env (needs VAPID_* keys)
 * @param {object} db  - D1 database binding
 * @param {string} userId
 * @param {{ title, body, url?, tag? }} notification
 * @returns {{ sent: number, total: number, noSubscriptions: boolean, permanent: number, retryable: number, terminal: number, configuration: number, retryAfterSeconds: number|null, outcomes: object, hasRetryableFailure: boolean }}
 *   `sent` and `total` are retained for existing callers. The remaining
 *   counts are safe for a durable outbox to use without recording endpoint
 *   URLs or push-service response bodies.
 */
export async function sendPushToUser(env, db, userId, notification) {
  const subs = await getUserPushSubscriptions(db, userId);
  const makeSummary = (total) => ({
    sent: 0,
    total,
    noSubscriptions: total === 0,
    permanent: 0,
    retryable: 0,
    terminal: 0,
    configuration: 0,
    retryAfterSeconds: null,
  });

  if (!subs.length) {
    const summary = makeSummary(0);
    return {
      ...summary,
      outcomes: {
        sent: summary.sent,
        permanent: summary.permanent,
        retryable: summary.retryable,
        terminal: summary.terminal,
        configuration: summary.configuration,
      },
      hasRetryableFailure: false,
    };
  }

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      const result = await sendWebPush(env, sub, notification);
      if (result.gone) {
        // If this write cannot be persisted, leave the individual send task
        // retryable so a dead subscription is not silently kept active.
        await markSubscriptionFailed(db, sub.endpoint);
      }
      return result;
    }),
  );

  const summary = makeSummary(subs.length);
  for (const result of results) {
    // A rejected map task can be a D1 failure while retiring a dead endpoint,
    // or an unexpected transport/runtime failure. Retry conservatively without
    // exposing the rejection (which may contain subscription data).
    if (result.status !== "fulfilled") {
      summary.retryable += 1;
      continue;
    }

    const outcome = result.value?.outcome;
    if (outcome === "sent" || result.value?.ok) {
      summary.sent += 1;
    } else if (outcome === "permanent") {
      summary.permanent += 1;
    } else if (outcome === "terminal") {
      summary.terminal += 1;
    } else if (outcome === "configuration") {
      summary.configuration += 1;
    } else if (outcome === "retryable") {
      summary.retryable += 1;
      const retryAfterSeconds = Number(result.value?.retryAfterSeconds);
      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
        summary.retryAfterSeconds = Math.max(
          Number(summary.retryAfterSeconds || 0),
          Math.floor(retryAfterSeconds),
        );
      }
    } else {
      // Unknown outcomes must not be treated as delivered; retrying is the
      // safest behavior if a future sender changes its result contract.
      summary.retryable += 1;
    }
  }

  return {
    ...summary,
    outcomes: {
      sent: summary.sent,
      permanent: summary.permanent,
      retryable: summary.retryable,
      terminal: summary.terminal,
      configuration: summary.configuration,
    },
    hasRetryableFailure: summary.retryable > 0,
  };
}
