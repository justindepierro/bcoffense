import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { createSessionCookie, getSessionFromRequest } = await import("../functions/_lib/auth.js");
const { changeD1Password, hashPassword, verifyPassword } = await import("../functions/_lib/d1-auth.js");
const { onRequestPost } = await import("../functions/api/account/password.js");

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path) => readFile(new URL(path, `file://${root}/`), "utf8");
const [route, authClient, index] = await Promise.all([
  source("functions/api/account/password.js"),
  source("js/auth.js"),
  source("index.html"),
]);

assert.match(route, /if \(!session\.d1UserId\)/, "only D1-backed personal accounts can change a password");
assert.doesNotMatch(route, /session\.role !== "player"/, "named staff can change their own password too");
assert.match(route, /const MAX_REQUEST_BYTES = 2048;/, "the endpoint has a finite request-body cap");
assert.match(route, /async function readBoundedJsonObject\(request\)/, "JSON is read through the bounded stream helper");
assert.match(route, /typeof currentPassword !== "string" \|\| typeof newPassword !== "string"/, "password fields must be actual strings, never coerced values");
assert.match(route, /currentPassword\.length > MAX_PASSWORD_LENGTH \|\| newPassword\.length > MAX_PASSWORD_LENGTH/, "both password values are bounded before PBKDF2");
assert.match(route, /const \{ currentPassword, newPassword \} = body;/, "the current password is treated as an exact credential value");
assert.match(route, /await changeD1Password\(env\.DB, session\.d1UserId, currentPassword, newPassword\)/, "the endpoint reuses the shared verified password-update path");
assert.match(route, /createSessionCookie\(/, "the caller receives a fresh authenticated session after a password change");
assert.match(route, /account-password:ip:[\s\S]*?account-password:user:/, "verification attempts are rate-limited in their own existing-ledger namespace");
assert.match(route, /INSERT INTO login_attempts \(id, ip_addr, username, success, attempted_at\)/, "verification attempts use the existing durable rate-limit ledger");
assert.match(route, /PASSWORD_VERIFY_MAX_IP = 20[\s\S]*?PASSWORD_VERIFY_MAX_ACCOUNT = 5/, "verification limits cover both IP and account scopes");
assert.match(route, /SELECT COUNT\(\*\) FROM login_attempts WHERE ip_addr = \?/, "the IP cap is checked atomically in the reservation insert");
assert.match(route, /SELECT COUNT\(\*\) FROM login_attempts WHERE username = \?/, "the account cap is checked atomically in the reservation insert");
assert.match(route, /session_epoch: result\.sessionEpoch/, "the replacement session receives the committed session epoch");

assert.match(index, /id="accountSecurityMenuItem"[^>]*data-action="openAccountSecurity"/, "personal-account security is reachable from the signed-in menu");
assert.match(index, /id="accountSecurityHeaderTrigger"[^>]*data-action="openAccountSecurity"/, "personal-account security is reachable from the desktop header");
assert.match(index, /id="accountSecurityOverlay"/, "the account-security form is present in the application shell");
assert.match(index, /autocomplete="current-password"/, "the current-password field has the browser-safe autocomplete hint");
assert.match(index, /autocomplete="new-password"/, "the new-password fields have the browser-safe autocomplete hint");
assert.match(authClient, /#accountSecurityHeaderTrigger, #accountSecurityMenuItem/, "both account-security entries share one personal-account visibility gate");
assert.match(authClient, /trigger\.hidden = !hasPersonalAccount\(\)/, "account-security entries are hidden for shared static credentials");
assert.match(authClient, /fetch\("\/api\/account\/password", \{[\s\S]*?credentials: "same-origin",[\s\S]*?cache: "no-store",[\s\S]*?body: JSON\.stringify\(\{ currentPassword, newPassword \}\)/, "the form uses the protected self-service endpoint without caching secrets");
assert.match(authClient, /newPassword !== confirmPassword/, "the client requires confirmation before submitting a new password");
assert.match(authClient, /document\.getElementById\("accountSecurityForm"\)\?\.reset\(\);[\s\S]*?Other signed-in devices have been signed out\./, "successful changes clear password fields and explain the session effect");
assert.match(authClient, /let accountSecurityRequestGeneration = 0;/, "the dialog tracks a distinct request generation");
assert.match(authClient, /function invalidateAccountSecurityRequest\(\) \{[\s\S]*?controller\?\.abort\(\);/, "closing or reopening the dialog aborts its prior request");
assert.match(authClient, /signal: controller\?\.signal/, "the password request is tied to the dialog abort signal");
assert.match(authClient, /if \(!isCurrentAccountSecurityRequest\(requestGeneration\)\) return;/, "a stale password response cannot modify a newer dialog");

function makeRequest(cookie, body, opts = {}) {
  return new Request("https://bcoffense.example/api/account/password", {
    method: "POST",
    headers: {
      Cookie: cookie.split(";")[0],
      "Content-Type": "application/json",
      ...(opts.ip ? { "CF-Connecting-IP": opts.ip } : {}),
    },
    body: opts.rawBody ?? JSON.stringify(body),
  });
}

function sessionRequest(cookie) {
  return new Request("https://bcoffense.example/auth/me", {
    headers: { Cookie: cookie.split(";")[0] },
  });
}

async function makePasswordDb(initialPassword) {
  const raw = new DatabaseSync(":memory:");
  raw.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      password_hash TEXT,
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      lockout_until INTEGER,
      password_changed_at INTEGER,
      updated_at INTEGER,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      team_id TEXT NOT NULL
    );
    CREATE TABLE staff_access (
      user_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      permissions_json TEXT
    );
    CREATE TABLE account_session_state (
      user_id TEXT PRIMARY KEY,
      invalid_before INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE account_session_epochs (
      user_id TEXT PRIMARY KEY,
      session_epoch TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE login_attempts (
      id TEXT PRIMARY KEY,
      ip_addr TEXT NOT NULL,
      username TEXT NOT NULL,
      success INTEGER NOT NULL,
      attempted_at INTEGER NOT NULL
    );
  `);
  raw.prepare(`INSERT INTO users
    (id, password_hash, failed_login_count, lockout_until, role, status, team_id)
    VALUES (?, ?, 4, 12345, 'admin', 'active', 'team-password-test')`)
    .run("named-admin-id", await hashPassword(initialPassword));

  function resultFor(statement) {
    const result = statement.run();
    return { success: true, meta: { changes: Number(result.changes || 0) } };
  }

  const d1 = {
    raw,
    beforeBatch: null,
    failBatchAfterStatement: null,
    prepare(sql) {
      return {
        bind(...values) {
          const statement = raw.prepare(sql);
          return {
            first: async () => statement.get(...values) || null,
            run: async () => resultFor({ run: () => statement.run(...values) }),
            // D1Database.batch receives bound prepared statements. Keep the
            // tiny adapter faithful so the endpoint test exercises the same
            // transactional path as production.
            __run: () => resultFor({ run: () => statement.run(...values) }),
          };
        },
      };
    },
    async batch(statements) {
      if (typeof d1.beforeBatch === "function") await d1.beforeBatch(raw);
      raw.exec("BEGIN IMMEDIATE");
      try {
        const results = [];
        for (let index = 0; index < statements.length; index += 1) {
          results.push(statements[index].__run());
          if (d1.failBatchAfterStatement === index) {
            throw new Error("Simulated D1 batch failure");
          }
        }
        raw.exec("COMMIT");
        return results;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return d1;
}

const env = {
  AUTH_SESSION_SECRET: "account-password-runtime-test-secret",
  AUTH_PRIMARY_TEAM_ID: "team-password-test",
};
const db = await makePasswordDb(" current-password ");
env.DB = db;
const namedCookie = await createSessionCookie({
  username: "named-admin@example.com",
  role: "admin",
  label: "Named Admin",
  d1: true,
  d1_user_id: "named-admin-id",
}, env);

const malformedResponse = await onRequestPost({ request: makeRequest(namedCookie, null), env });
assert.equal(malformedResponse.status, 400, "a JSON null body is rejected instead of causing a server error");

const updatedResponse = await onRequestPost({
  request: makeRequest(namedCookie, {
    currentPassword: " current-password ",
    newPassword: " new-password-2026 ",
  }),
  env,
});
assert.equal(updatedResponse.status, 200, "a named admin can update their own password");
assert.equal((await updatedResponse.json()).ok, true, "the password update reports success");
const replacementCookie = updatedResponse.headers.get("Set-Cookie") || "";
assert.match(replacementCookie, /__Host-bc_auth=/, "the caller receives a fresh signed session cookie");
const changedUser = db.raw.prepare("SELECT password_hash, failed_login_count, lockout_until FROM users WHERE id = ?")
  .get("named-admin-id");
assert.equal(await verifyPassword(" new-password-2026 ", changedUser.password_hash), true, "literal surrounding password spaces are preserved");
assert.equal(changedUser.failed_login_count, 0, "a successful update clears failed login attempts");
assert.equal(changedUser.lockout_until, null, "a successful update clears the temporary lockout");
const epochRow = db.raw.prepare("SELECT session_epoch FROM account_session_epochs WHERE user_id = ?")
  .get("named-admin-id");
assert.ok(epochRow?.session_epoch, "a successful update atomically rotates the account session epoch");
assert.equal(await getSessionFromRequest(sessionRequest(namedCookie), env), null, "the old same-second session is revoked");
assert.ok(await getSessionFromRequest(sessionRequest(replacementCookie), env), "the freshly issued session matches the new epoch");
const successAttempt = db.raw.prepare("SELECT success FROM login_attempts ORDER BY attempted_at DESC LIMIT 1").get();
assert.equal(successAttempt?.success, 1, "the successful verification reservation is marked as a success");

const raceDb = await makePasswordDb("race-current-password");
raceDb.beforeBatch = async (raw) => {
  raw.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(await hashPassword("intervening-password"), "named-admin-id");
};
const raceResult = await changeD1Password(
  raceDb,
  "named-admin-id",
  "race-current-password",
  "racing-new-password",
);
assert.equal(raceResult.error, "Password changed in another session.", "a conditional hash mismatch fails rather than overwriting a concurrent password change");
const raceUser = raceDb.raw.prepare("SELECT password_hash FROM users WHERE id = ?").get("named-admin-id");
assert.equal(await verifyPassword("intervening-password", raceUser.password_hash), true, "the concurrent password remains authoritative after the failed conditional update");
assert.equal(raceDb.raw.prepare("SELECT COUNT(*) AS n FROM account_session_state").get().n, 0, "a lost password-update race does not partially advance the legacy session fence");
assert.equal(raceDb.raw.prepare("SELECT COUNT(*) AS n FROM account_session_epochs").get().n, 0, "a lost password-update race does not partially advance the session epoch");

const atomicFailureDb = await makePasswordDb("atomic-current-password");
const atomicFailureCookie = await createSessionCookie({
  username: "named-admin@example.com", role: "admin", label: "Named Admin", d1: true, d1_user_id: "named-admin-id",
}, env);
// Throw after the password statement has run. The adapter rolls back the D1
// batch just as production D1 does, proving no partial password update escapes.
atomicFailureDb.failBatchAfterStatement = 0;
env.DB = atomicFailureDb;
const atomicFailureResponse = await onRequestPost({
  request: makeRequest(atomicFailureCookie, {
    currentPassword: "atomic-current-password",
    newPassword: "atomic-new-password",
  }),
  env,
});
assert.equal(atomicFailureResponse.status, 503, "a failed password/session batch fails closed without issuing a new cookie");
assert.equal(atomicFailureResponse.headers.get("Set-Cookie"), null, "a failed batch never issues a replacement session");
const atomicFailureUser = atomicFailureDb.raw.prepare("SELECT password_hash FROM users WHERE id = ?").get("named-admin-id");
assert.equal(await verifyPassword("atomic-current-password", atomicFailureUser.password_hash), true, "batch rollback preserves the old password after a second-write failure");
assert.equal(atomicFailureDb.raw.prepare("SELECT COUNT(*) AS n FROM account_session_state").get().n, 0, "batch rollback leaves the legacy session fence untouched");
assert.equal(atomicFailureDb.raw.prepare("SELECT COUNT(*) AS n FROM account_session_epochs").get().n, 0, "batch rollback leaves the exact session epoch untouched");
assert.ok(await getSessionFromRequest(sessionRequest(atomicFailureCookie), env), "the original session remains valid after a rejected atomic update");
env.DB = db;

const typedInputResponse = await onRequestPost({
  request: makeRequest(replacementCookie, { currentPassword: { not: "a password" }, newPassword: "new-password-2027" }),
  env,
});
assert.equal(typedInputResponse.status, 400, "non-string password JSON values are rejected before verification");

const oversizedPasswordResponse = await onRequestPost({
  request: makeRequest(replacementCookie, { currentPassword: " new-password-2026 ", newPassword: "x".repeat(129) }),
  env,
});
assert.equal(oversizedPasswordResponse.status, 400, "passwords beyond the defined maximum are rejected before verification");

const oversizedBodyResponse = await onRequestPost({
  request: makeRequest(replacementCookie, null, { rawBody: `{"currentPassword":"${"x".repeat(2050)}","newPassword":"new-password-2027"}` }),
  env,
});
assert.equal(oversizedBodyResponse.status, 400, "oversized JSON bodies are rejected without parsing the full payload");

const accountRateDb = await makePasswordDb("account-rate-password");
const accountRateIp = "203.0.113.31";
const now = Math.floor(Date.now() / 1000);
for (let i = 0; i < 5; i++) {
  accountRateDb.raw.prepare("INSERT INTO login_attempts (id, ip_addr, username, success, attempted_at) VALUES (?, ?, ?, 0, ?)")
    .run(`account-rate-${i}`, `account-password:ip:${accountRateIp}`, "account-password:user:named-admin-id", now);
}
env.DB = accountRateDb;
const accountRateCookie = await createSessionCookie({
  username: "named-admin@example.com", role: "admin", label: "Named Admin", d1: true, d1_user_id: "named-admin-id",
}, env);
const accountRateResponse = await onRequestPost({
  request: makeRequest(accountRateCookie, { currentPassword: "account-rate-password", newPassword: "new-password-2027" }, { ip: accountRateIp }),
  env,
});
assert.equal(accountRateResponse.status, 429, "five recent verification attempts throttle a single account");
assert.equal(accountRateResponse.headers.get("Retry-After"), "900", "throttled verification replies include a retry window");

const ipRateDb = await makePasswordDb("ip-rate-password");
const ipRateIp = "203.0.113.32";
for (let i = 0; i < 20; i++) {
  ipRateDb.raw.prepare("INSERT INTO login_attempts (id, ip_addr, username, success, attempted_at) VALUES (?, ?, ?, 0, ?)")
    .run(`ip-rate-${i}`, `account-password:ip:${ipRateIp}`, `account-password:user:other-${i}`, now);
}
env.DB = ipRateDb;
const ipRateCookie = await createSessionCookie({
  username: "named-admin@example.com", role: "admin", label: "Named Admin", d1: true, d1_user_id: "named-admin-id",
}, env);
const ipRateResponse = await onRequestPost({
  request: makeRequest(ipRateCookie, { currentPassword: "ip-rate-password", newPassword: "new-password-2027" }, { ip: ipRateIp }),
  env,
});
assert.equal(ipRateResponse.status, 429, "twenty recent verification attempts throttle a single IP");

const staticCookie = await createSessionCookie({ username: "admin", role: "admin", label: "Admin" }, env);
const staticResponse = await onRequestPost({
  request: makeRequest(staticCookie, { currentPassword: "anything", newPassword: "new-password-2026" }),
  env,
});
assert.equal(staticResponse.status, 403, "shared static credentials cannot use the personal-account endpoint");

console.log("account password contract: 51 assertions passed");
