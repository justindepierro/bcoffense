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
 * Send a Web Push notification to a single subscription endpoint.
 *
 * @param {object} env - Cloudflare env (VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT)
 * @param {{ endpoint: string, p256dh: string, auth: string }} subscription
 * @param {{ title: string, body: string, url?: string, deepLink?: string, tag?: string }} notification
 * @returns {Promise<{ ok: boolean, gone: boolean }>}
 *   gone=true when endpoint is permanently invalid (410/404) — caller should delete it.
 */
export async function sendWebPush(env, subscription, notification) {
  const {
    VAPID_PRIVATE_KEY,
    VAPID_PUBLIC_KEY,
    VAPID_SUBJECT = "mailto:noreply@bcoffense.com",
  } = env;

  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
    console.warn("[web-push] VAPID keys not configured — skipping push");
    return { ok: false, gone: false };
  }

  try {
    const payload = JSON.stringify({
      title: notification.title || "BCOffense",
      body: notification.body || "",
      url: notification.url || "/",
      deepLink: notification.deepLink || "",
      tag: notification.tag || "bcoffense",
      badge: notification.badge || "./icons/icon-192.png",
    });

    const body = await encryptPayload(subscription.p256dh, subscription.auth, payload);
    const jwt = await createVapidJwt(
      VAPID_PRIVATE_KEY,
      subscription.endpoint,
      VAPID_SUBJECT,
    );

    const res = await fetch(subscription.endpoint, {
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

    // 410 Gone / 404 Not Found = subscription is dead, caller must delete it
    if (res.status === 410 || res.status === 404) {
      return { ok: false, gone: true };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[web-push] Push failed ${res.status}:`, errText);
      return { ok: false, gone: false };
    }

    return { ok: true, gone: false };
  } catch (err) {
    console.error("[web-push] Unexpected error:", err);
    return { ok: false, gone: false };
  }
}
