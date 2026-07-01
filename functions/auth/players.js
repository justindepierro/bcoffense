/**
 * GET  /auth/players  — list all D1 player accounts (coach/admin only)
 * POST /auth/players  — invite a new player (same as /auth/invite but via this endpoint)
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../_lib/auth.js";
import { createD1User, findUserByEmail, createVerificationToken, validateEmail } from "../_lib/d1-auth.js";
import { sendEmail, inviteEmailHtml, inviteEmailText } from "../_lib/email.js";

function requireCoach(session) {
  if (!session || (session.role !== "coach" && session.role !== "admin")) return false;
  return true;
}

export async function onRequest(context) {
  const { request, env } = context;
  const session = await getSessionFromRequest(request, env);

  if (!requireCoach(session)) {
    return authJson({ ok: false, error: "Coaches only." }, { status: 403 });
  }

  if (!env.DB) {
    return authJson({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  // ── GET — list players ─────────────────────────────────────────────────────
  if (request.method === "GET") {
    const rows = await env.DB
      .prepare(
        `SELECT id, email, display_name, first_name, last_name, role, status,
                created_at, last_login_at, password_changed_at
         FROM users
         WHERE role IN ('player','coach')
           AND status != 'archived'
         ORDER BY created_at DESC`,
      )
      .all();

    // Attach pending invite info (has an unused, non-expired token?)
    const now = Math.floor(Date.now() / 1000);
    const playerIds = (rows.results || []).map((u) => u.id);
    let pendingMap = {};
    if (playerIds.length) {
      const placeholders = playerIds.map(() => "?").join(",");
      const tokens = await env.DB
        .prepare(
          `SELECT user_id, MAX(expires_at) AS latest_exp
           FROM verification_tokens
           WHERE user_id IN (${placeholders})
             AND type = 'invitation'
             AND used_at IS NULL
             AND expires_at > ?
           GROUP BY user_id`,
        )
        .bind(...playerIds, now)
        .all();
      for (const t of tokens.results || []) {
        pendingMap[t.user_id] = true;
      }
    }

    const players = (rows.results || []).map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      firstName: u.first_name,
      lastName: u.last_name,
      role: u.role,
      status: u.status,
      hasPendingInvite: !!pendingMap[u.id],
      lastLoginAt: u.last_login_at,
      createdAt: u.created_at,
    }));

    return withSecurityHeaders(authJson({ ok: true, players }));
  }

  // ── POST — invite new player ───────────────────────────────────────────────
  if (request.method === "POST") {
    let body = {};
    try {
      const ct = request.headers.get("Content-Type") || "";
      body = ct.includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
    } catch (_) {
      return authJson({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    const email = String(body.email || "").trim().toLowerCase();
    const displayName = String(body.displayName || body.display_name || "").trim();
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();

    const emailErr = validateEmail(email);
    if (emailErr) return authJson({ ok: false, error: emailErr }, { status: 422 });
    if (!displayName) return authJson({ ok: false, error: "Display name required." }, { status: 422 });

    const existing = await findUserByEmail(env.DB, email);
    if (existing) {
      return authJson({ ok: false, error: "An account with this email already exists." }, { status: 409 });
    }

    let userId;
    try {
      userId = await createD1User(env.DB, { email, displayName, firstName, lastName, role: "player" });
    } catch (err) {
      console.error("[players] create error:", err);
      return authJson({ ok: false, error: "Failed to create account." }, { status: 500 });
    }

    const rawToken = await createVerificationToken(env.DB, userId, "invitation", 172_800);
    const origin = new URL(request.url).origin;
    const inviteUrl = `${origin}/auth/accept-invite?token=${encodeURIComponent(rawToken)}`;

    const emailResult = await sendEmail(env, {
      to: email,
      subject: "You're invited to BCOffense 🏈",
      html: inviteEmailHtml(displayName, inviteUrl),
      text: inviteEmailText(displayName, inviteUrl),
    });

    return withSecurityHeaders(
      authJson({
        ok: true,
        userId,
        inviteSent: emailResult.ok,
        inviteUrl: emailResult.skipped ? inviteUrl : undefined,
      }),
    );
  }

  return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });
}
