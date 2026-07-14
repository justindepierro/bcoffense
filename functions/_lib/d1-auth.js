/**
 * D1 player account helpers — Slice 1 (OMG Phase 5)
 *
 * Password hashing: PBKDF2 via Web Crypto — no npm required.
 * Token hashing: SHA-256 — raw token sent by email only, hash stored in D1.
 */

const PBKDF2_ITERATIONS = 100_000;

// ── Lockout policy ───────────────────────────────────────────────────────────
const LOCKOUT_MAX_ATTEMPTS = 5;          // failed logins before lockout
const LOCKOUT_DURATION_SECONDS = 15 * 60; // 15-minute cooldown

function enc() { return new TextEncoder(); }

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
    .prepare("SELECT * FROM users WHERE LOWER(email) = ? AND status != 'archived' LIMIT 1")
    .bind(clean)
    .first() || null;
}

export async function findUserById(db, id) {
  return db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").bind(id).first() || null;
}

/**
 * Verify D1 player credentials.
 * Returns a session user object on success, null on failure,
 * or { locked: true, until: <unix> } when the account is locked out.
 */
export async function verifyD1Credentials(email, password, db) {
  const user = await findUserByEmail(db, email);
  if (!user) return null;
  if (user.status === "invited" || user.status === "disabled") return null;
  if (!user.password_hash) return null;

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

  return {
    d1_user_id: user.id,
    username: user.email.toLowerCase(),
    role: user.role,
    label: user.display_name,
    d1: true,
    iat: now,
  };
}

/**
 * Change a D1 player's password after verifying the current one.
 * Returns null on success, or an error string on failure.
 */
export async function changeD1Password(db, userId, currentPassword, newPassword) {
  const user = await findUserById(db, userId);
  if (!user || !user.password_hash) return "Account not found.";

  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) return "Current password is incorrect.";

  const err = validatePassword(newPassword);
  if (err) return err;

  await updateD1Password(db, userId, newPassword);
  return null;
}

/**
 * Invalidate all existing sessions for a user by updating sessions_invalid_before.
 * Any cookie issued before this timestamp will be rejected at API endpoints.
 */
export async function invalidateAllD1Sessions(db, userId) {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare("UPDATE users SET sessions_invalid_before = ?, updated_at = ? WHERE id = ?")
    .bind(now, now, userId)
    .run();
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
  await db
    .prepare("UPDATE users SET password_hash = ?, status = 'active', password_changed_at = ?, updated_at = ? WHERE id = ?")
    .bind(hash, now, now, userId)
    .run();
}

/**
 * Update password only (for reset + change flows).
 * Bumps sessions_invalid_before so every session issued before now is rejected
 * at the API boundary — a password change/reset must evict existing sessions
 * (e.g. an attacker's live cookie after a compromise). The current user should
 * be re-issued a fresh cookie by the caller if they must stay signed in.
 */
export async function updateD1Password(db, userId, password) {
  const hash = await hashPassword(password);
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare("UPDATE users SET password_hash = ?, password_changed_at = ?, sessions_invalid_before = ?, updated_at = ? WHERE id = ?")
    .bind(hash, now, now, now, userId)
    .run();
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
  await db
    .prepare("INSERT INTO verification_tokens (id, user_id, type, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, userId, type, tokenHash, exp)
    .run();
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

  await db
    .prepare("UPDATE verification_tokens SET used_at = ? WHERE id = ?")
    .bind(now, record.id)
    .run();

  return record;
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validatePassword(password) {
  const p = String(password || "");
  if (p.length < 8) return "Password must be at least 8 characters.";
  if (p.length > 128) return "Password is too long.";
  return null; // valid
}

export function validateEmail(email) {
  const e = String(email || "").trim();
  if (!e || !e.includes("@") || e.length > 254) return "Valid email address required.";
  return null;
}
