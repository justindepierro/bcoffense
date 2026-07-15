/**
 * GET  /auth/reset-confirm?token=xxx  — render "Set new password" form
 * POST /auth/reset-confirm             — verify token + update password
 *
 * Public route.
 */

import { withSecurityHeaders } from "../_lib/auth.js";
import { verifyAndConsumeToken, updateD1Password, validatePassword } from "../_lib/d1-auth.js";

function escHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function errorPage(message) {
  return withSecurityHeaders(
    new Response(
      `<!doctype html><html><body style="font-family:sans-serif;max-width:400px;margin:80px auto;padding:24px;text-align:center">
        <h2>🔗 Link Problem</h2><p>${escHtml(message)}</p>
        <a href="/auth/reset-password" style="color:#192a51">Request a new link</a>
      </body></html>`,
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    ),
  );
}

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
  <title>Set New Password — BCOffense</title>
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
    .hint{color:#64748b;font-size:12px}
  </style>
</head>
<body>
  <form method="post" action="/auth/reset-confirm" autocomplete="off">
    <div class="brand">BCOffense</div>
    <h1>Set New Password</h1>
    <p>Choose a new password for your account.</p>
    <input type="hidden" name="token" value="${token}">
    <label>New Password
      <input name="password" type="password" autocomplete="new-password" required minlength="10">
    </label>
    <label>Confirm Password
      <input name="confirmPassword" type="password" autocomplete="new-password" required minlength="10">
    </label>
    <p class="hint">Minimum 10 characters.</p>
    ${err}
    <button type="submit">Update Password</button>
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

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (!env.DB) return errorPage("Database not configured.");

  // ── GET — render form ──────────────────────────────────────────────────────
  if (request.method === "GET") {
    const token = url.searchParams.get("token") || "";
    if (!token) return errorPage("Missing reset token.");
    return renderForm({ token });
  }

  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // ── POST — update password ────────────────────────────────────────────────
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

  if (!rawToken) return renderForm({ error: "Reset token missing." });
  if (password !== confirm) return renderForm({ token: rawToken, error: "Passwords do not match." });

  const pwErr = validatePassword(password);
  if (pwErr) return renderForm({ token: rawToken, error: pwErr });

  const tokenRecord = await verifyAndConsumeToken(env.DB, rawToken, "password_reset");
  if (!tokenRecord) {
    return errorPage("This reset link has expired or already been used. Request a new one.");
  }

  await updateD1Password(env.DB, tokenRecord.user_id, password);

  return withSecurityHeaders(
    new Response(null, {
      status: 302,
      headers: { Location: "/auth/login?message=Password+updated", "Cache-Control": "no-store" },
    }),
  );
}
