/**
 * GET  /auth/players  — list all D1 player accounts (coach/admin only)
 * POST /auth/players  — invite a new player (same as /auth/invite but via this endpoint)
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../_lib/auth.js";
import { createD1User, findUserByEmail, createVerificationToken, validateEmail } from "../_lib/d1-auth.js";
import { sendEmail, inviteEmailHtml, inviteEmailText } from "../_lib/email.js";
import { DEFAULT_MANAGED_COACH_PERMISSIONS, hasCoachPermission, parseCoachPermissions } from "../_lib/staff-access.js";
import { RequestBodyError, readBoundedJsonOrFormObject } from "../_lib/request-body.js";

const MAX_PLAYER_CREATE_REQUEST_BYTES = 8 * 1024;

function textField(body, fieldNames, label) {
  for (const fieldName of fieldNames) {
    const value = body[fieldName];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string") return { error: `${label} must be text.` };
    return { value: value.trim() };
  }
  return { value: "" };
}

function playerCreateBodyError(error) {
  if (error instanceof RequestBodyError && error.status === 413) {
    return authJson({ ok: false, error: "Request body is too large." }, { status: 413 });
  }
  return authJson({ ok: false, error: "Invalid request body." }, { status: 400 });
}

function requireCoach(session) {
  if (!session || (session.role !== "coach" && session.role !== "admin")) return false;
  return session.role === "admin" || hasCoachPermission(session, "feature:manage_players");
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
  if (!session.teamId) {
    return authJson({ ok: false, error: "Team access is not configured for this coach account." }, { status: 503 });
  }

  // ── GET — list players ─────────────────────────────────────────────────────
  if (request.method === "GET") {
    const rows = await env.DB
      .prepare(
        `SELECT users.id, users.email, users.display_name, users.first_name, users.last_name, users.role, users.status,
                created_at, last_login_at, password_changed_at
                , staff_access.permissions_json
         FROM users
         LEFT JOIN staff_access ON staff_access.user_id = users.id AND staff_access.team_id = users.team_id
         WHERE users.team_id = ?
           AND users.role IN ('player','coach')
           AND users.status != 'archived'
         ORDER BY created_at DESC`,
      )
      .bind(session.teamId)
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
      permissions: u.role === "coach" ? parseCoachPermissions(u.permissions_json) : [],
      hasPendingInvite: !!pendingMap[u.id],
      lastLoginAt: u.last_login_at,
      createdAt: u.created_at,
    }));

    return withSecurityHeaders(authJson({ ok: true, players }));
  }

  // ── POST — invite new player ───────────────────────────────────────────────
  if (request.method === "POST") {
    let body;
    try {
      body = await readBoundedJsonOrFormObject(request, { maxBytes: MAX_PLAYER_CREATE_REQUEST_BYTES });
    } catch (error) {
      return playerCreateBodyError(error);
    }

    const emailField = textField(body, ["email"], "Email");
    const displayNameField = textField(body, ["displayName", "display_name"], "Display name");
    const firstNameField = textField(body, ["firstName"], "First name");
    const lastNameField = textField(body, ["lastName"], "Last name");
    const roleField = textField(body, ["role"], "Role");
    const invalidField = [emailField, displayNameField, firstNameField, lastNameField, roleField].find((field) => field.error);
    if (invalidField?.error) return authJson({ ok: false, error: invalidField.error }, { status: 422 });

    const email = emailField.value.toLowerCase();
    const displayName = displayNameField.value;
    const firstName = firstNameField.value;
    const lastName = lastNameField.value;
    const requestedRole = roleField.value.toLowerCase() === "coach" ? "coach" : "player";
    if (requestedRole === "coach" && session.role !== "admin") {
      return authJson({ ok: false, error: "Only an administrator can invite coaches." }, { status: 403 });
    }

    const emailErr = validateEmail(email);
    if (emailErr) return authJson({ ok: false, error: emailErr }, { status: 422 });
    if (!displayName) return authJson({ ok: false, error: "Display name required." }, { status: 422 });

    const existing = await findUserByEmail(env.DB, email);
    if (existing) {
      return authJson({ ok: false, error: "An account with this email already exists." }, { status: 409 });
    }

    let userId;
    try {
      userId = await createD1User(env.DB, {
        email,
        displayName,
        firstName,
        lastName,
        role: requestedRole,
        teamId: session.teamId,
      });
    } catch (err) {
      console.error("[players] create error:", err);
      return authJson({ ok: false, error: "Failed to create account." }, { status: 500 });
    }

    if (requestedRole === "coach") {
      const now = Math.floor(Date.now() / 1000);
      await env.DB
        .prepare(`INSERT INTO staff_access (user_id, team_id, permissions_json, updated_by, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            team_id = excluded.team_id,
            permissions_json = excluded.permissions_json,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at`)
        .bind(userId, session.teamId, JSON.stringify(DEFAULT_MANAGED_COACH_PERMISSIONS), session.d1UserId || null, now)
        .run();
    }

    const rawToken = await createVerificationToken(env.DB, userId, "invitation", 172_800);
    const origin = new URL(request.url).origin;
    const inviteUrl = `${origin}/auth/accept-invite?token=${encodeURIComponent(rawToken)}`;

    const emailResult = await sendEmail(env, {
      to: email,
      subject: requestedRole === "coach" ? "You're invited to the BCOffense coaching staff 🏈" : "You're invited to BCOffense 🏈",
      html: inviteEmailHtml(displayName, inviteUrl),
      text: inviteEmailText(displayName, inviteUrl),
    });

    return withSecurityHeaders(
      authJson({
        ok: true,
        userId,
        role: requestedRole,
        inviteSent: emailResult.ok,
        inviteUrl: emailResult.skipped ? inviteUrl : undefined,
      }),
    );
  }

  return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });
}
