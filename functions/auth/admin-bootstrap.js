/**
 * Transitional named-admin bootstrap.
 *
 * This route is deliberately protected by the normal middleware rather than
 * listed as a public auth route. Only the still-enabled legacy `admin`
 * session may use it, and it can create only the first non-archived D1 admin.
 * Once that account exists, regular named-admin staff management takes over.
 */

import {
  authJson,
  getSessionFromRequest,
  isLegacyStaticPlayerEnabled,
  isLegacyStaticStaffEnabled,
  withSecurityHeaders,
} from "../_lib/auth.js";
import { createVerificationToken, validateEmail } from "../_lib/d1-auth.js";
import { sendEmail, inviteEmailHtml, inviteEmailText } from "../_lib/email.js";
import { RequestBodyError, readBoundedJsonOrFormObject } from "../_lib/request-body.js";

const INVITATION_TTL_SECONDS = 172_800; // 48 hours
const RESEND_COOLDOWN_SECONDS = 10;
const MAX_ADMIN_BOOTSTRAP_BODY_BYTES = 8 * 1024;
// Legacy staff activity can create an audit/notification-only D1 row for the
// shared `admin` login. It is not a named administrator and must never block
// this transition path.
const LEGACY_SYNTHETIC_STAFF_EMAILS = ["admin@bcoffense.internal", "coach@bcoffense.internal"];

function isLegacyAdminSession(session) {
  return session?.role === "admin"
    && session?.username === "admin"
    && !session?.d1UserId;
}

function changed(result) {
  return Number(result?.meta?.changes || 0) === 1;
}

async function listNamedAdmins(db, teamId) {
  const result = await db
    .prepare(`SELECT id, email, display_name, first_name, last_name, status, password_hash, updated_at
      FROM users
      WHERE team_id = ?
        AND role = 'admin'
        AND status != 'archived'
        AND LOWER(email) NOT IN ('admin@bcoffense.internal', 'coach@bcoffense.internal')
      ORDER BY created_at ASC, id ASC`)
    .bind(teamId)
    .all();
  return Array.isArray(result?.results) ? result.results : [];
}

function statusPayload(namedAdmins, env, options = {}) {
  const payload = {
    ok: true,
    bootstrapRequired: namedAdmins.length === 0,
    // This is informational only. The actual retirement control remains the
    // Cloudflare environment variable so it cannot be toggled by an ordinary
    // browser request.
    legacyStaffEnabled: isLegacyStaticStaffEnabled(env),
    legacyPlayerEnabled: isLegacyStaticPlayerEnabled(env),
    namedAdminCount: namedAdmins.length,
  };
  const pending = namedAdmins.length === 1 && namedAdmins[0]?.status === "invited";
  if (options.includePendingInvite) {
    // This route is available only to the authenticated legacy admin, so it
    // can safely identify the pending invite needed to recover a lost/expired
    // setup email without exposing any staff data publicly.
    payload.pendingInvite = pending
      ? { email: namedAdmins[0].email, status: namedAdmins[0].status }
      : null;
  }
  return payload;
}

async function parseBody(request) {
  return readBoundedJsonOrFormObject(request, { maxBytes: MAX_ADMIN_BOOTSTRAP_BODY_BYTES });
}

function textField(body, fieldNames, label) {
  for (const fieldName of fieldNames) {
    const value = body[fieldName];
    // Preserve the current camelCase-first compatibility behavior: an empty
    // primary field falls through to its legacy snake_case alias.
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string") return { error: `${label} must be text.` };
    return { value: value.trim() };
  }
  return { value: "" };
}

function bootstrapBodyError(error) {
  if (error instanceof RequestBodyError && error.status === 413) {
    return authJson({ ok: false, error: "Administrator setup request is too large." }, { status: 413 });
  }
  return authJson({ ok: false, error: "Invalid request body." }, { status: 400 });
}

function cleanName(value, label, maxLength = 120) {
  const name = String(value || "").trim();
  if (name.length > maxLength) return { error: `${label} is too long.` };
  return { value: name };
}

function adminUserPayload(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: "admin",
    status: user.status,
  };
}

async function issueAdminInvitation({ request, env, user, reissued = false }) {
  let rawToken;
  try {
    rawToken = await createVerificationToken(env.DB, user.id, "invitation", INVITATION_TTL_SECONDS);
  } catch (error) {
    console.error("[admin-bootstrap] could not create administrator invitation", error);
    return { response: authJson({ ok: false, error: "Could not create the administrator invitation. Please try again." }, { status: 500 }) };
  }

  const inviteUrl = `${new URL(request.url).origin}/auth/accept-invite?token=${encodeURIComponent(rawToken)}`;
  let emailResult = { ok: false };
  try {
    emailResult = await sendEmail(env, {
      to: user.email,
      subject: "Your BCOffense administrator account is ready 🏈",
      html: inviteEmailHtml(user.display_name, inviteUrl),
      text: inviteEmailText(user.display_name, inviteUrl),
    });
  } catch (error) {
    // The invitation is still valid and is returned only to the authenticated
    // legacy administrator, so a transient mail-provider failure cannot turn
    // the one-time bootstrap into a lockout.
    console.error("[admin-bootstrap] could not send administrator invitation", error);
  }

  return {
    response: withSecurityHeaders(
      authJson({
        ...statusPayload([user], env),
        bootstrapRequired: false,
        reissued,
        emailSent: emailResult.ok === true,
        inviteSent: emailResult.ok === true,
        // A failed or intentionally skipped delivery must not strand the
        // pending first admin. Never include the raw link after successful
        // email delivery.
        inviteUrl: emailResult.ok === true ? undefined : inviteUrl,
        user: adminUserPayload(user),
      }),
    ),
  };
}

async function resendPendingInvitation({ request, env, existing, teamId }) {
  if (existing.status !== "invited" || existing.password_hash) {
    return authJson(
      { ok: false, error: "A named administrator account already exists. Sign in with it or use its recovery process." },
      { status: 409 },
    );
  }

  const now = Math.floor(Date.now() / 1000);
  // Claim a short resend lease before generating a replacement token. That
  // prevents simultaneous static-admin retries from handing out two links
  // that invalidate one another. A crashed request becomes retryable shortly.
  const claim = await env.DB
    .prepare(`UPDATE users SET updated_at = ?
      WHERE id = ? AND team_id = ? AND role = 'admin' AND status = 'invited'
        AND password_hash IS NULL AND updated_at <= ?`)
    .bind(now, existing.id, teamId, now - RESEND_COOLDOWN_SECONDS)
    .run();
  if (!changed(claim)) {
    return authJson(
      { ok: false, error: "The administrator invitation was just sent. Please wait a moment before requesting another." },
      { status: 409 },
    );
  }

  return (await issueAdminInvitation({ request, env, user: existing, reissued: true })).response;
}

async function createFirstNamedAdmin({ request, env, input, teamId }) {
  const user = {
    id: crypto.randomUUID(),
    email: input.email,
    display_name: input.displayName,
    first_name: input.firstName,
    last_name: input.lastName,
    status: "invited",
  };
  const now = Math.floor(Date.now() / 1000);

  try {
    // This conditional INSERT is the authority for "first admin". The prior
    // status read is only for useful responses; concurrent requests cannot
    // create two named admins because D1/SQLite serializes this write.
    const result = await env.DB
      .prepare(`INSERT INTO users
        (id, email, display_name, first_name, last_name, role, team_id, status, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, 'admin', ?, 'invited', ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM users
          WHERE team_id = ?
            AND role = 'admin'
            AND status != 'archived'
            AND LOWER(email) NOT IN ('admin@bcoffense.internal', 'coach@bcoffense.internal')
        )`)
      .bind(
        user.id,
        user.email,
        user.display_name,
        user.first_name,
        user.last_name,
        teamId,
        now,
        now,
        teamId,
      )
      .run();

    if (!changed(result)) return null;
  } catch (error) {
    // The email uniqueness constraint also covers archived accounts. Avoid
    // exposing database details while giving the authenticated admin a clear
    // corrective action.
    console.error("[admin-bootstrap] could not create named administrator", error);
    return { error: authJson({ ok: false, error: "An account with this email already exists." }, { status: 409 }) };
  }

  const invitation = await issueAdminInvitation({ request, env, user });
  if (!invitation.response.ok) {
    // Token creation is the only failure that would otherwise leave a hidden,
    // unusable first-admin row. Remove only the exact just-created unactivated
    // row; a successful email failure deliberately remains recoverable via
    // the returned invitation URL.
    const body = await invitation.response.clone().json().catch(() => ({}));
    if (invitation.response.status >= 500) {
      try {
        await env.DB
          .prepare("DELETE FROM users WHERE id = ? AND role = 'admin' AND status = 'invited' AND password_hash IS NULL")
          .bind(user.id)
          .run();
      } catch (error) {
        console.error("[admin-bootstrap] could not clean up failed administrator bootstrap", error);
      }
    }
    return { error: authJson(body, { status: invitation.response.status || 500 }) };
  }

  return { response: invitation.response };
}

export async function onRequest(context) {
  const { request, env } = context;
  const session = await getSessionFromRequest(request, env);
  if (!isLegacyAdminSession(session)) {
    return authJson(
      { ok: false, error: "Only the currently enabled legacy administrator can bootstrap the first named administrator." },
      { status: 403 },
    );
  }
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  const teamId = String(session.teamId || "").trim();
  if (!teamId) {
    return authJson({ ok: false, error: "Team access is not configured for the legacy administrator." }, { status: 503 });
  }

  let namedAdmins;
  try {
    namedAdmins = await listNamedAdmins(env.DB, teamId);
  } catch (error) {
    console.error("[admin-bootstrap] could not read named administrator status", error);
    return authJson({ ok: false, error: "Administrator setup is temporarily unavailable." }, { status: 503 });
  }

  if (request.method === "GET") {
    return withSecurityHeaders(authJson(statusPayload(namedAdmins, env, { includePendingInvite: true })));
  }
  if (request.method !== "POST") return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });

  let body;
  try {
    body = await parseBody(request);
  } catch (error) {
    return bootstrapBodyError(error);
  }

  const emailField = textField(body, ["email"], "Email");
  const displayField = textField(body, ["displayName", "display_name"], "Display name");
  const firstField = textField(body, ["firstName", "first_name"], "First name");
  const lastField = textField(body, ["lastName", "last_name"], "Last name");
  const invalidField = [emailField, displayField, firstField, lastField].find((field) => field.error);
  if (invalidField?.error) return authJson({ ok: false, error: invalidField.error }, { status: 422 });

  const email = emailField.value.toLowerCase();
  const display = cleanName(displayField.value, "Display name");
  const first = cleanName(firstField.value, "First name", 80);
  const last = cleanName(lastField.value, "Last name", 80);
  const emailError = validateEmail(email);
  if (emailError) return authJson({ ok: false, error: emailError }, { status: 422 });
  if (LEGACY_SYNTHETIC_STAFF_EMAILS.includes(email)) {
    return authJson({ ok: false, error: "Choose the administrator's real email address." }, { status: 422 });
  }

  // There can be only one operational named admin during this transition. A
  // matching invited account can safely receive a replacement one-time link;
  // an active/different account intentionally prevents another admin from
  // being provisioned through the shared legacy credential.
  if (namedAdmins.length > 0) {
    const existing = namedAdmins.length === 1 ? namedAdmins[0] : null;
    if (existing && String(existing.email || "").toLowerCase() === email) {
      return resendPendingInvitation({ request, env, existing, teamId });
    }
    return authJson(
      { ok: false, error: "A named administrator has already been created. Use that account to manage staff." },
      { status: 409 },
    );
  }

  if (display.error || first.error || last.error) {
    return authJson({ ok: false, error: display.error || first.error || last.error }, { status: 422 });
  }
  if (!display.value) return authJson({ ok: false, error: "Display name required." }, { status: 422 });

  const result = await createFirstNamedAdmin({
    request,
    env,
    teamId,
    input: {
      email,
      displayName: display.value,
      firstName: first.value,
      lastName: last.value,
    },
  });
  if (result?.response) return result.response;
  if (result?.error) return result.error;

  // A simultaneous request won the conditional INSERT. Re-read after the
  // atomic write so the response cannot claim setup is still available.
  let current;
  try {
    current = await listNamedAdmins(env.DB, teamId);
  } catch (_) {
    return authJson({ ok: false, error: "Administrator setup is temporarily unavailable." }, { status: 503 });
  }
  const existing = current.length === 1 ? current[0] : null;
  if (existing && String(existing.email || "").toLowerCase() === email) {
    return resendPendingInvitation({ request, env, existing, teamId });
  }
  return authJson(
    { ok: false, error: "A named administrator has already been created. Use that account to manage staff." },
    { status: 409 },
  );
}
