/**
 * GET  /auth/reset-password  — render "Forgot password" form
 * POST /auth/reset-password  — look up user + send reset email
 *
 * Always shows success to prevent email enumeration.
 * Public route.
 */

import { withSecurityHeaders } from "../_lib/auth.js";
import { findUserByEmail, createVerificationToken } from "../_lib/d1-auth.js";
import { sendEmail, resetEmailHtml, resetEmailText } from "../_lib/email.js";

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
    const fd = await request.formData();
    email = String(fd.get("email") || "").trim().toLowerCase();
  } catch (_) {
    return renderForm({ error: "Invalid submission." });
  }

  if (!email || !email.includes("@")) return renderForm({ error: "Valid email required." });

  // Look up — don't reveal existence
  const user = await findUserByEmail(env.DB, email).catch(() => null);
  if (user && user.status === "active" && user.password_hash) {
    const rawToken = await createVerificationToken(env.DB, user.id, "password_reset", 3_600 /* 1h */);
    const origin = new URL(request.url).origin;
    const resetUrl = `${origin}/auth/reset-confirm?token=${encodeURIComponent(rawToken)}`;
    await sendEmail(env, {
      to: email,
      subject: "Reset your BCOffense password",
      html: resetEmailHtml(user.display_name, resetUrl),
      text: resetEmailText(user.display_name, resetUrl),
    });
  }

  // Always show success (prevents enumeration)
  return renderForm({ success: true });
}
