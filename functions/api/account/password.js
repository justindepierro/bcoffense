/**
 * POST /api/account/password — change the current named-account password.
 *
 * Body (JSON): { currentPassword, newPassword }
 * Requires: active D1-backed session
 */

import { getSessionFromRequest, authJson, withSecurityHeaders, createSessionCookie } from "../../_lib/auth.js";
import { changeD1Password } from "../../_lib/d1-auth.js";

// Password verification has the same brute-force characteristics as sign-in,
// but it must not consume the normal login quota. Store scoped values in the
// existing durable login_attempts ledger instead of adding a second, parallel
// rate-limit store.
const PASSWORD_VERIFY_WINDOW_SECONDS = 15 * 60;
const PASSWORD_VERIFY_MAX_IP = 20;
const PASSWORD_VERIFY_MAX_ACCOUNT = 5;
const MAX_PASSWORD_LENGTH = 128;
// Two 128-character passwords can occupy more than 1 KiB in UTF-8; keep the
// transport cap comfortably above valid input while still bounding parsing.
const MAX_REQUEST_BYTES = 2048;

function getClientIp(request) {
  return String(
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown",
  ).slice(0, 64);
}

function passwordAttemptKeys(request, userId) {
  return {
    ip: `account-password:ip:${getClientIp(request)}`,
    account: `account-password:user:${String(userId).slice(0, 128)}`,
  };
}

async function readBoundedJsonObject(request) {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return { error: "Request body is too large." };
  }

  if (!request.body) return { error: "Invalid request body." };

  const reader = request.body.getReader();
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return { error: "Request body is too large." };
      }
      chunks.push(value);
    }
  } catch (_) {
    return { error: "Invalid request body." };
  }

  try {
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { error: "Invalid request body." };
    }
    return { body };
  } catch (_) {
    return { error: "Invalid request body." };
  }
}

async function reservePasswordVerification(db, request, userId) {
  const now = Math.floor(Date.now() / 1000);
  const since = now - PASSWORD_VERIFY_WINDOW_SECONDS;
  const keys = passwordAttemptKeys(request, userId);
  const id = crypto.randomUUID();

  try {
    // SQLite evaluates this INSERT as one write transaction. Reserving before
    // PBKDF2 closes the check-then-record race that would otherwise let a
    // burst of concurrent wrong-password requests bypass the cap.
    const result = await db.prepare(`INSERT INTO login_attempts (id, ip_addr, username, success, attempted_at)
      SELECT ?, ?, ?, 0, ?
      WHERE (SELECT COUNT(*) FROM login_attempts WHERE ip_addr = ? AND attempted_at > ?) < ?
        AND (SELECT COUNT(*) FROM login_attempts WHERE username = ? AND attempted_at > ?) < ?`)
      .bind(
        id,
        keys.ip,
        keys.account,
        now,
        keys.ip,
        since,
        PASSWORD_VERIFY_MAX_IP,
        keys.account,
        since,
        PASSWORD_VERIFY_MAX_ACCOUNT,
      )
      .run();
    return { available: Number(result?.meta?.changes || 0) === 1, id };
  } catch (_) {
    return { available: false, unavailable: true };
  }
}

async function markPasswordVerificationSuccess(db, id) {
  try {
    await db.prepare("UPDATE login_attempts SET success = 1 WHERE id = ?")
      .bind(id)
      .run();
  } catch (_) {
    // The verified password update has already committed; do not misreport it
    // as failed because a best-effort audit annotation was unavailable.
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) {
    return withSecurityHeaders(authJson({ ok: false, error: "Authentication required." }, { status: 401 }));
  }
  if (!session.d1UserId) {
    return withSecurityHeaders(authJson({ ok: false, error: "Password change is only available for personal accounts." }, { status: 403 }));
  }

  const parsed = await readBoundedJsonObject(request);
  if (parsed.error) {
    return withSecurityHeaders(authJson({ ok: false, error: parsed.error }, { status: 400 }));
  }
  const { body } = parsed;

  // Passwords are opaque credential values. Unlike identifiers, do not trim
  // them: a leading or trailing space must be verified exactly as entered.
  const { currentPassword, newPassword } = body;

  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return withSecurityHeaders(authJson({ ok: false, error: "Passwords must be text values." }, { status: 400 }));
  }
  if (!currentPassword || !newPassword) {
    return withSecurityHeaders(authJson({ ok: false, error: "Both current and new passwords are required." }, { status: 400 }));
  }
  if (currentPassword.length > MAX_PASSWORD_LENGTH || newPassword.length > MAX_PASSWORD_LENGTH) {
    return withSecurityHeaders(authJson({ ok: false, error: "Passwords must be at most 128 characters." }, { status: 400 }));
  }
  if (currentPassword === newPassword) {
    return withSecurityHeaders(authJson({ ok: false, error: "New password must be different from current password." }, { status: 400 }));
  }

  if (!env.DB) {
    return withSecurityHeaders(authJson({ ok: false, error: "Database unavailable." }, { status: 503 }));
  }

  const reservation = await reservePasswordVerification(env.DB, request, session.d1UserId);
  if (reservation.unavailable) {
    return withSecurityHeaders(authJson({ ok: false, error: "Password verification is temporarily unavailable. Please try again shortly." }, { status: 503 }));
  }
  if (!reservation.available) {
    return withSecurityHeaders(authJson(
      { ok: false, error: "Too many password verification attempts. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(PASSWORD_VERIFY_WINDOW_SECONDS) } },
    ));
  }

  let result;
  try {
    result = await changeD1Password(env.DB, session.d1UserId, currentPassword, newPassword);
  } catch (_) {
    return withSecurityHeaders(authJson({ ok: false, error: "Password service is temporarily unavailable. Please try again shortly." }, { status: 503 }));
  }
  if (!result?.ok || typeof result.sessionEpoch !== "string" || !result.sessionEpoch) {
    const reportedError = result?.error;
    const error = reportedError || "Password service is temporarily unavailable. Please try again shortly.";
    const status = !reportedError ? 503 : (error === "Password changed in another session." ? 409 : 400);
    return withSecurityHeaders(authJson({ ok: false, error }, { status }));
  }

  await markPasswordVerificationSuccess(env.DB, reservation.id);

  // The committed epoch rejects every older named-account cookie, including
  // cookies minted in the same second. Re-issue this caller with that exact
  // fresh epoch so it stays signed in while other sessions are evicted.
  const cookie = await createSessionCookie(
    {
      username: session.username,
      role: session.role,
      label: session.label,
      d1: true,
      d1_user_id: session.d1UserId,
      session_epoch: result.sessionEpoch,
    },
    env,
  );

  return withSecurityHeaders(
    authJson(
      { ok: true, message: "Password updated successfully." },
      { headers: { "Set-Cookie": cookie } },
    ),
  );
}
