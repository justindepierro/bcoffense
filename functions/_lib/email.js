/**
 * Resend email adapter — no npm required, pure fetch().
 *
 * Secrets required in Cloudflare:
 *   RESEND_API_KEY   — from resend.com (free tier: 3,000/mo, 100/day)
 *   EMAIL_FROM       — verified sender address, e.g. "BCOffense <noreply@yourdomain.com>"
 *
 * If RESEND_API_KEY is not set, emails are logged to console and skipped.
 * This means the invite/reset flow works in development without email.
 */

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Send a transactional email via Resend.
 * @param {object} env - Cloudflare env bindings
 * @param {{ to: string, subject: string, html: string, text: string }} opts
 */
export async function sendEmail(env, { to, subject, html, text }) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY not set — skipping email to ${to}: ${subject}`);
    return { ok: false, skipped: true };
  }

  const from = env.EMAIL_FROM || "BCOffense <noreply@bcoffense.com>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[email] Resend error ${res.status}:`, body);
    return { ok: false, status: res.status };
  }

  return { ok: true };
}

// ── Email templates ───────────────────────────────────────────────────────────

export function inviteEmailHtml(displayName, inviteUrl) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:Inter,sans-serif;background:#f8fafc;margin:0;padding:40px 16px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="color:#9e8a60;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">BCOffense</div>
    <h1 style="margin:0 0 12px;font-size:24px;color:#0a122a">You're on the team 🏈</h1>
    <p style="color:#475569;line-height:1.6">Hey ${esc(displayName)}, your coach has added you to BCOffense — your team's digital playbook and practice management app.</p>
    <p style="color:#475569;line-height:1.6">Click below to set your password and get access:</p>
    <a href="${esc(inviteUrl)}" style="display:inline-block;background:#192a51;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:800;margin:8px 0">Accept Invitation &amp; Set Password</a>
    <p style="color:#94a3b8;font-size:13px;margin-top:24px">This link expires in 48 hours. If you didn't expect this, ignore it.</p>
  </div>
</body></html>`;
}

export function inviteEmailText(displayName, inviteUrl) {
  return `Hey ${displayName},\n\nYour coach has added you to BCOffense.\n\nAccept your invitation and set a password here:\n${inviteUrl}\n\nThis link expires in 48 hours.`;
}

export function resetEmailHtml(displayName, resetUrl) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:Inter,sans-serif;background:#f8fafc;margin:0;padding:40px 16px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="color:#9e8a60;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">BCOffense</div>
    <h1 style="margin:0 0 12px;font-size:24px;color:#0a122a">Password Reset</h1>
    <p style="color:#475569;line-height:1.6">Hey ${esc(displayName)}, we got a request to reset your BCOffense password.</p>
    <a href="${esc(resetUrl)}" style="display:inline-block;background:#192a51;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:800;margin:8px 0">Reset My Password</a>
    <p style="color:#94a3b8;font-size:13px;margin-top:24px">This link expires in 1 hour. If you didn't request this, ignore it — your password won't change.</p>
  </div>
</body></html>`;
}

export function resetEmailText(displayName, resetUrl) {
  return `Hey ${displayName},\n\nReset your BCOffense password here:\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore it.`;
}
