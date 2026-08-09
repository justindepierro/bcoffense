/** Runtime checks for legacy-staff retirement semantics. */

import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const {
  createSessionCookie,
  getSessionFromRequest,
  verifyCredentials,
} = await import("../functions/_lib/auth.js");

function cookieRequest(cookie) {
  return new Request("https://bcoffense.example/auth/me", { headers: { Cookie: cookie.split(";")[0] } });
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const shared = {
  AUTH_SESSION_SECRET: "runtime-admin-bootstrap-test-secret",
  AUTH_PRIMARY_TEAM_ID: "team-runtime-test",
};

const staticAdminCookie = await createSessionCookie(
  { username: "admin", role: "admin", label: "Admin" },
  shared,
);
const staticPlayerCookie = await createSessionCookie(
  { username: "player", role: "player", label: "Player" },
  shared,
);

assert.equal(
  (await getSessionFromRequest(cookieRequest(staticAdminCookie), shared))?.role,
  "admin",
  "legacy admin session remains valid until the explicit retirement switch is set",
);
assert.equal(
  await getSessionFromRequest(cookieRequest(staticAdminCookie), {
    ...shared,
    AUTH_LEGACY_STATIC_STAFF_ENABLED: "false",
  }),
  null,
  "the retirement switch invalidates an already-issued static admin session",
);
assert.equal(
  (await getSessionFromRequest(cookieRequest(staticPlayerCookie), {
    ...shared,
    AUTH_LEGACY_STATIC_STAFF_ENABLED: "false",
  }))?.role,
  "player",
  "the retirement switch does not invalidate the static player account",
);
assert.equal(
  await verifyCredentials("admin", "unused", { AUTH_LEGACY_STATIC_STAFF_ENABLED: "false" }),
  null,
  "retired static admin credentials are rejected before legacy password secrets are read",
);
assert.equal(
  await verifyCredentials("coach", "unused", { AUTH_LEGACY_STATIC_STAFF_ENABLED: "false" }),
  null,
  "retired static coach credentials are rejected before legacy password secrets are read",
);
assert.equal(
  (await verifyCredentials("player", "player-password", {
    AUTH_LEGACY_STATIC_STAFF_ENABLED: "false",
    AUTH_PLAYER_PASSWORD_SHA256: await sha256Hex("player:player-password"),
  }))?.role,
  "player",
  "the static player credential remains usable after legacy staff retirement",
);

const namedAdminDb = {
  prepare() {
    return {
      bind() {
        return {
          first: async () => ({
            role: "admin",
            status: "active",
            team_id: "team-runtime-test",
            permissions_json: "[]",
            sessions_invalid_before: 0,
          }),
        };
      },
    };
  },
};
const namedAdminCookie = await createSessionCookie(
  {
    username: "named-admin@example.com",
    role: "admin",
    label: "Named Admin",
    d1: true,
    d1_user_id: "named-admin-id",
  },
  shared,
);
assert.equal(
  (await getSessionFromRequest(cookieRequest(namedAdminCookie), {
    ...shared,
    AUTH_LEGACY_STATIC_STAFF_ENABLED: "false",
    DB: namedAdminDb,
  }))?.d1UserId,
  "named-admin-id",
  "a D1-backed admin remains authenticated after static staff retirement",
);

console.log("admin bootstrap runtime: 7 checks passed");
