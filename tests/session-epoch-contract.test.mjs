import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { createSessionCookie, getSessionFromRequest } = await import("../functions/_lib/auth.js");
const { hashPassword, verifyD1Credentials } = await import("../functions/_lib/d1-auth.js");

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path) => readFile(new URL(path, `file://${root}/`), "utf8");
const [auth, d1Auth, migration] = await Promise.all([
  source("functions/_lib/auth.js"),
  source("functions/_lib/d1-auth.js"),
  source("migrations/0027_account_session_epochs.sql"),
]);

assert.match(migration, /CREATE TABLE IF NOT EXISTS account_session_epochs/, "the session epoch has a forward-safe D1 table");
assert.match(migration, /session_epoch TEXT NOT NULL/, "each recorded epoch is mandatory");
assert.match(auth, /se: String\(user\.session_epoch \|\| ""\)/, "new D1 cookies carry their account session epoch");
assert.match(auth, /LEFT JOIN account_session_epochs ON account_session_epochs\.user_id = users\.id/, "D1 session validation reads the current epoch");
assert.match(auth, /String\(session\.se \|\| ""\) !== String\(row\.session_epoch \|\| ""\)/, "a stale signed epoch is rejected");
assert.match(d1Auth, /COALESCE\(account_session_epochs\.session_epoch, ''\) AS session_epoch/, "normal D1 logins load the current epoch");
assert.match(d1Auth, /session_epoch: String\(user\.session_epoch \|\| ""\)/, "the verified login result carries the epoch into its replacement cookie");

const env = {
  AUTH_SESSION_SECRET: "session-epoch-contract-secret",
  AUTH_PRIMARY_TEAM_ID: "team-session-epoch",
};

function epochDb(epoch) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => {
              assert.match(sql, /LEFT JOIN account_session_epochs/, "session lookup joins the epoch state");
              return {
                role: "admin",
                status: "active",
                team_id: "team-session-epoch",
                permissions_json: "[]",
                sessions_invalid_before: 0,
                session_epoch: epoch,
              };
            },
          };
        },
      };
    },
  };
}

function requestFor(cookie) {
  return new Request("https://bcoffense.example/auth/me", {
    headers: { Cookie: cookie.split(";")[0] },
  });
}

async function loginEpochDb(epoch) {
  const passwordHash = await hashPassword("login-password-2026");
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => {
              if (/FROM users\s+LEFT JOIN account_session_epochs/.test(sql)) {
                return {
                  id: "named-admin-id",
                  email: "named-admin@example.com",
                  display_name: "Named Admin",
                  role: "admin",
                  team_id: "team-session-epoch",
                  status: "active",
                  password_hash: passwordHash,
                  failed_login_count: 0,
                  lockout_until: null,
                  session_epoch: epoch,
                };
              }
              throw new Error(`Unexpected login query: ${sql}`);
            },
            run: async () => {
              if (/UPDATE users SET failed_login_count = 0/.test(sql)) {
                return { meta: { changes: 1 } };
              }
              throw new Error(`Unexpected login write: ${sql}`);
            },
          };
        },
      };
    },
  };
}

const namedUser = {
  username: "named-admin@example.com",
  role: "admin",
  label: "Named Admin",
  d1: true,
  d1_user_id: "named-admin-id",
};

const legacyCookie = await createSessionCookie(namedUser, env);
env.DB = epochDb("");
assert.ok(await getSessionFromRequest(requestFor(legacyCookie), env), "legacy D1 cookies remain valid while the account has no epoch");

const freshEpoch = "d7d105b1-84f9-4b85-b6d0-9e74a46355be";
const freshCookie = await createSessionCookie({ ...namedUser, session_epoch: freshEpoch }, env);
env.DB = epochDb(freshEpoch);
assert.ok(await getSessionFromRequest(requestFor(freshCookie), env), "the replacement cookie matches the new epoch");
assert.equal(await getSessionFromRequest(requestFor(legacyCookie), env), null, "an earlier same-second cookie is rejected by epoch mismatch");

const staleCookie = await createSessionCookie({ ...namedUser, session_epoch: "old-epoch" }, env);
assert.equal(await getSessionFromRequest(requestFor(staleCookie), env), null, "a prior nonempty epoch is rejected after revocation");

const normalLogin = await verifyD1Credentials(
  "named-admin@example.com",
  "login-password-2026",
  await loginEpochDb(freshEpoch),
);
assert.equal(normalLogin?.session_epoch, freshEpoch, "normal named login carries the current epoch forward");
const normalLoginCookie = await createSessionCookie(normalLogin, env);
env.DB = epochDb(freshEpoch);
assert.ok(await getSessionFromRequest(requestFor(normalLoginCookie), env), "a normal new login remains authenticated after a prior revocation");

console.log("session epoch contract: 14 assertions passed");
