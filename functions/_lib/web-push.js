/**
 * functions/_lib/web-push.js
 *
 * Pure Web Crypto implementation of RFC 8291 Web Push (aes128gcm) + VAPID.
 * Zero npm dependencies — works natively in Cloudflare Workers.
 *
 * Required env vars:
 *   VAPID_PRIVATE_KEY  — base64url(pkcs8 DER of P-256 private key)
 *   VAPID_PUBLIC_KEY   — base64url(raw 65-byte uncompressed P-256 public key)
 *   VAPID_SUBJECT      — "mailto:noreply@bcoffense.com"
 */

const enc = new TextEncoder();

// ── Encoding helpers ─────────────────────────────────────────────────────────

function b64uEncode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function b64uDecode(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Uint8Array.from(atob(s + pad), (c) => c.charCodeAt(0));
}

function concat(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

// ── HKDF (manual HMAC-SHA-256 based) ────────────────────────────────────────

async function hmacSha256(key, data) {
  const k = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// HKDF-Extract: PRK = HMAC-SHA-256(salt, IKM)
async function hkdfExtract(salt, ikm) {
  return hmacSha256(salt, ikm);
}

// HKDF-Expand: OKM of `length` bytes
async function hkdfExpand(prk, info, length) {
  const out = new Uint8Array(length);
  let t = new Uint8Array(0);
  let pos = 0;
  for (let i = 1; pos < length; i++) {
    t = await hmacSha256(prk, concat(t, info, new Uint8Array([i])));
    const chunk = t.slice(0, Math.min(t.length, length - pos));
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

// ── RFC 8291 aes128gcm encryption ────────────────────────────────────────────

async function encryptPayload(p256dhB64u, authB64u, payloadStr) {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Import subscriber's public key
  const subscriberPubRaw = b64uDecode(p256dhB64u);
  const subscriberKey = await crypto.subtle.importKey(
    "raw",
    subscriberPubRaw,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );

  // Generate ephemeral sender key pair
  const senderKP = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const senderPubRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", senderKP.publicKey),
  );

  // ECDH shared secret (32 bytes)
  const ecdhBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: subscriberKey },
    senderKP.privateKey,
    256,
  );
  const ecdhSecret = new Uint8Array(ecdhBits);

  const authBytes = b64uDecode(authB64u);

  // Step 1: PRK_key = HKDF-Extract(salt=auth, IKM=ecdhSecret)
  const prk1 = await hkdfExtract(authBytes, ecdhSecret);

  // Step 2: IKM = HKDF-Expand(PRK_key, "WebPush: info\0" + subPub + senderPub, 32)
  const infoLabel = concat(
    enc.encode("WebPush: info\x00"),
    subscriberPubRaw,
    senderPubRaw,
  );
  const ikm = await hkdfExpand(prk1, infoLabel, 32);

  // Step 3: PRK = HKDF-Extract(salt=message_salt, IKM=ikm)
  const prk2 = await hkdfExtract(salt, ikm);

  // Step 4: CEK (16 bytes) and Nonce (12 bytes)
  const cek = await hkdfExpand(
    prk2,
    enc.encode("Content-Encoding: aes128gcm\x00\x01"),
    16,
  );
  const nonce = await hkdfExpand(
    prk2,
    enc.encode("Content-Encoding: nonce\x00\x01"),
    12,
  );

  // Pad plaintext: message + 0x02 (last-record delimiter)
  const plaintext = concat(enc.encode(payloadStr), new Uint8Array([2]));

  // AES-128-GCM encrypt
  const cekKey = await crypto.subtle.importKey(
    "raw",
    cek,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cekKey, plaintext),
  );

  // Build content-encoding body:
  //   salt (16) | rs (4, uint32be = 4096) | idlen (1 = 65) | senderPub (65) | ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);

  return concat(salt, rs, new Uint8Array([65]), senderPubRaw, ciphertext);
}

// ── VAPID JWT (ES256) ────────────────────────────────────────────────────────

async function createVapidJwt(privateKeyB64u, endpoint, subject) {
  const { protocol, host } = new URL(endpoint);
  const audience = `${protocol}//${host}`;

  const header = b64uEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64uEncode(
    enc.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 43200, // 12 hours
        sub: subject,
      }),
    ),
  );

  const sigInput = enc.encode(`${header}.${payload}`);

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    b64uDecode(privateKeyB64u),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    sigInput,
  );

  return `${header}.${payload}.${b64uEncode(sig)}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * A delivery result is deliberately endpoint-scoped. The caller can aggregate
 * it without retaining the subscription URL (which can contain a device token).
 */
export const WEB_PUSH_OUTCOMES = Object.freeze({
  SENT: "sent",
  PERMANENT: "permanent",
  RETRYABLE: "retryable",
  TERMINAL: "terminal",
  CONFIGURATION: "configuration",
});

function pushResult(outcome, { status = null, retryAfterSeconds = null } = {}) {
  return {
    ok: outcome === WEB_PUSH_OUTCOMES.SENT,
    // Kept for existing callers that retire subscriptions after a 404/410.
    gone: outcome === WEB_PUSH_OUTCOMES.PERMANENT,
    outcome,
    retryable: outcome === WEB_PUSH_OUTCOMES.RETRYABLE,
    status,
    retryAfterSeconds,
  };
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function retryAfterSeconds(response) {
  const raw = String(response?.headers?.get?.("Retry-After") || "").trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    // A malformed or extreme header should not create an unbounded retry delay.
    return Math.min(Number(raw), 24 * 60 * 60);
  }

  const retryAt = Date.parse(raw);
  if (!Number.isFinite(retryAt)) return null;
  return Math.min(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)), 24 * 60 * 60);
}

function classifyPushResponse(response) {
  const status = Number.isInteger(response?.status) ? response.status : null;

  if (response?.ok) return pushResult(WEB_PUSH_OUTCOMES.SENT, { status });

  // 410 Gone / 404 Not Found means this subscription endpoint cannot be used
  // again. It is safe for the caller to retire only this endpoint.
  if (status === 404 || status === 410) {
    return pushResult(WEB_PUSH_OUTCOMES.PERMANENT, { status });
  }

  // Push services use 401/403 when the VAPID signing key, public key, or
  // subject is rejected. That is deployment configuration—not evidence that
  // this particular device endpoint is bad—so leave subscriptions intact and
  // let the durable Worker retry after an operator restores the known keypair.
  if (status === 401 || status === 403) {
    return pushResult(WEB_PUSH_OUTCOMES.CONFIGURATION, { status });
  }

  // Push services use 429 for rate limits; a few also surface transient
  // gateway/time-out failures as 408/425/5xx. Those are the only HTTP classes
  // we retry automatically.
  if (status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599)) {
    return pushResult(WEB_PUSH_OUTCOMES.RETRYABLE, {
      status,
      retryAfterSeconds: retryAfterSeconds(response),
    });
  }

  // Other non-success responses reject this message or its authorization. The
  // endpoint is not necessarily dead, so do not mark it failed, but a queue
  // should not spin forever retrying the same terminal client failure.
  return pushResult(WEB_PUSH_OUTCOMES.TERMINAL, { status });
}

/**
 * Send a Web Push notification to a single subscription endpoint.
 *
 * @param {object} env - Cloudflare env (VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT)
 * @param {{ endpoint: string, p256dh: string, auth: string }} subscription
 * @param {{ title: string, body: string, url?: string, deepLink?: string, tag?: string }} notification
 * @returns {Promise<{ ok: boolean, gone: boolean, outcome: string, retryable: boolean, status: number|null, retryAfterSeconds: number|null }>}
 *   `gone` remains the legacy compatibility flag for 404/410. `outcome` is
 *   safe to aggregate for durable delivery: sent, permanent, retryable,
 *   terminal, or configuration.
 */
export async function sendWebPush(env, subscription, notification) {
  const {
    VAPID_PRIVATE_KEY,
    VAPID_PUBLIC_KEY,
    VAPID_SUBJECT = "mailto:noreply@bcoffense.com",
  } = env || {};

  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
    console.warn("[web-push] VAPID keys not configured — skipping push");
    return pushResult(WEB_PUSH_OUTCOMES.CONFIGURATION);
  }

  if (!hasText(subscription?.endpoint) || !hasText(subscription?.p256dh) || !hasText(subscription?.auth)) {
    return pushResult(WEB_PUSH_OUTCOMES.TERMINAL);
  }

  const endpoint = subscription.endpoint.trim();
  try {
    const parsedEndpoint = new URL(endpoint);
    if (parsedEndpoint.protocol !== "https:") {
      return pushResult(WEB_PUSH_OUTCOMES.TERMINAL);
    }
  } catch {
    return pushResult(WEB_PUSH_OUTCOMES.TERMINAL);
  }

  const payload = JSON.stringify({
    title: notification.title || "BCOffense",
    body: notification.body || "",
    url: notification.url || "/",
    deepLink: notification.deepLink || "",
    tag: notification.tag || "bcoffense",
    badge: notification.badge || "./icons/icon-192.png",
  });

  let body;
  try {
    // Bad subscriber keys are endpoint-specific and will not become valid by
    // retrying this same delivery.
    body = await encryptPayload(subscription.p256dh, subscription.auth, payload);
  } catch {
    return pushResult(WEB_PUSH_OUTCOMES.TERMINAL);
  }

  let jwt;
  try {
    // A malformed VAPID private key is deployment configuration, not a bad
    // device subscription. Do not retire any endpoints in this case.
    jwt = await createVapidJwt(VAPID_PRIVATE_KEY, endpoint, VAPID_SUBJECT);
  } catch {
    return pushResult(WEB_PUSH_OUTCOMES.CONFIGURATION);
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        TTL: "300",
        Urgency: "normal",
        Authorization: `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      },
      body,
    });
  } catch {
    // Network and transport errors have no stable HTTP status and are safe to
    // retry. Keep the caught error private because it can embed endpoint data.
    return pushResult(WEB_PUSH_OUTCOMES.RETRYABLE);
  }

  return classifyPushResponse(response);
}
