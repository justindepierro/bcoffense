/**
 * POST /auth/invite
 * Coach or admin creates a player account invitation.
 *
 * Body (JSON or form): { email, displayName, firstName?, lastName?, jerseyNumber?, position? }
 *
 * Returns JSON: { ok: true, userId, inviteSent: true } or { ok: false, error }
 *
 * Protected: requires coach or admin session (middleware enforces auth;
 * this handler additionally enforces role).
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../_lib/auth.js";
import { createD1User, createVerificationToken, findUserByEmail, validateEmail } from "../_lib/d1-auth.js";
import { sendEmail, inviteEmailHtml, inviteEmailText } from "../_lib/email.js";

export async function onRequest(context) {
  const { request, env } = context;

  // Only POST
  if (request.method !== "POST") {
    return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });
  }

  // Role check — must be coach or admin
  const session = await getSessionFromRequest(request, env);
  if (!session || (session.role !== "coach" && session.role !== "admin")) {
    return authJson({ ok: false, error: "Coaches only." }, { status: 403 });
  }

  if (!env.DB) {
    return authJson({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  // Invitations are a team-scoped write. Do not create an unassigned player
  // account if this staff session cannot be resolved to a current team.
  const teamId = String(session.teamId || "").trim();
  if (!teamId) {
    return authJson({ ok: false, error: "Team access is not configured for this coach account." }, { status: 503 });
  }

  // Parse body
  let body = {};
  try {
    const ct = request.headers.get("Content-Type") || "";
    if (ct.includes("application/json")) {
      body = await request.json();
    } else {
      const fd = await request.formData();
      body = Object.fromEntries(fd.entries());
    }
  } catch (_) {
    return authJson({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const displayName = String(body.displayName || body.display_name || "").trim();
  const firstName = String(body.firstName || body.first_name || "").trim();
  const lastName = String(body.lastName || body.last_name || "").trim();

  // Validate
  const emailErr = validateEmail(email);
  if (emailErr) return authJson({ ok: false, error: emailErr }, { status: 422 });
  if (!displayName) return authJson({ ok: false, error: "Display name required." }, { status: 422 });

  // Check for existing account
  const existing = await findUserByEmail(env.DB, email);
  if (existing) {
    return authJson({ ok: false, error: "An account with this email already exists." }, { status: 409 });
  }

  // Create user in D1
  let userId;
  try {
    userId = await createD1User(env.DB, {
      email,
      displayName,
      firstName,
      lastName,
      role: "player",
      teamId,
    });
  } catch (err) {
    console.error("[invite] D1 createD1User error:", err);
    return authJson({ ok: false, error: "Failed to create account." }, { status: 500 });
  }

  // Generate invitation token (48h)
  const rawToken = await createVerificationToken(env.DB, userId, "invitation", 172_800);

  // Build invite URL
  const origin = new URL(request.url).origin;
  const inviteUrl = `${origin}/auth/accept-invite?token=${encodeURIComponent(rawToken)}`;

  // Send invitation email (non-fatal if not configured)
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
      // In dev (no email key), return the link so coach can share it manually
      inviteUrl: emailResult.skipped ? inviteUrl : undefined,
    }),
  );
}
