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
 * @returns {{ sent: number, total: number }}
 */
export async function sendPushToUser(env, db, userId, notification) {
  const subs = await getUserPushSubscriptions(db, userId);
  if (!subs.length) return { sent: 0, total: 0 };

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      const result = await sendWebPush(env, sub, notification);
      if (result.gone) {
        await markSubscriptionFailed(db, sub.endpoint).catch(() => {});
      }
      return result;
    }),
  );

  const sent = results.filter(
    (r) => r.status === "fulfilled" && r.value?.ok,
  ).length;

  return { sent, total: subs.length };
}
