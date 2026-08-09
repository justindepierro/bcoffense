/**
 * D1 player account helpers — Slice 1 (OMG Phase 5)
 *
 * Password hashing: PBKDF2 via Web Crypto — no npm required.
 * Token hashing: SHA-256 — raw token sent by email only, hash stored in D1.
 */

import { parseCoachPermissions } from "./staff-access.js";

const PBKDF2_ITERATIONS = 100_000;
// Used only to give nonexistent and inactive accounts the same PBKDF2 work as
// a normal password check. It is not a credential and never authenticates.
const DUMMY_PASSWORD_HASH =
  "pbkdf2:100000:58c0d53f08b7d2d77650c52d7aacb532:0f1d7b0a04cff6fdc4019b6df6b3f3a1da7e695f699f82661848775e3f10a1c1";

// ── Lockout policy ───────────────────────────────────────────────────────────
const LOCKOUT_MAX_ATTEMPTS = 5;          // failed logins before lockout
const LOCKOUT_DURATION_SECONDS = 15 * 60; // 15-minute cooldown

function enc() { return new TextEncoder(); }

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function requireSuccessfulD1Batch(results) {
  if (!Array.isArray(results) || results.some((result) => result?.success === false)) {
    throw new Error("D1 password/session transaction did not commit.");
  }
  return results;
}

// ── Token helpers ─────────────────────────────────────────────────────────────

export async function generateSecureToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hashToken(rawToken) {
  const digest = await crypto.subtle.digest("SHA-256", enc().encode(rawToken));
  return bytesToHex(digest);
}

// ── Password helpers ──────────────────────────────────────────────────────────

function generateSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function deriveKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc().encode(String(password || "")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc().encode(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return bytesToHex(bits);
}

export async function hashPassword(password) {
  const salt = generateSalt();
  const hash = await deriveKey(password, salt);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${salt}:${hash}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith("pbkdf2:")) return false;
  const parts = stored.split(":");
  if (parts.length !== 4) return false;
  const [, , salt] = parts;
  const candidate = await deriveKey(password, salt);
  const expected = parts[3];
  // Timing-safe compare
  let diff = candidate.length ^ expected.length;
  const maxLen = Math.max(candidate.length, expected.length);
  for (let i = 0; i < maxLen; i++) {
    diff |= candidate.charCodeAt(i % candidate.length) ^ expected.charCodeAt(i % expected.length);
  }
  return diff === 0;
}

// ── D1 user queries ───────────────────────────────────────────────────────────

/** Find an active user by email address (email IS the login username). */
export async function findUserByEmail(db, email) {
  const clean = String(email || "").trim().toLowerCase();
  return db
    .prepare(`SELECT users.*, COALESCE(account_session_epochs.session_epoch, '') AS session_epoch
      FROM users
      LEFT JOIN account_session_epochs ON account_session_epochs.user_id = users.id
      WHERE LOWER(users.email) = ? AND users.status != 'archived'
      LIMIT 1`)
    .bind(clean)
    .first() || null;
}

export async function findUserById(db, id) {
  return db
    .prepare(`SELECT users.*, COALESCE(account_session_epochs.session_epoch, '') AS session_epoch
      FROM users
      LEFT JOIN account_session_epochs ON account_session_epochs.user_id = users.id
      WHERE users.id = ?
      LIMIT 1`)
    .bind(id)
    .first() || null;
}

/**
 * Verify D1 player credentials.
 * Returns a session user object on success, null on failure,
 * or { locked: true, until: <unix> } when the account is locked out.
 */
export async function verifyD1Credentials(email, password, db) {
  const user = await findUserByEmail(db, email);
  if (!user || user.status === "invited" || user.status === "disabled" || !user.password_hash) {
    // Do equivalent expensive work before rejecting so login timing does not
    // reveal whether an email address belongs to an active player account.
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    return null;
  }

  const now = Math.floor(Date.now() / 1000);

  // ── Lockout check ──────────────────────────────────────────────────────────
  if (user.lockout_until && user.lockout_until > now) {
    return { locked: true, until: user.lockout_until };
  }

  const ok = await verifyPassword(password, user.password_hash);

  if (!ok) {
    // Increment failure counter, set lockout if threshold reached
    const newCount = (user.failed_login_count || 0) + 1;
    const lockUntil = newCount >= LOCKOUT_MAX_ATTEMPTS
      ? now + LOCKOUT_DURATION_SECONDS
      : null;
    await db
      .prepare("UPDATE users SET failed_login_count = ?, lockout_until = ?, updated_at = ? WHERE id = ?")
      .bind(newCount, lockUntil, now, user.id)
      .run();
    if (lockUntil) return { locked: true, until: lockUntil };
    return null;
  }

  // ── Success: reset lockout + update last_login_at ──────────────────────────
  await db
    .prepare("UPDATE users SET failed_login_count = 0, lockout_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?")
    .bind(now, now, user.id)
    .run();

  let permissions = [];
  if (user.role === "coach") {
    const access = await db
      .prepare("SELECT permissions_json FROM staff_access WHERE user_id = ? AND team_id = ? LIMIT 1")
      .bind(user.id, user.team_id)
      .first();
    permissions = parseCoachPermissions(access?.permissions_json);
  }

  return {
    d1_user_id: user.id,
    // The login JSON response is used immediately by the player bootstrap.
    // Keep these browser-facing aliases alongside the cookie-facing snake_case
    // value so the first login can bind its isolated player cache to the
    // validated D1 principal without waiting for a second /auth/me request.
    d1UserId: user.id,
    teamId: String(user.team_id || "").trim(),
    username: user.email.toLowerCase(),
    role: user.role,
    label: user.display_name,
    d1: true,
    managedCoach: user.role === "coach",
    permissions,
    iat: now,
    session_epoch: String(user.session_epoch || ""),
  };
}

/**
 * Change a D1-backed account password after verifying the current one.
 * A structured result lets the caller distinguish validation failure from the
 * freshly generated session epoch required for its replacement cookie.
 */
export async function changeD1Password(db, userId, currentPassword, newPassword) {
  const user = await findUserById(db, userId);
  if (!user || !user.password_hash) return { error: "Account not found." };

  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) return { error: "Current password is incorrect." };

  const err = validatePassword(newPassword);
  if (err) return { error: err };

  // The conditional update makes two requests verified against the same old
  // password mutually exclusive: only the first can replace that hash.
  const sessionEpoch = await updateD1Password(db, userId, newPassword, user.password_hash);
  if (!sessionEpoch) return { error: "Password changed in another session." };
  return { ok: true, sessionEpoch };
}

/**
 * Invalidate all existing sessions for a user by updating sessions_invalid_before.
 * Any cookie issued before this timestamp will be rejected at API endpoints.
 */
export async function invalidateAllD1Sessions(db, userId) {
  const now = Math.floor(Date.now() / 1000);
  await setD1SessionInvalidBefore(db, userId, now);
}

/**
 * Store session invalidation separately from users so the contract works on
 * every production database, including installations that predate the column
 * that an earlier untracked deployment added to users.
 */
export async function setD1SessionInvalidBefore(db, userId, invalidBefore) {
  const value = Math.max(0, Number(invalidBefore) || 0);
  const now = Math.floor(Date.now() / 1000);
  const sessionEpoch = crypto.randomUUID();
  const sessionState = db
    .prepare(`INSERT INTO account_session_state (user_id, invalid_before, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        invalid_before = excluded.invalid_before,
        updated_at = excluded.updated_at`)
    .bind(userId, value, now);
  const epochState = db
    .prepare(`INSERT INTO account_session_epochs (user_id, session_epoch, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        session_epoch = excluded.session_epoch,
        updated_at = excluded.updated_at`)
    .bind(userId, sessionEpoch, now);

  // D1 batches are transactions. A forced logout must never update only one
  // of the legacy timestamp fence and the exact epoch fence in production.
  if (typeof db.batch === "function") {
    requireSuccessfulD1Batch(await db.batch([sessionState, epochState]));
  }
  else {
    // Lightweight in-memory test doubles predate D1 batch support. Pages D1
    // always takes the atomic branch above.
    await sessionState.run();
    await epochState.run();
  }
  return sessionEpoch;
}

/**
 * Create a new player user in D1.
 * Returns the new user ID.
 */
export async function createD1User(db, { email, displayName, firstName, lastName, role, teamId, jerseyNumber, position }) {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(`INSERT INTO users
      (id, email, display_name, first_name, last_name, role, team_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'invited', ?, ?)`)
    .bind(
      id,
      String(email).trim().toLowerCase(),
      String(displayName || "").trim(),
      String(firstName || "").trim(),
      String(lastName || "").trim(),
      role || "player",
      teamId || null,
      now, now,
    )
    .run();

  return id;
}

/** Set a user's password and mark them active. */
export async function activateD1User(db, userId, password) {
  const hash = await hashPassword(password);
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare("UPDATE users SET password_hash = ?, status = 'active', password_changed_at = ?, updated_at = ? WHERE id = ? AND status = 'invited'")
    .bind(hash, now, now, userId)
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

/**
 * Update a password for reset/change flows and atomically rotate every session
 * fence. Supplying `expectedPasswordHash` makes the change conditional on the
 * password that was actually verified, preventing concurrent last-writer-wins
 * updates. Returns the new opaque epoch, or null when the conditional update
 * lost its race. Database errors propagate so callers can fail closed.
 */
export async function updateD1Password(db, userId, password, expectedPasswordHash = null) {
  const hash = await hashPassword(password);
  const now = Math.floor(Date.now() / 1000);
  const sessionEpoch = crypto.randomUUID();
  const expectedHashClause = expectedPasswordHash ? " AND password_hash = ?" : "";
  const passwordUpdate = db
    .prepare(`UPDATE users
      SET password_hash = ?, password_changed_at = ?,
          failed_login_count = 0, lockout_until = NULL, updated_at = ?
      WHERE id = ?${expectedHashClause}`)
    .bind(hash, now, now, userId, ...(expectedPasswordHash ? [expectedPasswordHash] : []));
  // Both fences are guarded by the new hash, which exists only when the
  // conditional password UPDATE above succeeded. D1 executes batches in order
  // and rolls back the entire transaction on a statement error.
  const sessionState = db
    .prepare(`INSERT INTO account_session_state (user_id, invalid_before, updated_at)
      SELECT ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND password_hash = ?)
      ON CONFLICT(user_id) DO UPDATE SET
        invalid_before = excluded.invalid_before,
        updated_at = excluded.updated_at`)
    .bind(userId, now, now, userId, hash);
  const epochState = db
    .prepare(`INSERT INTO account_session_epochs (user_id, session_epoch, updated_at)
      SELECT ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND password_hash = ?)
      ON CONFLICT(user_id) DO UPDATE SET
        session_epoch = excluded.session_epoch,
        updated_at = excluded.updated_at`)
    .bind(userId, sessionEpoch, now, userId, hash);

  let passwordResult;
  let sessionStateResult;
  let epochStateResult;
  if (typeof db.batch === "function") {
    const results = requireSuccessfulD1Batch(
      await db.batch([passwordUpdate, sessionState, epochState]),
    );
    passwordResult = results?.[0];
    sessionStateResult = results?.[1];
    epochStateResult = results?.[2];
  } else {
    // Only compatibility test doubles lack `batch`; real D1 uses the atomic
    // path above. Keep the fallback conditional so its semantics stay safe.
    passwordResult = await passwordUpdate.run();
    if (Number(passwordResult?.meta?.changes || 0) !== 1) return null;
    sessionStateResult = await sessionState.run();
    epochStateResult = await epochState.run();
  }

  if (Number(passwordResult?.meta?.changes || 0) !== 1) return null;
  if (
    Number(sessionStateResult?.meta?.changes || 0) !== 1 ||
    Number(epochStateResult?.meta?.changes || 0) !== 1
  ) {
    throw new Error("D1 password/session transaction did not update every fence.");
  }
  return sessionEpoch;
}

// ── Verification tokens ───────────────────────────────────────────────────────

/**
 * Create a one-time verification token.
 * @returns {string} The raw token — include in the email link. Store only the hash.
 */
export async function createVerificationToken(db, userId, type, expiresInSeconds = 172_800 /* 48h */) {
  const rawToken = await generateSecureToken();
  const tokenHash = await hashToken(rawToken);
  const id = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const now = Math.floor(Date.now() / 1000);
  const revokeOutstanding = db
    .prepare("UPDATE verification_tokens SET used_at = ? WHERE user_id = ? AND type = ? AND used_at IS NULL")
    .bind(now, userId, type);
  const insert = db
    .prepare("INSERT INTO verification_tokens (id, user_id, type, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, userId, type, tokenHash, exp);
  // D1 batch is transactional: a newly issued invite/reset makes every prior
  // unused link of that type invalid before the replacement becomes visible.
  // The fallback exists only for the tiny in-memory test doubles used by this
  // repository; production D1 always takes the atomic branch.
  if (typeof db.batch === "function") await db.batch([revokeOutstanding, insert]);
  else {
    await revokeOutstanding.run();
    await insert.run();
  }
  return rawToken;
}

/**
 * Verify and consume a one-time token.
 * Returns the token record on success, null if invalid/expired/used.
 */
export async function verifyAndConsumeToken(db, rawToken, type) {
  const tokenHash = await hashToken(rawToken);
  const now = Math.floor(Date.now() / 1000);
  const record = await db
    .prepare("SELECT * FROM verification_tokens WHERE token_hash = ? AND type = ? AND expires_at > ? AND used_at IS NULL LIMIT 1")
    .bind(tokenHash, type, now)
    .first();
  if (!record) return null;

  // The initial read makes it possible to return the owning user, but this
  // conditional update is the authority. Two simultaneous requests can no
  // longer consume the same invitation/reset token.
  const result = await db
    .prepare("UPDATE verification_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?")
    .bind(now, record.id, now)
    .run();
  if (Number(result?.meta?.changes || 0) !== 1) return null;

  return record;
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validatePassword(password) {
  const p = String(password || "");
  if (p.length < 10) return "Password must be at least 10 characters.";
  if (p.length > 128) return "Password is too long.";
  return null; // valid
}

export function validateEmail(email) {
  const e = String(email || "").trim();
  if (!e || !e.includes("@") || e.length > 254) return "Valid email address required.";
  return null;
}
