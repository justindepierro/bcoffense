/**
 * GET  /auth/accept-invite?token=xxx  — render set-password form
 * POST /auth/accept-invite            — verify token + activate account + create session
 *
 * Public route (no existing session required — token is the auth).
 */

import {
  createSessionCookie,
  withSecurityHeaders,
} from "../_lib/auth.js";
import {
  verifyAndConsumeToken,
  findUserById,
  activateD1User,
  validatePassword,
} from "../_lib/d1-auth.js";

function renderForm(opts = {}) {
  const err = opts.error ? `<p class="error">${escHtml(opts.error)}</p>` : "";
  const token = escHtml(opts.token || "");
  return withSecurityHeaders(
    new Response(
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Set Password — BCOffense</title>
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
    .error{color:#c62828;font-size:13px;font-weight:800;min-height:20px}
    .hint{color:#64748b;font-size:12px}
  </style>
</head>
<body>
  <form method="post" action="/auth/accept-invite" autocomplete="off">
    <div class="brand">BCOffense</div>
    <h1>Set Your Password</h1>
    <p>Welcome to the team! Choose a password to activate your account.</p>
    <input type="hidden" name="token" value="${token}">
    <label>New Password
      <input name="password" type="password" autocomplete="new-password" required minlength="8">
    </label>
    <label>Confirm Password
      <input name="confirmPassword" type="password" autocomplete="new-password" required minlength="8">
    </label>
    <p class="hint">Minimum 8 characters.</p>
    ${err}
    <button type="submit">Activate Account</button>
  </form>
</body>
</html>`,
      {
        status: opts.status || 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      },
    ),
  );
}

function escHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function errorPage(message) {
  return withSecurityHeaders(
    new Response(
      `<!doctype html><html><body style="font-family:sans-serif;max-width:400px;margin:80px auto;padding:24px;text-align:center">
        <h2>🔗 Link Problem</h2><p>${escHtml(message)}</p>
        <a href="/auth/login" style="color:#192a51">Back to Login</a>
      </body></html>`,
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    ),
  );
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (!env.DB) return errorPage("Database not configured.");

  // ── GET — render form ──────────────────────────────────────────────────────
  if (request.method === "GET") {
    const token = url.searchParams.get("token") || "";
    if (!token) return errorPage("Missing invitation token.");
    return renderForm({ token });
  }

  // ── POST — activate account ────────────────────────────────────────────────
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body = {};
  try {
    const fd = await request.formData();
    body = Object.fromEntries(fd.entries());
  } catch (_) {
    return errorPage("Invalid form submission.");
  }

  const rawToken = String(body.token || "").trim();
  const password = String(body.password || "");
  const confirm = String(body.confirmPassword || "");

  if (!rawToken) return renderForm({ error: "Invitation token missing." });
  if (password !== confirm) return renderForm({ token: rawToken, error: "Passwords do not match." });

  const pwErr = validatePassword(password);
  if (pwErr) return renderForm({ token: rawToken, error: pwErr });

  // Verify token
  const tokenRecord = await verifyAndConsumeToken(env.DB, rawToken, "invitation");
  if (!tokenRecord) {
    return errorPage("This invitation link has expired or already been used. Ask your coach to resend.");
  }

  // Activate the user
  await activateD1User(env.DB, tokenRecord.user_id, password);

  // Load user for session
  const user = await findUserById(env.DB, tokenRecord.user_id);
  if (!user) return errorPage("Account not found. Please contact your coach.");

  const sessionUser = {
    d1_user_id: user.id,
    username: user.email.toLowerCase(),
    role: user.role,
    label: user.display_name,
    d1: true,
  };

  const cookie = await createSessionCookie(sessionUser, env);

  return withSecurityHeaders(
    new Response(null, {
      status: 302,
      headers: { Location: "/", "Set-Cookie": cookie, "Cache-Control": "no-store" },
    }),
  );
}
