/**
 * POST /api/account/password — change the current player's password.
 *
 * Body (JSON): { currentPassword, newPassword }
 * Requires: active D1 player session
 */

import { getSessionFromRequest, authJson, withSecurityHeaders, createSessionCookie } from "../../_lib/auth.js";
import { changeD1Password } from "../../_lib/d1-auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) {
    return withSecurityHeaders(authJson({ ok: false, error: "Authentication required." }, { status: 401 }));
  }
  if (!session.d1UserId) {
    return withSecurityHeaders(authJson({ ok: false, error: "Password change is only available for player accounts." }, { status: 403 }));
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return withSecurityHeaders(authJson({ ok: false, error: "Invalid request body." }, { status: 400 }));
  }

  const currentPassword = String(body.currentPassword || "").trim();
  const newPassword = String(body.newPassword || "").trim();

  if (!currentPassword || !newPassword) {
    return withSecurityHeaders(authJson({ ok: false, error: "Both current and new passwords are required." }, { status: 400 }));
  }
  if (currentPassword === newPassword) {
    return withSecurityHeaders(authJson({ ok: false, error: "New password must be different from current password." }, { status: 400 }));
  }

  if (!env.DB) {
    return withSecurityHeaders(authJson({ ok: false, error: "Database unavailable." }, { status: 503 }));
  }

  const err = await changeD1Password(env.DB, session.d1UserId, currentPassword, newPassword);
  if (err) {
    return withSecurityHeaders(authJson({ ok: false, error: err }, { status: 400 }));
  }

  // changeD1Password bumps sessions_invalid_before, which would also reject THIS
  // request's cookie on the next call. Re-issue a fresh cookie (iat >= the
  // invalidation timestamp) so the user who just changed their own password
  // stays signed in while all other sessions are evicted.
  const cookie = await createSessionCookie(
    {
      username: session.username,
      role: session.role,
      label: session.label,
      d1: true,
      d1_user_id: session.d1UserId,
    },
    env,
  );

  return withSecurityHeaders(
    authJson(
      { ok: true, message: "Password updated successfully." },
      { headers: { "Set-Cookie": cookie } },
    ),
  );
}
