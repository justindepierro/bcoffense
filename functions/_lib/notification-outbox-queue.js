/**
 * Queue publication bridge for durable notification outbox rows.
 *
 * D1 is the source of truth: a Queue failure never rolls back a completed
 * coach action or discards a player notification. The periodic consumer sweep
 * will pick up any row that remains pending. Queue messages deliberately hold
 * only a versioned opaque outbox id.
 */

import {
  buildNotificationOutboxQueuePayload,
} from "./notification-outbox.js";

const MAX_QUEUE_BATCH_SIZE = 100;
// D1 accepts at most 100 bound parameters per statement. The queued-state
// UPDATE reserves two parameters for timestamps, leaving 98 opaque IDs.
const MAX_D1_QUEUE_MARK_IDS = 98;

function uniqueIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))];
}

function chunks(values, size = MAX_QUEUE_BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

/**
 * Queue publication is one side effect for a whole fan-out.  Record it in
 * the same bounded groups instead of issuing one D1 UPDATE per recipient.
 * That keeps a 500-player announcement below the D1 Free per-invocation
 * query ceiling while retaining the safe "Queue first, state second" order.
 */
async function markOutboxRowsQueued(db, ids) {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("Notification outbox database binding is unavailable.");
  }
  const now = Math.floor(Date.now() / 1000);
  for (const group of chunks(ids, MAX_D1_QUEUE_MARK_IDS)) {
    if (!group.length) continue;
    const placeholders = group.map(() => "?").join(", ");
    await db.prepare(
      `UPDATE notification_outbox
          SET state = 'queued', queued_at = ?, updated_at = ?
        WHERE id IN (${placeholders})
          AND state IN ('pending', 'queued')`,
    ).bind(now, now, ...group).run();
  }
}

async function publishOutboxRows(db, queue, ids) {
  if (!queue || (typeof queue.send !== "function" && typeof queue.sendBatch !== "function")) {
    return { queued: 0, pending: ids.length, configured: false };
  }

  let queued = 0;
  const publishedIds = [];
  for (const group of chunks(ids)) {
    // `sendBatch` is optional in narrow test/mocking environments, but is
    // available on the production Queue binding and avoids serial fan-out.
    if (typeof queue.sendBatch === "function" && group.length > 1) {
      await queue.sendBatch(group.map((id) => ({
        body: buildNotificationOutboxQueuePayload(id),
        contentType: "json",
      })));
    } else {
      for (const id of group) {
        await queue.send(buildNotificationOutboxQueuePayload(id), { contentType: "json" });
      }
    }

    queued += group.length;
    publishedIds.push(...group);
  }
  // Mark only after every Queue batch has fulfilled. A later Queue failure
  // leaves earlier sends pending (safe duplicate delivery) rather than making
  // a partial success look complete. Combining the successful groups also
  // lets D1 use its full 98-id parameter-safe mark batches.
  await markOutboxRowsQueued(db, publishedIds);
  return { queued, pending: 0, configured: true };
}

/**
 * Best-effort Queue wake-up after a durable outbox transaction.
 *
 * Pages Functions receive `context.waitUntil`; unit callers can omit it and
 * receive a settled result. Queue publication errors are deliberately logged
 * without a message payload and leave D1 rows pending for the consumer cron.
 */
export function enqueueNotificationOutboxDeliveries(context, env, ids) {
  const pendingIds = uniqueIds(ids);
  if (!pendingIds.length) {
    return { scheduled: false, queued: 0, pending: 0, configured: Boolean(env?.NOTIFICATION_QUEUE) };
  }

  const work = publishOutboxRows(env?.DB, env?.NOTIFICATION_QUEUE, pendingIds)
    .catch((error) => {
      console.error("[notification-outbox] queue publication deferred", {
        count: pendingIds.length,
        error: String(error?.message || "Queue publication failed.").slice(0, 160),
      });
      return { queued: 0, pending: pendingIds.length, configured: Boolean(env?.NOTIFICATION_QUEUE) };
    });

  if (typeof context?.waitUntil === "function") {
    context.waitUntil(work);
    return {
      scheduled: true,
      queued: 0,
      pending: pendingIds.length,
      configured: Boolean(env?.NOTIFICATION_QUEUE),
    };
  }
  return work;
}
