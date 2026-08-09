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
import { RequestBodyError, readBoundedJsonOrFormObject } from "../_lib/request-body.js";

const MAX_INVITE_REQUEST_BYTES = 8 * 1024;

function textField(body, fieldNames, label) {
  for (const fieldName of fieldNames) {
    const value = body[fieldName];
    // Keep the legacy camelCase-first fallback behavior, but never coerce a
    // JSON object or array into an account identity string.
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string") return { error: `${label} must be text.` };
    return { value: value.trim() };
  }
  return { value: "" };
}

function inviteBodyError(error) {
  if (error instanceof RequestBodyError && error.status === 413) {
    return authJson({ ok: false, error: "Request body is too large." }, { status: 413 });
  }
  return authJson({ ok: false, error: "Invalid request body." }, { status: 400 });
}

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

  // Parse only a bounded, text-only JSON or form object before reading any
  // account fields. These staff writes must not buffer attacker-sized bodies.
  let body;
  try {
    body = await readBoundedJsonOrFormObject(request, { maxBytes: MAX_INVITE_REQUEST_BYTES });
  } catch (error) {
    return inviteBodyError(error);
  }

  const emailField = textField(body, ["email"], "Email");
  const displayNameField = textField(body, ["displayName", "display_name"], "Display name");
  const firstNameField = textField(body, ["firstName", "first_name"], "First name");
  const lastNameField = textField(body, ["lastName", "last_name"], "Last name");
  const invalidField = [emailField, displayNameField, firstNameField, lastNameField].find((field) => field.error);
  if (invalidField?.error) return authJson({ ok: false, error: invalidField.error }, { status: 422 });

  const email = emailField.value.toLowerCase();
  const displayName = displayNameField.value;
  const firstName = firstNameField.value;
  const lastName = lastNameField.value;

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
