import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { sendPushToUser } = await import("../functions/_lib/d1-push.js");

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function makeVapidEnv() {
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  return {
    VAPID_PRIVATE_KEY: base64Url(await crypto.subtle.exportKey("pkcs8", keys.privateKey)),
    VAPID_PUBLIC_KEY: base64Url(await crypto.subtle.exportKey("raw", keys.publicKey)),
    VAPID_SUBJECT: "mailto:test@bcoffense.example",
  };
}

async function makeSubscription(path) {
  const keys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    id: path,
    endpoint: `https://push.example/${path}`,
    p256dh: base64Url(await crypto.subtle.exportKey("raw", keys.publicKey)),
    auth: base64Url(auth),
  };
}

function makeD1(subscriptions) {
  const markedFailed = [];
  return {
    markedFailed,
    prepare(sql) {
      return {
        bind(...values) {
          if (sql.includes("FROM push_subscriptions")) {
            return {
              all: async () => ({ results: subscriptions }),
            };
          }
          if (sql.includes("UPDATE push_subscriptions SET failed_at")) {
            return {
              run: async () => {
                markedFailed.push(values[1]);
                return { success: true, meta: { changes: 1 } };
              },
            };
          }
          throw new Error("Unexpected D1 statement in push delivery contract");
        },
      };
    },
  };
}

const notification = {
  title: "Install is ready",
  body: "Open the player portal.",
  url: "/",
  tag: "contract-test",
};

const env = await makeVapidEnv();

const emptyResult = await sendPushToUser(env, makeD1([]), "player-1", notification);
assert.deepEqual(
  emptyResult,
  {
    sent: 0,
    total: 0,
    noSubscriptions: true,
    permanent: 0,
    retryable: 0,
    terminal: 0,
    configuration: 0,
    retryAfterSeconds: null,
    outcomes: {
      sent: 0,
      permanent: 0,
      retryable: 0,
      terminal: 0,
      configuration: 0,
    },
    hasRetryableFailure: false,
  },
  "no active subscriptions remains a successful no-delivery state, not a retry signal",
);

const paths = [
  "sent",
  "dead-404",
  "dead-410",
  "retry-429",
  "retry-503",
  "network-error",
  "vapid-401",
  "vapid-403",
  "terminal-400",
];
const subscriptions = await Promise.all(paths.map(makeSubscription));
const db = makeD1(subscriptions);
const originalFetch = globalThis.fetch;

try {
  globalThis.fetch = async (endpoint) => {
    const path = new URL(endpoint).pathname.slice(1);
    if (path === "sent") return new Response(null, { status: 201 });
    if (path === "dead-404") return new Response(null, { status: 404 });
    if (path === "dead-410") return new Response(null, { status: 410 });
    if (path === "retry-429") {
      return new Response(null, { status: 429, headers: { "Retry-After": "30" } });
    }
    if (path === "retry-503") return new Response(null, { status: 503 });
    if (path === "network-error") throw new TypeError("simulated network failure");
    if (path === "vapid-401") return new Response(null, { status: 401 });
    if (path === "vapid-403") return new Response(null, { status: 403 });
    if (path === "terminal-400") return new Response(null, { status: 400 });
    throw new Error(`Unexpected endpoint in contract test: ${path}`);
  };

  const result = await sendPushToUser(env, db, "player-1", notification);
  assert.equal(result.sent, 1, "successful endpoint delivery remains visible through legacy sent");
  assert.equal(result.total, 9, "legacy total remains the active subscription count");
  assert.equal(result.noSubscriptions, false);
  assert.equal(result.permanent, 2, "404 and 410 are endpoint-retiring outcomes");
  assert.equal(result.retryable, 3, "429, 5xx, and transport failures are safe retry signals");
  assert.equal(result.terminal, 1, "non-VAPID 4xx responses are terminal without retiring a device");
  assert.equal(result.configuration, 2, "401/403 VAPID authorization rejections remain recoverable configuration outcomes");
  assert.equal(result.retryAfterSeconds, 30, "the durable aggregate preserves the longest provider Retry-After floor");
  assert.deepEqual(result.outcomes, {
    sent: 1,
    permanent: 2,
    retryable: 3,
    terminal: 1,
    configuration: 2,
  });
  assert.equal(result.hasRetryableFailure, true);
  assert.deepEqual(
    db.markedFailed.sort(),
    [
      "https://push.example/dead-404",
      "https://push.example/dead-410",
    ],
    "only confirmed-dead endpoints are marked failed; terminal/configuration faults retain devices for recovery",
  );
} finally {
  globalThis.fetch = originalFetch;
}

const configurationDb = makeD1([await makeSubscription("configuration")]);
const originalWarn = console.warn;
try {
  console.warn = () => {};
  const result = await sendPushToUser({}, configurationDb, "player-1", notification);
  assert.equal(result.configuration, 1, "missing VAPID material is a deployment configuration outcome");
  assert.equal(result.retryable, 0, "missing configuration does not create an automatic retry loop");
  assert.equal(result.retryAfterSeconds, null, "configuration outcomes do not manufacture a provider retry deadline");
  assert.deepEqual(configurationDb.markedFailed, [], "configuration faults never retire a player's device endpoint");
} finally {
  console.warn = originalWarn;
}

console.log("push delivery outcome contract: aggregate retry classification and dead-endpoint retirement verified");
