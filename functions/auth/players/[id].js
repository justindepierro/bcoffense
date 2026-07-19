/**
 * POST /auth/players/:id
 * Per-player account actions for coaches/admins.
 *
 * Body: { action: "resend" | "copy-link" | "disable" | "enable" }
 *
 * resend      → new 48h invite token + send email → { ok, inviteSent }
 * copy-link   → new 48h invite token, no email   → { ok, inviteUrl }
 * disable     → status = 'disabled'              → { ok }
 * enable      → status = 'active' (if has password) → { ok }
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { findUserById, createVerificationToken, setD1SessionInvalidBefore } from "../../_lib/d1-auth.js";
import { sendEmail, inviteEmailHtml, inviteEmailText } from "../../_lib/email.js";

export async function onRequest(context) {
  const { request, env, params } = context;
  const session = await getSessionFromRequest(request, env);

  if (!session || (session.role !== "coach" && session.role !== "admin")) {
    return authJson({ ok: false, error: "Coaches only." }, { status: 403 });
  }

  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });
  if (!session.teamId) return authJson({ ok: false, error: "Team access is not configured for this coach account." }, { status: 503 });
  if (request.method !== "POST") return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });

  const userId = String(params.id || "").trim();
  if (!userId) return authJson({ ok: false, error: "User ID required." }, { status: 400 });

  let body = {};
  try {
    const ct = request.headers.get("Content-Type") || "";
    body = ct.includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
  } catch (_) {
    return authJson({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const action = String(body.action || "").trim();
  if (!["resend", "copy-link", "disable", "enable"].includes(action)) {
    return authJson({ ok: false, error: "Unknown action." }, { status: 400 });
  }

  const user = await findUserById(env.DB, userId);
  if (!user) return authJson({ ok: false, error: "User not found." }, { status: 404 });
  if (String(user.team_id || "") !== String(session.teamId)) {
    return authJson({ ok: false, error: "User not found." }, { status: 404 });
  }

  const now = Math.floor(Date.now() / 1000);

  // ── disable ────────────────────────────────────────────────────────────────
  if (action === "disable") {
    await env.DB
      .prepare("UPDATE users SET status = 'disabled', disabled_at = ?, updated_at = ? WHERE id = ?")
      // The cookie validator uses a strict less-than comparison, so +1 makes
      // a same-second existing cookie invalid while the account is disabled.
      .bind(now, now, userId)
      .run();
    await setD1SessionInvalidBefore(env.DB, userId, now + 1);
    return withSecurityHeaders(authJson({ ok: true, status: "disabled" }));
  }

  // ── enable ─────────────────────────────────────────────────────────────────
  if (action === "enable") {
    // Can only enable if the user has set a password (i.e., was active before)
    if (!user.password_hash) {
      return authJson({ ok: false, error: "Player has not completed account setup yet." }, { status: 409 });
    }
    await env.DB
      .prepare("UPDATE users SET status = 'active', disabled_at = NULL, updated_at = ? WHERE id = ?")
      .bind(now, userId)
      .run();
    await setD1SessionInvalidBefore(env.DB, userId, now + 1);
    return withSecurityHeaders(authJson({ ok: true, status: "active" }));
  }

  // ── resend / copy-link — both generate a fresh invite token ───────────────
  if (action === "resend" || action === "copy-link") {
    if (user.status === "active" && user.password_hash) {
      // Already activated — resend is meaningless; coach should use password reset
      if (action === "resend") {
        return authJson(
          { ok: false, error: "Player has already activated their account. Use password reset instead." },
          { status: 409 },
        );
      }
    }

    // Ensure user is in invited state for copy-link
    if (user.status !== "invited" && user.status !== "disabled") {
      if (action === "copy-link") {
        return authJson({ ok: false, error: "Account is already active." }, { status: 409 });
      }
    }

    const rawToken = await createVerificationToken(env.DB, userId, "invitation", 172_800);
    const origin = new URL(request.url).origin;
    const inviteUrl = `${origin}/auth/accept-invite?token=${encodeURIComponent(rawToken)}`;

    if (action === "copy-link") {
      return withSecurityHeaders(authJson({ ok: true, inviteUrl }));
    }

    // resend — send email
    const emailResult = await sendEmail(env, {
      to: user.email,
      subject: "You're invited to BCOffense 🏈",
      html: inviteEmailHtml(user.display_name, inviteUrl),
      text: inviteEmailText(user.display_name, inviteUrl),
    });

    return withSecurityHeaders(
      authJson({
        ok: true,
        inviteSent: emailResult.ok,
        inviteUrl: emailResult.skipped ? inviteUrl : undefined,
      }),
    );
  }
}
