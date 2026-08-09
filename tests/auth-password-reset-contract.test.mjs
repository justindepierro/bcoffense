import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { RequestBodyError, readBoundedFormObject } = await import("../functions/_lib/request-body.js");
const { parseLoginBody } = await import("../functions/_lib/auth.js");
const { onRequest: requestPasswordReset } = await import("../functions/auth/reset-password.js");
const { onRequest: acceptInvite } = await import("../functions/auth/accept-invite.js");
const { onRequest: confirmPasswordReset } = await import("../functions/auth/reset-confirm.js");

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path) => readFile(new URL(path, `file://${root}/`), "utf8");
const [authHelpers, resetConfirmRoute, resetPasswordRoute, acceptInviteRoute, serverAuth] = await Promise.all([
  source("functions/_lib/d1-auth.js"),
  source("functions/auth/reset-confirm.js"),
  source("functions/auth/reset-password.js"),
  source("functions/auth/accept-invite.js"),
  source("functions/_lib/auth.js"),
]);

assert.match(
  authHelpers,
  /SET password_hash = \?, password_changed_at = \?,\s*failed_login_count = 0, lockout_until = NULL, updated_at = \?/,
  "a password reset clears the failed-login counter and temporary lockout",
);
assert.match(
  authHelpers,
  /await db\.batch\(\[passwordUpdate, sessionState, epochState\]\)/,
  "a password reset atomically replaces the password and both session fences",
);
assert.match(
  authHelpers,
  /INSERT INTO account_session_epochs \(user_id, session_epoch, updated_at\)/,
  "a password reset rotates the exact session epoch as well as the timestamp fence",
);
assert.match(
  resetConfirmRoute,
  /await updateD1Password\(env\.DB, tokenRecord\.user_id, password\)/,
  "the reset-confirm route uses the shared safe password-update path",
);
assert.match(
  serverAuth,
  /PUBLIC_AUTH_BODY_MAX_BYTES = 8 \* 1024[\s\S]*?readBoundedJsonOrFormObject\(request, \{[\s\S]*?rejectDuplicateFields: LOGIN_DUPLICATE_FIELDS/,
  "login preserves JSON-or-form support while using a finite public-auth body cap",
);
for (const [label, route] of [
  ["reset request", resetPasswordRoute],
  ["invite acceptance", acceptInviteRoute],
  ["reset confirmation", resetConfirmRoute],
]) {
  assert.match(route, /readBoundedFormObject\(request, \{[\s\S]*?maxBytes: PUBLIC_AUTH_BODY_MAX_BYTES/, `${label} parses a bounded form body`);
  assert.match(route, /rejectDuplicateFields:/, `${label} rejects duplicate sensitive credentials`);
  assert.doesNotMatch(route, /await request\.formData\(\)/, `${label} does not buffer the incoming form directly`);
}
assert.match(
  resetPasswordRoute,
  /RESET_ISSUE_MAX_IP = 10[\s\S]*?RESET_ISSUE_MAX_EMAIL = 3/,
  "reset issuance has separate IP and email ceilings",
);
assert.match(
  resetPasswordRoute,
  /INSERT INTO login_attempts \(id, ip_addr, username, success, attempted_at\)[\s\S]*?SELECT COUNT\(\*\) FROM login_attempts WHERE ip_addr = \?[\s\S]*?SELECT COUNT\(\*\) FROM login_attempts WHERE username = \?/,
  "reset issuance reserves the existing durable ledger atomically",
);
assert.match(
  resetPasswordRoute,
  /if \(!reservation\.available\) \{[\s\S]*?return renderForm\(\{ success: true \}\);/,
  "quota exhaustion and ledger trouble return the same generic reset success page",
);

const jsonLogin = await parseLoginBody(new Request("https://bcoffense.example/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "player@example.test", password: "exact password" }),
}));
assert.equal(jsonLogin.username, "player@example.test", "login still accepts JSON credentials");
assert.equal(jsonLogin.password, "exact password", "login preserves JSON password text");

const formLogin = await parseLoginBody(new Request("https://bcoffense.example/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: "username=player%40example.test&password=exact+password",
}));
assert.equal(formLogin.username, "player@example.test", "login still accepts browser form credentials");
assert.equal(formLogin.password, "exact password", "login preserves form password text");

const legacyDuplicate = await readBoundedFormObject(new Request("https://bcoffense.example/test", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: "note=first&note=second",
}), { maxBytes: 1024 });
assert.equal(legacyDuplicate.note, "second", "other routes retain their historical final-value duplicate semantics");

await assert.rejects(
  () => parseLoginBody(new Request("https://bcoffense.example/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "username=first%40example.test&username=second%40example.test&password=secret",
  })),
  (error) => error instanceof RequestBodyError && error.status === 400 && error.code === "duplicate_form_field",
  "login rejects duplicate credential fields instead of choosing first or last",
);

await assert.rejects(
  () => parseLoginBody(new Request("https://bcoffense.example/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `username=player%40example.test&password=${"x".repeat(9 * 1024)}`,
  })),
  (error) => error instanceof RequestBodyError && error.status === 413 && error.code === "body_too_large",
  "login rejects an oversized credential form before form parsing",
);

function makeResetRequest(email, ip = "203.0.113.77", body = null) {
  return new Request("https://bcoffense.example/auth/reset-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "CF-Connecting-IP": ip,
    },
    body: body ?? new URLSearchParams({ email }).toString(),
  });
}

function makeLedgerDb() {
  const raw = new DatabaseSync(":memory:");
  raw.exec(`
    CREATE TABLE login_attempts (
      id TEXT PRIMARY KEY,
      ip_addr TEXT NOT NULL,
      username TEXT NOT NULL,
      success INTEGER NOT NULL,
      attempted_at INTEGER NOT NULL
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      status TEXT NOT NULL,
      password_hash TEXT,
      display_name TEXT
    );
    CREATE TABLE account_session_epochs (
      user_id TEXT PRIMARY KEY,
      session_epoch TEXT NOT NULL
    );
  `);
  const queries = [];
  return {
    raw,
    queries,
    prepare(sql) {
      queries.push(sql);
      return {
        bind(...values) {
          const statement = raw.prepare(sql);
          return {
            first: async () => statement.get(...values) || null,
            run: async () => {
              const result = statement.run(...values);
              return { success: true, meta: { changes: Number(result.changes || 0) } };
            },
          };
        },
      };
    },
  };
}

function seedResetAttempt(db, id, ip, email, now = Math.floor(Date.now() / 1000)) {
  db.raw.prepare(`INSERT INTO login_attempts (id, ip_addr, username, success, attempted_at)
    VALUES (?, ?, ?, 0, ?)`)
    .run(id, `password-reset:ip:${ip}`, `password-reset:email:${email}`, now);
}

const genericSuccess = /If that email matches an account, a reset link is on its way\./;
const emailLimitIp = "203.0.113.78";
const emailLimitAddress = "player@example.test";
const emailLimitDb = makeLedgerDb();
for (let index = 0; index < 3; index += 1) {
  seedResetAttempt(emailLimitDb, `email-limit-${index}`, emailLimitIp, emailLimitAddress);
}
const emailLimitResponse = await requestPasswordReset({
  request: makeResetRequest(emailLimitAddress, emailLimitIp),
  env: { DB: emailLimitDb },
});
assert.equal(emailLimitResponse.status, 200, "an email reset quota returns an indistinguishable success page");
assert.match(await emailLimitResponse.text(), genericSuccess, "email quota response never exposes the cap");
assert.equal(emailLimitDb.queries.length, 1, "an exhausted email quota stops before user lookup, token creation, or email delivery");
assert.equal(
  emailLimitDb.raw.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE username = ?")
    .get(`password-reset:email:${emailLimitAddress}`).n,
  3,
  "an exhausted email quota does not create another token-issuance reservation",
);
emailLimitDb.raw.close();

const ipLimitIp = "203.0.113.79";
const ipLimitDb = makeLedgerDb();
for (let index = 0; index < 10; index += 1) {
  seedResetAttempt(ipLimitDb, `ip-limit-${index}`, ipLimitIp, `other-${index}@example.test`);
}
const ipLimitResponse = await requestPasswordReset({
  request: makeResetRequest("fresh@example.test", ipLimitIp),
  env: { DB: ipLimitDb },
});
assert.match(await ipLimitResponse.text(), genericSuccess, "an IP reset quota also stays generic");
assert.equal(ipLimitDb.queries.length, 1, "an exhausted IP quota also stops before user lookup, token creation, or email delivery");
assert.equal(
  ipLimitDb.raw.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip_addr = ?")
    .get(`password-reset:ip:${ipLimitIp}`).n,
  10,
  "an exhausted IP quota prevents a new issuance reservation",
);
ipLimitDb.raw.close();

const concurrentIp = "203.0.113.80";
const concurrentDb = makeLedgerDb();
const concurrentResponses = await Promise.all(
  Array.from({ length: 12 }, (_, index) => requestPasswordReset({
    request: makeResetRequest(`concurrent-${index}@example.test`, concurrentIp),
    env: { DB: concurrentDb },
  })),
);
assert.ok(
  concurrentResponses.every((response) => response.status === 200),
  "reset attempts remain generically successful while concurrent reservations compete",
);
assert.equal(
  concurrentDb.raw.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip_addr = ?")
    .get(`password-reset:ip:${concurrentIp}`).n,
  10,
  "the one-statement reservation caps a concurrent IP burst at ten issuance attempts",
);
concurrentDb.raw.close();

let outageLedgerTouched = false;
const outageResponse = await requestPasswordReset({
  request: makeResetRequest("outage@example.test", "203.0.113.81"),
  env: {
    DB: {
      prepare() {
        outageLedgerTouched = true;
        throw new Error("simulated ledger outage");
      },
    },
  },
});
assert.equal(outageLedgerTouched, true, "the reset route attempts to reserve durable quota before account lookup");
assert.match(await outageResponse.text(), genericSuccess, "a quota-ledger outage is generic and does not issue a token or email");

let parserTouchedDb = false;
const duplicateResetResponse = await requestPasswordReset({
  request: makeResetRequest("ignored@example.test", "203.0.113.82", "email=first%40example.test&email=second%40example.test"),
  env: { DB: { prepare() { parserTouchedDb = true; throw new Error("must not query"); } } },
});
assert.equal(parserTouchedDb, false, "duplicate reset email input is rejected before quota or account work");
assert.match(await duplicateResetResponse.text(), /Invalid submission\./, "duplicate reset email input keeps the existing form error UX");

const wrongTypeResetResponse = await requestPasswordReset({
  request: new Request("https://bcoffense.example/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "player@example.test" }),
  }),
  env: { DB: { prepare() { throw new Error("must not query"); } } },
});
assert.match(await wrongTypeResetResponse.text(), /Invalid submission\./, "reset request retains form-only content-type handling");

const oversizedResetResponse = await requestPasswordReset({
  request: makeResetRequest("ignored@example.test", "203.0.113.83", `email=valid%40example.test&padding=${"x".repeat(9 * 1024)}`),
  env: { DB: { prepare() { throw new Error("must not query"); } } },
});
assert.match(await oversizedResetResponse.text(), /Invalid submission\./, "oversized reset forms are rejected before the route buffers/parses them");

for (const [label, handler, url] of [
  ["invite acceptance", acceptInvite, "https://bcoffense.example/auth/accept-invite"],
  ["reset confirmation", confirmPasswordReset, "https://bcoffense.example/auth/reset-confirm"],
]) {
  const duplicateCredentialResponse = await handler({
    request: new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "token=first&token=second&password=valid-password&confirmPassword=valid-password",
    }),
    env: { DB: {} },
  });
  assert.equal(duplicateCredentialResponse.status, 400, `${label} rejects duplicate token input before database work`);
  assert.match(await duplicateCredentialResponse.text(), /Invalid form submission\./, `${label} keeps its existing invalid-form UX`);
}

console.log("auth password reset contract: public input and issuance protections passed");
