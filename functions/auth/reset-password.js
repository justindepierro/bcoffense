/**
 * GET  /auth/reset-password  — render "Forgot password" form
 * POST /auth/reset-password  — look up user + send reset email
 *
 * Always shows success to prevent email enumeration.
 * Public route.
 */

import { PUBLIC_AUTH_BODY_MAX_BYTES, withSecurityHeaders } from "../_lib/auth.js";
import { findUserByEmail, createVerificationToken } from "../_lib/d1-auth.js";
import { sendEmail, resetEmailHtml, resetEmailText } from "../_lib/email.js";
import { readBoundedFormObject } from "../_lib/request-body.js";

// Password reset issuance is deliberately separate from sign-in rate limits.
// These scoped ledger keys protect email delivery without consuming a user's
// normal login budget.
const RESET_ISSUE_IP_WINDOW_SECONDS = 15 * 60;
const RESET_ISSUE_EMAIL_WINDOW_SECONDS = 60 * 60;
const RESET_ISSUE_MAX_IP = 10;
const RESET_ISSUE_MAX_EMAIL = 3;
const RESET_LEDGER_RETENTION_SECONDS = 24 * 60 * 60;
const RESET_DUPLICATE_FIELDS = ["email"];

function getClientIp(request) {
  return String(
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown",
  ).slice(0, 64);
}

function passwordResetIssueKeys(request, email) {
  return {
    ip: `password-reset:ip:${getClientIp(request)}`,
    email: `password-reset:email:${String(email).slice(0, 254)}`,
  };
}

async function prunePasswordResetIssueLedger(db, now) {
  try {
    // login_attempts is also the login throttle ledger, whose existing
    // retention policy is 24 hours. Keep reset reservations on that same
    // bounded horizon, including unknown-address requests.
    await db.prepare("DELETE FROM login_attempts WHERE attempted_at < ?")
      .bind(now - RESET_LEDGER_RETENTION_SECONDS)
      .run();
  } catch (_) {
    // Retention is best-effort. A successful reservation must remain valid
    // even if maintenance is temporarily unavailable.
  }
}

async function reservePasswordResetIssue(db, request, email) {
  const now = Math.floor(Date.now() / 1000);
  const keys = passwordResetIssueKeys(request, email);
  const id = crypto.randomUUID();

  try {
    // SQLite evaluates this INSERT as one write transaction. Reserving before
    // lookup/token creation closes the check-then-record race during a burst
    // of reset requests, including requests for accounts that do not exist.
    const result = await db.prepare(`INSERT INTO login_attempts (id, ip_addr, username, success, attempted_at)
      SELECT ?, ?, ?, 0, ?
      WHERE (SELECT COUNT(*) FROM login_attempts WHERE ip_addr = ? AND attempted_at > ?) < ?
        AND (SELECT COUNT(*) FROM login_attempts WHERE username = ? AND attempted_at > ?) < ?`)
      .bind(
        id,
        keys.ip,
        keys.email,
        now,
        keys.ip,
        now - RESET_ISSUE_IP_WINDOW_SECONDS,
        RESET_ISSUE_MAX_IP,
        keys.email,
        now - RESET_ISSUE_EMAIL_WINDOW_SECONDS,
        RESET_ISSUE_MAX_EMAIL,
      )
      .run();
    const available = Number(result?.meta?.changes || 0) === 1;
    if (available) await prunePasswordResetIssueLedger(db, now);
    return { available, id };
  } catch (_) {
    // Keep reset responses generic even when the durable quota ledger is down.
    return { available: false, unavailable: true };
  }
}

async function markPasswordResetIssueSuccess(db, id) {
  try {
    await db.prepare("UPDATE login_attempts SET success = 1 WHERE id = ?")
      .bind(id)
      .run();
  } catch (_) {
    // The token was already issued; audit annotation must not alter the safe
    // generic response or cause a second issuance attempt.
  }
}

function escHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderForm(opts = {}) {
  const err = opts.error ? `<p class="error">${escHtml(opts.error)}</p>` : "";
  const success = opts.success
    ? `<p class="success">If that email matches an account, a reset link is on its way.</p>`
    : "";
  return withSecurityHeaders(
    new Response(
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Reset Password — BCOffense</title>
  <style>
    :root{color-scheme:light dark}
    *{box-sizing:border-box}
    body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;
      background:linear-gradient(135deg,#0a122a 0%,#192a51 100%);color:#0a122a}
    form{width:min(100%,390px);display:grid;gap:14px;padding:28px;border-radius:14px;
      background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.28)}
    .brand{color:#9e8a60;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    h1{margin:0;font-size:26px;line-height:1.1}
    p{margin:-4px 0 4px;color:#64748b;font-size:14px;line-height:1.5}
    label{display:grid;gap:6px;color:#334155;font-size:13px;font-weight:700}
    input{width:100%;padding:12px 14px;border:2px solid #d0ccd0;border-radius:10px;font:inherit;color:#0a122a;background:#fff}
    input:focus{outline:none;border-color:#192a51;box-shadow:0 0 0 3px rgba(25,42,81,.18)}
    button{min-height:44px;border:0;border-radius:10px;background:#192a51;color:#fff;font:inherit;font-weight:800;cursor:pointer}
    .error{color:#c62828;font-size:13px;font-weight:800}
    .success{color:#166534;font-size:14px;font-weight:700;background:#dcfce7;padding:10px 14px;border-radius:8px}
    .back{text-align:center;font-size:13px;color:#64748b}
    .back a{color:#192a51}
  </style>
</head>
<body>
  <form method="post" action="/auth/reset-password" autocomplete="off">
    <div class="brand">BCOffense</div>
    <h1>Forgot Password?</h1>
    <p>Enter your email and we'll send a reset link.</p>
    <label>Email Address
      <input name="email" type="email" autocomplete="email" required>
    </label>
    ${err}${success}
    <button type="submit">Send Reset Link</button>
    <p class="back"><a href="/auth/login">Back to Login</a></p>
  </form>
</body>
</html>`,
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      },
    ),
  );
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "GET") return renderForm();

  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (!env.DB) return renderForm({ success: true }); // Fail silently

  let email = "";
  try {
    const body = await readBoundedFormObject(request, {
      maxBytes: PUBLIC_AUTH_BODY_MAX_BYTES,
      rejectDuplicateFields: RESET_DUPLICATE_FIELDS,
    });
    email = String(body.email || "").trim().toLowerCase();
  } catch (_) {
    return renderForm({ error: "Invalid submission." });
  }

  if (!email || !email.includes("@") || email.length > 254) {
    return renderForm({ error: "Valid email required." });
  }

  const reservation = await reservePasswordResetIssue(env.DB, request, email);
  if (!reservation.available) {
    // Quota exhaustion and ledger outages deliberately look exactly like an
    // unknown address: no token/email is issued and no account state leaks.
    return renderForm({ success: true });
  }

  // Look up — don't reveal existence
  const user = await findUserByEmail(env.DB, email).catch(() => null);
  if (user && user.status === "active" && user.password_hash) {
    try {
      const rawToken = await createVerificationToken(env.DB, user.id, "password_reset", 3_600 /* 1h */);
      await markPasswordResetIssueSuccess(env.DB, reservation.id);
      const origin = new URL(request.url).origin;
      const resetUrl = `${origin}/auth/reset-confirm?token=${encodeURIComponent(rawToken)}`;
      await sendEmail(env, {
        to: email,
        subject: "Reset your BCOffense password",
        html: resetEmailHtml(user.display_name, resetUrl),
        text: resetEmailText(user.display_name, resetUrl),
      });
    } catch (_) {
      // Never disclose reset delivery or storage failures to an unauthenticated
      // caller. A generic response avoids both enumeration and retry abuse.
      console.error("Password reset issuance failed.");
    }
  }

  // Always show success (prevents enumeration)
  return renderForm({ success: true });
}
