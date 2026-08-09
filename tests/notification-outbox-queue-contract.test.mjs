import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

import {
  createNotificationOutboxDeliveries,
  getNotificationOutboxDeliveryState,
} from "../functions/_lib/notification-outbox.js";
import { enqueueNotificationOutboxDeliveries } from "../functions/_lib/notification-outbox-queue.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const migrationsDir = path.join(root, "migrations");
const NOW = 1_700_000_000;

function makeD1() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  let writeCount = 0;
  return {
    raw,
    get writeCount() { return writeCount; },
    prepare(sql) {
      return {
        bind(...values) {
          const statement = raw.prepare(sql);
          const run = () => {
            writeCount += 1;
            const result = statement.run(...values);
            return { success: true, meta: { changes: Number(result.changes || 0) } };
          };
          return {
            first: async () => statement.get(...values) || null,
            all: async () => ({ success: true, results: statement.all(...values) }),
            run: async () => run(),
            __run: run,
          };
        },
      };
    },
    async batch(statements) {
      raw.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => statement.__run());
        raw.exec("COMMIT");
        return results;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

const db = makeD1();
const migrations = (await readdir(migrationsDir))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();
for (const migration of migrations) db.raw.exec(await readFile(path.join(migrationsDir, migration), "utf8"));

db.raw.prepare("INSERT INTO teams (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
  .run("team-a", "Team A", NOW, NOW);
for (const id of ["player-a", "player-b"]) {
  db.raw.prepare(
    `INSERT INTO users (id, email, display_name, role, team_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'player', 'team-a', 'active', ?, ?)`,
  ).run(id, `${id}@example.test`, id, NOW, NOW);
}

async function createDeliveries(eventKey, recipientUserIds) {
  return createNotificationOutboxDeliveries(db, {
    teamId: "team-a",
    eventKey,
    deliveryKind: "team_broadcast",
    recipientUserIds,
    notification: {
      type: "team_update",
      title: "Install is ready",
      body: "Open the new install before practice.",
      deepLink: "script:install",
      tag: "team-update-install",
    },
    now: NOW,
  });
}

const batchDelivery = await createDeliveries("queue-contract-batch", ["player-a", "player-b"]);
const batches = [];
const batchResult = await enqueueNotificationOutboxDeliveries(null, {
  DB: db,
  NOTIFICATION_QUEUE: {
    async sendBatch(messages) {
      batches.push(messages);
    },
  },
}, batchDelivery.pendingIds);
assert.deepEqual(batchResult, { queued: 2, pending: 0, configured: true }, "a successful Queue batch marks every persisted intent queued");
assert.equal(batches.length, 1, "the producer uses one bounded Queue batch for multiple delivery intents");
assert.equal(batches[0].length, 2, "the Queue batch contains one message per recipient");
for (const message of batches[0]) {
  assert.deepEqual(Object.keys(message).sort(), ["body", "contentType"], "Queue batch messages use Cloudflare's top-level content type shape");
  assert.equal(message.contentType, "json", "Queue messages are explicitly JSON");
  assert.deepEqual(Object.keys(message.body).sort(), ["id", "v"], "Queue messages never contain notification copy or recipient data");
  assert.equal(message.body.v, 1, "Queue message carries the supported opaque-envelope version");
}
for (const id of batchDelivery.pendingIds) {
  assert.equal((await getNotificationOutboxDeliveryState(db, id)).state, "queued", "only a confirmed Queue batch advances the durable state");
}

// A full team announcement can address 500 players. Queue-state bookkeeping
// must remain one D1 UPDATE per Queue batch (100 ids), rather than one update
// per player, so it stays beneath D1 Free's per-invocation query limit.
const largeRecipientIds = [];
for (let index = 0; index < 500; index += 1) {
  const id = `queue-player-${index}`;
  largeRecipientIds.push(id);
  db.raw.prepare(
    `INSERT INTO users (id, email, display_name, role, team_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'player', 'team-a', 'active', ?, ?)`,
  ).run(id, `${id}@example.test`, id, NOW, NOW);
}
const largeDelivery = await createDeliveries("queue-contract-large-batch", largeRecipientIds);
const largeQueueBatches = [];
const writesBeforeLargeQueue = db.writeCount;
const largeResult = await enqueueNotificationOutboxDeliveries(null, {
  DB: db,
  NOTIFICATION_QUEUE: {
    async sendBatch(messages) {
      largeQueueBatches.push(messages);
    },
  },
}, largeDelivery.pendingIds);
assert.equal(largeResult.queued, 500, "all 500 durable intents are handed to Queue");
assert.equal(largeQueueBatches.length, 5, "producer sends 500 opaque messages in five Queue-sized batches");
assert.equal(
  db.writeCount - writesBeforeLargeQueue,
  6,
  "producer records Queue batches with <=98 IDs per set-based D1 UPDATE, staying below D1's 100-parameter ceiling",
);

const noQueueDelivery = await createDeliveries("queue-contract-unconfigured", ["player-a"]);
const noQueueResult = await enqueueNotificationOutboxDeliveries(null, { DB: db }, noQueueDelivery.pendingIds);
assert.deepEqual(noQueueResult, { queued: 0, pending: 1, configured: false }, "a missing Queue binding leaves the D1 intent pending for repair");
assert.equal((await getNotificationOutboxDeliveryState(db, noQueueDelivery.createdIds[0])).state, "pending", "unconfigured publication never discards the durable intent");

const failedDelivery = await createDeliveries("queue-contract-failure", ["player-a"]);
const failedResult = await enqueueNotificationOutboxDeliveries(null, {
  DB: db,
  NOTIFICATION_QUEUE: {
    async send() {
      throw new Error("Queue temporarily unavailable");
    },
  },
}, failedDelivery.pendingIds);
assert.deepEqual(failedResult, { queued: 0, pending: 1, configured: true }, "a Queue publication failure is contained and left for the scheduled repair sweep");
assert.equal((await getNotificationOutboxDeliveryState(db, failedDelivery.createdIds[0])).state, "pending", "a failed Queue send cannot falsely mark an intent queued");

const deferredDelivery = await createDeliveries("queue-contract-wait-until", ["player-b"]);
let scheduledWork = null;
const sentSingles = [];
const scheduled = enqueueNotificationOutboxDeliveries({
  waitUntil(work) { scheduledWork = work; },
}, {
  DB: db,
  NOTIFICATION_QUEUE: {
    async send(body, options) {
      sentSingles.push({ body, options });
    },
  },
}, deferredDelivery.pendingIds);
assert.deepEqual(
  scheduled,
  { scheduled: true, queued: 0, pending: 1, configured: true },
  "Pages handlers receive an immediate best-effort scheduling result instead of waiting on push delivery",
);
assert.ok(scheduledWork, "Pages background publication is registered with context.waitUntil");
await scheduledWork;
assert.deepEqual(
  sentSingles,
  [{ body: { v: 1, id: deferredDelivery.createdIds[0] }, options: { contentType: "json" } }],
  "single-message publication sends only the opaque envelope with JSON content type",
);
assert.equal((await getNotificationOutboxDeliveryState(db, deferredDelivery.createdIds[0])).state, "queued", "the background publication records its successful Queue wake-up");

db.raw.close();
console.log("notification outbox queue contract: opaque producer publication and durable fallback verified");
